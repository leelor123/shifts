/* ============================================================
 * youth-guard.js — the youth law while a minor's shift runs (Engine.youthRules, the rule picked by Moments.youthNow).
 * One line on the running-shift card at the right time: an hour before the night hours begin ("finish by 22:00"),
 * inside them, half an hour before the day's limit and after it. App.youthLine() is the card's hook (views-home.js).
 * A check every 20 seconds redraws the home screen only when the line changes. No notification: the owner's rule
 * since 1.18 is never a notification that something is "not legal", the youth law included (app.js, NOTIFY), so
 * NOTIFY_YOUTH stays false and the line on the card is the only place this shows (6 Nov 2026).
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U, Engine } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const sent = new Set(); // this session's notes, before the shared list has answered
  const NOTIFY_YOUTH = false; // see the header: the owner's 1.18 rule

  /** The rule that matters now for the running shift, or null (no shift, no birth date, 18 or more). */
  App.youthNow = function () {
    const a = S.activeShift, M = root.Moments;
    if (!a || !a.start || !M || !S.settings || !S.settings.birthDate) return null;
    const now = Date.now(), today = U.todayKey();
    const age = Engine.ageAt(S.settings.birthDate, today);
    if (age == null || age >= 18) return null;
    const brk = (a.breaks || []).reduce((s, b) => s + ((b.to || now) - b.from), 0);
    let dayMin = 0;
    if (App.model) for (const r of App.model.results.values()) if (r.status === 'done' && r.dateKey === today && r.start < a.start) dayMin += r.paidMin || 0;
    // a shift that began yesterday counts from midnight toward today's hours
    const from = Math.max(a.start, new Date(new Date(now).setHours(0, 0, 0, 0)).getTime());
    const workMin = Math.max(0, (now - from - (from === a.start ? brk : 0)) / 60000);
    return M.youthNow({ age, rules: Engine.youthRules(age, S.settings.leave && S.settings.leave.workWeek), now, start: a.start, dayMin, workMin });
  };
  /** The line on the running-shift card ('' when nothing is due). */
  App.youthLine = function () {
    const y = App.youthNow();
    if (!y) return '';
    return `<div class="tc-youth" role="status" data-youth="${esc(y.rule + '-' + y.phase)}">${icon('shield', 's')}<span>${esc(y.text)}</span></div>`;
  };

  async function notify(y) {
    const a = S.activeShift;
    const A = S.settings.alerts || {};
    if (!a || !A.push || (A.types && A.types.youth === false) || !App.pushNote) return;
    for (const x of y.all || [y]) {
      const tag = 'youth-' + x.rule + '-' + a.start;
      if (sent.has(tag)) continue;
      sent.add(tag);
      if (App.shownNote && await App.shownNote(tag)) continue; // shown before (another window, a reload)
      await App.pushNote({ key: tag, type: 'youthNow', title: 'המשמרת שלך', body: x.text });
      if (App.shownNote) App.shownNote(tag, true);
    }
  }
  function check() {
    if (!S.settings || !S.activeShift) return;
    const y = App.youthNow();
    if (y && NOTIFY_YOUTH) notify(y).catch(() => {});
    // the line comes and goes (and changes) on the card by itself
    const card = App.tab === 'home' && !App.blocking && document.querySelector('#view .timer-card');
    if (!card) return;
    const el = card.querySelector('.tc-youth');
    const want = y ? y.rule + '-' + y.phase + '|' + y.text : '';
    const has = el ? el.dataset.youth + '|' + el.textContent : '';
    if (want !== has) App.rerender();
  }
  setInterval(check, 20000);
  // soon after a start (the shift's first moment has played)
  if (Store.on) Store.on((ev) => { if (ev && ev.type === 'active') setTimeout(check, 1500); });
})(typeof window !== 'undefined' ? window : globalThis);
