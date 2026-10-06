import assert from 'node:assert/strict';
import { NON_URGENT_PTC_DURATION, buildUrgencyDuration, getUrgencyDurationState } from '../js/physician-rules.js';

assert.equal(NON_URGENT_PTC_DURATION, 'รอบการนำเสนอของคณะกรรมการ PTC');

assert.deepEqual(
  getUrgencyDurationState('NON_URGENT', 'ภายใน 24 ชั่วโมง'),
  { value: NON_URGENT_PTC_DURATION, readOnly: true }
);

assert.deepEqual(
  getUrgencyDurationState('URGENT', NON_URGENT_PTC_DURATION),
  { value: '', readOnly: false }
);

assert.deepEqual(
  getUrgencyDurationState('URGENT', 'ภายใน 24 ชั่วโมง'),
  { value: 'ภายใน 24 ชั่วโมง', readOnly: false }
);

assert.deepEqual(
  getUrgencyDurationState('', NON_URGENT_PTC_DURATION),
  { value: '', readOnly: false }
);

console.log('physician-rules.test.mjs: PASS');


assert.equal(buildUrgencyDuration('URGENT', '24', 'HOURS'), 'ภายใน 24 ชั่วโมง');
assert.equal(buildUrgencyDuration('URGENT', '2', 'DAYS'), 'ภายใน 2 วัน');
assert.equal(buildUrgencyDuration('NON_URGENT', '', 'HOURS'), NON_URGENT_PTC_DURATION);
assert.equal(buildUrgencyDuration('URGENT', '', 'HOURS'), '');

console.log('physician-rules.test.mjs: PASS');
