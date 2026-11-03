import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import worker from '../src/index.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const driveEnv = {
  GDRIVE_CLIENT_EMAIL: 'test@example.iam.gserviceaccount.com',
  GDRIVE_PRIVATE_KEY: privateKey.export({ format:'pem', type:'pkcs8' }),
  GDRIVE_FOLDER_ID: 'synthetic-staging-folder',
  DRIVE_UPLOAD_ENABLED: 'true'
};
const ctx = { access: { aud: 'test-access-app', getIdentity: async () => ({ email: 'pharm@example.test' }) } };

function stubDb(throwOnSave = false) {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...args) { this.params = args; return this; },
        async first() {
          if (sql.includes('FROM hospital_users')) {
            return { id: 'STAFF-1', email:'pharm@example.test', is_active:1, role:'PHARMACIST' };
          }
          if (sql.includes('SELECT id FROM submissions')) return { id:'TEST-S1' };
          if (sql.includes('MAX(version)')) return { latest: 1 };
          return null;
        }
      };
    },
    async batch(statements) {
      if (throwOnSave) throw new Error('Simulated database write failure');
      rows.push(...statements);
      return statements.map(() => ({ success: true, results: [] }));
    }
  };
}
function req(bytes, type='RESEARCH_EVIDENCE', name='synthetic.pdf', mime='application/pdf') {
  return new Request('https://preprod.test/api/admin/submissions/TEST-S1/documents?type=' + encodeURIComponent(type) +
    '&filename=' + encodeURIComponent(name), {
    method:'POST', headers: { 'content-type': mime }, body:bytes
  });
}

test('Drive document API is disabled until approved Worker secrets are set', async () => {
  const res = await worker.fetch(req(new TextEncoder().encode('%PDF-1.7')), {
    DB:stubDb(), CF_ACCESS_AUD:'test-access-app'
  }, ctx);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error,'DRIVE_UPLOAD_NOT_CONFIGURED');
});

test('rejects mismatched document MIME and file signature before network access', async () => {
  let called = false;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; throw Error('unexpected network'); };
  try {
    const env = { DB:stubDb(), CF_ACCESS_AUD:'test-access-app', ...driveEnv };
    const invalid = await worker.fetch(req(new Uint8Array([1,2,3,4])),env,ctx);
    assert.equal(invalid.status,400);
    assert.equal((await invalid.json()).error,'INVALID_FILE_SIGNATURE');
    const badMime = await worker.fetch(req(new TextEncoder().encode('%PDF-1.7'), 'RESEARCH_EVIDENCE','synthetic.pdf','text/plain'),env,ctx);
    assert.equal(badMime.status,400);
    assert.equal(called,false);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('authorized pharmacy upload writes document metadata and audit to D1', async () => {
  let networkCalls = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    networkCalls++;
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return Response.json({ access_token:'MOCK-TOKEN' });
    }
    assert(String(url).includes('upload/drive/v3/files'));
    assert.equal(opts.headers.authorization,'Bearer MOCK-TOKEN');
    return Response.json({ id:'fake-drive-object', name:'test-stored.pdf' });
  };
  const db=stubDb();
  try {
    const bytes = new TextEncoder().encode('%PDF-1.7\nsynthetic attachment');
    const res = await worker.fetch(req(bytes), { DB:db, CF_ACCESS_AUD:'test-access-app', ...driveEnv },ctx);
    assert.equal(res.status,201);
    const body=await res.json();
    assert.equal(body.version,2);
    assert.equal(body.type,'RESEARCH_EVIDENCE');
    assert.equal(body.sizeBytes,bytes.byteLength);
    assert.equal(Object.hasOwn(body,'fileId'),false);
    assert.equal(networkCalls,2);
    assert.equal(db.rows.length,2);
    assert(db.rows[0].sql.includes('INSERT INTO documents'));
    assert(db.rows[1].sql.includes('INSERT INTO audit_logs'));
    assert.equal(db.rows[0].params[4],'fake-drive-object');
  } finally {
    globalThis.fetch=oldFetch;
  }
});

test('database failure attempts private Drive delete compensation', async () => {
  let deleted=false;
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async (url,opts)=>{
    if (String(url).includes('oauth2.googleapis.com/token')) return Response.json({access_token:'MOCK-TOKEN'});
    if (opts.method==='DELETE') { deleted=true; return new Response(null,{status:204}); }
    return Response.json({id:'private-test-file-id',name:'test.pdf'});
  };
  try {
    const res = await worker.fetch(req(new TextEncoder().encode('%PDF-1.7\nrollback')),{
      DB:stubDb(true),CF_ACCESS_AUD:'test-access-app',...driveEnv
    },ctx);
    assert.equal(res.status,500);
    assert.equal((await res.json()).error,'DOCUMENT_SAVE_FAILED');
    assert.equal(deleted,true);
  } finally {
    globalThis.fetch=oldFetch;
  }
});
