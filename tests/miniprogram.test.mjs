import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadModule(relativePath, overrides = {}) {
  const filename = new URL(relativePath, import.meta.url);
  const sandbox = {module:{exports:{}},require:overrides.require || (()=>{throw Error('Unexpected import')}),Uint8Array,Uint32Array,DataView,Date,Math,console,...overrides};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox,{filename:filename.pathname});
  return sandbox.module.exports;
}
const domain = loadModule('../miniprogram/lib/domain.js');
test('小程序共用领域规则：不同单据适用范围',()=>{
 const b=domain.createBusiness('测试');
 b.fields={seller:'S',buyer:'B',invoiceNumber:'INV',invoiceDate:'2026-09-26',lcNumber:''};
 b.confirmedFields=['seller','buyer','invoiceNumber','invoiceDate'];
 b.clauses.push(domain.createClause({name:'保单编号',scope:['invoice'],value:'',confirmed:true}));
 assert.equal(domain.validateBusiness(b,['packingList']).length,0);
 assert.equal(domain.validateBusiness(b,['invoice']).some(x=>x.code==='MISSING_CLAUSE_VALUE'),true);
});
test('小程序本地保存独立保存多笔业务及模板',()=>{
 let raw;
 const wx={getStorageSync:()=>raw,setStorageSync:(_,value)=>{raw=structuredClone(value)}};
 const store=loadModule('../miniprogram/lib/store.js',{wx,require:p=>{assert.equal(p,'./domain');return domain}});
 const a=store.create(),b=store.create();
 assert.equal(store.read().businesses.length,2);
 assert.notEqual(a.id,b.id);
 store.select(a.id);assert.equal(store.active().id,a.id);
 const template=domain.createTemplate(a,'常用');store.saveTemplate(template);
 assert.equal(store.read().templates[0].name,'常用');
 assert.throws(()=>store.saveTemplate(template),/同名/);
});
test('生成的 Word 包含三项标准结构且转义特殊字符',()=>{
 const docx=loadModule('../miniprogram/lib/docx.js');
 const data=Buffer.from(docx.generate({documentType:'invoice',fields:{seller:'A & <B>',buyer:'客户',invoiceNumber:'I-1',invoiceDate:'2026-09-26',lcNumber:''},printedClauses:[{name:'PI',value:'001'}]}));
 assert.equal(data.readUInt32LE(0),0x04034b50);
 assert.equal(data.readUInt32LE(data.length-22),0x06054b50);
 assert.ok(data.includes(Buffer.from('A &amp; &lt;B&gt;')));
 assert.ok(data.includes(Buffer.from('001')));
});
