import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');

test('app imports inline resource lookup helper', () => {
  assert.match(appSource, /import \{ findInlineResources \} from '\.\/document-template-rules\.js';/);
});

test('app state stores public templates returned by backend', () => {
  assert.match(appSource, /publicTemplates:\s*\[\]/);
  assert.match(appSource, /state\.publicTemplates\s*=\s*Array\.isArray\(templatesResult\.value\)\s*\?\s*templatesResult\.value\s*:\s*\[\];/);
});

test('document renderer resolves templates and examples per document', () => {
  assert.match(appSource, /findInlineResources\(definition\.code, state\.publicTemplates\)/);
  assert.match(appSource, /data-inline-template-key=/);
  assert.match(appSource, /resource\.actionLabel/);
});

test('public resource load renders document cards after template metadata is ready', () => {
  const functionStart = appSource.indexOf('async function loadInitialPublicData()');
  const functionEnd = appSource.indexOf('async function downloadPublicTemplate', functionStart);
  const functionSource = appSource.slice(functionStart, functionEnd);
  const templateAssignmentIndex = functionSource.indexOf('state.publicTemplates =');
  const renderIndex = functionSource.indexOf('renderDocuments()');
  assert.ok(templateAssignmentIndex >= 0 && renderIndex > templateAssignmentIndex);
});

test('styles include a prominent but theme-aligned resource panel', () => {
  assert.match(styleSource, /\.document-upload-actions\s*\{/);
  assert.match(styleSource, /\.document-resource-panel\s*\{/);
  assert.match(styleSource, /\.inline-resource-button--example\s*\{/);
  assert.match(styleSource, /var\(--primary-soft\)/);
});

test('document renderer distinguishes example downloads from templates', () => {
  assert.match(appSource, /resource\.resourceKind === 'example'/);
  assert.match(appSource, /document-resource-panel/);
  assert.match(appSource, /example-chip/);
});


test('initial public data loads config and templates concurrently and renders documents once', () => {
  const functionStart = appSource.indexOf('async function loadInitialPublicData()');
  const functionEnd = appSource.indexOf('async function downloadPublicTemplate', functionStart);
  const functionSource = appSource.slice(functionStart, functionEnd);
  assert.match(functionSource, /apiRequest\('getPublicConfig'\)/);
  assert.match(functionSource, /apiRequest\('listPublicTemplates'\)/);
  assert.match(functionSource, /Promise\.allSettled/);
  assert.equal((functionSource.match(/renderDocuments\(\)/g) || []).length, 1);
});

test('initialize starts public loading before local UI preparation', () => {
  const functionStart = appSource.indexOf('async function initialize()');
  const functionSource = appSource.slice(functionStart);
  const loadIndex = functionSource.indexOf('const publicDataPromise = loadInitialPublicData()');
  const stepperIndex = functionSource.indexOf('renderStepper()');
  assert.ok(loadIndex >= 0 && stepperIndex >= 0 && loadIndex < stepperIndex);
  assert.match(functionSource, /await publicDataPromise/);
});
