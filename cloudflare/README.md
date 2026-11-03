# BHH Drug Formulary 2.0 — Cloudflare + ORIGINAL Google Apps Script Drive

> Development branch only. **Not production-ready / not approved for UAT.**
> **No Cloudflare R2, no Google Drive API service account, no Google Workspace delegation.**
> The original GitHub Pages and production Apps Script remain unchanged.

## Keep original Google Drive behavior

Existing production code: `backend/apps-script/DriveService.gs`,
`SubmissionService.gs`, `GeneratePdfService.gs` and `Config.gs`.

Original behavior (preserved):
- Script Properties `DRUG_FORMULARY_MAIN_FOLDER_ID` identifies the original
  `Drug Formulary Submissions` parent folder. The Apps Script deployment's
  Google account owns DriveApp operations.
- Submission creates `<year>/<SubmissionNo>_<BrandName>_<Strength>_<DosageForm>/`.
- Creates the **same 14 subfolders** specified by `SUBMISSION_FOLDER_DEFINITIONS`
  (01–13 and 99 archive).
- Uses `DOCUMENT_FOLDER_KEY` to choose the subfolder.
- Stored filename uses `buildStoredFileName_()`:
  `<DocumentType>_<SubmissionNo>_vNN_<OriginalName.ext>`.
- The file arrives as Base64 at Apps Script, then `DriveApp.createFile(blob)`.
  Documents retain their Drive File ID, SHA-256, version and metadata.
- Signed physician forms and generated/combined PDFs use their existing folders.
- PDF creation continues via the existing `GeneratePdfService.gs` Google Docs
  Template process. **PDF integration for new D1 submissions is still pending.**

**Important performance distinction:** D1 removes full Google Sheets scans from
new business API reads, but file upload still invokes Apps Script and retains
Apps Script execution/request constraints. It is not a direct-to-Drive upload.

## Preproduction design: Apps Script Drive bridge

```
GitHub Pages (original main branch stays on production GAS)
        |
Cloudflare Workers API (preprod; hospital Access + D1 role)
        |
        +---- Cloudflare D1 (records, status, comments, audit, folder mapping)
        |
        +---- signed HMAC service request ----> Apps Script (STAGING deployment)
                                              |
                                              DriveApp (existing account)
                                              |
                                              PREPROD folder / year / submission / 14 folders
```

Files:
- `backend/apps-script/CloudflareDriveBridge.gs`: new **staging-only** Apps
  Script action `cloudflareBridge`, using the existing DriveService helpers.
- `cloudflare/src/drive-service.mjs`: Worker->Apps Script client signs HMAC.
- `cloudflare/src/document-api.mjs`: staff-controlled folder setup and file
  upload (both **feature-flag disabled** by default).
- `cloudflare/migrations/0004_original_drive_folder_map.sql`:
  D1 keeps submission-to-original-Drive-folder references.

### Setup — staging only, without new Google credentials

1. Make a **separate copy of the existing Apps Script project** for testing,
   run by the same authorized Google account, preserving its DriveApp scopes.
   Do not add the bridge action to the live production deployment.
2. Create a dedicated Drive folder clearly named, e.g. `BHH PREPROD`, accessible
   to the Apps Script owner. The bridge rejects the folder if its name lacks
   PREPROD / STAGING / SANDBOX or it matches the configured main folder ID.
   **Do not use the existing production main folder as the staging folder.**
3. In the staging Apps Script project's Script Properties, configure:
   `BHH_BRIDGE_STAGING_FOLDER_ID` = the dedicated test folder ID,
   `BHH_BRIDGE_SECRET` = a cryptographically random shared secret (32+
   characters). Do not place it in source, Google Sheets or the browser.
4. Deploy **staging** Apps Script as a Web App running as the authorized
   owner. Ensure the endpoint is accessible to Cloudflare Worker requests;
   `cloudflareBridge` strictly verifies timestamp (5 minutes), signed body,
   HMAC-SHA256 and replay nonce. It rejects all other operations.
5. Add the exact same shared secret via Cloudflare Worker Secret
   `GAS_BRIDGE_SECRET` and the staging Web App `/exec` URL via
   `GAS_BRIDGE_URL`. Never paste secrets into GitHub or frontend JavaScript.
6. Protect Worker routes with Cloudflare Access and configure
   `CF_ACCESS_AUD` + explicitly approved active staff rows in D1.
   `PTC_MEMBER` cannot upload or add comments.
7. Once all controls pass, set `DRIVE_UPLOAD_ENABLED=true` for the
   *staging Worker only*. Until then, both Drive endpoints return HTTP 503.

### Staging API examples (after authorization)

- `POST /api/admin/submissions/:id/drive-folders`:
  asks Apps Script to create the **original** 14-folder hierarchy under the
  separately configured preprod parent; D1 stores its root ID + folder map.
- `POST /api/admin/submissions/:id/documents?type=RESEARCH_EVIDENCE&filename=study.pdf`
  with `Content-Type: application/pdf` and raw PDF bytes:
  Worker validates MIME, extension, signature, size (10 MiB), checksum;
  it sends base64 to the existing DriveApp layer, which builds the original
  stored filename and category folder. D1 records File ID + SHA-256.
- On failed D1 persistence, the Worker requests a signed Apps Script
  trash operation for the staged file (best-effort; monitoring needed).

The old GitHub Pages form does **not** call the new Cloudflare API yet.
The original production `submitApplication` workflow continues to use
Google Sheets and Google Drive directly.

## D1 & protected API

- D1: `bhh-drug-formulary-preprod` (APAC primary-location hint, no
  guarantee of Thailand-only storage). Migrations `0001` to `0004`.
- Worker: `bhh-drug-formulary-preprod`; `/health` and
  `/api/public/config` expose only non-sensitive configuration.
- `GET /api/admin/summary`, `GET /api/admin/submissions`,
  `GET /api/admin/submissions/:id`, `POST .../comments` require
  exact verified Cloudflare Access identity and active D1 role.
- There is no default authorized admin account.

## Tests

```sh
node --test tests/*.test.mjs cloudflare/tests/*.test.mjs
python3 -m unittest discover -s cloudflare/tests -p '*_test.py' -v
```

Automated checks cover:
- Signed Worker->Apps Script HMAC, clock expiration and nonce replay.
- Exact legacy 14 folder names, year/root hierarchy, file naming,
  document-type placement and checksum.
- No folder creation in production root and deletion only within staging.
- Staff RBAC and fail-closed Drive upload flag.
- D1 schema constraints, folder map migration and internal comments.

## Hard blockers before Pre-production UAT

- Copy Apps Script into isolated staging and configure staging folder/HMAC.
- Enable Cloudflare Access and provision authorized hospital roles.
- Finish representative login, submission workflow and exact PDF/Google Docs
  equivalence for D1-originated records.
- Scan uploads for malware; implement authorized download, retry/idempotency,
  orphan reconciliation, rate limiting, and browser CORS testing.
- Migrate/reconcile historical Google Sheets and Drive file references.
- UAT, security/privacy review, backup/restore and rollback rehearsal.

**Do not merge the draft PR or change production GitHub Pages `API_URL` until
hospital acceptance and authorized production cutover.**
