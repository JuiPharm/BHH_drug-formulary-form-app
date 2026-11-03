# BHH Drug Formulary 2.0 — Cloudflare / Google Drive Pre-production

**Branch-only development. NOT production-ready. No R2 required.**

## Environment

- Public GitHub Pages Form and Admin URLs: unchanged, still driven by `main`.
- Preprod Worker: `bhh-drug-formulary-preprod` deployed on Cloudflare with D1 binding.
- D1: `bhh-drug-formulary-preprod` (APAC location hint, not a Thai-data-residency guarantee).
- Migrations: `0001_init.sql`, `0002_multi_document_types.sql`, `0003_hospital_users.sql` applied to empty preprod D1.
- Google Drive: private service-account binary upload adapter implemented and **mock-tested**. Live integration pending account approval/Worker Secrets.
- PDF: existing approved Google Docs + Apps Script flow remains the plan; not migrated here.
- Data: no real hospital records have been copied into D1.

## API status

| Route | Availability | Authorization |
|---|---|---|
| `GET /health` | Deployed | Public; no customer data |
| `GET /api/public/config` | Deployed | Public, read-only |
| `GET /api/admin/summary` | Deployed, **disabled until Access + roles configured** | Cloudflare Access + D1 active hospital role |
| `GET /api/admin/submissions` | Same | Access + role |
| `GET /api/admin/submissions/:id` | Same | Access + role |
| `POST /api/admin/submissions/:id/comments` | Same | Access + pharmacist/admin/secretary role; PTC members read-only |

Admin routes **never** accept an arbitrary client-supplied email or role. They require
`ctx.access.getIdentity()` from the Cloudflare platform with an exact
`CF_ACCESS_AUD` match, then confirm an active row in `hospital_users`.
No default active user is seeded.

The Admin API is a **new D1 API**, not the legacy Google Apps Script
`action` interface. The existing GitHub Pages Admin client is still on the
legacy backend until an explicitly reviewed front-end integration is shipped.

## Set up Google Drive instead of R2

1. Ask Google Workspace administrators to approve a dedicated service account using
   a **separate staging Shared Drive folder** or an explicitly approved delegated
   Workspace identity. The existing production folder must not be changed.
2. Grant this identity access to the dedicated staging folder only. Service account
   access to a private user My Drive is **not automatic**.
3. Store these values as Cloudflare Worker Secrets, **never** in public GitHub:
   `GDRIVE_CLIENT_EMAIL`, `GDRIVE_PRIVATE_KEY`, `GDRIVE_FOLDER_ID`.
   Optionally set `GDRIVE_DELEGATED_USER` only with admin-approved delegation.
4. The server obtains OAuth tokens using a signed RS256 JWT and uploads binary data
   through the Google Drive API; no Base64 or credentials are sent to the browser.
5. The adapter currently limits each file to 10 MiB and has an explicit MIME allowlist.
   It **is not exposed as a public upload route** before authentication, submission
   ownership rules, malware inspection and download access controls are approved.
6. Test upload/download using synthetic data in the isolated folder. Do not test
   against the production Google Drive folder.

## Set up Cloudflare Access for hospital staff

1. Create an Access policy protecting the **preprod Worker**, with approved hospital
   staff only; validate authentication and any group/SSO requirements.
2. Set `CF_ACCESS_AUD` as a Worker environment secret/config value matching the
   Access application audience. A missing value denies all Admin routes.
3. After review, provision rows in preprod D1 `hospital_users` with roles
   `SYSTEM_ADMIN`, `PHARMACIST`, `PTC_SECRETARY`, `PTC_MEMBER` and
   `is_active=1` only for explicitly authorized staff.
4. PTC members can read but cannot post comments. Comments are forced to
   `INTERNAL`; company-visible messages require a separate representative
   authentication and disclosure workflow.
5. Integrating the old GitHub Pages Admin UI with Access-protected Workers
   requires browser session/CORS testing; static branch code alone is not UAT.

## Validation

```sh
node --test tests/*.test.mjs cloudflare/tests/*.test.mjs
python3 -m unittest discover -s cloudflare/tests -p '*_test.py' -v
npx wrangler dev --config cloudflare/wrangler.toml
```

GitHub Actions `.github/workflows/preprod-checks.yml` runs syntax checks,
JavaScript tests and SQL migration tests on the development branch.

Separate D1 smoke test completed on Cloudflare: synthetic company/submission/
comment were inserted and joined successfully, then removed; re-query confirmed
zero remaining test records.

## Release blockers before Pre-production UAT

- Cloudflare Access policy + approved staff roles, and external representative auth.
- Google Drive staging service identity and secure private upload/download endpoints.
- Full submission workflow, document checklist, duplicate prevention and idempotency.
- Google Docs/PDF round-trip verification with PTC-004 Rev.13.
- Legacy Google Sheets data migration, validation, backups and rollback plan.
- Browser-origin/CORS, rate limits, audit integrity and malware checks.
- End-to-end UAT with synthetic or de-identified records, then performance tests.

**Do not merge into `main` or switch GitHub Pages `API_URL` yet.**
