/* ============================================================
 * errors.js — error reports from users' phones, for the admin dashboard.
 *
 * Part of the usage statistics: a report goes out only when the user said
 * yes to them (Stats.enabled(), the same answer, no new question) and
 * accepted the privacy policy that describes it. A report holds the app
 * version, the language, the system and the browser with their main
 * versions (Support.device, as the support form sends them, never the
 * phone's model), the screen (tab), the kind of failure, the error
 * message and a short stack with every address cut to its file name.
 * No shifts, amounts, names, email, user id or anything the user typed:
 * quoted text, long numbers, email addresses, long tokens and letters
 * outside Latin are taken out of the message before it is kept.
 *
 * Not reported (they are not app bugs, and would use up the day's 5): no
 * connection (Firebase offline or unavailable, a failed fetch or script
 * download; the app shows its own message), and errors whose top frame is
 * not in the app's own files (extensions, injected scripts, no stack).
 *
 * The same error (message + top frame, hashed) is counted, not sent again:
 * one report per error a day, with how many times it happened. At most 5
 * reports a day per device. Reports wait in localStorage while the phone
 * is offline or signed out, and only when the answer is yes; with no yes
 * they are never written anywhere. Rules: errors/{id}, create only, read
 * by admins only (firestore.rules validErr).
 *
 * The same report (and only it) also goes to Sentry, EU region, from the
 * live app, without an SDK and without the phone's IP address (below,
 * "Sentry"): grouping, email alerts and the owner's debugging tools. The
 * privacy policy (views-legal.js) names it.
 * ============================================================ */
(function (root) {
  'use strict';
  const Errors = {};
  root.Errors = Errors;

  const KEY = 'shaati-errq';
  const PER_DAY = 5;
  const QUEUE_MAX = 10;
  const KINDS = ['error', 'promise', 'render', 'mount'];

  /* ---------------- what a report may hold ---------------- */
  /** An address cut to its file name, with no query or hash ("https://x/shifts/app.123.js?v=2" → "app.123.js"). */
  function fileOf(u) {
    const s = String(u || '').split(/[?#]/)[0];
    if (/^[a-z][a-z0-9+.-]*:\/\/.*\/$/i.test(s)) return 'page'; // the page itself ("https://x/shifts/")
    const parts = s.split('/').filter(Boolean);
    const last = parts.length ? parts[parts.length - 1] : '';
    return (/^[a-z][a-z0-9+.-]*:$/i.test(last) || !last ? 'page' : last).slice(0, 60);
  }
  /** The error message without anything that could be the user's: addresses become file names; quoted text,
   *  email addresses, long tokens (ids), numbers of 3 digits or more (amounts, dates) and non-Latin letters
   *  (names typed in Hebrew, Arabic, Russian or Amharic) are replaced. */
  function clean(msg) {
    // control characters and the direction marks and overrides (U+202A to U+202E, U+2066 to U+2069), as code points
    let s = String(msg == null ? '' : msg).replace(/[\x00-\x1f\x7f]|\p{Bidi_Control}/gu, ' ');
    s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'")]+/gi, (u) => fileOf(u))
      .replace(/[^\s@'"<>()]+@[^\s@'"<>()]+\.[^\s@'"<>()]+/g, '[email]')
      .replace(/"[^"]*"/g, '"_"')
      .replace(/'([^']*)'/g, (m, w) => (/^[A-Za-z_$][\w$.]{0,40}$/.test(w) ? m : "'_'"))
      .replace(/[A-Za-z0-9_-]{20,}/g, '_')
      .replace(/\d{3,}/g, '#')
      .replace(/[^\x20-\x7e]+(?:\s+[^\x20-\x7e]+)*/g, '_')
      .replace(/\s+/g, ' ').trim();
    return (s || 'unknown').slice(0, 200);
  }
  /** The top 5 frames of a stack as "function@file:line:col" (Chrome, Firefox and Safari forms). */
  function frames(stack) {
    const out = [];
    for (const line of String(stack || '').split('\n')) {
      const loc = /([^\s()@]*):(\d+):(\d+)\)?\s*$/.exec(line);
      if (!loc) continue;
      const fm = /^\s*at\s+(?:async\s+)?([^\s(]+)\s+\(/.exec(line) || /^\s*([^@\s]*)@/.exec(line);
      const fn = ((fm && fm[1]) || '').replace(/[^\w$.<>]/g, '').slice(0, 40);
      out.push((fn ? fn + '@' : '') + fileOf(loc[1]) + ':' + loc[2].slice(0, 7) + ':' + loc[3].slice(0, 7));
      if (out.length >= 5) break;
    }
    return out;
  }
  /** FNV-1a, 32 bits, as 8 hex digits: the same error gets the same hash on every phone. */
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function device() {
    const d = root.Support && root.Support.device ? root.Support.device() : 'other · other';
    const [os, br] = String(d).split(' · ');
    return { os: (os || 'other').slice(0, 24), br: (br || 'other').slice(0, 32) };
  }
  function randomId(n) {
    const b = new Uint8Array(n || 12);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(b);
    else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    return Array.from(b, (x) => ('0' + x.toString(16)).slice(-2)).join('');
  }
  /** The report for one error (t is set when it is sent). */
  function build(err, kind, extra) {
    const e = err || {};
    const msg = clean(typeof e === 'object' ? (e.name && e.message ? e.name + ': ' + e.message : e.message || (extra && extra.message) || String(e)) : e);
    let fr = frames(e && e.stack);
    if (!fr.length && extra && extra.filename) fr = [fileOf(extra.filename) + ':' + (+extra.lineno || 0) + ':' + (+extra.colno || 0)];
    const App = root.App || {};
    const tab = String(App.tab || '').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 24);
    const lang = String((root.U && root.U.LANG) || 'he');
    return Object.assign({
      v: String(root.APP_VERSION || '').slice(0, 20),
      l: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'am'].includes(lang) ? lang : 'he',
      tab, k: KINDS.includes(kind) ? kind : 'error', msg, st: fr.join('\n').slice(0, 600),
      h: hash(msg + '|' + (fr[0] || '')), n: 1,
    }, device());
  }

  /* ---------------- what is not an app bug ---------------- */
  // the app's own files: the code (app.<lang>.<build>.js), the pages, the service worker
  const OWN = /^(app\.[a-z]{2}\.[0-9a-f]+\.js|index(\.[a-z]{2})?\.html|sw\.js|page)$/;
  // no connection: the app already says so on screen (Firebase offline, a fetch or a downloaded script that failed)
  const NET = /client is offline|code=unavailable|\bunavailable\b|network-request-failed|Failed to fetch|Load failed|NetworkError|network error|Importing a module script failed|dynamically imported module|ChunkLoadError|Loading chunk/i;
  /** true for a report that is not an app bug: a network failure, or an error whose top frame is not in the app's own
   *  files (a browser extension, an injected script, a muted "Script error." with no stack). */
  function noise(r, err) {
    const code = err && typeof err === 'object' && typeof err.code === 'string' ? err.code : '';
    if (NET.test(r.msg) || /(^|\/)(unavailable|network-request-failed)$/.test(code)) return true;
    const top = r.st.split('\n')[0] || '';
    if (!top) return true;
    const file = top.replace(/^[^@]*@/, '').replace(/:\d+:\d+$/, '');
    return !OWN.test(file);
  }

  /* ---------------- consent and the queue ---------------- */
  const S = () => (root.Store && root.Store.S) || {};
  /** yes: the user agreed to statistics; no: they answered no; null: not known yet (the settings are not loaded). */
  function consent() {
    try {
      const s = S().settings;
      if (!s) return null;
      if (root.Stats && root.Stats.enabled()) return true;
      return s.statsAsked === true ? false : null;
    } catch (e) { return null; }
  }
  const today = () => { try { return root.U.todayKey(); } catch (e) { return new Date().toISOString().slice(0, 10); } };
  // d: the day; c: reports sent that day; s: the hashes sent that day; q: waiting; k: counted after their report went
  let mem = null;
  function fresh() { return { d: today(), c: 0, s: [], q: [], k: {} }; }
  function load() {
    if (!mem) {
      try { mem = JSON.parse(root.localStorage.getItem(KEY) || 'null'); } catch (e) { mem = null; }
      if (!mem || typeof mem !== 'object' || !Array.isArray(mem.q)) mem = fresh();
    }
    if (mem.d !== today()) {
      // a new day: what happened again after its report went out is sent once more, with its count
      const carry = Object.values(mem.k || {});
      mem = Object.assign(fresh(), { q: mem.q.slice(0, QUEUE_MAX) });
      for (const r of carry) add(r);
    }
    return mem;
  }
  function save() {
    // only with a yes: with no answer the reports stay in memory, and with a no nothing is kept at all
    try {
      if (consent() === true) root.localStorage.setItem(KEY, JSON.stringify(mem));
      else root.localStorage.removeItem(KEY);
    } catch (e) { /* storage may be blocked */ }
  }
  function add(r) {
    const m = mem;
    const waiting = m.q.find((x) => x.h === r.h);
    if (waiting) { waiting.n = Math.min(1000, waiting.n + (r.n || 1)); return; }
    if (m.s.includes(r.h)) {
      const kept = m.k[r.h];
      if (kept) kept.n = Math.min(1000, kept.n + (r.n || 1));
      else if (Object.keys(m.k).length < QUEUE_MAX) m.k[r.h] = Object.assign({}, r, { id: randomId() });
      return;
    }
    if (m.q.length < QUEUE_MAX) m.q.push(Object.assign({ id: randomId() }, r));
  }

  let busy = false, timer = null;
  /** Keep one error (counted with the same one if it is already waiting) and send soon. */
  Errors.capture = function (err, kind, extra) {
    try {
      if (consent() === false) { mem = null; save(); return; }
      const r = build(err, kind, extra);
      if (/^(Script error\.?|ResizeObserver loop.*)$/.test(r.msg) || noise(r, err)) return; // not an app bug
      load();
      add(r);
      save();
      clearTimeout(timer);
      timer = setTimeout(() => Errors.flush(), 4000); // a burst of the same error is counted before it goes out
    } catch (e) { /* reporting never breaks the app */ }
  };
  /* ---------------- Sentry: the same cleaned report, for grouping, alerts and the owner's tools ---------------- */
  // Sentry's EU region (Frankfurt). The report above and nothing else goes, written by hand as one envelope: no SDK
  // (nothing more to download, no automatic breadcrumbs, page addresses, cookies or user details). infer_ip 'never'
  // keeps Sentry from storing the phone's IP address; no referrer, no credentials. Only the live app sends: local
  // runs and the QA suites never do (Errors._sentryForce turns it on for a test).
  const SENTRY = { host: 'o4512402257608704.ingest.de.sentry.io', project: '4512402298765392', key: 'd620d3f70e1cbf643edaadf3cd7859f6' };
  function sentryOn() {
    if (Errors._sentryForce) return true;
    const h = String((root.location && root.location.hostname) || '');
    return /(^|\.)(github\.io|web\.app|firebaseapp\.com)$/.test(h);
  }
  /** The Sentry event for one report: the error as type and message, its frames (oldest first, as Sentry wants), the
   *  report's hash as the fingerprint (the same grouping as the admin screen), and the version as the release. */
  function sentryEvent(r, id) {
    const m = /^([A-Za-z_$][\w$]*):\s*([\s\S]*)$/.exec(r.msg || '');
    const frames = String(r.st || '').split('\n').filter(Boolean).map((f) => {
      const x = /^(?:([^@]*)@)?(.*?):(\d+):(\d+)$/.exec(f);
      return x ? { function: x[1] || '?', filename: x[2], lineno: +x[3], colno: +x[4], in_app: true } : { filename: f, in_app: true };
    }).reverse();
    const ex = { type: m ? m[1] : 'Error', value: m ? m[2] : (r.msg || 'unknown') };
    if (frames.length) ex.stacktrace = { frames };
    return {
      event_id: id, timestamp: Date.now() / 1000, platform: 'javascript', level: 'error',
      release: 'shaati@' + (r.v || 'unknown'), environment: 'production',
      tags: { lang: r.l, tab: r.tab || 'none', kind: r.k, os: r.os, browser: r.br },
      extra: { times_today: r.n },
      fingerprint: [r.h],
      // an empty place: without it Sentry looks up a city from the connection (tested 9 Nov 2026: "Tel Aviv" with no
      // user at all); with it, no place and no user are kept
      user: { geo: {} },
      exception: { values: [ex] },
      sdk: { name: 'shaati.errors', version: '1.0.0', settings: { infer_ip: 'never' } },
    };
  }
  function sentryBody(r, id) {
    return JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }) + '\n'
      + JSON.stringify({ type: 'event' }) + '\n' + JSON.stringify(sentryEvent(r, id)) + '\n';
  }
  /** true when Sentry has the report (or said no for good, or sending is off here); false: try again later. */
  async function toSentry(r) {
    if (!sentryOn() || typeof root.fetch !== 'function') return true;
    let t = null;
    try {
      const id = randomId(16);
      const url = 'https://' + SENTRY.host + '/api/' + SENTRY.project + '/envelope/?sentry_version=7&sentry_key=' + SENTRY.key + '&sentry_client=shaati.errors%2F1.0.0';
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      t = setTimeout(() => { if (ctl) ctl.abort(); }, 10000);
      // text/plain: a simple request, with no CORS preflight
      const res = await root.fetch(url, { method: 'POST', body: sentryBody(r, id), headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined });
      return res.ok || (res.status >= 400 && res.status < 500); // a refusal or a full quota is final, never retried
    } catch (e) { return false; } // offline: the report waits in the queue
    finally { clearTimeout(t); }
  }

  /** Send what waits, within today's 5, when the answer is yes and the phone is online: to Sentry (live app), and to
   *  the admin screen (Firestore) when the user is signed in. A report goes to Sentry once (r.sz), even when it then
   *  waits for Firestore. */
  Errors.flush = async function () {
    if (busy) return 0;
    const c = consent();
    if (c === false) { mem = null; save(); return 0; }
    if (c !== true) return 0;
    const App = root.App || {};
    if (App.legalAccepted && !App.legalAccepted()) return 0;
    const Cloud = root.Cloud;
    if (root.navigator && root.navigator.onLine === false) return 0;
    const signed = !!(Cloud && Cloud.user);
    if (!signed && !sentryOn()) return 0;
    busy = true;
    let sent = 0;
    try {
      const m = load();
      if (!m.q.length || m.c >= PER_DAY) return 0;
      const sdk = signed ? await Cloud.sdk() : null;
      while (m.q.length && m.c < PER_DAY) {
        const r = m.q[0];
        if (!r.sz && sentryOn()) {
          if (!(await toSentry(r))) break;
          r.sz = 1;
          save();
        }
        if (sdk) {
          const { fs, db } = sdk;
          const doc = { v: r.v, l: r.l, os: r.os, br: r.br, tab: r.tab, k: r.k, msg: r.msg, st: r.st, h: r.h, n: r.n, t: Date.now() };
          try {
            await Promise.race([fs.setDoc(fs.doc(db, 'errors', r.id), doc), new Promise((res, rej) => setTimeout(() => rej(new Error('timeout')), 15000))]);
          } catch (e) {
            // refused (a report the rules do not take, or one that already went): dropped; anything else waits
            if (e && e.code === 'permission-denied') { m.q.shift(); save(); continue; }
            break;
          }
        }
        m.q.shift();
        m.c++;
        if (!m.s.includes(r.h)) m.s.push(r.h);
        sent++;
        save();
      }
    } catch (e) { /* offline or the SDK did not load: the queue waits */ }
    finally { busy = false; }
    return sent;
  };
  /** For the admin dashboard and tests. */
  Errors._clean = clean;
  Errors._frames = frames;
  Errors._hash = hash;
  Errors._build = build;
  Errors._noise = noise;
  Errors._sentryEvent = sentryEvent;
  Errors._sentryBody = sentryBody;
  Errors._sentryOn = sentryOn;
  Errors._state = () => mem;
  Errors._reset = () => { mem = null; busy = false; clearTimeout(timer); };

  /* ---------------- listening ---------------- */
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('error', (e) => {
      if (!e || e.target && e.target !== root && e.target.tagName) return; // a picture or script that did not load
      Errors.capture(e.error || e.message, 'error', { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno });
    });
    // app.js already quiets the storage hiccups it handles (preventDefault); those are not reported
    root.addEventListener('unhandledrejection', (e) => { if (e && !e.defaultPrevented) Errors.capture(e.reason, 'promise'); });
    root.addEventListener('online', () => { Errors.flush(); });
    // reports kept from an earlier visit go out once the app has loaded and signed in
    setTimeout(() => { Errors.flush(); }, 20000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
