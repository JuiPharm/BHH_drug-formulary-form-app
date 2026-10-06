/**
 * Drug Formulary Submission System
 * Configuration, schema and constants.
 */
const APP = Object.freeze({
  NAME: 'Drug Formulary Submission System',
  VERSION: '1.3.3',
  TIMEZONE: 'Asia/Bangkok',
  DATABASE_FILE_NAME: 'Drug Formulary Submission Database',
  MAIN_FOLDER_NAME: 'Drug Formulary Submissions',
  TEMPLATE_FOLDER_NAME: 'Templates',
  MAX_APPROVERS: 6,
  MAX_RESEARCH_FILES: 3,
  REJECT_COOLDOWN_DAYS: 365,
  LOCK_TIMEOUT_MS: 30000,
  DEFAULT_STATUS: 'SUBMITTED',
  NON_URGENT_PTC_DURATION: 'รอบการนำเสนอของคณะกรรมการ PTC'
});
const PROP_KEYS = Object.freeze({
  SPREADSHEET_ID: 'DRUG_FORMULARY_SPREADSHEET_ID',
  MAIN_FOLDER_ID: 'DRUG_FORMULARY_MAIN_FOLDER_ID',
  TEMPLATE_FOLDER_ID: 'DRUG_FORMULARY_TEMPLATE_FOLDER_ID',
  SETUP_AT: 'DRUG_FORMULARY_SETUP_AT',
  ADMIN_PASSWORD_PEPPER: 'DRUG_FORMULARY_ADMIN_PASSWORD_PEPPER'
});
const STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  AWAITING_SIGNATURE: 'AWAITING_SIGNATURE',
  DOCUMENT_REVIEW: 'DOCUMENT_REVIEW',
  INCOMPLETE_DOCUMENTS: 'INCOMPLETE_DOCUMENTS',
  DOCUMENTS_COMPLETE: 'DOCUMENTS_COMPLETE',
  AWAITING_BDMS: 'AWAITING_BDMS',
  PENDING_PRESENTATION: 'PENDING_PRESENTATION',
  PRESENTED: 'PRESENTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DEFERRED: 'DEFERRED',
  WITHDRAWN: 'WITHDRAWN',
  CANCELLED: 'CANCELLED',
  PDF_GENERATION_FAILED: 'PDF_GENERATION_FAILED'
});
const ACTIVE_DUPLICATE_STATUSES = Object.freeze([
  STATUS.SUBMITTED,
  STATUS.AWAITING_SIGNATURE,
  STATUS.DOCUMENT_REVIEW,
  STATUS.INCOMPLETE_DOCUMENTS,
  STATUS.DOCUMENTS_COMPLETE,
  STATUS.AWAITING_BDMS,
  STATUS.PENDING_PRESENTATION,
  STATUS.PRESENTED,
  STATUS.DEFERRED,
  STATUS.PDF_GENERATION_FAILED
]);
const DOCUMENT_TYPE = Object.freeze({
  QUOTATION: 'QUOTATION',
  TMT: 'TMT',
  REGISTRATION: 'REGISTRATION',
  GMP: 'GMP',
  CERTIFICATE_FREE_SALE: 'CERTIFICATE_FREE_SALE',
  PRODUCT_IMAGES: 'PRODUCT_IMAGES',
  LABEL_TH: 'LABEL_TH',
  LABEL_EN: 'LABEL_EN',
  RETURN_EXCHANGE: 'RETURN_EXCHANGE',
  PATIENT_INFORMATION_LEAFLET: 'PATIENT_INFORMATION_LEAFLET',
  PRESENTATION: 'PRESENTATION',
  RESEARCH_EVIDENCE: 'RESEARCH_EVIDENCE',
  COA_OR_PRODUCT_SPECIFIC: 'COA_OR_PRODUCT_SPECIFIC',
  GENERATED_PHYSICIAN_FORM: 'GENERATED_PHYSICIAN_FORM',
  SIGNED_PHYSICIAN_FORM: 'SIGNED_PHYSICIAN_FORM',
  COMBINED_SUBMISSION_PACKAGE: 'COMBINED_SUBMISSION_PACKAGE',
  OTHER: 'OTHER'
});
const REQUIRED_DOCUMENT_TYPES = Object.freeze([
  DOCUMENT_TYPE.QUOTATION,
  DOCUMENT_TYPE.TMT,
  DOCUMENT_TYPE.REGISTRATION,
  DOCUMENT_TYPE.GMP,
  DOCUMENT_TYPE.PRODUCT_IMAGES,
  DOCUMENT_TYPE.LABEL_TH,
  DOCUMENT_TYPE.LABEL_EN,
  DOCUMENT_TYPE.RETURN_EXCHANGE,
  DOCUMENT_TYPE.PATIENT_INFORMATION_LEAFLET,
  DOCUMENT_TYPE.PRESENTATION,
  DOCUMENT_TYPE.RESEARCH_EVIDENCE,
  DOCUMENT_TYPE.COA_OR_PRODUCT_SPECIFIC
]);
const SUBMISSION_FOLDER_DEFINITIONS = Object.freeze([
  { key: 'QUOTATION_TMT', name: '01_Quotation_TMT' },
  { key: 'REGISTRATION_GMP', name: '02_Registration_GMP' },
  { key: 'CERTIFICATE_FREE_SALE', name: '03_Certificate_Free_Sale' },
  { key: 'PRODUCT_IMAGES', name: '04_Product_Images' },
  { key: 'LABEL_TH_EN', name: '05_Label_TH_EN' },
  { key: 'RETURN_EXCHANGE', name: '06_Return_Exchange' },
  { key: 'PATIENT_INFORMATION_LEAFLET', name: '07_Patient_Information_Leaflet' },
  { key: 'PRESENTATION', name: '08_Presentation' },
  { key: 'RESEARCH_EVIDENCE', name: '09_Research_Evidence' },
  { key: 'COA_PRODUCT_SPECIFIC', name: '10_CoA_Product_Specific' },
  { key: 'GENERATED_PHYSICIAN_FORM', name: '11_Generated_Physician_Form' },
  { key: 'SIGNED_PHYSICIAN_FORM', name: '12_Signed_Physician_Form' },
  { key: 'COMBINED_PACKAGE', name: '13_Combined_Submission_Package' },
  { key: 'ARCHIVE', name: '99_Archived_Versions' }
]);
const DOCUMENT_FOLDER_KEY = Object.freeze({
  QUOTATION: 'QUOTATION_TMT',
  TMT: 'QUOTATION_TMT',
  REGISTRATION: 'REGISTRATION_GMP',
  GMP: 'REGISTRATION_GMP',
  CERTIFICATE_FREE_SALE: 'CERTIFICATE_FREE_SALE',
  PRODUCT_IMAGES: 'PRODUCT_IMAGES',
  LABEL_TH: 'LABEL_TH_EN',
  LABEL_EN: 'LABEL_TH_EN',
  RETURN_EXCHANGE: 'RETURN_EXCHANGE',
  PATIENT_INFORMATION_LEAFLET: 'PATIENT_INFORMATION_LEAFLET',
  PRESENTATION: 'PRESENTATION',
  RESEARCH_EVIDENCE: 'RESEARCH_EVIDENCE',
  COA_OR_PRODUCT_SPECIFIC: 'COA_PRODUCT_SPECIFIC',
  GENERATED_PHYSICIAN_FORM: 'GENERATED_PHYSICIAN_FORM',
  SIGNED_PHYSICIAN_FORM: 'SIGNED_PHYSICIAN_FORM',
  COMBINED_SUBMISSION_PACKAGE: 'COMBINED_PACKAGE',
  OTHER: 'ARCHIVE'
});
const DOCUMENT_ACCEPT_RULES = Object.freeze({
  QUOTATION: ['pdf'],
  TMT: ['pdf', 'xls', 'xlsx'],
  REGISTRATION: ['pdf'],
  GMP: ['pdf'],
  CERTIFICATE_FREE_SALE: ['pdf'],
  PRODUCT_IMAGES: ['pdf', 'jpg', 'jpeg', 'png'],
  LABEL_TH: ['pdf'],
  LABEL_EN: ['pdf'],
  RETURN_EXCHANGE: ['pdf'],
  PATIENT_INFORMATION_LEAFLET: ['doc', 'docx'],
  PRESENTATION: ['ppt', 'pptx'],
  RESEARCH_EVIDENCE: ['pdf'],
  COA_OR_PRODUCT_SPECIFIC: ['pdf'],
  GENERATED_PHYSICIAN_FORM: ['pdf'],
  SIGNED_PHYSICIAN_FORM: ['pdf'],
  COMBINED_SUBMISSION_PACKAGE: ['pdf'],
  OTHER: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png']
});
const SHEET_SCHEMAS = Object.freeze({
  Submissions: [
    'SubmissionID', 'SubmissionNo', 'ProductKey', 'BrandName', 'GenericName',
    'Strength', 'DosageForm', 'CompanyID', 'RepresentativeID', 'CurrentStatus',
    'SubmittedAt', 'ChecklistComplete', 'RMP', 'IsImportedProduct',
    'SignedFormReceived', 'IsResubmission', 'PreviousSubmissionID',
    'ResubmissionReason', 'DecisionAt', 'RejectReason', 'DriveFolderID',
    'DriveFolderURL', 'FolderMapJSON', 'GeneratedPdfFileID', 'GeneratedPdfURL',
    'CombinedPackageVersion', 'SubmissionAccessTokenHash',
    'SubmissionAccessTokenExpiresAt', 'RowVersion', 'CreatedAt', 'UpdatedAt'
  ],
  ProductDetails: [
    'SubmissionID', 'ManufacturerName', 'CountryOfManufacture',
    'ThailandDistributor', 'Classification', 'ChemicalComposition',
    'UnitQuantity', 'ShelfLife', 'Indication', 'PharmacologicalAction',
    'SideEffects', 'Contraindications', 'Dosage', 'DrugInteraction',
    'PregnancyLactation', 'PediatricGeriatricUse',
    'HepaticRenalDoseAdjustment', 'TabletCrushingSplitting',
    'StabilityAfterReconstitution', 'OtherClinicalInformation', 'Storage', 'RMP',
    'ComparableExistingDrug', 'ComparativeAdvantage', 'CostPerCourse',
    'ProposedPrice', 'SampleQuantity', 'CreatedAt', 'UpdatedAt'
  ],
  Companies: [
    'CompanyID', 'CompanyName', 'CompanyAddress', 'CompanyEmail',
    'CompanyPhone', 'CompanyPhoneExtension', 'IsActive', 'CreatedAt', 'UpdatedAt'
  ],
  Representatives: [
    'RepresentativeID', 'CompanyID', 'RepresentativeName', 'Position', 'Email',
    'Phone', 'AlternatePhone', 'IsPrimaryContact', 'IsActive', 'CreatedAt', 'UpdatedAt'
  ],
  PhysicianProposals: [
    'SubmissionID', 'PhysicianName', 'ProfessionalTitle', 'Department', 'Specialty',
    'PhysicianPhone', 'Urgency', 'UrgencyDuration', 'UrgencyAmount', 'UrgencyUnit',
    'ProposalReason', 'ProposalReasonNoAlternative', 'ProposalReasonSafer',
    'ProposalReasonSafetyDetail', 'ProposalReasonCostEffective',
    'ProposalReasonComparisonDrug', 'ProposalReasonOther', 'ProposalReasonOtherDetail',
    'UseRestrictionRequired', 'RestrictedSpecialty', 'DrugToRemove',
    'ImpactIfNotApproved', 'CreatedAt', 'UpdatedAt'
  ],
  PhysicianApprovers: [
    'ApproverID', 'SubmissionID', 'SequenceNo', 'ApproverName',
    'ProfessionalTitle', 'Department', 'Specialty', 'CreatedAt', 'UpdatedAt', 'IsActive'
  ],
  Documents: [
    'DocumentID', 'SubmissionID', 'DocumentType', 'DocumentVersion',
    'OriginalFileName', 'StoredFileName', 'MimeType', 'FileSizeBytes',
    'DriveFileID', 'DriveFolderID', 'DriveFileURL', 'FileHash', 'UploadedBy',
    'UploadedAt', 'ReviewStatus', 'ReviewNote', 'IsCurrentVersion'
  ],
  ResearchEvidence: [
    'EvidenceID', 'SubmissionID', 'DocumentID', 'Title', 'Journal',
    'PublicationYear', 'StudyType', 'DOI', 'PMID', 'IsLandmarkStudy',
    'IsOlderThanFiveYears', 'OlderEvidenceJustification', 'CreatedAt', 'UpdatedAt'
  ],
  GeneratedDocuments: [
    'GeneratedDocumentID', 'SubmissionID', 'DocumentType', 'DocumentVersion',
    'DriveFileID', 'DriveFileURL', 'GeneratedAt', 'GeneratedBy',
    'TemplateFileID', 'PTCChairpersonNameSnapshot',
    'PTCChairpersonTitleSnapshot', 'HospitalDirectorNameSnapshot',
    'HospitalDirectorTitleSnapshot', 'SignatoryReferenceDate',
    'SourceManifestJSON', 'Status', 'ErrorMessage'
  ],
  StatusHistory: [
    'HistoryID', 'SubmissionID', 'PreviousStatus', 'NewStatus', 'ChangedBy',
    'ChangedAt', 'Note'
  ],
  EmailLog: [
    'EmailLogID', 'SubmissionID', 'EmailType', 'RecipientEmail', 'SentAt',
    'Status', 'ErrorMessage'
  ],
  DuplicateAttempts: [
    'AttemptID', 'ProductKey', 'BrandName', 'Strength', 'DosageForm',
    'CompanyName', 'RepresentativeEmail', 'MatchedSubmissionID',
    'MatchedStatus', 'AttemptedAt', 'Reason'
  ],
  OrganizationSignatories: [
    'SignatoryID', 'RoleCode', 'DisplayName', 'ProfessionalTitle',
    'PositionTitleTH', 'PositionTitleEN', 'EffectiveFrom', 'EffectiveTo',
    'IsActive', 'DisplayOrder', 'UpdatedAt', 'UpdatedBy'
  ],
  SystemSettings: [
    'SettingKey', 'SettingValue', 'Description', 'UpdatedAt', 'UpdatedBy'
  ],
  AdminUsers: [
    'Email', 'DisplayName', 'Role', 'PasswordHash', 'PasswordSalt',
    'PasswordAlgorithm', 'PasswordChangedAt', 'FailedLoginCount',
    'LockedUntil', 'LastLoginAt', 'IsActive', 'CreatedAt', 'UpdatedAt'
  ],
  AdminSessions: [
    'SessionID', 'TokenHash', 'Email', 'DisplayNameSnapshot', 'RoleSnapshot',
    'CreatedAt', 'ExpiresAt', 'LastSeenAt', 'RevokedAt', 'UserAgent'
  ],
  PublicTemplates: [
    'TemplateKey', 'DisplayName', 'Description', 'DriveFileID', 'MimeType',
    'IsActive', 'DisplayOrder', 'UpdatedAt', 'UpdatedBy'
  ],
  AuditLog: [
    'AuditID', 'Actor', 'Action', 'EntityType', 'EntityID', 'RequestID',
    'CreatedAt', 'DetailJSON'
  ],
  Counters: [
    'CounterKey', 'CounterValue', 'UpdatedAt'
  ]
});
const SYSTEM_SETTING_DEFAULTS = Object.freeze([
  ['APP_NAME', APP.NAME, 'ชื่อระบบ'],
  ['APP_VERSION', APP.VERSION, 'เวอร์ชันระบบ'],
  ['DATABASE_SPREADSHEET_ID', '', 'Spreadsheet ID หลัก'],
  ['MAIN_FOLDER_ID', '', 'Main folder ID'],
  ['TEMPLATE_FOLDER_ID', '', 'Template folder ID'],
  ['ACTIVE_PDF_TEMPLATE_ID', '', 'Google Docs Template ID สำหรับสร้าง PDF'],
  ['DOCUMENT_FORM_CODE', 'FM-02.2-PTC-004', 'รหัสเอกสาร'],
  ['DOCUMENT_REVISION', 'กรุณากำหนด Revision ที่อนุมัติ', 'Revision ของ Template'],
  ['HOSPITAL_NAME_TH', 'โรงพยาบาลกรุงเทพหาดใหญ่', 'ชื่อโรงพยาบาล'],
  ['MAX_PHYSICIAN_APPROVERS', String(APP.MAX_APPROVERS), 'จำนวนผู้เห็นชอบสูงสุด'],
  ['REJECT_COOLDOWN_DAYS', String(APP.REJECT_COOLDOWN_DAYS), 'ระยะเสนอซ้ำหลังไม่ผ่าน'],
  ['ADMIN_AUTH_MODE', 'PASSWORD', 'รูปแบบ Login Admin: PASSWORD, GOOGLE หรือ BOTH'],
  ['ADMIN_ALLOWED_DOMAIN', '', 'Google Workspace domain สำหรับ Admin เมื่อใช้ Google Login'],
  ['ADMIN_SESSION_HOURS', '8', 'อายุ Session Admin หน่วยชั่วโมง'],
  ['ADMIN_MAX_FAILED_LOGINS', '5', 'จำนวนครั้ง Login ผิดก่อน Lock บัญชี'],
  ['ADMIN_LOCK_MINUTES', '15', 'ระยะเวลา Lock บัญชีหลัง Login ผิดเกินกำหนด'],
  ['ADMIN_PASSWORD_MIN_LENGTH', '8', 'ความยาว Password ขั้นต่ำ'],
  ['ADMIN_NOTIFICATION_EMAILS', '', 'Email Admin คั่นด้วย comma'],
  ['FORM_APP_URL', '', 'URL ของ Form App'],
  ['ADMIN_APP_URL', '', 'URL ของ Admin App'],
  ['COMPANY_EMAIL_CC_ENABLED', 'FALSE', 'CC Email บริษัทเมื่อแจ้งเตือน'],
  ['PDF_GENERATION_ENABLED', 'TRUE', 'เปิดสร้าง PDF หลัง Submit'],
  ['SUBMISSION_ACCESS_TOKEN_DAYS', '365', 'อายุ token สำหรับบริษัทติดตามคำขอ'],
  ['GOOGLE_CLIENT_ID', '', 'Google Identity Services Client ID สำหรับ Admin App'],
  ['COMPANY_SIGNED_UPLOAD_ENABLED', 'FALSE', 'อนุญาตให้บริษัทอัปโหลดแบบฟอร์มลงนามเอง'],
  ['MAX_FILE_SIZE_MB', '10', 'ขนาดไฟล์สูงสุดต่อไฟล์สำหรับ Form App'],
  ['MAX_TOTAL_UPLOAD_MB', '35', 'ขนาดไฟล์รวมสูงสุดต่อคำขอสำหรับ Form App']
]);
const SIGNATORY_ROLE = Object.freeze({
  PTC_CHAIRPERSON: 'PTC_CHAIRPERSON',
  HOSPITAL_DIRECTOR: 'HOSPITAL_DIRECTOR'
});
const PLACEHOLDERS = Object.freeze({
  SubmissionDate: '{{SubmissionDate}}',
  SubmissionNo: '{{SubmissionNo}}',
  BrandName: '{{BrandName}}',
  GenericName: '{{GenericName}}',
  Strength: '{{Strength}}',
  DosageForm: '{{DosageForm}}',
  CompanyName: '{{CompanyName}}',
  CompanyAddress: '{{CompanyAddress}}',
  CompanyEmail: '{{CompanyEmail}}',
  CompanyPhone: '{{CompanyPhone}}',
  RepresentativeName: '{{RepresentativeName}}',
  RepresentativePosition: '{{RepresentativePosition}}',
  RepresentativeEmail: '{{RepresentativeEmail}}',
  RepresentativePhone: '{{RepresentativePhone}}',
  ManufacturerName: '{{ManufacturerName}}',
  CountryOfManufacture: '{{CountryOfManufacture}}',
  ThailandDistributor: '{{ThailandDistributor}}',
  Classification: '{{Classification}}',
  ChemicalComposition: '{{ChemicalComposition}}',
  UnitQuantity: '{{UnitQuantity}}',
  ShelfLife: '{{ShelfLife}}',
  Indication: '{{Indication}}',
  PharmacologicalAction: '{{PharmacologicalAction}}',
  SideEffects: '{{SideEffects}}',
  Contraindications: '{{Contraindications}}',
  Dosage: '{{Dosage}}',
  DrugInteraction: '{{DrugInteraction}}',
  PregnancyLactation: '{{PregnancyLactation}}',
  PediatricGeriatricUse: '{{PediatricGeriatricUse}}',
  HepaticRenalDoseAdjustment: '{{HepaticRenalDoseAdjustment}}',
  TabletCrushingSplitting: '{{TabletCrushingSplitting}}',
  StabilityAfterReconstitution: '{{StabilityAfterReconstitution}}',
  OtherClinicalInformation: '{{OtherClinicalInformation}}',
  Storage: '{{Storage}}',
  RMPYesCheckbox: '{{RMPYesCheckbox}}',
  RMPNoCheckbox: '{{RMPNoCheckbox}}',
  ComparableExistingDrug: '{{ComparableExistingDrug}}',
  ComparativeAdvantage: '{{ComparativeAdvantage}}',
  CostPerCourse: '{{CostPerCourse}}',
  ProposedPrice: '{{ProposedPrice}}',
  SampleQuantity: '{{SampleQuantity}}',
  PhysicianName: '{{PhysicianName}}',
  PhysicianProfessionalTitle: '{{PhysicianProfessionalTitle}}',
  PhysicianDepartment: '{{PhysicianDepartment}}',
  PhysicianSpecialty: '{{PhysicianSpecialty}}',
  PhysicianPhone: '{{PhysicianPhone}}',
  Urgency: '{{Urgency}}',
  UrgencyDuration: '{{UrgencyDuration}}',
  UrgentCheckbox: '{{UrgentCheckbox}}',
  NonUrgentCheckbox: '{{NonUrgentCheckbox}}',
  UrgencyAmount: '{{UrgencyAmount}}',
  UrgencyUnitLabel: '{{UrgencyUnitLabel}}',
  ProposalReason: '{{ProposalReason}}',
  ProposalReasonNoAlternativeCheckbox: '{{ProposalReasonNoAlternativeCheckbox}}',
  ProposalReasonSaferCheckbox: '{{ProposalReasonSaferCheckbox}}',
  ProposalReasonSafetyDetail: '{{ProposalReasonSafetyDetail}}',
  ProposalReasonCostEffectiveCheckbox: '{{ProposalReasonCostEffectiveCheckbox}}',
  ProposalReasonComparisonDrug: '{{ProposalReasonComparisonDrug}}',
  ProposalReasonOtherCheckbox: '{{ProposalReasonOtherCheckbox}}',
  ProposalReasonOtherDetail: '{{ProposalReasonOtherDetail}}',
  UseRestrictionRequired: '{{UseRestrictionRequired}}',
  UseRestrictionYesCheckbox: '{{UseRestrictionYesCheckbox}}',
  UseRestrictionNoCheckbox: '{{UseRestrictionNoCheckbox}}',
  RestrictedSpecialty: '{{RestrictedSpecialty}}',
  DrugToRemove: '{{DrugToRemove}}',
  ImpactIfNotApproved: '{{ImpactIfNotApproved}}',
  PTCChairpersonDisplayName: '{{PTCChairpersonDisplayName}}',
  PTCChairpersonPositionTitle: '{{PTCChairpersonPositionTitle}}',
  HospitalDirectorDisplayName: '{{HospitalDirectorDisplayName}}',
  HospitalDirectorPositionTitle: '{{HospitalDirectorPositionTitle}}'
});
