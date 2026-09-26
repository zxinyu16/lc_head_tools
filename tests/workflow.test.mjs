import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

function createEnv() {
  const env = {
    saved: undefined, written: [], readFiles: new Map(), opened: [], navigated: [],
    shared: [], modals: [], toasts: [], chosenFile: null, failNextWrite: false,
  };
  const wx = {
    env: { USER_DATA_PATH: '/local' },
    getStorageSync: () => env.saved,
    setStorageSync: (_key, value) => {
      if (env.failNextWrite) { env.failNextWrite = false; throw new Error('setStorageSync:fail'); }
      env.saved = structuredClone(value);
    },
    switchTab: ({ url }) => env.navigated.push(url),
    navigateTo: ({ url }) => env.navigated.push(url),
    showToast: ({ title }) => env.toasts.push(title),
    showModal: options => { env.modals.push(options); options.success?.({ confirm: true, content: '常用信用证模板' }); },
    shareFileMessage: ({ filePath }) => env.shared.push(filePath),
    chooseMessageFile: ({ success }) => success({ tempFiles: [env.chosenFile] }),
    previewImage: () => {},
    openDocument: ({ filePath, success }) => { env.opened.push(filePath); success?.(); },
    getFileSystemManager: () => ({
      writeFile: ({ filePath, data, success }) => { env.written.push({ filePath, data }); success(); },
      readFile: ({ filePath, success }) => success({ data: env.readFiles.get(filePath) }),
      saveFile: ({ tempFilePath, success }) => success({ savedFilePath: '/local/saved-' + env.written.length + '-' + tempFilePath.split('/').pop() }),
    }),
  };
  let currentPage;
  function load(path, requires = {}) {
    const context = { module: { exports: {} }, wx, Page: definition => { currentPage = definition; },
      require: name => requires[name], Uint8Array, Uint32Array, DataView, Date, Math, console };
    vm.runInNewContext(read(path), context, { filename: path });
    return context.module.exports;
  }
  const domain = load('../miniprogram/lib/domain.js');
  const store = load('../miniprogram/lib/store.js', { './domain': domain });
  const ui = load('../miniprogram/lib/ui.js');
  const docx = load('../miniprogram/lib/docx.js');
  const lcText = load('../miniprogram/lib/lc-text.js');
  function page(path, requires) {
    load(path, requires);
    return Object.assign({ data: structuredClone(currentPage.data), setData(next) { Object.assign(this.data, next); }, getTabBar: () => null }, currentPage);
  }
  const pages = {
    home: () => page('../miniprogram/pages/home/index.js', { '../../lib/store': store, '../../lib/domain': domain, '../../lib/ui': ui }),
    editor: () => page('../miniprogram/pages/editor/index.js', { '../../lib/store': store, '../../lib/domain': domain, '../../lib/ui': ui, '../../lib/lc-text': lcText }),
    preview: () => page('../miniprogram/pages/preview/index.js', { '../../lib/store': store, '../../lib/domain': domain, '../../lib/ui': ui, '../../lib/docx': docx }),
    templates: () => page('../miniprogram/pages/templates/index.js', { '../../lib/store': store, '../../lib/domain': domain, '../../lib/ui': ui }),
  };
  return { env, wx, store, domain, ui, pages };
}

function fillAndConfirm(editor, values) {
  for (const [key, value] of Object.entries(values)) {
    editor.fieldInput({ currentTarget: { dataset: { key } }, detail: { value } });
    editor.confirmField({ currentTarget: { dataset: { key } }, detail: { value: true } });
  }
}
const VALID_FIELDS = { seller: '出口商', buyer: '进口商', invoiceNumber: 'INV-001', invoiceDate: '2026-09-26', lcNumber: 'LC-001' };

test('小程序页面完成本地制单、模板保存及 Word 历史打开', () => {
  const { env, store, pages } = createEnv();
  const home = pages.home();
  home.create();
  assert.match(env.navigated.at(-1), /editor/);
  const editor = pages.editor();
  editor.onLoad({}); editor.onShow();
  fillAndConfirm(editor, VALID_FIELDS);
  editor.lcInput({ detail: { value: ':20:LC-002\n:50:另一家申请人\n:46A:PROFORMA INVOICE NO. PI-009' } });
  editor.parseLc();
  assert.equal(editor.data.lcCandidates.clauses.length, 1);
  editor.selectLcField({ currentTarget: { dataset: { index: 1 } }, detail: { value: true } });
  editor.acceptLc();
  assert.equal(store.active().fields.buyer, '进口商');
  assert.equal(editor.data.lcCandidates.fields[1].selected, true);
  editor.selectLcField({ currentTarget: { dataset: { index: 1 } }, detail: { value: false } });
  editor.selectLcClause({ currentTarget: { dataset: { index: 0 } }, detail: { value: true } });
  editor.scopeLcClause({ currentTarget: { dataset: { index: 0 } }, detail: { value: '0' } });
  editor.acceptLc();
  assert.equal(store.active().clauses[0].source.field, '46A');
  editor.removeClause({ currentTarget: { dataset: { id: store.active().clauses[0].id } } });
  editor.keywords({ detail: { value: 'PI编号：PI-001\n保单编号：POL-002' } });
  editor.parseKeywords();
  assert.equal(editor.data.pendingKeywords.length, 2);
  editor.acceptKeywords();
  for (const clause of [...editor.data.business.clauses]) {
    editor.clauseScope({ currentTarget: { dataset: { id: clause.id } }, detail: { value: '2' } });
    editor.confirmClause({ currentTarget: { dataset: { id: clause.id } }, detail: { value: true } });
  }
  editor.saveAsTemplate();
  assert.equal(store.read().templates.length, 1);
  assert.equal(store.read().templates[0].clauses[0].value, '');
  editor.preview();
  assert.equal(env.navigated.at(-1), '/pages/preview/index');
  const preview = pages.preview();
  preview.onShow();
  assert.equal(preview.data.issues.length, 0);
  assert.equal(preview.data.document.printedClauses.length, 2);
  preview.generate();
  const written = env.written.at(-1);
  assert.ok(written.data.byteLength > 100);
  assert.equal(env.opened.length, 1);
  assert.equal(store.read().generations.length, 1);
  assert.equal(preview.data.history.length, 1);
  assert.equal(preview.data.history[0].stale, false);
  preview.openHistory({ currentTarget: { dataset: { path: written.filePath } } });
  assert.equal(env.opened.length, 2);
});

test('重复、超限或类型不符的文件不会重复进入业务', () => {
  const { env, store, pages } = createEnv();
  pages.home().create();
  const editor = pages.editor();
  editor.onLoad({}); editor.onShow();
  editor.saveFile({ path: '/tmp/lc.pdf', size: 1000, name: '信用证.pdf' });
  editor.saveFile({ path: '/tmp/lc.pdf', size: 1000, name: '信用证.pdf' });
  assert.equal(store.active().sourceFiles.length, 1);
  assert.match(env.toasts.at(-1), /重复导入/);
  editor.saveFile({ path: '/tmp/big.pdf', size: 21 * 1024 * 1024, name: '大文件.pdf' });
  editor.saveFile({ path: '/tmp/note.docx', size: 100, name: '说明.docx' });
  assert.equal(store.active().sourceFiles.length, 1);
  assert.match(env.toasts.at(-1), /20 MB 内的 PDF 或图片/);
});

test('本地保存失败时页面保留当前输入并提示失败', () => {
  const { env, store, pages } = createEnv();
  pages.home().create();
  const editor = pages.editor();
  editor.onLoad({}); editor.onShow();
  env.failNextWrite = true;
  editor.fieldInput({ currentTarget: { dataset: { key: 'seller' } }, detail: { value: '新的出口商' } });
  assert.equal(editor.data.saved, '保存失败，内容仍保留在此页');
  assert.equal(editor.data.business.fields.seller, '新的出口商');
  assert.equal(store.active().fields.seller, '');
  assert.ok(editor.data.error);
});

test('生成后修改业务，历史记录标记为旧版本数据', () => {
  const { store, pages } = createEnv();
  pages.home().create();
  const editor = pages.editor();
  editor.onLoad({}); editor.onShow();
  fillAndConfirm(editor, VALID_FIELDS);
  const preview = pages.preview();
  preview.onShow();
  preview.generate();
  assert.equal(store.read().generations.length, 1);
  editor.onShow();
  editor.fieldInput({ currentTarget: { dataset: { key: 'invoiceNumber' } }, detail: { value: 'INV-002' } });
  preview.refresh();
  assert.equal(preview.data.history.length, 1);
  assert.equal(preview.data.history[0].stale, true);
});

test('模板字段冲突时不覆盖业务并弹出核对提示', () => {
  const { env, store, domain, pages } = createEnv();
  const business = store.create();
  business.clauses.push(domain.createClause({ name: 'PI', value: 'PI-1', scope: ['invoice'], confirmed: true }));
  store.update(business);
  const source = domain.createBusiness('来源业务');
  source.clauses.push(domain.createClause({ name: 'PI', scope: ['packingList'] }));
  const template = domain.createTemplate(source, '冲突模板');
  store.saveTemplate(template);
  pages.templates().apply({ currentTarget: { dataset: { id: template.id } } });
  assert.equal(env.modals.at(-1).title, '模板字段存在差异');
  assert.equal(store.active().clauses.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(store.active().clauses[0].scope)), ['invoice']);
  assert.equal(store.active().clauses[0].value, 'PI-1');
});

test('业务总览备份到文件并可从备份恢复', () => {
  const { env, store, pages } = createEnv();
  const home = pages.home();
  home.create();
  const editor = pages.editor();
  editor.onLoad({}); editor.onShow();
  editor.fieldInput({ currentTarget: { dataset: { key: 'seller' } }, detail: { value: '备份前的出口商' } });
  home.exportBackup();
  assert.equal(env.shared.length, 1);
  assert.match(env.shared[0], /\.json$/);
  const backupJson = JSON.stringify(store.exportData());
  env.chosenFile = { path: '/tmp/lc-backup.json', size: backupJson.length, name: 'lc-backup.json' };
  env.readFiles.set('/tmp/lc-backup.json', backupJson);
  env.saved = undefined;
  home.importBackup();
  assert.equal(store.read().businesses.length, 1);
  assert.equal(store.active().fields.seller, '备份前的出口商');
  assert.match(env.toasts.at(-1), /已恢复 1 笔业务/);
});

test('恢复入口拒绝无效文件并保留现有数据', () => {
  const { env, store, pages } = createEnv();
  const home = pages.home();
  home.create();
  const modalCount = () => env.modals.length;
  env.chosenFile = { path: '/tmp/bad.json', size: 10, name: 'bad.json' };
  env.readFiles.set('/tmp/bad.json', '这不是 JSON');
  home.importBackup();
  assert.equal(env.toasts.at(-1), '备份文件不是有效的 JSON');
  assert.equal(modalCount(), 0);
  env.readFiles.set('/tmp/bad.json', JSON.stringify({ kind: 'other-tool', businesses: [] }));
  home.importBackup();
  assert.equal(modalCount(), 0);
  assert.equal(store.read().businesses.length, 1);
});
