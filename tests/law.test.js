/* The yearly legal numbers must not run out of date unnoticed: each table has to cover today. When one of these
 * fails, the law moved on — look up the new numbers (the yearly checklist in CLAUDE.md), add a row, and the test
 * passes again. */
const { U, Engine, Defaults } = globalThis;
const T = require('./t.js');

const today = U.todayKey();
const year = +today.slice(0, 4);

T.test('law: the minimum wage table has this year\'s row (a new one every April 1st)', () => {
  const last = Engine.MIN_WAGE[Engine.MIN_WAGE.length - 1].from;
  T.ok(today < U.addMonths(last, 12), `MIN_WAGE ends at ${last}: add the rate published for ${U.addMonths(last, 12)}`);
});
T.test('law: National Insurance\'s threshold and ceiling cover this year (they change every January 1st)', () => {
  T.ok(Engine.BL_YEARS[year], `BL_YEARS has no ${year}: add its reduced-rate threshold and ceiling (btl.gov.il)`);
});
T.test('law: the recuperation day rate was checked for this year', () => {
  const last = Math.max(...Object.keys(Engine.RECUP_YEARS).map(Number));
  // the rate stays for years at a time; it only needs a look once a year (a new extension order is usually mid-year)
  T.ok(year <= last + 1, `RECUP_YEARS last changed in ${last}: check the private sector's rate for ${year}`);
});
T.test('law: the tax brackets and the travel cap were checked until today', () => {
  for (const [k, until] of Object.entries(Defaults.LAW_CHECKED)) T.ok(today <= until, `Defaults.LAW_CHECKED.${k} ran out on ${until}: check and update`);
});
T.test('law: by-year values — 2025 and 2026 National Insurance, the recuperation rate before and after 2026', () => {
  const s = Defaults.defaultSettings();
  T.eq(Engine.blLimits(s.tax, '2025-06-30').thr, 7522);
  T.eq(Engine.blLimits(s.tax, '2026-06-30').thr, 7703);
  T.eq(Engine.blLimits(s.tax, '2026-06-30').ceil, 51910);
  // a threshold an earlier version saved as its default still follows the law; one the user typed stays
  T.eq(Engine.blLimits({ blReducedThreshold: 7522 }, '2026-06-30').thr, 7703);
  T.eq(Engine.blLimits({ blReducedThreshold: 8000 }, '2026-06-30').thr, 8000);
  T.eq(Engine.recuperationRate(s.leave, '2025-12-31'), 418);
  T.eq(Engine.recuperationRate(s.leave, '2026-07-01'), 451.5);
  T.eq(Engine.recuperationRate({ recuperationRate: 418 }, '2026-07-01'), 451.5);
  T.eq(Engine.recuperationRate({ recuperationRate: 500 }, '2026-07-01'), 500);
});
