const INLINE_TEMPLATE_KEY_BY_DOCUMENT = Object.freeze({
  PATIENT_INFORMATION_LEAFLET: 'PI_TEMPLATE',
  PRESENTATION: 'PRESENTATION_TEMPLATE'
});

export function templateKeyForDocument(documentCode) {
  return INLINE_TEMPLATE_KEY_BY_DOCUMENT[String(documentCode || '')] || '';
}

export function findInlineTemplate(documentCode, templates = []) {
  const templateKey = templateKeyForDocument(documentCode);
  if (!templateKey || !Array.isArray(templates)) return null;
  return templates.find(template => template?.templateKey === templateKey) || null;
}
