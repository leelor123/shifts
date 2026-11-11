/* ============================================================
 * Service worker — offline app shell, runtime caching for fonts &
 * on-demand libraries, notification clicks and background checks.
 * The build injects the version; a new version installs in the
 * background and activates when the user taps "עדכן".
 * IndexedDB data is never touched by updates.
 * ============================================================ */
const VERSION = '1.37.0-acbf66b5';
const SHELL = 'shiftpay-shell-' + VERSION;
const RUNTIME = 'shiftpay-runtime-v1';
const FONTS = ['rubik-hebrew', 'rubik-latin', 'rubik-latin-ext', 'rubik-arabic', 'rubik-cyrillic', 'rubik-cyrillic-ext', 'fredoka-hebrew', 'fredoka-latin', 'fredoka-latin-ext'].map((f) => './fonts/' + f + '.woff2');
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './badge-96.png', './favicon-48.png'];

/* ---- the language ----
 * Each language is its own page (index.html is Hebrew, index.ar.html, index.ru.html, index.en.html: the build
 * writes them). The language chosen in the app is kept here, in a cache of its own (a worker cannot read the
 * page's localStorage), so opening the app serves that page at once, also offline. */
const LANGS = ['he', 'ar', 'ru', 'en', 'fr', 'es', 'am'];
const LANG_CACHE = 'shiftpay-lang';
async function chosenLang() {
  try {
    const r = await (await caches.open(LANG_CACHE)).match('./__lang');
    const l = r ? (await r.text()).trim() : 'he';
    return LANGS.includes(l) ? l : 'he';
  } catch (err) { return 'he'; }
}
// the app's code, a file per language named by the build (VERSION is <version>-<build>)
const jsOfBuild = (l, build) => './app.' + l + '.' + String(build).split('-')[1] + '.js';
const jsOf = (l) => jsOfBuild(l, VERSION);
const pageOf = (l) => (l === 'he' ? './index.html' : './index.' + l + '.html');
const manifestOf = (l) => (l === 'he' ? './manifest.webmanifest' : './manifest.' + l + '.webmanifest');
// a page that names its file (index.ru.html) is that file; the app's own address (./, ./?source=twa) is the chosen one
const PAGE_FILE = /\/index(?:\.(ar|ru|en|fr|es|am))?\.html$/;

/* ---- a visit in a browser gets the version that is live now ----
 * The installed app (its address carries ?source=) opens from the copy kept here at once and switches to a new
 * version when it goes to the background. A visit in a browser (from the website, a shared link) asks the server
 * for the page first, for a moment: a copy kept from an earlier visit was an old version. The question is cheap
 * (the browser asks "changed since?" and gets "no" when it hasn't); offline it fails at once and the copy opens.
 * A slow answer still counts: see keepLive below (the user, 24 Oct: the website's button opened an old version). */
const FRESH_WAIT = 800;
const verOf = (build) => String(build).split('-')[0].split('.').map(Number);
const olderThan = (a, b) => { const x = verOf(a), y = verOf(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); return false; };
const newer = (build) => !!build && build !== VERSION && !olderThan(build, VERSION);
const pageRes = (html, build) => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Build': build } });
// the page that is live now, when it is a newer version than the copy here ({ html, build }), else null
function askLive(page) {
  return fetch(page, { cache: 'no-cache' }).then(async (res) => {
    if (!res.ok) return null;
    const html = await res.text();
    const m = /APP_BUILD = '([^']+)'/.exec(html);
    // the same version as the copy here, or older (a server still catching up after a release): the copy
    return m && newer(m[1]) ? { html, build: m[1] } : null;
  }).catch(() => null);
}
/* An answer that came after the wait (a slow network): the newer page is kept with its code, ready for the next look,
 * and the page that opened from the copy is told. Its opening show waits on its first frame for that word for a moment
 * (intro.js), and opens the newer page in its place: the same first frame, so nothing is seen to change. */
const FRESH = 'shiftpay-fresh';
// the page (its client id) → { found: a newer page is live (its code still on its way), kept: its build once kept, or null }
const asking = new Map();
async function keepLive(page, lang, live) {
  try {
    const code = await fetch(jsOfBuild(lang, live.build));
    if (!code.ok) return false;
    await caches.delete(FRESH);
    const c = await caches.open(FRESH);
    await c.put(jsOfBuild(lang, live.build), code);
    await c.put(page, pageRes(live.html, live.build));
    return true;
  } catch (err) { return false; }
}
async function keptLive(page) {
  if (!(await caches.has(FRESH))) return null;
  const r = await (await caches.open(FRESH)).match(page);
  if (r && newer(r.headers.get('X-Build'))) return r;
  if (r) await caches.delete(FRESH); // this version has caught up with it
  return null;
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const l = await chosenLang();
    const list = ASSETS.concat([jsOf('he')], l === 'he' ? [] : [pageOf(l), manifestOf(l), jsOf(l)]);
    const c = await caches.open(SHELL);
    await c.addAll(list.map((u) => new Request(u, { cache: 'reload' })));
    // the fonts (fonts/, served here): kept apart from the version, they are fetched once and work offline
    const fc = await caches.open(RUNTIME);
    await Promise.all(FONTS.map(async (f) => { if (!(await fc.match(f))) await fc.add(f).catch(() => {}); }));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => (k.startsWith('shiftpay-shell-') && k !== SHELL) || k === FRESH).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  // the opening show asks whether the server's answer is still on its way: 'asking', 'found' (a newer page, its code
  // on its way), then { live: build } or 'none'
  else if (e.data === 'asking?' && e.ports && e.ports[0]) {
    const port = e.ports[0], a = e.source && asking.get(e.source.id);
    port.postMessage(a ? 'asking' : 'none');
    if (a) {
      a.found.then((f) => { if (f) port.postMessage('found'); });
      e.waitUntil(a.kept.then((build) => port.postMessage(build ? { live: build } : 'none')));
    }
  }
});

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
  // only the app's own pages are the app: any other page at this address (the privacy policy, the terms, the
  // accessibility statement, deleting an account) is that page from the server. Every page load used to get the app,
  // so the website's links to the policy opened the app for anyone who had used it (the owner, 3 Nov 2026)
  if (req.mode === 'navigate' && url.origin === self.location.origin && url.pathname !== new URL(self.registration.scope).pathname && !PAGE_FILE.test(url.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const named = PAGE_FILE.exec(url.pathname);
      const lang = named ? named[1] || 'he' : await chosenLang();
      const page = pageOf(lang);
      const cached = await caches.match(page, { ignoreSearch: true });
      // a browser visit: no ?source= (the installed app) and no ?action= (its shortcuts), unless the website sent it
      // (its buttons add ?from=site, also to a shortcut like ?action=tax-refund)
      const p = url.searchParams;
      if (cached && !p.has('source') && (!p.has('action') || p.get('from') === 'site')) {
        const kept = await keptLive(page);
        if (kept) return kept;
        const ask = askLive(page);
        const live = await Promise.race([ask, new Promise((r) => setTimeout(() => r(undefined), FRESH_WAIT))]);
        if (live) return pageRes(live.html, live.build);
        if (live === undefined && e.resultingClientId) {
          const id = e.resultingClientId;
          const kept = ask.then(async (got) => (got && (await keepLive(page, lang, got)) ? got.build : null));
          asking.set(id, { found: ask.then((got) => !!got), kept });
          e.waitUntil(kept.then(() => new Promise((r) => setTimeout(r, 3000))).then(() => asking.delete(id)));
        }
        return cached;
      }
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
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((c) => c || fetch(req).then((res) => {
      if (res.ok && url.pathname.includes('/fonts/')) { const copy = res.clone(); caches.open(RUNTIME).then((k) => k.put(req, copy)).catch(() => {}); }
      // a page's code file (app.<lang>.<build>.js) is kept with the version's pages, whatever language it is: a page held here
      // must always find its own code (a language chosen after the install was not kept, and the server has a newer one)
      else if (res.ok && /\/app[.][a-z]{2}[.][0-9a-f]+[.]js$/.test(url.pathname)) { const copy = res.clone(); caches.open(SHELL).then((k) => k.put(req, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }
  // only static libraries & fonts are cached; sign-in and Firestore traffic always goes to the network
  const STATIC = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'cdn.sheetjs.com', 'tessdata.projectnaptha.com'];
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

/* ---- the notification that stays while a shift runs (app/run-note.js, core/runnote.js) ----
 * Its "end shift" button: the tap is kept here with its time and the shift it was on, and the app is opened (or
 * told, when it is open); the app ends that shift at the tapped time and opens its screen. Its body opens the app on
 * the home screen. Swiped away by hand: the app does not show it again for that shift. */
const RUN_TAG = 'shaati-running';
async function runKept(fn) {
  const c = await caches.open('shiftpay-shown');
  const r = await c.match('./__runnote');
  const o = r ? await r.json().catch(() => ({})) : {};
  fn(o);
  await c.put('./__runnote', new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } }));
}
async function closeRunning() {
  try { (await self.registration.getNotifications({ tag: RUN_TAG })).forEach((n) => n.close()); } catch (err) { /* ignore */ }
}
async function runClick(e) {
  const d = e.notification.data || {};
  const stop = e.action === 'stop';
  if (stop && d.run) await runKept((o) => { o.stop = { at: Date.now(), start: d.run }; }).catch(() => {});
  const msg = { type: stop ? 'shaati-run-stop' : 'shaati-go-home' };
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of all) {
    if ('focus' in c) { try { await c.focus(); } catch (err) { /* ignore */ } c.postMessage(msg); return; }
  }
  if (self.clients.openWindow) await self.clients.openWindow('./#home');
}
self.addEventListener('notificationclose', (e) => {
  const d = e.notification.data || {};
  if (e.notification.tag === RUN_TAG && d.run) e.waitUntil(runKept((o) => { o.closed = d.run; }).catch(() => {}));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.notification.tag === RUN_TAG) { e.waitUntil(runClick(e)); return; }
  // the notification's own place (its shift, its payslip, the month's story...) or the button's (core/noteplan.js look)
  const d = e.notification.data || {};
  const url = (e.action && d.acts && d.acts[e.action]) || d.url || './';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // the app is open: it goes there itself, without loading again (app/phone-notes.js)
    for (const c of all) { if ('focus' in c) { try { await c.focus(); } catch (err) { /* ignore */ } c.postMessage({ type: 'shaati-open', url }); return; } }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});

/* ---- background check (Chrome periodic background sync, an installed web app only) ----
 * The app keeps the notifications of the coming days, already in words (app/phone-notes.js, core/noteplan.js), in the
 * cache 'shiftpay-shown' (./__plan); this shows the ones whose time has come, each once (the list of shown ones is
 * shared with the app: ./__shown). Inside the Android app the phone's own alarms show them (NoteCenter.java). */
// what the worker says itself, in each language
const WORDS = {
  he: { offline: 'אין חיבור' }, ar: { offline: 'لا يوجد اتصال' }, ru: { offline: 'Нет подключения' }, en: { offline: 'No connection' },
  fr: { offline: 'Pas de connexion' }, es: { offline: 'Sin conexión' }, am: { offline: 'ግንኙነት የለም' },
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
        const t = db.transaction(['kv'], 'readonly');
        const out = {};
        t.objectStore('kv').getAll().onsuccess = (ev) => { for (const x of ev.target.result) out[x.key] = x.value; };
        t.oncomplete = () => { db.close(); resolve(out); };
        t.onerror = () => { db.close(); resolve(null); };
      } catch (err) { db.close(); resolve(null); }
    };
  });
}
async function backgroundCheck() {
  const d = await readDb();
  // the running-shift notification: closed when the phone's data has no running shift (or the switch is off) and it
  // was left behind (the app was closed before it could close it). A stop on another phone or on a widget reaches
  // this data only when the app opens, so until then it stays
  if (d) { const A0 = (d.settings && d.settings.alerts) || {}; if (!d.activeShift || A0.runNote !== true || A0.push === false) await closeRunning(); }
  if (!d || !d.settings || !d.settings.alerts || d.settings.alerts.push === false) return;
  const R = d.settings.alerts.reminders || {};
  const now = Date.now();
  const lang = await chosenLang();
  const c = await caches.open('shiftpay-shown');
  const planR = await c.match('./__plan');
  const plan = planR ? await planR.json().catch(() => null) : null;
  if (!plan || !Array.isArray(plan.notes)) return;
  const shownR = await c.match('./__shown');
  const shown = shownR ? await shownR.json().catch(() => ({})) : {};
  let changed = false;
  for (const n of plan.notes) {
    if (!n || !n.tag || shown[n.tag] || !(n.at <= now) || (n.until && n.until < now)) continue;
    const acts = {};
    for (const x of n.acts || []) acts[x.id] = x.url;
    const o = { body: n.body, tag: n.tag, icon: 'icon-192.png', badge: 'badge-96.png', lang, dir: lang === 'he' || lang === 'ar' ? 'rtl' : 'ltr',
      timestamp: n.when || n.at, data: { url: n.url || './#home', acts }, actions: (n.acts || []).slice(0, 2).map((x) => ({ action: x.id, title: x.title })) };
    if (n.ch === 'shifts') { if (R.sticky) o.requireInteraction = true; if (R.silent) o.silent = true; }
    await self.registration.showNotification(n.title, o);
    shown[n.tag] = now; changed = true;
  }
  if (changed) {
    for (const k of Object.keys(shown)) if (now - shown[k] > 7 * 86400000) delete shown[k];
    await c.put('./__shown', new Response(JSON.stringify(shown), { headers: { 'Content-Type': 'application/json' } }));
  }
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'shiftpay-check') e.waitUntil(backgroundCheck()); });
