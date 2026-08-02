import { ADMIN_APP_CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message || code || 'เกิดข้อผิดพลาดจากระบบ');
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN_ERROR';
    this.details = details;
  }
}

const AUTH_FAILURE_CODES = new Set([
  'ADMIN_AUTH_REQUIRED',
  'INVALID_ADMIN_SESSION',
  'ADMIN_SESSION_EXPIRED',
  'ADMIN_ACCOUNT_DISABLED'
]);

export function getStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem(ADMIN_APP_CONFIG.SESSION_KEY) || 'null');
  } catch {
    sessionStorage.removeItem(ADMIN_APP_CONFIG.SESSION_KEY);
    return null;
  }
}

export function storeSession(session) {
  sessionStorage.setItem(ADMIN_APP_CONFIG.SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  sessionStorage.removeItem(ADMIN_APP_CONFIG.SESSION_KEY);
}

export async function apiRequest(action, payload = {}, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs || ADMIN_APP_CONFIG.REQUEST_TIMEOUT_MS
  );
  const request = {
    action,
    requestId: crypto.randomUUID(),
    payload
  };
  if (options.authenticated !== false) {
    const session = getStoredSession();
    if (!session?.sessionToken) {
      throw new ApiError('ADMIN_AUTH_REQUIRED', 'กรุณา Login ใหม่');
    }
    request.auth = { sessionToken: session.sessionToken };
  }

  try {
    const response = await fetch(ADMIN_APP_CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(request),
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store'
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError('INVALID_API_RESPONSE', 'Backend ไม่ได้ส่ง JSON กลับมา', {
        httpStatus: response.status,
        responseText: text.slice(0, 500)
      });
    }
    if (!parsed.success) {
      const error = new ApiError(
        parsed.error?.code || 'API_ERROR',
        parsed.error?.message || 'Backend ปฏิเสธคำขอ',
        parsed.error?.details || null
      );
      if (AUTH_FAILURE_CODES.has(error.code)) clearStoredSession();
      throw error;
    }
    return parsed.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('REQUEST_TIMEOUT', 'การเชื่อมต่อใช้เวลานานเกินกำหนด');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('NETWORK_ERROR', 'ไม่สามารถเชื่อมต่อ Backend ได้', {
      originalMessage: error.message
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`ไม่สามารถอ่านไฟล์ ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(base64Data, mimeType = 'application/octet-stream') {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'download';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
