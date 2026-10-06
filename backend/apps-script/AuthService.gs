/**
 * Admin authentication.
 *
 * Passwords are never stored as plain text. The AdminUsers sheet stores a
 * per-user salt and an HMAC-SHA256 password verifier. A server-side pepper is
 * stored separately in Script Properties.
 */
const ADMIN_PASSWORD_ALGORITHM = 'HMAC-SHA256-PEPPER-V1';
function normalizeAdminEmail_(email) {
  return normalizeText_(email).replace(/\s+/g, '');
}
function getAdminAuthMode_() {
  const settings = getSystemSettings_();
  return String(settings.ADMIN_AUTH_MODE || 'PASSWORD').trim().toUpperCase();
}
function ensureAdminPasswordPepper_() {
  const props = PropertiesService.getScriptProperties();
  let pepper = String(props.getProperty(PROP_KEYS.ADMIN_PASSWORD_PEPPER) || '');
  if (!pepper) {
    pepper = generateSecureToken_() + generateSecureToken_();
    props.setProperty(PROP_KEYS.ADMIN_PASSWORD_PEPPER, pepper);
  }
  return pepper;
}
function hmacSha256Base64Url_(message, key) {
  const signature = Utilities.computeHmacSha256Signature(
    String(message),
    String(key),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(signature).replace(/=+$/g, '');
}
function hashAdminPassword_(email, password, salt) {
  const pepper = ensureAdminPasswordPepper_();
  const material = [
    ADMIN_PASSWORD_ALGORITHM,
    normalizeAdminEmail_(email),
    String(salt || ''),
    String(password || '')
  ].join('\n');
  return hmacSha256Base64Url_(material, pepper);
}
function hashAdminSessionToken_(rawToken) {
  return hashTextSha256_(String(rawToken || '') + '|' + ensureAdminPasswordPepper_());
}
function validateAdminPasswordPolicy_(password) {
  const settings = getSystemSettings_();
  const minimumLength = Math.max(Number(settings.ADMIN_PASSWORD_MIN_LENGTH || 8), 8);
  const value = String(password || '');
  if (value.length < minimumLength) {
    throw appError_(
      'WEAK_ADMIN_PASSWORD',
      'Password ต้องมีอย่างน้อย ' + minimumLength + ' ตัวอักษร'
    );
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    throw appError_(
      'WEAK_ADMIN_PASSWORD',
      'Password ต้องมีทั้งตัวอักษรและตัวเลข'
    );
  }
}
function findAdminUserByEmail_(email) {
  const normalized = normalizeAdminEmail_(email);
  if (!normalized) return null;
  return findObjects_(getSheet_('AdminUsers'), function (row) {
    return normalizeAdminEmail_(row.Email) === normalized;
  })[0] || null;
}
function createAdminUser_(email, displayName, role, password) {
  const normalizedEmail = normalizeAdminEmail_(email);
  if (!isValidEmail_(normalizedEmail)) {
    throw appError_('INVALID_ADMIN_EMAIL', 'รูปแบบ E-mail Admin ไม่ถูกต้อง');
  }
  validateAdminPasswordPolicy_(password);
  const sheet = getSheet_('AdminUsers');
  const existing = findAdminUserByEmail_(normalizedEmail);
  const now = new Date();
  if (existing) {
    updateRowByNumber_(sheet, existing.__rowNumber, {
      DisplayName: String(displayName || existing.DisplayName || '').trim(),
      Role: String(role || existing.Role || 'PHARMACIST').trim().toUpperCase(),
      IsActive: true,
      UpdatedAt: now
    });
  } else {
    appendObject_(sheet, {
      Email: normalizedEmail,
      DisplayName: String(displayName || '').trim(),
      Role: String(role || 'PHARMACIST').trim().toUpperCase(),
      PasswordHash: '',
      PasswordSalt: '',
      PasswordAlgorithm: '',
      PasswordChangedAt: '',
      FailedLoginCount: 0,
      LockedUntil: '',
      LastLoginAt: '',
      IsActive: true,
      CreatedAt: now,
      UpdatedAt: now
    });
  }
  setAdminPassword_(normalizedEmail, password);
  return getAdminProfileByEmail_(normalizedEmail);
}
function setAdminPassword_(email, password) {
  const normalizedEmail = normalizeAdminEmail_(email);
  validateAdminPasswordPolicy_(password);
  const sheet = getSheet_('AdminUsers');
  const admin = findAdminUserByEmail_(normalizedEmail);
  if (!admin) {
    throw appError_('ADMIN_NOT_FOUND', 'ไม่พบ Admin: ' + normalizedEmail);
  }
  const salt = generateSecureToken_();
  const passwordHash = hashAdminPassword_(normalizedEmail, password, salt);
  updateRowByNumber_(sheet, admin.__rowNumber, {
    PasswordHash: passwordHash,
    PasswordSalt: salt,
    PasswordAlgorithm: ADMIN_PASSWORD_ALGORITHM,
    PasswordChangedAt: new Date(),
    FailedLoginCount: 0,
    LockedUntil: '',
    UpdatedAt: new Date()
  });
  revokeAllAdminSessions_(normalizedEmail);
  return {
    success: true,
    email: normalizedEmail,
    passwordConfigured: true
  };
}
function setCurrentUserAdminPassword_(password) {
  const email = String(Session.getEffectiveUser().getEmail() || '').trim();
  if (!email) {
    throw appError_('CURRENT_USER_EMAIL_UNAVAILABLE', 'ไม่สามารถอ่าน E-mail ของผู้ที่ Run Script');
  }
  return setAdminPassword_(email, password);
}
function unlockAdminUser_(email) {
  const admin = findAdminUserByEmail_(email);
  if (!admin) throw appError_('ADMIN_NOT_FOUND', 'ไม่พบ Admin');
  updateRowByNumber_(getSheet_('AdminUsers'), admin.__rowNumber, {
    FailedLoginCount: 0,
    LockedUntil: '',
    UpdatedAt: new Date()
  });
  return { success: true, email: normalizeAdminEmail_(email) };
}
function revokeAllAdminSessions_(email) {
  const normalizedEmail = normalizeAdminEmail_(email);
  const sheet = getSheet_('AdminSessions');
  const rows = findObjects_(sheet, function (row) {
    return normalizeAdminEmail_(row.Email) === normalizedEmail && !row.RevokedAt;
  });
  const now = new Date();
  rows.forEach(function (row) {
    updateRowByNumber_(sheet, row.__rowNumber, { RevokedAt: now });
  });
  return rows.length;
}
function getAdminProfileByEmail_(email) {
  const admin = findAdminUserByEmail_(email);
  if (!admin) return null;
  return {
    email: normalizeAdminEmail_(admin.Email),
    displayName: String(admin.DisplayName || ''),
    role: String(admin.Role || ''),
    isActive: toBoolean_(admin.IsActive),
    passwordConfigured: Boolean(admin.PasswordHash && admin.PasswordSalt),
    lastLoginAt: admin.LastLoginAt || null
  };
}
function adminLogin_(payload, requestId) {
  requireFields_(payload, ['email', 'password'], 'payload');
  const mode = getAdminAuthMode_();
  if (mode !== 'PASSWORD' && mode !== 'BOTH') {
    throw appError_('PASSWORD_LOGIN_DISABLED', 'ระบบไม่ได้เปิดใช้ Email/Password Login');
  }
  const email = normalizeAdminEmail_(payload.email);
  const password = String(payload.password || '');
  const admin = findAdminUserByEmail_(email);
  // Run a dummy verifier for unknown accounts to reduce timing differences.
  if (!admin) {
    hashAdminPassword_(email || 'unknown@example.invalid', password, 'DUMMY_SALT');
    auditLog_(email || 'UNKNOWN', 'adminLoginFailed', 'AdminUser', email, requestId, {
      reason: 'INVALID_CREDENTIALS'
    });
    throw appError_('INVALID_ADMIN_CREDENTIALS', 'E-mail หรือ Password ไม่ถูกต้อง');
  }
  if (!toBoolean_(admin.IsActive)) {
    throw appError_('ADMIN_ACCOUNT_DISABLED', 'บัญชี Admin ถูกปิดใช้งาน');
  }
  const lockedUntilMs = toDateValue_(admin.LockedUntil);
  if (lockedUntilMs && lockedUntilMs > Date.now()) {
    throw appError_('ADMIN_ACCOUNT_LOCKED', 'บัญชีถูก Lock ชั่วคราว กรุณาลองใหม่ภายหลัง', {
      lockedUntil: new Date(lockedUntilMs).toISOString()
    });
  }
  if (!admin.PasswordHash || !admin.PasswordSalt) {
    throw appError_(
      'ADMIN_PASSWORD_NOT_CONFIGURED',
      'บัญชีนี้ยังไม่ได้ตั้ง Password กรุณาติดต่อผู้ดูแลระบบ'
    );
  }
  const suppliedHash = hashAdminPassword_(email, password, admin.PasswordSalt);
  const valid = constantTimeEqual_(suppliedHash, String(admin.PasswordHash || '')) &&
    String(admin.PasswordAlgorithm || ADMIN_PASSWORD_ALGORITHM) === ADMIN_PASSWORD_ALGORITHM;
  if (!valid) {
    const settings = getSystemSettings_();
    const maximumFailures = Math.max(Number(settings.ADMIN_MAX_FAILED_LOGINS || 5), 3);
    const lockMinutes = Math.max(Number(settings.ADMIN_LOCK_MINUTES || 15), 1);
    const failedCount = Number(admin.FailedLoginCount || 0) + 1;
    const updates = {
      FailedLoginCount: failedCount,
      UpdatedAt: new Date()
    };
    if (failedCount >= maximumFailures) {
      updates.LockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    }
    updateRowByNumber_(getSheet_('AdminUsers'), admin.__rowNumber, updates);
    auditLog_(email, 'adminLoginFailed', 'AdminUser', email, requestId, {
      reason: 'INVALID_CREDENTIALS',
      failedLoginCount: failedCount
    });
    throw appError_('INVALID_ADMIN_CREDENTIALS', 'E-mail หรือ Password ไม่ถูกต้อง');
  }
  updateRowByNumber_(getSheet_('AdminUsers'), admin.__rowNumber, {
    FailedLoginCount: 0,
    LockedUntil: '',
    LastLoginAt: new Date(),
    UpdatedAt: new Date()
  });
  const session = createAdminSession_(admin, payload.userAgent || '');
  auditLog_(email, 'adminLogin', 'AdminUser', email, requestId, {
    sessionId: session.sessionId,
    expiresAt: session.expiresAt
  });
  return {
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
    admin: {
      email: email,
      displayName: String(admin.DisplayName || ''),
      role: String(admin.Role || '')
    }
  };
}
function createAdminSession_(admin, userAgent) {
  const settings = getSystemSettings_();
  const hours = Math.min(Math.max(Number(settings.ADMIN_SESSION_HOURS || 8), 1), 24);
  const rawToken = generateSecureToken_() + generateSecureToken_();
  const tokenHash = hashAdminSessionToken_(rawToken);
  const sessionId = Utilities.getUuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
  appendObject_(getSheet_('AdminSessions'), {
    SessionID: sessionId,
    TokenHash: tokenHash,
    Email: normalizeAdminEmail_(admin.Email),
    DisplayNameSnapshot: String(admin.DisplayName || ''),
    RoleSnapshot: String(admin.Role || ''),
    CreatedAt: now,
    ExpiresAt: expiresAt,
    LastSeenAt: now,
    RevokedAt: '',
    UserAgent: String(userAgent || '').slice(0, 500)
  });
  return {
    sessionId: sessionId,
    sessionToken: rawToken,
    expiresAt: expiresAt.toISOString()
  };
}
function requireAdmin_(request) {
  const auth = request && request.auth ? request.auth : {};
  const mode = getAdminAuthMode_();
  if (auth.sessionToken && (mode === 'PASSWORD' || mode === 'BOTH')) {
    return requirePasswordSessionAdmin_(request, String(auth.sessionToken));
  }
  if (auth.idToken && (mode === 'GOOGLE' || mode === 'BOTH')) {
    return requireGoogleAdmin_(request, String(auth.idToken));
  }
  throw appError_('ADMIN_AUTH_REQUIRED', 'กรุณา Login ด้วยบัญชี Admin');
}
function requirePasswordSessionAdmin_(request, rawToken) {
  const tokenHash = hashAdminSessionToken_(rawToken);
  const sessionSheet = getSheet_('AdminSessions');
  const session = findObjects_(sessionSheet, function (row) {
    return constantTimeEqual_(String(row.TokenHash || ''), tokenHash) && !row.RevokedAt;
  })[0];
  if (!session) {
    throw appError_('INVALID_ADMIN_SESSION', 'Session ไม่ถูกต้องหรือถูกยกเลิก');
  }
  const expiresAtMs = toDateValue_(session.ExpiresAt);
  if (!expiresAtMs || expiresAtMs <= Date.now()) {
    updateRowByNumber_(sessionSheet, session.__rowNumber, { RevokedAt: new Date() });
    throw appError_('ADMIN_SESSION_EXPIRED', 'Session หมดอายุ กรุณา Login ใหม่');
  }
  const admin = findAdminUserByEmail_(session.Email);
  if (!admin || !toBoolean_(admin.IsActive)) {
    updateRowByNumber_(sessionSheet, session.__rowNumber, { RevokedAt: new Date() });
    throw appError_('ADMIN_ACCOUNT_DISABLED', 'บัญชี Admin ถูกปิดใช้งาน');
  }
  const lastSeenMs = toDateValue_(session.LastSeenAt);
  if (!lastSeenMs || Date.now() - lastSeenMs > 5 * 60 * 1000) {
    updateRowByNumber_(sessionSheet, session.__rowNumber, { LastSeenAt: new Date() });
  }
  request.__adminSession = session;
  request.__admin = {
    email: normalizeAdminEmail_(admin.Email),
    role: String(admin.Role || ''),
    displayName: String(admin.DisplayName || ''),
    authType: 'PASSWORD'
  };
  return request.__admin;
}
function requireGoogleAdmin_(request, idToken) {
  const response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) {
    throw appError_('INVALID_ID_TOKEN', 'Google ID token ไม่ถูกต้องหรือหมดอายุ');
  }
  const tokenInfo = JSON.parse(response.getContentText());
  const settings = getSystemSettings_();
  const expectedAudience = String(settings.GOOGLE_CLIENT_ID || '').trim();
  if (!expectedAudience || String(tokenInfo.aud || '') !== expectedAudience) {
    throw appError_('INVALID_TOKEN_AUDIENCE', 'Google ID token ไม่ได้ออกให้ระบบนี้');
  }
  const email = normalizeAdminEmail_(tokenInfo.email);
  if (!email || String(tokenInfo.email_verified) !== 'true') {
    throw appError_('UNVERIFIED_EMAIL', 'บัญชี Google ยังไม่ได้ยืนยัน E-mail');
  }
  const allowedDomain = String(settings.ADMIN_ALLOWED_DOMAIN || '').toLowerCase();
  const hostedDomain = String(tokenInfo.hd || '').toLowerCase();
  if (allowedDomain && hostedDomain !== allowedDomain) {
    throw appError_('ADMIN_DOMAIN_NOT_ALLOWED', 'บัญชีไม่อยู่ใน domain ที่อนุญาต');
  }
  const admin = findAdminUserByEmail_(email);
  if (!admin || !toBoolean_(admin.IsActive)) {
    throw appError_('ADMIN_NOT_WHITELISTED', 'บัญชีนี้ไม่มีสิทธิ์ Admin');
  }
  request.__admin = {
    email: email,
    role: String(admin.Role || ''),
    displayName: String(admin.DisplayName || ''),
    authType: 'GOOGLE'
  };
  return request.__admin;
}
function adminLogout_(request) {
  const admin = requireAdmin_(request);
  if (request.__adminSession) {
    updateRowByNumber_(getSheet_('AdminSessions'), request.__adminSession.__rowNumber, {
      RevokedAt: new Date()
    });
  }
  return { success: true, email: admin.email };
}
function getAdminProfile_(request) {
  const admin = requireAdmin_(request);
  return {
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    authType: admin.authType
  };
}
/**
 * เปลี่ยน Password ของ Admin ที่ Login อยู่
 *
 * ต้องยืนยัน Password ปัจจุบันก่อนทุกครั้ง เมื่อเปลี่ยนสำเร็จระบบจะยกเลิก
 * Session เดิมทั้งหมด และผู้ใช้ต้อง Login ใหม่ด้วย Password ใหม่
 */
function changeAdminPassword_(request, payload, requestId) {
  const signedInAdmin = requireAdmin_(request);
  if (signedInAdmin.authType !== 'PASSWORD') {
    throw appError_(
      'PASSWORD_CHANGE_NOT_AVAILABLE',
      'บัญชีนี้ไม่ได้ Login ด้วย Email/Password จึงไม่สามารถเปลี่ยน Password จากเมนูนี้ได้'
    );
  }
  requireFields_(payload, ['currentPassword', 'newPassword'], 'payload');
  const currentPassword = String(payload.currentPassword || '');
  const newPassword = String(payload.newPassword || '');
  if (currentPassword === newPassword) {
    throw appError_(
      'NEW_PASSWORD_MUST_DIFFER',
      'Password ใหม่ต้องไม่ซ้ำกับ Password ปัจจุบัน'
    );
  }
  const adminRecord = findAdminUserByEmail_(signedInAdmin.email);
  if (!adminRecord || !toBoolean_(adminRecord.IsActive)) {
    throw appError_('ADMIN_ACCOUNT_DISABLED', 'บัญชี Admin ถูกปิดใช้งาน');
  }
  if (!adminRecord.PasswordHash || !adminRecord.PasswordSalt) {
    throw appError_(
      'ADMIN_PASSWORD_NOT_CONFIGURED',
      'บัญชีนี้ยังไม่ได้ตั้ง Password กรุณาติดต่อผู้ดูแลระบบ'
    );
  }
  const suppliedHash = hashAdminPassword_(
    signedInAdmin.email,
    currentPassword,
    adminRecord.PasswordSalt
  );
  const currentPasswordValid = constantTimeEqual_(
    suppliedHash,
    String(adminRecord.PasswordHash || '')
  ) && String(adminRecord.PasswordAlgorithm || ADMIN_PASSWORD_ALGORITHM) === ADMIN_PASSWORD_ALGORITHM;
  if (!currentPasswordValid) {
    auditLog_(signedInAdmin.email, 'changeAdminPasswordFailed', 'AdminUser', signedInAdmin.email, requestId, {
      reason: 'INVALID_CURRENT_PASSWORD'
    });
    throw appError_('INVALID_CURRENT_PASSWORD', 'Password ปัจจุบันไม่ถูกต้อง');
  }
  validateAdminPasswordPolicy_(newPassword);
  setAdminPassword_(signedInAdmin.email, newPassword);
  auditLog_(signedInAdmin.email, 'changeAdminPassword', 'AdminUser', signedInAdmin.email, requestId, {
    sessionsRevoked: true
  });
  return {
    success: true,
    email: signedInAdmin.email,
    requiresRelogin: true,
    message: 'เปลี่ยน Password สำเร็จ กรุณา Login ใหม่'
  };
}
function getAdminPublicConfig_() {
  const settings = getSystemSettings_();
  return {
    appName: settings.APP_NAME || APP.NAME,
    appVersion: APP.VERSION,
    hospitalName: settings.HOSPITAL_NAME_TH || '',
    adminAuthMode: getAdminAuthMode_(),
    sessionHours: Number(settings.ADMIN_SESSION_HOURS || 8),
    passwordMinimumLength: Math.max(Number(settings.ADMIN_PASSWORD_MIN_LENGTH || 8), 8)
  };
}
function generateRandomAdminPassword_() {
  return 'BHH-' + generateSecureToken_().slice(0, 20) + '-9z';
}
function generateCurrentUserAdminPassword_() {
  const email = String(Session.getEffectiveUser().getEmail() || '').trim();
  if (!email) {
    throw appError_('CURRENT_USER_EMAIL_UNAVAILABLE', 'ไม่สามารถอ่าน E-mail ของผู้ที่ Run Script');
  }
  const password = generateRandomAdminPassword_();
  setAdminPassword_(email, password);
  const result = {
    email: normalizeAdminEmail_(email),
    temporaryPassword: password,
    instruction: 'คัดลอก Password นี้ทันที ระบบไม่ได้บันทึก Password จริงไว้ใน Sheet'
  };
  console.log(JSON.stringify(result));
  return result;
}
function generatePasswordsForUnconfiguredAdmins_() {
  const admins = findObjects_(getSheet_('AdminUsers'), function (row) {
    return toBoolean_(row.IsActive) && !row.PasswordHash;
  });
  const results = admins.map(function (admin) {
    const password = generateRandomAdminPassword_();
    setAdminPassword_(admin.Email, password);
    return {
      email: normalizeAdminEmail_(admin.Email),
      temporaryPassword: password
    };
  });
  console.log(JSON.stringify(results));
  return {
    success: true,
    generatedCount: results.length,
    credentials: results,
    instruction: 'คัดลอก Password จาก Execution result ทันที และห้ามบันทึกลง Google Sheet'
  };
}
