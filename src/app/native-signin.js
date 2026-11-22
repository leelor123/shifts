/* ============================================================
 * native-signin.js — Google sign-in in the Android app through Android's own account picker.
 *
 * The web way (Google's window, or the full page) leaves the app's address for firebaseapp.com and
 * accounts.google.com. The Android app is a Trusted Web Activity: once the page leaves its own site, Chrome shows its
 * address bar, and the app looked like it ran inside Google. An Android app from 1.44 (android/widgets/java/
 * SignInActivity.java) says "shaati:signin" on the widgets' channel, right after the widgets' own hello. Then the
 * Google button asks Android's own account picker (Credential Manager, "Sign in with Google") for an ID token, and
 * cloud.js signs in to Firebase with it (signInWithCredential). The address never changes. Browsers, iPhones and
 * Android apps before 1.44 keep the web way.
 *
 * One ask, straight from the tap (Chrome opens an app's screen only from a tap, so nothing is awaited before it):
 *   1. {"signin":1,"ask":1,"n":<nonce>} over the channel: the app's screen goes on only for this nonce, so no other
 *      site or app can bring the picker up;
 *   2. shaati-signin://google?n=<nonce> opens the app's screen (as the suggestion at work opens its own);
 *   3. the screen says it is open ({"signin":1,"open":1,"n":…}), then answers once: the token ("t"), "cancel" (the
 *      picker was closed) or "fail" (no Google Play services, the app's key unknown to Google, no network, …).
 * Only an answer with this nonce counts, and a token only when Google signed the same nonce into it.
 * "fail", or no word from the screen within 4 s of the page running (the channel is gone): the web way, now and for
 * the rest of this page's life. The token is never kept: it goes straight to Firebase.
 * ============================================================ */
(function (root) {
  'use strict';
  const SCHEME = 'shaati-signin://google';
  const OPEN_MS = 4000; // the app's screen says it is open within this much of the page's running time
  const CAP_MS = 10 * 60000; // nobody spends this long in the picker: the ask ends
  const HELLO_MS = 2500; // inside the app before its channel is up: the hello is waited for this long (the tap still counts)
  const TICK = 500;
  const st = { hello: false, old: false, off: false, wait: null, helloWait: [] };
  const App = () => root.App || {};
  const connected = () => !!(App().widgets && App().widgets.connected);

  /** A nonce of 22 url-safe characters (128 random bits). */
  function nonce() {
    const b = new Uint8Array(16);
    root.crypto.getRandomValues(b);
    return root.btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  /** The nonce Google signed into an ID token, or '' (not a token). */
  function tokenNonce(jwt) {
    try {
      const p = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return String(JSON.parse(root.atob(p)).nonce || '');
    } catch (e) { return ''; }
  }
  const failure = (code) => Object.assign(new Error(code), { code });
  const helloNow = () => { const w = st.helloWait; st.helloWait = []; w.forEach((fn) => fn()); };

  /** Asks the app's screen for a token; resolves with it, or rejects (cancel, the web way, timeout). */
  function ask() {
    const n = nonce();
    if (!App().widgets || !App().widgets.post(JSON.stringify({ signin: 1, ask: 1, n }))) { st.off = true; return Promise.reject(failure('shaati/native-web')); }
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const w = { n, open: false, ran: 0, last: t0 };
      const done = (fn, v) => { if (st.wait !== w) return; st.wait = null; root.clearInterval(w.tick); fn(v); };
      w.answer = (m) => {
        if (m.open === 1) { w.open = true; return; }
        if (typeof m.t === 'string') {
          if (tokenNonce(m.t) === n) done(resolve, m.t);
          else { st.off = true; done(reject, failure('shaati/native-web')); }
        } else if (m.err === 'cancel') done(reject, failure('auth/popup-closed-by-user'));
        else {
          // the app could not (a "why" for the error report: never the token, it has none)
          if (m.why) console.warn('native sign-in:', String(m.why).slice(0, 160));
          st.off = true;
          done(reject, failure('shaati/native-web'));
        }
      };
      // only the time the page really ran counts: a page Chrome froze under the picker gets its messages first
      w.tick = root.setInterval(() => {
        const now = Date.now();
        const gap = now - w.last;
        w.last = now;
        if (gap < 3 * TICK) w.ran += gap;
        if (!w.open && w.ran >= OPEN_MS) { st.off = true; done(reject, failure('shaati/native-web')); } else if (now - t0 > CAP_MS) done(reject, failure('auth/timeout'));
      }, TICK);
      if (st.wait) st.wait.answer({ err: 'cancel' }); // an older ask that never answered ends here
      st.wait = w;
      root.location.href = SCHEME + '?n=' + n;
    });
  }

  const NativeSignIn = {
    SCHEME,
    /** The Android app can (its hello on the channel, app/widgets.js). */
    hello() { st.hello = true; helloNow(); },
    /** Another hello came first: an Android app before 1.44, which never says it can. */
    other() { if (!st.hello && !st.old) { st.old = true; helloNow(); } },
    /** An answer from the app's screen ({"signin":1,…}); one for another ask is dropped. */
    answer(m) { if (m && st.wait && m.n === st.wait.n) st.wait.answer(m); },
    /** 'native' (ask the Android app), 'wait' (in the Android app, its channel not up yet) or 'web'. */
    way() {
      if (st.off || !App().androidApp) return 'web';
      if (st.hello) return connected() ? 'native' : 'web';
      return st.old ? 'web' : 'wait';
    },
    /** A Google ID token from Android's own picker. Call it straight from the tap. Rejects with 'shaati/native-web'
     *  when the web way should sign in instead (that call is still inside the tap's time), with
     *  'auth/popup-closed-by-user' when the picker was closed, or with 'auth/timeout'. */
    token() {
      const way = NativeSignIn.way();
      if (way === 'native') return ask();
      if (way === 'web') return Promise.reject(failure('shaati/native-web'));
      return new Promise((resolve) => {
        const t = root.setTimeout(() => { st.helloWait = st.helloWait.filter((f) => f !== go); resolve(); }, HELLO_MS);
        const go = () => { root.clearTimeout(t); resolve(); };
        st.helloWait.push(go);
      }).then(() => (NativeSignIn.way() === 'native' ? ask() : Promise.reject(failure('shaati/native-web'))));
    },
    tokenNonce,
    get pending() { return !!st.wait; },
  };
  root.NativeSignIn = NativeSignIn;
})(typeof window !== 'undefined' ? window : globalThis);
