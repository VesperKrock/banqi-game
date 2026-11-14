"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const launchChrome = require("./helpers/chrome.cjs");

function fixture(capture = false) {
  const board = Array(32).fill(null), captured = [];
  board[0] = { color: "red", type: "rook", faceDown: false };
  board[capture ? 1 : 31] = { color: "black", type: "pawn", faceDown: false };
  board[30] = { color: "black", type: "general", faceDown: true };
  for (const color of ["red", "black"]) for (const [type, count] of Object.entries({ general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 })) {
    for (let n = board.filter(p => p?.color === color && p.type === type).length; n < count; n++) captured.push({ color, type });
  }
  return { board, captured, turn: 0, playerColors: ["red", "black"], status: "playing", result: null, noProgressPly: 0, positionCounts: {} };
}

test("Chrome R3 — animation et SFX Offline", { timeout: 120000 }, async (t) => {
  const browser = await launchChrome({ suite: "effects", basePath: "/banqi/" });
  t.after(() => browser.close());
  const { send, evaluate, navigate } = browser;
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const idle = () => evaluate(`(async () => {
    while (document.querySelector('#board').dataset.animating) await new Promise(requestAnimationFrame);
    await Promise.all([...document.querySelectorAll('.piece-image')].map(i => i.decode().catch(() => {})));
  })()`);
  const reduced = value => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value }] });
  const load = async (state = null) => { browser.useGame(state); await navigate(); await idle(); };
  const clean = async () => assert.deepEqual(await evaluate(`({ ghosts: document.querySelectorAll('.motion-back').length,
    animations: document.getAnimations().length, hidden: [...document.querySelectorAll('.piece')].filter(p => p.style.visibility).length,
    busy: document.querySelector('#board').dataset.animating ?? null })`), { ghosts: 0, animations: 0, hidden: 0, busy: null });
  const report = { audio: [], scenarios: [] };
  await load();
  await t.test("3 MP3 thật: MIME, bytes, decode và độ dài, không phụ thuộc autoplay", async () => {
    report.audio = await evaluate(`Promise.all(['flip','move','capture'].map(async name => {
      const response = await fetch('./assets/sfx/' + name + '.mp3');
      const bytes = (await response.arrayBuffer()).byteLength;
      const audio = new Audio('./assets/sfx/' + name + '.mp3');
      await new Promise((resolve, reject) => { audio.onloadeddata = resolve; audio.onerror = () => reject(Error(name + ' decode')); audio.load(); });
      return { name, status: response.status, mime: response.headers.get('Content-Type'), bytes, duration: audio.duration, ready: audio.readyState };
    }))`);
    for (const clip of report.audio) {
      assert.equal(clip.status, 200); assert.match(clip.mime, /^audio\/mpeg/);
      assert.equal(clip.bytes, { flip: 5460, move: 2680, capture: 4310 }[clip.name]);
      assert.ok(clip.duration > 0.05 && clip.duration < 0.5); assert.ok(clip.ready >= 2);
    }
  });
  const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.audioCalls = []; window.audioMade = []; window.unhandled = [];
    addEventListener('unhandledrejection', event => window.unhandled.push(String(event.reason)));
    window.Audio = class extends EventTarget {
      constructor(src) { super(); this.src = src; this.currentTime = 0; window.audioMade.push(this); }
      pause() { window.audioCalls.push({ type: 'pause', src: this.src }); }
      play() { window.audioCalls.push({ type: 'play', src: this.src, volume: this.volume });
        if (window.failSound) this.dispatchEvent(new Event('error'));
        return window.rejectSound ? Promise.reject(new DOMException('Blocked', 'NotAllowedError')) : Promise.resolve(); }
    };` });
  const plays = () => evaluate(`window.audioCalls.filter(c => c.type === 'play')`);

  await t.test("Lật 220ms: commit ngay, đổi mặt giữa chừng, chặn click thứ hai", async () => {
    await reduced("no-preference"); await load();
    const nextPlayer = await evaluate(`3 - Number(document.querySelector('#game-status').textContent.match(/Người ([12])/)[1])`);
    const before = await evaluate(`[...document.querySelectorAll('.cell img')].map(i => i.getAttribute('src'))`);
    assert.equal(new Set(before).size, 1); assert.equal(before[0], "./assets/pieces/back.svg");
    const immediate = await evaluate(`(() => {
      document.querySelector('#cell-0').click(); document.querySelector('#cell-1').click();
      return { busy: document.querySelector('#board').dataset.animating,
        turn: document.querySelector('#game-status').textContent,
        hidden: document.querySelector('#cell-0 > .piece').style.visibility,
        back: document.querySelector('.motion-back img').getAttribute('src'),
        untouched: document.querySelector('#cell-1').getAttribute('aria-label'),
        duration: document.getAnimations()[0].effect.getTiming().duration };
    })()`);
    assert.equal(immediate.busy, "flip"); assert.match(immediate.turn, new RegExp(`Người ${nextPlayer}`));
    assert.equal(immediate.hidden, "hidden"); assert.equal(immediate.back, "./assets/pieces/back.svg");
    assert.equal(immediate.untouched, "Quân úp tại b1"); assert.equal(immediate.duration, 110);
    // Finish phase one deterministically, inspect the actual second phase.
    const second = await evaluate(`(async () => { document.getAnimations()[0].finish(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return { back: !!document.querySelector('.motion-back'), hidden: document.querySelector('#cell-0 > .piece').style.visibility,
        duration: document.getAnimations()[0]?.effect.getTiming().duration }; })()`);
    assert.deepEqual(second, { back: false, hidden: "", duration: 110 });
    await idle(); await clean(); assert.equal((await plays()).length, 1);
  });

  for (const capture of [false, true]) await t.test(`${capture ? "Ăn" : "Đi"}: slide 160ms, đúng một SFX, chọn/invalid im lặng`, async () => {
    await load(fixture(capture));
    await click("#cell-3"); await click("#cell-0"); assert.equal((await plays()).length, 0);
    const motion = await evaluate(`(() => { document.querySelector('#cell-1').click();
      return { kind: document.querySelector('#board').dataset.animating,
        duration: document.getAnimations()[0].effect.getTiming().duration,
        origin: document.getAnimations()[0].effect.getKeyframes()[0].transform,
        source: document.querySelector('#cell-0').textContent,
        target: document.querySelector('#cell-1').getAttribute('aria-label') }; })()`);
    assert.equal(motion.kind, capture ? "capture" : "move"); assert.equal(motion.duration, 160);
    assert.match(motion.origin, /translate\(/); assert.equal(motion.source, ""); assert.match(motion.target, /Xe Đỏ/);
    const calls = await plays(); assert.equal(calls.length, 1);
    assert.equal(calls[0].src, `./assets/sfx/${capture ? "capture" : "move"}.mp3`); assert.equal(calls[0].volume, 0.35);
    await idle(); await clean();
  });

  await t.test("Reduced motion: nước cập nhật ngay, không animation/ghost", async () => {
    await reduced("reduce"); await load();
    const nextPlayer = await evaluate(`3 - Number(document.querySelector('#game-status').textContent.match(/Người ([12])/)[1])`);
    await click("#cell-0"); await clean();
    assert.match(await evaluate(`document.querySelector('#game-status').textContent`), new RegExp(`Người ${nextPlayer}`));
    assert.equal((await plays()).length, 1); await reduced("no-preference");
  });
  for (const control of ["theme", "orientation", "new-game", "reduced"]) await t.test(`Hủy khi đổi ${control}: không callback/ghost cũ`, async () => {
    await load();
    await evaluate(`window.confirm = () => true; document.querySelector('#cell-0').click();
      ${control === "theme" ? "document.querySelector('button[data-theme=dark]').click();" : control === "orientation" ? "document.querySelector('button[data-orientation=vertical]').click();" : control === "new-game" ? "document.querySelector('#new-game').click();" : ""}`);
    if (control === "reduced") await reduced("reduce");
    await idle(); await clean();
    await evaluate(`new Promise(resolve => setTimeout(resolve, 260))`); await clean();
    const label = await evaluate(`document.querySelector('#cell-0').getAttribute('aria-label')`);
    if (control === "new-game") assert.equal(label, "Quân úp tại a1"); else assert.doesNotMatch(label, /Quân úp/);
    await reduced("no-preference");
  });
  await t.test("Mute, lưu/reload; render/theme/hướng không phát thêm", async () => {
    await load(); await click("#sound-toggle");
    assert.equal(await evaluate(`document.querySelector('#sound-toggle').getAttribute('aria-pressed')`), "false");
    await click("#cell-0"); await idle(); assert.equal((await plays()).length, 0);
    await load(); assert.match(await evaluate(`document.querySelector('#sound-toggle').textContent`), /Tắt/);
    await click("#sound-toggle"); await click("#cell-0"); await idle();
    await click("button[data-theme=light]"); await click("button[data-orientation=vertical]");
    assert.equal((await plays()).length, 1);
    await click("#cell-1"); await idle();
    assert.equal(await evaluate(`window.audioMade.length`), 1, "Reuse the same flip clip");
    assert.ok(await evaluate(`window.audioCalls.some(c => c.type === 'pause')`));
  });
  await t.test("Storage chặn vẫn bật/tắt trong phiên", async () => {
    const { identifier: storageScript } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });` });
    await load(); await click("#sound-toggle"); await click("#cell-0"); await idle(); assert.equal((await plays()).length, 0);
    await click("#sound-toggle"); await click("#cell-1"); await idle(); assert.equal((await plays()).length, 1);
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: storageScript });
  });
  await t.test("Autoplay reject và file lỗi: ván tiếp tục, không retry/unhandled", async () => {
    await load(); await evaluate(`window.rejectSound = true; window.failSound = true;`);
    await click("#cell-0"); await idle(); await click("#cell-1"); await idle();
    assert.equal((await plays()).length, 1);
    assert.deepEqual(await evaluate(`window.unhandled`), []);
    assert.doesNotMatch(await evaluate(`document.querySelector('#cell-1').getAttribute('aria-label')`), /Quân úp/);
  });
  await t.test("Manifest thiếu: nút vô hiệu, không tạo Audio/request", async () => {
    await load();
    const state = await evaluate(`(async () => { const { createSound } = await import('./js/effects.mjs');
      const button = document.createElement('button'), count = window.audioMade.length;
      createSound(button, {}).play({ type: 'flip' });
      return { disabled: button.disabled, label: button.textContent, count: window.audioMade.length - count }; })()`);
    assert.deepEqual(state, { disabled: true, label: "Âm thanh: Không khả dụng", count: 0 });
  });
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
  assert.deepEqual(browser.errors, []);
  fs.writeFileSync(path.join(browser.output, "report.json"), JSON.stringify(report, null, 2));
  t.diagnostic(`QA R3: ${browser.output}`);
});
