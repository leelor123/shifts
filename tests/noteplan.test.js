/* The notifications of the coming days (src/core/noteplan.js) and the parts that must stay in step with it: the app
 * hands them to the phone (app/phone-notes.js), the Android app shows them at their time while the app is closed
 * (android/widgets/java/NoteCenter.java), the worker shows them in a browser (sw.js).
 * Guard for the user's report of 9 Nov 2026: "notifications come only when I open the app". */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const { U, Engine, Insights, Defaults, NotePlan: NP } = globalThis;
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MIN = 60000;

let n = 0;
function shift(date, from, to, status) {
  const start = U.toEpoch(date, from);
  let end = U.toEpoch(date, to);
  if (end <= start) end = U.toEpoch(U.addDays(date, 1), to);
  return { id: 'p' + (++n), kind: 'shift', employerId: 'emp1', roleId: 'r_sadran', status: status || 'planned', start, end, items: [] };
}
function data(shifts, mod) {
  const settings = Defaults.defaultSettings();
  settings.startDate = '2026-01-01';
  settings.onboarded = true;
  const d = { settings, employers: [Defaults.defaultEmployer()], roles: Defaults.defaultRoles(), dayRules: [], shifts, entries: [] };
  if (mod) mod(d);
  return d;
}
// the app's own rule (app.js notifiable): the reminder before a planned shift only when switched on
const sendable = (a, cfg) => (a.type === 'upcoming' ? cfg.remindPlanned === true : true) && (a.push === 'critical' || a.push === 'anomaly');
const at = (model, cfg, active) => (t) => Insights.run(model, { now: t, activeShift: active || null }).alerts.filter((a) => sendable(a, cfg));
const NOW = U.toEpoch('2026-11-09', '10:00');

T.section('notifications of the coming days');
T.test('a planned shift: each reminder before it, the evening before and "did you work it?", each at its own time', () => {
  const p = shift('2026-11-11', '16:00', '23:00');
  const d = data([p], (x) => { const A = x.settings.alerts; A.remindPlanned = true; A.reminders.before = [60, 15]; A.reminders.eveOn = true; A.reminders.eve = '20:00'; A.reminders.confirmAfter = 30; });
  const model = Engine.buildModel(d);
  const cfg = d.settings.alerts;
  const ts = NP.times(model, cfg, null, 0, NOW);
  const list = NP.plan(at(model, cfg), ts, { now: NOW });
  const when = (k) => { const x = list.find((y) => y.alert.key === k); return x ? x.at : 0; };
  T.near(when('up-' + p.id + '-60'), p.start - 60 * MIN, 60 * 1000);
  T.near(when('up-' + p.id + '-15'), p.start - 15 * MIN, 60 * 1000);
  T.near(when('eve-' + p.id), U.toEpoch('2026-11-10', '20:00'), 60 * 1000);
  T.near(when('cd-' + p.id), p.end + 30 * MIN, 60 * 1000);
  T.ok(list.every((x) => x.at > NOW), 'only what comes later: what is due now the app sends itself');
});
T.test('nothing before a planned shift when the reminder is off (the default: few notifications)', () => {
  const p = shift('2026-11-11', '16:00', '23:00');
  const d = data([p]);
  const model = Engine.buildModel(d);
  const list = NP.plan(at(model, d.settings.alerts), NP.times(model, d.settings.alerts, null, 0, NOW), { now: NOW });
  T.ok(!list.some((x) => x.alert.type === 'upcoming'));
});
T.test('a timer left running: the "forgot to end it?" comes when its limit passes, also with the app closed', () => {
  const d = data([]);
  const model = Engine.buildModel(d);
  const active = { start: NOW - 2 * 3600000, roleId: 'r_sadran', employerId: 'emp1', breaks: [] };
  const list = NP.plan(at(model, d.settings.alerts, active), NP.times(model, d.settings.alerts, active, 0, NOW), { now: NOW });
  const t = list.find((x) => x.alert.type === 'timer');
  T.ok(t, 'planned');
  T.near(t.at, active.start + 12 * 3600000, 2 * MIN);
});
T.test('one already sent (in the app\'s list) is never planned again; the list stays bounded', () => {
  const ps = [];
  for (let i = 1; i <= 7; i++) ps.push(shift(U.addDays('2026-11-09', i), '08:00', '12:00'));
  const d = data(ps, (x) => { x.settings.alerts.remindPlanned = true; x.settings.alerts.reminders.before = [180, 60, 15]; x.settings.alerts.reminders.confirmAfter = 30; });
  const model = Engine.buildModel(d);
  const cfg = d.settings.alerts;
  const ts = NP.times(model, cfg, null, 0, NOW);
  const first = 'up-' + ps[0].id + '-60';
  const list = NP.plan(at(model, cfg), ts, { now: NOW, sent: (k) => k === first, max: 10 });
  T.ok(!list.some((x) => x.alert.key === first));
  T.ok(list.length <= 10);
  T.ok(new Set(list.map((x) => x.alert.key)).size === list.length, 'each once');
});
T.test('the moments: within the coming week, sorted, each once, the mornings and the weekly summary\'s hour included', () => {
  const d = data([]);
  const model = Engine.buildModel(d);
  const ts = NP.times(model, d.settings.alerts, null, 0, NOW);
  T.ok(ts.every((t, i) => t > NOW && t <= NOW + 7 * 864e5 && (i === 0 || t > ts[i - 1])));
  T.ok(ts.some((t) => new Date(t).getHours() === 9), 'the mornings');
  T.ok(ts.some((t) => new Date(t).getHours() === d.settings.alerts.weeklyHour), 'the weekly summary');
});

T.test('not opened for three days: "forgot to log a shift?", at a daytime hour, moved on by every open', () => {
  const at22 = U.toEpoch('2026-11-09', '22:00');
  const a = NP.away(at22, { hasShifts: true });
  T.ok(a && a.alert.type === 'away', 'planned');
  T.eq(new Date(a.at).getHours(), 10, 'not at night: the next morning');
  T.ok(a.at >= at22 + 3 * 864e5, 'three days at least');
  const mid = NP.away(NOW, { hasShifts: true });
  T.near(mid.at, NOW + 3 * 864e5, 1000);
  T.eq(NP.away(NOW, { hasShifts: false }), null, 'nothing logged yet: no nagging');
  T.eq(NP.away(NOW, { hasShifts: true, active: true }), null, 'a shift running: the timer reminder speaks');
  T.eq(NP.away(NOW, { hasShifts: true, on: false }), null, 'switched off');
  T.near(NP.away(NOW, { hasShifts: true, days: 5 }).at, NOW + 5 * 864e5, 1000);
  const l = NP.look(a.alert, Engine.buildModel(data([])), { now: a.at });
  T.eq(l.title, 'שכחת לרשום משמרת?');
  T.ok(l.body.includes('3') && l.acts[0].url.includes('action=add') && l.ch === 'shifts', l.body);
  T.ok(read('src/app/phone-notes.js').includes('NP.away(now,'), 'the phone gets it with the list');
});

T.section('how they look');
T.test('a reminder before a shift: the time and the role first, the expected pay, a button that starts the timer', () => {
  const p = shift('2026-11-09', '16:00', '23:00');
  const d = data([p], (x) => { x.settings.alerts.remindPlanned = true; });
  const model = Engine.buildModel(d);
  const a = Insights.run(model, { now: p.start - 60 * MIN + 30000 }).alerts.find((x) => x.type === 'upcoming');
  const l = NP.look(a, model, { now: p.start - 60 * MIN + 30000, roleName: () => 'סדרן' });
  T.eq(l.title, 'בעוד שעה: משמרת סדרן');
  T.ok(l.body.includes('16:00') && l.body.includes('₪'), l.body);
  T.eq(l.ch, 'shifts');
  T.eq(l.acts[0].id, 'start');
  T.ok(l.acts.length <= 2, 'two buttons at most');
  T.ok(l.url.includes('action=note') && l.url.includes('ref=' + p.id), 'a tap opens that shift');
  const hidden = NP.look(a, model, { now: p.start - 60 * MIN, roleName: () => 'סדרן', hideMoney: true });
  T.ok(!/₪/.test(hidden.title + hidden.body), 'hidden amounts stay hidden on the lock screen');
});
T.test('every kind the app sends has a look: a title, a body, a channel, a place to open', () => {
  const kinds = ['taxrefund', 'plusend', 'weekly', 'monthly', 'record', 'goal', 'birthday', 'timer', 'backup', 'payslipDue', 'upcoming', 'confirmDone', 'holidayPay'];
  const app = read('src/app/app.js');
  const sent = (app.match(/const NOTIFY = new Set\(\[([^\]]+)\]\)/) || [])[1] || '';
  T.eq(kinds.slice().sort().join(','), sent.replace(/['\s]/g, '').split(',').sort().join(','), 'the kinds app.js sends');
  const model = Engine.buildModel(data([]));
  for (const k of kinds) {
    const l = NP.look({ key: k + '-x', type: k, title: 'כותרת', body: 'גוף', data: {} }, model, { now: NOW });
    T.ok(l.title && l.body && l.ch && l.url.startsWith('./?') && Array.isArray(l.acts), k);
    T.ok(!/חוק|חוקי|אסור/.test(l.title + l.body), k + ': never a word on what is legal');
  }
});

T.section('the path to the phone while closed');
T.test('the Android app shows them itself: hello, the list and each one now, over the widgets\' channel', () => {
  const pn = read('src/app/phone-notes.js');
  const w = read('src/app/widgets.js');
  const launcher = read('tools/android.js');
  const nc = read('android/widgets/java/NoteCenter.java') + read('android/widgets/java/NoteAlarm.java');
  T.ok(w.includes("data === 'shaati:notes'") && launcher.includes('"shaati:notes"'), 'the Android app says it can, the page hears it');
  T.ok(pn.includes('{ notes: 1, plan }') && pn.includes('notes: 1, show:'), 'the list and the ones of now');
  T.ok(launcher.includes('NoteCenter.receive('), 'the launcher hands the message to NoteCenter');
  T.ok(/setAndAllowWhileIdle|setExactAndAllowWhileIdle/.test(nc) && nc.includes('BOOT_COMPLETED'), 'the phone\'s alarms, kept over a restart');
  T.ok(launcher.includes('RECEIVE_BOOT_COMPLETED') && launcher.includes('.NoteAlarm'), 'the receiver is in the manifest');
  const app = read('src/app/app.js');
  T.ok(/App\.phoneNotes && await App\.phoneNotes\.ready\(\)/.test(app), 'push(): inside the Android app the app shows it, not Chrome');
});
T.test('the channel\'s port is kept from the first moment: Chrome hands it over before the app\'s code file runs', () => {
  const html = read('src/index.html');
  const w = read('src/app/widgets.js');
  const head = html.slice(0, html.indexOf('</head>'));
  T.ok(head.includes("addEventListener('message'") && head.includes('window.__appPort=e.ports[0]'), 'index.html keeps the port in its head');
  T.ok(w.includes('if (root.__appPort) {') && w.includes('function take(p)'), 'widgets.js takes a port that came early');
});
T.test('a notification whose reason is gone leaves the phone (the payslip came in, the shift was confirmed)', () => {
  const app = read('src/app/app.js');
  const pn = read('src/app/phone-notes.js');
  const nc = read('android/widgets/java/NoteCenter.java');
  T.ok(app.includes('App.phoneNotes.keepOnly(wanted.map((a) => a.key))'), 'every check sends the alerts true now');
  T.ok(pn.includes('notes: 1, keep:') && pn.includes('n.close()'), 'the Android app is told, and the browser\'s are closed');
  T.ok(nc.includes('optJSONArray("keep")') && nc.includes('closeGone(') && nc.includes('nm.cancel(tag'), 'NoteCenter closes its own');
});
T.test('in a browser the worker shows the kept list (no second set of words in sw.js)', () => {
  const sw = read('src/sw.js');
  T.ok(sw.includes("c.match('./__plan')") && sw.includes("self.addEventListener('periodicsync'"));
  T.ok(!/timerT|upT|cdT/.test(sw), 'the old words of their own are gone');
  T.ok(sw.includes("type: 'shaati-open'"), 'a tap while the app is open goes there without loading again');
});

// 1.39 review: a summary, a record or a goal came at night (the first moment it showed was a shift's, 01:30), and a
// second one came on a day the app had already sent one
T.test('the non-urgent ones never at night, and at most one a day counting the app\'s own', () => {
  const now = U.toEpoch('2026-11-30', '20:00');
  const r = { status: 'planned', start: U.toEpoch('2026-11-30', '17:00'), rawEnd: U.toEpoch('2026-12-01', '01:00'), dateKey: '2026-11-30' };
  const ts = NP.times({ results: new Map([['s1', r]]) }, { reminders: { confirmAfter: 30 }, weeklyHour: 20 }, null, 0, now, 2);
  T.ok(ts.includes(U.toEpoch('2026-12-01', '01:30') + 30000), 'a night moment is in the list');
  const monthStart = U.toEpoch('2026-12-01', '00:00');
  const alertsAt = (t) => (t >= monthStart ? [{ key: 'monthly-2026-11', type: 'monthly', push: 'anomaly', severity: 'info' }]
    .concat(t >= U.toEpoch('2026-12-01', '01:30') ? [{ key: 'confirm-s1', type: 'confirmDone', push: 'critical', severity: 'info' }] : []) : []);
  const p = NP.plan(alertsAt, ts, { now });
  const m = p.find((x) => x.alert.key === 'monthly-2026-11');
  T.eq(U.epochKey(m.at) + ' ' + U.epochHM(m.at), '2026-12-01 09:00', 'the summary waits for the morning');
  T.ok(!globalThis.Moments.quietHour(m.at));
  const c = p.find((x) => x.alert.key === 'confirm-s1');
  T.eq(U.epochHM(c.at), '01:30', 'a critical one keeps its time');
  for (let i = 1; i < p.length; i++) T.ok(p[i].at >= p[i - 1].at, 'in time order');
  // the app already sent one today: the plan adds none more today
  const now2 = U.toEpoch('2026-11-30', '10:00');
  const ts2 = NP.times({ results: new Map() }, { weeklyHour: 20 }, null, 0, now2, 1);
  const weekly = (t) => (t >= U.toEpoch('2026-11-30', '20:00') ? [{ key: 'weekly-x', type: 'weekly', push: 'anomaly', severity: 'info' }] : []);
  T.eq(NP.plan(weekly, ts2, { now: now2, pushed: '2026-11-30' }).filter((x) => U.epochKey(x.at) === '2026-11-30').length, 0, 'none more today');
  T.eq(NP.plan(weekly, ts2, { now: now2 }).length, 1, '(without one sent, it is planned)');
  T.ok(/pushed: S\.meta\.lastAnomalyPush/.test(read('src/app/phone-notes.js')), 'the app passes the day it last sent one');
});

T.section('the daily message (the user, 21 Nov 2026: at least one a day, useful, not spam)');
// 2026-11-09 is a Monday; Saturday 14 Nov is the rest day, Friday 13 its eve
const DNOW = U.toEpoch('2026-11-09', '08:00');
const words = (model, x, o) => NP.look(x.alert, model, Object.assign({ now: x.at, roleName: () => 'סדרן' }, o || {}));
T.test('one a day, at 19:00, never at night; the morning before a rest day and its evening after', () => {
  const model = Engine.buildModel(data([]));
  const list = NP.daily(model, { now: DNOW });
  const days = list.map((x) => U.epochKey(x.at));
  T.eq(new Set(days).size, days.length, 'never two on one day');
  T.ok(list.length >= 7, 'every day of the week ahead: ' + list.length);
  for (const x of list) T.ok(!globalThis.Moments.quietHour(x.at), 'not at night: ' + new Date(x.at).toString());
  const at = (k) => list.find((x) => U.epochKey(x.at) === k);
  T.eq(U.epochHM(at('2026-11-09').at), '19:00');
  T.eq(U.epochHM(at('2026-11-13').at), '10:00', 'Friday: in the morning, before Shabbat');
  T.eq(U.epochHM(at('2026-11-14').at), '21:00', 'Saturday: after Shabbat');
  T.ok(list.every((x) => x.alert.push === 'critical' && x.alert.key === 'daily-' + U.epochKey(x.at)), 'planned as its own day, one tag a day');
});
T.test('the same words never two days running', () => {
  const shifts = [];
  for (let i = 1; i <= 8; i++) shifts.push(shift(U.addDays('2026-11-09', -i * 3), '09:00', '15:00', 'done'));
  const model = Engine.buildModel(data(shifts));
  const list = NP.daily(model, { now: DNOW }).map((x) => words(model, x));
  for (let i = 1; i < list.length; i++) T.ok(list[i].title + list[i].body !== list[i - 1].title + list[i - 1].body, 'day ' + i + ': ' + list[i].title);
  for (const n of list) { T.ok(n.title && n.body, 'has words'); T.ok(!/undefined|NaN/.test(n.title + n.body), n.body); }
});
T.test('nothing on a day another notification comes, nothing for today when one came, off by its switch', () => {
  const model = Engine.buildModel(data([]));
  const list = NP.daily(model, { now: DNOW, busy: (k) => k === '2026-11-10' });
  T.ok(!list.some((x) => U.epochKey(x.at) === '2026-11-10'), 'busy day skipped');
  T.eq(NP.daily(model, { now: DNOW, on: false }).length, 0, 'switched off');
  T.ok(!NP.daily(model, { now: U.toEpoch('2026-11-09', '19:30') }).some((x) => U.epochKey(x.at) === '2026-11-09'), 'its hour passed: tomorrow');
  T.eq(U.epochHM(NP.daily(model, { now: DNOW, hour: 9 })[0].at), '09:00', 'the user picks the hour');
});
T.test('what it says: tomorrow\'s shift first, then "did you work today?" on a usual day', () => {
  const p = shift('2026-11-10', '16:00', '22:00');
  const model = Engine.buildModel(data([p]));
  const first = NP.daily(model, { now: DNOW })[0];
  T.eq(first.alert.data.kind, 'tomorrow');
  T.ok(/^מחר ב-16:00: משמרת/.test(words(model, first).title), words(model, first).title);
  T.ok(NP.daily(model, { now: DNOW, eveReminder: true })[0].alert.data.kind !== 'tomorrow', 'the evening-before reminder already speaks of it');
  const usual = [1, 2, 3].map((w) => shift(U.addDays('2026-11-09', -7 * w), '09:00', '15:00', 'done'));
  const m2 = Engine.buildModel(data(usual));
  const mon = NP.daily(m2, { now: DNOW })[0];
  T.eq(mon.alert.data.kind, 'usual');
  T.eq(words(m2, mon).title, 'עבדת היום?');
  T.ok(words(m2, mon).url.includes('action=add'), 'a tap adds the shift');
});
T.test('rights facts: a tap opens the rights, a minor gets no overtime fact, hidden amounts stay hidden', () => {
  const minor = Engine.buildModel(data([], (x) => { x.settings.birthDate = '2010-05-01'; }));
  const ids = NP.daily(minor, { now: DNOW, days: 40 }).filter((x) => x.alert.data.kind === 'tip').map((x) => x.alert.data.tip);
  T.ok(ids.length > 5 && !ids.includes('overtime'), ids.join(','));
  const model = Engine.buildModel(data([]));
  const tip = NP.daily(model, { now: DNOW }).find((x) => x.alert.data.kind === 'tip');
  T.ok(words(model, tip).url.includes('action=rights'), 'opens the rights');
  for (const t of NP.TIPS) T.ok(!/—/.test(t.title + t.body) && t.body.length <= 120, 'short, no em dash: ' + t.id);
  const shifts = [shift('2026-11-02', '09:00', '15:00', 'done')];
  const m3 = Engine.buildModel(data(shifts));
  const month = NP.daily(m3, { now: DNOW, days: 4 }).find((x) => x.alert.data.kind === 'month');
  T.ok(month && /₪/.test(words(m3, month).title), 'the period so far, with its amount');
  T.ok(!/₪/.test(JSON.stringify(words(m3, month, { hideMoney: true }))), 'amounts hidden: none on the lock screen');
});
T.test('the app hands it to the phone, with its switch and hour', () => {
  const src = read('src/app/phone-notes.js');
  T.ok(src.includes('NP.daily(App.model,') && src.includes('shownToday(now)'), 'planned with the rest, not on a day one already came');
  const A = Defaults.defaultSettings().alerts;
  T.eq(A.types.daily, true); T.eq(A.dailyHour, 19);
  T.ok(read('src/app/views-settings.js').includes("'s.alerts.types.daily'"), 'a switch in Settings');
  T.ok(read('src/app/app.js').includes("action === 'rights'"), 'the tap on a fact opens the rights');
});
