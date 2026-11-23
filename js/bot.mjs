import { getLegalActions, getPublicState, applyAction } from "./engine.mjs";
import { actionKey, copyPublic, matchLegal, observationKey } from "./bot-protocol.mjs";

// Independent Banqi bot. Bee 3 inspired the safety-before-search ordering, not
// its chess rules/code: https://github.com/VesperKrock/ichess-turtle-system
const COUNTS = { general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 };
const VALUE = { general: 700, advisor: 600, elephant: 450, rook: 360, horse: 280, cannon: 500, pawn: 130 };
const WIN = 100000;
const at = s => (Number(s[1]) - 1) * 8 + "abcdefgh".indexOf(s[0]);
const now = () => performance.now();

// Ask the rules engine for capture relationships. Geometry on an actual board
// is still checked by getLegalActions; a cannon's potential assumes one screen.
const TYPES = Object.keys(COUNTS);
const BEATS = Object.fromEntries(TYPES.map(type => [type, Object.fromEntries(TYPES.map(target => {
  const board = Array(32).fill(null), cannon = type === "cannon";
  board[0] = { occupied: true, color: "red", type, faceDown: false };
  board[cannon ? 2 : 1] = { occupied: true, color: "black", type: target, faceDown: false };
  if (cannon) board[1] = { occupied: true, faceDown: true };
  const view = { board, turn: 0, playerColors: ["red", "black"], status: "playing" };
  return [target, getLegalActions(view, 0).some(a => a.to === (cannon ? "c1" : "b1"))];
}))]));
const inventoryCache = new Map();
let captureInventory = new WeakMap();
const legalCache = new WeakMap();
function legalActions(view) {
  if (!legalCache.has(view)) legalCache.set(view, getLegalActions(view, view.turn));
  return legalCache.get(view);
}

// Remaining counts include concealed pieces, using ONLY the public captures.
// Potential is independent of current attacks: exposure is scored separately.
function inventory(view) {
  if (captureInventory.has(view.captured)) return captureInventory.get(view.captured);
  const counts = { red: { ...COUNTS }, black: { ...COUNTS } };
  for (const p of view.captured) counts[p.color][p.type]--;
  const key = ["red", "black"].flatMap(c => TYPES.map(t => counts[c][t])).join(",");
  if (inventoryCache.has(key)) {
    const cached = inventoryCache.get(key); captureInventory.set(view.captured, cached); return cached;
  }
  const values = {}, totals = {};
  const live = Object.values(counts.red).reduce((a,b) => a+b, 0) + Object.values(counts.black).reduce((a,b) => a+b, 0);
  for (const color of ["red", "black"]) {
    const own = counts[color], enemy = counts[color === "red" ? "black" : "red"];
    values[color] = {}; totals[color] = 0;
    for (const type of TYPES) {
      const counters = TYPES.reduce((n,t) => n + (BEATS[t][type] ? enemy[t] : 0), 0);
      // Once every counter is gone, this piece can dominate the remaining
      // army. Losing the final answer therefore changes BOTH armies' values.
      let worth = VALUE[type] * (1 + (counters ? .6 / (1 + counters) : 1.4));
      // Preserve scarce answers to an opposing general, even if it is hidden.
      // The bonus is shared by the surviving counters, not awarded per pawn.
      if (BEATS[type].general && enemy.general) {
        const answers = own.pawn + own.general + own.cannon;
        worth += 450 / Math.max(1, answers);
      }
      // With only two pieces there is no possible cannon screen.
      if (type === "cannon" && live <= 2) worth *= .35;
      values[color][type] = worth;
      totals[color] += own[type] * worth;
    }
  }
  const result = { counts, values, totals };
  if (inventoryCache.size >= 512) inventoryCache.clear();
  inventoryCache.set(key, result);
  captureInventory.set(view.captured, result);
  return result;
}

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
  const board = [...view.board];
  let colors = view.playerColors, captured = view.captured;
  if (action.type === "flip") {
    board[at(action.at)] = { ...revealed, occupied: true, faceDown: false };
    if (colors[view.turn] === null) {
      colors = [...colors];
      colors[view.turn] = revealed.color; colors[1 - view.turn] = revealed.color === "red" ? "black" : "red";
    }
  } else {
    if (board[at(action.to)]) captured = [...captured, board[at(action.to)]];
    board[at(action.to)] = board[at(action.from)]; board[at(action.from)] = null;
  }
  return { ...view, board, captured, playerColors: colors, turn: 1 - view.turn };
}

function value(piece, view) {
  if (!piece || piece.faceDown) return 0;
  return inventory(view).values[piece.color][piece.type];
}

function material(view, player) {
  const color = view.playerColors[player];
  if (!color) return 0;
  const { totals } = inventory(view);
  return totals[color] - totals[color === "red" ? "black" : "red"];
}

function captures(view) {
  return legalActions(view).filter(a => a.type === "move" && view.board[at(a.to)] !== null);
}

function exchange(view, target, depth = 3) {
  if (!depth) return 0;
  let best = 0;
  for (const action of captures(view).filter(a => a.to === target)) {
    const after = publicMove(view, action);
    const gain = material(after, view.turn) - material(view, view.turn);
    best = Math.max(best, gain - exchange(after, target, depth - 1));
  }
  return best;
}

function worstLoss(view) {
  let loss = 0;
  for (const a of captures(view)) {
    const after = publicMove(view, a);
    const gain = material(after, view.turn) - material(view, view.turn);
    if (knownWin(after, view.turn)) return WIN;
    loss = Math.max(loss, gain - exchange(after, a.to));
  }
  return loss;
}

function pressure(view, player) {
  const ours = [], theirs = [];
  view.board.forEach((p, i) => { if (p && !p.faceDown) (p.color === view.playerColors[player] ? ours : theirs).push(i); });
  let score = 0;
  for (const target of theirs) {
    let first = Infinity, second = Infinity;
    for (const i of ours) {
      if (!BEATS[view.board[i].type][view.board[target].type]) continue;
      const dx = Math.abs(i % 8 - target % 8), dy = Math.abs((i >> 3) - (target >> 3));
      // Cannon alignment is potential, never an assertion that a screen exists.
      const distance = view.board[i].type === "cannon" ? Math.min(dx, dy) + 2 : dx + dy;
      if (distance < first) { second = first; first = distance; }
      else if (distance < second) second = distance;
    }
    // Coordinate multiple hunters. A rook walking toward an invulnerable
    // general is not progress; a surviving pawn approaching it is.
    if (Number.isFinite(first)) score -= 6 * first + (Number.isFinite(second) ? 2 * second : 0);
  }
  return score;
}

function knownWin(view, player) {
  const enemy = view.playerColors[1 - player];
  return enemy !== null && (view.captured.filter(p => p.color === enemy).length === 16 || legalActions(view).length === 0);
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
  // Captures are immutable within one decision; quiet moves and chance faces
  // share the same inventory. Reset between calls so caller mutation cannot
  // leave a stale profile in this cache.
  captureInventory = new WeakMap();
  const finish = complete => {
    ranked.sort((a,b) => b.score - a.score || actionKey(a.action).localeCompare(actionKey(b.action)));
    // Each retained action has completed ALL face/exchange checks. An unsafe
    // prefix or a chase warning is never a budget fallback.
    return { ranked: complete ? ranked : ranked.filter(c => c.risk === 0 && !snapshot.chase.warnings.some(w => actionKey(w.action) === actionKey(c.action))), complete };
  };
  for (const action of legal) {
    if (clock() - start >= budgetMs) return finish(false);
    ranked.push({ action, ...assess(snapshot, action, belief) });
  }
  return finish(true);
}

export function chooseFallback(snapshot, legal, options = {}) {
  if (snapshot.status !== "playing" || !legal.length) return null;
  const { ranked } = rankSafety(snapshot, legal, { budgetMs: 24, ...options });
  return ranked[0]?.action ?? null;
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
  // Safety has priority over optional search. Reserve no artificial fraction:
  // use only the time still available inside the same overall 700 ms budget.
  const safety = rankSafety(view, legal, { budgetMs: Math.max(0, budgetMs - (clock() - start)), clock });
  if (!safety.complete) {
    const action = safety.ranked[0]?.action ?? null;
    if (action) onFallback(action);
    return done(action, action ? "partial-safety" : "budget-before-safety");
  }
  let best = safety.ranked[0];
  onFallback(best.action);
  if (legal.length === 1) return done(best.action, "certain");
  if (clock() - start >= budgetMs) return done(best.action, "safety");
  const root = hypotheticalState(input);
  if (best.score >= WIN - 1 && best.action.type === "move") {
    const next = applyAction(root, player, best.action);
    if (next.ok && next.state.result?.winner === player) return done(best.action, "certain");
  }
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
      // Only actual engine terminal results occupy the mate-score range.
      return Math.max(-WIN / 4, Math.min(WIN / 4, advantage + (pub.turn === player ? loss : -loss) + pressure(pub, player)));
    }
    const moves = legalActions(pub).filter(a => a.type === "move");
    // Future flips are not searched from a sampled identity. Bound mate claims
    // while they remain possible, but do not award material for an imaginary
    // pass: that used to hide the draw clock and reward leaving pieces hidden.
    let score = pub.board.some(p => p?.faceDown) ? (pub.turn === player ? -WIN / 4 : WIN / 4) : pub.turn === player ? -Infinity : Infinity;
    if (!moves.length) return advantage;
    const ordered = moves.map(action => ({ action, order: value(pub.board[at(action.to)], pub) * 10 + pressure(publicMove(pub, action), pub.turn) }));
    ordered.sort((a,b) => b.order - a.order);
    for (const { action: a } of ordered) {
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
  // Search unsafe challengers too: proven wins or escapes from proven losses
  // can justify a sacrifice. Speculative material scores cannot do so.
  const safe = c => c.risk <= safety.ranked[0].risk + 40 && c.score >= safety.ranked[0].score - 180;
  const endgame = !view.board.some(p => p?.faceDown) && view.board.filter(Boolean).length <= 6;
  const safeCandidates = safety.ranked.filter(safe).slice(0, 8);
  // Many near-equal quiet moves must not crowd every safe chance action out
  // of search. Reserve one slot, without enlarging the root or risk allowance.
  const safeFlip = safety.ranked.find(c => safe(c) && c.action.type === "flip" && c.risk === 0);
  if (safeFlip && !safeCandidates.includes(safeFlip)) safeCandidates.splice(-1, 1, safeFlip);
  const candidates = endgame ? [...safety.ranked] : [
    ...safeCandidates,
    ...safety.ranked.filter(c => !safe(c) && c.action.type === "move").slice(0, 2),
  ];
  // Public replay supplies these visits. A small, capped preference breaks
  // unproductive winning loops; it never admits an unsafe move, penalizes a
  // losing defense, or changes a terminal/proven-win score.
  const progress = new Map(candidates.map(c => [c.action, c.action.type === "move"
    ? -Math.min(3, root.positionCounts[observationKey(publicMove(view, c.action))] || 0) * 8
    : c.risk === 0 ? 8 : 0]));
  const depthLimit = endgame && legal.length <= 12 && maxDepth >= 4 ? maxDepth + 2 : maxDepth;
  for (let depth = 2; depth <= depthLimit && !exhausted(); depth++) {
    const scores = [];
    for (const candidate of candidates) {
      const searchScore = rootValue(candidate, depth);
      const preference = searchScore > 0 && searchScore < WIN / 4 ? searchScore + progress.get(candidate.action) : searchScore;
      scores.push({ ...candidate, searchScore, preference });
      if (exhausted()) break;
    }
    if (stopped) break;
    scores.sort((a,b) => b.preference - a.preference || b.score - a.score || actionKey(a.action).localeCompare(actionKey(b.action)));
    const safest = scores.find(safe);
    best = scores.find(c => safe(c) || c.searchScore >= WIN - 64 || (safest?.searchScore <= -WIN + 64 && c.searchScore > safest.searchScore)) ?? best;
    trace.depth = depth;
    candidates.sort((a,b) => scores.findIndex(s => s.action === a.action) - scores.findIndex(s => s.action === b.action));
    if (best.searchScore >= WIN - 64) break;
  }
  return done(best.action, trace.depth ? "search" : "safety");
}
