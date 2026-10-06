/**
 * Spreadsheet data access helpers.
 */
function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.SPREADSHEET_ID);
  if (!id) {
    throw appError_('SYSTEM_NOT_SETUP', 'ยังไม่ได้ Run setupSystem()');
  }
  return SpreadsheetApp.openById(id);
}
function getSheet_(sheetName) {
  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw appError_('SHEET_NOT_FOUND', 'ไม่พบ Sheet: ' + sheetName);
  }
  return sheet;
}
function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) {
    return [];
  }
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
}
function getSheetObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }
  const headers = getHeaders_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  return values.map(function (row, rowIndex) {
    const object = { __rowNumber: rowIndex + 2 };
    headers.forEach(function (header, columnIndex) {
      object[header] = row[columnIndex];
    });
    return object;
  });
}
function appendObject_(sheet, object) {
  const headers = getHeaders_(sheet);
  const row = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
  });
  sheet.appendRow(row);
  return sheet.getLastRow();
}
function appendObjects_(sheet, objects) {
  if (!objects || !objects.length) {
    return;
  }
  const headers = getHeaders_(sheet);
  const rows = objects.map(function (object) {
    return headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '';
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}
function findFirstObject_(sheet, fieldName, expectedValue) {
  const rows = getSheetObjects_(sheet);
  const expected = String(expectedValue);
  for (let i = 0; i < rows.length; i += 1) {
    if (String(rows[i][fieldName]) === expected) {
      return rows[i];
    }
  }
  return null;
}
function findObjects_(sheet, predicate) {
  return getSheetObjects_(sheet).filter(predicate);
}
function updateFirstMatch_(sheet, keyField, keyValue, updates) {
  const row = findFirstObject_(sheet, keyField, keyValue);
  if (!row) {
    return false;
  }
  updateRowByNumber_(sheet, row.__rowNumber, updates);
  return true;
}
function updateRowByNumber_(sheet, rowNumber, updates) {
  const headers = getHeaders_(sheet);
  const current = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach(function (header, index) {
    if (Object.prototype.hasOwnProperty.call(updates, header)) {
      current[index] = updates[header];
    }
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([current]);
}
function deleteRowsByField_(sheet, fieldName, expectedValue) {
  const headers = getHeaders_(sheet);
  const columnIndex = headers.indexOf(fieldName);
  if (columnIndex === -1 || sheet.getLastRow() < 2) {
    return 0;
  }
  const values = sheet.getRange(2, columnIndex + 1, sheet.getLastRow() - 1, 1).getValues();
  const rowsToDelete = [];
  values.forEach(function (row, index) {
    if (String(row[0]) === String(expectedValue)) {
      rowsToDelete.push(index + 2);
    }
  });
  rowsToDelete.sort(function (a, b) { return b - a; }).forEach(function (rowNumber) {
    sheet.deleteRow(rowNumber);
  });
  return rowsToDelete.length;
}
function getSystemSettings_() {
  const sheet = getSheet_('SystemSettings');
  const settings = {};
  getSheetObjects_(sheet).forEach(function (row) {
    settings[String(row.SettingKey)] = row.SettingValue;
  });
  return settings;
}
function setSystemSetting_(key, value, actor) {
  const sheet = getSheet_('SystemSettings');
  const updated = updateFirstMatch_(sheet, 'SettingKey', key, {
    SettingValue: value,
    UpdatedAt: new Date(),
    UpdatedBy: actor || getActorEmail_()
  });
  if (!updated) {
    appendObject_(sheet, {
      SettingKey: key,
      SettingValue: value,
      Description: '',
      UpdatedAt: new Date(),
      UpdatedBy: actor || getActorEmail_()
    });
  }
}
function getNextSubmissionNo_() {
  const year = Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy');
  const counterKey = 'SUBMISSION_' + year;
  const sheet = getSheet_('Counters');
  let row = findFirstObject_(sheet, 'CounterKey', counterKey);
  if (!row) {
    appendObject_(sheet, {
      CounterKey: counterKey,
      CounterValue: 0,
      UpdatedAt: new Date()
    });
    row = findFirstObject_(sheet, 'CounterKey', counterKey);
  }
  const nextValue = Number(row.CounterValue || 0) + 1;
  updateRowByNumber_(sheet, row.__rowNumber, {
    CounterValue: nextValue,
    UpdatedAt: new Date()
  });
  return 'DF-' + year + '-' + String(nextValue).padStart(4, '0');
}
function auditLog_(actor, action, entityType, entityId, requestId, detail) {
  try {
    appendObject_(getSheet_('AuditLog'), {
      AuditID: Utilities.getUuid(),
      Actor: actor || 'ANONYMOUS',
      Action: action,
      EntityType: entityType,
      EntityID: entityId,
      RequestID: requestId,
      CreatedAt: new Date(),
      DetailJSON: JSON.stringify(detail || {})
    });
  } catch (error) {
    console.error('Audit log failed: ' + error.message);
  }
}
