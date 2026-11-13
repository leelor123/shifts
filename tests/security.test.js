/* Guards from the pre-launch security audit of 13 Nov 2026.
 * 1. Clickjacking: GitHub Pages cannot send frame-ancestors and a CSP meta tag cannot carry it, so the app stops itself
 *    when another page shows it inside a frame (App.framed, the first step of App.boot).
 * 2. The website (Firebase Hosting) turns off browser features none of its pages use (Permissions-Policy). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./t.js');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

T.section('security: the app never runs inside another page\'s frame');
const appSrc = read('src/app/app.js');
const m = /App\.framed = function \(\) \{[\s\S]*?\n  \};/.exec(appSrc);
function framedIn(win) {
  const ctx = { App: {}, root: win };
  vm.runInNewContext(m[0], ctx);
  return ctx.App.framed();
}
T.test('App.framed exists and is the first thing App.boot does', () => {
  T.ok(m, 'App.framed is defined');
  T.ok(/App\.boot = async function \(\) \{\n    if \(App\.framed\(\)\) return;/.test(appSrc), 'boot stops when framed');
});
T.test('the top page runs; a framed page asks to be the top page and does not run', () => {
  const self = { location: { href: 'https://leelor123.github.io/shifts/' } };
  self.self = self; self.top = self;
  T.eq(framedIn(self), false, 'top page');
  let asked = '';
  const top = { location: { replace: (u) => { asked = u; } } };
  const inner = { location: { href: 'https://leelor123.github.io/shifts/?x=1' }, top };
  inner.self = inner;
  T.eq(framedIn(inner), true, 'framed');
  T.eq(asked, 'https://leelor123.github.io/shifts/?x=1', 'asks the top to open the app itself, at its own address');
});
T.test('a cross-origin top that cannot be read or moved still counts as framed', () => {
  const inner = { location: { href: 'https://leelor123.github.io/shifts/' } };
  inner.self = inner;
  Object.defineProperty(inner, 'top', { get() { throw new Error('SecurityError'); } });
  T.eq(framedIn(inner), true);
});

T.section('security: every CDN library is checked by its fingerprint');
T.test('each library the app loads is listed with a sha384, the loader sets it, and an unlisted one is refused', () => {
  const p = read('src/app/views-payslip.js');
  const sri = {};
  for (const [, u, h] of (/const SRI = \{([\s\S]*?)\n  \};/.exec(p) || ['', ''])[1].matchAll(/'(https:[^']+)': '(sha384-[A-Za-z0-9+/]{64})'/g)) sri[u] = h;
  const urls = [
    ...[...p.matchAll(/^\s+(?:pdf|tesseract): '(https:[^']+)'/gm)].map((x) => x[1]),
    /const TESSERACT = '([^']+)'/.exec(read('src/app/docread.js'))[1],
    /const XLSX_SRC = '([^']+)'/.exec(read('src/app/import.js'))[1],
    /const NSFW_LIB = '([^']+)'/.exec(read('src/app/plus.js'))[1],
  ];
  T.eq(urls.length, 5, 'the five places');
  for (const u of urls) T.ok(sri[u], 'fingerprint for ' + u);
  T.ok(/if \(!SRI\[src\]\) return Promise\.reject/.test(p), 'unlisted: refused');
  T.ok(/s\.crossOrigin = 'anonymous'; s\.integrity = SRI\[src\];/.test(p), 'the script tag carries it');
  const callers = ['src/app/docread.js', 'src/app/import.js', 'src/app/plus.js'].map(read).join('\n');
  T.ok(!/createElement\('script'\)/.test(callers), 'no other script loader');
});
T.test('the offline copy never hands back an opaque library, which would fail the fingerprint', () => {
  T.ok(read('src/sw.js').includes("if (cached && !(cached.type === 'opaque' && req.mode === 'cors')) return cached;"));
});

T.section('security: a payslip file is a PDF or an image of up to 25MB, whichever way it comes in');
T.test('the check runs first in startExtraction, the one door of the picker, the camera and a shared file', () => {
  const p = read('src/app/views-payslip.js');
  T.ok(/async function startExtraction\(file\) \{\n    const bad = payslipFileProblem\(file\);\n    if \(bad\) \{ UI\.invalid\(bad\); return; \}/.test(p), 'first thing');
  T.ok(/App\.payslipFromFile = \(file\) => \{[^}]*startExtraction\(file\); \};/.test(p), 'a shared file goes the same way');
  T.eq((p.match(/startExtraction\(/g) || []).length, 3, 'no other way in: the definition, the picker and camera, a shared file');
});
T.test('PDFs and photos pass; too big, other kinds and nothing are refused', () => {
  const p = read('src/app/views-payslip.js');
  const src = /const PAYSLIP_MAX = [^\n]*\n  function payslipFileProblem\(file\) \{[\s\S]*?\n  \}\n/.exec(p);
  T.ok(src, 'found');
  const ctx = {};
  vm.runInNewContext(src[0] + 'this.check = payslipFileProblem;', ctx);
  const MB = 1024 * 1024;
  const f = (type, name, size) => ctx.check({ type, name, size });
  T.eq(f('application/pdf', 'tlush.pdf', 2 * MB), '', 'a PDF');
  T.eq(f('image/jpeg', 'IMG_1.jpg', 6 * MB), '', 'a photo');
  T.eq(f('image/heic', 'IMG_2.HEIC', 3 * MB), '', 'an iPhone photo');
  T.eq(f('', 'from-whatsapp.pdf', MB), '', 'no type given, a .pdf name');
  T.eq(f('application/pdf', 'big.pdf', 25 * MB), '', 'exactly 25MB');
  T.ok(f('application/pdf', 'huge.pdf', 25 * MB + 1), 'over 25MB');
  T.ok(f('application/x-msdownload', 'run.exe', MB), 'a program');
  T.ok(f('text/html', 'page.html', 1000), 'a web page');
  T.ok(f('', 'noname', 1000), 'no type and no known name');
  T.ok(f('application/pdf', 'x.pdf', NaN), 'an unknown size');
  T.ok(ctx.check(null), 'nothing');
});

T.section('security: website headers');
T.test('every website page turns off camera, microphone, location, payment and USB', () => {
  const h = JSON.parse(read('firebase.json')).hosting.headers.find((r) => r.source === '**').headers;
  const pp = (h.find((x) => x.key === 'Permissions-Policy') || {}).value || '';
  for (const f of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) T.ok(pp.includes(f + '=()'), f);
  const pages = fs.readdirSync(path.join(__dirname, '..', 'site'), { recursive: true }).map((f) => String(f).replace(/\\/g, '/')).filter((f) => /\.(js|html)$/.test(f));
  T.ok(pages.some((f) => f.startsWith('embed/')), 'subfolders are read too (embed/)');
  T.ok(!/geolocation|getUserMedia|PaymentRequest|navigator\.usb/.test(pages.map((f) => read('site/' + f)).join('\n')), 'no website page needs them');
});
