import { getLegalActions, getPublicState, applyAction } from "./engine.mjs";
import { actionKey, copyPublic, matchLegal, observationKey } from "./bot-protocol.mjs";

// Independent Banqi bot. Bee 3 inspired the safety-before-search ordering, not
// its chess rules/code: https://github.com/VesperKrock/ichess-turtle-system
const COUNTS = { general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 };
const VALUE = { general: 700, advisor: 600, elephant: 450, rook: 360, horse: 280, cannon: 500, pawn: 130 };
const WIN = 100000;
const at = s => (Number(s[1]) - 1) * 8 + "abcdefgh".indexOf(s[0]);
const now = () => performance.now();

export function seeded(seed) {
  let n = seed >>> 0;
  return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296);
}

export function remainingPieces(snapshot) {
  const bag = Object.fromEntries(["red", "black"].flatMap(color => Object.entries(COUNTS).map(([type, count]) => [`${color}:${type}`, count])));
  const subtract = p => {
    const key = `${p.color}:${p.type}`;
    if (!(key in bag) || --bag[key] < 0) throw new Error("Inconsistent public inventory");
  };
  for (const p of snapshot.board) if (p && !p.faceDown) subtract(p);
  snapshot.captured.forEach(subtract);
  const remaining = Object.entries(bag).filter(([,count]) => count > 0).map(([key,count]) => {
    const [color,type] = key.split(":"); return { color, type, count };
  });
  const total = remaining.reduce((n,p) => n + p.count, 0);
  if (total !== snapshot.board.filter(p => p?.faceDown).length) throw new Error("Public inventory does not conserve 32 pieces");
  return remaining.map(p => ({ ...p, probability: p.count / total }));
}

export function sampleHidden(snapshot, seed) {
  const pieces = remainingPieces(snapshot).flatMap(p => Array.from({ length: p.count }, () => ({ color: p.color, type: p.type })));
  const random = seeded(seed);
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return pieces;
}

// Synthetic state is built ONLY from observations. Replay delegates repetition,
// draw holds, chase runs, faults and outcomes to the unchanged engine. No real
// shuffle or private callback crosses this boundary. Samples are never used to
// predict a flip's identity: flip scoring integrates EVERY possible public face.
export function hypotheticalState(input) {
  const initial = input.history.initial;
  const knownFlips = new Map(input.history.events.filter(e => e.type === "flip").map(e => [at(e.at), e.piece]));
  const unknown = sampleHidden(initial, input.seed);
  for (const p of knownFlips.values()) {
    const index = unknown.findIndex(q => q.color === p.color && q.type === p.type);
    if (index < 0) throw new Error("Inconsistent public reveal history");
    unknown.splice(index, 1);
  }
  let state = {
    board: initial.board.map((p, i) => p === null ? null : p.faceDown
      ? { ...(knownFlips.get(i) ?? unknown.pop()), faceDown: true }
      : { color: p.color, type: p.type, faceDown: false }),
    captured: initial.captured.map(p => ({ color: p.color, type: p.type })),
    turn: initial.turn, playerColors: [...initial.playerColors], status: initial.status, result: initial.result,
    noProgressPly: initial.noProgressPly, positionCounts: { [observationKey(initial)]: initial.drawRepetitionCount || 1 },
    chaseFaults: [...initial.chase.faults],
  };
  // Normal sessions start with no history. Imported public fixtures can retain
  // visible IDs/runs and current holds, without inventing unobserved positions.
  state.visibleIds = initial.board.map(p => p && !p.faceDown ? p.visibleId : null);
  state.nextVisibleId = Math.max(0, ...state.visibleIds.map(id => Number(id?.slice(1)) || 0)) + 1;
  state.runs = initial.chase.runs.map(runs => runs.map(r => ({ attackerId: r.attackerId, targetId: r.targetId, count: r.count, startPly: 0 })));
  for (const hold of initial.chase.drawDeferred) {
    state[hold.reason === "no_progress_60" ? "quietDrawHold" : "repetitionChase"] = {
      player: hold.player, pairs: hold.pairs.map(p => ({ attackerId: p.attackerId, targetId: p.targetId })),
    };
  }
  for (const event of input.history.events) {
    const action = event.type === "flip" ? { type: "flip", at: event.at } : { type: "move", from: event.from, to: event.to };
    const next = applyAction(state, event.player, action);
    if (!next.ok) throw new Error("Public history replay failed");
    state = next.state;
  }
  if (observationKey(getPublicState(state)) !== observationKey(input.snapshot)) throw new Error("Public history out of date");
  return state;
}

// Board geometry/captures ALWAYS come from getLegalActions. This lightweight
// public move is for exchange estimates only; it never adjudicates a real game.
function publicMove(view, action, revealed) {
  const board = [...view.board], colors = [...view.playerColors], captured = [...view.captured];
  if (action.type === "flip") {
    board[at(action.at)] = { ...revealed, occupied: true, faceDown: false };
    if (colors[view.turn] === null) {
      colors[view.turn] = revealed.color; colors[1 - view.turn] = revealed.color === "red" ? "black" : "red";
    }
  } else {
    if (board[at(action.to)]) captured.push(board[at(action.to)]);
    board[at(action.to)] = board[at(action.from)]; board[at(action.from)] = null;
  }
  return { ...view, board, captured, playerColors: colors, turn: 1 - view.turn };
}

function value(piece, view) {
  if (!piece || piece.faceDown) return 0;
  // A pawn's exceptional ability to take the opposing general matters.
  return VALUE[piece.type] + (piece.type === "pawn" && view.board.some(p => p && !p.faceDown && p.color !== piece.color && p.type === "general") ? 80 : 0);
}

function material(view, player) {
  const color = view.playerColors[player];
  if (!color) return 0;
  // Count remaining material by public captures; unrevealed locations add no information.
  return view.captured.reduce((score,p) => score + (p.color === color ? -VALUE[p.type] : VALUE[p.type]), 0);
}

function captures(view) {
  return getLegalActions(view, view.turn).filter(a => a.type === "move" && view.board[at(a.to)] !== null);
}

function exchange(view, target, depth = 3) {
  if (!depth) return 0;
  let best = 0;
  for (const action of captures(view).filter(a => a.to === target)) {
    best = Math.max(best, value(view.board[at(target)], view) - exchange(publicMove(view, action), target, depth - 1));
  }
  return best;
}

function worstLoss(view) {
  let loss = 0;
  for (const a of captures(view)) {
    const gain = value(view.board[at(a.to)], view);
    const after = publicMove(view, a);
    if (knownWin(after, view.turn)) return WIN;
    loss = Math.max(loss, gain - exchange(after, a.to));
  }
  return loss;
}

function pressure(view, player) {
  const ours = [], theirs = [];
  view.board.forEach((p, i) => { if (p && !p.faceDown) (p.color === view.playerColors[player] ? ours : theirs).push(i); });
  let nearest = 12;
  for (const a of ours) for (const b of theirs) nearest = Math.min(nearest, Math.abs(a % 8 - b % 8) + Math.abs((a >> 3) - (b >> 3)));
  return theirs.length ? -nearest * 2 : 0;
}

function knownWin(view, player) {
  const enemy = view.playerColors[1 - player];
  return enemy !== null && (view.captured.filter(p => p.color === enemy).length === 16 || getLegalActions(view, view.turn).length === 0);
}

function assess(view, action, belief) {
  const warning = view.chase.warnings.find(w => actionKey(w.action) === actionKey(action));
  if (warning?.losesGame) return { score: -WIN, risk: WIN };
  const faces = action.type === "flip" ? belief : [{ probability: 1 }];
  let score = 0, risk = 0;
  for (const p of faces) {
    const after = publicMove(view, action, p), loss = worstLoss(after);
    const advantage = material(after, view.turn);
    const current = knownWin(after, view.turn) ? WIN : advantage - loss * 1.15 + pressure(after, view.turn);
    score += p.probability * current; risk += p.probability * loss;
  }
  if (warning) score -= 2200;
  return { score, risk };
}

export function rankSafety(snapshot, legal, { budgetMs = 1000, clock = now } = {}) {
  const start = clock(), belief = remainingPieces(snapshot), ranked = [];
  for (const action of legal) {
    if (clock() - start >= budgetMs) return { ranked: [], complete: false };
    ranked.push({ action, ...assess(snapshot, action, belief) });
  }
  ranked.sort((a,b) => b.score - a.score || actionKey(a.action).localeCompare(actionKey(b.action)));
  return { ranked, complete: true };
}

export function chooseFallback(snapshot, legal, options = {}) {
  if (snapshot.status !== "playing" || !legal.length) return null;
  const { ranked, complete } = rankSafety(snapshot, legal, { budgetMs: 24, ...options });
  return complete ? ranked[0]?.action ?? null : null;
}

function terminal(state, player, ply) {
  if (!state.result) return null;
  return state.result.outcome === "draw" ? 0 : state.result.winner === player ? WIN - ply : -WIN + ply;
}

export function chooseBot(input, { budgetMs = 700, maxNodes = 1400, maxDepth = 4, clock = now, onFallback = () => {} } = {}) {
  const start = clock(), view = copyPublic(input.snapshot), player = view.turn;
  const legal = getLegalActions(view, player).filter(a => matchLegal(a, input.legal));
  const trace = { source: "none", depth: 0, nodes: 0, candidates: legal.length, chanceFaces: 0 };
  const done = (action, source) => ({ action, trace: { ...trace, source } });
  if (view.status !== "playing" || !legal.length) return done(null, "finished");
  // Before colors exist all concealed squares have the same exact distribution.
  if (view.playerColors[player] === null) {
    const flips = legal.filter(a => a.type === "flip");
    return done(flips[Math.floor(seeded(input.seed)() * flips.length)], "opening");
  }
  const safety = rankSafety(view, legal, { budgetMs: Math.max(0, budgetMs * .65), clock });
  if (!safety.complete) return done(null, "budget-before-safety");
  let best = safety.ranked[0];
  onFallback(best.action);
  if (best.score >= WIN - 1 || legal.length === 1) return done(best.action, "certain");
  const root = hypotheticalState(input);
  const belief = remainingPieces(view);
  trace.chanceFaces = belief.length;
  let stopped = false;
  const exhausted = () => {
    if (trace.nodes >= maxNodes || clock() - start >= budgetMs) stopped = true;
    return stopped;
  };
  function search(state, depth, alpha, beta, ply) {
    trace.nodes++;
    const result = terminal(state, player, ply);
    if (result !== null) return result;
    const pub = getPublicState(state), advantage = material(pub, player);
    if (exhausted() || depth === 0) {
      const loss = worstLoss(pub);
      return advantage + (pub.turn === player ? loss : -loss) + pressure(pub, player);
    }
    const moves = getLegalActions(pub, pub.turn).filter(a => a.type === "move");
    // Future hidden squares are chance events, never a determinized oracle.
    // Quiet hidden positions can retain their static option to flip.
    let score = pub.board.some(p => p?.faceDown) ? advantage : pub.turn === player ? -Infinity : Infinity;
    if (!moves.length) return advantage;
    moves.sort((a,b) => value(pub.board[at(b.to)], pub) - value(pub.board[at(a.to)], pub));
    for (const a of moves) {
      if (exhausted()) break;
      const next = applyAction(state, pub.turn, a);
      if (!next.ok) continue;
      const child = search(next.state, depth - 1, alpha, beta, ply + 1);
      if (pub.turn === player) { score = Math.max(score, child); alpha = Math.max(alpha, score); }
      else { score = Math.min(score, child); beta = Math.min(beta, score); }
      if (beta <= alpha) break;
    }
    return Number.isFinite(score) ? score : advantage;
  }
  function rootValue(candidate, depth) {
    const a = candidate.action;
    if (a.type === "move") {
      const next = applyAction(root, player, a);
      return search(next.state, depth - 1, -Infinity, Infinity, 1);
    }
    let expected = 0;
    for (const face of belief) {
      if (exhausted()) break;
      // Condition a hypothetical world on this outcome, conserving its inventory.
      const target = at(a.at), board = [...root.board];
      const other = board.findIndex(p => p?.faceDown && p.color === face.color && p.type === face.type);
      [board[target], board[other]] = [board[other], board[target]];
      const next = applyAction({ ...root, board }, player, a);
      expected += face.probability * search(next.state, depth - 1, -Infinity, Infinity, 1);
    }
    return expected;
  }
  // Never let an incomplete iteration displace the fully evaluated safe choice.
  // Candidates with clearly worse immediate losses cannot win on speculative depth.
  const candidates = safety.ranked.filter(c => c.risk <= best.risk + 40 && c.score >= best.score - 180).slice(0, 8);
  for (let depth = 2; depth <= maxDepth && !exhausted(); depth++) {
    const scores = [];
    for (const candidate of candidates) {
      scores.push({ ...candidate, searchScore: rootValue(candidate, depth) });
      if (exhausted()) break;
    }
    if (stopped) break;
    scores.sort((a,b) => b.searchScore - a.searchScore || b.score - a.score || actionKey(a.action).localeCompare(actionKey(b.action)));
    best = scores[0] ?? best; trace.depth = depth;
    if (best.searchScore >= WIN - 10) break;
  }
  return done(best.action, trace.depth ? "search" : "safety");
}
