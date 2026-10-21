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
 * timestamps, raw payslip text and payslip image/PDF files.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, UI } = root;
  const S = Store.S;

  const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
  const LOCAL_ONLY_SETTINGS = ['ai', 'lock', 'backup'];
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
  function load() {
    if (fb) return Promise.resolve(fb);
    if (!root.FIREBASE_CONFIG) return Promise.reject(new Error('חסרות הגדרות Firebase'));
    if (!loading) {
      loading = (async () => {
        const [a, au, fs] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
        const app = a.getApps().length ? a.getApp() : a.initializeApp(root.FIREBASE_CONFIG);
        let auth;
        try {
          // the sign-in is kept in localStorage first: some phones (iPhones especially) lose their IndexedDB
          // connection when the app goes to the background, which would sign people out. A sign-in already
          // stored in IndexedDB is moved over by Firebase, so nobody is signed out by this order.
          auth = au.initializeAuth(app, { persistence: [au.browserLocalPersistence, au.indexedDBLocalPersistence], popupRedirectResolver: au.browserPopupRedirectResolver });
        } catch (e) { auth = au.getAuth(app); }
        auth.languageCode = 'he';
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
    'auth/network-request-failed': 'אין חיבור לאינטרנט. נסה שוב כשיש רשת.',
    'auth/unauthorized-domain': 'הכתובת של האפליקציה לא מאושרת בהגדרות Firebase (Authorized domains).',
    'auth/operation-not-allowed': 'סוג ההתחברות הזה עוד לא הופעל. אפשר בינתיים להתחבר עם Google.',
    'auth/invalid-email': 'כתובת האימייל לא תקינה.',
    'auth/missing-email': 'צריך לכתוב כתובת אימייל.',
    'auth/invalid-action-code': 'הקישור כבר נוצל או שפג תוקפו. שלחו קישור חדש מהאפליקציה.',
    'auth/expired-action-code': 'פג תוקף הקישור. שלחו קישור חדש מהאפליקציה.',
    'auth/quota-exceeded': 'נשלחו יותר מדי קישורים היום. נסו שוב מחר, או התחברו עם Google.',
    'auth/too-many-requests': 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.',
    'auth/user-disabled': 'החשבון חסום.',
    'auth/popup-blocked': 'הדפדפן חסם את חלון האישור של Google. אפשר חלונות קופצים ונסה שוב.',
    'auth/requires-recent-login': 'כדי למחוק את החשבון צריך התחברות טרייה: התנתק, התחבר שוב ונסה מיד.',
    'auth/user-mismatch': 'נבחר חשבון Google אחר. בחר את החשבון שמחובר לאפליקציה.',
    'auth/internal-error': 'משהו השתבש בהתחברות. נסה שוב.',
    'auth/web-storage-unsupported': 'הדפדפן חוסם שמירת נתונים (אולי גלישה בסתר). פתח את האפליקציה בדפדפן רגיל ונסה שוב.',
    'auth/operation-not-supported-in-this-environment': 'הדפדפן הזה לא תומך בהתחברות. פתח את הקישור ב-\u2060Chrome או ב-\u2060Safari.',
    'auth/timeout': 'ההתחברות לקחה יותר מדי זמן. בדוק את החיבור ונסה שוב.',
  };
  const STORAGE_ERRORS = ['UnknownError', 'InvalidStateError', 'QuotaExceededError', 'DataError', 'AbortError'];
  /** A message a person can understand (never raw English from the browser). */
  Cloud.errorText = function (e) {
    if (e && AUTH_ERRORS[e.code]) return AUTH_ERRORS[e.code];
    if (e && STORAGE_ERRORS.includes(e.name)) return 'הדפדפן לא הצליח לשמור את הנתונים. נסה שוב, ואם זה חוזר על עצמו רענן את הדף.';
    if (!navigator.onLine) return AUTH_ERRORS['auth/network-request-failed'];
    const msg = (e && e.message) || String(e || '');
    if (/[\u0590-\u05FF]/.test(msg)) return msg; // already ours, in Hebrew
    return 'משהו השתבש. נסה שוב בעוד רגע.' + (e && (e.code || e.name) ? ` (${e.code || e.name})` : '');
  };

  /**
   * Opens the Google sign-in window. Browsers only allow a window that opens straight from a tap,
   * so when the SDK is already loaded nothing is awaited before the window opens.
   * opts.redirect: the full-page way instead of a window (for browsers that block windows entirely).
   * Resolves with the user, or null when the page is about to navigate away (redirect).
   */
  Cloud.signIn = function (opts) {
    const go = ({ auth, au }) => {
      const provider = new au.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (opts && opts.redirect) return au.signInWithRedirect(auth, provider).then(() => null);
      return au.signInWithPopup(auth, provider).then((cred) => { Cloud.user = cred.user; return cred.user; }, (e) => {
        // no windows at all in this browser: the full-page way (it comes back signed in)
        if (['auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) return au.signInWithRedirect(auth, provider).then(() => null);
        throw e;
      });
    };
    return fb ? go(fb) : load().then(go);
  };

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
  function encode(store, rec) {
    const o = Object.assign({}, rec);
    delete o._syncedAt;
    for (const f of LOCAL_ONLY_FIELDS[store] || []) delete o[f];
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
        for (const st of SYNC) for (const [id, v] of R.stores[st]) if (!v.d && !S[st].some((x) => x.id === id)) pend.push({ store: st, id, at: now });
      }
    } else {
      for (const st of SYNC) {
        const remote = R.stores[st];
        for (const [id, v] of remote) {
          const local = S[st].find((x) => x.id === id);
          if (mode === 'merge' && local && (local.updatedAt || 0) >= v.u) continue;
          if (v.d) { if (local) ops.push({ store: st, del: id }); }
          else ops.push({ store: st, put: decode(st, v, local) });
        }
        if (mode === 'cloud') for (const r of S[st]) if (!remote.has(r.id) || remote.get(r.id).d) ops.push({ store: st, del: r.id });
      }
      if (mode === 'cloud') S.meta.pendingDeletes = [];
      await Store.applyRemote(ops);
      if (R.settings && (mode === 'cloud' || R.settings.u > (S.settings._updatedAt || 0))) await Store.applyRemoteSettings(JSON.parse(R.settings.j), LOCAL_ONLY_SETTINGS);
      else await Store.setMeta({ settingsDirty: true });
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
        throw Object.assign(new Error(`החיבור בוטל. התחבר עם ${prev} כדי שהשינויים יעלו לחשבון שלו.`), { code: 'app/switch-cancelled' });
      }
      await Store.wipe();
    }
    if (S.meta.cloudUid !== user.uid) {
      await Store.forgetSyncState(); // nothing on this phone was ever confirmed by this account
      await initialMerge(user.uid); // needs the network the first time
    }
    await Store.setMeta({ cloudUid: user.uid, cloudEmail: user.email, cloudName: user.displayName || '', cloudPhoto: user.photoURL || '' });
    attach(user.uid);
    Cloud.connected = true;
    await push();
    if (root.Stats) { root.Stats.report(); root.Stats.checkAdmin(); }
    if (root.Support) root.Support.check();
  };

  /* ---------------- live listeners (cloud → phone) ---------------- */
  let incoming = [];
  let flushTimer = null;
  function queueRemote(ops) {
    incoming = incoming.concat(ops);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => { const o = incoming; incoming = []; await Store.applyRemote(o); }, 120);
  }
  function attach(uid) {
    const { fs, db } = fb;
    const onErr = (e) => setStatus('error', e);
    for (const st of SYNC) {
      unsubs.push(fs.onSnapshot(fs.collection(db, 'users', uid, st), (snap) => {
        const ops = [];
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) continue;
          const v = ch.doc.data();
          const id = ch.doc.id;
          const local = S[st].find((x) => x.id === id);
          if (local && (local.updatedAt || 0) >= v.u) continue;
          if (v.d) { if (local) ops.push({ store: st, del: id }); }
          else ops.push({ store: st, put: decode(st, v, local) });
        }
        if (ops.length) queueRemote(ops);
        if (!snap.metadata.fromCache && Cloud.status === 'syncing') setStatus('synced');
      }, onErr));
    }
    unsubs.push(fs.onSnapshot(fs.doc(db, 'users', uid, 'kv', 'settings'), (d) => {
      if (!d.exists() || d.metadata.hasPendingWrites) return;
      const v = d.data();
      if (v.u > (S.settings._updatedAt || 0)) Store.applyRemoteSettings(JSON.parse(v.j), LOCAL_ONLY_SETTINGS);
    }, onErr));
    unsubs.push(fs.onSnapshot(fs.doc(db, 'users', uid, 'kv', 'active'), (d) => {
      if (!d.exists() || d.metadata.hasPendingWrites) return;
      const v = d.data();
      if (v.u > (S.meta.activeUpdatedAt || 0)) Store.applyRemoteActive(v.j ? JSON.parse(v.j) : null, v.u);
    }, onErr));
  }
  function detach() { unsubs.forEach((f) => f()); unsubs = []; Cloud.connected = false; }

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
      const writes = []; // [key, version, ref, data, onConfirmed]
      for (const { store, rec } of Store.dirtyRecords()) {
        const at = rec.updatedAt;
        writes.push([store + '/' + rec.id, at, userDoc(store, rec.id), encode(store, rec), () => acked.items.push({ store, id: rec.id, at })]);
      }
      for (const d of S.meta.pendingDeletes || []) writes.push([d.store + '/' + d.id, 'del' + d.at, userDoc(d.store, d.id), { u: d.at, d: true, j: null }, () => acked.dels.push(d)]);
      if (S.meta.settingsDirty) { const u = S.settings._updatedAt; writes.push(['kv/settings', u, userDoc('kv', 'settings'), encodeSettings(), () => { acked.settingsU = u; }]); }
      if (S.meta.activeDirty) { const u = S.meta.activeUpdatedAt; writes.push(['kv/active', u, userDoc('kv', 'active'), encodeActive(), () => { acked.activeU = u; }]); }
      const fresh = writes.filter(([key, ver]) => inflight.get(key) !== ver);
      if (fresh.length) {
        fs.setDoc(fs.doc(db, 'users', Cloud.user.uid), { email: Cloud.user.email || '', updatedAt: Date.now(), schema: Store.SCHEMA_VERSION, app: root.APP_VERSION }).catch(() => {});
        // One write per document: Firestore also keeps them in its own IndexedDB until the server confirms.
        // The security rules refuse a write that is older than what the server has (a phone that was
        // offline must not overwrite a newer change from another phone); onRejected settles it.
        for (const [key, ver, ref, data, onConfirmed] of fresh) {
          inflight.set(key, ver);
          fs.setDoc(ref, data)
            .then(() => { onConfirmed(); clearTimeout(ackTimer); ackTimer = setTimeout(flushAcks, 0); }, (e) => onRejected(ref, e))
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
  /** The server refused a write. If the cloud holds a newer version, take it; otherwise keep ours dirty. */
  async function onRejected(ref, e) {
    const { fs } = fb;
    const parts = ref.path.split('/'); // users/{uid}/{store}/{id}
    const store = parts[2], id = parts[3];
    try {
      const snap = await fs.getDocFromServer(ref);
      const v = snap.exists() ? snap.data() : null;
      if (store === 'kv') {
        if (v && id === 'settings' && v.u > (S.settings._updatedAt || 0)) return Store.applyRemoteSettings(JSON.parse(v.j), LOCAL_ONLY_SETTINGS);
        if (v && id === 'active' && v.u > (S.meta.activeUpdatedAt || 0)) return Store.applyRemoteActive(v.j ? JSON.parse(v.j) : null, v.u);
      } else if (SYNC.includes(store)) {
        const local = S[store].find((x) => x.id === id);
        if (v && (!local || (local.updatedAt || 0) < v.u)) {
          return Store.applyRemote([v.d ? { store, del: id } : { store, put: decode(store, v, local) }]);
        }
        if (local) { delete local._syncedAt; await Store.saveAll(); }
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
    if (ev.type === 'restore') { Cloud.afterRestore(ev.mode); return; }
    if (ev.type === 'data' || ev.type === 'settings' || ev.type === 'active') Cloud.schedulePush(ev.type === 'active' ? 200 : 1500);
  });
  window.addEventListener('online', () => { if (Cloud.user && Cloud.connected) Cloud.schedulePush(300); });
  window.addEventListener('offline', () => { if (Cloud.user) setStatus('offline'); });

  /** After restoring a backup: make the cloud match this device. */
  Cloud.afterRestore = async function (mode) {
    if (mode === 'replace') {
      await Store.touchAll();
      try {
        const R = await fetchAll(Cloud.user.uid);
        const pend = S.meta.pendingDeletes || (S.meta.pendingDeletes = []);
        const now = Date.now();
        for (const st of SYNC) for (const [id, v] of R.stores[st]) if (!v.d && !S[st].some((x) => x.id === id)) pend.push({ store: st, id, at: now });
        await Store.setMeta({ pendingDeletes: pend });
      } catch (e) { /* offline: the restored records still win by timestamp */ }
    }
    await push();
  };

  /* ---------------- sign out / delete ---------------- */
  /** Sign out and clear this device. Returns false if the user cancelled. */
  Cloud.signOut = async function () {
    if (fb && Cloud.user) {
      await push();
      try { await Promise.race([fb.fs.waitForPendingWrites(fb.db), sleep(8000).then(() => { throw new Error('timeout'); })]); }
      catch (e) {
        const ok = await UI.confirm('יש שינויים שעוד לא עלו לענן', 'כנראה אין חיבור לאינטרנט. אם תתנתק עכשיו, השינויים האחרונים מהטלפון הזה יאבדו.', 'התנתק בכל זאת', true);
        if (!ok) return false;
      }
    }
    await shutdown();
    return true;
  };
  async function shutdown() {
    detach();
    if (fb) {
      try { await fb.au.signOut(fb.auth); } catch (e) { /* ignore */ }
      try { await fb.fs.terminate(fb.db); await fb.fs.clearIndexedDbPersistence(fb.db); } catch (e) { /* ignore */ }
    }
    await Store.wipe();
  }
  /** Permanently delete everything stored for this user in the cloud, delete the sign-in account
   *  itself (required by Google Play's account-deletion policy), then clear this device. */
  Cloud.deleteAccountData = async function () {
    const { fs, db, au, auth } = await load();
    const user = auth.currentUser || Cloud.user;
    const uid = user.uid;
    // Google requires a recent sign-in to delete an account. Confirm it now, while the tap that
    // started the deletion still counts as a user gesture (otherwise the popup gets blocked).
    const last = Date.parse((user.metadata && user.metadata.lastSignInTime) || '') || 0;
    // (an account from before email sign-in has no list here: it signed in with Google)
    const pd = user.providerData || [];
    const viaGoogle = !pd.length || pd.some((x) => x && x.providerId === 'google.com');
    if (user.delete && viaGoogle && Date.now() - last > 4 * 60 * 1000) await au.reauthenticateWithPopup(user, new au.GoogleAuthProvider());
    detach();
    if (root.Stats) await root.Stats.forget();
    if (root.Support) await root.Support.forget();
    if (root.Champions) await root.Champions.forget();
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
    await shutdown();
  };

  Cloud.statusText = function () {
    const st = Cloud.status;
    if (!Cloud.user) return 'לא מחובר';
    if (st === 'synced') return 'מסונכרן' + (S.meta.lastSync ? ' · ' + UI.timeAgo(S.meta.lastSync) : '');
    if (st === 'syncing') return 'מסנכרן…';
    if (st === 'offline') return 'אין חיבור — יסונכרן כשתחזור הרשת';
    if (st === 'error') return 'שגיאת סנכרון: ' + Cloud.errorText(Cloud.error);
    return 'מחובר';
  };
})(typeof window !== 'undefined' ? window : globalThis);
