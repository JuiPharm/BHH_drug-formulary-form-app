# Deploy Form App Update v1.3.0

## What changed

Form App v1.3.0 ปรับข้อมูลให้สอดคล้องกับ PTC-004 Rev.13 และ workflow ฝ่ายเภสัชกรรม:

- ใช้คำว่า `RMP` ใน Form และ PDF Template
- ความเร่งด่วนแบบเร่งด่วนใช้จำนวน + หน่วย `ชั่วโมง/วัน` และสร้าง `urgencyDuration` อัตโนมัติ
- เหตุผลในการเสนอเป็นตัวเลือกตามแบบฟอร์ม พร้อมรายละเอียดแบบมีเงื่อนไข และรวมกลับลง `proposalReason` เพื่อรองรับ Backend เดิม
- บังคับเลือกการจำกัดสิทธิ์แพทย์ และบังคับ Specialty เมื่อเลือกจำกัด
- เพิ่ม Clinical Pharmacology 6.13 `OtherClinicalInformation`
- เพิ่มเงื่อนไขสำคัญและ checklist ก่อน Submit
- รองรับปุ่มดาวน์โหลดตัวอย่าง PI และ Slide Presentation ติดกับช่อง Upload

## PublicTemplates

เพิ่ม Resource keys ต่อไปนี้ใน Sheet `PublicTemplates` และตั้ง `IsActive = TRUE`:

| TemplateKey | ใช้กับ | รูปแบบ |
|---|---|---|
| `PI_EXAMPLE` | Patient Information Leaflet | PDF |
| `PRESENTATION_EXAMPLE` | PowerPoint นำเสนอข้อมูลยา | PPTX |

ตัวอย่างถูกแยกจาก `PI_TEMPLATE` และ `PRESENTATION_TEMPLATE` เพื่อให้สามารถเปลี่ยน Template สำหรับกรอกจริงได้โดยไม่กระทบตัวอย่าง

## Database / PDF Template

- `SystemSettings.DOCUMENT_REVISION` = `Rev.13 (11/07/2024)`
- `ProductDetails` เพิ่ม column `OtherClinicalInformation`
- Active PDF Template เปลี่ยนคำว่า SMP เป็น RMP
- หัวข้อ 6.13 ใช้ placeholder `{{OtherClinicalInformation}}`
- ส่วนเหตุผลในการเสนอใช้ `{{ProposalReason}}`

## Deploy

1. Merge branch เข้า `main`
2. รอ GitHub Pages workflow deploy สำเร็จ
3. Hard refresh Form App
4. ตรวจ Step 3, Step 4, Step 5 และ Step 6
5. ทดสอบดาวน์โหลด `PI_EXAMPLE` และ `PRESENTATION_EXAMPLE`
6. ทำ test submission 1 รายการก่อนเปิดใช้งานจริง เพื่อยืนยันว่า Backend ที่ deploy อยู่บันทึก `OtherClinicalInformation` และ merge ลง PDF ได้ครบ

> หมายเหตุ: field เดิม เช่น `proposalReason` และ `urgencyDuration` ยังคงถูกส่งต่อเพื่อ backward compatibility
