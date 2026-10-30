/* ============================================================
 * intro.js — the opening show (instead of a "loading" text), about 1.2 seconds: a watch dial at night. A
 * hairline ring draws itself round, twelve gold marks light up, the logo is drawn in two precise strokes, a
 * glint crosses it like light on a watch glass, the name gathers into place, one soft chime, and the night lifts.
 * Quiet and exact rather than busy (it was coins, sparks and a thump; the user wanted luxury, technology,
 * efficiency, 2026-10-30). It doubles as the loading indicator: if the app needs more time, a gold bead goes
 * round the dial. Tap to skip. Short version on later opens in the same session, after the app was opened from a
 * shortcut, or with effects off / reduced motion. Markup and first frames live in index.html.
 *
 * Details that matter:
 *  - every moving part is a transform or opacity (the compositor plays them even while the app is busy
 *    starting up underneath); only the ring and the logo's own strokes are painted, and they come first;
 *  - the whole sound is scheduled at once on the audio clock, in step with the animation's timeline, so a
 *    busy start-up never makes it late or ragged; only if the phone already allows sound (installed apps
 *    usually do), never a late surprise.
 * ============================================================ */
(function (root) {
  'use strict';
  const Fx = root.Fx;
  const el = document.getElementById('intro');
  if (!el) return;
  const Intro = {};
  root.Intro = Intro;
  const started = performance.now();
  let ready = false, played = false, closed = false, leaving = false, master = null, skipped = false;
  // The show stays until the app has finished starting, so nothing it does is seen loading: the first screen
  // settles under it for a moment, and the start-up work that can still change that screen (the account, the
  // admin check, Google Play, the fonts) is waited for, within a limit.
  const CALM_MS = 700; // the first screen sits under the show at least this long
  const SKIP_CALM_MS = 300; // ... or this long after a tap to skip (it is still drawn whole, just not waited on)
  const HOLD_MAX = 2500; // the most the show waits for start-up work after it could have left
  let drawnAt = 0, holdUntil = 0, recheck = 0;
  const holds = new Set();

  let seen = false;
  try { seen = sessionStorage.getItem('introSeen') === '1'; sessionStorage.setItem('introSeen', '1'); } catch (e) { /* ignore */ }
  const fromShortcut = /[?&]action=/.test(location.search);
  const full = !seen && !fromShortcut && Fx.motion();
  const SEQUENCE_MS = 1150; // ring → marks → strokes → glint (0.76s) → the name → the line under it

  function close() {
    if (closed) return;
    closed = true;
    el.classList.add('out');
    setTimeout(() => { el.remove(); if (root.App && root.App.applyTheme) root.App.applyTheme(); }, 520);
  }
  function maybeClose() {
    if (closed || leaving || !ready || !played) return;
    const now = performance.now();
    let wait = drawnAt + (skipped ? SKIP_CALM_MS : CALM_MS) - now;
    if (wait <= 0 && holds.size) {
      if (!holdUntil) holdUntil = now + HOLD_MAX;
      wait = holdUntil - now;
    }
    if (wait > 0) {
      el.classList.add('wait'); // the logo keeps turning, as while loading
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
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(close, 80)));
  }
  /** Start-up work the show waits for (within HOLD_MAX) before it leaves. */
  Intro.hold = function (p) {
    if (closed || leaving || !p || typeof p.then !== 'function') return;
    const h = Promise.resolve(p).catch(() => {}).then(() => { holds.delete(h); maybeClose(); });
    holds.add(h);
  };

  /** The sound of the show, every note placed ahead on the audio clock (t0 = the moment the show starts). */
  function score(c, t0) {
    master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
    let nb = null;
    const noise = () => {
      if (!nb) { nb = c.createBuffer(1, Math.round(c.sampleRate * 0.8), c.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      return nb;
    };
    // one note: when, how long, wave ('noise' = filtered noise), volume, frequency (and where it glides);
    // a hit comes in at once and fades; a swell (a swish, a whoosh) builds up and then goes
    const note = (at, dur, wave, vol, f, f2, q, swell) => {
      const g = c.createGain();
      let s;
      if (wave === 'noise') {
        s = c.createBufferSource(); s.buffer = noise();
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q || 1.2;
        bp.frequency.setValueAtTime(f, t0 + at); if (f2) bp.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
        s.connect(bp).connect(g);
      } else {
        s = c.createOscillator(); s.type = wave;
        s.frequency.setValueAtTime(f, t0 + at); if (f2) s.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
        s.connect(g);
      }
      g.gain.setValueAtTime(0.0001, t0 + at);
      if (swell) g.gain.exponentialRampToValueAtTime(vol, t0 + at + dur * 0.72);
      else g.gain.exponentialRampToValueAtTime(vol, t0 + at + Math.min(0.012, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      g.connect(master);
      s.start(t0 + at); s.stop(t0 + at + dur + 0.03);
    };
    // the ring closing: a fine, soft tick
    note(0.62, 0.035, 'noise', 0.022, 5200, null, 4);
    note(0.62, 0.05, 'sine', 0.018, 2637);
    // the glint: a breath of air across the glass
    note(0.7, 0.42, 'noise', 0.014, 6500, 11000, 1.6, true);
    // and one chime, low and warm under bright (a fifth and its octave), ringing out slowly
    [[659.25, 0, 0.05], [987.77, 0.035, 0.035], [1318.5, 0.07, 0.016]].forEach(([f, d, v]) => {
      note(0.8 + d, 1.6, 'sine', v, f);
      note(0.8 + d, 1.2, 'triangle', v * 0.35, f * 2.001);
    });
    note(0.8, 1.3, 'sine', 0.03, 164.81); // a soft floor under it
  }
  Intro.score = score; // tests render it offline

  // The ring and the logo drawing themselves (0.04–0.75 s) are the part of the show the main thread paints; the rest
  // runs on the compositor. The app's heavy start-up (the whole calculation, the first screen) waits for this, so the
  // drawing never stops halfway on a slow phone (it did: 0.2–0.4 s frozen); the glint and the name don't mind.
  let drawnDone = null;
  const drawn = new Promise((r) => { drawnDone = r; });
  /** Resolves once the logo has drawn itself (at once without the full show, or after a tap to skip). */
  Intro.drawn = () => drawn;

  if (full) {
    el.classList.add('play');
    const y = el.querySelector('.intro-logo.main .y');
    if (y) y.addEventListener('animationend', () => drawnDone(), { once: true });
    setTimeout(() => drawnDone(), 850); // never later than this, whatever happens to the animation
    // the sound starts with the show (only if the phone already allows sound)
    const c = Fx.prefs().sound !== false && Fx.audio && Fx.audio();
    if (c && c.state === 'running') { try { score(c, c.currentTime + 0.02); } catch (e) { /* no sound */ } }
    setTimeout(() => { played = true; if (!ready) el.classList.add('wait'); maybeClose(); }, SEQUENCE_MS);
  } else {
    el.classList.add('still');
    drawnDone();
    setTimeout(() => { played = true; maybeClose(); }, 250);
  }

  // tap to skip (the rest of the show's sound fades out quickly, so the last chord never plays over the app)
  el.addEventListener('click', () => {
    played = true; skipped = true;
    drawnDone();
    if (master) { try { master.gain.setTargetAtTime(0.0001, master.context.currentTime, 0.04); } catch (e) { /* ignore */ } }
    if (ready) close(); else el.classList.add('wait');
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
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(Intro.ready, 80)));
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
