// The only boundary into the bot. Never spread/serialize an unsanitized piece.
const face = p => ({ color: p.color, type: p.type });
const pair = p => ({ attackerId: p.attackerId, targetId: p.targetId, attackerAt: p.attackerAt, targetAt: p.targetAt });

export function copyAction(a) {
  if (a?.type === "flip") return { type: "flip", at: a.at };
  if (a?.type === "move") return { type: "move", from: a.from, to: a.to };
  throw new Error("Invalid action");
}

export function actionKey(a) {
  return a?.type === "flip" ? `f:${a.at}` : a?.type === "move" ? `m:${a.from}:${a.to}` : "";
}

export function matchLegal(action, legal) {
  if (!action || Object.keys(action).length !== (action.type === "flip" ? 2 : 3)) return null;
  return legal.find(a => actionKey(a) === actionKey(action)) ?? null;
}

export function copyPublic(snapshot) {
  return {
    board: snapshot.board.map(p => p === null ? null : p.faceDown
      ? { occupied: true, faceDown: true }
      : { occupied: true, faceDown: false, ...face(p), visibleId: p.visibleId }),
    turn: snapshot.turn, playerColors: [...snapshot.playerColors],
    captured: snapshot.captured.map(face), status: snapshot.status,
    result: snapshot.result ? { outcome: snapshot.result.outcome, winner: snapshot.result.winner, reason: snapshot.result.reason } : null,
    noProgressPly: snapshot.noProgressPly, repetitionCount: snapshot.repetitionCount,
    drawRepetitionCount: snapshot.drawRepetitionCount,
    chase: {
      faults: [...snapshot.chase.faults],
      runs: snapshot.chase.runs.map(runs => runs.map(r => ({ ...pair(r), count: r.count }))),
      drawDeferred: snapshot.chase.drawDeferred.map(d => ({ reason: d.reason, player: d.player, pairs: d.pairs.map(pair) })),
      warnings: snapshot.chase.warnings.map(w => ({ action: copyAction(w.action), player: w.player,
        pairs: w.pairs.map(pair), nextFault: w.nextFault, losesGame: w.losesGame })),
    },
  };
}

export function copyEvent(event) {
  return { ...copyAction(event), player: event.player, piece: face(event.piece),
    ...(event.type === "move" ? { captured: event.captured === null ? null : face(event.captured) } : {}) };
}

export function createBotInput(snapshot, legal, history, seed) {
  // JSON copy also removes all prototypes/references before postMessage.
  return JSON.parse(JSON.stringify({ snapshot: copyPublic(snapshot), legal: legal.map(copyAction), seed: seed >>> 0,
    history: { initial: copyPublic(history?.initial ?? snapshot), events: (history?.events ?? []).map(copyEvent) } }));
}

export function observationKey(snapshot) {
  return JSON.stringify([snapshot.board.map(p => p === null ? null : p.faceDown ? "?" : [p.color, p.type]),
    snapshot.turn, snapshot.playerColors]);
}
