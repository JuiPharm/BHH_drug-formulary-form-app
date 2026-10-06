import test from 'node:test';
import assert from 'node:assert/strict';
import { templateKeyForDocument, findInlineTemplate, findInlineResources } from '../js/document-template-rules.js';

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


test('returns PI template and example resources when both are active', () => {
  const templates = [
    { templateKey: 'PI_TEMPLATE', displayName: 'PI Template' },
    { templateKey: 'PI_EXAMPLE', displayName: 'PI Example' }
  ];
  const resources = findInlineResources('PATIENT_INFORMATION_LEAFLET', templates);
  assert.equal(resources.length, 2);
  assert.equal(resources[0].actionLabel, 'ดาวน์โหลด Template');
  assert.equal(resources[1].actionLabel, 'ดาวน์โหลดตัวอย่าง PI');
});

test('returns presentation example without requiring a presentation template', () => {
  const templates = [
    { templateKey: 'PRESENTATION_EXAMPLE', displayName: 'Slide Example' }
  ];
  const resources = findInlineResources('PRESENTATION', templates);
  assert.equal(resources.length, 1);
  assert.equal(resources[0].templateKey, 'PRESENTATION_EXAMPLE');
  assert.equal(resources[0].actionLabel, 'ดาวน์โหลดตัวอย่าง Slide');
});
