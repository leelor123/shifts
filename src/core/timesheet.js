/* ============================================================
 * timesheet.js — reading an hours report someone already has (from the employer's clock system, an Excel
 * sheet, a PDF, a photo, a note) into shifts.
 *
 * The report is read line by line (a spreadsheet row is a line). A line with a date is a shift when it
 * also has:
 *   - two times ("08:00 16:30", "8:00-16:30", "16:30 08:00" when a clock prints the exit first is read in
 *     order of the day: the earlier one starts), the first two in the line; an end before the start is
 *     the next morning (a night shift);
 *   - one time and a number of hours ("08:00 ... 8.5"): it ends that many hours later;
 *   - only a number of hours ("8.5", "8:30" as a total is a time, so only decimals count here): the start
 *     is not known — the shift is kept with hours only, and the screen asks when such shifts start.
 * Dates: 14/10/2026, 14.10.26, 14-10-2026, 2026-10-14, and 14/10 or 14.10 without a year (only when the
 * line also has times or hours, so "8.5" alone is never a date). Without a year: the latest such date that
 * is not in the future. Days come before months (as in Israel). Header and total lines (סה"כ, total) are
 * left out. Times may be "8:00:00", "8:00 AM", "20.30" inside a range ("08.30-16.00").
 * ============================================================ */
(function (root) {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const validDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate() && y >= 2000 && y <= 2100;
  const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };

  const TOTAL = /סה["״']?כ|סיכום|total|sum\b/i;
  // a time: 8:00, 08:00:00, 8:00 PM; a range may also use dots (08.30-16.00)
  const TIME = /(?<![\d:.])(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp])\.?[Mm]\.?)?(?![\d])/g;
  const RANGE_DOT = /(?<![\d.:])(\d{1,2})\.(\d{2})\s*[-–—]\s*(\d{1,2})\.(\d{2})(?![\d.])/;
  const DATE_FULL = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?!\d)/;
  const DATE_ISO = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/;
  const DATE_SHORT = /(?<![\d.:])(\d{1,2})[./](\d{1,2})(?![\d.:/])/;
  const HOURS = /(?<![\d:./-])(\d{1,2}(?:\.\d{1,2})?)(?![\d:./-])/g;

  function hm(h, m, ap) {
    h = +h; m = +m;
    if (ap) { const p = ap.toLowerCase() === 'p'; if (h === 12) h = p ? 12 : 0; else if (p) h += 12; }
    return h < 24 && m < 60 ? pad(h) + ':' + pad(m) : null;
  }
  /** The latest date with this day and month that is not after today. */
  function yearFor(m, d, today) {
    const ty = +today.slice(0, 4);
    for (const y of [ty, ty - 1]) if (validDate(y, m, d) && key(y, m, d) <= today) return y;
    return ty - 1;
  }

  /**
   * text → { rows: [{ date, start, end, hours, overnight, line, n }], noStart: count of rows with hours only,
   *          guessedYear: true when some dates had no year }
   */
  function parse(text, opts) {
    opts = opts || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const rows = [];
    let guessedYear = false;
    let exitFirst = false; // a header line with the exit column before the entry column
    String(text || '').split(/\r?\n/).forEach((raw, n) => {
      const line = raw.replace(/‎|‏|‪|‫|‬|⁦|⁧|⁨|⁩/g, '').replace(/\s+/g, ' ').trim();
      if (!line || TOTAL.test(line)) return;
      const iIn = line.search(/כניסה|התחלה|\bin\b|\bstart\b/i), iOut = line.search(/יציאה|סיום|\bout\b|\bend\b/i);
      if (iIn >= 0 && iOut >= 0 && !/\d{1,2}[:.]\d{2}/.test(line)) { exitFirst = iOut < iIn; return; }
      // the times first (so a time is never read as a date)
      let rest = line;
      const times = [];
      const dot = rest.match(RANGE_DOT);
      if (dot) {
        const a = hm(dot[1], dot[2]), b = hm(dot[3], dot[4]);
        if (a && b) { times.push(a, b); rest = rest.replace(dot[0], ' '); }
      }
      rest = rest.replace(TIME, (all, h, m, ap) => { const t = hm(h, m, ap); if (t) times.push(t); return ' '; });
      // the date
      let date = null, ym = null;
      let mm = rest.match(DATE_ISO);
      if (mm && validDate(+mm[1], +mm[2], +mm[3])) { date = key(+mm[1], +mm[2], +mm[3]); rest = rest.replace(mm[0], ' '); }
      if (!date && (mm = rest.match(DATE_FULL))) {
        let y = +mm[3]; if (y < 100) y += 2000;
        if (validDate(y, +mm[2], +mm[1])) { date = key(y, +mm[2], +mm[1]); rest = rest.replace(mm[0], ' '); }
      }
      // hours as a number ("8.5", "8"), not part of anything else
      const nums = [];
      rest.replace(HOURS, (all, v) => { nums.push(+v); return all; });
      if (!date && (mm = rest.match(DATE_SHORT)) && (times.length || nums.length)) {
        const d = +mm[1], m = +mm[2];
        const y = yearFor(m, d, today);
        if (validDate(y, m, d)) { date = key(y, m, d); ym = true; rest = rest.replace(mm[0], ' '); nums.length = 0; rest.replace(HOURS, (all, v) => { nums.push(+v); return all; }); }
      }
      if (!date) return;
      const hoursNum = nums.find((v) => v >= 0.5 && v <= 24 && (v % 1 !== 0 || v <= 16));
      let start = null, end = null, hours = null;
      if (times.length >= 2) {
        start = times[0]; end = times[1];
        if (exitFirst) { const t = start; start = end; end = t; }
        // the exit printed before the entry, without a header to say so: a "night" of more than 12 hours that
        // is a normal day the other way round (17:00 08:00 → 08:00-17:00; 22:00 06:00 stays a night)
        const d1 = (toMin(end) - toMin(start) + 1440) % 1440;
        const d2 = (toMin(start) - toMin(end) + 1440) % 1440;
        if (toMin(end) < toMin(start) && d1 > 12 * 60 && d2 <= 12 * 60) { const t = start; start = end; end = t; }
        hours = ((toMin(end) - toMin(start) + 1440) % 1440 || 1440) / 60;
      } else if (times.length === 1 && hoursNum) {
        start = times[0]; hours = hoursNum; end = fromMin(toMin(start) + Math.round(hoursNum * 60));
      } else if (hoursNum) {
        hours = hoursNum;
      } else return;
      if (!(hours > 0 && hours <= 24)) return;
      if (ym) guessedYear = true;
      rows.push({ date, start, end, hours: Math.round(hours * 100) / 100, overnight: !!(start && end && toMin(end) <= toMin(start)), line: raw.trim().slice(0, 120), n });
    });
    return { rows, noStart: rows.filter((r) => !r.start).length, guessedYear };
  }

  /** A row → start and end (epoch ms), with a start time for rows that have hours only. */
  function times(row, startFor, toEpoch) {
    const s = row.start || startFor;
    if (!s) return null;
    const start = toEpoch(row.date, s);
    const end = start + Math.round(row.hours * 60) * 60000;
    return { start, end };
  }

  root.Timesheet = { parse, times };
})(typeof window !== 'undefined' ? window : globalThis);
