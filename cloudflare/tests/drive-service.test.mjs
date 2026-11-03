import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { getGoogleAccessToken, uploadDocumentToDrive, hasDriveConfig } from '../src/drive-service.mjs';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  GDRIVE_CLIENT_EMAIL: 'test-storage@example.iam.gserviceaccount.com',
  GDRIVE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  GDRIVE_FOLDER_ID: 'synthetic-dedicated-folder'
};

test('Drive adapter stays disabled when secrets are absent', async () => {
  assert.equal(hasDriveConfig({}), false);
  await assert.rejects(getGoogleAccessToken({}), /not configured/);
});

test('OAuth JWT assertion is signed correctly, scoped to Drive and short-lived', async () => {
  let checked = false;
  const transport = async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(options.method, 'POST');
    const assertion = new URLSearchParams(options.body).get('assertion');
    const [header, payload, sig] = assertion.split('.');
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    assert.equal(decodedHeader.alg, 'RS256');
    assert.equal(claims.iss, env.GDRIVE_CLIENT_EMAIL);
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/drive');
    assert.equal(claims.aud, url);
    assert.equal(claims.iat, 1790000000);
    assert.equal(claims.exp, 1790003500);
    assert.equal(verify('RSA-SHA256', Buffer.from(header + '.' + payload), publicKey, Buffer.from(sig, 'base64url')), true);
    checked = true;
    return new Response(JSON.stringify({ access_token: 'mock-access-token' }), { status: 200 });
  };
  const token = await getGoogleAccessToken(env, transport, 1790000000000);
  assert.equal(token, 'mock-access-token');
  assert(checked);
});

test('binary Google Drive upload uses private parent, returns SHA-256, and does not expose token', async () => {
  let calls = 0;
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 255]);
  const transport = async (url, options) => {
    calls++;
    if (url.includes('oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'mock-secret-token' }), { status: 200 });
    }
    assert.equal(url.startsWith('https://www.googleapis.com/upload/drive/v3/files?'), true);
    assert.equal(options.headers.authorization, 'Bearer mock-secret-token');
    assert.match(options.headers['content-type'], /multipart\/related/);
    const text = await options.body.text();
    assert.match(text, /"parents":\["synthetic-dedicated-folder"\]/);
    assert.match(text, /"name":"TEST-PI.pdf"/);
    return new Response(JSON.stringify({ id: 'fake-file-id', name: 'TEST-PI.pdf' }), { status: 200 });
  };
  const stored = await uploadDocumentToDrive(env, { fileName: 'TEST-PI.pdf', mimeType: 'application/pdf', bytes }, transport);
  assert.equal(calls, 2);
  assert.equal(stored.provider, 'google-drive');
  assert.equal(stored.fileId, 'fake-file-id');
  assert.equal(stored.sizeBytes, 6);
  assert.equal(stored.sha256, '40d2af4d7ac41bb624d396eabbe5f30b8b3b70f451f7ad251cd193e02b7b9338');
  assert.equal(JSON.stringify(stored).includes('mock-secret-token'), false);
});

test('rejects oversized, invalid, and empty uploads before Google OAuth call', async () => {
  let called = false;
  const network = async () => { called = true; throw Error('should not call'); };
  for (const input of [
    { fileName: 'sample.pdf', mimeType: 'application/pdf', bytes: new Uint8Array() },
    { fileName: 'sample.pdf', mimeType: 'application/pdf', bytes: new Uint8Array(10 * 1024 * 1024 + 1) },
    { fileName: '../../unsafe.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1]) },
    { fileName: 'script.js', mimeType: 'application/javascript', bytes: new Uint8Array([1]) }
  ]) {
    await assert.rejects(uploadDocumentToDrive(env, input, network));
  }
  assert.equal(called, false);
});

test('files above 5 MiB use resumable upload session with trusted Google host', async () => {
  const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
  bytes.set(new TextEncoder().encode('%PDF-'), 0);
  let initCalled = false;
  let putCalled = false;
  const transport = async (url, options) => {
    if (url.includes('oauth2.googleapis.com')) {
      return Response.json({ access_token: 'MOCK-TOKEN' });
    }
    if (options.method === 'POST') {
      assert(url.includes('uploadType=resumable'));
      assert.equal(options.headers['x-upload-content-length'], String(bytes.length));
      initCalled = true;
      return new Response(null, {
        status: 200,
        headers: {
          location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic'
        }
      });
    }
    assert.equal(options.method, 'PUT');
    assert.equal(options.body.length, bytes.length);
    putCalled = true;
    return Response.json({ id: 'resumable-synthetic-id' });
  };
  const result = await uploadDocumentToDrive(env, {
    fileName: 'large.pdf', mimeType: 'application/pdf', bytes
  }, transport);
  assert.equal(initCalled, true);
  assert.equal(putCalled, true);
  assert.equal(result.fileId, 'resumable-synthetic-id');
  assert.equal(result.sizeBytes, bytes.length);
});

test('resumable upload rejects an unexpected session URL before transmitting file', async () => {
  let putCalled = false;
  const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
  const transport = async (_url, options) => {
    if (String(_url).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'MOCK-TOKEN' });
    if (options.method === 'POST') {
      return new Response(null, {status: 200, headers: { location: 'https://untrusted.example.test/receive' } });
    }
    putCalled = true;
    throw Error('must not happen');
  };
  await assert.rejects(
    uploadDocumentToDrive(env, {fileName:'large.pdf',mimeType:'application/pdf',bytes}, transport),
    /Invalid Drive resumable upload session location/
  );
  assert.equal(putCalled, false);
});
