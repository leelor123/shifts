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
