/**
 * Shared utility functions.
 */
function appError_(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details || null;
  return error;
}
function normalizeError_(error) {
  return {
    code: error && error.code ? error.code : 'INTERNAL_ERROR',
    message: error && error.message ? error.message : 'เกิดข้อผิดพลาดภายในระบบ',
    details: error && error.details ? error.details : null
  };
}
function assertNonEmptyString_(value, fieldName) {
  if (!String(value || '').trim()) {
    throw appError_('REQUIRED_FIELD', 'กรุณาระบุ ' + fieldName);
  }
}
function normalizeText_(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ');
}
function normalizeProductKey_(brandName, strength, dosageForm) {
  return [
    normalizeText_(brandName).replace(/\s+/g, ''),
    normalizeStrength_(strength),
    normalizeText_(dosageForm).replace(/\s+/g, '')
  ].join('|');
}
function normalizeStrength_(value) {
  const text = normalizeText_(value)
    .replace(/microgram(s)?/g, 'mcg')
    .replace(/milligram(s)?/g, 'mg')
    .replace(/gram(s)?/g, 'g')
    .replace(/\s+/g, '');
  const simpleGram = text.match(/^(\d+(?:\.\d+)?)g$/);
  if (simpleGram) {
    return String(Number(simpleGram[1]) * 1000) + 'mg';
  }
  return text;
}
function normalizePhone_(value) {
  return String(value || '').replace(/[^0-9+]/g, '');
}
function isValidEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}
function stripBase64Prefix_(value) {
  return String(value || '').replace(/^data:[^;]+;base64,/, '');
}
function computeSha256_(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function (byte) {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}
function unique_(values) {
  return values.filter(function (value, index, array) {
    return array.indexOf(value) === index;
  });
}
function toBoolean_(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}
function toDateValue_(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
function nowIso_() {
  return new Date().toISOString();
}
function formatThaiDate_(date) {
  return Utilities.formatDate(date, APP.TIMEZONE, 'dd/MM/yyyy');
}
function joinPhoneExtension_(phone, extension) {
  return extension ? String(phone || '') + ' ต่อ ' + extension : String(phone || '');
}
function joinProfessionalTitle_(title, name) {
  return [String(title || '').trim(), String(name || '').trim()].filter(Boolean).join(' ');
}
function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function sanitizeReplacementText_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\$/g, '$$$$');
}
function generateSecureToken_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}
function hashTextSha256_(value) {
  const bytes = Utilities.newBlob(String(value), 'text/plain').getBytes();
  return computeSha256_(bytes);
}
function constantTimeEqual_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    mismatch |= (a.charCodeAt(i % Math.max(a.length, 1)) || 0) ^
      (b.charCodeAt(i % Math.max(b.length, 1)) || 0);
  }
  return mismatch === 0;
}
function getActorEmail_() {
  try {
    return Session.getActiveUser().getEmail() || 'ANONYMOUS';
  } catch (ignore) {
    return 'ANONYMOUS';
  }
}
