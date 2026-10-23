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
const shifts = (p) => p.rows.map((r) => `${r.date} ${r.start}-${r.end}`).join(' | ');
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
T.test('table: an exit read one digit wrong is put right from the total; no exit, no shift', () => {
  const p = page(['תאריך', 'כניסה', 'יציאה', 'סה"כ'], [['1/10/2026', '14:06', '02:23', '8:17'], ['2/10/2026', '08:00', '16:00', '8:00'], ['3/10/2026', '08:00', '', '']]);
  T.eq(shifts(p), ['2026-10-01 14:06-22:23', '2026-10-02 08:00-16:00'].join(' | '));
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
  T.eq(shifts(p), ['2026-10-04 08:51-16:37', '2026-10-08 07:03-13:35', '2026-10-12 09:12-18:00', '2026-10-13 16:08-21:30'].join(' | '));
});
