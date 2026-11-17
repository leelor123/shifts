/* The payslip check reads a picture or a PDF by where its words sit (SlipRead in src/app/views-payslip.js), and never
 * shows a number it is not sure of as if it were read (readers campaign, 17 Nov 2026). Before: the picture went
 * through one Tesseract pass as plain text, and of 96 test pictures and PDFs 114 values on the check screen were
 * wrong (the next cell's amount, a dropped digit, the rate taken for the hours). Each test here fails on that code. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const Payslip = globalThis.Payslip;
const SRC = path.join(__dirname, '..', 'src', 'app', 'views-payslip.js');

// the real file, loaded with stand-ins for the browser parts it touches when it loads (put back afterwards)
function loadSlipRead() {
  const g = globalThis, saved = {};
  const stubs = { Store: { S: { settings: { ai: {} }, employers: [], payslips: [], gaps: [] } }, UI: { icon: () => '', esc: (x) => String(x), money: (x) => String(x) }, App: { actions: {}, sheetsApi: {} }, Charts: {} };
  for (const k of Object.keys(stubs)) { saved[k] = g[k]; if (g[k] === undefined) g[k] = stubs[k]; }
  try {
    delete require.cache[SRC];
    require(SRC);
    return g.App.SlipRead;
  } finally { for (const k of Object.keys(stubs)) if (saved[k] === undefined) delete g[k]; }
}
const R = loadSlipRead();

// a word as a reader gives it: text, its box (y down), its confidence. A row is listed right to left, as Hebrew reads.
let X = 0;
const w = (text, conf, y, x1) => ({ text, x0: x1 - text.length * 12, x1, y0: y, y1: y + 24, conf: conf == null ? 95 : conf });
function row(y, texts, conf) {
  X = 1600;
  return texts.map((t) => { const o = w(t, conf, y, X); X = o.x0 - 14; return o; });
}
const read = (he, dg, source) => {
  const lines = R.lines(R.rows(R.words(he, dg || [])));
  const parsed = Payslip.parseText(lines.map((l) => l.text).join('\n'));
  const unsure = R.review(parsed, lines, source || 'ocr');
  return { lines, parsed, unsure, F: parsed.fields };
};
const val = (F, k) => (F[k] && F[k].value != null ? F[k].value : null);

T.section('payslip check: a picture read by where its words sit (SlipRead)');

T.test('two tables side by side: each name keeps its own amount', () => {
  // "שכר יסוד 168.00 42.00 7,056.00 מס הכנסה 418.00" read as one line gave income tax 7,056
  const { lines } = read(row(100, ['שכר', 'יסוד', '168.00', '42.00', '7,056.00', 'מס', 'הכנסה', '418.00']), [], 'pdf');
  T.eq(lines.length, 2, lines.map((l) => l.text).join(' / '));
  const p = Payslip.parseText(lines.map((l) => l.text).join('\n'));
  T.eq(p.fields.incomeTax.value, 418);
  T.eq(p.fields.base.value, 7056);
});

T.test('a tilted photo: the words of one row stay one row', () => {
  // 4 degrees: each word a little lower than the one to its right
  const he = row(300, ['ביטוח', 'לאומי', '287.45', 'מס', 'בריאות', '322.10']).map((o, i) => Object.assign(o, { y0: o.y0 + i * 9, y1: o.y1 + i * 9 }));
  const he2 = row(340, ['מס', 'הכנסה', '418.00', 'נטו', 'לתשלום', '7,488.29']).map((o, i) => Object.assign(o, { y0: o.y0 + i * 9, y1: o.y1 + i * 9 }));
  const rows = R.rows(R.words(he.concat(he2), []));
  T.eq(rows.length, 2);
  T.eq(rows[0].map((x) => x.text).join(' '), 'ביטוח לאומי 287.45 מס בריאות 322.10');
});

T.test('from a picture, an amount nothing confirms is left to fill in, with the line it was read from', () => {
  const { F, unsure } = read(row(100, ['מס', 'הכנסה', '418.00']).concat(row(140, ['נטו', 'לתשלום', '7,488.29'])));
  T.eq(val(F, 'incomeTax'), null, 'a lone deduction from a photo');
  T.eq(val(F, 'net'), null);
  T.ok(F.incomeTax && /418/.test(F.incomeTax.line), 'the row keeps the line, shown when it is opened');
  T.eq(unsure.incomeTax, 'sum');
});

T.test('amounts the payslip adds up itself are kept: payments to the gross, gross less deductions to the net', () => {
  const he = row(100, ['שכר', 'יסוד', '7,056.00']).concat(row(140, ['נסיעות', '497.20']), row(180, ['סה"כ', 'ברוטו', '7,553.20']),
    row(220, ['מס', 'הכנסה', '418.00']), row(260, ['סה"כ', 'ניכויים', '418.00']), row(300, ['נטו', 'לתשלום', '7,135.20']));
  const { F } = read(he);
  T.eq(val(F, 'gross'), 7553.2); T.eq(val(F, 'base'), 7056); T.eq(val(F, 'travel'), 497.2);
  T.eq(val(F, 'incomeTax'), 418); T.eq(val(F, 'totalDeductions'), 418); T.eq(val(F, 'net'), 7135.2);
});

T.test('the rate of a line is never taken for its hours', () => {
  // "שעות נוספות 125% 43.75 218.75": 43.75 is the rate (5 hours); it was shown as 43.75 hours of overtime
  for (const source of ['ocr', 'pdf']) {
    const { F } = read(row(100, ['שעות', 'נוספות', '125%', '43.75', '218.75']), [], source);
    T.ok(!F.ot125 || F.ot125.qty == null, source + ': hours ' + (F.ot125 && F.ot125.qty));
  }
  // hours × rate = amount on the line: all three sure
  const { F } = read(row(100, ['שעות', 'נוספות', '125%', '5.00', '43.75', '218.75']), [], 'ocr');
  T.eq(F.ot125.qty, 5); T.eq(F.ot125.value, 218.75);
});

T.test('a payment put together from lines that are not it: the amount is not shown', () => {
  // the title's year and the hourly rate were added to the base: 2026 + 34.32 + 4,135.56 = 6,195.88, above the gross
  const he = row(100, ['תלוש', 'משכורת', 'לחודש', 'ספטמבר', '2026']).concat(row(140, ['היקף', 'משרה', '100%', 'שכר', 'שעה', '34.32']),
    row(180, ['שכר', 'יסוד', '120.50', '34.32', '4,135.56']), row(220, ['סה"כ', 'תשלומים', '5,537.37']));
  const { F, unsure } = read(he, [], 'pdf');
  if (F.base && / \| /.test(F.base.line)) { T.eq(val(F, 'base'), null); T.eq(unsure.base, 'sum'); } else T.eq(val(F, 'base'), 4135.56);
});

T.test('a line whose name was not read waits to be named, with its amount', () => {
  // "שעות naw 150%": שבת misread as Latin letters; taken as overtime 150% it was shown as overtime
  const he = row(100, ['שעות', 'naw', '150%', '12.00', '51.48', '617.76']);
  const { F, parsed } = read(he);
  T.ok(!F.ot150 && !F.rest150, 'no overtime or Shabbat line from an unread name');
  T.ok(parsed.other.some((o) => Math.abs(o.value - 617.76) < 0.01), 'the amount is among the lines to name');
  // a line with no name at all: "150% 10 52.50 525.00"
  const r2 = read(row(100, ['150%', '10', '52.50', '525.00']));
  T.ok(!r2.F.ot150, 'a percentage alone names no line');
});

T.test('direction marks around a word do not hide it from the check', () => {
  const RLM = String.fromCharCode(0x200f), LRM = String.fromCharCode(0x200e);
  const he = row(100, [RLM + 'שעות' + LRM, 'naw', '150%', '12.00', '51.48', '617.76']);
  const { F } = read(he);
  T.ok(!F.ot150, 'the unread word is still seen');
});

T.test('numbers that cannot be are not shown', () => {
  // the year's gross below this month's base (a lost leading digit: 1,250.80 for 41,250.80)
  const a = read(row(100, ['שכר', 'יסוד', '120.50', '34.32', '4,135.56']).concat(row(140, ['ברוטו', 'מצטבר', '1,250.80'])), [], 'pdf');
  T.eq(val(a.F, 'ytdGross'), null, 'year to date below the month');
  // work hours that do not fit the work days (18 hours over 18 days: the days' number taken twice)
  const b = read(row(100, ['ימי', 'עבודה', '18']).concat(row(140, ['שעות', 'עבודה', '18'])), [], 'pdf');
  T.eq(val(b.F, 'workHours'), null); T.eq(val(b.F, 'workDays'), null);
  const c = read(row(100, ['ימי', 'עבודה', '18']).concat(row(140, ['שעות', 'עבודה', '142.75'])), [], 'pdf');
  T.eq(val(c.F, 'workHours'), 142.75); T.eq(val(c.F, 'workDays'), 18);
});

T.test('from a picture, the employer\'s part must be a few percent of the gross', () => {
  // "תגמולי מעסיק 39.78" for 339.78: one digit lost by both readings
  const sums = row(100, ['שכר', 'יסוד', '5,537.37']).concat(row(140, ['סה"כ', 'ברוטו', '5,537.37']));
  const lost = read(sums.concat(row(180, ['תגמולי', 'מעסיק', '39.78'])));
  T.eq(val(lost.F, 'pensionEmployer'), null);
  const fine = read(sums.concat(row(180, ['תגמולי', 'מעסיק', '339.78'])));
  T.eq(val(fine.F, 'pensionEmployer'), 339.78);
});

T.test('two readings that disagree: the number is not sure', () => {
  // the Hebrew reading saw 22, the digits reading 2: neither is shown
  const he = row(100, ['ימי', 'עבודה', '22']).concat(row(140, ['שעות', 'עבודה', '192.00']));
  const dg = [Object.assign({}, he[2], { text: '2' })];
  const { F } = read(he, dg);
  T.eq(val(F, 'workDays'), null);
});

T.test('a PDF\'s row of column names over a row of numbers: each number under its own name', () => {
  // by the text alone "שעות עבודה" took the work days (18) and "יתרת חופשה" the credit points
  const heads = [['ימי', 'עבודה'], ['שעות', 'עבודה'], ['נקודות', 'זיכוי'], ['יתרת', 'חופשה'], ['יתרת', 'מחלה']];
  const nums = ['18', '142.75', '2.75', '3.21', '9.00'];
  const ws = [];
  heads.forEach((h, i) => {
    const right = 1600 - i * 220;
    ws.push({ text: h[0], x0: right - 50, x1: right, y0: 100, y1: 118 }, { text: h[1], x0: right - 110, x1: right - 56, y0: 100, y1: 118 });
    ws.push({ text: nums[i], x0: right - 70, x1: right - 30, y0: 130, y1: 148 });
  });
  const lines = R.pdfLines(ws);
  const p = Payslip.parseText(lines.map((l) => l.text).join('\n'));
  R.review(p, lines, 'pdf');
  T.eq(val(p.fields, 'workDays'), 18); T.eq(val(p.fields, 'workHours'), 142.75);
  T.eq(val(p.fields, 'creditPoints'), 2.75); T.eq(val(p.fields, 'vacationBalance'), 3.21); T.eq(val(p.fields, 'sickBalance'), 9);
});

T.test('the payslip flow reads through SlipRead, and lets go of a reading whose sheet was closed', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  const start = src.slice(src.indexOf('async function startExtraction'), src.indexOf('/* ---------------- verification'));
  T.ok(/extractSlip\(file, progress\)/.test(start), 'the picture goes through extractSlip');
  T.ok(/SlipRead\.review\(parsed, lines, source\)/.test(start), 'what is not sure is left to fill in');
  T.ok(/onClose: \(\) => \{ gone = true; \}/.test(start) && /if \(gone\) \{[^\n]*return; \}/.test(start), 'a closed reading opens nothing');
  T.ok(/DocRead\.words\(img, progress, \{ lines: true \}\)/.test(src), 'the table lines are taken out before reading');
});

T.test('the optional AI\'s answer passes the same checks of what cannot be', () => {
  // a deduction above the gross and a payment above it are not taken from the AI either; its lines are not "unnamed"
  const res = Payslip.fromAi({ fields: [{ key: 'gross', value: 6000 }, { key: 'incomeTax', value: 7000 }, { key: 'net', value: 5200 }, { key: 'travel', value: 9000 }, { key: 'ot125', value: 218.75, qty: 43.75 }] });
  R.review(res, [], 'ai');
  T.eq(val(res.fields, 'incomeTax'), null); T.eq(val(res.fields, 'travel'), null);
  T.eq(val(res.fields, 'gross'), 6000); T.eq(val(res.fields, 'net'), 5200);
  T.eq(res.fields.ot125.qty, null, 'a rate given as hours');
  T.eq(res.other.length, 0);
  const src = fs.readFileSync(SRC, 'utf8');
  T.ok(/App\.aiAnalyze\(d\.text, \(res\) => \{ SlipRead\.review\(res, \[\], 'ai'\);/.test(src), 'the screen reviews the answer before showing it');
});

T.test('a month the file does not say is not filled in for the person', () => {
  // last month in its place looked read, and the check compared the payslip with another month's shifts
  const src = fs.readFileSync(SRC, 'utf8');
  const start = src.slice(src.indexOf('async function startExtraction'), src.indexOf('/* ---------------- verification'));
  T.ok(/period: parsed\.period \|\| ''/.test(start), 'an unread month stays empty');
  T.ok(!/defaultPeriod\(\)/.test(start), 'no guessed month on a read file');
  T.ok(/UI\.invalid\('בחרו את חודש התלוש'\)/.test(src), '"continue" asks for the month');
});
