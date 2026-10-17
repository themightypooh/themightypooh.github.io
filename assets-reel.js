// Assorted assets: a reel that drifts upward on its own and loops without a seam. Several pieces
// show at once; hovering, touching or focusing it holds it still, the wheel or a drag scrolls it
// by hand, and it picks the drift back up a moment after you let go. Sleeps while off screen.
(() => {
  const reel = document.querySelector(".reel");
  if (!reel) return;
  const track = reel.querySelector(".reel-track");
  const toggle = reel.querySelector(".reel-toggle");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SPEED = 26;   // px per second
  const RESUME = 1800; // ms after the last touch before it drifts again

  // One set of tiles, repeated until the track is always full; the loop is one set long.
  const set = [...track.children];
  let setH = 0;
  function fill() {
    while (track.children.length > set.length) track.lastChild.remove();
    // One loop period = first tile's top to where the next set starts. Not scrollHeight: it never reports
    // less than the track's own height, so a short set looked like it already filled the reel (no scrolling).
    const lastT = set[set.length - 1];
    setH = lastT.offsetTop + lastT.offsetHeight + parseFloat(getComputedStyle(lastT).marginBottom) - set[0].offsetTop;
    const copies = Math.max(1, Math.ceil(track.clientHeight / Math.max(setH, 1)) + 1);
    for (let c = 0; c < copies; c++)
      for (const tile of set) {
        const copy = tile.cloneNode(true);
        copy.setAttribute("aria-hidden", "true");
        copy.querySelectorAll("a").forEach(a => (a.tabIndex = -1));
        copy.querySelectorAll("img").forEach(i => { i.alt = ""; i.loading = "eager"; });
        track.appendChild(copy);
      }
  }

  let pos = 0, last = 0, held = false, paused = reduce, idleUntil = 0, visible = false, raf = 0;
  const wrap = p => (setH > 0 ? ((p % setH) + setH) % setH : p);

  function frame(t) {
    raf = 0;
    const dt = Math.min(0.05, (t - (last || t)) / 1000);
    last = t;
    if (!held && !paused && t > idleUntil) {
      pos = wrap(pos + SPEED * dt);
      track.scrollTop = pos;
    }
    if (visible && !paused) raf = requestAnimationFrame(frame);
  }
  function run() { if (!raf && visible && !paused) { last = 0; raf = requestAnimationFrame(frame); } }

  // Hand scrolling: follow it, keep it inside the loop, and wait before drifting again.
  track.addEventListener("scroll", () => {
    if (Math.abs(track.scrollTop - pos) < 1.5) return;
    pos = track.scrollTop;
    const w = wrap(pos);
    if (w !== pos) { pos = w; track.scrollTop = pos; }
    idleUntil = performance.now() + RESUME;
  }, { passive: true });

  const hold = on => () => { held = on; if (!on) idleUntil = performance.now() + RESUME / 3; };
  reel.addEventListener("pointerenter", hold(true));
  reel.addEventListener("pointerleave", hold(false));
  reel.addEventListener("focusin", hold(true));
  reel.addEventListener("focusout", hold(false));
  track.addEventListener("touchstart", () => (idleUntil = performance.now() + RESUME * 2), { passive: true });

  // Drag to scroll with a mouse, without the drag turning into a click on the image.
  let drag = null;
  track.addEventListener("pointerdown", e => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { y: e.clientY, top: track.scrollTop, moved: false };
  });
  addEventListener("pointermove", e => {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 4) { drag.moved = true; reel.classList.add("dragging"); }
    if (drag.moved) track.scrollTop = drag.top - dy;
  });
  addEventListener("pointerup", () => { setTimeout(() => reel.classList.remove("dragging")); drag = null; });
  track.addEventListener("click", e => { if (reel.classList.contains("dragging")) e.preventDefault(); }, true);
  track.addEventListener("dragstart", e => e.preventDefault());

  function setPaused(p) {
    paused = p;
    reel.classList.toggle("paused", p);
    toggle.setAttribute("aria-pressed", String(p));
    toggle.querySelector("span").textContent = p ? "play" : "pause";
    toggle.setAttribute("aria-label", p ? "Play the gallery" : "Pause the gallery");
    run();
  }
  toggle.addEventListener("click", () => setPaused(!paused));

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }).observe(reel);
  // Refill whenever the track or any original tile changes size (images arriving, CSS layout, resize),
  // so there is always at least one extra set below the fold to scroll into.
  const ro = new ResizeObserver(() => { fill(); pos = wrap(pos); track.scrollTop = pos; });
  ro.observe(track); set.forEach(t => ro.observe(t));
  // Lazy images change the set's height as they arrive.
  set.forEach(t => t.querySelector("img")?.addEventListener("load", () => { fill(); pos = wrap(pos); }));
  setPaused(paused);
})();
