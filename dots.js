// Hero background: a small take on wavegoo's bar. A grid of square dots, each a mass on a
// spring back to its home spot; the pointer pushes them away and clicks send a shockwave.
// Sleeps when everything is still or the hero is off screen.
(() => {
  const canvas = document.getElementById("dots");
  if (!canvas) return;
  // phones: skip it entirely (hidden in style.css too); it costs more than it's worth on a small, weak screen
  if (matchMedia("(hover: none), (max-width: 700px)").matches) return;
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GAP = 18, SIZE = 3, K = 0.06, DAMP = 0.86, RADIUS = 110, PUSH = 2.4;
  const colors = ["#7f77dd", "#ff4fd8", "#35e6ff", "#ffe04a", "#1d9e75"];
  let w, h, dpr, pts = [], mouse = { x: -1e4, y: -1e4 }, waves = [], running = false, visible = true;

  function build() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pts = [];
    for (let y = GAP / 2; y < h; y += GAP)
      for (let x = GAP / 2; x < w; x += GAP) {
        // a few "sand grains" in the wavegoo colours, the rest plain dots
        const c = Math.random() < 0.06 ? colors[(Math.random() * colors.length) | 0] : null;
        pts.push({ hx: x, hy: y, x, y, vx: 0, vy: 0, c });
      }
    draw(); kick();
  }

  function step() {
    let energy = 0;
    const t = performance.now();
    waves = waves.filter(wv => t - wv.t < 1400);
    for (const p of pts) {
      let fx = (p.hx - p.x) * K, fy = (p.hy - p.y) * K;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < RADIUS * RADIUS && d2 > 0.01) {
        const d = Math.sqrt(d2), f = (1 - d / RADIUS) * PUSH;
        fx += dx / d * f; fy += dy / d * f;
      }
      for (const wv of waves) {
        const r = (t - wv.t) * 0.55, ex = p.hx - wv.x, ey = p.hy - wv.y, d = Math.hypot(ex, ey);
        const band = Math.abs(d - r);
        if (band < 26 && d > 0.01) { const f = (1 - band / 26) * 3.2 * (1 - (t - wv.t) / 1400); fx += ex / d * f; fy += ey / d * f; }
      }
      p.vx = (p.vx + fx) * DAMP; p.vy = (p.vy + fy) * DAMP;
      p.x += p.vx; p.y += p.vy;
      energy += Math.abs(p.vx) + Math.abs(p.vy) + Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy);
    }
    return energy > 0.5 || waves.length > 0;
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      const off = Math.min(Math.hypot(p.x - p.hx, p.y - p.hy) / 12, 1);
      ctx.globalAlpha = p.c ? 1 : 0.7 + off * 0.3;
      ctx.fillStyle = p.c || (off > 0.15 ? "#dfe4ec" : "#4a505c");
      const s = (p.c ? SIZE + 1 : SIZE) + off * 1.5;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    if (!visible) { running = false; return; }
    const busy = step(); draw();
    if (busy) requestAnimationFrame(loop); else running = false;
  }
  function kick() { if (!reduce && !running && visible) { running = true; requestAnimationFrame(loop); } }

  const hero = canvas.parentElement;
  hero.addEventListener("pointermove", e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; kick();
  });
  hero.addEventListener("pointerleave", () => { mouse.x = mouse.y = -1e4; kick(); });
  hero.addEventListener("pointerdown", e => {
    const r = canvas.getBoundingClientRect();
    waves.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }); kick();
  });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(hero);
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 150); });
  build();
  // one welcome ripple
  if (!reduce) setTimeout(() => { waves.push({ x: w * 0.22, y: h * 0.62, t: performance.now() }); kick(); }, 400);
})();
