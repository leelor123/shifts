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
  // every quoted title inside KZ(…), including both sides of KZ(minor ? 'a' : 'b')
  const titles = src.split('KZ(').slice(1).flatMap((seg) => [...seg.slice(0, seg.indexOf("')") + 1).matchAll(/'([^']+)'/g)].map((m) => m[1]));
  T.ok(titles.length >= 12, 'links found: ' + titles.length);
  const unknown = titles.filter((t) => !VERIFIED.has(t));
  T.eq(unknown.join(', '), '', 'every title was checked');
});
