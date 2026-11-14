"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const launchChrome = require("./helpers/chrome.cjs");
const at = (square) => (Number(square[1]) - 1) * 8 + "abcdefgh".indexOf(square[0]);
const square = (index) => "abcdefgh"[index % 8] + (Math.floor(index / 8) + 1);
const piece = (color, type, faceDown = false) => ({ color, type, faceDown });
const move = (from, to) => ({ type: "move", from, to });
const flip = (at) => ({ type: "flip", at });
const COUNTS = { general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 };
const SYMBOLS = {
  red: { general: "帥", advisor: "仕", elephant: "相", rook: "俥", horse: "傌", cannon: "炮", pawn: "兵" },
  black: { general: "將", advisor: "士", elephant: "象", rook: "車", horse: "馬", cannon: "砲", pawn: "卒" },
};

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

// Late-game fixtures conserve the full army; no preassigned outcome or cheat in app.
function fixture(entries, turn = 0) {
  const board = Array(32).fill(null), captured = [];
  for (const [position, value] of Object.entries(entries)) board[at(position)] = value;
  for (const color of ["red", "black"]) for (const [type, count] of Object.entries(COUNTS)) {
    const left = board.filter((p) => p?.color === color && p.type === type).length;
    assert.ok(left <= count);
    for (let i = left; i < count; i += 1) captured.push({ color, type });
  }
  return { board, captured, turn, playerColors: ["red", "black"], status: "playing", result: null,
    noProgressPly: 0, positionCounts: {} };
}

function inspectGameplayLayout() {
  const ensure = (condition, message) => { if (!condition) throw new Error(message); };
  ensure(document.documentElement.scrollWidth <= innerWidth, "No horizontal overflow");
  const cells = [...document.querySelectorAll(".cell")], board = document.getElementById("board");
  const vertical = board.dataset.orientation === "vertical";
  const rects = cells.map((cell) => cell.getBoundingClientRect());
  const lefts = [...new Set(rects.map((r) => Math.round(r.left)))].sort((a, b) => a - b);
  const tops = [...new Set(rects.map((r) => Math.round(r.top)))].sort((a, b) => a - b);
  ensure(lefts.length === (vertical ? 4 : 8) && tops.length === (vertical ? 8 : 4), "Grid dimensions");
  cells.forEach((cell, index) => {
    const rect = rects[index], face = cell.firstElementChild.getBoundingClientRect();
    ensure(cell === window.originalCells[index], "Stable DOM identity during game");
    ensure(rect.width >= 24 && rect.height >= 24, "Minimum cell touch target at narrow width");
    ensure(face.left >= rect.left && face.right <= rect.right && face.top >= rect.top && face.bottom <= rect.bottom, "Piece canvas fits cell without clipping shadow");
    ensure(Math.abs(face.width - face.height) < 1 && face.width >= rect.width * 0.65, "Circular piece fills cell instead of shrinking to glyph width");
    const image = cell.querySelector("img");
    if (image) {
      const r = image.getBoundingClientRect(), css = getComputedStyle(image);
      ensure(image.complete && image.naturalWidth === 256 && cell.firstElementChild.classList.contains("piece-svg"), "SVG actually decoded and visible");
      ensure(Math.abs(r.width - r.height) < 1 && r.left >= rect.left && r.right <= rect.right && r.top >= rect.top && r.bottom <= rect.bottom, "Entire square SVG inside cell");
      ensure(css.objectFit === "contain" && css.pointerEvents === "none" && css.transform === "none", "Image upright, contained and does not intercept input");
      ensure(getComputedStyle(cell.querySelector(".piece-fallback")).display === "none", "No duplicate Unicode over image");
    } else ensure(parseFloat(getComputedStyle(cell.firstElementChild).fontSize) >= face.width * 0.28, "Readable move marker");
    ensure(Math.round(rect.left) === lefts[vertical ? Math.floor(index / 8) : index % 8], "Column mapping");
    ensure(Math.round(rect.top) === tops[vertical ? index % 8 : 3 - Math.floor(index / 8)], "Row mapping");
    ensure(getComputedStyle(cell).transform === "none" && getComputedStyle(cell.firstElementChild).transform === "none", "Upright pieces");
  });
  for (const button of document.querySelectorAll("button:not(.cell)")) {
    const rect = button.getBoundingClientRect();
    ensure(rect.width >= 44 && rect.height >= 44 && rect.right <= innerWidth, "Toolbar touch target fits");
  }
  const boardRect = board.getBoundingClientRect();
  for (const [side, selector] of [[0, "#axis-left"], [1, "#axis-bottom"]]) {
    [...document.querySelector(selector).children].forEach((label, index) => {
      const rect = label.getBoundingClientRect();
      const cell = rects.find((r) => Math.round(side === 0 ? r.top : r.left) === (side === 0 ? tops : lefts)[index]);
      ensure(side === 0 ? rect.right < boardRect.left : rect.top > boardRect.bottom, "Axes outside board");
      ensure(Math.abs(side === 0 ? rect.top + rect.height / 2 - cell.top - cell.height / 2 : rect.left + rect.width / 2 - cell.left - cell.width / 2) < 1, "Axes aligned");
    });
  }
  const luminance = (color) => {
    const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  // Measure the preserved Unicode fallback palette, not transparent SVG wrappers.
  const probes = ["piece piece-red", "piece piece-black"].map((className) => {
    const probe = document.createElement("span"); probe.className = className;
    probe.style.position = "absolute"; probe.style.visibility = "hidden";
    document.body.append(probe); return probe;
  });
  const faces = probes.map((probe) => getComputedStyle(probe));
  const contrasts = faces.map((s) => contrast(s.color, s.backgroundColor));
  ensure(contrasts.every((v) => v >= 4.5), "Red/black text contrast");
  ensure(faces[0].borderStyle === "double" && faces[1].borderStyle === "solid", "Non-color identification");
  probes.forEach((probe) => probe.remove());
  ensure(document.querySelector(".is-selected")?.id === "cell-0", "Selection survives presentation changes");
  ensure(document.querySelector(".can-capture")?.id === "cell-1", "Capture target remains marked");
  ensure(document.querySelector("#cell-8.can-move .piece").textContent === "·", "Move marker");
  const hint = getComputedStyle(document.querySelector("#cell-8 .piece"));
  ensure(contrast(hint.color, getComputedStyle(document.querySelector("#cell-8")).backgroundColor) >= 3, "Move marker contrast");
  ensure(getComputedStyle(document.querySelector(".can-capture")).outlineStyle === "dashed", "Capture border");
  return { width: innerWidth, height: innerHeight, theme: document.documentElement.dataset.theme, orientation: board.dataset.orientation, contrasts };
}

test("Chrome R2-01 — gameplay Offline qua HTTP", { timeout: 120000 }, async (t) => {
  const { createGame, applyAction, getPublicState, getLegalActions } = await import("../js/engine.mjs");
  const browser = await launchChrome({ suite: "gameplay" });
  t.after(() => browser.close());
  const { send, evaluate, navigate } = browser;
  const settleImages = () => evaluate(`(async () => {
    while (document.getElementById('board').dataset.animating) await new Promise(requestAnimationFrame);
    await Promise.all(Array.from(document.querySelectorAll('.piece-image'), image => image.decode().catch(() => {})));
    await new Promise(requestAnimationFrame);
  })()`);
  const click = async (selector) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await settleImages(); };
  const clickSquare = (position) => click(`#cell-${at(position)}`);
  const text = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
  const dom = () => evaluate(`({board: document.getElementById('board').innerHTML, status: document.getElementById('game-status').textContent, players: document.getElementById('player-colors').textContent})`);
  const load = async (state) => { browser.useGame(state); await navigate(); };
  const key = async (key, code, windowsVirtualKeyCode, text) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, ...(text ? { text, unmodifiedText: text } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
  };
  async function pointerSquare(position, kind) {
    const point = await evaluate(`(() => { const cell = document.querySelector('#cell-${at(position)}'); cell.scrollIntoView({block: 'center'}); const r = cell.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (kind === "touch") {
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    } else {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
    }
  }
  async function assertWarnings(state, selected = null) {
    const warnings = getPublicState(state).chase.warnings.filter((w) => selected === null || w.action.from === selected);
    const marked = await evaluate("Array.from(document.querySelectorAll('.chase-warning'), cell => cell.id).sort()");
    assert.deepEqual(marked, selected === null ? [] : warnings.map((w) => `cell-${at(w.action.to)}`).sort());
    const notice = await text("#chase-status");
    for (const warning of warnings) {
      const action = `${warning.action.from}–${warning.action.to}`;
      assert.ok(notice.includes(action), `Specific action ${action} announced BEFORE activation`);
      assert.ok(notice.includes(`lỗi ${warning.nextFault}/2`));
      if (warning.losesGame) assert.match(notice, /lỗi 2\/2 và xử thua/);
      if (selected !== null) {
        const info = await evaluate(`(() => { const c = document.querySelector('#cell-${at(warning.action.to)}'); return {label: c.getAttribute('aria-label'), description: c.getAttribute('aria-describedby'), marker: c.querySelector('.chase-marker')?.textContent, disabled: c.getAttribute('aria-disabled')}; })()`);
        assert.ok(info.label.includes(action));
        assert.ok(info.label.includes(`lỗi ${warning.nextFault}/2`));
        assert.equal(info.description, "chase-status");
        assert.equal(info.marker, "!");
        assert.equal(info.disabled, "false", "Warned action remains playable");
      }
    }
  }
  async function assertBoard(state) {
    await settleImages();
    const view = getPublicState(state);
    const actual = await evaluate(`Array.from(document.querySelectorAll('.cell'), cell => ({face: cell.textContent, label: cell.getAttribute('aria-label'), disabled: cell.getAttribute('aria-disabled'), src: cell.querySelector('img')?.getAttribute('src') ?? null, loaded: cell.firstElementChild.classList.contains('piece-svg') && cell.querySelector('img')?.naturalWidth === 256}))`);
    assert.equal(actual.length, 32);
    view.board.forEach((p, index) => {
      assert.equal(actual[index].face, p === null ? "" : p.faceDown ? "?" : SYMBOLS[p.color][p.type], square(index));
      assert.equal(actual[index].src, p === null ? null : p.faceDown ? "./assets/pieces/back.svg" : `./assets/pieces/${p.color}/${p.type}.svg`, square(index));
      assert.equal(actual[index].loaded, p !== null, "Only occupied squares display decoded SVGs");
      assert.equal(actual[index].disabled, String(view.status === "finished"));
      if (p?.faceDown) assert.equal(actual[index].label, `Quân úp tại ${square(index)}`);
    });
    assert.equal(await text("#player-colors"), view.playerColors.map((color, i) => `Người ${i + 1}: ${color === "red" ? "Đỏ" : color === "black" ? "Đen" : "chưa phân màu"}`).join(" · "));
    if (!view.result) assert.match(await text("#game-status"), new RegExp(`^Lượt Người ${view.turn + 1}`));
    assert.equal(await evaluate("document.querySelectorAll('.is-selected, .can-move, .can-capture').length"), 0);
  }
  async function play(state, action) {
    const result = applyAction(state, state.turn, action);
    assert.equal(result.ok, true, JSON.stringify(action));
    if (action.type === "flip") await clickSquare(action.at);
    else { await clickSquare(action.from); await clickSquare(action.to); }
    await assertBoard(result.state);
    return result.state;
  }
  async function confirmNewGame(accept) {
    const opened = browser.waitForEvent("Page.javascriptDialogOpening");
    const clicked = click("#new-game");
    const dialog = await opened;
    assert.equal(dialog.type, "confirm");
    assert.match(dialog.message, /Ván đang chơi/);
    await send("Page.handleJavaScriptDialog", { accept });
    await clicked;
  }

  await t.test("Ván production: 32 quân úp, người đầu ngẫu nhiên, không phân màu hoặc lộ state", async () => {
    await load(null);
    assert.equal(await evaluate("document.querySelectorAll('.cell').length"), 32);
    assert.equal(await text("#board"), "?".repeat(32));
    assert.equal(await text("#player-colors"), "Người 1: chưa phân màu · Người 2: chưa phân màu");
    assert.match(await text("#game-status"), /^Lượt Người [12] · Lật quân đầu/);
    assert.equal(await evaluate("['privateState', 'publicState', 'legalActions', 'createGame', 'applyAction', 'selected'].some(key => key in window)"), false);
    assert.equal(await evaluate("document.querySelectorAll('[data-color], [data-type], [data-seed], svg').length"), 0);
    assert.equal(await evaluate("document.querySelectorAll('.piece-svg img[src=\"./assets/pieces/back.svg\"]').length"), 32);
    await click("#new-game"); // No confirm before any action.
    assert.equal(await text("#board"), "?".repeat(32));
  });

  for (const firstPlayer of [0, 1]) for (const color of ["red", "black"]) {
    await t.test(`Lật đầu của Người ${firstPlayer + 1} ra ${color}: phân màu, SVG/fallback, đúng một lượt`, async () => {
      let state = createGame({ firstPlayer, random: seeded(41) });
      await load(state);
      const position = square(state.board.findIndex((p) => p.color === color));
      state = await play(state, flip(position));
      assert.equal(state.playerColors[firstPlayer], color);
      assert.equal(await evaluate("document.querySelectorAll('.piece-red, .piece-black').length"), 1);
      assert.match(await text("#action-feedback"), new RegExp(`^Người ${firstPlayer + 1} lật`));
      const before = await dom();
      await clickSquare(position); // It is now the other player's turn.
      assert.deepEqual(await dom(), before);
      assert.match(await text("#action-feedback"), /Ô không hợp lệ/);
    });
  }

  await t.test("Đổi danh tính quân úp không đổi DOM/attributes hoặc event đi công khai", async () => {
    const a = fixture({ a1: piece("red", "rook"), h4: piece("black", "rook"), d2: piece("red", "general", true), e2: piece("black", "pawn", true) });
    const b = structuredClone(a);
    [b.board[at("d2")], b.board[at("e2")]] = [b.board[at("e2")], b.board[at("d2")]];
    const results = [];
    for (const state of [a, b]) {
      await load(state);
      const before = await dom();
      for (const position of ["d2", "e2"]) {
        assert.equal(await evaluate(`document.querySelector('#cell-${at(position)}').title`), `Quân úp tại ${position}`);
        const html = await evaluate(`document.querySelector('#cell-${at(position)}').outerHTML`);
        assert.doesNotMatch(html, /general|pawn|red|black|data-(?:color|type)|帥|卒/);
      }
      await play(state, move("a1", "b1"));
      results.push({ before, after: await dom(), feedback: await text("#action-feedback") });
    }
    assert.deepEqual(results[0], results[1]);
  });

  const selectionState = () => fixture({ a1: piece("red", "rook"), a3: piece("red", "horse"), b1: piece("black", "pawn"), h4: piece("black", "rook"), d2: piece("black", "general", true) });
  await t.test("Chọn, bỏ chọn, đổi quân và phản hồi invalid không đổi bàn/lượt, không spam", async () => {
    await load(selectionState());
    await clickSquare("a1");
    assert.equal(await evaluate("document.querySelector('.is-selected').id"), "cell-0");
    assert.equal(await evaluate("document.querySelector('.can-capture').id"), "cell-1");
    await clickSquare("a1");
    assert.equal(await evaluate("document.querySelector('.is-selected')"), null);
    await clickSquare("a1");
    await clickSquare("a3");
    assert.equal(await evaluate("document.querySelector('.is-selected').id"), "cell-16");
    const before = await dom();
    await evaluate("window.feedbackWrites = 0; new MutationObserver(() => window.feedbackWrites++).observe(document.querySelector('#action-feedback'), { childList: true });");
    for (const position of ["h4", "h3", "h3"]) await clickSquare(position);
    assert.deepEqual(await dom(), before);
    assert.equal(await evaluate("window.feedbackWrites"), 1);
  });

  await t.test("Ăn hợp lệ, đổi lượt; đi một ô trống và không điều khiển quân ngoài lượt", async () => {
    let state = selectionState();
    await load(state);
    state = await play(state, move("a1", "b1"));
    assert.match(await text("#action-feedback"), /Xe Đỏ a1 → b1, ăn Tốt Đen/);
    const before = await dom();
    await clickSquare("b1");
    await clickSquare("b2");
    assert.deepEqual(await dom(), before);
    state = await play(state, move("h4", "g4"));
    await play(state, move("b1", "b2"));
  });

  await t.test("Đang chọn vẫn lật được quân địch úp; chỉ một lượt và xóa lựa chọn", async () => {
    let state = selectionState();
    await load(state);
    await clickSquare("a1");
    state = await play(state, flip("d2"));
    assert.equal(state.playerColors[0], "red");
    assert.match(await text("#action-feedback"), /Người 1 lật Tướng Đen tại d2/);
    const before = await dom();
    await clickSquare("a1");
    assert.deepEqual(await dom(), before);
  });

  await t.test("Pháo ăn qua ngòi úp: ngòi không đổi và không lộ danh tính", async () => {
    const state = fixture({ a1: piece("red", "cannon"), d1: piece("red", "pawn", true), h1: piece("black", "general"), h4: piece("black", "rook") });
    await load(state);
    const screen = await evaluate("document.querySelector('#cell-3').outerHTML");
    await play(state, move("a1", "h1"));
    assert.equal(await evaluate("document.querySelector('#cell-3').outerHTML"), screen);
    assert.match(await text("#action-feedback"), /Pháo Đỏ a1 → h1, ăn Tướng Đen/);
  });

  await t.test("Tốt ăn Tướng, Tướng không ăn Tốt; mất Tướng chưa tự thua", async () => {
    const state = fixture({ a1: piece("red", "pawn"), a2: piece("black", "general"), h4: piece("black", "rook") });
    await load(state);
    const after = await play(state, move("a1", "a2"));
    assert.equal(after.status, "playing");
    await load(fixture({ a1: piece("red", "general"), a2: piece("black", "pawn"), h4: piece("black", "rook") }));
    await clickSquare("a1");
    const before = await dom();
    await clickSquare("a2");
    assert.deepEqual(await dom(), before);
  });

  const loop = [move("a1", "b1"), move("h4", "g4"), move("b1", "a1"), move("g4", "h4")];
  const redRoute = ["a1", "b1", "c1", "c2", "c3", "b3", "a3", "a2"];
  const blackRoute = ["e1", "f1", "g1", "h1", "h2", "h3", "g3", "f3", "e3", "e2"];
  const quiet = Array.from({ length: 60 }, (_, step) => {
    const route = step % 2 === 0 ? redRoute : blackRoute, i = Math.floor(step / 2) % route.length;
    return move(route[i], route[(i + 1) % route.length]);
  });
  const endings = [
    ["hết quân", fixture({ a1: piece("red", "rook"), a2: piece("black", "pawn") }), [move("a1", "a2")], "Người 1 thắng — đối phương hết quân."],
    ["hết nước", fixture({ a1: piece("red", "pawn"), b1: piece("black", "advisor"), a2: piece("black", "elephant"), h4: piece("black", "rook") }, 1), [move("h4", "g4")], "Người 2 thắng — đối phương hết nước hợp lệ."],
    ["lặp ba lần", fixture({ a1: piece("red", "rook"), h4: piece("black", "rook") }), [...loop, ...loop], "Hòa — lặp thế cờ 3 lần."],
    ["60 nửa-lượt", fixture({ a1: piece("red", "pawn"), e1: piece("black", "pawn") }), quiet, "Hòa — 60 nửa-lượt không lật hoặc ăn quân."],
  ];
  for (const [name, initial, actions, message] of endings) {
    await t.test(`Kết thúc ${name}: kết quả thật từ engine, khóa input, đổi theme/hướng vẫn giữ`, async () => {
      let state = initial;
      await load(state);
      for (const action of actions) state = await play(state, action);
      assert.equal(state.status, "finished");
      assert.equal(await text("#game-status"), message);
      const before = await dom();
      await clickSquare("a1"); await clickSquare("a2"); await clickSquare("h4");
      await evaluate("document.querySelector('#cell-0').focus()");
      await key("Enter", "Enter", 13, "\r");
      await key(" ", "Space", 32, " ");
      assert.deepEqual(await dom(), before);
      await click("button[data-theme=dark]");
      await click("button[data-orientation=vertical]");
      await assertBoard(state);
      assert.equal(await text("#game-status"), message);
      const tree = await send("Accessibility.getFullAXTree");
      assert.ok(tree.nodes.some((node) => node.name?.value === message));
      assert.equal(await evaluate("document.querySelector('#game-status').getAttribute('aria-live')"), "polite");
      browser.useGame(null);
      await click("#new-game"); // Finished games need no abandonment confirmation.
      assert.equal(await text("#board"), "?".repeat(32));
      assert.match(await text("#game-status"), /^Lượt Người [12]/);
      assert.equal(await evaluate("document.querySelectorAll('[aria-disabled=true]').length"), 0);
    });
  }

  await t.test("Ván mới: hộp confirm thật, hủy giữ ván, đồng ý reset; giữ hướng/theme", async () => {
    let state = createGame({ firstPlayer: 0, random: seeded(91) });
    await load(state);
    state = await play(state, flip("a1"));
    await click("button[data-theme=dark]");
    await click("button[data-orientation=vertical]");
    const before = await dom();
    await confirmNewGame(false);
    assert.deepEqual(await dom(), before);
    await confirmNewGame(true);
    assert.equal(await text("#board"), "?".repeat(32));
    assert.match(await text("#player-colors"), /Người 1: chưa phân màu · Người 2: chưa phân màu/);
    assert.equal(await evaluate("document.querySelector('#board').dataset.orientation"), "vertical");
    assert.equal(await evaluate("document.documentElement.dataset.theme"), "dark");
    assert.equal(await evaluate("localStorage.getItem('banqi-theme')"), "dark");
    assert.equal(await evaluate("document.querySelectorAll('.is-selected, .can-move, .can-capture').length"), 0);
  });

  await t.test("Tab/Enter/Space trên ô: lật, chọn, đi; không phát hai hành động", async () => {
    let state = createGame({ firstPlayer: 1, random: seeded(11) });
    await load(state);
    await evaluate("document.querySelector('button[data-orientation=vertical]').focus()");
    await key("Tab", "Tab", 9);
    assert.equal(await evaluate("document.activeElement.id"), "cell-0");
    await key("Enter", "Enter", 13, "\r");
    state = applyAction(state, state.turn, flip("a1")).state;
    await assertBoard(state);
    await key("Tab", "Tab", 9);
    await key(" ", "Space", 32, " ");
    state = applyAction(state, state.turn, flip("b1")).state;
    await assertBoard(state);
    state = fixture({ a1: piece("red", "rook"), h4: piece("black", "rook") });
    await load(state);
    await evaluate("document.querySelector('#cell-0').focus()");
    await key("Enter", "Enter", 13, "\r");
    assert.equal(await evaluate("document.querySelector('.is-selected').id"), "cell-0");
    await key("Tab", "Tab", 9);
    await key(" ", "Space", 32, " ");
    await assertBoard(applyAction(state, 0, move("a1", "b1")).state);
    assert.equal(await evaluate("document.activeElement.id"), "cell-1");
    for (const theme of ["light", "dark"]) {
      state = selectionState();
      await load(state);
      await click(`button[data-theme=${theme}]`);
      await evaluate("document.querySelector('#cell-0').focus()");
      await key("Enter", "Enter", 13, "\r");
      await key("Tab", "Tab", 9);
      assert.equal(await evaluate("document.activeElement.id"), "cell-1");
      assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"), "solid", "Capture marker must not hide keyboard focus");
      assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineWidth"), "3px");
      await key(" ", "Space", 32, " ");
      await assertBoard(applyAction(state, 0, move("a1", "b1")).state);
    }
  });

  await t.test("Touch mobile và chuột PC: lật, chọn và ăn qua sự kiện input CDP", async () => {
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    async function tap(position) {
      const point = await evaluate(`(() => { const cell = document.querySelector('#cell-${at(position)}'); cell.scrollIntoView({block: 'center'}); const r = cell.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    }
    let state = createGame({ firstPlayer: 0, random: seeded(22) });
    await load(state);
    await click("button[data-orientation=vertical]");
    await tap("a1");
    await assertBoard(applyAction(state, 0, flip("a1")).state);
    state = selectionState();
    await load(state);
    await click("button[data-orientation=vertical]");
    await tap("a1"); await tap("b1");
    await assertBoard(applyAction(state, 0, move("a1", "b1")).state);
    await send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await load(state);
    for (const position of ["a1", "b1"]) {
      const point = await evaluate(`(() => { const cell = document.querySelector('#cell-${at(position)}'); cell.scrollIntoView({block: 'center'}); const r = cell.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
    }
    await assertBoard(applyAction(state, 0, move("a1", "b1")).state);
  });

  await t.test("Một ván đủ 32 quân: thao tác UI từ mở đầu đến kết quả, đối chiếu engine từng nước", async () => {
    let state = createGame({ firstPlayer: 0, random: seeded(117) });
    await load(state);
    const random = seeded(21);
    let steps = 0;
    while (state.status === "playing" && steps < 600) {
      const legal = getLegalActions(getPublicState(state), state.turn);
      const captures = legal.filter((a) => a.type === "move" && state.board[at(a.to)] !== null);
      const flips = legal.filter((a) => a.type === "flip");
      const choices = captures.length ? captures : flips.length ? flips : legal;
      state = await play(state, choices[Math.floor(random() * choices.length)]);
      steps += 1;
    }
    assert.equal(state.status, "finished", `Game did not finish after ${steps} actions`);
    assert.match(await text("#game-status"), /thắng|Hòa/);
    t.diagnostic(`Ván tái lập hoàn thành sau ${steps} hành động qua UI: ${state.result.reason}`);
  });

  const chaseLoop = [move("b2", "c2"), move("c3", "b3"), move("c2", "b2"), move("b3", "c3")];
  const chaseStart = (extra = {}) => fixture({ b2: piece("red", "general"), c3: piece("black", "advisor"), ...extra });
  function advanceChase(state, plies) {
    for (let i = 0; i < plies; i++) {
      const result = applyAction(state, state.turn, chaseLoop[i % 4]);
      assert.equal(result.ok, true);
      state = result.state;
    }
    return state;
  }

  await t.test("R2-03B C1 qua UI: ply 8 chưa hòa, chuột gây lỗi 1 ở 13, touch gây lỗi 2 ở 27", async () => {
    let state = chaseStart();
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await load(state);
    await click("button[data-theme=light]");
    for (let ply = 1; ply <= 27; ply++) {
      const action = chaseLoop[(ply - 1) % 4];
      if (ply === 13 || ply === 27) {
        const input = ply === 13 ? "mouse" : "touch";
        if (input === "touch") {
          await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          await send("Emulation.setTouchEmulationEnabled", { enabled: true });
          await click("button[data-theme=dark]");
          await click("button[data-orientation=vertical]");
        }
        await assertWarnings(state);
        await pointerSquare(action.from, input);
        await assertWarnings(state, action.from);
        assert.match(await text("#chase-status"), /6\/6/);
        const tree = await send("Accessibility.getFullAXTree");
        assert.ok(tree.nodes.some((node) => node.role?.value === "button" && node.name?.value.includes(`${action.from}–${action.to}`) && node.name.value.includes(`lỗi ${ply === 13 ? 1 : 2}/2`)));
        await browser.screenshot(`chase-before-ply-${ply}`);
        await pointerSquare(action.to, input);
        state = applyAction(state, state.turn, action).state;
        await assertBoard(state);
      } else state = await play(state, action);
      if (ply < 27) assert.match(await text("#game-status"), /^Lượt Người/);
      if (ply === 8) {
        assert.equal(getPublicState(state).repetitionCount, 3);
        assert.match(await text("#chase-status"), /Chưa hòa lặp 3 lần: Người 1 \(Đỏ\)/);
        assert.deepEqual(state.chaseFaults, [0, 0]);
      }
      if (ply === 9) assert.match(await text("#chase-status"), /đã đuổi cùng quân 5\/6/);
      if (ply === 13) {
        assert.deepEqual(state.chaseFaults, [1, 0]);
        assert.match(await text("#chase-status"), /Người 1 \(Đỏ\): lỗi trường tróc 1\/2\. Ván tiếp tục/);
        assert.equal(await text("#game-status"), "Lượt Người 2 · Đen");
        assert.match(await text("#action-feedback"), /Tướng Đỏ b2 → c2/);
        await browser.screenshot("chase-after-first-fault");
      }
    }
    assert.equal(state.result.reason, "chase_technical_fouls");
    assert.equal(await text("#game-status"), "Người 2 (Đen) thắng — Người 1 (Đỏ) thua do hai lỗi trường tróc (2/2).");
    assert.match(await text("#chase-status"), /lỗi trường tróc 2\/2/);
    assert.doesNotMatch(await evaluate("document.body.innerText"), /undefined|NaN/);
    const before = await dom(), notice = await text("#chase-status");
    await pointerSquare("b2", "touch"); await pointerSquare("b3", "touch");
    await evaluate("document.querySelector('#cell-9').focus()");
    await key("Enter", "Enter", 13, "\r"); await key(" ", "Space", 32, " ");
    assert.deepEqual(await dom(), before);
    assert.equal(await text("#chase-status"), notice);
    await browser.screenshot("chase-finished-mobile");
    await send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await click("#new-game");
    assert.equal(await text("#chase-status"), "");
    assert.equal(await text("#board"), "?".repeat(32));
  });

  await t.test("Warning đúng đích trước Tab/Enter/Space; focus rõ và không chặn nước lỗi", async () => {
    const state = advanceChase(chaseStart(), 12);
    for (const theme of ["light", "dark"]) {
      await load(state); await click(`button[data-theme=${theme}]`);
      await evaluate("document.querySelector('#cell-9').focus()");
      await key("Enter", "Enter", 13, "\r");
      await assertWarnings(state, "b2");
      await key("Tab", "Tab", 9);
      assert.equal(await evaluate("document.activeElement.id"), "cell-10");
      assert.match(await evaluate("document.activeElement.getAttribute('aria-label')"), /b2–c2: lỗi 1\/2/);
      assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineWidth"), "3px");
      assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"), "solid");
      await key(" ", "Space", 32, " ");
      const after = applyAction(state, 0, chaseLoop[0]).state;
      await assertBoard(after);
      assert.match(await text("#chase-status"), /lỗi trường tróc 1\/2\. Ván tiếp tục/);
      assert.equal(await evaluate("document.activeElement.id"), "cell-10");
    }
  });

  await t.test("Chọn/bỏ/đổi quân lọc đúng nhiều warning; invalid và đổi giao diện không sửa trạng thái hoặc spam", async () => {
    const state = advanceChase(chaseStart({ a1: piece("red", "rook"), h4: piece("black", "rook") }), 12);
    await load(state);
    assert.equal(getPublicState(state).chase.warnings.length, 2);
    await assertWarnings(state);
    await clickSquare("b2"); await assertWarnings(state, "b2");
    await clickSquare("b2"); await assertWarnings(state);
    await clickSquare("a1"); await assertWarnings(state, "a1");
    assert.doesNotMatch(await text("#chase-status"), /Cảnh báo b2–/);
    await clickSquare("b2"); await assertWarnings(state, "b2");
    const before = await dom(), notice = await text("#chase-status");
    await evaluate("window.chaseWrites = 0; new MutationObserver(() => window.chaseWrites++).observe(document.querySelector('#chase-status'), {childList: true, subtree: true}); document.querySelector('#cell-9').focus();");
    for (const bad of ["h4", "h3", "h3"]) await clickSquare(bad);
    assert.deepEqual(await dom(), before);
    for (const theme of ["light", "dark"]) for (const orientation of ["horizontal", "vertical"]) {
      await click(`button[data-theme=${theme}]`); await click(`button[data-orientation=${orientation}]`);
      await assertWarnings(state, "b2");
      assert.equal(await text("#game-status"), before.status);
      assert.equal(await text("#chase-status"), notice);
      assert.equal(await evaluate("document.activeElement.id"), "cell-9");
    }
    // Unselect/reselect the sole attacker leaves the same warning text.
    await clickSquare("b2"); await clickSquare("b2");
    assert.equal(await evaluate("window.chaseWrites"), 0);
    await clickSquare("c2");
    await assertBoard(applyAction(state, 0, chaseLoop[0]).state);
    assert.match(await text("#chase-status"), /lỗi trường tróc 1\/2/);
  });

  await t.test("Nước không warning vẫn đi bình thường; không gắn cảnh báo vào mọi đích", async () => {
    const state = advanceChase(chaseStart(), 12);
    await load(state); await clickSquare("b2");
    await assertWarnings(state, "b2");
    assert.equal(await evaluate("document.querySelector('#cell-8').classList.contains('chase-warning')"), false);
    assert.doesNotMatch(await evaluate("document.querySelector('#cell-8').getAttribute('aria-label')"), /lỗi|Cảnh báo/);
    await clickSquare("a2");
    const next = applyAction(state, 0, move("b2", "a2")).state;
    assert.deepEqual(next.chaseFaults, [0, 0]);
    await assertBoard(next);
    assert.equal(await text("#chase-status"), "");
  });

  await t.test("Hoãn hòa 60 nêu đúng người; ngừng chuỗi hòa, lật quân xóa hold", async () => {
    // Counter-only boundary fixture, not a claimed replay of 59 earlier plies.
    let state = chaseStart(); state.noProgressPly = 59;
    await load(state);
    state = await play(state, chaseLoop[0]);
    assert.match(await text("#chase-status"), /Chưa hòa sau 60 nửa-lượt: Người 1 \(Đỏ\)/);
    assert.match(await text("#game-status"), /^Lượt Người 2/);
    state = await play(state, chaseLoop[1]);
    state = await play(state, move("c2", "d2"));
    assert.equal(state.result.reason, "no_progress_60");
    assert.equal(await text("#game-status"), "Hòa — 60 nửa-lượt không lật hoặc ăn quân.");
    assert.equal(await text("#chase-status"), "");
    state = chaseStart({ h4: piece("red", "pawn", true) }); state.noProgressPly = 59;
    state = advanceChase(state, 13);
    await load(state);
    state = await play(state, flip("h4"));
    assert.deepEqual(state.chaseFaults, [1, 0]);
    assert.equal(state.noProgressPly, 0);
    assert.doesNotMatch(await text("#chase-status"), /Chưa hòa|Cảnh báo/);
    assert.match(await text("#chase-status"), /lỗi trường tróc 1\/2/);
  });

  await t.test("Ván mới sau lỗi 1: hủy giữ thông báo/counter, đồng ý xóa lỗi và dấu !", async () => {
    let state = advanceChase(chaseStart(), 12);
    await load(state); state = await play(state, chaseLoop[0]);
    await click("button[data-theme=dark]"); await click("button[data-orientation=vertical]");
    const before = await dom(), notice = await text("#chase-status");
    await confirmNewGame(false);
    assert.deepEqual(await dom(), before); assert.equal(await text("#chase-status"), notice);
    await confirmNewGame(true);
    assert.equal(await text("#chase-status"), "");
    assert.equal(await evaluate("document.querySelectorAll('.chase-warning, .chase-marker, [aria-describedby=chase-status]').length"), 0);
    assert.equal(await text("#board"), "?".repeat(32));
    assert.equal(await evaluate("document.documentElement.dataset.theme"), "dark");
    assert.equal(await evaluate("document.querySelector('#board').dataset.orientation"), "vertical");
  });

  await t.test("Chase public công bằng: đổi danh tính úp không đổi DOM/label/warning/event hoặc log", async () => {
    const a = advanceChase(chaseStart({ g4: piece("red", "rook", true), h4: piece("black", "pawn", true) }), 12);
    const b = structuredClone(a);
    [b.board[at("g4")], b.board[at("h4")]] = [b.board[at("h4")], b.board[at("g4")]];
    const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.testConsoleCalls = [];
      for (const name of ['log', 'warn', 'error', 'info', 'debug']) {
        const original = console[name]; console[name] = (...args) => { window.testConsoleCalls.push(name); original.apply(console, args); };
      }` });
    const views = [];
    try {
      for (const state of [a, b]) {
        await load(state); await clickSquare("b2"); await assertWarnings(state, "b2");
        for (const position of ["g4", "h4"]) {
          const html = await evaluate(`document.querySelector('#cell-${at(position)}').outerHTML`);
          assert.doesNotMatch(html, /rook|pawn|red|black|data-(?:color|type|id)|visibleId|俥|卒/);
          assert.equal(await evaluate(`document.querySelector('#cell-${at(position)}').getAttribute('aria-label')`), `Quân úp tại ${position}`);
        }
        const before = await dom(), notice = await text("#chase-status");
        await clickSquare("c2");
        await assertBoard(applyAction(state, 0, chaseLoop[0]).state);
        views.push({ before, notice, after: await dom(), fault: await text("#chase-status"), event: await text("#action-feedback") });
        assert.deepEqual(await evaluate("window.testConsoleCalls"), []);
        assert.equal(await evaluate("['privateState', 'publicState', 'chaseFaults', 'runs', 'positionLastPlies', 'quietDrawHold'].some(name => name in window)"), false);
      }
      assert.deepEqual(views[0], views[1]);
    } finally { await send("Page.removeScriptToEvaluateOnNewDocument", { identifier }); }
  });

  await t.test("Warning lỗi 2 và hai hoãn hòa: 16 bố cục, tương phản/focus/quân tròn/tọa độ, không che/tràn", async () => {
    const initial = chaseStart(); initial.noProgressPly = 59; // Explicit boundary counter.
    const state = advanceChase(initial, 26);
    await load(state); await clickSquare("c2");
    const notice = await text("#chase-status"), statusText = await text("#game-status");
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 800]]) {
      for (const theme of ["light", "dark"]) for (const orientation of ["horizontal", "vertical"]) {
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
        await click(`button[data-theme=${theme}]`); await click(`button[data-orientation=${orientation}]`);
        await evaluate("document.querySelector('#cell-9').focus()");
        await key("Tab", "Tab", 9); // Focus source c2 without changing selection/state.
        await assertWarnings(state, "c2");
        assert.equal(await text("#chase-status"), notice);
        assert.equal(await text("#game-status"), statusText);
        await evaluate(`(() => {
          const ensure = (ok, message) => { if (!ok) throw new Error(message); };
          const region = document.querySelector('#chase-status'), rr = region.getBoundingClientRect();
          ensure(document.documentElement.scrollWidth <= innerWidth, 'No horizontal overflow with warnings');
          ensure(rr.width > 0 && rr.left >= 0 && rr.right <= innerWidth && region.scrollHeight <= region.clientHeight + 1, 'Warning text visible, wrapped and unclipped');
          ensure(region.getAttribute('aria-live') === 'polite' && region.getAttribute('aria-atomic') === 'true', 'Polite atomic warning');
          const cells = [...document.querySelectorAll('.cell')], rects = cells.map(c => c.getBoundingClientRect());
          const xs = [...new Set(rects.map(r => Math.round(r.left)))].sort((a,b) => a-b);
          const ys = [...new Set(rects.map(r => Math.round(r.top)))].sort((a,b) => a-b);
          const vertical = document.querySelector('#board').dataset.orientation === 'vertical';
          cells.forEach((cell, i) => {
            const r = rects[i], p = cell.firstElementChild.getBoundingClientRect();
            ensure(cell === window.originalCells[i], 'Stable cell identity');
            ensure(Math.abs(p.width - p.height) < 1 && p.width >= r.width * .65, 'Round, full-size piece');
            ensure(Math.round(r.left) === xs[vertical ? Math.floor(i/8) : i%8] && Math.round(r.top) === ys[vertical ? i%8 : 3-Math.floor(i/8)], 'a1-h4 mapping unchanged');
            const marker = cell.querySelector('.chase-marker');
            if (marker) { const m = marker.getBoundingClientRect(); ensure(m.width >= 12 && m.left >= r.left && m.right <= r.right && m.top >= r.top && m.bottom <= r.bottom, 'Visible ! stays inside target'); }
          });
          const luminance = c => c.match(/[\\d.]+/g).slice(0,3).map(Number).map(v => v/255 <= .04045 ? v/255/12.92 : ((v/255+.055)/1.055)**2.4).reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
          const contrast = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
          const rs = getComputedStyle(region), ms = getComputedStyle(document.querySelector('.chase-marker'));
          ensure(contrast(rs.color,rs.backgroundColor) >= 4.5 && contrast(ms.color,ms.backgroundColor) >= 4.5, 'Warning and ! contrast >=4.5');
          ensure(getComputedStyle(document.activeElement).outlineWidth === '3px', 'Keyboard focus visible');
        })()`);
        await browser.screenshot(`chase-${width}-${height}-${theme}-${orientation}`);
      }
    }
    // Presentation changes did not reset fault/hold/count: this is still fault 2.
    await clickSquare("b2");
    await assertBoard(applyAction(state, 0, chaseLoop[2]).state);
    assert.match(await text("#game-status"), /Người 2 \(Đen\) thắng.*hai lỗi trường tróc/);
    t.diagnostic(`Ảnh cảnh báo R2-03B: ${browser.output}`);
  });

  const visual = fixture({ a1: piece("red", "rook"), b1: piece("black", "pawn"), c1: piece("red", "general"), d1: piece("black", "general"), e1: piece("red", "advisor"), f1: piece("black", "advisor"), g1: piece("red", "elephant"), h1: piece("black", "elephant"), b2: piece("red", "horse"), c2: piece("black", "horse"), d2: piece("red", "cannon"), e2: piece("black", "cannon"), f2: piece("red", "pawn"), g2: piece("black", "rook"), h2: piece("black", "horse", true), h4: piece("red", "pawn", true) });
  await load(visual);
  await clickSquare("a1");
  const layoutResults = [];
  const beforePresentation = await text("#game-status");
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 800]]) {
    for (const theme of ["light", "dark"]) for (const orientation of ["horizontal", "vertical"]) {
      await t.test(`Gameplay ${width}×${height} ${theme} ${orientation}: SVG, đích đi/ăn, không overflow`, async () => {
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
        await click(`button[data-theme=${theme}]`);
        await click(`button[data-orientation=${orientation}]`);
        layoutResults.push(await evaluate(`(${inspectGameplayLayout})()`));
        assert.equal(await text("#game-status"), beforePresentation);
        await browser.screenshot(`${width}-${height}-${theme}-${orientation}`);
      });
    }
  }
  await t.test("Chơi tiếp sau mọi thay đổi hướng/theme vẫn dùng đúng tọa độ và lượt", async () => {
    await clickSquare("b1"); // Selection at a1 survived all presentation changes.
    await assertBoard(applyAction(visual, 0, move("a1", "b1")).state);
  });
  await t.test("Không lỗi console, JavaScript hoặc tài nguyên HTTP", () => assert.deepEqual(browser.errors, []));
  const version = await send("Browser.getVersion");
  fs.writeFileSync(path.join(browser.output, "report.json"), JSON.stringify({ browser: version.product, layoutResults, browserErrors: browser.errors }, null, 2));
});
