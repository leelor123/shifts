/* ============================================================
 * analysis.js — "advanced analysis" of the past year's shifts (pure).
 *
 * Which day and which time of day pay best per hour, how the real
 * hourly pay moved month by month, the records, how much came from
 * premiums (overtime, Shabbat and holidays, nights), and two "what if"
 * sums. Pay per hour = the pay for the work itself (with premiums),
 * without travel, bonuses or tips, so days are compared fairly.
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const SLOTS = [
    { id: 'morning', name: 'בוקר', from: 5, to: 12 },
    { id: 'noon', name: 'צהריים', from: 12, to: 17 },
    { id: 'evening', name: 'ערב', from: 17, to: 22 },
    { id: 'night', name: 'לילה', from: 22, to: 29 },
  ];
  const r2 = (n) => Math.round(n * 100) / 100;
  const slotOf = (ms) => {
    let h = new Date(ms).getHours();
    if (h < 5) h += 24;
    return SLOTS.find((s) => h >= s.from && h < s.to) || SLOTS[3];
  };
  const group = (keys) => new Map(keys.map((k) => [k, { n: 0, hours: 0, wage: 0 }]));
  const add = (g, r) => { g.n++; g.hours += r.paidHours; g.wage += r.wage; };
  const perHour = (g) => (g.hours > 0 ? r2(g.wage / g.hours) : 0);

  /**
   * results: the model's results; today: 'YYYY-MM-DD'.
   * Returns { enough: false, count } when there are fewer than 3 done shifts in the past year.
   */
  function analyse(results, today) {
    const from = U.addDays(today, -364);
    const list = [...results].filter((r) => r && r.kind === 'shift' && r.status === 'done' && r.paidHours > 0 && r.dateKey >= from && r.dateKey <= today)
      .sort((a, b) => a.start - b.start);
    if (list.length < 3) return { enough: false, count: list.length };
    const all = { n: 0, hours: 0, wage: 0 };
    const days = group([0, 1, 2, 3, 4, 5, 6]);
    const slots = group(SLOTS.map((s) => s.id));
    const thisMonth = today.slice(0, 7);
    const monthKeys = Array.from({ length: 6 }, (_, i) => U.addMonthKey(thisMonth, i - 5));
    const months = group(monthKeys);
    let premiums = 0, bestShift = null, longest = null;
    for (const r of list) {
      add(all, r);
      add(days.get(U.dow(r.dateKey)), r);
      add(slots.get(slotOf(r.start).id), r);
      const m = months.get(r.dateKey.slice(0, 7));
      if (m) add(m, r);
      premiums += (r.otPremium || 0) + (r.restPremium || 0) + (r.nightPremium || 0) + (r.evePremium || 0) + (r.specialPremium || 0);
      if (!bestShift || r.total > bestShift.total) bestShift = r;
      if (!longest || r.paidHours > longest.paidHours) longest = r;
    }
    const avgHour = perHour(all);
    // a day or a time of day counts only with at least 2 shifts (one lucky shift is not a pattern)
    const minN = list.length >= 8 ? 2 : 1;
    const dayRows = [...days].map(([d, g]) => ({ d, name: U.HEB_DAYS[d], n: g.n, perHour: perHour(g), perShift: g.n ? r2(g.wage / g.n) : 0 }));
    const slotRows = SLOTS.map((s) => { const g = slots.get(s.id); return { id: s.id, name: s.name, n: g.n, perHour: perHour(g), perShift: g.n ? r2(g.wage / g.n) : 0 }; });
    const pick = (rows) => rows.filter((x) => x.n >= minN).sort((a, b) => b.perHour - a.perHour)[0] || null;
    const bestDay = pick(dayRows), bestSlot = pick(slotRows);
    const monthRows = monthKeys.map((k) => { const g = months.get(k); return { mk: k, n: g.n, hours: r2(g.hours), wage: r2(g.wage), perHour: perHour(g) }; });
    // the trend: the last month with shifts against the average of the months before it
    const worked = monthRows.filter((x) => x.n > 0);
    let trend = null;
    if (worked.length >= 2) {
      const last = worked[worked.length - 1];
      const before = worked.slice(0, -1);
      const prevAvg = r2(before.reduce((s, x) => s + x.wage, 0) / Math.max(0.01, before.reduce((s, x) => s + x.hours, 0)));
      trend = { mk: last.mk, perHour: last.perHour, prev: prevAvg, diff: r2(last.perHour - prevAvg) };
    }
    const bestMonth = monthRows.filter((x) => x.n > 0).sort((a, b) => b.wage - a.wage)[0] || null;
    // what if: one more shift a week on the best day; and 2 ₪ more an hour on the same hours
    const weeks = Math.max(1, (Date.parse(today) - Date.parse(list[0].dateKey)) / (7 * 864e5));
    const hoursPerMonth = Math.min(all.hours, (all.hours / weeks) * (52 / 12));
    const whatIf = {
      extraShift: bestDay ? Math.round(bestDay.perShift * 52 / 12) : 0,
      raise2: Math.round(2 * hoursPerMonth),
    };
    return {
      enough: true, count: list.length, hours: r2(all.hours), wage: r2(all.wage), avgHour,
      avgShift: { hours: r2(all.hours / all.n), wage: r2(all.wage / all.n) },
      days: dayRows, bestDay, slots: slotRows, bestSlot, months: monthRows, trend, bestMonth,
      premiums: r2(premiums), premiumShare: all.wage ? Math.round((premiums / all.wage) * 100) : 0,
      bestShift: { dateKey: bestShift.dateKey, total: r2(bestShift.total), hours: r2(bestShift.paidHours) },
      longest: { dateKey: longest.dateKey, hours: r2(longest.paidHours) },
      whatIf,
    };
  }

  root.Analysis = { analyse, SLOTS, slotOf };
})(typeof window !== 'undefined' ? window : globalThis);
