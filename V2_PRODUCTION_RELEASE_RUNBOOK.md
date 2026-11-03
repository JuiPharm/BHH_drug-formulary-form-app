# BHH Drug Formulary V2 — Controlled Production Release Runbook
Target: `2.0.0-rc.1`; current state: **NO-GO / draft**.

## Step 1 — Create V2 GitHub repository

The connected GitHub app currently allows branch/file/PR writes but does
**not** support creating repositories. The GitHub repository owner must create
a new repository, e.g. `JuiPharm/BHH_drug-formulary-v2`, before final copy.
Keep it private during implementation; configure GitHub Pages only when
authorized for the chosen visibility and the hospital privacy review.

Copy this V2 candidate branch to the new repository (Git CLI with
repository-owner authenticated credentials; never paste GitHub tokens in chats):

```sh
git clone https://github.com/JuiPharm/BHH_drug-formulary-form-app.git
cd BHH_drug-formulary-form-app
git switch feat/v2-compatibility-superadmin-audit
git remote add v2 https://github.com/JuiPharm/BHH_drug-formulary-v2.git
git push v2 HEAD:refs/heads/main
```

Review the new repository's Deploy Pages Action and Actions permissions.
Do **not** leave GitHub Pages pointing to old V1 GAS URL.

## Step 2 — Deploy V2 Google Apps Script project separately

1. Create a new standalone Apps Script project under the authorized BHH
   Google account. Copy all files in `backend/apps-script/*.gs` into
   that project, preserving file names. This is a **new deployment**; do not
   overwrite the existing production Apps Script project.
2. Retain original DriveApp/SpreadsheetApp/DocumentApp/MailApp scopes and
   approved Google Docs template access.
3. Configure new V2 project's **Script Properties**:
   `BHH_V2_SOURCE_SPREADSHEET_ID` = ID of the existing private V1
   `Drug Formulary Submission Database` (do not publish this ID in GitHub),
   `BHH_V2_FORM_APP_URL` = the verified new V2 GitHub Pages URL.
4. Run `previewV2DataMigration()` from V2 editor. Verify the 17 business
   sheet counts and zero orphaned SubmissionID links against the independent
   read-only baseline in `V2_REQUIREMENTS_AUDIT_2026-11-03.md`.
5. Schedule/verify **V1 submission freeze**, to avoid records being added
   after the snapshot but before V2 cutover. No automatic two-way sync exists.
6. Only after approval, set `BHH_V2_CUTOVER_APPROVED=YES` in **V2**
   Script Properties; run `runV2DataMigration()` once from V2 editor.
   This makes a separate Drive copy, preserves business history/file IDs,
   removes AdminSessions and old password hash/salt, adds V2-only schema,
   rewrites `FORM_APP_URL` and `DATABASE_SPREADSHEET_ID`, then changes
   only **V2 Script Properties** to point to the new copy.
7. Verify all 17 tab counts, audit logs, document versions and references.
   Verify PDFs, signatures and permitted Drive folders are readable by the
   V2 deployment Google account. Existing Drive files are NOT duplicated.

## Step 3 — Create a secure Super Admin

1. In V2 Apps Script editor, run `setCurrentUserAdminPassword(password)`
   using an independently chosen strong password. The existing user's
   account must exist in the copied V2 AdminUsers tab.
2. Run `bootstrapOwnerSuperAdminV2()` ONCE from the V2 Apps Script editor
   as the authorized project owner. It promotes only that existing,
   active owner account, revokes prior sessions, and refuses to repeat
   when an active Super Admin already exists.
3. Deploy V2 as a new Web App (run as authorized owner) and complete OAuth
   approvals. Verify `health` without real submission data.
4. Configure BOTH `js/config.js` and `admin/js/config.js` API_URL to
   the actual verified V2 GAS /exec URL. Candidate sources intentionally
   have `V2_GAS_DEPLOYMENT_NOT_CONFIGURED` placeholders to prevent
   accidental writes to V1.
5. Log into V2 admin with the initial/temporary password, rotate it as
   required, log in again; test Super Admin user creation, soft-disable,
   role update, password reset, account unlock and audit logs.
6. Issue passwords to existing V1 admin accounts individually using an
   authorized secure distribution channel. Do NOT copy V1 password pepper,
   raw sessions, or credentials to V2 or GitHub.

## Step 4 — Validate the exact original API and mail

Original API must retain 22 action names and the same POST JSON envelope.
Use tests in `tests/v2-requirements-parity.test.mjs` and validate with an
actual synthetic submission, *without* submitting a real drug:
- Duplicate check, validation, company, representative, prescriber data,
  research evidence and attachments.
- Original 14 DriveApp folders and existing saved filename format.
- PDF from approved Google Docs PTC-004 template, and signed form workflow.
- Submission status, comments, generated PDF and admin download actions.
- Company confirmation email and admin notification through MailApp.
  `EmailLog` status `SUCCESS` is acceptance by MailApp, not proof of inbox
  delivery. Failed sends need operational notification/retry SOP.
- V2 receipt URL must point to V2 GitHub Pages, not V1.
- No PTC_MEMBER write privileges or unauthorized SUPER_ADMIN takeover.

## Step 5 — Performance, security, and rollback

- The strict compatibility release still uses Google Apps Script + Sheets
  for the full submission workflow. A Cloudflare D1 backend is under
  separate development and **does not replace** all 22 V1 actions yet.
- Do not claim D1-backed production performance until the full form API,
  mail/PDF and transaction flow have equivalent implementations and tests.
- Load/concurrency tests, backup+restore, access review, PDPA/privacy checks,
  clinical PTC decision signoff and security UAT are mandatory.
- Preserve V1 source, original spreadsheet and original Drive folder.
  If V2 receives new submissions and rollback becomes necessary, reconcile
  those NEW V2 records/files to V1 **before** allowing writes on V1 again;
  just changing the URL would lose new writes.

## What is NOT currently done

- New GitHub repo creation; V2 GitHub Pages deployment.
- New V2 Apps Script project/deployment.
- Executing real V2 database copy/cutover.
- Creating actual Super Admin credentials.
- Full browser, Google Drive, PDF and email live E2E UAT.

Current Deliverable: V2 source branch plus automated tests and migration
tools only. This runbook does NOT authorize early Production cutover.
