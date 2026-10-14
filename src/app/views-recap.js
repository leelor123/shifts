/* ============================================================
 * views-recap.js — "הסיכום החודשי": last month at work as a short
 * story of full-screen cards (earned, hours, best day, extras, a fun
 * comparison), like the stories people know from social apps.
 *
 * Tap the left side (or swipe left) for the next card, the right side
 * for the previous one, hold to pause; the Android back button and
 * Escape close it. Each card waits ~5s, then moves on by itself
 * (not with reduced motion: then it waits for a tap). The last card
 * can share an image of the month. Content: core/recap.js.
 * A card on the home screen offers it during the first two weeks of
 * a new pay period; reports offer it for any month with work.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Store, UI, App, Recap } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const Fx = () => root.Fx;
  const money0 = (v) => U.money(v, 0);
  const DUR = 5200;
  const BG = ['grad-a', 'grad-b', 'grad-c', 'grad-d', 'grad-e'];
  const reduced = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function dataFor(pk) {
    const emp = S.employers[0];
    const t = Engine.periodSummary(App.model, pk, emp.id);
    const ppk = U.addMonthKey(pk, -1);
    const prev = Engine.periodSummary(App.model, ppk, emp.id);
    return Recap.build(t, prev, {
      key: pk, label: monthName(pk), prevLabel: monthName(ppk), net: t.net && t.net.net,
      roleName: (id) => App.roleName(id),
    });
  }
  function monthName(pk) { return U.HEB_MONTHS[+pk.slice(5, 7) - 1]; }
  const lastPeriodKey = () => U.addMonthKey(Engine.periodOf(U.todayKey(), S.employers[0]).key, -1);

  /* ---------------- the cards ---------------- */
  const num = (to, kind) => `<div class="st-num" data-to="${to}" data-kind="${kind || 'money'}">${kind === 'hours' ? U.num(to, 1) : money0(to)}</div>`;
  const day = (k) => `${U.HEB_DAYS[U.dow(k)]}, ${+k.slice(8)}.${+k.slice(5, 7)}`;
  const CARD = {
    intro: (s) => `${App.mascot ? App.mascot('wave', { size: 120, cls: 'st-m' }) : ''}<div class="st-k">הסיכום החודשי שלך</div><div class="st-big">${esc(s.label)}</div>
      <div class="st-sub">${S.settings.userName ? esc(String(S.settings.userName).split(' ')[0]) + ', ' : ''}בואו נראה איך היה החודש בעבודה</div>`,
    earned: (s) => `<div class="st-emoji">💰</div><div class="st-k">הרווחת החודש</div>${num(s.gross)}
      ${s.net ? `<div class="st-sub">בערך ${money0(s.net)} נטו</div>` : ''}
      ${s.delta != null && s.delta !== 0 ? `<div class="st-pill ${s.delta > 0 ? 'up' : 'down'}">${s.delta > 0 ? '▲' : '▼'} ${Math.abs(s.delta)}% לעומת ${esc(s.prevLabel)}</div>` : ''}`,
    time: (s) => `<div class="st-emoji">⏱️</div><div class="st-k">עבדת</div>${num(s.hours, 'hours')}<div class="st-unit">שעות</div>
      <div class="st-sub">ב-${s.shifts} ${s.shifts === 1 ? 'משמרת' : 'משמרות'}${s.longestDate && s.shifts > 1 ? ` · הארוכה ביותר: ${U.hm(s.longestMin)} ש׳ (${day(s.longestDate)})` : ''}</div>
      ${s.movies >= 1 ? `<div class="st-fun">🎬 זה כמו ${s.movies} ${s.movies === 1 ? 'סרט' : 'סרטים'} ברצף</div>` : ''}`,
    best: (s) => `<div class="st-emoji">🏆</div><div class="st-k">היום הכי רווחי</div><div class="st-big">${day(s.key)}</div>${num(s.amount)}`,
    extras: (s) => `<div class="st-emoji">⭐</div><div class="st-k">תוספות שהרווחת</div>${num(s.amount)}
      <div class="st-sub">${[s.restHours > 0 ? `שבת וחג: ${U.num(s.restHours, 1)} ש׳` : '', s.otHours > 0 ? `שעות נוספות: ${U.num(s.otHours, 1)} ש׳` : ''].filter(Boolean).join(' · ')}</div>
      ${s.travel >= 1 ? `<div class="st-fun">🚌 ועוד ${money0(s.travel)} החזר נסיעות</div>` : ''}`,
    travel: (s) => `<div class="st-emoji">🚌</div><div class="st-k">החזר נסיעות</div>${num(s.amount)}<div class="st-sub">בנוסף לשכר. לא לשכוח לבדוק שהוא בתלוש!</div>`,
    role: (s) => `<div class="st-emoji">🎯</div><div class="st-k">התפקיד המוביל</div><div class="st-big">${esc(s.name)}</div><div class="st-sub">${U.num(s.hours, 1)} שעות · ${s.share}% מהזמן</div>`,
    clock: (s) => {
      const t = { night: ['🦉', 'ינשוף של ערב'], morning: ['🌅', 'משכימי קום'], day: ['☀️', 'צוות הצהריים'] }[s.type];
      return `<div class="st-emoji">${t[0]}</div><div class="st-k">הסגנון שלך</div><div class="st-big">${t[1]}</div><div class="st-sub">בדרך כלל התחלת בסביבות ${String(s.avgHour).padStart(2, '0')}:00</div>`;
    },
    fun: (s) => `<div class="st-k">עם ${money0(s.money)} אפשר לקנות</div>
      <div class="st-items">${s.items.map((i, n) => `<div class="st-item" style="--n:${n}"><span class="st-ie">${i.emoji}</span><b>${i.count}</b><span>${esc(i.name)}</span></div>`).join('<div class="st-or">או</div>')}</div>`,
    outro: (s) => `${App.mascot ? App.mascot('party', { size: 120, cls: 'st-m' }) : ''}<div class="st-big">כל הכבוד!</div>
      <div class="st-sub">${s.shifts} ${s.shifts === 1 ? 'משמרת' : 'משמרות'} ו-${money0(s.gross)} בחודש אחד. שיהיה חודש מעולה גם הבא 💪</div>
      <div class="st-acts"><button class="btn st-share" data-st-share>${icon('share')} שיתוף תמונה</button><button class="btn tonal" data-st-close>סגירה</button></div>`,
  };

  /* ---------------- the viewer ---------------- */
  function open(pk) {
    const data = dataFor(pk);
    if (!data) { UI.toast('אין משמרות בחודש הזה'); return; }
    if (document.querySelector('.story')) return;
    const n = data.slides.length;
    const el = document.createElement('div');
    el.className = 'story';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'הסיכום של ' + data.label);
    el.innerHTML = `<div class="st-bars">${data.slides.map(() => '<i><b></b></i>').join('')}</div>
      <button class="st-x icon-btn" data-st-close aria-label="סגירה">${icon('x')}</button>
      <div class="st-card" aria-live="polite"></div>
      <div class="st-hint" aria-hidden="true">${icon('left', 's')} הקשה למעבר</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    let i = -1, closed = false, raf = 0, holdT = 0, held = false;
    const layer = UI.pushLayer(() => close(true));
    const card = el.querySelector('.st-card');
    const bars = [...el.querySelectorAll('.st-bars b')];

    function countUp() {
      cancelAnimationFrame(raf);
      const nums = [...card.querySelectorAll('.st-num')];
      if (!nums.length || reduced()) return;
      const t0 = performance.now();
      const fmt = (el2, v) => { el2.textContent = el2.dataset.kind === 'hours' ? U.num(v, 1) : money0(v); };
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / 900);
        const e = 1 - Math.pow(1 - p, 3);
        nums.forEach((x) => fmt(x, +x.dataset.to * e));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    function show(k) {
      if (closed || k < 0 || k >= n || k === i) return;
      const dir = k > i ? 'fwd' : 'back';
      i = k;
      const s = data.slides[i];
      el.dataset.bg = BG[i % BG.length];
      card.className = 'st-card ' + dir;
      card.innerHTML = CARD[s.k](s);
      void card.offsetWidth;
      card.classList.add('on');
      bars.forEach((b, j) => { b.className = j < i ? 'done' : j === i ? 'now' : ''; b.style.animationDuration = DUR + 'ms'; });
      el.classList.toggle('last', i === n - 1);
      countUp();
      if (Fx()) Fx().play(i === n - 1 ? 'success' : 'tick');
      if (i === n - 1 && Fx()) Fx().celebrate('big');
    }
    const next = () => { if (i < n - 1) show(i + 1); };
    const prev = () => { if (i > 0) show(i - 1); };
    // the bar of the current card finishing moves on by itself
    el.querySelector('.st-bars').addEventListener('animationend', (e) => { if (e.target === bars[i] && i < n - 1) next(); });

    function close(fromBack) {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      el.classList.remove('in');
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
      if (!fromBack) UI.closeLayer(layer);
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' || e.key === ' ') { e.preventDefault(); next(); } // right to left: left is forward
      else if (e.key === 'ArrowRight') { e.preventDefault(); prev(); }
    };
    document.addEventListener('keydown', onKey);

    // hold to pause; a tap on the left goes forward, on the right goes back; swipe the same way
    let x0 = 0, y0 = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      x0 = e.clientX; y0 = e.clientY; held = false;
      clearTimeout(holdT);
      holdT = setTimeout(() => { held = true; el.classList.add('paused'); }, 220);
    });
    el.addEventListener('pointercancel', () => { clearTimeout(holdT); el.classList.remove('paused'); });
    el.addEventListener('pointerup', (e) => {
      clearTimeout(holdT);
      el.classList.remove('paused');
      if (e.target.closest('button')) return;
      if (held) { held = false; return; } // it was a hold: just carry on
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (dy > 90 && dy > Math.abs(dx)) { close(); return; } // swipe down closes
      if (Math.abs(dx) > 40) { if (dx < 0) next(); else prev(); return; }
      if (e.clientX > innerWidth * 0.66) prev(); else next();
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-st-close')) close();
      else if (b.hasAttribute('data-st-share')) shareImage(data);
    });
    show(0);
    return { el, close };
  }

  /* ---------------- the share image ---------------- */
  async function shareImage(data) {
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const W = 1080, H = 1350;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#5b21b6'); grd.addColorStop(0.55, '#7c3aed'); grd.addColorStop(1, '#db2777');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.beginPath(); g.arc(W * 0.85, H * 0.12, 260, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(W * 0.1, H * 0.92, 320, 0, Math.PI * 2); g.fill();
      g.direction = 'rtl'; g.textAlign = 'center'; g.fillStyle = '#fff';
      const F = (w, px) => `${w} ${px}px Fredoka, Rubik, "Segoe UI", Arial, sans-serif`;
      const s = Object.fromEntries(data.slides.map((x) => [x.k, x]));
      g.font = F(600, 52); g.globalAlpha = 0.85; g.fillText('הסיכום החודשי שלי', W / 2, 190); g.globalAlpha = 1;
      g.font = F(700, 96); g.fillText(data.label, W / 2, 310);
      g.font = F(700, 190); g.fillText(money0(s.earned.gross), W / 2, 560);
      g.font = F(500, 50); g.globalAlpha = 0.9; g.fillText('ברוטו', W / 2, 640); g.globalAlpha = 1;
      const rows = [`⏱️ ${U.num(s.time.hours, 1)} שעות ב-${s.time.shifts} משמרות`];
      if (s.best) rows.push(`🏆 היום הכי רווחי: ${money0(s.best.amount)}`);
      if (s.extras) rows.push(`⭐ תוספות: ${money0(s.extras.amount)}`);
      if (s.fun && s.fun.items[0]) rows.push(`${s.fun.items[0].emoji} שווה ל-${s.fun.items[0].count} ${s.fun.items[0].name}`);
      g.font = F(600, 54);
      rows.forEach((t, k) => {
        const y = 800 + k * 110;
        g.fillStyle = 'rgba(255,255,255,.14)';
        const rw = 880, rh = 88, rx = (W - rw) / 2;
        g.beginPath(); g.roundRect ? g.roundRect(rx, y - 62, rw, rh, 44) : g.rect(rx, y - 62, rw, rh); g.fill();
        g.fillStyle = '#fff'; g.fillText(t, W / 2, y);
      });
      g.font = F(600, 44); g.globalAlpha = 0.8; g.fillText('Shaati · שעתי', W / 2, H - 80); g.globalAlpha = 1;
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('no image');
      await UI.shareFile(`shaati-${data.key}.png`, blob, 'הסיכום החודשי שלי');
    } catch (e) {
      console.warn('recap image', e);
      UI.toast('לא הצלחנו ליצור תמונה');
    }
  }

  /* ---------------- where it is offered ---------------- */
  /** The home card: during the first two weeks of a new pay period, until it is opened. */
  App.recapCard = function () {
    const today = U.todayKey();
    const P = Engine.periodOf(today, S.employers[0]);
    if (U.diffDays(P.from, today) > 13) return '';
    const pk = lastPeriodKey();
    if (S.meta.recapSeen === pk) return '';
    const sum = Engine.periodSummary(App.model, pk, S.employers[0].id);
    if (!(sum.shifts > 0)) return '';
    return `<button class="recap-card" data-act="recap-open" data-pk="${pk}"><span class="rc-spark" aria-hidden="true">✨</span>
      <span class="rc-t"><b>הסיכום של ${monthName(pk)} מוכן</b><span>${sum.shifts} משמרות · ${money0(sum.gross)}. בואו לראות</span></span>${icon('left', 's')}</button>`;
  };
  App.actions['recap-open'] = (el) => {
    const pk = (el && el.dataset && el.dataset.pk) || lastPeriodKey();
    if (pk === lastPeriodKey() && S.meta.recapSeen !== pk) {
      Store.setMeta({ recapSeen: pk }).catch(() => {});
      setTimeout(() => App.rerender(), 400);
    }
    open(pk);
  };
  App.recap = { open, dataFor, shareImage };
})(typeof window !== 'undefined' ? window : globalThis);
