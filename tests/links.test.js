/* Links to "Kol Zchut" must point at real articles. Kol Zchut blocks automated checks, so these titles were
 * checked by hand in a browser (13 Oct 2026: every one returned the article). A link to anything else, or to
 * the site's search page (which answers 404), fails here. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');

const VERIFIED = new Set([
  'שכר מינימום', 'תשלום שכר לבני נוער', 'גמול עבור שעות נוספות', 'גמול עבור העסקה במנוחה השבועית', 'עבודה בשבת',
  'הפסקות בעבודה', 'הפסקות בעבודה לנוער', 'החזר הוצאות נסיעה', 'דמי מחלה', 'חופשה שנתית לעובדים בשכר שעתי או יומי',
  'דמי הבראה', 'דמי חגים', 'תשר ("טיפ") למלצרים במסעדות, בתי קפה וברים', 'חובת ביטוח פנסיוני לעובדים', 'תלוש שכר', 'מועד תשלום השכר', 'ניכויים משכר העובד',
  'הודעה מוקדמת לפיטורים או התפטרות', 'זכותון נוער עובד', 'מינהל הסדרה ואכיפת חוקי עבודה', 'דמי חגים',
  'שעות עבודה ומנוחה לנוער', 'שימוע לפני פיטורים',
  'החזר מס הכנסה', // checked 30 Oct 2026 (the article, updated 2 Mar 2025)
]);

T.section('links to Kol Zchut');
T.test('every Kol Zchut link is a checked article, never the search page', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'views-rights.js'), 'utf8');
  T.ok(!/index\.php\?search=/.test(src), 'no links to the search page (it answers 404)');
  // the titles are kept in one table (PAGES, never translated: they are the link's address), and every KZ(…) uses it
  const table = src.slice(src.indexOf('const PAGES = {'), src.indexOf('};', src.indexOf('const PAGES = {')));
  const pages = Object.fromEntries([...table.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
  const titles = Object.values(pages);
  T.ok(titles.length >= 12, 'links found: ' + titles.length);
  const unknown = titles.filter((t) => !VERIFIED.has(t));
  T.eq(unknown.join(', '), '', 'every title was checked');
  const calls = src.split('KZ(').slice(1).map((seg) => seg.slice(0, seg.indexOf(')')));
  T.eq(calls.filter((c) => /'/.test(c)).join(' | '), '', 'no title written inside KZ(…) itself');
  const used = calls.flatMap((c) => [...c.matchAll(/PAGES\.(\w+)/g)].map((m) => m[1]));
  T.eq(used.filter((k) => !pages[k]).join(', '), '', 'every PAGES key used exists');
});
T.section('official sources (gov.il)');
T.test('every official source is a gov.il guide checked by hand, and every topic of the guide has one', () => {
  // found in gov.il's own search, 28 Oct 2026 (gov.il blocks automated checks); Google Play asks for them
  const CHECKED = new Set(['minimum-wage', 'overtime-and-extra-hours', 'weekends-and-holidays', 'rights-of-working-youth', 'annual-vacations',
    'convalescence-pay', 'paid-sick-leave', 'travel-allowance', 'pension-insurance']);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'views-rights.js'), 'utf8');
  const table = src.slice(src.indexOf('const GOV = {'), src.indexOf('};', src.indexOf('const GOV = {')));
  const urls = Object.fromEntries([...table.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
  T.ok(Object.keys(urls).length >= 12, 'sources: ' + Object.keys(urls).length);
  const bad = Object.values(urls).filter((u) => { const g = /^https:\/\/www\.gov\.il\/he\/Departments\/Guides\/([\w-]+)$/.exec(u); return g ? !CHECKED.has(g[1]) : !/^https:\/\/www\.(gov|btl\.gov)\.il\//.test(u); });
  T.eq(bad.join(', '), '', 'only checked gov.il guides and official sites');
  const topics = [...src.matchAll(/\{ id: '(\w+)', (gov: )?/g)];
  T.eq(topics.filter((m) => !m[2] && m[1] !== 'tips').map((m) => m[1]).join(', '), '', 'every topic (but tips) names its official source');
  T.ok(/אינה מייצגת/.test(src), 'the app says it does not represent a government body');
});

// The app's offline copy answers only the app's own pages: the privacy policy, the terms and the other public pages at
// the same address come from the server (every page load used to get the app, so the website's links to the policy
// opened the app; the owner, 3 Nov 2026). Run here on the worker's real code with a fake service-worker scope.
T.test('the service worker leaves the public legal pages to the server', () => {
  const vm = require('vm');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'sw.js'), 'utf8');
  let onFetch = null;
  const ctx = { self: { location: { origin: 'https://x.io' }, registration: { scope: 'https://x.io/shifts/' }, addEventListener: (t, fn) => { if (t === 'fetch') onFetch = fn; } },
    caches: { match: async () => null, open: async () => ({ put() {}, addAll: async () => {}, match: async () => null }), keys: async () => [], delete: async () => true },
    fetch: async () => ({ ok: true, clone() { return this; } }), URL, Response: class { constructor(b, o) { this.b = b; this.o = o; } static redirect() {} }, console, setTimeout, clearTimeout, indexedDB: undefined };
  ctx.addEventListener = ctx.self.addEventListener;
  vm.createContext(ctx);
  vm.runInContext(src.replace(/\bself\.addEventListener\b/g, 'addEventListener'), ctx, { filename: 'sw.js' });
  const handled = (p) => { let took = false; onFetch({ request: { method: 'GET', mode: 'navigate', url: 'https://x.io' + p }, respondWith() { took = true; } }); return took; };
  for (const p of ['/shifts/privacy.html', '/shifts/terms.html', '/shifts/accessibility.html', '/shifts/delete-account.html']) T.eq(handled(p), false, p + ' comes from the server');
  for (const p of ['/shifts/', '/shifts/index.html', '/shifts/index.en.html']) T.eq(handled(p), true, p + ' is the app');
});
