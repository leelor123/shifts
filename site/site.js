/* Shaati's website: the live shift, the pay calculator, the phone that turns with the pointer, magnetic buttons,
   the cards' spotlight, the header on scroll and the coins at the end. Everything rests still for reduced motion. */
(function () {
  'use strict';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const money = (v) => '₪' + v.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- the header gets its shadow once the page moves ---------- */
  const top = $('.top');
  const onScroll = () => top && top.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- a live shift: the clock runs and the pay goes up, as in the app ---------- */
  const live = $('[data-live]');
  if (live) {
    const RATE = 42.5; // ₪ an hour
    const t0 = Date.now() - (3 * 3600 + 12 * 60 + 5) * 1000;
    const clock = $('[data-live-clock]', live), pay = $('[data-live-pay]', live);
    const tick = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      clock.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
      pay.textContent = money((s / 3600) * RATE);
      if (!still) { pay.classList.remove('bump'); void pay.offsetWidth; pay.classList.add('bump'); }
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- the phone turns with the pointer; the chips float at their own depth ---------- */
  const art = $('.hero-art');
  if (art && fine && !still) {
    const phone = $('.phone', art), chips = $$('.float', art);
    let raf = 0, tx = 0, ty = 0;
    const apply = () => {
      raf = 0;
      phone.style.transform = `perspective(1100px) rotateY(${tx * 10}deg) rotateX(${-ty * 8}deg)`;
      chips.forEach((c, i) => { const d = 10 + i * 8; c.style.translate = `${tx * d}px ${ty * d}px`; });
    };
    art.addEventListener('pointermove', (e) => {
      const r = art.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    art.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(apply); });
  }

  /* ---------- buttons drawn a little toward the pointer ---------- */
  if (fine && !still) {
    $$('.magnet').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        b.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.18}px ${(e.clientY - r.top - r.height / 2) * 0.3}px`;
      });
      b.addEventListener('pointerleave', () => { b.style.translate = ''; });
    });
  }

  /* ---------- a soft light follows the pointer over the feature cards ---------- */
  if (fine) {
    $$('.feat').forEach((c) => c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
  }

  /* ---------- the calculator: what a shift pays, by the law's rates ---------- */
  const calc = $('[data-calc]');
  if (calc) {
    const MIN = 35.4; // the adult minimum wage per hour (from 1.4.2026)
    const st = { rate: 42.5, hours: 9, shabbat: true, night: false, travel: 16 };
    const el = {
      rate: $('#c-rate', calc), hours: $('#c-hours', calc), hoursOut: $('[data-hours]', calc), travel: $('#c-travel', calc),
      total: $('[data-total]', calc), parts: $('[data-parts]', calc), bar: $('[data-bar]', calc), min: $('[data-min]', calc),
    };
    const COLORS = ['var(--c-base)', 'var(--c-ot)', 'var(--c-rest)', 'var(--c-travel)'];
    let shown = 0, anim = 0;
    function compute() {
      const reg = st.night ? 7 : 8; // a night shift is a shorter day by law
      const base = Math.min(st.hours, reg), ot1 = Math.min(Math.max(st.hours - reg, 0), 2), ot2 = Math.max(st.hours - reg - 2, 0);
      const r = st.rate;
      const plain = base * r + ot1 * r * 1.25 + ot2 * r * 1.5;
      const withRest = st.shabbat ? base * r * 1.5 + ot1 * r * 1.75 + ot2 * r * 2 : plain;
      return [
        ['שעות רגילות', base * r, `${fmtH(base)} × ${money(r)}`],
        ['שעות נוספות', ot1 * r * 1.25 + ot2 * r * 1.5, ot1 + ot2 ? `${fmtH(ot1)} ב-125%${ot2 ? `, ${fmtH(ot2)} ב-150%` : ''}` : 'אין במשמרת הזאת'],
        ['תוספת שבת וחג', withRest - plain, st.shabbat ? 'לפחות 150% על כל שעה' : 'משמרת ביום חול'],
        ['נסיעות', st.travel, 'ליום עבודה'],
      ];
    }
    const fmtH = (h) => (h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${+h.toFixed(1)} שעות`);
    function draw() {
      const parts = compute();
      const total = parts.reduce((s, p) => s + p[1], 0);
      el.parts.innerHTML = parts.map(([k, v, why], i) => `<li style="--c:${COLORS[i]}"><i></i><span><b>${k}</b><small>${why}</small></span><em>${money(v)}</em></li>`).join('');
      el.bar.innerHTML = parts.map(([, v], i) => `<span style="--c:${COLORS[i]};flex-grow:${Math.max(v, 0.0001)}"></span>`).join('');
      el.min.hidden = !(st.rate < MIN);
      // the total counts to its new value
      const from = shown, to = total, t0 = performance.now(), dur = still ? 0 : 650;
      cancelAnimationFrame(anim);
      const step = (t) => {
        const k = dur ? Math.min(1, (t - t0) / dur) : 1;
        shown = from + (to - from) * (1 - Math.pow(1 - k, 3));
        el.total.textContent = money(shown);
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    el.rate.addEventListener('input', () => { const v = parseFloat(el.rate.value); if (v > 0 && v < 1000) { st.rate = v; draw(); } });
    el.travel.addEventListener('input', () => { const v = parseFloat(el.travel.value); st.travel = v >= 0 && v < 200 ? v : 0; draw(); });
    el.hours.addEventListener('input', () => {
      st.hours = parseFloat(el.hours.value);
      el.hoursOut.textContent = fmtH(st.hours);
      el.hours.style.setProperty('--p', ((st.hours - el.hours.min) / (el.hours.max - el.hours.min)) * 100 + '%');
      draw();
    });
    $$('[data-tog]', calc).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.tog;
      st[k] = !st[k];
      b.setAttribute('aria-pressed', String(st[k]));
      draw();
    }));
    el.hours.dispatchEvent(new Event('input'));
  }

  /* ---------- the gallery: the screen in the middle is the big one, the others step back ---------- */
  const gal = $('.gallery');
  if (gal && !still) {
    const figs = $$('figure', gal);
    let raf = 0;
    const depth = () => {
      raf = 0;
      const g = gal.getBoundingClientRect(), mid = g.left + g.width / 2, half = Math.max(260, g.width / 2);
      figs.forEach((f) => {
        const r = f.getBoundingClientRect();
        const d = Math.min(1, Math.abs(r.left + r.width / 2 - mid) / half);
        f.style.transform = `scale(${(1 - d * 0.16).toFixed(3)})`;
        f.style.opacity = (1 - d * 0.5).toFixed(3);
      });
    };
    gal.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(depth); }, { passive: true });
    addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(depth); });
    depth();
  }
  $$('[data-gal]').forEach((b) => b.addEventListener('click', () => {
    const w = gal.querySelector('figure').getBoundingClientRect().width + 18;
    gal.scrollBy({ left: (b.dataset.gal === 'next' ? -1 : 1) * w, behavior: still ? 'auto' : 'smooth' });
  }));

  /* ---------- coins that float up behind the last call to action ---------- */
  const cv = $('#coins');
  if (cv && !still) {
    const g = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1, on = false, last = 0;
    const coins = Array.from({ length: matchMedia('(max-width: 700px)').matches ? 11 : 18 }, () => ({}));
    const reset = (c, init) => {
      c.r = 9 + Math.random() * 14; c.x = Math.random() * w; c.y = init ? Math.random() * h : h + c.r * 2;
      c.v = 18 + Math.random() * 26; c.sw = Math.random() * Math.PI * 2; c.spin = Math.random() * Math.PI * 2; c.a = 0.35 + Math.random() * 0.45;
    };
    const size = () => {
      const r = cv.getBoundingClientRect(); dpr = Math.min(1.5, devicePixelRatio || 1);
      w = r.width; h = r.height; cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      coins.forEach((c) => reset(c, true));
    };
    const coin = (c) => {
      const sx = Math.abs(Math.cos(c.spin)) * 0.85 + 0.15;
      g.save(); g.globalAlpha = c.a; g.translate(c.x + Math.sin(c.sw) * 14, c.y); g.scale(sx, 1);
      const grd = g.createLinearGradient(-c.r, -c.r, c.r, c.r); grd.addColorStop(0, '#ffd66b'); grd.addColorStop(1, '#f2960f');
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, c.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(160, 90, 0, .55)'; g.lineWidth = Math.max(1, c.r * 0.12); g.beginPath(); g.arc(0, 0, c.r * 0.78, 0, Math.PI * 2); g.stroke();
      if (sx > 0.45) { g.fillStyle = 'rgba(120, 66, 0, .8)'; g.font = `700 ${c.r * 1.05}px Rubik, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('₪', 0, c.r * 0.06); }
      g.restore();
    };
    const frame = (t) => {
      if (!on) return;
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      g.clearRect(0, 0, w, h);
      coins.forEach((c) => { c.y -= c.v * dt; c.sw += dt * 1.2; c.spin += dt * 2.2; if (c.y < -c.r * 2) reset(c); coin(c); });
      requestAnimationFrame(frame);
    };
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !on) { if (!w) size(); on = true; last = 0; requestAnimationFrame(frame); } else if (!e.isIntersecting) on = false;
    }).observe(cv);
    addEventListener('resize', () => { if (w) size(); });
  }
})();
