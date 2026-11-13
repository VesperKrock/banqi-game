"use strict";

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createGame, getPublicState, getLegalActions, applyAction;
before(async () => ({ createGame, getPublicState, getLegalActions, applyAction } = await import("../js/engine.mjs")));

const COUNTS = { general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 };
const at = (square) => (Number(square[1]) - 1) * 8 + "abcdefgh".indexOf(square[0]);
const piece = (color, type, faceDown = false) => ({ color, type, faceDown });
const move = (from, to) => ({ type: "move", from, to });
const flip = (position) => ({ type: "flip", at: position });

// Test-owned late-game positions: absent pieces go into captured so each color
// still totals 16. Never pre-fill a result. Empty history starts at this position.
function fixture(entries, { turn = 0, playerColors = ["red", "black"], noProgressPly = 0 } = {}) {
  const board = Array(32).fill(null);
  for (const [square, p] of Object.entries(entries)) board[at(square)] = structuredClone(p);
  const captured = [];
  for (const color of ["red", "black"]) {
    for (const [type, count] of Object.entries(COUNTS)) {
      const remaining = board.filter((p) => p?.color === color && p.type === type).length;
      assert.ok(remaining <= count, `Invalid fixture: ${color} ${type}`);
      for (let i = remaining; i < count; i += 1) captured.push({ color, type });
    }
  }
  return { board, turn, playerColors: [...playerColors], captured,
    status: "playing", result: null, noProgressPly, positionCounts: {} };
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function play(state, action) {
  const saved = structuredClone(state);
  freeze(state);
  const result = applyAction(state, state.turn, freeze(action));
  assert.equal(result.ok, true, JSON.stringify(action));
  assert.deepEqual(state, saved, "No mutation, including counters/history/result");
  assert.equal(result.state.turn, 1 - state.turn);
  return result.state;
}

function assertPlaying(state) {
  assert.equal(state.status, "playing");
  assert.equal(state.result, null);
  assert.equal(getPublicState(state).status, "playing");
}

function assertFinished(state, outcome, winner, reason) {
  assert.equal(state.status, "finished");
  const result = { outcome, winner, reason };
  assert.deepEqual(state.result, result);
  const publicState = getPublicState(state);
  assert.equal(publicState.status, "finished");
  assert.deepEqual(publicState.result, result);
  assert.notStrictEqual(publicState.result, state.result);
}

const LOOP = [move("a1", "b1"), move("h4", "g4"), move("b1", "a1"), move("g4", "h4")];
const loopStart = (extra = {}, options) => fixture({ a1: piece("red", "rook"), h4: piece("black", "rook"), ...extra }, options);
const blockade = (extra = {}, options) => fixture({ a1: piece("black", "pawn"), b1: piece("red", "advisor"),
  a2: piece("red", "elephant"), h4: piece("red", "rook"), ...extra }, options);
const run = (state, actions) => actions.reduce(play, state);

// Cycles of 8 and 10 squares in disjoint areas: the whole position repeats only
// after 80 plies, so this tests the 60-ply rule without an earlier threefold draw.
const RED_ROUTE = ["a1", "b1", "c1", "c2", "c3", "b3", "a3", "a2"];
const BLACK_ROUTE = ["e1", "f1", "g1", "h1", "h2", "h3", "g3", "f3", "e3", "e2"];
function longQuietGame(plies) {
  let state = fixture({ a1: piece("red", "pawn"), e1: piece("black", "pawn") });
  for (let step = 0; step < plies; step += 1) {
    const route = step % 2 === 0 ? RED_ROUTE : BLACK_ROUTE;
    const index = Math.floor(step / 2) % route.length;
    state = play(state, move(route[index], route[(index + 1) % route.length]));
    assert.equal(state.noProgressPly, step + 1);
    assert.equal(getPublicState(state).repetitionCount, 1);
    if (step < 59) assertPlaying(state);
  }
  return state;
}

test("Ván mới đang chơi, đếm 0 ply và ghi vị trí ban đầu đúng một lần", () => {
  const state = createGame({ firstPlayer: 0, random: () => 0.25 });
  assertPlaying(state);
  assert.equal(state.noProgressPly, 0);
  assert.deepEqual(Object.values(state.positionCounts), [1]);
  const view = getPublicState(state);
  assert.equal(view.repetitionCount, 1);
  assert.equal(view.noProgressPly, 0);
  assert.equal(Object.hasOwn(view, "positionCounts"), false);
  const next = play(state, flip("a1"));
  assertPlaying(next);
  assert.equal(next.noProgressPly, 0);
  assert.equal(getPublicState(next).repetitionCount, 1);
  assert.deepEqual(Object.values(next.positionCounts), [1, 1]);
});

for (const [player, own, enemy] of [[0, "red", "black"], [1, "black", "red"]]) {
  test(`Người ${player} ăn quân địch cuối: thắng hết quân trước cả điều kiện hết nước`, () => {
    const state = fixture({ a1: piece(own, "rook"), a2: piece(enemy, "pawn") }, { turn: player });
    assert.equal(state.captured.filter((p) => p.color === enemy).length, 15);
    const next = play(state, move("a1", "a2"));
    assertFinished(next, "win", player, "all_pieces_captured");
    assert.equal(next.captured.filter((p) => p.color === enemy).length, 16);
    assert.ok(next.board.every((p) => p === null || p.color !== enemy));
    assert.equal(next.noProgressPly, 0);
  });
}

test("Ăn Tướng không thắng nếu đối phương còn quân có hành động hợp lệ", () => {
  const next = play(fixture({ a1: piece("red", "pawn"), a2: piece("black", "general"), h4: piece("black", "pawn") }), move("a1", "a2"));
  assertPlaying(next);
  assert.ok(getLegalActions(getPublicState(next), 1).some((a) => a.type === "move" && a.from === "h4"));
});

test("Ăn hết quân địch đã lật chưa thắng khi còn một quân địch úp", () => {
  const next = play(fixture({ a1: piece("red", "rook"), a2: piece("black", "pawn"), h4: piece("black", "general", true) }), move("a1", "a2"));
  assertPlaying(next);
  assert.deepEqual(getLegalActions(getPublicState(next), 1), [flip("h4")]);
});

test("Quân úp của bên thắng không cản thắng khi đủ 16 quân địch đã bị ăn", () => {
  const next = play(fixture({ a1: piece("red", "rook"), a2: piece("black", "pawn"), h4: piece("red", "horse", true) }), move("a1", "a2"));
  assertFinished(next, "win", 0, "all_pieces_captured");
  assert.deepEqual(getPublicState(next).board[at("h4")], { occupied: true, faceDown: true });
});

test("Đối thủ còn quân nhưng hết flip/move/capture thì thua, không hòa stalemate", () => {
  const next = play(blockade(), move("h4", "g4"));
  assert.ok(next.board.some((p) => p?.color === "black"));
  assertFinished(next, "win", 0, "no_legal_actions");
});

test("Còn quân úp bất kỳ để lật thì không thua vì hết nước", () => {
  for (const color of ["red", "black"]) {
    const next = play(blockade({ h1: piece(color, "pawn", true) }), move("h4", "g4"));
    assertPlaying(next);
    assert.deepEqual(getLegalActions(getPublicState(next), 1), [flip("h1")]);
  }
});

test("Chỉ còn một nước ăn Tướng bằng Tốt vẫn tiếp tục", () => {
  const next = play(blockade({ b1: piece("red", "general") }), move("h4", "g4"));
  assertPlaying(next);
  assert.deepEqual(getLegalActions(getPublicState(next), 1), [move("a1", "b1")]);
});

test("Còn một nước đi ô trống thì không bị xử hết hành động", () => {
  const state = fixture({ a1: piece("black", "pawn"), a2: piece("red", "elephant"), h4: piece("red", "rook") });
  const next = play(state, move("h4", "g4"));
  assertPlaying(next);
  assert.deepEqual(getLegalActions(getPublicState(next), 1), [move("a1", "b1")]);
});

test("59 nửa-lượt thực vẫn chơi; đúng 60 hòa, không đợi 120", () => {
  const at59 = longQuietGame(59);
  assertPlaying(at59);
  assert.equal(at59.noProgressPly, 59);
  assert.equal(Object.keys(at59.positionCounts).length, 60);
  const at60 = play(at59, move("e2", "e1"));
  assertFinished(at60, "draw", null, "no_progress_60");
  assert.equal(at60.noProgressPly, 60);
  assert.equal(getPublicState(at60).repetitionCount, 1);
  assert.equal(Object.keys(at60.positionCounts).length, 61);
});

test("Hai nước đi yên tăng 1 mỗi ply; lật đặt về 0", () => {
  let state = loopStart({ d2: piece("black", "pawn", true) });
  state = run(state, LOOP.slice(0, 2));
  assert.equal(state.noProgressPly, 2);
  const next = play(state, flip("d2"));
  assertPlaying(next);
  assert.equal(next.noProgressPly, 0);
  assert.equal(getPublicState(next).repetitionCount, 1);
});

test("Hai nước đi yên tăng 1 mỗi ply; ăn quân đặt về 0", () => {
  let state = loopStart({ c1: piece("black", "pawn") });
  state = run(state, LOOP.slice(0, 2));
  assert.equal(state.noProgressPly, 2);
  const next = play(state, move("b1", "c1"));
  assertPlaying(next);
  assert.equal(next.noProgressPly, 0);
  assert.equal(getPublicState(next).repetitionCount, 1);
});

test("Lật/ăn ở bộ đếm 59 reset về 0, không phát hòa 60 trước khi xét tiến triển", () => {
  for (const [entries, action] of [
    [{ c2: piece("black", "pawn", true) }, flip("c2")],
    [{ a2: piece("black", "pawn") }, move("a1", "a2")],
  ]) {
    // Counter represents prior quiet plies; result is always computed by engine.
    const next = play(loopStart(entries, { noProgressPly: 59 }), action);
    assertPlaying(next);
    assert.equal(next.noProgressPly, 0);
  }
});

test("Nước sai không cộng ply/lặp, không đổi quân/lượt/result", () => {
  const state = freeze(run(loopStart(), LOOP));
  const original = structuredClone(state);
  assert.equal(getPublicState(state).repetitionCount, 2);
  for (const [player, action, error] of [
    [0, move("a1", "a3"), "ILLEGAL_ACTION"], [0, flip("a1"), "ILLEGAL_ACTION"],
    [1, move("h4", "g4"), "NOT_YOUR_TURN"], [0, { type: "pass" }, "INVALID_ACTION"],
    [0, move("a1", "i1"), "INVALID_ACTION"], [2, flip("a2"), "INVALID_PLAYER"],
  ]) {
    assert.deepEqual(applyAction(state, player, action), { ok: false, error });
    assert.deepEqual(state, original);
    assert.equal(getPublicState(state).repetitionCount, 2);
  }
});

test("Vị trí ban đầu lần 1, quay lại lần 2 vẫn chơi, lần 3 kết thúc ngay", () => {
  let state = loopStart();
  assert.equal(getPublicState(state).repetitionCount, 1);
  state = run(state, LOOP);
  assertPlaying(state);
  assert.equal(getPublicState(state).repetitionCount, 2);
  state = run(state, LOOP.slice(0, 3));
  assertPlaying(state);
  state = play(state, LOOP[3]);
  assertFinished(state, "draw", null, "threefold_repetition");
  assert.equal(getPublicState(state).repetitionCount, 3);
  assert.equal(state.noProgressPly, 8);
  assert.equal(Object.values(state.positionCounts).reduce((sum, count) => sum + count, 0), 9);
});

test("Lặp ba lần không cần cùng một chuỗi nước hoặc các lần xuất hiện liên tiếp", () => {
  let state = run(loopStart(), LOOP);
  assert.equal(getPublicState(state).repetitionCount, 2);
  state = run(state, [move("a1", "a2"), move("h4", "h3"), move("a2", "a1"), move("h3", "h4")]);
  assertFinished(state, "draw", null, "threefold_repetition");
  assert.equal(getPublicState(state).repetitionCount, 3);
  assert.equal(Object.keys(state.positionCounts).length, 7);
});

test("Đếm lặp giữ qua bản sao JSON, không dựa vào identity đối tượng", () => {
  let state = run(loopStart(), LOOP.slice(0, 2));
  state = JSON.parse(JSON.stringify(state));
  state = run(state, [...LOOP.slice(2), ...LOOP]);
  assertFinished(state, "draw", null, "threefold_repetition");
  assert.equal(getPublicState(state).repetitionCount, 3);
});

function keysAfterFlip(options, entries = {}) {
  const state = fixture({ a1: piece("red", "pawn", true), b1: piece("red", "rook"),
    h4: piece("black", "horse"), h3: piece("black", "rook"), ...entries }, options);
  return Object.keys(play(state, flip("a1")).positionCounts);
}

test("Khóa khác khi chỉ thay người đến lượt", () => {
  const a = keysAfterFlip({ turn: 0 });
  const b = keysAfterFlip({ turn: 1 });
  assert.equal(a.length, 2);
  assert.equal(b.length, 2);
  assert.equal(a.filter((key) => b.includes(key)).length, 0);
});

test("Khóa phân biệt ánh xạ màu và giai đoạn chưa phân màu", () => {
  const assigned = keysAfterFlip({ playerColors: ["red", "black"] });
  const opposite = keysAfterFlip({ playerColors: ["black", "red"] });
  const unassigned = keysAfterFlip({ playerColors: [null, null] });
  assert.equal(assigned.filter((key) => opposite.includes(key)).length, 0);
  // After the first flip both assignments agree, but their starting keys differ.
  assert.equal(assigned.filter((key) => unassigned.includes(key)).length, 1);
});

test("Khóa phân biệt vị trí ô, loại/màu đã lật và trạng thái úp/trống", () => {
  const base = keysAfterFlip();
  const variants = [
    { h4: null, g4: piece("black", "horse") },
    { h4: piece("black", "pawn") },
    { h4: piece("red", "horse") },
    { h4: piece("black", "horse", true) },
    { h4: null },
  ];
  for (const changes of variants) {
    const keys = keysAfterFlip(undefined, changes);
    assert.equal(base.filter((key) => keys.includes(key)).length, 0);
  }
});

test("Khóa bỏ qua orientation/theme/seed/ID/thời gian, bộ đếm và thứ tự quân đã ăn", () => {
  const a = loopStart({ d2: piece("red", "horse", true) });
  const b = structuredClone(a);
  b.orientation = "vertical";
  b.theme = "dark";
  b.seed = "PRIVATE_ONLY_SEED";
  b.timestamp = 12345;
  b.noProgressPly = 7;
  b.captured.reverse();
  b.board.forEach((p, i) => { if (p) p.secretId = `PRIVATE_ONLY_${i}`; });
  const afterA = play(a, LOOP[0]);
  const afterB = play(b, LOOP[0]);
  assert.deepEqual(afterA.positionCounts, afterB.positionCounts);
  assert.equal(getPublicState(afterA).repetitionCount, getPublicState(afterB).repetitionCount);
  assert.doesNotMatch(JSON.stringify(afterB.positionCounts), /PRIVATE_ONLY|vertical|dark|timestamp/);
});

test("Bố cục úp khác danh tính: cùng khóa, legal và public kể cả khi hòa xong", () => {
  let a = loopStart({ c2: piece("red", "horse", true), d2: piece("black", "general", true) });
  let b = structuredClone(a);
  [b.board[at("c2")], b.board[at("d2")]] = [b.board[at("d2")], b.board[at("c2")]];
  assert.notDeepEqual(a.board, b.board);
  for (const action of [...LOOP, ...LOOP]) {
    assert.deepEqual(getPublicState(a), getPublicState(b));
    for (const player of [0, 1]) assert.deepEqual(getLegalActions(getPublicState(a), player), getLegalActions(getPublicState(b), player));
    a = play(a, action);
    b = play(b, action);
    assert.deepEqual(a.positionCounts, b.positionCounts);
  }
  assertFinished(a, "draw", null, "threefold_repetition");
  assert.deepEqual(getPublicState(a), getPublicState(b));
  assert.equal(getPublicState(a).repetitionCount, 3);
});

test("Hai ván xáo khác nhau, cùng người đầu: khóa ban đầu giống nhau và không lộ danh tính", () => {
  const a = createGame({ firstPlayer: 0, random: () => 0 });
  const b = createGame({ firstPlayer: 0, random: () => 0.999999 });
  assert.notDeepEqual(a.board, b.board);
  assert.deepEqual(a.positionCounts, b.positionCounts);
  assert.deepEqual(getPublicState(a), getPublicState(b));
  assert.doesNotMatch(JSON.stringify(a.positionCounts), /red|black|general|pawn|seed|id/);
});

test("Thắng hết hành động ưu tiên hòa 60 ply", () => {
  const next = play(blockade({}, { noProgressPly: 59 }), move("h4", "g4"));
  assert.equal(next.noProgressPly, 60);
  assertFinished(next, "win", 0, "no_legal_actions");
});

test("Thắng ưu tiên lặp ba lần, ngay cả khi đồng thời đạt 60 ply", () => {
  const state = blockade({}, { noProgressPly: 59 });
  const action = move("h4", "g4");
  const probe = play(state, action);
  // Deliberately force overlapping conditions, not a reachable past game:
  // derive the destination key from a real transition, seed only its count,
  // and let a fresh applyAction compute the result. No pre-filled winner.
  const destinationKey = Object.keys(probe.positionCounts).at(-1);
  const prepared = structuredClone(state);
  prepared.positionCounts[destinationKey] = 2;
  const next = play(prepared, action);
  assert.equal(getPublicState(next).repetitionCount, 3);
  assert.equal(next.noProgressPly, 60);
  assertFinished(next, "win", 0, "no_legal_actions");
});

test("Thắng hết quân ưu tiên lặp ba lần", () => {
  const state = fixture({ a1: piece("red", "rook"), a2: piece("black", "pawn") });
  const action = move("a1", "a2");
  const probe = play(state, action);
  const prepared = structuredClone(state);
  prepared.positionCounts[Object.keys(probe.positionCounts).at(-1)] = 2;
  const next = play(prepared, action);
  assert.equal(getPublicState(next).repetitionCount, 3);
  assertFinished(next, "win", 0, "all_pieces_captured");
});

test("Lặp lần ba và 60 ply đồng thời: ưu tiên lặp, qua 60 nước hợp lệ thật", () => {
  let state = longQuietGame(52);
  assert.equal(state.board[at("c1")].color, "red");
  assert.equal(state.board[at("g3")].color, "black");
  const loop = [move("c1", "c2"), move("g3", "g4"), move("c2", "c1"), move("g4", "g3")];
  state = run(state, loop);
  assertPlaying(state);
  assert.equal(state.noProgressPly, 56);
  assert.equal(getPublicState(state).repetitionCount, 2);
  state = run(state, loop.slice(0, 3));
  assertPlaying(state);
  assert.equal(state.noProgressPly, 59);
  state = play(state, loop[3]);
  assert.equal(state.noProgressPly, 60);
  assert.equal(getPublicState(state).repetitionCount, 3);
  assertFinished(state, "draw", null, "threefold_repetition");
});

const terminalCases = {
  all_pieces_captured: () => play(fixture({ a1: piece("red", "rook"), a2: piece("black", "pawn") }), move("a1", "a2")),
  no_legal_actions: () => play(blockade(), move("h4", "g4")),
  threefold_repetition: () => run(loopStart(), [...LOOP, ...LOOP]),
  no_progress_60: () => longQuietGame(60),
};
for (const [reason, makeState] of Object.entries(terminalCases)) {
  test(`Sau ${reason}: mọi người không có legal, mọi action GAME_OVER, state bất biến`, () => {
    const state = freeze(makeState());
    const saved = structuredClone(state);
    const publicState = freeze(getPublicState(state));
    for (const player of [0, 1, -1, 2, "0", null, undefined]) {
      assert.deepEqual(getLegalActions(publicState, player), []);
      for (const action of [flip("a1"), move("a1", "b1"), move("h4", "g4"), { type: "pass" }, null]) {
        assert.deepEqual(applyAction(state, player, action), { ok: false, error: "GAME_OVER" });
        assert.deepEqual(state, saved);
      }
    }
    const forged = structuredClone(publicState);
    forged.status = "playing";
    forged.result = null;
    assert.deepEqual(applyAction(state, state.turn, flip("a1")), { ok: false, error: "GAME_OVER" });
    assert.deepEqual(state, saved);
  });
}

test("Public finished từ chối legal trước khi đọc bàn, không cần private state", () => {
  const snapshot = { status: "finished", get board() { throw new Error("Must not read board"); } };
  assert.deepEqual(getLegalActions(snapshot, 0), []);
  assert.deepEqual(getLegalActions(snapshot, 1), []);
});

test("Public sau game over chỉ có trường cho phép, không history/secret/nested metadata", () => {
  const state = play(fixture({ a1: piece("red", "rook"), a2: piece("black", "pawn"), h4: piece("red", "horse", true) }), move("a1", "a2"));
  state.seed = "PRIVATE_ONLY_ROOT";
  state.result.metadata = { id: "PRIVATE_ONLY_RESULT" };
  state.board[at("h4")].metadata = { secretId: "PRIVATE_ONLY_PIECE" };
  state.positionCounts.PRIVATE_ONLY_HISTORY = 99;
  const view = getPublicState(freeze(state));
  assert.deepEqual(Object.keys(view).sort(), ["board", "captured", "chase", "drawRepetitionCount", "noProgressPly", "playerColors", "repetitionCount", "result", "status", "turn"]);
  assert.deepEqual(view.board[at("h4")], { occupied: true, faceDown: true });
  assert.deepEqual(Object.keys(view.result).sort(), ["outcome", "reason", "winner"]);
  assert.doesNotMatch(JSON.stringify(view), /PRIVATE_ONLY|positionCounts|metadata|secretId/);
});

test("Result/counters public và bảng đếm state mới không có tham chiếu mutable tới state cũ", () => {
  const old = run(loopStart(), LOOP);
  const saved = structuredClone(old);
  const next = play(old, LOOP[0]);
  assert.notStrictEqual(next.positionCounts, old.positionCounts);
  const firstKey = Object.keys(next.positionCounts)[0];
  next.positionCounts[firstKey] = 999;
  assert.deepEqual(old, saved);
  const terminal = terminalCases.all_pieces_captured();
  const before = structuredClone(terminal);
  const publicA = getPublicState(terminal);
  const publicB = getPublicState(terminal);
  publicA.result.winner = 1;
  publicA.result.reason = "changed";
  publicA.status = "playing";
  publicA.noProgressPly = 999;
  publicA.repetitionCount = 999;
  assert.deepEqual(terminal, before);
  assert.deepEqual(publicB, getPublicState(terminal));
});

test("State R1-01 thiếu metadata vẫn dùng được; lịch sử biết được bắt đầu từ vị trí đó", () => {
  const state = loopStart();
  delete state.status;
  delete state.result;
  delete state.noProgressPly;
  delete state.positionCounts;
  const before = structuredClone(state);
  const view = getPublicState(state);
  assert.equal(view.status, "playing");
  assert.equal(view.result, null);
  assert.equal(view.noProgressPly, 0);
  assert.equal(view.repetitionCount, 1);
  const next = play(state, LOOP[0]);
  assertPlaying(next);
  assert.equal(next.noProgressPly, 1);
  assert.deepEqual(Object.values(next.positionCounts), [1, 1]);
  assert.deepEqual(state, before);
});
