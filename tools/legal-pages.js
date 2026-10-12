/* Generates the public legal pages (required by Google Play: privacy policy URL and
 * account-deletion URL) from the same documents shown inside the app.
 *   docs/privacy.html, docs/terms.html, docs/accessibility.html, docs/delete-account.html */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_URL = 'https://leelor123.github.io/shifts/';
const CONTACT = 'https://github.com/leelor123/shifts/issues';

function loadDocs(src) {
  const ctx = { document: { addEventListener() {} } };
  ctx.window = ctx;
  ctx.App = { sheetsApi: {}, actions: {} };
  ctx.Store = { S: { settings: {} } };
  ctx.UI = { icon: () => '', esc: (s) => String(s) };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(src, 'app/views-legal.js'), 'utf8'), ctx);
  return ctx.App.LEGAL_DOCS;
}

const EN = {
  privacy: `<h2 lang="en" dir="ltr">Summary in English</h2>
<div lang="en" dir="ltr" class="en">
<p><b>Shaati — shift &amp; pay tracker</b> is a personal tool for Israeli hourly workers.</p>
<ul>
<li><b>Data you enter</b> (shifts, roles and hourly rates, leave days, settings, verified payslip fields, optional name, date of birth and gender, used for the age-based minimum wage, youth-employment checks and the pension age) is stored on your device and — after you sign in with Google — in Google Cloud Firestore (region me-west1, Tel Aviv). Security rules allow each signed-in user to access only their own data.</li>
<li><b>Account data:</b> Google user ID, email, display name and photo, used only for sign-in and display.</li>
<li><b>Never uploaded:</b> your Anthropic API key, the PIN lock, payslip image/PDF files and their raw OCR text.</li>
<li><b>Fingerprint unlock</b> is handled entirely by the phone; the app never receives or stores fingerprint or face data.</li>
<li><b>No ads, no analytics, no tracking cookies.</b> Data is not sold or shared for marketing.</li>
<li><b>Third parties:</b> Google (authentication and storage), GitHub (hosting of the app code), Anthropic (only when you use an AI feature with your own API key; payslip text is redacted and shown to you before sending), font/code CDNs.</li>
<li><b>Your rights:</b> view and edit everything in the app, export it (backup file / CSV), and delete your account and all data at any time (Settings › Account &amp; sync › Delete all data). See <a href="delete-account.html">delete-account.html</a>.</li>
<li><b>Children:</b> users under 18 should use the app with a parent's or guardian's consent.</li>
<li><b>Contact:</b> <a href="${CONTACT}">${CONTACT}</a></li>
</ul></div>`,
  terms: `<h2 lang="en" dir="ltr">Summary in English</h2>
<div lang="en" dir="ltr" class="en"><p>The app is provided free of charge, "as is". Calculations are estimates and are not legal, accounting, tax or financial advice. AI answers are generated automatically and may be wrong. Israeli law applies. Contact: <a href="${CONTACT}">${CONTACT}</a></p></div>`,
};

const DELETE = `<p class="meta">מחיקת חשבון ונתונים · Account &amp; data deletion</p>
<h2>איך מוחקים את החשבון ואת כל הנתונים</h2>
<ol>
<li>פתחו את האפליקציה בטלפון, או בדפדפן בכתובת <a href="${APP_URL}">${APP_URL}</a>, והתחברו עם אותו חשבון Google.</li>
<li>היכנסו ל<b>הגדרות › חשבון וסנכרון</b>.</li>
<li>לחצו <b>"מחק את כל הנתונים מהחשבון"</b> ואשרו.</li>
</ol>
<p>המחיקה מיידית וסופית: כל הנתונים שנשמרו בחשבון (משמרות, תפקידים ותעריפים, הגדרות, תלושים, פערים, ימי חופשה ומחלה) נמחקים מהענן, החשבון עצמו נמחק ממערכת ההתחברות, והנתונים נמחקים גם מהמכשיר. לא נשמר עותק נוסף. לפני המחיקה אפשר לייצא גיבוי (הגדרות › גיבוי).</p>
<p>אם אין לכם גישה לאפליקציה, אפשר לפנות דרך <a href="${CONTACT}">עמוד הפניות</a> (בלי לפרסם פרטים אישיים — נחזור אליכם לאימות).</p>
<h2 lang="en" dir="ltr">How to delete your account and data</h2>
<div lang="en" dir="ltr" class="en"><ol>
<li>Open the app (or <a href="${APP_URL}">${APP_URL}</a> in any browser) and sign in with the same Google account.</li>
<li>Go to <b>Settings › Account &amp; sync</b> (הגדרות › חשבון וסנכרון).</li>
<li>Tap <b>Delete all data</b> (מחק את כל הנתונים מהחשבון) and confirm.</li></ol>
<p>Deletion is immediate and permanent: all data stored for the account in the cloud is deleted, the sign-in account is deleted, and local data on the device is cleared. No copy is retained. If you cannot access the app, open a request at <a href="${CONTACT}">${CONTACT}</a> (do not post personal details publicly; we will contact you to verify).</p></div>`;

function page(title, body) {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Shaati</title><link rel="icon" href="favicon-48.png" type="image/png">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap">
<style>
:root{--ink:#1b2220;--muted:#5b625e;--line:#e3dfd4;--bg:#f6f4ee;--card:#fdfcf8;--primary:#1d4a4f}
@media(prefers-color-scheme:dark){:root{--ink:#e8ede9;--muted:#a5aea9;--line:#26302e;--bg:#0f1413;--card:#151c1b;--primary:#7cc3c9}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Rubik,Assistant,system-ui,Arial,sans-serif;line-height:1.7}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
header img{width:44px;height:44px;border-radius:12px}
header a{color:var(--ink);text-decoration:none;font-weight:700}
h1{font-size:1.7rem;margin:8px 0 4px} h2{font-size:1.15rem;margin:22px 0 6px} h4{font-size:1.02rem;margin:18px 0 4px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.meta,.legal-meta{color:var(--muted);font-size:.85rem} a{color:var(--primary)} ul,ol{padding-inline-start:22px}
.en{font-family:system-ui,Arial,sans-serif} footer{margin-top:28px;color:var(--muted);font-size:.85rem}
</style></head><body><main>
<header><img src="icon-192.png" alt=""><a href="${APP_URL}">Shaati</a></header>
<h1>${title}</h1><div class="card">${body}</div>
<footer><a href="privacy.html">מדיניות פרטיות</a> · <a href="terms.html">תנאי שימוש</a> · <a href="accessibility.html">נגישות</a> · <a href="delete-account.html">מחיקת חשבון</a> · <a href="${CONTACT}">יצירת קשר</a></footer>
</main></body></html>
`;
}

function build(src, out) {
  const docs = loadDocs(src);
  const files = {
    'privacy.html': page(docs.privacy.title, docs.privacy.html + EN.privacy),
    'terms.html': page(docs.terms.title, docs.terms.html + EN.terms),
    'accessibility.html': page(docs.accessibility.title, docs.accessibility.html),
    'delete-account.html': page('מחיקת חשבון ונתונים', DELETE),
  };
  for (const [f, html] of Object.entries(files)) fs.writeFileSync(path.join(out, f), html);
  return Object.keys(files);
}
module.exports = { build };
if (require.main === module) console.log(build(path.join(__dirname, '..', 'src'), path.join(__dirname, '..', 'docs')));
