/* Pay calculation fixes (the code review of 1.46.4, 27 Nov 2026): each test fails on the code before its fix. */
const fs = require('fs');
const path = require('path');
const { U, Engine, Payslip, Defaults, TaxRefund } = globalThis;
const T = require('./t.js');

let n = 0;
function shift(date, from, to, extra) {
  const start = U.toEpoch(date, from);
  let end = U.toEpoch(date, to);
  if (end <= start) end = U.toEpoch(U.addDays(date, 1), to);
  return Object.assign({ id: 'pf' + (++n), kind: 'shift', employerId: 'emp1', roleId: 'r_sadran', status: 'done', start, end, items: [], breakMin: 0 }, extra || {});
}
function data(shifts, mod) {
  const settings = Defaults.defaultSettings();
  settings.startDate = '2025-06-01';
  const emp = Object.assign(Defaults.defaultEmployer(), { travelPerDay: 22.6, otLaw: false });
  const d = { settings, employers: [emp], roles: Defaults.defaultRoles(), dayRules: [], shifts, entries: [] };
  if (mod) mod(d);
  return d;
}
const model = (shifts, mod) => Engine.buildModel(data(shifts, mod));
const slipOf = (o, extra) => Object.assign({ period: '2026-09', other: [], source: 'manual', fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? { qty: v[0], value: v[1], rate: v[1] / v[0], line: k + ' ' + v.join(' ') } : { value: v, line: k + ' ' + v }])) }, extra || {});
// n shifts of the given hours from Sunday 6 Sept 2026
const week = (k, from, to, extra) => Array.from({ length: k }, (_, i) => shift(U.addDays('2026-09-06', i), from, to, extra));
const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

T.section('pay fixes (review of 1.46.4)');

T.test('a 17-year-old\'s payslip points (3.25, with the youth point) are not counted with the youth point again', () => {
  const m = model(week(5, '08:00', '16:00'), (d) => { d.settings.birthDate = '2009-03-01'; });
  const S = m.ctx.settings;
  T.eq(Engine.youthCreditPoint(S, '2026-09-30'), 1);
  // what the employer takes on a 12,000 month with 2.25 + the youth point
  const right = Engine.netEstimate({ gross: 12000, pensionBase: 12000, pensionActive: false, deductions: 0, periodTo: '2026-09-30' }, S).incomeTax;
  T.ok(right > 0, 'some tax in a big month');
  const slip = slipOf({ base: [40, 1600], gross: 12000, incomeTax: Math.round(right), creditPoints: 3.25 });
  const tax = Payslip.analyze(slip, m).findings.find((f) => f.area === 'מס הכנסה');
  T.eq(tax.status, 'ok', tax.title + ' · ' + tax.detail);
  // nothing to "apply": the slip's 3.25 is the settings' 2.25 and the youth point
  T.eq(Payslip.settingsCheck(slip, m).find((x) => x.id === 'creditPoints'), undefined);
  // a slip with half a point more: taken over without the youth point
  const more = Payslip.settingsCheck(slipOf({ base: [40, 1600], gross: 12000, creditPoints: 3.75 }), m).find((x) => x.id === 'creditPoints');
  T.ok(more, 'a difference'); T.near(more.apply.value, 2.75, 0.001); T.eq(more.app, U.num(3.25, 2));
});

T.test('pension rate 0: the payslip\'s pension does not divide by zero into a NaN tax shown as fine', () => {
  const m = model(week(5, '08:00', '16:00'), (d) => { d.settings.pension.employeePct = 0; d.settings.startDate = '2024-01-01'; });
  const f = Payslip.analyze(slipOf({ base: [40, 1600], gross: 12000, pensionEmployee: 300, incomeTax: 4000 }), m).findings.find((x) => x.area === 'מס הכנסה');
  T.ok(!/NaN/.test(f.detail), f.detail);
  T.eq(f.status, 'warn', 'a clearly high tax is flagged');
});

T.test('tax refund: every payslip of a month counts (two jobs), and a tax asked for is unknown, not 0', () => {
  const d = data([], (x) => { x.employers.push(Object.assign(Defaults.defaultEmployer('emp2'), { name: 'B' })); });
  const m = Engine.buildModel(d);
  const payslips = [
    { id: 'a', period: '2025-03', employerId: 'emp1', fields: { gross: { value: 5000 }, incomeTax: { value: 300 }, pensionEmployee: { value: 100 } } },
    { id: 'b', period: '2025-03', employerId: 'emp2', fields: { gross: { value: 3000 }, incomeTax: { value: 200 } } },
    { id: 'c', period: '2025-04', employerId: 'emp1', fields: { gross: { value: 5000 }, incomeTax: { value: null, asked: true } } },
    { id: 'e', period: '2025-05', employerId: 'emp1', fields: { gross: { value: 5000 } } }, // no tax line: none taken
  ];
  const { months } = TaxRefund.monthsOf(2025, { payslips, employers: d.employers, model: m, settings: m.ctx.settings });
  const mar = months.filter((x) => x.mk === '2025-03');
  T.eq(mar.length, 1); T.near(mar[0].gross, 8000); T.near(mar[0].tax, 500); T.near(mar[0].pension, 100);
  const apr = months.find((x) => x.mk === '2025-04');
  T.eq(apr.taxUnknown, 1); T.near(apr.tax, 0);
  T.eq(months.find((x) => x.mk === '2025-05').taxUnknown, 0);
  const r = TaxRefund.estimate(2025, months, { gender: 'm', employers: 2 }, m.ctx.settings.tax, null);
  T.eq(r.taxUnknown, 1); T.near(r.withheld, 500); T.near(r.gross, 18000);
  // the view takes its months from the core, never its own first-payslip-only loop
  T.ok(/TR\.monthsOf\(/.test(src('app/views-taxrefund.js')) && !/S\.payslips\.find\(\(x\) => x\.period === key\)/.test(src('app/views-taxrefund.js')));
});

T.test('a Shabbat shift missing from the payslip altogether: its Shabbat pay is not counted again (no false "rate low")', () => {
  const shifts = week(5, '08:00', '16:00').concat([shift('2026-09-19', '09:00', '13:00'), shift('2026-09-26', '09:00', '13:00')]);
  const m = model(shifts);
  const a = Payslip.analyze(slipOf({ base: [40, 1600], rest150: [4, 240] }), m);
  const hours = a.findings.find((f) => f.area === 'שעות');
  T.eq(hours.status, 'bad', 'the last Shabbat shift is missing'); T.eq(hours.shifts.length, 1);
  const rest = a.findings.find((f) => f.area === 'שבת וחג');
  T.eq(rest.status, 'ok', rest.title + ' · ' + rest.detail);
});

T.test('missing Shabbat hours: the premium is a share of the regular rate, not of the average with premiums', () => {
  const m = model(week(5, '08:00', '16:00').concat([shift('2026-09-19', '09:00', '13:00')]));
  const rest = Payslip.analyze(slipOf({ base: [42, 1680], rest150: [2, 120] }), m).findings.find((f) => f.area === 'שבת וחג');
  T.eq(rest.title, 'חסרות שעות שבת/חג');
  T.near(rest.amount, 2 * 40 * 0.5, 0.01); // 2 hours × 40 × 50%
});

T.test('leave: an opening balance on a month\'s last day already holds that month; sick days cap at 90 after the days taken', () => {
  const shifts = [shift('2026-03-10', '08:00', '16:00'), shift('2026-04-10', '08:00', '16:00')];
  const mk = (mod) => model(shifts, (d) => {
    Object.assign(d.settings, { startDate: '2026-01-01' });
    Object.assign(d.settings.leave, { fullTimeHours: 1, vacationOpeningDate: '2026-03-31', vacationOpening: 0, sickOpening: 0, sickPerMonth: 1.5 });
    if (mod) mod(d);
  });
  T.near(Engine.leaveBalances(mk(), '2026-04-30').sickAccrued, 1.5, 0.001, 'April only');
  const sick = (date) => ({ id: 'sk' + date, kind: 'sick', date, status: 'done', employerId: 'emp1' });
  const b = Engine.leaveBalances(mk((d) => { d.settings.leave.sickOpening = 89; d.entries.push(sick('2026-04-20'), sick('2026-04-21')); }), '2026-04-30');
  T.near(b.sickAccrued - b.sickUsed, 88.5, 0.001, '89 + 1.5 − 2');
  // without an opening date the first month of work counts as before
  const c = Engine.leaveBalances(model(shifts.concat([shift('2026-03-31', '08:00', '16:00')]), (d) => { d.settings.startDate = '2026-03-31'; d.settings.leave.fullTimeHours = 1; }), '2026-04-30');
  T.near(c.sickAccrued, 3, 0.001); // March (worked on the 31st) and April
});

T.test('gender changes move the default credit points, never a number set by hand', () => {
  T.eq(Engine.creditPointsForGender(2.25, 'm', 'f'), 2.75);
  T.eq(Engine.creditPointsForGender(2.25, '', 'f'), 2.75);
  T.eq(Engine.creditPointsForGender(2.75, 'f', 'm'), 2.25);
  T.eq(Engine.creditPointsForGender(2.75, 'f', ''), 2.25);
  T.eq(Engine.creditPointsForGender(4.25, 'm', 'f'), 4.25);
  T.eq(Engine.creditPointsForGender(2.25, 'm', ''), 2.25);
  T.ok(/path === 's\.gender'[^\n]*creditPointsForGender/.test(src('app/views-settings.js')), 'the settings screen applies it');
  T.ok(/creditPointsForGender\(s\.tax\.creditPoints/.test(src('app/views-taxrefund.js')), 'the tax refund\'s gender buttons too');
});

T.test('one shift computed alone (editor preview, running timer) gets the week\'s context: weekly overtime shows', () => {
  const shifts = Array.from({ length: 6 }, (_, i) => shift(U.addDays('2026-09-06', i), '08:00', '16:00'));
  const m = model(shifts, (d) => { d.employers[0].otLaw = true; });
  const last = shifts[5];
  const saved = m.results.get(last.id);
  T.ok(saved.otMin > 0, 'the week passed 42 hours');
  const alone = Engine.computeShift(last, m.ctx, Engine.shiftContext(last, m.results));
  T.near(alone.wage, saved.wage, 0.001); T.eq(alone.otMin, saved.otMin);
  for (const f of ['app/views-shift.js', 'app/app.js']) T.ok(!/\{ priorMin: prior/.test(src(f)) && /Engine\.shiftContext\(/.test(src(f)), f);
});

T.test('the payslip\'s gross − deductions = net check runs for a minor too', () => {
  const m = model(week(5, '08:00', '16:00'), (d) => { d.settings.birthDate = '2010-03-01'; });
  const f = Payslip.analyze(slipOf({ base: [40, 1600], travel: 113, gross: 1713, totalDeductions: 0, net: 1600 }), m).findings.find((x) => x.area === 'נטו');
  T.ok(f, 'checked'); T.eq(f.status, 'warn');
});

T.test('no travel for a shift with no paid time', () => {
  const s = shift('2026-09-07', '08:00', '08:30', { breakMin: 30, breakPaid: false });
  const m = model([s]);
  T.eq(m.results.get(s.id).travel.mode, 'none');
  T.near(Engine.totals(m, '2026-09-01', '2026-09-30').travel, 0);
});

T.test('break minutes: no negative number in the editor or in the saved shift', () => {
  const v = src('app/views-shift.js');
  T.ok(/numIn\('breakMin'[^\n]*min="0"/.test(v), 'min="0" on the field');
  T.ok(/breakMin: numOrNull\(d\.breakMin\) == null \? null : Math\.max\(0, \+d\.breakMin\)/.test(v), 'clamped on save');
});

T.test('one employer\'s totals: only its own travel; a leave day is worth that employer\'s average day', () => {
  const shifts = [];
  for (const k of ['2026-09-01', '2026-09-02', '2026-09-03']) {
    shifts.push(shift(k, '08:00', '12:00'));
    shifts.push(shift(k, '14:00', '18:00', { employerId: 'emp2', roleId: 'r_b' }));
  }
  const d = data(shifts, (x) => {
    x.employers.push(Object.assign(Defaults.defaultEmployer('emp2'), { name: 'B', travelPerDay: 10, otLaw: false }));
    x.roles.push({ id: 'r_b', name: 'B', color: '#888', employerId: 'emp2', rates: [{ from: '2000-01-01', rate: 100 }], archived: false });
    x.entries.push({ id: 'v1', kind: 'vacation', date: '2026-09-10', status: 'done', employerId: 'emp1', amount: '' });
  });
  const m = Engine.buildModel(d);
  T.near(Engine.totals(m, '2026-09-01', '2026-09-30', { employerId: 'emp1' }).travel, 3 * 22.6, 0.001);
  T.near(Engine.totals(m, '2026-09-01', '2026-09-30', { employerId: 'emp2' }).travel, 3 * 10, 0.001);
  T.near(Engine.totals(m, '2026-09-01', '2026-09-30').travel, 3 * 32.6, 0.001);
  T.near(m.entryVals.get('v1').amount, 4 * 40, 0.001); // emp1's day: 4 hours × 40
});
