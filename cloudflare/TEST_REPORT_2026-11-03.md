# Pre-production technical test report — 2026-11-03

## Summary
Cloudflare + Google Drive hybrid foundation implemented on a draft branch.
**Pre-production UAT readiness: NOT APPROVED.** Original GitHub Pages / Google
Apps Script production is unchanged.

## Automated verification
- CI reference: https://github.com/JuiPharm/BHH_drug-formulary-form-app/actions/runs/41626610127
- JavaScript tests: **67 passed / 0 failed**
- SQLite D1 migration tests: **6 passed / 0 failed**
- JavaScript modules and Apps Script `.gs` syntax checks: passed
- Drive integration mocked: OAuth RS256 signing, binary multipart upload, resumable
  upload above 5 MiB, session URL host allowlist, size/type validation and D1
  write-failure compensation
- API integration mocked: Cloudflare Access audience, active hospital roles,
  PTC read-only role, internal comment writes and audit, invalid input rejection

## Cloudflare control-plane verification
- Worker `bhh-drug-formulary-preprod`: successfully deployed with 5 modules.
- Cloudflare D1 `bhh-drug-formulary-preprod`: APAC location hint.
- D1 binding named `DB`, Worker `workers.dev` enabled.
- Applied D1 migrations `0001`, `0002`, `0003`.
- Synthetic D1 smoke: inserted a dummy company + submission + internal comment;
  joined records successfully, then deleted all fixtures. Follow-up count:
  **0 dummy companies / 0 dummy submissions / 0 dummy comments**.

## Integration gaps / known blockers
- No live HTTP request to Worker was independently verified from this execution
  environment; deployment and settings were verified via Cloudflare control plane.
- **No real Google Drive upload**. Service-account identity, approved dedicated
  preprod folder, Secret bindings and secure upload feature flag are not configured.
- Existing live Google Drive folder was discovered by metadata only; no
  sharing or contents were modified.
- Cloudflare Access application and hospital staff roles not yet provisioned;
  admin routes deny access by default.
- Submission endpoints, representative authentication, signed PDF workflow,
  legacy migration, document downloads, malware scanning, UAT and load tests
  remain future release gates.
- `main` and current GitHub Pages `API_URL` have not been changed.

## Required next acceptance checks
1. Obtain hospital Google Workspace approval and scoped staging Drive identity.
2. Enable Cloudflare Access + authorized user roles; test from browser.
3. Upload and securely download test documents, verify SHA256 and audit.
4. Complete submission/review/decision workflow and PTC-004 PDF equivalence.
5. Perform UAT, privacy/security review, load tests, backup/restore and rollback.
6. Only then consider merging to `main` and cutover.

Do not submit real pharmaceutical proposal documents to this stage until
authorization and security gates are complete.
