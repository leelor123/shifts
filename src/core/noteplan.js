/* ============================================================
 * noteplan.js — the phone's notifications ahead of time, and how each one looks (tested in tests/noteplan.test.js).
 *
 * Why: the app used to work out its notifications only while it was open (app.js runInsights). The one way it had to
 * show them while closed, Chrome's periodic background sync, is never granted inside the Android app, so nothing came
 * until the app was opened (the user, 9 Nov 2026). Now the app works out, while open, which notifications the coming
 * days hold: it runs the same insights at each moment one could start (a reminder before a planned shift, the evening
 * before, "did you work it?" after it, a timer left running, each morning at 09:00 for the dated ones, the weekly
 * summary's hour). The Android app keeps that list and shows each one at its time with the phone's own alarms
 * (android/widgets/java/NoteCenter.java), also when the app is closed and after a restart.
 *
 *   times(model, cfg, active, usualMs, now, days)  the moments worth a look, after now, sorted
 *   plan(alertsAt, times, o)                       the notifications those moments hold, each at its first moment
 *   look(alert, model, o)                          its words and buttons on the phone (the redesign of 9 Nov 2026)
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const Engine = root.Engine;
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  /** How far ahead the list reaches: the app opens again long before, and sends a fresh list then. */
  const DAYS = 7;
  /** The most notifications kept ahead (a busy plan of shifts with three reminders each still fits). */
  const MAX = 40;
  /** Dated notifications (payday, a backup due, a birthday, the month's summary) come in the morning, not at midnight. */
  const MORNING = '09:00';
  /** Just after the moment itself, so the insights see it as come. */
  const AFTER = 30 * 1000;

  /** The moments after now when a notification could start, sorted and each once. */
  function times(model, cfg, active, usualMs, now, days) {
    cfg = cfg || {};
    const end = now + (days || DAYS) * DAY;
    const out = new Set();
    const add = (t) => { if (Number.isFinite(t) && t > now && t <= end) out.add(Math.round(t)); };
    const RM = cfg.reminders || {};
    const offs = (Array.isArray(RM.before) && RM.before.length ? RM.before : [+cfg.upcomingMin || 60]).map(Number).filter((x) => x > 0);
    const eve = RM.eveOn && /^\d{1,2}:\d{2}$/.test(RM.eve || '') ? RM.eve : null;
    const ca = +RM.confirmAfter || 0;
    for (const r of model.results.values()) {
      if (r.status !== 'planned') continue;
      for (const o of offs) add(r.start - o * MIN + AFTER);
      if (eve) add(U.toEpoch(U.addDays(r.dateKey, -1), eve) + AFTER);
      if (ca > 0) add(r.rawEnd + ca * MIN + AFTER);
    }
    if (active && active.start) {
      add(active.start + (+cfg.timerHours || 12) * HOUR + MIN);
      if (usualMs >= HOUR) add(active.start + usualMs + 3 * HOUR + MIN);
    }
    const wh = U.pad(Math.min(23, Math.max(0, Math.round(+cfg.weeklyHour) || 0))) + ':00';
    for (let d = 0, k = U.epochKey(now); d <= (days || DAYS); d++, k = U.addDays(k, 1)) {
      add(U.toEpoch(k, MORNING) + AFTER);
      add(U.toEpoch(k, wh) + AFTER);
    }
    return [...out].sort((a, b) => a - b);
  }

  /**
   * The notifications ahead. alertsAt(t): the alerts the app would send at moment t (already filtered by the user's
   * switches). o: { now, sent(key): already sent or listed, max }. Each one goes in at the first moment it appears
   * and only when it is not there now (the app sends those itself, at once). As the app does: every "critical" one,
   * and of the others (a summary, a record, a goal) at most one a day.
   */
  function plan(alertsAt, ts, o) {
    o = o || {};
    const sent = o.sent || (() => false);
    const max = o.max || MAX;
    const seen = new Set();
    for (const a of alertsAt(o.now) || []) seen.add(a.key);
    const out = [];
    const daily = new Set();
    const order = { warn: 0, good: 1, info: 2 };
    for (const t of ts) {
      const fresh = (alertsAt(t) || []).filter((a) => !seen.has(a.key));
      for (const a of fresh) seen.add(a.key);
      const keep = fresh.filter((a) => !sent(a.key));
      for (const a of keep.filter((x) => x.push === 'critical')) out.push({ at: t, alert: a });
      const day = U.epochKey(t);
      if (!daily.has(day)) {
        const one = keep.filter((x) => x.push === 'anomaly').sort((x, y) => (order[x.severity] || 3) - (order[y.severity] || 3))[0];
        if (one) { out.push({ at: t, alert: one }); daily.add(day); }
      }
      if (out.length >= max) break;
    }
    return out.slice(0, max);
  }

  /* ---- how each one looks ---- */
  // the phone's notification channels (Android): reminders about a shift ring; pay, summaries and good news are quiet
  const CH = { upcoming: 'shifts', confirmDone: 'shifts', timer: 'shifts' };
  const span = (r) => `\u2066${U.epochHM(r.start)}\u2060–\u2060${U.epochHM(r.rawEnd)}\u2069`;
  const pay = (r) => (r && r.wage >= 1 ? U.money(r.wage + ((r.travel && r.travel.amount) || 0), 0) : '');
  /** The address a tap opens: the app does there what a tap on the notification in its own list does (App.openNote),
   *  so it carries what that needs (the kind, the shift or payslip, the month), not only the key. */
  function noteUrl(a) {
    const q = new URLSearchParams({ action: 'note', type: a.type || '', key: a.key || '' });
    if (a.ref) q.set('ref', a.ref);
    if (a.data && a.data.pk) q.set('pk', a.data.pk);
    if (a.data && a.data.year) q.set('year', a.data.year);
    return './?' + q.toString() + '#home';
  }
  /** The day of a moment in words: today, tomorrow, or its date. */
  function dayWord(k, now) {
    const today = U.epochKey(now);
    if (k === today) return 'היום';
    if (k === U.addDays(today, 1)) return 'מחר';
    return U.fmtDate(k, 'dm');
  }

  /**
   * What the phone shows for an alert: { title, body, sub, ch, url, acts: [{ id, title, url }], when }.
   * o: { now (when it shows), roleName(id), hideMoney }. A kind with no words of its own here keeps the alert's.
   * The words: the news first (the time, the amount), short, in plain words, never a word on what is legal or not.
   */
  function look(a, model, o) {
    o = o || {};
    const now = o.now || Date.now();
    const role = (r) => (o.roleName ? o.roleName(r.segments && r.segments[0] ? r.segments[0].roleId : '') : '');
    const r = a.ref && model && model.results ? model.results.get(a.ref) : null;
    const amount = (x) => (o.hideMoney ? '' : pay(x));
    const n = { title: a.title, body: a.body, sub: '', ch: CH[a.type] || 'money', url: noteUrl(a), acts: [], when: 0 };
    const t = a.type;
    if (t === 'upcoming' && r) {
      const mins = Math.round((r.start - now) / MIN);
      const eve = String(a.key).indexOf('eve-') === 0;
      n.title = !eve && mins >= 55 && mins <= 65 ? `בעוד שעה: משמרת ${role(r)}`
        : !eve && mins > 0 && mins < 90 ? `בעוד ${mins} דקות: משמרת ${role(r)}`
        : `${dayWord(r.dateKey, now)} ב-${U.epochHM(r.start)}: משמרת ${role(r)}`;
      n.body = amount(r) ? `${span(r)} · צפוי לך כ-${amount(r)} על המשמרת הזאת.` : `${span(r)}. תזכורת מהלוח שלך.`;
      n.sub = 'משמרת קרובה';
      n.when = r.start;
      // starting it from here: the app asks once and starts the timer (?action=start)
      if (!eve && mins <= 90) n.acts.push({ id: 'start', title: 'להתחיל טיימר', url: './?action=start#home' });
      n.acts.push({ id: 'open', title: 'לפרטי המשמרת', url: n.url });
    } else if (t === 'confirmDone' && r) {
      const d = dayWord(r.dateKey, now);
      n.title = d === 'היום' ? `עבדת היום במשמרת ${role(r)}?` : `עבדת ב-${U.fmtDate(r.dateKey, 'dm')} במשמרת ${role(r)}?`;
      n.body = amount(r) ? `${span(r)}. אישור אחד מכניס כ-${amount(r)} לחישוב החודש.` : `${span(r)}. אישור אחד מכניס אותה לחישוב החודש.`;
      n.sub = 'אישור משמרת';
      n.acts.push({ id: 'open', title: 'עבדתי, לאשר', url: n.url });
    } else if (t === 'timer') {
      const start = +String(a.key).split('-')[1] || 0;
      if (start) {
        n.title = `הטיימר רץ כבר ${U.num((now - start) / HOUR, 0)} שעות`;
        n.body = `התחלת ב-${U.epochHM(start)}. שכחת לעצור? אפשר לסיים עכשיו ולתקן את שעת הסיום.`;
      }
      n.sub = 'טיימר פעיל';
      n.acts.push({ id: 'stop', title: 'לסיים ולתקן', url: './?action=stop#home' });
    } else if (t === 'weekly' && a.data && a.data.from && model) {
      const tt = Engine.totals(model, a.data.from, a.data.to);
      if (!o.hideMoney && tt.gross > 0) n.title = `השבוע שלך: ${U.money(tt.gross, 0)} ברוטו`;
      n.sub = 'סיכום שבועי';
    } else if (t === 'monthly') {
      n.sub = 'סיכום חודשי';
      n.acts.push({ id: 'open', title: 'לסיפור של החודש', url: n.url });
    } else if (t === 'record') {
      n.sub = 'שיא אישי';
    } else if (t === 'goal') {
      n.sub = 'יעד חודשי';
    } else if (t === 'payslipDue') {
      n.title = 'יום משכורת! 💸';
      n.sub = 'בדיקת תלוש';
      n.acts.push({ id: 'open', title: 'לבדוק את התלוש', url: n.url });
    } else if (t === 'backup') {
      n.title = 'הנתונים שלך שמורים רק בטלפון';
      n.body = a.body + ' גיבוי לוקח פחות מדקה.';
      n.sub = 'גיבוי';
      n.acts.push({ id: 'open', title: 'לגבות עכשיו', url: n.url });
    } else if (t === 'birthday') {
      n.sub = 'יום הולדת';
    } else if (t === 'holidayPay' || t === 'taxrefund') {
      n.sub = 'כסף שמגיע לך';
    } else if (t === 'plusend') {
      n.sub = 'Shaati Plus';
    }
    // amounts hidden in the app (Settings › privacy): none on the lock screen either
    if (o.hideMoney && /₪/.test(n.title + n.body)) { if (/₪/.test(n.title)) n.title = n.sub || 'שעתי'; if (/₪/.test(n.body)) n.body = 'לחצו כדי לראות בשעתי'; }
    return n;
  }

  root.NotePlan = { DAYS, MAX, MORNING, times, plan, look, dayWord, noteUrl };
  if (typeof module !== 'undefined') module.exports = root.NotePlan;
})(typeof window !== 'undefined' ? window : globalThis);
