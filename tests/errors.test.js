/* Error reports (app/errors.js): what a report holds, consent, counting the same error, 5 a day, the offline queue,
 * the shape the rules take (firestore.rules validErr) and the admin's list of this week's errors. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./t.js');

const ROOT = path.join(__dirname, '..');
const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

/** A phone: errors.js in its own context, with the statistics answer, sign-in and Firestore as given. */
function phone(o = {}) {
  const store = new Map();
  const writes = [];
  const ctx = {
    console, Math, Date, JSON, Promise, setTimeout: (fn, ms) => (ms >= 4000 ? 0 : setTimeout(fn, ms)), clearTimeout,
    Uint8Array, Array, Object, String, Number, RegExp, Error, TypeError,
    crypto: require('crypto').webcrypto,
    navigator: { onLine: o.online !== false },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    APP_VERSION: '1.32.5',
    U: { LANG: o.lang || 'he', todayKey: () => ctx.day },
    App: { tab: 'home', legalAccepted: () => true },
    Store: { S: { settings: o.settings === undefined ? { statsAsked: true, shareStats: o.consent !== false } : o.settings } },
    Support: { device: () => 'Android 15 · Chrome 140' },
    Cloud: {
      user: o.signedIn === false ? null : { uid: 'u1' },
      sdk: async () => ({ db: {}, fs: { doc: (db, c, id) => ({ c, id }), setDoc: async (ref, data) => { if (o.fail) { const e = new Error('x'); e.code = o.fail; throw e; } writes.push({ ref, data }); } } }),
    },
  };
  ctx.day = '2026-11-06';
  ctx.Stats = { enabled: () => !!(ctx.Store.S.settings && ctx.Store.S.settings.statsAsked === true && ctx.Store.S.settings.shareStats === true) };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(rd('src/app/errors.js'), ctx, { filename: 'app/errors.js' });
  return { ctx, E: ctx.Errors, store, writes };
}
const boom = (msg, line = 10) => { const e = new TypeError(msg); e.stack = `TypeError: ${msg}\n    at render (https://leelor123.github.io/shifts/app.he.abc123.js?v=2:${line}:345)\n    at https://leelor123.github.io/shifts/app.he.abc123.js:20:7`; return e; };

// the rules' list of keys and limits, read from firestore.rules
const rules = rd('firestore.rules');
const errRule = rules.match(/function validErr\(d\) \{([\s\S]*?)\n    \}/)[1];
const ruleKeys = errRule.match(/hasOnly\(\[([^\]]+)\]\)/)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
/** The same checks as validErr, in JS (kept in step by the test below). */
function validErr(d, now) {
  const keys = Object.keys(d).sort().join();
  return keys === ruleKeys.slice().sort().join()
    && typeof d.v === 'string' && d.v.length <= 20
    && ['he', 'en', 'ru', 'ar', 'fr', 'es', 'am'].includes(d.l)
    && typeof d.os === 'string' && d.os.length >= 1 && d.os.length <= 24
    && typeof d.br === 'string' && d.br.length >= 1 && d.br.length <= 32
    && /^[a-z_]{0,24}$/.test(d.tab)
    && ['error', 'promise', 'render', 'mount'].includes(d.k)
    && typeof d.msg === 'string' && d.msg.length >= 1 && d.msg.length <= 200
    && typeof d.st === 'string' && d.st.length <= 600
    && /^[0-9a-f]{8}$/.test(d.h)
    && Number.isInteger(d.n) && d.n >= 1 && d.n <= 1000
    && Number.isInteger(d.t) && Math.abs(d.t - now) < 86400000;
}

T.section('error reports');
T.test('not app bugs are not reported: no connection, other scripts, no stack', () => {
  const { E } = phone();
  const err = (msg, stack, code) => { const e = new Error(msg); e.stack = stack == null ? `Error: ${msg}\n    at f (https://leelor123.github.io/shifts/app.he.83f64a8b.js:1:254)` : stack; if (code) e.code = code; return e; };
  const skip = (e, kind = 'error', extra) => E._noise(E._build(e, kind, extra), e);
  T.ok(!skip(err("Cannot read properties of null (reading 'x')")), 'a bug in the app is reported');
  T.ok(!skip(err('x', 'Error: x\n    at https://leelor123.github.io/shifts/:12:3')), 'code in the page itself counts as the app');
  T.ok(!skip(err('x', 'f@https://leelor123.github.io/shifts/index.en.html:12:3')), 'a language page too');
  T.ok(skip(err('Failed to get document because the client is offline.', null, 'unavailable')), 'Firebase offline');
  T.ok(skip(err('[code=unavailable]: Connection failed.')), 'Firebase unavailable');
  T.ok(skip(err('x', null, 'auth/network-request-failed')), 'sign-in with no network');
  T.ok(skip(new TypeError('Failed to fetch')) && skip(new TypeError('Load failed')) && skip(new TypeError('NetworkError when attempting to fetch resource.')), 'a failed fetch (Chrome, Safari, Firefox)');
  T.ok(skip(new TypeError('Failed to fetch dynamically imported module: https://www.gstatic.com/firebasejs/x/firebase-app.js')), 'a CDN script that did not load');
  T.ok(skip(err('x', 'Error: x\n    at chrome-extension://abcdefghijklmnop/content.js:1:2')), 'a browser extension');
  T.ok(skip(err('x', 'Error: x\n    at https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js:1:2')), 'a top frame outside the app');
  T.ok(skip('Script error.', 'error', { message: 'Script error.' }), 'a muted error with no stack');
  T.ok(skip({ reason: 'x' }, 'promise'), 'a rejection with no stack');
  T.ok(!skip('x', 'error', { message: 'x', filename: 'https://leelor123.github.io/shifts/app.he.83f64a8b.js', lineno: 1, colno: 2 }), 'no error object but an app file and line');
  const P = phone();
  P.E.capture(new TypeError('Failed to fetch'), 'promise');
  P.E.capture(err('x', 'Error: x\n    at chrome-extension://abc/x.js:1:2'), 'error');
  T.eq(P.E._state(), null, 'nothing queued');
});
T.test('a message keeps the error and loses anything that could be the user\'s', () => {
  const { E } = phone();
  T.eq(E._clean("Cannot read properties of undefined (reading 'amount')"), "Cannot read properties of undefined (reading 'amount')", 'a property name stays');
  T.eq(E._clean('Unexpected token \'ש\', "שלום 4500" is not valid JSON'), "Unexpected token '_', \"_\" is not valid JSON", 'quoted input goes');
  T.eq(E._clean('failed https://x.com/a/b/file.js?token=abc#x for dana@example.com'), 'failed file.js for [email]', 'addresses become file names, emails go');
  T.eq(E._clean('amount 4500 at row 12'), 'amount # at row 12', 'numbers of 3 digits or more go');
  T.eq(E._clean('user AbCdEfGhIjKlMnOpQrStUvWx1234 not found'), 'user _ not found', 'an id goes');
  T.eq(E._clean('לא נמצא המעסיק דנה'), '_', 'Hebrew (a name typed) goes');
  const RLO = String.fromCharCode(0x202e);
  T.ok(!E._clean('a' + RLO + 'b').includes(RLO), 'no direction overrides');
  T.eq(E._clean('ab '.repeat(200)).length, 200, 'at most 200 characters');
  T.eq(E._clean(''), 'unknown');
});
T.test('a stack keeps 5 frames as function@file:line:col, with no address', () => {
  const { E } = phone();
  const chrome = 'TypeError: x\n    at Object.render (https://h.io/shifts/app.js?v=1:12:34)\n    at async load (https://h.io/shifts/app.js:5:6)\n    at https://h.io/shifts/index.html:1:2';
  T.eq(E._frames(chrome).join('|'), 'Object.render@app.js:12:34|load@app.js:5:6|index.html:1:2');
  const firefox = 'render@https://h.io/shifts/app.js:12:34\n@https://h.io/shifts/app.js:1:1';
  T.eq(E._frames(firefox).join('|'), 'render@app.js:12:34|app.js:1:1');
  T.eq(E._frames(Array.from({ length: 9 }, (_, i) => `at f${i} (https://h/a.js:${i}:1)`).join('\n')).length, 5);
});
T.test('a report has exactly the fields the rules take, and passes them', () => {
  const { E } = phone();
  const r = E._build(boom("Cannot read properties of null (reading 'x')"), 'render');
  const doc = Object.assign({}, r, { t: Date.now() });
  T.eq(Object.keys(doc).sort().join(), ruleKeys.slice().sort().join(), 'the same keys');
  T.ok(validErr(doc, Date.now()), 'valid');
  T.eq(r.os, 'Android 15'); T.eq(r.br, 'Chrome 140'); T.eq(r.tab, 'home'); T.eq(r.l, 'he'); T.eq(r.v, '1.32.5');
  T.ok(!/https?:|leelor123|\?v=/.test(r.st), 'no address in the stack: ' + r.st);
  T.eq(r.h, E._build(boom("Cannot read properties of null (reading 'x')"), 'render').h, 'the same error, the same hash');
  T.ok(r.h !== E._build(boom("Cannot read properties of null (reading 'x')", 99), 'render').h, 'another place, another hash');
});
T.test('guards: the rules for errors/ are create-only for signed-in users and read by admins, at most 50', () => {
  const m = rules.match(/match \/errors\/\{id\} \{([\s\S]*?)\n    \}/)[1];
  T.ok(/allow create: if request\.auth != null && id\.matches\('\^\[0-9a-f\]\{16,40\}\$'\) && validErr\(request\.resource\.data\);/.test(m), 'create: signed in, random id, shape');
  T.ok(/allow update: if false;/.test(m), 'never changed');
  T.ok(/allow list: if isAdmin\(\) && request\.query\.limit <= 50;/.test(m) && /allow get: if isAdmin\(\);/.test(m), 'admins read, 50 at a time');
  T.ok(/hasAll\(\[/.test(errRule) && /d\.msg\.size\(\) <= 200/.test(errRule) && /d\.st\.size\(\) <= 600/.test(errRule), 'every key needed, sizes capped');
  T.ok(rd('tools/build.js').includes("'app/errors.js'"), 'in the build');
  const app = rd('src/app/app.js');
  T.ok(app.includes("root.Errors.capture(e, 'render')") && app.includes("root.Errors.capture(e, 'mount')"), 'a screen that fails to draw is reported');
  const view = rd('src/app/views-admin.js');
  T.ok(/fs\.limit\(50\)/.test(view) && /data-adm-errors/.test(view), 'the dashboard reads at most 50, on a press');
});

T.atest('with statistics off nothing is kept or sent', async () => {
  const P = phone({ consent: false });
  P.E.capture(boom('a'), 'error');
  T.eq(await P.E.flush(), 0);
  T.eq(P.writes.length, 0, 'no report');
  T.eq(P.store.size, 0, 'nothing in storage');
  const N = phone({ settings: { statsAsked: false } }); // never answered (the old default): nothing either
  N.E.capture(boom('a'), 'error');
  T.eq(await N.E.flush(), 0); T.eq(N.writes.length, 0); T.eq(N.store.size, 0);
});
T.atest('with statistics on, one error is one well-formed report, counted', async () => {
  const P = phone();
  for (let i = 0; i < 3; i++) P.E.capture(boom("Cannot read properties of null (reading 'x')"), 'error');
  T.eq(await P.E.flush(), 1);
  T.eq(P.writes.length, 1, 'one report');
  const { ref, data } = P.writes[0];
  T.eq(ref.c, 'errors'); T.ok(/^[0-9a-f]{24}$/.test(ref.id), 'a random id');
  T.eq(data.n, 3, 'three times');
  T.ok(validErr(data, Date.now()), 'the rules take it');
  // again the same day: counted, not sent again
  P.E.capture(boom("Cannot read properties of null (reading 'x')"), 'error');
  T.eq(await P.E.flush(), 0, 'not resent today');
  P.ctx.day = '2026-11-07';
  T.eq(await P.E.flush(), 1, 'the next day the new count goes once');
  T.eq(P.writes[1].data.n, 1);
});
T.atest('at most 5 reports a day; the rest wait for the next day', async () => {
  const P = phone();
  for (let i = 0; i < 7; i++) P.E.capture(boom('error number ' + 'abcdefg'[i], i + 1), 'error');
  T.eq(await P.E.flush(), 5);
  T.eq(await P.E.flush(), 0, 'no more today');
  P.ctx.day = '2026-11-07';
  T.eq(await P.E.flush(), 2, 'the other two tomorrow');
});
T.atest('offline or signed out the reports wait in storage, then go', async () => {
  const P = phone({ online: false });
  P.E.capture(boom('a'), 'promise');
  T.eq(await P.E.flush(), 0);
  T.ok(P.store.has('shaati-errq') && JSON.parse(P.store.get('shaati-errq')).q.length === 1, 'kept on the phone');
  T.ok(!/leelor123|https?:/.test(P.store.get('shaati-errq')), 'the kept copy has no address either');
  P.ctx.navigator.onLine = true;
  T.eq(await P.E.flush(), 1);
  T.eq(JSON.parse(P.store.get('shaati-errq')).q.length, 0, 'sent and gone from the queue');
  // turning statistics off clears what waits
  P.E.capture(boom('b'), 'error');
  P.ctx.Store.S.settings.shareStats = false;
  T.eq(await P.E.flush(), 0);
  T.ok(!P.store.has('shaati-errq'), 'nothing left on the phone');
});
T.atest('a report the rules refuse is dropped; a network failure keeps it', async () => {
  const P = phone({ fail: 'unavailable' });
  P.E.capture(boom('a'), 'error');
  T.eq(await P.E.flush(), 0);
  T.eq(P.E._state().q.length, 1, 'kept');
  const R = phone({ fail: 'permission-denied' });
  R.E.capture(boom('a'), 'error');
  await R.E.flush();
  T.eq(R.E._state().q.length, 0, 'dropped');
});
T.atest('the admin list: this week\'s errors grouped, the most frequent first', async () => {
  const P = phone();
  const UI = { icon: () => '', esc: (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'), openSheet() {}, skeleton() {} };
  const c = { U: {}, Store: {}, UI, App: { actions: {} }, Charts: {} };
  c.window = c; vm.createContext(c);
  vm.runInContext(rd('src/app/views-admin.js'), c, { filename: 'app/views-admin.js' });
  const top = c.App.topErrors([
    { h: 'aaaaaaaa', msg: 'A', n: 2, v: '1.32.4', t: 1 }, { h: 'bbbbbbbb', msg: 'B', n: 1, v: '1.32.4', t: 2 },
    { h: 'aaaaaaaa', msg: 'A', n: 3, v: '1.32.5', t: 3 }, null, { h: 1 },
  ]);
  T.eq(top.map((g) => g.h + ':' + g.n + ':' + g.v).join(), 'aaaaaaaa:5:1.32.5,bbbbbbbb:1:1.32.4');
  const html = c.App.adminErrorsView([{ h: 'cccccccc', msg: '<img onerror=x>', n: 1, v: '1', t: 1, st: '' }]);
  T.ok(!html.includes('<img') && html.includes('&#60;img'), 'the message is escaped');
  void P;
});
