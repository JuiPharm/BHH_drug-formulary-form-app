import assert from 'node:assert/strict';
import { NON_URGENT_PTC_DURATION, getUrgencyDurationState } from '../js/physician-rules.js';

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
