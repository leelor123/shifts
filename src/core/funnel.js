/* ============================================================
 * funnel.js — where users drop off, from the anonymous statistics records (app/stats.js) the admin dashboard
 * already read. Pure: no reading, no screen.
 *
 * compute(rows, { today, days, platform }):
 *   rows:     stats records ({ p, ios, first, last, sh, f: { plus, demo } }); first/last are day keys;
 *   days:     the window of first use: devices whose first day is within the last `days` days;
 *   platform: '' for all, or 'android' (the Android app), 'ios' (iPhone or iPad, browser or home screen),
 *             'web' (any other browser, installed from it or not).
 * A device that started less than a week ago had no time to come back, so the window ends 7 days before today.
 * Demo mode is not counted. The steps, each kept from the one before it:
 *   'installed' has a record;
 *   'shift'     entered a first shift (sh > 0);
 *   'week'      came back on a later week (used 7 days or more after its first day);
 *   'active'    still used in the last 14 days;
 *   'plus'      has Shaati Plus.
 * Returns { from, to, steps: [{ key, n, prev, pct }] }: pct is n out of the step before (the first: 100, or 0 when
 * no device is in the window).
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const MIN_AGE = 7; // days a device needs to be able to come back on a later week
  const ACTIVE = 14;
  const PLATFORMS = ['android', 'web', 'ios'];
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  /** The platform group of a record: the Android app, an iPhone (record field ios), or another browser. */
  function group(r) {
    if (r.p === 'android') return 'android';
    if (r.ios === true) return 'ios';
    return 'web';
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const STEPS = [
    ['installed', () => true],
    ['shift', (r) => +r.sh > 0],
    ['week', (r) => U.diffDays(r.first, r.last) >= MIN_AGE],
    ['active', (r, o) => r.last >= o.since14],
    ['plus', (r) => !!(r.f && r.f.plus)],
  ];

  function compute(rows, opts) {
    const o = opts || {};
    const today = o.today || U.todayKey();
    const from = U.addDays(today, -((o.days || 30) - 1));
    const to = U.addDays(today, -MIN_AGE);
    const ctx = { since14: U.addDays(today, -(ACTIVE - 1)) };
    let cur = (rows || []).filter((r) => r && typeof r.first === 'string' && typeof r.last === 'string' && DAY_RE.test(r.first) && DAY_RE.test(r.last)
      && r.first >= from && r.first <= to && !(r.f && r.f.demo) && (!o.platform || group(r) === o.platform));
    const steps = [];
    for (const [key, keep] of STEPS) {
      const prev = cur.length;
      cur = cur.filter((r) => keep(r, ctx));
      steps.push({ key, n: cur.length, prev, pct: pct(cur.length, prev) });
    }
    return { from, to, steps };
  }

  root.Funnel = { compute, group, PLATFORMS, MIN_AGE, ACTIVE };
  if (typeof module !== 'undefined') module.exports = root.Funnel;
})(typeof window !== 'undefined' ? window : globalThis);
