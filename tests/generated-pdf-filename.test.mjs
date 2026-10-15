import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../backend/apps-script/GeneratePdfService.gs', import.meta.url),
  'utf8'
);

function loadFileNameBuilder() {
  const start = source.indexOf('function buildGeneratedPdfFileName_');
  const end = source.indexOf('/**\n * Retry is kept', start);
  assert.ok(start >= 0 && end > start, 'filename helper must exist');
  const functionSource = source.slice(start, end).trim();
  return new Function(`${functionSource}\nreturn buildGeneratedPdfFileName_;`)();
}

test('generated physician PDF uses proposed Brand Name and version', () => {
  const buildName = loadFileNameBuilder();
  assert.equal(
    buildName('Airtal', 'Aceclofenac', 1),
    'Drug_Formulary_Submission_Airtal_v01.pdf'
  );
  assert.equal(
    buildName('Ryaltris', 'Olopatadine + Mometasone', 12),
    'Drug_Formulary_Submission_Ryaltris_v12.pdf'
  );
});

test('generated PDF filename sanitizes unsafe characters and whitespace', () => {
  const buildName = loadFileNameBuilder();
  assert.equal(
    buildName('Drug / Test: 100 mg', 'Fallback', 2),
    'Drug_Formulary_Submission_Drug_Test_100_mg_v02.pdf'
  );
});

test('generated PDF filename falls back to generic name when Brand Name is missing', () => {
  const buildName = loadFileNameBuilder();
  assert.equal(
    buildName('', 'Aceclofenac 100 mg', 3),
    'Drug_Formulary_Submission_Aceclofenac_100_mg_v03.pdf'
  );
});

test('legacy unsigned filename is no longer used', () => {
  assert.doesNotMatch(source, /Drug_Formulary_Submission_Unsigned/);
  assert.match(source, /buildGeneratedPdfFileName_/);
});
