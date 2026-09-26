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
test('Word 包内各文件 CRC 与目录一致且 document.xml 结构完整',()=>{
 const docx=loadModule('../miniprogram/lib/docx.js');
 const data=Buffer.from(docx.generate({documentType:'packingList',fields:{seller:'出口公司\n地址第一行',buyer:'BUYER',invoiceNumber:'',invoiceDate:'2026-09-26',lcNumber:'LC-9'},printedClauses:[{name:'PI',value:'PI-1'}],checklist:[{name:'签字',value:'发票需签字'}]}));
 const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c;}
 const crc32=bytes=>{let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
 const entries=[];let offset=0;
 while(data.readUInt32LE(offset)===0x04034b50){
  const crc=data.readUInt32LE(offset+14),size=data.readUInt32LE(offset+18),nameLen=data.readUInt16LE(offset+26),extraLen=data.readUInt16LE(offset+28);
  const name=data.subarray(offset+30,offset+30+nameLen).toString();
  const body=data.subarray(offset+30+nameLen+extraLen,offset+30+nameLen+extraLen+size);
  entries.push({name,crc,body});offset+=30+nameLen+extraLen+size;
 }
 assert.deepEqual(entries.map(e=>e.name),['[Content_Types].xml','_rels/.rels','word/document.xml']);
 for(const e of entries)assert.equal(crc32(e.body),e.crc,e.name);
 const documentXml=entries[2].body.toString();
 assert.ok(documentXml.startsWith('<?xml'));
 assert.ok(documentXml.trimEnd().endsWith('</w:document>'));
 assert.ok(documentXml.includes('PACKING LIST'));
 assert.ok(documentXml.includes('<w:br/>'));
});
