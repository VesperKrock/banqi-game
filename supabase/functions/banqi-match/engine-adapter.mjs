// Server-internal module. This is NOT an HTTP endpoint or a persistence layer.
// Import the single canonical engine; never maintain a second rules implementation.
import { createGame, getPublicState, applyAction } from '../../../js/engine.mjs';

const piece = p => p === null ? null : ({ color: p.color, type: p.type });
const actionView = a => a.type === 'flip' ? { type: 'flip', at: a.at } : { type: 'move', from: a.from, to: a.to };
const pair = p => ({ attackerId: p.attackerId, targetId: p.targetId, attackerAt: p.attackerAt, targetAt: p.targetAt });

export function createServerGame() {
  return createGame({ random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 });
}

export function publicSnapshot(state) {
  const s = getPublicState(state);
  return {
    board: s.board.map(p => p === null ? null : p.faceDown ? { occupied: true, faceDown: true } :
      { occupied: true, faceDown: false, color: p.color, type: p.type, visibleId: p.visibleId }),
    turn: s.turn, playerColors: [...s.playerColors], captured: s.captured.map(piece),
    status: s.status, result: s.result === null ? null :
      { outcome: s.result.outcome, winner: s.result.winner, reason: s.result.reason },
    noProgressPly: s.noProgressPly, repetitionCount: s.repetitionCount, drawRepetitionCount: s.drawRepetitionCount,
    chase: {
      faults: [...s.chase.faults],
      runs: s.chase.runs.map(runs => runs.map(p => ({ ...pair(p), count: p.count }))),
      drawDeferred: s.chase.drawDeferred.map(d => ({ reason: d.reason, player: d.player, pairs: d.pairs.map(pair) })),
      warnings: s.chase.warnings.map(w => ({ action: actionView(w.action), player: w.player,
        pairs: w.pairs.map(pair), nextFault: w.nextFault, losesGame: w.losesGame })),
    },
  };
}

export function publicEvent(event) {
  if (event === null) return null;
  if (event.type === 'flip') return { type: 'flip', player: event.player, at: event.at, piece: piece(event.piece) };
  if (event.type === 'move') return { type: 'move', player: event.player, from: event.from, to: event.to,
    piece: piece(event.piece), captured: piece(event.captured) };
  throw Error('INVALID_ENGINE_EVENT');
}

// Only a trusted server repository may consume candidateState. The public reply
// must not be returned until an atomic membership/version/receipt commit succeeds.
export function prepareAction(state, player, action) {
  const result = applyAction(state, player, action);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, candidateState: result.state,
    snapshot: publicSnapshot(result.state), event: publicEvent(result.event) };
}
