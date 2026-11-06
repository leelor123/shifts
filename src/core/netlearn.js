/* ============================================================
 * netlearn.js — a net estimate that learns from the salaries that really arrived.
 *
 * The salary card (app/salary-check.js) asks on pay day what came in and keeps it in meta.salaryAns, by pay
 * period: { a: 'yes'|'other'|'not', amt: what arrived, exp: the estimate shown, raw: the estimate before any
 * learned correction }. From 2 answers on, the usual gap between the calculation and the bank becomes a
 * correction of the personal deductions (a union fee, meals, a loan, a different tax credit): the net estimate
 * moves by it, never by more than 25% of that month's gross. The person can reset it; answers given before the
 * reset no longer count (meta.netLearnReset holds the last period key the reset covered).
 *
 * Pure: Engine.periodSummary / rangeSummary apply it when the model carries it (buildModel data.netAdj).
 * ============================================================ */
(function (root) {
  'use strict';
  const MIN_ANSWERS = 2;
  const LAST = 6; // the latest six answers: a year-old payslip says less about today
  const CAP = 0.25; // of the month's gross
  const OUTLIER = 0.4; // a month 40% off (a bonus, a partial month, an advance) is not the usual gap
  const MIN_GAP = 20; // shekels: a smaller usual gap is no correction

  /**
   * The learned correction from the answers: { adj, n } or null.
   * adj > 0: the net usually arrives that many shekels lower than the calculation; adj < 0: higher.
   */
  function learn(answers, resetKey) {
    if (!answers || typeof answers !== 'object') return null;
    const gaps = [];
    for (const k of Object.keys(answers).sort()) {
      if (resetKey && k <= resetKey) continue;
      const x = answers[k];
      if (!x || typeof x !== 'object' || (x.a !== 'yes' && x.a !== 'other')) continue;
      const amt = +x.amt, base = x.raw != null ? +x.raw : +x.exp;
      if (!(amt > 0) || !(base > 0) || !isFinite(amt) || !isFinite(base)) continue;
      const gap = base - amt;
      if (Math.abs(gap) > base * OUTLIER) continue;
      gaps.push(gap);
    }
    const use = gaps.slice(-LAST);
    if (use.length < MIN_ANSWERS) return null;
    const avg = use.reduce((s, g) => s + g, 0) / use.length;
    if (Math.abs(avg) < MIN_GAP) return null;
    return { adj: Math.round(avg), n: use.length };
  }

  /** The correction for one month: at most 25% of its gross either way, none on a month with no gross. */
  function capped(adj, gross) {
    const g = +gross || 0, a = +adj || 0;
    if (!(g > 0) || !a) return 0;
    const lim = g * CAP;
    return Math.max(-lim, Math.min(lim, a));
  }

  /** A net estimate (Engine.netEstimate's result) with the correction: a copy with net moved and learned set. */
  function apply(n, adj) {
    const a = capped(adj, n && n.gross);
    if (!a) return n;
    return Object.assign({}, n, { net: n.net - a, learned: a, rawNet: n.net });
  }

  /** The last period key the answers hold: what a reset covers. */
  function resetKeyOf(answers) {
    const ks = answers && typeof answers === 'object' ? Object.keys(answers).sort() : [];
    return ks.length ? ks[ks.length - 1] : '';
  }

  root.NetLearn = { learn, capped, apply, resetKeyOf, MIN_ANSWERS, CAP };
  if (typeof module !== 'undefined') module.exports = root.NetLearn;
})(typeof window !== 'undefined' ? window : globalThis);
