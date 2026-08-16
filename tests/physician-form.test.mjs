import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const fallbackHtml = fs.readFileSync(path.join(here, '..', '404.html'), 'utf8');

function tagFor(name) {
  const match = html.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bname=["']${name}["'][^>]*>`, 'i'));
  assert.ok(match, `missing control ${name}`);
  return match[0];
}

function isRequired(name) {
  return /\brequired\b/i.test(tagFor(name));
}

const requiredFields = [
  'physicianName',
  'physicianProfessionalTitle',
  'physicianDepartment',
  'physicianSpecialty',
  'urgency',
  'urgencyDuration',
  'proposalReason'
];

for (const field of requiredFields) {
  assert.equal(isRequired(field), true, `${field} must be required`);
}

assert.equal(isRequired('physicianPhone'), false, 'physicianPhone must remain optional');
assert.match(html, /แพทย์ผู้เสนอ\s*—\s*Required/);
assert.match(html, /ผู้เห็นชอบ\s*—\s*Optional\s*สูงสุด\s*6\s*คน/);

for (const approverField of ['name', 'professionalTitle', 'department', 'specialty']) {
  const pattern = new RegExp(`data-approver-field=["']${approverField}["'][^>]*\\brequired\\b`, 'i');
  assert.doesNotMatch(html, pattern, `approver ${approverField} must stay optional`);
}

console.log('physician-form.test.mjs: PASS');

assert.match(fallbackHtml, /แพทย์ผู้เสนอ\s*—\s*Required/, '404 fallback must use the same required physician form');
assert.match(html, /ข้อมูลแพทย์ผู้เสนอเป็นข้อมูลบังคับ.*ผู้เห็นชอบเป็น Optional/, 'section help text must reflect required physician and optional approvers');
