// The opening show of a returning user from the app icon, on a slowed CPU (a mid Android phone, and a slow one): the
// show, its quick actions, then "כניסה" and the home screen. Needs: npm i --no-save puppeteer-core; CHROME_PATH if
// Chrome is elsewhere.
//   node tests/e2e/opening.js <docsDir> [cpu slowdowns, 6,10] [runs at each, 3] [frames dir: the first run's frames]
//
// What it guards (the user, 6 Nov 2026: "a small stutter in the opening, up to the quick actions screen"):
//  1. Nothing the show looks like changes while it plays. The app's look (effects on or off, theme, colour, text size,
//     font, hidden amounts) was set by App.applyTheme in the middle of the start-up, under the show: body.fx came on
//     there, so every living part of the show's sky (clouds, birds, wings, stars, the moon's halo, leaves, rain) stood
//     still until then and jumped into place at once, half a second into the logo's glide. A text size or font of
//     one's own, or a theme other than the phone's, changed the show's header or sheet there too. The look kept on the
//     phone (app.js paintLook) is put on before the show's first frame, and the start-up writes the same values again.
//  2. The quick actions ride up with the sheet. They were drawn in the same long piece of work as the home screen
//     under the show, so they came only when all of it was done: on a slow phone after the sheet had risen, empty, and
//     stopped. Now they are drawn first, in a frame of their own, and come in as the sheet starts to rise.
//  3. The show moves on its own while the start-up runs under it: compositor frames keep coming (screencast).
//  4. Numbers for the record: long tasks, the main thread's late frames, the compositor's frames.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');
const SvgMoves = require('./svg-moves.js');
const docs = process.argv[2] || 'docs';
// NEXT_DOCS=<dir>: the measured opens are served from another build (a newer version): the app opens its kept copy and
// the service worker installs the new one behind the show, as on a phone the day after a release
let served = docs;
const SLOWS = String(process.argv[3] || '6,10').split(',').map(Number).filter(Boolean);
const RUNS = +process.argv[4] || 3;
const FRAMES = process.argv[5];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(served, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (/index(\.[a-z]{2})?\.html$/.test(file)) {
    // no cloud; the page's own policy kept, its inline scripts signed again
    let h = body.toString('utf8').replace('window.FIREBASE_CONFIG = {', 'window.__NO_CLOUD = {');
    const hashes = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => "'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
    if (hashes.length) h = h.replace(/'sha256-[A-Za-z0-9+/=]+'(?: 'sha256-[A-Za-z0-9+/=]+')*/, hashes.join(' '));
    body = Buffer.from(h);
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info) => { results.push(!!ok); console.log((ok ? 'ok ' : 'X ') + name + (info ? '  (' + info + ')' : '')); };

(async () => {
  await new Promise((r) => server.listen(8786, r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  // this PC may report reduced motion (a Windows setting): the show is seen as a phone shows it
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'prefers-color-scheme', value: 'light' }]);
  await page.evaluateOnNewDocument(() => { try { if (!localStorage.getItem('shaati.lang')) localStorage.setItem('shaati.lang', 'he'); } catch (e) { /* none */ } });
  // a returning user: the demo's months of shifts
  // TWA=1: opened as the Android app opens it (its start address), which never waits for the server's answer
  await page.goto('http://localhost:8786/' + (process.env.TWA ? '?source=twa' : ''), { waitUntil: 'load' });
  await page.waitForSelector('#lg-ok', { timeout: 20000 });
  await page.waitForFunction(() => !document.getElementById('intro'), { timeout: 20000 });
  await page.evaluate(() => document.getElementById('lg-ok').click()); await sleep(100);
  await page.click('#lg-go'); await page.waitForSelector('[data-demo]');
  await page.click('[data-demo]'); await sleep(2500); await page.click('[data-save]'); await sleep(2500);
  await page.evaluate(() => { document.querySelectorAll('.coach').forEach((x) => x.remove()); UI.closeAll(); });
  await sleep(700);

  const svgSeen = await SvgMoves.attach(page);
  // what the page sees from its first moment: frames, long tasks, the show's classes, and every change to the look of
  // <html> and <body>
  await page.evaluateOnNewDocument(() => {
    const W = window; W.__o = { rafs: [], lt: [], look: [], marks: {}, cls: {} };
    const mark = (k, t) => { if (W.__o.marks[k] == null) W.__o.marks[k] = Math.round(t); };
    const loop = (t) => {
      W.__o.rafs.push(t);
      const el = document.getElementById('intro');
      // the moment this frame's callbacks run, not the frame's start (t): a change made by the task just before this
      // frame (the same code that started the show) is in this frame too
      const now = performance.now();
      if (el && el.classList.contains('play')) {
        if (W.__o.marks.play == null) W.__o.fxAtPlay = !!(document.body && document.body.classList.contains('fx'));
        mark('play', now);
        // the sheet's rise by its own clock: its animation's start and delay (styles.css #intro.play .intro-sheet)
        if (W.__o.rise == null) { try { const a = el.querySelector('.intro-sheet').getAnimations().find((x) => x.animationName === 'i-sheet'); if (a && a.startTime != null) W.__o.rise = a.startTime + a.effect.getTiming().delay; } catch (e) { /* none */ } }
      }
      if (el && (el.classList.contains('q-in') || el.classList.contains('q-on'))) {
        if (W.__o.marks.qin == null) { const iq = el.querySelector('.iq'); W.__o.iqWait = iq ? parseFloat(iq.style.getPropertyValue('--iq-wait')) || 0 : 0; }
        mark('qin', now);
      }
      if (el && el.classList.contains('q-on')) mark('qon', now);
      if (el && el.classList.contains('out')) mark('out', now);
      if (!el && document.body && document.readyState !== 'loading') mark('gone', now);
      if (t < 15000) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) W.__o.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* none */ }
    // the look: classes, data-* and inline style (custom properties) of <html> and <body>. Values compared, not writes
    const snap = (n) => n ? [n.className, JSON.stringify(Object.assign({}, n.dataset)), n.getAttribute('style') || ''].join(' | ') : '';
    let last = { html: '', body: '' };
    const look = () => {
      const now = { html: snap(document.documentElement), body: snap(document.body) };
      for (const k of ['html', 'body']) if (now[k] !== last[k]) { W.__o.look.push([Math.round(performance.now()), k, last[k], now[k]]); }
      last = now;
    };
    const mo = new MutationObserver(look);
    // the moment the show's classes are set (play; q-in, the quick actions' entrance; q-on), in the very task that sets them
    const mi = new MutationObserver(() => {
      const el = document.getElementById('intro');
      if (!el) return;
      for (const c of ['play', 'q-in', 'q-on']) if (el.classList.contains(c) && W.__o.cls[c] == null) W.__o.cls[c] = performance.now();
    });
    // from the moment <html> exists (this runs before it), <body> and the show once they are there
    let onHtml = false, onBody = false, onIntro = false;
    const watch = () => {
      if (!onHtml && document.documentElement) { onHtml = true; mo.observe(document.documentElement, { attributes: true, childList: true }); }
      if (!onBody && document.body) { onBody = true; mo.observe(document.body, { attributes: true }); }
      const el = document.getElementById('intro');
      if (!onIntro && el) { onIntro = true; mi.observe(el, { attributes: true, attributeFilter: ['class'] }); }
      look();
    };
    const early = new MutationObserver(() => { watch(); if (onHtml && onBody && onIntro) early.disconnect(); });
    early.observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', watch);
  });

  if (process.env.NEXT_DOCS) served = process.env.NEXT_DOCS;
  const cdp = await page.createCDPSession();
  const runs = [];
  for (const SLOW of SLOWS) {
    for (let run = 0; run < RUNS; run++) {
      await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) { /* none */ } }); // a new session: the full show
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOW });
      const frames = [];
      const onFrame = (f) => { frames.push({ ts: f.metadata.timestamp, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); };
      cdp.on('Page.screencastFrame', onFrame);
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 40, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => window.__o && (window.__o.marks.qon != null || window.__o.marks.gone != null), { timeout: 30000 }).catch(() => {});
      await sleep(1500);
      // into the app from the quick actions
      await page.evaluate(() => { const b = document.querySelector('#intro [data-q="enter"]'); if (b) b.click(); });
      await page.waitForFunction(() => window.__o.marks.gone != null, { timeout: 15000 }).catch(() => {});
      await sleep(600);
      await cdp.send('Page.stopScreencast');
      cdp.off('Page.screencastFrame', onFrame);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const o = await page.evaluate(() => Object.assign({}, window.__o, { to: performance.timeOrigin, fx: document.body.classList.contains('fx') }));
      const play = o.marks.play, playSet = o.cls.play || play;
      // the sheet starts to rise 0.4 s after 'play' (styles.css #intro.play .intro-sheet); the quick actions come in at the
      // later of: the first frame that shows them on, and the moment they were put on plus their wait (--iq-wait)
      const rise = o.rise != null ? o.rise : playSet + 400;
      const iqSet = o.cls['q-in'] || o.cls['q-on'] || o.marks.qin;
      const iqIn = o.marks.qin != null ? Math.max(o.marks.qin, iqSet + (o.iqWait || 0)) : Infinity;
      const end = play + 1500; // the show, its sheet risen
      // the look changed under the show, once it moved: the language doors' classes (a first open) are not a look
      const changed = o.look.filter(([t]) => t > play && t < (o.marks.gone || 1e9))
        .map(([t, k, a, b]) => [t, k, a.replace(/\blp-\S+/g, '').replace(/\s+/g, ' '), b.replace(/\blp-\S+/g, '').replace(/\s+/g, ' ')])
        .filter(([, , a, b]) => a !== b);
      const gaps = []; for (let i = 1; i < o.rafs.length; i++) { const g = o.rafs[i] - o.rafs[i - 1]; if (o.rafs[i] > play && o.rafs[i - 1] < end && g > 34) gaps.push(Math.round(g)); }
      const lt = o.lt.filter(([s, d]) => s + d > play && s < end);
      // the compositor's frames while the show moves (0.3 s after 'play' to its sheet's end); the largest gap between two
      const fts = frames.map((f) => f.ts * 1000 - o.to).filter((t) => t > play + 300 && t < play + 1500);
      let fgap = 0; for (let i = 1; i < fts.length; i++) fgap = Math.max(fgap, fts[i] - fts[i - 1]);
      const r = {
        slow: SLOW, play, fxAtPlay: o.fxAtPlay, fx: o.fx, changed, late: Math.round(iqIn - rise), home: o.marks.gone,
        lt: lt.map(([s, d]) => `${s - play}+${d}`).join(' ') || 'none', ltMax: Math.max(0, ...lt.map(([, d]) => d)),
        lost: Math.round(gaps.reduce((s, g) => s + g - 16.7, 0)), worst: Math.max(0, ...gaps), frames: fts.length, fgap: Math.round(fgap),
      };
      runs.push(r);
      console.log(`x${SLOW} run ${run}: show moves at ${play}ms · quick actions come in ${r.late >= 0 ? r.late + 'ms after' : -r.late + 'ms before'} the sheet starts to rise · long tasks under the show (from its start+ms): ${r.lt} · main thread: ${r.lost}ms of late frames, worst ${r.worst}ms · compositor: ${r.frames} frames, worst gap ${r.fgap}ms · look changes under the show: ${changed.length}`);
      for (const [t, k, a, b] of changed) console.log(`     +${t - play}ms <${k}> "${a}" -> "${b}"`);
      if (FRAMES && runs.length === 1) {
        fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });
        frames.forEach((f, i) => fs.writeFileSync(path.join(FRAMES, String(i).padStart(3, '0') + '_' + Math.round(f.ts * 1000 - o.to - play) + 'ms.jpg'), Buffer.from(f.data, 'base64')));
      }
    }
  }
  const per = (f) => runs.map((r) => 'x' + r.slow + ':' + f(r)).join(' ');
  console.log('');
  check('the show starts with the sky alive (effects on before its first frame)', runs.every((r) => !r.fx || r.fxAtPlay), per((r) => r.fxAtPlay));
  check('nothing of the look changes under the moving show (no class, theme, colour, size or font set mid-way)', runs.every((r) => r.changed.length === 0), per((r) => r.changed.length));
  // the sheet rises in 0.56 s; the actions on it within the first part of that, not after it stopped
  check('the quick actions ride up with the sheet (in at most 150ms after it starts to rise)', runs.every((r) => r.late <= 150), per((r) => r.late + 'ms'));
  const svgMoves = svgSeen();
  check('nothing in the show or on home moves as an SVG element (on the phone those stop while the app starts: no compositor runs them)', svgMoves.length === 0, svgMoves.join(', ') || 'none');
  check('the show keeps moving while the app starts under it (compositor frames, worst gap under 100ms)', runs.every((r) => r.frames > 30 && r.fgap < 100), per((r) => r.fgap + 'ms'));
  console.log(results.every(Boolean) ? '\nall good' : '\nPROBLEMS', 'errors:', errs.length ? errs.slice(0, 6) : 'none');
  await browser.close(); server.close();
  process.exitCode = results.every(Boolean) && !errs.length ? 0 : 1;
})().catch((e) => { console.error(e); process.exit(1); });
