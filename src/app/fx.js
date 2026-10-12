/* ============================================================
 * fx.js — small feedback touches: a pulse, a soft click sound and a
 * light vibration on every tap, and confetti for moments worth it
 * (finishing or adding a shift, a birthday). Each part can be turned
 * off in Settings › Look; motion also follows the system "reduce
 * motion" setting. Sounds are synthesized with Web Audio (no files).
 * ============================================================ */
(function (root) {
  'use strict';
  const Fx = {};
  root.Fx = Fx;
  const prefs = () => (root.Store && root.Store.S.settings && root.Store.S.settings.fx) || {};
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  Fx.motion = () => prefs().effects !== false && !reducedMotion();

  /* ---------------- sound ---------------- */
  let ac = null;
  function audio() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!ac) ac = new AC();
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
    start: [[523, 0, 0.09, 'triangle', 0.06], [784, 0.08, 0.16, 'triangle', 0.06]],
    coin: [[1319, 0, 0.07, 'square', 0.022], [1976, 0.065, 0.24, 'square', 0.022]],
    success: [[523, 0, 0.1, 'triangle', 0.055], [659, 0.08, 0.1, 'triangle', 0.055], [784, 0.16, 0.1, 'triangle', 0.055], [1047, 0.24, 0.28, 'triangle', 0.06]],
  };
  Fx.play = function (name) {
    if (prefs().sound === false) return;
    const notes = SOUNDS[name];
    const c = notes && audio();
    if (!c) return;
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

  /* ---------------- visuals ---------------- */
  Fx.pulse = function (x, y) {
    if (!Fx.motion() || (!x && !y)) return;
    const d = document.createElement('div');
    d.className = 'fx-pulse';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 600);
  };
  const CONFETTI = ['#2ee59d', '#ffb627', '#3d7bff', '#ff5c8a', '#8b6cff'];
  Fx.confetti = function (x, y, count) {
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
    const parts = Array.from({ length: count || 70 }, () => {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 7;
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: CONFETTI[(Math.random() * CONFETTI.length) | 0], rect: Math.random() < 0.6 };
    });
    const t0 = performance.now();
    (function frame(t) {
      const k = (t - t0) / 1400;
      g.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        g.save();
        g.globalAlpha = Math.max(0, 1 - k * k);
        g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.c;
        if (p.rect) g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        else { g.beginPath(); g.arc(0, 0, p.r * 0.7, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
      if (k < 1) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  };

  /* ---------------- moments ---------------- */
  let lastTap = { x: 0, y: 0 };
  Fx.celebrate = function (kind) {
    if (kind === 'big') { Fx.play('success'); Fx.haptic([12, 60, 18]); Fx.confetti(); }
    else if (kind === 'coin') { Fx.play('coin'); Fx.haptic([10, 40, 10]); Fx.confetti(lastTap.x, lastTap.y, 30); }
    else if (kind === 'start') { Fx.play('start'); Fx.haptic(20); }
  };

  /** Body class that turns on the springy press animations in the CSS. */
  Fx.apply = () => { if (document.body) document.body.classList.toggle('fx', Fx.motion()); };

  /* ---------------- every tap ---------------- */
  const TAPPABLE = 'button, a[href], [data-act], .item, .chip, [role="button"], label.switch-row';
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest(TAPPABLE);
    if (!t || t.disabled) return;
    if (t.matches('label.switch-row') || e.target.matches('input, select, textarea')) return; // switches sound on "change"
    lastTap = { x: e.clientX, y: e.clientY };
    Fx.pulse(e.clientX, e.clientY);
    if (t.classList.contains('fab')) { Fx.play('pop'); Fx.haptic(14); }
    else if (t.closest('#nav')) { Fx.play('nav'); Fx.haptic(6); }
    else if (t.classList.contains('danger')) { Fx.play('soft'); Fx.haptic(10); }
    else { Fx.play('tap'); Fx.haptic(6); }
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.matches && el.matches('input[type="checkbox"]')) { Fx.play(el.checked ? 'on' : 'off'); Fx.haptic(8); }
  }, true);
})(typeof window !== 'undefined' ? window : globalThis);
