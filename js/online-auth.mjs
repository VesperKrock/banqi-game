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

  return Object.freeze({ ensureIdentity, preflight });
}

export const onlineAuth = createOnlineAuth();
