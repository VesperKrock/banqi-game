import { onlineAuth } from './online-auth.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFINITIVE = new Set(['INVALID_INPUT', 'ROOM_UNAVAILABLE', 'ROOM_FULL', 'ALREADY_IN_ROOM', 'FORBIDDEN', 'STALE_ROOM', 'CODE_UNAVAILABLE', 'RATE_LIMIT', 'AUTH_REQUIRED']);
const PENDING_KEY = 'banqi-lobby-pending-v1';

export function readRoom(value) {
  if (value === null) return null;
  if (!value || !UUID.test(value.roomId ?? '') || typeof value.code !== 'string' || !/^\d{6}$/.test(value.code) ||
    !['host', 'guest'].includes(value.role) || !Array.isArray(value.seats) || value.seats.length !== 2 ||
    value.seats[0] !== true || typeof value.seats[1] !== 'boolean' ||
    value.lobbyStatus !== (value.seats[1] ? 'full' : 'waiting') || (value.role === 'guest' && !value.seats[1]) ||
    !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isFinite(Date.parse(value.expiresAt))) throw Error('INVALID_RESPONSE');
  return { roomId: value.roomId, code: value.code, role: value.role, seats: [...value.seats],
    lobbyStatus: value.lobbyStatus, expiresAt: value.expiresAt, revision: value.revision };
}

// One in-flight request; lifecycle generations reject late responses, including Auth.
export function createLobbyController({ auth = onlineAuth, onChange = () => {}, storage,
  schedule = setTimeout, cancel = clearTimeout, random = Math.random, now = Date.now, timeoutMs = 8000 } = {}) {
  let active = false, visible = true, online = true, generation = 0, timer, aborter;
  let identity, pending, failures = 0, cooldown = 0;
  let state = { phase: 'closed', room: null, error: null, busy: false, pending: false, retryAfter: 0 };
  const emit = patch => { state = { ...state, ...patch, pending: !!pending }; onChange(structuredClone(state)); };
  const clearTimer = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const save = () => { try { if (pending) storage?.setItem(PENDING_KEY, JSON.stringify({ uid: identity.id, body: pending })); else storage?.removeItem(PENDING_KEY); } catch { /* Server idempotency still protects an in-memory retry. */ } };
  function restore() {
    try {
      const saved = JSON.parse(storage?.getItem(PENDING_KEY) ?? 'null');
      if (saved?.uid === identity.id && UUID.test(saved.body?.requestId ?? '') && ['create', 'join', 'leave', 'cancel'].includes(saved.body?.action)) pending = saved.body;
      else { pending = null; save(); }
    } catch { pending = null; save(); }
  }
  function halt() { clearTimer(); generation++; aborter?.abort(); aborter = undefined; }
  function next() {
    clearTimer();
    if (active && visible && online) timer = schedule(run, Math.max(cooldown - now(),
      failures ? Math.min(30000, 3000 * 2 ** Math.min(failures, 4)) + random() * 400 : 2800 + random() * 400));
  }
  async function run() {
    clearTimer();
    if (!active || !visible || !online || state.busy) return;
    if (now() < cooldown) { next(); return; }
    const current = ++generation;
    aborter = new AbortController(); const requestAbort = aborter, signal = requestAbort.signal;
    emit({ phase: identity ? 'working' : 'connecting', busy: true, error: null, retryAfter: 0 });
    let timeout;
    try {
      const result = await Promise.race([
        (async () => {
          if (!identity) {
            const found = await auth.ensureIdentity();
            if (current !== generation || signal.aborted) throw new DOMException('Aborted', 'AbortError');
            identity = found; restore();
          }
          return auth.roomAction(pending ?? { action: 'getMine' }, { signal });
        })(),
        new Promise((_, reject) => { timeout = schedule(() => { requestAbort.abort(); reject(Object.assign(Error('TIMEOUT'), { code: 'TIMEOUT' })); }, timeoutMs); }),
      ]);
      if (current !== generation) return;
      if (result?.ok !== true) throw Error('INVALID_RESPONSE');
      const room = readRoom(result.room);
      pending = null; save(); failures = 0; cooldown = 0;
      emit({ phase: 'ready', room, busy: false, error: null, retryAfter: 0 });
    } catch (error) {
      if (current !== generation) return;
      const code = error.code ?? 'UNAVAILABLE';
      if (DEFINITIVE.has(code)) { pending = null; save(); }
      if (code === 'AUTH_REQUIRED') identity = null;
      failures++;
      if (code === 'RATE_LIMIT') cooldown = now() + Math.max(1, error.retryAfter || 60) * 1000;
      emit({ phase: 'error', busy: false, error: code, retryAfter: Math.max(0, Math.ceil((cooldown - now()) / 1000)) });
    } finally {
      cancel(timeout);
      if (current === generation) { aborter = undefined; next(); }
    }
  }
  function start() { if (active) return; active = true; identity = null; emit({ busy: false }); return run(); }
  function stop() { active = false; halt(); emit({ phase: 'closed', busy: false }); }
  function setVisible(value) {
    visible = value; halt(); emit({ busy: false, phase: value ? state.phase : 'paused' });
    if (visible) return run();
  }
  function setOnline(value) {
    online = value; halt(); emit({ busy: false, ...(value ? {} : { phase: 'offline', error: 'OFFLINE' }) });
    if (online) return run();
  }
  function act(action, code) {
    if (!active || !visible || !online || state.busy || state.phase !== 'ready' || pending || now() < cooldown) return false;
    if (!['create', 'join', 'leave', 'cancel'].includes(action)) return false;
    if (action === 'join' && !/^\d{6}$/.test(code ?? '')) return false;
    const room = state.room;
    if (['leave', 'cancel'].includes(action) && (!room || room.role !== (action === 'cancel' ? 'host' : 'guest'))) return false;
    pending = { action, requestId: crypto.randomUUID(), ...(action === 'join' ? { code } : {}),
      ...(['leave', 'cancel'].includes(action) ? { roomId: room.roomId, revision: room.revision } : {}) };
    save(); run(); return true;
  }
  return { start, stop, setVisible, setOnline, act, retry: run, snapshot: () => structuredClone(state) };
}
