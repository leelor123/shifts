/* ============================================================
 * mascot-voice.js — שעתי (the coin, mascot.js) speaks and reacts.
 *
 * Speaking: in the setup questions it reads the question aloud (the bubble line when it is short, then
 * the screen's heading) with the browser's own voice in the app's language, and its mouth moves with the
 * words: on each word the voice reports (a "boundary"), a few mouth shapes from open to closed, and a
 * small bob of the coin. A voice that reports no words gets a steady rhythm instead; no voice for the
 * language, or a voice that fails, still moves the mouth for a moment, and nothing is shown. It speaks
 * only after a tap (each setup screen follows one), stops when the screen changes or the setup closes,
 * and outside the setup only when the coin itself is tapped. A speaker button beside the bubble turns it
 * on or off (settings.fx.voice, also in Settings › Look); it is off while the app's effects are off.
 *
 * Reacting: each move belongs to one event and is one short run (under 600 ms, transform only):
 * thinking while the user types (the head tilts, the eyes go up), a nod when an answer is tapped, a hop
 * when a new question arrives, a head shake on wrong input, the eyes on the field it asks about, and a
 * bigger jump on the last screen. Late at night it looks drowsy (mascot.js). With reduced motion the
 * coin stays put (styles-v3.css) and only the mouth and eyes move.
 * ============================================================ */
(function (root) {
  'use strict';

  /** What a voice should read (also tested in Node, tests/mascot-voice.test.js): no emoji, no hidden direction marks,
   *  no "..." or "›", and in Hebrew one form of each slash pair: the feminine one for a girl (בוא/י is read בואי),
   *  otherwise the first (בוא, and את/ה is read אתה), the way people read them aloud. A slash left between two whole
   *  words is read as a short pause. lang: the app's language; gender: 'f', 'm' or anything else (not known). */
  function spoken(text, lang, gender) {
    let t = String(text || '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, '').replace(/[\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069]/g, '');
    t = t.replace(/\s*(?:\.{2,}|…)\s*/g, ' ').replace(/\s*[›‹»«]\s*/g, ', ');
    if (lang === 'he') {
      const f = gender === 'f';
      // a final letter joined to a suffix becomes the ordinary letter (מעדיף/ה is read מעדיפה): its code point + 1
      const join = (a, b) => (/[\u05da\u05dd\u05df\u05e3\u05e5]$/.test(a) ? a.slice(0, -1) + String.fromCharCode(a.charCodeAt(a.length - 1) + 1) : a) + b;
      const first = (m) => m.slice(0, m.indexOf('/'));
      t = t.replace(/(\u05d0\u05ea)\/(\u05d4)(?![\u0590-\u05ff])/g, (m, a, b) => (f ? a : a + b))
        // a plural pair: יקרים/ות is read יקרות for girls
        .replace(/([\u0590-\u05ff]+)\u05d9\u05dd\/(\u05d5\u05ea)(?![\u0590-\u05ff])/g, (m, a, b) => (f ? a + b : first(m)))
        .replace(/([\u0590-\u05ff]+)\/(\u05d4|\u05ea|\u05d9|\u05d9\u05ea|\u05d5\u05ea)(?![\u0590-\u05ff])/g, (m, a, b) => (f ? join(a, b) : a));
    }
    return t.replace(/\s*\/\s*/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.!?:])/g, '$1').replace(/^[,\s]+|[,\s]+$/g, '').trim();
  }
  root.MascotSpeech = { spoken };

  const App = root.App;
  const doc = root.document;
  if (!App || !doc) return;
  const V = {};
  App.mascotVoice = V;

  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const prefs = () => (root.Fx && root.Fx.prefs && root.Fx.prefs()) || {};
  const motion = () => (root.Fx && root.Fx.motion ? root.Fx.motion() : !reduced());
  /** reading aloud: on unless turned off, and never while the app's effects are off */
  V.enabled = () => prefs().voice !== false && prefs().effects !== false;
  // a browser run by a test (navigator.webdriver: puppeteer, Lighthouse) never speaks: on Windows its speech played on
  // the computer's speakers while the test suites ran (6 Nov 2026)
  V.supported = () => !!(root.speechSynthesis && root.SpeechSynthesisUtterance) && !(root.navigator && root.navigator.webdriver);
  const synth = () => (V.supported() ? root.speechSynthesis : null);

  const LANG = (root.U && root.U.LANG) || doc.documentElement.lang || 'he';
  const TAG = { he: 'he-IL', en: 'en-US', ru: 'ru-RU', ar: 'ar-SA', fr: 'fr-FR', es: 'es-ES', am: 'am-ET' }[LANG] || 'he-IL';
  /** the voice for the app's language: { listed: the browser listed any voices, voice: one for us or null } */
  function voiceFor() {
    let list = [];
    try { list = synth().getVoices() || []; } catch (e) { list = []; }
    const bases = LANG === 'he' ? ['he', 'iw'] : [LANG];
    const norm = (v) => String(v.lang || '').toLowerCase().replace('_', '-');
    const mine = list.filter((v) => bases.some((b) => norm(v) === b || norm(v).startsWith(b + '-')));
    return { listed: list.length > 0, voice: mine.find((v) => norm(v) === TAG.toLowerCase() && v.localService) || mine.find((v) => norm(v) === TAG.toLowerCase()) || mine.find((v) => v.localService) || mine[0] || null };
  }
  V.voiceFor = voiceFor;
  // Chrome fills the list of voices a moment after the first ask
  try { if (synth()) synth().getVoices(); } catch (e) { /* none */ }
  // the user's gender as the setup learned it (the chip tapped there), else as saved
  let gender = '';
  const genderNow = () => gender || (root.Store && root.Store.S && root.Store.S.settings && root.Store.S.settings.gender) || '';
  const clean = (t) => spoken(t, LANG, genderNow());
  V.clean = clean;
  /* ---------------- the mouth ---------------- */
  // 0 closed, 1 small, 2 round, 3 wide open (mascot.js TALK)
  const RHYTHM = [3, 1, 2, 0, 3, 2, 1, 0, 2, 3, 1, 0];
  let cur = null; // the line being spoken: { getEl, timers, wordTimers, u, started, briefed, flip }
  const later = (run, fn, ms, set) => { const id = setTimeout(() => { (set || run.timers).delete(id); if (cur === run) fn(); }, ms); (set || run.timers).add(id); return id; };
  const clearAll = (set) => { set.forEach(clearTimeout); set.clear(); };
  function elOf(run) { const e = run.getEl(); return e && e.isConnected ? e : null; }
  /** One unit of the coin's drawing in px (its box is 124 units high). The coin's parts move as HTML layers
   *  (mascot.js), so a length written in the drawing's units becomes px before it moves them. */
  function unit(e) { const h = parseFloat(root.getComputedStyle(e).height); return h > 0 ? h / 124 : 1; }
  const inPx = (t, u) => t.replace(/(-?\d*\.?\d+)px/g, (m, n) => +(n * u).toFixed(3) + 'px');
  const framesIn = (f, u) => f.map((k) => Object.assign({}, k, { transform: inPx(k.transform, u) }));
  function mouth(run, n) {
    const e = elOf(run);
    if (!e) { if (n != null) V.stop(); return; } // the coin left the screen: so does its voice
    if (n == null) { e.classList.remove('talking'); e.removeAttribute('data-mouth'); return; }
    run.lastN = n;
    e.classList.add('talking');
    e.setAttribute('data-mouth', String(n));
  }
  /** the coin bobs a little with the words (never with reduced motion or the effects off) */
  function bob(run) {
    const e = elOf(run);
    const g = e && e.querySelector('.m-talkb');
    if (!g || !g.animate || !motion()) return;
    run.flip = !run.flip;
    try { g.animate([{ transform: 'none' }, { transform: `translateY(${inPx('-2.5px', unit(e))}) rotate(${run.flip ? 1.4 : -1.4}deg)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.37, 0, .63, 1)' }); } catch (x) { /* old browser */ }
  }
  /** one spoken word: its syllables open and close the mouth, then it closes */
  function word(run, len) {
    clearAll(run.wordTimers);
    const syl = Math.max(1, Math.min(5, Math.round(len / 2.5)));
    let t = 0;
    for (let i = 0; i < syl; i++) {
      const open = (i + len) % 3 === 0 ? 2 : 3;
      later(run, () => mouth(run, open), t, run.wordTimers); t += 80;
      later(run, () => mouth(run, 1), t, run.wordTimers); t += 60;
    }
    later(run, () => mouth(run, 0), t, run.wordTimers);
    bob(run);
  }
  /** no word reports from the voice: a steady rhythm while it speaks */
  function rhythm(run, ticks) {
    let i = 0;
    const tick = () => {
      if (ticks != null && i >= ticks) { finish(run); return; }
      mouth(run, RHYTHM[i % RHYTHM.length]);
      if (i % 4 === 0) bob(run);
      i++;
      run.beat = later(run, tick, 130);
    };
    tick();
  }
  /** no voice, or it failed: the mouth still moves for a moment, quietly */
  function brief(run) {
    if (run.briefed || cur !== run) return;
    run.briefed = true;
    clearAll(run.timers); clearAll(run.wordTimers);
    rhythm(run, 8);
  }
  function finish(run) {
    clearAll(run.timers); clearAll(run.wordTimers);
    mouth(run, null);
    if (cur === run) cur = null;
  }
  const guessLen = (text, i) => { const m = /^\S+/.exec(text.slice(i || 0)); return m ? m[0].length : 4; };

  /** Speak a line. target: the coin's element, or a function that finds it (the screen may redraw it). */
  V.speak = function (target, text) {
    V.stop();
    text = clean(text);
    if (!text) return null;
    const run = { getEl: typeof target === 'function' ? target : () => target, timers: new Set(), wordTimers: new Set(), text };
    cur = run;
    const S = synth();
    const pick = S ? voiceFor() : { listed: false, voice: null };
    // a browser that lists voices but none in this language would read it in a wrong accent: the mouth alone
    if (!S || (pick.listed && !pick.voice)) { brief(run); return run; }
    let u;
    try { u = new root.SpeechSynthesisUtterance(text); } catch (e) { brief(run); return run; }
    try {
      u.lang = pick.voice ? pick.voice.lang : TAG;
      if (pick.voice) u.voice = pick.voice;
      u.rate = 1; u.pitch = 1.15; u.volume = 1;
    } catch (e) { /* the voice's own defaults */ }
    run.u = u;
    u.onstart = () => {
      if (cur !== run || run.briefed) return;
      run.started = true;
      mouth(run, 0);
      // a voice that reports no words within a moment gets the steady rhythm
      later(run, () => { if (!run.words) rhythm(run); }, 320);
    };
    u.onboundary = (e) => {
      if (cur !== run || run.briefed || (e.name && e.name !== 'word')) return;
      if (!run.words) { run.words = true; if (run.beat) { clearTimeout(run.beat); run.timers.delete(run.beat); } }
      word(run, e.charLength || guessLen(text, e.charIndex));
    };
    u.onend = () => { if (cur === run) finish(run); };
    u.onerror = () => { if (cur !== run) return; if (run.started) finish(run); else brief(run); };
    try {
      if (S.speaking || S.pending) S.cancel();
      S.speak(u);
    } catch (e) { brief(run); return run; }
    // a voice that never starts (no engine, or the browser holds it back): the mouth moves briefly anyway
    later(run, () => { if (!run.started && !run.briefed) { try { S.cancel(); } catch (x) { /* none */ } brief(run); } }, 2500);
    return run;
  };
  /** Stop speaking now (the screen changed, the setup closed, the page went to the background). */
  V.stop = function () {
    const run = cur;
    if (!run) return;
    cur = null;
    clearAll(run.timers); clearAll(run.wordTimers);
    const e = run.getEl();
    if (e) { e.classList.remove('talking'); e.removeAttribute('data-mouth'); }
    if (run.u) { try { synth().cancel(); } catch (x) { /* none */ } }
  };
  V.speaking = () => !!cur;

  /* ---------------- the reactions ---------------- */
  const SINE = 'cubic-bezier(.37, 0, .63, 1)';
  const OUT = 'cubic-bezier(.23, 1, .32, 1)';
  const MOVES = {
    // an answer was tapped: down and back up, once
    nod: { d: 380, f: [{ transform: 'none', easing: SINE }, { transform: 'translateY(3px) scale(1, .97)', offset: 0.35, easing: SINE }, { transform: 'translateY(-1px)', offset: 0.7, easing: OUT }, { transform: 'none' }] },
    // a new question arrived (the last one was answered): a small happy hop
    hop: { d: 500, f: [{ transform: 'none', easing: SINE }, { transform: 'translateY(1px) scale(1.04, .95)', offset: 0.18, easing: OUT }, { transform: 'translateY(-9px) scale(.98, 1.03)', offset: 0.5, easing: SINE }, { transform: 'translateY(0) scale(1.03, .97)', offset: 0.82, easing: OUT }, { transform: 'none' }] },
    // wrong input: a gentle head shake
    shake: { d: 460, f: [{ transform: 'none', easing: SINE }, { transform: 'translateX(-3px) rotate(-5deg)', offset: 0.2, easing: SINE }, { transform: 'translateX(3px) rotate(4deg)', offset: 0.45, easing: SINE }, { transform: 'translateX(-1.5px) rotate(-2deg)', offset: 0.7, easing: SINE }, { transform: 'none' }] },
    // all done: a bigger jump with a wiggle at the top
    party: { d: 580, f: [{ transform: 'none', easing: SINE }, { transform: 'translateY(2px) scale(1.07, .9)', offset: 0.12, easing: OUT }, { transform: 'translateY(-18px) rotate(-8deg) scale(1.05)', offset: 0.42, easing: SINE }, { transform: 'translateY(-15px) rotate(8deg) scale(1.05)', offset: 0.62, easing: SINE }, { transform: 'translateY(0) scale(1.05, .94)', offset: 0.84, easing: OUT }, { transform: 'none' }] },
  };
  /** the coin on the setup screen (its bubble's or the last screen's) */
  const current = () => doc.querySelector('.ob3 .m-say .mascot, .ob3 .ob-done .mascot');
  V.react = function (kind, target) {
    const e = target || current();
    if (!e) return;
    // with reduced motion the coin stays put; a wrong answer still shows on its face
    if (!motion()) {
      if (kind === 'shake') { e.classList.add('m-hmm'); setTimeout(() => e.classList.remove('m-hmm'), 600); }
      return;
    }
    // a surprised or loving face already jumps as it arrives (styles-v3.css m-jump): no second hop
    if (kind === 'hop' && e.matches('.m-wow, .m-love')) return;
    const g = e.querySelector('.m-act');
    const m = MOVES[kind];
    if (!g || !g.animate || !m) return;
    if (g._mv) g._mv.cancel();
    try { g._mv = g.animate(framesIn(m.f, unit(e)), { duration: m.d }); } catch (x) { /* old browser */ }
  };
  /** the eyes turn toward a field (no field: straight ahead) */
  /** instant: a coin drawn again on the same screen takes the look it had at once, without gliding there anew */
  function lookAt(e, field, instant) {
    const lk = e && e.querySelector('.m-look');
    if (!lk) return;
    let to = '';
    if (field && field.isConnected) {
      const a = e.getBoundingClientRect(), b = field.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + Math.min(b.height, 56) / 2 - (a.top + a.height * 0.5);
      const len = Math.hypot(dx, dy) || 1;
      const u = unit(e);
      to = `translate(${(dx / len * 3.2 * u).toFixed(2)}px, ${(dy / len * 2.6 * u).toFixed(2)}px)`;
    }
    if (instant) { lk.style.transition = 'none'; lk.style.transform = to; lk.getBoundingClientRect(); lk.style.transition = ''; } else lk.style.transform = to;
  }
  V.lookAt = lookAt;

  /* ---------------- the setup questions ---------------- */
  const step = { key: null, timers: [] };
  const FIELD = '.content input:not([type="hidden"]), .content .pk-field, .content .ob-city, .content .ob-chips';
  /** The words of a setup screen: the bubble's line when it is short, then the question. */
  function lineOf(scope) {
    const b = scope.querySelector('.content .m-say .bubble'), h = scope.querySelector('.content h1');
    const bt = clean(b && b.textContent), ht = clean(h && h.textContent);
    return [bt && bt.length <= 60 ? bt : '', ht].filter(Boolean).map((t) => (/[.!?:…؟]$/.test(t) ? t : t + '.')).join(' ');
  }
  V.lineOf = lineOf;
  // a tap has happened on this page (the browser lets a page speak only after one)
  const tapped = () => !root.navigator || !root.navigator.userActivation || root.navigator.userActivation.hasBeenActive;

  function speaker(v) {
    const say = v.querySelector('.content .m-say');
    if (!say) return;
    let b = say.querySelector('.m-spk');
    // no voice engine at all, or the effects are off: no button (Settings › Look holds the choice)
    if (!V.supported() || prefs().effects === false) { if (b) b.remove(); return; }
    if (!b) {
      b = doc.createElement('button');
      b.type = 'button';
      b.className = 'm-spk';
      b.setAttribute('aria-label', 'הקראה בקול');
      say.appendChild(b);
    }
    const on = V.enabled();
    if (b.getAttribute('aria-pressed') !== String(on)) {
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = root.UI ? root.UI.icon(on ? 'voice' : 'voiceOff') : '';
    }
  }
  function bind(v) {
    if (v._mascotVoice) return;
    v._mascotVoice = true;
    // the setup left the screen (back to the welcome screen, or into the app): quiet
    new MutationObserver(() => { if (!v.querySelector('.ob3')) { V.stop(); step.key = null; step.timers.forEach(clearTimeout); } }).observe(v, { childList: true });
  }

  /** Called by the setup questions after each screen is drawn (views-onboarding.js draw()).
   *  key: the screen's name; dir: 'next' or 'prev'. A redraw of the same screen changes nothing. */
  App.mascotStep = function (v, key, dir) {
    if (!v) return;
    bind(v);
    speaker(v);
    const fresh = key !== step.key;
    step.key = key;
    const e = current();
    if (!e) return;
    // the eyes go to the field the question is about, a beat after the screen arrives
    const glance = (instant) => lookAt(current(), (doc.activeElement && doc.activeElement.matches && v.contains(doc.activeElement) && doc.activeElement.matches('input') && doc.activeElement) || v.querySelector(FIELD), instant);
    // the same screen drawn again (an answer tapped) while it speaks: the new coin keeps the mouth it had, no frame
    // of its resting mouth in between
    if (!fresh) { if (cur && cur.lastN != null) mouth(cur, cur.lastN); glance(true); return; }
    step.timers.forEach(clearTimeout);
    step.timers = [];
    V.stop();
    step.timers.push(setTimeout(() => glance(false), 280));
    if (key === 'done') step.timers.push(setTimeout(() => V.react('party'), 260));
    else if (dir === 'next') step.timers.push(setTimeout(() => V.react('hop'), 140));
    if (V.enabled() && tapped()) step.timers.push(setTimeout(() => { if (step.key === key) V.speak(current, lineOf(v)); }, 200));
  };

  async function setVoice(on) {
    try { await root.Store.setSettings((s) => { s.fx = Object.assign({}, s.fx, { voice: on }); }); } catch (e) { console.warn('voice setting', e); }
    if (root.Fx && root.Fx.apply) root.Fx.apply();
  }

  /* ---------------- taps and typing ---------------- */
  doc.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const spk = t.closest('.m-spk');
    if (spk) {
      const on = !V.enabled();
      // the screen's buttons react first; the setting is saved, then the button shows it
      setVoice(on).then(() => {
        const v = spk.closest('.ob3') ? spk.closest('.ob3').parentElement : null;
        if (v) speaker(v);
        if (on && v) V.speak(current, lineOf(v)); else V.stop();
      });
      if (root.Fx) root.Fx.play(on ? 'on' : 'off');
      return;
    }
    // an answer tapped in the setup: a nod (after the screen redrew itself)
    const chip = t.closest('.ob3 .ob-chip');
    if (chip) { if (chip.dataset.gender) gender = chip.dataset.gender; V.react('nod'); return; }
    // the coin tapped anywhere: it says its line again
    const m = t.closest('.mascot');
    if (!m || m.closest('button, a')) return;
    V.react('nod', m);
    if (!V.enabled()) return;
    const ob = m.closest('.ob3');
    V.speak(ob ? current : m, ob ? lineOf(ob) : lineNear(m));
  });
  /** the words beside a coin outside the setup: its bubble, or the nearest heading and line of text */
  function lineNear(m) {
    const say = m.closest('.m-say');
    if (say) { const b = say.querySelector('.bubble'); return b ? b.textContent : ''; }
    let p = m.parentElement;
    for (let i = 0; p && i < 3; i++, p = p.parentElement) {
      const parts = [...p.querySelectorAll('h1, h2, h3, .bubble, p, .lead')].filter((x) => !x.contains(m)).slice(0, 2).map((x) => clean(x.textContent)).filter(Boolean);
      if (parts.length) return parts.map((s) => (/[.!?:…؟]$/.test(s) ? s : s + '.')).join(' ');
    }
    return '';
  }
  // typing in a setup field: the coin thinks (tilted head, eyes up) until the typing stops
  let thinkTimer = null;
  doc.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || !t.closest || !t.closest('.ob3') || !t.matches('input:not([type="date"]):not([type="checkbox"]), textarea')) return;
    const m = current();
    if (m) m.classList.add('m-thinking');
    clearTimeout(thinkTimer);
    thinkTimer = setTimeout(() => { const c = current(); if (c) c.classList.remove('m-thinking'); }, 900);
    // a word that does not fit (app.js marks the field as it is typed): a head shake, once per mistake
    const bad = t.classList.contains('unclean');
    if (bad && !t._mvBad) V.react('shake');
    t._mvBad = bad;
  });
  // a field gets the focus: the eyes go to it
  doc.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.ob3 .content') && t.matches('input, textarea')) lookAt(current(), t);
  });
  // wrong input anywhere in the setup (UI.invalid, Fx.nope): the coin shakes its head too
  if (root.Fx && typeof root.Fx.nope === 'function') {
    const nope = root.Fx.nope;
    root.Fx.nope = function () {
      const r = nope.apply(this, arguments);
      if (current()) V.react('shake');
      return r;
    };
  }
  // the page goes to the background: quiet
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) V.stop(); });
  root.addEventListener && root.addEventListener('pagehide', () => V.stop());
})(typeof window !== 'undefined' ? window : globalThis);
