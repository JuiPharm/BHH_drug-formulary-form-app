/**
 * V2 data migration from the ORIGINAL Google Sheets to a separate V2 copy.
 *
 * IMPORTANT:
 * - Editor-only functions. Never expose via doPost()/routeApiRequest_().
 * - Run from the NEW V2 Apps Script project owned by the authorized account.
 * - Requires a confirmed V1 freeze/cutover and explicit Script Properties gate.
 * - Preserves original Drive File IDs and document links; never moves/changes
 *   existing files or writes to the source spreadsheet.
 * - Never migrates active login sessions or unusable password verifiers into
 *   a new Apps Script project with its own password pepper.
 */
const V2_MIGRATION_SOURCE_KEY_ = 'BHH_V2_SOURCE_SPREADSHEET_ID';
const V2_MIGRATION_GATE_KEY_ = 'BHH_V2_CUTOVER_APPROVED';
const V2_MIGRATION_DONE_KEY_ = 'BHH_V2_MIGRATED_FROM';
const V2_BUSINESS_SHEETS_ = Object.freeze([
  'Submissions','Companies','Representatives','ProductDetails',
  'PhysicianProposals','PhysicianApprovers','Documents','ResearchEvidence',
  'GeneratedDocuments','StatusHistory','EmailLog','DuplicateAttempts',
  'OrganizationSignatories','SystemSettings','PublicTemplates','AuditLog',
  'Counters'
]);
function v2MigrationSource_() {
  const props = PropertiesService.getScriptProperties();
  const id = String(props.getProperty(V2_MIGRATION_SOURCE_KEY_) || '').trim();
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(id)) {
    throw appError_('V2_SOURCE_NOT_CONFIGURED', 'ตั้ง BHH_V2_SOURCE_SPREADSHEET_ID ใน V2 Script Properties');
  }
  const targetId = String(props.getProperty(PROP_KEYS.SPREADSHEET_ID) || '');
  if (id === targetId || props.getProperty(V2_MIGRATION_DONE_KEY_)) {
    throw appError_('V2_MIGRATION_ALREADY_DONE', 'ตรวจสอบการย้ายฐานข้อมูล V2 เดิมก่อน');
  }
  return SpreadsheetApp.openById(id);
}
function v2SheetRows_(sheet) {
  if (!sheet) return 0;
  return Math.max(0, sheet.getLastRow() - 1);
}
function v2Records_(sheet, primaryHeader) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const col = values[0].indexOf(primaryHeader);
  if (col < 0) throw appError_('V2_MIGRATION_SCHEMA_MISMATCH', 'Missing ' + primaryHeader);
  return values.slice(1).map(function (r) { return String(r[col] || '').trim(); }).filter(Boolean);
}
function v2MigrationIntegrity_(spreadsheet) {
  const submissions = v2Records_(spreadsheet.getSheetByName('Submissions'), 'SubmissionID');
  const idSet = {};
  submissions.forEach(function (id) {
    if (idSet[id]) throw appError_('V2_DUPLICATE_SUBMISSION_ID', 'พบ Submission ID ซ้ำ');
    idSet[id] = true;
  });
  const relationSheets = [
    'ProductDetails','PhysicianProposals','PhysicianApprovers',
    'Documents','ResearchEvidence','GeneratedDocuments','StatusHistory','EmailLog'
  ];
  const orphanCounts = {};
  relationSheets.forEach(function (name) {
    orphanCounts[name] = v2Records_(spreadsheet.getSheetByName(name), 'SubmissionID')
      .filter(function (id) { return !idSet[id]; }).length;
    if (orphanCounts[name]) {
      throw appError_('V2_ORPHANED_RELATION', 'Missing submission references in ' + name);
    }
  });
  const counts = {};
  V2_BUSINESS_SHEETS_.forEach(function (name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) throw appError_('V2_MIGRATION_MISSING_SHEET', 'Missing ' + name);
    counts[name] = v2SheetRows_(sheet);
  });
  return { submissionCount: submissions.length, counts: counts, orphanCounts: orphanCounts };
}
function previewV2Migration_() {
  const source = v2MigrationSource_();
  return {
    sourceSpreadsheetId: source.getId(),
    readiness: 'DRY_RUN_ONLY',
    source: v2MigrationIntegrity_(source),
    excludedFromCopy: ['AdminSessions', 'AdminUsers.PasswordHash', 'AdminUsers.PasswordSalt',
      'AdminUsers.PasswordAlgorithm','AdminUsers.LockedUntil'],
    note: 'ข้อมูลจริงจะถูกคัดลอกเฉพาะเมื่อผู้ดูแลอนุมัติ Cutover และสั่ง Run ขั้นตอนถัดไปจาก Apps Script Editor'
  };
}
function scrubV2Authentication_(target) {
  const sessions = target.getSheetByName('AdminSessions');
  if (sessions && sessions.getLastRow() > 1) {
    sessions.getRange(2,1,sessions.getLastRow()-1,sessions.getLastColumn()).clearContent();
  }
  const users = target.getSheetByName('AdminUsers');
  if (!users) throw appError_('V2_MISSING_ADMIN_USERS', 'V2 copy has no AdminUsers tab');
  const values = users.getDataRange().getValues();
  const headers = values[0].map(String);
  const secretCols = [
    'PasswordHash','PasswordSalt','PasswordAlgorithm','PasswordChangedAt',
    'FailedLoginCount','LockedUntil','LastLoginAt'
  ];
  secretCols.forEach(function (name) {
    const index = headers.indexOf(name);
    if (index >= 0 && users.getLastRow() > 1) {
      users.getRange(2,index+1,users.getLastRow()-1,1).clearContent();
    }
  });
  // Fresh credentials must be generated in V2; legacy password pepper is
  // deliberately NOT copied between Apps Script projects.
  return { sessionsPurged: true, verifierFieldsCleared: secretCols };
}
function runV2Migration_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(APP.LOCK_TIMEOUT_MS);
  let createdFile = null;
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(V2_MIGRATION_GATE_KEY_) !== 'YES') {
      throw appError_('V2_CUTOVER_NOT_APPROVED',
        'อนุญาตให้เริ่มเมื่อ V1 หยุดรับข้อมูลและตั้ง BHH_V2_CUTOVER_APPROVED=YES');
    }
    if (props.getProperty(PROP_KEYS.SPREADSHEET_ID)) {
      throw appError_('V2_TARGET_ALREADY_CONFIGURED', 'V2 มีฐานข้อมูลแล้ว ห้ามเขียนทับ');
    }
    const source = v2MigrationSource_();
    const preflight = v2MigrationIntegrity_(source);
    const parentFolder = DriveApp.getFileById(source.getId()).getParents();
    if (!parentFolder.hasNext()) {
      throw appError_('V2_MAIN_FOLDER_NOT_FOUND', 'ไม่พบ Main Drive folder เดิม');
    }
    const main = parentFolder.next();
    if (main.getName() !== APP.MAIN_FOLDER_NAME) {
      throw appError_('V2_MAIN_FOLDER_MISMATCH', 'Main Drive folder ไม่ตรงกับระบบเดิม');
    }
    const templates = main.getFoldersByName(APP.TEMPLATE_FOLDER_NAME);
    if (!templates.hasNext()) {
      throw appError_('V2_TEMPLATE_FOLDER_NOT_FOUND', 'ไม่พบ Template folder เดิม');
    }
    const templateId = templates.next().getId();
    const destinationFolder = getOrCreateChildFolder_(
      DriveApp.getRootFolder(), 'BHH_Drug_Formulary_V2'
    );
    createdFile = DriveApp.getFileById(source.getId()).makeCopy(
      APP.DATABASE_FILE_NAME + ' V2 - ' +
      Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyyMMdd_HHmmss'),
      destinationFolder
    );
    const copy = SpreadsheetApp.openById(createdFile.getId());
    scrubV2Authentication_(copy);
    initializeSheets_(copy); // Adds any V2-only sheets such as SubmissionComments.
    const postflight = v2MigrationIntegrity_(copy);
    V2_BUSINESS_SHEETS_.forEach(function (name) {
      if (preflight.counts[name] !== postflight.counts[name]) {
        throw appError_('V2_MIGRATION_COUNT_MISMATCH', 'Record count differs: ' + name);
      }
    });
    // Commit Script Properties only after successful copy/integrity checks.
    props.setProperties({
      [PROP_KEYS.SPREADSHEET_ID]: copy.getId(),
      [PROP_KEYS.MAIN_FOLDER_ID]: main.getId(),
      [PROP_KEYS.TEMPLATE_FOLDER_ID]: templateId,
      [V2_MIGRATION_DONE_KEY_]: source.getId(),
      [V2_MIGRATION_GATE_KEY_]: 'COMPLETE',
      [PROP_KEYS.SETUP_AT]: nowIso_()
    });
    ensureAdminPasswordPepper_(); // independent new V2 pepper
    return {
      success: true,
      targetSpreadsheetId: copy.getId(),
      targetSpreadsheetUrl: copy.getUrl(),
      sourceSubmissionCount: preflight.submissionCount,
      counts: postflight.counts,
      sessionsPurged: true,
      passwordResetRequiredForAllUsers: true,
      originalsUnchanged: true
    };
  } catch (error) {
    if (createdFile) {
      try { createdFile.setTrashed(true); } catch (ignore) {}
    }
    throw error;
  } finally {
    lock.releaseLock();
  }
}
