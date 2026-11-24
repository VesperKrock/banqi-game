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
  let mode = "auto";
  let automatic = null;
  const root = document.documentElement;
  const touch = window.matchMedia("(any-pointer: coarse)");
  const settings = document.getElementById("settings-panel");
  const settingsBody = document.getElementById("settings-body");
  const controls = ["#game-mode", ".game-actions", ".orientation-controls", "#result-toggle"].map(selector => {
    const element = document.querySelector(selector), anchor = document.createComment("control home");
    element.before(anchor);
    return { element, anchor };
  });
  let compact = false;
  function updateCompact() {
    const viewport = window.visualViewport;
    const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
    const next = (touch.matches || navigator.maxTouchPoints > 0) && (width <= 700 || (height <= 600 && width <= 1200));
    root.style.setProperty("--view-width", `${width}px`);
    root.style.setProperty("--view-height", `${height}px`);
    root.style.setProperty("--view-top", `${viewport?.offsetTop ?? 0}px`);
    root.style.setProperty("--view-left", `${viewport?.offsetLeft ?? 0}px`);
    root.dataset.compact = String(next);
    root.dataset.wide = String(width > height);
    if (compact === next) return;
    const focused = document.activeElement;
    const movedFocus = controls.some(({element}) => element.contains(focused));
    compact = next;
    for (const selector of ["#action-feedback", "#bot-status"]) document.querySelector(selector).setAttribute("aria-live", compact ? "off" : "polite");
    if (!compact && settings.matches(":popover-open")) settings.hidePopover();
    for (const {element, anchor} of controls) {
      if (compact) (element.id === "result-toggle" ? document.querySelector(".message-dock") : settingsBody).append(element);
      else anchor.after(element);
    }
    const chase = document.getElementById("chase-panel");
    if (chase.matches(":popover-open")) chase.hidePopover();
    if (compact) chase.setAttribute("popover", "auto");
    else chase.removeAttribute("popover");
    document.getElementById("chase-toggle").setAttribute("aria-expanded", String(!compact && !chase.hidden));
    if (movedFocus) {
      if (compact && settingsBody.contains(focused)) settings.showPopover();
      focused.focus({ preventScroll: true });
    }
    document.dispatchEvent(new Event("boardlayoutchange"));
  }

  // Hysteresis avoids oscillation near the portrait/landscape boundary.
  // A narrow desktop window follows the same geometry as a phone.
  function automaticOrientation() {
    const ratio = compact && window.visualViewport ? visualViewport.width / visualViewport.height : window.innerWidth / window.innerHeight;
    if (!automatic) automatic = ratio >= 1.1 ? "horizontal" : "vertical";
    else if (automatic === "vertical" && ratio > 1.15) automatic = "horizontal";
    else if (automatic === "horizontal" && ratio < 1.05) automatic = "vertical";
    return automatic;
  }

  function fitBoard() {
    const vertical = board.dataset.orientation === "vertical";
    const columns = vertical ? 4 : 8, rows = vertical ? 8 : 4;
    const area = document.querySelector(".play-area");
    const toolbar = document.querySelector(".board-toolbar");
    const dock = document.querySelector(".message-dock");
    if (compact) {
      const css = getComputedStyle(shell), gap = parseFloat(css.getPropertyValue("--board-gap"));
      const padding = parseFloat(css.getPropertyValue("--board-padding")) * 2 + 2;
      const wide = root.dataset.wide === "true";
      const main = document.querySelector("main"), mainCss = getComputedStyle(main);
      const width = (wide ? main.clientWidth - parseFloat(mainCss.paddingLeft) - parseFloat(mainCss.paddingRight)
        - toolbar.offsetWidth - 4 : area.clientWidth) - 26;
      const height = (wide ? main.clientHeight - parseFloat(mainCss.paddingTop) - parseFloat(mainCss.paddingBottom)
        : area.clientHeight - dock.offsetHeight - toolbar.offsetHeight - 8) - 30;
      // Both axes are hard budgets; no minimum can force cells off screen.
      const cell = Math.max(1, Math.min((width - padding - (columns - 1) * gap) / columns,
        (height - padding - (rows - 1) * gap) / rows));
      shell.style.width = `${Math.floor(cell * columns + padding + (columns - 1) * gap + 26)}px`;
      root.dataset.smallCells = String(cell < 32);
      const rect = dock.getBoundingClientRect();
      root.style.setProperty("--notice-top", `${rect.top}px`);
      root.style.setProperty("--notice-left", `${rect.left}px`);
      root.style.setProperty("--notice-width", `${rect.width}px`);
      return;
    }
    const sideDock = getComputedStyle(area).getPropertyValue("--side-dock").trim() === "1";
    area.style.setProperty("--dock-max-height", `${Math.max(64, window.innerHeight - toolbar.getBoundingClientRect().bottom - 20)}px`);
    const css = getComputedStyle(shell);
    const gap = parseFloat(css.getPropertyValue("--board-gap"));
    const padding = parseFloat(css.getPropertyValue("--board-padding")) * 2 + 2;
    const axisWidth = 26, axisHeight = 30;
    const width = area.clientWidth - axisWidth - (sideDock ? dock.offsetWidth + 12 : 0);
    const height = window.innerHeight - toolbar.getBoundingClientRect().bottom - (sideDock ? 0 : dock.offsetHeight) - axisHeight - 28;
    // Portrait may scroll vertically to keep pieces comfortably tappable.
    const minimum = vertical ? 48 : window.innerWidth < 500 ? 24 : 32;
    const cell = Math.min((width - padding - (columns - 1) * gap) / columns,
      Math.max(minimum, (height - padding - (rows - 1) * gap) / rows), 126);
    shell.style.width = `${Math.floor(cell * columns + padding + (columns - 1) * gap + axisWidth)}px`;
  }

  for (let y = 0; y < BOARD_ROWS; y += 1) {
    for (let x = 0; x < BOARD_COLUMNS; x += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.id = `cell-${y * BOARD_COLUMNS + x}`;
      cell.className = "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.title = `Quân úp tại ${coordinateLabel(x, y)}`;
      cell.setAttribute("aria-label", cell.title);
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
    if (board.dataset.orientation === orientation && axisLeft.children.length) {
      fitBoard();
      return;
    }
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

    status.textContent = orientation === "vertical"
      ? "Dọc · 4 cột × 8 hàng"
      : "Ngang · 8 cột × 4 hàng";
    fitBoard();
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      mode = button.dataset.orientation;
      for (const control of buttons) control.setAttribute("aria-pressed", String(control.dataset.orientation === mode));
      setOrientation(mode === "auto" ? automaticOrientation() : mode);
    });
  }

  const updateLayout = () => { updateCompact(); setOrientation(mode === "auto" ? automaticOrientation() : mode); };
  window.addEventListener("resize", updateLayout);
  window.visualViewport?.addEventListener("resize", updateLayout);
  window.visualViewport?.addEventListener("scroll", updateLayout);
  touch.addEventListener("change", updateLayout);
  const observer = new ResizeObserver(fitBoard);
  for (const selector of ["main", ".app-header", ".board-toolbar", ".message-dock", ".play-area"]) observer.observe(document.querySelector(selector));
  updateLayout();
}

// Apply theme before paint; build the stable board before the module controller starts.
// Node's built-in runner tests these same coordinate mappings.
if (typeof document !== "undefined") {
  initializeTheme();
  document.addEventListener("DOMContentLoaded", createBoard);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { BOARD_COLUMNS, BOARD_ROWS, logicToDisplay, displayToLogic, coordinateLabel };
}
