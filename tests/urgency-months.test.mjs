import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const validationSource = await readFile(
  new URL('../backend/apps-script/ValidationService.gs', import.meta.url),
  'utf8'
);
const pdfSource = await readFile(
  new URL('../backend/apps-script/GeneratePdfService.gs', import.meta.url),
  'utf8'
);
const configSource = await readFile(
  new URL('../backend/apps-script/Config.gs', import.meta.url),
  'utf8'
);

test('backend accepts HOURS DAYS and MONTHS for urgent duration', () => {
  assert.match(validationSource, /\['HOURS', 'DAYS', 'MONTHS'\]/);
  assert.match(validationSource, /MONTHS:\s*'เดือน'/);
  assert.match(validationSource, /INVALID_URGENT_UNIT/);
});

test('backend still requires urgency and urgencyDuration', () => {
  assert.match(
    validationSource,
    /'urgency', 'urgencyDuration', 'proposalReason'/
  );
});

test('PDF renders MONTHS as เดือน', () => {
  assert.match(pdfSource, /MONTHS:\s*'เดือน'/);
  assert.match(pdfSource, /PLACEHOLDERS\.UrgencyUnitLabel/);
});

test('backend version is 1.3.6', () => {
  assert.match(configSource, /VERSION:\s*'1\.3\.6'/);
});
