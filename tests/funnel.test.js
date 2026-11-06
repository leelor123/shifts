/* The admin dashboard's funnel (core/funnel.js): installed, a first shift, back on a later week, active in the last
 * 14 days, Plus; by period of first use and by platform. */
const { Funnel: F, U } = globalThis;
const T = require('./t.js');

const today = '2026-11-06';
const day = (n) => U.addDays(today, -n); // n days ago
// a record as stats.js writes it (only the fields the funnel reads)
const rec = (o) => Object.assign({ p: 'web', ios: false, first: day(20), last: day(20), sh: 0, f: {} }, o);
const nums = (r) => r.steps.map((s) => s.n).join(',');
const pcts = (r) => r.steps.map((s) => s.pct).join(',');

T.section('admin funnel');
T.test('each step is kept from the one before, with its share of the step before', () => {
  const rows = [
    rec({}), // installed only
    rec({ sh: 3 }), // a shift, never back
    rec({ sh: 3, first: day(25), last: day(15) }), // back 10 days later, not in the last 14 days
    rec({ sh: 5, last: day(2) }), // back and still active
    rec({ sh: 9, last: day(1), f: { plus: true } }), // all the way
    rec({ sh: 0, last: day(1), f: { plus: true } }), // Plus without a shift: stops at the second step
  ];
  const r = F.compute(rows, { today, days: 30 });
  T.eq(r.steps.map((s) => s.key).join(','), 'installed,shift,week,active,plus');
  T.eq(nums(r), '6,4,3,2,1');
  T.eq(pcts(r), '100,67,75,67,50');
  T.eq(r.steps[2].prev, 4, 'the step before');
});

T.test('back on a later week means 7 days or more after the first day; active means the last 14 days', () => {
  const rows = [rec({ sh: 1, first: day(20), last: day(14) }), rec({ sh: 1, first: day(20), last: day(13) })];
  T.eq(nums(F.compute(rows, { today, days: 30 })), '2,2,1,1,0', '6 days later is not a later week');
  const edge = [rec({ sh: 1, first: day(27), last: day(14) }), rec({ sh: 1, first: day(27), last: day(13) })];
  T.eq(nums(F.compute(edge, { today, days: 30 })), '2,2,2,1,0', 'used 14 days ago is out, 13 is in');
});

T.test('the window: first use in the last 30 or 90 days, but at least a week ago (time to come back)', () => {
  const rows = [rec({ first: day(3), last: day(3) }), rec({ first: day(7), last: day(7) }), rec({ first: day(29), last: day(29) }),
    rec({ first: day(30), last: day(30) }), rec({ first: day(89), last: day(89) }), rec({ first: day(90), last: day(90) })];
  const r30 = F.compute(rows, { today, days: 30 });
  T.eq(r30.steps[0].n, 2, '7 and 29 days ago');
  T.eq(r30.from, day(29)); T.eq(r30.to, day(7));
  T.eq(F.compute(rows, { today, days: 90 }).steps[0].n, 4, '7, 29, 30 and 89 days ago');
});

T.test('platform: the Android app, iPhone (the record says so) and any other browser; old records count as browser', () => {
  const rows = [rec({ p: 'android', sh: 1 }), rec({ p: 'pwa', ios: true }), rec({ p: 'web', ios: true, sh: 2 }), rec({ p: 'pwa' }), rec({ p: 'web' }),
    (() => { const r = rec({ p: 'web' }); delete r.ios; return r; })()];
  T.eq(F.compute(rows, { today, days: 30, platform: 'android' }).steps[0].n, 1);
  T.eq(nums(F.compute(rows, { today, days: 30, platform: 'ios' })), '2,1,0,0,0');
  T.eq(F.compute(rows, { today, days: 30, platform: 'web' }).steps[0].n, 3);
  T.eq(F.compute(rows, { today, days: 30 }).steps[0].n, 6, 'all');
  T.eq(F.group({ p: 'android', ios: true }), 'android', 'the Android app wins');
  T.eq(F.PLATFORMS.join(), 'android,web,ios');
});

T.test('demo mode, broken records and an empty window count nothing and never divide by zero', () => {
  const rows = [rec({ f: { demo: true }, sh: 4 }), null, { p: 'web' }, rec({ first: 'x', last: day(1) }), rec({ first: day(10), last: 5 })];
  const r = F.compute(rows, { today, days: 30 });
  T.eq(nums(r), '0,0,0,0,0');
  T.eq(pcts(r), '0,0,0,0,0');
  T.eq(nums(F.compute([], { today, days: 90 })), '0,0,0,0,0');
  T.eq(nums(F.compute(undefined, { today })), '0,0,0,0,0');
});

T.test('the record field the funnel added is a yes/no only', () => {
  const rules = require('fs').readFileSync(require('path').join(__dirname, '..', 'firestore.rules'), 'utf8');
  T.ok(/hasOnly\(\['v', 'p', 'ios',/.test(rules), 'allowed by the rules');
  T.ok(rules.includes("(!('ios' in d) || d.ios is bool)"), 'a boolean, and optional for older versions');
});

T.test('the dashboard draws the funnel for 30 and 90 days, a column per platform, from the records it already read', () => {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const c = { U, Funnel: F, UI: { icon: () => '', esc }, App: { actions: {} }, Charts: { bars: () => '' }, Store: {}, PAY_CONFIG: {} };
  c.window = c; vm.createContext(c);
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'views-admin.js'), 'utf8');
  vm.runInContext(src, c, { filename: 'app/views-admin.js' });
  const k = U.todayKey();
  const ago = (n) => U.addDays(k, -n);
  const rows = [rec({ p: 'android', first: ago(10), last: ago(1), sh: 2 }), rec({ p: 'web', ios: true, first: ago(60), last: ago(60) })];
  const html = c.App.adminView(rows, [], 'me');
  const panel = (d) => { const i = html.indexOf(`data-adm-fp="${d}"`); return html.slice(i, html.indexOf('</table>', i)); };
  T.ok(html.includes('data-adm-fw="30"') && html.includes('data-adm-fw="90"'), 'the two periods');
  T.ok(/data-adm-fp="90" hidden/.test(html) && !/data-adm-fp="30" hidden/.test(html), '30 days shown first');
  const first = (p) => (p.match(/<tbody><tr>[\s\S]*?<\/tr>/) || [''])[0].match(/<b>(\d+)<\/b>/g).map((b) => b.replace(/\D/g, '')).join(',');
  T.eq(first(panel(30)), '1,1,0,0', '30 days: all, Android, browser, iPhone');
  T.eq(first(panel(90)), '2,1,0,1', '90 days');
  T.eq((panel(30).match(/<tr>/g) || []).length, 6, 'a header and five steps');
  T.ok(!/[‎‏‪-‮⁦-⁩]/.test(src), 'no raw bidi characters in the file');
});
