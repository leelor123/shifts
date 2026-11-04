/* ============================================================
 * intro.js — the opening, about one second, like a bank app's (the user, 2026-11-02). It starts exactly as the
 * phone's own splash ends (navy, the logo in the middle); the logo glides up into the header while the sky of the
 * hour fades in behind it (sky.js: the time of day, the season, the weather and the city), the greeting comes, and a
 * sheet rises from below. A new user's first screen (the welcome screen, or the sign-in) has the same header and
 * sheet in the same places, so the show hands over to it unseen and its choices come in; for a returning user the
 * sheet goes on up and the home screen is there. It doubles as the loading indicator: if the app needs more time,
 * the sheet's handle shimmers. Tap to skip. Short version (the splash, then it goes) on later opens in the same
 * session, after the app was opened from a shortcut, or with effects off / reduced motion. Markup in index.html.
 * A returning user's first open in a session stops there, with quick actions on the sheet (views-quick.js: start a
 * shift, log one, the month, the calendar, "כניסה"); the show leaves when one is used. No sound (the user, 2 Nov).
 *
 * Details that matter:
 *  - every moving part is a transform or opacity (the compositor plays them while the app starts up underneath).
 * ============================================================ */
(function (root) {
  'use strict';
  const Fx = root.Fx, Sky = root.Sky;
  const el = document.getElementById('intro');
  if (!el) return;
  // a first visit (no language chosen and nothing of the app kept in this browser, index.html's lp-bare): the language
  // doors are the first screen, drawn with the first frame and hidden by nothing (the show over them waited for the
  // whole app's code to arrive: about two seconds of a still logo on a phone). It counts as the session's open like any
  // other (a reload later in this session, say for a new version, gets the short opening, not the quick actions); the
  // app knows no show is there (root.Intro stays empty)
  if (document.documentElement.classList.contains('lp-bare')) {
    try { sessionStorage.setItem('introSeen', '1'); } catch (e) { /* ignore */ }
    el.remove();
    return;
  }
  const Intro = {};
  root.Intro = Intro;
  const started = performance.now();
  let ready = false, played = false, closed = false, leaving = false, skipped = false, quickOn = false;
  // The show stays until the app has finished starting, so nothing it does is seen loading: the first screen
  // settles under it for a moment, and the start-up work that can still change that screen (the account, the
  // admin check, Google Play, the fonts) is waited for, within a limit.
  const CALM_MS = 450; // the first screen sits under the show at least this long
  const SKIP_CALM_MS = 250; // ... or this long after a tap to skip
  const HOLD_MAX = 2500; // the most the show waits for start-up work after it could have left
  let drawnAt = 0, holdUntil = 0, recheck = 0;
  const holds = new Set();
  const leaveFns = [];

  let seen = false;
  try { seen = sessionStorage.getItem('introSeen') === '1'; sessionStorage.setItem('introSeen', '1'); } catch (e) { /* ignore */ }
  const fromShortcut = /[?&]action=/.test(location.search);
  const full = !seen && !fromShortcut && Fx.motion();
  const SEQUENCE_MS = 980; // the logo up (.32–.94 s), the sheet up (.40–.96 s)

  // which screen comes first (kept by the app in a small copy, the database is not open yet): the language doors on
  // the very first open, the home screen for a returning user, otherwise the welcome or the sign-in
  const P = Sky ? Sky.prefs() : {};
  const doors = document.documentElement.classList.contains('lp-first');
  const mode = doors ? 'doors' : P.mode === 'home' || P.mode === 'lock' ? P.mode : 'welcome';
  Intro.mode = mode;
  Intro.full = full; // false: the splash only (the screen under it brings its own sky and sheet in)
  // a returning user's first open in a session (not from a shortcut): the show waits on its sheet with the quick
  // actions, with or without its motion (reduced motion: the same screen, still)
  const quick = mode === 'home' && !seen && !fromShortcut;
  Intro.quick = quick;
  // the scene: the screen under the show draws the very same one
  const now = Date.now();
  Intro.scene = { now, place: P.place, weather: Sky ? Sky.weatherNow(P) : 'clear' };
  const q = (s) => el.querySelector(s);
  try {
    if (Sky) q('.sh-hello').textContent = Sky.greeting(now);
    // a returning user (home, or the lock screen) is greeted by name, with the date; a new one sees the app's promise
    const first = (mode === 'home' || mode === 'lock') && Sky ? Sky.firstName(P.name) : '';
    if (mode === 'home' || mode === 'lock') {
      if (first) q('.sh-title').textContent = first;
      q('.sh-sub').textContent = Sky ? Sky.dateLine(now) : '';
    } else q('.sh-sub').textContent = 'כמה מגיע לך על כל שעה';
    if ((full || quick) && Sky) q('.skyhead').dataset.phase = Sky.render(q('.sky'), Intro.scene).phase;
  } catch (e) { console.warn('intro', e); }
  el.classList.add(mode);
  if (quick) el.classList.add('q-mode'); // not 'quick': the home screen's shortcuts own that class (.quick button)

  function close() {
    if (closed) return;
    closed = true;
    leaveFns.splice(0).forEach((fn) => { try { fn(); } catch (e) { console.warn('intro', e); } });
    el.classList.add('out');
    setTimeout(() => { el.remove(); if (root.App && root.App.applyTheme) root.App.applyTheme(); }, mode === 'home' && full ? 620 : 320);
  }
  function maybeClose() {
    if (closed || leaving || !ready || !played || quickOn) return;
    const t = performance.now();
    let wait = drawnAt + (skipped ? SKIP_CALM_MS : CALM_MS) - t;
    if (wait <= 0 && holds.size) {
      if (!holdUntil) holdUntil = t + HOLD_MAX;
      wait = holdUntil - t;
    }
    if (wait > 0) {
      el.classList.add('wait'); // the sheet's handle shimmers, as while loading
      clearTimeout(recheck);
      recheck = setTimeout(maybeClose, Math.min(wait, 250) + 5);
      return;
    }
    // the quick actions, when the app drew them (a step that owns the screen, like new terms, draws none: the show goes)
    if (quick && q('.intro-sheet .iq')) { showQuick(); return; }
    leave();
  }
  function showQuick() {
    if (quickOn) return;
    quickOn = true;
    clearTimeout(recheck);
    el.classList.remove('wait');
    el.classList.add('q-on');
    el.removeAttribute('aria-hidden');
    q('.intro-sheet .iq').inert = false;
    const sh = q('.intro-sheet');
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-modal', 'true');
    sh.setAttribute('aria-label', 'פעולות מהירות');
  }
  // the quick actions ride up with the sheet: on as the sheet starts to rise (or the moment they are drawn, if later),
  // not after the show's end and the calm a home screen under it needs. Waiting left the sheet still and empty for a
  // third of a second (the user, 2 Nov: "a stuck frame"). The fonts first, so no word changes as they come.
  let rising = false, fontsIn = !document.fonts || document.fonts.status === 'loaded';
  if (!fontsIn) document.fonts.ready.then(() => { fontsIn = true; maybeQuick(); });
  function maybeQuick() {
    const iq = q('.intro-sheet .iq');
    if (quick && rising && fontsIn && iq && iq.childElementCount && !closed && !leaving) showQuick();
  }
  /** views-quick.js has drawn the actions on the sheet. */
  Intro.quickDrawn = maybeQuick;
  /** From the quick actions into the app: the sheet goes up over the header (as the show leaves), then fn runs. */
  Intro.enter = function (fn) {
    if (!closed && !leaving) { el.classList.add('q-go'); leave(); }
    if (fn) Intro.after(fn, 0);
  };
  /** The last look: the app draws itself once more under the show (anything that changed while it waited
   * lands unseen), then the show goes once that has been painted. */
  function leave() {
    leaving = true;
    clearTimeout(recheck);
    try { if (Intro.beforeLeave) Intro.beforeLeave(); } catch (e) { console.warn('intro', e); }
    leaveFns.splice(0).forEach((fn) => { try { fn(); } catch (e) { console.warn('intro', e); } });
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(close, 40)));
  }
  /** Start-up work the show waits for (within HOLD_MAX) before it leaves. */
  Intro.hold = function (p) {
    if (closed || leaving || !p || typeof p.then !== 'function') return;
    const h = Promise.resolve(p).catch(() => {}).then(() => { holds.delete(h); maybeClose(); });
    holds.add(h);
  };
  /** fn runs as the show starts to leave (at once when it has gone): the screen under it brings its content in. */
  Intro.onLeave = function (fn) { if (closed || leaving || !document.getElementById('intro')) fn(); else leaveFns.push(fn); };
  /** true while the show still covers the screen */
  Intro.covering = () => !closed && !leaving && !!document.getElementById('intro');


  // the app's heavy start-up waits for the show to have started (its first frames are drawn): from then on it runs on
  // the compositor, but a start-up that held the main thread before the first frame left it standing still
  let drawnDone = null;
  const drawn = new Promise((r) => { drawnDone = r; });
  /** Resolves once the show is under way. */
  Intro.drawn = () => drawn;
  const afterFrames = () => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(drawnDone, 0)));

  let begun = false;
  function begin() {
    if (begun) return;
    begun = true;
    if (full) {
      el.classList.add('play');
      afterFrames();
      setTimeout(() => drawnDone(), 400); // never later than this, whatever happens to the frames
      setTimeout(() => { played = true; if (!ready && !quickOn) el.classList.add('wait'); maybeClose(); }, SEQUENCE_MS);
      // the sheet's rise begins (its animation's delay is over; the timer if no event comes)
      const sheetGoes = () => { if (rising) return; rising = true; maybeQuick(); };
      const sheet = q('.intro-sheet');
      if (sheet) sheet.addEventListener('animationstart', (e) => { if (e.target === sheet) sheetGoes(); });
      setTimeout(sheetGoes, 450);
    } else {
      el.classList.add('still');
      drawnDone();
      rising = true; // the sheet is already in place
      setTimeout(() => { played = true; maybeClose(); }, 200);
    }
  }

  /* A browser visit on a slow network (the user, 24 Oct: the website's button opened an old version): the service
   * worker opened the copy kept here while the server's answer was still on its way (sw.js keepLive). The show stays
   * on its first frame (the splash, the phone's own) until that answer, a second at most (often it is in already: this
   * code arrives after the first frame), and once the server has said a newer version is live, a moment more for its
   * code. The newer version opens in this page's place with the very same first frame, so nothing is seen to change;
   * else the show plays on. The installed app (?source=) and offline (answered at once) never wait. The start-up work
   * waits too (Intro.drawn). */
  const ASK_MAX = 1000;
  const ASK_CODE = 1500; // after 'found': the new version's code on its way
  const ASK_REPLY = 150; // a worker that does not know the question (an older one) is not waited for
  function askFirst() {
    const sw = navigator.serviceWorker;
    if (!sw || !sw.controller || /[?&]source=/.test(location.search) || typeof MessageChannel === 'undefined') { begin(); return; }
    const ch = new MessageChannel();
    let timer = 0;
    const go = () => { clearTimeout(timer); ch.port1.onmessage = null; begin(); };
    ch.port1.onmessage = (e) => {
      const d = e.data;
      if (begun) return;
      if (d === 'asking' || d === 'found') { clearTimeout(timer); timer = setTimeout(go, d === 'found' ? ASK_CODE : ASK_MAX); return; }
      if (d && d.live) {
        // the next load is this session's open again: the full show, with the quick actions
        try { if (!seen) sessionStorage.removeItem('introSeen'); } catch (err) { /* ignore */ }
        clearTimeout(timer);
        location.reload();
        return;
      }
      go();
    };
    timer = setTimeout(go, ASK_REPLY);
    try { sw.controller.postMessage('asking?', [ch.port2]); } catch (err) { go(); }
  }
  askFirst();

  // tap to skip: the show jumps to its end (the sky keeps its slow life); not once the quick actions are on
  el.addEventListener('click', (e) => {
    if (quickOn || (e.target.closest && e.target.closest('.iq'))) return;
    begin(); // a tap while it waits for the server: no more waiting
    played = true; skipped = true;
    drawnDone();
    try { el.getAnimations({ subtree: true }).forEach((a) => { const t = a.effect && a.effect.getComputedTiming(); if (t && t.iterations !== Infinity && a.playState !== 'finished') a.finish(); }); } catch (e) { /* older browsers: it plays on */ }
    if (ready) maybeClose(); else el.classList.add('wait');
  });

  /** Called once the first screen (app, sign-in, terms or setup) has been drawn behind the intro. */
  Intro.ready = function () {
    if (ready) return;
    ready = true;
    maybeClose();
  };
  // the first screen replaces the "loading" placeholder inside #view; the show leaves once that screen has been
  // painted (two frames) and has had a moment to settle, so it never uncovers a screen still being drawn
  const view = document.getElementById('view');
  if (view) {
    const mo = new MutationObserver(() => {
      mo.disconnect();
      drawnAt = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(Intro.ready, 60)));
    });
    mo.observe(view, { childList: true, subtree: true });
  }
  /** Runs fn once the show has gone (at once when there is none): for things that open over the app. */
  Intro.after = function (fn, delay) {
    const wait = () => (document.getElementById('intro') ? setTimeout(wait, 150) : setTimeout(fn, delay || 0));
    wait();
  };
  // never hold the app hostage
  setTimeout(() => { if (quickOn) return; ready = true; played = true; close(); }, 9000);
  Intro.elapsed = () => performance.now() - started;
})(typeof window !== 'undefined' ? window : globalThis);
