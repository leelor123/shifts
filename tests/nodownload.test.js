/* Nothing is downloaded to the phone without a tap (24 Nov 2026). Users told the owner "the app sometimes downloads
 * something to my phone": the automatic backup (App.autoBackupCheck) put shiftpay-backup-<date>.json in the phone's
 * Downloads every week or month, with no tap, for everyone without an account. The automatic backup is now a copy
 * kept inside the app (store.js "snapshots", IndexedDB store 'snaps'), and a file is made only by a tap.
 * The real store.js runs against the fake IndexedDB (fakes.js); app.js's autoBackupCheck runs in the same context with
 * UI and navigator spies that fail on any file. A guard lists every place in the app that can make a file, so a new
 * automatic one cannot slip in. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { fakeIndexedDB } = require('./fakes.js');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const DAY = 86400000;

async function phone(opts) {
  opts = opts || {};
  const files = [];
  const ctx = { console: { log() {}, warn() {}, error: console.error }, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: opts.idb || fakeIndexedDB(),
    crypto: require('crypto').webcrypto, TextEncoder, TextDecoder, atob, btoa, Blob, Intl, files,
    navigator: { onLine: true, storage: { estimate: async () => (opts.free != null ? { quota: opts.free() + 1e6, usage: 1e6 } : { quota: 1e10, usage: 1e6 }) },
      share: async () => { files.push('navigator.share'); } } };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  // every way the app makes a file, as a spy
  ctx.UI = { download: (n) => files.push('download ' + n), saveFile: async (n) => { files.push('saveFile ' + n); }, shareFile: async (n) => { files.push('shareFile ' + n); },
    toast() {}, dialog: async () => null, confirm: async () => true, timeAgo: () => '' };
  ctx.document = { createElement: () => { files.push('createElement'); return { click() { files.push('click'); }, remove() {} }; }, body: { appendChild() {} } };
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'app/store.js']) vm.runInContext(read(f), ctx, { filename: f });
  await ctx.Store.load();
  // app.js's own autoBackupCheck (and doBackup, which only a tap calls), run as written
  const app = read('app/app.js');
  const a = app.indexOf('  App.autoBackupCheck = async function');
  const b = app.indexOf('  /* ---------------- boot ----------------');
  ctx.App = {}; ctx.U = ctx.U || ctx.window.U; ctx.S = ctx.Store.S;
  vm.runInContext(app.slice(a, b), ctx, { filename: 'app.js (backup part)' });
  return { ctx, Store: ctx.Store, S: ctx.Store.S, App: ctx.App, files };
}
const shift = (id, daysAgo) => ({ id, kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: Date.now() - (daysAgo + 1) * DAY, end: Date.now() - (daysAgo + 1) * DAY + 4 * 3600e3, note: '' });
async function withShifts(P, n) {
  await P.Store.setSettings((s) => { s.onboarded = true; });
  for (let i = 0; i < n; i++) await P.Store.apply([{ store: 'shifts', put: shift('s' + i, i) }], 'x');
}
const rows = (idb) => new Promise((res) => {
  const r = idb.open('shiftpay');
  r.onsuccess = () => { const t = r.result.transaction(['snaps']); const q = t.objectStore('snaps').getAll(); q.onsuccess = () => res(q.result); };
});

T.section('automatic backup: a copy inside the app, never a file (24 Nov 2026)');

T.atest('a due automatic backup keeps a copy in the app and makes no file (weekly, no account)', async () => {
  const idb = fakeIndexedDB();
  const P = await phone({ idb });
  await withShifts(P, 3);
  T.eq(P.S.settings.backup.autoEvery, 'weekly', 'weekly by default');
  await P.App.autoBackupCheck();
  T.eq(P.files.join(','), '', 'no download, no save, no share');
  const list = P.Store.snaps();
  T.eq(list.length, 1, 'one copy kept');
  T.eq(list[0].kind, 'auto');
  T.eq(list[0].shifts, 3, 'it knows how many shifts it holds');
  T.eq((await rows(idb)).length, 1, 'and it is in the database');
  T.eq(P.S.settings.backup.lastBackup, null, 'a copy in the app is not a backup out of the phone (the reminder stays honest)');
  await P.App.autoBackupCheck();
  T.eq(P.Store.snaps().length, 1, 'not again before a week');
});

T.atest('an update with a file download due: a copy instead, no file (migration)', async () => {
  const idb = fakeIndexedDB();
  let P = await phone({ idb });
  await withShifts(P, 2);
  // the settings as 1.44.4 left them: the last automatic file 10 days ago, monthly for this user
  await P.Store.setSettings((s) => { s.backup.autoEvery = 'monthly'; s.backup.lastBackup = Date.now() - 40 * DAY; s.backup.lastAuto = Date.now() - 40 * DAY; });
  P = await phone({ idb }); // the app opens after the update
  T.eq(P.S.settings.backup.autoEvery, 'monthly', 'the choice is kept');
  await P.App.autoBackupCheck();
  T.eq(P.files.join(','), '', 'nothing downloaded although a file was due');
  T.eq(P.Store.snaps().length, 1, 'a copy in the app instead');
  T.ok(P.S.settings.backup.lastBackup < Date.now() - 39 * DAY, 'the last real backup date is untouched');
  P = await phone({ idb }); // and the list survives the next opening
  T.eq(P.Store.snaps().length, 1, 'kept across openings');
});

T.atest('with an account: still a copy in the app, still no file', async () => {
  const P = await phone();
  await withShifts(P, 2);
  await P.Store.setMeta({ cloudUid: 'uA' });
  await P.App.autoBackupCheck();
  T.eq(P.files.join(','), '', 'no file');
  T.eq(P.Store.snaps().length, 1, 'a copy (a restore or a mass delete reaches the account too)');
  T.ok(!/cloudUid|Downloads|download/i.test(read('app/app.js').match(/App\.autoBackupCheck = [\s\S]*?\n {2}\};/)[0].replace(/\/\/.*$/gm, '')), 'the check itself has no file and no account branch');
});

T.atest('copies rotate: at most 4 automatic ones, the oldest goes first', async () => {
  const P = await phone();
  await withShifts(P, 1);
  const ids = [];
  for (let k = 1; k <= 6; k++) {
    const m = await P.Store.autoSnapshot(Date.now() + k * 8 * DAY);
    ids.push(m.id);
    await new Promise((r) => setTimeout(r, 3)); // (distinct times)
  }
  const list = P.Store.snaps();
  T.eq(list.length, 4, 'four kept');
  T.eq(list.map((m) => m.id).join(','), ids.slice(2).reverse().join(','), 'the four newest, newest first');
  T.eq(P.files.join(','), '', 'no file');
});

T.atest('a copy holds no payslip files and no keys; too big or no room: not kept', async () => {
  let free = 1e10;
  const P = await phone({ free: () => free });
  await withShifts(P, 2);
  await P.Store.setSettings((s) => { s.ai.apiKey = 'sk-ant-secret'; s.plusKey = 'PLUS-123'; });
  await P.Store.putFile('f1', 'pixels', 'slip.jpg', 'image/jpeg');
  const m = await P.Store.snapshot('auto');
  const data = await P.Store.snapData(m.id);
  T.ok(!('files' in data), 'no payslip files');
  T.ok(!/sk-ant-secret|PLUS-123|pixels/.test(JSON.stringify(data)), 'no AI key, no Plus code, no file contents');
  T.eq(data.shifts.length, 2);
  // the phone is short of room: the oldest copy of the kind goes; with none left, no copy
  free = 1000;
  T.eq(await P.Store.snapshot('auto'), null, 'no room: not kept');
  T.eq(P.Store.snaps().length, 0, 'the old copy made way first, and still no room');
  free = 1e10;
  T.ok(await P.Store.snapshot('auto'), 'room again: kept');
  T.ok(/SNAP_MAX = 12 \* 1024 \* 1024/.test(read('app/store.js')), 'a copy has a size limit');
});

T.atest('restoring a copy brings back mass-deleted shifts, and the state before the restore is kept too', async () => {
  const P = await phone();
  await withShifts(P, 5);
  const m = await P.Store.snapshot('auto');
  // a mistaken mass delete
  await P.Store.apply(['s0', 's1', 's2', 's3'].map((id) => ({ store: 'shifts', del: id })), 'מחיקה');
  T.eq(P.S.shifts.length, 1);
  await P.Store.importBackup(await P.Store.snapData(m.id), 'replace');
  T.eq(P.S.shifts.length, 5, 'all 5 shifts back');
  const before = P.Store.snaps().find((x) => x.kind === 'before');
  T.ok(before && before.shifts === 1, 'a copy of the state before the restore (1 shift)');
  T.ok(P.Store.snaps().some((x) => x.id === m.id), 'the restored copy is still there');
  // a second restore replaces the earlier "before" copy (one is kept)
  await P.Store.importBackup(await P.Store.snapData(m.id), 'merge');
  T.eq(P.Store.snaps().filter((x) => x.kind === 'before').length, 1, 'one "before" copy');
  T.eq(P.files.join(','), '', 'no file');
});

T.atest('switched off, the demo, signing out or "delete everything": no copies', async () => {
  const idb = fakeIndexedDB();
  const P = await phone({ idb });
  await withShifts(P, 2);
  await P.Store.snapshot('auto');
  await P.Store.setSettings((s) => { s.backup.autoEvery = 'off'; });
  T.eq(await P.Store.autoSnapshot(Date.now() + 99 * DAY), null, 'off: no copy');
  T.eq(await P.Store.snapshot('before'), null, 'off: no copy before a restore either');
  await P.Store.dropSnaps();
  T.eq(P.Store.snaps().length, 0, 'switching off removes the copies');
  T.eq((await rows(idb)).length, 0, 'from the database too');
  await P.Store.setSettings((s) => { s.backup.autoEvery = 'weekly'; s.demo = true; });
  T.eq(await P.Store.autoSnapshot(), null, 'the demo: no copy');
  await P.Store.setSettings((s) => { s.demo = false; });
  T.ok(await P.Store.autoSnapshot(), 'on again: a copy');
  await P.Store.wipe();
  T.eq(P.Store.snaps().length, 0, 'wipe (sign-out, delete everything) leaves no copy in the list');
  T.eq((await rows(idb)).length, 0, 'nor in the database');
});

T.test('the database gets the new store (version 4)', () => {
  const s = read('app/store.js');
  T.ok(/const DB_VERSION = 4;/.test(s) && /'parked', 'snaps'\]/.test(s), 'snaps is created on upgrade');
  T.ok(/s !== 'snaps'\);/.test(s), 'and kept out of the synced and backed-up lists');
});

T.section('nothing makes a file without a tap (guard)');

T.test('every call that makes a file is one a tap starts', () => {
  // file: how many calls that make a file it may hold; each one checked by hand to run from a tap (24 Nov 2026)
  const ALLOWED = {
    'app/app.js': 2, // App.doBackup: UI.download, and "share to Drive" on its toast (Settings > backup "download")
    'app/export.js': 4, // CSV (2), ICS, the summary picture: export buttons
    'app/ui.js': 4, // the helpers themselves (shareFile, shareText: navigator.share; download: a.download; saveFile hands a download to UI.download)
    'app/views-settings.js': 1, // "back up and share to Drive"
    'app/views-payslip.js': 2, // a payslip PDF's share button; the share card
    'app/views-recap.js': 1, // the recap's share button
    'app/views-leaderboard.js': 1, // the leaderboard's share button
    'app/hours-check.js': 1, // the hours check's share button (text)
  };
  const rx = /UI\.(download|saveFile|shareFile)\(|navigator\.share\(|\.download = |showSaveFilePicker/g;
  const found = {};
  const walk = (dir) => { for (const f of fs.readdirSync(path.join(SRC, dir))) { const p = dir + '/' + f; if (f.endsWith('.js')) { const n = (read(p).replace(/^\s*(\/\/|\*).*$/gm, '').match(rx) || []).length; if (n) found[p] = n; } } };
  walk('app'); walk('core');
  T.eq(JSON.stringify(found, Object.keys(found).sort()), JSON.stringify(ALLOWED, Object.keys(ALLOWED).sort()), 'a new place that makes a file must be a tap (and listed here)');
  T.ok(!/download|saveFile|shareFile|showSaveFilePicker/.test(read('sw.js').replace(/\/\/.*$/gm, '')), 'the service worker makes no file');
});

T.test('the backup reminder and the home banner open the backup page, never a file', () => {
  const ins = read('app/views-insights.js');
  T.ok(/rec\.type === 'backup'\) later\(\(\) => App\.sheetsApi\.settingsSection\('backup'\)\)/.test(ins), 'a tap on the phone\'s notification opens the page');
  T.ok(/App\.actions\['backup-now'\] = \(\) => App\.sheetsApi\.settingsSection\('backup'\)/.test(read('app/views-home.js')), 'the banner opens the page');
  const calls = [];
  for (const f of fs.readdirSync(path.join(SRC, 'app'))) if (f.endsWith('.js')) for (const m of read('app/' + f).matchAll(/App\.doBackup\(/g)) calls.push(f + '@' + m.index);
  // and the storage banner's button (shown only while the phone's storage does not work, views-home.js): a tap, once
  T.eq(calls.filter((c) => !c.startsWith('views-settings.js') && !c.startsWith('views-home.js')).length, 0, 'only the backup page\'s buttons and the storage banner call doBackup');
  T.eq(calls.filter((c) => c.startsWith('views-home.js')).length, 1, 'the banner: one call');
  T.ok(/App\.actions\['storage-backup'\] = \(\) => App\.doBackup\(false\);/.test(read('app/views-home.js')), 'from its button\'s tap');
});
