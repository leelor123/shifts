/* Following the payslips over time (core/slipplus.js, app/payslip-plus.js), part of Shaati Plus, and the guard that
 * the payslip check itself stays free: Plus adds on top of the check and never gates it. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { SlipPlus } = globalThis;
const rd = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const slip = (period, f, id) => ({ id: id || 'p' + period, period, fields: f });
const A = slip('2026-08', { gross: { value: 3000 }, net: { value: 2600 }, base: { value: 2400, qty: 60 }, ot125: { value: 300, qty: 6 }, travel: { value: 200 }, incomeTax: { value: 0 }, nationalInsurance: { value: 100 }, healthTax: { value: 90 } });
const B = slip('2026-09', { gross: { value: 3300 }, net: { value: 2850 }, base: { value: 2580, qty: 60 }, ot125: { value: 300, qty: 6 }, travel: { value: 200 }, nationalInsurance: { value: 110 }, healthTax: { value: 95 }, pensionEmployee: { value: 180 } });

T.section('payslips over time (Plus)');
T.test('a row reads the main lines, the rate per regular hour and the hours', () => {
  const r = SlipPlus.row(A);
  T.eq(r.gross, 3000); T.eq(r.net, 2600); T.eq(r.rate, 40); T.eq(r.hours, 66); T.eq(r.extra, 300);
  T.eq(r.deductions, 400, 'gross minus net when there is no total line');
  T.eq(r.social, 190);
  T.eq(r.pensionEmployee, null);
});
T.test('the hours: the work-hours total when the base line has no hours (not the overtime alone)', () => {
  T.eq(SlipPlus.row(slip('2026-09', { base: { value: 1600 }, ot125: { value: 100, qty: 2 }, workHours: { value: 42 } })).hours, 42);
});
T.test('changes: only the lines both payslips have, moved by a step at least', () => {
  const ch = SlipPlus.changes(SlipPlus.row(A), SlipPlus.row(B));
  const by = Object.fromEntries(ch.changed.map((x) => [x.key, x]));
  T.eq(by.gross.delta, 300); T.eq(by.gross.pct, 10);
  T.eq(by.rate.prev, 40); T.eq(by.rate.now, 43);
  T.ok(!by.travel && !by.hours && !by.extra, 'unchanged lines are counted, not listed');
  T.eq(ch.same, 3);
  T.ok(ch.onlyNow.includes('פנסיה (חלק העובד)'));
  T.ok(ch.onlyPrev.includes('מס הכנסה'));
  T.eq(SlipPlus.changes(null, SlipPlus.row(B)).changed.length, 0);
});
T.test('history: oldest first, payslips without a month left out', () => {
  const h = SlipPlus.history([B, { id: 'x', fields: {} }, A]);
  T.eq(h.map((p) => p.period).join(','), '2026-08,2026-09');
});
T.test('every payslip together: the sum of the gaps left, the months with one, the largest', () => {
  const s = SlipPlus.summary([{ period: '2026-07', left: 0.4 }, { period: '2026-08', left: 120.5 }, { period: '2026-09', left: 300 }]);
  T.eq(s.months, 3); T.eq(s.withGap, 2); T.eq(s.total, 420.5); T.eq(s.top.period, '2026-09');
  T.eq(SlipPlus.summary([]).top, null);
});

T.section('the payslip check stays free');
T.test('views-payslip.js never gates the check, its findings or the letter behind Plus', () => {
  const v = rd('src/app/views-payslip.js');
  T.ok(!/Plus\.(use|limited|active|sheet)\(/.test(v), 'no Plus gate in the payslip check');
  T.ok(v.includes("App.payslipPlusCard ? App.payslipPlusCard() : ''"), 'the Plus extras sit in the payslips tab as a card');
});
T.test('payslip-plus.js gates only its own extras, and writes nothing to the archive', () => {
  const p = rd('src/app/payslip-plus.js');
  const acts = [...p.matchAll(/App\.actions\['([^']+)'\] = (\w+)/g)];
  T.ok(acts.length >= 3);
  T.eq(acts.filter(([, n]) => !n.startsWith('slip-')).length, 0, 'only slip-* actions');
  T.eq(acts.filter(([, n, g]) => g !== 'gate' && !(n === 'slip-report' && g === 'sold')).length, 0, 'each one through the gate (the report: also sold on its own)');
  T.ok(!/saveOps|Store\.set|store: 'payslips'|store: 'gaps'/.test(p), 'reads only');
  T.ok(/Plus\.limited\(\)/.test(p), 'open to everyone where Plus cannot be bought');
});
T.test('the Plus page leads with the payslip value and says the check stays free', () => {
  const s = rd('src/app/plus.js');
  const i = s.indexOf('<b>מעקב תלושים לאורך זמן</b>'), j = s.indexOf('עיצובים לכרטיס השכר</b>');
  T.ok(i > 0 && j > 0 && i < j, 'payslips before the skins');
  T.ok(s.includes('<b>בדיקת התלוש נשארת חינם</b>'));
});
T.section('a report bought on its own, once');
T.test('the two reports are one-time products, kept, and never turn Plus on', () => {
  const s = rd('src/app/plus.js');
  T.ok(s.includes("const REPORTS = { payslip: 'shaati_report_payslip', tax: 'shaati_report_tax' };"));
  const owns = s.slice(s.indexOf('async function playOwns'), s.indexOf('/* ---------------- the web'));
  T.ok(owns.length > 0 && !/REPORTS|shaati_report/.test(owns), 'buying a report is not buying Plus');
  const buy = s.slice(s.indexOf('Plus.buyReport = '), s.indexOf('const REPORT_TEXT'));
  T.ok(buy.length > 0 && !/consume\(/.test(buy) && /acknowledge\(token, 'onetime'\)/.test(buy), 'kept, never used up like a tip');
  T.ok(/Plus\.hasReport = \(k\) => !Plus\.limited\(\) \|\| boughtReport\(k\)/.test(s), 'open with Plus, once bought, or where Plus is not sold');
  T.ok(/Plus\.reportCard = \(k, attr\) => \(Plus\.hasReport\(k\) \|\| !Plus\.reports\[k\] \? ''/.test(s), 'no offer when open or not sold here');
  T.ok(s.includes('הדוחות המלאים') && s.includes('בסוף הניסיון'), 'the trial says what closes at its end');
});
T.test('the offer sits under the gap and never hides it; the tax report opens through the same sheet', () => {
  const v = rd('src/app/views-payslip.js');
  const i = v.indexOf("root.Plus.reportCard('payslip', 'data-ps-full')"), j = v.indexOf('id="ps-letter"'), h = v.indexOf('${hero}');
  T.ok(i > 0 && h > 0 && j > 0 && h < j && j < i, 'after the amount and the letter');
  T.ok(/left >= 1 && root\.Plus && root\.Plus\.reportCard/.test(v), 'only when the check found money');
  T.ok(/root\.Plus\.reportSheet\('tax', print\)/.test(rd('src/app/views-taxrefund.js')));
});
T.test('the share card never carries the employer, the role or the payslip', () => {
  const v = rd('src/app/views-payslip.js');
  const share = v.slice(v.indexOf("App.actions['found-share']"), v.indexOf('/* ---------------- payslips tab'));
  T.ok(share.length > 200, 'found the share card code');
  T.ok(!/employer|emp\b|\.name\b|role|slip\.|fields/.test(share), 'only the amount and the app link');
});
T.test('statistics: the gap and the report counted, and the rules allow every key', () => {
  const st = rd('src/app/stats.js');
  const body = st.slice(st.indexOf('f: (() =>'), st.indexOf('})(), // an admin'));
  const keys = [...body.matchAll(/(\w+): (?:!|\+)/g)].map((m) => m[1]);
  T.ok(keys.includes('gap') && keys.includes('rep'));
  const lim = +(rd('firestore.rules').match(/d\.f is map && d\.f\.size\(\) <= (\d+)/) || [])[1];
  T.ok(keys.length <= lim, `${keys.length} keys, the rules allow ${lim}`);
});
T.test('both files are in the build and in the tests, after the payslip code', () => {
  const b = rd('tools/build.js');
  T.ok(b.indexOf("'core/payslip.js'") < b.indexOf("'core/slipplus.js'"));
  T.ok(b.indexOf("'app/views-payslip.js'") < b.indexOf("'app/payslip-plus.js'"));
  T.ok(rd('tests/run.js').includes("'slipplus.js'"));
});
