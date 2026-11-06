/* The signed shift log (src/core/ledger.js): append, verify, a broken chain found, how a shift was recorded. */
const T = require('./t.js');
const L = require('../src/core/ledger.js');
const subtle = require('crypto').webcrypto.subtle;

T.section('signed shift log (ledger)');
const H = 3600000, T0 = Date.UTC(2026, 10, 1, 6, 0);

async function chain(c, list, base) {
  const evs = (base || []).slice();
  for (const f of list) evs.push(await L.append(evs, c, f, subtle));
  return evs;
}
const workday = () => [
  { k: 'start', t: T0, v: 'timer', at: T0 + 1000 },
  { k: 'stop', shiftId: 's1', s: T0, e: T0 + 8 * H, v: 'timer', at: T0 + 8 * H + 2000 },
  { k: 'create', shiftId: 's2', s: T0 + 24 * H, e: T0 + 30 * H, v: 'hand', at: T0 + 40 * H },
];

T.atest('append numbers the records and links each to the one before', async () => {
  const evs = await chain('dev1', workday());
  T.eq(evs.map((x) => x.n).join(','), '1,2,3');
  T.eq(evs[0].prev, '', 'the first record has no previous hash');
  T.eq(evs[1].prev, evs[0].hash);
  T.eq(evs[2].prev, evs[1].hash);
  T.ok(/^[0-9a-f]{64}$/.test(evs[2].hash), 'SHA-256 hex');
  T.eq(evs[1].id, 'lg_dev1_2');
  T.eq(evs[1].hash, await L.hashOf(evs[0].hash, evs[1], subtle), 'hash = SHA-256(prev | fields)');
});

T.atest('verify: an untouched chain is whole and gives its last hash', async () => {
  const evs = await chain('dev1', workday());
  const v = await L.verify(evs, subtle);
  T.ok(v.ok, 'whole');
  T.eq(v.count, 3);
  T.eq(v.head, evs[2].hash);
  // the order records arrive in (the cloud) does not matter
  T.ok((await L.verify(evs.slice().reverse(), subtle)).ok);
  // fields the phone keeps beside a record (sync versions) are not signed
  T.ok((await L.verify(evs.map((x) => Object.assign({}, x, { updatedAt: 99, _syncedAt: 99 })), subtle)).ok);
});

T.atest('verify: a changed time breaks the chain at that record', async () => {
  const evs = await chain('dev1', workday());
  const bad = evs.map((x) => Object.assign({}, x));
  bad[1].e = T0 + 10 * H; // "the shift ended at 16:00, not 14:00"
  const v = await L.verify(bad, subtle);
  T.ok(!v.ok, 'broken');
  T.eq(v.chains[0].badAt, 2);
  T.eq(v.chains[0].why, 'hash');
  T.eq(v.head, '');
});

T.atest('verify: a re-signed record still breaks the next link', async () => {
  const evs = await chain('dev1', workday());
  const bad = evs.map((x) => Object.assign({}, x));
  bad[1].e = T0 + 10 * H;
  bad[1].hash = await L.hashOf(bad[1].prev, bad[1], subtle);
  const v = await L.verify(bad, subtle);
  T.ok(!v.ok);
  T.eq(v.chains[0].badAt, 3);
  T.eq(v.chains[0].why, 'prev');
});

T.atest('verify: a removed record or a second record with the same number is found', async () => {
  const evs = await chain('dev1', workday());
  const gap = await L.verify([evs[0], evs[2]], subtle);
  T.ok(!gap.ok); T.eq(gap.chains[0].why, 'gap');
  const fork = evs.slice(0, 2).concat([await L.append(evs.slice(0, 1), 'dev1', { k: 'create', shiftId: 'x', s: 1, e: 2, v: 'hand', at: 5 }, subtle)]);
  const f = await L.verify(fork, subtle);
  T.ok(!f.ok); T.eq(f.chains[0].why, 'double');
});

T.atest('two phones: two chains, one combined last hash', async () => {
  const a = await chain('devA', workday());
  const b = await chain('devB', [{ k: 'create', shiftId: 's9', s: T0, e: T0 + H, v: 'hand', at: T0 + 2 * H }]);
  const v = await L.verify(a.concat(b), subtle);
  T.ok(v.ok);
  T.eq(v.chains.length, 2);
  T.eq(v.head, await L.sha256(a[2].hash + '|' + b[0].hash, subtle));
});

T.atest('status: real time, by hand, edited, and nothing for an older shift', async () => {
  const evs = await chain('dev1', workday());
  const s1 = { id: 's1', status: 'done', start: T0, end: T0 + 8 * H };
  T.eq(L.status(s1, evs).mode, 'live');
  T.eq(L.status({ id: 's2', status: 'done', start: T0 + 24 * H, end: T0 + 30 * H }, evs).mode, 'hand');
  T.eq(L.status({ id: 'old', start: 1, end: 2 }, evs), null, 'a shift from before the log');
  // edited afterwards: the old times are kept
  const ed = await chain('dev1', [{ k: 'edit', shiftId: 's1', s: T0, e: T0 + 9 * H, os: T0, oe: T0 + 8 * H, v: 'hand', at: T0 + 50 * H }], evs);
  const st = L.status(Object.assign({}, s1, { end: T0 + 9 * H }), ed);
  T.eq(st.mode, 'edited'); T.eq(st.at, T0 + 50 * H); T.eq(st.oe, T0 + 8 * H);
  // changed without a record (an older app on another phone): not real time
  T.eq(L.status(Object.assign({}, s1, { end: T0 + 7 * H, updatedAt: 7 }), evs).mode, 'edited');
  // stopped "at 16:10" an hour after: the end was not pressed at that moment
  const late = await chain('d2', [{ k: 'start', t: T0, v: 'timer', at: T0 }, { k: 'stop', shiftId: 'q', s: T0, e: T0 + 4 * H, v: 'timer', at: T0 + 5 * H }]);
  T.eq(L.status({ id: 'q', start: T0, end: T0 + 4 * H }, late).mode, 'edited');
  // a widget tap keeps the moment of the tap even when the app saves it later
  const w = await chain('d3', [{ k: 'start', t: T0, v: 'widget', at: T0 + H }, { k: 'stop', shiftId: 'w', s: T0, e: T0 + 4 * H, v: 'widget', at: T0 + 6 * H }]);
  T.eq(L.status({ id: 'w', start: T0, end: T0 + 4 * H }, w).mode, 'live');
});

T.test('changeFields: what each change writes', () => {
  const a = { id: 'a', status: 'done', start: 10, end: 20, breakMin: 30 };
  T.eq(L.changeFields(null, a, 'timer', 5).k, 'stop');
  T.eq(L.changeFields(null, a, null, 5).k, 'create');
  T.eq(L.changeFields(a, null, null, 5).k, 'delete');
  const e = L.changeFields(a, Object.assign({}, a, { end: 25 }), null, 5);
  T.eq(e.k, 'edit'); T.eq(e.oe, 20); T.eq(e.e, 25);
  T.eq(L.changeFields(a, Object.assign({}, a, { note: 'hi' }), null, 5), null, 'a note is not a time change');
  T.eq(L.changeFields(null, Object.assign({}, a, { status: 'planned' }), null, 5), null, 'a plan is not logged');
  T.eq(L.changeFields(Object.assign({}, a, { status: 'planned' }), a, null, 5).k, 'create', 'a planned shift marked done');
});

T.test('clean: records of another shape are dropped', () => {
  const ok = { id: 'lg_dev1_1', c: 'dev1', n: 1, k: 'create', at: 5, prev: '', hash: 'a'.repeat(64), s: 1, e: 2, v: 'hand' };
  T.ok(L.clean(Object.assign({}, ok)));
  T.eq(L.clean(Object.assign({}, ok, { k: 'hack' })), null);
  T.eq(L.clean(Object.assign({}, ok, { hash: '<b>' })), null);
  T.eq(L.clean(Object.assign({}, ok, { s: '<img>' })), null);
  T.eq(L.clean(Object.assign({}, ok, { c: 'a"b' })), null);
});
