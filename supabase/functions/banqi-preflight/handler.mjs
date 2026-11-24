const ORIGINS = new Set([
  'https://vesperkrock.github.io',
  'http://localhost:5500', 'http://127.0.0.1:5500',
  'http://localhost:8080', 'http://127.0.0.1:8080',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADERS = new Set(['authorization', 'apikey', 'content-type', 'x-client-info']);
const failure = (status, code) => Response.json({ error: code }, { status });

export function createPreflightHandler(withSupabase, { url, env } = {}) {
  if (!url) throw new Error('Supabase URL is required');
  const authenticated = withSupabase({ auth: 'user', audience: 'authenticated',
    issuer: `${url.replace(/\/$/, '')}/auth/v1`, cors: 'disabled', errors: { detailed: false },
    ...(env ? { env } : {}),
  }, async (_request, context) => {
    const id = context.userClaims?.id;
    if (context.authMode !== 'user' || context.userClaims?.role !== 'authenticated' ||
        !UUID.test(id ?? '')) return failure(401, 'UNAUTHENTICATED');
    return Response.json({ checkpoint: 'R5-00',
      user: { id, isAnonymous: context.jwtClaims?.is_anonymous === true },
      capabilities: { preflight: true, rooms: false, gameplay: false } });
  });

  return async (request) => {
    const origin = request.headers.get('origin');
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
    // No Origin is allowed for CLI callers; JWT auth remains mandatory.
    if (origin && !ORIGINS.has(origin)) return new Response(null, { status: 403, headers });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    let response;
    if (request.method === 'OPTIONS') {
      const method = request.headers.get('access-control-request-method');
      const requested = (request.headers.get('access-control-request-headers') ?? '')
        .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
      if (method !== 'GET' || requested.some((header) => !HEADERS.has(header))) {
        response = failure(403, 'CORS_DENIED');
      } else {
        headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
        headers['Access-Control-Allow-Headers'] = [...HEADERS].join(', ');
        response = new Response(null, { status: 204 });
      }
    } else if (request.method !== 'GET') {
      response = failure(405, 'METHOD_NOT_ALLOWED');
      headers.Allow = 'GET, OPTIONS';
    } else if (new URL(request.url).search) {
      response = failure(400, 'NO_PARAMETERS_ALLOWED');
    } else {
      try { response = await authenticated(request); }
      catch { response = failure(503, 'PREFLIGHT_UNAVAILABLE'); }
    }
    const result = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) result.headers.set(name, value);
    return result;
  };
}
