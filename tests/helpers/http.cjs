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

module.exports = async function startServer({ basePath = "/" } = {}) {
  let initialState = null;
  let assetFailure = null;
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
      // Deliberate failures are scoped to this test server, never production.
      if (assetFailure) return response.writeHead(assetFailure === "missing" ? 404 : 200,
        { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" }).end("invalid SVG fixture");
    }
    response.writeHead(200, { "Content-Type": `${route[1]}; charset=utf-8`, "Cache-Control": "no-store" });
    if (pathname === "/js/engine.mjs" && initialState !== null) {
      response.end(`export { getPublicState, getLegalActions, applyAction } from './engine-real.mjs';
        import { createGame as realCreateGame } from './engine-real.mjs';
        let first = true;
        export function createGame() {
          if (!first) return realCreateGame();
          first = false;
          return ${JSON.stringify(initialState)};
        }`);
    } else response.end(fs.readFileSync(path.join(root, route[0])));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}${basePath}`,
    useGame(state) { initialState = structuredClone(state); },
    useAssetFailure(mode) {
      if (![null, "missing", "invalid"].includes(mode)) throw new Error("Unknown asset failure fixture");
      assetFailure = mode;
    },
    assetRequestCounts: () => ({ ...assetRequests }),
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
};
