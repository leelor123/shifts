/* Error, empty and edge states (audit 1.35): every failure message names the real cause and the next step, with no
 * code or browser English in it; shown numbers never read NaN, Infinity or -0; a copy or share never fails in silence.
 * The 6 Nov 2026 report: creating a workplace code said "אין הרשאה לקוד הזה" when the server's rules refused it. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./t.js');

const SRC = path.join(__dirname, '..', 'src');
const rd = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

/** cloud.js in its own context (as the sync tests load it), with the network on or off. */
function cloud(online) {
  const ctx = { console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, navigator: { onLine: online !== false }, indexedDB: require('./fakes.js').fakeIndexedDB() };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.UI = { dialog: async () => null, confirm: async () => true, timeAgo: () => '', toast() {} };
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'app/store.js', 'app/cloud.js']) vm.runInContext(rd(f), ctx, { filename: f });
  return ctx;
}
const err = (code, message, name) => Object.assign(new Error(message || 'x'), code ? { code } : {}, name ? { name } : {});
// a message for a person: Hebrew, no Latin word (Google, Claude and Firebase are names, so they may appear)
const plain = (s) => /[֐-׿]/.test(s) && !/\b(?!Google\b|Claude\b|Firebase\b|Chrome\b|Safari\b|Shaati\b)[A-Za-z]{3,}/.test(s.replace(/\(Authorized domains\)/, ''));

T.section('error messages: the real cause and what to do');
T.test('Firestore codes each get their own message, bare or prefixed, with no code in it', () => {
  const C = cloud().Cloud;
  const codes = { 'permission-denied': 'denied', 'unavailable': 'down', 'deadline-exceeded': 'down', 'resource-exhausted': 'busy', 'unauthenticated': 'auth', 'not-found': 'gone', 'cancelled': 'cut', 'aborted': 'cut' };
  const seen = new Set();
  for (const [code, kind] of Object.entries(codes)) {
    for (const c of [code, 'firestore/' + code]) {
      T.eq(C.errorKind(err(c)), kind, c);
      const t = C.errorText(err(c, 'FirebaseError: Missing or insufficient permissions.'));
      T.ok(plain(t), c + ' reads as plain Hebrew: ' + t);
      T.ok(!t.includes(code) && !/permission|insufficient/i.test(t), c + ' leaks the code: ' + t);
      seen.add(t);
    }
  }
  T.eq(seen.size, 6, 'six different causes, six different messages');
});
T.test('a refusal never blames the person ("no permission") and tells them where to turn', () => {
  const C = cloud().Cloud;
  const t = C.errorText(err('permission-denied'), 'לא הצלחנו לשמור את הקוד');
  T.ok(t.startsWith('לא הצלחנו לשמור את הקוד. '), 'what failed comes first: ' + t);
  T.ok(!/הרשאה/.test(t), 'no "permission" wording: ' + t);
  T.ok(/עזרה ותמיכה/.test(t), 'names the support screen: ' + t);
  T.ok(!/הרשאה לקוד/.test(rd('app/workplace.js')), 'the workplace code sheet lost "אין הרשאה לקוד הזה"');
});
T.test('offline is told apart from a server problem, and wins over any code', () => {
  const off = cloud(false).Cloud;
  T.eq(off.errorKind(err('permission-denied')), 'offline');
  T.ok(/אין חיבור לאינטרנט/.test(off.errorText(err('unavailable'))), 'offline text');
  const on = cloud().Cloud;
  T.ok(!/אין חיבור לאינטרנט/.test(on.errorText(err('unavailable'))), 'online: the server did not answer, the phone is connected');
  T.eq(on.errorKind(new TypeError('Failed to fetch')), 'down');
});
T.test('our own messages and the sign-in texts pass through; a browser error never shows its English', () => {
  const ctx = cloud();
  const C = ctx.Cloud;
  T.eq(C.errorText(ctx.U.oops('הקובץ פגום')), 'הקובץ פגום');
  T.eq(cloud(false).Cloud.errorText(ctx.U.oops('הקובץ פגום')), 'הקובץ פגום', 'ours stays ours when offline');
  T.ok(/סגרו את שעתי/.test(C.errorText(err('shaati/sdk-stuck'))), 'the stuck sign-in keeps its own advice');
  T.ok(/האימייל או הסיסמה/.test(C.errorText(err('auth/wrong-password'))), 'sign-in codes keep their texts');
  for (const e of [new TypeError("Cannot read properties of undefined (reading 'x')"), err('internal'), err(null, 'UnknownError: Internal error opening backing store', 'UnknownError'), 'boom', null]) {
    const t = C.errorText(e);
    T.ok(plain(t), 'plain Hebrew for ' + String(e && e.message || e) + ': ' + t);
    T.ok(!/\(|\)/.test(t), 'no code in brackets: ' + t);
  }
});

T.section('error messages: no screen builds its own');
const APP = fs.readdirSync(path.join(SRC, 'app')).filter((f) => f.endsWith('.js'));
// the admin dashboard shows codes on purpose (the developer reads them); error reports are not shown to anyone
const ADMIN = new Set(['views-admin.js', 'errors.js']);
T.test('no message is built from navigator.onLine alone (it hides a refusal or a full quota behind "try again")', () => {
  const bad = [];
  for (const f of APP) {
    rd('app/' + f).split('\n').forEach((l, i) => { if (/navigator\.onLine \?[^:]*'[^']*[֐-׿]/.test(l) && !/showLogin|setStatus|loadFailed/.test(l)) bad.push(f + ':' + (i + 1)); });
  }
  T.eq(bad.join(', '), '', 'use Cloud.errorText(e, what) instead');
});
T.test('no code or raw error message is put on screen outside the admin dashboard', () => {
  const bad = [];
  for (const f of APP) {
    if (ADMIN.has(f)) continue;
    rd('app/' + f).split('\n').forEach((l, i) => {
      // a code put into the text: ${esc(e.code ...)}, ${e.code ...}, + (e.code || ...); a browser message as the text
      if (/\$\{(esc\()?(e|err|x)\.(code|message)|\+ \((e|err|x)\.code \|\||text: (String\()?\(?(\(?e && )?(e|err)\.message\)? \|\||'שגיאה: ' \+ \(e\.message|esc\((e|err)\.message \|\|/.test(l)) bad.push(f + ':' + (i + 1));
    });
  }
  T.eq(bad.join(', '), '', 'show Cloud.errorText(e) or U.ours(e) ? e.message : a written message');
});
T.test('a share that fails, or a copy the phone refuses, is never silent', () => {
  const bad = [];
  for (const f of APP) {
    rd('app/' + f).split('\n').forEach((l, i) => {
      if (/navigator\.share\([^)]*\)\.catch\(\(\) => \{\}\)/.test(l)) bad.push(f + ':' + (i + 1) + ' share');
      if (/await UI\.copyText\([^;]*\);\s*UI\.toast\(/.test(l)) bad.push(f + ':' + (i + 1) + ' copy');
    });
    const lines = rd('app/' + f).split('\n');
    lines.forEach((l, i) => { if (/^\s*await UI\.copyText\(/.test(l) && /UI\.toast\(/.test(lines[i + 1] || '')) bad.push(f + ':' + (i + 1) + ' copy'); });
  }
  T.eq(bad.join(', '), '', 'use UI.shareText(text, { okText }) or UI.copied(text, okText)');
});
T.test('a note stays long enough to read', () => {
  const src = rd('app/ui.js');
  const body = src.match(/function toastMs\(text, action\) \{[\s\S]*?\n {2}\}/)[0];
  const toastMs = vm.runInNewContext('(' + body + ')');
  T.eq(toastMs('נשמר'), 3200, 'a short note keeps its 3.2 s');
  T.eq(toastMs('נשמר', true), 6000, 'with a button, 6 s');
  const long = cloud().Cloud.errorText(err('permission-denied'), 'לא הצלחנו לשמור את הקוד');
  T.ok(toastMs(long) >= 7000, 'a two-sentence error gets 7 s or more: ' + toastMs(long));
  T.ok(toastMs('x'.repeat(5000)) <= 10000, 'never more than 10 s');
});

T.section('numbers on screen');
T.test('money and num never show -0, NaN or Infinity', () => {
  const { U } = cloud();
  for (const v of [-0, -0.2, -0.004, NaN, Infinity, -Infinity, undefined, null, 'abc']) {
    T.ok(!/-|NaN|∞|Infinity|undefined|null/.test(U.money(v, 0)), 'money(' + String(v) + ', 0) = ' + U.money(v, 0));
    T.ok(!/-|NaN|∞|Infinity/.test(U.num(v, 0)), 'num(' + String(v) + ', 0) = ' + U.num(v, 0));
  }
  T.ok(/-/.test(U.money(-0.6, 0)) && /-/.test(U.money(-12.5)), 'a real minus stays');
  T.ok(/0\.01/.test(U.money(0.006)), 'a cent stays');
  T.ok(/1,234,567/.test(U.money(1234567, 0)), 'a big amount keeps its separators: ' + U.money(1234567, 0));
});

/* iPhone (wk-retry, 16 Nov): one cut-off download of the sign-in code used to lock sign-in until the app restarted, and
 * right after a restart WebKit sometimes refused the file once more for a moment, so the restarted page locked itself
 * again although the next try would have worked. Every call must try again, and a try that works ends the restart. */
T.atest('iPhone: a cut-off sign-in download is tried again; once it works there is no restart', async () => {
  const ctx = cloud();
  const listeners = [];
  let reloads = 0;
  ctx.navigator.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  ctx.document = { visibilityState: 'visible', addEventListener: (t, f) => listeners.push(f), querySelector: () => null, getElementById: () => null };
  ctx.location = { reload: () => { reloads++; } };
  vm.runInContext(rd('app/cloud.js'), ctx, { filename: 'app/cloud.js' }); // again, now that the page looks like Safari
  ctx.FIREBASE_CONFIG = { apiKey: 'x' };
  const C = ctx.Cloud;
  let cut = 1;
  const mod = { getApps: () => [], initializeApp: () => ({}), initializeAuth: () => ({}), browserLocalPersistence: 1, indexedDBLocalPersistence: 2, browserPopupRedirectResolver: 3, initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}), memoryLocalCache: () => ({}) };
  // WebKit keeps a failed module under its address: the same address fails again, as the real browser does
  const bad = new Set();
  const urls = [];
  C.importer = async (u) => { urls.push(u); if (bad.has(u) || (/auth/.test(u) && cut > 0)) { cut--; bad.add(u); throw new TypeError('Importing a module script failed.'); } return mod; };
  const first = await C.sdk().then(() => 'ok', (e) => e.code);
  T.eq(first, 'shaati/sdk-stuck', 'the cut-off download says to close and reopen');
  urls.length = 0;
  const second = await C.sdk().then(() => 'ok', (e) => e.code || String(e));
  T.eq(second, 'ok', 'the next call downloads again, under a new address, instead of failing at once');
  T.eq(urls.map((u) => u.replace(/^.*\//, '')).join(','), 'firebase-app.js,firebase-auth.js?r=1,firebase-firestore.js', 'only the file that failed gets a new address');
  ctx.document.visibilityState = 'hidden';
  listeners.forEach((f) => f());
  T.eq(reloads, 0, 'the sign-in code loaded: hiding the app does not start it over');
});
