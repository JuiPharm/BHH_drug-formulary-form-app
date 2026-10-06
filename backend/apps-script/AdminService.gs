/**
 * Admin dashboard APIs.
 * Authentication is handled by AuthService.gs.
 */
function getAdminDashboardSummary_() {
  const rows = getSheetObjects_(getSheet_('Submissions'));
  const byStatus = {};
  rows.forEach(function (row) {
    const status = String(row.CurrentStatus || 'UNKNOWN');
    byStatus[status] = Number(byStatus[status] || 0) + 1;
  });
  const signedCount = rows.filter(function (row) {
    return toBoolean_(row.SignedFormReceived);
  }).length;
  const awaitingSignature = Number(byStatus[STATUS.AWAITING_SIGNATURE] || 0);
  const documentReview = Number(byStatus[STATUS.DOCUMENT_REVIEW] || 0);
  return {
    totalSubmissions: rows.length,
    signedFormReceived: signedCount,
    awaitingSignature: awaitingSignature,
    documentReview: documentReview,
    byStatus: byStatus,
    generatedAt: nowIso_()
  };
}
function listSubmissions_(payload) {
  payload = payload || {};
  const rows = getSheetObjects_(getSheet_('Submissions'));
  const status = String(payload.status || '').trim();
  const search = normalizeText_(payload.search || '');
  const limit = Math.min(Math.max(Number(payload.limit || 100), 1), 500);
  const offset = Math.max(Number(payload.offset || 0), 0);
  const filtered = rows.filter(function (row) {
    if (status && String(row.CurrentStatus) !== status) return false;
    if (search) {
      const haystack = normalizeText_([
        row.SubmissionNo, row.BrandName, row.GenericName,
        row.Strength, row.DosageForm, row.CurrentStatus
      ].join(' '));
      if (haystack.indexOf(search) === -1) return false;
    }
    return true;
  }).sort(function (a, b) {
    return toDateValue_(b.SubmittedAt) - toDateValue_(a.SubmittedAt);
  });
  return {
    total: filtered.length,
    offset: offset,
    limit: limit,
    items: filtered.slice(offset, offset + limit).map(sanitizeSubmissionSummary_)
  };
}
function sanitizeSubmissionSummary_(row) {
  return {
    submissionId: row.SubmissionID,
    submissionNo: row.SubmissionNo,
    brandName: row.BrandName,
    genericName: row.GenericName,
    strength: row.Strength,
    dosageForm: row.DosageForm,
    currentStatus: row.CurrentStatus,
    submittedAt: row.SubmittedAt,
    checklistComplete: toBoolean_(row.ChecklistComplete),
    rmp: toBoolean_(row.RMP),
    isImportedProduct: toBoolean_(row.IsImportedProduct),
    signedFormReceived: toBoolean_(row.SignedFormReceived),
    generatedPdfAvailable: Boolean(row.GeneratedPdfFileID),
    driveFolderUrl: row.DriveFolderURL || '',
    updatedAt: row.UpdatedAt
  };
}
function getSubmissionDetail_(payload) {
  requireFields_(payload, ['submissionId'], 'payload');
  const context = getSubmissionContext_(payload.submissionId);
  const documents = findObjects_(getSheet_('Documents'), function (row) {
    return String(row.SubmissionID) === String(payload.submissionId);
  }).sort(function (a, b) {
    const typeCompare = String(a.DocumentType).localeCompare(String(b.DocumentType));
    if (typeCompare !== 0) return typeCompare;
    return Number(b.DocumentVersion || 0) - Number(a.DocumentVersion || 0);
  });
  const statusHistory = findObjects_(getSheet_('StatusHistory'), function (row) {
    return String(row.SubmissionID) === String(payload.submissionId);
  }).sort(function (a, b) {
    return toDateValue_(b.ChangedAt) - toDateValue_(a.ChangedAt);
  });
  const research = findObjects_(getSheet_('ResearchEvidence'), function (row) {
    return String(row.SubmissionID) === String(payload.submissionId);
  });
  return {
    submission: sanitizeSubmissionDetail_(context.submission),
    product: sanitizeObject_(context.product),
    company: sanitizeObject_(context.company),
    representative: sanitizeObject_(context.representative),
    physician: sanitizeObject_(context.physician),
    approvers: context.approvers.map(sanitizeObject_),
    documents: documents.map(sanitizeDocument_),
    statusHistory: statusHistory.map(sanitizeObject_),
    researchEvidence: research.map(sanitizeObject_)
  };
}
function sanitizeSubmissionDetail_(row) {
  const safe = sanitizeObject_(row);
  delete safe.SubmissionAccessTokenHash;
  delete safe.SubmissionAccessTokenExpiresAt;
  delete safe.FolderMapJSON;
  return safe;
}
function sanitizeObject_(object) {
  const safe = {};
  Object.keys(object || {}).forEach(function (key) {
    if (key !== '__rowNumber') safe[key] = object[key];
  });
  return safe;
}
function sanitizeDocument_(row) {
  return {
    documentId: row.DocumentID,
    submissionId: row.SubmissionID,
    documentType: row.DocumentType,
    documentVersion: Number(row.DocumentVersion || 0),
    originalFileName: row.OriginalFileName,
    storedFileName: row.StoredFileName,
    mimeType: row.MimeType,
    fileSizeBytes: Number(row.FileSizeBytes || 0),
    driveFileUrl: row.DriveFileURL || '',
    uploadedBy: row.UploadedBy,
    uploadedAt: row.UploadedAt,
    reviewStatus: row.ReviewStatus,
    reviewNote: row.ReviewNote,
    isCurrentVersion: toBoolean_(row.IsCurrentVersion)
  };
}
function downloadAdminDocument_(payload) {
  requireFields_(payload, ['documentId'], 'payload');
  const documentRow = findFirstObject_(getSheet_('Documents'), 'DocumentID', payload.documentId);
  if (!documentRow || !documentRow.DriveFileID) {
    throw appError_('ADMIN_DOCUMENT_NOT_FOUND', 'ไม่พบเอกสารที่ต้องการดาวน์โหลด');
  }
  const file = DriveApp.getFileById(String(documentRow.DriveFileID));
  const blob = file.getBlob();
  return {
    documentId: documentRow.DocumentID,
    submissionId: documentRow.SubmissionID,
    fileName: file.getName(),
    mimeType: blob.getContentType() || documentRow.MimeType || 'application/octet-stream',
    base64Data: Utilities.base64Encode(blob.getBytes())
  };
}
function updateSubmissionStatus_(payload, requestId) {
  requireFields_(payload, ['submissionId', 'newStatus'], 'payload');
  const allowedStatuses = Object.keys(STATUS).map(function (key) { return STATUS[key]; });
  if (allowedStatuses.indexOf(payload.newStatus) === -1) {
    throw appError_('INVALID_STATUS', 'สถานะไม่ถูกต้อง');
  }
  if (payload.newStatus === STATUS.REJECTED && !String(payload.rejectReason || '').trim()) {
    throw appError_('REJECT_REASON_REQUIRED', 'กรุณากรอกเหตุผลที่ไม่ผ่าน');
  }
  const sheet = getSheet_('Submissions');
  const row = findFirstObject_(sheet, 'SubmissionID', payload.submissionId);
  if (!row) {
    throw appError_('SUBMISSION_NOT_FOUND', 'ไม่พบคำขอ');
  }
  const now = new Date();
  const updates = {
    CurrentStatus: payload.newStatus,
    RowVersion: Number(row.RowVersion || 1) + 1,
    UpdatedAt: now
  };
  if ([STATUS.APPROVED, STATUS.REJECTED, STATUS.DEFERRED].indexOf(payload.newStatus) !== -1) {
    updates.DecisionAt = now;
  }
  if (payload.newStatus === STATUS.REJECTED) {
    updates.RejectReason = payload.rejectReason;
  }
  updateRowByNumber_(sheet, row.__rowNumber, updates);
  const actor = payload.__actorEmail || getActorEmail_();
  appendStatusHistory_(payload.submissionId, row.CurrentStatus, payload.newStatus, actor, payload.note || payload.rejectReason || '');
  auditLog_(actor, 'updateStatus', 'Submission', payload.submissionId, requestId, updates);
  return {
    submissionId: payload.submissionId,
    previousStatus: row.CurrentStatus,
    currentStatus: payload.newStatus,
    updatedAt: now.toISOString()
  };
}
