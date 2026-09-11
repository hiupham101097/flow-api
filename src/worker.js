const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ==========================================
// BỘ NHỚ ĐỆM TẠM THỜI TRÊN WORKER (EDGE MEMORY CACHE)
// Giúp giảm tải 90-99% lượt đọc đến Cloudflare D1
// ==========================================
const memoryCache = new Map();

function getCached(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key, data, ttlSeconds) {
  if (memoryCache.size > 250) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + (ttlSeconds * 1000),
  });
}

function clearCacheByPrefix(prefix) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

let tablesInitialized = false;
async function ensureSchema(db) {
  if (tablesInitialized) return;
  try {
    // 1. Bảng users
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 2. Bảng jobs
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('app', 'web')),
        app_identifier TEXT UNIQUE NOT NULL,
        target_url TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 3. Bảng api_logs
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS api_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        app_identifier TEXT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER,
        error_message TEXT,
        request_payload TEXT,
        response_payload TEXT,
        duration_ms INTEGER,
        device_name TEXT,
        user_name TEXT,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 4. Bảng app_crashes
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS app_crashes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        app_identifier TEXT,
        error_message TEXT NOT NULL,
        stack_trace TEXT,
        is_fatal INTEGER DEFAULT 0,
        device_info TEXT,
        custom_attributes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 5. Bảng app_events
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS app_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        app_identifier TEXT,
        event_name TEXT NOT NULL,
        event_type TEXT DEFAULT 'event',
        screen_name TEXT,
        user_id TEXT,
        parameters TEXT,
        device_info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 6. Các chỉ mục tối ưu đọc cao tốc
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_logs_created_at ON api_logs(created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_logs_app_created ON api_logs(app_identifier, created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_logs_job_created ON api_logs(job_id, created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_crashes_created_at ON app_crashes(created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_crashes_app_created ON app_crashes(app_identifier, created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_events_created_at ON app_events(created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_events_app_created ON app_events(app_identifier, created_at DESC)').run();

    tablesInitialized = true;
  } catch (err) {
    console.error('ensureSchema error:', err);
  }
}

const jsonResponse = (data, status = 200, cacheControl = null) => {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
  if (cacheControl) {
    headers['Cache-Control'] = cacheControl;
  } else if (status === 200) {
    headers['Cache-Control'] = 'no-cache';
  }
  return new Response(JSON.stringify(data), {
    status,
    headers,
  });
};

const formatPayload = (val) => {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '').replace(/^\/+/, '/');

    // Chỉ kiểm tra schema khi có thao tác GHI (POST/PUT/DELETE) để KHÔNG làm chậm hoặc quá tải lượt ĐỌC
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      if (
        path.startsWith('/logs') || 
        path.startsWith('/users') || 
        path.startsWith('/jobs') ||
        path.startsWith('/crashes') ||
        path.startsWith('/events')
      ) {
        await ensureSchema(env.DB);
      }
    }

    // ==========================================
    // 0. API TELEMETRY METADATA FILTERS: /telemetry/filters (CACHED 60S)
    // ==========================================
    if (path === '/telemetry/filters' && request.method === 'GET') {
      const cacheKey = 'telemetry_filters';
      const cached = getCached(cacheKey);
      if (cached) {
        return jsonResponse(cached, 200, 'public, max-age=30, stale-while-revalidate=60');
      }

      try {
        // 1. Lấy danh sách Jobs/Apps đã đăng ký kèm chủ sở hữu (sử dụng index)
        const { results: registeredJobs } = await env.DB.prepare(`
          SELECT 
            j.id as job_id,
            j.name as job_name,
            j.type as job_type,
            j.app_identifier,
            u.id as user_id,
            u.name as user_name
          FROM jobs j
          LEFT JOIN users u ON j.user_id = u.id
          ORDER BY j.created_at DESC
        `).all();

        const appsMap = new Map();
        (registeredJobs || []).forEach((j) => {
          if (j.app_identifier) {
            appsMap.set(j.app_identifier, {
              id: String(j.user_id || j.job_id || j.app_identifier),
              filterValue: String(j.user_id || j.app_identifier),
              job_name: j.job_name || j.app_identifier,
              app_identifier: j.app_identifier,
              job_type: j.job_type || 'app',
              user_name: j.user_name || 'Hệ thống',
            });
          }
        });

        // 2. Chỉ quét 100 bản ghi gần nhất có index thay vì quét toàn bộ bảng
        const [recentLogs, regUsers] = await Promise.all([
          env.DB.prepare('SELECT app_identifier, device_name, user_name FROM api_logs ORDER BY created_at DESC LIMIT 100').all(),
          env.DB.prepare('SELECT name FROM users LIMIT 100').all(),
        ]);

        const deviceSet = new Set();
        const userSet = new Set();

        (regUsers.results || []).forEach((r) => { if (r.name) userSet.add(r.name.trim()); });

        (recentLogs.results || []).forEach((r) => {
          if (r.app_identifier && !appsMap.has(r.app_identifier)) {
            appsMap.set(r.app_identifier, {
              id: r.app_identifier,
              filterValue: r.app_identifier,
              job_name: r.app_identifier,
              app_identifier: r.app_identifier,
              job_type: 'app',
              user_name: 'Telemetry App',
            });
          }
          if (r.device_name) deviceSet.add(r.device_name.trim());
          if (r.user_name) userSet.add(r.user_name.trim());
        });

        const filterData = {
          apps: Array.from(appsMap.values()),
          devices: Array.from(deviceSet).filter(Boolean).sort(),
          users: Array.from(userSet).filter(Boolean).sort(),
        };

        setCached(cacheKey, filterData, 60);
        return jsonResponse(filterData, 200, 'public, max-age=30, stale-while-revalidate=60');
      } catch (e) {
        return jsonResponse({ error: e.message, apps: [], devices: [], users: [] }, 500);
      }
    }

    // ==========================================
    // 1. API USERS: /users
    // ==========================================
    if (path === '/users' && request.method === 'GET') {
      const cacheKey = 'users:all';
      const cached = getCached(cacheKey);
      if (cached) {
        return jsonResponse(cached, 200, 'public, max-age=10, stale-while-revalidate=30');
      }

      try {
        const { results } = await env.DB.prepare(`
          SELECT 
            u.id, u.name, u.email, u.created_at,
            j.id as job_id, j.name as job_name, j.type as job_type, 
            j.app_identifier, j.target_url, j.status as job_status, j.created_at as job_created_at
          FROM users u
          LEFT JOIN jobs j ON u.id = j.user_id
          ORDER BY u.created_at DESC
        `).all();
        setCached(cacheKey, results, 30);
        return jsonResponse(results, 200, 'public, max-age=10, stale-while-revalidate=30');
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (path === '/users' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { name, email, job_name, job_type, app_identifier, target_url } = body;

        if (!name || !email) {
          return jsonResponse({ error: 'Name and email are required' }, 400);
        }

        // Tạo user
        const userInsert = await env.DB.prepare(
          'INSERT INTO users (name, email) VALUES (?, ?)'
        ).bind(name.trim(), email.trim()).run();

        const userId = userInsert.meta?.last_row_id;

        // Nếu có khai báo thông tin Job (mỗi user theo dõi 1 app hoặc 1 web)
        if (userId && (job_name || app_identifier)) {
          const sanitizedIdentifier = (app_identifier || `${job_type || 'app'}_${Date.now()}`).trim().toLowerCase().replace(/\s+/g, '_');
          await env.DB.prepare(`
            INSERT INTO jobs (user_id, name, type, app_identifier, target_url, status)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            userId,
            job_name || `${name}'s ${job_type === 'web' ? 'Web' : 'App'}`,
            job_type === 'web' ? 'web' : 'app',
            sanitizedIdentifier,
            target_url || null,
            'active'
          ).run();
        }

        // Xóa cache để dữ liệu mới hiển thị ngay lập tức
        clearCacheByPrefix('users:');
        clearCacheByPrefix('jobs:');
        clearCacheByPrefix('telemetry_filters');

        return jsonResponse({ success: true, user_id: userId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // DELETE /users/:id
    const userMatch = path.match(/^\/users\/(\d+)$/);
    if (userMatch && request.method === 'DELETE') {
      try {
        const userId = Number(userMatch[1]);
        await env.DB.prepare('DELETE FROM jobs WHERE user_id = ?').bind(userId).run();
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

        clearCacheByPrefix('users:');
        clearCacheByPrefix('jobs:');
        clearCacheByPrefix('telemetry_filters');

        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 2. API JOBS: /jobs
    // ==========================================
    if (path === '/jobs' && request.method === 'GET') {
      const cacheKey = `jobs:${url.search}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return jsonResponse(cached, 200, 'public, max-age=10, stale-while-revalidate=30');
      }

      try {
        const userIdParam = url.searchParams.get('user_id');
        const typeParam = url.searchParams.get('type');

        let query = `
          SELECT 
            j.*, 
            u.name as user_name, u.email as user_email
          FROM jobs j
          LEFT JOIN users u ON j.user_id = u.id
          WHERE 1=1
        `;
        const params = [];

        if (userIdParam) {
          query += ' AND j.user_id = ?';
          params.push(Number(userIdParam));
        }
        if (typeParam) {
          query += ' AND j.type = ?';
          params.push(typeParam);
        }

        query += ' ORDER BY j.created_at DESC';

        const stmt = env.DB.prepare(query);
        const { results } = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all();

        setCached(cacheKey, results, 30);
        return jsonResponse(results, 200, 'public, max-age=10, stale-while-revalidate=30');
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    if (path === '/jobs' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { user_id, name, type, app_identifier, target_url, status } = body;

        if (!user_id || !name || !app_identifier) {
          return jsonResponse({ error: 'user_id, name, and app_identifier are required' }, 400);
        }

        const sanitizedIdentifier = app_identifier.trim().toLowerCase().replace(/\s+/g, '_');

        // Mỗi user theo dõi 1 app/web: Cập nhật hoặc thêm mới
        const existingJob = await env.DB.prepare('SELECT id FROM jobs WHERE user_id = ?').bind(user_id).first();
        if (existingJob) {
          await env.DB.prepare(`
            UPDATE jobs 
            SET name = ?, type = ?, app_identifier = ?, target_url = ?, status = ?
            WHERE user_id = ?
          `).bind(
            name.trim(),
            type === 'web' ? 'web' : 'app',
            sanitizedIdentifier,
            target_url || null,
            status || 'active',
            user_id
          ).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO jobs (user_id, name, type, app_identifier, target_url, status)
            VALUES (?, ?, ?, ?, ?, ?)
          `).bind(
            user_id,
            name.trim(),
            type === 'web' ? 'web' : 'app',
            sanitizedIdentifier,
            target_url || null,
            status || 'active'
          ).run();
        }

        clearCacheByPrefix('jobs:');
        clearCacheByPrefix('users:');
        clearCacheByPrefix('telemetry_filters');

        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    const jobMatch = path.match(/^\/jobs\/(\d+)$/);
    if (jobMatch && request.method === 'DELETE') {
      try {
        const jobId = Number(jobMatch[1]);
        await env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(jobId).run();

        clearCacheByPrefix('jobs:');
        clearCacheByPrefix('users:');
        clearCacheByPrefix('telemetry_filters');

        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 3. API LOGS: /logs (TỐI ƯU HÓA ĐỌC CAO TỐC & CACHE)
    // ==========================================
    if (path === '/logs' && request.method === 'GET') {
      const cacheKey = `logs:${url.search}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return jsonResponse(cached, 200, 'public, max-age=5, stale-while-revalidate=10');
      }

      try {
        const jobId = url.searchParams.get('job_id');
        const userId = url.searchParams.get('user_id');
        const appIdentifier = url.searchParams.get('app_identifier') || url.searchParams.get('app_id');
        const deviceParam = url.searchParams.get('device') || url.searchParams.get('device_name');
        const ipParam = url.searchParams.get('ip') || url.searchParams.get('ip_address');
        const userParam = url.searchParams.get('user') || url.searchParams.get('user_name');
        const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 300);

        // JOIN tách biệt j1 và j2 thay vì dùng OR, cho phép SQLite dùng index Primary Key và Unique Key cực nhanh
        let query = `
          SELECT 
            l.id,
            l.job_id,
            l.app_identifier,
            l.endpoint,
            l.method,
            l.status_code,
            l.error_message,
            l.request_payload,
            l.response_payload,
            l.duration_ms,
            l.ip_address,
            l.user_name,
            COALESCE(l.device_name, CASE WHEN COALESCE(j1.type, j2.type) = 'web' THEN 'Trình duyệt Web' ELSE 'Thiết bị di động' END) as device_name,
            l.created_at,
            COALESCE(j1.name, j2.name) as job_name,
            COALESCE(j1.type, j2.type) as job_type,
            COALESCE(u1.id, u2.id) as user_id,
            COALESCE(u1.name, u2.name) as job_owner_name
          FROM api_logs l
          LEFT JOIN jobs j1 ON l.job_id = j1.id
          LEFT JOIN jobs j2 ON (l.job_id IS NULL AND l.app_identifier = j2.app_identifier)
          LEFT JOIN users u1 ON j1.user_id = u1.id
          LEFT JOIN users u2 ON j2.user_id = u2.id
          WHERE 1=1
        `;
        const params = [];

        if (jobId) {
          query += ' AND l.job_id = ?';
          params.push(Number(jobId));
        }
        if (userId) {
          query += ' AND (u1.id = ? OR u2.id = ?)';
          params.push(Number(userId), Number(userId));
        }
        if (appIdentifier) {
          query += ' AND l.app_identifier = ?';
          params.push(appIdentifier);
        }
        if (deviceParam) {
          query += ' AND l.device_name LIKE ?';
          params.push(`%${deviceParam}%`);
        }
        if (ipParam) {
          query += ' AND l.ip_address LIKE ?';
          params.push(`%${ipParam}%`);
        }
        if (userParam) {
          query += ' AND l.user_name LIKE ?';
          params.push(`%${userParam}%`);
        }

        query += ' ORDER BY l.created_at DESC LIMIT ?';
        params.push(limit);

        const stmt = env.DB.prepare(query);
        const { results } = await stmt.bind(...params).all();

        setCached(cacheKey, results, 5);
        return jsonResponse(results, 200, 'public, max-age=5, stale-while-revalidate=10');
      } catch (e) {
        try {
          const { results } = await env.DB.prepare(
            'SELECT * FROM api_logs ORDER BY created_at DESC LIMIT 50'
          ).all();
          return jsonResponse(results, 200, 'public, max-age=5');
        } catch (err) {
          return jsonResponse({ error: e.message }, 500);
        }
      }
    }

    if (path === '/logs' && request.method === 'POST') {
      try {
        const body = await request.json();
        const {
          endpoint,
          method,
          status_code,
          error_message,
          request_payload,
          response_payload,
          duration_ms,
          app_id,
          app_identifier,
          job_id,
          device_name,
          device_info,
          user_name,
          user,
          user_id,
          ip_address,
        } = body;

        const clientIp = (
          request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-forwarded-for')?.split(',')[0] ||
          request.headers.get('x-real-ip') ||
          ip_address ||
          body.ip ||
          ''
        ).trim();

        const clientUserName = (user_name || user || (user_id ? String(user_id) : '')).trim();

        let effectiveDeviceName = (device_name || body.device || '').trim();
        if (!effectiveDeviceName && device_info) {
          if (typeof device_info === 'object') {
            effectiveDeviceName = (device_info.device_name || device_info.model || device_info.name || device_info.os || '').trim();
          } else if (typeof device_info === 'string') {
            try {
              const parsed = JSON.parse(device_info);
              effectiveDeviceName = (parsed.device_name || parsed.model || parsed.name || parsed.os || '').trim();
            } catch (_) {
              effectiveDeviceName = device_info.slice(0, 50).trim();
            }
          }
        }
        if (!effectiveDeviceName) {
          const ua = request.headers.get('user-agent') || '';
          if (ua.includes('iPhone')) effectiveDeviceName = 'Apple iPhone';
          else if (ua.includes('iPad')) effectiveDeviceName = 'Apple iPad';
          else if (ua.includes('Android')) effectiveDeviceName = 'Thiết bị Android';
          else if (ua.includes('Windows')) effectiveDeviceName = 'Windows PC';
          else if (ua.includes('Macintosh')) effectiveDeviceName = 'Apple Mac';
          else if (ua.includes('Linux')) effectiveDeviceName = 'Linux Client';
          else if (ua.includes('Dart')) effectiveDeviceName = 'Flutter Mobile';
          else effectiveDeviceName = 'Thiết bị di động';
        }

        const effectiveAppIdentifier = (app_identifier || app_id || '').trim();
        let effectiveJobId = job_id ? Number(job_id) : null;

        // Nếu chưa có job_id nhưng có app_identifier, tìm kiếm job_id tương ứng
        if (!effectiveJobId && effectiveAppIdentifier) {
          try {
            const matchedJob = await env.DB.prepare(
              'SELECT id FROM jobs WHERE app_identifier = ?'
            ).bind(effectiveAppIdentifier).first();
            if (matchedJob) {
              effectiveJobId = matchedJob.id;
            }
          } catch (_) {}
        }

        try {
          await env.DB.prepare(`
            INSERT INTO api_logs (
              job_id, app_identifier, endpoint, method, status_code, 
              error_message, request_payload, response_payload, duration_ms,
              device_name, user_name, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            effectiveJobId,
            effectiveAppIdentifier || null,
            endpoint || '',
            method || 'GET',
            status_code || null,
            error_message || null,
            formatPayload(request_payload),
            formatPayload(response_payload),
            duration_ms || 0,
            effectiveDeviceName || null,
            clientUserName || null,
            clientIp || null
          ).run();
        } catch (insertErr) {
          await env.DB.prepare(`
            INSERT INTO api_logs (
              job_id, app_identifier, endpoint, method, status_code, 
              error_message, request_payload, response_payload, duration_ms, device_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            effectiveJobId,
            effectiveAppIdentifier || null,
            endpoint || '',
            method || 'GET',
            status_code || null,
            error_message || null,
            formatPayload(request_payload),
            formatPayload(response_payload),
            duration_ms || 0,
            effectiveDeviceName || null
          ).run();
        }

        // Xóa cache logs và metadata để phản ánh dữ liệu mới
        clearCacheByPrefix('logs:');
        clearCacheByPrefix('telemetry_filters');

        return jsonResponse({ success: true, job_id: effectiveJobId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 4. API CRASHES: /crashes (Crashlytics CACHED & TỐI ƯU HÓA)
    // ==========================================
    if (path === '/crashes' && request.method === 'GET') {
      const cacheKey = `crashes:${url.search}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return jsonResponse(cached, 200, 'public, max-age=5, stale-while-revalidate=10');
      }

      try {
        const jobId = url.searchParams.get('job_id');
        const userId = url.searchParams.get('user_id');
        const appIdentifier = url.searchParams.get('app_identifier') || url.searchParams.get('app_id');
        const isFatal = url.searchParams.get('is_fatal');
        const deviceParam = url.searchParams.get('device');
        const userParam = url.searchParams.get('user');
        const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 300);

        let query = `
          SELECT 
            c.*,
            COALESCE(j1.name, j2.name) as job_name,
            COALESCE(j1.type, j2.type) as job_type,
            COALESCE(u1.id, u2.id) as user_id,
            COALESCE(u1.name, u2.name) as user_name
          FROM app_crashes c
          LEFT JOIN jobs j1 ON c.job_id = j1.id
          LEFT JOIN jobs j2 ON (c.job_id IS NULL AND c.app_identifier = j2.app_identifier)
          LEFT JOIN users u1 ON j1.user_id = u1.id
          LEFT JOIN users u2 ON j2.user_id = u2.id
          WHERE 1=1
        `;
        const params = [];

        if (jobId) {
          query += ' AND c.job_id = ?';
          params.push(Number(jobId));
        }
        if (userId) {
          query += ' AND (u1.id = ? OR u2.id = ?)';
          params.push(Number(userId), Number(userId));
        }
        if (appIdentifier) {
          query += ' AND c.app_identifier = ?';
          params.push(appIdentifier);
        }
        if (isFatal !== null && isFatal !== undefined && isFatal !== '') {
          query += ' AND c.is_fatal = ?';
          params.push(Number(isFatal));
        }
        if (deviceParam) {
          query += ' AND c.device_info LIKE ?';
          params.push(`%${deviceParam}%`);
        }
        if (userParam) {
          query += ' AND (COALESCE(u1.name, u2.name) LIKE ? OR c.custom_attributes LIKE ?)';
          params.push(`%${userParam}%`, `%${userParam}%`);
        }

        query += ' ORDER BY c.created_at DESC LIMIT ?';
        params.push(limit);

        const stmt = env.DB.prepare(query);
        const { results } = await stmt.bind(...params).all();

        setCached(cacheKey, results, 5);
        return jsonResponse(results, 200, 'public, max-age=5, stale-while-revalidate=10');
      } catch (e) {
        try {
          const { results } = await env.DB.prepare(
            'SELECT * FROM app_crashes ORDER BY created_at DESC LIMIT 50'
          ).all();
          return jsonResponse(results, 200, 'public, max-age=5');
        } catch (err) {
          return jsonResponse({ error: e.message }, 500);
        }
      }
    }

    if (path === '/crashes' && request.method === 'POST') {
      try {
        const body = await request.json();
        const {
          error_message,
          stack_trace,
          is_fatal,
          device_info,
          custom_attributes,
          app_id,
          app_identifier,
          job_id,
        } = body;

        if (!error_message) {
          return jsonResponse({ error: 'error_message is required' }, 400);
        }

        const effectiveAppIdentifier = (app_identifier || app_id || '').trim();
        let effectiveJobId = job_id ? Number(job_id) : null;

        if (!effectiveJobId && effectiveAppIdentifier) {
          try {
            const matchedJob = await env.DB.prepare(
              'SELECT id FROM jobs WHERE app_identifier = ?'
            ).bind(effectiveAppIdentifier).first();
            if (matchedJob) {
              effectiveJobId = matchedJob.id;
            }
          } catch (_) {}
        }

        const res = await env.DB.prepare(`
          INSERT INTO app_crashes (
            job_id, app_identifier, error_message, stack_trace,
            is_fatal, device_info, custom_attributes
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          effectiveJobId,
          effectiveAppIdentifier || null,
          String(error_message),
          stack_trace ? String(stack_trace) : null,
          is_fatal ? 1 : 0,
          formatPayload(device_info),
          formatPayload(custom_attributes)
        ).run();

        clearCacheByPrefix('crashes:');
        clearCacheByPrefix('telemetry_filters');

        return jsonResponse({ success: true, id: res.meta?.last_row_id, job_id: effectiveJobId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 5. API EVENTS (ANALYTICS): /events (CACHED & TỐI ƯU HÓA)
    // ==========================================
    if (path === '/events' && request.method === 'GET') {
      const cacheKey = `events:${url.search}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return jsonResponse(cached, 200, 'public, max-age=5, stale-while-revalidate=10');
      }

      try {
        const jobId = url.searchParams.get('job_id');
        const userId = url.searchParams.get('user_id');
        const appIdentifier = url.searchParams.get('app_identifier') || url.searchParams.get('app_id');
        const eventName = url.searchParams.get('event_name');
        const eventType = url.searchParams.get('event_type');
        const deviceParam = url.searchParams.get('device');
        const userParam = url.searchParams.get('user');
        const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 300);

        // Liệt kê cột tường minh thay vì e.*: "u.id as user_id" từng đè lên
        // e.user_id và trả về số, khiến ô tìm kiếm ở Dashboard ném TypeError.
        // COALESCE + CAST giữ user_id luôn là chuỗi, ưu tiên id do app gửi lên.
        let query = `
          SELECT 
            e.id,
            e.job_id,
            e.app_identifier,
            e.event_name,
            e.event_type,
            e.screen_name,
            e.parameters,
            e.device_info,
            e.created_at,
            COALESCE(j1.name, j2.name) as job_name,
            COALESCE(j1.type, j2.type) as job_type,
            COALESCE(u1.id, u2.id) as owner_id,
            COALESCE(u1.name, u2.name) as user_name,
            COALESCE(e.user_id, CAST(COALESCE(u1.id, u2.id) AS TEXT)) as user_id
          FROM app_events e
          LEFT JOIN jobs j1 ON e.job_id = j1.id
          LEFT JOIN jobs j2 ON (e.job_id IS NULL AND e.app_identifier = j2.app_identifier)
          LEFT JOIN users u1 ON j1.user_id = u1.id
          LEFT JOIN users u2 ON j2.user_id = u2.id
          WHERE 1=1
        `;
        const params = [];

        if (jobId) {
          query += ' AND e.job_id = ?';
          params.push(Number(jobId));
        }
        if (userId) {
          query += ' AND (u1.id = ? OR u2.id = ?)';
          params.push(Number(userId), Number(userId));
        }
        if (appIdentifier) {
          query += ' AND e.app_identifier = ?';
          params.push(appIdentifier);
        }
        if (eventName) {
          query += ' AND e.event_name = ?';
          params.push(eventName);
        }
        if (eventType) {
          query += ' AND e.event_type = ?';
          params.push(eventType);
        }
        if (deviceParam) {
          query += ' AND e.device_info LIKE ?';
          params.push(`%${deviceParam}%`);
        }
        if (userParam) {
          query += ' AND (e.user_id LIKE ? OR COALESCE(u1.name, u2.name) LIKE ?)';
          params.push(`%${userParam}%`, `%${userParam}%`);
        }

        query += ' ORDER BY e.created_at DESC LIMIT ?';
        params.push(limit);

        const stmt = env.DB.prepare(query);
        const { results } = await stmt.bind(...params).all();

        setCached(cacheKey, results, 5);
        return jsonResponse(results, 200, 'public, max-age=5, stale-while-revalidate=10');
      } catch (e) {
        try {
          const { results } = await env.DB.prepare(
            'SELECT * FROM app_events ORDER BY created_at DESC LIMIT 50'
          ).all();
          return jsonResponse(results, 200, 'public, max-age=5');
        } catch (err) {
          return jsonResponse({ error: e.message }, 500);
        }
      }
    }

    if (path === '/events' && request.method === 'POST') {
      try {
        const body = await request.json();
        const {
          event_name,
          event_type,
          screen_name,
          user_id,
          parameters,
          device_info,
          app_id,
          app_identifier,
          job_id,
        } = body;

        if (!event_name) {
          return jsonResponse({ error: 'event_name is required' }, 400);
        }

        const effectiveAppIdentifier = (app_identifier || app_id || '').trim();
        let effectiveJobId = job_id ? Number(job_id) : null;

        if (!effectiveJobId && effectiveAppIdentifier) {
          try {
            const matchedJob = await env.DB.prepare(
              'SELECT id FROM jobs WHERE app_identifier = ?'
            ).bind(effectiveAppIdentifier).first();
            if (matchedJob) {
              effectiveJobId = matchedJob.id;
            }
          } catch (_) {}
        }

        const res = await env.DB.prepare(`
          INSERT INTO app_events (
            job_id, app_identifier, event_name, event_type,
            screen_name, user_id, parameters, device_info
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          effectiveJobId,
          effectiveAppIdentifier || null,
          String(event_name).trim(),
          event_type || 'event',
          screen_name || null,
          user_id || null,
          formatPayload(parameters),
          formatPayload(device_info)
        ).run();

        clearCacheByPrefix('events:');
        clearCacheByPrefix('telemetry_filters');

        return jsonResponse({ success: true, id: res.meta?.last_row_id, job_id: effectiveJobId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // Serve the Vite build for the website and let Cloudflare's SPA fallback
    // return index.html for client-side routes such as /admin/dashboard or /admin/users.
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    try {
      // Xóa log và telemetry cũ hơn 2 ngày
      await env.DB.prepare(
        "DELETE FROM api_logs WHERE created_at < datetime('now', '-2 days')"
      ).run();
      await env.DB.prepare(
        "DELETE FROM app_crashes WHERE created_at < datetime('now', '-2 days')"
      ).run();
      await env.DB.prepare(
        "DELETE FROM app_events WHERE created_at < datetime('now', '-2 days')"
      ).run();
      console.log('Successfully deleted old logs, crashes, and analytics events');
    } catch (e) {
      console.error('Failed to delete old telemetry:', e.message);
    }
  },
};
