/**
 * Google Drive operations.
 */
function getMainFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.MAIN_FOLDER_ID);
  if (!id) {
    throw appError_('SYSTEM_NOT_SETUP', 'ไม่พบ Main folder กรุณา Run setupSystem()');
  }
  return DriveApp.getFolderById(id);
}
function getTemplateFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_KEYS.TEMPLATE_FOLDER_ID);
  if (!id) {
    throw appError_('SYSTEM_NOT_SETUP', 'ไม่พบ Templates folder กรุณา Run setupSystem()');
  }
  return DriveApp.getFolderById(id);
}
function getOrCreateChildFolder_(parentFolder, folderName) {
  const iterator = parentFolder.getFoldersByName(folderName);
  if (iterator.hasNext()) {
    return iterator.next();
  }
  return parentFolder.createFolder(folderName);
}
/**
 * สร้างโครงสร้าง Sub folder เฉพาะตอน Submit ตาม requirement
 */
function createSubmissionFolderTree_(submissionNo, product) {
  const mainFolder = getMainFolder_();
  const year = Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy');
  const yearFolder = getOrCreateChildFolder_(mainFolder, year);
  const rootFolderName = sanitizeDriveName_(
    submissionNo + '_' + product.brandName + '_' + product.strength + '_' + product.dosageForm
  );
  const rootFolder = yearFolder.createFolder(rootFolderName);
  const folderMap = {};
  SUBMISSION_FOLDER_DEFINITIONS.forEach(function (definition) {
    const folder = rootFolder.createFolder(definition.name);
    folderMap[definition.key] = {
      id: folder.getId(),
      url: folder.getUrl(),
      name: folder.getName()
    };
  });
  return {
    root: {
      id: rootFolder.getId(),
      url: rootFolder.getUrl(),
      name: rootFolder.getName()
    },
    folders: folderMap
  };
}
function uploadDocuments_(submission, documents, folderTree, representativeEmail) {
  const documentRows = [];
  const uploaded = [];
  const now = new Date();
  documents.forEach(function (document, index) {
    validateDocumentPayload_(document, index);
    const folderKey = DOCUMENT_FOLDER_KEY[document.documentType] || DOCUMENT_FOLDER_KEY.OTHER;
    const folderInfo = folderTree.folders[folderKey];
    const folder = DriveApp.getFolderById(folderInfo.id);
    const bytes = Utilities.base64Decode(stripBase64Prefix_(document.base64Data));
    const blob = Utilities.newBlob(bytes, document.mimeType, document.fileName);
    const storedFileName = buildStoredFileName_(
      document.documentType,
      submission.submissionNo,
      Number(document.version || 1),
      document.fileName
    );
    blob.setName(storedFileName);
    const file = folder.createFile(blob);
    const documentId = Utilities.getUuid();
    documentRows.push({
      DocumentID: documentId,
      SubmissionID: submission.submissionId,
      DocumentType: document.documentType,
      DocumentVersion: Number(document.version || 1),
      OriginalFileName: document.fileName,
      StoredFileName: storedFileName,
      MimeType: document.mimeType,
      FileSizeBytes: bytes.length,
      DriveFileID: file.getId(),
      DriveFolderID: folder.getId(),
      DriveFileURL: file.getUrl(),
      FileHash: computeSha256_(bytes),
      UploadedBy: representativeEmail,
      UploadedAt: now,
      ReviewStatus: 'PENDING',
      ReviewNote: '',
      IsCurrentVersion: true
    });
    uploaded.push({
      documentId: documentId,
      documentType: document.documentType,
      fileId: file.getId(),
      fileName: storedFileName,
      fileUrl: file.getUrl()
    });
  });
  appendObjects_(getSheet_('Documents'), documentRows);
  return uploaded;
}
function uploadSignedFile_(submission, filePayload, actor) {
  validateDocumentPayload_({
    documentType: DOCUMENT_TYPE.SIGNED_PHYSICIAN_FORM,
    fileName: filePayload.fileName,
    mimeType: filePayload.mimeType,
    base64Data: filePayload.base64Data
  }, 0);
  const folderMap = JSON.parse(String(submission.FolderMapJSON));
  const folderInfo = folderMap.folders.SIGNED_PHYSICIAN_FORM;
  const folder = DriveApp.getFolderById(folderInfo.id);
  const bytes = Utilities.base64Decode(stripBase64Prefix_(filePayload.base64Data));
  const existingRows = findObjects_(getSheet_('Documents'), function (row) {
    return String(row.SubmissionID) === String(submission.SubmissionID) &&
      String(row.DocumentType) === DOCUMENT_TYPE.SIGNED_PHYSICIAN_FORM &&
      toBoolean_(row.IsCurrentVersion);
  });
  existingRows.forEach(function (row) {
    updateRowByNumber_(getSheet_('Documents'), row.__rowNumber, { IsCurrentVersion: false });
  });
  const version = getNextDocumentVersion_(submission.SubmissionID, DOCUMENT_TYPE.SIGNED_PHYSICIAN_FORM);
  const storedName = buildStoredFileName_(
    DOCUMENT_TYPE.SIGNED_PHYSICIAN_FORM,
    submission.SubmissionNo,
    version,
    filePayload.fileName
  );
  const blob = Utilities.newBlob(bytes, filePayload.mimeType, storedName);
  const file = folder.createFile(blob);
  const documentId = Utilities.getUuid();
  appendObject_(getSheet_('Documents'), {
    DocumentID: documentId,
    SubmissionID: submission.SubmissionID,
    DocumentType: DOCUMENT_TYPE.SIGNED_PHYSICIAN_FORM,
    DocumentVersion: version,
    OriginalFileName: filePayload.fileName,
    StoredFileName: storedName,
    MimeType: filePayload.mimeType,
    FileSizeBytes: bytes.length,
    DriveFileID: file.getId(),
    DriveFolderID: folder.getId(),
    DriveFileURL: file.getUrl(),
    FileHash: computeSha256_(bytes),
    UploadedBy: actor,
    UploadedAt: new Date(),
    ReviewStatus: 'PENDING',
    ReviewNote: '',
    IsCurrentVersion: true
  });
  return {
    documentId: documentId,
    fileId: file.getId(),
    fileName: storedName,
    fileUrl: file.getUrl(),
    version: version
  };
}
function getNextDocumentVersion_(submissionId, documentType) {
  const rows = findObjects_(getSheet_('Documents'), function (row) {
    return String(row.SubmissionID) === String(submissionId) &&
      String(row.DocumentType) === String(documentType);
  });
  if (!rows.length) {
    return 1;
  }
  return Math.max.apply(null, rows.map(function (row) {
    return Number(row.DocumentVersion || 0);
  })) + 1;
}
function buildStoredFileName_(documentType, submissionNo, version, originalFileName) {
  const extensionMatch = String(originalFileName).match(/(\.[A-Za-z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
  const baseName = extension ? originalFileName.slice(0, -extension.length) : originalFileName;
  return sanitizeDriveName_(
    documentType + '_' + submissionNo + '_v' + String(version).padStart(2, '0') + '_' + baseName
  ) + extension;
}
function sanitizeDriveName_(name) {
  return String(name || '')
    .replace(/[\\/:*?"<>|#%{}~]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180) || 'unnamed';
}
