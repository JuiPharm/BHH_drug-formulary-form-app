import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const fallbackHtml = await readFile(new URL('../404.html', import.meta.url), 'utf8');

for (const [name, source] of [['index', html], ['404', fallbackHtml]]) {
  test(`${name} uses RMP terminology and new clinical field`, () => {
    assert.match(source, /เป็นยา RMP หรือไม่/);
    assert.doesNotMatch(source, /เป็นยา SMP หรือไม่/);
    assert.match(source, /name="otherClinicalInformation"/);
  });

  test(`${name} uses structured proposal reason controls`, () => {
    assert.match(source, /name="proposalReasonNoAlternative"/);
    assert.match(source, /name="proposalReasonSafer"/);
    assert.match(source, /name="proposalReasonCostEffective"/);
    assert.match(source, /name="proposalReasonOther"/);
  });

  test(`${name} requires restriction choice and supports structured urgency`, () => {
    assert.match(source, /name="useRestrictionRequired" value="false" required/);
    assert.match(source, /name="useRestrictionRequired" value="true" required/);
    assert.match(source, /name="urgencyAmount"/);
    assert.match(source, /name="urgencyUnit"/);
    assert.match(source, /name="urgencyDuration" readonly required/);
  });

  test(`${name} shows submission terms before declaration`, () => {
    assert.match(source, /เงื่อนไขสำคัญก่อนส่งคำขอ/);
    assert.match(source, /ยืนราคาได้อย่างน้อย 1 ปี/);
    assert.match(source, /name="declarationAccepted" required/);
  });
}

console.log('form-v1.3-ui.test.mjs: PASS');
