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
  // notes: [frequency, start (s), duration (s), wave, volume, glide-to frequency]
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
  };
  /** Plays a sound. With {strict: true} it stays silent unless audio is already allowed to play. */
  Fx.play = function (name, opts) {
    if (prefs().sound === false) return;
    const notes = SOUNDS[name];
    const c = notes && audio();
    if (!c || (opts && opts.strict && c.state !== 'running')) return;
    const t0 = c.currentTime + 0.005;
    for (const [f, at, dur, wave, vol, glide] of notes) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = wave || 'sine';
      o.frequency.setValueAtTime(f, t0 + at);
      if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + at + dur);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(c.destination);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.02);
    }
  };

  /* ---------------- vibration ---------------- */
  Fx.haptic = function (pattern) {
    if (prefs().haptic === false) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern || 8); } catch (e) { /* not supported */ }
  };

  /* ---------------- tap ring: hugs the tapped control, from its centre ---------------- */
  Fx.ring = function (el) {
    if (!Fx.motion() || !el || !el.getBoundingClientRect) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const d = document.createElement('div');
    d.className = 'fx-ring';
    d.style.left = r.left + 'px';
    d.style.top = r.top + 'px';
    d.style.width = r.width + 'px';
    d.style.height = r.height + 'px';
    d.style.borderRadius = getComputedStyle(el).borderRadius || '12px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 600);
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
      const k = (t - t0) / 1500;
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
        const k = Math.min(1, (t - t0) / dur);
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
    return document.startViewTransition(update).finished.catch(() => {});
  };

  /** Body class that turns on the springy press animations in the CSS; prefs mirrored for the intro. */
  Fx.apply = () => {
    if (document.body) document.body.classList.toggle('fx', Fx.motion());
    try { localStorage.setItem('fxPrefs', JSON.stringify(prefs())); } catch (e) { /* private mode */ }
  };

  /* ---------------- every tap ---------------- */
  const TAPPABLE = 'button, a[href], [data-act], .item, .chip, [role="button"], label.switch-row';
  const RINGED = '.btn, .chip, .icon-btn, .quick button, .seg > button, .color-pick > button, .font-pick > button, .card-link';
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest(TAPPABLE);
    if (!t || t.disabled) return;
    if (t.matches('label.switch-row') || e.target.matches('input, select, textarea')) return; // switches sound on "change"
    lastTap = { x: e.clientX, y: e.clientY };
    if (t.classList.contains('fab')) { Fx.ring(t); Fx.play('pop'); Fx.haptic(14); }
    else if (t.closest('#nav')) { Fx.ring(t.querySelector('.pill') || t); Fx.play('nav'); Fx.haptic(6); }
    else {
      if (t.matches(RINGED)) Fx.ring(t);
      if (t.classList.contains('danger')) { Fx.play('soft'); Fx.haptic(10); } else { Fx.play('tap'); Fx.haptic(6); }
    }
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.matches && el.matches('input[type="checkbox"]')) { Fx.play(el.checked ? 'on' : 'off'); Fx.haptic(8); }
  }, true);

  Fx.sleep = sleep;
})(typeof window !== 'undefined' ? window : globalThis);
