"use strict";

// Test-only HTTP server. Explicit routes cannot serve credentials or local files.
// Fixture substitution changes only createGame in the served test module; the
// production controller has no setup/debug endpoint and all actions use R1.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const routes = {
  "/": ["index.html", "text/html"],
  "/index.html": ["index.html", "text/html"],
  "/style.css": ["style.css", "text/css"],
  "/js/app.js": ["js/app.js", "text/javascript"],
  "/js/offline.mjs": ["js/offline.mjs", "text/javascript"],
  "/js/effects.mjs": ["js/effects.mjs", "text/javascript"],
  "/js/online-config.mjs": ["js/online-config.mjs", "text/javascript"],
  "/js/online-auth.mjs": ["js/online-auth.mjs", "text/javascript"],
  "/js/online-rooms.mjs": ["js/online-rooms.mjs", "text/javascript"],
  "/js/online-lobby.mjs": ["js/online-lobby.mjs", "text/javascript"],
  "/js/online-match.mjs": ["js/online-match.mjs", "text/javascript"],
  "/online-lobby.css": ["online-lobby.css", "text/css"],
  "/js/bot.mjs": ["js/bot.mjs", "text/javascript"],
  "/js/bot-protocol.mjs": ["js/bot-protocol.mjs", "text/javascript"],
  "/js/bot-runner.mjs": ["js/bot-runner.mjs", "text/javascript"],
  "/js/bot-worker.mjs": ["js/bot-worker.mjs", "text/javascript"],
  "/js/engine.mjs": ["js/engine.mjs", "text/javascript"],
  "/js/engine-real.mjs": ["js/engine.mjs", "text/javascript"],
};
// Fixed asset allowlist; never expose arbitrary workspace paths or the ZIP.
for (const color of ["red", "black"]) for (const type of ["general", "advisor", "elephant", "rook", "horse", "cannon", "pawn"]) {
  const file = `assets/pieces/${color}/${type}.svg`;
  routes[`/${file}`] = [file, "image/svg+xml"];
}
routes["/assets/pieces/back.svg"] = ["assets/pieces/back.svg", "image/svg+xml"];
for (const name of ["flip", "move", "capture"]) routes[`/assets/sfx/${name}.mp3`] = [`assets/sfx/${name}.mp3`, "audio/mpeg"];

module.exports = async function startServer({ basePath = "/", cacheAssets = false, port = 0 } = {}) {
  let initialState = null;
  let fixtureStarts = 1;
  let rejectPlayer = null;
  let observeActions = false;
  let assetFailure = null;
  let assetGate = null;
  const assetRequests = {};
  const server = http.createServer((request, response) => {
    const requestedPath = new URL(request.url, "http://localhost").pathname;
    if (requestedPath === "/favicon.ico") return response.writeHead(204).end();
    if (!requestedPath.startsWith(basePath)) return response.writeHead(404).end();
    const pathname = "/" + requestedPath.slice(basePath.length);
    const route = routes[pathname];
    if (!route) return response.writeHead(404).end();
    if (route[1] === "image/svg+xml") {
      assetRequests[pathname] = (assetRequests[pathname] ?? 0) + 1;
      if (assetGate?.pathname === pathname) {
        assetGate.responses.push(() => response.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": cacheAssets ? "max-age=60" : "no-store" })
          .end(fs.readFileSync(path.join(root, route[0]))));
        return;
      }
      // Deliberate failures are scoped to this test server, never production.
      if (assetFailure) return response.writeHead(assetFailure === "missing" ? 404 : 200,
        { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" }).end("invalid SVG fixture");
    }
    response.writeHead(200, { "Content-Type": `${route[1]}; charset=utf-8`, "Cache-Control": cacheAssets && route[1] === "image/svg+xml" ? "max-age=60" : "no-store" });
    if (pathname === "/js/engine.mjs" && initialState !== null) {
      response.end(`export { getPublicState, getLegalActions } from './engine-real.mjs';
        import { createGame as realCreateGame, applyAction as realApplyAction, getPublicState as publicView } from './engine-real.mjs';
        let remaining = ${fixtureStarts}, rejectOnce = ${rejectPlayer !== null};
        export function applyAction(state, player, action) {
          if (rejectOnce && player === ${JSON.stringify(rejectPlayer)}) { rejectOnce = false; return {ok:false,error:'TEST_REJECTION'}; }
          const result = realApplyAction(state, player, action);
          if (${observeActions} && result.ok) { globalThis.__qaActions.push(action); globalThis.__qaState = publicView(result.state); }
          return result;
        }
        export function createGame() {
          if (remaining-- <= 0) return realCreateGame();
          const state = ${JSON.stringify(initialState)};
          if (${observeActions}) { globalThis.__qaActions = []; globalThis.__qaState = publicView(state); }
          return state;
        }`);
    } else response.end(fs.readFileSync(path.join(root, route[0])));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}${basePath}`,
    useGame(state, { starts = 1, reject = null, observe = false } = {}) { initialState = structuredClone(state); fixtureStarts = starts; rejectPlayer = reject; observeActions = observe; },
    useAssetFailure(mode) {
      if (![null, "missing", "invalid"].includes(mode)) throw new Error("Unknown asset failure fixture");
      assetFailure = mode;
    },
    assetRequestCounts: () => ({ ...assetRequests }),
    holdAsset(pathname) {
      const gate = { pathname, responses: [] };
      assetGate = gate;
      return () => {
        if (assetGate === gate) assetGate = null;
        gate.responses.splice(0).forEach((respond) => respond());
      };
    },
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
};
