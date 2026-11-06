/* The Android shell's texts (widgets, their picker, toasts, the quick-settings tile): every language holds every string,
 * every reference is defined, and no text is left written in the Java code or a layout (tools/android-strings-check.js). */
const T = require('./t.js');
const { check } = require('../tools/android-strings-check.js');

T.section('Android widget texts');
T.test('the widgets and the tile speak the app\'s language: every string in he/en/ru/ar/fr/es/am, none in the code', () => {
  const r = check();
  T.ok(r.problems.length === 0, r.problems.join('\n') || 'no problems');
  T.ok(r.languages === 7, 'languages: ' + r.languages);
});

T.test('every language the app speaks reaches the widgets; a snapshot without lang is Hebrew', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const app = [...fs.readFileSync(path.join(root, 'src', 'app', 'lang.js'), 'utf8').matchAll(/\{ id: '(\w+)', name:/g)].map((m) => m[1]);
  const wl = fs.readFileSync(path.join(root, 'android', 'widgets', 'java', 'WidgetLang.java'), 'utf8');
  const java = (wl.match(/LANGS = \{([^}]*)\}/)[1].match(/\w+/g));
  T.ok(app.length === 7 && app.every((l) => java.includes(l)) && java.length === app.length, 'app ' + app + ' / widgets ' + java);
  for (const l of app) T.ok(l === 'he' || fs.existsSync(path.join(root, 'android', 'widgets', 'res', 'values-' + l, 'w_strings.xml')), 'values-' + l);
  // the fallback: WidgetLang.of(null / unknown) is DEFAULT, and DEFAULT is Hebrew, the default folder's language
  T.ok(/static final String DEFAULT = "he";/.test(wl) && /return DEFAULT;/.test(wl), 'no lang: Hebrew');
  T.ok(/[א-ת]/.test(fs.readFileSync(path.join(root, 'android', 'widgets', 'res', 'values', 'w_strings.xml'), 'utf8')), 'values/ is Hebrew');
  // the page sends its language with every snapshot, the empty one too
  T.ok((fs.readFileSync(path.join(root, 'src', 'app', 'widgets.js'), 'utf8').match(/lang: LANG,/g) || []).length === 2, 'snapshot lang');
});
