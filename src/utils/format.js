/**
 * Các hàm tiện ích định dạng dữ liệu, thời gian và nhận diện nền tảng
 */

// Màu của từng nhóm kết quả Funnel
export const OUTCOME_COLORS = {
  success_auto: 'var(--success)',
  success_manual: 'var(--accent)',
  failed: 'var(--danger)',
  abandoned: 'var(--warning)',
  open: 'var(--text-dim)',
  other: 'var(--line-strong)',
};

export const RANGE_OPTIONS = [
  { value: 1, label: 'Hôm nay' },
  { value: 7, label: '7 ngày qua' },
  { value: 30, label: '30 ngày qua' },
  { value: 90, label: '90 ngày qua' },
];

export const formatMs = (value) => {
  if (value === null || value === undefined) return '—';
  const ms = Number(value);
  return ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 0 : 1)}s` : `${ms}ms`;
};

// Chuẩn hóa timestamp SQLite UTC sang Date object
export function parseUtcDate(dateStr) {
  if (!dateStr) return null;
  const cleanStr = String(dateStr).trim();
  const isoStr = cleanStr.includes('T')
    ? (cleanStr.endsWith('Z') ? cleanStr : `${cleanStr}Z`)
    : `${cleanStr.replace(' ', 'T')}Z`;
  const d = new Date(isoStr);
  return isNaN(d.getTime()) ? new Date(dateStr) : d;
}

// Luôn hiển thị chính xác theo Giờ Việt Nam (Asia/Ho_Chi_Minh - GMT+7), 24h
export function formatVietnamTime(dateStr) {
  const d = parseUtcDate(dateStr);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  });
}

export function formatVietnamDate(dateStr) {
  const d = parseUtcDate(dateStr);
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

export function formatVietnamDateTime(dateStr) {
  const d = parseUtcDate(dateStr);
  if (!d || isNaN(d.getTime())) return '—';
  return `${d.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })} - ${d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
}

export const parseJsonSafe = (data) => {
  if (data === undefined || data === null) return null;
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
};

export const formatJsonPretty = (data) => {
  const parsed = parseJsonSafe(data);
  if (parsed === null) return 'null';
  if (typeof parsed === 'object') {
    return JSON.stringify(parsed, null, 2);
  }
  return String(parsed);
};

export const getStatusMeta = (statusCode) => {
  const code = Number(statusCode);
  if (code >= 200 && code < 300) {
    return { type: '200', badgeClass: 'status-200', pillClass: 'pill-success', label: 'OK' };
  }
  if (code >= 400 && code < 500) {
    return { type: '400', badgeClass: 'status-400', pillClass: 'pill-warning', label: 'Client Error' };
  }
  return { type: '500', badgeClass: 'status-500', pillClass: 'pill-danger', label: 'Server Error' };
};

export const getSummarySnippet = (log) => {
  const meta = getStatusMeta(log.status_code);
  if (meta.type === '200') {
    if (!log.response_payload) return '📦 Trả về 200 OK (Không có payload)';
    const payloadStr = typeof log.response_payload === 'string'
      ? log.response_payload
      : JSON.stringify(log.response_payload);
    const trimmed = payloadStr.trim();
    if (trimmed.startsWith('[')) {
      return '📦 Data: [Danh sách mảng dữ liệu]';
    }
    if (trimmed.startsWith('{')) {
      const matches = trimmed.slice(0, 250).match(/"([^"]+)":/g);
      if (matches && matches.length > 0) {
        const keys = matches.slice(0, 3).map((k) => k.replace(/[" :]/g, '')).join(', ');
        return `📦 Data: { ${keys}${matches.length > 3 ? ', …' : ''} }`;
      }
      return '📦 Data: { JSON Object }';
    }
    return `📦 Data: ${trimmed.substring(0, 45)}…`;
  }
  if (meta.type === '400') {
    return `⚠️ 4xx: ${log.error_message || 'Yêu cầu không hợp lệ'}`;
  }
  return `🚨 5xx: ${log.error_message || 'Lỗi hệ thống máy chủ'}`;
};

// Nhận diện chính xác nền tảng (Android / iOS / Web) của Crash Record
export function getCrashPlatform(crash) {
  if (!crash) return { key: 'unknown', name: 'Không rõ', icon: '📱', badgeClass: 'device-chip', label: '📱 Mobile' };
  let raw = '';
  if (crash.device_info) {
    if (typeof crash.device_info === 'object') {
      const p = String(crash.device_info.platform || '').toLowerCase();
      const o = String(crash.device_info.os || '').toLowerCase();
      if (p.includes('ios') || p.includes('apple') || p.includes('iphone') || o.includes('ios') || o.includes('apple') || o.includes('iphone')) {
        return { key: 'ios', name: 'iOS', icon: '🍎', badgeClass: 'badge-ios', label: '🍎 iOS' };
      }
      if (p.includes('android') || o.includes('android')) {
        return { key: 'android', name: 'Android', icon: '🤖', badgeClass: 'badge-android', label: '🤖 Android' };
      }
      raw = JSON.stringify(crash.device_info);
    } else {
      raw = String(crash.device_info);
    }
  }
  const combined = `${crash.device_name || ''} ${raw} ${crash.error_message || ''} ${crash.stack_trace || ''}`.toLowerCase();
  if (/iphone|ipad|ipod|ios|apple|runner\.app|\/var\/mobile|\.swift:\d+|\.m:\d+/i.test(combined)) {
    return { key: 'ios', name: 'iOS', icon: '🍎', badgeClass: 'badge-ios', label: '🍎 iOS' };
  }
  if (/android|\.apk|\/data\/user|dalvik|art|samsung|pixel|xiaomi|oppo|vivo|realme|redmi|huawei|oneplus|\.java:\d+|\.kt:\d+/i.test(combined)) {
    return { key: 'android', name: 'Android', icon: '🤖', badgeClass: 'badge-android', label: '🤖 Android' };
  }
  if (/web|chrome|firefox|safari|edge|browser/i.test(combined)) {
    return { key: 'web', name: 'Web', icon: '🌐', badgeClass: 'badge-web', label: '🌐 Web' };
  }
  return { key: 'mobile', name: 'Mobile', icon: '📱', badgeClass: 'device-chip', label: '📱 Mobile' };
}

export function isItemWeb(item) {
  if (!item) return false;
  if (item.job_type === 'web') return true;
  if (item.job_type === 'app') return false;

  const dev = String(item.device_name || item.device_info || '').toLowerCase();
  const app = String(item.app_identifier || '').toLowerCase();
  const ep = String(item.endpoint || '').toLowerCase();
  if (
    dev.includes('chrome') ||
    dev.includes('safari') ||
    dev.includes('firefox') ||
    dev.includes('edge') ||
    dev.includes('browser') ||
    dev.includes('trình duyệt') ||
    dev.includes('windows') ||
    dev.includes('macos') ||
    app.includes('web') ||
    app.includes('portal') ||
    ep.includes('myportal')
  ) {
    return true;
  }
  return false;
}

export function isDeviceWeb(deviceName) {
  if (!deviceName) return false;
  const dev = String(deviceName).toLowerCase();
  return (
    dev.includes('chrome') ||
    dev.includes('safari') ||
    dev.includes('firefox') ||
    dev.includes('edge') ||
    dev.includes('browser') ||
    dev.includes('trình duyệt') ||
    dev.includes('windows') ||
    dev.includes('macos') ||
    dev.includes('linux') ||
    dev.includes('opera') ||
    dev.includes('web')
  );
}
