/* ============================================================
 * intro.js — the opening, about one second, like a bank app's (the user, 2026-11-02). It starts exactly as the
 * phone's own splash ends (navy, the logo in the middle); the logo glides up into the header while the sky of the
 * hour fades in behind it (sky.js: the time of day, the season, the weather and the city), the greeting comes, and a
 * sheet rises from below. A new user's first screen (the welcome screen, or the sign-in) has the same header and
 * sheet in the same places, so the show hands over to it unseen and its choices come in; for a returning user the
 * sheet goes on up and the home screen is there. It doubles as the loading indicator: if the app needs more time,
 * the sheet's handle shimmers. Tap to skip. Short version (the splash, then it goes) on later opens in the same
 * session, after the app was opened from a shortcut, or with effects off / reduced motion. Markup in index.html.
 *
 * Details that matter:
 *  - every moving part is a transform or opacity (the compositor plays them while the app starts up underneath);
 *  - the sound is scheduled at once on the audio clock, in step with the show, so a busy start-up never makes it late;
 *    only if the phone already allows sound (installed apps usually do), never a late surprise.
 * ============================================================ */
(function (root) {
  'use strict';
  const Fx = root.Fx, Sky = root.Sky;
  const el = document.getElementById('intro');
  if (!el) return;
  const Intro = {};
  root.Intro = Intro;
  const started = performance.now();
  let ready = false, played = false, closed = false, leaving = false, master = null, skipped = false;
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
    } else q('.sh-sub').textContent = 'כמה מגיע לך, עד השקל';
    if (full && Sky) Sky.render(q('.sky'), Intro.scene);
  } catch (e) { console.warn('intro', e); }
  el.classList.add(mode);

  function close() {
    if (closed) return;
    closed = true;
    leaveFns.splice(0).forEach((fn) => { try { fn(); } catch (e) { console.warn('intro', e); } });
    el.classList.add('out');
    setTimeout(() => { el.remove(); if (root.App && root.App.applyTheme) root.App.applyTheme(); }, mode === 'home' && full ? 620 : 320);
  }
  function maybeClose() {
    if (closed || leaving || !ready || !played) return;
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
    leave();
  }
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

  /** The sound of the show, every note placed ahead on the audio clock (t0 = the moment the show starts): air rising
   * with the sheet, and one soft chime as it settles; brighter by day, lower and softer at night, a light patter
   * when it rains. */
  function score(c, t0, scene) {
    const st = scene && Sky ? Sky.state(scene.now || Date.now(), scene.place) : { phase: 'day' };
    const dark = st.phase === 'night' || st.phase === 'dusk';
    const wet = scene && (scene.weather === 'rain' || scene.weather === 'storm');
    master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
    let nb = null;
    const noise = () => {
      if (!nb) { nb = c.createBuffer(1, Math.round(c.sampleRate * 1.4), c.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      return nb;
    };
    // filtered air: when, how long, volume, from and to (Hz), how narrow; it builds up and then goes
    const air = (at, dur, vol, f, f2, q) => {
      const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noise(); bp.type = 'bandpass'; bp.Q.value = q;
      bp.frequency.setValueAtTime(f, t0 + at); bp.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      s.connect(bp).connect(g).connect(master); s.start(t0 + at); s.stop(t0 + at + dur + 0.03);
    };
    // a small bell (frequency modulation at an uneven ratio gives the metal's bright partials, which fade first)
    const bell = (at, dur, f, vol) => {
      const car = c.createOscillator(), mod = c.createOscillator(), idx = c.createGain(), g = c.createGain();
      car.frequency.value = f; mod.frequency.value = f * 3.5;
      idx.gain.setValueAtTime(f * 1.6, t0 + at); idx.gain.exponentialRampToValueAtTime(f * 0.03, t0 + at + dur * 0.6);
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      mod.connect(idx).connect(car.frequency); car.connect(g).connect(master);
      car.start(t0 + at); mod.start(t0 + at); car.stop(t0 + at + dur + 0.05); mod.stop(t0 + at + dur + 0.05);
    };
    const tone = (at, dur, f, vol) => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g).connect(master); o.start(t0 + at); o.stop(t0 + at + dur + 0.03);
    };
    air(0.36, 0.62, 0.012, dark ? 900 : 1500, dark ? 2200 : 4200, 1.1);
    const root0 = dark ? 523.25 : 659.25; // C5 at night, E5 by day
    bell(0.9, 1.7, root0, dark ? 0.032 : 0.042);
    bell(0.94, 1.4, root0 * 1.5, dark ? 0.02 : 0.026);
    tone(0.9, 1.2, root0 / 4, 0.02);
    if (wet) for (let i = 0; i < 9; i++) air(0.2 + i * 0.09 + Math.random() * 0.05, 0.06, 0.006, 3000 + Math.random() * 2500, 2500, 6);
  }
  Intro.score = score; // tests render it offline

  // the app's heavy start-up waits for the show to have started (its first frames are drawn): from then on it runs on
  // the compositor, but a start-up that held the main thread before the first frame left it standing still
  let drawnDone = null;
  const drawn = new Promise((r) => { drawnDone = r; });
  /** Resolves once the show is under way. */
  Intro.drawn = () => drawn;
  const afterFrames = () => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(drawnDone, 0)));

  if (full) {
    el.classList.add('play');
    afterFrames();
    setTimeout(() => drawnDone(), 400); // never later than this, whatever happens to the frames
    const c = Fx.prefs().sound !== false && Fx.audio && Fx.audio();
    if (c && c.state === 'running') { try { score(c, c.currentTime + 0.02, Intro.scene); } catch (e) { /* no sound */ } }
    setTimeout(() => { played = true; if (!ready) el.classList.add('wait'); maybeClose(); }, SEQUENCE_MS);
  } else {
    el.classList.add('still');
    drawnDone();
    setTimeout(() => { played = true; maybeClose(); }, 200);
  }

  // tap to skip: the show jumps to its end (the sky keeps its slow life), and the sound fades out quickly
  el.addEventListener('click', () => {
    played = true; skipped = true;
    drawnDone();
    try { el.getAnimations({ subtree: true }).forEach((a) => { const t = a.effect && a.effect.getComputedTiming(); if (t && t.iterations !== Infinity && a.playState !== 'finished') a.finish(); }); } catch (e) { /* older browsers: it plays on */ }
    if (master) { try { master.gain.setTargetAtTime(0.0001, master.context.currentTime, 0.04); } catch (e) { /* ignore */ } }
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
  setTimeout(() => { ready = true; played = true; close(); }, 9000);
  Intro.elapsed = () => performance.now() - started;
})(typeof window !== 'undefined' ? window : globalThis);
