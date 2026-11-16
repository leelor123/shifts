/* ============================================================
 * mascot-voice.js — שעתי (the coin, mascot.js) speaks and reacts.
 *
 * Speaking: in the setup questions it reads the question aloud (the bubble line when it is short, a short
 * pause, then the screen's heading) with a voice installed on the device for the app's language, and its
 * mouth moves with the words: on each word the voice reports (a "boundary"), a few mouth shapes from open
 * to closed, and a small bob of the coin. A voice that reports no words gets a steady rhythm while it
 * speaks. Only offline voices count (localService): a network voice would send the words to its maker's
 * servers. No such voice, or a voice that fails, means silence and a still mouth. It reads only when the
 * user turned it on (settings.fx.voice === true, the speaker button beside the bubble or Settings › Look),
 * never while the app's effects are off, only after a tap (each setup screen follows one), stops when the
 * screen changes or the setup closes, and outside the setup only when the coin itself is tapped.
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
    } else if (lang === 'ar') {
      // a suffix pair (\u062a\u0639\u0645\u0644/\u064a\u0646 is read \u062a\u0639\u0645\u0644\u064a\u0646 for a girl, else \u062a\u0639\u0645\u0644); two whole words (\u0633\u0628\u062a/\u0639\u064a\u062f) stay a pause
      // letters and vowel marks only: the Arabic question mark \u061f sits in the same block
      t = t.replace(/([\u0621-\u0652]+)\/(\u064a\u0646|\u064a|\u0629|\u0627\u062a)(?![\u0621-\u0652])/g, (m, a, b) => (gender === 'f' ? a + b : a));
    } else if (lang === 'fr') {
      // n\u00e9(e) is read n\u00e9e for a girl, else n\u00e9; heureux(se) heureuse; a plural (s) is silent, so it is dropped
      t = t.replace(/(\p{L}+)\((\p{L}{1,3})\)/gu, (m, a, b) => (b === 's' || gender !== 'f' ? a : b === 'se' && /x$/.test(a) ? a.slice(0, -1) + b : a + b));
    }
    return t.replace(/\s*\/\s*/g, ' ').replace(/\s+/g, ' ').replace(/\s+([,.!?:\u060c\u061f\u1362\u1363\u1367])/g, '$1')
      // a comma left in front of the line's end, or at its very end, once an emoji after it is gone (, ، ፣)
      .replace(/[,\u060c\u1363]+(?=[.!?:\u061f\u1362\u1367]|$)/g, '')
      .replace(/^[,\u060c\u1363\s]+|[,\u060c\u1363\s]+$/g, '').trim();
  }
  /** What to say instead of a line, per language. The key is the line as spoken() leaves it (the shown words,
   *  cleaned; a gendered line needs one key per form), the value is what the voice reads. Every Hebrew key has to
   *  match a line in views-onboarding.js (tests/mascot-voice.test.js), so a reworded screen cannot leave one behind. */
  // i18n-keep-start (Hebrew words for the Hebrew voice only, never shown)
  const SAY = { he: {} };
  /** Hebrew signs a voice reads badly: ₪ and ש"ח become שקלים after the number (בש"ח: בשקלים), % after a number
   *  becomes אחוז, and a dash between two numbers (40-50, 50%-60%) becomes עד. */
  function heTokens(t) {
    // שקל אחד, שקלים, אחוז אחד, אחוז, עד, written as code points
    const shekels = (n) => (n === '1' ? '\u05e9\u05e7\u05dc \u05d0\u05d7\u05d3' : n + ' \u05e9\u05e7\u05dc\u05d9\u05dd');
    // no lookbehind (Safari before iOS 16.4 cannot read one): the character before is kept and put back.
    // ש"ח alone turns into ₪ for the number rules below; with a one-letter prefix (ב ל מ ו ה) it reads as one word
    return t.replace(/(^|[^\u0590-\u05ff])([\u05d1\u05dc\u05de\u05d5\u05d4]?)\u05e9["\u05f4]\u05d7(?![\u0590-\u05ff])/g, (m, a, p) => a + (p ? p + '\u05e9\u05e7\u05dc\u05d9\u05dd' : '\u20aa'))
      // a dash between two numbers reads עד; a phone number (050-1234567) keeps its dash
      .replace(/(^|[^\d])(\u20aa?)(\d(?:[\d,.]{0,10}\d)?)([%\u20aa]?)\s*[-\u2013]\s*(?=\u20aa?\d)/g, (m, a, c, n, u) => (/^0\d/.test(n) ? m : a + c + n + u + ' \u05e2\u05d3 '))
      .replace(/\u20aa\s*(\d(?:[\d,.]*\d)?)/g, (m, n) => shekels(n))
      .replace(/(\d(?:[\d,.]*\d)?)\s*\u20aa/g, (m, n) => shekels(n))
      .replace(/\u20aa/g, '\u05e9\u05e7\u05dc\u05d9\u05dd')
      .replace(/(\d(?:[\d,.]*\d)?)\s*%/g, (m, n) => (n === '1' ? '\u05d0\u05d7\u05d5\u05d6 \u05d0\u05d7\u05d3' : n + ' \u05d0\u05d7\u05d5\u05d6'))
      .replace(/\s+/g, ' ').trim();
  }
  // i18n-keep-end
  /** The words the coin speaks for a shown line: spoken(), then the line's own spoken version (SAY) if it has one,
   *  then the Hebrew sign rules. */
  function voiceLine(text, lang, gender) {
    let t = spoken(text, lang, gender);
    const own = SAY[lang];
    // a value is the words, or { m, f } when the same written line is said differently to a girl (לָךְ, not לְךָ)
    if (own && Object.prototype.hasOwnProperty.call(own, t)) { const v = own[t]; t = String(v && typeof v === 'object' ? (gender === 'f' ? v.f : v.m) || t : v); }
    return lang === 'he' ? heTokens(t) : t;
  }
  const TAGS = { he: 'he-IL', en: 'en-US', ru: 'ru-RU', ar: 'ar-SA', fr: 'fr-FR', es: 'es-ES', am: 'am-ET' };
  /** An offline voice for the language, or null. A voice with localService false (desktop Chrome's "Google" voices)
   *  sends the words to its maker's servers, so it never counts. Its own country first (he-IL), then any. */
  function pickVoice(list, lang) {
    const tag = (TAGS[lang] || 'he-IL').toLowerCase();
    const bases = lang === 'he' ? ['he', 'iw'] : [lang || 'he'];
    const norm = (v) => String((v && v.lang) || '').toLowerCase().replace('_', '-');
    const mine = (list || []).filter((v) => v && v.localService === true && bases.some((b) => norm(v) === b || norm(v).startsWith(b + '-')));
    return mine.find((v) => norm(v) === tag) || mine[0] || null;
  }
  /** An element's text as the voice should read it: like textContent, but an element with data-say reads its
   *  data-say value instead (views-onboarding.js g() shows "m/f" and puts the one form to say there: in Arabic the
   *  two forms are whole phrases). Reads the tree as it is, nothing on the screen changes. */
  function sayText(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return '';
    const say = node.getAttribute ? node.getAttribute('data-say') : null;
    if (say != null) return say;
    let s = '';
    for (const c of node.childNodes || []) s += sayText(c);
    return s;
  }
  root.MascotSpeech = { spoken, voiceLine, pickVoice, sayText, SAY };

  const App = root.App;
  const doc = root.document;
  if (!App || !doc) return;
  const V = {};
  App.mascotVoice = V;

  const reduced = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const prefs = () => (root.Fx && root.Fx.prefs && root.Fx.prefs()) || {};
  const motion = () => (root.Fx && root.Fx.motion ? root.Fx.motion() : !reduced());
  // the speaker button's choice while it is being saved: it counts from the tap on
  let chosen = null;
  /** reading aloud: only when the user turned it on (people who never chose hear nothing), never with the effects off */
  V.enabled = () => (chosen != null ? chosen : prefs().voice === true) && prefs().effects !== false;
  const hasApi = () => !!(root.speechSynthesis && root.SpeechSynthesisUtterance);
  const webdriver = () => !!(root.navigator && root.navigator.webdriver);
  // a browser run by a test (navigator.webdriver: puppeteer, Lighthouse) never speaks: on Windows its speech played on
  // the computer's speakers while the test suites ran (6 Nov 2026)
  V.supported = () => hasApi() && !webdriver();
  const synth = () => (V.supported() ? root.speechSynthesis : null);

  const LANG = (root.U && root.U.LANG) || doc.documentElement.lang || 'he';
  /** The browser's voices, or null while that is not known yet (Chrome fills the list a moment after the first ask).
   *  No speech in the browser: known, and empty. A browser run by a test never learns its voices, so Settings shows
   *  the switch there as before. */
  let gaveUp = false; // still no voices a while after the first ask (a WebView without a speech engine): known, empty
  function voiceList() {
    if (!hasApi()) return [];
    if (webdriver()) return null;
    let list = [];
    try { list = root.speechSynthesis.getVoices() || []; } catch (e) { return []; }
    return list.length ? list : gaveUp ? [] : null;
  }
  /** an offline voice for the app's language, or null */
  const voiceFor = () => pickVoice(voiceList() || [], LANG);
  V.voiceFor = voiceFor;
  V.known = () => voiceList() !== null;
  /** the coin can read aloud here: speech works, and the device has an offline voice in the app's language */
  V.available = () => V.supported() && !!voiceFor();
  // once shown in this page life, the Settings switch stays: a redraw of Settings never takes it out from under a finger
  let switchShown = false;
  /** Settings › Look shows the reading-aloud switch: a voice is here, or the list is not known yet */
  V.showSwitch = () => (switchShown = switchShown || V.available() || !V.known());
  // the user's gender as the setup learned it (the chip tapped there), else as saved
  let gender = '';
  const genderNow = () => gender || (root.Store && root.Store.S && root.Store.S.settings && root.Store.S.settings.gender) || '';
  const clean = (t) => spoken(t, LANG, genderNow());
  V.clean = clean;

  /* ---------------- the list of voices ---------------- */
  const waiting = new Set(); // lines asked for before the list came
  const GIVE_UP = 3000; // no voices this long after the first ask: there are none
  let listening = false, quietTimer = 0;
  /** Listen for the list for the whole page life (Android can fill it in parts). The first ask starts Chrome filling
   *  it; with nothing listed after GIVE_UP the list counts as known and empty. */
  function listenVoices() {
    const S = synth();
    if (listening || !S) return;
    listening = true;
    try { if (S.addEventListener) S.addEventListener('voiceschanged', voicesChanged); else S.onvoiceschanged = voicesChanged; } catch (e) { /* none */ }
    setTimeout(() => { if (V.known()) return; gaveUp = true; voicesChanged(); }, GIVE_UP);
  }
  /** The list grew (any number of times): a waiting line speaks once its voice is there, and the setup screen on show
   *  decides on its speaker button again. A voice shows the button at once; no voice hides it only after the list
   *  has been still for a moment, so a list that comes in parts never blinks the button. */
  function voicesChanged() {
    if (!V.known()) return;
    const ok = !!voiceFor();
    [...waiting].forEach((run) => { if (ok || gaveUp) go(run); });
    clearTimeout(quietTimer);
    const again = () => { const ob = doc.querySelector('.ob3'); if (ob && ob.parentElement) speaker(ob.parentElement, null, true); };
    if (ok || gaveUp) again(); else quietTimer = setTimeout(again, 600);
  }
  if (V.supported()) listenVoices();
  /* ---------------- the mouth ---------------- */
  // 0 closed, 1 small, 2 round, 3 wide open (mascot.js TALK)
  const RHYTHM = [3, 1, 2, 0, 3, 2, 1, 0, 2, 3, 1, 0];
  let cur = null; // what is being spoken: { getEl, lines, timers, wordTimers, voice, u, started, words, beat, flip }
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
  /** no word reports from the voice: a steady rhythm while it speaks (the line's end or a stop ends it) */
  function rhythm(run) {
    let i = 0;
    const tick = () => {
      // an end that never came (Android or iOS took the sound away): two quiet checks in a row end the line
      const S = synth();
      if (S && !S.speaking && !S.pending) { if (++run.idle >= 2) { ended(run, run.i); return; } } else run.idle = 0;
      mouth(run, RHYTHM[i % RHYTHM.length]);
      if (cur !== run) return;
      if (i % 4 === 0) bob(run);
      i++;
      run.beat = later(run, tick, 130);
    };
    tick();
  }
  function stopBeat(run) { if (run.beat) { clearTimeout(run.beat); run.timers.delete(run.beat); run.beat = null; } }
  /** done, or the voice failed: quiet, and the coin's own resting mouth */
  function finish(run) {
    clearAll(run.timers); clearAll(run.wordTimers);
    waiting.delete(run);
    mouth(run, null);
    if (cur === run) cur = null;
  }
  const guessLen = (text, i) => { const m = /^\S+/.exec(text.slice(i || 0)); return m ? m[0].length : 4; };
  const WAIT = 1500; // the longest a first tap waits for the list of voices
  const PAUSE = 350; // between the bubble's line and the question
  // a voice silent this long after the ask never will be; Android's offline voices are slow the first time
  const NO_START = 2500, NO_START_FIRST = 5000;
  let everStarted = false; // a voice has started in this page life
  /** the longest one line may take: past it, an end that never came is taken as the end */
  const capOf = (text) => 1500 + 150 * text.length;
  /** The engine stops what plays and takes the line. One still busy right after the cancel gets it a moment later;
   *  otherwise it is spoken at once, which keeps a tap's own call synchronous (iOS needs that). */
  function send(run, S, u) {
    if (S.speaking || S.pending) {
      S.cancel();
      if (S.speaking) { later(run, () => { if (run.u === u) { try { S.speak(u); } catch (e) { finish(run); } } }, 60); return; }
    }
    S.speak(u);
  }
  /** the line is over without its end reported: the next line, or done (the engine silenced if it still holds one) */
  function ended(run, i) {
    const S = synth();
    if (i + 1 >= run.lines.length && S && (S.speaking || S.pending)) { try { S.cancel(); } catch (e) { /* none */ } }
    next(run, i);
  }

  /** Speak one line or a few, a short pause between them. target: the coin's element, or a function that finds it
   *  (the screen may redraw it). Without an offline voice for the language nothing is said and the mouth stays still. */
  V.speak = function (target, what) {
    V.stop();
    const lines = (Array.isArray(what) ? what : [what]).map((t) => voiceLine(t, LANG, genderNow())).filter(Boolean);
    if (!lines.length || !synth()) return null;
    const run = { getEl: typeof target === 'function' ? target : () => target, timers: new Set(), wordTimers: new Set(), lines };
    cur = run;
    if (V.known()) go(run);
    else {
      // the first tap can come before Chrome has listed its voices: wait a moment for them
      waiting.add(run);
      listenVoices();
      run.wait = later(run, () => go(run), WAIT);
    }
    return run;
  };
  /** the list is known (or the wait is over): speak with an offline voice, or stay quiet */
  function go(run) {
    if (cur !== run || run.going) return;
    run.going = true;
    waiting.delete(run);
    if (run.wait) { clearTimeout(run.wait); run.timers.delete(run.wait); }
    run.voice = voiceFor();
    if (!run.voice) { finish(run); return; }
    line(run, 0);
  }
  function line(run, i) {
    const S = synth();
    if (!S || !elOf(run)) { V.stop(); return; } // the coin left the screen during the pause
    const text = run.lines[i];
    run.i = i; run.started = false; run.words = false; run.beat = null; run.idle = 0;
    let u;
    try { u = new root.SpeechSynthesisUtterance(text); } catch (e) { finish(run); return; }
    try { u.voice = run.voice; u.lang = run.voice.lang; u.rate = 1; u.pitch = 1.15; u.volume = 1; } catch (e) { /* the voice's own defaults */ }
    run.u = u;
    // an utterance stopped or replaced reports nothing more
    const live = () => cur === run && run.u === u;
    u.onstart = () => {
      if (!live() || run.started) return;
      run.started = true;
      everStarted = true;
      mouth(run, 0);
      // a voice that reports no words within a moment gets the steady rhythm
      later(run, () => { if (run.u === u && !run.words) rhythm(run); }, 320);
      later(run, () => { if (run.u === u) ended(run, i); }, capOf(text));
    };
    u.onboundary = (e) => {
      if (!live() || (e.name && e.name !== 'word')) return;
      if (!run.words) { run.words = true; stopBeat(run); }
      word(run, e.charLength || guessLen(text, e.charIndex));
    };
    u.onend = () => { if (live()) next(run, i); };
    // failed before or after it started: quiet, never a mouth moving without a voice
    u.onerror = () => { if (live()) finish(run); };
    try {
      run.spoke = true;
      send(run, S, u);
    } catch (e) { finish(run); return; }
    later(run, () => {
      if (run.u !== u || run.started) return;
      // talking already, its start never reported: never cut it; the cap ends the line
      if (S.speaking) { later(run, () => { if (run.u === u) ended(run, i); }, capOf(text)); return; }
      try { S.cancel(); } catch (x) { /* none */ }
      finish(run);
    }, everStarted ? NO_START : NO_START_FIRST);
  }
  /** a line ended: the mouth closes for the pause, then the next line, or done */
  function next(run, i) {
    clearAll(run.timers); clearAll(run.wordTimers);
    run.beat = null;
    run.u = null; // a late end from this line changes nothing
    if (i + 1 >= run.lines.length) { finish(run); return; }
    mouth(run, 0);
    if (cur !== run) return;
    later(run, () => line(run, i + 1), PAUSE);
  }
  /** Stop speaking now (the screen changed, the setup closed, the page went to the background): the voice, a line
   *  still to come, the pause and the wait for the voices all end here. */
  V.stop = function () {
    const run = cur;
    if (!run) return;
    cur = null;
    clearAll(run.timers); clearAll(run.wordTimers);
    waiting.delete(run);
    const e = run.getEl();
    if (e) { e.classList.remove('talking'); e.removeAttribute('data-mouth'); }
    if (run.spoke) { try { synth().cancel(); } catch (x) { /* none */ } }
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
  /** The words of a setup screen, each its own utterance: the bubble's line when it is short, then the question.
   *  Each line stays as shown (cleaned), so SAY can find it by its words. */
  function lineOf(scope) {
    const b = scope.querySelector('.content .m-say .bubble'), h = scope.querySelector('.content h1');
    const bt = clean(sayText(b)), ht = clean(sayText(h));
    // 90: a translated greeting with a long name still fits
    return [bt && bt.length <= 90 ? bt : '', ht].filter(Boolean);
  }
  V.lineOf = lineOf;
  // a tap has happened on this page (the browser lets a page speak only after one)
  const tapped = () => !root.navigator || !root.navigator.userActivation || root.navigator.userActivation.hasBeenActive;

  // the invitation pulse on the speaker button: once a page life, and never after the button was tapped
  let invited = false;
  /** a soft pulse (styles-v3.css m-spk-invite) for someone who never chose; it ends with its own animation */
  function invite(b) {
    invited = true;
    b.classList.add('m-spk-invite');
    let t = 0;
    const done = (e) => {
      // the button's own entrance (bubble-in) ends first: only the pulse's end counts
      if (e && !/^spk-invite/.test(e.animationName || '')) return;
      clearTimeout(t);
      b.removeEventListener('animationend', done);
      b.classList.remove('m-spk-invite');
    };
    b.addEventListener('animationend', done);
    t = setTimeout(() => done(), 2000);
  }
  /** invisible and out of reach, in its place: nothing beside it moves */
  function quiet(b) {
    // the focus never stays on a hidden button: it goes to the screen's question
    if (doc.activeElement === b) {
      const ob = b.closest && b.closest('.ob3'), h = ob && ob.querySelector('.content h1');
      if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { /* old browser */ } }
    }
    b.style.visibility = 'hidden';
    b.classList.add('m-spk-none');
    b.classList.remove('m-spk-invite');
    b.setAttribute('aria-hidden', 'true');
    b.tabIndex = -1;
  }
  let quietKey = null; // the screen whose button went invisible: drawn again (an answer tapped), it keeps that place
  /** The speaker button. With the screen (late false): none when the effects are off, speech is missing, or the list
   *  is known and has no offline voice; otherwise a button, also while the list is not known yet. Later (the list
   *  came, the button was tapped): a button is never added or taken away, so nothing on the screen moves; with no
   *  offline voice it turns invisible (quiet) and keeps its place. */
  function speaker(v, key, late) {
    const say = v.querySelector('.content .m-say');
    if (!say) return;
    let b = say.querySelector('.m-spk');
    if (V.supported() && !V.known()) listenVoices();
    const none = prefs().effects === false || !V.supported() || (V.known() && !voiceFor());
    if (!late && key !== quietKey) quietKey = null;
    if (late ? !b : none && !quietKey) { if (b) b.remove(); return; }
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
    if (none) { quiet(b); if (late) quietKey = step.key; return; }
    if (b.classList.contains('m-spk-none')) {
      // a voice came after all: the button shows again in the same place
      quietKey = null;
      b.style.visibility = '';
      b.classList.remove('m-spk-none');
      b.removeAttribute('aria-hidden');
      b.removeAttribute('tabindex');
    }
    if (!invited && prefs().voice === undefined && V.available()) invite(b);
  }
  function bind(v) {
    if (v._mascotVoice) return;
    v._mascotVoice = true;
    // the setup left the screen (back to the welcome screen, or into the app): quiet
    new MutationObserver(() => { if (!v.querySelector('.ob3')) { V.stop(); step.key = null; quietKey = null; step.timers.forEach(clearTimeout); } }).observe(v, { childList: true });
  }

  /** Called by the setup questions after each screen is drawn (views-onboarding.js draw()).
   *  key: the screen's name; dir: 'next' or 'prev'. A redraw of the same screen changes nothing. */
  App.mascotStep = function (v, key, dir) {
    if (!v) return;
    bind(v);
    speaker(v, key);
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
    // checked again when it fires: the screen, the choice, and the page still in front
    if (V.enabled() && tapped()) step.timers.push(setTimeout(() => { if (step.key === key && V.enabled() && !doc.hidden) V.speak(current, lineOf(v)); }, 200));
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
      invited = true;
      spk.classList.remove('m-spk-invite');
      const on = !V.enabled();
      const v = spk.closest('.ob3') ? spk.closest('.ob3').parentElement : null;
      // the choice counts at once; the button shows it and the voice starts inside this tap (iOS Safari and Android
      // Chrome let a page start speech only from the user's own tap), and the saving follows
      chosen = on;
      if (v) speaker(v, step.key, true);
      if (on && v) V.speak(current, lineOf(v)); else V.stop();
      // the click sound plays through Web Audio and leaves the speech alone
      if (root.Fx) root.Fx.play(on ? 'on' : 'off');
      setVoice(on).then(() => {
        if (chosen === on) chosen = null;
        if (v && v.isConnected) speaker(v, step.key, true);
      });
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
    if (say) { const b = say.querySelector('.bubble'); return b ? sayText(b) : ''; }
    let p = m.parentElement;
    for (let i = 0; p && i < 3; i++, p = p.parentElement) {
      const parts = [...p.querySelectorAll('h1, h2, h3, .bubble, p, .lead')].filter((x) => !x.contains(m)).slice(0, 2).map((x) => clean(sayText(x))).filter(Boolean);
      // joined into one line: a full stop between the parts unless one ends a sentence already (Amharic ። and ፧ too)
      if (parts.length) return parts.map((s) => (/[.!?:…؟።፧]$/.test(s) ? s : s + '.')).join(' ');
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
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) { V.stop(); step.timers.forEach(clearTimeout); step.timers = []; } });
  root.addEventListener && root.addEventListener('pagehide', () => V.stop());
})(typeof window !== 'undefined' ? window : globalThis);
