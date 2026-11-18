/* The payslip check after the readers campaign (19 Nov 2026), four things the campaign left:
 *  - a payslip's stored file goes once nothing can show it: no saved payslip names it and no undo step can bring one
 *    back that does (the store's sweep, also at start-up). Before, every file read stayed on the phone and in a
 *    "backup with files" after the payslip was deleted (intake P1). A file a saved payslip names is never deleted.
 *  - the check says under the month box when the file did not give the month (only a toast after "המשך" said it);
 *  - it says when the file holds more than one payslip (the parser's secondSlip, or a PDF page of another month);
 *  - an hour line read with its amount and no hours says so on its row.
 * The real store.js runs against the fake IndexedDB (fakes.js); the real views-payslip.js draws the check. */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { fakeIndexedDB } = require('./fakes.js');

const SRC = process.env.SLIPFILES_SRC || path.join(__dirname, '..', 'src');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// one opening of the app on a phone (the same idb again = the app opened again on that phone)
async function open(idb) {
  const ctx = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: idb, navigator: { onLine: true }, crypto: require('crypto').webcrypto, TextEncoder, Intl, atob, Blob };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'core/ledger.js', 'app/store.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  await ctx.Store.load();
  return ctx.Store;
}
const slip = (id, fileId) => ({ id, period: '2026-10', employerId: 'emp1', fields: { gross: { value: 5000 } }, other: [], text: '', source: 'pdf', fileId, fileName: 'slip.jpg' });
// the file ids stored on the phone
async function fileIds(Store) {
  const out = [];
  for (const id of ['f1', 'f2', 'f3', 'f4']) if (await Store.getFile(id)) out.push(id);
  return out.join(',');
}
// a save the way the check does it: the file stored, then the payslip that names it (saveSlip)
async function save(Store, id, fileId) {
  await Store.putFile(fileId, 'pixels', 'slip.jpg', 'image/jpeg');
  await Store.apply([{ store: 'payslips', put: slip(id, fileId) }], 'שמירת תלוש');
}
const steps = async (Store, n) => { for (let i = 0; i < n; i++) await Store.apply([{ store: 'shifts', put: { id: 's' + i, kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: 1700000000000 + i * 1e7, end: 1700003600000 + i * 1e7 } }], 'משמרת'); };

T.section('payslip files: a file goes with the payslip, once its undo is gone (intake P1)');

T.atest('a saved payslip keeps its file; a read never saved leaves nothing once the app opens again', async () => {
  const idb = fakeIndexedDB();
  let Store = await open(idb);
  await save(Store, 'ps1', 'f1');
  await Store.putFile('f2', 'pixels', 'other.jpg', 'image/jpeg'); // stored by an older version before reading, never saved
  T.eq(await Store.sweepFiles(), 0, 'right after: f2 may be a save on its way');
  T.eq(await fileIds(Store), 'f1,f2');
  Store = await open(idb);
  T.eq(await Store.sweepFiles(), 1);
  T.eq(await fileIds(Store), 'f1', 'the saved payslip\'s file stays, the unsaved one goes');
});

T.atest('a deleted payslip keeps its file while "ביטול" can bring it back, and loses it after', async () => {
  const idb = fakeIndexedDB();
  let Store = await open(idb);
  await save(Store, 'ps1', 'f1');
  await Store.apply([{ store: 'payslips', del: 'ps1' }], 'מחיקת תלוש');
  await Store.sweepFiles();
  T.eq(await fileIds(Store), 'f1', 'the undo can still bring the payslip back');
  await Store.undo();
  await Store.sweepFiles();
  T.eq(Store.S.payslips.length, 1);
  T.eq(await fileIds(Store), 'f1', 'and its file is there');
  await Store.apply([{ store: 'payslips', del: 'ps1' }], 'מחיקת תלוש');
  await steps(Store, 30); // the delete is now past the 30 steps undo keeps
  await Store.sweepFiles();
  T.eq(await fileIds(Store), '', 'no undo left: the file goes');
  // and the same through the app opened again (the undo lives in memory only)
  await save(Store, 'ps2', 'f2');
  await Store.apply([{ store: 'payslips', del: 'ps2' }], 'מחיקת תלוש');
  Store = await open(idb);
  await Store.sweepFiles();
  T.eq(await fileIds(Store), '');
});

T.atest('the sweep runs by itself after the change (no call), and the undo of a save leaves no file', async () => {
  const Store = await open(fakeIndexedDB());
  await save(Store, 'ps1', 'f1');
  await Store.undo(); // the save undone: no payslip, and nothing can bring it back (there is no redo)
  await wait(1700);
  T.eq(Store.S.payslips.length, 0);
  T.eq(await fileIds(Store), '', 'gone without anyone calling the sweep');
});

T.atest('a file a payslip on the phone names is never deleted, also when the app could not load that payslip', async () => {
  const Store = await open(fakeIndexedDB());
  await save(Store, 'ps1', 'f1');
  await save(Store, 'ps2', 'f2');
  Store.S.payslips.splice(0, 2); // gone from memory only: still saved on the phone
  await Store.sweepFiles();
  T.eq(await fileIds(Store), 'f1,f2');
});

T.atest('a restore keeps the files its payslips name and drops the rest it carried', async () => {
  const Store = await open(fakeIndexedDB());
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  const backup = { app: 'shiftpay', schemaVersion: Store.SCHEMA_VERSION, settings: {}, payslips: [slip('ps1', 'f1')], files: [{ id: 'f1', name: 'a.png', type: 'image/png', data: png }, { id: 'f3', name: 'old.png', type: 'image/png', data: png }] };
  await Store.importBackup(backup, 'replace');
  await Store.sweepFiles();
  T.eq(await fileIds(Store), 'f1');
});

/* ---------------- the check screen ---------------- */
// the real views-payslip.js with stand-ins for the browser parts; openSheet hands back what the sheet would draw
function loadCheck() {
  const g = globalThis, saved = {};
  let sheet = null;
  const UI = { icon: (n) => `<i data-i="${n}"></i>`, esc: (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), money: (x) => String(x), tile: () => '', openSheet: (o) => { sheet = o; } };
  const stubs = { Store: { S: { settings: { ai: {} }, employers: [], payslips: [], gaps: [] }, clone: (o) => JSON.parse(JSON.stringify(o || null)) }, UI, App: { actions: {}, sheetsApi: {} }, Charts: {} };
  for (const k of Object.keys(stubs)) { saved[k] = g[k]; g[k] = stubs[k]; }
  const file = path.join(SRC, 'app', 'views-payslip.js');
  try {
    delete require.cache[file];
    require(file);
    const App = g.App;
    return (draft) => { App.payslipVerify(draft); return sheet.body; };
  } finally { for (const k of Object.keys(stubs)) { if (saved[k] === undefined) delete g[k]; else g[k] = saved[k]; } }
}

T.section('payslip check: what the reading could not tell is said where it belongs');

T.test('a month the file did not give: a line under the month box, tied to it', () => {
  const draw = loadCheck();
  const fields = { gross: { value: 5000, line: 'ברוטו 5,000.00' } };
  const asked = draw({ fields, other: [], period: '', monthAsk: true, text: 'x', source: 'pdf' });
  T.ok(asked.includes('לא מצאנו בתלוש את החודש. בחרו אותו כאן.'), 'the line is there');
  T.ok(/id="vf-period"[^>]*aria-describedby="vf-month-note"/.test(asked) && asked.includes('id="vf-month-note"'), 'a screen reader hears it with the box');
  T.ok(asked.indexOf('vf-month-note') > asked.indexOf('id="vf-period"') && asked.indexOf('id="vf-month-note"') < asked.indexOf('data-top'), 'right under the box, above the summary');
  T.ok(!draw({ fields, other: [], period: '2026-10', monthAsk: true, text: 'x', source: 'pdf' }).includes('vf-month-note'), 'a month that is there: no line');
  T.ok(!draw({ fields: {}, other: [], period: '', text: '', source: 'manual' }).includes('vf-month-note'), 'typed by hand: no line (nothing was read)');
});

T.test('a file with more than one payslip: the check says only the first was read', () => {
  const draw = loadCheck();
  const fields = { gross: { value: 5000, line: 'ברוטו 5,000.00' } };
  T.ok(draw({ fields, other: [], period: '2026-10', more: true, text: 'x', source: 'pdf' }).includes('בקובץ יש יותר מתלוש אחד. קראנו את הראשון, ואת השאר אפשר להעלות בנפרד.'));
  T.ok(!draw({ fields, other: [], period: '2026-10', text: 'x', source: 'pdf' }).includes('יותר מתלוש אחד'));
  const src = fs.readFileSync(path.join(SRC, 'app', 'views-payslip.js'), 'utf8');
  const start = src.slice(src.indexOf('async function startExtraction'), src.indexOf('/* ---------------- verification'));
  T.ok(start.includes('more: !!(parsed.secondSlip || more)'), 'the parser\'s secondSlip and a PDF\'s next payslip both reach the check');
  T.ok(/if \(all\.length && period && per && per !== period && holdsSlip\(t\)\) \{ more = true; break; \}/.test(src), 'a PDF page of the next month says so');
  T.ok(/more: d\.more, isNew/.test(src), 'it stays when the check is opened again from the result ("תקן נתונים")');
});

T.test('an hour line read with its amount and no hours: a hint on its row, tied to its hours box', () => {
  const draw = loadCheck();
  const hint = 'לא זיהינו בוודאות כמה שעות רשומות בשורה הזאת. אפשר להקליד אותן מהתלוש.';
  const b = draw({ fields: { base: { value: 5000, qty: null, line: 'שכר יסוד 5,000.00' }, travel: { value: 200, line: 'נסיעות 200.00' } }, other: [], period: '2026-10', text: 'x', source: 'pdf' });
  T.eq(b.split(hint).length - 1, 1, 'once: on the base, not on travel (no hours)');
  T.ok(b.includes('id="vf-hint-base"') && /data-q="base"[^>]*aria-describedby="vf-hint-base"/.test(b), 'the hours box is described by it');
  T.ok(b.indexOf('id="vf-hint-base"') > b.indexOf('data-open="base"') && b.indexOf('id="vf-hint-base"') < b.indexOf('data-q="base"'), 'under the row, above its inputs');
  T.ok(!draw({ fields: { base: { value: 5000, qty: 160, line: 'שכר יסוד 160 31.25 5,000.00' } }, other: [], period: '2026-10', text: 'x', source: 'pdf' }).includes(hint), 'hours read: no hint');
  T.ok(!draw({ fields: { base: { value: 5000 } }, other: [], period: '2026-10', text: '', source: 'manual' }).includes(hint), 'a line typed by hand: no hint');
  T.ok(!draw({ fields: { base: { value: null, asked: true, line: 'שכר יסוד' } }, other: [], period: '2026-10', text: 'x', source: 'pdf' }).includes(hint), 'no amount: the row asks for the amount first');
  T.ok(draw({ fields: { rest150: { value: 240, qty: null, asked: true, why: 'qty', line: 'שבת 150% 240.00' } }, other: [], period: '2026-10', text: 'x', source: 'pdf' }).includes(hint), 'any hour line asked for its hours');
});

T.test('typing the hours moves nothing: the line under the name appears when the row closes', () => {
  const src = fs.readFileSync(path.join(SRC, 'app', 'views-payslip.js'), 'utf8');
  const live = src.slice(src.indexOf('function live(key)'), src.indexOf('function openRow('));
  T.ok(!/\[data-sub\]'\)\.innerHTML = subOf\(f\)/.test(live), 'live() does not fill an empty hours line (it pushed the box being typed in down a line)');
  T.ok(live.includes("if (!sub.innerHTML === !next) { sub.innerHTML = next; delete sub.dataset.later; } else sub.dataset.later = '1';"), 'a line that only changes is updated; one that appears or goes waits');
  const open = src.slice(src.indexOf('function openRow('), src.indexOf('function addMenu('));
  T.ok((open.match(/settleSub\(/g) || []).length >= 2, 'a row that closes (by itself, or when another opens) shows it');
});
