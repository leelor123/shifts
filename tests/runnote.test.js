/* The notification that stays while a shift runs: its words, when it is shown again, and the kept "end shift" tap
 * (src/core/runnote.js), plus the parts of the worker and the app that must stay in step with it. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const R = globalThis.RunNote;
const U = globalThis.U;
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi || 0).getTime();
const MIN = 60000;

T.section('the running-shift notification');
T.test('the title says when the shift began; the body the amount and the time it was worked out', () => {
  const c = R.content({ start: at(2026, 11, 6, 17, 0), now: at(2026, 11, 6, 19, 45), wage: 112.6 });
  T.eq(c.title, 'משמרת רצה מ-17:00');
  T.eq(c.body, `בערך ${U.money(113, 0)} עד 19:45`);
});
T.test('on a break it says so first', () => {
  const c = R.content({ start: at(2026, 11, 6, 17, 0), now: at(2026, 11, 6, 18, 0), wage: 40, onBreak: true });
  T.eq(c.body, `בהפסקה · בערך ${U.money(40, 0)} עד 18:00`);
});
T.test('hidden amounts stay hidden on the lock screen; no amount at the very start', () => {
  const s = at(2026, 11, 6, 17, 0);
  T.ok(!R.content({ start: s, now: s + 60 * MIN, wage: 40, hideMoney: true }).body.includes(U.money(40, 0)));
  T.eq(R.content({ start: s, now: s, wage: 0 }).body, 'לחצו כדי לפתוח את שעתי');
  T.eq(R.content({ start: s, now: s, wage: null }).body, 'לחצו כדי לפתוח את שעתי');
});
T.test('never a word on what is legal or not', () => {
  const c = R.content({ start: at(2026, 11, 6, 23, 0), now: at(2026, 11, 7, 2, 0), wage: 120, onBreak: true });
  T.ok(!/חוק|חוקי|אסור/.test(c.title + c.body));
});
T.test('shown again at once when the shift changes, otherwise every 15 minutes at most', () => {
  const a = { start: 1000, breaks: [], splits: [] };
  const k = R.keyOf(a);
  const t0 = at(2026, 11, 6, 17, 0);
  T.ok(R.due(null, k, t0));
  T.ok(!R.due({ key: k, at: t0 }, k, t0 + 14 * MIN));
  T.ok(R.due({ key: k, at: t0 }, k, t0 + 15 * MIN));
  const onBreak = R.keyOf({ start: 1000, breaks: [{ from: 2000 }], splits: [] });
  T.ok(onBreak !== k);
  T.ok(R.due({ key: k, at: t0 }, onBreak, t0 + MIN));
  T.ok(R.keyOf({ start: 1000, breaks: [{ from: 2000, to: 3000 }] }) !== onBreak, 'back from the break is another key');
  T.ok(R.keyOf({ start: 1000, splits: [{ at: 5, roleId: 'r2' }] }) !== k, 'another role is another key');
  T.ok(!R.due(null, R.keyOf(null), t0), 'no shift: nothing to show');
});
T.test('a kept "end shift" tap ends only the shift it was tapped on, once it began, and not when too old', () => {
  const now = at(2026, 11, 6, 20, 0);
  const a = { start: at(2026, 11, 6, 17, 0) };
  T.ok(R.pendingFits({ at: now - MIN, start: a.start }, a, now));
  T.ok(!R.pendingFits({ at: now - MIN, start: a.start + 1 }, a, now), 'another shift');
  T.ok(!R.pendingFits({ at: a.start - MIN, start: a.start }, a, now), 'before it began');
  T.ok(!R.pendingFits({ at: now - MIN, start: a.start }, null, now), 'no shift runs');
  T.ok(!R.pendingFits({ at: now + 5 * MIN, start: a.start }, a, now), 'in the future');
  T.ok(!R.pendingFits({ at: now - 25 * 60 * MIN, start: a.start + 0 }, { start: now - 30 * 60 * MIN }, now), 'too old');
  T.ok(!R.pendingFits(null, a, now));
});
T.test('the worker and the app use the same tag and the same kept-tap place', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'src', 'sw.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'run-note.js'), 'utf8');
  T.ok(sw.includes(`const RUN_TAG = '${R.TAG}'`), 'sw.js RUN_TAG matches RunNote.TAG');
  T.ok(sw.includes("'./__runnote'") && app.includes("'./__runnote'"), 'the same cache key');
  T.ok(sw.includes("'shaati-run-stop'") && app.includes("'shaati-run-stop'"), 'the same message to end the shift');
  T.ok(sw.includes("'shaati-go-home'") && app.includes("'shaati-go-home'"), 'the same message to go home');
  T.ok(/silent: true/.test(app) && /requireInteraction: true/.test(app), 'silent and staying');
  T.ok(/action: 'stop'/.test(app) && /e\.action === 'stop'/.test(sw), 'the button the worker listens for');
});
T.test('off unless switched on', () => {
  T.eq(globalThis.Defaults.defaultSettings().alerts.runNote, false);
});
