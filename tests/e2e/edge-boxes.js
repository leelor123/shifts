// Edge boxes. An opaque strip (a sticky or fixed bar, its ::before/::after, or a fade painted with the page's colour)
// that ends inside the app's column while what lies beside it is another colour reads as a dark box with lighter sides.
// The user caught it on the last setup screen (6 Nov 2026): the fade under "כניסה לאפליקציה" spanned the wizard's
// content box (16px in from each side) over a background of blurred colour blobs that covers the whole screen.
// The rule every screen keeps:
//   1. a strip's side edges sit on the column's edges (#app, 600px at most) or on the screen's edges;
//   2. the pixels just inside and just outside each side edge that is not the screen's edge match in colour.
// Strips are found by their computed style, so a new bar or fade is checked the day it appears.
//   const Edge = require('./edge-boxes.js'); const bad = await Edge.check(page);   // [] when clean
//   node tests/e2e/edge-boxes.js <docsDir> [outDir]   every main screen at 320/360/412/700/1024, light and dark, he/en/ar,
//                                                     and the website's pages (site/) at the same widths
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------- in the page: the strips and where their sides are ----------------
const FIND = () => {
  const W = innerWidth, H = innerHeight;
  const col = (() => { const a = document.getElementById('app') || document.querySelector('main') || document.body; const r = a.getBoundingClientRect(); return { l: Math.max(0, r.left), r: Math.min(W, r.right) }; })();
  const alphaOf = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return c === 'transparent' ? 0 : 1; const p = m[1].split(/[\s,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const colours = (img) => (img || '').match(/rgba?\([^)]+\)|transparent/g) || [];
  const opaque = (st) => {
    if (alphaOf(st.backgroundColor) >= 0.85) return 'colour';
    const img = st.backgroundImage;
    if (img && img !== 'none' && /gradient/.test(img) && colours(img).some((c) => alphaOf(c) >= 0.85)) return colours(img).some((c) => alphaOf(c) < 0.15) ? 'fade' : 'gradient';
    return '';
  };
  const round = (st) => ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'].some((k) => parseFloat(st[k]) > 2);
  const hidden = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return true; } return false; };
  const label = (el, ps) => { const c = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''; return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + c + (ps || ''); };
  // the containing block of an absolutely positioned box
  const cbOf = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.position !== 'static' || s.transform !== 'none' || s.contain.includes('layout') || s.contain.includes('paint')) return e; }
    return null;
  };
  // what an overflow clip (the column's overflow-x: clip, a sheet's scroll box) leaves of a box
  const clipX = (el, r, fixed) => {
    let l = r.left, rr = r.right;
    if (!fixed) for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const s = getComputedStyle(e); if (s.overflowX === 'visible') continue;
      const b = e.getBoundingClientRect(); l = Math.max(l, b.left + e.clientLeft); rr = Math.min(rr, b.left + e.clientLeft + e.clientWidth);
    }
    return { l: Math.max(0, l), r: Math.min(W, rr) };
  };
  const out = [];
  const consider = (el, ps, st, rect, fixed) => {
    const kind = opaque(st); if (!kind) return;
    if (round(st)) return; // a card, a sheet, a pill floats on purpose: rounded corners, not a strip
    if (rect.width < 2 || rect.height < 2 || rect.bottom <= 0 || rect.top >= H) return;
    const x = clipX(el, rect, fixed);
    if (x.r - x.l < 0.4 * (col.r - col.l)) return; // a small thing (a dot, a coin), not a strip
    out.push({ name: label(el, ps), kind, l: x.l, r: x.r, t: Math.max(0, rect.top), b: Math.min(H, rect.bottom), col, W });
  };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const st = getComputedStyle(el);
    if (st.display === 'none') continue;
    const pinned = st.position === 'fixed' || st.position === 'sticky';
    const pseudos = ['::before', '::after'].map((p) => [p, getComputedStyle(el, p)]).filter(([, s]) => s.content !== 'none' && s.display !== 'none');
    if (!pinned && !pseudos.length && st.position !== 'absolute') continue;
    if (hidden(el)) continue;
    const r = el.getBoundingClientRect();
    if (pinned) consider(el, '', st, r, st.position === 'fixed');
    else if (st.position === 'absolute' && opaque(st) === 'fade') consider(el, '', st, r, false); // a fade, wherever it is
    for (const [p, s] of pseudos) {
      if (s.position !== 'absolute' && s.position !== 'fixed') continue;
      const kind = opaque(s); if (!kind) continue;
      if (!pinned && kind !== 'fade') continue; // the pseudo of a pinned bar, or any fade
      // the pseudo's box from its containing block's padding box and its used insets (getComputedStyle gives px)
      const cb = s.position === 'fixed' ? null : cbOf(el);
      const box = cb ? (() => { const b = cb.getBoundingClientRect(); return { left: b.left + cb.clientLeft, top: b.top + cb.clientTop, width: cb.clientWidth, height: cb.clientHeight }; })() : { left: 0, top: 0, width: W, height: H };
      const px = (v) => (v === 'auto' ? null : parseFloat(v));
      let L = px(s.left), R = px(s.right), T = px(s.top), B = px(s.bottom);
      const w = parseFloat(s.width), h = parseFloat(s.height);
      if (L == null && R == null) L = 0;
      if (T == null && B == null) T = 0;
      const left = L != null ? box.left + L : box.left + box.width - R - w;
      const top = T != null ? box.top + T : box.top + box.height - B - h;
      consider(el, p, s, { left, top, width: w, height: h, right: left + w, bottom: top + h }, s.position === 'fixed' || !!(cb && getComputedStyle(cb).position === 'fixed'));
    }
  }
  return out;
};

// ---------------- the screenshot's pixels ----------------
function decodePng(buf) {
  let p = 8, w = 0, h = 0, type = 6, depth = 8; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), tag = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (tag === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; }
    if (tag === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2)) throw new Error('png type ' + type + '/' + depth);
  const bpp = type === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = x >= bpp && y ? px[o - stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  return { w, h, at: (x, y) => { x = Math.max(0, Math.min(w - 1, Math.round(x))); y = Math.max(0, Math.min(h - 1, Math.round(y))); const i = y * stride + x * bpp; return [px[i], px[i + 1], px[i + 2]]; } };
}
const JUMP = 10; // colour steps (0-255 on any channel) a side edge may show; a box edge shows 20 and more

// check(page) → a list of problems on the screen as it is now ([] when clean)
async function check(page, where) {
  const strips = await page.evaluate(FIND);
  if (!strips.length) return [];
  const dpr = await page.evaluate(() => devicePixelRatio);
  const img = decodePng(await page.screenshot({ type: 'png', captureBeyondViewport: false }));
  const bad = [];
  for (const s of strips) {
    for (const side of ['l', 'r']) {
      const x = s[side];
      if (side === 'l' ? x <= 1 : x >= s.W - 1) continue; // the screen's edge: nothing beside it
      const onCol = Math.abs(x - s.col[side]) <= 1.5;
      // the pixels: 3px in and 3px out of the edge, at five heights inside the strip
      let worst = 0, at = null;
      for (const f of [0.15, 0.3, 0.5, 0.7, 0.9]) {
        const y = s.t + (s.b - s.t) * f;
        const i = img.at((side === 'l' ? x + 3 : x - 3) * dpr, y * dpr), o = img.at((side === 'l' ? x - 3 : x + 3) * dpr, y * dpr);
        const d = Math.max(Math.abs(i[0] - o[0]), Math.abs(i[1] - o[1]), Math.abs(i[2] - o[2]));
        if (d > worst) { worst = d; at = { y: Math.round(y), inside: i, outside: o }; }
      }
      if (!onCol || worst > JUMP) bad.push({ where, name: s.name, kind: s.kind, side: side === 'l' ? 'left' : 'right', edge: Math.round(x), column: [Math.round(s.col.l), Math.round(s.col.r)], jump: worst, at, top: Math.round(s.t), bottom: Math.round(s.b), why: !onCol ? 'ends inside the column' : 'colour jumps at its side' });
    }
  }
  return bad;
}

module.exports = { check, FIND, decodePng, JUMP };

// ---------------- the walk: node tests/e2e/edge-boxes.js <docsDir> [outDir] ----------------
if (require.main === module) (async () => {
  const puppeteer = require('puppeteer-core');
  const docs = path.resolve(process.argv[2] || 'docs'), out = process.argv[3] || path.join(__dirname, 'out', 'edge-boxes');
  const site = path.resolve(__dirname, '..', '..', 'site');
  const PORT = +(process.env.EDGE_PORT || 8791);
  fs.mkdirSync(out, { recursive: true });
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname); let root = docs;
    if (p.startsWith('/site/')) { root = site; p = p.slice(5); }
    const file = path.join(root, p === '/' ? 'index.html' : p);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    let body = fs.readFileSync(file);
    if (/index(\.\w\w)?\.html$/.test(file) && root === docs && !/cloud=1/.test(req.url)) body = Buffer.from(body.toString('utf8').replace('window.FIREBASE_CONFIG = {', 'window.__NO_CLOUD = {').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ''));
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars', '--mute-audio'] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const WIDTHS = (process.env.EDGE_WIDTHS || '320,360,412,700,1024').split(',').map(Number);
  const LANGS = (process.env.EDGE_LANGS || 'he,en,ar').split(',');
  const THEMES = (process.env.EDGE_THEMES || 'light,dark').split(',');
  const problems = [], errors = [];
  let checks = 0;
  const seen = new Set();
  const look = async (page, where, tag) => {
    await sleep(80);
    const bad = await check(page, where);
    checks++;
    for (const b of bad) {
      b.tag = tag;
      const key = b.where + '|' + b.name + '|' + b.side + '|' + tag;
      if (seen.has(key)) continue; seen.add(key);
      problems.push(b);
      const file = path.join(out, (tag + '-' + b.where + '-' + b.name).replace(/[^\w.-]+/g, '_').slice(0, 140) + '.png');
      if (!fs.existsSync(file)) await page.screenshot({ path: file }).catch(() => {});
    }
  };
  const fresh = async (lang, theme, w) => {
    const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
    const page = await ctx.newPage();
    await require('./quiet.js').quiet(page);
    page.on('pageerror', (e) => errors.push(lang + ' ' + w + ': ' + e.message));
    page.on('dialog', (d) => d.dismiss());
    await page.setViewport({ width: w, height: w > 600 ? 820 : 760, deviceScaleFactor: 1, isMobile: w <= 600, hasTouch: w <= 600 });
    // still frames: the motion is not what this checks, and a fade caught half way is not a box
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('http://localhost:' + PORT + '/') ? r.continue() : r.abort()));
    return { ctx, page, ev: (fn, ...a) => page.evaluate(fn, ...a) };
  };
  const pageFile = (lang) => (lang === 'he' ? 'index.html' : 'index.' + lang + '.html');
  const pickLang = async (page, ev, lang) => {
    if (await page.waitForSelector('.lp-host.in', { timeout: 6000 }).then(() => true).catch(() => false)) {
      await ev((l) => { const c = document.querySelector(`.lp-card[data-lang="${l}"]`) || document.querySelector('.lp-card'); c.click(); }, lang);
      await page.waitForFunction(() => !document.querySelector('.lp-host'), { timeout: 8000 }).catch(() => {});
      return true;
    }
    return false;
  };
  // a new user: the language doors, the welcome screen, every question
  // sign-in is set up (Google stubbed), as for a real new user: the questions come first
  const stubCloud = (page) => page.evaluateOnNewDocument(() => {
    const stubs = { probe: async () => true, start: async () => null, sdkReady: () => true, signIn: () => Promise.resolve({ uid: 'edgeUser0123456789abcdef', displayName: 'T', email: 't@example.com' }), connect: async (u) => { window.Cloud.user = u; window.Cloud.connected = true; } };
    let C; Object.defineProperty(window, 'Cloud', { configurable: true, get: () => C, set: (v) => { C = v; for (const k of Object.keys(stubs)) Object.defineProperty(v, k, { configurable: true, get: () => stubs[k], set: () => {} }); } });
  });
  async function newUser(lang, theme, w) {
    const { ctx, page, ev } = await fresh(lang, theme, w);
    const tag = `${lang}-${theme}-${w}`;
    try {
      await stubCloud(page);
      await page.goto(`http://localhost:${PORT}/${pageFile(lang)}?cloud=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => !document.getElementById('intro'), { timeout: 15000 });
      if (await page.$('.lp-host.in')) await look(page, 'language doors', tag);
      await pickLang(page, ev, lang);
      await page.waitForSelector('.skyscreen.step-hi', { timeout: 8000 });
      await sleep(400); await look(page, 'welcome', tag);
      await page.click('[data-next]'); await sleep(500);
      for (let i = 0; i < 9; i++) {
        const k = await ev(() => (document.querySelector('.wizard.ob') || {}).className || '');
        const name = 'question ' + ((/step-(\w+)/.exec(k) || [])[1] || i);
        await look(page, name, tag);
        await ev(() => scrollTo(0, document.documentElement.scrollHeight)); await sleep(150);
        await look(page, name + ' (scrolled)', tag);
        await ev(() => scrollTo(0, 0));
        if (!(await page.$('[data-skip]'))) break;
        await page.click('[data-skip]'); await sleep(450);
      }
    } catch (e) { errors.push(tag + ' new user: ' + e.message.split('\n')[0]); }
    await ctx.close();
    // the demo's last screen ("הנתונים לדוגמה מוכנים!"), the case the user caught, then the app with the demo's data
    const B = await fresh(lang, theme, w);
    try {
      await stubCloud(B.page);
      await B.page.goto(`http://localhost:${PORT}/${pageFile(lang)}?cloud=1`, { waitUntil: 'load' });
      await B.page.waitForFunction(() => !document.getElementById('intro'), { timeout: 15000 });
      await pickLang(B.page, B.ev, lang);
      await B.page.waitForSelector('[data-demo]', { timeout: 8000 });
      await B.page.click('[data-demo]'); await sleep(1200);
      // the terms' own question may come first (a checkbox and a button)
      for (let i = 0; i < 4 && !(await B.page.$('.ob-done')); i++) {
        await B.ev(() => { const d = [...document.querySelectorAll('.dialog, .wizard')].pop(); if (!d) return; const c = d.querySelector('input[type=checkbox]:not(:checked)'); if (c) c.click(); const b = d.querySelector('.btn.primary:not(:disabled), [data-ok]'); if (b) b.click(); });
        await sleep(900);
      }
      if (!(await B.page.$('.ob-done'))) throw new Error('no last screen');
      await sleep(600);
      await look(B.page, 'demo ready (last setup screen)', tag);
      // on as a guest (no account): a warning first (its last button goes on), then the app with the demo's data
      await B.page.click('[data-guest]'); await sleep(700);
      await B.ev(() => { const d = [...document.querySelectorAll('.dialog')].pop(); const bs = d ? d.querySelectorAll('button') : []; if (bs.length) bs[bs.length - 1].click(); }); await sleep(1800);
      await appScreens(B.page, B.ev, tag);
    } catch (e) { errors.push(tag + ' demo: ' + e.message.split('\n')[0]); }
    await B.ctx.close();
  }
  async function appScreens(page, ev, tag) {
    // the terms' own screen (an account that has not agreed yet): seen, then agreed to
    if (await ev(() => typeof App !== 'undefined' && App.blocking === 'legal')) {
      await look(page, 'terms to agree to', tag);
      await ev(() => scrollTo(0, document.documentElement.scrollHeight)); await sleep(150); await look(page, 'terms to agree to (end)', tag);
      await page.click('#lg-ok'); await page.click('#lg-go'); await sleep(1500);
    }
    for (let i = 0; i < 6 && (await page.$('.coach')); i++) { await page.click('.coach').catch(() => {}); await sleep(300); }
    if (!(await ev(() => typeof App !== 'undefined' && !App.blocking))) { errors.push(tag + ' the app did not open: ' + (await ev(() => (typeof App !== 'undefined' ? App.blocking : 'no App') + ' | ' + document.body.innerText.slice(0, 160).replace(/s+/g, ' ')))); await page.screenshot({ path: path.join(out, tag + '-not-open.png') }); return; }
    const close = () => ev(() => { document.querySelectorAll('.dialog').forEach((d) => { if (d._resolve) d._resolve(null); d.remove(); }); UI.closeAll(); }).then(() => sleep(450));
    for (const tab of ['home', 'calendar', 'reports', 'settings']) {
      await ev((t) => App.go(t), tab); await sleep(700);
      await look(page, 'tab ' + tab, tag);
      await ev(() => scrollTo(0, document.documentElement.scrollHeight / 2)); await sleep(150); await look(page, 'tab ' + tab + ' (middle)', tag);
      await ev(() => scrollTo(0, document.documentElement.scrollHeight)); await sleep(150); await look(page, 'tab ' + tab + ' (end)', tag);
      await ev(() => scrollTo(0, 0));
    }
    const sheets = [
      ['+ menu', 'App.actions.add()'],
      ['games', 'App.actions.games()'],
      ['rights', 'App.actions.rights()'],
      ['payslip', 'App.actions.payslip()'],
      ['insights', 'App.actions.insights()'],
      ['help', 'App.actions.help()'],
      ['legal terms', 'App.sheetsApi.legal("terms")'],
    ];
    for (const [name, code] of sheets) {
      const ok = await ev(`(() => { try { ${code}; return true; } catch (e) { return false; } })()`).catch(() => false);
      if (!ok) continue;
      await sleep(800); await look(page, 'sheet ' + name, tag);
      await ev(() => { const b = [...document.querySelectorAll('.sheet.show .sh-body')].pop(); if (b) b.scrollTop = b.scrollHeight; }); await sleep(150);
      await look(page, 'sheet ' + name + ' (end)', tag);
      await close();
    }
  }
  async function sitePages(theme, w) {
    const pages = fs.readdirSync(site).filter((f) => f.endsWith('.html'));
    const { ctx, page } = await fresh('he', theme, w);
    for (const f of pages) {
      try {
        await page.goto('http://localhost:' + PORT + '/site/' + f, { waitUntil: 'load', timeout: 15000 }); await sleep(300);
        await look(page, 'site ' + f, `site-${theme}-${w}`);
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2)); await sleep(200);
        await look(page, 'site ' + f + ' (middle)', `site-${theme}-${w}`);
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await sleep(200);
        await look(page, 'site ' + f + ' (end)', `site-${theme}-${w}`);
      } catch (e) { errors.push('site ' + f + ' ' + w + ': ' + e.message.split('\n')[0]); }
    }
    await ctx.close();
  }
  const only = process.env.EDGE_ONLY || '';
  for (const theme of THEMES) for (const w of WIDTHS) {
    if (only !== 'site') for (const lang of LANGS) { console.log(`  ${lang} ${theme} ${w}`); await newUser(lang, theme, w); }
    if (only !== 'app' && fs.existsSync(site)) await sitePages(theme, w);
  }
  await browser.close(); server.close();
  fs.writeFileSync(path.join(out, 'edge-boxes.json'), JSON.stringify({ checks, problems, errors }, null, 1));
  for (const p of problems) console.log(`  ✗ ${p.tag} ${p.where} [${p.name}] ${p.side} edge at ${p.edge}px (column ${p.column.join('-')}): ${p.why}, jump ${p.jump}`);
  for (const e of errors) console.log('  ! ' + e);
  console.log(`edge boxes: ${checks} screens checked, ${problems.length} problems, ${errors.length} errors`);
  process.exit(problems.length || errors.length ? 1 : 0);
})();
