/* ============================================================
 * voice-lines.js — the listening sheet: every line the coin (שעתי) reads aloud in the first-run setup, per language
 * and per gender, with warnings for words a phone voice may read badly. Dev tool, nothing in the app uses it.
 *
 *   node tools/voice-lines.js <out.json>
 *
 * How it finds the lines: the setup screens (src/app/views-onboarding.js, its "screens" object) are translated the
 * way the build does it (tools/i18n.js applyCode) and run with small stand-ins for the app, once for each state that
 * changes the bubble or the heading (a name typed or not, an age under or over 18, a role filled in, sample data).
 * Each screen's bubble line and <h1> are then cleaned as the coin cleans them (app/mascot-voice.js lineOf):
 * MascotSpeech.voiceLine when it exists, else MascotSpeech.spoken; a bubble longer than 60 characters is not read.
 * Output: a JSON array of { lang, screen, gender, kind: 'bubble'|'heading', display, spoken, flags[, suggest] },
 * in screen order, one entry per distinct line within a language and gender ('' not known, 'm', 'f').
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const I18N = require('./i18n.js');

const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'src', 'app', 'mascot-voice.js'));
const MS = globalThis.MascotSpeech;
const voice = (t, lang, gender) => (typeof MS.voiceLine === 'function' ? MS.voiceLine(t, lang, gender) : MS.spoken(t, lang, gender));

const LANGS = ['he', 'en', 'ru', 'ar', 'fr', 'es', 'am'];
const GENDERS = ['', 'm', 'f'];
const NAME = { '': 'נדב', m: 'נדב', f: 'מיכל' };
const FILE = 'app/views-onboarding.js';
const SRC = fs.readFileSync(path.join(ROOT, 'src', FILE), 'utf8');

/** the code from the gender helper g() to the end of the screens object, in a language */
function screensCode(lang) {
  const code = lang === 'he' ? SRC : I18N.applyCode(SRC, FILE, I18N.dictOf(lang));
  const a = code.indexOf('const g = (m, f, x)');
  const b = code.indexOf('/* answers -> what gets saved');
  if (a < 0 || b < 0) throw new Error('views-onboarding.js changed: the screens object was not found');
  return code.slice(a, b);
}

/* ---------------- stand-ins for the app ---------------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
const U = {
  money: (n) => `${n} ₪`, num: (n) => String(n), addDays: () => '2000-01-01', todayKey: () => '2026-11-16', uid: () => 'x',
  plural: (n, forms) => { const k = new Intl.PluralRules('en').select(n); return forms[k] || forms.other || ''; },
};
const PARAMS = ['U', 'Engine', 'Store', 'UI', 'App', 'Defaults', 'root', 'A', 'st', 'today', 'icon', 'esc', 'USUAL_TRAVEL', 'JOBS', 'finalJobs', 'finalMore', 'finalTravel', 'needsLogin', 'msg', 'demo'];

/** the screens object for one state; s: { gender, name, ageN, jobs, travel, demo } */
function screensFor(code, s) {
  const A = {
    name: s.name || '', gender: s.gender, birth: s.ageN ? '2000-01-01' : '', adult: false,
    jobs: [{ id: 'r', name: s.jobs ? 'קופה' : '', rate: '', color: '#888' }], more: [],
    travel: s.travel || '', travelAmount: '', city: '', brk: '', week: '', start: '', startPick: '', empName: '',
  };
  const Engine = { ageAt: () => s.ageN, legalMinWage: () => ({ hourly: 35.4 }) };
  const App = { mascotSays: (mood, html) => `<div class="bubble">${html}</div>`, mascot: () => '', placeField: () => '' };
  const UI = { esc, icon: () => '', tile: () => '', numIn: () => null };
  const prev = globalThis.U;
  globalThis.U = U; // a translated plural form calls globalThis.U.plural
  try {
    const make = new Function(...PARAMS, `'use strict';\n${code}\nreturn screens;`);
    return make(U, Engine, {}, UI, App, { ROLE_COLORS: ['#888'], defaultEmployer: () => ({ name: '' }) }, {}, A,
      { rest: { city: 'תל אביב' }, gender: s.gender }, '2026-11-16', UI.icon, esc, 16, [],
      () => [{ name: 'קופה', rate: 35.4, color: '#888' }], () => [], () => 16, () => false, '', !!s.demo);
  } finally { globalThis.U = prev; }
}

/** an element's textContent, roughly: tags out, entities decoded */
const text = (html) => html.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }[e])).replace(/\s+/g, ' ').trim();
function partsOf(html) {
  const b = /<div class="bubble">([\s\S]*?)<\/div>/.exec(html), h = /<h1>([\s\S]*?)<\/h1>/.exec(html);
  return { bubble: b ? text(b[1]) : '', heading: h ? text(h[1]) : '' };
}

/* the states that change what a screen says, in screen order (the welcome screen 'hi' is not read aloud) */
const SCREENS = [
  ['me', [{}, { name: true }]],
  ['age', [{}, { ageN: 16 }, { ageN: 25 }]],
  ['job', [{}, { jobs: true }]],
  ['rules', [{}]],
  ['travel', [{}, { travel: 'yes' }]],
  ['city', [{}]],
  ['start', [{}]],
  ['done', [{ name: true }, {}, { demo: true }]],
];

/* ---------------- warnings ---------------- */
const HEB = /[֐-׿]/, NONLATIN = { he: 1, ar: 1, ru: 1, am: 1 };
/* Hebrew words a voice reads wrongly without vowel marks: the word, the intended reading per gender, a note */
const AMBIG = {
  'לך': { m: 'לְךָ', f: 'לָךְ', note: 'lecha (m) / lach (f); a voice may also read lech, "go"' },
  'נולדת': { m: 'נוֹלַדְתָּ', f: 'נוֹלַדְתְּ', note: 'noladta (m) / nolad\'t (f)' },
  'הרווחת': { m: 'הִרְוַחְתָּ', f: 'הִרְוַחְתְּ', note: 'hirvachta (m) / hirvacht (f)' },
  'התחלת': { m: 'הִתְחַלְתָּ', f: 'הִתְחַלְתְּ', note: 'hitchalta (m) / hitchalt (f)' },
  'מעולה': { m: 'מְעוּלֶּה', f: 'מְעוּלֶּה', note: 'meule; a voice may read meula' },
  'את': { f: 'אַתְּ', note: 'at, "you" (f); a voice may read et, the object marker', only: /(^|[^א-ת])את [א-ת]+ת(?![א-ת])/ },
};
function flagsOf(lang, gender, display, spoken) {
  const f = [], sug = [];
  if (/\d/.test(spoken)) f.push('digits:' + spoken.match(/[\d.,]*\d%?/g).join(','));
  if (spoken.includes('%')) f.push('percent');
  if (spoken.includes('₪')) f.push('shekel-sign');
  if (NONLATIN[lang]) for (const w of new Set(spoken.match(/[A-Za-z][A-Za-z'-]+/g) || [])) f.push('latin:' + w);
  for (const w of new Set(spoken.match(/\b[A-Z]{2,}\b/g) || [])) f.push('acronym:' + w);
  for (const w of new Set(spoken.match(/[א-ת]+["״][א-ת]+|[א-ת]+['׳](?=[\s.,!?]|$)/g) || [])) f.push('abbrev:' + w);
  for (const w of new Set(spoken.match(/(?:^|\s)\p{L}{1,3}\.(?:\s?\p{L}{1,3}\.)+/gu) || [])) f.push('abbrev:' + w.trim());
  for (const c of new Set(spoken.match(/[\/\\|*#@&+=~^_\[\]{}<>·•→←–—;()"]/g) || [])) f.push('punct:' + c);
  if (spoken.length > 90) f.push('long:' + spoken.length);
  // a slash pair the cleaner does not know (outside Hebrew): read as two words
  if (lang !== 'he') for (const w of new Set(display.match(/\p{L}+\/\p{L}+/gu) || [])) f.push('slash-pair:' + w);
  if (lang === 'he') {
    for (const w of spoken.split(/[^א-ת]+/).filter(Boolean)) {
      const a = AMBIG[w];
      if (!a || f.some((x) => x.startsWith('ambiguous:' + w + ' '))) continue;
      if (a.only && !a.only.test(spoken)) continue; // את before a present-tense verb (את עובדת), not the object marker (את זה)
      f.push(`ambiguous:${w} (${a.note})`);
      const want = gender === 'f' ? a.f : a.m;
      if (want) sug.push([w, want]);
    }
    if (spoken.includes('%')) sug.push([/(\d+)%/, (m, n) => n === '150' ? 'מאה וחמישים אחוז' : n + ' אחוז']);
  }
  let suggest = null;
  if (sug.length) {
    suggest = spoken;
    for (const [w, to] of sug) suggest = typeof w === 'string' ? suggest.replace(new RegExp(`(^|[^\\u05d0-\\u05ea])${w}(?![\\u05d0-\\u05ea])`, 'g'), (m, p) => p + to) : suggest.replace(w, to);
  }
  return { flags: f, suggest };
}

/* ---------------- the sheet ---------------- */
/** langs: the languages to list (all by default); tests/mascot-voice.test.js lists Hebrew only */
function build(langs = LANGS) {
  const out = [], skipped = [];
  for (const lang of langs) {
    const code = screensCode(lang);
    for (const gender of GENDERS) {
      const seen = new Set();
      for (const [screen, states] of SCREENS) {
        for (const st of states) {
          const sc = screensFor(code, { gender, name: st.name ? NAME[gender] : '', ageN: st.ageN || null, jobs: st.jobs, travel: st.travel, demo: st.demo });
          const p = partsOf(sc[screen]());
          for (const kind of ['bubble', 'heading']) {
            const display = p[kind];
            if (!display) continue;
            let spoken = voice(display, lang, gender);
            if (!spoken) continue;
            // mascot-voice.js lineOf: a long bubble is not read; each part ends with a stop
            if (kind === 'bubble' && spoken.length > 60) { skipped.push({ lang, gender, screen, display }); continue; }
            if (!/[.!?:…؟]$/.test(spoken)) spoken += '.';
            const key = kind + '|' + display + '|' + spoken;
            if (seen.has(key)) continue;
            seen.add(key);
            const { flags, suggest } = flagsOf(lang, gender, display, spoken);
            const row = { lang, screen, gender, kind, display, spoken, flags };
            if (suggest && suggest !== spoken) row.suggest = suggest;
            out.push(row);
          }
        }
      }
    }
  }
  return { out, skipped };
}

module.exports = { build };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.log('usage: node tools/voice-lines.js <out.json>'); process.exit(1); }
  const { out, skipped } = build();
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  console.log(`voice lines (${typeof MS.voiceLine === 'function' ? 'MascotSpeech.voiceLine' : 'MascotSpeech.spoken'}) -> ${file}`);
  for (const lang of LANGS) {
    const rows = out.filter((r) => r.lang === lang);
    console.log(`  ${lang}: ${rows.length} lines (${GENDERS.map((g) => `${g || '-'} ${rows.filter((r) => r.gender === g).length}`).join(', ')}), ${rows.filter((r) => r.flags.length).length} flagged`);
  }
  if (skipped.length) console.log(`not read aloud (bubble over 60 characters): ${skipped.length}`);
  console.log('\nflagged:');
  for (const r of out.filter((x) => x.flags.length)) console.log(`  [${r.lang} ${r.gender || '-'} ${r.screen} ${r.kind}] ${r.spoken}\n      ${r.flags.join(' | ')}${r.suggest ? `\n      suggest: ${r.suggest}` : ''}`);
}

module.exports = { build };
