# Drug Formulary Form App v1.3.3

Static Form App สำหรับบริษัทยา ใช้งานบน GitHub Pages และเชื่อม Google Apps Script Backend ด้วย `fetch()` แบบ `text/plain;charset=utf-8`

## ฟังก์ชัน

- Multi-step form ภาษาไทย รองรับ Mobile
- ตรวจ Duplicate จาก Brand Name + Strength + Dosage Form
- RMP แบบ Yes/No
- ข้อมูลบริษัทและผู้แทน พร้อม E-mail/โทรศัพท์บังคับ
- ข้อมูลผลิตภัณฑ์และ Clinical Pharmacology ตามแบบฟอร์ม PTC
- ข้อมูลแพทย์ผู้เสนอเป็น Required ยกเว้นเบอร์โทรแพทย์เป็น Optional
- เมื่อเลือกเร่งด่วน ระบบใช้จำนวน + หน่วย (ชั่วโมง/วัน) เพื่อสร้างค่าระยะเวลาแบบมาตรฐาน; เมื่อเลือกไม่เร่งด่วน ระบบเติม `รอบการนำเสนอของคณะกรรมการ PTC` อัตโนมัติ
- ผู้เห็นชอบ 0–6 คนแบบ Optional
- Dynamic Certificate of Free Sale เมื่อเป็นผลิตภัณฑ์นำเข้า
- งานวิจัย 1–3 ฉบับ พร้อม metadata และเหตุผลเมื่อเก่ากว่า 5 ปี
- ตรวจนามสกุล ขนาดต่อไฟล์ และขนาดรวม
- Auto-save ข้อมูลข้อความลง Local Storage (ไม่เก็บไฟล์)
- Submit เอกสารไป Backend และดาวน์โหลด PDF ที่สร้างจาก Template
- ไม่เปิดให้บริษัท Upload เอกสารลงนามแล้ว; Admin เป็นผู้อัปโหลดจาก Admin App
- ดาวน์โหลด Public Templates จาก Google Drive ผ่าน Backend
- Step 5 แสดงปุ่มดาวน์โหลด Template/ตัวอย่างติดกับช่อง Upload ของ Patient Information Leaflet และ PowerPoint ตามรายการที่เปิดใช้งานใน `PublicTemplates`
- เหตุผลในการเสนอใช้ตัวเลือกตามแบบฟอร์ม PTC พร้อมรายละเอียดแบบมีเงื่อนไข
- การจำกัดสิทธิ์แพทย์เป็นข้อมูลบังคับ และบังคับระบุสาขาเมื่อเลือกจำกัด
- เพิ่ม Clinical Pharmacology 6.13 `Other Clinical Information`
- Step 6 แสดงเงื่อนไขสำคัญและ checklist ก่อน Submit

## 1. ตั้งค่า Backend URL

แก้ไฟล์ `js/config.js`

```javascript
API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
```

ต้องใช้ URL `/exec` ของ Deployment จริง ห้ามใช้ `/dev`

## 2. Backend ที่แนะนำ

ใช้ Backend v1.3.2 หรือใหม่กว่า จากนั้น:

1. แทนที่ไฟล์ `.gs` ใน Apps Script ด้วย v1.3.2
2. Run `setupSystem()` อีกครั้ง เพื่อเพิ่ม `PublicTemplates` และ Settings ใหม่ โดยไม่ลบข้อมูลเดิม
3. ตรวจ `SystemSettings`
   - `COMPANY_SIGNED_UPLOAD_ENABLED = FALSE`
   - `MAX_FILE_SIZE_MB = 10`
   - `MAX_TOTAL_UPLOAD_MB = 35`
4. Deploy > Manage deployments > Edit > New version > Deploy
5. ใช้ URL `/exec` เดิมได้ หากแก้ Deployment เดิม

## 3. ตั้งค่า Public Templates

เปิด Sheet `PublicTemplates` แล้วตั้งค่าอย่างน้อย 2 รายการนี้:

| TemplateKey | ใช้กับช่อง Upload | IsActive |
|---|---|---|
| `PI_TEMPLATE` | Patient Information Leaflet | `TRUE` |
| `PRESENTATION_TEMPLATE` | PowerPoint นำเสนอข้อมูลยา | `TRUE` |

ใส่ `DriveFileID` ของไฟล์จริงใน Google Drive และกำหนด `MimeType` ให้ตรงกับไฟล์ (`DOCX` สำหรับ PI และ `PPTX` สำหรับ PowerPoint)

Form App จะซ่อนปุ่ม inline ของ Template ที่ Backend ไม่ส่งกลับมา เช่น รายการที่ยังไม่มี DriveFileID หรือยังไม่ได้เปิดใช้งาน การแก้ข้อมูลใน `PublicTemplates` ไม่ต้อง Deploy Backend หรือ Form App ใหม่

## 4. ทดสอบในเครื่อง

เนื่องจากใช้ ES Modules ควรเปิดผ่าน Local Web Server ไม่ควร Double-click `index.html`

```bash
python -m http.server 8080
```

จากนั้นเปิด `http://localhost:8080`

## 5. Deploy GitHub Pages

1. สร้าง Repository ใหม่ เช่น `drug-formulary-form-app`
2. Upload ไฟล์ทั้งหมดในโฟลเดอร์นี้
3. Push ไปที่ branch `main`
4. Repository Settings > Pages > Source: GitHub Actions
5. Workflow `.github/workflows/deploy-pages.yml` จะ Deploy ให้อัตโนมัติ
6. นำ URL ที่ได้ไปใส่ `SystemSettings.FORM_APP_URL`

## ข้อจำกัด Phase 1

Backend ปัจจุบันส่งไฟล์ทั้งหมดใน Submit request เดียว จึงต้องจำกัดขนาดรวมตาม `MAX_TOTAL_UPLOAD_MB` หากชุดเอกสารจริงมีขนาดใหญ่กว่าข้อจำกัด ควรย้าย File Upload และ PDF processing ไป Cloud Run ใน Phase 2

## Security

- `API_URL` ไม่ใช่ Secret และสามารถอยู่ใน Static Frontend ได้
- ห้ามใส่ Google Drive File ID ที่เป็นความลับ, Credential หรือ Admin token ใน Frontend
- Submission Access Token เก็บใน `sessionStorage` เฉพาะเพื่อดาวน์โหลด PDF หลัง Submit
- บริษัทไม่มีปุ่ม Upload แบบฟอร์มลงนามแล้ว

## Admin App

Admin Dashboard อยู่ในโฟลเดอร์ `admin/` และใช้งานที่:

```text
https://juipharm.github.io/BHH_drug-formulary-form-app/admin/
```

ต้องอัปเกรด Backend เป็น v1.3.0 และตั้ง Password ด้วย `generateCurrentUserAdminPassword()` ก่อน


## Admin App v1.1.0

เมนู `เปลี่ยน Password` ต้องใช้ Backend v1.3.1 และ `ADMIN_PASSWORD_MIN_LENGTH = 8` หลังเปลี่ยนสำเร็จ ผู้ใช้ต้อง Login ใหม่


## Public Examples (v1.3.3)

รองรับ Resource keys เพิ่มเติมใน `PublicTemplates`:

| TemplateKey | ใช้กับช่อง Upload | จุดประสงค์ |
|---|---|---|
| `PI_EXAMPLE` | Patient Information Leaflet | ดาวน์โหลดตัวอย่าง PI Ryaltris (DOCX) |
| `PRESENTATION_EXAMPLE` | PowerPoint นำเสนอข้อมูลยา | ดาวน์โหลดตัวอย่าง Slide |

Resource ตัวอย่างแยกจาก `PI_TEMPLATE` / `PRESENTATION_TEMPLATE` เพื่อไม่ให้ไฟล์ตัวอย่างไปแทนที่ Template สำหรับกรอกข้อมูลจริง

ใน v1.3.3 Step 5 แสดง resource panel แยกจากช่อง Upload โดยเน้นไฟล์ตัวอย่างด้วย visual hierarchy ที่ใช้สีและ token เดิมของ Theme (`--primary`, `--primary-soft`, `--border`) พร้อม badge `ตัวอย่าง` เพื่อให้ผู้ใช้เห็นและดาวน์โหลดก่อนจัดเตรียมไฟล์ได้ชัดเจนขึ้น

ตัวอย่าง PI ปัจจุบันคือ `PI_Ryaltris.docx` และตัวอย่าง Slide เป็น PowerPoint ที่เปิดใช้งานผ่าน `PRESENTATION_EXAMPLE`.
