/* The Android shell's texts (widgets, their picker, toasts, the quick-settings tile): every language holds every string,
 * every reference is defined, and no text is left written in the Java code or a layout (tools/android-strings-check.js). */
const T = require('./t.js');
const { check } = require('../tools/android-strings-check.js');

T.section('Android widget texts');
T.test('the widgets and the tile speak the phone\'s language: every string in he/en/ru/ar/fr/es/am, none in the code', () => {
  const r = check();
  T.ok(r.problems.length === 0, r.problems.join('\n') || 'no problems');
  T.ok(r.languages === 7, 'languages: ' + r.languages);
});
