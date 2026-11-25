import { parseCommand } from './contract.mjs';
import { createServerGame, publicSnapshot, publicEvent, prepareAction } from './engine-adapter.mjs';

const fail = error => ({ ok: false, error });
// Only called with a JWT-verified UID and a server-only client. Private read
// results never leave this function; replies come from projection/receipt data.
export async function executeMatch(admin, uid, input) {
  const command = parseCommand(input);
  if (!command) return fail('INVALID_INPUT');
  const read = await admin.rpc('banqi_match_read', { p_uid: uid, p_command: command });
  if (read.error) return fail('UNAVAILABLE');
  const context = read.data;
  if (context?.ok !== true) return context?.error ? { ok: false, error: context.error,
    ...(context.retryAfter ? { retryAfter: context.retryAfter } : {}) } : fail('UNAVAILABLE');
  if (context.replay) return context.replay;
  if (Object.hasOwn(context, 'match') && context.match === null) return { ok: true, match: null };
  if (command.op === 'getMine' || command.op === 'snapshot') return { ok: true, match: {
    roomId: context.roomId, player: context.player, version: context.version,
    snapshot: publicSnapshot(context.state), event: publicEvent(context.event),
  } };
  let state, snapshot, event = null;
  if (command.op === 'start') {
    state = context.state ?? createServerGame(); snapshot = publicSnapshot(state);
  } else {
    if (context.version !== command.baseVersion) return fail('STALE_VERSION');
    const next = prepareAction(context.state, context.player, command.action);
    if (!next.ok) return fail(next.error);
    state = next.candidateState; snapshot = next.snapshot; event = next.event;
  }
  const committed = await admin.rpc('banqi_match_commit', { p_uid: uid, p_command: command,
    p_revision: context.revision, p_state: state, p_snapshot: snapshot, p_event: event });
  return committed.error ? fail('UNAVAILABLE') : committed.data;
}
