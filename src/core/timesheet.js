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

  /* ============================================================
   * A photo (or a PDF) of a report, read as a TABLE: words with their place on the page
   * ({ text, x0, y0, x1, y1 }, y down), as the reader gives them (app/docread.js).
   *
   * Every report is a little different, so nothing is assumed about the layout; it is found:
   *   1. the words are cleaned (a reader's O for 0, l for 1, ; for :) and each says what it can be: a time,
   *      a date, a range "8:00-16:30", a number, a day of the week, a column name;
   *   2. rows: words side by side on the same line belong to one row, followed word to word (so a photo
   *      taken at an angle still has straight rows); the angle is measured and taken out;
   *   3. columns: the times of all the rows fall into columns. Which is the entry and which the exit is
   *      taken from the column names when they were read (כניסה/יציאה, In/Out, התחלה/סיום), and checked
   *      against the numbers themselves: the pair whose difference is a shift's length in nearly every row
   *      (and which another column — the total — often equals). A total, a break, an overtime column (125%)
   *      or a note never becomes a shift;
   *   4. dates: from the date column; one the reader got wrong ("25110" for 25/10, an 8 for a 6) is put
   *      right from the rows around it, which go day by day, and from the day of the week when there is one;
   *      a row with no date but between two dates and a day of the week gets its date from them;
   *   5. a row with an entry and no exit (a missed clock-out) is left out and counted, and rows like
   *      vacation, sickness, a holiday or a weekend without hours are simply no shifts.
   * A phone app's list, where the date is on one line and the hours on the line under it, is read too.
   * ============================================================ */
  const BIDI = /[‎‏‪-‮⁦-⁩]/g;
  const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const DOW_WORDS = [['ראשון', 'sun', 'sunday'], ['שני', 'mon', 'monday'], ['שלישי', 'tue', 'tues', 'tuesday'], ['רביעי', 'wed', 'wednesday'], ['חמישי', 'thu', 'thur', 'thurs', 'thursday'], ['שישי', 'fri', 'friday'], ['שבת', 'sat', 'saturday']];
  const DOW_LETTER = { 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5, 'ש': 6 };
  // column names (without quotes): what each column holds
  const ROLE = [
    ['date', /^(תאריך|date|תאריכים)$/i],
    ['dow', /^(יום|day|weekday)$/i],
    ['in', /^(כניסה|כניסה\d|התחלה|התחלת|in|start|entry|clockin|time-?in)$/i],
    ['out', /^(יציאה|יציאה\d|סיום|יציאת|out|end|exit|finish|clockout|time-?out)$/i],
    ['total', /^(סהכ|סה״כ|total|hours|שעות|נטו|ש"ע|duration)$/i],
    ['break', /^(הפסקה|הפסקות|break|breaks|הפ)$/i],
  ];
  const SKIP_ROW = /סה["״']?כ|סיכום|total|summary|ממוצע|average/i;

  const clean = (t) => String(t).replace(BIDI, '').replace(/^[|[\](){}<>"'`,;•·*_~]+|[|[\](){}<>"'`,;•·*_~]+$/g, '').trim();
  /** A reader's letters inside a number, back to digits (only in what is mostly digits). */
  function digits(t) {
    const nd = (t.match(/\d/g) || []).length;
    const look = (t.match(/[OoQD°lI|!\][Ss$BZz]/g) || []).length; // letters that look like digits
    const other = (t.match(/[A-Za-zא-ת]/g) || []).length - (t.match(/[OoQDlISsBZz]/g) || []).length;
    if (nd < 2 || other > 0 || look > nd) return t;
    return t.replace(/[OoQD°]/g, '0').replace(/[lI|!\]\[]/g, '1').replace(/[Ss$]/g, '5').replace(/B/g, '8').replace(/[Zz]/g, '2')
      .replace(/[;]/g, ':').replace(/,/g, '.').replace(/[–—]/g, '-').replace(/\s+/g, '').replace(/^[.:-]+|[.:-]+$/g, '');
  }
  const validHM = (h, m) => h >= 0 && h <= 24 && m >= 0 && m <= 59 && !(h === 24 && m > 0);
  const hmOf = (h, m) => pad(h % 24) + ':' + pad(m);

  /** What a cleaned word can be: [{ k: 'time'|'date'|'range'|'num'|'dow'|'year'|'mash'|'month', … }] */
  function itemsOf(raw) {
    const t0 = clean(raw);
    if (!t0) return [];
    const out = [];
    let m;
    if ((m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?[Mm]\.?$/.exec(t0))) {
      let h = +m[1]; const pm = m[3].toLowerCase() === 'p';
      if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
      return validHM(h, +m[2]) ? [{ k: 'time', v: hmOf(h, +m[2]), pad: true }] : [];
    }
    const t = digits(t0);
    // a range; one side may have lost its colon (8:00-1445)
    if ((m = /^(\d{1,2})(?:[:.]?(\d{2}))?-(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(t)) && (m[2] || m[4] || t.includes(':')) && /[:.]/.test(t)) {
      const a = [+m[1], +(m[2] || 0)], b = [+m[3], +(m[4] || 0)];
      if (validHM(...a) && validHM(...b)) return [{ k: 'range', a: hmOf(...a), b: hmOf(...b) }];
    }
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) return [{ k: 'date', d: +m[3], m: +m[2], y: +m[1], sure: true }];
    if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(t))) { let y = +m[3]; if (y < 100) y += 2000; return [{ k: 'date', d: +m[1], m: +m[2], y, sure: true }]; }
    if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(t))) return [{ k: 'date', d: +m[1], m: +m[2], sure: true }];
    if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t))) { if (validHM(+m[1], +m[2])) out.push({ k: 'time', v: hmOf(+m[1], +m[2]), pad: m[1].length === 2 }); return out; }
    if ((m = /^(\d{1,2})\.(\d{1,2})$/.exec(t))) {
      // 14.10 a date, 08.30 a time, 8.5 hours: each is kept as a possibility, the column decides
      if (+m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) out.push({ k: 'date', d: +m[1], m: +m[2], sure: false });
      if (m[2].length === 2 && validHM(+m[1], +m[2])) out.push({ k: 'time', v: hmOf(+m[1], +m[2]), pad: m[1].length === 2, weak: true });
      out.push({ k: 'num', v: +t });
      return out;
    }
    if ((m = /^\d+\.\d+$/.exec(t))) return [{ k: 'num', v: +t }];
    if (/^\d+$/.test(t)) {
      if (/^20\d\d$/.test(t)) out.push({ k: 'year', v: +t });
      if (t.length <= 2) out.push({ k: 'num', v: +t });
      // 0800 / 830: a time that lost its colon (taken only in a time column)
      if (t.length >= 3 && t.length <= 4) { const h = +t.slice(0, t.length - 2), mi = +t.slice(-2); if (validHM(h, mi)) out.push({ k: 'time', v: hmOf(h, mi), pad: t.length === 4, weak: true, bare: true }); }
      if (t.length >= 3 && t.length <= 10) out.push({ k: 'mash', s: t }); // 110 = 1/10 with the / read as 1
      return out;
    }
    if (/\d/.test(t) && /[./:-]/.test(t) && t.length <= 12) return [{ k: 'mash', s: t.replace(/\D/g, ''), raw: t }];
    // words
    const w = t0.replace(/["״'׳`]/g, '').toLowerCase();
    if (w.length === 1 && DOW_LETTER[w] != null && /[׳'"״]/.test(String(raw))) out.push({ k: 'dow', v: DOW_LETTER[w] });
    else if (w.length === 1 && DOW_LETTER[w] != null) out.push({ k: 'dow', v: DOW_LETTER[w], weak: true });
    const di = DOW_WORDS.findIndex((a) => a.includes(w) || a.includes(w.replace(/^(ב|ה|יום)/, '')));
    if (di >= 0) out.push({ k: 'dow', v: di });
    const mi = HE_MONTHS.findIndex((x) => w === x || w === 'ב' + x || w === 'ל' + x || (x === 'מרץ' && /^[בל]?מרס$/.test(w)));
    if (mi >= 0) out.push({ k: 'month', v: mi + 1 });
    const ei = EN_MONTHS.findIndex((x) => w.startsWith(x) && w.length <= 9);
    if (ei >= 0 && /^[a-z]+$/.test(w)) out.push({ k: 'month', v: ei + 1 });
    for (const [role, re] of ROLE) if (re.test(w.replace(/[-\s]/g, '')) || re.test(w)) { out.push({ k: 'role', v: role, n: (/(\d)$/.exec(w) || [])[1] }); break; }
    return out;
  }

  /** Words → rows (top to bottom), each its words left to right, with the page's angle taken out. */
  function rowsOf(words) {
    const ws = words.map((w, i) => ({ ...w, i, cx: (w.x0 + w.x1) / 2, cy: (w.y0 + w.y1) / 2, h: Math.max(1, w.y1 - w.y0), w: Math.max(1, w.x1 - w.x0) }));
    const hs = ws.map((w) => w.h).sort((a, b) => a - b);
    const mh = hs[Math.floor(hs.length / 2)] || 20;
    const parent = ws.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const vov = (a, b) => (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)) / Math.min(a.h, b.h);
    // each word joins the nearest word to its right that shares its line (tall boxes — a logo, two lines
    // read as one — join nothing)
    for (const a of ws) {
      if (a.h > mh * 2.4) continue;
      let best = null, bd = Infinity;
      for (const b of ws) {
        if (b === a || b.h > mh * 2.4 || b.cx <= a.cx) continue;
        if (vov(a, b) < 0.45) continue;
        const d = b.x0 - a.x1 + Math.abs(b.cy - a.cy) * 4;
        if (d < bd) { bd = d; best = b; }
      }
      if (best) parent[find(a.i)] = find(best.i);
    }
    const groups = new Map();
    for (const w of ws) { const r = find(w.i); (groups.get(r) || groups.set(r, []).get(r)).push(w); }
    let rows = [...groups.values()];
    // the angle: how much a line climbs from each word to the next one in its row, the middle of them all
    // (a row that joined two lines by mistake is one odd step among many), never more than 8°
    const slopes = [];
    for (const r of rows) {
      const s = r.slice().sort((a, b) => a.cx - b.cx);
      for (let i = 1; i < s.length; i++) {
        const dx = s[i].cx - s[i - 1].cx;
        if (dx > mh * 2 && Math.abs(s[i].h - s[i - 1].h) < mh * 0.5) slopes.push((s[i].cy - s[i - 1].cy) / dx);
      }
    }
    slopes.sort((a, b) => a - b);
    const slope = slopes.length >= 3 ? Math.max(-0.14, Math.min(0.14, slopes[Math.floor(slopes.length / 2)])) : 0;
    const th = Math.atan(slope), cos = Math.cos(th), sin = Math.sin(th);
    for (const w of ws) { w.x = w.cx * cos + w.cy * sin; w.y = -w.cx * sin + w.cy * cos; }
    rows = rows.map((r) => r.sort((a, b) => a.x - b.x)).map((r) => ({ words: r, y: r.map((w) => w.y).sort((a, b) => a - b)[Math.floor(r.length / 2)] }));
    rows.sort((a, b) => a.y - b.y);
    return { rows, mh, slope };
  }

  /** Close positions (on one axis) → groups: [{ at, members }]. */
  function cluster(points, tol) {
    const ps = points.slice().sort((a, b) => a.x - b.x);
    const out = [];
    for (const p of ps) {
      const last = out[out.length - 1];
      if (last && p.x - last.xs[last.xs.length - 1] <= tol) { last.members.push(p); last.xs.push(p.x); }
      else out.push({ members: [p], xs: [p.x] });
    }
    for (const c of out) c.at = c.xs[Math.floor(c.xs.length / 2)];
    return out;
  }

  const minOf = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const span = (a, b) => (minOf(b) - minOf(a) + 1440) % 1440;
  // how much a gap from entry to exit looks like a shift
  const plaus = (d) => (d >= 20 && d <= 12 * 60 ? 1 : d > 12 * 60 && d <= 16 * 60 ? 0.3 : -1);

  /** The possible dates of digits run together ("25110" = 25/10 with the / read as 1). */
  function mashDates(s, year) {
    const out = [];
    for (let dl = 1; dl <= 2; dl++) for (let skip = 0; skip <= 1; skip++) for (let ml = 1; ml <= 2; ml++) {
      const d = +s.slice(0, dl), rest = s.slice(dl + skip), m = +rest.slice(0, ml), tail = rest.slice(ml);
      if (skip && !/[17/|]/.test(s[dl])) continue;
      if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) continue;
      let y = null;
      if (tail) {
        const t = tail.replace(/^[17]/, (x) => (tail.length === 3 || tail.length === 5 ? '' : x));
        if (t.length === 2) y = 2000 + +t; else if (t.length === 4) y = +t; else continue;
        if (year && y !== year) continue;
      }
      out.push({ d, m, y });
    }
    return out;
  }
  // a digit the reader may have mistaken for another
  const LOOKALIKE = { 0: '869', 1: '74', 2: '7', 3: '85', 4: '19', 5: '63', 6: '58', 7: '12', 8: '3605', 9: '84' };

  function parseWords(words, opts) {
    opts = opts || {};
    const today = opts.today || new Date().toISOString().slice(0, 10);
    const { rows, mh } = rowsOf((words || []).filter((w) => w && w.text && clean(w.text)));
    const dbg = [];
    // a reader that lost the colons read "08:02:26" as three numbers side by side: one time again
    for (const r of rows) {
      const ws = r.words, out = [];
      for (let i = 0; i < ws.length; i++) {
        const run = [ws[i]];
        while (run.length < 3 && i + run.length < ws.length && /^\d{2}$/.test(clean(run[0].text)) && /^\d{2}$/.test(clean(ws[i + run.length].text)) && ws[i + run.length].x0 - run[run.length - 1].x1 < mh * 1.3) run.push(ws[i + run.length]);
        const p = run.map((w) => +clean(w.text));
        if (run.length === 3 && p[0] <= 23 && p[1] <= 59 && p[2] <= 59) {
          out.push(Object.assign({}, run[0], { text: run.map((w) => clean(w.text)).join(':'), x0: run[0].x0, x1: run[2].x1, cx: (run[0].x0 + run[2].x1) / 2, x: (run[0].x + run[2].x) / 2 }));
          i += 2;
        } else out.push(ws[i]);
      }
      r.words = out;
    }
    // every word's possibilities
    for (const r of rows) for (const w of r.words) w.items = itemsOf(w.text);
    // "7:11" then "PM": the afternoon
    for (const r of rows) r.words.forEach((w, i) => {
      const t = w.items.find((it) => it.k === 'time');
      const nx = r.words[i + 1];
      if (!t || !nx || nx.x0 - w.x1 > mh * 1.5) return;
      const ap = /^([AaPp])\.?[Mm]\.?$/.exec(clean(nx.text));
      if (!ap) return;
      let h = +t.v.slice(0, 2);
      const pm = ap[1].toLowerCase() === 'p';
      if (h === 12) h = pm ? 12 : 0; else if (pm && h < 12) h += 12;
      t.v = pad(h) + t.v.slice(2); t.pad = true; t.weak = false;
    });
    const textOf = (r) => r.words.map((w) => clean(w.text)).join(' ');
    // reading direction: a Hebrew report reads right to left
    const heb = rows.reduce((s, r) => s + r.words.filter((w) => /[א-ת]/.test(w.text)).length, 0);
    const lat = rows.reduce((s, r) => s + r.words.filter((w) => /[A-Za-z]{2}/.test(w.text)).length, 0);
    const rtl = heb >= lat;
    const before = (a, b) => (rtl ? a > b : a < b); // a comes before b in reading

    /* ---- the header: column names ---- */
    let header = null;
    rows.forEach((r, ri) => {
      const roles = r.words.flatMap((w) => w.items.filter((it) => it.k === 'role').map((it) => ({ role: it.v, n: it.n, x: w.x })));
      const kinds = new Set(roles.map((x) => x.role));
      const score = kinds.size + (kinds.has('in') && kinds.has('out') ? 2 : 0);
      if (kinds.size >= 2 && (kinds.has('in') || kinds.has('out') || kinds.has('date')) && (!header || score > header.score)) header = { ri, roles, score, y: r.y };
    });
    if (header) dbg.push('header: ' + header.roles.map((x) => x.role + (x.n || '') + '@' + Math.round(x.x)).join(' '));

    /* ---- year and month of the report (for dates without a year) ---- */
    const years = new Map();
    let docMonth = null;
    for (const r of rows) for (const w of r.words) for (const it of w.items) {
      if (it.k === 'date' && it.y) years.set(it.y, (years.get(it.y) || 0) + 3);
      if (it.k === 'year') years.set(it.v, (years.get(it.v) || 0) + 1);
      if (it.k === 'month' && !docMonth) docMonth = it.v;
    }
    const docYear = years.size ? [...years.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;

    /* ---- the date column ---- */
    const datePts = [];
    rows.forEach((r, ri) => r.words.forEach((w) => { if (w.items.some((it) => (it.k === 'date' && it.sure) || it.k === 'mash')) datePts.push({ x: w.x, ri, w }); }));
    const colW = (() => { const ws = rows.flatMap((r) => r.words.filter((w) => w.items.some((it) => it.k === 'time' || it.k === 'date')).map((w) => w.x1 - w.x0)).sort((a, b) => a - b); return ws[Math.floor(ws.length / 2)] || mh * 3; })();
    const tol = Math.max(colW * 0.55, mh * 1.2);
    const dateCols = cluster(datePts, tol).map((c) => ({ ...c, rows: new Set(c.members.map((p) => p.ri)).size }));
    let dateCol = null;
    const hDate = header && header.roles.find((x) => x.role === 'date');
    if (hDate) dateCol = dateCols.filter((c) => Math.abs(c.at - hDate.x) < colW * 1.5).sort((a, b) => b.rows - a.rows)[0] || null;
    if (!dateCol) dateCol = dateCols.filter((c) => c.rows >= 2).sort((a, b) => b.rows - a.rows)[0] || null;
    const inDateCol = (w) => dateCol && Math.abs(w.x - dateCol.at) <= tol * 1.6;

    /* ---- the time columns ---- */
    const timePts = [];
    rows.forEach((r, ri) => {
      if (header && ri <= header.ri && !r.words.some((w) => w.items.some((it) => it.k === 'time' && !it.weak))) return;
      r.words.forEach((w) => {
        if (inDateCol(w) && w.items.some((it) => it.k === 'date' || it.k === 'mash')) return;
        const t = w.items.find((it) => it.k === 'time');
        if (t) timePts.push({ x: w.x, ri, v: t.v, pad: t.pad, weak: t.weak, bare: t.bare, w });
      });
    });
    let cols = cluster(timePts, tol).map((c, i) => ({ i, at: c.at, members: c.members, rows: new Set(c.members.map((p) => p.ri)).size, strong: c.members.filter((p) => !p.weak).length }));
    // a column of bare "0800" or of dotted "8.30" counts only when it is a real column (most of it times)
    cols = cols.filter((c) => c.rows >= 2 && c.strong >= c.members.length * 0.5);
    const at = (c, ri) => { const p = c.members.find((q) => q.ri === ri); return p ? p.v : null; };
    // the pair of columns that is entry → exit
    const pairScore = (a, b) => {
      let s = 0, n = 0;
      for (let ri = 0; ri < rows.length; ri++) {
        const x = at(a, ri), y = at(b, ri);
        if (x == null || y == null) continue;
        const d = span(x, y);
        n++; s += plaus(d);
        // another column equals the difference: a total (or the total after a break)
        if (cols.some((c) => c !== a && c !== b && at(c, ri) != null && [0, 15, 30, 45, 60].some((br) => Math.abs(minOf(at(c, ri)) - (d - br)) <= 2))) s += 0.6;
      }
      return { s, n };
    };
    // a duration column prints 8:09, a clock 08:09: a column of times under 10:00 with no leading zero is a total
    const unpadded = (c) => { const small = c.members.filter((p) => minOf(p.v) < 600); return small.length >= 2 && small.filter((p) => !p.pad).length >= small.length * 0.8; };
    const hRole = (role) => (header ? header.roles.filter((x) => x.role === role).sort((a, b) => (before(a.x, b.x) ? -1 : 1)) : []);
    const nearest = (x) => cols.filter((c) => Math.abs(c.at - x) < colW * 1.6).sort((a, b) => Math.abs(a.at - x) - Math.abs(b.at - x))[0] || null;
    const pairs = [];
    const hin = hRole('in'), hout = hRole('out');
    if (hin.length && hout.length) {
      for (let k = 0; k < Math.min(hin.length, hout.length); k++) {
        const a = nearest(hin[k].x), b = nearest(hout[k].x);
        if (a && b && a !== b) pairs.push({ a, b, from: 'header', ...pairScore(a, b) });
      }
    }
    let best = null;
    for (const a of cols) for (const b of cols) {
      if (a === b) continue;
      const sc = pairScore(a, b);
      let s = sc.s;
      if (unpadded(a) || unpadded(b)) s -= sc.n * 0.5;
      // the usual order: the entry right before the exit
      const between = cols.filter((c) => c !== a && c !== b && (before(a.at, c.at) && before(c.at, b.at))).length;
      if (before(a.at, b.at) && !between) s += sc.n * 0.15;
      if (!best || s > best.s2) best = { a, b, from: 'numbers', s: sc.s, n: sc.n, s2: s };
    }
    if (best && (!pairs.length || pairs[0].s < best.s * 0.6 || pairs[0].n < 2)) {
      if (pairs.length) dbg.push(`header pair weak (${pairs[0].s.toFixed(1)}/${pairs[0].n}), numbers pair ${best.s.toFixed(1)}/${best.n}`);
      pairs.length = 0; pairs.push(best);
      // a second entry/exit pair (a split shift) after the first
      let second = null;
      for (const a of cols) for (const b of cols) {
        if ([best.a, best.b].includes(a) || [best.a, best.b].includes(b) || a === b || unpadded(a) || unpadded(b)) continue;
        if (!before(best.b.at, a.at) || !before(a.at, b.at)) continue;
        const sc = pairScore(a, b);
        if (sc.n >= 2 && sc.s >= sc.n * 0.8 && (!second || sc.s > second.s)) second = { a, b, from: 'numbers', ...sc };
      }
      if (second) pairs.push(second);
    }
    const pairCols = new Set(pairs.flatMap((p) => [p.a, p.b]));
    dbg.push('time columns: ' + cols.map((c) => `${Math.round(c.at)}(${c.rows}${unpadded(c) ? ',dur' : ''})`).join(' ') + ' | pairs: ' + pairs.map((p) => `${Math.round(p.a.at)}→${Math.round(p.b.at)} ${p.from} ${p.s.toFixed(1)}/${p.n}`).join(', '));

    // the column of the shift's length (סה"כ): the one that, row after row, is exit − entry (or that minus a
    // break); the one that agrees most often (a 100% column agrees only on short days)
    const BREAKS = [0, 15, 20, 30, 45, 60];
    let totalCol = null;
    if (pairs.length) {
      let bestK = 0;
      for (const c of cols) {
        if (pairCols.has(c)) continue;
        let n = 0, m = 0;
        for (let ri = 0; ri < rows.length; ri++) {
          const a = at(pairs[0].a, ri), b = at(pairs[0].b, ri), v = at(c, ri);
          if (!a || !b || !v) continue;
          m++; if (BREAKS.some((br) => Math.abs(minOf(v) - (span(a, b) - br)) <= 2)) n++;
        }
        const k = n + n / Math.max(1, m);
        if (m >= 2 && n >= m * 0.6 && k > bestK) { bestK = k; totalCol = c; }
      }
    }
    // a column named סה"כ / Total is the length, even when too few rows agree to show it
    const hTotal = hRole('total')[0];
    if (!totalCol && hTotal && pairs.length) totalCol = cols.filter((c) => !pairCols.has(c) && Math.abs(c.at - hTotal.x) < colW * 1.6).sort((p, q) => Math.abs(p.at - hTotal.x) - Math.abs(q.at - hTotal.x))[0] || null;
    // or hours as a number (8.75): the column of numbers that is the shift's length in most rows
    let decCol = null;
    if (pairs.length && !totalCol) {
      const pts = [];
      rows.forEach((r, ri) => r.words.forEach((w) => { const it = w.items.find((x) => x.k === 'num' && !Number.isInteger(x.v) && x.v >= 0.25 && x.v <= 16); if (it) pts.push({ x: w.x, ri, v: it.v, w }); }));
      let bestK = 0;
      for (const c of cluster(pts, tol)) {
        let n = 0, m = 0;
        for (const p of c.members) {
          const a = at(pairs[0].a, p.ri), b = at(pairs[0].b, p.ri);
          if (!a || !b) continue;
          m++; if (BREAKS.some((br) => Math.abs(p.v * 60 - (span(a, b) - br)) <= 3)) n++;
        }
        const k = n + n / Math.max(1, m);
        if (m >= 2 && n >= m * 0.6 && k > bestK) { bestK = k; decCol = c; }
      }
    }
    const lenAt = (ri) => {
      if (totalCol && at(totalCol, ri)) return minOf(at(totalCol, ri));
      const p = decCol && decCol.members.find((q) => q.ri === ri);
      return p ? Math.round(p.v * 60) : null;
    };
    if (totalCol || decCol) dbg.push('length column ' + Math.round((totalCol || decCol).at));
    const differsBy = (x, y) => [...x].filter((ch, i) => ch !== y[i]).length;

    /* ---- each row: its date, its times ---- */
    const found = [];
    let lastDateRow = null, pendingLen = null;
    // where the entry and the exit sit in rows read with both (an app's cards): a lone time is the one it is nearer
    const sides = { a: [], b: [] };
    const mid = (xs) => xs.slice().sort((p, q) => p - q)[xs.length >> 1];
    let skippedNoOut = 0;
    rows.forEach((r, ri) => {
      if (header && ri <= header.ri) return;
      const text = textOf(r);
      const items = r.words.flatMap((w) => w.items.map((it) => ({ ...it, w })));
      // the date
      let date = null, dow = null, dateWord = null;
      const dateIts = items.filter((it) => it.k === 'date' && (it.sure || inDateCol(it.w)));
      const pref = dateIts.find((it) => inDateCol(it.w)) || dateIts[0];
      if (pref) { date = { d: pref.d, m: pref.m, y: pref.y || null }; dateWord = pref.w; }
      const mash = !date && items.find((it) => it.k === 'mash' && inDateCol(it.w));
      // "13 באוקטובר", "Oct 13"
      if (!date) {
        const mo = items.find((it) => it.k === 'month');
        if (mo) {
          const n = items.filter((it) => it.k === 'num' && it.v >= 1 && it.v <= 31 && Number.isInteger(it.v)).sort((a, b) => Math.abs(a.w.x - mo.w.x) - Math.abs(b.w.x - mo.w.x))[0];
          if (n) date = { d: n.v, m: mo.v, y: (items.find((it) => it.k === 'year') || {}).v || null };
        }
      }
      const dw = items.find((it) => it.k === 'dow' && !it.weak) || items.find((it) => it.k === 'dow' && (!dateWord || Math.abs(it.w.x - dateWord.x) < colW * 3));
      if (dw) dow = dw.v;
      // how long the shift was, as the report writes it: its total column (8:30), hours in the row (8.5), or
      // in an app's card the "8.25 שעות" line above the times
      // (only from a column that agrees with the times in most rows; a card's "8.25 שעות" only fills a
      // missing exit)
      let len = lenAt(ri), sure = len != null, card = false;
      if (len == null) {
        const dec = items.find((it) => it.k === 'num' && !Number.isInteger(it.v) && it.v >= 0.5 && it.v <= 16) ;
        if (dec && /שעות|hours|ש["׳']/i.test(textOf(r))) len = Math.round(dec.v * 60);
      }
      if (len == null && pendingLen && r.y - pendingLen.y < mh * 4) { len = pendingLen.min; card = true; }
      // the times
      const shifts = [];
      // a split day (two entries and exits): the total is the whole day's, so the first pair gets what the others leave
      const rest = pairs.slice(1).reduce((s, p) => { const a = at(p.a, ri), b = at(p.b, ri); return a && b ? s + span(a, b) : s; }, 0);
      if (len != null && rest) len -= rest;
      for (const p of pairs) {
        let a = at(p.a, ri), b = at(p.b, ri);
        if (p === pairs[0] && len != null && len > 0) {
          // an exit the reader got one digit wrong (02:23 for 22:23), or missed, put right from the length
          if (a && b && sure && !BREAKS.some((br) => Math.abs(span(a, b) - len - br) <= 2)) {
            const fixB = fromMin(minOf(a) + len), fixA = fromMin(minOf(b) - len);
            if (differsBy(b, fixB) === 1) { dbg.push(`exit fixed from the total: ${a}-${b} → ${fixB}`); b = fixB; }
            else if (differsBy(a, fixA) === 1) { dbg.push(`entry fixed from the total: ${a}-${b} → ${fixA}`); a = fixA; }
          } else if (a && !b) { b = fromMin(minOf(a) + len); dbg.push(`exit from the total: ${a}+${len}m`); }
          else if (!a && b && (sure || card)) { a = fromMin(minOf(b) - len); dbg.push(`entry from the total: ${b}-${len}m`); }
        }
        if (a && b) shifts.push([a, b]);
        else if (a && !b && p === pairs[0]) skippedNoOut++;
      }
      const range = items.find((it) => it.k === 'range');
      if (!shifts.length && range) shifts.push([range.a, range.b]);
      if (!shifts.length) {
        // times in the row outside the known columns (a row the columns missed): two of them, in reading order
        const ts = r.words.filter((w) => !inDateCol(w)).map((w) => ({ w, t: w.items.find((it) => it.k === 'time' && !it.weak) })).filter((x) => x.t && !cols.some((c) => (c === totalCol || unpadded(c)) && c.members.some((m) => m.w === x.w)));
        if (ts.length === 2) {
          // which one starts: the order that makes a likelier shift; when both could, two times close together
          // ("08:51 - 16:37" in one cell) read left to right like any number, two apart in the reading order
          const [l, rr] = ts[0].w.x < ts[1].w.x ? ts : [ts[1], ts[0]];
          const fwdP = plaus(span(l.t.v, rr.t.v)), backP = plaus(span(rr.t.v, l.t.v));
          const near = rr.w.x0 - l.w.x1 < mh * 4;
          const [p, q] = fwdP > backP ? [l, rr] : backP > fwdP ? [rr, l] : near || !rtl ? [l, rr] : [rr, l];
          if (plaus(span(p.t.v, q.t.v)) > 0) { shifts.push([p.t.v, q.t.v]); sides.a.push(p.w.x); sides.b.push(q.w.x); }
        }
        else if (ts.length === 1 && len != null && !pairs.length) {
          const x = ts[0].w.x, t = ts[0].t.v;
          const exit = sides.a.length && sides.b.length && Math.abs(mid(sides.a) - mid(sides.b)) > mh * 2 && Math.abs(x - mid(sides.b)) < Math.abs(x - mid(sides.a));
          shifts.push(exit ? [fromMin(minOf(t) - len), t] : [t, fromMin(minOf(t) + len)]);
          dbg.push(`one time read, the other from the hours: ${shifts[0].join('-')}`);
        }
        else if (ts.length === 1 && len != null && Math.abs(ts[0].w.x - pairs[0].a.at) < tol * 2) shifts.push([ts[0].t.v, fromMin(minOf(ts[0].t.v) + len)]);
      }
      // a card's hours line (no times): for the times under it
      if (!shifts.length && len != null && /שעות|hours|ש["׳']/i.test(text)) { pendingLen = { min: len, y: r.y }; if (!date) return; }
      if (shifts.length) pendingLen = null;
      const isTotalRow = SKIP_ROW.test(text) && !date;
      if (isTotalRow) return;
      const row = { ri, y: r.y, date, dow, mash: mash ? mash.s : null, shifts, text };
      // an app's card: the date on its own line, the hours on the next one
      if (!date && !mash && shifts.length && lastDateRow && !lastDateRow.shifts.length && !lastDateRow.used && r.y - lastDateRow.y < mh * 4) {
        row.date = lastDateRow.date; row.dow = row.dow == null ? lastDateRow.dow : row.dow; lastDateRow.used = true;
      }
      if (date || mash || shifts.length || dow != null) found.push(row);
      if (date) lastDateRow = row;
    });
    // date-only rows that lent their date to the next row are not rows of their own
    const list = found.filter((r) => !(r.used && !r.shifts.length));

    /* ---- the year, then dates put right from the rows around them ---- */
    const yearOf = (d) => d.y || docYear || null;
    const keyOf = (d) => {
      const y = yearOf(d) || yearFor(d.m, d.d, today);
      return validDate(y, d.m, d.d) ? key(y, d.m, d.d) : null;
    };
    const dowOf = (k) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), 12).getDay();
    const addDays = (k, n) => { const d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + n, 12); return key(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
    for (const r of list) r.key = r.date ? keyOf(r.date) : null;
    // the report's order: most reports go forward in time
    const ks = list.filter((r) => r.key);
    let up = 0, down = 0;
    for (let i = 1; i < ks.length; i++) { if (ks[i].key > ks[i - 1].key) up++; else if (ks[i].key < ks[i - 1].key) down++; }
    const fwd = up >= down;
    const cmp = (a, b) => (fwd ? a < b : a > b);
    // the report's month: most of its dates (a monthly report), when there is one
    const monthsSeen = new Map();
    for (const r of list) if (r.date) monthsSeen.set(r.date.m, (monthsSeen.get(r.date.m) || 0) + 1);
    const topM = [...monthsSeen.entries()].sort((a, b) => b[1] - a[1])[0];
    const mainMonth = topM && topM[1] >= Math.max(3, list.filter((r) => r.date).length * 0.6) ? topM[0] : null;
    const candidatesFor = (r) => {
      const c = [];
      if (r.mash) for (const x of mashDates(r.mash, docYear)) c.push(x);
      if (r.date) {
        const { d, m } = r.date;
        const ds = String(d);
        for (let i = 0; i < ds.length; i++) for (const alt of LOOKALIKE[ds[i]] || '') c.push({ d: +(ds.slice(0, i) + alt + ds.slice(i + 1)), m, y: r.date.y });
        if (ds.length === 1) for (const lead of '123') c.push({ d: +(lead + ds), m, y: r.date.y });
        if (ds.length === 2) c.push({ d: +ds[0], m, y: r.date.y }, { d: +ds[1], m, y: r.date.y });
        // the month misread (08 for 09): the report's own month first
        const ms = String(m);
        for (let i = 0; i < ms.length; i++) for (const alt of LOOKALIKE[ms[i]] || '') c.push({ d, m: +(ms.slice(0, i) + alt + ms.slice(i + 1)), y: r.date.y });
        if (mainMonth && mainMonth !== m) c.push({ d, m: mainMonth, y: r.date.y });
      }
      return c.map((x) => keyOf(x)).filter(Boolean);
    };
    // a date of another month in a report of one month, that would fit as this month's: misread
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!r.key || !r.date || !mainMonth || r.date.m === mainMonth) continue;
      const alt = keyOf({ d: r.date.d, m: mainMonth, y: r.date.y });
      const prev = list.slice(0, i).reverse().find((x) => x.key && x.date && x.date.m === mainMonth);
      const next = list.slice(i + 1).find((x) => x.key && x.date && x.date.m === mainMonth);
      if (!alt || !(prev || next)) continue;
      const fits = (!prev || cmp(prev.key, alt)) && (!next || cmp(alt, next.key)) && (r.dow == null || dowOf(alt) === r.dow);
      const near = [prev, next].filter(Boolean).every((x) => Math.abs((new Date(x.key) - new Date(alt)) / 864e5) <= 7);
      if (fits && near) { dbg.push(`month fixed: ${r.key} → ${alt}`); r.key = alt; }
    }
    // the dates to trust: the longest run of rows whose dates go in order (and whose day of the week, when
    // the row has one, agrees); the others are checked against them
    const dowOk = (r, k) => r.dow == null || dowOf(k) === r.dow;
    const idx = list.map((r, i) => i).filter((i) => list[i].key);
    const len = idx.map(() => 1), from = idx.map(() => -1);
    for (let a = 0; a < idx.length; a++) for (let b = 0; b < a; b++) {
      const ka = list[idx[a]].key, kb = list[idx[b]].key;
      if ((cmp(kb, ka) || kb === ka) && len[b] + 1 > len[a]) { len[a] = len[b] + 1; from[a] = b; }
    }
    const trusted = new Set();
    for (let a = len.indexOf(Math.max(0, ...len)); a >= 0 && idx.length; a = from[a]) trusted.add(idx[a]);
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (trusted.has(i) && dowOk(r, r.key)) continue;
      let p = i - 1; while (p >= 0 && !trusted.has(p)) p--;
      let q = i + 1; while (q < list.length && !trusted.has(q)) q++;
      const prev = p >= 0 ? list[p] : null, next = q < list.length ? list[q] : null;
      const inOrder = (k) => (!prev || cmp(prev.key, k) || (prev.key === k && r.shifts.length && prev.shifts.length)) && (!next || cmp(k, next.key) || (k === next.key && r.shifts.length && next.shifts.length));
      // the possible readings of what was read that fit between its neighbours (and its day of the week)
      const all = [...new Set(candidatesFor(r))].filter(inOrder);
      let cands = all.filter((k) => dowOk(r, k));
      // nothing to read from: the dates between the neighbours, with its day of the week
      if (!cands.length && !(r.key && inOrder(r.key)) && prev && next) {
        const between = [];
        for (let k = addDays(prev.key, fwd ? 1 : -1), n = 0; k !== next.key && n < 10; k = addDays(k, fwd ? 1 : -1), n++) between.push(k);
        cands = between.filter((k) => dowOk(r, k) && (r.dow != null || between.length === 1));
      }
      // the one day between its neighbours, and the date read says that day too: the day letter was misread
      if (!cands.length && prev && next && all.length === 1 && all[0] === addDays(prev.key, fwd ? 1 : -1) && addDays(all[0], fwd ? 1 : -1) === next.key) cands = all;
      if (r.key && inOrder(r.key) && (dowOk(r, r.key) || !cands.length)) continue; // as read (a day letter misread is likelier)
      if (cands.length === 1) { dbg.push(`date fixed: "${r.text.slice(0, 40)}" ${r.key || '?'} → ${cands[0]}`); r.key = cands[0]; trusted.add(i); }
      else if (r.key || r.shifts.length) { dbg.push(`date unclear, left out: ${r.key || '?'} "${r.text.slice(0, 40)}" (${cands.join(',')})`); r.key = null; }
    }

    /* ---- the shifts ---- */
    const out = [];
    let guessedYear = false;
    for (const r of list) {
      if (!r.key || !r.shifts.length) continue;
      if (r.date && !r.date.y && !docYear) guessedYear = true;
      for (const [start, end] of r.shifts) {
        const d = span(start, end) || 1440;
        if (d < 10 || d > 16 * 60) { dbg.push(`not a shift: ${r.key} ${start}-${end}`); continue; }
        out.push({ date: r.key, start, end, hours: Math.round(d / 60 * 100) / 100, overnight: minOf(end) <= minOf(start), line: r.text.slice(0, 120), n: r.ri });
      }
    }
    const res = { rows: out, noStart: 0, guessedYear, skipped: skippedNoOut, rtl, text: rows.map((r) => (rtl ? r.words.slice().reverse() : r.words).map((w) => clean(w.text)).join(' ')).join('\n') };
    if (opts.debug) res.debug = dbg.concat(rows.map((r, i) => `${i}: y${Math.round(r.y)} ${textOf(r)}`)).join('\n');
    return res;
  }

  root.Timesheet = { parse, times, parseWords, itemsOf };
})(typeof window !== 'undefined' ? window : globalThis);
