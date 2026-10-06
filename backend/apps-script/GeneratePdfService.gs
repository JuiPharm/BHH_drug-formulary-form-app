/**
 * Generate PDF from approved Google Docs template.
 */
function generateSubmissionPdf_(submissionId, requestId) {
  const context = getSubmissionContext_(submissionId);
  const settings = getSystemSettings_();
  const templateId = String(settings.ACTIVE_PDF_TEMPLATE_ID || '');
  if (!templateId) {
    throw appError_('PDF_TEMPLATE_NOT_CONFIGURED', 'ยังไม่ได้กำหนด ACTIVE_PDF_TEMPLATE_ID');
  }
  const referenceDate = new Date();
  const chairperson = getActiveSignatory_(SIGNATORY_ROLE.PTC_CHAIRPERSON, referenceDate);
  const director = getActiveSignatory_(SIGNATORY_ROLE.HOSPITAL_DIRECTOR, referenceDate);
  const folderTree = JSON.parse(String(context.submission.FolderMapJSON));
  const outputFolder = DriveApp.getFolderById(folderTree.folders.GENERATED_PHYSICIAN_FORM.id);
  const templateFile = DriveApp.getFileById(templateId);
  if (templateFile.getMimeType() !== MimeType.GOOGLE_DOCS) {
    throw appError_('INVALID_TEMPLATE_TYPE', 'Template ต้องเป็น Google Docs');
  }
  const pdfVersion = getNextGeneratedDocumentVersion_(submissionId, DOCUMENT_TYPE.GENERATED_PHYSICIAN_FORM);
  const workingName = context.submission.SubmissionNo + '_Template_Working_v' + String(pdfVersion).padStart(2, '0');
  const workingFile = templateFile.makeCopy(workingName, outputFolder);
  const document = DocumentApp.openById(workingFile.getId());
  const replacements = buildTemplateReplacements_(context, chairperson, director);
  replaceDocumentPlaceholders_(document, replacements);
  document.saveAndClose();
  const pdfName = context.submission.SubmissionNo + '_Drug_Formulary_Submission_Unsigned_v' +
    String(pdfVersion).padStart(2, '0') + '.pdf';
  const pdfBlob = DriveApp.getFileById(workingFile.getId()).getAs(MimeType.PDF).setName(pdfName);
  const pdfFile = outputFolder.createFile(pdfBlob);
  workingFile.setTrashed(true);
  const generatedDocumentId = Utilities.getUuid();
  appendObject_(getSheet_('GeneratedDocuments'), {
    GeneratedDocumentID: generatedDocumentId,
    SubmissionID: submissionId,
    DocumentType: DOCUMENT_TYPE.GENERATED_PHYSICIAN_FORM,
    DocumentVersion: pdfVersion,
    DriveFileID: pdfFile.getId(),
    DriveFileURL: pdfFile.getUrl(),
    GeneratedAt: new Date(),
    GeneratedBy: getActorEmail_(),
    TemplateFileID: templateId,
    PTCChairpersonNameSnapshot: chairperson.DisplayName,
    PTCChairpersonTitleSnapshot: chairperson.PositionTitleTH,
    HospitalDirectorNameSnapshot: director.DisplayName,
    HospitalDirectorTitleSnapshot: director.PositionTitleTH,
    SignatoryReferenceDate: referenceDate,
    SourceManifestJSON: JSON.stringify({
      requestId: requestId,
      submissionId: submissionId,
      templateId: templateId
    }),
    Status: 'GENERATED',
    ErrorMessage: ''
  });
  appendObject_(getSheet_('Documents'), {
    DocumentID: Utilities.getUuid(),
    SubmissionID: submissionId,
    DocumentType: DOCUMENT_TYPE.GENERATED_PHYSICIAN_FORM,
    DocumentVersion: pdfVersion,
    OriginalFileName: pdfName,
    StoredFileName: pdfName,
    MimeType: MimeType.PDF,
    FileSizeBytes: pdfBlob.getBytes().length,
    DriveFileID: pdfFile.getId(),
    DriveFolderID: outputFolder.getId(),
    DriveFileURL: pdfFile.getUrl(),
    FileHash: computeSha256_(pdfBlob.getBytes()),
    UploadedBy: 'SYSTEM',
    UploadedAt: new Date(),
    ReviewStatus: 'GENERATED',
    ReviewNote: '',
    IsCurrentVersion: true
  });
  updateFirstMatch_(getSheet_('Submissions'), 'SubmissionID', submissionId, {
    GeneratedPdfFileID: pdfFile.getId(),
    GeneratedPdfURL: pdfFile.getUrl(),
    UpdatedAt: new Date()
  });
  return {
    success: true,
    generatedDocumentId: generatedDocumentId,
    version: pdfVersion,
    fileId: pdfFile.getId(),
    fileName: pdfName,
    fileUrl: pdfFile.getUrl()
  };
}
function retryGeneratePdf_(payload, requestId) {
  requireFields_(payload, ['submissionId'], 'payload');
  const result = generateSubmissionPdf_(payload.submissionId, requestId);
  updateSubmissionStatusInternal_(payload.submissionId, STATUS.AWAITING_SIGNATURE, payload.__actorEmail || getActorEmail_(), 'Retry สร้าง PDF สำเร็จ');
  return result;
}
function getNextGeneratedDocumentVersion_(submissionId, documentType) {
  const rows = findObjects_(getSheet_('GeneratedDocuments'), function (row) {
    return String(row.SubmissionID) === String(submissionId) &&
      String(row.DocumentType) === String(documentType);
  });
  if (!rows.length) {
    return 1;
  }
  return Math.max.apply(null, rows.map(function (row) {
    return Number(row.DocumentVersion || 0);
  })) + 1;
}
function getSubmissionContext_(submissionId) {
  const submission = findFirstObject_(getSheet_('Submissions'), 'SubmissionID', submissionId);
  if (!submission) {
    throw appError_('SUBMISSION_NOT_FOUND', 'ไม่พบคำขอ');
  }
  const product = findFirstObject_(getSheet_('ProductDetails'), 'SubmissionID', submissionId) || {};
  const company = findFirstObject_(getSheet_('Companies'), 'CompanyID', submission.CompanyID) || {};
  const representative = findFirstObject_(getSheet_('Representatives'), 'RepresentativeID', submission.RepresentativeID) || {};
  const physician = findFirstObject_(getSheet_('PhysicianProposals'), 'SubmissionID', submissionId) || {};
  const approvers = findObjects_(getSheet_('PhysicianApprovers'), function (row) {
    return String(row.SubmissionID) === String(submissionId) && toBoolean_(row.IsActive);
  }).sort(function (a, b) {
    return Number(a.SequenceNo) - Number(b.SequenceNo);
  }).slice(0, APP.MAX_APPROVERS);
  return {
    submission: submission,
    product: product,
    company: company,
    representative: representative,
    physician: physician,
    approvers: approvers
  };
}
function getActiveSignatory_(roleCode, referenceDate) {
  const rows = findObjects_(getSheet_('OrganizationSignatories'), function (row) {
    if (String(row.RoleCode) !== String(roleCode) || !toBoolean_(row.IsActive)) {
      return false;
    }
    const from = row.EffectiveFrom ? new Date(row.EffectiveFrom) : null;
    const to = row.EffectiveTo ? new Date(row.EffectiveTo) : null;
    if (from && from.getTime() > referenceDate.getTime()) {
      return false;
    }
    if (to && to.getTime() < referenceDate.getTime()) {
      return false;
    }
    return true;
  });
  if (rows.length !== 1) {
    throw appError_(
      'SIGNATORY_CONFIGURATION_ERROR',
      'ต้องมีผู้ดำรงตำแหน่ง Active จำนวน 1 รายสำหรับ ' + roleCode + ' แต่พบ ' + rows.length
    );
  }
  const row = rows[0];
  if (!String(row.DisplayName || '').trim() || !String(row.PositionTitleTH || '').trim()) {
    throw appError_('SIGNATORY_CONFIGURATION_ERROR', 'ข้อมูลชื่อหรือตำแหน่งของ ' + roleCode + ' ไม่ครบ');
  }
  return row;
}
function buildTemplateReplacements_(context, chairperson, director) {
  const submission = context.submission;
  const product = context.product;
  const company = context.company;
  const representative = context.representative;
  const physician = context.physician;
  const rmp = toBoolean_(submission.RMP);
  const replacements = {};
  replacements[PLACEHOLDERS.SubmissionDate] = formatThaiDate_(new Date(submission.SubmittedAt));
  replacements[PLACEHOLDERS.SubmissionNo] = submission.SubmissionNo;
  replacements[PLACEHOLDERS.BrandName] = submission.BrandName;
  replacements[PLACEHOLDERS.GenericName] = submission.GenericName;
  replacements[PLACEHOLDERS.Strength] = submission.Strength;
  replacements[PLACEHOLDERS.DosageForm] = submission.DosageForm;
  replacements[PLACEHOLDERS.CompanyName] = company.CompanyName;
  replacements[PLACEHOLDERS.CompanyAddress] = company.CompanyAddress;
  replacements[PLACEHOLDERS.CompanyEmail] = company.CompanyEmail;
  replacements[PLACEHOLDERS.CompanyPhone] = joinPhoneExtension_(company.CompanyPhone, company.CompanyPhoneExtension);
  replacements[PLACEHOLDERS.RepresentativeName] = representative.RepresentativeName;
  replacements[PLACEHOLDERS.RepresentativePosition] = representative.Position;
  replacements[PLACEHOLDERS.RepresentativeEmail] = representative.Email;
  replacements[PLACEHOLDERS.RepresentativePhone] = representative.Phone;
  replacements[PLACEHOLDERS.ManufacturerName] = product.ManufacturerName;
  replacements[PLACEHOLDERS.CountryOfManufacture] = product.CountryOfManufacture;
  replacements[PLACEHOLDERS.ThailandDistributor] = product.ThailandDistributor;
  replacements[PLACEHOLDERS.Classification] = product.Classification;
  replacements[PLACEHOLDERS.ChemicalComposition] = product.ChemicalComposition;
  replacements[PLACEHOLDERS.UnitQuantity] = product.UnitQuantity;
  replacements[PLACEHOLDERS.ShelfLife] = product.ShelfLife;
  replacements[PLACEHOLDERS.Indication] = product.Indication;
  replacements[PLACEHOLDERS.PharmacologicalAction] = product.PharmacologicalAction;
  replacements[PLACEHOLDERS.SideEffects] = product.SideEffects;
  replacements[PLACEHOLDERS.Contraindications] = product.Contraindications;
  replacements[PLACEHOLDERS.Dosage] = product.Dosage;
  replacements[PLACEHOLDERS.DrugInteraction] = product.DrugInteraction;
  replacements[PLACEHOLDERS.PregnancyLactation] = product.PregnancyLactation;
  replacements[PLACEHOLDERS.PediatricGeriatricUse] = product.PediatricGeriatricUse;
  replacements[PLACEHOLDERS.HepaticRenalDoseAdjustment] = product.HepaticRenalDoseAdjustment;
  replacements[PLACEHOLDERS.TabletCrushingSplitting] = product.TabletCrushingSplitting;
  replacements[PLACEHOLDERS.StabilityAfterReconstitution] = product.StabilityAfterReconstitution;
  replacements[PLACEHOLDERS.OtherClinicalInformation] = product.OtherClinicalInformation || '';
  replacements[PLACEHOLDERS.Storage] = product.Storage;
  replacements[PLACEHOLDERS.RMPYesCheckbox] = rmp ? '☑' : '☐';
  replacements[PLACEHOLDERS.RMPNoCheckbox] = rmp ? '☐' : '☑';
  replacements[PLACEHOLDERS.ComparableExistingDrug] = product.ComparableExistingDrug;
  replacements[PLACEHOLDERS.ComparativeAdvantage] = product.ComparativeAdvantage;
  replacements[PLACEHOLDERS.CostPerCourse] = product.CostPerCourse;
  replacements[PLACEHOLDERS.ProposedPrice] = product.ProposedPrice;
  replacements[PLACEHOLDERS.SampleQuantity] = product.SampleQuantity;
  replacements[PLACEHOLDERS.PhysicianName] = physician.PhysicianName;
  replacements[PLACEHOLDERS.PhysicianProfessionalTitle] = physician.ProfessionalTitle;
  replacements[PLACEHOLDERS.PhysicianDepartment] = physician.Department;
  replacements[PLACEHOLDERS.PhysicianSpecialty] = physician.Specialty;
  replacements[PLACEHOLDERS.PhysicianPhone] = physician.PhysicianPhone;
  const isUrgent = String(physician.Urgency || '') === 'URGENT';
  const urgencyUnitLabel = String(physician.UrgencyUnit || '') === 'DAYS' ? 'วัน' : 'ชั่วโมง';
  const restrictionSet = physician.UseRestrictionRequired !== '';
  const restrictionRequired = restrictionSet && toBoolean_(physician.UseRestrictionRequired);
  replacements[PLACEHOLDERS.Urgency] = isUrgent ? 'เร่งด่วน' : 'ไม่เร่งด่วน';
  replacements[PLACEHOLDERS.UrgencyDuration] = physician.UrgencyDuration;
  replacements[PLACEHOLDERS.UrgentCheckbox] = isUrgent ? '☑' : '☐';
  replacements[PLACEHOLDERS.NonUrgentCheckbox] = isUrgent ? '☐' : '☑';
  replacements[PLACEHOLDERS.UrgencyAmount] = isUrgent ? (physician.UrgencyAmount || '') : '';
  replacements[PLACEHOLDERS.UrgencyUnitLabel] = isUrgent ? urgencyUnitLabel : '';
  replacements[PLACEHOLDERS.ProposalReason] = physician.ProposalReason;
  replacements[PLACEHOLDERS.ProposalReasonNoAlternativeCheckbox] =
    toBoolean_(physician.ProposalReasonNoAlternative) ? '☑' : '☐';
  replacements[PLACEHOLDERS.ProposalReasonSaferCheckbox] =
    toBoolean_(physician.ProposalReasonSafer) ? '☑' : '☐';
  replacements[PLACEHOLDERS.ProposalReasonSafetyDetail] = physician.ProposalReasonSafetyDetail || '';
  replacements[PLACEHOLDERS.ProposalReasonCostEffectiveCheckbox] =
    toBoolean_(physician.ProposalReasonCostEffective) ? '☑' : '☐';
  replacements[PLACEHOLDERS.ProposalReasonComparisonDrug] = physician.ProposalReasonComparisonDrug || '';
  replacements[PLACEHOLDERS.ProposalReasonOtherCheckbox] =
    toBoolean_(physician.ProposalReasonOther) ? '☑' : '☐';
  replacements[PLACEHOLDERS.ProposalReasonOtherDetail] = physician.ProposalReasonOtherDetail || '';
  replacements[PLACEHOLDERS.UseRestrictionRequired] = !restrictionSet
    ? ''
    : (restrictionRequired ? 'จำเป็นต้องจำกัดการสั่งใช้' : 'ไม่จำเป็นต้องจำกัดการสั่งใช้');
  replacements[PLACEHOLDERS.UseRestrictionYesCheckbox] = restrictionRequired ? '☑' : '☐';
  replacements[PLACEHOLDERS.UseRestrictionNoCheckbox] = restrictionSet && !restrictionRequired ? '☑' : '☐';
  replacements[PLACEHOLDERS.RestrictedSpecialty] = physician.RestrictedSpecialty;
  replacements[PLACEHOLDERS.DrugToRemove] = physician.DrugToRemove;
  replacements[PLACEHOLDERS.ImpactIfNotApproved] = physician.ImpactIfNotApproved;
  replacements[PLACEHOLDERS.PTCChairpersonDisplayName] = joinProfessionalTitle_(chairperson.ProfessionalTitle, chairperson.DisplayName);
  replacements[PLACEHOLDERS.PTCChairpersonPositionTitle] = chairperson.PositionTitleTH;
  replacements[PLACEHOLDERS.HospitalDirectorDisplayName] = joinProfessionalTitle_(director.ProfessionalTitle, director.DisplayName);
  replacements[PLACEHOLDERS.HospitalDirectorPositionTitle] = director.PositionTitleTH;
  for (let i = 1; i <= APP.MAX_APPROVERS; i += 1) {
    const approver = context.approvers[i - 1] || {};
    replacements['{{Approver' + i + 'Name}}'] = joinProfessionalTitle_(approver.ProfessionalTitle, approver.ApproverName);
    replacements['{{Approver' + i + 'Department}}'] = approver.Department || approver.Specialty || '';
  }
  return replacements;
}
function replaceDocumentPlaceholders_(document, replacements) {
  const containers = [document.getBody()];
  const header = document.getHeader();
  const footer = document.getFooter();
  if (header) containers.push(header);
  if (footer) containers.push(footer);
  containers.forEach(function (container) {
    Object.keys(replacements).forEach(function (placeholder) {
      container.replaceText(escapeRegExp_(placeholder), sanitizeReplacementText_(replacements[placeholder]));
    });
    // Remove any unused placeholder left in the document.
    container.replaceText('\\{\\{[A-Za-z0-9_]+\\}\\}', '');
  });
}
