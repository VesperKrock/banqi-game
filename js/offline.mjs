import { createGame, getPublicState, getLegalActions, applyAction } from "./engine.mjs";
import { createMotion, createSound } from "./effects.mjs";
import { createBotRunner } from "./bot-runner.mjs";
import { copyPublic, copyEvent, createBotInput, matchLegal } from "./bot-protocol.mjs";

const SYMBOLS = {
  red: { general: "帥", advisor: "仕", elephant: "相", rook: "俥", horse: "傌", cannon: "炮", pawn: "兵" },
  black: { general: "將", advisor: "士", elephant: "象", rook: "車", horse: "馬", cannon: "砲", pawn: "卒" },
};
const NAMES = { general: "Tướng", advisor: "Sĩ", elephant: "Tượng", rook: "Xe", horse: "Mã", cannon: "Pháo", pawn: "Tốt" };
const COLORS = { red: "Đỏ", black: "Đen" };
// Reference copy only. Legal moves and forecasts still come exclusively from R1.
const RULES = {
  general: "Ăn Tướng, Sĩ, Tượng, Xe, Mã, Pháo của đối phương; không ăn được Tốt.",
  advisor: "Ăn Sĩ, Tượng, Xe, Mã, Pháo, Tốt của đối phương; không ăn được Tướng.",
  elephant: "Ăn Tượng, Xe, Mã, Pháo, Tốt của đối phương; không ăn được Tướng hoặc Sĩ.",
  rook: "Ăn Xe, Mã, Pháo, Tốt của đối phương.",
  horse: "Ăn Mã, Pháo, Tốt của đối phương.",
  cannon: "Ăn mọi cấp quân đã lật của đối phương trên cùng hàng/cột, qua đúng một ngòi (quân úp hoặc ngửa, bất kỳ màu). Không ăn liền kề.",
  pawn: "Ăn Tốt hoặc Tướng của đối phương; không ăn các cấp khác.",
};
const movementRule = "Đi một ô ngang/dọc vào ô trống, không đi chéo. ";
const ruleText = (type) => movementRule + (type === "cannon" ? RULES[type] : "Ăn quân đã lật ở ô liền kề ngang/dọc. " + RULES[type]);
const PIECE_IMAGES = Object.fromEntries(Object.entries(SYMBOLS).map(([color, pieces]) =>
  [color, Object.fromEntries(Object.keys(pieces).map((type) => [type, `./assets/pieces/${color}/${type}.svg`]))]));
const BACK_IMAGE = "./assets/pieces/back.svg";
const faceReady = new WeakMap();
// Bound both loading and decoding; a late success must not replace a fallback.
function decodedWithin(work) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 2500);
    work.then(() => { clearTimeout(timer); resolve(true); }, () => { clearTimeout(timer); resolve(false); });
  });
}
// Only the 15 public templates, never identities/positions from a game.
const preparedImages = new Map([BACK_IMAGE, ...Object.values(PIECE_IMAGES).flatMap(Object.values)].map((source) => {
  const image = new Image();
  image.src = source;
  return [source, { image, ready: decodedWithin(image.decode()) }];
}));
const REASONS = {
  all_pieces_captured: "đối phương hết quân",
  no_legal_actions: "đối phương hết nước hợp lệ",
  threefold_repetition: "lặp thế cờ 3 lần",
  no_progress_60: "60 nửa-lượt không lật hoặc ăn quân",
  chase_technical_fouls: "hai lỗi trường tróc (2/2)",
};
const coordinate = (index) => `${"abcdefgh"[index % 8]}${Math.floor(index / 8) + 1}`;
const pieceName = (piece) => `${NAMES[piece.type]} ${COLORS[piece.color]}`;
const describePlayer = (snapshot, player, name = `Người ${player + 1}`) => `${name}${snapshot.playerColors[player] ? ` (${COLORS[snapshot.playerColors[player]]})` : ""}`;

function describeWarning(snapshot, warning, playerName = describePlayer) {
  const { action, player, nextFault, losesGame } = warning;
  return `${action.from}–${action.to}: lỗi ${nextFault}/2${losesGame ? " và xử thua" : ""} cho ${playerName(snapshot, player)}.`;
}

// Receives only a public piece. A concealed piece always uses the same image.
function renderFace(face, piece, destination) {
  if (piece === null) {
    face.className = "piece piece-empty";
    face.textContent = destination ? "·" : "";
    return;
  }
  const source = piece.faceDown ? BACK_IMAGE : PIECE_IMAGES[piece.color][piece.type];
  // Keep loaded/failed images on selection changes; an error never retries itself.
  if (face.querySelector("img")?.getAttribute("src") === source) return;
  face.className = piece.faceDown ? "piece" : `piece piece-${piece.color}`;
  face.classList.add("piece-pending");
  const fallback = document.createElement("span");
  fallback.className = "piece-fallback";
  fallback.textContent = piece.faceDown ? "?" : SYMBOLS[piece.color][piece.type];
  const image = document.createElement("img");
  image.className = "piece-image";
  image.alt = "";
  image.setAttribute("aria-hidden", "true");
  image.draggable = false;
  image.width = 256;
  image.height = 256;
  face.replaceChildren(fallback, image);
  image.src = source;
  const ready = decodedWithin(Promise.all([preparedImages.get(source).ready.then((ok) => {
    if (!ok) throw new Error("SVG unavailable");
  }), image.decode()])).then((ok) => {
    if (image.parentElement !== face) return;
    face.classList.toggle("piece-svg", ok);
    face.classList.remove("piece-pending");
  });
  faceReady.set(face, ready);
}

function createReference() {
  for (const color of ["red", "black"]) {
    const list = document.querySelector(`#reference-${color} .reference-list`);
    for (const type of Object.keys(NAMES)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reference-piece";
      button.dataset.piece = type;
      button.setAttribute("aria-label", `Luật ${NAMES[type]} ${COLORS[color]} ${SYMBOLS[color][type]}`);
      button.popoverTargetElement = document.getElementById("piece-popover");
      const face = document.createElement("span"), name = document.createElement("span");
      face.setAttribute("aria-hidden", "true");
      renderFace(face, { color, type }, false);
      name.textContent = NAMES[type];
      button.append(face, name);
      button.addEventListener("click", () => {
        document.getElementById("piece-title").textContent = `${NAMES[type]} ${COLORS[color]} · ${SYMBOLS[color][type]}`;
        document.getElementById("piece-rule").textContent = ruleText(type);
      });
      list.append(button);
    }
  }
  for (const type of Object.keys(NAMES)) {
    const entry = document.createElement("section"), heading = document.createElement("h3"), copy = document.createElement("p");
    entry.className = "rule-entry";
    for (const color of ["red", "black"]) {
      const face = document.createElement("span");
      face.setAttribute("aria-hidden", "true");
      renderFace(face, { color, type }, false);
      heading.append(face);
    }
    heading.append(`${NAMES[type]} · ${SYMBOLS.red[type]} / ${SYMBOLS.black[type]}`);
    copy.textContent = ruleText(type);
    entry.append(heading, copy);
    document.getElementById("compact-rules").append(entry);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Only this controller owns private state. Never attach it to window or DOM,
  // return it to a view, or serialize/log it. Offline memory is not anti-cheat.
  let privateState;
  let publicState;
  let legalActions = [];
  let selected = null;
  let hasPlayed = false;
  let mode = "local", session = 0, position = 0, botSeed = 0;
  let publicHistory;
  const bot = createBotRunner();
  const modeControl = document.getElementById("game-mode");
  const botStatus = document.getElementById("bot-status");
  const botRetry = document.getElementById("bot-retry");
  const playerLabel = player => mode === "solo" ? (player === 0 ? "Bạn" : "Bot") : `Người ${player + 1}`;
  const playerName = (snapshot, player) => describePlayer(snapshot, player, playerLabel(player));
  const warningText = (snapshot, warning) => describeWarning(snapshot, warning, playerName);
  let lastTurn = null;
  let toastTimer;
  let resultShown = false;
  let presentingResultCapture = false;
  let lastChaseMessage = "";
  const chaseHistory = [];
  const cells = [...document.querySelectorAll(".cell")];
  const status = document.getElementById("game-status");
  const players = document.getElementById("player-colors");
  const feedback = document.getElementById("action-feedback");
  const compactNotice = document.getElementById("compact-notice");
  const chaseStatus = document.getElementById("chase-status");
  const chasePanel = document.getElementById("chase-panel");
  const chaseToggle = document.getElementById("chase-toggle");
  const history = document.createElement("details");
  const historyTitle = document.createElement("summary"), historyCopy = document.createElement("p");
  historyTitle.textContent = "Nhắc trường tróc gần đây";
  history.append(historyTitle, historyCopy);
  chasePanel.append(history);
  const toast = document.getElementById("turn-toast");
  const resultDialog = document.getElementById("result-dialog");
  const resultToggle = document.getElementById("result-toggle");
  createReference();
  const motion = createMotion(document.getElementById("board"));
  const sound = createSound(document.getElementById("sound-toggle"));
  const board = document.getElementById("board");
  const dragNotice = document.createElement("p");
  dragNotice.id = "drag-notice";
  dragNotice.className = "drag-notice";
  dragNotice.setAttribute("role", "status");
  dragNotice.hidden = true;
  document.querySelector(".board-toolbar").append(dragNotice);
  let drag = null, suppressPointerClick = false;
  const pointers = new Set();
  const canInteract = () => !motion.busy && publicState?.status === "playing" && !(mode === "solo" && publicState.turn === 1);

  function cancelDrag(allowTap = false) {
    if (!drag) return;
    const previous = drag;
    drag = null;
    suppressPointerClick ||= previous.moved || allowTap !== true;
    previous.ghost?.remove();
    if (previous.cell.hasPointerCapture(previous.id)) previous.cell.releasePointerCapture(previous.id);
    for (const cell of cells) cell.classList.remove("drag-source", "drag-legal", "drag-over", "drag-invalid", "drag-risk");
    dragNotice.hidden = true;
    dragNotice.textContent = "";
  }

  function dragTarget(event) {
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest(".cell");
    return cell && board.contains(cell) ? cell : null;
  }
  function dragAction(cell) {
    return cell && legalActions.find(action => action.type === "move" && action.from === drag.from && action.to === coordinate(cells.indexOf(cell)));
  }
  document.addEventListener("pointerdown", event => {
    pointers.add(event.pointerId);
    if (pointers.size > 1) { cancelDrag(); suppressPointerClick = true; return; }
    suppressPointerClick = false;
    const cell = event.target.closest?.(".cell");
    if (!cell || !board.contains(cell) || event.button !== 0 || !canInteract()) return;
    const index = cells.indexOf(cell), piece = publicState.board[index];
    drag = { id: event.pointerId, cell, from: coordinate(index), x: event.clientX, y: event.clientY,
      session, position, moved: false, eligible: !!piece && !piece.faceDown && piece.color === publicState.playerColors[publicState.turn] };
  }, true);
  document.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!canInteract() || drag.session !== session || drag.position !== position) return cancelDrag();
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return;
    drag.moved = true;
    if (!drag.eligible) return; // A swipe on a hidden/enemy piece is never a flip/move.
    event.preventDefault();
    if (!drag.ghost) {
      drag.cell.setPointerCapture(drag.id);
      const face = drag.cell.firstElementChild, rect = face.getBoundingClientRect();
      drag.ghost = face.cloneNode(true);
      drag.ghost.classList.add("drag-ghost");
      drag.ghost.setAttribute("aria-hidden", "true");
      drag.ghost.style.width = `${rect.width}px`;
      document.body.append(drag.ghost);
      drag.cell.classList.add("drag-source");
      for (const cell of cells) {
        const action = dragAction(cell);
        cell.classList.toggle("drag-legal", !!action);
        cell.classList.toggle("drag-risk", !!action && publicState.chase.warnings.some(w => w.action.from === action.from && w.action.to === action.to));
      }
    }
    drag.ghost.style.left = `${event.clientX}px`;
    drag.ghost.style.top = `${event.clientY}px`;
    const target = dragTarget(event), action = dragAction(target);
    for (const cell of cells) {
      cell.classList.toggle("drag-over", cell === target && !!action);
      cell.classList.toggle("drag-invalid", cell === target && !action);
    }
    const warning = action && publicState.chase.warnings.find(w => w.action.from === action.from && w.action.to === action.to);
    const message = warning ? `Cảnh báo ${warningText(publicState, warning)}` : "";
    if (dragNotice.textContent !== message) dragNotice.textContent = message;
    dragNotice.hidden = !message;
  }, { passive: false });
  document.addEventListener("pointerup", event => {
    pointers.delete(event.pointerId);
    if (!drag || event.pointerId !== drag.id) return;
    const action = drag.moved && drag.eligible && canInteract() && drag.session === session && drag.position === position
      ? dragAction(dragTarget(event)) : null;
    cancelDrag(true);
    if (action) perform(action);
  }, true);
  document.addEventListener("pointercancel", event => { pointers.delete(event.pointerId); cancelDrag(); suppressPointerClick = true; }, true);
  // Touch initially captures the nested face; transferring capture to its cell
  // also emits a bubbling lost event from that face, which is not a cancellation.
  board.addEventListener("lostpointercapture", event => {
    if (drag?.id === event.pointerId && event.target === drag.cell && !drag.cell.hasPointerCapture(drag.id)) cancelDrag();
  });
  board.addEventListener("click", event => {
    if (suppressPointerClick && event.detail > 0) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener("keydown", event => { if (event.key === "Escape") cancelDrag(); });
  document.querySelectorAll("button[data-theme], button[data-orientation], #new-game, #result-new-game")
    .forEach(button => button.addEventListener("click", cancelDrag, true));
  modeControl.addEventListener("change", cancelDrag, true);
  new MutationObserver(cancelDrag).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  new MutationObserver(cancelDrag).observe(board, { attributes: true, attributeFilter: ["data-orientation", "data-animating"] });
  for (const type of ["resize", "blur"]) window.addEventListener(type, () => { cancelDrag(); pointers.clear(); });
  window.visualViewport?.addEventListener("resize", cancelDrag);
  document.addEventListener("boardlayoutchange", cancelDrag);
  document.addEventListener("visibilitychange", () => { cancelDrag(); pointers.clear(); });
  window.addEventListener("scroll", cancelDrag, true);

  function say(message) {
    // Replace one short message; repeated invalid clicks do not spam live regions.
    if (feedback.textContent !== message) feedback.textContent = message;
    updateCompactNotice();
  }

  function updateCompactNotice() {
    if (!publicState) return;
    const warnings = publicState.chase.warnings.filter(w => selected === null || w.action.from === selected);
    const warning = warnings.toSorted((a, b) => b.nextFault - a.nextFault)[0];
    const faults = publicState.chase.faults.map((n, i) => n ? `${playerLabel(i)}: lỗi ${n}/2` : "").filter(Boolean);
    const message = warning ? `Nước có dấu !: lỗi ${warning.nextFault}/2${warning.losesGame ? " — xử thua" : "; thêm một lỗi sẽ thua"}.`
      : faults.length ? `Trường tróc · ${faults.join(" · ")}.`
      : publicState.chase.runs.some(runs => runs.some(run => run.count >= 5)) ? "Đang đuổi liên tục. Mở Trường tróc để xem hậu quả."
      : publicState.chase.drawDeferred.length ? "Chưa hòa: còn đuổi quân. Mở Trường tróc để xem chi tiết."
      : botStatus.textContent || feedback.textContent;
    if (compactNotice.textContent !== message) compactNotice.textContent = message;
    compactNotice.classList.toggle("is-warning", !!warning || !!faults.length || !!publicState.chase.drawDeferred.length);
  }

  // Rendering accepts only an allowlisted public snapshot and public actions.
  function render(snapshot, actions) {
    const destinations = new Set(actions.filter((action) => action.type === "move" && action.from === selected).map((action) => action.to));
    // Forecasts are supplied by the engine. Selection only filters their display.
    const warnings = snapshot.chase.warnings.filter((warning) => selected === null || warning.action.from === selected);
    const warnedTargets = new Map(selected === null ? [] : warnings.map((warning) => [warning.action.to, warning]));
    cells.forEach((cell, index) => {
      const at = coordinate(index), piece = snapshot.board[index];
      cell.classList.toggle("drag-ready", snapshot.status === "playing" && !(mode === "solo" && snapshot.turn === 1)
        && !!piece && !piece.faceDown && piece.color === snapshot.playerColors[snapshot.turn]);
      const face = cell.firstElementChild;
      cell.classList.toggle("is-selected", selected === at);
      cell.classList.toggle("can-move", destinations.has(at) && piece === null);
      cell.classList.toggle("can-capture", destinations.has(at) && piece !== null);
      const warning = warnedTargets.get(at);
      cell.classList.toggle("chase-warning", Boolean(warning));
      cell.setAttribute("aria-pressed", String(selected === at));
      cell.setAttribute("aria-disabled", String(snapshot.status === "finished" || (mode === "solo" && snapshot.turn === 1)));
      // Hidden pieces never enter the color/type branch, including attributes.
      renderFace(face, piece, destinations.has(at));
      let label;
      if (piece === null) {
        label = `Ô trống tại ${at}${destinations.has(at) ? ", có thể đi" : ""}`;
      } else if (piece.faceDown) {
        label = `Quân úp tại ${at}`;
      } else {
        label = `${pieceName(piece)} tại ${at}${destinations.has(at) ? ", có thể ăn" : ""}`;
      }
      let marker = cell.querySelector(".chase-marker");
      if (warning) {
        if (!marker) {
          marker = document.createElement("span");
          marker.className = "chase-marker";
          marker.setAttribute("aria-hidden", "true");
          marker.textContent = "!";
          cell.append(marker);
        }
        label += `. Cảnh báo trường tróc: ${warningText(snapshot, warning)}`;
        cell.setAttribute("aria-describedby", "chase-status");
      } else {
        marker?.remove();
        cell.removeAttribute("aria-describedby");
      }
      cell.title = label;
      cell.setAttribute("aria-label", label);
    });
    players.textContent = snapshot.playerColors.map((color, player) => `${playerLabel(player)}: ${COLORS[color] || "chưa phân màu"}`).join(" · ");
    const result = snapshot.result;
    const message = result?.reason === "chase_technical_fouls"
      ? `${playerName(snapshot, result.winner)} thắng — ${playerName(snapshot, 1 - result.winner)} thua do ${REASONS[result.reason]}.`
      : result
      ? `${result.outcome === "win" ? `${playerLabel(result.winner)} thắng` : "Hòa"} — ${REASONS[result.reason]}.`
      : `Lượt ${playerLabel(snapshot.turn)}${snapshot.playerColors[snapshot.turn] ? ` · ${COLORS[snapshot.playerColors[snapshot.turn]]}` : " · Lật quân đầu để phân màu"}`;
    const statusMessage = result ? "Ván đã kết thúc" : message;
    if (status.textContent !== statusMessage) status.textContent = statusMessage;
    if (lastTurn !== null && lastTurn !== snapshot.turn && !result) {
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = setTimeout(() => { toast.hidden = true; }, 2000);
    }
    lastTurn = snapshot.turn;
    resultToggle.hidden = !result;
    if (result && !resultShown) {
      document.getElementById("result-message").textContent = message;
      toast.hidden = true;
      if (!presentingResultCapture) {
        resultShown = true;
        document.querySelectorAll("[popover]:popover-open").forEach(panel => panel.hidePopover());
        resultDialog.showModal();
      }
    }
    const notices = [];
    snapshot.chase.faults.forEach((faults, player) => {
      if (faults) notices.push(`${playerName(snapshot, player)}: lỗi trường tróc ${faults}/2.${snapshot.status === "playing" ? " Ván tiếp tục; thêm một lỗi sẽ thua." : ""}`);
    });
    if (snapshot.status === "playing") {
      snapshot.chase.runs.forEach((runs, player) => {
        for (const run of runs) if (run.count >= 5) {
          notices.push(`${playerName(snapshot, player)} đã đuổi cùng quân ${run.count}/6 (${run.attackerAt} → ${run.targetAt}).`);
        }
      });
      for (const deferred of snapshot.chase.drawDeferred) {
        notices.push(deferred.reason === "threefold_repetition"
          ? `Chưa hòa lặp 3 lần: ${playerName(snapshot, deferred.player)} đang liên tục đuổi cùng quân.`
          : `Chưa hòa sau ${snapshot.noProgressPly} nửa-lượt: ${playerName(snapshot, deferred.player)} còn đuổi ${deferred.pairs.map((pair) => `${pair.attackerAt} → ${pair.targetAt}`).join(", ")}. Dừng mọi cặp này bằng nước đi vào ô trống sẽ hòa.`);
      }
      for (const warning of warnings.toReversed()) notices.unshift(`Cảnh báo ${warningText(snapshot, warning)}`);
    }
    const chaseMessage = notices.join("\n");
    // A separate live region survives say(); unchanged rendering is silent.
    if (chaseStatus.textContent !== chaseMessage) chaseStatus.textContent = chaseMessage;
    const pinned = selected !== null && warnings.length > 0;
    chasePanel.dataset.pinned = String(pinned);
    if (chaseMessage !== lastChaseMessage) {
      if (chaseMessage) {
        chaseHistory.push(chaseMessage);
        if (chaseHistory.length > 6) chaseHistory.shift();
        historyCopy.textContent = chaseHistory.join("\n\n");
      }
      chasePanel.hidden = !chaseMessage;
      lastChaseMessage = chaseMessage;
    }
    if (pinned) chasePanel.hidden = false;
    chaseToggle.hidden = !chaseMessage && !chaseHistory.length;
    chaseToggle.textContent = pinned ? "! Nước có nguy cơ lỗi" : "! Trường tróc";
    chaseToggle.setAttribute("aria-expanded", String(document.documentElement.dataset.compact === "true" ? chasePanel.matches(":popover-open") : !chasePanel.hidden));
    history.hidden = !chaseHistory.length;
    updateCompactNotice();
  }

  function refresh() {
    publicState = getPublicState(privateState);
    legalActions = getLegalActions(publicState, publicState.turn);
    render(publicState, legalActions);
  }

  function botMessage(message = "") {
    if (botStatus.textContent !== message) botStatus.textContent = message;
    botStatus.hidden = !message;
    updateCompactNotice();
  }

  function scheduleBot() {
    if (mode !== "solo" || publicState.status !== "playing" || publicState.turn !== 1) return;
    botRetry.hidden = true;
    botMessage("Bot đang tính…");
    const token = { session, position };
    // No privateState or engine callback enters this payload. History contains
    // only sanitized observations/events, including faces AFTER a real reveal.
    const input = createBotInput(publicState, legalActions, publicHistory, botSeed ^ position);
    bot.request(input, token).then(result => {
      if (token.session !== session || token.position !== position || mode !== "solo" || publicState.turn !== 1 || publicState.status !== "playing") return;
      if (result.status === "cancelled") return;
      botMessage();
      const action = result.status === "ok" ? matchLegal(result.action, legalActions) : null;
      if (!action || !perform(action)) {
        botRetry.hidden = false;
        botMessage("Bot chưa tính được nước. Thử lại hoặc chọn Ván mới.");
      }
    });
  }

  function perform(action) {
    cancelDrag();
    const result = applyAction(privateState, publicState.turn, action);
    if (!result.ok) {
      say("Nước không hợp lệ. Hãy chọn lại.");
      return false;
    }
    // A fast Bot reply may arrive during the human's animation. State already
    // committed; finish that presentation safely rather than adding a fake wait.
    if (mode === "solo" && publicState.turn === 1) motion.cancel();
    const before = motion.prepare(action);
    privateState = result.state;
    position++;
    publicHistory.events.push(copyEvent(result.event));
    selected = null;
    hasPlayed = true;
    presentingResultCapture = Boolean(result.event.captured && result.state.result);
    refresh();
    const event = result.event;
    const target = event.at ?? event.to;
    const targetFace = cells[(Number(target[1]) - 1) * 8 + "abcdefgh".indexOf(target[0])].firstElementChild;
    const finished = motion.play(event, before, faceReady.get(targetFace));
    if (presentingResultCapture) {
      const token = { session, position };
      finished.then(() => {
        if (session !== token.session || position !== token.position) return;
        presentingResultCapture = false;
        render(publicState, legalActions);
      });
    }
    sound.play(event);
    say(event.type === "flip"
      ? `${playerLabel(event.player)} lật ${pieceName(event.piece)} tại ${event.at}.`
      : `${playerLabel(event.player)}: ${pieceName(event.piece)} ${event.from} → ${event.to}${event.captured ? `, ăn ${pieceName(event.captured)}` : ""}.`);
    scheduleBot();
    return true;
  }

  cells.forEach((cell, index) => cell.addEventListener("click", () => {
    if (motion.busy || publicState.status === "finished" || (mode === "solo" && publicState.turn === 1)) return;
    const at = coordinate(index);
    const flip = legalActions.find((action) => action.type === "flip" && action.at === at);
    if (flip) return perform(flip);
    const move = legalActions.find((action) => action.type === "move" && action.from === selected && action.to === at);
    if (move) return perform(move);
    const piece = publicState.board[index];
    if (piece && !piece.faceDown && piece.color === publicState.playerColors[publicState.turn]) {
      selected = selected === at ? null : at;
      render(publicState, legalActions);
      say(selected ? `Đã chọn ${pieceName(piece)} tại ${at}. Chọn ô được đánh dấu hoặc lật một quân úp.` : "Đã bỏ chọn quân.");
    } else {
      say("Ô không hợp lệ. Chọn quân của người đến lượt, ô được đánh dấu hoặc một quân úp.");
    }
  }));

  function newGame() {
    cancelDrag();
    bot.cancel();
    session++;
    position = 0;
    botSeed = globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : (Date.now() ^ session) >>> 0;
    botMessage();
    botRetry.hidden = true;
    motion.cancel();
    resultDialog.close();
    resultShown = false;
    presentingResultCapture = false;
    lastTurn = null;
    clearTimeout(toastTimer);
    toast.hidden = true;
    chaseHistory.length = 0;
    lastChaseMessage = "";
    chasePanel.hidden = true;
    history.open = false;
    historyCopy.textContent = "";
    privateState = createGame();
    publicHistory = { initial: copyPublic(getPublicState(privateState)), events: [] };
    selected = null;
    hasPlayed = false;
    refresh();
    say("Lật một quân úp để bắt đầu.");
    scheduleBot();
  }

  modeControl.addEventListener("change", () => {
    const next = modeControl.value;
    if (next === mode) return;
    if (hasPlayed && publicState.status === "playing" && !window.confirm("Đổi chế độ sẽ bỏ ván đang chơi và bắt đầu ván mới?")) {
      modeControl.value = mode;
      return;
    }
    mode = next;
    document.getElementById("help-title").textContent = mode === "solo" ? "Solo với Bot" : "Hai người cùng máy";
    newGame();
  });
  botRetry.addEventListener("click", scheduleBot);

  document.getElementById("new-game").addEventListener("click", () => {
    if (hasPlayed && publicState.status === "playing" && !window.confirm("Ván đang chơi sẽ bị bỏ. Bắt đầu ván mới?")) return;
    newGame();
  });
  chaseToggle.addEventListener("click", () => {
    if (document.documentElement.dataset.compact === "true") {
      if (chasePanel.matches(":popover-open")) chasePanel.hidePopover();
      else { chasePanel.hidden = false; chasePanel.showPopover(); document.getElementById("chase-close").focus({preventScroll:true}); }
      return;
    }
    if (chasePanel.dataset.pinned === "true") return;
    chasePanel.hidden = !chasePanel.hidden;
    chaseToggle.setAttribute("aria-expanded", String(!chasePanel.hidden));
    if (!chaseStatus.textContent) history.open = true;
  });
  document.getElementById("chase-close").addEventListener("click", () => chasePanel.hidePopover());
  chasePanel.addEventListener("toggle", event => {
    chaseToggle.setAttribute("aria-expanded", String(event.newState === "open"));
    if (event.newState === "closed" && !resultDialog.open && !chaseToggle.hidden) chaseToggle.focus({preventScroll:true});
  });
  function closeResult() {
    resultDialog.close();
    // Native close events are queued; restore focus in the activating event too.
    if (publicState?.result) resultToggle.focus();
  }
  document.getElementById("result-close").addEventListener("click", closeResult);
  resultDialog.addEventListener("cancel", event => { event.preventDefault(); closeResult(); });
  resultDialog.addEventListener("close", () => { if (publicState?.result) resultToggle.focus(); });
  resultToggle.addEventListener("click", () => { resultShown = true; resultDialog.showModal(); });
  document.getElementById("result-new-game").addEventListener("click", newGame);
  newGame();
});
