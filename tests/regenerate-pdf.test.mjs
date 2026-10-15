import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiSource = await readFile(new URL('../backend/apps-script/ApiService.gs', import.meta.url), 'utf8');
const pdfSource = await readFile(new URL('../backend/apps-script/GeneratePdfService.gs', import.meta.url), 'utf8');
const configSource = await readFile(new URL('../backend/apps-script/Config.gs', import.meta.url), 'utf8');
const adminSource = await readFile(new URL('../admin/js/app.js', import.meta.url), 'utf8');
const adminHtml = await readFile(new URL('../admin/index.html', import.meta.url), 'utf8');
const adminConfig = await readFile(new URL('../admin/js/config.js', import.meta.url), 'utf8');

test('backend exposes authenticated regenerateSubmissionPdf action', () => {
  assert.match(apiSource, /case 'regenerateSubmissionPdf'/);
  assert.match(apiSource, /requireAdmin_\(request\)/);
  assert.match(apiSource, /regenerateSubmissionPdf_\(payload, requestId\)/);
});

test('regenerate requires an audit reason and protects signed forms', () => {
  const start = pdfSource.indexOf('function regenerateSubmissionPdf_');
  const end = pdfSource.indexOf('function markPreviousGeneratedPdfVersionsNotCurrent_', start);
  const source = pdfSource.slice(start, end);

  assert.match(source, /requireFields_\(payload, \['submissionId', 'reason'\]/);
  assert.match(source, /REGENERATION_REASON_REQUIRED/);
  assert.match(source, /SIGNED_FORM_REGENERATION_CONFIRMATION_REQUIRED/);
  assert.match(source, /acknowledgeSignedFormImpact/);
  assert.match(source, /STATUS\.APPROVED/);
  assert.match(source, /STATUS\.REJECTED/);
  assert.match(source, /STATUS\.WITHDRAWN/);
  assert.match(source, /STATUS\.CANCELLED/);
});

test('regenerate preserves normal status but requires re-signature for signed forms', () => {
  const start = pdfSource.indexOf('function regenerateSubmissionPdf_');
  const end = pdfSource.indexOf('function markPreviousGeneratedPdfVersionsNotCurrent_', start);
  const source = pdfSource.slice(start, end);

  assert.match(source, /previousStatus === STATUS\.PDF_GENERATION_FAILED/);
  assert.match(source, /if \(signedFormReceived\)/);
  assert.match(source, /supersedeCurrentSignedPhysicianForms_/);
  assert.match(source, /SignedFormReceived:\s*false/);
  assert.match(source, /STATUS\.AWAITING_SIGNATURE/);
  assert.match(source, /result\.previousStatus = previousStatus/);
  assert.match(source, /result\.currentStatus = resultingStatus/);
  assert.match(source, /result\.signedFormSuperseded = signedFormSuperseded/);
});

test('new generated PDF becomes current without deleting history', () => {
  assert.match(pdfSource, /markPreviousGeneratedPdfVersionsNotCurrent_/);
  assert.match(pdfSource, /IsCurrentVersion:\s*true/);
  assert.match(pdfSource, /IsCurrentVersion:\s*false/);
  assert.match(pdfSource, /generationMode/);
  assert.match(pdfSource, /generationReason/);
  assert.match(pdfSource, /sourceStatus/);
  assert.match(pdfSource, /ReviewStatus:\s*'SUPERSEDED'/);
});

test('admin UI requires reason and calls regenerate action', () => {
  assert.match(adminHtml, /id="regenerate-pdf-form"/);
  assert.match(adminHtml, /id="regenerate-pdf-reason"/);
  assert.match(adminHtml, /id="regenerate-pdf-warning"/);
  assert.match(adminSource, /apiRequest\('regenerateSubmissionPdf'/);
  assert.match(adminSource, /acknowledgeSignedFormImpact/);
  assert.match(adminSource, /window\.confirm/);
  assert.match(adminSource, /signedFormSuperseded/);
  assert.match(adminSource, /document-version-chip/);
});

test('versions are bumped for regenerate release', () => {
  assert.match(configSource, /VERSION:\s*'1\.3\.4'/);
  assert.match(adminConfig, /APP_VERSION:\s*'1\.2\.0'/);
});


test('retry PDF is restricted to failed generation status', () => {
  const start = pdfSource.indexOf('function retryGeneratePdf_');
  const end = pdfSource.indexOf('function regenerateSubmissionPdf_', start);
  const source = pdfSource.slice(start, end);
  assert.match(source, /STATUS\.PDF_GENERATION_FAILED/);
  assert.match(source, /PDF_RETRY_NOT_ALLOWED/);
});
