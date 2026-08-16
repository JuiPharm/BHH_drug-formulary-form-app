# Inline Public Template Download — Design Spec

**Approved:** 2026-08-16

## Goal

ใน Step 5 `เอกสารประกอบ` ให้ช่อง Upload ของเอกสาร 2 ประเภทมีปุ่ม `ดาวน์โหลด Template` อยู่ใน document card เดียวกัน:

- `PATIENT_INFORMATION_LEAFLET` ใช้ Public Template key `PI_TEMPLATE`
- `PRESENTATION` ใช้ Public Template key `PRESENTATION_TEMPLATE`

## Behavior

1. Form App ยังคงโหลด Public Templates ผ่าน action `listPublicTemplates` ของ Backend เดิม
2. รายการ Public Templates ที่ Backend ส่งกลับจะถูกเก็บใน state ของ Form App เพื่อใช้ทั้ง sidebar และ inline document cards
3. เมื่อ render Step 5 ระบบจะ map document type → template key ตามรายการข้างต้น
4. ถ้า template key นั้นมีอยู่ในผลลัพธ์จาก Backend จะแสดงปุ่ม `ดาวน์โหลด Template` ใน document card ใกล้ช่อง Upload
5. ถ้า template ไม่มี/ไม่ได้ Active/ไม่มี DriveFileID จน Backend ไม่ส่งกลับมา จะไม่แสดงปุ่ม inline และช่อง Upload ยังใช้งานได้ตามปกติ
6. ปุ่ม inline ใช้ฟังก์ชัน `downloadPublicTemplate()` เดิม จึงไม่เปิดเผย Google Drive URL และไม่เพิ่ม API ใหม่
7. Public Templates card ด้านข้างคง behavior เดิมเพื่อ backward compatibility
8. Backend ไม่ต้องเปลี่ยนและไม่ต้อง redeploy สำหรับ feature นี้

## UI

ภายใน card ของ `Patient Information Leaflet` และ `PowerPoint นำเสนอข้อมูลยา` จะมี action row:

- file input เดิม
- ปุ่ม `ดาวน์โหลด Template` เมื่อ template พร้อมใช้งาน

บนจอแคบ action row สามารถ wrap/stack ได้โดยไม่ทำให้ file input ล้น container

## Versioning

- Form App version: `1.2.0`
- Admin App: ไม่เปลี่ยน
- Backend: ไม่เปลี่ยน

## Acceptance Tests

- mapping ของ PI ถูกต้องเป็น `PI_TEMPLATE`
- mapping ของ PowerPoint ถูกต้องเป็น `PRESENTATION_TEMPLATE`
- document type อื่นไม่มี inline template
- template ที่ไม่มีในรายการ Active ไม่สร้างปุ่ม
- template ที่มีอยู่สร้างปุ่มพร้อม key ที่ถูกต้อง
- sidebar Public Templates เดิมยังทำงาน
- Node tests เดิมทั้งหมดต้องผ่าน
