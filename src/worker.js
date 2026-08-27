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

    if (url.pathname === '/logs' && request.method === 'GET') {
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

    if (url.pathname === '/logs' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { endpoint, method, status_code, error_message, request_payload, response_payload, duration_ms } = body;

        await env.DB.prepare(
          'INSERT INTO api_logs (endpoint, method, status_code, error_message, request_payload, response_payload, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          endpoint || '',
          method || 'GET',
          status_code || null,
          error_message || null,
          request_payload ? JSON.stringify(request_payload) : null,
          response_payload ? JSON.stringify(response_payload) : null,
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
};
