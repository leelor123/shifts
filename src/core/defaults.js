/* ============================================================
 * defaults.js — default settings. Every value here is editable
 * in the app's settings screen. Values that come from Israeli law
 * or tax tables are marked with the year they reflect; update them
 * in settings when they change.
 * ============================================================ */
(function (root) {
  'use strict';

  const ROLE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

  function defaultEmployer(id) {
    return {
      id: id || 'emp1',
      name: 'המעסיק שלי',
      // --- pay period ---
      periodStartDay: 1, // 1 = calendar month; otherwise the period runs from this day to (day-1) of next month
      payDay: 9, // day of the following month (by law: up to the 9th)
      // --- travel ---
      travelPerDay: 16, // what most hourly workers get per day (the legal maximum is higher, ~22.6)
      travelMonthlyCap: 0, // 0 = no cap
      // --- overtime ---
      otMode: 'daily', // daily = all shifts that start on the same date share the 8h counter
      otThreshold: 8, // hours/day at 100%
      otTier1Hours: 2, // first OT hours at tier 1
      otTier1Pct: 125,
      otTier2Pct: 150,
      nightShiftShortDay: false, // law: night shift (>=2h between 22-06) -> 7h day
      nightShiftThreshold: 7,
      // --- rest days (Shabbat / holidays) ---
      restPct: 150,
      restOt1Pct: 175,
      restOt2Pct: 200,
      // --- night premium ---
      nightEnabled: false,
      nightFrom: '22:00',
      nightTo: '06:00',
      nightType: 'pct', // 'pct' of hourly rate | 'fixed' ₪ per hour
      nightValue: 0,
      // --- eve-of-Shabbat/holiday premium ---
      evePct: 0,
      // --- seniority ---
      seniorityEnabled: false,
      seniorityType: 'pctPerYear', // 'pctPerYear' | 'fixedPerHour'
      seniorityValue: 0,
      seniorityCapPct: 0, // 0 = no cap
      seniorityAfterMonths: 12,
      // --- rounding ---
      roundingMode: 'none', // 'none' | 'nearest' | 'up' | 'down'
      roundingUnit: 15, // minutes
      // --- minimum per shift ---
      minShiftHours: 0, // 0 = disabled
      // --- breaks ---
      defaultBreakMin: 0,
      defaultBreakPaid: true,
    };
  }

  function defaultRoles(empId) {
    const today = new Date();
    const from = '2000-01-01';
    return [
      { id: 'r_sadran', name: 'סדרן', color: ROLE_COLORS[0], employerId: empId || 'emp1', rates: [{ from, rate: 40 }], archived: false },
      { id: 'r_miznon', name: 'מזנון', color: ROLE_COLORS[1], employerId: empId || 'emp1', rates: [{ from, rate: 38 }], archived: false },
      { id: 'r_achmash', name: 'אחמ״ש', color: ROLE_COLORS[2], employerId: empId || 'emp1', rates: [{ from, rate: 48 }], archived: false },
    ];
  }

  function defaultSettings() {
    return {
      // --- personal / employment ---
      startDate: null, // employment start (YYYY-MM-DD)
      birthDate: null, // optional: birthday greeting; under 18 = no tax / social security / pension
      userName: '', // optional: signature for messages to the employer
      // --- Shabbat & holidays window ---
      rest: {
        mode: 'city',
        city: 'תל אביב-יפו',
        lat: 32.08, lon: 34.78, candleMin: null,
        exitMode: 'tzeit', tzeitDeg: 8.5, exitMinutes: 40,
        startOffsetMin: 0, endOffsetMin: 0,
        fixedStart: '16:00', fixedEnd: '20:00',
        shabbat: true,
        holidays: { rh1: true, rh2: true, yk: true, sukkot: true, shmini: true, pesach1: true, pesach7: true, shavuot: true, atzmaut: true },
        eveFriday: false, eveHoliday: false, eveFrom: '14:00',
      },
      // --- net estimate (2025-2026 values; brackets frozen through 2027) ---
      tax: {
        creditPoints: 2.25,
        creditPointValue: 242,
        brackets: [ // monthly
          [7010, 10], [10060, 14], [16150, 20], [22440, 31], [46690, 35], [60130, 47], [Infinity, 50],
        ],
        blReducedThreshold: 7522, // 60% of average wage
        blReducedPct: 1.04, healthReducedPct: 3.23,
        blFullPct: 7, healthFullPct: 5.17,
        blCeiling: 50695,
        pensionCreditPct: 35, pensionCreditCap: 9700,
      },
      pension: {
        enabled: true,
        employeePct: 6, employerPct: 6.5, severancePct: 6,
        startAfterMonths: 6,
        base: 'base', // 'base' = hours × rate (no OT/rest premiums) | 'all' = all wages except travel
      },
      hishtalmut: { enabled: false, employeePct: 2.5, employerPct: 7.5, startAfterMonths: 0 },
      // --- leave ---
      leave: {
        workWeek: 5, // 5 or 6 — affects the statutory vacation table
        vacationOpening: 0, sickOpening: 0,
        vacationOpeningDate: null,
        fullTimeHours: 182, // monthly hours treated as 100% job
        dayValueMode: 'auto', // 'auto' | 'hours' | 'fixed'
        dayHours: 8, dayFixed: 0,
        sickPct: [0, 50, 50, 100], // day1, day2, day3, day4+
        sickPerMonth: 1.5,
        recuperationRate: 418, // ₪ per day, private sector
        recuperationMonth: 7, // month the employer pays (0 = paid monthly)
      },
      minWageHourly: null, // null = by law, from the date and age (Engine.legalMinWage); a number overrides it
      shareStats: true, // anonymous usage statistics (stats.js); off deletes this device's record
      gender: '', // '' | 'm' | 'f': only for the mandatory-pension age
      // --- goals ---
      goal: { amount: 0, type: 'gross' },
      saving: { name: '', price: 0, from: '' }, // something to save up for: what, how much, counting the net earned since when
      // --- calendar ---
      weekStart: 0,
      // --- notifications / insights ---
      alerts: {
        minWeeksData: 4,
        deviationPct: 20,
        compareWeeks: 4, compareMonths: 3,
        types: {
          hours: true, shifts: true, roles: true, rest: true, overtime: true, hourly: true, shiftLength: true, pattern: true,
          long: true, rest8: true, streak: true, weekHours: true,
          projection: true, goal: true, record: true, goalShifts: true, payslipGap: true, travel: true,
          timer: true, plannedPast: true, idle: true, suspicious: true, payslipDue: true, backup: true, upcoming: true, weekly: true,
          recuperation: true, birthday: true, minwage: true, youth: true,
        },
        longShiftHours: 12, minRestHours: 8, streakDays: 6, weekHoursMax: 50,
        timerHours: 12, idleDays: 7, suspiciousHours: 20, backupDays: 30, upcomingMin: 60,
        weeklyDay: 6, weeklyHour: 21,
        push: true,
      },
      // --- appearance ---
      theme: 'system', accent: 'candy', fontScale: 1, font: 'rubik', skin: '', plusKey: '',
      withTravel: true, // the amount next to a shift includes its travel pay (a switch over the shift lists)
      lb: { on: false, n: '', e: '', bg: '' }, // the games' champions table: joined, nickname, emoji, background (Plus)
      fx: { effects: true, sound: true, haptic: true, music: true }, // tap pulse / confetti, click sounds, vibration, music in the games
      // --- security ---
      lock: { enabled: false, hash: null, salt: null, timeoutMin: 1 },
      // --- AI ---
      ai: { apiKey: '', model: 'claude-opus-5-5' },
      // --- backup ---
      backup: { autoEvery: 'weekly', lastBackup: null, lastAuto: null },
      onboarded: false,
      demo: false,
    };
  }

  root.Defaults = { ROLE_COLORS, defaultEmployer, defaultRoles, defaultSettings };
})(typeof window !== 'undefined' ? window : globalThis);
