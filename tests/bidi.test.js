/* Guard (22 Nov 2026): no bare list or range of dates, times or numbers inside right-to-left text.
 * In a Hebrew or Arabic sentence, "(6/12, 7/12, 8/12)" or "08:00–16:00" without an isolate come out scrambled: the bidi
 * algorithm lays the items out from the right while each one reads from the left. Such runs go through U.ltr, U.span or
 * U.dateList (src/core/util.js). This file must be required before the payslip tests: it records every text that
 * Payslip's checks return while the other tests run, and its last test (async, so it runs after them all) reads them. */
const { U, Payslip } = globalThis;
const T = require('./t.js');

const RTL = /[\u0590-\u05ff\u0600-\u06ff]/;
const ISOLATED = /[\u2066\u2067\u2068][^\u2066-\u2069]*\u2069/g;
// a date or a time: 6/12, 06/12/2026, 6.12, 08:00
const DT = '\\d{1,2}[/.:]\\d{1,2}(?:[/.]\\d{2,4})?';
const BARE = [
  // a list: two dates or times with only a comma between them
  { kind: 'list', rx: new RegExp(DT + '[,\u060c][\\s\u00a0]*' + DT, 'g') },
  // a range: two numbers with only a dash between them (a hyphen with no spaces stays together on its own)
  { kind: 'range', rx: /\d[\s\u00a0\u2060%\u20aa]*(?:[\u2013\u2014\u2212]|\s-\s)[\s\u00a0\u2060]*\d/g },
];
/** The runs in a text that would come out scrambled: [{ kind, run }]. */
function bareRuns(text) {
  if (typeof text !== 'string' || !RTL.test(text)) return [];
  const flat = text.replace(ISOLATED, '\u25ca');
  const out = [];
  for (const b of BARE) for (const m of flat.matchAll(b.rx)) out.push({ kind: b.kind, run: m[0] });
  return out;
}

T.section('bidi: dates, times and ranges inside right-to-left text');
T.test('the detector catches a bare list and range, and passes isolated ones', () => {
  const bad = ['באפליקציה 7.00 ש׳ ב-125% (6/12, 7/12, 8/12, 9/12); בתלוש 0.00.', 'עבדת 08:00\u201316:00 · מלצרות', 'דוח 01/12/2026 \u2013 31/12/2026 · הופק', 'في التطبيق (6/12, 7/12)'];
  for (const s of bad) T.ok(bareRuns(s).length, 'not caught: ' + s);
  const good = [
    'באפליקציה 7.00 ש׳ ב-125% (' + U.dateList(['2026-12-06', '2026-12-07', '2026-12-08']) + '); בתלוש 0.00 ו-0.00.',
    'עבדת ' + U.span('08:00', '16:00') + ' · מלצרות',
    'בתלוש ' + U.money(40) + ' לשעה, ובאפליקציה ' + U.money(45) + '.',
    'שכר יסוד 08-16 ובגיל 16 \u2013 ' + U.money(32.06),
    'no Hebrew here: 6/12, 7/12 and 08:00\u201316:00',
  ];
  for (const s of good) T.eq(JSON.stringify(bareRuns(s)), '[]', s);
});
T.test('U.dateList and U.span keep left to right and on one line', () => {
  T.eq(U.dateList(['2026-12-06', '2026-12-07']), '\u20666/12,\u00a07/12\u2069');
  T.eq(U.span('08:00', '16:00'), '\u206608:00\u2060\u2013\u206016:00\u2069');
});

// the app's own markup: a range or a list of number dates or times written straight into a template, outside an isolate
T.test('no template in src puts a bare date or time range or list into the text (use U.span, U.dateList, U.ltr)', () => {
  const fs = require('fs'), path = require('path');
  const KEEP = /^(timesheet|schedule|places-data|places|clean)\.js$/; // read Hebrew reports, never shown as sentences
  // a number date or time: fmtDate(x) or fmtDate(x, 'short'), epochHM(x), hm(x); not 'dm'/'long' (those carry words)
  const NUMDATE = "(?:fmtDate\\((?:[^()]|\\([^()]*\\))*?(?:, '(?:short)')?\\)|epochHM\\([^()]*(?:\\([^()]*\\))?[^()]*\\)|\\bhm\\([^()]*\\))";
  const RX = [new RegExp(NUMDATE + '\\}[ \\u00a0]?[\\u2013\\u2014][ \\u00a0]?\\$\\{(?:U\\.)?(?:fmtDate|epochHM|hm)\\('), /fmtDate\([^()]*\)\)\.join\('/];
  const bad = [];
  for (const dir of ['core', 'app']) {
    const d = path.join(__dirname, '..', 'src', dir);
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.js') || KEEP.test(f)) continue;
      fs.readFileSync(path.join(d, f), 'utf8').split('\n').forEach((line, i) => {
        for (const rx of RX) {
          const m = line.match(rx);
          if (!m) continue;
          const before = line.slice(0, m.index);
          const open = Math.max(before.lastIndexOf('\\u2066'), before.lastIndexOf('\u2066')), close = Math.max(before.lastIndexOf('\\u2069'), before.lastIndexOf('\u2069'));
          if (open > close || /\bltr\(/.test(before) || /'(?:dm|long|wdm|dmy)'/.test(m[0])) continue; // inside U.ltr, or dates written in words
          bad.push(dir + '/' + f + ':' + (i + 1) + ' ' + m[0].slice(0, 80));
        }
      });
    }
  }
  T.eq(bad.length, 0, bad.join('\n      '));
});

// every text the payslip checks give back while the other tests run
const seen = [];
function collect(v, where, depth) {
  if (depth > 6 || v == null) return;
  if (typeof v === 'string') { if (RTL.test(v)) seen.push({ where, text: v }); return; }
  if (Array.isArray(v)) { v.forEach((x) => collect(x, where, depth + 1)); return; }
  if (typeof v === 'object') for (const k of Object.keys(v)) if (k !== 'model' && k !== 'E' && k !== 'ctx') collect(v[k], where + '.' + k, depth + 1);
}
for (const name of ['analyze', 'checkGap', 'reconcile', 'settingsCheck', 'compareSlips', 'employerMessage', 'explainLines']) {
  const fn = Payslip && Payslip[name];
  if (typeof fn !== 'function') continue;
  Payslip[name] = function () {
    const r = fn.apply(this, arguments);
    try { collect(r, name, 0); } catch (e) { /* the guard never breaks a test */ }
    return r;
  };
}
T.atest('no payslip finding has a bare date list or range in its text', () => {
  T.ok(seen.length > 200, 'too few texts recorded (' + seen.length + '): is this file required before payslip.test.js?');
  const lists = seen.filter((s) => /\d{1,2}\/\d{1,2},[\s\u00a0]*\d{1,2}\/\d{1,2}/.test(s.text.replace(/[\u2066-\u2069]/g, '')));
  T.ok(lists.length, 'no finding with a list of dates was recorded: the guard would not see the overtime case');
  const bad = [];
  for (const s of seen) for (const b of bareRuns(s.text)) bad.push(s.where + ' [' + b.kind + '] "' + b.run + '" in: ' + s.text.slice(0, 140));
  T.eq(bad.length, 0, [...new Set(bad)].slice(0, 8).join('\n      '));
});

module.exports = { bareRuns };
