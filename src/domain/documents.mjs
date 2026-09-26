const randomUUID = () => globalThis.crypto.randomUUID();

export const DOCUMENT_TYPES = Object.freeze(['invoice', 'packingList']);
export const CLAUSE_TYPES = Object.freeze(['number', 'text', 'operation']);
const copy = value => structuredClone(value);
const meaningful = value => typeof value === 'string' && value.trim().length > 0;
const timestamp = () => new Date().toISOString();

/** A draft is incomplete by design; only generation enforces required fields. */
export function createBusiness(name = '') {
  return {
    id: randomUUID(), name, revision: 1, updatedAt: timestamp(),
    fields: { lcNumber: '', seller: '', buyer: '', invoiceNumber: '', invoiceDate: '' },
    confirmedFields: [], clauses: [], sourceFiles: [], selectedDocuments: ['invoice'],
  };
}

export function updateField(business, key, value) {
  if (!Object.hasOwn(business.fields, key)) throw new Error(`未知字段：${key}`);
  if (typeof value !== 'string') throw new TypeError('字段值必须为文字');
  if (business.fields[key] === value) return copy(business);
  return {
    ...copy(business), fields: { ...business.fields, [key]: value },
    confirmedFields: business.confirmedFields.filter(field => field !== key),
    revision: business.revision + 1, updatedAt: timestamp(),
  };
}

export function createClause(input = {}) {
  const scope = input.scope ?? ['invoice'];
  const type = input.type ?? 'number';
  if (!CLAUSE_TYPES.includes(type)) throw new Error('未知条款类型');
  if (!Array.isArray(scope) || scope.some(doc => !DOCUMENT_TYPES.includes(doc))) throw new Error('未知适用单据');
  return { id: randomUUID(), name: input.name ?? '', value: input.value ?? '', type,
    scope: [...new Set(scope)], required: input.required ?? true,
    source: input.source ?? { kind: 'manual' }, confirmed: input.confirmed ?? false };
}

export function validateBusiness(business, documents = business.selectedDocuments) {
  const issues = [];
  if (!documents.length || documents.some(doc => !DOCUMENT_TYPES.includes(doc))) {
    return [{ code: 'INVALID_DOCUMENTS', path: 'selectedDocuments', message: '请选择有效的输出单据' }];
  }
  // These requirements describe the header-only first milestone, not a full trade document.
  const required = new Set(['seller', 'buyer']);
  if (documents.includes('invoice')) { required.add('invoiceNumber'); required.add('invoiceDate'); }
  for (const field of required) {
    if (!meaningful(business.fields[field])) issues.push({ code: 'MISSING_FIELD', path: `fields.${field}`, message: `请补充 ${field}` });
    else if (!business.confirmedFields.includes(field)) issues.push({ code: 'UNCONFIRMED_FIELD', path: `fields.${field}`, message: `请核对 ${field}` });
  }
  for (const clause of business.clauses) {
    const path = `clauses.${clause.id}`;
    if (!clause.scope.length) { issues.push({ code: 'UNKNOWN_SCOPE', path, message: '请确认条款适用单据' }); continue; }
    if (!clause.scope.some(doc => documents.includes(doc))) continue;
    if (!meaningful(clause.name)) issues.push({ code: 'MISSING_CLAUSE_NAME', path, message: '请填写条款名称' });
    if (clause.required && !meaningful(clause.value)) issues.push({ code: 'MISSING_CLAUSE_VALUE', path, message: `请补充 ${clause.name || '条款内容'}` });
    if (!clause.confirmed) issues.push({ code: 'UNCONFIRMED_CLAUSE', path, message: `请核对 ${clause.name || '条款'}` });
  }
  return issues;
}

export function projectDocument(business, documentType) {
  if (!DOCUMENT_TYPES.includes(documentType)) throw new Error('未知单据类型');
  const applicable = business.clauses.filter(clause => clause.scope.includes(documentType));
  return copy({ documentType, fields: business.fields,
    printedClauses: applicable.filter(clause => clause.type !== 'operation'),
    checklist: applicable.filter(clause => clause.type === 'operation') });
}

export function createTemplate(business, name) {
  if (!meaningful(name)) throw new Error('请填写模板名称');
  return { id: randomUUID(), name: name.trim(), version: 1, createdAt: timestamp(),
    // No business value is retained by default, including free-text declarations.
    clauses: business.clauses.map(({ id, name, type, scope, required }) => ({
      fieldId: id, name, type, scope: [...scope], required, value: '',
    })) };
}

export function applyTemplate(business, template) {
  const next = copy(business), conflicts = [];
  for (const preset of template.clauses) {
    const matches = next.clauses.filter(clause => clause.id === preset.fieldId || clause.name.trim().toLowerCase() === preset.name.trim().toLowerCase());
    if (matches.length) {
      const same = matches.length === 1 && matches[0].type === preset.type &&
        matches[0].required === preset.required &&
        [...matches[0].scope].sort().join('|') === [...preset.scope].sort().join('|');
      if (!same) conflicts.push({ fieldId: preset.fieldId, name: preset.name, current: copy(matches), proposed: copy(preset) });
      continue;
    }
    next.clauses.push(createClause({ ...preset, value: '', confirmed: false, source: { kind: 'template', templateId: template.id, version: template.version } }));
  }
  // Conflict resolution must be explicit; no partial merge is silently committed.
  if (conflicts.length) return { business: copy(business), conflicts };
  next.template = { id: template.id, version: template.version };
  next.revision += 1; next.updatedAt = timestamp();
  return { business: next, conflicts: [] };
}

export function duplicateBusiness(business) {
  const next = createBusiness(`${business.name}（副本）`);
  next.fields.seller = business.fields.seller;
  next.fields.buyer = business.fields.buyer;
  next.clauses = business.clauses.map(clause => createClause({ ...clause, value: '', confirmed: false, source: { kind: 'copied', businessId: business.id } }));
  return next;
}

export function createGenerationSnapshot(business, template, documents = business.selectedDocuments) {
  const issues = validateBusiness(business, documents);
  if (issues.length) throw new Error(`存在 ${issues.length} 项未完成检查`);
  return copy({ id: randomUUID(), generatedAt: timestamp(), businessId: business.id,
    businessRevision: business.revision, template, documents: documents.map(doc => projectDocument(business, doc)) });
}
