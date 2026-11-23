/* Signing out keeps what only this phone holds (23 Nov 2026). Signing out used to empty the phone's database, the
 * payslip files with it: they never go to the account (store.js SYNC_STORES leaves 'files' out), so a sign-out and a
 * sign-in with the same account lost them for good (the user's 3 files), while the question said everything stays in
 * the account. Now the payslip files, their raw text, the AI key and the code lock are parked on the phone under the
 * account's id, encrypted with a key that only the account holds (users/{uid}/kv/vault), and come back only when the
 * same account signs in here again. Another account never sees them; "also remove them" and deleting the account do.
 * The real store.js and cloud.js run against the fake IndexedDB and the fake Firestore (fakes.js). */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { fakeIndexedDB, fakeBackend, fakeClient } = require('./fakes.js');

const SRC = path.join(__dirname, '..', 'src');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// one opening of the app (the same idb again = the app opened again on that phone, after the sign-out's reload)
async function phone(backend, idb, confirmAnswer) {
  const ctx = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: idb, navigator: { onLine: true },
    crypto: require('crypto').webcrypto, TextEncoder, TextDecoder, atob, btoa, Blob, Intl };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.confirms = [];
  ctx.UI = { dialog: async () => 'merge', confirm: async (t) => { ctx.confirms.push(t); return confirmAnswer !== false; }, timeAgo: () => '', toast() {} };
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'app/store.js', 'app/cloud.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  const { client, fs: ffs } = fakeClient(backend);
  ctx.Cloud._useSdk({ app: {}, auth: {}, db: {}, au: { signOut: async () => {} }, fs: ffs });
  await ctx.Store.load();
  return { ctx, client, ffs, Store: ctx.Store, Cloud: ctx.Cloud, S: ctx.Store.S };
}
const A = { uid: 'uA', email: 'a@example.com', displayName: 'A' };
const B = { uid: 'uB', email: 'b@example.com', displayName: 'B' };
const slip = (id, fileId) => ({ id, period: '2026-10', employerId: 'emp1', fields: { gross: { value: 5000 } }, other: [], text: 'שכר יסוד 5000 ת.ז. 123456782', source: 'pdf', fileId, fileName: 'slip-' + id + '.jpg' });
// the phone as the user had it: signed in with A, 3 payslips with their files, an AI key and a code lock
async function signedInWithSlips(be, idb) {
  const P = await phone(be, idb);
  await P.Store.setSettings((s) => { s.onboarded = true; s.ai.apiKey = 'sk-ant-secret'; s.lock = Object.assign({}, s.lock, { enabled: true, hash: 'h', salt: 's', len: 4 }); });
  await P.Cloud.connect(A); await wait(30);
  for (const n of [1, 2, 3]) {
    await P.Store.putFile('f' + n, 'pixels-' + n, 'slip' + n + '.jpg', 'image/jpeg');
    await P.Store.apply([{ store: 'payslips', put: slip('ps' + n, 'f' + n) }], 'שמירת תלוש');
  }
  await P.Cloud.syncNow(); await wait(30);
  return P;
}
const files = async (Store) => { const out = []; for (const id of ['f1', 'f2', 'f3']) { const f = await Store.getFile(id); if (f) out.push(f.blob); } return out.join(','); };
const parkedRows = (idb) => new Promise((res) => {
  const r = idb.open('shiftpay');
  r.onsuccess = () => { const t = r.result.transaction(['parked']); const q = t.objectStore('parked').getAll(); q.onsuccess = () => res(q.result); };
});

T.section('sign-out keeps the phone-only items for the same account (23 Nov 2026)');

T.atest('signing out and in again with the same account brings back the 3 payslip files, their text, the AI key and the lock', async () => {
  const be = fakeBackend(); const idb = fakeIndexedDB();
  let P = await signedInWithSlips(be, idb);
  T.eq((await P.Store.phoneOnly()).files, 3, 'the question knows there are 3 files on the phone only');
  T.ok(await P.Cloud.signOut(), 'signed out');
  T.eq(await files(P.Store), '', 'the files are out of the open store');
  T.eq(P.S.payslips.length, 0, 'the phone is empty');
  T.eq(P.S.settings.ai.apiKey, '', 'no AI key while signed out');
  // parked, encrypted, nothing readable in it; the key is in the account only
  const rows = await parkedRows(idb);
  T.eq(rows.length, 4, '3 files and their data');
  T.ok(rows.every((r) => r.uid === 'uA' && r.enc), 'every one encrypted, under A');
  T.ok(!/pixels|sk-ant|123456782|slip1/.test(JSON.stringify(rows)), 'no file, key, ID number or file name in the clear');
  T.ok(be.docs.has('users/uA/kv/vault'), 'the key is kept in the account');
  T.ok(!/pixels|sk-ant|123456782/.test(JSON.stringify([...be.docs.values()])), 'nothing parked went to the server');
  // the app reloads, the same account signs in
  P = await phone(be, idb);
  T.eq(await P.Store.sweepFiles(), 0);
  await P.Cloud.connect(A); await wait(60);
  T.eq(await files(P.Store), 'pixels-1,pixels-2,pixels-3', 'the 3 files are back');
  const ps = P.S.payslips.find((p) => p.id === 'ps2');
  T.eq(ps.fileId, 'f2', 'the payslip names its file again');
  T.ok(/123456782/.test(ps.text), 'and has its raw text');
  T.eq(P.S.settings.ai.apiKey, 'sk-ant-secret', 'the AI key is back');
  T.eq(P.S.settings.lock.enabled, true, 'the code lock is back');
  T.eq((await parkedRows(idb)).length, 0, 'nothing is left parked');
  await wait(1700); await P.Store.sweepFiles();
  T.eq(await files(P.Store), 'pixels-1,pixels-2,pixels-3', 'the sweep keeps them: their payslips name them');
  T.eq(P.Store.dirtyRecords().length, 0, 'nothing to upload for it');
});

T.atest('another account signing in on this phone never gets them, and they stay for the first one', async () => {
  const be = fakeBackend(); const idb = fakeIndexedDB();
  let P = await signedInWithSlips(be, idb);
  await P.Cloud.signOut();
  P = await phone(be, idb);
  await P.Cloud.connect(B); await wait(60);
  T.eq(await files(P.Store), '', 'B sees no file');
  T.eq(P.S.payslips.length, 0, 'and none of A\'s payslips');
  T.eq(P.S.settings.ai.apiKey, '', 'nor A\'s AI key');
  T.eq((await P.Store.parked('uB')).n, 0, 'nothing is parked for B');
  T.eq((await P.Store.unpark('uB', null)), 0, 'unpark for B finds nothing');
  // B's session cannot open A's items even with B's own key: the key is A's and the uid is bound into each item
  const kB = await P.Cloud._vaultKey('uB', true);
  const rows = await parkedRows(idb);
  let opened = 0;
  for (const r of rows) { try { await P.ctx.crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(atob(r.iv), (c) => c.charCodeAt(0)), additionalData: new TextEncoder().encode(r.id) }, kB, Uint8Array.from(atob(r.b), (c) => c.charCodeAt(0))); opened++; } catch (e) { /* refused */ } }
  T.eq(opened, 0, 'B\'s key opens none of them');
  // B signs out (keeping nothing of A's), A signs in again: everything comes back
  await P.Cloud.signOut();
  P = await phone(be, idb);
  await P.Cloud.connect(A); await wait(60);
  T.eq(await files(P.Store), 'pixels-1,pixels-2,pixels-3', 'A gets the 3 files back');
});

T.atest('"also remove them from this phone" deletes the files and leaves nothing parked', async () => {
  const be = fakeBackend(); const idb = fakeIndexedDB();
  let P = await signedInWithSlips(be, idb);
  T.ok(await P.Cloud.signOut({ removeLocal: true }));
  T.eq((await parkedRows(idb)).length, 0, 'nothing parked');
  P = await phone(be, idb);
  await P.Cloud.connect(A); await wait(60);
  T.eq(await files(P.Store), '', 'no file came back');
  T.eq(P.S.payslips.length, 3, 'the payslips\' data is in the account, as always');
  T.eq(P.S.settings.ai.apiKey, '', 'the AI key is gone');
});

T.atest('a removal with something already parked for the account removes that too', async () => {
  const be = fakeBackend(); const idb = fakeIndexedDB();
  let P = await signedInWithSlips(be, idb);
  await P.Cloud.signOut(); // parked
  P = await phone(be, idb);
  // the account's key cannot be read at this sign-in (the restore waits), then the person removes everything
  const get = P.ffs.getDocFromServer;
  P.ffs.getDocFromServer = (ref) => (/kv\/vault$/.test(ref.path) ? Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' })) : get(ref));
  await P.Cloud.connect(A); await wait(60);
  T.eq((await P.Store.parked('uA')).n, 4, 'still parked: the key did not come');
  P.ffs.getDocFromServer = get;
  await P.Cloud.signOut({ removeLocal: true });
  T.eq((await parkedRows(idb)).length, 0, 'nothing of A is left on the phone');
});

T.atest('deleting the account deletes the files, the parked items and the key', async () => {
  const be = fakeBackend(); const idb = fakeIndexedDB();
  let P = await signedInWithSlips(be, idb);
  await P.Cloud.signOut();
  P = await phone(be, idb);
  await P.Cloud.connect(A); await wait(60);
  T.eq(await files(P.Store), 'pixels-1,pixels-2,pixels-3');
  // something parked again (an earlier sign-out whose restore is still waiting), then the account goes
  await P.Store.park('uA', null);
  const signedIn = Object.assign({}, A, { metadata: { lastSignInTime: new Date().toUTCString() }, delete() {} });
  P.Cloud._useSdk({ app: {}, auth: { currentUser: signedIn }, db: {}, fs: P.ffs, au: { deleteUser: async () => {}, signOut: async () => {} } });
  await P.Cloud.deleteAccountData();
  T.eq(await files(P.Store), '', 'no file on the phone');
  T.eq((await parkedRows(idb)).length, 0, 'nothing parked');
  T.ok(!be.docs.has('users/uA/kv/vault'), 'the account\'s key is gone with it');
});

T.atest('offline at sign-out: parked without the key, still for the same account only', async () => {
  const be = fakeBackend(); const idb = fakeIndexedDB();
  let P = await signedInWithSlips(be, idb);
  const get = P.ffs.getDocFromServer;
  P.ffs.getDocFromServer = (ref) => (/kv\/vault$/.test(ref.path) ? Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' })) : get(ref));
  T.ok(await P.Cloud.signOut());
  const rows = await parkedRows(idb);
  T.ok(rows.length === 4 && rows.every((r) => !r.enc && r.uid === 'uA'), 'parked as they are, under A');
  P = await phone(be, idb);
  await P.Cloud.connect(B); await wait(60);
  T.eq(await files(P.Store), '', 'B still gets nothing');
  await P.Cloud.signOut();
  P = await phone(be, idb);
  await P.Cloud.connect(A); await wait(60);
  T.eq(await files(P.Store), 'pixels-1,pixels-2,pixels-3', 'A gets them back');
});

T.atest('the phone too full to keep them: the person is asked, and "cancel" signs nothing out', async () => {
  const be = fakeBackend(); const idb = fakeIndexedDB();
  const P0 = await signedInWithSlips(be, idb);
  const P = await phone(be, idb, false); // the answer to the question: cancel
  await P.Cloud.connect(A); await wait(60);
  P.Store.park = async () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
  T.eq(await P.Cloud.signOut(), false, 'not signed out');
  T.eq(P.ctx.confirms.join(), 'אין מקום לשמור את הקבצים', 'the person was told why');
  T.eq(await files(P.Store), 'pixels-1,pixels-2,pixels-3', 'the files are still here');
  T.ok(P0); // (the first opening of the phone)
});

T.atest('a guest wiping "all data" leaves another account\'s parked items alone; a backup never carries them', async () => {
  const be = fakeBackend(); const idb = fakeIndexedDB();
  let P = await signedInWithSlips(be, idb);
  await P.Cloud.signOut();
  P = await phone(be, idb);
  const backup = await P.Store.exportBackup(true);
  T.ok(!JSON.stringify(backup).includes('uA'), 'the guest\'s backup holds nothing of A');
  await P.Store.wipe();
  T.eq((await parkedRows(idb)).length, 4, 'A\'s items are still parked');
});

T.atest('the account\'s key is made once: a second phone gets the same key and can never replace it', async () => {
  const be = fakeBackend();
  const P1 = await phone(be, fakeIndexedDB()); await P1.Cloud.connect(A); await wait(30);
  const P2 = await phone(be, fakeIndexedDB()); await P2.Cloud.connect(A); await wait(30);
  const k1 = await P1.Cloud._vaultKey('uA', true);
  const first = be.docs.get('users/uA/kv/vault').j;
  await wait(5);
  // a later phone writes its own key over it (as if it had not seen the first): the rules refuse it
  let refused = false;
  try { await P2.ffs.setDoc({ path: 'users/uA/kv/vault' }, { u: -Date.now(), d: false, j: '{"k":"AAAA"}' }); } catch (e) { refused = e.code === 'permission-denied'; }
  T.ok(refused, 'a later key is refused');
  T.eq(be.docs.get('users/uA/kv/vault').j, first, 'the first key stands');
  const k2 = await P2.Cloud._vaultKey('uA', true);
  const sub = P1.ctx.crypto.subtle; const iv = new Uint8Array(12);
  const ct = await sub.encrypt({ name: 'AES-GCM', iv }, k1, new TextEncoder().encode('x'));
  T.eq(new TextDecoder().decode(await sub.decrypt({ name: 'AES-GCM', iv }, k2, ct)), 'x', 'both phones hold the same key');
  T.eq(await P2.Cloud._vaultKey('uB', false), false, 'an account without a key: none is made when only reading');
});
