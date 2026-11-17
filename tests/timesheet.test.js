/* Reading an hours report (core/timesheet.js): dates, times, nights, hours only, headers and totals. */
const T = require('./t.js');
const TS = globalThis.Timesheet;
const today = '2026-10-21';
const one = (line) => TS.parse(line, { today }).rows[0];
T.section('hours report');
T.test('a clock system line: date, entry, exit, total', () => {
  const r = one('14/10/2026 08:00 16:30 8.50');
  T.eq(r.date, '2026-10-14'); T.eq(r.start, '08:00'); T.eq(r.end, '16:30'); T.near(r.hours, 8.5); T.ok(!r.overnight);
});
T.test('many date shapes', () => {
  T.eq(one('2026-10-03 09:00 13:00').date, '2026-10-03');
  T.eq(one('3.10.26 09:00-13:00').date, '2026-10-03');
  T.eq(one('03-10-2026 9:00 13:00').date, '2026-10-03');
  T.eq(one('יום ו׳ 3/10 09:00 13:00').date, '2026-10-03');
});
T.test('without a year: the latest such date that is not in the future', () => {
  const p = TS.parse('25/12 10:00 14:00\n5/10 10:00 14:00', { today });
  T.eq(p.rows[0].date, '2025-12-25'); T.eq(p.rows[1].date, '2026-10-05'); T.ok(p.guessedYear);
});
T.test('a night shift ends the next morning', () => {
  const r = one('15/10/2026 22:00 06:00');
  T.ok(r.overnight); T.near(r.hours, 8);
});
T.test('times with seconds, AM/PM, and dots in a range', () => {
  const a = one('10/10/2026 8:00:00 AM 4:30:00 PM');
  T.eq(a.start, '08:00'); T.eq(a.end, '16:30');
  const b = one('11/10/2026 08.30-16.00');
  T.eq(b.start, '08:30'); T.eq(b.end, '16:00');
});
T.test('one time and hours: it ends that many hours later', () => {
  const r = one('12/10/2026 כניסה 07:30 שעות 6.5');
  T.eq(r.start, '07:30'); T.eq(r.end, '14:00'); T.near(r.hours, 6.5);
});
T.test('hours only: kept, the start is asked', () => {
  const p = TS.parse('13/10/2026 7.5\n14/10/2026 6', { today });
  T.eq(p.rows.length, 2); T.eq(p.noStart, 2); T.eq(p.rows[0].start, null); T.near(p.rows[0].hours, 7.5);
  const t = TS.times(p.rows[0], '09:00', (k, hm) => Date.parse(k + 'T' + hm + ':00Z'));
  T.eq(t.end - t.start, 7.5 * 3600000);
});
T.test('headers, totals and lines without a date are left out; a number alone is never a date', () => {
  const p = TS.parse('תאריך,כניסה,יציאה,שעות\n14/10/2026,08:00,16:00,8\nסה"כ,,,8\nהערות: 8.5 שעות בממוצע\n8.5', { today });
  T.eq(p.rows.length, 1);
});
T.test('a report with the exit column first', () => {
  const p = TS.parse('תאריך | יציאה | כניסה\n14/10/2026 | 17:00 | 09:00', { today });
  T.eq(p.rows[0].start, '09:00'); T.eq(p.rows[0].end, '17:00');
});
T.test('an exit printed first, read by the day: no 15-hour nights', () => {
  const r = one('14/10/2026 17:00 08:00 out/in');
  T.eq(r.start, '08:00'); T.eq(r.end, '17:00');
});
T.test('nonsense is not a shift', () => {
  T.eq(TS.parse('31/02/2026 08:00 16:00\n14/10/2026 25:00 26:00\nשלום', { today }).rows.length, 0);
});

/* ---- a photo read as a table: words with their place on the page (parseWords) ---- */
// a table drawn right to left: each row's cells at the columns' x, the page tilted by `tilt` px per 1000px
function page(head, rows, o) {
  o = o || {};
  const xs = o.xs || head.map((_, i) => 1000 - i * 140), H = 30, tilt = o.tilt || 0, words = [];
  const add = (text, x, y) => { if (text == null || text === '') return; const w = String(text).length * 11; const dy = (x * tilt) / 1000; words.push({ text: String(text), x0: x - w / 2, x1: x + w / 2, y0: y + dy, y1: y + dy + H }); };
  (o.title || []).forEach((t, i) => add(t, 600, 10 + i * 40));
  head.forEach((h, i) => add(h, xs[i], 100));
  rows.forEach((r, ri) => r.forEach((c, i) => add(c, xs[i], 150 + ri * 50)));
  return TS.parseWords(words, { today });
}
// the shifts read as they are (the import offers them ticked)
const shifts = (p) => p.rows.filter((r) => !r.doubt).map((r) => `${r.date} ${r.start}-${r.end}`).join(' | ');
// the shifts with a doubt (a time worked out, not read): offered unticked, for the user to check
const unsure = (p) => p.rows.filter((r) => r.doubt).map((r) => `${r.date} ${r.start}-${r.end} ${r.doubt}`).join(' | ');
T.test('table: columns found by their names, the total and the notes are not shifts', () => {
  const p = page(['תאריך', 'יום', 'כניסה', 'יציאה', 'סה"כ', 'הערות'], [
    ['01/10/2026', 'ה׳', '08:00', '16:30', '8:30', ''],
    ['02/10/2026', 'ו׳', '', '', '', 'חופש'],
    ['04/10/2026', 'א׳', '22:00', '06:00', '8:00', ''],
    ['05/10/2026', 'ב׳', '09:15', '17:45', '8:30', 'חג'],
  ], { title: ['דו"ח נוכחות', 'סה"כ שעות: 25:00'] });
  T.eq(shifts(p), ['2026-10-01 08:00-16:30', '2026-10-04 22:00-06:00', '2026-10-05 09:15-17:45'].join(' | '));
  T.ok(p.rows[1].overnight);
});
T.test('table: the exit column printed before the entry, and a tilted photo', () => {
  const p = page(['תאריך', 'יציאה', 'כניסה'], [['1/10/26', '16:00', '08:00'], ['2/10/26', '17:10', '09:05'], ['5/10/26', '15:00', '07:30']], { tilt: 40 });
  T.eq(shifts(p), ['2026-10-01 08:00-16:00', '2026-10-02 09:05-17:10', '2026-10-05 07:30-15:00'].join(' | '));
});
T.test('table without names: the pair of columns whose difference is a shift, the total column left out', () => {
  const p = page(['', '', '', ''], [['3/10/2026', '07:00', '15:00', '8:00'], ['4/10/2026', '14:00', '22:30', '8:30'], ['5/10/2026', '06:45', '13:15', '6:30']]);
  T.eq(shifts(p), ['2026-10-03 07:00-15:00', '2026-10-04 14:00-22:30', '2026-10-05 06:45-13:15'].join(' | '));
});
T.test('table: a date the reader ran together (25110) and one it misread are put right from the rows around them', () => {
  const p = page(['תאריך', 'יום', 'כניסה', 'יציאה'], [
    ['24/10/2026', 'ש׳', '', ''], ['25110', 'א׳', '08:00', '16:00'], ['28/10/2026', 'ב׳', '08:00', '16:00'], ['27/10/2026', 'ג׳', '09:00', '17:00'],
  ]);
  T.eq(shifts(p), ['2026-10-25 08:00-16:00', '2026-10-26 08:00-16:00', '2026-10-27 09:00-17:00'].join(' | '));
});
T.test('table: an exit one digit away from the total is offered put right, for the user to check (never saved as read); no exit, no shift', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה', 'סה"כ'], [['1/10/2026', '14:06', '02:23', '8:17'], ['2/10/2026', '08:00', '16:00', '8:00'], ['3/10/2026', '08:00', '', '']]);
  T.eq(shifts(p), '2026-10-02 08:00-16:00');
  T.eq(unsure(p), '2026-10-01 14:06-22:23 total');
  T.eq(p.skipped, 1);
});
T.test('table: a split day\'s total is both shifts together, so neither time is "put right"', () => {
  const p = page(['תאריך', 'כניסה 1', 'יציאה 1', 'כניסה 2', 'יציאה 2', 'סה"כ'], [
    ['1/10/2026', '09:13', '15:34', '', '', '6:21'], ['2/10/2026', '14:02', '19:35', '21:08', '23:52', '8:17'],
    ['3/10/2026', '15:58', '23:52', '01:28', '03:28', '9:54'], ['4/10/2026', '07:03', '14:33', '', '', '7:30'],
  ]);
  T.eq(shifts(p), ['2026-10-01 09:13-15:34', '2026-10-02 14:02-19:35', '2026-10-02 21:08-23:52', '2026-10-03 15:58-23:52', '2026-10-03 01:28-03:28', '2026-10-04 07:03-14:33'].join(' | '));
});
T.test('a misread day letter does not drop a date its neighbours pin down', () => {
  const p = page(['תאריך', 'יום', 'כניסה', 'יציאה'], [
    ['01/09/2026', 'שלישי', '13:57', '20:54'], ['02/08/2026', 'חמישי', '14:14', '20:50'], ['03/09/2026', 'חמישי', '07:10', '13:35'], ['04/09/2026', 'שישי', '08:00', '12:00'],
  ]);
  T.eq(shifts(p), ['2026-09-01 13:57-20:54', '2026-09-02 14:14-20:50', '2026-09-03 07:10-13:35', '2026-09-04 08:00-12:00'].join(' | '));
});
T.test('an app\'s list: the date on one line, the hours under it', () => {
  const words = [];
  const add = (text, x, y) => words.push({ text, x0: x - 40, x1: x + 40, y0: y, y1: y + 30 });
  [['13', 'באוקטובר', '08:57', '17:12', 'שלישי,'], ['14', 'באוקטובר', '09:00', '15:30', 'רביעי,']].forEach(([d, m, a, b, day], i) => {
    const y = 100 + i * 160;
    add('יום', 1000, y); add(day, 920, y); add(d, 850, y); add(m, 760, y);
    add(a, 700, y + 60); add('-', 790, y + 60); add(b, 880, y + 60);
  });
  const p = TS.parseWords(words.concat([{ text: '2026', x0: 500, x1: 560, y0: 10, y1: 40 }]), { today });
  T.eq(shifts(p), ['2026-10-13 08:57-17:12', '2026-10-14 09:00-15:30'].join(' | '));
});
T.test('an app\'s cards: one time unreadable, the other from the card\'s hours (an entry or an exit, by where it sits)', () => {
  const words = [];
  const add = (text, x, y) => words.push({ text, x0: x - 40, x1: x + 40, y0: y, y1: y + 30 });
  [['4', '7.77', '08:51', '16:37'], ['8', '6.53', '07:03', '5'], ['12', '8.80', '', '18:00'], ['13', '5.37', '16:08', '21:30']].forEach(([d, h, a, b], i) => {
    const y = 100 + i * 160;
    add('יום', 1000, y); add(d, 900, y); add('באוקטובר', 800, y); add(h, 600, y); add('שעות', 520, y);
    if (a) add(a, 700, y + 60); if (b) add(b, 880, y + 60);
  });
  const p = TS.parseWords(words.concat([{ text: '2026', x0: 500, x1: 560, y0: 10, y1: 40 }]), { today });
  T.eq(shifts(p), ['2026-10-04 08:51-16:37', '2026-10-13 16:08-21:30'].join(' | '));
  T.eq(unsure(p), ['2026-10-08 07:03-13:35 exit-from-total', '2026-10-12 09:12-18:00 entry-from-total'].join(' | '));
});

T.section('a PDF report drawn letter by letter (the "HoursAnalysisInfo" report)');
T.test('a line with a column of standard hours and a total: the pair the total measures', () => {
  const r = one('01/10 ה 8:00 8:55 16:12 7:17 קרית אונו');
  T.eq(`${r.start}-${r.end}`, '08:55-16:12');
  const f = one('02/10 ערב 2:00 9:04 14:08 5:04');
  T.eq(`${f.start}-${f.end}`, '09:04-14:08');
});
// pdf.js items as such a report gives them: each letter on its own, in visual order (left to right), letter spaced
function glyphItems(text, x, y, h, step) {
  return [...text].map((c, i) => ({ str: c, transform: [h, 0, 0, h, x + i * step, y], width: step * 0.6, height: h }));
}
T.test('letters drawn one by one become words again: times, a date with a space, Hebrew right to left', () => {
  const items = [].concat(
    glyphItems('הסינכ', 300, 700, 10, 8), // כניסה drawn in visual order
    glyphItems('8:55', 300, 680, 10, 8), glyphItems('16:12', 200, 680, 10, 8),
    glyphItems('ה', 500, 680, 10, 8), glyphItems('01/', 512, 680, 10, 8), glyphItems('10', 540, 680, 10, 8));
  const words = TS.wordsFromPdfItems(items).map((w) => w.text);
  T.ok(words.includes('כניסה'), 'Hebrew read right to left: ' + words.join(' '));
  T.ok(words.includes('8:55') && words.includes('16:12'), 'times whole: ' + words.join(' '));
  T.ok(words.includes('01/10') && words.includes('ה'), 'the date whole, the day letter apart: ' + words.join(' '));
  // spread out inside one item ("8 : 0 0")
  T.eq(TS.wordsFromPdfItems([{ str: '8 : 0 0', transform: [10, 0, 0, 10, 50, 50], width: 40, height: 10 }])[0].text, '8:00');
});
T.test('dates drawn the other way round (10/01, 10/02 … in a monthly report) are read as October', () => {
  const words = [];
  const add = (text, x, y) => words.push({ text, x0: x, x1: x + 50, y0: y, y1: y + 30 });
  add('תאריך', 900, 40); add('כניסה', 700, 40); add('יציאה', 500, 40);
  [['10/01', '08:55', '16:12'], ['10/02', '09:04', '14:08'], ['10/05', '16:51', '23:37'], ['10/08', '15:54', '21:55'], ['10/09', '08:55', '15:01']]
    .forEach(([d, a, b], i) => { const y = 100 + i * 50; add(d, 900, y); add(a, 700, y); add(b, 500, y); });
  const p = TS.parseWords(words.concat([{ text: '2026', x0: 300, x1: 360, y0: 10, y1: 30 }]), { today });
  T.eq(shifts(p), '2026-10-01 08:55-16:12 | 2026-10-02 09:04-14:08 | 2026-10-05 16:51-23:37 | 2026-10-08 15:54-21:55 | 2026-10-09 08:55-15:01');
});

/* ---- the reader's guards (2026-11 accuracy campaign): each a mechanism that once made a shift that is not in the
 * report, on words as the picture reader gives them. A shift the reader is not sure of goes to `unsure`, never
 * to `rows` (rows are saved as they are) ---- */
T.section('hours report photo: no shift that is not in the report');
const days10 = (n, from) => Array.from({ length: n }, (_, i) => `${String((from || 1) + i).padStart(2, '0')}/10/2026`);
T.test('a time in the standard-hours column never pairs with a lone entry (a missed clock-out)', () => {
  const d = days10(6);
  const p = page(['תאריך', 'כניסה', 'יציאה', 'תקן', 'סה"כ'], [
    [d[0], '08:00', '16:10', '08:36', '8:10'], [d[1], '07:06', '', '08:36', ''], [d[2], '09:00', '17:00', '08:36', '8:00'],
    [d[3], '08:12', '16:30', '08:36', '8:18'], [d[4], '', '16:04', '08:36', ''], [d[5], '14:00', '22:00', '08:36', '8:00'],
  ]);
  T.eq(shifts(p), '2026-10-01 08:00-16:10 | 2026-10-03 09:00-17:00 | 2026-10-04 08:12-16:30 | 2026-10-06 14:00-22:00');
  T.eq(unsure(p), '');
});
T.test('in a table, a day off does not lend its date to the next row whose date was not read', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה'], [
    ['01/10/2026', '08:00', '16:00'], ['02/10/2026', '09:00', '17:00'], ['03/10/2026', '', ''], ['18', '08:10', '14:44'],
    ['05/10/2026', '07:00', '15:00'], ['06/10/2026', '08:00', '16:30'],
  ]);
  T.ok(!/2026-10-03/.test(shifts(p)), 'the day off took the shift: ' + shifts(p));
});
T.test('an app\'s cards with the date UNDER the hours: each card its own date', () => {
  const words = [];
  const add = (text, x, y) => words.push({ text, x0: x - 40, x1: x + 40, y0: y, y1: y + 30 });
  [['01/10', '08:56', '16:43'], ['02/10', '09:08', '15:30'], ['03/10', '08:05', '16:28'], ['04/10', '15:55', '23:39']].forEach(([d, a, b], i) => {
    const y = 100 + i * 140;
    add('יום', 900, y); add(a, 700, y + 30); add(b, 560, y + 30); add(d, 900, y + 60);
  });
  const p = TS.parseWords(words.concat([{ text: '2026', x0: 500, x1: 560, y0: 10, y1: 40 }]), { today });
  T.eq(shifts(p), '2026-10-01 08:56-16:43 | 2026-10-02 09:08-15:30 | 2026-10-03 08:05-16:28 | 2026-10-04 15:55-23:39');
});
T.test('a date cut at the picture\'s edge ("01-10-20" of 01-10-2026) is not in 2020', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה'], [['01-10-20', '08:00', '16:00'], ['02-10-20', '09:00', '17:00'], ['04-10-20', '07:30', '15:00'], ['05-10-20', '08:00', '12:00']],
    { title: ['01-10-2026', '31-10-2026'] });
  T.eq(shifts(p), '2026-10-01 08:00-16:00 | 2026-10-02 09:00-17:00 | 2026-10-04 07:30-15:00 | 2026-10-05 08:00-12:00');
});
T.test('a blurred clock report whose exits were not read: the total and the standard hours make no shift', () => {
  const p = page(['תאריך', 'כניסה', '', 'תקן', ''], [
    ['01/10/2026', '09:14', '', '08:36', '8:56'], ['02/10/2026', '16:01', '', '08:36', '6:49'], ['04/10/2026', '15:55', '', '08:36', '7:15'],
    ['05/10/2026', '14:04', '', '08:36', '7:49'], ['06/10/2026', '08:57', '', '08:36', '5:28'], ['07/10/2026', '15:50', '', '08:36', '5:57'],
  ]);
  T.eq(shifts(p), '');
});
T.test('an entry read an hour off is not taken for an hour\'s break the report never takes', () => {
  const d = days10(6);
  const p = page(['תאריך', 'כניסה', 'יציאה', 'סה"כ'], [
    [d[0], '08:13', '15:15', '6:02'], [d[1], '09:13', '16:45', '7:32'], [d[2], '14:13', '22:47', '8:34'],
    [d[3], '07:03', '12:55', '5:52'], [d[4], '08:05', '14:46', '6:41'], [d[5], '14:09', '23:03', '8:54'],
  ]);
  T.ok(!/2026-10-01/.test(shifts(p)), 'saved as read: ' + shifts(p));
  T.eq(unsure(p).slice(0, 10), '2026-10-01');
});
T.test('a report that does take an hour\'s break off its totals is read as it is', () => {
  const d = days10(4);
  const p = page(['תאריך', 'כניסה', 'יציאה', 'סה"כ'], [[d[0], '08:00', '17:00', '8:00'], [d[1], '09:00', '18:00', '8:00'], [d[2], '07:00', '16:30', '8:30'], [d[3], '08:00', '12:00', '4:00']]);
  T.eq(shifts(p), '2026-10-01 08:00-17:00 | 2026-10-02 09:00-18:00 | 2026-10-03 07:00-16:30 | 2026-10-04 08:00-12:00');
});
T.test('where many dates were lost, a day off still lends its date to no row (the row pitch is every row\'s)', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה'], [
    ['01/10/2026', '08:00', '16:00'], ['', '09:00', '17:00'], ['', '08:30', '16:30'], ['04/10/2026', '', ''], ['', '07:00', '15:00'],
    ['', '08:00', '14:00'], ['07/10/2026', '09:00', '17:00'], ['', '08:00', '16:00'], ['', '10:00', '18:00'], ['10/10/2026', '07:30', '15:30'],
  ]);
  T.ok(!/2026-10-04/.test(shifts(p)), 'the day off took the next row\'s shift: ' + shifts(p));
});
T.test('two months side by side on one page: each table read apart, every row its own date', () => {
  const words = [];
  const add = (text, x, y) => { const w = String(text).length * 11; words.push({ text, x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + 30 }); };
  [[1400, '09'], [700, '10']].forEach(([x0, m]) => {
    ['תאריך', 'כניסה', 'יציאה', 'סה"כ'].forEach((h, i) => add(h, x0 - i * 140, 100));
    [['01', '08:00', '16:00', '8:00'], ['02', '09:00', '15:00', '6:00'], ['03', '16:00', '23:00', '7:00'], ['06', '08:30', '16:30', '8:00']].forEach((r, ri) =>
      [`${r[0]}/${m}/2026`, r[1], r[2], r[3]].forEach((c, i) => add(c, x0 - i * 140, 150 + ri * 50)));
  });
  const p = TS.parseWords(words, { today });
  T.eq(shifts(p).split(' | ').sort().join(' | '), ['2026-09-01 08:00-16:00', '2026-09-02 09:00-15:00', '2026-09-03 16:00-23:00', '2026-09-06 08:30-16:30',
    '2026-10-01 08:00-16:00', '2026-10-02 09:00-15:00', '2026-10-03 16:00-23:00', '2026-10-06 08:30-16:30'].join(' | '));
});
T.test('a year no report has (2045, read from a time) is no date and sets no year', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה'], [['4/10', '07:00', '14:00'], ['5/10', '08:00', '15:30'], ['6/10', '09:00', '17:00'], ['2045', '14:00', '']]);
  T.eq(shifts(p), '2026-10-04 07:00-14:00 | 2026-10-05 08:00-15:30 | 2026-10-06 09:00-17:00');
});
T.test('entry/exit columns that make few likely shifts: nothing saved as sure', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה'], [['01/10/2026', '14:00', '01:00'], ['02/10/2026', '07:45', '15:50'], ['03/10/2026', '23:50', '16:15'], ['04/10/2026', '20:00', '14:00'], ['05/10/2026', '01:00', '00:45']]);
  T.eq(shifts(p), '');
});
T.test('the page names its month and no date read is of it (4/1 read for 4/9): the dates are unsure', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה'], [['4/1', '07:00', '14:00'], ['5/1', '07:45', '15:50'], ['6/1', '09:00', '17:00']], { title: ['ספטמבר', '2026'] });
  T.eq(shifts(p), '');
  T.ok(/date/.test(unsure(p)), 'not offered as unsure: ' + unsure(p));
});
T.test('a day worked out from the rows around it: sure in a report of every day with something in its date cell; an empty date cell may be a second line of the day before', () => {
  const daily = page(['תאריך', 'כניסה', 'יציאה'], [
    ['01/10/2026', '08:00', '16:00'], ['02/10/2026', '09:00', '17:00'], ['03/10/2026', '08:00', '12:00'], ['ii', '08:10', '14:40'],
    ['05/10/2026', '07:00', '15:00'], ['06/10/2026', '08:00', '16:30'],
  ]);
  T.ok(/2026-10-04 08:10-14:40/.test(shifts(daily)), 'a lost date in a daily report: ' + shifts(daily));
  const second = page(['תאריך', 'כניסה', 'יציאה'], [['02/10/2026', '08:00', '12:00'], ['03/10/2026', '08:00', '12:00'], ['', '13:00', '17:00'], ['05/10/2026', '09:00', '17:00'], ['06/10/2026', '09:00', '13:00']]);
  T.ok(!/13:00-17:00/.test(shifts(second)), 'a second line taken for the next day: ' + shifts(second));
  T.ok(/2026-10-04 13:00-17:00 date/.test(unsure(second)), 'offered for checking: ' + unsure(second));
});
T.test('a shift of more than 16 hours is offered for checking, never saved as read', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה'], [['01/10/2026', '06:00', '23:00'], ['02/10/2026', '08:00', '16:00'], ['03/10/2026', '09:00', '17:00'], ['04/10/2026', '07:00', '15:00'], ['05/10/2026', '14:00', '22:00']]);
  T.eq(shifts(p), '2026-10-02 08:00-16:00 | 2026-10-03 09:00-17:00 | 2026-10-04 07:00-15:00 | 2026-10-05 14:00-22:00');
  T.eq(unsure(p), '2026-10-01 06:00-23:00 long');
});
T.test('a total rounded to quarter hours by the employer (8:00 for 8:07) agrees with the times', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה', 'סה"כ'], [['01/10/2026', '08:00', '16:00', '8.00'], ['02/10/2026', '08:00', '16:07', '8.00'], ['03/10/2026', '09:00', '17:00', '8.00'], ['04/10/2026', '08:00', '15:30', '7.50'], ['05/10/2026', '08:03', '16:00', '7.75']]);
  T.eq(shifts(p), '2026-10-01 08:00-16:00 | 2026-10-02 08:00-16:07 | 2026-10-03 09:00-17:00 | 2026-10-04 08:00-15:30 | 2026-10-05 08:03-16:00');
  // ...and an hour off is still caught
  const q = page(['תאריך', 'כניסה', 'יציאה', 'סה"כ'], [['01/10/2026', '08:00', '17:00', '8:00'], ['02/10/2026', '08:00', '16:00', '8:00'], ['03/10/2026', '09:00', '17:00', '8:00'], ['04/10/2026', '08:00', '15:30', '7:30']]);
  T.ok(!/2026-10-01/.test(shifts(q)), 'an hour off saved: ' + shifts(q));
});
T.test('dotted times (8.30 / 16.00) in columns named כניסה / יציאה are times', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה'], [['01/10/2026', '8.30', '16.00'], ['02/10/2026', '7.45', '15.15'], ['03/10/2026', '9.00', '17.30']]);
  T.eq(shifts(p), '2026-10-01 08:30-16:00 | 2026-10-02 07:45-15:15 | 2026-10-03 09:00-17:30');
});
T.section('hours report lines (text, a PDF)');
T.test('a line with a break and a total: the pair the total measures after the break, the entry and exit first', () => {
  const r = one('01/10/2026 08:00 16:30 00:30 08:00');
  T.eq(`${r.start}-${r.end}`, '08:00-16:30');
  const s = one('01/10/2026 08:36 08:02 16:40 8:38');
  T.eq(`${s.start}-${s.end}`, '08:02-16:40');
});
T.test('24:00 is the end of the day', () => {
  const r = one('01/10/2026 16:00 24:00');
  T.eq(`${r.start}-${r.end}`, '16:00-00:00'); T.ok(r.overnight); T.near(r.hours, 8);
});
T.test('the nights the clock moves: a night shift ends at the exit the report prints', () => {
  for (const [d, s, e, real] of [['2026-10-24', '22:00', '06:00', 9], ['2026-03-26', '22:00', '06:00', 7], ['2026-11-10', '22:00', '06:00', 8], ['2026-10-25', '00:30', '08:00', 8.5]]) {
    const t = TS.times(TS.parse(`${d} ${s} ${e}`, { today: '2026-12-01' }).rows[0], null, U.toEpoch);
    const end = new Date(t.end);
    T.eq(`${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`, e, d);
    T.near((t.end - t.start) / 3600000, real, 0.01, d);
  }
});

/* ---- the picture before it is read (app/docread.js): its rules that need no browser ---- */
T.section('hours report photo: the picture');
require(require('path').join(__dirname, '..', 'src', 'app', 'docread.js'));
const DR = globalThis.DocRead.pure;
// a grey page of lines of words: each line at its angle (degrees), the top half at `top`, the bottom half at `bottom`
function inkPage(top, bottom) {
  const W = 800, H = 1000, px = new Uint8Array(W * H).fill(255);
  for (let k = 0; k < 22; k++) {
    const y0 = 40 + k * 42, deg = y0 < H / 2 ? top : bottom, t = Math.tan((deg * Math.PI) / 180);
    for (let x = 40; x < W - 40; x++) {
      if (x % 80 > 60) continue; // the gap between words
      const y = Math.round(y0 + (x - W / 2) * t);
      for (let d = 0; d < 8; d++) if (y + d >= 0 && y + d < H) px[(y + d) * W + x] = 20;
    }
  }
  return [px, W, H];
}
T.test('a page photographed at 8° is turned straight; 2° is left to the table reader', () => {
  T.near(DR.skewOf(...inkPage(8, 8)), 8, 0.5);
  T.near(DR.skewOf(...inkPage(-11, -11)), -11, 0.5);
  T.eq(DR.skewOf(...inkPage(2, 2)), 0);
  T.eq(DR.skewOf(...inkPage(0, 0)), 0);
});
T.test('a page seen from the side (its lines fan out) is not turned by one wrong angle, unless all of it is too steep for the table reader', () => {
  T.eq(DR.skewOf(...inkPage(1, 9)), 0);
  const steep = DR.skewOf(...inkPage(12, 16));
  T.ok(steep >= 13 && steep <= 15, 'steep fan turned by its mean: ' + steep);
});
T.test('a PNG with no background: dark letters stay dark on white, light letters become dark on white', () => {
  const px = new Uint8ClampedArray(20 * 20 * 4); // all see-through
  for (let i = 0; i < 40; i++) px.set([0, 0, 0, 255], (i * 7) * 4); // dark ink
  const g = DR.grayOf(px);
  T.ok(g[0] < 60 && g[1] > 200, `dark ink ${g[0]}, background ${g[1]}`);
  const lt = new Uint8ClampedArray(20 * 20 * 4);
  for (let i = 0; i < 40; i++) lt.set([245, 245, 245, 255], (i * 7) * 4); // light ink
  const h = DR.grayOf(lt);
  T.ok(h[0] < 60 && h[1] > 200, `light ink ${h[0]}, background ${h[1]}`);
});
T.test('which way up: only valid times and dates count (upside down, 08:00 reads "00:80")', () => {
  T.eq(DR.wholes(['00:80', '08:00', '31/13', '12/11', '16:30-00:30', '0E:91', '24:61'].map((text) => ({ text }))), 3);
});

T.section('hours report photo: more guards');
T.test('a column the header names סה"כ is never paired as an entry or an exit (a padded total beside the entry)', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה', 'תקן', 'סה"כ'], [
    ['01/10/2026', '07:50', '', '08:00', '06:26'], ['02/10/2026', '16:07', '', '08:00', '06:41'], ['04/10/2026', '09:12', '', '08:00', '08:18'],
    ['05/10/2026', '14:00', '', '08:00', '07:31'], ['06/10/2026', '16:00', '', '08:00', '06:39'], ['07/10/2026', '09:06', '', '08:00', '06:20'],
  ]);
  T.eq(p.rows.length, 0, 'shifts made of the entry and the total: ' + shifts(p) + ' / ' + unsure(p));
});
T.test('a year misread in one row (2024 in a report of 2026) takes the report\'s year', () => {
  const d = (n) => `${String(n).padStart(2, '0')}/10/2026`;
  const p = page(['תאריך', 'כניסה', 'יציאה'], [['01/10/2024', '08:00', '16:00'], [d(2), '09:00', '17:00'], [d(4), '07:00', '15:00'], [d(5), '08:00', '16:00'], [d(6), '14:00', '22:00']], { title: ['2026'] });
  T.ok(!/2024/.test(p.rows.map((r) => r.date).join(' ')), 'a shift two years back: ' + shifts(p));
  T.ok(/2026-10-01 08:00-16:00/.test(shifts(p)), 'its own date: ' + shifts(p));
});
T.test('one date on two rows that name different weekdays: the second is misread, the day between is offered', () => {
  const p = page(['תאריך', 'יום', 'כניסה', 'יציאה'], [
    ['16/09/2026', 'רביעי', '08:00', '16:00'], ['17/09/2026', 'חמישי', '09:00', '17:00'], ['20/09/2026', 'ראשון', '16:11', '00:47'],
    ['20/09/2026', 'שני', '15:55', '21:02'], ['22/09/2026', 'שלישי', '08:00', '14:00'], ['23/09/2026', 'רביעי', '07:00', '15:00'],
  ]);
  T.ok(!/2026-09-20 15:55/.test(shifts(p) + unsure(p)), 'kept on the 20th: ' + shifts(p));
  // (a report of worked days only: the day between is offered for checking)
  T.ok(/2026-09-21 15:55-21:02/.test(shifts(p) + ' ' + unsure(p)), 'not on its day: ' + unsure(p));
});
T.test('a date put right stays near its neighbours (a cut "011" is not 01/01 before 02/10)', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה'], [['011', '07:11', '14:11'], ['02/10/2026', '08:59', '17:37'], ['03/10/2026', '08:10', '16:55'], ['04/10/2026', '09:05', '14:43'], ['05/10/2026', '09:06', '16:26']]);
  T.ok(!/2026-01-01/.test(p.rows.map((r) => r.date).join(' ')), 'months away: ' + shifts(p));
});
T.test('hours paid that are not the span (a break taken off) are kept as paid, on a photo and on a line', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה', 'שעות'], [['01/10/2026', '08:00', '17:00', '8.25'], ['02/10/2026', '08:00', '16:30', '7.75'], ['03/10/2026', '09:00', '17:00', '8.00'], ['04/10/2026', '07:00', '16:00', '8.25']]);
  T.eq(p.rows.map((r) => r.paid || '-').join(' '), '8.25 7.75 - 8.25');
  const t = TS.parse('14/10/2026 08:00 17:00 8.25', { today });
  T.eq(t.rows[0].paid, 8.25); T.near(t.rows[0].hours, 9);
});
T.test('text lines: an entry with no exit is counted as left out', () => {
  const t = TS.parse('13/10/2026 08:00\n14/10/2026 08:00 16:00\n15/10/2026 09:00 17:00', { today });
  T.eq(t.rows.length, 2); T.eq(t.skipped, 1);
});
