/* Performance and look guards from the fx-perf pass (27 Nov 2026): no backdrop blur on the tab bar or over the moving
 * sky, live text and tap effects never refitted, the tap ring placed once and moved by transform, the audio and the
 * second hand asleep when nothing needs them, readable ink on brand fills in dark, the widgets' amounts masked with
 * "hide amounts", Amharic's font kept offline, and the shift editor's total next to Save. */
const T = require('./t.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const CSS = ['styles.css', 'styles-v3.css', 'styles-v4.css'].map(read).join('\n');
/** every rule (selector, body) of the stylesheets, at any depth of @media */
function rules(css) {
  const out = []; const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '');
  while ((m = re.exec(flat))) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}
const R = rules(CSS);

T.section('fx-perf: motion, layers and contrast');
T.test('no backdrop blur on the tab bar or on the header buttons over the home sky', () => {
  const bad = R.filter((r) => /blur\(/.test(r.body) && /backdrop-filter/.test(r.body) && /(^|[\s,])\.nav\b|\.home-top \.icon-btn/.test(r.sel));
  T.ok(!bad.length, 'blur recomputed under moving layers flashes on Android: ' + bad.map((r) => r.sel).join(' | '));
});
T.test('live text and the tap effects are never refitted (Dom.fit skips them); a resize fits once a frame', () => {
  const dom = read('app/dom.js');
  const skip = (/const FIT_SKIP = '([^']+)'/.exec(dom) || [])[1] || '';
  for (const s of ['[data-clock]', '[data-live-pay]', '.fx-ring', '.fx-coin']) T.ok(skip.includes(s), 'FIT_SKIP has ' + s);
  T.ok(!/addEventListener\('resize', fitAll\)/.test(dom) && /resize[\s\S]{0,120}requestAnimationFrame/.test(dom), 'resize is debounced with rAF');
});
T.test('the pickers look only through what was added, never the whole page per added node', () => {
  const p = read('app/pickers.js');
  const mo = (/const mo = new MutationObserver\(([\s\S]*?)\}\);/.exec(p) || [])[1] || '';
  T.ok(mo && !/document\.body/.test(mo) && /addedNodes/.test(mo), 'scan only the added subtrees');
});
T.test('the tap ring is placed once, follows by transform, and has its own layer', () => {
  const fx = read('app/fx.js');
  const ring = fx.slice(fx.indexOf('Fx.ring = function'), fx.indexOf('/* ---------------- particles'));
  T.ok(ring.length > 500, 'found Fx.ring');
  // left/top/width/height are written only where the ring is made (one block), then transform
  T.eq((ring.match(/d\.style\.left =/g) || []).length, 1, 'left written once');
  T.ok(/d\.style\.transform = /.test(ring), 'moves by transform');
  T.ok(/MutationObserver/.test(ring) && /disconnect\(\)/.test(ring), 'costly checks only when the page changed, observer let go');
  const css = R.find((r) => r.sel === '.fx-ring');
  T.ok(css && /will-change:\s*transform/.test(css.body) && /transform-origin:\s*0 0/.test(css.body), '.fx-ring has its own layer, origin top-left');
});
T.test('the audio context sleeps when idle or hidden, and wakes with the next sound', () => {
  const fx = read('app/fx.js');
  T.ok(/ac\.suspend\(\)/.test(fx) && /visibilitychange/.test(fx) && /ac\.resume\(\)/.test(fx), 'suspend + resume');
  T.ok(/Music\.playing/.test(fx), 'never put to sleep under the games\' music');
  const mu = read('app/music.js');
  T.ok(/root\.Music\.busy\(\)/.test(fx) && /Music\.busy = \(\) => !!Music\.playing \|\| voices > 0/.test(mu), '...nor under its last notes (they would never end)');
  T.ok(/ctx\.state === 'suspended' && !document\.hidden\) Fx\.audio\(\)/.test(mu), 'the music wakes a sleeping context itself');
});
T.test('the 1 s tick runs only with a running shift and the app seen', () => {
  const app = read('app/app.js');
  T.ok(!/^\s*setInterval\(App\.tickTimer/m.test(app), 'no tick forever');
  T.ok(/App\.armTick = function[\s\S]{0,200}activeShift[\s\S]{0,80}visibilityState/.test(app), 'armed by the shift and visibility');
});
T.test('ink on brand fills is var(--on-primary) (white on the light brand of dark mode was 1.3-2.3:1)', () => {
  const want = ['.pk-day.on', '.pk-cell.on', '.pp-ok', '.pp-bubble', '.lp-tick', '.ios-install .ii-n', '.pk-dot .i', '.imp-check svg'];
  for (const sel of want) {
    const r = R.filter((x) => x.sel === sel && /(^|;)\s*color:/.test(x.body));
    T.ok(r.length, 'found ' + sel);
    T.ok(r.every((x) => !/(^|;)\s*color:\s*#fff\b/.test(x.body)), sel + ' has no #fff ink');
  }
  const knob = R.find((x) => x.sel === '.tr-toggle.on .tr-sw i');
  T.ok(knob && /var\(--on-primary\)/.test(knob.body), 'the switch knob on its brand track');
});
T.test('the photo skin\'s darkening leaves white text 4.5:1 over a white photo', () => {
  const r = R.find((x) => x.sel.includes('html[data-skin="photo"] .home-hero'));
  const alphas = [...r.body.matchAll(/rgba\(8, 10, 28, ([\d.]+)\)/g)].map((m) => +m[1]);
  T.ok(alphas.length >= 3, 'the gradient stops');
  const lum = (a) => { const v = (255 * (1 - a) + 9 * a) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  for (const a of alphas) T.ok(1.05 / (lum(a) + 0.05) >= 4.5, 'stop .' + a + ' gives ' + (1.05 / (lum(a) + 0.05)).toFixed(2));
});
T.test('no v3 violet or pink left in the recap button, the stories and the eye', () => {
  const violet = /#(3b0f80|6d28d9|9333ea|5b21b6|7c3aed|db2777|be185d|6b0f3a|9d174d|4c1d95)\b|rgba\(40, 20, 90/i;
  const bad = R.filter((x) => /recap-btn|\.story|hh-eye/.test(x.sel) && violet.test(x.body));
  T.ok(!bad.length, bad.map((x) => x.sel).join(' | '));
  T.ok(/:root\[data-theme="dark"\] \.toast/.test(CSS), 'the dark toast has an edge');
});
T.test('the service worker keeps Amharic\'s font for Amharic users', () => {
  const sw = read('sw.js');
  T.ok(/noto-ethiopic\.woff2/.test(sw) && /l === 'am' \? FONTS_AM/.test(sw), 'noto-ethiopic precached for am');
  T.ok(fs.existsSync(path.join(SRC, 'fonts', 'noto-ethiopic.woff2')), 'the file exists');
});
T.test('the shift editor shows its total next to Save, in a box of fixed width', () => {
  const v = read('app/views-shift.js');
  T.ok(/<div class="ed-total">\$\{footTotalHtml\(previewResult\(\)\)\}<\/div><button class="btn" data-save>/.test(v), 'in the footer');
  T.ok(/footTotal\(r\);/.test(v), 'updated with the preview');
  const r = R.find((x) => x.sel === '.sheet .sh-foot .ed-total');
  T.ok(r && /flex:\s*0 0 [\d.]+em/.test(r.body) && /min-width:\s*0/.test(r.body), 'fixed width: the buttons never move while typing');
});

T.section('fx-perf: widgets with hidden amounts');
T.test('every amount goes masked; hours, counts and percent stay', () => {
  const listeners = [];
  const S = { settings: { hideMoney: true, onboarded: true, goal: {}, saving: {} }, meta: {}, employers: [], shifts: [] };
  const root = {
    App: {}, Store: { S, on: () => {}, setMeta: () => Promise.resolve() }, U: { money: (n) => '₪' + n, LANG: 'he' }, Engine: {},
    addEventListener: (t, f) => listeners.push(t), setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem: () => {} },
  };
  root.document = { addEventListener: () => {}, visibilityState: 'visible' };
  const ctx = vm.createContext(Object.assign({ window: root, globalThis: root, console, JSON, Math, Date, Promise, Number, String, Object, Array, Set, Map }, root));
  vm.runInContext(read('app/widgets.js'), ctx);
  const snap = { v: 1, gross: '₪4,210', net: '₪3,900', hours: '62:30', shifts: 9, today: '₪310', pace: '₪5,100',
    goal: { pct: 40, of: '₪10,000', left: '₪6,000' }, payday: { date: '2026-12-09', amount: '₪3,100' }, saving: { name: 'אופניים', pct: 20, left: '₪800' },
    active: { start: 1, role: 'סדרן', rate: '₪40 לשעה' }, next: null };
  const m = root.App.widgetMask(snap);
  const all = JSON.stringify(m);
  T.ok(!/\d,\d{3}|₪\d/.test(all), 'no amount left: ' + all);
  T.eq(m.gross, '₪•••'); T.eq(m.goal.pct, 40); T.eq(m.hours, '62:30'); T.eq(m.shifts, 9); T.eq(m.active.rate, ''); T.eq(m.today, '');
  T.eq(snap.gross, '₪4,210', 'the snapshot itself is not changed');
});
