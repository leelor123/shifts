/* The net that learns from the salaries that arrived (src/core/netlearn.js) and the engine applying it. */
const T = require('./t.js');
const { NetLearn: L, Engine, Defaults, U } = globalThis;

T.section('the net that learns');
T.test('one answer is not enough; two are', () => {
  T.eq(L.learn({ '2026-08': { a: 'other', exp: 4000, amt: 3800 } }), null);
  const r = L.learn({ '2026-08': { a: 'other', exp: 4000, amt: 3800 }, '2026-09': { a: 'other', exp: 4200, amt: 4000 } });
  T.eq(r.adj, 200); T.eq(r.n, 2);
});
T.test('"yes, exactly" counts as no gap; "not yet" and empty answers do not count', () => {
  const r = L.learn({ '2026-07': { a: 'yes', exp: 4000, amt: 4000 }, '2026-08': { a: 'other', exp: 4000, amt: 3700 }, '2026-09': { a: 'not', exp: 4000 }, '2026-10': { a: 'other', exp: 0, amt: 100 } });
  T.eq(r.adj, 150); T.eq(r.n, 2);
});
T.test('the estimate before the correction is what is learned from (no loop)', () => {
  // the card showed 3800 (already corrected by 200), the raw calculation was 4000, 3800 came in: still 200
  const r = L.learn({ '2026-08': { a: 'yes', exp: 3800, raw: 4000, amt: 3800 }, '2026-09': { a: 'yes', exp: 3800, raw: 4000, amt: 3800 } });
  T.eq(r.adj, 200);
});
T.test('more than calculated: a negative correction', () => {
  const r = L.learn({ '2026-08': { a: 'other', exp: 3000, amt: 3150 }, '2026-09': { a: 'other', exp: 3000, amt: 3100 } });
  T.eq(r.adj, -125);
});
T.test('a month far off (a bonus, a partial month) is left out', () => {
  T.eq(L.learn({ '2026-08': { a: 'other', exp: 4000, amt: 1500 }, '2026-09': { a: 'other', exp: 4000, amt: 3800 } }), null);
});
T.test('a small usual gap is no correction', () => {
  T.eq(L.learn({ '2026-08': { a: 'other', exp: 4000, amt: 3990 }, '2026-09': { a: 'other', exp: 4000, amt: 3985 } }), null);
});
T.test('only the latest six answers count', () => {
  const a = {};
  for (let m = 1; m <= 9; m++) a['2025-0' + m] = { a: 'other', exp: 4000, amt: 3900 };
  for (let m = 1; m <= 6; m++) a['2026-0' + m] = { a: 'other', exp: 4000, amt: m <= 3 ? 3500 : 3700 };
  T.eq(L.learn(a).adj, 400); // 2026-01..06: 500,500,500,300,300,300
});
T.test('a reset: answers up to its period no longer count', () => {
  const a = { '2026-07': { a: 'other', exp: 4000, amt: 3700 }, '2026-08': { a: 'other', exp: 4000, amt: 3700 } };
  T.eq(L.resetKeyOf(a), '2026-08');
  T.eq(L.learn(a, '2026-08'), null);
  a['2026-09'] = { a: 'other', exp: 4000, amt: 3900 };
  a['2026-10'] = { a: 'other', exp: 4000, amt: 3900 };
  T.eq(L.learn(a, '2026-08').adj, 100);
});
T.test('never more than 25% of the gross, either way; nothing on a month with no gross', () => {
  T.eq(L.capped(900, 2000), 500);
  T.eq(L.capped(-900, 2000), -500);
  T.eq(L.capped(300, 2000), 300);
  T.eq(L.capped(300, 0), 0);
  const n = L.apply({ gross: 2000, net: 1900 }, 900);
  T.eq(n.net, 1400); T.eq(n.learned, 500); T.eq(n.rawNet, 1900);
  const same = { gross: 0, net: 0 };
  T.ok(L.apply(same, 200) === same);
});
T.test('broken answers do not break it', () => {
  T.eq(L.learn(null), null);
  T.eq(L.learn({ a: null, b: 'x', c: { a: 'other', exp: 'abc', amt: 5 } }), null);
});

T.section('the engine with the learned net');
function model(netAdj) {
  const settings = Defaults.defaultSettings();
  settings.startDate = '2025-01-01';
  const emp = Object.assign(Defaults.defaultEmployer(), { otLaw: false, otThreshold: 8 });
  const shifts = [];
  for (let d = 1; d <= 20; d++) {
    const k = '2026-09-' + U.pad(d);
    if (U.dow(k) > 4) continue;
    shifts.push({ id: 'n' + d, kind: 'shift', employerId: 'emp1', roleId: 'r_sadran', status: 'done', start: U.toEpoch(k, '08:00'), end: U.toEpoch(k, '16:00'), breakMin: 0, breakPaid: true, items: [] });
  }
  return Engine.buildModel({ settings, employers: [emp], roles: Defaults.defaultRoles(), dayRules: [], shifts, entries: [], netAdj });
}
T.test('the period summary moves the net by the correction and says so', () => {
  const a = Engine.periodSummary(model(0), '2026-09', 'emp1');
  const b = Engine.periodSummary(model(150), '2026-09', 'emp1');
  T.near(b.net.net, a.net.net - 150, 0.01); T.eq(b.net.learned, 150); T.eq(a.net.learned, undefined);
  T.near(b.gross, a.gross, 0.01);
});
T.test('the period summary caps it at 25% of the gross', () => {
  const b = Engine.periodSummary(model(1e6), '2026-09', 'emp1');
  T.near(b.net.learned, b.gross * 0.25, 0.01);
});
T.test('an empty month gets no correction', () => {
  const b = Engine.periodSummary(model(150), '2026-11', 'emp1');
  T.ok(!b.net.learned); T.eq(b.net.net, 0);
});
T.test('a range summary takes its share of the correction', () => {
  const a = Engine.rangeSummary(model(0), '2026-09-01', '2026-09-30');
  const b = Engine.rangeSummary(model(200), '2026-09-01', '2026-09-30');
  T.near(b.net.net, a.net.net - 200, 0.01); T.near(b.net.learned, 200, 0.01);
});
