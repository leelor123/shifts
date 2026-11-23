/* The rating ask (src/app/review.js): only engaged people, only right after a good moment, never at night, in the
 * first minute or after an error, at most 3 times, never again after "rate" or "don't ask again", a card in the
 * home queue (never a screen over the app), the same ways out for everyone, and Google's In-App Review through the
 * Android app only when the app says it can. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const T = require('./t.js');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SRC = read('src/app/review.js');
const DAY = 86400000;

function load(opts) {
  const o = Object.assign({ activeDays: 8, shifts: 12, review: undefined, hour: 12, date: [2026, 10, 10] }, opts);
  let now = new Date(o.date[0], o.date[1], o.date[2], o.hour, 0, 0).getTime();
  const intervals = [], timeouts = [];
  const results = new Map();
  for (let i = 0; i < o.shifts; i++) results.set('s' + i, { status: 'done', dateKey: '2026-11-0' + ((i % 9) + 1) });
  const meta = { activeDays: o.activeDays, guideDone: true, review: o.review, testerNudge: o.tester };
  const posted = [], listeners = {};
  const App = {
    actions: {}, model: { results }, tab: 'home', blocking: false, androidApp: !!o.android, rerenders: 0,
    rerender() { App.rerenders++; }, go(t) { App.tab = t; },
    widgets: o.channel ? { connected: true, post: (m) => { posted.push(m); return true; } } : undefined,
  };
  if (o.wnPending) App.whatsNewPending = () => true;
  const Store = { S: { meta, settings: { demo: !!o.demo, onboarded: true }, payslips: [] }, async setMeta(p) { Object.assign(meta, p); } };
  const UI = { icon: () => '', esc: (s) => String(s), sheets: [], toast() {}, closeAll() {} };
  const ctx = {
    App, Store, UI,
    Moments: { quietHour: (ms) => { const h = new Date(ms).getHours(); return h >= 23 || h < 6; } },
    document: { querySelector: () => null, visibilityState: 'visible' },
    location: { href: '' },
    addEventListener: (k, fn) => { listeners[k] = fn; },
    setInterval: (fn) => { intervals.push(fn); return intervals.length; },
    clearInterval: (id) => { intervals[id - 1] = null; },
    setTimeout: (fn) => { timeouts.push(fn); return 0; },
    console,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ctx.__now = () => now;
  vm.runInContext('Date.now = () => __now();', ctx);
  vm.runInContext(SRC, ctx);
  const tick = (ms) => { for (let t = 0; t < ms; t += 500) { now += 500; intervals.forEach((f) => f && f()); } };
  const flush = () => { while (timeouts.length) timeouts.shift()(); };
  return { App, meta, posted, listeners, UI, ctx, tick, flush, later: (ms) => { now += ms; } };
}

T.section('rating ask');
T.test('only engaged people, never in the first minute, at night or after an error', () => {
  let r = load(); T.eq(r.App.reviewDue(), false, 'first minute'); r.later(61000); T.eq(r.App.reviewDue(), true, 'engaged');
  r = load({ activeDays: 2 }); r.later(61000); T.eq(r.App.reviewDue(), false, 'few days');
  r = load({ shifts: 3 }); r.later(61000); T.eq(r.App.reviewDue(), false, 'few shifts');
  r = load({ demo: true }); r.later(61000); T.eq(r.App.reviewDue(), false, 'demo');
  r = load({ hour: 23 }); r.later(61000); T.eq(r.App.reviewDue(), false, 'quiet hours');
  r = load(); r.later(61000); r.listeners.error(); T.eq(r.App.reviewDue(), false, 'right after an error');
  r.later(11 * 60000); T.eq(r.App.reviewDue(), true, 'ten minutes after the error');
});
T.test('at most 3 asks, a long gap after "not now", never after "rate" or "don\'t ask again"', () => {
  const at = new Date(2026, 10, 10, 12).getTime();
  const due = (review) => { const r = load({ review }); r.later(61000); return r.App.reviewDue(); };
  T.eq(due({ n: 3, at: at - 400 * DAY }), false, 'three asks');
  T.eq(due({ n: 1, at: at - 30 * DAY }), false, '30 days after not now');
  T.eq(due({ n: 1, at: at - 61 * DAY }), true, '61 days after not now');
  T.eq(due({ n: 1, at: at - 90 * DAY, native: true }), false, 'Google window 90 days ago');
  T.eq(due({ n: 1, at: at - 400 * DAY, rated: true }), false, 'rated');
  T.eq(due({ n: 1, at: at - 400 * DAY, never: true }), false, 'do not ask again');
  T.eq(due({ n: 1, at: at - 400 * DAY, done: true }), false, 'shared');
});
T.test('a good moment arms a home card once the screen stays clear; shown once, counted once', () => {
  const r = load(); r.later(61000);
  r.UI.sheets.push({}); // a screen is open: wait
  r.App.reviewMoment('milestone', 10); r.tick(5000);
  T.eq(r.App.reviewCard(), '', 'nothing while a screen is open');
  r.UI.sheets.pop(); r.tick(1000); T.eq(r.App.reviewCard(), '', 'not before 2 clear seconds');
  r.tick(1500);
  const html = r.App.reviewCard();
  T.ok(html.includes('rv-card') && html.includes('10'), 'the card, about the 10th shift');
  for (const a of ['rv-go', 'rv-idea', 'rv-later', 'rv-never']) T.ok(html.includes(`data-act="${a}"`), a);
  r.flush(); T.eq(r.meta.review.n, 1, 'counted'); r.App.reviewCard(); r.flush(); T.eq(r.meta.review.n, 1, 'counted once');
  r.App.actions['rv-never'](); r.flush();
  T.eq(r.meta.review.never, true); T.eq(r.App.reviewCard(), '', 'gone');
});
T.test('no moment, no card; a card lasts a day', () => {
  const r = load(); r.later(61000);
  r.App.reviewMoment(null); r.tick(3000); T.eq(r.App.reviewCard(), '');
  r.App.reviewMoment('payslip-match'); r.tick(3000); T.ok(r.App.reviewCard() !== '');
  r.later(DAY + 1000); T.eq(r.App.reviewCard(), '', 'a day later');
});
T.test('shift ends: the 10th shift is a moment, the 11th is not', () => {
  for (const [n, want] of [[10, 'milestone'], [11, null]]) {
    const r = load({ shifts: n }); let got = null;
    r.App.reviewMoment = (w) => { got = w; };
    r.App.reviewAfterShift(); T.eq(got, want, n + ' shifts');
  }
});
T.test('the Android app asks Google only when it said it can; the card when Google could not be asked', () => {
  let r = load({ android: true, channel: true }); r.later(61000);
  r.App.reviewMoment('milestone', 25); r.tick(3000);
  T.eq(r.posted.length, 0, 'an older app (no hello): nothing sent to it'); T.ok(r.App.reviewCard().includes('rv-go'), 'the card instead');
  r = load({ android: true, channel: true }); r.later(61000);
  r.App.reviewNative('shaati:review');
  r.App.reviewMoment('milestone', 25); r.tick(3000);
  T.eq(r.posted.join(), 'shaati:review'); T.eq(r.App.reviewCard(), '', 'no card while Google decides');
  T.eq(r.meta.review.native, true); T.eq(r.meta.review.n, 1);
  r.App.reviewNative('shaati:review:no'); T.ok(r.App.reviewCard().includes('rv-card'), 'card after a failed ask');
});
T.test('wired: home queue, payslip moments, the widgets channel, the Android build', () => {
  T.ok(!/openSheet|UI\.confirm/.test(SRC), 'never a screen over the app');
  T.ok(!/מתנה|פרס|בונוס/.test(SRC), 'no reward for rating');
  T.ok(/\['review', \(\) => \(App\.reviewCard/.test(read('src/app/views-home.js')), 'home queue');
  const ps = read('src/app/views-payslip.js');
  T.ok(ps.includes("'payslip-owed'") && ps.includes("'payslip-match'") && ps.includes("reviewMoment('money-back')"), 'payslip moments');
  T.ok(/startsWith\('shaati:review'\)\) \{ if \(App\.reviewNative\)/.test(read('src/app/widgets.js')), 'widgets channel');
  const an = read('tools/android.js');
  T.ok(an.includes("implementation 'com.google.android.play:review:"), 'gradle dependency');
  T.ok(an.includes('s.postMessage("shaati:review", null)') && an.includes('PlayReview.ask('), 'launcher hello and ask');
  T.ok(fs.existsSync(path.join(ROOT, 'android/widgets/java/PlayReview.java')), 'PlayReview.java');
});

/* The testers' card (review.js App.testerCard): the Android app only, after 3 days, decided once per open, at most 2
 * days in all and 5 days apart, gone for good after either feedback button, off after TESTER_NUDGE.until. */
T.section('testers\' card');
const card = (r, others) => r.App.testerCard(others || []);
T.test('the website never; the Android app only after 3 days of use', () => {
  T.eq(card(load({ android: false })), '', 'website');
  T.eq(card(load({ android: true, activeDays: 2 })), '', 'two days');
  T.eq(card(load({ android: true, demo: true })), '', 'demo');
  const html = card(load({ android: true, activeDays: 3 }));
  T.ok(html.includes('tn-card'), 'three days in the Android app');
  for (const a of ['tn-play', 'tn-here', 'tn-later']) T.ok(html.includes(`data-act="${a}"`), a);
});
T.test('decided once per open: never beside another card, the what\'s-new sheet or a rating ask', () => {
  let r = load({ android: true });
  T.eq(card(r, ['salary']), '', 'another card waits'); T.eq(card(r), '', 'and not later in the same open');
  r = load({ android: true, wnPending: true }); T.eq(card(r), '', 'what\'s new pending');
  r = load({ android: true }); r.App.whatsNewThisOpen = true; T.eq(card(r), '', 'what\'s new shown');
  r = load({ android: true }); r.App._review.pending = { why: 'milestone', n: 10, until: Date.now() + DAY }; T.eq(card(r), '', 'rating card');
  r = load({ android: true }); r.App.androidApp = false; T.eq(card(r), '', 'website');
  r = load({ android: true }); r.App.androidApp = true; T.ok(card(r) !== '', 'shown'); r.later(61000);
  T.eq(r.App.reviewDue(), false, 'no rating ask while the testers\' card is on home');
});
T.test('counted once a day; the same day after a reopen; at most 2 days, 5 days apart', () => {
  const at = new Date(2026, 10, 10, 12).getTime();
  let r = load({ android: true }); card(r); r.flush(); card(r); r.flush();
  T.eq(r.meta.testerNudge.n, 1, 'one show'); T.eq(r.meta.testerNudge.day, '2026-11-10');
  r = load({ android: true, tester: { n: 1, day: '2026-11-10', at: at - 3600000 } }); T.ok(card(r) !== '', 'same day reopen'); r.flush(); T.eq(r.meta.testerNudge.n, 1, 'not counted again');
  T.eq(card(load({ android: true, tester: { n: 1, day: '2026-11-07', at: at - 3 * DAY } })), '', '3 days later');
  r = load({ android: true, tester: { n: 1, day: '2026-11-05', at: at - 5 * DAY } }); T.ok(card(r) !== '', '5 days later'); r.flush(); T.eq(r.meta.testerNudge.n, 2);
  T.eq(card(load({ android: true, tester: { n: 2, day: '2026-10-01', at: at - 40 * DAY } })), '', 'two shows: done');
});
T.test('"not now" hides it for 5 days; either feedback button ends it for good', () => {
  let r = load({ android: true }); card(r); r.flush();
  r.App.actions['tn-later'](); r.flush();
  T.eq(r.meta.testerNudge.later, '2026-11-10'); T.eq(card(r), '', 'gone after not now');
  r = load({ android: true, tester: r.meta.testerNudge }); T.eq(card(r), '', 'not on a reopen the same day');
  r.later(4 * DAY); r.App._tester.reset(); T.eq(card(r), '', '4 days after not now');
  r.later(DAY + 1000); r.App._tester.reset(); T.ok(card(r) !== '', '5 days after not now');
  for (const [act, done] of [['tn-play', 'play'], ['tn-here', 'here']]) {
    r = load({ android: true }); let opened = '', ticket = '';
    r.App.openPlayStore = (h) => { opened = h; }; r.ctx.Support = { newTicket: (k) => { ticket = k; } };
    card(r); r.flush(); r.App.actions[act](); r.flush();
    T.eq(r.meta.testerNudge.done, done, act);
    if (act === 'tn-play') T.ok(opened.includes('details?id=io.github.leelor123.shifts') && opened.includes(encodeURIComponent('https://play.google.com/store/apps/details?id=io.github.leelor123.shifts')), 'the Play listing');
    else T.eq(ticket, 'idea', 'the support form');
    r.later(400 * DAY); r.App._tester.reset(); T.eq(card(r), '', 'never again after ' + act);
  }
});
T.test('kill switch: off after TESTER_NUDGE.until', () => {
  const r = load({ android: true });
  T.ok(/turn off when production access is granted/.test(SRC) && /const TESTER_NUDGE = \{ until: '\d{4}-\d\d-\d\d' \}/.test(SRC), 'one constant, with its note');
  const u = r.App._tester.TESTER_NUDGE.until.split('-').map(Number);
  T.ok(card(load({ android: true, date: [u[0], u[1] - 1, u[2]] })) !== '', 'on the last day');
  T.eq(card(load({ android: true, date: [u[0], u[1] - 1, u[2] + 1] })), '', 'the day after');
  T.ok(/\['tester', \(keys\) => \(App\.testerCard/.test(read('src/app/views-home.js')), 'home queue');
});
