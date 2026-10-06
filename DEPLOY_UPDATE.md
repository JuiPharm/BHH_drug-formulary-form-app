# Deploy Form App Update v1.3.3

## What changed

Form App v1.3.3 ปรับต่อจาก v1.3.0 ให้สอดคล้องกับ PTC-004 Rev.13 ฉบับแนบล่าสุด และปรับ UX ของไฟล์ตัวอย่าง:

- ใช้คำว่า `RMP` ตลอด Form/PDF flow
- ความเร่งด่วนใช้จำนวน + หน่วย `ชั่วโมง/วัน`
- เหตุผลในการเสนอเป็น structured choices พร้อมรายละเอียด
- บังคับเลือกการจำกัดสิทธิ์แพทย์ และบังคับ Specialty เมื่อเลือกจำกัด
- Clinical Pharmacology 6.13 ใช้ `OtherClinicalInformation`
- PI Example เปลี่ยนเป็น `PI_Ryaltris.docx`
- Step 5 มี resource panel สำหรับ Template/ตัวอย่าง พร้อม badge `ตัวอย่าง` โดยใช้ Theme tokens เดิม
- Candidate PDF Template `Drug_Formulary_Submission_Rev13_v1.3.3` จัดลำดับหัวข้อบริษัท 1-15 ตาม PTC-004 Rev.13

## PublicTemplates

รายการที่เปิดใช้:

| TemplateKey | ใช้กับ | รูปแบบ |
|---|---|---|
| `PI_EXAMPLE` | Patient Information Leaflet | DOCX (Ryaltris) |
| `PRESENTATION_EXAMPLE` | PowerPoint นำเสนอข้อมูลยา | PPTX |

## Backend v1.3.3 patch

ต้องอัปเดต Apps Script source จาก v1.3.2 ก่อนสลับ Active PDF Template:

- `Config.gs`
  - เพิ่ม ProductDetails.OtherClinicalInformation
  - เพิ่ม structured physician proposal columns
  - เพิ่ม PDF placeholders สำหรับ urgency/reason/restriction checkboxes
- `SubmissionService.gs`
  - persist OtherClinicalInformation และ structured physician proposal
- `ValidationService.gs`
  - validate urgent amount/unit
  - validate restrictedSpecialty เมื่อจำกัดการสั่งใช้
  - validate structured proposal reason details
- `GeneratePdfService.gs`
  - ใช้คำไทยแทน raw enum URGENT/NON_URGENT
  - merge OtherClinicalInformation
  - render checkbox state ตามข้อมูลจริง
- `Test.gs`
  - ใช้ physician payload และนามสกุลไฟล์ที่ผ่าน validation จริง

## PDF Template

Candidate Google Docs:
`Drug_Formulary_Submission_Rev13_v1.3.3`

โครงสร้างส่วนบริษัท:
1 Brand Name
2 Generic Name
3 Manufacturer/country
4 Distributor
5 Product description (5.1-5.4)
6 Clinical Pharmacology (6.1-6.13)
7 Storage
8 RMP
9 Comparison
10 Company conditions
11 Proposed price
12 Sample quantity
13 Handy Drive
14 Consolidated PDF
15 Patient Information Leaflet

## Deploy order

1. แทนที่ Backend patch files ใน Apps Script
2. Run `setupSystem()` เพื่อเติม headers ที่ขาด (ไม่ลบข้อมูลเดิม)
3. Run `validateSystemSetup()`
4. Deploy Apps Script เป็น New version โดยคง `/exec` URL เดิม
5. ตรวจ health ว่า Backend version = 1.3.3
6. สลับ `ACTIVE_PDF_TEMPLATE_ID` ไป Candidate Template v1.3.3
7. Merge Frontend branch เข้า `main`
8. รอ GitHub Pages deploy
9. Controlled test submission 1 รายการ
10. ตรวจ PDF ว่าไม่มี raw enum, ไม่มี placeholder ค้าง, checkbox และหัวข้อ 1-15 ถูกต้อง
