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
    return g.App;
  } finally { for (const k of Object.keys(stubs)) if (saved[k] === undefined) delete g[k]; }
}
const APP = loadSlipRead();
const R = APP.SlipRead;

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

T.test('from a picture, hours × rate confirms a line only with the agorot read', () => {
  // the rate 45.63 read "4563": 10 × 456.30 = 4,563 multiplied out by chance and overtime pay showed ₪4,563
  const lost = read(row(100, ['111', 'שעות', 'נוספות', '125%', '10.00', '4563', '456.30']));
  T.ok(!lost.F.ot125 || lost.F.ot125.value == null || Math.abs(lost.F.ot125.value - 456.3) < 0.01, 'got ' + (lost.F.ot125 && lost.F.ot125.value));
  const fine = read(row(100, ['111', 'שעות', 'נוספות', '125%', '10.00', '45.63', '456.30']));
  T.eq(val(fine.F, 'ot125'), 456.3, 'the amount the line multiplies out to is kept, with or without the hours from the parser');
  T.ok(fine.F.ot125.qty == null || fine.F.ot125.qty === 10, 'hours, when given, are the right ones');
});

T.test('from a picture, an amount its line multiplies out to is kept even when the parser leaves the hours out', () => {
  // the round-2 parser gives no hours or rate without a column heading to tell which is which; the review's own proof
  // (two numbers on the amount's line that multiply to it) keeps the amount ("שבת 150% 10 52.50 525.00": 10 x 52.50)
  for (const t of [['שבת', '150%', '10', '52.50', '525.00'], ['שעות', 'נוספות', '125%', '8.00', '56.25', '450.00']]) {
    const r = read(row(100, t));
    const k = t[0] === 'שבת' ? 'rest150' : 'ot125';
    T.eq(val(r.F, k), +t[t.length - 1], t.join(' '));
  }
  // a whole number times a whole number does not prove an amount from a photo (lost decimal points)
  const lost = read(row(100, ['שבת', '150%', '10', '5250', '525.00']));
  T.ok(!lost.F.rest150 || lost.F.rest150.value == null || lost.F.rest150.qty === 10, 'no proof from two whole numbers');
});

T.test('the parser\'s unordered factors prove an amount read from a photo', () => {
  // the round-3 parser keeps "10.00 45.63" as factors when it cannot tell the hours column; their product is the amount
  const lines = R.lines(R.rows(R.words(row(100, ['שעות', 'נוספות', '125%', '10.00', '45.63', '456.30']), [])));
  const p = { fields: { ot125: { value: 456.3, line: lines[0].text, factors: [45.63, 10] } }, other: [] };
  R.review(p, lines, 'ocr');
  T.eq(val(p.fields, 'ot125'), 456.3);
  // factors that do not multiply to it, on a line whose own numbers do not either: no proof, the amount is asked for
  const l2 = R.lines(R.rows(R.words(row(100, ['שעות', 'נוספות', '125%', '456.30']), [])));
  const wrong = { fields: { ot125: { value: 456.3, line: l2[0].text, factors: [45.63, 11] } }, other: [] };
  R.review(wrong, l2, 'ocr');
  T.eq(val(wrong.fields, 'ot125'), null);
  T.ok(wrong.fields.ot125.asked);
});

T.test('a payment put together from lines that are not it: the amount is not shown', () => {
  // the title's year and the hourly rate were added to the base: 2026 + 34.32 + 4,135.56 = 6,195.88, above the gross
  const he = row(100, ['תלוש', 'משכורת', 'לחודש', 'ספטמבר', '2026']).concat(row(140, ['היקף', 'משרה', '100%', 'שכר', 'שעה', '34.32']),
    row(180, ['שכר', 'יסוד', '120.50', '34.32', '4,135.56']), row(220, ['סה"כ', 'תשלומים', '5,537.37']));
  const { F, unsure } = read(he, [], 'pdf');
  if (F.base && / \| /.test(F.base.line)) { T.eq(val(F, 'base'), null); /* the parser or the review: either says it is not sure */ } else T.eq(val(F, 'base'), 4135.56);
});

T.test('a line whose name was not read waits to be named, with its amount', () => {
  // "שעות naw 150%": שבת misread as Latin letters; taken as overtime 150% it was shown as overtime
  const he = row(100, ['שעות', 'naw', '150%', '12.00', '51.48', '617.76']);
  const { F, parsed } = read(he);
  T.ok(!val(F, 'ot150') && !val(F, 'rest150'), 'no overtime or Shabbat amount from an unread name');
  // the row the parser named is asked for with its line (round 3: moved to the unnamed lines, the check read it as
  // missing); the round-2 parser names no row from such a line and keeps it among the unnamed lines itself
  T.ok(F.ot150 ? F.ot150.asked && /617\.76/.test(F.ot150.line) : parsed.other.some((o) => /617\.76/.test(o.line)), 'asked for, with the line it was read from');
  // a line with no name at all: "150% 10 52.50 525.00"
  const r2 = read(row(100, ['150%', '10', '52.50', '525.00']));
  T.ok(!val(r2.F, 'ot150') && (!r2.F.ot150 || r2.F.ot150.asked), 'a percentage alone names no line: no amount, asked for');
});

T.test('direction marks around a word do not hide it from the check', () => {
  const RLM = String.fromCharCode(0x200f), LRM = String.fromCharCode(0x200e);
  const he = row(100, [RLM + 'שעות' + LRM, 'naw', '150%', '12.00', '51.48', '617.76']);
  const { F } = read(he);
  T.ok(val(F, 'ot150') == null && (!F.ot150 || F.ot150.asked), 'the unread word is still seen: no amount shown (asked for, or the parser leaves the line unnamed)');
});

T.test('a line the parser keeps normalized still finds the words it was read from', () => {
  // "סה״כ" (gershayim) is kept as סה"כ by the parser: looked up by its exact text the line had no words, so its unread word was
  // not seen (and from a photo nothing on it could be confirmed)
  const lines = R.lines(R.rows(R.words(row(100, ['סה״כ', 'ניכויים', 'naw', '547.61']), [])));
  const parsed = { fields: { totalDeductions: { value: 547.61, line: 'סה"כ ניכויים naw 547.61' } }, other: [] };
  R.review(parsed, lines, 'ocr');
  T.ok(parsed.fields.totalDeductions.asked && parsed.fields.totalDeductions.why === 'name', 'the unread word is seen, the line is asked for');
  // a part of a row (the parser drops the line code) is found in its row
  const l2 = R.lines(R.rows(R.words(row(100, ['9001', 'ביטוח', 'לאומי', 'qxzw', '287.45']), [])));
  const p2 = { fields: { nationalInsurance: { value: 287.45, line: 'ביטוח לאומי qxzw 287.45' } }, other: [] };
  R.review(p2, l2, 'ocr');
  T.ok(p2.fields.nationalInsurance.asked && p2.fields.nationalInsurance.why === 'name', 'found by containment');
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

T.test('a page that prints the amount right of the name: each line keeps its own amount, never its code', () => {
  // "5,840.00 36.50 160.00 שכר יסוד 110 | 212.00 מס הכנסה 510" (two tables, amount | rate | hours | name | code): the
  // page was taken as printing names first, the cells were cut on the wrong side and income tax was 510 (its code)
  const ws = [];
  const put = (y, texts) => { let x = 1600; for (const t of texts) { ws.push({ text: t, x0: x - t.length * 9, x1: x, y0: y, y1: y + 18 }); x -= t.length * 9 + 30; } };
  put(100, ['5,840.00', '36.50', '160.00', 'שכר יסוד', '110', '212.00', 'מס הכנסה', '510']);
  put(130, ['456.30', '45.63', '10.00', 'שעות נוספות', '125%', '111', '175.33', 'ביטוח לאומי', '511']);
  put(160, ['395.60', 'החזר נסיעות', '114', '233.10', 'מס בריאות', '512']);
  put(200, ['פיצויים', '486.30', 'שעות עבודה', '176.00']); // the same page, a table with the names first
  const lines = R.pdfLines(ws);
  const p = Payslip.parseText(lines.map((l) => l.text).join('\n'));
  R.review(p, lines, 'pdf');
  T.eq(val(p.fields, 'incomeTax'), 212); T.eq(val(p.fields, 'nationalInsurance'), 175.33); T.eq(val(p.fields, 'healthTax'), 233.1);
  T.eq(val(p.fields, 'base'), 5840); T.eq(p.fields.base.qty, 160);
  T.eq(val(p.fields, 'ot125'), 456.3); T.eq(p.fields.ot125.qty, 10); T.eq(val(p.fields, 'travel'), 395.6);
  T.eq(val(p.fields, 'severance'), 486.3); T.eq(val(p.fields, 'workHours'), 176);
});

T.test('the payslip flow reads through SlipRead, and lets go of a reading whose sheet was closed', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  const start = src.slice(src.indexOf('async function startExtraction'), src.indexOf('/* ---------------- verification'));
  T.ok(/extractSlip\(file, progress, stop && stop\.signal\)/.test(start), 'the picture goes through extractSlip, stoppable');
  T.ok(!/Store\.putFile/.test(start), 'nothing is stored before the payslip is saved (intake P1)');
  T.ok(/SlipRead\.review\(parsed, lines, source\)/.test(start), 'what is not sure is left to fill in');
  T.ok(/onClose: \(\) => \{ gone = true; if \(stop\) stop\.abort\(\); \}/.test(start) && /if \(gone\) return;/.test(start), 'a closed reading opens nothing and stops');
  T.ok(/DocRead\.words\(img, progress, \{ lines: true, signal \}\)/.test(src), 'the table lines are taken out before reading');
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

T.section('payslip check: a line read but not sure never becomes money owed (round 3)');

// review t13: a correct payslip photographed with its gross line cut off. Travel and pension are read right but
// nothing on the page confirms them; emptied and then dropped at "המשך", the check said the payslip lacks them
const T13 = ['תלוש שכר לחודש 09/2026', 'שכר יסוד 40.00 40.00 1,600.00', 'שעות נוספות 125% 2.00 50.00 100.00', 'שעות שבת 150% 4.00 60.00 240.00', 'נסיעות 135.60', 'פנסיה עובד 116.40'];
const t13 = () => {
  const he = [].concat(...T13.map((t, i) => row(100 + i * 40, t.split(' '))));
  return read(he);
};
T.test('an amount the review empties stays on the payslip as asked for: { value: null, asked: true }', () => {
  const { F, unsure } = t13();
  for (const k of ['travel', 'pensionEmployee']) {
    T.ok(F[k], k + ' kept');
    T.eq(F[k].value, null, k);
    T.eq(F[k].asked, true, k + ' asked');
    T.eq(F[k].why, unsure[k], k + ' why');
  }
  T.eq(val(F, 'base'), 1600, 'what the line proves stays');
  T.ok(!F.base.asked);
});
T.test('an hour line without its hours, next to hour lines with theirs, is asked for its hours', () => {
  // Shabbat 240 read, its hours not: the check added the other lines' hours and said "שעות שלא שולמו 240"
  const he = row(100, ['שכר', 'יסוד', '40.00', '40.00', '1,600.00']).concat(row(140, ['שעות', 'שבת', '150%', '240.00']));
  const { F } = read(he, [], 'pdf');
  T.eq(F.base.qty, 40); T.ok(!F.base.asked);
  // (the round-2 parser asks for such a line's amount itself; either way nothing goes on without the person)
  T.ok(F.rest150.asked, 'asked for');
  if (val(F, 'rest150') != null) { T.eq(val(F, 'rest150'), 240, 'the amount stays'); T.ok(F.rest150.qty == null && F.rest150.why === 'qty', 'its hours are asked for'); }
  // with no hour line that has hours, nothing is asked (the check cannot add up hours, and says so itself)
  const one = read(row(100, ['שעות', 'שבת', '150%', '240.00']), [], 'pdf');
  T.ok(!one.F.rest150.asked || val(one.F, 'rest150') == null, 'no hours asked when no line has hours');
});

T.test('a field the parser itself leaves without an amount is asked for too', () => {
  const p = { fields: { base: { value: null, line: 'שכר יסוד 40.00 4X.00' }, travel: { value: 135.6, line: 'נסיעות 135.60' } }, other: [] };
  R.review(p, [], 'pdf');
  T.eq(p.fields.base.asked, true);
  T.ok(!p.fields.travel.asked);
});
T.test('"המשך" does not go on while a row asked for is neither typed in nor removed', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  const go = src.slice(src.indexOf("else if (b.hasAttribute('data-go')) {"), src.indexOf('setTimeout(() => analysisSheet('));
  T.ok(go.includes("const lacks = (k) => { const v = d.fields[k]; return !!v && v.asked && (v.value == null || (v.why === 'qty' && !(v.qty > 0))); };"), 'an asked amount, or asked hours, lacks');
  const gate = go.indexOf('const open = [].concat(...GROUPS.map((g) => Payslip.FIELDS.filter((f) => f.kind === g[0]).map((f) => f.key))).find(lacks);');
  T.ok(gate > 0, 'the gate is there');
  T.ok(/const passAsked = Payslip\.ASKED_SAFE === true;\s*if \(open && !passAsked\) \{[\s\S]*?return;\s*\}/.test(go.slice(gate)), 'it stops, unless the check reads asked lines as "not read" (ASKED_SAFE)');
  T.ok(gate < go.indexOf('Payslip.addNamedLines(d.fields, d.other);'), 'before named lines are added (a named line does not fill an asked row)');
  const drop = go.indexOf('if (d.fields[k].value == null && d.fields[k].qty == null && !d.fields[k].asked) delete d.fields[k];');
  T.ok(gate < drop, 'before empty rows are dropped, and an asked line is never dropped as an empty row');
  T.ok(!/if \(d\.fields\[k\]\.value == null && d\.fields\[k\]\.qty == null\) delete d\.fields\[k\];/.test(go), 'no drop of every value-null field');
});
T.test('t13 through the flow: no money said owed for a line that was read but not sure', () => {
  // what "המשך" hands the check: with the gate, either the person typed the asked rows (here: the payslip's own
  // values) or removed them; the check on what was typed finds nothing missing for them
  const { F, parsed } = t13();
  const open = Payslip.FIELDS.map((f) => f.key).filter((k) => F[k] && F[k].asked && F[k].value == null);
  T.ok(open.includes('travel') && open.includes('pensionEmployee'), 'the gate stops on these: ' + open.join(','));
  // the old flow: asked rows dropped as if absent
  const dropped = Object.fromEntries(Object.entries(F).filter(([, v]) => v.value != null));
  T.ok(!dropped.travel && !dropped.pensionEmployee, 'dropped, they look absent (what the gate now prevents)');
  T.ok(parsed.fields === F);
});

T.test('no regex in the payslip screen lost a backslash (a shell heredoc ate them twice)', () => {
  // round 3 review: /^(.*?)(s*d+%)$/ for /^(.*?)(\s*\d+%)$/ (the screen reader's percent split) and /.pdf$/i for
  // /\.pdf$/i. Every regex literal is read from the source; a bare s*, s+, d+, d{, w+ or a ".pdf" with an unescaped dot
  // is what a lost backslash leaves
  const acorn = require('acorn');
  const walk = require('acorn-walk');
  const bad = [];
  for (const f of ['views-payslip.js', 'payslip-plus.js', 'salary-check.js', 'claim-report.js']) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', f), 'utf8');
    walk.simple(acorn.parse(code, { ecmaVersion: 'latest' }), {
      Literal(n) {
        if (!n.regex) return;
        const p = n.regex.pattern.replace(/\\./g, '__');
        if (/(^|[^A-Za-z_])[sdw][*+{]/.test(p) || /(^|[^\\_])\.(?:pdf|jpe?g|png)\b/i.test(n.regex.pattern.replace(/\\\./g, '__'))) bad.push(f + ': /' + n.regex.pattern + '/');
      },
    });
  }
  T.eq(bad.join('  '), '');
});

T.section('payslip check: the parser\'s never-seen family through the screen (round 3)');

T.test('a balance line keeps its columns: the balance is the last one, not the previous', () => {
  // cut into four, "חופשה: יתרה קודמת 1.75" gave the previous balance as the balance (1,196 wrong on the agency layout)
  const lines = R.lines(R.rows(R.words(row(100, ['חופשה:', 'יתרה', 'קודמת', '1.75', 'זיכוי', '1.00', 'ניצול', '0.00', 'יתרה', '2.75']), [])));
  T.eq(lines.length, 1, lines.map((l) => l.text).join(' / '));
  // the same with a column word a photo misread ('זיכו"')
  T.eq(R.lines(R.rows(R.words(row(100, ['חופשה:', 'יתרה', 'קודמת', '1.75', 'זיכו"', '1.00', 'ניצול', '0.00', 'יתרה', '2.75']), []))).length, 1);
  // and a balance line cut after "קודמת" anyway: its number is the previous balance, not shown
  const cut = { fields: { vacationBalance: { value: 1.75, line: 'חופשה: יתרה קודמת 1.75' } }, other: [] };
  R.review(cut, [], 'pdf');
  T.eq(cut.fields.vacationBalance.value, null);
  // two tables side by side are still two lines
  T.eq(R.lines(R.rows(R.words(row(100, ['שכר', 'יסוד', '168.00', '42.00', '7,056.00', 'מס', 'הכנסה', '418.00']), []))).length, 2);
});
T.test('a line code printed after the amount is the code, not the amount', () => {
  // "704 | נסיעות | 82.60" read right to left: travel 704 for 82.60
  const { F } = read(row(100, ['נסיעות', '82.60', '704']), [], 'pdf');
  T.eq(val(F, 'travel'), 82.6);
  // a whole-shekel amount that hours × rate make is the amount: "שעות עבודה 168.25 35.4 5956" keeps 5956 last
  const l = R.lines(R.rows(R.words(row(100, ['שעות', 'רגילות', '168.25', '35.4', '5956']), [])));
  T.ok(/5956$/.test(l[0].text), l[0].text);
});
T.test('on an hour line, the rate taken for the hours is not kept', () => {
  // "שעות שבת 7.25 60.00 435.00" read as 60 hours at 7.25: a "low Shabbat rate" of 3,165 owed
  const p = { fields: { rest150: { value: 435, qty: 60, rate: 7.25, line: 'שעות שבת 7.25 60.00 435.00' } }, other: [] };
  R.review(p, [], 'pdf');
  T.eq(p.fields.rest150.value, 435, 'the amount stays');
  T.eq(p.fields.rest150.qty, null, 'the hours do not');
});
T.test('an hour line whose two numbers the parser could not order is asked for its hours', () => {
  const p = { fields: { ot125: { value: 362.5, line: 'שעות נוספות 125% 7.25 50.00 362.50', factors: [7.25, 50] } }, other: [] };
  R.review(p, [], 'pdf');
  T.eq(p.fields.ot125.value, 362.5);
  T.ok(p.fields.ot125.asked && p.fields.ot125.why === 'qty');
});
T.test('hour lines without hours on a payslip that prints its work hours are asked for their hours', () => {
  // round 4's parser leaves every line's hours out without a heading; judged by pay, the overtime was "21.09 missing"
  const p = { fields: { base: { value: 7046, line: 'שכר יסוד 7,046.00' }, ot125: { value: 552.5, line: 'שעות נוספות 125% 552.50' }, workHours: { value: 148.75, line: 'שעות עבודה 148.75' } }, other: [] };
  R.review(p, [], 'pdf');
  T.ok(p.fields.ot125.asked && p.fields.ot125.why === 'qty' && p.fields.base.asked, 'asked');
  const none = { fields: { ot125: { value: 552.5, line: 'שעות נוספות 125% 552.50' } }, other: [] };
  R.review(none, [], 'pdf');
  T.ok(!none.fields.ot125.asked, 'no hours anywhere: nothing to ask');
});
T.test('an unnamed line with an unread word that names a line without it is asked for under that name', () => {
  // round 4's parser leaves "שעות naw 150% …" unnamed; the check then took its pay as not paid
  const lines = R.lines(R.rows(R.words(row(100, ['שעות', 'naw', '150%', '12.00', '51.48', '617.76']), [])));
  const p = { fields: {}, other: [{ line: lines[0].text, value: 617.76 }] };
  R.review(p, lines, 'ocr');
  const k = Object.keys(p.fields)[0];
  T.ok(k && p.fields[k].asked && p.fields[k].value == null && /617\.76/.test(p.fields[k].line), 'asked: ' + JSON.stringify(p.fields));
  // a clean unnamed line stays among the unnamed lines
  const l2 = R.lines(R.rows(R.words(row(100, ['קרן', 'מילואים', '617.76']), [])));
  const p2 = { fields: {}, other: [{ line: l2[0].text, value: 617.76 }] };
  R.review(p2, l2, 'ocr');
  T.eq(Object.keys(p2.fields).length, 0);
});
T.test('the year\'s figures read as the month\'s are not shown', () => {
  // the month's gross taken as the year's gross (outside January), and the year's taxable gross as the month's
  const a = { period: '2026-07', fields: { gross: { value: 5415.1, line: 'שכר ברוטו 5,415.10' }, ytdGross: { value: 5415.1, line: 'שכר ברוטו 5,415.10' } }, other: [] };
  R.review(a, [], 'pdf');
  T.eq(a.fields.ytdGross.value, null);
  const jan = { period: '2026-01', fields: { gross: { value: 5415.1, line: 'שכר ברוטו 5,415.10' }, ytdGross: { value: 5415.1, line: 'ברוטו מצטבר 5,415.10' } }, other: [] };
  R.review(jan, [], 'pdf');
  T.eq(jan.fields.ytdGross.value, 5415.1, 'in January the year is the month');
  const b = { fields: { taxableGross: { value: 35815.82, line: 'ברוטו למס 35,815.82' }, ytdGross: { value: 5415.1, line: 'שכר ברוטו 5,415.10' } }, other: [] };
  R.review(b, [], 'pdf');
  T.eq(b.fields.taxableGross.value, null); T.eq(b.fields.ytdGross.value, null);
  const c = { fields: { base: { value: 3000, line: 'שכר יסוד 3,000.00' }, taxableGross: { value: 35815.82, line: 'ברוטו למס 35,815.82' } }, other: [] };
  R.review(c, [], 'pdf');
  T.eq(c.fields.taxableGross.value, null, 'far above every amount of the month');
});

T.section('payslip check: taking the file in (intake findings, round 2)');

T.atest('a PDF whose amounts are form fields: the fields\' values are read with the page\'s text', async () => {
  // pdf.js gives a filled form field only as an annotation: the amounts were missing and the hours became the base
  const page = {
    getTextContent: async () => ({ items: [{ str: 'שכר יסוד', transform: [10, 0, 0, 10, 400, 700], width: 40, height: 10, dir: 'rtl' }] }),
    getAnnotations: async () => [
      { subtype: 'Widget', fieldValue: '6,200.00', rect: [100, 698, 160, 712] },
      { subtype: 'Widget', fieldValue: '', rect: [10, 698, 60, 712] },
      { subtype: 'Widget', fieldValue: 'x', hidden: true, rect: [10, 600, 60, 612] },
      { subtype: 'Link', url: 'https://example.com', rect: [0, 0, 1, 1] },
    ],
  };
  const items = await APP.pdfPageItems(page);
  T.eq(items.length, 2);
  T.eq(items[1].str, '6,200.00');
  const broken = { getTextContent: async () => ({ items: [] }), getAnnotations: async () => { throw new Error('no'); } };
  T.eq((await APP.pdfPageItems(broken)).length, 0, 'a page whose annotations fail still reads');
});

T.atest('form-field amounts land on their own rows, apart from the next column', async () => {
  // slip.form2.pdf's layout: the field box is wider than its value (as wide as the box, the value was glued to the
  // rate: "6,200.0038.75"), and a field sits 0.5 pt off its row's text (read as a tilt, every value moved a row:
  // the income tax as the gross)
  const t = (str, x, y) => ({ str, transform: [16.8, 0, 0, 16.8, x, y], width: str.length * 8, height: 16.8, dir: /[א-ת]/.test(str) ? 'rtl' : 'ltr' });
  const rows = [['שכר יסוד', 701.2, '6,200.00', 697.2], ['נסיעות', 668.7, '250.00', 664.7], ['סה"כ תשלומים', 636.1, '6,450.00', 632.1], ['מס הכנסה', 603.6, '310.00', 599.6], ['ביטוח לאומי', 571.1, '225.75', 567.1], ['סה"כ ניכויים', 538.6, '535.75', 534.6], ['נטו לתשלום', 506.1, '5,914.25', 502.1]];
  const items = rows.map(([n, y]) => t(n, 400, y)).concat([t('160.00', 253.4, 701.2), t('38.75', 146.3, 701.2)]);
  const an = rows.map(([, , v, y]) => ({ subtype: 'Widget', fieldValue: v, rect: [60, y, 160, y + 18] }));
  const all = await APP.pdfPageItems({ getTextContent: async () => ({ items }), getAnnotations: async () => an });
  const lines = R.pdfLines(globalThis.Timesheet.wordsFromPdfItems(all, 0));
  const p = Payslip.parseText(lines.map((l) => l.text).join('\n'));
  R.review(p, lines, 'pdf');
  T.eq(val(p.fields, 'base'), 6200, lines.map((l) => l.text).join(' / '));
  T.eq(val(p.fields, 'travel'), 250); T.eq(val(p.fields, 'gross'), 6450); T.eq(val(p.fields, 'incomeTax'), 310);
  T.eq(val(p.fields, 'net'), 5914.25);
});

T.test('the payslip file is stored only with a saved payslip; a failed read goes back to the start', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  const start = src.slice(src.indexOf('async function startExtraction'), src.indexOf('/* ---------------- verification'));
  const save = src.slice(src.indexOf('async function saveSlip'), src.indexOf('async function saveSlip') + 1200);
  T.ok(/if \(slip\.file && !slip\.fileId\)/.test(save) && /Store\.putFile\(id, slip\.file/.test(save), 'saveSlip stores the file');
  T.ok(/setTimeout\(\(\) => \{ App\.actions\['payslip-new'\]\(\); UI\.toast\(/.test(start), 'after a failure the start sheet (manual entry, another file) opens');
  T.ok(/id="ps-file" class="sr"/.test(src) && /id="ps-cam" class="sr"/.test(src), 'the pickers are reachable by keyboard');
  T.ok(/statusEl\.setAttribute\('role', 'status'\)/.test(start) && /aria-hidden="true"/.test(start), 'the stage is announced, the percent is not');
});

T.test('a PDF page drawn for the reader stays under 12 million pixels; a scanned report is read on every page', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  T.ok(/Math\.min\(2\.5, Math\.sqrt\(12e6 \/ Math\.max\(1, v1\.width \* v1\.height\)\)\)/.test(src), 'scale capped');
  T.ok(!/getViewport\(\{ scale: 2\.5 \}\)/.test(src.slice(src.indexOf('async function pagePicture'))), 'no page drawn at a fixed 2.5 after pagePicture');
  const rd = src.slice(src.indexOf('App.readDocWords = async function'), src.indexOf('async function ocrPass'));
  T.ok(/const pagesRead = Math\.min\(doc\.numPages, 8\)/.test(rd) && /for \(let p = 1; p <= pagesRead; p\+\+\) \{\n\s+if \(opts\.signal/.test(rd), 'every scanned page up to 8');
});

T.test('a month the file does not say is not filled in for the person', () => {
  // last month in its place looked read, and the check compared the payslip with another month's shifts
  const src = fs.readFileSync(SRC, 'utf8');
  const start = src.slice(src.indexOf('async function startExtraction'), src.indexOf('/* ---------------- verification'));
  T.ok(/const period = parsed\.period && parsed\.period >= '2000-01' && parsed\.period <= U\.todayKey\(\)\.slice\(0, 7\) \? parsed\.period : '';/.test(start), 'an unread or impossible month (after this month) stays empty');
  T.ok(/verifySheet\(\{ fields: parsed\.fields, other: parsed\.other, period, /.test(start), 'and that is the month the check screen gets');
  T.ok(!/defaultPeriod\(\)/.test(start), 'no guessed month on a read file');
  T.ok(/UI\.invalid\('בחרו את חודש התלוש'\)/.test(src), '"continue" asks for the month');
});
