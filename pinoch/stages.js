// Pinoch life-cycle renderer: 8 stages (Droplet..Grown) of one genome -> PNG data URLs + a contact sheet.
// Uses the viewer's own expressed()/CONFIG (same growth rules as the live Pinoch), cells as in gallery.go.
'use strict';
function renderStagePNGs(gn, opts = {}) {
  const W = pvW, H = pvH, FL = pvFloor, SC = opts.scale || 6, ticks = opts.ticks || 240, at = i => i + 0.9;
  const bg = (typeof GL !== 'undefined' ? GL : opts.GL).CellBackground(W, H, FL), out = {}, imgs = [];
  CONFIG.stages.forEach((st, i) => {
    const w = makeCell(gn, at(i)).w; for (let k = 120; k < ticks; k++) w.Step();   // same growth rules as the gallery preview
    const id = new ImageData(W, H); new PS.Renderer(W, H).Render(w, id.data, bg);
    const a = document.createElement('canvas'); a.width = W; a.height = H; a.getContext('2d').putImageData(id, 0, 0);
    const c = document.createElement('canvas'); c.width = W * SC; c.height = H * SC; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(a, 0, 0, c.width, c.height);
    x.font = `${6 * SC}px "DejaVu Sans", sans-serif`; x.textBaseline = 'top'; x.fillStyle = 'rgb(150,194,172)'; x.fillText(`${i} ${st.name}`, 10, c.height - 24);
    out[`stage_${i}_${st.name.toLowerCase()}.png`] = c.toDataURL('image/png'); imgs.push(c);
  });
  const cols = 4, rows = 2, cw = W * SC, ch = H * SC, head = 40, s = document.createElement('canvas'); s.width = cols * cw; s.height = rows * ch + head;
  const x = s.getContext('2d'); x.fillStyle = 'rgb(18,21,23)'; x.fillRect(0, 0, s.width, s.height);
  x.font = '18px "DejaVu Sans", sans-serif'; x.textBaseline = 'middle'; x.fillStyle = 'rgb(206,214,209)'; x.fillText(opts.title || 'Pinoch life cycle', 12, head / 2);
  imgs.forEach((c, i) => { x.drawImage(c, (i % cols) * cw, head + Math.floor(i / cols) * ch); x.strokeStyle = 'rgb(10,12,13)'; x.strokeRect((i % cols) * cw + 0.5, head + Math.floor(i / cols) * ch + 0.5, cw - 1, ch - 1); });
  out['contact_sheet.png'] = s.toDataURL('image/png');
  return out;
}
