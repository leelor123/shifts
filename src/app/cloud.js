/* ============================================================
 * cloud.js — Google sign-in (Firebase Auth) and per-user cloud
 * sync (Cloud Firestore).
 *
 * The phone's IndexedDB stays the working copy, so the app keeps
 * working offline. Every record carries updatedAt; changes are pushed
 * to users/{uid}/{store}/{id} and pulled with live listeners, newest
 * version wins. Deletions travel as tombstones so every device learns
 * about them. Documents hold the record as JSON ({u, d, j}) to avoid
 * Firestore type limits (nested arrays, undefined, Infinity).
 *
 * Never leaves the phone: the Claude API key, the PIN lock, backup
 * timestamps, the workplace spot and radius of the suggestion at work
 * (workGeo), raw payslip text and payslip image/PDF files. A payslip's
 * recognised lines go up redacted (no ID, bank account, address, phone).
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, UI } = root;
  const S = Store.S;

  const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
  const LOCAL_ONLY_SETTINGS = Store.LOCAL_SETTINGS; // (one list: Store.setSettings sends nothing when only these change)
  const LOCAL_ONLY_FIELDS = { payslips: ['text', 'fileId', 'fileName'] };
  const SYNC = Store.SYNC_STORES;

  const Cloud = { status: 'idle', user: null, error: null, ready: null, connected: false };
  root.Cloud = Cloud;
  let fb = null;
  let unsubs = [];
  let pushTimer = null, pushing = false, pushAgain = false;
  const listeners = new Set();
  Cloud.on = (fn) => listeners.add(fn);
  function setStatus(st, err) {
    Cloud.status = st;
    Cloud.error = err || null;
    if (err) console.warn('cloud:', err);
    for (const fn of listeners) { try { fn(st); } catch (e) { console.error(e); } }
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- SDK ---------------- */
  let loading = null;
  /** The opening show has left (at once when there is none): the sign-in's three large files download only then, so the
   *  first screen's paint never waits on them (Lighthouse counted them: the largest paint at 5 s on a phone). Nothing
   *  can be tapped under the show, so nothing that needs Google is waiting. */
  const showGone = () => new Promise((r) => (root.Intro && root.Intro.after && document.getElementById('intro') ? root.Intro.after(r, 0) : r()));
  /* Safari (every iPhone browser) remembers a module that failed to download for the rest of the page's life: a second
   * import() of it fails at once, so after one cut-off download (the app opened offline, a weak signal) Google sign-in
   * and sync never worked until the app was closed. So nothing is downloaded while offline, and if a download does
   * fail there, the page starts over the next time it is hidden with nothing open (as the version updater does).
   * Every later call still tries the download again: right after a restart WebKit sometimes refuses the file for a
   * moment and then loads it in the same page (wk-retry caught it), so one failure must never lock sign-in for good;
   * a try that works ends the stuck state and the restart. */
  const safari = (function () {
    const ua = navigator.userAgent || '';
    const iphone = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    return iphone || (/AppleWebKit/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium|Android|Edg\//.test(ua));
  })();
  let stuck = false;
  /* WebKit keeps a failed module under its address (the page's module map, and its memory cache even across a
   * reload: wk-retry, 16 Nov 2026), so the same import() can never work again. A file that failed is asked for
   * under a new address next time (?r=1, ?r=2: the server ignores it). Only that file: the others keep their address,
   * so auth and firestore still share the one firebase-app. Kept for the tab (sessionStorage), so a restart uses it too. */
  const BUST_KEY = 'shaati.sdkRetry';
  const bust = (function () { try { return JSON.parse(sessionStorage.getItem(BUST_KEY) || '{}') || {}; } catch (e) { return {}; } })();
  const sdkUrl = (f) => SDK + f + (bust[f] ? '?r=' + bust[f] : '');
  const failed = (f) => { bust[f] = (bust[f] || 0) + 1; try { sessionStorage.setItem(BUST_KEY, JSON.stringify(bust)); } catch (e) { /* private mode: this page only */ } };
  const offline = () => navigator.onLine === false;
  const failure = (code) => Object.assign(new Error(code), { code });
  function stuckNow() {
    if (stuck) return;
    stuck = true;
    document.addEventListener('visibilitychange', () => {
      const open = document.querySelector('.sheet, .dialog') || (root.App && root.App.blocking && root.App.blocking !== 'login');
      if (document.visibilityState === 'hidden' && stuck && !open) location.reload();
    });
  }
  Cloud.preload = function () {
    if (fb || loading || !root.FIREBASE_CONFIG || Cloud.preloaded) return;
    // offline: a failed preload would be remembered by Safari (above); it starts once the network is back
    if (offline()) { root.addEventListener('online', () => Cloud.preload(), { once: true }); return; }
    Cloud.preloaded = true;
    showGone().then(() => { for (const f of ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']) {
      const l = document.createElement('link');
      l.rel = 'modulepreload';
      l.href = sdkUrl(f);
      document.head.appendChild(l);
    } });
  };
  Cloud.importer = (u) => import(u); // one place, so tests can play a cut-off download
  function load() {
    if (fb) return Promise.resolve(fb);
    if (!root.FIREBASE_CONFIG) return Promise.reject(root.U.oops('חסרות הגדרות Firebase'));
    if (!loading && offline()) return Promise.reject(failure('auth/network-request-failed'));
    if (!loading) {
      loading = (async () => {
        await showGone();
        let a, au, fs;
        try { [a, au, fs] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map((f) => Cloud.importer(sdkUrl(f)).catch((e) => { failed(f); throw e; }))); }
        catch (e) { if (safari) { stuckNow(); throw failure('shaati/sdk-stuck'); } throw e; }
        stuck = false; // the download worked after all: no restart needed
        const app = a.getApps().length ? a.getApp() : a.initializeApp(root.FIREBASE_CONFIG);
        let auth;
        try {
          // the sign-in is kept in localStorage first: some phones (iPhones especially) lose their IndexedDB
          // connection when the app goes to the background, which would sign people out. A sign-in already
          // stored in IndexedDB is moved over by Firebase, so nobody is signed out by this order.
          auth = au.initializeAuth(app, { persistence: [au.browserLocalPersistence, au.indexedDBLocalPersistence], popupRedirectResolver: au.browserPopupRedirectResolver });
        } catch (e) { auth = au.getAuth(app); }
        auth.languageCode = root.U.LANG; // Google's sign-in window and e-mails in the app's language
        let db;
        // Firestore keeps its own copy in IndexedDB; on a phone whose IndexedDB is broken it would fail every
        // write, so it then works from memory (the app's own store re-sends anything unconfirmed on the next start)
        const broken = Store.isMemoryOnly && Store.isMemoryOnly();
        try { db = fs.initializeFirestore(app, { localCache: broken ? fs.memoryLocalCache() : fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) }); }
        catch (e) { db = fs.getFirestore(app); }
        fb = { app, auth, db, au, fs };
        return fb;
      })();
      loading.catch(() => { loading = null; }); // a failed download (offline) may be tried again
    }
    return loading;
  }

  /**
   * Is Google sign-in fully set up for this address? Asks the Identity Toolkit directly
   * (no SDK needed). true = ready, false = not configured yet, null = can't tell (offline).
   * Once ready, the answer is remembered on the device.
   */
  Cloud.probe = async function () {
    if (S.meta.cloudReady) return true;
    const cfg = root.FIREBASE_CONFIG;
    if (!cfg || !navigator.onLine) return cfg ? null : false;
    try {
      const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=' + cfg.apiKey, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'google.com', continueUri: location.origin + location.pathname }),
      });
      if (res.ok) { await Store.setMeta({ cloudReady: true }); return true; }
      const body = await res.json().catch(() => ({}));
      Cloud.setupProblem = (body.error && body.error.message) || String(res.status);
      return false;
    } catch (e) { return null; }
  };

  /** The loaded Firebase SDK ({app, auth, db, au, fs}) for other modules (statistics, admin). */
  Cloud.sdk = () => load();
  /** Is Google sign-in ready to open its window straight from a tap? */
  Cloud.sdkReady = () => !!fb;
  /** Tests inject a fake SDK ({app, auth, db, au, fs}) instead of loading Firebase. */
  Cloud._useSdk = (fake) => { fb = fake; };

  /** Load the SDK and resolve with the signed-in user (or null). */
  Cloud.start = function () {
    if (Cloud.ready) return Cloud.ready;
    Cloud.ready = (async () => {
      const { auth, au } = await load();
      try { await au.getRedirectResult(auth); } catch (e) { Cloud.redirectError = e; }
      // opened from the sign-in link in an email: finish signing in here
      if (/[?&]oobCode=/.test(location.search)) { try { await Cloud.finishEmailLink(); } catch (e) { Cloud.redirectError = e; } }
      return new Promise((resolve) => {
        let first = true;
        au.onAuthStateChanged(auth, (user) => {
          Cloud.user = user;
          if (first) { first = false; resolve(user); return; }
          if (Cloud.onAuthChange) Cloud.onAuthChange(user);
        });
      });
    })();
    Cloud.ready.catch(() => { Cloud.ready = null; });
    return Cloud.ready;
  };

  const AUTH_ERRORS = {
    'auth/popup-closed-by-user': 'חלון ההתחברות נסגר לפני שההתחברות הושלמה.',
    'auth/cancelled-popup-request': 'ההתחברות בוטלה.',
    'auth/network-request-failed': 'אין חיבור לאינטרנט. אפשר לנסות שוב כשיש רשת.',
    'auth/unauthorized-domain': 'הכתובת של האפליקציה לא מאושרת בהגדרות Firebase (Authorized domains).',
    'auth/operation-not-allowed': 'סוג ההתחברות הזה עוד לא הופעל. אפשר בינתיים להתחבר עם Google.',
    'auth/invalid-email': 'כתובת האימייל לא תקינה.',
    'auth/missing-email': 'צריך לכתוב כתובת אימייל.',
    'auth/invalid-action-code': 'הקישור כבר נוצל או שפג תוקפו. שלחו קישור חדש מהאפליקציה.',
    'auth/expired-action-code': 'פג תוקף הקישור. שלחו קישור חדש מהאפליקציה.',
    'auth/quota-exceeded': 'נשלחו יותר מדי קישורים היום. נסו שוב מחר, או התחברו עם Google.',
    'auth/too-many-requests': 'יותר מדי ניסיונות. אפשר לנסות שוב בעוד כמה דקות.',
    'auth/user-disabled': 'החשבון חסום.',
    'auth/popup-blocked': 'הדפדפן חסם את חלון האישור של Google. כדאי לאפשר חלונות קופצים ולנסות שוב.',
    'auth/requires-recent-login': 'כדי למחוק את החשבון צריך התחברות טרייה: מתנתקים, מתחברים שוב ומנסים מיד.',
    'auth/user-mismatch': 'נבחר חשבון Google אחר. צריך לבחור את החשבון שמחובר לאפליקציה.',
    'auth/internal-error': 'משהו השתבש בהתחברות. אפשר לנסות שוב.',
    'auth/web-storage-unsupported': 'הדפדפן חוסם שמירת נתונים (אולי גלישה בסתר). כדאי לפתוח את האפליקציה בדפדפן רגיל ולנסות שוב.',
    'auth/operation-not-supported-in-this-environment': 'הדפדפן הזה לא תומך בהתחברות. כדאי לפתוח את הקישור ב-\u2060Chrome או ב-\u2060Safari.',
    'auth/timeout': 'ההתחברות לקחה יותר מדי זמן. כדאי לבדוק את החיבור ולנסות שוב.',
    'shaati/sdk-stuck': 'החיבור נקטע בזמן שההתחברות נטענה. סגרו את שעתי, פתחו אותה שוב ונסו שוב.',
    // an email and a password
    'auth/email-already-in-use': 'כבר יש חשבון עם האימייל הזה. התחברו אליו עם הסיסמה שלו.',
    'auth/weak-password': 'הסיסמה קצרה מדי. בחרו סיסמה של 8 תווים לפחות.',
    'auth/missing-password': 'צריך להקליד סיסמה.',
    'auth/invalid-credential': 'האימייל או הסיסמה לא נכונים.',
    'auth/wrong-password': 'האימייל או הסיסמה לא נכונים.',
    'auth/user-not-found': 'האימייל או הסיסמה לא נכונים.',
    'auth/invalid-login-credentials': 'האימייל או הסיסמה לא נכונים.',
    'auth/account-exists-with-different-credential': 'האימייל הזה כבר מחובר לחשבון בדרך אחרת. התחברו בדרך שבה נרשמתם.',
  };
  const STORAGE_ERRORS = ['UnknownError', 'InvalidStateError', 'QuotaExceededError', 'DataError', 'AbortError'];
  /** What kind of failure an error is, so the message names the real cause: 'offline' (no network on this phone),
   *  'denied' (the server refused: its rules or a limit in them, never something the user typed), 'down' (the server
   *  did not answer in time), 'busy' (the server's daily quota or a rate limit), 'auth' (the sign-in ran out), 'gone'
   *  (not found), 'cut' (cancelled midway), 'storage' (this phone's storage), 'ours' (a message written for the person)
   *  or 'other'. Firestore's codes come bare ('permission-denied') or prefixed ('firestore/permission-denied'). */
  Cloud.errorKind = function (e) {
    if (e && STORAGE_ERRORS.includes(e.name)) return 'storage';
    if (root.U && root.U.ours && root.U.ours(e)) return 'ours';
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    const code = String((e && e.code) || '').replace(/^(firestore|functions|storage)\//, '');
    if (code === 'auth/network-request-failed' || code === 'shaati/sdk-stuck') return 'offline';
    if (code === 'permission-denied') return 'denied';
    if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'auth/timeout') return 'down';
    if (code === 'resource-exhausted' || code === 'auth/quota-exceeded' || code === 'auth/too-many-requests') return 'busy';
    if (code === 'unauthenticated' || code === 'auth/requires-recent-login' || code === 'auth/user-token-expired') return 'auth';
    if (code === 'not-found') return 'gone';
    if (code === 'cancelled' || code === 'aborted') return 'cut';
    if (e && e.name === 'TypeError' && /fetch|network|load failed/i.test(e.message || '')) return 'down';
    return 'other';
  };
  const KIND_TEXT = {
    offline: 'אין חיבור לאינטרנט. נסו שוב כשתחזור הרשת.',
    denied: 'השרת לא אישר את הפעולה. נסו שוב מאוחר יותר, ואם זה חוזר כתבו לנו בעזרה ותמיכה.',
    down: 'השרת לא ענה בזמן. בדקו את החיבור ונסו שוב בעוד רגע.',
    busy: 'השרת עמוס כרגע. נסו שוב בעוד כמה שעות. מה ששמרתם נשאר בטלפון.',
    auth: 'צריך להתחבר שוב לחשבון. התנתקו, התחברו ונסו שוב.',
    gone: 'זה כבר לא נמצא בשרת. אולי זה נמחק.',
    cut: 'הפעולה נקטעה באמצע. נסו שוב.',
    storage: 'הדפדפן לא הצליח לשמור את הנתונים. נסו שוב, ואם זה חוזר רעננו את הדף.',
    other: 'משהו השתבש. נסו שוב בעוד רגע.',
  };
  /** A message a person can understand, never raw English from the browser and never a code: what went wrong and what
   *  to do next. what: the action that failed as a full sentence ('לא הצלחנו ליצור הזמנה'); it opens the message. */
  Cloud.errorText = function (e, what) {
    const kind = Cloud.errorKind(e);
    let text;
    if (kind === 'ours') text = e.message;
    else if (e && AUTH_ERRORS[e.code] && !(typeof navigator !== 'undefined' && navigator.onLine === false)) text = AUTH_ERRORS[e.code];
    else text = KIND_TEXT[kind] || KIND_TEXT.other;
    return what ? what + '. ' + text : text;
  };

  /**
   * Opens the Google sign-in window. Browsers only allow a window that opens straight from a tap,
   * so when the SDK is already loaded nothing is awaited before the window opens.
   * opts.redirect: the full-page way instead of a window (for browsers that block windows entirely).
   * Resolves with the user, or null when the page is about to navigate away (redirect).
   */
  /** The full-page way comes back through the sign-in address (firebaseapp.com), another site than the app's. Safari
   *  (every iPhone browser, and Safari on a Mac) keeps another site's storage apart, so there it comes back signed
   *  out with no error: on Safari the Google window is the only way, and a second tap opens it. */
  Cloud.redirectOk = !safari;
  /** In the Android app from 1.44, Google's own window would leave the app's address (Chrome then shows its address
   *  bar): Android's own account picker gives a Google ID token instead (app/native-signin.js), and Firebase signs in
   *  with it. use(sdk, credential) signs in or confirms; web() is the web way, for when the app can't (its picker
   *  failed, an app before 1.44). Called straight from the tap, like the window. */
  function viaAndroid(use, web) {
    const N = root.NativeSignIn;
    if (!N || N.way() === 'web') return web();
    return N.token().then(
      (token) => load().then((sdk) => use(sdk, sdk.au.GoogleAuthProvider.credential(token))),
      (e) => { if (e && e.code === 'shaati/native-web') return web(); throw e; });
  }
  Cloud.signIn = function (opts) {
    const id = (opts && opts.provider) || 'google.com';
    const web = () => (fb ? go(fb) : load().then(go));
    if (id === 'google.com' && !(opts && opts.redirect)) {
      return viaAndroid(({ auth, au }, cred) => au.signInWithCredential(auth, cred).then((c) => { Cloud.user = c.user; return c.user; }), web);
    }
    return web();
    function go({ auth, au }) {
      // opts.provider: another sign-in service (window.AUTH_PROVIDERS), once it is registered and turned on in Firebase
      const provider = id === 'google.com' ? new au.GoogleAuthProvider() : id === 'github.com' ? new au.GithubAuthProvider() : new au.OAuthProvider(id);
      if (id === 'google.com' || id === 'microsoft.com') provider.setCustomParameters({ prompt: 'select_account' });
      if (opts && opts.redirect && Cloud.redirectOk) return au.signInWithRedirect(auth, provider).then(() => null);
      return au.signInWithPopup(auth, provider).then((cred) => { Cloud.user = cred.user; return cred.user; }, (e) => {
        // no windows at all in this browser: the full-page way (it comes back signed in)
        if (Cloud.redirectOk && ['auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) return au.signInWithRedirect(auth, provider).then(() => null);
        throw e;
      });
    }
  };

  /* ---------------- signing in with an email and a password ---------------- */
  /** Signs in, or (create) opens a new account, with an email and a password (any email, not only Gmail). */
  Cloud.signInEmail = async function (email, password, create) {
    const { auth, au } = await load();
    const cred = create ? await au.createUserWithEmailAndPassword(auth, email, password) : await au.signInWithEmailAndPassword(auth, email, password);
    Cloud.user = cred.user;
    return cred.user;
  };
  /** Sends a link to choose a new password. */
  Cloud.resetPassword = async function (email) {
    const { auth, au } = await load();
    await au.sendPasswordResetEmail(auth, email);
  };
  /** true when this account signs in with a password (deleting it asks for the password again). */
  Cloud.usesPassword = () => !!(Cloud.user && (Cloud.user.providerData || []).some((p) => p && p.providerId === 'password'));

  /* ---------------- signing in with an email link (no password) ---------------- */
  const EMAIL_KEY = 'shaati.emailForSignIn';
  /** Sends a sign-in link to this email; opening it (on this phone) signs in. */
  Cloud.sendEmailLink = async function (email) {
    const { auth, au } = await load();
    await au.sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname + '?signin=email', handleCodeInApp: true });
    try { localStorage.setItem(EMAIL_KEY, email); } catch (e) { /* asked again when the link is opened */ }
  };
  /** The page was opened from that link: signs in. The email is the one saved when the link was sent; opened
   *  elsewhere (another browser), it is asked once. The link leaves the address either way. */
  Cloud.finishEmailLink = async function () {
    const { auth, au } = await load();
    if (typeof au.isSignInWithEmailLink !== 'function' || !au.isSignInWithEmailLink(auth, location.href)) return null;
    const clean = () => { try { history.replaceState(history.state, '', location.pathname); } catch (e) { /* ignore */ } };
    let email = '';
    try { email = localStorage.getItem(EMAIL_KEY) || ''; } catch (e) { /* ignore */ }
    if (!email && root.UI) {
      for (let i = 0; i < 40 && document.getElementById('intro'); i++) await new Promise((r) => setTimeout(r, 150));
      email = String((await root.UI.promptText('השלמת ההתחברות', 'לאיזה אימייל נשלח הקישור?', '', { type: 'email', inputmode: 'email', ltr: true, ok: 'התחברות' })) || '').trim();
    }
    if (!email) { clean(); return null; }
    try {
      const cred = await au.signInWithEmailLink(auth, email, location.href);
      Cloud.user = cred.user;
      return cred.user;
    } finally {
      try { localStorage.removeItem(EMAIL_KEY); } catch (e) { /* ignore */ }
      clean();
    }
  };

  /* ---------------- encoding ---------------- */
  /** A payslip keeps the line each number was read from (shown under the number when it is checked). The raw text
   *  stays on the phone, so these lines go to the cloud the way the AI gets the text: without the ID number, bank
   *  account, address, phone or email (Payslip.redact). Without the redaction code at hand, the lines stay home. */
  function redactLines(o) {
    const P = root.Payslip;
    const red = (l) => (typeof l !== 'string' || !l || l === 'AI' ? l : P && P.redact ? P.redact(l).text : '');
    if (o.fields && typeof o.fields === 'object') {
      const f = {};
      for (const k of Object.keys(o.fields)) { const v = o.fields[k]; f[k] = v && typeof v === 'object' && 'line' in v ? Object.assign({}, v, { line: red(v.line) }) : v; }
      o.fields = f;
    }
    if (Array.isArray(o.other)) o.other = o.other.map((x) => (x && typeof x === 'object' && 'line' in x ? Object.assign({}, x, { line: red(x.line) }) : x));
  }
  function encode(store, rec) {
    const o = Object.assign({}, rec);
    delete o._syncedAt;
    for (const f of LOCAL_ONLY_FIELDS[store] || []) delete o[f];
    if (store === 'payslips') redactLines(o);
    // a signed log record's text never changes (the server refuses a change to it): its versions travel in u only
    if (Store.APPEND_ONLY.includes(store)) { delete o.updatedAt; delete o.createdAt; }
    return { u: rec.updatedAt || 0, d: false, j: JSON.stringify(o) };
  }
  function decode(store, v, local) {
    const o = JSON.parse(v.j);
    o.updatedAt = v.u;
    if (local) for (const f of LOCAL_ONLY_FIELDS[store] || []) if (local[f] !== undefined) o[f] = local[f];
    return o;
  }
  function encodeSettings() {
    const o = Object.assign({}, S.settings);
    for (const k of LOCAL_ONLY_SETTINGS) delete o[k];
    return { u: S.settings._updatedAt || Date.now(), j: JSON.stringify(o) };
  }
  const encodeActive = () => ({ u: S.meta.activeUpdatedAt || Date.now(), j: S.activeShift ? JSON.stringify(S.activeShift) : null });
  const userDoc = (...p) => fb.fs.doc(fb.db, 'users', Cloud.user.uid, ...p);
  /* The upload stamp s: the server's time when a record (or a tombstone) reached it, set by the server itself. The
   * listeners ask for what reached the server since this phone last heard (s), not for what was edited since (u): a
   * phone that edited offline and went online days later wrote a u older than the other phones' window, so they did not
   * hear it until the weekly full read (review 16.11.2026, sync #2). Rules from before s refuse it: then the writes go
   * without it until the app opens again (stampOk), and nothing waits on a rules deploy. */
  let stampOk = true;
  const stamped = (data) => (stampOk && fb.fs.serverTimestamp ? Object.assign({}, data, { s: fb.fs.serverTimestamp() }) : data);

  /* ---------------- first connection on a device ---------------- */
  async function fetchAll(uid) {
    const { fs, db } = fb;
    const out = { stores: {}, settings: null, active: null };
    await Promise.all(SYNC.map(async (st) => {
      const snap = await fs.getDocsFromServer(fs.collection(db, 'users', uid, st));
      out.stores[st] = new Map(snap.docs.map((d) => [d.id, d.data()]));
    }));
    const [se, ac] = await Promise.all([fs.getDocFromServer(fs.doc(db, 'users', uid, 'kv', 'settings')), fs.getDocFromServer(fs.doc(db, 'users', uid, 'kv', 'active'))]);
    if (se.exists()) out.settings = se.data();
    if (ac.exists()) out.active = ac.data();
    return out;
  }
  async function askMode() {
    return UI.dialog({
      title: 'יש נתונים גם בטלפון וגם בחשבון',
      text: 'בטלפון הזה כבר יש משמרות, וגם בחשבון ה-\u2060Google שלך שמורים נתונים. מה לעשות?',
      buttons: [
        { label: 'לאחד את שניהם (מומלץ)', value: 'merge', cls: '' },
        { label: 'רק מהחשבון', value: 'cloud', cls: 'text' },
        { label: 'רק מהטלפון', value: 'local', cls: 'text' },
      ],
    });
  }
  async function initialMerge(uid) {
    const R = await fetchAll(uid);
    const live = (m) => [...m.values()].some((v) => !v.d);
    const cloudHas = SYNC.some((st) => live(R.stores[st])) || !!R.settings;
    const localHas = S.shifts.length + S.entries.length + S.payslips.length > 0;
    let mode = !cloudHas ? 'local' : !localHas ? 'cloud' : (await askMode()) || 'merge';
    const ops = [];
    if (mode === 'local') {
      if (cloudHas) {
        await Store.touchAll();
        const pend = S.meta.pendingDeletes || (S.meta.pendingDeletes = []);
        const now = Date.now();
        const keep = []; // the signed shift log is never deleted: the account's records join this phone's
        for (const st of SYNC) for (const [id, v] of R.stores[st]) if (!v.d && !S[st].some((x) => x.id === id)) { if (Store.APPEND_ONLY.includes(st)) keep.push({ store: st, put: decode(st, v) }); else pend.push({ store: st, id, at: now }); }
        if (keep.length) await Store.applyRemote(keep);
      }
    } else {
      for (const st of SYNC) {
        const remote = R.stores[st];
        for (const [id, v] of remote) {
          const local = S[st].find((x) => x.id === id);
          if (mode === 'merge' && local && (local.updatedAt || 0) >= v.u) continue;
          if (mode === 'merge' && !local && !v.d && deletedHere(st, id, v.u)) continue;
          if (v.d) { if (local) ops.push({ store: st, del: id }); }
          else ops.push({ store: st, put: decode(st, v, local) });
        }
        if (mode === 'cloud') for (const r of S[st]) if (!remote.has(r.id) || remote.get(r.id).d) ops.push({ store: st, del: r.id });
      }
      if (mode === 'cloud') S.meta.pendingDeletes = [];
      await Store.applyRemote(ops);
      if (R.settings && (mode === 'cloud' || R.settings.u > (S.settings._updatedAt || 0))) await Store.applyRemoteSettings(JSON.parse(R.settings.j), LOCAL_ONLY_SETTINGS);
      else await Store.setMeta({ settingsDirty: true });
      await Store.flushMem(); // what this phone remembered from before 1.36.4 (answers, "seen"), now with the account's
      if (R.active && (mode === 'cloud' || R.active.u > (S.meta.activeUpdatedAt || 0))) await Store.applyRemoteActive(R.active.j ? JSON.parse(R.active.j) : null, R.active.u);
    }
    return mode;
  }

  /** Connect a signed-in user: first-time merge if needed, live listeners, push. */
  Cloud.connect = async function (user) {
    await load();
    Cloud.user = user;
    detach();
    setStatus('syncing');
    if (S.meta.cloudUid && S.meta.cloudUid !== user.uid) {
      // this phone holds another account's data: it must never be mixed into this account
      const prev = S.meta.cloudEmail || 'החשבון הקודם';
      if (Cloud.hasUnsynced() && !(await UI.confirm('החלפת חשבון', `בטלפון יש שינויים של ${prev} שעוד לא עלו לענן. אם תמשיך עם ${user.email || 'החשבון החדש'}, הם יימחקו מהטלפון.`, 'המשך בכל זאת', true))) {
        try { await fb.au.signOut(fb.auth); } catch (e) { /* ignore */ }
        Cloud.user = null;
        setStatus('idle');
        throw Object.assign(root.U.oops(`החיבור בוטל. צריך להתחבר עם ${prev} כדי שהשינויים יעלו לחשבון שלו.`), { code: 'app/switch-cancelled' });
      }
      // what only this phone held for the previous account waits for it here (unencrypted: its key is in its account)
      try { await Store.park(S.meta.cloudUid, null); } catch (e) { console.warn('park', e); }
      await Store.wipe();
    }
    if (S.meta.cloudUid !== user.uid) {
      // a restore made before this account was linked: the first merge decides what this account keeps
      if (S.meta.restorePending) await Store.setMeta({ restorePending: null });
      await Store.forgetSyncState(); // nothing on this phone was ever confirmed by this account
      const t0 = Date.now();
      await initialMerge(user.uid); // needs the network the first time
      // the whole account was just read: the listeners need only what changes from here
      await Store.setMeta({ heard: { uid: user.uid, at: t0, full: t0 } });
    }
    // (a guest who signs in is a guest no more: what was on the phone goes up to the account)
    await Store.setMeta({ cloudUid: user.uid, cloudEmail: user.email, cloudName: user.displayName || '', cloudPhoto: user.photoURL || '', guest: false });
    attach(user.uid);
    Cloud.connected = true;
    await push();
    if (root.Stats) { root.Stats.report(); Cloud.adminCheck = root.Stats.checkAdmin(); } // the opening show waits for this one
    if (root.Support) root.Support.check();
    await unparkFor(user); // this account's own phone-only items, if it signed out on this phone before
    // what the champions table is missing (a game played offline, a write that failed), a little after the opening
    setTimeout(() => { if (root.Champions && Cloud.user === user) root.Champions.sync(); }, 4000);
  };

  /* ---------------- live listeners (cloud → phone) ---------------- */
  /* One rule for every version heard from the account, applied when it is taken in (not when it was heard: a save on
   * this phone in between must win, 1.39 review). Returns the op to apply, or null:
   *   - this phone's copy is as new or newer;
   *   - deleted here, the tombstone not up yet (the app closed within the push wait): it must not come back;
   *   - removed by a "replace" restore that the account does not know of yet (S.meta.restorePending, settleRestore);
   *     a version made after the restore (another phone) is taken. The signed shift log is never removed. */
  function deletedHere(st, id, u) { return (S.meta.pendingDeletes || []).some((d) => d.store === st && d.id === id && d.at >= u); }
  function wanted(st, id, v) {
    const local = S[st].find((x) => x.id === id);
    if (local && (local.updatedAt || 0) >= v.u) return null;
    if (v.d) return local ? { store: st, del: id, u: v.u } : null;
    if (!local && deletedHere(st, id, v.u)) return null;
    if (!local && S.meta.restorePending && v.u <= S.meta.restorePending && !Store.APPEND_ONLY.includes(st)) return null;
    return { store: st, put: decode(st, v, local) };
  }
  // what the listeners heard, applied together a moment later; detach() drops it and bumps gen, so nothing heard from
  // an account lands after sign-out or an account switch (the wiped phone would hand it to the next account)
  let incoming = [];
  let flushTimer = null;
  let gen = 0;
  function queueRemote(heardNow) {
    incoming = incoming.concat(heardNow);
    clearTimeout(flushTimer);
    const g = gen;
    flushTimer = setTimeout(async () => {
      const h = incoming; incoming = [];
      if (g !== gen) return;
      const last = new Map(); // the newest heard of each record
      for (const x of h) last.set(x.st + '/' + x.id, x);
      const ops = [];
      for (const x of last.values()) { const op = wanted(x.st, x.id, x.v); if (op) ops.push(op); }
      try { await Store.applyRemote(ops); } catch (e) { console.warn('cloud: apply', e); }
    }, 120);
  }
  // Listening to a whole folder again reads every document in it: Firestore bills a listener that was away for more
  // than 30 minutes as a new query, so every opening read the whole account (300 shifts = 300 of the free plan's 50,000
  // reads a day). Now an opening listens only to what changed since this phone last heard from the server (S.meta.heard,
  // this phone's clock), two days back for a phone whose clock is off; once a week the whole folder, to be sure.
  const HEARD_BACK = 2 * 86400000, HEARD_FULL = 7 * 86400000;
  Cloud.OLD_APPS_UNTIL = Date.UTC(2027, 1, 1); // 1 Feb 2027 (attach)
  function heardSince(uid) {
    const h = S.meta.heard;
    if (!h || h.uid !== uid || !(h.at > 0) || !(Date.now() - (h.full || 0) < HEARD_FULL)) return 0;
    return h.at - HEARD_BACK;
  }
  /** Every folder has answered from the server: this phone has heard everything up to now (saved once a minute). */
  function heardAll(uid, full) {
    const prev = S.meta.heard && S.meta.heard.uid === uid ? S.meta.heard : null;
    if (prev && !full && Date.now() - prev.at < 60000) return;
    Store.setMeta({ heard: { uid, at: Date.now(), full: full ? Date.now() : (prev && prev.full) || 0 } }).catch(() => {});
  }
  function attach(uid) {
    const { fs, db } = fb;
    const onErr = (e) => setStatus('error', e);
    const since = fs.query && fs.where ? heardSince(uid) : 0;
    // since an opening: what reached the server since (s, the upload stamp). Until OLD_APPS_UNTIL also what was edited
    // since (u): an app from before the stamp (1.41.1 and older) writes no s. The installed app opens the live version,
    // so those go within days; after that date a record of one still arrives with the weekly full read. Two plain
    // listeners, not one or(): each needs only Firestore's automatic one-field index (the second costs a read per folder).
    const asks = !since ? [null] : !fs.Timestamp ? [['u', since]]
      : [['s', fs.Timestamp.fromMillis(since)]].concat(Date.now() < Cloud.OLD_APPS_UNTIL ? [['u', since]] : []);
    const heard = new Set(), all = SYNC.length * asks.length;
    for (const st of SYNC) for (const ask of asks) {
      const folder = fs.collection(db, 'users', uid, st);
      const key = st + (ask ? '/' + ask[0] : '');
      unsubs.push(fs.onSnapshot(ask ? fs.query(folder, fs.where(ask[0], '>', ask[1])) : folder, (snap) => {
        const got = [];
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) continue;
          const v = ch.doc.data();
          if (wanted(st, ch.doc.id, v)) got.push({ st, id: ch.doc.id, v }); // (asked again when applied)
        }
        if (got.length) queueRemote(got);
        if (!snap.metadata.fromCache && Cloud.status === 'syncing') setStatus('synced');
        if (!snap.metadata.fromCache) { const was = heard.size; heard.add(key); if (heard.size === all) heardAll(uid, !since && was < all); }
      }, onErr));
    }
    unsubs.push(fs.onSnapshot(fs.doc(db, 'users', uid, 'kv', 'settings'), (d) => {
      if (!d.exists() || d.metadata.hasPendingWrites) return;
      const v = d.data();
      // the account's settings heard from the server: what this phone alone remembered goes up after them (Store.flushMem)
      const after = () => (d.metadata.fromCache ? null : Store.flushMem().then((up) => { if (up) Cloud.schedulePush(1500); }));
      if (v.u > (S.settings._updatedAt || 0)) Store.applyRemoteSettings(JSON.parse(v.j), LOCAL_ONLY_SETTINGS).then(after).catch(() => {});
      else after();
    }, onErr));
    unsubs.push(fs.onSnapshot(fs.doc(db, 'users', uid, 'kv', 'active'), (d) => {
      if (!d.exists() || d.metadata.hasPendingWrites) return;
      const v = d.data();
      if (v.u > (S.meta.activeUpdatedAt || 0)) Store.applyRemoteActive(v.j ? JSON.parse(v.j) : null, v.u).catch(() => {});
    }, onErr));
  }
  function detach() {
    unsubs.forEach((f) => f()); unsubs = [];
    gen++; clearTimeout(flushTimer); incoming = []; clearTimeout(pushTimer);
    Cloud.connected = false;
  }

  /* ---------------- push (phone → cloud) ---------------- */
  // A change counts as synced only after the server confirmed it, so nothing is lost if the app is
  // closed (or the phone restarts) before the upload finishes: it is simply sent again next time.
  const inflight = new Map(); // "store/id" → version currently being written
  let acked = { items: [], dels: [], settingsU: null, activeU: null };
  let ackTimer = null;
  async function flushAcks() {
    const a = acked;
    acked = { items: [], dels: [], settingsU: null, activeU: null };
    if (a.items.length || a.dels.length) await Store.markSynced(a.items, a.dels);
    const patch = {};
    if (a.settingsU != null && S.settings._updatedAt === a.settingsU) patch.settingsDirty = false;
    if (a.activeU != null && S.meta.activeUpdatedAt === a.activeU) patch.activeDirty = false;
    if (Object.keys(patch).length) await Store.setMeta(patch);
  }
  async function push() {
    if (!fb || !Cloud.user || S.meta.cloudUid !== Cloud.user.uid) return;
    if (pushing) { pushAgain = true; return; }
    pushing = true;
    try {
      const { fs, db } = fb;
      if (S.meta.restorePending) { try { await settleRestore(Cloud.user.uid); } catch (e) { /* offline: on the next push */ } }
      if (!Cloud.user || S.meta.cloudUid !== Cloud.user.uid) return;
      const writes = []; // [key, version, ref, data, onConfirmed]
      for (const { store, rec } of Store.dirtyRecords()) {
        const at = rec.updatedAt;
        writes.push([store + '/' + rec.id, at, userDoc(store, rec.id), stamped(encode(store, rec)), () => acked.items.push({ store, id: rec.id, at })]);
      }
      for (const d of S.meta.pendingDeletes || []) writes.push([d.store + '/' + d.id, 'del' + d.at, userDoc(d.store, d.id), stamped({ u: d.at, d: true, j: null }), () => acked.dels.push(d)]);
      if (S.meta.settingsDirty) { const u = S.settings._updatedAt; writes.push(['kv/settings', u, userDoc('kv', 'settings'), encodeSettings(), () => { acked.settingsU = u; }]); }
      if (S.meta.activeDirty) { const u = S.meta.activeUpdatedAt; writes.push(['kv/active', u, userDoc('kv', 'active'), encodeActive(), () => { acked.activeU = u; }]); }
      const fresh = writes.filter(([key, ver]) => inflight.get(key) !== ver);
      if (fresh.length) {
        // the account's marker (no email: nothing reads it, and the sign-in service already knows it); a full write,
        // so an email that an older version put here goes with the next change. Once a day, or when the version
        // changes: it was a second write with every upload (a shift saved = 2 writes of the free plan's 20,000 a day)
        const mark = Cloud.markDue(Cloud.user.uid);
        if (mark) fs.setDoc(fs.doc(db, 'users', Cloud.user.uid), { updatedAt: Date.now(), schema: Store.SCHEMA_VERSION, app: root.APP_VERSION })
          .then(() => Store.setMeta({ userMark: mark }), () => {}).catch(() => {});
        // One write per document: Firestore also keeps them in its own IndexedDB until the server confirms.
        // The security rules refuse a write that is older than what the server has (a phone that was
        // offline must not overwrite a newer change from another phone); onRejected settles it.
        for (const [key, ver, ref, data, onConfirmed] of fresh) {
          inflight.set(key, ver);
          fs.setDoc(ref, data)
            .then(() => { onConfirmed(); clearTimeout(ackTimer); ackTimer = setTimeout(flushAcks, 0); }, (e) => onRejected(ref, e, 's' in data))
            .finally(() => { if (inflight.get(key) === ver) inflight.delete(key); });
        }
        setStatus(navigator.onLine ? 'syncing' : 'offline');
      }
      fs.waitForPendingWrites(db).then(() => {
        if (Cloud.status === 'error') return;
        Store.setMeta({ lastSync: Date.now() });
        setStatus('synced');
      }).catch(() => {});
    } catch (e) {
      setStatus('error', e);
    } finally {
      pushing = false;
      if (pushAgain) { pushAgain = false; Cloud.schedulePush(); }
    }
  }
  /** The account marker this phone should write now ({ uid, app, schema, day }), or null when today's is there. */
  Cloud.markDue = function (uid) {
    const m = { uid, app: String(root.APP_VERSION || ''), schema: Store.SCHEMA_VERSION, day: U.todayKey() };
    return U.same(S.meta.userMark, m) ? null : m;
  };
  /** The server refused a write. If the cloud holds a newer version, take it; otherwise keep ours dirty. */
  async function onRejected(ref, e, hadStamp) {
    const { fs } = fb;
    const parts = ref.path.split('/'); // users/{uid}/{store}/{id}
    const store = parts[2], id = parts[3];
    const g = gen;
    try {
      const snap = await fs.getDocFromServer(ref);
      if (g !== gen) return; // signed out or another account meanwhile: nothing of this one lands here
      const v = snap.exists() ? snap.data() : null;
      if (store === 'kv') {
        if (v && id === 'settings' && v.u > (S.settings._updatedAt || 0)) return Store.applyRemoteSettings(JSON.parse(v.j), LOCAL_ONLY_SETTINGS);
        if (v && id === 'active' && v.u > (S.meta.activeUpdatedAt || 0)) return Store.applyRemoteActive(v.j ? JSON.parse(v.j) : null, v.u);
      } else if (SYNC.includes(store)) {
        const local = S[store].find((x) => x.id === id);
        if (v && (!local || (local.updatedAt || 0) < v.u)) {
          // (applyRemote also drops this phone's refused tombstone of it: the account's newer version stands)
          return Store.applyRemote([v.d ? { store, del: id, u: v.u } : { store, put: decode(store, v, local) }]);
        }
        if (local) { delete local._syncedAt; await Store.saveAll(); }
        // not an older version: the rules may be from before the upload stamp. Once more without it (the record and
        // the tombstone are still waiting: dirty, or in pendingDeletes); a refusal for another reason stays an error
        if (hadStamp && stampOk && g === gen && e && e.code === 'permission-denied') { stampOk = false; Cloud.schedulePush(300); return; }
      }
    } catch (err) { /* offline: retried on the next push */ }
    setStatus('error', e);
  }
  Cloud.schedulePush = function (ms) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, ms == null ? 1500 : ms);
  };
  Cloud.syncNow = async function () {
    if (!Cloud.user) return;
    if (!Cloud.connected) await Cloud.connect(Cloud.user);
    else await push();
  };
  Cloud.hasUnsynced = () => Store.dirtyRecords().length > 0 || (S.meta.pendingDeletes || []).length > 0 || !!S.meta.settingsDirty;

  /* react to local changes */
  Store.on((ev) => {
    if (!Cloud.user || !Cloud.connected) return;
    if (ev.remote) return;
    if (ev.type === 'restore') { Cloud.afterRestore(ev.mode).catch(() => {}); return; }
    if (ev.type === 'data' || ev.type === 'settings' || ev.type === 'mem' || ev.type === 'active') Cloud.schedulePush(ev.type === 'active' ? 200 : 1500);
  });
  window.addEventListener('online', () => {
    if (!Cloud.user || !Cloud.connected) return;
    Cloud.schedulePush(300);
    if (root.Champions) root.Champions.sync(); // a game played offline reaches the table
  });
  window.addEventListener('offline', () => { if (Cloud.user) setStatus('offline'); });
  // the app going to the background may be its end (closed, or killed by the phone): what waits for the push goes now
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && Cloud.user && Cloud.connected && Cloud.hasUnsynced()) push();
  });

  /** After restoring a backup: make the cloud match this device. A "replace" restore already stamped every restored
   *  record and the settings with its own time and left S.meta.restorePending (Store.importBackup), so it holds also
   *  when it was made offline or before the account connected: push() settles it once the account answers. */
  Cloud.afterRestore = async function () { await push(); };
  /** The account's records that the restore removed (on the account, not on this phone, not changed since the restore)
   *  become tombstones; the flag goes only once that is done. (The signed shift log keeps the account's records.) */
  async function settleRestore(uid) {
    const at = S.meta.restorePending;
    const g = gen;
    const R = await fetchAll(uid);
    if (g !== gen || S.meta.restorePending !== at) return;
    const pend = S.meta.pendingDeletes || (S.meta.pendingDeletes = []);
    const now = Math.max(Date.now(), at);
    const keep = [];
    for (const st of SYNC) {
      for (const [id, v] of R.stores[st]) {
        if (v.d || S[st].some((x) => x.id === id)) continue;
        if (Store.APPEND_ONLY.includes(st)) keep.push({ store: st, put: decode(st, v) });
        else if (v.u <= at && !pend.some((d) => d.store === st && d.id === id)) pend.push({ store: st, id, at: now });
      }
    }
    await Store.setMeta({ pendingDeletes: pend, restorePending: null });
    if (keep.length) await Store.applyRemote(keep);
  }

  /* ---------------- the account's key for what it parks on this phone ----------------
   * A random AES-GCM key kept in the account itself (users/{uid}/kv/vault, readable by that account only). What the
   * account parks on this phone when it signs out (Store.park: payslip files, their raw text, the AI key, the code
   * lock) is encrypted with it, so the phone holds only ciphertext and only that account, signed in again, can open
   * it; deleting the account deletes the key too. The key never encrypts anything that goes to the server.
   * Returns the CryptoKey, false when the account has none (and create is off), or null (no connection, no crypto). */
  const vaultRef = (uid) => fb.fs.doc(fb.db, 'users', uid, 'kv', 'vault');
  const within = (pr, ms) => Promise.race([pr, sleep(ms).then(() => { throw new Error('timeout'); })]);
  async function vaultKey(uid, create) {
    const sub = root.crypto && root.crypto.subtle;
    if (!fb || !sub || !uid) return null;
    try {
      const snap = await within(fb.fs.getDocFromServer(vaultRef(uid)), 8000);
      let raw = null;
      if (snap.exists()) { try { raw = Uint8Array.from(atob(JSON.parse(snap.data().j).k), (c) => c.charCodeAt(0)); } catch (e) { raw = null; } }
      if (!raw || raw.length !== 32) {
        if (!create) return false;
        raw = root.crypto.getRandomValues(new Uint8Array(32));
        // kept only once the server has it: a key lost on the way would lock the files away for good. u is minus the
        // time, so the rules (no update to a lower u) refuse a later phone's key over this one: a key something is
        // already locked with is never replaced. The key used is the one the server then holds.
        try { await within(fb.fs.setDoc(vaultRef(uid), { u: -Date.now(), d: false, j: JSON.stringify({ k: btoa(String.fromCharCode.apply(null, raw)) }) }), 8000); }
        catch (e) { if (!e || e.code !== 'permission-denied') throw e; } // (another phone made it first: its key is read below)
        const again = await within(fb.fs.getDocFromServer(vaultRef(uid)), 8000);
        raw = again.exists() ? Uint8Array.from(atob(JSON.parse(again.data().j).k), (c) => c.charCodeAt(0)) : null;
        if (!raw || raw.length !== 32) return null;
      }
      return await sub.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    } catch (e) { console.warn('vault key', e); return null; }
  }
  Cloud._vaultKey = vaultKey;
  /** After a sign-in: what this same account parked on this phone comes back (another account's stays where it is). */
  async function unparkFor(user) {
    try {
      const has = await Store.parked(user.uid);
      if (!has.n || Cloud.user !== user) return;
      const key = has.enc ? await vaultKey(user.uid, false) : null;
      if (Cloud.user !== user) return;
      await Store.unpark(user.uid, key); // (-1: no connection for the key, tried again at the next opening)
    } catch (e) { console.warn('unpark', e); }
  }

  /* ---------------- sign out / delete ---------------- */
  /** Sign out and clear this device. Returns false if the user cancelled.
   *  opts.removeLocal: the phone-only items (payslip files, their text, the AI key, the code lock) go too, instead of
   *  waiting on the phone, hidden, for this same account to sign in again (a shared phone). */
  Cloud.signOut = async function (opts) {
    const removeLocal = !!(opts && opts.removeLocal);
    const uid = (Cloud.user && Cloud.user.uid) || S.meta.cloudUid || null;
    if (fb && Cloud.user) {
      await push();
      try { await within(fb.fs.waitForPendingWrites(fb.db), 8000); }
      catch (e) {
        const ok = await UI.confirm('יש שינויים שעוד לא עלו לענן', 'כנראה אין חיבור לאינטרנט. אם תתנתק עכשיו, השינויים האחרונים מהטלפון הזה יאבדו.', 'התנתק בכל זאת', true);
        if (!ok) return false;
      }
    }
    if (uid && !removeLocal) {
      try {
        const key = fb && Cloud.user ? await vaultKey(uid, true) : null;
        await Store.park(uid, key || null);
      } catch (e) {
        console.warn('park', e);
        const ok = await UI.confirm('אין מקום לשמור את הקבצים', 'אין מספיק מקום בטלפון כדי להשאיר בו את קובצי התלושים ואת שאר מה שנשמר רק בו. אם תתנתק עכשיו, הם יימחקו.', 'התנתק בכל זאת', true);
        if (!ok) return false;
      }
    }
    await shutdown(removeLocal ? uid : null);
    return true;
  };
  /** dropUid: that account's parked items go too (removed from the phone, or the account deleted). */
  async function shutdown(dropUid) {
    detach();
    if (fb) {
      try { await fb.au.signOut(fb.auth); } catch (e) { /* ignore */ }
      try { await fb.fs.terminate(fb.db); await fb.fs.clearIndexedDbPersistence(fb.db); } catch (e) { /* ignore */ }
    }
    await Store.wipe();
    if (dropUid) await Store.dropParked(dropUid);
  }
  /** Permanently delete everything stored for this user in the cloud, delete the sign-in account
   *  itself (required by Google Play's account-deletion policy), then clear this device. */
  Cloud.deleteAccountData = async function (opts) {
    const { fs, db, au, auth } = await load();
    const user = auth.currentUser || Cloud.user;
    const uid = user.uid;
    // deleting an account needs a recent sign-in. Confirm it now, while the tap that started the deletion still
    // counts as a user gesture (otherwise the popup gets blocked); a password account confirms with its password
    const last = Date.parse((user.metadata && user.metadata.lastSignInTime) || '') || 0;
    // (an account from before email sign-in has no list here: it signed in with Google)
    const pd = user.providerData || [];
    const via = pd.length ? pd[0].providerId : 'google.com';
    if (user.delete && Date.now() - last > 4 * 60 * 1000) {
      if (via === 'password') await au.reauthenticateWithCredential(user, au.EmailAuthProvider.credential(user.email, String((opts && opts.password) || '')));
      // in the Android app, Android's own account picker (app/native-signin.js): Google's window would leave the app
      else if (via === 'google.com') await viaAndroid((sdk, cred) => au.reauthenticateWithCredential(user, cred), () => au.reauthenticateWithPopup(user, new au.GoogleAuthProvider()));
      else await au.reauthenticateWithPopup(user, via === 'github.com' ? new au.GithubAuthProvider() : new au.OAuthProvider(via));
    }
    detach();
    // what the account left outside its own folder goes first, and strictly: a request, a row on the champions
    // table or a card in the friends' competition that could not be deleted (offline, refused) stops the deletion
    // here, while the account still exists to delete them with. The person sees "the deletion failed" and tries
    // again; deleting the sign-in account first would leave them on the server with no way back to them.
    const strict = { strict: true };
    try {
      if (root.Stats) await root.Stats.forget(strict);
      if (root.Support) await root.Support.forget(strict);
      if (root.Champions) await root.Champions.forget(strict);
      if (root.FriendsView) await root.FriendsView.forget(strict);
      if (root.Invite) await root.Invite.forget(strict);
      if (root.WorkplaceCode) await root.WorkplaceCode.forget(strict);
    } catch (e) {
      // the account stays: sync goes on as before
      if (Cloud.user && Cloud.user.uid === uid) { attach(uid); Cloud.connected = true; }
      throw e;
    }
    for (const st of SYNC.concat(['kv'])) {
      const snap = await fs.getDocs(fs.collection(db, 'users', uid, st));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const b = fs.writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    }
    await fs.deleteDoc(fs.doc(db, 'users', uid));
    if (user.delete) await au.deleteUser(user);
    await shutdown(uid); // (with anything it parked on this phone: its key went with kv above)
  };

  Cloud.statusText = function () {
    const st = Cloud.status;
    if (!Cloud.user) return 'לא מחובר';
    if (st === 'synced') return 'מסונכרן' + (S.meta.lastSync ? ' · ' + UI.timeAgo(S.meta.lastSync) : '');
    if (st === 'syncing') return 'מסנכרן…';
    if (st === 'offline') return 'אין חיבור. יסונכרן כשתחזור הרשת';
    if (st === 'error') return 'שגיאת סנכרון: ' + Cloud.errorText(Cloud.error);
    return 'מחובר';
  };
})(typeof window !== 'undefined' ? window : globalThis);
