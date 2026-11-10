import { createGame, getPublicState, getLegalActions, applyAction } from "./engine.mjs";

const SYMBOLS = {
  red: { general: "帥", advisor: "仕", elephant: "相", rook: "俥", horse: "傌", cannon: "炮", pawn: "兵" },
  black: { general: "將", advisor: "士", elephant: "象", rook: "車", horse: "馬", cannon: "砲", pawn: "卒" },
};
const NAMES = { general: "Tướng", advisor: "Sĩ", elephant: "Tượng", rook: "Xe", horse: "Mã", cannon: "Pháo", pawn: "Tốt" };
const COLORS = { red: "Đỏ", black: "Đen" };
const REASONS = {
  all_pieces_captured: "đối phương hết quân",
  no_legal_actions: "đối phương hết nước hợp lệ",
  threefold_repetition: "lặp thế cờ 3 lần",
  no_progress_60: "60 nửa-lượt không lật hoặc ăn quân",
};
const coordinate = (index) => `${"abcdefgh"[index % 8]}${Math.floor(index / 8) + 1}`;
const pieceName = (piece) => `${NAMES[piece.type]} ${COLORS[piece.color]}`;

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

  function say(message) {
    // Replace one short message; repeated invalid clicks do not spam live regions.
    if (feedback.textContent !== message) feedback.textContent = message;
  }

  // Rendering accepts only an allowlisted public snapshot and public actions.
  function render(snapshot, actions) {
    const destinations = new Set(actions.filter((action) => action.type === "move" && action.from === selected).map((action) => action.to));
    cells.forEach((cell, index) => {
      const at = coordinate(index), piece = snapshot.board[index];
      const face = cell.firstElementChild;
      cell.classList.toggle("is-selected", selected === at);
      cell.classList.toggle("can-move", destinations.has(at) && piece === null);
      cell.classList.toggle("can-capture", destinations.has(at) && piece !== null);
      cell.setAttribute("aria-pressed", String(selected === at));
      cell.setAttribute("aria-disabled", String(snapshot.status === "finished"));
      // Hidden pieces never enter the color/type branch, including attributes.
      face.className = "piece";
      let label;
      if (piece === null) {
        face.textContent = destinations.has(at) ? "·" : "";
        face.classList.add("piece-empty");
        label = `Ô trống tại ${at}${destinations.has(at) ? ", có thể đi" : ""}`;
      } else if (piece.faceDown) {
        face.textContent = "?";
        label = `Quân úp tại ${at}`;
      } else {
        face.textContent = SYMBOLS[piece.color][piece.type];
        face.classList.add(`piece-${piece.color}`);
        label = `${pieceName(piece)} tại ${at}${destinations.has(at) ? ", có thể ăn" : ""}`;
      }
      cell.title = label;
      cell.setAttribute("aria-label", label);
    });
    players.textContent = snapshot.playerColors.map((color, player) => `Người ${player + 1}: ${COLORS[color] || "chưa phân màu"}`).join(" · ");
    const result = snapshot.result;
    const message = result
      ? `${result.outcome === "win" ? `Người ${result.winner + 1} thắng` : "Hòa"} — ${REASONS[result.reason]}.`
      : `Lượt Người ${snapshot.turn + 1}${snapshot.playerColors[snapshot.turn] ? ` · ${COLORS[snapshot.playerColors[snapshot.turn]]}` : " · Lật quân đầu để phân màu"}`;
    if (status.textContent !== message) status.textContent = message;
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
