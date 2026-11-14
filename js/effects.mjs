// Presentation only: callers pass successful public events, never private state.
export function createMotion(board) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let active = null;
  const cellAt = (at) => document.getElementById(`cell-${(Number(at[1]) - 1) * 8 + "abcdefgh".indexOf(at[0])}`);

  function cancel() {
    const previous = active;
    active = null;
    if (!previous) return;
    previous.animations.forEach((animation) => animation.cancel());
    previous.back?.remove();
    previous.face.style.removeProperty("visibility");
    previous.face.style.removeProperty("z-index");
    delete board.dataset.animating;
  }
  function animate(run, element, frames, duration, done) {
    const animation = element.animate(frames, { duration, easing: "ease-out" });
    run.animations.push(animation);
    animation.onfinish = () => { if (active === run) done(); };
  }
  // Called after validation, before the public board is rendered at its new position.
  function prepare(action) {
    if (reduced.matches || !Element.prototype.animate) return null;
    const cell = cellAt(action.at ?? action.from);
    return { rect: cell.getBoundingClientRect(), back: action.type === "flip" ? cell.firstElementChild.cloneNode(true) : null };
  }
  function play(event, before) {
    cancel();
    if (!before || reduced.matches) return;
    const cell = cellAt(event.at ?? event.to), face = cell.firstElementChild;
    const run = { face, back: before.back, animations: [] };
    active = run;
    board.dataset.animating = event.type === "flip" ? "flip" : event.captured ? "capture" : "move";
    if (event.type === "flip") {
      const back = run.back;
      back.classList.add("motion-back");
      face.style.visibility = "hidden";
      cell.append(back);
      animate(run, back, [
        { transform: "translate(-50%, -50%) perspective(500px) rotateY(0deg)" },
        { transform: "translate(-50%, -50%) perspective(500px) rotateY(90deg)" },
      ], 110, () => {
        back.remove();
        face.style.removeProperty("visibility");
        animate(run, face, [
          { transform: "perspective(500px) rotateY(-90deg)" }, { transform: "perspective(500px) rotateY(0deg)" },
        ], 110, cancel);
      });
    } else {
      const after = cell.getBoundingClientRect();
      face.style.zIndex = "1";
      animate(run, face, [
        { transform: `translate(${before.rect.left - after.left}px, ${before.rect.top - after.top}px)` },
        { transform: event.captured ? "scale(1.06)" : "translate(0, 0)", offset: 0.8 },
        { transform: "scale(1)" },
      ], 160, cancel);
      if (event.captured) animate(run, cell, [
        { backgroundColor: "var(--move-bg)" }, { backgroundColor: "var(--cell-bg)" },
      ], 160, () => {});
    }
  }
  // Cancel before a control changes layout; observe system theme changes as well.
  document.querySelectorAll("button[data-theme], button[data-orientation], #new-game")
    .forEach((button) => button.addEventListener("click", cancel, { capture: true }));
  new MutationObserver(cancel).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  new MutationObserver(cancel).observe(board, { attributes: true, attributeFilter: ["data-orientation"] });
  reduced.addEventListener("change", cancel);
  window.addEventListener("resize", cancel);
  document.addEventListener("visibilitychange", cancel);
  return { prepare, play, cancel, get busy() { return active !== null; } };
}

// Only verified, bundled CC0 files belong here. An empty manifest disables sound
// without requesting missing assets. See assets/sfx/SOURCES.md.
const SOUNDS = { flip: "./assets/sfx/flip.mp3", move: "./assets/sfx/move.mp3", capture: "./assets/sfx/capture.mp3" };
export function createSound(button, sources = SOUNDS) {
  let enabled = true;
  try { enabled = localStorage.getItem("banqi-sound") !== "off"; } catch { /* Session preference still works. */ }
  const clips = new Map();
  const failed = new Set();
  const available = ["flip", "move", "capture"].every((key) => Boolean(sources[key]));
  function update() {
    button.disabled = !available || failed.size === 3;
    button.setAttribute("aria-pressed", String(enabled && !button.disabled));
    button.textContent = button.disabled ? "Âm thanh: Không khả dụng" : `Âm thanh: ${enabled ? "Bật" : "Tắt"}`;
  }
  function stop() {
    for (const clip of clips.values()) { clip.pause(); try { clip.currentTime = 0; } catch { /* Not loaded yet. */ } }
  }
  button.addEventListener("click", () => {
    enabled = !enabled;
    stop();
    try { localStorage.setItem("banqi-sound", enabled ? "on" : "off"); } catch { /* Session only. */ }
    update();
  });
  update();
  return {
    play(event) {
      const key = event.type === "flip" ? "flip" : event.type === "move" ? (event.captured ? "capture" : "move") : null;
      if (!available || !enabled || !key || failed.has(key)) return;
      stop();
      let clip = clips.get(key);
      if (!clip) {
        clip = new Audio(sources[key]);
        clip.preload = "none";
        clip.volume = 0.35;
        clip.addEventListener("error", () => { failed.add(key); update(); }, { once: true });
        clips.set(key, clip);
      }
      // Start in the user gesture, catch both synchronous and asynchronous refusal.
      try { clip.play()?.catch(() => {}); } catch { /* Autoplay/device failure never blocks a move. */ }
    },
  };
}
