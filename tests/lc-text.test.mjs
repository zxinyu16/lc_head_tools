import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const sandbox={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(new URL('../miniprogram/lib/lc-text.js',import.meta.url),'utf8'),sandbox);
const parser=sandbox.module.exports;

test('提取 SWIFT 场次与明确编号，其他要求保留原文', () => {
  const result=parser.parse(':20:LC-2026-1\n:50:APPLICANT LTD\nADDRESS LINE\n:59:BENEFICIARY LTD\n:46A:PROFORMA INVOICE NO. PI-123\nINSURANCE POLICY NO. POL-456\nSIGNED COMMERCIAL INVOICE\n:47A:ALL DOCS IN ENGLISH');
  assert.deepEqual(JSON.parse(JSON.stringify(result.fields.map(x=>x.key))),['lcNumber','buyer','seller']);
  assert.equal(result.fields[1].value,'APPLICANT LTD\nADDRESS LINE');
  assert.deepEqual(JSON.parse(JSON.stringify(result.clauses.map(x=>[x.name,x.value,x.source]))),[['PI编号','PI-123','46A'],['保单编号','POL-456','46A']]);
  assert.equal(result.clauses[0].selected,false);
  assert.equal(result.clauses[0].scope.length,0);
  assert.equal(result.unresolved.length,2);
});

test('不猜测未标明编号的 46/47 场要求', () => {
  const result=parser.parse(':46A:PROFORMA INVOICE REQUIRED\nINSURANCE POLICY MUST BE SIGNED');
  assert.equal(result.clauses.length,0);
  assert.equal(result.unresolved.length,2);
});

test('识别样本常见的“场次说明下一行才是值”及操作要求', () => {
  const text='20: Documentary Credit Number\nLC-123\n50: Applicant\nBUYER LTD\n59: Beneficiary - Name & Address\nSELLER LTD\n46A: Documents Required\n1. ONE COPY OF BENEFICIARY\'S INVOICE DULY SIGNED.\n47A: Additional Conditions\n+ ALL DOCUMENTS MUST BE ISSUED IN ENGLISH LANGUAGE.';
  const result=parser.parse(text);
  assert.equal(result.fields[0].value,'LC-123');
  assert.equal(result.fields[1].value,'BUYER LTD');
  assert.equal(result.fields[2].value,'SELLER LTD');
  assert.equal(result.clauses.length,2);
  assert.equal(result.clauses[0].type,'operation');
  assert.equal(result.clauses[0].scope[0],'invoice');
  assert.equal(result.clauses[1].scope.length,2);
  assert.equal(result.clauses[1].selected,false);
});
