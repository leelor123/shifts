/* ============================================================
 * schedule.js — a work schedule (סידור עבודה) someone was sent, into their planned shifts: a WhatsApp
 * message or other text, or the table in a photo, a screenshot or a PDF (its words, each with its place).
 *
 * Text, a line at a time (a day may head the lines under it):
 *   - a day: a name (ראשון…שבת, "יום א׳"…"ש׳", Sun…Sat) or a date (26/10, 26.10.26, 2026-10-26); a line
 *     with three days or more is a table's head, and each row under it gives one cell per day, in order;
 *   - a shift: a range ("8-16", "08:00–16:30", "16 עד 24"; an end before the start is the next morning,
 *     "22-06"), a shift's name (בוקר, צהריים, ערב, לילה, or the person's own template names) with its usual
 *     hours, or one time ("מ-16:00") lasting the person's usual length (both marked as a guess). Off (חופש,
 *     OFF, a dash) is a day with no shift. A range must last between half an hour and 16 hours (so "12-11"
 *     is a date, not a 23-hour shift);
 *   - whose: the words before a shift, after the day or the shift before it ("ראשון: דני 8-16, מאיה 16-24").
 *     A schedule with no names at all is the person's own (a message to them); otherwise each shift keeps its
 *     name and the screen keeps the person's (pick()).
 * A day name alone lands in the week the screen chose (from its Sunday); a date without a year is the
 * nearest one from two months back.
 *
 * A table's words (OCR or PDF, words with boxes): the words are put in rows by height; the row with three
 * days or more is the head, and each word under it goes to the nearest day's column; the words outside the
 * columns are the row's name. When the days run down the side instead (a row per day), the head row holds the
 * names and each column is a person.
 * ============================================================ */
(function (root) {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  const HE = '\\u0590-\\u05FF';
  const keyOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const validDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate() && y >= 2000 && y <= 2100;
  const dowOf = (k) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)).getDay();
  const addDays = (k, n) => { const d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) + n); return keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate()); };

  const DAY_NAMES = { 'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6 };
  const DAY_LETTERS = { 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3, 'ה': 4, 'ו': 5, 'ש': 6 };
  const DAY_EN = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  // a shift's name and its usual hours (the person's own templates come first)
  const NAMED = { 'בוקר': ['07:00', '15:00'], 'צהריים': ['11:00', '19:00'], 'צהרים': ['11:00', '19:00'], 'ערב': ['15:00', '23:00'], 'לילה': ['23:00', '07:00'],
    morning: ['07:00', '15:00'], noon: ['11:00', '19:00'], evening: ['15:00', '23:00'], night: ['23:00', '07:00'] };
  const OFF_WORDS = ['חופש', 'חופשה', 'מחלה', 'חופשי', 'off', 'x', '-', '—', '–'];
  // words around a name that are not the name
  const NOISE = new Set(['משמרת', 'משמרות', 'בין', 'השעות', 'שעות', 'עד', 'מ', 'מה', 'יום', 'ביום', 'שבוע', 'הבא', 'השבוע', 'סידור', 'עבודה', 'סידור', 'לשבוע', 'עובד', 'עובדת', 'shift', 'from', 'to', 'week', 'and', 'ו', 'את', 'של', 'גם', 'אצל']);

  const DATE_FULL = /(?<![\d:])(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?![\d:])/g;
  const DATE_ISO = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g;
  const DATE_SHORT = /(?<![\d:./-])(\d{1,2})[./](\d{1,2})(?![\d:./-])/g;
  const DAY_NAME_RE = new RegExp(`(?<![${HE}])(?:ב?יום\\s+)?(?:ה|ב|ל)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?![${HE}])`, 'g');
  const DAY_LETTER_RE = new RegExp(`(?<![${HE}])(?:(?:ב?יום\\s+)([אבגדהוש])['׳"״]?|([אבגדהוש])['׳](?:["״])?)(?![${HE}])`, 'g');
  const DAY_EN_RE = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?(?![a-z])/gi;
  // a date with the month's Hebrew name: "25 באוקטובר", "26 אוק׳", "3 בנובמבר 2026"
  const MONTHS_HE = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  const DATE_HE_RE = new RegExp(`(?<!\\d)(\\d{1,2})\\s*ב?(${MONTHS_HE.join('|')})[${HE}'׳]*(?:\\s+(\\d{4}))?`, 'g');
  const RANGE_RE = /(?<![\d:./])(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|—|עד|to)\s*(\d{1,2})(?:[:.](\d{2}))?(?![\d:./])/g;
  const TIME_RE = /(?<![\d:./])(\d{1,2}):(\d{2})(?![\d:./])/g;

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
  /** Every day mentioned in a piece of text: { at, len, dow, date } (a name and a date side by side are one). */
  function daysIn(text, today) {
    const found = [];
    const add = (m, dow, date) => found.push({ at: m.index, len: m[0].length, dow: date ? dowOf(date) : dow, date: date || null });
    for (const m of text.matchAll(DATE_ISO)) if (validDate(+m[1], +m[2], +m[3])) add(m, null, keyOf(+m[1], +m[2], +m[3]));
    for (const m of text.matchAll(DATE_FULL)) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      if (validDate(y, +m[2], +m[1]) && !found.some((f) => m.index >= f.at && m.index < f.at + f.len)) add(m, null, keyOf(y, +m[2], +m[1]));
    }
    for (const m of text.matchAll(DATE_HE_RE)) {
      const mo = MONTHS_HE.indexOf(m[2]) + 1, d = +m[1];
      const k = m[3] ? (validDate(+m[3], mo, d) ? keyOf(+m[3], mo, d) : null) : nearYear(d, mo, today);
      if (k && !found.some((f) => m.index >= f.at && m.index < f.at + f.len)) add(m, null, k);
    }
    for (const m of text.matchAll(DATE_SHORT)) {
      if (found.some((f) => m.index >= f.at && m.index < f.at + f.len)) continue;
      const k = nearYear(+m[1], +m[2], today);
      if (k) add(m, null, k);
    }
    for (const m of text.matchAll(DAY_NAME_RE)) add(m, DAY_NAMES[m[1]], null);
    for (const m of text.matchAll(DAY_LETTER_RE)) add(m, DAY_LETTERS[m[1] || m[2]], null);
    for (const m of text.matchAll(DAY_EN_RE)) add(m, DAY_EN[m[1].toLowerCase()], null);
    found.sort((a, b) => a.at - b.at);
    // a name next to its date ("ראשון 25/10", "25.10 יום א׳") is one day: the date (when they disagree, the date)
    const out = [];
    for (const f of found) {
      const p = out[out.length - 1];
      if (p && f.at - (p.at + p.len) <= 4 && (p.date ? !f.date : f.date)) {
        p.date = p.date || f.date; p.dow = dowOf(p.date); p.len = f.at + f.len - p.at; continue;
      }
      out.push(Object.assign({}, f));
    }
    return out;
  }
  function blank(text, spans) { let s = text; for (const f of spans) s = s.slice(0, f.at) + ' '.repeat(f.len) + s.slice(f.at + f.len); return s; }
  function hhmm(h, m) { h = +h; m = +(m || 0); if (h === 24 && !m) h = 0; return h < 24 && m < 60 ? pad(h) + ':' + pad(m) : null; }
  /** The shifts in a piece of text (no days in it): { at, len, start, end, guess, off, label }. */
  function shiftsIn(text, named) {
    const out = [];
    const taken = (i) => out.some((s) => i >= s.at && i < s.at + s.len);
    for (const m of text.matchAll(RANGE_RE)) {
      const a = hhmm(m[1], m[2]), b = hhmm(m[3], m[4]);
      if (!a || !b) continue;
      let len = toMin(b) - toMin(a); if (len <= 0) len += 1440;
      if (len < 30 || len > 16 * 60) continue;
      out.push({ at: m.index, len: m[0].length, start: a, end: b, guess: null, label: m[0].trim() });
    }
    const words = [...text.matchAll(new RegExp(`[${HE}A-Za-z'׳"״]+|[-–—x]`, 'g'))];
    for (const w of words) {
      if (taken(w.index)) continue;
      const word = w[0].replace(/^[וה](?=(בוקר|ערב|לילה|צהריים|צהרים)$)/, '').toLowerCase();
      const n = named[word];
      if (n) { out.push({ at: w.index, len: w[0].length, start: n[0], end: n[1], guess: 'named', label: w[0] }); continue; }
      if (OFF_WORDS.includes(word) && (word.length > 1 || /^\s*[-–—x]\s*$/i.test(text.trim()) || /(^|[\s,|:;])[-–—x]([\s,|;]|$)/i.test(text.slice(Math.max(0, w.index - 1), w.index + 2)))) {
        out.push({ at: w.index, len: w[0].length, off: true, label: w[0] });
      }
    }
    for (const m of text.matchAll(TIME_RE)) {
      if (taken(m.index)) continue;
      const a = hhmm(m[1], m[2]);
      if (a) out.push({ at: m.index, len: m[0].length, start: a, end: null, guess: 'single', label: m[0] });
    }
    out.sort((a, b) => a.at - b.at);
    // two times side by side ("08:00 16:30", a cell split in two) are one range
    for (let i = 0; i + 1 < out.length; i++) {
      const a = out[i], b = out[i + 1];
      if (a.guess !== 'single' || b.guess !== 'single' || !/^\s*(?:-|–|—|עד|to)?\s*$/.test(text.slice(a.at + a.len, b.at))) continue;
      let len = toMin(b.start) - toMin(a.start); if (len <= 0) len += 1440;
      if (len < 30 || len > 16 * 60) continue;
      out.splice(i, 2, { at: a.at, len: b.at + b.len - a.at, start: a.start, end: b.start, guess: null, label: text.slice(a.at, b.at + b.len).trim() });
    }
    return out;
  }
  /** The words that name someone in a stretch of text ('' when none). */
  function nameIn(text, named) {
    const ws = (text.match(new RegExp(`[${HE}A-Za-z]{2,}`, 'g')) || []).filter((w) => !NOISE.has(w.toLowerCase()) && !named[w.toLowerCase()] && !OFF_WORDS.includes(w.toLowerCase()));
    return ws.slice(0, 3).join(' ');
  }
  function namedMap(extra) {
    const m = Object.assign({}, NAMED);
    for (const [k, v] of Object.entries(extra || {})) if (v && v[0] && v[1]) m[k.toLowerCase()] = v;
    return m;
  }

  /**
   * Text → entries: { date | dow, start, end, guess, who, line }.
   * opts: { today, named: { name: ['HH:MM', 'HH:MM'] } (the person's templates) }
   */
  function parseText(text, opts) {
    opts = opts || {};
    const today = opts.today;
    const named = namedMap(opts.named);
    const entries = [];
    let day = null; // the day heading the lines under it
    let head = null; // a table's head: its days in order
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    lines.forEach((raw, li) => {
      const line = raw.replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/\*/g, ' ');
      if (!line.trim()) return;
      const days = daysIn(line, today);
      const rest = blank(line, days);
      const shifts = shiftsIn(rest, named);
      // days with no shifts among them: a table's head
      if (days.length >= 3 && !shifts.some((s) => !s.off)) { head = days; day = null; return; }
      // several days in one line ("ראשון 8-16 שני 9-17"): each shift goes with the day before it
      if (days.length >= 2) {
        head = null;
        let from = 0;
        for (const s of shifts) {
          const d = days.filter((x) => x.at < s.at).pop() || days[0];
          const who = nameIn(rest.slice(Math.max(from, d.at + d.len), s.at), named);
          from = s.at + s.len;
          if (!s.off) entries.push(entryOf(d, s, who, li));
        }
        day = days[days.length - 1];
        return;
      }
      if (days.length) { day = days[0]; head = null; }
      if (!shifts.length) return;
      // a row under a table's head: one cell per day, in order (the name is what comes before)
      if (head && !days.length) {
        const who = nameIn(rest.slice(0, shifts[0].at), named) || nameIn(rest.slice(shifts[shifts.length - 1].at + shifts[shifts.length - 1].len), named);
        shifts.slice(0, head.length).forEach((s, i) => { if (!s.off) entries.push(entryOf(head[i], s, who, li)); });
        return;
      }
      if (!day) return;
      let from = 0;
      const mine = [];
      for (const s of shifts) {
        const who = nameIn(rest.slice(from, s.at), named);
        from = s.at + s.len;
        if (!s.off) { const e = entryOf(day, s, who, li); entries.push(e); mine.push(e); }
      }
      // a name after the hours ("22:00-06:00 לי"): the last shift's, when it had none before it
      const last = mine[mine.length - 1];
      if (last && !last.who) last.who = nameIn(rest.slice(from), named);
    });
    return finish(entries);
  }
  function entryOf(d, s, who, line) {
    return { date: d.date, dow: d.dow, start: s.start, end: s.end, guess: s.guess, label: s.label, who: who || '', line };
  }
  function finish(entries) {
    // the same shift twice (a message repeated): once
    const seen = new Set();
    const out = entries.filter((e) => { const k = [e.date || e.dow, e.start, e.end, e.who].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    const names = [...new Set(out.map((e) => e.who).filter(Boolean))];
    return { entries: out, names, personal: !names.length, needsWeek: out.some((e) => e.date == null) };
  }

  /** Words with boxes ({ text, x0, y0, x1, y1 }) → entries, as parseText. */
  function parseWords(words, opts) {
    opts = opts || {};
    const today = opts.today;
    const named = namedMap(opts.named);
    const W = (words || []).filter((w) => w && String(w.text || '').trim()).map((w) => ({ text: String(w.text).trim(), x0: +w.x0, x1: +w.x1, y0: +w.y0, y1: +w.y1, cx: (+w.x0 + +w.x1) / 2, cy: (+w.y0 + +w.y1) / 2 }));
    if (!W.length) return finish([]);
    const hs = W.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
    const h = hs[Math.floor(hs.length / 2)] || 10;
    // rows by height
    const rows = [];
    for (const w of W.slice().sort((a, b) => a.cy - b.cy)) {
      const r = rows.find((x) => Math.abs(x.cy - w.cy) < h * 0.6);
      if (r) { r.words.push(w); r.cy = (r.cy * (r.words.length - 1) + w.cy) / r.words.length; } else rows.push({ cy: w.cy, words: [w] });
    }
    // the words of a row read right to left (Hebrew), as one text, with each day found in it
    const rowDays = (r) => {
      const ws = r.words.slice().sort((a, b) => b.cx - a.cx);
      const out = [];
      ws.forEach((w, i) => {
        const pair = i + 1 < ws.length && Math.abs(ws[i + 1].x1 - w.x0) < h * 1.2 ? w.text + ' ' + ws[i + 1].text : null;
        const d = daysIn(w.text, today)[0] || (pair && daysIn(pair, today)[0] && /^(יום|ביום)$/.test(w.text) ? daysIn(pair, today)[0] : null);
        if (d && !out.some((o) => Math.abs(o.cx - w.cx) < h * 2.5)) out.push({ cx: w.cx, dow: d.dow, date: d.date, w });
      });
      return out;
    };
    const entries = [];
    const headIdx = rows.findIndex((r) => rowDays(r).length >= 3);
    if (headIdx >= 0) {
      // days across the top: a column per day (a row of dates right under the names fills them in)
      const cols = rowDays(rows[headIdx]);
      const nextRow = rows[headIdx + 1];
      // the date under a day's name; OCR often reads the "/" of a date as a 1 ("25110"): put back, it counts
      // only when it gives exactly the date of that column's day
      const dateFor = (c) => {
        const w = nextRow && nextRow.words.filter((x) => Math.abs(x.cx - c.cx) < h * 3).sort((a, b) => Math.abs(a.cx - c.cx) - Math.abs(b.cx - c.cx))[0];
        if (!w) return null;
        const d = daysIn(w.text, today)[0];
        if (d && d.date) return d;
        if (c.dow == null || !/^\d{3,6}$/.test(w.text)) return null;
        for (let i = 1; i < w.text.length - 1; i++) {
          if (w.text[i] !== '1') continue;
          const d2 = daysIn(w.text.slice(0, i) + '/' + w.text.slice(i + 1), today)[0];
          if (d2 && d2.date && d2.dow === c.dow) return d2;
        }
        return null;
      };
      let dated = 0;
      for (const c of cols) { const d = dateFor(c); if (d) { c.date = d.date; c.dow = d.dow; dated++; } }
      const gap = cols.length > 1 ? Math.min(...cols.slice(1).map((c, i) => Math.abs(c.cx - cols[i].cx))) : h * 8;
      const skip = new Set([headIdx]); if (dated >= 2) skip.add(headIdx + 1);
      rows.forEach((r, ri) => {
        if (skip.has(ri) || ri < headIdx) return;
        const cells = cols.map(() => []); const label = [];
        for (const w of r.words) {
          let best = -1, bd = Infinity;
          cols.forEach((c, i) => { const d = Math.abs(c.cx - w.cx); if (d < bd) { bd = d; best = i; } });
          if (bd <= gap * 0.55) cells[best].push(w); else label.push(w);
        }
        const who = nameIn(label.sort((a, b) => b.cx - a.cx).map((w) => w.text).join(' '), named);
        cells.forEach((ws, i) => {
          const text = ws.sort((a, b) => a.cx - b.cx).map((w) => w.text).join(' ');
          const s = shiftsIn(text, named).find((x) => !x.off);
          if (s) entries.push(entryOf(cols[i], s, who, ri));
        });
      });
      return finish(entries);
    }
    // days down the side: a row per day, the head row (above the first day) holds a column per person
    const dayRows = rows.map((r, i) => ({ i, d: rowDays(r)[0] })).filter((x) => x.d);
    if (dayRows.length >= 2) {
      const first = dayRows[0].i;
      const headRow = rows.slice(0, first).reverse().find((r) => r.words.some((w) => nameIn(w.text, named)));
      const people = headRow ? headRow.words.filter((w) => nameIn(w.text, named) && !daysIn(w.text, today).length).map((w) => ({ cx: w.cx, who: nameIn(w.text, named) })) : [];
      for (const { i, d } of dayRows) {
        const r = rows[i];
        const ws = r.words.filter((w) => w !== d.w);
        if (people.length) {
          const cells = people.map(() => []);
          for (const w of ws) { let best = 0, bd = Infinity; people.forEach((p, k) => { const dd = Math.abs(p.cx - w.cx); if (dd < bd) { bd = dd; best = k; } }); cells[best].push(w); }
          cells.forEach((cw, k) => { const s = shiftsIn(cw.sort((a, b) => a.cx - b.cx).map((w) => w.text).join(' '), named).find((x) => !x.off); if (s) entries.push(entryOf(d, s, people[k].who, i)); });
        } else {
          const s = shiftsIn(ws.sort((a, b) => a.cx - b.cx).map((w) => w.text).join(' '), named).find((x) => !x.off);
          if (s) entries.push(entryOf(d, s, '', i));
        }
      }
      return finish(entries);
    }
    // no table shape: read as text, a row a line
    return parseText(rows.map((r) => r.words.slice().sort((a, b) => b.cx - a.cx).map((w) => w.text).join(' ')).join('\n'), opts);
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[֑-ׇ'׳"״.]/g, '').replace(/\s+/g, ' ').trim();
  /** Is this name the person's? (any of their names, a whole word: "לי" is in "לי בטן", not in "לילך") */
  function isMine(who, mine) {
    const w = norm(who);
    if (!w) return false;
    return (mine || []).map(norm).filter(Boolean).some((n) => w === n || w.split(' ').includes(n) || n.split(' ').includes(w));
  }
  /** The person's entries: theirs by name, or all of them in a schedule with no names. */
  function pick(res, mine) {
    if (res.personal) return res.entries.slice();
    return res.entries.filter((e) => isMine(e.who, mine));
  }
  /** The Sunday of the week a schedule is most likely for: this week until Wednesday, then the next. */
  function weekStartFor(today) {
    const dow = dowOf(today);
    return dow <= 3 ? addDays(today, -dow) : addDays(today, 7 - dow);
  }
  /** Entries → rows with a date and both times: a day name lands in the week from weekStart; a single time
   * lasts lenMin. */
  function rowsOf(entries, weekStart, lenMin) {
    return entries.map((e) => {
      const date = e.date || (e.dow != null ? addDays(weekStart, e.dow) : null);
      if (!date || !e.start) return null;
      const end = e.end || fromMin(toMin(e.start) + (lenMin || 480));
      let len = toMin(end) - toMin(e.start); if (len <= 0) len += 1440;
      return { date, start: e.start, end, overnight: toMin(end) <= toMin(e.start), hours: len / 60, guess: e.end ? e.guess : 'single', label: e.label, who: e.who };
    }).filter(Boolean).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  }

  root.Schedule = { parseText, parseWords, pick, isMine, weekStartFor, rowsOf, NAMED };
})(typeof window !== 'undefined' ? window : globalThis);
