// Node adapter exercises the actual browser Worker module, without app hooks.
import { parentPort } from "node:worker_threads";
globalThis.self = { postMessage: data => parentPort.postMessage(data) };
await import("../../js/bot-worker.mjs");
parentPort.on("message", data => self.onmessage({ data }));
