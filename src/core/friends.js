/* ============================================================
 * friends.js — the friends' competition (pure, tested).
 *
 * Friends add each other with an invitation link; each one has a card,
 * fr/{uid}: a nickname, an emoji, the friends it lets read it (f), and
 * the amounts (s) unless the player hides them:
 *   m: this month's gross  { k: 202610, v: 6834 }
 *   y: this year's gross   { k: 2026,   v: 40210 }
 *   a: all time's gross
 *   h: pay per hour this year (the work's pay, premiums included,
 *      without travel or bonuses; all time when nothing this year)
 * A month or a year is stored with its key, so last month's amount
 * never counts as this month's. firestore.rules checks the same shape.
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const MAX_FRIENDS = 50;
  const PERIODS = ['h', 'm', 'y', 'a'];
  const monthKey = (k) => +k.slice(0, 7).replace('-', '');
  const yearKey = (k) => +k.slice(0, 4);

  /** My amounts as of a day, from the app's model (Engine.totals: worked shifts only). */
  function stats(model, Engine, dateKey) {
    const all = Engine.totals(model, '1900-01-01', dateKey);
    const yr = Engine.totals(model, dateKey.slice(0, 4) + '-01-01', dateKey);
    const mo = Engine.totals(model, dateKey.slice(0, 7) + '-01', dateKey);
    const base = yr.hours >= 1 ? yr : all;
    const h = base.hours >= 1 ? Math.round((base.wage / base.hours) * 100) / 100 : 0;
    const whole = (v) => Math.max(0, Math.round(v || 0));
    return { m: { k: monthKey(dateKey), v: whole(mo.gross) }, y: { k: yearKey(dateKey), v: whole(yr.gross) }, a: whole(all.gross), h: Math.max(0, Math.min(2000, h)) };
  }

  /** A card's amount in a period now (0 for a month or a year that has passed; null when hidden). */
  function valueOf(s, period, dateKey) {
    if (!s) return null;
    if (period === 'm') return s.m && s.m.k === monthKey(dateKey) ? +s.m.v || 0 : 0;
    if (period === 'y') return s.y && s.y.k === yearKey(dateKey) ? +s.y.v || 0 : 0;
    if (period === 'a') return +s.a || 0;
    if (period === 'h') return +s.h || 0;
    return null;
  }

  /**
   * The table: rows { uid, n, e, s, hide, state } (state: 'ok', 'pending' = they did not let me read yet).
   * Ranked by the period's amount, highest first (equal amounts share a place); then the ones who hide
   * their amounts, then the ones still pending — each group by nickname.
   */
  function table(rows, period, dateKey) {
    const byName = (a, b) => String(a.n || '').localeCompare(String(b.n || ''), 'he');
    const shown = rows.filter((r) => r.state !== 'pending' && !r.hide && r.s).map((r) => Object.assign({}, r, { v: valueOf(r.s, period, dateKey) }));
    shown.sort((a, b) => b.v - a.v || byName(a, b));
    let rank = 0, prev = null;
    shown.forEach((r, i) => { if (r.v !== prev) { rank = i + 1; prev = r.v; } r.rank = rank; });
    const hidden = rows.filter((r) => r.state !== 'pending' && (r.hide || !r.s)).map((r) => Object.assign({}, r, { v: null, rank: null })).sort(byName);
    const pending = rows.filter((r) => r.state === 'pending').map((r) => Object.assign({}, r, { v: null, rank: null })).sort(byName);
    return shown.concat(hidden, pending);
  }

  /** A friends list with one added (no duplicates, never myself, at most 50). */
  function addFriend(list, uid, me) {
    const out = (list || []).filter((x, i, a) => typeof x === 'string' && x && x !== me && a.indexOf(x) === i);
    if (uid && uid !== me && !out.includes(uid) && out.length < MAX_FRIENDS) out.push(uid);
    return out;
  }
  const removeFriend = (list, uid) => (list || []).filter((x) => x !== uid);

  /** An invitation code: 20 letters and digits (too many to guess; the rules want 16 or more). */
  function code(rand) {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    const bytes = rand ? rand(20) : Array.from({ length: 20 }, () => Math.floor(Math.random() * 256));
    return Array.from(bytes, (b) => abc[b % abc.length]).join('');
  }
  /** The code from an address (?friend=CODE), if it is one. */
  function codeFrom(search) {
    const m = /[?&]friend=([a-z0-9]{16,40})(?:&|$)/.exec(String(search || ''));
    return m ? m[1] : null;
  }
  const INVITE_DAYS = 14; // an invitation link older than this is not accepted

  root.Friends = { MAX_FRIENDS, PERIODS, INVITE_DAYS, stats, valueOf, table, addFriend, removeFriend, code, codeFrom, monthKey, yearKey };
  if (typeof module !== 'undefined') module.exports = root.Friends;
})(typeof window !== 'undefined' ? window : globalThis);
