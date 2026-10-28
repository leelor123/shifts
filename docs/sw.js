/* ============================================================
 * Service worker — offline app shell, runtime caching for fonts &
 * on-demand libraries, notification clicks and background checks.
 * The build injects the version; a new version installs in the
 * background and activates when the user taps "עדכן".
 * IndexedDB data is never touched by updates.
 * ============================================================ */
const VERSION = '1.23.0-81c2bca9';
const SHELL = 'shiftpay-shell-' + VERSION;
const RUNTIME = 'shiftpay-runtime-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './badge-96.png', './favicon-48.png'];

/* ---- the language ----
 * Each language is its own page (index.html is Hebrew, index.ar.html, index.ru.html, index.en.html: the build
 * writes them). The language chosen in the app is kept here, in a cache of its own (a worker cannot read the
 * page's localStorage), so opening the app serves that page at once, also offline. */
const LANGS = ['he', 'ar', 'ru', 'en', 'fr', 'es'];
const LANG_CACHE = 'shiftpay-lang';
async function chosenLang() {
  try {
    const r = await (await caches.open(LANG_CACHE)).match('./__lang');
    const l = r ? (await r.text()).trim() : 'he';
    return LANGS.includes(l) ? l : 'he';
  } catch (err) { return 'he'; }
}
const pageOf = (l) => (l === 'he' ? './index.html' : './index.' + l + '.html');
const manifestOf = (l) => (l === 'he' ? './manifest.webmanifest' : './manifest.' + l + '.webmanifest');
// a page that names its file (index.ru.html) is that file; the app's own address (./, ./?source=twa) is the chosen one
const PAGE_FILE = /\/index(?:\.(ar|ru|en|fr|es))?\.html$/;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const l = await chosenLang();
    const list = ASSETS.concat(l === 'he' ? [] : [pageOf(l), manifestOf(l)]);
    const c = await caches.open(SHELL);
    await c.addAll(list.map((u) => new Request(u, { cache: 'reload' })));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('shiftpay-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

/* ---- shared to the app (Android's share sheet: a work schedule from WhatsApp, a payslip, a report) ----
 * The share arrives as a form; what was shared is kept for a moment in its own cache, and the app opens on
 * ?action=share-in, which takes it from there (and empties it). */
const SHARE = 'shiftpay-share';
async function receiveShare(req) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const text = ['title', 'text', 'url'].map((k) => form.get(k)).filter((v) => typeof v === 'string' && v.trim()).join('\n');
    const cache = await caches.open(SHARE);
    const hasFile = file && typeof file === 'object' && file.size > 0;
    await cache.put('./__share/meta', new Response(JSON.stringify({ text, name: hasFile ? file.name || '' : '', type: hasFile ? file.type || '' : '', at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
    if (hasFile) await cache.put('./__share/file', new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }));
    else await cache.delete('./__share/file');
  } catch (err) { /* nothing usable was shared: the app opens as usual */ }
  return Response.redirect(new URL('./?action=share-in', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-in')) { e.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET') return;
  if (url.hostname === 'api.anthropic.com') return; // never cache API calls
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const named = PAGE_FILE.exec(url.pathname);
      const lang = named ? named[1] || 'he' : await chosenLang();
      const page = pageOf(lang);
      const cached = await caches.match(page, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(named ? req : page);
        // the language's page, kept for next time (and offline)
        if (res.ok && !named) caches.open(SHELL).then((c) => c.put(page, res.clone())).catch(() => {});
        return res;
      } catch (err) { return new Response(T(lang).offline, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    })());
    return;
  }
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((c) => c || fetch(req)));
    return;
  }
  // only static libraries & fonts are cached; sign-in and Firestore traffic always goes to the network
  const STATIC = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'tessdata.projectnaptha.com'];
  const isSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!STATIC.includes(url.hostname) && !isSdk) return;
  // Libraries and fonts carry their version in the address, so a copy downloaded once is reused
  // forever: nothing is downloaded again when the app opens (saves data on limited plans).
  e.respondWith((async () => {
    const cache = await caches.open(RUNTIME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return new Response('', { status: 504 });
    }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); return; } }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

/* ---- background check (Chrome periodic background sync, installed PWA only) ---- */
// what the worker says itself, in each language
const WORDS = {
  he: { offline: 'אין חיבור', timerT: 'שכחת לסיים משמרת?', timerB: 'הטיימר עדיין רץ. לחץ כדי לסיים או לתקן.', upT: 'משמרת מתקרבת', upB: 'מתחילה ב-{0}', eveB: 'מחר משמרת ב-{0}', cdT: 'עבדת במשמרת?', cdB: 'לחץ "עבדתי" כדי שהשכר ייכנס.' },
  ar: { offline: 'لا يوجد اتصال', timerT: 'هل نسيت إنهاء الوردية؟', timerB: 'المؤقت ما زال يعمل. اضغط لإنهائه أو تصحيحه.', upT: 'وردية قريبة', upB: 'تبدأ الساعة {0}', eveB: 'غدًا وردية الساعة {0}', cdT: 'هل عملت في الوردية؟', cdB: 'اضغط "عملت" ليُحتسب الأجر.' },
  ru: { offline: 'Нет подключения', timerT: 'Забыли закончить смену?', timerB: 'Таймер всё ещё идёт. Нажмите, чтобы завершить или исправить.', upT: 'Скоро смена', upB: 'Начало в {0}', eveB: 'Завтра смена в {0}', cdT: 'Вы отработали смену?', cdB: 'Нажмите «Я работал(а)», чтобы зарплата учлась.' },
  en: { offline: 'No connection', timerT: 'Forgot to end your shift?', timerB: 'The timer is still running. Tap to end or fix it.', upT: 'Shift coming up', upB: 'Starts at {0}', eveB: 'Shift tomorrow at {0}', cdT: 'Did you work the shift?', cdB: 'Tap "I worked" so the pay comes in.' },
  fr: { offline: 'Pas de connexion', timerT: 'Oublié de terminer le service ?', timerB: 'Le chrono tourne toujours. Touchez pour le terminer ou le corriger.', upT: 'Service bientôt', upB: 'Commence à {0}', eveB: 'Service demain à {0}', cdT: 'Avez-vous effectué le service ?', cdB: 'Touchez « J’ai travaillé » pour que le salaire soit compté.' },
  es: { offline: 'Sin conexión', timerT: '¿Olvidaste terminar el turno?', timerB: 'El reloj sigue en marcha. Toca para terminarlo o corregirlo.', upT: 'Turno pronto', upB: 'Empieza a las {0}', eveB: 'Turno mañana a las {0}', cdT: '¿Trabajaste el turno?', cdB: 'Toca «Trabajé» para que entre el salario.' },
};
const T = (l) => WORDS[l] || WORDS.he;
function readDb() {
  return new Promise((resolve) => {
    const req = indexedDB.open('shiftpay');
    req.onupgradeneeded = () => { req.transaction.abort(); resolve(null); }; // never create the DB from here
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const t = db.transaction(['kv', 'shifts'], 'readonly');
        const out = {};
        t.objectStore('kv').getAll().onsuccess = (ev) => { for (const x of ev.target.result) out[x.key] = x.value; };
        t.objectStore('shifts').getAll().onsuccess = (ev) => { out.shifts = ev.target.result; };
        t.oncomplete = () => { db.close(); resolve(out); };
        t.onerror = () => { db.close(); resolve(null); };
      } catch (err) { db.close(); resolve(null); }
    };
  });
}
async function backgroundCheck() {
  const d = await readDb();
  if (!d || !d.settings || !d.settings.alerts || d.settings.alerts.push === false) return;
  const A = d.settings.alerts;
  const types = A.types || {};
  const now = Date.now();
  const lang = await chosenLang(), w = T(lang);
  const opt = (body, tag) => ({ body, tag, icon: 'icon-192.png', badge: 'badge-96.png', lang, dir: lang === 'he' || lang === 'ar' ? 'rtl' : 'ltr', data: { url: './#home' } });
  const a = d.activeShift;
  if (types.timer !== false && a && a.start && now - a.start > (A.timerHours || 12) * 3600000) {
    await self.registration.showNotification(w.timerT, opt(w.timerB, 'timer-' + a.start));
  }
  // the reminders around a planned shift, as set in the app (the same tags as the app's, each shown once: the
  // list of shown ones is shared with the app in the cache 'shiftpay-shown')
  const R = A.reminders || {};
  const shownC = await caches.open('shiftpay-shown');
  const shownR = await shownC.match('./__shown');
  const shown = shownR ? await shownR.json().catch(() => ({})) : {};
  let changed = false;
  const show = async (title, body, tag) => {
    if (shown[tag]) return;
    const o = opt(body, tag);
    if (R.sticky) o.requireInteraction = true;
    if (R.silent) o.silent = true;
    await self.registration.showNotification(title, o);
    shown[tag] = now; changed = true;
  };
  const hm = (ms) => { const t = new Date(ms); return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); };
  const offs = (Array.isArray(R.before) && R.before.length ? R.before : [A.upcomingMin || 60]).map(Number).filter((x) => x > 0).sort((x, y) => x - y);
  for (const s of d.shifts || []) {
    if (s.status !== 'planned' || s.deleted) continue;
    const mins = (s.start - now) / 60000;
    if (A.remindPlanned === true && types.upcoming !== false && mins > 0) { // off unless switched on (few notifications)
      const off = offs.find((o) => mins <= o);
      if (off != null) await show(w.upT, w.upB.replace('{0}', hm(s.start)), 'up-' + s.id + '-' + off);
      if (R.eveOn && /^\d{1,2}:\d{2}$/.test(R.eve || '')) {
        const e0 = new Date(s.start); e0.setDate(e0.getDate() - 1);
        const [h, m] = R.eve.split(':').map(Number); e0.setHours(h, m, 0, 0);
        if (now >= e0.getTime() && mins > 60 && s.start - e0.getTime() > 2 * 3600000) await show(w.upT, w.eveB.replace('{0}', hm(s.start)), 'eve-' + s.id);
      }
    }
    // after it: did you work it? (it is not in the pay until confirmed)
    const ca = +R.confirmAfter || 0;
    if (types.confirmDone !== false && ca > 0 && s.end + ca * 60000 <= now && now - s.end < 3 * 86400000) await show(w.cdT, w.cdB, 'cd-' + s.id);
  }
  if (changed) {
    for (const k of Object.keys(shown)) if (now - shown[k] > 7 * 86400000) delete shown[k];
    await shownC.put('./__shown', new Response(JSON.stringify(shown), { headers: { 'Content-Type': 'application/json' } }));
  }
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'shiftpay-check') e.waitUntil(backgroundCheck()); });
