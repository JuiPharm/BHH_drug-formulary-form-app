/**
 * Private Google Drive storage adapter for Cloudflare Workers.
 * Does not expose credentials or file links to clients. Invoked only by
 * authenticated API handlers once institutional service-account access is set up.
 *
 * Google Workspace Shared Drive (or approved domain-wide delegation) is required.
 * A service account must have explicit access to the dedicated storage folder.
 */
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,parents';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const MAX_BYTES = 10 * 1024 * 1024;

export function hasDriveConfig(env) {
  return Boolean(env?.GDRIVE_CLIENT_EMAIL && env?.GDRIVE_PRIVATE_KEY && env?.GDRIVE_FOLDER_ID);
}

function base64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function pkcs8Bytes(pem) {
  const clean = String(pem || '')
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!clean || !/^[A-Za-z0-9+/=]+$/.test(clean)) throw new Error('Invalid Drive key configuration');
  const binary = atob(clean);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

export async function getGoogleAccessToken(env, transport = fetch, nowMs = Date.now()) {
  if (!hasDriveConfig(env)) throw new Error('Drive integration is not configured');
  const key = await crypto.subtle.importKey('pkcs8', pkcs8Bytes(env.GDRIVE_PRIVATE_KEY), {
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'
  }, false, ['sign']);
  const now = Math.floor(nowMs / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = {
    iss: env.GDRIVE_CLIENT_EMAIL,
    scope: DRIVE_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3500
  };
  // Delegation must be explicitly configured by an approved Google Workspace admin.
  if (env.GDRIVE_DELEGATED_USER) claim.sub = env.GDRIVE_DELEGATED_USER;
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(claim)));
  const signingInput = header + '.' + payload;
  const signature = base64Url(new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput)
  )));
  const response = await transport(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signingInput + '.' + signature
    })
  });
  if (!response.ok) throw new Error('Google OAuth token request failed');
  const data = await response.json();
  if (!data?.access_token || typeof data.access_token !== 'string') {
    throw new Error('Invalid Google OAuth token response');
  }
  return data.access_token;
}

/**
 * Server-side upload of one validated file; caller must perform role,
 * submission ownership, document-type and version checks before invoking.
 * Binary body avoids Base64. Size cap intentionally matches existing Form App.
 */
export async function uploadDocumentToDrive(env, input, transport = fetch) {
  if (!hasDriveConfig(env)) throw new Error('Drive integration is not configured');
  const name = String(input?.fileName || '').trim();
  const mimeType = String(input?.mimeType || '').trim();
  const bytes = input?.bytes instanceof Uint8Array
    ? input.bytes
    : input?.bytes instanceof ArrayBuffer ? new Uint8Array(input.bytes) : null;
  if (!bytes || !bytes.length || bytes.length > MAX_BYTES) {
    throw new Error('Invalid file size (maximum 10 MiB per file)');
  }
  if (!name || name.length > 180 || /[\\/\x00-\x1f]/.test(name)) {
    throw new Error('Invalid file name');
  }
  if (!/^(application\/(pdf|msword|vnd\.[a-z0-9.+-]+)|image\/(png|jpeg))$/.test(mimeType)) {
    throw new Error('Disallowed MIME type');
  }
  const token = await getGoogleAccessToken(env, transport);
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(v => v.toString(16).padStart(2, '0')).join('');
  const boundary = 'bhh_' + crypto.randomUUID().replace(/-/g, '');
  const meta = JSON.stringify({ name, mimeType, parents: [env.GDRIVE_FOLDER_ID], description: 'BHH Drug Formulary submission attachment' });
  const body = new Blob([
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
    meta,
    '\r\n--' + boundary + '\r\nContent-Type: ' + mimeType + '\r\n\r\n',
    bytes,
    '\r\n--' + boundary + '--'
  ]);
  const response = await transport(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'multipart/related; boundary=' + boundary
    },
    body
  });
  if (!response.ok) throw new Error('Private Drive upload failed');
  const result = await response.json();
  if (!result?.id) throw new Error('Drive upload response missing file id');
  return {
    provider: 'google-drive',
    fileId: String(result.id),
    name: String(result.name || name),
    mimeType,
    sizeBytes: bytes.byteLength,
    sha256
  };
}
