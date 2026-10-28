/* The friends' competition: the amounts a card carries, the table's order, the friends list, invitation codes. */
const { Friends: FR, Engine, Defaults, U } = globalThis;
const T = require('./t.js');

T.section('friends');
let n = 0;
function shift(date, from, to, extra) {
  return Object.assign({ id: 'f' + (++n), kind: 'shift', employerId: 'emp1', roleId: 'r_sadran', status: 'done', start: U.toEpoch(date, from), end: U.toEpoch(date, to), breakMin: 0, breakPaid: true, items: [] }, extra || {});
}
function model(shifts) {
  const settings = Defaults.defaultSettings(); settings.startDate = '2025-01-01';
  return Engine.buildModel({ settings, employers: [Defaults.defaultEmployer()], roles: Defaults.defaultRoles(), dayRules: [], shifts, entries: [] });
}
T.test('a card\'s amounts: this month, this year, all time, per hour (worked shifts only)', () => {
  // weekdays of 8 hours at the default 40 ₪, travel 16 ₪ a day: per hour stays 40 (travel is not pay for the hour)
  const m = model([shift('2025-11-11', '08:00', '16:00'), shift('2026-09-08', '08:00', '16:00'), shift('2026-10-12', '08:00', '16:00'), shift('2026-10-13', '08:00', '16:00'),
    shift('2026-10-20', '08:00', '16:00', { status: 'planned' })]);
  const s = FR.stats(m, Engine, '2026-10-15');
  const day = 320 + 16;
  T.eq(s.m.k, 202610); T.eq(s.m.v, 2 * day, 'October: two worked days');
  T.eq(s.y.k, 2026); T.eq(s.y.v, 3 * day, '2026: three');
  T.eq(s.a, 4 * day, 'all time: four (the planned one is not worked yet)');
  T.eq(s.h, 40, 'per hour: the pay for the work only');
});
T.test('per hour falls back to all time when this year has no hours, and is 0 with none at all', () => {
  T.eq(FR.stats(model([shift('2025-11-11', '08:00', '16:00')]), Engine, '2026-10-15').h, 40);
  const z = FR.stats(model([]), Engine, '2026-10-15');
  T.eq(z.h, 0); T.eq(z.a, 0); T.eq(z.m.v, 0);
});
T.test('last month\'s and last year\'s amounts never count as this one\'s', () => {
  const s = { m: { k: 202609, v: 5000 }, y: { k: 2025, v: 9000 }, a: 20000, h: 41.5 };
  T.eq(FR.valueOf(s, 'm', '2026-10-15'), 0); T.eq(FR.valueOf(s, 'y', '2026-10-15'), 0);
  T.eq(FR.valueOf(s, 'a', '2026-10-15'), 20000); T.eq(FR.valueOf(s, 'h', '2026-10-15'), 41.5);
  T.eq(FR.valueOf(s, 'm', '2026-09-30'), 5000);
  T.eq(FR.valueOf(null, 'm', '2026-10-15'), null, 'hidden: no amount');
});
T.test('the table: highest first, equal amounts share a place, then the hidden ones, then the pending ones', () => {
  const S = (v, h) => ({ m: { k: 202610, v }, y: { k: 2026, v }, a: v, h });
  const rows = [
    { uid: 'a', n: 'אלון', s: S(3000, 38) }, { uid: 'b', n: 'בר', s: S(5000, 45) }, { uid: 'c', n: 'גל', s: S(3000, 50) },
    { uid: 'd', n: 'דנה', hide: true }, { uid: 'e', n: 'הדר', state: 'pending' }, { uid: 'f', n: 'ורד', s: { m: { k: 202609, v: 9999 }, y: { k: 2026, v: 1 }, a: 1, h: 1 } },
  ];
  const t = FR.table(rows, 'm', '2026-10-15');
  T.eq(t.map((r) => r.uid).join(''), 'bacfde', 'order');
  T.eq(t.map((r) => r.rank).join(), '1,2,2,4,,', 'places (equal share; the hidden and pending have none)');
  T.eq(t[3].v, 0, 'an old month counts as 0 this month');
  T.eq(FR.table(rows, 'h', '2026-10-15').map((r) => r.uid).slice(0, 3).join(''), 'cba', 'per hour');
  T.eq(FR.table([], 'm', '2026-10-15').length, 0);
});
T.test('the friends list: no duplicates, never myself, at most 50; removing', () => {
  let f = FR.addFriend([], 'u2', 'me');
  f = FR.addFriend(f, 'u2', 'me'); f = FR.addFriend(f, 'me', 'me'); f = FR.addFriend(f, '', 'me');
  T.eq(f.join(), 'u2');
  T.eq(FR.addFriend(['u1', 'u1', 'me', 'u3'], 'u4', 'me').join(), 'u1,u3,u4', 'a broken list is cleaned');
  const full = Array.from({ length: 50 }, (_, i) => 'x' + i);
  T.eq(FR.addFriend(full, 'y', 'me').length, 50, 'the 51st is not added');
  T.eq(FR.removeFriend(['u1', 'u2'], 'u1').join(), 'u2');
});
T.test('invitation codes: 20 characters the rules accept, read back from the address', () => {
  const c = FR.code();
  T.ok(/^[a-z0-9]{20}$/.test(c), c);
  T.ok(FR.code() !== c, 'a new one each time');
  T.eq(FR.codeFrom('?friend=' + c), c);
  T.eq(FR.codeFrom('?source=twa&friend=' + c + '&x=1'), c);
  T.eq(FR.codeFrom('?friend=short'), null, 'too short to be one');
  T.eq(FR.codeFrom('?friend=<script>abcdefghijklmnop'), null);
  T.eq(FR.codeFrom(''), null);
});
