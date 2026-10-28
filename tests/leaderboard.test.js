/* The champions table: period keys, packed scores, what a new score improves, nicknames. */
const { Leaderboard: LB, Analysis, U } = globalThis;
const T = require('./t.js');

T.section('leaderboard');
T.test('period keys: day, its Sunday, month, year', () => {
  const k = LB.keys('2026-10-15'); // a Thursday
  T.eq(k.d, 20261015); T.eq(k.w, 20261011); T.eq(k.m, 202610); T.eq(k.y, 2026);
  T.eq(LB.keys('2026-10-11').w, 20261011, 'Sunday starts its own week');
  T.eq(LB.keys('2026-10-17').w, 20261011, 'Saturday ends it');
  T.eq(LB.keys('2026-01-01').w, 20251228, 'a week across the new year');
});
T.test('a score is stored with its period and read back', () => {
  const v = LB.pack(20261015, 1234);
  T.eq(LB.scoreOf(v), 1234); T.eq(LB.keyOf(v), 20261015);
  T.ok(Number.isSafeInteger(LB.pack(21001231, 99999)), 'fits a safe integer');
  const [from, to] = LB.range('d', '2026-10-15');
  T.ok(v >= from && v < to, 'in today\'s range');
  T.ok(!(LB.pack(20261014, 4999) >= from), 'yesterday is out of today\'s range');
  T.eq(LB.range('a', '2026-10-15'), null);
});
T.test('a new score improves only the periods it beats', () => {
  const today = '2026-10-15';
  const row = { d: LB.pack(20261015, 50), w: LB.pack(20261011, 80), m: LB.pack(202610, 80), y: LB.pack(2026, 200), a: 300 };
  const up = LB.improve(row, 'coins', 70, today);
  T.eq(JSON.stringify(Object.keys(up)), JSON.stringify(['d']), 'only today');
  T.eq(LB.scoreOf(up.d), 70);
  T.eq(Object.keys(LB.improve(row, 'coins', 40, today)).length, 0, 'lower: nothing');
  T.eq(Object.keys(LB.improve(row, 'coins', 50, today)).length, 0, 'equal: nothing');
  const all = LB.improve(row, 'coins', 400, today);
  T.eq(Object.keys(all).join(), 'd,w,m,y,a'); T.eq(all.a, 400);
});
T.test('yesterday\'s best does not count today', () => {
  const row = { d: LB.pack(20261014, 900), w: LB.pack(20261011, 900) };
  T.eq(LB.scoreIn(row, 'd', '2026-10-15'), 0);
  T.eq(LB.scoreIn(row, 'w', '2026-10-15'), 900, 'same week');
  const up = LB.improve(row, 'coins', 10, '2026-10-15');
  T.ok('d' in up && !('w' in up), 'a new day starts from zero');
  T.eq(LB.scoreIn({ w: LB.pack(20261004, 900) }, 'w', '2026-10-15'), 0, 'last week');
});
T.test('scores are kept inside each game\'s range', () => {
  T.eq(LB.improve({}, 'facts', 99, '2026-10-15').a, 10, 'facts: at most 10');
  T.eq(Object.keys(LB.improve({}, 'quiz', -5, '2026-10-15')).length, 0, 'negative: nothing');
  T.eq(Object.keys(LB.improve({}, 'nogame', 5, '2026-10-15')).length, 0, 'unknown game: nothing');
  T.eq(LB.scoreOf(LB.improve({}, 'pairs', 12.6, '2026-10-15').d), 13, 'whole points');
});
T.test('nicknames: public, so checked', () => {
  T.eq(LB.nickProblem('שועל זריז 27'), '');
  T.eq(LB.nickProblem('Dana_K'), '');
  T.eq(LB.nickProblem('מלך ההומור'), '', 'a word that only contains a short bad word passes');
  T.eq(LB.nickProblem('מזין'), '');
  T.ok(LB.nickProblem('א'), 'too short');
  T.ok(LB.nickProblem('א'.repeat(17)), 'too long');
  T.ok(LB.nickProblem('0541234567'), 'a phone number');
  T.ok(LB.nickProblem('<b>x</b>'), 'markup');
  T.ok(LB.nickProblem('כוס'), 'a bad word');
  T.ok(LB.nickProblem('F.u.c.k'), 'a bad word with dots');
  T.ok(LB.nickProblem('Admin'), 'looks like the team');
  T.ok(LB.nickProblem('מנהל הטבלה'), 'looks like the team (Hebrew)');
  T.ok(LB.nickProblem('שעתי רשמי'), 'the app name');
  for (let s = 0; s < 300; s++) { const n = LB.randomNick(s); T.eq(LB.nickProblem(n), '', 'random nickname ' + n); }
});
T.test('names: a first name in every language of the app; the first name from the full name', () => {
  for (const n of ['נועה', "ג'ני", 'Léa', 'Lucía', 'Аня', 'نور', "D'Angelo", 'Noa K']) T.eq(LB.nickProblem(n), '', n);
  T.ok(LB.nickProblem('12'), 'digits only: no letter');
  T.ok(LB.nickProblem('<i>Léa</i>'), 'markup');
  T.eq(LB.firstName('נועה כהן'), 'נועה');
  T.eq(LB.firstName('  Lucía  Pérez '), 'Lucía');
  T.eq(LB.firstName('Аня Смирнова'), 'Аня');
  T.eq(LB.firstName('0541234567'), '', 'not a name');
  T.eq(LB.firstName(''), '');
  T.eq(LB.firstName('אבגדהוזחטיכלמנסעפצ').length, 16, 'cut to 16 letters');
});
T.test('reset texts', () => {
  T.ok(/שעות|דקות/.test(LB.resetText('d', '2026-10-15', new Date(2026, 9, 15, 10, 0).getTime())));
  T.eq(LB.resetText('w', '2026-10-17', 0), 'מתאפס מחר (יום ראשון)');
  T.eq(LB.resetText('m', '2026-12-05', 0), 'מתאפס ב-1 בינואר');
  T.eq(LB.resetText('y', '2026-12-05', 0), 'מתאפס ב-1 בינואר 2027');
});

T.section('advanced analysis');
const shift = (dateKey, startH, hours, perHour, extra) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const start = new Date(y, m - 1, d, startH, 0).getTime();
  return Object.assign({ kind: 'shift', status: 'done', dateKey, start, paidHours: hours, wage: hours * perHour, total: hours * perHour + 10, otPremium: 0, restPremium: 0, nightPremium: 0, evePremium: 0 }, extra || {});
};
T.test('too little to analyse', () => {
  const a = Analysis.analyse([shift('2026-10-01', 9, 5, 40), shift('2026-10-02', 9, 5, 40)], '2026-10-15');
  T.eq(a.enough, false); T.eq(a.count, 2);
});
T.test('the best day and time per hour, records, premiums and "what if"', () => {
  const list = [];
  // Fridays (dow 5) pay 60 an hour in the evening; other days 40 in the morning
  for (const k of ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09']) list.push(shift(k, 18, 4, 60, { restPremium: 40 }));
  for (const k of ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11']) list.push(shift(k, 8, 6, 40));
  list.push(shift('2026-10-12', 8, 9, 40, { otPremium: 25 }));
  list.push(Object.assign(shift('2026-10-13', 8, 5, 40), { status: 'planned' })); // planned: ignored
  list.push(shift('2025-09-01', 8, 5, 99)); // more than a year ago: ignored
  const a = Analysis.analyse(list, '2026-10-15');
  T.ok(a.enough); T.eq(a.count, 13);
  T.eq(a.bestDay.d, 5); T.eq(a.bestDay.perHour, 60);
  T.eq(a.bestSlot.id, 'evening');
  T.eq(a.premiums, 6 * 40 + 25);
  T.eq(a.longest.hours, 9); T.eq(a.longest.dateKey, '2026-10-12');
  T.eq(a.bestShift.total, 9 * 40 + 10);
  T.eq(a.whatIf.extraShift, Math.round(240 * 52 / 12), 'one more Friday a week');
  T.ok(a.whatIf.raise2 > 0);
  T.eq(a.months.length, 6); T.eq(a.months[5].mk, '2026-10');
  T.ok(a.trend && a.trend.mk === '2026-10', 'trend of the last month with shifts');
  T.near(a.avgHour, a.wage / a.hours, 0.01);
});
T.test('a night shift that starts after midnight is a night shift', () => {
  T.eq(Analysis.slotOf(new Date(2026, 9, 15, 2, 0).getTime()).id, 'night');
  T.eq(Analysis.slotOf(new Date(2026, 9, 15, 23, 0).getTime()).id, 'night');
  T.eq(Analysis.slotOf(new Date(2026, 9, 15, 5, 0).getTime()).id, 'morning');
});
T.test('one lucky shift is not a pattern once there are enough shifts', () => {
  const list = [shift('2026-10-03', 9, 4, 200)]; // one Saturday at 200
  for (let i = 0; i < 9; i++) list.push(shift(U.addDays('2026-09-01', i * 3), 9, 5, 40));
  const a = Analysis.analyse(list, '2026-10-15');
  T.ok(a.bestDay.d !== 6 || a.days[6].n >= 2, 'a day with one shift is not "the best day"');
});
