// Conservative extraction from pasted SWIFT-style LC text; no OCR or inferred values.
const clean = value => String(value || '').replace(/\r/g, '').trim();
function sections(text) {
  const result = [], lines = clean(text).split('\n');
  let current = null;
  for (const line of lines) {
    const match = line.match(/^\s*:?([0-9]{2}[A-Z]?)\s*:\s*(.*)$/i);
    if (match) {
      current = { tag: match[1].toUpperCase(), lines: [match[2]] };
      result.push(current);
    } else if (current) current.lines.push(line);
  }
  return result.map(s => ({ tag: s.tag, raw: clean(s.lines.join('\n')) }));
}
function parse(text) {
  const parts = sections(text), fields = [], clauses = [], unresolved = [];
  const fieldTags = { '20': ['lcNumber', '信用证号'], '50': ['buyer', '申请人（买方候选）'], '50A': ['buyer', '申请人（买方候选）'], '59': ['seller', '受益人（卖方候选）'], '59A': ['seller', '受益人（卖方候选）'] };
  for (const part of parts) {
    const field = fieldTags[part.tag];
    if (field && part.raw) {
      const lines=part.raw.split('\n');
      if ((part.tag==='20'&&/documentary credit number/i.test(lines[0])) ||
          (/^50/.test(part.tag)&&/^applicant$/i.test(lines[0])) ||
          (/^59/.test(part.tag)&&/^beneficiary(?:\s*-\s*name\b.*)?$/i.test(lines[0]))) lines.shift();
      const value=clean(lines.join('\n'));
      if (value) fields.push({ key: field[0], label: field[1], value, source: part.tag, selected: false });
    }
    if (!/^4[67][A-Z]?$/.test(part.tag)) continue;
    for (const line of part.raw.split('\n').map(clean).filter(Boolean)) {
      const kind = /(?:PROFORMA\s+INVOICE|\bP\.?I\.?\b|形式发票|PI编号)/i.test(line) ? 'PI编号' :
        /(?:INSURANCE\s+(?:POLICY|CERTIFICATE)|保单|保险单)/i.test(line) ? '保单编号' : '';
      const number = line.match(/(?:NO\.?|NUMBER|编号|#)\s*[:：.-]?\s*([A-Z0-9][A-Z0-9/_-]{2,})/i);
      if (kind && number) clauses.push({ name: kind, value: number[1], source: part.tag, raw: line, selected: false, scope: [], type: 'number' });
      else if (/\binvoice\b.*\bsign(?:ed|ature)?\b/i.test(line)) clauses.push({name:'发票签字要求',value:line,source:part.tag,raw:line,selected:false,scope:['invoice'],type:'operation'});
      else if (/\ball documents\b.*\benglish\b/i.test(line)) clauses.push({name:'单据语言要求',value:line,source:part.tag,raw:line,selected:false,scope:['invoice','packingList'],type:'operation'});
      else unresolved.push({ source: part.tag, raw: line });
    }
  }
  return { fields, clauses, unresolved, sectionCount: parts.length };
}
module.exports = { parse, sections };
