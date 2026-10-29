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
 * show exactly what the home screen shows. Nothing here leaves the phone: the channel only reaches the
 * Shaati app it runs in (Chrome checks the app against the site's Digital Asset Links).
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, U, Engine } = root;
  const S = Store.S;
  const m0 = (n) => U.money(n || 0, 0);

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
      const role = App.role(a.roleId);
      const rate = role ? Engine.roleRate(role, U.epochKey(a.start)) : 0;
      active = {
        start: a.start, breakAt: open ? open.from : 0,
        breakMs: br.filter((b) => b.to).reduce((s, b) => s + (b.to - b.from), 0),
        role: App.roleName(a.roleId) || '', rate: rate ? U.money(rate) + ' לשעה' : '',
      };
    }
    return {
      v: 1, at: Date.now(),
      // "אוקטובר" (this year's months without the year: a small widget has little room)
      period: emp.periodStartDay > 1 ? 'תקופת השכר' : P.label.replace(' ' + today.slice(0, 4), ''), periodTo: P.to,
      gross: m0(sum.gross), net: m0(sum.net.net), hours: U.hm(sum.hours * 60), shifts: sum.shifts,
      today: m0(day.gross), pace: proj && proj.forecast != null ? m0(proj.forecast) : '', // the forecast (with the planned shifts)
      goal: goalAmt ? { pct: Math.min(100, Math.floor((cur / goalAmt) * 100)), of: m0(goalAmt), left: m0(Math.max(0, goalAmt - cur)) } : null,
      payday: paySum && paySum.gross > 0 ? { date: next.payDate, amount: m0(paySum.net.net) } : null,
      saving, active,
    };
  };

  let port = null, last = '', timer = 0;
  function send(force) {
    if (!port) return;
    let snap = null;
    try { snap = App.widgetSnapshot(); } catch (e) { return; }
    if (!snap) return;
    const key = JSON.stringify(Object.assign({}, snap, { at: 0 }));
    if (!force && key === last) return; // nothing new for the widgets
    last = key;
    try { port.postMessage(JSON.stringify(snap)); } catch (e) { port = null; }
  }
  App.widgets = {
    /** The numbers may have changed: send them soon (several changes in a row make one message). */
    push() { if (!port) return; clearTimeout(timer); timer = setTimeout(() => send(false), 700); },
    send,
    get connected() { return !!port; },
  };

  // the Android app says hello with a port (only the app this page runs in can: the message comes from
  // the site's own origin, which Chrome grants only to the app the site's Digital Asset Links name)
  root.addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data !== 'shaati:widgets' || !e.ports || !e.ports[0]) return;
    port = e.ports[0];
    last = '';
    // this Android app has widgets: say so once
    if (!Store.S.meta.widgetsTip) {
      Store.setMeta({ widgetsTip: Date.now() }).catch(() => {});
      setTimeout(() => { if (!App.blocking) root.UI.toast('חדש: ווידג׳טים למסך הבית! 🧩 לחיצה ארוכה על מסך הבית › ווידג׳טים › שעתי'); }, 2500);
    }
    try { port.onmessage = (m) => { if (m.data === 'refresh') send(true); }; } catch (err) { /* ignore */ }
    send(true);
  });
  Store.on(() => App.widgets.push());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') App.widgets.push(); });
  setInterval(() => { if (document.visibilityState === 'visible') send(false); }, 10 * 60 * 1000);
})(typeof window !== 'undefined' ? window : globalThis);
