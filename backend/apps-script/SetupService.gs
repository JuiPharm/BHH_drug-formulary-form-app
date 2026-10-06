/**
 * Initial setup service.
 */
function setupSystem_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(APP.LOCK_TIMEOUT_MS);
  try {
    const props = PropertiesService.getScriptProperties();
    let spreadsheet = null;
    let mainFolder = null;
    let templateFolder = null;
    const existingSpreadsheetId = props.getProperty(PROP_KEYS.SPREADSHEET_ID);
    if (existingSpreadsheetId) {
      try {
        spreadsheet = SpreadsheetApp.openById(existingSpreadsheetId);
      } catch (ignore) {
        spreadsheet = null;
      }
    }
    if (!spreadsheet) {
      spreadsheet = SpreadsheetApp.create(APP.DATABASE_FILE_NAME);
      props.setProperty(PROP_KEYS.SPREADSHEET_ID, spreadsheet.getId());
    }
    initializeSheets_(spreadsheet);
    ensureAdminPasswordPepper_();
    const existingMainFolderId = props.getProperty(PROP_KEYS.MAIN_FOLDER_ID);
    if (existingMainFolderId) {
      try {
        mainFolder = DriveApp.getFolderById(existingMainFolderId);
      } catch (ignore) {
        mainFolder = null;
      }
    }
    if (!mainFolder) {
      mainFolder = DriveApp.createFolder(APP.MAIN_FOLDER_NAME);
      props.setProperty(PROP_KEYS.MAIN_FOLDER_ID, mainFolder.getId());
    }
    const existingTemplateFolderId = props.getProperty(PROP_KEYS.TEMPLATE_FOLDER_ID);
    if (existingTemplateFolderId) {
      try {
        templateFolder = DriveApp.getFolderById(existingTemplateFolderId);
      } catch (ignore) {
        templateFolder = null;
      }
    }
    if (!templateFolder) {
      templateFolder = getOrCreateChildFolder_(mainFolder, APP.TEMPLATE_FOLDER_NAME);
      props.setProperty(PROP_KEYS.TEMPLATE_FOLDER_ID, templateFolder.getId());
    }
    // จัดเก็บ Database spreadsheet ไว้ใน Main folder เพื่อให้ดูแลง่าย
    try {
      DriveApp.getFileById(spreadsheet.getId()).moveTo(mainFolder);
    } catch (moveError) {
      console.warn('ไม่สามารถย้าย Spreadsheet เข้า Main folder: ' + moveError.message);
    }
    seedSystemSettings_(spreadsheet, {
      APP_VERSION: APP.VERSION,
      ADMIN_PASSWORD_MIN_LENGTH: '8',
      DATABASE_SPREADSHEET_ID: spreadsheet.getId(),
      MAIN_FOLDER_ID: mainFolder.getId(),
      TEMPLATE_FOLDER_ID: templateFolder.getId()
    });
    seedOrganizationSignatories_(spreadsheet);
    seedInitialAdminUser_(spreadsheet);
    seedPublicTemplateRows_(spreadsheet);
    seedCounter_(spreadsheet, 'SUBMISSION_' + Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy'));
    applySheetFormatting_(spreadsheet);
    props.setProperty(PROP_KEYS.SETUP_AT, nowIso_());
    const result = {
      success: true,
      message: 'สร้างระบบพื้นฐานสำเร็จ',
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      mainFolderId: mainFolder.getId(),
      mainFolderUrl: mainFolder.getUrl(),
      templateFolderId: templateFolder.getId(),
      templateFolderUrl: templateFolder.getUrl(),
      nextSteps: [
        'กรอกข้อมูล PTC_CHAIRPERSON และ HOSPITAL_DIRECTOR ใน Sheet OrganizationSignatories',
        'แปลง Template แบบฟอร์มต้นฉบับเป็น Google Docs และใส่ Placeholder',
        'Run registerPdfTemplate(templateDocumentId)',
        'Run setCurrentUserAdminPassword("รหัสผ่านที่ปลอดภัย") เพื่อเปิดใช้ Admin Login',
        'Run validateSystemSetup() ก่อน Deploy Web app'
      ]
    };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}
function initializeSheets_(spreadsheet) {
  const schemaNames = Object.keys(SHEET_SCHEMAS);
  const defaultSheet = spreadsheet.getSheets()[0];
  schemaNames.forEach(function (sheetName, index) {
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      if (index === 0 && defaultSheet && defaultSheet.getName() === 'Sheet1') {
        defaultSheet.setName(sheetName);
        sheet = defaultSheet;
      } else {
        sheet = spreadsheet.insertSheet(sheetName);
      }
    }
    ensureHeaders_(sheet, SHEET_SCHEMAS[sheetName]);
  });
  // ไม่ลบ Sheet ที่ผู้ดูแลสร้างเพิ่มเอง เพื่อป้องกันข้อมูลสูญหายเมื่อ Run setupSystem() ซ้ำ
  const unusedDefaultSheet = spreadsheet.getSheetByName('Sheet1');
  if (unusedDefaultSheet && schemaNames.indexOf('Sheet1') === -1 && spreadsheet.getSheets().length > 1 && unusedDefaultSheet.getLastRow() <= 1) {
    spreadsheet.deleteSheet(unusedDefaultSheet);
  }
}
function ensureHeaders_(sheet, headers) {
  const currentLastColumn = Math.max(sheet.getLastColumn(), 1);
  const existingHeaders = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0];
  const hasDataRows = sheet.getLastRow() > 1;
  if (hasDataRows) {
    const normalizedExisting = existingHeaders.map(String);
    const missing = headers.filter(function (header) {
      return normalizedExisting.indexOf(header) === -1;
    });
    if (missing.length) {
      sheet.getRange(1, normalizedExisting.length + 1, 1, missing.length).setValues([missing]);
    }
  } else {
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  const finalHeaders = getHeaders_(sheet);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, finalHeaders.length)
    .setFontWeight('bold')
    .setWrap(true);
}
function seedSystemSettings_(spreadsheet, overrides) {
  const sheet = spreadsheet.getSheetByName('SystemSettings');
  const existingRows = getSheetObjects_(sheet);
  const existingKeys = {};
  existingRows.forEach(function (row) {
    existingKeys[String(row.SettingKey)] = true;
  });
  SYSTEM_SETTING_DEFAULTS.forEach(function (item) {
    const key = item[0];
    if (!existingKeys[key]) {
      appendObject_(sheet, {
        SettingKey: key,
        SettingValue: overrides && Object.prototype.hasOwnProperty.call(overrides, key)
          ? overrides[key]
          : item[1],
        Description: item[2],
        UpdatedAt: new Date(),
        UpdatedBy: 'SYSTEM_SETUP'
      });
    } else if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
      updateFirstMatch_(sheet, 'SettingKey', key, {
        SettingValue: overrides[key],
        UpdatedAt: new Date(),
        UpdatedBy: 'SYSTEM_SETUP'
      });
    }
  });
}
function seedOrganizationSignatories_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('OrganizationSignatories');
  const existingRows = getSheetObjects_(sheet);
  const roles = existingRows.map(function (row) { return String(row.RoleCode); });
  [SIGNATORY_ROLE.PTC_CHAIRPERSON, SIGNATORY_ROLE.HOSPITAL_DIRECTOR].forEach(function (role, index) {
    if (roles.indexOf(role) === -1) {
      appendObject_(sheet, {
        SignatoryID: Utilities.getUuid(),
        RoleCode: role,
        DisplayName: '',
        ProfessionalTitle: '',
        PositionTitleTH: role === SIGNATORY_ROLE.PTC_CHAIRPERSON
          ? 'ประธานคณะกรรมการเภสัชกรรมและการบำบัด'
          : 'กรรมการผู้จัดการและผู้อำนวยการโรงพยาบาล',
        PositionTitleEN: role === SIGNATORY_ROLE.PTC_CHAIRPERSON
          ? 'PTC Chairperson'
          : 'Hospital Director',
        EffectiveFrom: '',
        EffectiveTo: '',
        IsActive: false,
        DisplayOrder: index + 1,
        UpdatedAt: new Date(),
        UpdatedBy: 'SYSTEM_SETUP'
      });
    }
  });
}
function seedInitialAdminUser_(spreadsheet) {
  const email = Session.getEffectiveUser().getEmail();
  if (!email) {
    return;
  }
  const sheet = spreadsheet.getSheetByName('AdminUsers');
  const existing = findObjects_(sheet, function (row) {
    return String(row.Email || '').toLowerCase() === String(email).toLowerCase();
  })[0];
  if (!existing) {
    appendObject_(sheet, {
      Email: String(email).toLowerCase(),
      DisplayName: '',
      Role: 'SYSTEM_ADMIN',
      PasswordHash: '',
      PasswordSalt: '',
      PasswordAlgorithm: '',
      PasswordChangedAt: '',
      FailedLoginCount: 0,
      LockedUntil: '',
      LastLoginAt: '',
      IsActive: true,
      CreatedAt: new Date(),
      UpdatedAt: new Date()
    });
  }
}
function seedCounter_(spreadsheet, counterKey) {
  const sheet = spreadsheet.getSheetByName('Counters');
  if (!findFirstObject_(sheet, 'CounterKey', counterKey)) {
    appendObject_(sheet, {
      CounterKey: counterKey,
      CounterValue: 0,
      UpdatedAt: new Date()
    });
  }
}
function applySheetFormatting_(spreadsheet) {
  Object.keys(SHEET_SCHEMAS).forEach(function (sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    const headers = getHeaders_(sheet);
    sheet.autoResizeColumns(1, headers.length);
    sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), headers.length)
      .setVerticalAlignment('top');
  });
  const signatorySheet = spreadsheet.getSheetByName('OrganizationSignatories');
  const signatoryHeaders = getHeaders_(signatorySheet);
  const activeColumn = signatoryHeaders.indexOf('IsActive') + 1;
  if (activeColumn > 0) {
    const rule = SpreadsheetApp.newDataValidation()
      .requireCheckbox()
      .build();
    signatorySheet.getRange(2, activeColumn, Math.max(signatorySheet.getMaxRows() - 1, 1), 1)
      .setDataValidation(rule);
  }
  ['AdminUsers', 'PublicTemplates'].forEach(function (sheetName) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    const headers = getHeaders_(sheet);
    const isActiveColumn = headers.indexOf('IsActive') + 1;
    if (isActiveColumn > 0) {
      const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
      sheet.getRange(2, isActiveColumn, Math.max(sheet.getMaxRows() - 1, 1), 1)
        .setDataValidation(checkboxRule);
    }
  });
}
function registerPdfTemplate_(templateDocumentId) {
  assertNonEmptyString_(templateDocumentId, 'templateDocumentId');
  const file = DriveApp.getFileById(templateDocumentId);
  if (file.getMimeType() !== MimeType.GOOGLE_DOCS) {
    throw appError_('INVALID_TEMPLATE_TYPE', 'Template ต้องเป็น Google Docs');
  }
  const spreadsheet = getSpreadsheet_();
  updateFirstMatch_(spreadsheet.getSheetByName('SystemSettings'), 'SettingKey', 'ACTIVE_PDF_TEMPLATE_ID', {
    SettingValue: templateDocumentId,
    UpdatedAt: new Date(),
    UpdatedBy: getActorEmail_()
  });
  return {
    success: true,
    templateDocumentId: templateDocumentId,
    templateName: file.getName(),
    templateUrl: file.getUrl()
  };
}
function createTemplatePlaceholderReference_() {
  const folder = getTemplateFolder_();
  const document = DocumentApp.create('Drug Formulary Template Placeholder Reference');
  const file = DriveApp.getFileById(document.getId());
  file.moveTo(folder);
  const body = document.getBody();
  body.appendParagraph('Drug Formulary Submission — Template Placeholder Reference')
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('ให้นำแบบฟอร์มต้นฉบับไปแปลงเป็น Google Docs แล้วแทนช่องข้อมูลด้วย Placeholder ต่อไปนี้');
  Object.keys(PLACEHOLDERS).forEach(function (key) {
    body.appendParagraph(key + ' = ' + PLACEHOLDERS[key]);
  });
  for (let i = 1; i <= APP.MAX_APPROVERS; i += 1) {
    body.appendParagraph('Approver' + i + 'Name = {{Approver' + i + 'Name}}');
    body.appendParagraph('Approver' + i + 'Department = {{Approver' + i + 'Department}}');
  }
  document.saveAndClose();
  return {
    success: true,
    documentId: document.getId(),
    documentUrl: file.getUrl()
  };
}
function validateSystemSetup_() {
  const errors = [];
  const warnings = [];
  let spreadsheet;
  let mainFolder;
  try {
    spreadsheet = getSpreadsheet_();
  } catch (error) {
    errors.push(error.message);
  }
  try {
    mainFolder = getMainFolder_();
  } catch (error) {
    errors.push(error.message);
  }
  if (spreadsheet) {
    Object.keys(SHEET_SCHEMAS).forEach(function (sheetName) {
      const sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) {
        errors.push('ไม่พบ Sheet: ' + sheetName);
        return;
      }
      const headers = getHeaders_(sheet);
      SHEET_SCHEMAS[sheetName].forEach(function (header) {
        if (headers.indexOf(header) === -1) {
          errors.push('Sheet ' + sheetName + ' ไม่มี Column: ' + header);
        }
      });
    });
    const settings = getSystemSettings_();
    if (!settings.ACTIVE_PDF_TEMPLATE_ID) {
      errors.push('ยังไม่ได้กำหนด ACTIVE_PDF_TEMPLATE_ID');
    } else {
      try {
        const templateFile = DriveApp.getFileById(settings.ACTIVE_PDF_TEMPLATE_ID);
        if (templateFile.getMimeType() !== MimeType.GOOGLE_DOCS) {
          errors.push('ACTIVE_PDF_TEMPLATE_ID ต้องเป็น Google Docs');
        }
      } catch (error) {
        errors.push('ไม่สามารถเปิด PDF Template: ' + error.message);
      }
    }
    [SIGNATORY_ROLE.PTC_CHAIRPERSON, SIGNATORY_ROLE.HOSPITAL_DIRECTOR].forEach(function (role) {
      try {
        getActiveSignatory_(role, new Date());
      } catch (error) {
        errors.push(error.message);
      }
    });
    if (!settings.DOCUMENT_REVISION || String(settings.DOCUMENT_REVISION).indexOf('กรุณา') === 0) {
      warnings.push('ควรกำหนด DOCUMENT_REVISION ที่ผ่านการอนุมัติจากฝ่ายควบคุมเอกสาร');
    }
    const authMode = String(settings.ADMIN_AUTH_MODE || 'PASSWORD').toUpperCase();
    if ((authMode === 'GOOGLE' || authMode === 'BOTH') && !settings.GOOGLE_CLIENT_ID) {
      warnings.push('ADMIN_AUTH_MODE เปิด Google Login แต่ยังไม่ได้กำหนด GOOGLE_CLIENT_ID');
    }
    const activeAdmins = findObjects_(spreadsheet.getSheetByName('AdminUsers'), function (row) {
      return toBoolean_(row.IsActive);
    });
    if (!activeAdmins.length) {
      warnings.push('ยังไม่มี Active Admin ใน Sheet AdminUsers');
    }
    if (authMode === 'PASSWORD' || authMode === 'BOTH') {
      const passwordAdmins = activeAdmins.filter(function (row) {
        return Boolean(row.PasswordHash && row.PasswordSalt);
      });
      if (!passwordAdmins.length) {
        warnings.push('ยังไม่มี Active Admin ที่ตั้ง Password แล้ว ให้ Run setCurrentUserAdminPassword(password) หรือ createAdminUser(...)');
      }
      if (!PropertiesService.getScriptProperties().getProperty(PROP_KEYS.ADMIN_PASSWORD_PEPPER)) {
        errors.push('ไม่พบ ADMIN_PASSWORD_PEPPER ใน Script Properties กรุณา Run setupSystem() อีกครั้ง');
      }
    }
  }
  return {
    success: errors.length === 0,
    readyForProduction: errors.length === 0,
    errors: errors,
    warnings: warnings,
    spreadsheetUrl: spreadsheet ? spreadsheet.getUrl() : null,
    mainFolderUrl: mainFolder ? mainFolder.getUrl() : null
  };
}
function seedPublicTemplateRows_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('PublicTemplates');
  const existing = getSheetObjects_(sheet);
  const keys = existing.map(function (row) { return String(row.TemplateKey); });
  const defaults = [
    ['PI_TEMPLATE', 'Template เอกสารกำกับยาสำหรับประชาชน (PI)', 'ไฟล์ Word สำหรับจัดทำ Patient Information Leaflet', 1],
    ['BLANK_SUBMISSION_FORM', 'แบบฟอร์มเสนอยาเปล่า', 'แบบฟอร์มสำหรับตรวจสอบโครงสร้างข้อมูล', 2],
    ['SELECTION_CRITERIA', 'เกณฑ์การคัดเลือกยา', 'เกณฑ์และเงื่อนไขการเสนอยาเข้าโรงพยาบาล', 3]
  ];
  defaults.forEach(function (item) {
    if (keys.indexOf(item[0]) === -1) {
      appendObject_(sheet, {
        TemplateKey: item[0],
        DisplayName: item[1],
        Description: item[2],
        DriveFileID: '',
        MimeType: '',
        IsActive: false,
        DisplayOrder: item[3],
        UpdatedAt: new Date(),
        UpdatedBy: 'SYSTEM_SETUP'
      });
    }
  });
}
