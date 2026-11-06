/* The website's question pages (one page per common question, for people who search for it), made from the app's
 * own legal tables so the numbers on the site and in the app are the same. Writes site/<page>.html and
 * site/sitemap.xml.  node tools/site-pages.js
 * Run again after a legal table changes (the yearly checklist in CLAUDE.md), then deploy the website. */
process.env.TZ = 'Asia/Jerusalem';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
for (const f of ['util.js', 'places-data.js', 'places.js', 'hebcal.js', 'defaults.js', 'engine.js', 'taxrefund.js']) require(path.join(ROOT, 'src', 'core', f));
const { U, Engine, TaxRefund: TR } = globalThis;

const SITE = 'https://shaati.web.app';
// the fonts come from the website itself (site/fonts, the app's files from tools/fonts.js): Google's stylesheet held the
// first paint for a round trip to two more servers. Their rules go into each page; the Hebrew and Latin files are
// asked for at once.
const FONT_CSS = fs.readFileSync(path.join(ROOT, 'src', 'fonts', 'fonts.css'), 'utf8').trim();
const FONT_HEAD = ['rubik-hebrew', 'rubik-latin'].map((f) => `<link rel="preload" href="fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join('\n') + '\n<style id="fonts">' + FONT_CSS + '</style>';
fs.mkdirSync(path.join(ROOT, 'site', 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'src', 'fonts'))) if (f.endsWith('.woff2')) fs.copyFileSync(path.join(ROOT, 'src', 'fonts', f), path.join(ROOT, 'site', 'fonts', f));
// the living sky of the app's opening (src/app/sky.js) is the website's too: one copy of the code, the site gets it here
fs.copyFileSync(path.join(ROOT, 'src', 'app', 'sky.js'), path.join(ROOT, 'site', 'sky.js'));
// the home page is written by hand: its font block is kept the same as the generated pages'
{
  const home = path.join(ROOT, 'site', 'index.html');
  const h = fs.readFileSync(home, 'utf8');
  const was = h.includes('<style id="fonts">') ? /<link rel="preload" href="fonts\/rubik-hebrew[\s\S]*?<style id="fonts">[\s\S]*?<\/style>/ : /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">[\s\S]*?display=swap">/;
  if (!was.test(h)) throw new Error('site/index.html: the font block was not found');
  let out = h.replace(was, () => FONT_HEAD);
  // its questions and answers, also as FAQPage data (search engines and AI answers read them; hebrew-seo-geo-toolkit),
  // taken from the page's own <details> every run so the two never differ
  const text = (x) => x.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const qa = [...out.matchAll(/<details><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)].map((m) => ({ '@type': 'Question', name: text(m[1]), acceptedAnswer: { '@type': 'Answer', text: text(m[2]) } }));
  if (qa.length < 3) throw new Error('site/index.html: the questions were not found');
  const ld = `<script type="application/ld+json" id="faq-ld">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa })}</script>`;
  out = out.includes('id="faq-ld"') ? out.replace(/<script type="application\/ld\+json" id="faq-ld">[\s\S]*?<\/script>/, () => ld) : out.replace('<style>\n', () => ld + '\n<style>\n');
  if (!out.includes('id="faq-ld"')) throw new Error('site/index.html: the FAQ data was not placed');
  fs.writeFileSync(home, out);
}
const APP = 'https://leelor123.github.io/shifts/';
// the official sources (as in the app's rights screen, views-rights.js GOV)
const GOV = {
  minwage: 'https://www.gov.il/he/Departments/Guides/minimum-wage',
  youth: 'https://www.gov.il/he/Departments/Guides/rights-of-working-youth',
  recup: 'https://www.gov.il/he/Departments/Guides/convalescence-pay',
  rest: 'https://www.gov.il/he/Departments/Guides/weekends-and-holidays',
  sick: 'https://www.gov.il/he/Departments/Guides/paid-sick-leave',
  travel: 'https://www.gov.il/he/Departments/Guides/travel-allowance',
  hours: 'https://www.gov.il/he/Departments/Guides/overtime-and-extra-hours',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// plain text with a range or a joined word (2020–2025, ב-14) kept on one line: the browser may break after a dash
const escWhole = (s) => esc(s).replace(/[^\s<>]*[\p{L}\p{N}][-–‑][\p{L}\p{N}][^\s<>]*/gu, (w) => `<span class="nw">${w}</span>`);
const nis = (n, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ₪';
const today = U.todayKey();
const dmy = (k) => `${+k.slice(8, 10)}.${+k.slice(5, 7)}.${k.slice(0, 4)}`;

/* ---------------- the numbers ---------------- */
const MW = Engine.MIN_WAGE[Engine.MIN_WAGE.length - 1];
const mwYear = MW.from.slice(0, 4);
// youth: a birth date that makes the worker that age on the day the rate starts
const youthAt = (age) => Engine.legalMinWage(MW.from, `${+mwYear - age - 1}-${MW.from.slice(5, 7)}-15`);
const Y = [[15, 'עד גיל 16'], [16, 'בגיל 16'], [17, 'בגיל 17']].map(([age, label]) => Object.assign({ label }, youthAt(age)));
const recupYear = Math.max(...Object.keys(Engine.RECUP_YEARS).map(Number));
const RECUP = Engine.RECUP_YEARS[recupYear];
const HOURLY_EX = { h: 18, d: Engine.recuperationDays(2) };
const recupRows = [[1, 'שנה ראשונה'], [2, 'שנה 2–3'], [4, 'שנה 4–10'], [11, 'שנה 11–15'], [16, 'שנה 16–19'], [20, 'משנה 20']].map(([y, l]) => [l, Engine.recuperationDays(y)]);
const D = globalThis.Defaults.defaultEmployer();
const REST = [+(D.restPct || 150), +(D.restOt1Pct || 175), +(D.restOt2Pct || 200)];
const OT = [+(D.otTier1Pct || 125), +(D.otTier2Pct || 150)];
// overtime by the law, from the engine (a weekday: Monday 2 November 2026; a Friday: the 6th)
const lawEmp = Object.assign({}, D, { otLaw: true });
const dayH = (ww, dk, night) => Engine.otDayHours(lawEmp, { leave: { workWeek: ww } }, dk, night);
const OTL = { five: dayH(5, '2026-11-02'), six: dayH(6, '2026-11-02'), sixFri: dayH(6, '2026-11-06'), night: dayH(5, '2026-11-02', true), week: Engine.WEEK_REG_H, t1h: +(D.otTier1Hours || 2) };
// sick pay (kolzchut "ימי מחלה"): 1.5 days a month (the app's default, settings.leave.sickPerMonth), at most 90; the
// first day unpaid, the 2nd and 3rd at 50%, from the 4th in full. Travel (kolzchut "החזר הוצאות נסיעה"): the bus fare
// up to 22.60 a day (Defaults.LAW_CHECKED.travel), or a monthly pass when cheaper.
const SICK = { perMonth: +((globalThis.Defaults.defaultSettings().leave || {}).sickPerMonth || 1.5), max: 90 };
const TRAVEL_CAP = 22.6;
const Y16 = Engine.youthRules(16, 5), Y15 = Engine.youthRules(15, 5);
// the tax refund (core/taxrefund.js, as in the app's refund sheet): three common cases in the last whole tax year, a
// man with no children, the tax taken each month as the payroll takes it (the year's own brackets and points)
const TAX_Y = +today.slice(0, 4) - 1;
const POINT = Engine.taxLaw({}, today).point;
const taxMonths = (list) => list.map(([m, gross]) => {
  const s = Object.assign(globalThis.Defaults.defaultSettings(), { birthDate: '1990-01-01' });
  const mk = `${TAX_Y}-${String(m).padStart(2, '0')}`;
  return { mk, gross, tax: Engine.netEstimate({ gross, pensionBase: 0, periodTo: mk + '-28', pensionActive: false }, s).incomeTax, pension: 0, src: 'slip' };
});
const taxT = globalThis.Defaults.defaultSettings().tax;
const year12 = (gross) => Array.from({ length: 12 }, (_, i) => [i + 1, gross]);
const TAXEX = [
  ['סטודנט שעבד 4 חודשים בקיץ, 9,000 ₪ ברוטו בחודש', TR.estimate(TAX_Y, taxMonths([[6, 9000], [7, 9000], [8, 9000], [9, 9000]]), { gender: 'm', birthDate: `${TAX_Y - 23}-05-01` }, taxT)],
  [`חייל משוחרר (32 חודשי שירות) שעבד כל השנה ב-10,000 ₪, ולא מסר למעסיק על נקודות השחרור`, TR.estimate(TAX_Y, taxMonths(year12(10000)), { gender: 'm', birthDate: `${TAX_Y - 22}-01-01`, service: { kind: 'army', months: 32, end: `${TAX_Y - 1}-12` } }, taxT)],
  [`בוגר תואר ראשון (${TAX_Y - 1}) שעבד כל השנה ב-12,000 ₪, בלי נקודת התואר`, TR.estimate(TAX_Y, taxMonths(year12(12000)), { gender: 'm', birthDate: `${TAX_Y - 26}-01-01`, degree: { year: TAX_Y - 1, studyYears: 3 } }, taxT)],
];
const hm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

/* ---------------- the pages ---------------- */
const PAGES = [
  {
    slug: 'minimum-wage',
    title: `שכר מינימום ${mwYear}: כמה מגיע לשעה, גם לנוער`,
    desc: `שכר המינימום מ-${dmy(MW.from)}: ${nis(MW.hourly)} לשעה ו-${nis(MW.monthly)} לחודש. ובני נוער: ${Y.map((y) => `${y.label} ${nis(y.hourly)}`).join(', ')} לשעה.`,
    answer: `מ-${dmy(MW.from)} שכר המינימום לשעה הוא <b>${nis(MW.hourly)}</b> (לחודש במשרה מלאה: ${nis(MW.monthly)}). מתחת לגיל 18 יש שכר מינימום לנוער, לפי הגיל.`,
    body: `
      <h2>שכר מינימום לבני נוער</h2>
      <p>לעובד/ת מתחת לגיל 18 שכר המינימום הוא חלק משכר המינימום של מבוגר, לפי הגיל. מגיל 18 מגיע שכר מינימום מלא.</p>
      <div class="tbl"><table><thead><tr><th>גיל</th><th>אחוז משכר המינימום</th><th>לשעה</th><th>לחודש</th></tr></thead><tbody>
        ${Y.map((y) => `<tr><td>${y.label}</td><td>${Math.round(y.share * 100)}%</td><td><b>${nis(y.hourly)}</b></td><td>${nis(y.monthly)}</td></tr>`).join('')}
        <tr><td>מגיל 18</td><td>100%</td><td><b>${nis(MW.hourly)}</b></td><td>${nis(MW.monthly)}</td></tr>
      </tbody></table></div>
      <h2>כמה זה בחודש?</h2>
      <p>במשרה מלאה מבוגר/ת מקבל/ת לפחות ${nis(MW.monthly)} לחודש. מי שעובד/ת לפי שעה מקבל/ת לפחות ${nis(MW.hourly)} על כל שעה, ועל שבת, חג ושעות נוספות יותר מזה.</p>
      <h2>מתי זה משתנה?</h2>
      <p>שכר המינימום מתעדכן בדרך כלל ב-1 באפריל. ${Engine.MIN_WAGE.length > 1 ? `לפני ${dmy(MW.from)} הוא היה ${nis(Engine.MIN_WAGE[Engine.MIN_WAGE.length - 2].hourly)} לשעה.` : ''}</p>`,
    faq: [
      [`מה שכר המינימום לשעה ב-${mwYear}?`, `${nis(MW.hourly)} לשעה, מ-${dmy(MW.from)}.`],
      ['כמה מקבל נער בן 16 לשעה?', `${nis(Y[1].hourly)} לשעה (${Math.round(Y[1].share * 100)}% משכר המינימום).`],
      ['כמה מקבל נער בן 17 לשעה?', `${nis(Y[2].hourly)} לשעה (${Math.round(Y[2].share * 100)}% משכר המינימום).`],
      ['ומה מתחת לגיל 16?', `${nis(Y[0].hourly)} לשעה (${Math.round(Y[0].share * 100)}% משכר המינימום).`],
    ],
    sources: [['שכר מינימום', GOV.minwage], ['זכויות בני נוער בעבודה', GOV.youth]],
  },
  {
    slug: 'recuperation-pay',
    title: `דמי הבראה ${recupYear}: כמה משלמים ליום, וכמה ימים מגיעים`,
    desc: `דמי הבראה בשנת ${recupYear}: ${nis(RECUP)} ליום (מגזר פרטי). מגיעים אחרי שנת עבודה, ${recupRows[0][1]} ימים בשנה הראשונה ועד ${recupRows[recupRows.length - 1][1]} ימים.`,
    answer: `במגזר הפרטי, יום הבראה בשנת ${recupYear} שווה <b>${nis(RECUP)}</b>. מגיעים אחרי שנה שלמה בעבודה, ומספר הימים עולה עם הוותק.`,
    body: `
      <h2>כמה ימי הבראה מגיעים?</h2>
      <div class="tbl"><table><thead><tr><th>ותק בעבודה</th><th>ימי הבראה בשנה</th><th>במשרה מלאה</th></tr></thead><tbody>
        ${recupRows.map(([l, d]) => `<tr><td>${l}</td><td>${d}</td><td><b>${nis(d * RECUP)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <h2>ומי שעובד/ת לפי שעה או בחלקיות משרה?</h2>
      <p>דמי ההבראה מחושבים לפי היקף המשרה: מי שעובד/ת חצי משרה מקבל/ת חצי מהסכום. לעובד/ת לפי שעה במגזר הפרטי:</p>
      <div class="answer">שעות עבודה בשבוע × ימי הבראה לפי הוותק × ${nis(RECUP)} ÷ 42</div>
      <p>לדוגמה: ${HOURLY_EX.h} שעות בשבוע, בשנה השנייה (${HOURLY_EX.d} ימים): <span dir="ltr">${HOURLY_EX.h} × ${HOURLY_EX.d} × ${nis(RECUP)} ÷ 42 = <b>${nis(HOURLY_EX.h * HOURLY_EX.d * RECUP / 42)}</b></span>. מי שהשעות שלו/ה משתנות: לפי ממוצע השעות בחודש ב-12 החודשים האחרונים, חלקי 182.</p>
      <h2>ואם עזבתי?</h2>
      <p>מי שעבד/ה שנה לפחות ועזב/ה, זכאי/ת לדמי הבראה גם על השנה האחרונה, באופן יחסי.</p>`,
    faq: [
      [`כמה שווה יום הבראה ב-${recupYear}?`, `${nis(RECUP)} ליום במגזר הפרטי.`],
      ['מתי מגיעים דמי הבראה?', 'אחרי שנת עבודה שלמה במקום העבודה.'],
      ['כמה ימי הבראה מגיעים בשנה הראשונה?', `${recupRows[0][1]} ימים, כלומר ${nis(recupRows[0][1] * RECUP)} במשרה מלאה.`],
      ['ובחלקיות משרה?', 'לפי היקף המשרה: חצי משרה, חצי מהסכום.'],
      ['איך מחשבים לעובד/ת לפי שעה?', `שעות בשבוע × ימי הבראה × ${nis(RECUP)} ÷ 42 (במגזר הפרטי).`],
    ],
    sources: [['דמי הבראה', GOV.recup]],
  },
  {
    slug: 'overtime',
    title: 'שעות נוספות: מתי מתחילות וכמה משלמים?',
    desc: `שעות נוספות מתחילות אחרי ${OTL.five} שעות ביום בשבוע של 5 ימים, אחרי ${OTL.six} בשבוע של 6, ואחרי ${OTL.night} בלילה. ${OTL.t1h} השעות הראשונות ב-${OT[0]}%, ומהשלישית ${OT[1]}%.`,
    answer: `בשבוע עבודה של 5 ימים, כל שעה אחרי <b>${OTL.five} שעות ביום</b> (${hm(OTL.five)}) היא שעה נוספת, וגם כל שעה רגילה מעל <b>${OTL.week} שעות בשבוע</b>. על ${OTL.t1h} השעות הנוספות הראשונות ביום משלמים ${OT[0]}%, ומהשלישית ${OT[1]}%.`,
    body: `
      <h2>מתי מתחילות שעות נוספות?</h2>
      <div class="tbl"><table><thead><tr><th>מתי</th><th>שעות רגילות</th></tr></thead><tbody>
        <tr><td>שבוע של 5 ימים</td><td><b>${OTL.five} שעות ביום</b> (${hm(OTL.five)})</td></tr>
        <tr><td>שבוע של 6 ימים</td><td><b>${OTL.six} שעות ביום</b>, ביום שישי ${OTL.sixFri}</td></tr>
        <tr><td>משמרת לילה (שעתיים לפחות בין 22:00 ל-06:00)</td><td><b>${OTL.night} שעות</b></td></tr>
        <tr><td>בכל שבוע (ראשון עד שבת)</td><td><b>${OTL.week} שעות רגילות</b></td></tr>
      </tbody></table></div>
      <p>קודם בודקים כל יום, ואחר כך את השבוע: שעות רגילות שעברו את ${OTL.week} השעות בשבוע הן שעות נוספות, גם אם באותו יום לא עברתם את השעות של היום.</p>
      <h2>בני נוער (מתחת לגיל 18)</h2>
      <p>לפי חוק עבודת הנוער מותר לעבוד עד ${Y15.dayHours} שעות ביום (מגיל 16, במקום עבודה של 5 ימים בשבוע: עד ${Y16.dayHours}), עד ${Y16.eveHours} שעות ביום שלפני שבת או חג, ועד ${Engine.WEEK_REG_H_MINOR} שעות בשבוע. מעבר לזה זו עבודה אסורה, אבל המעסיק <b>חייב לשלם עליה גמול שעות נוספות</b>.</p>
      <h2>כמה משלמים?</h2>
      <div class="tbl"><table><thead><tr><th>שעה נוספת</th><th>ביום חול</th><th>בשבת ובחג</th></tr></thead><tbody>
        <tr><td>${OTL.t1h} הראשונות ביום</td><td><b>${OT[0]}%</b></td><td><b>${REST[1]}%</b></td></tr>
        <tr><td>מהשלישית</td><td><b>${OT[1]}%</b></td><td><b>${REST[2]}%</b></td></tr>
      </tbody></table></div>
      <h2>דוגמה</h2>
      <p>שכר של ${nis(40)} לשעה, יום של 10 שעות בשבוע של 5 ימים: ${OTL.five} שעות רגילות (${nis(OTL.five * 40)}) ועוד ${(10 - OTL.five).toFixed(1)} שעות ב-${OT[0]}% (${nis((10 - OTL.five) * 40 * OT[0] / 100)}), ובסך הכול <b>${nis(OTL.five * 40 + (10 - OTL.five) * 40 * OT[0] / 100)}</b>.</p>`,
    faq: [
      ['אחרי כמה שעות מתחילות שעות נוספות?', `בשבוע של 5 ימים אחרי ${OTL.five} שעות ביום (${hm(OTL.five)}), בשבוע של 6 ימים אחרי ${OTL.six} (בשישי ${OTL.sixFri}), ובמשמרת לילה אחרי ${OTL.night}.`],
      ['ומה עם השבוע?', `כל שעה רגילה מעל ${OTL.week} שעות בשבוע (ראשון עד שבת) היא שעה נוספת.`],
      ['כמה משלמים על שעה נוספת?', `${OT[0]}% על ${OT[0] === 125 ? 'שתי' : ''} השעות הנוספות הראשונות ביום ו-${OT[1]}% מהשלישית. בשבת ובחג: ${REST[1]}% ו-${REST[2]}%.`],
      ['ומה לגבי בני נוער?', `מתחת לגיל 18 מותר לעבוד עד ${Y15.dayHours} שעות ביום (מגיל 16 בשבוע של 5 ימים: ${Y16.dayHours}), ${Y16.eveHours} ביום שלפני שבת או חג, ו-${Engine.WEEK_REG_H_MINOR} בשבוע. על שעות מעבר לזה מגיע גמול שעות נוספות.`],
      ['מעסיק יכול לא לשלם על שעות נוספות?', 'לא, אי אפשר לוותר על התוספת, אלא אם העובד עבד שעות נוספות בלי אישור המעסיק.'],
    ],
    sources: [['שעות נוספות', GOV.hours]],
  },
  {
    slug: 'sick-pay',
    title: 'ימי מחלה: כמה צוברים וכמה משלמים?',
    desc: `כל עובד צובר ${SICK.perMonth} ימי מחלה בכל חודש עבודה מלא, עד ${SICK.max}. על היום הראשון לא משלמים, על השני והשלישי 50%, ומהרביעי שכר מלא.`,
    answer: `על כל חודש עבודה מלא צוברים <b>${SICK.perMonth} ימי מחלה</b> (עד ${SICK.max}). ביום המחלה הראשון אין תשלום, בשני ובשלישי <b>50%</b>, ומהיום הרביעי <b>שכר מלא</b>.`,
    body: `
      <h2>כמה משלמים על יום מחלה?</h2>
      <div class="tbl"><table><thead><tr><th>יום המחלה</th><th>תשלום</th></tr></thead><tbody>
        <tr><td>היום הראשון</td><td><b>בלי תשלום</b></td></tr>
        <tr><td>היום השני והשלישי</td><td><b>50%</b> מהשכר של אותו יום</td></tr>
        <tr><td>מהיום הרביעי</td><td><b>100%</b></td></tr>
      </tbody></table></div>
      <h2>ומי שעובד/ת לפי שעה?</h2>
      <p>גם עובדים לפי שעה ובמשרה חלקית צוברים ימי מחלה, באופן יחסי לימים שעבדו בחודש. דמי מחלה משולמים על ימים שבהם הייתה לך משמרת ונעדרת בגלל מחלה: מי שלא שובץ/ה למשמרת באותם ימים, לא מקבל/ת עליהם תשלום.</p>
      <h2>מה צריך?</h2>
      <p>אישור מחלה מרופא, שמוסרים למעסיק. ימי מחלה שלא השתמשת בהם נשארים צבורים, אבל לא מקבלים עליהם כסף כשעוזבים.</p>`,
    faq: [
      ['כמה ימי מחלה צוברים בחודש?', `${SICK.perMonth} ימים על כל חודש עבודה מלא, ועד ${SICK.max} ימים בסך הכול.`],
      ['משלמים על היום הראשון של מחלה?', 'לא. על היום השני והשלישי משלמים 50%, ומהרביעי שכר מלא.'],
      ['גם לעובד/ת לפי שעה?', 'כן, באופן יחסי לימים שעבדת, ועל ימים שבהם הייתה לך משמרת.'],
      ['מקבלים כסף על ימי מחלה שלא ניצלתי?', 'לא. הם נשארים צבורים כל עוד את/ה באותו מקום עבודה.'],
    ],
    sources: [['ימי מחלה', GOV.sick]],
  },
  {
    slug: 'travel-expenses',
    title: 'נסיעות לעבודה: כמה המעסיק צריך להחזיר?',
    desc: `החזר נסיעות לעבודה: לפי מחיר נסיעה מוזל באוטובוס ועד ${nis(TRAVEL_CAP)} ליום, או חופשי חודשי אם הוא זול יותר. מגיע לכל עובד שצריך תחבורה, בכל היקף משרה.`,
    answer: `על כל יום שהגעת לעבודה בתחבורה, המעסיק מחזיר את מחיר הנסיעה המוזל באוטובוס, <b>עד ${nis(TRAVEL_CAP)} ליום</b> (או חופשי חודשי, אם הוא זול יותר).`,
    body: `
      <h2>מי זכאי/ת?</h2>
      <p>כל עובד/ת שצריך/ה תחבורה כדי להגיע לעבודה, בכל היקף משרה, גם לפי שעה. לא מגיע על ימים שבהם המעסיק הסיע אותך, ועל ימים שלא הגעת (מחלה, חופשה).</p>
      <h2>ובשבת או בלילה?</h2>
      <p>בימים ובשעות שאין בהם תחבורה ציבורית (שבת, חג) המעסיק משלם את עלות הנסיעה בפועל, עד ${nis(TRAVEL_CAP)} ליום, גם אם באותו חודש קיבלת החזר לפי חופשי חודשי.</p>
      <h2>דוגמה</h2>
      <p>12 ימי עבודה בחודש, ונסיעה הלוך ושוב של 11 ₪: 12 × 11 = <b>132 ₪</b> (אם חופשי חודשי עולה פחות, המעסיק רשאי לשלם לפיו).</p>`,
    faq: [
      ['כמה מקסימום מחזירים על נסיעות ליום?', `עד ${nis(TRAVEL_CAP)} ליום, לפי מחיר נסיעה מוזל באוטובוס.`],
      ['גם לעובד/ת לפי שעה?', 'כן, בכל היקף משרה, על כל יום שהגעת לעבודה בתחבורה.'],
      ['ומה אם אני עובד/ת בשבת?', `בימים בלי תחבורה ציבורית המעסיק משלם את עלות הנסיעה בפועל, עד ${nis(TRAVEL_CAP)} ליום.`],
      ['אפשר לוותר על דמי הנסיעות?', 'לא. אי אפשר לוותר על הזכות או להסכים לפחות מהמינימום.'],
    ],
    sources: [['החזר הוצאות נסיעה', GOV.travel]],
  },
  {
    slug: 'shabbat-pay',
    title: 'כמה משלמים על עבודה בשבת ובחג?',
    desc: `על כל שעה בשבת או בחג משלמים לפחות ${REST[0]}% מהשכר הרגיל. שעות נוספות בשבת: ${REST[1]}% ו-${REST[2]}%.`,
    answer: `על כל שעה שעובדים במנוחה השבועית (שבת) או בחג משלמים לפחות <b>${REST[0]}%</b> מהשכר הרגיל לשעה.`,
    body: `
      <h2>וכמה זה בשקלים?</h2>
      <div class="tbl"><table><thead><tr><th>שכר רגיל לשעה</th><th>שעה בשבת (${REST[0]}%)</th><th>שעה נוספת בשבת (${REST[1]}%)</th></tr></thead><tbody>
        ${[MW.hourly, 40, 45, 50].map((h) => `<tr><td>${nis(h)}${h === MW.hourly ? ' (מינימום)' : ''}</td><td><b>${nis(h * REST[0] / 100)}</b></td><td>${nis(h * REST[1] / 100)}</td></tr>`).join('')}
      </tbody></table></div>
      <h2>שעות נוספות בשבת</h2>
      <p>שעה נוספת בשבת שווה יותר משעה רגילה בשבת: ${REST[1]}% לשתי השעות הנוספות הראשונות ו-${REST[2]}% מהשעה השלישית (ביום חול: ${OT[0]}% ו-${OT[1]}%).</p>
      <p>מי שמקבל/ת משכורת חודשית קבועה מקבל/ת על שעה בשבת תוספת של ${REST[0] - 100}% מעל השכר הרגיל.</p>
      <h2>מאיזו שעה זה נחשב שבת?</h2>
      <p>בדרך כלל מכניסת השבת ועד צאתה, וזמני השבת משתנים לפי העיר ולפי עונת השנה. המנוחה השבועית נמשכת לפחות 36 שעות רצופות שכוללות את השבת. משמרת שמתחילה ביום שישי אחר הצהריים יכולה להיות חלקה רגילה וחלקה בשבת.</p>`,
    faq: [
      ['כמה משלמים על שעה בשבת?', `לפחות ${REST[0]}% מהשכר הרגיל לשעה.`],
      ['וכמה על שעה נוספת בשבת?', `${REST[1]}% לשתי השעות הנוספות הראשונות ו-${REST[2]}% מהשלישית.`],
      ['גם בחג משלמים יותר?', `כן, חגים הם ימי מנוחה, ועבודה בהם שווה לפחות ${REST[0]}%.`],
      ['ממתי מתחילה השבת לעניין השכר?', 'בדרך כלל מכניסת השבת ועד צאתה, לפי העיר. המנוחה השבועית נמשכת לפחות 36 שעות רצופות.'],
    ],
    sources: [['מנוחה שבועית וחגים', GOV.rest], ['שעות נוספות', GOV.hours]],
  },
  {
    slug: 'tax-refund',
    title: 'מגיע לי החזר מס? מי זכאי, כמה ואיך מגישים',
    desc: `עבדת רק חלק מהשנה, השתחררת מהצבא או סיימת תואר? כנראה נלקח ממך יותר מדי מס. כמה זה, אילו נקודות זיכוי מגיעות לך ואיך מקבלים את הכסף, עד 6 שנים אחורה.`,
    answer: `מס הכנסה נלקח מהמשכורת כל חודש <b>כאילו תעבוד כך כל השנה</b>. מי שעבד רק חלק מהשנה, השתחרר משירות, סיים תואר, עבד אצל כמה מעסיקים או שנוכה ממנו מס לפני גיל 18, לרוב שילם יותר מדי, ויכול לקבל את ההפרש בחזרה <b>עד 6 שנים אחורה</b>, עם הפרשי הצמדה וריבית.`,
    body: `
      <h2>כמה זה יכול להיות?</h2>
      <div class="tbl"><table><thead><tr><th>מי</th><th>החזר משוער על ${TAX_Y}</th></tr></thead><tbody>
        ${TAXEX.map(([who, r]) => `<tr><td>${esc(who)}</td><td><b>${nis(Math.round(r.refund), 0)}</b></td></tr>`).join('')}
      </tbody></table></div>
      <p class="src">לפי מדרגות המס ונקודות הזיכוי של ${TAX_Y}, לגבר בלי ילדים, כשהמעסיק לקח מס כל חודש כרגיל. כל מקרה שונה.</p>
      <h2>למה זה קורה?</h2>
      <p>לכל תושב/ת ישראל יש <b>נקודות זיכוי</b> (2.25 לגבר, 2.75 לאישה), וכל נקודה מורידה ${nis(POINT, 0)} מהמס בכל חודש (${nis(POINT * 12, 0)} בשנה). המעסיק מחשב את המס של כל חודש כאילו המשכורת הזו תימשך כל השנה. מי שעבד רק כמה חודשים, ההכנסה השנתית שלו נמוכה יותר, והנקודות של החודשים בלי עבודה לא נוצלו, עד שמבקשים אותן בחזרה.</p>
      <p>וכשיש נקודות זיכוי נוספות שהמעסיק לא ידע עליהן (כי לא מסרת עליהן בטופס 101), גם הן לא ירדו מהמס.</p>
      <h2>נקודות זיכוי שכדאי להכיר</h2>
      <ul>
        <li><b>נוער עובד</b>: נקודה נוספת בגיל 16 ו-17.</li>
        <li><b>חיילים משוחררים</b>: 2 נקודות למשך 36 חודשים מהחודש שאחרי השחרור, אחרי שירות של 23 חודשים לפחות (22 לאישה); נקודה אחת אחרי שירות של 12 חודשים ומעלה. גם בשירות לאומי או אזרחי (24 חודשים לשתי נקודות).</li>
        <li><b>תואר ראשון</b>: נקודה אחת בשנים שאחרי סיום התואר (מ-2023: כמספר שנות הלימוד, עד 3 שנים; לפני כן: שנה אחת).</li>
        <li><b>אישה</b>: חצי נקודה נוספת.</li>
      </ul>
      <p>יש עוד: ילדים, עולים חדשים, מגורים ביישוב מוטב, הורה יחיד, נכות ותרומות. לבדיקה מלאה: <a href="${TR.SIMULATOR_URL}" rel="noopener">הסימולטור של רשות המסים</a>.</p>
      <h2>איך מקבלים את הכסף?</h2>
      <ol>
        <li><b>מבקשים טופס 106</b> מכל מעסיק, לכל שנה. המעסיק חייב לתת אותו עד סוף מרץ של השנה שאחרי.</li>
        <li><b>מכינים אישורים</b> לנקודות הזיכוי (תעודת שחרור, אישור זכאות לתואר) ופרטי חשבון בנק.</li>
        <li><b>מגישים באינטרנט</b> בקשה להחזר מס (טופס 135) <a href="${TR.FILE_URL}" rel="noopener">באתר רשות המסים</a>, בקשה אחת לכל שנה. בלי עמלה ובלי רואה חשבון.</li>
        <li><b>ההחזר מגיע לחשבון הבנק</b> עם הפרשי הצמדה וריבית, לרוב תוך כמה חודשים.</li>
      </ol>`,
    cta: ['שעתי בודקת את זה בשבילך', 'רושמים משמרות או מעלים תלושים, ושעתי מעריכה את ההחזר לכל שנה, עד 6 שנים אחורה, ומסבירה בדיוק מה להגיש. חינם ובלי פרסומות, ומנוי Plus לבחירה.','לבדוק את ההחזר שלי', APP + '?action=tax-refund&from=site'],
    faq: [
      ['עד כמה שנים אחורה אפשר לבקש החזר מס?', `עד 6 שנים אחורה, בקשה נפרדת לכל שנה. ב-${today.slice(0, 4)} אפשר לבקש על השנים ${+today.slice(0, 4) - 6}–${+today.slice(0, 4) - 1}.`],
      ['צריך רואה חשבון כדי לקבל החזר מס?', 'לא. אפשר להגיש לבד באתר רשות המסים (טופס 135), בלי עמלה. חברות להחזרי מס גובות לרוב אחוזים מההחזר.'],
      ['כמה זמן לוקח לקבל את ההחזר?', 'לרוב כמה חודשים מההגשה. הכסף מגיע לחשבון הבנק עם הפרשי הצמדה וריבית.'],
      ['מה זה טופס 106?', 'סיכום שנתי של המשכורת ושל המס שנוכה, שהמעסיק חייב לתת לכל עובד עד סוף מרץ של השנה שאחרי. צריך טופס 106 מכל מעסיק.'],
      ['עבדתי כנער/ה וירד לי מס. מגיע לי החזר?', 'כמעט תמיד כן: בשכר של נוער בדרך כלל אין חבות מס, ולכן כל המס שנוכה חוזר.'],
    ],
    sources: [['בקשה להחזר מס (טופס 135)', TR.FILE_URL], ['בדיקת זכאות להחזר מס לשכירים', TR.SIMULATOR_URL]],
    note: 'זו הערכה ואינה ייעוץ מס; הקובע הוא החישוב של רשות המסים.',
  },
];

/* ---------------- the page ---------------- */
const CSS = `
:root { --bg: #f7f8fb; --surface: #fff; --surface-2: #eef1f8; --ink: #0f1a33; --ink-2: #556078; --line: #e2e6ef; --brand: #0d2b6b; --brand-2: #16398a; --gold: #e9c987; --cta-1: #0d2b6b; --cta-2: #06173d; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0a0f1f; --surface: #111a30; --surface-2: #16203a; --ink: #eef1f8; --ink-2: #a4adc4; --line: #222c46; --brand: #a9c0f2; --brand-2: #c3d3f7; color-scheme: dark; } }
* { box-sizing: border-box; }
[hidden] { display: none !important; } /* (a rule that sets display would show what is hidden) */
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 1.05rem/1.7 Rubik, system-ui, sans-serif; overflow-wrap: break-word; }
a { color: var(--brand); }
header { position: sticky; top: 0; z-index: 2; background: rgba(7, 26, 69, .92); backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); color: #fff; }
.bar { max-width: 760px; margin: 0 auto; display: flex; align-items: center; gap: 12px; padding: 10px max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left)); }
.bar a.logo { display: flex; align-items: center; gap: 10px; min-height: 44px; color: #fff; text-decoration: none; font: 600 1.2rem Rubik, sans-serif; margin-inline-end: auto; }
.bar img { width: 36px; height: 36px; border-radius: 10px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 999px; background: linear-gradient(135deg, var(--cta-1), var(--cta-2)); color: #fff; font-weight: 700; text-decoration: none; padding: 10px 20px; white-space: nowrap; }
.bar .btn { background: linear-gradient(180deg, #f3dca8, var(--gold)); color: #141821; font-weight: 600; transition: transform .16s cubic-bezier(.23, 1, .32, 1); }
.btn:active { transform: scale(.97); }
main { max-width: 760px; margin: 0 auto; padding: 28px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); }
nav.crumbs { font-size: .9rem; color: var(--ink-2); margin-bottom: 10px; }
/* links a finger can hit (launch check 7: 17 px tall) */
nav.crumbs a, footer a { display: inline-block; padding-block: 10px; }
h1 { font: 700 clamp(1.7rem, 5vw, 2.4rem)/1.25 Rubik, sans-serif; margin: 0 0 16px; text-wrap: balance; }
h2 { font: 700 1.35rem/1.35 Rubik, sans-serif; margin: 34px 0 10px; text-wrap: balance; }
.answer { background: var(--surface); border-radius: 20px; padding: 18px 20px; box-shadow: 0 6px 24px rgba(10, 20, 45, .08); border: 1px solid var(--line); font-size: 1.12rem; }
.tbl { overflow-x: auto; background: var(--surface); border-radius: 18px; box-shadow: 0 6px 24px rgba(10, 20, 45, .06); }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 11px 10px; text-align: start; border-bottom: 1px solid var(--line); }
td { white-space: nowrap; }
td:first-child { white-space: normal; } /* the label wraps between words; the numbers stay on one line */
th { line-height: 1.3; }
@media (max-width: 420px) { th, td { padding: 10px 8px; font-size: .95rem; } }
th { font-size: .9rem; color: var(--ink-2); font-weight: 600; background: var(--surface-2); }
tr:last-child td { border-bottom: 0; }
.cta { margin: 36px 0 8px; background: radial-gradient(110% 120% at 90% 0%, #1b3f8f 0%, transparent 60%), linear-gradient(160deg, var(--cta-1), var(--cta-2)); color: #fff; border-radius: 24px; padding: 22px; display: grid; gap: 12px; }
.cta b { font: 700 1.25rem Rubik, sans-serif; }
.cta .btn { background: linear-gradient(180deg, #f3dca8, var(--gold)); color: #141821; justify-self: start; }
details { background: var(--surface); border-radius: 16px; padding: 12px 16px; margin: 10px 0; }
summary { font-weight: 600; cursor: pointer; min-height: 44px; display: flex; align-items: center; }
details p { margin: 8px 0 0; color: var(--ink-2); }
.src, .note { font-size: .92rem; color: var(--ink-2); }
.note { margin-top: 26px; padding: 14px 16px; border: 1px dashed var(--line); border-radius: 14px; }
.more { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.more a { background: var(--surface); border-radius: 999px; padding: 8px 14px; text-decoration: none; box-shadow: 0 2px 10px rgba(10, 20, 45, .06); }
footer { text-align: center; color: var(--ink-2); font-size: .9rem; padding: 0 16px 32px; }
/* a keyboard user skips the header, and sees where the focus is: the home page's skip link and a 2 px ring (accessibility
 * audit C); on the dark header and the dark boxes the ring is gold or white */
.skip { position: absolute; inset-inline-start: 12px; top: -60px; z-index: 50; background: var(--gold); color: #141821; padding: 10px 16px; border-radius: 12px; font-weight: 600; text-decoration: none; }
.skip:focus { top: 12px; }
:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
header :focus-visible, .cta :focus-visible { outline-color: var(--gold); }
.nw { white-space: nowrap; }`;

function page(p, date) {
  const url = `${SITE}/${p.slug}`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'שעתי', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: p.title, item: url }] },
  ];
  const others = PAGES.filter((x) => x !== p);
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)} · שעתי</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#071a45">
<meta property="og:type" content="article">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="שעתי">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="שעתי: כמה באמת מגיע לך על כל שעה. האפליקציה בטלפון, עם השכר של החודש">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="img/favicon-48.png" sizes="48x48">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
${FONT_HEAD}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#main">דילוג לתוכן</a>
<header><div class="bar"><a class="logo" href="./"><img src="img/apple-touch-icon.png" alt="">שעתי</a><a class="btn" href="${APP}">לפתוח את שעתי</a></div></header>
<main id="main">
  <nav class="crumbs" aria-label="ניווט"><a href="./">שעתי</a> › ${esc(p.title)}</nav>
  <h1>${esc(p.title)}</h1>
  <div class="answer">${p.answer}</div>
  ${p.body}
  ${(([b, t, btn, href]) => `<div class="cta"><b>${b}</b><span>${t}</span><a class="btn" href="${href}">${btn}</a></div>`)(p.cta || ['שעתי מחשבת את זה בשבילך', 'רושמים משמרות, ושעתי מעריכה את השכר לפי חוקי העבודה: שבתות וחגים לפי העיר, שעות נוספות, שכר מינימום לפי הגיל והבראה. חינם ובלי פרסומות, ומנוי Plus לבחירה.', 'לפתוח את שעתי', APP])}
  <h2>שאלות נפוצות</h2>
  ${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${escWhole(a)}</p></details>`).join('\n  ')}
  <p class="src">המקור הרשמי: ${p.sources.map(([l, h]) => `<a href="${h}" rel="noopener">${esc(l)} ב-gov.il</a>`).join(' · ')}</p>
  <div class="note">שעתי אינה גוף ממשלתי ואינה מייצגת גוף ממשלתי. המידע כללי ואינו ייעוץ משפטי; בהסכם קיבוצי, צו הרחבה ענפי או חוזה אישי ייתכנו זכויות נוספות.${p.note ? ' ' + p.note : ''} עודכן ב-${dmy(date)}.</div>
  <h2>עוד שאלות</h2>
  <div class="more"><a href="shift-calculator">${esc(CALC.title)}</a><a href="check">${esc(CHECK.title)}</a>${others.map((x) => `<a href="${x.slug}">${esc(x.title)}</a>`).join('')}</div>
</main>
<footer>שעתי · <a href="./">לאתר</a> · <a href="privacy">פרטיות</a> · <a href="accessibility">הצהרת נגישות</a> · <a href="mailto:lybtn48@gmail.com">יצירת קשר</a></footer>
</body>
</html>
`;
}

/* ---------------- the 10-second check: "are they cheating you?" ---------------- */
const CHECK = { slug: 'check', title: 'מרמים אותך? בדיקה של 10 שניות', desc: `מכניסים גיל ושכר לשעה, ורואים אם משלמים לך לפי החוק (${mwYear}): שכר מינימום לנוער ולמבוגרים, ושבת ב-${REST[0]}%. בלי הרשמה, שום דבר לא נשלח.` };
const CHECK_CSS = `
.ck { background: var(--surface); border-radius: 22px; padding: 18px; box-shadow: 0 6px 24px rgba(10, 20, 45, .08); display: grid; gap: 16px; }
.ck label, .ck .q { font-weight: 600; display: grid; gap: 8px; }
.ages { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.ages button { font: 600 1rem Rubik, sans-serif; border: 1.5px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 14px; padding: 12px 4px; cursor: pointer; }
.ages button[aria-pressed="true"] { border-color: var(--brand); background: var(--surface-2); color: var(--brand); }
.ck input:not([type=checkbox]) { font: 600 1.15rem Rubik, sans-serif; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--bg); color: var(--ink); width: 100%; box-sizing: border-box; }
.ck input:not([type=checkbox]):focus { outline: 2px solid var(--brand); outline-offset: 1px; }
.ck .sw { display: flex; align-items: center; gap: 10px; font-weight: 500; min-height: 44px; }
.ck .sw input { width: 22px; height: 22px; accent-color: var(--brand); }
.ck small { color: var(--ink-2); font-weight: 400; }
/* a value that cannot be right: said in words, and no result under it */
.ck-err { margin: 0; color: #b42318; font-weight: 500; }
@media (prefers-color-scheme: dark) { .ck-err { color: #ff9b8f; } }
.ck input[aria-invalid=true] { border-color: #b42318; }
#ck-out { border-radius: 22px; padding: 20px; display: grid; gap: 8px; text-align: center; color: #fff; }
#ck-out.bad { background: linear-gradient(160deg, #8f1d33, #c2334d); }
#ck-out.good { background: linear-gradient(135deg, #0b7a4b, #14b8a6); }
#ck-title { font: 700 1.5rem Rubik, sans-serif; }
#ck-big { font: 800 clamp(1.6rem, 7vw, 2.3rem)/1.2 Rubik, sans-serif; }
#ck-why { opacity: .92; }
.ck-acts { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 6px; }
.ck-acts button { font: 700 1rem Rubik, sans-serif; border: 0; border-radius: 999px; padding: 12px 18px; cursor: pointer; background: #fff; color: #0d2b6b; }
.ck-acts button.wa { background: #25d366; color: #063b1c; }
.priv { font-size: .92rem; color: var(--ink-2); text-align: center; }
#ck-out :focus-visible { outline-color: #fff; }`;
function checkPage(date) {
  const url = `${SITE}/check`;
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(CHECK.title)} · שעתי</title>
<meta name="description" content="${esc(CHECK.desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#071a45">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="שעתי">
<meta property="og:title" content="${esc(CHECK.title)}">
<meta property="og:description" content="${esc(CHECK.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="שעתי: כמה באמת מגיע לך על כל שעה. האפליקציה בטלפון, עם השכר של החודש">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="img/favicon-48.png" sizes="48x48">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
${FONT_HEAD}
<style>${CSS}${CHECK_CSS}</style>
</head>
<body>
<a class="skip" href="#main">דילוג לתוכן</a>
<header><div class="bar"><a class="logo" href="./"><img src="img/apple-touch-icon.png" alt="">שעתי</a><a class="btn" href="${APP}">לפתוח את שעתי</a></div></header>
<main id="main">
  <h1>${esc(CHECK.title)}</h1>
  <p>שתי שאלות, ורואים אם משלמים לך לפחות שכר מינימום לפי החוק. בלי הרשמה, ושום דבר לא נשלח.</p>
  <div class="ck">
    <div class="q">בן/בת כמה את/ה?
      <div class="ages" role="group" aria-label="גיל">
        <button type="button" data-age="u16" aria-pressed="false">מתחת ל-16</button>
        <button type="button" data-age="a16" aria-pressed="false">16</button>
        <button type="button" data-age="a17" aria-pressed="false">17</button>
        <button type="button" data-age="adult" aria-pressed="false">18 ומעלה</button>
      </div>
    </div>
    <label for="ck-wage"><span>כמה משלמים לך לשעה (₪)?</span><input id="ck-wage" type="text" inputmode="decimal" autocomplete="off" aria-describedby="ck-err" placeholder="למשל 32"></label>
    <label for="ck-hours"><span>כמה שעות בחודש, בערך? <small>(לא חובה)</small></span><input id="ck-hours" type="text" inputmode="decimal" autocomplete="off" aria-describedby="ck-err" placeholder="למשל 60"></label>
    <label class="sw"><input id="ck-shab" type="checkbox"> בשבת משלמים לי אותו תעריף כמו ביום חול</label>
    <label id="ck-shab-h" for="ck-shab-hours" hidden><span>כמה מהשעות האלה בשבת?</span><input id="ck-shab-hours" type="text" inputmode="decimal" autocomplete="off" aria-describedby="ck-err" placeholder="למשל 8"></label>
  </div>
  <p id="ck-err" class="ck-err" role="alert" hidden></p>
  <div id="ck-out" hidden aria-live="polite">
    <div id="ck-title"></div>
    <div id="ck-big"></div>
    <div id="ck-why"></div>
    <div class="ck-acts"><button type="button" id="ck-share">📸 תמונה לסטורי</button><button type="button" class="wa" id="ck-wa">שליחה בוואטסאפ</button></div>
  </div>
  <div class="cta"><b>זה רק שכר המינימום</b><span>שעתי בודקת את כל השאר: שבתות וחגים לפי העיר, שעות נוספות, נסיעות והבראה, ומשווה את התלוש לשעות שרשמת. חינם ובלי פרסומות, ומנוי Plus לבחירה.</span><a class="btn" href="${APP}">לבדוק את התלוש בשעתי</a></div>
  <p class="src">המקור הרשמי: ${[['שכר מינימום', GOV.minwage], ['זכויות בני נוער בעבודה', GOV.youth], ['מנוחה שבועית וחגים', GOV.rest]].map(([l, h]) => `<a href="${h}" rel="noopener">${esc(l)} ב-gov.il</a>`).join(' · ')}</p>
  <div class="note">שעתי אינה גוף ממשלתי ואינה מייצגת גוף ממשלתי. הבדיקה כללית ואינה ייעוץ משפטי: לפי שכר המינימום מ-${dmy(MW.from)} ולפי הגיל; לחניכים, לבעלי מוגבלות ובהסכמים מיוחדים יש כללים אחרים. עודכן ב-${dmy(date)}.</div>
  <h2>עוד שאלות</h2>
  <div class="more"><a href="shift-calculator">${esc(CALC.title)}</a>${PAGES.map((x) => `<a href="${x.slug}">${esc(x.title)}</a>`).join('')}</div>
</main>
<footer>שעתי · <a href="./">לאתר</a> · <a href="privacy">פרטיות</a> · <a href="accessibility">הצהרת נגישות</a> · <a href="mailto:lybtn48@gmail.com">יצירת קשר</a></footer>
<script src="check.js"></script>
</body>
</html>
`;
}
/* ---------------- the shift calculator: "how much is this shift worth?" ----------------
 * The app's own engine runs in the page (site/calc.js: src/core's util, hebcal, defaults and engine, then
 * tools/site-calc.js), so a shift here and the same shift in the app pay the same (tests/sitecalc.test.js). */
const CALC = { slug: 'shift-calculator', title: 'כמה שווה המשמרת? מחשבון שכר למשמרת', desc: `תאריך, שעות, שכר לשעה, גיל ועיר, ורואים כמה המשמרת שווה לפי חוק העבודה: שבת וחג ב-${REST[0]}% לפי זמני השבת בעיר, שעות נוספות, משמרת לילה ושכר מינימום לפי הגיל. בלי הרשמה.` };
// the cities: the app's localities of 20,000 people and more (and the three with their own candle-lighting time), at
// the app's coordinates; a smaller place takes the nearest big one (its Shabbat times differ by a minute or two)
const CALC_PLACES = globalThis.Places.ALL.filter((p) => !p.kind && (p.pop >= 20000 || p.candle !== 18))
  .sort((a, b) => a.name.localeCompare(b.name, 'he')).map((p) => [p.name, p.lat, p.lon, p.candle]);
const CALC_SOURCES = ['src/core/util.js', 'src/core/hebcal.js', 'src/core/defaults.js', 'src/core/engine.js', 'tools/site-calc.js'];
// (the same in tests/sitecalc.test.js: sha1 of the sources, line ends as LF)
const calcFingerprint = (text) => require('crypto').createHash('sha1').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
const CALC_CITY = 'תל אביב-יפו';
const hWords = (h) => { const m = Math.round(h * 60); return m % 60 ? `${Math.floor(m / 60)} שעות ו-${m % 60} דקות` : `${m / 60} שעות`; };
if (!CALC_PLACES.some((p) => p[0] === CALC_CITY)) throw new Error('the calculator: ' + CALC_CITY + ' is not in the city list');
const CALC_CSS = `
.sc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ck select { font: 600 1.1rem Rubik, sans-serif; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--bg); color: var(--ink); width: 100%; min-height: 50px; }
.ck select:focus { outline: 2px solid var(--brand); outline-offset: 1px; }
.ck input[type=date], .ck input[type=time] { min-height: 50px; font-variant-numeric: tabular-nums; }
#sc-out { display: grid; gap: 14px; margin-top: 18px; }
.sc-total { background: radial-gradient(110% 120% at 90% 0%, #1b3f8f 0%, transparent 60%), linear-gradient(160deg, var(--cta-1), var(--cta-2)); color: #fff; border-radius: 24px; padding: 20px 22px; display: grid; gap: 4px; }
.sc-total .lbl { color: #dfe6f5; font-weight: 500; }
#sc-total { font: 700 clamp(2.2rem, 10vw, 3rem)/1.15 Rubik, sans-serif; color: var(--gold); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
#sc-when { color: #dfe6f5; font-size: .95rem; }
.sc-total button { justify-self: start; margin-top: 10px; font: 700 1rem Rubik, sans-serif; border: 0; border-radius: 999px; padding: 12px 20px; min-height: 44px; cursor: pointer; background: #fff; color: #0d2b6b; transition: transform .16s cubic-bezier(.23, 1, .32, 1); }
.sc-total button:active { transform: scale(.97); }
.sc-total :focus-visible { outline-color: var(--gold); }
#sc-share-ok { margin: 0; color: #dfe6f5; font-size: .95rem; }
.tbl td:nth-child(n+2), .tbl th:nth-child(n+2) { text-align: end; font-variant-numeric: tabular-nums; }
.tbl .pct { color: var(--ink-2); font-size: .9rem; }
.tbl tr.sum td { background: var(--surface-2); font-weight: 600; }
.sc-warn { margin: 0; background: #fff4e5; color: #6b3a00; border: 1px solid #f3c98b; border-radius: 16px; padding: 14px 16px; }
@media (prefers-color-scheme: dark) { .sc-warn { background: #2b1d08; color: #ffd9a3; border-color: #6b4a1a; } }
#sc-notes { margin: 0; padding: 0; padding-inline-start: 18px; display: grid; gap: 8px; color: var(--ink-2); }
#sc-notes b { color: var(--ink); }
.sc-app { margin: 4px 0 0; }`;
function calcPage(date) {
  const url = `${SITE}/${CALC.slug}`;
  const faq = [
    ['כמה משלמים על שעה בשבת או בחג?', `לפחות ${REST[0]}% מהשכר הרגיל לשעה. שעה נוספת בשבת: ${REST[1]}% לשתי הראשונות ו-${REST[2]}% מהשלישית. השבת נמדדת מכניסת השבת ועד צאתה בעיר שבה עובדים.`],
    ['מתי מתחילות שעות נוספות במשמרת?', `בשבוע עבודה של 5 ימים אחרי ${hWords(OTL.five)} ביום, ובמשמרת לילה אחרי ${hWords(OTL.night)}. השעתיים הנוספות הראשונות שוות ${OT[0]}%, ומהשלישית ${OT[1]}%. גם שעות מעל ${OTL.week} בשבוע הן שעות נוספות. המחשבון מחשב שבוע של 5 ימים.`],
    ['יש תוספת על משמרת לילה?', `החוק לא קובע תוספת לילה בשקלים. משמרת לילה (שעתיים לפחות בין 22:00 ל-06:00) קצרה יותר: אחרי ${hWords(OTL.night)} מתחילות שעות נוספות. תוספת לילה מגיעה רק אם היא בהסכם או בחוזה.`],
    ['ההפסקה משולמת?', 'במשמרת של 6 שעות ומעלה מגיעה הפסקה של 45 דקות. אם מותר לך לצאת בה ממקום העבודה, המעסיק לא חייב לשלם עליה. אם צריך להישאר זמין/ה, היא נחשבת שעות עבודה. במחשבון מסמנים אם ההפסקה לא משולמת.'],
    ['אילו חגים משולמים כמו שבת?', 'ראש השנה (שני הימים), יום כיפור, סוכות, שמיני עצרת, פסח (היום הראשון והשביעי), שבועות ויום העצמאות. המחשבון מכיר את התאריכים בלוח העברי ואת זמני הכניסה והיציאה בעיר.'],
  ];
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebApplication', name: CALC.title, url, applicationCategory: 'FinanceApplication', operatingSystem: 'Any', inLanguage: 'he-IL', isAccessibleForFree: true, offers: { '@type': 'Offer', price: 0, priceCurrency: 'ILS' }, description: CALC.desc },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'שעתי', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: CALC.title, item: url }] },
  ];
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(CALC.title)} · שעתי</title>
<meta name="description" content="${esc(CALC.desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#071a45">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="שעתי">
<meta property="og:title" content="${esc(CALC.title)}">
<meta property="og:description" content="${esc(CALC.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="שעתי: כמה באמת מגיע לך על כל שעה. האפליקציה בטלפון, עם השכר של החודש">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="img/favicon-48.png" sizes="48x48">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
${FONT_HEAD}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${CSS}${CHECK_CSS}${CALC_CSS}</style>
</head>
<body>
<a class="skip" href="#main">דילוג לתוכן</a>
<header><div class="bar"><a class="logo" href="./"><img src="img/apple-touch-icon.png" alt="">שעתי</a><a class="btn" href="${APP}?from=site">לפתוח את שעתי</a></div></header>
<main id="main">
  <nav class="crumbs" aria-label="ניווט"><a href="./">שעתי</a> › כמה שווה המשמרת?</nav>
  <h1>כמה שווה המשמרת?</h1>
  <p>ממלאים את פרטי המשמרת ורואים כמה היא שווה לפי חוק העבודה: שבת וחג לפי הזמנים בעיר, שעות נוספות, משמרת לילה ושכר מינימום לפי הגיל. החישוב רץ בטלפון שלך, באותו מנוע שמחשב משמרות באפליקציה שעתי. בלי הרשמה, ושום דבר לא נשלח.</p>
  <div class="ck" data-sc>
    <label for="sc-date"><span>תאריך</span><input id="sc-date" type="date" required aria-describedby="sc-err"></label>
    <div class="sc-row">
      <label for="sc-start"><span>התחלה</span><input id="sc-start" type="time" value="16:00" required aria-describedby="sc-err"></label>
      <label for="sc-end"><span>סיום</span><input id="sc-end" type="time" value="23:00" required aria-describedby="sc-err"></label>
    </div>
    <label for="sc-rate"><span>שכר לשעה (₪)</span><input id="sc-rate" type="text" inputmode="decimal" autocomplete="off" value="40" aria-describedby="sc-err"></label>
    <div class="q">גיל
      <div class="ages" role="group" aria-label="גיל">
        <button type="button" data-age="u16" aria-pressed="false">מתחת ל-16</button>
        <button type="button" data-age="a16" aria-pressed="false">16</button>
        <button type="button" data-age="a17" aria-pressed="false">17</button>
        <button type="button" data-age="adult" aria-pressed="true">18 ומעלה</button>
      </div>
    </div>
    <label for="sc-city"><span>עיר <small>(לזמני השבת והחג)</small></span><select id="sc-city">${CALC_PLACES.map(([n]) => `<option${n === CALC_CITY ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <label class="sw"><input id="sc-unpaid" type="checkbox"> ההפסקה לא משולמת</label>
  </div>
  <p id="sc-err" class="ck-err" role="alert" hidden></p>
  <div id="sc-out" hidden>
    <div class="sc-total">
      <span class="lbl">המשמרת שווה</span>
      <span id="sc-total" aria-live="polite"></span>
      <span id="sc-when"></span>
      <button type="button" id="sc-share">שיתוף התוצאה</button>
      <p id="sc-share-ok" role="status" hidden></p>
    </div>
    <p id="sc-min" class="sc-warn" hidden></p>
    <div class="tbl"><table aria-label="פירוט השכר של המשמרת"><thead><tr><th>סוג השעות</th><th>שעות</th><th>סכום</th></tr></thead><tbody id="sc-rows"></tbody></table></div>
    <ul id="sc-notes" hidden></ul>
    <p id="sc-tz" class="sc-warn" hidden>השעון בטלפון שלך לא על שעון ישראל, ולכן זמני השבת והלילה בחישוב זזים לפי השעון שלך.</p>
  </div>
  <div class="cta"><b>כל משמרת, מחושבת לבד</b><span>באפליקציה רושמים משמרת בלחיצה, ושעתי מחשבת כל אחת כמו כאן, מסכמת את החודש ומשווה לתלוש. חינם ובלי פרסומות, ומנוי Plus לבחירה.</span><a class="btn" href="${APP}?from=site">לחשב כל משמרת אוטומטית באפליקציה</a></div>
  <h2>שאלות נפוצות</h2>
  ${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${escWhole(a)}</p></details>`).join('\n  ')}
  <p class="src">המקור הרשמי: ${[['מנוחה שבועית וחגים', GOV.rest], ['שעות נוספות', GOV.hours], ['שכר מינימום', GOV.minwage], ['זכויות בני נוער בעבודה', GOV.youth]].map(([l, h]) => `<a href="${h}" rel="noopener">${esc(l)} ב-gov.il</a>`).join(' · ')}</p>
  <div class="note">שעתי אינה גוף ממשלתי ואינה מייצגת גוף ממשלתי. החישוב כללי ואינו ייעוץ משפטי: לפי חוק שעות עבודה ומנוחה, שבוע עבודה של 5 ימים ושכר המינימום מ-${dmy(MW.from)}, בלי נסיעות, תוספות והסכמים. בהסכם קיבוצי, צו הרחבה ענפי או חוזה אישי ייתכנו זכויות נוספות. עודכן ב-${dmy(date)}.</div>
  <h2>עוד שאלות</h2>
  <div class="more"><a href="check">${esc(CHECK.title)}</a>${PAGES.map((x) => `<a href="${x.slug}">${esc(x.title)}</a>`).join('')}</div>
</main>
<footer>שעתי · <a href="./">לאתר</a> · <a href="privacy">פרטיות</a> · <a href="accessibility">הצהרת נגישות</a> · <a href="mailto:lybtn48@gmail.com">יצירת קשר</a></footer>
<script src="calc.js"></script>
</body>
</html>
`;
}
// site/calc.js: the app's engine files as they are, then the page's own code, minified as the app's build does. It
// carries a fingerprint of those sources (SiteCalc.src), so tests/sitecalc.test.js fails when the engine changed and
// the website's copy did not follow (run node tools/site-pages.js again)
function calcJs() {
  const core = CALC_SOURCES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const src = calcFingerprint(core.join('\n'));
  const own = fs.readFileSync(path.join(__dirname, 'site-calc.js'), 'utf8').replace('const D = __DATA__;', () => 'const D = ' + JSON.stringify({ places: CALC_PLACES, src }) + ';');
  core.pop();
  if (own.includes('const D = __DATA__')) throw new Error('tools/site-calc.js: the data was not placed');
  const code = core.concat(own).join(';\n');
  return require('esbuild').transformSync(code, { minify: true, target: ['es2019', 'safari15'], charset: 'utf8', legalComments: 'none', sourcefile: 'calc.js' }).code;
}
const CHECK_DATA = {
  min: { u16: Y[0].hourly, a16: Y[1].hourly, a17: Y[2].hourly, adult: MW.hourly },
  label: { u16: 'מתחת לגיל 16', a16: 'בגיל 16', a17: 'בגיל 17', adult: 'מגיל 18' },
  rest: REST[0], from: MW.from,
};
// a page's date (its note, "updated on", and the sitemap's lastmod) moves only when the page changed: every run gave
// every page today's date, and search engines stop trusting a lastmod that is always today (launch check)
const headOf = (rel) => { try { return require('child_process').execSync('git show HEAD:' + rel, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (e) { return ''; } };
const NOTE_DATE = /עודכן ב-(\d{1,2})\.(\d{1,2})\.(\d{4})\./;
const dated = {};
function writeDated(file, make) {
  const rel = 'site/' + file, now = make(today), head = headOf(rel), m = head.match(NOTE_DATE);
  const same = m && head.replace(NOTE_DATE, '') === now.replace(NOTE_DATE, '');
  const date = same ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : today;
  fs.writeFileSync(path.join(ROOT, rel), same ? make(date) : now);
  dated[file] = date;
}
// the home page is written by hand: its date is its last commit's, or today when it has changes not committed yet
const homeDate = (() => { try { const cp = require('child_process'); if (cp.execSync('git status --porcelain -- site/index.html', { cwd: ROOT }).toString().trim()) return today; return cp.execSync('git log -1 --format=%cs -- site/index.html', { cwd: ROOT }).toString().trim() || today; } catch (e) { return today; } })();
writeDated('check.html', checkPage);
writeDated('shift-calculator.html', calcPage);
fs.writeFileSync(path.join(ROOT, 'site', 'calc.js'), calcJs());
fs.writeFileSync(path.join(ROOT, 'site', 'check.js'), fs.readFileSync(path.join(__dirname, 'site-check.js'), 'utf8').replace('const D = __DATA__;', 'const D = ' + JSON.stringify(CHECK_DATA) + ';'));

for (const p of PAGES) writeDated(p.slug + '.html', (d) => page(p, d));
fs.writeFileSync(path.join(ROOT, 'site', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${homeDate}</lastmod></url>
  <url><loc>${SITE}/shift-calculator</loc><lastmod>${dated['shift-calculator.html']}</lastmod></url>
  <url><loc>${SITE}/check</loc><lastmod>${dated['check.html']}</lastmod></url>
${PAGES.map((p) => `  <url><loc>${SITE}/${p.slug}</loc><lastmod>${dated[p.slug + '.html']}</lastmod></url>`).join('\n')}
</urlset>
`);
// the legal pages, the website's own copies (a link to the app's address opens the app on a phone that has it)
const legal = require('./legal-pages').build(path.join(ROOT, 'src'), path.join(ROOT, 'site'), true);
fs.writeFileSync(path.join(ROOT, 'site', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log('wrote', PAGES.map((p) => p.slug + '.html').join(', '), '+', legal.join(', '), '+ sitemap.xml, robots.txt');
console.log('minimum wage', MW.from, MW.hourly, '· youth', Y.map((y) => y.hourly).join(' / '), '· recuperation', recupYear, RECUP, '· rest', REST.join('/'));
