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
