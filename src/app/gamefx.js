/* ============================================================
 * gamefx.js — what makes the games feel alive: sparks, confetti,
 * coins and shock rings where something happened, score pop-ups,
 * a green or red glow at the screen's edges for a right or a wrong
 * answer, combo banners ("🔥 5 ברצף!"), numbers that count up with
 * ticks, and stars at the end of a round. Sounds come from Fx.
 *
 * Details that matter:
 *  - one canvas per game, made with the game's sheet and gone with
 *    it: a layer made or dropped in the middle of an animation
 *    flickered on the phone. Its loop runs only while something is
 *    moving; then the canvas is cleared once and left alone;
 *  - it lives inside the sheet and draws in the sheet's coordinates,
 *    so whatever is still flying slides away with the sheet;
 *  - the glow and the banner are two elements made with the canvas,
 *    animated with opacity and transform only;
 *  - with motion off (Settings › Look, or the system's "reduce
 *    motion") nothing flies or glows; the sounds and the numbers
 *    still tell what happened.
 * ============================================================ */
(function (root) {
  'use strict';
  const GameFx = {};
  root.GameFx = GameFx;
  const Fx = () => root.Fx;
  const motion = () => !!(Fx() && Fx().motion());
  const play = (s, o) => { if (Fx()) Fx().play(s, o); };
  const FONT = (px) => `700 ${px}px Fredoka, Rubik, system-ui, sans-serif`;
  const PAL = {
    gold: ['#ffd84d', '#ffb524', '#fff1b8', '#ff9f1a'],
    good: ['#21d47f', '#7cf5c4', '#ffd84d', '#3d7bff'],
    party: ['#2ee59d', '#ffb524', '#3d7bff', '#ff5c8a', '#8b6cff', '#22d3ee'],
    bad: ['#ff4d5e', '#ff8a3d', '#ffd166', '#c81e2d'],
    brand: ['#8b5cf6', '#c084fc', '#f0abfc', '#ffd84d'],
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (l) => l[(Math.random() * l.length) | 0];

  /** The effects of one game sheet: { burst, ring, text, glow, banner, at, close }. */
  GameFx.attach = function (sheet) {
    const cv = document.createElement('canvas');
    cv.className = 'gfx-canvas';
    const glowEl = document.createElement('div');
    glowEl.className = 'gfx-glow';
    const bannerEl = document.createElement('div');
    bannerEl.className = 'gfx-banner';
    for (const e of [cv, glowEl, bannerEl]) e.setAttribute('aria-hidden', 'true');
    sheet.append(glowEl, bannerEl, cv);
    const g = cv.getContext('2d');
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    let W = 0, H = 0, raf = 0, last = 0, open = true, dirty = false;
    const parts = [];
    function size() {
      W = sheet.clientWidth; H = sheet.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      dirty = true;
    }
    size();
    const ro = new ResizeObserver(() => { size(); if (!raf) draw(); });
    ro.observe(sheet);
    const local = (x, y) => { const r = sheet.getBoundingClientRect(); return [x - r.left, y - r.top]; };
    /** The centre of an element, in screen coordinates. */
    const at = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

    function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function frame(now) {
      raf = 0;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.t += dt;
        if (p.t >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        if (p.kind === 'text') { p.y -= p.rise * dt * (1 - p.t / p.life); continue; }
        if (p.kind === 'ring') continue;
        p.vy += p.grav * dt;
        const d = Math.pow(p.drag, dt * 60);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      }
      draw();
      if (parts.length) raf = requestAnimationFrame(frame);
    }
    function star(r) {
      g.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.38 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill();
    }
    function draw() {
      if (!parts.length && !dirty) return;
      dirty = parts.length > 0;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      for (const p of parts) {
        const k = p.t / p.life;
        g.save();
        g.translate(p.x, p.y);
        if (p.kind === 'text') {
          g.globalAlpha = Math.min(1, (1 - k) * 3) * Math.min(1, p.t * 12);
          const s = 1 + 0.35 * Math.max(0, 1 - p.t * 7); // pops in a little big
          g.scale(s, s);
          g.font = FONT(p.size); g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineJoin = 'round'; g.lineWidth = Math.max(3, p.size / 5); g.strokeStyle = p.stroke; g.strokeText(p.str, 0, 0);
          g.fillStyle = p.color; g.fillText(p.str, 0, 0);
        } else if (p.kind === 'ring') {
          const e = 1 - Math.pow(1 - k, 3);
          g.globalAlpha = 1 - k;
          g.strokeStyle = p.color; g.lineWidth = p.width * (1 - k) + 0.5;
          g.beginPath(); g.arc(0, 0, p.r0 + (p.r1 - p.r0) * e, 0, Math.PI * 2); g.stroke();
        } else {
          g.globalAlpha = Math.max(0, 1 - k * k);
          g.fillStyle = p.color;
          if (p.kind === 'spark') {
            const sp = Math.hypot(p.vx, p.vy), len = Math.min(16, 3 + sp * 0.02);
            g.rotate(Math.atan2(p.vy, p.vx));
            g.strokeStyle = p.color; g.lineWidth = p.r; g.lineCap = 'round';
            g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, 0); g.stroke();
          } else if (p.kind === 'star') {
            g.rotate(p.rot); star(p.r * (1 - k * 0.5));
          } else if (p.kind === 'coin') {
            g.scale(Math.abs(Math.cos(p.rot)) * 0.85 + 0.15, 1);
            g.fillStyle = '#ffb524'; g.beginPath(); g.arc(0, 0, p.r, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(-p.r * 0.2, -p.r * 0.2, p.r * 0.55, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#8a5300'; g.font = `800 ${Math.round(p.r * 1.2)}px Rubik, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('₪', 0, 1);
          } else { // confetti
            g.rotate(p.rot); g.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2);
            g.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
          }
        }
        g.restore();
      }
      g.globalAlpha = 1;
    }

    const api = {
      at,
      /** Sparks, confetti, stars or coins flying out from a point (screen coordinates). */
      burst(x, y, o) {
        if (!open || !motion()) return;
        o = o || {};
        const [lx, ly] = local(x, y);
        const pal = PAL[o.palette || 'party'];
        const kinds = o.kinds || ['spark', 'confetti', 'star'];
        const n = o.n || 22;
        for (let i = 0; i < n; i++) {
          const kind = kinds[i % kinds.length];
          const a = (o.dir != null ? o.dir : -Math.PI / 2) + (Math.random() - 0.5) * (o.spread != null ? o.spread : Math.PI * 2);
          const v = rnd(o.speed ? o.speed[0] : 180, o.speed ? o.speed[1] : 520) * (kind === 'spark' ? 1.3 : 1);
          parts.push({
            kind, x: lx, y: ly, t: 0, life: rnd(0.55, 1.05) * (o.life || 1),
            vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up || 0), grav: kind === 'spark' ? 520 : kind === 'coin' ? 1300 : 900,
            drag: kind === 'spark' ? 0.9 : 0.96, rot: Math.random() * 6, vr: rnd(-9, 9),
            r: kind === 'spark' ? rnd(2, 3.5) : kind === 'coin' ? rnd(8, 11) : kind === 'star' ? rnd(5, 9) : rnd(3.5, 6),
            color: pick(pal),
          });
        }
        kick();
      },
      /** A shock ring that spreads from a point. */
      ring(x, y, o) {
        if (!open || !motion()) return;
        o = o || {};
        const [lx, ly] = local(x, y);
        parts.push({ kind: 'ring', x: lx, y: ly, t: 0, life: o.life || 0.5, r0: o.r0 || 8, r1: o.r1 || 90, width: o.width || 7, color: o.color || '#ffd84d' });
        kick();
      },
      /** A short text that pops up and floats away ("+15"). */
      text(x, y, str, o) {
        if (!open || !motion()) return;
        o = o || {};
        const [lx, ly] = local(x, y);
        parts.push({ kind: 'text', x: lx, y: ly, t: 0, life: o.life || 0.95, str, size: o.size || 26, rise: o.rise || 90, color: o.color || '#ffb524', stroke: o.stroke || 'rgba(40, 20, 0, .55)' });
        kick();
      },
      /** The screen's edges glow for a moment: 'good' (green) or 'bad' (red). (Web Animations: restarting a
       * CSS animation needs a forced layout, which cost a frame on a slow phone at the moment of the answer.) */
      glow(kind) {
        if (!open || !motion()) return;
        glowEl.className = 'gfx-glow ' + kind;
        glowEl.getAnimations().forEach((a) => a.cancel());
        glowEl.animate([{ opacity: 0 }, { opacity: 1, offset: 0.16 }, { opacity: 0 }], { duration: 620, easing: 'ease-out' });
      },
      /** A banner that flies in and out over the game ("🔥 5 ברצף!"). */
      banner(str) {
        if (!open) return;
        play('combo');
        if (!motion()) return;
        bannerEl.textContent = str;
        bannerEl.getAnimations().forEach((a) => a.cancel());
        const at = (s, r, y, o) => ({ opacity: o, transform: `translate(-50%, ${y}%) scale(${s}) rotate(${r}deg)` });
        // each step has its own easing (an overshooting curve over the whole would overshoot the last step too)
        bannerEl.animate([
          { ...at(0.3, -10, -50, 0), easing: 'cubic-bezier(.2, .9, .3, 1.3)' },
          { ...at(1.14, 3, -50, 1), offset: 0.16, easing: 'ease-out' },
          { ...at(1, 0, -50, 1), offset: 0.28 },
          { ...at(1, 0, -50, 1), offset: 0.76, easing: 'ease-in' },
          at(0.92, 0, -95, 0),
        ], { duration: 1300, fill: 'both' });
      },
      /** The game closes: nothing new starts; what is in the air finishes and the loop ends by itself. */
      close() { open = false; ro.disconnect(); },
    };
    return api;
  };

  /** Counts the first number in an element up from 0 (ticks as it goes). Resolves when done. */
  GameFx.countUp = function (el, o) {
    o = o || {};
    return new Promise((resolve) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode()) && !/\d/.test(node.nodeValue));
      if (!node) { resolve(); return; }
      const m = node.nodeValue.match(/[\d,]+(\.\d+)?/);
      const to = parseFloat(m[0].replace(/,/g, ''));
      if (!motion() || !(to > 0)) { resolve(); return; }
      const dec = m[1] ? m[1].length - 1 : 0, comma = m[0].includes(',');
      const before = node.nodeValue.slice(0, m.index), after = node.nodeValue.slice(m.index + m[0].length);
      const fmt = (v) => (comma ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
      const dur = o.ms || Math.min(1100, 450 + to * 4);
      const t0 = performance.now();
      let lastTick = 0;
      node.nodeValue = before + fmt(0) + after;
      (function step(t) {
        if (!node.isConnected) { resolve(); return; }
        const k = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - k, 3);
        node.nodeValue = before + fmt(dec ? to * e : Math.round(to * e)) + after;
        if (t - lastTick > 70 && k < 1) { lastTick = t; play('tick', { pitch: 0.7 + k * 0.8 }); }
        if (k < 1) requestAnimationFrame(step); else resolve();
      })(t0);
    });
  };

  /** Lights the first n of the stars in a row, one after another, each with a ding and a sparkle. */
  GameFx.stars = function (row, n, fx) {
    const list = [...row.querySelectorAll('i')];
    list.forEach((s, i) => {
      if (i >= n) return;
      setTimeout(() => {
        if (!s.isConnected) return;
        s.classList.add('on');
        play('star', { pitch: Fx() ? Fx().step(i * 2) : 1 });
        if (fx) { const [x, y] = fx.at(s); fx.burst(x, y, { n: 12, palette: 'gold', kinds: ['star', 'spark'], speed: [120, 300] }); }
      }, motion() ? 120 + i * 300 : 0);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
