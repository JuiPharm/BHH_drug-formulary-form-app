import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(base,p),'utf8');
const api=read('backend/apps-script/ApiService.gs');
const code=read('backend/apps-script/Code.gs');
const submission=read('backend/apps-script/SubmissionService.gs');
const email=read('backend/apps-script/EmailService.gs');
const auth=read('backend/apps-script/AuthService.gs');
const admin=read('admin/js/app.js');
const html=read('admin/index.html');
const cloudflare=read('cloudflare/src/index.mjs');

// Baseline verified directly against 2026-11-03 production/main ApiService.gs
const ORIGINAL_API_ACTIONS=[
  "health",
  "getPublicConfig",
  "getAdminPublicConfig",
  "adminLogin",
  "adminLogout",
  "getAdminProfile",
  "changeAdminPassword",
  "getAdminDashboardSummary",
  "listPublicTemplates",
  "downloadPublicTemplate",
  "checkDuplicate",
  "submitApplication",
  "uploadSignedPhysicianForm",
  "adminUploadSignedPhysicianForm",
  "getSubmissionStatus",
  "downloadGeneratedPdf",
  "retryGeneratePdf",
  "regenerateSubmissionPdf",
  "listSubmissions",
  "getSubmissionDetail",
  "downloadAdminDocument",
  "updateStatus"
];
function availableActions(src){
  return Array.from(src.matchAll(/case '([^']+)':/g), x => x[1]);
}

test('V2 preserves EVERY original GAS action name (22 / 22)',()=>{
  const actual=availableActions(api);
  assert.equal(ORIGINAL_API_ACTIONS.length,22);
  for(const action of ORIGINAL_API_ACTIONS){
    assert(actual.includes(action),'Missing production API action '+action);
  }
});
test('V2 preserves original doGet and doPost JSON request router',()=>{
  assert.match(code,/function doGet\(e\)/);
  assert.match(code,/function doPost\(e\)/);
  assert.match(code,/routeApiRequest_\(request, e\)/);
  assert.match(api,/request\s*&&\s*request\.action/);
  assert.match(api,/return jsonResponse_\(/);
});
test('V2 sends same representative and admin notifications after Submit',()=>{
  assert.match(submission,/sendSubmissionEmails_\(submissionId, payload, pdfResult, submissionAccessToken\)/);
  assert.match(email,/sendAndLogEmail_\(submissionId, 'ReceiptConfirmation', payload\.representative\.email/);
  assert.match(email,/sendAndLogEmail_\(submissionId, 'NewSubmissionAlert', email/);
  assert.match(email,/MailApp\.sendEmail/);
  assert.match(email,/Status: status/);
});
test('email notification failures cannot roll back a successful drug submission',()=>{
  const beforeReturn=submission.slice(submission.indexOf('sendSubmissionEmails_('),
    submission.indexOf('    return {',submission.indexOf('sendSubmissionEmails_(')));
  assert.match(beforeReturn,/catch \(emailError\)/);
  assert.match(email,/return \{ success: status === 'SUCCESS'/);
});
test('Super Admin actions require backend guard, never only a UI role',()=>{
  const superAdmin=read('backend/apps-script/SuperAdminService.gs');
  const names=['listManagedAdminUsers_','createManagedAdminUser_','updateManagedAdminUser_',
    'disableManagedAdminUser_','resetManagedAdminPassword_','unlockManagedAdminUser_'];
  for(const name of names){
    assert.match(superAdmin,new RegExp('function '+name+'\\('));
    assert(availableActions(api).includes(name.replace(/_$/,'')),'Missing route '+name);
  }
  assert.match(superAdmin,/function requireSuperAdmin_\(request\)/);
  assert.match(superAdmin,/String\(live\.Role \|\| ''\)\.toUpperCase\(\) !== 'SUPER_ADMIN'/);
  assert.match(superAdmin,/revokeAllAdminSessions_\(email\)/);
  assert.match(superAdmin,/countActiveSuperAdmins_\(\) <= 1/);
});
test('Super Admin Web UI controls and backend API route names are consistent',()=>{
  for(const id of ['manage-users-button','user-management-panel','create-user-form',
    'managed-user-tbody','temporary-password-modal','temporary-password-value']){
    assert(html.includes('id="'+id+'"'),'Missing UI ID '+id);
  }
  for(const name of ['listManagedAdminUsers','createManagedAdminUser','updateManagedAdminUser',
    'disableManagedAdminUser','resetManagedAdminPassword','unlockManagedAdminUser']){
    assert(admin.includes("'"+name+"'"),'Admin UI missing action '+name);
  }
  assert.match(admin,/profile\.role !== 'SUPER_ADMIN'/);
  assert.match(admin,/escapeHtml\(user\.email\)/);
});
test('Original Google Drive layer and PTC PDF generator are preserved',()=>{
  const drive=read('backend/apps-script/DriveService.gs');
  const pdf=read('backend/apps-script/GeneratePdfService.gs');
  assert.match(drive,/function createSubmissionFolderTree_/);
  assert.match(drive,/DriveApp\.getFolderById/);
  assert.match(drive,/function buildStoredFileName_/);
  assert.match(pdf,/function generateSubmissionPdf_/);
  assert.match(pdf,/DocumentApp\.openById/);
  assert.match(pdf,/getAs\(MimeType\.PDF\)/);
});
test('Cloudflare must not silently replace the Apps Script action API',()=>{
  // It is a separate D1 API. Do not repoint original UI API_URL to this service.
  assert.match(cloudflare,/pathname\.startsWith\('\/api\/admin\/'\)/);
  assert(!cloudflare.includes("case 'submitApplication'"));
});
