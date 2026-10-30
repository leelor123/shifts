/* The tax refund estimate (src/core/taxrefund.js), on cases worked out by hand, and the yearly tax tables. */
const T = require('./t.js');
const { TaxRefund: TR, Engine, Defaults } = globalThis;
const tax = () => Defaults.defaultSettings().tax;
const months = (year, list) => list.map(([m, gross, tx, pension]) => ({ mk: year + '-' + String(m).padStart(2, '0'), gross, tax: tx, pension: pension || 0, src: 'slip' }));

T.section('income tax by tax year');
T.test('each year its own brackets and point value (2026: the 20% and 31% brackets widened)', () => {
  T.eq(Engine.taxLaw({}, '2026-03-01').brackets[2][0], 19000);
  T.eq(Engine.taxLaw({}, '2026-03-01').brackets[3][0], 25100);
  T.eq(Engine.taxLaw({}, '2025-03-01').brackets[2][0], 16150, '2025 is 2024\'s');
  T.eq(Engine.taxLaw({}, '2023-03-01').point, 235);
  T.eq(Engine.taxLaw({}, '2021-03-01').point, 218);
  T.eq(Engine.taxLaw({}, '2020-03-01').brackets[0][0], 6330);
});
T.test('a stored default of any year follows the law; brackets the user typed stay theirs', () => {
  const old = { brackets: [[7010, 10], [10060, 14], [16150, 20], [22440, 31], [46690, 35], [60130, 47], [Infinity, 50]], creditPointValue: 242 };
  T.eq(Engine.taxLaw(old, '2026-05-01').brackets[2][0], 19000, 'the 2024/5 table saved as a default → 2026\'s law');
  T.ok(!Engine.taxLaw(old, '2026-05-01').own.brackets);
  const mine = { brackets: [[8000, 10], [Infinity, 20]], creditPointValue: 250 };
  T.eq(Engine.taxLaw(mine, '2026-05-01').brackets[0][0], 8000);
  T.eq(Engine.taxLaw(mine, '2026-05-01').point, 250);
});
T.test('the net estimate uses its period\'s year: 18,000 a month in 2026 is all 20% above 10,060', () => {
  const s = Defaults.defaultSettings(); s.birthDate = '1990-01-01'; s.pension.enabled = false;
  const n26 = Engine.netEstimate({ gross: 18000, pensionBase: 0, periodTo: '2026-03-31' }, s);
  const raw26 = 7010 * 0.10 + (10060 - 7010) * 0.14 + (18000 - 10060) * 0.20;
  T.near(n26.taxBefore, raw26, 0.01);
  const n25 = Engine.netEstimate({ gross: 18000, pensionBase: 0, periodTo: '2025-03-31' }, s);
  const raw25 = 7010 * 0.10 + (10060 - 7010) * 0.14 + (16150 - 10060) * 0.20 + (18000 - 16150) * 0.31;
  T.near(n25.taxBefore, raw25, 0.01);
});

T.section('the tax refund');
T.test('credit points by month: a resident, a woman, working youth (16–18), a discharged soldier, a degree', () => {
  const p = TR.pointsByMonth({ gender: 'f', birthDate: '2008-04-10' }, 2025);
  T.eq(p[0].total, 2.75 + 1, 'January 2025: 16 and 9 months — youth');
  T.eq(p[3].parts.youth, 1, 'April 1st: still 16 (the birthday is on the 10th)');
  const p26 = TR.pointsByMonth({ gender: 'm', birthDate: '2008-04-10' }, 2026);
  T.eq(p26[2].parts.youth, 1, 'March 2026: 17');
  T.eq(p26[4].parts.youth, 0, 'May 2026: 18');
  const sold = TR.pointsByMonth({ gender: 'm', service: { kind: 'army', months: 32, end: '2024-08' } }, 2024);
  T.eq(sold[7].parts.soldier, 0, 'the discharge month itself: not yet');
  T.eq(sold[8].parts.soldier, 2, 'from the month after: 2 (32 months of service)');
  const end = TR.pointsByMonth({ gender: 'm', service: { kind: 'army', months: 32, end: '2024-08' } }, 2027);
  T.eq(end[7].parts.soldier, 2, 'August 2027: the 36th month');
  T.eq(end[8].parts.soldier, 0, 'September 2027: over');
  T.eq(TR.pointsByMonth({ gender: 'f', service: { kind: 'army', months: 21, end: '2025-01' } }, 2025)[3].parts.soldier, 1, 'a woman with 21 months: 1');
  T.eq(TR.pointsByMonth({ gender: 'f', service: { kind: 'army', months: 22, end: '2025-01' } }, 2025)[3].parts.soldier, 2, 'with 22: 2');
  T.eq(TR.pointsByMonth({ service: { kind: 'national', months: 18, end: '2025-01' } }, 2025)[3].parts.soldier, 1, 'national service 18 months: 1');
  T.eq(TR.pointsByMonth({ service: { kind: 'army', months: 8, end: '2025-01' } }, 2025)[3].parts.soldier, 0, 'under 12 months: none');
  const ba = { degree: { year: 2023, studyYears: 3 } };
  T.eq(TR.pointsByMonth(ba, 2023)[0].parts.degree, 0, 'not in the year it ended');
  T.eq(TR.pointsByMonth(ba, 2024)[0].parts.degree, 1);
  T.eq(TR.pointsByMonth(ba, 2026)[0].parts.degree, 1, 'three years (three years of study)');
  T.eq(TR.pointsByMonth(ba, 2027)[0].parts.degree, 0);
  T.eq(TR.pointsByMonth({ degree: { year: 2020 } }, 2021)[0].parts.degree, 1, 'finished 2020: one year');
  T.eq(TR.pointsByMonth({ degree: { year: 2020 } }, 2022)[0].parts.degree, 0);
});
T.test('a student who worked 4 months: the year\'s points are a whole year\'s, so the tax taken comes back', () => {
  // 4 months × 9,000 in 2025, a man, tax taken each month as the payslip shows
  const n = Engine.netEstimate({ gross: 9000, pensionBase: 0, periodTo: '2025-07-31', pensionActive: false }, Object.assign(Defaults.defaultSettings(), { birthDate: '2000-01-01' }));
  const ms = months(2025, [[6, 9000, n.incomeTax], [7, 9000, n.incomeTax], [8, 9000, n.incomeTax], [9, 9000, n.incomeTax]]);
  const r = TR.estimate(2025, ms, { gender: 'm', birthDate: '2000-01-01' }, tax());
  T.near(r.gross, 36000);
  T.near(r.withheld, n.incomeTax * 4, 0.01);
  // the year: 36,000 is all in the 10% bracket (3,600), the points 2.25 × 242 × 12 = 6,534 → nothing to pay
  T.near(r.liability, 0);
  T.near(r.refund, n.incomeTax * 4, 0.01);
  T.ok(r.reasons.includes('partYear'));
  T.eq(r.src, 'slips');
});
T.test('a whole year at the same pay, the points given every month: nothing comes back', () => {
  const s = Object.assign(Defaults.defaultSettings(), { birthDate: '1995-01-01' });
  const n = Engine.netEstimate({ gross: 12000, pensionBase: 0, periodTo: '2025-07-31', pensionActive: false }, s);
  const ms = months(2025, Array.from({ length: 12 }, (_, i) => [i + 1, 12000, n.incomeTax]));
  const r = TR.estimate(2025, ms, { gender: 'm', birthDate: '1995-01-01' }, tax());
  T.near(r.refund, 0, 1);
});
T.test('a discharged soldier whose employer did not apply the points: 2 points × 242 for the months after discharge', () => {
  const s = Object.assign(Defaults.defaultSettings(), { birthDate: '2003-01-01' });
  const n = Engine.netEstimate({ gross: 10000, pensionBase: 0, periodTo: '2025-07-31', pensionActive: false }, s);
  const ms = months(2025, Array.from({ length: 12 }, (_, i) => [i + 1, 10000, n.incomeTax]));
  const r = TR.estimate(2025, ms, { gender: 'm', birthDate: '2003-01-01', service: { kind: 'army', months: 32, end: '2024-12' } }, tax());
  T.near(r.refund, 2 * 242 * 12, 1, 'all 12 months of 2025 are within the 36');
  T.ok(r.reasons.includes('points'));
});
T.test('a minor whose pay had tax taken: all of it comes back', () => {
  const ms = months(2025, [[7, 4000, 120], [8, 4200, 140]]);
  const r = TR.estimate(2025, ms, { gender: 'f', birthDate: '2009-02-01', minorTaxed: true }, tax());
  T.near(r.liability, 0);
  T.near(r.refund, 260);
  T.ok(r.reasons.includes('minor'));
});
T.test('Form 106 numbers win over the months; pension deposits give their credit', () => {
  const r = TR.estimate(2024, months(2024, [[1, 1000, 0]]), { gender: 'm', birthDate: '1990-01-01' }, tax(), { gross: 150000, tax: 12000, pension: 9000 });
  T.eq(r.src, '106');
  const raw = 7010 * 12 * 0.10 + (10060 - 7010) * 12 * 0.14 + (150000 - 10060 * 12) * 0.20;
  T.near(r.taxBefore, raw, 0.01);
  T.near(r.pensionCredit, Math.min(9000, 0.07 * Math.min(150000, 9700 * 12)) * 0.35, 0.01, '35% of the deposits, up to 7% of a pay capped at 9,700 a month');
  T.near(r.liability, raw - 2.25 * 242 * 12 - r.pensionCredit, 0.01);
  T.near(r.refund, 12000 - r.liability, 0.01);
});
T.test('the years a refund can be asked for: this one and the six before', () => {
  T.eq(TR.years('2026-10-30').join(','), '2026,2025,2024,2023,2022,2021,2020');
});
