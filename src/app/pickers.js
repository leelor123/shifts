/* ============================================================
 * pickers.js — the app's own date, month and time pickers.
 *
 * Every <input type="date|month|time"> in the app is replaced on the
 * fly by a friendly button; tapping it opens a picker sheet: a big
 * calendar (with "today" / "yesterday" shortcuts and a year view for
 * birthdays), a month grid, or hour/minute wheels. The real input
 * stays in the page (hidden) and keeps its value in the usual format
 * (YYYY-MM-DD, YYYY-MM, HH:MM), so the screens that read it don't
 * change. min / max on the input are respected: days outside the
 * range can't be chosen. data-pick="birth" opens on the year view.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U } = root;
  const UI = root.UI;
  const { icon, esc } = UI;
  const Fx = () => root.Fx;

  const MONTHS = U.HEB_MONTHS;
  const DAYS_SHORT = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const parse = (k) => { const [y, m, d] = String(k).split('-').map(Number); return { y, m, d }; };
  const daysIn = (y, m) => new Date(y, m, 0).getDate();
  const isKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k || '');

  /* ---------------- formatting for the field buttons ---------------- */
  function fmtDate(k) {
    if (!isKey(k)) return '';
    const { y, m, d } = parse(k);
    const today = U.todayKey();
    const rel = k === today ? 'היום · ' : k === U.addDays(today, -1) ? 'אתמול · ' : k === U.addDays(today, 1) ? 'מחר · ' : '';
    return `${rel}${U.HEB_DAYS[U.dow(k)]}, ${d} ב${MONTHS[m - 1]} ${y}`;
  }
  const fmtMonth = (mk) => (/^\d{4}-\d{2}$/.test(mk || '') ? U.fmtMonth(mk) : '');
  const fmtTime = (t) => (/^\d{2}:\d{2}/.test(t || '') ? t.slice(0, 5) : '');

  /* ---------------- the sheet that hosts a picker ---------------- */
  function host(title, inner, onMount) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'dialog pk';
      el.innerHTML = `<div class="backdrop show" style="z-index:-1"></div>
        <div class="pk-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <div class="pk-grab"></div>
          <div class="pk-head"><h3>${esc(title)}</h3><button class="icon-btn" data-pk-x aria-label="סגור">${icon('x')}</button></div>
          ${inner}
        </div>`;
      document.body.appendChild(el);
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        el.classList.add('out');
        setTimeout(() => el.remove(), 220);
        resolve(v);
      };
      el._resolve = (v) => { done = true; resolve(v); }; // the back button / tests close it this way
      el.querySelector('.backdrop').onclick = () => finish(null);
      el.querySelector('[data-pk-x]').onclick = () => finish(null);
      // swipe down on the handle closes, like the other sheets
      let y0 = null;
      const grab = el.querySelector('.pk-grab');
      grab.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
      el.querySelector('.pk-head').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
      el.addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 70) finish(null); y0 = null; });
      onMount(el, finish);
    });
  }

  /* ---------------- date ---------------- */
  /**
   * opts: { value, min, max, title, mode: 'birth' }
   * Resolves with 'YYYY-MM-DD', or null when closed without choosing.
   */
  function pickDate(opts) {
    opts = opts || {};
    const today = U.todayKey();
    const min = isKey(opts.min) ? opts.min : '1930-01-01';
    const max = isKey(opts.max) ? opts.max : '2100-12-31';
    let sel = isKey(opts.value) ? opts.value : null;
    const start = sel || (opts.mode === 'birth' ? keyOf(+today.slice(0, 4) - 16, 1, 1) : today > max ? max : today < min ? min : today);
    let vy = parse(start).y, vm = parse(start).m;
    let view = opts.mode === 'birth' && !sel ? 'years' : 'days';
    const ok = (k) => k >= min && k <= max;

    const shortcut = (k, label) => (ok(k) ? `<button class="chip" data-k="${k}">${label}</button>` : '');
    const quick = opts.mode === 'birth' ? '' : `<div class="pk-quick">${shortcut(today, 'היום')}${shortcut(U.addDays(today, -1), 'אתמול')}${shortcut(U.addDays(today, -2), 'שלשום')}${shortcut(U.addDays(today, 1), 'מחר')}</div>`;

    return host(opts.title || 'בחירת תאריך', `
      <div class="pk-show"><div class="pk-big" data-big></div></div>
      <div class="pk-nav"><button class="icon-btn" data-step="-1" aria-label="חודש קודם">${icon('right')}</button><button class="pk-title" data-view></button><button class="icon-btn" data-step="1" aria-label="חודש הבא">${icon('left')}</button></div>
      <div class="pk-body" data-body></div>
      ${quick}
      <div class="pk-foot"><button class="btn tonal" data-pk-cancel>ביטול</button><button class="btn" data-pk-ok>${icon('check')} בחירה</button></div>`, (el, finish) => {
      const body = el.querySelector('[data-body]');
      const big = el.querySelector('[data-big]');
      const head = el.querySelector('[data-view]');
      const okBtn = el.querySelector('[data-pk-ok]');
      function drawBig() {
        big.innerHTML = sel ? `<span class="d">${parse(sel).d}</span><span class="r"><b>${U.HEB_DAYS[U.dow(sel)]}</b><span>${MONTHS[parse(sel).m - 1]} ${parse(sel).y}</span></span>` : `<span class="r"><b>${opts.mode === 'birth' ? 'מתי נולדת?' : 'בחר יום'}</b><span>${view === 'years' ? 'קודם השנה' : 'לחץ על יום בלוח'}</span></span>`;
        okBtn.disabled = !sel;
      }
      function draw(anim) {
        el.querySelectorAll('[data-step]').forEach((b) => (b.style.visibility = view === 'days' ? '' : 'hidden'));
        if (view === 'days') {
          head.innerHTML = `${MONTHS[vm - 1]} ${vy} <span class="tiny">▾</span>`;
          const first = new Date(vy, vm - 1, 1).getDay();
          const n = daysIn(vy, vm);
          let cells = DAYS_SHORT.map((d) => `<span class="pk-dow">${d}</span>`).join('');
          for (let i = 0; i < first; i++) cells += '<span></span>';
          for (let d = 1; d <= n; d++) {
            const k = keyOf(vy, vm, d);
            const cls = ['pk-day', k === sel ? 'on' : '', k === today ? 'today' : '', U.dow(k) === 6 ? 'sat' : ''].join(' ');
            cells += `<button class="${cls}" data-k="${k}" ${ok(k) ? '' : 'disabled'}>${d}</button>`;
          }
          body.innerHTML = `<div class="pk-grid ${anim || ''}">${cells}</div>`;
        } else if (view === 'months') {
          head.innerHTML = `${vy} <span class="tiny">▾</span>`;
          body.innerHTML = `<div class="pk-months">${MONTHS.map((mn, i) => {
            const anyOk = keyOf(vy, i + 1, daysIn(vy, i + 1)) >= min && keyOf(vy, i + 1, 1) <= max;
            return `<button class="pk-cell ${i + 1 === vm ? 'on' : ''}" data-m="${i + 1}" ${anyOk ? '' : 'disabled'}>${mn}</button>`;
          }).join('')}</div>`;
        } else {
          head.innerHTML = 'בחר שנה';
          const y0 = parse(min).y, y1 = parse(max).y;
          let html = '';
          for (let y = y1; y >= y0; y--) html += `<button class="pk-cell ${y === vy ? 'on' : ''}" data-y="${y}">${y}</button>`;
          body.innerHTML = `<div class="pk-years">${html}</div>`;
          const on = body.querySelector('.pk-cell.on');
          if (on) on.scrollIntoView({ block: 'center' });
        }
        drawBig();
      }
      function step(dir) {
        vm += dir;
        if (vm < 1) { vm = 12; vy--; }
        if (vm > 12) { vm = 1; vy++; }
        if (keyOf(vy, vm, daysIn(vy, vm)) < min || keyOf(vy, vm, 1) > max) { vm -= dir; if (vm < 1) { vm = 12; vy++; } if (vm > 12) { vm = 1; vy--; } Fx() && Fx().nope(); return; }
        draw(dir > 0 ? 'from-left' : 'from-right');
        if (Fx()) Fx().play('tick');
      }
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (b.dataset.k) {
          sel = b.dataset.k;
          const p = parse(sel);
          if (p.y !== vy || p.m !== vm) { vy = p.y; vm = p.m; }
          view = 'days';
          draw();
          if (Fx()) Fx().play('pop');
          // a shortcut chip chooses straight away
          if (b.classList.contains('chip')) setTimeout(() => finish(sel), 160);
        } else if (b.dataset.step) step(+b.dataset.step);
        else if (b.hasAttribute('data-view')) { view = view === 'days' ? 'months' : view === 'months' ? 'years' : 'days'; draw(); }
        else if (b.dataset.y) { vy = +b.dataset.y; view = 'months'; draw(); if (Fx()) Fx().play('tick'); }
        else if (b.dataset.m) { vm = +b.dataset.m; view = 'days'; draw(); if (Fx()) Fx().play('tick'); }
        else if (b.hasAttribute('data-pk-cancel')) finish(null);
        else if (b.hasAttribute('data-pk-ok') && sel) finish(sel);
      });
      UI.onSwipe(body, (dir) => { if (view === 'days') step(dir === 'right' ? 1 : -1); });
      draw();
    });
  }

  /* ---------------- month (payslip month) ---------------- */
  function pickMonth(opts) {
    opts = opts || {};
    const cur = U.todayKey().slice(0, 7);
    const max = /^\d{4}-\d{2}$/.test(opts.max || '') ? opts.max : '2100-12';
    const min = /^\d{4}-\d{2}$/.test(opts.min || '') ? opts.min : '2000-01';
    let sel = /^\d{4}-\d{2}$/.test(opts.value || '') ? opts.value : null;
    let vy = +(sel || (cur > max ? max : cur)).slice(0, 4);
    return host(opts.title || 'בחירת חודש', `
      <div class="pk-nav"><button class="icon-btn" data-yr="-1" aria-label="שנה קודמת">${icon('right')}</button><div class="pk-title" data-yt></div><button class="icon-btn" data-yr="1" aria-label="שנה הבאה">${icon('left')}</button></div>
      <div class="pk-body"><div class="pk-months" data-grid></div></div>
      <div class="pk-foot"><button class="btn tonal" data-pk-cancel>ביטול</button></div>`, (el, finish) => {
      const draw = () => {
        el.querySelector('[data-yt]').textContent = vy;
        el.querySelector('[data-grid]').innerHTML = MONTHS.map((mn, i) => {
          const mk = `${vy}-${pad(i + 1)}`;
          return `<button class="pk-cell ${mk === sel ? 'on' : ''} ${mk === cur ? 'today' : ''}" data-mk="${mk}" ${mk < min || mk > max ? 'disabled' : ''}>${mn}</button>`;
        }).join('');
      };
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (b.dataset.yr) { const ny = vy + +b.dataset.yr; if (`${ny}-12` < min || `${ny}-01` > max) return; vy = ny; draw(); }
        else if (b.dataset.mk) { sel = b.dataset.mk; draw(); if (Fx()) Fx().play('pop'); setTimeout(() => finish(sel), 140); }
        else if (b.hasAttribute('data-pk-cancel')) finish(null);
      });
      draw();
    });
  }

  /* ---------------- time ---------------- */
  const ROW = 44;
  function wheel(count, sel, fmt) {
    let html = '';
    for (let i = 0; i < count; i++) html += `<div class="pk-opt" data-i="${i}">${fmt(i)}</div>`;
    return `<div class="pk-wheel" tabindex="0" data-sel="${sel}"><div class="pk-pad"></div>${html}<div class="pk-pad"></div></div>`;
  }
  /** opts: { value: 'HH:MM', title }. Resolves with 'HH:MM' or null. */
  function pickTime(opts) {
    opts = opts || {};
    const now = new Date();
    const v = fmtTime(opts.value) || `${pad(now.getHours())}:${pad(Math.round(now.getMinutes() / 5) * 5 % 60)}`;
    let h = +v.slice(0, 2), m = +v.slice(3, 5);
    const quick = [['עכשיו', null], ['08:00', '08:00'], ['12:00', '12:00'], ['16:00', '16:00'], ['20:00', '20:00']];
    return host(opts.title || 'בחירת שעה', `
      <div class="pk-show"><div class="pk-clock" data-big></div></div>
      <div class="pk-wheels">${wheel(24, h, pad)}<span class="pk-colon">:</span>${wheel(60, m, pad)}<div class="pk-band"></div></div>
      <div class="pk-quick">${quick.map(([l, t]) => `<button class="chip" data-t="${t || 'now'}">${l}</button>`).join('')}</div>
      <div class="pk-foot"><button class="btn tonal" data-pk-cancel>ביטול</button><button class="btn" data-pk-ok>${icon('check')} בחירה</button></div>`, (el, finish) => {
      const [wh, wm] = el.querySelectorAll('.pk-wheel');
      const big = el.querySelector('[data-big]');
      const show = () => { big.innerHTML = `<span>${pad(h)}</span><i>:</i><span>${pad(m)}</span>`; };
      const mark = (w, i) => w.querySelectorAll('.pk-opt').forEach((o) => o.classList.toggle('on', +o.dataset.i === i));
      function bind(w, get, set) {
        let t = null, last = get();
        const settle = () => {
          const i = Math.max(0, Math.min(w.querySelectorAll('.pk-opt').length - 1, Math.round(w.scrollTop / ROW)));
          if (i !== last) { last = i; set(i); show(); mark(w, i); if (Fx()) { Fx().play('tick'); Fx().haptic(4); } }
        };
        w.addEventListener('scroll', () => { clearTimeout(t); settle(); t = setTimeout(settle, 90); }, { passive: true });
        w.addEventListener('click', (e) => { const o = e.target.closest('.pk-opt'); if (o) w.scrollTo({ top: +o.dataset.i * ROW, behavior: 'smooth' }); });
        w.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          w.scrollTo({ top: (get() + (e.key === 'ArrowDown' ? 1 : -1)) * ROW, behavior: 'smooth' });
        });
        w.scrollTop = get() * ROW;
        mark(w, get());
      }
      requestAnimationFrame(() => {
        bind(wh, () => h, (i) => { h = i; });
        bind(wm, () => m, (i) => { m = i; });
      });
      show();
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.t) {
          const t = b.dataset.t === 'now' ? `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}` : b.dataset.t;
          h = +t.slice(0, 2); m = +t.slice(3, 5); show();
          if (Fx()) Fx().play('pop');
          setTimeout(() => finish(`${pad(h)}:${pad(m)}`), 140);
        } else if (b.hasAttribute('data-pk-cancel')) finish(null);
        else if (b.hasAttribute('data-pk-ok')) finish(`${pad(h)}:${pad(m)}`);
      });
    });
  }

  /* ---------------- turning the native inputs into picker buttons ---------------- */
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  function labelOf(input) {
    const f = input.closest('.field, label');
    const l = f && f.querySelector('.lbl');
    return (l && l.textContent.trim()) || input.getAttribute('aria-label') || '';
  }
  function enhance(input) {
    if (input.dataset.pk) return;
    const kind = input.type; // date | month | time
    input.dataset.pk = kind;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'input pk-field pk-' + kind;
    btn.setAttribute('aria-haspopup', 'dialog');
    const render = () => {
      const v = valueDesc.get.call(input);
      const text = kind === 'date' ? fmtDate(v) : kind === 'month' ? fmtMonth(v) : fmtTime(v);
      btn.innerHTML = `${icon(kind === 'time' ? 'clock' : 'calendar', 's')}<span class="${text ? 'v' : 'ph'}">${esc(text || input.placeholder || (kind === 'time' ? 'בחירת שעה' : kind === 'month' ? 'בחירת חודש' : 'בחירת תאריך'))}</span>`;
      btn.disabled = input.disabled;
      btn.setAttribute('aria-label', (labelOf(input) ? labelOf(input) + ': ' : '') + (text || 'לא נבחר'));
    };
    // code that sets input.value directly also updates the button
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return valueDesc.get.call(this); },
      set(v) { valueDesc.set.call(this, v); render(); },
    });
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (input.disabled) return;
      const o = { value: input.value, min: input.min, max: input.max, title: labelOf(input) || undefined, mode: input.dataset.pick };
      const v = kind === 'date' ? await pickDate(o) : kind === 'month' ? await pickMonth(o) : await pickTime(o);
      if (v == null || v === input.value) return;
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    input.classList.add('pk-native');
    input.tabIndex = -1;
    input.after(btn);
    render();
  }
  const SEL = 'input[type="date"]:not([data-pk]), input[type="time"]:not([data-pk]), input[type="month"]:not([data-pk])';
  function scan(rootEl) { (rootEl || document).querySelectorAll(SEL).forEach(enhance); }
  const mo = new MutationObserver((list) => {
    for (const r of list) if (r.addedNodes.length) { scan(document.body); return; }
  });
  function start() { scan(document.body); mo.observe(document.body, { childList: true, subtree: true }); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  Object.assign(UI, { pickDate, pickMonth, pickTime, fmtPickDate: fmtDate });
})(typeof window !== 'undefined' ? window : globalThis);
