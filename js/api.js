import { APP_CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message || code || 'เกิดข้อผิดพลาดจากระบบ');
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN_ERROR';
    this.details = details;
  }
}

function assertApiUrl() {
  if (!APP_CONFIG.API_URL || !APP_CONFIG.API_URL.startsWith('https://script.google.com/macros/s/') || !APP_CONFIG.API_URL.endsWith('/exec')) {
    throw new ApiError(
      'API_URL_NOT_CONFIGURED',
      'ยังไม่ได้ตั้งค่า API_URL ในไฟล์ js/config.js หรือ URL ไม่ได้ลงท้ายด้วย /exec'
    );
  }
}

export async function apiRequest(action, payload = {}, options = {}) {
  assertApiUrl();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || APP_CONFIG.REQUEST_TIMEOUT_MS);
  const requestId = crypto.randomUUID();
  const body = {
    action,
    requestId,
    payload
  };
  if (options.auth) body.auth = options.auth;

  try {
    const response = await fetch(APP_CONFIG.API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store'
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiError('INVALID_API_RESPONSE', 'Backend ไม่ได้ส่ง JSON กลับมา', { httpStatus: response.status, responseText: text.slice(0, 500) });
    }

    if (!parsed.success) {
      throw new ApiError(
        parsed.error?.code || 'API_ERROR',
        parsed.error?.message || 'Backend ปฏิเสธคำขอ',
        parsed.error?.details || null
      );
    }
    return parsed.data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('REQUEST_TIMEOUT', 'การเชื่อมต่อใช้เวลานานเกินกำหนด กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('NETWORK_ERROR', 'ไม่สามารถเชื่อมต่อ Backend ได้ กรุณาตรวจ API URL, Deployment และอินเทอร์เน็ต', { originalMessage: error.message });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function base64ToBlob(base64Data, mimeType = 'application/octet-stream') {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
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
