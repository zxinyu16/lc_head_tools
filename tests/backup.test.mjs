import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadModule(relativePath, sandbox) {
  const filename = new URL(relativePath, import.meta.url);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename: filename.pathname });
  return sandbox.module.exports;
}
function createStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  const wx = { getStorageSync: key => data.get(key), setStorageSync: (key, value) => data.set(key, structuredClone(value)) };
  const domain = loadModule('../miniprogram/lib/domain.js', { module: { exports: {} }, Date, Math });
  const store = loadModule('../miniprogram/lib/store.js', { module: { exports: {} }, wx, Date, console, require: p => { assert.equal(p, './domain'); return domain; } });
  return { store, data };
}

test('备份导出与恢复完整保留业务、模板和生成记录', () => {
  const { store } = createStore();
  const business = store.create();
  business.fields.seller = '出口公司';
  store.update(business);
  store.saveTemplate({ id: 'tpl-1', name: '常用', version: 1, createdAt: '2026-09-26T00:00:00.000Z', clauses: [] });
  store.recordGeneration({ id: 'gen-1', generatedAt: '2026-09-26T01:00:00.000Z', businessId: business.id, businessRevision: business.revision, template: { id: 'builtin-header', version: 1 }, documents: [] }, '/local/header-gen-1.docx');
  const backup = store.exportData();
  assert.equal(backup.kind, 'lc-studio-backup');
  const restored = createStore();
  const summary = restored.store.importData(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), { businesses: 1, templates: 1, generations: 1 });
  assert.equal(restored.store.active().fields.seller, '出口公司');
  assert.equal(restored.store.read().generations[0].path, '/local/header-gen-1.docx');
});

test('恢复拒绝非本工具备份、结构不完整和重复业务编号', () => {
  const { store } = createStore();
  assert.throws(() => store.importData({ hello: 'world' }), /不是本工具生成的备份文件/);
  assert.throws(() => store.importData({ kind: 'lc-studio-backup', schema: 1, businesses: [{}], templates: [], generations: [] }), /不完整或版本不兼容/);
  const business = { id: 'same', name: 'a', fields: {}, clauses: [] };
  assert.throws(() => store.importData({ kind: 'lc-studio-backup', schema: 1, businesses: [business, { ...business }], templates: [], generations: [] }), /重复业务编号/);
});

test('恢复时失效的当前业务指针回退到首笔业务', () => {
  const { store } = createStore();
  const summary = store.importData({ kind: 'lc-studio-backup', schema: 1, activeId: 'missing', businesses: [{ id: 'b-1', name: '业务', fields: {}, clauses: [] }], templates: [], generations: [] });
  assert.equal(summary.businesses, 1);
  assert.equal(store.read().activeId, 'b-1');
});

test('读取到不兼容数据时保留原始备份并给出明确错误', () => {
  const { store, data } = createStore({ 'lc-studio-local-v1': { schema: 99, note: '旧版本残留' } });
  assert.throws(() => store.read(), /不兼容/);
  const kept = data.get('lc-studio-local-v1-corrupt-backup');
  assert.equal(kept.data.note, '旧版本残留');
  assert.ok(kept.keptAt);
});
