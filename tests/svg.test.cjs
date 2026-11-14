"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const launchChrome = require("./helpers/chrome.cjs");
const root = path.resolve(__dirname, "..");
const types = ["general", "advisor", "elephant", "rook", "horse", "cannon", "pawn"];
const symbols = { red: [..."帥仕相俥傌炮兵"], black: [..."將士象車馬砲卒"] };
const assets = ["red", "black"].flatMap((color) => types.map((type, i) =>
  ({ color, type, symbol: symbols[color][i], file: `assets/pieces/${color}/${type}.svg` })));
assets.push({ file: "assets/pieces/back.svg", symbol: "?" });

function fixture() {
  const counts = { general: 1, advisor: 2, elephant: 2, rook: 2, horse: 2, cannon: 2, pawn: 5 };
  const board = Array(32).fill(null);
  assets.forEach((asset, i) => { board[i] = { color: asset.color ?? "red", type: asset.type ?? "pawn", faceDown: !asset.color }; });
  const captured = [];
  for (const color of ["red", "black"]) for (const [type, total] of Object.entries(counts)) {
    for (let n = board.filter((p) => p?.color === color && p.type === type).length; n < total; n++) captured.push({ color, type });
  }
  return { board, captured, turn: 0, playerColors: ["red", "black"], status: "playing", result: null, noProgressPly: 0, positionCounts: {} };
}

test("R2-04 manifest: đủ 15 SVG, giữ attribution/OFL, không phân phối font", () => {
  const files = fs.readdirSync(path.join(root, "assets/pieces"), { recursive: true }).filter((name) => /\.svg$/i.test(name));
  assert.deepEqual(files.map((file) => `assets/pieces/${file.replaceAll("\\", "/")}`).sort(), assets.map((a) => a.file).sort());
  assert.match(fs.readFileSync(path.join(root, "assets/pieces/ASSET_README.md"), "utf8"), /Noto Serif CJK TC Bold.*SIL OFL 1\.1/);
  const license = fs.readFileSync(path.join(root, "assets/pieces/FONT_LICENSE_OFL.txt"), "utf8");
  assert.match(license, /Copyright: 2010-2012, Google Corporation/);
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.equal(fs.readdirSync(path.join(root, "assets/pieces"), { recursive: true }).some((name) => /\.(?:otf|ttf|woff2?)$/i.test(name)), false);
});

test("Chrome R2-04 — SVG thật, đường dẫn thư mục con và fallback", { timeout: 120000 }, async (t) => {
  const browser = await launchChrome({ suite: "svg", basePath: "/banqi/" });
  t.after(() => browser.close());
  const { send, evaluate, navigate } = browser;
  const settle = () => evaluate(`Promise.all(Array.from(document.querySelectorAll('.piece-image'), image => image.decode().catch(() => {}))).then(() => new Promise(requestAnimationFrame))`);
  const click = async (selector) => { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await settle(); };
  const load = async (state) => { browser.useGame(state); await navigate(); await settle(); };
  const report = { assets: [], expectedMissingErrors: [], sizes: [] };
  const expectedErrors = new Set();
  await load(null);

  for (const asset of assets) await t.test(`Vector/XML/an toàn/render thật: ${asset.file}`, async () => {
    const result = await evaluate(`(async (asset) => {
      const ensure = (ok, message) => { if (!ok) throw new Error(message); };
      const response = await fetch('./' + asset.file);
      ensure(response.status === 200 && response.headers.get('Content-Type').startsWith('image/svg+xml'), 'HTTP 200 SVG MIME');
      const source = await response.text();
      ensure(!/<!DOCTYPE|<!ENTITY/i.test(source), 'No DTD/entities');
      const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
      ensure(!xml.querySelector('parsererror'), 'Valid SVG/XML');
      const svg = xml.documentElement;
      ensure(svg.localName === 'svg' && svg.namespaceURI === 'http://www.w3.org/2000/svg', 'SVG namespace');
      ensure(svg.getAttribute('viewBox') === '0 0 256 256' && svg.getAttribute('width') === '256' && svg.getAttribute('height') === '256', 'Square 256 vector canvas');
      const allowed = new Set(['svg','title','desc','defs','radialGradient','linearGradient','stop','circle','ellipse','path','g','clipPath','use']);
      const ids = new Set();
      for (const node of xml.querySelectorAll('*')) {
        ensure(allowed.has(node.localName) && node.namespaceURI === svg.namespaceURI, 'Only inert vector elements: ' + node.localName);
        if (node.id) { ensure(!ids.has(node.id), 'Unique IDs'); ids.add(node.id); }
        for (const attr of node.attributes) {
          if (attr.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue;
          ensure(!/^on/i.test(attr.localName), 'No event handlers');
          ensure(!/javascript:|data:|https?:|@import|@font-face/i.test(attr.value) && !attr.value.includes('//'), 'No external or raster/font resources');
          if (attr.localName === 'href') ensure(/^#[\\w-]+$/.test(attr.value) && xml.getElementById(attr.value.slice(1)), 'Local href resolves');
          for (const match of attr.value.matchAll(/url\\(([^)]+)\\)/g)) ensure(/^#[\\w-]+$/.test(match[1]) && xml.getElementById(match[1].slice(1)), 'Local paint/clip reference resolves');
        }
      }
      ensure(xml.querySelectorAll('path[d]').length > 10, 'Actual vector paths');
      if (asset.color) {
        ensure(xml.querySelector('title').textContent.includes(asset.color + '-' + asset.type) && xml.querySelector('title').textContent.includes(asset.symbol), 'Correct color/type/glyph title');
        ensure(xml.getElementById('glyph-' + asset.color + '-' + asset.type)?.getAttribute('d').length > 100, 'Glyph is an outline, not a font');
      } else ensure(/neutral unmarked back/i.test(xml.querySelector('desc').textContent), 'Common neutral concealed side');
      const image = new Image(); image.src = './' + asset.file; await image.decode();
      ensure(image.naturalWidth === 256 && image.naturalHeight === 256, 'Chrome decoded vector image');
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, 256, 256).data;
      let opaque = 0; const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i+3] > 128) { opaque++; colors.add(pixels.slice(i,i+3).join(',')); }
      ensure(opaque > 20000 && colors.size > 100, 'Rendered artwork is nonempty with vector shading');
      return {file: asset.file, viewBox: svg.getAttribute('viewBox'), paths: xml.querySelectorAll('path[d]').length, opaquePixels: opaque, colors: colors.size};
    })(${JSON.stringify(asset)})`);
    report.assets.push(result);
  });

  await t.test("Mapping đủ 15 ảnh dưới /banqi/: đúng URL, alt/ARIA; quân úp đồng nhất; Ván mới 32 mặt úp", async () => {
    await load(fixture());
    const images = await evaluate(`Array.from(document.querySelectorAll('.piece-image'), image => ({src: new URL(image.src).pathname, alt: image.alt, hidden: image.getAttribute('aria-hidden'), ready: image.complete && image.naturalWidth === 256, face: image.parentElement.classList.contains('piece-svg'), fallback: image.previousElementSibling.textContent, fallbackDisplay: getComputedStyle(image.previousElementSibling).display}))`);
    assert.equal(images.length, 15);
    images.forEach((image, i) => assert.deepEqual(image, { src: `/banqi/${assets[i].file}`, alt: "", hidden: "true", ready: true, face: true, fallback: assets[i].symbol, fallbackDisplay: "none" }));
    assert.equal(await evaluate("document.querySelector('#cell-14').getAttribute('aria-label')"), "Quân úp tại g2");
    assert.doesNotMatch(await evaluate("document.querySelector('#cell-14').outerHTML"), /red|black|pawn|兵|卒|data-(?:type|color)/);
    await click("#new-game");
    const backs = await evaluate(`Array.from(document.querySelectorAll('.piece-image'), image => ({src: image.getAttribute('src'), ready: image.complete && image.naturalWidth === 256, html: image.outerHTML}))`);
    assert.equal(backs.length, 32);
    assert.equal(new Set(backs.map((image) => image.html)).size, 1);
    assert.ok(backs.every((image) => image.src === "./assets/pieces/back.svg" && image.ready));
    assert.doesNotMatch(await evaluate("document.querySelector('#board').outerHTML"), /red|black|data-(?:type|color)|visibleId/);
  });

  await t.test("Tất cả 15 SVG rõ ở 40/50/60 px, cả Sáng/Tối; xem bóng và chữ không bị cắt", async () => {
    await load(fixture());
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate(`(() => {
      const section = document.createElement('section'); section.id = 'svg-qa';
      Object.assign(section.style, {padding:'20px', background:'var(--cell-bg)', color:'var(--text)', width:'1120px'});
      for (const size of [40,50,60]) {
        const heading = document.createElement('p'); heading.textContent = size + ' px — 7 Đỏ / 7 Đen / mặt úp'; section.append(heading);
        const row = document.createElement('div'); Object.assign(row.style, {display:'flex', gap:'12px', padding:'8px 0'});
        for (const face of [...document.querySelectorAll('.piece-svg')]) { const clone = face.cloneNode(true); clone.style.width = size + 'px'; clone.style.flex = 'none'; row.append(clone); }
        section.append(row);
      }
      document.body.append(section);
    })()`);
    await settle();
    for (const theme of ["light", "dark"]) {
      await click(`button[data-theme=${theme}]`);
      const sizes = await evaluate(`Array.from(document.querySelectorAll('#svg-qa img'), image => { const r = image.getBoundingClientRect(); return {width:r.width, height:r.height, ready:image.complete && image.naturalWidth === 256, objectFit:getComputedStyle(image).objectFit}; })`);
      assert.equal(sizes.length, 45);
      sizes.forEach((size, i) => assert.deepEqual(size, {width: [40,50,60][Math.floor(i/15)], height: [40,50,60][Math.floor(i/15)], ready:true, objectFit:"contain"}));
      const clip = await evaluate(`(() => { const r = document.querySelector('#svg-qa').getBoundingClientRect(); return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}; })()`);
      const { data } = await send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true, clip});
      fs.writeFileSync(path.join(browser.output, `svg-40-50-60-${theme}.png`), Buffer.from(data, "base64"));
      report.sizes.push({theme, count:sizes.length, widths:[40,50,60]});
    }
    await evaluate("document.querySelector('#svg-qa').remove()");
  });

  for (const mode of ["invalid", "missing"]) await t.test(`Fallback 15 ảnh khi ${mode === "missing" ? "HTTP 404" : "SVG lỗi decode"}: Unicode đúng, không retry khi chọn/đổi theme/hướng`, async () => {
    const errorStart = browser.errors.length;
    browser.useAssetFailure(mode);
    try {
      await load(fixture());
      const before = browser.assetRequestCounts();
      const faces = await evaluate(`Array.from(document.querySelectorAll('.piece-image'), image => ({fallback:image.previousElementSibling.textContent, imageDisplay:getComputedStyle(image).display, fallbackDisplay:getComputedStyle(image.previousElementSibling).display, failed:image.complete && image.naturalWidth === 0, svg:image.parentElement.classList.contains('piece-svg')}))`);
      assert.equal(faces.length, 15);
      faces.forEach((face, i) => {
        assert.equal(face.fallback, assets[i].symbol);
        assert.equal(face.imageDisplay, "none");
        assert.notEqual(face.fallbackDisplay, "none");
        assert.equal(face.failed, true);
        assert.equal(face.svg, false);
      });
      for (const theme of ["light", "dark"]) for (const direction of ["horizontal", "vertical"]) {
        await click(`button[data-theme=${theme}]`); await click(`button[data-orientation=${direction}]`);
        await click("#cell-0"); await click("#cell-0");
      }
      assert.deepEqual(browser.assetRequestCounts(), before, "Rendering/selection does not retry failed URLs");
      assert.equal(await evaluate("document.querySelector('#cell-14').getAttribute('aria-label')"), "Quân úp tại g2");
      assert.doesNotMatch(await evaluate("document.querySelector('#cell-14').outerHTML"), /red|black|pawn|兵|卒/);
      await browser.screenshot(`fallback-${mode}`);
      const failures = browser.errors.slice(errorStart);
      if (mode === "missing") {
        assert.ok(failures.length > 0, "Expected 404s are observed, not silently ignored");
        for (const error of failures) {
          assert.equal(error.method, "Log.entryAdded");
          assert.match(error.params.entry.text, /404/);
          const url = new URL(error.params.entry.url);
          assert.ok(assets.some((asset) => url.pathname === `/banqi/${asset.file}`));
          expectedErrors.add(error);
        }
        report.expectedMissingErrors = failures.map((error) => ({url: error.params.entry.url, text: error.params.entry.text}));
      } else assert.deepEqual(failures, []);
    } finally { browser.useAssetFailure(null); }
  });

  await t.test("Hết lỗi tài nguyên: trang mới tải SVG lại; không lỗi console/network ngoài fixture 404", async () => {
    await load(fixture());
    assert.equal(await evaluate("document.querySelectorAll('.piece-svg').length"), 15);
    assert.deepEqual(browser.errors.filter((error) => !expectedErrors.has(error)), []);
    assert.equal(await evaluate("['privateState','publicState','legalActions'].some(key => key in window)"), false);
  });
  report.browser = (await send("Browser.getVersion")).product;
  report.unexpectedErrors = browser.errors.filter((error) => !expectedErrors.has(error));
  fs.writeFileSync(path.join(browser.output, "report.json"), JSON.stringify(report, null, 2));
  t.diagnostic(`Ảnh và kiểm toán SVG R2-04: ${browser.output}`);
});
