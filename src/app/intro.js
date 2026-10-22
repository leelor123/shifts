/* ============================================================
 * intro.js — the opening show (instead of a "loading" text), about two seconds:
 * the clock's twelve marks tick in, the logo draws itself and spins like a clock hand, it lands with a
 * thump, a flash, two shockwaves, sparks and a burst of coins (cha-ching), the name pops in letter by
 * letter (a note each, up a happy scale), a warm chord, and the logo flies at you as the app appears.
 * It doubles as the loading indicator: if the app needs more time, the logo keeps turning. Tap to skip.
 * Short version on later opens in the same session, after the app was opened from a shortcut, or with
 * effects off / reduced motion. Markup and first frames live in index.html.
 *
 * Details that matter:
 *  - every moving part is a transform or opacity (the compositor plays them even while the app is busy
 *    starting up underneath); only the logo's own drawing is painted;
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
  let ready = false, played = false, closed = false, master = null;

  let seen = false;
  try { seen = sessionStorage.getItem('introSeen') === '1'; sessionStorage.setItem('introSeen', '1'); } catch (e) { /* ignore */ }
  const fromShortcut = /[?&]action=/.test(location.search);
  const full = !seen && !fromShortcut && Fx.motion();
  const SEQUENCE_MS = 1950; // marks → draw → spin → land (1.16s) → name → chord

  function close() {
    if (closed) return;
    closed = true;
    el.classList.add('out');
    setTimeout(() => { el.remove(); if (root.App && root.App.applyTheme) root.App.applyTheme(); }, 520);
  }
  function maybeClose() {
    if (closed || !ready) return;
    if (!played) return;
    close();
  }

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
    // the clock winds up: twelve ticks, each a little higher
    for (let k = 0; k < 12; k++) { note(k * 0.03, 0.03, 'square', 0.016, 1900 * Math.pow(2, k / 14)); note(k * 0.03, 0.02, 'noise', 0.028, 6000, null, 3); }
    // the logo draws itself: a soft rising swish
    note(0.12, 0.6, 'noise', 0.06, 700, 3600, 0.8, true);
    note(0.12, 0.6, 'sine', 0.012, 392, 784, 0, true);
    // the spin: a whoosh that speeds up
    note(0.70, 0.48, 'noise', 0.08, 900, 4200, 1.4, true);
    note(0.70, 0.48, 'sine', 0.025, 220, 660, 0, true);
    // it lands: a deep thump and a click
    note(1.16, 0.34, 'sine', 0.18, 150, 42);
    note(1.16, 0.06, 'noise', 0.12, 2400, 600, 0.8);
    note(1.16, 0.5, 'noise', 0.035, 300, 120, 0.7);
    // the coins: cha-ching
    note(1.20, 0.07, 'noise', 0.06, 5200, 3000, 2);
    note(1.21, 0.10, 'square', 0.022, 1319);
    note(1.27, 0.38, 'square', 0.02, 1976);
    note(1.27, 0.38, 'triangle', 0.03, 2637);
    note(1.34, 0.12, 'noise', 0.03, 7000, 9000, 3);
    // the name: a pluck for each letter, up a happy scale
    [1047, 1175, 1319, 1568, 1760, 2093].forEach((f, k) => { note(1.26 + k * 0.06, 0.16, 'triangle', 0.045, f); note(1.26 + k * 0.06, 0.08, 'sine', 0.02, f * 2); });
    // and a warm, bright chord to finish
    [[523, 0], [659, 0.025], [784, 0.05], [988, 0.075], [1319, 0.1]].forEach(([f, d]) => { note(1.66 + d, 1.1, 'triangle', 0.035, f); note(1.66 + d, 1.1, 'sine', 0.025, f * 1.002); });
    note(1.66, 0.9, 'noise', 0.018, 8000, 11000, 2);
  }
  Intro.score = score; // tests render it offline

  if (full) {
    // the coins and the sparks that fly out when the logo lands
    const coins = el.querySelector('.intro-coins');
    for (let i = 0; i < 12; i++) {
      const c = document.createElement('i');
      const a = (-90 + (i - 5.5) * 25) * Math.PI / 180, dist = 105 + (i % 3) * 32;
      c.style.cssText = `--dx:${Math.round(Math.cos(a) * dist)}px;--dy:${Math.round(Math.sin(a) * dist * 0.9)}px;--r:${(i - 5.5) * 34}deg;--s:${(0.8 + (i % 4) * 0.12).toFixed(2)};--d:${i * 18}ms`;
      c.textContent = '₪';
      coins.appendChild(c);
    }
    const sparks = el.querySelector('.intro-sparks');
    const COL = ['#2ee59d', '#ffd25a', '#8fb4ff', '#ff7ab6', '#ffffff'];
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('i');
      const a = (i / 18) * Math.PI * 2, dist = 120 + (i % 3) * 40;
      s.style.cssText = `--dx:${Math.round(Math.cos(a) * dist)}px;--dy:${Math.round(Math.sin(a) * dist)}px;--c:${COL[i % COL.length]};--d:${(i % 4) * 14}ms`;
      sparks.appendChild(s);
    }
    el.classList.add('play');
    // the sound starts with the show (only if the phone already allows sound)
    const c = Fx.prefs().sound !== false && Fx.audio && Fx.audio();
    if (c && c.state === 'running') { try { score(c, c.currentTime + 0.02); } catch (e) { /* no sound */ } }
    setTimeout(() => { played = true; if (!ready) el.classList.add('wait'); maybeClose(); }, SEQUENCE_MS);
  } else {
    el.classList.add('still');
    setTimeout(() => { played = true; maybeClose(); }, 250);
  }

  // tap to skip (the rest of the show's sound fades out quickly, so the last chord never plays over the app)
  el.addEventListener('click', () => {
    played = true;
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
