import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

function urlFrom(config) {
  const match = config.match(/API_URL:\\s*['"]([^'"]+)['"]/);
  assert.ok(match, 'API_URL must be a literal value for static GitHub Pages');
  return match[1];
}

test('V1 and V2 Form/Admin share exactly the same original Google Apps Script API', () => {
  const source = urlFrom(read('js/config.js'));
  assert.match(source, /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/);
  assert.equal(urlFrom(read('v2/js/config.js')), source);
  assert.equal(urlFrom(read('admin/js/config.js')), source);
  assert.equal(urlFrom(read('v2/admin/js/config.js')), source);
});

test('V2 uses isolated browser draft, submission and Admin session keys', () => {
  const form = read('v2/js/config.js');
  const admin = read('v2/admin/js/config.js');
  assert.match(form, /drug-formulary-form-draft-v2/);
  assert.match(form, /drug-formulary-current-submission-v2/);
  assert.match(admin, /drug-formulary-admin-session-v2/);
  assert.doesNotMatch(form, /drug-formulary-form-draft-v1/);
  assert.doesNotMatch(admin, /drug-formulary-admin-session-v1/);
});

test('V2 retains the original action protocol, public Sheet metadata and private Drive downloads', () => {
  for (const name of [
    'js/api.js', 'js/app.js', 'js/document-template-rules.js',
    'js/form-schema.js', 'js/physician-rules.js', 'js/utils.js',
    'assets/styles.css', 'admin/js/api.js', 'admin/js/app.js',
    'admin/assets/admin.css'
  ]) {
    assert.ok(existsSync(path.join(root,'v2',name)), name);
    assert.equal(read('v2/'+name), read(name), 'V2 must preserve live API-compatible behavior: '+name);
  }
  const admin = read('v2/admin/js/app.js');
  const form = read('v2/js/app.js');
  assert.match(form, /getPublicConfig/);
  assert.match(form, /submitApplication/);
  assert.match(form, /downloadPublicTemplate/);
  assert.match(admin, /getSubmissionDetail/);
  assert.match(admin, /downloadAdminDocument/);
});

test('V2 URLs resolve their own JS, CSS, and manifests, never V1 assets by absolute URL', () => {
  const form = read('v2/index.html');
  const admin = read('v2/admin/index.html');
  for (const [html,base] of [[form,'v2'],[admin,'v2/admin']]) {
    assert.match(html, /\.\/js\/app\.js/);
    assert.match(html, /\.\/assets\//);
    assert.match(html, /\.\/manifest\.webmanifest/);
    assert.doesNotMatch(html, /<base /);
    for (const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) {
      assert.ok(existsSync(path.join(root,base,match[1])), 'Broken V2 asset: '+match[1]);
    }
  }
  assert.match(form, /V2 — ใช้ข้อมูลจริงชุดเดียวกับ V1/);
  assert.match(admin, /Admin V2 — ใช้ข้อมูลจริง/);
  assert.match(admin, /noindex,nofollow,noarchive/);
});

test('V2 does not embed Google Drive secrets, credentials or sheet data in GitHub Pages', () => {
  const paths = [
    'v2/index.html','v2/admin/index.html','v2/js/config.js',
    'v2/admin/js/config.js','v2/js/api.js','v2/admin/js/api.js'
  ];
  for(const file of paths) {
    const src = read(file);
    assert.doesNotMatch(src, /(?:GDRIVE_PRIVATE_KEY|GAS_BRIDGE_SECRET|BHH_BRIDGE_SECRET|ServiceAccountPrivateKey)\s*[:=]/);
  }
});
