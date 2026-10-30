/* ============================================================
 * referral.js — "invite a friend, and both get a month of Shaati Plus" (pure, tested).
 *
 * A member's invitation code, refc/{code} = { by: their uid }: the link carries only the
 * code (?ref=CODE), never the uid. A new user who came with it, once they recorded a shift,
 * writes ref/{their uid} = { by, c: the code, t: when } — once, never changed or removed
 * (firestore.rules), so an account is invited once. Both sides work out their gift from
 * these documents: a month each, one after the other, from the day it was given; an
 * inviter gets at most MAX months (the first ones).
 * ============================================================ */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const MONTH = 30 * DAY;
  const MAX = 6; // months an inviter can get (fake accounts can't turn it into Plus for ever)
  const LINK_DAYS = 30; // a link opened longer ago than this is not used any more

  /** An invitation code: 12 letters and digits (the rules want 10 to 20). */
  function code(rand) {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    const bytes = rand ? rand(12) : Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
    return Array.from(bytes, (b) => abc[b % abc.length]).join('');
  }
  /** The code from an address (?ref=CODE), if it is one. */
  function codeFrom(search) {
    const m = /[?&]ref=([a-z0-9]{10,20})(?:&|$)/.exec(String(search || ''));
    return m ? m[1] : null;
  }

  /**
   * The gift: mine = when I was invited (null: I wasn't), invited = when each friend I invited joined.
   * Every gift is a month, after the one before it ends (or from its own day, if that is later).
   * → { until (0: none), months, friends (how many joined through me) }
   */
  function gift(mine, invited) {
    const mineOk = typeof mine === 'number' && mine > 0;
    const friends = (invited || []).filter((t) => typeof t === 'number' && t > 0).sort((a, b) => a - b);
    const grants = (mineOk ? [mine] : []).concat(friends.slice(0, MAX)).sort((a, b) => a - b);
    let until = 0;
    for (const t of grants) until = Math.max(until, t) + MONTH;
    return { until, months: grants.length, friends: friends.length };
  }

  /** May this phone's user take the gift of a link? Only someone new (no shift before the link) and a recent link. */
  function canClaim(o) {
    return !!o && !o.hadShifts && typeof o.linkAt === 'number' && o.now - o.linkAt >= 0 && o.now - o.linkAt < LINK_DAYS * DAY;
  }

  root.Referral = { DAY, MONTH, MAX, LINK_DAYS, code, codeFrom, gift, canClaim };
  if (typeof module !== 'undefined') module.exports = root.Referral;
})(typeof window !== 'undefined' ? window : globalThis);
