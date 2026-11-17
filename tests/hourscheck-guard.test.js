/* The hours check (src/core/hourscheck.js): guards for the readers campaign fixes (Nov 2026) and property tests.
 * Each guard fails on the code before its fix. Loaded from hourscheck.test.js. */
const T = require('./t.js');
const { HoursCheck: H } = globalThis;

const rep = (date, start, end, hours, more) => Object.assign({ date, start: start || null, end: end || null, hours: hours != null ? hours : null }, more || {});
let n = 0;
const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
const mine = (date, start, end, hours) => {
  const span = ((toMin(end) - toMin(start) + 1440) % 1440 || 1440) / 60;
  return { id: 'g' + (++n), date, start, end, span, hours: hours != null ? hours : span };
};
const types = (r) => r.items.map((x) => x.date.slice(8) + ':' + x.type).join(' ');
const hm = (m) => String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0');
const day = (d) => '2026-10-' + String(d).padStart(2, '0');
const OCT = { from: '2026-10-01', to: '2026-10-31' };
// workdays of October 2026 (Sunday to Thursday)
const workdays = [];
for (let d = 1; d <= 31; d++) if (new Date(Date.UTC(2026, 9, d)).getUTCDay() <= 4) workdays.push(day(d));

T.section('hours check: how rows and shifts meet (readers campaign)');
T.test('9 minutes late in and 9 early out is 18 minutes less: a difference', () => {
  const r = H.compare([rep(day(5), '08:09', '15:51')], [mine(day(5), '08:00', '16:00')]);
  T.eq(types(r), '05:diff');
});
T.test('ten minutes shaved off every day is never "the same"; noise that cancels is', () => {
  const report = workdays.map((d) => rep(d, '08:00', '15:50'));
  const mm = workdays.map((d) => mine(d, '08:00', '16:00'));
  const r = H.compare(report, mm, OCT);
  T.eq(r.ok, 0); T.eq(r.diff, workdays.length); T.ok(r.items.every((x) => x.small));
  T.eq(r.drift, workdays.length * 10);
  const noise = H.compare(workdays.map((d, i) => rep(d, '08:00', i % 2 ? '15:56' : '16:04')), workdays.map((d) => mine(d, '08:00', '16:00')), OCT);
  T.eq(noise.diff, 0);
  // in my favour (the report longer) is never a finding
  T.eq(H.compare(workdays.map((d) => rep(d, '08:00', '16:08')), workdays.map((d) => mine(d, '08:00', '16:00')), OCT).diff, 0);
});
T.test('a night the report splits at midnight (00:00 or 23:59) is my one night', () => {
  for (const cut of ['00:00', '23:59']) {
    const r = H.compare([rep(day(5), '22:00', cut), rep(day(6), '00:00', '06:00')], [mine(day(5), '22:00', '06:00')], OCT);
    T.eq(types(r), '05:ok', cut);
  }
  const short = H.compare([rep(day(5), '22:00', '00:00'), rep(day(6), '00:00', '05:00')], [mine(day(5), '22:00', '06:00')], OCT);
  T.eq(types(short), '05:diff'); T.eq(short.items[0].dEnd, -60);
});
T.test('my night in two shifts and one report row: the same', () => {
  const r = H.compare([rep(day(5), '22:00', '06:00')], [mine(day(5), '22:00', '00:00'), mine(day(6), '00:00', '06:00')], OCT);
  T.eq(r.diff + r.missingEmp + r.missingMine, 0);
});
T.test('lunch punched out: two rows inside my one shift', () => {
  const unpaid = H.compare([rep(day(13), '08:00', '12:00'), rep(day(13), '13:00', '17:00')], [mine(day(13), '08:00', '17:00', 8)], OCT);
  T.eq(types(unpaid), '13:ok');
  const paid = H.compare([rep(day(13), '08:00', '12:00'), rep(day(13), '13:00', '17:00')], [mine(day(13), '08:00', '17:00', 9)], OCT);
  T.eq(types(paid), '13:diff'); T.eq(paid.items[0].gap, 60); T.eq(paid.items[0].short, 60);
});
T.test('two shifts of mine inside one report row: the same', () => {
  const r = H.compare([rep(day(7), '08:00', '20:00')], [mine(day(7), '08:00', '13:00'), mine(day(7), '14:00', '20:00')], OCT);
  T.eq(r.diff + r.missingEmp + r.missingMine, 0);
});
T.test('an hours-only row is the day\'s total when I have two shifts that day', () => {
  const two = [mine(day(7), '08:00', '12:00'), mine(day(7), '16:00', '20:00')];
  T.eq(types(H.compare([rep(day(7), null, null, 8)], two, OCT)), '07:ok');
  const r = H.compare([rep(day(7), null, null, 7)], [mine(day(7), '08:00', '12:00'), mine(day(7), '16:00', '20:00')], OCT);
  T.eq(types(r), '07:diff'); T.eq(r.items[0].dHours, -1);
});
T.test('the same shift written twice in my records counts once', () => {
  const r = H.compare([rep(day(13), '08:00', '16:00')], [mine(day(13), '08:00', '16:00'), mine(day(13), '08:00', '16:00')], OCT);
  T.eq(types(r), '13:ok');
});
T.test('the period\'s edges: a night over the last or the first midnight', () => {
  // the report ends at midnight on its last day, my night goes on into the next month
  const end = H.compare([rep(day(31), '22:00', '00:00')], [mine(day(31), '22:00', '06:00')], OCT);
  T.eq(types(end), '31:ok');
  const end2 = H.compare([rep(day(31), '22:00', '23:59')], [mine(day(31), '22:00', '06:00')], OCT);
  T.eq(types(end2), '31:ok');
  // the report starts at midnight on its first day: the night began in the month before (the caller gives it)
  const start = H.compare([rep(day(1), '00:00', '06:00')], [mine('2026-09-30', '22:00', '06:00')], OCT);
  T.eq(types(start), '01:ok');
  // a night of the month before is not "missing in the report" when the report has nothing at that midnight
  T.eq(H.compare([rep(day(2), '08:00', '16:00')], [mine('2026-09-30', '22:00', '06:00'), mine(day(2), '08:00', '16:00')], OCT).missingEmp, 0);
});
T.test('a row whose exit was not read: counted as unread, its side shows the start only', () => {
  const r = H.compare([rep(day(5), '09:00')], [mine(day(5), '09:00', '17:00')]);
  T.eq(r.unread, 1); T.eq(r.diff + r.missingEmp, 0);
  const alone = H.compare([rep(day(5), '09:00')], []);
  T.eq(alone.unread, 1); T.ok(alone.items[0].unread);
  T.ok(!/שעות/.test(H.side(rep(day(5), '09:00'))), 'not "0 שעות"');
  T.ok(H.side(rep(day(5), '09:00')).includes('09:00'));
  T.eq(H.compare([rep(day(5), '09:00', '17:00')], [mine(day(5), '09:00', '17:00')]).unread, 0);
});

T.section('hours check: a night cut at midnight is one row (joinNights)');
T.test('22:00–00:00 and 00:00–06:00 the next day: one row, 8 hours, its parts kept', () => {
  const j = H.joinNights([rep(day(13), '22:00', '00:00', 2), rep(day(14), '00:00', '06:00', 6), rep(day(15), '08:00', '16:00', 8)]);
  T.eq(j.length, 2); T.eq(j[0].start, '22:00'); T.eq(j[0].end, '06:00'); T.eq(j[0].hours, 8); T.ok(j[0].overnight); T.eq(j[0].parts.length, 2);
  const k = H.joinNights([rep(day(13), '22:00', '23:59', 1.98), rep(day(14), '00:00', '06:00', 6)]);
  T.eq(k.length, 1); T.eq(k[0].hours, 8);
});
T.test('a whole that would be longer than 16 hours stays two rows, and neither is lost', () => {
  const j = H.joinNights([rep(day(13), '08:00', '23:59', 15.98), rep(day(14), '00:00', '06:00', 6)]);
  T.eq(j.length, 2, 'the morning row was dropped');
  T.eq(j.map((r) => r.date + ' ' + r.start + '-' + r.end).join(' | '), '2026-10-13 08:00-23:59 | 2026-10-14 00:00-06:00');
});
T.test('only a row that starts at 00:00 the next day is joined', () => {
  T.eq(H.joinNights([rep(day(13), '16:00', '00:00', 8), rep(day(14), '06:00', '14:00', 8)]).length, 2);
  T.eq(H.joinNights([rep(day(13), '16:00', '00:00', 8), rep(day(15), '00:00', '04:00', 4)]).length, 2);
  T.eq(H.joinNights([]).length, 0); T.eq(H.joinNights(null).length, 0);
  // a row the reader doubted keeps the doubt on the joined row
  T.ok(H.joinNights([rep(day(13), '22:00', '00:00', 2), rep(day(14), '00:00', '06:00', 6, { doubt: true })])[0].doubt);
});

T.section('hours check: properties');
// a small seeded random, so a failure is the same every run
let seed = 20261117;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
function month() {
  const out = [];
  for (const d of workdays) {
    if (rnd() < 0.2) continue;
    const s = pick([6 * 60, 7 * 60 + 30, 8 * 60, 9 * 60 + 15, 14 * 60, 16 * 60, 22 * 60]);
    const len = pick([4 * 60, 6 * 60, 8 * 60, 8 * 60 + 30, 9 * 60, 10 * 60]);
    out.push(mine(d, hm(s), hm(s + len), (len - (len > 6 * 60 ? 30 : 0)) / 60));
    if (rnd() < 0.15 && s + len < 16 * 60) out.push(mine(d, hm(s + len + 120), hm(s + len + 240)));
  }
  return out;
}
const asReport = (ms) => ms.map((m) => rep(m.date, m.start, m.end, m.span));
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const finite = (r) => r.items.every((it) => ['dStart', 'dEnd', 'dHours', 'gap', 'short'].every((k) => it[k] == null || Number.isFinite(it[k]))) && Number.isFinite(r.drift);
const key = (r) => r.items.map((x) => [x.date, x.type, x.dStart, x.dEnd, x.dHours].join(',')).sort().join(' ');

T.test('a month against itself: no difference, no drift (50 random months)', () => {
  for (let k = 0; k < 50; k++) {
    const ms = month();
    const r = H.compare(asReport(ms), ms, OCT);
    T.eq(r.diff + r.missingEmp + r.missingMine, 0, 'month ' + k); T.eq(r.drift, 0); T.eq(H.letter(r.items), '');
  }
});
T.test('one minute more at one shift\'s end: exactly that minute, still the same; eleven: a difference of eleven', () => {
  for (let k = 0; k < 30; k++) {
    const ms = month();
    if (!ms.length) continue;
    const i = Math.floor(rnd() * ms.length);
    for (const add of [1, -1, 11, -11]) {
      const report = asReport(ms);
      const [h, m] = report[i].end.split(':').map(Number);
      report[i] = rep(report[i].date, report[i].start, hm(h * 60 + m + add), report[i].hours + add / 60);
      const r = H.compare(report, ms, OCT);
      const it = r.items.find((x) => x.rep === report[i]);
      T.ok(it, 'the changed row is paired'); T.eq(it.dEnd, add); T.eq(it.dStart, 0);
      T.eq(it.type, Math.abs(add) > H.TOL ? 'diff' : 'ok', 'add ' + add);
      T.eq(r.diff, Math.abs(add) > H.TOL ? 1 : 0); T.eq(r.missingEmp + r.missingMine, 0);
    }
  }
});
T.test('the order of the rows and of my shifts does not matter', () => {
  for (let k = 0; k < 30; k++) {
    const ms = month();
    const report = asReport(ms).filter(() => rnd() > 0.1).map((r) => (rnd() < 0.2 ? rep(r.date, r.start, hm(toMin(r.end) - 30), r.hours - 0.5) : r));
    const a = H.compare(report, ms, OCT), b = H.compare(shuffle(report), shuffle(ms), OCT);
    T.eq(key(a), key(b), 'month ' + k);
  }
});
T.test('no NaN anywhere, whatever comes in', () => {
  const odd = [rep(day(1), '08:00'), rep(day(2), null, null, 7.5), rep(day(3), '25:00', '26:00'), rep('2026-13-40', '08:00', '16:00'),
    rep(day(4), '08:00', '08:00'), rep(day(5), null, null, null), rep(day(6), '22:00', '06:00', 'x'), null, {}, rep(day(7), '00:00', '00:00')];
  const mm = [mine(day(1), '08:00', '16:00'), mine(day(2), '08:00', '16:00', NaN), Object.assign(mine(day(6), '22:00', '06:00'), { hours: undefined }), null, { id: 'z', date: day(8) }];
  for (const [a, b] of [[odd, mm], [odd, []], [[], mm], [shuffle(odd), shuffle(mm)]]) {
    const r = H.compare(a, b, OCT);
    T.ok(finite(r), JSON.stringify(r.items.map((x) => [x.type, x.dStart, x.dEnd, x.dHours])));
    T.ok(!/NaN|undefined/.test(H.letter(r.items, 'אוקטובר')));
  }
});
T.test('the letter lists exactly the findings on the employer\'s side', () => {
  for (let k = 0; k < 20; k++) {
    const ms = month();
    const report = asReport(ms).filter(() => rnd() > 0.15).map((r) => (rnd() < 0.15 ? rep(r.date, r.start, hm(toMin(r.end) - 45), r.hours - 0.75) : r));
    const r = H.compare(report, ms, OCT);
    const lines = H.letter(r.items, 'x').split('\n').filter((l) => l.startsWith('•')).length;
    T.eq(lines, r.missingEmp + r.diff);
  }
});

T.section('hours check: round 2 (the reader\'s paid hours)');
T.test('the report pays fewer hours than its own times (a break taken out): a difference with the hours on both sides', () => {
  const r = H.compare([rep(day(5), '08:00', '17:00', 9, { paid: 8.25 })], [mine(day(5), '08:00', '17:00', 9)]);
  T.eq(types(r), '05:diff'); T.eq(r.items[0].lessPaid, 45);
  T.ok(H.letter(r.items).includes('8.25 שעות') && H.letter(r.items).includes('9 שעות'));
  T.eq(types(H.compare([rep(day(5), '08:00', '17:00', 9, { paid: 8.25 })], [mine(day(5), '08:00', '17:00', 8.25)])), '05:ok');
  T.eq(H.joinNights([rep(day(13), '22:00', '00:00', 2), rep(day(14), '00:00', '06:00', 6, { paid: 5.5 })])[0].paid, 7.5);
});
