# Cloudflare pre-production foundation

This is **not yet a complete replacement for Google Apps Script**.

## Current state
- Preproduction Worker: `bhh-drug-formulary-preprod` (health and public read-only config only)
- D1: `bhh-drug-formulary-preprod` in APAC, migration `0001_init.sql` applied
- R2: blocked — account must enable R2 before file-upload migration
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
3. Enable R2, private object storage, file hashes, access-controlled downloads
4. Implement submission workflow, comment visibility, audit, idempotent uploads
5. PDF rendering equivalence test against controlled PTC-004 Rev.13
6. Load testing, UAT, reconciliation, backup/restore and rollback rehearsal
7. Only then switch the GitHub Pages runtime API URL in a reviewed `main` release

## Important
No staging credentials belong in public GitHub Pages. The Worker intentionally exposes **no** admin APIs until identity and authorization are implemented. `/health` is public and contains no secrets.
