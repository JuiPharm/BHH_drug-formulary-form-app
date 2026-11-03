/**
 * BHH original Google Drive model — Apps Script DriveApp is the owner.
 *
 * Cloudflare never receives Google Drive credentials. It signs requests with an
 * HMAC secret shared only by a SEPARATE staging Apps Script deployment.
 * Apps Script executes the existing DriveApp folder/document helpers.
 * Its production Web App and original user-facing file behavior are unchanged.
 */
const MAX_BYTES = 10 * 1024 * 1024;
const BRIDGE_URL_PATTERN = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;
const MIME_ALLOWLIST = new Set([
  'application/pdf','image/png','image/jpeg','application/msword',
  'application/vnd.ms-excel','application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

export function hasDriveConfig(env) {
  const url = String(env?.GAS_BRIDGE_URL || '');
  return BRIDGE_URL_PATTERN.test(url) && String(env?.GAS_BRIDGE_SECRET || '').length >= 32;
}
function b64(bytes) {
  const slices = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    slices.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(slices.join(''));
}
function hex(bytes) {
  return Array.from(bytes).map(v => v.toString(16).padStart(2, '0')).join('');
}

export async function callLegacyDriveBridge(env, operation, payload, transport = fetch, nowMs = Date.now()) {
  if (!hasDriveConfig(env)) throw new Error('Apps Script Drive bridge is not configured');
  if (!['ping','createSubmissionFolders','uploadDocument','deleteDocument'].includes(operation)) {
    throw new Error('Disallowed Drive bridge operation');
  }
  const payloadBase64 = b64(new TextEncoder().encode(JSON.stringify({ operation, payload })));
  if (payloadBase64.length > 19000000) throw new Error('Drive bridge request too large');
  const timestamp = String(nowMs);
  const nonce = crypto.randomUUID();
  const message = timestamp + '\n' + nonce + '\n' + payloadBase64;
  const signingKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.GAS_BRIDGE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = hex(new Uint8Array(await crypto.subtle.sign(
    'HMAC', signingKey, new TextEncoder().encode(message)
  )));
  const response = await transport(env.GAS_BRIDGE_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'cloudflareBridge', requestId: crypto.randomUUID(),
      bridgeAuth: { timestamp, nonce, signature }, payloadBase64
    })
  });
  if (!response.ok) throw new Error('Apps Script Drive bridge network error');
  const result = await response.json().catch(() => null);
  if (!result?.success || typeof result?.data !== 'object' || result?.data === null) {
    throw new Error('Apps Script Drive bridge rejected operation');
  }
  return result.data;
}

export async function createSubmissionFoldersOnDrive(env, submission, transport = fetch) {
  const submissionNo = String(submission?.submissionNo || '');
  const product = submission?.product || {};
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(submissionNo) ||
      !product.brandName || !product.strength || !product.dosageForm) {
    throw new Error('Invalid submission folder request');
  }
  return callLegacyDriveBridge(env, 'createSubmissionFolders', {
    submissionNo,
    product: {
      brandName: String(product.brandName),
      strength: String(product.strength),
      dosageForm: String(product.dosageForm)
    }
  }, transport);
}

export async function uploadDocumentToDrive(env, input, transport = fetch) {
  const name = String(input?.fileName || '').trim();
  const mimeType = String(input?.mimeType || '').trim();
  const bytes = input?.bytes instanceof Uint8Array ? input.bytes :
    input?.bytes instanceof ArrayBuffer ? new Uint8Array(input.bytes) : null;
  if (!bytes || !bytes.length || bytes.length > MAX_BYTES) {
    throw new Error('Invalid file size (maximum 10 MiB per file)');
  }
  if (!name || name.length > 180 || /[\\/\x00-\x1f]/.test(name)) {
    throw new Error('Invalid file name');
  }
  if (!MIME_ALLOWLIST.has(mimeType)) throw new Error('Disallowed MIME type');
  const sha256 = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
  const result = await callLegacyDriveBridge(env, 'uploadDocument', {
    submissionId: String(input.submissionId),
    submissionNo: String(input.submissionNo),
    documentType: String(input.documentType),
    rootFolderId: String(input.rootFolderId),
    version: Number(input.version),
    fileName: name,
    mimeType,
    sha256,
    base64Data: b64(bytes)
  }, transport);
  if (!result?.fileId || result.sha256 !== sha256 || result.sizeBytes !== bytes.length) {
    throw new Error('Apps Script Drive bridge returned mismatched file metadata');
  }
  return {
    provider: 'drive-apps-script',
    fileId: String(result.fileId),
    name: String(result.fileName),
    sha256,
    mimeType,
    sizeBytes: bytes.length
  };
}

export async function deleteDocumentFromDrive(env, fileId, transport = fetch) {
  if (!/^[A-Za-z0-9_-]{10,256}$/.test(String(fileId || ''))) throw new Error('Invalid file id');
  return callLegacyDriveBridge(env, 'deleteDocument', { fileId: String(fileId) }, transport);
}
