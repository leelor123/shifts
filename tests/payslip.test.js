/* Payslip parsing & analysis tests */
const { U, Engine, Payslip, Defaults } = globalThis;
const T = require('./t.js');

const SAMPLE = `תלוש שכר לחודש 09/2026
שם העובד: ישראל ישראלי  ת.ז 012345678
כתובת: רחוב הרצל 10, תל אביב
בנק 12 סניף 600 חשבון 123456
שכר יסוד 40.00 40.00 1,600.00
שעות נוספות 125% 2.00 50.00 100.00
שעות שבת 150% 4.00 60.00 240.00
נסיעות 135.60
סה"כ ברוטו 2,075.60
ביטוח לאומי 21.35
מס בריאות 66.31
פנסיה עובד 116.40
ניכוי ארוחות 50.00
סה"כ ניכויים 254.06
נטו לתשלום 1,821.54
נקודות זיכוי 2.25
יתרת חופשה 3.50`;

let n = 0;
function shift(date, from, to, extra) {
  const start = U.toEpoch(date, from);
  let end = U.toEpoch(date, to);
  if (end <= start) end = U.toEpoch(U.addDays(date, 1), to);
  return Object.assign({ id: 'p' + (++n), kind: 'shift', employerId: 'emp1', roleId: 'r_sadran', status: 'done', start, end, items: [] }, extra || {});
}
function model(shifts, mod) {
  const settings = Defaults.defaultSettings();
  settings.startDate = '2025-06-01';
  const emp = Object.assign(Defaults.defaultEmployer(), { travelPerDay: 22.6 });
  const d = { settings, employers: [emp], roles: Defaults.defaultRoles(), dayRules: [], shifts, entries: [] };
  if (mod) mod(d);
  return Engine.buildModel(d);
}

T.section('payslip parsing');
T.test('parse logical-order text', () => {
  const p = Payslip.parseText(SAMPLE);
  T.eq(p.period, '2026-09');
  T.near(p.fields.base.value, 1600); T.near(p.fields.base.qty, 40); T.near(p.fields.base.rate, 40);
  T.near(p.fields.ot125.qty, 2); T.near(p.fields.rest150.qty, 4); T.near(p.fields.rest150.value, 240);
  T.near(p.fields.travel.value, 135.6); T.near(p.fields.gross.value, 2075.6); T.near(p.fields.net.value, 1821.54);
  T.near(p.fields.nationalInsurance.value, 21.35); T.near(p.fields.healthTax.value, 66.31);
  T.near(p.fields.pensionEmployee.value, 116.4); T.near(p.fields.creditPoints.value, 2.25);
  T.near(p.fields.vacationBalance.value, 3.5); T.near(p.fields.totalDeductions.value, 254.06);
  T.ok(p.other.some((o) => o.line.includes('ארוחות')), 'unknown deduction kept for review');
});
T.test('parse visual-order (reversed) Hebrew lines', () => {
  const visual = SAMPLE.split('\n').map((l) => l.split(/\s+/).reverse().map((t) => (/[֐-׿]/.test(t) ? t.split('').reverse().join('') : t)).join(' ')).join('\n');
  const p = Payslip.parseText(visual);
  T.near(p.fields.net.value, 1821.54); T.near(p.fields.nationalInsurance.value, 21.35); T.near(p.fields.travel.value, 135.6);
});
T.test('numbers: thousands, trailing minus, percent', () => {
  const ns = Payslip.numbersIn('הפרש 1,234.50- 7%');
  T.near(ns[0].v, -1234.5); T.ok(ns[1].pct);
});
T.test('redaction hides id, bank, address, phone, email', () => {
  const r = Payslip.redact(SAMPLE + '\nטלפון 050-1234567 mail: a.b@example.com');
  T.ok(!r.text.includes('012345678'), 'id'); T.ok(!r.text.includes('123456\n') && !/חשבון 123456/.test(r.text), 'bank');
  T.ok(!r.text.includes('הרצל'), 'address'); T.ok(!r.text.includes('050-1234567'), 'phone'); T.ok(!r.text.includes('example.com'), 'email');
  T.ok(r.text.includes('1,821.54'), 'amounts stay'); T.ok(r.count >= 5);
});

T.section('payslip analysis');
// September 2026: 5 regular shifts of 8h (40h), one 10h weekday (2h OT), one Saturday 4h → as in SAMPLE,
// plus one extra shift at the end of the month that the employer "forgot".
function septShifts() {
  return [
    shift('2026-09-01', '08:00', '16:00'), shift('2026-09-02', '08:00', '16:00'), shift('2026-09-03', '08:00', '16:00'),
    shift('2026-09-07', '08:00', '16:00'), shift('2026-09-08', '08:00', '18:00'),
    shift('2026-09-19', '09:00', '13:00'), // Saturday (Shabbat)
  ];
}
T.test('matching payslip → hours, Shabbat, OT and travel are OK', () => {
  const m = model(septShifts());
  const p = Payslip.parseText(SAMPLE);
  p.period = '2026-09';
  const a = Payslip.analyze(p, m);
  const by = (area) => a.findings.find((f) => f.area === area);
  T.eq(by('שעות').status, 'ok'); T.eq(by('שבת וחג').status, 'ok'); T.eq(by('שעות נוספות').status, 'ok');
  T.eq(by('נסיעות').status, 'ok', 'travel ' + by('נסיעות').detail); T.eq(by('תעריף').status, 'ok');
  T.eq(by('נטו').status, 'ok'); T.eq(by('ניכויים'), undefined);
});
T.test('unpaid shift is found and named, with ₪ amount', () => {
  const shifts = septShifts();
  shifts.push(shift('2026-09-29', '08:00', '14:00'));
  const m = model(shifts);
  const p = Payslip.parseText(SAMPLE);
  const a = Payslip.analyze(p, m);
  const f = a.findings.find((x) => x.area === 'שעות');
  T.eq(f.status, 'bad'); T.ok(f.detail.includes('29/9'), f.detail); T.eq(f.confidence, 'high');
  T.ok(f.amount > 200 && f.amount < 300, 'amount ' + f.amount);
  const tr = a.findings.find((x) => x.area === 'נסיעות');
  T.eq(tr.status, 'bad'); T.near(tr.amount, 22.6, 0.01);
  T.ok(a.totalMissing > 0);
  const msg = Payslip.employerMessage(a, { name: 'ישראל' });
  T.ok(msg.includes('ספטמבר 2026') && msg.includes('שעות שלא שולמו') && msg.includes('ישראל'), msg);
});
T.test('Shabbat paid as regular → missing premium', () => {
  const m = model(septShifts());
  const p = Payslip.parseText(SAMPLE.replace('שעות שבת 150% 4.00 60.00 240.00', 'שעות רגילות נוספות 4.00 40.00 160.00'));
  // the regular hours now include the Shabbat hours
  delete p.fields.rest150;
  p.fields.base.qty = 44; p.fields.base.value = 1760;
  const a = Payslip.analyze(p, m);
  const f = a.findings.find((x) => x.area === 'שבת וחג');
  T.eq(f.status, 'bad'); T.near(f.amount, 4 * 40 * 0.5, 0.5);
});
T.test('gap explained by a manual override is flagged as such', () => {
  const shifts = septShifts();
  shifts[5].overrides = { rest: { scope: 'off' } }; // user cancelled Shabbat on the Saturday shift
  const m = model(shifts);
  const p = Payslip.parseText(SAMPLE); // employer DID pay Shabbat
  const a = Payslip.analyze(p, m);
  const f = a.findings.find((x) => x.area === 'שבת וחג');
  T.ok(f, 'rest finding exists');
  // the gross against the app (reconcile) says the override is where the gap comes from
  const g = Payslip.reconcile(p, m, a).gross;
  T.ok(g.override && g.override.includes('עקיפה') && g.override.includes('קרוב'), JSON.stringify(g.override));
  T.eq(a.overridesInPeriod, 1);
});
T.test('missing pension after 6 months', () => {
  const m = model(septShifts());
  const p = Payslip.parseText(SAMPLE.replace('פנסיה עובד 116.40\n', ''));
  const a = Payslip.analyze(p, m);
  const f = a.findings.find((x) => x.area === 'פנסיה');
  T.eq(f.status, 'bad'); T.ok(f.amount > 0);
});
T.test('waterfall gross → net', () => {
  const p = Payslip.parseText(SAMPLE);
  const w = Payslip.waterfall(p.fields);
  T.eq(w[0].label, 'ברוטו'); T.eq(w[w.length - 1].label, 'נטו');
  const sum = w.slice(1, -1).reduce((s, x) => s + x.value, 0);
  T.near(w[0].value + sum, w[w.length - 1].value, 0.01);
});
T.test('guard: a payslip is compared with the one before it only on the leave balances', () => {
  const a = Payslip.parseText(SAMPLE + '\nיתרת מחלה 10.00').fields;
  const b = Payslip.parseText(SAMPLE.replace('פנסיה עובד 116.40', 'פנסיה עובד 50.00').replace('נקודות זיכוי 2.25', 'נקודות זיכוי 2.75')
    .replace('יתרת חופשה 3.50', 'יתרת חופשה 4.75').replace('סה"כ ברוטו 2,075.60', 'סה"כ ברוטו 3,075.60') + '\nמס הכנסה 100.00\nיתרת מחלה 9.00').fields;
  const ch = Payslip.compareSlips(a, b);
  T.eq(ch.length, 2, 'only the two balances');
  T.ok(ch.every((c) => c.type === 'vacation' || c.type === 'sick'), JSON.stringify(ch.map((c) => c.type)));
  const v = ch.find((c) => c.type === 'vacation'), s = ch.find((c) => c.type === 'sick');
  T.near(v.delta, 1.25, 0.001); T.ok(/עלתה/.test(v.text), v.text);
  T.near(s.delta, -1, 0.001); T.ok(/ירדה/.test(s.text), s.text);
  // the line translator marks a change only on the balances
  const lines = Payslip.explainLines(b, a);
  const changed = lines.filter((l) => l.change).map((l) => l.key).sort();
  T.eq(JSON.stringify(changed), JSON.stringify(['sickBalance', 'vacationBalance']));
  // and the screen draws no other cross-payslip section
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'app', 'views-payslip.js'), 'utf8');
  T.ok(!/שינויים מהתלוש הקודם/.test(src), 'the old "changes from the previous payslip" section is back');
});
T.test('missing shift with overtime is not double counted', () => {
  const shifts = septShifts();
  shifts.push(shift('2026-09-29', '08:00', '18:00')); // 10h: 8 regular + 2 at 125% (the default: overtime after 8 hours), not on the slip
  const a = Payslip.analyze(Payslip.parseText(SAMPLE), model(shifts));
  const h = a.findings.find((x) => x.area === 'שעות');
  T.eq(h.status, 'bad'); T.near(h.amount, 8 * 40 + 2 * 50, 0.01); T.eq(h.confidence, 'high');
  T.eq(a.findings.find((x) => x.area === 'שעות נוספות').status, 'ok');
});

T.section('payslip: before writing to the employer (innocent reasons)');
// a payslip given line by line: { key: value } or { key: [hours, amount] }
const slipOf = (o, extra) => Object.assign({ period: '2026-09', other: [], source: 'manual', fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? { qty: v[0], value: v[1], rate: v[1] / v[0], line: k + ' ' + v.join(' ') } : { value: v, line: k + ' ' + v }])) }, extra || {});
const check = (slip, m, area) => {
  const a = Payslip.analyze(slip, m);
  const c = Payslip.checkGap(a, slip, m);
  const it = c.items.find((x) => x.area === area);
  return { a, c, it, r: (id) => (it ? it.reasons.find((x) => x.id === id) : undefined) };
};
// n shifts of the given hours from Sunday 6 Sept 2026 (no break: breakMin 0 entered)
const week = (n, from, to, extra) => Array.from({ length: n }, (_, i) => shift(U.addDays('2026-09-06', i), from, to, Object.assign({ breakMin: 0 }, extra || {})));

T.test('the last shift of the period, paid on the next payslip: found, explains all, the letter keeps everything', () => {
  const shifts = septShifts();
  shifts.push(shift('2026-09-29', '08:00', '14:00'));
  const m = model(shifts);
  const slip = Payslip.parseText(SAMPLE);
  const { a, c, it, r } = check(slip, m, 'שעות');
  T.eq(r('edge').found, 'yes'); T.near(r('edge').amount, it.amount, 0.01); T.eq(r('edge').nextSlip, true);
  T.near(it.left, 0, 0.01); T.ok(c.all && c.nextSlip, 'all explained, next slip');
  T.eq(c.items.find((x) => x.area === 'נסיעות').reasons[0].id, 'edge', 'travel of that day explained by it too');
  // everything explained: the letter is still there, whole (never blocked)
  const msg = Payslip.employerMessage(a, { check: c });
  T.ok(msg.includes('שעות שלא שולמו') && msg.includes('החזר נסיעות חסר'), msg);
});
T.test('a shift missing in the middle of the month: not at the edge, nothing explains it', () => {
  const shifts = septShifts();
  shifts.push(shift('2026-09-10', '08:00', '14:00'));
  const { it, r } = check(Payslip.parseText(SAMPLE), model(shifts), 'שעות');
  T.eq(r('edge').found, 'no'); T.eq(r('period').found, 'no'); T.eq(r('long').found, 'no'); T.eq(r('entered').found, 'no');
  T.ok(it.left > 200, 'left ' + it.left);
});
T.test('the letter asks only for what is left: an explained finding stays out, the total is what is left', () => {
  const shifts = septShifts();
  shifts.push(shift('2026-09-10', '08:00', '14:00'));
  const m = model(shifts);
  const slip = Payslip.parseText(SAMPLE + '\nימי עבודה 6');
  const { a, c } = check(slip, m, 'שעות');
  const tr = c.items.find((x) => x.area === 'נסיעות');
  T.eq(tr.reasons.find((x) => x.id === 'travelDays').found, 'yes', 'the employer counted one day less');
  T.near(tr.left, 0, 0.01);
  const msg = Payslip.employerMessage(a, { check: c });
  T.ok(!msg.includes('החזר נסיעות חסר') && msg.includes('שעות שלא שולמו'), msg);
  const hours = c.items.find((x) => x.area === 'שעות');
  T.ok(msg.includes('סה״כ הפרש משוער: ' + U.money(hours.left)), msg);
  T.ok(!Payslip.employerMessage(a, {}).includes('אחרי מה שבדקתי'), 'without the check: the old letter');
});
T.test('the break: counted as paid in the app and not by the employer', () => {
  const m = model(week(5, '08:00', '16:30', { breakMin: 30, breakPaid: true }));
  const slip = slipOf({ base: [40, 1600], travel: 113 });
  const h = check(slip, m, 'שעות');
  T.eq(h.r('break').found, 'yes', JSON.stringify(h.r('break'))); T.near(h.it.left, 0, 0.01);
  T.eq(check(slip, m, 'שעות נוספות').r('break').found, 'yes', 'the overtime it made goes too');
  const m2 = model(week(5, '08:00', '16:30', { breakMin: 30, breakPaid: false }).concat(week(1, '08:00', '10:30').map((s) => Object.assign(s, { start: s.start + 7 * U.DAY, end: s.end + 7 * U.DAY }))));
  const h2 = check(slipOf({ base: [40, 1600], travel: 135.6 }), m2, 'שעות');
  T.ok(h2.it, 'a gap without a paid break'); T.eq(h2.r('break').found, 'no');
});
T.test('overtime after 8 hours in the app, by the law (8.6) at the employer', () => {
  const m = model(week(4, '08:00', '16:36'));
  const f = check(slipOf({ base: [34.4, 1376], travel: 90.4 }), m, 'שעות נוספות');
  T.eq(f.r('otLaw').found, 'yes'); T.near(f.it.left, 0, 0.01);
  // a long day: the law leaves overtime too, so it explains a part at most
  const m2 = model([shift('2026-09-10', '08:00', '19:00', { breakMin: 0 })]);
  const f2 = check(slipOf({ base: [11, 440], travel: 22.6 }), m2, 'שעות נוספות');
  T.ok(f2.r('otLaw').found !== 'yes', f2.r('otLaw').found);
  const m3 = model(week(4, '08:00', '16:36'), (d) => { d.employers[0].otLaw = true; });
  T.eq(check(slipOf({ base: [34.4, 1376], travel: 90.4 }), m3, 'שעות נוספות').it, undefined, 'by the law in the app: no gap at all');
});
T.test('rounding: the app rounds up, the employer pays the exact minutes', () => {
  const up = model(week(5, '08:00', '15:50'), (d) => { Object.assign(d.employers[0], { roundingMode: 'up', roundingUnit: 15 }); });
  const slip = slipOf({ base: [39.17, 1566.8], travel: 113 });
  T.eq(check(slip, up, 'שעות').r('rounding').found, 'yes');
  // the app does not round: rounding down by the employer is still worked time, so never more than "maybe"
  const none = model(week(5, '08:00', '15:50'));
  const r = check(slipOf({ base: [38.75, 1550], travel: 113 }), none, 'שעות').r('rounding');
  T.eq(r.found, 'maybe');
});
T.test('the pay period: the employer counts from the 21st', () => {
  const sh = ['2026-08-24', '2026-09-01', '2026-09-02', '2026-09-21', '2026-09-22', '2026-09-23'].map((k) => shift(k, '08:00', '16:00', { breakMin: 0 }));
  const m = model(sh);
  const f = check(slipOf({ base: [24, 960], travel: 113 }), m, 'שעות');
  T.eq(f.r('period').found, 'yes'); T.ok(/21/.test(f.r('period').text), f.r('period').text); T.eq(f.r('period').fix.k, 'pay');
  T.eq(f.r('edge').found, 'no', 'the 21st-23rd are not the last days');
  T.eq(check(slipOf({ base: [30, 1200], travel: 113 }), m, 'שעות').r('period').found, 'no');
});
T.test('a shift much longer than the others (a clock left running)', () => {
  const sh = week(4, '08:00', '16:00').concat([shift('2026-09-10', '08:00', '23:30', { breakMin: 0 })]);
  const f = check(slipOf({ base: [40, 1600], travel: 113 }), model(sh), 'שעות');
  T.eq(f.r('long').found, 'yes'); T.eq(f.r('long').shifts.length, 1);
  T.eq(check(slipOf({ base: [36, 1440], travel: 113 }), model(week(5, '08:00', '16:00')), 'שעות').r('long').found, 'no');
});
T.test('shifts written before they began, or changed after they ended', () => {
  const sh = week(5, '08:00', '16:00');
  sh[2].createdAt = sh[2].start - 2 * U.DAY; // from the schedule
  const f = check(slipOf({ base: [36, 1440], travel: 113 }), model(sh), 'שעות');
  T.eq(f.r('entered').found, 'maybe'); T.eq(f.r('entered').shifts[0], sh[2].id);
  const sh2 = week(5, '08:00', '16:00');
  sh2.forEach((s) => { s.createdAt = s.end + 60000; s.updatedAt = s.end + 120000; });
  T.eq(check(slipOf({ base: [36, 1440], travel: 113 }), model(sh2), 'שעות').r('entered').found, 'no');
});
T.test('the hourly rate: a raise the employer starts later', () => {
  const raise = (d) => { d.roles[0].rates = [{ from: '2000-01-01', rate: 40 }, { from: '2026-09-01', rate: 45 }]; };
  const f = check(slipOf({ base: [40, 1600], travel: 113 }), model(week(5, '08:00', '16:00'), raise), 'תעריף');
  T.eq(f.r('rate').found, 'yes'); T.ok(f.r('rate').text.includes('01/09/2026'), f.r('rate').text);
  const g = check(slipOf({ base: [40, 1520], travel: 113 }), model(week(5, '08:00', '16:00')), 'תעריף');
  T.eq(g.r('rate').found, 'maybe'); T.eq(g.r('rate').fix.k, 'roles');
});
T.test('travel: fewer days at the employer, a lower fare, or another month', () => {
  const m = model(week(5, '08:00', '16:00'));
  const days = check(slipOf({ base: [40, 1600], travel: 90.4, workDays: 4 }), m, 'נסיעות');
  T.eq(days.r('travelDays').found, 'yes');
  const fare = check(slipOf({ base: [40, 1600], travel: 90.4, workDays: 5 }), m, 'נסיעות');
  T.eq(fare.r('travelDays'), undefined); T.eq(fare.r('travelRate').found, 'yes'); T.ok(fare.r('travelRate').text.includes(U.money(18.08)), fare.r('travelRate').text);
  const none = check(slipOf({ base: [40, 1600] }), m, 'נסיעות');
  T.eq(none.r('travelMonth').found, 'maybe'); T.eq(none.r('travelCap'), undefined);
});
T.test('Shabbat: hours in the last hour of the window', () => {
  const late = check(slipOf({ base: [2, 80], travel: 22.6 }), model([shift('2026-09-19', '18:30', '20:30', { breakMin: 0 })]), 'שבת וחג');
  T.ok(late.it, 'a rest finding'); T.eq(late.r('restWindow').found, 'yes'); T.eq(late.r('restWindow').fix.k, 'rest');
  const mid = check(slipOf({ base: [4, 160], travel: 22.6 }), model([shift('2026-09-19', '10:00', '14:00', { breakMin: 0 })]), 'שבת וחג');
  T.eq(mid.r('restWindow').found, 'no');
});
T.test('the minimum wage: a minor\'s is lower when no birth date was given', () => {
  const m = model(week(5, '08:00', '16:00'));
  T.eq(check(slipOf({ base: [40, 1280], travel: 113 }), m, 'שכר מינימום').r('minAge').found, 'maybe');
  T.eq(check(slipOf({ base: [40, 800], travel: 113 }), m, 'שכר מינימום').r('minAge').found, 'no');
});
T.test('pension: the duty began only lately, by the start date', () => {
  const recent = check(slipOf({ base: [40, 1600], travel: 113, gross: 1713 }), model(week(5, '08:00', '16:00'), (d) => { d.settings.startDate = '2026-02-01'; }), 'פנסיה');
  T.ok(recent.it, 'pension missing'); T.eq(recent.r('pensionStart').found, 'maybe');
  const old = check(slipOf({ base: [40, 1600], travel: 113, gross: 1713 }), model(week(5, '08:00', '16:00'), (d) => { d.settings.startDate = '2024-01-01'; }), 'פנסיה');
  T.eq(old.r('pensionStart').found, 'no');
});
T.test('a minor: the 18th birthday close to the payslip, and the estimates', () => {
  const at = (birth) => check(slipOf({ base: [40, 1600], travel: 113, gross: 1713, nationalInsurance: 30 }), model(week(5, '08:00', '16:00'), (d) => { d.settings.birthDate = birth; }), 'ביטוח לאומי');
  const soon = at('2008-10-15');
  T.eq(soon.r('birth18').found, 'yes'); T.eq(soon.r('estimate').found, 'maybe');
  T.eq(at('2009-03-01').r('birth18').found, 'maybe');
});
T.test('a minor\'s income tax: flagged only when clearly above the estimate', () => {
  const m = model(week(5, '08:00', '16:00'), (d) => { d.settings.birthDate = '2009-03-01'; });
  const tax = (v) => Payslip.analyze(slipOf({ base: [40, 1600], travel: 113, gross: 1713, incomeTax: v }), m).findings.find((f) => f.area === 'מס הכנסה');
  const est = Engine.netEstimate({ gross: 1713, pensionBase: 1600, pensionActive: false, deductions: 0, periodTo: '2026-09-30' }, m.ctx.settings).incomeTax || 0;
  T.eq(tax(est + 10).status, 'ok', 'about the estimate');
  T.eq(tax(est + 250).status, 'warn'); T.near(tax(est + 250).amount, 250, 0.01);
});
T.test('a payslip line the reader did not place, of the same amount', () => {
  const shifts = septShifts();
  shifts.push(shift('2026-09-10', '08:00', '14:00'));
  const slip = Payslip.parseText(SAMPLE);
  const h0 = check(slip, model(shifts), 'שעות');
  slip.other = [{ line: 'תשלום משמרת נוספת', value: Math.round(h0.it.amount * 100) / 100, guess: 'ignore' }];
  const h = check(slip, model(shifts), 'שעות');
  T.eq(h.r('unplaced').found, 'yes'); T.eq(h.r('unplaced').line, 'תשלום משמרת נוספת'); T.near(h.it.left, 0, 0.01);
  slip.other = [{ line: 'ארוחות', value: 20, guess: 'otherDed' }];
  T.eq(check(slip, model(shifts), 'שעות').r('unplaced'), undefined);
});
T.test('the reader misread a number: the line it read is shown', () => {
  const m = model(week(5, '08:00', '16:00'));
  const photo = check(slipOf({ base: [36, 1440], travel: 113 }, { source: 'ocr' }), m, 'שעות');
  T.eq(photo.r('ocr').found, 'maybe'); T.ok(photo.r('ocr').line.includes('base'), photo.r('ocr').line); T.eq(photo.r('ocr').fix.kind, 'verify');
  const odd = slipOf({ base: [36, 1440], travel: 113 }, { source: 'ocr' });
  odd.fields.base.value = 1340; // 36 × 40 ≠ 1340
  T.eq(check(odd, m, 'שעות').r('ocr').found, 'yes');
  T.eq(check(slipOf({ base: [36, 1440], travel: 113 }, { source: 'pdf' }), m, 'שעות').r('ocr').found, 'no');
  T.eq(check(slipOf({ base: [36, 1440], travel: 113 }), m, 'שעות').r('ocr'), undefined, 'typed by hand: no reading to doubt');
});
T.test('reasons: found first, then by amount; only "yes" lowers the gap', () => {
  const sh = week(5, '08:00', '16:30', { breakMin: 30, breakPaid: true });
  const f = check(slipOf({ base: [39, 1560], travel: 113 }, { source: 'ocr' }), model(sh), 'שעות');
  const order = f.it.reasons.map((r) => ({ yes: 0, maybe: 1, no: 2 }[r.found]));
  T.ok(order.every((x, i) => !i || x >= order[i - 1]), JSON.stringify(f.it.reasons.map((r) => r.id + ':' + r.found)));
  const yes = f.it.reasons.filter((r) => r.found === 'yes' && r.amount != null);
  T.near(f.it.explained, yes.length ? Math.min(f.it.amount, Math.max(...yes.map((r) => r.amount))) : 0, 0.01);
});

T.section('payslip translator');
T.test('every field has a meaning, a Hebrew meaning, a Hebrew term and an explanation', () => {
  for (const f of Payslip.FIELDS) {
    T.ok(Payslip.EXPLAIN[f.key], 'EXPLAIN ' + f.key);
    T.ok(Payslip.MEANING[f.key], 'MEANING ' + f.key);
    T.ok(Payslip.HE_TERM[f.key], 'HE_TERM ' + f.key);
    // the kept Hebrew copy says exactly what the translated one says in Hebrew
    T.eq(Payslip.MEANING_HE[f.key], Payslip.MEANING[f.key], 'MEANING_HE ' + f.key);
    T.ok(Payslip.KIND_LABEL[f.kind], 'KIND_LABEL ' + f.kind);
  }
  // the reading order names every field once: pay, deductions, employer, totals with net last, then information
  T.eq(Payslip.READ_ORDER.slice().sort().join(), Payslip.FIELDS.map((f) => f.key).sort().join());
  const kinds = Payslip.READ_ORDER.map((k) => Payslip.FIELD[k].kind);
  T.eq(kinds.filter((k, i) => k !== kinds[i - 1]).join(), 'pay,ded,emp,total,info');
  T.eq(Payslip.READ_ORDER[kinds.lastIndexOf('total')], 'net');
  T.eq(Object.keys(Payslip.MEANING).length, Payslip.FIELDS.length);
  T.eq(Object.keys(Payslip.MEANING_HE).length, Payslip.FIELDS.length);
});
T.test('explain lines carry the Hebrew term, the printed words and the kind', () => {
  const p = Payslip.parseText(SAMPLE);
  const lines = Payslip.explainLines(p.fields, null);
  const base = lines.find((l) => l.key === 'base');
  T.eq(base.heTerm, 'שכר יסוד'); T.eq(base.printed, ''); // printed as the usual term: not repeated
  T.eq(base.kindLabel, Payslip.KIND_LABEL.pay);
  const pe = lines.find((l) => l.key === 'pensionEmployee');
  T.eq(pe.kind, 'ded'); T.ok(pe.meaning.length > 0 && pe.meaningHe === pe.meaning);
  T.eq(Payslip.printedTerm('ש"נ 125 2.00 50.00 100.00'), 'ש"נ'); T.eq(Payslip.printedTerm('AI'), ''); T.eq(Payslip.printedTerm('12.5'), '');
});
T.test('unrecognised lines: listed, named, and the stored slip is never changed', () => {
  const p = Payslip.parseText(SAMPLE);
  const slip = { fields: p.fields, other: p.other.map((o) => Object.assign({}, o, { guess: o.guess || 'ignore' })) }; // as the check screen keeps them
  const un = Payslip.unknownLines(slip.other, slip.fields);
  T.eq(un.length, 1); T.ok(/ארוחות/.test(un[0].line)); T.eq(un[0].guess, null); T.near(un[0].value, 50, 0.001);
  const s2 = Payslip.labelOther(slip, un[0].index, 'otherDed');
  T.eq(s2.other[0].guess, 'otherDed'); T.eq(slip.other[0].guess, 'ignore');
  T.eq(Payslip.unknownLines(s2.other, s2.fields)[0].kind, 'ded');
  const s3 = Payslip.labelOther(slip, un[0].index, 'bonus');
  T.near(s3.fields.bonus.value, 50, 0.001); T.ok(!slip.fields.bonus); T.eq(Payslip.unknownLines(s3.other, s3.fields).length, 0);
  // a field the slip already has keeps its verified value
  const s4 = Payslip.labelOther(slip, un[0].index, 'travel');
  T.near(s4.fields.travel.value, 135.6, 0.001); T.eq(Payslip.unknownLines(s4.other, s4.fields).length, 1);
});

// The payslip check's lines are the app's own markup: money() returns <span class="money">, and escaping the line again
// showed that tag as text in every "the lines add up to ..." warning (axe pass, 6 Nov 2026)
T.test('payslip check: its lines are not escaped a second time', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'app', 'views-payslip.js'), 'utf8');
  const render = /checks\.map\(\(\[s, t\]\) => `([^`]*)`\)/.exec(src);
  T.ok(render, 'the renderer of the checks');
  T.ok(!/esc\(t\)/.test(render[1]), 'a check line is escaped again: its money() shows as <span> text');
  T.ok(/\$\{money\(pays\)\}/.test(src), 'the warning still puts the amounts in with money()');
});

T.section('payslip against the app (reconcile, settingsCheck)');
const sumDiff = (side) => side.items.reduce((s, x) => s + x.diff, 0);
T.test('guard: a matching payslip reconciles line by line, every line a match', () => {
  const m = model(septShifts());
  const p = Payslip.parseText(SAMPLE);
  const rc = Payslip.reconcile(p, m);
  T.near(rc.gross.total, 0, 0.02, 'gross gap');
  T.near(sumDiff(rc.gross), rc.gross.total, 0.01, 'the gross items add up to the gross gap');
  T.ok(rc.gross.items.every((x) => x.state === 'match'), JSON.stringify(rc.gross.items.filter((x) => x.state !== 'match').map((x) => [x.id, x.diff])));
  T.ok(!rc.gross.items.some((x) => x.id === 'unexplained'), 'no unexplained line when nothing is left');
  T.near(sumDiff(rc.net), rc.net.total, 0.01, 'the net items add up to the net gap');
});
T.test('guard: the app-vs-payslip gap is fully itemized, with the unexplained part shown on its own', () => {
  const shifts = septShifts();
  shifts.push(shift('2026-09-15', '08:00', '14:00')); // a shift the payslip does not pay
  const m = model(shifts);
  // a lower rate, travel at 20 a day, a seniority line, credit points 2.75, and a gross 30 above its own lines
  const text = SAMPLE.replace('שכר יסוד 40.00 40.00 1,600.00', 'שכר יסוד 40.00 39.00 1,560.00').replace('נסיעות 135.60', 'נסיעות 120.00')
    .replace('סה"כ ברוטו 2,075.60', 'סה"כ ברוטו 2,130.00').replace('נקודות זיכוי 2.25', 'נקודות זיכוי 2.75') + '\nתוספת ותק 80.00';
  const p = Payslip.parseText(text);
  T.near(p.fields.seniority.value, 80); T.near(p.fields.gross.value, 2130);
  const a = Payslip.analyze(p, m);
  const rc = Payslip.reconcile(p, m, a, Payslip.checkGap(a, p, m));
  T.near(sumDiff(rc.gross), rc.gross.total, 0.01, 'gross items sum to the gap');
  T.near(sumDiff(rc.net), rc.net.total, 0.01, 'net items sum to the gap');
  const g = (id) => rc.gross.items.find((x) => x.id === id);
  T.ok(g('hours').diff < -200, 'the missing 6 hours: ' + g('hours').diff);
  T.near(g('rate').diff, -40, 0.01, 'the rate: 1 less on 40 hours');
  T.near(g('travel').diff, 120 - 7 * 22.6, 0.01);
  T.near(g('seniority').diff, 80, 0.01);
  // 1560+100+240+120+80 = 2100: 30 that no read line explains
  const u = g('unexplained'); T.ok(u, 'the unexplained remainder is its own line'); T.near(u.diff, 30, 0.01); T.eq(u.state, 'ask'); T.ok(u.ask, 'it asks');
  T.ok(rc.asks > 0 && !rc.exact);
  // every item that is not a match says where it comes from, and one that is not clear asks
  for (const x of rc.gross.items.concat(rc.net.items)) if (x.state !== 'match') T.ok(x.text, x.id + ' has no text');
  for (const x of rc.gross.items.concat(rc.net.items)) if (x.state === 'ask') T.ok(x.ask, x.id + ' asks nothing');
  // a deduction's parts add up to it
  for (const x of rc.net.items) if (x.parts) T.near(x.parts.reduce((s, q) => s + q.amount, 0), x.diff, 0.01, x.id + ' parts');
});
T.test('guard: settings the payslip says otherwise are listed, each with the payslip\'s value to take', () => {
  const m = model(septShifts());
  const text = SAMPLE.replace('נסיעות 135.60', 'נסיעות 120.00').replace('סה"כ ברוטו 2,075.60', 'סה"כ ברוטו 2,040.00')
    .replace('נקודות זיכוי 2.25', 'נקודות זיכוי 2.75') + '\nתוספת ותק 80.00\nימי עבודה 6';
  const p = Payslip.parseText(text);
  const sc = Payslip.settingsCheck(p, m);
  const by = (id) => sc.find((x) => x.id === id);
  T.ok(by('creditPoints'), 'credit points'); T.eq(by('creditPoints').apply.path, 'tax.creditPoints'); T.near(by('creditPoints').apply.value, 2.75);
  T.ok(by('travel'), 'travel'); T.near(by('travel').apply.patch.travelPerDay, 20, 0.001);
  T.ok(by('seniority'), 'seniority'); T.eq(by('seniority').apply.patch.seniorityEnabled, true);
  T.ok(by('vacationBalance'), 'the vacation balance'); T.eq(by('vacationBalance').apply.path, 'leave.vacationOpening');
  for (const x of sc) T.ok(x.slip != null && x.app != null && x.text, x.id + ' says both values and why');
  // the payslip's credit points and seniority taken: those two lines are gone
  const m2 = model(septShifts(), (d) => { d.settings.tax.creditPoints = 2.75; Object.assign(d.employers[0], { seniorityEnabled: true, seniorityType: 'fixedPerHour', seniorityValue: by('seniority').apply.patch.seniorityValue, seniorityAfterMonths: 0 }); });
  const sc2 = Payslip.settingsCheck(p, m2);
  T.ok(!sc2.some((x) => x.id === 'creditPoints'), 'credit points still listed');
  T.ok(!sc2.some((x) => x.id === 'seniority' && x.recommend === 'slip'), 'seniority still listed');
  const sen = Payslip.reconcile(p, m2).gross.items.find((x) => x.id === 'seniority');
  T.near(sen.diff, 0, 0.6, 'seniority reconciles after the update');
});
T.test('the unexplained part names the app lines of the same sum the payslip shows no line for', () => {
  const m = model(septShifts());
  const p = Payslip.parseText(SAMPLE.replace('נסיעות 135.60\n', '')); // the gross still holds the travel
  const rc = Payslip.reconcile(p, m);
  const u = rc.gross.items.find((x) => x.id === 'unexplained');
  T.ok(u, 'unexplained line'); T.near(u.diff, 135.6, 0.01); T.ok(/נסיעות/.test(u.text), u.text);
  T.near(sumDiff(rc.gross), rc.gross.total, 0.01);
});
T.test('a payslip that pays only the overtime supplement reads the same as the app', () => {
  const m = model(septShifts());
  // the base line holds all 46 hours at 100%, the premium lines only the 25% and 50%
  const text = SAMPLE.replace('שכר יסוד 40.00 40.00 1,600.00', 'שכר יסוד 46.00 40.00 1,840.00').replace('שעות נוספות 125% 2.00 50.00 100.00', 'שעות נוספות 125% 2.00 10.00 20.00')
    .replace('שעות שבת 150% 4.00 60.00 240.00', 'שעות שבת 150% 4.00 20.00 80.00');
  const p = Payslip.parseText(text);
  const rc = Payslip.reconcile(p, m);
  T.ok(rc.gross.items.every((x) => x.state === 'match'), JSON.stringify(rc.gross.items.filter((x) => x.state !== 'match').map((x) => [x.id, x.diff])));
});
T.test('guard: income tax above the estimate is asked about, apart from the credit points', () => {
  const m = model(septShifts(), (d) => { d.settings.startDate = '2020-01-01'; });
  const p = Payslip.parseText(SAMPLE.replace('נקודות זיכוי 2.25', 'נקודות זיכוי 2.75') + '\nמס הכנסה 300.00');
  const rc = Payslip.reconcile(p, m);
  const tax = rc.net.items.find((x) => x.id === 'tax');
  T.eq(tax.state, 'ask'); T.ok(/מעסיק אחר|101/.test(tax.ask), tax.ask);
  T.near(tax.diff, -(300 - tax.app), 0.01);
});
