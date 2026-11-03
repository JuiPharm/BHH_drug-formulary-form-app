# BHH Drug Formulary V2 — Requirement Traceability & Bug Audit
Date: 2026-11-03. Target version: 2.0.0-rc.1.
Branch: `feat/v2-compatibility-superadmin-audit`.

**Production release decision: BLOCKED / NO-GO.**
Do not merge this branch or switch the existing GitHub Pages production URL.

## Requirements compared to production main

| ID | Requirement | Result | Evidence / blocker |
|---|---|---|---|
| R01 | New GitHub repository, copy latest | NOT DONE | GitHub connected tool lacks repository-create operation. Candidate is on separate branch of original repository. |
| R02 | Deploy V2 GitHub Pages | NOT DONE | No new repo / V2 Apps Script deployment URL. V2 frontend API URL intentionally fails closed until configured. |
| R03 | Keep every production API action | PASS (source) | `ApiService.gs` retains all 22 action names and the same `{action,requestId,payload,auth}` request / `{success,data,error}` response envelope. 8 additional actions including `cloudflareBridge`, comments and Super Admin. |
| R04 | Keep existing Form App | PASS (source), UAT PENDING | Existing multi-step form/validation is preserved, but V2 URL is not deployed. |
| R05 | Google Drive exactly as before | PASS (code), LIVE TEST PENDING | Same DriveApp account/folder names, 14 categories, file-name versioning, SHA-256. Files remain in existing Drive; staging bridge not yet deployed. |
| R06 | Email after Submit | PASS (code/tests), LIVE TEST PENDING | Same company receipt and admin alert via MailApp, logs in EmailLog. Fixed successful-submit rollback when notification/logging fails. |
| R07 | Super Admin Web UI | PASS (code/tests), LIVE TEST PENDING | Create, role update, soft delete/reactivate, reset password, unlock. Current live system has no Super Admin enabled via V2 bootstrap. |
| R08 | New/reset user must change temporary password | PASS (code), BROWSER TEST PENDING | `MustChangePassword` in V2 schema; session APIs block business access until password rotated. |
| R09 | Move ALL V1 data | PLAN/DRY RUN ONLY | New editor-only Apps Script migration creates a separate private V2 copy, verifies reference integrity and scrubs sessions/password verifiers. Actual copy not executed. |
| R10 | Preserve original Drive file references | PASS (migration design), LIVE TEST PENDING | Copying spreadsheet retains Drive File IDs; source Drive files aren't duplicated. Permissions must be checked. |
| R11 | Preserve original Google Docs PDF workflow | PASS (source), LIVE TEST PENDING | Template creation in GeneratePdfService.gs retained, including version history/signed forms; must compare generated PDF to PTC-004 approved revision. |
| R12 | Notes/Comments in dashboard | PASS (branch code), UAT PENDING | SubmissionComments, legacy StatusHistory notes, latest comment count/preview. Live V1 spreadsheet lacks SubmissionComments tab and must be initialized in V2. |
| R13 | PTC governance and clinical decision workflow | PARTIAL / BLOCKED | Role guard prevents PTC_MEMBER from writes. Formal PTC meeting reference/role signoff/decision validation not implemented across whole app; any remaining operational admin role can still update statuses. |
| R14 | Audit trail | PARTIAL | V1 AuditLog copied; new Super Admin actions and comments audit. Tamper resistance, export/reconciliation and log monitoring not verified. |
| R15 | Performance improvement by D1 | NOT MET BY COMPATIBILITY MODE | GAS + Sheets remains primary submission API for strict 22-action compatibility. Cloudflare D1 preprod is separately deployed but does not yet fully implement submission/PDF/mail. |
| R16 | Cloudflare D1/R2 availability | PARTIAL | D1 preprod deployed; R2 not required. No production D1 data migration. |
| R17 | Production-level test and security checks | BLOCKED | CI/mock tests pass but no new repo, no live V2 GAS deployment, no real Drive/PDF/email E2E, no browser UAT/load/backup-restore/privacy signoff. |

## Live V1 source integrity (read-only, snapshot 2026-11-03)

Native Google Sheets title: Drug Formulary Submission Database.
All counts below are from bounded read-only Google Sheets queries (no details published).

- 24 Submissions (24 unique IDs; 0 duplicate submission numbers).
- 18 Companies, 19 Representatives, 24 ProductDetails, 24 PhysicianProposals,
  8 PhysicianApprovers, 347 Documents, 34 ResearchEvidence,
  29 GeneratedDocuments, 48 StatusHistory, 33 EmailLog, 0 DuplicateAttempts.
- 3 AdminUsers, 67 AdminSessions, 2 OrganizationSignatories,
  27 SystemSettings, 5 PublicTemplates, 1831 AuditLog, 1 Counters record.
- No orphans found in the checked SubmissionID foreign-key columns of the
  8 primary related tables, including Documents, ResearchEvidence and PDFs.
- EmailLog records: 33 `SUCCESS`, 0 `FAILED`. This reflects MailApp
  acceptance/logging only — **not verified recipient delivery**.
- 19 existing V1 tabs; the additional V2 `SubmissionComments` tab is missing
  from the live V1 workbook, as expected.
- Source Google Sheets remains UNMODIFIED. No patient/company data was
  written to Cloudflare D1 or a new V2 spreadsheet.

## Confirmed or prevented bugs

1. **High**: A failed post-submit EmailLog write could cause an outer rollback
   of the entire submission after email delivery (EmailService.gs + SubmissionService.gs).
   Fixed by separating MailApp from logging and isolating email exceptions.
2. **High**: A copied V2 frontend initially inherited a hardcoded V1 production
   GAS endpoint and V1 session storage keys. Fixed: V2 URLs are intentionally
   unconfigured and rejected; V2 browser storage keys are distinct.
3. **High**: V2 migration would inherit old `FORM_APP_URL`, resulting in
   incorrect V1 links inside V2 company receipt emails. Fixed: requires
   verified V2 GitHub Pages URL; copied SystemSettings is adjusted.
4. **High**: Migrating original admin password verifiers while generating a new
   pepper could lock users out and copy sensitive session hashes. Fixed:
   clone scrubs AdminSessions, password hashes/salts and lock state; users
   require fresh password setup and first-login password change.
5. **High**: Super Admin deletion/role change could remove the last active
   privileged administrator or leave old active sessions. Fixed:
   backend role checks, own-account safeguards, last-superadmin safeguard,
   account change locking and session revocation.
6. **Medium**: `PTC_MEMBER` could previously use operational update endpoints
   through legacy admin action router. Fixed: role guard on write routes;
   formal PTC approval governance remains a release blocker.
7. **Medium**: V2 database migration requires preserving every old related
   table, not only `Submissions`. Fixed in editor-only copy plan using
   integrity/count verification before setting V2 Script Properties.
8. **Medium**: Password entered at login remained in hidden login field.
   Fixed: input cleared after login and on logout.
9. **Known limitation**: Apps Script file uploads still use Base64 and
   may remain the latency bottleneck. D1 read-only paths alone cannot
   prove V2 is faster at Submit.
10. **Known limitation**: Email failures are logged but there is no
    idempotent retry queue for company secure links; needs a production
    design rather than automatically reusing expired access tokens.

## Release gates (must all be verified)

1. Create separate V2 repository and configure GitHub Pages on V2 `main`.
2. Deploy separate authorized V2 Apps Script Web App with the complete
   `backend/apps-script/*.gs` set and valid file/Docs/Mail scopes.
3. Freeze V1 writes and run `previewV2DataMigration()`; set staging/cutover
   Script Properties, then execute `runV2DataMigration()` only after approval.
4. Compare all 17 copied business tabs and verify original file IDs and PDFs;
   ensure zero missing relationships, 0 duplicate submission numbers.
5. Reprovision passwords in new V2 editor, bootstrap exactly one Super Admin,
   test User CRUD/reset and mandatory password rotation from browser.
6. Set both V2 frontend API URLs to V2 GAS URL, never V1 URL; validate
   company receipt points to V2 Page.
7. Test a synthetic new Submit through full Form App → Sheets/Drive →
   Docs PDF → MailApp company/admin messages → tracking status.
8. Test clinical document checklist, signed form, drug duplicate/rejection
   rules, PTC decision evidence, notes/comments, all roles and audit trails.
9. Review security/PDPA, rollback and load/concurrency; hospital UAT sign-off.
10. Activate V2 GitHub Pages after checks; keep V1 frozen for fallback.

**New production repository, deployed V2 URL, real migration and Super Admin
credentials are not yet created. Do not describe this as Production-ready.**
