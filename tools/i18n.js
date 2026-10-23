/* ============================================================
 * i18n.js — the app in more languages, with no cost at run time. Dev tool (and used by build.js).
 *
 * The source stays Hebrew. Every Hebrew string and template in src/app and src/core is a catalog entry, keyed
 * by its own Hebrew text (a template's expressions become {0}, {1}…); i18n/<lang>.json holds the translations.
 * The build writes one bundle per language (docs/index.<lang>.html) with the translations put in place of the
 * Hebrew in the code itself, so nothing is looked up while the app runs, and only the chosen language is
 * downloaded.
 *
 * Kept in Hebrew (they read Hebrew, or are data):
 *   - anything between "// i18n-keep-start" and "// i18n-keep-end", or on the line under a "// i18n-keep" comment;
 *   - whole files in KEEP_FILES (parsers of Hebrew payslips, reports and schedules; the list of localities);
 *   - regular expressions (and strings passed to new RegExp).
 *
 * A translation may give a count's noun in each plural form of its language: {0#one:смена;few:смены;many:смен;other:смены}
 * becomes the right form for the number in {0} (Intl.PluralRules, U.plural). {1#-} leaves expression 1 out: the Hebrew's
 * own choice of the noun (`${n === 1 ? 'משמרת' : 'משמרות'}`) when the translation already gives it by {0}'s plural form.
 *
 *   node tools/i18n.js extract        update i18n/catalog.json and add new keys (null) to each i18n/<lang>.json
 *   node tools/i18n.js check [lang]   every translation present, the same {n} placeholders and HTML tags, no Hebrew
 *   node tools/i18n.js stats          how much is translated, per language
 * ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIR = path.join(ROOT, 'i18n');
const HE = /[֐-׿]/;
const LANGS = { he: { dir: 'rtl', name: 'עברית' }, ar: { dir: 'rtl', name: 'العربية' }, ru: { dir: 'ltr', name: 'Русский' }, en: { dir: 'ltr', name: 'English' } };
// files that read Hebrew (or are data in Hebrew): never translated
const KEEP_FILES = new Set(['core/timesheet.js', 'core/schedule.js', 'core/places-data.js', 'core/places.js', 'core/clean.js', 'app/lang.js']);
// values of these properties are words matched against Hebrew text (a payslip's line names), never shown
const KEEP_KEYS = new Set(['pats']);

function parser() {
  let acorn, walk;
  try { acorn = require('acorn'); walk = require('acorn-walk'); } catch (e) { throw new Error('i18n needs acorn: npm i -D acorn acorn-walk'); }
  return { acorn, walk };
}

/** The Hebrew strings and templates of one file, as nodes: { start, end, kind, key, exprs: [{start, end}] }. */
function nodesOf(code, file) {
  const { acorn, walk } = parser();
  const comments = [];
  const ast = acorn.parse(code, { ecmaVersion: 2023, sourceType: 'script', onComment: comments });
  // kept stretches: between keep-start and keep-end comments; "i18n-keep" alone keeps the next node
  const keep = [], keepNext = [];
  let open = null;
  for (const c of comments) {
    const t = c.value.trim();
    // (a pragma may be followed by a reason: // i18n-keep-start (place names are Hebrew))
    if (/^i18n-keep-start(\s|$)/.test(t)) open = c.end;
    else if (/^i18n-keep-end(\s|$)/.test(t) && open != null) { keep.push([open, c.start]); open = null; }
    else if (/^i18n-keep(\s|$)/.test(t)) keepNext.push(c.end);
  }
  if (open != null) keep.push([open, code.length]);
  // "i18n-keep" alone keeps everything on the line under it
  const nl = []; for (let i = code.indexOf('\n'); i >= 0; i = code.indexOf('\n', i + 1)) nl.push(i);
  const lineOf = (pos) => { let lo = 0, hi = nl.length; while (lo < hi) { const m = (lo + hi) >> 1; if (nl[m] < pos) lo = m + 1; else hi = m; } return lo; };
  const keepLines = new Set(keepNext.map((e) => lineOf(e) + 1));
  const kept = (n) => keep.some(([a, b]) => n.start >= a && n.end <= b) || keepLines.has(lineOf(n.start));
  const out = [];
  walk.ancestor(ast, {
    Literal(node, anc) {
      if (typeof node.value !== 'string' || !HE.test(node.value) || kept(node)) return;
      const p = anc[anc.length - 2];
      if (p && p.type === 'Property' && p.key === node && !p.computed) return; // an object key is a name, not text
      if (p && p.type === 'NewExpression' && p.callee.name === 'RegExp') return;
      if (anc.some((a) => a.type === 'Property' && !a.computed && a.key && KEEP_KEYS.has(a.key.name || a.key.value))) return;
      out.push({ start: node.start, end: node.end, kind: 'lit', key: node.value, exprs: [] });
    },
    TemplateLiteral(node, anc) {
      if (!node.quasis.some((q) => HE.test(q.value.cooked || '')) || kept(node)) return;
      const p = anc[anc.length - 2];
      if (p && p.type === 'NewExpression' && p.callee.name === 'RegExp') return;
      if (p && p.type === 'TaggedTemplateExpression') return;
      let key = '';
      node.quasis.forEach((q, i) => { key += q.value.cooked; if (i < node.expressions.length) key += `{${i}}`; });
      out.push({ start: node.start, end: node.end, kind: 'tpl', key, exprs: node.expressions.map((e) => ({ start: e.start, end: e.end })) });
    },
  });
  return out.sort((a, b) => a.start - b.start);
}

const jsFiles = () => ['app', 'core'].flatMap((d) => fs.readdirSync(path.join(SRC, d)).filter((f) => f.endsWith('.js')).map((f) => d + '/' + f));
// Hebrew in the page's own markup (index.html): each run of text between tags, and attribute values
function htmlRuns(html) {
  const runs = new Set();
  for (const m of html.matchAll(/>([^<>]*[֐-׿][^<>]*)</g)) runs.add(m[1].trim());
  for (const m of html.matchAll(/="([^"]*[֐-׿][^"]*)"/g)) runs.add(m[1]);
  return [...runs].filter(Boolean);
}

function extract() {
  const catalog = new Map(); // key → { key, kind, where: [file:line] }
  for (const f of jsFiles()) {
    if (KEEP_FILES.has(f)) continue;
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const n of nodesOf(code, f)) {
      const line = code.slice(0, n.start).split('\n').length;
      const e = catalog.get(n.key) || { key: n.key, kind: n.kind, where: [] };
      e.where.push(`${f}:${line}`);
      catalog.set(n.key, e);
    }
  }
  for (const r of htmlRuns(fs.readFileSync(path.join(SRC, 'index.html'), 'utf8'))) {
    const e = catalog.get(r) || { key: r, kind: 'html', where: [] };
    e.where.push('index.html'); catalog.set(r, e);
  }
  // the manifest: the description and the shortcuts' names (the installed app's long-press menu)
  const man = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.webmanifest'), 'utf8'));
  for (const t of [man.description].concat((man.shortcuts || []).flatMap((s) => [s.name, s.short_name, s.description]))) {
    if (!t || !HE.test(t)) continue;
    const e = catalog.get(t) || { key: t, kind: 'manifest', where: [] };
    e.where.push('manifest'); catalog.set(t, e);
  }
  fs.mkdirSync(DIR, { recursive: true });
  const list = [...catalog.values()];
  fs.writeFileSync(path.join(DIR, 'catalog.json'), JSON.stringify(list, null, 1) + '\n');
  for (const lang of Object.keys(LANGS)) {
    if (lang === 'he') continue;
    const file = path.join(DIR, lang + '.json');
    const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
    const next = {};
    for (const e of list) next[e.key] = old[e.key] !== undefined ? old[e.key] : null;
    fs.writeFileSync(file, JSON.stringify(next, null, 1) + '\n');
  }
  console.log(`catalog: ${list.length} entries (${list.filter((e) => e.kind === 'tpl').length} templates, ${list.filter((e) => e.kind === 'html').length} in the page)`);
  return list;
}

// {0} and {0#…} (a plural form of {0}) both stand for expression 0
const placeholders = (s) => [...new Set((String(s).match(/\{\d+(?:#[^}]*)?\}/g) || []).map((p) => p.replace(/#.*\}/, '}')))].sort().join(',');
const tags = (s) => (String(s).match(/<\/?[a-z][a-z0-9]*/gi) || []).map((t) => t.toLowerCase()).sort().join(',');
function check(only) {
  const list = JSON.parse(fs.readFileSync(path.join(DIR, 'catalog.json'), 'utf8'));
  let bad = 0;
  for (const lang of Object.keys(LANGS)) {
    if (lang === 'he' || (only && only !== lang)) continue;
    const file = path.join(DIR, lang + '.json');
    if (!fs.existsSync(file)) continue;
    const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
    const problems = [];
    for (const e of list) {
      const t = dict[e.key];
      if (t == null) { problems.push(['missing', e.key]); continue; }
      if (placeholders(t) !== placeholders(e.key)) problems.push(['placeholders', e.key, t]);
      else if (tags(t) !== tags(e.key)) problems.push(['tags', e.key, t]);
      else if (HE.test(t.replace(/\{\d+\}/g, '')) && !/^[\s\S]*$/.test('')) problems.push(['hebrew', e.key, t]);
      else if (HE.test(t)) problems.push(['hebrew', e.key, t]);
    }
    const missing = problems.filter((p) => p[0] === 'missing').length;
    console.log(`${lang}: ${list.length - missing}/${list.length} translated, ${problems.length - missing} problems`);
    for (const p of problems.filter((x) => x[0] !== 'missing').slice(0, 30)) console.log('  ', p[0], '|', p[1].slice(0, 70), '→', String(p[2]).slice(0, 70));
    bad += problems.length;
  }
  return bad;
}

/* ---------------- applying a language to the code (build.js) ---------------- */
const escTpl = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
/** The code of one source file with the translations in place of its Hebrew (untranslated entries stay). */
function applyCode(code, file, dict) {
  if (KEEP_FILES.has(file)) return code;
  const nodes = nodesOf(code, file);
  // the code of [a, b) with every node inside it replaced (an expression of a template may hold another one)
  function render(a, b) {
    let out = '', at = a;
    for (const n of nodes) {
      if (n.start < at || n.end > b) continue;
      out += code.slice(at, n.start) + replace(n);
      at = n.end;
    }
    return out + code.slice(at, b);
  }
  function replace(n) {
    const t = dict[n.key];
    if (t == null) return n.kind === 'tpl' ? '`' + rebuild(n, n.key) + '`' : code.slice(n.start, n.end);
    if (n.kind === 'lit') return JSON.stringify(t);
    return '`' + rebuild(n, t) + '`';
  }
  function rebuild(n, t) {
    // the translation's text with each {i} back as the i-th expression (with its own Hebrew translated too)
    return t.split(/(\{\d+(?:#[^}]*)?\})/).map((part) => {
      const m = /^\{(\d+)(?:#([^}]*))?\}$/.exec(part);
      if (!m) return escTpl(part);
      const expr = render(n.exprs[+m[1]].start, n.exprs[+m[1]].end);
      if (!m[2]) return '${' + expr + '}';
      if (m[2] === '-') return '';
      const forms = Object.fromEntries(m[2].split(';').map((f) => f.split(':')).map(([k, ...v]) => [k.trim(), v.join(':')]));
      return '${globalThis.U.plural(' + expr + ', ' + JSON.stringify(forms) + ')}';
    }).join('');
  }
  return render(0, code.length);
}
/** The page's own markup in a language: its Hebrew runs replaced, and lang/dir set. */
function applyHtml(html, lang, dict) {
  let out = html.replace(/<html([^>]*)\blang="he"([^>]*)\bdir="rtl"/, `<html$1lang="${lang}"$2dir="${LANGS[lang].dir}"`);
  for (const r of htmlRuns(html).sort((a, b) => b.length - a.length)) if (dict[r]) out = out.split(r).join(dict[r]);
  return out;
}
function dictOf(lang) {
  const file = path.join(DIR, lang + '.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

module.exports = { LANGS, KEEP_FILES, nodesOf, applyCode, applyHtml, dictOf, extract, check };

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'extract') extract();
  else if (cmd === 'check') process.exitCode = check(process.argv[3]) ? 1 : 0;
  else if (cmd === 'stats') check();
  else console.log('usage: node tools/i18n.js extract | check [lang] | stats');
}
