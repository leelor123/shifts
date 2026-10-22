/* ============================================================
 * lang.js — the app's language: chosen on the very first open, changed in settings any time.
 *
 * Each language is a page of its own (index.html Hebrew, index.ar.html, index.ru.html, index.en.html; see
 * tools/i18n.js), so a language costs nothing while the app runs. The choice is kept on the phone twice: in
 * localStorage, where a page looks first thing (and moves to the right page before anything is drawn), and in
 * a cache the service worker reads, so the app opens straight in its language, also offline.
 *
 * The first open: the opening show gives way to a screen that greets in all four languages at once
 * (שלום · مرحبا · Привет · Hello), with the phone's own language suggested; one tap and the app goes on in it.
 * Someone already using the app (in Hebrew) whose phone speaks another language is offered the switch once.
 *
 * Everything here is written in each language itself, so this file is never translated (tools/i18n.js).
 * ============================================================ */
(function (root) {
  'use strict';
  const { U } = root;
  const KEY = 'shaati.lang', OFFERED = 'shaati.langOffered';
  const LANGS = [
    { id: 'he', name: 'עברית', glyph: 'א', hello: 'שלום', ask: 'באיזו שפה נוח לך?', sug: 'מומלץ', later: 'אפשר לשנות בכל רגע בהגדרות', dir: 'rtl', g: ['#2ee59d', '#0fb6a8'] },
    { id: 'ar', name: 'العربية', glyph: 'ع', hello: 'مرحبا', ask: 'بأي لغة تفضّل؟', sug: 'مقترحة', later: 'يمكن التغيير في أي وقت من الإعدادات', dir: 'rtl', g: ['#ffd25a', '#ff8a3d'] },
    { id: 'ru', name: 'Русский', glyph: 'Я', hello: 'Привет', ask: 'На каком языке вам удобнее?', sug: 'Рекомендуем', later: 'Язык можно сменить в настройках', dir: 'ltr', g: ['#a98bff', '#5b8cff'] },
    { id: 'en', name: 'English', glyph: 'A', hello: 'Hello', ask: 'Which language suits you?', sug: 'Suggested', later: 'You can change it any time in Settings', dir: 'ltr', g: ['#ff7ab6', '#ff5a6e'] },
  ];
  const byId = (id) => LANGS.find((l) => l.id === id);
  const Lang = { LANGS };
  root.Lang = Lang;
  Lang.current = (U && U.LANG) || document.documentElement.lang || 'he';

  Lang.stored = function () {
    try { const l = localStorage.getItem(KEY); return byId(l) ? l : null; } catch (e) { return null; }
  };
  /** The phone's language, if the app speaks it (Hebrew also from the old code "iw"). */
  Lang.device = function () {
    const list = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).map((x) => String(x).toLowerCase());
    for (const x of list) {
      const p = x.split('-')[0];
      if (p === 'he' || p === 'iw') return 'he';
      if (byId(p)) return p;
    }
    return null;
  };
  /** Keeps the choice where the page and the service worker look for it. */
  async function remember(id) {
    try { localStorage.setItem(KEY, id); } catch (e) { /* the worker's copy still holds it */ }
    try { const c = await caches.open('shiftpay-lang'); await c.put('./__lang', new Response(id, { headers: { 'Content-Type': 'text/plain' } })); } catch (e) { /* no cache: localStorage alone */ }
  }
  const pageOf = (id) => (id === 'he' ? './index.html' : './index.' + id + '.html');
  /** The language's page put in the app's offline copy, so the move works (and stays) without internet. */
  async function fetchPage(id) {
    try {
      const shell = (await caches.keys()).find((k) => k.startsWith('shiftpay-shell-'));
      if (!shell) return true;
      const c = await caches.open(shell);
      if (await c.match(pageOf(id))) return true;
      const res = await fetch(pageOf(id), { cache: 'reload' });
      if (!res.ok) return false;
      await c.put(pageOf(id), res);
      const man = id === 'he' ? './manifest.webmanifest' : './manifest.' + id + '.webmanifest';
      fetch(man, { cache: 'reload' }).then((r) => r.ok && c.put(man, r)).catch(() => {});
      return true;
    } catch (e) { return navigator.onLine; }
  }
  /** Keeps the language; if it is not this page's, the app reopens in it (the address stays, the place in the app too). */
  Lang.set = async function (id, opts) {
    if (!byId(id)) return;
    await remember(id);
    if (id === Lang.current) return;
    const ok = await fetchPage(id);
    if (!ok) { if (root.UI) root.UI.invalid(byId(id).name + ': no connection'); return; }
    try { sessionStorage.setItem('introSeen', '1'); sessionStorage.setItem('langMove', '1'); } catch (e) { /* ignore */ }
    const hash = opts && opts.hash != null ? opts.hash : location.hash;
    location.replace(pageOf(id).replace('./', '') + location.search + hash);
  };

  /* ---------------- the picker ---------------- */
  const LOGO = '<svg viewBox="0 0 1024 1024" aria-hidden="true"><path class="g" d="M300 660 A258 258 0 0 1 603 271 L603 600"/><path class="y" d="M420 422 L420 753 A258 258 0 0 0 720 362"/></svg>';
  function markup(sug, inSheet) {
    const order = LANGS;
    const s = byId(sug) || byId(Lang.current);
    return `<div class="lp${inSheet ? ' lp-in-sheet' : ''}" role="dialog" aria-modal="true" aria-label="${LANGS.map((l) => l.ask).join(' / ')}">
      ${inSheet ? '' : `<div class="lp-orbs" aria-hidden="true"><i></i><i></i><i></i></div><div class="lp-logo">${LOGO}<b>Shaati</b></div>`}
      <div class="lp-hello" aria-hidden="true">${order.map((l, i) => `<span lang="${l.id}" dir="${l.dir}" style="--i:${i};--a:${l.g[0]}">${l.hello}</span>`).join('')}</div>
      <div class="lp-ask" aria-hidden="true">${order.map((l, i) => `<span lang="${l.id}" dir="${l.dir}" style="--i:${i}">${l.ask}</span>`).join('')}</div>
      <div class="lp-grid">${order.map((l, i) => `<button class="lp-card${l.id === s.id ? ' sug' : ''}${l.id === Lang.current && inSheet ? ' cur' : ''}" data-lang="${l.id}" lang="${l.id}" dir="${l.dir}" style="--i:${i};--g1:${l.g[0]};--g2:${l.g[1]}">
          <span class="lp-glyph" aria-hidden="true">${l.glyph}</span>
          <span class="lp-name">${l.name}</span>
          <span class="lp-hi">${l.hello}</span>
          ${l.id === s.id && !inSheet ? `<span class="lp-sug">${l.sug}</span>` : ''}
          ${l.id === Lang.current && inSheet ? '<span class="lp-tick" aria-hidden="true">✓</span>' : ''}
        </button>`).join('')}</div>
      <div class="lp-later" lang="${s.id}" dir="${s.dir}">${s.later}</div>
    </div>`;
  }
  /** The chosen card takes the screen in its colours, then the app goes on (or reopens in that language). */
  function burst(card, done) {
    const r = card.querySelector('.lp-glyph').getBoundingClientRect();
    const fill = document.createElement('div');
    fill.className = 'lp-fill';
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const reach = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy));
    fill.style.cssText = `left:${cx}px;top:${cy}px;--s:${(reach / 30).toFixed(2)};--g1:${card.style.getPropertyValue('--g1')};--g2:${card.style.getPropertyValue('--g2')}`;
    document.body.appendChild(fill);
    requestAnimationFrame(() => requestAnimationFrame(() => fill.classList.add('go')));
    setTimeout(() => done(fill), root.Fx && !root.Fx.motion() ? 0 : 520);
  }

  /**
   * The first open: a full screen before anything else. Resolves when the choice is this page's language (the
   * app goes on); for another language the app reopens in it.
   */
  Lang.firstRun = function () {
    return new Promise((resolve) => {
      const host = document.createElement('div');
      host.className = 'lp-host';
      host.innerHTML = markup(Lang.device() || 'he', false);
      document.body.appendChild(host);
      // the opening show leaves once this screen is drawn (it watches #view)
      const view = document.getElementById('view');
      if (view) view.innerHTML = '<div class="view lp-under"></div>';
      requestAnimationFrame(() => host.classList.add('in'));
      cycle(host);
      host.addEventListener('click', (e) => {
        const card = e.target.closest('.lp-card');
        if (!card || host.classList.contains('chosen')) return;
        host.classList.add('chosen');
        card.classList.add('picked');
        if (root.Fx) { root.Fx.play && root.Fx.play('pick'); }
        const id = card.dataset.lang;
        burst(card, async (fill) => {
          if (id !== Lang.current) {
            fill.classList.add('to-intro'); // under the reopening, the opening show's colours
            await Lang.set(id);
            return;
          }
          await remember(id);
          host.classList.add('out');
          fill.classList.add('fade');
          setTimeout(() => { host.remove(); fill.remove(); }, 560);
          resolve(id);
        });
      });
    });
  };
  // the greeting and the question go round the four languages
  function cycle(box) {
    const hello = box.querySelectorAll('.lp-hello span'), ask = box.querySelectorAll('.lp-ask span');
    let k = 0;
    const show = () => {
      hello.forEach((s, i) => s.classList.toggle('on', i === k));
      ask.forEach((s, i) => s.classList.toggle('on', i === k));
    };
    show();
    if (root.Fx && !root.Fx.motion()) { box.classList.add('static'); return; }
    const t = setInterval(() => {
      if (!box.isConnected) { clearInterval(t); return; }
      k = (k + 1) % LANGS.length; show();
    }, 1600);
  }

  /** In settings: the same cards in a sheet; another language reopens the app in it, on the settings tab. */
  Lang.sheet = function () {
    const UI = root.UI;
    UI.openSheet({
      title: { he: 'שפה · Language', ar: 'اللغة · Language', ru: 'Язык · Language', en: 'Language' }[Lang.current] || 'Language',
      body: markup(Lang.current, true),
      onMount: (el) => {
        cycle(el);
        el.addEventListener('click', (e) => {
          const card = e.target.closest('.lp-card');
          if (!card) return;
          const id = card.dataset.lang;
          if (id === Lang.current) { remember(id); UI.closeTop(); return; }
          card.classList.add('picked');
          burst(card, (fill) => { fill.classList.add('to-intro'); Lang.set(id, { hash: '#settings' }); });
        });
      },
    });
  };

  /** Someone who already used the app before languages existed: the page's language is kept as the choice,
   *  and if the phone speaks another one the app knows, the switch is offered once (in that language). */
  Lang.adopt = function () {
    if (Lang.stored()) return;
    remember(Lang.current);
    const d = Lang.device();
    let offered = false;
    try { offered = localStorage.getItem(OFFERED) === '1'; localStorage.setItem(OFFERED, '1'); } catch (e) { offered = true; }
    if (!d || d === Lang.current || offered) return;
    const l = byId(d);
    const T = {
      ar: ['Shaati متوفّر الآن بالعربية', 'التطبيق كله بالعربية: الورديات، الراتب، الحقوق.', 'التبديل إلى العربية', 'البقاء بالعبرية'],
      ru: ['Shaati теперь на русском', 'Всё приложение на русском: смены, зарплата, права.', 'Перейти на русский', 'Оставить иврит'],
      en: ['Shaati now speaks English', 'The whole app in English: shifts, pay, your rights.', 'Switch to English', 'Keep Hebrew'],
    }[d];
    if (!T) return;
    const go = () => {
      if (root.App && root.App.blocking) return;
      root.UI.openSheet({
        title: T[0],
        body: `<div class="lp-offer" lang="${d}" dir="${l.dir}"><span class="lp-glyph" style="--g1:${l.g[0]};--g2:${l.g[1]}" aria-hidden="true">${l.glyph}</span><p>${T[1]}</p></div>`,
        foot: `<button class="btn" data-lp-yes lang="${d}" dir="${l.dir}">${T[2]}</button><button class="btn text" data-lp-no lang="${d}" dir="${l.dir}">${T[3]}</button>`,
        onMount: (el) => {
          el.querySelector('[data-lp-yes]').onclick = () => Lang.set(d);
          el.querySelector('[data-lp-no]').onclick = () => root.UI.closeTop();
        },
      });
    };
    if (root.Intro && root.Intro.after) root.Intro.after(go, 1400); else setTimeout(go, 1400);
  };
})(typeof window !== 'undefined' ? window : globalThis);
