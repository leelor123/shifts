/* Checks the Android shell's texts without building it (node tools/android-strings-check.js; tools/android.js runs it
 * before it copies android/widgets into the project).
 *   - values/w_strings.xml (the default, Hebrew) and every translation (values-en, -ru, -ar, -fr, -es, -am) hold the
 *     same strings and plurals, with the same %1$s… placeholders, and nothing aapt would refuse (a bare ' or ").
 *   - every R.string / R.plurals the Java sources use and every @string/ the layouts, widget infos and the manifest
 *     lines in tools/android.js use is defined.
 *   - no text is left in the Java code or in a layout: a Hebrew letter in Java outside a comment, or in a layout
 *     attribute, fails (every user-visible text comes from the string resources, in the app's language).
 *   - the app's language: every language src/app/lang.js has is in WidgetLang.LANGS and has its values-xx folder, a
 *     snapshot without lang falls back to Hebrew (the default folder), and src/app/widgets.js sends lang.
 *   - the direction: each layout's _rtl/_ltr copy matches tools/android-layouts.js, the Java code uses only those, and
 *     every text or description a layout holds is also written by the code (the launcher would read the layout's own
 *     in the phone's language).
 * Exit code 1 with the list of problems, 0 when all is well. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const W = path.join(ROOT, 'android', 'widgets');
const RES = path.join(W, 'res');
const LANGS = ['en', 'ru', 'ar', 'fr', 'es', 'am'];
const HEBREW = /[֐-׿יִ-ﭏ]/;
const QUANTITIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** The strings and plurals of one w_strings.xml: { strings: {name: text}, plurals: {name: {quantity: text}} }. */
function parse(file, problems) {
  const x = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const out = { strings: {}, plurals: {}, plain: new Set() };
  const rel = path.relative(ROOT, file);
  for (const m of x.matchAll(/<string\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/string>/g)) {
    if (out.strings[m[1]] !== undefined) problems.push(`${rel}: ${m[1]} twice`);
    out.strings[m[1]] = m[3];
    if (/formatted="false"/.test(m[2])) out.plain.add(m[1]); // a text with a % of its own, never formatted
  }
  for (const m of x.matchAll(/<plurals\s+name="([^"]+)"\s*>([\s\S]*?)<\/plurals>/g)) {
    const items = {};
    for (const it of m[2].matchAll(/<item\s+quantity="([^"]+)"\s*>([\s\S]*?)<\/item>/g)) {
      if (!QUANTITIES.includes(it[1])) problems.push(`${rel}: ${m[1]} has an unknown quantity "${it[1]}"`);
      items[it[1]] = it[2];
    }
    if (!items.other) problems.push(`${rel}: ${m[1]} has no "other"`);
    out.plurals[m[1]] = items;
  }
  const opened = (x.match(/<string\b/g) || []).length, plur = (x.match(/<plurals\b/g) || []).length;
  if (opened !== Object.keys(out.strings).length || plur !== Object.keys(out.plurals).length) problems.push(`${rel}: a string or plurals entry could not be read (broken XML?)`);
  const texts = [...Object.entries(out.strings), ...Object.entries(out.plurals).flatMap(([k, v]) => Object.values(v).map((t) => [k, t]))];
  for (const [k, t] of texts) {
    if (/(^|[^\\])['"]/.test(t)) problems.push(`${rel}: ${k} has a bare ' or " (aapt refuses it; write \\' or \\")`);
    if (/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(t)) problems.push(`${rel}: ${k} has a bare &`);
    if (/<(?!\/?(b|i|u)>)/.test(t)) problems.push(`${rel}: ${k} has markup`);
  }
  return out;
}

/** The placeholders of a text, sorted ("%1$s", "%2$d"); a non-positional one (%s, %d) is a problem of its own. */
const holes = (t) => (t.match(/%\d+\$[sd]/g) || []).sort().join(' ');
const loose = (t) => /%(?!%|\d+\$[sd])/.test(t.replace(/%%/g, ''));

/** Java source without its comments (strings and chars kept, so "https://" inside a string stays code). */
function code(src) {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

function check() {
  const problems = [];
  const base = parse(path.join(RES, 'values', 'w_strings.xml'), problems);
  const names = new Set([...Object.keys(base.strings), ...Object.keys(base.plurals)]);

  // the default's own placeholders
  for (const [k, t] of Object.entries(base.strings)) if (loose(t) && !base.plain.has(k)) problems.push(`values/w_strings.xml: ${k} has a placeholder without a number (write %1$s)`);

  // every translation: the same names, the same placeholders
  const folders = fs.readdirSync(RES).filter((d) => fs.existsSync(path.join(RES, d, 'w_strings.xml')) && d !== 'values');
  for (const l of LANGS) if (!folders.includes('values-' + l)) problems.push(`values-${l}/w_strings.xml is missing`);
  for (const d of folders) {
    const t = parse(path.join(RES, d, 'w_strings.xml'), problems);
    for (const k of Object.keys(base.strings)) {
      if (t.strings[k] === undefined) { problems.push(`${d}: ${k} is missing`); continue; }
      if (holes(t.strings[k]) !== holes(base.strings[k])) problems.push(`${d}: ${k} has "${holes(t.strings[k])}", the default "${holes(base.strings[k])}"`);
      if (HEBREW.test(t.strings[k])) problems.push(`${d}: ${k} is still Hebrew`);
    }
    for (const k of Object.keys(base.plurals)) {
      if (!t.plurals[k]) { problems.push(`${d}: plurals ${k} is missing`); continue; }
      const want = holes(base.plurals[k].other);
      for (const [q, s] of Object.entries(t.plurals[k])) {
        // a quantity that means exactly one number may spell it out ("יומיים"); "other" always holds the number
        if (holes(s) !== want && (q === 'other' || holes(s) !== '')) problems.push(`${d}: ${k}/${q} has "${holes(s)}", the default "${want}"`);
        if (HEBREW.test(s)) problems.push(`${d}: ${k}/${q} is still Hebrew`);
      }
    }
    for (const k of [...Object.keys(t.strings), ...Object.keys(t.plurals)]) if (!names.has(k)) problems.push(`${d}: ${k} is not in the default (values/w_strings.xml)`);
  }

  // what the Java code uses is defined, and the code holds no text of its own
  const used = new Set();
  for (const f of fs.readdirSync(path.join(W, 'java')).filter((f) => f.endsWith('.java'))) {
    const src = code(fs.readFileSync(path.join(W, 'java', f), 'utf8'));
    for (const m of src.matchAll(/R\.string\.(\w+)/g)) { used.add(m[1]); if (!base.strings[m[1]]) problems.push(`java/${f}: R.string.${m[1]} is not defined`); }
    for (const m of src.matchAll(/R\.plurals\.(\w+)/g)) { used.add(m[1]); if (!base.plurals[m[1]]) problems.push(`java/${f}: R.plurals.${m[1]} is not defined`); }
    src.split('\n').forEach((line, i) => { if (HEBREW.test(line)) problems.push(`java/${f}:${i + 1}: Hebrew text in the code: ${line.trim().slice(0, 90)}`); });
  }

  // layouts, widget infos and the manifest lines: @string/ defined, no text written in place
  const xmlDirs = fs.readdirSync(RES).filter((d) => !d.startsWith('values'));
  for (const d of xmlDirs) {
    for (const f of fs.readdirSync(path.join(RES, d)).filter((f) => f.endsWith('.xml'))) {
      const x = fs.readFileSync(path.join(RES, d, f), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      for (const m of x.matchAll(/@string\/(\w+)/g)) { used.add(m[1]); if (!base.strings[m[1]]) problems.push(`${d}/${f}: @string/${m[1]} is not defined`); }
      for (const m of x.matchAll(/\s([\w:]+)="([^"]*)"/g)) if (HEBREW.test(m[2])) problems.push(`${d}/${f}: ${m[1]}="${m[2]}" (use a string resource)`);
    }
  }
  const tool = fs.readFileSync(path.join(ROOT, 'tools', 'android.js'), 'utf8');
  for (const m of tool.matchAll(/@string\/(w_\w+)/g)) { used.add(m[1]); if (!base.strings[m[1]]) problems.push(`tools/android.js: @string/${m[1]} is not defined`); }
  // receiver('ShiftWidget', 'shift') → @string/w_shift_name
  for (const m of tool.matchAll(/receiver\('\w+', '(\w+)'\)/g)) { used.add(`w_${m[1]}_name`); if (!base.strings[`w_${m[1]}_name`]) problems.push(`tools/android.js: w_${m[1]}_name is not defined`); }

  // the app's language: every language the app speaks (src/app/lang.js) is one WidgetLang knows and has its texts here;
  // a snapshot without one (an app from before) means Hebrew, the default folder
  const appLangs = [...fs.readFileSync(path.join(ROOT, 'src', 'app', 'lang.js'), 'utf8').matchAll(/\{ id: '(\w+)', name:/g)].map((m) => m[1]);
  const wl = fs.readFileSync(path.join(W, 'java', 'WidgetLang.java'), 'utf8');
  const javaLangs = ((wl.match(/LANGS = \{([^}]*)\}/) || [])[1] || '').match(/\w+/g) || [];
  if (appLangs.length < 7) problems.push(`src/app/lang.js: found only ${appLangs.length} languages`);
  for (const l of appLangs) {
    if (!javaLangs.includes(l)) problems.push(`WidgetLang.LANGS has no "${l}" (the app speaks it)`);
    if (l !== 'he' && !folders.includes('values-' + l)) problems.push(`the app speaks "${l}" but android/widgets/res/values-${l}/w_strings.xml is missing`);
  }
  for (const l of javaLangs) if (!appLangs.includes(l)) problems.push(`WidgetLang.LANGS has "${l}", which the app does not speak`);
  if (!/static final String DEFAULT = "he";/.test(wl)) problems.push('WidgetLang.DEFAULT must be "he" (a snapshot without lang is Hebrew)');
  if (!HEBREW.test(base.strings.w_start || '')) problems.push('values/w_strings.xml (the default, used for "he" and a snapshot without lang) must be Hebrew');
  const wd = fs.readFileSync(path.join(W, 'java', 'WidgetData.java'), 'utf8');
  if (!/optString\("lang", WidgetLang\.DEFAULT\)/.test(wd)) problems.push('WidgetData.lang must read "lang" with Hebrew as the fallback');
  const web = fs.readFileSync(path.join(ROOT, 'src', 'app', 'widgets.js'), 'utf8');
  if ((web.match(/lang: LANG,/g) || []).length < 2) problems.push('src/app/widgets.js: the snapshot and the empty snapshot must carry lang: LANG');

  // the direction: each layout has its _rtl and _ltr made by tools/android-layouts.js, and the Java code uses those
  const { variants, DIR } = require('./android-layouts.js');
  for (const v of variants()) {
    const p = path.join(DIR, v.file);
    if (!fs.existsSync(p)) problems.push(`layout/${v.file} is missing (run node tools/android-layouts.js)`);
    else if (fs.readFileSync(p, 'utf8') !== v.text) problems.push(`layout/${v.file} differs from ${v.base} (run node tools/android-layouts.js)`);
  }
  const javaAll = fs.readdirSync(path.join(W, 'java')).map((f) => code(fs.readFileSync(path.join(W, 'java', f), 'utf8'))).join('\n');
  for (const m of javaAll.matchAll(/R\.layout\.(w_\w+)/g)) if (!/_(rtl|ltr)$/.test(m[1])) problems.push(`java: R.layout.${m[1]} draws in the phone's direction; use WidgetLang.layout(c, R.layout.${m[1]}_rtl, R.layout.${m[1]}_ltr)`);
  // a text the layout holds is read by the launcher in the phone's language: the code must write each one itself
  const setText = new Set([...javaAll.matchAll(/(?:setTextViewText\(|\btext\(v, )R\.id\.(\w+)/g)].map((m) => m[1]));
  const setDesc = new Set([...javaAll.matchAll(/setContentDescription\(R\.id\.(\w+)/g)].map((m) => m[1]));
  for (const f of fs.readdirSync(DIR).filter((f) => /_(rtl|ltr)\.xml$/.test(f))) {
    const x = fs.readFileSync(path.join(DIR, f), 'utf8');
    for (const el of x.matchAll(/<\w+\s[^>]*>/g)) {
      const id = (el[0].match(/android:id="@\+id\/(\w+)"/) || [])[1];
      if (/android:text="@string\//.test(el[0]) && !setText.has(id)) problems.push(`layout/${f}: ${id || 'a view without id'} takes its text from the layout; the code must write it (setTextViewText)`);
      if (/android:contentDescription="@string\//.test(el[0]) && !setDesc.has(id)) problems.push(`layout/${f}: ${id || 'a view without id'} takes its description from the layout; the code must write it (setContentDescription)`);
    }
  }

  const unused = [...names].filter((k) => !used.has(k));
  return { problems, unused, strings: Object.keys(base.strings).length, plurals: Object.keys(base.plurals).length, languages: folders.length + 1 };
}

module.exports = { check };

if (require.main === module) {
  const r = check();
  for (const k of r.unused) console.log(`note: ${k} is defined but nothing uses it`);
  if (r.problems.length) {
    console.log(r.problems.map((p) => '✗ ' + p).join('\n'));
    console.log(`${r.problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`android strings: ${r.strings} strings + ${r.plurals} plurals in ${r.languages} languages, every reference defined, no text in the Java code or layouts`);
}
