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
  "/js/engine.mjs": ["js/engine.mjs", "text/javascript"],
  "/js/engine-real.mjs": ["js/engine.mjs", "text/javascript"],
};

module.exports = async function startServer() {
  let initialState = null;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    const route = routes[pathname];
    if (!route) return response.writeHead(404).end();
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
    url: `http://127.0.0.1:${server.address().port}/`,
    useGame(state) { initialState = structuredClone(state); },
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
};
