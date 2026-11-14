"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const launchChrome = require("./helpers/chrome.cjs");

// Runs in the real page. Expected positions are independent of app.js exports.
function inspectBoard(theme, orientation) {
  const ensure = (condition, message) => { if (!condition) throw new Error(message); };
  const board = document.getElementById("board");
  const cells = [...board.children];
  const vertical = orientation === "vertical";
  const columns = vertical ? 4 : 8, rows = vertical ? 8 : 4;
  ensure(document.documentElement.dataset.theme === theme, "Theme");
  ensure(board.dataset.orientation === orientation, "Orientation");
  ensure(cells.length === 32 && new Set(cells.map((cell) => cell.id)).size === 32, "32 unique IDs");
  ensure(!document.querySelector(".cell-coordinate"), "No debug labels inside cells");
  ensure(document.documentElement.scrollWidth <= innerWidth, "No horizontal overflow");
  const rects = cells.map((cell) => cell.getBoundingClientRect());
  const lefts = [...new Set(rects.map((rect) => Math.round(rect.left)))].sort((a, b) => a - b);
  const tops = [...new Set(rects.map((rect) => Math.round(rect.top)))].sort((a, b) => a - b);
  ensure(lefts.length === columns && tops.length === rows, "Physical grid dimensions");
  for (let id = 0; id < 32; id += 1) {
    const cell = cells[id], rect = rects[id];
    const x = id % 8, y = Math.floor(id / 8), label = "abcdefgh"[x] + (y + 1);
    ensure(cell === window.originalCells[id] && cell.id === `cell-${id}`, "Stable DOM identity");
    ensure(cell.dataset.x === String(x) && cell.dataset.y === String(y), "Stable logical coordinates");
    ensure(cell.title.includes(label) && cell.getAttribute("aria-label") === `Quân úp tại ${label}`, "Accessible coordinate");
    ensure(cell.tabIndex === 0, "Keyboard access to cell coordinate");
    ensure(Math.round(rect.left) === lefts[vertical ? y : x] && Math.round(rect.top) === tops[vertical ? x : 3 - y], "Physical mapping");
    const image = cell.querySelector("img");
    ensure(cell.children.length === 1 && cell.textContent === "?", "Only neutral face and its fallback inside cell");
    ensure(image?.getAttribute("src") === "./assets/pieces/back.svg" && image.complete && image.naturalWidth === 256, "Loaded common back SVG");
    ensure(cell.firstElementChild.classList.contains("piece-svg") && getComputedStyle(cell.querySelector(".piece-fallback")).display === "none", "SVG replaces the fallback visually");
    ensure(image.alt === "" && image.getAttribute("aria-hidden") === "true", "Decorative SVG preserves cell label");
    const piece = cell.firstElementChild.getBoundingClientRect();
    ensure(piece.left >= rect.left && piece.right <= rect.right && piece.top >= rect.top && piece.bottom <= rect.bottom, "Piece fits cell");
    ensure(Math.abs(piece.width - piece.height) < 1 && piece.width >= rect.width * 0.65, "Face-down piece stays circular and readable");
  }
  const axes = [document.getElementById("axis-left"), document.getElementById("axis-bottom")];
  ensure(axes[0].textContent === (vertical ? "abcdefgh" : "4321"), "Left axis order");
  ensure(axes[1].textContent === (vertical ? "1234" : "abcdefgh"), "Bottom axis order");
  const boardRect = board.getBoundingClientRect();
  axes.forEach((axis, side) => [...axis.children].forEach((label, index) => {
    const rect = label.getBoundingClientRect();
    const cell = rects.find((candidate) => Math.round(side === 0 ? candidate.top : candidate.left) === (side === 0 ? tops : lefts)[index]);
    ensure(side === 0 ? rect.right < boardRect.left : rect.top > boardRect.bottom, "Axis outside board");
    ensure(Math.abs(side === 0 ? (rect.top + rect.height / 2) - (cell.top + cell.height / 2) : (rect.left + rect.width / 2) - (cell.left + cell.width / 2)) < 1, "Axis centered on corresponding cells");
  }));
  for (const element of [board, ...cells, ...document.querySelectorAll(".piece, .axis, .axis span")]) {
    ensure(getComputedStyle(element).transform === "none", "Board, text and pieces upright");
  }
  for (const attribute of ["theme", "orientation"]) {
    const buttons = [...document.querySelectorAll(`button[data-${attribute}]`)];
    ensure(buttons.filter((button) => button.getAttribute("aria-pressed") === "true").length === 1, "One selected button per group");
    for (const button of buttons) {
      const selected = button.dataset[attribute] === (attribute === "theme" ? theme : orientation);
      ensure(button.getAttribute("aria-pressed") === String(selected), "Correct pressed state");
      ensure(getComputedStyle(button.firstElementChild).visibility === (selected ? "visible" : "hidden"), "Selection has visible check mark");
      ensure(button.getBoundingClientRect().height >= 44, "Mobile button height");
    }
  }
  return { theme, orientation, width: innerWidth, height: innerHeight, cells: cells.length };
}

function contrastReport() {
  const style = getComputedStyle(document.documentElement);
  const luminance = (color) => {
    const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  const text = document.querySelectorAll("h1, header > p:last-child, .notice, .eyebrow, .board-status, .board-help, .axis, .piece:not(.piece-svg), button");
  const ratios = [...text].map((element) => {
    const css = getComputedStyle(element);
    return ratio(css.color, css.backgroundColor === "rgba(0, 0, 0, 0)" ? style.backgroundColor : css.backgroundColor);
  });
  // Resolve custom colors through a real element, not a separate palette copy.
  const probe = document.createElement("span");
  probe.style.color = "var(--focus)";
  document.body.append(probe);
  const focus = getComputedStyle(probe).color;
  probe.remove();
  return { minimumText: Math.min(...ratios), focusOnPage: ratio(focus, style.backgroundColor), focusOnCell: ratio(focus, getComputedStyle(document.querySelector(".cell")).backgroundColor) };
}

test("Chrome hồi quy R0-02 — HTTP, tọa độ và theme", { timeout: 90000 }, async (t) => {
  const browser = await launchChrome();
  t.after(() => browser.close());
  const { send, evaluate, navigate } = browser;
  const layoutResults = [], contrasts = {};
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const inspect = (theme, direction) => evaluate(`(${inspectBoard})(${JSON.stringify(theme)}, ${JSON.stringify(direction)})`);
  const system = (value) => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value }, { name: "prefers-reduced-motion", value: "reduce" }] });
  const viewport = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
  const key = async (key, code, windowsVirtualKeyCode, text) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, ...(text ? { text, unmodifiedText: text } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
  };
  const waitTheme = (theme) => evaluate(`new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => document.documentElement.dataset.theme === '${theme}' ? resolve(true) : ++tries > 100 ? reject(new Error('Theme timeout')) : setTimeout(check, 10);
    check();
  })`);
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    new MutationObserver(function (_, observer) {
      if (document.body) { window.themeAtBody = document.documentElement.dataset.theme; observer.disconnect(); }
    }).observe(document, { childList: true, subtree: true });
  ` });
  await system("light");
  await navigate();

  await t.test("Lần đầu theo hệ thống sáng/tối, cập nhật khi hệ thống đổi", async () => {
    assert.equal(await evaluate("localStorage.getItem('banqi-theme')"), null);
    await inspect("light", "horizontal");
    await system("dark");
    await waitTheme("dark");
    await inspect("dark", "horizontal");
    await navigate();
    assert.equal(await evaluate("window.themeAtBody"), "dark");
    await inspect("dark", "horizontal");
  });

  await t.test("Lưu thủ công, mở lại ưu tiên lựa chọn; theme có trước body", async () => {
    for (const theme of ["light", "dark"]) {
      const opposite = theme === "light" ? "dark" : "light";
      await click(`button[data-theme=${theme}]`);
      assert.equal(await evaluate("localStorage.getItem('banqi-theme')"), theme);
      await system(opposite);
      await navigate();
      await inspect(theme, "horizontal");
      assert.equal(await evaluate("window.themeAtBody"), theme);
    }
  });

  await t.test("Giá trị lưu không hợp lệ quay về ưu tiên hệ thống", async () => {
    await evaluate("localStorage.setItem('banqi-theme', 'invalid')");
    await system("light");
    await navigate();
    await inspect("light", "horizontal");
  });

  await t.test("Storage bị chặn: mở trang, chọn theme và đổi hướng vẫn chạy", async () => {
    const { identifier } = await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked for test', 'SecurityError'); } });
    ` });
    try {
      await system("dark");
      await navigate();
      await inspect("dark", "horizontal");
      await click("button[data-theme=light]");
      await click("button[data-orientation=vertical]");
      await inspect("light", "vertical");
      await system("light");
      await system("dark");
      await inspect("light", "vertical");
    } finally {
      await send("Page.removeScriptToEvaluateOnNewDocument", { identifier });
      await navigate();
    }
  });

  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1280, 800]]) {
    for (const theme of ["light", "dark"]) {
      for (const orientation of ["horizontal", "vertical"]) {
        await t.test(`${width}×${height} ${theme} ${orientation}`, async () => {
          await viewport(width, height);
          await click(`button[data-theme=${theme}]`);
          await click(`button[data-orientation=${orientation}]`);
          layoutResults.push(await inspect(theme, orientation));
          await browser.screenshot(`${width}-${height}-${theme}-${orientation}`);
        });
      }
    }
  }

  await t.test("100 vòng đổi hướng/theme giữ 32 phần tử, dữ liệu và focus", async () => {
    await evaluate(`document.getElementById('cell-0').focus(); window.beforeBoard = document.getElementById('board').outerHTML`);
    for (let i = 0; i < 100; i += 1) {
      for (const direction of ["horizontal", "vertical"]) {
        await click(`button[data-orientation=${direction}]`);
        for (const theme of ["light", "dark"]) {
          await click(`button[data-theme=${theme}]`);
          await inspect(theme, direction);
          assert.equal(await evaluate("document.activeElement.id"), "cell-0");
        }
      }
    }
    assert.equal(await evaluate("document.getElementById('board').outerHTML === window.beforeBoard"), true);
  });

  for (const theme of ["light", "dark"]) {
    await t.test(`Bàn phím, cây accessibility, tương phản: ${theme}`, async () => {
      await viewport(1280, 800);
      await click(`button[data-theme=${theme}]`);
      await evaluate("document.querySelector('button[data-theme=light]').focus()");
      await key("Tab", "Tab", 9);
      assert.equal(await evaluate("document.activeElement.dataset.theme"), "dark");
      await key("Enter", "Enter", 13, "\r");
      await inspect("dark", "vertical");
      await evaluate("document.querySelector('button[data-theme=light]').focus()");
      await key(" ", "Space", 32, " ");
      await inspect("light", "vertical");
      await click(`button[data-theme=${theme}]`);
      await evaluate("document.querySelector('button[data-orientation=horizontal]').focus()");
      await key("Tab", "Tab", 9);
      await key("Enter", "Enter", 13, "\r");
      await inspect(theme, "vertical");
      assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"), "solid");
      await key("Tab", "Tab", 9);
      assert.equal(await evaluate("document.activeElement.id"), "cell-0");
      assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineWidth"), "3px");
      const { nodes } = await send("Accessibility.getFullAXTree");
      for (const name of ["Sáng", "Tối", "Ngang", "Dọc"]) {
        assert.ok(nodes.some((node) => node.role?.value === "button" && node.name?.value === name && node.properties.some((property) => property.name === "pressed")), name);
      }
      for (const label of ["a1", "h4"]) assert.ok(nodes.some((node) => node.role?.value === "button" && node.name?.value === `Quân úp tại ${label}`));
      contrasts[theme] = await evaluate(`(${contrastReport})()`);
      assert.ok(contrasts[theme].minimumText >= 4.5, JSON.stringify(contrasts[theme]));
      assert.ok(contrasts[theme].focusOnPage >= 3 && contrasts[theme].focusOnCell >= 3);
    });
  }

  await t.test("Nút theme dùng được với chuột và cảm ứng", async () => {
    await viewport(390, 844);
    await evaluate("scrollTo(0, 0)");
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    const center = (selector) => evaluate(`(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const touch = await center("button[data-theme=dark]");
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touch] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await waitTheme("dark");
    await inspect("dark", "vertical");
    await send("Emulation.setTouchEmulationEnabled", { enabled: false });
    const mouse = await center("button[data-theme=light]");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...mouse, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...mouse, button: "left", clickCount: 1 });
    await inspect("light", "vertical");
  });

  await t.test("Tắt JavaScript: nền và chữ vẫn theo theme hệ thống", async () => {
    await send("Emulation.setScriptExecutionDisabled", { value: true });
    try {
      for (const theme of ["light", "dark"]) {
        await system(theme);
        await navigate();
        assert.equal(await evaluate("document.documentElement.dataset.theme"), undefined);
        assert.equal(await evaluate("getComputedStyle(document.documentElement).colorScheme"), theme);
        assert.equal(await evaluate("getComputedStyle(document.documentElement).backgroundColor"), theme === "dark" ? "rgb(32, 38, 44)" : "rgb(247, 244, 237)");
        assert.ok(await evaluate("document.querySelector('noscript').innerText.includes('bật JavaScript')"));
      }
    } finally {
      await send("Emulation.setScriptExecutionDisabled", { value: false });
    }
  });

  await t.test("Không lỗi JavaScript, console hoặc tải tài nguyên", () => assert.deepEqual(browser.errors, []));
  const version = await send("Browser.getVersion");
  fs.writeFileSync(path.join(browser.output, "report.json"), JSON.stringify({ browser: version.product, layoutResults, contrasts, browserErrors: browser.errors }, null, 2));
});
