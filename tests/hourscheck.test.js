/* The employer's hours report against the person's own shifts (src/core/hourscheck.js). */
const T = require('./t.js');
const { HoursCheck: H } = globalThis;

const rep = (date, start, end, hours) => ({ date, start: start || null, end: end || null, hours: hours != null ? hours : null });
let n = 0;
const mine = (date, start, end, hours) => {
  const [a, b] = [start, end].map((t) => +t.slice(0, 2) * 60 + +t.slice(3));
  const span = ((b - a + 1440) % 1440 || 1440) / 60;
  return { id: 'm' + (++n), date, start, end, span, hours: hours != null ? hours : span };
};
const types = (r) => r.items.map((x) => x.date.slice(8) + ':' + x.type).join(' ');

T.section('the hours report against my shifts');
T.test('the same shifts: all ok', () => {
  const r = H.compare([rep('2026-10-01', '08:00', '16:00', 8), rep('2026-10-02', '16:00', '23:00', 7)],
    [mine('2026-10-01', '08:00', '16:00'), mine('2026-10-02', '16:00', '23:00')]);
  T.eq(r.ok, 2); T.eq(r.diff + r.missingEmp + r.missingMine, 0);
});
T.test('up to 10 minutes is the same; 11 is a difference', () => {
  const r = H.compare([rep('2026-10-01', '08:10', '16:00'), rep('2026-10-02', '08:11', '16:00')],
    [mine('2026-10-01', '08:00', '16:00'), mine('2026-10-02', '08:00', '16:00')]);
  T.eq(types(r), '01:ok 02:diff');
  const d = r.items[1];
  T.eq(d.dStart, 11); T.eq(d.dEnd, 0);
});
T.test('a shift the report lacks, and a report row I lack', () => {
  const r = H.compare([rep('2026-10-01', '08:00', '16:00'), rep('2026-10-05', '09:00', '13:00')],
    [mine('2026-10-01', '08:00', '16:00'), mine('2026-10-03', '10:00', '18:00')]);
  T.eq(types(r), '01:ok 03:missingEmp 05:missingMine');
});
T.test('two shifts on one day pair with the nearest rows', () => {
  const r = H.compare([rep('2026-10-01', '15:00', '20:00'), rep('2026-10-01', '08:00', '12:30')],
    [mine('2026-10-01', '08:00', '12:00'), mine('2026-10-01', '15:00', '20:00')]);
  T.eq(r.ok, 1); T.eq(r.diff, 1);
  const d = r.items.find((x) => x.type === 'diff');
  T.eq(d.mine.start, '08:00'); T.eq(d.dEnd, 30);
});
T.test('a night shift: the end the next morning; a report that dates it by the next day still pairs', () => {
  const r = H.compare([rep('2026-10-01', '22:00', '06:00')], [mine('2026-10-01', '22:00', '06:00')]);
  T.eq(types(r), '01:ok');
  const r2 = H.compare([rep('2026-10-02', '00:00', '06:00')], [mine('2026-10-01', '23:55', '06:00')]);
  T.eq(r2.ok, 1);
});
T.test('a report that gives hours only: compared with the paid hours or the span', () => {
  const m = mine('2026-10-01', '08:00', '16:30', 8); // 8.5 span, 8 paid (a break)
  T.eq(types(H.compare([rep('2026-10-01', null, null, 8)], [m])), '01:ok');
  T.eq(types(H.compare([rep('2026-10-01', null, null, 8.5)], [m])), '01:ok');
  const r = H.compare([rep('2026-10-01', null, null, 7)], [m]);
  T.eq(types(r), '01:diff'); T.eq(r.items[0].dHours, -1);
});
T.test('only the period counts', () => {
  const r = H.compare([rep('2026-10-01', '08:00', '16:00')], [mine('2026-09-30', '08:00', '16:00'), mine('2026-10-01', '08:00', '16:00')], { from: '2026-10-01', to: '2026-10-31' });
  T.eq(types(r), '01:ok');
});
T.test('far apart on the same day are two different shifts', () => {
  const r = H.compare([rep('2026-10-01', '18:00', '23:00')], [mine('2026-10-01', '06:00', '11:00')]);
  T.eq(r.missingEmp, 1); T.eq(r.missingMine, 1);
});
T.test('empty and broken input', () => {
  T.eq(H.compare(null, null).items.length, 0);
  T.eq(H.compare([null, rep('2026-10-01', 'x', null, null)], [null]).missingMine, 1);
});

T.section('the message to the employer');
T.test('lists only what the report lacks or has differently, politely', () => {
  const r = H.compare([rep('2026-10-01', '08:30', '16:00'), rep('2026-10-05', '09:00', '13:00'), rep('2026-10-06', '08:00', '16:00')],
    [mine('2026-10-01', '08:00', '16:00'), mine('2026-10-03', '10:00', '18:00'), mine('2026-10-06', '08:00', '16:00')]);
  const t = H.letter(r.items, 'אוקטובר 2026');
  T.ok(t.startsWith('שלום,'));
  T.ok(t.includes('אוקטובר 2026'));
  T.ok(t.includes('\u206610:00\u2060–\u206018:00\u2069'), 'the missing shift');
  T.ok(t.includes('בדוח \u206608:30\u2060–\u206016:00\u2069, ואצלי \u206608:00\u2060–\u206016:00\u2069'), 'the different hours');
  T.ok(!t.includes('09:00'), 'a row only the report has is not asked about');
  T.ok(!t.includes('\u2014'), 'no em dash');
  T.eq(t.split('\n').filter((l) => l.startsWith('•')).length, 2);
});
T.test('nothing to fix: no message', () => {
  T.eq(H.letter(H.compare([rep('2026-10-01', '08:00', '16:00')], [mine('2026-10-01', '08:00', '16:00')]).items), '');
  T.eq(H.letter([]), '');
});
