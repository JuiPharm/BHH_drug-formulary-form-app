# Inline Public Template Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มปุ่ม `ดาวน์โหลด Template` ใน Step 5 สำหรับ PI และ PowerPoint โดย reuse PublicTemplates API เดิมและไม่แก้ Backend

**Architecture:** เพิ่ม pure mapping/helper module สำหรับ document type → template key เพื่อทดสอบแยกจาก DOM ได้ จากนั้นให้ `app.js` เก็บ Public Templates ใน state และใช้ helper ตอน `renderDocuments()`. ปุ่ม inline reuse `downloadPublicTemplate()` เดิม ทำให้ behavior ดาวน์โหลดและ error handling เป็นชุดเดียวกับ sidebar.

**Tech Stack:** Vanilla HTML/CSS, ES modules, Node.js built-in test runner, GitHub Pages

## Global Constraints

- `PATIENT_INFORMATION_LEAFLET` → `PI_TEMPLATE`
- `PRESENTATION` → `PRESENTATION_TEMPLATE`
- ซ่อนปุ่ม inline เมื่อ template ไม่พร้อมใช้งาน
- ไม่แก้ Backend API
- คง sidebar Public Templates เดิม
- Form App version = `1.2.0`

---

### Task 1: Template mapping and tests

**Files:**
- Create: `js/document-template-rules.js`
- Create: `tests/document-template-rules.test.mjs`

**Interfaces:**
- Produces: `templateKeyForDocument(documentCode: string): string`
- Produces: `findInlineTemplate(documentCode: string, templates: Array<object>): object|null`

- [ ] **Step 1: Write failing tests** for PI mapping, PowerPoint mapping, unsupported document, found template, missing template.
- [ ] **Step 2: Run** `node --test tests/document-template-rules.test.mjs` and confirm failure because module is missing.
- [ ] **Step 3: Implement minimal mapping/helper module.**
- [ ] **Step 4: Run** `node --test tests/document-template-rules.test.mjs` and confirm pass.

### Task 2: Inline UI integration

**Files:**
- Modify: `js/app.js`
- Modify: `assets/styles.css`
- Create: `tests/document-template-ui.test.mjs`

**Interfaces:**
- Consumes: `findInlineTemplate()` from Task 1
- Uses existing: `downloadPublicTemplate(templateKey, button)`

- [ ] **Step 1: Write failing static UI tests** verifying `app.js` stores `publicTemplates`, calls `findInlineTemplate`, renders `data-inline-template-key`, and stylesheet contains action-row styles.
- [ ] **Step 2: Run** `node --test tests/document-template-ui.test.mjs` and confirm expected failure.
- [ ] **Step 3: Add `publicTemplates: []` to state, store results in `loadPublicTemplates()`, re-render documents after templates load, and render inline button only when helper finds a template.**
- [ ] **Step 4: Bind inline button click to existing `downloadPublicTemplate()`.**
- [ ] **Step 5: Add responsive `.document-upload-actions` / `.inline-template-button` CSS.**
- [ ] **Step 6: Run UI test and full test suite.**

### Task 3: Release metadata and deploy package

**Files:**
- Modify: `js/config.js`
- Modify: `README.md`
- Modify: `DEPLOY_UPDATE.md`

**Interfaces:**
- Produces deployable frontend ZIP; Backend unchanged.

- [ ] **Step 1: Bump Form App version to `1.2.0`.**
- [ ] **Step 2: Document `PI_TEMPLATE` and `PRESENTATION_TEMPLATE` Sheet configuration and state that no Backend redeploy is required.**
- [ ] **Step 3: Run `node --test tests/*.test.mjs`.**
- [ ] **Step 4: Run syntax checks for all `js/*.js` and `admin/js/*.js`.**
- [ ] **Step 5: Verify ZIP integrity and package frontend release.**
