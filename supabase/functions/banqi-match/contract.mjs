const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const coordinate = value => typeof value === 'string' && /^[a-h][1-4]$/.test(value);
const exact = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(k => Object.hasOwn(value, k));
const uuid = value => typeof value === 'string' && UUID.test(value);

// op avoids overloading the engine action field. All identity/state/result fields
// are forbidden. Request IDs identify operations, never credentials.
export function parseCommand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.op === 'getMine' && exact(body, ['op'])) return { op: 'getMine' };
  if (body.op === 'snapshot' && exact(body, ['op', 'roomId']) && uuid(body.roomId)) {
    return { op: 'snapshot', roomId: body.roomId };
  }
  if (body.op === 'start' && exact(body, ['op', 'roomId', 'requestId']) && uuid(body.roomId) && uuid(body.requestId)) {
    return { op: 'start', roomId: body.roomId, requestId: body.requestId };
  }
  if (body.op !== 'act' || !exact(body, ['op', 'roomId', 'requestId', 'baseVersion', 'action']) ||
    !uuid(body.roomId) || !uuid(body.requestId) || !Number.isSafeInteger(body.baseVersion) || body.baseVersion < 0) return null;
  const a = body.action;
  let action;
  if (exact(a, ['type', 'at']) && a.type === 'flip' && coordinate(a.at)) action = { type: 'flip', at: a.at };
  else if (exact(a, ['type', 'from', 'to']) && a.type === 'move' && coordinate(a.from) && coordinate(a.to)) {
    action = { type: 'move', from: a.from, to: a.to };
  } else return null;
  return { op: 'act', roomId: body.roomId, requestId: body.requestId, baseVersion: body.baseVersion, action };
}

export function commandFingerprint(command) {
  const canonical = parseCommand(command);
  if (!canonical) throw Error('INVALID_INPUT');
  return JSON.stringify(canonical);
}
