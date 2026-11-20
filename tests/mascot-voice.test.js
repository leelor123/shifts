/* The words the coin reads aloud (app/mascot-voice.js MascotSpeech.spoken): one form of each Hebrew slash pair,
 * no emoji, no "..." or "›", no hidden direction marks. */
const path = require('path');
const T = require('./t.js');
require(path.join(__dirname, '..', 'src', 'app', 'mascot-voice.js'));
const { spoken } = globalThis.MascotSpeech;
T.section('the coin reads aloud');
T.test('slash pairs: the first form when the gender is not known', () => {
  T.eq(spoken('בוא/י נכיר 😊', 'he', ''), 'בוא נכיר');
  T.eq(spoken('איפה את/ה עובד/ת?', 'he', ''), 'איפה אתה עובד?');
  T.eq(spoken('מעדיף/ה לא לומר', 'he', 'x'), 'מעדיף לא לומר');
  T.eq(spoken('לא בטוח/ה?', 'he', ''), 'לא בטוח?');
  T.eq(spoken('משתמשים/ות יקרים/ות', 'he', ''), 'משתמשים יקרים');
});
T.test('slash pairs: the feminine form for a girl, the first for a boy', () => {
  T.eq(spoken('בוא/י נכיר', 'he', 'f'), 'בואי נכיר');
  T.eq(spoken('איפה את/ה עובד/ת?', 'he', 'f'), 'איפה את עובדת?');
  T.eq(spoken('מעדיף/ה לא לומר', 'he', 'f'), 'מעדיפה לא לומר');
  T.eq(spoken('משתמשים/ות יקרים/ות', 'he', 'f'), 'משתמשות יקרות');
  T.eq(spoken('איפה את/ה עובד/ת?', 'he', 'm'), 'איפה אתה עובד?');
});
T.test('two whole words with a slash: a pause, never the word "slash"', () => {
  const s = spoken('בן/בת', 'he', '');
  T.ok(!s.includes('/'), s);
  T.eq(s, 'בן בת');
});
T.test('no emoji, no "..." or "›", no hidden marks', () => {
  T.eq(spoken('ואת/ה...', 'he', ''), 'ואתה');
  T.eq(spoken('הגדרות › מראה', 'he', ''), 'הגדרות, מראה');
  T.eq(spoken('גיל 16! יש לך זכויות מיוחדות, נדאג להן 🛡\uFE0F', 'he', ''), 'גיל 16! יש לך זכויות מיוחדות, נדאג להן');
  T.eq(spoken('בשבת מרוויחים לפחות 150%! 🤑', 'he', ''), 'בשבת מרוויחים לפחות 150%!');
  T.eq(spoken('\u2068Chrome\u2069 … ok', 'en', ''), 'Chrome ok');
  T.eq(spoken('Where do you work? 🤔', 'en', ''), 'Where do you work?');
});
T.test('other languages keep their words', () => {
  T.eq(spoken('Как тебя зовут?', 'ru', 'f'), 'Как тебя зовут?');
  T.eq(spoken('ما اسمك؟ 😊', 'ar', ''), 'ما اسمك؟');
  T.eq(spoken('እንተዋወቅ 😊', 'am', ''), 'እንተዋወቅ');
});
T.test('French (e) and Arabic slash suffixes: one form, like Hebrew', () => {
  T.eq(spoken('Tu es né(e) quand', 'fr', ''), 'Tu es né quand');
  T.eq(spoken('Tu es né(e) quand', 'fr', 'm'), 'Tu es né quand');
  T.eq(spoken('Tu es né(e) quand', 'fr', 'f'), 'Tu es née quand');
  T.eq(spoken('heureux(se)', 'fr', 'f'), 'heureuse');
  T.eq(spoken('heureux(se)', 'fr', ''), 'heureux');
  T.eq(spoken('vérifiée(s)', 'fr', 'f'), 'vérifiée');
  T.eq(spoken('هل تعمل/ين؟', 'ar', ''), 'هل تعمل؟');
  T.eq(spoken('هل تعمل/ين؟', 'ar', 'm'), 'هل تعمل؟');
  T.eq(spoken('هل تعمل/ين؟', 'ar', 'f'), 'هل تعملين؟');
  // two whole words keep both, with a pause
  T.eq(spoken('سبت/عيد', 'ar', 'f'), 'سبت عيد');
});

/* ---------- what the voice says: SAY and the Hebrew signs (MascotSpeech.voiceLine) ---------- */
const fs = require('fs');
const vm = require('vm');
const { voiceLine, pickVoice, sayText, SAY } = globalThis.MascotSpeech;
T.section('the coin: spoken versions and signs');
T.test('₪ and ש"ח read שקלים after the number, % after a number reads אחוז', () => {
  T.eq(voiceLine('₪1,240 בחודש', 'he', ''), '1,240 שקלים בחודש');
  T.eq(voiceLine('35 ₪ לשעה', 'he', ''), '35 שקלים לשעה');
  T.eq(voiceLine('35₪ לשעה', 'he', ''), '35 שקלים לשעה');
  T.eq(voiceLine('50 ש"ח בערך', 'he', ''), '50 שקלים בערך');
  T.eq(voiceLine('50 ש״ח', 'he', ''), '50 שקלים');
  T.eq(voiceLine('₪1', 'he', ''), 'שקל אחד');
  T.eq(voiceLine('כמה ₪?', 'he', ''), 'כמה שקלים?');
  T.eq(voiceLine('בשבת מרוויחים לפחות 150%! 🤑', 'he', ''), 'בשבת מרוויחים לפחות 150 אחוז!');
  T.eq(voiceLine('12.5 %', 'he', ''), '12.5 אחוז');
  // only in Hebrew, and not inside a word
  T.eq(voiceLine('150%', 'en', ''), '150%');
  T.eq(voiceLine('משח"ח', 'he', ''), 'משח"ח');
});
T.test('a line with its own spoken version reads that version, found by its cleaned words', () => {
  SAY.he['בוא נכיר'] = 'בוא נכיר, אני שעתי';
  SAY.he['בואי נכיר'] = 'בואי נכירי ₪5';
  try {
    T.eq(voiceLine('בוא/י נכיר 😊', 'he', ''), 'בוא נכיר, אני שעתי');
    T.eq(voiceLine('בוא/י נכיר 😊', 'he', 'f'), 'בואי נכירי 5 שקלים');
    T.eq(voiceLine('משהו אחר', 'he', ''), 'משהו אחר');
    T.eq(voiceLine('toString', 'he', ''), 'toString');
  } finally { delete SAY.he['בוא נכיר']; delete SAY.he['בואי נכיר']; }
});
T.test('every SAY.he key is a line that still exists in the setup screens (views-onboarding.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'views-onboarding.js'), 'utf8');
  const lits = [];
  for (const re of [/'(?:[^'\\\n]|\\.)*'/g, /"(?:[^"\\\n]|\\.)*"/g, /`(?:[^`\\]|\\.)*`/g]) for (const m of src.match(re) || []) lits.push(m.slice(1, -1));
  const forms = new Set();
  for (const l of lits) {
    if (!/[֐-׿]/.test(l)) continue;
    // a template's text runs between its tags and ${...}, and the whole of it without the tags
    const parts = [l, l.replace(/<[^>]*>/g, ''), ...l.split(/\$\{[^}]*\}|<[^>]*>/)];
    for (const p of parts) for (const g of ['', 'f']) { const c = spoken(p, 'he', g); if (c) forms.add(c); }
  }
  T.ok(forms.size > 20, 'found the Hebrew lines of the screens: ' + forms.size);
  // the guard sees a real line, in both forms, and not a made-up one
  T.ok(forms.has('מתי נולדת?') && forms.has('איפה אתה עובד?') && forms.has('איפה את עובדת?') && !forms.has('שורה שאיננה'), 'collects the lines');
  const stale = Object.keys(SAY.he).filter((k) => !forms.has(k));
  T.eq(stale.join(' | '), '', 'SAY.he keys with no line in views-onboarding.js');
});
T.test('sayText reads data-say in place of the shown "m/f" words', () => {
  const txt = (s) => ({ nodeType: 3, nodeValue: s });
  const el = (attrs, kids) => ({ nodeType: 1, getAttribute: (n) => (n in attrs ? attrs[n] : null), childNodes: kids });
  const h1 = el({}, [txt('هل '), el({ 'data-say': 'تحصل على' }, [txt('تحصل على/تحصلين على')]), txt(' أجر؟'), { nodeType: 8, nodeValue: 'note' }]);
  T.eq(sayText(h1), 'هل تحصل على أجر؟');
  T.eq(sayText(el({}, [txt('בלי '), el({ class: 'x' }, [txt('סימון')])])), 'בלי סימון');
  T.eq(sayText(null), '');
});

/* ---------- the browser part, with a stand-in speech engine ---------- */
T.section('the coin: when it speaks');
T.test('pickVoice: offline voices only, the language\'s own country first', () => {
  const g = { lang: 'he-IL', localService: false, name: 'Google' };
  const a = { lang: 'he-IL', localService: true, name: 'Asaf' };
  const iw = { lang: 'iw_IL', localService: true, name: 'Android' };
  T.eq(pickVoice([g], 'he'), null);
  T.eq(pickVoice([g, a], 'he'), a);
  T.eq(pickVoice([iw], 'he'), iw);
  T.eq(pickVoice([{ lang: 'he-IL', name: 'unknown kind' }], 'he'), null);
  T.eq(pickVoice([{ lang: 'en-US', localService: true }], 'he'), null);
  const fr = { lang: 'fr-CA', localService: true }, frFR = { lang: 'fr-FR', localService: true };
  T.eq(pickVoice([fr, frFR], 'fr'), frFR);
  T.eq(pickVoice([], 'he'), null);
  T.eq(pickVoice(null, 'he'), null);
});
/** a fresh copy of the module in a stand-in page: { V, synth, said } */
function load(opt) {
  opt = opt || {};
  const said = [];
  const synth = {
    voices: opt.voices || [], speaking: false, pending: false, cancels: 0, listeners: [],
    getVoices() { return this.voices; },
    cancel() { this.cancels++; if (!opt.slowCancel) { this.speaking = false; this.pending = false; } },
    addEventListener(t, f) { if (t === 'voiceschanged') this.listeners.push(f); },
    removeEventListener(t, f) { this.listeners = this.listeners.filter((x) => x !== f); },
    // how each call behaves: ok (starts, ends), fail, silent (never starts), busy (never reports a start but talks),
    // lost (starts, then stops talking with no end reported; lostWords: the same after a word report), hang (talks on)
    speak(u) {
      said.push({ text: u.text, at: Date.now(), voice: u.voice });
      const mode = (opt.modes && opt.modes[said.length - 1]) || opt.mode || 'ok';
      if (mode === 'silent') return;
      if (mode === 'busy') { synth.speaking = true; return; }
      if (mode === 'fail') { setTimeout(() => u.onerror && u.onerror({}), 5); return; }
      setTimeout(() => {
        synth.speaking = true;
        if (u.onstart) u.onstart({});
        if (mode === 'lost') setTimeout(() => { synth.speaking = false; }, 100);
        else if (mode === 'lostWords') {
          setTimeout(() => u.onboundary && u.onboundary({ name: 'word', charIndex: 0, charLength: 4 }), 10);
          setTimeout(() => { synth.speaking = false; }, 100);
        }
        else if (mode === 'ok') setTimeout(() => { synth.speaking = false; if (u.onend) u.onend({}); }, opt.len || 20);
      }, 0);
    },
    fire() { this.listeners.slice().forEach((f) => f()); },
  };
  const clicks = [], events = {}, observers = [];
  const page = {
    App: {}, Fx: { prefs: () => opt.prefs || {}, play() {} }, navigator: {},
    document: {
      documentElement: { lang: 'he' },
      addEventListener(t, f) { (events[t] = events[t] || []).push(f); if (t === 'click') clicks.push(f); },
      querySelector(sel) { return opt.query ? opt.query(sel) : null; },
      createElement: () => fakeEl(),
    },
    MutationObserver: function (cb) { observers.push(cb); this.observe = () => {}; },
    setTimeout, clearTimeout, console,
  };
  if (opt.store) page.Store = opt.store;
  if (opt.webdriver) page.navigator.webdriver = true;
  if (!opt.noSpeech) { page.speechSynthesis = synth; page.SpeechSynthesisUtterance = function (t) { this.text = t; }; }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'mascot-voice.js'), 'utf8'), page);
  return { V: page.App.mascotVoice, App: page.App, synth, said, doc: page.document, click: (target) => clicks.forEach((f) => f({ target })),
    emit: (t) => (events[t] || []).forEach((f) => f({})), observed: () => observers.forEach((cb) => cb([])) };
}
/** a stand-in element: classes, attributes, style, listeners, and its place in a parent */
function fakeEl() {
  const cls = new Set(), attrs = {};
  const el = {
    nodeType: 1, style: {}, tabIndex: 0, parent: null, kids: [], listeners: {},
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    setAttribute: (n, v) => { attrs[n] = String(v); }, getAttribute: (n) => (n in attrs ? attrs[n] : null), removeAttribute: (n) => { delete attrs[n]; },
    addEventListener: (t, f) => { el.listeners[t] = f; }, removeEventListener: (t) => { delete el.listeners[t]; },
    appendChild: (c) => { el.kids.push(c); c.parent = el; },
    remove: () => { if (el.parent) el.parent.kids = el.parent.kids.filter((k) => k !== el); el.parent = null; },
    closest: () => null,
  };
  return el;
}
/** a setup screen: v holds .ob3 > .content > .m-say (the bubble's row) and the heading */
function screen(heading) {
  const say = fakeEl();
  say.querySelector = (sel) => (sel === '.m-spk' ? say.kids[0] || null : null);
  const h1 = { nodeType: 1, attrs: {}, focused: null, getAttribute: (n) => (n === 'data-say' ? null : h1.attrs[n] || null), setAttribute: (n, x) => { h1.attrs[n] = x; }, focus: (o) => { h1.focused = o; }, childNodes: [{ nodeType: 3, nodeValue: heading || 'מה שמך?' }] };
  const v = { querySelector: (sel) => (sel === '.content .m-say' ? say : sel === '.content h1' ? h1 : null), isConnected: true };
  const ob = { parentElement: v, querySelector: (sel) => (sel === '.content h1' ? h1 : null) };
  return { v, say, h1, ob, btn: () => say.kids[0] || null };
}
function coin() {
  const cls = new Set(), attrs = {}, seen = [];
  return {
    isConnected: true, seen, cls,
    classList: { add: (c) => { cls.add(c); seen.push(c); }, remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    setAttribute: (n, v) => { attrs[n] = v; seen.push(n + '=' + v); }, removeAttribute: (n) => { delete attrs[n]; }, getAttribute: (n) => attrs[n],
    querySelector: () => null, matches: () => false,
  };
}
const LOCAL = { lang: 'he-IL', localService: true, name: 'Asaf' }, NET = { lang: 'he-IL', localService: false, name: 'Google' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
T.test('silent by default: reading aloud is on only after the user turned it on', () => {
  T.eq(load({ prefs: {} }).V.enabled(), false);
  T.eq(load({ prefs: { voice: false } }).V.enabled(), false);
  T.eq(load({ prefs: { voice: true } }).V.enabled(), true);
  T.eq(load({ prefs: { voice: true, effects: false } }).V.enabled(), false);
});
T.test('available only with an offline voice; known once the list came', () => {
  let m = load({ voices: [NET] });
  T.eq(m.V.known(), true); T.eq(m.V.available(), false); T.eq(m.V.voiceFor(), null);
  m = load({ voices: [NET, LOCAL] });
  T.eq(m.V.available(), true); T.eq(m.V.voiceFor(), LOCAL);
  m = load({ voices: [] });
  T.eq(m.V.known(), false); T.eq(m.V.available(), false);
  m = load({ noSpeech: true });
  T.eq(m.V.known(), true); T.eq(m.V.available(), false);
});
T.atest('only a network voice: nothing is said and the mouth never moves', async () => {
  const { V, said } = load({ voices: [NET] });
  const c = coin();
  V.speak(c, ['שלום', 'מה שמך?']);
  await wait(60);
  T.eq(said.length, 0); T.eq(c.seen.length, 0); T.eq(V.speaking(), false);
});
T.atest('two lines: two utterances with a pause between, the offline voice, the signs read as words', async () => {
  const { V, said } = load({ voices: [NET, LOCAL] });
  const c = coin();
  V.speak(c, ['בוא/י נכיר', 'כמה ₪ לשעה?']);
  await wait(500);
  T.eq(said.map((s) => s.text).join(' | '), 'בוא נכיר | כמה שקלים לשעה?');
  T.ok(said[1].at - said[0].at >= 350, 'pause ' + (said[1].at - said[0].at));
  T.eq(said[0].voice, LOCAL);
  T.ok(c.seen.includes('talking'), 'the mouth moved while the voice spoke');
  T.eq(c.cls.has('talking'), false); T.eq(V.speaking(), false);
});
T.atest('a stop in the pause cancels the line still to come', async () => {
  const { V, said } = load({ voices: [LOCAL] });
  const c = coin();
  V.speak(c, ['אחת', 'שתיים']);
  await wait(120);
  V.stop();
  await wait(400);
  T.eq(said.length, 1); T.eq(c.cls.has('talking'), false);
});
T.atest('the coin leaving the screen stops the next line', async () => {
  const { V, said } = load({ voices: [LOCAL] });
  const c = coin();
  V.speak(() => c, ['אחת', 'שתיים']);
  await wait(60);
  c.isConnected = false;
  await wait(400);
  T.eq(said.length, 1); T.eq(V.speaking(), false);
});
T.atest('a voice that fails or never starts: quiet, no mouth', async () => {
  let m = load({ voices: [LOCAL], mode: 'fail' });
  let c = coin();
  m.V.speak(c, 'שלום');
  await wait(40);
  T.eq(m.said.length, 1); T.eq(c.seen.length, 0); T.eq(m.V.speaking(), false);
  // the first line of a page life gets 5 s (Android's offline voices are slow the first time), then it is let go
  m = load({ voices: [LOCAL], mode: 'silent' });
  c = coin();
  m.V.speak(c, 'שלום');
  await wait(2700);
  T.eq(m.V.speaking(), true, 'still waiting at 2.7 s'); T.eq(m.synth.cancels, 0);
  await wait(2400);
  T.eq(c.seen.length, 0); T.eq(m.V.speaking(), false); T.ok(m.synth.cancels >= 1, 'the held line was cancelled');
});
T.atest('after a voice has started once, a silent line is let go at 2.5 s', async () => {
  const m = load({ voices: [LOCAL], modes: ['ok', 'silent'] });
  m.V.speak(coin(), 'שלום');
  await wait(60);
  T.eq(m.V.speaking(), false);
  const c = coin();
  m.V.speak(c, 'שוב');
  await wait(2600);
  T.eq(m.V.speaking(), false); T.eq(c.seen.length, 0);
});
T.atest('a voice that talks without reporting its start is never cut at the start limit', async () => {
  const m = load({ voices: [LOCAL], modes: ['ok', 'busy'] });
  m.V.speak(coin(), 'שלום');
  await wait(60);
  const before = m.synth.cancels;
  m.V.speak(coin(), 'אב');
  await wait(2700);
  T.eq(m.synth.cancels, before, 'not cancelled while the engine talks');
  T.eq(m.V.speaking(), true);
});
T.atest('an end that never comes: the rhythm sees the engine quiet twice and ends the line', async () => {
  const m = load({ voices: [LOCAL], mode: 'lost' });
  const c = coin();
  m.V.speak(c, 'שלום לך');
  await wait(800);
  T.eq(m.V.speaking(), false); T.eq(c.cls.has('talking'), false, 'the mouth is at rest');
});
T.atest('word reports, then no end: the engine poll ends the line, the next one starts well before the cap', async () => {
  const m = load({ voices: [LOCAL], modes: ['lostWords', 'ok'] });
  const c = coin();
  m.V.speak(c, ['שורה ארוכה למדי לבדיקה', 'שתיים']); // the first line's cap is above 4.5 s
  await wait(1100);
  T.eq(m.said.length, 2, 'the second line went out after the pause');
  T.ok(m.said[1].at - m.said[0].at < 1000, 'gap ' + (m.said[1].at - m.said[0].at));
  await wait(100);
  T.eq(m.V.speaking(), false); T.eq(c.cls.has('talking'), false);
});
T.atest('an engine that talks on with no end: the line ends at its cap', async () => {
  const m = load({ voices: [LOCAL], mode: 'hang' });
  const c = coin();
  m.V.speak(c, 'אב'); // cap 1500 + 2 * 150 ms
  await wait(1500);
  T.eq(m.V.speaking(), true);
  await wait(500);
  T.eq(m.V.speaking(), false); T.eq(c.cls.has('talking'), false); T.ok(m.synth.cancels >= 1, 'the engine was silenced');
});
T.test('an engine still busy right after cancel gets the line 60 ms later; a free one at once', () => {
  let m = load({ voices: [LOCAL] });
  m.synth.speaking = true;
  m.V.speak(coin(), 'שלום');
  T.eq(m.said.length, 1, 'spoken at once');
  m = load({ voices: [LOCAL], slowCancel: true });
  m.synth.speaking = true;
  m.V.speak(coin(), 'שלום');
  T.eq(m.said.length, 0, 'held');
});
T.atest('...and the held line goes out a moment later', async () => {
  const m = load({ voices: [LOCAL], slowCancel: true, len: 5000 });
  m.synth.speaking = true;
  m.V.speak(coin(), 'שלום');
  await wait(120);
  T.eq(m.said.length, 1);
});
T.atest('first tap before the voices are listed: it waits for them, then speaks', async () => {
  const { V, synth, said } = load({ voices: [] });
  const c = coin();
  V.speak(c, 'שלום');
  await wait(100);
  T.eq(said.length, 0);
  synth.voices = [LOCAL];
  synth.fire();
  await wait(60);
  T.eq(said.length, 1); T.eq(said[0].voice, LOCAL);
});
T.atest('the list never comes: after the wait, silence; a newer stop cancels the wait', async () => {
  let m = load({ voices: [] });
  m.V.speak(coin(), 'שלום');
  await wait(1600);
  T.eq(m.said.length, 0); T.eq(m.V.speaking(), false);
  m = load({ voices: [] });
  m.V.speak(coin(), 'שלום');
  m.V.stop();
  m.synth.voices = [LOCAL]; m.synth.fire();
  await wait(60);
  T.eq(m.said.length, 0);
});

/* ---------- the speaker button: no late jumps (drawn with the screen, never added or taken away after) ---------- */
T.section('the coin: the speaker button');
function setup(opt) {
  const s = screen();
  const c = coin();
  const m = load(Object.assign({ query: (sel) => (sel === '.ob3' ? s.ob : /mascot/.test(sel) ? c : null) }, opt));
  return Object.assign(m, { s, c });
}
T.test('the list known with no offline voice: no button is drawn', () => {
  const m = setup({ voices: [NET] });
  m.App.mascotStep(m.s.v, 'name', 'next');
  T.eq(m.s.btn(), null);
});
T.atest('the list not known yet: a button; no offline voice arrives: the same button, invisible and inert, in its place', async () => {
  const m = setup({ voices: [] });
  m.App.mascotStep(m.s.v, 'name', 'next');
  const b = m.s.btn();
  T.ok(b, 'drawn while the list is not known');
  T.eq(b.getAttribute('aria-pressed'), 'false');
  m.synth.voices = [NET];
  m.synth.fire();
  T.ok(b.style.visibility !== 'hidden', 'not at once: more of the list may still come');
  await wait(650);
  T.eq(m.s.btn(), b, 'still there');
  T.eq(b.style.visibility, 'hidden'); T.eq(b.getAttribute('aria-hidden'), 'true'); T.eq(b.tabIndex, -1);
  T.ok(b.classList.contains('m-spk-none') && !b.classList.contains('m-spk-invite'), 'no pulse on an invisible button');
  // the same screen drawn again (an answer tapped) keeps the place; the next screen draws none
  const again = screen();
  m.s.v.querySelector = again.v.querySelector;
  m.App.mascotStep(m.s.v, 'name', 'next');
  T.ok(again.btn() && again.btn().style.visibility === 'hidden', 'kept invisible on the same screen');
  const next = screen();
  m.s.v.querySelector = next.v.querySelector;
  m.App.mascotStep(m.s.v, 'work', 'next');
  T.eq(next.btn(), null);
});
T.test('an offline voice arrives late: the drawn button stays and invites once (never chose)', () => {
  const m = setup({ voices: [] });
  m.App.mascotStep(m.s.v, 'name', 'next');
  const b = m.s.btn();
  T.ok(!b.classList.contains('m-spk-invite'), 'no pulse before a voice is known');
  m.synth.voices = [LOCAL];
  m.synth.fire();
  T.eq(m.s.btn(), b);
  T.ok(b.classList.contains('m-spk-invite'), 'the pulse');
  T.ok(b.style.visibility !== 'hidden');
  // the pulse ends with its own animation, not with the button's entrance
  b.listeners.animationend({ animationName: 'bubble-in' });
  T.ok(b.classList.contains('m-spk-invite'), 'kept through bubble-in');
  b.listeners.animationend({ animationName: 'spk-invite' });
  T.ok(!b.classList.contains('m-spk-invite'), 'removed at its end');
  const next = screen();
  m.s.v.querySelector = next.v.querySelector;
  m.App.mascotStep(m.s.v, 'work', 'next');
  T.ok(next.btn() && !next.btn().classList.contains('m-spk-invite'), 'once a page life');
});
T.test('no invitation for someone who already chose', () => {
  const m = setup({ voices: [LOCAL], prefs: { voice: false } });
  m.App.mascotStep(m.s.v, 'name', 'next');
  T.ok(m.s.btn() && !m.s.btn().classList.contains('m-spk-invite'));
});
T.test('turning it on speaks inside the tap itself, before the save; off stops at once', () => {
  let saved = null, settle = null;
  const store = { S: { settings: {} }, setSettings: (fn) => new Promise((r) => { const s = { fx: {} }; fn(s); saved = s.fx.voice; settle = r; }) };
  const m = setup({ voices: [LOCAL], store });
  m.App.mascotStep(m.s.v, 'name', 'next');
  const b = m.s.btn();
  b.closest = (sel) => (sel === '.m-spk' ? b : sel === '.ob3' ? m.s.ob : null);
  m.click(b);
  T.eq(m.said.length, 1, 'spoken in the same tap');
  T.eq(m.said[0].text, 'מה שמך?');
  T.eq(b.getAttribute('aria-pressed'), 'true', 'the button shows it at once');
  T.eq(saved, true, 'saved as true');
  T.ok(!b.classList.contains('m-spk-invite'));
  m.click(b);
  T.eq(m.V.speaking(), false, 'off stops at once');
  T.eq(saved, false, 'saved as false');
  T.eq(b.getAttribute('aria-pressed'), 'false');
  settle();
});
T.test('the Settings switch: shown with a voice or while the list is not known, then it stays', () => {
  T.eq(load({ voices: [LOCAL] }).V.showSwitch(), true);
  T.eq(load({ voices: [NET] }).V.showSwitch(), false);
  T.eq(load({ noSpeech: true }).V.showSwitch(), false);
  const m = load({ voices: [] });
  T.eq(m.V.showSwitch(), true);
  m.synth.voices = [NET];
  T.eq(m.V.showSwitch(), true, 'kept for this page life: a redraw never takes it away');
});
T.test('a spoken version can differ by gender ({ m, f }), unknown reads the masculine', () => {
  const { SAY, voiceLine } = globalThis.MascotSpeech;
  const key = 'בדיקה לך?';
  SAY.he[key] = { m: 'בדיקה לְךָ?', f: 'בדיקה לָךְ?' };
  try {
    T.eq(voiceLine('בדיקה לך?', 'he', 'f'), 'בדיקה לָךְ?');
    T.eq(voiceLine('בדיקה לך?', 'he', 'm'), 'בדיקה לְךָ?');
    T.eq(voiceLine('בדיקה לך?', 'he', ''), 'בדיקה לְךָ?');
  } finally { delete SAY.he[key]; }
});

T.atest('the list in parts: the listener stays, a waiting line speaks once its voice arrives, the button never blinks', async () => {
  const m = setup({ voices: [] });
  m.App.mascotStep(m.s.v, 'name', 'next');
  const b = m.s.btn();
  m.V.speak(coin(), 'שלום');
  m.synth.voices = [NET];
  m.synth.fire();
  await wait(100);
  T.eq(m.said.length, 0, 'no voice for it yet');
  m.synth.voices = [NET, LOCAL];
  m.synth.fire();
  await wait(60);
  T.eq(m.said.length, 1); T.eq(m.said[0].voice, LOCAL);
  T.eq(m.synth.listeners.length, 1, 'still listening');
  await wait(650);
  T.ok(b.style.visibility !== 'hidden', 'never hidden');
});
T.atest('no voices 5 s after the first ask: known and empty, the button goes quiet in place; a test browser stays "not known"', async () => {
  const m = setup({ voices: [] });
  const w = load({ voices: [], webdriver: true });
  m.App.mascotStep(m.s.v, 'name', 'next');
  const b = m.s.btn();
  T.eq(m.V.known(), false);
  await wait(3500);
  T.eq(m.V.known(), false, 'still waiting at 3.5 s (a cold Android engine)');
  T.ok(b.style.visibility !== 'hidden');
  await wait(1700);
  T.eq(m.V.known(), true); T.eq(m.V.available(), false);
  T.eq(m.s.btn(), b); T.eq(b.style.visibility, 'hidden');
  // the voice arrives just after: the button stays invisible on this screen (no hide and show), a redraw of the
  // same screen keeps it so, and the next screen draws it normally
  m.synth.voices = [LOCAL]; m.synth.fire();
  T.eq(b.style.visibility, 'hidden', 'no blink');
  const again = screen();
  m.s.v.querySelector = again.v.querySelector;
  m.App.mascotStep(m.s.v, 'name', 'next');
  T.eq(again.btn() && again.btn().style.visibility, 'hidden', 'the same screen drawn again: still invisible');
  const next = screen();
  m.s.v.querySelector = next.v.querySelector;
  m.App.mascotStep(m.s.v, 'work', 'next');
  T.ok(next.btn() && next.btn().style.visibility !== 'hidden' && next.btn().getAttribute('aria-hidden') == null, 'the next screen: a normal button');
  T.eq(w.V.known(), false, 'webdriver: not known, the QA suites see the Settings switch as before');
  T.eq(w.V.showSwitch(), true);
});
T.atest('the speak timer checks again when it fires: a hidden page says nothing', async () => {
  const m = setup({ voices: [LOCAL], prefs: { voice: true } });
  m.App.mascotStep(m.s.v, 'name', 'next');
  m.doc.hidden = true;
  await wait(260);
  T.eq(m.said.length, 0);
  const n = setup({ voices: [LOCAL], prefs: { voice: true } });
  n.App.mascotStep(n.s.v, 'name', 'next');
  n.doc.hidden = true; n.emit('visibilitychange');
  n.doc.hidden = false;
  await wait(260);
  T.eq(n.said.length, 0, 'the hidden page cleared the timer');
  const o = setup({ voices: [LOCAL], prefs: { voice: true } });
  o.App.mascotStep(o.s.v, 'name', 'next');
  await wait(260);
  T.eq(o.said.length, 1, 'in front: it speaks');
});
T.atest('the setup closing forgets the quiet screen', async () => {
  const m = setup({ voices: [] });
  m.App.mascotStep(m.s.v, 'name', 'next');
  m.synth.voices = [NET]; m.synth.fire();
  await wait(650);
  // the setup closes (the observer sees no .ob3), then opens again on the same screen: no button at all
  m.observed();
  const again = screen();
  m.s.v.querySelector = again.v.querySelector;
  m.App.mascotStep(m.s.v, 'name', 'next');
  T.eq(again.btn(), null);
});
T.atest('a focused button that goes quiet hands the focus to the question', async () => {
  const m = setup({ voices: [] });
  m.App.mascotStep(m.s.v, 'name', 'next');
  const b = m.s.btn();
  b.closest = (sel) => (sel === '.ob3' ? m.s.ob : null);
  m.doc.activeElement = b;
  m.synth.voices = [NET]; m.synth.fire();
  await wait(650);
  T.eq(m.s.h1.attrs.tabindex, '-1'); T.ok(m.s.h1.focused && m.s.h1.focused.preventScroll === true, 'focused without a scroll');
});
T.test('a comma left before the end once the emoji are gone, in every language', () => {
  T.eq(spoken('נעים מאוד, 😍🔥!', 'he', ''), 'נעים מאוד!');
  T.eq(spoken('Nice to meet you, 😍!', 'en', ''), 'Nice to meet you!');
  T.eq(spoken('تشرفنا، 😍!', 'ar', ''), 'تشرفنا!');
  T.eq(spoken('ደስ ብሎኛል፣ 😍።', 'am', ''), 'ደስ ብሎኛል።');
  T.eq(spoken('שלום, 😍', 'he', ''), 'שלום');
  T.eq(spoken('אחת, שתיים', 'he', ''), 'אחת, שתיים');
  T.eq(spoken('₪1,240!', 'he', ''), '₪1,240!');
});
T.test('the bubble is read up to 90 characters (a translated greeting with a long name)', () => {
  const m = load({ voices: [LOCAL] });
  const text = (n) => ({ nodeType: 1, getAttribute: () => null, childNodes: [{ nodeType: 3, nodeValue: 'א'.repeat(n) }] });
  const scope = (n) => ({ querySelector: (sel) => (sel === '.content .m-say .bubble' ? text(n) : sel === '.content h1' ? text(3) : null) });
  T.eq(m.V.lineOf(scope(85)).length, 2);
  T.eq(m.V.lineOf(scope(95)).length, 1);
});
T.test('ש"ח with a one-letter prefix, and a dash between numbers reads עד', () => {
  T.eq(voiceLine('המחיר בש"ח', 'he', ''), 'המחיר בשקלים');
  T.eq(voiceLine('לש״ח אחד', 'he', ''), 'לשקלים אחד');
  T.eq(voiceLine('50%-60% מהשכר', 'he', ''), '50 אחוז עד 60 אחוז מהשכר');
  T.eq(voiceLine('בין 40-50 שעות', 'he', ''), 'בין 40 עד 50 שעות');
  T.eq(voiceLine('₪30–₪40', 'he', ''), '30 שקלים עד 40 שקלים');
  T.eq(voiceLine('30-40 ₪', 'he', ''), '30 עד 40 שקלים');
  T.eq(voiceLine('טלפון 050-1234567', 'he', ''), 'טלפון 050-1234567');
  T.eq(voiceLine('ל-20 שעות', 'he', ''), 'ל-20 שעות');
});
T.test('a word a voice reads two ways gets its nikud in any line, by gender; the shown line keeps its letters', () => {
  const { voiceLine } = globalThis.MascotSpeech;
  T.eq(voiceLine('גיל 15! יש לך זכויות מיוחדות, נדאג להן 🛡️', 'he', 'f'), 'גיל 15! בגיל הזה יש זכויות מיוחדות, נדאג להן', 'her: neutral words');
  T.eq(voiceLine('בדיקה לך', 'he', 'f'), 'בדיקה לָךְ', 'a word outside her phrases still gets its nikud');
  T.eq(voiceLine('גיל 17! יש לך זכויות', 'he', 'm'), 'גיל 17! יש לְךָ זכויות');
  T.eq(voiceLine('מתי נולדת?', 'he', ''), 'מתי נוֹלַדְתָּ?');
  // in a line of its own (the setup's two lines with these words are read in other words, SAY)
  T.eq(voiceLine('מתי התחלת?', 'he', 'f'), 'מתי הִתְחַלְתְּ?');
  T.eq(voiceLine('כמה הרווחת היום?', 'he', 'f'), 'כמה הִרְוַחְתְּ היום?');
  T.eq(voiceLine('ולך הביתה', 'he', 'f'), 'ולך הביתה', 'only a whole word');
  T.eq(voiceLine('איפה את עובדת?', 'he', 'f'), 'מה מקום העבודה?');
  T.eq(voiceLine('Shall I tell you', 'en', 'f'), 'Shall I tell you');
});
T.test('the owner\'s listening (20 Nov 2026): every Hebrew setup line, for him and for her, says exactly this', () => {
  // the real setup screens, run the way tools/voice-lines.js lists them (a stop added where a line has none)
  const { build } = require(path.join(__dirname, '..', 'tools', 'voice-lines.js'));
  const rows = build(['he']).out;
  const said = (g) => rows.filter((r) => r.gender === g).map((r) => r.display + ' => ' + r.spoken);
  // the same for both: lines the owner marked good, and the two read in other words
  const both = (name, f) => [
    `${f ? 'בוא/י' : 'בוא/י'} נכיר 😊 => ${f ? 'בואי' : 'בוא'} נכיר.`,
    `איך קוראים לך? => ${f ? 'מה השם' : 'איך קוראים לְךָ'}?`,
    `נעים מאוד, ${name}! 😍 => נעים מאוד, ${name}!`,
    'שאלה קטנה על הגיל 🎂 => שאלה קטנה על הגיל.',
    `מתי נולדת? => ${f ? 'מה תאריך הלידה' : 'מתי נוֹלַדְתָּ'}?`,
    `גיל 16! יש לך זכויות מיוחדות, נדאג להן 🛡️ => גיל 16! ${f ? 'בגיל הזה יש' : 'יש לְךָ'} זכויות מיוחדות, נדאג להן.`,
    'גיל 25, מעולה 👍 => גיל 25, מְעוּלֶּה.',
    'איפה עובדים? 🤔 => איפה עובדים?',
    f ? 'איפה את עובדת? => מה מקום העבודה?' : 'איפה אתה עובד? => איפה אתה עובד?',
    'אחלה! עכשיו נדע כמה הרווחת 💸 => אחלה! עכשיו נדע כמה מרוויחים.',
    'שתי שאלות קצרות על העבודה ⏱️ => שתי שאלות קצרות על העבודה.',
    `משלמים לך על ההפסקה? => משלמים ${f ? '' : 'לְךָ '}על ההפסקה?`,
    'הרבה שוכחים את זה! 🚌 => הרבה שוכחים את זה!',
    f ? 'מקבלת כסף על נסיעות? => מקבלת כסף על נסיעות?' : 'מקבל כסף על נסיעות? => מקבל כסף על נסיעות?',
    'בשבת מרוויחים לפחות 150%! 🤑 => בשבת מרוויחים לפחות 150 אחוז!',
    'באיזו עיר העבודה? => באיזו עיר העבודה?',
    'אחרונה! 🏁 => אחרונה!',
    'מתי התחלת לעבוד שם? => מתי היה היום הראשון בעבודה?',
    `הכול מוכן, ${name}! 🎉 => הכול מוכן, ${name}!`,
    'הכול מוכן! 🎉 => הכול מוכן!',
    'הנתונים לדוגמה מוכנים! => הנתונים לדוגמה מוכנים!',
  ];
  T.eq(said('m').join('\n'), both('נדב', false).join('\n'), 'him (נדב)');
  T.eq(said('f').join('\n'), both('מיכל', true).join('\n'), 'her (מיכל)');
  // a gendered word never reaches the voice bare, her lines never carry his forms (or his hers), and no line carries
  // what the phone voice cannot say (לָךְ read lecha, נוֹלַדְתְּ, אַתְּ read "ate", ממתי)
  const CANNOT = ['לָךְ', 'נוֹלַדְתְּ', 'הִרְוַחְתְּ', 'הִתְחַלְתְּ', 'אַתְּ', 'ממתי'];
  const HIS = ['לְךָ', 'נוֹלַדְתָּ', 'הִרְוַחְתָּ', 'הִתְחַלְתָּ', 'אתה', 'עובד?', 'מקבל '], HERS = ['לָךְ', 'נוֹלַדְתְּ', 'הִרְוַחְתְּ', 'הִתְחַלְתְּ', 'אַתְּ', 'עובדת', 'מקבלת', 'בואי'];
  for (const r of rows) {
    const words = r.spoken.split(/[^א-תְ-ׇ]+/);
    for (const w of ['לך', 'נולדת', 'הרווחת', 'התחלת', 'מעולה']) T.ok(!words.includes(w), `"${w}" without nikud in: ${r.spoken} (${r.gender || '-'})`);
    for (const w of CANNOT) T.ok(!r.spoken.includes(w), `"${w}" (the voice cannot say it) in: ${r.spoken} (${r.gender || '-'})`);
    if (r.gender === 'f') for (const w of HIS) T.ok(!r.spoken.includes(w), `his "${w}" in her line: ${r.spoken}`);
    if (r.gender === 'm') for (const w of HERS) T.ok(!r.spoken.includes(w), `her "${w}" in his line: ${r.spoken}`);
  }
  // what the app itself passes (no stop added): the two lines in other words, by their shown text
  T.eq(voiceLine('אחלה! עכשיו נדע כמה הרווחת 💸', 'he', 'f'), 'אחלה! עכשיו נדע כמה מרוויחים');
  T.eq(voiceLine('מתי התחלת לעבוד שם?', 'he', 'm'), 'מתי היה היום הראשון בעבודה?');
  // each of her phrases is still in the setup screens, so a reworded screen cannot leave one behind
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'views-onboarding.js'), 'utf8');
  for (const [a] of globalThis.MascotSpeech.HE_FOR_HER) T.ok(src.includes(a), `her phrase "${a}" is in views-onboarding.js`);
  T.eq(voiceLine('גיל 25, מעולה 👍', 'he', 'f'), 'גיל 25, מְעוּלֶּה');
});
