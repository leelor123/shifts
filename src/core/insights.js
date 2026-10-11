/* ============================================================
 * insights.js — smart alerts & insights.
 *
 * Every alert has a stable `key` so it is raised once, a category,
 * a severity, a plain-language title/body and an `explain` line that
 * says what it was compared to. Average-based alerts only run after
 * `minWeeksData` weeks of history.
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const Engine = root.Engine;

  const TYPE_INFO = {
    hours: { cat: 'deviation', label: 'שעות חריגות' },
    shifts: { cat: 'deviation', label: 'מספר משמרות חריג' },
    roles: { cat: 'deviation', label: 'שינוי בחלוקת תפקידים' },
    rest: { cat: 'deviation', label: 'שעות שבת וחג' },
    overtime: { cat: 'deviation', label: 'שעות נוספות' },
    hourly: { cat: 'deviation', label: 'ירידה בשכר לשעה' },
    shiftLength: { cat: 'deviation', label: 'אורך משמרת חריג' },
    pattern: { cat: 'deviation', label: 'שינוי בדפוס שעות' },
    long: { cat: 'health', label: 'משמרת ארוכה' },
    rest8: { cat: 'health', label: 'מעט מנוחה בין משמרות' },
    streak: { cat: 'health', label: 'הרבה ימים ברצף' },
    weekHours: { cat: 'health', label: 'שבוע עמוס' },
    projection: { cat: 'money', label: 'צפי חודשי' },
    goal: { cat: 'money', label: 'יעד חודשי' },
    record: { cat: 'money', label: 'שיא אישי' },
    goalShifts: { cat: 'money', label: 'משמרות ליעד' },
    payslipGap: { cat: 'money', label: 'פער בתלוש' },
    travel: { cat: 'money', label: 'נסיעות' },
    timer: { cat: 'reminder', label: 'טיימר פעיל' },
    plannedPast: { cat: 'reminder', label: 'משמרת מתוכננת שעברה' },
    idle: { cat: 'reminder', label: 'לא נרשמו משמרות' },
    suspicious: { cat: 'reminder', label: 'נתון חשוד' },
    payslipDue: { cat: 'reminder', label: 'הזנת תלוש' },
    backup: { cat: 'reminder', label: 'גיבוי' },
    upcoming: { cat: 'reminder', label: 'משמרת קרובה' },
    weekly: { cat: 'summary', label: 'סיכום שבועי' },
    recuperation: { cat: 'money', label: 'דמי הבראה' },
  };

  const pctDev = (cur, base) => (base > 0 ? ((cur - base) / base) * 100 : cur > 0 ? Infinity : 0);
  const fmtPct = (d) => (d === Infinity ? 'חדש' : (d > 0 ? '+' : '') + Math.round(d) + '%');
  const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

  /** Metrics of a date range used for comparisons. */
  function metrics(model, from, to) {
    const t = Engine.totals(model, from, to);
    let nightH = 0;
    for (const r of model.results.values()) {
      if (r.status !== 'done' || r.dateKey < from || r.dateKey > to) continue;
      // hours inside 22:00-06:00 regardless of the night-premium setting
      for (const p of r.pieces) {
        const mid = new Date((p.a + p.b) / 2).getHours();
        if (mid >= 22 || mid < 6) nightH += p.pm / 60;
      }
    }
    return {
      from, to, t,
      hours: t.hours, shifts: t.shifts, rest: t.restHours, overtime: t.otHours,
      hourly: t.avgHourly, shiftLength: t.avgShift, nightShare: t.hours > 0 ? (nightH / t.hours) * 100 : 0,
      gross: t.gross, roles: Object.fromEntries(Object.entries(t.byRole).map(([k, v]) => [k, v.hours])),
    };
  }

  function firstShiftKey(model) {
    let first = null;
    for (const r of model.results.values()) if (r.status === 'done' && (!first || r.dateKey < first)) first = r.dateKey;
    return first;
  }

  /** Compare one period to the average of N previous periods. */
  function compareSeries(model, cur, prevs, cfg, unit, keyPrefix, roleName) {
    const out = [];
    const th = +cfg.deviationPct || 20;
    const types = cfg.types || {};
    const curM = metrics(model, cur.from, cur.to);
    const prevM = prevs.map((p) => metrics(model, p.from, p.to));
    const worked = prevM.filter((m) => m.shifts > 0);
    const baseRange = '⁦' + U.fmtDate(prevs[prevs.length - 1].from, 'short') + '–' + U.fmtDate(prevs[0].to, 'short') + '⁩';
    const label = unit === 'week' ? 'השבוע שהסתיים' : 'בחודש שהסתיים';
    const per = unit === 'week' ? 'לשבוע' : 'לחודש';
    const nPrev = prevs.length + (unit === 'week' ? ' השבועות' : ' החודשים');
    const sfx = unit === 'week' ? ' (שבועי)' : ' (חודשי)';
    const explain = (what, base) => `השוואה לממוצע של ${nPrev} הקודמים (${baseRange}): ${what} ${base} ${per}. סף ההתראה: ±${th}%.`;
    const add = (type, cur, base, minAbs, title, body, explainTxt, dir) => {
      if (types[type] === false) return;
      const d = pctDev(cur, base);
      if (Math.abs(cur - base) < minAbs) return;
      if (Math.abs(d) < (type === 'hourly' ? th / 2 : th)) return;
      if (dir === 'down' && d > 0) return;
      out.push({
        key: keyPrefix + type + '-' + curM.from,
        type, severity: type === 'hourly' ? 'warn' : 'info', push: 'anomaly',
        title: title(d) + sfx, body: body(d), explain: explainTxt, data: { cur, base, dev: d },
      });
    };
    const avgOf = (f) => avg(prevM.map(f));
    const avgWorked = (f) => avg(worked.map(f));

    const bh = avgOf((m) => m.hours);
    add('hours', curM.hours, bh, 2,
      (d) => (d > 0 ? 'יותר שעות מהרגיל' : 'פחות שעות מהרגיל'),
      (d) => `${label} עבדת ${U.num(curM.hours, 1)} שעות — ${fmtPct(d)} לעומת הממוצע (${U.num(bh, 1)}).`,
      explain('ממוצע שעות', U.num(bh, 1)));
    const bs = avgOf((m) => m.shifts);
    add('shifts', curM.shifts, bs, 1,
      (d) => (d > 0 ? 'יותר משמרות מהרגיל' : 'פחות משמרות מהרגיל'),
      (d) => `${label} היו ${curM.shifts} משמרות, לעומת ממוצע של ${U.num(bs, 1)} (${fmtPct(d)}).`,
      explain('ממוצע משמרות', U.num(bs, 1)));
    if (curM.shifts > 0 && types.roles !== false) {
      const roleIds = new Set([...Object.keys(curM.roles), ...prevM.flatMap((m) => Object.keys(m.roles))]);
      for (const id of roleIds) {
        const c = curM.roles[id] || 0, b = avgOf((m) => m.roles[id] || 0);
        const d = pctDev(c, b);
        if (Math.abs(c - b) < 3 || Math.abs(d) < th) continue;
        out.push({
          key: keyPrefix + 'roles-' + id + '-' + curM.from, type: 'roles', severity: 'info', push: 'anomaly',
          title: (d > 0 ? 'הרבה יותר ' : 'הרבה פחות ') + roleName(id) + ' מהרגיל' + sfx,
          body: `${label}: ${U.num(c, 1)} שעות ${roleName(id)}, לעומת ${U.num(b, 1)} בממוצע (${fmtPct(d)}).`,
          explain: explain('ממוצע שעות ' + roleName(id), U.num(b, 1)), data: { cur: c, base: b, dev: d, roleId: id },
        });
      }
    }
    const br = avgOf((m) => m.rest);
    add('rest', curM.rest, br, 2,
      (d) => (d > 0 ? 'עלייה בשעות שבת וחג' : 'ירידה בשעות שבת וחג'),
      (d) => `${label}: ${U.num(curM.rest, 1)} שעות שבת/חג, לעומת ${U.num(br, 1)} בממוצע (${fmtPct(d)}).`,
      explain('ממוצע שעות שבת/חג', U.num(br, 1)));
    const bo = avgOf((m) => m.overtime);
    add('overtime', curM.overtime, bo, 1,
      (d) => (d > 0 ? 'עלייה בשעות הנוספות' : 'ירידה בשעות הנוספות'),
      (d) => `${label}: ${U.num(curM.overtime, 1)} שעות נוספות, לעומת ${U.num(bo, 1)} בממוצע (${fmtPct(d)}).`,
      explain('ממוצע שעות נוספות', U.num(bo, 1)));
    if (curM.shifts > 0 && worked.length) {
      const bhr = avgWorked((m) => m.hourly);
      add('hourly', curM.hourly, bhr, 0.5,
        () => 'ירידה בשכר הממוצע לשעה',
        (d) => `${label} השכר הממוצע לשעה היה ${U.money(curM.hourly)}, לעומת ${U.money(bhr)} בממוצע (${fmtPct(d)}). אולי פחות שעות שבת או נוספות?`,
        explain('שכר ממוצע לשעה', U.money(bhr)) + ' (סף לירידה: חצי מהסף הרגיל).', 'down');
      const bl = avgWorked((m) => m.shiftLength);
      add('shiftLength', curM.shiftLength, bl, 0.75,
        (d) => (d > 0 ? 'משמרות ארוכות מהרגיל' : 'משמרות קצרות מהרגיל'),
        (d) => `${label} משמרת ממוצעת נמשכה ${U.num(curM.shiftLength, 1)} ש׳, לעומת ${U.num(bl, 1)} ש׳ בממוצע (${fmtPct(d)}).`,
        explain('אורך משמרת ממוצע', U.num(bl, 1) + ' ש׳'));
      const bn = avgWorked((m) => m.nightShare);
      if (types.pattern !== false && Math.abs(curM.nightShare - bn) >= th) {
        out.push({
          key: keyPrefix + 'pattern-' + curM.from, type: 'pattern', severity: 'info', push: 'anomaly',
          title: (curM.nightShare > bn ? 'יותר עבודת לילה מהרגיל' : 'פחות עבודת לילה מהרגיל') + sfx,
          body: `${label} ${U.num(curM.nightShare, 0)}% מהשעות היו בין 22:00 ל-06:00, לעומת ${U.num(bn, 0)}% בממוצע.`,
          explain: `השוואה לממוצע של ${nPrev} הקודמים (${baseRange}). סף: שינוי של ${th} נקודות אחוז.`, data: { cur: curM.nightShare, base: bn },
        });
      }
    }
    return { alerts: out, cur: curM, prev: prevM };
  }

  /**
   * Run all checks.
   * state = { now, activeShift, payslips, gaps, lastBackup, roleName(id) }
   * Returns { alerts:[], live:[] (non-persistent insights for the home card), weekly }
   */
  function run(model, state) {
    const S = model.ctx.settings;
    const cfg = S.alerts;
    const types = cfg.types || {};
    const now = state.now || Date.now();
    const today = U.epochKey(now);
    const roleName = state.roleName || ((id) => (model.ctx.roles.get(id) || {}).name || 'תפקיד');
    const alerts = [];
    const live = [];
    const on = (t) => types[t] !== false;
    const first = firstShiftKey(model);
    const emp = model.ctx.primaryEmployer();

    /* ---- deviations ---- */
    const ws = U.weekStart(today, S.weekStart || 0);
    const lastWeek = { from: U.addDays(ws, -7), to: U.addDays(ws, -1) };
    const nW = +cfg.compareWeeks || 4;
    const prevWeeks = [];
    for (let i = 1; i <= nW; i++) prevWeeks.push({ from: U.addDays(lastWeek.from, -7 * i), to: U.addDays(lastWeek.to, -7 * i) });
    const enoughWeeks = first && U.diffDays(first, lastWeek.from) >= 7 * (+cfg.minWeeksData || 4);
    let weekCmp = null;
    if (enoughWeeks) {
      weekCmp = compareSeries(model, lastWeek, prevWeeks, cfg, 'week', 'w-', roleName);
      alerts.push(...weekCmp.alerts);
    }
    const curP = Engine.periodOf(today, emp);
    const lastP = Engine.periodByKey(U.addMonthKey(curP.key, -1), emp);
    const nM = +cfg.compareMonths || 3;
    const prevPs = [];
    for (let i = 1; i <= nM; i++) prevPs.push(Engine.periodByKey(U.addMonthKey(lastP.key, -i), emp));
    const enoughMonths = first && first <= prevPs[prevPs.length - 1].to && U.diffDays(first, lastP.from) >= 7 * (+cfg.minWeeksData || 4);
    if (enoughMonths) {
      const mc = compareSeries(model, lastP, prevPs, cfg, 'month', 'm-', roleName);
      alerts.push(...mc.alerts);
    }

    /* ---- health ---- */
    const done = [...model.results.values()].filter((r) => r.status === 'done').sort((a, b) => a.start - b.start);
    const recentFrom = U.addDays(today, -14);
    if (on('long')) {
      for (const r of done) {
        if (r.dateKey < recentFrom) continue;
        if (r.paidHours > (+cfg.longShiftHours || 12)) {
          alerts.push({ key: 'long-' + r.id, type: 'long', severity: 'warn', push: 'anomaly', ref: r.id,
            title: 'משמרת ארוכה מ-' + cfg.longShiftHours + ' שעות',
            body: `ב-${U.fmtDate(r.dateKey, 'dm')} עבדת ${U.hm(r.paidMin)} שעות. מגיעה לך מנוחה טובה.`,
            explain: 'הסף שהוגדר: ' + cfg.longShiftHours + ' שעות במשמרת אחת (ניתן לשינוי בהגדרות).' });
        }
      }
    }
    if (on('rest8')) {
      for (let i = 1; i < done.length; i++) {
        const a = done[i - 1], b = done[i];
        if (b.dateKey < recentFrom) continue;
        const gapH = (b.start - a.rawEnd) / U.HOUR;
        if (gapH >= 0 && gapH < (+cfg.minRestHours || 8)) {
          alerts.push({ key: 'rest8-' + b.id, type: 'rest8', severity: 'warn', push: 'anomaly', ref: b.id,
            title: 'פחות מ-' + cfg.minRestHours + ' שעות מנוחה',
            body: `בין המשמרת שהסתיימה ב-${U.epochHM(a.rawEnd)} (${U.fmtDate(a.dateKey, 'short')}) לזו שהתחילה ב-${U.epochHM(b.start)} היו רק ${U.num(gapH, 1)} שעות.`,
            explain: 'הסף שהוגדר: ' + cfg.minRestHours + ' שעות מנוחה בין משמרות.' });
        }
      }
    }
    if (on('streak') && done.length) {
      const days = new Set(done.map((r) => r.dateKey));
      const lastDay = done[done.length - 1].dateKey;
      let streak = 0;
      for (let k = lastDay; days.has(k); k = U.addDays(k, -1)) streak++;
      if (streak >= (+cfg.streakDays || 6) && U.diffDays(lastDay, today) <= 1) {
        alerts.push({ key: 'streak-' + U.addDays(lastDay, -streak + 1) + '-' + streak, type: 'streak', severity: 'warn', push: 'anomaly',
          title: streak + ' ימי עבודה ברצף', body: `עבדת ${streak} ימים ברצף בלי יום חופש. כדאי לתכנן יום מנוחה.`,
          explain: 'הסף שהוגדר: ' + cfg.streakDays + ' ימים ברצף.' });
      }
    }
    if (on('weekHours')) {
      for (const w of [{ from: ws, to: U.addDays(ws, 6) }, lastWeek]) {
        const t = Engine.totals(model, w.from, w.to);
        if (t.hours > (+cfg.weekHoursMax || 50)) {
          alerts.push({ key: 'weekh-' + w.from, type: 'weekHours', severity: 'warn', push: 'anomaly',
            title: 'שבוע של יותר מ-' + cfg.weekHoursMax + ' שעות',
            body: `בשבוע שמתחיל ב-${U.fmtDate(w.from, 'dm')} נרשמו ${U.num(t.hours, 1)} שעות.`,
            explain: 'הסף שהוגדר: ' + cfg.weekHoursMax + ' שעות בשבוע.' });
        }
      }
    }

    /* ---- money ---- */
    const curSum = Engine.periodSummary(model, curP.key, emp.id);
    const planned = Engine.totals(model, today > curP.from ? U.addDays(today, 0) : curP.from, curP.to, { status: 'planned' });
    const elapsed = Math.max(1, U.diffDays(curP.from, today) + 1);
    const total = U.diffDays(curP.from, curP.to) + 1;
    const goal = +(S.goal && S.goal.amount) || 0;
    const goalNet = S.goal && S.goal.type === 'net';
    const curVal = goalNet ? curSum.net.net : curSum.gross;
    const pace = elapsed >= 3 ? (curSum.gross / elapsed) * total : null;
    const withPlanned = curSum.gross + planned.wage + planned.travel;
    const ratio = curSum.gross > 0 ? curSum.net.net / curSum.gross : 0.85;
    const projection = { period: curP, actual: curSum.gross, actualNet: curSum.net.net, pace, withPlanned, plannedCount: planned.shifts, elapsed, total };
    if (on('projection') && pace != null && curSum.gross > 0) {
      live.push({ type: 'projection', priority: 2, title: 'צפי לסוף ' + (emp.periodStartDay > 1 ? 'התקופה' : 'החודש'),
        body: `לפי הקצב הנוכחי: כ-${U.money(pace, 0)} ברוטו` + (planned.shifts ? `; עם ${planned.shifts} המשמרות המתוכננות: ${U.money(withPlanned, 0)}.` : '.'),
        explain: `${U.money(curSum.gross, 0)} עד היום ב-${elapsed} מתוך ${total} ימים, מוכפל לפי הקצב.` });
    }
    if (goal > 0) {
      const target = goal;
      const val = goalNet ? curVal : curSum.gross;
      if (on('goal') && val >= target) {
        alerts.push({ key: 'goal-' + curP.key, type: 'goal', severity: 'good', push: 'anomaly',
          title: 'עברת את היעד החודשי! 🎉', body: `הגעת ל-${U.money(val, 0)} ${goalNet ? 'נטו משוער' : 'ברוטו'} מתוך יעד של ${U.money(target, 0)}.`,
          explain: 'היעד מוגדר בהגדרות › יעדים.' });
      } else {
        const projVal = goalNet ? (pace || 0) * ratio : pace || 0;
        if (on('goal') && pace != null && elapsed / total >= 0.5 && projVal < target) {
          alerts.push({ key: 'goalrisk-' + curP.key, type: 'goal', severity: 'warn', push: 'anomaly',
            title: 'לפי הקצב, לא תגיע ליעד', body: `צפי: ${U.money(projVal, 0)} מתוך ${U.money(target, 0)}.`,
            explain: 'הצפי מבוסס על הקצב מתחילת התקופה. ההתראה נשלחת אחרי שעברה חצי מהתקופה.' });
        }
        if (on('goalShifts')) {
          const avgShift = done.length ? done.slice(-20).reduce((s, r) => s + r.wage + r.travel.amount, 0) / Math.min(20, done.length) : 0;
          const remaining = target - val;
          if (avgShift > 0 && remaining > 0) {
            const n = Math.ceil(remaining / (goalNet ? avgShift * ratio : avgShift));
            live.push({ type: 'goalShifts', priority: 1, title: 'עוד כ-' + n + ' משמרות ליעד',
              body: `חסרים ${U.money(remaining, 0)} ליעד של ${U.money(target, 0)}. משמרת ממוצעת שלך שווה כ-${U.money(avgShift, 0)}.`,
              explain: 'ממוצע 20 המשמרות האחרונות, כולל נסיעות.' });
          }
        }
      }
    }
    if (on('record') && enoughWeeks) {
      const lw = Engine.totals(model, lastWeek.from, lastWeek.to).gross;
      let best = 0;
      for (let k = U.addDays(lastWeek.from, -7); k >= U.weekStart(first, S.weekStart || 0); k = U.addDays(k, -7)) {
        best = Math.max(best, Engine.totals(model, k, U.addDays(k, 6)).gross);
      }
      if (lw > best && best > 0) {
        alerts.push({ key: 'recw-' + lastWeek.from, type: 'record', severity: 'good', push: 'anomaly',
          title: 'שיא אישי: השבוע הכי רווחי! 🏆', body: `${U.money(lw, 0)} ברוטו בשבוע שהסתיים. השיא הקודם: ${U.money(best, 0)}.`,
          explain: 'השוואה לכל השבועות מאז המשמרת הראשונה שנרשמה.' });
      }
      if (enoughMonths) {
        const lm = Engine.periodSummary(model, lastP.key, emp.id).gross;
        let bestM = 0;
        for (let pk = U.addMonthKey(lastP.key, -1), i = 0; i < 60 && pk >= U.monthKey(first); pk = U.addMonthKey(pk, -1), i++) {
          bestM = Math.max(bestM, Engine.periodSummary(model, pk, emp.id).gross);
        }
        if (lm > bestM && bestM > 0) {
          alerts.push({ key: 'recm-' + lastP.key, type: 'record', severity: 'good', push: 'anomaly',
            title: 'שיא אישי: החודש הכי רווחי! 🏆', body: `${U.money(lm, 0)} ברוטו ב${lastP.label}. השיא הקודם: ${U.money(bestM, 0)}.`,
            explain: 'השוואה לכל החודשים הקודמים.' });
        }
      }
    }
    if (on('travel')) {
      for (const P of [curP, lastP]) {
        const t = Engine.totals(model, P.from, P.to);
        if (t.travelRaw > t.travel + 0.5) {
          alerts.push({ key: 'travelcap-' + P.key, type: 'travel', severity: 'info', push: null,
            title: 'הנסיעות הגיעו לתקרה החודשית', body: `ב${P.label} צברת ${U.money(t.travelRaw, 0)} נסיעות, אבל התקרה היא ${U.money(emp.travelMonthlyCap, 0)}.`,
            explain: 'התקרה מוגדרת בהגדרות › מעסיק › נסיעות.' });
        }
      }
    }
    // one alert per payslip with open gaps
    const bySlip = {};
    for (const g of state.gaps || []) if (g.status === 'open') (bySlip[g.payslipId] = bySlip[g.payslipId] || []).push(g);
    for (const [pid, gs] of Object.entries(bySlip)) {
      if (!on('payslipGap')) break;
      const tot = gs.reduce((s, g) => s + (g.amount || 0), 0);
      alerts.push({ key: 'gap-' + pid + '-' + gs.map((g) => g.area).sort().join(','), type: 'payslipGap', severity: 'critical', push: 'critical', ref: pid,
        title: (gs.length > 1 ? gs.length + ' פערים' : 'פער') + ' בתלוש ' + U.fmtMonth(gs[0].period) + (tot ? ` — ${U.money(tot, 0)}` : ''),
        body: gs.map((g) => g.title + (g.amount ? ` (${U.money(g.amount, 0)})` : '')).join(' · '),
        explain: 'נמצא בניתוח התלוש. אפשר לסמן כל פער כ"הוחזר" בדוחות › תלושים.' });
    }

    /* ---- reminders ---- */
    const a = state.activeShift;
    if (on('timer') && a && a.start) {
      const h = (now - a.start) / U.HOUR;
      if (h > (+cfg.timerHours || 12)) {
        alerts.push({ key: 'timer-' + a.start, type: 'timer', severity: 'critical', push: 'critical',
          title: 'שכחת לסיים משמרת?', body: `הטיימר רץ כבר ${U.num(h, 1)} שעות (מאז ${U.epochHM(a.start)}).`,
          explain: 'הסף שהוגדר: ' + cfg.timerHours + ' שעות.' });
      }
    }
    for (const r of model.results.values()) {
      if (r.status !== 'planned') continue;
      if (on('plannedPast') && r.rawEnd < now) {
        alerts.push({ key: 'planned-' + r.id, type: 'plannedPast', severity: 'warn', push: 'critical', ref: r.id,
          title: 'משמרת מתוכננת שעברה', body: `המשמרת של ${U.fmtDate(r.dateKey, 'dm')} (⁦${U.epochHM(r.start)}–${U.epochHM(r.rawEnd)}⁩) לא סומנה כ"בוצעה".`,
          explain: 'משמרות מתוכננות לא נספרות בשכר עד שמסמנים אותן כבוצעו.' });
      }
      const mins = (r.start - now) / U.MIN;
      if (on('upcoming') && mins > 0 && mins <= (+cfg.upcomingMin || 60)) {
        alerts.push({ key: 'up-' + r.id, type: 'upcoming', severity: 'info', push: 'critical', ref: r.id,
          title: 'משמרת בעוד ' + Math.round(mins) + ' דקות', body: `${roleName(r.segments[0] ? r.segments[0].roleId : '')} · ⁦${U.epochHM(r.start)}–${U.epochHM(r.rawEnd)}⁩`,
          explain: 'תזכורת ' + cfg.upcomingMin + ' דקות לפני משמרת מתוכננת.' });
      }
    }
    if (on('idle') && done.length >= 3 && !a) {
      const lastKey = done[done.length - 1].dateKey;
      const gap = U.diffDays(lastKey, today);
      if (gap >= (+cfg.idleDays || 7)) {
        alerts.push({ key: 'idle-' + lastKey, type: 'idle', severity: 'info', push: 'anomaly',
          title: 'לא נרשמה משמרת כבר ' + gap + ' ימים', body: 'שכחת לרשום משמרות? אם היית בחופש — תהנה!',
          explain: 'המשמרת האחרונה: ' + U.fmtDate(lastKey) + '. הסף: ' + cfg.idleDays + ' ימים.' });
      }
    }
    if (on('suspicious')) {
      for (const iss of Engine.dataIssues(model)) {
        if (iss.ids.every((id) => { const r = model.results.get(id); return r && r.dateKey < U.addDays(today, -60); })) continue;
        alerts.push({ key: 'sus-' + iss.type + '-' + iss.ids.join('-'), type: 'suspicious', severity: 'warn', push: 'critical', ref: iss.ids[0],
          title: iss.type === 'overlap' ? 'משמרות חופפות' : 'נתון חשוד', body: iss.text,
          explain: 'בדיקת תקינות אוטומטית: חפיפות, משמרות ארוכות מ-' + cfg.suspiciousHours + ' שעות, סיום לפני התחלה.' });
      }
    }
    if (on('payslipDue')) {
      const pd = lastP.payDate;
      const has = (state.payslips || []).some((p) => p.period === lastP.key);
      if (today >= pd && !has && first && first <= lastP.to && U.diffDays(pd, today) <= 20) {
        alerts.push({ key: 'payslip-' + lastP.key, type: 'payslipDue', severity: 'info', push: 'critical',
          title: 'הגיע יום התשלום — הזן את התלוש', body: `העלה את התלוש של ${lastP.label} כדי לבדוק שקיבלת את כל מה שמגיע לך.`,
          explain: 'יום התשלום מוגדר: ' + emp.payDay + ' לחודש.' });
      }
    }
    if (on('backup') && first) {
      const lb = state.lastBackup;
      const days = lb ? U.diffDays(U.epochKey(lb), today) : U.diffDays(first, today);
      if (days >= (+cfg.backupDays || 30)) {
        alerts.push({ key: 'backup-' + U.weekStart(today), type: 'backup', severity: 'warn', push: 'critical',
          title: 'הגיע הזמן לגבות', body: lb ? `הגיבוי האחרון היה לפני ${days} ימים.` : 'עוד לא גיבית את הנתונים.',
          explain: 'הנתונים שמורים רק בטלפון. מומלץ לשמור קובץ גיבוי ב-Google Drive.' });
      }
    }
    if (on('recuperation') && S.startDate) {
      const L = Engine.leaveBalances(model, today);
      const rc = L.recuperation;
      if (rc && rc.eligible) {
        if (U.diffDays(rc.eligibleFrom, today) <= 45 && U.diffDays(rc.eligibleFrom, today) >= 0) {
          alerts.push({ key: 'recup-eligible', type: 'recuperation', severity: 'good', push: 'critical',
            title: 'השלמת שנת עבודה — מגיעים לך דמי הבראה', body: `הערכה: ${rc.days} ימים × ${U.money(rc.rate, 0)} × היקף משרה ${U.num(L.jobPct * 100, 0)}% ≈ ${U.money(rc.amount, 0)}.`,
            explain: 'לפי צו ההרחבה: אחרי שנת עבודה, לפי ותק והיקף משרה. ההיקף מחושב מהשעות בפועל.' });
        }
        const rm = +S.leave.recuperationMonth || 0;
        if (rm > 0 && +today.slice(5, 7) === rm) {
          alerts.push({ key: 'recup-' + today.slice(0, 4), type: 'recuperation', severity: 'info', push: 'critical',
            title: 'בדוק שקיבלת דמי הבראה', body: `החודש המעסיק אמור לשלם הבראה. הערכה: ${U.money(rc.amount, 0)}.`,
            explain: 'חודש התשלום מוגדר בהגדרות › חופשה ומחלה.' });
        }
      }
    }

    /* ---- weekly summary ---- */
    let weekly = null;
    if (on('weekly')) {
      const wd = +cfg.weeklyDay, wh = +cfg.weeklyHour;
      let wStart = ws;
      let trigger = U.toEpoch(U.addDays(wStart, (wd - (S.weekStart || 0) + 7) % 7), U.pad(wh) + ':00');
      if (now < trigger) { wStart = U.addDays(ws, -7); trigger -= 7 * U.DAY; }
      const wEnd = U.addDays(wStart, 6);
      weekly = weeklySummary(model, wStart, wEnd, roleName, S);
      if (weekly && weekly.t.shifts > 0) {
        alerts.push({ key: 'weekly-' + wStart, type: 'weekly', severity: 'info', push: 'anomaly', data: { from: wStart, to: wEnd },
          title: 'הסיכום השבועי שלך', body: weekly.sentence, explain: weekly.explain });
      }
    }

    for (const al of alerts) {
      al.cat = (TYPE_INFO[al.type] || {}).cat || 'info';
      if (al.key.indexOf('undefined') >= 0) al.key = al.type + '-' + al.title;
    }
    return { alerts, live, projection, weekly, weekCmp };
  }

  /** Plain-language weekly sentence. */
  function weeklySummary(model, from, to, roleName, S) {
    const t = Engine.totals(model, from, to);
    const prev = [];
    for (let i = 1; i <= 4; i++) prev.push(Engine.totals(model, U.addDays(from, -7 * i), U.addDays(to, -7 * i)));
    const ah = avg(prev.map((p) => p.hours));
    const diff = t.hours - ah;
    let sentence = `השבוע עבדת ${U.num(t.hours, 1)} שעות ב-${t.shifts} משמרות והרווחת ${U.money(t.gross, 0)} ברוטו.`;
    const hasHistory = prev.some((p) => p.shifts > 0);
    if (hasHistory && Math.abs(diff) >= 1) {
      // which role drove the change?
      let driver = null, best = 0;
      const ids = new Set([...Object.keys(t.byRole), ...prev.flatMap((p) => Object.keys(p.byRole))]);
      for (const id of ids) {
        const d = (t.byRole[id] ? t.byRole[id].hours : 0) - avg(prev.map((p) => (p.byRole[id] ? p.byRole[id].hours : 0)));
        if (Math.sign(d) === Math.sign(diff) && Math.abs(d) > best) { best = Math.abs(d); driver = id; }
      }
      sentence += ` זה ${U.num(Math.abs(diff), 1)} שעות ${diff > 0 ? 'יותר' : 'פחות'} מהממוצע`;
      if (driver && ids.size > 1) sentence += `, בעיקר ב${roleName(driver)}`;
      sentence += '.';
    } else if (hasHistory) sentence += ' בערך כמו הממוצע שלך.';
    if (t.restHours >= 1) sentence += ` ${U.num(t.restHours, 1)} מהשעות היו בשבת/חג.`;
    return { from, to, t, avgHours: ah, sentence, explain: `השבוע ⁦${U.fmtDate(from, 'short')}–${U.fmtDate(to, 'short')}⁩, בהשוואה לממוצע 4 השבועות שלפניו (${U.num(ah, 1)} ש׳).` };
  }

  root.Insights = { run, metrics, compareSeries, weeklySummary, TYPE_INFO, pctDev };
})(typeof window !== 'undefined' ? window : globalThis);
