/* The Android app's message channel and the page's own language (Firebase Test Lab, 15 Nov 2026): Chrome before about
 * 134 hands the page its end of the channel from "android-app://<host>/<package>" (the source as Chrome got it, not yet
 * made an origin), so the widgets and the arrival suggestion never reached phones with an older Chrome; the first open
 * moved to the chosen language's page after the channel was made, so the app asks again on every page load; and Chrome
 * offered to translate the page ("Arabic to English"), which is already in the user's language. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { applyHtml } = require('../tools/i18n.js');

T.section('Android app channel and page language');
T.test('the page keeps the port from old and new Chrome alike, and only from this app', () => {
  const html = read('src/index.html');
  const catcher = html.match(/addEventListener\('message',function\(e\)\{if\(\((.*?)\)&&/);
  T.ok(catcher, 'the early catcher in index.html');
  const w = read('src/app/widgets.js');
  const listener = w.match(/const fromApp = \(e\) => ([^;]+);/);
  T.ok(listener, 'the listener in app/widgets.js');
  const APP_ID = (w.match(/const APP_ID = '([^']+)'/) || [])[1];
  T.eq(APP_ID, 'io.github.leelor123.shifts', 'the app\'s own package');
  const location = { host: 'site', origin: 'https://site' };
  const early = new Function('e', 'location', 'return ' + catcher[1]);
  const late = new Function('e', 'location', 'APP_ID', 'return ' + listener[1]);
  const cases = [
    ['android-app://site', true], // Chrome 134 and later
    ['android-app://site/io.github.leelor123.shifts', true], // Chrome 133 and earlier
    ['https://site', true],
    ['android-app://site/com.example.other', false],
    ['android-app://other.host/io.github.leelor123.shifts', false],
    ['android-app://site/io.github.leelor123.shifts.evil', false],
    ['https://elsewhere', false],
    ['', false],
  ];
  for (const [origin, ok] of cases) {
    T.eq(!!early({ origin }, location), ok, 'index.html: ' + origin);
    T.eq(!!late({ origin }, location, APP_ID), ok, 'app/widgets.js: ' + origin);
  }
});

T.test('the app asks for the channel again on every page load (the first open changes page)', () => {
  const a = read('tools/android.js');
  T.ok(/if \(navigationEvent == NAVIGATION_FINISHED\) \{ mChannelRequested = false; requestChannel\(0\); \}/.test(a),
    'LauncherActivity: a new channel request for each finished page');
});

T.test('the page never offers a translation: its language is set, and Chrome is told not to translate', () => {
  const html = read('src/index.html');
  T.ok(/<html[^>]*\btranslate="no"/.test(html), '<html translate="no">');
  T.ok(html.includes('<meta name="google" content="notranslate">'), 'the notranslate meta');
  for (const [lang, dir] of [['en', 'ltr'], ['ar', 'rtl'], ['ru', 'ltr']]) {
    const out = applyHtml(html.slice(0, 400), lang, {});
    T.ok(out.includes(`<html lang="${lang}" dir="${dir}" translate="no">`), `the ${lang} page: lang, dir and translate="no"`);
  }
});

T.test('the arrival suggestion has its own group with a summary, so Android shows it open with its buttons', () => {
  const g = read('android/widgets/java/WorkGeo.java');
  T.ok(/\.setGroupSummary\(true\)/.test(g), 'a summary for the geo group');
  T.ok(/nm\.notify\(TAG_SUM, 1,/.test(g), 'posted with the suggestion');
  T.ok(/nm\.cancel\(TAG_SUM, 1\)/.test(g), 'and closed with the last suggestion and when turned off');
});

// Firebase Test Lab, 15 Nov 2026: with Google Location Accuracy off, Google Play services refuses the geofence (1000,
// GEOFENCE_NOT_AVAILABLE), while the app said "saved" and showed "on", and no suggestion ever came
T.test('the workplace is "saved" and "on" only after Google Play services accepted the circle', () => {
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const g = code(read('android/widgets/java/WorkGeo.java'));
  T.ok(/addOnSuccessListener\(v -> answered\(app, true/.test(g) && /answered\(app, false/.test(g), 'the answer is waited for, both ways');
  T.ok(/putInt\("fence", ok \? FENCE_OK : FENCE_REFUSED\)/.test(g), 'and kept');
  T.ok(/\.put\("on", on\(c\) && fine && bg && !refused\)/.test(g), 'a refused circle is never reported as on');
  T.ok(/\.put\("attn", on\(c\) && fine && bg && refused\)/.test(g), 'it is reported as needing attention');
  T.ok(/static void restore\(Context c\) \{\s*if \(on\(c\)\) watch\(c, null\);/.test(g), 'each open and restart asks again and keeps the answer');
  const a = code(read('android/widgets/java/WorkGeoActivity.java'));
  const done = a.slice(a.indexOf('private void done()'), a.indexOf('private void watched('));
  T.ok(done.length > 50 && !/saved\(\)|notesStep\(\)|w_geo_saved/.test(done), 'saving says nothing before the answer');
  T.ok(/if \(ok\) \{ notesStep\(\); return; \}/.test(a), '"saved" (after the notifications check) only when accepted');
  T.ok(/getSettingsClient\(this\)\.checkLocationSettings/.test(a) && /PRIORITY_HIGH_ACCURACY/.test(a) && /startResolutionForResult\(this, ASK_ACCURACY\)/.test(a),
    "refused: Play services' own window for the location setting");
  T.ok(/if \(resultCode == RESULT_OK\) retry\(\);\s*else refused\(\);/.test(a), 'then one more try');
  const refused = a.slice(a.indexOf('private void refused()'), a.indexOf('private void notesStep()'));
  T.ok(/WorkGeo\.off\(/.test(refused) && /w_geo_no_fence/.test(refused), 'refused again: the feature is off and the line says why');
  T.ok(/WorkGeo\.sink = /.test(read('tools/android.js')), 'a later answer reaches the open page');
  const page = read('src/app/arrive.js');
  T.ok(/status && status\.attn\) return '/.test(page) && /const attn = status && status\.attn;/.test(page), 'the page shows it as needing attention, with Save again');
});
