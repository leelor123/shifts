/* ============================================================
 * sbar.js — the installed app's own scroll indicator (the user, 24 Nov
 * 2026: "add a unique scroll bar for the app"). The app shell hides the
 * browser's bars on a touch screen (styles-v3.css html.app-shell); this
 * draws the one a phone app has: a thin navy thumb that shows while a list
 * moves under the finger (or while the finger rests on it) and fades
 * ~0.7 s after it stops. The website in a browser tab keeps the browser's.
 *
 * Design:
 *  - the edge: inline-end, like Android (its default bar follows the
 *    layout direction): left in Hebrew and Arabic, right in English,
 *    Russian, French, Spanish and Amharic. 3 px wide, 3 px from the edge;
 *  - the length is the share of the list on screen (40 px at least), the
 *    place is how far down it is; it never runs under the status bar, the
 *    bottom bar, the home indicator or a sheet's rounded corner;
 *  - the colour is the app's ink (--brand-strong, navy; light in dark),
 *    46%, with a 1 px ring of the page's own ground, so it reads on the
 *    cream page and on the navy pay card alike; no glow, no gradient;
 *  - not draggable: it lies where the content's own buttons end (the left
 *    edge in Hebrew) and where the phone's back swipe starts, so it never
 *    takes a touch (pointer-events: none, aria-hidden).
 *
 * How: ONE scroll listener on the document (capture: it hears every list
 * that scrolls, the page and each sheet body, drawn now or later), with no
 * code per screen. Only the user's own scrolling shows it (a finger or a
 * wheel in the last 0.6 s): a screen that scrolls itself to the top on a
 * tab change stays still. Each frame reads three numbers and writes one
 * transform (requestAnimationFrame, passive listeners); the fade is a
 * compositor animation of opacity; when gone it is display: none, so no
 * layer stays behind. Reduce motion or the app's effects off: it shows
 * and hides without the fade.
 *
 * Left alone: lists sideways (chips, carousels), short boxes, the picker
 * wheels (pickers.js), the games, the place picker's letter rail
 * (placepicker.js .pp-rail sits on the same edge), [data-no-sbar].
 * ============================================================ */
(function (root) {
  'use strict';
  const Sbar = {};
  root.Sbar = Sbar;
  const MIN = 40; // the shortest thumb (px)
  const W = 3; // its width
  const INSET = 3; // from the edge
  const PAD = 6; // from the ends of a list's box
  const IDLE = 650; // still for this long: it fades
  const INPUT = 600; // a scroll this long after the last touch or wheel is the user's

  /** The thumb for a list: { len, off } in px along a track `track` px long, or null when nothing is hidden. */
  Sbar.geom = function (scrollTop, scrollHeight, clientHeight, track, min) {
    if (min == null) min = MIN;
    const range = scrollHeight - clientHeight;
    if (!(range > 0) || !(clientHeight > 0) || !(track > 0)) return null;
    const len = Math.min(track, Math.max(Math.min(min, track), Math.round(track * clientHeight / scrollHeight)));
    const p = Math.max(0, Math.min(1, scrollTop / range));
    return { len, off: Math.round((track - len) * p * 100) / 100 };
  };
  /** Worth a thumb: a box at least 160 px tall with at least 15% of its list out of sight. */
  Sbar.worth = (scrollHeight, clientHeight) => clientHeight >= 160 && scrollHeight > 0 && clientHeight / scrollHeight <= 0.85;

  if (typeof document === 'undefined') { if (typeof module !== 'undefined') module.exports = Sbar; return; }

  const doc = document;
  const html = doc.documentElement;
  const mq = (q) => (root.matchMedia ? root.matchMedia(q) : null);
  const coarse = mq('(pointer: coarse)');
  const reduced = mq('(prefers-reduced-motion: reduce)');
  const SKIP = '.pk-wheel, .game-sheet .sh-body, [data-no-sbar]';
  Sbar.enabled = true; // tests compare frames with it off
  const live = () => Sbar.enabled && html.classList.contains('app-shell') && !!coarse && coarse.matches;
  const motion = () => !(reduced && reduced.matches) && !(root.Fx && root.Fx.motion && !root.Fx.motion());
  const PAGE = {}; // the key of the page's own scroll
  const states = new WeakMap(); // a list (or PAGE) → its state, or false when it is never ours
  const dirty = new Set();
  let raf = 0, lastInput = -1e9, held = false, probe = null;

  const shown = new Set(); // the thumbs on screen now
  const now = () => (root.performance && performance.now ? performance.now() : Date.now());
  const touched = () => { lastInput = now(); };
  // a finger on the screen keeps a shown thumb (it fades once the finger lifts and the list is still)
  const opts = { capture: true, passive: true };
  doc.addEventListener('touchstart', () => { held = true; touched(); }, opts);
  doc.addEventListener('touchmove', touched, opts);
  const letGo = () => { held = false; touched(); for (const s of shown) arm(s); };
  doc.addEventListener('touchend', letGo, opts);
  doc.addEventListener('touchcancel', letGo, opts);
  doc.addEventListener('wheel', touched, opts);

  function make(page) {
    const t = doc.createElement('div');
    t.className = 'sbar' + (page ? ' pg' : '');
    t.setAttribute('aria-hidden', 'true');
    t.hidden = true;
    const i = doc.createElement('i');
    t.appendChild(i);
    return { track: t, thumb: i, page, len: -1, off: -1, len0: 0, top: NaN, on: false, timer: 0, fade: null };
  }
  // the bottom safe area in px (env() has no number in script): a hidden probe
  function safeB() {
    if (!probe) {
      probe = doc.createElement('div');
      probe.setAttribute('aria-hidden', 'true');
      probe.style.cssText = 'position:fixed;top:0;width:0;height:var(--safe-b,0px);visibility:hidden;pointer-events:none';
      doc.body.appendChild(probe);
    }
    return probe.offsetHeight;
  }
  function stateOf(target) {
    const page = target === doc || target === html || target === doc.body;
    const key = page ? PAGE : target;
    let s = states.get(key);
    if (s !== undefined) return s;
    if (!page) {
      const cs = getComputedStyle(target);
      if (!/(auto|scroll)/.test(cs.overflowY) || (target.matches && target.matches(SKIP))) { states.set(key, false); return false; }
    }
    s = make(page);
    s.el = page ? null : target;
    states.set(key, s);
    return s;
  }
  function metrics(s) {
    if (s.page) { const se = doc.scrollingElement || html; return [se.scrollTop, se.scrollHeight, html.clientHeight]; }
    return [s.el.scrollTop, s.el.scrollHeight, s.el.clientHeight];
  }
  // where the track goes and how long it is, read once as a scroll begins; false when there is no room
  function place(s) {
    const t = s.track;
    if (s.page) {
      if (!t.isConnected) doc.body.appendChild(t);
      const nav = doc.querySelector('.nav');
      const nr = nav && nav.getClientRects().length ? nav.getBoundingClientRect() : null;
      const vh = root.innerHeight || html.clientHeight;
      t.style.bottom = (nr && nr.top < vh ? Math.round(vh - nr.top) + PAD : safeB() + PAD + 2) + 'px';
      t.hidden = false;
      s.len0 = t.clientHeight;
      return s.len0 >= MIN;
    }
    const el = s.el;
    if (!el.isConnected) return false;
    const cs = getComputedStyle(el);
    const fixed = cs.position === 'fixed';
    const host = fixed ? doc.body : el.offsetParent;
    if (!host) return false;
    // the place picker's letter rail stands on the same edge: its sheet keeps the rail alone
    if (host.querySelector(':scope > .pp-rail')) { states.set(el, false); return false; }
    const r = el.getBoundingClientRect();
    if (r.height < 160 || r.width < 40) return false;
    const vh = root.innerHeight || html.clientHeight;
    let top = r.top + PAD, bottom = r.bottom - PAD;
    if (r.bottom >= vh - 1) bottom -= safeB();
    let x0 = 0, y0 = 0;
    if (fixed) {
      t.style.position = 'fixed';
      t.style.zIndex = cs.zIndex === 'auto' ? '1' : cs.zIndex;
    } else {
      const hr = host.getBoundingClientRect();
      x0 = hr.left + host.clientLeft; y0 = hr.top + host.clientTop - host.scrollTop;
      // a box that starts at its sheet's rounded top: the thumb starts below the curve
      const rad = parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0;
      if (rad && r.top - hr.top < rad) top = Math.max(top, hr.top + rad * 0.7);
    }
    const rtl = cs.direction === 'rtl';
    t.style.left = Math.round((rtl ? r.left + INSET : r.right - INSET - W) - x0) + 'px';
    t.style.top = Math.round(top - y0) + 'px';
    const len = Math.round(bottom - top);
    if (len < MIN) return false;
    t.style.height = len + 'px';
    if (!t.isConnected || t.parentNode !== host) host.insertBefore(t, host.firstChild);
    s.len0 = len;
    return true;
  }
  function show(s) {
    s.track.hidden = false;
    s.on = true;
    shown.add(s);
    if (s.fade) {
      // back while fading out: on from where it stands
      const o = parseFloat(getComputedStyle(s.thumb).opacity);
      s.fade.cancel(); s.fade = null;
      if (motion() && o < 1 && s.thumb.animate) s.thumb.animate([{ opacity: o }, { opacity: 1 }], { duration: 120, easing: 'cubic-bezier(.23, 1, .32, 1)' });
      return;
    }
    if (motion() && s.thumb.animate) s.thumb.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'cubic-bezier(.23, 1, .32, 1)' });
  }
  function hide(s) {
    clearTimeout(s.timer);
    s.on = false;
    shown.delete(s);
    s.len = -1; // measured again next time
    const done = () => { if (s.fade) { s.fade.cancel(); s.fade = null; } if (!s.on) s.track.hidden = true; };
    if (!motion() || !s.thumb.animate || !s.track.isConnected) { done(); return; }
    s.fade = s.thumb.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.32, .72, 0, 1)', fill: 'forwards' });
    s.fade.onfinish = done;
  }
  // it fades once the list has been still for IDLE and no finger rests on the screen
  function arm(s) {
    clearTimeout(s.timer);
    s.timer = setTimeout(() => { if (held) return; hide(s); }, IDLE);
  }
  function paint(s) {
    const [top, sh, ch] = metrics(s);
    const moved = top !== s.top;
    s.top = top;
    if (!s.on) {
      // only the user's own vertical scroll brings it (a tab change scrolling to the top does not)
      if (!moved || !live() || now() - lastInput > INPUT || !Sbar.worth(sh, ch)) return;
      if (!place(s)) { s.track.hidden = true; return; }
      show(s);
    } else if (!s.track.isConnected) { hide(s); return; }
    const g = Sbar.geom(top, sh, ch, s.len0);
    if (!g) { hide(s); return; }
    if (g.len !== s.len) { s.len = g.len; s.thumb.style.height = g.len + 'px'; }
    if (g.off !== s.off) { s.off = g.off; s.thumb.style.transform = 'translateY(' + g.off + 'px)'; }
    if (moved || held) arm(s);
  }
  function frame() {
    raf = 0;
    for (const s of dirty) paint(s);
    dirty.clear();
  }
  function onScroll(e) {
    const s = stateOf(e.target);
    if (!s) return;
    if (!s.on && !live()) return;
    dirty.add(s);
    if (!raf) raf = requestAnimationFrame(frame);
  }
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  // tests and the app: is a list's thumb showing (the page: no argument)
  Sbar.showing = (el) => { const s = states.get(el || PAGE); return !!(s && s.on); };
  Sbar.hideAll = () => { for (const s of [...shown]) hide(s); };
})(typeof window !== 'undefined' ? window : globalThis);
