const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let tablesInitialized = false;
async function ensureSchema(db) {
  if (tablesInitialized) return;
  try {
    // 1. Tạo bảng users nếu chưa có
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 2. Tạo bảng jobs nếu chưa có
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

    // 3. Tạo bảng api_logs cơ bản nếu chưa có
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS api_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER,
        error_message TEXT,
        request_payload TEXT,
        response_payload TEXT,
        duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // 5. Tạo bảng app_crashes nếu chưa có
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

    // 6. Tạo bảng app_events nếu chưa có
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

    tablesInitialized = true;
  } catch (err) {
    console.error('ensureSchema error:', err);
  }
}

const jsonResponse = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    // Tự động đảm bảo schema DB sẵn sàng cho các API
    if (
      path.startsWith('/logs') || 
      path.startsWith('/users') || 
      path.startsWith('/jobs') ||
      path.startsWith('/crashes') ||
      path.startsWith('/events')
    ) {
      await ensureSchema(env.DB);
    }

    // ==========================================
    // 1. API USERS: /users
    // ==========================================
    if (path === '/users' && request.method === 'GET') {
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
        return jsonResponse(results);
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
        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 2. API JOBS: /jobs
    // ==========================================
    if (path === '/jobs' && request.method === 'GET') {
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
        return jsonResponse(results);
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
        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 3. API LOGS: /logs
    // ==========================================
    if (path === '/logs' && request.method === 'GET') {
      try {
        const jobId = url.searchParams.get('job_id');
        const userId = url.searchParams.get('user_id');
        const appIdentifier = url.searchParams.get('app_identifier') || url.searchParams.get('app_id');
        const limit = Math.min(Number(url.searchParams.get('limit')) || 150, 500);

        let query = `
          SELECT 
            l.*,
            j.name as job_name,
            j.type as job_type,
            u.id as user_id,
            u.name as user_name
          FROM api_logs l
          LEFT JOIN jobs j ON (l.job_id IS NOT NULL AND l.job_id = j.id) 
                           OR (l.app_identifier IS NOT NULL AND l.app_identifier = j.app_identifier)
          LEFT JOIN users u ON j.user_id = u.id
          WHERE 1=1
        `;
        const params = [];

        if (jobId) {
          query += ' AND (l.job_id = ? OR j.id = ?)';
          params.push(Number(jobId), Number(jobId));
        }
        if (userId) {
          query += ' AND (u.id = ?)';
          params.push(Number(userId));
        }
        if (appIdentifier) {
          query += ' AND (l.app_identifier = ? OR j.app_identifier = ?)';
          params.push(appIdentifier, appIdentifier);
        }

        query += ' ORDER BY l.created_at DESC LIMIT ?';
        params.push(limit);

        const stmt = env.DB.prepare(query);
        const { results } = await stmt.bind(...params).all();
        return jsonResponse(results);
      } catch (e) {
        // Fallback đơn giản nếu query phức tạp bị lỗi do DB chưa kịp sync
        try {
          const { results } = await env.DB.prepare(
            'SELECT * FROM api_logs ORDER BY created_at DESC LIMIT 100'
          ).all();
          return jsonResponse(results);
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
        } = body;

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
              error_message, request_payload, response_payload, duration_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            effectiveJobId,
            effectiveAppIdentifier || null,
            endpoint || '',
            method || 'GET',
            status_code || null,
            error_message || null,
            formatPayload(request_payload),
            formatPayload(response_payload),
            duration_ms || 0
          ).run();
        } catch (insertErr) {
          // Fallback nếu cột job_id / app_identifier chưa có
          await env.DB.prepare(`
            INSERT INTO api_logs (
              endpoint, method, status_code, error_message, request_payload, response_payload, duration_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            endpoint || '',
            method || 'GET',
            status_code || null,
            error_message || null,
            formatPayload(request_payload),
            formatPayload(response_payload),
            duration_ms || 0
          ).run();
        }

        return jsonResponse({ success: true, job_id: effectiveJobId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 4. API CRASHES: /crashes (Crashlytics)
    // ==========================================
    if (path === '/crashes' && request.method === 'GET') {
      try {
        const jobId = url.searchParams.get('job_id');
        const userId = url.searchParams.get('user_id');
        const appIdentifier = url.searchParams.get('app_identifier') || url.searchParams.get('app_id');
        const isFatal = url.searchParams.get('is_fatal');
        const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);

        let query = `
          SELECT 
            c.*,
            j.name as job_name,
            j.type as job_type,
            u.id as user_id,
            u.name as user_name
          FROM app_crashes c
          LEFT JOIN jobs j ON (c.job_id IS NOT NULL AND c.job_id = j.id) 
                           OR (c.app_identifier IS NOT NULL AND c.app_identifier = j.app_identifier)
          LEFT JOIN users u ON j.user_id = u.id
          WHERE 1=1
        `;
        const params = [];

        if (jobId) {
          query += ' AND (c.job_id = ? OR j.id = ?)';
          params.push(Number(jobId), Number(jobId));
        }
        if (userId) {
          query += ' AND (u.id = ?)';
          params.push(Number(userId));
        }
        if (appIdentifier) {
          query += ' AND (c.app_identifier = ? OR j.app_identifier = ?)';
          params.push(appIdentifier, appIdentifier);
        }
        if (isFatal !== null && isFatal !== undefined && isFatal !== '') {
          query += ' AND c.is_fatal = ?';
          params.push(Number(isFatal));
        }

        query += ' ORDER BY c.created_at DESC LIMIT ?';
        params.push(limit);

        const stmt = env.DB.prepare(query);
        const { results } = await stmt.bind(...params).all();
        return jsonResponse(results);
      } catch (e) {
        try {
          const { results } = await env.DB.prepare(
            'SELECT * FROM app_crashes ORDER BY created_at DESC LIMIT 100'
          ).all();
          return jsonResponse(results);
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

        return jsonResponse({ success: true, id: res.meta?.last_row_id, job_id: effectiveJobId });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // ==========================================
    // 5. API EVENTS (ANALYTICS): /events
    // ==========================================
    if (path === '/events' && request.method === 'GET') {
      try {
        const jobId = url.searchParams.get('job_id');
        const userId = url.searchParams.get('user_id');
        const appIdentifier = url.searchParams.get('app_identifier') || url.searchParams.get('app_id');
        const eventName = url.searchParams.get('event_name');
        const eventType = url.searchParams.get('event_type');
        const limit = Math.min(Number(url.searchParams.get('limit')) || 150, 500);

        let query = `
          SELECT 
            e.*,
            j.name as job_name,
            j.type as job_type,
            u.id as user_id,
            u.name as user_name
          FROM app_events e
          LEFT JOIN jobs j ON (e.job_id IS NOT NULL AND e.job_id = j.id) 
                           OR (e.app_identifier IS NOT NULL AND e.app_identifier = j.app_identifier)
          LEFT JOIN users u ON j.user_id = u.id
          WHERE 1=1
        `;
        const params = [];

        if (jobId) {
          query += ' AND (e.job_id = ? OR j.id = ?)';
          params.push(Number(jobId), Number(jobId));
        }
        if (userId) {
          query += ' AND (u.id = ?)';
          params.push(Number(userId));
        }
        if (appIdentifier) {
          query += ' AND (e.app_identifier = ? OR j.app_identifier = ?)';
          params.push(appIdentifier, appIdentifier);
        }
        if (eventName) {
          query += ' AND e.event_name = ?';
          params.push(eventName);
        }
        if (eventType) {
          query += ' AND e.event_type = ?';
          params.push(eventType);
        }

        query += ' ORDER BY e.created_at DESC LIMIT ?';
        params.push(limit);

        const stmt = env.DB.prepare(query);
        const { results } = await stmt.bind(...params).all();
        return jsonResponse(results);
      } catch (e) {
        try {
          const { results } = await env.DB.prepare(
            'SELECT * FROM app_events ORDER BY created_at DESC LIMIT 100'
          ).all();
          return jsonResponse(results);
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
