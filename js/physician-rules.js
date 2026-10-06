export const NON_URGENT_PTC_DURATION = 'รอบการนำเสนอของคณะกรรมการ PTC';

export const URGENCY_UNIT_LABELS = Object.freeze({
  HOURS: 'ชั่วโมง',
  DAYS: 'วัน'
});

export function buildUrgencyDuration(urgency, amount = '', unit = 'HOURS') {
  const normalizedUrgency = String(urgency || '').trim();
  if (normalizedUrgency === 'NON_URGENT') return NON_URGENT_PTC_DURATION;
  if (normalizedUrgency !== 'URGENT') return '';

  const numericAmount = Number(amount);
  const unitLabel = URGENCY_UNIT_LABELS[String(unit || '').trim()] || '';
  if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !unitLabel) return '';
  return `ภายใน ${numericAmount} ${unitLabel}`;
}

export function getUrgencyDurationState(urgency, currentValue = '') {
  const normalizedUrgency = String(urgency || '').trim();
  const normalizedValue = String(currentValue || '').trim();

  if (normalizedUrgency === 'NON_URGENT') {
    return { value: NON_URGENT_PTC_DURATION, readOnly: true };
  }

  if (normalizedValue === NON_URGENT_PTC_DURATION) {
    return { value: '', readOnly: false };
  }

  return { value: normalizedValue, readOnly: false };
}
