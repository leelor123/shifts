/* Shaati's website (2026-11-02): the sky over your city at this hour (the app's own, sky.js), with the cities to
   switch between; the greeting and the clock; a live shift; the pay calculator; a shift told as the day passing (the
   sky follows the reading); the screens; the night sky at the end. Everything rests still for reduced motion. */
(function () {
  'use strict';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const money = (v) => '₪' + v.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = (n) => String(n).padStart(2, '0');
  const idle = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 80));
  const Sky = window.Sky;
  /* on an iPhone that has not added Shaati to the home screen yet: a line under the buttons to the three steps. In an
     app's own browser (Instagram, WhatsApp) there is no "add to home screen": it says to open the page in Safari. */
  (function iosTip() {
    const tip = $('[data-ios]');
    const ua = navigator.userAgent || '';
    const iphone = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (!tip || !iphone || navigator.standalone || matchMedia('(display-mode: standalone)').matches) return;
    if (!/Safari\//.test(ua) || /FBAN|FBAV|Instagram|Line\/|WhatsApp/.test(ua)) tip.textContent = 'באייפון, פותחים את הדף הזה בספארי, ומשם מוסיפים את שעתי למסך הבית.';
    tip.hidden = false;
  })();
  const CITIES = {
    tlv: { name: 'תל אביב-יפו', lat: 32.0809, lon: 34.7806, at: 'בתל אביב' },
    jlm: { name: 'ירושלים', lat: 31.769, lon: 35.2163, at: 'בירושלים' },
    hfa: { name: 'חיפה', lat: 32.794, lon: 34.9896, at: 'בחיפה' },
    bsh: { name: 'באר שבע', lat: 31.2518, lon: 34.7913, at: 'בבאר שבע' },
    elt: { name: 'אילת', lat: 29.5581, lon: 34.9482, at: 'באילת' },
  };
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  let city = CITIES[store.get('shaati.site.city')] ? store.get('shaati.site.city') : 'tlv';

  /** A scene sized to its box: one drawing unit is a css pixel on a phone, a little more on a big screen, so the land
   * keeps its size and nothing is stretched (sky.js draws any width and height) */
  // sizes come from a ResizeObserver where there is one (reading clientWidth as the page opened made the browser lay
  // it out ahead of time: Lighthouse's forced reflow)
  const sizes = new WeakMap();
  const sized = (box) => {
    const k = sizes.get(box) || { w: box.clientWidth || 390, h: box.clientHeight || 330 };
    const s = Math.min(1.6, Math.max(1, k.w / 900));
    return { width: Math.round(k.w / s), height: Math.round(k.h / s) };
  };
  const draw = (svg, box, extra) => { if (Sky) Sky.render(svg, Object.assign({ now: Date.now(), place: CITIES[city] }, sized(box), extra || {})); };

  /* ---------- the bar on top: glass once the page moves, paper once the sky is behind ---------- */
  const top = $('[data-top]'), hero = $('.hero');
  if (top && 'IntersectionObserver' in window) {
    // watched with markers, not scrollY (reading it as the page opened made the browser lay it out ahead of time)
    const mark = document.createElement('div');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.cssText = 'position:absolute;top:0;inset-inline-start:0;width:1px;height:8px;pointer-events:none';
    document.body.prepend(mark);
    new IntersectionObserver(([e]) => top.classList.toggle('scrolled', !e.isIntersecting)).observe(mark);
    if (hero) new IntersectionObserver(([e]) => top.classList.toggle('solid', !e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' }).observe(hero);
  }

  /* ---------- the hero: the sky over the city at this hour ---------- */
  let rz = 0, lastW = -1;
  const heroSky = $('[data-hero-sky]');
  const greet = $('[data-greet]'), where = $('[data-where]'), clock = $('[data-clock]');
  const tell = () => {
    const d = new Date();
    if (greet && Sky) greet.textContent = Sky.greeting(d);
    if (clock) { clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; clock.dateTime = clock.textContent; }
    if (where) where.textContent = CITIES[city].at;
  };
  tell();
  setInterval(tell, 20000);
  // the first drawing fades in over the page's own night blue; a city change draws the new sky over the old one
  // and fades it in (a crossfade, the old one is removed after)
  function showSky(first) {
    if (!heroSky || !Sky || !hero) return;
    if (first) {
      draw(heroSky, hero);
      requestAnimationFrame(() => requestAnimationFrame(() => heroSky.classList.add('on')));
      return;
    }
    const old = $$('.sky', hero).pop();
    const next = document.createElement('div');
    next.setAttribute('class', 'sky');
    next.setAttribute('aria-hidden', 'true');
    old.after(next);
    draw(next, hero);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      next.classList.add('on');
      setTimeout(() => { $$('.sky', hero).slice(0, -1).forEach((s) => s.remove()); }, still ? 50 : 950);
    }));
  }
  if (hero && 'ResizeObserver' in window) {
    let first = true;
    new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width), h = Math.round(e.contentRect.height + parseFloat(getComputedStyle(hero).paddingTop || 0));
      sizes.set(hero, { w: hero.offsetWidth || w, h: hero.offsetHeight || h });
      if (lastW < 0) lastW = innerWidth; // read here, where the layout is fresh anyway
      if (first) { first = false; showSky(true); }
    }).observe(hero);
  } else showSky(true);
  // a fresh sky as time goes on (every ten minutes), and on a new size
  setInterval(() => showSky(false), 600000);
  addEventListener('resize', () => {
    if (Math.abs(innerWidth - lastW) < 40) return; // the phone's address bar coming and going changes only the height
    lastW = innerWidth;
    clearTimeout(rz);
    rz = setTimeout(() => { showSky(false); if (stageOn) drawStage(); }, 250);
  });
  const radios = $$('[data-cities] input');
  radios.forEach((r) => {
    r.checked = r.value === city;
    r.addEventListener('change', () => {
      if (!r.checked) return;
      city = r.value;
      store.set('shaati.site.city', city);
      tell();
      showSky(false);
      if (stageOn) drawStage();
    });
  });

  /* ---------- a live shift: the clock runs and the pay goes up, as in the app ---------- */
  const live = $('[data-live]');
  if (live) {
    const RATE = 42.5; // ₪ an hour
    const t0 = Date.now() - (3 * 3600 + 12 * 60 + 5) * 1000;
    const lc = $('[data-live-clock]', live), pay = $('[data-live-pay]', live);
    const tick = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      lc.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
      pay.textContent = money((s / 3600) * RATE);
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- the calculator: what a shift pays, by the law's rates ---------- */
  const calc = $('[data-calc]');
  if (calc) {
    const MIN = 35.4; // the adult minimum wage per hour (from 1.4.2026)
    const st = { rate: 42.5, hours: 9, shabbat: true, night: false, travel: 16 };
    const el = {
      rate: $('#c-rate', calc), hours: $('#c-hours', calc), hoursOut: $('[data-hours]', calc), travel: $('#c-travel', calc),
      total: $('[data-total]', calc), parts: $('[data-parts]', calc), bar: $('[data-bar]', calc), min: $('[data-min]', calc),
      rateErr: $('[data-err-rate]', calc), travelErr: $('[data-err-travel]', calc),
    };
    const COLORS = ['var(--c-base)', 'var(--c-ot)', 'var(--c-rest)', 'var(--c-travel)'];
    let shown = 0, anim = 0;
    const fmtH = (h) => (h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${+h.toFixed(1)} שעות`);
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
    // the four parts are drawn once; after that only their numbers and widths change (no list rebuilt on every move)
    el.parts.innerHTML = COLORS.map((c) => `<li style="--c:${c}"><i></i><span><b></b><small></small></span><em></em></li>`).join('');
    el.bar.innerHTML = COLORS.map((c) => `<span style="--c:${c}"></span>`).join('');
    const rows = $$('li', el.parts), segs = $$('span', el.bar);
    function render() {
      const parts = compute();
      const total = parts.reduce((s, p) => s + p[1], 0);
      parts.forEach(([k, v, why], i) => {
        $('b', rows[i]).textContent = k; $('small', rows[i]).textContent = why; $('em', rows[i]).textContent = money(v);
        segs[i].style.flexGrow = String(Math.max(v, 0.0001));
      });
      el.min.hidden = !(st.rate < MIN);
      // the total counts to its new value
      const from = shown, to = total, t0 = performance.now(), dur = still ? 0 : 600;
      cancelAnimationFrame(anim);
      const step = (t) => {
        const k = dur ? Math.min(1, (t - t0) / dur) : 1;
        shown = from + (to - from) * (1 - Math.pow(1 - k, 3));
        el.total.textContent = money(shown);
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    }
    // a number as people type it, a comma as the decimal point too (35,4); anything else is not a number
    const num = (s) => { const t = String(s).trim().replace(',', '.'); return /^\d+(\.\d+)?$/.test(t) ? +t : NaN; };
    // a value that cannot be right is said under its field, and the result dims: it is not this shift's any more (it
    // kept the last good total, and 99999 or -5 showed a wrong one with no word). An empty field only dims, while typing.
    const bad = { rate: false, travel: false };
    const mark = (k, input, msg, ok, empty) => {
      bad[k] = !ok;
      input.setAttribute('aria-invalid', String(!ok));
      msg.hidden = ok || empty;
      calc.classList.toggle('bad', bad.rate || bad.travel);
    };
    el.rate.addEventListener('input', () => {
      const v = num(el.rate.value), ok = v >= 1 && v < 1000;
      mark('rate', el.rate, el.rateErr, ok, !el.rate.value.trim());
      if (ok) { st.rate = v; render(); }
    });
    el.travel.addEventListener('input', () => {
      const empty = !el.travel.value.trim(), v = empty ? 0 : num(el.travel.value), ok = v >= 0 && v < 200;
      mark('travel', el.travel, el.travelErr, ok, false);
      if (ok) { st.travel = v; render(); }
    });
    el.hours.addEventListener('input', () => {
      st.hours = parseFloat(el.hours.value);
      el.hoursOut.textContent = fmtH(st.hours);
      el.hours.style.setProperty('--p', ((st.hours - el.hours.min) / (el.hours.max - el.hours.min)) * 100 + '%');
      render();
    });
    $$('[data-tog]', calc).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.tog;
      st[k] = !st[k];
      b.setAttribute('aria-pressed', String(st[k]));
      render();
    }));
    el.hours.dispatchEvent(new Event('input'));
  }

  /* ---------- a shift, from morning to night: the sky follows the reading ---------- */
  const stage = $('[data-stage]'), chaps = $$('.chap');
  let stageOn = false, current = -1;
  const sDay = $('[data-stage-day]'), sClock = $('[data-stage-clock]'), sChip = $('[data-stage-chip]');
  // a part of the day's sky, drawn once into its place in the stack
  const paint = (svg) => { if (!svg || svg.dataset.drawn) return; svg.dataset.drawn = '1'; draw(svg, stage, { phase: chaps[+svg.dataset.i].dataset.phase }); };
  let pending = [];
  function drawStage() {
    // one drawing for each part of the day in the story, stacked; the one being read shows. That one is drawn now and
    // the others one at a time when the page is idle (all five in one frame was the longest frame of a fast scroll)
    $$('.sky', stage).forEach((s) => s.remove());
    const svgs = chaps.map((c, i) => {
      const svg = document.createElement('div');
      svg.setAttribute('class', 'sky' + (i === Math.max(0, current) ? ' on' : ''));
      svg.setAttribute('aria-hidden', 'true');
      svg.dataset.i = String(i);
      stage.prepend(svg);
      return svg;
    });
    paint(svgs[Math.max(0, current)]);
    pending = svgs.filter((s) => !s.dataset.drawn);
    const more = () => { paint(pending.shift()); if (pending.length) idle(more); };
    idle(more);
  }
  const swap = (node, text) => {
    if (!node || node.textContent === text) return;
    node.textContent = text;
    if (!still && node.animate) node.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.23, 1, .32, 1)' });
  };
  function show(i) {
    if (i === current) return;
    current = i;
    const c = chaps[i];
    paint($(`.sky[data-i="${i}"]`, stage)); // read before its turn came: drawn now
    $$('.sky', stage).forEach((s) => s.classList.toggle('on', s.dataset.i === String(i)));
    swap(sDay, c.dataset.day); swap(sClock, c.dataset.time); swap(sChip, c.dataset.chip);
  }
  if (stage && chaps.length && 'IntersectionObserver' in window) {
    // drawn only as the story comes near (the page's first moments are the hero's)
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); stageOn = true; drawStage(); if (current < 0) show(0); } }, { rootMargin: '600px 0px' }).observe(stage);
    // the chapter crossing the middle of the screen is the one shown
    const seen = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) show(chaps.indexOf(e.target)); }); }, { rootMargin: '-45% 0px -45% 0px' });
    chaps.forEach((c) => seen.observe(c));
  }

  /* ---------- the screens: the one in the middle is the big one, the others step back ---------- */
  const gal = $('[data-gallery]');
  if (gal && !still) {
    const figs = $$('figure', gal);
    let raf = 0;
    const depth = () => {
      raf = 0;
      const g = gal.getBoundingClientRect(), mid = g.left + g.width / 2, half = Math.max(260, g.width / 2);
      figs.forEach((f) => {
        const r = f.getBoundingClientRect();
        const d = Math.min(1, Math.abs(r.left + r.width / 2 - mid) / half);
        f.style.transform = `scale(${(1 - d * 0.12).toFixed(3)})`;
        f.style.opacity = (1 - d * 0.45).toFixed(3);
      });
    };
    gal.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(depth); }, { passive: true });
    addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(depth); });
    const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { near.disconnect(); depth(); } }, { rootMargin: '400px 0px' });
    near.observe(gal);
  }
  $$('[data-gal]').forEach((b) => b.addEventListener('click', () => {
    const w = gal.querySelector('figure').getBoundingClientRect().width + 22;
    gal.scrollBy({ left: (b.dataset.gal === 'next' ? -1 : 1) * w, behavior: still ? 'auto' : 'smooth' });
  }));

  /* ---------- the last word under the night sky ---------- */
  const fin = $('[data-final-sky]');
  if (fin && Sky && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); draw(fin, fin.parentNode, { phase: 'night', weather: 'clear' }); } }, { rootMargin: '400px 0px' }).observe(fin);
  }

  /* ---------- the sky's motion: stopped on request (it never ends by itself, WCAG 2.2.2), kept for the next visit ---------- */
  const pause = $('[data-sky-pause]');
  if (pause) {
    const setStill = (on) => { document.documentElement.classList.toggle('sky-still', on); pause.setAttribute('aria-pressed', String(on)); };
    setStill(store.get('shaati.site.still') === '1');
    pause.addEventListener('click', () => { const on = pause.getAttribute('aria-pressed') !== 'true'; setStill(on); store.set('shaati.site.still', on ? '1' : '0'); });
  }

  /* ---------- the storage notice: once, until it is acknowledged ---------- */
  const note = $('[data-cookie]');
  if (note && !store.get('shaati.site.cookies')) {
    idle(() => { note.hidden = false; });
    $('[data-cookie-ok]', note).addEventListener('click', () => { store.set('shaati.site.cookies', '1'); note.hidden = true; });
  }

  /* ---------- below the story: laid out one section at a time once the page is idle ---------- */
  // each in its own short task (the first layout covers the top of the page only), and all of them soon, so their
  // real heights are known before anyone scrolls back up (Safari keeps no scroll anchor: a late size would jump)
  const later = $$('main > section:not(.hero):not(.after-hero):not(#story), body > footer');
  const next = () => { const s = later.shift(); if (!s) return; s.classList.add('shown'); idle(next); };
  if (document.readyState === 'complete') idle(next); else addEventListener('load', () => idle(next), { once: true });
})();
