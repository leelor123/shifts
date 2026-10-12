/* ============================================================
 * intro.js — the opening animation (instead of a "loading" text).
 * The logo draws itself, spins like a clock hand, coins pop out and
 * the name rises; then it opens onto the app. It doubles as the
 * loading indicator: if the app needs more time, the logo keeps
 * turning. Tap to skip. Short version on later opens in the same
 * session, after the app was opened from a shortcut, or with effects
 * off / reduced motion. Markup and first frames live in index.html.
 * ============================================================ */
(function (root) {
  'use strict';
  const Fx = root.Fx;
  const el = document.getElementById('intro');
  if (!el) return;
  const Intro = {};
  root.Intro = Intro;
  const started = performance.now();
  let ready = false, played = false, closed = false;

  let seen = false;
  try { seen = sessionStorage.getItem('introSeen') === '1'; sessionStorage.setItem('introSeen', '1'); } catch (e) { /* ignore */ }
  const fromShortcut = /[?&]action=/.test(location.search);
  const full = !seen && !fromShortcut && Fx.motion();
  const SEQUENCE_MS = 1350; // draw → spin → coins → name

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

  if (full) {
    el.classList.add('play');
    // sound only if the phone already allows it (installed apps usually do); never a late surprise
    setTimeout(() => Fx.play('intro', { strict: true }), 60);
    setTimeout(() => {
      Fx.play('coin', { strict: true });
      const coins = el.querySelector('.intro-coins');
      for (let i = 0; i < 7; i++) {
        const c = document.createElement('i');
        const a = (-90 + (i - 3) * 26) * Math.PI / 180;
        c.style.setProperty('--dx', Math.round(Math.cos(a) * (90 + (i % 2) * 30)) + 'px');
        c.style.setProperty('--dy', Math.round(Math.sin(a) * (80 + (i % 3) * 22)) + 'px');
        c.style.setProperty('--r', ((i - 3) * 40) + 'deg');
        c.style.animationDelay = (i * 25) + 'ms';
        c.textContent = '₪';
        coins.appendChild(c);
      }
    }, 820);
    setTimeout(() => { played = true; if (!ready) el.classList.add('wait'); maybeClose(); }, SEQUENCE_MS);
  } else {
    el.classList.add('still');
    setTimeout(() => { played = true; maybeClose(); }, 250);
  }

  // tap to skip
  el.addEventListener('click', () => { played = true; if (ready) close(); else el.classList.add('wait'); });

  /** Called once the first screen (app, sign-in, terms or setup) has been drawn behind the intro. */
  Intro.ready = function () {
    if (ready) return;
    ready = true;
    maybeClose();
  };
  // the first screen replaces the "loading" placeholder inside #view
  const view = document.getElementById('view');
  if (view) {
    const mo = new MutationObserver(() => { mo.disconnect(); setTimeout(Intro.ready, 60); });
    mo.observe(view, { childList: true, subtree: true });
  }
  // never hold the app hostage
  setTimeout(() => { ready = true; played = true; close(); }, 9000);
  Intro.elapsed = () => performance.now() - started;
})(typeof window !== 'undefined' ? window : globalThis);
