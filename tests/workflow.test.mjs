import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('小程序页面完成本地制单、模板保存及 Word 历史打开', () => {
  let saved;
  let currentPage;
  let written;
  const opened = [];
  const navigated = [];
  const wx = {
    env: { USER_DATA_PATH: '/local' },
    getStorageSync: () => saved,
    setStorageSync: (_key, value) => { saved = structuredClone(value); },
    switchTab: ({ url }) => navigated.push(url),
    navigateTo: ({ url }) => navigated.push(url),
    showToast: () => {},
    showModal: ({ success }) => success({ confirm: true, content: '常用信用证模板' }),
    getFileSystemManager: () => ({ writeFile: ({ filePath, data, success }) => { written = { filePath, data }; success(); } }),
    openDocument: ({ filePath, success }) => { opened.push(filePath); success?.(); },
  };
  const modules = new Map();
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
  const home = page('../miniprogram/pages/home/index.js', { '../../lib/store': store, '../../lib/domain': domain, '../../lib/ui': ui });
  home.create();
  assert.match(navigated.at(-1), /editor/);
  const editor = page('../miniprogram/pages/editor/index.js', { '../../lib/store': store, '../../lib/domain': domain, '../../lib/ui': ui, '../../lib/lc-text': lcText });
  editor.onLoad({}); editor.onShow();
  const field = (key, value) => editor.fieldInput({ currentTarget: { dataset: { key } }, detail: { value } });
  const confirm = key => editor.confirmField({ currentTarget: { dataset: { key } }, detail: { value: true } });
  for (const [key, value] of Object.entries({ seller: '出口商', buyer: '进口商', invoiceNumber: 'INV-001', invoiceDate: '2026-09-26', lcNumber: 'LC-001' })) { field(key, value); confirm(key); }
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
  assert.equal(navigated.at(-1), '/pages/preview/index');
  const preview = page('../miniprogram/pages/preview/index.js', { '../../lib/store': store, '../../lib/domain': domain, '../../lib/ui': ui, '../../lib/docx': docx });
  preview.onShow();
  assert.equal(preview.data.issues.length, 0);
  assert.equal(preview.data.document.printedClauses.length, 2);
  preview.generate();
  assert.ok(written.data.byteLength > 100);
  assert.equal(opened.length, 1);
  assert.equal(store.read().generations.length, 1);
  assert.equal(preview.data.history.length, 1);
  preview.openHistory({ currentTarget: { dataset: { path: written.filePath } } });
  assert.equal(opened.length, 2);
});
