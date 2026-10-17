/* ============================================================
 * fx.js — small feedback touches: a ring that hugs the button you
 * tapped, a soft click and a light vibration; coins and confetti for
 * money moments; numbers that count up; a shake for wrong input; a
 * circular reveal when the theme changes. Each part can be turned off
 * in Settings › Look; motion also follows the system "reduce motion"
 * setting. Sounds are synthesized with Web Audio (no files).
 * ============================================================ */
(function (root) {
  'use strict';
  const Fx = {};
  root.Fx = Fx;
  // the choices are mirrored in localStorage so the opening animation can read them before the data loads
  const prefs = () => {
    const s = root.Store && root.Store.S.settings && root.Store.S.settings.fx;
    if (s) return s;
    try { return JSON.parse(localStorage.getItem('fxPrefs')) || {}; } catch (e) { return {}; }
  };
  Fx.prefs = prefs;
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  Fx.motion = () => prefs().effects !== false && !reducedMotion();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- sound ---------------- */
  let ac = null;
  function audio() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!ac) { try { ac = new AC(); } catch (e) { return null; } }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  // notes: [frequency, start (s), duration (s), wave, volume, glide-to frequency]. The wave 'noise' is a
  // burst of filtered noise (a swish, a thud): its frequency is the filter's centre, and glides like a tone.
  const SOUNDS = {
    tap: [[1250, 0, 0.035, 'sine', 0.05, 900]],
    nav: [[740, 0, 0.05, 'triangle', 0.045, 980]],
    pop: [[520, 0, 0.09, 'sine', 0.08, 1100]],
    on: [[660, 0, 0.05, 'triangle', 0.05], [990, 0.045, 0.07, 'triangle', 0.05]],
    off: [[880, 0, 0.05, 'triangle', 0.05], [560, 0.045, 0.07, 'triangle', 0.045]],
    soft: [[330, 0, 0.08, 'sine', 0.06, 220]],
    tick: [[1600, 0, 0.025, 'square', 0.02]],
    error: [[220, 0, 0.09, 'sawtooth', 0.035, 180], [196, 0.1, 0.12, 'sawtooth', 0.035, 150]],
    start: [[523, 0, 0.09, 'triangle', 0.06], [784, 0.08, 0.16, 'triangle', 0.06]],
    coin: [[1319, 0, 0.07, 'square', 0.022], [1976, 0.065, 0.24, 'square', 0.022]],
    success: [[523, 0, 0.1, 'triangle', 0.055], [659, 0.08, 0.1, 'triangle', 0.055], [784, 0.16, 0.1, 'triangle', 0.055], [1047, 0.24, 0.28, 'triangle', 0.06]],
    intro: [[392, 0, 0.18, 'sine', 0.05, 523], [587, 0.16, 0.2, 'sine', 0.05, 659], [784, 0.36, 0.34, 'triangle', 0.045]],
    whoosh: [[300, 0, 0.22, 'sine', 0.03, 900]],
    // the games
    ding: [[1047, 0, 0.08, 'triangle', 0.06], [1568, 0.06, 0.22, 'sine', 0.05]], // a right answer (its pitch climbs with the streak)
    bonk: [[233, 0, 0.1, 'square', 0.028, 147], [147, 0.08, 0.22, 'triangle', 0.07, 98]], // a wrong one
    flip: [[2200, 0, 0.09, 'noise', 0.05, 5200]], // a card turns over
    match: [[1319, 0, 0.07, 'triangle', 0.05], [1760, 0.06, 0.07, 'triangle', 0.05], [2637, 0.12, 0.26, 'sine', 0.045]],
    star: [[1568, 0, 0.1, 'triangle', 0.055], [2349, 0.05, 0.32, 'sine', 0.045]],
    combo: [[784, 0, 0.07, 'triangle', 0.05], [988, 0.06, 0.07, 'triangle', 0.05], [1175, 0.12, 0.07, 'triangle', 0.05], [1568, 0.18, 0.3, 'triangle', 0.055]],
    fanfare: [[523, 0, 0.11, 'square', 0.028], [523, 0.12, 0.07, 'square', 0.028], [659, 0.2, 0.1, 'square', 0.028], [784, 0.3, 0.5, 'square', 0.032], [392, 0.3, 0.5, 'triangle', 0.05], [1047, 0.3, 0.5, 'triangle', 0.03]],
    boom: [[900, 0, 0.34, 'noise', 0.13, 140], [120, 0, 0.3, 'sine', 0.11, 40]], // a fine hits the wallet
    stamp: [[1800, 0, 0.05, 'noise', 0.07, 600], [180, 0, 0.12, 'sine', 0.09, 90]], // the verdict lands
    swish: [[700, 0, 0.16, 'noise', 0.035, 2600]], // a banner flies in
    alarm: [[1320, 0, 0.05, 'square', 0.022], [1320, 0.09, 0.05, 'square', 0.022]], // the last seconds
    // a shift
    shiftStart: [[1400, 0, 0.26, 'noise', 0.03, 4200], [392, 0, 0.09, 'triangle', 0.05], [587, 0.07, 0.09, 'triangle', 0.05], [784, 0.14, 0.12, 'triangle', 0.055], [1175, 0.21, 0.3, 'sine', 0.045]], // power up
    cash: [[3200, 0, 0.05, 'noise', 0.06, 1600], [1568, 0.03, 0.1, 'square', 0.026], [2093, 0.09, 0.4, 'triangle', 0.05], [2637, 0.09, 0.4, 'sine', 0.03]], // ka-ching
    pause: [[660, 0, 0.09, 'sine', 0.05, 440], [440, 0.08, 0.16, 'sine', 0.05, 330]],
    resume: [[440, 0, 0.08, 'sine', 0.05, 660], [660, 0.07, 0.16, 'sine', 0.05, 880]],
  };
  Fx.audio = audio; // shared with the games' music (music.js)
  let noiseBuf = null;
  const noise = (c) => {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, Math.round(c.sampleRate * 0.6), c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  };
  /** Plays a sound. With {strict: true} it stays silent unless audio is already allowed to play; {pitch: 1.5}
   * plays it higher (a streak climbs a scale). */
  Fx.play = function (name, opts) {
    if (prefs().sound === false) return;
    const notes = SOUNDS[name];
    const c = notes && audio();
    if (!c || (opts && opts.strict && c.state !== 'running')) return;
    const k = (opts && opts.pitch) || 1;
    const t0 = c.currentTime + 0.005;
    for (const [f0, at, dur, wave, vol, glide0] of notes) {
      const f = f0 * k, glide = glide0 && glide0 * k;
      const g = c.createGain();
      let src;
      if (wave === 'noise') {
        src = c.createBufferSource();
        src.buffer = noise(c);
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 1.1;
        bp.frequency.setValueAtTime(f, t0 + at);
        if (glide) bp.frequency.exponentialRampToValueAtTime(glide, t0 + at + dur);
        src.connect(bp).connect(g);
      } else {
        src = c.createOscillator();
        src.type = wave || 'sine';
        src.frequency.setValueAtTime(f, t0 + at);
        if (glide) src.frequency.exponentialRampToValueAtTime(glide, t0 + at + dur);
        src.connect(g);
      }
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      g.connect(c.destination);
      src.start(t0 + at);
      src.stop(t0 + at + dur + 0.02);
    }
  };
  /** A step up a cheerful scale (a major pentatonic), for streaks: 0 → 1, 1 → 1.12, … up to about 2.5 (step 7). */
  Fx.step = (n) => { const S = [0, 2, 4, 7, 9]; const i = Math.max(0, Math.min(n | 0, 7)); return Math.pow(2, (S[i % 5] + 12 * Math.floor(i / 5)) / 12); };

  /* ---------------- vibration ---------------- */
  Fx.haptic = function (pattern) {
    if (prefs().haptic === false) return;
    // before the first tap the browser refuses (and logs a warning), so don't ask
    const act = navigator.userActivation;
    try { if (navigator.vibrate && (!act || act.hasBeenActive)) navigator.vibrate(pattern || 8); } catch (e) { /* not supported */ }
  };

  /* ---------------- tap ring: hugs the tapped control, from its centre ---------------- */
  // The ring is drawn above everything, at the control's place. Details that matter:
  //  - it starts three frames later, once the tap has done its work (the press itself shows at once): if
  //    by then the control is gone (a new screen), covered (a sheet or a dialog opened over it), leaving
  //    (its sheet closing), moving (a shake) or only partly on screen, there is no ring at all, so it
  //    never shows for a frame over whatever came next;
  //  - a control drawn again in the same place (a tab bar re-rendered by its own tap) keeps its ring;
  //  - the control shrinks on the press and springs back: its centre stays put, so the ring follows its
  //    size and hugs it all the way (comparing its edges, as before 1.16.2, took every shrinking control
  //    for a moving one and dropped the ring after a single frame - most taps had no ring);
  //  - if the control moves away, leaves (its sheet sliding down) or gets covered while the ring plays,
  //    the ring goes at once: even a short fade left it floating over the moving sheet.
  const LAYERS = '.sheet, .dialog, .story, #lock, .coach';
  const hits = (el, x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
  // the centre and the middle of each edge are the control's own (a pill's corners are not)
  const inView = (el, r) => {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return hits(el, cx, cy) && hits(el, r.left + 2, cy) && hits(el, r.right - 2, cy) && hits(el, cx, r.top + 2) && hits(el, cx, r.bottom - 2);
  };
  Fx.ring = function (el) {
    if (!Fx.motion() || !el || !el.getBoundingClientRect) return;
    const r0 = el.getBoundingClientRect();
    if (!r0.width || !r0.height) return;
    // a whole screen-sized area (a story page) gets no ring
    if (r0.width * r0.height > root.innerWidth * root.innerHeight * 0.45) return;
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const sig = (n) => n.tagName + '|' + (n.getAttribute('data-act') || '') + '|' + (n.getAttribute('data-tab') || '') + '|' + (n.getAttribute('data-s') || '');
    const sig0 = sig(el);
    const layersBefore = new Set(document.querySelectorAll(LAYERS));
    let target = el, d = null, t0 = 0, gone = false, calm = 0;
    const current = () => {
      if (target.isConnected) return target;
      for (let n = document.elementFromPoint(cx, cy); n && n !== document.body; n = n.parentElement) if (sig(n) === sig0) return n;
      return null;
    };
    const step = () => {
      if (gone) return;
      target = current();
      const r = target && target.getBoundingClientRect();
      const ok = r && r.width > 0
        && Math.abs(r.left + r.width / 2 - cx) <= 1.5 && Math.abs(r.top + r.height / 2 - cy) <= 1.5
        && Math.abs(r.width - r0.width) < r0.width * 0.2
        && !target.closest('.dialog.out, .sheet:not(.show), .story.out')
        && ![...document.querySelectorAll(LAYERS)].some((l) => !layersBefore.has(l) && !l.contains(target))
        && (d ? hits(target, cx, cy) : inView(target, r));
      if (!ok) { if (d) { gone = true; d.remove(); } return; }
      // three calm frames first (~50ms): a tap that redraws or shakes its control shows that, not a ring
      // that would be gone again a frame later
      if (!d && ++calm < 3) { requestAnimationFrame(step); return; }
      if (!d) {
        d = document.createElement('div');
        d.className = 'fx-ring';
        d.style.borderRadius = getComputedStyle(target).borderRadius || '12px';
        document.body.appendChild(d);
        t0 = performance.now();
      }
      d.style.left = r.left + 'px';
      d.style.top = r.top + 'px';
      d.style.width = r.width + 'px';
      d.style.height = r.height + 'px';
      if (performance.now() - t0 < 560) requestAnimationFrame(step); else { gone = true; d.remove(); }
    };
    requestAnimationFrame(step);
  };

  /* ---------------- particles: confetti and ₪ coins ---------------- */
  const CONFETTI = ['#2ee59d', '#ffb524', '#3d7bff', '#ff5c8a', '#8b6cff'];
  function burst(x, y, count, kind) {
    if (!Fx.motion()) return;
    const W = root.innerWidth, H = root.innerHeight;
    if (x == null || (!x && !y)) { x = W / 2; y = H * 0.38; }
    const cv = document.createElement('canvas');
    cv.className = 'fx-canvas';
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    document.body.appendChild(cv);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const parts = Array.from({ length: count }, (_, i) => {
      const coin = kind === 'coins' || (kind === 'mix' && i % 3 === 0);
      const a = coin ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2;
      const v = coin ? 7 + Math.random() * 6 : 4 + Math.random() * 7;
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (coin ? 3 : 6), r: coin ? 9 + Math.random() * 3 : 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * (coin ? 0.25 : 0.4), c: CONFETTI[(Math.random() * CONFETTI.length) | 0], coin, rect: Math.random() < 0.6 };
    });
    const t0 = performance.now();
    (function frame(t) {
      const k = Math.max(0, (t - t0) / 1500); // (a frame's time can be a little before t0)
      g.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += p.coin ? 0.42 : 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        g.save();
        g.globalAlpha = Math.max(0, 1 - k * k);
        g.translate(p.x, p.y);
        if (p.coin) {
          g.scale(Math.abs(Math.cos(p.rot)) * 0.85 + 0.15, 1); // spinning coin
          const grd = g.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 1, 0, 0, p.r);
          grd.addColorStop(0, '#ffe08a'); grd.addColorStop(0.7, '#ffb524'); grd.addColorStop(1, '#d68a00');
          g.fillStyle = grd; g.beginPath(); g.arc(0, 0, p.r, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#b87300'; g.lineWidth = 1.2; g.stroke();
          g.fillStyle = '#8a5300'; g.font = `800 ${Math.round(p.r * 1.15)}px Rubik, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('₪', 0, 1);
        } else {
          g.rotate(p.rot); g.fillStyle = p.c;
          if (p.rect) g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
          else { g.beginPath(); g.arc(0, 0, p.r * 0.7, 0, Math.PI * 2); g.fill(); }
        }
        g.restore();
      }
      if (k < 1) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }
  Fx.confetti = (x, y, n) => burst(x, y, n || 70, 'confetti');
  Fx.coins = (x, y, n) => burst(x, y, n || 14, 'coins');

  /** A single small coin that pops up from an element (live earnings). */
  Fx.coinPop = function (el) {
    if (!Fx.motion() || !el) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const c = document.createElement('div');
    c.className = 'fx-coin';
    c.textContent = '₪';
    c.style.left = (r.left + r.width / 2) + 'px';
    c.style.top = r.top + 'px';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1000);
  };

  /* ---------------- moments ---------------- */
  let lastTap = { x: 0, y: 0 };
  Fx.celebrate = function (kind) {
    if (kind === 'big') { Fx.play('success'); Fx.haptic([12, 60, 18]); burst(null, null, 80, 'mix'); }
    else if (kind === 'money') { Fx.play('coin'); setTimeout(() => Fx.play('success'), 180); Fx.haptic([10, 40, 10, 40, 16]); burst(null, null, 60, 'mix'); }
    else if (kind === 'coin') { Fx.play('coin'); Fx.haptic([10, 40, 10]); burst(lastTap.x, lastTap.y, 16, 'coins'); }
    else if (kind === 'start') { Fx.play('start'); Fx.haptic(20); }
  };

  /** Wrong input: the open sheet (or dialog) shakes, with a short buzz. */
  Fx.nope = function () {
    Fx.play('error');
    Fx.haptic([30, 40, 30]);
    if (!Fx.motion()) return;
    const sheets = document.querySelectorAll('.dialog .box, .sheet.show');
    const el = sheets[sheets.length - 1];
    if (!el) return;
    el.classList.remove('fx-shake'); void el.offsetWidth; el.classList.add('fx-shake');
    setTimeout(() => el.classList.remove('fx-shake'), 500);
  };

  /** The number shown in an element, as a value (₪ 1,234 → 1234), or null. */
  Fx.shownNumber = function (el) {
    const m = (el.textContent || '').match(/[\d,]+(\.\d+)?/);
    return m ? parseFloat(m[0].replace(/,/g, '')) : null;
  };
  /** Counts the number shown in an element from one value to its present one, keeping the text around it
   * (₪, direction marks). It ends on the exact text that was there, so the format never drifts. */
  Fx.tween = function (el, from, ms) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && !/\d/.test(node.nodeValue));
    if (!node || !Fx.motion()) return;
    const final = node.nodeValue;
    const m = final.match(/[\d,]+(\.\d+)?/);
    const to = parseFloat(m[0].replace(/,/g, ''));
    if (!(Math.abs(to - from) > 0)) return;
    const dec = m[1] ? m[1].length - 1 : 0;
    const group = m[0].includes(',') || Math.max(from, to) >= 1000;
    const pre = final.slice(0, m.index), post = final.slice(m.index + m[0].length);
    const fmt = (v) => (group ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
    const t0 = performance.now();
    node.nodeValue = pre + fmt(from) + post;
    (function step(t) {
      if (!node.isConnected) return;
      // a frame's timestamp is when the frame began, which can be a little before t0: never below 0, or the
      // number would step the wrong way for a frame
      const k = Math.max(0, Math.min(1, (t - t0) / ms));
      if (k >= 1) { node.nodeValue = final; return; }
      node.nodeValue = pre + fmt(from + (to - from) * (1 - Math.pow(1 - k, 3))) + post;
      requestAnimationFrame(step);
    })(t0);
  };

  /** Numbers that count up to their new value (money totals). */
  const counted = new Map();
  Fx.countUps = function (container, key, fresh) {
    container.querySelectorAll('.hero-num').forEach((el, i) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode()) && !/\d/.test(node.nodeValue));
      if (!node) return;
      const m = node.nodeValue.match(/-?[\d,]+(\.\d+)?/);
      if (!m) return;
      const to = parseFloat(m[0].replace(/,/g, ''));
      const dec = m[1] ? m[1].length - 1 : 0;
      const id = key + ':' + i;
      const prev = counted.get(id);
      counted.set(id, to);
      const from = fresh && prev == null ? 0 : prev;
      if (from == null || from === to || !Fx.motion()) return;
      const before = node.nodeValue.slice(0, m.index), after = node.nodeValue.slice(m.index + m[0].length);
      const fmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const t0 = performance.now(), dur = from === 0 ? 900 : 600;
      (function step(t) {
        const k = Math.max(0, Math.min(1, (t - t0) / dur)); // never below 0 (a count from 0 showed "-12" for a frame)
        const e = 1 - Math.pow(1 - k, 3);
        node.nodeValue = before + fmt(from + (to - from) * e) + after;
        if (k < 1 && node.isConnected) requestAnimationFrame(step);
      })(t0);
    });
  };

  /** Theme / colour change spreading as a circle from the finger (View Transitions). */
  Fx.reveal = function (x, y, update) {
    if (!document.startViewTransition || !Fx.motion()) return Promise.resolve(update());
    const de = document.documentElement;
    de.style.setProperty('--vt-x', (x || root.innerWidth / 2) + 'px');
    de.style.setProperty('--vt-y', (y || root.innerHeight / 2) + 'px');
    Fx.play('whoosh');
    de.classList.add('vt-reveal');
    return document.startViewTransition(update).finished.catch(() => {}).then(() => de.classList.remove('vt-reveal'));
  };

  /** Body class that turns on the springy press animations in the CSS; prefs mirrored for the intro. */
  Fx.apply = () => {
    if (document.body) document.body.classList.toggle('fx', Fx.motion());
    try { localStorage.setItem('fxPrefs', JSON.stringify(prefs())); } catch (e) { /* private mode */ }
  };

  /* ---------------- every tap ---------------- */
  const TAPPABLE = 'button, a[href], [data-act], .item, .chip, [role="button"], [role="tab"], label.switch-row, summary';
  // every control gets the ring, except the games' own pieces: the board, the answers, the cards and the
  // big yes/no buttons answer with their own sparks and glows (a ring on top of them was one effect too many)
  const UNRINGED = '.cg-stage *, .qz-opt, .pr-card, .tf-btns .btn';
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest(TAPPABLE);
    if (!t || t.disabled) return;
    if (t.matches('label.switch-row') || e.target.matches('input, select, textarea')) return; // switches sound on "change"
    lastTap = { x: e.clientX, y: e.clientY };
    if (t.classList.contains('fab')) { Fx.ring(t); Fx.play('pop'); Fx.haptic(14); }
    else if (t.closest('#nav')) { Fx.ring(t.querySelector('.pill') || t); Fx.play('nav'); Fx.haptic(6); }
    else {
      if (!t.matches(UNRINGED)) Fx.ring(t);
      if (t.classList.contains('danger')) { Fx.play('soft'); Fx.haptic(10); } else { Fx.play('tap'); Fx.haptic(6); }
    }
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.matches && el.matches('input[type="checkbox"]')) {
      Fx.play(el.checked ? 'on' : 'off'); Fx.haptic(8);
      const row = el.closest('label.switch-row');
      if (row) Fx.ring(row); // its switch slides, and the row answers like every other control
    }
  }, true);

  Fx.sleep = sleep;
})(typeof window !== 'undefined' ? window : globalThis);
