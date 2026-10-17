// mini desktop: the wavegoo desktop rebuilt for the browser at its real size (1920x1080),
// then scaled to fit. Numbers come straight from the QML in ~/Projects/wavegoo/quickshell:
//   Bar.qml + DotSurface.qml (bar), Launcher.qml (start menu), goonotes/ (notes, cabinet,
//   corkboard), hourglass/shell.qml, and ~/.config/quickshell/visits.
// Widget positions are the ones saved on the real desktop.
// mountMiniDesktop({ w, h }): w x h virtual pixels (default 1920x1080). Widgets saved on the right of the
// real desktop keep their distance from the right edge, so a wider screen (phone.html) just spreads out.
window.mountMiniDesktop = opts => {
  'use strict';
  opts = opts || {};
  const SW = opts.w || 1920, SH = opts.h || 1080, DX = SW - 1920;
  const $ = (s, r = document) => r.querySelector(s);
  const screenEl = $('#md-screen'), frame = $('#md-frame'), info = $('#md-info');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.append(e);
    return e;
  }

  // ---- colours (shell.qml) -------------------------------------------------------
  // "#AARRGGBB" or "#RRGGBB" -> premultiplied [r, g, b, a] 0..1, the way Qt hands colours to shaders
  function qcol(h) {
    h = h.slice(1);
    const a = h.length === 8 ? parseInt(h.slice(0, 2), 16) / 255 : 1, rgb = h.length === 8 ? h.slice(2) : h;
    const n = parseInt(rgb, 16);
    return [(n >> 16 & 255) / 255 * a, (n >> 8 & 255) / 255 * a, (n & 255) / 255 * a, a];
  }
  const C = {
    gooA: qcol('#f07f77dd'), gooB: qcol('#f01d9e75'),
    grainM: qcol('#ffff4fd8'), grainC: qcol('#ff35e6ff'), grainY: qcol('#ffffe04a'),
    fanBacking: qcol('#ee080910'), rim: qcol('#bfdfe4ec')
  };
  const GRAINS = ['#ff4fd8', '#35e6ff', '#ffe04a'];

  // ---- the virtual screen: real pixels, scaled to the frame -----------------------
  let scale = 1;
  screenEl.style.width = SW + 'px'; screenEl.style.height = SH + 'px';
  function fit() {   // contain: letterbox if the frame's shape drifts (phone bars hiding, fullscreen)
    scale = Math.min(frame.clientWidth / SW, frame.clientHeight / SH) || frame.clientWidth / SW;
    const ox = (frame.clientWidth - SW * scale) / 2, oy = (frame.clientHeight - SH * scale) / 2;
    screenEl.style.transform = `translate(${ox}px,${oy}px) scale(${scale})`;
  }
  new ResizeObserver(fit).observe(frame); fit();
  const pointer = { x: -1e4, y: -1e4, in: false };
  function toScreen(e) { const r = screenEl.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; }
  screenEl.addEventListener('pointermove', e => { const p = toScreen(e); pointer.x = p.x; pointer.y = p.y; pointer.in = true; }, true);
  screenEl.addEventListener('pointerleave', () => { pointer.in = false; });
  // clicking or dragging something brings it to the front (kept under the bar at z 50)
  let zTop = 20; const stack = new Set();
  function raise(node) {
    if (+node.style.zIndex === zTop) return;
    node.style.zIndex = ++zTop; stack.add(node);
    if (zTop > 45) { zTop = 20; [...stack].filter(n => n.isConnected).sort((a, b) => a.style.zIndex - b.style.zIndex).forEach(n => { n.style.zIndex = ++zTop; }); }
  }
  // the desktop only takes the scroll wheel once you've clicked into it, so scrolling the page past it still works
  let engaged = false;
  screenEl.addEventListener('pointerdown', () => { engaged = true; }, true);
  document.addEventListener('pointerdown', e => { if (!screenEl.contains(e.target)) engaged = false; }, true);
  let dragging = false;
  // drag a desktop widget from anywhere on it; a press that moves past a few px becomes a drag and eats the click
  function draggable(node, pos, w, h) {
    node.addEventListener('pointerdown', e => {
      raise(node);
      if (e.button !== 0 || e.target.closest('button, input, textarea')) return;
      const p0 = toScreen(e), x0 = pos.x, y0 = pos.y; let moved = false;
      const move = ev => {
        const p = toScreen(ev);
        if (!moved) { if (Math.hypot(p.x - p0.x, p.y - p0.y) < 6) return; moved = true; dragging = true; whyHide(); node.classList.add('dragging'); }
        pos.x = clamp(Math.round(x0 + p.x - p0.x), -w + 80, SW - 80); pos.y = clamp(Math.round(y0 + p.y - p0.y), 0, SH - Math.min(h, 120));
        node.style.left = pos.x + 'px'; node.style.top = pos.y + 'px';
      };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        if (!moved) return;
        dragging = false; node.classList.remove('dragging');
        const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
        node.addEventListener('click', eat, { capture: true, once: true }); setTimeout(() => node.removeEventListener('click', eat, { capture: true }), 0);
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  }

  const blurbs = {
    bar: ['wavegoo', 'The taskbar is a grain simulation: sand rides a wave, the cursor shoves it around and goo blobs rise off it. The orb opens the start menu.'],
    menu: ['start menu', 'The bar\'s liquid rises into a quarter disc. Hover the outer band to switch category, scroll to spin the rings, type to search.'],
    note: ['goonotes', 'Sticky notes in Amiga AGA pixel art (ordered dithering into a 26-colour palette). Drag one by its header onto a cabinet drawer to file it.'],
    cabinet: ['file cabinet', 'One drawer per category. Hover a drawer and it slides out to show its folders; click a folder to take that note back out.'],
    board: ['corkboard', 'Notes pinned in sight. Click a card to bring its note back to the desktop.'],
    hourglass: ['hourglass', 'A sand timer. The sand\'s shape is solved from the time left so the volume stays exact. Click to start or pause, scroll to set the time.'],
    visits: ['visit counter', 'Reads this site\'s real visitor count. On the real desktop it flashes and bursts grains when someone opens the page.'],
    linework: ['Linework', 'My sketching app (Qt 6 + C++). Draw anywhere, then hold still at the end of a stroke and it snaps to a clean line, circle or box. Pick tools from the dial.'],
    drawer: ['pinned apps', 'The drawer grows up out of the dots and shoves them aside.']
  };
  function explain(k) { if (!info) return; const [t, b] = blurbs[k]; info.innerHTML = ''; const s = el('strong', '', info); s.textContent = t; info.append(b); }
  // why I made each thing: a speech bubble that grows off whatever you hover
  const whys = {
    bar: 'Stock Plasma felt dead, so I wrote my own shell from scratch. Now the taskbar is sand riding a wave and I get to shove it around.',
    note: 'I forget everything unless it\'s in my face, and note apps are way too heavy for "buy milk". So: sticky notes, in the Amiga pixel art I love.',
    cabinet: 'Notes I\'m done with but don\'t want to lose. Filing them in a drawer feels like a real desk, not another list.',
    board: 'The stuff I can\'t afford to forget gets pinned where I\'ll actually see it.',
    hourglass: 'I lose track of time when I\'m working, and numbers ticking down never register. Sand draining does.',
    visits: 'Job hunting is quiet. Watching this go up means someone actually looked at my work.',
    linework: 'I can\'t draw for shit, but I need quick sketches for levels and props. Krita\'s overkill and I loved Concepts, so I made my own that cleans up my wobbly lines.'
  };
  const whyEl = el('div', 'wbub', screenEl);
  let whyT = 0, whyNode = null;
  function whyHide() { clearTimeout(whyT); whyEl.classList.remove('open'); whyNode = null; }
  function whyShow(node, k, at) {
    const r = node.getBoundingClientRect(), sr = screenEl.getBoundingClientRect();
    const L = (r.left - sr.left) / scale, T = (r.top - sr.top) / scale, R = (r.right - sr.left) / scale, B = (r.bottom - sr.top) / scale;
    whyEl.textContent = whys[k]; whyEl.className = 'wbub'; const bw = 400, bh = whyEl.offsetHeight || 140;
    let x, y, side;
    if (at) { side = 'down'; x = clamp(at.x - 40, 10, SW - bw - 10); y = T - bh - 22; }
    else if (R + 22 + bw < SW - 10) { side = 'left'; x = R + 22; y = clamp(T + 20, 10, SH - 140 - bh); }
    else if (L - 22 - bw > 10) { side = 'right'; x = L - 22 - bw; y = clamp(T + 20, 10, SH - 140 - bh); }
    else { side = 'up'; x = clamp(L + 40, 10, SW - bw - 10); y = Math.min(B + 22, SH - 140 - bh); }
    whyEl.style.left = x + 'px'; whyEl.style.top = y + 'px';
    whyEl.style.setProperty('--tail', (side === 'down' || side === 'up' ? clamp((at ? at.x : L + 60) - x, 20, bw - 30) : clamp(T + 40 - y, 16, bh - 30)) + 'px');
    whyEl.className = 'wbub open ' + side; whyNode = node;
  }
  function whyOn(node, k, atPointer) {
    node.addEventListener('pointerenter', () => { clearTimeout(whyT); if (whyNode === node || dragging || dragNote) return; whyT = setTimeout(() => { if (!dragging && !dragNote) whyShow(node, k, atPointer && { x: pointer.x }); }, 300); });
    node.addEventListener('pointerleave', () => { clearTimeout(whyT); whyT = setTimeout(whyHide, 150); });
    node.addEventListener('pointerdown', whyHide);
  }
  function blurb(node, k) { node.addEventListener('pointerenter', () => explain(k)); node.addEventListener('focusin', () => explain(k)); if (whys[k]) whyOn(k === 'bar' ? barEl : node, k, k === 'bar'); }
  explain('bar');

  // ---- springs, like Qt's SpringAnimation (spring = stiffness, damping = how fast it settles) ----
  class Spring {
    constructor(v, spring, damping) { this.v = v; this.to = v; this.vel = 0; this.k = spring * 45; this.c = 2 * damping * 0.7 * Math.sqrt(this.k); }
    step(dt) { const a = this.k * (this.to - this.v) - this.c * this.vel; this.vel += a * dt; this.v += this.vel * dt; if (Math.abs(this.to - this.v) < 0.05 && Math.abs(this.vel) < 0.5) { this.v = this.to; this.vel = 0; } return this.v; }
    get busy() { return this.v !== this.to || this.vel !== 0; }
  }

  // ---- icons: simple line glyphs on coloured tiles (stand-ins for the icon theme) ----
  const G = {
    term: 'M4 5h16v14H4z M7 10l3 2-3 2 M12 15h5', folder: 'M3 6h7l2 2h9v11H3z',
    globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
    mail: 'M3 6h18v12H3z M3 7l9 6 9-6', music: 'M9 18V6l11-2v12 M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0z M20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0z',
    play: 'M7 5l12 7-12 7z', brush: 'M14 4l6 6-8 8H6v-6z M4 20l2-2', pencil: 'M5 19l1-5L16 4l4 4-10 10z M14 6l4 4',
    gear: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M12 2v4 M12 18v4 M2 12h4 M18 12h4 M5 5l3 3 M16 16l3 3 M19 5l-3 3 M8 16l-3 3',
    cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
    puppet: 'M4 4h16 M8 4v6 M16 4v6 M12 4v4 M12 9a2 2 0 1 0 0 4a2 2 0 1 0 0-4z M9 20l3-7 3 7 M8 13l4 1 4-1',
    pad: 'M6 8h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5 2l-2-2H9l-2 2a3 3 0 0 1-5-2v-1a4 4 0 0 1 4-4z M7 11v3 M5.5 12.5h3 M16 11h.01 M18 13h.01',
    radio: 'M4 9h16v11H4z M7 9l10-5 M8 13a1.5 1.5 0 1 0 0.01 0 M13 13h4 M13 16h4',
    sonar: 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M7 7a7 7 0 0 0 0 10 M17 7a7 7 0 0 1 0 10 M4 4a11 11 0 0 0 0 16 M20 4a11 11 0 0 1 0 16',
    hourglass: 'M6 2h12 M6 22h12 M7 2v4l10 12v4 M17 2v4L7 18v4', cabinet: 'M5 2h14v20H5z M5 9h14 M5 16h14 M10 5h4 M10 12h4 M10 19h4',
    visits: 'M4 20h16 M7 20v-5 M12 20v-9 M17 20v-13 M5 12l5-4 4 2 6-6',
    note: 'M4 3h16v13l-5 5H4z M7 8h10 M7 12h8', board: 'M2 3h20v17H2z M6 7h5v6H6z M14 10h5v6h-5z',
    chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2', shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
    download: 'M12 3v12 M7 10l5 5 5-5 M4 20h16', calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
    calc: 'M5 2h14v20H5z M8 6h8v4H8z M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01 M16 18h.01',
    image: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15 9a1.5 1.5 0 1 0 .01 0', code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16',
    book: 'M4 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H4z M20 4h-6 M20 4v15h-6', chat: 'M4 4h16v12H8l-4 4z',
    lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4', moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
    logout: 'M10 4H4v16h6 M14 8l4 4-4 4 M8 12h10', reboot: 'M20 12a8 8 0 1 1-3-6.2 M20 4v5h-5', power: 'M12 3v9 M6.3 6.3a8 8 0 1 0 11.4 0',
    bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0', vol: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
    wifi: 'M2 9a15 15 0 0 1 20 0 M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5h.01', bt: 'M7 7l10 10-5 4V3l5 4L7 17',
    rat: 'M4 15c0-4 4-7 9-7 3 0 6 2 7 5l1 2H4z M17 9a2 2 0 1 0 0.01 0 M4 15c-1 2-2 3-2 5'
  };
  const glyph = (k, color = 'currentColor', w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="${G[k]}"/></svg>`;
  function tile(app) {
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    return `<svg viewBox="0 0 48 48"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${app.c[0]}"/><stop offset="1" stop-color="${app.c[1]}"/></linearGradient></defs>` +
      `<rect x="3" y="3" width="42" height="42" rx="11" fill="url(#${id})"/><rect x="3.5" y="3.5" width="41" height="41" rx="10.5" fill="none" stroke="#ffffff40"/>` +
      `<g transform="translate(12 12)"><path d="${G[app.g]}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
  }
  // the start menu's apps (stand-ins; my own tools link to their section of the portfolio)
  // the start menu's only app: my sketching app (the real menu lists every installed app)
  const APPS = [
    { n: 'Linework', d: 'sketching app', g: 'pencil', c: ['#ffd36a', '#c4870c'], cat: 'media' }
  ];
  const appBy = n => APPS.find(a => a.n === n);

  // ---- WebGL helper ---------------------------------------------------------------
  function glProgram(canvas, frag) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, MD_SHADERS.VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return null; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const locs = {};
    const u = n => (n in locs ? locs[n] : (locs[n] = gl.getUniformLocation(prog, n)));
    return {
      gl,
      set(n, v) { const l = u(n); if (l === null) return; if (typeof v === 'number') gl.uniform1f(l, v); else if (v.length === 2) gl.uniform2fv(l, v); else gl.uniform4fv(l, v); },
      tex(n, unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(u(n), unit); },
      draw() { gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    };
  }
  function makeTex(gl, linear) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // =================================================================================
  // THE BAR (Bar.qml, DotSurface.qml)
  // =================================================================================
  const barH = 46, headroom = 84, barTop = headroom, BAR_Y = SH - headroom - barH;   // bar window top on screen
  const barEl = el('div', 'bar', screenEl);
  const barCanvas = el('canvas', '', barEl); barCanvas.width = SW; barCanvas.height = headroom + barH;
  const barGL = glProgram(barCanvas, MD_SHADERS.BAR_FRAG);
  el('div', 'bar-strip', barEl);
  blurb(barEl.querySelector('.bar-strip'), 'bar');

  const dots = {
    time: 0, hov: 0, mouseX: SW / 2, mouseY: headroom + barH, hovered: false,
    cell: 2.6, simCell: 6, flow: 1.8, wave: 1, gooLife: 4.5, gooBlobs: [], gooAcc: 0,
    homeSpring: 110, neighbourSpring: 240, damping: 6.5, pushRadius: 46, pushStrength: 2600, wake: 0.55,
    awake: false, lastPx: 0, lastPy: 0, hadPointer: false, acc: 0
  };
  dots.cols = Math.ceil(SW / dots.simCell); dots.rows = Math.ceil((headroom + barH) / dots.simCell);
  const N = dots.cols * dots.rows;
  const OX = new Float32Array(N), OY = new Float32Array(N), VX = new Float32Array(N), VY = new Float32Array(N);
  const dispData = new Uint8Array(N * 4);
  let dispTex = null;
  if (barGL) { dispTex = makeTex(barGL.gl, true); }
  function waveLift(x) { const t = dots.time; return -dots.wave * (Math.sin(x / 130 + t * 0.6) * 5.5 + Math.sin(x / 61 - t * 0.9) * 2.4); }
  function shock(x, y, strength) {
    const R = 170, S = dots.simCell, cols = dots.cols, rows = dots.rows;
    const c0 = Math.max(0, Math.floor((x - R) / S)), c1 = Math.min(cols - 1, Math.ceil((x + R) / S));
    const r0 = Math.max(0, Math.floor((y - R) / S)), r1 = Math.min(rows - 1, Math.ceil((y + R) / S));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const hx = (c + 0.5) * S - x, hy = (r + 0.5) * S - y, d = Math.hypot(hx, hy) + 0.001;
      if (d > R) continue;
      const f = strength * (1 - d / R), i = r * cols + c;
      VX[i] += hx / d * f; VY[i] += hy / d * f;
    }
    dots.awake = true;
  }
  function physStep(dt, px, py) {
    const C = dots.cols, Rn = dots.rows, S = dots.simCell, kh = dots.homeSpring, kn = dots.neighbourSpring, damp = dots.damping;
    if (dots.hovered) {
      py -= waveLift(px);
      const pvx = dots.hadPointer ? (px - dots.lastPx) / dt : 0, pvy = dots.hadPointer ? (py - dots.lastPy) / dt : 0;
      dots.lastPx = px; dots.lastPy = py; dots.hadPointer = true;
      const R = dots.pushRadius;
      const c0 = Math.max(0, Math.floor((px - R) / S) - 1), c1 = Math.min(C - 1, Math.ceil((px + R) / S) + 1);
      const r0 = Math.max(0, Math.floor((py - R) / S) - 1), r1 = Math.min(Rn - 1, Math.ceil((py + R) / S) + 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * C + c, dx = (c + 0.5) * S + OX[i] - px, dy = (r + 0.5) * S + OY[i] - py, d = Math.hypot(dx, dy) + 0.001;
        if (d > R) continue;
        const fall = 1 - d / R, f = dots.pushStrength * fall * fall * dt;
        VX[i] += dx / d * f + pvx * dots.wake * fall * dt * 6;
        VY[i] += dy / d * f + pvy * dots.wake * fall * dt * 6;
      }
    } else dots.hadPointer = false;
    let energy = 0;
    for (let r = 0; r < Rn; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c;
      const xl = c > 0 ? OX[i - 1] : OX[i], xr = c < C - 1 ? OX[i + 1] : OX[i], xu = r > 0 ? OX[i - C] : OX[i], xd = r < Rn - 1 ? OX[i + C] : OX[i];
      const yl = c > 0 ? OY[i - 1] : OY[i], yr = c < C - 1 ? OY[i + 1] : OY[i], yu = r > 0 ? OY[i - C] : OY[i], yd = r < Rn - 1 ? OY[i + C] : OY[i];
      VX[i] += (-kh * OX[i] + kn * ((xl + xr + xu + xd) * 0.25 - OX[i]) - damp * VX[i]) * dt;
      VY[i] += (-kh * OY[i] + kn * ((yl + yr + yu + yd) * 0.25 - OY[i]) - damp * VY[i]) * dt;
      energy += Math.abs(VX[i]) + Math.abs(VY[i]);
    }
    const m = S * 1.9;
    for (let i = 0; i < N; i++) {
      let x = OX[i] + VX[i] * dt, y = OY[i] + VY[i] * dt;
      if (x > m) { x = m; VX[i] *= -0.3; } else if (x < -m) { x = -m; VX[i] *= -0.3; }
      if (y > m) { y = m; VY[i] *= -0.3; } else if (y < -m) { y = -m; VY[i] *= -0.3; }
      OX[i] = x; OY[i] = y; energy += Math.abs(x) + Math.abs(y);
    }
    if (!dots.hovered && energy / N < 0.004) { OX.fill(0); OY.fill(0); VX.fill(0); VY.fill(0); dots.awake = false; } else dots.awake = true;
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      dispData[j] = clamp(128 + OX[i] * 8, 0, 255); dispData[j + 1] = clamp(128 + OY[i] * 8, 0, 255);
      dispData[j + 2] = Math.min(255, (Math.abs(VX[i]) + Math.abs(VY[i])) * 0.9); dispData[j + 3] = 255;
    }
    dispDirty = true;
  }
  let dispDirty = true;
  for (let j = 0; j < N * 4; j += 4) { dispData[j] = 128; dispData[j + 1] = 128; dispData[j + 3] = 255; }
  function stepGoo(dt, speed, px) {
    let list = dots.gooBlobs.filter(b => dots.time - b.t < dots.gooLife);
    if (dots.hovered) {
      dots.gooAcc += dt * (0.5 + Math.min(speed / 250, 2.5));
      if (dots.gooAcc >= 1) {
        dots.gooAcc = 0;
        list.push({ x: px, t: dots.time, size: 0.75 + 0.25 * Math.random() + Math.min(speed / 900, 0.3), seed: Math.random() * 100 });
        if (list.length > 4) list.shift();
      }
    } else dots.gooAcc = 0.95;
    dots.gooBlobs = list;
  }

  // ---- bar contents ----------------------------------------------------------------
  const floats = [];    // things that ride the wave: { node, x (centre), w, h, y? }
  function floater(node, w, h) { node.classList.add('float'); barEl.append(node); const f = { node, x: 0, w, h, cy: barTop + barH / 2, rideK: 1 }; floats.push(f); return f; }
  const orb = floater(el('button', 'orb'), 34, 34);
  orb.node.setAttribute('aria-label', 'Start menu');
  const clockF = floater(el('div', 'clock'), 0, 22);
  const dateF = floater(el('div', 'date'), 0, 20);
  const notesIcons = [['note', '#ffe04a', 'note'], ['cabinet', '#ff9a3c', 'cabinet'], ['board', '#ff4fd8', 'board'], ['hourglass', '#35e6ff', 'hourglass'], ['visits', '#9fe1cb', 'visits']]
    .map(([g, c, k]) => { const f = floater(el('button', 'sicon', null, glyph(g, c, 2.4)), 22, 22); f.node.setAttribute('aria-label', k); f.key = k; return f; });
  const drawerBtnF = floater(el('button', 'drawer-btn', null, '<div class="grid9">' + '<i></i>'.repeat(9) + '</div>'), 40, 36);
  drawerBtnF.node.setAttribute('aria-label', 'Pinned apps');
  const sepF = floater(el('div', 'sep'), 1, 22);
  // the taskbar's only window: Linework (minimised until clicked)
  const TASKS = [{ app: 'Linework', title: 'Linework' }];
  const taskFs = TASKS.map(t => {
    const f = floater(el('button', 'task', null, `<img src="img/linework/app.svg" alt="" style="width:24px;height:24px;position:relative">`), 46, 36);
    f.task = t; f.rideK = 0.6; f.node.setAttribute('aria-label', t.title);
    f.node.addEventListener('click', () => { lw.toggle(); shock(f.x, barTop + 18, 45); });
    f.node.addEventListener('pointerenter', () => tipOn(f, t.title)); f.node.addEventListener('pointerleave', tipOff);
    return f;
  });
  const trayFs = [['chat', '#a58cff'], ['shield', '#6fe0c4']].map(([g, c]) => floater(el('div', 'sicon', null, glyph(g, c, 2.4)), 18, 18));
  const tempF = floater(el('div', 'temp'), 0, 22); tempF.node.textContent = 'cpu 46°  gpu 52°';
  const statusFs = ['bt', 'wifi', 'vol', 'bell'].map(g => floater(el('div', 'sicon', null, glyph(g, '#fff', 2.4)), 22, 22));
  const vpnF = floater(el('div', 'vpn'), 0, 24); vpnF.node.textContent = '◆ vpn on';
  el('div', 'peek-handle', barEl);
  const tip = el('div', 'tip', barEl); tip.hidden = true;
  let tipTimer = 0;
  function tipOn(f, text) { clearTimeout(tipTimer); tipTimer = setTimeout(() => { tip.textContent = text; tip.style.left = f.x + 'px'; tip.style.top = (barTop - 4) + 'px'; tip.hidden = false; }, 550); }
  function tipOff() { clearTimeout(tipTimer); tip.hidden = true; }

  function layoutBar() {
    const w = f => (f.w = f.node.offsetWidth || f.w);
    [clockF, dateF, tempF, vpnF].forEach(w);
    // left row: x 14, spacing 14
    let x = 14;
    for (const f of [orb, clockF, dateF]) { f.x = x + f.w / 2; x += f.w + 14; }
    const leftEnd = x - 14;
    // centre row: drawer button, separator, tasks (spacing 6, tasks 4 apart)
    const tasksW = taskFs.length * 46 + (taskFs.length - 1) * 4, centreW = 40 + 6 + 1 + 6 + tasksW, cx0 = (SW - centreW) / 2;
    drawerBtnF.x = cx0 + 20; sepF.x = cx0 + 46.5;
    taskFs.forEach((f, i) => { f.x = cx0 + 53 + i * 50 + 23; });
    // notes icons: halfway between the left row and the centre row
    const nw = notesIcons.length * 22 + (notesIcons.length - 1) * 12, nx = Math.round((leftEnd + cx0) / 2 - nw / 2);
    notesIcons.forEach((f, i) => { f.x = nx + i * 34 + 11; });
    // right row: anchored 18 from the right, spacing 12
    let r = SW - 18;
    for (const f of [vpnF, ...statusFs.slice().reverse(), tempF, ...trayFs.slice().reverse()]) { f.x = r - f.w / 2; r -= f.w + 12; }
  }
  // ride the wave, sway, bob and rock (Bar.qml ride / sway / bob / rock / magnify)
  function placeFloats() {
    const t = dots.time;
    for (const f of floats) {
      const x = f.x, k = f.rideK;
      const ride = waveLift(x) * 0.65, sway = Math.sin(t * 1.1 + x / 37 + 0.6) * 1.8 * k, bob = Math.sin(t * 1.3 + x / 53) * 1.6;
      const rock = f === sepF ? 0 : Math.sin(t * 1.1 + x / 37) * 3.5 * k;
      const mag = 1 + 0.3 * Math.exp(-Math.pow((x - dots.mouseX) / 70, 2)) * dots.hov;
      const tx = x - f.w / 2 + sway, ty = f.cy - f.h / 2 + (ride + bob) * k - (f.rise || 0);
      f.node.style.transform = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) rotate(${rock.toFixed(2)}deg) scale(${mag.toFixed(3)})`;
    }
  }
  function tickClock() {
    const n = new Date();
    clockF.node.textContent = n.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
    dateF.node.textContent = n.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '').toLowerCase();
    layoutBar();
  }

  // ---- the pinned-apps drawer: a box that grows up out of the dots ----------------
  const PINS = ['Linework'];
  const drawer = { open: false, w: new Spring(46, 3.4, 0.55), h: new Spring(0, 3.8, 0.55), fullH: 70, autoClose: 0 };
  drawer.fullW = PINS.length * 54 + 22;
  const pinEls = PINS.map(n => { const b = el('button', 'pin-app', barEl, `<img src="img/linework/app.svg" alt="" style="width:30px;height:30px">`); b.setAttribute('aria-label', n); b.addEventListener('click', () => { shock(+b.dataset.x, +b.dataset.y, 55); setDrawer(false); lw.show(true); }); return b; });
  function setDrawer(open) {
    if (drawer.open === open) return;
    drawer.open = open; drawerBtnF.node.classList.toggle('open', open);
    drawer.w.to = open ? drawer.fullW : 46; drawer.h.to = open ? drawer.fullH : 0;
    if (open) { shock(drawerBtnF.x, barTop + 4, 70); explain('drawer'); }
  }
  drawerBtnF.node.addEventListener('click', () => setDrawer(!drawer.open));
  function drawerGeom() {
    const h = drawer.h.v, w = drawer.w.v, cx = drawerBtnF.x;
    return { cx, left: cx - w / 2, right: cx + w / 2, top: barTop - Math.max(0, h), p: clamp(h / drawer.fullH, 0, 1),
      fillet: Math.min(14, Math.max(0, h) * 0.4), corner: Math.min(16, Math.max(0, h) * 0.5, w / 2) };
  }
  function placePins(g) {
    const rowW = PINS.length * 46 + (PINS.length - 1) * 8, x0 = g.cx - rowW / 2, y = g.top + 12;
    pinEls.forEach((b, i) => {
      const show = clamp((g.p - 0.35 - i * 0.06) / 0.35, 0, 1);
      b.style.display = g.p > 0.05 ? '' : 'none';
      b.style.opacity = show; b.style.transform = `translate(${x0 + i * 54}px,${y}px) scale(${0.4 + show * 0.6})`;
      b.dataset.x = x0 + i * 54 + 23; b.dataset.y = y + 23;
    });
  }
  barEl.addEventListener('pointerleave', () => { if (drawer.open) { clearTimeout(drawer.autoClose); drawer.autoClose = setTimeout(() => setDrawer(false), 900); } });
  barEl.addEventListener('pointerenter', () => clearTimeout(drawer.autoClose));

  function barAdvance(dt) {
    dt = Math.min(dt, 0.05);
    dots.time += dt;
    // pointer, in bar coordinates
    const g = drawerGeom();
    const bx = pointer.x, by = pointer.y - BAR_Y;
    const onStrip = pointer.in && by >= barTop - 4 && by <= headroom + barH;
    const onDrawer = pointer.in && g.p > 0.05 && bx >= g.left && bx <= g.right && by >= g.top && by <= barTop;
    dots.hovered = onStrip || onDrawer;
    dots.hov += ((dots.hovered ? 1 : 0) - dots.hov) * Math.min(1, dt * 6);
    const lastX = dots.mouseX;
    if (dots.hovered) { dots.mouseX += (bx - dots.mouseX) * Math.min(1, dt * 12); dots.mouseY += (by - dots.mouseY) * Math.min(1, dt * 12); }
    if (dots.hovered || dots.gooBlobs.length) stepGoo(dt, Math.abs(dots.mouseX - lastX) / dt, bx);
    else dots.gooAcc = 0.95;
    // physics runs while anything is moving
    if (dots.awake || dots.hovered) {
      dots.acc += dt;
      if (dots.hovered || dots.acc >= 1 / 31) { physStep(Math.min(dots.acc, 1 / 25), bx, by); dots.acc = 0; }
    }
    drawer.w.step(dt); drawer.h.step(dt);
  }
  function barDraw() {
    const g = drawerGeom();
    placePins(g); placeFloats();
    if (!barGL) return;
    const s = barGL, gl = s.gl;
    if (dispDirty) { gl.bindTexture(gl.TEXTURE_2D, dispTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, dots.cols, dots.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, dispData); dispDirty = false; }
    s.tex('disp', 0, dispTex);
    s.set('size', [SW, headroom + barH]); s.set('grid', [dots.cols, dots.rows]);
    s.set('box', [g.left, g.top, g.right, barTop + g.corner + 2]);
    s.set('barTop', barTop); s.set('corner', g.corner); s.set('fillet', g.fillet);
    s.set('cell', dots.cell); s.set('simCell', dots.simCell); s.set('time', dots.time); s.set('flow', dots.flow);
    s.set('mouseX', dots.mouseX); s.set('mouseY', dots.mouseY); s.set('hover', dots.hov); s.set('wave', dots.wave);
    s.set('gooLive', dots.gooBlobs.length ? 1 : 0); s.set('gooLife', dots.gooLife);
    for (let i = 0; i < 4; i++) { const b = dots.gooBlobs[i]; s.set('blob' + i, b ? [b.x, b.t, b.size, b.seed] : [0, -1, 0, 0]); }
    s.set('gradA', C.gooA); s.set('gradB', C.gooB); s.set('grainM', C.grainM); s.set('grainC', C.grainC); s.set('grainY', C.grainY);
    s.draw();
  }

  // =================================================================================
  // THE START MENU (Launcher.qml, fan.frag)
  // =================================================================================
  const L = {
    ox: 31, oy: SH - 23, hubR: 150,
    rings: [{ r0: 186, r1: 276, cap: 7, size: 34 }, { r0: 282, r1: 366, cap: 9, size: 34 }, { r0: 372, r1: 456, cap: 12, size: 32 }],
    band: [464, 506], a0: 0.07, a1: Math.PI / 2 + 0.02, ringFloor: 62, ringStart: [0, 7, 16], slots: 28,
    powerSpots: [{ x: 24, h: 92, size: 22 }, { x: 58, h: 70, size: 24 }, { x: 92, h: 98, size: 20 }, { x: 122, h: 66, size: 22 }, { x: 152, h: 94, size: 25 }],
    power: [{ n: 'Lock', d: 'Lock the screen', g: 'lock' }, { n: 'Sleep', d: 'Suspend to RAM', g: 'moon' }, { n: 'Log out', d: 'End this session', g: 'logout', confirm: true },
      { n: 'Restart', d: 'Reboot the computer', g: 'reboot', confirm: true }, { n: 'Shut down', d: 'Power off', g: 'power', confirm: true }],
    open: false, shown: false, reveal: 0, anim: null, cat: 0, query: '', spin: 0, spinS: 0, selRing: -1, selIndex: -1, armed: '',
    hovered: false, pointerA: 0, mouseA: 0, hov: 0, openedAt: 0
  };
  const catNames = ['games', 'internet', 'media', 'dev', 'office', 'system'];
  const cats = [{ name: 'all', apps: APPS.slice().sort((a, b) => a.n.localeCompare(b.n)) }]
    .concat(catNames.map(n => ({ name: n, apps: APPS.filter(a => a.cat === n).sort((a, b) => a.n.localeCompare(b.n)) })).filter(c => c.apps.length));
  const px = (r, a) => L.ox + Math.cos(a) * r, py = (r, a) => L.oy - Math.sin(a) * r;
  const mid = k => (L.rings[k].r0 + L.rings[k].r1) / 2;
  const ringA0 = k => Math.asin(Math.min(1, L.ringFloor / mid(k)));
  const ringA1 = k => { const n = 2 * L.rings[k].cap; return (Math.PI / 2 - ringA0(k) / n) / (1 - 1 / n); };
  const slotAngle = (k, i) => ringA1(k) - (i + 0.5) / L.rings[k].cap * (ringA1(k) - ringA0(k));
  const slotSpan = k => (ringA1(k) - ringA0(k)) / L.rings[k].cap;
  const level = () => -30 + (L.band[1] + 106) * Math.min(1, L.reveal * 1.15);
  const growR = () => { const x = L.reveal - 1, c1 = 2.2; return 30 + (L.band[1] + 16 - 30) * (1 + (c1 + 1) * x * x * x + c1 * x * x); };
  function riseVis(h, r) { const lv = level(), byLevel = (lv - h + 6) / 40, byGrow = r === undefined ? 1 : (growR() - r + 6) / 40; return clamp(Math.min(byLevel, byGrow), 0, 1); }
  const bobV = v => (1 - v) * 22 - Math.sin(v * Math.PI) * 8;
  const popScale = v => 0.45 + 0.55 * v + Math.sin(v * Math.PI) * 0.35;

  const menuEl = el('div', 'launcher', screenEl);
  const boxW = L.ox + L.band[1] + 16 + 220, boxH = L.band[1] + 16 + 220 + (SH - L.oy);
  const fanCanvas = el('canvas', '', menuEl); fanCanvas.width = boxW; fanCanvas.height = boxH; fanCanvas.style.top = (SH - boxH) + 'px';
  const fanGL = glProgram(fanCanvas, MD_SHADERS.FAN_FRAG);
  let wallTex = null, hasWall = 0;
  if (fanGL) {
    wallTex = makeTex(fanGL.gl, true);
    fanGL.gl.texImage2D(fanGL.gl.TEXTURE_2D, 0, fanGL.gl.RGBA, 1, 1, 0, fanGL.gl.RGBA, fanGL.gl.UNSIGNED_BYTE, new Uint8Array([45, 50, 61, 255]));
    const img = new Image();
    img.onload = () => { const gl = fanGL.gl; gl.bindTexture(gl.TEXTURE_2D, wallTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); hasWall = 1; };
    img.src = 'img/wallpaper-insert-coin.webp?v=3';
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  const bands = document.createElementNS(SVGNS, 'svg'); bands.setAttribute('class', 'bands'); bands.setAttribute('viewBox', `0 0 ${SW} ${SH}`); menuEl.append(bands);
  const mkPath = (fill, stroke, sw) => { const p = document.createElementNS(SVGNS, 'path'); p.setAttribute('fill', fill); if (stroke) { p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', sw); p.setAttribute('stroke-linecap', 'round'); } bands.append(p); return p; };
  const catSlice = mkPath('#ffffff1f'), catArc = mkPath('none', '#c9c2ff', 3), selSlice = mkPath('#ffffff1a'), selArc = mkPath('none', '#c9c2ff', 2);
  function slicePath(r0, r1, b0, b1) {
    return `M${px(r1, b0)} ${py(r1, b0)} A${r1} ${r1} 0 0 0 ${px(r1, b1)} ${py(r1, b1)} L${px(r0, b1)} ${py(r0, b1)} A${r0} ${r0} 0 0 1 ${px(r0, b0)} ${py(r0, b0)} Z`;
  }
  const arcPath = (r, b0, b1) => `M${px(r, b0)} ${py(r, b0)} A${r} ${r} 0 0 0 ${px(r, b1)} ${py(r, b1)}`;
  // category names along the band, one letter at a time
  const measure = document.createElement('canvas').getContext('2d');
  const catLetters = [];
  function buildCatText() {
    catLetters.forEach(o => o.node.remove()); catLetters.length = 0;
    measure.font = '14px Roundsquare';
    const segW = (L.a1 - L.a0) / cats.length, r = (L.band[0] + L.band[1]) / 2;
    cats.forEach((c, j) => {
      const at = L.a1 - (j + 0.5) * segW, text = c.name.toUpperCase(), cen = []; let x = 0;
      for (const ch of text) { const w = measure.measureText(ch).width; cen.push(x + w / 2); x += w + 1.2; }
      const total = x - 1.2;
      [...text].forEach((ch, i) => {
        const a = at + (total / 2 - cen[i]) / r, n = el('div', 'lt', menuEl); n.textContent = ch; n.style.fontSize = '14px';
        catLetters.push({ node: n, a, r, j });
      });
    });
  }
  const segB = j => { const segW = (L.a1 - L.a0) / cats.length; return [L.a1 - (j + 1) * segW, L.a1 - j * segW]; };
  // ring icons and power icons
  const ringEls = [];
  const powerEls = L.power.map((p, i) => { const b = el('div', 'power-app', menuEl, glyph(p.g, '#fff', 2)); const s = L.powerSpots[i]; b.style.width = b.style.height = s.size + 'px'; return b; });
  const hub = el('div', 'hub', menuEl); hub.style.left = (L.ox + 8) + 'px'; hub.style.top = (L.oy - 170) + 'px';
  function flatList() {
    const q = L.query.trim().toLowerCase();
    if (q) return APPS.map(a => [a.n.toLowerCase().startsWith(q) ? 0 : a.n.toLowerCase().includes(q) ? 2 : a.d.includes(q) ? 3 : 9, a]).filter(x => x[0] < 9).sort((a, b) => a[0] - b[0] || a[1].n.localeCompare(b[1].n)).map(x => x[1]);
    return cats[L.cat].apps;
  }
  let flat = [];
  const spins = () => !L.query && flat.length > 1;
  const wrapI = (i, n) => ((i % n) + n) % n;
  function ringData() {
    const n = flat.length, rot = [];
    for (let i = 0; i < Math.min(n, L.slots); i++) rot.push(flat[spins() ? wrapI(L.spin + i, n) : i]);
    return [rot.slice(0, 7), rot.slice(7, 16), rot.slice(16, 28), L.power];
  }
  function rebuildRings() {
    ringEls.forEach(r => r.node.remove()); ringEls.length = 0;
    flat = flatList();
    flat.forEach((app, i) => { const n = el('div', 'ring-app', menuEl, app.n === 'Linework' ? '<img src="img/linework/app.svg" alt="" style="width:100%;height:100%">' : tile(app)); ringEls.push({ node: n, app, index: i, born: performance.now() + 12 + Math.min(i, 28) * 16 }); });
  }
  const selItem = () => { if (L.selRing < 0) return null; const d = ringData()[L.selRing]; return d ? d[L.selIndex] || null : null; };
  function select(k, i) { const d = ringData(); if (k < 0 || !d[k] || i < 0 || i >= d[k].length) { L.selRing = L.selIndex = -1; return; } if (L.selRing !== k || L.selIndex !== i) L.armed = ''; L.selRing = k; L.selIndex = i; }
  function setCategory(i) { i = clamp(i, 0, cats.length - 1); if (i === L.cat) return; L.cat = i; L.spin = 0; L.spinS = 0; L.armed = ''; select(-1, -1); rebuildRings(); }
  function updateHub() {
    const it = selItem();
    let html;
    if (it) html = `<div class="lt scan" style="font-size:14px">${it.n}</div><div class="lt" style="font-size:12px;color:#c8ffffff">${it.d}</div><div class="lt" style="font-size:12px;color:${L.armed ? '#f09595' : '#aaffffff'}">${L.armed ? 'press again' : '↵ open'}</div>`;
    else {
      const res = L.query ? (flat.length ? flat.length + (flat.length === 1 ? ' match' : ' matches') : 'nothing found') : spins() ? flat.length + ' apps · scroll' : 'type to search';
      html = `<div class="lt scan" style="font-size:${L.query ? 15 : 17}px">${L.query ? '⌕ ' + L.query : cats[L.cat].name}</div><div class="lt" style="font-size:12px;color:#c0ffffff">${res}</div>`;
    }
    if (hub.innerHTML !== html) hub.innerHTML = html;
  }
  function activate(it) {
    if (!it) return;
    if (it.g && L.power.includes(it)) {
      if (it.confirm && L.armed !== it.n) { L.armed = it.n; setTimeout(() => { L.armed = ''; }, 3000); return; }
      L.armed = ''; setMenu(false); return;           // a demo: nothing to lock or shut down
    }
    if (it.href) location.href = it.href;
    if (it.n === 'Linework') lw.show(true);
    if (it.n === 'Hourglass') hgToggle();
    if (it.n === 'goonotes') newNote();
    if (it.n === 'File Cabinet') cab.peek();
    setMenu(false);
  }
  function setMenu(open) {
    if (open === L.open) return;
    L.open = open; orb.node.classList.toggle('open', open); menuEl.classList.toggle('open', open);
    const from = L.reveal, t0 = performance.now(), dur = open ? 1350 : 450;
    if (open) { L.shown = true; menuEl.classList.add('shown'); L.query = ''; L.spin = L.spinS = 0; L.armed = ''; select(-1, -1); rebuildRings(); explain('menu'); }
    L.anim = { from, to: open ? 1 : 0, t0, dur: dur * Math.abs((open ? 1 : 0) - from), ease: open ? (x => -(Math.cos(Math.PI * x) - 1) / 2) : (x => x * x) };
    shock(31, barTop + 23 - 6, 30);
  }
  orb.node.addEventListener('click', () => setMenu(!L.open));
  menuEl.addEventListener('pointermove', e => {
    const p = toScreen(e), dx = p.x - L.ox, dy = L.oy - p.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    L.hovered = d <= L.band[1] + 60 && a >= -0.05 && a <= Math.PI / 2 + 0.05;
    if (L.hovered) L.pointerA = a;
    for (let i = 0; i < L.power.length; i++) if (Math.hypot(p.x - L.powerSpots[i].x, p.y - (L.oy - L.powerSpots[i].h)) <= 16) { select(3, i); return; }
    if (a < -0.05 || a > Math.PI / 2 + 0.3) return;
    if (d >= L.band[0] - 2 && d <= L.band[1] + 6) { if (!L.query) setCategory(Math.floor((L.a1 - a) / (L.a1 - L.a0) * cats.length)); return; }
    const data = ringData();
    for (let k = 0; k < 3; k++) {
      const R = L.rings[k];
      if (d >= R.r0 - 3 && d <= R.r1 + 3) { const i = Math.floor((ringA1(k) - a) / (ringA1(k) - ringA0(k)) * R.cap); if (i >= 0 && i < data[k].length) select(k, i); else select(-1, -1); return; }
    }
    if (d < L.hubR) return;
    select(-1, -1);
  });
  menuEl.addEventListener('pointerleave', () => { L.hovered = false; });
  menuEl.addEventListener('click', e => {
    const p = toScreen(e), dx = p.x - L.ox, dy = L.oy - p.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (d < 22 || !(d <= L.band[1] + 32 && a >= -0.1 && a <= Math.PI / 2 + 0.4)) { setMenu(false); return; }   // the orb, or outside
    const it = selItem();
    if (it && (d > L.hubR || L.selRing === 3)) activate(it);
  });
  menuEl.addEventListener('wheel', e => { e.preventDefault(); if (spins()) L.spin += e.deltaY > 0 ? 2 : -2; }, { passive: false });
  document.addEventListener('keydown', e => {
    if (!L.open || !(screenEl.matches(':hover') || screenEl.contains(document.activeElement))) return;
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'Escape') { if (L.query) { L.query = ''; rebuildRings(); select(-1, -1); } else setMenu(false); }
    else if (e.key === 'Enter') { if (!selItem()) select(0, 0); activate(selItem()); }
    else if (e.key === 'Backspace') { L.query = L.query.slice(0, -1); rebuildRings(); if (L.query) select(0, 0); else select(-1, -1); }
    else if (e.key === 'Tab') { e.preventDefault(); if (!L.query) setCategory(wrapI(L.cat + (e.shiftKey ? -1 : 1), cats.length)); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { L.query += e.key; rebuildRings(); select(0, 0); }
    else return;
    e.preventDefault();
  });
  function menuAdvance(dt) {
    if (L.anim) {
      const x = L.anim.dur ? clamp((performance.now() - L.anim.t0) / L.anim.dur, 0, 1) : 1;
      L.reveal = L.anim.from + (L.anim.to - L.anim.from) * L.anim.ease(x);
      if (x >= 1) { L.anim = null; if (!L.open) { L.shown = false; menuEl.classList.remove('shown'); } }
    }
    L.hov += ((L.hovered ? 1 : 0) - L.hov) * Math.min(1, dt * 6);
    if (L.hovered) L.mouseA += (L.pointerA - L.mouseA) * Math.min(1, dt * 12);
    L.spinS += (L.spin - L.spinS) * Math.min(1, dt * 14);
  }
  function menuDraw() {
    if (!L.shown) return;
    const now = performance.now();
    // category band
    const sb = segB(L.cat);
    const bandVis = riseVis(L.band[1] * Math.sin((sb[0] + sb[1]) / 2), L.band[1]);
    catSlice.setAttribute('d', slicePath(L.band[0], L.band[1], sb[0] + 0.004, sb[1] - 0.004)); catSlice.style.opacity = bandVis;
    catArc.setAttribute('d', arcPath(L.band[1] - 1.5, sb[0] + 0.012, sb[1] - 0.012)); catArc.style.opacity = bandVis;
    for (const o of catLetters) {
      const rise = riseVis(o.r * Math.sin(o.a), o.r);
      o.node.style.opacity = rise * (L.query ? 0.25 : 1);
      o.node.style.color = o.j === L.cat ? '#fff' : '#c8ffffff';
      o.node.style.transform = `translate(${px(o.r, o.a)}px,${py(o.r, o.a) + bobV(rise) * 0.7}px) translate(-50%,-50%) rotate(${90 - o.a * 180 / Math.PI}deg)`;
    }
    // selection highlight on a ring
    const it = selItem();
    if (it && L.selRing < 3) {
      const k = L.selRing, c = slotAngle(k, L.selIndex), h = slotSpan(k) / 2;
      selSlice.setAttribute('d', slicePath(L.rings[k].r0 + 3, L.rings[k].r1 - 3, c - h + 0.006, c + h - 0.006));
      selArc.setAttribute('d', arcPath(L.rings[k].r1 - 3, c - h + 0.02, c + h - 0.02));
      selSlice.style.display = selArc.style.display = '';
    } else selSlice.style.display = selArc.style.display = 'none';
    // ring icons
    const n = flat.length;
    for (const o of ringEls) {
      let g = o.index;
      if (spins()) { const x = wrapI(o.index - L.spinS, n); g = x > n - 0.5 ? x - n : x; }
      const k = g < 6.5 ? 0 : g < 15.5 ? 1 : 2, u = g - L.ringStart[k], at = Math.round(u);
      const edge = clamp(2 * Math.min(u + 0.5, L.rings[k].cap - 0.5 - u, n - 0.5 - g), 0, 1);
      if (edge <= 0) { o.node.style.display = 'none'; continue; }
      o.node.style.display = '';
      const sel = L.selRing === k && L.selIndex === at && edge > 0.5, near = L.selRing === k && Math.abs(L.selIndex - at) === 1;
      const a = slotAngle(k, u), r = mid(k), jitter = (Math.abs(Math.sin(o.index * 12.9898) * 43758.5453) % 1) * 36;
      const rv = riseVis(r * Math.sin(a) + jitter, r + jitter), pop = clamp((now - o.born) / 220, 0, 1), popE = 1 - Math.pow(1 - pop, 3);
      const size = L.rings[k].size;
      o.node.style.width = o.node.style.height = size + 'px';
      o.node.style.opacity = rv * popE * edge;
      o.node.style.transform = `translate(${px(r, a) - size / 2}px,${py(r, a) - size / 2 + bobV(rv)}px) scale(${(0.7 + 0.3 * popE) * popScale(rv) * (sel ? 1.32 : near ? 1.1 : 1)})`;
    }
    // power row
    powerEls.forEach((b, i) => {
      const s = L.powerSpots[i], rv = riseVis(s.h, Math.hypot(s.x - L.ox, s.h)), t = dots.time;
      const sel = L.selRing === 3 && L.selIndex === i;
      b.classList.toggle('sel', sel); b.classList.toggle('armed', L.armed === L.power[i].n);
      b.style.opacity = rv;
      b.style.transform = `translate(${s.x - s.size / 2 + Math.sin(t * 0.9 + i * 2.3) * 1.2}px,${L.oy - s.h - s.size / 2 + Math.sin(t * 1.3 + i * 1.7) * 2 + bobV(rv)}px) rotate(${Math.sin(t * 1.1 + i * 1.3) * 4}deg) scale(${popScale(rv) * (sel ? 1.3 : 1)})`;
    });
    hub.style.opacity = riseVis(140, 150);
    updateHub();
    if (!fanGL) return;
    const s = fanGL;
    if (wallTex) s.tex('wall', 0, wallTex);
    s.set('size', [boxW, boxH]); s.set('offset', [0, SH - boxH]); s.set('screen', [SW, SH]); s.set('origin', [L.ox, L.oy]);
    s.set('seams', [L.hubR + 4, (L.rings[0].r1 + L.rings[1].r0) / 2, (L.rings[1].r1 + L.rings[2].r0) / 2, L.band[0] - 3]);
    s.set('rOut', L.band[1] + 16); s.set('reveal', L.reveal); s.set('level', level()); s.set('growR', growR());
    s.set('time', dots.time); s.set('cell', 2.6); s.set('flow', 1.8); s.set('wave', 1); s.set('rimWave', 1.4);
    s.set('mouseA', L.mouseA); s.set('hover', L.hov);
    s.set('barTop', SH - 46); s.set('barWinTop', SH - 130); s.set('zoneTop', SH - 60); s.set('hasWall', hasWall);
    s.set('gradA', C.gooA); s.set('gradB', C.gooB); s.set('grainM', C.grainM); s.set('grainC', C.grainC); s.set('grainY', C.grainY); s.set('backing', C.fanBacking);
    s.draw();
  }

  // =================================================================================
  // GOONOTES (Note.qml, Cabinet.qml, Corkboard.qml): Amiga AGA dithering (aga.frag)
  // =================================================================================
  const AGA = ['#141418', '#2a2c31', '#42454b', '#5b5f65', '#757980', '#8f949a', '#aaaeb3', '#c5c8cc', '#dfe1e3', '#f4f5f6',
    '#7a3a00', '#c25e00', '#ff8800', '#ffb85c', '#efeee6', '#d6d4c8',
    '#8a84b8', '#6f9a8a', '#b38a96', '#7aa0a6', '#c4a06c', '#b08474', '#98a67a', '#86a99a', '#a3aec0', '#7d91a6'];
  const PAL = AGA.map(h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; });
  const NOTE_PAL = [{ n: 'dusk', a: '#8a84b8', b: '#6f9a8a' }, { n: 'rose', a: '#b38a96', b: '#7aa0a6' }, { n: 'ochre', a: '#c4a06c', b: '#b08474' },
    { n: 'moss', a: '#98a67a', b: '#86a99a' }, { n: 'mist', a: '#a3aec0', b: '#7d91a6' }];
  const BLACK = '#141418', WHITE = '#f4f5f6', ORANGE = '#ff8800';
  const bayer2 = (x, y) => { x = Math.floor(x); y = Math.floor(y); const v = x / 2 + y * y * 0.75; return v - Math.floor(v); };
  const bayer4 = (x, y) => bayer2(x * 0.5, y * 0.5) * 0.25 + bayer2(x, y);
  // draw(ctx) paints at full size; the result is squashed into 2px chunky pixels and the AGA palette
  function agaPaint(canvas, w, h, draw) {
    const cw = Math.ceil(w / 2), ch = Math.ceil(h / 2);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; canvas.style.width = cw * 2 + 'px'; canvas.style.height = ch * 2 + 'px'; canvas.classList.add('px'); }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cw, ch); ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    draw(ctx);
    const img = ctx.getImageData(0, 0, cw, ch), d = img.data;
    for (let y = 0, i = 0; y < ch; y++) for (let x = 0; x < cw; x++, i += 4) {
      const t = bayer4(x, y) + 1 / 32;
      if (d[i + 3] / 255 < t) { d[i + 3] = 0; continue; }
      const r = d[i], g = d[i + 1], b = d[i + 2];
      let ia = 0, ib = 0, da = 1e9, db = 1e9;
      for (let k = 0; k < PAL.length; k++) {
        const p = PAL[k], dd = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
        if (dd < da) { ib = ia; db = da; ia = k; da = dd; } else if (dd < db) { ib = k; db = dd; }
      }
      const A = PAL[ia], B = PAL[ib], abx = B[0] - A[0], aby = B[1] - A[1], abz = B[2] - A[2];
      const f = clamp(((r - A[0]) * abx + (g - A[1]) * aby + (b - A[2]) * abz) / Math.max(abx * abx + aby * aby + abz * abz, 1e-6), 0, 1);
      const P = f > t ? B : A;
      d[i] = P[0]; d[i + 1] = P[1]; d[i + 2] = P[2]; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  const vgrad = (ctx, y0, y1, stops) => { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  function rectB(ctx, x, y, w, h, fill, border = BLACK, bw = 2) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); if (bw) { ctx.strokeStyle = border; ctx.lineWidth = bw; ctx.strokeRect(x + bw / 2, y + bw / 2, w - bw, h - bw); } }
  function poly(ctx, pts, fill, stroke) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.lineJoin = 'miter'; ctx.stroke(); } }
  function lighter(hex, f) {   // Qt.lighter: scale HSV value
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let v = mx * f, s = mx ? (mx - mn) / mx : 0;
    if (v > 1) { s = Math.max(0, s - (v - 1)); v = 1; }
    const hh = mx === mn ? 0 : mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    const c = v * s, x = c * (1 - Math.abs(hh % 2 - 1)), m = v - c, k = Math.floor(hh);
    const [R, G, B] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k % 6];
    return `rgb(${(R + m) * 255},${(G + m) * 255},${(B + m) * 255})`;
  }
  const pixelFont = (px, bold = true) => `${bold ? 'bold ' : ''}${px}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;

  // ---- notes ------------------------------------------------------------------------
  const notes = [];
  const NBTN = [
    ['colour', 'M3 12a9 9 0 1 1 9 9c-2 0-2-2-1-3s0-3-2-3H6c-2 0-3-1-3-3z M8 9h.01 M12 7h.01 M16 9h.01', 'COLOUR'],
    ['pin', 'M9 3h6 M10 3v6l-3 4h10l-3-4V3 M12 13v8', ''],
    ['board', 'M2 3h20v17H2z M6 7h5v6H6z M14 10h5v6h-5z', 'CORKBOARD'],
    ['drawer', 'M3 4h18v6H3z M5 10v10h14V10 M10 14h4', ''],
    ['new', 'M12 4v16 M4 12h16', ''],
    ['delete', 'M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15', 'DELETE'],
    ['away', 'M5 5l14 14 M19 5L5 19', 'PUT AWAY']
  ];
  function makeNote(o) {
    const n = Object.assign({ x: 120, y: 120, color: 0, cat: '', title: '', text: '', t: 0, pinned: false, armed: false }, o);
    n.x = clamp(Math.round(n.x), 0, SW - 300); n.y = clamp(Math.round(n.y), 0, SH - 280 - 130);
    const root = el('div', 'note', screenEl); n.el = root; raise(root);
    root.addEventListener('pointerdown', () => raise(root), true);
    n.canvas = el('canvas', '', root);
    const head = el('div', 'note-head', root);
    n.chip = el('button', 'chip', head);
    const btns = el('div', 'note-btns', head);
    n.btn = {};
    for (const [k, d, hint] of NBTN) {
      const b = el('button', 'nbtn', btns, `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"><path d="${d}"/></svg>` + (hint ? `<span class="hint">${hint}</span>` : ''));
      b.setAttribute('aria-label', k); n.btn[k] = b;
    }
    n.titleEl = el('input', 'note-title', root); n.titleEl.maxLength = 80; n.titleEl.value = n.title; n.titleEl.setAttribute('aria-label', 'Note title');
    n.bodyEl = el('textarea', 'note-body', root); n.bodyEl.value = n.text; n.bodyEl.setAttribute('aria-label', 'Note text'); n.bodyEl.spellcheck = false;
    n.titleEl.addEventListener('input', () => { n.title = n.titleEl.value; n.titleEl.placeholder = firstLine(n); });
    n.bodyEl.addEventListener('input', () => { n.text = n.bodyEl.value; n.titleEl.placeholder = firstLine(n); });
    n.titleEl.placeholder = firstLine(n);
    n.btn.colour.onclick = () => { n.color = (n.color + 1) % NOTE_PAL.length; paintNote(n); };
    n.btn.pin.onclick = () => { n.pinned = !n.pinned; root.style.zIndex = n.pinned ? 30 : ''; n.btn.pin.style.transform = n.pinned ? '' : 'rotate(45deg)'; };
    n.btn.pin.style.transform = 'rotate(45deg)';
    n.btn.board.onclick = () => pinToBoard(n);
    n.btn.drawer.onclick = () => cab.peek();
    n.btn.new.onclick = () => newNote(n.cat);
    n.btn.delete.onclick = () => { if (n.armed) removeNote(n); else { n.armed = true; n.btn.delete.querySelector('.hint').textContent = 'CLICK AGAIN TO DELETE'; setTimeout(() => { n.armed = false; n.btn.delete.querySelector('.hint').textContent = 'DELETE'; }, 2500); } };
    n.btn.away.onclick = () => putAway(n);
    n.chip.onclick = () => { const cs = ['', ...cab.cats]; n.cat = cs[(cs.indexOf(n.cat) + 1) % cs.length]; paintNote(n); };
    head.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const p0 = toScreen(e), x0 = n.x, y0 = n.y; head.setPointerCapture(e.pointerId); let moved = false;
      const move = ev => { const p = toScreen(ev); if (!moved) { if (Math.hypot(p.x - p0.x, p.y - p0.y) < 6) return; moved = true; dragNote = n; whyHide(); } n.x = clamp(Math.round(x0 + p.x - p0.x), 0, SW - 300); n.y = clamp(Math.round(y0 + p.y - p0.y), 0, SH - 280); dragAt = p; placeNote(n); };
      const up = ev => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up); if (moved) { dragNote = null; noteDropped(n, toScreen(ev)); } };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
    });
    root.addEventListener('pointerenter', () => { n.hover = true; explain('note'); });
    whyOn(root, 'note');
    root.addEventListener('pointerleave', () => { n.hover = false; });
    root.addEventListener('focusin', () => { n.editing = true; paintNote(n); });
    root.addEventListener('focusout', () => { n.editing = false; paintNote(n); });
    placeNote(n); paintNote(n); notes.push(n);
    return n;
  }
  const firstLine = n => (n.text.split('\n').find(l => l.trim()) || 'title').trim();
  const placeNote = n => { n.el.style.left = n.x + 'px'; n.el.style.top = n.y + 'px'; };
  function paintNote(n) {
    const pal = NOTE_PAL[n.color % NOTE_PAL.length], w = 294, h = 274, sh = 6, fold = 18;
    n.chip.textContent = (n.cat || 'unsorted').toUpperCase(); n.chip.classList.toggle('set', !!n.cat);
    n.el.style.setProperty('--tip', pal.a); n.el.style.setProperty('--hl', pal.a);
    n.chip.style.width = ''; const chipW = Math.min(Math.ceil(n.chip.offsetWidth) || 90, 180);   // label + 18, like Note.qml
    agaPaint(n.canvas, 300, 280, ctx => {
      poly(ctx, [sh, sh, w + sh, sh, w + sh, h + sh - fold, w + sh - fold, h + sh, sh, h + sh], 'rgba(0,0,0,.45)');
      poly(ctx, [1, 1, w - 1, 1, w - 1, h - fold, w - fold, h - 1, 1, h - 1], vgrad(ctx, 0, h, [[0, '#f4f3ec'], [1, '#d9d7cb']]), BLACK);
      // the goo band along the bottom
      const band = 34, top = 14, by = h - band - 1, bw = w - 4;
      const wave = x => top + Math.sin(x * 0.035 + n.t * 1.1) * 3 + Math.sin(x * 0.09 - n.t * 0.7) * 1.5;
      ctx.save(); ctx.beginPath(); ctx.moveTo(2, by); ctx.lineTo(2 + bw, by); ctx.lineTo(2 + bw, by + band - fold + 3); ctx.lineTo(2 + bw - fold + 3, by + band); ctx.lineTo(2, by + band); ctx.closePath(); ctx.clip();
      ctx.beginPath(); ctx.moveTo(2, by + band); for (let x = 0; x <= bw; x += 4) ctx.lineTo(2 + x, by + wave(x)); ctx.lineTo(2 + bw, by + band); ctx.closePath();
      ctx.globalAlpha = 0.28; ctx.fillStyle = pal.b; ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, by + wave(0)); for (let x = 4; x <= bw; x += 4) ctx.lineTo(2 + x, by + wave(x));
      ctx.globalAlpha = 0.7; ctx.strokeStyle = pal.b; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
      // header, rules, category chip
      ctx.fillStyle = vgrad(ctx, 2, 34, [[0, lighter(pal.a, 1.35)], [1, pal.a]]); ctx.fillRect(2, 2, w - 4, 32);
      ctx.fillStyle = WHITE; ctx.fillRect(2, 2, w - 4, 2); ctx.fillStyle = BLACK; ctx.fillRect(2, 34, w - 4, 2);
      ctx.fillStyle = '#c5c8cc'; ctx.fillRect(14, 62, w - 28, 2);
      ctx.fillStyle = '#efeee6'; ctx.fillRect(10, 7, chipW, 20);
      ctx.fillStyle = BLACK; ctx.fillRect(10, 7, chipW, 2); ctx.fillRect(10, 7, 2, 20);
      ctx.fillStyle = WHITE; ctx.fillRect(10, 25, chipW, 2); ctx.fillRect(8 + chipW, 7, 2, 20);
      // the folded corner
      const fg = ctx.createLinearGradient(w - fold, h - fold, w, h); fg.addColorStop(0, '#c5c8cc'); fg.addColorStop(1, WHITE);
      poly(ctx, [w - 1, h - fold, w - fold, h - 1, w - fold, h - fold], fg, BLACK);
      if (n.editing) { ctx.strokeStyle = pal.a; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2); }
    });
  }
  function newNote(cat = '') {
    const n = makeNote({ x: 560 + (notes.length % 5) * 36, y: 140 + (notes.length % 5) * 36, color: notes.length % NOTE_PAL.length, cat, text: '' });
    n.bodyEl.focus();
  }
  function removeNote(n) { n.el.remove(); notes.splice(notes.indexOf(n), 1); }
  function putAway(n) { if (n.cat) cab.file(n, cab.cats.indexOf(n.cat)); else removeNote(n); }
  let dragNote = null, dragAt = { x: 0, y: 0 };
  function noteDropped(n, p) {
    const i = cab.drawerAt(p.x, p.y), onBoard = board.open && board.inCork(p.x, p.y);
    const z = e => +getComputedStyle(e).zIndex || 0;
    if (i >= 0 && !(onBoard && z(board.el) > z(cab.el))) { n.cat = cab.cats[i]; cab.file(n, i); return; }
    if (onBoard) pinToBoard(n, p.x - board.x - 60, p.y - board.y - 10);
  }

  // ---- the file cabinet ------------------------------------------------------------
  const cab = (() => {
    const kx = 0.28, ky = 0.72, fw = 180, fh = 300, depth = 90, sideW = Math.round(depth * kx), topH = Math.round(depth * ky);
    const pad = 10, gap = 12, count = 3, dh = Math.round((fh - pad * 2 - gap * (count - 1)) / count);
    const dragOut = 50, crackOut = 10, hoverOut = 120, maxFiles = 6, fileStep = (hoverOut - 16) / (maxFiles - 1), tabH = 14, stagger = 30, shadow = 8;
    const ox = Math.round(hoverOut * kx) + 12, oy = topH + 6, slotW = fw - pad * 2;
    const W = ox + fw + sideW + shadow + 6, H = oy + fh + Math.round(hoverOut * ky) + shadow + 8;
    const c = { x: 1624 + DX, y: 230, cats: ['todo', 'ideas', 's&box'], hoverIdx: -1, thunk: -1, bump: 0, dirty: true };
    c.files = [
      [{ t: 'laundry', c: 4 }, { t: 'fix the bike', c: 1 }, { t: 'reply to emails', c: 0 }],
      [{ t: 'band names', c: 2 }, { t: 'pizza toppings', c: 3 }, { t: 'weekend trip', c: 4 }, { t: 'new hobby', c: 0 }],
      [{ t: 'prop list', c: 1 }, { t: 'level sketch', c: 3 }, { t: 'sound ideas', c: 2 }]
    ];
    const root = el('div', 'cabinet', screenEl); c.el = root; root.style.left = c.x + 'px'; root.style.top = c.y + 'px'; root.style.width = W + 'px'; root.style.height = H + 'px';
    blurb(root, 'cabinet'); draggable(root, c, W, H);
    const canvas = el('canvas', '', root);
    const snap = v => Math.round(v / 2) * 2;
    const slotX = () => ox + pad, slotY = i => oy + pad + i * (dh + gap);
    const frontX = out => slotX() - snap(out * kx), frontY = (i, out) => slotY(i) + snap(out * ky);
    const folderAt = (fx, fy, k) => { const t = 10 + k * fileStep, bx = fx + 6 + snap(t * kx), by = fy - snap(t * ky); return { t, bx, by, w: slotW - 12, tx: bx + (k % 2) * stagger, tw: slotW - 12 - stagger }; };
    const drawers = c.cats.map((_, i) => ({ slide: new Spring(0, 4, 0.45), i }));
    // text: plate label + count per drawer, and a pool of folder-tab labels
    const labels = drawers.map(() => ({ name: el('div', 'cab-text', root), count: el('div', 'cab-text count', root) }));
    const tabPool = [];
    // hit areas follow each drawer front
    const hits = drawers.map((d, i) => {
      const h = el('div', 'cab-hit', root); h.tabIndex = 0; h.setAttribute('role', 'button'); h.setAttribute('aria-label', c.cats[i] + ' drawer');
      h.addEventListener('pointerenter', () => setHover(i)); h.addEventListener('focus', () => setHover(i));
      return h;
    });
    let leaveT = 0;
    let peekT = 0;
    function setHover(i) { clearTimeout(leaveT); clearTimeout(peekT); if (c.hoverIdx !== i) { c.hoverIdx = i; c.dirty = true; } }
    root.addEventListener('pointerleave', () => { leaveT = setTimeout(() => { c.hoverIdx = -1; c.dirty = true; }, 320); });
    root.addEventListener('pointerenter', () => clearTimeout(leaveT));
    // clicking a folder takes that note back out onto the desktop
    root.addEventListener('click', e => {
      const p = toScreen(e), lx = p.x - c.x, ly = p.y - c.y, i = c.hoverIdx;
      if (i < 0) return;
      const d = drawers[i], fx = frontX(d.slide.v), fy = frontY(i, d.slide.v), files = c.files[i];
      for (let k = 0; k < Math.min(files.length, maxFiles); k++) {
        const g = folderAt(fx, fy, k);
        if (lx >= g.bx && lx < g.bx + g.w && ly >= g.by - 22 && ly < g.by - 6) {
          const f = files.splice(k, 1)[0];
          makeNote({ x: c.x - 320, y: c.y + 40 + k * 20, color: f.c, cat: c.cats[i], title: f.t, text: 'filed in ' + c.cats[i] });
          c.dirty = true; return;
        }
      }
    });
    c.drawerAt = (sx, sy) => {
      const x = sx - c.x - ox, y = sy - c.y - oy;
      if (x < -50 || x > fw + sideW + 30 || y < -topH - 10 || y > fh + 30) return -1;
      for (let i = 0; i < count; i++) { const t = pad + i * (dh + gap); if (y >= t - gap / 2 && y <= t + dh + gap / 2) return i; }
      return y < pad ? 0 : count - 1;
    };
    c.file = (n, i) => {
      if (i < 0) { removeNote(n); return; }
      c.files[i].unshift({ t: n.title || firstLine(n), c: n.color }); removeNote(n);
      c.thunk = i; c.bumpT = performance.now(); c.dirty = true;
    };
    c.peek = () => { setHover(0); peekT = setTimeout(() => { c.hoverIdx = -1; c.dirty = true; }, 2200); };
    function want(i) {
      const dragging = !!dragNote, near = dragging && Math.hypot(dragAt.x - (c.x + ox + fw / 2), dragAt.y - (c.y + oy + fh / 2)) < 420;
      const target = dragging ? c.drawerAt(dragAt.x, dragAt.y) : -1;
      if (target === i) return dragOut;
      if (c.hoverIdx === i && !dragging && c.files[i].length) return hoverOut;
      if (near || (c.hoverIdx === i && !dragging)) return crackOut;
      return 0;
    }
    c.step = dt => {
      let busy = c.dirty; c.dirty = false;
      drawers.forEach((d, i) => { d.slide.to = want(i); if (d.slide.busy) { d.slide.step(dt); busy = true; } });
      if (c.thunk >= 0) { const e = (performance.now() - c.bumpT) / 470; c.bump = e < 0.19 ? e / 0.19 : Math.max(0, 1 - (e - 0.19) / 0.81); if (e >= 1) { c.thunk = -1; c.bump = 0; } busy = true; }
      if (busy) paint();
    };
    function paint() {
      const target = dragNote ? c.drawerAt(dragAt.x, dragAt.y) : -1;
      const order = drawers.map((d, i) => ({ d, i, out: Math.max(0, d.slide.v - (c.thunk === i ? c.bump * 8 : 0)) })).sort((a, b) => a.out - b.out);
      let tabN = 0;
      const covers = [], owned = [];   // per painted drawer: area it covers, DOM text it owns
      agaPaint(canvas, W, H, ctx => {
        // body: shadow, side, top, front with its highlights, feet
        poly(ctx, [ox + shadow, oy + fh + shadow, ox + shadow, oy + shadow, ox + sideW + shadow, oy - topH + shadow, ox + fw + sideW + shadow, oy - topH + shadow, ox + fw + sideW + shadow, oy + fh - topH + shadow, ox + fw + shadow, oy + fh + shadow], 'rgba(0,0,0,.5)');
        poly(ctx, [ox + fw, oy, ox + fw + sideW, oy - topH, ox + fw + sideW, oy + fh - topH, ox + fw, oy + fh], vgrad(ctx, oy - topH, oy + fh, [[0, '#8f949a'], [1, '#42454b']]), BLACK);
        poly(ctx, [ox, oy, ox + sideW, oy - topH, ox + fw + sideW, oy - topH, ox + fw, oy], vgrad(ctx, oy - topH, oy, [[0, '#c5c8cc'], [1, '#eceef0']]), BLACK);
        rectB(ctx, ox, oy, fw, fh, vgrad(ctx, oy, oy + fh, [[0, '#b6babe'], [0.7, '#8c9096'], [1, '#5d6166']]));
        ctx.fillStyle = WHITE; ctx.fillRect(ox + 2, oy + 2, fw - 4, 2); ctx.fillRect(ox + 2, oy + 2, 2, fh - 4);
        ctx.fillStyle = BLACK; ctx.fillRect(ox + 2, oy + fh - 4, fw - 4, 2); ctx.fillRect(ox + fw - 4, oy + 2, 2, fh - 4);
        ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(ox + 22, oy + 4, 14, fh - 8);
        ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(ox + 40, oy + 4, 5, fh - 8);
        ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(ox + fw - 30, oy + 4, 10, fh - 8);
        ctx.fillStyle = BLACK; ctx.fillRect(ox + 8, oy + fh, 18, 6); ctx.fillRect(ox + fw - 26, oy + fh, 18, 6);
        for (const { i, out } of order) {
          const sx = slotX(), sy = slotY(i), fx = frontX(out), fy = frontY(i, out), files = c.files[i];
          const showing = c.hoverIdx === i && !dragNote && files.length > 0, hot = target === i, pointed = c.hoverIdx === i;
          ctx.fillStyle = BLACK; ctx.fillRect(sx, sy, slotW, dh);
          if (out > 0.5) {
            poly(ctx, [fx, fy, sx, sy, sx + slotW, sy, fx + slotW, fy], vgrad(ctx, sy, fy, [[0, '#141418'], [1, '#42454b']]), BLACK);
            poly(ctx, [fx + slotW, fy, sx + slotW, sy, sx + slotW, sy + dh, fx + slotW, fy + dh], vgrad(ctx, fy, fy + dh, [[0, '#8f949a'], [1, '#5b5f65']]), BLACK);
          }
          const n = Math.min(files.length, maxFiles), mine = [];
          if (showing || out > 1) for (let idx = 0; idx < n; idx++) {
            const k = n - 1 - idx, g = folderAt(fx, fy, k);
            if (g.t > out - 4) continue;
            rectB(ctx, g.bx, g.by - 10, g.w, 14, '#efeee6');
            const more = files.length - maxFiles + 1;
            rectB(ctx, g.tx, g.by - 22, g.tw, tabH, k === n - 1 && more > 1 ? '#c5c8cc' : NOTE_PAL[files[k].c % 5].a);
            let tl = tabPool[tabN]; if (!tl) tl = tabPool[tabN] = el('div', 'cab-text tab', root);
            tl.style.display = ''; tl.style.left = (g.tx + 5) + 'px'; tl.style.top = (g.by - 22) + 'px'; tl.style.width = (g.tw - 9) + 'px';
            tl.textContent = k === n - 1 && more > 1 ? '+' + more + ' MORE' : files[k].t.toUpperCase(); tl.style.zIndex = 2 + i; mine.push([tl, g.by - 22, tabH]); tabN++;
          }
          rectB(ctx, fx, fy, slotW, dh, vgrad(ctx, fy, fy + dh, [[0, pointed || hot ? '#ccd0d4' : '#adb1b6'], [1, '#6b6f74']]), hot ? ORANGE : BLACK, hot ? 4 : 2);
          ctx.fillStyle = WHITE; ctx.fillRect(fx + 2, fy + 2, slotW - 4, 2); ctx.fillRect(fx + 2, fy + 2, 2, dh - 4);
          ctx.fillStyle = BLACK; ctx.fillRect(fx + 2, fy + dh - 4, slotW - 4, 2); ctx.fillRect(fx + slotW - 4, fy + 2, 2, dh - 4);
          const plW = Math.min(slotW - 28, 120), plX = Math.round(fx + (slotW - plW) / 2), plY = fy + 12;
          ctx.fillStyle = '#e4e3dc'; ctx.fillRect(plX, plY, plW, 24);
          ctx.fillStyle = BLACK; ctx.fillRect(plX, plY, plW, 2); ctx.fillRect(plX, plY, 2, 24);
          ctx.fillStyle = WHITE; ctx.fillRect(plX, plY + 22, plW, 2); ctx.fillRect(plX + plW - 2, plY, 2, 24);
          rectB(ctx, Math.round(fx + slotW / 2 - 20), fy + dh - 18, 40, 8, vgrad(ctx, fy + dh - 18, fy + dh - 10, [[0, WHITE], [1, '#757980']]));
          const lb = labels[i];
          lb.name.style.left = fx + 'px'; lb.name.style.top = (fy + 12) + 'px'; lb.name.style.width = slotW + 'px'; lb.name.style.padding = '0 18px'; lb.name.textContent = c.cats[i].toUpperCase(); lb.name.style.zIndex = 3 + i;
          lb.count.style.left = fx + 'px'; lb.count.style.top = (fy + 42) + 'px'; lb.count.style.width = slotW + 'px'; lb.count.textContent = files.length + ' FILED'; lb.count.style.zIndex = 3 + i;
          mine.push([lb.name, fy + 12, 24], [lb.count, fy + 42, 12]); owned.push(mine);
          covers.push(out > 0.5 ? { x0: fx, x1: sx + slotW, y0: (showing || out > 1) && n ? sy - 24 : sy, y1: fy + dh } : null);
          hits[i].style.left = (fx - pad) + 'px'; hits[i].style.top = (fy - gap / 2) + 'px'; hits[i].style.width = (slotW + pad * 2) + 'px'; hits[i].style.height = (dh + gap) + 'px'; hits[i].style.zIndex = 1;
        }
      });
      for (let k = tabN; k < tabPool.length; k++) tabPool[k].style.display = 'none';
      // the text is DOM over one canvas, so canvas pixels can't hide it: clip each drawer's text
      // against every drawer painted after it (i.e. slid further out, in front of it)
      owned.forEach((list, p) => list.forEach(([node, t, h]) => {
        let top = 0, bot = 0;
        const x0 = parseFloat(node.style.left) || 0, x1 = x0 + (parseFloat(node.style.width) || slotW);
        for (let q = p + 1; q < covers.length; q++) {
          const cv = covers[q]; if (!cv || cv.x1 <= x0 || cv.x0 >= x1 || cv.y1 <= t || cv.y0 >= t + h) continue;
          if (cv.y0 <= t) top = Math.max(top, cv.y1 - t); else bot = Math.max(bot, t + h - cv.y0);
        }
        node.style.visibility = top + bot >= h ? 'hidden' : '';
        node.style.clipPath = top || bot ? `inset(${Math.max(0, top)}px 0 ${Math.max(0, bot)}px 0)` : '';
      }));
    }
    return c;
  })();

  // ---- the corkboard ------------------------------------------------------------------
  const board = (() => {
    const b = { x: 16, y: 400, bw: 440, bh: 400, open: false, cards: [], dirty: true };
    const frame = 10, topF = 26, cw = 120, ch = 80, cork = { x: frame, y: topF, w: 440 - frame * 2, h: 400 - topF - frame };
    const pinCols = ['#ff8800', '#8a84b8', '#6f9a8a', '#c4a06c', '#b38a96', '#a3aec0'];
    const root = el('div', 'board', screenEl); b.el = root; root.style.left = b.x + 'px'; root.style.top = b.y + 'px';
    blurb(root, 'board'); draggable(root, b, b.bw, b.bh);
    const canvas = el('canvas', '', root);
    const plate = el('div', 'board-text', root); plate.style.cssText += 'left:10px;top:5px;width:104px;'; plate.textContent = 'CORKBOARD';
    const xbtn = el('button', 'board-x', root); xbtn.setAttribute('aria-label', 'Close corkboard');
    el('div', 'board-text', root).style.cssText += 'right:8px;top:3px;width:20px;line-height:20px;'; root.lastChild.textContent = 'X';
    const empty = el('div', 'board-text', root); empty.style.cssText += `left:0;right:0;top:${cork.y + cork.h / 2 - 14}px;color:#ffb85c;font-size:11px;white-space:pre;line-height:14px`; empty.textContent = 'DROP A NOTE HERE\nTO KEEP IT IN SIGHT';
    xbtn.onclick = () => b.toggle(false);
    b.toggle = on => { b.open = on === undefined ? !b.open : on; root.classList.toggle('open', b.open); if (b.open) { raise(root); b.dirty = true; explain('board'); } };
    b.inCork = (sx, sy) => { const x = sx - b.x, y = sy - b.y; return x >= cork.x && x <= cork.x + cork.w && y >= cork.y && y <= cork.y + cork.h; };
    const textEls = [];
    b.add = (n, x, y) => {
      if (x === undefined) { const i = b.cards.length, cols = Math.floor((cork.w - 12) / (cw + 10)); x = cork.x + 8 + (i % cols) * (cw + 10); y = cork.y + 14 + Math.floor(i / cols) * (ch + 16); }
      x = Math.round(clamp(x, cork.x + 2, cork.x + cork.w - cw - 2) / 2) * 2; y = Math.round(clamp(y, cork.y + 6, cork.y + cork.h - ch - 4) / 2) * 2;
      b.cards.push({ x, y, title: n.title || firstLine(n), text: n.text, color: n.color, pin: pinCols[b.cards.length % pinCols.length] }); b.dirty = true;
    };
    root.addEventListener('click', e => {
      const p = toScreen(e), lx = p.x - b.x, ly = p.y - b.y;
      for (let i = b.cards.length - 1; i >= 0; i--) {
        const c = b.cards[i];
        if (lx >= c.x && lx < c.x + cw && ly >= c.y && ly < c.y + ch) { b.cards.splice(i, 1); makeNote({ x: b.x + b.bw + 16, y: b.y - 100, color: c.color, title: c.title, text: c.text }); b.dirty = true; return; }
      }
    });
    b.step = () => {
      if (!b.open || !b.dirty) return; b.dirty = false;
      empty.style.display = b.cards.length ? 'none' : '';
      agaPaint(canvas, b.bw + 6, b.bh + 6, ctx => {
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(6, 6, b.bw, b.bh);
        rectB(ctx, 0, 0, b.bw, b.bh, vgrad(ctx, 0, b.bh, [[0, '#9a4c0c'], [1, '#5a2c06']]));
        ctx.fillStyle = '#c25e00'; ctx.fillRect(2, 2, b.bw - 4, 2); ctx.fillRect(2, 2, 2, b.bh - 4);
        rectB(ctx, b.bw - 26, 5, 16, 16, '#e4e3dc'); rectB(ctx, 10, 5, 104, 16, '#e4e3dc');
        ctx.fillStyle = vgrad(ctx, cork.y, cork.y + cork.h, [[0, '#c8661a'], [1, '#a24c06']]); ctx.fillRect(cork.x, cork.y, cork.w, cork.h);
        let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < cork.w * cork.h / 40; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(122,58,0,.55)' : 'rgba(255,184,92,.35)'; ctx.fillRect(cork.x + Math.floor(r() * cork.w / 2) * 2, cork.y + Math.floor(r() * cork.h / 2) * 2, 2, 2); }
        ctx.fillStyle = BLACK; ctx.fillRect(cork.x, cork.y, cork.w, 2); ctx.fillRect(cork.x, cork.y, 2, cork.h);
        ctx.fillStyle = '#c25e00'; for (let i = 0; i < 3; i++) ctx.fillRect(b.bw - 8 - i * 4, b.bh - 8, 2, 4);
        for (const c of b.cards) {
          const pal = NOTE_PAL[c.color % 5];
          ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(c.x + 4, c.y + 4, cw, ch);
          rectB(ctx, c.x, c.y, cw, ch, vgrad(ctx, c.y, c.y + ch, [[0, '#f4f3ec'], [1, '#d9d7cb']]));
          ctx.fillStyle = pal.a; ctx.fillRect(c.x + 2, c.y + 2, cw - 4, 14); ctx.fillStyle = BLACK; ctx.fillRect(c.x + 2, c.y + 16, cw - 4, 2);
          ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(c.x + cw / 2 - 2, c.y + 4, 4, 4);
          rectB(ctx, c.x + cw / 2 - 6, c.y - 6, 12, 12, c.pin);
          ctx.fillStyle = WHITE; ctx.fillRect(c.x + cw / 2 - 4, c.y - 4, 4, 2); ctx.fillRect(c.x + cw / 2 - 4, c.y - 4, 2, 4);
        }
      });
      textEls.forEach(t => t.remove()); textEls.length = 0;
      for (const c of b.cards) {
        const t = el('div', 'bcard-text', root); t.style.cssText += `left:${c.x + 6}px;top:${c.y + 3}px;width:${cw - 12}px;height:12px;white-space:nowrap;text-overflow:ellipsis`; t.textContent = c.title.toUpperCase();
        const d = el('div', 'bcard-text body', root); d.style.cssText += `left:${c.x + 6}px;top:${c.y + 21}px;width:${cw - 12}px;height:${ch - 25}px`; d.textContent = c.text;
        textEls.push(t, d);
      }
    };
    return b;
  })();
  function pinToBoard(n, x, y) { board.add(n, x, y); removeNote(n); board.toggle(true); }

  // =================================================================================
  // VISITS (~/.config/quickshell/visits)
  // =================================================================================
  const visits = (() => {
    const root = el('div', 'visits', screenEl); root.style.left = (1642 + DX) + 'px'; root.style.top = '40px';
    root.innerHTML = '<div class="vbox"><canvas width="226" height="14"></canvas><div class="vlabel">PORTFOLIO VISITS</div><div class="vnum">...<span class="vplus">+1</span></div><div class="vsub">LIVE FROM THIS SITE</div></div>';
    root.tabIndex = 0; root.setAttribute('role', 'button'); root.setAttribute('aria-label', 'Portfolio visit counter');
    blurb(root, 'visits'); draggable(root, { x: 1642 + DX, y: 40 }, 230, 120);
    const g = root.querySelector('canvas').getContext('2d');
    for (let i = 0; i < 700; i++) { const x = Math.random() * 226, y = Math.random() * 14; if (y < 14 * (0.4 + 0.3 * Math.sin(x / 18))) continue; g.fillStyle = GRAINS[i % 3]; g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillRect(x, y, 2, 2); }
    const num = root.querySelector('.vnum'), plus = root.querySelector('.vplus'), sub = root.querySelector('.vsub');
    let count = null;
    const show = () => { num.firstChild.textContent = count === null ? '...' : count.toLocaleString('en-US'); };
    let baseSub = 'LIVE FROM THIS SITE';
    const setSub = t => { baseSub = t; sub.textContent = t; };
    fetch('https://abacus.jasoncameron.dev/get/themightypooh-portfolio/visitors').then(r => r.json()).then(j => { count = j.value; show(); if (!count) setSub('WAITING FOR THE FIRST VISIT'); })
      .catch(() => { setSub("CAN'T REACH COUNTER"); sub.style.color = '#f09595'; });
    let previewT = 0;
    root.addEventListener('click', () => {   // preview a new visit: the real count only goes up on the live site, once per browser a day
      clearTimeout(previewT); plus.textContent = '+1'; root.classList.add('flash', 'preview'); setTimeout(() => root.classList.remove('flash'), 120);
      if (count !== null) num.firstChild.textContent = (count + 1).toLocaleString('en-US');
      sub.textContent = 'PREVIEW, NOT A REAL VISIT';
      previewT = setTimeout(() => { root.classList.remove('preview'); show(); sub.textContent = baseSub; }, 2200);
      const r = root.getBoundingClientRect(), s = screenEl.getBoundingClientRect();
      shock((r.left - s.left) / scale + 60, headroom, 120);
    });
    return root;
  })();

  // =================================================================================
  // HOURGLASS (hourglass/shell.qml, glass.frag)
  // =================================================================================
  const hg = { gw: 200, gh: 310, neckY: 155, neckLen: 4, neckW: 3.2, bulbH: 128, bulbR: 66, duration: 300, mode: 'empty', frac: 0, left: 0, endAt: 0,
    clock: 0, flowFrom: 0, flowTo: 1e9, tailing: false, tailUntil: 0, flash: 0, flashT: 0, hov: 0, pending: '', dirty: true };
  hg.glassTop = hg.neckY - hg.neckLen - hg.bulbH; hg.glassBot = hg.neckY + hg.neckLen + hg.bulbH; hg.fullLevel = hg.glassTop + hg.bulbH * 0.2;
  function halfW(y) { const u = clamp((Math.abs(y - hg.neckY) - hg.neckLen) / hg.bulbH, 0, 1), a = 0.62; const s = u < a ? 1 - (1 - u / a) ** 2 : Math.sqrt(Math.max(0, 1 - ((u - a) / 0.63) ** 2)); return hg.neckW + (hg.bulbR - hg.neckW) * s; }
  const craterOf = (L2, ramp) => ({ dip: ramp * Math.min(hg.neckY - hg.neckLen - L2, hg.bulbH * 0.2), r: halfW(L2) * 0.92 });
  function topVol(L2, ramp) {
    const c = craterOf(L2, ramp); let v = 0;
    for (let y = hg.glassTop; y < hg.neckY - hg.neckLen; y++) {
      const yc = y + 0.5, w = clamp(yc + 0.5 - L2, 0, 1); if (w <= 0) continue;
      const hw = halfW(yc); let rin = 0;
      if (c.dip > 0 && yc - L2 < c.dip) rin = c.r * (1 - Math.pow(Math.max(0, yc - L2) / c.dip, 1 / 1.25));
      rin = clamp(rin, 0, hw); v += w * (hw * hw - rin * rin);
    }
    return v;
  }
  const heapOf = g => hg.bulbH * 0.42 * Math.min(1, Math.sqrt(g * 3));
  function botVol(B, Hh) {
    const R = halfW(B); let v = 0;
    for (let y = hg.neckY + hg.neckLen; y < hg.glassBot; y++) {
      const yc = y + 0.5, hw = halfW(yc), w = clamp(yc + 0.5 - B, 0, 1);
      let r = Hh > 0 && yc < B ? R * (1 - (B - yc) / Hh) : 0; r = clamp(r, 0, hw);
      v += w * hw * hw + (1 - w) * r * r;
    }
    return v;
  }
  const fullVol = topVol(hg.fullLevel, 0);
  function shapeAt(f) {
    const g = 1 - f, ramp = Math.min(1, g * 25);
    let lo = hg.fullLevel - 4, hi = hg.neckY - hg.neckLen;
    if (f <= 0) lo = hi; else for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (topVol(m, ramp) > f * fullVol) lo = m; else hi = m; }
    const c = craterOf(lo, ramp), Hh = heapOf(g);
    let b0 = hg.neckY + hg.neckLen, b1 = hg.glassBot;
    if (g <= 0) b0 = b1; else for (let i = 0; i < 22; i++) { const m = (b0 + b1) / 2; if (botVol(m, Hh) > g * fullVol) b0 = m; else b1 = m; }
    return [f <= 0 ? hg.neckY : lo, c.dip, c.r, g <= 0 ? hg.glassBot + 20 : b1, g <= 0 ? 0 : Hh, halfW(b1)];
  }
  const STEPS = 200, shapes = [];
  for (let i = 0; i <= STEPS; i++) shapes.push(shapeAt(i / STEPS));
  function shapeLerp(f) { const x = clamp(f, 0, 1) * STEPS, i = Math.min(STEPS - 1, Math.floor(x)), t = x - i; return shapes[i].map((v, k) => v + (shapes[i + 1][k] - v) * t); }

  const hgEl = el('div', 'hourglass', screenEl); hgEl.style.left = (1450 + DX) + 'px'; hgEl.style.top = '180px';
  blurb(hgEl, 'hourglass'); draggable(hgEl, { x: 1450 + DX, y: 180 }, 200, 400);
  const glassEl = el('div', 'glass', hgEl); glassEl.tabIndex = 0; glassEl.setAttribute('role', 'button'); glassEl.setAttribute('aria-label', 'Hourglass: start or pause');
  const glassCanvas = el('canvas', '', glassEl); glassCanvas.width = hg.gw; glassCanvas.height = hg.gh;
  const glassGL = glProgram(glassCanvas, MD_SHADERS.GLASS_FRAG);
  const readout = el('div', 'readout', hgEl), hgHint = el('div', 'hghint', hgEl), chips = el('div', 'chips', hgEl);
  [1, 5, 10, 25, 60].forEach(m => { const b = el('button', '', chips); b.textContent = m < 60 ? m + 'M' : '1H'; b.style.color = '#35e6ff'; b.style.borderColor = 'rgba(53,230,255,.6)'; b.style.setProperty('--chip-hover', 'rgba(53,230,255,.25)'); b.onclick = () => hgStart(m * 60); });
  const rb = el('button', '', chips); rb.textContent = '↺'; rb.style.fontSize = '13px'; rb.style.color = '#ff4fd8'; rb.style.borderColor = 'rgba(255,79,216,.6)'; rb.style.setProperty('--chip-hover', 'rgba(255,79,216,.25)');
  rb.onclick = () => { hg.pending = ''; if (hg.mode !== 'empty' && hg.mode !== 'done') hgPour(); };
  const fmt = s => { s = Math.max(0, Math.ceil(s - 0.001)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60, p = n => (n < 10 ? '0' : '') + n; return h > 0 ? h + ':' + p(m) + ':' + p(x) : p(m) + ':' + p(x); };
  function hgStart(secs) { if (secs > 0) hg.duration = secs; if (hg.mode === 'flipping') return; if (hg.frac > 0.001) { hg.pending = 'start'; hgPour(); return; } hgFlip(); }
  function hgToggle() { if (hg.mode === 'running') { hg.left = Math.max(0, (hg.endAt - Date.now()) / 1000); hg.mode = 'paused'; } else if (hg.mode === 'paused') { hg.endAt = Date.now() + hg.left * 1000; hg.mode = 'running'; } else hgStart(0); hg.dirty = true; }
  function hgPour() { if (hg.frac <= 0.001) { hg.frac = 0; hg.mode = 'empty'; return; } hg.pourFrom = hg.frac; hg.pourStart = Date.now(); if (hg.flowTo < hg.clock) { hg.flowFrom = hg.clock; hg.flowTo = 1e9; } hg.mode = 'pouring'; }
  function hgFlip() {   // tip over to edge-on, swap the sand into the top, come back upright
    hg.mode = 'flipping';
    glassEl.animate([{ transform: 'perspective(800px) rotateX(0deg)' }, { transform: 'perspective(800px) rotateX(90deg)' }], { duration: 260, easing: 'ease-in' }).onfinish = () => {
      hg.frac = 1; hg.tailing = false; hg.flowTo = 1e9; hg.flash = 0; hg.dirty = true;
      glassEl.animate([{ transform: 'perspective(800px) rotateX(-90deg)' }, { transform: 'perspective(800px) rotateX(0deg)' }], { duration: 320, easing: 'cubic-bezier(.3,1.5,.5,1)' }).onfinish = () => {
        hg.left = hg.duration; hg.endAt = Date.now() + hg.duration * 1000; hg.flowFrom = hg.clock; hg.flowTo = 1e9; hg.mode = 'running';
      };
    };
  }
  glassEl.addEventListener('click', hgToggle);
  glassEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hgToggle(); } });
  hgEl.addEventListener('wheel', e => { if (!engaged) return; e.preventDefault(); const d = e.deltaY < 0 ? 60 : -60; if (hg.mode === 'running') { hg.endAt += d * 1000; hg.duration += d; } else if (hg.mode === 'paused') { hg.left += d; hg.duration += d; } else hg.duration = clamp(hg.duration + d, 60, 99 * 3600); hg.duration = Math.max(1, hg.duration); hg.dirty = true; }, { passive: false });
  hgEl.addEventListener('pointerenter', () => { hg.hovered = true; }); hgEl.addEventListener('pointerleave', () => { hg.hovered = false; });
  function hgStep(dt) {
    const moving = hg.mode === 'running' || hg.mode === 'pouring' || hg.tailing;
    if (moving) hg.clock += dt;
    if (hg.mode === 'running') {
      hg.left = Math.max(0, (hg.endAt - Date.now()) / 1000); hg.frac = hg.left / hg.duration;
      if (hg.left <= 0) { hg.frac = 0; hg.mode = 'done'; hg.flowTo = hg.clock; hg.tailing = true; hg.tailUntil = hg.clock + 0.4; hg.flashT = performance.now(); }
    } else if (hg.mode === 'pouring') {
      const e = (Date.now() - hg.pourStart) / (1500 * hg.pourFrom);
      hg.frac = hg.pourFrom * Math.max(0, 1 - e);
      if (e >= 1) { hg.frac = 0; hg.flowTo = hg.clock; hg.tailing = true; hg.tailUntil = hg.clock + 0.4; hg.mode = 'empty'; if (hg.pending) { hg.pending = ''; setTimeout(hgFlip, 420); } }
    }
    if (hg.tailing && hg.clock > hg.tailUntil) hg.tailing = false;
    if (hg.flashT) { const e = (performance.now() - hg.flashT) / 1600; hg.flash = e < 0.1 ? e / 0.1 : Math.max(0, 1 - (e - 0.1) / 0.9) ** 2; if (e >= 1) { hg.flashT = 0; hg.flash = 0; } }
    const hv = hg.hovered ? 1 : 0; if (Math.abs(hv - hg.hov) > 0.01) { hg.hov += (hv - hg.hov) * Math.min(1, dt * 8); hg.dirty = true; }
    const shown = hg.mode === 'running' || hg.mode === 'paused' ? hg.left : hg.duration;
    readout.textContent = fmt(shown); readout.classList.toggle('dim', hg.mode === 'empty' || hg.mode === 'done' || hg.mode === 'paused');
    readout.style.color = hg.flash > 0 ? '#ff9be8' : '';
    hgHint.textContent = hg.mode === 'running' ? 'CLICK TO PAUSE' : hg.mode === 'paused' ? 'PAUSED · CLICK TO GO ON' : hg.mode === 'done' ? "TIME'S UP" : hg.hovered ? 'SCROLL TO SET · CLICK TO START' : '';
    hgHint.style.color = hg.mode === 'done' ? '#ff4fd8' : '';
    if (!(moving || hg.flash > 0 || hg.dirty || hg.mode === 'flipping') || !glassGL) return;
    hg.dirty = false;
    const [topY, dip, craterR, botY, heap, heapR] = shapeLerp(hg.frac), s = glassGL;
    s.set('size', [hg.gw, hg.gh]); s.set('neckY', hg.neckY); s.set('neckLen', hg.neckLen); s.set('neckW', hg.neckW); s.set('bulbH', hg.bulbH); s.set('bulbR', hg.bulbR);
    s.set('cell', 2.3); s.set('pitch', 3.0); s.set('time', hg.clock); s.set('topY', topY); s.set('dip', dip); s.set('crater', craterR);
    s.set('topShift', topY < hg.neckY ? topY - hg.fullLevel : 0); s.set('botY', botY); s.set('heap', heap); s.set('heapR', heapR);
    s.set('stream', hg.mode === 'running' || hg.mode === 'pouring' || hg.tailing || hg.mode === 'paused' ? 1 : 0);
    s.set('flowFrom', hg.flowFrom); s.set('flowTo', hg.flowTo); s.set('flash', hg.flash); s.set('dim', hg.mode === 'paused' ? 1 : 0); s.set('hover', hg.hov);
    s.set('gradA', C.gooA); s.set('gradB', C.gooB); s.set('grainM', C.grainM); s.set('grainC', C.grainC); s.set('grainY', C.grainY); s.set('rim', C.rim);
    s.draw();
  }

  // =================================================================================
  // LINEWORK (~/games/projects/linework qml: Main, ToolWheel, BrushPanel, Win, IconButton, Chip)
  // A window on the desktop with the app's own chrome, icons and font; draw, then hold still to snap.
  // =================================================================================
  const lw = (() => {
    const T = { s0: '#141418', s2: '#42454b', s4: '#757980', s5: '#8f949a', s6: '#aaaeb3', s8: '#dfe1e3', s9: '#f4f5f6', orange: '#ff8800', paper: '#efeee6' };
    const w = { x: 370 + Math.round(DX / 2), y: 110, ww: 1180, wh: 720, open: false };
    const root = el('div', 'lw-win', screenEl);
    const title = el('div', 'lw-title', root, 'Linework');
    const wb = el('div', 'lw-wbtns', title);
    const minB = el('button', '', wb, '<svg viewBox="0 0 10 10"><path d="M2 6h6" stroke="#fcfcfc" stroke-width="1.4"/></svg>');
    const closeB = el('button', '', wb, '<svg viewBox="0 0 10 10"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="#fcfcfc" stroke-width="1.4"/></svg>');
    minB.setAttribute('aria-label', 'Minimise'); closeB.setAttribute('aria-label', 'Close');
    const app = el('div', 'lw-app', root);
    const AW = w.ww, AH = w.wh - 30, narrow = AW < 1240;
    root.style.left = w.x + 'px'; root.style.top = w.y + 'px'; root.style.width = AW + 'px'; root.style.height = w.wh + 'px';
    const paper = el('canvas', 'lw-paper', app); paper.width = AW; paper.height = AH;
    const pc = paper.getContext('2d');
    const help = el('div', 'lw-help', app, '<b>DRAW ANYWHERE.</b> Hold still at the end of a stroke to snap it to a line, circle or box.<br>Space-drag to pan · wheel to zoom');
    help.style.top = (narrow ? 124 : 76) + 'px';
    const tip = el('div', 'lw-tip', app), toast = el('div', 'lw-toast', app);
    let toastT = 0;
    const say = m => { toast.textContent = m; toast.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { toast.style.display = 'none'; }, 1800); };
    const ico = n => `<img src="img/linework/${n}.svg" alt="" draggable="false">`;
    function tipFor(node, text, above) {
      node.addEventListener('pointerenter', () => { const r = node.getBoundingClientRect(), a = app.getBoundingClientRect(); tip.textContent = text; tip.style.display = 'block'; tip.style.left = ((r.left - a.left) / scale) + 'px'; tip.style.top = ((above ? r.top - a.top - 26 * scale : r.bottom - a.top + 6 * scale) / scale) + 'px'; });
      node.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
    }
    const btn = (parent, icon, t, fn) => { const b = el('button', 'lw-btn', parent, ico(icon)); b.setAttribute('aria-label', t); tipFor(b, t); b.onclick = fn || (() => say('Not in the web version')); return b; };
    const chip = (parent, html, t, fn) => { const b = el('button', 'lw-chip', parent, html); b.setAttribute('aria-label', t); tipFor(b, t); b.onclick = fn; return b; };
    const sep = parent => el('div', 'lw-sep', parent);

    // ---- state: strokes in drawing space, a view on top of it ----
    const st = { tool: 'pen', size: 4, opac: 100, smth: 50, grid: true, strokes: [], redo: [], cur: null, view: { x: 0, y: 0, z: 1 }, last: {} };
    const groups = [{ name: 'BRUSH', tools: ['pen', 'fineliner', 'pencil', 'ink', 'brush', 'marker', 'airbrush'] },
      { name: 'SHAPE', tools: ['shape', 'polyline', 'arrow', 'text', 'fill'] }, { name: 'EDIT', tools: ['lasso', 'nudge', 'eraser', 'eyedropper', 'pan'] }];
    const groupOf = t => groups.findIndex(g => g.tools.includes(t));
    const widthK = { pen: 1, fineliner: 0.6, pencil: 0.8, ink: 1.3, brush: 2.2, marker: 3, airbrush: 4 };

    // ---- top-left window ----
    const tl = el('div', 'lwin', app); tl.style.left = '16px'; tl.style.top = '16px';
    el('div', 'lw-logo', tl, '<i></i>LINEWORK'); sep(tl);
    btn(tl, 'gallery', 'Drawings (Ctrl+G)'); btn(tl, 'newdoc', 'New drawing', () => { st.strokes = []; st.redo = []; paint(); say('New drawing'); });
    btn(tl, 'open', 'Open file (Ctrl+O)'); btn(tl, 'save', 'Save file (Ctrl+S)'); btn(tl, 'image', 'Add reference image (Ctrl+I, or paste / drop)');
    btn(tl, 'play', 'Replay the drawing', replay); sep(tl);
    btn(tl, 'png', 'Export PNG (Ctrl+E)', exportPng); btn(tl, 'svg', 'Export SVG'); btn(tl, 'amiga', 'Export Amiga PNG (dithered pixel art)'); btn(tl, 'clip', 'Copy as PNG');
    // ---- top-right window ----
    const tr = el('div', 'lwin', app);
    btn(tr, 'undo', 'Undo (Ctrl+Z)', undo); btn(tr, 'redo', 'Redo (Ctrl+Shift+Z)', redo); sep(tr);
    const gridC = chip(tr, ico('grid') + 'DOTS', 'Grid (G)', () => { st.grid = !st.grid; gridC.classList.toggle('on', st.grid); gridC.lastChild.textContent = st.grid ? 'DOTS' : 'NONE'; paint(); }); gridC.classList.add('on');
    btn(tr, 'snap', 'Snap to grid (X)').onclick = function () { this.classList.toggle('on'); };
    btn(tr, 'sym', 'Mirror drawing (Y)').onclick = function () { this.classList.toggle('on'); st.sym = this.classList.contains('on'); };
    chip(tr, 'PERSP', 'Perspective guides (V)', () => say('Not in the web version'));
    chip(tr, '<span class="dot"></span>GRAPHITE', 'Paper'); sep(tr);
    const rotC = chip(tr, '0°', 'Rotation'); const zoomC = chip(tr, '100%', '100% (0 fits all)', () => { st.view = { x: 0, y: 0, z: 1 }; paint(); }); zoomC.style.minWidth = '64px';
    btn(tr, 'layers', 'Layers'); btn(tr, 'help', 'Shortcuts (?)');
    requestAnimationFrame(() => { tr.style.left = (narrow ? 16 : AW - tr.offsetWidth - 16) + 'px'; tr.style.top = (narrow ? 66 : 16) + 'px'; });
    rotC.style.minWidth = '32px';

    // ---- the tool dial (ToolWheel.qml) ----
    const wheel = el('div', 'lw-wheel', app); wheel.style.left = '18px'; wheel.style.top = (AH - 19 - 212) + 'px';
    const wc = el('canvas', '', wheel); wc.width = wc.height = 212;
    const icoLayer = el('div', '', wheel);
    const core = el('div', 'lw-core', wheel);
    const C0 = 106, rCore = 46, rRing = 98, catSweep = 120;
    let openGroup = -1, t = 0, shownGroup = 0, hover = -1;
    const dither = new Image(); dither.src = 'img/linework/dither.png'; dither.onload = () => drawWheel();
    const catMid = g => -90 + g * catSweep;
    const toolOfGroup = g => st.last[g] || groups[g].tools[0];
    const tiles = () => groups[shownGroup].tools.concat(['__back']);
    const lerpA = (a, b, k) => { let d = b - a; while (d > 180) d -= 360; while (d < -180) d += 360; return a + d * k; };
    const tileMid = k => { const n = tiles().length, from = catMid(shownGroup) + (k - (n - 1) / 2) * (catSweep / n); return lerpA(from, -90 + k * 360 / n, t); };
    const tileSpan = () => { const n = tiles().length; return catSweep / n + (360 / n - catSweep / n) * t; };
    function slice(g, mid, sweep, fill) {
      const a0 = (mid - sweep / 2) * Math.PI / 180, a1 = (mid + sweep / 2) * Math.PI / 180;
      g.beginPath(); g.arc(C0, C0, rRing, a0, a1); g.arc(C0, C0, rCore, a1, a0, true); g.closePath();
      g.fillStyle = fill; g.fill(); g.strokeStyle = T.s4; g.lineWidth = 1; g.stroke();
    }
    function drawWheel() {
      const g = wc.getContext('2d'); g.clearRect(0, 0, 212, 212);
      g.beginPath(); g.arc(C0, C0, C0 - 1, 0, Math.PI * 2); g.fillStyle = T.s5; g.fill();
      if (dither.complete && dither.naturalWidth) { g.fillStyle = g.createPattern(dither, 'repeat'); g.fill(); }
      g.lineWidth = 2; g.strokeStyle = T.s0; g.stroke();
      icoLayer.innerHTML = '';
      const curG = groupOf(st.tool), rm = (rCore + rRing) / 2 + 2;
      const place = (mid, html) => { const a = mid * Math.PI / 180, d = el('div', 'lw-ico', icoLayer, html); d.style.left = (C0 + Math.cos(a) * rm) + 'px'; d.style.top = (C0 + Math.sin(a) * rm) + 'px'; d.style.transform = 'translate(-50%,-50%)'; };
      if (t < 0.99) {
        g.globalAlpha = 1 - t;
        groups.forEach((gr, i) => { slice(g, catMid(i), catSweep, curG === i ? T.orange : openGroup < 0 && hover === i ? T.s8 : T.s6); if (t < 0.5) place(catMid(i), ico(toolOfGroup(i)) + gr.name); });
        g.globalAlpha = 1;
      }
      if (t > 0.01) {
        g.globalAlpha = Math.min(1, t * 1.6);
        tiles().forEach((tool, k) => { const back = tool === '__back'; slice(g, tileMid(k), tileSpan(), !back && st.tool === tool ? T.orange : openGroup >= 0 && hover === k ? T.s8 : back ? T.s4 : T.s6); if (t >= 0.5) place(tileMid(k), ico(back ? 'categories' : tool)); });
        g.globalAlpha = 1;
      }
      g.beginPath(); g.arc(C0, C0, rRing - 2, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = T.s9; g.stroke();
      g.beginPath(); g.arc(C0, C0, rRing, 0, Math.PI * 2); g.strokeStyle = T.s0; g.stroke();
      // the paper centre: size on top, a dot the size of the brush, the tool's name below
      g.beginPath(); g.arc(C0, C0, rCore, 0, Math.PI * 2); g.fillStyle = T.paper; g.fill(); g.strokeStyle = T.s0; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(C0, C0, Math.max(1.5, st.size * (widthK[st.tool] || 1) / 2), 0, Math.PI * 2); g.strokeStyle = T.s0; g.lineWidth = 1; g.stroke();
      core.innerHTML = `<div style="position:absolute;left:${C0 - 40}px;top:${C0 - 38}px;width:80px">${st.size.toFixed(1)}</div><div style="position:absolute;left:${C0 - 40}px;top:${C0 + 26}px;width:80px;color:#141418">${st.tool.toUpperCase()}</div>`;
    }
    function animT(to) { const from = t, t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / 220); t = from + (to - from) * (1 - Math.pow(1 - k, 3)); drawWheel(); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
    function setTool(name) { st.tool = name; const g = groupOf(name); if (g >= 0) st.last[g] = name; paper.style.cursor = name === 'pan' ? 'grab' : 'crosshair'; drawWheel(); }
    const local = e => { const r = wheel.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; };
    wheel.addEventListener('pointermove', e => {
      const p = local(e), r = Math.hypot(p.x - C0, p.y - C0);
      let h = -1;
      if (r >= rCore && r <= rRing + 3) { const a = Math.atan2(p.y - C0, p.x - C0) * 180 / Math.PI; if (openGroup < 0) h = Math.floor((((a + 90 + catSweep / 2) % 360) + 360) % 360 / catSweep) % 3; else { const n = tiles().length, sw = 360 / n; h = Math.floor((((a + 90 + sw / 2) % 360) + 360) % 360 / sw) % n; } }
      if (h !== hover) { hover = h; drawWheel(); }
    });
    wheel.addEventListener('pointerleave', () => { hover = -1; drawWheel(); });
    wheel.addEventListener('click', () => {
      if (hover < 0) return;
      if (openGroup < 0) { openGroup = shownGroup = hover; setTool(toolOfGroup(hover)); animT(1); return; }
      const tool = tiles()[hover];
      if (tool === '__back') { openGroup = -1; animT(0); return; }
      setTool(tool);
    });
    wheel.addEventListener('wheel', e => { if (!engaged) return; e.preventDefault(); st.size = clamp(st.size + (e.deltaY < 0 ? 0.5 : -0.5), 0.5, 40); syncSliders(); drawWheel(); }, { passive: false });

    // ---- the brush panel (BrushPanel.qml): size / opacity / smoothing ----
    const bp = el('div', 'lwin lw-brush', app); bp.style.left = '244px'; bp.style.top = (AH - 19 - 178) + 'px';
    el('div', 'lw-bar', bp, '<span>BRUSH</span>');
    const row = el('div', 'lw-sliders', bp);
    const sliders = [['size', 'SIZE', 0.5, 40, v => v.toFixed(1)], ['opac', 'OPAC', 1, 100, v => Math.round(v)], ['smth', 'SMTH', 0, 100, v => Math.round(v)]].map(([k, nm, lo, hi, f]) => {
      const s = el('div', 'lw-vs', row, `<div class="fill"></div><div class="val"></div><div class="nm">${nm}</div>`);
      const set = e => { const r = s.getBoundingClientRect(), k01 = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); st[k] = lo + (hi - lo) * (k === 'size' ? k01 * k01 : k01); syncSliders(); drawWheel(); };
      s.addEventListener('pointerdown', e => { s.setPointerCapture(e.pointerId); set(e); s.onpointermove = set; });
      s.addEventListener('pointerup', () => { s.onpointermove = null; });
      return { s, k, lo, hi, f };
    });
    function syncSliders() { for (const o of sliders) { let k01 = (st[o.k] - o.lo) / (o.hi - o.lo); if (o.k === 'size') k01 = Math.sqrt(k01); o.s.querySelector('.fill').style.height = (k01 * 140) + 'px'; o.s.querySelector('.val').textContent = o.f(st[o.k]); } }

    // ---- drawing ----
    const toPaper = e => { const r = paper.getBoundingClientRect(), x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale; return { x: (x - st.view.x) / st.view.z, y: (y - st.view.y) / st.view.z }; };
    function strokePath(g, s) {
      const p = s.pts;
      g.beginPath();
      if (s.kind === 'ellipse') g.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2);
      else if (s.kind === 'box') g.rect(s.x0, s.y0, s.x1 - s.x0, s.y1 - s.y0);
      else { g.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i]; g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); } g.lineTo(p[p.length - 1].x, p[p.length - 1].y); }
    }
    function drawStroke(g, s) {
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = s.opac / 100;
      if (s.erase) g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = s.tool === 'marker' ? '#ffd36a' : s.tool === 'ink' ? '#f4f5f6' : '#e8e9ec'; g.lineWidth = s.w;
      if (s.tool === 'airbrush') { g.shadowColor = g.strokeStyle; g.shadowBlur = s.w; g.globalAlpha *= 0.5; }
      if (s.tool === 'pencil') g.globalAlpha *= 0.8;
      strokePath(g, s); g.stroke();
      if (s.kind === 'arrow') { const p = s.pts, a = p[p.length - 2] || p[0], b = p[p.length - 1], ang = Math.atan2(b.y - a.y, b.x - a.x), L = 10 + s.w * 2; g.beginPath(); g.moveTo(b.x - Math.cos(ang - 0.45) * L, b.y - Math.sin(ang - 0.45) * L); g.lineTo(b.x, b.y); g.lineTo(b.x - Math.cos(ang + 0.45) * L, b.y - Math.sin(ang + 0.45) * L); g.stroke(); }
      g.restore();
    }
    const ink = document.createElement('canvas'); ink.width = AW; ink.height = AH; const ic = ink.getContext('2d');
    function paint() {
      pc.setTransform(1, 0, 0, 1, 0, 0); pc.fillStyle = '#16171c'; pc.fillRect(0, 0, AW, AH);
      const v = st.view;
      if (st.grid) { pc.fillStyle = '#34363e'; const step = 128 * v.z, ox = ((v.x % step) + step) % step, oy = ((v.y % step) + step) % step; for (let y = oy; y < AH; y += step) for (let x = ox; x < AW; x += step) pc.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
      ic.setTransform(1, 0, 0, 1, 0, 0); ic.clearRect(0, 0, AW, AH); ic.setTransform(v.z, 0, 0, v.z, v.x, v.y);
      for (const s of st.strokes) drawStroke(ic, s);
      if (st.cur) drawStroke(ic, st.cur);
      if (st.sym) { ic.save(); ic.setTransform(-v.z, 0, 0, v.z, AW - v.x, v.y); for (const s of st.strokes) drawStroke(ic, s); if (st.cur) drawStroke(ic, st.cur); ic.restore(); }
      pc.drawImage(ink, 0, 0);
      zoomC.textContent = Math.round(v.z * 100) + '%';
      help.style.display = st.strokes.length || st.cur ? 'none' : '';
    }
    // hold still at the end of a stroke: it snaps to a clean line, circle/ellipse or box
    function snap(s) {
      const p = s.pts; if (p.length < 4) return;
      const a = p[0], b = p[p.length - 1];
      let xs = p.map(q => q.x), ys = p.map(q => q.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), size = Math.max(x1 - x0, y1 - y0, 1);
      if (Math.hypot(b.x - a.x, b.y - a.y) < size * 0.3) {
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
        // how far the points are from that ellipse decides circle or box
        const err = p.reduce((e, q) => e + Math.abs(Math.hypot((q.x - cx) / Math.max(rx, 1), (q.y - cy) / Math.max(ry, 1)) - 1), 0) / p.length;
        if (err < 0.12) Object.assign(s, { kind: 'ellipse', cx, cy, rx, ry }); else Object.assign(s, { kind: 'box', x0, y0, x1, y1 });
      } else { s.pts = [a, b]; }
      paint();
    }
    let holdT = 0, panning = null, space = false;
    paper.addEventListener('pointerdown', e => {
      if (e.button === 1 || st.tool === 'pan' || space) { panning = { x: e.clientX, y: e.clientY, vx: st.view.x, vy: st.view.y }; paper.setPointerCapture(e.pointerId); return; }
      if (e.button !== 0) return;
      const tool = st.tool, shape = ['shape', 'polyline', 'arrow'].includes(tool);
      if (['text', 'fill', 'lasso', 'nudge', 'eyedropper'].includes(tool)) { say(tool.toUpperCase() + ': not in the web version'); return; }
      paper.setPointerCapture(e.pointerId);
      const p = toPaper(e);
      st.cur = { tool, pts: [p], w: Math.max(0.6, st.size * (widthK[tool] || 1)), opac: st.opac, erase: tool === 'eraser', kind: tool === 'shape' ? 'box' : tool === 'arrow' ? 'arrow' : '', shape, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      if (tool === 'eraser') st.cur.w = st.size * 4;
      paint();
    });
    paper.addEventListener('pointermove', e => {
      if (panning) { st.view.x = panning.vx + (e.clientX - panning.x) / scale; st.view.y = panning.vy + (e.clientY - panning.y) / scale; paint(); return; }
      const s = st.cur; if (!s) return;
      const p = toPaper(e);
      if (s.kind === 'box') { s.x1 = p.x; s.y1 = p.y; }
      else if (s.kind === 'arrow' || s.tool === 'polyline') s.pts = [s.pts[0], p];
      else {
        const l = s.pts[s.pts.length - 1], k = 1 - st.smth / 140;   // smoothing: lag behind the pointer
        s.pts.push({ x: l.x + (p.x - l.x) * k, y: l.y + (p.y - l.y) * k });
        clearTimeout(holdT); if (!s.erase) holdT = setTimeout(() => { if (st.cur === s) snap(s); }, 450);
      }
      paint();
    });
    const finish = () => { clearTimeout(holdT); if (panning) { panning = null; return; } if (!st.cur) return; st.strokes.push(st.cur); st.redo = []; st.cur = null; paint(); };
    paper.addEventListener('pointerup', finish); paper.addEventListener('pointercancel', finish);
    paper.addEventListener('wheel', e => {
      if (!engaged) return; e.preventDefault();
      const r = paper.getBoundingClientRect(), mx = (e.clientX - r.left) / scale, my = (e.clientY - r.top) / scale, v = st.view, k = e.deltaY < 0 ? 1.15 : 1 / 1.15, z = clamp(v.z * k, 0.25, 8);
      v.x = mx - (mx - v.x) * z / v.z; v.y = my - (my - v.y) * z / v.z; v.z = z; paint();
    }, { passive: false });
    function undo() { if (st.strokes.length) { st.redo.push(st.strokes.pop()); paint(); } }
    function redo() { if (st.redo.length) { st.strokes.push(st.redo.pop()); paint(); } }
    function exportPng() { paper.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'linework.png'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }); }
    let replayRun = 0;
    function replay() {
      const all = st.strokes.slice(); if (!all.length) return;
      st.strokes = []; let i = 0; const run = ++replayRun;
      const next = () => { if (run === replayRun && i < all.length) { st.strokes.push(all[i++]); paint(); setTimeout(next, 180); } };
      next();
    }
    document.addEventListener('keydown', e => {
      if (!w.open || L.open || document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (!root.matches(':hover')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (e.key === ' ') { e.preventDefault(); space = true; }
      else if (!ctrl && e.key === 'b') setTool('pen'); else if (!ctrl && e.key === 'e') setTool('eraser');
    });
    document.addEventListener('keyup', e => { if (e.key === ' ') space = false; });
    window.addEventListener('blur', () => { space = false; });

    // ---- the window: drag by its title bar, minimise to the taskbar ----
    title.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const p0 = toScreen(e), x0 = w.x, y0 = w.y; title.setPointerCapture(e.pointerId);
      title.onpointermove = ev => { const p = toScreen(ev); w.x = clamp(x0 + p.x - p0.x, -AW + 120, SW - 120); w.y = clamp(y0 + p.y - p0.y, 0, SH - 160); root.style.left = w.x + 'px'; root.style.top = w.y + 'px'; };
      title.onpointerup = title.onpointercancel = () => { title.onpointermove = null; };
    });
    const api = {
      get open() { return w.open; },
      show(on) { w.open = on; root.classList.toggle('open', on); if (on) { raise(root); paint(); drawWheel(); syncSliders(); explain('linework'); } api.onChange && api.onChange(on); },
      toggle() { api.show(!w.open); }
    };
    minB.onclick = () => api.show(false);
    closeB.onclick = () => { replayRun++; api.show(false); st.strokes = []; st.redo = []; };
    root.addEventListener('pointerenter', () => explain('linework'));
    root.addEventListener('pointerdown', () => raise(root), true);
    whyOn(title, 'linework');
    syncSliders(); drawWheel(); paint();
    return api;
  })();

  lw.onChange = on => taskFs[0].node.classList.toggle('active', on);

  // ---- bar notes icons --------------------------------------------------------------
  notesIcons[0].node.addEventListener('click', () => newNote());
  notesIcons[1].node.addEventListener('click', () => cab.peek());
  notesIcons[2].node.addEventListener('click', () => board.toggle());
  notesIcons[3].node.addEventListener('click', () => { glassEl.focus(); hgToggle(); });
  notesIcons[4].node.addEventListener('click', () => { raise(visits); visits.focus(); visits.classList.add('flash'); setTimeout(() => visits.classList.remove('flash'), 160); });
  notesIcons.forEach(f => f.node.addEventListener('pointerenter', () => tipOn(f, { note: 'new note', cabinet: 'file cabinet', board: 'corkboard', hourglass: 'hourglass', visits: 'portfolio visits' }[f.key])));
  notesIcons.forEach(f => f.node.addEventListener('pointerleave', tipOff));

  // ---- the desktop as it is on the real machine ------------------------------------------
  makeNote({ x: 40, y: 40, color: 3, title: 'welcome', text: 'this is my desktop,\nshrunk down.\n\ndrag me by the header.\ndrop me on the cabinet\nto file me away.' });
  makeNote({ x: 370, y: 64, color: 4, cat: 'todo', title: '', text: '- open the start menu\n- flip the hourglass\n- draw something\n- pin a note to the board' });
  board.add({ title: 'hello', text: 'notes pinned here\nstay in sight', color: 2 });
  board.add({ title: 'click me', text: 'takes the note back\noff the board', color: 0 });
  board.add({ title: 'shopping', text: 'milk\neggs\ncoffee', color: 1 });
  board.toggle(true);
  // the bar, start menu and hourglass are shaders; say so instead of leaving holes
  if (!barGL || !fanGL || !glassGL) el('div', 'nogl', screenEl, '<b>WEBGL IS OFF</b>The bar, start menu and hourglass are shaders, so they can\'t draw in this browser. Turn on hardware acceleration to see them.');

  // =================================================================================
  // MAIN LOOP: full rate while something moves under the pointer, ~20fps idle, stopped offscreen
  // =================================================================================
  let visible = true, last = performance.now(), idleAcc = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; last = performance.now(); }).observe(frame);
  function frameLoop(now) {
    requestAnimationFrame(frameLoop);
    if (!visible || document.hidden) { last = now; return; }
    let dt = Math.min((now - last) / 1000, 0.1); last = now;
    const fast = pointer.in && pointer.y > SH - 260 || dots.hov > 0.01 || dots.gooBlobs.length > 0 || dots.awake || L.shown || drawer.w.busy || drawer.h.busy || hg.mode === 'running' && hg.frac > 0.98;
    if (!fast) { idleAcc += dt; if (idleAcc < (reduced ? 0.25 : 0.05)) return; dt = idleAcc; idleAcc = 0; }
    barAdvance(reduced ? 0 : dt); barDraw();
    menuAdvance(dt); menuDraw();
    cab.step(dt); board.step();
    for (const n of notes) if (n.hover || n.editing) { n.tick = (n.tick || 0) + dt; if (n.tick >= 0.05) { n.t += n.tick; n.tick = 0; paintNote(n); } }
    hgStep(dt);
  }
  document.fonts.ready.then(() => { tickClock(); buildCatText(); notes.forEach(paintNote); });
  tickClock(); buildCatText(); setInterval(tickClock, 30000);
  requestAnimationFrame(frameLoop);
};
if (!window.MD_MANUAL) window.mountMiniDesktop();
