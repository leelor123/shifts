/* The yearly legal numbers must not run out of date unnoticed: each table has to cover today. When one of these
 * fails, the law moved on — look up the new numbers (the yearly checklist in CLAUDE.md), add a row, and the test
 * passes again. */
const { U, Engine, Defaults } = globalThis;
const T = require('./t.js');

const today = U.todayKey();
const year = +today.slice(0, 4);

T.test('law: the minimum wage table has this year’s row (a new one every April 1st)', () => {
  const last = Engine.MIN_WAGE[Engine.MIN_WAGE.length - 1].from;
  T.ok(today < U.addMonths(last, 12), `MIN_WAGE ends at ${last}: fill in minWage in Engine.LAW_YEARS[${+last.slice(0, 4) + 1}]`);
});
/* The yearly law table (Engine.LAW_YEARS): one row a year, filled in once a year. */
const LY = Engine.LAW_YEARS;
T.test('law: LAW_YEARS has this year’s row, and from December 1st next year’s (its unknowns as null)', () => {
  T.ok(LY[year], `Engine.LAW_YEARS has no ${year}: add the row (null = not published yet)`);
  if (today >= `${year}-12-01`) T.ok(LY[year + 1], `Engine.LAW_YEARS has no ${year + 1}: add it now, with null for what is not published yet`);
});
T.test('law: nothing in this year’s row is still "not published" past its date (LAW_DUE)', () => {
  const row = LY[year] || {};
  for (const key of Engine.LAW_KEYS) {
    const due = `${year}-${Engine.LAW_DUE[key].by}`;
    T.ok(!(row[key] === null && today >= due), `LAW_YEARS[${year}].${key} is still null after ${due}: look it up (${Engine.LAW_DUE[key].where}) and fill it in`);
  }
});
T.test('law: every key the engine reads has a value in force today, and a { same } only where a law froze it', () => {
  for (const key of Engine.LAW_KEYS) T.ok(Engine.lawYear(key, today).value != null, `no ${key} in force on ${today}`);
  // tax amounts are frozen for 2025–2027 (indexing resumes in 2028); any other { same } is a guess
  const FROZEN = { tax: [2025, 2027] };
  for (const [y, row] of Object.entries(LY)) for (const [key, v] of Object.entries(row)) {
    if (v && v.same) T.ok((FROZEN[key] || []).includes(+y), `LAW_YEARS[${y}].${key} = { same: ${v.same} }: only a law’s freeze may say that`);
  }
  T.eq(Engine.travelCap('2026-06-01'), 22.6);
  T.eq(Engine.lawYear('tax', '2027-03-01').value.point, 242, '2027: the frozen 2026 point');
  if (LY[2027].bl === null) { // until 2027's number is filled in: pending, and 2026's goes on
    T.eq(Engine.lawYear('bl', '2027-02-01').pending, true, 'an unknown 2027 says pending and uses 2026');
    T.eq(Engine.lawYear('bl', '2027-02-01').value[0], 7703);
  }
  T.eq(Engine.lawYear('minWage', '2026-03-31').value.hourly, 34.32, 'a year’s minimum wage starts on its own date');
});
/* No text anywhere names an old yearly number: when a new row is filled in, the number it replaced turns "old" and
 * this lists every place that still shows it (the texts read LAW_YEARS; translations hold {0}, never the number). */
T.test('law: no text names a yearly number that is no longer in force (src, site, i18n)', () => {
  const fs = require('fs'); const path = require('path');
  const ROOT = path.join(__dirname, '..');
  const inForce = new Set();
  for (const key of ['minWage', 'bl', 'recup', 'travelCap']) {
    const v = Engine.lawYear(key, today).value;
    for (const n of [].concat(key === 'minWage' ? [v.monthly, v.hourly] : v)) inForce.add(+n);
  }
  const old = new Set();
  for (const row of Object.values(LY)) {
    for (const v of [row.minWage && row.minWage.monthly, row.minWage && row.minWage.hourly, ...(Array.isArray(row.bl) ? row.bl : []), row.recup, row.travelCap]) {
      if (typeof v === 'number' && !inForce.has(v) && (v >= 1000 || v % 1)) old.add(v);
    }
  }
  const forms = (n) => {
    const two = n.toFixed(2); const [i, f] = two.split('.');
    const grp = (+i).toLocaleString('en-US');
    const out = n % 1 ? [`${grp}.${f}`, `${i}.${f}`, `${i},${f}`] : [grp, i, grp.replace(',', ' '), grp.replace(',', ' ')];
    return [...new Set(out)];
  };
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(js|json|html)$/.test(e.name)) files.push(f); } };
  for (const d of ['src', 'site', 'i18n']) walk(path.join(ROOT, d));
  // the table itself; the site's copy of the engine; the list of old stored defaults a migration clears; the minimum
  // wage page names the rate before the last change on purpose
  const ALLOW = [/src[\\/]core[\\/]engine\.js$/, /site[\\/]calc\.js$/, /i18n[\\/]catalog\.json$/];
  const hits = [];
  for (const f of files) {
    if (ALLOW.some((re) => re.test(f))) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/app\.js$/.test(f) && /\[32\.3, 34\.32/.test(line)) return; // migration list of old stored defaults
      if (/minimum-wage\.html$/.test(f)) return; // "before <date> it was <rate>" (tools/site-pages.js)
      for (const n of old) for (const s of forms(n)) {
        const re = new RegExp('(^|[^0-9.,])' + s.replace(/[.]/g, '\\.') + '(?![0-9])');
        if (re.test(line)) hits.push(`${path.relative(ROOT, f)}:${i + 1} names ${s} (no longer the law)`);
      }
    });
  }
  T.eq(hits.join('\n'), '', 'texts that name an old yearly number');
});
T.test('law: the hand-written website pages show the minimum wage in force (site/index.html, site/site.js)', () => {
  const fs = require('fs'); const path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
  const mw = Engine.legalMinWage(today);
  T.ok(read('index.html').includes(mw.hourly.toFixed(2) + ' ₪ לשעה (מאפריל ' + mw.from.slice(0, 4) + ')'), `site/index.html (#c-min) does not say ${mw.hourly.toFixed(2)} ₪ (from April ${mw.from.slice(0, 4)}): edit it by hand`);
  T.ok(new RegExp('const MIN = ' + String(mw.hourly).replace('.', '\\.') + ';').test(read('site.js')), `site/site.js MIN is not ${mw.hourly}: edit it by hand`);
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
T.test('law: the website\'s question pages show the same numbers as the app (node tools/site-pages.js after a change)', () => {
  const fs = require('fs'); const path = require('path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'site', f), 'utf8');
  const nis = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₪';
  const mw = Engine.MIN_WAGE[Engine.MIN_WAGE.length - 1];
  T.ok(read('minimum-wage.html').includes(nis(mw.hourly)), `site/minimum-wage.html does not show ${nis(mw.hourly)}: run node tools/site-pages.js`);
  const ry = Math.max(...Object.keys(Engine.RECUP_YEARS).map(Number));
  T.ok(read('recuperation-pay.html').includes(nis(Engine.RECUP_YEARS[ry])), `site/recuperation-pay.html does not show ${nis(Engine.RECUP_YEARS[ry])}: run node tools/site-pages.js`);
});
T.test('law: the payslip check names the reduced-rate threshold in force, not "60% of the average wage"', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'core', 'payslip.js'), 'utf8');
  T.ok(!src.includes('60% מהשכר הממוצע'), 'payslip.js still says the reduced rate runs to 60% of the average wage');
  T.ok(/basis: `שיעורים מופחתים עד \$\{U\.money\(Engine\.blLimits\(/.test(src), 'the basis reads Engine.blLimits');
});
