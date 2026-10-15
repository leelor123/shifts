/* Build: inlines CSS + JS into one index.html and writes the
 * deployable folder (docs/ — published by GitHub Pages): index.html, sw.js, manifest, icons.
 * Usage: node tools/build.js            (version from package.json) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
// GitHub Pages serves docs/; OUT=<dir> builds somewhere else (so tests running on docs/ aren't disturbed)
const DIST = process.env.OUT ? path.resolve(process.env.OUT) : path.join(ROOT, 'docs');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const JS_ORDER = [
  'core/util.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'core/insights.js', 'core/payslip.js', 'core/games.js', 'core/recap.js', 'core/analysis.js', 'core/leaderboard.js',
  'app/ui.js', 'app/pickers.js', 'app/fx.js', 'app/intro.js', 'app/store.js', 'app/charts.js', 'app/app.js', 'app/mascot.js', 'app/firebase-config.js', 'app/cloud.js', 'app/stats.js', 'app/pay-config.js', 'app/plus.js', 'app/views-login.js',
  'app/views-home.js', 'app/views-shift.js', 'app/views-calendar.js', 'app/views-reports.js',
  'app/views-payslip.js', 'app/views-insights.js', 'app/export.js', 'app/views-settings.js', 'app/views-onboarding.js',
  'app/views-assistant.js', 'app/views-rights.js', 'app/views-guide.js', 'app/views-support.js', 'app/views-games.js', 'app/views-leaderboard.js', 'app/views-analysis.js', 'app/views-recap.js', 'app/views-admin.js', 'app/views-legal.js', 'app/ptr.js',
];
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const js = JS_ORDER.map((f) => `/* ---- ${f} ---- */\n${read(f)}`).join('\n');
if (/<\/script/i.test(js)) throw new Error('JS contains "</script" — would break inlining');
// a typo in any file must stop the build, not reach phones as a blank screen (compiled, not run)
try { new (require('vm').Script)(js, { filename: 'bundle.js' }); } catch (e) { throw new Error('JS does not compile: ' + e.message + '\n' + String(e.stack || '').split('\n').slice(0, 3).join('\n')); }
// styles.css is the base design; styles-v3.css the playful layer on top (pickers, mascot, colours)
const css = read('styles.css') + '\n' + read('styles-v3.css');
const hash = crypto.createHash('sha256').update(js + css + read('index.html') + read('sw.js')).digest('hex').slice(0, 8);
const version = pkg.version;

fs.mkdirSync(DIST, { recursive: true });
let html = read('index.html').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js).replace('__VERSION__', version).replace('__BUILD__', `${version}-${hash}`);
// Content-Security-Policy: only the app's own inline script (by its hash) and the libraries it loads
// on demand may run, so injected markup (an <img onerror>, a <script>) can never execute.
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => "'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
const CSP = [
  "default-src 'self'",
  `script-src 'self' ${inline.join(' ')} https://www.gstatic.com https://apis.google.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net 'wasm-unsafe-eval'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src https://shiftpay-70ab6.firebaseapp.com https://accounts.google.com https://apis.google.com https://*.google.com",
  "worker-src 'self' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
  "media-src 'self' data: blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
if (inline.length !== 1) throw new Error('expected exactly one inline script, found ' + inline.length);
html = html.replace('<meta charset="utf-8">', () => `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, 'sw.js'), read('sw.js').replace('__VERSION__', `${version}-${hash}`));
fs.copyFileSync(path.join(SRC, 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'));
// icons are generated from the logo once (src/icons); the build only copies them
for (const f of fs.readdirSync(path.join(SRC, 'icons'))) fs.copyFileSync(path.join(SRC, 'icons', f), path.join(DIST, f));
if (fs.existsSync(path.join(DIST, 'icon.svg'))) fs.unlinkSync(path.join(DIST, 'icon.svg'));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
require('./legal-pages').build(SRC, DIST);
console.log(`built v${version} (${hash}) → ${path.relative(ROOT, DIST)}/index.html ${(html.length / 1024).toFixed(0)} KB`);
