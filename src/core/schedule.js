/* ============================================================
 * schedule.js — a work schedule (סידור עבודה) someone was sent, into their planned shifts: a WhatsApp
 * message or other text, or the table in a photo, a screenshot or a PDF (its words, each with its place).
 *
 * Text, a line at a time (a day may head the lines under it):
 *   - a day: a name (ראשון…שבת, "יום א׳"…"ש׳", Sun…Sat) or a date (26/10, 26.10.26, 2026-10-26); a line
 *     with three days or more is a table's head, and each row under it gives one cell per day, in order;
 *     "ראשון-חמישי" and "ראשון, שלישי וחמישי" are several days with the same shift;
 *   - a shift: a range ("8-16", "08:00–16:30", "16 עד 24", "9am-5pm"; an end before the start is the next
 *     morning, "22-06"), a shift's name (בוקר, צהריים, ערב, לילה, פתיחה, סגירה, or the person's own template
 *     names) with its usual hours, one time ("מ-16:00", "16-סגירה") lasting the person's usual length, or hours
 *     written the 12-hour way ("7-3", "3-11"): all of these marked as a guess. Off (חופש, OFF, a dash) is a day
 *     with no shift. A range must last between half an hour and 16 hours (so "12-11" is a date, not a shift);
 *   - whose: the words before a shift, after the day or the shift before it ("ראשון: דני 8-16, מאיה 16-24").
 *     A schedule with no names at all is the person's own (a message to them); otherwise each shift keeps its
 *     name and the screen keeps the person's (offer()).
 * A day name alone lands in the week the screen chose (from its Sunday); days named in order run forward (a
 * week that starts on Monday ends on the Sunday after it). A date without a year is the nearest one from two
 * months back; next to a day's name it is the year in which it falls on that day.
 *
 * A table's words (OCR or PDF, words with boxes): the words are straightened (a tilted photo) and put in
 * lines; then the table's shape is found:
 *   - days across the top (a line of days and no shifts; the dates may sit under, over or beside the names):
 *     each word under it goes to the nearest day's column and the words beside the columns are the row's name.
 *     The days of a head must agree with each other: dates that run on day by day date the columns OCR
 *     misread, a date on another weekday than its column's name is a misreading, and a week that is headed by
 *     names only keeps their order. A second head further down starts a second table (the week after, when it
 *     lists the same people again);
 *   - the same with a row per shift (בוקר / ערב / hours) and the workers' names in the cells;
 *   - days down the side: a column per person (their names in the head), or a column per shift with names in
 *     the cells;
 *   - anything else (a message's screenshot, an app's list of cards) is read as text, a line at a time.
 * A table with several rows and no name that could be read is nobody's: nothing is offered from it.
 * ============================================================ */
(function (root) {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  const ch = String.fromCharCode;
  const HE = ch(0x590) + '-' + ch(0x5FF);
  // the letters a name can be written in: Hebrew, Latin, Russian, Arabic
  const LET = HE + 'A-Za-z' + ch(0x400) + '-' + ch(0x4FF) + ch(0x620) + '-' + ch(0x64A);
  // marks of direction that a copied message or an OCR word carries
  const BIDI = new RegExp('[' + ch(0x200E) + ch(0x200F) + ch(0x202A) + '-' + ch(0x202E) + ch(0x2066) + '-' + ch(0x2069) + ']', 'g');
  const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const validDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate() && y >= 2000 && y <= 2100;
  const dowOf = (k) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)).getDay();
  const addDays = (k, n) => { const d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + n); return keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  // a date as a running number of days (for dates that must follow each other)
  const dayN = (k) => Math.round(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000);
  const keyN = (n) => { const d = new Date(n * 86400000); return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
  const dowN = (n) => (((n + 4) % 7) + 7) % 7;
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  const DAY_NAMES = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };
  const DAY_LETTERS = { 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5, 'ש': 6 };
  const DAY_EN = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  // a shift's name and its usual hours (the person's own templates come first)
  const NAMED = { 'בוקר': ['07:00', '15:00'], 'צהריים': ['11:00', '19:00'], 'צהרים': ['11:00', '19:00'], 'ערב': ['15:00', '23:00'], 'לילה': ['23:00', '07:00'],
    'פתיחה': ['07:00', '15:00'], 'אמצע': ['11:00', '19:00'], 'סגירה': ['15:00', '23:00'],
    morning: ['07:00', '15:00'], noon: ['11:00', '19:00'], evening: ['15:00', '23:00'], night: ['23:00', '07:00'] };
  // one letter in a table's cell: the shift's name cut short
  const CELL_LETTERS = { 'ב': 'בוקר', 'צ': 'צהריים', 'ע': 'ערב', 'ל': 'לילה' };
  const OFF_WORDS = ['חופש', 'חופשה', 'מחלה', 'חופשי', 'off', 'x', '-', '—', '–'];
  // words around a name that are not the name
  const NOISE = new Set(['משמרת', 'משמרות', 'בין', 'השעות', 'שעות', 'עד', 'מ', 'מה', 'יום', 'ביום', 'שבוע', 'הבא', 'השבוע', 'סידור', 'עבודה', 'לשבוע', 'עובד', 'עובדת', 'shift', 'from', 'to', 'week', 'and', 'ו', 'את', 'של', 'גם', 'אצל',
    'שם', 'תאריך', 'תפקיד', 'הערות', 'name', 'day', 'date', 'am', 'pm']);
  // what heads the column of names, and what heads a column beside it that is not the name
  const NAME_HEADS = new Set(['שם', 'עובד', 'עובדת', 'עובדים', 'העובד', 'name', 'employee', 'worker']);

  // lookbehinds: built on first use (U.lazyRx: Safari before iOS 16.4 cannot read them)
  const R = root.U.lazyRx({
    DATE_FULL: () => /(?<![\d:])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d:])/g,
    DATE_ISO: () => /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g,
    DATE_SHORT: () => /(?<![\d:./-])(\d{1,2})[./](\d{1,2})(?![\d:./-])/g,
    DAY_NAME_RE: () => new RegExp(`(?<![${HE}])(ו)?(?:ב?יום\\s+)?(?:ה|ב|ל)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?![${HE}])`, 'g'),
    DAY_LETTER_RE: () => new RegExp(`(?<![${HE}])(?:(?:ב?יום\\s+)([אבגדהוש])['׳"״]?|([אבגדהוש])['׳](?:["״])?)(?![${HE}])`, 'g'),
    // the month whole ("נובמבר") or cut short with its mark ("נוב׳"): a name that starts like a month ("2 מאיה",
    // "3 יונתן") is no date
    DATE_HE_RE: () => new RegExp(`(?<!\\d)(\\d{1,2})\\s*ב?(?:(${Object.keys(MONTHS_FULL).join('|')})(?![${HE}])|(${MONTHS_HE.join('|')})(?:['׳.]|(?![${HE}])))(?:\\s+(\\d{4}))?`, 'g'),
    RANGE_RE: () => /(?<![\d:./])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|—|עד|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?![\d:./])/gi,
    TIME_RE: () => /(?<![\d:./])(\d{1,2}):(\d{2})(?![\d:./])/g,
    // "16-סגירה", "16:30 עד הסגירה" (it ends when the place closes) and "פתיחה-16" (it starts when it opens);
    // a photo's reader gives the same words the other way round ("סגירה-16")
    TO_CLOSE: () => new RegExp(`(?<![\\d:./])(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:-|–|—|עד)\\s*ה?(סגירה|סגור|סוף)(?![${HE}])|(?<![${HE}])ה?(סגירה|סגור|סוף)\\s*(?:-|–|—)\\s*(\\d{1,2})(?:[:.](\\d{2}))?(?![\\d:./])`, 'g'),
    FROM_OPEN: () => new RegExp(`(?<![${HE}])ה?פתיחה\\s*(?:-|–|—|עד)\\s*(\\d{1,2})(?:[:.](\\d{2}))?(?![\\d:./])|(?<![\\d:./])(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:-|–|—)\\s*ה?פתיחה(?![${HE}])`, 'g'),
  });
  // a day in English: its whole name or its usual short form ("Monica" and "Friedman" are people)
  const DAY_EN_RE = /\b(sun|mon|tue|wed|thu|fri|sat)(?:day|sday|nesday|rsday|urday|s|rs|r)?\.?(?![a-z])/gi;
  // a date with the month's Hebrew name: "25 באוקטובר", "26 אוק׳", "3 בנובמבר 2026"
  const MONTHS_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  const MONTHS_FULL = { 'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12 };

  /** The date of a day/month without a year: the nearest one from two months back. */
  function nearYear(d, m, today) {
    const ty = +today.slice(0, 4);
    for (const y of [ty, ty + 1, ty - 1]) {
      if (!validDate(y, m, d)) continue;
      const k = keyOf(y, m, d);
      const diff = (new Date(y, m - 1, d) - new Date(ty, +today.slice(5, 7) - 1, +today.slice(8, 10))) / 86400000;
      if (diff >= -62 && diff <= 300) return k;
    }
    return null;
  }
  /** A day/month in the years it could be: the nearest first, then this year, the last, the next. */
  function yearsOf(d, m, today) {
    const ty = +today.slice(0, 4), near = nearYear(d, m, today);
    const out = near ? [near] : [];
    for (const y of [ty, ty - 1, ty + 1]) if (validDate(y, m, d) && !out.includes(keyOf(y, m, d))) out.push(keyOf(y, m, d));
    return out;
  }
  /** Every day mentioned in a piece of text: { at, len, dow, date, style, ny, and } (a name and a date side by
   *  side are one). ny: [day, month] of a date written without its year. */
  function daysIn(text, today) {
    const found = [];
    const add = (m, dow, date, more) => found.push(Object.assign({ at: m.index, len: m[0].length, dow: date ? dowOf(date) : dow, date: date || null, style: date ? 'date' : 'full' }, more || {}));
    for (const m of text.matchAll(R.DATE_ISO)) if (validDate(+m[1], +m[2], +m[3])) add(m, null, keyOf(+m[1], +m[2], +m[3]));
    for (const m of text.matchAll(R.DATE_FULL)) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      if (validDate(y, +m[2], +m[1]) && !found.some((f) => m.index >= f.at && m.index < f.at + f.len)) add(m, null, keyOf(y, +m[2], +m[1]));
    }
    for (const m of text.matchAll(R.DATE_HE_RE)) {
      const mo = m[2] ? MONTHS_FULL[m[2]] : MONTHS_HE.indexOf(m[3]) + 1, d = +m[1];
      const k = m[4] ? (validDate(+m[4], mo, d) ? keyOf(+m[4], mo, d) : null) : nearYear(d, mo, today);
      if (k && !found.some((f) => m.index >= f.at && m.index < f.at + f.len)) add(m, null, k, m[4] ? null : { ny: [d, mo] });
    }
    for (const m of text.matchAll(R.DATE_SHORT)) {
      if (found.some((f) => m.index >= f.at && m.index < f.at + f.len)) continue;
      const k = nearYear(+m[1], +m[2], today);
      if (k) add(m, null, k, { ny: [+m[1], +m[2]] });
    }
    for (const m of text.matchAll(R.DAY_NAME_RE)) add(m, DAY_NAMES[m[2]], null, { and: !!m[1], bare: m[0] === m[2] });
    for (const m of text.matchAll(R.DAY_LETTER_RE)) add(m, DAY_LETTERS[m[1] || m[2]], null, { style: 'letter' });
    for (const m of text.matchAll(DAY_EN_RE)) add(m, DAY_EN[m[1].toLowerCase()], null, { style: 'en' });
    found.sort((a, b) => a.at - b.at);
    // a name next to its date ("ראשון 25/10", "25.10 יום א׳") is one day: the date (the name is kept beside it,
    // named: the two together tell the year, see otherYear())
    const out = [];
    for (const f of found) {
      const p = out[out.length - 1];
      if (p && f.at - (p.at + p.len) <= 4 && (p.date ? !f.date : f.date)) {
        const nm = p.date ? f : p, dt = p.date ? p : f;
        Object.assign(p, { date: dt.date, dow: dowOf(dt.date), len: f.at + f.len - p.at, style: nm.style, named: nm.dow, ny: dt.ny });
        continue;
      }
      out.push(Object.assign({}, f));
    }
    return out;
  }
  function blank(text, spans) { let s = text; for (const f of spans) s = s.slice(0, f.at) + ' '.repeat(f.len) + s.slice(f.at + f.len); return s; }
  function hhmm(h, m, ap) {
    h = +h; m = +(m || 0);
    if (ap) { if (h < 1 || h > 12) return null; h = (h % 12) + (/p/i.test(ap) ? 12 : 0); }
    if (h === 24 && !m) h = 0;
    return h < 24 && m < 60 ? pad(h) + ':' + pad(m) : null;
  }
  const lenOf = (a, b) => { let len = toMin(b) - toMin(a); if (len <= 0) len += 1440; return len; };
  const okLen = (len) => len >= 30 && len <= 16 * 60;
  /**
   * The shifts in a piece of text (no days in it): { at, len, start, end, guess, off, label }.
   * ocr: the text was read off a picture. Tesseract drops the "1" of an hour glued to a Hebrew word ("16-סגירה"
   * read "6-סגירה", "14-סגירה" read "4-סגירה", "18-סגירה" read "8סגירה") and reads a dash as a colon ("15-23"
   * read "15:23"): there, one digit glued to a word is no hour (6 or 16 cannot be told), and a time whose
   * minutes no schedule writes ("15:23") is the range it was.
   */
  function shiftsIn(text, named, ocr) {
    const out = [];
    const taken = (i) => out.some((s) => i >= s.at && i < s.at + s.len);
    const oneDigit = (h, mm) => ocr && h != null && h.length === 1 && mm == null;
    // hours until the place closes or from when it opens: the other end is not written (a guess, the usual length)
    for (const m of text.matchAll(R.TO_CLOSE)) {
      if (m[3] ? oneDigit(m[1], m[2]) : oneDigit(m[5], m[6])) { out.push({ at: m.index, len: m[0].length, unsure: true }); continue; }
      const a = m[3] ? hhmm(m[1], m[2]) : hhmm(m[5], m[6]);
      if (a) out.push({ at: m.index, len: m[0].length, start: a, end: null, guess: 'single', label: m[0].trim() });
    }
    for (const m of text.matchAll(R.FROM_OPEN)) {
      if (taken(m.index)) continue;
      if (m[1] != null ? oneDigit(m[1], m[2]) : oneDigit(m[3], m[4])) { out.push({ at: m.index, len: m[0].length, unsure: true }); continue; }
      const b = m[1] != null ? hhmm(m[1], m[2]) : hhmm(m[3], m[4]);
      if (b) out.push({ at: m.index, len: m[0].length, start: null, end: b, guess: 'single', label: m[0].trim() });
    }
    for (const m of text.matchAll(R.RANGE_RE)) {
      if (taken(m.index)) continue;
      // "9-5pm": the morning of that afternoon
      const ap2 = m[6], ap1 = m[3] || (ap2 && /p/i.test(ap2) && +m[1] < 12 && +m[1] > +m[4] % 12 ? 'am' : ap2);
      let a = hhmm(m[1], m[2], ap1), b = hhmm(m[4], m[5], ap2);
      if (!a || !b) continue;
      let guess = null;
      // hours the 12-hour way, with no am/pm: "7-3" is 7:00 to 15:00 (read by the clock it would last 20 hours),
      // "3-11" is the afternoon's 15:00 to 23:00 (hardly a shift from 3 at night): taken so, and marked a guess
      const h1 = +m[1], h2 = +m[4], bare = !ap1 && !ap2 && !/^0/.test(m[1]) && !/^0/.test(m[4]);
      if (bare && h1 >= 5 && h1 <= 12 && h2 >= 1 && h2 <= 8 && lenOf(a, b) > 12 * 60) { b = fromMin(toMin(b) + 720); guess = 'ampm'; }
      else if (bare && h1 >= 1 && h1 <= 4 && h2 > h1 && h2 <= 12) { a = fromMin(toMin(a) + 720); b = fromMin(toMin(b) + 720); guess = 'ampm'; }
      if (!okLen(lenOf(a, b))) continue;
      out.push({ at: m.index, len: m[0].length, start: a, end: b, guess, label: m[0].trim() });
    }
    const words = [...text.matchAll(new RegExp(`[${HE}A-Za-z'׳"״]+|[-–—x]`, 'g'))];
    for (const w of words) {
      if (taken(w.index)) continue;
      const word = w[0].replace(/^[וה](?=(בוקר|ערב|לילה|צהריים|צהרים|פתיחה|סגירה)$)/, '').toLowerCase();
      const n = named[word];
      // a digit glued to the shift's name ("8סגירה", "6-סגירה"): its hours were written and not read; the name's
      // usual hours would stand in for other hours
      if (n && (/\d[-–—]?$/.test(text.slice(0, w.index)) || /^[-–—]?\d/.test(text.slice(w.index + w[0].length)))) { out.push({ at: w.index, len: w[0].length, unsure: true }); continue; }
      if (n) { out.push({ at: w.index, len: w[0].length, start: n[0], end: n[1], guess: 'named', label: w[0] }); continue; }
      if (OFF_WORDS.includes(word) && (word.length > 1 || /^\s*[-–—x]\s*$/i.test(text.trim()) || /(^|[\s,|:;])[-–—x]([\s,|;]|$)/i.test(text.slice(Math.max(0, w.index - 1), w.index + 2)))) {
        out.push({ at: w.index, len: w[0].length, off: true, label: w[0] });
      }
    }
    for (const m of text.matchAll(R.TIME_RE)) {
      if (taken(m.index)) continue;
      const a = hhmm(m[1], m[2]);
      if (ocr && a && +m[2] % 5 && +m[2] <= 24) {
        const b = hhmm(m[2]);
        if (b && okLen(lenOf(pad(+m[1]) + ':00', b))) { out.push({ at: m.index, len: m[0].length, start: pad(+m[1]) + ':00', end: b, guess: 'ocr', label: m[0] }); continue; }
      }
      if (a) out.push({ at: m.index, len: m[0].length, start: a, end: null, guess: 'single', label: m[0] });
    }
    out.sort((a, b) => a.at - b.at);
    // a shift's name right by its hours ("בוקר 8-16", "ערב (16-23)") is their label, not a second shift at the
    // name's usual hours (it gave two shifts on one day, one of them made up)
    for (let i = out.length - 1; i >= 0; i--) {
      const s = out[i];
      if (s.guess !== 'named') continue;
      const by = [out[i - 1], out[i + 1]].filter((x) => x && (x.start || x.end) && x.guess !== 'named');
      if (by.some((x) => /^[\s:()[\]\-–—,|]*$/.test(x.at < s.at ? text.slice(x.at + x.len, s.at) : text.slice(s.at + s.len, x.at)))) out.splice(i, 1);
    }
    // what could not be read stays out: its place was only kept so no part of it was taken for something else
    for (let i = out.length - 1; i >= 0; i--) if (out[i].unsure) out.splice(i, 1);
    // two times side by side ("08:00 16:30", a cell split in two) are one range
    for (let i = 0; i + 1 < out.length; i++) {
      const a = out[i], b = out[i + 1];
      if (a.guess !== 'single' || b.guess !== 'single' || !a.start || !b.start || b.end || a.end || !/^\s*(?:-|–|—|עד|to)?\s*$/.test(text.slice(a.at + a.len, b.at))) continue;
      if (!okLen(lenOf(a.start, b.start))) continue;
      out.splice(i, 2, { at: a.at, len: b.at + b.len - a.at, start: a.start, end: b.start, guess: null, label: text.slice(a.at, b.at + b.len).trim() });
    }
    return out;
  }
  /** The words that name someone in a stretch of text ('' when none). */
  function nameIn(text, named) {
    // a letter with a dot right after a name is the family name's first ("דני כ." and "דני ל." are two people)
    const out = [];
    let last = -1;
    [...text.matchAll(new RegExp(`([${LET}]+)(['׳.]?)`, 'g'))].forEach((m, i) => {
      const w = m[1], lw = w.toLowerCase();
      if (w.length >= 2) { if (!NOISE.has(lw) && !named[lw] && !OFF_WORDS.includes(lw)) { out.push(w); last = i; } } else if (m[2] && last === i - 1 && out.length) { out.push(w); last = -1; }
    });
    return out.slice(0, 3).join(' ');
  }
  function namedMap(extra) {
    const m = Object.assign({}, NAMED);
    for (const [k, v] of Object.entries(extra || {})) if (v && v[0] && v[1]) m[k.toLowerCase()] = v;
    return m;
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/[֑-ׇ'׳"״.]/g, '').replace(/\s+/g, ' ').trim();

  /**
   * Text → { entries: [{ date | dow (+ wk), start, end, guess, who, line }], names, personal, needsWeek }.
   * opts: { today, named: { name: ['HH:MM', 'HH:MM'] } (the person's templates), mine: [the person's names] }
   */
  function parseText(text, opts) {
    opts = opts || {};
    const today = opts.today;
    const named = namedMap(opts.named);
    const entries = [];
    let day = null; // the days heading the lines under them
    let head = null; // a table's head: its days in order
    const lines = String(text || '').replace(/\r/g, '').split('\n').map((raw) => raw.replace(BIDI, '').replace(/\*/g, ' '));
    // "שני" is also a woman's name: in a message where Monday heads a line of its own, or for a person called
    // so, a bare "שני" inside another day's line, right before a shift, is her
    const shaniIsName = (opts.mine || []).some((n) => norm(n).split(' ').includes('שני')) || lines.some((l) => new RegExp(`^\\s*(?:ב?יום\\s+)?שני\\s*(?:[:\\-–—]|$)`).test(l));
    // a screenshot's lines that open with a day's letter (א׳ - …): a lone letter opening another line is a day
    // whose mark OCR lost ("ד נדב 9-17")
    if (opts.ocr && lines.filter((l) => (daysIn(l, today)[0] || {}).style === 'letter' && daysIn(l, today)[0].at < 3).length >= 2) {
      for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/^(\s*)([אבגדהוש])(?=\s)/,(m0, sp, l) => sp + l + '׳');
    }
    const seq = sequencer();
    const yearOff = otherYear(lines.flatMap((l) => daysIn(l, today)));
    let dayInline = false; // the last day's own line had shifts in it
    lines.forEach((line, li) => {
      if (!line.trim()) return;
      let days = daysIn(line, today);
      if (yearOff) for (const d of days) if (d.ny) { d.date = keyOf(+d.date.slice(0, 4) + yearOff, d.ny[1], d.ny[0]); d.dow = dowOf(d.date); }
      if (shaniIsName && days.length >= 2) days = days.filter((d, i) => !(i > 0 && d.bare && !d.date && d.dow === 1 && /^\s*(?:\d|[בעלצ][וקרהי])/.test(line.slice(d.at + d.len))));
      const rest = blank(line, days);
      const shifts = shiftsIn(rest, named, opts.ocr);
      // days with no shifts among them: a table's head
      if (days.length >= 3 && !shifts.some((s) => !s.off)) { head = days; head.forEach(seq); day = null; return; }
      // several days in one line ("ראשון 8-16 שני 9-17", "ראשון-חמישי 8-16"): each shift goes with the days before it
      if (days.length >= 2) {
        head = null;
        const groups = dayGroups(rest, days);
        groups.forEach((g) => g.days.forEach(seq));
        let from = 0;
        for (const s of shifts) {
          const g = groups.filter((x) => x.at < s.at).pop() || groups[0];
          const who = nameIn(rest.slice(Math.max(from, g.end), s.at), named);
          from = s.at + s.len;
          if (!s.off) for (const d of g.days) entries.push(entryOf(d, s, who, li));
        }
        day = groups[groups.length - 1].days; dayInline = true;
        return;
      }
      if (days.length) { seq(days[0]); day = [days[0]]; head = null; dayInline = shifts.length > 0; }
      if (!shifts.length) return;
      // a row under a table's head: one cell per day, in order (the name is what comes before)
      if (head && !days.length) {
        const who = nameIn(rest.slice(0, shifts[0].at), named) || nameIn(rest.slice(shifts[shifts.length - 1].at + shifts[shifts.length - 1].len), named);
        shifts.slice(0, head.length).forEach((s, i) => { if (!s.off) entries.push(entryOf(head[i], s, who, li)); });
        return;
      }
      if (!day) return;
      // a picture of a message whose days each open their own line with the shifts beside them: a line with
      // shifts and no day is a day OCR could not read ("ב׳" read as "12-"), not more of the day above it
      if (opts.ocr && !days.length && dayInline) return;
      let from = 0;
      const mine = [];
      for (const s of shifts) {
        const who = nameIn(rest.slice(from, s.at), named);
        from = s.at + s.len;
        if (!s.off) for (const d of day) { const e = entryOf(d, s, who, li); entries.push(e); mine.push(e); }
      }
      // a name after the hours ("22:00-06:00 לי"): the last shift's, when it had none before it
      const last = mine[mine.length - 1];
      if (last && !last.who) { const w = nameIn(rest.slice(from), named); mine.filter((e) => e.start === last.start && e.end === last.end && !e.who).forEach((e) => { e.who = w; }); }
    });
    return finish(passes(entries));
  }
  /**
   * A message from another year: its dates have no year, and every day written with both its name and its date
   * (two or more) falls on another weekday in the nearest year and on its own weekday the year before (or
   * after). → -1, 1 or 0. One such day alone is a slip of the writer's, and the date stands.
   */
  function otherYear(days) {
    const pairs = days.filter((d) => d.ny && d.named != null);
    if (pairs.length < 2 || pairs.some((d) => dowOf(d.date) === d.named)) return 0;
    const fits = (dy) => days.every((d) => !d.ny || validDate(+d.date.slice(0, 4) + dy, d.ny[1], d.ny[0])) && pairs.every((d) => dowOf(keyOf(+d.date.slice(0, 4) + dy, d.ny[1], d.ny[0])) === d.named);
    return fits(-1) ? -1 : fits(1) ? 1 : 0;
  }
  /** The days of one line as groups: "ראשון-חמישי" (every day from the first to the last) and "ראשון, שלישי
   *  וחמישי" (a list) share the shifts that follow; anything else is a day of its own. */
  function dayGroups(rest, days) {
    const groups = [];
    days.forEach((d, i) => {
      const g = groups[groups.length - 1], p = days[i - 1];
      const mid = p ? rest.slice(p.at + p.len, d.at) : null;
      if (g && !d.date && !p.date && /^\s*(?:-|–|—|עד)\s*$/.test(mid) && g.days.length === 1) {
        for (let x = (p.dow + 1) % 7, n = 0; n < 7; x = (x + 1) % 7, n++) { g.days.push({ dow: x, date: null }); if (x === d.dow) break; }
        g.end = d.at + d.len; g.range = true;
      } else if (g && !g.range && (/^\s*(?:[,+&]|ו-?)\s*$/.test(mid) || (d.and && /^\s*$/.test(mid)))) { g.days.push(d); g.end = d.at + d.len; }
      else groups.push({ at: d.at, end: d.at + d.len, days: [d] });
    });
    return groups;
  }
  /**
   * Day names in the order they are written run forward in time: after שבת, or after any later day, a day not
   * yet seen is in the week after ("חמישי, שישי, ראשון"; a week from Monday to Sunday). A day seen before starts
   * the list again (d.pass): the week after when the same person is in it again, else another part of the same
   * week (passes()).
   */
  function sequencer() {
    let wk = 0, pass = 0, last = null, seen = new Set();
    return (d) => {
      if (d.date || d.dow == null || d.wk != null) return;
      if (last != null && d.dow < last) { if (seen.has(d.dow)) { pass++; wk = 0; seen = new Set(); } else wk++; }
      d.wk = wk; d.pass = pass; seen.add(d.dow); last = d.dow;
    };
  }
  /** byWho: a table's second head (the same people listed again under days with no dates) is the week after;
   *  in a message, a day named again is the week after only when the same person works it again. */
  function passes(entries, byWho) {
    const max = Math.max(0, ...entries.map((e) => e.pass || 0));
    const shift = [0];
    for (let p = 1; p <= max; p++) {
      const prev = entries.filter((e) => (e.pass || 0) === p - 1 && e.date == null), cur = entries.filter((e) => (e.pass || 0) === p && e.date == null);
      const again = cur.some((e) => prev.some((f) => f.who === e.who && (byWho || f.dow === e.dow)));
      shift[p] = shift[p - 1] + (again ? Math.max(0, ...prev.map((e) => e.wk || 0)) + 1 : 0);
    }
    for (const e of entries) { if (e.date == null && e.dow != null) e.wk = (e.wk || 0) + shift[e.pass || 0]; delete e.pass; }
    return entries;
  }
  function entryOf(d, s, who, line) {
    const e = { date: d.date, dow: d.dow, start: s.start, end: s.end, guess: s.guess, label: s.label, who: who || '', line };
    if (!d.date) { e.wk = d.wk || 0; e.pass = d.pass || 0; }
    return e;
  }
  function finish(entries, more) {
    // the same shift twice (a message repeated): once
    const seen = new Set();
    const out = entries.filter((e) => { const k = [e.date || e.dow + '+' + (e.wk || 0), e.start, e.end, e.who].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    const names = [...new Set(out.map((e) => e.who).filter(Boolean))];
    // a table with several rows and none of their names read is not the person's own: whose shifts they are is not known
    const nameless = !names.length && !!(more && more.rows > 1);
    return { entries: nameless ? [] : out, names, personal: !names.length && !nameless, nameless, needsWeek: !nameless && out.some((e) => e.date == null) };
  }

  /* ---------------- a table's words ---------------- */
  /** The words straightened and put in lines: { h, lines: [{ Y, words (right to left) }] }. */
  function layout(words) {
    const W = (words || []).filter((w) => w && String(w.text || '').replace(BIDI, '').trim()).map((w) => ({ text: String(w.text).replace(BIDI, '').trim(), x0: +w.x0, x1: +w.x1, y0: +w.y0, y1: +w.y1, cx: (+w.x0 + +w.x1) / 2, cy: (+w.y0 + +w.y1) / 2 }));
    const h = median(W.map((w) => w.y1 - w.y0)) || 10;
    // a tilted photo: the slope from each word to the next one on its line, the middle one of them all
    const sl = [];
    for (const a of W) {
      let best = null;
      for (const b of W) { const dx = b.cx - a.cx; if (dx <= h || dx > h * 16 || Math.abs(b.cy - a.cy) > h * 0.35 + dx * 0.09) continue; if (!best || dx < best.dx) best = { dx, dy: b.cy - a.cy }; }
      if (best) sl.push(best.dy / best.dx);
    }
    let slope = sl.length >= 6 ? median(sl) : 0;
    if (Math.abs(slope) > 0.2) slope = 0;
    for (const w of W) { w.X = w.cx + slope * w.cy; w.Y = w.cy - slope * w.cx; w.X0 = w.X - (w.x1 - w.x0) / 2; w.X1 = w.X + (w.x1 - w.x0) / 2; }
    // lines: each word joins the line whose nearest word sits at its height (a line that still climbs is followed)
    const lines = [];
    for (const w of W.slice().sort((a, b) => a.X - b.X)) {
      let best = null, bd = h * 0.55;
      for (const l of lines) { const d = Math.abs(l.last.Y - w.Y); if (d < bd) { bd = d; best = l; } }
      if (best) { best.words.push(w); best.last = w; } else lines.push({ words: [w], last: w });
    }
    for (const l of lines) { l.Y = median(l.words.map((w) => w.Y)); l.words.sort((a, b) => b.X - a.X); }
    lines.sort((a, b) => a.Y - b.Y);
    return { h, lines };
  }
  const isHeb = (t) => new RegExp(`[${HE}]`).test(t);
  /** A line as text, in reading order: right to left when it holds Hebrew. */
  const lineText = (ws) => { const s = ws.slice().sort((a, b) => b.X - a.X); return (s.some((w) => isHeb(w.text)) ? s : s.reverse()).map((w) => w.text).join(' '); };
  /** The dates a word may hold: read as it is, or with a "/" that OCR read as a 1 ("25110") put back; a date
   *  with no year in each year it could be. → [{ n, near }] */
  function dateCands(text, today) {
    const out = [];
    const take = (t) => {
      const d = daysIn(t, today).find((x) => x.date);
      if (!d) return;
      const keys = d.ny ? yearsOf(d.ny[0], d.ny[1], today) : [d.date];
      keys.forEach((k) => { if (!out.some((o) => o.n === dayN(k))) out.push({ n: dayN(k), near: k === d.date }); });
    };
    take(text);
    if (!out.length && /^\d{3,6}$/.test(text)) for (let i = 1; i < text.length - 1; i++) if (text[i] === '1') take(text.slice(0, i) + '/' + text.slice(i + 1));
    return out;
  }
  /** The days a line names, each with its place: { X, X0, X1, dow, style, cands, words }. A name and its date
   *  side by side ("ראשון 22/11", "יום א׳") are one. */
  function dayItems(line, today, h) {
    const ws = line.words, out = [];
    const used = new Set();
    ws.forEach((w, i) => {
      if (used.has(w)) return;
      const t = w.text.replace(/^[|:,;]+|[|:,;]+$/g, '');
      let d = daysIn(t, today)[0], group = [w];
      const nx = ws[i + 1];
      if (!d && /^ב?יום$/.test(t) && nx && w.X0 - nx.X1 < h * 1.5) { d = daysIn(t + ' ' + nx.text, today)[0]; if (d) group = [w, nx]; }
      if (!d) return;
      group.forEach((x) => used.add(x));
      out.push({ X0: Math.min(...group.map((x) => x.X0)), X1: Math.max(...group.map((x) => x.X1)), dow: d.date ? (d.named != null ? d.named : null) : d.dow, style: d.style, cands: d.date ? dateCands(t, today) : [], words: group });
    });
    out.sort((a, b) => b.X1 - a.X1);
    // a name and its date in one cell
    const merged = [];
    for (const it of out) {
      const p = merged[merged.length - 1];
      if (p && p.X0 - it.X1 < h * 1.5 && (p.dow != null) !== (it.dow != null) && !(p.cands.length && it.cands.length)) {
        Object.assign(p, { X0: Math.min(p.X0, it.X0), X1: Math.max(p.X1, it.X1), dow: p.dow != null ? p.dow : it.dow, style: p.dow != null ? p.style : it.style, cands: p.cands.concat(it.cands), words: p.words.concat(it.words) });
      } else merged.push(it);
    }
    merged.forEach((it) => { it.X = (it.X0 + it.X1) / 2; });
    return merged;
  }
  /**
   * The days of a head, made to agree. cols: [{ p (its place along the head, 0…), dow | null, cands }];
   * latin: the day names are English (left to right). → { dated, dir } and on each col: date, or dow + off
   * (days after the first), or drop.
   */
  function fitDays(cols, latin) {
    const P = Math.max(...cols.map((c) => c.p));
    const names = cols.filter((c) => c.dow != null).length;
    const tOf = (dir) => (c) => (dir < 0 ? P - c.p : c.p);
    let best = null;
    for (const dir of latin ? [1, -1] : [-1, 1]) {
      const t = tOf(dir);
      const votes = new Map();
      for (const c of cols) for (const k of c.cands) {
        const b = k.n - t(c);
        const v = votes.get(b) || votes.set(b, { n: 0, near: 0, cols: new Set() }).get(b);
        if (!v.cols.has(c)) { v.cols.add(c); v.n++; if (k.near) v.near++; }
      }
      for (const [b, v] of votes) {
        let agree = 0, dis = 0;
        for (const c of cols) if (c.dow != null) { if (dowN(b + t(c)) === c.dow) agree++; else dis++; }
        const score = v.n * 100 + (agree - dis) * 10 + v.near;
        if (!best || score > best.score) best = { dir, b, n: v.n, near: v.near, agree, dis, score, against: cols.filter((c) => c.cands.length && !v.cols.has(c)).length };
      }
    }
    if (datesAgree(best, names, cols.length)) {
      const t = tOf(best.dir);
      for (const c of cols) { c.date = keyN(best.b + t(c)); c.off = t(c); }
      return { dated: true, dir: best.dir, seq: true };
    }
    // names only: do they run on, day after day?
    let bn = null;
    for (const dir of latin ? [1, -1] : [-1, 1]) {
      const t = tOf(dir);
      for (let b = 0; b < 7; b++) { const n = cols.filter((c) => c.dow != null && c.dow === (b + t(c)) % 7).length; if (!bn || n > bn.n) bn = { dir, b, n }; }
    }
    if (bn && bn.n >= 3 && bn.n * 4 >= names * 3) {
      const t = tOf(bn.dir);
      for (const c of cols) { c.off = t(c); c.dow0 = bn.b; }
      return { dated: false, dir: bn.dir, seq: true, first: bn.b };
    }
    // days that skip (ראשון, שלישי, חמישי) or two only: each by its own name, in reading order
    const dir = latin ? 1 : -1, t = tOf(dir);
    const own = cols.filter((c) => c.dow != null).sort((a, b) => t(a) - t(b));
    cols.forEach((c) => { c.drop = c.dow == null; });
    let off = 0;
    own.forEach((c, i) => { if (i) off += ((c.dow - own[i - 1].dow + 7) % 7) || 7; c.off = off; c.dow0 = own[0].dow; });
    return { dated: false, dir, seq: false, first: own.length ? own[0].dow : 0 };
  }
  /** Do a head's dates hold? Two or more that follow each other, and: with day names, the names agree (a date OCR
   *  misread beside them does not matter); with no names, hardly a date that says otherwise (days that skip are
   *  each their own date). One date alone only when every column has its name and all agree with it. Dates
   *  that fit only in another year than the nearest (a picture from last year) need three of them and three
   *  day names that say so: one misread digit must not send a week a year back. */
  function datesAgree(best, names, n) {
    if (!best) return false;
    const other = best.near < best.n;
    if (best.n >= 2) return names ? best.dis * 3 <= best.agree && (!other || (best.n >= 3 && best.agree >= 3)) : !other && best.against * 2 <= best.n;
    return !other && n >= 2 && names === n && !best.dis;
  }
  /** A cell's words as text: line by line; a line of numbers alone is read in the order that gives the shorter
   *  shift ("08:00 - 16:00" in a right-to-left page is drawn "16:00 - 08:00"). → { text, flip } */
  function cellShifts(ws, h, named) {
    const lines = [];
    for (const w of ws.slice().sort((a, b) => a.Y - b.Y)) { const l = lines.find((x) => Math.abs(x.Y - w.Y) < h * 0.55); if (l) l.ws.push(w); else lines.push({ Y: w.Y, ws: [w] }); }
    const parts = lines.map((l) => {
      const asc = l.ws.slice().sort((a, b) => a.X - b.X).map((w) => w.text);
      if (asc.some(isHeb)) return { a: asc.slice().reverse().join(' ') };
      return asc.length > 1 ? { a: asc.join(' '), b: asc.slice().reverse().join(' ') } : { a: asc[0] };
    });
    const read = (pick) => {
      const text = parts.map((p) => (pick && p.b) || p.a).join(' ');
      const one = /^[בצעל]['׳]?$/.test(text.trim()) ? text.trim()[0] : null;
      const sh = one ? [{ start: named[CELL_LETTERS[one]][0], end: named[CELL_LETTERS[one]][1], guess: 'named', label: text.trim() }] : shiftsIn(text, named, true).filter((x) => !x.off);
      return { text, sh, len: sh.reduce((s, x) => s + (x.start && x.end ? lenOf(x.start, x.end) : 0), 0) };
    };
    const A = read(false);
    if (!parts.some((p) => p.b)) return A;
    const B = read(true);
    const exact = (r) => r.sh.filter((x) => !x.guess).length;
    if (exact(A) !== exact(B)) return exact(A) > exact(B) ? A : B;
    if (A.len === B.len) { if (A.sh.some((x, i) => !B.sh[i] || B.sh[i].start !== x.start)) A.sh.forEach((x) => { x.guess = x.guess || 'order'; }); return A; }
    return A.len < B.len ? A : B;
  }
  /** The names in a cell of names: each word (a letter after it is its family name's first: "דני כ."). */
  function cellNames(ws, named) {
    const out = [];
    for (const w of ws.slice().sort((a, b) => a.Y - b.Y || b.X - a.X)) {
      for (const t of w.text.split(/[,/+;|]+/)) {
        const n = nameIn(t, named);
        if (n) out.push(n);
        else if (out.length && new RegExp(`^[${LET}]['׳.]?$`).test(t.trim()) && !/ /.test(out[out.length - 1])) out[out.length - 1] += ' ' + t.trim();
      }
    }
    return out;
  }
  /** A line with no label of its own (the second line of a tall cell) goes to the labelled line right by it:
   *  the nearest, within reach, and clearly nearer than the one on its other side. */
  function nearestLine(line, labelled, h) {
    let a = null, b = null;
    for (const l of labelled) { const d = Math.abs(l.Y - line.Y); if (!a || d < a.d) { b = a; a = { l, d }; } else if (!b || d < b.d) b = { l, d }; }
    // a row of its own whose name was not read is a whole row's height away, like the named rows from each
    // other: only a line clearly nearer than that is a cell's second line
    const ys = labelled.map((l) => l.Y).sort((x, y) => x - y);
    const pitch = ys.length > 1 ? median(ys.slice(1).map((y, i) => y - ys[i])) : 0;
    const reach = Math.min(h * 1.9, pitch ? pitch * 0.75 : h * 1.3);
    return a && a.d <= reach && (!b || b.d >= a.d * 1.4) ? a.l : null;
  }

  /** Days across the top. → { entries, rows } or null. */
  function readAcross(L, ctx) {
    const { today, named } = ctx, h = L.h;
    const lines = L.lines;
    for (const l of lines) {
      l.items = dayItems(l, today, h);
      const inItems = new Set(l.items.flatMap((it) => it.words));
      l.rest = l.words.filter((w) => !inItems.has(w));
      l.shifts = shiftsIn(lineText(l.rest), named, true).filter((s) => !s.off);
      // two dates with a dash between them are a period ("22.11 - 28.11"), not two columns
      const two = l.items.length === 2 && l.items.every((it) => it.cands.length);
      l.period = two && (l.items[0].X0 - l.items[1].X1 < h * 3 || l.rest.some((w) => /^(?:-|–|—|עד)$/.test(w.text) && w.X < l.items[0].X0 && w.X > l.items[1].X1));
      // a head's days differ from each other, and two alone are two of a kind (a day's name and its date in two
      // columns are one day of a table that runs down)
      const kinds = new Set(l.items.map((it) => (it.dow != null ? 'n' : '') + (it.cands.length ? 'd' : '')));
      const differ = new Set(l.items.map((it) => (it.dow != null ? it.dow : 'c' + (it.cands[0] || {}).n))).size >= Math.min(3, l.items.length);
      l.headLike = l.items.length >= 2 && !l.shifts.length && !l.period && differ && (l.items.length >= 3 || kinds.size === 1);
    }
    // the heads: a line of days (three, or two when no line has more), with the lines of the same head right by
    // it (the dates under or over the names)
    const need = lines.some((l) => l.headLike && l.items.length >= 3) ? 3 : 2;
    const groups = [];
    lines.forEach((l, i) => {
      const g = groups[groups.length - 1];
      // the dates of a head's names (or its names over dates) in the row right under it, a tall row's height away
      // in a table with room in its cells: still the same head
      const kind = (x) => (x.items.every((it) => it.dow != null && !it.cands.length) ? 'n' : x.items.every((it) => it.dow == null && it.cands.length) ? 'd' : '');
      const last = g && g.lines[g.lines.length - 1];
      const pair = last && l.headLike && kind(l) && kind(last) && kind(l) !== kind(last) && i === g.to + 1;
      const near = g && l.Y - last.Y < h * (pair ? 4.5 : 2.8) && !lines.slice(g.to + 1, i).some((x) => x.shifts.length);
      if (!l.headLike) {
        // a line of dates OCR broke, right under the head ("25110 2244 25M"), is still the head's
        if (near && !l.shifts.length && l.words.some((w) => /\d/.test(w.text))) { g.lines.push(l); g.to = i; }
        return;
      }
      if (near) { g.lines.push(l); g.to = i; return; }
      if (l.items.length < need) return;
      // a line of single letters under a head of whole names is a row of cells ("ב׳ ב׳ ע׳"), not another head
      if (g && l.items.every((it) => it.style === 'letter') && !g.lines[0].items.every((it) => it.style === 'letter')) return;
      const ng = { lines: [l], from: i, to: i };
      // the dates over the names, when only some of them could be read
      const up = lines[i - 1];
      if (up && !up.headLike && (!g || g.to < i - 1) && l.Y - up.Y < h * 2.8 && !up.shifts.length && up.items.some((it) => it.cands.length)) { ng.lines.push(up); ng.from = i - 1; }
      groups.push(ng);
    });
    if (!groups.length) return null;
    const entries = [];
    let rows = 0, any = false;
    groups.forEach((g, gi) => {
      // the columns: from the line with the most names (else the most dates); the other lines give them dates
      const main = g.lines.slice().sort((a, b) => b.items.filter((it) => it.dow != null).length - a.items.filter((it) => it.dow != null).length || b.items.length - a.items.length)[0];
      let cols = main.items.map((it) => ({ X: it.X, dow: it.dow, style: it.style, cands: it.cands.slice() })).sort((a, b) => a.X - b.X);
      const diffs = cols.slice(1).map((c, i) => c.X - cols[i].X);
      const gap = diffs.length ? median(diffs) : h * 8;
      const frac = cols.map((c) => (c.X - cols[0].X) / gap);
      const even = frac.every((f) => Math.abs(f - Math.round(f)) < 0.3);
      cols.forEach((c, i) => { c.p = even ? Math.round(frac[i]) : i; });
      for (const l of g.lines) {
        if (l === main) continue;
        for (const it of l.items) { const c = cols.slice().sort((a, b) => Math.abs(a.X - it.X) - Math.abs(b.X - it.X))[0]; if (Math.abs(c.X - it.X) < gap * 0.45) { c.cands = c.cands.concat(it.cands); if (c.dow == null && it.dow != null) c.dow = it.dow; } }
        // a date OCR broke ("25110", "2204") is no day to daysIn, but may still be put back
        for (const w of l.rest) { if (!/^\d{3,6}$/.test(w.text)) continue; const c = cols.slice().sort((a, b) => Math.abs(a.X - w.X) - Math.abs(b.X - w.X))[0]; if (Math.abs(c.X - w.X) < gap * 0.45) c.cands = c.cands.concat(dateCands(w.text, today)); }
      }
      const latin = cols.some((c) => c.style === 'en');
      const fit = fitDays(cols, latin);
      // a column whose head could not be read, between two that could: it is the day between them
      if (fit.seq && even) {
        const P = Math.max(...cols.map((c) => c.p));
        for (let p = 1; p < P; p++) if (!cols.some((c) => c.p === p)) {
          const t = fit.dir < 0 ? P - p : p;
          cols.push(fit.dated ? { X: cols[0].X + p * gap, p, off: t, date: keyN(dayN(cols[0].date) + (t - cols[0].off)) } : { X: cols[0].X + p * gap, p, off: t, dow0: fit.first });
        }
      }
      cols = cols.filter((c) => !c.drop).sort((a, b) => a.X - b.X);
      // no dates in the head: the period in the title ("סידור 22/11-28/11") dates the first day when it falls on it
      if (!fit.dated && cols.length) {
        const first = cols.slice().sort((a, b) => a.off - b.off)[0];
        const start = ctx.period && dowOf(ctx.period) === (first.dow0 + first.off) % 7 ? ctx.period : null;
        if (start && !gi) cols.forEach((c) => { c.date = addDays(start, c.off - first.off); });
      }
      const body = lines.slice(g.to + 1, gi + 1 < groups.length ? groups[gi + 1].from : lines.length);
      const lo = cols[0].X - gap * 0.5, hi = cols[cols.length - 1].X + gap * 0.5;
      // which side the names are on: where the letters outside the columns are
      const side = (w) => (w.X > hi ? 1 : w.X < lo ? -1 : 0);
      let right = 0, left = 0;
      for (const l of body) for (const w of l.words) { if (!nameIn(w.text, {})) continue; if (side(w) > 0) right++; else if (side(w) < 0) left++; }
      const nameSide = right === left ? (fit.dir < 0 ? 1 : -1) : right > left ? 1 : -1;
      // the head's own words on that side ("שם", "תפקיד"): when one of them heads the names, the name is under it
      const corner = lines.slice(g.from, g.to + 1).flatMap((l) => l.rest).filter((w) => side(w) === nameSide && /[^\d\W]|[א-ת]/.test(w.text));
      const nameHead = corner.find((w) => NAME_HEADS.has(norm(w.text)));
      const others = corner.filter((w) => w !== nameHead && !NAME_HEADS.has(norm(w.text)));
      const inName = (w) => !nameHead || !others.length || others.every((o) => Math.abs(w.X - nameHead.X) <= Math.abs(w.X - o.X));
      for (const l of body) {
        l.cells = cols.map(() => []); l.label = [];
        for (const w of l.words) {
          const s = side(w);
          if (s === nameSide) { if (inName(w)) l.label.push(w); continue; }
          if (s) continue;
          let best = 0, bd = Infinity;
          cols.forEach((c, i) => { const d = Math.abs(c.X - w.X); if (d < bd) { bd = d; best = i; } });
          if (bd <= gap * 0.5) l.cells[best].push(w);
        }
        l.labelText = lineText(l.label);
        l.who = nameIn(l.labelText, named);
        l.labelShifts = shiftsIn(l.labelText, named, true).filter((s) => !s.off);
        l.has = l.cells.some((c) => c.length);
      }
      const entryFor = (c, s, who, line) => {
        const d = c.date ? { date: c.date, dow: dowOf(c.date) } : { date: null, dow: (c.dow0 + c.off) % 7, wk: Math.floor((c.dow0 + c.off) / 7), pass: gi };
        return entryOf(d, s, who, line);
      };
      const cellHasShift = (l) => l.cells.some((c) => c.length && cellShifts(c, h, named).sh.length);
      const typeLines = body.filter((l) => l.labelShifts.length);
      // the days in the order of time (the first day first, whichever side it is on)
      const order = cols.map((c, i) => i).sort((a, b) => cols[a].off - cols[b].off);
      if (typeLines.length && !body.some(cellHasShift) && body.some((l) => l.cells.some((c) => cellNames(c, named).length))) {
        // a row per shift, the workers' names in the cells: the lines of one shift are its label's lines (its name,
        // its hours under it) and the lines with no label right by them
        const types = [];
        for (const l of typeLines) {
          const t = types[types.length - 1];
          if (t && l.Y - t.lines[t.lines.length - 1].Y < h * 1.9 && !(t.sh.some((s) => !s.guess) && l.labelShifts.some((s) => !s.guess)) && !(t.sh.some((s) => s.guess) && l.labelShifts.some((s) => s.guess))) { t.lines.push(l); t.sh = t.sh.concat(l.labelShifts); } else types.push({ lines: [l], sh: l.labelShifts.slice() });
        }
        for (const l of body) {
          if (!l.has) continue;
          let t = types.find((x) => x.lines.includes(l));
          if (!t) {
            const near = types.map((x) => ({ x, d: Math.min(...x.lines.map((tl) => Math.abs(tl.Y - l.Y))) })).sort((a, b) => a.d - b.d);
            t = near[0] && near[0].d <= h * 2.4 && (!near[1] || near[1].d >= near[0].d * 1.3) ? near[0].x : null;
          }
          if (!t) continue;
          const s = t.sh.find((x) => !x.guess) || t.sh[0];
          order.forEach((i) => cellNames(l.cells[i], named).forEach((n) => { entries.push(entryFor(cols[i], s, n, lines.indexOf(l))); any = true; }));
        }
        rows += 2; // names are in the cells: never one person's own table
      } else {
        // a row per worker: a line with no name by a named line is that worker's second line
        const labelled = body.filter((l) => l.who);
        const rowsOf = new Map();
        // a range a narrow cell wrapped ("08:00-" over "16:00"): every cell of the line under it goes on a cell of
        // the line above that ends with a dash. One row, not two (two rows with no name were nobody's: nothing read)
        const ends = (c) => c.length && /(?:[-–—]|עד)$/.test(c.slice().sort((a, b) => a.Y - b.Y || a.X - b.X).pop().text);
        const wraps = (up, l) => up && l.Y - up.Y < h * 2.2 && l.cells.some((c) => c.length) && l.cells.every((c, i) => !c.length || ends(up.cells[i]));
        let prev = null;
        for (const l of body) {
          if (!l.has) continue;
          const owner = l.who ? l : nearestLine(l, labelled, h) || (wraps(prev, l) ? prev.owner : l);
          (rowsOf.get(owner) || rowsOf.set(owner, []).get(owner)).push(l);
          l.owner = owner; prev = l;
        }
        // the same name on two rows (two workers called the same): told apart by their order
        const count = new Map(), nth = new Map();
        for (const owner of rowsOf.keys()) if (owner.who) count.set(owner.who, (count.get(owner.who) || 0) + 1);
        for (const [owner, ls] of rowsOf) {
          let who = owner.who;
          if (who && count.get(who) > 1) { nth.set(who, (nth.get(who) || 0) + 1); who = who + ' (' + nth.get(who) + ')'; }
          let got = false;
          order.forEach((i) => {
            const ws = ls.flatMap((l) => l.cells[i]);
            if (!ws.length) return;
            for (const s of cellShifts(ws, h, named).sh) { entries.push(entryFor(cols[i], s, who, lines.indexOf(owner))); got = true; }
          });
          if (got) { rows++; any = true; }
        }
      }
    });
    // a head of days was there and no row under it could be read: a table all the same (see parseWords)
    if (!any) return { entries: [], rows: 2, head: true };
    return { entries: passes(entries, true), rows };
  }

  /** Days down the side. → { entries, rows }, { text: true } (lines to read as text) or null. */
  function readSide(L, ctx) {
    const { today, named } = ctx, h = L.h, lines = L.lines;
    const dayLines = lines.filter((l) => l.items.length && !l.period && !(l.headLike && l.items.length >= 3));
    if (dayLines.length < 2) return null;
    // the side columns: where the days' names are, and where their dates are when they stand in a column of their
    // own (each mostly one under the other)
    const all = dayLines.flatMap((l) => l.items);
    const nameXs = all.filter((it) => it.dow != null).map((it) => it.X), dateXs = all.filter((it) => it.dow == null && it.cands.length).map((it) => it.X);
    const colX = [nameXs.length >= 2 ? median(nameXs) : null, dateXs.length >= 2 ? median(dateXs) : null].filter((x) => x != null);
    if (!colX.length) colX.push(median(dayLines.map((l) => l.items[0].X)));
    const inSide = (it) => colX.some((x) => Math.abs(it.X - x) < h * 4);
    let side = dayLines.filter((l) => l.items.some(inSide));
    // a day's name and its date in two columns, a photo's slant put on two lines ("23/11" a little over "שני"):
    // one day (a new line object: the lines themselves stay as they are for the reading as text)
    const merged = new Set();
    side = side.reduce((out, l) => {
      const p = out[out.length - 1];
      const only = (x, k) => x.items.filter(inSide).every((it) => (k === 'n' ? it.dow != null && !it.cands.length : it.dow == null && it.cands.length));
      if (p && !p.joined && Math.abs(l.Y - p.Y) < h * 1.1 && ((only(p, 'n') && only(l, 'd')) || (only(p, 'd') && only(l, 'n')))) {
        merged.add(l); merged.add(p.src || p);
        out[out.length - 1] = { src: p.src || p, Y: p.Y, words: p.words.concat(l.words), items: p.items.concat(l.items), joined: true };
      } else out.push(l);
      return out;
    }, []);
    if (side.length < 2) return null;
    const sideX = rtlOf(side) ? Math.min(...colX) : Math.max(...colX);
    for (const l of side) {
      // the day of the line: its name and its date, wherever each stands ("ראשון | 22/11")
      const its = l.items.filter((it) => inSide(it) || Math.abs(it.X - sideX) < h * 9);
      const nm = its.find((it) => it.dow != null);
      l.day = { dow: nm ? nm.dow : null, cands: its.flatMap((it) => it.cands), style: (nm || its[0]).style };
      const used = new Set(its.flatMap((it) => it.words));
      l.cellsWords = l.words.filter((w) => !used.has(w));
      l.cellShift = shiftsIn(lineText(l.cellsWords), named, true).filter((s) => !s.off);
      l.cellName = nameIn(blankShifts(lineText(l.cellsWords), named), named);
    }
    const withShifts = side.filter((l) => l.cellShift.length);
    // the head: the nearest line above the first day that has words over the cells
    const srcOf = (l) => l.src || l;
    const first = lines.indexOf(srcOf(side[0]));
    const rtl = rtlOf(side);
    const cellSide = (w) => (rtl ? w.X < sideX - h * 2 : w.X > sideX + h * 2);
    const headLines = lines.slice(0, first).filter((l) => side[0].Y - l.Y < h * 6 && l.words.some(cellSide));
    const headWords = headLines.length ? headLines.filter((l) => l.Y >= headLines[headLines.length - 1].Y - h * 1.9).flatMap((l) => l.words.filter(cellSide)) : [];
    // the head's words in columns: words side by side are one ("דני כהן", "בוקר 7-15"), as are words one over the other
    const hcols = [];
    for (const w of headWords.slice().sort((a, b) => b.X - a.X)) {
      const c = hcols.find((x) => (w.X1 > x.X0 - h * 1.2 && w.X0 < x.X1 + h * 1.2));
      if (c) { c.words.push(w); c.X0 = Math.min(c.X0, w.X0); c.X1 = Math.max(c.X1, w.X1); } else hcols.push({ words: [w], X0: w.X0, X1: w.X1 });
    }
    for (const c of hcols) {
      c.X = (c.X0 + c.X1) / 2;
      c.text = c.words.slice().sort((a, b) => a.Y - b.Y || b.X - a.X).map((w) => w.text).join(' ');
      c.sh = shiftsIn(c.text, named, true).filter((s) => !s.off);
      c.who = nameIn(blankShifts(c.text, named), named);
    }
    const typeCols = hcols.filter((c) => c.sh.length);
    const people = hcols.filter((c) => !c.sh.length && c.who);
    const namesInCells = side.filter((l) => !l.cellShift.length && l.cellName).length;
    const isTypes = typeCols.length >= 2 && namesInCells >= 1 && withShifts.length <= side.length / 4;
    if (!isTypes) {
      // hours in the day's own line, with a name by them: a message, a line a day. No hours in the days' lines:
      // cards (the day, then its hours under it). Both are read as text
      const inline = withShifts.filter((l) => l.cellName).length;
      if (!withShifts.length || inline * 2 >= withShifts.length) return { text: true };
      // several shifts a day, in columns, and no head of names that could be read: nobody's
      if (!people.length) return withShifts.filter((l) => l.cellShift.length > 1).length * 2 >= withShifts.length ? { entries: [], rows: 2 } : { text: true };
    }
    // the days, made to agree (one under the other: time runs down)
    const cols = side.map((l, i) => ({ p: i, dow: l.day.dow, cands: l.day.cands, l }));
    const fit = fitSide(cols);
    // the lines between the days' lines (the second line of a tall cell) go to the day right by them
    const owner = new Map();
    const lastSide = lines.indexOf(srcOf(side[side.length - 1]));
    const sides = new Set(side.map(srcOf));
    lines.forEach((l, i) => {
      if (i <= first || sides.has(l) || merged.has(l) || i > lastSide + 2) return;
      const o = nearestLine(l, side, h);
      if (o) (owner.get(o) || owner.set(o, []).get(o)).push(l);
    });
    const use = isTypes ? typeCols : people;
    const xs = use.map((c) => c.X).sort((a, b) => a - b);
    const gap = xs.length > 1 ? Math.min(...xs.slice(1).map((x, i) => x - xs[i])) : h * 12;
    const entries = [];
    cols.forEach((c) => {
      if (c.drop) return;
      const d = c.date ? { date: c.date, dow: dowOf(c.date) } : { date: null, dow: (c.dow0 + c.off) % 7, wk: Math.floor((c.dow0 + c.off) / 7), pass: 0 };
      const ws = c.l.cellsWords.concat((owner.get(c.l) || []).flatMap((l) => l.words.filter(cellSide)));
      const cells = use.map(() => []);
      for (const w of ws) { let best = -1, bd = Infinity; use.forEach((u, k) => { const dd = Math.abs(u.X - w.X); if (dd < bd) { bd = dd; best = k; } }); if (best >= 0 && bd <= gap * 0.55) cells[best].push(w); }
      cells.forEach((cw, k) => {
        if (!cw.length) return;
        if (isTypes) { const s = use[k].sh.find((x) => !x.guess) || use[k].sh[0]; cellNames(cw, named).forEach((n) => entries.push(entryOf(d, s, n, lines.indexOf(srcOf(c.l))))); }
        else for (const s of cellShifts(cw, h, named).sh) entries.push(entryOf(d, s, use[k].who, lines.indexOf(srcOf(c.l))));
      });
    });
    if (!entries.length) return null;
    return { entries: passes(entries), rows: 2 };
  }
  function blankShifts(text, named) { return blank(text, shiftsIn(text, named, true)); }
  /** Days written right to left (Hebrew) unless they are English names. */
  const rtlOf = (ls) => !ls.some((l) => l.items.some((it) => it.style === 'en'));
  /** The days down a side column: as fitDays, with time running down the lines. */
  function fitSide(cols) {
    const names = cols.filter((c) => c.dow != null).length;
    const votes = new Map();
    for (const c of cols) for (const k of c.cands) { const b = k.n - c.p; const v = votes.get(b) || votes.set(b, { n: 0, near: 0, cols: new Set() }).get(b); if (!v.cols.has(c)) { v.cols.add(c); v.n++; if (k.near) v.near++; } }
    let best = null;
    for (const [b, v] of votes) {
      let agree = 0, dis = 0;
      for (const c of cols) if (c.dow != null) { if (dowN(b + c.p) === c.dow) agree++; else dis++; }
      const score = v.n * 100 + (agree - dis) * 10 + v.near;
      if (!best || score > best.score) best = { b, n: v.n, near: v.near, agree, dis, score, against: cols.filter((c) => c.cands.length && !v.cols.has(c)).length };
    }
    if (datesAgree(best, names, cols.length)) {
      // a line's place counts the days only while no day's line is missing: a day whose own name or date says
      // otherwise is not given the date of its place (a line OCR lost above it would move it a day)
      for (const c of cols) {
        const n = best.b + c.p;
        c.date = keyN(n); c.off = c.p;
        if (c.dow != null ? dowN(n) !== c.dow : c.cands.length && !c.cands.some((k) => k.n === n)) c.drop = true;
      }
      return { dated: true };
    }
    // a day with a date of its own that fits its name keeps it (days that skip: only the days someone works)
    const own = cols.filter((c) => c.dow != null);
    cols.forEach((c) => {
      c.drop = c.dow == null;
      const k = c.cands.find((x) => x.near && (c.dow == null || dowN(x.n) === c.dow)) || c.cands.find((x) => c.dow != null && dowN(x.n) === c.dow);
      if (k && (c.dow != null || c.cands.length)) { c.date = keyN(k.n); c.drop = false; }
    });
    let off = 0;
    own.forEach((c, i) => { if (i) off += ((c.dow - own[i - 1].dow + 7) % 7) || 7; c.off = off; c.dow0 = own[0].dow; });
    datedByNeighbours(cols);
    return { dated: false };
  }
  /**
   * Days of one table, some dated and some by their name only: a name alone is the first such day after the
   * dated day above it (before the one under it, when none is above). The week the screen guesses must never
   * date a day beside days the table dates itself; a day that fits between none of them is left out.
   */
  function datedByNeighbours(cols) {
    const dated = cols.filter((c) => c.date && !c.drop).sort((a, b) => a.p - b.p);
    if (!dated.length) return;
    for (const c of cols) {
      if (c.date || c.drop) continue;
      if (c.dow == null) { c.drop = true; continue; }
      const prev = dated.filter((d) => d.p < c.p).pop(), next = dated.find((d) => d.p > c.p);
      const n = prev ? dayN(prev.date) + (((c.dow - dowOf(prev.date) + 7) % 7) || 7) : dayN(next.date) - (((dowOf(next.date) - c.dow + 7) % 7) || 7);
      if ((prev && n <= dayN(prev.date)) || (next && n >= dayN(next.date))) { c.drop = true; continue; }
      c.date = keyN(n);
    }
  }
  /** The period a title names: "22/11-28/11", "22-28/11", "29.11.26 - 05.12.26" → its first day, or null. */
  function periodIn(text, today) {
    const m = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\s*(?:-|–|—|עד)\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/.exec(text) || null;
    const m2 = m ? null : /(?:^|[^\d./])(\d{1,2})\s*(?:-|–|—)\s*(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d:])/.exec(text);
    const yr = (y) => (y ? (y.length === 2 ? 2000 + +y : +y) : null);
    let a = null, b = null;
    if (m) {
      const y2 = yr(m[6]), y1 = yr(m[3]);
      b = y2 ? (validDate(y2, +m[5], +m[4]) ? keyOf(y2, +m[5], +m[4]) : null) : nearYear(+m[4], +m[5], today);
      a = y1 ? (validDate(y1, +m[2], +m[1]) ? keyOf(y1, +m[2], +m[1]) : null) : null;
      if (!a && b) a = [+b.slice(0, 4), +b.slice(0, 4) - 1].map((y) => (validDate(y, +m[2], +m[1]) ? keyOf(y, +m[2], +m[1]) : null)).find((k) => k && k <= b) || null;
    } else if (m2) {
      const y = yr(m2[4]);
      b = y ? (validDate(y, +m2[3], +m2[2]) ? keyOf(y, +m2[3], +m2[2]) : null) : nearYear(+m2[2], +m2[3], today);
      a = b && +m2[1] < +m2[2] ? b.slice(0, 8) + pad(+m2[1]) : null;
    }
    if (!a || !b) return null;
    const span = dayN(b) - dayN(a);
    return span >= 1 && span <= 14 ? a : null;
  }

  /** Words with boxes ({ text, x0, y0, x1, y1 }) → as parseText. */
  function parseWords(words, opts) {
    opts = opts || {};
    const today = opts.today;
    const named = namedMap(opts.named);
    const L = layout(words);
    if (!L.lines.length) return finish([]);
    const period = L.lines.map((l) => periodIn(lineText(l.words), today)).find(Boolean) || null;
    const ctx = { today, named, period };
    const across = readAcross(L, ctx);
    const t = across && across.entries.length ? across : readSide(L, ctx);
    if (t && !t.text && t.entries.length) return finish(oneCalendar(t.entries), t);
    // a table's head with nothing under it that could be read: not a message. Read as text, its rows would go to
    // the days of whatever line stands over them (a date the photo's slant left on a line of its own): nothing
    if ((across && across.head) || (t && !t.text)) return finish([], { rows: 2 });
    // no table shape: read as text, a line a line
    return parseText(L.lines.map((l) => lineText(l.words)).join('\n'), Object.assign({}, opts, { ocr: true }));
  }

  /** A table's days either all have their dates or none does: the week the screen guesses never dates a day of a
   *  table that dates its other days itself (a day the table left undated is left out). */
  function oneCalendar(entries) {
    return entries.some((e) => e.date) ? entries.filter((e) => e.date) : entries;
  }

  /* ---------------- whose, which week, the rows ---------------- */
  /** Is this name the person's? (any of their names, a whole word: "לי" is in "לי בטן", not in "לילך") */
  function isMine(who, mine) {
    const w = norm(who);
    if (!w) return false;
    return (mine || []).map(norm).filter(Boolean).some((n) => w === n || w.split(' ').includes(n) || n.split(' ').includes(w));
  }
  /**
   * The schedule's names that are the person's. One name of theirs that fits several ("דני כ." and "דני ל." for
   * דני לוי) is the one whose other letters fit their other names; a name with a letter that fits none of theirs
   * ("דני כ." for דני לוי) is someone else. Still several, or none: [] (the screen asks).
   */
  function whoOf(names, mine) {
    const mineN = (mine || []).map(norm).filter(Boolean);
    const exact = names.filter((n) => mineN.includes(norm(n)));
    if (exact.length === 1) return exact;
    const myWords = [...new Set(mineN.flatMap((n) => n.split(' ')))];
    // the words of a schedule's name that are not one of the person's: each must be the start of one of theirs
    // (a person who gave the app one name only cannot be checked so: any family name may be theirs)
    const multi = mineN.some((n) => n.includes(' '));
    const fits = (n) => norm(n).split(' ').filter((x) => !/^\(\d+\)$/.test(x)).every((x) => myWords.includes(x) || !multi || (x.length === 1 && myWords.some((m) => m.length > 1 && m.startsWith(x))));
    const some = names.filter((n) => isMine(n, mine));
    const full = some.filter(fits);
    if (full.length === 1) return full;
    // the fullest fit ("דני ל." over "דני" for דני לוי)
    const most = Math.max(0, ...full.map((n) => norm(n).split(' ').length));
    const top = full.filter((n) => norm(n).split(' ').length === most);
    return top.length === 1 ? top : [];
  }
  /** The Sunday of the week a schedule is most likely for: this week until Wednesday, then the next. */
  function weekStartFor(today) {
    const dow = dowOf(today);
    return dow <= 3 ? addDays(today, -dow) : addDays(today, 7 - dow);
  }
  /**
   * What the screen offers from a reading: { who (the names chosen), ask (names were found, none is the
   * person's: they choose), week (for day names with no dates), entries (the chosen people's) }.
   * opts: { today, mine: [the person's names], text (what was read: "שבוע הבא" names the week), who (chosen) }
   */
  function offer(res, opts) {
    opts = opts || {};
    const today = opts.today;
    let week = weekStartFor(today);
    const thisW = addDays(today, -dowOf(today));
    const text = opts.text || '';
    if (/שבוע הבא|next week/i.test(text)) week = addDays(thisW, 7);
    else if (/(^|[^א-ת])ה?שבוע הזה|(^|[^א-ת])השבוע($|[^א-ת])|this week/i.test(text)) week = thisW;
    const who = res.personal ? [] : opts.who || whoOf(res.names, opts.mine);
    const set = new Set(who);
    const entries = res.personal ? res.entries.slice() : res.entries.filter((e) => set.has(e.who));
    return { who, ask: !res.personal && !who.length, week, entries, needsWeek: entries.some((e) => e.date == null) };
  }
  /** The person's entries: theirs by name, or all of them in a schedule with no names. */
  function pick(res, mine) {
    if (res.personal) return res.entries.slice();
    return res.entries.filter((e) => isMine(e.who, mine));
  }
  /** Entries → rows with a date and both times: a day name lands in the week from weekStart (wk weeks on); a
   * single time lasts lenMin. Each row keeps its entry (src). */
  function rowsOf(entries, weekStart, lenMin) {
    return entries.map((e) => {
      const date = e.date || (e.dow != null ? addDays(weekStart, e.dow + 7 * (e.wk || 0)) : null);
      if (!date || (!e.start && !e.end)) return null;
      const start = e.start || fromMin(toMin(e.end) - (lenMin || 480));
      const end = e.end || fromMin(toMin(e.start) + (lenMin || 480));
      const len = lenOf(start, end);
      return { date, start, end, overnight: toMin(end) <= toMin(start), hours: len / 60, guess: e.start && e.end ? e.guess : 'single', label: e.label, who: e.who, src: e };
    }).filter(Boolean).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }

  /** Does a row start ticked on the screen? Not when the app has a shift at that time already, nor when it is over
   *  a week ago: a schedule is a plan, and an old one (last year's photo) would be saved as shifts worked. */
  function startsOn(row, today, taken) {
    return !taken && row.date >= addDays(today, -7);
  }

  root.Schedule = { parseText, parseWords, pick, isMine, whoOf, offer, weekStartFor, rowsOf, startsOn, NAMED };
})(typeof window !== 'undefined' ? window : globalThis);
