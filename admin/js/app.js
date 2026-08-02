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
  adminView.classList.add('hidden');
  loginView.classList.remove('hidden');
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
    showAdmin(result.admin);
    await loadDashboard();
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
    await loadDashboard();
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
  renderDocuments(detail.documents || []);
  renderHistory(detail.statusHistory || []);
}

function renderDocuments(documents) {
  documentList.innerHTML = documents.length ? documents.map(document => `
    <article class="document-item">
      <div>
        <strong>${escapeHtml(document.documentType)} · v${Number(document.documentVersion || 0)}</strong>
        <span>${escapeHtml(document.storedFileName || document.originalFileName)} · ${escapeHtml(formatBytes(document.fileSizeBytes))}</span>
      </div>
      <button type="button" class="secondary-button" data-download-document="${escapeHtml(document.documentId)}">ดาวน์โหลด</button>
    </article>
  `).join('') : '<p class="muted">ไม่พบเอกสาร</p>';
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

async function retryPdf() {
  if (!state.selectedSubmissionId) return;
  const button = document.querySelector('#retry-pdf-button');
  button.disabled = true;
  button.textContent = 'กำลังสร้าง…';
  try {
    await apiRequest('retryGeneratePdf', { submissionId: state.selectedSubmissionId });
    showToast('สร้าง PDF ใหม่สำเร็จ');
    await Promise.all([loadDashboard(), openDetail(state.selectedSubmissionId)]);
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'สร้าง PDF ใหม่';
  }
}

function bindEvents() {
  loginForm.addEventListener('submit', handleLogin);
  document.querySelector('#toggle-password').addEventListener('click', () => {
    const visible = loginPassword.type === 'text';
    loginPassword.type = visible ? 'password' : 'text';
    document.querySelector('#toggle-password').textContent = visible ? 'แสดง' : 'ซ่อน';
  });
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
  document.querySelector('#signed-upload-form').addEventListener('submit', handleSignedUpload);
  document.querySelector('#retry-pdf-button').addEventListener('click', retryPdf);
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
