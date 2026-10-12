/* Build: inlines CSS + JS into one index.html and writes the
 * deployable folder (docs/ — published by GitHub Pages): index.html, sw.js, manifest, icons.
 * Usage: node tools/build.js            (version from package.json) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'docs'); // GitHub Pages serves this folder
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const JS_ORDER = [
  'core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'core/insights.js', 'core/payslip.js',
  'app/ui.js', 'app/fx.js', 'app/store.js', 'app/charts.js', 'app/app.js', 'app/firebase-config.js', 'app/cloud.js', 'app/views-login.js',
  'app/views-home.js', 'app/views-shift.js', 'app/views-calendar.js', 'app/views-reports.js',
  'app/views-payslip.js', 'app/views-insights.js', 'app/export.js', 'app/views-settings.js', 'app/views-onboarding.js',
  'app/views-assistant.js', 'app/views-legal.js',
];
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const js = JS_ORDER.map((f) => `/* ---- ${f} ---- */\n${read(f)}`).join('\n');
if (/<\/script/i.test(js)) throw new Error('JS contains "</script" — would break inlining');
const css = read('styles.css');
const hash = crypto.createHash('sha256').update(js + css + read('index.html') + read('sw.js')).digest('hex').slice(0, 8);
const version = pkg.version;

fs.mkdirSync(DIST, { recursive: true });
const html = read('index.html').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js).replace('__VERSION__', version);
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, 'sw.js'), read('sw.js').replace('__VERSION__', `${version}-${hash}`));
fs.copyFileSync(path.join(SRC, 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'));
// icons are generated from the logo once (src/icons); the build only copies them
for (const f of fs.readdirSync(path.join(SRC, 'icons'))) fs.copyFileSync(path.join(SRC, 'icons', f), path.join(DIST, f));
if (fs.existsSync(path.join(DIST, 'icon.svg'))) fs.unlinkSync(path.join(DIST, 'icon.svg'));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
require('./legal-pages').build(SRC, DIST);
console.log(`built v${version} (${hash}) → ${path.relative(ROOT, DIST)}/index.html ${(html.length / 1024).toFixed(0)} KB`);
