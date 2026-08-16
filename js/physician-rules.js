export const NON_URGENT_PTC_DURATION = 'รอบการนำเสนอของคณะกรรมการ PTC';

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
