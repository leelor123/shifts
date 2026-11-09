/* ============================================================
 * widgets.js — the numbers for the home-screen widgets of the Android app (android/widgets).
 *
 * The Android app opens a message channel to this page once it has loaded (LauncherActivity) and says
 * hello with a port; the page answers on that port with a snapshot (JSON) of what the widgets show, and
 * sends a new one whenever its numbers change, when it comes back to the front, and every ten minutes
 * while open (the month's forecast moves with time). The widgets keep the last one; the running shift's
 * clock and the days to payday are counted on the phone itself.
 *
 * The snapshot carries text ready to show (money written out the way the app writes it), so the widgets
 * show exactly what the home screen shows.
 *
 * The widgets' start and end buttons work on the home screen, without opening the app: the phone keeps each tap
 * (a "start" or "stop" with its time and an id) and draws the widget as if it had happened. When the app opens or
 * comes back to the front it gets the taps over the same channel, starts or ends the shift at the tapped time,
 * and its next snapshot carries the last id it has done (wid), so the phone drops those. Nothing here leaves the phone: the channel only reaches the
 * Shaati app it runs in (Chrome checks the app against the site's Digital Asset Links).
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, U, Engine } = root;
  const S = Store.S;
  const m0 = (n) => U.money(n || 0, 0);
  // the app's language: the widgets and the quick-settings tile speak it (their own texts and direction), whatever
  // language the phone is set to. An older snapshot has none and the phone shows it in Hebrew, as before.
  const LANG = U.LANG || 'he';
  const rateText = (role, at) => { const r = role ? Engine.roleRate(role, U.epochKey(at)) : 0; return r ? U.money(r) + ' לשעה' : ''; };
  /** The role a shift started from the widget gets: the last one chosen, or the only one. None (several roles and
   *  none chosen yet): the widget opens the app to ask, as the home screen does. */
  const widgetRole = () => {
    const roles = App.roles();
    return (S.meta.lastRole && roles.find((r) => r.id === S.meta.lastRole)) || (roles.length === 1 ? roles[0] : null);
  };

  /** What the widgets show now, or null before the app has data. */
  App.widgetSnapshot = function () {
    const emp = S.employers[0];
    if (!emp || !App.model || !S.settings.onboarded) return null;
    const today = U.todayKey();
    const P = Engine.periodOf(today, emp);
    const sum = Engine.periodSummary(App.model, P.key, emp.id);
    const proj = App.insights && App.insights.projection;
    const goalAmt = +S.settings.goal.amount || 0;
    const goalNet = S.settings.goal.type === 'net';
    const cur = goalNet ? sum.net.net : sum.gross;
    const day = Engine.rangeSummary(App.model, today, today);
    // the next payday (of the period that ended, or this one) and about how much is coming
    const next = [Engine.periodOf(U.addDays(P.from, -1), emp), P].find((x) => x.payDate && x.payDate >= today);
    const paySum = next && Engine.periodSummary(App.model, next.key, emp.id);
    // saving up for something (as on the home screen's card)
    const g = S.settings.saving || {};
    let saving = null;
    if (+g.price > 0 && g.name) {
      const from = g.from && g.from <= today ? g.from : today;
      const have = Math.max(0, (Engine.rangeSummary(App.model, from, today).net || {}).net || 0);
      saving = { name: g.name, pct: Math.min(100, Math.floor((have / g.price) * 100)), left: m0(Math.max(0, g.price - have)) };
    }
    const a = S.activeShift;
    let active = null;
    if (a && a.start) {
      const br = a.breaks || [];
      const open = br.length && !br[br.length - 1].to ? br[br.length - 1] : null;
      active = {
        start: a.start, breakAt: open ? open.from : 0,
        breakMs: br.filter((b) => b.to).reduce((s, b) => s + (b.to - b.from), 0),
        role: App.roleName(a.roleId) || '', rate: rateText(App.role(a.roleId), a.start),
      };
    }
    // what a start from the widget shows until the app has it
    const nr = a ? null : widgetRole();
    const go = nr ? { role: nr.name || '', rate: rateText(nr, Date.now()) } : null;
    return {
      v: 1, at: Date.now(), lang: LANG,
      // "אוקטובר" (this year's months without the year: a small widget has little room)
      period: emp.periodStartDay > 1 ? 'תקופת השכר' : P.label.replace(' ' + today.slice(0, 4), ''), periodTo: P.to,
      gross: m0(sum.gross), net: m0(sum.net.net), hours: U.hm(sum.hours * 60), shifts: sum.shifts,
      today: m0(day.gross), pace: proj && proj.forecast != null ? m0(proj.forecast) : '', // the forecast (with the planned shifts)
      goal: goalAmt ? { pct: Math.min(100, Math.floor((cur / goalAmt) * 100)), of: m0(goalAmt), left: m0(Math.max(0, goalAmt - cur)) } : null,
      payday: paySum && paySum.gross > 0 ? { date: next.payDate, amount: m0(paySum.net.net) } : null,
      // taps: this app takes the starts and ends tapped on a widget (an older one would never save them)
      saving, active, next: go, wid: +S.meta.widgetDone || 0, taps: 1,
    };
  };

  /** The phone no longer holds the data the widgets show (signed out, the account deleted, "delete everything"): the
   *  widgets must not keep showing the last numbers (privacy audit, 3 Nov 2026). The Android app (WidgetData.save)
   *  takes any snapshot with v >= 1, and every widget draws one whose pay period has ended as "open Shaati to update"
   *  with no amounts, no goal, no payday and no running shift; `empty` is there for a later app build to show its
   *  first-run look instead. */
  App.widgetEmpty = () => ({ v: 1, at: Date.now(), lang: LANG, empty: true, periodTo: '2000-01-01' });
  const noData = () => !S.settings.onboarded;
  // whether the widgets hold numbers, kept outside the app's database (which a wipe empties): the empty snapshot is
  // sent once, not on every opening of a phone with nothing on it. Unknown (an install from before this version, or
  // no storage): assume they do.
  const FED = 'shaati.widgetsFed';
  const fed = () => { try { return localStorage.getItem(FED) !== '0'; } catch (e) { return true; } };
  const setFed = (on) => { try { localStorage.setItem(FED, on ? '1' : '0'); } catch (e) { /* ignore */ } };

  /** The start and end taps the widgets kept (oldest first), done in order at their own times; each one only once
   *  (S.meta.widgetDone). A tap that no longer fits (a start while a shift runs, an end with no shift running or
   *  before the running one began) is skipped. */
  let busy = false, again = null;
  async function applyTaps(list) {
    if (busy) { again = list; return; }
    busy = true;
    try {
      const todo = (Array.isArray(list) ? list : [])
        .filter((t) => t && +t.id > (+S.meta.widgetDone || 0) && +t.at > 0 && (t.type === 'start' || t.type === 'stop'))
        .sort((x, y) => x.id - y.id);
      for (const t of todo) {
        if (!noData()) {
          const a = S.activeShift;
          if (t.type === 'start' && !a) { const r = widgetRole() || App.roles()[0]; await App.startShift(r && r.id, { startAt: +t.at, widget: true }); }
          if (t.type === 'stop' && a && +t.at > a.start) await App.stopShift(null, +t.at, { widget: true });
        }
        await Store.setMeta({ widgetDone: +t.id });
      }
    } catch (e) { console.warn('widget taps', e); }
    busy = false;
    // more taps came meanwhile: those first (the snapshot after them says which are done)
    if (again) { const l = again; again = null; return applyTaps(l); }
    send(true); // the snapshot tells the phone which taps are done
  }
  // the taps can come while the app is still opening (its data loading, the code lock up): they wait for it
  function whenReady(fn, n) {
    if (App.model && App.afterUnlock) App.afterUnlock(fn);
    else if ((n || 0) < 60) setTimeout(() => whenReady(fn, (n || 0) + 1), 500);
  }
  function fromPhone(data) {
    if (data === 'refresh' || data === 'shaati:widgets') { send(true); return; }
    // this Android app shows the notifications itself, at their time, also while the app is closed (app/phone-notes.js)
    if (data === 'shaati:notes') { if (App.phoneNotes) App.phoneNotes.hello(); return; }
    if (typeof data !== 'string' || data.charAt(0) !== '{') return;
    let m = null;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (m && Array.isArray(m.taps) && m.taps.length) whenReady(() => applyTaps(m.taps));
  }

  let port = null, last = '', timer = 0;
  function send(force) {
    if (!port) return;
    let snap = null;
    try { snap = App.widgetSnapshot(); } catch (e) { return; }
    if (!snap && noData() && fed()) snap = App.widgetEmpty();
    if (!snap) return;
    const key = JSON.stringify(Object.assign({}, snap, { at: 0 }));
    if (!force && key === last) return; // nothing new for the widgets
    last = key;
    try { port.postMessage(JSON.stringify(snap)); setFed(!snap.empty); } catch (e) { port = null; }
  }
  App.widgets = {
    /** The numbers may have changed: send them soon (several changes in a row make one message). */
    push() { if (!port) return; clearTimeout(timer); timer = setTimeout(() => send(false), 700); },
    send,
    applyTaps,
    /** A message of its own for the Android app (the notifications' list, app/phone-notes.js). */
    post(text) { if (!port) return false; try { port.postMessage(text); return true; } catch (e) { port = null; return false; } },
    get connected() { return !!port; },
  };

  // The channel to the Android app: when the app asks for it, Chrome hands this page its end with an empty message
  // and a port, from the origin "android-app://" + this host (only the app the site's Digital Asset Links name can
  // ask); the app's hello ("shaati:widgets") and "refresh" then come through that port. Measured on the phone on
  // 3 Nov 2026: the listener used to wait for the hello on the window, from this page's own origin, so the widgets
  // never got a number.
  const fromApp = (e) => e.origin === 'android-app://' + location.host || e.origin === location.origin;
  root.addEventListener('message', (e) => {
    if (!fromApp(e) || (e.data !== '' && e.data !== 'shaati:widgets') || !e.ports || !e.ports[0]) return;
    port = e.ports[0];
    last = '';
    // this Android app has widgets: say so once
    if (!Store.S.meta.widgetsTip) {
      Store.setMeta({ widgetsTip: Date.now() }).catch(() => {});
      setTimeout(() => { if (!App.blocking) root.UI.toast('חדש: ווידג׳טים למסך הבית, בשישה סגנונות. לחיצה ארוכה על מסך הבית › ווידג׳טים › שעתי'); }, 2500);
    }
    try { port.onmessage = (m) => fromPhone(m.data); } catch (err) { /* ignore */ }
    send(true);
  });
  // the phone was wiped (signing out, deleting the account): the page reloads right after, so the widgets hear it
  // now, not in 0.7 s
  Store.on((ev) => { if (ev && ev.type === 'restore' && noData()) send(true); else App.widgets.push(); });
  // back to the front: the numbers, and any start or end tapped on a widget meanwhile ("ask": the phone answers with them)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    App.widgets.push();
    if (port) { try { port.postMessage('ask'); } catch (e) { port = null; } }
  });
  setInterval(() => { if (document.visibilityState === 'visible') send(false); }, 10 * 60 * 1000);
})(typeof window !== 'undefined' ? window : globalThis);
