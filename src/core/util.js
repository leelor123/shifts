/* ============================================================
 * util.js — date/time helpers and formatting.
 * All times are stored as epoch milliseconds; "date keys" are
 * local calendar dates in the form YYYY-MM-DD (device timezone,
 * expected to be Asia/Jerusalem). Using real epochs means a shift
 * that crosses a DST change is measured by the time actually worked.
 * ============================================================ */
(function (root) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const MIN = 60000;
  const HOUR = 3600000;
  const DAY = 86400000;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  /** Date object -> 'YYYY-MM-DD' (local). */
  function dateKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseKey(k) {
    const [y, m, d] = k.split('-').map(Number);
    return { y, m, d };
  }
  /** Local midnight of a date key, as Date. */
  function keyToDate(k) {
    const { y, m, d } = parseKey(k);
    return new Date(y, m - 1, d);
  }
  /** Add n days to a date key (uses noon to stay clear of DST edges). */
  function addDays(k, n) {
    const { y, m, d } = parseKey(k);
    return dateKey(new Date(y, m - 1, d + n, 12));
  }
  function addMonths(k, n) {
    const { y, m, d } = parseKey(k);
    const last = new Date(y, m - 1 + n + 1, 0).getDate();
    return dateKey(new Date(y, m - 1 + n, Math.min(d, last), 12));
  }
  /** Day of week 0=Sunday … 6=Saturday */
  function dow(k) {
    return keyToDate(k).getDay();
  }
  /** Whole days from a to b (b - a). */
  function diffDays(a, b) {
    const A = parseKey(a), B = parseKey(b);
    return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / DAY);
  }
  /** Local wall-clock -> epoch. hm is 'HH:MM'. For the repeated hour when
   *  clocks go back, JS picks the earlier instant. */
  function toEpoch(k, hm) {
    const { y, m, d } = parseKey(k);
    const [h, mi] = (hm || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, h, mi || 0, 0, 0).getTime();
  }
  function dayStart(k) {
    return toEpoch(k, '00:00');
  }
  function epochKey(ms) {
    return dateKey(new Date(ms));
  }
  function epochHM(ms) {
    const d = new Date(ms);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function todayKey() {
    return dateKey(new Date());
  }
  function monthKey(k) {
    return k.slice(0, 7);
  }
  function monthStart(mk) {
    return mk + '-01';
  }
  function monthEnd(mk) {
    const [y, m] = mk.split('-').map(Number);
    return mk + '-' + pad(new Date(y, m, 0).getDate());
  }
  function addMonthKey(mk, n) {
    const [y, m] = mk.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }
  /** Start (Sunday by default) of the week containing k. */
  function weekStart(k, startDow) {
    const s = startDow || 0;
    const back = (dow(k) - s + 7) % 7;
    return addDays(k, -back);
  }
  function rangeKeys(from, to) {
    const out = [];
    for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
    return out;
  }
  function inRange(k, from, to) {
    return k >= from && k <= to;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);

  /* ---------------- formatting ---------------- */
  // The app's language: each language has its own bundle (tools/i18n.js), whose <html lang> says which.
  const LANG = (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang) || 'he';
  const RTL = LANG === 'he' || LANG === 'ar';
  // dates in the language; numbers always with a comma between thousands and a point before the agorot (what
  // the payslip shows, and what the counting animations read)
  const LOCALE = { he: 'he-IL', ar: 'ar-IL-u-nu-latn', ru: 'ru-RU', en: 'en-IL', fr: 'fr-FR', es: 'es-ES' }[LANG] || 'he-IL';
  const NUM_LOCALE = { he: 'he-IL', ar: 'ar-IL-u-nu-latn', en: 'en-IL' }[LANG] || 'en-US';
  const names = (opts, n, at) => [...Array(n)].map((_, i) => new Intl.DateTimeFormat(LOCALE, opts).format(at(i)));
  // i18n-keep-start
  const MONTHS = LANG === 'he' ? ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'] : names({ month: 'long' }, 12, (i) => new Date(2026, i, 15, 12));
  const DAYS = LANG === 'he' ? ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] : names({ weekday: 'long' }, 7, (i) => new Date(2026, 0, 4 + i, 12));
  const DAYS_SHORT = LANG === 'he' ? ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] : names({ weekday: 'short' }, 7, (i) => new Date(2026, 0, 4 + i, 12));
  // for a chart's axis: three letters in Hebrew (ינו׳), the language's own short name otherwise
  const MONTHS_SHORT = LANG === 'he' ? MONTHS.map((m) => m.slice(0, 3)) : names({ month: 'short' }, 12, (i) => new Date(2026, i, 15, 12));
  // i18n-keep-end

  let moneyFmt, moneyFmt0;
  function money(n, decimals) {
    if (n == null || isNaN(n)) n = 0;
    if (!moneyFmt) {
      const make = (d) => {
        if (LANG === 'ru' || LANG === 'fr' || LANG === 'es') { const f = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); return { format: (v) => f.format(v) + ' ₪' }; }
        return new Intl.NumberFormat(NUM_LOCALE, { style: 'currency', currency: 'ILS', minimumFractionDigits: d, maximumFractionDigits: d });
      };
      moneyFmt = make(2);
      moneyFmt0 = make(0);
    }
    return (decimals === 0 ? moneyFmt0 : moneyFmt).format(n);
  }
  function num(n, d) {
    if (n == null || isNaN(n)) n = 0;
    const dd = d == null ? 2 : d;
    return new Intl.NumberFormat(NUM_LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: dd }).format(n);
  }
  /** The form of a count's noun in the language: forms by plural category (one, two, few, many, other; Intl.PluralRules),
   *  for a number or a number written as text ("8.5", "1,234"). */
  let pluralRules;
  function plural(n, forms) {
    const v = typeof n === 'number' ? n : parseFloat(String(n).replace(/[^\d.-]/g, '')) || 0;
    if (!pluralRules) pluralRules = new Intl.PluralRules(LOCALE);
    const c = pluralRules.select(Math.abs(v));
    return forms[c] != null ? forms[c] : forms.other != null ? forms.other : forms.many != null ? forms.many : Object.values(forms)[0];
  }
  /** An error whose message is for the person (shown as is), unlike the browser's own. */
  function oops(message, extra) {
    return Object.assign(new Error(message), { ours: true }, extra);
  }
  /** Whether an error's message is one of ours, to show as is. */
  function ours(e) {
    return !!(e && e.message && (e.ours || /[֐-׿]/.test(e.message)));
  }
  /** Hours as decimal with 2 digits, e.g. 7.5 -> "7.50" */
  function hours(h) {
    return (Math.round(h * 100) / 100).toFixed(2);
  }
  /** Minutes -> "H:MM" */
  function hm(minutes) {
    const m = Math.round(minutes);
    const sign = m < 0 ? '-' : '';
    const a = Math.abs(m);
    return sign + Math.floor(a / 60) + ':' + pad(a % 60);
  }
  const dateFmts = {};
  const intl = (k, opts) => (dateFmts[JSON.stringify(opts)] || (dateFmts[JSON.stringify(opts)] = new Intl.DateTimeFormat(LOCALE, opts))).format(new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10) || 1, 12));
  /** A date key as text: 'short' 5/1, 'long' with the day of the week, 'dmy' the same without the word "day",
   *  'dm' 5 in January, otherwise 05/01/2026. */
  function fmtDate(k, opts) {
    const { y, m, d } = parseKey(k);
    if (opts === 'short') return d + '/' + m;
    if (LANG !== 'he') {
      if (opts === 'long' || opts === 'dmy') return intl(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      if (opts === 'dm') return intl(k, { day: 'numeric', month: 'long' });
      return pad(d) + '/' + pad(m) + '/' + y;
    }
    // i18n-keep-start
    if (opts === 'long') return 'יום ' + DAYS[dow(k)] + ', ' + d + ' ב' + MONTHS[m - 1] + ' ' + y;
    if (opts === 'dmy') return DAYS[dow(k)] + ', ' + d + ' ב' + MONTHS[m - 1] + ' ' + y;
    if (opts === 'dm') return d + ' ב' + MONTHS[m - 1];
    // i18n-keep-end
    return pad(d) + '/' + pad(m) + '/' + y;
  }
  /** A month key as "January 2026". */
  function fmtMonth(mk) {
    if (LANG !== 'he') return intl(mk + '-01', { month: 'long', year: 'numeric' });
    const [y, m] = mk.split('-').map(Number);
    return MONTHS[m - 1] + ' ' + y;
  }
  function pct(n, d) {
    return num(n, d == null ? 0 : d) + '%';
  }

  root.U = {
    pad, MIN, HOUR, DAY, uid, dateKey, parseKey, keyToDate, addDays, addMonths, dow, diffDays,
    toEpoch, dayStart, epochKey, epochHM, todayKey, monthKey, monthStart, monthEnd, addMonthKey,
    weekStart, rangeKeys, inRange, clamp, round2, sum, money, num, hours, hm, fmtDate, fmtMonth, pct, oops, ours, plural,
    LANG, RTL, LOCALE, MONTHS, MONTHS_SHORT, DAYS, DAYS_SHORT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
