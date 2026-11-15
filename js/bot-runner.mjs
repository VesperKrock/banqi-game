import { chooseFallback } from "./bot.mjs";
import { createBotInput, matchLegal } from "./bot-protocol.mjs";

export function createBotRunner({
  makeWorker = () => new Worker(new URL("./bot-worker.mjs", import.meta.url), { type: "module" }),
  timeoutMs = 2800, fallback = chooseFallback,
} = {}) {
  let worker = null, pending = null, sequence = 0;
  const terminate = () => { worker?.terminate(); worker = null; };
  function cancel() {
    const previous = pending;
    pending = null;
    if (previous) { clearTimeout(previous.timer); previous.resolve({ status: "cancelled" }); }
    // A busy synchronous search is cancelled by termination, not an unread message.
    terminate();
  }
  function request(input, { session, position }) {
    cancel();
    const safe = createBotInput(input.snapshot, input.legal, input.history, input.seed);
    return new Promise(resolve => {
      const ticket = { requestId: ++sequence, session, position, resolve, safeAction: null, timer: null };
      pending = ticket;
      function finish(result) {
        if (pending !== ticket) return;
        clearTimeout(ticket.timer); pending = null; terminate(); resolve(result);
      }
      function fail(reason) {
        if (pending !== ticket) return;
        terminate();
        let action = ticket.safeAction;
        if (!action) {
          try { action = matchLegal(fallback(safe.snapshot, safe.legal), safe.legal); } catch { /* Recoverable error below. */ }
        }
        finish(action ? { status: "ok", action, source: "fallback", reason } : { status: "error", reason });
      }
      ticket.timer = setTimeout(() => fail("timeout"), timeoutMs);
      try {
        worker = makeWorker();
        worker.onmessage = ({ data }) => {
          if (pending !== ticket || data?.requestId !== ticket.requestId || data.session !== session || data.position !== position) return;
          if (data.type === "error") return fail("worker");
          if (data.type !== "fallback" && data.type !== "result") return;
          const action = matchLegal(data.action, safe.legal);
          if (!action) return fail("invalid-action");
          if (data.type === "fallback") ticket.safeAction = action;
          else finish({ status: "ok", action, source: "worker" });
        };
        worker.onerror = event => { event.preventDefault?.(); fail("worker"); };
        worker.onmessageerror = () => fail("message");
        worker.postMessage({ type: "choose", requestId: ticket.requestId, session, position, input: safe });
      } catch { fail("unavailable"); }
    });
  }
  return { request, cancel };
}
