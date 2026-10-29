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
  const g = a.findings.find((x) => x.area === 'ברוטו');
  T.ok(g.fromOverride && g.fromOverride.includes('עקיפה'), JSON.stringify(g));
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
T.test('slip-to-slip changes', () => {
  const a = Payslip.parseText(SAMPLE).fields;
  const b = Payslip.parseText(SAMPLE.replace('פנסיה עובד 116.40', 'פנסיה עובד 50.00').replace('נקודות זיכוי 2.25', 'נקודות זיכוי 2.75') + '\nמס הכנסה 100.00').fields;
  const ch = Payslip.compareSlips(a, b);
  T.ok(ch.some((c) => c.type === 'pensionDrop')); T.ok(ch.some((c) => c.type === 'credit')); T.ok(ch.some((c) => c.type === 'newDeduction'));
});
T.test('missing shift with overtime is not double counted', () => {
  const shifts = septShifts();
  shifts.push(shift('2026-09-29', '08:00', '18:00')); // 10h: 8 regular + 2 at 125% (the default: overtime after 8 hours), not on the slip
  const a = Payslip.analyze(Payslip.parseText(SAMPLE), model(shifts));
  const h = a.findings.find((x) => x.area === 'שעות');
  T.eq(h.status, 'bad'); T.near(h.amount, 8 * 40 + 2 * 50, 0.01); T.eq(h.confidence, 'high');
  T.eq(a.findings.find((x) => x.area === 'שעות נוספות').status, 'ok');
});
