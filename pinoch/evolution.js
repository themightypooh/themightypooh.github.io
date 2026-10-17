// Pinoch viewer: ONE plip (1:1 port of plips' sim in plipsim.js) whose growth follows scratch-gpt training.
// Polls ../progress.json; ?demo=1 fakes a ~2 min run (&at=N jumps N s in). ?selftest=1 exercises every control.
'use strict';
const DEFAULT_GENOME = {"Mass":131,"Layout":2,"Lobes":3,"LobeGap":0.94748276,"LobeTaper":0.6111351,"Aspect":1.2646546,"Soft":0.97212386,"Taut":0.44157615,"Sag":0.20771179,"Pack":0.8651259,"Jiggle":0.66451395,"Lumpy":0.48641902,"LumpK":5,"Breath":0.0785642,"Nucleus":0,"Limbs":[{"Kind":4,"Len":16,"Angle":-0.20783609,"Stiff":0.16039541,"Tip":true,"Mirror":true},{"Kind":2,"Len":3,"Angle":0.27683997,"Stiff":0.49338824,"Tip":true,"Mirror":false}],"GrowRate":1.267839,"Skin":true,"SkinStretch":0.3355068,"SkinBend":0.6139703,"SkinWrinkle":0,"SkinShade":0.6977127,"SkinClear":0.86631703,"Hue":0.31334606,"Sat":0.39333522,"Val":0.7021836,"Speckle":23.17335,"Spots":0,"Hue2":0.4681746,"Rim":0.45518476,"Alpha":0.9622098,"Eyes":2,"EyeSize":1,"EyeGap":0.5168017,"EyeHigh":0.10817746,"Hoppy":0.86675316,"Speed":0.7518758,"LR":0.060487173,"Temp":0.31409666,"Curious":1.3398405,"Taste":[0.5426065,0.66709775,1.030464,0.61990076,1.138438,1.0518901,0.70893407,1.4576473],"Metab":1.2270129,"Instinct":7438878267702560261};
DEFAULT_GENOME.LumpPh = 6.17;  // Go: float64(Instinct%628)/100 (Instinct is int64, too big for JS)
delete DEFAULT_GENOME.Instinct;
const CONFIG = {
  progressUrl: '../progress.json', pollMs: 1500, floorLoss: 0.85, demoSeconds: 120,
  stages: [
    { enter: Infinity, name: 'Droplet',   sub: 'A tiny round droplet. It only jiggles and breathes. Random tokens, no structure.' },
    { enter: 3.2,  name: 'Blob',      sub: 'Gaining mass: more drops of himself. Common tokens & spaces appear.' },
    { enter: 2.6,  name: 'Lobed',     sub: 'His body splits into lobes. Real words begin to show.' },
    { enter: 2.0,  name: 'Sprouting', sub: 'Whiskers and leg buds sprout from his own body drops. Short phrases, broken grammar.' },
    { enter: 1.6,  name: 'Wobbler',   sub: 'A firmer skin; his legs grow in and flail as he wobbles toward things. Sentences form.' },
    { enter: 1.35, name: 'Crawler',   sub: 'Oozes across the floor after drops. Grammar mostly right.' },
    { enter: 1.2,  name: 'Hopper',    sub: 'First little hops. Characters & simple plots.' },
    { enter: 1.05, name: 'Grown',     sub: 'A full plip on his legs: walking, trotting and hopping. Coherent little stories.' },
  ],
};
const Q = new URLSearchParams(location.search), DEMO = Q.get('demo') === '1', DEMO_AT = parseFloat(Q.get('at') || '0'), SELFTEST = !!Q.get('selftest');
if (SELFTEST) addEventListener('error', e => { document.title = 'JSERR ' + e.message + ' @' + e.lineno; });
const $ = id => document.getElementById(id), { lerp, clamp } = PS;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

// ---------------- training progress ----------------
let P = null, waiting = true, stage = 0, prog = 0, eraFlash = 0, sT = 0, sD = -1;
function stageOf(v) { let s = 0; CONFIG.stages.forEach((st, i) => { if (v <= st.enter) s = i; }); return s; }
function stageProgress(v, s) { const st = CONFIG.stages, hi = s === 0 ? 4.6 : st[s].enter, lo = s + 1 < st.length ? st[s + 1].enter : CONFIG.floorLoss; return clamp((hi - v) / (hi - lo), 0, 1); }
const SAMPLES = [
  'q,Ve the ffl.. aT\n tthe tom ofs xk lo r hhe ad. . s', 'the was a the. She the to and he the was. lily the day day the',
  'Once upon a time there was a dog. The dog was. He like to play the big ball and the and.',
  'Once upon a time, there was a little girl named Lily. She liked to the park. One day she saw a bird and she was happy happy.',
  'Once upon a time, there was a little boy named Tim. Tim had a red ball. He played with it every day. One day, the ball went in the tree and Tim was sad.',
  'Once upon a time, there was a cat named Tom. Tom liked to sit in the sun. One day, a little bird came to Tom and said, "Can I sit with you?" Tom said yes.',
  'Lily and Ben went to the beach. They wanted to build a big sandcastle. Ben found a shell and gave it to Lily. "Thank you, Ben!" she said, and they put it on top.',
  'Once upon a time, a little fox lost his way in the forest. He was scared, but a kind owl showed him the path home. The fox learned that asking for help is brave. From that day on, they were best friends.'];
const demoStart = performance.now() - DEMO_AT * 1000, demoHist = [];
function demoVal(f) { const th = [4.6, ...CONFIG.stages.slice(1).map(s => s.enter), 0.85], x = f * (th.length - 1), i = Math.min(th.length - 2, Math.floor(x)); return lerp(th[i], th[i + 1], x - i) + (f < 0.02 ? (1 - f / 0.02) * 5 : 0); }
function demoTick() {
  const f = clamp((performance.now() - demoStart) / 1000 / CONFIG.demoSeconds, 0, 1), val = demoVal(f) + gauss() * 0.02;
  const max = 20000, step = Math.round(f * max), loss = val - 0.04 - 0.08 * f + gauss() * 0.04;
  for (let s = demoHist.length ? demoHist[demoHist.length - 1][0] + 100 : 0; s <= step; s += 100) demoHist.push([s, +(demoVal(s / max) - 0.04 - 0.08 * s / max + gauss() * 0.04).toFixed(3)]);
  return { step, max_steps: max, loss, val_loss: val, tokens_seen: step * 32 * 256, history: demoHist, sample: SAMPLES[stageOf(val)] };
}
async function poll() {
  if (DEMO) { P = demoTick(); waiting = false; return onData(); }
  try { const r = await fetch(CONFIG.progressUrl + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw 0; P = await r.json(); waiting = !(P && isFinite(+(P.val_loss ?? P.loss))); }
  catch (e) { waiting = true; }
  onData();
}
function onData() {
  const v = waiting ? 6 : +(P.val_loss ?? P.loss), s = waiting ? 0 : stageOf(v);
  prog = waiting ? 0 : stageProgress(v, s);
  if (s !== stage && sD >= 0) eraFlash = 3;
  stage = s; sT = s + prog; if (sD < 0) { sD = sT; hatch(); }
  panel();
}

// ---------------- Pinoch: fixed genes, growth = which genes are expressed ----------------
let GENES = null;
try { GENES = JSON.parse(localStorage.getItem('pinoch.plipgenome.v2')); } catch (_) {}
if (!GENES || Q.get('resetgenes') === '1') { GENES = JSON.parse(JSON.stringify(DEFAULT_GENOME)); try { localStorage.setItem('pinoch.plipgenome.v2', JSON.stringify(GENES)); } catch (_) {} }
// young: 1 = pale, see-through newborn; the renderer fades it out as he grows
function expressed(s, G0) {   // same genes; fewer particles and no lobes/appendages early on (G0: preview another genome)
  const f = (a, b) => smooth(a, b, s), G = G0 || GENES, e = JSON.parse(JSON.stringify(G));
  const lin = clamp((s - 0.3) / 7.6, 0, 1);   // size grows the whole way, Droplet -> Grown
  e.Mass = Math.round(lerp(Math.sqrt(14), Math.sqrt(Math.max(G.Mass, 90)), lin) ** 2);   // radius grows evenly; Grown is never a runt
  e.Eyes = s < 1 ? 0 : G.Eyes; e.EyeSize = s < 5.5 ? 1 : G.EyeSize;   // born blind; eyes open as a Blob
  e.Skin = G.Skin && s >= 1.2; e.Spots = G.Spots * f(2.4, 3.4);
  if (s < 1.9) { e.Layout = 0; e.Lobes = 1; } else e.LobeGap = lerp(0.25, G.LobeGap, f(1.9, 2.9));
  e.Aspect = lerp(1, G.Aspect, f(0.8, 2.4));
  e.Lumpy = G.Lumpy * f(2.2, 3); e.SkinWrinkle = G.SkinWrinkle * f(2.2, 3);
  const firm = f(3.6, 4.5);
  e.Taut = lerp(Math.min(G.Taut, 0.15), G.Taut, firm); e.Soft = lerp(Math.min(G.Soft, 0.3), G.Soft, firm);
  e.SkinStretch = lerp(Math.max(G.SkinStretch, 0.85), G.SkinStretch, firm); e.Jiggle = lerp(Math.max(G.Jiggle, 0.95), G.Jiggle, firm);
  e.Hoppy = lerp(G.Hoppy * 0.4, G.Hoppy, f(6.4, 7.6));
  const limbK = clamp((s - 3) / 3, 0, 1), legK = f(3.0, 5.4);
  return { limbK, legK, legStrength: f(5.0, 7.4), g: e, young: 1 - Math.pow(lin, 0.7), moveK: 0.15 * f(4, 4.6) + 0.4 * f(5, 5.6) + 0.45 * f(6, 6.6), hopK: s < 4 ? 0 : 0.12 + 0.88 * f(6, 6.8) };
}
const world = new PS.World(PS.RoomW, PS.RoomH, PS.RoomFloor); world.Platforms = PS.RoomPlatforms;
let pin = null;
function hatch() {
  const ex = expressed(sD); pin = new PS.Plip(ex.g, 'Pinoch', true); pin.moveK = ex.moveK; pin.hopK = ex.hopK; pin.young = ex.young;
  try { const b = JSON.parse(localStorage.getItem('pinoch.brain.v2')); if (b && b.W && b.W.length === 6) { pin.Brain.W = b.W; pin.Drives = b.Drives;
    if (b.Motor && pin.Motor) Object.assign(pin.Motor, b.Motor); } } catch (_) {}
  growTargets(ex); pin.limbs.forEach((l, i) => { l.grown = pin.growTo[i]; });
  world.AddPlip(pin, 110, null);
}
function growTargets(ex) { pin.growTo = pin.limbs.map(l => Math.round(PS.segs(l) * (l.leg >= 0 ? ex.legK : ex.limbK))); }
function grow() {   // apply the expressed genome; rebuild the parts whose count changed
  const w = world, p = pin, ex = expressed(sD), oldLobes = p.lobes(); p.G = ex.g; p.moveK = ex.moveK; p.hopK = ex.hopK; p.young = ex.young;
  if (p.G.Skin && !p.skinIdx) p.spawnSkin(w, PS.BaseColor(p.G));   // skin forms after Droplet
  else if (!p.G.Skin && p.skinIdx) { for (let i = 0; i < w.N;) { if (w.Own[i] === p.ID && w.Role[i] === PS.RoleSkin) { w.remove(i); continue; } i++; } p.skinIdx = null; }
  const n = p.lobes();
  if (n !== oldLobes) { const ws = p.lobeWeights(); for (let i = 0; i < w.N; i++) if (w.Own[i] === p.ID && w.Role[i] === PS.RoleBody) w.Lobe[i] = PS.pickWeighted(ws); }
  growTargets(ex);
  if (p.Motor) p.Motor.Strength = Math.max(p.Motor.Strength, Math.min(p.legGrowth(), ex.legStrength));   // PINOCH: training also builds leg strength
  if (p.Mass < ex.g.Mass && w.Tick % 6 === 0) { p.spawnBody(w, PS.BaseColor(p.G), PS.SpotColor(p.G), null); p.Mass++; }
  if (p.Mass > p.MaxMass() + 4) for (let i = 0; i < w.N; i++) if (w.Own[i] === p.ID && w.Role[i] === PS.RoleBody) { w.remove(i); p.Mass--; break; }
  if (p.skinIdx) {   // resample the membrane ring when he has grown a lot
    const want = p.skinNodes(), cur = p.skinIdx.length;
    if (Math.abs(want - cur) / cur > 0.2) { const poly = p.skinPoly(w); if (poly) { const [xs, ys] = poly, col = PS.BaseColor(p.G);
      for (let i = 0; i < w.N;) { if (w.Own[i] === p.ID && w.Role[i] === PS.RoleSkin) { w.remove(i); continue; } i++; }
      p.skinIdx = new Int32Array(want).fill(-1);
      for (let k = 0; k < want; k++) { const t = k / want * cur, a = Math.floor(t) % cur, b = (a + 1) % cur, u = t - Math.floor(t);
        w.addRaw(lerp(xs[a], xs[b], u), lerp(ys[a], ys[b], u), 0, p.ID, 0, PS.RoleSkin, col, 0, 0); w.Seg[w.N - 1] = k; } } }
  }
}

// ---------------- view (main.go view(): fit, half-step scale) ----------------
const cv = $('world'), g = cv.getContext('2d'), off = document.createElement('canvas'); off.width = PS.RoomW; off.height = PS.RoomH;
const og = off.getContext('2d'), img = og.createImageData(PS.RoomW, PS.RoomH), bg = PS.RoomBackground(), rd = new PS.Renderer(PS.RoomW, PS.RoomH);
let S = 1, OX = 0, OY = 0;
function resize() {
  cv.width = innerWidth; cv.height = innerHeight;
  S = Math.min((innerWidth - 24) / PS.RoomW, (innerHeight - 24 - 34) / PS.RoomH); if (S >= 1) S = Math.floor(S * 2) / 2;
  OX = (innerWidth - PS.RoomW * S) / 2; OY = 34 + (innerHeight - 34 - PS.RoomH * S) / 2;
}
addEventListener('resize', resize); resize();

// ---------------- input (roomview.go Room.Update) + PINOCH grab ----------------
let colour = 4;
(function swatches() {
  const bar = $('swatch'); if (!bar) return;
  PS.Colours.forEach((c, i) => { const b = document.createElement('div'); b.className = 'sw' + (i === colour ? ' on' : ''); b.title = c.Name; b.style.background = `rgb(${c.C})`;
    b.onpointerdown = e => { e.stopPropagation(); colour = i; [...bar.children].forEach((x, j) => x.classList.toggle('on', j === i)); }; bar.appendChild(b); });
})();
const M = { x: -1, y: -1, inside: false, left: false, leftJust: false, rightJust: false, leftHeld: 0, leftOnPlip: false, downX: 0, downY: 0, dragged: false, petJust: false };
function roomXY(e) { return [(e.clientX - OX) / S, (e.clientY - OY) / S]; }
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointermove', e => { [M.x, M.y] = roomXY(e); M.inside = M.x >= 0 && M.y >= 0 && M.x < PS.RoomW && M.y < PS.RoomH; });
cv.addEventListener('pointerleave', () => { M.inside = false; });
cv.addEventListener('pointerdown', e => { [M.x, M.y] = roomXY(e); M.inside = M.x >= 0 && M.y >= 0 && M.x < PS.RoomW && M.y < PS.RoomH; cv.setPointerCapture(e.pointerId);
  if (e.button === 0) { M.left = true; M.leftJust = true; M.downX = M.x; M.downY = M.y; } else if (e.button === 2) M.rightJust = true; });
const release = e => { if (!e || e.button === 0) { if (M.left && M.leftOnPlip && !M.dragged) M.petJust = true; M.left = false; if (pin && pin.grab) { pin.grab = false; pin.dizzy = 60; } } };   // a click (no drag) pets
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', () => release());
function roomUpdate() {
  const w = world, sx = M.x, sy = M.y, inside = M.inside;
  w.Hand.X = sx; w.Hand.Y = sy; w.Hand.Visible = inside;
  if (inside) {
    if (M.leftJust) { M.leftHeld = 0; const pl = w.PlipAt(sx, sy);
      M.dragged = false; if (pl) M.leftOnPlip = true; else { M.leftOnPlip = false; if (!w.Full()) w.Drop(sx, sy, colour); } }
    if (M.left && !M.leftOnPlip) { M.leftHeld++; if (M.leftHeld > 9 && !w.Full()) { w.Stream(sx, sy, colour); w.Stream(sx, sy + 0.7, colour); } }
    if (M.rightJust) { const pl = w.PlipAt(sx, sy); if (pl) pl.Poke(w, sx, sy); else if (!w.Full()) w.Splash(sx, sy, colour, 30); }
  }
  if (M.petJust) { M.petJust = false; if (pin) pin.Pet(); }
  // PINOCH: hold left on him and move to pick him up (the old Pinoch's grab): he hangs from where you grabbed him, squirms, and flings when let go
  if (M.left && M.leftOnPlip && pin && (pin.grab || PS.hypot(sx - M.downX, sy - M.downY) > 6 / S)) {
    if (!pin.grab) { pin.grab = true; M.dragged = true; pin.falling = true; pin.startle = 40; pin.Flinch = 12;
      pin.grabOX = (pin.CoreX - sx) * 0.5; pin.grabOY = (pin.CoreY - sy) * 0.5; }
    pin.grabX = clamp(sx, 0, PS.RoomW); pin.grabY = clamp(sy, 0, PS.RoomH); }
  if (!M.left) { M.leftHeld = 0; if (pin && pin.grab) { pin.grab = false; pin.dizzy = 60; } }
  M.leftJust = M.rightJust = false;
  if (pin) { const panelL = $('panel') ? $('panel').getBoundingClientRect().left : innerWidth; pin.maxX = clamp((panelL - OX) / S - 4, 80, PS.RoomW); }
  if (pin) grow();
  w.Step(); w.Step();
  if (DEMO && w.Tick % 720 === 0) w.Splash(20 + Math.random() * ((pin ? pin.maxX : 300) - 40), 30, Math.floor(Math.random() * PS.NCol), 30);   // cmd/shot: food every 6 s
  if (pin && w.Tick % 3600 === 0) try { localStorage.setItem('pinoch.brain.v2', JSON.stringify({ W: pin.Brain.W, Drives: pin.Drives, Motor: pin.Motor })); } catch (_) {}
}
function draw() {
  const buf = img.data; rd.Render(world, buf, bg);
  if (M.inside) { const c = PS.Colours[colour].C, x = Math.floor(M.x), y = Math.floor(M.y), set = (x, y, k) => { if (x < 0 || y < 0 || x >= PS.RoomW || y >= PS.RoomH) return; const o = (y * PS.RoomW + x) * 4; buf[o] = k[0]; buf[o + 1] = k[1]; buf[o + 2] = k[2]; buf[o + 3] = 255; };
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) set(x + dx, y + dy, [20, 20, 22]); set(x, y, c); }
  og.putImageData(img, 0, 0);
  g.fillStyle = '#08090a'; g.fillRect(0, 0, cv.width, cv.height);
  g.imageSmoothingEnabled = false; g.drawImage(off, OX, OY, PS.RoomW * S, PS.RoomH * S);
  cv.style.cursor = !M.inside ? 'default' : pin && pin.grab ? 'grabbing' : pin && world.PlipAt(M.x, M.y) ? 'grab' : 'none';
  if (pin && pin.startle > 0) { g.globalAlpha = clamp(pin.startle / 20, 0, 1); g.fillStyle = '#fff'; g.font = `bold ${Math.round(5 * S)}px monospace`; g.textAlign = 'center';   // startled "!", like the old Pinoch
    g.fillText('!', OX + pin.MX * S, OY + (pin.MY - pin.Rad * 1.6) * S); g.textAlign = 'left'; g.globalAlpha = 1; }
  if (pin) { pop[0].x = OX + pin.HeadX * S; pop[0].y = OY + (pin.MY - pin.Rad * 1.4 - pin.lift * 0) * S + 40; }
  if (eraFlash > 0) { g.globalAlpha = clamp(eraFlash, 0, 1); g.fillStyle = '#fff'; g.font = 'bold 22px monospace'; g.textAlign = 'center';
    g.fillText('PINOCH GREW · ' + CONFIG.stages[stage].name.toUpperCase(), OX + (pin ? pin.maxX : 200) * S / 2, OY + 30); g.textAlign = 'left'; g.globalAlpha = 1; }
}

// ---------------- side panel ----------------
function panel() {
  const st = CONFIG.stages[stage], f = (x, d = 3) => (x == null || !isFinite(+x)) ? '—' : (+x).toFixed(d);
  $('sidx').textContent = waiting ? '' : `${stage}/${CONFIG.stages.length - 1}`;
  $('era').textContent = waiting ? 'Waiting for training' : st.name;
  $('sub').textContent = waiting ? 'A tiny droplet waits for training. Start a run that writes scratch-gpt/progress.json.' : st.sub;
  $('barin').style.width = (waiting ? 0 : prog * 100) + '%';
  $('gen').textContent = pin ? pin.Mass : 0;
  $('vl').textContent = waiting ? '—' : f(P.val_loss ?? P.loss); $('tl').textContent = waiting ? '—' : f(P.loss);
  $('step').textContent = waiting ? '—' : `${P.step ?? '?'}${P.max_steps ? ' / ' + P.max_steps : ''}`;
  const tk = P && P.tokens_seen; $('tok').textContent = waiting || tk == null ? '—' : tk > 1e6 ? (tk / 1e6).toFixed(1) + 'M' : tk > 1e3 ? (tk / 1e3).toFixed(0) + 'k' : tk;
  $('pop').textContent = pin ? (pin.eaten || 0) : 0;
  $('sample').textContent = waiting ? '…' : (P.sample || '').slice(-400);
  const doing = pin ? [pin.Doing(world), pin.nLegs && pin.legGrowth() > 0 ? pin.WalkWords() : ''].filter(Boolean).join(', ') : '';
  $('mode').textContent = (DEMO ? 'DEMO MODE · fake run' : waiting ? 'POLLING ' + CONFIG.progressUrl : 'LIVE · ' + CONFIG.progressUrl) + (doing ? ' · Pinoch: ' + doing : '');
  chart();
}
function chart() {
  const c = $('chart'), x = c.getContext('2d'), w = c.width, h = c.height; x.clearRect(0, 0, w, h);
  const hist = (!waiting && P.history) || []; if (hist.length < 2) { x.fillStyle = 'rgba(255,255,255,.4)'; x.font = '22px monospace'; x.fillText('no history yet', 20, h / 2); return; }
  const lo = 0.8, hi = Math.max(6, ...hist.map(p => p[1]).slice(0, 3)), maxS = P.max_steps || hist[hist.length - 1][0] || 1;
  const Y = v => h - 8 - (Math.log(clamp(v, lo, hi)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * (h - 16), Xs = s => 6 + s / maxS * (w - 12);
  x.setLineDash([6, 6]); x.lineWidth = 1;
  CONFIG.stages.slice(1).forEach((s, i) => { x.strokeStyle = i + 1 === stage ? 'rgba(159,225,203,.7)' : 'rgba(255,255,255,.15)'; x.beginPath(); x.moveTo(0, Y(s.enter)); x.lineTo(w, Y(s.enter)); x.stroke(); });
  x.setLineDash([]); x.strokeStyle = '#ffe04a'; x.lineWidth = 3; x.beginPath(); hist.forEach(([s, v], i) => i ? x.lineTo(Xs(s), Y(v)) : x.moveTo(Xs(s), Y(v))); x.stroke();
  const vl = P.val_loss ?? P.loss; x.fillStyle = '#9fe1cb'; x.beginPath(); x.arc(Xs(P.step || 0), Y(vl), 6, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '18px monospace'; x.fillText(hi.toFixed(1), 8, 22); x.fillText(lo.toFixed(1), 8, h - 12);
}

// ---------------- main loop: TPS 60, two world steps per update (roomview.go) ----------------
var pop = [{ x: 0, y: 0 }];   // talk.js reads pop[0] for the speech bubble
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame); if (SELFTEST) { if (pin) draw(); return; }
  acc += Math.min(0.1, (now - last) / 1000); last = now; eraFlash = Math.max(0, eraFlash - 1 / 60);
  if (pin) { let n = 0; while (acc >= 1 / 60 && n < 4) { sD += (sT - sD) * (1 / 60) * 0.7; roomUpdate(); acc -= 1 / 60; n++; } if (n === 4) acc = 0; draw(); }
}
addEventListener('beforeunload', () => { if (pin) try { localStorage.setItem('pinoch.brain.v2', JSON.stringify({ W: pin.Brain.W, Drives: pin.Drives, Motor: pin.Motor })); } catch (_) {} });
poll(); setInterval(poll, DEMO ? 250 : CONFIG.pollMs);
requestAnimationFrame(frame);
if (SELFTEST) {   // drives every control via the same input path and reports in document.title
  setInterval(() => { if (pin) { sD += (sT - sD) * (1 / 60) * 0.7; roomUpdate(); } }, 1000 / 60);
  const log = [], at = (ms, f) => setTimeout(() => { try { f(); } catch (e) { log.push('ERR ' + e.message); } document.title = 'selftest ' + log.join(' | '); }, ms);
  const click = (x, y, btn) => { M.x = x; M.y = y; M.inside = true; if (btn === 2) M.rightJust = true; else { M.left = true; M.leftJust = true; M.downX = x; M.downY = y; } };
  at(1500, () => { const n = world.N; click(60, 40, 0); roomUpdate(); M.left = false; log.push('tap drop +' + (world.N - n)); });
  at(1700, () => { const n = world.N; click(70, 40, 0); for (let i = 0; i < 20; i++) roomUpdate(); M.left = false; log.push('hold stream +' + (world.N - n)); });
  at(1900, () => { const n = world.N; click(40, 60, 2); roomUpdate(); log.push('splash +' + (world.N - n)); });
  at(2100, () => { click(pin.MX, pin.MY, 0); roomUpdate(); M.left = false; log.push('pet happy=' + pin.Happy); });
  at(2300, () => { const m = pin.Mass; click(pin.MX + 2, pin.MY - 2, 2); roomUpdate(); log.push('poke mass ' + m + '->' + pin.Mass + ' flinch=' + pin.Flinch); });
  at(2600, () => { click(pin.MX, pin.MY, 0); roomUpdate(); M.x += 30; M.y -= 40; log.push('grab from ' + pin.MX.toFixed(0) + ',' + pin.MY.toFixed(0)); });
  at(3600, () => { log.push('carried to ' + pin.MX.toFixed(0) + ',' + pin.MY.toFixed(0) + ' lift=' + pin.lift.toFixed(0)); release({ button: 0 }); M.inside = false; });
  at(5000, () => { log.push('dropped, lift=' + pin.lift.toFixed(1) + ' mass=' + pin.Mass + ' eaten=' + (pin.eaten || 0) + ' doing=' + pin.Doing(world)); });
}
