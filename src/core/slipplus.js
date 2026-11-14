/* ============================================================
 * slipplus.js — following the payslips over time (Shaati Plus, app/payslip-plus.js).
 *
 * The check of each payslip against the shifts (payslip.js) stays free for everyone. This file only reads the
 * payslips already checked and saved: the main lines of each one, what changed in them from the payslip before,
 * and the sum of the gaps when every payslip is checked again together. A change is information, never a
 * finding: whether money is missing is decided only by the check against the shifts.
 * ============================================================ */
(function (root) {
  'use strict';
  const v = (F, k) => (F && F[k] && F[k].value != null && F[k].value !== '' && !isNaN(F[k].value) ? +F[k].value : null);
  const q = (F, k) => (F && F[k] && F[k].qty != null && F[k].qty !== '' && !isNaN(F[k].qty) ? +F[k].qty : null);
  const add = (xs) => { const ys = xs.filter((x) => x != null); return ys.length ? ys.reduce((a, b) => a + b, 0) : null; };
  const HOURS = ['base', 'ot125', 'ot150', 'rest150', 'rest175', 'rest200'];

  /** The lines followed from month to month. kind: money | hours | rate (₪ per hour). */
  const LINES = [
    { key: 'gross', label: 'ברוטו', kind: 'money' },
    { key: 'net', label: 'נטו לתשלום', kind: 'money' },
    { key: 'hours', label: 'שעות בתלוש', kind: 'hours' },
    { key: 'rate', label: 'תעריף לשעה רגילה', kind: 'rate' },
    { key: 'extra', label: 'נוספות, שבת וחג', kind: 'money' },
    { key: 'travel', label: 'נסיעות', kind: 'money' },
    { key: 'deductions', label: 'סך הניכויים', kind: 'money' },
    { key: 'incomeTax', label: 'מס הכנסה', kind: 'money' },
    { key: 'social', label: 'ביטוח לאומי ומס בריאות', kind: 'money' },
    { key: 'pensionEmployee', label: 'פנסיה (חלק העובד)', kind: 'money' },
    { key: 'pensionEmployer', label: 'פנסיה (חלק המעסיק)', kind: 'money' },
  ];
  // the smallest change worth showing
  const STEP = { money: 1, hours: 0.25, rate: 0.01 };

  /** One payslip's followed lines: { period, id, gross, net, hours, rate, … } (null where the payslip has no such line). */
  function row(slip) {
    const F = (slip && slip.fields) || {};
    const gross = v(F, 'gross'), net = v(F, 'net');
    const baseQ = q(F, 'base'), baseV = v(F, 'base');
    const hours = add(HOURS.map((k) => q(F, k))) || v(F, 'workHours');
    const ded = v(F, 'totalDeductions') != null ? v(F, 'totalDeductions') : gross != null && net != null ? Math.max(0, gross - net) : null;
    return {
      period: (slip && slip.period) || '', id: (slip && slip.id) || '',
      gross, net, hours: hours || null,
      rate: baseQ > 0 && baseV != null ? Math.round((baseV / baseQ) * 100) / 100 : null,
      extra: add(['ot125', 'ot150', 'rest150', 'rest175', 'rest200'].map((k) => v(F, k))),
      travel: v(F, 'travel'), deductions: ded, incomeTax: v(F, 'incomeTax'),
      social: add([v(F, 'nationalInsurance'), v(F, 'healthTax')]),
      pensionEmployee: v(F, 'pensionEmployee'), pensionEmployer: v(F, 'pensionEmployer'),
    };
  }

  /**
   * What changed between two payslips' rows: the lines both have, moved by at least a step.
   * → { changed: [{ key, label, kind, prev, now, delta, pct }], same: n, onlyNow: [label], onlyPrev: [label] }
   */
  function changes(prev, now) {
    const out = { changed: [], same: 0, onlyNow: [], onlyPrev: [] };
    if (!prev || !now) return out;
    for (const l of LINES) {
      const a = prev[l.key], b = now[l.key];
      if (a == null && b == null) continue;
      if (a == null) { out.onlyNow.push(l.label); continue; }
      if (b == null) { out.onlyPrev.push(l.label); continue; }
      const delta = Math.round((b - a) * 100) / 100;
      if (Math.abs(delta) < STEP[l.kind]) { out.same++; continue; }
      out.changed.push({ key: l.key, label: l.label, kind: l.kind, prev: a, now: b, delta, pct: a ? Math.round((delta / Math.abs(a)) * 100) : null });
    }
    return out;
  }

  /** The payslips that have a month, oldest first. */
  function history(slips) {
    return (slips || []).filter((p) => p && p.period).slice().sort((a, b) => a.period.localeCompare(b.period) || String(a.id).localeCompare(String(b.id)));
  }

  /**
   * Every payslip checked again together: results [{ period, left }] (left = the estimated gap that is still not
   * explained) → { months, withGap, total, top } (top: the month with the largest gap, or null).
   */
  function summary(results) {
    const rs = (results || []).filter(Boolean);
    const gaps = rs.filter((r) => +r.left >= 1);
    const total = Math.round(gaps.reduce((s, r) => s + +r.left, 0) * 100) / 100;
    const top = gaps.slice().sort((a, b) => b.left - a.left)[0] || null;
    return { months: rs.length, withGap: gaps.length, total, top };
  }

  root.SlipPlus = { LINES, STEP, row, changes, history, summary };
})(typeof window !== 'undefined' ? window : globalThis);
