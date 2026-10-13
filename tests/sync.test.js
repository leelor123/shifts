/* Cloud sync tests: several simulated phones, each with its own local
 * database, talking to one fake Firestore backend. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { fakeIndexedDB, fakeBackend, fakeClient } = require('./fakes.js');

const SRC = path.join(__dirname, '..', 'src');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function phone(backend, opts) {
  opts = opts || {};
  const ctx = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: fakeIndexedDB(), navigator: { onLine: true } };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.UI = { dialog: async () => opts.answer || 'merge', confirm: async () => true, timeAgo: () => '', toast() {} };
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'app/store.js', 'app/cloud.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  const { client, fs: ffs } = fakeClient(backend);
  ctx.Cloud._useSdk({ app: {}, auth: {}, db: {}, au: {}, fs: ffs });
  await ctx.Store.load();
  const S = ctx.Store.S;
  return {
    ctx, client, ffs, S, Store: ctx.Store, Cloud: ctx.Cloud,
    shift: (id) => S.shifts.find((x) => x.id === id),
    async add(id, note) { await ctx.Store.apply([{ store: 'shifts', put: { id, kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 1, end: 2, note: note || '' } }], 'x'); },
    async sync() { await ctx.Cloud.syncNow(); await wait(30); },
  };
}
const user = { uid: 'u1', email: 'me@example.com', displayName: 'Me' };
const live = (backend, store) => [...backend.docs].filter(([k, v]) => k.startsWith('users/u1/' + store + '/') && !v.d).length;

T.atest('first sign-in uploads the phone\'s data to an empty account', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.add('s1', 'first'); await A.add('s2', 'second');
  await A.Store.setSettings((s) => { s.onboarded = true; s.goal.amount = 5000; s.ai.apiKey = 'sk-secret'; });
  await A.Cloud.connect(user); await wait(30);
  T.eq(live(be, 'shifts'), 2);
  T.ok(be.docs.has('users/u1/kv/settings'), 'settings uploaded');
  T.ok(!be.docs.get('users/u1/kv/settings').j.includes('sk-secret'), 'API key never leaves the phone');
  T.eq(A.Store.dirtyRecords().length, 0, 'nothing left to upload');
});

T.atest('a new phone signing in gets everything from the account', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.add('s1', 'hello');
  await A.Store.setSettings((s) => { s.onboarded = true; s.goal.amount = 7000; });
  await A.Cloud.connect(user); await wait(30);
  const B = await phone(be);
  await B.Cloud.connect(user); await wait(200);
  T.eq(B.shift('s1').note, 'hello');
  T.eq(B.S.settings.onboarded, true, 'skips the setup wizard');
  T.eq(B.S.settings.goal.amount, 7000);
});

T.atest('edits and deletions flow between phones', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1', 'v1'); await A.add('s2', 'keep');
  await A.Cloud.connect(user); await wait(30);
  const B = await phone(be); await B.Cloud.connect(user); await wait(200);
  await wait(5);
  await A.Store.apply([{ store: 'shifts', put: Object.assign({}, A.shift('s1'), { note: 'v2' }) }], 'edit');
  await A.sync(); await wait(200);
  T.eq(B.shift('s1').note, 'v2', 'edit reached the other phone');
  await B.Store.apply([{ store: 'shifts', del: 's2' }], 'del');
  await B.sync(); await wait(200);
  T.ok(!A.shift('s2'), 'deletion reached the other phone');
  T.ok(be.docs.get('users/u1/shifts/s2').d === true, 'kept as a tombstone');
});

T.atest('a phone that was offline cannot overwrite a newer change', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('x', 'original');
  await A.Cloud.connect(user); await wait(30);
  const B = await phone(be); await B.Cloud.connect(user); await wait(200);
  A.client.online = false; A.ctx.navigator.onLine = false;
  await wait(5);
  await A.Store.apply([{ store: 'shifts', put: Object.assign({}, A.shift('x'), { note: 'old edit (offline)' }) }], 'edit');
  await A.sync();
  await wait(5);
  await B.Store.apply([{ store: 'shifts', put: Object.assign({}, B.shift('x'), { note: 'newer edit' }) }], 'edit');
  await B.sync(); await wait(50);
  A.ctx.navigator.onLine = true;
  await A.client.goOnline(); await wait(300);
  T.eq(JSON.parse(be.docs.get('users/u1/shifts/x').j).note, 'newer edit', 'server keeps the newer version');
  T.eq(A.shift('x').note, 'newer edit', 'the offline phone adopts the newer version');
  T.ok(be.rejected >= 1, 'the stale write was refused');
});

T.atest('edits made offline are uploaded when the network returns', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.Cloud.connect(user); await wait(30);
  const B = await phone(be); await B.Cloud.connect(user); await wait(200);
  A.client.online = false; A.ctx.navigator.onLine = false;
  await A.add('off1', 'made offline'); await A.sync();
  T.eq(live(be, 'shifts'), 0, 'not on the server yet');
  A.ctx.navigator.onLine = true;
  await A.client.goOnline(); await wait(250);
  T.eq(live(be, 'shifts'), 1);
  T.eq(B.shift('off1').note, 'made offline');
});

T.atest('signing in on a phone that already has its own data merges both', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('a1', 'from A');
  await A.Cloud.connect(user); await wait(30);
  const C = await phone(be, { answer: 'merge' }); await C.add('c1', 'from C');
  await C.Cloud.connect(user); await wait(250);
  T.ok(C.shift('a1') && C.shift('c1'), 'C has both');
  await wait(250);
  T.ok(A.shift('c1'), 'A received C\'s shift');
  T.eq(live(be, 'shifts'), 2);
});

T.atest('raw payslip text and file stay on the phone', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.Cloud.connect(user); await wait(30);
  await A.Store.apply([{ store: 'payslips', put: { id: 'p1', period: '2026-09', fields: { net: { value: 5000 } }, text: 'ת.ז 012345678', fileId: 'file_1' } }], 'x');
  await A.sync();
  const j = be.docs.get('users/u1/payslips/p1').j;
  T.ok(!j.includes('012345678') && !j.includes('file_1'), 'not uploaded');
  T.ok(j.includes('5000'), 'the verified fields are synced');
  const B = await phone(be); await B.Cloud.connect(user); await wait(200);
  T.eq(B.S.payslips[0].fields.net.value, 5000);
  T.eq(B.S.payslips[0].text, undefined);
});

T.atest('the running shift timer follows you between phones', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.Cloud.connect(user); await wait(30);
  const B = await phone(be); await B.Cloud.connect(user); await wait(200);
  await A.Store.setActive({ start: 12345, roleId: 'r1', employerId: 'emp1', splits: [], breaks: [] });
  await A.sync(); await wait(200);
  T.eq(B.S.activeShift && B.S.activeShift.start, 12345);
});

T.atest('deleting the account removes all cloud data and the sign-in account', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.add('s1'); await A.add('s2');
  await A.Cloud.connect(user); await wait(30);
  T.eq(live(be, 'shifts'), 2);
  const calls = [];
  const signedIn = Object.assign({}, user, { metadata: { lastSignInTime: new Date(Date.now() - 3600e3).toUTCString() }, delete() {} });
  A.Cloud._useSdk({ app: {}, auth: { currentUser: signedIn }, db: {}, fs: A.ffs, au: {
    GoogleAuthProvider: function () {},
    reauthenticateWithPopup: async (u) => { calls.push('reauth:' + u.uid); },
    deleteUser: async (u) => { calls.push('delete:' + u.uid); },
    signOut: async () => { calls.push('signout'); },
  } });
  await A.Cloud.deleteAccountData();
  T.eq([...be.docs.keys()].filter((k) => k.startsWith('users/u1')).length, 0, 'nothing left in the cloud');
  T.eq(calls.join(','), 'reauth:u1,delete:u1,signout', 'old sign-in is confirmed again, then the account is deleted');
  T.eq(A.S.shifts.length, 0, 'phone cleared');
});

T.atest('signing in with a different account never mixes the two accounts', async () => {
  const be = fakeBackend();
  const B = await phone(be); await B.add('b1', 'belongs to account 2');
  await B.Cloud.connect({ uid: 'u2', email: 'two@example.com' }); await wait(30);
  const A = await phone(be); await A.add('a1', 'belongs to account 1');
  await A.Cloud.connect(user); await wait(30);
  await A.Cloud.connect({ uid: 'u2', email: 'two@example.com' }); await wait(250);
  T.ok(!be.docs.has('users/u2/shifts/a1'), 'account 1 data did not leak into account 2');
  T.ok(!A.shift('a1'), 'the phone shows only the new account');
  T.eq(A.shift('b1') && A.shift('b1').note, 'belongs to account 2');
  T.ok(be.docs.has('users/u1/shifts/a1'), 'account 1 data is still safe in account 1');
});

T.atest('a change is not marked as synced until the server confirms it', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.Cloud.connect(user); await wait(30);
  A.client.online = false; A.ctx.navigator.onLine = false;
  await A.add('p1', 'pending'); await A.sync();
  T.eq(A.Store.dirtyRecords().length, 1, 'still waiting for the server');
  A.ctx.navigator.onLine = true;
  await A.client.goOnline(); await wait(100);
  T.eq(A.Store.dirtyRecords().length, 0, 'confirmed');
  T.eq(live(be, 'shifts'), 1);
});

T.atest('restoring a backup keeps the account link and uploads the restored data', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1', 'before');
  await A.Cloud.connect(user); await wait(30);
  const backup = JSON.parse(JSON.stringify(await A.Store.exportBackup(false)));
  backup.meta.cloudUid = 'someone-else';
  backup.shifts.push({ id: 's9', kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 1, end: 2, note: 'from backup', updatedAt: 5, _syncedAt: 5 });
  backup.roles = [{ id: 'r1', name: 'x', color: '#fff" onclick="alert(1)', rates: [], employerId: 'emp1' }];
  await A.Store.importBackup(backup, 'replace'); await wait(250);
  T.eq(A.S.meta.cloudUid, 'u1', 'still linked to the signed-in account');
  T.ok(be.docs.has('users/u1/shifts/s9'), 'restored shift uploaded');
  T.eq(A.S.roles[0].color, '#888888', 'unsafe colour value replaced');
});

/* ---------------- anonymous statistics ---------------- */
async function withStats(A, legal) {
  A.ctx.App = { androidApp: false, roles: () => A.S.roles, legalAccepted: () => legal !== false, tab: 'home' };
  vm.runInContext(fs.readFileSync(path.join(SRC, 'app/stats.js'), 'utf8'), A.ctx, { filename: 'app/stats.js' });
  return A.ctx.Stats;
}
const statsDocs = (be) => [...be.docs].filter(([k]) => k.startsWith('stats/'));

T.atest('statistics: one anonymous record per device, nothing personal in it', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1'); await A.add('s2');
  await withStats(A);
  await A.Cloud.connect(user); await wait(60);
  const docs = statsDocs(be);
  T.eq(docs.length, 1, 'one record');
  const [key, rec] = docs[0];
  T.ok(key.length - 6 >= 16 && key.length - 6 <= 40, 'random id within the rule limits');
  T.eq(Object.keys(rec).sort().join(','), 'age,days,f,first,last,p,ps,s30,sh,t,v');
  T.eq(rec.sh, 2);
  const json = JSON.stringify(rec);
  T.ok(!json.includes('me@example.com') && !json.includes('"u1"') && !json.includes('"Me"'), 'no email, user id or name');
  T.ok(!key.includes('u1/') && key === 'stats/' + A.S.meta.installId, 'stored under the random device id only');
});

T.atest('statistics: off deletes the record and stops sending; never before the policy is accepted', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  const Stats = await withStats(A);
  await A.Cloud.connect(user); await wait(60);
  T.eq(statsDocs(be).length, 1);
  await A.Store.setSettings((s) => { s.shareStats = false; });
  await Stats.forget(); await wait(20);
  T.eq(statsDocs(be).length, 0, 'removed');
  await Stats.report(true); await wait(20);
  T.eq(statsDocs(be).length, 0, 'not sent while off');
  const B = await phone(be);
  const SB = await withStats(B, false);
  await B.Cloud.connect({ uid: 'u3', email: 'x@example.com' }); await wait(60);
  await SB.report(true); await wait(20);
  T.eq(statsDocs(be).length, 0, 'not sent before the privacy policy was accepted');
});

T.atest('statistics: deleting the account also deletes the statistics record', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await withStats(A);
  await A.Cloud.connect(user); await wait(60);
  T.eq(statsDocs(be).length, 1);
  const signedIn = Object.assign({}, user, { metadata: { lastSignInTime: new Date().toUTCString() }, delete() {} });
  A.Cloud._useSdk({ app: {}, auth: { currentUser: signedIn }, db: {}, fs: A.ffs, au: { deleteUser: async () => {}, signOut: async () => {} } });
  await A.Cloud.deleteAccountData();
  T.eq(statsDocs(be).length, 0, 'statistics record removed');
});

T.atest('admin rights come only from the admins list', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  const Stats = await withStats(A);
  await A.Cloud.connect(user); await wait(60);
  T.eq(A.ctx.App.isAdmin, false, 'a regular user');
  be.docs.set('admins/u1', { added: 1, by: 'owner-setup' });
  T.eq(await Stats.checkAdmin(), true, 'listed user is an admin');
  be.docs.delete('admins/u1');
  T.eq(await Stats.checkAdmin(), false, 'removed again');
});

T.atest('statistics: turning it off on one phone removes the other phone\'s record too', async () => {
  const be = fakeBackend();
  const A = await phone(be); const SA = await withStats(A);
  const B = await phone(be); const SB = await withStats(B);
  await A.Cloud.connect(user); await B.Cloud.connect(user); await wait(80);
  T.eq(statsDocs(be).length, 2, 'two phones, two records');
  await B.Store.setSettings((s) => { s.shareStats = false; });
  await SB.forget(); await B.sync(); await A.sync(); await wait(100);
  T.eq(A.S.settings.shareStats, false, 'the choice reached the other phone');
  await SA.report(); await wait(30);
  T.eq(statsDocs(be).length, 0, 'both records removed');
});
