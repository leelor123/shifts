/* Engine tests — run with:  node tests/run.js
 * Times are Israel local (TZ=Asia/Jerusalem is forced by run.js). */
const { U, HebCal, Engine, Defaults } = globalThis;
const T = require('./t.js');

function setup(mod) {
  const settings = Defaults.defaultSettings();
  settings.startDate = '2025-01-01';
  const emp = Defaults.defaultEmployer();
  const roles = Defaults.defaultRoles();
  const data = { settings, employers: [emp], roles, dayRules: [], shifts: [], entries: [] };
  if (mod) mod(data);
  return data;
}
let n = 0;
function shift(date, from, to, extra) {
  const start = U.toEpoch(date, from);
  let end = U.toEpoch(date, to);
  if (end <= start) end = U.toEpoch(U.addDays(date, 1), to);
  return Object.assign({ id: 's' + (++n), kind: 'shift', employerId: 'emp1', roleId: 'r_sadran', status: 'done', start, end, breakMin: 0, breakPaid: true, items: [] }, extra || {});
}
function calc(data, s, opts) {
  const ctx = Engine.makeCtx(data);
  return Engine.computeShift(s, ctx, opts);
}
const H = (a, b) => (b - a) / 3600000;
const tel = { mode: 'city', city: 'תל אביב-יפו' };

T.section('basic & overtime');
T.test('weekday 8h = 8 × 40', () => {
  const r = calc(setup(), shift('2026-10-11', '08:00', '16:00'));
  T.near(r.paidHours, 8); T.near(r.wage, 320); T.near(r.otHours, 0);
});
T.test('11h: 8 @100 + 2 @125 + 1 @150', () => {
  const r = calc(setup(), shift('2026-10-12', '08:00', '19:00'));
  T.near(r.wage, 320 + 100 + 60); T.near(r.hoursBy.ot1, 2); T.near(r.hoursBy.ot2, 1);
});
T.test('two shifts same day share the 8h counter', () => {
  const d = setup();
  d.shifts = [shift('2026-10-12', '08:00', '13:00'), shift('2026-10-12', '15:00', '20:00')];
  const m = Engine.buildModel(d);
  const second = m.results.get(d.shifts[1].id);
  T.near(second.hoursBy.regular, 3); T.near(second.hoursBy.ot1, 2); T.near(second.wage, 3 * 40 + 2 * 50);
});
T.test('unpaid 60 min break', () => {
  const r = calc(setup(), shift('2026-10-11', '08:00', '17:00', { breakMin: 60, breakPaid: false }));
  T.near(r.paidHours, 8); T.near(r.wage, 320);
});
T.test('paid break counts as work', () => {
  const r = calc(setup(), shift('2026-10-11', '08:00', '17:00', { breakMin: 60, breakPaid: true }));
  T.near(r.paidHours, 9); T.near(r.wage, 320 + 50);
});

T.section('crossing midnight');
T.test('20:00 → 04:00 = 8h, dated on start day', () => {
  const r = calc(setup(), shift('2026-10-13', '20:00', '04:00'));
  T.eq(r.dateKey, '2026-10-13'); T.near(r.paidHours, 8); T.near(r.wage, 320);
});
T.test('night premium 20% on 22:00-06:00 part', () => {
  const r = calc(setup((d) => { Object.assign(d.employers[0], { nightEnabled: true, nightValue: 20 }); }), shift('2026-10-13', '20:00', '04:00'));
  T.near(r.nightHours, 6); T.near(r.nightPremium, 6 * 40 * 0.2); T.near(r.wage, 320 + 48);
});

T.section('Shabbat boundaries (Tel Aviv, computed locally)');
T.test('Friday 12:00-20:00 crosses candle lighting', () => {
  const entry = HebCal.entryTime('2026-10-16', tel);
  const s = shift('2026-10-16', '12:00', '20:00');
  const r = calc(setup(), s);
  const restH = H(entry, s.end), regH = H(s.start, entry);
  T.near(r.restHours, restH, 0.01); T.near(r.hoursBy.regular, regH, 0.01);
  T.near(r.wage, regH * 40 + restH * 60, 0.05);
  T.ok(restH > 2 && restH < 3, 'entry should be ~17:2x, got ' + U.epochHM(entry));
});
T.test('Saturday 15:00-23:00 crosses havdalah', () => {
  const exit = HebCal.exitTime('2026-10-17', tel);
  const s = shift('2026-10-17', '15:00', '23:00');
  const r = calc(setup(), s);
  T.near(r.restHours, H(s.start, exit), 0.01);
  T.near(r.wage, H(s.start, exit) * 60 + H(exit, s.end) * 40, 0.05);
});
T.test('OT inside Shabbat: 11h → 8@150 + 2@175 + 1@200', () => {
  const r = calc(setup(), shift('2026-10-17', '06:00', '17:00'));
  T.near(r.wage, 8 * 60 + 2 * 70 + 1 * 80); T.near(r.hoursBy.restOt1, 2); T.near(r.hoursBy.restOt2, 1);
});
T.test('Friday 10:00-21:00: OT tiers and Shabbat both apply', () => {
  const entry = HebCal.entryTime('2026-10-16', tel);
  const s = shift('2026-10-16', '10:00', '21:00');
  const r = calc(setup(), s);
  const reg = H(s.start, entry), rest0 = H(entry, U.toEpoch('2026-10-16', '18:00'));
  const expected = reg * 40 + rest0 * 60 + 2 * 40 * 1.75 + 1 * 40 * 2.0;
  T.near(r.wage, expected, 0.05);
  T.near(r.base + r.restPremium + r.otPremium, r.wage, 0.001);
});
T.test('fixed Shabbat hours mode (Fri 16:00 – Sat 20:00)', () => {
  const r = calc(setup((d) => { d.settings.rest.mode = 'fixed'; }), shift('2026-10-16', '14:00', '18:00'));
  T.near(r.restHours, 2); T.near(r.wage, 2 * 40 + 2 * 60);
});

T.section('holidays');
T.test('Yom Kippur 2026-09-21 is a rest day', () => {
  const r = calc(setup(), shift('2026-09-21', '10:00', '14:00'));
  T.near(r.restHours, 4); T.near(r.wage, 240); T.ok(r.restLabels.join().includes('כיפור'));
});
T.test('holiday toggled off in settings → regular pay', () => {
  const r = calc(setup((d) => { d.settings.rest.holidays.yk = false; }), shift('2026-09-21', '10:00', '14:00'));
  T.near(r.restHours, 0); T.near(r.wage, 160);
});
T.test('Shabbat + Rosh Hashana merge into one window (Sun 2026-09-13 is RH II)', () => {
  const wins = HebCal.restWindows('2026-09-11', '2026-09-14', Object.assign({}, setup().settings.rest, { dayRules: [] }));
  const w = wins.find((x) => x.days.some((d) => d.key === '2026-09-12'));
  T.eq(w.days.length, 2); T.eq(U.epochKey(w.end), '2026-09-13');
  const r = calc(setup(), shift('2026-09-13', '08:00', '12:00'));
  T.near(r.restHours, 4);
});
T.test('Yom HaAtzmaut 2026 (Wed 22 Apr) detected', () => {
  T.ok(HebCal.holidaysOn('2026-04-22').some((h) => h.id === 'atzmaut'));
});

T.section('rate changes');
T.test('raise on the 15th affects only later shifts', () => {
  const d = setup((x) => { x.roles[0].rates = [{ from: '2000-01-01', rate: 40 }, { from: '2026-10-15', rate: 45 }]; });
  d.shifts = [shift('2026-10-14', '08:00', '16:00'), shift('2026-10-15', '08:00', '16:00')];
  const m = Engine.buildModel(d);
  T.near(m.results.get(d.shifts[0].id).wage, 320);
  T.near(m.results.get(d.shifts[1].id).wage, 360);
  T.near(Engine.totals(m, '2026-10-01', '2026-10-31').wage, 680);
});

T.section('daylight saving time');
T.test('fall back (25 Oct 2026): 22:00 → 06:00 is 9 real hours', () => {
  const r = calc(setup(), shift('2026-10-24', '22:00', '06:00'));
  T.near(r.paidHours, 9); T.near(r.wage, 8 * 40 + 1 * 50);
});
T.test('spring forward (27 Mar 2026): 22:00 → 06:00 is 7 real hours', () => {
  const r = calc(setup(), shift('2026-03-26', '22:00', '06:00'));
  T.near(r.paidHours, 7); T.near(r.wage, 280);
});

T.section('manual overrides');
const fri = () => shift('2026-10-16', '10:00', '21:00');
T.test('cancel Shabbat for the whole shift', () => {
  const r = calc(setup(), Object.assign(fri(), { overrides: { rest: { scope: 'off' } } }));
  T.near(r.restHours, 0); T.near(r.wage, 320 + 100 + 60); T.ok(r.overridden);
});
T.test('force 150% on a weekday shift', () => {
  const r = calc(setup(), Object.assign(shift('2026-10-11', '08:00', '16:00'), { overrides: { rest: { scope: 'all' } } }));
  T.near(r.wage, 480);
});
T.test('custom Shabbat range for part of the shift', () => {
  const s = shift('2026-10-16', '12:00', '20:00');
  s.overrides = { rest: { scope: 'range', from: U.toEpoch('2026-10-16', '18:00'), to: U.toEpoch('2026-10-16', '20:00') } };
  const r = calc(setup(), s);
  T.near(r.restHours, 2); T.near(r.wage, 6 * 40 + 2 * 60);
});
T.test('custom rest percent 125%', () => {
  const r = calc(setup(), Object.assign(shift('2026-10-17', '08:00', '12:00'), { overrides: { rest: { scope: 'auto', pct: 125 } } }));
  T.near(r.wage, 4 * 50);
});
T.test('manual rest premium amount', () => {
  const r = calc(setup(), Object.assign(shift('2026-10-17', '06:00', '17:00'), { overrides: { rest: { scope: 'auto', amount: 100 } } }));
  T.near(r.wage, 440 + 40 + 100);
});
T.test('overtime off', () => {
  const r = calc(setup(), Object.assign(shift('2026-10-12', '08:00', '19:00'), { overrides: { ot: { mode: 'off' } } }));
  T.near(r.wage, 440);
});
T.test('overtime threshold 9h', () => {
  const r = calc(setup(), Object.assign(shift('2026-10-12', '08:00', '19:00'), { overrides: { ot: { mode: 'threshold', hours: 9 } } }));
  T.near(r.wage, 9 * 40 + 2 * 50);
});
T.test('manual hourly rate', () => {
  const r = calc(setup(), Object.assign(shift('2026-10-11', '08:00', '16:00'), { overrides: { rate: { rate: 50 } } }));
  T.near(r.wage, 400);
});
T.test('travel off override + noTravel flag', () => {
  const r1 = calc(setup(), Object.assign(shift('2026-10-11', '08:00', '16:00'), { overrides: { travel: { mode: 'off' } } }));
  const r2 = calc(setup(), shift('2026-10-11', '08:00', '16:00', { noTravel: true }));
  T.eq(r1.travel.mode, 'none'); T.eq(r2.travel.mode, 'none'); T.ok(r1.overridden); T.ok(!r2.overridden);
});
T.test('ignoreOverrides recomputes the automatic value', () => {
  const s = Object.assign(fri(), { overrides: { rest: { scope: 'off' } } });
  const auto = calc(setup(), s, { ignoreOverrides: true });
  T.ok(auto.restHours > 3);
});
T.test('bulk cancel of a rest day (day rule)', () => {
  const d = setup((x) => { x.dayRules = [{ date: '2026-10-17', type: 'cancel', reason: 'test' }]; });
  const r = calc(d, shift('2026-10-17', '06:00', '17:00'));
  T.near(r.restHours, 0); T.near(r.wage, 480); T.ok(r.dayRuleHit);
});
T.test('bulk force a rest day', () => {
  const d = setup((x) => { x.dayRules = [{ date: '2026-10-14', type: 'force', reason: 'חג המעסיק' }]; });
  const r = calc(d, shift('2026-10-14', '08:00', '12:00'));
  T.near(r.restHours, 4); T.ok(r.dayRuleHit);
});

T.section('rounding, minimum, splits');
T.test('round to nearest 15 min', () => {
  const r = calc(setup((d) => { d.employers[0].roundingMode = 'nearest'; }), shift('2026-10-11', '08:07', '16:05'));
  T.near(r.paidHours, 8);
});
T.test('round down to 15 min', () => {
  const r = calc(setup((d) => { d.employers[0].roundingMode = 'down'; }), shift('2026-10-11', '08:00', '16:14'));
  T.near(r.paidHours, 8);
});
T.test('minimum 4 paid hours per shift', () => {
  const r = calc(setup((d) => { d.employers[0].minShiftHours = 4; }), shift('2026-10-11', '08:00', '10:00'));
  T.near(r.wage, 160); T.near(r.minTopUp, 80);
});
T.test('split: 3h סדרן then אחמ״ש', () => {
  const s = shift('2026-10-11', '16:00', '00:00');
  s.splits = [{ at: U.toEpoch('2026-10-11', '19:00'), roleId: 'r_achmash' }];
  const r = calc(setup(), s);
  T.near(r.byRole.r_sadran.hours, 3); T.near(r.byRole.r_achmash.hours, 5); T.near(r.wage, 3 * 40 + 5 * 48);
});

T.section('travel, periods, net, leave');
T.test('travel per day with monthly cap', () => {
  const d = setup((x) => { x.employers[0].travelMonthlyCap = 100; });
  d.shifts = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-11'].map((k) => shift(k, '08:00', '12:00'));
  d.shifts.push(shift('2026-10-11', '14:00', '16:00')); // 2nd shift same day: travel once
  const m = Engine.buildModel(d);
  const t = Engine.totals(m, '2026-10-01', '2026-10-31');
  T.near(t.travelRaw, 6 * 22.6); T.near(t.travel, 100);
});
T.test('pay period from the 21st', () => {
  const emp = Object.assign(Defaults.defaultEmployer(), { periodStartDay: 21 });
  const p = Engine.periodOf('2026-10-25', emp);
  T.eq(p.key, '2026-11'); T.eq(p.from, '2026-10-21'); T.eq(p.to, '2026-11-20'); T.eq(p.payDate, '2026-12-09');
  T.eq(Engine.periodOf('2026-10-20', emp).key, '2026-10');
});
T.test('net estimate for 6,000 ₪', () => {
  const s = Defaults.defaultSettings();
  const n = Engine.netEstimate({ gross: 6000, pensionBase: 6000, deductions: 0, pensionActive: true }, s);
  T.near(n.incomeTax, 0); T.near(n.bl, 62.4); T.near(n.health, 193.8); T.near(n.pensionEmployee, 360); T.near(n.net, 5383.8);
});
T.test('net estimate for 15,000 ₪ (no pension)', () => {
  const s = Defaults.defaultSettings();
  const n = Engine.netEstimate({ gross: 15000, pensionBase: 15000, deductions: 0, pensionActive: false }, s);
  const tax = 7010 * 0.1 + (10060 - 7010) * 0.14 + (15000 - 10060) * 0.2 - 2.25 * 242;
  T.near(n.incomeTax, tax);
  T.near(n.bl, 7522 * 0.0104 + (15000 - 7522) * 0.07);
});
T.test('sick days: 0%, 50%, 50%, 100%', () => {
  const d = setup((x) => { x.settings.leave.dayValueMode = 'fixed'; x.settings.leave.dayFixed = 300; });
  d.entries = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'].map((k, i) => ({ id: 'e' + i, kind: 'sick', date: k, employerId: 'emp1' }));
  const m = Engine.buildModel(d);
  T.eq(d.entries.map((e) => m.entryVals.get(e.id).amount).join(','), '0,150,150,300');
});
T.test('vacation accrual for a full-time year (5-day week)', () => {
  const d = setup((x) => { x.settings.startDate = '2025-01-01'; });
  const shifts = [];
  for (let k = '2025-01-01'; k <= '2025-12-31'; k = U.addDays(k, 1)) {
    if (U.dow(k) < 5) shifts.push(shift(k, '08:00', '16:30'));
  }
  d.shifts = shifts;
  const m = Engine.buildModel(d);
  const b = Engine.leaveBalances(m, '2025-12-31');
  T.near(b.vacationAccrued, 12, 0.6); T.near(b.sickAccrued, 18, 0.9);
});

T.section('age & minors');
T.test('age is counted in whole years', () => {
  T.eq(Engine.ageAt('2008-10-12', '2026-10-11'), 17);
  T.eq(Engine.ageAt('2008-10-12', '2026-10-12'), 18);
  T.eq(Engine.ageAt(null, '2026-10-12'), null);
});
T.test('under 18: net equals gross (no tax, social security or pension)', () => {
  const s = Defaults.defaultSettings();
  s.birthDate = '2010-03-01';
  const n = Engine.netEstimate({ gross: 4000, pensionBase: 4000, deductions: 0, periodTo: '2026-09-30' }, s);
  T.eq(n.minor, true); T.near(n.net, 4000); T.near(n.bl + n.health + n.incomeTax + n.pensionEmployee, 0);
  T.ok(!Engine.pensionActive(Object.assign({}, s, { startDate: '2024-01-01' }), '2026-09-30'), 'no mandatory pension');
});
T.test('the day you turn 18 normal deductions apply', () => {
  const s = Defaults.defaultSettings();
  s.birthDate = '2008-09-15';
  const before = Engine.netEstimate({ gross: 9000, pensionBase: 9000, deductions: 0, periodTo: '2026-09-14', pensionActive: false }, s);
  const after = Engine.netEstimate({ gross: 9000, pensionBase: 9000, deductions: 0, periodTo: '2026-09-30', pensionActive: false }, s);
  T.near(before.net, 9000); T.ok(after.net < 9000 && !after.minor);
});

T.section('the law: minimum wage, youth, pension age');
T.test('adult minimum wage follows the April updates', () => {
  T.eq(Engine.legalMinWage('2025-03-31', null).hourly, 32.30);
  T.eq(Engine.legalMinWage('2025-04-01', null).hourly, 34.32);
  T.eq(Engine.legalMinWage('2026-03-31', '1990-01-01').hourly, 34.32);
  T.eq(Engine.legalMinWage('2026-04-01', '1990-01-01').hourly, 35.40);
});
T.test('youth minimum wage matches the published 2026 table', () => {
  T.eq(Engine.legalMinWage('2026-06-01', '2011-01-01').hourly, 26.07, 'age 15: 70%');
  T.eq(Engine.legalMinWage('2026-06-01', '2010-01-01').hourly, 27.94, 'age 16: 75%');
  T.eq(Engine.legalMinWage('2026-06-01', '2009-01-01').hourly, 30.92, 'age 17: 83%');
  T.eq(Engine.legalMinWage('2026-06-01', '2008-01-01').hourly, 35.40, 'age 18: adult');
  T.eq(Engine.legalMinWage('2026-06-01', '2009-06-02').age, 16, 'the day before the 17th birthday');
});
T.test('a minimum wage set by hand overrides the law', () => {
  const s = Defaults.defaultSettings();
  T.eq(Engine.minWageFor(s, '2026-06-01').hourly, 35.40);
  s.minWageHourly = 40;
  T.eq(Engine.minWageFor(s, '2026-06-01').hourly, 40);
  T.ok(Engine.minWageFor(s, '2026-06-01').custom);
});
T.test('youth hours: night window and day length by age', () => {
  T.eq(Engine.youthRules(15, 5).nightFrom, 20);
  T.eq(Engine.youthRules(15, 5).dayHours, 8);
  T.eq(Engine.youthRules(16, 5).nightFrom, 22);
  T.eq(Engine.youthRules(16, 5).dayHours, 9);
  T.eq(Engine.youthRules(17, 6).dayHours, 8);
});
T.test('mandatory pension starts at 21 (men) / 20 (women)', () => {
  const s = Defaults.defaultSettings();
  s.pension.enabled = true; s.startDate = '2024-01-01';
  s.birthDate = '2006-01-01'; // 20 in 2026
  T.ok(!Engine.pensionActive(s, '2026-06-30'), 'man of 20: not yet');
  s.gender = 'f';
  T.ok(Engine.pensionActive(s, '2026-06-30'), 'woman of 20: yes');
  s.gender = ''; s.birthDate = '2005-01-01';
  T.ok(Engine.pensionActive(s, '2026-06-30'), 'anyone of 21: yes');
});
