import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SDK_URL } from './online-config.mjs';

// Importing this module performs no network request. Offline/Solo do not import it.
export function createOnlineAuth({ loadSdk = () => import(SUPABASE_SDK_URL), storage } = {}) {
  let clientPromise;
  let identityPromise;

  function client() {
    if (!clientPromise) {
      clientPromise = Promise.resolve().then(loadSdk).then(({ createClient }) => createClient(
        SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
            storageKey: 'banqi-online-auth-v1', ...(storage ? { storage } : {}) },
        },
      )).catch(() => {
        clientPromise = undefined;
        throw new Error('ONLINE_SDK_UNAVAILABLE');
      });
    }
    return clientPromise;
  }

  async function identity() {
    const supabase = await client();
    const existing = await supabase.auth.getSession();
    if (existing.error) throw new Error('ONLINE_SESSION_UNAVAILABLE');
    if (!existing.data.session) {
      const created = await supabase.auth.signInAnonymously();
      if (created.error || !created.data.session) throw new Error('ONLINE_ANONYMOUS_SIGN_IN_FAILED');
    }
    // Validate against Auth; never trust a local-storage user ID as authority.
    const verified = await supabase.auth.getUser();
    if (verified.error || !verified.data.user?.id) throw new Error('ONLINE_IDENTITY_INVALID');
    return Object.freeze({ id: verified.data.user.id, isAnonymous: verified.data.user.is_anonymous === true });
  }

  function ensureIdentity() {
    if (!identityPromise) identityPromise = identity().finally(() => { identityPromise = undefined; });
    return identityPromise;
  }

  async function preflight() {
    const caller = await ensureIdentity();
    const supabase = await client();
    // The SDK refreshes the session and sends its JWT with the publishable apikey.
    const result = await supabase.functions.invoke('banqi-preflight', { method: 'GET' });
    if (result.error) throw new Error('ONLINE_PREFLIGHT_UNAVAILABLE');
    const body = result.data;
    if (body?.checkpoint !== 'R5-00' || body.user?.id !== caller.id ||
        typeof body.user.isAnonymous !== 'boolean' || body.capabilities?.preflight !== true ||
        body.capabilities?.rooms !== false || body.capabilities?.gameplay !== false) {
      throw new Error('ONLINE_PREFLIGHT_INVALID');
    }
    // Only return the agreed public projection, even if a future server adds fields.
    return { checkpoint: 'R5-00', user: caller,
      capabilities: { preflight: true, rooms: false, gameplay: false } };
  }

  async function invokeAction(endpoint, body, { signal } = {}) {
    const supabase = await client();
    const session = await supabase.auth.getSession();
    if (session.error || !session.data.session) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' });
    const result = await supabase.functions.invoke(endpoint, { method: 'POST', body, signal });
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (result.error) {
      let detail;
      try { detail = await result.error.context?.json(); } catch { /* No raw SDK/HTTP errors escape. */ }
      const known = ['INVALID_INPUT', 'RATE_LIMIT', 'ROOM_UNAVAILABLE', 'ROOM_FULL', 'ALREADY_IN_ROOM',
        'FORBIDDEN', 'STALE_ROOM', 'CODE_UNAVAILABLE', 'NOT_FOUND', 'NOT_READY', 'REQUEST_CONFLICT',
        'STALE_VERSION', 'NOT_YOUR_TURN', 'GAME_OVER', 'ILLEGAL_ACTION', 'ACTIVE_MATCH_EXISTS', 'RECEIPT_LIMIT'];
      const code = result.error.context?.status === 401 ? 'AUTH_REQUIRED' :
        (known.includes(detail?.error) ? detail.error : 'UNAVAILABLE');
      throw Object.assign(new Error(code), { code, retryAfter: code === 'RATE_LIMIT' ?
        Math.min(3600, Math.max(1, Number(detail.retryAfter) || 60)) : 0 });
    }
    return result.data;
  }

  const roomAction = (body, options) => invokeAction('banqi-rooms', body, options);
  const matchAction = (body, options) => invokeAction('banqi-match', body, options);
  return Object.freeze({ ensureIdentity, preflight, roomAction, matchAction });
}

export const onlineAuth = createOnlineAuth();
