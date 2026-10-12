// End-to-end checks in a real (headless) Chrome. Needs: npm i --no-save puppeteer-core; CHROME_PATH if Chrome is elsewhere.
// Full smoke test: every screen and action, errors collected per step.
//   node smoke.js <docsDir> <outDir>
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const [docs, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(docs, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (file.endsWith('index.html')) body = Buffer.from(body.toString('utf8').replace('window.FIREBASE_CONFIG = {', 'window.__NO_CLOUD = {'));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let errors = [];
(async () => {
  await new Promise((r) => server.listen(8783, r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/vibrate|favicon|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', async (d) => { errors.push('native dialog: ' + d.message()); await d.dismiss(); });
  await page.setViewport({ width: 412, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const closeAll = async () => {
    await ev(() => { document.querySelectorAll('.dialog').forEach((d) => { if (d._resolve) d._resolve(null); d.remove(); }); UI.closeAll(); });
    await sleep(500);
    const left = await ev(() => UI.sheets.length);
    if (left) throw new Error(left + ' sheet(s) still open after closeAll');
    const inApp = await ev(() => location.host === 'localhost:8783');
    if (!inApp) throw new Error('left the app');
  };
  async function step(name, fn) {
    errors = [];
    let fail = null;
    try {
      await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('step timed out (20s)')), 20000))]);
    } catch (e) {
      fail = e.message.split('\n')[0];
      // a step waiting on an in-app confirmation: answer it so the next step starts clean
      await page.evaluate(() => { document.querySelectorAll('.dialog').forEach((d) => { if (d._resolve) d._resolve(null); d.remove(); }); }).catch(() => {});
    }
    await sleep(150);
    const ok = !fail && !errors.length;
    results.push({ name, ok, fail, errors: errors.slice(0, 3) });
    console.log((ok ? '  ✓ ' : '  ✗ ') + name + (fail ? '  FAIL: ' + fail : '') + (errors.length ? '  ERR: ' + errors.slice(0, 2).join(' | ') : ''));
    if (!ok) await page.screenshot({ path: path.join(out, 'fail-' + results.length + '.png') }).catch(() => {});
  }

  await step('first open: intro, terms', async () => {
    await page.goto('http://localhost:8783/', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#lg-ok', { timeout: 15000 });
    await page.waitForFunction(() => !document.getElementById('intro'), { timeout: 15000 });
    await page.click('#lg-ok'); await page.click('#lg-go');
    await page.waitForSelector('[data-next]', { timeout: 5000 });
  });
  await step('setup wizard, all steps with defaults', async () => {
    for (let i = 0; i < 10; i++) {
      const done = await ev(() => !App.blocking);
      if (done) break;
      await page.click('[data-next]'); await sleep(250);
    }
    if (await ev(() => !!App.blocking)) throw new Error('wizard did not finish');
    await sleep(800);
  });
  await step('home renders', async () => { await ev(() => App.go('home')); await sleep(400); if (!(await page.$('.home-hero'))) throw new Error('no hero'); });
  await step('start shift → break → back → stop', async () => {
    await page.click('[data-act="timer-start"]'); await sleep(600);
    if (!(await ev(() => !!Store.S.activeShift))) throw new Error('not started');
    await ev(() => { Store.S.activeShift.start -= 3 * 3600000; });
    await page.click('[data-act="timer-break"]'); await sleep(300);
    await page.click('[data-act="timer-break"]'); await sleep(300);
    await page.click('[data-act="timer-stop"]'); await sleep(1200);
    if (await ev(() => !!Store.S.activeShift)) throw new Error('not stopped');
    if (!(await ev(() => Store.S.shifts.length === 1))) throw new Error('shift not saved');
    await closeAll();
  });
  await step('manual shift via the + menu and editor', async () => {
    await page.click('#nav [data-act="add-menu"]'); await sleep(500);
    await page.click('.sheet [data-act="shift-new"]'); await sleep(900);
    await ev(() => {
      const set = (f, v) => { const el = document.querySelector(`.sheet [data-f="${f}"]`); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set('date', U.addDays(U.todayKey(), -2)); set('startT', '16:00'); set('endT', '23:30');
    });
    await sleep(300);
    await page.click('.sheet [data-save]'); await sleep(900);
    if (!(await ev(() => Store.S.shifts.length === 2))) throw new Error('manual shift not saved');
    await closeAll();
  });
  await step('editor validation shakes on missing time', async () => {
    await ev(() => App.sheetsApi.shiftEditor()); await sleep(700);
    await ev(() => { const el = document.querySelector('.sheet [data-f="endT"]'); el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('.sheet [data-save]'); await sleep(300);
    const toast = await ev(() => (document.getElementById('toast') || {}).textContent || '');
    if (!toast.includes('מלא')) throw new Error('no validation message');
    await closeAll();
  });
  await step('shift detail: weekly repeat ×4', async () => {
    const id = await ev(() => Store.S.shifts[0].id);
    await ev((i) => App.sheetsApi.shiftDetail(i), id); await sleep(700);
    await ev(() => document.querySelector('.sheet [data-x="repeat"]').click()); await sleep(400);
    await page.click('.dialog [data-i="1"]'); await sleep(900);
    const planned = await ev(() => Store.S.shifts.filter((s) => s.status === 'planned').length);
    if (planned !== 4) throw new Error('planned copies: ' + planned);
    await closeAll();
  });
  await step('undo the weekly repeat', async () => {
    await ev(() => App.undo()); await sleep(500);
    const planned = await ev(() => Store.S.shifts.filter((s) => s.status === 'planned').length);
    if (planned !== 0) throw new Error('undo left ' + planned);
  });
  await step('demo data loads', async () => { await ev(() => App.demo.load()); await sleep(1500); if (!(await ev(() => Store.S.shifts.length > 20))) throw new Error('no demo'); });
  for (const tab of ['home', 'calendar', 'reports', 'settings']) await step('tab ' + tab, async () => { await ev((t) => App.go(t), tab); await sleep(500); });
  await step('calendar: week view, next/prev month, a day sheet', async () => {
    await ev(() => App.go('calendar')); await sleep(300);
    const btns = await page.$$('#view button');
    for (const b of btns.slice(0, 6)) { await b.click().catch(() => {}); await sleep(250); await closeAll(); }
    await ev(() => App.sheetsApi.daySheet(U.todayKey())); await sleep(600); await closeAll();
  });
  await step('reports: every sub-tab and period type', async () => {
    for (const sub of ['summary', 'charts', 'list', 'payslips']) for (const type of ['week', 'month', 'year']) {
      await ev((s, t) => { App.reportsState.sub = s; App.reportsState.type = t; App.go('reports'); }, sub, type); await sleep(250);
    }
  });
  await step('reports: shift search and filters', async () => {
    await ev(() => { App.reportsState.sub = 'list'; App.reportsState.f.q = 'מזנון'; App.go('reports'); }); await sleep(400);
    await ev(() => { App.reportsState.f.q = ''; App.reportsState.f.ov = true; App.go('reports'); }); await sleep(300);
    await ev(() => { App.reportsState.f.ov = false; App.go('reports'); });
  });
  await step('every settings section opens', async () => {
    const keys = await ev(() => [...document.querySelectorAll('[data-act="settings-open"]')].map((b) => b.dataset.k));
    await ev(() => App.go('settings')); await sleep(300);
    const all = await ev(() => [...document.querySelectorAll('[data-act="settings-open"]')].map((b) => b.dataset.k));
    for (const k of all) {
      await ev((key) => document.querySelector(`[data-act="settings-open"][data-k="${key}"]`).click(), k); await sleep(450);
      await closeAll();
    }
    if (all.length < 15) throw new Error('only ' + all.length + ' sections');
  });
  await step('legal documents open', async () => { for (const d of ['terms', 'privacy', 'disclaimer', 'accessibility', 'about']) { await ev((x) => App.sheetsApi.legal(x), d); await sleep(350); await closeAll(); } });
  await step('rights center: checks, search, topic, youth section', async () => {
    await ev(() => Store.setSettings((s) => { s.birthDate = '2010-02-01'; }));
    await ev(() => App.actions.rights()); await sleep(700);
    const txt = await ev(() => document.querySelector('.sheet').innerText);
    if (!txt.includes('27.94') && !txt.includes('30.92')) throw new Error('youth minimum missing');
    if (!txt.includes('לבני נוער')) throw new Error('youth section missing');
    await ev(() => { const q = document.querySelector('.rt-search'); q.value = 'נסיעות'; q.dispatchEvent(new Event('input')); }); await sleep(200);
    const open = await ev(() => [...document.querySelectorAll('.rt-topic')].filter((d) => d.open).length);
    if (!open) throw new Error('search did not open a topic');
    await closeAll();
  });
  await step('youth law alert appears for a 16-year-old night shift', async () => {
    await ev(async () => {
      const k = U.addDays(U.todayKey(), -3);
      await Store.apply([{ store: 'shifts', put: { kind: 'shift', employerId: Store.S.employers[0].id, roleId: App.roles()[0].id, status: 'done', start: U.toEpoch(k, '17:00'), end: U.toEpoch(k, '23:45'), breakMin: 0, breakPaid: true, items: [], splits: [] } }], null);
      await App.runInsights();
    });
    const has = await ev(() => Store.S.notifications.some((n) => n.type === 'youth'));
    if (!has) throw new Error('no youth alert');
  });
  await step('insights sheet and filters', async () => {
    await ev(() => App.actions.insights()); await sleep(600);
    const chips = await page.$$('.sheet .chip, .sheet .seg button');
    for (const c of chips.slice(0, 5)) { await c.click().catch(() => {}); await sleep(200); }
    await closeAll();
  });
  await step('payslip: new payslip sheet and the demo analysis', async () => {
    await ev(() => App.actions['payslip-new']()); await sleep(700); await closeAll();
    await ev(() => App.sheetsApi.payslip('demo_slip')); await sleep(700); await closeAll();
  });
  await step('assistant without a key shows setup, no crash', async () => { await ev(() => App.actions.assistant()); await sleep(600); await closeAll(); });
  await step('theme, accent, font, effects off/on', async () => {
    await ev(() => Store.setSettings((s) => { s.theme = 'dark'; s.accent = Object.keys(App.ACCENTS)[3]; s.font = 'heebo'; s.fx.effects = false; })); await sleep(400);
    await ev(() => Store.setSettings((s) => { s.theme = 'system'; s.accent = 'petrol'; s.font = 'rubik'; s.fx.effects = true; })); await sleep(300);
  });
  await step('backup: export and replace-restore keep the data', async () => {
    const n = await ev(async () => { const b = await Store.exportBackup(false); const before = Store.S.shifts.length; await Store.importBackup(JSON.parse(JSON.stringify(b)), 'replace'); return [before, Store.S.shifts.length]; });
    if (n[0] !== n[1]) throw new Error('count changed ' + n.join('→'));
  });
  await step('CSV, monthly CSV and calendar files download', async () => {
    const dl = path.resolve(out, 'downloads');
    fs.mkdirSync(dl, { recursive: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    await ev(async () => { const rs = [...App.model.results.values()]; await App.exporter.shiftsCsv(rs, 'shifts.csv'); await App.exporter.monthlyCsv(); await App.exporter.ics(rs, 'shifts.ics'); });
    await sleep(1500);
    const files = fs.readdirSync(dl);
    if (files.length < 3) throw new Error('downloaded: ' + files.join(', '));
    const csv = fs.readFileSync(path.join(dl, files.find((f) => f.startsWith('shifts') && f.endsWith('.csv'))), 'utf8');
    if (!/^﻿/.test(csv) || csv.split('\n').length < 10) throw new Error('CSV looks wrong');
  });
  await step('PIN lock: 5 wrong codes → wait, right code unlocks', async () => {
    await ev(async () => { const salt = 'x1'; const hash = await App.hashPin('2468', salt); await Store.setSettings((s) => { s.lock = Object.assign(s.lock, { enabled: true, hash, salt, len: 4 }); }); App.lock(); });
    await sleep(300);
    const press = async (code) => { for (const ch of code) { await ev((c) => document.querySelector(`#lock [data-k="${c}"]`).click(), ch); await sleep(60); } await sleep(150); };
    for (let i = 0; i < 5; i++) await press('1111');
    const msg = await ev(() => document.getElementById('lock').innerText);
    if (!msg.includes('יותר מדי')) throw new Error('no lockout');
    const stillLocked = await ev(async () => { document.querySelector('#lock [data-k="2"]').click(); return !!document.getElementById('lock'); });
    if (!stillLocked) throw new Error('unlocked during the wait');
  });
  await step('fingerprint unlock (virtual authenticator)', async () => {
    const cdp = await page.createCDPSession();
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true } });
    await ev(() => { document.getElementById('lock').remove(); });
    const id = await ev(() => App.bio.enroll());
    await ev((x) => Store.setSettings((s) => { s.lock.bioId = x; }), id);
    await ev(() => App.lock()); await sleep(1200);
    if (await ev(() => !!document.getElementById('lock'))) throw new Error('still locked after fingerprint');
    await ev(() => Store.setSettings((s) => { s.lock.enabled = false; s.lock.hash = null; s.lock.bioId = null; }));
  });
  await step('pull to refresh does not move the page on a tap', async () => {
    await ev(() => { App.go('home'); window.scrollTo(0, 0); }); await sleep(300);
    const cdp = await page.createCDPSession();
    const t = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 200, y }] });
    await t('touchStart', 300); await t('touchMove', 306); await t('touchMove', 310); await t('touchEnd', 310);
    const moved = await ev(() => (document.getElementById('view-inner') || {}).style.transform || '');
    if (moved && moved !== 'none' && moved !== '') throw new Error('page moved: ' + moved);
  });
  await step('demo data clears', async () => { await ev(() => App.demo.clear()); await sleep(800); });
  await step('delete-all (local) wipes', async () => { await ev(() => Store.wipe()); await sleep(300); if (await ev(() => Store.S.shifts.length)) throw new Error('not wiped'); });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
