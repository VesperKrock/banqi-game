// R2-03C: core rules, chase adjudication and clean repetition phases.
// See docs/RULES.md for the state contract and the chosen Banqi variant.
const COLUMNS = 8;
const ROWS = 4;
const PIECE_COUNTS = { general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 };
const RANK = { general: 7, advisor: 6, elephant: 5, rook: 4, horse: 3, cannon: 2, pawn: 1 };

function isPlayer(player) {
  return player === 0 || player === 1;
}

function isCoordinate(value) {
  return typeof value === "string" && value.length === 2 && /^[a-h][1-4]$/.test(value);
}

function indexOf(coordinate) {
  return (Number(coordinate[1]) - 1) * COLUMNS + coordinate.charCodeAt(0) - 97;
}

function coordinateOf(index) {
  return `${String.fromCharCode(97 + index % COLUMNS)}${Math.floor(index / COLUMNS) + 1}`;
}

function pieceInfo(piece) {
  return { color: piece.color, type: piece.type };
}

function resultInfo(result) {
  return result == null ? null : { outcome: result.outcome, winner: result.winner, reason: result.reason };
}

// Canonical, collision-free encoding of public position only; never private state.
function positionKey(publicState) {
  const board = publicState.board.map((piece) => piece === null ? null
    : piece.faceDown ? "?" : [piece.color, piece.type]);
  return JSON.stringify([board, publicState.turn, publicState.playerColors]);
}

// Three timestamps suffice for adjudication; lifetime frequencies remain intact.
// Until the first phase boundary, preserve legacy R1 frequency-only histories.
function drawRepetitionCount(state, key) {
  const start = state.repetitionEpochStart ?? 0;
  return start === 0 ? Math.min(state.positionCounts?.[key] ?? 1, 3)
    : (state.positionLastPlies?.[key] ?? []).filter((ply) => ply >= start).length;
}

/** Creates PRIVATE state. random() must supply independent uniform values in [0, 1). */
export function createGame(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("options must be an object");
  }
  const { random = Math.random, firstPlayer } = options;
  if (typeof random !== "function") throw new TypeError("random must be a function");
  if (firstPlayer !== undefined && !isPlayer(firstPlayer)) {
    throw new RangeError("firstPlayer must be 0 or 1");
  }
  const randomIndex = (size) => {
    const value = random();
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("random must return a finite number in [0, 1)");
    }
    return Math.floor(value * size);
  };

  const turn = firstPlayer ?? randomIndex(2);
  const board = [];
  for (const color of ["red", "black"]) {
    for (const [type, count] of Object.entries(PIECE_COUNTS)) {
      for (let i = 0; i < count; i += 1) board.push({ color, type, faceDown: true });
    }
  }
  // Fisher–Yates: every remaining position has equal probability at each step.
  for (let i = board.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [board[i], board[j]] = [board[j], board[i]];
  }
  const state = { board, turn, playerColors: [null, null], captured: [],
    status: "playing", result: null, noProgressPly: 0, positionCounts: {} };
  state.positionCounts[positionKey(publicPosition(state))] = 1;
  Object.assign(state, cloneChase(state));
  return state;
}

// This projection has no warnings/history and is also used by internal analysis.
function publicPosition(privateState) {
  const snapshot = {
    board: privateState.board.map((piece) => {
      if (piece === null) return null;
      if (piece.faceDown) return { occupied: true, faceDown: true };
      return { occupied: true, faceDown: false, ...pieceInfo(piece) };
    }),
    turn: privateState.turn,
    playerColors: [...privateState.playerColors],
    captured: privateState.captured.map(pieceInfo),
    status: privateState.status ?? "playing",
    result: resultInfo(privateState.result),
    noProgressPly: privateState.noProgressPly ?? 0,
  };
  const key = positionKey(snapshot);
  snapshot.repetitionCount = privateState.positionCounts?.[key] ?? 1;
  snapshot.drawRepetitionCount = drawRepetitionCount(privateState, key);
  return snapshot;
}

function pairInfo(pair) {
  return { attackerId: pair.attackerId, targetId: pair.targetId };
}

function samePair(a, b) {
  return a.attackerId === b.attackerId && a.targetId === b.targetId;
}

// Legacy states start observation here. Revealed pieces get IDs in board order;
// hidden identities and any supposed pre-import chase history are never inspected.
function cloneChase(state) {
  let nextId = 1;
  const visibleIds = state.visibleIds ? [...state.visibleIds]
    : state.board.map((p) => p === null || p.faceDown ? null : `v${nextId++}`);
  const ply = state.ply ?? 0;
  const positionLastPlies = Object.fromEntries(Object.entries(state.positionLastPlies ?? {})
    .map(([key, plies]) => [key, [...plies]]));
  const snapshot = publicPosition(state);
  positionLastPlies[positionKey(snapshot)] ??= [ply];
  // An older R2-03A state can prove a pending deferral at its current position.
  // Do not reconstruct an unrecorded past segment from frequencies alone.
  const repetitionChase = state.repetitionChase === undefined && snapshot.status !== "finished" && snapshot.drawRepetitionCount >= 3
    ? repetitionChaser({ positionLastPlies, runs: state.runs ?? [[], []] }, snapshot)
    : state.repetitionChase;
  return {
    ply, visibleIds, nextVisibleId: state.nextVisibleId ?? nextId,
    runs: (state.runs ?? [[], []]).map((runs) => runs.map((run) =>
      ({ ...pairInfo(run), count: run.count, startPly: run.startPly }))),
    chaseFaults: [...(state.chaseFaults ?? [0, 0])], positionLastPlies,
    repetitionEpochStart: state.repetitionEpochStart ?? 0,
    repetitionChase: repetitionChase == null ? null : {
      player: repetitionChase.player, pairs: repetitionChase.pairs.map(pairInfo),
    },
    quietDrawHold: state.quietDrawHold == null ? null : {
      player: state.quietDrawHold.player, pairs: state.quietDrawHold.pairs.map(pairInfo),
    },
  };
}

function locatedPair(pair, ids) {
  return { ...pairInfo(pair), attackerAt: coordinateOf(ids.indexOf(pair.attackerId)),
    targetAt: coordinateOf(ids.indexOf(pair.targetId)) };
}

/** Fresh allowlisted data only, including warnings derived solely from public moves. */
export function getPublicState(privateState) {
  const snapshot = publicPosition(privateState);
  const chase = cloneChase(privateState);
  snapshot.board.forEach((piece, index) => {
    if (piece !== null && !piece.faceDown) piece.visibleId = chase.visibleIds[index];
  });
  const drawDeferred = [];
  if (snapshot.status !== "finished") {
    const repetition = repetitionChaser(chase, snapshot);
    if (snapshot.drawRepetitionCount >= 3 && repetition !== null) {
      drawDeferred.push({ reason: "threefold_repetition", player: repetition.player,
        pairs: repetition.pairs.map((pair) => locatedPair(pair, chase.visibleIds)) });
    }
    if (chase.quietDrawHold !== null) {
      drawDeferred.push({ reason: "no_progress_60", player: chase.quietDrawHold.player,
        pairs: chase.quietDrawHold.pairs.map((pair) => locatedPair(pair, chase.visibleIds)) });
    }
  }
  const warnings = [];
  const player = snapshot.turn;
  if (snapshot.status !== "finished" && chase.runs[player].some((run) => run.count >= 6)) {
    for (const action of getLegalActions(snapshot, player)) {
      if (action.type !== "move" || snapshot.board[indexOf(action.to)] !== null) continue;
      const from = indexOf(action.from), to = indexOf(action.to);
      const board = [...snapshot.board], ids = [...chase.visibleIds];
      board[to] = board[from]; board[from] = null;
      ids[to] = ids[from]; ids[from] = null;
      const runs = quietRuns(board, ids, chase.runs[player], action, chase.ply + 1);
      const pairs = runs.filter((run) => run.count >= 7);
      if (pairs.length) warnings.push({ action, player,
        pairs: pairs.map((pair) => locatedPair(pair, ids)),
        nextFault: chase.chaseFaults[player] + 1, losesGame: chase.chaseFaults[player] >= 1 });
    }
  }
  snapshot.chase = {
    faults: [...chase.chaseFaults],
    runs: chase.runs.map((runs) => runs.map((run) =>
      ({ ...locatedPair(run, chase.visibleIds), count: run.count }))),
    drawDeferred, warnings,
  };
  return snapshot;
}

function canMove(board, from, to) {
  if (from === to) return false;
  const attacker = board[from];
  const target = board[to];
  const dx = to % COLUMNS - from % COLUMNS;
  const dy = Math.floor(to / COLUMNS) - Math.floor(from / COLUMNS);
  const distance = Math.abs(dx) + Math.abs(dy);

  if (target === null) return distance === 1;
  if (target.faceDown || target.color === attacker.color) return false;

  if (attacker.type === "cannon") {
    if (dx !== 0 && dy !== 0) return false;
    const step = Math.sign(dx) + Math.sign(dy) * COLUMNS;
    let screens = 0;
    for (let at = from + step; at !== to; at += step) {
      if (board[at] !== null) screens += 1;
      if (screens > 1) return false;
    }
    return screens === 1;
  }

  if (distance !== 1) return false;
  if (attacker.type === "pawn") return target.type === "pawn" || target.type === "general";
  if (attacker.type === "general" && target.type === "pawn") return false;
  return RANK[attacker.type] >= RANK[target.type];
}

/** Uses public information only; callers must pass a snapshot from getPublicState. */
export function getLegalActions(publicState, player) {
  if (publicState.status === "finished") return [];
  if (!isPlayer(player) || player !== publicState.turn) return [];
  return basicActions(publicState.board, publicState.playerColors[player]);
}

// Explicitly ignores turn/status only for internal one-ply response analysis.
function basicActions(board, color) {
  const actions = [];
  for (let from = 0; from < COLUMNS * ROWS; from += 1) {
    const piece = board[from];
    if (piece === null) continue;
    if (piece.faceDown) {
      actions.push({ type: "flip", at: coordinateOf(from) });
    } else if (color !== null && piece.color === color) {
      for (let to = 0; to < COLUMNS * ROWS; to += 1) {
        if (canMove(board, from, to)) {
          actions.push({ type: "move", from: coordinateOf(from), to: coordinateOf(to) });
        }
      }
    }
  }
  return actions;
}

// Called only on a fully revealed public board. Saving B includes another piece
// capturing A or changing a cannon screen. No recursive actions/outcomes/search.
function canSaveTarget(board, attacker, target, replies) {
  return replies.some((reply) => {
    const from = indexOf(reply.from), to = indexOf(reply.to);
    if (to === attacker) return true;
    const after = [...board];
    after[to] = after[from]; after[from] = null;
    return !canMove(after, attacker, from === target ? to : target);
  });
}

// Shared by forecast and adjudication; board/IDs already reflect the quiet move.
function quietRuns(board, ids, previous, action, ply) {
  const attacker = indexOf(action.to);
  const fullyRevealed = !board.some((piece) => piece !== null && piece.faceDown);
  const enemy = board[attacker].color === "red" ? "black" : "red";
  let replies;
  const runs = [];
  for (let target = 0; target < board.length; target += 1) {
    const piece = board[target];
    if (piece === null || piece.faceDown || !canMove(board, attacker, target)) continue;
    if (fullyRevealed) {
      replies ??= basicActions(board, enemy);
      if (!canSaveTarget(board, attacker, target, replies)) continue;
    }
    const pair = { attackerId: ids[attacker], targetId: ids[target] };
    const old = previous.find((run) => samePair(run, pair));
    runs.push({ ...pair, count: (old?.count ?? 0) + 1, startPly: old?.startPly ?? ply });
  }
  return runs;
}

// Attribution spans (first of last three occurrences, current ply]. The fleeing
// move carries the other side's run; a first fault preserves its startPly.
function repetitionChaser(chase, snapshot) {
  const plies = chase.positionLastPlies[positionKey(snapshot)];
  if (!plies || plies.length < 3) return null;
  const first = plies[0], last = plies[2];
  const responsible = [];
  for (const player of [0, 1]) {
    const firstOwnPly = first + (snapshot.turn === player ? 1 : 2);
    const pairs = chase.runs[player].filter((run) => run.startPly <= firstOwnPly && firstOwnPly <= last);
    if (pairs.length) responsible.push({ player, pairs });
  }
  return responsible.length === 1 ? responsible[0] : null;
}

function isAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) return false;
  const fields = action.type === "flip" ? ["type", "at"] : action.type === "move" ? ["type", "from", "to"] : [];
  if (fields.length === 0 || Object.keys(action).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(action, field))) return false;
  return action.type === "flip" ? isCoordinate(action.at) : isCoordinate(action.from) && isCoordinate(action.to);
}

function clonePrivateState(state) {
  const positionCounts = { ...state.positionCounts };
  // R1-01 states/hand-built fixtures start their known history at this position.
  const currentKey = positionKey(publicPosition(state));
  positionCounts[currentKey] ??= 1;
  return {
    board: state.board.map((piece) => piece === null ? null : { ...pieceInfo(piece), faceDown: piece.faceDown }),
    turn: state.turn,
    playerColors: [...state.playerColors],
    captured: state.captured.map(pieceInfo),
    status: state.status ?? "playing",
    result: resultInfo(state.result),
    noProgressPly: state.noProgressPly ?? 0,
    positionCounts,
    ...cloneChase(state),
  };
}

function updateOutcome(state, player, event) {
  state.ply += 1;
  const progress = event.type === "flip" || event.captured !== null;
  state.noProgressPly = progress ? 0 : state.noProgressPly + 1;
  const snapshot = publicPosition(state);
  let releasedHold = false;
  if (progress) {
    state.runs = [[], []];
    state.quietDrawHold = null;
  } else {
    state.runs[player] = quietRuns(snapshot.board, state.visibleIds, state.runs[player], event, state.ply);
    if (state.runs[player].some((run) => run.count >= 7)) {
      state.chaseFaults[player] += 1;
      state.runs[player].forEach((run) => { run.count = 0; });
    }
    if (state.quietDrawHold?.player === player) {
      state.quietDrawHold.pairs = state.quietDrawHold.pairs.filter((pair) =>
        state.runs[player].some((run) => samePair(pair, run)));
      releasedHold = state.quietDrawHold.pairs.length === 0;
      if (releasedHold) state.quietDrawHold = null;
    }
  }
  // Only ending a segment that actually deferred threefold starts a new phase.
  // A fleeing quiet reply carries the attacker's runs; a first fault keeps pairs.
  if (state.repetitionChase !== null) {
    const pending = state.repetitionChase;
    pending.pairs = pending.pairs.filter((pair) => state.runs[pending.player].some((run) => samePair(pair, run)));
    if (pending.pairs.length === 0) {
      state.repetitionEpochStart = state.ply;
      state.repetitionChase = null;
    }
  }
  const key = positionKey(snapshot);
  state.positionCounts[key] = (state.positionCounts[key] ?? 0) + 1;
  state.positionLastPlies[key] = [...(state.positionLastPlies[key] ?? []), state.ply].slice(-3);
  const repeats = drawRepetitionCount(state, key) >= 3;
  const repetition = repeats ? repetitionChaser(state, snapshot) : null;

  const opponentColor = state.playerColors[state.turn];
  if (state.chaseFaults[player] >= 2) {
    state.result = { outcome: "win", winner: 1 - player, reason: "chase_technical_fouls" };
  } else if (!state.board.some((piece) => piece !== null && piece.color === opponentColor)) {
    state.result = { outcome: "win", winner: player, reason: "all_pieces_captured" };
  } else if (getLegalActions(snapshot, state.turn).length === 0) {
    state.result = { outcome: "win", winner: player, reason: "no_legal_actions" };
  } else if (repeats && repetition === null) {
    state.result = { outcome: "draw", winner: null, reason: "threefold_repetition" };
  } else if (state.noProgressPly >= 60) {
    const chasers = [0, 1].filter((p) => state.runs[p].length > 0);
    if (releasedHold || (state.quietDrawHold === null && chasers.length !== 1)) {
      state.result = { outcome: "draw", winner: null, reason: "no_progress_60" };
    } else if (state.quietDrawHold === null) {
      const responsible = chasers[0];
      state.quietDrawHold = { player: responsible, pairs: state.runs[responsible].map(pairInfo) };
    }
  }
  if (state.result !== null) state.status = "finished";
  else if (repetition !== null && state.repetitionChase === null) {
    state.repetitionChase = { player: repetition.player, pairs: repetition.pairs.map(pairInfo) };
  }
}

/** Success contains PRIVATE state and a separate public event. Errors contain no state. */
export function applyAction(privateState, player, action) {
  if (privateState.status === "finished") return { ok: false, error: "GAME_OVER" };
  if (!isPlayer(player)) return { ok: false, error: "INVALID_PLAYER" };
  if (player !== privateState.turn) return { ok: false, error: "NOT_YOUR_TURN" };
  if (!isAction(action)) return { ok: false, error: "INVALID_ACTION" };

  const legal = getLegalActions(publicPosition(privateState), player).some((candidate) =>
    candidate.type === action.type && (action.type === "flip"
      ? candidate.at === action.at
      : candidate.from === action.from && candidate.to === action.to));
  if (!legal) return { ok: false, error: "ILLEGAL_ACTION" };

  const state = clonePrivateState(privateState);
  let event;
  if (action.type === "flip") {
    const piece = state.board[indexOf(action.at)];
    piece.faceDown = false;
    state.visibleIds[indexOf(action.at)] = `v${state.nextVisibleId++}`;
    if (state.playerColors[player] === null) {
      state.playerColors[player] = piece.color;
      state.playerColors[1 - player] = piece.color === "red" ? "black" : "red";
    }
    event = { type: "flip", player, at: action.at, piece: pieceInfo(piece) };
  } else {
    const from = indexOf(action.from), to = indexOf(action.to);
    const piece = state.board[from], captured = state.board[to];
    if (captured !== null) state.captured.push(pieceInfo(captured));
    state.board[to] = piece;
    state.board[from] = null;
    state.visibleIds[to] = state.visibleIds[from];
    state.visibleIds[from] = null;
    event = { type: "move", player, from: action.from, to: action.to,
      piece: pieceInfo(piece), captured: captured === null ? null : pieceInfo(captured) };
  }
  state.turn = 1 - player;
  updateOutcome(state, player, event);
  return { ok: true, state, event };
}
