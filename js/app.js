import { APP_CONFIG } from './config.js';
import { apiRequest, base64ToBlob, downloadBlob, ApiError } from './api.js';
import { DOCUMENT_DEFINITIONS, STEP_TITLES, STATUS_LABELS } from './form-schema.js';
import { debounce, escapeHtml, fileExtension, formatBytes, normalizeKeyPart, readFileAsBase64, setText, todayYear } from './utils.js';
import { buildUrgencyDuration } from './physician-rules.js';
import { findInlineResources } from './document-template-rules.js';

const form = document.querySelector('#submission-form');
const steps = [...document.querySelectorAll('.form-step')];
const stepper = document.querySelector('#stepper');
const previousButton = document.querySelector('#previous-btn');
const nextButton = document.querySelector('#next-btn');
const submitButton = document.querySelector('#submit-btn');
const documentList = document.querySelector('#document-list');
const approversContainer = document.querySelector('#approvers-container');
const addApproverButton = document.querySelector('#add-approver-btn');
const globalAlert = document.querySelector('#global-alert');
const duplicateResult = document.querySelector('#duplicate-result');
const checkDuplicateButton = document.querySelector('#check-duplicate-btn');
const totalFileSizeElement = document.querySelector('#total-file-size');
const totalFileWarning = document.querySelector('#total-file-warning');
const uploadLimitText = document.querySelector('#upload-limit-text');
const reviewContent = document.querySelector('#review-content');
const submitProgress = document.querySelector('#submit-progress');
const progressBar = document.querySelector('#progress-bar');
const progressMessage = document.querySelector('#progress-message');
const systemStatus = document.querySelector('#system-status');
const publicTemplatesCard = document.querySelector('#public-templates-card');
const publicTemplatesList = document.querySelector('#public-templates-list');
const successPanel = document.querySelector('#success-panel');
const toast = document.querySelector('#toast');

const state = {
  currentStep: 0,
  publicConfig: {
    maximumApprovers: 6,
    maximumResearchFiles: 3,
    maximumFileSizeMb: 10,
    maximumTotalUploadMb: 35,
    acceptedExtensionsByDocumentType: {}
  },
  publicTemplates: [],
  documentFiles: new Map(),
  researchMetadata: [],
  duplicate: { checkedKey: '', blocked: null, checking: false },
  submitting: false,
  submission: null
};

function value(name) {
  const element = form.elements.namedItem(name);
  if (!element) return '';
  if (element instanceof RadioNodeList) return element.value || '';
  return String(element.value || '').trim();
}

function radioBoolean(name, defaultValue = null) {
  const raw = value(name);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return defaultValue;
}

function checked(name) {
  return Boolean(form.elements.namedItem(name)?.checked);
}

function applyUrgencyDurationRule() {
  const urgencyControl = form.elements.namedItem('urgency');
  const amountControl = form.elements.namedItem('urgencyAmount');
  const unitControl = form.elements.namedItem('urgencyUnit');
  const durationControl = form.elements.namedItem('urgencyDuration');
  if (!urgencyControl || !durationControl) return;

  const urgent = urgencyControl.value === 'URGENT';
  document.querySelector('.urgent-duration-fields')?.classList.toggle('hidden', !urgent);
  if (amountControl) amountControl.required = urgent;
  if (unitControl) unitControl.required = urgent;

  durationControl.value = buildUrgencyDuration(
    urgencyControl.value,
    amountControl?.value || '',
    unitControl?.value || 'HOURS'
  );
  durationControl.readOnly = true;
  durationControl.setAttribute('aria-readonly', 'true');
}

function syncProposalReason() {
  const parts = [];
  if (checked('proposalReasonNoAlternative')) {
    parts.push('ไม่มียาอื่นในเภสัชตำรับที่ใช้ในข้อบ่งใช้นี้');
  }
  if (checked('proposalReasonSafer')) {
    const detail = value('proposalReasonSafetyDetail');
    parts.push(`มีความปลอดภัยมากกว่ายาที่มีอยู่เดิม${detail ? `ในด้าน ${detail}` : ''}`);
  }
  if (checked('proposalReasonCostEffective')) {
    const drug = value('proposalReasonComparisonDrug');
    parts.push(`มีประสิทธิภาพและราคาคุ้มค่ากว่า${drug ? `ยา ${drug}` : 'ยาที่มีอยู่เดิม'}`);
  }
  if (checked('proposalReasonOther')) {
    const detail = value('proposalReasonOtherDetail');
    parts.push(detail ? `เหตุผลอื่น: ${detail}` : 'เหตุผลอื่น');
  }
  const control = form.elements.namedItem('proposalReason');
  if (control) control.value = parts.join('\n');
  return parts;
}

function updateProposalReasonRules() {
  const safer = checked('proposalReasonSafer');
  const cost = checked('proposalReasonCostEffective');
  const other = checked('proposalReasonOther');
  const rules = [
    ['safer', 'proposalReasonSafetyDetail', safer],
    ['cost', 'proposalReasonComparisonDrug', cost],
    ['other', 'proposalReasonOtherDetail', other]
  ];
  rules.forEach(([detailKey, fieldName, active]) => {
    document.querySelector(`[data-proposal-detail="${detailKey}"]`)?.classList.toggle('hidden', !active);
    const control = form.elements.namedItem(fieldName);
    if (control) control.required = active;
  });
  syncProposalReason();
}

function updateRestrictionRule() {
  const restricted = radioBoolean('useRestrictionRequired', false) === true;
  const wrapper = document.querySelector('.restriction-specialty-field');
  const control = form.elements.namedItem('restrictedSpecialty');
  wrapper?.classList.toggle('conditional-hidden', !restricted);
  if (control) {
    control.required = restricted;
    if (!restricted) control.value = '';
  }
}

function showAlert(message, type = 'error') {
  globalAlert.className = `alert ${type}`;
  globalAlert.textContent = message;
  globalAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideAlert() {
  globalAlert.className = 'alert hidden';
  globalAlert.textContent = '';
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  window.setTimeout(() => toast.classList.add('hidden'), 3000);
}

function renderStepper() {
  stepper.innerHTML = STEP_TITLES.map((title, index) => `<li data-index="${index + 1}" data-step-link="${index}">${escapeHtml(title)}</li>`).join('');
}

function showStep(index) {
  state.currentStep = Math.max(0, Math.min(index, steps.length - 1));
  steps.forEach((step, stepIndex) => step.classList.toggle('active', stepIndex === state.currentStep));
  [...stepper.children].forEach((item, stepIndex) => {
    item.classList.toggle('active', stepIndex === state.currentStep);
    item.classList.toggle('complete', stepIndex < state.currentStep);
  });
  previousButton.classList.toggle('hidden', state.currentStep === 0);
  nextButton.classList.toggle('hidden', state.currentStep === steps.length - 1);
  submitButton.classList.toggle('hidden', state.currentStep !== steps.length - 1);
  if (state.currentStep === steps.length - 1) renderReview();
  hideAlert();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function currentProductKey() {
  return [value('brandName'), value('strength'), value('dosageForm')].map(normalizeKeyPart).join('|');
}

function invalidateDuplicateCheck() {
  state.duplicate = { checkedKey: '', blocked: null, checking: false };
  duplicateResult.className = 'inline-status neutral';
  duplicateResult.textContent = 'ข้อมูลผลิตภัณฑ์มีการเปลี่ยนแปลง กรุณาตรวจข้อมูลซ้ำอีกครั้ง';
}

async function checkDuplicate({ silent = false } = {}) {
  const brandName = value('brandName');
  const strength = value('strength');
  const dosageForm = value('dosageForm');
  if (!brandName || !strength || !dosageForm) {
    if (!silent) showAlert('กรุณากรอก Brand Name, Strength และ Dosage Form ก่อนตรวจข้อมูลซ้ำ');
    return false;
  }

  state.duplicate.checking = true;
  duplicateResult.className = 'inline-status loading';
  duplicateResult.textContent = 'กำลังตรวจข้อมูลซ้ำ…';
  checkDuplicateButton.disabled = true;
  try {
    const result = await apiRequest('checkDuplicate', {
      brandName,
      strength,
      dosageForm,
      companyName: value('companyName'),
      representativeEmail: value('representativeEmail')
    });
    state.duplicate.checkedKey = currentProductKey();
    state.duplicate.blocked = Boolean(result.blocked);
    if (result.blocked) {
      duplicateResult.className = 'inline-status error';
      duplicateResult.textContent = result.message || 'พบคำขอซ้ำและไม่สามารถ Submit ได้';
      return false;
    }
    duplicateResult.className = 'inline-status success';
    duplicateResult.textContent = result.isResubmission
      ? `อนุญาตให้เสนอซ้ำ: ${result.message || ''}`
      : 'ไม่พบคำขอซ้ำ สามารถดำเนินการต่อได้';
    return true;
  } catch (error) {
    state.duplicate.checkedKey = '';
    state.duplicate.blocked = null;
    duplicateResult.className = 'inline-status error';
    duplicateResult.textContent = error.message;
    if (!silent) showAlert(error.message);
    return false;
  } finally {
    state.duplicate.checking = false;
    checkDuplicateButton.disabled = false;
  }
}

function getRequiredRadioNames(container) {
  return [...new Set([...container.querySelectorAll('input[type="radio"][required]')].map(input => input.name))];
}

function validateContainer(container) {
  let firstInvalid = null;
  container.querySelectorAll('.invalid').forEach(element => element.classList.remove('invalid'));

  for (const name of getRequiredRadioNames(container)) {
    const checked = container.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]:checked`);
    if (!checked) {
      firstInvalid ||= container.querySelector(`input[type="radio"][name="${CSS.escape(name)}"]`);
    }
  }

  for (const control of container.querySelectorAll('input[required]:not([type="radio"]), textarea[required], select[required]')) {
    if (control.closest('.conditional-hidden')) continue;
    if (!control.checkValidity()) {
      control.classList.add('invalid');
      firstInvalid ||= control;
    }
  }

  if (firstInvalid) {
    firstInvalid.focus?.();
    showAlert('กรุณากรอกข้อมูลบังคับในขั้นตอนนี้ให้ครบถ้วน');
    return false;
  }
  return true;
}

async function validateStep(index) {
  if (index === 3) {
    applyUrgencyDurationRule();
    updateProposalReasonRules();
    updateRestrictionRule();
    if (!syncProposalReason().length) {
      showAlert('กรุณาเลือกเหตุผลในการเสนออย่างน้อย 1 ข้อ');
      return false;
    }
  }
  if (!validateContainer(steps[index])) return false;
  if (index === 1) {
    if (state.duplicate.checkedKey !== currentProductKey() || state.duplicate.blocked !== false) {
      const okay = await checkDuplicate();
      if (!okay) return false;
    }
  }
  if (index === 4 && !validateDocuments()) return false;
  return true;
}

async function validateAllSteps() {
  for (let index = 0; index < steps.length; index += 1) {
    if (index === steps.length - 1) continue;
    const valid = await validateStep(index);
    if (!valid) {
      showStep(index);
      return false;
    }
  }
  if (!validateContainer(steps[steps.length - 1])) return false;
  return true;
}

function renderApprover(data = {}) {
  if (approversContainer.children.length >= state.publicConfig.maximumApprovers) return;
  const index = approversContainer.children.length + 1;
  const card = document.createElement('article');
  card.className = 'approver-card';
  card.innerHTML = `
    <h3>ผู้เห็นชอบคนที่ <span class="approver-sequence">${index}</span></h3>
    <button type="button" class="remove-approver">ลบ</button>
    <div class="grid two-columns">
      <label class="field"><span>ชื่อ-นามสกุล</span><input data-approver-field="name" value="${escapeHtml(data.name || '')}"></label>
      <label class="field"><span>คำนำหน้าวิชาชีพ</span><input data-approver-field="professionalTitle" value="${escapeHtml(data.professionalTitle || '')}"></label>
      <label class="field"><span>แผนก</span><input data-approver-field="department" value="${escapeHtml(data.department || '')}"></label>
      <label class="field"><span>สาขา</span><input data-approver-field="specialty" value="${escapeHtml(data.specialty || '')}"></label>
    </div>`;
  card.querySelector('.remove-approver').addEventListener('click', () => {
    card.remove();
    resequenceApprovers();
    saveDraft();
  });
  card.querySelectorAll('input').forEach(input => input.addEventListener('input', debounce(saveDraft)));
  approversContainer.appendChild(card);
  resequenceApprovers();
}

function resequenceApprovers() {
  [...approversContainer.children].forEach((card, index) => setText(card.querySelector('.approver-sequence'), index + 1));
  addApproverButton.disabled = approversContainer.children.length >= state.publicConfig.maximumApprovers;
}

function collectApprovers() {
  return [...approversContainer.children].map(card => {
    const get = field => String(card.querySelector(`[data-approver-field="${field}"]`)?.value || '').trim();
    return { name: get('name'), professionalTitle: get('professionalTitle'), department: get('department'), specialty: get('specialty') };
  }).filter(item => item.name || item.professionalTitle || item.department || item.specialty);
}

function effectiveAccept(definition) {
  return state.publicConfig.acceptedExtensionsByDocumentType?.[definition.code] || definition.accept;
}

function renderDocuments() {
  documentList.innerHTML = '';
  DOCUMENT_DEFINITIONS.forEach(definition => {
    const card = document.createElement('article');
    card.className = 'document-card';
    card.dataset.documentCode = definition.code;
    const requiredLabel = definition.conditionalImport
      ? '<span class="required-chip conditional-chip">บังคับเมื่อเป็นยานำเข้า</span>'
      : definition.required ? '<span class="required-chip">บังคับ</span>' : '';
    const accept = effectiveAccept(definition);
    const inlineResources = findInlineResources(definition.code, state.publicTemplates);
    const inlineResourceButtons = inlineResources
      .map(resource => {
        const isExample = resource.resourceKind === 'example';
        const helperText = resource.helperText || resource.displayName || '';
        return `<button type="button" class="inline-template-button inline-resource-button ${isExample ? 'inline-resource-button--example' : 'inline-resource-button--template'}" data-inline-template-key="${escapeHtml(resource.templateKey)}">
          <span class="inline-resource-icon" aria-hidden="true">${isExample ? '↓' : '▣'}</span>
          <span class="inline-resource-copy">
            <strong>${escapeHtml(resource.actionLabel)}</strong>
            <small>${escapeHtml(helperText)}</small>
          </span>
          ${isExample ? '<span class="example-chip">ตัวอย่าง</span>' : ''}
        </button>`;
      })
      .join('');
    const inlineResourcePanel = inlineResources.length
      ? `<div class="document-resource-panel">
          <div class="document-resource-heading">
            <strong>ไฟล์ตัวอย่างและ Template</strong>
            <span>ดาวน์โหลดเพื่อดูรูปแบบก่อนจัดเตรียมไฟล์ Upload</span>
          </div>
          <div class="document-resource-list">${inlineResourceButtons}</div>
        </div>`
      : '';
    card.innerHTML = `
      <div class="document-head"><div><h3 class="document-title">${escapeHtml(definition.label)}</h3><p class="document-description">${escapeHtml(definition.description)} · รองรับ ${accept.map(item => `.${item}`).join(', ')}</p></div>${requiredLabel}</div>
      <div class="document-upload-actions">
        <input class="file-input" type="file" data-file-input="${definition.code}" accept="${accept.map(item => `.${item}`).join(',')}" ${definition.multiple ? 'multiple' : ''}>
      </div>
      ${inlineResourcePanel}
      <ul class="file-list" data-file-list="${definition.code}"></ul>
      ${definition.research ? '<div class="research-metadata" data-research-metadata></div>' : ''}`;
    card.querySelector('input[type="file"]').addEventListener('change', event => handleFileSelection(definition, event.target));
    card.querySelectorAll('[data-inline-template-key]').forEach(templateButton => {
      templateButton.addEventListener('click', () => downloadPublicTemplate(templateButton.dataset.inlineTemplateKey, templateButton));
    });
    documentList.appendChild(card);
  });
  updateConditionalDocuments();
}

function validateSelectedFile(file, definition) {
  const extension = fileExtension(file.name);
  const allowed = effectiveAccept(definition);
  if (!allowed.includes(extension)) return `ไฟล์ ${file.name} ต้องเป็น ${allowed.map(item => `.${item}`).join(', ')}`;
  const maximumBytes = Number(state.publicConfig.maximumFileSizeMb) * 1024 * 1024;
  if (file.size > maximumBytes) return `ไฟล์ ${file.name} มีขนาดเกิน ${state.publicConfig.maximumFileSizeMb} MB`;
  return '';
}

function handleFileSelection(definition, input) {
  let files = [...input.files];
  if (definition.maxFiles && files.length > definition.maxFiles) {
    showAlert(`${definition.label} อัปโหลดได้ไม่เกิน ${definition.maxFiles} ฉบับ`);
    input.value = '';
    files = [];
  }
  for (const file of files) {
    const error = validateSelectedFile(file, definition);
    if (error) {
      showAlert(error);
      input.value = '';
      files = [];
      break;
    }
  }
  state.documentFiles.set(definition.code, files);
  renderFileList(definition);
  if (definition.research) renderResearchMetadata(files);
  updateTotalFileSize();
}

function renderFileList(definition) {
  const list = documentList.querySelector(`[data-file-list="${definition.code}"]`);
  const files = state.documentFiles.get(definition.code) || [];
  list.innerHTML = files.map(file => `<li><span>${escapeHtml(file.name)}</span><span>${formatBytes(file.size)}</span></li>`).join('');
}

function renderResearchMetadata(files) {
  const container = documentList.querySelector('[data-research-metadata]');
  const previous = [...container.querySelectorAll('.research-card')].map(card => ({
    title: card.querySelector('[data-research-field="title"]')?.value || '',
    journal: card.querySelector('[data-research-field="journal"]')?.value || '',
    publicationYear: card.querySelector('[data-research-field="publicationYear"]')?.value || '',
    studyType: card.querySelector('[data-research-field="studyType"]')?.value || '',
    doi: card.querySelector('[data-research-field="doi"]')?.value || '',
    pmid: card.querySelector('[data-research-field="pmid"]')?.value || '',
    isLandmarkStudy: card.querySelector('[data-research-field="isLandmarkStudy"]')?.checked || false,
    olderEvidenceJustification: card.querySelector('[data-research-field="olderEvidenceJustification"]')?.value || ''
  }));
  container.innerHTML = '';
  files.forEach((file, index) => {
    const saved = previous[index] || {};
    const card = document.createElement('div');
    card.className = 'research-card';
    card.dataset.researchIndex = index;
    card.innerHTML = `
      <h4>ข้อมูลวิจัยฉบับที่ ${index + 1}: ${escapeHtml(file.name)}</h4>
      <div class="grid two-columns">
        <label class="field full"><span>ชื่อเรื่อง *</span><input data-research-field="title" value="${escapeHtml(saved.title || '')}" required></label>
        <label class="field"><span>วารสาร</span><input data-research-field="journal" value="${escapeHtml(saved.journal || '')}"></label>
        <label class="field"><span>ปีพิมพ์ *</span><input type="number" min="1900" max="${todayYear() + 1}" data-research-field="publicationYear" value="${escapeHtml(saved.publicationYear || '')}" required></label>
        <label class="field"><span>Study Type</span><input data-research-field="studyType" value="${escapeHtml(saved.studyType || '')}"></label>
        <label class="field"><span>DOI</span><input data-research-field="doi" value="${escapeHtml(saved.doi || '')}"></label>
        <label class="field"><span>PMID</span><input data-research-field="pmid" value="${escapeHtml(saved.pmid || '')}"></label>
        <label class="field full"><span><input type="checkbox" data-research-field="isLandmarkStudy" ${saved.isLandmarkStudy ? 'checked' : ''}> เป็น Landmark Study</span></label>
        <label class="field full older-justification hidden"><span>เหตุผลที่ใช้งานวิจัยเก่ากว่า 5 ปี *</span><textarea rows="2" data-research-field="olderEvidenceJustification">${escapeHtml(saved.olderEvidenceJustification || '')}</textarea></label>
      </div>`;
    const yearInput = card.querySelector('[data-research-field="publicationYear"]');
    yearInput.addEventListener('input', () => updateOlderResearchField(card));
    container.appendChild(card);
    updateOlderResearchField(card);
  });
}

function updateOlderResearchField(card) {
  const year = Number(card.querySelector('[data-research-field="publicationYear"]')?.value || 0);
  const wrapper = card.querySelector('.older-justification');
  const textarea = wrapper.querySelector('textarea');
  const old = year && todayYear() - year > 5;
  wrapper.classList.toggle('hidden', !old);
  textarea.required = Boolean(old);
}

function updateConditionalDocuments() {
  const imported = radioBoolean('isImportedProduct', false);
  const card = documentList.querySelector('[data-document-code="CERTIFICATE_FREE_SALE"]');
  if (!card) return;
  card.classList.toggle('conditional-hidden', !imported);
  if (!imported) {
    const input = card.querySelector('input[type="file"]');
    input.value = '';
    state.documentFiles.delete('CERTIFICATE_FREE_SALE');
    renderFileList(DOCUMENT_DEFINITIONS.find(item => item.code === 'CERTIFICATE_FREE_SALE'));
    updateTotalFileSize();
  }
}

function updateTotalFileSize() {
  const total = [...state.documentFiles.values()].flat().reduce((sum, file) => sum + file.size, 0);
  setText(totalFileSizeElement, formatBytes(total));
  const maxBytes = Number(state.publicConfig.maximumTotalUploadMb) * 1024 * 1024;
  if (total > maxBytes) {
    totalFileWarning.textContent = ` — เกินขนาดรวมสูงสุด ${state.publicConfig.maximumTotalUploadMb} MB`;
  } else {
    totalFileWarning.textContent = '';
  }
  return total;
}

function validateDocuments() {
  const imported = radioBoolean('isImportedProduct', false);
  for (const definition of DOCUMENT_DEFINITIONS) {
    if (definition.conditionalImport && !imported) continue;
    const files = state.documentFiles.get(definition.code) || [];
    if (definition.required && !files.length) {
      showAlert(`กรุณาแนบ ${definition.label}`);
      documentList.querySelector(`[data-document-code="${definition.code}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (definition.minFiles && files.length < definition.minFiles) {
      showAlert(`${definition.label} ต้องมีอย่างน้อย ${definition.minFiles} ฉบับ`);
      return false;
    }
    if (definition.maxFiles && files.length > definition.maxFiles) {
      showAlert(`${definition.label} ต้องไม่เกิน ${definition.maxFiles} ฉบับ`);
      return false;
    }
  }
  if (!validateContainer(steps[4])) return false;
  const total = updateTotalFileSize();
  if (total > Number(state.publicConfig.maximumTotalUploadMb) * 1024 * 1024) {
    showAlert(`ขนาดไฟล์รวมต้องไม่เกิน ${state.publicConfig.maximumTotalUploadMb} MB`);
    return false;
  }
  return true;
}

function validateDocumentsSilently() {
  const imported = radioBoolean('isImportedProduct', false);
  for (const definition of DOCUMENT_DEFINITIONS) {
    if (definition.conditionalImport && !imported) continue;
    const files = state.documentFiles.get(definition.code) || [];
    if (definition.required && !files.length) return false;
    if (definition.minFiles && files.length < definition.minFiles) return false;
    if (definition.maxFiles && files.length > definition.maxFiles) return false;
  }
  const total = [...state.documentFiles.values()].flat().reduce((sum, file) => sum + file.size, 0);
  return total <= Number(state.publicConfig.maximumTotalUploadMb) * 1024 * 1024;
}

function collectResearchMetadata() {
  return [...documentList.querySelectorAll('.research-card')].map(card => {
    const get = field => String(card.querySelector(`[data-research-field="${field}"]`)?.value || '').trim();
    return {
      title: get('title'),
      journal: get('journal'),
      publicationYear: Number(get('publicationYear')),
      studyType: get('studyType'),
      doi: get('doi'),
      pmid: get('pmid'),
      isLandmarkStudy: Boolean(card.querySelector('[data-research-field="isLandmarkStudy"]')?.checked),
      olderEvidenceJustification: get('olderEvidenceJustification')
    };
  });
}

function reviewItem(label, content) {
  return `<div class="review-item"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(content || '—')}</span></div>`;
}

function reviewSection(title, items) {
  return `<section class="review-section"><h3>${escapeHtml(title)}</h3><div class="review-grid">${items.join('')}</div></section>`;
}

function renderReview() {
  const documents = DOCUMENT_DEFINITIONS
    .filter(definition => !(definition.conditionalImport && !radioBoolean('isImportedProduct', false)))
    .map(definition => {
      const files = state.documentFiles.get(definition.code) || [];
      return reviewItem(definition.label, files.length ? files.map(file => file.name).join('\n') : 'ยังไม่ได้แนบ');
    });

  reviewContent.innerHTML = [
    reviewSection('บริษัทและผู้แทน', [
      reviewItem('บริษัท', value('companyName')),
      reviewItem('E-mail บริษัท', value('companyEmail')),
      reviewItem('โทรศัพท์บริษัท', value('companyPhone')),
      reviewItem('ผู้แทน', value('representativeName')),
      reviewItem('E-mail ผู้แทน', value('representativeEmail')),
      reviewItem('โทรศัพท์ผู้แทน', value('representativePhone'))
    ]),
    reviewSection('ผลิตภัณฑ์', [
      reviewItem('Brand Name', value('brandName')),
      reviewItem('Generic Name', value('genericName')),
      reviewItem('Strength', value('strength')),
      reviewItem('Dosage Form', value('dosageForm')),
      reviewItem('ผู้ผลิต / ประเทศ', `${value('manufacturerName')} / ${value('countryOfManufacture')}`),
      reviewItem('RMP', radioBoolean('rmp') === true ? 'Yes' : 'No'),
      reviewItem('ผลิตภัณฑ์นำเข้า', radioBoolean('isImportedProduct') === true ? 'ใช่' : 'ไม่ใช่'),
      reviewItem('จุดเด่น', value('comparativeAdvantage')),
      reviewItem('ข้อมูลทางคลินิกอื่น ๆ', value('otherClinicalInformation'))
    ]),
    reviewSection('แพทย์และเหตุผลในการเสนอ', [
      reviewItem('แพทย์ผู้เสนอ', `${value('physicianProfessionalTitle')} ${value('physicianName')}`.trim()),
      reviewItem('สาขา', value('physicianSpecialty')),
      reviewItem('ความเร่งด่วน', `${value('urgency')} · ${value('urgencyDuration')}`),
      reviewItem('เหตุผลในการเสนอ', value('proposalReason')),
      reviewItem('การจำกัดการสั่งใช้', radioBoolean('useRestrictionRequired') === true ? `จำกัดเฉพาะ ${value('restrictedSpecialty')}` : 'ไม่จำกัดการสั่งใช้')
    ]),
    reviewSection('Checklist ก่อน Submit', [
      reviewItem('ข้อมูลบังคับ', '✓ ผ่านการตรวจสอบตามแต่ละขั้นตอน'),
      reviewItem('ตรวจข้อมูลซ้ำ', state.duplicate.blocked === false ? '✓ ไม่ถูก Block' : '⚠ กรุณาตรวจอีกครั้ง'),
      reviewItem('เอกสารประกอบ', validateDocumentsSilently() ? '✓ ครบตามเงื่อนไข' : '⚠ ยังไม่ครบ')
    ]),
    reviewSection('เอกสาร', documents)
  ].join('');
}

function serializeDraft() {
  const fields = {};
  for (const control of form.querySelectorAll('input:not([type="file"]), textarea, select')) {
    if (!control.name || control.name === 'declarationAccepted') continue;
    if (control.type === 'radio') {
      if (control.checked) fields[control.name] = control.value;
    } else if (control.type === 'checkbox') {
      fields[control.name] = control.checked;
    } else {
      fields[control.name] = control.value;
    }
  }
  return { fields, approvers: collectApprovers(), savedAt: new Date().toISOString() };
}

function saveDraft() {
  if (state.submitting || state.submission) return;
  localStorage.setItem(APP_CONFIG.AUTOSAVE_KEY, JSON.stringify(serializeDraft()));
}

function restoreDraft() {
  const raw = localStorage.getItem(APP_CONFIG.AUTOSAVE_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    Object.entries(draft.fields || {}).forEach(([name, savedValue]) => {
      const controls = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      controls.forEach(control => {
        if (control.type === 'radio') control.checked = control.value === String(savedValue);
        else if (control.type === 'checkbox') control.checked = Boolean(savedValue);
        else control.value = savedValue;
      });
    });
    (draft.approvers || []).forEach(renderApprover);
    updateConditionalDocuments();
    applyUrgencyDurationRule();
    updateProposalReasonRules();
    updateRestrictionRule();
    showToast('กู้คืนแบบร่างแล้ว — กรุณาเลือกไฟล์แนบใหม่');
  } catch {
    localStorage.removeItem(APP_CONFIG.AUTOSAVE_KEY);
  }
}

async function encodeDocuments() {
  const allFiles = [];
  DOCUMENT_DEFINITIONS.forEach(definition => {
    (state.documentFiles.get(definition.code) || []).forEach(file => allFiles.push({ definition, file }));
  });
  const documents = [];
  for (let index = 0; index < allFiles.length; index += 1) {
    const { definition, file } = allFiles[index];
    setProgress(5 + Math.round((index / Math.max(allFiles.length, 1)) * 55), `กำลังเตรียมไฟล์ ${index + 1}/${allFiles.length}: ${file.name}`);
    const base64Data = await readFileAsBase64(file);
    documents.push({
      documentType: definition.code,
      fileName: file.name,
      mimeType: file.type || mimeTypeFromExtension(fileExtension(file.name)),
      base64Data,
      version: 1
    });
  }
  return documents;
}

function mimeTypeFromExtension(extension) {
  const map = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  return map[extension] || 'application/octet-stream';
}

function buildPayload(documents) {
  return {
    company: {
      companyName: value('companyName'),
      companyAddress: value('companyAddress'),
      companyEmail: value('companyEmail'),
      companyPhone: value('companyPhone'),
      companyPhoneExtension: value('companyPhoneExtension')
    },
    representative: {
      name: value('representativeName'),
      position: value('representativePosition'),
      email: value('representativeEmail'),
      phone: value('representativePhone'),
      alternatePhone: value('representativeAlternatePhone')
    },
    product: {
      brandName: value('brandName'),
      genericName: value('genericName'),
      strength: value('strength'),
      dosageForm: value('dosageForm'),
      manufacturerName: value('manufacturerName'),
      countryOfManufacture: value('countryOfManufacture'),
      thailandDistributor: value('thailandDistributor'),
      classification: value('classification'),
      chemicalComposition: value('chemicalComposition'),
      unitQuantity: value('unitQuantity'),
      shelfLife: value('shelfLife'),
      indication: value('indication'),
      pharmacologicalAction: value('pharmacologicalAction'),
      sideEffects: value('sideEffects'),
      contraindications: value('contraindications'),
      dosage: value('dosage'),
      drugInteraction: value('drugInteraction'),
      pregnancyLactation: value('pregnancyLactation'),
      pediatricGeriatricUse: value('pediatricGeriatricUse'),
      hepaticRenalDoseAdjustment: value('hepaticRenalDoseAdjustment'),
      tabletCrushingSplitting: value('tabletCrushingSplitting'),
      stabilityAfterReconstitution: value('stabilityAfterReconstitution'),
      otherClinicalInformation: value('otherClinicalInformation'),
      storage: value('storage'),
      rmp: radioBoolean('rmp'),
      isImportedProduct: radioBoolean('isImportedProduct'),
      comparableExistingDrug: value('comparableExistingDrug'),
      comparativeAdvantage: value('comparativeAdvantage'),
      costPerCourse: value('costPerCourse'),
      proposedPrice: value('proposedPrice'),
      sampleQuantity: value('sampleQuantity')
    },
    physicianProposal: {
      name: value('physicianName'),
      professionalTitle: value('physicianProfessionalTitle'),
      department: value('physicianDepartment'),
      specialty: value('physicianSpecialty'),
      phone: value('physicianPhone'),
      urgency: value('urgency'),
      urgencyDuration: value('urgencyDuration'),
      urgencyAmount: value('urgencyAmount'),
      urgencyUnit: value('urgencyUnit'),
      proposalReason: value('proposalReason'),
      proposalReasonStructured: {
        noAlternative: checked('proposalReasonNoAlternative'),
        safer: checked('proposalReasonSafer'),
        safetyDetail: value('proposalReasonSafetyDetail'),
        costEffective: checked('proposalReasonCostEffective'),
        comparisonDrug: value('proposalReasonComparisonDrug'),
        other: checked('proposalReasonOther'),
        otherDetail: value('proposalReasonOtherDetail')
      },
      useRestrictionRequired: radioBoolean('useRestrictionRequired', ''),
      restrictedSpecialty: value('restrictedSpecialty'),
      drugToRemove: value('drugToRemove'),
      impactIfNotApproved: value('impactIfNotApproved')
    },
    physicianApprovers: collectApprovers(),
    documents,
    researchEvidence: collectResearchMetadata()
  };
}

function setProgress(percent, message) {
  submitProgress.classList.remove('hidden');
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  setText(progressMessage, message);
}

async function submitApplication() {
  if (state.submitting) return;
  hideAlert();
  const valid = await validateAllSteps();
  if (!valid) return;

  state.submitting = true;
  submitButton.disabled = true;
  previousButton.disabled = true;
  setProgress(2, 'กำลังตรวจสอบข้อมูล…');
  try {
    const duplicateOkay = await checkDuplicate({ silent: true });
    if (!duplicateOkay) {
      showStep(1);
      throw new ApiError('DUPLICATE_BLOCKED', duplicateResult.textContent);
    }
    const documents = await encodeDocuments();
    setProgress(65, 'กำลังส่งข้อมูลและเอกสารไปยังระบบ กรุณาอย่าปิดหน้านี้…');
    const result = await apiRequest('submitApplication', buildPayload(documents), { timeoutMs: APP_CONFIG.REQUEST_TIMEOUT_MS });
    setProgress(100, 'ส่งคำขอสำเร็จ');
    state.submission = result;
    sessionStorage.setItem(APP_CONFIG.SESSION_KEY, JSON.stringify({
      submissionId: result.submissionId,
      submissionNo: result.submissionNo,
      status: result.status,
      submissionAccessToken: result.submissionAccessToken
    }));
    localStorage.removeItem(APP_CONFIG.AUTOSAVE_KEY);
    showSuccess(result);
  } catch (error) {
    if (!(error instanceof ApiError && error.code === 'DUPLICATE_BLOCKED')) showAlert(error.message || 'ส่งคำขอไม่สำเร็จ');
    setProgress(0, 'ส่งคำขอไม่สำเร็จ');
  } finally {
    state.submitting = false;
    submitButton.disabled = false;
    previousButton.disabled = false;
  }
}

function showSuccess(result) {
  form.classList.add('hidden');
  document.querySelector('#form-actions')?.classList.add('hidden');
  successPanel.classList.remove('hidden');
  setText(document.querySelector('#success-submission-no'), result.submissionNo);
  setText(document.querySelector('#success-status'), STATUS_LABELS[result.status] || result.status);
  const generated = result.generatedPdf?.success;
  setText(document.querySelector('#success-message'), generated
    ? 'ระบบสร้าง PDF ตาม Template สำเร็จ กรุณาดาวน์โหลดและนำไปให้แพทย์ลงนาม'
    : 'ระบบรับคำขอแล้ว แต่การสร้าง PDF ไม่สำเร็จ เจ้าหน้าที่สามารถ Retry จากระบบ Admin ได้');
  document.querySelector('#download-pdf-btn').disabled = !generated;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function downloadGeneratedPdf() {
  const stored = JSON.parse(sessionStorage.getItem(APP_CONFIG.SESSION_KEY) || 'null');
  if (!stored?.submissionId || !stored?.submissionAccessToken) {
    showAlert('ไม่พบ Token สำหรับดาวน์โหลด PDF กรุณาใช้ลิงก์ใน E-mail ยืนยันหรือติดต่อฝ่ายเภสัชกรรม');
    return;
  }
  const button = document.querySelector('#download-pdf-btn');
  button.disabled = true;
  button.textContent = 'กำลังดาวน์โหลด…';
  try {
    const result = await apiRequest('downloadGeneratedPdf', {
      submissionId: stored.submissionId,
      submissionAccessToken: stored.submissionAccessToken
    });
    downloadBlob(base64ToBlob(result.base64Data, result.mimeType), result.fileName);
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'ดาวน์โหลด PDF สำหรับแพทย์ลงนาม';
  }
}

function applyPublicConfiguration(config) {
  state.publicConfig = { ...state.publicConfig, ...config };
  setText(document.querySelector('#app-title'), config.appName || 'ระบบเสนอยาเข้าบัญชียา');
  setText(document.querySelector('#hospital-name'), config.hospitalName || 'โรงพยาบาลกรุงเทพหาดใหญ่');
  setText(document.querySelector('#footer-system-info'), `${config.documentFormCode || ''} ${config.documentRevision || ''} · Form App v${APP_CONFIG.APP_VERSION}`);
  systemStatus.textContent = 'ระบบพร้อมใช้งาน';
  systemStatus.className = 'system-pill ready';
  uploadLimitText.textContent = `สูงสุด ${state.publicConfig.maximumFileSizeMb} MB ต่อไฟล์ และ ${state.publicConfig.maximumTotalUploadMb} MB ต่อคำขอ`;
}

function renderPublicTemplatesSidebar() {
  publicTemplatesList.innerHTML = '';
  if (!state.publicTemplates.length) {
    publicTemplatesCard.classList.add('hidden');
    return;
  }

  state.publicTemplates.forEach(template => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'template-button';
    button.innerHTML = `${escapeHtml(template.displayName)}<small>${escapeHtml(template.description || '')}</small>`;
    button.addEventListener('click', () => downloadPublicTemplate(template.templateKey, button));
    publicTemplatesList.appendChild(button);
  });
  publicTemplatesCard.classList.remove('hidden');
}

async function loadInitialPublicData() {
  // Start both backend requests together. Step 5 is rendered only after both
  // requests settle, so document cards and their example/template actions
  // appear in the same paint instead of examples arriving later.
  const configPromise = apiRequest('getPublicConfig');
  const templatesPromise = apiRequest('listPublicTemplates');

  const [configResult, templatesResult] = await Promise.allSettled([
    configPromise,
    templatesPromise
  ]);

  if (configResult.status === 'fulfilled') {
    applyPublicConfiguration(configResult.value);
  } else {
    systemStatus.textContent = 'เชื่อมต่อ Backend ไม่สำเร็จ';
    systemStatus.className = 'system-pill error';
    uploadLimitText.textContent = 'ไม่สามารถโหลดข้อจำกัดจาก Backend ได้';
    showAlert(configResult.reason?.message || 'ไม่สามารถโหลดการตั้งค่าระบบได้');
  }

  if (templatesResult.status === 'fulfilled') {
    state.publicTemplates = Array.isArray(templatesResult.value) ? templatesResult.value : [];
  } else {
    state.publicTemplates = [];
    if (APP_CONFIG.ENABLE_DEBUG) console.warn(templatesResult.reason);
  }

  renderPublicTemplatesSidebar();
  renderDocuments();
  resequenceApprovers();
}

async function downloadPublicTemplate(templateKey, button) {
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = 'กำลังดาวน์โหลด…';
  try {
    const result = await apiRequest('downloadPublicTemplate', { templateKey });
    downloadBlob(base64ToBlob(result.base64Data, result.mimeType), result.fileName);
  } catch (error) {
    showAlert(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

function clearFormForNewSubmission() {
  form.reset();
  state.documentFiles.clear();
  state.researchMetadata = [];
  state.duplicate = { checkedKey: '', blocked: null, checking: false };
  state.submission = null;
  localStorage.removeItem(APP_CONFIG.AUTOSAVE_KEY);
  sessionStorage.removeItem(APP_CONFIG.SESSION_KEY);
  approversContainer.innerHTML = '';
  renderDocuments();
  applyUrgencyDurationRule();
  updateProposalReasonRules();
  updateRestrictionRule();
  successPanel.classList.add('hidden');
  form.classList.remove('hidden');
  document.querySelector('#form-actions')?.classList.remove('hidden');
  showStep(0);
}

function bindEvents() {
  nextButton.addEventListener('click', async () => {
    hideAlert();
    if (await validateStep(state.currentStep)) showStep(state.currentStep + 1);
  });
  previousButton.addEventListener('click', () => showStep(state.currentStep - 1));
  form.addEventListener('submit', event => { event.preventDefault(); submitApplication(); });
  checkDuplicateButton.addEventListener('click', () => checkDuplicate());
  addApproverButton.addEventListener('click', () => renderApprover());
  document.querySelectorAll('[name="brandName"], [name="strength"], [name="dosageForm"]').forEach(input => input.addEventListener('input', invalidateDuplicateCheck));
  document.querySelectorAll('[name="isImportedProduct"]').forEach(input => input.addEventListener('change', updateConditionalDocuments));
  form.elements.namedItem('urgency')?.addEventListener('change', () => {
    applyUrgencyDurationRule();
    saveDraft();
  });
  form.elements.namedItem('urgencyAmount')?.addEventListener('input', applyUrgencyDurationRule);
  form.elements.namedItem('urgencyUnit')?.addEventListener('change', applyUrgencyDurationRule);
  ['proposalReasonNoAlternative', 'proposalReasonSafer', 'proposalReasonCostEffective', 'proposalReasonOther'].forEach(name => {
    form.elements.namedItem(name)?.addEventListener('change', updateProposalReasonRules);
  });
  ['proposalReasonSafetyDetail', 'proposalReasonComparisonDrug', 'proposalReasonOtherDetail'].forEach(name => {
    form.elements.namedItem(name)?.addEventListener('input', syncProposalReason);
  });
  document.querySelectorAll('[name="useRestrictionRequired"]').forEach(input => input.addEventListener('change', updateRestrictionRule));
  form.addEventListener('input', debounce(saveDraft, 500));
  form.addEventListener('change', debounce(saveDraft, 300));
  document.querySelector('#clear-draft-btn').addEventListener('click', () => {
    if (confirm('ต้องการล้างข้อมูลแบบร่างทั้งหมดหรือไม่?')) clearFormForNewSubmission();
  });
  document.querySelector('#download-pdf-btn').addEventListener('click', downloadGeneratedPdf);
  document.querySelector('#new-submission-btn').addEventListener('click', clearFormForNewSubmission);
  document.querySelector('#copy-submission-no').addEventListener('click', async () => {
    await navigator.clipboard.writeText(document.querySelector('#success-submission-no').textContent);
    showToast('คัดลอกเลขคำขอแล้ว');
  });
}

async function initialize() {
  // Kick off public metadata immediately while the local UI is being prepared.
  const publicDataPromise = loadInitialPublicData();

  renderStepper();
  bindEvents();
  restoreDraft();
  applyUrgencyDurationRule();
  updateProposalReasonRules();
  updateRestrictionRule();
  showStep(0);

  await publicDataPromise;
}

initialize();
