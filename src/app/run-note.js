/* ============================================================
 * run-note.js — the notification that stays while a shift runs (off unless switched on in Settings › התראות).
 *
 * One notification, shown through the service worker with a fixed tag (RunNote.TAG) so each showing replaces the
 * last: when the shift began, about how much it has made so far, and a "סיום משמרת" button. Silent (no sound, no
 * buzz), and it stays until the shift ends where the phone allows that (requireInteraction).
 *
 * Honest about its limits: the amount is worked out here, by the app, so it moves on only while the app runs (at
 * most every 15 minutes, and at once when the shift changes: a break, another role). A browser gives a closed web
 * app no timer to wake it, so with the app closed the notification keeps its last amount, and it says the time of
 * that amount ("עד 17:45").
 *
 * The button: sw.js keeps the tap ({ at, start } in the cache 'shiftpay-shown', ./__runnote) and opens the app,
 * which ends that shift at the tapped time, the way a stop from the home-screen widget does (widgets.js), and the
 * shift's screen opens after it (App.stopShift). A link with ?action=stop asks first, since any site could send
 * one; this tap needs no question, as only the worker writes the kept tap and only for the shift that ran.
 *
 * Closed whenever there is no running shift any more, whatever ended it: the app, a widget tap the app has taken,
 * another phone through sync (Store's 'active' event, remote too), a restore or a wipe. With the app closed nothing
 * here runs: a stop on a widget or on another phone closes it when the app next opens (the worker's background
 * check in sw.js, where the browser runs one, closes one left behind). Swiped away by hand: not shown again
 * for that shift (the worker keeps which one).
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U } = root;
  const R = root.RunNote;
  const S = Store.S;
  if (!R) return;
  const KEPT = './__runnote';

  const wanted = () => { const A = S.settings && S.settings.alerts; return !!A && A.runNote === true && A.push !== false; };
  const supported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  const allowed = () => supported() && Notification.permission === 'granted';
  async function reg() { try { return (await navigator.serviceWorker.getRegistration()) || null; } catch (e) { return null; } }
  async function readKept() {
    try { const r = await (await caches.open('shiftpay-shown')).match(KEPT); return r ? (await r.json()) || {} : {}; } catch (e) { return {}; }
  }
  async function writeKept(o) {
    try { await (await caches.open('shiftpay-shown')).put(KEPT, new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } })); } catch (e) { /* ignore */ }
  }

  let last = null; // { key, at } of the last showing in this session
  async function close() {
    last = null;
    const r = await reg();
    if (!r || !r.getNotifications) return;
    try { (await r.getNotifications({ tag: R.TAG })).forEach((n) => n.close()); } catch (e) { /* ignore */ }
  }
  let running = false, again = false;
  /** Show, update or close the notification to match the running shift. force: show now even if shown lately. */
  async function sync(force) {
    if (running) { again = true; return; }
    running = true;
    try {
      const a = S.activeShift;
      if (!a || !a.start || !wanted() || !allowed()) { await close(); return; }
      if (!App.model) return;
      const key = R.keyOf(a) + '|' + (S.settings.hideMoney ? 1 : 0);
      const now = Date.now();
      if (!force && !R.due(last, key, now)) return;
      const kept = await readKept();
      if (+kept.closed === +a.start) return; // swiped away by hand for this shift
      const r = await reg();
      if (!r) return;
      let wage = null;
      try { const p = App.previewActive(); wage = p ? p.wage : null; } catch (e) { /* the amount is left out */ }
      const c = R.content({ start: a.start, now, wage, hideMoney: !!S.settings.hideMoney, onBreak: App.onBreak && App.onBreak() });
      await r.showNotification(c.title, {
        body: c.body, tag: R.TAG, renotify: false, silent: true, requireInteraction: true, timestamp: a.start,
        icon: 'icon-192.png', badge: 'badge-96.png', lang: U.LANG, dir: U.RTL ? 'rtl' : 'ltr',
        data: { url: './#home', run: a.start },
        actions: [{ action: 'stop', title: 'סיום משמרת' }],
      });
      last = { key, at: now };
    } catch (e) { console.warn('run note', e); } finally {
      running = false;
      if (again) { again = false; sync(false); }
    }
  }

  /** The "end shift" tap kept by the worker: done once, only for the shift it was tapped on. */
  let taking = false;
  async function takeStop() {
    if (taking) return;
    taking = true;
    try {
      const kept = await readKept();
      if (!kept.stop) return;
      const p = kept.stop;
      delete kept.stop;
      await writeKept(kept); // first: a reload in the middle must never end a shift twice
      if (!R.pendingFits(p, S.activeShift, Date.now())) return;
      await App.stopShift(null, +p.at);
    } catch (e) { console.warn('run note stop', e); } finally { taking = false; }
  }
  // the app may still be opening (its data loading, the code lock up): the tap waits for it, as the widgets' taps do
  function whenReady(fn, n) {
    if (App.model && App.afterUnlock && S.settings && S.settings.onboarded) App.afterUnlock(fn);
    else if ((n || 0) < 60) setTimeout(() => whenReady(fn, (n || 0) + 1), 500);
  }

  /** The switch in Settings › התראות, turned on: a short word on why, then the phone's own question. True when on. */
  async function turnOn() {
    const done = (title, text) => UI.dialog({ title, text, buttons: [{ label: 'הבנתי', value: true }] }).then(() => false);
    if (!supported()) return done('אי אפשר כאן', 'הדפדפן הזה לא מציג התראות של אפליקציות. בטלפון אנדרואיד זה עובד באפליקציה של שעתי.');
    let perm = Notification.permission;
    if (perm === 'default') {
      const go = await UI.confirm('התראה בזמן משמרת', 'כשמשמרת רצה תופיע התראה אחת, בלי צליל: מתי התחלת, בערך כמה הרווחת, וכפתור לסיום. בשביל זה הטלפון ישאל אם לאשר לשעתי לשלוח התראות.', 'המשך');
      if (!go) return false;
      try { perm = await Notification.requestPermission(); } catch (e) { perm = Notification.permission; }
    }
    if (perm !== 'granted') {
      return done('ההתראות חסומות', App.androidApp
        ? 'הטלפון חוסם את ההתראות של שעתי. כדי לאשר: הגדרות הטלפון › אפליקציות › Shaati › התראות. אחר כך מפעילים כאן שוב.'
        : 'הדפדפן חוסם את ההתראות של שעתי. כדי לאשר: לוחצים על סמל המנעול ליד הכתובת › התראות › לאשר. אחר כך מפעילים כאן שוב.');
    }
    await Store.setSettings((st) => { st.alerts.runNote = true; st.alerts.push = true; });
    const kept = await readKept();
    if (kept.closed) { delete kept.closed; await writeKept(kept); }
    last = null;
    await sync(true);
    return true;
  }
  async function turnOff() {
    await Store.setSettings((st) => { st.alerts.runNote = false; });
    await close();
  }
  App.runNote = { sync, close, takeStop, turnOn, turnOff, wanted, allowed };

  let soon = 0;
  const later = () => { clearTimeout(soon); soon = setTimeout(() => sync(false), 400); };
  Store.on(later); // a shift started, ended, changed, deleted, here or on another phone; a setting changed
  setInterval(() => sync(false), 60000); // R.due keeps it to every 15 minutes
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { later(); whenReady(takeStop); } });
  if (supported()) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      const t = e.data && e.data.type;
      if (t === 'shaati-run-stop') whenReady(takeStop);
      // the notification's body: the home screen, unless something is half-filled on the screen
      else if (t === 'shaati-go-home' && !App.blocking && !document.querySelector('.sheet, .dialog') && App.tab !== 'home') App.go('home');
    });
  }
  whenReady(() => { takeStop(); sync(true); });
})(typeof window !== 'undefined' ? window : globalThis);
