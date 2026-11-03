# Cloudflare pre-production foundation

This is **not yet a complete replacement for Google Apps Script**.

## Current state
- Preproduction Worker: `bhh-drug-formulary-preprod` (health and public read-only config only)
- D1: `bhh-drug-formulary-preprod` in APAC, migration `0001_init.sql` applied
- Storage strategy: **Google Drive**; R2 is not required. Private adapter and mock tests are implemented.\n- Google Drive access: **pending institutional approval and Cloudflare secrets**; no real uploads have been attempted.
- GitHub Pages: `main` remains on the original Google Apps Script backend
- Never copy hospital data or credentials into this repository or D1 test fixtures

## Local checks
```sh
node --test cloudflare/tests/*.test.mjs
npx wrangler dev --config cloudflare/wrangler.toml
```

## Staged delivery gates
1. Security review: authentication/authorization per representative and pharmacy/PTC role
2. Backfill mapping from Sheets (Companies, Representatives, Submissions, ProductDetails, StatusHistory) to D1
3. Configure a dedicated Google Workspace service account (Shared Drive access or authorized delegation), private file handling, file hashes and access-controlled downloads
4. Implement submission workflow, comment visibility, audit, idempotent uploads
5. PDF rendering equivalence test against controlled PTC-004 Rev.13
6. Load testing, UAT, reconciliation, backup/restore and rollback rehearsal
7. Only then switch the GitHub Pages runtime API URL in a reviewed `main` release

## Important
No staging credentials belong in public GitHub Pages. The Worker intentionally exposes **no** admin APIs until identity and authorization are implemented. `/health` is public and contains no secrets.

## Google Drive setup (no R2)

1. Have Google Workspace administrators approve a dedicated service account or authorized domain-wide delegated identity. Prefer a dedicated Shared Drive (not an ordinary My Drive folder). Do not alter existing production folder permissions during the migration.
2. Grant the service identity access to a **separate preproduction folder** with least privilege. The existing production folder is not a staging upload target.
3. Configure these as Cloudflare Worker secrets: `GDRIVE_CLIENT_EMAIL`, `GDRIVE_PRIVATE_KEY`, `GDRIVE_FOLDER_ID`. Optionally `GDRIVE_DELEGATED_USER` only for explicitly approved delegation.
4. The Worker obtains Google OAuth access tokens by signing service-account JWTs. Tokens, private keys and Drive IDs are never exposed to GitHub Pages.
5. The storage adapter currently supports binary multipart uploads up to 10 MiB **per file** after future per-user authorization, validated document type and submission ownership checks. Do not call it from public endpoints. Files are private in Google Drive.
6. PDF generation remains in the existing Google Docs/Apps Script process until the PTC form is validated. This is a separate workflow integration, not a hidden automatic fallback.
7. Verify Google Drive upload/download with a **nonproduction test file and approved credentials** before accepting UAT.

## Current read-only Worker
`GET /health` reports D1 availability and whether Drive secrets are configured; `GET /api/public/config` reports `fileStorage: "google-drive"` and `driveUploadEnabled: false`. These do not grant any file access. Google Drive live integration is not ready until secrets, authorization and upload API are deployed.
