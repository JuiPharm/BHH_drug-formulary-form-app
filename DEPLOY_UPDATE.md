# Deploy Form App Update v1.2.0

## What changed

Step 5 `เอกสารประกอบ` เพิ่มปุ่ม `ดาวน์โหลด Template` ติดกับช่อง Upload โดยตรงสำหรับ:

- `PATIENT_INFORMATION_LEAFLET` → `PI_TEMPLATE`
- `PRESENTATION` → `PRESENTATION_TEMPLATE`

ปุ่มจะแสดงเฉพาะเมื่อ Backend `listPublicTemplates` ส่ง Template key นั้นกลับมา หาก Template ยังไม่ Active หรือยังไม่มี DriveFileID ช่อง Upload ยังคงทำงานแต่ปุ่ม Download จะไม่แสดง

Public Templates card เดิมยังคงอยู่และใช้ download action เดียวกัน

## PublicTemplates Sheet

ตรวจ/เพิ่มข้อมูลใน Google Sheet `PublicTemplates`:

| TemplateKey | DisplayName | MimeType | IsActive | DisplayOrder |
|---|---|---|---|---:|
| `PI_TEMPLATE` | Template Patient Information Leaflet (PI) | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `TRUE` | 1 |
| `PRESENTATION_TEMPLATE` | Template PowerPoint นำเสนอข้อมูลยา | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | `TRUE` | 2 |

ใส่ `DriveFileID` ของไฟล์ Word/PPTX จริงในแต่ละแถวด้วย

## Deploy

1. Upload/replace contents of this release in the existing GitHub repository root.
2. Keep `js/config.js` `API_URL` pointed at the current Apps Script `/exec` deployment.
3. Push to `main` and wait for GitHub Pages workflow.
4. Backend ไม่ต้อง redeploy สำหรับ update นี้.
5. เปิด Form App และเข้า Step 5 ทดสอบว่า PI และ PowerPoint มีปุ่ม `ดาวน์โหลด Template` เมื่อ Sheet ตั้งค่าครบ.
6. ถ้ายังเห็นหน้าเก่า ให้ hard refresh หลัง GitHub Pages deploy เสร็จ.
