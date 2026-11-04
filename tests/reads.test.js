/* Firestore reads per day of use (the free plan has 50,000 a day for everyone together). One player with a year of
 * shifts and a full champions table: the app opened, games played, the table looked at, the app opened again later.
 * The real cloud.js and views-leaderboard.js run against the fake server, which bills like Firestore (fakes.js
 * billedClient). `node tests/reads.test.js [src]` prints the numbers of any copy of src/ (before and after a change). */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { fakeIndexedDB, fakeBackend, billedClient } = require('./fakes.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GAMES = ['coins', 'quiz', 'facts', 'pairs', 'hours'];
const user = { uid: 'me', email: 'me@example.com', displayName: 'Me' };

/** A memory localStorage shared by the openings of one phone. */
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
/** One opening of the app on a phone (idb and storage are the phone's; clock.ms moves its time forward). */
async function open(SRC, be, phone) {
  const R = Date, clock = phone.clock;
  class D extends R { constructor(...a) { super(...(a.length ? a : [R.now() + clock.ms])); } static now() { return R.now() + clock.ms; } }
  const ctx = { console, Date: D, setTimeout: (f, ms) => setTimeout(f, Math.min(ms || 0, 30)), clearTimeout, setInterval: () => 0, clearInterval() {},
    indexedDB: phone.idb, localStorage: phone.storage, navigator: { onLine: true }, Intl };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.UI = { dialog: async () => 'merge', confirm: async () => true, timeAgo: () => '', toast() {}, icon: () => '', esc: (s) => String(s), skeleton: () => '',
    closeTop() {}, closeAll() {}, sheets: [], openSheet: (o) => { ctx.__sheet = sheet(); o.onMount(ctx.__sheet); } };
  ctx.App = { actions: {}, games: { LIST: GAMES.map((id) => ({ id, t: id })) }, mascot: () => '' };
  ctx.Dom = { patch: (el, html) => { el.innerHTML = html; } };
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'core/leaderboard.js', 'app/store.js', 'app/cloud.js', 'app/views-leaderboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  // the app before this one on the phone is closed: its listeners hear nothing more
  if (phone.ctx) be.clients.delete(phone.ctx.__client);
  const { client, fs: ffs } = billedClient(be);
  ctx.__client = client; phone.ctx = ctx;
  ctx.Cloud._useSdk({ app: {}, auth: {}, db: {}, au: {}, fs: ffs });
  await ctx.Store.load();
  return ctx;
}
/** The champions sheet's few elements, and taps on its tabs. */
function sheet() {
  const node = () => ({ innerHTML: '', isConnected: true, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, querySelector: () => null });
  const parts = { '[data-lb-tabs]': node(), '[data-lb-body]': node(), '[data-lb-me]': node() };
  let click = null;
  return {
    isConnected: true, querySelector: (s) => parts[s] || null, querySelectorAll: () => [],
    addEventListener: (t, fn) => { if (t === 'click') click = fn; },
    tap: (data) => click({ target: { closest: (s) => (s === 'button' ? { dataset: data, hasAttribute: () => false } : null) } }),
  };
}
/** The server: my year of work, and 60 other players on every board. */
function server(SRC) {
  const be = fakeBackend();
  const ctx = { console, Intl }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/leaderboard.js']) vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  const LB = ctx.Leaderboard, k = LB.keys(LB.israel(Date.now()).day);
  for (let i = 0; i < 60; i++) {
    const g = {};
    for (const id of GAMES) { const s = Math.max(1, Math.round(LB.MAX[id] * (0.9 - i / 80))); g[id] = { d: LB.pack(k.d, s), w: LB.pack(k.w, s), m: LB.pack(k.m, s), y: LB.pack(k.y, s), a: s }; }
    be.docs.set('lb/p' + i, { n: 'player ' + i, e: LB.EMOJI[i % LB.EMOJI.length], bg: '', p: false, t: 1, g });
  }
  const put = (st, id, rec) => be.docs.set(`users/me/${st}/${id}`, { u: 1000 + be.docs.size, d: false, j: JSON.stringify(Object.assign({ id }, rec)) });
  put('employers', 'e1', { name: 'work' }); put('roles', 'r1', { employerId: 'e1', name: 'usher', rate: 40 });
  for (let i = 0; i < 300; i++) put('shifts', 's' + i, { kind: 'shift', employerId: 'e1', roleId: 'r1', status: 'done', start: 1, end: 2, note: '' });
  for (let i = 0; i < 12; i++) put('payslips', 'p' + i, { period: '2026-' + String(i + 1).padStart(2, '0'), fields: {} });
  be.docs.set('users/me/kv/settings', { u: 1, j: JSON.stringify({ onboarded: true, lb: { on: true, n: 'me', e: LB.EMOJI[0], bg: '' } }) });
  return be;
}

/** The day, step by step: { step: reads }. */
async function measure(SRC) {
  const be = server(SRC);
  const phone = { idb: fakeIndexedDB(), storage: fakeStorage(), clock: { ms: 0 } };
  const out = {};
  const step = async (name, fn) => { const a = be.reads; await fn(); await wait(150); out[name] = be.reads - a; };
  // the first sign-in on this phone takes the whole account (once per phone)
  let A = await open(SRC, be, phone);
  await step('first sign-in on a phone', async () => { await A.Cloud.connect(user); await wait(150); });
  await A.Champions.sync(); await wait(100);
  // the next openings: an hour later (the listeners were away more than 30 minutes)
  const reopen = async (name, hours) => {
    phone.clock.ms += hours * 3600000;
    A = await open(SRC, be, phone);
    await step(name, async () => { await A.Cloud.connect(user); await wait(100); await A.Champions.sync(); });
  };
  await reopen('opening the app', 1);
  await step('the games list', () => A.Champions.warm(null));
  for (let i = 1; i <= 3; i++) await step('a game played (' + i + ')', () => A.Champions.submit('coins', 100 + i * 50));
  await step('opening the table', async () => { A.Champions.open('coins'); await wait(400); });
  await step('switching a period', async () => { A.__sheet.tap({ period: 'w' }); await wait(100); });
  await step('switching a game', async () => { A.__sheet.tap({ game: 'quiz' }); await wait(100); });
  await step('opening the table again', async () => { A.Champions.open('coins'); await wait(400); });
  await reopen('opening the app again later', 0.75);
  await step('the table after opening again', async () => { A.Champions.open('coins'); await wait(400); });
  out.total = Object.keys(out).filter((k) => k !== 'first sign-in on a phone').reduce((s, k) => s + out[k], 0);
  return out;
}

if (require.main === module) {
  measure(path.resolve(process.argv[2] || path.join(__dirname, '..', 'src'))).then((r) => { console.log(JSON.stringify(r, null, 1)); process.exit(0); });
} else {
  T.atest('Firestore reads: a day of use stays small (the free plan is 50,000 a day for everyone)', async () => {
    const r = await measure(path.join(__dirname, '..', 'src'));
    const say = JSON.stringify(r);
    T.ok(r['opening the app'] <= 20, 'an opening reads what changed, not the whole account: ' + say);
    T.ok(r['a game played (2)'] <= 3, 'a game: my row and my place, not the board: ' + say);
    T.ok(r['opening the table'] <= 25, 'the table: the board on screen only: ' + say);
    T.ok(r['opening the table again'] === 0, 'opening the table again soon reads nothing: ' + say);
    T.ok(r['the table after opening again'] <= 25, 'after the app was closed: the board kept on the phone: ' + say);
    T.ok(r.total <= 150, 'the whole day: ' + say);
  });
}

/* What an opening reads is only what changed: it must still get every change made while the app was closed. */
const newPhone = () => ({ idb: fakeIndexedDB(), storage: fakeStorage(), clock: { ms: 0 } });
const rec = (A, id) => A.Store.S.shifts.find((x) => x.id === id);
async function twoPhones(SRC) {
  const be = server(SRC);
  const pa = newPhone(), pb = newPhone();
  let A = await open(SRC, be, pa); await A.Cloud.connect(user); await wait(150);
  const B = await open(SRC, be, pb); await B.Cloud.connect(user); await wait(150);
  return { be, pa, pb, A, B, reopenA: async (hours) => { pa.clock.ms += hours * 3600000; A = await open(SRC, be, pa); await A.Cloud.connect(user); await wait(200); return A; } };
}
const edit = async (P, id, note) => { await P.Store.apply([{ store: 'shifts', put: Object.assign({}, rec(P, id), { note }) }], 'x'); await P.Cloud.syncNow(); await wait(100); };
if (require.main !== module) {
  const SRC = path.join(__dirname, '..', 'src');
  T.atest('an opening gets the edits, new shifts and deletions made on another phone while it was closed', async () => {
    const t = await twoPhones(SRC);
    await wait(100);
    t.be.clients.delete(t.A.__client); // A is closed
    await edit(t.B, 's5', 'edited on B');
    await t.B.Store.apply([{ store: 'shifts', put: { id: 'new1', kind: 'shift', employerId: 'e1', roleId: 'r1', status: 'done', start: 1, end: 2, note: 'new on B' } }], 'x');
    await t.B.Store.apply([{ store: 'shifts', del: 's7' }], 'x');
    await t.B.Cloud.syncNow(); await wait(100);
    const before = t.be.reads;
    const A = await t.reopenA(3);
    T.eq(rec(A, 's5').note, 'edited on B');
    T.eq(rec(A, 'new1').note, 'new on B');
    T.ok(!rec(A, 's7'), 'the deletion arrived');
    T.eq(A.Store.S.shifts.length, 300, '300 - 1 + 1');
    T.ok(t.be.reads - before < 40, 'and it read only what changed: ' + (t.be.reads - before));
  });
  T.atest('a change from a phone whose clock is a day behind still arrives', async () => {
    const t = await twoPhones(SRC);
    t.be.clients.delete(t.A.__client);
    t.pb.clock.ms = -86400000; // B is a day behind (its change is stamped yesterday)
    const B = await open(SRC, t.be, t.pb); await B.Cloud.connect(user); await wait(150);
    await edit(B, 's9', 'from a slow clock');
    const A = await t.reopenA(5);
    T.eq(rec(A, 's9').note, 'from a slow clock');
  });
  T.atest('once a week an opening listens to the whole account again', async () => {
    const t = await twoPhones(SRC);
    let A = await t.reopenA(1);
    const before = t.be.reads;
    A = await t.reopenA(8 * 24);
    T.ok(t.be.reads - before > 300, 'the whole account: ' + (t.be.reads - before));
    T.ok(A.Store.S.meta.heard.full >= Date.now() - 1000 + 8 * 86400000 + 3600000 - 5000, 'and a new week starts');
    const b2 = t.be.reads;
    await t.reopenA(1);
    T.ok(t.be.reads - b2 < 40, 'then only changes again: ' + (t.be.reads - b2));
  });
  T.atest('another account on the phone, or no record of hearing: the whole account', async () => {
    const t = await twoPhones(SRC);
    t.A.Store.S.meta.heard = { uid: 'someone-else', at: Date.now(), full: Date.now() };
    await t.A.Store.setMeta({});
    const before = t.be.reads;
    await t.reopenA(1);
    T.ok(t.be.reads - before > 300, 'listened to everything: ' + (t.be.reads - before));
  });
}
module.exports = { measure };
