import { chooseBot } from "./bot.mjs";

// Request correlation follows the small Bee 3 Worker pattern; session/position
// tokens additionally make late replies after a new game harmless.
self.onmessage = ({ data }) => {
  if (data?.type !== "choose") return;
  const token = { requestId: data.requestId, session: data.session, position: data.position };
  try {
    const result = chooseBot(data.input, {
      onFallback: action => self.postMessage({ type: "fallback", ...token, action }),
    });
    self.postMessage({ type: "result", ...token, ...result });
  } catch {
    // Never serialize an exception/stack containing simulation internals.
    self.postMessage({ type: "error", ...token });
  }
};
