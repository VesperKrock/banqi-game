// R1-02: core rules and automatic outcomes. No DOM, orientation or networking.
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
  state.positionCounts[positionKey(getPublicState(state))] = 1;
  return state;
}

/** Fresh allowlisted data only. Never spread/serialize a private piece into this view. */
export function getPublicState(privateState) {
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
  snapshot.repetitionCount = privateState.positionCounts?.[positionKey(snapshot)] ?? 1;
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
  const actions = [];
  const color = publicState.playerColors[player];
  for (let from = 0; from < COLUMNS * ROWS; from += 1) {
    const piece = publicState.board[from];
    if (piece === null) continue;
    if (piece.faceDown) {
      actions.push({ type: "flip", at: coordinateOf(from) });
    } else if (color !== null && piece.color === color) {
      for (let to = 0; to < COLUMNS * ROWS; to += 1) {
        if (canMove(publicState.board, from, to)) {
          actions.push({ type: "move", from: coordinateOf(from), to: coordinateOf(to) });
        }
      }
    }
  }
  return actions;
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
  const currentKey = positionKey(getPublicState(state));
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
  };
}

function updateOutcome(state, player, event) {
  state.noProgressPly = event.type === "flip" || event.captured !== null ? 0 : state.noProgressPly + 1;
  const snapshot = getPublicState(state);
  const key = positionKey(snapshot);
  state.positionCounts[key] = (state.positionCounts[key] ?? 0) + 1;

  const opponentColor = state.playerColors[state.turn];
  if (!state.board.some((piece) => piece !== null && piece.color === opponentColor)) {
    state.result = { outcome: "win", winner: player, reason: "all_pieces_captured" };
  } else if (getLegalActions(snapshot, state.turn).length === 0) {
    state.result = { outcome: "win", winner: player, reason: "no_legal_actions" };
  } else if (state.positionCounts[key] >= 3) {
    state.result = { outcome: "draw", winner: null, reason: "threefold_repetition" };
  } else if (state.noProgressPly >= 60) {
    state.result = { outcome: "draw", winner: null, reason: "no_progress_60" };
  }
  if (state.result !== null) state.status = "finished";
}

/** Success contains PRIVATE state and a separate public event. Errors contain no state. */
export function applyAction(privateState, player, action) {
  if (privateState.status === "finished") return { ok: false, error: "GAME_OVER" };
  if (!isPlayer(player)) return { ok: false, error: "INVALID_PLAYER" };
  if (player !== privateState.turn) return { ok: false, error: "NOT_YOUR_TURN" };
  if (!isAction(action)) return { ok: false, error: "INVALID_ACTION" };

  const legal = getLegalActions(getPublicState(privateState), player).some((candidate) =>
    candidate.type === action.type && (action.type === "flip"
      ? candidate.at === action.at
      : candidate.from === action.from && candidate.to === action.to));
  if (!legal) return { ok: false, error: "ILLEGAL_ACTION" };

  const state = clonePrivateState(privateState);
  let event;
  if (action.type === "flip") {
    const piece = state.board[indexOf(action.at)];
    piece.faceDown = false;
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
    event = { type: "move", player, from: action.from, to: action.to,
      piece: pieceInfo(piece), captured: captured === null ? null : pieceInfo(captured) };
  }
  state.turn = 1 - player;
  updateOutcome(state, player, event);
  return { ok: true, state, event };
}
