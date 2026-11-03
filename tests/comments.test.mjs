import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function buildHarness() {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.resolve(root, '../backend/apps-script/CommentsService.gs'), 'utf8');
  const data = {
    Submissions: [{ SubmissionID: 'S1' }],
    StatusHistory: [{
      SubmissionID: 'S1', HistoryID: 'H1', Note: 'โปรดแก้ไขเอกสาร',
      ChangedBy: 'pharmacist@example.test', ChangedAt: '2026-11-01T10:00:00.000Z', NewStatus: 'INCOMPLETE_DOCUMENTS'
    }],
    SubmissionComments: []
  };
  const storage = { getSheetByName: name => name in data ? { name } : null };
  const scope = {
    APP: { MAX_COMMENT_LENGTH: 2000, LOCK_TIMEOUT_MS: 1000 },
    String, Object, Date, Boolean, Number,
    Utilities: { getUuid: () => 'COMMENT-1' },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    getSpreadsheet_: () => storage,
    getSheet_: name => {
      if (!(name in data)) throw new Error('missing sheet');
      return { name };
    },
    getSheetObjects_: sheet => data[sheet.name],
    findFirstObject_: (sheet, key, value) => data[sheet.name].find(row => String(row[key]) === String(value)),
    appendObject_: (sheet, record) => { data[sheet.name].push(record); },
    auditLog_() {},
    requireFields_: (obj, keys) => keys.forEach(key => {
      if (!String(obj[key] || '').trim()) throw new Error('Required: ' + key);
    }),
    toBoolean_: value => value === true || String(value).toLowerCase() === 'true',
    toDateValue_: value => new Date(value).getTime(),
    appError_: (code, message) => Object.assign(new Error(message), { code })
  };
  vm.createContext(scope);
  vm.runInContext(source, scope);
  return { scope, data };
}
test('legacy status note shows after reopened detail', () => {
  const { scope } = buildHarness();
  const feed = scope.getSubmissionCommentsMap_(['S1']).S1;
  assert.equal(feed.length, 1);
  assert.equal(feed[0].type, 'STATUS_NOTE');
  assert.equal(feed[0].text, 'โปรดแก้ไขเอกสาร');
});
test('independent comment is persisted and reloaded without changing workflow status', () => {
  const { scope, data } = buildHarness();
  data.Submissions[0].CurrentStatus = 'DOCUMENT_REVIEW';
  const created = scope.addSubmissionComment_({
    submissionId: 'S1',
    comment: 'บริษัทจะส่งเอกสารเพิ่มเติม',
    __actorEmail: 'pharmacist@example.test'
  }, 'test-request');
  assert.equal(created.type, 'COMMENT');
  assert.equal(data.Submissions[0].CurrentStatus, 'DOCUMENT_REVIEW');
  assert.equal(data.SubmissionComments[0].CommentText, created.text);
  const reopened = scope.getSubmissionCommentsMap_(['S1']).S1;
  assert.equal(reopened.length, 2);
  assert(reopened.some(item => item.text === 'บริษัทจะส่งเอกสารเพิ่มเติม'));
});
test('comment payload validation rejects empty and too-long text', () => {
  const { scope } = buildHarness();
  assert.throws(() => scope.addSubmissionComment_({ submissionId: 'S1', comment: '   ', __actorEmail: 'admin@test' }, 'r'), e => e.code === 'COMMENT_REQUIRED');
  assert.throws(() => scope.addSubmissionComment_({ submissionId: 'S1', comment: 'x'.repeat(2001), __actorEmail: 'admin@test' }, 'r'), e => e.code === 'COMMENT_TOO_LONG');
});
test('comment writer rejects request without a verified admin identity', () => {
  const { scope } = buildHarness();
  assert.throws(() => scope.addSubmissionComment_({ submissionId: 'S1', comment: 'text' }, 'r'), e => e.code === 'ADMIN_AUTH_REQUIRED');
});
