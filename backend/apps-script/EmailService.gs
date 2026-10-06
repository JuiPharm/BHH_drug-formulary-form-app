/**
 * Email notifications with logging.
 */
function sendSubmissionEmails_(submissionId, payload, pdfResult, submissionAccessToken) {
  const settings = getSystemSettings_();
  const adminEmails = String(settings.ADMIN_NOTIFICATION_EMAILS || '')
    .split(',')
    .map(function (email) { return email.trim(); })
    .filter(Boolean);
  const submission = findFirstObject_(getSheet_('Submissions'), 'SubmissionID', submissionId);
  const formAppUrl = String(settings.FORM_APP_URL || '').replace(/\/$/, '');
  const secureSubmissionLink = formAppUrl
    ? formAppUrl + '/#/submission/' + encodeURIComponent(submissionId) + '?token=' + encodeURIComponent(submissionAccessToken)
    : '';
  const subjectCompany = '[Drug Formulary] รับคำขอ ' + submission.SubmissionNo + ' - ' + submission.BrandName;
  const bodyCompany = [
    'ระบบได้รับข้อมูลการเสนอยาแล้ว',
    '',
    'เลขคำขอ: ' + submission.SubmissionNo,
    'ชื่อการค้า: ' + submission.BrandName,
    'ความแรง: ' + submission.Strength,
    'รูปแบบยา: ' + submission.DosageForm,
    'สถานะ: ' + (pdfResult && pdfResult.success ? 'รอแบบฟอร์มแพทย์ลงนาม' : 'สร้าง PDF ไม่สำเร็จ เจ้าหน้าที่จะตรวจสอบ'),
    secureSubmissionLink ? 'เปิดหน้าคำขอเพื่อดาวน์โหลด PDF: ' + secureSubmissionLink : '',
    '',
    'อีเมลนี้ส่งโดยระบบอัตโนมัติ'
  ].filter(Boolean).join('\n');
  sendAndLogEmail_(submissionId, 'ReceiptConfirmation', payload.representative.email, subjectCompany, bodyCompany);
  adminEmails.forEach(function (email) {
    const subjectAdmin = '[Drug Formulary] มีคำขอใหม่ ' + submission.SubmissionNo;
    const bodyAdmin = [
      'มีการเสนอยาใหม่',
      'เลขคำขอ: ' + submission.SubmissionNo,
      'ชื่อการค้า: ' + submission.BrandName,
      'บริษัท: ' + payload.company.companyName,
      'ผู้แทน: ' + payload.representative.name,
      'E-mail: ' + payload.representative.email,
      'Folder: ' + submission.DriveFolderURL
    ].join('\n');
    sendAndLogEmail_(submissionId, 'NewSubmissionAlert', email, subjectAdmin, bodyAdmin);
  });
}
function sendAndLogEmail_(submissionId, emailType, recipient, subject, body) {
  try {
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: body,
      name: APP.NAME
    });
    appendObject_(getSheet_('EmailLog'), {
      EmailLogID: Utilities.getUuid(),
      SubmissionID: submissionId,
      EmailType: emailType,
      RecipientEmail: recipient,
      SentAt: new Date(),
      Status: 'SUCCESS',
      ErrorMessage: ''
    });
  } catch (error) {
    appendObject_(getSheet_('EmailLog'), {
      EmailLogID: Utilities.getUuid(),
      SubmissionID: submissionId,
      EmailType: emailType,
      RecipientEmail: recipient,
      SentAt: new Date(),
      Status: 'FAILED',
      ErrorMessage: error.message
    });
  }
}
