const UPSTREAM = 'https://github.com/Angel-pig-1/eu-china-policy-db/releases/download/';
const ALLOWED_ORIGINS = new Set([
  'https://eu-policy.cn',
  'https://angel-pig-1.github.io',
  'http://127.0.0.1:8765',
]);

function corsOrigin(request) {
  const origin = request.headers.get('Origin');
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function corsHeaders(request) {
  const origin = corsOrigin(request);
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag, Accept-Ranges',
    'Vary': 'Origin',
  } : {};
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 3 || parts[0] !== 'pdf-proxy') {
      return new Response('Not found', { status: 404 });
    }
    const tag = parts[1];
    const name = parts[2];
    if (!/^(?:era|longterm)-[a-z0-9-]+$/.test(tag) ||
        !/^[A-Za-z0-9._+-]+\.pdf$/i.test(name) || name.includes('..')) {
      return new Response('Invalid PDF asset', { status: 400 });
    }

    const upstream = UPSTREAM + encodeURIComponent(tag) + '/' + encodeURIComponent(name);
    const forward = new Headers();
    for (const key of ['Range', 'If-None-Match', 'If-Modified-Since']) {
      const value = request.headers.get(key);
      if (value) forward.set(key, value);
    }
    const response = await fetch(upstream, {
      method: request.method,
      headers: forward,
      redirect: 'follow',
    });
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    headers.set('X-Content-Type-Options', 'nosniff');
    for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value);
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
