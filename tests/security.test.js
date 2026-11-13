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

T.section('security: website headers');
T.test('every website page turns off camera, microphone, location, payment and USB', () => {
  const h = JSON.parse(read('firebase.json')).hosting.headers.find((r) => r.source === '**').headers;
  const pp = (h.find((x) => x.key === 'Permissions-Policy') || {}).value || '';
  for (const f of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) T.ok(pp.includes(f + '=()'), f);
  T.ok(!/geolocation|getUserMedia|PaymentRequest|navigator\.usb/.test(fs.readdirSync(path.join(__dirname, '..', 'site')).filter((f) => /\.(js|html)$/.test(f)).map((f) => read('site/' + f)).join('\n')), 'no website page needs them');
});
