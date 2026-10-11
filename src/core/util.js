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

  /* ---------------- formatting (Hebrew) ---------------- */
  const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const HEB_DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  let moneyFmt, moneyFmt0, numFmt;
  function money(n, decimals) {
    if (n == null || isNaN(n)) n = 0;
    if (!moneyFmt) {
      moneyFmt = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
      moneyFmt0 = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return (decimals === 0 ? moneyFmt0 : moneyFmt).format(n);
  }
  function num(n, d) {
    if (n == null || isNaN(n)) n = 0;
    const dd = d == null ? 2 : d;
    return new Intl.NumberFormat('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: dd }).format(n);
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
  function fmtDate(k, opts) {
    const { y, m, d } = parseKey(k);
    if (opts === 'short') return d + '/' + m;
    if (opts === 'long') return 'יום ' + HEB_DAYS[dow(k)] + ', ' + d + ' ב' + HEB_MONTHS[m - 1] + ' ' + y;
    if (opts === 'dm') return d + ' ב' + HEB_MONTHS[m - 1];
    return pad(d) + '/' + pad(m) + '/' + y;
  }
  function fmtMonth(mk) {
    const [y, m] = mk.split('-').map(Number);
    return HEB_MONTHS[m - 1] + ' ' + y;
  }
  function pct(n, d) {
    return num(n, d == null ? 0 : d) + '%';
  }

  root.U = {
    pad, MIN, HOUR, DAY, uid, dateKey, parseKey, keyToDate, addDays, addMonths, dow, diffDays,
    toEpoch, dayStart, epochKey, epochHM, todayKey, monthKey, monthStart, monthEnd, addMonthKey,
    weekStart, rangeKeys, inRange, clamp, round2, sum, money, num, hours, hm, fmtDate, fmtMonth, pct,
    HEB_MONTHS, HEB_DAYS, HEB_DAYS_SHORT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
