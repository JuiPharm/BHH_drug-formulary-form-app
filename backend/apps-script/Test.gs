/**
 * ทดสอบระบบแบบ End-to-End ผ่าน Web App URL จริง
 *
 * หมายเหตุ:
 * - ไฟล์แนบเป็นไฟล์ข้อความจำลอง สำหรับทดสอบระบบเท่านั้น
 * - ฟังก์ชันนี้จะสร้าง Submission, Folder และส่ง E-mail จริง
 */
function testSubmitViaWebApp() {
  const WEB_APP_URL =
    'https://script.google.com/macros/s/AKfycbx1AN9051Amkcfc9RDIkBQJXkxG0M-IGOJ_1m6aWqctbW_z6f7PhXqEKdP1Wjd9kgNx4A/exec';
  const TEST_BRAND_NAME = 'TEST-DRUG-E2E-003';
  if (!WEB_APP_URL || WEB_APP_URL.indexOf('/exec') === -1) {
    throw new Error('กรุณาใส่ Web App URL ที่ลงท้ายด้วย /exec');
  }
  const testEmail = Session.getEffectiveUser().getEmail();
  if (!testEmail) {
    throw new Error('ไม่พบ E-mail ของบัญชีที่กำลัง Run Script');
  }
  const testFileContent =
    'Technical test document for Drug Formulary Submission System';
  const testFileBase64 = Utilities.base64Encode(
    Utilities.newBlob(
      testFileContent,
      'text/plain',
      'technical-test.txt'
    ).getBytes()
  );
  function createTestDocument(documentType, fileName, mimeType) {
    return {
      documentType: documentType,
      fileName: fileName,
      mimeType: mimeType,
      base64Data: testFileBase64
    };
  }
  const requestBody = {
    action: 'submitApplication',
    requestId: Utilities.getUuid(),
    payload: {
      company: {
        companyName: 'บริษัท ทดสอบระบบ จำกัด',
        companyAddress: 'กรุงเทพมหานคร ประเทศไทย',
        companyEmail: testEmail,
        companyPhone: '02-123-4567',
        companyPhoneExtension: '101'
      },
      representative: {
        name: 'ผู้แทนทดสอบระบบ',
        position: 'Medical Representative',
        email: testEmail,
        phone: '081-234-5678',
        alternatePhone: ''
      },
      product: {
        brandName: TEST_BRAND_NAME,
        genericName: 'Test generic name',
        strength: '500 mg',
        dosageForm: 'Film-coated tablet',
        manufacturerName: 'Test Manufacturing Company',
        countryOfManufacture: 'Thailand',
        thailandDistributor: 'บริษัท ทดสอบระบบ จำกัด',
        classification: 'Test classification',
        chemicalComposition: 'Test substance 500 mg',
        unitQuantity: '10 tablets per blister',
        shelfLife: '24 months',
        indication: 'ใช้สำหรับทดสอบระบบเท่านั้น',
        pharmacologicalAction: 'ข้อมูลจำลองสำหรับทดสอบระบบ',
        sideEffects: 'ข้อมูลจำลองสำหรับทดสอบระบบ',
        contraindications: 'ข้อมูลจำลองสำหรับทดสอบระบบ',
        dosage: 'ข้อมูลจำลองสำหรับทดสอบระบบ',
        drugInteraction: 'ข้อมูลจำลองสำหรับทดสอบระบบ',
        pregnancyLactation: 'ข้อมูลจำลองสำหรับทดสอบระบบ',
        pediatricGeriatricUse: 'ข้อมูลจำลองสำหรับทดสอบระบบ',
        hepaticRenalDoseAdjustment: 'ข้อมูลจำลองสำหรับทดสอบระบบ',
        tabletCrushingSplitting: 'สามารถแบ่งเม็ดยาได้',
        stabilityAfterReconstitution: 'ไม่เกี่ยวข้อง',
        otherClinicalInformation: 'ข้อมูลทางคลินิกอื่นสำหรับทดสอบ PDF placeholder 6.13',
        storage: 'เก็บที่อุณหภูมิต่ำกว่า 30 องศาเซลเซียส',
        rmp: false,
        isImportedProduct: false,
        comparableExistingDrug: 'ยาทดสอบเปรียบเทียบ',
        comparativeAdvantage: 'ข้อมูลจำลองสำหรับทดสอบระบบ',
        costPerCourse: '1,000 บาทต่อ Course',
        proposedPrice: '100 บาทต่อหน่วย',
        sampleQuantity: '10 หน่วย'
      },
      physicianProposal: {
        name: 'แพทย์ทดสอบ ระบบ',
        professionalTitle: 'นพ.',
        department: 'อายุรกรรม',
        specialty: 'อายุรแพทย์',
        phone: '0812345678',
        urgency: 'URGENT',
        urgencyDuration: 'ภายใน 24 ชั่วโมง',
        urgencyAmount: 24,
        urgencyUnit: 'HOURS',
        proposalReason: 'ไม่มียาอื่นในเภสัชตำรับที่ใช้ในข้อบ่งใช้นี้',
        proposalReasonStructured: {
          noAlternative: true,
          safer: false,
          safetyDetail: '',
          costEffective: false,
          comparisonDrug: '',
          other: false,
          otherDetail: ''
        },
        useRestrictionRequired: true,
        restrictedSpecialty: 'อายุรแพทย์',
        drugToRemove: '-',
        impactIfNotApproved: 'ข้อมูลจำลองสำหรับทดสอบผลกระทบต่อผู้ป่วย'
      },
      // ผู้เห็นชอบเป็น Optional
      physicianApprovers: [],
      documents: [
        createTestDocument(
          'QUOTATION',
          '01-quotation-test.pdf',
          'application/pdf'
        ),
        createTestDocument(
          'TMT',
          '02-tmt-test.xlsx',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ),
        createTestDocument(
          'REGISTRATION',
          '03-registration-test.pdf',
          'application/pdf'
        ),
        createTestDocument(
          'GMP',
          '04-gmp-test.pdf',
          'application/pdf'
        ),
        createTestDocument(
          'PRODUCT_IMAGES',
          '05-product-image-test.png',
          'image/png'
        ),
        createTestDocument(
          'LABEL_TH',
          '06-label-th-test.pdf',
          'application/pdf'
        ),
        createTestDocument(
          'LABEL_EN',
          '07-label-en-test.pdf',
          'application/pdf'
        ),
        createTestDocument(
          'RETURN_EXCHANGE',
          '08-return-exchange-test.pdf',
          'application/pdf'
        ),
        createTestDocument(
          'PATIENT_INFORMATION_LEAFLET',
          '09-pil-test.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ),
        createTestDocument(
          'PRESENTATION',
          '10-presentation-test.pptx',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ),
        createTestDocument(
          'RESEARCH_EVIDENCE',
          '11-research-test.pdf',
          'application/pdf'
        ),
        createTestDocument(
          'COA_OR_PRODUCT_SPECIFIC',
          '12-coa-test.pdf',
          'application/pdf'
        )
      ],
      researchEvidence: [
        {
          title: 'Technical Test Research',
          journal: 'Technical Test Journal',
          publicationYear: 2026,
          studyType: 'Technical Test',
          doi: '',
          pmid: '',
          isLandmarkStudy: false,
          olderEvidenceJustification: ''
        }
      ]
    }
  };
  const response = UrlFetchApp.fetch(WEB_APP_URL, {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
    followRedirects: true
  });
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  console.log('HTTP Status: ' + responseCode);
  console.log(responseText);
  const result = JSON.parse(responseText);
  if (result.success && result.data) {
    // เก็บข้อมูลไว้สำหรับทดสอบ Download PDF และ Upload Signed Form
    PropertiesService.getUserProperties().setProperties({
      TEST_SUBMISSION_ID: String(result.data.submissionId || ''),
      TEST_SUBMISSION_NO: String(result.data.submissionNo || ''),
      TEST_SUBMISSION_ACCESS_TOKEN:
        String(result.data.submissionAccessToken || ''),
      TEST_WEB_APP_URL: WEB_APP_URL
    });
    console.log(
      'สร้างคำขอสำเร็จ: ' + result.data.submissionNo
    );
    console.log(
      'สถานะ: ' + result.data.status
    );
    console.log(
      'Folder: ' + result.data.driveFolderUrl
    );
    console.log(
      'เก็บ Submission ID และ Token ไว้ใน User Properties แล้ว'
    );
  }
  return result;
}
/**
 * อ่านข้อมูลคำขอทดสอบที่บันทึกไว้หลัง Submit
 */
function getSavedTestContext_() {
  const properties =
    PropertiesService.getUserProperties().getProperties();
  const context = {
    webAppUrl: properties.TEST_WEB_APP_URL || '',
    submissionId: properties.TEST_SUBMISSION_ID || '',
    submissionNo: properties.TEST_SUBMISSION_NO || '',
    submissionAccessToken:
      properties.TEST_SUBMISSION_ACCESS_TOKEN || ''
  };
  if (!context.webAppUrl) {
    throw new Error(
      'ไม่พบ TEST_WEB_APP_URL กรุณา Run testSubmitViaWebApp() ให้สำเร็จก่อน'
    );
  }
  if (!context.submissionId) {
    throw new Error(
      'ไม่พบ TEST_SUBMISSION_ID กรุณา Run testSubmitViaWebApp() ให้สำเร็จก่อน'
    );
  }
  if (!context.submissionAccessToken) {
    throw new Error(
      'ไม่พบ TEST_SUBMISSION_ACCESS_TOKEN กรุณา Submit ใหม่เพื่อรับ Token'
    );
  }
  return context;
}
/**
 * เรียก Web App API สำหรับการทดสอบ
 */
function callTestApi_(action, payload) {
  const context = getSavedTestContext_();
  const requestBody = {
    action: action,
    requestId: Utilities.getUuid(),
    payload: payload || {}
  };
  const response = UrlFetchApp.fetch(context.webAppUrl, {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
    followRedirects: true
  });
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  console.log('Action: ' + action);
  console.log('HTTP Status: ' + responseCode);
  console.log(responseText);
  let result;
  try {
    result = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      'Web App ไม่ได้ส่ง JSON กลับมา: ' + responseText
    );
  }
  if (!result.success) {
    const errorCode =
      result.error && result.error.code
        ? result.error.code
        : 'UNKNOWN_ERROR';
    const errorMessage =
      result.error && result.error.message
        ? result.error.message
        : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
    throw new Error(
      errorCode + ': ' + errorMessage
    );
  }
  return result;
}
/**
 * Test 1: ตรวจสถานะคำขอ
 */
function testGetSubmissionStatus() {
  const context = getSavedTestContext_();
  const result = callTestApi_(
    'getSubmissionStatus',
    {
      submissionId: context.submissionId,
      submissionAccessToken:
        context.submissionAccessToken
    }
  );
  console.log(
    'Submission No: ' + result.data.submissionNo
  );
  console.log(
    'Current Status: ' + result.data.currentStatus
  );
  console.log(
    'Generated PDF Available: ' +
      result.data.generatedPdfAvailable
  );
  console.log(
    'Signed Form Received: ' +
      result.data.signedFormReceived
  );
  return result;
}
/**
 * Test 2: ดาวน์โหลด PDF และบันทึกใน My Drive
 */
function testDownloadGeneratedPdf() {
  const context = getSavedTestContext_();
  const result = callTestApi_(
    'downloadGeneratedPdf',
    {
      submissionId: context.submissionId,
      submissionAccessToken:
        context.submissionAccessToken
    }
  );
  const fileData = result.data;
  if (!fileData.base64Data) {
    throw new Error('API ไม่ได้ส่งข้อมูล PDF กลับมา');
  }
  const bytes = Utilities.base64Decode(
    fileData.base64Data
  );
  const blob = Utilities.newBlob(
    bytes,
    fileData.mimeType || 'application/pdf',
    fileData.fileName || 'generated-form.pdf'
  );
  const testFolderName =
    'Drug Formulary API Test Downloads';
  const existingFolders =
    DriveApp.getFoldersByName(testFolderName);
  const testFolder = existingFolders.hasNext()
    ? existingFolders.next()
    : DriveApp.getRootFolder().createFolder(
        testFolderName
      );
  const savedFile = testFolder.createFile(blob);
  console.log(
    'ดาวน์โหลด PDF สำเร็จ: ' + savedFile.getName()
  );
  console.log(
    'เปิดไฟล์: ' + savedFile.getUrl()
  );
  PropertiesService
    .getUserProperties()
    .setProperty(
      'TEST_DOWNLOADED_PDF_FILE_ID',
      savedFile.getId()
    );
  return {
    success: true,
    fileId: savedFile.getId(),
    fileName: savedFile.getName(),
    fileUrl: savedFile.getUrl()
  };
}
/**
 * Test 3: ใช้ PDF เดิมเป็นไฟล์ลงนามจำลอง
 *
 * สำหรับทดสอบระบบเท่านั้น
 * ไม่ใช่การลงนามจริง
 */
function testUploadSignedPhysicianForm() {
  const context = getSavedTestContext_();
  // ดาวน์โหลด PDF ที่ระบบสร้างก่อน
  const downloadResult = callTestApi_(
    'downloadGeneratedPdf',
    {
      submissionId: context.submissionId,
      submissionAccessToken:
        context.submissionAccessToken
    }
  );
  const generatedPdf = downloadResult.data;
  const signedTestFileName =
    'SIGNED_TEST_' + generatedPdf.fileName;
  const uploadResult = callTestApi_(
    'uploadSignedPhysicianForm',
    {
      submissionId: context.submissionId,
      submissionAccessToken:
        context.submissionAccessToken,
      fileName: signedTestFileName,
      mimeType:
        generatedPdf.mimeType || 'application/pdf',
      base64Data: generatedPdf.base64Data,
      uploadedBy:
        Session.getEffectiveUser().getEmail() ||
        'TECHNICAL_TEST'
    }
  );
  console.log(
    'อัปโหลดไฟล์ลงนามจำลองสำเร็จ'
  );
  console.log(
    'ชื่อไฟล์: ' + uploadResult.data.fileName
  );
  console.log(
    'Drive URL: ' + uploadResult.data.fileUrl
  );
  // ตรวจสถานะหลัง Upload
  const statusResult = callTestApi_(
    'getSubmissionStatus',
    {
      submissionId: context.submissionId,
      submissionAccessToken:
        context.submissionAccessToken
    }
  );
  console.log(
    'สถานะใหม่: ' +
      statusResult.data.currentStatus
  );
  console.log(
    'Signed Form Received: ' +
      statusResult.data.signedFormReceived
  );
  return {
    upload: uploadResult.data,
    status: statusResult.data
  };
}
