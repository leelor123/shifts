/* ============================================================
 * ledger.js — the signed shift log (pure, tested).
 *
 * When there is a dispute an employer may say "you changed your hours afterwards". The log keeps one record per
 * thing that happened to a shift: the timer's start and stop, a shift added by hand, an edit (the times before and
 * after) and a deletion, each with the phone's clock at that moment. Records are never changed or removed.
 *
 * Each phone writes its own chain (c): record n holds the hash of record n-1 (prev), and its own hash is
 * SHA-256(prev + "|" + its fields). Changing, removing or inserting any record breaks every hash after it, so
 * verify() finds it. The hash shows what was recorded and when; it does not prove by itself that the hours are true.
 * ============================================================ */
(function (root) {
  'use strict';
  const KINDS = ['start', 'stop', 'create', 'edit', 'delete'];
  const VIA = ['timer', 'widget', 'hand'];
  // the fields a hash covers, in a fixed order (what the phone stores besides them, like updatedAt, is not signed)
  const FIELDS = ['c', 'n', 'k', 'shiftId', 't', 's', 'e', 'os', 'oe', 'b', 'ob', 'v', 'at'];
  // the timer's moment is real time when the press and the time recorded are this close
  const LIVE_MS = 2 * 60000;
  const HEX64 = /^[0-9a-f]{64}$/;

  /** The signed text of a record: its fields in a fixed order, missing ones as null. */
  function canon(ev) {
    return JSON.stringify(FIELDS.map((k) => (ev[k] === undefined ? null : ev[k])));
  }
  const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  /** SHA-256 of a text, as 64 hex digits (the browser's crypto.subtle, or the one passed for tests). */
  async function sha256(text, subtle) {
    const s = subtle || (root.crypto && root.crypto.subtle);
    if (!s) throw new Error('no crypto.subtle');
    return toHex(await s.digest('SHA-256', new TextEncoder().encode(text)));
  }
  const hashOf = (prev, ev, subtle) => sha256((prev || '') + '|' + canon(ev), subtle);

  /** The last record of a chain in a list (highest n). */
  function lastOf(events, c) {
    let last = null;
    for (const x of events) if (x.c === c && (!last || x.n > last.n)) last = x;
    return last;
  }
  /**
   * A new record at the end of chain c: fields = { k, shiftId, t, s, e, os, oe, b, ob, v, at }.
   * Returns the record (id, n, prev and hash set); the caller saves it.
   */
  async function append(events, c, fields, subtle) {
    if (!KINDS.includes(fields.k)) throw new Error('ledger: unknown kind ' + fields.k);
    const last = lastOf(events, c);
    const ev = { c, n: last ? last.n + 1 : 1 };
    for (const k of FIELDS) if (k !== 'c' && k !== 'n' && fields[k] != null) ev[k] = fields[k];
    if (ev.at == null) ev.at = Date.now();
    ev.prev = last ? last.hash : '';
    ev.hash = await hashOf(ev.prev, ev, subtle);
    ev.id = 'lg_' + c + '_' + ev.n;
    return ev;
  }

  /**
   * Checks every chain: numbered 1, 2, 3… with no gap or double, each prev the hash before it, each hash right.
   * Returns { ok, count, head, chains: [{ c, count, head, ok, badAt, why }] }. head is the last hash of the only
   * chain, or SHA-256 of all the chains' last hashes (sorted, joined by "|") when there are several phones.
   */
  async function verify(events, subtle) {
    const by = new Map();
    for (const x of events || []) { if (!by.has(x.c)) by.set(x.c, []); by.get(x.c).push(x); }
    const chains = [];
    for (const [c, list] of [...by.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
      list.sort((a, b) => a.n - b.n);
      const ch = { c, count: list.length, head: '', ok: true, badAt: null, why: '' };
      let prev = '';
      for (let i = 0; i < list.length; i++) {
        const x = list[i];
        const fail = (why) => { ch.ok = false; ch.badAt = x.n; ch.why = why; };
        if (x.n !== i + 1) { fail(x.n === i ? 'double' : 'gap'); break; }
        if ((x.prev || '') !== prev) { fail('prev'); break; }
        if (!HEX64.test(String(x.hash)) || (await hashOf(prev, x, subtle)) !== x.hash) { fail('hash'); break; }
        prev = x.hash;
      }
      ch.head = ch.ok ? prev : '';
      chains.push(ch);
    }
    const ok = chains.every((x) => x.ok);
    let head = '';
    if (chains.length === 1) head = chains[0].head;
    else if (chains.length > 1) head = await sha256(chains.map((x) => x.head || ('broken:' + x.c)).join('|'), subtle);
    return { ok, count: (events || []).length, head, chains };
  }

  const live = (ev, at) => ev && (ev.v === 'widget' || (ev.v === 'timer' && Math.abs(at - ev.at) <= LIVE_MS));
  /**
   * How a shift was recorded, from the log: { mode: 'live' } (started and stopped on the timer, at the moments it
   * says), { mode: 'hand', at } (added by hand), { mode: 'edited', at, os, oe } (changed after it was recorded; os/oe
   * its times before the last change), or null when the log has nothing about it (a shift from before the log).
   */
  function status(shift, events) {
    if (!shift) return null;
    const own = (events || []).filter((x) => x.shiftId === shift.id && x.k !== 'start').sort((a, b) => a.at - b.at || a.n - b.n);
    if (!own.length) return null;
    const first = own[0], last = own[own.length - 1];
    const same = last.s === shift.start && last.e === shift.end;
    if (!same) return { mode: 'edited', at: shift.updatedAt || last.at, os: last.s, oe: last.e };
    if (last.k === 'edit') return { mode: 'edited', at: last.at, os: last.os, oe: last.oe };
    if (last.k === 'create') return { mode: 'hand', at: last.at };
    if (last.k === 'stop' && own.length === 1) {
      const start = (events || []).find((x) => x.k === 'start' && x.t === shift.start);
      if (live(first, first.e) && live(start, start && start.t)) return { mode: 'live', at: first.at, startAt: start.at };
      return { mode: 'edited', at: first.at };
    }
    return { mode: 'edited', at: last.at };
  }

  /**
   * The records to write for a change to the shifts (pure: no hashing here). was/now are the shift before and after
   * (null when it did not exist / was deleted); via = 'timer' | 'widget' when the timer saved it. Only worked shifts
   * count (a planned one is a plan); a change that leaves the times and the break as they were writes nothing.
   */
  function changeFields(was, now, via, at) {
    const done = (x) => !!x && x.kind !== 'entry' && (x.status || 'done') === 'done';
    const w = done(was) ? was : null, n = done(now) ? now : null;
    if (!w && !n) return null;
    const b = (x) => (x && x.breakMin != null && Number.isFinite(+x.breakMin) ? +x.breakMin : null);
    if (!w) return { k: via ? 'stop' : 'create', shiftId: n.id, s: n.start, e: n.end, b: b(n), v: via || 'hand', at };
    if (!n) return { k: 'delete', shiftId: w.id, os: w.start, oe: w.end, ob: b(w), v: 'hand', at };
    if (w.start === n.start && w.end === n.end && b(w) === b(n)) return null;
    return { k: 'edit', shiftId: n.id, s: n.start, e: n.end, b: b(n), os: w.start, oe: w.end, ob: b(w), v: 'hand', at };
  }

  /** A record from outside (the cloud, a backup) keeps only the shapes this code writes, or is dropped (null). */
  function clean(r) {
    if (!r || typeof r !== 'object' || !KINDS.includes(r.k) || typeof r.c !== 'string' || !/^[A-Za-z0-9]{4,40}$/.test(r.c)) return null;
    if (!Number.isInteger(r.n) || r.n < 1 || !Number.isFinite(r.at) || !HEX64.test(String(r.hash))) return null;
    if (!(r.prev === '' || HEX64.test(String(r.prev)))) return null;
    for (const k of ['t', 's', 'e', 'os', 'oe', 'b', 'ob']) if (r[k] != null && !Number.isFinite(r[k])) return null;
    if (r.v != null && !VIA.includes(r.v)) return null;
    return r;
  }

  root.Ledger = { canon, sha256, hashOf, append, verify, status, changeFields, clean, lastOf, KINDS, LIVE_MS };
  if (typeof module !== 'undefined') module.exports = root.Ledger;
})(typeof window !== 'undefined' ? window : globalThis);
