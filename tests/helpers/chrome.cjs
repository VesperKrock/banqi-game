"use strict";

// Small dependency-free CDP helper. Requires an existing Chrome and Node 22+.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const startServer = require("./http.cjs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async function launchChrome({ suite = "regression" } = {}) {
  const executable = [process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((candidate) => candidate && fs.existsSync(candidate));
  if (!executable) throw new Error("Chrome chưa có: đặt CHROME_PATH; không tự cài trình duyệt.");
  const root = path.resolve(__dirname, "../..");
  const suiteOutput = path.join(root, ".local-qa/r2-01", suite);
  fs.mkdirSync(suiteOutput, { recursive: true });
  // Keep earlier QA evidence intact instead of overwriting screenshots/reports.
  const output = fs.mkdtempSync(path.join(suiteOutput, "run-"));
  const profile = fs.mkdtempSync(path.join(output, "profile-"));
  const server = await startServer();
  const browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run",
    "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore", windowsHide: true });
  const pending = new Map();
  const events = new Map();
  const errors = [];
  let socket, nextId = 0;

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 10000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function close() {
    if (socket?.readyState === WebSocket.OPEN) {
      await send("Browser.close").catch(() => {});
      socket.close();
    }
    if (browser.exitCode === null) browser.kill();
    await server.close();
  }

  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let tries = 0; !fs.existsSync(portFile); tries += 1) {
      if (tries > 100) throw new Error("Chrome did not start");
      await delay(100);
    }
    const port = fs.readFileSync(portFile, "utf8").split(/\r?\n/)[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === "Runtime.exceptionThrown" || message.method === "Network.loadingFailed" ||
          (message.method === "Log.entryAdded" && message.params.entry.level === "error") ||
          (message.method === "Runtime.consoleAPICalled" && message.params.type === "error")) errors.push(message);
      if (events.has(message.method)) {
        events.get(message.method)(message.params);
        events.delete(message.method);
      }
      const callback = pending.get(message.id);
      if (!callback) return;
      clearTimeout(callback.timer);
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    });
    for (const domain of ["Page", "Runtime", "Network", "Log", "Accessibility"]) await send(`${domain}.enable`);
  } catch (error) {
    await close();
    throw error;
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  function waitForEvent(method) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { events.delete(method); reject(new Error(`Event timeout: ${method}`)); }, 10000);
      events.set(method, (params) => { clearTimeout(timer); resolve(params); });
    });
  }

  async function navigate() {
    const loaded = waitForEvent("Page.loadEventFired");
    await send("Page.navigate", { url: server.url });
    await loaded;
    await evaluate("window.originalCells = [...document.querySelectorAll('.cell')]");
  }

  async function screenshot(name) {
    const { cssContentSize } = await send("Page.getLayoutMetrics");
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cssContentSize.width, height: Math.ceil(cssContentSize.height), scale: 1 } });
    fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(data, "base64"));
  }

  return { send, evaluate, navigate, screenshot, close, errors, output, waitForEvent, useGame: server.useGame };
};
