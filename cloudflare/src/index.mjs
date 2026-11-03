/**
 * BHH Drug Formulary Pre-production: read-only bootstrap.
 * No production data and no unauthenticated submission/admin endpoints.
 * Future APIs must enforce hospital/representative identity and RBAC.
 */
const ORIGIN = 'https://juipharm.github.io';
const COMMON = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
});
function json(body, status = 200, origin = '') {
  const headers = { ...COMMON };
  if (origin === ORIGIN) {
    headers['access-control-allow-origin'] = ORIGIN;
    headers['vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';
    if (request.method !== 'GET') {
      return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin);
    }
    if (url.pathname === '/health') {
      try {
        if (!env.DB) throw new Error('Missing D1 binding');
        await env.DB.prepare('SELECT 1 AS ok').first();
        return json({
          service: 'bhh-drug-formulary',
          environment: 'preproduction',
          status: 'ok',
          database: 'connected',
          release: 'preprod-foundation'
        }, 200, origin);
      } catch {
        return json({ service: 'bhh-drug-formulary', environment: 'preproduction', status: 'unavailable' }, 503, origin);
      }
    }
    if (url.pathname === '/api/public/config') {
      return json({
        appName: 'BHH Drug Formulary & PTC',
        environment: 'preproduction',
        readOnly: true,
        version: '2.0-foundation',
        message: 'Migration in progress — Production remains on Google Apps Script.'
      }, 200, origin);
    }
    return json({ error: 'NOT_FOUND' }, 404, origin);
  }
};
