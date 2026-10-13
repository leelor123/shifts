/* ============================================================
 * ptr.js — pull down to refresh. The page follows the finger with a
 * natural, ever-heavier resistance; the logo draws itself as you
 * pull and clicks (sound + vibration) past the threshold. On release
 * the page springs to a resting gap where the logo spins while the
 * app syncs with the cloud, looks for a new version and recalculates,
 * then a check mark and a spring back. Every frame is painted in
 * requestAnimationFrame with transforms only (no layout work), so it
 * stays smooth. Replaces the browser's own pull-to-refresh, which
 * would reload the whole app.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Fx } = root;
  const THRESHOLD = 74; // pulled distance (after resistance) that triggers a refresh
  const MAX = 150; // the page never moves further than this
  const RESIST = 190; // higher = lighter pull
  const REST = 62; // where the page waits while refreshing
  const SLOP = 10; // finger movement that still counts as a tap
  const LOGO = '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path class="g" pathLength="1" d="M300 660 A258 258 0 0 1 603 271 L603 600"/><path class="y" pathLength="1" d="M420 422 L420 753 A258 258 0 0 0 720 362"/></svg>';
  const ind = document.createElement('div');
  ind.className = 'ptr';
  ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = `<div class="ptr-disc">${LOGO}<span class="ptr-check">✓</span></div>`;
  document.body.appendChild(ind);
  const disc = ind.firstChild;

  let x0 = 0, y0 = null, pulling = false, dist = 0, armed = false, busy = false, raf = 0, page = null;
  const blocked = (target) => busy || App.blocking || root.scrollY > 0
    || document.querySelector('.sheet, .dialog, #intro, #lock, .coach')
    || (target.closest && target.closest('input, textarea, select, .chart, [data-no-ptr]'));
  const resist = (dy) => MAX * (1 - Math.exp(-dy / RESIST));

  function paint(d, spinning) {
    const p = Math.min(1, d / THRESHOLD);
    ind.style.transform = `translate3d(-50%, ${(d - 56).toFixed(1)}px, 0)`;
    ind.style.opacity = Math.min(1, d / 30).toFixed(2);
    if (!spinning) disc.style.transform = `rotate(${Math.round(d * 2.6)}deg) scale(${(0.6 + 0.4 * p).toFixed(3)})`;
    disc.style.setProperty('--p', p.toFixed(3));
    if (page) page.style.transform = d ? `translate3d(0, ${(d * 0.62).toFixed(1)}px, 0)` : '';
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(dist); }); };
  /** Animate to a distance with a little spring at the end. */
  function springTo(d, ms) {
    ind.classList.add('settle');
    if (page) page.style.transition = `transform ${ms || 420}ms cubic-bezier(.22, 1.3, .36, 1)`;
    dist = d;
    paint(d, ind.classList.contains('spin'));
    return new Promise((r) => setTimeout(() => {
      ind.classList.remove('settle');
      if (page) { page.style.transition = ''; if (!d) page.style.willChange = ''; }
      r();
    }, ms || 420));
  }

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || blocked(e.target) || !(e.target.closest && e.target.closest('#view'))) { y0 = null; return; }
    y0 = e.touches[0].clientY;
    x0 = e.touches[0].clientX;
    pulling = false; dist = 0; armed = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    const dx = e.touches[0].clientX - x0;
    if (!pulling) {
      // a sideways swipe, a scroll up, or a page that has scrolled: not a pull
      if (Math.abs(dx) > Math.abs(dy) || dy < -SLOP || root.scrollY > 0) { if (Math.abs(dx) > SLOP || dy < -SLOP) y0 = null; return; }
      if (dy < SLOP) return;
      pulling = true;
      page = document.getElementById('view-inner');
      if (page) page.style.willChange = 'transform';
      ind.classList.remove('settle', 'done', 'spin');
    }
    dist = Math.max(0, resist(dy - SLOP));
    if (dist >= THRESHOLD && !armed) { armed = true; ind.classList.add('armed'); Fx.haptic(12); Fx.play('tick'); }
    else if (dist < THRESHOLD - 6 && armed) { armed = false; ind.classList.remove('armed'); }
    schedule();
  }, { passive: true });

  async function end() {
    if (y0 == null) return;
    y0 = null;
    if (!pulling) return;
    pulling = false;
    cancelAnimationFrame(raf); raf = 0;
    if (!armed) { await springTo(0, 360); return; }
    busy = true;
    ind.classList.add('spin');
    await springTo(REST, 380);
    const t0 = Date.now();
    try { await App.refresh(); } catch (e) { console.warn('refresh', e); }
    const left = 650 - (Date.now() - t0);
    if (left > 0) await Fx.sleep(left);
    ind.classList.remove('spin', 'armed');
    ind.classList.add('done');
    Fx.play('pop'); Fx.haptic(10);
    await Fx.sleep(420);
    page = document.getElementById('view-inner'); // the refresh may have redrawn the page
    if (page) page.style.transform = `translate3d(0, ${(REST * 0.62).toFixed(1)}px, 0)`;
    await springTo(0, 420);
    ind.classList.remove('done');
    page = null;
    busy = false;
  }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', () => { if (y0 != null && pulling) { y0 = null; pulling = false; armed = false; ind.classList.remove('armed'); springTo(0, 300); } else y0 = null; }, { passive: true });
})(typeof window !== 'undefined' ? window : globalThis);
