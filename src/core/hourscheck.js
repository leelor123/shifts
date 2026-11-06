/* ============================================================
 * hourscheck.js — the employer's hours report (דוח נוכחות) against the person's own shifts, day by day, before
 * the payslip is made.
 *
 * compare(report, mine, { from, to }):
 *   report: the rows core/timesheet.js read ({ date, start, end, hours }; start and end may be missing when the
 *           report gives hours only);
 *   mine:   the person's done shifts in the period ({ id, date, start, end, hours, span }: times "HH:MM",
 *           hours paid, span the hours from start to end).
 * Each report row is paired with the shift nearest to it in time (the same day, or a night shift the report
 * puts on the next day), the closest pairs first. Then:
 *   'missingEmp'  a shift of mine the report lacks;
 *   'diff'        the start or the end differs by more than 10 minutes (hours only: the hours differ by more);
 *   'missingMine' a report row with no shift of mine;
 *   'ok'          the same.
 * letter(items, label) writes the short message to the employer: only the shifts missing in the report and the
 * different hours. A row only the report has is the person's to check, so it is not in the letter.
 * The money each difference is worth comes from the engine (app/hours-check.js).
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const TOL = 10; // minutes
  const NEAR = 3 * 60; // a report row and a shift further apart than this are not the same shift

  const mins = (t) => (t && /^\d{1,2}:\d{2}$/.test(t) ? +t.split(':')[0] * 60 + +t.split(':')[1] : null);
  const dayNo = (k) => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
  /** A row's start and end in minutes on one line of time (an end before the start is the next morning). */
  function span(date, start, end, hours) {
    const s = mins(start);
    if (s == null) return null;
    const a = dayNo(date) * 1440 + s;
    let e = mins(end);
    if (e == null) return hours > 0 ? { a, b: a + Math.round(hours * 60) } : null;
    e = dayNo(date) * 1440 + e;
    if (e <= a) e += 1440;
    return { a, b: e };
  }

  function compare(report, mine, opts) {
    opts = opts || {};
    const from = opts.from || '0000', to = opts.to || '9999';
    const R = (report || []).filter((r) => r && r.date && r.date >= from && r.date <= to).map((r, i) => ({ i, r, t: r.start ? span(r.date, r.start, r.end, r.hours) : null }));
    const M = (mine || []).filter((m) => m && m.date && m.date >= from && m.date <= to).map((m, i) => ({ i, m, t: span(m.date, m.start, m.end, m.span) }));
    // every possible pair with its distance
    const pairs = [];
    for (const x of R) {
      for (const y of M) {
        if (x.t && y.t) {
          const ds = Math.abs(x.t.a - y.t.a), de = Math.abs(x.t.b - y.t.b);
          const overlap = Math.min(x.t.b, y.t.b) - Math.max(x.t.a, y.t.a);
          if (overlap <= 0 && Math.min(ds, de) > NEAR) continue;
          pairs.push({ x, y, d: ds + de });
        } else if (x.r.date === y.m.date) {
          // hours only: the same day, the nearest hours
          pairs.push({ x, y, d: Math.abs((x.r.hours || 0) - (y.m.hours || 0)) * 60 + 1 });
        }
      }
    }
    pairs.sort((p, q) => p.d - q.d || p.x.i - q.x.i);
    const usedR = new Set(), usedM = new Set(), out = [];
    for (const p of pairs) {
      if (usedR.has(p.x.i) || usedM.has(p.y.i)) continue;
      usedR.add(p.x.i); usedM.add(p.y.i);
      const r = p.x.r, m = p.y.m;
      const it = { type: 'ok', date: m.date, rep: r, mine: m };
      if (p.x.t && p.y.t) {
        it.dStart = p.x.t.a - p.y.t.a; // minutes, + = the report starts later
        it.dEnd = p.x.t.b - p.y.t.b; // + = the report ends later
        if (Math.abs(it.dStart) > TOL || Math.abs(it.dEnd) > TOL) it.type = 'diff';
      } else {
        // the report's hours against the paid hours or the whole span, whichever it is closer to (a report may or
        // may not take the break out)
        const h = +r.hours || 0;
        const d = [m.hours, m.span].filter((v) => v != null).map((v) => h - v).sort((a, b) => Math.abs(a) - Math.abs(b))[0] || 0;
        it.dHours = Math.round(d * 100) / 100;
        if (Math.abs(d * 60) > TOL) it.type = 'diff';
      }
      out.push(it);
    }
    for (const y of M) if (!usedM.has(y.i)) out.push({ type: 'missingEmp', date: y.m.date, mine: y.m });
    for (const x of R) if (!usedR.has(x.i)) out.push({ type: 'missingMine', date: x.r.date, rep: x.r });
    const order = { missingEmp: 0, diff: 1, missingMine: 2, ok: 3 };
    out.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type]);
    const count = (t) => out.filter((x) => x.type === t).length;
    return { items: out, missingEmp: count('missingEmp'), diff: count('diff'), missingMine: count('missingMine'), ok: count('ok') };
  }

  /** "08:00–16:30", kept left to right inside Hebrew text and on one line. */
  const range = (a, b) => '\u2066' + a + '\u2060–\u2060' + b + '\u2069';
  const hoursOf = (h) => U.num(h, 2);
  /** How one side of a difference reads: its times, or its hours. */
  function side(x) {
    if (x.start && x.end) return range(x.start, x.end);
    return `${hoursOf(x.hours)} שעות`;
  }
  const dayOf = (k) => `${U.DAYS[U.dow(k)]} ${U.fmtDate(k, 'short')}`;

  /** The message to the employer, or '' when the report has nothing to fix. */
  function letter(items, label) {
    const lines = [];
    for (const it of items || []) {
      if (it.type === 'missingEmp') lines.push(`• ${dayOf(it.date)}: עבדתי ${side(it.mine)}, והמשמרת לא מופיעה בדוח.`);
      else if (it.type === 'diff') lines.push(`• ${dayOf(it.date)}: בדוח ${side(it.rep)}, ואצלי ${side(it.mine)}.`);
    }
    if (!lines.length) return '';
    const head = lines.length === 1 ? 'מצאתי הבדל אחד מהרישום שלי:' : 'מצאתי כמה הבדלים מהרישום שלי:';
    return `שלום,\nעברתי על דוח הנוכחות${label ? ` של ${label}` : ''} לפני הכנת התלוש. ${head}\n${lines.join('\n')}\nאפשר לבדוק ולעדכן לפני שהתלוש יוצא? תודה רבה!`;
  }

  root.HoursCheck = { compare, letter, span, TOL };
  if (typeof module !== 'undefined') module.exports = root.HoursCheck;
})(typeof window !== 'undefined' ? window : globalThis);
