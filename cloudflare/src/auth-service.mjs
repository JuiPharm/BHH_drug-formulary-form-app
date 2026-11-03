/**
 * Cloudflare Access verified user identity. This endpoint must also have
 * the Access policy enabled on workers.dev (or an approved custom domain).
 * Never accept client-supplied email/role, and never fall back to header claims.
 */
export class HttpError extends Error {
  constructor(code, status = 403) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const STAFF_ROLES = new Set(['SYSTEM_ADMIN', 'PHARMACIST', 'PTC_SECRETARY', 'PTC_MEMBER']);

export async function requireHospitalStaff(env, ctx) {
  if (!env?.DB || !env?.CF_ACCESS_AUD) {
    throw new HttpError('ADMIN_AUTH_NOT_CONFIGURED', 503);
  }
  if (!ctx?.access) {
    throw new HttpError('ACCESS_AUTH_REQUIRED', 401);
  }
  if (ctx.access.aud !== env.CF_ACCESS_AUD) {
    throw new HttpError('INVALID_ACCESS_AUDIENCE', 403);
  }
  let identity;
  try {
    identity = await ctx.access.getIdentity();
  } catch {
    throw new HttpError('ACCESS_AUTH_REQUIRED', 401);
  }
  const email = String(identity?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError('INVALID_ACCESS_IDENTITY', 403);
  }
  const user = await env.DB.prepare(
    'SELECT id, email, role, is_active FROM hospital_users WHERE email = ?'
  ).bind(email).first();
  if (!user || Number(user.is_active) !== 1 || !STAFF_ROLES.has(String(user.role))) {
    throw new HttpError('STAFF_NOT_AUTHORIZED', 403);
  }
  return { id: String(user.id), email, role: String(user.role) };
}
