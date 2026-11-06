/* The website's shift calculator (site/shift-calculator.html, site/calc.js) must pay a shift exactly as the app does.
 * site/calc.js runs here in a sandbox of its own (only the big cities it ships, no app code around it) and each shift
 * is compared with the same shift made as the app makes it: the app's engine with every locality, a new user's
 * settings, overtime by the law and a birth date for the age. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./t.js');
const { U, Engine, Defaults } = globalThis;
const ROOT = path.join(__dirname, '..');

T.section('website shift calculator = the app');
const file = path.join(ROOT, 'site', 'calc.js');
const box = vm.createContext({ console });
vm.runInContext(fs.readFileSync(file, 'utf8'), box, { filename: 'site/calc.js' });
const SC = box.SiteCalc;

T.test('site/calc.js is built from the current engine (node tools/site-pages.js after a change)', () => {
  const sources = ['src/core/util.js', 'src/core/hebcal.js', 'src/core/defaults.js', 'src/core/engine.js', 'tools/site-calc.js'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const want = require('crypto').createHash('sha1').update(sources.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
  T.eq(SC.src, want, 'site/calc.js is older than the engine: run node tools/site-pages.js');
});

// the app's way: a job with overtime by the law, one role at the rate, the settings a new user gets
const AGE = { u16: 15, a16: 16, a17: 17, adult: null };
function app(inp) {
  const settings = Defaults.defaultSettings();
  settings.rest = Object.assign({}, settings.rest, { city: inp.city });
  const age = AGE[inp.age];
  settings.birthDate = age == null ? null : U.addMonths(inp.date, -(age * 12 + 6));
  const emp = Object.assign(Defaults.defaultEmployer('emp1'), { otLaw: true, travelPerDay: 0 });
  const ctx = Engine.makeCtx({ settings, employers: [emp], roles: [{ id: 'r1', name: 'x', employerId: 'emp1', rates: [{ from: '2000-01-01', rate: inp.rate }] }], dayRules: [] });
  const start = U.toEpoch(inp.date, inp.start);
  let end = U.toEpoch(inp.date, inp.end);
  if (end <= start) end = U.toEpoch(U.addDays(inp.date, 1), inp.end);
  return Engine.computeAll([{ id: 'a', employerId: 'emp1', roleId: 'r1', start, end, breakMin: null, breakPaid: inp.breakPaid !== false }], ctx).get('a');
}
const same = (inp, check) => {
  const site = SC.compute(inp).r, mine = app(inp);
  T.near(site.wage, mine.wage, 1e-9, 'wage');
  T.eq(site.paidMin, mine.paidMin, 'paid minutes');
  T.eq(site.thresholdH, mine.thresholdH, 'overtime after');
  for (const k of Object.keys(mine.hoursBy)) T.near(site.hoursBy[k], mine.hoursBy[k], 1e-9, 'hours ' + k);
  T.eq(JSON.stringify(site.lines.map((l) => [l.label, l.pct, +l.hours.toFixed(6), +l.amount.toFixed(6)])), JSON.stringify(mine.lines.map((l) => [l.label, l.pct, +l.hours.toFixed(6), +l.amount.toFixed(6)])), 'pay lines');
  if (check) check(site);
};
const TLV = 'תל אביב-יפו';

T.test('a long weekday: 8:36 regular, then 125% and 150% (40 ₪)', () => same({ date: '2026-11-02', start: '08:00', end: '19:00', rate: 40, age: 'adult', city: TLV }, (r) => {
  T.near(r.wage, 8.6 * 40 + 2 * 40 * 1.25 + 0.4 * 40 * 1.5, 1e-9, 'by hand');
}));
T.test('Friday evening into Shabbat in Tel Aviv: the hours after candle-lighting at 150%', () => same({ date: '2026-11-06', start: '14:00', end: '22:00', rate: 42.5, age: 'adult', city: TLV }, (r) => T.ok(r.hoursBy.rest > 5 && r.hoursBy.regular > 2, 'part regular, part Shabbat')));
T.test('Jerusalem lights candles 40 minutes before sunset, Haifa 30: a Friday shift splits differently', () => {
  const j = { date: '2026-11-06', start: '14:00', end: '20:00', rate: 40, age: 'adult', city: 'ירושלים' };
  same(j);
  same(Object.assign({}, j, { city: 'חיפה' }));
  T.ok(SC.compute(j).r.hoursBy.rest > SC.compute(Object.assign({}, j, { city: 'חיפה' })).r.hoursBy.rest, 'Jerusalem starts earlier');
});
T.test('a night shift (22:00 to 06:00): 7 regular hours, then overtime', () => same({ date: '2026-11-03', start: '22:00', end: '06:00', rate: 40, age: 'adult', city: TLV }, (r) => T.eq(r.thresholdH, 7)));
T.test('Yom Kippur 2026 (20 to 21 September), a city outside the old list (Modiin)', () => same({ date: '2026-09-20', start: '12:00', end: '23:00', rate: 38, age: 'adult', city: 'מודיעין-מכבים-רעות' }, (r) => T.ok(r.hoursBy.rest + r.hoursBy.restOt1 + r.hoursBy.restOt2 > 4, 'holiday hours')));
T.test('Shabbat with overtime in Beersheba: 150%, 175% and 200%', () => same({ date: '2026-11-07', start: '06:00', end: '19:00', rate: 40, age: 'adult', city: 'באר שבע' }, (r) => T.ok(r.hoursBy.restOt2 > 0, 'beyond the second overtime hour')));
T.test('a 16-year-old on the day before Shabbat: the youth law\'s 7 hours', () => same({ date: '2026-11-06', start: '07:00', end: '15:30', rate: 30, age: 'a16', city: TLV }, (r) => T.eq(r.thresholdH, 7)));
T.test('under 16, an unpaid break, below the minimum wage', () => {
  const inp = { date: '2026-11-04', start: '09:00', end: '17:00', rate: 25, age: 'u16', city: TLV, breakPaid: false };
  same(inp, (r) => T.eq(r.paidMin, 8 * 60 - 45));
  const c = SC.compute(inp);
  T.near(c.min.hourly, Engine.legalMinWage('2026-11-04', U.addMonths('2026-11-04', -186)).hourly, 1e-9, 'the youth minimum');
  T.ok(c.min.hourly > 25, 'the page warns');
});
T.test('every city the page offers is where the app has it', () => {
  T.ok(SC.places.length >= 90, 'the big cities: ' + SC.places.length);
  for (const [name, lat, lon, candle] of SC.places) {
    const loc = globalThis.HebCal.locationOf(Object.assign({}, Defaults.defaultSettings().rest, { city: name }));
    T.ok(loc.lat === lat && loc.lon === lon && loc.candle === candle, name);
  }
});

T.section('the calculator on other websites (site/embed)');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
T.test('the embedded calculator is the same calculator: the same form and result, the same site/calc.js', () => {
  const full = read('site/shift-calculator.html'), emb = read('site/embed/shift-calculator.html');
  const form = (h, endAt) => h.slice(h.indexOf('<div class="ck" data-sc>'), h.indexOf(endAt)).trim();
  T.ok(form(emb, '<p class="by">').length > 1000, 'the embedded form');
  T.eq(form(emb, '<p class="by">'), form(full, '<div class="cta">'), 'the form markup differs between the two pages');
  T.ok(/<html lang="he" dir="rtl" data-embed>/.test(emb), 'right to left, marked as embedded (calc.js posts the height only then)');
  T.ok(emb.includes('<script src="../calc.js"></script>') && !/<script>/.test(emb), 'one copy of the code, no inline script (the CSP allows none)');
  T.ok(!/<header|<footer|<details/.test(emb), 'no site header, footer or questions');
  T.ok(/<a href="https:\/\/shaati\.web\.app\/shift-calculator\?from=embed" target="_blank" rel="noopener">מחושב עם שעתי<\/a>/.test(emb), 'the link to the full site opens in a new tab');
  T.ok(/<meta name="robots" content="noindex">/.test(emb), 'search engines index the full page, not the widget');
  for (const m of emb.matchAll(/(?:href="|url\()((?:\.\.\/)?(?:fonts|img)\/[^")]+)/g)) T.ok(m[1].startsWith('../') && fs.existsSync(path.join(ROOT, 'site', 'embed', m[1])), 'a file one folder up: ' + m[1]);
  T.ok(/prefers-color-scheme: dark/.test(emb), 'light and dark');
});
T.test('calc.js posts the height to the parent only in the embedded page, with the type the host script expects', () => {
  const js = read('site/calc.js'), org = read('site/embed.html');
  T.ok(js.includes('data-embed') && js.includes('shaati-calc-height'), 'calc.js');
  T.ok(org.includes('shaati-calc-height') && read('site/embed.js').includes("e.data.type !== 'shaati-calc-height'") && !read('site/embed.js').includes('__MSG__'),'the host script and the preview listen for the same type');
});
T.test('the organizations page: preview, the iframe code, the copy buttons, in the sitemap and the footer', () => {
  const org = read('site/embed.html');
  T.ok(org.includes('<iframe id="em-preview" src="embed/shift-calculator"'), 'live preview');
  T.ok(/<pre dir="ltr" id="em-code">&lt;iframe src=&quot;https:\/\/shaati\.web\.app\/embed\/shift-calculator&quot;[^<]*&lt;\/iframe&gt;<\/pre><button type="button" data-copy="em-code">/.test(org), 'the one-line code with a copy button');
  T.ok(/<script src="embed.js"><\/script>\n<\/head>/.test(org) && !/<script>/.test(org.replace(/<pre[\s\S]*?<\/pre>/g, '')), 'its script in <head> (listening before the preview loads), no inline script');
  T.ok(read('site/sitemap.xml').includes('<loc>https://shaati.web.app/embed</loc>') && !read('site/sitemap.xml').includes('/embed/'), 'sitemap: the page, not the widget');
  T.ok(read('site/shift-calculator.html').includes('href="embed"') && read('site/check.html').includes('<a href="embed">לארגונים ולבתי ספר</a>'), 'linked from the calculator and the footer');
  T.ok(!/[\u2014\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(org + read('site/embed/shift-calculator.html')), 'no em dash or bidi control characters');
});
T.test('hosting headers: only /embed/** may be framed, every other page keeps frame-ancestors none', () => {
  const h = JSON.parse(read('firebase.json')).hosting.headers;
  const csp = (src) => { const r = h.find((x) => x.source === src); return r && (r.headers.find((x) => x.key === 'Content-Security-Policy') || {}).value; };
  T.ok(/frame-ancestors \*;/.test(csp('/embed/**')), 'the widget');
  T.ok(/frame-ancestors 'none'/.test(csp('!/embed/**')), 'everything else');
  T.eq(csp('/embed/**').replace('frame-ancestors *', ''), csp('!/embed/**').replace("frame-ancestors 'none'", ''), 'the rest of the policy is the same');
  T.ok(!h.some((r) => r.headers.some((x) => /X-Frame-Options/i.test(x.key))), 'no X-Frame-Options');
  T.eq(h.filter((r) => r.headers.some((x) => x.key === 'Content-Security-Policy')).length, 2, 'no other rule sends a second policy');
  T.ok(h.find((r) => r.source === '**').headers.some((x) => x.key === 'X-Content-Type-Options'), 'nosniff on every page');
});
