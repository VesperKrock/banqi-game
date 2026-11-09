"use strict";

const BOARD_COLUMNS = 8;
const BOARD_ROWS = 4;

// Logic: (0, 0) = a1, (7, 3) = h4; screen rows grow downward.
// Vertical presentation rotates positions 90° clockwise, never the pieces.
function logicToDisplay(x, y, orientation) {
  return orientation === "vertical"
    ? { x: y, y: x }
    : { x, y: BOARD_ROWS - 1 - y };
}

function displayToLogic(x, y, orientation) {
  return orientation === "vertical"
    ? { x: y, y: x }
    : { x, y: BOARD_ROWS - 1 - y };
}

function coordinateLabel(x, y) {
  return `${String.fromCharCode(97 + x)}${y + 1}`;
}

function initializeTheme() {
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = null;

  try {
    const saved = window.localStorage.getItem("banqi-theme");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch {
    // Private/restricted storage must not prevent rendering or theme changes.
  }

  function applyTheme() {
    const theme = preference || (systemTheme.matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
    for (const button of document.querySelectorAll("button[data-theme]")) {
      button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
    }
  }

  applyTheme();
  systemTheme.addEventListener("change", applyTheme);
  document.addEventListener("DOMContentLoaded", () => {
    for (const button of document.querySelectorAll("button[data-theme]")) {
      button.addEventListener("click", () => {
        preference = button.dataset.theme;
        applyTheme();
        try {
          window.localStorage.setItem("banqi-theme", preference);
        } catch {
          // Keep the user's choice in memory even when persistence is unavailable.
        }
      });
    }
    applyTheme();
  });
}

function createBoard() {
  const board = document.getElementById("board");
  const shell = document.getElementById("board-shell");
  const axisLeft = document.getElementById("axis-left");
  const axisBottom = document.getElementById("axis-bottom");
  const status = document.getElementById("board-status");
  const buttons = document.querySelectorAll("button[data-orientation]");
  const cells = [];

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      const cell = document.createElement("li");
      cell.id = `cell-${y * BOARD_COLUMNS + x}`;
      cell.className = "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.title = `Ô ${coordinateLabel(x, y)} — quân úp`;
      cell.setAttribute("aria-label", `Ô ${coordinateLabel(x, y)}, quân úp`);
      cell.tabIndex = 0;

      const piece = document.createElement("span");
      piece.className = "piece";
      piece.textContent = "?";
      piece.setAttribute("aria-hidden", "true");

      cell.append(piece);
      cells.push({ element: cell, x, y });
      board.append(cell);
    }
  }

  function setOrientation(orientation) {
    board.dataset.orientation = orientation;
    shell.dataset.orientation = orientation;

    for (const cell of cells) {
      const position = logicToDisplay(cell.x, cell.y, orientation);
      cell.element.style.gridColumn = String(position.x + 1);
      cell.element.style.gridRow = String(position.y + 1);
    }

    const columns = orientation === "vertical" ? BOARD_ROWS : BOARD_COLUMNS;
    const rows = orientation === "vertical" ? BOARD_COLUMNS : BOARD_ROWS;
    const axisLabels = (count, axis) => Array.from({ length: count }, (_, index) => {
      const logical = displayToLogic(axis === "bottom" ? index : 0, axis === "left" ? index : 0, orientation);
      const label = coordinateLabel(logical.x, logical.y);
      const span = document.createElement("span");
      const fileAxis = orientation === "horizontal" ? axis === "bottom" : axis === "left";
      span.textContent = fileAxis ? label[0] : label[1];
      return span;
    });
    axisLeft.replaceChildren(...axisLabels(rows, "left"));
    axisBottom.replaceChildren(...axisLabels(columns, "bottom"));

    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.orientation === orientation));
    }

    status.textContent = orientation === "vertical"
      ? "Dọc · 4 cột × 8 hàng"
      : "Ngang · 8 cột × 4 hàng";
  }

  for (const button of buttons) {
    button.addEventListener("click", () => setOrientation(button.dataset.orientation));
  }

  setOrientation("horizontal");
}

// Classic script works with file://; Node's built-in runner tests the same mapping.
if (typeof document !== "undefined") {
  initializeTheme();
  document.addEventListener("DOMContentLoaded", createBoard);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BOARD_COLUMNS, BOARD_ROWS, logicToDisplay, displayToLogic, coordinateLabel };
}
