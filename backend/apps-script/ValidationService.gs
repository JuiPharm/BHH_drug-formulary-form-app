/**
 * Input and business validation.
 */
function validateSubmissionPayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw appError_('INVALID_PAYLOAD', 'payload ต้องเป็น object');
  }
  const company = payload.company || {};
  const representative = payload.representative || {};
  const product = payload.product || {};
  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  const approvers = Array.isArray(payload.physicianApprovers) ? payload.physicianApprovers : [];
  const physician = payload.physicianProposal;
  requireFields_(company, [
    'companyName', 'companyEmail', 'companyPhone'
  ], 'company');
  requireFields_(representative, [
    'name', 'position', 'email', 'phone'
  ], 'representative');
  requireFields_(product, [
    'brandName', 'genericName', 'strength', 'dosageForm',
    'manufacturerName', 'countryOfManufacture', 'thailandDistributor',
    'classification', 'chemicalComposition', 'unitQuantity', 'shelfLife',
    'indication', 'pharmacologicalAction', 'sideEffects', 'contraindications',
    'dosage', 'drugInteraction', 'pregnancyLactation',
    'pediatricGeriatricUse', 'hepaticRenalDoseAdjustment', 'storage',
    'comparativeAdvantage'
  ], 'product');
  if (typeof product.rmp !== 'boolean') {
    throw appError_('RMP_REQUIRED', 'RMP ต้องเลือก Yes หรือ No');
  }
  if (!isValidEmail_(company.companyEmail)) {
    throw appError_('INVALID_COMPANY_EMAIL', 'รูปแบบ E-mail บริษัทไม่ถูกต้อง');
  }
  if (!isValidEmail_(representative.email)) {
    throw appError_('INVALID_REPRESENTATIVE_EMAIL', 'รูปแบบ E-mail ผู้แทนไม่ถูกต้อง');
  }
  if (!normalizePhone_(company.companyPhone)) {
    throw appError_('INVALID_COMPANY_PHONE', 'กรุณากรอกเบอร์โทรศัพท์บริษัท');
  }
  if (!normalizePhone_(representative.phone)) {
    throw appError_('INVALID_REPRESENTATIVE_PHONE', 'กรุณากรอกเบอร์โทรศัพท์ผู้แทน');
  }
  validatePhysicianProposal_(physician);
  if (approvers.length > APP.MAX_APPROVERS) {
    throw appError_('TOO_MANY_APPROVERS', 'ผู้เห็นชอบได้สูงสุด ' + APP.MAX_APPROVERS + ' คน');
  }
  approvers.forEach(function (approver, index) {
    if (!approver || !String(approver.name || '').trim()) {
      throw appError_('INVALID_APPROVER', 'ผู้เห็นชอบลำดับ ' + (index + 1) + ' ต้องมีชื่อเมื่อเพิ่มรายการ');
    }
  });
  validateDocumentChecklist_(documents, Boolean(product.isImportedProduct));
  validateResearchEvidence_(payload.researchEvidence || [], documents);
  return true;
}
function validatePhysicianProposal_(physician) {
  if (!physician || typeof physician !== 'object' || Array.isArray(physician)) {
    throw appError_('PHYSICIAN_PROPOSAL_REQUIRED', 'กรุณากรอกข้อมูลแพทย์ผู้เสนอให้ครบถ้วน');
  }
  requireFields_(physician, [
    'name', 'professionalTitle', 'department', 'specialty',
    'urgency', 'urgencyDuration', 'proposalReason'
  ], 'physicianProposal');
  const urgency = String(physician.urgency || '').trim();
  const urgencyDuration = String(physician.urgencyDuration || '').trim();
  if (['URGENT', 'NON_URGENT'].indexOf(urgency) === -1) {
    throw appError_(
      'INVALID_PHYSICIAN_URGENCY',
      'ความเร่งด่วนของแพทย์ผู้เสนอต้องเป็น URGENT หรือ NON_URGENT'
    );
  }
  if (urgency === 'NON_URGENT' && urgencyDuration !== APP.NON_URGENT_PTC_DURATION) {
    throw appError_(
      'INVALID_NON_URGENT_DURATION',
      'กรณีไม่เร่งด่วน ระยะเวลาต้องเป็น "' + APP.NON_URGENT_PTC_DURATION + '"'
    );
  }
  if (urgency === 'URGENT') {
    const amount = Number(physician.urgencyAmount);
    const unit = String(physician.urgencyUnit || '').trim();
    if (!Number.isFinite(amount) || amount <= 0 || Math.floor(amount) !== amount) {
      throw appError_('INVALID_URGENT_AMOUNT', 'กรณีเร่งด่วนต้องระบุจำนวนเวลาเป็นจำนวนเต็มมากกว่า 0');
    }
    if (['HOURS', 'DAYS'].indexOf(unit) === -1) {
      throw appError_('INVALID_URGENT_UNIT', 'กรณีเร่งด่วนต้องเลือกหน่วย HOURS หรือ DAYS');
    }
    const expectedDuration = 'ภายใน ' + amount + ' ' + (unit === 'DAYS' ? 'วัน' : 'ชั่วโมง');
    if (urgencyDuration !== expectedDuration) {
      throw appError_('INVALID_URGENT_DURATION', 'ระยะเวลาเร่งด่วนไม่ตรงกับจำนวนและหน่วยที่ระบุ');
    }
  }
  if (typeof physician.useRestrictionRequired !== 'boolean') {
    throw appError_('USE_RESTRICTION_REQUIRED', 'กรุณาเลือกว่าจะจำกัดการสั่งใช้เฉพาะแพทย์หรือไม่');
  }
  if (physician.useRestrictionRequired && !String(physician.restrictedSpecialty || '').trim()) {
    throw appError_('RESTRICTED_SPECIALTY_REQUIRED', 'กรุณาระบุสาขาแพทย์เมื่อเลือกจำกัดการสั่งใช้');
  }
  const structured = physician.proposalReasonStructured;
  if (structured !== undefined && structured !== null) {
    if (typeof structured !== 'object' || Array.isArray(structured)) {
      throw appError_('INVALID_PROPOSAL_REASON_STRUCTURE', 'proposalReasonStructured ต้องเป็น object');
    }
    const selected = [
      toBoolean_(structured.noAlternative),
      toBoolean_(structured.safer),
      toBoolean_(structured.costEffective),
      toBoolean_(structured.other)
    ];
    if (!selected.some(Boolean)) {
      throw appError_('PROPOSAL_REASON_REQUIRED', 'กรุณาเลือกเหตุผลในการเสนออย่างน้อย 1 ข้อ');
    }
    if (toBoolean_(structured.safer) && !String(structured.safetyDetail || '').trim()) {
      throw appError_('PROPOSAL_SAFETY_DETAIL_REQUIRED', 'กรุณาระบุด้านความปลอดภัยที่ดีกว่า');
    }
    if (toBoolean_(structured.costEffective) && !String(structured.comparisonDrug || '').trim()) {
      throw appError_('PROPOSAL_COMPARISON_DRUG_REQUIRED', 'กรุณาระบุยาที่ใช้เปรียบเทียบด้านประสิทธิภาพและราคา');
    }
    if (toBoolean_(structured.other) && !String(structured.otherDetail || '').trim()) {
      throw appError_('PROPOSAL_OTHER_DETAIL_REQUIRED', 'กรุณาระบุรายละเอียดเหตุผลอื่น');
    }
  }
  return true;
}
function validateDocumentChecklist_(documents, isImportedProduct) {
  if (!documents.length) {
    throw appError_('DOCUMENTS_REQUIRED', 'ต้องแนบเอกสารประกอบ');
  }
  const types = documents.map(function (document) {
    return String(document.documentType || '');
  });
  const missing = REQUIRED_DOCUMENT_TYPES.filter(function (type) {
    return types.indexOf(type) === -1;
  });
  if (isImportedProduct && types.indexOf(DOCUMENT_TYPE.CERTIFICATE_FREE_SALE) === -1) {
    missing.push(DOCUMENT_TYPE.CERTIFICATE_FREE_SALE);
  }
  if (missing.length) {
    throw appError_('MISSING_REQUIRED_DOCUMENTS', 'เอกสารไม่ครบ: ' + unique_(missing).join(', '), {
      missingDocumentTypes: unique_(missing)
    });
  }
  const researchCount = types.filter(function (type) {
    return type === DOCUMENT_TYPE.RESEARCH_EVIDENCE;
  }).length;
  if (researchCount < 1 || researchCount > APP.MAX_RESEARCH_FILES) {
    throw appError_(
      'INVALID_RESEARCH_FILE_COUNT',
      'งานวิจัยต้องมีอย่างน้อย 1 และไม่เกิน ' + APP.MAX_RESEARCH_FILES + ' ฉบับ'
    );
  }
  documents.forEach(validateDocumentPayload_);
  validateTotalUploadSize_(documents);
}
function validateDocumentPayload_(document, index) {
  if (!document || typeof document !== 'object') {
    throw appError_('INVALID_DOCUMENT', 'ข้อมูลไฟล์ลำดับ ' + (Number(index || 0) + 1) + ' ไม่ถูกต้อง');
  }
  requireFields_(document, ['documentType', 'fileName', 'mimeType', 'base64Data'], 'documents[' + index + ']');
  if (!Object.prototype.hasOwnProperty.call(DOCUMENT_TYPE, document.documentType)) {
    throw appError_('INVALID_DOCUMENT_TYPE', 'Document type ไม่ถูกต้อง: ' + document.documentType);
  }
  if (String(document.base64Data).length < 8) {
    throw appError_('EMPTY_FILE', 'ไฟล์ ' + document.fileName + ' ไม่มีข้อมูล');
  }
  const extension = getFileExtension_(document.fileName);
  const allowed = DOCUMENT_ACCEPT_RULES[document.documentType] || DOCUMENT_ACCEPT_RULES.OTHER;
  if (allowed.indexOf(extension) === -1) {
    throw appError_('INVALID_FILE_TYPE', 'ชนิดไฟล์ไม่ถูกต้องสำหรับ ' + document.documentType + ': .' + extension, {
      documentType: document.documentType,
      allowedExtensions: allowed
    });
  }
  const settings = getSystemSettings_();
  const maxFileBytes = Number(settings.MAX_FILE_SIZE_MB || 10) * 1024 * 1024;
  const estimatedBytes = estimateBase64Bytes_(document.base64Data);
  if (estimatedBytes > maxFileBytes) {
    throw appError_('FILE_TOO_LARGE', 'ไฟล์ ' + document.fileName + ' มีขนาดเกิน ' + Number(settings.MAX_FILE_SIZE_MB || 10) + ' MB');
  }
}
function validateResearchEvidence_(researchEvidence, documents) {
  if (!Array.isArray(researchEvidence)) {
    throw appError_('INVALID_RESEARCH_METADATA', 'researchEvidence ต้องเป็น array');
  }
  if (researchEvidence.length > APP.MAX_RESEARCH_FILES) {
    throw appError_('TOO_MANY_RESEARCH_ITEMS', 'งานวิจัยไม่เกิน ' + APP.MAX_RESEARCH_FILES + ' ฉบับ');
  }
  const researchDocumentCount = documents.filter(function (document) {
    return document.documentType === DOCUMENT_TYPE.RESEARCH_EVIDENCE;
  }).length;
  if (researchEvidence.length && researchEvidence.length !== researchDocumentCount) {
    throw appError_('RESEARCH_METADATA_MISMATCH', 'จำนวน metadata งานวิจัยไม่ตรงกับจำนวนไฟล์');
  }
  const currentYear = Number(Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy'));
  researchEvidence.forEach(function (item, index) {
    requireFields_(item, ['title', 'publicationYear'], 'researchEvidence[' + index + ']');
    const year = Number(item.publicationYear);
    if (!Number.isInteger(year) || year < 1900 || year > currentYear + 1) {
      throw appError_('INVALID_PUBLICATION_YEAR', 'ปีพิมพ์งานวิจัยลำดับ ' + (index + 1) + ' ไม่ถูกต้อง');
    }
    if (currentYear - year > 5 && !String(item.olderEvidenceJustification || '').trim()) {
      throw appError_(
        'OLDER_RESEARCH_JUSTIFICATION_REQUIRED',
        'งานวิจัยลำดับ ' + (index + 1) + ' เก่ากว่า 5 ปี ต้องระบุเหตุผล'
      );
    }
  });
}
function validateSystemReadyForSubmission_() {
  const settings = getSystemSettings_();
  if (String(settings.PDF_GENERATION_ENABLED).toUpperCase() === 'TRUE') {
    if (!settings.ACTIVE_PDF_TEMPLATE_ID) {
      throw appError_('PDF_TEMPLATE_NOT_CONFIGURED', 'ยังไม่ได้กำหนด ACTIVE_PDF_TEMPLATE_ID');
    }
    getActiveSignatory_(SIGNATORY_ROLE.PTC_CHAIRPERSON, new Date());
    getActiveSignatory_(SIGNATORY_ROLE.HOSPITAL_DIRECTOR, new Date());
  }
}
function requireFields_(object, fields, prefix) {
  fields.forEach(function (field) {
    const value = object[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw appError_('REQUIRED_FIELD', 'กรุณากรอก ' + prefix + '.' + field, {
        field: prefix + '.' + field
      });
    }
  });
}
function validateTotalUploadSize_(documents) {
  const settings = getSystemSettings_();
  const maximumMb = Number(settings.MAX_TOTAL_UPLOAD_MB || 35);
  const totalBytes = documents.reduce(function (sum, document) {
    return sum + estimateBase64Bytes_(document.base64Data);
  }, 0);
  if (totalBytes > maximumMb * 1024 * 1024) {
    throw appError_('TOTAL_UPLOAD_TOO_LARGE', 'ไฟล์รวมมีขนาดเกิน ' + maximumMb + ' MB', {
      maximumTotalUploadMb: maximumMb,
      estimatedTotalBytes: totalBytes
    });
  }
}
function estimateBase64Bytes_(value) {
  const clean = stripBase64Prefix_(String(value || '')).replace(/\s/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(clean.length * 3 / 4) - padding);
}
function getFileExtension_(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}
