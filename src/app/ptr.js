/* ============================================================
 * ptr.js — pull down to refresh, in Shaati's own look: a clock coin comes
 * down with the finger (a natural, ever-heavier resistance); its hands turn
 * and its ring fills as you pull, with a small note under it ("pull" →
 * "let go"). Past the threshold it clicks (sound + vibration) and lights up.
 * On release it springs to a resting place where its hands race (time-lapse)
 * while the app syncs with the cloud, looks for a new version and
 * recalculates; then a green check, "all up to date", and back up.
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
 *    switched off (overscroll-behavior: none) so they never stack;
 *  - while the coin shows, the gesture is the pull's: moving the finger
 *    back up takes the coin back up with it, and the page does not scroll
 *    under it (it used to, leaving the coin hanging). At the top of the
 *    page a downward move scrolls nothing anyway, so holding it costs
 *    nothing; once the coin is all the way back, the finger scrolls the
 *    page as usual;
 *  - the check appears in front of the same disc (a green circle that
 *    grows), and the hands only pause under it: changing the disc itself
 *    left it see-through for a few frames, a flash.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Fx } = root;
  const THRESHOLD = 74; // pulled distance (after resistance) that triggers a refresh
  const MAX = 150; // the indicator never moves further than this
  const RESIST = 190; // higher = lighter pull
  const REST = 62; // where the logo waits while refreshing
  const SLOP = 10; // finger movement that still counts as a tap
  // the hands are HTML elements, so their spin runs on the GPU even while the refresh keeps the page busy
  const CLOCK = '<svg class="ptr-ring" viewBox="0 0 48 48"><circle class="ptr-track" cx="24" cy="24" r="21"/><circle class="ptr-arc" cx="24" cy="24" r="21" pathLength="1"/></svg>'
    + '<span class="ptr-face"><i class="ptr-tk t12"></i><i class="ptr-tk t3"></i><i class="ptr-tk t6"></i><i class="ptr-tk t9"></i><i class="ptr-h"></i><i class="ptr-m"></i><b class="ptr-dot"></b></span>';
  const ind = document.createElement('div');
  ind.className = 'ptr';
  ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = `<div class="ptr-disc">${CLOCK}<span class="ptr-check">✓</span></div><span class="ptr-tip"></span>`;
  document.body.appendChild(ind);
  const disc = ind.firstChild;
  const hourHand = ind.querySelector('.ptr-h'), minHand = ind.querySelector('.ptr-m'), tipEl = ind.querySelector('.ptr-tip');
  let tipNow = '';
  const tip = (t) => { if (t !== tipNow) { tipNow = t; tipEl.textContent = t; ind.classList.toggle('tip', !!t); } };
  let tipShown = false; // the "pull" note comes in past 24px and goes below 14px, so it never blinks at the edge

  let x0 = 0, y0 = null, t0 = 0, pulling = false, dist = 0, armed = false, busy = false, raf = 0, settleTimer = 0;
  const blocked = (target) => busy || App.blocking || root.scrollY > 0
    || document.querySelector('.sheet, .dialog, #intro, #lock, .coach')
    || (target.closest && target.closest('input, textarea, select, .chart, [data-no-ptr]'));
  const resist = (dy) => MAX * (1 - Math.exp(-dy / RESIST));

  let minA = 0, hourA = 0;
  function paint(d) {
    const p = Math.min(1, d / THRESHOLD);
    ind.style.transform = `translate3d(-50%, ${(d - 56).toFixed(1)}px, 0)`;
    ind.style.opacity = d > 0 ? Math.min(1, d / 30).toFixed(2) : '0';
    if (!ind.classList.contains('spin') && !ind.classList.contains('done')) {
      // an hour goes by as you pull to the threshold, and the hands keep going past it
      minA = Math.round(p * 360 + Math.max(0, d - THRESHOLD) * 5);
      hourA = Math.round(minA / 12);
      minHand.style.transform = `rotate(${minA}deg)`;
      hourHand.style.transform = `rotate(${hourA}deg)`;
      disc.style.transform = `scale(${(0.62 + 0.38 * p).toFixed(3)})`;
      if (pulling) {
        tipShown = tipShown ? d > 14 : d > 24;
        tip(tipShown ? (armed ? 'שחררו לרענון' : 'משכו לרענון') : '');
      }
    }
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
    tgt.addEventListener('touchmove', move, { passive: false }); // may hold the gesture during a pull (see above)
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
      // (and the listeners go at once, so the rest of this scroll never waits for the page)
      if (root.scrollY > 0 || dy < -SLOP || (Math.abs(dx) > SLOP && Math.abs(dx) > Math.abs(dy))) { y0 = null; unbind(); return; }
      // at the top, a downward move scrolls nothing: hold it, so the browser never begins a scroll of its own under the pull
      if (dy > 0 && dy >= Math.abs(dx) && e.cancelable) e.preventDefault();
      if (dy < SLOP) return;
      pulling = true;
      tipShown = false;
      clearTimeout(settleTimer);
      ind.classList.remove('settle', 'done', 'spin', 'armed');
    }
    // the coin is out: the finger moves the coin, not the page
    if (e.cancelable) e.preventDefault();
    if (dy <= SLOP) {
      // all the way back up: the pull is over (no refresh); from here the finger scrolls the page as usual
      unbind();
      y0 = null; pulling = false; armed = false; dist = 0;
      ind.classList.remove('armed');
      tip('');
      cancelAnimationFrame(raf); raf = 0;
      paint(0);
      swallowNextClick();
      return;
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
    tip('');
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
    if (!armed) { tip(''); await springTo(0, 360); return; }
    busy = true;
    try {
      ind.classList.remove('armed');
      disc.style.setProperty('--m0', minA + 'deg');
      disc.style.setProperty('--h0', hourA + 'deg');
      tip('מעדכנים…');
      ind.classList.add('spin');
      await springTo(REST, 380);
      const t0 = Date.now();
      try { await App.refresh(); } catch (e) { console.warn('refresh', e); }
      const left = 650 - (Date.now() - t0);
      if (left > 0) await Fx.sleep(left);
      ind.classList.remove('spin');
      ind.classList.add('done');
      tip(navigator.onLine === false ? 'אין חיבור · מוצג מה שבטלפון' : 'הכל מעודכן ✓');
      Fx.play('pop'); Fx.haptic(10);
      await Fx.sleep(700);
      await springTo(0, 420);
    } finally {
      ind.classList.remove('done', 'spin', 'armed');
      tip('');
      busy = false;
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
