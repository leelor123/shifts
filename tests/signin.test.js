/* Google sign-in in the Android app (22 Nov 2026): people said the app sometimes looks like it runs "inside Google".
 * Google's window (signInWithPopup / signInWithRedirect) leaves the app's address for firebaseapp.com and
 * accounts.google.com, and the Trusted Web Activity then shows Chrome's address bar. In the Android app from 1.44 the
 * Google button asks Android's own account picker for an ID token (android/widgets/java/SignInActivity.java,
 * src/app/native-signin.js) and Firebase signs in with it: no address bar. Browsers, iPhones and older Android apps
 * keep the web way, and so does an Android app whose picker fails, so nobody is ever left without a way in. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./t.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*/gm, '');
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (payload) => b64u({ alg: 'RS256' }) + '.' + b64u(payload) + '.sig';

/** native-signin.js alone, with the clock and the timers in the test's hands. */
function nativeOnly(opts) {
  const o = Object.assign({ android: true, connected: true, post: true }, opts);
  let now = 1000;
  const timers = []; // { at, fn, every }
  const posted = [];
  const ctx = {
    App: { androidApp: o.android, widgets: o.connected === null ? undefined : { get connected() { return o.connected; }, post: (m) => { if (!o.post) return false; posted.push(m); return true; } } },
    location: { href: 'https://leelor123.github.io/shifts/' },
    crypto: require('crypto').webcrypto, btoa, atob, console: { warn() {}, log() {} },
    setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    setInterval: (fn, ms) => { timers.push({ at: now + ms, fn, every: ms }); return timers.length; },
    clearInterval: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ctx.__now = () => now;
  vm.runInContext('Date.now = () => __now();', ctx);
  vm.runInContext(read('src/app/native-signin.js'), ctx, { filename: 'native-signin.js' });
  /** ms of running page; jump: the page was frozen that long first (Chrome under the picker). */
  const run = (ms, jump) => {
    if (jump) now += jump;
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.fn && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = Math.max(now, due.at);
      const fn = due.fn;
      if (due.every) due.at += due.every; else due.fn = null;
      fn();
    }
    now = end;
  };
  return { N: ctx.NativeSignIn, ctx, posted, run, set: (k, v) => { o[k] = v; } };
}
const settle = () => new Promise((r) => setImmediate(r));
async function outcome(p) {
  let res = { state: 'pending' };
  p.then((v) => { res = { state: 'ok', v }; }, (e) => { res = { state: 'err', code: e && e.code }; });
  await settle(); await settle();
  return res;
}
const lastAsk = (r) => JSON.parse(r.posted[r.posted.length - 1]);

T.section('Google sign-in in the Android app: Android\'s own account picker');

T.atest('the tap asks the app and opens its screen at once, with one nonce; the token with that nonce signs in', async () => {
  const r = nativeOnly();
  r.N.hello();
  T.eq(r.N.way(), 'native');
  const p = r.N.token();
  // both in the same tap: nothing awaited before (Chrome opens an app's screen only from a tap)
  const ask = lastAsk(r);
  T.eq(ask.signin, 1); T.eq(ask.ask, 1);
  T.ok(/^[A-Za-z0-9_-]{22}$/.test(ask.n), 'a 128-bit url-safe nonce: ' + ask.n);
  T.eq(r.ctx.location.href, 'shaati-signin://google?n=' + ask.n, 'the app\'s screen, with the same nonce');
  r.N.answer({ signin: 1, open: 1, n: ask.n });
  r.run(60000); // a minute in the picker is fine once the screen said it is open
  T.eq((await outcome(p)).state, 'pending');
  r.N.answer({ signin: 1, n: 'someone-elses-nonce-0000', t: jwt({ nonce: 'someone-elses-nonce-0000' }) });
  T.eq((await outcome(p)).state, 'pending', 'an answer for another ask is dropped');
  const t = jwt({ nonce: ask.n, aud: 'x' });
  r.N.answer({ signin: 1, n: ask.n, t });
  const res = await outcome(p);
  T.eq(res.state, 'ok'); T.eq(res.v, t);
  T.eq(r.N.pending, false);
  // a second sign-in gets a new nonce
  r.N.token();
  T.ok(lastAsk(r).n !== ask.n, 'a new nonce each time');
});

T.atest('a token without the nonce, a failed picker or a silent screen: the web way, for the rest of the page', async () => {
  let r = nativeOnly(); r.N.hello();
  let p = r.N.token(); let n = lastAsk(r).n;
  r.N.answer({ signin: 1, n, t: jwt({ nonce: 'other' }) });
  T.eq((await outcome(p)).code, 'shaati/native-web', 'the token must carry the nonce');
  T.eq(r.N.way(), 'web');

  r = nativeOnly(); r.N.hello();
  p = r.N.token(); n = lastAsk(r).n;
  r.N.answer({ signin: 1, n, open: 1 });
  r.N.answer({ signin: 1, n, err: 'fail', why: 'TYPE_UNKNOWN [28444] Developer console is not set up correctly.' });
  T.eq((await outcome(p)).code, 'shaati/native-web', 'a failed picker');
  T.eq(r.N.way(), 'web');

  r = nativeOnly(); r.N.hello();
  p = r.N.token();
  r.run(3500);
  T.eq((await outcome(p)).state, 'pending', 'the screen has 4 s to say it is open');
  r.run(600);
  T.eq((await outcome(p)).code, 'shaati/native-web', 'no word in 4 s: the channel is gone');
  T.eq(r.N.way(), 'web');

  r = nativeOnly({ post: false }); r.N.hello();
  T.eq((await outcome(r.N.token())).code, 'shaati/native-web', 'the ask could not be sent');
  T.eq(r.ctx.location.href.startsWith('shaati-signin:'), false, 'and the screen is not opened');
});

T.atest('a page frozen under the picker does not count against the screen, and a closed picker is not a failure', async () => {
  let r = nativeOnly(); r.N.hello();
  let p = r.N.token(); let n = lastAsk(r).n;
  r.run(1000);
  r.run(500, 30000); // Chrome froze the page for 30 s, then it runs again
  r.run(1500);
  T.eq((await outcome(p)).state, 'pending', 'only 3 s of running counted');
  r.N.answer({ signin: 1, n, open: 1 });
  r.N.answer({ signin: 1, n, err: 'cancel' });
  T.eq((await outcome(p)).code, 'auth/popup-closed-by-user', 'closed: said as the window closing');
  T.eq(r.N.way(), 'native', 'the next tap asks Android again');

  r = nativeOnly(); r.N.hello();
  p = r.N.token(); n = lastAsk(r).n;
  r.N.answer({ signin: 1, n, open: 1 });
  r.run(11 * 60000);
  T.eq((await outcome(p)).code, 'auth/timeout', 'an ask ends after ten minutes');
});

T.atest('browsers, iPhones and Android apps before 1.44 keep the web way; the hello is waited for only inside the app', async () => {
  let r = nativeOnly({ android: false }); r.N.hello();
  T.eq(r.N.way(), 'web', 'not the Android app (a browser, an iPhone)');
  T.eq((await outcome(r.N.token())).code, 'shaati/native-web');
  T.eq(r.ctx.location.href.startsWith('shaati-signin:'), false);

  r = nativeOnly(); r.N.other();
  T.eq(r.N.way(), 'web', 'another hello came first: an app before 1.44');
  r.N.hello(); T.eq(r.N.way(), 'native', 'its hello still counts if it comes');

  r = nativeOnly({ connected: false });
  T.eq(r.N.way(), 'wait', 'in the app, the channel not up yet');
  let p = r.N.token();
  r.run(1200);
  T.eq(r.posted.length, 0, 'nothing asked yet');
  r.set('connected', true); r.N.hello();
  await settle();
  T.eq(r.posted.length, 1, 'the hello came within the wait: asked at once');
  T.ok(r.ctx.location.href.startsWith('shaati-signin://google?n='));

  r = nativeOnly({ connected: false });
  p = r.N.token();
  r.run(2600);
  T.eq((await outcome(p)).code, 'shaati/native-web', 'no hello in 2.5 s: the web way, still inside the tap\'s time');

  r = nativeOnly({ connected: false });
  p = r.N.token();
  r.set('connected', true); r.N.other();
  T.eq((await outcome(p)).code, 'shaati/native-web', 'an old app\'s hello ends the wait at once');
});

T.test('the nonce check reads the token as Google signs it', () => {
  const r = nativeOnly();
  T.eq(r.N.tokenNonce(jwt({ nonce: 'abc_DEF-123', name: 'נדב' })), 'abc_DEF-123');
  T.eq(r.N.tokenNonce('not a token'), '');
  T.eq(r.N.tokenNonce(jwt({ sub: '1' })), '');
});

/** cloud.js with native-signin.js and a fake Firebase that lists what it was asked. */
function cloudWith(opts) {
  const o = Object.assign({ android: true, hello: true }, opts);
  const calls = [];
  const posted = [];
  const ctx = {
    console: { warn() {}, log() {}, error() {} }, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    navigator: { onLine: true }, indexedDB: require('./fakes.js').fakeIndexedDB(), crypto: require('crypto').webcrypto, btoa, atob,
    location: { href: 'https://leelor123.github.io/shifts/', origin: 'https://leelor123.github.io', pathname: '/shifts/', search: '' },
  };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.UI = { dialog: async () => null, confirm: async () => true, timeAgo: () => '', toast() {} };
  vm.createContext(ctx);
  for (const f of ['core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'app/store.js', 'app/native-signin.js', 'app/cloud.js']) vm.runInContext(read('src/' + f), ctx, { filename: f });
  ctx.App = { androidApp: o.android, widgets: { connected: true, post: (m) => { posted.push(m); return true; } } };
  const user = { uid: 'u1', email: 'a@b.c', providerData: [{ providerId: 'google.com' }], metadata: { lastSignInTime: 'Thu, 01 Jan 2026 00:00:00 GMT' }, delete: true };
  function GoogleAuthProvider() { this.google = true; this.setCustomParameters = () => {}; }
  GoogleAuthProvider.credential = (t) => ({ idToken: t });
  const au = {
    GoogleAuthProvider, GithubAuthProvider: function () { this.setCustomParameters = () => {}; },
    signInWithCredential: async (auth, cred) => { calls.push(['credential', cred.idToken]); return { user }; },
    signInWithPopup: async () => { calls.push(['popup']); return { user }; },
    signInWithRedirect: async () => { calls.push(['redirect']); },
    reauthenticateWithCredential: async (u, cred) => { calls.push(['reauth-credential', cred.idToken]); },
    reauthenticateWithPopup: async () => { calls.push(['reauth-popup']); throw Object.assign(new Error('stop'), { code: 'test/stop' }); },
  };
  ctx.Cloud._useSdk({ app: {}, auth: { currentUser: o.reauthUser ? user : null }, db: {}, au, fs: {} });
  if (o.hello) ctx.NativeSignIn.hello();
  return { ctx, calls, posted, Cloud: ctx.Cloud, N: ctx.NativeSignIn, answer: (m) => ctx.NativeSignIn.answer(m) };
}

T.atest('Cloud.signIn in the Android app: the picker\'s token goes to Firebase, never Google\'s window', async () => {
  const c = cloudWith();
  const p = c.Cloud.signIn(null);
  const n = JSON.parse(c.posted[0]).n;
  T.eq(c.ctx.location.href, 'shaati-signin://google?n=' + n);
  c.answer({ signin: 1, n, open: 1 });
  c.answer({ signin: 1, n, t: jwt({ nonce: n }) });
  const user = await p;
  T.eq(user.uid, 'u1'); T.eq(c.Cloud.user.uid, 'u1');
  T.eq(JSON.stringify(c.calls), JSON.stringify([['credential', jwt({ nonce: n })]]), 'signInWithCredential only');
});

T.atest('Cloud.signIn: a failed picker falls back to Google\'s window, a closed one does not; browsers are unchanged', async () => {
  let c = cloudWith();
  let p = c.Cloud.signIn(null);
  let n = JSON.parse(c.posted[0]).n;
  c.answer({ signin: 1, n, err: 'fail', why: 'no Google Play services' });
  await p;
  T.eq(JSON.stringify(c.calls), '[["popup"]]', 'the web way, so nobody is left without a way in');
  c.calls.length = 0;
  await c.Cloud.signIn(null);
  T.eq(JSON.stringify(c.calls), '[["popup"]]', 'and for the rest of the page');

  c = cloudWith();
  p = c.Cloud.signIn(null);
  n = JSON.parse(c.posted[0]).n;
  c.answer({ signin: 1, n, err: 'cancel' });
  let code = null;
  await p.catch((e) => { code = e.code; });
  T.eq(code, 'auth/popup-closed-by-user'); T.eq(c.calls.length, 0, 'closed: nothing else opens');

  c = cloudWith({ android: false });
  await c.Cloud.signIn(null);
  T.eq(JSON.stringify(c.calls), '[["popup"]]', 'a browser: Google\'s window, as before');
  T.eq(c.posted.length, 0);

  c = cloudWith({ hello: false });
  c.N.other();
  await c.Cloud.signIn(null);
  T.eq(JSON.stringify(c.calls), '[["popup"]]', 'an Android app before 1.44: as before');

  c = cloudWith();
  await c.Cloud.signIn({ redirect: true });
  T.eq(JSON.stringify(c.calls), '[["redirect"]]', '"another way" stays the full page');
  c = cloudWith();
  await c.Cloud.signIn({ provider: 'github.com' });
  T.eq(JSON.stringify(c.calls), '[["popup"]]', 'other services keep their own window');
});

T.atest('deleting the account confirms the Google account in Android\'s picker too', async () => {
  const c = cloudWith({ reauthUser: true });
  const p = c.Cloud.deleteAccountData({}).catch((e) => e);
  await settle(); await settle();
  const n = JSON.parse(c.posted[0]).n;
  T.eq(c.ctx.location.href, 'shaati-signin://google?n=' + n);
  c.answer({ signin: 1, n, t: jwt({ nonce: n }) });
  await p;
  T.eq(c.calls[0] && c.calls[0][0], 'reauth-credential', 'reauthenticateWithCredential with the picker\'s token');
  T.ok(!c.calls.some((x) => x[0] === 'reauth-popup'), 'never Google\'s window');
  const src = code(read('src/app/cloud.js'));
  T.eq((src.match(/reauthenticateWithPopup\(user, new au\.GoogleAuthProvider\(\)\)/g) || []).length, 1, 'Google\'s window only as viaAndroid\'s web way');
  T.ok(/viaAndroid\(\(sdk, cred\) => au\.reauthenticateWithCredential\(user, cred\)/.test(src));
});

T.test('the widgets\' channel hands the hello, the other hellos and the answers over', () => {
  const sent = [];
  const got = [];
  const S = { settings: { onboarded: false }, meta: { widgetsTip: 1 }, employers: [] };
  const noop = () => {};
  const port = { postMessage: (t) => sent.push(t) };
  const ctx = {
    App: { roles: () => [] }, U: { LANG: 'he', money: () => '' }, Engine: {},
    Store: { S, on: noop, setMeta: () => Promise.resolve() },
    document: { addEventListener: noop, visibilityState: 'hidden' }, addEventListener: noop,
    setInterval: noop, setTimeout: noop, clearTimeout: noop, console, location: { host: 'site', origin: 'https://site' },
    __appPort: port,
    NativeSignIn: { hello: () => got.push('hello'), other: () => got.push('other'), answer: (m) => got.push('answer ' + m.n) },
  };
  vm.runInNewContext(read('src/app/widgets.js'), ctx);
  for (const m of ['shaati:widgets', 'shaati:signin', 'shaati:notes', '{"signin":1,"n":"abc","open":1}']) port.onmessage({ data: m });
  T.eq(got.join(), 'hello,other,answer abc');
});

T.section('the Android app\'s side');
T.test('LauncherActivity: the hello right after the widgets\' one, the ask taken before anything else reads it, the answers to the page', () => {
  const a = read('tools/android.js');
  const ready = a.slice(a.indexOf('public void onMessageChannelReady'), a.indexOf('public void onPostMessage'));
  const hw = ready.indexOf('postMessage("shaati:widgets"'), hs = ready.indexOf('postMessage("shaati:signin"');
  T.ok(hw > 0 && hs > hw, 'the sign-in hello after the widgets\' hello');
  for (const other of ['shaati:notes', 'shaati:review', 'shaati:geo']) T.ok(ready.indexOf('"' + other + '"') > hs, 'before ' + other);
  T.ok(/SignInActivity\.sink = \(m\) -> runOnUiThread\(\(\) -> \{\s*if \(isFinishing\(\)\) return;[\s\S]{0,160}ss\.postMessage\(m, null\)/.test(ready), 'answers go to the page');
  const post = a.slice(a.indexOf('public void onPostMessage'), a.indexOf('// the starts and ends tapped on a widget'));
  const take = post.indexOf('if (SignInActivity.isSignIn(message)) { SignInActivity.expect(message); return; }');
  T.ok(take > 0 && take < post.indexOf('WidgetData.save'), 'the ask never reaches the widgets\' numbers');
});

T.test('the screen: in the manifest, its own scheme, see-through, never made again; the libraries and code shrinking', () => {
  const a = read('tools/android.js');
  const act = (a.match(/<activity android:name="\.SignInActivity"[\s\S]*?<\/activity>/) || [''])[0];
  T.ok(act, 'SignInActivity in the manifest');
  T.ok(/android:exported="true"/.test(act) && /android:theme="@style\/SignInTheme"/.test(act), 'opened from Chrome, see-through');
  T.ok(/<data android:scheme="shaati-signin" android:host="google" \/>/.test(act) && /category\.BROWSABLE/.test(act), 'shaati-signin://google');
  T.ok(!/taskAffinity/.test(act), 'in the app\'s own task: no task switch over the app');
  T.ok(/configChanges="[^"]*orientation[^"]*uiMode[^"]*"/.test(act), 'not made again for a turned phone or a new theme');
  T.ok(read('src/app/native-signin.js').includes("const SCHEME = 'shaati-signin://google';"), 'the page opens the same address');
  for (const d of ['androidx.credentials:credentials:', 'androidx.credentials:credentials-play-services-auth:', 'com.google.android.libraries.identity.googleid:googleid:']) T.ok(a.includes(d), d);
  T.ok(a.includes('-keep class androidx.credentials.playservices.** { *; }'), 'R8 keeps the Play services part');
  const st = read('android/widgets/res/values/w_styles.xml');
  const theme = (st.match(/<style name="SignInTheme"[\s\S]*?<\/style>/) || [''])[0];
  T.ok(/windowIsTranslucent">true/.test(theme) && /windowAnimationStyle">@null/.test(theme) && /backgroundDimEnabled">false/.test(theme), 'nothing of its own, nothing moves');
});

T.test('SignInActivity asks Sign in with Google for Shaati\'s client with the nonce, only after the page\'s own ask, and never logs the token', () => {
  const j = code(read('android/widgets/java/SignInActivity.java'));
  const client = (j.match(/static final String WEB_CLIENT = "([^"]+)";/) || [])[1];
  const sender = (read('src/app/firebase-config.js').match(/messagingSenderId: '(\d+)'/) || [])[1];
  T.ok(client && sender && client.startsWith(sender + '-') && client.endsWith('.apps.googleusercontent.com'), 'the Firebase project\'s web client: ' + client);
  T.ok(/new GetSignInWithGoogleOption\.Builder\(WEB_CLIENT\)\.setNonce\(mNonce\)\.build\(\)/.test(j), 'Sign in with Google, with the nonce');
  T.ok(/if \(take\(mNonce\)\) \{ pick\(\); return; \}/.test(j), 'the picker only for the nonce the page sent over the channel');
  T.ok(/if \(ok\) sExpected = null;/.test(j), 'each nonce once');
  T.ok(/n\.matches\("\[A-Za-z0-9_-\]\{16,64\}"\)/.test(j), 'a nonce of url-safe characters only');
  T.ok(/if \(mAnswered\) return;\s*mAnswered = true;/.test(j), 'one answer');
  T.ok(/e instanceof GetCredentialCancellationException/.test(j) && /error\("cancel", null\)/.test(j) && /error\("fail"/.test(j), 'closed and failed told apart');
  const logs = j.match(/Log\.\w\([^;]*\);/g) || [];
  T.ok(logs.length >= 3 && logs.every((l) => !/\+ t\b|\+ t \+|getIdToken|message\(|\.toString\(\)/.test(l.replace('t.length()', ''))), 'no token in the log: ' + logs.join(' | '));
  T.ok(/static volatile Sink sink;/.test(j) && !/SharedPreferences|openFileOutput|putExtra/.test(j), 'the token is only sent to the page, never kept');
});

T.test('fallbackType stays customtabs: a WebView would lose Google sign-in, the channel, billing and notifications', () => {
  const a = read('tools/android.js');
  T.ok(/fallbackType: 'customtabs',/.test(a), 'generate()');
  const why = a.slice(a.indexOf('fallbackType: \'customtabs\'') - 900, a.indexOf('fallbackType: \'customtabs\''));
  T.ok(/disallowed_useragent/.test(why) && /message channel/.test(why) && /Play Billing/.test(why), 'the reason is written next to it');
  T.eq(JSON.parse(read('android/twa-manifest.json')).fallbackType, 'customtabs', 'the generated project');
});
