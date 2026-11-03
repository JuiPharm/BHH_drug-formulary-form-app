/**
 * Restricted Google Drive upload endpoint.
 * Requires a platform-verified Cloudflare Access hospital identity from the caller.
 * Disabled unless DRIVE_UPLOAD_ENABLED=true and all Drive secrets are configured.
 */
import { HttpError } from './auth-service.mjs';
import { hasDriveConfig, uploadDocumentToDrive, deleteDocumentFromDrive } from './drive-service.mjs';

const MAX_BYTES = 10 * 1024 * 1024;
const EXT_TO_MIME = Object.freeze({
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
});
const TYPE_EXTENSIONS = Object.freeze({
  QUOTATION: ['pdf'],
  TMT: ['pdf', 'xls', 'xlsx'],
  REGISTRATION: ['pdf'],
  GMP: ['pdf'],
  CERTIFICATE_FREE_SALE: ['pdf'],
  PRODUCT_IMAGES: ['pdf', 'jpg', 'jpeg', 'png'],
  LABEL_TH: ['pdf'],
  LABEL_EN: ['pdf'],
  RETURN_EXCHANGE: ['pdf'],
  PATIENT_INFORMATION_LEAFLET: ['doc', 'docx'],
  PRESENTATION: ['ppt', 'pptx'],
  RESEARCH_EVIDENCE: ['pdf'],
  COA_OR_PRODUCT_SPECIFIC: ['pdf'],
  SIGNED_PHYSICIAN_FORM: ['pdf']
});

function verifySignature(extension, bytes) {
  if (extension === 'pdf') {
    return bytes.length >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
  }
  if (extension === 'png') {
    return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((x,i) => bytes[i] === x);
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  }
  if (['docx','xlsx','pptx'].includes(extension)) {
    return bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
  }
  if (['doc','xls','ppt'].includes(extension)) {
    return bytes.length >= 8 && [208,207,17,224,161,177,26,225].every((x,i) => bytes[i] === x);
  }
  return false;
}
async function readBoundedBody(request) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > MAX_BYTES) throw new HttpError('DOCUMENT_TOO_LARGE', 413);
  if (!request.body) throw new HttpError('DOCUMENT_EMPTY', 400);
  const chunks = [];
  const reader = request.body.getReader();
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new HttpError('DOCUMENT_TOO_LARGE', 413);
    }
    chunks.push(value);
  }
  if (!total) throw new HttpError('DOCUMENT_EMPTY', 400);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function uploadAdminDocument(env, rawId, request, actor, params) {
  if (String(env?.DRIVE_UPLOAD_ENABLED || '').toLowerCase() !== 'true' || !hasDriveConfig(env)) {
    throw new HttpError('DRIVE_UPLOAD_NOT_CONFIGURED', 503);
  }
  const submissionId = String(rawId);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(submissionId)) {
    throw new HttpError('INVALID_SUBMISSION_ID', 400);
  }
  const type = String(params.get('type') || '').trim();
  const fileName = String(params.get('filename') || '').trim();
  const extension = fileName.toLowerCase().split('.').pop();
  const mimeType = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPE_EXTENSIONS[type]?.includes(extension) || EXT_TO_MIME[extension] !== mimeType
      || !/^[^\/\\\x00-\x1f]{1,150}$/.test(fileName)) {
    throw new HttpError('INVALID_DOCUMENT_TYPE', 400);
  }
  const submission = await env.DB.prepare('SELECT id FROM submissions WHERE id = ?').bind(submissionId).first();
  if (!submission) throw new HttpError('SUBMISSION_NOT_FOUND', 404);
  const bytes = await readBoundedBody(request);
  if (!verifySignature(extension, bytes)) throw new HttpError('INVALID_FILE_SIGNATURE', 400);
  const documentId = crypto.randomUUID();
  const current = await env.DB.prepare(
    'SELECT COALESCE(MAX(version), 0) AS latest FROM documents WHERE submission_id = ? AND document_type = ?'
  ).bind(submissionId, type).first();
  const version = Number(current?.latest || 0) + 1;
  const privateName = (submissionId + '_' + type + '_' + documentId + '_' + fileName).slice(0,180);
  let file;
  try {
    file = await uploadDocumentToDrive(env, { fileName: privateName, mimeType, bytes });
  } catch {
    throw new HttpError('DRIVE_UPLOAD_FAILED', 502);
  }
  const timestamp = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO documents
        (id,submission_id,document_type,version,storage_key,original_filename,mime_type,
         size_bytes,sha256,review_status,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,'PENDING',?)`).bind(
          documentId, submissionId, type, version, file.fileId, fileName,
          mimeType, file.sizeBytes, file.sha256, timestamp
        ),
      env.DB.prepare(`INSERT INTO audit_logs
        (id,actor_id,action,entity_type,entity_id,request_id,detail_json,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).bind(
          crypto.randomUUID(), actor.id, 'uploadDocument', 'Submission', submissionId,
          crypto.randomUUID(), JSON.stringify({ documentId, documentType: type, version }), timestamp
        )
    ]);
  } catch {
    // Best-effort compensation: never leave a public link to the orphaned object.
    try { await deleteDocumentFromDrive(env, file.fileId); } catch { /* report via monitoring in production */ }
    throw new HttpError('DOCUMENT_SAVE_FAILED', 500);
  }
  return { documentId, submissionId, type, version, sha256: file.sha256, sizeBytes: file.sizeBytes };
}
