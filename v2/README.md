# BHH Drug Formulary Form App — V2 (Original API)
 
V2 frontend is deployed under `/BHH_drug-formulary-form-app/v2/`
and Admin V2 under `/BHH_drug-formulary-form-app/v2/admin/`.

## Backend: unchanged and LIVE

The V2 frontend intentionally points to the *same deployed Apps Script /exec URL*
as V1 and uses the same request actions and response contract:
- Public: `health`, `getPublicConfig`, `checkDuplicate`,
  `listPublicTemplates`, `downloadPublicTemplate`, `submitApplication`,
  `getSubmissionStatus`, `downloadGeneratedPdf`
- Admin: `adminLogin`, `getAdminProfile`,
  `getAdminDashboardSummary`, `listSubmissions`, `getSubmissionDetail`,
  `downloadAdminDocument`, `adminUploadSignedPhysicianForm`,
  `regenerateSubmissionPdf`, `updateStatus`, `adminLogout`

Google Sheets and Google Drive data remain in the **existing** backend.
The browser never gets Sheet credentials or private Drive access;
Apps Script performs Sheet operations and DriveApp file operations using
its original authorization and existing privacy controls.

**This is a V2 address/release of the existing functional frontend, not
a migration of the Cloudflare D1/PTC backend.**
It intentionally does NOT deploy any new `cloudflare/` or `backend/` scripts.

**IMPORTANT: This is LIVE data.** Submissions and Admin updates from V2
change the same existing database and Drive as V1. Do not use test submissions
without an approved test plan.

LocalStorage draft and SessionStorage token key names are suffixed `-v2`
so both versions can be open side by side without sharing the client-side state.

## Deploy and smoke tests
The main branch GitHub Pages workflow publishes the site including `v2/`.
Run `node --test tests/v2-legacy-api.test.mjs` for static compatibility.
Verify the GitHub Pages workflow succeeds and the `/v2/` and
`/v2/admin/` URLs load. Live Apps Script calls require browser network;
Admin data requests require a valid real Admin session.

The original root `/BHH_drug-formulary-form-app/` is unchanged.
