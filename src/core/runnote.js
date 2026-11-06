/* ============================================================
 * runnote.js — the pure parts of the notification that stays while a shift runs (tested in tests/runnote.test.js).
 *   - what it says: when the shift began and about how much it has made so far ("משמרת רצה מ-17:00");
 *   - when the app shows it again: at once when the shift changed (a new one, a break, another role), and otherwise
 *     at most every 15 minutes;
 *   - whether a tap on its "end shift" button, kept by the service worker, still fits the shift that runs now.
 * The glue (showing, closing, the switch in Settings) is app/run-note.js; the button's tap is caught in sw.js.
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const MIN = 60000;
  /** The fixed tag: each showing replaces the last one, and closing it finds it by this name. */
  const TAG = 'shaati-running';
  /** The amount is worked out by the app while it runs: no more often than this. */
  const EVERY = 15 * MIN;
  /** A tap on "end shift" older than this is not done any more (the phone was off, the app never opened). */
  const PENDING_MAX = 24 * 60 * MIN;

  /** What makes the shift another one for the notification: its start, its breaks and its roles. */
  function keyOf(a) {
    if (!a || !a.start) return '';
    return [a.start, (a.breaks || []).map((b) => b.from + '-' + (b.to || '')).join(','), (a.splits || []).length].join('|');
  }
  /** The notification's words. o: { start, now, wage (null: not known; under a shekel, as at the start, is left out), hideMoney, onBreak }. The time it was worked
   *  out goes with the amount: the amount moves on only when the app runs, and the reader sees how old it is. */
  function content(o) {
    const title = `משמרת רצה מ-${U.epochHM(o.start)}`;
    const parts = [];
    if (o.onBreak) parts.push('בהפסקה');
    if (!o.hideMoney && o.wage != null && +o.wage >= 1) parts.push(`בערך ${U.money(+o.wage, 0)} עד ${U.epochHM(o.now)}`);
    if (!parts.length) parts.push('לחצו כדי לפתוח את שעתי');
    return { title, body: parts.join(' · ') };
  }
  /** Show it again now? last: { key, at } of the last showing (or null). */
  function due(last, key, now) {
    if (!key) return false;
    if (!last || last.key !== key) return true;
    return now - last.at >= EVERY;
  }
  /** A kept "end shift" tap ({ at, start }) still fits the running shift a: the same shift, tapped after it began,
   *  not in the future and not too old. */
  function pendingFits(p, a, now) {
    if (!p || !a || !a.start || +p.start !== +a.start) return false;
    const at = +p.at;
    return at > a.start && at <= now + MIN && now - at < PENDING_MAX;
  }

  root.RunNote = { TAG, EVERY, PENDING_MAX, keyOf, content, due, pendingFits };
  if (typeof module !== 'undefined') module.exports = root.RunNote;
})(typeof window !== 'undefined' ? window : globalThis);
