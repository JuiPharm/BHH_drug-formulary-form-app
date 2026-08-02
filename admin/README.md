# Drug Formulary Admin App v1.0.0

Admin Dashboard สำหรับระบบเสนอยาเข้าบัญชียา โรงพยาบาลกรุงเทพหาดใหญ่

## Authentication

- Login ด้วย E-mail และ Password
- Frontend ไม่เก็บ Password
- Session token เก็บใน `sessionStorage` และหมดอายุตาม `ADMIN_SESSION_HOURS`
- Backend เก็บเฉพาะ `PasswordHash` และ `PasswordSalt` ใน Sheet `AdminUsers`
- Secret pepper เก็บใน Apps Script Script Properties ไม่ได้เก็บใน Google Sheet
- Login ผิดเกินกำหนดจะ Lock บัญชีชั่วคราว

## Backend ที่ต้องใช้

ใช้ `drug-formulary-gas-backend-v1.3.0` และ Deploy เป็น Web App เวอร์ชันใหม่

API ที่ Admin App ใช้:

- `getAdminPublicConfig`
- `adminLogin`
- `adminLogout`
- `getAdminProfile`
- `getAdminDashboardSummary`
- `listSubmissions`
- `getSubmissionDetail`
- `downloadAdminDocument`
- `adminUploadSignedPhysicianForm`
- `retryGeneratePdf`
- `updateStatus`

## ตั้งค่า Admin ครั้งแรก

1. วาง Backend v1.3.0 ใน Apps Script
2. Run `setupSystem()` อีกครั้ง เพื่อเพิ่ม Columns และ Sheet `AdminSessions`
3. ตั้ง Password ให้ Admin ที่ระบบสร้างไว้แล้ว:

```javascript
generateCurrentUserAdminPassword();
```

หรือสร้าง Admin รายใหม่:

```javascript
createAdminUser(
  'pharmacist@hospital.com',
  'ชื่อเภสัชกร',
  'PHARMACIST',
  'ตั้งรหัสผ่านที่ปลอดภัยอย่างน้อย 12 ตัวอักษรและมีตัวเลข'
);
```

ห้ามส่ง Password ผ่านแชตหรือบันทึก Password จริงลง Sheet ด้วยตนเอง

## ตั้งค่า SystemSettings

```text
ADMIN_AUTH_MODE = PASSWORD
ADMIN_SESSION_HOURS = 8
ADMIN_MAX_FAILED_LOGINS = 5
ADMIN_LOCK_MINUTES = 15
ADMIN_PASSWORD_MIN_LENGTH = 12
ADMIN_APP_URL = https://juipharm.github.io/BHH_drug-formulary-form-app/admin/
COMPANY_SIGNED_UPLOAD_ENABLED = FALSE
```

## Deploy ใน Repository เดียวกับ Form App

นำไฟล์ในชุดนี้ไปไว้ใต้โฟลเดอร์ `admin/` ของ Repository:

```text
admin/index.html
admin/assets/admin.css
admin/js/config.js
admin/js/api.js
admin/js/app.js
admin/manifest.webmanifest
```

Workflow GitHub Pages เดิมจะ Deploy ทั้ง Form App และ Admin App ทำให้เข้า Admin ได้ที่:

```text
https://juipharm.github.io/BHH_drug-formulary-form-app/admin/
```

## Security Notes

- Repository และ GitHub Pages เป็น Public ได้ เพราะไม่มี Password Hash, Pepper หรือ Session token อยู่ใน Source Code
- `API_URL` ไม่ใช่ Secret
- ห้ามใส่ Password, Password Hash หรือ Script Properties ลง GitHub
- ควรใช้ HTTPS เท่านั้น ซึ่ง GitHub Pages และ Apps Script Web App ใช้อยู่แล้ว
- เมื่อพนักงานพ้นหน้าที่ ให้ตั้ง `IsActive=FALSE` และ Run `revokeAllAdminSessions(email)`
