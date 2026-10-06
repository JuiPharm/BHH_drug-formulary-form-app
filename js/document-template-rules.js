const INLINE_RESOURCE_KEYS_BY_DOCUMENT = Object.freeze({
  PATIENT_INFORMATION_LEAFLET: Object.freeze([
    { templateKey: 'PI_TEMPLATE', label: 'ดาวน์โหลด Template' },
    { templateKey: 'PI_EXAMPLE', label: 'ดาวน์โหลดตัวอย่าง PI' }
  ]),
  PRESENTATION: Object.freeze([
    { templateKey: 'PRESENTATION_TEMPLATE', label: 'ดาวน์โหลด Template' },
    { templateKey: 'PRESENTATION_EXAMPLE', label: 'ดาวน์โหลดตัวอย่าง Slide' }
  ])
});

export function templateKeyForDocument(documentCode) {
  const resources = INLINE_RESOURCE_KEYS_BY_DOCUMENT[String(documentCode || '')] || [];
  return resources[0]?.templateKey || '';
}

export function findInlineTemplate(documentCode, templates = []) {
  const templateKey = templateKeyForDocument(documentCode);
  if (!templateKey || !Array.isArray(templates)) return null;
  return templates.find(template => template?.templateKey === templateKey) || null;
}

export function findInlineResources(documentCode, templates = []) {
  if (!Array.isArray(templates)) return [];
  const resources = INLINE_RESOURCE_KEYS_BY_DOCUMENT[String(documentCode || '')] || [];
  return resources
    .map(resource => {
      const template = templates.find(item => item?.templateKey === resource.templateKey);
      return template ? { ...template, actionLabel: resource.label } : null;
    })
    .filter(Boolean);
}
