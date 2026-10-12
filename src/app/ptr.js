/* ============================================================
 * ptr.js — pull down to refresh. The logo draws itself as you pull;
 * past the threshold it clicks (sound + vibration); on release it
 * spins while the app syncs with the cloud, looks for a new version
 * and recalculates, then shows a check. Replaces the browser's own
 * pull-to-refresh, which would reload the whole app.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Fx } = root;
  const THRESHOLD = 72, MAX = 128;
  const LOGO = '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path class="g" pathLength="1" d="M300 660 A258 258 0 0 1 603 271 L603 600"/><path class="y" pathLength="1" d="M420 422 L420 753 A258 258 0 0 0 720 362"/></svg>';
  const ind = document.createElement('div');
  ind.className = 'ptr';
  ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = `<div class="ptr-disc">${LOGO}<span class="ptr-check">✓</span></div>`;
  document.body.appendChild(ind);
  const disc = ind.firstChild;

  let startY = null, dist = 0, armed = false, busy = false;
  const inner = () => document.getElementById('view-inner');
  const blocked = (target) => busy || App.blocking || root.scrollY > 0
    || document.querySelector('.sheet, .dialog, #intro, #lock')
    || (target.closest && target.closest('input, textarea, select, .chart, [data-no-ptr]'));

  function paint(d) {
    const p = Math.min(1, d / THRESHOLD);
    ind.style.transform = `translate(-50%, ${Math.round(d - 64)}px)`;
    ind.style.opacity = Math.min(1, d / 36);
    disc.style.transform = `rotate(${Math.round(d * 3)}deg) scale(${0.7 + 0.3 * p})`;
    disc.style.setProperty('--p', p.toFixed(3));
    const v = inner();
    if (v) v.style.transform = d ? `translateY(${Math.round(d * 0.35)}px)` : '';
  }
  function settle(cls) {
    ind.classList.add('settle');
    const v = inner();
    if (v) { v.style.transition = 'transform .35s var(--ease)'; setTimeout(() => { v.style.transition = ''; }, 380); }
    if (cls) ind.classList.add(cls);
    paint(0);
    setTimeout(() => { ind.classList.remove('settle', 'armed', 'spin', 'done'); }, 420);
  }

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || blocked(e.target)) { startY = null; return; }
    startY = e.touches[0].clientY;
    dist = 0; armed = false;
    ind.classList.remove('settle');
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || root.scrollY > 0) { if (dist) paint(0); dist = 0; return; }
    dist = Math.min(MAX, dy * 0.5);
    paint(dist);
    if (dist >= THRESHOLD && !armed) { armed = true; ind.classList.add('armed'); Fx.haptic(12); Fx.play('tick'); }
    else if (dist < THRESHOLD && armed) { armed = false; ind.classList.remove('armed'); }
  }, { passive: true });

  async function end() {
    if (startY == null) return;
    startY = null;
    if (!armed) { settle(); return; }
    busy = true;
    ind.classList.add('settle', 'spin');
    paint(THRESHOLD * 0.9);
    const t0 = Date.now();
    try { await App.refresh(); } catch (e) { console.warn('refresh', e); }
    const left = 700 - (Date.now() - t0);
    if (left > 0) await Fx.sleep(left);
    ind.classList.remove('spin');
    ind.classList.add('done');
    Fx.play('pop'); Fx.haptic(10);
    await Fx.sleep(450);
    settle();
    busy = false;
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { if (startY != null) { startY = null; settle(); } }, { passive: true });
})(typeof window !== 'undefined' ? window : globalThis);
