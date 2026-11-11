/* ============================================================
 * moments.js — the pure parts of three small moments (tested in tests/moments.test.js):
 *   - the end of a shift: the one line on what made its wage ("מזה ₪137 על שבת"), and the quiet hours (23:00 to
 *     06:00) when it comes with no confetti and no sound;
 *   - the youth law while a minor's shift runs: which rule is near or passed (the night hours, the hours a day);
 *   - "did the salary arrive?" on pay day: when to ask, and the gap from what was expected.
 * The screens are app/shift-end.js, app/youth-guard.js and app/salary-check.js.
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const MIN = 60000;

  /* ---------------- the end of a shift ---------------- */
  /** 23:00 to 06:00: people around may be asleep. */
  const quietHour = (ms) => { const h = new Date(ms).getHours(); return h >= 23 || h < 6; };

  /** What made the shift's wage, biggest first: [{ kind, amount }] of the premiums worth a shekel or more. */
  function wageParts(r) {
    if (!r) return [];
    const list = [
      ['rest', r.restPremium], ['ot', r.otPremium], ['night', r.nightPremium], ['eve', r.evePremium],
      ['special', r.specialPremium], ['seniority', r.seniority], ['minwage', r.minTopUp],
    ].map(([kind, v]) => ({ kind, amount: Math.round(+v || 0) })).filter((x) => x.amount >= 1);
    return list.sort((a, b) => b.amount - a.amount);
  }
  function partText(p, r) {
    const m = U.money(p.amount, 0);
    if (p.kind === 'rest') return `${m} על ${(r.restLabels && r.restLabels[0]) || 'שבת/חג'}`;
    if (p.kind === 'ot') return `${m} על שעות נוספות`;
    if (p.kind === 'night') return `${m} על שעות לילה`;
    if (p.kind === 'eve') return `${m} על ערב שבת או חג`;
    if (p.kind === 'special') return `${m} על תעריף מיוחד`;
    if (p.kind === 'seniority') return `${m} על ותק`;
    return `${m} השלמה לשכר מינימום`;
  }
  /** The one line under the wage: the premium that made it (two when the second one counts too), or the rate an hour. */
  function wageLine(r) {
    if (!r || !(r.paidMin > 0)) return '';
    const parts = wageParts(r);
    if (parts.length >= 2 && parts[1].amount >= 5) return `מזה ${partText(parts[0], r)} ו-${partText(parts[1], r)}`;
    if (parts.length) return `מזה ${partText(parts[0], r)}`;
    const rate = r.base / (r.paidMin / 60);
    return rate > 0 ? `${U.money(rate)} לשעה` : '';
  }

  /* ---------------- the youth law while a shift runs ---------------- */
  /**
   * The youth-law rule that matters now for a running shift, or null.
   * o: { age, rules (Engine.youthRules), now, start (ms), dayMin (paid minutes already worked today, other shifts),
   *      workMin (this shift so far, without its breaks) }
   * Returns { rule: 'night'|'day', phase: 'soon'|'now', at (ms, when it starts), text }.
   * night: from an hour before the night begins ("finish by 22:00"), and inside it. day: from half an hour before
   * the day's limit, and after it. The night comes first: it is the one that has a clock time to finish by.
   */
  function youthNow(o) {
    if (!o || o.age == null || !(o.age < 18) || !o.rules) return null;
    const R = o.rules, now = o.now, d = new Date(now);
    const h = d.getHours() + d.getMinutes() / 60;
    const from = U.pad(R.nightFrom) + ':00', to = U.pad(R.nightTo) + ':00';
    const nightAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), R.nightFrom).getTime();
    const out = [];
    if (h >= R.nightFrom || h < R.nightTo) {
      // after midnight, a shift that began the evening before is still "too late"; one that began this morning is "too early"
      const late = h >= R.nightFrom || (o.start < new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());
      out.push({ rule: 'night', phase: 'now', at: now, text: late ? `לפי החוק, בגילך לא עובדים אחרי ${from}` : `לפי החוק, בגילך לא עובדים לפני ${to}` });
    } else if (nightAt - now <= 60 * MIN) {
      out.push({ rule: 'night', phase: 'soon', at: nightAt, text: `לפי החוק, בגילך צריך לסיים עד ${from}` });
    }
    const limit = R.dayHours * 60, total = (+o.dayMin || 0) + (+o.workMin || 0);
    if (total >= limit) out.push({ rule: 'day', phase: 'now', at: now, text: `עברת ${R.dayHours} שעות היום. לפי החוק, בגילך זה המקסימום` });
    else if (limit - total <= 30) {
      const at = Math.ceil((now + (limit - total) * MIN) / MIN) * MIN;
      out.push({ rule: 'day', phase: 'soon', at, text: `ב-${U.epochHM(at)} יהיו לך ${R.dayHours} שעות היום, המקסימום לפי החוק בגילך` });
    }
    if (!out.length) return null;
    // inside a limit before near one; between two of the same kind, the night
    out.sort((a, b) => (a.phase === b.phase ? (a.rule === 'night' ? -1 : 1) : a.phase === 'now' ? -1 : 1));
    return Object.assign(out[0], { all: out });
  }

  /* ---------------- "did the salary arrive?" ---------------- */
  const ASK_DAYS = 7; // asked from pay day at noon, for a week at most
  /**
   * What the salary card shows today for one pay period: 'ask', 'gap' (a different amount was typed and the gap is not
   * closed yet) or null. ans: the saved answer { a: 'yes'|'other'|'not', d: the day it was given, closed }.
   * o: { lag: the days after the pay date this salary usually arrives (salaryLag), hasSlip: the period's payslip is in }.
   * A payslip in means the salary came: nothing is asked (the payslip's own check compares the amounts).
   */
  function salaryState(ans, payDate, today, hour, o) {
    if (!payDate || !today) return null;
    const lag = Math.max(0, Math.min(ASK_DAYS - 1, Math.round(+(o && o.lag) || 0)));
    const from = U.addDays(payDate, lag);
    if (today < from || today > U.addDays(from, ASK_DAYS)) return null;
    if (today === payDate && hour < 12) return null;
    if (o && o.hasSlip && (!ans || ans.a === 'not')) return null;
    if (!ans) return 'ask';
    if (ans.a === 'other') return ans.closed ? null : 'gap';
    if (ans.a === 'not') return today > ans.d ? 'ask' : null; // "not yet": asked again the next day
    return null;
  }
  /**
   * How many days after the pay date the salary usually arrives, learned from the answers: an answer that came after a
   * "not yet" counts its day (the salary came by then), one given at the first ask counts 0. The middle of the last six,
   * from two answers on; 0 before. answers: { periodKey: { a, d, pd: that period's pay date, nots: "not yet"s before } }.
   */
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  function salaryLag(answers) {
    if (!answers || typeof answers !== 'object') return 0;
    const out = [];
    for (const k of Object.keys(answers).sort()) {
      const x = answers[k];
      if (!x || (x.a !== 'yes' && x.a !== 'other') || !DAY_RE.test(x.pd || '') || !DAY_RE.test(x.d || '')) continue;
      out.push(+x.nots > 0 ? Math.max(0, Math.min(ASK_DAYS - 1, U.diffDays(x.pd, x.d))) : 0);
    }
    const last = out.slice(-6).sort((a, b) => a - b);
    return last.length >= 2 ? last[Math.floor((last.length - 1) / 2)] : 0;
  }
  /** The gap between what arrived and what was expected; small (under 2%, or 20 shekels) counts as the same. */
  function salaryGap(expected, got) {
    const e = +expected || 0, g = +got || 0;
    const diff = Math.round(g - e);
    return { diff, less: diff < 0, small: Math.abs(diff) < Math.max(20, e * 0.02) };
  }

  root.Moments = { quietHour, wageParts, wageLine, youthNow, salaryState, salaryLag, salaryGap, ASK_DAYS };
  if (typeof module !== 'undefined') module.exports = root.Moments;
})(typeof window !== 'undefined' ? window : globalThis);
