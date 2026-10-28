/* ============================================================
 * engine.js — pay calculation.
 *
 * A shift is cut into "slices" at every boundary that can change
 * its pay: role switches, Shabbat/holiday window edges, night
 * window edges and eve-premium edges. Each slice is then split by
 * the daily overtime counter (tier 0 = regular, 1 = first OT
 * hours, 2 = beyond). Each piece is paid
 *     hours × hourly rate × multiplier
 * and every multiplier comes from the employer's (editable) rules
 * or a manual override on the shift.
 *
 * Wage = base (100% of all hours) + rest premium + OT premium
 *        + night + eve + seniority + minimum-shift top-up + manual adjustments
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;
  const HebCal = root.HebCal;
  const MIN = U.MIN;
  /** The break the law asks for: in a working day of 6 hours or more, 45 minutes, 30 of them in a row. */
  const LAW_BREAK = { afterMin: 360, min: 45, text: 'לפי החוק, במשמרת של 6 שעות ומעלה מגיעה הפסקה של 45 דקות לפחות (30 מהן ברצף)' };

  /* ---------------- context helpers ---------------- */
  /** ctx = { settings, employers:[], roles:[], dayRules:[] } -> fast lookup object */
  function makeCtx(data) {
    const ctx = {
      settings: data.settings,
      employers: new Map((data.employers || []).map((e) => [e.id, e])),
      roles: new Map((data.roles || []).map((r) => [r.id, r])),
      dayRules: data.dayRules || [],
    };
    ctx.restCfg = Object.assign({}, data.settings.rest, { dayRules: ctx.dayRules });
    ctx.employer = (id) => ctx.employers.get(id) || ctx.employers.values().next().value || root.Defaults.defaultEmployer();
    ctx.primaryEmployer = () => ctx.employers.values().next().value || root.Defaults.defaultEmployer();
    return ctx;
  }

  /** Rate of a role on a given date key (latest rate whose `from` <= date). */
  function roleRate(role, k) {
    if (!role || !role.rates || !role.rates.length) return 0;
    const sorted = role.rates.slice().sort((a, b) => a.from.localeCompare(b.from));
    let r = sorted[0].rate;
    for (const x of sorted) if (x.from <= k) r = x.rate;
    return +r || 0;
  }

  function roundMinutes(min, mode, unit) {
    const m = Math.round(min);
    const u = +unit || 15;
    if (!mode || mode === 'none') return m;
    if (mode === 'nearest') return Math.round(m / u) * u;
    if (mode === 'up') return Math.ceil(m / u) * u;
    if (mode === 'down') return Math.floor(m / u) * u;
    return m;
  }

  /** Months between two date keys (whole months completed). */
  function monthsBetween(a, b) {
    const A = U.parseKey(a), B = U.parseKey(b);
    let m = (B.y - A.y) * 12 + (B.m - A.m);
    if (B.d < A.d) m--;
    return m;
  }

  /** Seniority add-on for an hourly rate. Returns ₪ per hour at 100%. */
  function seniorityDelta(emp, settings, k, rate) {
    if (!emp.seniorityEnabled || !settings.startDate) return 0;
    const months = monthsBetween(settings.startDate, k);
    if (months < (+emp.seniorityAfterMonths || 0)) return 0;
    if (emp.seniorityType === 'fixedPerHour') return +emp.seniorityValue || 0;
    // one step per completed year; once eligible, at least one step
    let pct = (+emp.seniorityValue || 0) * Math.max(1, Math.floor(months / 12));
    if (+emp.seniorityCapPct > 0) pct = Math.min(pct, +emp.seniorityCapPct);
    return (rate * pct) / 100;
  }

  /** Daily [from,to] intervals (epochs) of a 'HH:MM'-'HH:MM' window around [a,b]. */
  function dailyWindows(a, b, from, to) {
    const out = [];
    const k0 = U.addDays(U.epochKey(a), -1), k1 = U.epochKey(b);
    for (let k = k0; k <= k1; k = U.addDays(k, 1)) {
      const s = U.toEpoch(k, from);
      const e = to > from ? U.toEpoch(k, to) : U.toEpoch(U.addDays(k, 1), to);
      if (e > a && s < b) out.push([s, e]);
    }
    return out;
  }
  const inAny = (t, ivs) => ivs.some(([s, e]) => t >= s && t < e);
  function overlapMin(a, b, ivs) {
    let m = 0;
    for (const [s, e] of ivs) m += Math.max(0, Math.min(b, e) - Math.max(a, s));
    return m / MIN;
  }

  /** Role segments of a shift: primary role, then role switches at given times. */
  function buildSegments(shift, start, end) {
    const splits = (shift.splits || []).filter((s) => s.at > start && s.at < end && s.roleId).sort((a, b) => a.at - b.at);
    const segs = [];
    let cur = start, role = shift.roleId;
    for (const s of splits) {
      if (s.at > cur) segs.push({ roleId: role, start: cur, end: s.at });
      cur = s.at;
      role = s.roleId;
    }
    if (end > cur) segs.push({ roleId: role, start: cur, end });
    return segs;
  }

  function hasOverrides(shift) {
    const o = shift.overrides;
    if (!o) return false;
    return !!(o.rate || o.rest || o.ot || o.night || o.travel || o.special);
  }

  /* ---------------- overtime: the law's limits ----------------
   * By the law (חוק שעות עבודה ומנוחה; kolzchut.org.il "גמול עבור שעות נוספות"), in the private sector: first the
   * day — 8.6 hours in a five-day week (8 h 36 min), 8 in a six-day week and 7 on its Friday, 7 in a night shift (at
   * least 2 hours between 22:00 and 06:00) — then the week: regular hours beyond 42 (Sunday to Saturday) are overtime
   * too. (The five-day week's one short day of 7.6 hours comes out the same through the 42.) An employer whose
   * daily limit was set by hand (anything but the old default 8) keeps it; otLaw says which one applies. */
  const WEEK_REG_H = 42;
  const otByLaw = (emp) => (emp.otLaw != null ? !!emp.otLaw : !(+emp.otThreshold > 0) || +emp.otThreshold === 8);
  /** The day's regular hours before overtime starts. */
  function otDayHours(emp, settings, dateKey, nightShift) {
    if (otByLaw(emp)) {
      if (nightShift) return 7;
      const six = +((settings && settings.leave) || {}).workWeek === 6;
      return six ? (U.dow(dateKey) === 5 ? 7 : 8) : 8.6;
    }
    return emp.nightShiftShortDay && nightShift ? +emp.nightShiftThreshold || 7 : +emp.otThreshold || 8;
  }

  /**
   * Compute pay for one shift.
   * opts.priorMin  — paid minutes already worked earlier the same workday (daily OT)
   * opts.priorOtMin — of them, the overtime minutes (the day's first two overtime hours are tier 1)
   * opts.weekRegMin — regular (not overtime) minutes already worked earlier the same week (the 42-hour limit)
   * opts.ignoreOverrides — compute as if no manual overrides / day rules existed
   */
  function computeShift(shift, ctx, opts) {
    opts = opts || {};
    const emp = ctx.employer(shift.employerId);
    const settings = ctx.settings;
    const ov = opts.ignoreOverrides ? {} : shift.overrides || {};
    const warnings = [];
    const start = shift.start;
    const rawEnd = shift.end;
    const dk = U.epochKey(start);

    const elapsedMin = (rawEnd - start) / MIN;
    if (!(elapsedMin > 0)) {
      return emptyResult(shift, dk, ['שעת הסיום לפני שעת ההתחלה או שווה לה']);
    }
    const roundedMin = Math.max(0, roundMinutes(elapsedMin, emp.roundingMode, emp.roundingUnit));
    const end = start + roundedMin * MIN;
    const segs = buildSegments(shift, start, end);

    /* ---- windows ---- */
    const ignoreRules = !!opts.ignoreOverrides;
    const wins = HebCal.restWindows(U.addDays(dk, -1), U.addDays(U.epochKey(end), 1), ctx.restCfg, ignoreRules)
      .filter((w) => w.end > start && w.start < end);
    const evesAll = HebCal.restWindows(U.addDays(dk, -1), U.addDays(U.epochKey(end), 2), ctx.restCfg, ignoreRules)
      .filter((w) => w.eveStart && w.start > start && w.eveStart < end)
      .map((w) => [w.eveStart, w.start]);
    const nightOvEarly = ov.night || null;
    const nightIvs = emp.nightEnabled || (nightOvEarly && nightOvEarly.mode === 'pct')
      ? dailyWindows(start, end, emp.nightFrom || '22:00', emp.nightTo || '06:00') : [];
    const lawNight = dailyWindows(start, end, '22:00', '06:00');
    // Did a manual day rule (bulk cancel / force) change the rest windows of this shift?
    let dayRuleHit = false; // (also set below when a day's special rate applies)
    if (!ignoreRules && (ctx.dayRules || []).length) {
      const raw = HebCal.restWindows(U.addDays(dk, -1), U.addDays(U.epochKey(end), 1), ctx.restCfg, true)
        .filter((w) => w.end > start && w.start < end).map((w) => w.start + '-' + w.end).join();
      dayRuleHit = raw !== wins.map((w) => w.start + '-' + w.end).join();
    }

    const restOv = ov.rest || null;
    let restRange = null;
    if (restOv && restOv.scope === 'range' && restOv.from && restOv.to) {
      restRange = [restOv.from, restOv.to > restOv.from ? restOv.to : restOv.to + U.DAY];
    }

    /* ---- slicing ---- */
    const bset = new Set([start, end]);
    const addB = (t) => { if (t > start && t < end) bset.add(t); };
    segs.forEach((s) => { addB(s.start); addB(s.end); });
    wins.forEach((w) => { addB(w.start); addB(w.end); });
    evesAll.forEach(([s, e]) => { addB(s); addB(e); });
    nightIvs.forEach(([s, e]) => { addB(s); addB(e); });
    if (restRange) { addB(restRange[0]); addB(restRange[1]); }
    // a day with a special rate (a calendar day rule) begins and ends at midnight
    const pctRules = ignoreRules ? [] : (ctx.dayRules || []).filter((x) => x.type === 'pct' && +x.pct > 0);
    pctRules.forEach((x) => { addB(U.toEpoch(x.date, '00:00')); addB(U.toEpoch(U.addDays(x.date, 1), '00:00')); });
    const bounds = [...bset].sort((a, b) => a - b);

    const autoRestIvs = wins.map((w) => [w.start, w.end]);
    const slices = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1];
      const mid = (a + b) / 2;
      const seg = segs.find((s) => mid >= s.start && mid < s.end) || segs[segs.length - 1];
      let rest;
      const autoRest = inAny(mid, autoRestIvs);
      if (!restOv || !restOv.scope || restOv.scope === 'auto') rest = autoRest;
      else if (restOv.scope === 'off') rest = false;
      else if (restOv.scope === 'all') rest = true;
      else if (restOv.scope === 'range') rest = restRange ? mid >= restRange[0] && mid < restRange[1] : autoRest;
      else rest = autoRest;
      let night = inAny(mid, nightIvs);
      if (ov.night && ov.night.mode === 'off') night = false;
      if (ov.night && ov.night.mode === 'all') night = true;
      const eve = !rest && inAny(mid, evesAll);
      const win = wins.find((w) => mid >= w.start && mid < w.end);
      slices.push({ a, b, min: (b - a) / MIN, roleId: seg ? seg.roleId : shift.roleId, rest, autoRest, night, eve, winLabel: win ? win.label : null });
    }

    /* ---- breaks ----
     * Not entered (null): the law's break - in a day of 6 hours or more, 45 minutes (חוק שעות עבודה ומנוחה
     * §20; the youth law asks the same), paid or not as the shift says. Entered (a number, 0 too): as entered.
     * One entered on purpose (breakSet: typed in the editor, or taken with the timer) that is shorter than the
     * law's in a long shift is flagged; records from before 1.18 (a plain 0) stay as they were, quietly. */
    const breakAuto = shift.breakMin == null || shift.breakMin === '';
    const breakMin = breakAuto ? (roundedMin >= LAW_BREAK.afterMin ? LAW_BREAK.min : 0) : Math.max(0, +shift.breakMin || 0);
    const breakPaid = shift.breakPaid !== false;
    const breakShort = !breakAuto && !!shift.breakSet && roundedMin >= LAW_BREAK.afterMin && breakMin < LAW_BREAK.min;
    if (breakShort) warnings.push(LAW_BREAK.text);
    if (!breakPaid && breakMin >= roundedMin && roundedMin > 0) warnings.push('ההפסקה ארוכה מהמשמרת');
    const paidFactor = breakPaid || roundedMin === 0 ? 1 : Math.max(0, 1 - breakMin / roundedMin);
    const paidMin = roundedMin * paidFactor;

    /* ---- overtime tiers ---- */
    const lawNightMin = overlapMin(start, end, lawNight);
    const lawNightPaidH = (lawNightMin * paidFactor) / 60; // hours between 22:00-06:00, for reports
    const isNightShift = lawNightMin >= 120;
    let thresholdH = otDayHours(emp, settings, dk, isNightShift);
    const otOv = ov.ot || null;
    if (otOv && otOv.mode === 'threshold' && +otOv.hours > 0) thresholdH = +otOv.hours;
    const otOff = otOv && otOv.mode === 'off';
    const t1 = thresholdH * 60;
    const tier1Min = (+emp.otTier1Hours || 2) * 60;
    const daily = emp.otMode === 'daily';
    let cum = daily ? Math.max(0, +opts.priorMin || 0) : 0; // the day's paid minutes so far
    let dayOt = daily ? Math.max(0, +opts.priorOtMin || 0) : 0; // of them, overtime
    let weekReg = Math.max(0, +opts.weekRegMin || 0); // the week's regular minutes so far
    const weekCap = WEEK_REG_H * 60;
    let regMin = 0, otMin = 0, weekOtMin = 0;

    const pieces = [];
    for (const s of slices) {
      let pm = s.min * paidFactor;
      if (pm <= 0) continue;
      if (otOff) { pieces.push(Object.assign({}, s, { tier: 0, pm })); cum += pm; regMin += pm; weekReg += pm; continue; }
      // regular while both the day's and the week's regular hours last; then overtime: the day's first two
      // overtime hours at tier 1, the rest at tier 2
      while (pm > 1e-9) {
        const dayRoom = t1 - cum, weekRoom = weekCap - weekReg;
        const room = Math.min(dayRoom, weekRoom);
        if (room > 1e-9) {
          const x = Math.min(pm, room);
          pieces.push(Object.assign({}, s, { tier: 0, pm: x }));
          cum += x; weekReg += x; regMin += x; pm -= x;
          continue;
        }
        const t1Room = tier1Min - dayOt;
        const tier = t1Room > 1e-9 ? 1 : 2;
        const x = tier === 1 ? Math.min(pm, t1Room) : pm;
        pieces.push(Object.assign({}, s, { tier, pm: x }));
        if (dayRoom > 1e-9) weekOtMin += x; // overtime only because of the week's 42 hours
        cum += x; dayOt += x; otMin += x; pm -= x;
      }
    }

    /* ---- multipliers ---- */
    const restPct = restOv && +restOv.pct > 0 ? +restOv.pct : +emp.restPct || 150;
    const otPct = otOv && otOv.mode === 'pct' && +otOv.pct > 0 ? [100, +otOv.pct, +otOv.pct] : [100, +emp.otTier1Pct || 125, +emp.otTier2Pct || 150];
    const baseRestOt = [+emp.restPct || 150, +emp.restOt1Pct || 175, +emp.restOt2Pct || 200];
    const restPctArr = otOv && otOv.mode === 'pct' && +otOv.pct > 0
      ? [restPct, restPct + (+otOv.pct - 100), restPct + (+otOv.pct - 100)]
      : [restPct, baseRestOt[1] - baseRestOt[0] + restPct, baseRestOt[2] - baseRestOt[0] + restPct];
    const pctOf = (p) => (p.rest ? restPctArr[p.tier] : otPct[p.tier]);
    const regPctOf = (p) => otPct[p.tier]; // what this hour would pay if it weren't a rest hour
    const tier0Of = (p) => (p.rest ? restPctArr[0] : 100);

    const rateOf = (roleId) => {
      if (ov.rate && +ov.rate.rate > 0) return +ov.rate.rate;
      return roleRate(ctx.roles.get(roleId), dk);
    };

    /* ---- a special rate ----
     * The shift's own (a manual override), or the day's (a calendar day rule, e.g. election day at 200%): every
     * hour is paid at least that much; an hour already worth more (a Shabbat hour in overtime) keeps its own. */
    const specialOv = ov.special && +ov.special.pct > 0 ? { pct: +ov.special.pct, reason: ov.special.reason || '' } : null;
    const specialAt = (t) => {
      if (specialOv) return specialOv;
      if (!pctRules.length) return null;
      const k = U.epochKey(t);
      const r = pctRules.find((x) => x.date === k);
      return r ? { pct: +r.pct, reason: r.reason || '', day: true } : null;
    };
    let specialPremium = 0, specialHours = 0, specialTop = null;

    /* ---- wage lines ---- */
    const groups = new Map();
    let base = 0, restPremium = 0, otPremium = 0, nightPremium = 0, evePremium = 0, seniority = 0;
    const hoursBy = { regular: 0, ot1: 0, ot2: 0, rest: 0, restOt1: 0, restOt2: 0, night: 0, eve: 0 };
    const byRole = {};
    for (const p of pieces) {
      const h = p.pm / 60;
      const rate = rateOf(p.roleId);
      const pct = pctOf(p);
      const key = p.roleId + '|' + (p.rest ? 'R' : 'N') + '|' + p.tier + '|' + pct + '|' + rate;
      if (!groups.has(key)) groups.set(key, { roleId: p.roleId, rest: p.rest, tier: p.tier, pct, rate, hours: 0, winLabel: p.winLabel });
      groups.get(key).hours += h;
      base += h * rate;
      if (p.rest) restPremium += h * rate * (pct - regPctOf(p)) / 100;
      otPremium += h * rate * (regPctOf(p) - 100) / 100;
      const sd = seniorityDelta(emp, settings, dk, rate);
      seniority += h * sd * pct / 100;
      if (p.night) hoursBy.night += h;
      if (p.eve) { hoursBy.eve += h; evePremium += h * rate * (+emp.evePct || 0) / 100; }
      const bucket = p.rest ? ['rest', 'restOt1', 'restOt2'][p.tier] : ['regular', 'ot1', 'ot2'][p.tier];
      hoursBy[bucket] += h;
      byRole[p.roleId] = byRole[p.roleId] || { hours: 0, amount: 0 };
      byRole[p.roleId].hours += h;
      byRole[p.roleId].amount += h * rate * pct / 100;
      const sp = specialAt((p.a + p.b) / 2);
      if (sp && sp.pct > pct) {
        const up = h * rate * (sp.pct - pct) / 100;
        specialPremium += up;
        specialHours += h;
        byRole[p.roleId].amount += up;
        if (!specialTop || sp.pct > specialTop.pct) specialTop = sp;
      }
    }
    if (specialTop && specialTop.day) dayRuleHit = true;
    // night premium
    const nightOv = ov.night || null;
    const nightOn = emp.nightEnabled || (nightOv && (nightOv.mode === 'all' || nightOv.mode === 'pct'));
    if (nightOn) {
      if (nightOv && nightOv.mode === 'all') {
        hoursBy.night = paidMin / 60;
      }
      const npct = nightOv && nightOv.mode === 'pct' && +nightOv.pct >= 0 ? +nightOv.pct : +emp.nightValue || 0;
      for (const p of pieces) {
        const isN = nightOv && nightOv.mode === 'all' ? true : p.night;
        if (!isN) continue;
        const h = p.pm / 60;
        if (emp.nightType === 'fixed' && !(nightOv && nightOv.mode === 'pct')) nightPremium += h * npct;
        else nightPremium += h * rateOf(p.roleId) * npct / 100;
      }
    }

    const lines = [];
    const order = [...groups.values()].sort((a, b) => (a.rest - b.rest) || (a.tier - b.tier));
    for (const g of order) {
      const role = ctx.roles.get(g.roleId);
      const cat = g.rest ? (g.winLabel || 'שבת/חג') : g.tier === 0 ? 'שעות רגילות' : 'שעות נוספות';
      const otNote = g.rest && g.tier > 0 ? ' + שעות נוספות' : '';
      lines.push({
        roleId: g.roleId, roleName: role ? role.name : 'תפקיד', color: role ? role.color : '#888',
        label: cat + otNote, rest: g.rest, tier: g.tier, hours: g.hours, rate: g.rate, pct: g.pct,
        amount: g.hours * g.rate * g.pct / 100,
      });
    }

    /* ---- extras ---- */
    const extras = [];
    if (nightPremium > 0) extras.push({ kind: 'night', label: 'תוספת לילה', detail: U.hours(hoursBy.night) + ' ש׳', amount: nightPremium });
    if (evePremium > 0) extras.push({ kind: 'eve', label: 'תוספת ערב שבת/חג', detail: U.hours(hoursBy.eve) + ' ש׳ × ' + emp.evePct + '%', amount: evePremium });
    if (seniority > 0) extras.push({ kind: 'seniority', label: 'תוספת ותק', detail: '', amount: seniority });
    if (specialPremium > 0) extras.push({ kind: 'special', label: `תעריף מיוחד ${specialTop.pct}%${specialTop.reason ? ' · ' + specialTop.reason : ''}`, detail: U.hours(specialHours) + ' ש׳, ההפרש מעבר לתעריף הרגיל', amount: specialPremium });

    // minimum paid hours per shift
    let minTopUp = 0;
    const minH = +emp.minShiftHours || 0;
    if (minH > 0 && paidMin < minH * 60 && pieces.length) {
      const last = pieces[pieces.length - 1];
      const topH = (minH * 60 - paidMin) / 60;
      const r = rateOf(last.roleId);
      minTopUp = topH * r * tier0Of(last) / 100;
      extras.push({ kind: 'min', label: 'השלמה למינימום ' + minH + ' ש׳', detail: U.hours(topH) + ' ש׳ × ' + U.money(r) + ' × ' + tier0Of(last) + '%', amount: minTopUp });
    }

    // manual amount overrides (replace the automatic premium with the typed amount)
    let adjust = 0;
    const overrideList = [];
    if (restOv) {
      if (restOv.scope && restOv.scope !== 'auto') overrideList.push(restOv.scope === 'off' ? 'ביטול שבת/חג' : restOv.scope === 'all' ? 'שבת/חג לכל המשמרת' : 'טווח שבת/חג ידני');
      if (+restOv.pct > 0 && +restOv.pct !== (+emp.restPct || 150)) overrideList.push('אחוז שבת/חג ' + restOv.pct + '%');
      if (restOv.amount != null && restOv.amount !== '') {
        const d = +restOv.amount - restPremium;
        adjust += d;
        extras.push({ kind: 'adjust', label: 'תוספת שבת/חג — סכום ידני', detail: 'במקום ' + U.money(restPremium), amount: d });
        overrideList.push('סכום שבת/חג ידני');
      }
    }
    if (otOv) {
      overrideList.push(otOv.mode === 'off' ? 'ביטול שעות נוספות' : otOv.mode === 'threshold' ? 'סף שעות נוספות ' + otOv.hours : otOv.mode === 'pct' ? 'אחוז שעות נוספות ' + otOv.pct + '%' : 'סכום שעות נוספות ידני');
      if (otOv.mode === 'amount') {
        const d = (+otOv.amount || 0) - otPremium;
        adjust += d;
        extras.push({ kind: 'adjust', label: 'שעות נוספות — סכום ידני', detail: 'במקום ' + U.money(otPremium), amount: d });
      }
    }
    if (nightOv) {
      overrideList.push(nightOv.mode === 'off' ? 'ביטול תוספת לילה' : nightOv.mode === 'all' ? 'לילה לכל המשמרת' : nightOv.mode === 'pct' ? 'אחוז לילה ' + nightOv.pct + '%' : 'סכום לילה ידני');
      if (nightOv.mode === 'amount') {
        const d = (+nightOv.amount || 0) - nightPremium;
        adjust += d;
        extras.push({ kind: 'adjust', label: 'תוספת לילה — סכום ידני', detail: 'במקום ' + U.money(nightPremium), amount: d });
      }
    }
    if (ov.rate && +ov.rate.rate > 0) overrideList.push('תעריף ידני ' + U.money(+ov.rate.rate));
    if (specialOv) overrideList.push('תעריף מיוחד ' + specialOv.pct + '%');

    /* ---- travel ---- */
    let travel = { mode: 'auto', amount: +emp.travelPerDay || 0 };
    if (shift.noTravel) travel = { mode: 'none', amount: 0 };
    if (ov.travel) {
      if (ov.travel.mode === 'off') { travel = { mode: 'none', amount: 0 }; overrideList.push('ביטול נסיעות'); }
      else if (ov.travel.mode === 'amount') { travel = { mode: 'manual', amount: +ov.travel.amount || 0 }; overrideList.push('נסיעות ידני'); }
    }

    /* ---- items ---- */
    let bonus = 0, tips = 0, additions = 0, deductions = 0;
    for (const it of shift.items || []) {
      const a = +it.amount || 0;
      if (it.type === 'bonus') bonus += a;
      else if (it.type === 'tips') tips += a;
      else if (it.type === 'addition') additions += a;
      else if (it.type === 'deduction') deductions += a;
    }

    const wage = base + restPremium + otPremium + nightPremium + evePremium + seniority + minTopUp + adjust + specialPremium;
    const restLabels = [...new Set(slices.filter((s) => s.rest && s.winLabel).map((s) => s.winLabel))];
    const autoRestRange = wins.length ? { from: Math.max(start, wins[0].start), to: Math.min(end, wins[wins.length - 1].end) } : null;
    const autoRestMin = slices.filter((s) => s.autoRest).reduce((m, s) => m + s.min, 0);

    if (roundedMin > (+settings.alerts.suspiciousHours || 20) * 60) warnings.push('משמרת ארוכה במיוחד (' + U.hm(roundedMin) + ')');

    return {
      id: shift.id, kind: 'shift', dateKey: dk, employerId: shift.employerId, status: shift.status || 'done',
      start, end, rawEnd, elapsedMin, roundedMin, roundingDeltaMin: roundedMin - Math.round(elapsedMin),
      breakMin, breakPaid, breakAuto, breakShort, paidMin, paidHours: paidMin / 60,
      segments: segs, slices, pieces, lines, extras,
      base, restPremium, otPremium, nightPremium, evePremium, seniority, minTopUp, adjust, specialPremium, specialHours,
      wage, hoursBy, byRole,
      restHours: hoursBy.rest + hoursBy.restOt1 + hoursBy.restOt2,
      otHours: hoursBy.ot1 + hoursBy.ot2 + hoursBy.restOt1 + hoursBy.restOt2,
      nightHours: hoursBy.night, lawNightHours: lawNightPaidH, isNightShift,
      travel, bonus, tips, additions, deductions,
      total: wage + travel.amount + bonus + additions,
      restLabels, autoRestRange, autoRestMin,
      thresholdH, priorMin: +opts.priorMin || 0, otByLaw: otByLaw(emp),
      regMin, otMin, weekOtMin, weekRegBefore: Math.max(0, +opts.weekRegMin || 0),
      overridden: !opts.ignoreOverrides && hasOverrides(shift), overrideList,
      dayRuleHit,
      warnings,
    };
  }

  function emptyResult(shift, dk, warnings) {
    return {
      id: shift.id, kind: 'shift', dateKey: dk, employerId: shift.employerId, status: shift.status || 'done',
      start: shift.start, end: shift.end, rawEnd: shift.end, elapsedMin: 0, roundedMin: 0, roundingDeltaMin: 0, breakMin: 0, breakPaid: true, breakAuto: false, breakShort: false,
      paidMin: 0, paidHours: 0, segments: [], slices: [], pieces: [], lines: [], extras: [],
      base: 0, restPremium: 0, otPremium: 0, nightPremium: 0, evePremium: 0, seniority: 0, minTopUp: 0, adjust: 0, specialPremium: 0, specialHours: 0, wage: 0,
      hoursBy: { regular: 0, ot1: 0, ot2: 0, rest: 0, restOt1: 0, restOt2: 0, night: 0, eve: 0 }, byRole: {},
      restHours: 0, otHours: 0, nightHours: 0, lawNightHours: 0, isNightShift: false, travel: { mode: 'none', amount: 0 },
      bonus: 0, tips: 0, additions: 0, deductions: 0, total: 0, restLabels: [], autoRestRange: null, autoRestMin: 0,
      thresholdH: 8, priorMin: 0, overridden: false, overrideList: [], dayRuleHit: false, warnings,
    };
  }

  /**
   * Compute every shift. Shifts of the same employer that start on the
   * same date share the daily overtime counter, in chronological order.
   * Returns Map(id -> result).
   */
  /** A shift the engine can work with: real times, ending after it starts, at most a week long
   *  (a timer someone forgot to stop is still counted; a garbage end date can't make it loop for years). */
  const validShift = (s) => !!s && typeof s === 'object' && typeof s.id === 'string'
    && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.end - s.start <= 7 * 24 * 3600000;
  const validEntry = (e) => !!e && typeof e === 'object' && typeof e.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date || '');
  function computeAll(shifts, ctx, opts) {
    opts = opts || {};
    const out = new Map();
    const groups = new Map();
    for (const s of shifts) {
      if (!s || (s.kind && s.kind !== 'shift')) continue;
      if (!validShift(s)) continue; // a damaged record (an old backup, a bad sync) is skipped, never fatal
      const key = (s.employerId || '') + '|' + U.epochKey(s.start) + '|' + (s.status === 'planned' ? 'p' : 'd');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    // days in date order, so the week's regular hours (the 42-hour limit) add up from Sunday on
    const weekReg = new Map(); // employer|status|the week's Sunday → regular minutes so far
    const keys = [...groups.keys()].sort((a, b) => { const [ea, da, sa] = a.split('|'), [eb, db, sb] = b.split('|'); return ea === eb ? (sa === sb ? (da < db ? -1 : da > db ? 1 : 0) : sa < sb ? -1 : 1) : ea < eb ? -1 : 1; });
    for (const key of keys) {
      const list = groups.get(key);
      list.sort((a, b) => a.start - b.start);
      const [emp, dk, st] = key.split('|');
      const wk = emp + '|' + st + '|' + U.addDays(dk, -U.dow(dk));
      let prior = 0, priorOt = 0;
      for (const s of list) {
        let r;
        try { r = computeShift(s, ctx, { priorMin: prior, priorOtMin: priorOt, weekRegMin: weekReg.get(wk) || 0, ignoreOverrides: opts.ignoreOverrides }); } catch (e) {
          if (typeof console !== 'undefined') console.warn('shift skipped, it could not be calculated', s.id, e && e.message);
          continue;
        }
        out.set(s.id, r);
        prior += r.paidMin;
        priorOt += r.otMin || 0;
        weekReg.set(wk, (weekReg.get(wk) || 0) + (r.regMin || 0));
      }
    }
    return out;
  }

  /* ---------------- pay periods ---------------- */
  /** Pay period identified by the month in which it ends. */
  function periodByKey(pk, emp) {
    const S = +(emp && emp.periodStartDay) || 1;
    const payDay = +(emp && emp.payDay) || 9;
    let from, to;
    if (S <= 1) { from = U.monthStart(pk); to = U.monthEnd(pk); }
    else {
      const prev = U.addMonthKey(pk, -1);
      const lastPrev = +U.monthEnd(prev).slice(8);
      from = prev + '-' + U.pad(Math.min(S, lastPrev));
      const lastCur = +U.monthEnd(pk).slice(8);
      to = U.addDays(pk + '-' + U.pad(Math.min(S, lastCur)), -1);
    }
    const nm = U.addMonthKey(pk, 1);
    const payDate = nm + '-' + U.pad(Math.min(payDay, +U.monthEnd(nm).slice(8)));
    return { key: pk, from, to, payDate, label: U.fmtMonth(pk) };
  }
  function periodOf(k, emp) {
    const S = +(emp && emp.periodStartDay) || 1;
    const mk = U.monthKey(k);
    if (S <= 1) return periodByKey(mk, emp);
    const d = +k.slice(8);
    return periodByKey(d >= S ? U.addMonthKey(mk, 1) : mk, emp);
  }

  /* ---------------- leave day values ---------------- */
  function primaryRate(ctx, k) {
    const r = [...ctx.roles.values()].filter((x) => !x.archived)[0];
    return r ? roleRate(r, k) : 0;
  }
  /** Value of one paid leave day before `k`. */
  function dayValue(k, ctx, results) {
    const L = ctx.settings.leave;
    if (L.dayValueMode === 'fixed' && +L.dayFixed > 0) return { value: +L.dayFixed, basis: 'סכום קבוע שהוגדר' };
    if (L.dayValueMode === 'hours') {
      const v = (+L.dayHours || 8) * primaryRate(ctx, k);
      return { value: v, basis: L.dayHours + ' ש׳ × התעריף של התפקיד הראשי' };
    }
    const from = U.addDays(k, -90);
    let base = 0;
    const days = new Set();
    for (const r of results.values()) {
      if (r.status !== 'done' || r.dateKey < from || r.dateKey >= k) continue;
      base += r.base;
      days.add(r.dateKey);
    }
    if (days.size >= 3) return { value: base / days.size, basis: 'ממוצע שכר יומי רגיל ב-90 הימים הקודמים (' + days.size + ' ימי עבודה)' };
    const v = (+L.dayHours || 8) * primaryRate(ctx, k);
    return { value: v, basis: 'אין מספיק נתונים — ' + (L.dayHours || 8) + ' ש׳ × תעריף בסיס' };
  }

  /** Value of every vacation / sick / adjustment entry. Map(id -> {amount, label, basis, pct, dayIndex}) */
  function computeEntries(entries, ctx, results) {
    const out = new Map();
    const L = ctx.settings.leave;
    const sick = entries.filter((e) => e.kind === 'sick' && e.status !== 'planned').sort((a, b) => a.date.localeCompare(b.date));
    // sick episodes: consecutive sick days (gap <= 3 days, no shift in between)
    let prev = null, idx = 0;
    const shiftDays = new Set([...results.values()].filter((r) => r.status === 'done').map((r) => r.dateKey));
    for (const e of sick) {
      let same = false;
      if (prev) {
        const gap = U.diffDays(prev.date, e.date);
        same = gap >= 1 && gap <= 3;
        if (same) for (let k = U.addDays(prev.date, 1); k < e.date; k = U.addDays(k, 1)) if (shiftDays.has(k)) same = false;
      }
      idx = same ? idx + 1 : 1;
      const pcts = L.sickPct || [0, 50, 50, 100];
      const pct = pcts[Math.min(idx, pcts.length) - 1];
      const dv = e.amount != null && e.amount !== '' ? { value: +e.amount, basis: 'סכום ידני' } : dayValue(e.date, ctx, results);
      out.set(e.id, { amount: e.amount != null && e.amount !== '' ? +e.amount : dv.value * pct / 100, pct, dayIndex: idx, basis: dv.basis + ' · יום ' + idx + ' למחלה: ' + pct + '%', label: 'יום מחלה' });
      prev = e;
    }
    for (const e of entries) {
      if (e.kind === 'vacation') {
        const dv = e.amount != null && e.amount !== '' ? { value: +e.amount, basis: 'סכום ידני' } : dayValue(e.date, ctx, results);
        out.set(e.id, { amount: dv.value, pct: 100, basis: dv.basis, label: 'יום חופשה' });
      } else if (e.kind === 'adjustment') {
        out.set(e.id, { amount: +e.amount || 0, label: e.label || ADJ_LABELS[e.type] || 'תוספת', basis: 'הוזן ידנית', type: e.type });
      } else if (e.kind === 'sick' && !out.has(e.id)) {
        out.set(e.id, { amount: 0, pct: 0, basis: 'מתוכנן', label: 'יום מחלה' });
      }
    }
    return out;
  }
  const ADJ_LABELS = { bonus: 'בונוס', tips: 'טיפים', addition: 'תוספת חד-פעמית', deduction: 'ניכוי' };

  /* ---------------- travel per day with monthly cap ---------------- */
  /** Map(dateKey -> {amount, raw}) for done shifts, cap applied per pay period & employer. */
  function travelByDay(results, ctx) {
    const days = new Map(); // emp|date -> {auto:bool, manual:sum}
    for (const r of results.values()) {
      if (r.status !== 'done' || r.travel.mode === 'none') continue;
      const k = r.employerId + '|' + r.dateKey;
      const d = days.get(k) || { auto: false, manual: 0, emp: r.employerId, date: r.dateKey };
      if (r.travel.mode === 'manual') d.manual += r.travel.amount; else d.auto = true;
      days.set(k, d);
    }
    const perPeriod = new Map();
    for (const d of days.values()) {
      const emp = ctx.employer(d.emp);
      d.raw = (d.auto ? +emp.travelPerDay || 0 : 0) + d.manual;
      const p = periodOf(d.date, emp).key + '|' + d.emp;
      const pp = perPeriod.get(p) || { total: 0, list: [], cap: +emp.travelMonthlyCap || 0 };
      pp.total += d.raw;
      pp.list.push(d);
      perPeriod.set(p, pp);
    }
    const out = new Map();
    for (const pp of perPeriod.values()) {
      const f = pp.cap > 0 && pp.total > pp.cap ? pp.cap / pp.total : 1;
      for (const d of pp.list) {
        const cur = out.get(d.date) || { amount: 0, raw: 0, capped: false };
        cur.amount += d.raw * f;
        cur.raw += d.raw;
        cur.capped = cur.capped || f < 1;
        out.set(d.date, cur);
      }
    }
    return out;
  }

  /* ---------------- tax / net ---------------- */
  function incomeTaxRaw(taxable, brackets) {
    let tax = 0, prev = 0;
    for (const [upTo, pct] of brackets) {
      const top = upTo === null || upTo === 'Infinity' ? Infinity : +upTo;
      if (taxable > prev) tax += (Math.min(taxable, top) - prev) * pct / 100;
      prev = top;
      if (taxable <= top) break;
    }
    return tax;
  }
  /** Whole years between a birth date and a date key (null if unknown). */
  function ageAt(birthKey, k) {
    if (!birthKey) return null;
    const B = U.parseKey(birthKey), K = U.parseKey(k);
    let a = K.y - B.y;
    if (K.m < B.m || (K.m === B.m && K.d < B.d)) a--;
    return a;
  }
  const isMinor = (settings, k) => { const a = ageAt(settings.birthDate, k || U.todayKey()); return a != null && a < 18; };
  /** Mandatory pension (צו ההרחבה לביטוח פנסיוני) starts at 21 for men and 20 for women. */
  const pensionMinAge = (settings) => (settings.gender === 'f' ? 20 : 21);
  function pensionActive(settings, periodTo) {
    if (!settings.pension.enabled) return false;
    const age = ageAt(settings.birthDate, periodTo || U.todayKey());
    if (age != null && age < pensionMinAge(settings)) return false;
    if (!settings.startDate) return true;
    return monthsBetween(settings.startDate, periodTo) >= (+settings.pension.startAfterMonths || 0);
  }
  /**
   * Estimated net for one month.
   * p = { gross, pensionBase, deductions, periodTo, months (1 = monthly brackets) }
   */
  function netEstimate(p, settings) {
    const T = settings.tax;
    const months = p.months || 1;
    const gross = Math.max(0, p.gross);
    // under 18: no income tax, no National Insurance / health tax, no pension — net equals gross
    if (isMinor(settings, p.periodTo)) {
      const deductions = +p.deductions || 0;
      return { gross, taxBefore: 0, credits: 0, pensionCredit: 0, incomeTax: 0, bl: 0, health: 0, pensionEmployee: 0, pensionEmployer: 0, severance: 0, hishtalmut: 0, hishtalmutEmployer: 0, deductions, net: gross - deductions, pensionActive: false, minor: true };
    }
    const pActive = p.pensionActive != null ? p.pensionActive : pensionActive(settings, p.periodTo || U.todayKey());
    const pensionEmployee = pActive ? p.pensionBase * (+settings.pension.employeePct || 0) / 100 : 0;
    const pensionEmployer = pActive ? p.pensionBase * (+settings.pension.employerPct || 0) / 100 : 0;
    const severance = pActive ? p.pensionBase * (+settings.pension.severancePct || 0) / 100 : 0;
    const H = settings.hishtalmut;
    const hActive = H.enabled && (!settings.startDate || monthsBetween(settings.startDate, p.periodTo || U.todayKey()) >= (+H.startAfterMonths || 0));
    const hishtalmut = hActive ? p.pensionBase * (+H.employeePct || 0) / 100 : 0;
    const hishtalmutEmployer = hActive ? p.pensionBase * (+H.employerPct || 0) / 100 : 0;
    const brackets = T.brackets.map(([u, pct]) => [u === Infinity || u == null ? Infinity : u * months, pct]);
    const taxBefore = incomeTaxRaw(gross, brackets);
    const credits = (+T.creditPoints || 0) * (+T.creditPointValue || 0) * months;
    const pensionCredit = Math.min(pensionEmployee, 0.07 * Math.min(gross, (+T.pensionCreditCap || 9700) * months)) * (+T.pensionCreditPct || 35) / 100;
    const incomeTax = Math.max(0, taxBefore - credits - pensionCredit);
    const lim = blLimits(T, p.periodTo || U.todayKey());
    const thr = lim.thr * months;
    const ceil = lim.ceil * months;
    const g1 = Math.min(gross, thr), g2 = Math.max(0, Math.min(gross, ceil) - thr);
    const bl = g1 * T.blReducedPct / 100 + g2 * T.blFullPct / 100;
    const health = g1 * T.healthReducedPct / 100 + g2 * T.healthFullPct / 100;
    const deductions = +p.deductions || 0;
    const net = gross - incomeTax - bl - health - pensionEmployee - hishtalmut - deductions;
    return { gross, taxBefore, credits, pensionCredit, incomeTax, bl, health, pensionEmployee, pensionEmployer, severance, hishtalmut, hishtalmutEmployer, deductions, net, pensionActive: pActive };
  }

  /* ---------------- aggregation ---------------- */
  /**
   * Build the full derived model from raw data.
   * data = { settings, employers, roles, dayRules, shifts, entries }
   */
  function buildModel(data) {
    const ctx = makeCtx(data);
    const shifts = (data.shifts || []).filter(validShift); // damaged records never reach the calculation
    const results = computeAll(shifts, ctx);
    const autoResults = computeAll(shifts.filter(hasOverrides).length || (data.dayRules || []).length ? shifts : [], ctx, { ignoreOverrides: true });
    const entries = (data.entries || []).filter(validEntry);
    const entryVals = computeEntries(entries, ctx, results);
    const travel = travelByDay(results, ctx);
    return { ctx, results, autoResults, entries, entryVals, travel, data };
  }

  function emptyTotals() {
    return {
      hours: 0, shifts: 0, wage: 0, base: 0, restPremium: 0, otPremium: 0, nightPremium: 0, evePremium: 0, seniority: 0, minTopUp: 0, adjust: 0, specialPremium: 0,
      travel: 0, travelRaw: 0, bonus: 0, tips: 0, additions: 0, deductions: 0, leavePay: 0, vacationDays: 0, sickDays: 0,
      hoursBy: { regular: 0, ot1: 0, ot2: 0, rest: 0, restOt1: 0, restOt2: 0, night: 0, eve: 0 },
      byRole: {}, workDays: 0, days: 0, dayTotals: {}, longest: null, bestDay: null, overridden: 0, nightShifts: 0, nightAll: 0,
      startHours: [],
    };
  }

  /** Totals of done items in [from, to] (date keys). */
  function totals(model, from, to, opts) {
    opts = opts || {};
    const t = emptyTotals();
    const status = opts.status || 'done';
    const workDays = new Set();
    for (const r of model.results.values()) {
      if (r.status !== status || r.dateKey < from || r.dateKey > to) continue;
      if (opts.employerId && r.employerId !== opts.employerId) continue;
      if (opts.roleId && !r.byRole[opts.roleId]) continue;
      t.shifts++;
      t.hours += r.paidHours;
      t.wage += r.wage; t.base += r.base; t.restPremium += r.restPremium; t.otPremium += r.otPremium;
      t.nightPremium += r.nightPremium; t.evePremium += r.evePremium; t.seniority += r.seniority; t.minTopUp += r.minTopUp; t.adjust += r.adjust; t.specialPremium += r.specialPremium || 0;
      t.bonus += r.bonus; t.tips += r.tips; t.additions += r.additions; t.deductions += r.deductions;
      for (const k in r.hoursBy) t.hoursBy[k] += r.hoursBy[k];
      for (const id in r.byRole) {
        t.byRole[id] = t.byRole[id] || { hours: 0, amount: 0 };
        t.byRole[id].hours += r.byRole[id].hours;
        t.byRole[id].amount += r.byRole[id].amount;
      }
      workDays.add(r.dateKey);
      t.dayTotals[r.dateKey] = (t.dayTotals[r.dateKey] || 0) + r.wage + r.bonus + r.additions;
      if (!t.longest || r.paidMin > t.longest.paidMin) t.longest = r;
      if (r.overridden || r.dayRuleHit) t.overridden++;
      if (r.isNightShift) t.nightShifts++;
      t.nightAll += r.lawNightHours || 0;
      t.startHours.push(new Date(r.start).getHours());
      if (status === 'planned') { t.travel += r.travel.amount; }
    }
    if (status === 'done') {
      for (const [k, v] of model.travel) {
        if (k < from || k > to) continue;
        t.travel += v.amount; t.travelRaw += v.raw;
        t.dayTotals[k] = (t.dayTotals[k] || 0) + v.amount;
      }
      for (const e of model.entries) {
        if (e.status === 'planned' || e.date < from || e.date > to) continue;
        if (opts.employerId && e.employerId && e.employerId !== opts.employerId) continue;
        const v = model.entryVals.get(e.id);
        if (!v) continue;
        if (e.kind === 'vacation') { t.leavePay += v.amount; t.vacationDays++; }
        else if (e.kind === 'sick') { t.leavePay += v.amount; t.sickDays++; }
        else if (e.kind === 'adjustment') {
          if (e.type === 'deduction') t.deductions += v.amount;
          else if (e.type === 'tips') t.tips += v.amount;
          else if (e.type === 'bonus') t.bonus += v.amount;
          else t.additions += v.amount;
        }
      }
    }
    t.workDays = workDays.size;
    t.days = U.diffDays(from, to) + 1;
    t.gross = t.wage + t.travel + t.bonus + t.additions + t.leavePay;
    t.avgHourly = t.hours > 0 ? t.wage / t.hours : 0;
    t.avgShift = t.shifts > 0 ? t.hours / t.shifts : 0;
    t.restHours = t.hoursBy.rest + t.hoursBy.restOt1 + t.hoursBy.restOt2;
    t.otHours = t.hoursBy.ot1 + t.hoursBy.ot2 + t.hoursBy.restOt1 + t.hoursBy.restOt2;
    let best = null;
    for (const k in t.dayTotals) if (!best || t.dayTotals[k] > best.amount) best = { key: k, amount: t.dayTotals[k] };
    t.bestDay = best;
    return t;
  }

  /** Pensionable wage of a totals object. */
  function pensionBaseOf(t, settings) {
    if (settings.pension.base === 'all') return t.wage + t.bonus + t.additions + t.leavePay;
    return t.base + t.leavePay;
  }

  /** Totals + net estimate for a pay period. */
  function periodSummary(model, pk, empId) {
    const emp = model.ctx.employer(empId);
    const P = periodByKey(pk, emp);
    const t = totals(model, P.from, P.to, { employerId: model.ctx.employers.size > 1 ? empId : null });
    const net = netEstimate({ gross: t.gross, pensionBase: pensionBaseOf(t, model.ctx.settings), deductions: t.deductions, periodTo: P.to }, model.ctx.settings);
    return Object.assign(t, { period: P, net });
  }

  /** Totals for an arbitrary range, with net estimated per overlapping pay period. */
  function rangeSummary(model, from, to) {
    const t = totals(model, from, to);
    const emp = model.ctx.primaryEmployer();
    let net = 0, tax = 0, bl = 0, health = 0, pension = 0, hish = 0, pensionEmployer = 0;
    let pk = periodOf(from, emp).key;
    const lastPk = periodOf(to, emp).key;
    for (let guard = 0; pk <= lastPk && guard < 400; guard++, pk = U.addMonthKey(pk, 1)) {
      const P = periodByKey(pk, emp);
      const full = totals(model, P.from, P.to);
      if (full.gross <= 0) continue;
      const part = totals(model, P.from < from ? from : P.from, P.to > to ? to : P.to);
      const n = netEstimate({ gross: full.gross, pensionBase: pensionBaseOf(full, model.ctx.settings), deductions: full.deductions, periodTo: P.to }, model.ctx.settings);
      const f = part.gross / full.gross;
      net += n.net * f; tax += n.incomeTax * f; bl += n.bl * f; health += n.health * f; pension += n.pensionEmployee * f;
      hish += n.hishtalmut * f; pensionEmployer += n.pensionEmployer * f;
    }
    t.net = { net, incomeTax: tax, bl, health, pensionEmployee: pension, hishtalmut: hish, pensionEmployer, gross: t.gross };
    return t;
  }

  /* ---------------- leave balances ---------------- */
  const VAC_TABLE = { 5: [12, 12, 12, 12, 12, 14, 15, 16, 17, 18, 19, 20, 20, 20], 6: [14, 14, 14, 14, 14, 16, 18, 19, 20, 21, 22, 23, 24, 24] };
  function vacationEntitlement(year, workWeek) {
    const t = VAC_TABLE[workWeek === 6 ? 6 : 5];
    return t[Math.min(year, t.length) - 1];
  }
  function recuperationDays(year) {
    if (year < 1) return 0;
    if (year === 1) return 5;
    if (year <= 3) return 6;
    if (year <= 10) return 7;
    if (year <= 15) return 8;
    if (year <= 19) return 9;
    return 10;
  }
  /** Estimated accrual of vacation / sick days and recuperation, as of `asOf`. */
  /**
   * Holiday pay (דמי חגים) for an hourly worker, holiday by holiday (the extension order, framework agreement
   * 2000 §7, as Kol Zchut explains it): the nine rest days of the Jewish holidays, paid when the worker has
   * three months at the workplace, the holiday fell on a day they would have worked and did not work because of
   * it, and they worked the day before and after or were away with the employer's consent (not scheduled counts).
   * A holiday on Friday or Shabbat is paid only to someone who works on that day. The pay is a regular day's:
   * the average daily hours of the three months before × the hourly rate (no travel).
   * What the app cannot know (whether they "would have worked") is read from their own shifts: a weekday they
   * usually work, or shifts on most days. A holiday they worked on is paid as work; holiday pay comes on top only
   * when the work was not their choice (said, not counted).
   * → [{ key, id, name, dow, status: 'due'|'maybe'|'worked'|'weekend'|'seniority'|'nowork', amount, avgHours, rate }]
   */
  function holidayPay(model, from, to, today) {
    const ctx = model.ctx, settings = ctx.settings;
    const out = [];
    const years = new Set([+from.slice(0, 4), +to.slice(0, 4)]);
    const hols = [...years].flatMap((y) => HebCal.holidaysForYear(y)).filter((h) => h.rest && h.key >= from && h.key <= to && h.key <= today);
    const done = [...model.results.values()].filter((r) => r.status === 'done' && r.paidMin > 0);
    // before the first shift in the app nothing is known (not "did not work"): those holidays are left out
    const first = done.reduce((m, r) => (r.dateKey < m ? r.dateKey : m), '9999');
    for (const h of hols.filter((x) => x.key > first)) {
      const dow = U.dow(h.key);
      const item = { key: h.key, id: h.id, name: h.name, dow, status: 'due', amount: 0, avgHours: 0, rate: 0 };
      out.push(item);
      if (settings.startDate && monthsBetween(settings.startDate, h.key) < 3) { item.status = 'seniority'; continue; }
      const winFrom = U.addDays(h.key, -91), winTo = U.addDays(h.key, -1);
      const win = done.filter((r) => r.dateKey >= winFrom && r.dateKey <= winTo);
      const days = new Map(); // date → paid hours that day
      for (const r of win) days.set(r.dateKey, (days.get(r.dateKey) || 0) + r.paidMin / 60);
      if (!days.size) { item.status = 'nowork'; continue; }
      let hours = 0; for (const v of days.values()) hours += v;
      item.avgHours = hours / days.size;
      // the role worked most in those months, and its rate on the holiday
      const byRole = new Map();
      for (const r of win) { const id = r.segments && r.segments[0] && r.segments[0].roleId; if (id) byRole.set(id, (byRole.get(id) || 0) + r.paidMin); }
      const roleId = [...byRole.entries()].sort((a, b) => b[1] - a[1])[0];
      const role = roleId && ctx.roles.get(roleId[0]);
      item.rate = role ? roleRate(role, h.key) : 0;
      item.amount = Math.round(item.avgHours * item.rate * 100) / 100;
      const sameWeekday = [...days.keys()].filter((k) => U.dow(k) === dow).length; // of 13 weeks
      const usual = sameWeekday >= 5, busy = days.size / 13 >= 4;
      if (done.some((r) => r.dateKey === h.key)) item.status = 'worked';
      else if ((dow === 5 || dow === 6) && !usual) item.status = 'weekend';
      else item.status = usual || busy ? 'due' : 'maybe';
    }
    return out;
  }

  function leaveBalances(model, asOf) {
    const S = model.ctx.settings;
    const L = S.leave;
    const start = S.startDate;
    const res = { vacationAccrued: 0, vacationUsed: 0, sickAccrued: 0, sickUsed: 0, seniorityMonths: 0, seniorityYears: 0, jobPct: 0, recuperation: null, months: [] };
    if (!start || start > asOf) return res;
    res.seniorityMonths = monthsBetween(start, asOf);
    res.seniorityYears = res.seniorityMonths / 12;
    const hoursByMonth = {};
    for (const r of model.results.values()) {
      if (r.status !== 'done' || r.dateKey < start || r.dateKey > asOf) continue;
      const mk = U.monthKey(r.dateKey);
      hoursByMonth[mk] = (hoursByMonth[mk] || 0) + r.paidHours;
    }
    const full = +L.fullTimeHours || 182;
    const openingDate = L.vacationOpeningDate || start;
    let mk = U.monthKey(start);
    const last = U.monthKey(asOf);
    const jobPcts = [];
    while (mk <= last) {
      const h = hoursByMonth[mk] || 0;
      const jp = Math.min(1, h / full);
      const monthsIn = monthsBetween(start, U.monthEnd(mk) < asOf ? U.monthEnd(mk) : asOf);
      const year = Math.floor(Math.max(0, monthsIn) / 12) + 1;
      if (U.monthEnd(mk) >= openingDate) {
        res.vacationAccrued += vacationEntitlement(year, +L.workWeek) / 12 * jp;
        res.sickAccrued += (+L.sickPerMonth || 1.5) * jp;
      }
      jobPcts.push({ mk, jp, h });
      mk = U.addMonthKey(mk, 1);
    }
    res.months = jobPcts;
    res.vacationAccrued += +L.vacationOpening || 0;
    res.sickAccrued = Math.min(90, res.sickAccrued + (+L.sickOpening || 0));
    for (const e of model.entries) {
      if (e.status === 'planned' || e.date > asOf || e.date < openingDate) continue;
      if (e.kind === 'vacation') res.vacationUsed++;
      if (e.kind === 'sick') res.sickUsed++;
    }
    const last12 = jobPcts.slice(-12);
    res.jobPct = last12.length ? last12.reduce((s, x) => s + x.jp, 0) / last12.length : 0;
    const year = Math.floor(res.seniorityMonths / 12);
    const eligible = res.seniorityMonths >= 12;
    const days = recuperationDays(Math.max(1, year));
    res.recuperation = {
      eligible, yearOfService: year, days, rate: recuperationRate(L, asOf),
      amount: eligible ? days * recuperationRate(L, asOf) * res.jobPct : 0,
      eligibleFrom: U.addMonths(start, 12),
    };
    return res;
  }

  /* ---------------- data checks ---------------- */
  /** Suspicious data: overlaps, very long, end <= start. Returns [{type, ids, text}] */
  function dataIssues(model) {
    const S = model.ctx.settings;
    const list = [...model.results.values()].filter((r) => r.status === 'done').sort((a, b) => a.start - b.start);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.warnings.length) out.push({ type: 'warn', ids: [r.id], text: r.warnings.join(', ') + ' — ' + U.fmtDate(r.dateKey) });
      const n = list[i + 1];
      if (n && n.start < r.rawEnd && n.employerId === r.employerId) out.push({ type: 'overlap', ids: [r.id, n.id], text: 'משמרות חופפות ב-' + U.fmtDate(r.dateKey) });
      if (r.start > Date.now() + U.HOUR) out.push({ type: 'future', ids: [r.id], text: 'משמרת שסומנה "בוצעה" אבל עוד לא התחילה — ' + U.fmtDate(r.dateKey) });
    }
    return out;
  }

  /* ---------------- the law: minimum wage and youth employment ----------------
   * Adult minimum wage per hour as published (monthly ÷ 182 hours). Under 18 it is a share of the
   * adult monthly wage ÷ 173 hours: 70% under 16, 75% at 16, 83% at 17 (חוק שכר מינימום).
   * New rates take effect every April; add a row here when they are published. */
  const MIN_WAGE = [
    { from: '2023-04-01', monthly: 5880.02, hourly: 32.30 },
    { from: '2025-04-01', monthly: 6247.67, hourly: 34.32 },
    { from: '2026-04-01', monthly: 6443.85, hourly: 35.40 },
  ];
  /* Other yearly legal numbers, by the year they apply to (tests/law.test.js fails once a year runs past its table:
   * check the new values and add a row). A setting left empty — or still holding a value an earlier version saved
   * as its default — follows these; any other number the user typed wins.
   *  - National Insurance: the reduced-rate threshold and the ceiling, monthly (from 2026 indexed to prices, every
   *    January 1st; 2026: btl.gov.il notice for employers);
   *  - recuperation pay: the day rate, private sector (extension order; 2026: 451.50, published 18.8.2026, for the
   *    whole 2026 recuperation year). */
  const BL_YEARS = { 2025: [7522, 50695], 2026: [7703, 51910] };
  const RECUP_YEARS = { 2023: 418, 2026: 451.5 };
  function byYear(table, k) {
    const y = +String(k || U.todayKey()).slice(0, 4);
    const years = Object.keys(table).map(Number).sort((a, b) => a - b);
    let v = table[years[0]];
    for (const x of years) if (x <= y) v = table[x];
    return v;
  }
  const lawValue = (v, known) => !(+v > 0) || known.includes(+v);
  /** National Insurance's threshold and ceiling (monthly) for a date, unless the settings name others. */
  function blLimits(T, k) {
    const [thr, ceil] = byYear(BL_YEARS, k);
    const rows = Object.values(BL_YEARS);
    return {
      thr: lawValue(T.blReducedThreshold, rows.map((r) => r[0])) ? thr : +T.blReducedThreshold,
      ceil: lawValue(T.blCeiling, rows.map((r) => r[1])) ? ceil : +T.blCeiling,
    };
  }
  /** The recuperation day rate for a date, unless the settings name another. */
  function recuperationRate(L, k) {
    return lawValue(L.recuperationRate, Object.values(RECUP_YEARS)) ? byYear(RECUP_YEARS, k) : +L.recuperationRate;
  }
  const round2 = (x) => Math.round(x * 100) / 100;
  function legalMinWage(k, birthKey) {
    const row = MIN_WAGE.filter((r) => r.from <= k).pop() || MIN_WAGE[0];
    const age = ageAt(birthKey, k);
    if (age != null && age < 18) {
      const share = age < 16 ? 0.7 : age < 17 ? 0.75 : 0.83;
      return { hourly: round2(row.monthly * share / 173), monthly: round2(row.monthly * share), age, youth: true, share, from: row.from };
    }
    return { hourly: row.hourly, monthly: row.monthly, age, youth: false, share: 1, from: row.from };
  }
  /** The minimum wage the checks use: the user's own figure if they set one, otherwise the law. */
  function minWageFor(settings, k) {
    const law = legalMinWage(k, settings.birthDate);
    const own = +settings.minWageHourly;
    return own > 0 ? Object.assign({}, law, { hourly: own, custom: true }) : law;
  }
  /** Limits of the Youth Employment Law (חוק עבודת הנוער) for a worker of `age` (under 18). */
  function youthRules(age, workWeek) {
    return {
      nightFrom: age < 16 ? 20 : 22, nightTo: age < 16 ? 8 : 6, // no work in this window (unless a permit)
      dayHours: age >= 16 && +workWeek === 5 ? 9 : 8, // 9 only for 16–17 at a five-day workplace
      weekHours: 40, eveHours: 7, breakAfterHours: 6, breakMin: 45,
    };
  }

  root.Engine = {
    LAW_BREAK, validShift, validEntry, otByLaw, otDayHours, WEEK_REG_H, legalMinWage, minWageFor, youthRules, pensionMinAge, MIN_WAGE, BL_YEARS, RECUP_YEARS, blLimits, recuperationRate,
    makeCtx, roleRate, roundMinutes, monthsBetween, buildSegments, hasOverrides, computeShift, computeAll,
    periodByKey, periodOf, dayValue, computeEntries, travelByDay, incomeTaxRaw, netEstimate, pensionActive,
    buildModel, totals, periodSummary, rangeSummary, pensionBaseOf, leaveBalances, holidayPay, vacationEntitlement, recuperationDays, ageAt, isMinor,
    dataIssues, ADJ_LABELS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
