export const DOCUMENT_DEFINITIONS = Object.freeze([
  { code: 'QUOTATION', label: 'ใบเสนอราคา', description: 'ใบเสนอราคาที่เสนอแก่โรงพยาบาล', accept: ['pdf'], required: true, multiple: false },
  { code: 'TMT', label: 'เอกสาร TMT', description: 'ข้อมูลรหัสหรือรายการ TMT', accept: ['pdf', 'xls', 'xlsx'], required: true, multiple: false },
  { code: 'REGISTRATION', label: 'ใบทะเบียนยา', description: 'ใบสำคัญการขึ้นทะเบียนตำรับยา', accept: ['pdf'], required: true, multiple: false },
  { code: 'GMP', label: 'GMP', description: 'ใบรับรองมาตรฐานการผลิต', accept: ['pdf'], required: true, multiple: false },
  { code: 'CERTIFICATE_FREE_SALE', label: 'Certificate of Free Sale', description: 'บังคับเฉพาะผลิตภัณฑ์นำเข้า', accept: ['pdf'], required: false, conditionalImport: true, multiple: false },
  { code: 'PRODUCT_IMAGES', label: 'รูปภาพยาและบรรจุภัณฑ์', description: 'กล่องยา แผงยา ขวดยา หรือขนาดเม็ดยา', accept: ['pdf', 'jpg', 'jpeg', 'png'], required: true, multiple: true },
  { code: 'LABEL_TH', label: 'เอกสารกำกับยาภาษาไทย', description: 'ฉบับภาษาไทย', accept: ['pdf'], required: true, multiple: false },
  { code: 'LABEL_EN', label: 'เอกสารกำกับยาภาษาอังกฤษ', description: 'ฉบับภาษาอังกฤษ', accept: ['pdf'], required: true, multiple: false },
  { code: 'RETURN_EXCHANGE', label: 'หนังสือแจ้งแลกเปลี่ยนคืนยา', description: 'เงื่อนไขการรับเปลี่ยนหรือคืนยา', accept: ['pdf'], required: true, multiple: false },
  { code: 'PATIENT_INFORMATION_LEAFLET', label: 'Patient Information Leaflet', description: 'ต้องเป็นไฟล์ Word ที่จัดทำข้อมูลแล้ว', accept: ['doc', 'docx'], required: true, multiple: false },
  { code: 'PRESENTATION', label: 'PowerPoint นำเสนอข้อมูลยา', description: 'ไฟล์นำเสนอข้อมูลผลิตภัณฑ์', accept: ['ppt', 'pptx'], required: true, multiple: false },
  { code: 'RESEARCH_EVIDENCE', label: 'งานวิจัยสนับสนุน', description: 'PDF อย่างน้อย 1 และไม่เกิน 3 ฉบับ', accept: ['pdf'], required: true, multiple: true, minFiles: 1, maxFiles: 3, research: true },
  { code: 'COA_OR_PRODUCT_SPECIFIC', label: 'ใบวิเคราะห์หรือเอกสารเฉพาะผลิตภัณฑ์', description: 'CoA หรือเอกสารตามชนิดผลิตภัณฑ์', accept: ['pdf'], required: true, multiple: true }
]);

export const STEP_TITLES = Object.freeze([
  'ข้อมูลบริษัท',
  'ข้อมูลผลิตภัณฑ์',
  'ข้อมูลทางคลินิก',
  'ข้อมูลการเสนอ',
  'เอกสารประกอบ',
  'ตรวจสอบและส่ง'
]);

export const STATUS_LABELS = Object.freeze({
  SUBMITTED: 'ส่งคำขอแล้ว',
  AWAITING_SIGNATURE: 'รอแบบฟอร์มแพทย์ลงนาม',
  PDF_GENERATION_FAILED: 'สร้าง PDF ไม่สำเร็จ',
  DOCUMENT_REVIEW: 'อยู่ระหว่างตรวจเอกสาร'
});
