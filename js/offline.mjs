import { createGame, getPublicState, getLegalActions, applyAction } from "./engine.mjs";

const SYMBOLS = {
  red: { general: "帥", advisor: "仕", elephant: "相", rook: "俥", horse: "傌", cannon: "炮", pawn: "兵" },
  black: { general: "將", advisor: "士", elephant: "象", rook: "車", horse: "馬", cannon: "砲", pawn: "卒" },
};
const NAMES = { general: "Tướng", advisor: "Sĩ", elephant: "Tượng", rook: "Xe", horse: "Mã", cannon: "Pháo", pawn: "Tốt" };
const COLORS = { red: "Đỏ", black: "Đen" };
const PIECE_IMAGES = Object.fromEntries(Object.entries(SYMBOLS).map(([color, pieces]) =>
  [color, Object.fromEntries(Object.keys(pieces).map((type) => [type, `./assets/pieces/${color}/${type}.svg`]))]));
const REASONS = {
  all_pieces_captured: "đối phương hết quân",
  no_legal_actions: "đối phương hết nước hợp lệ",
  threefold_repetition: "lặp thế cờ 3 lần",
  no_progress_60: "60 nửa-lượt không lật hoặc ăn quân",
  chase_technical_fouls: "hai lỗi trường tróc (2/2)",
};
const coordinate = (index) => `${"abcdefgh"[index % 8]}${Math.floor(index / 8) + 1}`;
const pieceName = (piece) => `${NAMES[piece.type]} ${COLORS[piece.color]}`;
const playerName = (snapshot, player) => `Người ${player + 1}${snapshot.playerColors[player] ? ` (${COLORS[snapshot.playerColors[player]]})` : ""}`;

function warningText(snapshot, warning) {
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
  const source = piece.faceDown ? "./assets/pieces/back.svg" : PIECE_IMAGES[piece.color][piece.type];
  // Keep loaded/failed images on selection changes; an error never retries itself.
  if (face.querySelector("img")?.getAttribute("src") === source) return;
  face.className = piece.faceDown ? "piece" : `piece piece-${piece.color}`;
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
  image.addEventListener("load", () => {
    if (image.parentElement === face) face.classList.add("piece-svg");
  }, { once: true });
  image.addEventListener("error", () => {
    if (image.parentElement === face) face.classList.remove("piece-svg");
  }, { once: true });
  face.replaceChildren(fallback, image);
  image.src = source;
}

document.addEventListener("DOMContentLoaded", () => {
  // Only this controller owns private state. Never attach it to window or DOM,
  // return it to a view, or serialize/log it. Offline memory is not anti-cheat.
  let privateState;
  let publicState;
  let legalActions = [];
  let selected = null;
  let hasPlayed = false;
  const cells = [...document.querySelectorAll(".cell")];
  const status = document.getElementById("game-status");
  const players = document.getElementById("player-colors");
  const feedback = document.getElementById("action-feedback");
  const chaseStatus = document.getElementById("chase-status");

  function say(message) {
    // Replace one short message; repeated invalid clicks do not spam live regions.
    if (feedback.textContent !== message) feedback.textContent = message;
  }

  // Rendering accepts only an allowlisted public snapshot and public actions.
  function render(snapshot, actions) {
    const destinations = new Set(actions.filter((action) => action.type === "move" && action.from === selected).map((action) => action.to));
    // Forecasts are supplied by the engine. Selection only filters their display.
    const warnings = snapshot.chase.warnings.filter((warning) => selected === null || warning.action.from === selected);
    const warnedTargets = new Map(selected === null ? [] : warnings.map((warning) => [warning.action.to, warning]));
    cells.forEach((cell, index) => {
      const at = coordinate(index), piece = snapshot.board[index];
      const face = cell.firstElementChild;
      cell.classList.toggle("is-selected", selected === at);
      cell.classList.toggle("can-move", destinations.has(at) && piece === null);
      cell.classList.toggle("can-capture", destinations.has(at) && piece !== null);
      const warning = warnedTargets.get(at);
      cell.classList.toggle("chase-warning", Boolean(warning));
      cell.setAttribute("aria-pressed", String(selected === at));
      cell.setAttribute("aria-disabled", String(snapshot.status === "finished"));
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
    players.textContent = snapshot.playerColors.map((color, player) => `Người ${player + 1}: ${COLORS[color] || "chưa phân màu"}`).join(" · ");
    const result = snapshot.result;
    const message = result?.reason === "chase_technical_fouls"
      ? `${playerName(snapshot, result.winner)} thắng — ${playerName(snapshot, 1 - result.winner)} thua do ${REASONS[result.reason]}.`
      : result
      ? `${result.outcome === "win" ? `Người ${result.winner + 1} thắng` : "Hòa"} — ${REASONS[result.reason]}.`
      : `Lượt Người ${snapshot.turn + 1}${snapshot.playerColors[snapshot.turn] ? ` · ${COLORS[snapshot.playerColors[snapshot.turn]]}` : " · Lật quân đầu để phân màu"}`;
    if (status.textContent !== message) status.textContent = message;
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
      for (const warning of warnings) notices.push(`Cảnh báo ${warningText(snapshot, warning)}`);
    }
    const chaseMessage = notices.join("\n");
    // A separate live region survives say(); unchanged rendering is silent.
    if (chaseStatus.textContent !== chaseMessage) chaseStatus.textContent = chaseMessage;
  }

  function refresh() {
    publicState = getPublicState(privateState);
    legalActions = getLegalActions(publicState, publicState.turn);
    render(publicState, legalActions);
  }

  function perform(action) {
    const result = applyAction(privateState, publicState.turn, action);
    if (!result.ok) {
      say("Nước không hợp lệ. Hãy chọn lại.");
      return;
    }
    privateState = result.state;
    selected = null;
    hasPlayed = true;
    refresh();
    const event = result.event;
    say(event.type === "flip"
      ? `Người ${event.player + 1} lật ${pieceName(event.piece)} tại ${event.at}.`
      : `Người ${event.player + 1}: ${pieceName(event.piece)} ${event.from} → ${event.to}${event.captured ? `, ăn ${pieceName(event.captured)}` : ""}.`);
  }

  cells.forEach((cell, index) => cell.addEventListener("click", () => {
    if (publicState.status === "finished") return;
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
    privateState = createGame();
    selected = null;
    hasPlayed = false;
    refresh();
    say("Lật một quân úp để bắt đầu.");
  }

  document.getElementById("new-game").addEventListener("click", () => {
    if (hasPlayed && publicState.status === "playing" && !window.confirm("Ván đang chơi sẽ bị bỏ. Bắt đầu ván mới?")) return;
    newGame();
  });
  newGame();
});
