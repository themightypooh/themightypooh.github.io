/* brain-layers.js: 'reflex vs. thought', a layered NPC brain (stash viz #2).
   Inspired by Chasm's local AI companion Kevin: senses -> Kev (fast classifier, the spinal reflex)
   -> brain (local LLM, slow System-2 thinking) -> voice/action. Same look + lazy start as brain.js. */
(() => {
const COL = { senses: "#7fc8ff", nerve: "#9fe1cb", brain: "#b6a3ff", act: "#ffb36b", voice: "#ffe04a" };
const A = (hex, a) => { a = Math.max(0, Math.min(1, a)); const v = parseInt(hex.slice(1), 16); return `rgba(${v>>16},${(v>>8)&255},${v&255},${a.toFixed(3)})`; };
// layout in a 1024x732 space (same frame as brain.js)
const N = {
  ear: [120, 470], mic: [120, 560], eye: [120, 380],          // senses
  kev: [512, 560],                                             // brainstem / spinal "Kev"
  cortex: [512, 220],                                          // LLM
  act: [900, 600], voice: [900, 400]                           // outputs
};
const SENSE_LAB = { eye: "vision → coords", ear: "game audio", mic: "speech (STT)" };
// demo events: fast = reflex arc only, slow = up into the brain and back out to the voice
const EV = [
  { src: "mic", heard: 'heard: "Kevin, jump"', fast: true, out: "JUMP" },
  { src: "mic", heard: 'heard: "what\'s our mission?"', fast: false, out: '"Hold the line till Pelican arrives"' },
  { src: "ear", heard: "audio: grenade beep", fast: true, out: "MOVE" },
  { src: "eye", heard: "saw: elite @ (412, 88)", fast: true, out: "SHOOT" },
  { src: "mic", heard: 'heard: "remember that ridge?"', fast: false, out: '"Yeah, you fell off it twice"' },
  { src: "ear", heard: "audio: plasma fire", fast: true, out: "CROUCH" }
];
const lerp = (a, b, u) => [a[0] + (b[0]-a[0])*u, a[1] + (b[1]-a[1])*u];
function route(e) { // [from, to, seconds]
  const s = N[e.src];
  return e.fast ? [[s, N.kev, 0.28], [N.kev, N.act, 0.22], [N.act, N.act, 0.9]]
    : [[s, N.kev, 0.4], [N.kev, N.kev, 0.35], [N.kev, N.cortex, 0.9], [N.cortex, N.cortex, 1.8], [N.cortex, N.voice, 0.8], [N.voice, N.voice, 1.8]];
}
function init(box) {
  const cv = box.querySelector("canvas"), info = box.querySelector(".brain-info"), c = cv.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let t = 0, last = 0, raf = 0, open = false, vis = false, W = 0, H = 0, ei = 0, et = 0;
  const glow = { senses: 0, nerve: 0, brain: 0, act: 0, voice: 0 };
  function size() { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; cv.width = Math.round(W * d); cv.height = Math.round(H * d); c.setTransform(d, 0, 0, d, 0, 0); }
  function where() { // current pulse position + phase name
    const r = route(EV[ei]); let acc = 0;
    for (let i = 0; i < r.length; i++) { const [a, b, d] = r[i]; if (et < acc + d) return { p: lerp(a, b, (et - acc) / d), i, n: r.length, u: (et - acc) / d }; acc += d; }
    return null;
  }
  function step(dt) {
    et += dt; for (const k in glow) glow[k] = Math.max(0, glow[k] - dt * 1.6);
    const w = where(), e = EV[ei];
    if (!w) { ei = (ei + 1) % EV.length; et = 0; return; }
    if (w.i === 0) glow.senses = 1;
    if (w.i === 1 || (!e.fast && w.i === 2 && w.u < 0.15)) glow.nerve = 1;
    if (e.fast && w.i >= 1) glow.act = 1;
    if (!e.fast && w.i === 3) glow.brain = 1;
    if (!e.fast && w.i >= 4) glow.voice = 1;
  }
  function node(p, r, col, g, label, sub) {
    c.save(); c.shadowColor = col; c.shadowBlur = 10 + 30*g; c.beginPath(); c.arc(p[0], p[1], r, 0, 7);
    c.fillStyle = "#161b20"; c.fill(); c.lineWidth = 4; c.strokeStyle = A(col, 0.5 + 0.5*g); c.stroke();
    c.fillStyle = A(col, 0.15 + 0.6*g); c.fill(); c.restore();
    if (label) txt(label, p[0], p[1] + r + 34, col, 26);
    if (sub) txt(sub, p[0], p[1] + r + 62, "#9aa3ad", 20);
  }
  function txt(s, x, y, col, px) { c.font = `bold ${px}px monospace`; c.textAlign = "center"; c.lineWidth = 6; c.strokeStyle = "rgba(16,16,20,.85)"; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y); }
  function wire(a, b, col, g, bend) {
    c.beginPath(); c.moveTo(a[0], a[1]);
    if (bend) c.quadraticCurveTo(bend[0], bend[1], b[0], b[1]); else c.lineTo(b[0], b[1]);
    c.lineWidth = 3 + 3*g; c.strokeStyle = A(col, 0.22 + 0.6*g); c.stroke();
  }
  function paint() {
    c.save(); c.clearRect(0, 0, W, H);
    const k = 0.95 * Math.min(W / 1024, H / 732); c.translate(W/2 - 512*k, H/2 - 366*k); c.scale(k, k);
    const e = EV[ei], w = still.matches ? null : where();
    // brain (cerebrum): soft lobed blob + a few sulci, up top
    c.save(); c.shadowColor = "rgba(159,225,203,.33)"; c.shadowBlur = 40;
    c.beginPath(); c.ellipse(512, 215, 230, 130, 0, 0, 7); c.fillStyle = "#0e1418"; c.fill(); c.restore();
    c.beginPath(); c.ellipse(512, 215, 230, 130, 0, 0, 7);
    c.fillStyle = A(COL.brain, 0.12 + 0.35*glow.brain); c.fill(); c.lineWidth = 4; c.strokeStyle = "rgba(255,255,255,.78)"; c.stroke();
    c.lineCap = "round"; c.lineWidth = 2.4; c.strokeStyle = A(COL.brain, 0.35 + 0.6*glow.brain);
    for (let i = 0; i < 7; i++) { const x = 330 + i*60; c.beginPath(); c.moveTo(x, 125 + (i%2)*20); c.bezierCurveTo(x+30, 160, x-25, 220, x+12, 290 - (i%3)*15); c.stroke(); }
    if (glow.brain > 0) for (let i = 0; i < 14; i++) { const a = i*2.4 + t*1.3, r = 60 + 90*((i*37)%10)/10;
      c.save(); c.shadowColor = "#fff"; c.shadowBlur = 14; c.beginPath(); c.arc(512 + Math.cos(a)*r*1.4, 200 + Math.sin(a)*r*0.75, 5, 0, 7);
      c.fillStyle = `rgba(255,255,255,${(glow.brain*(0.4+0.6*Math.abs(Math.sin(t*5+i)))).toFixed(3)})`; c.fill(); c.restore(); }
    // brainstem + spinal cord down to Kev
    c.beginPath(); c.moveTo(482, 338); c.quadraticCurveTo(490, 450, 500, 700); c.lineTo(524, 700); c.quadraticCurveTo(534, 450, 542, 338); c.closePath();
    c.fillStyle = "#1c2328"; c.fill(); c.fillStyle = A(COL.nerve, 0.1 + 0.35*glow.nerve); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = "rgba(255,255,255,.56)"; c.stroke();
    // wires
    for (const s of ["eye", "ear", "mic"]) wire(N[s], N.kev, COL.senses, e.src === s ? glow.senses : 0, [330, N[s][1] + 60]);
    wire(N.kev, N.act, COL.act, glow.act, [700, 660]);           // reflex arc (short loop)
    wire(N.cortex, N.voice, COL.voice, glow.voice, [800, 220]);  // thought -> voice
    // nodes + layer labels
    for (const s of ["eye", "ear", "mic"]) node(N[s], 26, COL.senses, e.src === s ? glow.senses : 0, null, null);
    for (const s of ["eye", "ear", "mic"]) txt(SENSE_LAB[s], N[s][0] + 10, N[s][1] - 36, "#9aa3ad", 19);
    txt("1 SENSES", 120, 300, COL.senses, 30);
    node(N.kev, 34, COL.nerve, glow.nerve, "2 NERVES: Kev", "fast classifier: reflex or think?");
    txt("3 BRAIN: local LLM", 512, 34, COL.brain, 30); txt("mission + memory, slow reasoning", 512, 62, "#9aa3ad", 20);
    node(N.voice, 30, COL.voice, glow.voice, "4 VOICE", "TTS speech");
    node(N.act, 30, COL.act, glow.act, "4 ACTION", "jump/crouch/move/shoot");
    // the travelling pulse
    if (w) { const fastE = e.fast, col = w.i === 0 ? COL.senses : fastE ? "#ffffff" : COL.brain;
      c.save(); c.shadowColor = fastE ? "#fff" : col; c.shadowBlur = fastE ? 30 : 18;
      c.beginPath(); c.arc(w.p[0], w.p[1], fastE ? 11 : 8, 0, 7); c.fillStyle = col; c.fill(); c.restore(); }
    // outcome tag
    if (e.fast && glow.act > 0.05) txt(e.out, N.act[0], N.act[1] - 50, A(COL.act, glow.act), 44);
    if (!e.fast && glow.voice > 0.05) { c.save(); c.globalAlpha = glow.voice; txt(e.out, 700, 470, COL.voice, 24); c.restore(); }
    c.restore();
    const ph = !w ? "" : w.i === 0 ? "senses" : e.fast ? "reflex → " + e.out : w.i < 3 ? "nerve: needs thinking" : w.i === 3 ? "brain: thinking…" : "voice";
    info.textContent = still.matches ? "reflex: senses → Kev → action · thought: → LLM → voice" : `${e.heard} · ${ph}`;
  }
  function frame(ts) { const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts; t += dt; step(dt); paint(); raf = requestAnimationFrame(frame); }
  function sync() { const run = open && vis && !document.hidden;
    if (still.matches) { if (run) { size(); paint(); } return; }   // reduced motion: one static frame
    if (run && !raf) { size(); last = 0; raf = requestAnimationFrame(frame); } else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; } }
  const det = box.closest("details");
  det.addEventListener("toggle", () => { open = det.open; sync(); });
  new IntersectionObserver(e => { vis = e[0].isIntersecting; sync(); }).observe(cv);
  document.addEventListener("visibilitychange", sync);
  addEventListener("resize", () => { if (raf || still.matches) { size(); if (still.matches && open) paint(); } });
  still.addEventListener?.("change", () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } sync(); });
  open = det.open; sync();
}
document.querySelectorAll(".brain-layers").forEach(init);
})();
