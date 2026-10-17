// TALK box: POST /talk, show reply in a speech bubble that follows the creature + short chat log.
(() => {
  const log = document.getElementById('log'), ti = document.getElementById('ti'), bub = document.getElementById('bubble');
  let bubbleUntil = 0;
  const add = (cls, who, txt) => { const d = document.createElement('div'); d.className = cls; d.textContent = who + ': ' + txt;
    log.appendChild(d); while (log.children.length > 12) log.firstChild.remove(); log.scrollTop = log.scrollHeight; };
  document.getElementById('tf').onsubmit = async e => {
    e.preventDefault(); const text = ti.value.trim(); if (!text) return; ti.value = ''; add('u', 'you', text);
    bub.textContent = '…'; bub.style.display = 'block'; bubbleUntil = Infinity;
    try {
      const r = await (await fetch('/talk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })).json();
      if (r.error) throw new Error(r.error);
      const tag = r.source === 'newborn' ? 'newborn' : `${r.source}${r.step != null ? ' @' + r.step : ''}`;
      add('p', `Pinoch (${tag}, ${r.device})`, r.reply); bub.textContent = r.reply.trim() || '…';
    } catch (err) { add('p', 'Pinoch', '[error: ' + err.message + ']'); bub.textContent = '?'; }
    bubbleUntil = performance.now() + 12000;
  };
  (function follow() {
    if (bub.style.display === 'block') {
      if (performance.now() > bubbleUntil) bub.style.display = 'none';
      else { let c = null; try { c = (window.pinochSel && pop.includes(window.pinochSel) && !window.pinochSel.dying) ? window.pinochSel : pop && pop[0]; } catch (_) {}
        const x = c && isFinite(c.x) ? c.x : innerWidth * 0.35, y = c && isFinite(c.y) ? c.y : innerHeight * 0.5;
        bub.style.left = Math.max(8, Math.min(innerWidth - 670, x - 20)) + 'px';
        bub.style.top = Math.max(8, y - 60 - bub.offsetHeight) + 'px'; }
    }
    requestAnimationFrame(follow);
  })();
  ti.focus();
})();
