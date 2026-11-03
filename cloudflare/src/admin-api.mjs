import { HttpError } from './auth-service.mjs';

const MAX_COMMENT_CHARS = 2000;
const MAX_JSON_BYTES = 8192;
const MAX_PAGE = 100;

function validId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new HttpError('INVALID_SUBMISSION_ID', 400);
  }
  return id;
}

export async function listAdminSubmissions(env, params) {
  const status = String(params.get('status') || '').trim();
  const search = String(params.get('search') || '').trim().toLowerCase().slice(0, 120);
  const limit = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(params.get('limit') || '30', 10) || 30));
  const offset = Math.max(0, Number.parseInt(params.get('offset') || '0', 10) || 0);
  if (offset > 100000) throw new HttpError('OFFSET_TOO_LARGE', 400);
  const filter = `WHERE (? = '' OR s.status = ?)
    AND (? = '' OR LOWER(s.submission_no || ' ' || s.brand_name || ' ' || COALESCE(s.generic_name,'')) LIKE ?)`;
  const bindings = [status, status, search, '%' + search + '%'];
  const [count, rows] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS total FROM submissions s ' + filter).bind(...bindings),
    env.DB.prepare(`
      SELECT s.id, s.submission_no, s.brand_name, s.generic_name, s.strength,
        s.dosage_form, s.status, s.created_at, s.updated_at,
        c.name AS company_name,
        (SELECT sc.comment_text FROM submission_comments sc
         WHERE sc.submission_id=s.id ORDER BY sc.created_at DESC, sc.id DESC LIMIT 1) AS latest_comment,
        (SELECT COUNT(*) FROM submission_comments sc WHERE sc.submission_id=s.id) AS comment_count
      FROM submissions s LEFT JOIN companies c ON c.id=s.company_id
      ` + filter + ' ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?')
      .bind(...bindings, limit, offset)
  ]);
  return {
    total: Number(count.results?.[0]?.total || 0),
    items: rows.results || [],
    offset, limit
  };
}

export async function getAdminSubmission(env, rawId) {
  const id = validId(rawId);
  const main = await env.DB.prepare(`
    SELECT s.*, c.name AS company_name, c.email AS company_email,
      r.full_name AS representative_name, r.email AS representative_email
    FROM submissions s
    LEFT JOIN companies c ON c.id=s.company_id
    LEFT JOIN representatives r ON r.id=s.representative_id
    WHERE s.id = ?
  `).bind(id).first();
  if (!main) throw new HttpError('SUBMISSION_NOT_FOUND', 404);
  const [comments, history, documents] = await env.DB.batch([
    env.DB.prepare(`SELECT id, comment_text AS text, visibility, created_by, created_at,
      'COMMENT' AS type FROM submission_comments WHERE submission_id=?
      ORDER BY created_at DESC, id DESC`).bind(id),
    env.DB.prepare(`SELECT id, previous_status, new_status, changed_by, changed_at, note
      FROM status_history WHERE submission_id=? ORDER BY changed_at DESC, id DESC`).bind(id),
    env.DB.prepare(`SELECT id, document_type, version, original_filename, mime_type,
      size_bytes, sha256, review_status, created_at FROM documents WHERE submission_id=?
      ORDER BY document_type, version DESC`).bind(id)
  ]);
  const importedLegacy = new Set((comments.results || []).map(x => x.source_legacy_id).filter(Boolean));
  const legacyNotes = (history.results || [])
    .filter(x => x.note && String(x.note).trim() && String(x.changed_by).toUpperCase() !== 'SYSTEM' && !importedLegacy.has(x.id))
    .map(x => ({
      id: 'status:' + x.id, text: x.note, type: 'STATUS_NOTE',
      created_by: x.changed_by, created_at: x.changed_at, visibility: 'INTERNAL'
    }));
  const merged = [...(comments.results || []), ...legacyNotes]
    .sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
  return {
    submission: main,
    comments: merged,
    history: history.results || [],
    documents: documents.results || []
  };
}

async function readSmallJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new HttpError('JSON_REQUIRED', 415);
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_JSON_BYTES) throw new HttpError('REQUEST_TOO_LARGE', 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_JSON_BYTES) throw new HttpError('REQUEST_TOO_LARGE', 413);
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid');
    return data;
  } catch {
    throw new HttpError('INVALID_JSON', 400);
  }
}

export async function createAdminComment(env, rawId, request, actor) {
  const submissionId = validId(rawId);
  const data = await readSmallJson(request);
  const text = String(data.comment || '').trim();
  if (!text || [...text].length > MAX_COMMENT_CHARS) {
    throw new HttpError('INVALID_COMMENT', 400);
  }
  // Visibility remains INTERNAL: company access will require a separate verified role.
  const exists = await env.DB.prepare('SELECT id FROM submissions WHERE id = ?').bind(submissionId).first();
  if (!exists) throw new HttpError('SUBMISSION_NOT_FOUND', 404);
  const id = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO submission_comments
      (id,submission_id,comment_text,visibility,created_by,created_at)
      VALUES (?,?,?,'INTERNAL',?,?)`).bind(id, submissionId, text, actor.email, timestamp),
    env.DB.prepare(`INSERT INTO audit_logs
      (id,actor_id,action,entity_type,entity_id,request_id,detail_json,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind(
        auditId, actor.id, 'addSubmissionComment', 'Submission', submissionId,
        requestId, JSON.stringify({ commentId: id }), timestamp
      )
  ]);
  return { id, submissionId, text, visibility: 'INTERNAL', createdBy: actor.email, createdAt: timestamp };
}

export async function getAdminSummary(env) {
  const rows = await env.DB.prepare(`
    SELECT status, COUNT(*) AS count FROM submissions GROUP BY status ORDER BY status
  `).all();
  const counts = {};
  let total = 0;
  for (const row of rows.results || []) {
    counts[row.status] = Number(row.count);
    total += Number(row.count);
  }
  return { totalSubmissions: total, byStatus: counts };
}
