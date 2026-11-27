/* App-flow and data guards (1.46 review, 27 Nov 2026). Each test here failed on the code before its fix:
 *  1. the end of a shift and its undo: one step, the running shift back exactly (start, breaks, switches)
 *  2. a role in use by the running shift is never deleted; an employer with entries or payslips neither
 *  4. a scanned payslip's pages are all read (slipPages), as a text PDF's are
 *  5. a payslip with no month: no crash (Payslip.analyze null, U.byPeriodDesc)
 *  6. the phone's storage stops: it is tried again later, the app hears it at the start too
 *  7. a new phone's setup never overwrites the account's employer and settings on the first sign-in
 *  8. a break or a role switch with no running shift does nothing
 *  9. an NFC touch answered "cancel" asks again on the next touch
 * The real store.js / cloud.js / nfc.js / views-payslip.js run here (APPFLOW_SRC=<a copy of src/>: another version). */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { fakeIndexedDB, fakeBackend, fakeClient } = require('./fakes.js');

const SRC = process.env.APPFLOW_SRC || path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const user = { uid: 'u1', email: 'me@example.com', displayName: 'Me' };

/** An IndexedDB that can stop working: ctl.broken (every transaction throws, as a full disk does), ctl.openBroken. */
function flakyIdb() {
  const base = fakeIndexedDB();
  const ctl = { broken: false, openBroken: false };
  const wrap = (d) => d && {
    objectStoreNames: d.objectStoreNames, createObjectStore: d.createObjectStore, close() {},
    transaction(n, m) { if (ctl.broken) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); return d.transaction(n, m); },
  };
  const idb = {
    open(name, v) {
      if (ctl.openBroken) {
        const req = {};
        setTimeout(() => { req.error = Object.assign(new Error('backing store'), { name: 'UnknownError' }); if (req.onerror) req.onerror(); }, 0);
        return req;
      }
      const req = base.open(name, v);
      let r = null;
      Object.defineProperty(req, 'result', { configurable: true, get: () => r, set: (d) => { r = wrap(d); } });
      return req;
    },
  };
  return { idb, ctl };
}
async function phone(opts) {
  opts = opts || {};
  const ctx = { console: process.env.DBG ? console : { log() {}, warn() {}, error: console.error }, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, indexedDB: opts.idb || fakeIndexedDB(), navigator: { onLine: true } };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.UI = { dialog: async () => opts.answer || 'merge', confirm: async () => true, timeAgo: () => '', toast() {}, esc: (s) => String(s) };
  vm.createContext(ctx);
  const files = ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'app/store.js'].concat(opts.cloud ? ['app/cloud.js'] : []);
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  if (opts.cloud) { const { fs: ffs } = fakeClient(opts.cloud); ctx.Cloud._useSdk({ app: {}, auth: {}, db: {}, au: { signOut: async () => {} }, fs: ffs }); }
  const events = [];
  ctx.Store.on((ev) => events.push(ev));
  await ctx.Store.load();
  return { ctx, S: ctx.Store.S, Store: ctx.Store, Cloud: ctx.Cloud, events };
}
const plain = (o) => JSON.parse(JSON.stringify(o));

T.section('app flow: the end of a shift, its undo, the storage, the first sign-in');

const T0 = Date.UTC(2026, 10, 20, 7, 0);
const RUN = { start: T0, roleId: 'r1', employerId: 'emp1', splits: [{ at: T0 + 3600000, roleId: 'r2' }], breaks: [{ from: T0 + 7200000, to: T0 + 9000000 }], fromPlanned: null, note: 'x' };
const shiftOf = (id) => ({ id, kind: 'shift', employerId: 'emp1', roleId: 'r1', status: 'done', start: T0, end: T0 + 4 * 3600000, splits: RUN.splits, breakMin: 30, breakPaid: false, items: [], note: '' });

T.atest('the end of a shift: the shift saved and the timer off in one write; its undo brings the timer back as it was', async () => {
  const idb = fakeIndexedDB();
  const A = await phone({ idb });
  await A.Store.setActive(plain(RUN));
  const r = await A.Store.apply([{ store: 'shifts', put: shiftOf('s1') }, { active: null }], 'סיום משמרת');
  T.eq(r, true, 'one undoable step');
  T.eq(A.S.activeShift, null, 'the timer is off');
  T.eq(A.S.shifts.length, 1, 'the shift is saved');
  // what the phone holds after the step (a crash right after it): the shift and no running timer, both
  const B = await phone({ idb });
  T.eq(B.S.shifts.length, 1); T.eq(B.S.activeShift, null, 'never the saved shift with the timer still running');
  T.ok(A.S.meta.activeDirty && A.S.meta.activeUpdatedAt > 0, 'the other phones hear the timer is off');
  T.eq(await A.Store.undo(), 'סיום משמרת');
  T.eq(A.S.shifts.length, 0, 'the saved shift is gone');
  T.eq(JSON.stringify(A.S.activeShift), JSON.stringify(RUN), 'the running shift is back: its start, breaks and switches');
  const C = await phone({ idb });
  T.eq(JSON.stringify(C.S.activeShift), JSON.stringify(RUN), 'and saved so');
  T.eq(C.S.shifts.length, 0);
});

T.atest('an ended shift is not brought back over one that started since', async () => {
  const A = await phone();
  await A.Store.setActive(plain(RUN));
  await A.Store.apply([{ store: 'shifts', put: shiftOf('s1') }, { active: null }], 'סיום משמרת');
  const next = Object.assign(plain(RUN), { start: T0 + 6 * 3600000, splits: [], breaks: [] });
  await A.Store.setActive(next);
  T.eq(await A.Store.undo(), null, 'not undone');
  T.eq(A.S.shifts.length, 1, 'the ended shift stays saved');
  T.eq(JSON.stringify(A.S.activeShift), JSON.stringify(next), 'the new shift keeps running');
});

T.test('App.stopShift ends through that one step (no separate setActive after the save); break and switch need a shift', () => {
  const app = read('app/app.js');
  const stop = app.slice(app.indexOf('async function saveStop'), app.indexOf('async function afterStop'));
  T.ok(/const ops = \[\{ store: 'shifts', put: sh \}, \{ active: null \}\];/.test(stop), 'the timer off in the same ops');
  T.ok(!/Store\.setActive\(null\);\s*return sh;/.test(stop), 'no second write after the save');
  T.ok(/const done = Object\.assign\(\{\}, a\);/.test(stop) && !/\ba\.breaks = /.test(stop), 'the running shift is not changed in place (the undo restores it)');
  T.ok(/App\.toggleBreak = async function \(at\) \{\s*if \(!S\.activeShift\) return;/.test(app), 'a break needs a running shift');
  T.ok(/App\.switchRole = async function \(roleId\) \{\s*if \(!S\.activeShift \|\| !roleId\) return;/.test(app), 'a switch too');
});

T.atest('the storage stops mid-session: memory only, said once; tried again later, and what was saved meanwhile reaches the database', async () => {
  const { idb, ctl } = flakyIdb();
  const A = await phone({ idb });
  A.Store._retryMs(60000);
  ctl.broken = true;
  await A.Store.apply([{ store: 'shifts', put: shiftOf('s1') }], 'x');
  T.ok(A.Store.isMemoryOnly(), 'from memory now');
  T.eq(A.events.filter((e) => e.type === 'storage-lost').length, 1, 'the app hears it');
  await A.Store.putFile('f1', { b: 1 }, 'slip.pdf', 'application/pdf');
  T.ok(!!(await A.Store.getFile('f1')), 'a file stored meanwhile can be read back');
  ctl.broken = false;
  A.Store._retryMs(0);
  await A.Store.apply([{ store: 'shifts', put: shiftOf('s2') }], 'x'); // the next save tries the database again
  for (let i = 0; i < 150 && A.Store.isMemoryOnly(); i++) await wait(20);
  T.ok(!A.Store.isMemoryOnly(), 'the database is used again (it was memory-only for the whole session)');
  T.eq(A.events.filter((e) => e.type === 'storage-back').length, 1, 'the app hears that too (the banner goes)');
  const B = await phone({ idb });
  T.eq(B.S.shifts.map((s) => s.id).sort().join(), 's1,s2', 'both shifts saved');
  T.ok(!!(await B.Store.getFile('f1')), 'and the file');
});

T.atest('the storage fails at the start: the app hears it then (the banner); an empty database later takes the data, one that holds data is never overwritten', async () => {
  // a database with data, unreachable at the start
  const { idb, ctl } = flakyIdb();
  const A = await phone({ idb });
  await A.Store.apply([{ store: 'shifts', put: shiftOf('old') }], 'x');
  ctl.openBroken = true;
  const B = await phone({ idb });
  T.ok(B.Store.isMemoryOnly(), 'memory only');
  T.ok(B.events.some((e) => e.type === 'storage-lost' && e.startup), 'said at the start');
  ctl.openBroken = false;
  B.Store._retryMs(0);
  await B.Store.apply([{ store: 'shifts', put: shiftOf('new') }], 'x');
  await wait(200);
  T.ok(B.Store.isMemoryOnly(), 'stays in memory: the database holds what this session never read');
  const C = await phone({ idb });
  T.eq(C.S.shifts.map((s) => s.id).join(), 'old', 'the data on the phone kept as it was');
  // an empty database (a private window that could not open one at first)
  const F = flakyIdb();
  F.ctl.openBroken = true;
  const D = await phone({ idb: F.idb });
  F.ctl.openBroken = false;
  D.Store._retryMs(0);
  await D.Store.apply([{ store: 'shifts', put: shiftOf('n1') }], 'x');
  for (let i = 0; i < 150 && D.Store.isMemoryOnly(); i++) await wait(20);
  T.ok(!D.Store.isMemoryOnly(), 'the empty database is used');
  const E = await phone({ idb: F.idb });
  T.eq(E.S.shifts.map((s) => s.id).join(), 'n1', 'with this session\'s data');
});

T.atest('first sign-in on a new phone: the setup\'s employer and settings never replace the account\'s (emp1 on every phone)', async () => {
  const be = fakeBackend();
  const A = await phone({ cloud: be });
  await A.Store.apply([{ store: 'employers', put: Object.assign(A.ctx.Store.clone(A.S.employers[0]), { name: 'הקפה של דנה', travelPerDay: 22 }) }], 'x');
  await A.Store.setSettings((s) => { s.onboarded = true; s.goal.amount = 7000; s.tax.creditPoints = 2.75; });
  await A.Store.apply([{ store: 'shifts', put: shiftOf('a1') }], 'x');
  await A.Cloud.connect(user); await wait(60);
  // a new phone: the setup's answers, then a real shift as a guest, then the same account
  const B = await phone({ cloud: be });
  await B.Store.apply([{ store: 'employers', put: Object.assign(B.ctx.Store.clone(B.S.employers[0]), { name: 'המעסיק שלי', travelPerDay: 16 }) }, { store: 'roles', put: { id: 'r_b', name: 'מלצר', color: '#2a78d6', employerId: 'emp1', rates: [{ from: '2000-01-01', rate: 40 }] } }], null);
  await B.Store.setSettings((s) => { s.onboarded = true; s.goal.amount = 1; s.tax.creditPoints = 2.25; });
  await B.Store.setMeta({ setupAt: Date.now(), lastRole: 'r_b' });
  await B.Store.apply([{ store: 'shifts', put: Object.assign(shiftOf('b1'), { roleId: 'r_b' }) }], 'x');
  await B.Cloud.connect(user); await wait(100);
  T.eq(B.S.employers.find((e) => e.id === 'emp1').name, 'הקפה של דנה', 'the account\'s employer');
  T.eq(B.S.employers.find((e) => e.id === 'emp1').travelPerDay, 22);
  T.eq(B.S.settings.goal.amount, 7000, 'the account\'s settings');
  T.eq(B.S.settings.tax.creditPoints, 2.75);
  T.ok(B.S.shifts.some((s) => s.id === 'b1') && B.S.roles.some((r) => r.id === 'r_b'), 'the guest\'s shift and role are kept');
  await B.Cloud.syncNow(); await wait(60);
  T.eq(JSON.parse(be.docs.get('users/u1/employers/emp1').j).name, 'הקפה של דנה', 'the account keeps its own');
  T.ok(be.docs.has('users/u1/shifts/b1'), 'the guest\'s shift went up');
});

T.atest('first sign-in: an employer or settings edited after the setup are the person\'s and still win (newer)', async () => {
  const be = fakeBackend();
  const A = await phone({ cloud: be });
  await A.Store.apply([{ store: 'employers', put: Object.assign(A.ctx.Store.clone(A.S.employers[0]), { name: 'ישן' }) }], 'x');
  await A.Store.setSettings((s) => { s.onboarded = true; s.goal.amount = 7000; });
  await A.Cloud.connect(user); await wait(60);
  const B = await phone({ cloud: be });
  await B.Store.setMeta({ setupAt: Date.now() - 60000 }); // the setup a minute ago
  await B.Store.apply([{ store: 'employers', put: Object.assign(B.ctx.Store.clone(B.S.employers[0]), { name: 'חדש' }) }], 'x');
  await B.Store.setSettings((s) => { s.onboarded = true; s.goal.amount = 9000; });
  await B.Store.apply([{ store: 'shifts', put: shiftOf('b1') }], 'x');
  await B.Cloud.connect(user); await wait(100);
  T.eq(B.S.employers.find((e) => e.id === 'emp1').name, 'חדש', 'edited here after the setup: kept');
  T.eq(B.S.settings.goal.amount, 9000);
});

T.section('app flow: roles, employers, payslips without a month, NFC, scanned payslips');

T.test('a role is in use by the running shift too; an employer by its entries and payslips', () => {
  const W = globalThis.Workplace;
  const S = { shifts: [], roles: [{ id: 'r1', employerId: 'e1' }], activeShift: { roleId: 'r1', employerId: 'e1' } };
  T.eq(W.roleUses(S, 'r1'), 1, 'the running shift');
  T.eq(W.roleUses({ shifts: [{ roleId: 'r2', splits: [{ roleId: 'r1' }] }], activeShift: { roleId: 'r2', splits: [{ roleId: 'r1', at: 1 }] } }, 'r1'), 2, 'switches count');
  T.eq(W.roleUses({ shifts: [], activeShift: null }, 'r1'), 0);
  T.eq(W.employerInUse({ roles: [], shifts: [], entries: [{ employerId: 'e2', kind: 'sick' }], activeShift: null }, 'e2'), true, 'an entry');
  T.eq(W.employerInUse({ roles: [], shifts: [], payslips: [{ employerId: 'e2', period: '2026-10' }], activeShift: null }, 'e2'), true, 'a payslip');
  T.eq(W.employerInUse({ roles: [], shifts: [], entries: [], payslips: [], activeShift: null }, 'e2'), false);
  const set = read('app/views-settings.js');
  T.ok(/const usedBy = root\.Workplace\.roleUses\(S, d\.id\);/.test(set), 'the role editor\'s delete asks it');
  const sh = read('app/views-shift.js');
  T.ok(/if \(!to\) \{ UI\.toast\([^)]*\); return; \}/.test(sh), '"add a switch" with every role archived does not throw');
});

T.test('a payslip with no month: analyze says null, the checks after it too, and lists sort it last', () => {
  const P = globalThis.Payslip, U = globalThis.U;
  const model = { ctx: { settings: {}, employers: new Map(), primaryEmployer: () => ({ id: 'emp1' }) }, results: new Map() };
  T.eq(P.analyze({ id: 'p', period: null, fields: {} }, model), null);
  T.eq(P.hasPeriod({ period: '2026-10' }), true);
  T.eq(JSON.stringify(P.settingsCheck({ id: 'p', period: null, fields: {} }, model)), '[]');
  T.eq(P.reconcile({ id: 'p', period: null, fields: {} }, model), null);
  T.eq(P.checkGap(null, { fields: {} }, model), null);
  const list = [{ period: '2026-08' }, { period: null }, { period: '2026-10' }, {}];
  T.eq(list.slice().sort(U.byPeriodDesc).map((p) => p.period || '-').join(), '2026-10,2026-08,-,-');
  const vp = read('app/views-payslip.js');
  T.ok(!/\.period\.localeCompare/.test(vp), 'no sort by period that breaks on null');
  T.ok(/if \(!Payslip\.hasPeriod\(p\)\) \{ verifySheet\(/.test(vp), 'opening one asks for its month');
});

function loadPayslipView() {
  const g = globalThis, saved = {};
  const stubs = { Store: { S: { settings: { ai: {} }, employers: [], payslips: [], gaps: [] } }, UI: { icon: () => '', esc: (x) => String(x), money: (x) => String(x) }, App: { actions: {}, sheetsApi: {} }, Charts: {} };
  for (const k of Object.keys(stubs)) { saved[k] = g[k]; if (g[k] === undefined) g[k] = stubs[k]; }
  const file = path.join(SRC, 'app', 'views-payslip.js');
  try { delete require.cache[file]; require(file); return g.App; } finally { for (const k of Object.keys(stubs)) if (saved[k] === undefined) delete g[k]; }
}
T.atest('a scanned payslip of two pages: both pages read (the second held the pension and the net); the next month\'s slip is not', async () => {
  const APP = loadPayslipView();
  T.ok(typeof APP.slipPages === 'function', 'one way of joining the pages');
  const L = (t) => ({ text: t, words: [] });
  const page1 = ['תלוש שכר לחודש 10/2026', 'שכר יסוד 168.00 40.00 6,720.00', 'שעות נוספות 125% 10.00 50.00 500.00', 'סה"כ תשלומים 7,220.00', 'מס הכנסה 210.00 ביטוח לאומי 250.00'].map(L);
  const page2 = ['ניכוי עובד לקרן פנסיה 433.20', 'הפרשת מעסיק לפנסיה 469.30 פיצויים 433.20', 'סה"כ ניכויים 893.20', 'שכר נטו לתשלום 6,326.80 לחשבון בנק'].map(L);
  const page3 = ['תלוש שכר לחודש 11/2026', 'שכר יסוד 160.00 40.00 6,400.00', 'סה"כ תשלומים 6,400.00', 'שכר נטו לתשלום 5,700.00 לחשבון בנק'].map(L);
  const pages = [page1, page2, page3];
  const got = await APP.slipPages(3, async (p) => pages[p - 1]);
  const text = got.lines.map((l) => l.text).join('\n');
  T.ok(/פנסיה 433\.20/.test(text) && /6,326\.80/.test(text), 'the second page is in');
  T.ok(!/5,700\.00/.test(text), 'the next month\'s payslip is not');
  T.eq(got.more, true, 'and the file is said to hold more than one');
  const vp = read('app/views-payslip.js');
  const ex = vp.slice(vp.indexOf('async function extractSlip'), vp.indexOf('App.readDocWords = ', vp.indexOf('async function extractSlip')));
  T.ok((ex.match(/await slipPages\(/g) || []).length === 2, 'text pages and scanned pages both go through it');
  T.ok(!/if \(holdsSlip\(text\)\) return/.test(ex), 'no stop at the first page that holds a payslip');
});

T.atest('NFC: a touch answered "cancel" is not a touch; touching again asks again (it was ignored for 10 seconds)', async () => {
  const store = {};
  const asked = [];
  const ctx = {
    console, setTimeout, clearTimeout, Date,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    Nfc: globalThis.Nfc, U: globalThis.U,
    Store: { S: { settings: { nfcTags: [] }, activeShift: null } },
    UI: { icon: () => '', esc: (s) => String(s), confirm: async (t) => { asked.push(t); return false; } },
    App: { actions: {}, roles: () => [], startShift: async () => {}, stopShift: async () => {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('app/nfc.js'), ctx, { filename: 'nfc.js' });
  await ctx.App.nfcOpen('zzzzzz9999'); // a sticker this account did not write: asks
  await ctx.App.nfcOpen('zzzzzz9999');
  T.eq(asked.length, 2, 'asked both times');
  // a question on screen: the same touch read twice asks once
  let answer; ctx.UI.confirm = (t) => { asked.push(t); return new Promise((r) => { answer = r; }); };
  const a = ctx.App.nfcOpen('zzzzzz9999'), b = ctx.App.nfcOpen('zzzzzz9999');
  answer(false); await a; await b;
  T.eq(asked.length, 3, 'one question for a double read');
});

T.test('the payslip check screen: emptied hours or amount drop the rate worked out from them; the shifts list filters entries by planned/done', () => {
  const vp = read('app/views-payslip.js');
  const ri = vp.slice(vp.indexOf('function readInputs()'), vp.indexOf('function redraw(openKey)'));
  T.ok(/else if \(f\.rate != null && was\[k\] && \(was\[k\]\.q !== f\.qty \|\| was\[k\]\.v !== f\.value\)\) delete f\.rate;/.test(ri), 'a stale rate goes');
  const rep = read('app/views-reports.js');
  T.ok(/const entries = S\.entries\.filter\([^\n]*\(f\.status === 'all' \|\| \(e\.status \|\| 'done'\) === f\.status\)\)/.test(rep), 'entries by status');
});
