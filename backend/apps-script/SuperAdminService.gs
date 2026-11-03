/**
 * V2 Super Admin management.
 *
 * Security rules:
 * - Only a *currently active* SUPER_ADMIN may call this service.
 * - Backend checks user privileges every time; never rely on client role.
 * - Deletion is a soft-disable for forensic/audit retention.
 * - Never disable/demote the final active SUPER_ADMIN.
 * - Temporary passwords returned once only to the authenticated super admin.
 * - Password hashes and pepper remain in Apps Script Script Properties / Sheets.
 */
const BHH_MANAGED_ROLES_ = Object.freeze([
  'SUPER_ADMIN', 'SYSTEM_ADMIN', 'PHARMACIST', 'PTC_SECRETARY', 'PTC_MEMBER'
]);

function requireSuperAdmin_(request) {
  const actor = requireAdmin_(request);
  const live = findAdminUserByEmail_(actor.email);
  if (!live || !toBoolean_(live.IsActive) ||
      String(live.Role || '').toUpperCase() !== 'SUPER_ADMIN') {
    throw appError_('SUPER_ADMIN_REQUIRED', 'เฉพาะ Super Admin เท่านั้น');
  }
  return actor;
}
function ensureManagedRole_(role) {
  const result = String(role || '').trim().toUpperCase();
  if (BHH_MANAGED_ROLES_.indexOf(result) < 0) {
    throw appError_('INVALID_ADMIN_ROLE', 'Role ไม่อยู่ในรายการที่อนุญาต');
  }
  return result;
}
function countActiveSuperAdmins_() {
  return findObjects_(getSheet_('AdminUsers'), function (row) {
    return toBoolean_(row.IsActive) && String(row.Role || '').toUpperCase() === 'SUPER_ADMIN';
  }).length;
}
function safeManagedUser_(row) {
  return {
    email: normalizeAdminEmail_(row.Email),
    displayName: String(row.DisplayName || ''),
    role: String(row.Role || ''),
    isActive: toBoolean_(row.IsActive),
    isLocked: toDateValue_(row.LockedUntil) > Date.now(),
    passwordConfigured: Boolean(row.PasswordHash && row.PasswordSalt),
    lastLoginAt: row.LastLoginAt || null,
    createdAt: row.CreatedAt || null,
    updatedAt: row.UpdatedAt || null
  };
}
function listManagedAdminUsers_(request) {
  requireSuperAdmin_(request);
  const rows = getSheetObjects_(getSheet_('AdminUsers'));
  return {
    items: rows.map(safeManagedUser_).sort(function (a, b) {
      return a.email.localeCompare(b.email);
    }),
    total: rows.length,
    roles: BHH_MANAGED_ROLES_
  };
}
function createManagedAdminUser_(request, payload, requestId) {
  // Lock serializes duplicate checks, privilege changes and account creation.
  const actor = requireSuperAdmin_(request);
  const lock = LockService.getScriptLock();
  lock.waitLock(APP.LOCK_TIMEOUT_MS);
  try {
    return createManagedAdminUserLocked_(actor, payload, requestId);
  } finally {
    lock.releaseLock();
  }
}
function createManagedAdminUserLocked_(actor, payload, requestId) {
  const email = normalizeAdminEmail_(payload.email);
  if (!isValidEmail_(email)) throw appError_('INVALID_ADMIN_EMAIL', 'E-mail ไม่ถูกต้อง');
  const role = ensureManagedRole_(payload.role || 'PHARMACIST');
  const displayName = String(payload.displayName || '').trim();
  if (!displayName || displayName.length > 120) {
    throw appError_('INVALID_ADMIN_NAME', 'กรุณาระบุชื่อไม่เกิน 120 ตัวอักษร');
  }
  // Re-activating an existing account is a separate operation and must not
  // silently replace its role/password.
  if (findAdminUserByEmail_(email)) {
    throw appError_('ADMIN_ALREADY_EXISTS', 'E-mail นี้มีบัญชีอยู่แล้ว');
  }
  const tempPassword = generateRandomAdminPassword_();
  const created = createAdminUser_(email, displayName, role, tempPassword);
  auditLog_(actor.email, 'superAdminCreateUser', 'AdminUser', email, requestId, {
    role: role
  });
  return {
    user: created,
    temporaryPassword: tempPassword,
    deliverPrivately: true
  };
}
function updateManagedAdminUser_(request, payload, requestId) {
  const actor = requireSuperAdmin_(request);
  const lock = LockService.getScriptLock();
  lock.waitLock(APP.LOCK_TIMEOUT_MS);
  try {
    return updateManagedAdminUserLocked_(actor, payload, requestId);
  } finally {
    lock.releaseLock();
  }
}
function updateManagedAdminUserLocked_(actor, payload, requestId) {
  const email = normalizeAdminEmail_(payload.email);
  const target = findAdminUserByEmail_(email);
  if (!target) throw appError_('ADMIN_NOT_FOUND', 'ไม่พบบัญชีผู้ใช้');
  const currentRole = String(target.Role || '').toUpperCase();
  const nextRole = Object.prototype.hasOwnProperty.call(payload, 'role')
    ? ensureManagedRole_(payload.role) : currentRole;
  const nextActive = Object.prototype.hasOwnProperty.call(payload, 'isActive')
    ? payload.isActive === true : toBoolean_(target.IsActive);
  const name = Object.prototype.hasOwnProperty.call(payload, 'displayName')
    ? String(payload.displayName || '').trim() : String(target.DisplayName || '');
  if (!name || name.length > 120) {
    throw appError_('INVALID_ADMIN_NAME', 'กรุณาระบุชื่อไม่เกิน 120 ตัวอักษร');
  }
  if (email === actor.email && (!nextActive || nextRole !== 'SUPER_ADMIN')) {
    throw appError_('CANNOT_REMOVE_OWN_SUPER_ADMIN', 'ไม่สามารถปิดบัญชีหรือลดสิทธิ์ของตนเอง');
  }
  const removingSuperAdmin = toBoolean_(target.IsActive) && currentRole === 'SUPER_ADMIN' &&
    (nextRole !== 'SUPER_ADMIN' || !nextActive);
  if (removingSuperAdmin && countActiveSuperAdmins_() <= 1) {
    throw appError_('LAST_SUPER_ADMIN', 'ต้องมี Super Admin ที่ใช้งานได้อย่างน้อยหนึ่งคน');
  }
  updateRowByNumber_(getSheet_('AdminUsers'), target.__rowNumber, {
    DisplayName: name, Role: nextRole, IsActive: nextActive, UpdatedAt: new Date()
  });
  // No stale role-bearing sessions after role/activation change.
  if (currentRole !== nextRole || toBoolean_(target.IsActive) !== nextActive) {
    revokeAllAdminSessions_(email);
  }
  auditLog_(actor.email, 'superAdminUpdateUser', 'AdminUser', email, requestId, {
    previousRole: currentRole, role: nextRole, isActive: nextActive
  });
  return { user: safeManagedUser_(findAdminUserByEmail_(email)) };
}
function disableManagedAdminUser_(request, payload, requestId) {
  return updateManagedAdminUser_(request, {
    email: payload.email, isActive: false
  }, requestId);
}
function resetManagedAdminPassword_(request, payload, requestId) {
  const actor = requireSuperAdmin_(request);
  const email = normalizeAdminEmail_(payload.email);
  const target = findAdminUserByEmail_(email);
  if (!target || !toBoolean_(target.IsActive)) {
    throw appError_('ADMIN_NOT_FOUND', 'ไม่พบบัญชีที่เปิดใช้งาน');
  }
  const tempPassword = generateRandomAdminPassword_();
  setAdminPassword_(email, tempPassword); // This revokes ALL active sessions.
  auditLog_(actor.email, 'superAdminResetPassword', 'AdminUser', email, requestId, {
    sessionsRevoked: true
  });
  return {
    email: email,
    temporaryPassword: tempPassword,
    requiresRelogin: true,
    deliverPrivately: true
  };
}
function unlockManagedAdminUser_(request, payload, requestId) {
  const actor = requireSuperAdmin_(request);
  const email = normalizeAdminEmail_(payload.email);
  const result = unlockAdminUser_(email);
  auditLog_(actor.email, 'superAdminUnlockUser', 'AdminUser', email, requestId, {});
  return result;
}
/**
 * ONE-TIME trusted setup from Apps Script editor, NOT reachable by doPost.
 * Promote the project owner's existing active account only if there is no
 * active super-admin. Requires manual authorized deployment access.
 */
function bootstrapOwnerSuperAdmin_() {
  const email = normalizeAdminEmail_(Session.getEffectiveUser().getEmail());
  const owner = findAdminUserByEmail_(email);
  if (!owner || !toBoolean_(owner.IsActive)) {
    throw appError_('OWNER_ADMIN_REQUIRED', 'เจ้าของ Script ต้องมีบัญชี Admin ที่เปิดใช้งานก่อน');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(APP.LOCK_TIMEOUT_MS);
  try {
    if (countActiveSuperAdmins_() > 0) {
      throw appError_('SUPER_ADMIN_ALREADY_EXISTS', 'ระบบมี Super Admin แล้ว');
    }
    updateRowByNumber_(getSheet_('AdminUsers'), owner.__rowNumber, {
      Role: 'SUPER_ADMIN', UpdatedAt: new Date()
    });
    revokeAllAdminSessions_(email);
    auditLog_(email, 'bootstrapSuperAdmin', 'AdminUser', email, 'EDITOR_ONLY', {});
    return { success: true, email: email, role: 'SUPER_ADMIN', requiresRelogin: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Operational write permission; PTC_MEMBER is read-only.
 * Clinical PTC decision approval workflows require separate institutional
 * sign-off and a decision reference before production go-live.
 */
function assertWorkflowWriterRole_(admin) {
  const role = String(admin && admin.role || '').toUpperCase();
  if (['SUPER_ADMIN','SYSTEM_ADMIN','PHARMACIST','PTC_SECRETARY'].indexOf(role) < 0) {
    throw appError_('WORKFLOW_WRITE_FORBIDDEN', 'บัญชีนี้ไม่มีสิทธิ์แก้ไขคำขอหรือเอกสาร');
  }
  return true;
}
