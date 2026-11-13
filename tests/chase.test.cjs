"use strict";

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createGame, getPublicState, getLegalActions, applyAction;
before(async () => ({ createGame, getPublicState, getLegalActions, applyAction } = await import("../js/engine.mjs")));
const COUNTS = { general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 };
const at = (square) => (Number(square[1]) - 1) * 8 + "abcdefgh".indexOf(square[0]);
const piece = (color, type, faceDown = false) => ({ color, type, faceDown });
const red = (type, down = false) => piece("red", type, down);
const black = (type, down = false) => piece("black", type, down);
const move = (from, to) => ({ type: "move", from, to });
const flip = (square) => ({ type: "flip", at: square });
function fixture(entries, options = {}) {
  const board = Array(32).fill(null), captured = [];
  for (const [square, p] of Object.entries(entries)) board[at(square)] = structuredClone(p);
  for (const color of ["red", "black"]) for (const [type, total] of Object.entries(COUNTS)) {
    const left = board.filter((p) => p?.color === color && p.type === type).length;
    assert.ok(left <= total, `Invalid fixture: ${color} ${type}`);
    for (let i = left; i < total; i++) captured.push({ color, type });
  }
  return { board, captured, turn: 0, playerColors: ["red", "black"], status: "playing",
    result: null, noProgressPly: 0, positionCounts: {}, ...options };
}
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function play(state, action) {
  const saved = structuredClone(state);
  const result = applyAction(freeze(state), state.turn, freeze(action));
  assert.equal(result.ok, true, JSON.stringify(action));
  assert.deepEqual(state, saved, "Immutable private input, including history/IDs/hold/runs");
  assert.equal(result.state.turn, 1 - state.turn);
  return result.state;
}
const LOOP = [move("b2", "c2"), move("c3", "b3"), move("c2", "b2"), move("b3", "c3")];
const c1 = (extra = {}, options) => fixture({ b2: red("general"), c3: black("advisor"), ...extra }, options);
// R2-03C: inferred equivalent, not a claimed transcript of the user's game.
const elephantStart = (extra = {}) => fixture({ b1: red("elephant"), b3: black("horse"),
  g1: red("advisor"), a4: black("advisor"), ...extra });
const ELEPHANT_BREAK = ("b1-b2 b3-c3 b2-c2 c3-b3 c2-b2 b3-c3 g1-h1 a4-b4 " +
  "b2-c2 c3-b3 c2-b2 b3-c3 b2-c2 c3-b3 c2-b2 b3-c3 b2-c2 c3-b3 h1-g1 b4-a4 c2-b2")
  .split(" ").map((s) => move(...s.split("-")));
function cycle(state, plies, offset = 0) {
  for (let i = 0; i < plies; i++) state = play(state, LOOP[(i + offset) % 4]);
  return state;
}
const runs = (state, player = 0) => getPublicState(state).chase.runs[player];
const reasons = (state) => getPublicState(state).chase.drawDeferred.map((d) => d.reason);
function ended(state, reason, winner = null) {
  assert.equal(state.status, "finished");
  assert.deepEqual(state.result, { outcome: winner === null ? "draw" : "win", winner, reason });
}
// Explicit boundary fixtures only: seed known public counters, never a result.
// These do not claim a reachable earlier history; ordinary C1 uses real actions.
function boundaryRuns(state, pairs, { count = 6, faults = 0, player = 0 } = {}) {
  state = structuredClone(state);
  const view = getPublicState(state);
  state.visibleIds = view.board.map((p) => p?.visibleId ?? null);
  state.nextVisibleId = state.visibleIds.filter(Boolean).length + 1;
  state.runs ??= [[], []];
  state.runs[player] = pairs.map(([a, b]) => ({ attackerId: view.board[at(a)].visibleId,
    targetId: view.board[at(b)].visibleId, count, startPly: 0 }));
  state.chaseFaults ??= [0, 0];
  state.chaseFaults[player] = faults;
  return state;
}

test("C1: ply 8 hoãn hòa; ply 13 lỗi 1 giữ nước/startPly; ply 27 lỗi 2 Đỏ thua", () => {
  let state = c1();
  for (let ply = 1; ply <= 27; ply++) {
    const before = getPublicState(state), action = LOOP[(ply - 1) % 4];
    if (ply === 13 || ply === 27) {
      const warning = before.chase.warnings.find((w) => JSON.stringify(w.action) === JSON.stringify(action));
      assert.ok(warning, `Warning BEFORE ply ${ply}`);
      assert.equal(warning.player, 0);
      assert.equal(warning.nextFault, ply === 13 ? 1 : 2);
      assert.equal(warning.losesGame, ply === 27);
      assert.ok(getLegalActions(before, 0).some((a) => JSON.stringify(a) === JSON.stringify(action)));
      assert.ok(getLegalActions(before, 0).length > before.chase.warnings.length, "Not every action incurs a fault");
    }
    state = play(state, action);
    assert.equal(state.ply, ply);
    assert.equal(state.noProgressPly, ply);
    if (ply < 27) assert.equal(state.status, "playing", `Still playing at ${ply}`);
    if (ply === 8) {
      assert.equal(getPublicState(state).repetitionCount, 3);
      assert.deepEqual(reasons(state), ["threefold_repetition"]);
      assert.equal(getPublicState(state).chase.drawDeferred[0].player, 0);
      assert.equal(runs(state)[0].count, 4);
      assert.deepEqual(state.chaseFaults, [0, 0]);
    }
    if (ply === 13) {
      assert.deepEqual(state.chaseFaults, [1, 0]);
      assert.equal(state.runs[0][0].count, 0);
      assert.equal(state.runs[0][0].startPly, 1);
      assert.equal(state.board[at("c2")].type, "general");
      assert.equal(state.turn, 1);
    }
  }
  ended(state, "chase_technical_fouls", 1);
  assert.deepEqual(state.chaseFaults, [2, 0]);
  assert.equal(state.runs[0][0].startPly, 1);
  assert.deepEqual(getPublicState(state).chase.warnings, []);
  assert.deepEqual(getPublicState(state).chase.drawDeferred, []);
});

test("C1 đối xứng: người 1/màu Đen đuổi, người 0 thắng ở ply 27", () => {
  const state = cycle(fixture({ b2: black("general"), c3: red("advisor") }, { turn: 1 }), 27);
  ended(state, "chase_technical_fouls", 0);
  assert.deepEqual(state.chaseFaults, [0, 2]);
});

test("R2-03C Tượng–Mã/Sĩ: ngắt tại 19, đuổi lại tại 21 không dùng lần lặp cũ để hòa", (t) => {
  let state = elephantStart();
  const trace = [];
  for (let ply = 0; ply <= ELEPHANT_BREAK.length; ply++) {
    if (ply) state = play(state, ELEPHANT_BREAK[ply - 1]);
    const view = getPublicState(state);
    trace.push({ ply, action: ply ? ELEPHANT_BREAK[ply - 1] : null, turn: view.turn,
      repetitionCount: view.repetitionCount, drawRepetitionCount: view.drawRepetitionCount,
      drawDeferred: view.chase.drawDeferred, runs: view.chase.runs,
      faults: view.chase.faults, result: view.result });
    assert.deepEqual(view.chase.faults, [0, 0]);
    if (ply === 18) {
      assert.equal(view.chase.drawDeferred[0].player, 0);
      assert.equal(view.chase.runs[0][0].count, 5);
    }
    if (ply === 19) assert.deepEqual(view.chase.runs, [[], []]);
  }
  t.diagnostic(JSON.stringify(trace));
  assert.equal(state.status, "playing", "Old C2 drew at ply 21 using occurrences 1, 5, 21");
  assert.equal(getPublicState(state).repetitionCount, 3, "Audit history is retained");
  assert.equal(getPublicState(state).drawRepetitionCount, 1, "Only occurrence 21 belongs to the new phase");
  assert.equal(state.runs[0][0].count, 1);
  assert.equal(state.runs[0][0].startPly, 21);
  assert.equal(state.noProgressPly, 21);
  assert.deepEqual(reasons(state), []);
});

test("R2-03C ba lần lặp mới bằng nước chờ vẫn hòa, giữ tần suất/mốc cũ để kiểm toán", () => {
  let state = ELEPHANT_BREAK.slice(0, 19).reduce(play, elephantStart());
  assert.equal(state.repetitionEpochStart, 19);
  const oldCounts = structuredClone(state.positionCounts);
  const waiting = [move("b4", "a4"), move("g1", "h1"), move("a4", "b4"), move("h1", "g1")];
  for (let step = 0; step < 8; step++) {
    state = play(state, waiting[step % 4]);
    if (step < 7) assert.equal(state.status, "playing");
    if (step === 3) assert.equal(getPublicState(state).drawRepetitionCount, 2);
  }
  ended(state, "threefold_repetition");
  assert.equal(state.ply, 27);
  assert.equal(getPublicState(state).drawRepetitionCount, 3);
  assert.deepEqual(state.chaseFaults, [0, 0]);
  for (const [key, count] of Object.entries(oldCounts)) assert.ok(state.positionCounts[key] >= count);
  assert.equal(Object.values(state.positionCounts).reduce((a, b) => a + b, 0), 28);
  assert.ok(Object.values(state.positionLastPlies).some((plies) => plies.join() === "19,23,27"));
});

test("R2-03C đuổi lại liên tục vẫn ghi lỗi 1 tại 33, lỗi 2 tại 47; người chạy không bị phạt", () => {
  let state = ELEPHANT_BREAK.reduce(play, elephantStart());
  for (let ply = 22; ply <= 47; ply++) {
    const action = LOOP[(ply - 19) % 4];
    if (ply === 33 || ply === 47) {
      const warning = getPublicState(state).chase.warnings.find((w) => JSON.stringify(w.action) === JSON.stringify(action));
      assert.equal(warning.nextFault, ply === 33 ? 1 : 2);
    }
    state = play(state, action);
    assert.equal(state.repetitionEpochStart, 19, "Fleeing moves/first fault do not start another phase");
    assert.equal(state.chaseFaults[1], 0);
    if (ply < 47) assert.equal(state.status, "playing");
    if (ply === 33) assert.deepEqual(state.chaseFaults, [1, 0]);
  }
  ended(state, "chase_technical_fouls", 1);
});

const elephantLoopStart = (extra = {}) => fixture({ b2: red("elephant"), c3: black("horse"),
  g1: red("advisor"), a4: black("advisor"), ...extra });
const CHASE_AND_WAIT = [...LOOP, ...LOOP, move("g1", "h1"), move("a4", "b4"), move("h1", "g1"), move("b4", "a4")];
function repeatedBreaks(plies, extra = {}) {
  let state = elephantLoopStart(extra);
  for (let ply = 1; ply <= plies; ply++) {
    state = play(state, CHASE_AND_WAIT[(ply - 1) % CHASE_AND_WAIT.length]);
    assert.equal(state.noProgressPly, ply, "Changing repetition phase never resets quiet ply");
    if (ply < 60) assert.equal(state.status, "playing");
  }
  return state;
}

test("R2-03C đuổi–ngắt lặp lại qua 60 nước thật: năm phase mới vẫn hòa đúng 60", () => {
  const state = repeatedBreaks(60);
  ended(state, "no_progress_60");
  assert.equal(state.repetitionEpochStart, 57);
  assert.equal(state.ply, 60);
  assert.deepEqual(state.chaseFaults, [0, 0]);
  assert.equal(state.quietDrawHold, null);
  assert.equal(getPublicState(state).repetitionCount, 16);
  assert.equal(getPublicState(state).drawRepetitionCount, 1);
});

function reachRealHold(extra = {}) {
  let state = repeatedBreaks(48, extra);
  for (let i = 0; i < 12; i++) state = play(state, LOOP[i % 4]);
  assert.equal(state.noProgressPly, 60);
  assert.equal(state.status, "playing");
  assert.equal(state.quietDrawHold.player, 0);
  assert.equal(state.runs[0][0].count, 6);
  return state;
}
for (const [name, extra, action, runCount] of [
  ["Sĩ ngắt", {}, move("g1", "h1"), 0],
  ["đổi quân A", { d2: red("elephant") }, move("d2", "c2"), 1],
  ["đổi mục tiêu B", { c1: black("horse") }, move("b2", "b1"), 1],
]) test(`R2-03C sau 60 ply thật, ${name} mở phase mới vẫn giải phóng hold tại 61`, () => {
  const state = play(reachRealHold(extra), action);
  ended(state, "no_progress_60");
  assert.equal(state.ply, 61);
  assert.equal(state.noProgressPly, 61);
  assert.equal(state.repetitionEpochStart, 61);
  assert.equal(state.quietDrawHold, null);
  assert.equal(state.repetitionChase, null);
  assert.equal(state.runs[0].length, runCount);
  assert.deepEqual(state.chaseFaults, [0, 0]);
});

test("R2-03C sau 60 ply thật, giữ cặp hold: lỗi 1 tại 61, lỗi 2 tại 75", () => {
  let state = reachRealHold();
  const hold = structuredClone(state.quietDrawHold);
  const start = state.repetitionEpochStart;
  for (let ply = 61; ply <= 75; ply++) {
    state = play(state, LOOP[(ply - 61) % 4]);
    assert.equal(state.noProgressPly, ply);
    assert.deepEqual(state.quietDrawHold, hold);
    assert.equal(state.repetitionEpochStart, start);
    if (ply === 61) assert.deepEqual(state.chaseFaults, [1, 0]);
  }
  ended(state, "chase_technical_fouls", 1);
});

test("R2-03C lỗi đầu không bị xóa khi Sĩ ngắt rồi Tượng đuổi lại", () => {
  let state = cycle(elephantLoopStart(), 14);
  assert.deepEqual(state.chaseFaults, [1, 0]);
  state = play(state, move("g1", "h1"));
  assert.equal(state.repetitionEpochStart, 15);
  assert.deepEqual(state.chaseFaults, [1, 0]);
  state = play(state, move("a4", "b4"));
  for (let ply = 17; ply <= 29; ply++) state = play(state, LOOP[(ply - 15) % 4]);
  ended(state, "chase_technical_fouls", 1);
  assert.equal(state.ply, 29);
});

test("R2-03C nhiều cặp hoãn: mất một cặp chưa mở phase; mất hết mới mở, nước chạy không xóa", () => {
  let state = fixture({ c2: red("cannon"), b2: red("pawn"), f2: red("pawn"),
    a2: black("horse"), h2: black("horse"), h4: black("pawn") });
  const loop = [move("c2", "d2"), move("h4", "g4"), move("d2", "c2"), move("g4", "h4")];
  for (let i = 0; i < 8; i++) state = play(state, loop[i % 4]);
  assert.equal(state.repetitionChase.pairs.length, 2);
  state = play(state, loop[0]);
  state = play(state, move("a2", "a3"));
  assert.equal(state.repetitionChase.pairs.length, 2, "Fleeing reply does not end the attacker's run");
  state = play(state, loop[2]);
  assert.equal(state.repetitionChase.pairs.length, 1);
  assert.equal(state.repetitionEpochStart, 0);
  state = play(state, move("h4", "g4"));
  state = play(state, move("c2", "c1"));
  assert.equal(state.repetitionEpochStart, 13);
  assert.equal(state.repetitionChase, null);
});

for (const [name, extra, reply, action] of [
  ["lật", { h4: red("pawn", true) }, LOOP[1], flip("h4")],
  ["ăn", {}, move("a4", "b4"), move("c2", "c3")],
]) test(`R2-03C ${name} ngắt đoạn đã hoãn: reset quiet hợp lệ, giữ lỗi/lịch sử`, () => {
  let state = cycle(elephantLoopStart(extra), 13);
  state = play(state, reply);
  const counts = structuredClone(state.positionCounts);
  state = play(state, action);
  assert.equal(state.repetitionEpochStart, 15);
  assert.equal(state.repetitionChase, null);
  assert.deepEqual(state.chaseFaults, [1, 0]);
  assert.equal(state.noProgressPly, 0);
  assert.deepEqual(state.runs, [[], []]);
  for (const [key, value] of Object.entries(counts)) assert.equal(state.positionCounts[key], value);
});

test("R2-03C phase clone/JSON/invalid/public giả/hidden identity, không lộ metadata mới", () => {
  let a = elephantStart({ g4: red("rook", true), h4: black("pawn", true) });
  let b = structuredClone(a);
  [b.board[at("g4")], b.board[at("h4")]] = [b.board[at("h4")], b.board[at("g4")]];
  for (const action of ELEPHANT_BREAK) {
    a = play(a, action); b = play(b, action);
    assert.deepEqual(getPublicState(a), getPublicState(b));
    assert.deepEqual(getLegalActions(getPublicState(a), a.turn), getLegalActions(getPublicState(b), b.turn));
    assert.deepEqual(a.positionCounts, b.positionCounts);
    assert.deepEqual(a.positionLastPlies, b.positionLastPlies);
  }
  const saved = structuredClone(a), view = getPublicState(a);
  view.drawRepetitionCount = 99;
  assert.doesNotMatch(JSON.stringify(view), /repetitionEpochStart|repetitionChase|positionCounts|positionLastPlies/);
  for (const [player, action, error] of [[0, LOOP[0], "NOT_YOUR_TURN"],
    [1, { type: "pass" }, "INVALID_ACTION"], [1, move("b3", "h1"), "ILLEGAL_ACTION"]]) {
    assert.deepEqual(applyAction(a, player, action), { ok: false, error });
    assert.deepEqual(a, saved);
  }
  const copied = JSON.parse(JSON.stringify(a)); copied.orientation = "vertical"; copied.theme = "dark";
  assert.deepEqual(getPublicState(a), getPublicState(copied));
  assert.deepEqual(play(a, move("b3", "c3")), play(copied, move("b3", "c3")));
  const guarded = structuredClone(a);
  for (const key of ["color", "type"]) Object.defineProperty(guarded.board[at("h4")], key,
    { get() { throw new Error(`Hidden read: ${key}`); } });
  assert.deepEqual(getPublicState(guarded), getPublicState(a));
  const pending = cycle(elephantLoopStart(), 8), original = structuredClone(pending);
  const next = play(pending, LOOP[0]);
  next.repetitionChase.pairs[0].attackerId = "changed";
  next.repetitionEpochStart = 999;
  assert.deepEqual(pending, original);
});

test("R2-03C legacy đang hoãn có chứng cứ hiện tại thì nhận diện được; Ván mới/game over giữ chuẩn", () => {
  let state = ELEPHANT_BREAK.slice(0, 18).reduce(play, elephantStart());
  state = structuredClone(state);
  delete state.repetitionEpochStart; delete state.repetitionChase;
  for (const action of ELEPHANT_BREAK.slice(18)) state = play(state, action);
  assert.equal(state.status, "playing");
  assert.equal(state.repetitionEpochStart, 19);
  assert.equal(getPublicState(state).drawRepetitionCount, 1);
  const endedState = repeatedBreaks(60), saved = structuredClone(endedState);
  for (const player of [0, 1, -1]) {
    assert.deepEqual(getLegalActions(getPublicState(endedState), player), []);
    assert.deepEqual(applyAction(endedState, player, LOOP[0]), { ok: false, error: "GAME_OVER" });
  }
  assert.deepEqual(endedState, saved);
  const fresh = createGame();
  assert.equal(fresh.repetitionEpochStart, 0);
  assert.equal(fresh.repetitionChase, null);
  assert.equal(getPublicState(fresh).drawRepetitionCount, 1);
});

test("R2-03C đổi người/màu: cùng mốc 19/21 và lỗi 33/47, không phạt người chạy", () => {
  for (const [player, color] of [[0, "black"], [1, "red"], [1, "black"]]) {
    let state = elephantStart();
    if (color === "black") {
      for (const p of [...state.board.filter(Boolean), ...state.captured]) {
        p.color = p.color === "red" ? "black" : "red";
      }
    }
    state.turn = player;
    state.playerColors = player === 0 ? [color, color === "red" ? "black" : "red"]
      : [color === "red" ? "black" : "red", color];
    for (let ply = 1; ply <= 47; ply++) {
      state = play(state, ply <= 21 ? ELEPHANT_BREAK[ply - 1] : LOOP[(ply - 19) % 4]);
      const view = getPublicState(state);
      assert.equal(state.repetitionEpochStart, ply < 19 ? 0 : 19);
      assert.equal(state.noProgressPly, ply);
      assert.equal(view.chase.faults[1 - player], 0);
      if (ply >= 16 && ply <= 18) assert.equal(view.chase.drawDeferred[0].player, player);
      if (ply === 21) {
        assert.equal(view.repetitionCount, 3);
        assert.equal(view.drawRepetitionCount, 1);
        assert.equal(view.chase.runs[player][0].count, 1);
      }
      if (ply === 33) assert.equal(view.chase.faults[player], 1);
      if (ply < 47) assert.equal(state.status, "playing");
    }
    ended(state, "chase_technical_fouls", 1 - player);
    assert.equal(state.chaseFaults[player], 2);
  }
});

test("R2-03C sau mốc mới, hai bên cùng đuổi vẫn hòa ba lần, không phạt bên nào", () => {
  let state = fixture({ a1: red("cannon"), d1: red("pawn"), a4: red("advisor"),
    h1: black("cannon"), h4: black("horse") });
  const oneSide = [move("a1", "b1"), move("h4", "g4"), move("b1", "a1"), move("g4", "h4")];
  for (let i = 0; i < 8; i++) state = play(state, oneSide[i % 4]);
  assert.equal(getPublicState(state).chase.drawDeferred[0].player, 0);
  state = play(state, move("a4", "b4"));
  assert.equal(state.repetitionEpochStart, 9);
  const bothSides = [move("h1", "g1"), move("a1", "b1"), move("g1", "h1"), move("b1", "a1")];
  for (let i = 0; i < 8; i++) {
    state = play(state, bothSides[i % 4]);
    assert.equal(state.repetitionEpochStart, 9);
    if (i < 7) assert.equal(state.status, "playing");
  }
  ended(state, "threefold_repetition");
  assert.equal(state.ply, 17);
  assert.equal(getPublicState(state).drawRepetitionCount, 3);
  assert.deepEqual(state.chaseFaults, [0, 0]);
  assert.deepEqual(state.runs.map((list) => list.map((r) => r.count)), [[4], [4]]);
  assert.deepEqual(reasons(state), []);
});

test("R2-03C cặp hoãn đã mất rồi trở lại không được nối lại để trì hoãn mốc mới", () => {
  let state = fixture({ c2: red("cannon"), b2: red("pawn"), f2: red("pawn"),
    a2: black("horse"), h2: black("horse"), h4: black("pawn") });
  const loop = [move("c2", "d2"), move("h4", "g4"), move("d2", "c2"), move("g4", "h4")];
  for (let i = 0; i < 8; i++) state = play(state, loop[i % 4]);
  assert.equal(state.repetitionChase.pairs.length, 2);
  state = play(state, loop[0]);
  state = play(state, move("a2", "a3"));
  state = play(state, loop[2]);
  assert.equal(state.repetitionChase.pairs.length, 1);
  const remaining = structuredClone(state.repetitionChase);
  state = play(state, move("a3", "a2"));
  state = play(state, loop[0]);
  assert.equal(state.runs[0].length, 2);
  assert.deepEqual(state.repetitionChase, remaining);
  assert.equal(state.repetitionEpochStart, 0);
  state = play(state, move("h2", "h3"));
  state = play(state, loop[2]);
  assert.equal(state.status, "playing");
  assert.equal(state.repetitionEpochStart, 15);
  assert.equal(state.repetitionChase, null);
  assert.equal(runs(state)[0].targetAt, "a2");
  assert.equal(runs(state)[0].count, 1, "The first fault at ply 13 reset all counts, including the returning pair");
  assert.equal(state.runs[0][0].startPly, 13);
  assert.equal(getPublicState(state).drawRepetitionCount, 1);
  assert.equal(state.noProgressPly, 15);
  assert.deepEqual(state.chaseFaults, [1, 0]);
});

test("7 lần đuổi qua thế mới: lỗi đầu ply 13 không cần lặp", () => {
  let state = fixture({ a1: red("general"), b2: black("advisor") });
  const files = "abcdefgh";
  for (let i = 0; i < 7; i++) {
    state = play(state, move(`${files[i]}1`, `${files[i + 1]}1`));
    assert.equal(getPublicState(state).repetitionCount, 1);
    if (i < 6) state = play(state, move(`${files[i + 1]}2`, `${files[i + 2]}2`));
  }
  assert.equal(state.ply, 13);
  assert.equal(state.status, "playing");
  assert.deepEqual(state.chaseFaults, [1, 0]);
});

test("Warning khớp phân xử MỌI action cơ bản ở trước lỗi 1 và lỗi 2", () => {
  for (const ply of [12, 26]) {
    const state = cycle(c1(), ply);
    const view = getPublicState(state), saved = structuredClone(state);
    for (const action of getLegalActions(view, state.turn)) {
      const warning = view.chase.warnings.find((w) => JSON.stringify(w.action) === JSON.stringify(action));
      const next = play(state, action);
      const faultAdded = next.chaseFaults[0] - state.chaseFaults[0];
      assert.equal(faultAdded, warning ? 1 : 0, JSON.stringify(action));
      if (warning) {
        assert.equal(next.chaseFaults[0], warning.nextFault);
        assert.equal(next.result?.reason === "chase_technical_fouls", warning.losesGame);
        assert.deepEqual(warning.pairs.map(({ attackerId, targetId }) => ({ attackerId, targetId })),
          next.runs[0].map(({ attackerId, targetId }) => ({ attackerId, targetId })));
      }
    }
    assert.deepEqual(state, saved);
  }
});

test("Hoán đổi danh tính úp: cùng IDs/legal/runs/warning/hold/kết quả qua đủ 27 ply", () => {
  let a = c1({ g4: red("rook", true), h4: black("pawn", true) }, { noProgressPly: 59 });
  let b = structuredClone(a);
  [b.board[at("g4")], b.board[at("h4")]] = [b.board[at("h4")], b.board[at("g4")]];
  for (let ply = 0; ply <= 27; ply++) {
    const av = getPublicState(a), bv = getPublicState(b);
    assert.deepEqual(av, bv);
    assert.deepEqual(a.positionCounts, b.positionCounts);
    assert.deepEqual(a.positionLastPlies, b.positionLastPlies);
    for (const player of [0, 1]) assert.deepEqual(getLegalActions(av, player), getLegalActions(bv, player));
    for (const square of ["g4", "h4"]) assert.deepEqual(av.board[at(square)], { occupied: true, faceDown: true });
    if (ply === 27) break;
    a = play(a, LOOP[ply % 4]); b = play(b, LOOP[ply % 4]);
  }
  ended(a, "chase_technical_fouls", 1);
  ended(b, "chase_technical_fouls", 1);
});

test("Getter hidden type/color không bị đọc khi tính warnings, ngoại lệ, public và legal", () => {
  const state = structuredClone(cycle(c1({ h4: black("pawn", true) }, { noProgressPly: 59 }), 12));
  const expected = getPublicState(state);
  for (const property of ["type", "color"]) Object.defineProperty(state.board[at("h4")], property,
    { get() { throw new Error(`Secret read: ${property}`); }, enumerable: true });
  assert.deepEqual(getPublicState(state), expected);
  assert.deepEqual(expected.chase.warnings.map((w) => w.action), [move("b2", "c2"), move("b2", "b3")]);
  const view = getPublicState(state);
  view.board[at("h4")] = state.board[at("h4")];
  assert.deepEqual(getLegalActions(view, 0), getLegalActions(expected, 0));
  // Also exercise a trapped target: an occupied hidden square disables exemption.
  const trap = boundaryRuns(trapped({ h4: black("pawn", true) }), [["c2", "b3"]]);
  trap.board[at("h4")] = state.board[at("h4")];
  assert.ok(getPublicState(trap).chase.warnings.some((w) => w.action.to === "b2"));
});

test("IDs cấp theo thứ tự lật, không theo vị trí/bộ xáo; quân cùng loại tách biệt", () => {
  for (const random of [() => 0, () => 0.999]) {
    let state = createGame({ firstPlayer: 0, random });
    assert.ok(state.visibleIds.every((id) => id === null));
    state = play(state, flip("h4"));
    assert.equal(getPublicState(state).board[at("h4")].visibleId, "v1");
    state = play(state, flip("a1"));
    assert.equal(getPublicState(state).board[at("a1")].visibleId, "v2");
    assert.equal(state.nextVisibleId, 3);
  }
  let state = c1({ h3: black("advisor") });
  const initial = getPublicState(state);
  const pursuedId = initial.board[at("c3")].visibleId, otherId = initial.board[at("h3")].visibleId;
  assert.notEqual(pursuedId, otherId);
  state = cycle(state, 8);
  assert.equal(runs(state)[0].targetId, pursuedId);
  assert.equal(getPublicState(state).board[at("h3")].visibleId, otherId);
});

test("Bên bị đuổi ăn A: xóa cặp/hold, giữ lỗi, ID đã ăn không cấp lại", () => {
  let state = boundaryRuns(c1({ c1: black("pawn"), h4: red("rook", true) }, { noProgressPly: 59 }),
    [["b2", "c3"]], { count: 5, faults: 1 });
  const deadId = getPublicState(state).board[at("b2")].visibleId;
  state = play(state, LOOP[0]);
  const nextId = state.nextVisibleId;
  state = play(state, move("c1", "c2"));
  assert.deepEqual(state.runs, [[], []]);
  assert.deepEqual(state.chaseFaults, [1, 0]);
  assert.equal(state.noProgressPly, 0);
  assert.equal(state.quietDrawHold, null);
  assert.equal(state.visibleIds.includes(deadId), false);
  state = play(state, flip("h4"));
  assert.equal(getPublicState(state).board[at("h4")].visibleId, `v${nextId}`);
  assert.notEqual(getPublicState(state).board[at("h4")].visibleId, deadId);
});

test("Hold lấy giao cặp gốc: thu hẹp, không thêm lại cặp cũ khi nó trở lại", () => {
  let state = fixture({ a1: red("cannon"), d1: red("pawn"), b2: red("pawn"),
    h1: black("advisor"), b4: black("horse") }, { noProgressPly: 59 });
  state = play(state, move("a1", "b1"));
  assert.equal(state.quietDrawHold.pairs.length, 2);
  state = play(state, move("b4", "a4"));
  state = play(state, move("b1", "c1"));
  assert.equal(state.quietDrawHold.pairs.length, 1);
  const held = structuredClone(state.quietDrawHold);
  state = play(state, move("a4", "b4"));
  state = play(state, move("c1", "b1"));
  assert.equal(runs(state).length, 2);
  assert.deepEqual(state.quietDrawHold, held);
});

test("Hòa lặp hoãn không được lưu như nợ hòa tại thế mới khi bên đuổi dừng", () => {
  let state = cycle(c1(), 8);
  assert.equal(reasons(state).length, 1);
  state = play(state, move("b2", "a2"));
  assert.equal(state.status, "playing");
  assert.equal(getPublicState(state).repetitionCount, 1);
  assert.deepEqual(reasons(state), []);
});

test("Lỗi đầu vẫn ghi trước hòa khi cả hai bên đuổi ở counter 60", () => {
  let state = fixture({ a1: red("cannon"), d1: red("pawn"), h1: black("cannon") }, { noProgressPly: 58 });
  state = play(state, move("a1", "b1"));
  state = boundaryRuns(state, [["h1", "b1"]], { player: 1 });
  state = play(state, move("h1", "g1"));
  ended(state, "no_progress_60");
  assert.deepEqual(state.chaseFaults, [0, 1]);
});

test("Lỗi thứ hai ưu tiên hòa lặp lẫn 60 khi cả hai bên cùng đuổi", () => {
  let state = fixture({ a1: red("cannon"), d1: red("pawn"), h1: black("cannon") });
  const loop = [move("a1", "b1"), move("h1", "g1"), move("b1", "a1"), move("g1", "h1")];
  for (let i = 0; i < 7; i++) state = play(state, loop[i % 4]);
  // Boundary-only counters; three occurrence timestamps remain from real moves.
  state = boundaryRuns(state, [["g1", "a1"]], { player: 1, faults: 1 });
  state.noProgressPly = 59;
  assert.equal(getPublicState(state).chase.warnings.find((w) => w.action.to === "h1").losesGame, true);
  state = play(state, loop[3]);
  assert.equal(getPublicState(state).repetitionCount, 3);
  assert.equal(state.noProgressPly, 60);
  ended(state, "chase_technical_fouls", 0);
});

test("Ăn quân cuối không phải lần đuổi 7; hết nước được miễn cặp theo B4", () => {
  let state = boundaryRuns(fixture({ b2: red("general"), c2: black("advisor") }), [["b2", "c2"]], { faults: 1 });
  state = play(state, move("b2", "c2"));
  ended(state, "all_pieces_captured", 0);
  assert.deepEqual(state.chaseFaults, [1, 0]);
  assert.deepEqual(state.runs, [[], []]);
  state = boundaryRuns(fixture({ a1: black("pawn"), a2: red("advisor"), c1: red("rook") }, { noProgressPly: 59 }),
    [["c1", "a1"]], { faults: 1 });
  assert.equal(getPublicState(state).chase.warnings.some((w) => w.action.to === "b1"), false);
  state = play(state, move("c1", "b1"));
  ended(state, "no_legal_actions", 0);
  assert.deepEqual(state.chaseFaults, [1, 0]);
});

test("Invalid/ngoài lượt không đổi ply/ID/runs/fault/hold/warning", () => {
  const state = cycle(c1({}, { noProgressPly: 59 }), 12);
  const saved = structuredClone(state), view = getPublicState(state);
  for (const [player, action, error] of [
    [0, move("b2", "h2"), "ILLEGAL_ACTION"], [1, LOOP[1], "NOT_YOUR_TURN"],
    [2, LOOP[0], "INVALID_PLAYER"], [0, { ...LOOP[0], extra: true }, "INVALID_ACTION"],
    [0, { type: "pass" }, "INVALID_ACTION"], [0, flip("b2"), "ILLEGAL_ACTION"],
  ]) {
    assert.deepEqual(applyAction(freeze(state), player, action), { ok: false, error });
    assert.deepEqual(state, saved);
    assert.deepEqual(getPublicState(state), view);
  }
});

test("Sau lỗi 2: mọi action GAME_OVER, không event/mutation; mọi legal rỗng", () => {
  const state = freeze(cycle(c1(), 27)), saved = structuredClone(state);
  const view = freeze(getPublicState(state));
  for (const player of [0, 1, -1, 2, null, "0"]) {
    assert.deepEqual(getLegalActions(view, player), []);
    for (const action of [LOOP[0], flip("h4"), null, { type: "pass" }]) {
      assert.deepEqual(applyAction(state, player, action), { ok: false, error: "GAME_OVER" });
      assert.deepEqual(state, saved);
    }
  }
  assert.deepEqual(getPublicState(state), view);
});

test("Public/event allowlist và clone sâu: sửa counter/warning/hold không qua mặt engine", () => {
  const state = cycle(c1({ h4: black("pawn", true) }, { noProgressPly: 59 }), 26);
  const saved = structuredClone(state), view = getPublicState(state);
  assert.deepEqual(Object.keys(view.chase).sort(), ["drawDeferred", "faults", "runs", "warnings"]);
  assert.doesNotMatch(JSON.stringify(view), /startPly|nextVisibleId|positionLastPlies|positionCounts|quietDrawHold/);
  view.chase.faults[0] = 0;
  view.chase.runs[0][0].count = 0;
  view.chase.runs[0][0].attackerId = "forged";
  view.chase.drawDeferred[0].pairs[0].targetId = "forged";
  view.chase.warnings[0].action.to = "a4";
  view.chase.warnings[0].pairs[0].attackerId = "forged";
  view.chase.warnings[0].losesGame = false;
  assert.deepEqual(state, saved);
  const result = applyAction(state, 0, LOOP[2]);
  assert.equal(result.ok, true);
  ended(result.state, "chase_technical_fouls", 1);
  assert.deepEqual(Object.keys(result.event).sort(), ["captured", "from", "piece", "player", "to", "type"]);
  assert.doesNotMatch(JSON.stringify(result.event), /visibleId|fault|runs|chase|board/);
  result.state.runs[0][0].count = 999;
  result.state.quietDrawHold.pairs[0].attackerId = "changed";
  result.state.visibleIds[at("b2")] = "changed";
  result.state.chaseFaults[0] = 0;
  Object.values(result.state.positionLastPlies)[0].push(999);
  assert.deepEqual(state, saved);
});

test("JSON, UI metadata và đổi ID không thay khóa; last-three luôn tối đa 3", () => {
  let a = cycle(c1(), 12), b = JSON.parse(JSON.stringify(a));
  b.orientation = "vertical"; b.theme = "dark";
  b.visibleIds = b.visibleIds.map((id) => id === null ? null : `${id}x`);
  b.runs = b.runs.map((list) => list.map((r) => ({ ...r, attackerId: `${r.attackerId}x`, targetId: `${r.targetId}x` })));
  a = play(a, LOOP[0]); b = play(b, LOOP[0]);
  assert.deepEqual(a.positionCounts, b.positionCounts);
  assert.deepEqual(a.positionLastPlies, b.positionLastPlies);
  assert.deepEqual(a.chaseFaults, b.chaseFaults);
  assert.deepEqual(a.result, b.result);
  assert.ok(Object.values(a.positionLastPlies).every((plies) => plies.length <= 3));
  assert.deepEqual(Object.values(a.positionLastPlies).find((plies) => plies.includes(13)), [5, 9, 13]);
  assert.doesNotMatch(JSON.stringify(a.positionCounts), /visibleId|startPly|fault|vertical|dark|v1/);
  const saved = getPublicState(a);
  const themed = structuredClone(a); themed.theme = "light"; themed.orientation = "horizontal";
  assert.deepEqual(getPublicState(themed), saved);
});

test("Hai Xe cùng loại đổi chỗ bằng nước thật: ID đổi ô nhưng vẫn cùng khóa lặp", () => {
  let state = fixture({ a1: red("rook"), b2: red("rook"), h4: black("horse") });
  const initialId = getPublicState(state).board[at("a1")].visibleId;
  const swap = [move("a1", "a2"), move("h4", "g4"), move("b2", "b1"), move("g4", "h4"),
    move("a2", "b2"), move("h4", "g4"), move("b1", "a1"), move("g4", "h4")];
  for (const action of swap) state = play(state, action);
  assert.equal(getPublicState(state).board[at("b2")].visibleId, initialId);
  assert.notEqual(getPublicState(state).board[at("a1")].visibleId, initialId);
  assert.equal(getPublicState(state).repetitionCount, 2);
  for (const action of swap) state = play(state, action);
  ended(state, "threefold_repetition");
  assert.equal(getPublicState(state).repetitionCount, 3);
});

test("Legacy không bịa lịch sử chase; ván mới reset toàn bộ metadata", () => {
  const legacy = structuredClone(cycle(c1(), 12));
  for (const key of ["ply", "visibleIds", "nextVisibleId", "runs", "chaseFaults", "positionLastPlies", "quietDrawHold", "repetitionEpochStart", "repetitionChase"]) delete legacy[key];
  const view = getPublicState(legacy);
  assert.deepEqual(view.chase, { faults: [0, 0], runs: [[], []], drawDeferred: [], warnings: [] });
  const next = play(legacy, LOOP[0]);
  assert.equal(next.ply, 1);
  assert.equal(next.runs[0][0].count, 1);
  assert.deepEqual(next.chaseFaults, [0, 0]);
  // Old frequency counts survive; unknown old timestamps cannot prove guilt.
  ended(next, "threefold_repetition");
  const fresh = createGame({ firstPlayer: 0, random: () => 0.25 });
  assert.equal(fresh.ply, 0);
  assert.equal(fresh.nextVisibleId, 1);
  assert.ok(fresh.visibleIds.every((id) => id === null));
  assert.deepEqual(fresh.runs, [[], []]);
  assert.deepEqual(fresh.chaseFaults, [0, 0]);
  assert.equal(fresh.quietDrawHold, null);
  assert.deepEqual(Object.values(fresh.positionLastPlies), [[0]]);
});

for (const [name, attacker, target, square, expected] of [
  ["Tướng/Sĩ kề", "general", "advisor", "c3", 1],
  ["Tướng/Sĩ chéo", "general", "advisor", "d3", 0],
  ["Tướng không ăn Tốt", "general", "pawn", "c3", 0],
  ["Tốt ăn Tướng", "pawn", "general", "c3", 1],
  ["Tốt không ăn Mã", "pawn", "horse", "c3", 0],
  ["Mã ăn Pháo", "horse", "cannon", "c3", 1],
]) test(`Đe dọa dùng luật ăn thật: ${name}`, () => {
  const state = play(fixture({ b2: red(attacker), [square]: black(target) }), move("b2", "c2"));
  assert.equal(runs(state).length, expected);
});

for (const [name, extras, target, expected] of [
  ["một ngòi đỏ", { d1: red("pawn") }, black("general"), 1],
  ["một ngòi đen", { d1: black("pawn") }, black("general"), 1],
  ["ngòi úp", { d1: red("horse", true) }, black("general"), 1],
  ["không ngòi", {}, black("general"), 0],
  ["hai ngòi", { d1: red("pawn"), f1: black("pawn") }, black("general"), 0],
  ["đích úp", { d1: red("pawn") }, black("general", true), 0],
  ["đích đồng minh", { d1: red("pawn") }, red("general"), 0],
]) test(`Pháo truy đuổi: ${name}`, () => {
  const state = play(fixture({ a1: red("cannon"), h1: target, h4: black("advisor"), ...extras }), move("a1", "b1"));
  assert.equal(runs(state).filter((r) => r.targetAt === "h1").length, expected);
});

test("Pháo kề không đuổi; di chuyển ngòi cho Pháo khác không tính đuổi", () => {
  assert.equal(runs(play(fixture({ a1: red("cannon"), c1: black("pawn") }), move("a1", "b1"))).length, 0);
  const state = play(fixture({ a1: red("cannon"), d2: red("pawn"), h1: black("general") }), move("d2", "d1"));
  assert.equal(runs(state).length, 0);
});

test("Nhiều đích độc lập; Pháo còn đe dọa cũ vẫn nối cặp dù địch đi quân khác", () => {
  let state = fixture({ a1: red("cannon"), d1: red("pawn"), b2: red("pawn"), c2: red("pawn"),
    h1: black("advisor"), b4: black("horse") });
  state = play(state, move("a1", "b1"));
  assert.equal(runs(state).length, 2);
  const kept = runs(state).find((r) => r.targetAt === "h1");
  state = play(state, move("b4", "a4"));
  assert.equal(runs(state).length, 2, "Opponent quiet action preserves attacker runs");
  state = play(state, move("b1", "c1"));
  assert.equal(runs(state).length, 1);
  assert.equal(runs(state)[0].targetId, kept.targetId);
  assert.equal(runs(state)[0].count, 2);
});

test("Hai cặp đồng thời đạt 7: chỉ một lỗi; reset mọi count, giữ pair/startPly", () => {
  const state = boundaryRuns(fixture({ b2: red("general"), c1: black("advisor"), c3: black("advisor"),
    d2: black("horse"), h4: red("pawn", true) }), [["b2", "c1"], ["b2", "c3"], ["b2", "d2"]]);
  state.runs[0][2].count = 2;
  const warning = getPublicState(state).chase.warnings.find((w) => w.action.to === "c2");
  assert.equal(warning.pairs.length, 2);
  const next = play(state, move("b2", "c2"));
  assert.deepEqual(next.chaseFaults, [1, 0]);
  assert.equal(next.runs[0].length, 3);
  assert.ok(next.runs[0].every((r) => r.count === 0 && r.startPly === 0));
});

test("Đổi mục tiêu cùng loại hoặc đổi quân đuổi: cặp mới count 1, không lẫn ID", () => {
  let state = boundaryRuns(c1({ c1: black("advisor") }), [["b2", "c3"]]);
  state = play(state, move("b2", "b1"));
  assert.equal(runs(state)[0].targetAt, "c1");
  assert.equal(runs(state)[0].count, 1);
  assert.deepEqual(state.chaseFaults, [0, 0]);
  state = boundaryRuns(fixture({ a2: red("rook"), b2: red("rook"), c3: black("pawn") }), [["a2", "c3"]]);
  state = play(state, move("b2", "c2"));
  assert.equal(runs(state)[0].count, 1);
  assert.equal(runs(state)[0].attackerAt, "c2");
  assert.deepEqual(state.chaseFaults, [0, 0]);
});

const trapped = (extra = {}) => fixture({ c2: red("general"), b3: black("advisor"),
  a3: black("pawn"), c3: black("pawn"), b4: black("pawn"), ...extra });
for (const [name, extra, expected] of [
  ["không có phản hồi cứu", {}, 0],
  ["Xe b1 không ăn được Tướng", { b1: black("rook") }, 0],
  ["Tốt b1 có thể ăn Tướng", { b1: black("pawn") }, 1],
  ["còn quân úp không kết luận", { h4: red("pawn", true) }, 1],
]) test(`Ngoại lệ một ply: ${name}`, () => {
  const before = boundaryRuns(trapped(extra), [["c2", "b3"]]);
  const warning = getPublicState(before).chase.warnings.find((w) => w.action.to === "b2");
  assert.equal(Boolean(warning), Boolean(expected));
  const after = play(before, move("c2", "b2"));
  assert.equal(after.chaseFaults[0], expected);
  assert.equal(runs(after).filter((r) => r.targetAt === "b3").length, expected);
  assert.equal(after.status, "playing");
});

test("Cứu mục tiêu bị chặn bằng quân khác dời ngòi Pháo", () => {
  // h1 is boxed by g1/h2. Only the black pawn g1 can remove the screen.
  const before = fixture({ a1: red("cannon"), g1: black("pawn"), h1: black("horse"), h2: red("advisor") });
  const after = play(before, move("a1", "b1"));
  assert.ok(runs(after).some((r) => r.targetAt === "h1"));
  assert.equal(getLegalActions(getPublicState(after), 1).filter((a) => a.from === "h1").length, 0);
  assert.ok(getLegalActions(getPublicState(after), 1).some((a) => a.from === "g1" && a.to === "g2"));
});

test("Đích được bảo vệ vẫn bị đuổi nếu có nước cứu một ply", () => {
  const after = play(c1({ d3: black("general") }), LOOP[0]);
  assert.equal(runs(after)[0].targetAt, "c3");
});

test("Hai bên Pháo cùng đuổi vẫn hòa ba lần ply 8", () => {
  let state = fixture({ a1: red("cannon"), d1: red("pawn"), h1: black("cannon") });
  const loop = [move("a1", "b1"), move("h1", "g1"), move("b1", "a1"), move("g1", "h1")];
  for (let i = 0; i < 8; i++) state = play(state, loop[i % 4]);
  ended(state, "threefold_repetition");
  assert.ok(state.runs.every((r) => r.length === 1));
  assert.deepEqual(state.chaseFaults, [0, 0]);
});

test("Đe dọa rời rạc không đủ quy trách nhiệm trên toàn cửa sổ lặp", () => {
  let state = c1();
  // First return starts with a red move without a threat; second return is C1.
  for (const action of [move("b2", "a2"), move("c3", "b3"), move("a2", "b2"), move("b3", "c3")]) state = play(state, action);
  state = cycle(state, 4);
  ended(state, "threefold_repetition");
  assert.equal(state.runs[0][0].startPly, 3);
});

test("Cặp gốc liên tục vẫn hoãn khi có thêm một mục tiêu tạm thời", () => {
  const state = cycle(c1({ d2: black("horse") }), 8);
  assert.equal(state.status, "playing");
  assert.equal(getPublicState(state).chase.drawDeferred[0].player, 0);
  assert.equal(state.runs[0].find((r) => r.startPly === 1).count, 4);
});

test("59→60 tạo hold đúng bên; giữ counter thật tới lỗi 2, cả hai lý do hoãn công khai", () => {
  let state = c1({}, { noProgressPly: 59 });
  state = play(state, LOOP[0]);
  assert.equal(state.noProgressPly, 60);
  assert.equal(state.quietDrawHold.player, 0);
  const held = structuredClone(state.quietDrawHold);
  state = cycle(state, 12, 1);
  assert.equal(state.noProgressPly, 72);
  assert.deepEqual(state.quietDrawHold, held);
  assert.deepEqual(state.chaseFaults, [1, 0]);
  assert.deepEqual(reasons(state), ["threefold_repetition", "no_progress_60"]);
  state = cycle(state, 14, 13);
  ended(state, "chase_technical_fouls", 1);
  assert.equal(state.noProgressPly, 86);
});

for (const [name, extra, action, newRuns] of [
  ["dừng đuổi", {}, move("c2", "d2"), 0],
  ["đổi sang mục tiêu mới", { d1: black("horse") }, move("c2", "d2"), 1],
]) test(`Hold 60 không gia hạn khi ${name}`, () => {
  let state = cycle(c1(extra, { noProgressPly: 59 }), 2);
  state = play(state, action);
  ended(state, "no_progress_60");
  assert.equal(state.noProgressPly, 62);
  assert.equal(state.quietDrawHold, null);
  assert.equal(state.runs[0].length, newRuns);
});

test("Hold không chuyển trách nhiệm khi bên kia cũng bắt đầu đuổi", () => {
  let state = cycle(c1({ h1: black("rook"), g2: red("pawn") }, { noProgressPly: 59 }), 1);
  const held = structuredClone(state.quietDrawHold);
  state = play(state, move("h1", "g1"));
  assert.ok(state.runs.every((r) => r.length > 0));
  assert.deepEqual(state.quietDrawHold, held);
  assert.equal(state.status, "playing");
});

test("Đúng 60 cả hai bên cùng có run: hòa, không tạo hold", () => {
  let state = fixture({ a1: red("cannon"), d1: red("pawn"), h1: black("cannon") }, { noProgressPly: 58 });
  state = play(state, move("a1", "b1"));
  state = play(state, move("h1", "g1"));
  ended(state, "no_progress_60");
  assert.equal(state.quietDrawHold, null);
});

for (const [name, extra, action] of [
  ["lật", { h4: red("pawn", true) }, flip("h4")],
  ["ăn", { h1: black("rook") }, move("c2", "c3")],
]) test(`Tiến triển ${name}: reset cả hai runs/hold/quiet, giữ lỗi 1`, () => {
  let state = cycle(c1(extra, { noProgressPly: 59 }), 13);
  // Defender uses a spare reply, leaving c3 available for a real capture.
  state = play(state, name === "ăn" ? move("h1", "g1") : LOOP[1]);
  state = play(state, action);
  assert.equal(state.noProgressPly, 0);
  assert.deepEqual(state.runs, [[], []]);
  assert.equal(state.quietDrawHold, null);
  assert.deepEqual(state.chaseFaults, [1, 0]);
});
