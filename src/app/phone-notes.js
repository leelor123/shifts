/* ============================================================
 * phone-notes.js — the notifications of the coming days, handed to the phone while the app is open, so they come
 * at their time also when it is closed (core/noteplan.js says which and how they look).
 *
 *   - Inside the Android app: over the widgets' message channel (app/widgets.js). The Android app says it can
 *     ("shaati:notes"), gets the list ({"notes": 1, "plan": [...]}) and shows each one with the phone's own alarms
 *     (android/widgets/java/NoteCenter.java). What the app sends now goes the same way ({"notes": 1, "show": [...]}),
 *     so every notification looks the same and none comes twice.
 *   - In a browser: the list is kept for the offline worker (cache 'shiftpay-shown', ./__plan), which shows the ones
 *     due when Chrome lets it look (periodic background sync, an installed web app only).
 * The list is made again a few seconds after anything changes, when the app comes back to the front, and every half
 * hour while it is open. Working it out runs the insights some dozens of times: one at a time, between frames.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, U } = root;
  const S = Store.S;
  const NP = root.NotePlan;
  const MIN = 60000, DAY = 24 * 60 * MIN;

  let native = false;
  const queued = []; // [alert, look] to show once the Android app says it can (App.phoneNotes.later)
  const waiters = [];
  /** How long a notification still makes sense when the phone shows it late (it was off): a reminder before a shift
   *  until the shift starts, "did you work it?" for three days, a timer left running for a day, the rest until the
   *  end of their day. */
  function until(a, at, model) {
    const r = a.ref && model ? model.results.get(a.ref) : null;
    if (a.type === 'upcoming' && r) return r.start;
    if (a.type === 'confirmDone') return at + 3 * DAY;
    if (a.type === 'timer') return at + DAY;
    return U.toEpoch(U.addDays(U.epochKey(at), 1), '00:00');
  }
  /** One notification as the phone keeps it. */
  function item(a, n, at) {
    // no sub-line on the phone: Samsung puts it on the title's row and cut the title ("השבוע שלך: ...", seen on the
    // phone, 9 Nov 2026); the title says the kind already
    return { at, tag: a.key, type: a.type, title: n.title, body: n.body, sub: '', ch: n.ch, url: n.url, when: n.when || 0,
      until: until(a, at, App.model), acts: n.acts.slice(0, 2).map((x) => ({ id: x.id, title: x.title, url: x.url })) };
  }
  /** A Shaati notification already came today: shown by the app or the worker (./__shown), or due earlier today in the
   *  list the phone had (its own alarms show those while the app is closed, ./__plan). Then no daily message today. */
  async function shownToday(now) {
    if (!root.caches) return false;
    const from = U.toEpoch(U.epochKey(now), '00:00');
    try {
      const c = await caches.open('shiftpay-shown');
      const sr = await c.match('./__shown');
      const shown = sr ? await sr.json() : {};
      if (Object.keys(shown).some((k) => k.indexOf('daily-') !== 0 && shown[k] >= from && shown[k] <= now)) return true;
      const pr = await c.match('./__plan');
      const plan = pr ? await pr.json() : null;
      return !!(plan && Array.isArray(plan.notes) && plan.notes.some((n) => n && n.at >= from && n.at <= now));
    } catch (e) { return false; }
  }
  const idle = () => new Promise((res) => (root.requestIdleCallback ? root.requestIdleCallback(() => res(), { timeout: 400 }) : setTimeout(res, 16)));

  /** The notifications of the coming days, in words. */
  async function build() {
    if (!NP || !App.model || !App.alertsAt || !S.settings.onboarded || !S.settings.alerts.push) return [];
    const now = Date.now();
    const a = S.activeShift;
    const ts = NP.times(App.model, S.settings.alerts, a, a && App.usualShiftMs ? App.usualShiftMs(a.roleId) : 0, now);
    const at = new Map([[now, App.alertsAt(now)]]);
    for (const t of ts) { await idle(); at.set(t, App.alertsAt(t)); }
    const known = new Set(S.notifications.map((n) => n.key));
    const list = NP.plan((t) => at.get(t) || [], ts, { now, sent: (k) => known.has(k), pushed: S.meta.lastAnomalyPush });
    // not opened for some days: "forgot to log a shift?" (moved on by every open, since the list is made again)
    const A = S.settings.alerts;
    const off = NP.away(now, { on: (A.types || {}).away !== false, days: A.awayDays, hasShifts: S.shifts.some((s) => s.status === 'done' && !s.deleted), active: !!a });
    if (off) list.push(off);
    // one useful message a day, on the days nothing else comes (core/noteplan.js daily)
    if ((A.types || {}).daily !== false) {
      const busy = new Set(list.map((x) => U.epochKey(x.at)));
      if (await shownToday(now)) busy.add(U.epochKey(now));
      const R = A.reminders || {};
      for (const x of NP.daily(App.model, { now, hour: A.dailyHour, busy: (k) => busy.has(k), eveReminder: A.remindPlanned === true && !!R.eveOn })) list.push(x);
    }
    return list.map((x) => item(x.alert, App.noteLook(x.alert, x.at), x.at));
  }

  let last = '', timer = 0, busy = false, again = false;
  async function send() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const plan = await build();
      const json = JSON.stringify(plan);
      if (json === last) return;
      last = json;
      if (native && App.widgets) App.widgets.post(JSON.stringify({ notes: 1, plan }));
      // the offline worker's copy: it shows them in a browser; inside the Android app (native) it only reads them for
      // "was there a notification today" and shows none (sw.js backgroundCheck)
      if (root.caches) {
        const c = await caches.open('shiftpay-shown');
        await c.put('./__plan', new Response(JSON.stringify({ at: Date.now(), notes: plan, native: native || !!App.androidApp }), { headers: { 'Content-Type': 'application/json' } }));
      }
    } catch (e) { console.warn('phone notes', e); } finally {
      busy = false;
      if (again) { again = false; soon(); }
    }
  }
  function soon(ms) { clearTimeout(timer); timer = setTimeout(send, ms == null ? 4000 : ms); }

  App.phoneNotes = {
    /** The Android app said it shows notifications itself (NoteCenter): it gets the list at once. */
    hello() {
      native = true;
      last = '';
      // what came before the channel was up: shown now, in the phone's own look
      for (const [a, n] of queued.splice(0)) { if (App.widgets) App.widgets.post(JSON.stringify({ notes: 1, show: [item(a, n, Date.now())] })); if (App.shownNote) App.shownNote(a.key, true); }
      waiters.splice(0).forEach((f) => f(true));
      soon(500);
    },
    get native() { return native; },
    /** Whether the Android app shows the notifications: inside it, the hello comes a few seconds after the page opens
     *  (the notifications of the opening wait for it); in a browser, at once no. */
    ready(ms) {
      if (native) return Promise.resolve(true);
      if (!App.androidApp || !App.widgets) return Promise.resolve(false);
      return new Promise((res) => {
        const t = setTimeout(() => res(false), ms || 8000);
        waiters.push((v) => { clearTimeout(t); res(v); });
      });
    },
    /** Show this one now (the Android app shows it in its own look, once per tag). */
    /** Closes every Shaati notification on the phone whose reason is gone: only the tags given (the alerts true now)
     *  stay. The Android app closes its own (NoteCenter "keep"); in a browser the worker's are closed here. The
     *  running-shift notification has a life of its own (app/run-note.js) and is never touched. */
    async keepOnly(keys) {
      const keep = new Set(keys || []);
      if (native && App.widgets) App.widgets.post(JSON.stringify({ notes: 1, keep: [...keep] }));
      try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
        if (!reg || !reg.getNotifications) return;
        for (const n of await reg.getNotifications()) {
          const ours = n.data && typeof n.data.url === 'string' && n.data.url.indexOf('action=note') >= 0;
          if (ours && n.tag && !keep.has(n.tag)) n.close();
        }
      } catch (e) { /* none to close */ }
    },
    /** Inside the Android app before its hello: kept and shown at the hello (a notification never goes through Chrome). */
    later(a, n) { if (native) { this.show(a, n); return; } if (!queued.some(([x]) => x.key === a.key)) queued.push([a, n]); },
    show(a, n) { if (native && App.widgets) App.widgets.post(JSON.stringify({ notes: 1, show: [item(a, n, Date.now())] })); },
    send: () => soon(0),
    build,
  };

  Store.on(() => soon()); // a shift planned, moved or deleted; a setting changed; a backup made
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(); });
  setInterval(() => { if (document.visibilityState === 'visible') soon(0); }, 30 * MIN);
  soon(6000);

  // a tap on a notification (or one of its buttons) while the app is open: the worker hands its address here, and the
  // app goes there without loading again
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data || e.data.type !== 'shaati-open' || typeof e.data.url !== 'string') return;
      let u;
      try { u = new URL(e.data.url, location.href); } catch (err) { return; }
      if (u.origin !== location.origin) return;
      const p = u.searchParams;
      const action = p.get('action');
      if (action === 'start' || action === 'arrive') App.pendingEmp = root.Arrive ? root.Arrive.cleanEmp(p.get('emp')) : '';
      if (action === 'arrive') App.pendingArrive = root.Arrive ? root.Arrive.arrivedAt(p.get('t'), Date.now()) : null;
      if (action === 'note') App.pendingNote = { type: p.get('type') || '', key: p.get('key') || '', ref: p.get('ref') || '', data: { pk: p.get('pk') || '', year: p.get('year') || '' } };
      if (action && App.doAction && !App.blocking) App.doAction(action);
      else if (!action && !App.blocking && !document.querySelector('.sheet, .dialog') && App.tab !== 'home') App.go('home');
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
