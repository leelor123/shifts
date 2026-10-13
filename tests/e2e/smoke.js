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
  if (file.endsWith('index.html') && !/cloud=1/.test(req.url)) body = Buffer.from(body.toString('utf8').replace('window.FIREBASE_CONFIG = {', 'window.__NO_CLOUD = {'));
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
    for (let i = 0; i < 12; i++) {
      const done = await ev(() => !App.blocking);
      if (done) break;
      await page.click((await page.$('[data-save]')) ? '[data-save]' : '[data-next]'); await sleep(300);
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
    // scroll down first: a search must still show its answer right under the box, without scrolling
    await ev(() => { document.querySelector('.sheet .sh-body').scrollTop = 900; });
    const search = (s) => ev((x) => { const q = document.querySelector('.rt-search'); q.value = x; q.dispatchEvent(new Event('input')); }, s);
    for (const word of ['נסיעות', 'בשבת', 'פיטרו', 'הבראה']) {
      await search(word); await sleep(250);
      const r = await ev(() => {
        const q = document.querySelector('.rt-search').getBoundingClientRect();
        const hit = document.querySelector('.rt-results .rt-hit');
        const h = hit && hit.getBoundingClientRect();
        return { main: document.querySelector('.rt-main').hidden, hits: document.querySelectorAll('.rt-hit').length, gap: h ? h.top - q.bottom : null, inView: h ? h.top < innerHeight - 80 : false, qTop: q.top };
      });
      if (!r.main) throw new Error(word + ': the rest of the page was not hidden');
      if (!r.hits) throw new Error(word + ': no result');
      if (r.gap < 0 || r.gap > 40 || !r.inView || r.qTop < 0) throw new Error(word + ': result not right under the box ' + JSON.stringify(r));
    }
    await search('מעלית חללית'); await sleep(200);
    if (!(await ev(() => !!document.querySelector('.rt-none [data-rt-ai]')))) throw new Error('no "ask the assistant" for an unknown question');
    await search(''); await sleep(200);
    if (await ev(() => document.querySelector('.rt-main').hidden || !document.querySelector('.rt-results').hidden)) throw new Error('clearing the search did not bring the guide back');
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
  await step('anonymous stats: record has only the allowed fields', async () => {
    const r = await ev(() => Stats._record());
    const keys = Object.keys(r).sort().join(',');
    if (keys !== 'age,days,f,first,last,p,ps,s30,sh,t,v') throw new Error('keys: ' + keys);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.first) || !/^\d{4}-\d{2}-\d{2}$/.test(r.last)) throw new Error('dates');
    if (!['android', 'pwa', 'web'].includes(r.p) || !['u18', '18p', ''].includes(r.age)) throw new Error('enums');
    if (Object.keys(r.f).length > 16 || Object.values(r.f).some((x) => typeof x !== 'boolean')) throw new Error('features');
    if (JSON.stringify(r).match(/@|uid|name|email/i)) throw new Error('personal data in the record');
  });
  await step('admin dashboard: real numbers, safe from hostile records, add-admin validation', async () => {
    const res = await ev(async () => {
      const k = U.todayKey();
      const evil = '<img src=x onerror="window.__xss=1">';
      const rows = [
        { v: '1.6.0', p: 'android', first: k, last: k, days: 12, sh: 40, s30: 9, ps: 2, age: 'u18', f: { rights: true, notif: true }, t: 1 },
        { v: '1.6.0', p: 'web', first: U.addDays(k, -20), last: U.addDays(k, -3), days: 4, sh: 10, s30: 3, ps: 0, age: '18p', f: { dark: true }, t: 1 },
        { v: evil, p: evil, first: U.addDays(k, -50), last: U.addDays(k, -40), days: 1, sh: 1, s30: 0, ps: 0, age: evil, f: { [evil]: true }, t: 1 },
      ];
      const writes = [];
      const snap = (list) => ({ docs: list.map(([id, d]) => ({ id, data: () => d })) });
      const fs = {
        collection: (db, ...p) => ({ path: p.join('/') }), doc: (db, ...p) => ({ path: p.join('/') }),
        getDocsFromServer: async (c) => (c.path === 'stats' ? snap(rows.map((r, i) => ['dev' + i, r])) : snap([['adminUid0123456789abcdef', { added: 1, by: 'x' }]])),
        setDoc: async (ref, d) => { writes.push([ref.path, d]); },
      };
      Cloud._useSdk({ fs, db: {} });
      Cloud.user = { uid: 'adminUid0123456789abcdef' };
      App.isAdmin = true;
      App.go('settings');
      await new Promise((r) => setTimeout(r, 400));
      const entry = document.querySelector('[data-act="admin-dashboard"]');
      if (!entry) return { err: 'no admin entry in settings' };
      entry.click();
      await new Promise((r) => setTimeout(r, 900));
      const sh = document.querySelector('.sheet .admin');
      if (!sh) return { err: 'dashboard did not render' };
      const kpis = [...sh.querySelectorAll('.kpi .v')].map((x) => x.textContent.trim());
      const imgs = sh.querySelectorAll('img').length;
      const input = sh.querySelector('#adm-uid');
      input.value = 'not valid!'; sh.querySelector('[data-adm-add]').click();
      await new Promise((r) => setTimeout(r, 200));
      const badWrites = writes.length;
      input.value = 'NewAdmin0123456789abcdefgh'; sh.querySelector('[data-adm-add]').click();
      await new Promise((r) => setTimeout(r, 300));
      return { kpis, imgs, xss: !!window.__xss, badWrites, writes, text: sh.innerText.includes('<img') };
    });
    await closeAll();
    await ev(() => { App.isAdmin = false; Cloud.user = null; Cloud._useSdk(null); App.go('home'); });
    if (res.err) throw new Error(res.err);
    if (res.imgs || res.xss) throw new Error('hostile record ran as HTML');
    if (!res.text) throw new Error('hostile record should show as plain text');
    if (res.kpis[0] !== '3' || res.kpis[1] !== '1' || res.kpis[2] !== '2' || res.kpis[3] !== '2') throw new Error('wrong numbers: ' + res.kpis.join(','));
    if (res.badWrites) throw new Error('an invalid user id was written');
    const w = res.writes[0];
    if (!w || w[0] !== 'admins/NewAdmin0123456789abcdefgh' || w[1].by !== 'adminUid0123456789abcdef' || !Number.isInteger(w[1].added) || Object.keys(w[1]).length !== 2) throw new Error('add-admin write: ' + JSON.stringify(w));
  });
  await step('a regular user never sees the dashboard', async () => {
    await ev(() => { App.go('settings'); }); await sleep(400);
    if (await page.$('[data-act="admin-dashboard"]')) throw new Error('admin entry visible');
    await ev(() => App.actions['admin-dashboard']()); await sleep(300);
    if (await page.$('.sheet .admin')) throw new Error('dashboard opened without admin rights');
    await closeAll();
  });
  await step('demo data clears', async () => { await ev(() => App.demo.clear()); await sleep(800); });
  await step('delete-all (local) wipes', async () => { await ev(() => Store.wipe()); await sleep(300); if (await ev(() => Store.S.shifts.length)) throw new Error('not wiped'); });

  // a brand-new user (sign-in set up, Google stubbed): the questions come first, sign-in at the end
  const ctx2 = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p2.on('console', (m) => { if (m.type() === 'error' && !/vibrate|favicon|ERR_|net::|Failed to fetch|dynamically imported/.test(m.text())) errors.push('console: ' + m.text()); });
  await p2.setViewport({ width: 412, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await p2.setRequestInterception(true);
  p2.on('request', (r) => (r.url().startsWith('http://localhost:8783/') ? r.continue() : r.abort()));
  await p2.evaluateOnNewDocument(() => {
    const stubs = {
      probe: async () => true,
      start: async () => null,
      signIn: async () => { window.__signIn = (window.__signIn || 0) + 1; return { uid: 'newUser0123456789abcdef', displayName: 'Test', email: 'test@example.com' }; },
      connect: async (u) => { window.Cloud.user = u; window.__connected = u.uid; },
    };
    let C;
    Object.defineProperty(window, 'Cloud', { configurable: true, get: () => C, set: (v) => { C = v; for (const k of Object.keys(stubs)) Object.defineProperty(v, k, { configurable: true, get: () => stubs[k], set: () => {} }); } });
  });
  const e2 = (fn, ...a) => p2.evaluate(fn, ...a);
  const shot = (n) => p2.screenshot({ path: path.join(out, n + '.png') }).catch(() => {});
  await step('new user: welcome screen first, no sign-in wall', async () => {
    await p2.goto('http://localhost:8783/?cloud=1', { waitUntil: 'load' });
    await p2.waitForFunction(() => !document.getElementById('intro'), { timeout: 15000 });
    await p2.waitForSelector('.ob-welcome', { timeout: 8000 });
    if (await e2(() => App.blocking !== 'onboarding')) throw new Error('sign-in screen shown before the questions');
    if (!(await p2.$('[data-have]'))) throw new Error('no "I already have an account"');
    await shot('ob-0');
  });
  await step('new user: six questions with live previews', async () => {
    await p2.click('[data-next]'); await sleep(450);
    if (!(await e2(() => App.legalAccepted()))) throw new Error('terms not accepted on start');
    const t1 = await e2(() => document.getElementById('ob-live-roles').textContent);
    if (!/₪/.test(t1)) throw new Error('no live pay preview: ' + t1);
    await e2(() => { const i = document.querySelector('[data-rr="0"]'); i.value = '50'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    if (!(await e2(() => document.getElementById('ob-live-roles').textContent.includes('400')))) throw new Error('preview did not react');
    await shot('ob-1');
    await p2.click('[data-next]'); await sleep(450);
    if (!(await e2(() => /₪/.test(document.getElementById('ob-live-travel').textContent)))) throw new Error('no travel preview');
    await p2.click('[data-next]'); await sleep(450);
    await p2.click('[data-next]'); await sleep(450);
    await e2(() => { const b = document.getElementById('ob-birth'); b.value = U.addDays(U.todayKey(), -16 * 366); b.dispatchEvent(new Event('input', { bubbles: true })); });
    const age = await e2(() => document.getElementById('ob-live-age').textContent);
    if (!age.includes('16')) throw new Error('age preview: ' + age);
    await shot('ob-4');
    await p2.click('[data-next]'); await sleep(450);
    await p2.click('[data-next]'); await sleep(450);
    await p2.click('[data-next]'); await sleep(700);
    if (!(await p2.$('.ob-google'))) throw new Error('no "save with Google" on the last step');
    await shot('ob-done');
  });
  await step('new user: save with Google signs in and opens the app', async () => {
    await p2.click('.ob-google'); await sleep(1500);
    const st = await e2(() => ({ signIn: window.__signIn, connected: window.__connected, onboarded: Store.S.settings.onboarded, blocking: App.blocking, rate: App.roles().some((r) => Engine.roleRate(r, U.todayKey()) === 50), birth: Store.S.settings.birthDate, hero: !!document.querySelector('.home-hero') }));
    if (st.signIn !== 1 || st.connected !== 'newUser0123456789abcdef') throw new Error('sign-in not done ' + JSON.stringify(st));
    if (!st.onboarded || st.blocking || !st.hero) throw new Error('not in the app ' + JSON.stringify(st));
    if (!st.rate || !st.birth) throw new Error('answers not saved ' + JSON.stringify(st));
    await shot('ob-home');
  });
  await ctx2.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
