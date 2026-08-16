import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');

test('app imports inline template lookup helper', () => {
  assert.match(appSource, /import \{ findInlineTemplate \} from '\.\/document-template-rules\.js';/);
});

test('app state stores public templates returned by backend', () => {
  assert.match(appSource, /publicTemplates:\s*\[\]/);
  assert.match(appSource, /state\.publicTemplates\s*=\s*Array\.isArray\(templates\)\s*\?\s*templates\s*:\s*\[\];/);
});

test('document renderer resolves template per document and renders inline download button', () => {
  assert.match(appSource, /findInlineTemplate\(definition\.code, state\.publicTemplates\)/);
  assert.match(appSource, /data-inline-template-key=/);
  assert.match(appSource, /ดาวน์โหลด Template/);
});

test('public template load rerenders document cards so inline buttons appear', () => {
  const functionStart = appSource.indexOf('async function loadPublicTemplates()');
  const functionEnd = appSource.indexOf('async function downloadPublicTemplate', functionStart);
  const functionSource = appSource.slice(functionStart, functionEnd);
  assert.match(functionSource, /renderDocuments\(\)/);
});

test('styles include responsive upload action row and inline template button', () => {
  assert.match(styleSource, /\.document-upload-actions\s*\{/);
  assert.match(styleSource, /\.inline-template-button\s*\{/);
});
