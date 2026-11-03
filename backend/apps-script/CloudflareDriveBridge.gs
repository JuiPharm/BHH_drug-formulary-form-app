/**
 * Cloudflare -> Apps Script Drive bridge (preproduction only).
 *
 * Uses the SAME DriveApp account and folder naming conventions as DriveService.gs,
 * not a Google API service account. Deploy only in a separate STAGING Apps Script
 * project/deployment; do NOT install this bridge on the production Web App.
 *
 * Script Properties, configured only in staging:
 *   BHH_BRIDGE_SECRET             high entropy shared HMAC secret
 *   BHH_BRIDGE_STAGING_FOLDER_ID dedicated sandbox Drive folder
 *
 * Request signed by Worker:
 * { action:'cloudflareBridge', requestId, bridgeAuth:{timestamp,nonce,signature},
 *   payloadBase64: base64(utf8(JSON.stringify({operation,payload}))) }
 */
function processCloudflareBridge_(request) {
  const command = verifyCloudflareBridgeRequest_(request);
  switch (command.operation) {
    case 'ping':
      return { available: true, provider: 'DriveApp', mode: 'STAGING' };
    case 'createSubmissionFolders':
      return bridgeCreateSubmissionFolders_(command.payload);
    case 'uploadDocument':
      return bridgeUploadDocument_(command.payload);
    case 'deleteDocument':
      return bridgeDeleteDocument_(command.payload);
    default:
      throw appError_('BRIDGE_ACTION_NOT_ALLOWED', 'Unknown bridge operation');
  }
}

function bridgeRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const stagingId = String(props.getProperty('BHH_BRIDGE_STAGING_FOLDER_ID') || '').trim();
  const originalId = String(props.getProperty(PROP_KEYS.MAIN_FOLDER_ID) || '').trim();
  if (!stagingId || (originalId && stagingId === originalId)) {
    throw appError_('BRIDGE_STAGING_FOLDER_REQUIRED', 'Set a different staging folder from the production main folder');
  }
  const folder = DriveApp.getFolderById(stagingId);
  if (!/preprod|preproduction|staging|sandbox/i.test(folder.getName())) {
    throw appError_('BRIDGE_STAGING_FOLDER_REQUIRED', 'Staging folder name must identify the test environment');
  }
  return folder;
}

function verifyCloudflareBridgeRequest_(request) {
  const props = PropertiesService.getScriptProperties();
  const secret = String(props.getProperty('BHH_BRIDGE_SECRET') || '');
  if (secret.length < 32) throw appError_('BRIDGE_NOT_CONFIGURED', 'Bridge not configured');
  const auth = request && request.bridgeAuth || {};
  const timestamp = String(auth.timestamp || '');
  const nonce = String(auth.nonce || '');
  const signature = String(auth.signature || '').toLowerCase();
  const body = String(request && request.payloadBase64 || '');
  if (!/^\d{13}$/.test(timestamp) || !/^[a-f0-9-]{36}$/.test(nonce) ||
      !/^[a-f0-9]{64}$/.test(signature) || !body || body.length > 19000000) {
    throw appError_('BRIDGE_INVALID_AUTH', 'Invalid bridge request');
  }
  if (Math.abs(Date.now() - Number(timestamp)) > 300000) {
    throw appError_('BRIDGE_EXPIRED_AUTH', 'Expired bridge request');
  }
  const message = timestamp + '\n' + nonce + '\n' + body;
  const bytes = Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8);
  const expected = bytes.map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('');
  let difference = 0;
  for (let i = 0; i < 64; i += 1) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (difference) throw appError_('BRIDGE_INVALID_AUTH', 'Invalid bridge signature');

  // Only the owner-run staging project handles this action. Cache blocks replay
  // inside the 5-minute signing window; the lock serializes nonce check+put.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    if (cache.get('cfbridge:' + nonce)) throw appError_('BRIDGE_REPLAY', 'Repeated bridge request');
    cache.put('cfbridge:' + nonce, '1', 600);
  } finally {
    lock.releaseLock();
  }
  const commandJson = Utilities.newBlob(Utilities.base64Decode(body)).getDataAsString('UTF-8');
  const command = JSON.parse(commandJson);
  if (!command || typeof command !== 'object' || !command.payload ||
      typeof command.operation !== 'string') {
    throw appError_('BRIDGE_INVALID_PAYLOAD', 'Invalid bridge action payload');
  }
  return command;
}

function bridgeValidateFolderUnderRoot_(rootId) {
  if (!/^[A-Za-z0-9_-]{10,256}$/.test(String(rootId || ''))) {
    throw appError_('BRIDGE_INVALID_FOLDER_ID', 'Invalid submission folder');
  }
  const root = DriveApp.getFolderById(String(rootId));
  const main = bridgeRootFolder_();
  const yearParent = root.getParents();
  if (!yearParent.hasNext()) throw appError_('BRIDGE_INVALID_FOLDER', 'Submission folder has no parent');
  const year = yearParent.next();
  const mainParents = year.getParents();
  if (!mainParents.hasNext() || mainParents.next().getId() !== main.getId() ||
      !/^\d{4}$/.test(year.getName())) {
    throw appError_('BRIDGE_INVALID_FOLDER', 'Not a staging submission folder');
  }
  return root;
}

/**
 * Identical hierarchy and naming to createSubmissionFolderTree_, except
 * rooted in a dedicated staging folder and idempotent for safe retry.
 */
function bridgeCreateSubmissionFolders_(payload) {
  const submissionNo = String(payload.submissionNo || '').trim();
  const product = payload.product || {};
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(submissionNo) ||
      !String(product.brandName || '').trim() || !String(product.strength || '').trim() ||
      !String(product.dosageForm || '').trim()) {
    throw appError_('BRIDGE_INVALID_SUBMISSION', 'Invalid submission folder request');
  }
  const rootBase = bridgeRootFolder_();
  const year = Utilities.formatDate(new Date(), APP.TIMEZONE, 'yyyy');
  const yearFolder = getOrCreateChildFolder_(rootBase, year);
  const rootFolderName = sanitizeDriveName_(
    submissionNo + '_' + product.brandName + '_' + product.strength + '_' + product.dosageForm
  );
  const rootFolder = getOrCreateChildFolder_(yearFolder, rootFolderName);
  const folders = {};
  SUBMISSION_FOLDER_DEFINITIONS.forEach(function (definition) {
    const child = getOrCreateChildFolder_(rootFolder, definition.name);
    folders[definition.key] = { id: child.getId(), url: child.getUrl(), name: child.getName() };
  });
  return {
    root: { id: rootFolder.getId(), url: rootFolder.getUrl(), name: rootFolder.getName() },
    folders: folders
  };
}

function bridgeUploadDocument_(payload) {
  const submissionId = String(payload.submissionId || '').trim();
  const submissionNo = String(payload.submissionNo || '').trim();
  const documentType = String(payload.documentType || '');
  const version = Number(payload.version || 0);
  const fileName = String(payload.fileName || '');
  const mimeType = String(payload.mimeType || '');
  const expectedHash = String(payload.sha256 || '').toLowerCase();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(submissionId) ||
      !/^[A-Za-z0-9_-]{3,64}$/.test(submissionNo) ||
      !/^[A-Za-z0-9_]{1,64}$/.test(documentType) ||
      !Number.isSafeInteger(version) || version < 1 || version > 9999 ||
      !/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw appError_('BRIDGE_INVALID_DOCUMENT', 'Invalid document metadata');
  }
  const document = {
    documentType: documentType, fileName: fileName, mimeType: mimeType,
    base64Data: String(payload.base64Data || '')
  };
  // Reuse exact file-category / extension / size checks in the existing app.
  validateDocumentPayload_(document, 0);
  const bytes = Utilities.base64Decode(stripBase64Prefix_(document.base64Data));
  const actualHash = computeSha256_(bytes);
  if (actualHash !== expectedHash) throw appError_('BRIDGE_HASH_MISMATCH', 'File checksum mismatch');

  const submissionFolder = bridgeValidateFolderUnderRoot_(payload.rootFolderId);
  if (submissionFolder.getName().indexOf(submissionNo + '_') !== 0) {
    throw appError_('BRIDGE_INVALID_FOLDER', 'Submission number does not match folder');
  }
  const folderKey = DOCUMENT_FOLDER_KEY[documentType];
  const definition = SUBMISSION_FOLDER_DEFINITIONS.filter(function (item) {
    return item.key === folderKey;
  })[0];
  if (!definition) throw appError_('BRIDGE_INVALID_DOCUMENT_TYPE', 'Folder category unknown');
  const iterator = submissionFolder.getFoldersByName(definition.name);
  if (!iterator.hasNext()) throw appError_('BRIDGE_INVALID_FOLDER', 'Missing expected document folder');
  const folder = iterator.next();
  const storedName = buildStoredFileName_(documentType, submissionNo, version, fileName);
  const blob = Utilities.newBlob(bytes, mimeType, storedName);
  const file = folder.createFile(blob);
  return {
    provider: 'DriveApp',
    fileId: file.getId(), fileName: storedName,
    folderId: folder.getId(), fileUrl: file.getUrl(),
    sizeBytes: bytes.length, sha256: actualHash, version: version
  };
}

function bridgeDeleteDocument_(payload) {
  const fileId = String(payload.fileId || '');
  if (!/^[A-Za-z0-9_-]{10,256}$/.test(fileId)) {
    throw appError_('BRIDGE_INVALID_FILE', 'Invalid file id');
  }
  const file = DriveApp.getFileById(fileId);
  const parent = file.getParents();
  if (!parent.hasNext()) throw appError_('BRIDGE_INVALID_FILE', 'File has no folder');
  const docFolder = parent.next();
  const submissionParents = docFolder.getParents();
  if (!submissionParents.hasNext()) throw appError_('BRIDGE_INVALID_FILE', 'File is not in a submission folder');
  bridgeValidateFolderUnderRoot_(submissionParents.next().getId());
  file.setTrashed(true);
  return { trashed: true };
}
