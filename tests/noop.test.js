/* Nothing changed, nothing written (the user, 6 Nov 2026: "update the code to today's rules" made a new version with the
 * same rules). A save, a setting, the running shift, the account marker, the statistics record, a workplace code's
 * "changes" and a double tap: each one writes, sends, logs and says "saved" only for a real change. The real store.js,
 * shift-log.js, cloud.js and stats.js run against the fake server (fakes.js), which lists every write it gets. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { fakeIndexedDB, fakeBackend, fakeClient } = require('./fakes.js');

// (NOOP_SRC=<a copy of src/> runs the same checks on another version: before the fix, to see each one fail)
const SRC = process.env.NOOP_SRC || path.join(__dirname, '..', 'src');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const user = { uid: 'u1', email: 'me@example.com', displayName: 'Me' };

async function phone(backend, extra) {
  const ctx = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: fakeIndexedDB(), navigator: { onLine: true }, crypto: require('crypto').webcrypto, TextEncoder, Intl };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.UI = { dialog: async () => 'merge', confirm: async () => true, timeAgo: () => '', toast() {}, esc: (s) => String(s) };
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'core/ledger.js', 'app/store.js', 'app/shift-log.js', 'app/cloud.js'].concat(extra || [])) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  const { client, fs: ffs } = fakeClient(backend);
  ctx.Cloud._useSdk({ app: {}, auth: {}, db: {}, au: {}, fs: ffs });
  await ctx.Store.load();
  const events = [];
  ctx.Store.on((ev) => events.push(ev));
  return {
    ctx, ffs, S: ctx.Store.S, Store: ctx.Store, Cloud: ctx.Cloud, events,
    async add(id, note) { await ctx.Store.apply([{ store: 'shifts', put: { id, kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 1700000000000, end: 1700010000000, note: note || '' } }], 'x'); await ctx.ShiftLog.done(); },
    async sync() { await ctx.Cloud.syncNow(); await wait(40); },
  };
}
const writesTo = (be, re) => (be.writes || []).filter((p) => re.test(p)).length;

T.section('nothing changed, nothing written');

T.test('U.same: the same data in another key order is the same; a changed or added value is not', () => {
  const U = globalThis.U;
  T.ok(U.same({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }, { b: { c: [1, { e: 3, d: 2 }] }, a: 1 }));
  T.ok(U.same({ a: 1, x: undefined }, { a: 1 }), 'a key holding undefined is no key (as JSON keeps it)');
  T.ok(!U.same({ a: 1 }, { a: 2 }));
  T.ok(!U.same({ a: 1 }, { a: 1, b: null }));
  T.ok(!U.same([1, 2], [2, 1]), 'a list keeps its order');
  T.ok(U.same(null, null) && !U.same(null, {}));
});

T.atest('U.single: a second call while the first runs gets the same run and starts nothing', async () => {
  const U = globalThis.U;
  let runs = 0;
  const f = U.single(async (x) => { runs++; await wait(20); return x; });
  const [a, b] = await Promise.all([f(1), f(2)]);
  T.eq(runs, 1, 'one run for a double tap');
  T.eq(a, 1); T.eq(b, 1);
  T.eq(await f(3), 3, 'once it has finished, the next call runs');
  T.eq(runs, 2);
  let sync = 0;
  const g = U.single(() => { sync++; return 'now'; });
  T.eq(sync, 0); g(); T.eq(sync, 1, 'it starts inside the tap, not a moment later');
});

T.atest('a shift saved exactly as it is: no new version, nothing sent, no undo step, no log record', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.add('s1', 'hello');
  await A.Cloud.connect(user); await wait(60);
  const ver = A.S.shifts[0].updatedAt, logs = A.S.ledger.length, sent = writesTo(be, /\/shifts\//);
  A.events.length = 0;
  const copy = JSON.parse(JSON.stringify(A.S.shifts[0]));
  delete copy._syncedAt; copy.createdAt = 5; // (an editor's copy: its own stamps)
  copy.overrides = null; copy.overrideReason = ''; // (and the empty fields the editor adds to a timer's shift)
  const out = await A.Store.apply([{ store: 'shifts', put: copy }], 'עריכת משמרת');
  await A.ctx.ShiftLog.done(); await A.sync();
  T.eq(out, null, 'Store.apply says nothing changed');
  T.eq(A.S.shifts[0].updatedAt, ver, 'the same version');
  T.eq(A.Store.dirtyRecords().length, 0, 'nothing waiting to go up');
  T.eq(writesTo(be, /\/shifts\//), sent, 'no write to the cloud');
  T.eq(A.S.ledger.length, logs, 'no record in the signed shift log');
  T.eq(A.events.filter((e) => e.type === 'data').length, 0, 'the screens are not calculated again');
  T.eq(await A.Store.undo(), 'x', 'the undo step is still the earlier one');
  // a real change still saves and goes up
  await A.add('s2', 'two');
  const edited = Object.assign(JSON.parse(JSON.stringify(A.S.shifts.find((x) => x.id === 's2'))), { note: 'changed' });
  T.eq(await A.Store.apply([{ store: 'shifts', put: edited }], 'edit'), true);
  await A.sync();
  T.eq(JSON.parse(be.docs.get('users/u1/shifts/s2').j).note, 'changed');
});

T.atest('a setting or a phone note set to what it already is, inside Store.apply: nothing', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.Store.setSettings((s) => { s.leave = Object.assign({}, s.leave, { workWeek: 6 }); });
  const ver = A.S.settings._updatedAt;
  await A.Store.setMeta({ settingsDirty: false });
  const out = await A.Store.apply([{ setting: { path: ['leave', 'workWeek'], value: 6 } }, { meta: { key: 'rolePhotos', value: A.S.meta.rolePhotos } }], 'חוקי מקום העבודה');
  T.eq(out, null);
  T.eq(A.S.settings._updatedAt, ver);
  T.eq(A.S.meta.settingsDirty, false, 'the settings are not sent again');
});

T.atest('a setting set to what it already is: not saved, not sent, the screens are not calculated again', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.Store.setSettings((s) => { s.onboarded = true; s.goal.amount = 5000; });
  await A.Cloud.connect(user); await wait(60);
  const ver = A.S.settings._updatedAt, sent = writesTo(be, /kv\/settings$/);
  A.events.length = 0;
  await A.Store.setSettings((s) => { s.goal.amount = 5000; s.theme = s.theme; }, 'יעד');
  await A.sync();
  T.eq(A.S.settings._updatedAt, ver, 'the same version');
  T.ok(!A.S.meta.settingsDirty, 'nothing waiting to go up');
  T.eq(writesTo(be, /kv\/settings$/), sent, 'no write to the cloud');
  T.eq(A.events.length, 0, 'no settings event (it recalculated every screen)');
  T.eq(await A.Store.undo(), null, 'no undo step for nothing');
  await A.Store.setSettings((s) => { s.goal.amount = 6000; });
  await A.sync();
  T.eq(JSON.parse(be.docs.get('users/u1/kv/settings').j).goal.amount, 6000, 'a real change still goes up');
});

T.atest('a backup date or the code lock changes on the phone only: saved here, no new version for the account', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.Store.setSettings((s) => { s.onboarded = true; });
  await A.Cloud.connect(user); await wait(60);
  const ver = A.S.settings._updatedAt, sent = writesTo(be, /kv\/settings$/);
  A.events.length = 0;
  await A.Store.setSettings((s) => { s.backup.lastBackup = 123; s.backup.lastAuto = 123; });
  await A.sync();
  T.eq(A.S.settings.backup.lastBackup, 123, 'kept on the phone');
  T.eq(A.S.settings._updatedAt, ver, 'the account\'s settings keep their version');
  T.eq(writesTo(be, /kv\/settings$/), sent, 'nothing sent (every automatic backup sent the whole settings)');
  T.eq(A.events.filter((e) => e.type === 'settings').length, 1, 'the screens still hear of it');
  // another phone's newer settings still arrive, and the backup date stays this phone's
  const B = await phone(be);
  await B.Cloud.connect(user); await wait(150);
  await B.Store.setSettings((s) => { s.goal.amount = 777; });
  await B.sync(); await wait(150);
  T.eq(A.S.settings.goal.amount, 777);
  T.eq(A.S.settings.backup.lastBackup, 123);
});

T.atest('the running shift set to what it is: no new version for the other phones', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.Cloud.connect(user); await wait(60);
  await A.Store.setActive({ start: 1700000000000, roleId: 'r1', employerId: 'emp1', splits: [], breaks: [] });
  await A.sync();
  const ver = A.S.meta.activeUpdatedAt, sent = writesTo(be, /kv\/active$/);
  A.events.length = 0;
  await A.Store.setActive({ breaks: [], splits: [], employerId: 'emp1', roleId: 'r1', start: 1700000000000 });
  await A.sync();
  T.eq(A.S.meta.activeUpdatedAt, ver);
  T.eq(writesTo(be, /kv\/active$/), sent, 'no write');
  T.eq(A.events.length, 0);
});

T.atest('the account marker (users/{uid}) goes up once a day, not with every upload', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.Cloud.connect(user); await wait(60);
  for (let i = 0; i < 4; i++) { await A.add('s' + i, 'n' + i); await A.sync(); }
  T.eq(writesTo(be, /^users\/u1$/), 1, 'one marker for four uploads (it was one per upload)');
  T.eq(writesTo(be, /\/shifts\//) >= 4, true, 'the shifts went up');
  // a new version of the app: the marker says so on the next upload
  A.ctx.APP_VERSION = '9.9.9';
  await A.add('s9', 'x'); await A.sync();
  T.eq(writesTo(be, /^users\/u1$/), 2);
  T.eq(be.docs.get('users/u1').app, '9.9.9');
});

T.atest('statistics: the same record as the last one sent is not sent again; a new count is', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  const ctx = A.ctx;
  ctx.App = { androidApp: false, roles: () => [], legalAccepted: () => true };
  ctx.matchMedia = () => ({ matches: false });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'app/stats.js'), 'utf8'), ctx, { filename: 'app/stats.js' });
  await A.Store.setSettings((s) => { s.statsAsked = true; s.shareStats = true; });
  ctx.Cloud.user = user;
  ctx.Cloud.sdk = async () => ({ fs: A.ffs, db: {} });
  await ctx.Stats.report(); await wait(20);
  T.eq(writesTo(be, /^stats\//), 1);
  await A.Store.setMeta({ statsSentAt: 0 }); // six hours later
  await ctx.Stats.report(); await wait(20);
  T.eq(writesTo(be, /^stats\//), 1, 'the same day and counts: no write');
  await A.add('s1', 'a shift'); await A.Store.setMeta({ statsSentAt: 0 });
  await ctx.Stats.report(); await wait(20);
  T.eq(writesTo(be, /^stats\//), 2, 'a new shift: the record goes');
});

T.test('a workplace code: a value no shift uses on either side shows no "משתנה"', () => {
  const W = globalThis.Workplace;
  const emp = { name: 'קפה', otLaw: true, otThreshold: 8, roundingMode: 'none', roundingUnit: 15, travelPerDay: 0, travelMonthlyCap: 0, payDay: 9 };
  const rec = { n: 'קפה', otLaw: true, otThreshold: 9, roundingMode: 'none', roundingUnit: 5, travelPerDay: 0, travelMonthlyCap: 300, payDay: 9, ro: [] };
  T.eq(W.changes(emp, 5, rec, [], '2026-11-06').join(','), '', 'the same rules on screen: nothing marked');
  // the same values do count once a side uses them
  T.eq(W.changes(emp, 5, Object.assign({}, rec, { otLaw: false })).sort().join(','), 'otLaw,otThreshold');
  T.eq(W.changes(emp, 5, Object.assign({}, rec, { roundingMode: 'up' })).sort().join(','), 'roundingMode,roundingUnit');
  T.eq(W.changes(emp, 5, Object.assign({}, rec, { travelPerDay: 12 })).sort().join(','), 'travelMonthlyCap,travelPerDay');
  T.eq(W.changes(emp, 5, Object.assign({}, rec, { payDay: 10 })).join(','), 'payDay');
});
