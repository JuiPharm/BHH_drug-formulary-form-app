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
  assert.equal(stored.sha256, '849a044225d2de70c08385c4b6ea69560b3d9f2027e95ade25ba4700d479ee77');
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
