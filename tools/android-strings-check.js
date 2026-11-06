/* Checks the Android shell's texts without building it (node tools/android-strings-check.js; tools/android.js runs it
 * before it copies android/widgets into the project).
 *   - values/w_strings.xml (the default, Hebrew) and every translation (values-en, -ru, -ar, -fr, -es, -am) hold the
 *     same strings and plurals, with the same %1$s… placeholders, and nothing aapt would refuse (a bare ' or ").
 *   - every R.string / R.plurals the Java sources use and every @string/ the layouts, widget infos and the manifest
 *     lines in tools/android.js use is defined.
 *   - no text is left in the Java code or in a layout: a Hebrew letter in Java outside a comment, or in a layout
 *     attribute, fails (every user-visible text comes from the string resources, so it follows the phone's language).
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
