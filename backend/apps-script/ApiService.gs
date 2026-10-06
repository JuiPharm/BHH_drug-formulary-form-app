/**
 * REST-like single endpoint router.
 */
function routeApiRequest_(request, event) {
  const requestId = request && request.requestId ? String(request.requestId) : Utilities.getUuid();
  const action = request && request.action ? String(request.action) : 'health';
  const payload = request && request.payload ? request.payload : {};
  try {
    let data;
    switch (action) {
      case 'health':
        data = {
          app: APP.NAME,
          version: APP.VERSION,
          status: 'ok',
          setupComplete: Boolean(PropertiesService.getScriptProperties().getProperty(PROP_KEYS.SETUP_AT))
        };
        break;
      case 'getPublicConfig':
        data = getPublicConfig_();
        break;
      case 'getAdminPublicConfig':
        data = getAdminPublicConfig_();
        break;
      case 'adminLogin':
        data = adminLogin_(payload, requestId);
        break;
      case 'adminLogout':
        data = adminLogout_(request);
        break;
      case 'getAdminProfile':
        data = getAdminProfile_(request);
        break;
      case 'changeAdminPassword':
        data = changeAdminPassword_(request, payload, requestId);
        break;
      case 'getAdminDashboardSummary':
        requireAdmin_(request);
        data = getAdminDashboardSummary_();
        break;
      case 'listPublicTemplates':
        data = listPublicTemplates_();
        break;
      case 'downloadPublicTemplate':
        data = downloadPublicTemplate_(payload);
        break;
      case 'checkDuplicate':
        data = checkDuplicate_(payload);
        break;
      case 'submitApplication':
        data = submitApplication_(payload, requestId);
        break;
      case 'uploadSignedPhysicianForm':
        data = uploadSignedPhysicianForm_(payload, requestId);
        break;
      case 'adminUploadSignedPhysicianForm': {
        const admin = requireAdmin_(request);
        payload.__actorEmail = admin.email;
        data = adminUploadSignedPhysicianForm_(payload, requestId);
        break;
      }
      case 'getSubmissionStatus':
        data = getSubmissionStatus_(payload);
        break;
      case 'downloadGeneratedPdf':
        data = downloadGeneratedPdf_(payload);
        break;
      case 'retryGeneratePdf': {
        const admin = requireAdmin_(request);
        payload.__actorEmail = admin.email;
        data = retryGeneratePdf_(payload, requestId);
        break;
      }
      case 'listSubmissions':
        requireAdmin_(request);
        data = listSubmissions_(payload);
        break;
      case 'getSubmissionDetail':
        requireAdmin_(request);
        data = getSubmissionDetail_(payload);
        break;
      case 'downloadAdminDocument':
        requireAdmin_(request);
        data = downloadAdminDocument_(payload);
        break;
      case 'updateStatus': {
        const admin = requireAdmin_(request);
        payload.__actorEmail = admin.email;
        data = updateSubmissionStatus_(payload, requestId);
        break;
      }
      default:
        throw appError_('UNKNOWN_ACTION', 'ไม่รองรับ action: ' + action);
    }
    const actor = request && request.__admin ? request.__admin.email : getActorEmail_();
    auditLog_(actor, action, 'API', payload.submissionId || '', requestId, {
      success: true
    });
    return jsonResponse_({
      success: true,
      requestId: requestId,
      data: data,
      error: null,
      serverTime: nowIso_()
    });
  } catch (error) {
    const normalized = normalizeError_(error);
    try {
      const actor = request && request.__admin ? request.__admin.email : getActorEmail_();
      auditLog_(actor, action, 'API', payload.submissionId || '', requestId, {
        success: false,
        error: normalized
      });
    } catch (ignore) {
      // Logging must not hide the original error.
    }
    return jsonResponse_({
      success: false,
      requestId: requestId,
      data: null,
      error: normalized,
      serverTime: nowIso_()
    });
  }
}
function parsePostRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('ไม่พบ request body');
  }
  const body = JSON.parse(e.postData.contents);
  if (!body || typeof body !== 'object') {
    throw new Error('request body ต้องเป็น JSON object');
  }
  return body;
}
function jsonResponse_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}
function getPublicConfig_() {
  const settings = getSystemSettings_();
  return {
    appName: settings.APP_NAME || APP.NAME,
    appVersion: settings.APP_VERSION || APP.VERSION,
    hospitalName: settings.HOSPITAL_NAME_TH || '',
    documentFormCode: settings.DOCUMENT_FORM_CODE || '',
    documentRevision: settings.DOCUMENT_REVISION || '',
    maximumApprovers: Number(settings.MAX_PHYSICIAN_APPROVERS || APP.MAX_APPROVERS),
    maximumResearchFiles: APP.MAX_RESEARCH_FILES,
    requiredDocumentTypes: REQUIRED_DOCUMENT_TYPES,
    importedProductAdditionalDocumentType: DOCUMENT_TYPE.CERTIFICATE_FREE_SALE,
    rmpOptions: [true, false],
    maximumFileSizeMb: Number(settings.MAX_FILE_SIZE_MB || 10),
    maximumTotalUploadMb: Number(settings.MAX_TOTAL_UPLOAD_MB || 35),
    acceptedExtensionsByDocumentType: DOCUMENT_ACCEPT_RULES,
    companySignedUploadEnabled: String(settings.COMPANY_SIGNED_UPLOAD_ENABLED).toUpperCase() === 'TRUE'
  };
}
function listPublicTemplates_() {
  return getSheetObjects_(getSheet_('PublicTemplates'))
    .filter(function (row) { return toBoolean_(row.IsActive) && String(row.DriveFileID || '').trim(); })
    .sort(function (a, b) { return Number(a.DisplayOrder || 0) - Number(b.DisplayOrder || 0); })
    .map(function (row) {
      return {
        templateKey: row.TemplateKey,
        displayName: row.DisplayName,
        description: row.Description || '',
        mimeType: row.MimeType || ''
      };
    });
}
function downloadPublicTemplate_(payload) {
  requireFields_(payload, ['templateKey'], 'payload');
  const row = findObjects_(getSheet_('PublicTemplates'), function (item) {
    return String(item.TemplateKey) === String(payload.templateKey) && toBoolean_(item.IsActive);
  })[0];
  if (!row || !String(row.DriveFileID || '').trim()) {
    throw appError_('PUBLIC_TEMPLATE_NOT_FOUND', 'ไม่พบเอกสาร Template ที่เปิดใช้งาน');
  }
  const file = DriveApp.getFileById(String(row.DriveFileID));
  const blob = file.getBlob();
  return {
    templateKey: row.TemplateKey,
    fileName: file.getName(),
    mimeType: blob.getContentType() || row.MimeType || 'application/octet-stream',
    base64Data: Utilities.base64Encode(blob.getBytes())
  };
}
