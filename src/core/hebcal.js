/* ============================================================
 * hebcal.js — local (offline) Hebrew calendar, Israeli holidays,
 * sunset / nightfall, and Shabbat & holiday "rest windows".
 *
 * Hebrew calendar arithmetic follows Reingold & Dershowitz,
 * "Calendrical Calculations". Sun times use the NOAA solar
 * position equations (accuracy ~1 minute), which is what
 * hebcal / most Israeli calendars use.
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;

  /* ---------------- Hebrew calendar ---------------- */
  const NISAN = 1, IYYAR = 2, SIVAN = 3, TAMMUZ = 4, AV = 5, ELUL = 6, TISHREI = 7,
    MARHESHVAN = 8, KISLEV = 9, TEVET = 10, SHEVAT = 11, ADAR = 12, ADARII = 13;
  const HEBREW_EPOCH = -1373427; // R.D. of 1 Tishrei AM 1
  const RD_UNIX_EPOCH = 719163; // R.D. of 1970-01-01

  const quot = (a, b) => Math.floor(a / b);
  const mod = (a, b) => a - b * Math.floor(a / b);

  function isLeap(y) { return mod(7 * y + 1, 19) < 7; }
  function lastMonth(y) { return isLeap(y) ? ADARII : ADAR; }
  const elapsedCache = new Map();
  function elapsedDays(y) {
    if (elapsedCache.has(y)) return elapsedCache.get(y);
    const monthsElapsed = quot(235 * y - 234, 19);
    const partsElapsed = 12084 + 13753 * monthsElapsed;
    const days = 29 * monthsElapsed + quot(partsElapsed, 25920);
    const r = mod(3 * (days + 1), 7) < 3 ? days + 1 : days;
    elapsedCache.set(y, r);
    return r;
  }
  function yearLengthCorrection(y) {
    const ny0 = elapsedDays(y - 1), ny1 = elapsedDays(y), ny2 = elapsedDays(y + 1);
    if (ny2 - ny1 === 356) return 2;
    if (ny1 - ny0 === 382) return 1;
    return 0;
  }
  function newYear(y) { return HEBREW_EPOCH + elapsedDays(y) + yearLengthCorrection(y); }
  function daysInYear(y) { return newYear(y + 1) - newYear(y); }
  function longHeshvan(y) { const d = daysInYear(y); return d === 355 || d === 385; }
  function shortKislev(y) { const d = daysInYear(y); return d === 353 || d === 383; }
  function lastDayOfMonth(m, y) {
    if ([IYYAR, TAMMUZ, ELUL, TEVET, ADARII].includes(m)) return 29;
    if (m === ADAR && !isLeap(y)) return 29;
    if (m === MARHESHVAN && !longHeshvan(y)) return 29;
    if (m === KISLEV && shortKislev(y)) return 29;
    return 30;
  }
  function fixedFromHebrew(y, m, d) {
    let r = newYear(y) + d - 1;
    if (m < TISHREI) {
      for (let mm = TISHREI; mm <= lastMonth(y); mm++) r += lastDayOfMonth(mm, y);
      for (let mm = NISAN; mm < m; mm++) r += lastDayOfMonth(mm, y);
    } else {
      for (let mm = TISHREI; mm < m; mm++) r += lastDayOfMonth(mm, y);
    }
    return r;
  }
  function hebrewFromFixed(rd) {
    const approx = quot(rd - HEBREW_EPOCH, 35975351 / 98496) + 1;
    let y = approx - 1;
    while (newYear(y + 1) <= rd) y++;
    const start = rd < fixedFromHebrew(y, NISAN, 1) ? TISHREI : NISAN;
    let m = start;
    while (rd > fixedFromHebrew(y, m, lastDayOfMonth(m, y))) m++;
    const d = rd - fixedFromHebrew(y, m, 1) + 1;
    return { y, m, d };
  }
  function keyToRd(k) {
    const { y, m, d } = U.parseKey(k);
    return Date.UTC(y, m - 1, d) / U.DAY + RD_UNIX_EPOCH;
  }
  function rdToKey(rd) {
    const dt = new Date((rd - RD_UNIX_EPOCH) * U.DAY);
    return dt.getUTCFullYear() + '-' + U.pad(dt.getUTCMonth() + 1) + '-' + U.pad(dt.getUTCDate());
  }
  function hebToKey(y, m, d) { return rdToKey(fixedFromHebrew(y, m, d)); }

  /* ---------------- Hebrew numerals ---------------- */
  const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
  const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  function gematria(n) {
    let s = '';
    n = n % 1000;
    while (n >= 400) { s += 'ת'; n -= 400; }
    if (n >= 300) { s += 'ש'; n -= 300; }
    if (n >= 200) { s += 'ר'; n -= 200; }
    if (n >= 100) { s += 'ק'; n -= 100; }
    if (n === 15) s += 'טו';
    else if (n === 16) s += 'טז';
    else { s += TENS[Math.floor(n / 10)]; s += ONES[n % 10]; }
    if (s.length === 1) return s + '׳';
    return s.slice(0, -1) + '״' + s.slice(-1);
  }
  function monthName(m, y) {
    const names = ['', 'ניסן', 'אייר', 'סיוון', 'תמוז', 'אב', 'אלול', 'תשרי', 'חשוון', 'כסלו', 'טבת', 'שבט', 'אדר', 'אדר ב׳'];
    if (m === ADAR && isLeap(y)) return 'אדר א׳';
    return names[m];
  }
  /** Hebrew date for a Gregorian date key. */
  function hebrewDate(k) {
    const h = hebrewFromFixed(keyToRd(k));
    return Object.assign(h, {
      dayStr: gematria(h.d),
      monthStr: monthName(h.m, h.y),
      yearStr: gematria(h.y),
      toString() { return gematria(h.d) + ' ' + monthName(h.m, h.y) + ' ' + gematria(h.y); },
    });
  }

  /* ---------------- Israeli holidays ---------------- */
  // Rest days (ימי מנוחה) — each one can be toggled in settings.
  const HOLIDAY_DEFS = [
    { id: 'rh1', name: 'ראש השנה א׳' },
    { id: 'rh2', name: 'ראש השנה ב׳' },
    { id: 'yk', name: 'יום כיפור' },
    { id: 'sukkot', name: 'סוכות' },
    { id: 'shmini', name: 'שמיני עצרת / שמחת תורה' },
    { id: 'pesach1', name: 'פסח' },
    { id: 'pesach7', name: 'שביעי של פסח' },
    { id: 'shavuot', name: 'שבועות' },
    { id: 'atzmaut', name: 'יום העצמאות' },
  ];
  const holidayCache = new Map();
  /** All holiday-like days that fall in Gregorian year gy.
   *  Returns [{key, id, name, rest:boolean}] */
  function holidaysForYear(gy) {
    if (holidayCache.has(gy)) return holidayCache.get(gy);
    const out = [];
    const spring = gy + 3760; // Nisan..Elul of this Hebrew year are in gy
    const autumn = gy + 3761; // Tishrei of next Hebrew year starts in gy
    const add = (key, id, name, rest) => { if (key.startsWith(String(gy))) out.push({ key, id, name, rest }); };

    for (const hy of [spring, autumn]) {
      add(hebToKey(hy, TISHREI, 1), 'rh1', 'ראש השנה א׳', true);
      add(hebToKey(hy, TISHREI, 2), 'rh2', 'ראש השנה ב׳', true);
      add(hebToKey(hy, TISHREI, 10), 'yk', 'יום כיפור', true);
      add(hebToKey(hy, TISHREI, 15), 'sukkot', 'סוכות', true);
      for (let d = 16; d <= 20; d++) add(hebToKey(hy, TISHREI, d), 'cholsukkot', 'חול המועד סוכות', false);
      add(hebToKey(hy, TISHREI, 21), 'hoshana', 'הושענא רבה', false);
      add(hebToKey(hy, TISHREI, 22), 'shmini', 'שמיני עצרת / שמחת תורה', true);
      add(hebToKey(hy, KISLEV, 25), 'hanukkah', 'חנוכה (נר ראשון בערב הקודם)', false);
      const purimMonth = isLeap(hy) ? ADARII : ADAR;
      add(hebToKey(hy, purimMonth, 14), 'purim', 'פורים', false);
      add(hebToKey(hy, NISAN, 15), 'pesach1', 'פסח', true);
      for (let d = 16; d <= 20; d++) add(hebToKey(hy, NISAN, d), 'cholpesach', 'חול המועד פסח', false);
      add(hebToKey(hy, NISAN, 21), 'pesach7', 'שביעי של פסח', true);
      // Yom HaAtzmaut: 5 Iyyar, moved to avoid Shabbat desecration
      let atzRd = fixedFromHebrew(hy, IYYAR, 5);
      const wd = mod(atzRd, 7); // R.D. 1 = Monday → mod 7: 0=Sunday
      if (wd === 5) atzRd -= 1; // Friday -> Thursday
      else if (wd === 6) atzRd -= 2; // Saturday -> Thursday
      else if (wd === 1) atzRd += 1; // Monday -> Tuesday
      add(rdToKey(atzRd - 1), 'zikaron', 'יום הזיכרון', false);
      add(rdToKey(atzRd), 'atzmaut', 'יום העצמאות', true);
      add(hebToKey(hy, IYYAR, 18), 'lagbaomer', 'ל״ג בעומר', false);
      add(hebToKey(hy, SIVAN, 6), 'shavuot', 'שבועות', true);
      let avRd = fixedFromHebrew(hy, AV, 9);
      if (mod(avRd, 7) === 6) avRd += 1; // deferred fast
      add(rdToKey(avRd), 'tishabav', 'תשעה באב', false);
    }
    const seen = new Set();
    const res = out.filter((h) => { const id = h.key + h.id; if (seen.has(id)) return false; seen.add(id); return true; })
      .sort((a, b) => a.key.localeCompare(b.key));
    holidayCache.set(gy, res);
    return res;
  }
  /** Holidays on a given date key. */
  function holidaysOn(k) {
    const gy = +k.slice(0, 4);
    return holidaysForYear(gy).filter((h) => h.key === k);
  }

  /* ---------------- Sun (NOAA) ---------------- */
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  function solarParams(jd) {
    const T = (jd - 2451545) / 36525;
    const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
    const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
    const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
      Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
    const trueLong = L0 + C;
    const omega = 125.04 - 1934.136 * T;
    const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
    const meanObliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
    const obliq = meanObliq + 0.00256 * Math.cos(rad(omega));
    const decl = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong))));
    const y = Math.tan(rad(obliq / 2)) ** 2;
    const eqTime = 4 * deg(y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) +
      4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) - 0.5 * y * y * Math.sin(4 * rad(L0)) -
      1.25 * e * e * Math.sin(2 * rad(M)));
    return { decl, eqTime };
  }
  /** Epoch ms of the sun crossing `zenith` degrees on date key k at (lat,lon).
   *  rising=false -> evening event. */
  function sunEvent(k, lat, lon, zenith, rising) {
    const { y, m, d } = U.parseKey(k);
    const day0 = Date.UTC(y, m - 1, d);
    const jd0 = day0 / U.DAY + 2440587.5;
    let t = 720 - 4 * lon; // minutes UTC, first guess = solar noon
    for (let i = 0; i < 3; i++) {
      const { decl, eqTime } = solarParams(jd0 + t / 1440);
      const cosHA = Math.cos(rad(zenith)) / (Math.cos(rad(lat)) * Math.cos(rad(decl))) - Math.tan(rad(lat)) * Math.tan(rad(decl));
      if (cosHA < -1 || cosHA > 1) return null;
      const ha = deg(Math.acos(cosHA));
      t = 720 - 4 * lon - eqTime + (rising ? -4 * ha : 4 * ha);
    }
    return day0 + Math.round(t * 60) * 1000;
  }
  function sunset(k, lat, lon) { return sunEvent(k, lat, lon, 90.833, false); }
  function sunrise(k, lat, lon) { return sunEvent(k, lat, lon, 90.833, true); }
  function tzeit(k, lat, lon, degBelow) { return sunEvent(k, lat, lon, 90 + (degBelow || 8.5), false); }

  /* ---------------- cities ---------------- */
  // [name, lat, lon, candle-lighting minutes before sunset]
  const CITIES = [
    ['ירושלים', 31.7690, 35.2163, 40], ['תל אביב-יפו', 32.0809, 34.7806, 18], ['חיפה', 32.7940, 34.9896, 30],
    ['באר שבע', 31.2518, 34.7913, 18], ['אילת', 29.5581, 34.9482, 18], ['נתניה', 32.3215, 34.8532, 18],
    ['ראשון לציון', 31.9730, 34.7925, 18], ['פתח תקווה', 32.0840, 34.8878, 18], ['אשדוד', 31.8014, 34.6435, 18],
    ['חולון', 32.0158, 34.7874, 18], ['בני ברק', 32.0807, 34.8338, 18], ['רמת גן', 32.0684, 34.8248, 18],
    ['גבעתיים', 32.0722, 34.8125, 18], ['בת ים', 32.0171, 34.7454, 18], ['הרצליה', 32.1663, 34.8436, 18],
    ['כפר סבא', 32.1750, 34.9069, 18], ['רעננה', 32.1848, 34.8713, 18], ['הוד השרון', 32.1500, 34.8883, 18],
    ['רחובות', 31.8928, 34.8113, 18], ['נס ציונה', 31.9293, 34.7987, 18], ['יבנה', 31.8781, 34.7397, 18],
    ['רמלה', 31.9279, 34.8625, 18], ['לוד', 31.9510, 34.8881, 18], ['מודיעין', 31.8980, 35.0104, 18],
    ['בית שמש', 31.7470, 34.9881, 18], ['מעלה אדומים', 31.7770, 35.2980, 18], ['אריאל', 32.1046, 35.1745, 18],
    ['אשקלון', 31.6688, 34.5743, 18], ['קריית גת', 31.6100, 34.7642, 18], ['שדרות', 31.5250, 34.5969, 18],
    ['אופקים', 31.3140, 34.6200, 18], ['דימונה', 31.0700, 35.0300, 18], ['ערד', 31.2589, 35.2128, 18],
    ['חדרה', 32.4340, 34.9196, 18], ['זכרון יעקב', 32.5707, 34.9524, 30], ['קריית אתא', 32.8090, 35.1060, 18],
    ['קריית מוצקין', 32.8370, 35.0770, 18], ['עכו', 32.9281, 35.0820, 18], ['נהריה', 33.0089, 35.0981, 18],
    ['כרמיאל', 32.9190, 35.2901, 18], ['יקנעם', 32.6590, 35.1090, 18], ['עפולה', 32.6078, 35.2897, 18],
    ['נצרת', 32.6996, 35.3035, 18], ['מגדל העמק', 32.6760, 35.2400, 18], ['טבריה', 32.7922, 35.5312, 18],
    ['צפת', 32.9646, 35.4960, 18], ['קריית שמונה', 33.2073, 35.5697, 18],
  ].map(([name, lat, lon, candle]) => ({ name, lat, lon, candle }));
  // the 44 cities above keep their exact place; any other locality comes from the full list (places.js),
  // where those 44 have the same coordinates under their CBS spelling
  function findCity(name) {
    const old = CITIES.find((c) => c.name === name);
    if (old) return old;
    const p = root.Places && root.Places.find(name);
    return p ? { name: p.name, lat: p.lat, lon: p.lon, candle: p.candle } : CITIES[1];
  }

  /* ---------------- rest windows ---------------- */
  /**
   * cfg = {
   *   mode: 'city' | 'fixed',
   *   city, lat, lon, candleMin,           // city mode
   *   exitMode: 'tzeit' | 'minutes', tzeitDeg, exitMinutes,
   *   startOffsetMin, endOffsetMin,        // fine-tuning (+ = later)
   *   fixedStart: 'HH:MM' (on the eve), fixedEnd: 'HH:MM' (on the rest day),
   *   shabbat: true, holidays: {rh1:true,...},
   *   dayRules: [{date, type:'cancel'|'force', reason}],
   *   eveFriday, eveHoliday, eveFrom: 'HH:MM'
   * }
   */
  function locationOf(cfg) {
    if (cfg.city === '__custom') return { lat: +cfg.lat || 32.08, lon: +cfg.lon || 34.78, candle: cfg.candleMin != null ? +cfg.candleMin : 18 };
    const c = findCity(cfg.city);
    return { lat: c.lat, lon: c.lon, candle: cfg.candleMin != null && cfg.candleMin !== '' ? +cfg.candleMin : c.candle };
  }
  function entryTime(eveKey, cfg) {
    if (cfg.mode === 'fixed') return U.toEpoch(eveKey, cfg.fixedStart || '16:00');
    const loc = locationOf(cfg);
    const ss = sunset(eveKey, loc.lat, loc.lon);
    return Math.floor((ss - loc.candle * U.MIN) / U.MIN) * U.MIN + (+cfg.startOffsetMin || 0) * U.MIN;
  }
  function exitTime(k, cfg) {
    if (cfg.mode === 'fixed') return U.toEpoch(k, cfg.fixedEnd || '20:00');
    const loc = locationOf(cfg);
    let t;
    if (cfg.exitMode === 'minutes') t = sunset(k, loc.lat, loc.lon) + (+cfg.exitMinutes || 40) * U.MIN;
    else t = tzeit(k, loc.lat, loc.lon, +cfg.tzeitDeg || 8.5);
    return Math.ceil(t / U.MIN) * U.MIN + (+cfg.endOffsetMin || 0) * U.MIN;
  }
  /** Is k a rest day, considering settings and manual day rules?
   *  Returns null or {key, name, source, autoRest, rule} */
  function restDayInfo(k, cfg, ignoreRules) {
    const rule = !ignoreRules && (cfg.dayRules || []).find((r) => r.date === k);
    let name = null, source = null;
    if (cfg.shabbat !== false && U.dow(k) === 6) { name = 'שבת'; source = 'shabbat'; }
    const hol = holidaysOn(k).find((h) => h.rest && (!cfg.holidays || cfg.holidays[h.id] !== false));
    if (hol) { name = name ? name + ' · ' + hol.name : hol.name; source = source ? 'both' : 'holiday'; }
    const autoRest = !!name;
    if (rule && rule.type === 'cancel') return null;
    if (rule && rule.type === 'force') return { key: k, name: name || 'יום מנוחה (סימון ידני)', source: source || 'manual', autoRest, rule };
    return name ? { key: k, name, source, autoRest, rule: null } : null;
  }
  const windowCache = new Map();
  function cfgSig(cfg, ignoreRules) {
    return JSON.stringify([cfg.mode, cfg.city, cfg.lat, cfg.lon, cfg.candleMin, cfg.exitMode, cfg.tzeitDeg, cfg.exitMinutes,
      cfg.startOffsetMin, cfg.endOffsetMin, cfg.fixedStart, cfg.fixedEnd, cfg.shabbat, cfg.holidays,
      ignoreRules ? null : cfg.dayRules, cfg.eveFriday, cfg.eveHoliday, cfg.eveFrom]);
  }
  /** Merged rest windows overlapping [fromKey, toKey]:
   *  [{start, end, days:[restDayInfo], eveKey, eveStart (premium window start or null)}] */
  // per day: is it a rest day, and when does it start and end (shared by neighbouring shifts)
  const dayCache = new Map();
  function dayWindow(k, cfg, ignoreRules, base) {
    const key = base + k;
    let v = dayCache.get(key);
    if (v === undefined) {
      const info = restDayInfo(k, cfg, ignoreRules);
      v = info ? { info, start: entryTime(U.addDays(k, -1), cfg), end: exitTime(k, cfg) } : null;
      if (dayCache.size > 50000) dayCache.clear();
      dayCache.set(key, v);
    }
    return v;
  }
  function restWindows(fromKey, toKey, cfg, ignoreRules) {
    const base = cfgSig(cfg, ignoreRules);
    const sig = base + fromKey + toKey;
    if (windowCache.has(sig)) return windowCache.get(sig);
    const wins = [];
    for (let k = U.addDays(fromKey, -3); k <= U.addDays(toKey, 3); k = U.addDays(k, 1)) {
      const dw = dayWindow(k, cfg, ignoreRules, base);
      if (!dw) continue;
      const w = { start: dw.start, end: dw.end, days: [dw.info] };
      const prev = wins[wins.length - 1];
      if (prev && w.start <= prev.end + U.MIN) {
        prev.end = Math.max(prev.end, w.end);
        prev.days.push(dw.info);
      } else wins.push(w);
    }
    for (const w of wins) {
      w.eveKey = U.addDays(w.days[0].key, -1);
      const isFriday = U.dow(w.eveKey) === 5;
      const wantEve = isFriday ? cfg.eveFriday : cfg.eveHoliday;
      const evs = U.toEpoch(w.eveKey, cfg.eveFrom || '14:00');
      w.eveStart = wantEve && evs < w.start ? evs : null;
      w.label = w.days.map((d) => d.name).join(', ');
    }
    // one entry per shift range: big enough for years of shifts, so a recalculation after an edit reuses them
    if (windowCache.size > 20000) windowCache.clear();
    windowCache.set(sig, wins);
    return wins;
  }
  function clearCache() { windowCache.clear(); dayCache.clear(); }

  root.HebCal = {
    isLeap, fixedFromHebrew, hebrewFromFixed, keyToRd, rdToKey, hebToKey, gematria, hebrewDate,
    holidaysForYear, holidaysOn, HOLIDAY_DEFS, sunset, sunrise, tzeit, CITIES, findCity, locationOf,
    entryTime, exitTime, restDayInfo, restWindows, clearCache,
    MONTHS: { NISAN, IYYAR, SIVAN, TAMMUZ, AV, ELUL, TISHREI, MARHESHVAN, KISLEV, TEVET, SHEVAT, ADAR, ADARII },
  };
})(typeof window !== 'undefined' ? window : globalThis);
