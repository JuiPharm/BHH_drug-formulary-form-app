import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';

function stubDb(userRole = 'PHARMACIST', active = 1) {
  const statements = [];
  const db = {
    statements,
    prepare(sql) {
      const statement = {
        sql,
        params: [],
        bind(...args) { this.params = args; return this; },
        async first() {
          if (sql.includes('SELECT 1 AS ok')) return { ok: 1 };
          if (sql.includes('FROM hospital_users')) {
            return userRole ? { id: 'STAFF-1', email: 'pharmacy@example.test', role: userRole, is_active: active } : null;
          }
          if (sql.includes('FROM submissions WHERE id')) return { id: 'TEST-S1' };
          if (sql.includes('FROM submissions s')) return { id: 'TEST-S1', status: 'DOCUMENT_REVIEW' };
          return null;
        },
        async all() {
          if (sql.includes('GROUP BY status')) return { results: [{ status: 'DOCUMENT_REVIEW', count: 1 }] };
          return { results: [] };
        }
      };
      return statement;
    },
    async batch(items) {
      statements.push(...items);
      if (items.some(x => x.sql.includes('COUNT(*) AS total'))) {
        return [
          { results: [{ total: 1 }] },
          { results: [{ id: 'TEST-S1', submission_no: 'DF-TEST-0001', status: 'DOCUMENT_REVIEW', latest_comment: null, comment_count: 0 }] }
        ];
      }
      return items.map(x => ({ results: [] }));
    }
  };
  return db;
}
const audit = 'bhh-preprod-admin';
const authCtx = (roleAud = audit, email = 'pharmacy@example.test') => ({
  access: { aud: roleAud, getIdentity: async () => ({ email }) }
});
const req = (path, extra={}) => new Request('https://staging.example.test' + path, extra);

test('Access is mandatory and cannot be bypassed with custom identity headers', async () => {
  const env = { DB: stubDb(), CF_ACCESS_AUD: audit };
  const r = await worker.fetch(req('/api/admin/submissions', { headers: { 'cf-access-jwt-assertion': 'forged' } }), env);
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error, 'ACCESS_AUTH_REQUIRED');
});
test('Access application audience must match configured audience', async () => {
  const env = { DB: stubDb(), CF_ACCESS_AUD: audit };
  const r = await worker.fetch(req('/api/admin/submissions'), env, authCtx('untrusted-app'));
  assert.equal(r.status, 403);
});
test('unprovisioned or inactive hospital identities cannot read records', async () => {
  for (const db of [stubDb(null), stubDb('PHARMACIST', 0)]) {
    const r = await worker.fetch(req('/api/admin/submissions'), { DB: db, CF_ACCESS_AUD: audit }, authCtx());
    assert.equal(r.status, 403);
  }
});
test('active pharmacist can list D1 submissions without Google Sheets full scan', async () => {
  const db = stubDb();
  const r = await worker.fetch(req('/api/admin/submissions?limit=5'), { DB: db, CF_ACCESS_AUD: audit }, authCtx());
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.total, 1);
  assert.equal(data.items[0].submission_no, 'DF-TEST-0001');
  assert(db.statements.some(x => x.sql.includes('FROM submissions')));
});
test('internal comment writes use verified identity and D1 batch audit', async () => {
  const db = stubDb();
  const r = await worker.fetch(req('/api/admin/submissions/TEST-S1/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      comment: 'ส่งเอกสาร TMT เพิ่มเติม',
      visibility: 'COMPANY_VISIBLE',
      createdBy: 'hacker@example.test'
    })
  }), { DB: db, CF_ACCESS_AUD: audit }, authCtx());
  assert.equal(r.status, 201);
  const data = await r.json();
  assert.equal(data.visibility, 'INTERNAL');
  assert.equal(data.createdBy, 'pharmacy@example.test');
  assert.equal(db.statements.length, 2);
  assert(db.statements[0].sql.includes('INSERT INTO submission_comments'));
  assert(db.statements[1].sql.includes('INSERT INTO audit_logs'));
  assert.equal(db.statements[0].params[4], 'pharmacy@example.test');
});
test('PTC member is read-only even when identity is verified', async () => {
  const r = await worker.fetch(req('/api/admin/submissions/TEST-S1/comments', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ comment: 'test' })
  }), { DB: stubDb('PTC_MEMBER'), CF_ACCESS_AUD: audit }, authCtx());
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'STAFF_WRITE_FORBIDDEN');
});
test('comment length and MIME type validated before D1 write', async () => {
  const db = stubDb();
  for (const extra of [
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comment: 'x'.repeat(2001) }) },
    { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello' }
  ]) {
    const r = await worker.fetch(req('/api/admin/submissions/TEST-S1/comments', extra), { DB: db, CF_ACCESS_AUD: audit }, authCtx());
    assert([400, 415].includes(r.status));
  }
  assert.equal(db.statements.length, 0);
});
test('preproduction status endpoint is never exposed without validated staff authorization', async () => {
  const r = await worker.fetch(req('/api/admin/summary'), { DB: stubDb(), CF_ACCESS_AUD: audit }, authCtx());
  assert.equal(r.status, 200);
  assert.equal((await r.json()).byStatus.DOCUMENT_REVIEW, 1);
});
