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
  'core/util.js', 'core/clean.js', 'core/timesheet.js', 'core/schedule.js', 'core/places-data.js', 'core/places.js', 'core/hebcal.js', 'core/defaults.js', 'core/engine.js', 'core/taxrefund.js', 'core/insights.js', 'core/payslip.js', 'core/games.js', 'core/recap.js', 'core/analysis.js', 'core/leaderboard.js', 'core/friends.js', 'core/referral.js',
  'app/ui.js', 'app/dom.js', 'app/pickers.js', 'app/fx.js', 'app/gamefx.js', 'app/music.js', 'app/intro.js', 'app/lang.js', 'app/store.js', 'app/charts.js', 'app/app.js', 'app/mascot.js', 'app/cloud.js', 'app/stats.js', 'app/pay-config.js', 'app/plus.js', 'app/invite.js', 'app/review.js', 'app/docread.js', 'app/import.js', 'app/schedule-import.js', 'app/claim-report.js', 'app/views-login.js',
  'app/views-home.js', 'app/views-shift.js', 'app/views-calendar.js', 'app/views-reports.js', 'app/views-taxrefund.js',
  'app/views-payslip.js', 'app/views-insights.js', 'app/export.js', 'app/placepicker.js', 'app/widgets.js', 'app/views-settings.js', 'app/views-onboarding.js',
  'app/views-assistant.js', 'app/views-rights.js', 'app/views-guide.js', 'app/views-support.js', 'app/views-games.js', 'app/views-leaderboard.js', 'app/views-friends.js', 'app/views-analysis.js', 'app/views-recap.js', 'app/views-admin.js', 'app/views-legal.js', 'app/ptr.js',
];
// line ends as the browser will see them: the HTML parser turns CR LF into LF inside the script, so a file saved
// with Windows line ends would give the page a different hash than the policy's, and the app would not start
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8').replace(/\r\n?/g, '\n');
const I18N = require('./i18n');
const dicts = Object.fromEntries(Object.keys(I18N.LANGS).filter((l) => l !== 'he').map((l) => [l, I18N.dictOf(l)]));
/** The app's code in a language: each file with its Hebrew put in that language (Hebrew: as it is). */
function jsFor(lang) {
  const js = JS_ORDER.map((f) => `/* ---- ${f} ---- */\n${lang === 'he' ? read(f) : I18N.applyCode(read(f), f, dicts[lang])}`).join('\n');
  if (/<\/script/i.test(js)) throw new Error('JS contains "</script" — would break inlining');
  // a typo in any file (or a translation that breaks the code) must stop the build, not reach phones as a blank screen
  try { new (require('vm').Script)(js, { filename: 'bundle.' + lang + '.js' }); } catch (e) { throw new Error(lang + ': JS does not compile: ' + e.message + '\n' + String(e.stack || '').split('\n').slice(0, 3).join('\n')); }
  return js;
}
// the Google sign-in code downloads after the opening show's logo has drawn (app.js boot → Cloud.preload): a preload
// of it in the page made the first screen's paint wait on three large files (Lighthouse LCP 5 s on a phone)
if (/firebasejs\//.test(read('index.html'))) throw new Error('index.html loads the Firebase SDK early: leave it to Cloud.preload after the logo');
const js = jsFor('he');
// the code goes to its own file, minified, read after the first screen is drawn (defer): inlined, the page was ~1.6 MB
// and nothing showed until all of it arrived. The name carries the build, so a cached copy is never a stale one.
const esbuild = require('esbuild');
const minify = (code, lang) => esbuild.transformSync(code, { minify: true, target: 'es2019', charset: 'utf8', legalComments: 'none', sourcefile: 'app.' + lang + '.js' }).code;
// the first open's language doors, written into each page (lang.js takes them over): drawn with the first frame instead of
// after the 345 KB of code (the phone's largest paint went from ~3.8 s to the first frame); made by lang.js itself
const lpStatic = (lang) => {
  const ctx = { U: { LANG: lang }, document: { documentElement: { lang } }, navigator: { languages: [lang], language: lang } };
  require('vm').runInNewContext(read('app/lang.js'), ctx, { filename: 'lang.js' });
  const html = ctx.Lang.markup(lang, false)
    .replace(/(<div class="lp-hello"[^>]*>)<span /, '$1<span class="on" ')
    .replace(/(<div class="lp-ask"[^>]*>)<span /, '$1<span class="on" ');
  if (!/class="on"[\s\S]*class="on"/.test(html)) throw new Error('lpStatic: the greeting was not found');
  return `<div class="lp-host" id="lp-static" data-sug="${lang}">${html}</div>`;
};
// the code is asked for right after the first frame (the doors and the opening show are already painted): before, its
// 345 KB downloaded during the page's first paint and the phone's largest paint waited on it (Lighthouse LCP ~3.7 s);
// the browser's own "first paint" event says when (an animation frame comes just before that paint, not after it); 1.5 s
// at the most when no paint comes (a page opened in the background), or at once where the event is not known
const loader = (lang) => `\n;(function(){var done=false;function go(){if(done)return;done=true;var s=document.createElement('script');s.src='${jsFile(lang)}';document.body.appendChild(s);}try{new PerformanceObserver(function(l){if(l.getEntriesByName('first-contentful-paint').length)setTimeout(go,0);}).observe({type:'paint',buffered:true});setTimeout(go,1500);}catch(e){go();}})();\n`;
const jsFile = (lang) => 'app.' + lang + '.' + hash + '.js';
// styles.css is the base design; styles-v3.css the playful layer on top (pickers, mascot, colours)
// fonts.css: Rubik and Fredoka served from fonts/ (tools/fonts.js), one file per script, fetched only when used
const css = read('fonts/fonts.css') + read('styles.css') + '\n' + read('styles-v3.css') + '\n' + read('styles-v4.css');
// the files each language's first screen draws with, asked for at once instead of after the styles are read
const cssMin = esbuild.transformSync(css, { loader: 'css', minify: true, target: 'chrome90', charset: 'utf8', legalComments: 'none' }).code;
const FIRST_FONTS = { he: ['rubik-hebrew', 'rubik-latin'], ar: ['rubik-arabic', 'rubik-latin'], ru: ['rubik-cyrillic', 'rubik-latin'], en: ['rubik-latin'], fr: ['rubik-latin'], es: ['rubik-latin'] };
const preload = (lang) => (FIRST_FONTS[lang] || FIRST_FONTS.he).map((f) => `<link rel="preload" href="fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join('\n');
const i18nHash = Object.keys(dicts).map((l) => JSON.stringify(dicts[l])).join('');
// the build itself is part of the version: what it writes into the page (the loader, the doors) changes the page too,
// and a version that did not change would leave phones on the old page
const hash = crypto.createHash('sha256').update(js + css + read('index.html') + read('sw.js') + read('manifest.webmanifest') + i18nHash + fs.readFileSync(__filename, 'utf8')).digest('hex').slice(0, 8);
const version = pkg.version;

fs.mkdirSync(DIST, { recursive: true });
/** The page of one language: its markup, styles and code inlined, under a policy that runs only its own scripts. */
function page(lang) {
  const tpl = lang === 'he' ? read('index.html') : I18N.applyHtml(read('index.html'), lang, dicts[lang]).replace('href="manifest.webmanifest"', `href="manifest.${lang}.webmanifest"`);
  let html = tpl.replace('/*__CSS__*/', () => cssMin).replace('/*__JS__*/', () => read('app/firebase-config.js') + loader(lang)).replace('__VERSION__', version).replace('__BUILD__', `${version}-${hash}`).replace('<!--__FONT_PRELOAD__-->', () => preload(lang)).replace('<!--__LP_STATIC__-->', () => lpStatic(lang));
  // Content-Security-Policy: only the app's own inline scripts (by their hashes) and the libraries it loads
  // on demand may run, so injected markup (an <img onerror>, a <script>) can never execute.
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  // characters the HTML parser changes before hashing (CR, NUL) would make the hash above wrong in the browser
  if (scripts.some((m) => /[\r\0]/.test(m[1]))) throw new Error('an inline script has CR or NUL characters: the policy hash would not match');
  // two: the language check at the top (moves to the chosen language's page before anything is drawn) and the app
  if (scripts.length !== 2) throw new Error('expected two inline scripts, found ' + scripts.length);
  const inline = scripts.map((m) => "'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
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
  return html.replace('<meta charset="utf-8">', () => `<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">`);
}
// the code of the version before stays next to the new one: a page a browser still holds (its own cache, ~10 minutes on
// GitHub Pages, or a phone that has not updated yet) asks for its own code file, which must still be there (it was deleted:
// a blank app until the update). Kept: this build, the one in this folder, and the one in git (the live one).
const keepBuilds = new Set([hash]);
const buildOf = (html) => { const m = /APP_BUILD = '[^']*-([0-9a-f]+)'/.exec(html || ''); return m && m[1]; };
try { keepBuilds.add(buildOf(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'))); } catch (e) { /* a new folder */ }
try { keepBuilds.add(buildOf(require('child_process').execSync('git show HEAD:docs/index.html', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString())); } catch (e) { /* no git */ }
for (const f of fs.readdirSync(DIST)) { const m = /^app[.][a-z]+[.]([0-9a-f]+)[.]js$/.exec(f); if (m && !keepBuilds.has(m[1])) fs.unlinkSync(path.join(DIST, f)); }
const writeJs = (lang, code) => fs.writeFileSync(path.join(DIST, jsFile(lang)), minify(code, lang));
writeJs('he', js);
const html = page('he');
fs.writeFileSync(path.join(DIST, 'index.html'), html);
const sizes = [`he ${(html.length / 1024).toFixed(0)} KB`];
for (const lang of Object.keys(dicts)) {
  writeJs(lang, jsFor(lang));
  const h = page(lang);
  fs.writeFileSync(path.join(DIST, `index.${lang}.html`), h);
  sizes.push(`${lang} ${(h.length / 1024).toFixed(0)} KB`);
  // the manifest in the language: its name, description and shortcuts
  const man = JSON.parse(read('manifest.webmanifest'));
  const tr = (t) => (t && dicts[lang][t]) || t;
  man.lang = lang; man.dir = I18N.LANGS[lang].dir;
  man.description = tr(man.description);
  for (const sc of man.shortcuts || []) { sc.name = tr(sc.name); sc.short_name = tr(sc.short_name); if (sc.description) sc.description = tr(sc.description); }
  man.start_url = './?source=pwa';
  fs.writeFileSync(path.join(DIST, `manifest.${lang}.webmanifest`), JSON.stringify(man, null, 2) + '\n');
}
// the service worker must compile, like the app's code: a typo in it would leave every phone on the old version
try { new (require('vm').Script)(read('sw.js'), { filename: 'sw.js' }); } catch (e) { throw new Error('sw.js does not compile: ' + e.message); }
fs.writeFileSync(path.join(DIST, 'sw.js'), read('sw.js').replace('__VERSION__', `${version}-${hash}`));
fs.copyFileSync(path.join(SRC, 'manifest.webmanifest'), path.join(DIST, 'manifest.webmanifest'));
// icons are generated from the logo once (src/icons); the build only copies them
for (const f of fs.readdirSync(path.join(SRC, 'icons'))) fs.copyFileSync(path.join(SRC, 'icons', f), path.join(DIST, f));
fs.mkdirSync(path.join(DIST, 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(SRC, 'fonts'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(SRC, 'fonts', f), path.join(DIST, 'fonts', f));
if (fs.existsSync(path.join(DIST, 'icon.svg'))) fs.unlinkSync(path.join(DIST, 'icon.svg'));
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
require('./legal-pages').build(SRC, DIST);
console.log(`built v${version} (${hash}) → ${path.relative(ROOT, DIST)}/index.html · ${sizes.join(' · ')}`);
