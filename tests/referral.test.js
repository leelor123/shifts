/* "Invite a friend, and both get a month of Shaati Plus": codes, links, the gift's months, who may take one. */
const { Referral: R } = globalThis;
const T = require('./t.js');
const D = R.DAY;
const t0 = Date.UTC(2026, 9, 1);

T.section('invite a friend');
T.test('a code: 12 letters and digits the rules accept, read back from the address (never a uid)', () => {
  const c = R.code();
  T.ok(/^[a-z0-9]{12}$/.test(c), c);
  T.eq(R.codeFrom('?ref=' + c), c);
  T.eq(R.codeFrom('?source=twa&ref=' + c + '&x=1'), c);
  T.eq(R.codeFrom('?ref=short'), null, 'too short');
  T.eq(R.codeFrom('?ref=ABCDEFGHIJKL'), null, 'capitals are not a code');
  T.eq(R.codeFrom('?friend=abcdefghijklmnop'), null);
  T.eq(R.code(() => Array.from({ length: 12 }, (_, i) => i)), 'abcdefghijkm');
});
T.test('the invited friend: a month from the day they joined', () => {
  const g = R.gift(t0, []);
  T.eq(g.until, t0 + 30 * D); T.eq(g.months, 1); T.eq(g.friends, 0);
  T.eq(R.gift(null, []).until, 0, 'not invited, nobody invited: nothing');
});
T.test('the inviter: a month for each friend, one after the other', () => {
  const g = R.gift(null, [t0, t0 + 2 * D, t0 + 90 * D]);
  // two friends two days apart: the second month starts when the first ends; the third friend came after both ended
  T.eq(g.until, t0 + 90 * D + 30 * D);
  T.eq(g.months, 3); T.eq(g.friends, 3);
  T.eq(R.gift(null, [t0 + 2 * D, t0]).until, t0 + 60 * D, 'in any order');
});
T.test('invited and inviting: the months add up', () => {
  T.eq(R.gift(t0, [t0 + D]).until, t0 + 60 * D);
});
T.test(`at most ${R.MAX} months from inviting (fake accounts can't make it endless)`, () => {
  const many = Array.from({ length: 20 }, (_, i) => t0 + i * D);
  const g = R.gift(null, many);
  T.eq(g.months, R.MAX); T.eq(g.friends, 20);
  T.eq(g.until, t0 + R.MAX * 30 * D);
  T.eq(R.gift(t0, many).months, R.MAX + 1, 'being invited is one more');
});
T.test('bad entries count for nothing', () => {
  T.eq(R.gift('x', [null, 0, -5, 'y']).until, 0);
});
T.test('who may take a link\'s gift: someone new, within 30 days of opening it', () => {
  const now = t0 + 5 * D;
  T.ok(R.canClaim({ hadShifts: false, linkAt: t0, now }));
  T.ok(!R.canClaim({ hadShifts: true, linkAt: t0, now }), 'had shifts before the link: not new');
  T.ok(!R.canClaim({ hadShifts: false, linkAt: t0 - 31 * D, now }), 'an old link');
  T.ok(!R.canClaim({ hadShifts: false, linkAt: now + D, now }), 'a link from the future');
  T.ok(!R.canClaim(null));
});
