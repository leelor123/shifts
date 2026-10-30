/* ============================================================
 * taxrefund.js — was too much income tax taken in a year, and how much would come back (an estimate).
 *
 * Income tax is taken every month as if the month's pay went on all year, with the credit points the employer
 * knows of. The year's real tax is worked out on the whole year: its brackets, every credit point of every month
 * (a resident's points count for the whole year, also months without work), and the credit for pension deposits.
 * When the months taken add up to more, the difference comes back on request — up to six years back (Form 135,
 * gov.il/he/service/itc135). Typical for the app's users: a student who worked part of the year, a discharged
 * soldier or a new graduate whose points the employer never applied, a teenager taxed at all, two jobs at once.
 *
 * The credit points (kolzchut "נקודות זיכוי ממס הכנסה" and its pages, read 2026-10-30):
 *  - a resident 2.25; a woman another 0.5;
 *  - working youth aged 16–18: 1 (per month of those ages);
 *  - discharged soldiers / national service, for 36 months from the month after discharge: men 23+ months of
 *    service 2, 12–23 months 1; women 22+ 2, 12–22 1; national service 24+ 2, 12–23 1;
 *  - a first degree: finished in 2023 or later, 1 point a year for as many years as it took (3 at most), from the
 *    year after; finished 2014–2022, 1 point for one year (the year after);
 *  - children, a new immigrant, a single parent, disability and more: not counted here (the result says so, and
 *    the Tax Authority's own simulator counts them).
 * The brackets and the point's value of each year: Engine.TAX_YEARS.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine } = root;
  const TR = {};
  TR.YEARS_BACK = 6;
  TR.FILE_URL = 'https://www.gov.il/he/service/itc135';
  TR.SIMULATOR_URL = 'https://www.gov.il/he/service/simulator-employee'; // the Tax Authority's own refund check

  const mk = (y, m) => y + '-' + String(m).padStart(2, '0');
  const monthIndex = (key) => { const [y, m] = String(key).split('-').map(Number); return y * 12 + (m - 1); };
  /** Age in whole years at the first of a month (null without a birth date). */
  function ageAtMonth(birth, y, m) {
    if (!birth) return null;
    const [by, bm, bd] = String(birth).split('-').map(Number);
    let a = y - by;
    if (m < bm || (m === bm && 1 < bd)) a--;
    return a;
  }

  /** The credit points of each month of a year: [{ total, parts: { resident, woman, youth, soldier, degree } }] × 12.
   * p = { gender, birthDate, service: { kind: 'army'|'national', months, end: 'YYYY-MM' }, degree: { year, studyYears } } */
  TR.pointsByMonth = function (p, year) {
    p = p || {};
    const out = [];
    const sv = p.service || {};
    const svMonths = +sv.months || 0;
    let svPts = 0;
    if (sv.kind && sv.end && svMonths >= 12) {
      const full = sv.kind === 'national' ? 24 : p.gender === 'f' ? 22 : 23;
      svPts = svMonths >= full ? 2 : 1;
    }
    const svFrom = sv.end ? monthIndex(sv.end) + 1 : null; // the month after discharge, for 36 months
    const dg = p.degree || {};
    const dgYear = +dg.year || 0;
    const dgYears = dgYear >= 2023 ? Math.min(3, Math.max(1, +dg.studyYears || 3)) : dgYear >= 2014 ? 1 : 0;
    for (let m = 1; m <= 12; m++) {
      const parts = { resident: 2.25, woman: p.gender === 'f' ? 0.5 : 0, youth: 0, soldier: 0, degree: 0 };
      const age = ageAtMonth(p.birthDate, year, m);
      if (age != null && age >= 16 && age < 18) parts.youth = 1;
      const i = year * 12 + (m - 1);
      if (svPts && i >= svFrom && i < svFrom + 36) parts.soldier = svPts;
      if (dgYears && year > dgYear && year <= dgYear + dgYears) parts.degree = 1;
      out.push({ total: parts.resident + parts.woman + parts.youth + parts.soldier + parts.degree, parts });
    }
    return out;
  };

  /**
   * One year's estimate.
   * months: [{ mk: 'YYYY-MM', gross, tax, pension, src: 'slip'|'shifts' }] — the months with income (from payslips
   *   where there are, otherwise from the shifts); f106: { gross, tax, pension } for the whole year (wins when given);
   * profile: see pointsByMonth; T: settings.tax (its own brackets / point value, if the user set any).
   */
  TR.estimate = function (year, months, profile, T, f106) {
    const law = Engine.taxLaw(T || {}, year + '-06-01');
    const brackets = law.brackets.map(([u, pct]) => [u === Infinity ? Infinity : u * 12, pct]);
    const worked = (months || []).filter((x) => +x.gross > 0);
    const from106 = !!(f106 && +f106.gross > 0);
    const gross = from106 ? +f106.gross : worked.reduce((s, x) => s + +x.gross, 0);
    const withheld = from106 ? +f106.tax || 0 : worked.reduce((s, x) => s + (+x.tax || 0), 0);
    const pension = from106 ? +f106.pension || 0 : worked.reduce((s, x) => s + (+x.pension || 0), 0);
    const points = TR.pointsByMonth(profile, year);
    const pointsSum = points.reduce((s, x) => s + x.total, 0);
    const taxBefore = Engine.incomeTaxRaw(gross, brackets);
    const credits = pointsSum * law.point;
    const capYear = ((T && +T.pensionCreditCap) || 9700) * 12;
    const pensionCredit = Math.min(pension, 0.07 * Math.min(gross, capYear)) * (((T && +T.pensionCreditPct) || 35) / 100);
    const liability = Math.max(0, taxBefore - credits - pensionCredit);
    const refund = withheld - liability;
    // why (the user reads these): only what fits the numbers
    const reasons = [];
    const workedMonths = new Set(worked.map((x) => x.mk)).size;
    if (refund > 0) {
      if (!from106 && workedMonths && workedMonths < 12) reasons.push('partYear');
      const extra = points.reduce((s, x) => s + x.parts.youth + x.parts.soldier + x.parts.degree, 0);
      if (extra > 0) reasons.push('points');
      if (profile && profile.minorTaxed) reasons.push('minor');
      if (profile && profile.employers > 1) reasons.push('twoJobs');
    }
    const extraParts = { youth: 0, soldier: 0, degree: 0, woman: 0 };
    for (const x of points) for (const k of Object.keys(extraParts)) extraParts[k] += x.parts[k];
    return {
      year, gross, withheld, pension, taxBefore, credits, pensionCredit, liability, refund, reasons,
      points: pointsSum / 12, pointParts: extraParts, pointValue: law.point, workedMonths,
      src: from106 ? '106' : worked.length && worked.every((x) => x.src === 'slip') ? 'slips' : worked.some((x) => x.src === 'slip') ? 'mixed' : 'shifts',
    };
  };

  /** The tax years a refund can still be asked for today (the six before this one), newest first, and this one. */
  TR.years = function (todayKey) {
    const y = +String(todayKey || U.todayKey()).slice(0, 4);
    const out = [y];
    for (let i = 1; i <= TR.YEARS_BACK; i++) out.push(y - i);
    return out;
  };

  root.TaxRefund = TR;
})(typeof window !== 'undefined' ? window : globalThis);
