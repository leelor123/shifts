// Annotated screenshots for the "nothing changed, nothing written" audit (6 Nov 2026).
//   node tools/build.js && node review/1.35/audit-noop/make.js docs
// Opens the built app in headless Chrome, takes each affected screen, then lays it out beside a short Hebrew note
// (what was wrong, what changed) and renders that page to PNG. Output: this folder (*.html, *.png, shots/*.png).
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const docs = path.resolve(process.argv[2] || 'docs');
const OUT = __dirname;
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.css': 'text/css', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(docs, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('index.html')) body = Buffer.from(body.toString('utf8').replace('window.FIREBASE_CONFIG = {', 'window.__NO_CLOUD = {').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CARDS = [
  {
    id: '1-shift-save',
    title: 'שמירת משמרת בלי שינוי',
    was: 'פתחת משמרת, לא שינית כלום ולחצת "שמור". האפליקציה כתבה גרסה חדשה של המשמרת, שלחה אותה לענן, הוסיפה צעד ביטול והראתה "המשמרת עודכנה".',
    now: 'עכשיו לא נכתב ולא נשלח כלום, ומופיעה ההודעה "לא היו שינויים לשמור". אותו דבר בעריכת תפקיד, יום חופשה, תוספת, תלוש ומקום עבודה.',
    how: '`Store.apply` משווה כל רשומה למה שכבר שמור בעזרת `U.same`, ומדלג על רשומה זהה. הבדיקות: `tests/noop.test.js` ושלב חדש ב-`smoke.js`.',
  },
  {
    id: '2-workplace-badge',
    title: 'תג "משתנה" בקוד מקום עבודה',
    was: 'בקוד של מקום עבודה הופיע "משתנה" ליד שורה שנראית זהה אצל שני הצדדים: שעות נוספות "לפי החוק", בלי עיגול שעות, בלי נסיעות. ההבדל היה בערך ששום משמרת לא משתמשת בו.',
    now: 'התג מופיע רק כשהחוקים באמת משתנים. גם "עדכון הקוד לחוקים של היום" כבר לא יוצר גרסה בלי שינוי (תוקן קודם היום).',
    how: '`Workplace.changes` מדלג על מגבלה יומית כשגם אצלך וגם בקוד סופרים לפי החוק, על יחידת עיגול כשאף צד לא מעגל, ועל תקרת נסיעות כשאף צד לא משלם נסיעות.',
  },
  {
    id: '3-double-tap',
    title: 'לחיצה כפולה על התחלה, סיום ושמירה',
    was: 'לחיצה כפולה על "סיים משמרת" שמרה את אותה משמרת פעמיים. לחיצה כפולה על "שמור" במשמרת חדשה הקפיצה שאלה על חפיפה, ובתוספת או ביום חופשה שמרה שניים. הזמנת חבר יצרה שתי הזמנות.',
    now: 'כל לחיצה כפולה עושה את הפעולה פעם אחת: משמרת אחת, רישום אחד ביומן, הזמנה אחת. התחלה כשמשמרת כבר רצה לא מחליפה אותה.',
    how: '`U.single` מריץ פעולה אחת בכל רגע: בהתחלה, בסיום, בהזמנות ובקוד ההזמנה. גיליון שנסגר כבר לא מקבל לחיצות (`ui.js`).',
  },
  {
    id: '4-profile-save',
    title: 'שמירת פרופיל בטבלת האלופים בלי שינוי',
    was: 'לחיצה על "שמירה" בלי לשנות שם, אימוג׳י או רקע כתבה שוב את השורה בטבלה ואת ההגדרות, ושלחה אותן לענן. ההודעה אמרה "נשמר ✓".',
    now: 'בלי שינוי לא נכתב כלום והגיליון נסגר עם "לא היו שינויים לשמור". כך גם בכרטיס של תחרות החברים.',
    how: 'האפליקציה משווה את השם, האימוג׳י והרקע לפני הכתיבה: `views-leaderboard.js` ו-`views-friends.js`.',
  },
];

function page(card) {
  const img = 'shots/' + card.id + '.png';
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${card.title}</title>
<style>
:root { --bg: #f6f4ee; --ink: #1d2230; --mute: #5b6274; --bad: #b3261e; --good: #1b7a4a; --card: #fff; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.55 Rubik, "Segoe UI", Arial, sans-serif; }
.wrap { display: flex; gap: 32px; padding: 32px; align-items: flex-start; width: 1100px; }
.shot { flex: none; width: 412px; border-radius: 22px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.18); background: #000; }
.shot img { display: block; width: 412px; }
.note { flex: 1; }
h1 { font-size: 28px; margin: 0 0 18px; }
.box { background: var(--card); border-radius: 16px; padding: 16px 18px; margin-bottom: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.box b { display: block; margin-bottom: 6px; font-size: 15px; letter-spacing: .02em; }
.was b { color: var(--bad); } .now b { color: var(--good); }
.how { color: var(--mute); font-size: 15px; }
code, .ltr { direction: ltr; unicode-bidi: isolate; font-family: Consolas, monospace; font-size: 14px; }
</style></head><body><div class="wrap"><div class="shot"><img src="${img}" alt=""></div><div class="note">
<h1>${card.title}</h1>
<div class="box was"><b>מה היה לא בסדר</b>${card.was}</div>
<div class="box now"><b>מה השתנה</b>${card.now}</div>
<div class="box how"><b>איך</b>${card.how.replace(/`([^`]+)`/g, '<bdi class="ltr">$1</bdi>')}</div>
</div></div></body></html>`;
}

(async () => {
  await new Promise((r) => server.listen(8994, r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars', '--mute-audio'] });
  const p = await browser.newPage();
  // the mascot's voice stays silent (it played on the computer's speakers)
  await p.evaluateOnNewDocument(() => { const s = window.speechSynthesis; if (!s) return; const fire = (u, t) => { try { const e = new Event(t); if (typeof u['on' + t] === 'function') u['on' + t](e); u.dispatchEvent(e); } catch (x) {} }; s.speak = (u) => { setTimeout(() => fire(u, 'start'), 0); setTimeout(() => fire(u, 'end'), 30); }; });
  await p.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const ev = (fn, ...a) => p.evaluate(fn, ...a);
  const shot = (id) => p.screenshot({ path: path.join(OUT, 'shots', id + '.png') });
  const closeAll = async () => { await ev(() => { document.querySelectorAll('.dialog').forEach((d) => { if (d._resolve) d._resolve(null); d.remove(); }); UI.closeAll(); }); await sleep(500); };
  const toastWait = async (text) => { await p.waitForFunction((t) => ((document.getElementById('toast') || {}).textContent || '').includes(t), { timeout: 5000 }, text); await sleep(350); };

  // a person who finished the setup, with the sample data
  await p.goto('http://localhost:8994/', { waitUntil: 'networkidle0' });
  await p.waitForSelector('#lg-ok', { timeout: 15000 });
  await p.waitForFunction(() => !document.getElementById('intro'), { timeout: 15000 });
  await p.click('#lg-ok'); await p.click('#lg-go');
  await p.waitForSelector('[data-next]', { timeout: 5000 });
  for (let i = 0; i < 12 && (await ev(() => !!App.blocking)); i++) { await p.click((await p.$('[data-save]')) ? '[data-save]' : '[data-next]'); await sleep(300); }
  await sleep(1200);
  for (let i = 0; i < 5 && (await p.$('.coach')); i++) { await p.click('.coach'); await sleep(350); }
  await ev(() => App.demo.load()); await sleep(1500);
  await ev(() => App.go('home')); await sleep(600);

  // 1: an existing shift saved with no change
  const id = await ev(() => Store.S.shifts.filter((s) => s.status === 'done').sort((a, b) => b.start - a.start)[0].id);
  const was = await ev((i) => JSON.stringify(App.shift(i)), id);
  await ev((i) => App.sheetsApi.shiftEditor(i), id); await sleep(900);
  await p.click('.sheet [data-save]');
  if (process.env.DEBUG) { await sleep(800); console.log(was, '\n', await ev((i) => JSON.stringify(App.shift(i)), id), '\n', await ev(() => (document.getElementById('toast') || {}).textContent)); }
  await toastWait('לא היו שינויים לשמור');
  await shot('1-shift-save');
  await closeAll();

  await ev(() => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); }); await sleep(400);
  // 2: a workplace code whose rules read the same as mine (only an unused daily limit differs)
  await ev(() => {
    const e = Store.S.employers[0];
    const W = window.Workplace;
    const r = W.pack({ employer: Object.assign({}, e, { otLaw: true, otThreshold: (+e.otThreshold || 8) + 1, roundingMode: 'none', roundingUnit: 5 }), roles: Store.S.roles.filter((x) => x.employerId === e.id), workWeek: Store.S.settings.leave && Store.S.settings.leave.workWeek, today: U.todayKey() });
    window.__wp = r;
    return Store.apply([{ store: 'employers', put: Object.assign(Store.clone(e), { otLaw: true, roundingMode: 'none' }) }], null);
  });
  await ev(() => {
    const snap = { exists: () => true, data: () => ({ v: 3, r: window.__wp }) };
    window.Cloud = Object.assign(window.Cloud || {}, { user: { uid: 'shot' }, sdk: async () => ({ db: {}, fs: { doc: () => ({}), getDoc: async () => snap } }) });
    WorkplaceCode.preview('abcdefgh');
  });
  await sleep(1200);
  const badges = await ev(() => document.querySelectorAll('.sheet .wp-chg').length);
  console.log('workplace preview: "משתנה" badges shown:', badges);
  await shot('2-workplace-badge');
  await closeAll();

  // 3: a double tap on start and on end: one shift, one start and one end in the shift log
  const before = await ev(() => ({ n: Store.S.shifts.length, starts: Store.S.ledger.filter((x) => x.k === 'start').length }));
  await ev(() => { App.startShift(); App.startShift(); }); await sleep(900);
  await closeAll();
  await ev(() => App.go('home')); await sleep(500);
  const after = await ev(() => ({ n: Store.S.shifts.length, starts: Store.S.ledger.filter((x) => x.k === 'start').length, active: !!Store.S.activeShift }));
  console.log('double start:', JSON.stringify({ before, after }));
  await ev(() => window.scrollTo(0, 0)); await sleep(300);
  await shot('3-double-tap');

  // 4: the champions table profile saved as it is (joined already)
  await ev(() => { if (Store.S.activeShift) App.stopShift(); }); await sleep(1500); await closeAll(); // (not awaited: the end's card waits for a tap)
  await ev(() => Store.setSettings((s) => { s.lb = { on: true, n: 'נועה', e: (window.Leaderboard.EMOJI || ['🦊'])[0], bg: '' }; }));
  await ev(() => { window.Cloud.user = { uid: 'shot' }; Champions.profile(); }); await sleep(900);
  await p.click('.sheet [data-save]');
  await toastWait('לא היו שינויים לשמור');
  await shot('4-profile-save');
  await closeAll();

  // the annotated pages, rendered to PNG
  const r = await browser.newPage();
  await r.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  for (const c of CARDS) {
    const html = path.join(OUT, c.id + '.html');
    fs.writeFileSync(html, page(c));
    await r.goto('file:///' + html.replace(/\\/g, '/'), { waitUntil: 'load' });
    await sleep(200);
    await r.screenshot({ path: path.join(OUT, c.id + '.png'), fullPage: true });
    console.log('wrote', c.id + '.png');
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
