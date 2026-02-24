const KV_KEY = 'live-status';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Facebook webhook verification challenge
    if (request.method === 'GET' && url.searchParams.get('hub.mode') === 'subscribe') {
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (token === env.VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response('Forbidden', { status: 403 });
    }

    // GET — return current live status
    if (request.method === 'GET') {
      const data = await env.LIVE_KV.get(KV_KEY, 'json');
      const body = data || { is_live: false, video_id: null, updated_at: null };
      return Response.json(body, { headers: corsHeaders() });
    }

    // POST — Facebook webhook event
    if (request.method === 'POST') {
      // Validate signature
      const signature = request.headers.get('X-Hub-Signature-256');
      const rawBody = await request.text();

      if (!await verifySignature(rawBody, signature, env.APP_SECRET)) {
        return new Response('Invalid signature', { status: 403 });
      }

      const payload = JSON.parse(rawBody);
      const status = parseLiveStatus(payload);

      if (status !== null) {
        await env.LIVE_KV.put(KV_KEY, JSON.stringify(status));
      }

      return new Response('OK', { status: 200 });
    }

    return new Response('Method not allowed', { status: 405 });
  }
};

function parseLiveStatus(payload) {
  try {
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === 'live_videos') {
          const val = change.value || {};
          const isLive = val.status === 'LIVE_NOW';
          return {
            is_live: isLive,
            video_id: val.id || null,
            updated_at: new Date().toISOString()
          };
        }
      }
    }
  } catch { /* malformed payload */ }
  return null;
}

async function verifySignature(body, signature, secret) {
  if (!signature || !secret) return false;
  const expected = signature.replace('sha256=', '');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === expected;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache'
  };
}
