// Before/after pages for the edge boxes fix (1.35). Each page: the screen before and after, a 3x zoom of the bottom
// corner where the box showed, and a short note in Hebrew; rendered to PNG next to its HTML.
//   node review/1.35/edge-boxes/make.js <docsBefore> <docsAfter>
const http = require('http'), fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..', '..', '..');
const puppeteer = require(path.join(R, 'node_modules', 'puppeteer-core'));
const { FIND } = require(path.join(R, 'tests', 'e2e', 'edge-boxes.js'));
const [before, after] = process.argv.slice(2).map((d) => path.resolve(d));
const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots, { recursive: true });
const serve = (root, port) => new Promise((ok) => {
  const s = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(root, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file);
    if (file.endsWith('.html')) body = Buffer.from(body.toString('utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''));
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); res.end(body);
  }); s.listen(port, () => ok(s));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CASES = [
  { id: '1-demo-ready', w: 360, theme: 'dark', state: 'demo', title: 'המסך "הנתונים לדוגמה מוכנים!"',
    was: 'מתחת לכפתורים הייתה שכבה כהה שמסתירה את מה שגולל מאחוריהם. היא נעצרה 16 פיקסלים לפני כל צד של המסך, ובצדדים נראו הכתמים הצבעוניים של הרקע. יצא מלבן כהה עם פסים בהירים בצדדים.',
    now: 'השכבה מגיעה עד שני צדי המסך. הכפתורים נשארו בדיוק באותו מקום, והמלבן נעלם.' },
  { id: '2-question', w: 412, theme: 'light', state: 'job', title: 'כל שאלות ההגדרה',
    was: 'אותה שכבה נמצאת בכל שאלה (שם, גיל, עבודה, הפסקות, נסיעות, עיר, תאריך התחלה, סיום), ולכן המלבן הופיע בכל המסכים האלה, בבהיר ובכהה, בעברית, באנגלית ובערבית.',
    now: 'תיקון אחד בכלל של הפס התחתון מתקן את כל השאלות יחד.' },
  { id: '3-terms', w: 360, theme: 'dark', state: 'terms', title: 'מסך אישור התנאים',
    was: 'הפס התחתון עם המתג "קראתי ואני מסכים/ה" והכפתור "אישור והמשך" היה צר מהמסך ב-16 פיקסלים מכל צד. כאן הרקע מאחוריו בצבע אחיד, ולכן היום לא ראו מלבן, אבל זה אותו פס בדיוק.',
    now: 'הפס מגיע עד הצדדים, כמו בשאלות ההגדרה. המסך נראה אותו דבר, והמלבן לא יופיע גם אם הרקע כאן ישתנה.' },
  { id: '4-computer', w: 1024, theme: 'dark', state: 'demo', title: 'מסך רחב (מחשב, טאבלט)',
    was: 'במסך רחב האפליקציה היא עמודה של 600 פיקסלים באמצע. הכתמים הצבעוניים היו בפינות של כל המסך, והשכבה מתחת לכפתורים חתכה אותם בקו ישר.',
    now: 'הכתמים נמצאים עכשיו בתוך העמודה ונעלמים בהדרגה לפני הצדדים שלה, כך שהשכבה פוגשת בשני הצדדים את אותו רקע חלק.' },
];
(async () => {
  const sB = await serve(before, 8851), sA = await serve(after, 8852);
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars', '--mute-audio'] });
  const snap = async (port, c, file) => {
    const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const page = await ctx.newPage();
    await require(path.join(R, 'tests', 'e2e', 'quiet.js')).quiet(page);
    page.on('dialog', (d) => d.dismiss());
    const h = 760;
    await page.setViewport({ width: c.w, height: h, deviceScaleFactor: 2, isMobile: c.w <= 600, hasTouch: c.w <= 600 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: c.theme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('http://localhost:' + port) ? r.continue() : r.abort()));
    await page.evaluateOnNewDocument(() => {
      const stubs = { probe: async () => true, start: async () => null, sdkReady: () => true, signIn: () => Promise.resolve({ uid: 'shot0123456789abcdefghij', displayName: 'T', email: 't@example.com' }), connect: async (u) => { window.Cloud.user = u; window.Cloud.connected = true; } };
      let C; Object.defineProperty(window, 'Cloud', { configurable: true, get: () => C, set: (v) => { C = v; for (const k of Object.keys(stubs)) Object.defineProperty(v, k, { configurable: true, get: () => stubs[k], set: () => {} }); } });
    });
    await page.goto(`http://localhost:${port}/?cloud=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('intro'), { timeout: 15000 });
    if (await page.waitForSelector('.lp-host.in', { timeout: 6000 }).then(() => true).catch(() => false)) { await page.evaluate(() => document.querySelector('.lp-card[data-lang="he"]').click()); await page.waitForFunction(() => !document.querySelector('.lp-host'), { timeout: 8000 }); }
    await page.waitForSelector('.skyscreen.step-hi'); await sleep(500);
    if (c.state === 'job') {
      await page.click('[data-next]'); await sleep(500);
      for (let i = 0; i < 6 && !(await page.$('.step-job')); i++) { await page.click('[data-skip]'); await sleep(500); }
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await sleep(300);
    } else {
      await page.click('[data-demo]'); await sleep(2500);
      if (c.state === 'terms') {
        await page.click('[data-guest]'); await sleep(700);
        await page.evaluate(() => { const d = [...document.querySelectorAll('.dialog')].pop(); const bs = d ? d.querySelectorAll('button') : []; if (bs.length) bs[bs.length - 1].click(); }); await sleep(1800);
      }
    }
    await sleep(600);
    const strips = await page.evaluate(FIND);
    await page.screenshot({ path: file });
    await ctx.close();
    return { h, strip: strips.find((x) => /foot/.test(x.name)) || strips[0] };
  };
  for (const c of CASES) {
    const b = await snap(8851, c, path.join(shots, c.id + '-before.png'));
    const a = await snap(8852, c, path.join(shots, c.id + '-after.png'));
    fs.writeFileSync(path.join(__dirname, c.id + '.html'), page(c, b, a));
  }
  const p = await browser.newPage();
  for (const c of CASES) {
    await p.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
    await p.goto('file:///' + path.join(__dirname, c.id + '.html').replace(/\\/g, '/'), { waitUntil: 'load' });
    await p.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {})))); // every shot drawn before the picture is taken
    // the page's own height (a full-page shot of a page shorter than the window came out blank)
    await p.setViewport({ width: 1200, height: await p.evaluate(() => document.body.scrollHeight), deviceScaleFactor: 1 });
    await sleep(300);
    await p.screenshot({ path: path.join(__dirname, c.id + '.png') });
  }
  await browser.close(); sB.close(); sA.close();
  console.log('made', CASES.map((c) => c.id).join(', '));
})();

function page(c, b) {
  // the shots at a fixed width; the zoom shows the bottom corner where the strip's side was, 3x
  const show = c.w > 600 ? 520 : 300, k = show / c.w, h = Math.round(b.h * k);
  const s = b.strip || { l: 16, t: b.h - 200, b: b.h };
  const edgeX = c.w > 600 ? s.l : 16;
  const zw = 150, zh = 150, Z = 3;
  const zx = Math.max(0, edgeX - zw / Z / 2), zy = Math.max(0, Math.min(b.h - zh / Z, (s.t + s.b) / 2 - zh / Z / 2));
  const zoom = (img) => `<div class="zoom" style="background-image:url(shots/${img});background-size:${c.w * Z}px ${b.h * Z}px;background-position:-${zx * Z}px -${zy * Z}px"></div>`;
  const mark = `<i class="mk" style="left:${zx * k}px;top:${zy * k}px;width:${(zw / Z) * k}px;height:${(zh / Z) * k}px"></i>`;
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${c.title}</title>
<style>
:root { --bg: #f6f4ee; --ink: #1d2230; --mute: #5b6274; --bad: #b3261e; --good: #1b7a4a; --card: #fff; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.55 Rubik, "Segoe UI", Arial, sans-serif; }
.wrap { padding: 28px 32px; width: 1200px; }
h1 { font-size: 28px; margin: 0 0 16px; }
.pair { display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start; }
.col { flex: none; }
.col h2 { font-size: 18px; margin: 0 0 8px; }
.was h2 { color: var(--bad); } .now h2 { color: var(--good); }
.shot { position: relative; width: ${show}px; height: ${h}px; border-radius: 18px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.18); background: #000; }
.shot img { display: block; width: ${show}px; }
.mk { position: absolute; border: 3px solid #ff3b30; border-radius: 8px; box-shadow: 0 0 0 2px #fff; }
.now .mk { border-color: #34c759; }
.zoom { width: ${zw}px; height: ${zh}px; margin-top: 12px; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,.2); background-repeat: no-repeat; image-rendering: pixelated; }
.zl { font-size: 13px; color: var(--mute); margin-top: 4px; }
.notes { flex: 1 1 360px; min-width: 0; }
.box { background: var(--card); border-radius: 16px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.box b { display: block; margin-bottom: 4px; font-size: 15px; }
.bwas b { color: var(--bad); } .bnow b { color: var(--good); }
.how { color: var(--mute); font-size: 15px; }
.ltr { direction: ltr; unicode-bidi: isolate; font-family: Consolas, monospace; font-size: 14px; }
</style></head><body><div class="wrap"><h1>${c.title}</h1><div class="pair">
<div class="col was"><h2>לפני</h2><div class="shot"><img src="shots/${c.id}-before.png" alt="">${mark}</div>${zoom(c.id + '-before.png')}<div class="zl">הפינה המסומנת, פי 3</div></div>
<div class="col now"><h2>אחרי</h2><div class="shot"><img src="shots/${c.id}-after.png" alt="">${mark}</div>${zoom(c.id + '-after.png')}<div class="zl">אותה פינה, פי 3</div></div>
<div class="notes"><div class="box bwas"><b>מה היה לא בסדר</b>${c.was}</div><div class="box bnow"><b>מה השתנה</b>${c.now}</div>
<div class="box how"><b>איך זה לא יחזור</b>בדיקה חדשה, <bdi class="ltr">tests/e2e/edge-boxes.js</bdi>, עוברת על כל המסכים בחמישה רוחבי מסך, בבהיר ובכהה, בעברית, באנגלית ובערבית. היא נכשלת אם פס או שכבה נעצרים לפני צד המסך, או אם הצבע קופץ בצד שלהם. בתמונה: רוחב ${c.w} פיקסלים, ${c.theme === 'dark' ? 'מצב כהה' : 'מצב בהיר'}.</div></div>
</div></div></body></html>`;
}
