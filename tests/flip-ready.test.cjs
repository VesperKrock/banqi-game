"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const launchChrome = require("./helpers/chrome.cjs");

function fixture() {
  const board = Array(32).fill(null), captured = [];
  board[0] = { color: "red", type: "advisor", faceDown: true };
  board[1] = { color: "black", type: "pawn", faceDown: true };
  board[8] = { color: "black", type: "pawn", faceDown: false };
  board[31] = { color: "red", type: "general", faceDown: true };
  for (const color of ["red", "black"]) for (const [type, count] of Object.entries({ general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 })) {
    for (let n = board.filter(p => p?.color === color && p.type === type).length; n < count; n++) captured.push({ color, type });
  }
  return { board, captured, turn: 0, playerColors: ["red", "black"], status: "playing", result: null, noProgressPly: 0, positionCounts: {} };
}

test("R3-UI02 — delayed flip never paints temporary Unicode", { timeout: 120000 }, async t => {
  const browser = await launchChrome({ suite: "flip-ready", cacheAssets: true });
  t.after(() => browser.close());
  const { evaluate, send } = browser;
  const frames = n => evaluate(`(async () => { for (let i=0;i<${n};i++) await new Promise(requestAnimationFrame); })()`);
  const idle = () => evaluate(`(async () => {
    while (document.querySelector('#board').dataset.animating || document.querySelector('#board .piece-pending')) await new Promise(requestAnimationFrame);
  })()`);
  const observe = () => evaluate(`(() => {
    window.flipFrames = []; window.stopFrames = false;
    function sample() {
      const face = document.querySelector('#cell-0 > .piece'), fallback = face.querySelector('.piece-fallback');
      const hidden = getComputedStyle(face).visibility === 'hidden';
      window.flipFrames.push({ unicode: !hidden && getComputedStyle(fallback).display !== 'none',
        svg: !hidden && face.classList.contains('piece-svg'), pending: face.classList.contains('piece-pending') });
      if (!window.stopFrames) requestAnimationFrame(sample);
    }
    document.querySelector('#cell-0').click(); sample();
  })()`);
  const noFlash = async () => {
    const samples = await evaluate("window.flipFrames");
    assert.ok(samples.length > 3);
    assert.ok(samples.every(frame => !frame.unicode), "No frame may show Unicode while SVG is pending/successful");
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const clean = async () => assert.deepEqual(await evaluate(`({ ghosts: document.querySelectorAll('.motion-back').length,
    animations: document.getAnimations().length, hidden: [...document.querySelectorAll('.piece')].filter(p => p.style.visibility).length,
    busy: document.querySelector('#board').dataset.animating ?? null })`), { ghosts: 0, animations: 0, hidden: 0, busy: null });
  const gateDecode = async () => send("Page.addScriptToEvaluateOnNewDocument", { source: `
    const realDecode = HTMLImageElement.prototype.decode;
    const gate = new Promise(resolve => { window.releaseDecode = resolve; });
    HTMLImageElement.prototype.decode = function() {
      const result = realDecode.call(this);
      return this.src.endsWith('/red/advisor.svg') ? result.then(() => gate) : result;
    };` });
  const load = async () => { await send("Network.clearBrowserCache"); browser.useGame(fixture()); await browser.navigate(); };

  await t.test("Cold HTTP SVG held past flip midpoint; release reveals decoded advisor", async () => {
    browser.useGame(fixture());
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    const release = browser.holdAsset("/assets/pieces/red/advisor.svg");
    const navigation = browser.navigate();
    try {
      await evaluate(`(async () => { while (!document.querySelector('#cell-0 img')) await new Promise(requestAnimationFrame); })()`);
      await observe();
      await frames(20);
      await noFlash();
      await browser.screenshot("desktop-pending");
      release(); await navigation; await idle(); await frames(2);
      await noFlash();
      assert.equal(await evaluate("document.querySelector('#cell-0 > .piece').classList.contains('piece-svg')"), true);
      assert.match(await evaluate("document.querySelector('#cell-0 img').src"), /red\/advisor.svg$/);
      await browser.screenshot("desktop-revealed");
      const counts = browser.assetRequestCounts();
      assert.equal(Object.keys(counts).length, 15, "Preload only 15 public templates");
      assert.equal(counts["/assets/pieces/red/advisor.svg"], 1, "Coalesce the cold SVG request");
      await click("#cell-1"); await idle();
      assert.deepEqual(browser.assetRequestCounts(), counts, "Warm consecutive flip reuses browser images");
      await evaluate("window.confirm = () => true"); await click("#new-game"); await idle();
      assert.deepEqual(browser.assetRequestCounts(), counts, "32 concealed pieces reuse the back");
      await clean();
    } finally { release(); await navigation; await evaluate("window.stopFrames = true"); }
  });

  await t.test("Mobile reduced motion waits for decode, not just load", async () => {
    const { identifier } = await gateDecode();
    try {
      await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await load(); await observe(); await frames(8);
      assert.equal(await evaluate("document.querySelector('#cell-0 img').complete"), true);
      await noFlash(); await clean();
      await browser.screenshot("mobile-pending");
      await evaluate("window.releaseDecode()"); await idle(); await frames(2); await noFlash();
      assert.equal(await evaluate("document.querySelector('#cell-0 > .piece').classList.contains('piece-svg')"), true);
      await browser.screenshot("mobile-revealed");
    } finally {
      await evaluate("window.stopFrames = true; window.releaseDecode()");
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    }
  });

  for (const control of ["theme", "resize", "orientation", "new-game", "reduced"]) await t.test(`Cancel pending decode: ${control}, no stale overlay/callback`, async () => {
    const { identifier } = await gateDecode();
    try {
      await load(); await observe(); await frames(3);
      if (control === "theme") await click("button[data-theme=dark]");
      if (control === "orientation") await click("button[data-orientation=horizontal]");
      if (control === "resize") await send("Emulation.setDeviceMetricsOverride", { width: 410, height: 844, deviceScaleFactor: 1, mobile: true });
      if (control === "new-game") { await evaluate("window.confirm = () => true"); await click("#new-game"); }
      if (control === "reduced") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await frames(4); await noFlash(); await clean();
      await evaluate("window.releaseDecode()"); await idle(); await frames(2); await clean();
      if (control === "new-game") assert.match(await evaluate("document.querySelector('#cell-0 img').src"), /\/back.svg$/);
      else {
        await noFlash();
        assert.match(await evaluate("document.querySelector('#cell-0 img').src"), /red\/advisor.svg$/);
      }
    } finally {
      await evaluate("window.stopFrames = true; window.releaseDecode()");
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    }
  });

  await t.test("Decode timeout is bounded; late success cannot replace Unicode", async () => {
    const { identifier } = await gateDecode();
    try {
      await load(); await observe(); await frames(6); await noFlash();
      await idle();
      assert.equal(await evaluate("getComputedStyle(document.querySelector('#cell-0 .piece-fallback')).display !== 'none'"), true);
      await evaluate("window.releaseDecode()"); await frames(5);
      assert.equal(await evaluate("document.querySelector('#cell-0 > .piece').classList.contains('piece-svg')"), false);
      await clean(); await click("#cell-1"); await idle();
      assert.match(await evaluate("document.querySelector('#cell-1').getAttribute('aria-label')"), /Tốt Đen/);
    } finally {
      await evaluate("window.stopFrames = true; window.releaseDecode()");
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  });

  for (const mode of ["missing", "invalid", "decode-reject"]) await t.test(`${mode}: valid fallback; subsequent flip/capture/move still work`, async () => {
    let identifier;
    if (mode === "decode-reject") ({ identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      HTMLImageElement.prototype.decode = function() { return Promise.reject(new DOMException('Fixture decode error', 'EncodingError')); };` }));
    else browser.useAssetFailure(mode);
    try {
      await load(); await idle(); await click("#cell-0"); await idle();
      assert.equal(await evaluate("document.querySelector('#cell-0 .piece-fallback').textContent"), "仕");
      assert.equal(await evaluate("getComputedStyle(document.querySelector('#cell-0 .piece-fallback')).display !== 'none'"), true);
      assert.equal(await evaluate("document.querySelector('#cell-0 > .piece').classList.contains('piece-svg')"), false);
      await click("#cell-1"); await idle();
      await click("#cell-0"); await click("#cell-8"); await idle();
      assert.match(await evaluate("document.querySelector('#cell-8').getAttribute('aria-label')"), /Sĩ Đỏ/);
      assert.match(await evaluate("document.querySelector('#cell-0').getAttribute('aria-label')"), /Ô trống/);
      await click("#cell-1"); await click("#cell-2"); await idle();
      assert.match(await evaluate("document.querySelector('#cell-2').getAttribute('aria-label')"), /Tốt Đen/);
      await clean();
    } finally {
      browser.useAssetFailure(null);
      if (identifier) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
    }
  });
  assert.deepEqual(browser.errors.filter(error => error.method !== "Log.entryAdded" || !/404/.test(error.params.entry.text)), []);
  t.diagnostic(`R3-UI02 screenshots: ${browser.output}`);
});
