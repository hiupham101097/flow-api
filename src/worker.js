const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    const path = url.pathname.replace(/\/+$/, '').replace(/^\/+/, '/');

    if (path === '/logs' && request.method === 'GET') {
      try {
        const { results } = await env.DB.prepare(
          'SELECT * FROM api_logs ORDER BY created_at DESC LIMIT 100'
        ).all();
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (path === '/logs' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { endpoint, method, status_code, error_message, request_payload, response_payload, duration_ms } = body;

        const formatPayload = (val) => {
          if (val === undefined || val === null) return null;
          if (typeof val === 'string') return val;
          try {
            return JSON.stringify(val);
          } catch {
            return String(val);
          }
        };

        await env.DB.prepare(
          'INSERT INTO api_logs (endpoint, method, status_code, error_message, request_payload, response_payload, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          endpoint || '',
          method || 'GET',
          status_code || null,
          error_message || null,
          formatPayload(request_payload),
          formatPayload(response_payload),
          duration_ms || 0
        ).run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Serve the Vite build for the website and let Cloudflare's SPA fallback
    // return index.html for client-side routes such as /admin/dashboard.
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    try {
      // Delete logs older than 2 days
      await env.DB.prepare(
        "DELETE FROM api_logs WHERE created_at < datetime('now', '-2 days')"
      ).run();
      console.log('Successfully deleted old logs');
    } catch (e) {
      console.error('Failed to delete old logs:', e.message);
    }
  },
};
