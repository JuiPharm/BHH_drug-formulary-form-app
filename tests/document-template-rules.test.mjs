import test from 'node:test';
import assert from 'node:assert/strict';
import { templateKeyForDocument, findInlineTemplate } from '../js/document-template-rules.js';

test('maps Patient Information Leaflet to PI_TEMPLATE', () => {
  assert.equal(templateKeyForDocument('PATIENT_INFORMATION_LEAFLET'), 'PI_TEMPLATE');
});

test('maps presentation document to PRESENTATION_TEMPLATE', () => {
  assert.equal(templateKeyForDocument('PRESENTATION'), 'PRESENTATION_TEMPLATE');
});

test('returns empty key for documents without inline template', () => {
  assert.equal(templateKeyForDocument('QUOTATION'), '');
});

test('finds active template returned by backend for a mapped document', () => {
  const templates = [
    { templateKey: 'PI_TEMPLATE', displayName: 'PI Template' },
    { templateKey: 'PRESENTATION_TEMPLATE', displayName: 'PTC Slides' }
  ];
  assert.deepEqual(
    findInlineTemplate('PATIENT_INFORMATION_LEAFLET', templates),
    templates[0]
  );
});

test('returns null when mapped template is not in backend response', () => {
  assert.equal(findInlineTemplate('PRESENTATION', [{ templateKey: 'PI_TEMPLATE' }]), null);
});
