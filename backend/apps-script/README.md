# Google Apps Script Backend — v1.3.3
Source snapshot ของ Backend สำหรับระบบ **BHH Drug Formulary Registration**  
Google Apps Script project: `1L2bGjBd7pXgR3UN9bGUWRcrbHhcfANKR1dOLmK7imZPaNrJk6dEsBs-e`
โฟลเดอร์นี้เป็น source version-control ของ Apps Script ฝั่ง Backend โดยไฟล์ `.gs`
แต่ละไฟล์ตรงกับไฟล์ใน Apps Script project
## Version
- Backend: `v1.3.3`
- Form: `FM-02.2-PTC-004 Rev.13 (11/07/2024)`
- Frontend ที่ออกแบบให้ทำงานร่วมกัน: `v1.3.3`
## v1.3.3 changes
- รองรับ `ProductDetails.OtherClinicalInformation` สำหรับ Clinical Pharmacology 6.13
- รองรับ structured physician proposal:
  - `UrgencyAmount`
  - `UrgencyUnit`
  - `ProposalReasonNoAlternative`
  - `ProposalReasonSafer`
  - `ProposalReasonSafetyDetail`
  - `ProposalReasonCostEffective`
  - `ProposalReasonComparisonDrug`
  - `ProposalReasonOther`
  - `ProposalReasonOtherDetail`
- บังคับ `RestrictedSpecialty` เมื่อเลือกจำกัดการสั่งใช้
- PDF generator รองรับ urgency / proposal reason / restriction checkboxes
- PDF generator ไม่แสดง raw enum `URGENT` / `NON_URGENT`
- PDF generator รองรับ `{{OtherClinicalInformation}}`
- ใช้ RMP ตาม PTC-004 Rev.13
- E2E test payload ปรับให้ผ่าน validation และ document extension rules ปัจจุบัน
## Files
- `Code.gs` — public entry points / setup helpers
- `Config.gs` — constants, schema, settings, placeholders
- `ApiService.gs` — Web App API router
- `AuthService.gs` — Admin authentication
- `AdminService.gs` — Admin workflow
- `SubmissionService.gs` — submission orchestration / persistence
- `ValidationService.gs` — server-side validation
- `SheetService.gs` — Spreadsheet data access
- `DriveService.gs` — Drive folders and document storage
- `GeneratePdfService.gs` — Google Docs template merge and PDF generation
- `EmailService.gs` — notification email delivery/logging
- `SetupService.gs` — initial setup and schema migration helpers
- `Utils.gs` — shared utility functions
- `Test.gs` — technical / E2E test helpers
## Deploy order
1. Sync `.gs` files in this folder to the Apps Script project.
2. Run `setupSystem()` to append any missing Sheet headers without removing existing data.
3. Run `validateSystemSetup()`.
4. Confirm `SystemSettings.ADMIN_NOTIFICATION_EMAILS` before any E2E test that sends real mail.
5. Deploy **Manage deployments → Edit → New version** and keep the existing `/exec` URL.
6. Verify `health` returns Backend version `1.3.3`.
7. Register/switch the approved `Drug_Formulary_Submission_Rev13_v1.3.3` Google Docs template.
8. Run one controlled submission and inspect the generated PDF.
## Email notifications
`ADMIN_NOTIFICATION_EMAILS` accepts one address or multiple addresses separated by commas.
A Google Group address can be used directly, provided the Apps Script sender is allowed to post
to that Group.
## Important
Do not commit Script Properties, passwords, access tokens, session tokens, or other secrets.
The repository contains source code only; environment-specific IDs/settings remain in Apps Script
Properties and the `SystemSettings` sheet.
