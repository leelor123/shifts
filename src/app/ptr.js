/* ============================================================
 * ptr.js — pull down to refresh. The logo comes down with the finger
 * with a natural, ever-heavier resistance, draws itself as you pull and
 * clicks (sound + vibration) past the threshold. On release it springs
 * to a resting place where it spins while the app syncs with the cloud,
 * looks for a new version and recalculates, then a check mark and back up.
 *
 * Details that matter:
 *  - only the logo moves; the page stays where it is (as on Android). When
 *    the page itself followed the finger it had to go onto its own GPU
 *    layer, and on a real phone that showed a frame with most of the page
 *    missing as the pull began, and a white flash on the pay card when the
 *    screen redrew under it;
 *  - a pull that started on a button never "taps" it on release;
 *  - Chrome sometimes delivers a touchmove it held back during the last
 *    gesture (a sideways swipe) after the next touch began; those carry
 *    an older timestamp and are ignored, or the page would jump;
 *  - the rest of a gesture is heard on the element the finger landed on,
 *    not on the document: if the screen redraws mid-pull (a sync), that
 *    element leaves the page and its events no longer reach the document,
 *    which would leave the logo hanging half way down;
 *  - a new touch while a pull is still open (a second finger, a gesture
 *    the browser never finished) springs the logo back first;
 *  - every frame is painted in requestAnimationFrame with transforms
 *    only; the browser's own pull-to-refresh and stretch effect are
 *    switched off (overscroll-behavior: none) so they never stack.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Fx } = root;
  const THRESHOLD = 74; // pulled distance (after resistance) that triggers a refresh
  const MAX = 150; // the indicator never moves further than this
  const RESIST = 190; // higher = lighter pull
  const REST = 62; // where the logo waits while refreshing
  const SLOP = 10; // finger movement that still counts as a tap
  const LOGO = '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path class="g" pathLength="1" d="M300 660 A258 258 0 0 1 603 271 L603 600"/><path class="y" pathLength="1" d="M420 422 L420 753 A258 258 0 0 0 720 362"/></svg>';
  const ind = document.createElement('div');
  ind.className = 'ptr';
  ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = `<div class="ptr-disc">${LOGO}<span class="ptr-check">✓</span></div>`;
  document.body.appendChild(ind);
  const disc = ind.firstChild;

  let x0 = 0, y0 = null, t0 = 0, pulling = false, dist = 0, armed = false, busy = false, raf = 0, settleTimer = 0;
  const blocked = (target) => busy || App.blocking || root.scrollY > 0
    || document.querySelector('.sheet, .dialog, #intro, #lock, .coach')
    || (target.closest && target.closest('input, textarea, select, .chart, [data-no-ptr]'));
  const resist = (dy) => MAX * (1 - Math.exp(-dy / RESIST));

  function paint(d) {
    const p = Math.min(1, d / THRESHOLD);
    ind.style.transform = `translate3d(-50%, ${(d - 56).toFixed(1)}px, 0)`;
    ind.style.opacity = d > 0 ? Math.min(1, d / 30).toFixed(2) : '0';
    if (!ind.classList.contains('spin') && !ind.classList.contains('done')) disc.style.transform = `rotate(${Math.round(d * 2.6)}deg) scale(${(0.6 + 0.4 * p).toFixed(3)})`;
    disc.style.setProperty('--p', p.toFixed(3));
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(dist); }); };
  /** Animate to a distance with a little spring at the end. */
  function springTo(d, ms) {
    ms = ms || 420;
    clearTimeout(settleTimer);
    cancelAnimationFrame(raf); raf = 0;
    ind.classList.add('settle');
    dist = d;
    paint(d);
    return new Promise((r) => {
      settleTimer = setTimeout(() => {
        ind.classList.remove('settle');
        r();
      }, ms + 20);
    });
  }
  // a pull that began on a button must not press it when the finger lifts
  function swallowNextClick() {
    const kill = (e) => { e.stopPropagation(); e.preventDefault(); };
    root.addEventListener('click', kill, true);
    setTimeout(() => root.removeEventListener('click', kill, true), 450);
  }

  let tgt = null;
  function unbind() {
    if (!tgt) return;
    tgt.removeEventListener('touchmove', move);
    tgt.removeEventListener('touchend', end);
    tgt.removeEventListener('touchcancel', cancel);
    tgt = null;
  }
  document.addEventListener('touchstart', (e) => {
    if (pulling) cancel();
    if (e.touches.length !== 1 || blocked(e.target) || !(e.target.closest && e.target.closest('#view'))) { y0 = null; return; }
    y0 = e.touches[0].clientY;
    x0 = e.touches[0].clientX;
    t0 = e.timeStamp;
    pulling = false; dist = 0; armed = false;
    unbind();
    tgt = e.target;
    tgt.addEventListener('touchmove', move, { passive: true });
    tgt.addEventListener('touchend', end, { passive: true });
    tgt.addEventListener('touchcancel', cancel, { passive: true });
  }, { passive: true });

  function move(e) {
    if (y0 == null || e.timeStamp < t0) return; // a late event from the previous gesture
    if (e.touches.length !== 1) { cancel(); return; } // a second finger: not a pull any more
    const dy = e.touches[0].clientY - y0;
    const dx = e.touches[0].clientX - x0;
    if (!pulling) {
      // a sideways swipe, a scroll up, or a page that has scrolled: not a pull
      if (root.scrollY > 0 || dy < -SLOP || (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy))) { y0 = null; return; }
      if (dy < SLOP) return;
      pulling = true;
      clearTimeout(settleTimer);
      ind.classList.remove('settle', 'done', 'spin', 'armed');
    }
    dist = Math.max(0, resist(dy - SLOP));
    if (dist >= THRESHOLD && !armed) { armed = true; ind.classList.add('armed'); Fx.haptic(12); Fx.play('tick'); }
    else if (dist < THRESHOLD - 6 && armed) { armed = false; ind.classList.remove('armed'); }
    schedule();
  }

  function cancel() {
    unbind();
    y0 = null;
    if (!pulling) return;
    pulling = false; armed = false;
    ind.classList.remove('armed');
    swallowNextClick();
    springTo(0, 320);
  }

  async function end() {
    unbind();
    if (y0 == null) return;
    y0 = null;
    if (!pulling) return;
    pulling = false;
    swallowNextClick();
    if (!armed) { await springTo(0, 360); return; }
    busy = true;
    try {
      ind.classList.remove('armed');
      ind.classList.add('spin');
      await springTo(REST, 380);
      const t0 = Date.now();
      try { await App.refresh(); } catch (e) { console.warn('refresh', e); }
      const left = 650 - (Date.now() - t0);
      if (left > 0) await Fx.sleep(left);
      ind.classList.remove('spin');
      ind.classList.add('done');
      Fx.play('pop'); Fx.haptic(10);
      await Fx.sleep(420);
      await springTo(0, 420);
    } finally {
      ind.classList.remove('done', 'spin', 'armed');
      busy = false;
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
