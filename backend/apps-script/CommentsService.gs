/**
 * BHH v1.3.7-preprod — private administrative comments.
 * Requires setupSystem() to add the SubmissionComments sheet.
 * Old status notes remain in StatusHistory and are displayed in the same feed.
 * Never call these helpers from a public submission endpoint.
 */
function getSubmissionCommentsMap_(submissionIds) {
  const wanted = {};
  (submissionIds || []).forEach(function (id) { wanted[String(id)] = true; });
  const map = {};
  Object.keys(wanted).forEach(function (id) { map[id] = []; });
  if (!Object.keys(wanted).length) return map;

  const commentsSheet = getSpreadsheet_().getSheetByName('SubmissionComments');
  if (commentsSheet) {
    getSheetObjects_(commentsSheet).forEach(function (row) {
      const id = String(row.SubmissionID || '');
      if (!wanted[id] || !toBoolean_(row.IsActive)) return;
      map[id].push({
        id: String(row.CommentID || ''),
        text: String(row.CommentText || ''),
        createdBy: String(row.CreatedBy || ''),
        createdAt: row.CreatedAt,
        type: 'COMMENT',
        visibility: 'INTERNAL'
      });
    });
  }

  // Backward compatibility: notes written by updateStatus are already persisted.
  getSheetObjects_(getSheet_('StatusHistory')).forEach(function (row) {
    const id = String(row.SubmissionID || '');
    const text = String(row.Note || '').trim();
    const actor = String(row.ChangedBy || '');
    if (!wanted[id] || !text || actor.toUpperCase() === 'SYSTEM') return;
    map[id].push({
      id: 'status:' + String(row.HistoryID || ''),
      text: text,
      createdBy: actor,
      createdAt: row.ChangedAt,
      type: 'STATUS_NOTE',
      relatedStatus: String(row.NewStatus || ''),
      visibility: 'INTERNAL'
    });
  });

  Object.keys(map).forEach(function (id) {
    map[id].sort(function (a, b) {
      return toDateValue_(b.createdAt) - toDateValue_(a.createdAt);
    });
  });
  return map;
}

/** Appends an internal comment without mutating the PTC workflow status. */
function addSubmissionComment_(payload, requestId) {
  requireFields_(payload, ['submissionId'], 'payload');
  const comment = String(payload.comment || '').trim();
  if (!comment) throw appError_('COMMENT_REQUIRED', 'กรุณากรอก Comment');
  if (comment.length > APP.MAX_COMMENT_LENGTH) {
    throw appError_('COMMENT_TOO_LONG', 'Comment ยาวเกิน ' + APP.MAX_COMMENT_LENGTH + ' ตัวอักษร');
  }
  // The API router must set __actorEmail from requireAdmin_(), not user input.
  const actor = String(payload.__actorEmail || '').trim();
  if (!actor) throw appError_('ADMIN_AUTH_REQUIRED', 'กรุณา Login ด้วยบัญชี Admin');

  const lock = LockService.getScriptLock();
  lock.waitLock(APP.LOCK_TIMEOUT_MS);
  try {
    const submission = findFirstObject_(getSheet_('Submissions'), 'SubmissionID', payload.submissionId);
    if (!submission) throw appError_('SUBMISSION_NOT_FOUND', 'ไม่พบคำขอ');
    const sheet = getSheet_('SubmissionComments');
    const now = new Date();
    const commentId = Utilities.getUuid();
    appendObject_(sheet, {
      CommentID: commentId,
      SubmissionID: String(payload.submissionId),
      CommentText: comment,
      CreatedBy: actor,
      CreatedAt: now,
      Visibility: 'INTERNAL',
      IsActive: true
    });
    auditLog_(actor, 'addSubmissionComment', 'Submission', payload.submissionId, requestId, {
      commentId: commentId
    });
    return {
      id: commentId, text: comment, type: 'COMMENT',
      createdBy: actor, createdAt: now.toISOString(), visibility: 'INTERNAL'
    };
  } finally {
    lock.releaseLock();
  }
}
