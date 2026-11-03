import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';

const env = { DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) } };
function request(path, options) {
  return new Request('https://staging.example.test' + path, options);
}
test('preproduction health checks bound D1', async () => {
  const res = await worker.fetch(request('/health'), env);
  assert.equal(res.status, 200);
  const value = await res.json();
  assert.equal(value.status, 'ok');
  assert.equal(value.environment, 'preproduction');
});
test('failure of D1 does not reveal internals', async () => {
  const res = await worker.fetch(request('/health'), {});
  assert.equal(res.status, 503);
  assert.deepEqual((await res.json()).status, 'unavailable');
});
test('public config is explicitly read-only', async () => {
  const res = await worker.fetch(request('/api/public/config'), env);
  assert.equal((await res.json()).readOnly, true);
});
test('write methods are denied until RBAC is implemented', async () => {
  const res = await worker.fetch(request('/api/submissions', { method: 'POST' }), env);
  assert.equal(res.status, 405);
});
test('unknown routes have no implicit admin data access', async () => {
  const res = await worker.fetch(request('/api/admin/submissions'), env);
  assert.equal(res.status, 404);
});
test('CORS allowlist only includes the existing GitHub Pages origin', async () => {
  const valid = await worker.fetch(request('/api/public/config', { headers: { origin: 'https://juipharm.github.io' } }), env);
  assert.equal(valid.headers.get('access-control-allow-origin'), 'https://juipharm.github.io');
  const invalid = await worker.fetch(request('/api/public/config', { headers: { origin: 'https://unknown.test' } }), env);
  assert.equal(invalid.headers.get('access-control-allow-origin'), null);
});
