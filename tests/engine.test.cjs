"use strict";

const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let createGame, getPublicState, getLegalActions, applyAction;
before(async () => ({ createGame, getPublicState, getLegalActions, applyAction } = await import("../js/engine.mjs")));

const TYPES = ["general", "advisor", "elephant", "rook", "horse", "cannon", "pawn"];
const COUNTS = { general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 };
const at = (square) => (Number(square[1]) - 1) * 8 + "abcdefgh".indexOf(square[0]);
const square = (index) => "abcdefgh"[index % 8] + (Math.floor(index / 8) + 1);
const piece = (color, type, faceDown = false) => ({ color, type, faceDown });
const flip = (position) => ({ type: "flip", at: position });
const move = (from, to) => ({ type: "move", from, to });

// Small fixtures are test-owned data, never a production setup/cheat API.
function fixture(entries = {}, { turn = 0, playerColors = ["red", "black"], captured = [] } = {}) {
  const board = Array(32).fill(null);
  for (const [position, value] of Object.entries(entries)) board[at(position)] = structuredClone(value);
  return { board, turn, playerColors: [...playerColors], captured: structuredClone(captured) };
}

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}

function checkAction(state, player, action, expected, error = "ILLEGAL_ACTION") {
  const original = structuredClone(state);
  freeze(state);
  const publicState = freeze(getPublicState(state));
  const listed = getLegalActions(publicState, player).some((candidate) =>
    JSON.stringify(candidate) === JSON.stringify(action));
  assert.equal(listed, expected, `Legal actions: ${JSON.stringify(action)}`);
  const result = applyAction(state, player, freeze(action));
  assert.equal(result.ok, expected, `Apply: ${JSON.stringify(action)}`);
  assert.deepEqual(state, original, "Input state must not mutate");
  if (expected) {
    assert.notStrictEqual(result.state, state);
    assert.equal(result.state.turn, 1 - player);
    assert.equal(result.state.board.length, 32);
  } else {
    assert.deepEqual(result, { ok: false, error });
  }
  return result;
}

test("Khởi tạo đủ 32 quân, 16 mỗi màu, đúng cơ cấu, tất cả úp", () => {
  const state = createGame();
  assert.equal(state.board.length, 32);
  assert.ok([0, 1].includes(state.turn));
  assert.deepEqual(state.playerColors, [null, null]);
  assert.deepEqual(state.captured, []);
  for (const color of ["red", "black"]) {
    const pieces = state.board.filter((p) => p.color === color);
    assert.equal(pieces.length, 16);
    for (const type of TYPES) assert.equal(pieces.filter((p) => p.type === type).length, COUNTS[type]);
  }
  assert.ok(state.board.every((p) => p.faceDown === true));
  assert.equal(new Set(state.board).size, 32, "No shared piece objects");
  assert.deepEqual(Object.keys(state).sort(), ["board", "captured", "noProgressPly", "playerColors", "positionCounts", "result", "status", "turn"]);
});

test("Nguồn random tái lập, ván độc lập, không lưu seed hay random trong state", () => {
  const a = createGame({ random: seeded(42) });
  const b = createGame({ random: seeded(42) });
  const c = createGame({ random: seeded(43) });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.board, c.board);
  a.board[0].faceDown = false;
  assert.equal(b.board[0].faceDown, true);
  assert.ok(!JSON.stringify(b).includes("seed"));
  assert.ok(!Object.values(b).some((value) => typeof value === "function"));
});

test("Chọn người đầu 0/1 theo hai nửa miền random; có thể chỉ định để test", () => {
  for (const [randomValue, player] of [[0, 0], [0.499999, 0], [0.5, 1], [0.999999, 1]]) {
    assert.equal(createGame({ random: () => randomValue }).turn, player);
  }
  for (const firstPlayer of [0, 1]) {
    let calls = 0;
    const state = createGame({ firstPlayer, random: () => { calls += 1; return 0; } });
    assert.equal(state.turn, firstPlayer);
    assert.equal(calls, 31, "Only Fisher–Yates consumes random when starter is explicit");
  }
});

test("Fisher–Yates bao gồm mọi vị trí chọn, không bỏ qua hai đầu miền", () => {
  const ordered = createGame({ firstPlayer: 0, random: () => 0.999999 }).board;
  for (let choice = 0; choice < 32; choice += 1) {
    let calls = 0;
    const { board } = createGame({ firstPlayer: 0, random: () => ++calls === 1 ? (choice + 0.25) / 32 : 0.999999 });
    assert.deepEqual(board[31], ordered[choice]);
    assert.deepEqual(board[choice], ordered[31]);
    for (let i = 0; i < 31; i += 1) if (i !== choice) assert.deepEqual(board[i], ordered[i]);
  }
  const rotated = createGame({ firstPlayer: 0, random: () => 0 }).board;
  assert.deepEqual(rotated, [...ordered.slice(1), ordered[0]]);
});

test("Từ chối options, người đầu hoặc nguồn random không hợp lệ", () => {
  for (const options of [null, [], 2, "0"]) assert.throws(() => createGame(options), TypeError);
  for (const firstPlayer of [-1, 2, "0", null, false, NaN]) assert.throws(() => createGame({ firstPlayer }), RangeError);
  assert.throws(() => createGame({ random: 1 }), TypeError);
  for (const value of [-0.1, 1, Infinity, NaN, "0.5", null, undefined]) {
    assert.throws(() => createGame({ random: () => value }), RangeError);
  }
});

test("Nước đầu chỉ có 32 lần lật; ngoài lượt không có hành động", () => {
  const state = createGame({ random: seeded(7), firstPlayer: 1 });
  const actions = getLegalActions(getPublicState(state), 1);
  assert.deepEqual(actions, Array.from({ length: 32 }, (_, i) => flip(square(i))));
  assert.deepEqual(getLegalActions(getPublicState(state), 0), []);
  checkAction(state, 1, move("a1", "b1"), false);
  for (const player of [-1, 2, "1", null, undefined, true, NaN]) {
    assert.deepEqual(getLegalActions(getPublicState(state), player), []);
    assert.deepEqual(applyAction(state, player, flip("a1")), { ok: false, error: "INVALID_PLAYER" });
  }
});

for (const firstPlayer of [0, 1]) {
  for (const color of ["red", "black"]) {
    test(`Lật đầu phân màu ${color} cho người ${firstPlayer}, chỉ mở một quân`, () => {
      const state = createGame({ random: seeded(4), firstPlayer });
      const index = state.board.findIndex((p) => p.color === color);
      const result = checkAction(state, firstPlayer, flip(square(index)), true);
      const colors = [];
      colors[firstPlayer] = color;
      colors[1 - firstPlayer] = color === "red" ? "black" : "red";
      assert.deepEqual(result.state.playerColors, colors);
      assert.equal(result.state.board.filter((p) => !p.faceDown).length, 1);
      assert.equal(result.state.board[index].faceDown, false);
      assert.deepEqual(result.event, { type: "flip", player: firstPlayer, at: square(index), piece: { color, type: state.board[index].type } });
      assert.equal(getLegalActions(getPublicState(result.state), firstPlayer).length, 0);
      checkAction(result.state, firstPlayer, flip("h4"), false, "NOT_YOUR_TURN");
    });
  }
}

test("Lật quân địch ở bất kỳ ô úp nào tốn lượt, không đổi màu hoặc cho quyền đi quân địch", () => {
  const state = fixture({ h4: piece("black", "horse", true), a1: piece("red", "pawn", true) });
  const first = checkAction(state, 0, flip("h4"), true);
  assert.deepEqual(first.state.playerColors, ["red", "black"]);
  const second = checkAction(first.state, 1, flip("a1"), true);
  assert.deepEqual(second.state.playerColors, ["red", "black"]);
  checkAction(second.state, 0, move("h4", "g4"), false);
  checkAction(second.state, 0, move("a1", "a2"), true);
});

const illegalMoves = [
  ["lật ô trống", flip("h1")],
  ["lật lại quân đã mở", flip("c2")],
  ["đi từ ô trống", move("h1", "g1")],
  ["đi quân úp", move("a1", "b1")],
  ["đi quân địch", move("h4", "g4")],
  ["đi chéo", move("c2", "d3")],
  ["đi quá một ô", move("c2", "e2")],
  ["ăn quân địch xa", move("c2", "h4")],
  ["đi vào quân mình", move("c2", "b2")],
  ["đi vào quân úp", move("c2", "c1")],
  ["đi tại chỗ", move("c2", "c2")],
];
for (const [name, action] of illegalMoves) {
  test(`Từ chối ${name}, giữ nguyên trạng thái và lượt`, () => {
    const state = fixture({ c2: piece("red", "rook"), b2: piece("red", "pawn"),
      a1: piece("red", "general", true), c1: piece("black", "horse", true), h4: piece("black", "rook") });
    checkAction(state, 0, action, false);
  });
}

test("Đi sai lượt bị từ chối, không thay đổi state", () => {
  checkAction(fixture({ c2: piece("red", "rook") }), 1, move("c2", "d2"), false, "NOT_YOUR_TURN");
});

test("Action sai cấu trúc/ngoài bàn/pass/chuỗi nước đều bị từ chối, không echo dữ liệu đầu vào", () => {
  const state = freeze(fixture({ a1: piece("red", "rook"), h4: piece("black", "pawn", true) }));
  const beforeState = structuredClone(state);
  const invalid = [null, undefined, false, "a1-b1", [], [flip("h4"), move("a1", "b1")], {},
    { type: "pass" }, { type: "capture", from: "a1", to: "b1" }, { type: "flip" },
    { type: "move", from: "a1" }, { ...flip("h4"), then: move("a1", "b1") },
    { ...move("a1", "b1"), privateNote: { value: "PRIVATE_ONLY" } },
    Object.create(flip("h4"))];
  for (const coordinate of ["a0", "a5", "i1", "A1", "a11", "a1\n", " a1", 0, null, {}, ["a1"]]) {
    invalid.push(flip(coordinate), move(coordinate, "b1"), move("a1", coordinate));
  }
  for (const action of invalid) {
    assert.deepEqual(applyAction(state, 0, action), { ok: false, error: "INVALID_ACTION" });
    assert.deepEqual(state, beforeState);
  }
});

for (const type of TYPES) {
  test(`${type}: đi một ô trống theo cả bốn hướng, không áp luật sông/cung/chân Mã`, () => {
    for (const [turn, color] of [[0, "red"], [1, "black"]]) {
      const state = fixture({ d2: piece(color, type) }, { turn });
      const actions = getLegalActions(getPublicState(state), turn);
      assert.deepEqual(actions.map((a) => a.to).sort(), ["c2", "d1", "d3", "e2"]);
      for (const destination of ["c2", "d1", "d3", "e2"]) {
        const result = checkAction(state, turn, move("d2", destination), true);
        assert.equal(result.state.board[at("d2")], null);
        assert.deepEqual(result.state.board[at(destination)], piece(color, type));
        assert.equal(result.event.captured, null);
      }
      checkAction(state, turn, move("d2", "d4"), false);
      checkAction(state, turn, move("d2", "e3"), false);
    }
  });
}

test("Biên bàn không nối h1 sang a2 hoặc a2 sang h1", () => {
  for (const [from, expected] of [["a1", ["a2", "b1"]], ["h1", ["g1", "h2"]], ["a4", ["a3", "b4"]], ["h4", ["g4", "h3"]]]) {
    const state = fixture({ [from]: piece("red", "general") });
    assert.deepEqual(getLegalActions(getPublicState(state), 0).map((a) => a.to).sort(), expected);
  }
  checkAction(fixture({ h1: piece("red", "rook") }), 0, move("h1", "a2"), false);
  checkAction(fixture({ a2: piece("red", "rook"), h1: piece("black", "pawn") }), 0, move("a2", "h1"), false);
});

// Independent capture table from the chosen rules, including the Cannon exception.
const ADJACENT_CAPTURES = {
  general: ["general", "advisor", "elephant", "rook", "horse", "cannon"],
  advisor: ["advisor", "elephant", "rook", "horse", "cannon", "pawn"],
  elephant: ["elephant", "rook", "horse", "cannon", "pawn"],
  rook: ["rook", "horse", "cannon", "pawn"],
  horse: ["horse", "cannon", "pawn"],
  cannon: [],
  pawn: ["general", "pawn"],
};
for (const attacker of TYPES) {
  for (const target of TYPES) {
    test(`Ăn kề ${attacker} → ${target}: ${ADJACENT_CAPTURES[attacker].includes(target) ? "được" : "cấm"}`, () => {
      for (const [turn, own, enemy] of [[0, "red", "black"], [1, "black", "red"]]) {
        for (const destination of ["c2", "d1", "d3", "e2"]) {
          const state = fixture({ d2: piece(own, attacker), [destination]: piece(enemy, target) }, { turn });
          const allowed = ADJACENT_CAPTURES[attacker].includes(target);
          const result = checkAction(state, turn, move("d2", destination), allowed);
          if (allowed) {
            assert.equal(result.state.board[at("d2")], null);
            assert.deepEqual(result.state.board[at(destination)], piece(own, attacker));
            assert.deepEqual(result.state.captured, [{ color: enemy, type: target }]);
            assert.deepEqual(result.event, { type: "move", player: turn, from: "d2", to: destination,
              piece: { color: own, type: attacker }, captured: { color: enemy, type: target } });
          }
        }
      }
    });
  }
}

test("Mọi loại quân đều không ăn quân mình hoặc quân úp, bất kể cấp", () => {
  for (const attacker of TYPES) {
    for (const target of TYPES) {
      for (const [color, faceDown] of [["red", false], ["red", true], ["black", true]]) {
        const state = fixture({ d2: piece("red", attacker), e2: piece(color, target, faceDown) });
        checkAction(state, 0, move("d2", "e2"), false);
      }
    }
  }
});

const CANNON_PATHS = [
  ["a1", "h1", "d1"], ["h1", "a1", "d1"], ["a1", "a4", "a2"], ["a4", "a1", "a2"],
];
for (const target of TYPES) {
  test(`Pháo ăn ${target} qua đúng một ngòi: bốn hướng, hai màu, ngòi úp/lật`, () => {
    for (const [turn, own, enemy] of [[0, "red", "black"], [1, "black", "red"]]) {
      for (const [from, to, screen] of CANNON_PATHS) {
        for (const screenColor of ["red", "black"]) {
          for (const faceDown of [true, false]) {
            const state = fixture({ [from]: piece(own, "cannon"), [to]: piece(enemy, target),
              [screen]: piece(screenColor, "horse", faceDown) }, { turn });
            const result = checkAction(state, turn, move(from, to), true);
            assert.deepEqual(result.state.board[at(screen)], state.board[at(screen)], "Screen stays untouched");
            assert.deepEqual(result.state.captured, [{ color: enemy, type: target }]);
            assert.equal(result.event.piece.type, "cannon");
            assert.deepEqual(Object.keys(result.event).sort(), ["captured", "from", "piece", "player", "to", "type"]);
          }
        }
      }
    }
  });
}

test("Pháo: mọi tổ hợp ngòi trên đường dài; không ngòi, hai ngòi hoặc nhiều hơn đều cấm", () => {
  for (const [from, to, between] of [
    ["a1", "h1", ["b1", "c1", "d1", "e1", "f1", "g1"]],
    ["h1", "a1", ["g1", "f1", "e1", "d1", "c1", "b1"]],
    ["c1", "c4", ["c2", "c3"]], ["c4", "c1", ["c3", "c2"]],
  ]) {
    for (let mask = 0; mask < 2 ** between.length; mask += 1) {
      const entries = { [from]: piece("red", "cannon"), [to]: piece("black", "general") };
      const occupied = between.filter((_, i) => mask & (1 << i));
      occupied.forEach((position, i) => { entries[position] = piece(i % 2 ? "red" : "black", "pawn", i % 2 === 0); });
      checkAction(fixture(entries), 0, move(from, to), occupied.length === 1);
    }
  }
});

test("Pháo không nhảy vào ô trống, ăn chéo, ăn quân mình hoặc đích úp", () => {
  for (const target of [null, piece("red", "general"), piece("black", "general", true), piece("red", "pawn", true)]) {
    const entries = { a1: piece("red", "cannon"), d1: piece("black", "pawn", true) };
    if (target !== null) entries.h1 = target;
    checkAction(fixture(entries), 0, move("a1", "h1"), false);
  }
  checkAction(fixture({ a1: piece("red", "cannon"), b2: piece("black", "pawn"), c3: piece("black", "general") }), 0, move("a1", "c3"), false);
  checkAction(fixture({ a1: piece("red", "cannon"), b1: piece("black", "pawn", true) }), 0, move("a1", "b1"), false);
});

test("Ngòi ở ngoài đoạn Pháo–đích không được tính", () => {
  const state = fixture({ a1: piece("black", "pawn", true), b1: piece("red", "cannon"),
    f1: piece("black", "general"), h1: piece("red", "pawn", true) });
  checkAction(state, 0, move("b1", "f1"), false);
});

test("Ăn một quân hết lượt, không ăn liên hoàn; ăn Tướng chưa kết thúc khi đối thủ còn quân đi được", () => {
  const state = fixture({ a1: piece("red", "cannon"), b1: piece("red", "pawn", true),
    c1: piece("black", "general"), d1: piece("red", "pawn", true), e1: piece("black", "horse") });
  const captured = checkAction(state, 0, move("a1", "c1"), true);
  assert.equal(captured.state.board.filter((p) => p !== null).length, 4);
  assert.equal(captured.state.board[at("e1")].type, "horse");
  checkAction(captured.state, 0, move("c1", "e1"), false, "NOT_YOUR_TURN");
  checkAction(captured.state, 1, move("e1", "e2"), true);
  assert.equal(captured.state.status, "playing");
  assert.equal(captured.state.result, null);
  assert.deepEqual(getLegalActions(getPublicState(fixture()), 0), [], "A hand-built fixture is evaluated for outcomes only after a valid action");
});

test("Public ban đầu chỉ có 32 occupied/faceDown, không màu/loại/ID/seed/nested metadata", () => {
  const state = createGame({ random: seeded(1), firstPlayer: 0 });
  state.seed = "PRIVATE_ONLY_SEED";
  state.metadata = { privateState: { token: "PRIVATE_ONLY_ROOT" } };
  state.board.forEach((p, i) => { p.id = `PRIVATE_ONLY_${i}`; p.extra = { color: p.color, type: p.type }; });
  freeze(state);
  const publicState = getPublicState(state);
  assert.deepEqual(publicState, { board: Array.from({ length: 32 }, () => ({ occupied: true, faceDown: true })),
    turn: 0, playerColors: [null, null], captured: [], status: "playing", result: null,
    noProgressPly: 0, repetitionCount: 1 });
  assert.doesNotMatch(JSON.stringify(publicState), /PRIVATE_ONLY|"red"|"black"|"seed"|"metadata"|"general"|"pawn"/);
});

test("Public/event chỉ cho thấy quân đã lật hoặc đã ăn, không metadata riêng", () => {
  const state = fixture({ a1: { ...piece("red", "rook"), id: "PRIVATE_ONLY_VISIBLE" },
    a2: { ...piece("black", "pawn"), nested: { secret: "PRIVATE_ONLY_CAPTURE" } },
    h4: { ...piece("black", "general", true), id: "PRIVATE_ONLY_HIDDEN" } });
  state.captured.push({ color: "black", type: "horse", secret: "PRIVATE_ONLY_PAST" });
  const publicState = getPublicState(state);
  assert.deepEqual(publicState.board[at("a1")], { occupied: true, faceDown: false, color: "red", type: "rook" });
  assert.deepEqual(publicState.board[at("h4")], { occupied: true, faceDown: true });
  assert.deepEqual(publicState.captured, [{ color: "black", type: "horse" }]);
  const result = checkAction(state, 0, move("a1", "a2"), true);
  assert.deepEqual(result.event, { type: "move", player: 0, from: "a1", to: "a2",
    piece: { color: "red", type: "rook" }, captured: { color: "black", type: "pawn" } });
  assert.doesNotMatch(JSON.stringify({ publicState, event: result.event }), /PRIVATE_ONLY|general/);
  const reveal = checkAction(result.state, 1, flip("h4"), true);
  assert.deepEqual(reveal.event, { type: "flip", player: 1, at: "h4", piece: { color: "black", type: "general" } });
});

test("Snapshot public, event, state mới và state cũ không chia sẻ dữ liệu mutable", () => {
  const original = fixture({ a1: piece("red", "rook"), a2: piece("black", "pawn"), h4: piece("black", "horse", true) },
    { captured: [{ color: "black", type: "advisor" }] });
  const saved = structuredClone(original);
  const view = getPublicState(original);
  view.board[at("a1")].type = "pawn";
  view.board[at("h4")].faceDown = false;
  view.playerColors[0] = "black";
  view.captured[0].type = "general";
  view.turn = 1;
  view.board.pop();
  assert.deepEqual(original, saved);
  const result = applyAction(freeze(original), 0, move("a1", "a2"));
  assert.equal(result.ok, true);
  const after = structuredClone(result.state);
  result.event.piece.type = "pawn";
  result.event.captured.type = "general";
  assert.deepEqual(result.state, after);
  result.state.board[at("a2")].color = "black";
  result.state.board[at("h4")].faceDown = false;
  result.state.captured[0].type = "general";
  result.state.playerColors[0] = "black";
  assert.deepEqual(original, saved);
  assert.deepEqual(getPublicState(original).captured, [{ color: "black", type: "advisor" }]);
});

test("Hai cách xếp quân úp cùng public có cùng legal actions và event đi/ăn", () => {
  const a = fixture({ a1: piece("red", "cannon"), d1: piece("black", "general", true),
    h1: piece("black", "rook"), h4: piece("red", "pawn", true), a4: piece("red", "horse") });
  const b = structuredClone(a);
  [b.board[at("d1")], b.board[at("h4")]] = [b.board[at("h4")], b.board[at("d1")]];
  assert.notDeepEqual(a.board, b.board);
  assert.deepEqual(getPublicState(a), getPublicState(b));
  for (const player of [0, 1]) {
    assert.deepEqual(getLegalActions(getPublicState(a), player), getLegalActions(getPublicState(b), player));
  }
  const moveA = checkAction(a, 0, move("a1", "h1"), true);
  const moveB = checkAction(b, 0, move("a1", "h1"), true);
  assert.deepEqual(moveA.event, moveB.event);
  assert.deepEqual(getPublicState(moveA.state), getPublicState(moveB.state));
  assert.deepEqual(applyAction(a, 0, move("d1", "d2")), applyAction(b, 0, move("d1", "d2")));
  assert.notDeepEqual(applyAction(a, 0, flip("d1")).event, applyAction(b, 0, flip("d1")).event, "Only an actual flip reveals the differing piece");
});

test("Chiếu public và sinh legal không đọc màu/loại bí mật của ô úp", () => {
  const state = fixture({ a1: piece("red", "cannon"), d1: piece("black", "pawn", true), h1: piece("black", "horse") });
  const hidden = { faceDown: true };
  for (const key of ["type", "color", "id", "seed"]) {
    Object.defineProperty(hidden, key, { get() { throw new Error(`Read hidden ${key}`); }, enumerable: true });
  }
  state.board[at("d1")] = hidden;
  const publicState = getPublicState(state);
  assert.deepEqual(publicState.board[at("d1")], { occupied: true, faceDown: true });
  publicState.board[at("d1")] = hidden;
  const actions = getLegalActions(publicState, 0);
  assert.ok(actions.some((a) => a.type === "flip" && a.at === "d1"));
  assert.ok(actions.some((a) => a.type === "move" && a.from === "a1" && a.to === "h1"));
});

test("Kết quả legal là dữ liệu mới, serialize được, không mang trạng thái riêng", () => {
  const state = createGame({ firstPlayer: 0, random: seeded(8) });
  const publicState = freeze(getPublicState(state));
  const a = getLegalActions(publicState, 0);
  const expected = structuredClone(a);
  a[0].at = "h4";
  a.push({ type: "pass" });
  assert.deepEqual(getLegalActions(JSON.parse(JSON.stringify(publicState)), 0), expected);
});

test("Public bị sửa giả không thể cho phép action trên private state thật", () => {
  const state = fixture({ a1: piece("red", "rook", true), d2: piece("black", "horse") });
  const forged = getPublicState(state);
  forged.board[at("a1")] = { occupied: true, faceDown: false, color: "red", type: "rook" };
  assert.ok(getLegalActions(forged, 0).some((a) => a.type === "move" && a.from === "a1" && a.to === "b1"));
  checkAction(state, 0, move("a1", "b1"), false);
  forged.turn = 1;
  assert.ok(getLegalActions(forged, 1).some((a) => a.type === "move" && a.from === "d2" && a.to === "e2"));
  checkAction(state, 1, move("d2", "e2"), false, "NOT_YOUR_TURN");
});

test("Tọa độ engine giữ a1–h4 và index y*8+x bất kể thông tin hướng UI", () => {
  const state = fixture({ h4: piece("red", "rook"), g4: piece("black", "pawn"), a1: piece("black", "horse", true) });
  const baseline = getLegalActions(getPublicState(state), 0);
  for (const orientation of ["horizontal", "vertical"]) {
    const view = getPublicState(state);
    view.orientation = orientation;
    assert.deepEqual(getLegalActions(view, 0), baseline);
    const result = checkAction(state, 0, move("h4", "g4"), true);
    assert.equal(result.state.board[31], null);
    assert.deepEqual(result.state.board[30], piece("red", "rook"));
    assert.deepEqual(result.state.board[0], piece("black", "horse", true));
  }
});

test("Chuỗi thao tác tái lập: mỗi nước một lượt, bảo toàn quân bàn + đã ăn", () => {
  let state = createGame({ firstPlayer: 0, random: seeded(31) });
  const choose = seeded(19);
  const expected = {};
  for (const color of ["red", "black"]) for (const type of TYPES) expected[`${color}:${type}`] = COUNTS[type];
  for (let step = 0; step < 160; step += 1) {
    const actions = getLegalActions(getPublicState(state), state.turn);
    if (actions.length === 0) break;
    const action = actions[Math.floor(choose() * actions.length)];
    const result = checkAction(state, state.turn, action, true);
    const counts = Object.fromEntries(Object.keys(expected).map((key) => [key, 0]));
    for (const p of [...result.state.board.filter(Boolean), ...result.state.captured]) counts[`${p.color}:${p.type}`] += 1;
    assert.deepEqual(counts, expected);
    const downBefore = state.board.filter((p) => p?.faceDown).length;
    const downAfter = result.state.board.filter((p) => p?.faceDown).length;
    assert.equal(downAfter, downBefore - (action.type === "flip" ? 1 : 0));
    state = result.state;
  }
});
