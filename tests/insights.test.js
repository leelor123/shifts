/* Insights / averages tests */
const { U, Engine, Insights, Defaults } = globalThis;
const T = require('./t.js');

let n = 0;
function shift(date, from, to, role) {
  const start = U.toEpoch(date, from);
  let end = U.toEpoch(date, to);
  if (end <= start) end = U.toEpoch(U.addDays(date, 1), to);
  return { id: 'i' + (++n), kind: 'shift', employerId: 'emp1', roleId: role || 'r_sadran', status: 'done', start, end, items: [] };
}
function data(shifts, mod) {
  const settings = Defaults.defaultSettings();
  settings.startDate = '2026-01-01';
  const d = { settings, employers: [Defaults.defaultEmployer()], roles: Defaults.defaultRoles(), dayRules: [], shifts, entries: [] };
  if (mod) mod(d);
  return d;
}
// "today" = Monday 2026-10-12 → last completed week = Sun 04/10 – Sat 10/10
const NOW = U.toEpoch('2026-10-12', '10:00');
const weekdays = (ws, count) => [0, 1, 2, 3, 4].slice(0, count).map((i) => U.addDays(ws, i));

T.section('average-based alerts');
T.test('needs at least 4 weeks of history', () => {
  const shifts = [];
  for (const ws of ['2026-09-27', '2026-10-04']) for (const k of weekdays(ws, 4)) shifts.push(shift(k, '09:00', '14:00'));
  const r = Insights.run(Engine.buildModel(data(shifts)), { now: NOW });
  T.ok(!r.alerts.some((a) => a.type === 'hours'), 'no hours alert with 2 weeks of data');
});
T.test('hours +50% vs 4-week average triggers, with explanation', () => {
  const shifts = [];
  for (const ws of ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']) for (const k of weekdays(ws, 4)) shifts.push(shift(k, '09:00', '14:00')); // 20h/week
  for (const k of weekdays('2026-10-04', 5)) shifts.push(shift(k, '09:00', '15:00')); // 30h
  const r = Insights.run(Engine.buildModel(data(shifts)), { now: NOW });
  const a = r.alerts.find((x) => x.key === 'w-hours-2026-10-04');
  T.ok(a, 'hours alert exists');
  T.near(a.data.base, 20); T.near(a.data.cur, 30); T.near(a.data.dev, 50);
  T.ok(a.explain.includes('20'), 'explanation mentions the average');
  T.ok(r.alerts.some((x) => x.key === 'w-shifts-2026-10-04'), 'shift count alert (+25%)');
});
T.test('average includes weeks with zero work', () => {
  const shifts = [];
  for (const ws of ['2026-09-06', '2026-09-20']) for (const k of weekdays(ws, 4)) shifts.push(shift(k, '09:00', '14:00')); // 20h, 0, 20h, 0
  for (const k of weekdays('2026-10-04', 4)) shifts.push(shift(k, '09:00', '14:00')); // 20h vs avg 10h
  const r = Insights.run(Engine.buildModel(data(shifts)), { now: NOW });
  const a = r.alerts.find((x) => x.key === 'w-hours-2026-10-04');
  T.ok(a); T.near(a.data.base, 10); T.near(a.data.dev, 100);
});
T.test('within threshold → no alert', () => {
  const shifts = [];
  for (const ws of ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']) for (const k of weekdays(ws, 4)) shifts.push(shift(k, '09:00', '14:00'));
  for (const k of weekdays('2026-10-04', 4)) shifts.push(shift(k, '09:00', '15:00')); // 24h = +20% → boundary counts
  const r1 = Insights.run(Engine.buildModel(data(shifts)), { now: NOW });
  T.ok(r1.alerts.some((x) => x.key === 'w-hours-2026-10-04'), '+20% (>= threshold) alerts');
  const r2 = Insights.run(Engine.buildModel(data(shifts, (d) => { d.settings.alerts.deviationPct = 25; })), { now: NOW });
  T.ok(!r2.alerts.some((x) => x.key === 'w-hours-2026-10-04'), 'raising threshold to 25% silences it');
});
T.test('role mix change (more אחמ״ש)', () => {
  const shifts = [];
  for (const ws of ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']) for (const k of weekdays(ws, 4)) shifts.push(shift(k, '09:00', '14:00'));
  for (const k of weekdays('2026-10-04', 4)) shifts.push(shift(k, '09:00', '14:00', 'r_achmash'));
  const r = Insights.run(Engine.buildModel(data(shifts)), { now: NOW, roleName: (id) => ({ r_achmash: 'אחמ״ש', r_sadran: 'סדרן' }[id]) });
  T.ok(r.alerts.some((x) => x.type === 'roles' && x.title.includes('אחמ״ש')));
});
T.test('alert type can be switched off', () => {
  const shifts = [];
  for (const ws of ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']) for (const k of weekdays(ws, 4)) shifts.push(shift(k, '09:00', '14:00'));
  for (const k of weekdays('2026-10-04', 5)) shifts.push(shift(k, '09:00', '15:00'));
  const r = Insights.run(Engine.buildModel(data(shifts, (d) => { d.settings.alerts.types.hours = false; })), { now: NOW });
  T.ok(!r.alerts.some((x) => x.type === 'hours'));
});

T.section('health & reminders');
T.test('long shift, short rest, streak', () => {
  const shifts = [shift('2026-10-05', '06:00', '19:30'), shift('2026-10-06', '01:00', '07:00')];
  for (let i = 0; i < 6; i++) shifts.push(shift(U.addDays('2026-10-06', i), '10:00', '12:00'));
  const r = Insights.run(Engine.buildModel(data(shifts)), { now: U.toEpoch('2026-10-11', '20:00') });
  T.ok(r.alerts.some((x) => x.type === 'long'), 'long');
  T.ok(r.alerts.some((x) => x.type === 'rest8'), 'rest8');
  T.ok(r.alerts.some((x) => x.type === 'streak'), 'streak');
});
T.test('forgotten timer & planned shift in the past', () => {
  const p = shift('2026-10-10', '08:00', '12:00'); p.status = 'planned';
  const r = Insights.run(Engine.buildModel(data([p])), { now: NOW, activeShift: { start: NOW - 13 * U.HOUR } });
  T.ok(r.alerts.some((x) => x.type === 'timer' && x.push === 'critical'));
  T.ok(r.alerts.some((x) => x.type === 'plannedPast'));
});
T.test('overlapping shifts flagged', () => {
  const r = Insights.run(Engine.buildModel(data([shift('2026-10-11', '08:00', '14:00'), shift('2026-10-11', '13:00', '16:00')])), { now: NOW });
  T.ok(r.alerts.some((x) => x.type === 'suspicious'));
});
T.test('weekly summary sentence names the driving role', () => {
  const shifts = [];
  for (const ws of ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']) for (const k of weekdays(ws, 4)) shifts.push(shift(k, '09:00', '14:00'));
  for (const k of weekdays('2026-10-04', 4)) shifts.push(shift(k, '09:00', '14:00'));
  shifts.push(shift('2026-10-09', '08:00', '14:00', 'r_miznon'));
  const r = Insights.run(Engine.buildModel(data(shifts)), { now: U.toEpoch('2026-10-10', '22:00'), roleName: (id) => ({ r_miznon: 'מזנון', r_sadran: 'סדרן' }[id]) });
  T.ok(r.weekly && r.weekly.sentence.includes('6 שעות יותר'), r.weekly && r.weekly.sentence);
  T.ok(r.weekly.sentence.includes('מזנון'), r.weekly.sentence);
});
