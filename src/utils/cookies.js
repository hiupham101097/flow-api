/**
 * Tiện ích quản lý Cookie & LocalStorage cho cấu hình Platform Scope (App vs Web) và Xác thực Người dùng
 */

export const PLATFORM_COOKIE_KEY = 'platform_scope';
export const AUTH_COOKIE_KEY = 'flow_auth_user';

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

/**
 * Đọc thông tin phiên đăng nhập đã lưu
 * @returns {{ username: string, role: 'app' | 'web', name: string } | null}
 */
export function getStoredAuthUser() {
  try {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_KEY}=([^;]+)`));
      if (match) {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        if (parsed && (parsed.role === 'web' || parsed.role === 'app')) {
          return parsed;
        }
      }

      const local = localStorage.getItem(AUTH_COOKIE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && (parsed.role === 'web' || parsed.role === 'app')) {
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Không thể đọc auth cookie:', err);
  }
  return null;
}

/**
 * Ghi nhận phiên đăng nhập vào Cookie và LocalStorage
 * @param {{ username: string, role: 'app' | 'web', name: string }} user
 */
export function setStoredAuthUser(user) {
  if (!user || !user.username) return;
  try {
    if (typeof document !== 'undefined') {
      const maxAge = 30 * 24 * 60 * 60; // 30 ngày
      const jsonStr = encodeURIComponent(JSON.stringify(user));
      document.cookie = `${AUTH_COOKIE_KEY}=${jsonStr}; path=/; max-age=${maxAge}; SameSite=Lax`;
      localStorage.setItem(AUTH_COOKIE_KEY, JSON.stringify(user));
    }
  } catch (err) {
    console.warn('Không thể lưu auth cookie:', err);
  }
}

/**
 * Xóa phiên đăng nhập
 */
export function clearStoredAuthUser() {
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${AUTH_COOKIE_KEY}=; path=/; max-age=0; SameSite=Lax`;
      localStorage.removeItem(AUTH_COOKIE_KEY);
    }
  } catch (err) {
    console.warn('Không thể xóa auth cookie:', err);
  }
}
