/**
 * Submission orchestration and duplicate prevention.
 */
function submitApplication_(payload, requestId) {
  validateSubmissionPayload_(payload);
  validateSystemReadyForSubmission_();
  const lock = LockService.getScriptLock();
  let lockHeld = false;
  let submissionId = '';
  let submissionNo = '';
  let productKey = '';
  let submissionAccessToken = '';
  let submissionAccessTokenExpiresAt = null;
  let folderTree = null;
  let duplicate = null;
  try {
    // Lock เฉพาะช่วงตรวจ Duplicate และสร้าง Primary record เพื่อลดเวลารอของคำขออื่น
    lock.waitLock(APP.LOCK_TIMEOUT_MS);
    lockHeld = true;
    duplicate = checkDuplicate_({
      brandName: payload.product.brandName,
      strength: payload.product.strength,
      dosageForm: payload.product.dosageForm,
      companyName: payload.company.companyName,
      representativeEmail: payload.representative.email,
      logAttempt: false
    });
    if (duplicate.blocked) {
      logDuplicateAttempt_(payload, duplicate);
      throw appError_('DUPLICATE_BLOCKED', duplicate.message, duplicate);
    }
    const now = new Date();
    submissionId = Utilities.getUuid();
    submissionNo = getNextSubmissionNo_();
    productKey = normalizeProductKey_(
      payload.product.brandName,
      payload.product.strength,
      payload.product.dosageForm
    );
    submissionAccessToken = generateSecureToken_();
    const tokenDays = Number(getSystemSettings_().SUBMISSION_ACCESS_TOKEN_DAYS || 365);
    submissionAccessTokenExpiresAt = new Date(now.getTime() + tokenDays * 24 * 60 * 60 * 1000);
    const companyId = getOrCreateCompany_(payload.company, now);
    const representativeId = getOrCreateRepresentative_(companyId, payload.representative, now);
    folderTree = createSubmissionFolderTree_(submissionNo, payload.product);
    appendObject_(getSheet_('Submissions'), {
      SubmissionID: submissionId,
      SubmissionNo: submissionNo,
      ProductKey: productKey,
      BrandName: payload.product.brandName,
      GenericName: payload.product.genericName,
      Strength: payload.product.strength,
      DosageForm: payload.product.dosageForm,
      CompanyID: companyId,
      RepresentativeID: representativeId,
      CurrentStatus: STATUS.SUBMITTED,
      SubmittedAt: now,
      ChecklistComplete: true,
      RMP: payload.product.rmp,
      IsImportedProduct: Boolean(payload.product.isImportedProduct),
      SignedFormReceived: false,
      IsResubmission: Boolean(duplicate.isResubmission),
      PreviousSubmissionID: duplicate.matchedSubmissionId || '',
      ResubmissionReason: payload.resubmissionReason || '',
      DecisionAt: '',
      RejectReason: '',
      DriveFolderID: folderTree.root.id,
      DriveFolderURL: folderTree.root.url,
      FolderMapJSON: JSON.stringify(folderTree),
      GeneratedPdfFileID: '',
      GeneratedPdfURL: '',
      CombinedPackageVersion: 0,
      SubmissionAccessTokenHash: hashTextSha256_(submissionAccessToken),
      SubmissionAccessTokenExpiresAt: submissionAccessTokenExpiresAt,
      RowVersion: 1,
      CreatedAt: now,
      UpdatedAt: now
    });
    appendProductDetails_(submissionId, payload.product, now);
    appendPhysicianProposal_(submissionId, payload.physicianProposal || {}, now);
    appendApprovers_(submissionId, payload.physicianApprovers || [], now);
    lock.releaseLock();
    lockHeld = false;
    const submission = {
      submissionId: submissionId,
      submissionNo: submissionNo,
      productKey: productKey
    };
    const uploadedDocuments = uploadDocuments_(
      submission,
      payload.documents,
      folderTree,
      payload.representative.email
    );
    appendResearchEvidence_(submissionId, payload.researchEvidence || [], uploadedDocuments, now);
    let pdfResult = null;
    try {
      pdfResult = generateSubmissionPdf_(submissionId, requestId);
      updateSubmissionStatusInternal_(submissionId, STATUS.AWAITING_SIGNATURE, 'SYSTEM', 'สร้าง PDF รอแพทย์ลงนามสำเร็จ');
    } catch (pdfError) {
      updateSubmissionStatusInternal_(submissionId, STATUS.PDF_GENERATION_FAILED, 'SYSTEM', pdfError.message);
      pdfResult = {
        success: false,
        error: normalizeError_(pdfError)
      };
    }
    sendSubmissionEmails_(submissionId, payload, pdfResult, submissionAccessToken);
    return {
      submissionId: submissionId,
      submissionNo: submissionNo,
      productKey: productKey,
      status: pdfResult && pdfResult.success ? STATUS.AWAITING_SIGNATURE : STATUS.PDF_GENERATION_FAILED,
      isResubmission: Boolean(duplicate.isResubmission),
      previousSubmissionId: duplicate.matchedSubmissionId || null,
      driveFolderUrl: folderTree.root.url,
      uploadedDocuments: uploadedDocuments,
      generatedPdf: pdfResult,
      submissionAccessToken: submissionAccessToken,
      submissionAccessTokenExpiresAt: submissionAccessTokenExpiresAt.toISOString()
    };
  } catch (error) {
    if (submissionId) {
      try {
        rollbackSubmission_(submissionId, folderTree, requestId, error);
      } catch (rollbackError) {
        console.error('Rollback failed: ' + rollbackError.message);
      }
    }
    throw error;
  } finally {
    if (lockHeld) {
      lock.releaseLock();
    }
  }
}
function checkDuplicate_(payload) {
  const brandName = String(payload.brandName || '').trim();
  const strength = String(payload.strength || '').trim();
  const dosageForm = String(payload.dosageForm || '').trim();
  requireFields_({ brandName: brandName, strength: strength, dosageForm: dosageForm }, [
    'brandName', 'strength', 'dosageForm'
  ], 'duplicate');
  const productKey = normalizeProductKey_(brandName, strength, dosageForm);
  const rows = findObjects_(getSheet_('Submissions'), function (row) {
    return String(row.ProductKey) === productKey;
  }).sort(function (a, b) {
    return toDateValue_(b.SubmittedAt) - toDateValue_(a.SubmittedAt);
  });
  if (!rows.length) {
    return {
      blocked: false,
      isResubmission: false,
      productKey: productKey,
      message: 'ไม่พบคำขอซ้ำ'
    };
  }
  const latest = rows[0];
  const latestStatus = String(latest.CurrentStatus);
  if (ACTIVE_DUPLICATE_STATUSES.indexOf(latestStatus) !== -1) {
    return {
      blocked: true,
      isResubmission: false,
      productKey: productKey,
      matchedSubmissionId: latest.SubmissionID,
      matchedSubmissionNo: latest.SubmissionNo,
      matchedStatus: latestStatus,
      message: 'พบคำขอของผลิตภัณฑ์นี้อยู่ระหว่างดำเนินการ: ' + latest.SubmissionNo
    };
  }
  if (latestStatus === STATUS.REJECTED) {
    const decisionDate = latest.DecisionAt ? new Date(latest.DecisionAt) : new Date(latest.UpdatedAt);
    const cooldownDays = Number(getSystemSettings_().REJECT_COOLDOWN_DAYS || APP.REJECT_COOLDOWN_DAYS);
    const availableDate = new Date(decisionDate.getTime() + cooldownDays * 24 * 60 * 60 * 1000);
    if (availableDate.getTime() > Date.now()) {
      return {
        blocked: true,
        isResubmission: false,
        productKey: productKey,
        matchedSubmissionId: latest.SubmissionID,
        matchedSubmissionNo: latest.SubmissionNo,
        matchedStatus: latestStatus,
        resubmissionAvailableAt: availableDate.toISOString(),
        message: 'ยังไม่ครบกำหนดเสนอซ้ำ สามารถเสนอใหม่ได้วันที่ ' + formatThaiDate_(availableDate)
      };
    }
  }
  return {
    blocked: false,
    isResubmission: true,
    productKey: productKey,
    matchedSubmissionId: latest.SubmissionID,
    matchedSubmissionNo: latest.SubmissionNo,
    matchedStatus: latestStatus,
    message: 'อนุญาตให้เสนอซ้ำและเชื่อมโยงคำขอเดิม'
  };
}
function logDuplicateAttempt_(payload, duplicate) {
  appendObject_(getSheet_('DuplicateAttempts'), {
    AttemptID: Utilities.getUuid(),
    ProductKey: duplicate.productKey,
    BrandName: payload.product.brandName,
    Strength: payload.product.strength,
    DosageForm: payload.product.dosageForm,
    CompanyName: payload.company.companyName,
    RepresentativeEmail: payload.representative.email,
    MatchedSubmissionID: duplicate.matchedSubmissionId || '',
    MatchedStatus: duplicate.matchedStatus || '',
    AttemptedAt: new Date(),
    Reason: duplicate.message
  });
}
function getOrCreateCompany_(company, now) {
  const sheet = getSheet_('Companies');
  const normalizedEmail = String(company.companyEmail).trim().toLowerCase();
  const existing = findObjects_(sheet, function (row) {
    return String(row.CompanyEmail).trim().toLowerCase() === normalizedEmail &&
      normalizeText_(row.CompanyName) === normalizeText_(company.companyName);
  })[0];
  if (existing) {
    updateRowByNumber_(sheet, existing.__rowNumber, {
      CompanyAddress: company.companyAddress || existing.CompanyAddress,
      CompanyPhone: company.companyPhone,
      CompanyPhoneExtension: company.companyPhoneExtension || '',
      IsActive: true,
      UpdatedAt: now
    });
    return existing.CompanyID;
  }
  const companyId = Utilities.getUuid();
  appendObject_(sheet, {
    CompanyID: companyId,
    CompanyName: company.companyName,
    CompanyAddress: company.companyAddress || '',
    CompanyEmail: normalizedEmail,
    CompanyPhone: company.companyPhone,
    CompanyPhoneExtension: company.companyPhoneExtension || '',
    IsActive: true,
    CreatedAt: now,
    UpdatedAt: now
  });
  return companyId;
}
function getOrCreateRepresentative_(companyId, representative, now) {
  const sheet = getSheet_('Representatives');
  const normalizedEmail = String(representative.email).trim().toLowerCase();
  const existing = findObjects_(sheet, function (row) {
    return String(row.CompanyID) === String(companyId) &&
      String(row.Email).trim().toLowerCase() === normalizedEmail;
  })[0];
  if (existing) {
    updateRowByNumber_(sheet, existing.__rowNumber, {
      RepresentativeName: representative.name,
      Position: representative.position,
      Phone: representative.phone,
      AlternatePhone: representative.alternatePhone || '',
      IsPrimaryContact: true,
      IsActive: true,
      UpdatedAt: now
    });
    return existing.RepresentativeID;
  }
  const representativeId = Utilities.getUuid();
  appendObject_(sheet, {
    RepresentativeID: representativeId,
    CompanyID: companyId,
    RepresentativeName: representative.name,
    Position: representative.position,
    Email: normalizedEmail,
    Phone: representative.phone,
    AlternatePhone: representative.alternatePhone || '',
    IsPrimaryContact: true,
    IsActive: true,
    CreatedAt: now,
    UpdatedAt: now
  });
  return representativeId;
}
function appendProductDetails_(submissionId, product, now) {
  appendObject_(getSheet_('ProductDetails'), {
    SubmissionID: submissionId,
    ManufacturerName: product.manufacturerName,
    CountryOfManufacture: product.countryOfManufacture,
    ThailandDistributor: product.thailandDistributor,
    Classification: product.classification,
    ChemicalComposition: product.chemicalComposition,
    UnitQuantity: product.unitQuantity,
    ShelfLife: product.shelfLife,
    Indication: product.indication,
    PharmacologicalAction: product.pharmacologicalAction,
    SideEffects: product.sideEffects,
    Contraindications: product.contraindications,
    Dosage: product.dosage,
    DrugInteraction: product.drugInteraction,
    PregnancyLactation: product.pregnancyLactation,
    PediatricGeriatricUse: product.pediatricGeriatricUse,
    HepaticRenalDoseAdjustment: product.hepaticRenalDoseAdjustment,
    TabletCrushingSplitting: product.tabletCrushingSplitting || '',
    StabilityAfterReconstitution: product.stabilityAfterReconstitution || '',
    OtherClinicalInformation: product.otherClinicalInformation || '',
    Storage: product.storage,
    RMP: product.rmp,
    ComparableExistingDrug: product.comparableExistingDrug || '',
    ComparativeAdvantage: product.comparativeAdvantage,
    CostPerCourse: product.costPerCourse || '',
    ProposedPrice: product.proposedPrice || '',
    SampleQuantity: product.sampleQuantity || '',
    CreatedAt: now,
    UpdatedAt: now
  });
}
function appendPhysicianProposal_(submissionId, physician, now) {
  const structured = physician.proposalReasonStructured && typeof physician.proposalReasonStructured === 'object'
    ? physician.proposalReasonStructured
    : null;
  const fallbackToOther = !structured && Boolean(String(physician.proposalReason || '').trim());
  appendObject_(getSheet_('PhysicianProposals'), {
    SubmissionID: submissionId,
    PhysicianName: physician.name || '',
    ProfessionalTitle: physician.professionalTitle || '',
    Department: physician.department || '',
    Specialty: physician.specialty || '',
    PhysicianPhone: physician.phone || '',
    Urgency: physician.urgency || '',
    UrgencyDuration: physician.urgencyDuration || '',
    UrgencyAmount: physician.urgencyAmount || '',
    UrgencyUnit: physician.urgencyUnit || '',
    ProposalReason: physician.proposalReason || '',
    ProposalReasonNoAlternative: structured ? toBoolean_(structured.noAlternative) : false,
    ProposalReasonSafer: structured ? toBoolean_(structured.safer) : false,
    ProposalReasonSafetyDetail: structured ? String(structured.safetyDetail || '').trim() : '',
    ProposalReasonCostEffective: structured ? toBoolean_(structured.costEffective) : false,
    ProposalReasonComparisonDrug: structured ? String(structured.comparisonDrug || '').trim() : '',
    ProposalReasonOther: structured ? toBoolean_(structured.other) : fallbackToOther,
    ProposalReasonOtherDetail: structured
      ? String(structured.otherDetail || '').trim()
      : (fallbackToOther ? String(physician.proposalReason || '').trim() : ''),
    UseRestrictionRequired: physician.useRestrictionRequired === undefined
      ? ''
      : toBoolean_(physician.useRestrictionRequired),
    RestrictedSpecialty: physician.restrictedSpecialty || '',
    DrugToRemove: physician.drugToRemove || '',
    ImpactIfNotApproved: physician.impactIfNotApproved || '',
    CreatedAt: now,
    UpdatedAt: now
  });
}
function appendApprovers_(submissionId, approvers, now) {
  const rows = approvers.slice(0, APP.MAX_APPROVERS).map(function (approver, index) {
    return {
      ApproverID: Utilities.getUuid(),
      SubmissionID: submissionId,
      SequenceNo: index + 1,
      ApproverName: approver.name,
      ProfessionalTitle: approver.professionalTitle || '',
      Department: approver.department || '',
      Specialty: approver.specialty || '',
      CreatedAt: now,
      UpdatedAt: now,
      IsActive: true
    };
  });
  appendObjects_(getSheet_('PhysicianApprovers'), rows);
}
function appendResearchEvidence_(submissionId, metadata, uploadedDocuments, now) {
  if (!metadata.length) {
    return;
  }
  const researchDocuments = uploadedDocuments.filter(function (document) {
    return document.documentType === DOCUMENT_TYPE.RESEARCH_EVIDENCE;
  });
  const currentYear = Number(Utilities.formatDate(now, APP.TIMEZONE, 'yyyy'));
  const rows = metadata.map(function (item, index) {
    const year = Number(item.publicationYear);
    return {
      EvidenceID: Utilities.getUuid(),
      SubmissionID: submissionId,
      DocumentID: researchDocuments[index] ? researchDocuments[index].documentId : '',
      Title: item.title,
      Journal: item.journal || '',
      PublicationYear: year,
      StudyType: item.studyType || '',
      DOI: item.doi || '',
      PMID: item.pmid || '',
      IsLandmarkStudy: Boolean(item.isLandmarkStudy),
      IsOlderThanFiveYears: currentYear - year > 5,
      OlderEvidenceJustification: item.olderEvidenceJustification || '',
      CreatedAt: now,
      UpdatedAt: now
    };
  });
  appendObjects_(getSheet_('ResearchEvidence'), rows);
}
function rollbackSubmission_(submissionId, folderTree, requestId, originalError) {
  const sheetNames = [
    'ResearchEvidence', 'Documents', 'GeneratedDocuments', 'PhysicianApprovers',
    'PhysicianProposals', 'ProductDetails', 'StatusHistory', 'Submissions'
  ];
  sheetNames.forEach(function (sheetName) {
    deleteRowsByField_(getSheet_(sheetName), 'SubmissionID', submissionId);
  });
  if (folderTree && folderTree.root && folderTree.root.id) {
    try {
      DriveApp.getFolderById(folderTree.root.id).setTrashed(true);
    } catch (ignore) {
      // Folder may already have been removed.
    }
  }
  auditLog_('SYSTEM', 'rollbackSubmission', 'Submission', submissionId, requestId, {
    originalError: normalizeError_(originalError)
  });
}
function getSubmissionStatus_(payload) {
  const submissionId = String(payload.submissionId || '');
  const submissionNo = String(payload.submissionNo || '');
  if (!submissionId && !submissionNo) {
    throw appError_('SUBMISSION_IDENTIFIER_REQUIRED', 'ต้องระบุ submissionId หรือ submissionNo');
  }
  const row = submissionId
    ? findFirstObject_(getSheet_('Submissions'), 'SubmissionID', submissionId)
    : findFirstObject_(getSheet_('Submissions'), 'SubmissionNo', submissionNo);
  if (!row) {
    throw appError_('SUBMISSION_NOT_FOUND', 'ไม่พบคำขอ');
  }
  verifySubmissionAccessToken_(row, payload.submissionAccessToken);
  return {
    submissionId: row.SubmissionID,
    submissionNo: row.SubmissionNo,
    brandName: row.BrandName,
    genericName: row.GenericName,
    strength: row.Strength,
    dosageForm: row.DosageForm,
    currentStatus: row.CurrentStatus,
    submittedAt: row.SubmittedAt,
    signedFormReceived: toBoolean_(row.SignedFormReceived),
    generatedPdfAvailable: Boolean(row.GeneratedPdfFileID),
    updatedAt: row.UpdatedAt
  };
}
function downloadGeneratedPdf_(payload) {
  requireFields_(payload, ['submissionId', 'submissionAccessToken'], 'payload');
  const row = findFirstObject_(getSheet_('Submissions'), 'SubmissionID', payload.submissionId);
  if (!row) {
    throw appError_('SUBMISSION_NOT_FOUND', 'ไม่พบคำขอ');
  }
  verifySubmissionAccessToken_(row, payload.submissionAccessToken);
  if (!row.GeneratedPdfFileID) {
    throw appError_('PDF_NOT_AVAILABLE', 'ยังไม่มี PDF สำหรับคำขอนี้');
  }
  const file = DriveApp.getFileById(String(row.GeneratedPdfFileID));
  const blob = file.getBlob();
  return {
    fileName: file.getName(),
    mimeType: blob.getContentType() || MimeType.PDF,
    base64Data: Utilities.base64Encode(blob.getBytes())
  };
}
function verifySubmissionAccessToken_(submission, rawToken) {
  if (!String(rawToken || '').trim()) {
    throw appError_('ACCESS_TOKEN_REQUIRED', 'ต้องระบุ submissionAccessToken');
  }
  const expiresAt = submission.SubmissionAccessTokenExpiresAt
    ? new Date(submission.SubmissionAccessTokenExpiresAt)
    : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
    throw appError_('ACCESS_TOKEN_EXPIRED', 'submissionAccessToken หมดอายุ');
  }
  const suppliedHash = hashTextSha256_(String(rawToken));
  if (!constantTimeEqual_(suppliedHash, String(submission.SubmissionAccessTokenHash || ''))) {
    throw appError_('INVALID_ACCESS_TOKEN', 'submissionAccessToken ไม่ถูกต้อง');
  }
}
function uploadSignedPhysicianForm_(payload, requestId) {
  const settings = getSystemSettings_();
  if (String(settings.COMPANY_SIGNED_UPLOAD_ENABLED).toUpperCase() !== 'TRUE') {
    throw appError_('COMPANY_SIGNED_UPLOAD_DISABLED', 'ระบบกำหนดให้เจ้าหน้าที่เป็นผู้อัปโหลดแบบฟอร์มที่ลงนามแล้ว');
  }
  requireFields_(payload, ['submissionId', 'fileName', 'mimeType', 'base64Data'], 'payload');
  const submission = findFirstObject_(getSheet_('Submissions'), 'SubmissionID', payload.submissionId);
  if (!submission) {
    throw appError_('SUBMISSION_NOT_FOUND', 'ไม่พบคำขอ');
  }
  verifySubmissionAccessToken_(submission, payload.submissionAccessToken);
  const uploaded = uploadSignedFile_(submission, payload, payload.uploadedBy || 'COMPANY');
  updateFirstMatch_(getSheet_('Submissions'), 'SubmissionID', payload.submissionId, {
    SignedFormReceived: true,
    CurrentStatus: STATUS.DOCUMENT_REVIEW,
    RowVersion: Number(submission.RowVersion || 1) + 1,
    UpdatedAt: new Date()
  });
  appendStatusHistory_(payload.submissionId, submission.CurrentStatus, STATUS.DOCUMENT_REVIEW, payload.uploadedBy || 'COMPANY', 'อัปโหลดแบบฟอร์มแพทย์ลงนามแล้ว');
  auditLog_(payload.uploadedBy || 'COMPANY', 'uploadSignedPhysicianForm', 'Submission', payload.submissionId, requestId, uploaded);
  return uploaded;
}
function updateSubmissionStatusInternal_(submissionId, newStatus, changedBy, note) {
  const sheet = getSheet_('Submissions');
  const row = findFirstObject_(sheet, 'SubmissionID', submissionId);
  if (!row) {
    throw appError_('SUBMISSION_NOT_FOUND', 'ไม่พบคำขอ');
  }
  updateRowByNumber_(sheet, row.__rowNumber, {
    CurrentStatus: newStatus,
    RowVersion: Number(row.RowVersion || 1) + 1,
    UpdatedAt: new Date()
  });
  appendStatusHistory_(submissionId, row.CurrentStatus, newStatus, changedBy, note);
}
function appendStatusHistory_(submissionId, previousStatus, newStatus, changedBy, note) {
  appendObject_(getSheet_('StatusHistory'), {
    HistoryID: Utilities.getUuid(),
    SubmissionID: submissionId,
    PreviousStatus: previousStatus || '',
    NewStatus: newStatus,
    ChangedBy: changedBy,
    ChangedAt: new Date(),
    Note: note || ''
  });
}
function adminUploadSignedPhysicianForm_(payload, requestId) {
  requireFields_(payload, ['submissionId', 'fileName', 'mimeType', 'base64Data'], 'payload');
  const submission = findFirstObject_(getSheet_('Submissions'), 'SubmissionID', payload.submissionId);
  if (!submission) {
    throw appError_('SUBMISSION_NOT_FOUND', 'ไม่พบคำขอ');
  }
  const actor = payload.__actorEmail || getActorEmail_();
  const uploaded = uploadSignedFile_(submission, payload, actor);
  const statusesToReview = [STATUS.AWAITING_SIGNATURE, STATUS.INCOMPLETE_DOCUMENTS, STATUS.PDF_GENERATION_FAILED, STATUS.SUBMITTED];
  const nextStatus = statusesToReview.indexOf(String(submission.CurrentStatus)) !== -1
    ? STATUS.DOCUMENT_REVIEW
    : String(submission.CurrentStatus);
  updateFirstMatch_(getSheet_('Submissions'), 'SubmissionID', payload.submissionId, {
    SignedFormReceived: true,
    CurrentStatus: nextStatus,
    RowVersion: Number(submission.RowVersion || 1) + 1,
    UpdatedAt: new Date()
  });
  if (nextStatus !== String(submission.CurrentStatus)) {
    appendStatusHistory_(payload.submissionId, submission.CurrentStatus, nextStatus, actor, 'Admin อัปโหลดแบบฟอร์มแพทย์ลงนามแล้ว');
  }
  auditLog_(actor, 'adminUploadSignedPhysicianForm', 'Submission', payload.submissionId, requestId, uploaded);
  return {
    submissionId: payload.submissionId,
    currentStatus: nextStatus,
    signedFormReceived: true,
    document: uploaded
  };
}
