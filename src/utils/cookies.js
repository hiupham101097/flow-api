/**
 * Tiện ích quản lý Cookie & LocalStorage cho cấu hình Platform Scope (App vs Web)
 */

export const PLATFORM_COOKIE_KEY = 'platform_scope';

/**
 * Đọc giá trị platform đã lưu từ Cookie hoặc LocalStorage dự phòng
 * @returns {'app' | 'web' | null}
 */
export function getStoredPlatformScope() {
  try {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${PLATFORM_COOKIE_KEY}=([^;]+)`));
      if (match) {
        const val = decodeURIComponent(match[1]).toLowerCase();
        if (val === 'web' || val === 'app') return val;
      }

      const local = localStorage.getItem(PLATFORM_COOKIE_KEY);
      if (local) {
        const val = local.toLowerCase();
        if (val === 'web' || val === 'app') return val;
      }
    }
  } catch (err) {
    console.warn('Không thể đọc platform cookie:', err);
  }
  return null;
}

/**
 * Ghi nhận lựa chọn platform vào Cookie (hạn 1 năm) và LocalStorage
 * @param {'app' | 'web'} scope
 */
export function setStoredPlatformScope(scope) {
  if (!scope || (scope !== 'app' && scope !== 'web')) return;
  try {
    if (typeof document !== 'undefined') {
      // Thời hạn cookie 365 ngày (1 năm)
      const maxAge = 365 * 24 * 60 * 60;
      document.cookie = `${PLATFORM_COOKIE_KEY}=${encodeURIComponent(scope)}; path=/; max-age=${maxAge}; SameSite=Lax`;
      localStorage.setItem(PLATFORM_COOKIE_KEY, scope);
    }
  } catch (err) {
    console.warn('Không thể lưu platform cookie:', err);
  }
}

/**
 * Xóa lựa chọn platform
 */
export function clearStoredPlatformScope() {
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${PLATFORM_COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
      localStorage.removeItem(PLATFORM_COOKIE_KEY);
    }
  } catch (err) {
    console.warn('Không thể xóa platform cookie:', err);
  }
}
