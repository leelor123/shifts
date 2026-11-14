/* The payslip check speaks carefully and earns a monthly habit (advisory review, 14 Nov 2026):
 *   - a gap it finds is a possible gap to look into, never a verdict on the employer, with a calm note on every result;
 *   - "the reading is wrong": fix the read values in place, or tell the team through the help centre, with nothing from
 *     the payslip attached;
 *   - a good result can share an invite to the app, with no number and nothing from the payslip;
 *   - around payday, once a month, "התלוש הגיע? אפשר לבדוק אותו" (Moments.slipNudge).
 */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const M = globalThis.Moments;
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const at = (y, mo, d, h) => new Date(y, mo - 1, d, h || 12).getTime();

T.section('the payslip check: a monthly offer around payday');
const base = (o) => Object.assign({ pk: '2026-10', payDate: '2026-11-09', today: '2026-11-10', nowMs: at(2026, 11, 10, 12), lag: 0, hasSlip: false, checkedSince: false, mem: {} }, o);
T.test('from the day after the pay date, for a week', () => {
  T.ok(!M.slipNudge(base({ today: '2026-11-09', nowMs: at(2026, 11, 9) })), 'not on payday itself (the payday card asks then)');
  T.ok(M.slipNudge(base()), 'the day after');
  T.ok(M.slipNudge(base({ today: '2026-11-16', nowMs: at(2026, 11, 16) })), 'the seventh day');
  T.ok(!M.slipNudge(base({ today: '2026-11-17', nowMs: at(2026, 11, 17) })), 'a week is enough');
});
T.test('on the day this person usually saves the payslip', () => {
  T.ok(!M.slipNudge(base({ lag: 4, today: '2026-11-12', nowMs: at(2026, 11, 12) })));
  T.ok(M.slipNudge(base({ lag: 4, today: '2026-11-13', nowMs: at(2026, 11, 13) })));
});
T.test('never in the quiet hours', () => {
  T.ok(!M.slipNudge(base({ nowMs: at(2026, 11, 10, 23) })));
  T.ok(!M.slipNudge(base({ nowMs: at(2026, 11, 10, 5) })));
  T.ok(M.slipNudge(base({ nowMs: at(2026, 11, 10, 6) })));
});
T.test('once a month: an answered period is not offered again', () => {
  T.ok(!M.slipNudge(base({ mem: { done: { '2026-10': 1 }, n: 0 } })));
  T.ok(M.slipNudge(base({ mem: { done: { '2026-09': 1 }, n: 1 } })), 'last month answered, this one not');
});
T.test('two "not now"s turn it off', () => {
  T.ok(M.slipNudge(base({ mem: { n: 1 } })));
  T.ok(!M.slipNudge(base({ mem: { n: 2 } })));
});
T.test('not when this month\'s payslip is in or a payslip was checked since payday', () => {
  T.ok(!M.slipNudge(base({ hasSlip: true })));
  T.ok(!M.slipNudge(base({ checkedSince: true })));
});
T.test('nothing to ask without a period', () => {
  T.ok(!M.slipNudge(null));
  T.ok(!M.slipNudge(base({ payDate: '' })));
});

T.section('the payslip check: the home screen keeps its limits');
T.test('the offer waits in the home queue (HOME_CARDS_MAX), after the salary question, and yields to it', () => {
  const home = read('src/app/views-home.js');
  const q = home.slice(home.indexOf('const HOME_QUEUE = ['), home.indexOf('];', home.indexOf('const HOME_QUEUE = [')));
  T.ok(q.indexOf("['slipcheck'") > q.indexOf("['salary'"), 'after the salary card in the queue');
  const sc = read('src/app/salary-check.js');
  const card = sc.slice(sc.indexOf('App.slipNudgeCard = function'), sc.indexOf('async function slipAnswer'));
  T.ok(/App\.salaryCard\(\)/.test(card), 'one payday card at a time');
  const due = sc.slice(sc.indexOf('function slipDue()'), sc.indexOf('App.slipNudgeCard = function'));
  T.ok(/M\.slipNudge\(o\)/.test(due) && /slipFor\(/.test(due) && /S\.settings\.demo/.test(due), 'the pure rule decides, with the period\'s payslip');
  T.ok(/slipNudge: \{ kind: 'latest' \}/.test(read('src/app/store.js')), 'the answers go with the account (n: the "not now"s, joined by max)');
});

T.section('the payslip check: careful words');
const ps = read('src/app/views-payslip.js');
T.test('a gap is a possible gap, never money the employer owes', () => {
  T.ok(/bad: \['xc', 'ייתכן שיש פער'\]/.test(ps), 'the status of a gap');
  // review.js too: the rating card after a payslip gap said "found money you are owed" (14 Nov 2026)
  for (const f of ['src/app/views-payslip.js', 'src/core/payslip.js', 'src/app/views-home.js', 'src/app/salary-check.js', 'src/app/review.js']) {
    const s = read(f);
    for (const w of ['כסף שמגיע לך', 'לטובתך', 'חסר לך כסף', 'חסרים לי', 'חסר/שגוי', 'חסר או שגוי', 'לא נמצאו חוסרים', 'המעסיק חייב לך', 'הפר את החוק', 'בניגוד לחוק']) T.ok(!s.includes(w), `${f}: "${w}"`);
  }
});
T.test('every result carries the calm note, with sources the rights guide already links', () => {
  const note = /const RESULT_NOTE = `([^`]+)`/.exec(ps);
  T.ok(note, 'RESULT_NOTE');
  T.ok(/ולא ייעוץ משפטי/.test(note[1]) && /הערכה/.test(note[1]), 'an estimate, not legal advice');
  const rights = read('src/app/views-rights.js');
  const urls = [...note[1].matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  T.eq(urls.length, 2);
  for (const u of urls) T.ok(rights.includes(`'${u}'`), 'a source the rights guide links: ' + u);
  const body = ps.slice(ps.indexOf('function analysisHtml('), ps.indexOf('function gapCheck('));
  T.ok(/\$\{RESULT_NOTE\}/.test(body), 'drawn on the result');
});

T.section('the payslip check: "the reading is wrong"');
T.test('fix in place, or a request to the team with nothing from the payslip', () => {
  const wrong = ps.slice(ps.indexOf('function wrongHtml()'), ps.indexOf('function inviteHtml()'));
  T.ok(/data-edit/.test(wrong) && /data-ps-feedback/.test(wrong), 'both ways');
  const fb = /const feedbackText = \(source\) => `([^`]+)`;/.exec(ps);
  T.ok(fb, 'feedbackText');
  // the only thing it says about the payslip is how it was read (a fixed label): no field, no amount, no text
  T.eq([...fb[1].matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]).join(' | '), '(SOURCE[source] || SOURCE.manual)[1]');
  const click = ps.slice(ps.indexOf("if (b.hasAttribute('data-ps-feedback'))"), ps.indexOf("if (b.hasAttribute('data-ps-invite'))"));
  T.ok(/Support\.newTicket\('payslip', feedbackText\(slip\.source\)\)/.test(click), 'the help centre\'s form, where the person sees and edits the text');
  T.ok(!/fields|\.text\b|fileId|money|amount/.test(click), 'nothing else from the payslip');
  T.ok(read('src/app/views-support.js').includes("['payslip', 'receipt'"), 'the help centre has a payslip reason');
});

T.section('the payslip check: sharing a good result');
T.test('an invite to the app, with no number and nothing from the payslip', () => {
  const text = /const INVITE_TEXT = '([^']+)';/.exec(ps);
  T.ok(text, 'INVITE_TEXT');
  T.ok(!/[\d₪$%]/.test(text[1]), 'no number: ' + text[1]);
  T.ok(/const INVITE_URL = 'https:\/\/leelor123\.github\.io\/shifts\/';/.test(ps), 'the app\'s own address');
  const click = ps.slice(ps.indexOf("if (b.hasAttribute('data-ps-invite'))"), ps.indexOf("if (b.hasAttribute('data-copy-msg'))"));
  T.ok(/UI\.shareText\(INVITE_TEXT, \{ title: 'Shaati', url: INVITE_URL, okText: '[^'$]+' \}\)/.test(click), 'shares only the fixed text and link (copied when the phone cannot share)');
  const body = ps.slice(ps.indexOf('function analysisHtml('), ps.indexOf('function gapCheck('));
  T.ok(/\$\{good \? inviteHtml\(\) : ''\}/.test(body), 'only on a good result');
  const card = ps.slice(ps.indexOf('function inviteHtml()'), ps.indexOf('const feedbackText'));
  T.ok(!/\$\{(?!icon\()/.test(card), 'the card shows nothing but an icon from the code');
});

T.section('the payslip check: a payslip with no shifts logged (a new user checks a payslip first)');
{
  const { U, Engine, Payslip, Defaults } = globalThis;
  const modelOf = (shifts) => {
    const settings = Defaults.defaultSettings();
    settings.startDate = '2025-06-01';
    return Engine.buildModel({ settings, employers: [Defaults.defaultEmployer()], roles: Defaults.defaultRoles(), dayRules: [], shifts, entries: [] });
  };
  const slip = (rate) => ({ period: '2026-09', other: [], fields: { base: { value: 40 * rate, qty: 40, rate }, ot125: { value: 100, qty: 2 }, rest150: { value: 240, qty: 4 }, travel: { value: 135.6 }, gross: { value: 40 * rate + 475.6 }, nationalInsurance: { value: 21.35 }, healthTax: { value: 66.31 }, net: { value: 40 * rate + 300 } } });
  const SHIFT_AREAS = ['שעות', 'שבת וחג', 'שעות נוספות', 'נסיעות', 'תעריף'];
  T.test('no comparison with zero logged hours, and the law checks stay', () => {
    const a = Payslip.analyze(slip(40), modelOf([]));
    T.ok(a.noShifts, 'noShifts');
    T.eq(a.findings.filter((f) => SHIFT_AREAS.includes(f.area)).map((f) => f.title).join(' | '), '', 'no shifts-vs-payslip finding');
    T.ok(a.findings.some((f) => f.area === 'שכר מינימום'), 'minimum wage');
    T.ok(a.findings.some((f) => f.area === 'ביטוח לאומי'), 'National Insurance');
    T.ok(a.findings.some((f) => f.area === 'פנסיה'), 'pension');
  });
  T.test('a rate below the minimum wage is still flagged with no shifts', () => {
    const a = Payslip.analyze(slip(20), modelOf([]));
    T.ok(a.findings.some((f) => f.area === 'שכר מינימום' && f.status === 'bad'));
  });
  T.test('shifts in another month only: still nothing to compare', () => {
    const s = { id: 'x1', kind: 'shift', employerId: 'emp1', roleId: 'r_sadran', status: 'done', start: U.toEpoch('2026-07-01', '08:00'), end: U.toEpoch('2026-07-01', '16:00'), items: [] };
    T.ok(Payslip.analyze(slip(40), modelOf([s])).noShifts);
  });
  T.test('the result says it calmly and offers to log shifts or import a schedule', () => {
    T.ok(/const hero = a\.noShifts \? noShiftsHtml/.test(ps), 'in place of the "matches the shifts" card');
    const card = ps.slice(ps.indexOf('const noShiftsHtml'), ps.indexOf('const hero ='));
    T.ok(/data-act="shift-new"/.test(card) && /data-act="import-schedule"/.test(card), 'both ways to add shifts');
    T.ok(/reconcileHtml\(rcShown\)/.test(ps) && /const rcShown = a\.noShifts \? null : rc;/.test(ps), 'no "payslip against the app" comparison');
  });
}
