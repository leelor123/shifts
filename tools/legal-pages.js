/* Generates the public legal pages (required by Google Play: privacy policy URL and
 * account-deletion URL) from the same documents shown inside the app.
 *   docs/privacy.html (+ privacy.en.html, the full English translation), docs/terms.html, docs/accessibility.html, docs/delete-account.html, docs/licenses.html
 * The website (shaati.web.app) keeps its own copies in site/ (privacy.html ... served as /privacy): on a phone with the
 * Android app installed, a link to leelor123.github.io/shifts/... opens in the app (the TWA owns that address), so the
 * site's footer links never leave the site (the owner, 3 Nov 2026).
 *   node tools/legal-pages.js          -> docs/ (tools/build.js does this on every build)
 *   node tools/legal-pages.js --site   -> site/ only (tools/site-pages.js does this too) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_URL = 'https://leelor123.github.io/shifts/';
// the project's issues page is public: bug reports only, never privacy or deletion requests (legal audit A8)
const ISSUES = 'https://github.com/leelor123/shifts/issues';
const EMAIL = 'lybtn48@gmail.com';
const MAIL = `<a href="mailto:${EMAIL}" dir="ltr">${EMAIL}</a>`;
// the app's own font files (docs/fonts and site/fonts are copies of src/fonts): Google's stylesheet sent every visitor's
// IP address to Google (legal audit B13). Only Rubik is used here.
const FONT_CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'fonts', 'fonts.css'), 'utf8')
  .split('\n').filter((l) => l.includes("'Rubik'")).join('\n');

// lang: the documents in another language, by the same translations the app's own pages use (i18n/<lang>.json)
function loadDocs(src, lang) {
  const ctx = { document: { addEventListener() {} } };
  ctx.window = ctx;
  ctx.App = { sheetsApi: {}, actions: {} };
  ctx.Store = { S: { settings: {} } };
  ctx.UI = { icon: () => '', esc: (s) => String(s) };
  vm.createContext(ctx);
  let code = fs.readFileSync(path.join(src, 'app/views-legal.js'), 'utf8');
  if (lang && lang !== 'he') { const I18N = require('./i18n'); code = I18N.applyCode(code, 'app/views-legal.js', I18N.dictOf(lang)); }
  vm.runInContext(code, ctx);
  return ctx.App.LEGAL_DOCS;
}

// a word joined by a hyphen or a dash (me-west1, Reingold–Dershowitz, 2020–2025) never breaks at the end of a line (the
// browser may break after a hyphen). Only the text between tags is touched, never an attribute.
const keepWhole = (html) => html.split(/(<[^>]*>)/).map((part, i) => (i % 2 ? part
  : part.replace(/[^\s<>]*[\p{L}\p{N}][-–‑][\p{L}\p{N}][^\s<>]*/gu, (w) => `<span class="nw">${w}</span>`))).join('');

// a link to another legal page: privacy.html on GitHub Pages, /privacy on the website (cleanUrls)
const linker = (site) => (name) => (site ? name : name + '.html');

const EN = (L) => ({
  privacy: `<h2 lang="en" dir="ltr">Summary in English</h2>
<div lang="en" dir="ltr" class="en">
<p>The full policy in English: <a href="${L('privacy.en')}">Privacy policy (English translation)</a>.</p>
<p><b>Shaati</b> is a shift and pay tracker for hourly workers in Israel. Operator and data controller: <bdi lang="he">לי בטאן</bdi> (Lee Batan), ${MAIL}. The Hebrew policy above is the binding text.</p>
<ul>
<li><b>Data you enter:</b> shifts, roles and hourly rates, leave, additions and deductions, settings, payslip fields you verified, the town you chose (for Shabbat and holiday times and the sky picture), and optionally a name, date of birth and gender (for age-based rules: minimum wage, youth employment, tax and pension). It is stored on your phone and, once you sign in, in Google Cloud Firestore (region me-west1, Tel Aviv), linked to your account. Security rules block other users. The operator, as the owner of the database, has technical access and uses it only to handle your request or a fault, or when the law requires it. Pay data counts as especially sensitive information under the Privacy Protection Law.</li>
<li><b>Shift log:</b> a record of every start, end, addition, edit and deletion of a shift, with the time on the phone, so that you can show what was recorded and when. It is kept on the phone and in your account like the shifts, and is deleted with the account.</li>
<li><b>Account:</b> a user ID and email address; with Google sign-in also your name and photo. With email and password, Firebase Authentication keeps the password and the app never sees it. As a guest, nothing leaves the phone.</li>
<li><b>Stays on the phone:</b> your Anthropic API key, the PIN lock, payslip files and their full recognised text (except text you approve for AI analysis), and your location when you use it to find the nearest town.</li>
<li><b>Usage statistics (off until you agree):</b> once a day, one record per device under a random ID not linked to your account: app version, install type, first and last day of use, number of active days, shift and payslip counts, an age group (under or over 18), whether it is an iPhone (yes or no) and which features are on. No name, email, user ID, shift dates or amounts. Turning it off deletes this device's record; records not updated for 13 months are deleted. Error reports are part of these statistics: when something in the app fails, it sends the technical error message, the screen, the app version, the language and the system and browser type, with no identifying detail and nothing you typed. Error reports are deleted after 30 days.</li>
<li><b>Champions table (only if you join):</b> your nickname, emoji, background and Plus badge, and your best game scores. Every signed-in user can see this row. Leaving the table deletes it.</li>
<li><b>Friends' competition (only if you join):</b> your nickname and emoji, the friends you accepted and, only if you choose to show them, your gross totals and average pay per hour. Only your friends can see the card.</li>
<li><b>Invitations:</b> your invitation code and, if you joined through a link, a record of who invited whom (account IDs only). The code is deleted with the account; the record is kept so an account is invited only once.</li>
<li><b>Workplace code:</b> when you share a workplace's rules, the cloud keeps only the workplace name and the pay rules you chose (and hourly pay only if you chose it), with no shifts, amounts or identifying details. Anyone who has the code can read them, and you can delete the code at any time.</li>
<li><b>Support requests (only if you send one):</b> what you wrote and our replies, the first name you entered and, if you choose, the app version and device type. Without an account, also the email you give for the answer; such a request is deleted within 12 months after it is closed, or at once if you ask.</li>
<li><b>Service providers:</b> Google (signing in, storage and hosting this website; signing in runs on servers in the USA); GitHub (hosting the app's code, USA); Anthropic (USA, only when you use an AI feature with your own key: the payslip text you approved with ID, bank, address, phone and email hidden, your question, or a work schedule photo you send, including the names in it); MET Norway (Norway, the weather behind the opening screen: your chosen town's coordinates rounded to about 1 km, at most once an hour, never the phone's location); Google Play (purchases in the Android app); Lemon Squeezy (USA, purchases on the web or iPhone: payment, receipt and receipt email go to them directly, and the app keeps only the licence key); code and font servers (jsDelivr, cdnjs, cdn.sheetjs.com, Google Fonts, tessdata.projectnaptha.com) when a feature needs them.</li>
<li><b>No ads, no tracking cookies, no third-party analytics.</b> We do not sell your data or use it for advertising.</li>
<li><b>Your rights:</b> you do not have to give us any data. You may view, correct and delete your data, in the app or by email; we answer within 30 days. See <a href="${L('delete-account')}">how to delete your account</a>.</li>
<li><b>Children:</b> the minimum age is 13. Users under 18 use the app with a parent's or guardian's consent, and a parent may write to us to view or delete a child's data or cancel the subscription.</li>
<li><b>This website (shaati.web.app):</b> no cookies, ads or tracking. The hosting service (Firebase Hosting) logs each visit's IP address and browser details.</li>
<li><b>Contact:</b> ${MAIL}. The project's GitHub issues page is public, so please do not send privacy requests there.</li>
</ul></div>`,
  terms: `<h2 lang="en" dir="ltr">Summary in English</h2>
<div lang="en" dir="ltr" class="en"><p>Shifts, pay calculation, rights, the payslip check, reports on screen and the games are free. Shaati Plus is an optional paid subscription. Calculations are estimates and are not legal, accounting, tax or financial advice. AI answers are generated automatically and may be wrong. Israeli law applies; the Hebrew terms above are the binding text. Contact: ${MAIL}</p></div>`,
});

const DELETE = (L) => `<p class="meta">מחיקת חשבון ונתונים · Account &amp; data deletion</p>
<h2>איך מוחקים את החשבון ואת כל הנתונים</h2>
<ol>
<li>פתחו את האפליקציה בטלפון, או בדפדפן בכתובת <a href="${APP_URL}">${APP_URL}</a>, והתחברו עם אותו חשבון.</li>
<li>היכנסו ל<b>הגדרות › אני והחשבון › חשבון וסנכרון</b>.</li>
<li>לחצו <b>"מחק את כל הנתונים מהחשבון"</b> ואשרו.</li>
</ol>
<p>המחיקה מיידית וסופית: כל הנתונים שנשמרו בחשבון (משמרות, תפקידים ותעריפים, הגדרות, תלושים, פערים, ימי חופשה ומחלה) נמחקים מהענן, החשבון עצמו נמחק ממערכת ההתחברות, והנתונים נמחקים גם מהמכשיר. גם השורה בטבלת האלופים, הכרטיס בתחרות עם החברים, הזמנות לתחרות ששלחת או אישרת, הפניות לתמיכה וקוד ההזמנה שלך נמחקים. נשארים רק מזהי חשבון, בלי שם, אימייל או נתונים: הרשומה של מי הזמין את מי, כדי שכל חשבון יוזמן פעם אחת, והמזהה שלך ברשימת החברים של מי שהיו חברים שלך בתחרות, עד שהם מסירים אותו. אם השתמשת בטלפון אחר, רשומת סטטיסטיקת השימוש האנונימית שלו (בלי מזהה החשבון) נמחקת עד 13 חודשים אחרי השימוש האחרון בו. לפני המחיקה אפשר לייצא גיבוי (הגדרות › גיבוי, ייבוא ונתונים).</p>
<h2 id="data">מחיקת חלק מהנתונים, בלי למחוק את החשבון</h2>
<ul>
<li><b>משמרת או כל רשומה אחרת:</b> פותחים אותה ולוחצים על סמל הפח. המחיקה מגיעה גם לענן.</li>
<li><b>טבלת האלופים:</b> בטבלת האלופים לוחצים על הכינוי שלכם › <b>יציאה מהטבלה</b>. השורה והתוצאות נמחקות מהענן.</li>
<li><b>סטטיסטיקת שימוש:</b> <b>הגדרות › אני והחשבון › חשבון וסנכרון</b> › מכבים את <b>שיתוף סטטיסטיקת שימוש</b>. הרשומה נמחקת מהענן.</li>
<li><b>פניות לתמיכה:</b> אפשר לבקש בפנייה שנמחק אותן.</li>
<li><b>הנתונים בטלפון:</b> <b>התנתק</b> (באותו מקום בהגדרות) מוחק את הנתונים מהמכשיר ומשאיר אותם בחשבון. תמונת הרקע של כרטיס השכר ודוחות שעות שמייבאים נשמרים בטלפון בלבד.</li>
</ul>
<p>אין לכם גישה לאפליקציה? כתבו לנו באימייל ${MAIL} מהכתובת של החשבון, ונחזור אליכם כדי לוודא שהחשבון שלכם.</p>
<h2 lang="en" dir="ltr">How to delete your account and data</h2>
<div lang="en" dir="ltr" class="en"><ol>
<li>Open the app (or <a href="${APP_URL}">${APP_URL}</a> in any browser) and sign in with the same account.</li>
<li>Go to <b>Settings › Me &amp; my account › Account &amp; sync</b> (הגדרות › אני והחשבון › חשבון וסנכרון).</li>
<li>Tap <b>Delete all data</b> (מחק את כל הנתונים מהחשבון) and confirm.</li></ol>
<p>Deletion is immediate and permanent: all data stored for the account in the cloud is deleted, the sign-in account is deleted, and local data on the device is cleared. Your champions-table row, your card in the friends' competition, competition invitations you sent or accepted, support requests and your invite code are deleted too. Only account IDs remain, with no name, email or data: the record of who invited whom (so an account is invited only once), and your ID in the friend lists of people who were your friends in the competition, until they remove it. If you used another phone, its anonymous usage-statistics record (not linked to the account) is deleted within 13 months of its last use. If you cannot access the app, email ${MAIL} from the account's address and we will contact you to verify it is yours.</p>
<h2 id="data-en">Deleting some data without deleting the account</h2>
<ul>
<li><b>A shift or any other record:</b> open it and tap the trash icon. The deletion reaches the cloud too.</li>
<li><b>Champions table:</b> tap your nickname › <b>Leave the table</b> (יציאה מהטבלה). Your row and scores are deleted from the cloud.</li>
<li><b>Usage statistics:</b> Settings › Me &amp; my account › Account &amp; sync › turn off <b>usage statistics</b> (שיתוף סטטיסטיקת שימוש). The record is deleted.</li>
<li><b>Support requests:</b> ask in a request and we delete them.</li>
<li><b>Data on the phone:</b> <b>Sign out</b> (התנתק, same place) clears the device and keeps the data in the account. The pay-card photo and imported timesheets stay on the phone only.</li>
</ul></div>`;

// the documents' section titles are h4 inside the app's sheet; on a page of their own they follow the h1, so h2
// (launch check: h1 straight to h4 broke the heading order, Lighthouse 97 on these pages)
// desc: the page's description for search engines (Lighthouse SEO 92 without it on /privacy, 3 Nov 2026)
// the page's own words (the documents come in already in their language): Hebrew, or English for privacy.en.html
const CHROME = {
  he: { dir: 'rtl', skip: 'דילוג לתוכן', nav: 'מסמכים ויצירת קשר', links: ['מדיניות פרטיות', 'תנאי שימוש', 'הצהרת נגישות', 'מחיקת חשבון', 'רישיונות', 'יצירת קשר', 'דיווח על תקלה'] },
  en: { dir: 'ltr', skip: 'Skip to content', nav: 'Documents and contact', links: ['Privacy policy (Hebrew)', 'Terms of use', 'Accessibility statement', 'Delete your account', 'Licences', 'Contact', 'Report a bug'] },
};
function page(title, body, site, desc, lang = 'he') {
  const L = linker(site);
  const img = site ? 'img/' : '';
  const C = CHROME[lang] || CHROME.he;
  const [lPrivacy, lTerms, lA11y, lDelete, lLicenses, lContact, lBug] = C.links;
  // the header, the main content and the footer are siblings, so each is a landmark (accessibility audit C)
  return `<!doctype html>
<html lang="${lang}" dir="${C.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ${site && lang === 'he' ? 'שעתי' : 'Shaati'}</title><meta name="description" content="${desc}"><link rel="icon" href="${img}favicon-48.png" type="image/png">
<link rel="preload" href="fonts/rubik-hebrew.woff2" as="font" type="font/woff2" crossorigin>
<style>${FONT_CSS}
:root{--ink:#1b2220;--muted:#5b625e;--line:#e3dfd4;--bg:#f6f4ee;--card:#fdfcf8;--primary:#1d4a4f;--gold:#e9c987;color-scheme:light}
@media(prefers-color-scheme:dark){:root{--ink:#e8ede9;--muted:#a5aea9;--line:#26302e;--bg:#0f1413;--card:#151c1b;--primary:#7cc3c9;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Rubik,Assistant,system-ui,Arial,sans-serif;line-height:1.7;overflow-wrap:break-word}
.wrap{max-width:760px;margin:0 auto;padding-inline:16px}
header.wrap{display:flex;align-items:center;gap:12px;padding-top:24px}
header img{width:44px;height:44px;border-radius:12px}
header a{color:var(--ink);text-decoration:none;font-weight:700;display:inline-block;padding-block:10px}
main.wrap{padding-bottom:8px}
h1{font-size:1.7rem;margin:8px 0 4px} h2{font-size:1.15rem;margin:22px 0 6px} h4{font-size:1.02rem;margin:18px 0 4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.meta,.legal-meta{color:var(--muted);font-size:.85rem} a{color:var(--primary)} ul,ol{padding-inline-start:22px}
.en{font-family:system-ui,Arial,sans-serif} .nw{white-space:nowrap}
footer.wrap{margin-top:20px;padding-bottom:40px;color:var(--muted);font-size:.85rem}
footer nav{display:flex;flex-wrap:wrap;gap:0 16px} footer a{display:inline-block;padding-block:10px}
.skip{position:absolute;inset-inline-start:12px;top:-60px;z-index:5;background:var(--gold);color:#141821;padding:10px 16px;border-radius:12px;font-weight:600;text-decoration:none}
.skip:focus{top:12px}
:focus-visible{outline:2px solid var(--primary);outline-offset:2px}${lang === 'he' ? '' : '\nbody{font-family:system-ui,Rubik,Arial,sans-serif}'}
</style></head><body>
<a class="skip" href="#main">${C.skip}</a>
<header class="wrap"><img src="${img}icon-192.png" alt=""><a href="${site ? './' : APP_URL}">${site && lang === 'he' ? 'שעתי' : 'Shaati'}</a></header>
<main id="main" class="wrap">
<h1>${title}</h1><div class="card">${keepWhole(body.replace(/<(\/?)h4>/g, '<$1h2>'))}</div>
</main>
<footer class="wrap"><nav aria-label="${C.nav}"><a href="${L('privacy')}">${lPrivacy}</a><a href="${L('terms')}">${lTerms}</a><a href="${L('accessibility')}">${lA11y}</a><a href="${L('delete-account')}">${lDelete}</a><a href="${L('licenses')}">${lLicenses}</a><a href="mailto:${EMAIL}">${lContact}</a><a href="${ISSUES}">${lBug}</a></nav></footer>
</body></html>
`;
}

/** Writes the pages into `out`. site: true = the website's copies (its image folder, links without .html). */
function build(src, out, site = false) {
  const docs = loadDocs(src);
  // the full policy in English (Google Play reviewers, and the app's English users): the app's own English text
  const enDocs = loadDocs(src, 'en');
  const L = linker(site);
  const en = EN(L);
  const files = {
    'privacy.html': page(docs.privacy.title, docs.privacy.html + en.privacy, site, 'מדיניות הפרטיות של שעתי: איזה מידע נשמר, מי ניגש אליו, לכמה זמן, ואיך מעיינים בו, מתקנים אותו או מוחקים אותו.'),
    'privacy.en.html': page(enDocs.privacy.title, enDocs.privacy.html.replace(/(לי בטאן)/, '<bdi lang="he">$1</bdi>') + `<p class="legal-meta">The Hebrew original: <a href="${L('privacy')}">${docs.privacy.title}</a>.</p>`, site, 'Shaati privacy policy in English: what is kept, who can access it, for how long, and how to view, correct or delete it.', 'en'),
    'terms.html': page(docs.terms.title, docs.terms.html + en.terms, site, 'תנאי השימוש של שעתי: השימוש באפליקציה, המנוי Shaati Plus, ביטול והחזר תוך 14 יום, ואחריות.'),
    'accessibility.html': page(docs.accessibility.title, docs.accessibility.html, site, 'הצהרת הנגישות של שעתי: מה נבדק, מגבלות ידועות, ואיך מדווחים על בעיית נגישות או מבקשים התאמה.'),
    'delete-account.html': page('מחיקת חשבון ונתונים', DELETE(L), site, 'איך מוחקים את החשבון ואת כל הנתונים בשעתי, מתוך האפליקציה או באימייל.'),
    'licenses.html': page(docs.licenses.title, docs.licenses.html, site, 'רישיונות הקוד הפתוח, הגופנים ומקורות הנתונים שבהם שעתי משתמשת.'),
  };
  for (const [f, html] of Object.entries(files)) fs.writeFileSync(path.join(out, f), html);
  return Object.keys(files);
}
module.exports = { build };
if (require.main === module) {
  const root = path.join(__dirname, '..');
  const site = process.argv.includes('--site');
  console.log(build(path.join(root, 'src'), path.join(root, site ? 'site' : 'docs'), site));
}
