/* ============================================================
 * hourscheck.js — the employer's hours report (דוח נוכחות) against the person's own shifts, day by day, before
 * the payslip is made.
 *
 * compare(report, mine, { from, to }):
 *   report: the rows core/timesheet.js read ({ date, start, end, hours }; start and end may be missing when the
 *           report gives hours only);
 *   mine:   the person's done shifts in the period ({ id, date, start, end, hours, span }: times "HH:MM",
 *           hours paid, span the hours from start to end). The caller may also give the shifts of the day before
 *           `from`: a night that runs into the period is compared with a row that starts at midnight on its
 *           first day (the report of the month before holds the first part).
 * How rows and shifts meet, in this order:
 *   1. a shift of mine written twice (the same day and times) counts once;
 *   2. the period's edges: a row that starts at 00:00 on the first day (or ends at midnight on the last) and a
 *      night of mine that goes over that midnight are the same shift; only the side inside the report is compared;
 *   3. several report rows inside one shift of mine (a night the clock system splits at midnight, a lunch that
 *      was punched out) are that shift: the first entry and the last exit are compared, and the hours the rows
 *      hold against my paid hours;
 *   4. several shifts of mine inside one report row are that row; a row with hours only is the day's total;
 *   5. the rest: each report row with the shift nearest to it in time (the same day, or a night shift the report
 *      puts on the next day), the closest pairs first.
 * Then:
 *   'missingEmp'  a shift of mine the report lacks;
 *   'diff'        the start, the end or the length differs by more than 10 minutes (hours only: the hours differ
 *                 by more). Smaller differences are 'ok' one by one, but not when together they leave the report
 *                 more than half an hour short over the period: then every pair that is short is a 'diff'
 *                 (small: true), so ten minutes shaved off every day is never "the report matches";
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
  const DRIFT = 30; // minutes: small differences that together leave the report shorter than this stay "the same"

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
  const over = (p, q) => Math.min(p.b, q.b) - Math.max(p.a, q.a);
  const len = (t) => t.b - t.a;
  const round2 = (v) => Math.round(v * 100) / 100;
  const okDate = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k);

  function compare(report, mine, opts) {
    opts = opts || {};
    const from = opts.from || '0000', to = opts.to || '9999';
    const inPeriod = (k) => k >= from && k <= to;
    const R = (report || []).filter((r) => r && okDate(r.date) && inPeriod(r.date)).map((r, i) => ({ i, r, t: r.start ? span(r.date, r.start, r.end, r.hours) : null, unread: !!r.start && !r.end && !(+r.hours > 0) }));
    // my shifts, each once: the same day and times written twice is one shift (it was "missing in the report")
    const twice = new Set();
    const all = (mine || []).filter((m) => m && okDate(m.date)).filter((m) => {
      if (!m.start || !m.end) return true;
      const k = m.date + ' ' + m.start + ' ' + m.end;
      if (twice.has(k)) return false;
      twice.add(k);
      return true;
    }).map((m, i) => ({ i, m, t: span(m.date, m.start, m.end, m.span) }));
    const M = all.filter((y) => inPeriod(y.m.date));
    const usedR = new Set(), usedM = new Set(), out = [];
    const freeR = (x) => !usedR.has(x.i), freeM = (y) => !usedM.has(y.i);

    /* ---- the period's edges: a night over the first or the last midnight of the report ---- */
    if (okDate(opts.from)) {
      const day0 = dayNo(opts.from) * 1440, prev = U.addDays(opts.from, -1);
      for (const y of all) {
        if (y.m.date !== prev || !y.t || y.t.b <= day0 + TOL) continue;
        const x = R.find((q) => freeR(q) && q.t && Math.abs(q.t.a - day0) <= 1 && over(q.t, y.t) > 0 && !M.some((y2) => y2.t && over(q.t, y2.t) > 0));
        if (!x) continue; // the whole night is in the report before this one
        usedR.add(x.i);
        const it = { type: 'ok', date: x.r.date, rep: x.r, mine: y.m, mineSide: { start: '00:00', end: y.m.end }, dStart: 0, dEnd: x.t.b - y.t.b, edge: 'start' };
        if (Math.abs(it.dEnd) > TOL) it.type = 'diff';
        out.push(it);
      }
    }
    if (okDate(opts.to)) {
      const night = (dayNo(opts.to) + 1) * 1440;
      for (const x of R) {
        if (!freeR(x) || !x.t || x.r.date !== opts.to || x.t.b > night || night - x.t.b > 1) continue; // ends at 23:59 or 00:00
        const y = M.find((q) => freeM(q) && q.t && q.t.b > night + TOL && over(x.t, q.t) > 0);
        if (!y) continue;
        usedR.add(x.i); usedM.add(y.i);
        const it = { type: 'ok', date: y.m.date, rep: x.r, mine: y.m, mineSide: { start: y.m.start, end: x.r.end }, dStart: x.t.a - y.t.a, dEnd: 0, edge: 'end' };
        if (Math.abs(it.dStart) > TOL) it.type = 'diff';
        out.push(it);
      }
    }

    /* ---- several report rows inside one shift of mine ---- */
    for (const y of M) {
      if (!freeM(y) || !y.t) continue;
      const ins = R.filter((x) => freeR(x) && x.t && x.t.a >= y.t.a - TOL && x.t.b <= y.t.b + TOL && over(x.t, y.t) > 0);
      if (ins.length < 2) continue;
      // each of them is this shift's alone
      if (ins.some((x) => M.some((y2) => y2 !== y && freeM(y2) && y2.t && over(x.t, y2.t) > 0))) continue;
      ins.sort((p, q) => p.t.a - q.t.a);
      const a = ins[0].t.a, b = ins.reduce((v, x) => Math.max(v, x.t.b), a);
      // the minutes the rows hold (rows over each other count once)
      let worked = 0, at = a;
      for (const x of ins) { const s = Math.max(x.t.a, at); if (x.t.b > s) { worked += x.t.b - s; at = x.t.b; } }
      const paid = Math.round((y.m.hours != null && isFinite(y.m.hours) ? +y.m.hours : len(y.t) / 60) * 60);
      const it = {
        type: 'ok', date: y.m.date, mine: y.m,
        rep: { date: ins[0].r.date, start: ins[0].r.start, end: ins[ins.length - 1].r.end, hours: round2(worked / 60), parts: ins.map((x) => x.r) },
        dStart: a - y.t.a, dEnd: b - y.t.b, gap: (b - a) - worked, short: paid - worked,
      };
      if (Math.abs(it.dStart) > TOL || Math.abs(it.dEnd) > TOL || it.short > TOL) it.type = 'diff';
      ins.forEach((x) => usedR.add(x.i)); usedM.add(y.i);
      out.push(it);
    }
    /* ---- several shifts of mine inside one report row (a row with hours only: the day's shifts) ---- */
    const many = (ys) => ({ id: ys[0].m.id, ids: ys.map((y) => y.m.id), date: ys[0].m.date, start: ys[0].m.start, end: ys[ys.length - 1].m.end,
      hours: round2(ys.reduce((s, y) => s + (+y.m.hours || 0), 0)), span: round2(ys.reduce((s, y) => s + (y.m.span != null ? +y.m.span : y.t ? len(y.t) / 60 : 0), 0)), parts: ys.map((y) => y.m) });
    for (const x of R) {
      if (!freeR(x) || x.unread) continue;
      if (x.t) {
        const ins = M.filter((y) => freeM(y) && y.t && y.t.a >= x.t.a - TOL && y.t.b <= x.t.b + TOL && over(x.t, y.t) > 0);
        if (ins.length < 2) continue;
        if (ins.some((y) => R.some((x2) => x2 !== x && freeR(x2) && x2.t && over(x2.t, y.t) > 0))) continue;
        ins.sort((p, q) => p.t.a - q.t.a);
        const it = { type: 'ok', date: ins[0].m.date, rep: x.r, mine: many(ins), dStart: x.t.a - ins[0].t.a, dEnd: x.t.b - ins.reduce((v, y) => Math.max(v, y.t.b), 0) };
        if (Math.abs(it.dStart) > TOL || Math.abs(it.dEnd) > TOL) it.type = 'diff';
        usedR.add(x.i); ins.forEach((y) => usedM.add(y.i));
        out.push(it);
      } else if (+x.r.hours > 0) {
        // the only row of its day, and I have more than one shift that day: its hours are the day's
        if (R.some((x2) => x2 !== x && x2.r.date === x.r.date)) continue;
        const ins = M.filter((y) => freeM(y) && y.m.date === x.r.date).sort((p, q) => (p.t && q.t ? p.t.a - q.t.a : 0));
        if (ins.length < 2) continue;
        const m = many(ins), h = +x.r.hours;
        const d = [m.hours, m.span].map((v) => h - v).sort((p, q) => Math.abs(p) - Math.abs(q))[0] || 0;
        const it = { type: 'ok', date: x.r.date, rep: x.r, mine: m, dHours: round2(d) };
        if (Math.abs(d * 60) > TOL) it.type = 'diff';
        usedR.add(x.i); ins.forEach((y) => usedM.add(y.i));
        out.push(it);
      }
    }

    /* ---- the rest: every possible pair with its distance, the closest first ---- */
    const pairs = [];
    for (const x of R) {
      if (!freeR(x)) continue;
      for (const y of M) {
        if (!freeM(y)) continue;
        if (x.t && y.t) {
          const ds = Math.abs(x.t.a - y.t.a), de = Math.abs(x.t.b - y.t.b);
          if (over(x.t, y.t) <= 0 && Math.min(ds, de) > NEAR) continue;
          pairs.push({ x, y, d: ds + de });
        } else if (x.unread) {
          // a start with no end and no hours (the exit time was not read): paired by the start on the same day, and
          // never a difference ("בדוח 0 שעות" went into the letter, deep review, Nov 2026)
          const s = mins(x.r.start), ms = mins(y.m.start);
          if (x.r.date === y.m.date) pairs.push({ x, y, d: (s != null && ms != null ? Math.abs(s - ms) : 0) + 1 });
        } else if (x.r.date === y.m.date || (x.r.date === U.addDays(y.m.date, 1) && y.t && y.t.b > (dayNo(y.m.date) + 1) * 1440)) {
          // hours only: the same day, the nearest hours (a night shift may be on the report's next day: it ended
          // there, and it was reported missing on both sides, deep review, Nov 2026)
          pairs.push({ x, y, d: Math.abs((x.r.hours || 0) - (y.m.hours || 0)) * 60 + (x.r.date === y.m.date ? 1 : 2) });
        }
      }
    }
    pairs.sort((p, q) => p.d - q.d || p.x.i - q.x.i || p.y.i - q.y.i);
    for (const p of pairs) {
      if (usedR.has(p.x.i) || usedM.has(p.y.i)) continue;
      usedR.add(p.x.i); usedM.add(p.y.i);
      const r = p.x.r, m = p.y.m;
      const it = { type: 'ok', date: m.date, rep: r, mine: m };
      if (p.x.unread) {
        it.unread = true;
      } else if (p.x.t && p.y.t) {
        it.dStart = p.x.t.a - p.y.t.a; // minutes, + = the report starts later
        it.dEnd = p.x.t.b - p.y.t.b; // + = the report ends later
        // each end, and the length: 9 minutes late in and 9 early out is 18 minutes less
        if (Math.abs(it.dStart) > TOL || Math.abs(it.dEnd) > TOL || Math.abs(it.dEnd - it.dStart) > TOL) it.type = 'diff';
        // the hours the report pays, when it prints them apart from its times (core/timesheet.js 'paid': a break the
        // employer took out): what the times do not already explain, against my paid hours
        const pd = +r.paid, mh = +m.hours;
        if (r.paid != null && pd > 0 && isFinite(pd) && m.hours != null && isFinite(mh)) {
          it.dPaid = Math.round((pd - mh) * 60) - (it.dEnd - it.dStart);
          if (it.dPaid < -TOL) { it.type = 'diff'; it.lessPaid = -it.dPaid; it.hoursToo = true; }
        }
      } else {
        // the report's hours against the paid hours or the whole span, whichever it is closer to (a report may or
        // may not take the break out)
        const h = +r.hours || 0;
        const d = [m.hours, m.span].filter((v) => v != null && isFinite(v)).map((v) => h - v).sort((a, b) => Math.abs(a) - Math.abs(b))[0] || 0;
        it.dHours = round2(d);
        if (Math.abs(d * 60) > TOL) it.type = 'diff';
      }
      out.push(it);
    }
    for (const y of M) if (!usedM.has(y.i)) out.push({ type: 'missingEmp', date: y.m.date, mine: y.m });
    // a row whose exit was not read and no shift of mine that day: still only the report's, but its length is unknown
    for (const x of R) if (!usedR.has(x.i)) out.push(x.unread ? { type: 'missingMine', date: x.r.date, rep: x.r, unread: true } : { type: 'missingMine', date: x.r.date, rep: x.r });

    /* ---- small differences add up: how many minutes the report is short over the pairs that "match" ---- */
    const shortOf = (it) => {
      if (it.type !== 'ok' || it.unread) return 0;
      if (it.short != null) return Math.max(-TOL, Math.min(TOL, it.short));
      if (it.dHours != null) return -it.dHours * 60;
      return (it.dStart || 0) - (it.dEnd || 0) - (it.dPaid || 0);
    };
    const drift = Math.round(out.reduce((s, it) => s + shortOf(it), 0));
    if (drift > DRIFT) for (const it of out) if (shortOf(it) >= 1) { it.type = 'diff'; it.small = true; }

    const order = { missingEmp: 0, diff: 1, missingMine: 2, ok: 3 };
    out.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type] || String((a.rep || a.mine).start || '').localeCompare(String((b.rep || b.mine).start || '')));
    const count = (t) => out.filter((x) => x.type === t).length;
    return { items: out, missingEmp: count('missingEmp'), diff: count('diff'), missingMine: count('missingMine'), ok: count('ok'), drift,
      // rows read without their exit: nothing is known of their hours, so the report cannot be called the same
      unread: out.filter((x) => x.unread).length };
  }

  /**
   * A night the clock system writes as two rows, cut at midnight ("13/10 22:00–00:00" and "14/10 00:00–06:00", or
   * the first ending 23:59), is one shift: saved as two, each half had its own day's overtime count and the
   * seven-hour night day never applied. Rows sorted by day and start; a row is joined only to a row that starts at
   * 00:00 the next day, and only while the whole stays a shift (16 hours at most). The import review and the hours
   * check both read the report through this.
   */
  function joinNights(rows) {
    const list = (rows || []).filter(Boolean);
    const out = [];
    const used = new Set();
    list.forEach((r, i) => {
      if (used.has(i)) return;
      let cur = r;
      while (cur.start && (cur.end === '00:00' || cur.end === '23:59')) {
        const last = cur.parts ? cur.parts[cur.parts.length - 1] : cur;
        const next = U.addDays(last.date, 1);
        const j = list.findIndex((x, k) => !used.has(k) && k !== i && x.date === next && x.start === '00:00' && x.end && x.end !== '00:00');
        if (j < 0) break;
        const b = list[j];
        const hours = round2((+cur.hours || 0) + (cur.end === '23:59' ? 1 / 60 : 0) + (+b.hours || 0));
        // longer than any shift the reader accepts: two shifts (the morning row was taken and then lost, Nov 2026)
        if (hours > 16) break;
        used.add(j);
        cur = Object.assign({}, cur, { end: b.end, hours, overnight: true, parts: (cur.parts || [cur]).concat([b]), doubt: cur.doubt || b.doubt });
        // the paid hours of the whole, when the report printed them for a part
        const parts = cur.parts;
        if (parts.some((p) => +p.paid > 0)) cur.paid = round2(parts.reduce((t, p, k) => t + (+p.paid > 0 ? +p.paid : (+p.hours || 0) + (k < parts.length - 1 && p.end === '23:59' ? 1 / 60 : 0)), 0));
        else delete cur.paid;
        if (!cur.doubt) delete cur.doubt;
      }
      out.push(cur);
    });
    return out;
  }

  /** "08:00–16:30", kept left to right inside Hebrew text and on one line. */
  const range = (a, b) => '\u2066' + a + '\u2060–\u2060' + b + '\u2069';
  const hoursOf = (h) => U.num(h, 2);
  /** How one side of a difference reads: its times (each part of it, when it is several rows or shifts), or its hours. */
  function side(x, withHours) {
    if (x.parts && x.parts.length > 1 && x.parts.every((p) => p.start && p.end)) return x.parts.map((p) => range(p.start, p.end)).join(', ');
    // with the hours too, when the difference is in the paid hours and not in the times
    if (x.start && x.end) return withHours && +(x.paid || x.hours) > 0 ? range(x.start, x.end) + ' · ' + `${hoursOf(+(x.paid || x.hours))} שעות` : range(x.start, x.end);
    if (x.start && !(+x.hours > 0)) return range(x.start, '?'); // the exit was not read (it read "0 שעות")
    return `${hoursOf(x.hours)} שעות`;
  }
  const dayOf = (k) => `${U.DAYS[U.dow(k)]} ${U.fmtDate(k, 'short')}`;

  /** The message to the employer, or '' when the report has nothing to fix. */
  function letter(items, label) {
    const lines = [];
    for (const it of items || []) {
      if (it.type === 'missingEmp') lines.push(`• ${dayOf(it.date)}: עבדתי ${side(it.mine)}, והמשמרת לא מופיעה בדוח.`);
      else if (it.type === 'diff') lines.push(`• ${dayOf(it.date)}: בדוח ${side(it.rep, it.hoursToo)}, ואצלי ${side(it.mineSide || it.mine, it.hoursToo)}.`);
    }
    if (!lines.length) return '';
    const head = lines.length === 1 ? 'מצאתי הבדל אחד מהרישום שלי:' : 'מצאתי כמה הבדלים מהרישום שלי:';
    return `שלום,\nעברתי על דוח הנוכחות${label ? ` של ${label}` : ''} לפני הכנת התלוש. ${head}\n${lines.join('\n')}\nאפשר לבדוק ולעדכן לפני שהתלוש יוצא? תודה רבה!`;
  }

  root.HoursCheck = { compare, letter, span, side, joinNights, TOL, DRIFT };
  if (typeof module !== 'undefined') module.exports = root.HoursCheck;
})(typeof window !== 'undefined' ? window : globalThis);
