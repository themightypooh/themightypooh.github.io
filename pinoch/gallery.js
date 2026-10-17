// Genome code follows sim/genome.go at claude/project-thread-xe1a5h (legs, GrowRate) to match plipsim.js.
// Pinoch viewer: 1:1 port of plips gallery.go (origin/main; same on every branch except wip-box-brain's
// simplified label/right-click) + genome.go RandomGenome/Mutate/Describe + room.go CellBackground + main.go
// galleryBar/view + ui.go look. "Put in room" -> "Pick for Pinoch" (pending) -> life-cycle preview -> Approve.
'use strict';
const GL = (() => {
let rnd = Math.random; const intn = n => Math.floor(rnd() * n), f = () => rnd(), { lerp, clamp } = PS;
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const seeded = (seed, fn) => { const o = rnd; rnd = mulberry(seed); try { return fn(); } finally { rnd = o; } };   // deterministic batches
const LayoutSingle = 0, LayoutChain = 1, numLayouts = 4, numLimbKinds = 5, LimbLeg = 4, MaxLegs = 4;
const layoutNames = ['single', 'chain', 'stack', 'clump'], limbNames = ['feelers', 'tail', 'whiskers', 'nubs', 'legs'];
const legCount = ls => { let n = 0; for (const l of ls) if (l.Kind === LimbLeg) { n++; if (l.Mirror) n++; } return n; };
const newId = () => Math.floor(rnd() * 2 ** 53);   // Go Instinct is Int63; JS-safe 53 bits here
const withId = (g, id) => { g.Id = id; g.LumpPh = (id % 628) / 100; return g; };   // plip.go: lumpPh = Instinct%628/100
function randomLimb() {
  const l = { Kind: intn(numLimbKinds), Len: 0, Angle: 0, Stiff: f(), Tip: f() < 0.35, Mirror: false };
  l.Angle = (f() * 2 - 1) * 0.6;
  switch (l.Kind) {
    case 0: l.Len = 3 + intn(6); l.Mirror = f() < 0.7; break;
    case 1: l.Len = 3 + intn(8); break;
    case 2: l.Len = 2 + intn(4); l.Mirror = f() < 0.5; break;
    case 3: l.Len = 1 + intn(3); l.Mirror = true; l.Tip = false; break;
    case 4: l.Len = 16 + intn(10); l.Mirror = f() < 0.85; l.Tip = f() < 0.5; break;
  }
  return l;
}
function RandomGenome() {
  const g = { Mass: 55 + intn(100), Layout: LayoutSingle, Lobes: 1, LobeGap: lerp(0.6, 1.3, f()), LobeTaper: lerp(0.55, 1, f()),
    Aspect: lerp(0.5, 2, f() * f() + f() * 0.3), Soft: f(), Taut: f(), Sag: f(), Pack: lerp(0.75, 1.15, f()), Jiggle: f(), Lumpy: 0,
    LumpK: 3 + intn(5), Breath: f() * f(), Nucleus: 0, Limbs: [], Skin: false, SkinStretch: 0, SkinBend: 0, SkinWrinkle: 0, SkinShade: 0, SkinClear: 0,
    Hue: f(), Sat: lerp(0.12, 0.5, f()), Val: lerp(0.4, 0.88, f()), Speckle: f() * 26, Spots: 0, Hue2: f(), Rim: lerp(0.2, 0.9, f()), Alpha: lerp(0.6, 1, f()),
    Eyes: 1 + intn(3), EyeSize: 1, EyeGap: lerp(0.15, 0.55, f()), EyeHigh: lerp(0.1, 0.6, f()), Hoppy: f(), Speed: lerp(0.6, 1.4, f()),
    LR: lerp(0.02, 0.08, f()), Temp: lerp(0.1, 0.35, f()), Curious: lerp(0.5, 1.5, f()), Taste: [], Metab: lerp(0.7, 1.3, f()), GrowRate: lerp(0.6, 1.6, f()) };
  withId(g, newId());
  if (f() < 0.55) { g.Layout = 1 + intn(numLayouts - 1); g.Lobes = 2 + intn(2); if (g.Layout === LayoutChain && f() < 0.4) g.Lobes = 4; }
  if (f() < 0.4) g.Lumpy = lerp(0.2, 1, f());
  g.Skin = f() < 0.9;
  g.SkinStretch = f(); g.SkinBend = f(); g.SkinShade = f(); g.SkinClear = f();
  if (f() < 0.3) g.SkinWrinkle = f();
  if (f() < 0.3) g.Nucleus = lerp(0.06, 0.25, f());
  if (f() < 0.35) g.Spots = lerp(0.05, 0.35, f());
  if (f() < 0.2) g.EyeSize = 2;
  if (f() < 0.08) g.Eyes = 0;
  if (f() < 0.45) { let l = randomLimb(); while (l.Kind !== LimbLeg) l = randomLimb(); g.Limbs.push(l); }
  for (let n = intn(4); n > 0 && f() < 0.8; n--) { const l = randomLimb(); if (l.Kind !== LimbLeg || legCount(g.Limbs) + 2 <= MaxLegs) g.Limbs.push(l); }
  for (let i = 0; i < PS.NCol; i++) g.Taste[i] = lerp(0.5, 1.5, f());
  if (PS.NO_LEGS) g.Limbs = g.Limbs.filter(l => l.Kind !== LimbLeg);   // PORTFOLIO: legs off
  return g;
}
function Mutate(g, amount) {
  const n = (v, lo, hi) => Math.max(lo, Math.min(hi, v + (f() * 2 - 1) * (hi - lo) * 0.25 * amount));
  const wrap = v => { v += (f() * 2 - 1) * 0.12 * amount; return v - Math.floor(v); };
  const chance = p => f() < p * amount;
  const m = JSON.parse(JSON.stringify(g));
  m.Mass = Math.trunc(n(g.Mass, 40, 180));
  m.LobeGap = n(g.LobeGap, 0.5, 1.4); m.LobeTaper = n(g.LobeTaper, 0.5, 1); m.Aspect = n(g.Aspect, 0.45, 2.1);
  m.Soft = n(g.Soft, 0, 1); m.Taut = n(g.Taut, 0, 1); m.Sag = n(g.Sag, 0, 1); m.Pack = n(g.Pack, 0.7, 1.2); m.Jiggle = n(g.Jiggle, 0, 1); m.Breath = n(g.Breath, 0, 1);
  m.Hue = wrap(g.Hue); m.Sat = n(g.Sat, 0.05, 0.6); m.Val = n(g.Val, 0.3, 0.92); m.Speckle = n(g.Speckle, 0, 30); m.Hue2 = wrap(g.Hue2);
  m.Rim = n(g.Rim, 0, 1); m.Alpha = n(g.Alpha, 0.5, 1); m.EyeGap = n(g.EyeGap, 0.1, 0.6); m.EyeHigh = n(g.EyeHigh, 0.05, 0.65);
  m.Hoppy = n(g.Hoppy, 0, 1); m.Speed = n(g.Speed, 0.5, 1.5); m.LR = n(g.LR, 0.01, 0.1); m.Temp = n(g.Temp, 0.06, 0.45);
  m.Curious = n(g.Curious, 0.2, 2); m.Metab = n(g.Metab, 0.6, 1.4);
  m.GrowRate = n(g.GrowRate || 1, 0.4, 2);
  m.SkinStretch = n(g.SkinStretch, 0, 1); m.SkinBend = n(g.SkinBend, 0, 1); m.SkinShade = n(g.SkinShade, 0, 1); m.SkinClear = n(g.SkinClear, 0, 1);
  if (g.SkinWrinkle > 0 || chance(0.15)) m.SkinWrinkle = n(g.SkinWrinkle, 0, 1);
  if (chance(0.08)) m.Skin = !g.Skin;
  if (g.Lumpy > 0 || chance(0.15)) m.Lumpy = n(g.Lumpy, 0, 1);
  if (chance(0.15)) m.LumpK = 3 + intn(5);
  if (g.Nucleus > 0 || chance(0.1)) m.Nucleus = n(g.Nucleus, 0, 0.3);
  if (g.Spots > 0 || chance(0.1)) m.Spots = n(g.Spots, 0, 0.4);
  for (let i = 0; i < m.Taste.length; i++) m.Taste[i] = n(g.Taste[i], 0.3, 1.7);
  for (const l of m.Limbs) { l.Stiff = n(l.Stiff, 0, 1); l.Angle = n(l.Angle, -0.8, 0.8); if (chance(0.3)) l.Len = l.Kind === LimbLeg ? Math.trunc(n(l.Len, 10, 26)) : Math.trunc(n(l.Len, 1, 11)); if (chance(0.1)) l.Tip = !l.Tip; }
  if (m.Limbs.length > 0 && chance(0.15)) m.Limbs.splice(intn(m.Limbs.length), 1);
  if (m.Limbs.length < 4 && chance(0.2)) { const l = randomLimb(); if (l.Kind !== LimbLeg || legCount(m.Limbs) + 2 <= MaxLegs) m.Limbs.push(l); }
  if (chance(0.15)) m.Eyes = intn(4);
  if (chance(0.15)) m.EyeSize = 1 + intn(2);
  if (chance(0.12)) { m.Layout = intn(numLayouts); m.Lobes = 1; if (m.Layout !== LayoutSingle) { m.Lobes = 2 + intn(2); if (m.Layout === LayoutChain && intn(3) === 0) m.Lobes = 4; } }
  if (PS.NO_LEGS) m.Limbs = m.Limbs.filter(l => l.Kind !== LimbLeg);   // PORTFOLIO: legs off
  return withId(m, newId());
}
const word = (v, lo, mid, hi) => v < 0.33 ? lo : v > 0.66 ? hi : mid;
function Describe(g) {
  let shape = layoutNames[g.Layout]; if (g.Lobes > 1) shape = g.Lobes + '-' + shape; if (g.Lobes === 1) shape = word(g.Aspect - 0.5, 'tall', 'round', 'wide');
  const w = [shape, word(g.Soft, 'floppy', '', 'firm'), word(g.Sag, '', '', 'slumpy')];
  if (g.Lumpy > 0.4) w.push('lumpy');
  if (!g.Skin) w.push('skinless'); else if (g.SkinStretch > 0.7) w.push('stretchy');
  const seen = {}; for (const l of g.Limbs) if (!seen[l.Kind]) { w.push(limbNames[l.Kind]); seen[l.Kind] = 1; }
  return w.filter(Boolean).join(' ');
}
function CellBackground(w, h, floor) {   // room.go (Go seeds rand 3; JS uses a fixed mulberry seed)
  const buf = new Uint8ClampedArray(w * h * 4); let a = 3; const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4; let c = [24, 28, 30];
    if (y > floor) { c = [40, 44, 44]; if (y === floor + 1) c = [62, 68, 68]; } else { c[0] += y * 0.06; c[1] += y * 0.07; c[2] += y * 0.07; }
    const n = (r() - 0.5) * 3; buf[p] = c[0] + n; buf[p + 1] = c[1] + n; buf[p + 2] = c[2] + n; buf[p + 3] = 255;
  }
  return buf;
}
const gid = g => (g.Id != null ? g.Id : Math.round(g.LumpPh * 100)).toString(16);
return { RandomGenome, Mutate, Describe, CellBackground, gid, seeded };
})();

const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()).catch(() => null);
// ---------------- gallery.go ----------------
const cellW = 108, cellH = 80, CW = cellW, CH = cellH, cellFloor = 70, gCols = 4, gRows = 3, galleryW = cellW * gCols, galleryH = cellH * gRows, nCells = gCols * gRows;
const topH = 48, botH = 50;
const STAGE_AT = i => i + 0.9;   // where in each stage the preview samples Pinoch's growth (late in the stage)
const pvW = 64, pvH = 46, pvFloor = 38;   // PINOCH: life-cycle preview uses tighter cells so the stages read at a glance
function makeCell(gn, stageS) {
  const cw = stageS != null ? pvW : cellW, ch = stageS != null ? pvH : cellH, w = new PS.World(cw, ch, stageS != null ? pvFloor : cellFloor);
  let g = gn, hopK = 1, moveK = 1, young = 0, limbK = 1;
  if (stageS != null) { const ex = expressed(stageS, gn); g = ex.g; hopK = ex.hopK; moveK = ex.moveK; young = ex.young; limbK = ex.limbK;
    if (limbK < 0.02) g = { ...g, Limbs: [] }; }   // nothing sprouted yet
  const p = new PS.Plip(g, '', false); p.hopK = hopK; p.moveK = moveK; p.young = young;
  if (limbK < 1) p.limbs.forEach(l => { l.grown = Math.max(1, Math.round(PS.segs(l) * limbK)); });   // same limb growth as the live Pinoch
  w.AddPlip(p, cw / 2, null);
  for (let k = 0; k < 120; k++) w.Step();
  return { g: gn, w, r: new PS.Renderer(cw, ch), stage: stageS, p, W: cw, H: ch };
}
const Gal = {
  open: false, cells: [], batch: [], starView: false, selected: -1, hover: -1, gen: 0, stars: [], preview: null, toast: '', toastT: 0,
  init() { try { this.stars = JSON.parse(localStorage.getItem('pinoch.favourites.v1')) || []; } catch (_) {} this.loadHist(); if (this.hi >= 0) this.showEntry(); else this.NewBatch(); },
  saveStars() { try { localStorage.setItem('pinoch.favourites.v1', JSON.stringify(this.stars)); } catch (_) {} },
  // PINOCH: batch history (every batch's seed + genomes, localStorage), Back/Forward like a browser
  hist: [], hi: -1,
  loadHist() { try { const h = JSON.parse(localStorage.getItem('pinoch.galleryhist.v1')); if (h && h.list) { this.hist = h.list; this.hi = Math.min(h.i, h.list.length - 1); } } catch (_) {} },
  saveHist() { while (this.hist.length > 200) { this.hist.shift(); this.hi--; }
    try { localStorage.setItem('pinoch.galleryhist.v1', JSON.stringify({ i: this.hi, list: this.hist })); } catch (_) { this.hist.splice(0, 20); this.hi -= 20; } },
  pushBatch(entry) { this.hist.push(entry); this.hi = this.hist.length - 1; this.saveHist(); this.showEntry(); },
  showEntry() { const e = this.hist[this.hi]; this.batch = e.genomes.map(g => makeCell(g)); this.gen = e.gen; this.ShowStarred(false); if (e.kind === 'breed') this.selected = 0; },
  Back() { if (this.hi > 0) { this.hi--; this.saveHist(); this.showEntry(); } },
  Forward() { if (this.hi < this.hist.length - 1) { this.hi++; this.saveHist(); this.showEntry(); } },
  NewBatch() { const seed = Math.floor(Math.random() * 2 ** 31);
    const genomes = GL.seeded(seed, () => Array.from({ length: nCells }, () => GL.RandomGenome()));
    this.pushBatch({ kind: 'random', seed, gen: 0, t: Date.now(), genomes }); },
  Breed() { const s = this.Selected(); if (!s) return; const seed = Math.floor(Math.random() * 2 ** 31);
    const genomes = [s, ...GL.seeded(seed, () => Array.from({ length: nCells - 1 }, () => GL.Mutate(s, 0.55)))];
    this.pushBatch({ kind: 'breed', seed, parent: GL.gid(s), gen: this.gen + 1, t: Date.now(), genomes }); },
  ShowStarred(on) { this.starView = on; this.selected = -1; if (!on) { this.cells = this.batch; return; } this.cells = []; for (let i = this.stars.length - 1; i >= 0 && this.cells.length < nCells; i--) this.cells.push(makeCell(this.stars[i])); },
  Selected() { return this.selected < 0 || this.selected >= this.cells.length ? null : this.cells[this.selected].g; },
  IsStarred(gn) { return this.stars.some(s => GL.gid(s) === GL.gid(gn)); },
  ToggleStar() { const gn = this.Selected(); if (!gn) return; const k = this.stars.findIndex(s => GL.gid(s) === GL.gid(gn)); if (k >= 0) this.stars.splice(k, 1); else this.stars.push(gn); this.saveStars(); },
  say(s) { this.toast = s; this.toastT = performance.now(); },
  starToast() { const gn = this.Selected(); if (gn) this.say(this.IsStarred(gn) ? `Starred. You have ${this.stars.length} under Starred` : 'Unstarred'); },
  Caption() { const h = this.hist.length ? `batch ${this.hi + 1}/${this.hist.length} · ` : ''; return this.starView ? `${this.stars.length} starred` : h + (this.gen > 0 ? `generation ${this.gen}` : 'fresh batch'); },
  // PINOCH: pick -> pending -> life-cycle preview -> approve
  Pick() { const gn = this.Selected(); if (!gn) return; try { localStorage.setItem('pinoch.pendinggenome.v1', JSON.stringify(gn)); } catch (_) {} post('/genome', { kind: 'pending', genome: gn }); this.Preview(gn); },
  SavePNGs() { const gn = this.preview.g, id = GL.gid(gn); this.say('Rendering stage PNGs…');
    setTimeout(() => post('/stages', { id, genome: gn, files: renderStagePNGs(gn, { title: 'Pinoch ' + id + '  ·  ' + GL.Describe(gn) }) })
      .then(r => this.say(r && r.dir ? 'Saved to ' + r.dir : 'Save failed (is serve.py running?)')), 30); },
  Preview(gn) { this.preview = { g: gn, cells: CONFIG.stages.map((_, i) => makeCell(gn, STAGE_AT(i))) }; },
  Approve() { const gn = this.preview.g, clean = JSON.parse(JSON.stringify(gn));
    try { localStorage.setItem('pinoch.plipgenome.v2', JSON.stringify(clean)); sessionStorage.setItem('pinoch.picked', '1'); localStorage.removeItem('pinoch.pendinggenome.v1'); } catch (_) {}
    post('/genome', { kind: 'approved', genome: clean }).finally(() => location.reload()); },   // GENES is read at load; hatch()/grow() then express the new genome at every stage
  Reject() { try { localStorage.removeItem('pinoch.pendinggenome.v1'); } catch (_) {} post('/genome', { kind: 'discard' }); this.preview = null; this.say('Pick discarded. Pinoch keeps his look'); },
};

// ---------------- drawing (Ebiten look: ui.go colours, Go-ish font, main.go bars/view) ----------------
const C = { bar: 'rgb(18,21,23)', line: 'rgb(40,46,49)', btn: 'rgb(30,35,38)', hover: 'rgb(42,49,53)', on: 'rgb(58,74,68)', text: 'rgb(206,214,209)', dim: 'rgb(128,140,134)', acc: 'rgb(150,194,172)', off: 'rgb(80,88,84)' };
const FONT = s => `${s}px "Go", "DejaVu Sans", "Noto Sans", sans-serif`;
const gc = document.createElement('canvas'); gc.id = 'gallery'; gc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:none;z-index:50;cursor:default';
document.body.appendChild(gc);
const gx = gc.getContext('2d'), goff = document.createElement('canvas'), gox = goff.getContext('2d');
const cellBg = GL.CellBackground(cellW, cellH, cellFloor), cellImg = new ImageData(cellW, cellH), pvBg = GL.CellBackground(pvW, pvH, pvFloor), pvImg = new ImageData(pvW, pvH);
const UI = { mx: -1, my: -1, click: false, rclick: false, widgets: [] };
gc.addEventListener('pointermove', e => { UI.mx = e.clientX; UI.my = e.clientY; });
gc.addEventListener('pointerdown', e => { UI.mx = e.clientX; UI.my = e.clientY; if (e.button === 0) UI.click = true; if (e.button === 2) UI.rclick = true; });
gc.addEventListener('contextmenu', e => e.preventDefault());
const bw = l => { gx.font = FONT(14); return gx.measureText(l).width + 24; };
function button(x, y, label, on, disabled) { const r = { x, y, w: bw(label), h: 30 }; UI.widgets.push({ r, label, on, disabled });
  return [!disabled && UI.click && UI.mx >= x && UI.my >= y && UI.mx < x + r.w && UI.my < y + r.h, r.w]; }
function view(w, h) { const aw = gc.width - 24, ah = gc.height - topH - botH - 24; let s = Math.min(aw / w, ah / h); if (s >= 1) s = Math.floor(s * 2) / 2;
  return [s, (gc.width - w * s) / 2, topH + botH + (gc.height - topH - botH - h * s) / 2]; }
const overUI = () => UI.my >= 0 && UI.my < topH + botH;
function renderCells(cells, cols, rows, s, ox, oy, labelOf) {
  const pv = cells.length && cells[0].W === pvW, cellW = pv ? pvW : CW, cellH = pv ? pvH : CH, im = pv ? pvImg : cellImg, bgc = pv ? pvBg : cellBg;
  const W = cellW * cols, H = cellH * rows; goff.width = W; goff.height = H; gox.fillStyle = 'rgb(14,16,17)'; gox.fillRect(0, 0, W, H);
  cells.forEach((c, i) => { c.r.Render(c.w, im.data, bgc); gox.putImageData(im, (i % cols) * cellW, Math.floor(i / cols) * cellH); });
  gx.imageSmoothingEnabled = false; gx.drawImage(goff, ox, oy, W * s, H * s);
  cells.forEach((c, i) => {
    const x = ox + (i % cols) * cellW * s, y = oy + Math.floor(i / cols) * cellH * s, cw = cellW * s, ch = cellH * s;
    gx.lineWidth = 1; gx.strokeStyle = 'rgb(10,12,13)'; gx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    if (i === Gal.selected && !Gal.preview) { gx.lineWidth = 3; gx.strokeStyle = C.acc; gx.strokeRect(x + 2, y + 2, cw - 4, ch - 4); }
    else if (i === Gal.hover) { gx.lineWidth = 1; gx.strokeStyle = C.dim; gx.strokeRect(x + 2, y + 2, cw - 4, ch - 4); }
    if (!Gal.preview) { const st = Gal.IsStarred(c.g); gx.font = FONT(Math.max(12, 9 * s)); gx.textBaseline = 'top'; gx.fillStyle = st ? C.acc : (i === Gal.hover ? C.dim : 'rgba(128,140,134,.35)');
      gx.fillText(st ? '\u2605' : '\u2606', x + cw - 14 * s, y + 2 * s); }
    const [label, col] = labelOf(c, i); gx.font = FONT(13); gx.fillStyle = col; gx.textBaseline = 'top'; gx.fillText(label, x + 10, y + ch - 24);
  });
}
function galFrame() {
  if (!Gal.open) return;
  if (gc.width !== innerWidth || gc.height !== innerHeight) { gc.width = innerWidth; gc.height = innerHeight; }
  UI.widgets = []; const sw = gc.width, by = topH + 10;
  // top bar tabs (main.go): Gallery | Pinoch (back to the room)
  let x = 12, c, w;
  [c, w] = button(x, 9, 'Gallery', true, false); x += w + 6;
  [c] = button(x, 9, 'Pinoch', false, false); if (c) { closeGallery(); UI.click = false; return; }
  x = 12; const step = ([cl, ww]) => { x += ww + 6; return cl; };
  const P = Gal.preview;
  if (!P) {   // galleryBar
    const sel = Gal.Selected(), has = !!sel;
    if (step(button(x, by, '< Back', false, Gal.starView || Gal.hi <= 0))) Gal.Back();
    if (step(button(x, by, 'Forward >', false, Gal.starView || Gal.hi >= Gal.hist.length - 1))) Gal.Forward();
    if (step(button(x, by, 'New batch', false, false))) Gal.NewBatch();
    if (step(button(x, by, 'Breed from this one', false, !has))) Gal.Breed();
    if (step(button(x, by, has && Gal.IsStarred(sel) ? 'Unstar' : 'Star', false, !has))) { Gal.ToggleStar(); Gal.starToast(); }
    if (step(button(x, by, 'Pick for Pinoch', false, !has))) Gal.Pick();
    const st = `Starred (${Gal.stars.length})`; let rx = sw - 12 - bw(st);
    if (button(rx, by, st, Gal.starView, false)[0]) Gal.ShowStarred(true);
    rx -= bw('Batch') + 6; if (button(rx, by, 'Batch', !Gal.starView, false)[0]) Gal.ShowStarred(false);
    const [s, ox, oy] = view(galleryW, galleryH), sx = (UI.mx - ox) / s, sy = (UI.my - oy) / s;
    const inside = !overUI() && sx >= 0 && sy >= 0 && sx < galleryW && sy < galleryH;
    Gal.hover = -1;   // Gallery.Update
    if (inside) { const i = Math.floor(sy / cellH) * gCols + Math.floor(sx / cellW); if (i < Gal.cells.length) { Gal.hover = i; if (UI.click || UI.rclick) Gal.selected = i;
      const onStar = sx % cellW > cellW - 16 && sy % cellH < 14;   // PINOCH: the star in each cell's corner toggles it
      if (UI.rclick || (UI.click && onStar)) { Gal.ToggleStar(); Gal.starToast(); } } }
    for (const cl of Gal.cells) { cl.w.Step(); cl.w.Step(); }
    paint(); renderCells(Gal.cells, gCols, gRows, s, ox, oy, cl => Gal.IsStarred(cl.g) ? ['* STARRED  ' + GL.Describe(cl.g), C.acc] : [GL.Describe(cl.g), C.dim]);
    if (Gal.starView && !Gal.cells.length) { gx.font = FONT(15); gx.fillStyle = C.dim; gx.fillText('Nothing starred yet. Go back to the batch, select a plip you like and press Star.', ox + 20, oy + 20); }
    status(Gal.Caption() + '   ·   click a plip to select it, right-click to star it');
  } else {     // PINOCH: life-cycle preview, 8 stages in a 4x2 strip
    if (step(button(x, by, 'Approve: make this Pinoch', false, false))) { Gal.Approve(); return; }
    if (step(button(x, by, 'Back to gallery', false, false))) Gal.preview = null;
    if (step(button(x, by, 'Save stage PNGs', false, false))) Gal.SavePNGs();
    if (step(button(x, by, 'Discard pick', false, false))) Gal.Reject();
    if (Gal.preview) {
      const [s, ox, oy] = view(pvW * 4, pvH * 2), sx = (UI.mx - ox) / s, sy = (UI.my - oy) / s;
      Gal.hover = (!overUI() && sx >= 0 && sy >= 0 && sx < pvW * 4 && sy < pvH * 2) ? Math.floor(sy / pvH) * 4 + Math.floor(sx / pvW) : -1;
      for (const cl of P.cells) { const p = cl.p;   // show what each stage can do: crawlers roam, hoppers hop
        if (p.moveK > 0.05 && Math.abs(p.TX - p.CoreX) < 2 && cl.w.Tick % 60 === 0) p.TX = p.Rad + 4 + Math.random() * (pvW - 2 * p.Rad - 8);
        if (p.hopK > 0.3 && p.Hop === 0 && cl.w.Tick % 110 === 0) p.Hop = 1;
        cl.w.Step(); cl.w.Step(); }
      paint(); renderCells(P.cells, 4, 2, s, ox, oy, (cl, i) => [`${i} ${CONFIG.stages[i].name}`, C.acc]);
      status(`PENDING ${GL.gid(P.g)}  ${GL.Describe(P.g)}   ·   life cycle preview, approve to make it Pinoch's genome`);
    } else { paint(); status(Gal.Caption()); }
  }
  UI.click = UI.rclick = false;
}
function paint() {
  gx.fillStyle = 'rgb(8,9,10)'; gx.fillRect(0, 0, gc.width, gc.height);
  for (const [y, h] of [[0, topH], [topH, botH]]) { gx.fillStyle = C.bar; gx.fillRect(0, y, gc.width, h); gx.strokeStyle = C.line; gx.lineWidth = 1;
    gx.beginPath(); gx.moveTo(0, y + 0.5); gx.lineTo(gc.width, y + 0.5); gx.moveTo(0, y + h - 0.5); gx.lineTo(gc.width, y + h - 0.5); gx.stroke(); }
  for (const wd of UI.widgets) { const r = wd.r, hov = UI.mx >= r.x && UI.my >= r.y && UI.mx < r.x + r.w && UI.my < r.y + r.h && !wd.disabled;
    gx.fillStyle = wd.on ? C.on : hov ? C.hover : C.btn; gx.fillRect(r.x, r.y, r.w, r.h); gx.strokeStyle = C.line; gx.lineWidth = 1; gx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    gx.font = FONT(14); gx.textBaseline = 'top'; gx.fillStyle = wd.disabled ? C.off : wd.on ? C.acc : C.text; gx.fillText(wd.label, r.x + 12, r.y + 7); }
}
function status(msg) { if (performance.now() - Gal.toastT < 3000) msg = Gal.toast; gx.font = FONT(13); gx.textBaseline = 'top'; gx.fillStyle = C.dim; gx.fillText(msg, gc.width - 12 - gx.measureText(msg).width, 16); }
function openGallery() { if (!Gal.cells.length) Gal.init(); Gal.open = true; gc.style.display = 'block';
  let pend = null; try { pend = JSON.parse(localStorage.getItem('pinoch.pendinggenome.v1')); } catch (_) {} if (pend && !Gal.preview) Gal.Preview(pend); }
function closeGallery() { Gal.open = false; gc.style.display = 'none'; }
(function loop() { requestAnimationFrame(loop); if (!window.PN_PAUSED) galFrame(); })();
// entry button on the room view, styled like a plips tab
const gb = document.createElement('button'); gb.id = 'galbtn'; gb.textContent = 'Gallery';
gb.style.cssText = 'position:absolute;left:14px;top:46px;z-index:10;background:rgb(30,35,38);color:rgb(206,214,209);border:1px solid rgb(40,46,49);font:14px "Go","DejaVu Sans",sans-serif;height:30px;padding:0 12px;cursor:pointer';
gb.onclick = openGallery; document.body.appendChild(gb);
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'g') Gal.open ? closeGallery() : openGallery(); if (e.key === 'Escape' && Gal.open) closeGallery(); });
// PORTFOLIO: the gallery is step one of the demo: pick a plip, preview its life cycle, approve, and it hatches in this room.
// "Gallery" (top-left) goes back to repick. ?gallery=0 skips straight to the room.
let picked = false; try { picked = sessionStorage.getItem('pinoch.picked') === '1'; } catch (_) {}
if (Q.get('gallery') === '1' || (Q.get('gallery') !== '0' && !picked)) openGallery();
gb.textContent = 'Gallery: pick another';
