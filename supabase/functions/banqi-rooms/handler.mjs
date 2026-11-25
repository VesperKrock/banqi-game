const ORIGINS = new Set(['https://vesperkrock.github.io', 'http://localhost:5500',
  'http://127.0.0.1:5500', 'http://localhost:8080', 'http://127.0.0.1:8080']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERROR_STATUS = { INVALID_INPUT: 400, RATE_LIMIT: 429, ROOM_UNAVAILABLE: 404,
  ROOM_FULL: 409, ALREADY_IN_ROOM: 409, FORBIDDEN: 403, STALE_ROOM: 409, CODE_UNAVAILABLE: 503 };
const error = (status, code, retryAfter) => Response.json({ ok: false, error: code,
  ...(retryAfter ? { retryAfter } : {}) }, { status });

// Read a bounded stream, not unbounded request.json() or trusted Content-Length.
async function input(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return null;
  const reader = request.body?.getReader(); if (!reader) return null;
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 1024) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const fields = { getMine: ['action'], create: ['action', 'requestId'], join: ['action', 'requestId', 'code'],
      leave: ['action', 'requestId', 'roomId', 'revision'], cancel: ['action', 'requestId', 'roomId', 'revision'] };
    const allowed = Object.hasOwn(fields, body.action) ? fields[body.action] : null;
    if (!allowed || Object.keys(body).length !== allowed.length || Object.keys(body).some(k => !allowed.includes(k))) return null;
    if (body.action !== 'getMine' && !UUID.test(body.requestId ?? '')) return null;
    if (body.action === 'join' && (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code))) return null;
    if (['leave', 'cancel'].includes(body.action) && (!UUID.test(body.roomId ?? '') || !Number.isSafeInteger(body.revision) || body.revision < 0)) return null;
    return body;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export function publicRoom(room) {
  if (room === null) return null;
  if (!room || !UUID.test(room.roomId ?? '') || !/^\d{6}$/.test(room.code ?? '') ||
    !['host', 'guest'].includes(room.role) || !Array.isArray(room.seats) || room.seats.length !== 2 ||
    room.seats[0] !== true || typeof room.seats[1] !== 'boolean' ||
    room.lobbyStatus !== (room.seats[1] ? 'full' : 'waiting') ||
    (room.role === 'guest' && !room.seats[1]) || !Number.isSafeInteger(room.revision) || room.revision < 0 ||
    typeof room.expiresAt !== 'string' || !Number.isFinite(Date.parse(room.expiresAt))) throw Error('Invalid projection');
  return { roomId: room.roomId, code: room.code, role: room.role, seats: [...room.seats],
    lobbyStatus: room.lobbyStatus, expiresAt: room.expiresAt, revision: room.revision };
}

export function createRoomsHandler(withSupabase, { url, env } = {}) {
  if (!url) throw Error('Supabase URL is required');
  const authenticated = withSupabase({ auth: 'user', audience: 'authenticated', issuer: `${url.replace(/\/$/, '')}/auth/v1`,
    cors: 'disabled', errors: { detailed: false }, ...(env ? { env } : {}),
  }, async (request, ctx) => {
    if (ctx.authMode !== 'user' || ctx.userClaims?.role !== 'authenticated' || !UUID.test(ctx.userClaims?.id ?? '')) return error(401, 'UNAUTHENTICATED');
    const body = await input(request); if (!body) return error(400, 'INVALID_INPUT');
    // The server SDK holds admin credentials only on the Edge. UID comes from the verified JWT.
    const result = await ctx.supabaseAdmin.rpc('banqi_room_action', {
      p_uid: ctx.userClaims.id, p_action: body.action, p_request_id: body.requestId ?? null,
      p_code: body.code ?? null, p_room_id: body.roomId ?? null, p_revision: body.revision ?? null,
    });
    if (result.error) return error(503, 'UNAVAILABLE');
    if (result.data?.ok !== true) {
      const code = Object.hasOwn(ERROR_STATUS, result.data?.error ?? '') ? result.data.error : 'UNAVAILABLE';
      const retry = code === 'RATE_LIMIT' ? Math.min(3600, Math.max(1, Number(result.data.retryAfter) || 60)) : undefined;
      return error(ERROR_STATUS[code] ?? 503, code, retry);
    }
    return Response.json({ ok: true, room: publicRoom(result.data.room) });
  });
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (origin && !ORIGINS.has(origin)) return new Response(null, { status: 403, headers });
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    let response;
    if (request.method === 'OPTIONS') {
      const requested = (request.headers.get('access-control-request-headers') ?? '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
      if (request.headers.get('access-control-request-method') !== 'POST' || requested.some(x => !['authorization', 'apikey', 'content-type', 'x-client-info'].includes(x))) {
        response = error(403, 'CORS_DENIED');
      } else {
        headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
        response = new Response(null, { status: 204 });
      }
    } else if (request.method !== 'POST') response = error(405, 'METHOD_NOT_ALLOWED');
    else if (new URL(request.url).search) response = error(400, 'INVALID_INPUT');
    else {
      try { response = await authenticated(request); }
      catch { response = error(503, 'UNAVAILABLE'); }
    }
    const result = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) result.headers.set(name, value);
    return result;
  };
}
