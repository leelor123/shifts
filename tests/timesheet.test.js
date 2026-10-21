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
