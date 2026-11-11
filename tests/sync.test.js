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
  if (opts.ledger) Object.assign(ctx, { crypto: require('crypto').webcrypto, TextEncoder });
  vm.createContext(ctx);
  // (opts.ledger: with the signed shift log, as the app has it)
  const files = opts.ledger ? ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'core/ledger.js', 'app/store.js', 'app/shift-log.js', 'app/cloud.js']
    : ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'app/store.js', 'app/cloud.js'];
  for (const f of files) {
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

// User report, Nov 2026: a corrected payslip came back with the numbers it was read with
T.atest('a corrected payslip keeps the corrections on this phone, after a reload and on the other phone', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.Cloud.connect(user); await wait(30);
  const read = { id: 'p1', period: '2026-09', fields: { gross: { value: 6000, line: 'ברוטו 6,000.00' }, sickPay: { value: 19.5, line: 'מחלה 19.50' } }, other: [], text: 'ברוטו 6,000.00\nמחלה 19.50', fileId: 'file_1' };
  await A.Store.apply([{ store: 'payslips', put: read }], 'x');
  await A.sync();
  // corrected: the sick line removed, the gross fixed
  const fixed = Object.assign({}, read, { fields: { gross: { value: 6100, line: 'ברוטו 6,000.00' } } });
  await A.Store.apply([{ store: 'payslips', put: fixed }], 'x');
  await A.sync(); await A.sync();
  const mine = A.S.payslips.find((p) => p.id === 'p1');
  T.near(mine.fields.gross.value, 6100); T.ok(!mine.fields.sickPay, 'the removed line stays removed here');
  T.eq(mine.text, read.text, 'the text stays on the phone');
  await A.Store.load();
  const again = A.Store.S.payslips.find((p) => p.id === 'p1');
  T.near(again.fields.gross.value, 6100); T.ok(!again.fields.sickPay, 'and after a reload');
  const B = await phone(be); await B.Cloud.connect(user); await wait(200);
  T.near(B.S.payslips[0].fields.gross.value, 6100); T.ok(!B.S.payslips[0].fields.sickPay, 'and on the other phone');
});

// privacy audit, 3 Nov 2026 (B6): the line each number was read from went up as it was on the payslip
T.atest("a payslip's recognised lines reach the cloud without the ID, bank account, address or phone", async () => {
  const be = fakeBackend();
  const A = await phone(be);
  vm.runInContext(fs.readFileSync(path.join(SRC, 'core/payslip.js'), 'utf8'), A.ctx, { filename: 'core/payslip.js' });
  await A.Cloud.connect(user); await wait(30);
  const fields = { net: { value: 5000, line: 'נטו לתשלום 5,000.00 ת.ז 012345678' }, bank: { value: 1, line: 'בנק 12 סניף 345 חשבון 123456' }, gross: { value: 6000, line: 'AI' } };
  const other = [{ line: 'רחוב הרצל 5 תל אביב 4.00', value: 4, guess: null }, { line: 'טלפון 052-1234567 שעות 10.00', value: 10 }];
  await A.Store.apply([{ store: 'payslips', put: { id: 'p2', period: '2026-09', fields, other } }], 'x');
  await A.sync();
  const j = be.docs.get('users/u1/payslips/p2').j;
  for (const s of ['012345678', '123456', 'הרצל', '1234567']) T.ok(!j.includes(s), 'not uploaded: ' + s);
  const up = JSON.parse(j);
  T.ok(up.fields.net.line.includes('נטו לתשלום'), 'the rest of the line stays (it shows where the number came from)');
  T.eq(up.fields.net.value, 5000, 'the numbers are untouched');
  T.eq(up.fields.gross.line, 'AI', 'a number read by the AI says so');
  T.eq(up.other.length, 2);
  T.ok(A.S.payslips[0].fields.net.line.includes('012345678'), "this phone's own copy is not changed");
});

T.atest('the account marker holds no email', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1');
  await A.Cloud.connect(user); await wait(30);
  const m = be.docs.get('users/u1');
  T.ok(m && !('email' in m) && !JSON.stringify(m).includes('me@example.com'), JSON.stringify(m));
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

/* Privacy audit, 3 Nov 2026 (B3): the requests, the champions table row and the friends' card used to be deleted
 * with every error swallowed, and the sign-in account was deleted anyway: a failure left them on the server for
 * good, with no account to reach them. The real modules run here against the fake server. */
async function withOutside(A) {
  const c = A.ctx;
  c.App = Object.assign(c.App || {}, { actions: {}, games: { LIST: [] } });
  c.UI.icon = () => ''; c.UI.esc = (s) => String(s);
  // the queries the modules make (where field == value), on top of the fake server's collections
  A.ffs.where = (f, op, v) => ({ f, v });
  A.ffs.query = (coll, w) => ({ path: coll.path, w });
  const getDocs = A.ffs.getDocs;
  A.ffs.getDocs = async (q) => { const r = await getDocs(q); return q.w ? { docs: r.docs.filter((d) => d.data()[q.w.f] === q.w.v) } : r; };
  for (const f of ['app/views-support.js', 'app/views-leaderboard.js', 'app/views-friends.js']) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), c, { filename: f });
}
function seedOutside(be) {
  be.docs.set('tickets/t1', { uid: 'u1', reason: 'calc', text: 'my question', status: 'open', created: 1, updated: 1, last: 'user', seen: true });
  be.docs.set('tickets/t1/msgs/m1', { from: 'admin', text: 'an answer', t: 2 });
  be.docs.set('tickets/t2', { uid: 'u2', reason: 'bug', text: 'someone else', status: 'open', created: 1, updated: 1, last: 'user', seen: true });
  be.docs.set('lb/u1', { n: 'Me', e: '🙂', g: {} });
  be.docs.set('fr/u1', { n: 'Me', f: [] });
  be.docs.set('inv/abcdefghijklmnop', { from: 'u1', to: '' });
  be.docs.set('inv/qrstuvwxyzabcdef', { from: 'u2', to: '' });
}
const outside = (be) => ['tickets/t1', 'tickets/t1/msgs/m1', 'lb/u1', 'fr/u1', 'inv/abcdefghijklmnop'].filter((k) => be.docs.has(k));

T.atest('deleting the account: the requests, the table row, the friends card and the invitations go first', async () => {
  const be = fakeBackend(); seedOutside(be);
  const A = await phone(be); await A.add('s1');
  await A.Cloud.connect(user); await wait(30);
  await withOutside(A);
  const calls = [];
  const signedIn = Object.assign({}, user, { metadata: { lastSignInTime: new Date().toUTCString() }, delete() {} });
  A.Cloud._useSdk({ app: {}, auth: { currentUser: signedIn }, db: {}, fs: A.ffs, au: { deleteUser: async () => { calls.push('delete'); }, signOut: async () => {} } });
  await A.Cloud.deleteAccountData();
  T.eq(outside(be).join(','), '', 'nothing of the account is left outside its folder');
  T.ok(be.docs.has('tickets/t2') && be.docs.has('inv/qrstuvwxyzabcdef'), "another user's request and invitation stay");
  T.eq(calls.join(), 'delete', 'then the sign-in account');
});

T.atest('deleting the account stops before the sign-in account when something outside could not be deleted', async () => {
  const be = fakeBackend(); seedOutside(be);
  const A = await phone(be); await A.add('s1');
  await A.Cloud.connect(user); await wait(30);
  await withOutside(A);
  // the server refuses to delete the table row (offline, a rule, a timeout)
  const del = A.ffs.deleteDoc;
  let refuse = true;
  A.ffs.deleteDoc = (ref) => (refuse && ref.path === 'lb/u1' ? Promise.reject(Object.assign(new Error('refused'), { code: 'unavailable' })) : del(ref));
  const calls = [];
  const signedIn = Object.assign({}, user, { metadata: { lastSignInTime: new Date().toUTCString() }, delete() {} });
  A.Cloud._useSdk({ app: {}, auth: { currentUser: signedIn }, db: {}, fs: A.ffs, au: { deleteUser: async () => { calls.push('delete'); }, signOut: async () => { calls.push('signout'); } } });
  let failed = null;
  try { await A.Cloud.deleteAccountData(); } catch (e) { failed = e; }
  T.ok(failed && failed.code === 'unavailable', 'the person is told the deletion failed');
  T.eq(calls.join(), '', 'the sign-in account was not deleted, nor the phone signed out');
  T.ok(be.docs.has('lb/u1'), 'the row is still there, with an account to delete it with');
  T.ok(be.docs.has('users/u1/shifts/s1'), "the account's own data is untouched");
  T.eq(A.S.shifts.length, 1, 'the phone keeps its data');
  T.eq(A.Cloud.connected, true, 'sync goes on');
  // each module on its own: strict throws, the everyday call (leaving the table) does not
  await A.ctx.Champions.forget(); // no throw
  let strictThrew = false;
  try { await A.ctx.Champions.forget({ strict: true }); } catch (e) { strictThrew = true; }
  T.ok(strictThrew, 'Champions.forget strict throws');
  // tried again once the server answers: everything goes, then the account
  refuse = false;
  await A.Cloud.deleteAccountData();
  T.eq(outside(be).join(','), '', 'all gone on the second try');
  T.eq(calls.join(), 'delete,signout', 'and the account with it');
});

// privacy audit, 3 Nov 2026 (B11/A12): requests without an account and unused statistics records were kept forever
T.atest('retention: the dashboard deletes closed requests without an account after 12 months, statistics after 13', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  await A.Cloud.connect(user); await wait(30);
  await withOutside(A);
  A.ctx.UI.tile = () => ''; A.ctx.App.isAdmin = true;
  vm.runInContext(fs.readFileSync(path.join(SRC, 'app/views-admin.js'), 'utf8'), A.ctx, { filename: 'app/views-admin.js' });
  const U = A.ctx.U, now = Date.now(), DAY = 86400000;
  const tk = (uid, status, daysAgo) => ({ uid, email: uid ? undefined : 'x@example.com', reason: 'other', text: 'hi', status, created: now - daysAgo * DAY, updated: now - daysAgo * DAY, last: 'admin', seen: true });
  be.docs.set('tickets/old', tk('', 'closed', 400)); be.docs.set('tickets/old/msgs/m1', { from: 'admin', text: 'answer', t: 1 });
  be.docs.set('tickets/recent', tk('', 'closed', 200));
  be.docs.set('tickets/open', tk('', 'answered', 400)); // not closed: an admin may still be on it
  be.docs.set('tickets/mine', tk('u9', 'closed', 400)); // a signed-in user's: goes with their account
  const kept = await A.ctx.Support.adminInbox();
  T.eq(kept.total, 4, 'the plain inbox (the badge at sign-in) deletes nothing');
  const res = await A.ctx.Support.adminInbox({ purge: true }); await wait(30);
  T.eq(res.total, 3, 'the old one is not listed');
  T.ok(!be.docs.has('tickets/old') && !be.docs.has('tickets/old/msgs/m1'), 'deleted with its messages');
  T.ok(['recent', 'open', 'mine'].every((k) => be.docs.has('tickets/' + k)), 'the others stay');
  const today = '2026-11-03';
  const doc = (last) => ({ data: () => ({ last }) });
  const docs = [doc('2025-10-02'), doc('2025-10-03'), doc('2026-11-01'), { data: () => null }];
  T.eq(A.ctx.App.oldStats(docs, today).length, 1, 'only a record last used over 13 months ago');
  T.eq(A.ctx.App.oldStats(docs, today)[0], docs[0]);
  T.eq(A.ctx.App.oldStats(Array.from({ length: 80 }, () => doc('2020-01-01')), today).length, 50, 'at most 50 at a time');
  T.eq(U.addMonths(today, -13), '2025-10-03');
});

// privacy audit, 3 Nov 2026 (B5): after signing out or deleting the account the home-screen widgets kept the numbers
T.atest('the Android widgets are told the phone holds no data, at once, when it is wiped', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  const c = A.ctx;
  let hello = null;
  c.addEventListener = (t, fn) => { if (t === 'message') hello = fn; };
  c.document = { addEventListener() {}, visibilityState: 'visible' };
  c.location = { origin: 'https://site' };
  c.App = Object.assign(c.App || {}, { blocking: 'x' });
  c.UI.toast = () => {};
  const ls = new Map();
  c.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)) };
  vm.runInContext(fs.readFileSync(path.join(SRC, 'app/widgets.js'), 'utf8'), c, { filename: 'app/widgets.js' });
  const got = [];
  const port = { postMessage: (m) => got.push(JSON.parse(m)) };
  // a phone with numbers (the real snapshot needs the whole app: stood in for here)
  await A.Store.setSettings((s) => { s.onboarded = true; });
  const real = { v: 1, at: 1, gross: '₪1,234', period: 'נובמבר', periodTo: '2099-12-31' };
  c.App.widgetSnapshot = () => (A.S.settings.onboarded ? real : null);
  hello({ origin: 'https://site', data: 'shaati:widgets', ports: [port] });
  T.eq(got.length, 1); T.eq(got[0].gross, '₪1,234', 'the numbers go to the widgets');
  await A.Store.wipe(); // signing out / deleting the account
  T.eq(got.length, 2, 'sent at once, before the page reloads');
  const e = got[1];
  T.ok(e.v >= 1, 'a snapshot the Android app keeps (WidgetData.save takes v >= 1)');
  T.ok(e.empty === true && !('gross' in e) && !('active' in e) && !('payday' in e) && !('goal' in e) && !('saving' in e), 'no numbers: ' + JSON.stringify(e));
  T.ok(e.periodTo < '2001-01-01', 'a period that ended: every widget draws "open Shaati to update"');
  // the reload: the widgets were told already, nothing more on every opening
  got.length = 0;
  hello({ origin: 'https://site', data: 'shaati:widgets', ports: [port] });
  T.eq(got.length, 0, 'told once');
  // the wipe happened where no widget was listening (the same site in the browser): the app tells them when it says hello
  ls.set('shaati.widgetsFed', '1');
  hello({ origin: 'https://site', data: 'shaati:widgets', ports: [port] });
  T.eq(got.length, 1); T.eq(got[0].empty, true);
  // an install from before this version, signed out already (the widgets may hold old numbers): told too
  ls.clear(); got.length = 0;
  hello({ origin: 'https://site', data: 'shaati:widgets', ports: [port] });
  T.eq(got.length, 1); T.eq(got[0].empty, true);
});

// on the phone, 3 Nov 2026: Chrome hands the page its end of the channel with an empty message from
// "android-app://" + host, and the app's hello then comes on that port; the widgets had never received a number
T.atest('the widgets channel takes the port Chrome hands over (android-app origin, empty message)', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  const c = A.ctx;
  let hello = null;
  c.addEventListener = (t, fn) => { if (t === 'message') hello = fn; };
  c.document = { addEventListener() {}, visibilityState: 'visible' };
  c.location = { origin: 'https://site', host: 'site' };
  c.App = Object.assign(c.App || {}, { blocking: 'x' });
  c.UI.toast = () => {};
  c.localStorage = { getItem: () => null, setItem() {} };
  vm.runInContext(fs.readFileSync(path.join(SRC, 'app/widgets.js'), 'utf8'), c, { filename: 'app/widgets.js' });
  await A.Store.setSettings((s) => { s.onboarded = true; });
  c.App.widgetSnapshot = () => ({ v: 1, at: 1, gross: '₪499', period: 'נובמבר', periodTo: '2099-12-31' });
  const got = [], other = [];
  const port = { postMessage: (m) => got.push(JSON.parse(m)) };
  const stranger = { postMessage: (m) => other.push(m) };
  hello({ origin: 'https://elsewhere', data: '', ports: [stranger] });
  hello({ origin: 'android-app://other.host', data: '', ports: [stranger] });
  hello({ origin: 'android-app://site', data: 'something else', ports: [stranger] });
  T.eq(other.length, 0, 'only this site\'s own app, and only the channel hand-over');
  T.eq(c.App.widgets.connected, false);
  hello({ origin: 'android-app://site', data: '', ports: [port] });
  T.eq(c.App.widgets.connected, true, 'the port is kept');
  T.eq(got.length, 1); T.eq(got[0].gross, '₪499', 'the numbers go out at once');
  got.length = 0;
  port.onmessage({ data: 'shaati:widgets' });
  T.eq(got.length, 1, 'the app\'s hello on the port sends them again');
  port.onmessage({ data: 'refresh' });
  T.eq(got.length, 2, 'and so does "refresh"');
});

T.atest('each strict forget throws when its delete fails (requests, friends card, statistics)', async () => {
  const be = fakeBackend(); seedOutside(be);
  const A = await phone(be);
  await withStats(A);
  await A.Cloud.connect(user); await wait(60);
  await withOutside(A);
  const del = A.ffs.deleteDoc;
  A.ffs.deleteDoc = () => Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' }));
  for (const [name, mod] of [['Support', A.ctx.Support], ['FriendsView', A.ctx.FriendsView], ['Stats', A.ctx.Stats]]) {
    await mod.forget(); // the everyday call never throws
    let threw = false;
    try { await mod.forget({ strict: true }); } catch (e) { threw = true; }
    T.ok(threw, name + '.forget strict throws');
  }
  A.ffs.deleteDoc = del;
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

// security scan 1 Nov 2026: a backup's ids, template times, payslip counts and files reached the page as HTML
T.atest('a crafted backup cannot put markup into the page: unsafe records are dropped or repaired', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1', 'mine');
  const bad = '"><iframe srcdoc="x"></iframe>';
  const backup = JSON.parse(JSON.stringify(await A.Store.exportBackup(false)));
  backup.shifts.push({ id: 'x' + bad, kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 1, end: 2 });
  backup.shifts.push({ id: 's8', kind: 'shift', employerId: 'emp1', roleId: bad, status: 'done', start: 1, end: 2 });
  backup.templates = [{ id: 't1', name: 'a', roleId: 'r1', startT: bad, endT: '16:00' }, { id: 't2', name: 'b', roleId: 'r1', startT: '08:00', endT: '16:00', breakMin: bad }];
  backup.payslips = [{ id: 'p1', period: bad, fields: {}, summary: { counts: { bad, warn: '2', ok: 1 } } }];
  backup.dayRules = [{ id: 'd1', date: bad, type: 'cancel' }];
  backup.files = [{ id: 'f1', name: 'x', type: 'text/html', data: 'data:text/html;base64,PHNjcmlwdD4=' }];
  await A.Store.importBackup(backup, 'merge'); await wait(50);
  T.ok(!A.S.shifts.some((s) => /</.test(s.id)), 'a shift with an unsafe id is dropped');
  T.eq(A.shift('s8').roleId, null, 'an unsafe reference is cleared');
  T.eq(A.S.templates.map((t) => t.id).join(), 't2', 'a template with unsafe times is dropped');
  T.eq(A.S.templates[0].breakMin, 0, 'an unsafe break becomes 0');
  T.eq(A.S.payslips[0].period, null, 'an unsafe period is cleared');
  T.eq(JSON.stringify(A.S.payslips[0].summary.counts), '{"bad":0,"warn":2,"ok":1}', 'counts are whole numbers');
  T.eq(A.S.dayRules.length, 0, 'a day rule without a real date is dropped');
  T.eq(await A.Store.getFile('f1'), undefined, 'an HTML file is not restored');
  // the same check on what comes from the cloud
  await A.Store.applyRemote([{ store: 'shifts', put: { id: 'y' + bad, kind: 'shift', start: 1, end: 2, updatedAt: 9 } }]);
  T.ok(!A.S.shifts.some((s) => /</.test(s.id)), 'a cloud record with an unsafe id is not taken in');
});
// security review 2 Nov 2026: a colour that is not a string (an array prints its own text into the style) and the
// notifications' fields (severity into a class, the year into a data attribute)
T.atest('a crafted backup cannot put markup in through a colour or a notification', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1', 'mine');
  const bad = '"><meta http-equiv="refresh" content="0;url=https://evil.example/">';
  const backup = JSON.parse(JSON.stringify(await A.Store.exportBackup(false)));
  backup.roles = (backup.roles || []).concat([{ id: 'r9', name: 'x', color: [bad], rates: [{ from: '2020-01-01', rate: 30 }], employerId: 'emp1' }]);
  backup.notifications = [{ id: 'n1', severity: bad, type: bad, cat: 'money', read: 'yes', createdAt: bad, title: 't', body: 'b', data: { year: bad } }];
  await A.Store.importBackup(backup, 'merge'); await wait(50);
  T.ok(A.S.roles.every((r) => r.color == null || /^#[0-9a-f]{3,8}$/i.test(r.color)), 'every colour is a #hex string: ' + A.S.roles.map((r) => JSON.stringify(r.color)).join());
  const n = A.S.notifications.find((x) => x.id === 'n1');
  T.ok(n, 'the notification itself is kept');
  T.eq(n.severity, 'info', 'an unknown severity becomes info');
  T.eq(n.type, null, 'an unsafe type is cleared');
  T.eq(n.createdAt, 0, 'a time that is not a number becomes 0');
  T.eq(n.data.year, null, 'a year that is not a whole number is cleared');
  T.eq(n.read, true, 'read is true or false');
});

// security scan 2 Nov 2026: an employer's settings and the games streak reached the page as HTML; a role id
// __proto__ turned every pay sum into NaN; a backup carried the code lock's hash (a 4-8 digit code is found in seconds)
T.atest('a crafted backup: employer fields, the games streak, reserved ids and the code lock', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1', 'mine');
  await A.Store.setSettings((s) => { s.lock = Object.assign(s.lock, { enabled: true, hash: 'h'.repeat(64), salt: 'salt1', bioId: 'bio1' }); });
  const backup = JSON.parse(JSON.stringify(await A.Store.exportBackup(false)));
  T.eq(backup.settings.lock.hash, null, 'the backup has no code hash');
  T.eq(backup.settings.lock.salt, null, '...no salt');
  T.eq(backup.settings.lock.bioId, null, '...no fingerprint id');
  T.eq(backup.settings.lock.enabled, false, '...and no lock');
  const bad = '<a href=https://evil.example style=position:fixed;inset:0>sign in</a>';
  backup.employers[0] = Object.assign({}, backup.employers[0], { nightEnabled: 'yes', nightValue: bad, nightFrom: bad, travelPerDay: [5], otMode: 'daily' });
  backup.settings.lock = { enabled: false, hash: null, salt: null };
  backup.meta = Object.assign({}, backup.meta, { gameDays: { last: '2026-11-02', n: bad, best: '7' }, games: { coins: bad, quiz: 120, '<x>': 5 } });
  backup.shifts.push({ id: 's7', kind: 'shift', employerId: 'emp1', roleId: '__proto__', status: 'done', start: 1, end: 3600001 });
  backup.shifts.push({ id: 's6', kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 1, end: 7200001, splits: [{ at: 3600001, roleId: '__proto__' }, { at: 'x', roleId: 'r1' }] });
  await A.Store.importBackup(backup, 'replace'); await wait(50);
  const e = A.S.employers[0];
  T.eq(e.nightValue, 0, 'a night premium that is not a number becomes the default');
  T.eq(e.nightEnabled, true, 'a switch is true or false');
  T.eq(e.nightFrom, '22:00', 'a time with markup becomes the default');
  T.eq(e.travelPerDay, 16, 'a list where a number belongs becomes the default');
  T.eq(e.otMode, 'daily', 'a plain code is kept');
  T.eq(JSON.stringify(A.S.meta.gameDays), '{"last":"2026-11-02","n":0,"best":7}', 'the streak is numbers and a date');
  T.eq(JSON.stringify(A.S.meta.games), '{"coins":0,"quiz":120}', 'the games bests are numbers');
  T.eq(A.shift('s7').roleId, null, 'a reserved role id is cleared');
  T.eq(JSON.stringify(A.shift('s6').splits), '[]', 'a role switch with a reserved role or no time is dropped');
  T.eq(A.S.settings.lock.hash, 'h'.repeat(64), "restoring keeps this phone's code lock");
  T.eq(A.S.settings.lock.enabled, true, '...switched on');
  // the engine itself never writes into a shared prototype, whatever role id it gets
  const r = A.ctx.Engine.buildModel({ settings: A.ctx.Defaults.defaultSettings(), employers: [A.ctx.Defaults.defaultEmployer()], roles: A.S.roles, dayRules: [], entries: [],
    shifts: [{ id: 'z', kind: 'shift', employerId: 'emp1', roleId: '__proto__', status: 'done', start: Date.UTC(2026, 9, 5, 6), end: Date.UTC(2026, 9, 5, 14) }] });
  A.ctx.Engine.totals(r, '2026-10-01', '2026-10-31');
  T.eq(vm.runInContext('({}).amount', A.ctx), undefined, 'no amount inherited by every object');
  T.eq(vm.runInContext('({}).hours', A.ctx), undefined, '...nor hours');
});

// role pictures (1.32.0): a role's emoji goes into the page as text, so only one real emoji is kept from outside;
// the photos stay on the phone (never in a backup file, never taken from one)
T.atest('a role keeps one emoji from a backup, and role photos never travel in a backup', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1', 'mine');
  await A.Store.setMeta({ rolePhotos: { r1: 'data:image/jpeg;base64,AAAA' } });
  const backup = JSON.parse(JSON.stringify(await A.Store.exportBackup(false)));
  T.ok(!('rolePhotos' in (backup.meta || {})), 'the backup file has no role photos');
  const role = (id, icon) => ({ id, name: 'x', color: '#2a78d6', icon, rates: [{ from: '2020-01-01', rate: 30 }], employerId: 'emp1' });
  backup.roles = (backup.roles || []).concat([role('ra', '☕'), role('rb', '<img src=x onerror=alert(1)>'), role('rc', '🇮🇱🇮🇱'), role('rd', ['☕']), role('re', 'abc'), role('rf', '👩‍🍳')]);
  backup.meta = Object.assign({}, backup.meta, { rolePhotos: { ra: 'data:image/jpeg;base64,BBBB' } });
  await A.Store.importBackup(backup, 'replace'); await wait(50);
  const icon = (id) => (A.S.roles.find((r) => r.id === id) || {}).icon;
  T.eq(icon('ra'), '☕', 'an emoji is kept');
  T.eq(icon('rb'), null, 'markup is dropped');
  T.eq(icon('rc'), '🇮🇱', 'only the first of two emoji');
  T.eq(icon('rd'), null, 'a list is dropped');
  T.eq(icon('re'), null, 'letters are dropped');
  T.eq(icon('rf'), '👩‍🍳', 'a joined emoji stays one');
  T.eq(JSON.stringify(A.S.meta.rolePhotos), JSON.stringify({ r1: 'data:image/jpeg;base64,AAAA' }), "the phone's own photos stay, the file's are not taken");
});

/* ---------------- anonymous statistics ---------------- */
async function withStats(A, legal, asked) {
  // the person said yes to the statistics (home card or Settings); asked === false: never answered
  if (asked !== false) { A.S.settings.statsAsked = true; A.S.settings.shareStats = true; }
  A.ctx.App = { androidApp: false, roles: () => A.S.roles, legalAccepted: () => legal !== false, tab: 'home' };
  vm.runInContext(fs.readFileSync(path.join(SRC, 'app/stats.js'), 'utf8'), A.ctx, { filename: 'app/stats.js' });
  return A.ctx.Stats;
}
const statsDocs = (be) => [...be.docs].filter(([k]) => k.startsWith('stats/'));

// launch check, 2 Nov 2026: an id the app does not need is kept only after a yes (it used to be on by default)
T.atest('statistics: nothing is sent before the person says yes', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1');
  const Stats = await withStats(A, true, false);
  await A.Cloud.connect(user); await wait(60);
  T.eq(Stats.enabled(), false, 'off before an answer');
  T.eq(statsDocs(be).length, 0, 'no record sent');
});
T.atest('statistics: one anonymous record per device, nothing personal in it', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1'); await A.add('s2');
  await withStats(A);
  await A.Cloud.connect(user); await wait(60);
  const docs = statsDocs(be);
  T.eq(docs.length, 1, 'one record');
  const [key, rec] = docs[0];
  T.ok(key.length - 6 >= 16 && key.length - 6 <= 40, 'random id within the rule limits');
  T.eq(Object.keys(rec).sort().join(','), 'age,days,f,first,ios,last,p,ps,s30,sh,t,v');
  T.eq(typeof rec.ios, 'boolean', 'iPhone: yes or no only');
  T.eq(rec.sh, 2);
  const json = JSON.stringify(rec);
  T.ok(!json.includes('me@example.com') && !json.includes('"u1"') && !json.includes('"Me"'), 'no email, user id or name');
  T.ok(!key.includes('u1/') && key === 'stats/' + A.S.meta.installId, 'stored under the random device id only');
});

T.atest('statistics: rules from before the iPhone field refuse it, and the record still goes without it', async () => {
  const be = fakeBackend();
  const A = await phone(be); await A.add('s1');
  const set = A.ffs.setDoc;
  A.ffs.setDoc = (ref, d) => (d && 'ios' in d && ref.path.startsWith('stats/') ? Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })) : set(ref, d));
  await withStats(A);
  await A.Cloud.connect(user); await wait(60);
  const docs = statsDocs(be);
  T.eq(docs.length, 1, 'one record');
  T.ok(!('ios' in docs[0][1]) && docs[0][1].sh === 1, 'sent without the new field');
  T.ok(A.S.meta.statsSentAt > 0, 'counted as sent');
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


/* ---------------- the phone's own database misbehaving ---------------- */
async function storeOnly(idb) {
  const ctx = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, indexedDB: idb, navigator: { onLine: true } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'app/store.js']) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  await ctx.Store.load();
  return ctx;
}
/** An IndexedDB whose next few write transactions fail, like an iPhone that lost its database connection. */
function flakyIDB(base, failures) {
  const st = { left: failures };
  return { st, open(name, v) {
    const req = base.open(name, v);
    let wrapped = null;
    const proxy = {
      get result() { return wrapped || req.result; },
      set onupgradeneeded(f) { req.onupgradeneeded = f; },
      set onerror(f) { req.onerror = f; },
      set onblocked(f) { req.onblocked = f; },
      set onsuccess(f) {
        req.onsuccess = () => {
          const d = req.result;
          wrapped = Object.assign(Object.create(d), { transaction: (s, m) => {
            if (m === 'readwrite' && st.left > 0) { st.left--; const e = new Error('Connection to Indexed Database server lost'); e.name = 'UnknownError'; throw e; }
            return d.transaction(s, m);
          } });
          f();
        };
      },
    };
    return proxy;
  } };
}
T.atest('storage: a lost database connection is reopened and the save goes through', async () => {
  const base = fakeIndexedDB();
  const idb = flakyIDB(base, 0);
  const ctx = await storeOnly(idb);
  idb.st.left = 2; // the next two writes fail
  await ctx.Store.apply([{ store: 'shifts', put: { id: 's1', kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 1, end: 2 } }], 'x');
  T.eq(idb.st.left, 0, 'both failures happened');
  const again = await storeOnly(base);
  T.ok(again.Store.S.shifts.some((x) => x.id === 's1'), 'the shift is in the database after reopening');
  idb.st.left = 5; // more failures than the retries: the app carries on from memory instead of freezing
  let lost = 0;
  ctx.Store.on((ev) => { if (ev.type === 'storage-lost') lost++; });
  await ctx.Store.setSettings((x) => { x.userName = 'a'; });
  T.ok(ctx.Store.isMemoryOnly(), 'switched to memory');
  T.eq(lost, 1, 'the app was told once');
  T.eq(ctx.Store.S.settings.userName, 'a', 'the change is kept in memory');
});
T.atest('storage: a browser without a database still works from memory', async () => {
  const broken = { open() { throw new Error('IndexedDB is disabled'); } };
  const ctx = await storeOnly(broken);
  T.ok(ctx.Store.isMemoryOnly(), 'memory mode');
  await ctx.Store.apply([{ store: 'shifts', put: { id: 's1', kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 1, end: 2 } }], 'x');
  await ctx.Store.setSettings((s) => { s.onboarded = true; });
  T.eq(ctx.Store.S.shifts.length, 1, 'saving works');
  T.ok(ctx.Store.S.settings.onboarded, 'settings work');
});

/* ---------------- Shaati Plus: what the person sees before paying, and the offer on home ---------------- */
// privacy audit, 3 Nov 2026 (A6): the seller under the buy button is the operator of the terms, with the same email
T.test('the Plus page names the same seller and email as the terms', () => {
  const plus = fs.readFileSync(path.join(SRC, 'app/plus.js'), 'utf8');
  const legal = fs.readFileSync(path.join(SRC, 'app/views-legal.js'), 'utf8');
  const val = (src, name) => { const m = src.match(new RegExp('const ' + name + " = '([^']+)'")); return m && m[1]; };
  T.ok(val(plus, 'SELLER') && val(plus, 'SELLER') === val(legal, 'OPERATOR'), 'seller: ' + val(plus, 'SELLER') + ' / ' + val(legal, 'OPERATOR'));
  T.ok(val(plus, 'SELLER_EMAIL') && val(plus, 'SELLER_EMAIL') === val(legal, 'EMAIL'), 'email: ' + val(plus, 'SELLER_EMAIL') + ' / ' + val(legal, 'EMAIL'));
  T.ok(/sellerNote\(\)[^\n]*`\}/.test(plus) && plus.includes('data-legal="terms"') && plus.includes('14 יום'), 'the note is drawn under the buy button with the terms and the 14 days');
});

// privacy audit, 3 Nov 2026 (A22): the offer on home came back every 24 hours, also to children
T.atest('the Plus offer on home: never under 18, and "don\'t show again" ends it', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  const c = A.ctx;
  c.UI.icon = () => ''; c.UI.esc = (s) => String(s);
  c.document = { documentElement: { dataset: {} } };
  c.PAY_CONFIG = { price: '₪6.90', lemon: { checkout: 'https://example.com/buy', productId: 1 } };
  c.App = { actions: {}, applyTheme() {}, rerender() {}, isAdmin: false, model: { results: new Map([1, 2, 3, 4, 5].map((i) => [i, { status: 'done' }])) } };
  vm.runInContext(fs.readFileSync(path.join(SRC, 'app/plus.js'), 'utf8'), c, { filename: 'app/plus.js' });
  await A.Store.setMeta({ activeDays: 9 });
  const year = +c.U.todayKey().slice(0, 4);
  await A.Store.setSettings((s) => { s.birthDate = (year - 30) + '-01-01'; });
  const card = c.Plus.nudgeCard();
  T.ok(card.includes('plus-nudge') && card.includes('data-act="plus-nudge-never"'), 'an adult who uses the app sees it, with "don\'t show again"');
  await A.Store.setSettings((s) => { s.birthDate = (year - 15) + '-01-01'; });
  T.eq(c.Plus.nudgeCard(), '', 'not under 18');
  await A.Store.setSettings((s) => { s.birthDate = (year - 30) + '-01-01'; });
  await c.App.actions['plus-nudge-never']();
  T.eq(c.Plus.nudgeCard(), '', 'gone after "don\'t show again"');
  await A.Store.setMeta({ plusNudge: Object.assign({}, A.S.meta.plusNudge, { x: Date.now() - 3 * 86400000 }) });
  T.eq(c.Plus.nudgeCard(), '', 'and it does not come back after the 24 hours');
  // the notice a day before a trial ends offers nothing
  await A.Store.setMeta({ plusTrial: { from: Date.now() - 2 * 86400000, until: Date.now() + 20 * 3600000 } });
  const end = c.Plus.endAlert();
  T.ok(end && !/להמשיך|מבטלים|₪/.test(end.body), 'a notice, not an offer: ' + (end && end.body));
});

// widgets 1.32.5: the start and end buttons work on the home screen without opening the app; the phone keeps each
// tap and hands it to the page over the channel when the app opens or comes back to the front
T.atest('starts and ends tapped on a widget become the shift, at the tapped times, each once', async () => {
  const be = fakeBackend();
  const A = await phone(be);
  const c = A.ctx;
  let hello = null, visible = null;
  c.addEventListener = (t, fn) => { if (t === 'message') hello = fn; };
  c.document = { addEventListener(t, fn) { if (t === 'visibilitychange') visible = fn; }, visibilityState: 'visible' };
  c.location = { origin: 'https://site', host: 'site' };
  c.UI.toast = () => {};
  c.localStorage = { getItem: () => '1', setItem() {} };
  await A.Store.setSettings((s) => { s.onboarded = true; });
  const done = [];
  c.App = Object.assign(c.App || {}, {
    blocking: 'x', model: {}, afterUnlock: (fn) => fn(),
    roles: () => [{ id: 'r1', name: 'קופאי' }],
    startShift: async (rid, o) => { done.push(['start', rid, o.startAt]); await A.Store.setActive({ start: o.startAt, roleId: rid, breaks: [] }); },
    stopShift: async (at, end) => { done.push(['stop', end]); await A.Store.setActive(null); },
  });
  vm.runInContext(fs.readFileSync(path.join(SRC, 'app/widgets.js'), 'utf8'), c, { filename: 'app/widgets.js' });
  c.App.widgetSnapshot = () => ({ v: 1, at: 1, wid: +A.S.meta.widgetDone || 0 }); // the real one needs the whole app
  const got = [];
  const port = { postMessage: (m) => got.push(m) };
  hello({ origin: 'android-app://site', data: '', ports: [port] });
  const t0 = Date.now() - 4 * 3600000, t1 = Date.now() - 60000;
  const taps = JSON.stringify({ taps: [{ id: 11, type: 'stop', at: t1 }, { id: 10, type: 'start', at: t0 }] });
  port.onmessage({ data: taps });
  // until the taps are done and the phone was told (a fixed 30 ms failed on a busy machine)
  for (let i = 0; i < 200 && !(A.S.meta.widgetDone === 11 && got.length && JSON.parse(got[got.length - 1]).wid === 11); i++) await wait(10);
  T.eq(JSON.stringify(done), JSON.stringify([['start', 'r1', t0], ['stop', t1]]), 'in order, at the tapped times');
  T.eq(A.S.meta.widgetDone, 11);
  T.eq(JSON.parse(got[got.length - 1]).wid, 11, 'the snapshot tells the phone which taps are done');
  // the same taps again (the hello and the "ask" both bring them): nothing twice
  port.onmessage({ data: taps });
  await wait(30);
  T.eq(done.length, 2, 'each tap once');
  // an end with no shift running, a start while one runs: skipped, but marked done
  port.onmessage({ data: JSON.stringify({ taps: [{ id: 12, type: 'stop', at: t1 }] }) });
  for (let i = 0; i < 200 && A.S.meta.widgetDone !== 12; i++) await wait(10);
  T.eq(done.length, 2); T.eq(A.S.meta.widgetDone, 12);
  await A.Store.setActive({ start: t0, roleId: 'r1', breaks: [] });
  port.onmessage({ data: JSON.stringify({ taps: [{ id: 13, type: 'start', at: t1 }] }) });
  for (let i = 0; i < 200 && A.S.meta.widgetDone !== 13; i++) await wait(10);
  T.eq(done.length, 2, 'a start while a shift runs does nothing');
  // back to the front: the page asks the phone for the taps made meanwhile
  got.length = 0;
  visible();
  T.ok(got.includes('ask'), 'asks for the taps: ' + JSON.stringify(got));
  // anything else on the channel is ignored
  port.onmessage({ data: '{not json' });
  port.onmessage({ data: JSON.stringify({ taps: [{ id: 99, type: 'delete-everything', at: t1 }] }) });
  await wait(30);
  T.eq(done.length, 2);
});

/* ---------------- the signed shift log (core/ledger.js, app/shift-log.js) ---------------- */
const ledgerOf = (P) => P.S.ledger.slice().sort((a, b) => a.c.localeCompare(b.c) || a.n - b.n);
T.atest('shift log: adding, editing and deleting a shift each write a signed record', async () => {
  const be = fakeBackend();
  const A = await phone(be, { ledger: true });
  const done = () => A.ctx.ShiftLog.done();
  await A.add('s1'); await done();
  await A.Store.apply([{ store: 'shifts', put: Object.assign({}, A.shift('s1'), { end: 3 }) }], 'edit'); await done();
  await A.Store.apply([{ store: 'shifts', put: Object.assign({}, A.shift('s1'), { note: 'only a note' }) }], 'note'); await done();
  await A.Store.apply([{ store: 'shifts', del: 's1' }], 'del'); await done();
  T.eq(ledgerOf(A).map((x) => x.k).join(','), 'create,edit,delete', 'a note alone writes nothing');
  T.eq(ledgerOf(A)[1].oe, 2, 'the edit keeps the old end');
  await A.Store.undo(); await done(); // the deletion undone: the shift is back, and that is written too
  T.eq(ledgerOf(A).map((x) => x.k).join(','), 'create,edit,delete,create');
  T.ok((await A.ctx.ShiftLog.verify()).ok, 'the chain is whole');
  // the log only grows: a delete or a replacement of one of its records is ignored
  const first = ledgerOf(A)[0];
  await A.Store.apply([{ store: 'ledger', del: first.id }, { store: 'ledger', put: Object.assign({}, first, { s: 999 }) }], null);
  T.eq(A.S.ledger.length, 4); T.eq(A.S.ledger.find((x) => x.id === first.id).s, 1);
  // the timer's save is a "stop"; a planned shift is not logged; the first tour's sample shifts neither
  await A.Store.apply([{ store: 'shifts', put: { id: 't1', kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 10, end: 20 } }], 'stop', { via: 'timer' });
  await A.Store.apply([{ store: 'shifts', put: { id: 'p1', kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'planned', start: 30, end: 40 } }], 'plan');
  await A.Store.apply([{ store: 'shifts', put: { id: 'd1', kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 30, end: 40, demo: true } }], 'demo');
  await done();
  T.eq(ledgerOf(A).map((x) => x.k).join(','), 'create,edit,delete,create,stop');
  // a backup restored over the phone: the phone goes on in a new chain (the old one never forks)
  const c0 = A.S.meta.ledgerChain;
  await A.Store.importBackup(JSON.parse(JSON.stringify(await A.Store.exportBackup(false))), 'replace'); await wait(10);
  T.eq(A.S.ledger.length, 5, 'the backup carries the log');
  await A.add('s5'); await done();
  T.ok(A.S.meta.ledgerChain && A.S.meta.ledgerChain !== c0, 'a new chain after the restore');
  T.ok((await A.ctx.ShiftLog.verify()).ok, 'still whole');
});

T.atest('shift log: records reach the other phone, and the server keeps them as written', async () => {
  const be = fakeBackend();
  const A = await phone(be, { ledger: true });
  await A.add('s1'); await A.ctx.ShiftLog.done();
  await A.Cloud.connect(user); await wait(30);
  const B = await phone(be, { ledger: true });
  await B.Cloud.connect(user); await wait(200);
  T.eq(B.S.ledger.length, 1, 'the record arrived');
  await B.add('s2'); await B.ctx.ShiftLog.done(); await B.sync(); await wait(200);
  T.eq(A.S.ledger.length, 2);
  const v = await A.ctx.ShiftLog.verify();
  T.ok(v.ok, 'both chains whole'); T.eq(v.chains.length, 2, 'one chain per phone');
  // a tombstone for a record, or a changed text: refused by the rules
  const key = [...be.docs.keys()].find((k) => k.includes('/ledger/'));
  const was = be.rejected;
  await A.ffs.setDoc({ path: key }, { u: Date.now() + 9999, d: true, j: null }).catch(() => {});
  await A.ffs.setDoc({ path: key }, { u: Date.now() + 9999, d: false, j: '{"k":"edit"}' }).catch(() => {});
  await wait(10);
  T.eq(be.rejected, was + 2, 'both refused');
  T.ok(!be.docs.get(key).d, 'still there');
  // all records sent again with new versions (a restore makes the cloud match the phone): the same text, allowed
  await A.Store.touchAll(); await A.sync(); await wait(50);
  T.eq(be.rejected, was + 2, 'a re-send of the same record is fine');
  // a phone that chose "only from the phone" still takes the account's log records
  const C = await phone(be, { ledger: true, answer: 'local' }); await C.add('c1'); await C.ctx.ShiftLog.done();
  await C.Cloud.connect(user); await wait(200);
  T.eq(C.S.ledger.length, 3, 'the account\'s records joined');
  T.ok(![...be.docs.entries()].some(([k, x]) => k.includes('/ledger/') && x.d), 'no log record became a tombstone');
});

// the privacy policy says the shift log is deleted with the account: the log only grows on the server
// (no tombstones, no changed text), so check that deleting the account still takes all of its records
T.atest('shift log: deleting the account deletes its records in the cloud', async () => {
  const be = fakeBackend();
  const A = await phone(be, { ledger: true });
  await A.add('s1'); await A.add('s2'); await A.ctx.ShiftLog.done();
  await A.Cloud.connect(user); await wait(30);
  T.ok(live(be, 'ledger') >= 2, 'the log reached the cloud');
  const signedIn = Object.assign({}, user, { metadata: { lastSignInTime: new Date().toUTCString() }, delete() {} });
  A.Cloud._useSdk({ app: {}, auth: { currentUser: signedIn }, db: {}, fs: A.ffs, au: { deleteUser: async () => {}, signOut: async () => {} } });
  await A.Cloud.deleteAccountData();
  T.eq([...be.docs.keys()].filter((k) => k.startsWith('users/u1/ledger/')).length, 0, 'no log record is left');
  T.eq(A.S.ledger.length, 0, 'and the phone\'s copy is gone');
});
