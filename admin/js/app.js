import { ADMIN_APP_CONFIG } from './config.js';
import {
  ApiError,
  apiRequest,
  base64ToBlob,
  clearStoredSession,
  downloadBlob,
  getStoredSession,
  readFileAsBase64,
  storeSession
} from './api.js';

const STATUS_LABELS = Object.freeze({
  DRAFT: 'แบบร่าง',
  SUBMITTED: 'ส่งคำขอแล้ว',
  AWAITING_SIGNATURE: 'รอแบบฟอร์มลงนาม',
  DOCUMENT_REVIEW: 'ตรวจสอบเอกสาร',
  INCOMPLETE_DOCUMENTS: 'เอกสารไม่ครบ',
  DOCUMENTS_COMPLETE: 'เอกสารครบ',
  AWAITING_BDMS: 'รอ BDMS',
  PENDING_PRESENTATION: 'รอนำเสนอ',
  PRESENTED: 'นำเสนอแล้ว',
  APPROVED: 'อนุมัติ',
  REJECTED: 'ไม่อนุมัติ',
  DEFERRED: 'เลื่อนพิจารณา',
  WITHDRAWN: 'ถอนคำขอ',
  CANCELLED: 'ยกเลิก',
  PDF_GENERATION_FAILED: 'สร้าง PDF ไม่สำเร็จ'
});

const loginView = document.querySelector('#login-view');
const adminView = document.querySelector('#admin-view');
const loginForm = document.querySelector('#login-form');
const loginEmail = document.querySelector('#login-email');
const loginPassword = document.querySelector('#login-password');
const loginButton = document.querySelector('#login-button');
const globalAlert = document.querySelector('#global-alert');
const summaryCards = document.querySelector('#summary-cards');
const submissionTbody = document.querySelector('#submission-tbody');
const emptyState = document.querySelector('#empty-state');
const tableLoading = document.querySelector('#table-loading');
const searchInput = document.querySelector('#search-input');
const statusFilter = document.querySelector('#status-filter');
const detailDrawer = document.querySelector('#detail-drawer');
const detailBackdrop = document.querySelector('#detail-backdrop');
const detailLoading = document.querySelector('#detail-loading');
const detailContent = document.querySelector('#detail-content');
const documentList = document.querySelector('#document-list');
const historyList = document.querySelector('#history-list');
const commentList = document.querySelector('#comment-list');
const newStatusSelect = document.querySelector('#new-status-select');
const rejectReasonField = document.querySelector('#reject-reason-field');
const toast = document.querySelector('#toast');
const passwordModal = document.querySelector('#password-modal');
const passwordModalBackdrop = document.querySelector('#password-modal-backdrop');
const changePasswordForm = document.querySelector('#change-password-form');
const currentPasswordInput = document.querySelector('#current-password');
const newPasswordInput = document.querySelector('#new-password');
const confirmNewPasswordInput = document.querySelector('#confirm-new-password');
const savePasswordButton = document.querySelector('#save-password-button');

const state = {
  config: { maximumFileSizeMb: 10 },
  profile: null,
  submissions: [],
  selectedSubmissionId: '',
  selectedDetail: null,
  loading: false
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showAlert(message) {
  globalAlert.textContent = message;
  globalAlert.classList.remove('hidden');
  window.setTimeout(() => globalAlert.classList.add('hidden'), 7000);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.setTimeout(() => toast.classList.add('hidden'), 3200);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok'
  }).format(date);
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(2)} MB`;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '—';
}

function populateStatuses() {
  const options = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join('');
  statusFilter.insertAdjacentHTML('beforeend', options);
  newStatusSelect.innerHTML = options;
}

async function loadPublicConfig() {
  try {
    const [adminConfig, publicConfig] = await Promise.all([
      apiRequest('getAdminPublicConfig', {}, { authenticated: false }),
      apiRequest('getPublicConfig', {}, { authenticated: false })
    ]);
    state.config = { ...state.config, ...adminConfig, ...publicConfig };
    document.querySelector('#login-hospital').textContent = adminConfig.hospitalName || 'โรงพยาบาลกรุงเทพหาดใหญ่';
    document.querySelector('#login-system-info').textContent = `Backend v${adminConfig.appVersion || '—'} · Admin App v${ADMIN_APP_CONFIG.APP_VERSION}`;
    document.querySelector('#admin-title').textContent = adminConfig.appName || 'ระบบบริหารคำขอเสนอยา';
    const minimumLength = Math.max(Number(adminConfig.passwordMinimumLength || 8), 8);
    newPasswordInput.minLength = minimumLength;
    confirmNewPasswordInput.minLength = minimumLength;
    document.querySelector('#password-policy-text').textContent =
      `อย่างน้อย ${minimumLength} ตัวอักษร และต้องมีทั้งตัวอักษรกับตัวเลข`;
  } catch (error) {
    showAlert(error.message);
  }
}

function showLogin() {
  state.profile = null;
  adminView.classList.add('hidden');
  loginView.classList.remove('hidden');
  document.querySelector('#user-management-panel').classList.add('hidden');
  document.querySelector('#managed-user-tbody').innerHTML = '';
  clearTemporaryPassword();
  closePasswordModal();
  loginPassword.value = '';
  loginEmail.focus();
}


function passwordMinimumLength() {
  return Math.max(Number(state.config.passwordMinimumLength || 8), 8);
}

function openPasswordModal() {
  const minimumLength = passwordMinimumLength();
  currentPasswordInput.value = '';
  newPasswordInput.value = '';
  confirmNewPasswordInput.value = '';
  newPasswordInput.minLength = minimumLength;
  confirmNewPasswordInput.minLength = minimumLength;
  document.querySelector('#password-policy-text').textContent =
    `อย่างน้อย ${minimumLength} ตัวอักษร และต้องมีทั้งตัวอักษรกับตัวเลข`;
  passwordModalBackdrop.classList.remove('hidden');
  passwordModal.classList.remove('hidden');
  window.setTimeout(() => currentPasswordInput.focus(), 0);
}

function closePasswordModal() {
  if (state.profile?.mustChangePassword) {
    showAlert('ต้องเปลี่ยน Password ชั่วคราวก่อนใช้งานระบบ');
    return;
  }
  passwordModalBackdrop.classList.add('hidden');
  passwordModal.classList.add('hidden');
  changePasswordForm.reset();
  changePasswordForm.querySelectorAll('[data-toggle-password]').forEach(button => {
    const input = document.querySelector(`#${button.dataset.togglePassword}`);
    if (input) input.type = 'password';
    button.textContent = 'แสดง';
  });
}

async function handleChangePassword(event) {
  event.preventDefault();
  const minimumLength = passwordMinimumLength();
  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmNewPasswordInput.value;

  if (newPassword.length < minimumLength) {
    showAlert(`Password ใหม่ต้องมีอย่างน้อย ${minimumLength} ตัวอักษร`);
    newPasswordInput.focus();
    return;
  }
  if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    showAlert('Password ใหม่ต้องมีทั้งตัวอักษรและตัวเลข');
    newPasswordInput.focus();
    return;
  }
  if (newPassword !== confirmPassword) {
    showAlert('Password ใหม่และการยืนยัน Password ไม่ตรงกัน');
    confirmNewPasswordInput.focus();
    return;
  }
  if (currentPassword === newPassword) {
    showAlert('Password ใหม่ต้องไม่ซ้ำกับ Password ปัจจุบัน');
    newPasswordInput.focus();
    return;
  }

  savePasswordButton.disabled = true;
  savePasswordButton.textContent = 'กำลังเปลี่ยน…';
  try {
    const result = await apiRequest('changeAdminPassword', {
      currentPassword,
      newPassword
    });
    if (state.profile) state.profile.mustChangePassword = false;
    closePasswordModal();
    clearStoredSession();
    closeDetail();
    showLogin();
    showAlert(result.message || 'เปลี่ยน Password สำเร็จ กรุณา Login ใหม่');
  } catch (error) {
    showAlert(error.message);
  } finally {
    savePasswordButton.disabled = false;
    savePasswordButton.textContent = 'บันทึก Password ใหม่';
  }
}

function showAdmin(profile) {
  loginView.classList.add('hidden');
  adminView.classList.remove('hidden');
  document.querySelector('#admin-display-name').textContent = profile.displayName || profile.email;
  document.querySelector('#admin-email').textContent = `${profile.email} · ${profile.role}`;

  document.querySelector('#manage-users-button').classList.toggle('hidden', profile.role !== 'SUPER_ADMIN' || Boolean(profile.mustChangePassword));
  if (profile.role !== 'SUPER_ADMIN') {
    document.querySelector('#user-management-panel').classList.add('hidden');
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginButton.disabled = true;
  loginButton.textContent = 'กำลัง Login…';
  try {
    const result = await apiRequest('adminLogin', {
      email: loginEmail.value.trim(),
      password: loginPassword.value,
      userAgent: navigator.userAgent
    }, { authenticated: false });
    storeSession({
      sessionToken: result.sessionToken,
      expiresAt: result.expiresAt,
      admin: result.admin
    });
    state.profile = result.admin;
    loginPassword.value = '';
    showAdmin(result.admin);
    if (result.admin.mustChangePassword) {
      showAlert('โปรดเปลี่ยนรหัสผ่านชั่วคราวก่อนใช้งานระบบ');
      openPasswordModal();
    } else {
      await loadDashboard();
    }
  } catch (error) {
    showAlert(error.message);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = 'Login';
  }
}

async function restoreSession() {
  const session = getStoredSession();
  if (!session?.sessionToken) {
    showLogin();
    return;
  }
  try {
    const profile = await apiRequest('getAdminProfile');
    state.profile = profile;
    showAdmin(profile);
    if (profile.mustChangePassword) {
      openPasswordModal();
    } else {
      await loadDashboard();
    }
  } catch {
    clearStoredSession();
    showLogin();
  }
}

async function handleLogout() {
  try {
    await apiRequest('adminLogout');
  } catch (error) {
    if (ADMIN_APP_CONFIG.ENABLE_DEBUG) console.warn(error);
  }
  clearStoredSession();
  closeDetail();
  showLogin();
}

async function loadDashboard() {
  if (state.loading) return;
  state.loading = true;
  tableLoading.classList.remove('hidden');
  emptyState.classList.add('hidden');
  try {
    const [summary, list] = await Promise.all([
      apiRequest('getAdminDashboardSummary'),
      apiRequest('listSubmissions', {
        search: searchInput.value.trim(),
        status: statusFilter.value,
        limit: 200,
        offset: 0
      })
    ]);
    renderSummary(summary);
    state.submissions = list.items || [];
    renderSubmissions(state.submissions);
  } catch (error) {
    if (error.code === 'ADMIN_SESSION_EXPIRED' || error.code === 'INVALID_ADMIN_SESSION') {
      clearStoredSession();
      showLogin();
    }
    showAlert(error.message);
  } finally {
    state.loading = false;
    tableLoading.classList.add('hidden');
  }
}

function renderSummary(summary) {
  const cards = [
    ['คำขอทั้งหมด', summary.totalSubmissions || 0],
    ['รอแบบฟอร์มลงนาม', summary.awaitingSignature || 0],
    ['อยู่ระหว่างตรวจเอกสาร', summary.documentReview || 0],
    ['ได้รับแบบฟอร์มเซ็นแล้ว', summary.signedFormReceived || 0]
  ];
  summaryCards.innerHTML = cards.map(([label, value]) => `
    <article class="summary-card"><span>${escapeHtml(label)}</span><strong>${Number(value)}</strong></article>
  `).join('');
}

function renderSubmissions(items) {
  submissionTbody.innerHTML = items.map(item => `
    <tr>
      <td><strong>${escapeHtml(item.submissionNo)}</strong></td>
      <td class="product-cell">
        <strong>${escapeHtml(item.brandName)} ${escapeHtml(item.strength)}</strong>
        <span>${escapeHtml(item.genericName)} · ${escapeHtml(item.dosageForm)}</span>
      </td>
      <td><span class="status-badge">${escapeHtml(statusLabel(item.currentStatus))}</span></td>
      <td class="comment-cell">
        <span>${escapeHtml(item.latestComment || '—')}</span>
        <small>${item.commentCount ? `${Number(item.commentCount)} รายการ · ${escapeHtml(formatDate(item.latestCommentAt))}` : ''}</small>
      </td>
      <td>${escapeHtml(formatDate(item.submittedAt))}</td>
      <td><span class="${item.signedFormReceived ? 'yes-chip' : 'no-chip'}">${item.signedFormReceived ? 'ได้รับแล้ว' : 'ยังไม่ได้รับ'}</span></td>
      <td><button type="button" class="secondary-button" data-open-submission="${escapeHtml(item.submissionId)}">เปิด</button></td>
    </tr>
  `).join('');
  emptyState.classList.toggle('hidden', items.length > 0);
  submissionTbody.querySelectorAll('[data-open-submission]').forEach(button => {
    button.addEventListener('click', () => openDetail(button.dataset.openSubmission));
  });
}

async function openDetail(submissionId) {
  state.selectedSubmissionId = submissionId;
  state.selectedDetail = null;
  detailBackdrop.classList.remove('hidden');
  detailDrawer.classList.remove('hidden');
  detailLoading.classList.remove('hidden');
  detailContent.classList.add('hidden');
  try {
    const detail = await apiRequest('getSubmissionDetail', { submissionId });
    state.selectedDetail = detail;
    renderDetail(detail);
    detailLoading.classList.add('hidden');
    detailContent.classList.remove('hidden');
  } catch (error) {
    showAlert(error.message);
    closeDetail();
  }
}

function closeDetail() {
  detailDrawer.classList.add('hidden');
  detailBackdrop.classList.add('hidden');
  state.selectedSubmissionId = '';
  state.selectedDetail = null;
}

function detailItem(label, value) {
  return `<div class="detail-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value || '—')}</span></div>`;
}

function renderDetail(detail) {
  const submission = detail.submission || {};
  const company = detail.company || {};
  const representative = detail.representative || {};
  document.querySelector('#detail-submission-no').textContent = submission.SubmissionNo || '';
  document.querySelector('#detail-product-name').textContent = `${submission.BrandName || ''} ${submission.Strength || ''}`.trim();
  document.querySelector('#detail-overview').innerHTML = `
    <div class="section-row"><h3>ข้อมูลคำขอ</h3><span class="status-badge">${escapeHtml(statusLabel(submission.CurrentStatus))}</span></div>
    <div class="detail-grid">
      ${detailItem('Generic Name', submission.GenericName)}
      ${detailItem('Dosage Form', submission.DosageForm)}
      ${detailItem('บริษัท', company.CompanyName)}
      ${detailItem('E-mail บริษัท', company.CompanyEmail)}
      ${detailItem('ผู้แทน', representative.RepresentativeName)}
      ${detailItem('โทรศัพท์ผู้แทน', representative.Phone)}
      ${detailItem('วันที่ Submit', formatDate(submission.SubmittedAt))}
      ${detailItem('RMP', submission.RMP ? 'Yes' : 'No')}
    </div>`;
  newStatusSelect.value = submission.CurrentStatus || 'DOCUMENT_REVIEW';
  updateRejectReasonVisibility();

  const regenerateReason = document.querySelector('#regenerate-pdf-reason');
  const regenerateWarning = document.querySelector('#regenerate-pdf-warning');
  if (regenerateReason) regenerateReason.value = '';
  const signedFormReceived = submission.SignedFormReceived === true ||
    String(submission.SignedFormReceived || '').toUpperCase() === 'TRUE';
  regenerateWarning?.classList.toggle('hidden', !signedFormReceived);

  renderDocuments(detail.documents || []);
  renderHistory(detail.statusHistory || []);
  renderComments(detail.comments || []);
  document.querySelector('#new-comment').value = '';
}

function renderDocuments(documents) {
  documentList.innerHTML = documents.length ? documents.map(document => {
    const currentChip = document.isCurrentVersion
      ? '<span class="document-version-chip">Current</span>'
      : '';
    const supersededChip = String(document.reviewStatus || '').toUpperCase() === 'SUPERSEDED'
      ? '<span class="document-version-chip document-version-chip--superseded">Superseded</span>'
      : '';
    const reviewNote = document.reviewNote
      ? `<span class="document-review-note">${escapeHtml(document.reviewNote)}</span>`
      : '';

    return `
      <article class="document-item">
        <div>
          <strong>${escapeHtml(document.documentType)} · v${Number(document.documentVersion || 0)} ${currentChip} ${supersededChip}</strong>
          <span>${escapeHtml(document.storedFileName || document.originalFileName)} · ${escapeHtml(formatBytes(document.fileSizeBytes))}</span>
          ${reviewNote}
        </div>
        <button type="button" class="secondary-button" data-download-document="${escapeHtml(document.documentId)}">ดาวน์โหลด</button>
      </article>`;
  }).join('') : '<p class="muted">ไม่พบเอกสาร</p>';
  documentList.querySelectorAll('[data-download-document]').forEach(button => {
    button.addEventListener('click', () => downloadDocument(button.dataset.downloadDocument, button));
  });
}

function renderHistory(history) {
  historyList.innerHTML = history.length ? history.map(item => `
    <div class="timeline-item">
      <strong>${escapeHtml(statusLabel(item.NewStatus))}</strong>
      <span>${escapeHtml(formatDate(item.ChangedAt))} · ${escapeHtml(item.ChangedBy || '—')}</span>
      <span>${escapeHtml(item.Note || '')}</span>
    </div>
  `).join('') : '<p class="muted">ยังไม่มีประวัติสถานะ</p>';
}

function renderComments(comments) {
  commentList.innerHTML = comments.length ? comments.map(item => `
    <div class="timeline-item">
      <strong>${item.type === 'STATUS_NOTE' ? 'หมายเหตุสถานะ' : 'Comment'}</strong>
      <span>${escapeHtml(formatDate(item.createdAt))} · ${escapeHtml(item.createdBy || '—')}</span>
      <span>${escapeHtml(item.text || '')}</span>
    </div>
  `).join('') : '<p class="muted">ยังไม่มี Note / Comment</p>';
}

async function handleCommentSave(event) {
  event.preventDefault();
  if (!state.selectedSubmissionId) return;
  const textarea = document.querySelector('#new-comment');
  const comment = textarea.value.trim();
  if (!comment) return;
  const button = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const submissionId = state.selectedSubmissionId;
    await apiRequest('addSubmissionComment', { submissionId, comment });
    textarea.value = '';
    showToast('บันทึก Comment สำเร็จ');
    await Promise.all([loadDashboard(), openDetail(submissionId)]);
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
  }
}

async function downloadDocument(documentId, button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'กำลังโหลด…';
  try {
    const result = await apiRequest('downloadAdminDocument', { documentId });
    downloadBlob(base64ToBlob(result.base64Data, result.mimeType), result.fileName);
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function updateRejectReasonVisibility() {
  const rejected = newStatusSelect.value === 'REJECTED';
  rejectReasonField.classList.toggle('hidden', !rejected);
  document.querySelector('#reject-reason').required = rejected;
}

async function handleStatusUpdate(event) {
  event.preventDefault();
  if (!state.selectedSubmissionId) return;
  const button = event.submitter;
  button.disabled = true;
  try {
    await apiRequest('updateStatus', {
      submissionId: state.selectedSubmissionId,
      newStatus: newStatusSelect.value,
      rejectReason: document.querySelector('#reject-reason').value.trim(),
      note: document.querySelector('#status-note').value.trim()
    });
    showToast('อัปเดตสถานะสำเร็จ');
    await Promise.all([loadDashboard(), openDetail(state.selectedSubmissionId)]);
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
  }
}

async function handleSignedUpload(event) {
  event.preventDefault();
  if (!state.selectedSubmissionId) return;
  const input = document.querySelector('#signed-file-input');
  const file = input.files?.[0];
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showAlert('แบบฟอร์มหลังเซ็นต้องเป็นไฟล์ PDF');
    return;
  }
  const maxBytes = Number(state.config.maximumFileSizeMb || 10) * 1024 * 1024;
  if (file.size > maxBytes) {
    showAlert(`ไฟล์มีขนาดเกิน ${state.config.maximumFileSizeMb || 10} MB`);
    return;
  }
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'กำลังอัปโหลด…';
  try {
    const base64Data = await readFileAsBase64(file);
    await apiRequest('adminUploadSignedPhysicianForm', {
      submissionId: state.selectedSubmissionId,
      fileName: file.name,
      mimeType: 'application/pdf',
      base64Data
    });
    input.value = '';
    showToast('อัปโหลดแบบฟอร์มหลังเซ็นสำเร็จ');
    await Promise.all([loadDashboard(), openDetail(state.selectedSubmissionId)]);
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'อัปโหลดแบบฟอร์มหลังเซ็น';
  }
}

async function regeneratePdf(event) {
  event.preventDefault();
  if (!state.selectedSubmissionId || !state.selectedDetail) return;

  const reasonInput = document.querySelector('#regenerate-pdf-reason');
  const button = document.querySelector('#regenerate-pdf-button');
  const reason = reasonInput.value.trim();
  if (reason.length < 3) {
    showAlert('กรุณาระบุเหตุผลในการสร้าง PDF ใหม่');
    reasonInput.focus();
    return;
  }

  const submission = state.selectedDetail.submission || {};
  const signedFormReceived = submission.SignedFormReceived === true ||
    String(submission.SignedFormReceived || '').toUpperCase() === 'TRUE';

  const confirmationMessage = signedFormReceived
    ? 'คำขอนี้มีแบบฟอร์มที่ลงนามแล้ว หาก Regenerate ระบบจะเก็บไฟล์เดิมเป็น Superseded และเปลี่ยนสถานะกลับเป็นรอลงนาม PDF ฉบับใหม่ ต้องการดำเนินการต่อหรือไม่?'
    : 'ต้องการสร้าง PDF เวอร์ชันใหม่จากข้อมูลที่บันทึกในคำขอนี้หรือไม่? PDF เวอร์ชันเดิมจะยังถูกเก็บไว้';

  if (!window.confirm(confirmationMessage)) return;

  button.disabled = true;
  button.textContent = 'กำลัง Regenerate…';
  try {
    const result = await apiRequest('regenerateSubmissionPdf', {
      submissionId: state.selectedSubmissionId,
      reason,
      acknowledgeSignedFormImpact: signedFormReceived
    });
    showToast(
      result.signedFormSuperseded
        ? `Regenerate PDF v${String(result.version || '').padStart(2, '0')} สำเร็จ · ต้องลงนามใหม่`
        : `Regenerate PDF v${String(result.version || '').padStart(2, '0')} สำเร็จ`
    );
    reasonInput.value = '';
    await Promise.all([loadDashboard(), openDetail(state.selectedSubmissionId)]);
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Regenerate PDF';
  }
}

/**
 * V2 Super Admin user management. All actions are authenticated AGAIN on backend.
 * Temporary passwords are kept in memory/DOM only until dialog closes.
 */
function showTemporaryPassword(email, password) {
  const modal = document.querySelector('#temporary-password-modal');
  document.querySelector('#temporary-password-email').textContent = 'สำหรับบัญชี ' + email;
  document.querySelector('#temporary-password-value').value = String(password || '');
  document.querySelector('#temporary-password-backdrop').classList.remove('hidden');
  modal.classList.remove('hidden');
  document.querySelector('#temporary-password-value').select();
}
function clearTemporaryPassword() {
  document.querySelector('#temporary-password-value').value = '';
  document.querySelector('#temporary-password-email').textContent = '';
  document.querySelector('#temporary-password-backdrop').classList.add('hidden');
  document.querySelector('#temporary-password-modal').classList.add('hidden');
}
async function copyTemporaryPassword() {
  const password = document.querySelector('#temporary-password-value').value;
  if (!password) return;
  try {
    await navigator.clipboard.writeText(password);
    showToast('คัดลอกรหัสผ่านชั่วคราวแล้ว');
  } catch {
    showAlert('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาเลือกข้อความเพื่อคัดลอก');
  }
}
function renderManagedUsers(users) {
  const body = document.querySelector('#managed-user-tbody');
  const me = String(state.profile?.email || '').toLowerCase();
  const allowedRoles = ['PHARMACIST','SYSTEM_ADMIN','PTC_SECRETARY','PTC_MEMBER','SUPER_ADMIN'];
  body.innerHTML = users.length ? users.map(user => {
    const isMe = me === String(user.email).toLowerCase();
    const options = allowedRoles.map(role => `
      <option value="${escapeHtml(role)}" ${role === user.role ? 'selected' : ''}>${escapeHtml(role)}</option>
    `).join('');
    return `<tr>
      <td><strong>${escapeHtml(user.email)}</strong></td>
      <td>${escapeHtml(user.displayName || '—')}</td>
      <td><select class="managed-role-select" data-email="${escapeHtml(user.email)}"
        ${isMe ? 'disabled' : ''}>${options}</select></td>
      <td>${user.isActive ? 'ใช้งาน' : 'ระงับ'}${user.isLocked ? ' (ล็อก)' : ''}</td>
      <td>${escapeHtml(formatDate(user.lastLoginAt))}</td>
      <td class="user-management-actions">
        <button type="button" class="secondary-button" data-user-action="reset"
          data-email="${escapeHtml(user.email)}" ${user.isActive ? '' : 'disabled'}>Reset PSW</button>
        <button type="button" class="secondary-button" data-user-action="unlock"
          data-email="${escapeHtml(user.email)}" ${user.isLocked ? '' : 'disabled'}>ปลดล็อก</button>
        <button type="button" class="secondary-button" data-user-action="toggle"
          data-email="${escapeHtml(user.email)}" data-active="${user.isActive ? 'true' : 'false'}"
          ${isMe ? 'disabled' : ''}>${user.isActive ? 'ลบ/ระงับ' : 'เปิดใช้งาน'}</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="muted">ไม่มีข้อมูลผู้ใช้</td></tr>';
}
async function loadManagedUsers() {
  if (state.profile?.role !== 'SUPER_ADMIN') return;
  try {
    const result = await apiRequest('listManagedAdminUsers');
    renderManagedUsers(result.items || []);
  } catch (error) {
    showAlert(error.message);
  }
}
async function toggleManagedUsers() {
  if (state.profile?.role !== 'SUPER_ADMIN') return;
  const panel = document.querySelector('#user-management-panel');
  const nowHidden = panel.classList.toggle('hidden');
  if (!nowHidden) await loadManagedUsers();
}
async function handleCreateManagedUser(event) {
  event.preventDefault();
  if (state.profile?.role !== 'SUPER_ADMIN') return;
  const button = event.currentTarget.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    const result = await apiRequest('createManagedAdminUser', {
      displayName: document.querySelector('#new-user-name').value.trim(),
      email: document.querySelector('#new-user-email').value.trim(),
      role: document.querySelector('#new-user-role').value
    });
    event.currentTarget.reset();
    await loadManagedUsers();
    showTemporaryPassword(result.user.email, result.temporaryPassword);
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
  }
}
async function handleManagedUserTableAction(event) {
  if (state.profile?.role !== 'SUPER_ADMIN') return;
  const select = event.target.closest('select.managed-role-select');
  if (select && event.type === 'change') {
    const email = select.dataset.email;
    if (!window.confirm('เปลี่ยน Role ของ ' + email + ' เป็น ' + select.value + ' หรือไม่?')) {
      await loadManagedUsers();
      return;
    }
    select.disabled = true;
    try {
      await apiRequest('updateManagedAdminUser', { email, role: select.value });
      showToast('เปลี่ยนสิทธิ์แล้ว Session เดิมจะถูกยกเลิก');
    } catch (error) {
      showAlert(error.message);
    } finally {
      await loadManagedUsers();
    }
    return;
  }
  const button = event.target.closest('button[data-user-action]');
  if (!button || event.type !== 'click') return;
  const email = button.dataset.email;
  const action = button.dataset.userAction;
  const wasActive = button.dataset.active === 'true';
  const confirmMessage = action === 'reset'
    ? 'สร้าง Password ใหม่และยกเลิก Session เดิมของ ' + email + ' ?'
    : action === 'unlock'
    ? 'ปลดล็อกบัญชี ' + email + ' ?'
    : (wasActive ? 'ระงับบัญชี ' : 'เปิดใช้งานบัญชี ') + email + ' ?';
  if (!window.confirm(confirmMessage)) return;
  button.disabled = true;
  try {
    let result;
    if (action === 'reset') {
      result = await apiRequest('resetManagedAdminPassword', { email });
    } else if (action === 'unlock') {
      result = await apiRequest('unlockManagedAdminUser', { email });
    } else if (action === 'toggle') {
      result = await apiRequest(wasActive ? 'disableManagedAdminUser' : 'updateManagedAdminUser',
        wasActive ? { email } : { email, isActive: true });
    }
    if (action === 'reset') showTemporaryPassword(email, result.temporaryPassword);
    else showToast('ปรับปรุงบัญชีเรียบร้อย');
    await loadManagedUsers();
  } catch (error) {
    showAlert(error.message);
    await loadManagedUsers();
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  loginForm.addEventListener('submit', handleLogin);
  document.querySelector('#toggle-password').addEventListener('click', () => {
    const visible = loginPassword.type === 'text';
    loginPassword.type = visible ? 'password' : 'text';
    document.querySelector('#toggle-password').textContent = visible ? 'แสดง' : 'ซ่อน';
  });
  document.querySelector('#manage-users-button').addEventListener('click', toggleManagedUsers);
  document.querySelector('#reload-users-button').addEventListener('click', loadManagedUsers);
  document.querySelector('#create-user-form').addEventListener('submit', handleCreateManagedUser);
  document.querySelector('#managed-user-tbody').addEventListener('click', handleManagedUserTableAction);
  document.querySelector('#managed-user-tbody').addEventListener('change', handleManagedUserTableAction);
  document.querySelector('#close-temporary-password-button').addEventListener('click', clearTemporaryPassword);
  document.querySelector('#confirm-temporary-password-button').addEventListener('click', clearTemporaryPassword);
  document.querySelector('#temporary-password-backdrop').addEventListener('click', clearTemporaryPassword);
  document.querySelector('#copy-temporary-password-button').addEventListener('click', copyTemporaryPassword);
  document.querySelector('#change-password-button').addEventListener('click', openPasswordModal);
  document.querySelector('#logout-button').addEventListener('click', handleLogout);
  document.querySelector('#close-password-modal').addEventListener('click', closePasswordModal);
  document.querySelector('#cancel-password-change').addEventListener('click', closePasswordModal);
  passwordModalBackdrop.addEventListener('click', closePasswordModal);
  changePasswordForm.addEventListener('submit', handleChangePassword);
  changePasswordForm.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.querySelector(`#${button.dataset.togglePassword}`);
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.textContent = visible ? 'แสดง' : 'ซ่อน';
    });
  });
  document.querySelector('#refresh-button').addEventListener('click', loadDashboard);
  document.querySelector('#filter-form').addEventListener('submit', event => {
    event.preventDefault();
    loadDashboard();
  });
  document.querySelector('#close-detail-button').addEventListener('click', closeDetail);
  detailBackdrop.addEventListener('click', closeDetail);
  document.querySelector('#status-update-form').addEventListener('submit', handleStatusUpdate);
  document.querySelector('#comment-form').addEventListener('submit', handleCommentSave);
  document.querySelector('#signed-upload-form').addEventListener('submit', handleSignedUpload);
  document.querySelector('#regenerate-pdf-form').addEventListener('submit', regeneratePdf);
  newStatusSelect.addEventListener('change', updateRejectReasonVisibility);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!passwordModal.classList.contains('hidden')) {
      closePasswordModal();
      return;
    }
    if (!detailDrawer.classList.contains('hidden')) closeDetail();
  });
}

async function initialize() {
  populateStatuses();
  bindEvents();
  await loadPublicConfig();
  await restoreSession();
}

initialize().catch(error => {
  showAlert(error instanceof ApiError ? error.message : 'เปิดระบบไม่สำเร็จ');
});
