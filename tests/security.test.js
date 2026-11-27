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

T.section('privacy: a help request sends the name only as the person sees it');
T.test('the name is trimmed before sending, and shown whenever it is not blank', () => {
  const s = read('src/app/views-support.js');
  T.ok(s.includes("name: String(S.settings.userName || '').trim().slice(0, 60),"), 'sent trimmed: a name of spaces sends nothing');
  T.ok(s.includes("${String(S.settings.userName || '').trim() ? `<div class=\"small sp-sendname\""), 'shown when not blank');
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

T.section('security: database rules (audit 23 Nov 2026)');
const rulesSrc = read('firestore.rules');
T.test('the account marker users/{uid} takes only when, the schema and the version (it used to take any field)', () => {
  const m = /match \/users\/\{uid\} \{([\s\S]*?)match \/\{collection\}/.exec(rulesSrc);
  T.ok(m, 'the users/{uid} block');
  T.ok(!/allow [^:]*\bwrite\b/.test(m[1]), 'no blanket write');
  T.ok(m[1].includes("keys().hasOnly(['updatedAt', 'schema', 'app'])"), 'a fixed shape');
  const cloud = read('src/app/cloud.js');
  const w = /fs\.setDoc\(fs\.doc\(db, 'users', Cloud\.user\.uid\), \{([^}]*)\}\)/.exec(cloud);
  T.ok(w, 'the app writes the marker');
  T.eq(w[1].split(',').map((p) => p.split(':')[0].trim()).sort().join(','), 'app,schema,updatedAt', 'the app writes those three fields and no more');
});
T.test('a synced record: the tombstone flag is a yes or no, the record JSON text or nothing', () => {
  T.ok(rulesSrc.includes("request.resource.data.get('d', false) is bool"), 'd');
  T.ok(rulesSrc.includes("(request.resource.data.get('j', null) == null || request.resource.data.j is string)"), 'j');
});
T.test('deleting the account reaches every folder the rules let an account write (nothing left behind)', () => {
  const list = /collection in \[([^\]]*)\]/.exec(rulesSrc)[1].split(',').map((s) => s.trim().replace(/'/g, '')).sort();
  const sync = /const SYNC_STORES = \[([^\]]*)\]/.exec(read('src/app/store.js'))[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  T.eq(list.join(','), sync.concat(['kv']).sort().join(','), 'rules folders = Store.SYNC_STORES + kv');
  T.ok(/for \(const st of SYNC\.concat\(\['kv'\]\)\)/.test(read('src/app/cloud.js')), 'Cloud.deleteAccount walks SYNC + kv');
});

T.section('accessibility: notes are read aloud');
T.test('the note box (role=status) is on the page before its first note, so a screen reader reads the first one too', () => {
  const ui = read('src/app/ui.js');
  T.ok(/function toastBox\(\)[\s\S]*?setAttribute\('role', 'status'\)/.test(ui), 'a live region');
  T.ok(/if \(document\.body\) \{ try \{ toastBox\(\); \}/.test(ui), 'made as ui.js loads');
  T.ok(/function toast\(text, action, opts\) \{\n    const el = toastBox\(\);/.test(ui), 'toast() fills the same box');
});

T.section('security: anonymous statistics records (audit 27 Nov 2026)');
T.test('stats: every feature flag is a named yes or no; the time and the id have bounds; still no identity', () => {
  const v = /function validStats\(d\) \{([\s\S]*?)\n    \}/.exec(rulesSrc)[1];
  const listed = /d\.f\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/.exec(v)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  const checked = [...v.matchAll(/statsF\(d\.f, \[([^\]]*)\]\)/g)].flatMap((m) => m[1].split(',').map((s) => s.trim().replace(/'/g, '')));
  T.eq(checked.slice().sort().join(','), listed.slice().sort().join(','), 'each listed name is checked as a bool');
  T.ok(/function statsF\(f, k\) \{[\s\S]*?k\[10\], false\) is bool;/.test(rulesSrc), 'statsF checks 11 names');
  const st = read('src/app/stats.js');
  const fBlock = st.slice(st.indexOf('f: (() => {'), st.indexOf('})(), // an admin'));
  const sent = [...fBlock.replace(/\/\/.*$/gm, '').matchAll(/(?:\{|,)\s*([a-zA-Z]+): /g)].map((m) => m[1]).filter((k) => k !== 'return');
  T.eq(sent.slice().sort().join(','), listed.slice().sort().join(','), 'the app sends exactly the names the rules take');
  T.ok(v.includes('d.t is int && d.t >= 1735689600000 && d.t < 4102444800000'), 't bounded');
  T.ok(!/\buid\b|email|name/.test(/d\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/.exec(v)[1]), 'no field that names the person');
  T.ok(rulesSrc.includes("id.matches('^[0-9a-z]{16,40}$') && validStats("), 'the id: letters and digits, 16 to 40');
  T.ok(!st.includes('U.uid() + U.uid()'), 'no guessable time-based install id');
  const ctx = { crypto: require('crypto').webcrypto };
  const Stats = {}; new Function('Stats', 'root', /Stats\.newId = function \(\) \{[\s\S]*?\n  \};/.exec(st)[0])(Stats, ctx);
  T.ok(/^[0-9a-f]{32}$/.test(Stats.newId()), 'a 32-digit hex id');
  ctx.crypto = { getRandomValues: (a) => require('crypto').webcrypto.getRandomValues(a) };
  T.ok(/^[0-9a-f]{32}$/.test(Stats.newId()), 'also without randomUUID');
  ctx.crypto = undefined;
  T.eq(Stats.newId(), null, 'no secure source: no id (no record)');
});

T.section('security: CSV formula injection (audit 27 Nov 2026)');
T.test('a CSV cell that starts with = + - @ tab or CR is text; a plain number stays a number', () => {
  const src = read('src/app/export.js');
  const m = /const csvCell = \(v\) => \{[\s\S]*?\n  \};/.exec(src);
  T.ok(m, 'csvCell');
  const csvCell = new Function(m[0] + '\nreturn csvCell;')();
  T.eq(csvCell('=HYPERLINK("http://x","y")'), '"\'=HYPERLINK(""http://x"",""y"")"');
  T.eq(csvCell('+1+1'), "'+1+1"); T.eq(csvCell('@SUM(A1)'), "'@SUM(A1)"); T.eq(csvCell('-2+3'), "'-2+3");
  T.eq(csvCell('\tx'), "'\tx"); T.eq(csvCell('\rx'), '"\'\rx"');
  T.eq(csvCell('-12.50'), '-12.50', 'a negative amount'); T.eq(csvCell(-3), '-3'); T.eq(csvCell('מלצר'), 'מלצר');
  T.eq(csvCell(null), ''); T.eq(csvCell('a=b'), 'a=b', 'only a leading sign');
});
T.test('names received from a workplace code lose a leading = + - @', () => {
  const W = require('../src/core/workplace.js');
  const r = W.clean({ n: '=cmd|"/c calc"!A1', ww: 5, ro: [{ n: '+@-=SUM(1)' }, { n: '-' }, { n: 'מלצר - ערב' }] });
  T.eq(r.n, 'cmd|"/c calc"!A1');
  T.eq(r.ro.map((x) => x.n).join('|'), 'SUM(1)|מלצר - ערב', 'a name of only signs is dropped; a dash inside stays');
  T.eq(W.pack({ employer: { name: 'My place' }, roles: [{ name: 'Cook' }] }).n, 'My place', 'own names are packed as before');
});
