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
    // o.pushed: the day the app itself last sent one of the others (S.meta.lastAnomalyPush): none more that day
    const daily = new Set(o.pushed ? [o.pushed] : []);
    const order = { warn: 0, good: 1, info: 2 };
    for (const t of ts) {
      const fresh = (alertsAt(t) || []).filter((a) => !seen.has(a.key));
      for (const a of fresh) seen.add(a.key);
      const keep = fresh.filter((a) => !sent(a.key));
      for (const a of keep.filter((x) => x.push === 'critical')) out.push({ at: t, alert: a });
      // the others never at night (the app's one night rule, Moments.quietHour): the next morning instead
      const at = calm(t);
      const day = U.epochKey(at);
      if (!daily.has(day)) {
        const one = keep.filter((x) => x.push === 'anomaly').sort((x, y) => (order[x.severity] || 3) - (order[y.severity] || 3))[0];
        if (one) { out.push({ at, alert: one }); daily.add(day); }
      }
      if (out.length >= max) break;
    }
    return out.sort((x, y) => x.at - y.at).slice(0, max);
  }
  /** A moment at night (23:00 to 06:00) moves to that morning's 09:00; any other stays. */
  function calm(t) {
    if (!root.Moments.quietHour(t)) return t;
    const k = U.epochKey(t);
    return U.toEpoch(t < U.toEpoch(k, MORNING) ? k : U.addDays(k, 1), MORNING) + AFTER; // (after midnight: the same day's)
  }

  /**
   * "Forgot to log a shift?" when the app was not opened for some days (the user, 11 Nov 2026: "a notification after
   * three days without opening the app, in case I forgot to log a shift"). Planned at every open, so an open moves it
   * on; at a daytime hour (09:00 to 21:00). o: { days (default 3), on, hasShifts, active }. Null when it does not apply:
   * switched off, nothing logged yet (a new user gets no nagging), or a shift running (the timer reminder speaks then).
   */
  function away(now, o) {
    o = o || {};
    if (o.on === false || !o.hasShifts || o.active) return null;
    const days = Math.max(1, Math.min(30, Math.round(+o.days) || 3));
    let at = now + days * DAY;
    const h = new Date(at).getHours();
    if (h >= 21) at = U.toEpoch(U.addDays(U.epochKey(at), 1), '10:00');
    else if (h < 9) at = U.toEpoch(U.epochKey(at), '10:00');
    return { at, alert: { key: 'away-' + U.epochKey(at), type: 'away', push: 'critical', severity: 'info', data: { days },
      title: 'שכחת לרשום משמרת?', body: '' } };
  }

  /* ---- the daily message (the user, 21 Nov 2026: "at least one notification a day, useful, not spam") ----
   * One a day at the user's hour (19:00 by default), only on a day that holds no other Shaati notification. What it
   * says comes from the user's own data, the most useful first: tomorrow's planned shift (when no reminder of its own
   * is on), "did you work today?" on a weekday this person usually works and logged nothing, how the pay period stands
   * so far, or a short fact on a right (each day another one). On a rest day it waits for the evening after it, and on
   * the day before one it comes in the morning. Planned with the rest, so the phone shows it while the app is closed;
   * an open of the app makes the list again with the fresh numbers. */
  const DAILY_HOUR = 19;
  /** Short facts on rights, said positively (never "your employer broke the law"). adult: only for 18 and over. */
  const TIPS = [
    { id: 'overtime', adult: true, title: 'שעה נוספת שווה יותר', body: 'השעתיים הנוספות הראשונות ביום משולמות לפחות 125%, ומהשלישית 150%.' },
    { id: 'rest', title: 'עבודה בשבת', body: 'שעת עבודה ביום המנוחה השבועי משולמת לפחות 150%.' },
    { id: 'break', title: 'הפסקה במשמרת ארוכה', body: 'במשמרת של 6 שעות ומעלה מגיעה הפסקה של 45 דקות, ו-30 מהן ברצף.' },
    { id: 'sick', title: 'ימי מחלה', body: 'היום הראשון לא משולם, השני והשלישי בחצי שכר, ומהרביעי שכר מלא. צריך אישור מרופא.' },
    { id: 'vacation', title: 'ימי חופשה', body: 'גם בעבודה לפי שעה צוברים ימי חופשה בתשלום. בשעתי אפשר לראות כמה צברת.' },
    { id: 'recup', title: 'דמי הבראה', body: 'אחרי שנת עבודה מגיעים דמי הבראה, גם במשרה חלקית, לפי היקף המשרה.' },
    { id: 'travel', title: 'דמי נסיעות', body: 'על כל יום שנסעת לעבודה בתחבורה ציבורית, המעסיק משתתף בעלות עד תקרה יומית.' },
    { id: 'payday', title: 'מתי מגיעה המשכורת', body: 'השכר של החודש צריך להגיע עד ה-9 בחודש שאחריו.' },
    { id: 'holiday', title: 'תשלום על חג', body: 'אחרי 3 חודשי עבודה, עובדים לפי שעה מקבלים תשלום גם על חג שלא עבדו בו, אם עבדו ביום שלפניו וביום שאחריו.' },
  ];
  const dayNo = (k) => Math.round(U.toEpoch(k, '12:00') / DAY);
  /** At what moment the day's message comes: the user's hour; the morning before a rest day; the evening after one. */
  function dailyAt(k, hour, restCfg) {
    const rest = (x) => !!(restCfg && root.HebCal && root.HebCal.restDayInfo(x, restCfg));
    if (rest(k)) return U.toEpoch(k, '21:00') + AFTER;
    if (rest(U.addDays(k, 1))) return U.toEpoch(k, '10:00') + AFTER;
    return U.toEpoch(k, U.pad(hour) + ':00') + AFTER;
  }
  /** This person usually works on this weekday: three of the last four (with a logged shift on any of them). */
  function usualDay(model, k) {
    const done = new Set();
    for (const r of model.results.values()) if (r.status === 'done') done.add(r.dateKey);
    let n = 0;
    for (let w = 1; w <= 4; w++) if (done.has(U.addDays(k, -7 * w))) n++;
    return n >= 3;
  }
  /**
   * The daily messages of the coming days: [{ at, alert }]. o: { now, days, on, hour, busy(dayKey): another
   * notification comes that day, eveReminder: the evening-before reminder is on (then it speaks of tomorrow's shift) }.
   */
  function daily(model, o) {
    o = o || {};
    if (o.on === false || !model) return [];
    const now = o.now || Date.now();
    const hour = Math.min(21, Math.max(8, Math.round(+o.hour) || DAILY_HOUR));
    const restCfg = model.ctx && model.ctx.restCfg;
    const st = (model.ctx && model.ctx.settings) || {};
    const age = st.birthDate && Engine.ageAt ? Engine.ageAt(st.birthDate, U.epochKey(now)) : null;
    const tips = TIPS.filter((t) => !(t.adult && age != null && age < 18));
    const emp = model.ctx && model.ctx.primaryEmployer ? model.ctx.primaryEmployer() : null;
    const byDay = new Map();
    for (const r of model.results.values()) { if (!byDay.has(r.dateKey)) byDay.set(r.dateKey, []); byDay.get(r.dateKey).push(r); }
    const out = [];
    for (let d = 0, k = U.epochKey(now); d <= (o.days || DAYS); d++, k = U.addDays(k, 1)) {
      const at = dailyAt(k, hour, restCfg);
      if (at <= now || (o.busy && o.busy(k))) continue;
      const tomorrow = (byDay.get(U.addDays(k, 1)) || []).filter((r) => r.status === 'planned').sort((x, y) => x.start - y.start)[0];
      const today = byDay.get(k) || [];
      let alert = null;
      if (tomorrow && !o.eveReminder) {
        alert = { type: 'daily', ref: tomorrow.id, data: { kind: 'tomorrow' } };
      } else if (!today.length && usualDay(model, k)) {
        alert = { type: 'daily', data: { kind: 'usual', dow: U.dow(k) } };
      } else {
        const P = emp ? Engine.periodOf(k, emp) : null;
        const t = P ? Engine.rangeSummary(model, P.from, k) : null;
        if (t && t.shifts && dayNo(k) % 2 === 0) alert = { type: 'daily', data: { kind: 'month', shifts: t.shifts, hours: t.hours, gross: t.gross, left: Math.max(0, Math.round((U.toEpoch(P.to, '12:00') - U.toEpoch(k, '12:00')) / DAY)) } };
        else if (tips.length) alert = { type: 'daily', data: { kind: 'tip', tip: tips[Math.floor(dayNo(k) / 2) % tips.length].id } };
      }
      if (!alert) continue;
      Object.assign(alert, { key: 'daily-' + k, push: 'critical', severity: 'info', title: '', body: '' });
      out.push({ at, alert });
    }
    return out;
  }

  /* ---- how each one looks ---- */
  // the phone's notification channels (Android): reminders about a shift ring; pay, summaries and good news are quiet
  const CH = { upcoming: 'shifts', confirmDone: 'shifts', timer: 'shifts', away: 'shifts' };
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
    } else if (t === 'away') {
      const d = (a.data && a.data.days) || 3;
      n.title = 'שכחת לרשום משמרת?';
      n.body = `לא נכנסת לשעתי כבר ${d} ימים. אם עבדת בהם, רישום של דקה שומר את השכר שלך מדויק.`;
      n.sub = 'תזכורת';
      n.acts.push({ id: 'add', title: 'להוסיף משמרת', url: './?action=add#home' });
    } else if (t === 'daily' && a.data) {
      const D = a.data;
      n.sub = 'הודעה יומית';
      if (D.kind === 'tomorrow' && r) {
        n.title = `מחר ב-${U.epochHM(r.start)}: משמרת ${role(r)}`;
        n.body = amount(r) ? `${span(r)} · צפוי לך כ-${amount(r)} על המשמרת הזאת.` : `${span(r)}. תזכורת מהלוח שלך.`;
        n.when = r.start;
        n.acts.push({ id: 'open', title: 'לפרטי המשמרת', url: n.url });
      } else if (D.kind === 'usual') {
        n.title = 'עבדת היום?';
        n.body = `ביום ${U.DAYS[D.dow] || ''} יש לך בדרך כלל משמרת. אם עבדת, רישום של דקה שומר את החישוב מדויק.`;
        n.url = './?action=add#home';
        n.acts.push({ id: 'add', title: 'להוסיף משמרת', url: n.url });
      } else if (D.kind === 'month') {
        n.title = `בתקופת השכר עד עכשיו: ${U.money(D.gross, 0)} ברוטו`;
        n.body = `${D.shifts === 1 ? 'משמרת אחת' : `${D.shifts} משמרות`} · ${U.num(D.hours, 1)} שעות. ${D.left === 0 ? 'התקופה נגמרת היום.' : D.left === 1 ? 'התקופה נגמרת מחר.' : `עוד ${D.left} ימים עד סוף התקופה.`}`;
        n.url = './#home';
      } else if (D.kind === 'tip') {
        const tip = TIPS.find((x) => x.id === D.tip) || TIPS[0];
        n.title = tip.title;
        n.body = tip.body;
        n.url = './?action=rights#home';
        n.acts.push({ id: 'rights', title: 'לכל הזכויות', url: n.url });
      }
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

  root.NotePlan = { DAYS, MAX, MORNING, DAILY_HOUR, TIPS, times, plan, away, daily, dailyAt, look, dayWord, noteUrl };
  if (typeof module !== 'undefined') module.exports = root.NotePlan;
})(typeof window !== 'undefined' ? window : globalThis);
