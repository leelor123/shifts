/* Monthly recap: the right slides, real numbers, nothing silly. */
const { Recap } = globalThis;
const T = require('./t.js');

const base = () => ({
  shifts: 6, gross: 2400, hours: 48, workDays: 6, restPremium: 120, otPremium: 30, nightPremium: 0, evePremium: 0,
  travel: 90, restHours: 8, otHours: 2, longest: { paidMin: 540, dateKey: '2026-09-12' }, bestDay: { key: '2026-09-12', amount: 520 },
  byRole: { a: { hours: 30, amount: 1500 }, b: { hours: 18, amount: 900 } }, startHours: [18, 19, 17, 20, 18, 16],
});

T.section('monthly recap');
T.test('a full month: every slide, in order', () => {
  const r = Recap.build(base(), { gross: 2000 }, { key: '2026-09', label: 'ספטמבר', prevLabel: 'אוגוסט', net: 2300, roleName: (id) => (id === 'a' ? 'סדרן' : 'מזנון') });
  T.eq(r.slides.map((s) => s.k).join(','), 'intro,earned,time,best,extras,role,clock,fun,outro');
  const s = Object.fromEntries(r.slides.map((x) => [x.k, x]));
  T.eq(s.earned.delta, 20);
  T.eq(s.earned.net, 2300);
  T.eq(s.time.movies, 24);
  T.eq(s.time.longestMin, 540);
  T.eq(s.extras.amount, 150);
  T.eq(s.role.name, 'סדרן');
  T.eq(s.role.share, 63);
  T.eq(s.clock.type, 'night');
  T.eq(s.fun.items.length, 2);
  T.ok(s.fun.items.every((i) => i.count >= 1 && i.name && i.emoji), 'fun items are real');
});
T.test('a quiet month: only what is true', () => {
  const t = Object.assign(base(), { shifts: 1, gross: 150, hours: 4, restPremium: 0, otPremium: 0, travel: 0, byRole: { a: { hours: 4, amount: 150 } }, startHours: [9], longest: { paidMin: 240, dateKey: '2026-09-03' } });
  const r = Recap.build(t, null, { key: '2026-09', label: 'ספטמבר', net: 150 });
  T.eq(r.slides.map((s) => s.k).join(','), 'intro,earned,time,fun,outro');
  T.eq(r.slides[1].delta, null);
});
T.test('no work, no recap; strange numbers never leak', () => {
  T.eq(Recap.build(Object.assign(base(), { shifts: 0, gross: 0 }), null, {}), null);
  T.eq(Recap.build(null, null, {}), null);
  const r = Recap.build(base(), { gross: 0.5 }, { key: 'k', net: 0 });
  T.eq(r.slides[1].delta, null, 'a huge jump from almost nothing is not shown');
  T.eq(r.slides[1].net, null);
  T.ok(JSON.stringify(r).match(/NaN|Infinity|undefined/) == null, 'no broken numbers');
});
T.test('fun items: stable per month, readable counts', () => {
  const a = Recap.funItems(2300, '2026-09'), b = Recap.funItems(2300, '2026-09');
  T.eq(JSON.stringify(a), JSON.stringify(b));
  T.ok(a.every((i) => i.count >= 2 && i.count <= 40), 'counts between 2 and 40: ' + a.map((i) => i.count));
  T.eq(a[0].name === a[1].name, false);
  T.eq(Recap.funItems(0, 'x').length, 0);
  T.ok(Recap.funItems(20, 'x').length >= 1, 'even a small amount buys a coffee');
  T.eq(Recap.clockStyle([7, 8]).type, 'morning');
  T.eq(Recap.clockStyle([12, 13]).type, 'day');
  T.eq(Recap.clockStyle([9]), null);
});
