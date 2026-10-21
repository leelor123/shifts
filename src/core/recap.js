/* ============================================================
 * recap.js — what goes into the monthly recap ("הסיכום החודשי"),
 * a short story of last month at work: what was earned, how many
 * hours, the best day, the extras, a fun comparison. Pure data from
 * the engine's totals, so it can be tested; the screens are in
 * views-recap.js. A slide is only included when it has something
 * real to say (no "0 hours of overtime").
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  // things a paycheck can buy, for the last slide: [name (plural), price ₪, emoji]
  const ITEMS = [['פיצות משפחתיות', 60, '🍕'], ['כרטיסים לסרט', 45, '🎬'], ['ארוחות המבורגר', 75, '🍔'], ['חולצות', 90, '👕'],
    ['משחקים למחשב', 150, '🎮'], ['כרטיסים להופעה', 210, '🎤'], ['זוגות נעלי ספורט', 420, '👟'], ['כוסות קפה', 14, '☕']];
  const r2 = (x) => Math.round(x * 100) / 100;

  /** A small stable hash, so the same month always shows the same items. */
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

  /** Two things the money buys, preferring counts that are fun to read (2–40). */
  function funItems(money, seed) {
    if (!(money > 0)) return [];
    const all = ITEMS.map(([name, price, emoji]) => ({ name, price, emoji, count: Math.floor(money / price) })).filter((x) => x.count >= 1);
    const nice = all.filter((x) => x.count >= 2 && x.count <= 40);
    const pool = nice.length >= 2 ? nice : all;
    if (pool.length <= 2) return pool;
    const a = hash(String(seed)) % pool.length;
    let b = (a + 1 + (hash(String(seed) + 'x') % (pool.length - 1))) % pool.length;
    if (b === a) b = (a + 1) % pool.length;
    return [pool[a], pool[b]];
  }

  /** When the shifts usually start, as a style. */
  function clockStyle(startHours) {
    if (!startHours || startHours.length < 2) return null;
    const avg = startHours.reduce((s, h) => s + h, 0) / startHours.length;
    const type = avg >= 16 ? 'night' : avg < 10 ? 'morning' : 'day';
    return { type, avgHour: Math.round(avg) % 24 };
  }

  /**
   * t, prev: totals objects from Engine.periodSummary / totals (prev may be missing).
   * opts: { key, label, prevLabel, net, roleName(id) }
   * Returns { key, label, slides: [{ k, ... }] } or null when there was no work that month.
   */
  function build(t, prev, opts) {
    opts = opts || {};
    if (!t || !(t.shifts > 0) || !(t.gross > 0)) return null;
    const slides = [{ k: 'intro', label: opts.label || '' }];
    const delta = prev && prev.gross > 0 ? Math.round((t.gross / prev.gross - 1) * 100) : null;
    slides.push({ k: 'earned', gross: r2(t.gross), net: opts.net > 0 ? r2(opts.net) : null, delta: delta != null && Math.abs(delta) < 1000 ? delta : null, prevLabel: opts.prevLabel || '' });
    slides.push({
      k: 'time', hours: r2(t.hours), shifts: t.shifts, workDays: t.workDays || 0,
      longestMin: t.longest ? Math.round(t.longest.paidMin) : 0, longestDate: t.longest ? t.longest.dateKey : null,
      movies: Math.floor(t.hours / 2),
    });
    if (t.bestDay && t.bestDay.amount > 0 && t.shifts > 1) slides.push({ k: 'best', key: t.bestDay.key, amount: r2(t.bestDay.amount) });
    const extras = (t.restPremium || 0) + (t.otPremium || 0) + (t.nightPremium || 0) + (t.evePremium || 0) + (t.specialPremium || 0);
    if (extras >= 1) slides.push({ k: 'extras', amount: r2(extras), restHours: r2(t.restHours || 0), otHours: r2(t.otHours || 0), travel: r2(t.travel || 0) });
    else if ((t.travel || 0) >= 1) slides.push({ k: 'travel', amount: r2(t.travel) });
    const roles = Object.entries(t.byRole || {}).filter(([, v]) => v.hours > 0).sort((a, b) => b[1].hours - a[1].hours);
    if (roles.length > 1 && t.hours > 0) slides.push({ k: 'role', name: opts.roleName ? opts.roleName(roles[0][0]) : '', hours: r2(roles[0][1].hours), share: Math.round((roles[0][1].hours / t.hours) * 100) });
    const style = clockStyle(t.startHours);
    if (style) slides.push(Object.assign({ k: 'clock' }, style));
    const money = opts.net > 0 ? opts.net : t.gross;
    const items = funItems(money, opts.key || opts.label || '');
    if (items.length) slides.push({ k: 'fun', money: r2(money), items });
    slides.push({ k: 'outro', shifts: t.shifts, gross: r2(t.gross) });
    return { key: opts.key || '', label: opts.label || '', slides };
  }

  root.Recap = { build, funItems, clockStyle, ITEMS };
})(typeof window !== 'undefined' ? window : globalThis);
