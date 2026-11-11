/* The app remembers and stops asking (the user, 11 Nov 2026: "the app keeps asking about the payslip even after the payslip
 * was uploaded, and does not remember, learn or know you"; 9 Nov: "I uploaded a payslip and the message stayed").
 *   - the payslip of a pay period: the payday reminder stops once it is in, also when its month was read one month late
 *     (Insights.slipPeriod), and comes on the day this person usually saves it (Insights.slipLag);
 *   - a reminder whose reason is gone stops waiting as "new" in the app (Insights.resolvedNotes);
 *   - "did the salary arrive?" is not asked with the payslip in, and comes on the day the salary usually arrives;
 *   - answers and "seen" go with the account: another phone does not ask again (store.js ACCOUNT_META, settings.mem).
 * Synthetic data only. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { U, Engine, Insights, Defaults, Moments: M } = globalThis;
const { fakeIndexedDB, fakeBackend, fakeClient } = require('./fakes.js');

let n = 0;
function shift(date, from, to) {
  return { id: 'm' + (++n), kind: 'shift', employerId: 'emp1', roleId: 'r_sadran', status: 'done', start: U.toEpoch(date, from), end: U.toEpoch(date, to), items: [] };
}
function model() {
  const settings = Defaults.defaultSettings();
  settings.startDate = '2026-01-01';
  const shifts = [];
  for (const m of ['2026-08', '2026-09', '2026-10', '2026-11']) for (const d of ['05', '12', '19']) shifts.push(shift(m + '-' + d, '09:00', '15:00'));
  return Engine.buildModel({ settings, employers: [Defaults.defaultEmployer()], roles: Defaults.defaultRoles(), dayRules: [], shifts, entries: [] });
}
const emp = Defaults.defaultEmployer(); // the calendar month, paid on the 9th of the next one
const slip = (id, period, savedDay) => ({ id, period, createdAt: U.toEpoch(savedDay, '13:00'), fields: {}, other: [] });
const dueOn = (mdl, day, payslips) => Insights.run(mdl, { now: U.toEpoch(day, '14:00'), activeShift: null, payslips, gaps: [], lastBackup: Date.now() })
  .alerts.filter((a) => a.type === 'payslipDue');

T.section('the payslip of a pay period: asked until it is in');
T.test('pay day with no payslip: the reminder for last month, with its period', () => {
  const a = dueOn(model(), '2026-11-09', []);
  T.eq(a.length, 1);
  T.eq(a[0].key, 'payslip-2026-10');
  T.eq(a[0].data.pk, '2026-10', 'the period travels with the note (a tap opens that payslip once it is in)');
});
T.test('the payslip of October saved on pay day: no reminder', () => {
  T.eq(dueOn(model(), '2026-11-09', [slip('ps1', '2026-10', '2026-11-09')]).length, 0);
  T.eq(dueOn(model(), '2026-11-12', [slip('ps1', '2026-10', '2026-11-09')]).length, 0, 'nor on the days after');
});
T.test('one month late: October\'s payslip read as November (its print date) still counts for October', () => {
  const late = slip('ps1', '2026-11', '2026-11-09'); // November has not ended: it cannot be November's payslip
  T.eq(Insights.slipPeriod(late, emp), '2026-10');
  T.eq(dueOn(model(), '2026-11-09', [late]).length, 0, 'no reminder for October');
  // a month later the same payslip does not stand in for November's
  T.eq(dueOn(model(), '2026-12-09', [late]).map((a) => a.key).join(), 'payslip-2026-11', 'November is still asked for');
  T.eq(Insights.slipPeriod(slip('ps2', '2026-11', '2026-12-09'), emp), '2026-11', 'a payslip saved after its month ended keeps its month');
});
T.test('a payslip with no save time keeps the month written on it', () => {
  T.eq(Insights.slipPeriod({ id: 'x', period: '2026-10' }, emp), '2026-10');
  T.eq(Insights.slipPeriod({ id: 'x', period: '' }, emp), null);
});
T.test('learned: the reminder comes on the day this person usually saves the payslip', () => {
  const past = [slip('a', '2026-08', '2026-09-12'), slip('b', '2026-09', '2026-10-12')]; // three days after the 9th, twice
  T.eq(Insights.slipLag(past, emp), 3);
  T.eq(dueOn(model(), '2026-11-09', past).length, 0, 'not on the pay date');
  T.eq(dueOn(model(), '2026-11-12', past).length, 1, 'on the usual day');
  T.ok(/3 ימים/.test(dueOn(model(), '2026-11-12', past)[0].explain), 'it says why it came then');
  T.eq(Insights.slipLag([past[0]], emp), 0, 'one payslip teaches nothing yet');
});
T.test('a reminder whose reason is gone is done in the app; news stays new', () => {
  const notes = [
    { id: 'payslip-2026-10', key: 'payslip-2026-10', type: 'payslipDue', read: false },
    { id: 'timer-1', key: 'timer-1', type: 'timer', read: false },
    { id: 'weekly-1', key: 'weekly-1', type: 'weekly', read: false },
    { id: 'payslip-2026-09', key: 'payslip-2026-09', type: 'payslipDue', read: true },
  ];
  T.eq(Insights.resolvedNotes(notes, new Set(['timer-1'])).map((x) => x.id).join(), 'payslip-2026-10');
  T.eq(Insights.resolvedNotes(notes, new Set(['timer-1', 'payslip-2026-10'])).length, 0, 'still true: still new');
});
T.test('the payday card, the salary card and a tap on the note all ask the same question (Insights.slipFor)', () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'app', f), 'utf8');
  T.ok(/function paydayCard[\s\S]{0,900}Insights\.slipFor\(/.test(src('views-home.js')), 'the payday card');
  T.ok(/Insights\.slipFor\(S\.payslips, P\.key/.test(src('salary-check.js')), 'the salary card');
  T.ok(/payslipDue[\s\S]{0,300}Insights\.slipFor\(/.test(src('views-insights.js')), 'a tap on the reminder');
  T.ok(/Insights\.resolvedNotes\(S\.notifications/.test(src('app.js')), 'the app marks done reminders');
});

T.section('"did the salary arrive?": learns, and does not ask what it knows');
T.test('with the period\'s payslip in, nothing is asked', () => {
  T.eq(M.salaryState(null, '2026-11-09', '2026-11-10', 13, { hasSlip: true }), null);
  T.eq(M.salaryState({ a: 'not', d: '2026-11-09' }, '2026-11-09', '2026-11-10', 13, { hasSlip: true }), null, 'not even after "not yet"');
  T.eq(M.salaryState({ a: 'other', d: '2026-11-09' }, '2026-11-09', '2026-11-10', 13, { hasSlip: true }), 'gap', 'a gap already shown stays until closed');
});
T.test('the usual day the salary arrives', () => {
  const ans = {
    '2026-08': { a: 'yes', d: '2026-09-11', pd: '2026-09-09', nots: 1 },
    '2026-09': { a: 'other', d: '2026-10-11', pd: '2026-10-09', nots: 2 },
  };
  T.eq(M.salaryLag(ans), 2);
  T.eq(M.salaryState(null, '2026-11-09', '2026-11-09', 13, { lag: 2 }), null, 'not on the pay date');
  T.eq(M.salaryState(null, '2026-11-09', '2026-11-11', 9, { lag: 2 }), 'ask', 'on the usual day');
  T.eq(M.salaryLag({ '2026-08': { a: 'yes', d: '2026-09-15', pd: '2026-09-09' }, '2026-09': { a: 'yes', d: '2026-10-09', pd: '2026-10-09' } }), 0, 'a "yes" at the first ask: it came on time');
  T.eq(M.salaryLag({ '2026-08': ans['2026-08'] }), 0, 'one answer teaches nothing yet');
});

T.section('what the app remembers goes with the account');
const SRC = path.join(__dirname, '..', 'src');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function phone(backend, idb) {
  const ctx = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: idb || fakeIndexedDB(), navigator: { onLine: true } };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.UI = { dialog: async () => 'merge', confirm: async () => true, timeAgo: () => '', toast() {} };
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'app/store.js', 'app/cloud.js']) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  const { fs: ffs } = fakeClient(backend);
  ctx.Cloud._useSdk({ app: {}, auth: {}, db: {}, au: {}, fs: ffs });
  await ctx.Store.load();
  return { ctx, S: ctx.Store.S, Store: ctx.Store, Cloud: ctx.Cloud, idb: ctx.indexedDB, async sync() { await ctx.Cloud.syncNow(); await wait(30); } };
}
const user = { uid: 'u1', email: 'me@example.com', displayName: 'Me' };

T.atest('an answer on one phone is not asked again on the other', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.Store.setSettings((s) => { s.onboarded = true; });
  await A.Cloud.connect(user); await wait(30);
  const B = await phone(be);
  await B.Cloud.connect(user); await wait(200);
  await A.Store.setMeta({ salaryAns: { '2026-10': { a: 'yes', d: '2026-11-09', amt: 4200, exp: 4200, raw: 4300, at: 5, pd: '2026-11-09' } }, recapSeen: '2026-10', guideDone: true });
  await A.sync(); await wait(200);
  T.eq(B.S.meta.salaryAns && B.S.meta.salaryAns['2026-10'] && B.S.meta.salaryAns['2026-10'].a, 'yes', 'the salary answer reached the other phone');
  T.eq(B.S.meta.recapSeen, '2026-10', 'the month\'s story seen');
  T.eq(B.S.meta.guideDone, true, 'the guide finished');
  // B answers the next month; A's answer for October stays
  await B.Store.setMeta({ salaryAns: Object.assign({}, B.S.meta.salaryAns, { '2026-11': { a: 'not', d: '2026-12-09', at: 9, pd: '2026-12-09', nots: 1 } }) });
  await B.sync(); await wait(200);
  T.eq(Object.keys(A.S.meta.salaryAns).sort().join(), '2026-10,2026-11', 'both answers on both phones');
});

T.atest('a phone from before (answers only in meta) sends them up after it heard the account', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.Store.setSettings((s) => { s.onboarded = true; });
  await A.Cloud.connect(user); await wait(30);
  // what 1.36.3 kept: the answer in meta only, nothing in settings.mem
  A.S.meta.salaryAns = { '2026-10': { a: 'other', d: '2026-11-10', amt: 3900, exp: 4200 } };
  A.S.meta.whatsNew = '1.36.3';
  delete A.S.settings.mem;
  await A.Store.saveAll();
  const A2 = await phone(be, A.idb); // the same phone, opened again with the new version
  T.ok(A2.S.meta.memUp, 'waits for the account before sending');
  T.eq(A2.S.settings.mem.salaryAns['2026-10'].amt, 3900, 'kept in the account\'s memory');
  await A2.Cloud.connect(user); await wait(200);
  await A2.sync(); await wait(100);
  T.ok(!A2.S.meta.memUp, 'sent');
  const B = await phone(be);
  await B.Cloud.connect(user); await wait(200);
  T.eq(B.S.meta.salaryAns && B.S.meta.salaryAns['2026-10'] && B.S.meta.salaryAns['2026-10'].amt, 3900, 'the other phone knows it');
  T.eq(B.S.meta.whatsNew, '1.36.3', 'and does not show what\'s new again');
});

T.test('two copies join: the later answer, flags stay set, "seen" keeps the latest', () => {
  // (the store's merge, read from the source so it runs without a phone)
  const ctx = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: fakeIndexedDB(), navigator: { onLine: true } };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'app/store.js']) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  const m = ctx.Store.mergeMem(
    { salaryAns: { '2026-09': { a: 'not', at: 9 }, '2026-10': { a: 'yes', at: 1 } }, guideDone: true, recapSeen: '2026-10', whatsNew: '1.36.10', ms: { shifts: 25, earned: 1000 } },
    { salaryAns: { '2026-09': { a: 'yes', at: 10 }, '2026-08': { a: 'yes', at: 2 } }, guideDone: false, recapSeen: '2026-09', whatsNew: '1.36.9', ms: { shifts: 10, earned: 5000 } });
  T.eq(Object.keys(m.salaryAns).sort().join(), '2026-08,2026-09,2026-10');
  T.eq(m.salaryAns['2026-09'].a, 'yes', 'the later answer');
  T.eq(m.guideDone, true);
  T.eq(m.recapSeen, '2026-10');
  T.eq(m.whatsNew, '1.36.10', 'versions by number, not by text');
  T.eq(JSON.stringify(m.ms), JSON.stringify({ shifts: 25, earned: 5000 }));
});
