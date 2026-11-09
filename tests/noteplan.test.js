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
  T.ok(w.includes('if (root.__appPort) whenReady(') && w.includes('function take(p)'), 'widgets.js takes a port that came early');
});
T.test('in a browser the worker shows the kept list (no second set of words in sw.js)', () => {
  const sw = read('src/sw.js');
  T.ok(sw.includes("c.match('./__plan')") && sw.includes("self.addEventListener('periodicsync'"));
  T.ok(!/timerT|upT|cdT/.test(sw), 'the old words of their own are gone');
  T.ok(sw.includes("type: 'shaati-open'"), 'a tap while the app is open goes there without loading again');
});
