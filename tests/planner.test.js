/* Planned shifts compared by pay (core/planner.js): the premiums, the one best shift, "what if I swap". */
const { U, Engine, Defaults, Planner } = globalThis;
const T = require('./t.js');

function setup(mod) {
  const settings = Defaults.defaultSettings();
  settings.startDate = '2025-01-01';
  const emp = Defaults.defaultEmployer();
  const data = { settings, employers: [emp], roles: Defaults.defaultRoles(), dayRules: [], shifts: [], entries: [] };
  if (mod) mod(data, emp);
  return data;
}
let n = 0;
function shift(date, from, to, extra) {
  const start = U.toEpoch(date, from);
  let end = U.toEpoch(date, to);
  if (end <= start) end = U.toEpoch(U.addDays(date, 1), to);
  return Object.assign({ id: 'p' + (++n), kind: 'shift', employerId: 'emp1', roleId: 'r_sadran', status: 'planned', start, end, breakMin: 0, breakPaid: true, items: [] }, extra || {});
}
const results = (data) => [...Engine.computeAll(data.shifts, Engine.makeCtx(data)).values()];
// 2026-11-10 is a Tuesday, 11-13 a Friday, 11-14 Shabbat
T.section('planner: which shift pays most');
T.test('the premiums of a Shabbat shift, above the same hours on a weekday', () => {
  const d = setup();
  d.shifts = [shift('2026-11-14', '10:00', '16:00')];
  const r = results(d)[0];
  const why = Planner.reasons(r);
  T.eq(why[0].kind, 'rest');
  T.ok(/שבת/.test(why[0].label), why[0].label);
  T.near(why[0].amount, 6 * 40 * 0.5, 0.01);
  T.near(Planner.plainOf(r) + why.reduce((s, x) => s + x.amount, 0), r.wage, 0.01);
});
T.test('one best shift with its reason; a weekday shift has no premium', () => {
  const d = setup();
  d.shifts = [shift('2026-11-10', '08:00', '14:00'), shift('2026-11-14', '10:00', '16:00'), shift('2026-11-11', '08:00', '14:00')];
  const b = Planner.best(results(d));
  T.eq(b.id, d.shifts[1].id);
  T.eq(b.reason.kind, 'rest');
  T.ok(/^שבת: \W?\+120\D+ לעומת משמרת רגילה$/.test(b.text), b.text);
  T.eq(b.when, 'שבת בבוקר');
  T.eq(Planner.reasons(results(d).find((r) => r.id === d.shifts[0].id)).length, 0);
});
T.test('no highlight: one shift, a tie, done shifts, shifts already over', () => {
  const d = setup();
  d.shifts = [shift('2026-11-10', '08:00', '14:00')];
  T.eq(Planner.best(results(d)), null);
  d.shifts.push(shift('2026-11-11', '08:00', '14:00'));
  T.eq(Planner.best(results(d)), null, 'a tie');
  d.shifts.push(shift('2026-11-14', '10:00', '16:00', { status: 'done' }));
  T.eq(Planner.best(results(d)), null, 'a done shift is not a plan');
  d.shifts.push(shift('2026-11-07', '10:00', '16:00'));
  T.eq(Planner.best(results(d), { now: U.toEpoch('2026-11-08', '00:00') }), null, 'over already');
});
T.test('a night shift: when it is, and the night premium as its reason', () => {
  const d = setup((x, emp) => { emp.nightEnabled = true; emp.nightType = 'pct'; emp.nightValue = 25; });
  d.shifts = [shift('2026-11-10', '08:00', '14:00'), shift('2026-11-11', '22:00', '04:00')];
  const b = Planner.best(results(d));
  T.eq(b.id, d.shifts[1].id);
  T.eq(b.reason.kind, 'night');
  T.eq(b.when, 'רביעי בלילה');
  T.eq(Planner.whenOf(U.toEpoch('2026-11-14', '01:00')), 'שישי בלילה', 'after midnight belongs to the night before');
  T.eq(Planner.whenOf(U.toEpoch('2026-11-13', '17:00')), 'שישי בערב');
  T.eq(Planner.whenOf(U.toEpoch('2026-11-13', '12:00')), 'שישי בצהריים');
});

T.test('a schedule being imported: each shift\'s pay with the week already in the app, and the best of them', () => {
  const d = setup();
  const have = shift('2026-11-11', '08:00', '14:00', { status: 'done' });
  d.shifts = [have];
  const cands = [shift('2026-11-11', '15:00', '18:00'), shift('2026-11-13', '22:00', '06:00'), shift('2026-11-10', '08:00', '11:00')];
  const pay = Planner.expected(d.shifts, Engine.makeCtx(d), cands);
  T.eq(pay.size, 3);
  // the same day already has 6 hours: of these 3, one is past the day's 8 hours
  T.near(pay.get(cands[0].id).otHours, 1, 0.01);
  const b = Planner.best(pay.values());
  T.eq(b.id, cands[1].id);
  T.eq(b.when, 'שישי בלילה');
  T.eq(b.reason.kind, 'rest');
  T.eq(Planner.expected(d.shifts, Engine.makeCtx(d), []).size, 0);
});

T.section('planner: what if I swap');
T.test('a Tuesday shift for a Shabbat one: the gain is the Shabbat premium', () => {
  const d = setup();
  const tue = shift('2026-11-10', '10:00', '16:00');
  d.shifts = [tue];
  const res = Planner.swap(d.shifts, Engine.makeCtx(d), tue.id, { start: U.toEpoch('2026-11-14', '10:00'), end: U.toEpoch('2026-11-14', '16:00') });
  T.near(res.delta, 120, 0.01);
  T.near(res.after.wage - res.before.wage, res.delta, 0.01);
  T.eq(res.parts.length, 1);
  T.eq(res.parts[0].kind, 'rest');
  T.ok(/^שבת: \W?\+120/.test(Planner.partText(res.parts[0])), Planner.partText(res.parts[0]));
  T.ok(/מוסיפה/.test(Planner.swapTitle(res)));
  T.ok(!res.overlap);
  const back = Planner.swap([Object.assign({}, tue, { start: U.toEpoch('2026-11-14', '10:00'), end: U.toEpoch('2026-11-14', '16:00') })], Engine.makeCtx(d), tue.id, { start: tue.start, end: tue.end });
  T.near(back.delta, -120, 0.01);
  T.ok(/מורידה/.test(Planner.swapTitle(back)));
  T.ok(/−/.test(Planner.partText(back.parts[0])), 'a loss has a minus sign');
});
T.test('a longer shift: the extra hours, and overtime past the day', () => {
  const d = setup();
  const s = shift('2026-11-10', '08:00', '14:00');
  d.shifts = [s];
  const res = Planner.swap(d.shifts, Engine.makeCtx(d), s.id, { start: U.toEpoch('2026-11-11', '08:00'), end: U.toEpoch('2026-11-11', '18:00') });
  const hours = res.parts.find((x) => x.kind === 'hours'), ot = res.parts.find((x) => x.kind === 'ot');
  T.near(hours.delta, 4 * 40, 0.01);
  T.eq(hours.label, 'אורך המשמרת');
  T.near(ot.delta, 2 * 40 * 0.25, 0.01);
  T.near(res.delta, hours.delta + ot.delta, 0.01);
});
T.test('the week counts: moving a shift out of a 44-hour week takes away the other shift\'s overtime', () => {
  const d = setup((x, emp) => { emp.otLaw = true; });
  const sun = shift('2026-11-08', '08:00', '12:00');
  // Mon–Thu 8.5 h and Fri 7 h: the day's limits are not crossed, the week's 42 hours are (by the last one)
  d.shifts = [sun, shift('2026-11-09', '08:00', '16:30', { status: 'done' }), shift('2026-11-10', '08:00', '16:30'), shift('2026-11-11', '08:00', '16:30'), shift('2026-11-12', '08:00', '16:30'), shift('2026-11-13', '07:00', '14:00')];
  const ctx = Engine.makeCtx(d);
  const res = Planner.swap(d.shifts, ctx, sun.id, { start: U.toEpoch('2026-11-15', '08:00'), end: U.toEpoch('2026-11-15', '12:00') });
  const ot = res.parts.find((x) => x.kind === 'ot');
  T.ok(ot && ot.delta < 0, JSON.stringify(res.parts));
  T.eq(ot.label, 'שעות נוספות השבוע');
  T.ok(res.others < 0, 'the loss is in the other shifts');
  T.near(res.delta, res.others + (res.after.wage - res.before.wage), 0.01);
});
T.test('a clash with another shift is told; a bad time or an unknown shift gives nothing', () => {
  const d = setup();
  const a = shift('2026-11-10', '08:00', '14:00'), b = shift('2026-11-11', '10:00', '18:00');
  d.shifts = [a, b];
  const ctx = Engine.makeCtx(d);
  T.ok(Planner.swap(d.shifts, ctx, a.id, { start: U.toEpoch('2026-11-11', '12:00'), end: U.toEpoch('2026-11-11', '20:00') }).overlap);
  T.eq(Planner.swap(d.shifts, ctx, a.id, { start: 5, end: 5 }), null);
  T.eq(Planner.swap(d.shifts, ctx, 'nope', { start: a.start, end: a.end }), null);
  T.eq(Planner.swapTitle(Planner.swap(d.shifts, ctx, a.id, { start: a.start, end: a.end })), 'אותו שכר בערך');
});
