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
  if (file.endsWith('index.html') && !/cloud=1/.test(req.url)) body = Buffer.from(body.toString('utf8').replace('window.FIREBASE_CONFIG = {', 'window.__NO_CLOUD = {').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Every visible button on the top layer must really receive a tap at its centre (nothing invisible on top of it).
// A message bubble is shown first, because a hidden message used to swallow taps.
const HIT = () => {
  if (window.UI) UI.toast('בדיקה');
  const sheet = [...document.querySelectorAll('.sheet.show')].pop();
  const scope = document.querySelector('.coach') ? null : sheet || document;
  if (!scope) return [];
  const navTop = sheet ? Infinity : (document.getElementById('nav').getBoundingClientRect().top || Infinity);
  const out = [];
  scope.querySelectorAll('button, a[href], [role="button"]').forEach((b) => {
    if (!sheet && b.closest('.sheet, .dialog')) return;
    const r = b.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
    if (!b.closest('#nav') && cy > navTop) return; // scrolled under the bottom bar
    const st = getComputedStyle(b);
    if (st.visibility === 'hidden' || st.pointerEvents === 'none' || b.closest('.toast')) return;
    const t = document.elementFromPoint(cx, cy);
    if (!t || !(b === t || b.contains(t) || (t.closest && t.closest('button, a') === b))) out.push((b.dataset.act || b.className || b.tagName) + ' ← ' + (t ? (t.id || String(t.className && t.className.baseVal != null ? 'svg' : t.className) || t.tagName) : 'nothing'));
  });
  return out;
};
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
  // the Android back button: on Chrome a close request (Esc on a computer), handled by the top layer's CloseWatcher
  const back = () => page.keyboard.press('Escape');
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
    await sleep(1500);
    // the first-run tour: close it so the next steps can tap freely
    for (let i = 0; i < 5 && (await page.$('.coach')); i++) { await page.click('.coach'); await sleep(350); }
  });
  await step('every button on the main screens can really be tapped', async () => {
    const bad = [];
    for (const tab of ['home', 'calendar', 'reports', 'settings']) { await ev((t) => App.go(t), tab); await sleep(450); bad.push(...(await ev(HIT)).map((x) => tab + ': ' + x)); }
    await ev(() => App.go('home')); await sleep(300);
    await page.click('#nav [data-act="add-menu"]'); await sleep(600);
    bad.push(...(await ev(HIT)).map((x) => '+menu: ' + x));
    const fits = await ev(() => [...document.querySelectorAll('.sheet .am-tile')].every((t) => t.getBoundingClientRect().bottom <= innerHeight));
    if (!fits) bad.push('+menu: a tile is below the screen edge');
    await closeAll();
    if (bad.length) throw new Error(bad.slice(0, 6).join(' | '));
  });
  await step('+ menu: the payslip tile opens the payslip sheet, even with a message on screen', async () => {
    await ev(() => UI.toast('המשמרת נשמרה', { label: 'ביטול', fn: () => {} }));
    await page.tap('#nav [data-act="add-menu"]'); await sleep(600);
    const b = await (await page.$('.sheet [data-act="payslip-new"]')).boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.85); await sleep(900);
    const t = await ev(() => [...document.querySelectorAll('.sheet.show h2')].map((x) => x.textContent).join('|'));
    await closeAll();
    if (!t.includes('תלוש')) throw new Error('opened: ' + t);
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
  // every section opens from its door, and back returns to the door (in two halves: 20 seconds per step)
  const doorsOpened = [];
  const openDoors = async (from, to) => {
    await closeAll(); await ev(() => App.go('settings')); await sleep(300);
    const cats = (await ev(() => [...document.querySelectorAll('[data-act="settings-cat"]')].map((b) => b.dataset.cat))).slice(from, to);
    for (const c of cats) {
      await ev((c) => document.querySelector(`[data-act="settings-cat"][data-cat="${c}"]`).click(), c); await sleep(400);
      const keys = await ev(() => [...document.querySelectorAll('.sheet.show [data-act="settings-open"]')].map((b) => b.dataset.k));
      for (const k of keys) {
        await ev((key) => document.querySelector(`.sheet.show [data-act="settings-open"][data-k="${key}"]`).click(), k); await sleep(380);
        await ev(() => { document.querySelectorAll('.dialog').forEach((d) => { if (d._resolve) d._resolve(null); d.remove(); }); UI.closeTop(); }); await sleep(320);
        if (!(await ev(() => !!document.querySelector('.sheet.show #set-cat-list')))) throw new Error('back did not return to the door after ' + k);
      }
      doorsOpened.push(...keys);
      await closeAll();
    }
  };
  await step('settings sections open from their doors (1/2)', () => openDoors(0, 4));
  await step('settings sections open from their doors (2/2)', async () => {
    await openDoors(4, 99);
    if (doorsOpened.length < 18 || new Set(doorsOpened).size !== doorsOpened.length) throw new Error('sections: ' + doorsOpened.join(','));
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
  // since 1.18 a "not legal" finding is shown where it belongs, never as a notification
  await step('youth law: found for a 16-year-old night shift, but not sent as a notification', async () => {
    await ev(async () => {
      const k = U.addDays(U.todayKey(), -3);
      await Store.apply([{ store: 'shifts', put: { kind: 'shift', employerId: Store.S.employers[0].id, roleId: App.roles()[0].id, status: 'done', start: U.toEpoch(k, '17:00'), end: U.toEpoch(k, '23:45'), breakMin: 0, breakPaid: true, items: [], splits: [] } }], null);
      await App.runInsights();
    });
    const st = await ev(() => ({ found: App.insights.alerts.some((a) => a.type === 'youth'), sent: Store.S.notifications.some((n) => n.type === 'youth') }));
    if (!st.found) throw new Error('the youth law finding is gone');
    if (st.sent) throw new Error('the youth law finding was sent as a notification');
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
    const moved = await ev(() => (document.getElementById('view') || {}).style.transform || '');
    if (moved && moved !== 'none' && moved !== '') throw new Error('page moved: ' + moved);
  });
  await step('pull to refresh: a swipe then a pull refreshes once and the page settles back', async () => {
    await ev(() => { window.__ptrN = 0; const o = App.refresh; App.refresh = function () { window.__ptrN++; return o.apply(this, arguments); }; App.go('home'); window.scrollTo(0, 0); });
    await sleep(400);
    const cdp = await page.createCDPSession();
    const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    // a sideways swipe first: Chrome may hand its last move to the next gesture late
    await t('touchStart', 200, 300); for (let i = 1; i <= 5; i++) await t('touchMove', 200 - i * 18, 302); await t('touchEnd');
    await sleep(200);
    await t('touchStart', 200, 220);
    const track = [];
    for (let i = 1; i <= 12; i++) { await t('touchMove', 200, 220 + i * 22); await sleep(16); track.push(await ev(() => { const m = getComputedStyle(document.getElementById('view')).transform; return m === 'none' ? 0 : +m.split(',')[5].replace(')', ''); })); }
    await t('touchEnd');
    for (let i = 1; i < track.length; i++) if (Math.abs(track[i] - track[i - 1]) > 30) throw new Error('page jumped: ' + track.map(Math.round).join(','));
    await sleep(3000);
    const r = await ev(() => ({ n: window.__ptrN, tf: document.getElementById('view').style.transform, tab: App.tab }));
    if (r.n !== 1) throw new Error('refreshed ' + r.n + ' times');
    if (r.tf) throw new Error('page left moved: ' + r.tf);
    if (r.tab !== 'home') throw new Error('navigated to ' + r.tab);
  });
  await step('pull to refresh survives a redraw mid-pull and a second finger', async () => {
    await ev(() => { App.go('home'); window.scrollTo(0, 0); }); await sleep(400);
    const cdp = await page.createCDPSession();
    const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await t('touchStart', [{ x: 200, y: 230, id: 1 }]);
    for (let i = 1; i <= 12; i++) { await t('touchMove', [{ x: 200, y: 230 + i * 22, id: 1 }]); await sleep(16); if (i === 3) await ev(() => App.rerender()); }
    await t('touchEnd', []);
    await sleep(3000);
    const a = await ev(() => document.getElementById('view').style.transform);
    if (a) throw new Error('after a redraw the page stayed moved: ' + a);
    await t('touchStart', [{ x: 200, y: 230, id: 1 }]);
    for (let i = 1; i <= 5; i++) { await t('touchMove', [{ x: 200, y: 230 + i * 20, id: 1 }]); await sleep(16); }
    await t('touchMove', [{ x: 200, y: 340, id: 1 }, { x: 300, y: 300, id: 2 }]); await sleep(16);
    await t('touchEnd', []);
    await sleep(800);
    const b = await ev(() => document.getElementById('view').style.transform);
    if (b) throw new Error('after a second finger the page stayed moved: ' + b);
  });
  await step('time picker: the wheels go round (23 → 00, 00 → 59)', async () => {
    await ev(() => { window.__t = undefined; UI.pickTime({ value: '23:00' }).then((v) => { window.__t = v; }); }); await sleep(500);
    await ev(() => { const [h, m] = document.querySelectorAll('.pk-wheel'); h.scrollTop += 44; m.scrollTop -= 44; }); await sleep(700);
    const shown = await ev(() => document.querySelector('.pk-clock').textContent.replace(/\s/g, ''));
    if (shown !== '00:59') throw new Error('shows ' + shown);
    const mid = await ev(() => [...document.querySelectorAll('.pk-wheel')].every((w) => Math.floor(Math.round(w.scrollTop / 44) / +w.dataset.n) === +w.dataset.mid));
    if (!mid) throw new Error('a wheel was not moved back to the middle');
    await ev(() => document.querySelector('[data-pk-ok]').click()); await sleep(300);
    if ((await ev(() => window.__t)) !== '00:59') throw new Error('result ' + (await ev(() => window.__t)));
  });
  await step('back button: closes only the top picker or question, never the app', async () => {
    await ev(() => { App.go('reports'); }); await sleep(300);
    await ev(() => document.querySelector('[data-act="rep-sub"][data-s="list"]').click()); await sleep(400);
    await ev(() => document.querySelector('.pk-field').click()); await sleep(400);
    await back(); await sleep(450);
    const s1 = await ev(() => ({ inApp: !!window.App, dialogs: document.querySelectorAll('.dialog').length, layers: UI.sheets.length }));
    if (!s1.inApp || s1.dialogs || s1.layers) throw new Error('page picker: ' + JSON.stringify(s1));
    await ev(() => App.sheetsApi.shiftEditor()); await sleep(600);
    await ev(() => document.querySelector('.sheet .pk-field.pk-date').click()); await sleep(400);
    await back(); await sleep(450);
    const s2 = await ev(() => ({ dialogs: document.querySelectorAll('.dialog').length, sheets: document.querySelectorAll('.sheet.show').length }));
    if (s2.dialogs !== 0 || s2.sheets !== 1) throw new Error('picker over a sheet: ' + JSON.stringify(s2));
    await ev(() => { UI.confirm('x', 'y'); }); await sleep(300);
    await back(); await sleep(450);
    const s3 = await ev(() => ({ dialogs: document.querySelectorAll('.dialog').length, sheets: document.querySelectorAll('.sheet.show').length }));
    if (s3.dialogs !== 0 || s3.sheets !== 1) throw new Error('question over a sheet: ' + JSON.stringify(s3));
    await closeAll(); await ev(() => App.go('home')); await sleep(300);
  });
  await step('back button: a screen the app opened by itself (shortcut, startup) closes alone, the app stays', async () => {
    // opened from code with no tap, like the add-shift shortcut: Chrome skips history entries made this way
    await ev(() => App.sheetsApi.shiftEditor()); await sleep(600);
    await back(); await sleep(450);
    const s = await ev(() => ({ inApp: !!window.App, sheets: document.querySelectorAll('.sheet.show').length, layers: UI.sheets.length, len: history.length }));
    if (!s.inApp || s.sheets || s.layers) throw new Error(JSON.stringify(s));
    // two layers: back closes only the top one each time
    await ev(() => App.sheetsApi.shiftEditor()); await sleep(600);
    await page.tap('.sheet .pk-field.pk-time'); await sleep(500);
    await back(); await sleep(450);
    const t = await ev(() => ({ picker: !!document.querySelector('.dialog.pk'), sheets: document.querySelectorAll('.sheet.show').length }));
    if (t.picker || t.sheets !== 1) throw new Error('picker then editor: ' + JSON.stringify(t));
    await back(); await sleep(450);
    if (await ev(() => document.querySelectorAll('.sheet.show').length)) throw new Error('editor still open');
  });
  await step('games: all five open, play a turn and stop when closed', async () => {
    await ev(() => App.actions.games()); await sleep(600);
    if (!(await ev(() => document.querySelectorAll('.gm-card').length === App.games.LIST.length && App.games.LIST.length === 5))) throw new Error('hub');
    await ev(() => document.querySelector('[data-game="coins"]').click()); await sleep(700);
    await ev(() => document.querySelector('[data-go]').click()); await sleep(2600);
    const t = await ev(() => +document.querySelector('[data-time]').textContent);
    if (!(t > 30 && t <= 40)) throw new Error('coin clock ' + t);
    await ev(() => UI.closeTop()); await sleep(500);
    if (await ev(() => !!document.querySelector('.cg'))) throw new Error('coin game still there');
    await ev(() => document.querySelector('[data-game="quiz"]').click()); await sleep(700);
    await ev(() => document.querySelector('.qz-opt').click()); await sleep(300);
    if (!(await ev(() => !!document.querySelector('.qz-opt.right')))) throw new Error('quiz answer');
    await ev(() => UI.closeTop()); await sleep(500);
    await ev(() => document.querySelector('[data-game="facts"]').click()); await sleep(700);
    await ev(() => document.querySelector('.tf-yes').click()); await sleep(300);
    if (!(await ev(() => !!document.querySelector('.tf-card.ok, .tf-card.no')))) throw new Error('facts answer');
    await ev(() => UI.closeTop()); await sleep(500);
    // pairs: a word and its meaning stay up together; two that don't belong turn back
    await ev(() => document.querySelector('[data-game="pairs"]').click()); await sleep(700);
    const pr = await ev(() => {
      const cs = [...document.querySelectorAll('.pr-card')]; const t = cs.map((c) => c.querySelector('.pr-face').textContent);
      const p = Games.PAIRS.find((x) => x.t === t[0] || x.d === t[0]); const j = t.indexOf(p.t === t[0] ? p.d : p.t);
      const wrong = t.findIndex((_, k) => k !== 0 && k !== j);
      return { n: cs.length, j, wrong };
    });
    if (pr.n !== 12 || pr.j < 1) throw new Error('pairs board ' + JSON.stringify(pr));
    await ev((w) => { const cs = document.querySelectorAll('.pr-card'); cs[0].click(); cs[w].click(); }, pr.wrong); await sleep(1200);
    if (await ev(() => document.querySelectorAll('.pr-card.up').length)) throw new Error('a wrong pair did not turn back');
    await ev((j) => { const cs = document.querySelectorAll('.pr-card'); cs[0].click(); cs[j].click(); }, pr.j); await sleep(300);
    if ((await ev(() => document.querySelectorAll('.pr-card.done').length)) !== 2) throw new Error('a right pair was not kept');
    await ev(() => UI.closeTop()); await sleep(500);
    // how many hours: the hidden price is revealed after an answer
    await ev(() => document.querySelector('[data-game="hours"]').click()); await sleep(700);
    if (!(await ev(() => !!document.querySelector('.hw-card.b .hw-q')))) throw new Error('second price not hidden');
    await ev(() => document.querySelector('.hw-more').click()); await sleep(400);
    if (!(await ev(() => !!document.querySelector('.hw-card.b.shown .hw-h')))) throw new Error('price not revealed');
    await closeAll();
  });
  await step('payslip check: a short summary that adds up, then the analysis', async () => {
    await ev(() => App.payslipVerify({ period: '2026-09', source: 'pdf', text: 'x', other: [], fields: { base: { value: 1600, qty: 40 }, travel: { value: 135.6 }, gross: { value: 1735.6 }, nationalInsurance: { value: 21.35 }, totalDeductions: { value: 21.35 }, net: { value: 1714.25 } } }));
    await sleep(700);
    const ok = await ev(() => [...document.querySelectorAll('.vf-chk')].map((c) => c.classList.contains('ok')));
    if (ok.length !== 2 || !ok.every(Boolean)) throw new Error('checks ' + JSON.stringify(ok));
    const wide = await ev(() => { const b = document.querySelector('.vf-sheet .sh-body'); return b.scrollWidth > b.clientWidth; });
    if (wide) throw new Error('wider than the screen');
    await ev(() => document.querySelector('[data-go]').click()); await sleep(900);
    if (await ev(() => !!document.querySelector('.vf-sheet'))) throw new Error('still on the check');
    await closeAll();
  });
  await step('monthly recap: a story of last month that the back button closes', async () => {
    const pk = await ev(() => U.addMonthKey(Engine.periodOf(U.todayKey(), Store.S.employers[0]).key, -1));
    const has = await ev((pk) => !!App.recap.dataFor(pk), pk);
    if (!has) return; // no work last month in this test's data: nothing to show
    await ev((pk) => App.recap.open(pk), pk); await sleep(600);
    const n = await ev(() => document.querySelectorAll('.story .st-bars i').length);
    if (n < 4) throw new Error('cards: ' + n);
    const txt = await ev(() => document.querySelector('.story').innerText);
    if (/NaN|undefined|Infinity/.test(txt)) throw new Error('broken text');
    await back(); await sleep(500);
    if (await ev(() => !!document.querySelector('.story') || UI.sheets.length > 0)) throw new Error('still open after back');
  });
  await step('medals: the collection opens and explains each one', async () => {
    await ev(() => App.actions.games()); await sleep(600);
    await ev(() => document.querySelector('[data-medals]').click()); await sleep(700);
    const n = await ev(() => document.querySelectorAll('.ach').length);
    if (n !== (await ev(() => App.achievements().length))) throw new Error('medals: ' + n);
    await closeAll();
  });
  await step('a damaged backup is refused or cleaned, never a broken app', async () => {
    const r1 = await ev(async () => { try { await Store.importBackup({ app: 'nope' }, 'merge'); return 'ok'; } catch (e) { return e.message; } });
    if (!/אינו גיבוי/.test(r1)) throw new Error('not refused: ' + r1);
    const r2 = await ev(async () => {
      const now = Date.now();
      try {
        await Store.importBackup({ app: 'shiftpay', shifts: [null, 'x', { id: 'bad', start: 'a', end: 1 }, { id: 'e2e-ok', kind: 'shift', employerId: Store.S.employers[0].id, roleId: Store.S.roles[0].id, status: 'done', start: now - 5 * 3600e3, end: now - 3600e3 }], roles: 'x', entries: [{ id: 'q', date: 'never' }] }, 'merge');
        return 'ok';
      } catch (e) { return e.message; }
    });
    if (r2 !== 'ok') throw new Error('clean import refused: ' + r2);
    const st = await ev(() => ({ bad: Store.S.shifts.some((s) => !s || s.id === 'bad'), ok: Store.S.shifts.some((s) => s.id === 'e2e-ok'), q: Store.S.entries.some((e) => e.id === 'q') }));
    if (st.bad || !st.ok || st.q) throw new Error('not cleaned: ' + JSON.stringify(st));
    for (const tab of ['home', 'calendar', 'reports', 'settings']) {
      await ev((t) => App.go(t), tab); await sleep(250);
      if (await ev(() => !!document.querySelector('.render-err'))) throw new Error(tab + ' failed to draw');
    }
    await ev(() => Store.apply([{ store: 'shifts', del: 'e2e-ok' }], 'x'));
    await ev(() => App.go('home'));
  });
  await step('saving up for something: set it, see it on home, remove it', async () => {
    await ev(() => Store.setSettings((s) => { s.saving = { name: 'אוזניות', price: 900, from: U.addDays(U.todayKey(), -30) }; }));
    await ev(() => { App.go('home'); App.render(); }); await sleep(400);
    const c = await ev(() => { const x = document.querySelector('.save-card'); return x ? x.innerText : ''; });
    if (!/אוזניות/.test(c) || !/%/.test(c)) throw new Error('card: ' + c);
    if (/NaN|undefined/.test(c)) throw new Error('broken numbers: ' + c);
    await ev(() => Store.setSettings((s) => { s.saving = { name: '', price: 0, from: '' }; }));
    await ev(() => App.render()); await sleep(200);
    if (await ev(() => !!document.querySelector('.save-card'))) throw new Error('still shown after removing');
  });
  await step('settings search finds sections by everyday words', async () => {
    await ev(() => App.go('settings')); await sleep(400);
    const find = (q) => ev((q) => { const i = document.getElementById('set-q'); i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); return [...new Set([...document.querySelectorAll('#set-res [data-act="settings-go"]:not(.prob)')].map((x) => x.dataset.k))].join(','); }, q);
    const a = await find('נסיעות'), b = await find('צבע'), c = await find('');
    if (!a.split(',').includes('pay')) throw new Error('travel: ' + a);
    if (b !== 'look') throw new Error('colour: ' + b);
    if (c !== '' || await ev(() => document.getElementById('set-home').hidden)) throw new Error('clear: ' + c);
    await ev(() => App.go('home'));
  });
  await step('no flicker: the time wheel, the dimming and the tap ring', async () => {
    await closeAll(); await ev(() => App.go('home')); await sleep(300);
    // the wheel is in place from the first frame, and the dimming fades in
    const first = await ev(() => { UI.pickTime({ value: '09:00' }); const w = document.querySelector('.dialog.pk .pk-wheel'); const bd = document.querySelector('.dialog.pk .backdrop'); return { on: !!w.querySelector('.pk-opt.on'), top: w.scrollTop, op: +getComputedStyle(bd).opacity }; });
    if (!first.on || first.top < 440) throw new Error('wheel not in place: ' + JSON.stringify(first));
    if (first.op > 0.5) throw new Error('dimming did not fade in: ' + first.op);
    // the card keeps its own layer (on Android one frame came out without its background when it lost it)
    const wc = await ev(() => getComputedStyle(document.querySelector('.dialog.pk .pk-card')).willChange);
    if (!/transform/.test(wc)) throw new Error('picker card lost will-change: ' + wc);
    // tapping OK: the tap ring goes as soon as the picker starts to close
    const ghost = await ev(() => new Promise((res) => {
      document.querySelector('.dialog.pk [data-pk-ok]').click();
      let n = 0, frames = 0;
      (function rec() { frames++; if (document.querySelector('.fx-ring') && document.querySelector('.dialog.pk.out')) n++; if (frames < 25) requestAnimationFrame(rec); else res(n); })();
    }));
    if (ghost > 1) throw new Error('tap ring left floating for ' + ghost + ' frames');
    // a redraw does not restart the pay card's glow
    const prog = () => ev(() => { const a = document.querySelector('.home-hero .aurora i').getAnimations()[0]; if (!a) return null; const c = a.effect.getComputedTiming(); return (c.currentIteration || 0) + (c.progress || 0); });
    await sleep(600);
    const p1 = await prog(); await ev(() => App.rerender()); const p2 = await prog();
    if (p1 != null && p2 != null && Math.abs(p2 - p1) > 0.02) throw new Error('glow restarted: ' + p1 + ' -> ' + p2);
  });
  await step('switching tabs: the bottom bar stays put, the page never gets wider than the screen or fades', async () => {
    // On a phone a page wider than the screen, even while the next tab slides in, zooms out a little:
    // the bottom bar dropped ~30px and flickered on every switch.
    await closeAll(); await ev(() => { App.go('home'); scrollTo(0, 0); }); await sleep(400);
    for (const tab of ['calendar', 'reports', 'settings', 'home', 'reports', 'calendar', 'home']) {
      const r = await ev((tab) => new Promise((res) => {
        const nav = document.getElementById('nav'); const top0 = nav.getBoundingClientRect().top; const h0 = innerHeight; const t0 = performance.now(); const bad = [];
        (function f() {
          const de = document.documentElement; const top = nav.getBoundingClientRect().top;
          const pv = document.querySelector('#view .view'); const op = pv ? +getComputedStyle(pv).opacity : 1;
          // and the new screen is never shown faded (it looked like a flash on home)
          if (Math.abs(top - top0) > 0.5 || innerHeight !== h0 || de.scrollWidth > de.clientWidth + 1 || op < 0.99) bad.push({ top: Math.round(top - top0), h: innerHeight - h0, w: de.scrollWidth - de.clientWidth, op });
          if (performance.now() - t0 < 450) requestAnimationFrame(f); else res(bad);
        })();
        document.querySelector(`.nav [data-tab="${tab}"]`).click();
      }), tab);
      if (r.length) throw new Error(`to ${tab}: ` + JSON.stringify(r[0]) + ` in ${r.length} frames`);
    }
  });
  await step('the nights the clocks change: the editor shows what is paid (9 h in October, 7 h in March)', async () => {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Jerusalem' });
    try {
      for (const [date, want, end8] of [['2026-10-24', '9:00', '05:00'], ['2026-03-26', '7:00', '07:00']]) {
        await closeAll(); await ev(() => App.sheetsApi.shiftEditor()); await sleep(600);
        const r = await ev((date) => {
          const set = (f, v) => { const i = document.querySelector(`.sheet [data-f="${f}"]`); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); };
          set('date', date); set('startT', '22:00'); set('endT', '06:00');
          const shown = document.querySelector('.sheet .dur-l').textContent;
          document.querySelector('.sheet [data-dur="8"]').click();
          return { shown, end8: document.querySelector('.sheet [data-f="endT"]').value };
        }, date);
        if (!r.shown.includes(want)) throw new Error(`${date}: editor shows "${r.shown}", paid ${want}`);
        if (r.end8 !== end8) throw new Error(`${date}: 8 hours from 22:00 should end at ${end8}, not ${r.end8}`);
      }
    } finally { await cdp.send('Emulation.setTimezoneOverride', { timezoneId: '' }).catch(() => {}); await closeAll(); }
  });
  await step('Shaati Plus: out of sight until set up; bought in Google Play or with a code from the web, the skins work', async () => {
    await closeAll(); await ev(() => App.go('settings')); await sleep(300);
    if (await ev(() => !!document.querySelector('[data-act="plus-open"]'))) throw new Error('Plus shown without Google Play');
    // a pretend Google Play: the product exists, the payment sheet pays at once
    await ev(async () => {
      window.__realPR = window.PaymentRequest;
      window.__pb = { owned: false };
      window.getDigitalGoodsService = async () => ({
        getDetails: async (ids) => ids.map((itemId) => ({ itemId, price: { currency: 'ILS', value: '14.90' } })),
        listPurchases: async () => (__pb.owned ? [{ itemId: Plus.SKU, purchaseToken: 't' }] : []),
      });
      window.PaymentRequest = class { async show() { __pb.owned = true; return { details: { purchaseToken: 't' }, complete: async () => {} }; } };
      await Plus.init(); App.go('settings');
    });
    await sleep(300);
    if (!/14\.90/.test(await ev(() => (document.querySelector('[data-act="plus-open"]') || {}).textContent || ''))) throw new Error('no Plus row with the price');
    await ev(() => App.actions['plus-open']()); await sleep(500);
    await ev(() => document.querySelector('.plus-sheet [data-plus-buy]').click()); await sleep(600);
    if (!(await ev(() => Plus.owned()))) throw new Error('not owned after paying');
    await ev(() => Plus.pickSkin('gold')); await sleep(200);
    if ((await ev(() => document.documentElement.dataset.skin)) !== 'gold') throw new Error('skin not applied');
    // the web: a purchase code from Lemon Squeezy (a pretend licence service), saved in the account
    await ev(async () => {
      delete window.getDigitalGoodsService; window.PaymentRequest = window.__realPR; Plus.available = false;
      await Store.setMeta({ plus: { active: false }, plusInst: null });
      PAY_CONFIG.lemon = { checkout: 'https://x.lemonsqueezy.com/buy/t', productId: 42, price: '₪14.90' };
      window.__realFetch = window.fetch;
      window.fetch = async (u, o) => (String(u).startsWith('https://api.lemonsqueezy.com/')
        ? new Response(JSON.stringify({ activated: true, valid: true, instance: { id: 'i1' }, meta: { product_id: 42 } }), { status: 200 }) : window.__realFetch(u, o));
    });
    if (!(await ev(() => Plus.webShop()))) throw new Error('web checkout not offered');
    if (!(await ev(() => Plus.redeem('GOOD-1111-2222-3333-444455556666')))) throw new Error('purchase code not accepted');
    if ((await ev(() => Plus.source())) !== 'web' || !(await ev(() => Store.S.settings.plusKey))) throw new Error('web purchase not saved in the account');
    // back to a plain phone
    await ev(async () => {
      window.fetch = window.__realFetch; PAY_CONFIG.lemon = { checkout: '', productId: 0, price: '' };
      await Store.setMeta({ plus: { active: false }, plusInst: null }); await Store.setSettings((s) => { s.skin = ''; s.plusKey = ''; }); App.applyTheme();
    });
    await closeAll(); await ev(() => App.go('home'));
  });
  await step('Shaati Plus: try it on the card, a free trial, then free allowances (analysis, exports; never the games)', async () => {
    await closeAll();
    await ev(async () => {
      window.__realPR = window.PaymentRequest;
      window.getDigitalGoodsService = async () => ({ getDetails: async (ids) => ids.map((itemId) => ({ itemId, price: { currency: 'ILS', value: '9.90' } })), listPurchases: async () => [] });
      await Plus.init(); App.go('home');
    });
    await sleep(400);
    await ev(() => document.querySelector('#view .home-hero .hh-skin').click()); await sleep(500);
    if (!(await ev(() => !!document.querySelector('.design-sheet .design-prev .hero-num')))) throw new Error('no preview of the user\'s card');
    await ev(() => document.querySelector('[data-pick="ocean"]').click());
    await ev(() => document.querySelector('[data-design-trial]').click()); await sleep(600);
    if (!(await ev(() => Plus.inTrial() && document.documentElement.dataset.skin === 'ocean' && Plus.left('game') === Infinity))) throw new Error('trial did not start');
    // the trial ends: the regular card, and the free allowances
    await ev(async () => { await Store.setMeta({ plusTrial: { from: 1, until: 2 }, plusUse: {} }); App.go('home'); }); await sleep(300);
    if (await ev(() => !!document.documentElement.dataset.skin)) throw new Error('skin kept after the trial');
    const an = await ev(() => { const r = []; for (let i = 0; i < 4; i++) r.push(Plus.use('analysis')); return r.join(); });
    if (an !== 'true,true,true,false' || !(await ev(() => !!document.querySelector('.limit-sheet')))) throw new Error('analysis allowance: ' + an);
    if (!(await ev(() => Plus.use('game') && Plus.left('game') === Infinity))) throw new Error('games must never be limited');
    await closeAll();
    const exp = await ev(() => { const r = []; for (let i = 0; i < 6; i++) r.push(Plus.use('export')); return r.join(); });
    if (exp !== 'true,true,true,true,true,false') throw new Error('exports allowance: ' + exp);
    // back to a plain phone: nothing can be bought, so no limits at all
    await ev(async () => {
      delete window.getDigitalGoodsService; window.PaymentRequest = window.__realPR; Plus.available = false;
      await Store.setMeta({ plusTrial: null, plusTrialEnd: null, plusUse: {}, plusWall: null, plusNudge: null }); await Store.setSettings((s) => { s.skin = ''; }); App.applyTheme();
    });
    if (!(await ev(() => Plus.use('analysis') && Plus.use('export') && Plus.left('analysis') === Infinity))) throw new Error('limits without a way to buy');
    await closeAll(); await ev(() => App.go('home'));
  });
  await step('champions table: join with a nickname, a game result lands on today\'s board, leaving deletes the row', async () => {
    await closeAll();
    const r = await ev(async () => {
      // a pretend Firestore with one other player (set with merge on leaf paths, like Firestore)
      const docs = new Map();
      const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
      const merge = (o, d) => { for (const [k, v] of Object.entries(d)) { if (v && typeof v === 'object' && Object.keys(v).length) { o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}; merge(o[k], v); } else o[k] = v; } return o; };
      const fs = {
        doc: (db, ...p) => ({ path: p.join('/') }), collection: (db, c) => ({ c }),
        getDoc: async (ref) => ({ exists: () => docs.has(ref.path), data: () => JSON.parse(JSON.stringify(docs.get(ref.path) || {})) }),
        setDoc: async (ref, d, o) => { docs.set(ref.path, o && o.merge ? merge(docs.get(ref.path) || {}, JSON.parse(JSON.stringify(d))) : d); },
        deleteDoc: async (ref) => { docs.delete(ref.path); },
        where: (f, op, v) => ({ f, op, v }), orderBy: (f) => ({ f, ord: 1 }), limit: (n) => ({ n }), query: (col, ...c) => ({ col, c }),
        getDocs: async (q) => {
          const w = q.c.filter((x) => x.op); const of = q.c.find((x) => x.ord).f;
          const rows = [...docs].filter(([p]) => p.startsWith('lb/')).filter(([, d]) => w.every((x) => { const v = get(d, x.f); return v != null && (x.op === '>=' ? v >= x.v : v < x.v); }))
            .filter(([, d]) => get(d, of) != null).sort((a, b) => get(b[1], of) - get(a[1], of));
          return { docs: rows.map(([p, d]) => ({ id: p.split('/')[1], data: () => d })) };
        },
      };
      window.__realCloud = { user: Cloud.user, sdk: Cloud.sdk };
      Cloud.user = { uid: 'me-e2e' }; Cloud.sdk = async () => ({ fs, db: {} });
      const LB = Leaderboard; const k = LB.keys(U.todayKey());
      docs.set('lb/other', { n: 'נמר מהיר 11', e: '🐯', t: 1, g: { coins: { d: LB.pack(k.d, 300), a: 300 } } });
      await Store.setSettings((s) => { s.lb = { on: true, n: 'בודק e2e', e: '🚀', bg: '' }; });
      Champions._reset();
      const first = await Champions.submit('coins', 200);
      const second = await Champions.submit('coins', 450);
      const mine = docs.get('lb/me-e2e');
      Champions.open('coins');
      await new Promise((x) => setTimeout(x, 600));
      const podium = [...document.querySelectorAll('.lb-pod .lb-n')].map((x) => x.textContent).join('|');
      UI.closeAll();
      await Champions.forget();
      const out = { first: first && first.rank, second: second && second.rank, n: mine && mine.n, d: mine && LB.scoreOf(mine.g.coins.d), podium, gone: !docs.has('lb/me-e2e'), on: Store.S.settings.lb.on };
      Cloud.user = __realCloud.user; Cloud.sdk = __realCloud.sdk; Champions._reset();
      return out;
    });
    if (r.first !== 2 || r.second !== 1) throw new Error('places: ' + JSON.stringify(r));
    if (r.n !== 'בודק e2e' || r.d !== 450) throw new Error('row: ' + JSON.stringify(r));
    if (!/נמר מהיר 11\|בודק e2e/.test(r.podium)) throw new Error('podium: ' + r.podium);
    if (!r.gone || r.on) throw new Error('leaving: ' + JSON.stringify(r));
    await closeAll();
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
        getDocsFromServer: async (c) => (c.path === 'stats' ? snap(rows.map((r, i) => ['dev' + i, r])) : c.path === 'admins' ? snap([['adminUid0123456789abcdef', { added: 1, by: 'x' }]]) : snap([['t1', { uid: 'u5', reason: 'bug', text: evil + ' does not work', status: 'open', created: 1, updated: Date.now(), last: 'user', seen: true, name: evil }]])),
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
      const sh = document.querySelector('.sheet .sh-body');
      if (!sh || !sh.querySelector('.admin')) return { err: 'dashboard did not render' };
      const inbox = !!sh.querySelector('[data-adm-ticket="t1"]');
      const kpis = [...sh.querySelectorAll('.kpi .v')].map((x) => x.textContent.trim());
      const imgs = sh.querySelectorAll('img').length;
      const input = sh.querySelector('#adm-uid');
      input.value = 'not valid!'; sh.querySelector('[data-adm-add]').click();
      await new Promise((r) => setTimeout(r, 200));
      const badWrites = writes.length;
      input.value = 'NewAdmin0123456789abcdefgh'; sh.querySelector('[data-adm-add]').click();
      await new Promise((r) => setTimeout(r, 300));
      return { kpis, imgs, xss: !!window.__xss, badWrites, writes, text: sh.innerText.includes('<img'), inbox };
    });
    await closeAll();
    await ev(() => { App.isAdmin = false; Cloud.user = null; Cloud._useSdk(null); App.go('home'); });
    if (res.err) throw new Error(res.err);
    if (res.imgs || res.xss) throw new Error('hostile record ran as HTML');
    if (!res.inbox) throw new Error('support request not in the admin inbox');
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
  await step('impossible dates are refused: a future "done" shift becomes planned, future sick day refused', async () => {
    await ev(() => App.sheetsApi.shiftEditor()); await sleep(700);
    await ev(() => { const el = document.querySelector('.sheet [data-f="date"]'); el.value = U.addDays(U.todayKey(), 2); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(300);
    // the date in the future switched it to "planned" by itself; force "done" to test the guard
    await ev(() => document.querySelector('.sheet [data-status="done"]').click()); await sleep(300);
    const before = await ev(() => Store.S.shifts.filter((s) => s.status === 'planned').length);
    await page.click('.sheet [data-save]'); await sleep(500);
    const asked = await ev(() => (document.querySelector('.dialog h3') || {}).textContent || '');
    await page.click('.dialog [data-i="1"]'); await sleep(900);
    const after = await ev(() => Store.S.shifts.filter((s) => s.status === 'planned').length);
    if (!asked.includes('עוד לא')) throw new Error('no question about a future shift: ' + asked);
    if (after !== before + 1) throw new Error('not saved as planned');
    await closeAll();
    await ev(() => App.sheetsApi.entryEditor(null, { kind: 'sick' })); await sleep(600);
    const max = await ev(() => document.getElementById('en-date').max);
    await ev(() => { const el = document.getElementById('en-date'); el.value = U.addDays(U.todayKey(), 3); }); await sleep(100);
    const n0 = await ev(() => Store.S.entries.length);
    await page.click('.sheet [data-save]'); await sleep(400);
    const n1 = await ev(() => Store.S.entries.length);
    await closeAll();
    if (max !== await ev(() => U.todayKey())) throw new Error('sick day date picker allows the future');
    if (n1 !== n0) throw new Error('a future sick day was saved');
  });
  await step('custom date and time pickers replace the system ones', async () => {
    await ev(() => App.sheetsApi.shiftEditor()); await sleep(700);
    if (!(await ev(() => document.querySelectorAll('.sheet .pk-field').length >= 3))) throw new Error('no picker buttons');
    await page.click('.sheet .pk-field.pk-date'); await sleep(500);
    const k = await ev(() => U.addDays(U.todayKey(), -1));
    await page.click('.pk-quick [data-k="' + k + '"]'); await sleep(500);
    const v = await ev(() => document.querySelector('.sheet [data-f="date"]').value);
    if (v !== k) throw new Error('date picker gave ' + v);
    await page.click('.sheet .pk-field.pk-time'); await sleep(500);
    await page.click('.pk-quick [data-t="12:00"]'); await sleep(500);
    const t = await ev(() => document.querySelector('.sheet [data-f="startT"]').value);
    if (t !== '12:00') throw new Error('time picker gave ' + t);
    const label = await ev(() => document.querySelector('.sheet .pk-field.pk-date').textContent);
    if (!label.includes('אתמול')) throw new Error('date button text: ' + label);
    await closeAll();
  });
  await step('help centre: search the questions, send a request (not signed in: needs an email)', async () => {
    await ev(() => { window.__tickets = []; Cloud._useSdk({ db: {}, fs: { collection: (db, ...p) => ({ path: p.join('/') }), addDoc: async (c, d) => { window.__tickets.push([c.path, d]); return { id: 'x' }; } } }); });
    await ev(() => App.actions.support()); await sleep(700);
    await ev(() => { const q = document.getElementById('sp-q'); q.value = 'תלוש'; q.dispatchEvent(new Event('input')); }); await sleep(200);
    const shown = await ev(() => [...document.querySelectorAll('.sp-f')].filter((d) => !d.hidden).length);
    if (!shown || shown > 4) throw new Error('search shows ' + shown);
    await page.click('[data-sp-new]'); await sleep(900);
    await page.click('[data-r="login"]'); await sleep(300);
    await page.type('#sp-text', 'לא מצליח להתחבר עם גוגל מהאינסטגרם');
    // without an email the button looks not ready, and a tap only says what is missing
    const paleNoMail = await ev(() => document.querySelector('[data-sp-send]').getAttribute('aria-disabled') === 'true');
    await page.click('[data-sp-send]'); await sleep(500);
    const disabledNoMail = paleNoMail && (await ev(() => window.__tickets.length === 0 && /אימייל/.test((document.querySelector('.toast') || {}).textContent || '')));
    await page.type('#sp-mail', 'kid@example.com'); await sleep(100);
    await page.click('[data-sp-send]'); await sleep(900);
    const t = await ev(() => window.__tickets);
    await ev(() => { document.querySelectorAll('.dialog').forEach((d) => { if (d._resolve) d._resolve(null); d.remove(); }); Cloud._useSdk(null); });
    await closeAll();
    if (!disabledNoMail) throw new Error('could send without an email');
    const d = t[0] && t[0][1];
    if (!d || t[0][0] !== 'tickets' || d.uid !== '' || d.email !== 'kid@example.com' || d.reason !== 'login' || d.status !== 'open' || d.last !== 'user') throw new Error('request: ' + JSON.stringify(t));
  });
  await step('demo data clears', async () => { await ev(() => App.demo.clear()); await sleep(800); });
  await step('delete-all (local) wipes', async () => { await ev(() => Store.wipe()); await sleep(300); if (await ev(() => Store.S.shifts.length)) throw new Error('not wiped'); });

  // brand-new users (sign-in set up, Google stubbed): the questions come first, sign-in at the end
  async function newUserPage() {
    const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/vibrate|favicon|ERR_|net::|Failed to fetch|dynamically imported/.test(m.text())) errors.push('console: ' + m.text()); });
    await p.setViewport({ width: 412, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await p.setRequestInterception(true);
    p.on('request', (r) => (r.url().startsWith('http://localhost:8783/') ? r.continue() : r.abort()));
    await p.evaluateOnNewDocument(() => {
      const stubs = {
        probe: async () => true,
        start: async () => null,
        sdkReady: () => true,
        signIn: () => { window.__signIn = (window.__signIn || 0) + 1; return Promise.resolve({ uid: 'newUser0123456789abcdef', displayName: 'Test', email: 'test@example.com' }); },
        connect: async (u) => { window.Cloud.user = u; window.Cloud.connected = true; window.__connected = u.uid; },
      };
      let C;
      Object.defineProperty(window, 'Cloud', { configurable: true, get: () => C, set: (v) => { C = v; for (const k of Object.keys(stubs)) Object.defineProperty(v, k, { configurable: true, get: () => stubs[k], set: () => {} }); } });
    });
    await p.goto('http://localhost:8783/?cloud=1', { waitUntil: 'load' });
    await p.waitForFunction(() => !document.getElementById('intro'), { timeout: 15000 });
    await p.waitForSelector('.ob-welcome', { timeout: 8000 });
    return { ctx, p, e: (fn, ...a) => p.evaluate(fn, ...a), shot: (n) => p.screenshot({ path: path.join(out, n + '.png') }).catch(() => {}) };
  }
  const N = await newUserPage();
  const p2 = N.p, e2 = N.e, shot = N.shot;
  await step('new user: welcome screen first, no sign-in wall', async () => {
    if (await e2(() => App.blocking !== 'onboarding')) throw new Error('sign-in screen shown before the questions');
    if (!(await p2.$('[data-have]'))) throw new Error('no "I already have an account"');
    const blocked = await e2(HIT); if (blocked.length) throw new Error('covered buttons: ' + blocked.join(' | '));
    await shot('ob-0');
  });
  await step('new user: fun questions with live previews, nothing filled in advance', async () => {
    await p2.click('[data-next]'); await sleep(450);
    if (!(await e2(() => App.legalAccepted()))) throw new Error('terms not accepted on start');
    if (await e2(() => document.getElementById('ob-name').value)) throw new Error('name pre-filled');
    await p2.type('#ob-name', 'נועה');
    await p2.click('[data-gender="f"]'); await sleep(700);
    if (!(await p2.$('#ob-birth'))) throw new Error('gender did not move on to the age question');
    await e2(() => { const b = document.getElementById('ob-birth'); b.value = U.addDays(U.todayKey(), -16 * 366); b.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(300);
    const age = await e2(() => document.getElementById('ob-live-age').textContent);
    if (!age.includes('27.94')) throw new Error('age preview: ' + age);
    if (await e2(() => document.getElementById('ob-birth').max > U.addDays(U.todayKey(), -365 * 12))) throw new Error('a birthday in the future is allowed');
    await shot('ob-age');
    await p2.click('[data-next]'); await sleep(450);
    if (await e2(() => document.querySelector('[data-jr="0"]').value)) throw new Error('hourly rate pre-filled');
    if (!(await e2(() => document.querySelector('[data-jr="0"]').placeholder === '27.94'))) throw new Error('suggested rate is not the youth minimum');
    await p2.click('[data-jobname="מלצרות"]'); await sleep(300);
    await e2(() => { const i = document.querySelector('[data-jr="0"]'); i.value = '50'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    if (!(await e2(() => document.getElementById('ob-live-roles').textContent.includes('400')))) throw new Error('pay preview did not react');
    await p2.click('[data-next]'); await sleep(450);
    await p2.click('[data-travel="yes"]'); await sleep(300);
    if (!(await e2(() => document.getElementById('ob-travel').placeholder === '16'))) throw new Error('travel suggestion is not 16');
    if (!(await e2(() => document.getElementById('ob-live-travel').textContent.includes('240')))) throw new Error('no travel preview');
    await p2.click('[data-next]'); await sleep(450);
    // the city: the place picker (search, then the first result), and the wizard moves on by itself
    await p2.click('[data-pick-city]'); await sleep(900);
    if (!(await p2.$('.sheet.show.pp-sheet'))) throw new Error('the place picker did not open');
    await p2.type('.sheet.show .pp-q', 'חיפה'); await sleep(300);
    await p2.click('.sheet.show .pp-res .pp-row'); await sleep(1600);
    if (await p2.$('.sheet.show.pp-sheet')) throw new Error('the place picker did not close');
    await p2.click('[data-start="months"]'); await sleep(900);
    if (!(await p2.$('.ob-google'))) throw new Error('no "save with Google" on the last step');
    const blocked = await e2(HIT); if (blocked.length) throw new Error('covered buttons: ' + blocked.join(' | '));
    await shot('ob-done');
  });
  await step('new user: save with Google signs in and opens the app', async () => {
    await p2.click('.ob-google'); await sleep(1500);
    const st = await e2(() => ({ signIn: window.__signIn, connected: window.__connected, onboarded: Store.S.settings.onboarded, blocking: App.blocking, roles: App.roles().map((r) => r.name + ':' + Engine.roleRate(r, U.todayKey())), birth: Store.S.settings.birthDate, city: Store.S.settings.rest.city, travel: Store.S.employers[0].travelPerDay, cp: Store.S.settings.tax.creditPoints, name: Store.S.settings.userName, start: Store.S.settings.startDate, hero: !!document.querySelector('.home-hero') }));
    if (st.signIn !== 1 || st.connected !== 'newUser0123456789abcdef') throw new Error('sign-in not done ' + JSON.stringify(st));
    if (!st.onboarded || st.blocking || !st.hero) throw new Error('not in the app ' + JSON.stringify(st));
    if (st.roles.join() !== 'מלצרות:50' || !st.birth || st.city !== 'חיפה' || st.travel !== 16 || st.cp !== 2.75 || st.name !== 'נועה' || !st.start) throw new Error('answers not saved ' + JSON.stringify(st));
    await shot('ob-home');
  });
  await step('new user: a short tour points at the main buttons, then the first-steps card', async () => {
    await p2.waitForSelector('.coach', { timeout: 4000 });
    for (let i = 0; i < 5 && (await p2.$('.coach')); i++) { await p2.click('.coach'); await sleep(350); }
    await sleep(400);
    if (await p2.$('.coach')) throw new Error('tour did not close');
    if (!(await p2.$('.card.guide'))) throw new Error('no first-steps card');
    const blocked = await e2(HIT); if (blocked.length) throw new Error('covered buttons: ' + blocked.join(' | '));
  });
  await N.ctx.close();
  await step('new user who skips every question gets the usual answers', async () => {
    const M = await newUserPage();
    await M.p.click('[data-next]'); await sleep(400);
    for (let i = 0; i < 6; i++) { await M.p.click('[data-skip]'); await sleep(350); }
    if (!(await M.p.$('.ob-google'))) throw new Error('skipping did not reach the end');
    await M.p.click('.ob-google'); await sleep(1400);
    const st = await M.e(() => ({ roles: App.roles().map((r) => r.name + ':' + Engine.roleRate(r, U.todayKey())), travel: Store.S.employers[0].travelPerDay, city: Store.S.settings.rest.city, birth: Store.S.settings.birthDate, start: Store.S.settings.startDate, onboarded: Store.S.settings.onboarded }));
    await M.ctx.close();
    if (st.roles.join() !== 'העבודה שלי:35.4' || st.travel !== 16 || st.city !== 'תל אביב-יפו' || st.birth !== null || st.start !== null || !st.onboarded) throw new Error('defaults: ' + JSON.stringify(st));
  });
  await step('Google popup blocked: a clear message and a second try works', async () => {
    const M = await newUserPage();
    await M.e(() => { let n = 0; Object.defineProperty(window.Cloud, 'signIn', { configurable: true, get: () => () => (++n === 1 ? Promise.reject(Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' })) : Promise.resolve({ uid: 'u9', email: 'x@example.com' })) }); });
    await M.p.click('[data-next]'); await sleep(400);
    for (let i = 0; i < 6; i++) { await M.p.click('[data-skip]'); await sleep(350); }
    await M.p.click('.ob-google'); await sleep(600);
    const msg = await M.e(() => (document.querySelector('.ob-done .banner') || {}).textContent || '');
    const redirect = !!(await M.p.$('[data-redirect]'));
    await M.p.click('.ob-google'); await sleep(1200);
    const inApp = await M.e(() => !App.blocking && !!document.querySelector('.home-hero'));
    await M.ctx.close();
    if (!msg.includes('חסם')) throw new Error('message: ' + msg);
    if (!redirect) throw new Error('no other way offered');
    if (!inApp) throw new Error('second try did not get in');
  });
  await step('the questions keep working when the phone storage fails', async () => {
    const M = await newUserPage();
    // every IndexedDB write from now on fails, like the iPhone "Indexed Database server lost" error
    await M.e(() => { const orig = IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction = function (s, m) { if (m === 'readwrite') throw new DOMException('Connection to Indexed Database server lost', 'UnknownError'); return orig.call(this, s, m); }; });
    await M.p.click('[data-next]'); await sleep(450);
    const moved = await M.e(() => !!document.getElementById('ob-name'));
    for (let i = 0; i < 6; i++) { await M.p.click('[data-skip]'); await sleep(350); }
    await M.p.click('.ob-google'); await sleep(2500);
    const st = await M.e(() => ({ blocking: App.blocking, hero: !!document.querySelector('.home-hero'), onboarded: Store.S.settings.onboarded, banner: (document.querySelector('.banner') || {}).textContent || '' }));
    await M.ctx.close();
    if (!moved) throw new Error('the first button did nothing');
    if (st.blocking || !st.hero || !st.onboarded) throw new Error('stuck: ' + JSON.stringify(st));
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
