/* ============================================================
 * Service worker — offline app shell, runtime caching for fonts &
 * on-demand libraries, notification clicks and background checks.
 * The build injects the version; a new version installs in the
 * background and activates when the user taps "עדכן".
 * IndexedDB data is never touched by updates.
 * ============================================================ */
const VERSION = '1.12.0-266f66c8';
const SHELL = 'shiftpay-shell-' + VERSION;
const RUNTIME = 'shiftpay-runtime-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './badge-96.png', './favicon-48.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('shiftpay-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'api.anthropic.com') return; // never cache API calls
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match('./index.html', { ignoreSearch: true });
      if (cached) return cached;
      try { return await fetch(req); } catch (err) { return new Response('אין חיבור', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
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
  const opt = (body, tag) => ({ body, tag, icon: 'icon-192.png', badge: 'badge-96.png', lang: 'he', dir: 'rtl', data: { url: './#home' } });
  const a = d.activeShift;
  if (types.timer !== false && a && a.start && now - a.start > (A.timerHours || 12) * 3600000) {
    await self.registration.showNotification('שכחת לסיים משמרת?', opt('הטיימר עדיין רץ. לחץ כדי לסיים או לתקן.', 'timer-' + a.start));
  }
  if (types.upcoming !== false) {
    for (const s of d.shifts || []) {
      if (s.status !== 'planned') continue;
      const mins = (s.start - now) / 60000;
      if (mins > 0 && mins <= Math.max(A.upcomingMin || 60, 90)) {
        const t = new Date(s.start);
        await self.registration.showNotification('משמרת מתקרבת', opt(`מתחילה ב-${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, 'up-' + s.id));
      }
    }
  }
}
self.addEventListener('periodicsync', (e) => { if (e.tag === 'shiftpay-check') e.waitUntil(backgroundCheck()); });
