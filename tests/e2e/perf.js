// End-to-end checks in a real (headless) Chrome. Needs: npm i --no-save puppeteer-core; CHROME_PATH if Chrome is elsewhere.
// Stress test: ~1,500 shifts over 3 years. Times recompute, insights and every screen.
//   node perf.js <docsDir>
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const [docs] = process.argv.slice(2);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
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
(async () => {
  await new Promise((r) => server.listen(8784, r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 412, height: 860, isMobile: true, hasTouch: true });
  // a mid-range phone is ~4x slower than this PC: throttle the CPU so the numbers mean something
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('http://localhost:8784/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#lg-ok'); await page.waitForFunction(() => !document.getElementById('intro'), { timeout: 30000 });
  await page.click('#lg-ok'); await page.click('#lg-go');
  await page.waitForSelector('[data-demo]'); await page.click('[data-demo]'); await sleep(3000);
  const gen = await page.evaluate(async () => {
    const roles = App.roles();
    const emp = Store.S.employers[0].id;
    const ops = [];
    let k = U.addDays(U.todayKey(), -3 * 365);
    while (k < U.todayKey()) {
      const d = U.dow(k);
      if (d !== 6 && Math.random() < 0.72) {
        const startH = [7, 8, 14, 16, 17, 22][Math.floor(Math.random() * 6)];
        const len = 4 + Math.floor(Math.random() * 6);
        const start = U.toEpoch(k, String(startH).padStart(2, '0') + ':00');
        ops.push({ store: 'shifts', put: { kind: 'shift', employerId: emp, roleId: roles[Math.floor(Math.random() * roles.length)].id, status: 'done', start, end: start + len * 3600000, breakMin: len > 6 ? 30 : 0, breakPaid: false, items: [], splits: [], note: '' } });
      }
      k = U.addDays(k, 1);
    }
    const t0 = performance.now();
    await Store.apply(ops, null);
    return { shifts: Store.S.shifts.length, saveMs: Math.round(performance.now() - t0) };
  });
  await sleep(1500);
  const r = await page.evaluate(async () => {
    const time = async (fn) => { const t = performance.now(); await fn(); return Math.round(performance.now() - t); };
    const out = {};
    out.recompute = await time(() => App.recompute());
    out.recompute_after_edit = await time(async () => { const sh = Store.S.shifts[5]; await Store.apply([{ store: 'shifts', put: Object.assign({}, sh, { note: 'x' }) }], null); App.recompute(); });
    out.recompute_again = await time(() => App.recompute());
    out.insights = await time(() => App.runInsights());
    for (const tab of ['home', 'calendar', 'reports', 'settings']) out['render_' + tab] = await time(() => App.go(tab));
    for (const sub of ['summary', 'charts', 'list']) for (const type of ['month', 'year']) {
      out[`reports_${sub}_${type}`] = await time(() => { App.reportsState.sub = sub; App.reportsState.type = type; App.go('reports'); });
    }
    out.rerender_home = await time(() => { App.go('home'); App.rerender(); });
    out.rights = await time(() => App.actions.rights());
    UI.closeAll();
    out.backup = await time(() => Store.exportBackup(false));
    return out;
  });
  console.log('data:', JSON.stringify(gen));
  console.log('timings (ms, CPU slowed 4×):');
  for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(24)} ${String(v).padStart(6)}${v > 300 ? '  ← slow' : ''}`);
  console.log('errors', JSON.stringify(errs));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
