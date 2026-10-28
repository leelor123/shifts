/* The website's question pages (one page per common question, for people who search for it), made from the app's
 * own legal tables so the numbers on the site and in the app are the same. Writes site/<page>.html and
 * site/sitemap.xml.  node tools/site-pages.js
 * Run again after a legal table changes (the yearly checklist in CLAUDE.md), then deploy the website. */
process.env.TZ = 'Asia/Jerusalem';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
for (const f of ['util.js', 'hebcal.js', 'defaults.js', 'engine.js']) require(path.join(ROOT, 'src', 'core', f));
const { U, Engine } = globalThis;

const SITE = 'https://shaati.web.app';
const APP = 'https://leelor123.github.io/shifts/';
// the official sources (as in the app's rights screen, views-rights.js GOV)
const GOV = {
  minwage: 'https://www.gov.il/he/Departments/Guides/minimum-wage',
  youth: 'https://www.gov.il/he/Departments/Guides/rights-of-working-youth',
  recup: 'https://www.gov.il/he/Departments/Guides/convalescence-pay',
  rest: 'https://www.gov.il/he/Departments/Guides/weekends-and-holidays',
  hours: 'https://www.gov.il/he/Departments/Guides/overtime-and-extra-hours',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
const Y16 = Engine.youthRules(16, 5), Y15 = Engine.youthRules(15, 5);
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
    desc: `בשבוע עבודה של 5 ימים שעות נוספות מתחילות אחרי ${OTL.five} שעות ביום (${hm(OTL.five)}), בשבוע של 6 ימים אחרי ${OTL.six}, במשמרת לילה אחרי ${OTL.night}, ובכל שבוע מעל ${OTL.week} שעות רגילות. ${OTL.t1h} השעות הנוספות הראשונות ב-${OT[0]}%, ומהשלישית ${OT[1]}%.`,
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
];

/* ---------------- the page ---------------- */
const CSS = `
:root { --bg: #f7f5ff; --surface: #fff; --surface-2: #f0ecff; --ink: #1b1530; --ink-2: #5d5677; --line: #e5e0f5; --brand: #5a33e6; --brand-2: #7c4dff; --gold: #ffb020; --cta-1: #5a33e6; --cta-2: #7c4dff; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0e0b1a; --surface: #17132a; --surface-2: #211b3a; --ink: #f1edff; --ink-2: #b6aed3; --line: #2c2548; --brand: #9b7dff; --brand-2: #b39cff; color-scheme: dark; } }
* { box-sizing: border-box; }
[hidden] { display: none !important; } /* (a rule that sets display would show what is hidden) */
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 1.05rem/1.7 Rubik, system-ui, sans-serif; overflow-wrap: break-word; }
a { color: var(--brand); }
header { position: sticky; top: 0; z-index: 2; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
.bar { max-width: 760px; margin: 0 auto; display: flex; align-items: center; gap: 12px; padding: 10px max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left)); }
.bar a.logo { display: flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font: 700 1.25rem Fredoka, Rubik, sans-serif; margin-inline-end: auto; }
.bar img { width: 36px; height: 36px; border-radius: 10px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 999px; background: linear-gradient(135deg, var(--cta-1), var(--cta-2)); color: #fff; font-weight: 700; text-decoration: none; padding: 10px 20px; white-space: nowrap; }
main { max-width: 760px; margin: 0 auto; padding: 28px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); }
nav.crumbs { font-size: .9rem; color: var(--ink-2); margin-bottom: 10px; }
h1 { font: 700 clamp(1.7rem, 5vw, 2.4rem)/1.25 Fredoka, Rubik, sans-serif; margin: 0 0 16px; text-wrap: balance; }
h2 { font: 700 1.35rem/1.35 Fredoka, Rubik, sans-serif; margin: 34px 0 10px; text-wrap: balance; }
.answer { background: var(--surface); border-radius: 20px; padding: 18px 20px; box-shadow: 0 6px 24px rgba(40, 20, 120, .08); border-inline-start: 5px solid var(--gold); font-size: 1.12rem; }
.tbl { overflow-x: auto; background: var(--surface); border-radius: 18px; box-shadow: 0 6px 24px rgba(40, 20, 120, .06); }
table { width: 100%; border-collapse: collapse; }
th, td { padding: 11px 10px; text-align: start; border-bottom: 1px solid var(--line); }
td { white-space: nowrap; }
td:first-child { white-space: normal; } /* the label wraps between words; the numbers stay on one line */
th { line-height: 1.3; }
@media (max-width: 420px) { th, td { padding: 10px 8px; font-size: .95rem; } }
th { font-size: .9rem; color: var(--ink-2); font-weight: 600; background: var(--surface-2); }
tr:last-child td { border-bottom: 0; }
.cta { margin: 36px 0 8px; background: linear-gradient(135deg, var(--cta-1), var(--cta-2)); color: #fff; border-radius: 24px; padding: 22px; display: grid; gap: 12px; }
.cta b { font: 700 1.25rem Fredoka, Rubik, sans-serif; }
.cta .btn { background: #fff; color: #3a1fb0; justify-self: start; }
details { background: var(--surface); border-radius: 16px; padding: 12px 16px; margin: 10px 0; }
summary { font-weight: 600; cursor: pointer; }
details p { margin: 8px 0 0; color: var(--ink-2); }
.src, .note { font-size: .92rem; color: var(--ink-2); }
.note { margin-top: 26px; padding: 14px 16px; border: 1px dashed var(--line); border-radius: 14px; }
.more { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.more a { background: var(--surface); border-radius: 999px; padding: 8px 14px; text-decoration: none; box-shadow: 0 2px 10px rgba(40, 20, 120, .06); }
footer { text-align: center; color: var(--ink-2); font-size: .9rem; padding: 0 16px 32px; }`;

function page(p) {
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
<meta name="theme-color" content="#5a33e6">
<meta property="og:type" content="article">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="שעתי">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og.png">
<link rel="icon" href="img/favicon-48.png" sizes="48x48">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@400..800&family=Fredoka:wght@500..700&display=swap">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${CSS}</style>
</head>
<body>
<header><div class="bar"><a class="logo" href="./"><img src="img/apple-touch-icon.png" alt="">שעתי</a><a class="btn" href="${APP}">לפתוח את שעתי</a></div></header>
<main>
  <nav class="crumbs" aria-label="ניווט"><a href="./">שעתי</a> › ${esc(p.title)}</nav>
  <h1>${esc(p.title)}</h1>
  <div class="answer">${p.answer}</div>
  ${p.body}
  <div class="cta"><b>שעתי מחשבת את זה בשבילך</b><span>רושמים משמרות, ושעתי מחשבת את השכר לפי החוק: שבתות וחגים לפי העיר, שעות נוספות, שכר מינימום לפי הגיל והבראה. חינם ובלי פרסומות.</span><a class="btn" href="${APP}">לפתוח את שעתי</a></div>
  <h2>שאלות נפוצות</h2>
  ${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n  ')}
  <p class="src">המקור הרשמי: ${p.sources.map(([l, h]) => `<a href="${h}" rel="noopener">${esc(l)} ב-gov.il</a>`).join(' · ')}</p>
  <div class="note">שעתי אינה גוף ממשלתי ואינה מייצגת גוף ממשלתי. המידע כללי ואינו ייעוץ משפטי; בהסכם קיבוצי, צו הרחבה ענפי או חוזה אישי ייתכנו זכויות נוספות. עודכן ב-${dmy(today)}.</div>
  <h2>עוד שאלות</h2>
  <div class="more"><a href="check">${esc(CHECK.title)}</a>${others.map((x) => `<a href="${x.slug}">${esc(x.title)}</a>`).join('')}</div>
</main>
<footer>שעתי · <a href="./">לאתר</a> · <a href="https://leelor123.github.io/shifts/privacy.html">פרטיות</a></footer>
</body>
</html>
`;
}

/* ---------------- the 10-second check: "are they cheating you?" ---------------- */
const CHECK = { slug: 'check', title: 'מרמים אותך? בדיקה של 10 שניות', desc: `מכניסים גיל ושכר לשעה, ורואים אם משלמים לך לפי החוק (${mwYear}): שכר מינימום לנוער ולמבוגרים, ושבת ב-${REST[0]}%. בלי הרשמה, שום דבר לא נשלח.` };
const CHECK_CSS = `
.ck { background: var(--surface); border-radius: 22px; padding: 18px; box-shadow: 0 6px 24px rgba(40, 20, 120, .08); display: grid; gap: 16px; }
.ck label, .ck .q { font-weight: 600; display: grid; gap: 8px; }
.ages { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.ages button { font: 600 1rem Rubik, sans-serif; border: 1.5px solid var(--line); background: var(--bg); color: var(--ink); border-radius: 14px; padding: 12px 4px; cursor: pointer; }
.ages button[aria-pressed="true"] { border-color: var(--brand); background: var(--surface-2); color: var(--brand); }
.ck input[type="number"] { font: 600 1.15rem Rubik, sans-serif; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--bg); color: var(--ink); width: 100%; box-sizing: border-box; }
.ck input[type="number"]:focus { outline: 2px solid var(--brand); outline-offset: 1px; }
.ck .sw { display: flex; align-items: center; gap: 10px; font-weight: 500; }
.ck .sw input { width: 22px; height: 22px; accent-color: var(--brand); }
.ck small { color: var(--ink-2); font-weight: 400; }
#ck-out { border-radius: 22px; padding: 20px; display: grid; gap: 8px; text-align: center; color: #fff; }
#ck-out.bad { background: linear-gradient(135deg, #4a1fd6, #b02adf); }
#ck-out.good { background: linear-gradient(135deg, #0b7a4b, #14b8a6); }
#ck-title { font: 700 1.5rem Fredoka, Rubik, sans-serif; }
#ck-big { font: 800 clamp(1.6rem, 7vw, 2.3rem)/1.2 Fredoka, Rubik, sans-serif; }
#ck-why { opacity: .92; }
.ck-acts { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 6px; }
.ck-acts button { font: 700 1rem Rubik, sans-serif; border: 0; border-radius: 999px; padding: 12px 18px; cursor: pointer; background: #fff; color: #3a1fb0; }
.ck-acts button.wa { background: #25d366; color: #063b1c; }
.priv { font-size: .92rem; color: var(--ink-2); text-align: center; }`;
function checkPage() {
  const url = `${SITE}/check`;
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(CHECK.title)} · שעתי</title>
<meta name="description" content="${esc(CHECK.desc)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#5a33e6">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="שעתי">
<meta property="og:title" content="${esc(CHECK.title)}">
<meta property="og:description" content="${esc(CHECK.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og.png">
<link rel="icon" href="img/favicon-48.png" sizes="48x48">
<link rel="apple-touch-icon" href="img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@400..800&family=Fredoka:wght@500..700&display=swap">
<style>${CSS}${CHECK_CSS}</style>
</head>
<body>
<header><div class="bar"><a class="logo" href="./"><img src="img/apple-touch-icon.png" alt="">שעתי</a><a class="btn" href="${APP}">לפתוח את שעתי</a></div></header>
<main>
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
    <label for="ck-wage"><span>כמה משלמים לך לשעה (₪)?</span><input id="ck-wage" type="number" inputmode="decimal" min="0" step="0.01" placeholder="למשל 32"></label>
    <label for="ck-hours"><span>כמה שעות בחודש, בערך? <small>(לא חובה)</small></span><input id="ck-hours" type="number" inputmode="numeric" min="0" step="1" placeholder="למשל 60"></label>
    <label class="sw"><input id="ck-shab" type="checkbox"> בשבת משלמים לי אותו תעריף כמו ביום חול</label>
    <label id="ck-shab-h" for="ck-shab-hours" hidden><span>כמה מהשעות האלה בשבת?</span><input id="ck-shab-hours" type="number" inputmode="numeric" min="0" step="1" placeholder="למשל 8"></label>
  </div>
  <div id="ck-out" hidden aria-live="polite">
    <div id="ck-title"></div>
    <div id="ck-big"></div>
    <div id="ck-why"></div>
    <div class="ck-acts"><button type="button" id="ck-share">📸 תמונה לסטורי</button><button type="button" class="wa" id="ck-wa">שליחה בוואטסאפ</button></div>
  </div>
  <div class="cta"><b>זה רק שכר המינימום</b><span>שעתי בודקת את כל השאר: שבתות וחגים לפי העיר, שעות נוספות, נסיעות, הבראה, ואת התלוש עד השקל. חינם ובלי פרסומות.</span><a class="btn" href="${APP}">לבדוק את התלוש בשעתי</a></div>
  <p class="src">המקור הרשמי: ${[['שכר מינימום', GOV.minwage], ['זכויות בני נוער בעבודה', GOV.youth], ['מנוחה שבועית וחגים', GOV.rest]].map(([l, h]) => `<a href="${h}" rel="noopener">${esc(l)} ב-gov.il</a>`).join(' · ')}</p>
  <div class="note">שעתי אינה גוף ממשלתי ואינה מייצגת גוף ממשלתי. הבדיקה כללית ואינה ייעוץ משפטי: לפי שכר המינימום מ-${dmy(MW.from)} ולפי הגיל; לחניכים, לבעלי מוגבלות ובהסכמים מיוחדים יש כללים אחרים. עודכן ב-${dmy(today)}.</div>
  <h2>עוד שאלות</h2>
  <div class="more">${PAGES.map((x) => `<a href="${x.slug}">${esc(x.title)}</a>`).join('')}</div>
</main>
<footer>שעתי · <a href="./">לאתר</a> · <a href="https://leelor123.github.io/shifts/privacy.html">פרטיות</a></footer>
<script src="check.js"></script>
</body>
</html>
`;
}
const CHECK_DATA = {
  min: { u16: Y[0].hourly, a16: Y[1].hourly, a17: Y[2].hourly, adult: MW.hourly },
  label: { u16: 'מתחת לגיל 16', a16: 'בגיל 16', a17: 'בגיל 17', adult: 'מגיל 18' },
  rest: REST[0], from: MW.from,
};
fs.writeFileSync(path.join(ROOT, 'site', 'check.html'), checkPage());
fs.writeFileSync(path.join(ROOT, 'site', 'check.js'), fs.readFileSync(path.join(__dirname, 'site-check.js'), 'utf8').replace('const D = __DATA__;', 'const D = ' + JSON.stringify(CHECK_DATA) + ';'));

for (const p of PAGES) fs.writeFileSync(path.join(ROOT, 'site', p.slug + '.html'), page(p));
fs.writeFileSync(path.join(ROOT, 'site', 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc><lastmod>${today}</lastmod></url>
  <url><loc>${SITE}/check</loc><lastmod>${today}</lastmod></url>
${PAGES.map((p) => `  <url><loc>${SITE}/${p.slug}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`);
fs.writeFileSync(path.join(ROOT, 'site', 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log('wrote', PAGES.map((p) => p.slug + '.html').join(', '), '+ sitemap.xml, robots.txt');
console.log('minimum wage', MW.from, MW.hourly, '· youth', Y.map((y) => y.hourly).join(' / '), '· recuperation', recupYear, RECUP, '· rest', REST.join('/'));
