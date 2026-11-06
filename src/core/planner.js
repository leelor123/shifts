/* ============================================================
 * planner.js: planned shifts, compared by what they pay.
 *
 * Everything here comes from the engine itself (Engine.computeShift / computeAll with the person's own rules:
 * Shabbat and holidays by HebCal, night, eve, overtime by the day and by the week), never from a guess of its own:
 *   - reasons(r): what a shift pays above the same hours on an ordinary weekday (Shabbat, night, eve, overtime);
 *   - best(results): the one planned shift that pays clearly more than the others, with its main reason;
 *   - swap(shifts, ctx, id, cand): "what if I take another shift instead": the whole week (or two weeks) of that
 *     employer worked out before and after, so a swap that pushes other shifts into weekly overtime counts too.
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const Engine = () => root.Engine;

  // the parts of a wage that depend on when the shift is: each one is an amount above 100% of the hours
  const PARTS = ['restPremium', 'nightPremium', 'evePremium', 'otPremium', 'specialPremium'];
  const KIND = { restPremium: 'rest', nightPremium: 'night', evePremium: 'eve', otPremium: 'ot', specialPremium: 'special' };
  function labelOf(kind, r) {
    if (kind === 'rest') return (r && r.restLabels && r.restLabels.length ? r.restLabels.join(', ') : 'שבת/חג');
    if (kind === 'night') return 'לילה';
    if (kind === 'eve') return 'ערב שבת/חג';
    if (kind === 'ot') return 'שעות נוספות';
    if (kind === 'special') return 'תעריף מיוחד';
    return 'שעות רגילות';
  }
  /** What the same paid hours would pay on an ordinary weekday morning: 100% of the hours (and the role's own extras). */
  const plainOf = (r) => (+r.base || 0) + (+r.seniority || 0) + (+r.minTopUp || 0);

  /** The premiums of one shift, largest first: [{ kind, label, amount }] (amounts of a shekel or more). */
  function reasons(r) {
    if (!r) return [];
    return PARTS.map((p) => ({ kind: KIND[p], label: labelOf(KIND[p], r), amount: +r[p] || 0 }))
      .filter((x) => x.amount >= 1).sort((a, b) => b.amount - a.amount);
  }

  /** "שישי בלילה": the day and the part of it the shift starts in (a start before 05:00 belongs to the night before). */
  function whenOf(start) {
    const k = U.epochKey(start);
    const h = +U.epochHM(start).slice(0, 2);
    const day = U.DAYS[U.dow(h < 5 ? U.addDays(k, -1) : k)];
    if (h < 5 || h >= 21) return `${day} בלילה`;
    if (h < 11) return `${day} בבוקר`;
    if (h < 16) return `${day} בצהריים`;
    return `${day} בערב`;
  }

  // "+120 ₪" kept in one piece, left to right, inside Hebrew or Arabic text (the money's own direction marks taken out:
  // between them the sign drifted away from the number)
  const signed = (n) => '\u2066' + (n >= 0 ? '+' : '\u2212') + U.money(Math.abs(n), 0).replace(/[\u200e\u200f]/g, '') + '\u2069';
  /** "שבת: +₪180 לעומת משמרת רגילה" */
  const reasonText = (x) => `${x.label}: ${signed(x.amount)} לעומת משמרת רגילה`;

  /**
   * The best-paying planned shift among `results` (engine results), or null. Only one, and only when it pays
   * clearly more than the next one (a tie is no highlight): { id, r, wage, when, reason: {kind,label,amount}|null, text }.
   * opts.now: shifts that ended before it are left out (default: none left out).
   */
  function best(results, opts) {
    opts = opts || {};
    const list = [...results].filter((r) => r && r.status === 'planned' && r.wage > 0 && (opts.now == null || r.end > opts.now))
      .sort((a, b) => b.wage - a.wage || a.start - b.start);
    if (list.length < 2) return null;
    const top = list[0], next = list[1];
    if (top.wage - next.wage < Math.max(10, top.wage * 0.03)) return null;
    const main = reasons(top)[0] || null;
    const reason = main && main.amount >= 10 ? main : null;
    return { id: top.id, r: top, wage: top.wage, when: whenOf(top.start), reason, text: reason ? reasonText(reason) : '' };
  }

  /* ---------------- what if I swap ---------------- */
  const weekOf = (t) => { const k = U.epochKey(t); return U.addDays(k, -U.dow(k)); };
  function sums(map) {
    const s = { wage: 0, plain: 0 };
    PARTS.forEach((p) => { s[p] = 0; });
    for (const r of map.values()) {
      s.wage += r.wage; s.plain += plainOf(r);
      PARTS.forEach((p) => { s[p] += +r[p] || 0; });
    }
    s.other = s.wage - s.plain - PARTS.reduce((m, p) => m + s[p], 0); // manual adjustments
    return s;
  }

  /**
   * The planned shift `id` moved to cand = { start, end, roleId? }: what the week pays before and after.
   * The employer's other shifts in the week(s) of both times are worked out with it, in one counter (done or planned),
   * so the overtime of the whole week moves as it would. Returns
   *   { before, after (the two engine results), delta (the week's wage after − before), others (how much of it is in
   *     the other shifts), parts: [{ kind, label, delta }] largest first, overlap (cand clashes with another shift) }
   * or null when there is no such shift or cand is not a real time.
   */
  function swap(shifts, ctx, id, cand) {
    const orig = (shifts || []).find((s) => s && s.id === id);
    if (!orig || !cand || !Number.isFinite(cand.start) || !Number.isFinite(cand.end) || !(cand.end > cand.start)) return null;
    // the same shift at the other time: its own splits and manual changes belonged to the old hours
    const moved = Object.assign({}, orig, { start: cand.start, end: cand.end, roleId: cand.roleId || orig.roleId, splits: [], overrides: null, status: 'planned' });
    const weeks = new Set([weekOf(orig.start), weekOf(cand.start)]);
    const pool = shifts.filter((s) => s && s.id !== id && (!s.kind || s.kind === 'shift') && s.employerId === orig.employerId && weeks.has(weekOf(s.start)))
      .map((s) => Object.assign({}, s, { status: 'planned' }));
    const E = Engine();
    const before = E.computeAll(pool.concat([Object.assign({}, orig, { status: 'planned' })]), ctx);
    const after = E.computeAll(pool.concat([moved]), ctx);
    const rb = before.get(id), ra = after.get(id);
    if (!rb || !ra) return null;
    const sb = sums(before), sa = sums(after);
    const parts = [];
    const plainD = sa.plain - sb.plain;
    if (Math.abs(plainD) >= 1) parts.push({ kind: 'hours', label: Math.abs(ra.paidMin - rb.paidMin) >= 1 ? 'אורך המשמרת' : 'תעריף לשעה', delta: plainD });
    PARTS.forEach((p) => {
      const d = sa[p] - sb[p];
      if (Math.abs(d) < 1) return;
      const kind = KIND[p];
      let label = labelOf(kind, d > 0 ? ra : rb);
      // overtime that moved in the other shifts of the week: the 42 regular hours were crossed (or no longer are)
      if (kind === 'ot' && Math.abs((d - ((+ra.otPremium || 0) - (+rb.otPremium || 0)))) >= 1) label = 'שעות נוספות השבוע';
      parts.push({ kind, label, delta: d });
    });
    if (Math.abs(sa.other - sb.other) >= 1) parts.push({ kind: 'other', label: 'תוספות ידניות', delta: sa.other - sb.other });
    parts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const delta = sa.wage - sb.wage;
    const overlap = shifts.some((s) => s && s.id !== id && (!s.kind || s.kind === 'shift') && s.start < cand.end && s.end > cand.start);
    return { before: rb, after: ra, delta, others: delta - (ra.wage - rb.wage), parts, overlap };
  }

  /**
   * Shifts not saved yet (a work schedule being imported): what each would pay, worked out with the employer's
   * shifts already in those weeks, so the day's and the week's overtime count. cands: shift records with ids.
   * Returns Map(id -> engine result), the candidates only.
   */
  function expected(shifts, ctx, cands) {
    const list = (cands || []).filter(Boolean);
    if (!list.length) return new Map();
    const weeks = new Set(list.map((c) => weekOf(c.start)));
    const emps = new Set(list.map((c) => c.employerId));
    const ids = new Set(list.map((c) => c.id));
    const pool = (shifts || []).filter((s) => s && !ids.has(s.id) && (!s.kind || s.kind === 'shift') && emps.has(s.employerId) && weeks.has(weekOf(s.start)))
      .map((s) => Object.assign({}, s, { status: 'planned' }));
    const all = Engine().computeAll(pool.concat(list.map((c) => Object.assign({}, c, { status: 'planned' }))), ctx);
    const out = new Map();
    for (const c of list) if (all.has(c.id)) out.set(c.id, all.get(c.id));
    return out;
  }

  /** The headline of a swap: "ההחלפה מוסיפה ₪120" / "ההחלפה מורידה ₪80" / "אותו שכר בערך". */
  function swapTitle(res) {
    if (!res) return '';
    if (Math.abs(res.delta) < 1) return 'אותו שכר בערך';
    return res.delta > 0 ? `ההחלפה מוסיפה ${U.money(res.delta, 0)}` : `ההחלפה מורידה ${U.money(-res.delta, 0)}`;
  }
  /** One reason line: "שבת: +₪180" */
  const partText = (x) => `${x.label}: ${signed(x.delta)}`;

  root.Planner = { reasons, best, whenOf, reasonText, swap, swapTitle, partText, signed, plainOf, expected, weekOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Planner;
})(typeof window !== 'undefined' ? window : globalThis);
