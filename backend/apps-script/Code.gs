/**
 * Entry point ของระบบ
 *
 * วิธีเริ่มต้น:
 * 1) สร้าง Standalone Apps Script project
 * 2) วางไฟล์ทั้งหมดในโครงการ
 * 3) Run ฟังก์ชัน setupSystem() หนึ่งครั้ง
 * 4) กรอก OrganizationSignatories และ ACTIVE_PDF_TEMPLATE_ID ใน Google Sheet
 * 5) Deploy เป็น Web app
 */
/**
 * สร้าง Spreadsheet file, Sheet tabs, Columns, Main folder และ Templates folder
 * โดยอัตโนมัติ การเรียกซ้ำจะไม่สร้างฐานข้อมูลชุดใหม่หาก Script Properties ยังอยู่
 */
function setupSystem() {
  return setupSystem_();
}
/**
 * ตรวจสภาพแวดล้อมและค่าตั้งต้นก่อนเปิดใช้งานจริง
 */
function validateSystemSetup() {
  return validateSystemSetup_();
}
/**
 * ลงทะเบียน Google Docs Template ที่แปลงจากแบบฟอร์มโรงพยาบาลแล้ว
 */
function registerPdfTemplate(templateDocumentId) {
  return registerPdfTemplate_(templateDocumentId);
}
/**
 * สร้าง Placeholder reference document ใน Templates folder
 */
function createTemplatePlaceholderReference() {
  return createTemplatePlaceholderReference_();
}
/**
 * สร้างหรือเปิดใช้งาน Admin พร้อมตั้ง Password แบบ Hash
 * Password จริงจะไม่ถูกบันทึกลง Google Sheet
 */
function createAdminUser(email, displayName, role, password) {
  return createAdminUser_(email, displayName, role, password);
}
/**
 * ตั้งหรือ Reset Password ให้ Admin ที่มีอยู่แล้ว
 */
function setAdminPassword(email, password) {
  return setAdminPassword_(email, password);
}
/**
 * ตั้ง Password ให้ E-mail ของบัญชี Google ที่กำลัง Run Apps Script
 */
function setCurrentUserAdminPassword(password) {
  return setCurrentUserAdminPassword_(password);
}
/**
 * สร้าง Password แบบสุ่มให้ Admin ของผู้ที่กำลัง Run Script
 * Password จะแสดงใน Execution result เพียงเพื่อคัดลอกไปใช้งาน
 */
function generateCurrentUserAdminPassword() {
  return generateCurrentUserAdminPassword_();
}
/**
 * สร้าง Password แบบสุ่มให้ Active Admin ทุกคนที่ยังไม่มี PasswordHash
 */
function generatePasswordsForUnconfiguredAdmins() {
  return generatePasswordsForUnconfiguredAdmins_();
}
/**
 * ปลด Lock บัญชี Admin หลังกรอก Password ผิดเกินกำหนด
 */
function unlockAdminUser(email) {
  return unlockAdminUser_(email);
}
/**
 * ยกเลิก Session ทั้งหมดของ Admin รายหนึ่ง
 */
function revokeAllAdminSessions(email) {
  return {
    success: true,
    revokedSessions: revokeAllAdminSessions_(email)
  };
}
/**
 * ปรับ SystemSettings.ADMIN_PASSWORD_MIN_LENGTH เป็น 8
 * ใช้สำหรับอัปเกรดระบบเดิมที่เคยตั้งค่าไว้เป็น 12
 */
function setAdminPasswordMinimumLengthToEight() {
  const sheet = getSheet_('SystemSettings');
  updateFirstMatch_(sheet, 'SettingKey', 'ADMIN_PASSWORD_MIN_LENGTH', {
    SettingValue: '8',
    Description: 'ความยาว Password ขั้นต่ำ',
    UpdatedAt: new Date(),
    UpdatedBy: getActorEmail_() || 'SYSTEM_ADMIN'
  });
  return {
    success: true,
    settingKey: 'ADMIN_PASSWORD_MIN_LENGTH',
    settingValue: '8'
  };
}
function doGet(e) {
  const action = e && e.parameter && e.parameter.action ? e.parameter.action : 'health';
  return routeApiRequest_({ action: action, payload: e ? e.parameter : {} }, e);
}
function doPost(e) {
  let request;
  try {
    request = parsePostRequest_(e);
  } catch (error) {
    return jsonResponse_({
      success: false,
      data: null,
      error: {
        code: 'INVALID_JSON',
        message: error.message
      },
      serverTime: nowIso_()
    });
  }
  return routeApiRequest_(request, e);
}
