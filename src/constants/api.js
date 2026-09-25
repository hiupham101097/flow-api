export const API_BASE_URL = import.meta.env.VITE_WORKER_URL || 'https://flow-api.hieupham101097.workers.dev';
export const API_MONITOR_URL = API_BASE_URL;

/**
 * Trả về URL API tuyệt đối để đảm bảo hoạt động nhất quán cả khi chạy Vite dev (localhost)
 * lẫn khi chạy trên Cloudflare Workers / Custom Domain.
 */
export function getApiUrl(path = '') {
  if (!path) return API_BASE_URL;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

/**
 * Hàm fetch chuẩn hoá tự động bind URL API
 */
export async function apiFetch(path, options = {}) {
  const url = getApiUrl(path);
  return fetch(url, options);
}
