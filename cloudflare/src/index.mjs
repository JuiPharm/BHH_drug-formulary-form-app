/**
 * BHH Drug Formulary / Cloudflare pre-production API.
 * Existing production GitHub Pages and Apps Script remain unchanged.
 */
import { hasDriveConfig } from './drive-service.mjs';
import { HttpError, requireHospitalStaff } from './auth-service.mjs';
import {
  listAdminSubmissions, getAdminSubmission, createAdminComment, getAdminSummary
} from './admin-api.mjs';

const ORIGIN = 'https://juipharm.github.io';
const COMMON = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
});
function cors(origin) {
  return origin === ORIGIN ? {
    'access-control-allow-origin': ORIGIN,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin'
  } : {};
}
function json(body, status = 200, origin = '') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...COMMON, ...cors(origin) }
  });
}

async function adminRoute(request, env, ctx, url, origin) {
  try {
    const actor = await requireHospitalStaff(env, ctx);
    const pathname = url.pathname;
    if (request.method === 'GET' && pathname === '/api/admin/summary') {
      return json(await getAdminSummary(env), 200, origin);
    }
    if (request.method === 'GET' && pathname === '/api/admin/submissions') {
      return json(await listAdminSubmissions(env, url.searchParams), 200, origin);
    }
    const detail = pathname.match(/^\/api\/admin\/submissions\/([^/]+)$/);
    if (request.method === 'GET' && detail) {
      return json(await getAdminSubmission(env, decodeURIComponent(detail[1])), 200, origin);
    }
    const comments = pathname.match(/^\/api\/admin\/submissions\/([^/]+)\/comments$/);
    if (request.method === 'POST' && comments) {
      return json(await createAdminComment(env, decodeURIComponent(comments[1]), request, actor), 201, origin);
    }
    return json({ error: 'NOT_FOUND' }, 404, origin);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code }, error.status, origin);
    return json({ error: 'INTERNAL_ERROR' }, 500, origin);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin') || '';
    if (request.method === 'OPTIONS') {
      return origin === ORIGIN
        ? new Response(null, { status: 204, headers: cors(origin) })
        : json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
    }
    if (url.pathname.startsWith('/api/admin/')) {
      return adminRoute(request, env, ctx, url, origin);
    }
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
          fileStorage: 'google-drive',
          driveIntegration: hasDriveConfig(env) ? 'configured' : 'pending_credentials',
          release: 'hybrid-preprod'
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
        fileStorage: 'google-drive',
        driveUploadEnabled: false,
        driveIntegration: hasDriveConfig(env) ? 'configured' : 'pending_credentials',
        version: '2.0-hybrid-preprod',
        message: 'Production remains on Google Apps Script.'
      }, 200, origin);
    }
    return json({ error: 'NOT_FOUND' }, 404, origin);
  }
};
