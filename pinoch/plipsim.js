// 1:1 JavaScript port of themightypooh/plips sim/ at branch claude/project-thread-xe1a5h (cc0abc5): world.go, plip.go, membrane.go,
// render.go, genome.go, brain.go, room.go, legs.go, motor.go.
// Same constants, same order of operations, same 320x180 room. Only additions are marked "PINOCH:".
'use strict';
const PS = (() => {
const MaxP = 6000, R = 3.6, R2 = R * R, RHO0 = 3.2, K = 0.06, KN = 0.3, G = 0.045, Dens = 0.62, EvapAge = 120 * 120, MinMass = 40;
const NCol = 8;
const Colours = [['Red', [186, 62, 54]], ['Orange', [212, 124, 54]], ['Yellow', [220, 188, 72]], ['Green', [82, 148, 82]],
  ['Blue', [62, 102, 186]], ['Violet', [128, 82, 168]], ['White', [228, 226, 218]], ['Black', [34, 33, 37]]].map(([Name, C]) => ({ Name, C }));
const RoleBody = 0, RoleNucleus = 1, RoleLimb = 2, RoleSkin = 3;
const LayoutSingle = 0, LayoutChain = 1, LayoutStack = 2, LayoutClump = 3;
const LimbFeeler = 0, LimbTail = 1, LimbWhisker = 2, LimbNub = 3, LimbLeg = 4;
const RoomW = 320, RoomH = 180, RoomFloor = 163;
const RoomPlatforms = [{ X0: 20, X1: 84, Y: 104 }, { X0: 228, X1: 292, Y: 128 }];
const rnd = Math.random, intn = n => Math.floor(rnd() * n);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const clamp01 = v => clamp(v, 0, 1);
const hypot = (x, y) => Math.sqrt(x * x + y * y);
const sign = v => v < 0 ? -1 : 1;
const u8 = v => v < 0 ? 0 : v > 255 ? 255 : Math.floor(v);
function hsv(h, s, v) {
  h = (h - Math.floor(h)) * 6; const i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  let r, g, b; switch (i % 6) { case 0: [r, g, b] = [v, t, p]; break; case 1: [r, g, b] = [q, v, p]; break; case 2: [r, g, b] = [p, v, t]; break;
    case 3: [r, g, b] = [p, q, v]; break; case 4: [r, g, b] = [t, p, v]; break; default: [r, g, b] = [v, p, q]; }
  return [r * 255, g * 255, b * 255];
}
const BaseColor = g => hsv(g.Hue, g.Sat, g.Val);
const SpotColor = g => hsv(g.Hue2, clamp01(g.Sat + 0.1), clamp01(g.Val * 0.8));

// ---------------- brain.go ----------------
const Hunger = 0, Pain = 1, Boredom = 2, Lonely = 3, Tired = 4, NDrive = 5;
const DriveNames = ['hunger', 'pain', 'bored', 'lonely', 'tired'];
const driveWeight = [1, 2, 0.6, 0.5, 0.6];
const TOther = NCol, THand = NCol + 1, TNone = NCol + 2, NT = NCol + 3;
const AApproach = 0, AEat = 1, ARetreat = 2, APlay = 3, ARest = 4, AHop = 5, NA = 6;
const ActNames = ['approach', 'eat', 'back off from', 'play with', 'rest', 'hop'];
const fDrive = 0, fTgt = fDrive + NDrive, fCross = fTgt + NT, fBias = fCross + NT * NDrive, NF = fBias + 1;
const cross = (t, d) => fCross + t * NDrive + d;
function NewBrain() {
  const W = []; for (let a = 0; a < NA; a++) { W.push(new Array(NF)); for (let f = 0; f < NF; f++) W[a][f] = (rnd() * 2 - 1) * 0.08; }
  for (let t = 0; t < NCol; t++) { W[AEat][cross(t, Hunger)] += 0.7; W[AApproach][cross(t, Boredom)] += 0.2; }
  W[AEat][cross(TOther, Hunger)] += 0.1; W[ARest][cross(TNone, Tired)] += 1.2; W[AHop][cross(TNone, Boredom)] += 0.35;
  W[APlay][cross(TOther, Lonely)] += 0.7; W[APlay][cross(TOther, Boredom)] += 0.35; W[APlay][cross(THand, Boredom)] += 0.25;
  W[ARetreat][cross(TOther, Pain)] += 0.4; W[ARetreat][cross(THand, Pain)] += 0.4;
  return { W };
}
function Features(d, t) { const f = new Array(NF).fill(0); for (let i = 0; i < NDrive; i++) f[fDrive + i] = d[i]; f[fTgt + t] = 1; for (let i = 0; i < NDrive; i++) f[cross(t, i)] = d[i]; f[fBias] = 1; return f; }
function Score(b, a, f) { let s = 0; for (let i = 0; i < NF; i++) if (f[i] !== 0) s += b.W[a][i] * f[i]; return s; }
function Learn(b, a, f, reward, lr) { for (let i = 0; i < NF; i++) { if (f[i] === 0) continue; b.W[a][i] = clamp(b.W[a][i] + lr * reward * f[i], -4, 4); } }
function softmaxPick(scores, temp) {
  const max = Math.max(...scores); let sum = 0; const ps = scores.map(s => { const p = Math.exp((s - max) / temp); sum += p; return p; });
  let x = rnd() * sum; for (let i = 0; i < ps.length; i++) { if (x < ps[i]) return i; x -= ps[i]; } return scores.length - 1;
}

// ---------------- world.go ----------------
class World {
  constructor(w, h, floor) {
    this.W = w; this.H = h; this.Floor = floor; this.Platforms = [];
    const A = () => new Float32Array(MaxP);
    this.X = A(); this.Y = A(); this.PX = A(); this.PY = A(); this.VX = A(); this.VY = A(); this.CR = A(); this.CG = A(); this.CB = A();
    this.Own = new Uint8Array(MaxP); this.Mat = new Uint8Array(MaxP); this.Lobe = new Uint8Array(MaxP); this.Role = new Uint8Array(MaxP); this.Seg = new Uint8Array(MaxP);
    this.Age = new Int32Array(MaxP); this.N = 0; this.Plips = []; this.Hand = { X: 0, Y: 0, Visible: false }; this.Tick = 0;
    this.gw = Math.floor(w / R) + 2; this.gh = Math.floor(h / R) + 2; this.head = new Int32Array(this.gw * this.gh); this.next = new Int32Array(MaxP);
    this.nb = new Int32Array(256); this.nq = new Float32Array(256);
  }
  AddPlip(p, x, colours) {
    const w = this; p.ID = w.Plips.length + 1; w.Plips.push(p); p.CoreX = p.TX = x;
    let mass = p.G.Mass; if (colours && colours.length) mass = colours.length; p.Mass = mass; p.layout(w);
    const base = BaseColor(p.G), spot = SpotColor(p.G);
    for (let k = 0; k < mass; k++) {
      const c = colours && k < colours.length ? colours[k] : null; p.spawnBody(w, base, spot, c);
    }
    if (p.G.Skin) p.spawnSkin(w, base);
    p.spawnLimbs(w);
  }
  addRaw(x, y, mat, own, lobe, role, col, vx, vy) {
    if (this.N >= MaxP) return; const i = this.N;
    this.X[i] = this.PX[i] = x; this.Y[i] = this.PY[i] = y; this.VX[i] = vx; this.VY[i] = vy;
    this.CR[i] = col[0]; this.CG[i] = col[1]; this.CB[i] = col[2];
    this.Own[i] = own; this.Mat[i] = mat; this.Lobe[i] = lobe; this.Role[i] = role; this.Age[i] = 0; this.Seg[i] = 0; this.N++;
  }
  loose(x, y, col, vx, vy) { const c = Colours[col].C, j = (rnd() - 0.5) * 14; this.addRaw(x, y, col + 1, 0, 0, 0, [c[0] + j, c[1] + j, c[2] + j], vx, vy); }
  Splash(x, y, col, count) { for (let k = 0; k < count; k++) { const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()) * 3.2; this.loose(x + Math.cos(a) * d, y + Math.sin(a) * d, col, 0, 0.2); } }
  Drop(x, y, col) { for (let k = 0; k < 3; k++) this.loose(x + (rnd() - 0.5) * 0.8, y + (rnd() - 0.5) * 0.8, col, 0, 0.3); }
  Stream(x, y, col) { this.loose(x + (rnd() - 0.5) * 0.3, y, col, 0, 1.4); }
  Full() { return this.N > MaxP - 64; }
  remove(i) {
    const l = this.N - 1;
    this.X[i] = this.X[l]; this.Y[i] = this.Y[l]; this.PX[i] = this.PX[l]; this.PY[i] = this.PY[l]; this.VX[i] = this.VX[l]; this.VY[i] = this.VY[l];
    this.CR[i] = this.CR[l]; this.CG[i] = this.CG[l]; this.CB[i] = this.CB[l];
    this.Own[i] = this.Own[l]; this.Mat[i] = this.Mat[l]; this.Lobe[i] = this.Lobe[l]; this.Role[i] = this.Role[l]; this.Age[i] = this.Age[l]; this.Seg[i] = this.Seg[l];
    this.N--;
  }
  PlipAt(x, y) { for (const p of this.Plips) if (p.Mass > 10 && hypot(x - p.MX, y - p.MY) < p.Rad * 1.2 + 1) return p; return null; }
  Other(p) { let best = null, bd = 1e9; for (const o of this.Plips) { if (o === p) continue; const d = hypot(o.MX - p.MX, o.MY - p.MY); if (d < bd) { best = o; bd = d; } } return best; }
  ClearLoose() { for (let i = 0; i < this.N;) { if (this.Own[i] === 0) { this.remove(i); continue; } i++; } }
  BodyColours(p) { const out = []; for (let i = 0; i < this.N; i++) if (this.Own[i] === p.ID && this.Role[i] < RoleLimb) out.push([u8(this.CR[i]), u8(this.CG[i]), u8(this.CB[i])]); return out; }
  Step() {
    const w = this; w.Tick++; w.census();
    for (const p of w.Plips) p.Update(w);
    w.housekeeping();
    for (let i = 0; i < w.N; i++) {
      let damp = 0.996; const o = w.Own[i];
      let skipDamp = false;
      if (o === 0) { w.VY[i] += G; w.Age[i]++; }
      else {
        const p = w.Plips[o - 1];
        if (w.Role[i] === RoleLimb) { w.VY[i] += G * 0.3; w.VX[i] *= 0.85; w.VY[i] *= 0.85; skipDamp = true; }
        else if (w.Role[i] === RoleSkin) { w.VY[i] += G * p.gScale * 0.6; w.VX[i] *= p.damp; w.VY[i] *= p.damp; skipDamp = true; }
        else {
          w.VY[i] += G * p.gScale;
          if (p.grab) { w.VY[i] += G * 0.7; w.VX[i] += (rnd() - 0.5) * 0.3; w.VY[i] += (rnd() - 0.5) * 0.3; }   // PINOCH: dangles and squirms in your hand
          const l = w.Lobe[i]; const cx = p.CoreX + p.LX[l], cy = p.CoreY + p.LY[l]; let r = p.LR[l] * p.breathScale, kout = p.kOut;
          if (w.Role[i] === RoleNucleus) { r *= 0.38; kout *= 2; }
          const dx = cx - w.X[i], dy = cy - w.Y[i];
          if (p.G.Lumpy > 0 && w.Role[i] === RoleBody) { const th = Math.atan2(-dy, -dx); r *= 1 + p.G.Lumpy * 0.3 * Math.sin(p.G.LumpK * th + p.lumpPh); }
          let kin = p.kIn; if (p.skinIdx) { kin *= 0.35; kout *= 0.3; }
          w.VX[i] += dx * kin; w.VY[i] += dy * kin;
          const ex = dx / (r * p.ax), ey = dy / (r * p.ay), e = Math.sqrt(ex * ex + ey * ey);
          if (e > 1) { const f = kout * (e - 1) / e; w.VX[i] += dx * f; w.VY[i] += dy * f; }
          damp = p.damp;
        }
      }
      if (!skipDamp) { w.VX[i] *= damp; w.VY[i] *= damp; }
      const sp = w.VX[i] * w.VX[i] + w.VY[i] * w.VY[i]; if (sp > 9) { const s = 3 / Math.sqrt(sp); w.VX[i] *= s; w.VY[i] *= s; }
      w.PX[i] = w.X[i]; w.PY[i] = w.Y[i]; w.X[i] += w.VX[i]; w.Y[i] += w.VY[i]; w.collide(i);
    }
    w.grid(); w.relax();
    for (const p of w.Plips) { p.solveSkin(w); p.solveLimbs(w); }
    for (let i = 0; i < w.N; i++) { w.collide(i); w.VX[i] = w.X[i] - w.PX[i]; w.VY[i] = w.Y[i] - w.PY[i]; }
  }
  collide(i) {
    const w = this;
    if (w.X[i] < 2) w.X[i] = 2; else if (w.X[i] > w.W - 2) w.X[i] = w.W - 2;
    if (w.Y[i] < 1) w.Y[i] = 1;
    if (w.Y[i] >= w.Floor) { w.Y[i] = w.Floor; w.X[i] = w.X[i] * 0.7 + w.PX[i] * 0.3; return; }
    if (w.Own[i] !== 0) return;
    for (const p of w.Platforms) if (w.PY[i] <= p.Y && w.Y[i] > p.Y && w.X[i] >= p.X0 && w.X[i] <= p.X1) { w.Y[i] = p.Y; w.X[i] = w.X[i] * 0.7 + w.PX[i] * 0.3; }
  }
  census() {
    const w = this, a = []; for (let k = 0; k < 16; k++) a.push({ sx: 0, sy: 0, hx: 0, hy: 0, n: 0, hn: 0 });
    for (const p of w.Plips) { if (p.skinIdx) p.skinIdx.fill(-1); for (const li of p.limbIdx) li.fill(-1); }
    for (let i = 0; i < w.N; i++) {
      const o = w.Own[i]; if (o === 0) continue;
      if (w.Role[i] === RoleSkin) { const p = w.Plips[o - 1]; const k = w.Seg[i]; if (p.skinIdx && k < p.skinIdx.length) p.skinIdx[k] = i; continue; }
      if (w.Role[i] === RoleLimb) { const p = w.Plips[o - 1], li = w.Lobe[i], sg = w.Seg[i]; if (li < p.limbIdx.length && sg < p.limbIdx[li].length) p.limbIdx[li][sg] = i; continue; }
      const s = a[o]; s.sx += w.X[i]; s.sy += w.Y[i]; s.n++;
      if (w.Lobe[i] === 0 && w.Role[i] === 0) { s.hx += w.X[i]; s.hy += w.Y[i]; s.hn++; }
    }
    for (const p of w.Plips) {
      const s = a[p.ID]; p.Mass = s.n;
      if (s.n > 0) { p.MX = s.sx / s.n; p.MY = s.sy / s.n; }
      if (s.hn > 0) { p.HeadX = s.hx / s.hn; p.HeadY = s.hy / s.hn; }
      p.layout(w);
    }
  }
  housekeeping() {
    const w = this;
    for (const p of w.Plips) if (p.Drives[Hunger] > 0.9 && p.Mass > MinMass && w.Tick % 360 === 0)
      for (let i = 0; i < w.N; i++) if (w.Own[i] === p.ID && w.Role[i] === 0) { w.remove(i); break; }
    for (let k = 0; k < 2 && w.N > 0; k++) { const i = intn(w.N); if (w.Own[i] === 0 && w.Age[i] > EvapAge) w.remove(i); }
  }
  grid() {
    const w = this; w.head.fill(-1);
    for (let i = 0; i < w.N; i++) {
      if (w.Role[i] >= RoleLimb) continue;
      let gx = Math.floor(w.X[i] / R), gy = Math.floor(w.Y[i] / R); if (gx >= w.gw) gx = w.gw - 1; if (gy >= w.gh) gy = w.gh - 1;
      const c = gy * w.gw + gx; w.next[i] = w.head[c]; w.head[c] = i;
    }
  }
  relax() {
    const w = this, X = w.X, Y = w.Y, nb = w.nb, nq = w.nq;
    for (let i = 0; i < w.N; i++) {
      if (w.Role[i] >= RoleLimb) continue;
      const xi = X[i], yi = Y[i], cx = Math.floor(xi / R), cy = Math.floor(yi / R); let rho = 0, rhoN = 0, m = 0;
      for (let gy = cy - 1; gy <= cy + 1; gy++) { if (gy < 0 || gy >= w.gh) continue;
        for (let gx = cx - 1; gx <= cx + 1; gx++) { if (gx < 0 || gx >= w.gw) continue;
          for (let j = w.head[gy * w.gw + gx]; j !== -1; j = w.next[j]) { if (j === i) continue;
            const dx = X[j] - xi, dy = Y[j] - yi, d2 = dx * dx + dy * dy;
            if (d2 < R2 && m < 256) { const q = 1 - Math.sqrt(d2) / R; rho += q * q; rhoN += q * q * q; nb[m] = j; nq[m] = q; m++; } } } }
      const P = K * (rho - RHO0), PN = KN * rhoN; let ddx = 0, ddy = 0; const own = w.Own[i]; const p = own ? w.Plips[own - 1] : null;
      for (let k = 0; k < m; k++) {
        const j = nb[k], q = nq[k]; let dx = X[j] - xi, dy = Y[j] - yi; let d = Math.sqrt(dx * dx + dy * dy); if (d < 1e-3) d = 1e-3; dx /= d; dy /= d;
        const D = (P * q + PN * q * q) * 0.5; X[j] += dx * D; Y[j] += dy * D; ddx -= dx * D; ddy -= dy * D;
        if (!p) {
          if (w.Own[j] === 0 && w.Mat[j] === w.Mat[i] && q < 0.7) { const c = 0.012 * q; X[j] -= dx * c; Y[j] -= dy * c; ddx += dx * c; ddy += dy * c; }
          continue;
        }
        const oj = w.Own[j];
        if (oj === own) { if (w.Role[i] === w.Role[j]) { w.CR[i] += (w.CR[j] - w.CR[i]) * 0.00025; w.CG[i] += (w.CG[j] - w.CG[i]) * 0.00025; w.CB[i] += (w.CB[j] - w.CB[i]) * 0.00025; } }
        else if (oj === 0) {
          if (w.Mat[j] === 0 && q > 0.5 && w.Age[j] > 60) { w.Own[j] = own; w.Lobe[j] = w.Lobe[i]; p.Mass++; }
          else if (q > 0.45 && p.EatCol >= 0 && w.Mat[j] === p.EatCol + 1 && p.Mass < p.MaxMass()) { w.Own[j] = own; w.Lobe[j] = w.Lobe[i]; p.Mass++; p.Ate(w.Mat[j] - 1); }
        } else if (oj === p.StealFrom && q > 0.5 && p.stealCD <= 0) {
          const o = w.Plips[oj - 1];
          if (o.Mass > MinMass && w.Role[j] === 0) { w.Own[j] = own; w.Lobe[j] = w.Lobe[i]; p.Mass++; o.Mass--; p.stealCD = 10; p.Drives[Hunger] = clamp01(p.Drives[Hunger] - 0.012); o.Hurt(0.03); }
        }
      }
      X[i] += ddx; Y[i] += ddy;
    }
  }
}

// ---------------- plip.go + membrane.go ----------------
class Plip {
  constructor(g, name, withBrain) {
    Object.assign(this, { ID: 0, Name: name, G: g, Brain: null, CoreX: 0, CoreY: 0, TX: 0, Mass: 0, MX: 0, MY: 0, HeadX: 0, HeadY: 0, Rad: 0,
      LX: [0, 0, 0, 0], LY: [0, 0, 0, 0], LR: [0, 0, 0, 0], ax: 1, ay: 1, kIn: 0, kOut: 0, damp: 0, breathScale: 1, lift: 0, wigglePh: 0, breath: 0,
      Face: 1, Hop: 0, Blink: 0, Flinch: 0, Happy: 0, Moving: false, Resting: false, Drives: [0, 0, 0, 0, 0], EatCol: -1, StealFrom: 0, stealCD: 0,
      Act: 0, Tgt: 0, actT: 0, actMax: 0, feat: new Array(NF).fill(0), startBad: 0, tgtX: 0, tgtOK: false, LastReward: 0, wanderT: 0, Age: 0,
      limbs: null, limbIdx: [], skinIdx: null, Motor: null, nLegs: 0, legLift: 0, walkPh: 0, growT: 0, lastFace: 0, gScale: 0, lumpPh: g.LumpPh || 0, limbPh: 0,
      // PINOCH: grab-and-carry state (plips has no drag; this moves the core and lets the same springs pull body+skin along)
      grab: false, grabX: 0, grabY: 0, grabOX: 0, grabOY: 0, liftV: 0, gvx: 0, carry: 0, falling: false, dizzy: 0, startle: 0, restY: 0, moveK: 1, hopK: 1 });
    this.setLimbs();
    if (withBrain) { this.Brain = NewBrain(); this.Drives = [0.3, 0, 0.3, 0.2, 0.1]; }
  }
  setLimbs() {
    const old = this.limbs || []; this.limbs = []; this.nLegs = 0;
    for (const l of this.G.Limbs || []) { if (l.Len < 1) continue; if (NO_LEGS && l.Kind === LimbLeg) continue;   // PORTFOLIO: legs off until legs-v2 is approved
      for (const sd of (l.Mirror ? [-1, 1] : [0])) {
        const li = { ...l, side: sd, grown: 0, leg: -1, a1: 0, a2: 0, a2e: 0, reach: 0, fx: 0, pfx: 0, contact: false, wasContact: false };
        if (l.Kind === LimbLeg) { if (this.nLegs >= MaxLegs) continue; li.leg = this.nLegs++; }
        li.grown = segs(li); this.limbs.push(li); } }
    // PINOCH: keep leg pose state when the limb list is rebuilt for growth
    this.limbs.forEach((l, i) => { const o = old[i]; if (o && o.Kind === l.Kind) for (const k of ['a1', 'a2', 'a2e', 'reach', 'fx', 'pfx', 'contact', 'wasContact']) l[k] = o[k]; });
    if (this.nLegs > 0 && !this.Motor) this.Motor = NewMotor();
    this.limbIdx = this.limbs.map(l => new Int32Array(segs(l)).fill(-1));
  }
  spawnBody(w, base, spot, c) {   // the per-particle part of World.AddPlip
    const p = this, l0 = pickWeighted(p.lobeWeights()); let l = l0, role = 0;
    if (rnd() < p.G.Nucleus) { role = 1; l = 0; }
    let col = base; const jit = (rnd() - 0.5) * p.G.Speckle;
    if (role === 1) col = [base[0] * 0.55, base[1] * 0.55, base[2] * 0.6]; else if (rnd() < p.G.Spots) col = spot;
    col = [col[0] + jit, col[1] + jit, col[2] + jit]; if (c) col = c.slice();
    const a = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()) * p.LR[l] * 0.8;
    w.addRaw(p.CoreX + p.LX[l] + Math.cos(a) * d, p.CoreY + p.LY[l] + Math.sin(a) * d, 0, p.ID, l, role, col, 0, 0);
  }
  spawnLimbs(w) {
    const p = this, base = BaseColor(p.G), limbCol = [base[0] * 0.82, base[1] * 0.82, base[2] * 0.85], tipCol = [base[0] * 1.1 + 12, base[1] * 1.1 + 12, base[2] * 1.1 + 12];
    p.limbs.forEach((lm, li) => { const [ax, ay] = p.limbAnchor(li);
      for (let s = 0; s < lm.grown; s++) { w.addRaw(ax, ay - s, 0, p.ID, li, RoleLimb, s >= lm.Len ? tipCol : limbCol, 0, 0); w.Seg[w.N - 1] = s; } });
  }
  MaxMass() { return Math.min(330, Math.floor(this.G.Mass * 2.2)); }
  lobes() { return clamp(this.G.Lobes, 1, 4); }
  lobeWeights() {
    const n = this.lobes(), w = []; let v = 1; for (let i = 0; i < n; i++) { w.push(v); v *= this.G.LobeTaper; }
    if (this.G.Layout === LayoutStack || this.G.Layout === LayoutClump) w.reverse();
    return w;
  }
  layout(w) {
    const p = this, g = p.G, total = Math.sqrt(p.Mass / (Math.PI * Dens)) * g.Pack;
    p.Rad = total; p.ax = Math.sqrt(g.Aspect); p.ay = 1 / p.ax;
    p.kIn = lerp(0.0025, 0.012, g.Soft); p.kOut = lerp(0.01, 0.06, g.Taut); p.damp = lerp(0.984, 0.998, g.Jiggle); p.gScale = lerp(0.12, 0.7, g.Sag);
    p.breathScale = 1 + g.Breath * 0.1 * Math.sin(p.breath);
    const ws = p.lobeWeights(); let sum = 0; for (const v of ws) sum += v; const n = ws.length;
    for (let i = 0; i < 4; i++) { p.LX[i] = p.LY[i] = p.LR[i] = 0; }
    ws.forEach((v, i) => { p.LR[i] = total * Math.sqrt(v / sum); });
    const gap = g.LobeGap;
    if (g.Layout === LayoutChain) {
      let x = 0; for (let i = 1; i < n; i++) { x -= (p.LR[i - 1] + p.LR[i]) * p.ax * gap; p.LX[i] = x; }
      const mid = x / 2; for (let i = 0; i < n; i++) { p.LX[i] = (p.LX[i] - mid) * p.Face; if (p.Moving) p.LY[i] = Math.sin(p.wigglePh - i * 1.3) * p.LR[i] * 0.15; }
    } else if (g.Layout === LayoutStack) {
      let y = 0; for (let i = n - 2; i >= 0; i--) { y -= (p.LR[i + 1] + p.LR[i]) * p.ay * gap; p.LY[i] = y; }
      if (p.Moving) p.LX[0] = Math.sin(p.wigglePh) * p.LR[0] * 0.15;
    } else if (g.Layout === LayoutClump) {
      if (n === 2) { p.LX[0] = p.Face * p.LR[1] * 0.4; p.LY[0] = -(p.LR[0] + p.LR[1]) * p.ay * gap * 0.8; }
      else { p.LX[1] = -p.LR[1] * p.ax * gap * 0.9; p.LX[2] = p.LR[2] * p.ax * gap * 0.9; p.LY[0] = -(p.LR[0] + p.LR[1]) * p.ay * gap * 0.85;
        if (n === 4) { p.LX[3] = p.Face * p.LR[3] * 1.4; p.LY[3] = -p.LR[3] * 0.6; } }
    }
    const low = p.lowLobe();
    p.restY = w.Floor - p.LY[low] - p.LR[low] * p.ay * 0.85 * p.breathScale;   // PINOCH: core height when standing, for carrying
    p.CoreY = w.Floor - p.LY[low] - p.LR[low] * p.ay * 0.85 * p.breathScale - p.lift - p.legLift;
  }
  lowLobe() { let low = 0; for (let i = 1; i < this.lobes(); i++) if (this.LY[i] + this.LR[i] * this.ay > this.LY[low] + this.LR[low] * this.ay) low = i; return low; }
  Update(w) {
    const p = this; p.Age++;
    if (p.Blink > 0) p.Blink--; else if (rnd() < 0.004) p.Blink = 8;
    if (p.Flinch > 0) p.Flinch--; if (p.Happy > 0) p.Happy--; if (p.stealCD > 0) p.stealCD--;
    p.breath += 0.025 + p.G.Breath * 0.02; p.limbPh += p.grab ? 0.4 : 0.05;   // PINOCH: limbs flail while carried
    p.EatCol = -1; p.StealFrom = 0; p.Resting = false;
    if (p.Brain) { p.drift(w); p.think(w); } else p.idle(w);
    p.grow(w);
    const lo = p.Rad + 3, hi = (p.maxX || w.W) - p.Rad - 3;   // PINOCH: maxX keeps him out from under the side panel
    if (p.TX < lo) p.TX = lo; else if (p.TX > hi) p.TX = hi;
    if (p.dizzy > 0) p.dizzy--; if (p.startle > 0) p.startle--;
    p.lift = 0;
    if (p.grab || p.falling) {   // PINOCH: carried like the old Pinoch: springy hand with momentum, then flung/dropped with gravity
      if (p.grab) p.gvx = (p.gvx + (p.grabX + p.grabOX - p.CoreX) * 0.07) * 0.8; else p.gvx *= 0.995;
      p.gvx = clamp(p.gvx, -6, 6); p.CoreX += p.gvx;
      if (p.CoreX < lo || p.CoreX > hi) { p.CoreX = clamp(p.CoreX, lo, hi); if (p.grab) p.gvx = 0; else { p.gvx *= -0.7; p.Flinch = 20; p.startle = 30; } }   // thrown into a wall
      if (Math.abs(p.gvx) > 0.3) p.Face = sign(p.gvx);
      if (p.grab) { p.Hop = 0; const want = clamp(p.restY - (p.grabY + p.grabOY), 0, p.restY - p.Rad - 2);
        p.liftV = (p.liftV + (want - p.carry) * 0.07) * 0.8; p.liftV = clamp(p.liftV, -6, 6); p.carry += p.liftV; }
      else { p.liftV -= G * 2; p.carry += p.liftV;
        if (p.carry <= 0) { p.carry = 0;
          if (p.liftV < -2.2) { p.liftV *= -0.3; p.Flinch = 25; p.startle = 30; p.dizzy = 70; }   // splat + small bounce
          else { p.liftV = 0; p.falling = false; } } }
      p.TX = p.CoreX; p.Moving = false; p.walk(w, false);
    } else {
      const dx = p.TX - p.CoreX, speed = 0.2 * p.G.Speed * p.moveK;
      if (Math.abs(dx) > 0.6) p.Face = sign(dx);
      const want = Math.abs(dx) > 1.5 && p.moveK > 0.01;
      let step = clamp(dx * 0.03, -speed, speed);
      if (p.nLegs > 0) { step *= 1 - 0.4 * p.legGrowth(); if (p.legLift > 1) step *= 0.35; }
      if (Math.abs(p.gvx) > 0.05) { step += p.gvx; p.gvx *= 0.85; } else p.gvx = 0;   // skid after a throw
      const x0 = p.CoreX, legsOn = want && p.Hop === 0;
      p.CoreX = clamp(p.CoreX + step + p.walk(w, legsOn), lo, hi);
      if (p.Motor && legsOn) p.Motor.learn((p.CoreX - x0) * sign(dx));
      p.Moving = want; if (p.Moving) p.wigglePh += 0.12 * p.G.Speed;
      if (p.Hop > 0) { p.Hop++; const t = p.Hop / 46; p.lift = Math.sin(Math.min(t, 1) * Math.PI) * p.Rad * (0.45 + p.G.Hoppy * 0.6) * p.hopK; if (t >= 1) p.Hop = 0; }
    }
    if (p.carry > 0) p.lift = Math.max(p.lift, p.carry);
  }
  idle(w) { const p = this; p.wanderT--; if (p.wanderT <= 0) { p.TX = p.Rad + 3 + rnd() * (w.W - 2 * p.Rad - 6); p.wanderT = 200 + intn(400); if (rnd() < p.G.Hoppy * 0.6 && p.Hop === 0) p.Hop = 1; } }
  bad() { let s = 0; for (let i = 0; i < NDrive; i++) s += this.Drives[i] * driveWeight[i]; return s; }
  drift(w) {
    const d = this.Drives; d[Hunger] += 0.00006 * this.G.Metab; d[Boredom] += 0.00005; d[Tired] += 0.000015; if (this.Moving) d[Tired] += 0.00002;
    const o = w.Other(this); if (o) { if (Math.abs(o.MX - this.MX) > 60) d[Lonely] += 0.00004; else d[Lonely] -= 0.0001; } else d[Lonely] += 0.00002;
    d[Pain] *= 0.998; for (let i = 0; i < NDrive; i++) d[i] = clamp01(d[i]);
  }
  Ate(col) { if (col < 0 || col >= NCol) return; this.Drives[Hunger] = clamp01(this.Drives[Hunger] - 0.02 * this.G.Taste[col]); this.Drives[Boredom] = clamp01(this.Drives[Boredom] - 0.002); this.eaten = (this.eaten || 0) + 1; }
  Hurt(x) { this.Drives[Pain] = clamp01(this.Drives[Pain] + x); this.Flinch = 20; }
  Pet() {
    const p = this; p.Happy = 50;
    if (!p.Brain) { if (p.Hop === 0) p.Hop = 1; return; }
    Learn(p.Brain, p.Act, p.feat, 0.9, p.G.LR); p.Drives[Boredom] = clamp01(p.Drives[Boredom] - 0.15); p.Drives[Lonely] = clamp01(p.Drives[Lonely] - 0.1);
  }
  Poke(w, x, y) {
    const p = this;
    for (let i = 0; i < w.N; i++) {
      if (w.Own[i] !== p.ID) continue; const dx = w.X[i] - x, dy = w.Y[i] - y, d = hypot(dx, dy);
      if (d < 9) { const f = (1 - d / 9) * 2.4 + 0.3; w.X[i] += dx / (d + 0.01) * f * 0.5; w.Y[i] += dy / (d + 0.01) * f * 0.5 - f * 0.4;
        if (d < 5 && w.Role[i] === 0 && rnd() < 0.4 && p.Mass > MinMass) { w.Own[i] = 0; w.Age[i] = 0; } }
    }
    p.Hurt(0.35); p.Flinch = 40; if (p.Hop === 0) p.Hop = 1;
    if (p.Brain) Learn(p.Brain, p.Act, p.feat, -0.9, p.G.LR);
  }
  Doing(w) { if (!this.Brain || this.actMax === 0) return ''; if (this.Act === ARest || this.Act === AHop) return ActNames[this.Act]; return ActNames[this.Act] + ' ' + this.TargetName(w, this.Tgt); }
  TargetName(w, t) { if (t < NCol) return Colours[t].Name.toLowerCase(); if (t === TOther) { const o = w.Other(this); return o ? o.Name : 'friend'; } if (t === THand) return 'you'; return ''; }
  food(w) {
    const best = new Array(NCol).fill(1e9), pos = new Array(NCol).fill(0), ok = new Array(NCol).fill(false);
    for (let i = 0; i < w.N; i++) { if (w.Own[i] !== 0 || w.Mat[i] === 0 || w.Y[i] < w.Floor - 14) continue;
      const c = w.Mat[i] - 1, d = Math.abs(w.X[i] - this.CoreX); if (d < best[c]) { best[c] = d; pos[c] = w.X[i]; ok[c] = true; } }
    return [pos, ok];
  }
  think(w) {
    const p = this; if (p.actMax === 0) p.decide(w); p.actT++; const o = w.Other(p);
    if (p.Tgt < NCol) { if (p.actT % 15 === 1) { const [pos, ok] = p.food(w); p.tgtX = pos[p.Tgt]; p.tgtOK = ok[p.Tgt]; } }
    else if (p.Tgt === TOther) { p.tgtOK = !!o; if (o) p.tgtX = o.MX; }
    else if (p.Tgt === THand) { p.tgtOK = w.Hand.Visible; p.tgtX = w.Hand.X; }
    else { p.tgtOK = true; p.tgtX = p.CoreX; }
    let near = Math.abs(p.CoreX - p.tgtX) < p.Rad + 4; if (p.Tgt === TOther && o) near = Math.abs(p.CoreX - p.tgtX) < p.Rad + o.Rad + 5;
    let done = p.actT >= p.actMax || !p.tgtOK;
    switch (p.Act) {
      case AApproach: p.TX = p.tgtX; if (near) { p.Drives[Boredom] = clamp01(p.Drives[Boredom] - 0.04); done = true; } break;
      case AEat: p.TX = p.tgtX; if (p.Tgt < NCol) p.EatCol = p.Tgt; else if (p.Tgt === TOther && o) p.StealFrom = o.ID; break;
      case ARetreat: if (p.actT === 1) p.TX = p.CoreX - sign(p.tgtX - p.CoreX) * 50; break;
      case APlay: p.TX = p.tgtX; if (near) { p.Drives[Boredom] = clamp01(p.Drives[Boredom] - 0.0025);
        if (p.Tgt === TOther && o) { p.Drives[Lonely] = clamp01(p.Drives[Lonely] - 0.003); o.Drives[Lonely] = clamp01(o.Drives[Lonely] - 0.0015); o.Drives[Boredom] = clamp01(o.Drives[Boredom] - 0.001); }
        if (p.Hop === 0 && rnd() < 0.012) p.Hop = 1; } break;
      case ARest: p.TX = p.CoreX; p.Resting = true; p.Drives[Tired] = clamp01(p.Drives[Tired] - 0.0015); break;
      case AHop: if (p.actT === 1) { p.Hop = 1; p.Drives[Boredom] = clamp01(p.Drives[Boredom] - 0.05); p.Drives[Tired] = clamp01(p.Drives[Tired] + 0.01); } done = p.actT > 46; break;
    }
    if (done) { const reward = (p.startBad - p.bad()) * 4; Learn(p.Brain, p.Act, p.feat, reward, p.G.LR); p.LastReward = reward; p.actMax = 0; }
  }
  decide(w) {
    const p = this, opts = []; const [, ok] = p.food(w);
    for (let c = 0; c < NCol; c++) if (ok[c]) opts.push([AApproach, c], [AEat, c], [ARetreat, c], [APlay, c]);
    const o = w.Other(p); if (o && o.Mass > 10) opts.push([AApproach, TOther], [AEat, TOther], [ARetreat, TOther], [APlay, TOther]);
    if (w.Hand.Visible) opts.push([AApproach, THand], [ARetreat, THand], [APlay, THand]);
    opts.push([ARest, TNone], [AHop, TNone]);
    const scores = opts.map(([a, t]) => Score(p.Brain, a, Features(p.Drives, t)));
    const c = opts[softmaxPick(scores, p.G.Temp)];
    p.Act = c[0]; p.Tgt = c[1]; p.feat = Features(p.Drives, c[1]); p.startBad = p.bad(); p.actT = 0; p.actMax = [300, 420, 180, 360, 420, 60][c[0]]; p.tgtOK = true;
  }
  limbDir(li) {
    const p = this, l = p.limbs[li]; let a = 0;
    if (l.Kind === LimbFeeler) a = -Math.PI / 2 + l.side * 0.45 + l.Angle * 0.6;
    else if (l.Kind === LimbTail) a = Math.PI + 0.35 + l.Angle * 0.5;
    else if (l.Kind === LimbWhisker) a = l.side * 0.35 + l.Angle * 0.4;
    else if (l.Kind === LimbNub) a = 0.7 + l.Angle * 0.3;
    else if (l.Kind === LimbLeg) return [0, 1];
    a += Math.sin(p.limbPh + li * 1.7) * (p.grab ? 0.7 : 0.12);
    let dx = Math.cos(a), dy = Math.sin(a);
    if (l.Kind === LimbTail || l.Kind === LimbWhisker) dx *= p.Face; else if (l.Kind === LimbNub && l.side < 0) dx = -dx;
    return [dx, dy];
  }
  limbAnchor(li) {
    const p = this, l = p.limbs[li], n = p.lobes(); let lobe = 0;
    if (l.leg >= 0) return p.hip(li);
    if (l.Kind === LimbTail || l.Kind === LimbNub) for (let i = 1; i < n; i++) {
      if (l.Kind === LimbTail && p.LX[i] * p.Face < p.LX[lobe] * p.Face) lobe = i;
      if (l.Kind === LimbNub && p.LY[i] > p.LY[lobe]) lobe = i;
    }
    let [dx, dy] = p.limbDir(li); if (l.Kind === LimbNub) dy = 0.3;
    const r = p.LR[lobe] * 0.85; return [p.CoreX + p.LX[lobe] + dx * r * p.ax, p.CoreY + p.LY[lobe] + dy * r * p.ay];
  }
  solveLimbs(w) {
    const p = this;
    p.limbs.forEach((l, li) => {
      if (l.leg >= 0) { p.placeLeg(w, li); return; }
      let [px, py] = p.limbAnchor(li); const [rx, ry] = p.limbDir(li), k = 0.04 + l.Stiff * 0.5, droop = (1 - l.Stiff) * 0.35;
      const idx = p.limbIdx[li];
      for (let s = 0; s < idx.length; s++) { const i = idx[s]; if (i < 0) continue;
        const seg = s >= l.Len ? 0.55 : 1.15; let cx = w.X[i] - px, cy = w.Y[i] - py; const d = hypot(cx, cy);
        if (d > 1e-3) { cx /= d; cy /= d; } else { cx = rx; cy = ry; }
        let dx = rx * k + cx * (1 - k), dy = ry * k + cy * (1 - k) + droop * 0.3; const e = hypot(dx, dy); if (e > 1e-3) { dx /= e; dy /= e; }
        w.X[i] = px + dx * seg; w.Y[i] = py + dy * seg; px = w.X[i]; py = w.Y[i]; }
    });
  }

  // ---------------- legs.go ----------------
  Bud() { for (const l of this.limbs) l.grown = 1; }
  LimbGrowth() { return this.limbs.map(l => l.grown); }
  SetLimbGrowth(g) { this.limbs.forEach((l, i) => { if (i < g.length) l.grown = Math.max(1, Math.min(g[i], segs(l))); }); }
  Legs() { return [this.nLegs, this.legGrowth()]; }
  legGrowth() { let g = 0, t = 0; for (const l of this.limbs) if (l.leg >= 0) { g += l.grown; t += segs(l); } return t === 0 ? 0 : g / t; }
  WalkWords() {
    const p = this; if (!p.Motor) return ''; if (p.legGrowth() < 0.35) return 'legs budding'; if (p.Motor.Strength < 0.3) return 'legs too weak to stand';
    const r = p.Motor.Skill / (0.2 * p.G.Speed);
    if (p.Motor.Tries < 8 || r < 0.15) return 'flailing its legs'; if (r < 0.45) return 'first wobbly steps'; if (r < 0.8) return 'toddling'; if (r < 1.3) return 'walking'; return 'trotting about';
  }
  grow(w) {
    const p = this; if (!p.Brain) return;
    if (p.growTo) { // PINOCH: limb growth follows training stage; segments still come from body drops via sprout()
      if (w.Tick % 8 !== 0) return;
      p.limbs.forEach((l, li) => { const want = Math.min(segs(l), p.growTo[li] || 0);
        if (l.grown < want && p.Mass > 24 && p.sprout(w, li)) l.grown++;
        else if (l.grown > Math.max(1, want)) p.unsprout(w, li); });
      return;
    }
    let rate = p.G.GrowRate; if (!(rate > 0)) rate = 1; p.growT += rate; if (p.growT < growPeriod) return; p.growT = 0;
    p.limbs.forEach((l, li) => { if (l.grown >= segs(l) || p.Mass <= MinMass + 6) return; if (p.sprout(w, li)) { l.grown++; p.Drives[Hunger] = clamp01(p.Drives[Hunger] + 0.015); } });
  }
  unsprout(w, li) { // PINOCH: (stage went back) the limb's last segment melts back into the body
    const l = this.limbs[li], i = this.limbIdx[li][l.grown - 1]; l.grown--; if (i == null || i < 0) return;
    const b = BaseColor(this.G); w.Role[i] = RoleBody; w.Lobe[i] = 0; w.Seg[i] = 0; w.CR[i] = b[0]; w.CG[i] = b[1]; w.CB[i] = b[2];
  }
  sprout(w, li) {
    const p = this; let [ex, ey] = p.limbAnchor(li); const idx = p.limbIdx[li];
    if (p.limbs[li].grown - 1 < idx.length) { const i = idx[p.limbs[li].grown - 1]; if (i >= 0) { ex = w.X[i]; ey = w.Y[i]; } }
    let best = -1, bd = 1e9;
    for (let i = 0; i < w.N; i++) { if (w.Own[i] !== p.ID || w.Role[i] !== RoleBody) continue; const d = hypot(w.X[i] - ex, w.Y[i] - ey); if (d < bd) { best = i; bd = d; } }
    if (best < 0) return false;
    const base = BaseColor(p.G); let c = [base[0] * 0.82, base[1] * 0.82, base[2] * 0.85];
    if (p.limbs[li].grown >= p.limbs[li].Len) c = [base[0] * 1.1 + 12, base[1] * 1.1 + 12, base[2] * 1.1 + 12];
    w.Role[best] = RoleLimb; w.Lobe[best] = li; w.Seg[best] = p.limbs[li].grown; w.CR[best] = c[0]; w.CG[best] = c[1]; w.CB[best] = c[2];
    return true;
  }
  hip(li) {
    const p = this, l = p.limbs[li]; let top = 0;
    for (let i = 1; i < p.lobes(); i++) if (p.LY[i] - p.LR[i] * p.ay < p.LY[top] - p.LR[top] * p.ay) top = i;
    const r = p.LR[top], off = (l.side * 0.45 + l.Angle * 0.3) * r * p.ax;
    return [p.CoreX + p.LX[top] + off * p.Face, p.CoreY + p.LY[top] - r * p.ay * 0.7];
  }
  legSeg(l) { return clamp(this.Rad * this.ay * 5 / Math.max(l.Len, 1), 0.9, 1.6); }
  LegLift() { return this.legLift; }
  Strength() { return this.Motor ? this.Motor.Strength : 0; }
  walk(w, want) {
    const p = this; if (p.nLegs === 0) { p.legLift = 0; return 0; }
    const m = p.Motor, flip = p.Face !== p.lastFace; p.lastFace = p.Face;
    const contact = new Array(MaxLegs).fill(0); for (const l of p.limbs) if (l.leg >= 0 && l.contact) contact[l.leg] = 1;
    let tg = [[0, 0], [0, 0], [0, 0], [0, 0]];
    if (want) { p.walkPh += m.rate(); tg = m.targets(p.walkPh, contact, p.legLift / (p.Rad + 1)); }
    let maxReach = 0, stiff = 0, hy = 0;
    for (let li = 0; li < p.limbs.length; li++) {
      const l = p.limbs[li]; if (l.leg < 0) continue;
      const splay = l.side * 0.5 + l.Angle * 0.4; let h, k;
      if (want) { h = splay + tg[l.leg][0]; k = l.side * 0.15 + tg[l.leg][1]; }
      else if (p.Resting) { h = splay * 1.8; k = l.side * 0.7; }
      else { h = splay; k = l.side * 0.2; }
      const rate = 0.05 + 0.12 * l.Stiff;
      l.a1 += clamp(h - l.a1, -rate, rate); l.a2 += clamp(k - l.a2, -rate, rate);
      const [n1, n2] = legSplit(l), sg = p.legSeg(l);
      l.reach = n2 * sg * Math.cos(l.a2) - n1 * sg * Math.cos(l.a1);
      maxReach = Math.max(maxReach, l.reach); stiff += l.Stiff; hy = p.hip(li)[1];
    }
    stiff /= p.nLegs;
    const c0 = w.Floor - hy - p.lift - p.legLift, target = clamp(maxReach - c0, 0, p.Rad * 1.8 * m.Strength);
    if (target > p.legLift) p.legLift += Math.min(target - p.legLift, (0.05 + 0.25 * stiff) * (0.2 + m.Strength)); else p.legLift = Math.max(target, p.legLift - 0.5);
    const clear = c0 + p.legLift;
    let push = 0, n = 0;
    for (const l of p.limbs) {
      if (l.leg < 0) continue;
      const [n1, n2] = legSplit(l), sg = p.legSeg(l), L1 = n1 * sg, L2 = n2 * sg;
      l.a2e = l.a2; const need = clear + L1 * Math.cos(l.a1);
      if (L2 > 0 && L2 * Math.cos(l.a2) > need) { let a = Math.acos(clamp(need / L2, -1, 1)); if (l.a2 < 0 || (l.a2 === 0 && l.side < 0)) a = -a; l.a2e = a; }
      l.fx = L1 * Math.sin(l.a1) + L2 * Math.sin(l.a2e);
      l.wasContact = l.contact; l.contact = p.lift < 0.5 && l.reach >= clear - 0.6;
      if (l.contact && l.wasContact && !flip) { push -= l.fx - l.pfx; n++; }
      l.pfx = l.fx;
    }
    if (n === 0) return 0;
    if (want) { const g = p.legGrowth(); m.Strength = Math.min(g, m.Strength + (0.5 + stiff) / strengthTicks); }
    const drag = 0.25 + 0.75 * clamp(p.legLift / (p.Rad * 0.5 + 1), 0, 1);
    const v = push / n * drag * (0.2 + 0.8 * m.Strength);
    return clamp(v, -0.6, 0.6) * p.Face;
  }
  placeLeg(w, li) {
    const p = this, l = p.limbs[li], [hx, hy] = p.hip(li), [n1, n2] = legSplit(l), n = n1 + n2, sg = p.legSeg(l);
    const s1 = Math.sin(l.a1), c1 = Math.cos(l.a1), s2 = Math.sin(l.a2e), c2 = Math.cos(l.a2e);
    const tx = s1 * p.Face, ty = -c1, sx = s2 * p.Face, sy = c2;
    const kx = hx + tx * n1 * sg, ky = hy + ty * n1 * sg, fx = kx + sx * n2 * sg, fy = ky + sy * n2 * sg;
    const idx = p.limbIdx[li];
    for (let s = 0; s < idx.length; s++) { const i = idx[s]; if (i < 0) continue; let x, y;
      if (s < n1) { const d = (s + 1) * sg; x = hx + tx * d; y = hy + ty * d; }
      else if (s < n) { const d = (s - n1 + 1) * sg; x = kx + sx * d; y = ky + sy * d; }
      else { const d = (s - n + 1) * 0.6; const side = l.side === 0 ? 1 : l.side; x = fx + p.Face * side * d; y = fy; }
      if (y > w.Floor) y = w.Floor; w.X[i] = x; w.Y[i] = y; }
  }
  // membrane.go
  bodyCentre() { const n = this.lobes(); let x = 0, y = 0; for (let i = 0; i < n; i++) { x += this.LX[i]; y += this.LY[i]; } return [x / n, y / n]; }
  envelope(th) {
    const p = this, [cx, cy] = p.bodyCentre(), dx = Math.cos(th), dy = Math.sin(th); let best = 0;
    for (let i = 0; i < p.lobes(); i++) {
      const a = p.LR[i] * p.ax * p.breathScale, b = p.LR[i] * p.ay * p.breathScale, ox = cx - p.LX[i], oy = cy - p.LY[i];
      const A = dx * dx / (a * a) + dy * dy / (b * b), B = 2 * (ox * dx / (a * a) + oy * dy / (b * b)), C = ox * ox / (a * a) + oy * oy / (b * b) - 1;
      const disc = B * B - 4 * A * C; if (disc < 0) continue; const t = (-B + Math.sqrt(disc)) / (2 * A); if (t > best) best = t;
    }
    if (best === 0) best = p.Rad;
    let r = best;
    if (p.G.Lumpy > 0) r *= 1 + p.G.Lumpy * 0.22 * Math.sin(p.G.LumpK * th + p.lumpPh);
    if (p.G.SkinWrinkle > 0) r *= 1 + p.G.SkinWrinkle * 0.06 * Math.sin(13 * th + p.lumpPh * 3);
    return r;
  }
  skinNodes() { return clamp(Math.floor(2 * Math.PI * this.Rad * 1.1 / 1.5), 16, 120); }
  spawnSkin(w, col) {
    const p = this, n = p.skinNodes(); p.skinIdx = new Int32Array(n); const [bx, by] = p.bodyCentre();
    for (let k = 0; k < n; k++) { const th = 2 * Math.PI * k / n, r = p.envelope(th);
      w.addRaw(p.CoreX + bx + Math.cos(th) * r, p.CoreY + by + Math.sin(th) * r, 0, p.ID, 0, RoleSkin, col, 0, 0); w.Seg[w.N - 1] = k; }
  }
  skinPoly(w) {
    const n = this.skinIdx ? this.skinIdx.length : 0; if (n < 3) return null; const xs = new Float32Array(n), ys = new Float32Array(n);
    for (let k = 0; k < n; k++) { const i = this.skinIdx[k]; if (i < 0) return null; xs[k] = w.X[i]; ys[k] = w.Y[i]; }
    return [xs, ys];
  }
  solveSkin(w) {
    const p = this, poly = p.skinPoly(w); if (!poly) return; const [xs, ys] = poly, n = xs.length, g = p.G, [bx, by] = p.bodyCentre(), cx = p.CoreX + bx, cy = p.CoreY + by;
    const tx = new Float32Array(n), ty = new Float32Array(n); let perim = 0;
    for (let k = 0; k < n; k++) { const th = 2 * Math.PI * k / n, r = p.envelope(th); tx[k] = cx + Math.cos(th) * r; ty[k] = cy + Math.sin(th) * r; }
    for (let k = 0; k < n; k++) { const j = (k + 1) % n; perim += hypot(tx[j] - tx[k], ty[j] - ty[k]); }
    const area0 = polyArea(tx, ty), rest = perim / n * lerp(1.0, 1.12, g.SkinStretch), kShape = lerp(0.015, 0.14, g.Soft);
    for (let k = 0; k < n; k++) { xs[k] += (tx[k] - xs[k]) * kShape; ys[k] += (ty[k] - ys[k]) * kShape; }
    const stiff = lerp(0.9, 0.25, g.SkinStretch), bend = lerp(0.02, 0.35, g.SkinBend);
    for (let it = 0; it < 3; it++) {
      for (let k = 0; k < n; k++) { const j = (k + 1) % n, dx = xs[j] - xs[k], dy = ys[j] - ys[k], d = hypot(dx, dy); if (d < 1e-4) continue;
        const c = (d - rest) / d * 0.5 * stiff; xs[k] += dx * c; ys[k] += dy * c; xs[j] -= dx * c; ys[j] -= dy * c; }
      for (let k = 0; k < n; k++) { const a = (k + n - 1) % n, b = (k + 1) % n; xs[k] += ((xs[a] + xs[b]) / 2 - xs[k]) * bend; ys[k] += ((ys[a] + ys[b]) / 2 - ys[k]) * bend; }
      const push = (area0 - polyArea(xs, ys)) / (perim + 1) * 0.6;
      for (let k = 0; k < n; k++) { const a = (k + n - 1) % n, b = (k + 1) % n, nx = ys[b] - ys[a], ny = -(xs[b] - xs[a]), d = hypot(nx, ny);
        if (d > 1e-4) { xs[k] += nx / d * push; ys[k] += ny / d * push; } }
    }
    for (let k = 0; k < n; k++) { const i = p.skinIdx[k]; w.X[i] = xs[k]; w.Y[i] = ys[k]; w.collide(i); xs[k] = w.X[i]; ys[k] = w.Y[i]; }
    const id = p.ID;
    for (let i = 0; i < w.N; i++) {
      if (w.Own[i] !== id || w.Role[i] > RoleNucleus || pointIn(xs, ys, w.X[i], w.Y[i])) continue;
      let bestD = 1e9, qx0 = w.X[i], qy0 = w.Y[i];
      for (let k = 0; k < n; k++) { const j = (k + 1) % n, ex = xs[j] - xs[k], ey = ys[j] - ys[k], l2 = ex * ex + ey * ey;
        const t = l2 > 1e-6 ? clamp(((w.X[i] - xs[k]) * ex + (w.Y[i] - ys[k]) * ey) / l2, 0, 1) : 0, qx = xs[k] + ex * t, qy = ys[k] + ey * t, d = hypot(w.X[i] - qx, w.Y[i] - qy);
        if (d < bestD) { bestD = d; qx0 = qx; qy0 = qy; } }
      const dx = cx - qx0, dy = cy - qy0, d = hypot(dx, dy); if (d > 1e-3) { qx0 += dx / d * 0.6; qy0 += dy / d * 0.6; }
      w.X[i] = qx0; w.Y[i] = qy0;
    }
  }
}
const segs = l => l.Tip ? l.Len + 2 : l.Len;
// ---------------- legs.go / motor.go constants + Motor ----------------
const NO_LEGS = true;   // PORTFOLIO: set false to re-enable legs
const growPeriod = 120 * 50, strengthTicks = 120 * 60 * 20, MaxLegs = 4;
const mIn = 10, mOut = MaxLegs * 2, mParams = mOut * mIn + 1, trialLen = 80, mSigma = 0.3, mAlpha = 0.12;
function legSplit(l) { const n = Math.min(l.grown, l.Len), n1 = Math.min(n, Math.floor((l.Len * 25 + 99) / 100)); return [n1, n - n1]; }
const normal = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
class Motor {
  constructor() { this.W = []; for (let o = 0; o < mOut; o++) { this.W.push([]); for (let i = 0; i < mIn; i++) this.W[o].push(normal() * 0.5); }
    this.Freq = normal() * 0.5; this.Skill = 0; this.Strength = 0; this.Tries = 0; this.eps = new Float32Array(mParams); this.sgn = 0; this.acc = 0; this.rPlus = 0; this.n = 0; this.diffScale = 0; this.initialised = false; }
  getP(k) { return k === mParams - 1 ? this.Freq : this.W[Math.floor(k / mIn)][k % mIn]; }
  setP(k, v) { if (k === mParams - 1) this.Freq = v; else this.W[Math.floor(k / mIn)][k % mIn] = v; }
  start() { for (let k = 0; k < mParams; k++) this.eps[k] = normal(); this.sgn = 1; this.acc = 0; this.n = 0; this.initialised = true; }
  w(o, i) { return this.W[o][i] + this.sgn * mSigma * this.eps[o * mIn + i]; }
  rate() { const f = this.Freq + this.sgn * mSigma * this.eps[mParams - 1]; return 0.04 + 0.2 / (1 + Math.exp(-f)); }
  targets(ph, contact, lift) {
    const x = [Math.sin(ph), Math.cos(ph), Math.sin(2 * ph), Math.cos(2 * ph), contact[0], contact[1], contact[2], contact[3], lift, 1], out = [];
    for (let k = 0; k < MaxLegs; k++) { let h = 0, kn = 0; for (let i = 0; i < mIn; i++) { h += this.w(2 * k, i) * x[i]; kn += this.w(2 * k + 1, i) * x[i]; } out.push([0.6 * Math.tanh(h), 0.55 * Math.tanh(kn)]); }
    return out;
  }
  learn(progress) {
    if (!this.initialised) this.start(); this.acc += progress; this.n++; if (this.n < trialLen) return;
    const R = this.acc / this.n;
    if (this.sgn > 0) { this.rPlus = R; this.sgn = -1; this.acc = 0; this.n = 0; return; }
    const d = this.rPlus - R, ad = Math.abs(d); if (this.diffScale === 0) this.diffScale = ad + 1e-3;
    this.diffScale = this.diffScale * 0.95 + ad * 0.05;
    const step = mAlpha * mSigma * clamp(d / (this.diffScale + 1e-3), -3, 3);
    for (let k = 0; k < mParams; k++) this.setP(k, clamp(this.getP(k) + step * this.eps[k], -4, 4));
    this.Skill = this.Skill * 0.92 + (this.rPlus + R) / 2 * 0.08; this.Tries++; this.start();
  }
  toJSON() { return { W: this.W, Freq: this.Freq, Skill: this.Skill, Strength: this.Strength, Tries: this.Tries }; }
}
function NewMotor() { return new Motor(); }

function pickWeighted(ws) { let t = 0; for (const v of ws) t += v; let x = rnd() * t; for (let i = 0; i < ws.length; i++) { if (x < ws[i]) return i; x -= ws[i]; } return ws.length - 1; }
function polyArea(xs, ys) { let a = 0; const n = xs.length; for (let k = 0; k < n; k++) { const j = (k + 1) % n; a += xs[k] * ys[j] - xs[j] * ys[k]; } return a / 2; }
function pointIn(xs, ys, x, y) { let inn = false; const n = xs.length; for (let k = 0, j = n - 1; k < n; j = k, k++) if ((ys[k] > y) !== (ys[j] > y) && x < (xs[j] - xs[k]) * (y - ys[k]) / (ys[j] - ys[k]) + xs[k]) inn = !inn; return inn; }

// ---------------- render.go ----------------
const thresh = 0.55, eyeDark = [20, 20, 24], eyeWhite = [236, 238, 240], eyeRing = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const q8 = v => u8(Math.round(v / 10) * 10);
const youngCol = (p, c) => { const k = (p.young || 0) * 0.8, m = hsv(p.G.Hue, 0.18, 0.97); return [c[0] + (m[0] - c[0]) * k, c[1] + (m[1] - c[1]) * k, c[2] + (m[2] - c[2]) * k]; };   // PINOCH: newborn = clear bead tinted his colour
const seam = (a, b) => a - b > 0.45 || b - a > 0.45;
class Renderer {
  constructor(w, h) { this.W = w; this.H = h; const n = w * h, f = () => new Float32Array(n);
    this.den = f(); this.ar = f(); this.ag = f(); this.ab = f(); this.aa = f(); this.rim = f(); this.sh = f(); this.lb = f(); this.skin = new Uint8Array(n); this.Alpha = new Uint8Array(n); }
  Render(w, dst, bg) {
    const r = this, W = r.W, H = r.H, den = r.den, ar = r.ar, ag = r.ag, ab = r.ab, aa = r.aa, rim = r.rim, lb = r.lb, sh = r.sh;
    den.fill(0); ar.fill(0); ag.fill(0); ab.fill(0); aa.fill(0); rim.fill(0); sh.fill(0); lb.fill(0);
    for (let i = 0; i < w.N; i++) {
      let alpha = 0.93, rm = 0.55, lobe = 0; const o = w.Own[i];
      let cr = w.CR[i], cg = w.CG[i], cb = w.CB[i];
      if (o !== 0) { const pl = w.Plips[o - 1], g = pl.G; alpha = g.Alpha; rm = g.Rim; if (w.Role[i] === RoleBody) lobe = w.Lobe[i];
        const yg = pl.young || 0; if (yg > 0) { alpha = Math.max(alpha, 0.9) * (1 - 0.15 * yg); [cr, cg, cb] = youngCol(pl, [cr, cg, cb]); } }   // PINOCH: babies are pale + see-through
      const x = w.X[i], y = w.Y[i], bx = Math.trunc(x), by = Math.trunc(y);
      for (let oy = -1; oy <= 1; oy++) { const py = by + oy; if (py < 0 || py >= H) continue;
        for (let ox = -1; ox <= 1; ox++) { const px = bx + ox; if (px < 0 || px >= W) continue;
          const dx = px + 0.5 - x, dy = py + 0.5 - y, d2 = dx * dx + dy * dy;
          if (d2 < 2.1) { const wt = 1 - d2 / 2.1, k = py * W + px; den[k] += wt; ar[k] += wt * cr; ag[k] += wt * cg; ab[k] += wt * cb; aa[k] += wt * alpha; rim[k] += wt * rm; lb[k] += wt * lobe; } } }
    }
    for (const p of w.Plips) {
      if (p.Mass < 10) continue; const fy = Math.trunc(w.Floor) + 1, k = 0.45 - clamp(p.lift / (p.Rad + 1), 0, 1) * 0.3;
      for (let x = Math.trunc(p.MX - p.Rad * p.ax); x <= Math.trunc(p.MX + p.Rad * p.ax); x++) if (x >= 0 && x < W && fy < H) { sh[fy * W + x] = k; if (fy + 1 < H) sh[(fy + 1) * W + x] = k * 0.5; }
    }
    r.skinMask(w);
    const skin = r.skin, full = o => den[o] > thresh || skin[o] !== 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = y * W + x, pp = o * 4, d = den[o];
      if (d > thresh) {
        const up = y > 0 && full(o - W), dn = y < H - 1 && full(o + W), lf = x > 0 && full(o - 1), rt = x < W - 1 && full(o + 1);
        let s = 0.92 + Math.min(d, 3) * 0.04;
        if (!up) s = 1.28;
        else if (!dn || !lf || !rt) s = 1 - 0.55 * (rim[o] / d);
        else if (y > 1 && !full(o - 2 * W)) s = 1.1;
        else if (seam(lb[o] / d, lb[o + 1] / den[o + 1]) || seam(lb[o] / d, lb[o + W] / den[o + W])) s = 1 - 0.3 * (rim[o] / d);
        const inv = s / d, cr = q8(ar[o] * inv), cg = q8(ag[o] * inv), cb = q8(ab[o] * inv), a = clamp(aa[o] / d, 0, 1);
        dst[pp] = cr * a + bg[pp] * (1 - a); dst[pp + 1] = cg * a + bg[pp + 1] * (1 - a); dst[pp + 2] = cb * a + bg[pp + 2] * (1 - a); dst[pp + 3] = 255;
      } else if (skin[o] !== 0) r.skinFill(w.Plips[skin[o] - 1], dst, bg, pp);
      else { const k = 1 - sh[o]; dst[pp] = bg[pp] * k; dst[pp + 1] = bg[pp + 1] * k; dst[pp + 2] = bg[pp + 2] * k; dst[pp + 3] = 255; }
      r.Alpha[o] = dst[pp + 3];
    }
    for (const p of w.Plips) r.skinEdge(w, p, dst);
    for (const p of w.Plips) r.eyes(p, dst);
  }
  skinMask(w) {
    const r = this; r.skin.fill(0);
    for (const p of w.Plips) { const poly = p.skinPoly(w); if (!poly) continue; const [xs, ys] = poly;
      let x0 = xs[0], y0 = ys[0], x1 = xs[0], y1 = ys[0]; for (let k = 0; k < xs.length; k++) { x0 = Math.min(x0, xs[k]); x1 = Math.max(x1, xs[k]); y0 = Math.min(y0, ys[k]); y1 = Math.max(y1, ys[k]); }
      for (let y = Math.max(0, Math.trunc(y0)); y <= Math.min(r.H - 1, Math.trunc(y1) + 1); y++) for (let x = Math.max(0, Math.trunc(x0)); x <= Math.min(r.W - 1, Math.trunc(x1) + 1); x++)
        if (pointIn(xs, ys, x + 0.5, y + 0.5)) r.skin[y * r.W + x] = p.ID; }
  }
  skinFill(p, dst, bg, pp) {
    const c = youngCol(p, BaseColor(p.G)), a = lerp(0.92, 0.35, p.G.SkinClear) * p.G.Alpha, cr = q8(c[0] * 0.86), cg = q8(c[1] * 0.86), cb = q8(c[2] * 0.88);
    dst[pp] = cr * a + bg[pp] * (1 - a); dst[pp + 1] = cg * a + bg[pp + 1] * (1 - a); dst[pp + 2] = cb * a + bg[pp + 2] * (1 - a); dst[pp + 3] = 255;
  }
  skinEdge(w, p, dst) {
    const poly = p.skinPoly(w); if (!poly) return; const [xs, ys] = poly, c = youngCol(p, BaseColor(p.G)), k0 = lerp(0.5, 1.35, p.G.SkinShade);
    const rimC = [q8(c[0] * k0 + 6), q8(c[1] * k0 + 6), q8(c[2] * k0 + 6)], gloss = [q8(c[0] * 1.3 + 30), q8(c[1] * 1.3 + 30), q8(c[2] * 1.3 + 30)], n = xs.length;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n; let x0 = Math.floor(xs[k]), y0 = Math.floor(ys[k]); const x1 = Math.floor(xs[j]), y1 = Math.floor(ys[j]);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 > x1 ? -1 : 1, sy = y0 > y1 ? -1 : 1; let e = dx + dy;
      for (let guard = 0; guard < 400; guard++) {
        const col = (p.G.SkinShade > 0.45 && ys[k] < p.MY - p.Rad * 0.4 && xs[k] < p.MX) ? gloss : rimC;
        this.set(dst, x0, y0, col); if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
  }
  set(dst, x, y, c) { if (x < 0 || y < 0 || x >= this.W || y >= this.H) return; const o = y * this.W + x, p = o * 4; dst[p] = c[0]; dst[p + 1] = c[1]; dst[p + 2] = c[2]; dst[p + 3] = 255; this.Alpha[o] = 255; }
  eyes(p, dst) {
    const g = p.G; if (g.Eyes === 0 || p.Mass < 12) return;
    const hr = p.LR[0], cx = p.HeadX + p.Face * hr * 0.25 * p.ax, cy = p.HeadY - hr * p.ay * g.EyeHigh; let s = g.EyeSize; if (s < 1) s = 1;
    const gap = Math.max(s + 1, hr * g.EyeGap * 2 * p.ax), asleep = p.Resting; if (p.Blink > 0 && !asleep) return;
    for (let e = 0; e < g.Eyes; e++) {
      const off = (e - (g.Eyes - 1) / 2) * gap, ex = Math.round(cx + off - (s - 1) / 2); let ey = Math.round(cy); if (g.Eyes === 3 && e === 1) ey -= s;
      if (p.grab || p.dizzy > 0) {   // PINOCH: wide white eyes with pupils spinning, like the old Pinoch when picked up
        const k = eyeRing[(Math.floor(p.Age / 4) + e * 3) % 8];
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) this.set(dst, ex + xx, ey + yy, eyeWhite);
        this.set(dst, ex + k[0], ey + k[1], eyeDark); }
      else if (asleep || p.Flinch > 0) { this.set(dst, ex, ey + s - 1, eyeDark); this.set(dst, ex + 1, ey + s - 1, eyeDark); }
      else if (p.Happy > 0) { for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) this.set(dst, ex + xx, ey + yy - 1, eyeDark); }
      else for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) this.set(dst, ex + xx, ey + yy, eyeDark);
    }
  }
}

// ---------------- room.go (Go math/rand grain replaced by a seeded PRNG) ----------------
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function RoomBackground() {
  const W = RoomW, H = RoomH, F = RoomFloor, buf = new Uint8ClampedArray(W * H * 4), rng = mulberry(7), ri = n => Math.floor(rng() * n);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = (y * W + x) * 4; buf[p] = u8(c[0]); buf[p + 1] = u8(c[1]); buf[p + 2] = u8(c[2]); buf[p + 3] = 255; };
  const rect = (x0, y0, x1, y1, c, grain) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const n = (rng() - 0.5) * grain; set(x, y, [c[0] + n, c[1] + n, c[2] + n]); } };
  for (let y = 0; y < F - 8; y++) for (let x = 0; x < W; x++) {
    let c = [66, 72, 70]; if (Math.floor(x / 6) % 2 === 0) c = [62, 68, 66];
    const vx = (x - W / 2) / (W / 2), vy = (y - 60) / 120, v = 1 - 0.28 * (vx * vx + vy * vy), n = (rng() - 0.5) * 5;
    set(x, y, [c[0] * v + n, c[1] * v + n, c[2] * v + n]);
  }
  const wx0 = 124, wy0 = 26, wx1 = 196, wy1 = 86;
  rect(wx0 - 3, wy0 - 3, wx1 + 3, wy1 + 4, [92, 80, 66], 8);
  for (let y = wy0; y < wy1; y++) { const t = (y - wy0) / (wy1 - wy0); for (let x = wx0; x < wx1; x++) set(x, y, [18 + t * 16, 24 + t * 20, 40 + t * 22]); }
  for (let i = 0; i < 14; i++) set(wx0 + 2 + ri(wx1 - wx0 - 4), wy0 + 2 + ri(30), [170, 176, 190]);
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 14 && (x + 2) * (x + 2) + (y - 1) * (y - 1) > 10) set(wx0 + 16 + x, wy0 + 14 + y, [214, 210, 186]);
  rect((wx0 + wx1) / 2 - 1, wy0, (wx0 + wx1) / 2 + 1, wy1, [92, 80, 66], 6);
  rect(wx0, (wy0 + wy1) / 2 - 1, wx1, (wy0 + wy1) / 2 + 1, [92, 80, 66], 6);
  rect(wx0 - 5, wy1 + 3, wx1 + 5, wy1 + 6, [104, 92, 76], 6);
  for (let y = wy1 + 6; y < F; y++) for (let x = wx0 - 30; x < wx1 + 30; x++) {
    if (x < 0 || x >= W) continue; const p = (y * W + x) * 4, dx = (x - (wx0 + wx1) / 2) / 60;
    const k = 0.06 * Math.max(0, 1 - dx * dx) * (1 - (y - wy1) / (F - wy1)); for (let c = 0; c < 3; c++) buf[p + c] = u8(buf[p + c] * (1 + k));
  }
  const sh = RoomPlatforms[0];
  rect(sh.X0, sh.Y + 1, sh.X1, sh.Y + 4, [110, 86, 62], 12); rect(sh.X0 + 6, sh.Y + 4, sh.X0 + 8, sh.Y + 10, [58, 58, 60], 4); rect(sh.X1 - 8, sh.Y + 4, sh.X1 - 6, sh.Y + 10, [58, 58, 60], 4);
  const tb = RoomPlatforms[1];
  rect(tb.X0, tb.Y + 1, tb.X1, tb.Y + 5, [104, 76, 54], 12); rect(tb.X0, tb.Y + 5, tb.X1, tb.Y + 6, [72, 52, 38], 6);
  rect(tb.X0 + 4, tb.Y + 6, tb.X0 + 7, F + 1, [88, 64, 46], 10); rect(tb.X1 - 7, tb.Y + 6, tb.X1 - 4, F + 1, [88, 64, 46], 10);
  rect(0, F - 8, W, F + 1, [150, 146, 136], 6); rect(0, F - 8, W, F - 7, [176, 172, 162], 4);
  for (let y = F + 1; y < H; y++) { const row = Math.floor((y - F - 1) / 4);
    for (let x = 0; x < W; x++) { let c = row % 2 === 1 ? [86, 65, 47] : [92, 70, 50];
      const n = (rng() - 0.5) * 10 + Math.sin(x * 0.21 + row * 3) * 3;
      if ((y - F - 1) % 4 === 0 || (x + row * 37) % 58 === 0) c = [60, 45, 33];
      set(x, y, [c[0] + n, c[1] + n, c[2] + n]); } }
  return buf;
}
function CellBackground(w, h, floor) {
  const buf = new Uint8ClampedArray(w * h * 4), rng = mulberry(3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = (y * w + x) * 4; let c = [24, 28, 30];
    if (y > floor) { c = [40, 44, 44]; if (y === floor + 1) c = [62, 68, 68]; } else { c[0] += y * 0.06; c[1] += y * 0.07; c[2] += y * 0.07; }
    const n = (rng() - 0.5) * 3; buf[p] = u8(c[0] + n); buf[p + 1] = u8(c[1] + n); buf[p + 2] = u8(c[2] + n); buf[p + 3] = 255; }
  return buf;
}
return { NO_LEGS, CellBackground, World, Plip, Renderer, RoomBackground, Colours, NCol, RoomW, RoomH, RoomFloor, RoomPlatforms, RoleBody, RoleLimb, RoleSkin, MinMass, BaseColor, SpotColor,
  DriveNames, ActNames, segs, Motor, LimbLeg, pickWeighted, lerp, clamp, hypot, NewBrain };
})();
