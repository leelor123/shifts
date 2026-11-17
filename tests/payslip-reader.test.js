/* The payslip reader's guards (readers campaign, Nov 2026). Each test is a line or a slip that once gave a wrong value:
 * the rule is that a value shown as read is right, or the line is left for the person to fill in (value null), never
 * a guess. The measured bench (generated slips of 17 layouts, 30 kinds of damage) lives outside the repo:
 * shaati-handoff/readers/work/slipcore/measure4.js. */
const { Payslip } = globalThis;
const T = require('./t.js');

const F = (text) => Payslip.parseText(text).fields;
const v = (text, key) => { const f = F(text)[key]; return f ? f.value : undefined; };
/** never a wrong number: the value is the one given, or the field is absent or asked for (null) */
/** the hours: right, or left out when the slip gives no evidence of which column they are in */
const qtyOk = (fld, want) => T.ok(fld.qty == null || Math.abs(fld.qty - want) < 0.006, 'hours ' + fld.qty + ', want ' + want + ' or none');
const never = (text, key, right, msg) => {
  const f = F(text)[key];
  T.ok(!f || f.value == null || Math.abs(f.value - right) < 0.006, (msg || key) + ': ' + JSON.stringify(f));
};

T.section('payslip reader: numbers as they are printed');
T.test('a decimal comma is a decimal ("56,32", "1234,56", "1.234,56")', () => {
  T.near(v('ביטוח לאומי 56,32', 'nationalInsurance'), 56.32);
  T.near(v('שכר יסוד 50,75 60,00 3.045,00', 'base'), 3045);
  T.near(F('שכר יסוד 50,75 60,00 3045,00').base.value, 3045);
  T.near(Payslip.numbersIn('1234,56')[0].v, 1234.56);
  T.near(Payslip.numbersIn('1,234')[0].v, 1234, 0.005, 'a thousands comma stays one');
});
T.test('two amounts glued by the recognition are cut, the right one first; a total is never read from a cut', () => {
  const b = F('0001 שכר יסוד 50.75 3,045.0060.00').base;
  T.near(b.value, 3045); qtyOk(b, 50.75);
  T.near(v('מס הכנסה 291.07291.07', 'incomeTax'), 291.07);
  never('ברוטו 748.456,287.57', 'gross', 6287.57);
  // one number or two glued: the arithmetic decides (a balance row, not a sick pay of 1,500 ₪)
  // (a glued token holds its two as they sit on the page, the left one first: here the used 0.00, then the accrued 1.50)
  const s = F('מחלה 29.50 0.001.50 31.00');
  T.ok(!s.sickBalance || s.sickBalance.value == null || Math.abs(s.sickBalance.value - 31) < 0.01, 'the balance or nothing');
  never('מחלה 29.50 1.500.00 31.00', 'sickPay', -1, 'and no sick pay read from a row that does not add up');
  T.ok(!s.sickPay, 'no sick pay: ' + JSON.stringify(s.sickPay));
  T.near(v('נטו לתשלום 8.500.00', 'net'), 8500, 0.005, 'a dotted thousands total stays one number');
});
T.test('a space inside an amount ("56 .32", "6, 287.57") is one amount', () => {
  T.near(v('ביטוח לאומי 56 .32', 'nationalInsurance'), 56.32);
  T.near(v('סה"כ תשלומים 6, 287.57', 'gross'), 6287.57);
});
T.test('a decimal point lost to a space: the joined reading when it adds up, else the line is asked for', () => {
  T.near(v('0002 שעות נוספות 125% 8,50 65.00 552 50', 'ot125'), 552.5);
  T.near(v('ש"נ 125 10 25 44.25 453 56', 'ot125'), 453.56, 0.005, 'the tier in the name is no amount');
  never('ביטוח לאומי 56 32', 'nationalInsurance', 56.32);
  never('בטוח לאומי 386.81 3,868 10', 'nationalInsurance', 386.81);
  never('שעות נוספות 150% 7.75 411 53', 'ot150', 411.53);
  T.near(v('שכר יסוד 160 40 6400', 'base'), 6400, 0.005, 'a whole-shekel line with an exact product stays');
  const bal = F('חופשה 2 25 1,25 1 00 2.50');
  T.ok(!bal.vacationPay, 'a balance row is no vacation pay'); T.near(bal.vacationBalance.value, 2.5);
});
T.test('a letter in an amount makes the line unsure, also after the tier is cut from it', () => {
  never('ש"נ 150 2.75 53.I0 l46.03', 'ot150', 146.03);
  never('שעות עבודה l67.75 38 6375', 'workHours', 167.75);
  never('ביטוח לאומי l63.95 שעות נוספות 125% 8.50 65.00 552.50', 'nationalInsurance', 163.95);
});
T.test('hours printed as h:mm are hours', () => {
  const b = F('101 שעות רגילות 33:30 38.00 1,273.00').base;
  T.near(b.value, 1273); qtyOk(b, 33.5);
  T.near(F(['101 שעות רגילות 33:30 38.00 1,273.00', 'סה"כ שעות 33:30'].join('\n')).base.qty, 33.5, 0.005, 'with the hours total');
});
T.test('a deduction next to a whole number on a line with agorot is asked for (its point was lost)', () => {
  never('ביטוח לאומי 16395 1,475.55', 'nationalInsurance', 163.95);
  never('מס הכנסה 24289 485.78', 'incomeTax', 242.89);
});

T.section('payslip reader: a line backwards, a row cut in parts');
T.test('a line stored backwards digit by digit is turned around; a visual line with its digits intact is not', () => {
  const back = ['6202 רבמבונ שדוחל רכש שולת', '50.659,5 04.53 52.861 תוליגר תועש 09', '00.254 תועיסנ', '23.65 ימואל חוטיב'].join('\n');
  const f = F(back);
  T.near(f.base.value, 5956.05); T.near(f.travel.value, 452); T.near(f.nationalInsurance.value, 56.32);
  T.eq(Payslip.parseText(back).period, '2026-11');
  // a rate with one decimal ("35.4") is no sign of a backwards line
  const vis = F(['2026 יאמ שדוחל רכש שולת', '4425 35.4 125 הדובע תועש', '192 תועיסנ', '63 ימואל חוטיב'].join('\n'));
  T.near(vis.travel.value, 192); T.near(vis.nationalInsurance.value, 63);
  T.near(v('ותק 12.5', 'seniority') || 0, 0, 0.005, 'a forward word keeps its line forward');
});
T.test('a tier alone between the numbers is the row\'s percent column, not a second line', () => {
  const f = F('102 שעות שבת 175% 3.50 105.00 175% 367.50');
  T.near(f.rest175.value, 367.5); T.near(f.rest175.qty, 3.5);
  T.near(v('101 שעות עבודה רגילות 50.75 60.00 100% 3,045.00', 'base'), 3045);
});
T.test('the currency word after an amount is no name', () => {
  const f = F('0001 שכר יסוד 50.75 ש"ח 60.00 ש"ח 3,045.00 ש"ח');
  T.near(f.base.value, 3045); T.ok(!f.base.qty || Math.abs(f.base.qty - 50.75) < 0.01);
});
T.test('a symbol code before a name is no "numbers first" row; codes after the names are taken out', () => {
  T.near(v('0006 דמי חגים 320.00 ניכויי חובה', 'holidayPay'), 320);
  const care = F(['שעות עבודה בפועל 301 35.40 168.25 5,956.05', 'החזר הוצאות נסיעה 302 82.60', 'דמי חגים 303 960.00', 'סה"כ ברוטו 6,998.65'].join('\n'));
  T.near(care.travel.value, 82.6); T.near(care.holidayPay.value, 960);
  T.ok(!care.base.qty || Math.abs(care.base.qty - 35.4) > 0.01, 'never 35.40 hours with no evidence');
});
T.test('numbers before a name that has its own numbers are another row\'s', () => {
  T.near(v('3.50 105.00 367.50 ביטוח לאומי 56.32', 'nationalInsurance'), 56.32);
});
T.test('words after a row\'s numbers are their own part, unless the rows are printed left to right', () => {
  const f = F('קרן פנסיה 319.95 הפרשות מעסיק');
  T.near(f.pensionEmployee.value, 319.95); T.ok(!f.pensionEmployer, 'not the employer\'s');
  const ltr = F(['4,425.00 35.40 125.00 שכר רגיל', '146.03 53.10 2.75 ש.נ. 150%', 'תשלומים 192.00 נסיעות'].join('\n'));
  T.near(ltr.travel.value, 192);
  never('ביטוח בריאות 206.98 קופות גמל שכר מבוטח עובד מעביד פיצויים', 'severance', 357.36);
});
T.test('a name alone on its line takes the numbers at the start of the next line (names printed first)', () => {
  const f = F(['שכר יסוד 50.75 60.00 3,045.00', 'שעות שבת 175%', '3.50 105.00 367.50 ביטוח לאומי 56.32', 'מס בריאות 174.91'].join('\n'));
  T.near(f.rest175.value, 367.5); T.near(f.nationalInsurance.value, 56.32);
});
T.test('a row continued on the next line is joined only when together hours × rate = pay', () => {
  const f = F(['שעות עבודה 141.5', '34.32 4856', 'שעות שבת 150% 7', '51.48 360'].join('\n'));
  T.near(f.base.value, 4856); T.near(f.rest150.value, 360);
  const g = F(['שעות 100% 50:45', '60.00 3,045.00 מס הכנסה 0.00'].join('\n'));
  T.near(g.base.value, 3045); qtyOk(g.base, 50.75);
});
T.test('an unreadable "net to pay" or payments-total line asks, it does not leave the earlier net or gross', () => {
  const f = F('שכר ברוטו 4,665.90\nשכר נטו 4,198.91\nנטו לתשלום 3,898.9l');
  T.ok(f.net && f.net.value == null, 'net asked for: ' + JSON.stringify(f.net));
});
T.test('the year\'s block opens on a heading joined to a line', () => {
  const f = F('סה"כ ברוטו 6,000.00\n- סכומים מצטברים - ברוטו למס 75,051.41\nמס הכנסה 1,200.00');
  T.ok(!f.taxableGross, 'no month taxable gross from the year: ' + JSON.stringify(f.taxableGross));
  T.ok(!f.incomeTax, 'no month income tax from the year');
});
T.test('two copies of one payslip in a file are read once; a second month is not added', () => {
  const one = ['תלוש שכר לחודש 07/2026', 'שכר יסוד 50.75 60.00 3,045.00', 'נסיעות 82.60', 'סה"כ ברוטו 3,127.60'];
  const f = F(one.concat(one).join('\n'));
  T.near(f.base.value, 3045); T.near(f.travel.value, 82.6);
  const two = F(one.concat(['תלוש שכר לחודש 08/2026', 'שכר יסוד 10.00 60.00 600.00']).join('\n'));
  T.near(two.base.value, 3045);
  T.ok(Payslip.parseText(one.concat(one).join('\n')).secondSlip, 'the reader says a second one was left');
  T.ok(!Payslip.parseText(one.join('\n')).secondSlip, 'one payslip: nothing left');
  const bare = ['חברה בע"מ תיק ניכויים 960904402', 'חודש: 07/2026', 'שם העובד: נדב', 'שכר יסוד 50.75 60.00 3,045.00'];
  T.near(F(bare.concat(bare).join('\n')).base.value, 3045);
});

T.section('payslip reader: PDF pieces');
T.test('a row\'s pieces a little above or below each other stay one line', () => {
  const it = (s, x, y) => ({ str: s, transform: [1, 0, 0, 1, x, y], width: s.length * 4.6 });
  const lines = Payslip.linesFromPdfItems([it('שעות רגילות', 480, 801.5), it('138.50', 340, 799.9), it('35.40', 260, 798.5), it('4,902.90', 160, 800.4)]);
  T.eq(lines.length, 1, lines.join(' | '));
  const f = F(lines.join('\n'));
  T.near(f.base.value, 4902.9);
});

T.section('payslip reader: which number is the hours');
T.test('a supplement paid by the hour below 7 ₪ keeps its hours', () => {
  const s = F('ותק 160.00 1.50 240.00').seniority;
  T.near(s.value, 240); T.near(s.qty, 160);
});
T.test('the hours column needs evidence; with none the hours are left out, never the rate', () => {
  const lone = F('שכר יסוד 35.40 168.25 5,956.05').base;
  T.near(lone.value, 5956.05); T.ok(lone.qty == null, 'no hours without evidence: ' + lone.qty);
  // the lines whose sizes decide
  const votes = F('שכר יסוד 168.25 35.40 5,956.05\nשעות נוספות 125% 2.00 44.25 88.50').base;
  T.near(votes.qty, 168.25);
  // the table's heading
  T.near(F('תיאור תעריף כמות סכום\nשכר יסוד 35.40 168.25 5,956.05').base.qty, 168.25);
  // the hours total
  T.near(F('שכר יסוד 35.40 168.25 5,956.05\nסה"כ שעות 168.25').base.qty, 168.25);
  // a rate a little below the others is what the check is for: it does not turn the line around
  const low = F('שכר יסוד 40.00 39.00 1,560.00\nשעות נוספות 125% 2.00 50.00 100.00').base;
  T.near(low.qty, 40); T.near(low.rate, 39);
});
T.test('an hours line with two numbers is checked against the slip\'s wage', () => {
  // its hours and rate (the amount on another line): asked, never 57 ₪
  never('שכר יסוד 50.75 60.00 3,045.00\nשעות שבת 150% 8.25 57.00', 'rest150', 470.25);
  // its rate and its amount (the hours lost): the rate is the wage, the hours follow
  const r = F('שעות נוספות 125% 2.00 75.00 150.00\nשכר יסוד 60.00 3,045.00').base;
  T.ok(!r || r.value == null || Math.abs(r.value - 3045) < 0.01);
  // its hours and its pay on a sheet with no rate column
  T.near(v('שעות רגילות 140.25 4,965.00\nסה"כ ברוטו 4,965.00', 'base'), 4965);
});
T.test('an hours line resting on one number, on a slip whose hour lines are whole, is asked for', () => {
  never('שכר יסוד 50.75 60.00 3,045.00\nשעות שבת 150% 7', 'rest150', 360);
});
T.test('a balance row is read in printed order; one that does not add up is asked for', () => {
  T.near(v('מחלה יתרה 18.00 1.50 0.00 19.50', 'sickBalance'), 19.5);
  never('יתרת חופשה 2.25 1.25 1.00', 'vacationBalance', 2.5);
  T.ok(!F('מחלה 16.75 1.00ו 1.00 16.75').sickPay, 'a stray letter and a factor of 1 prove no payment');
  T.ok(!F('חופשה 15.50 083 1.00 15.33').vacationPay, 'qty × rate within rounding, not 1.5%');
});
T.test('a factor of 1 is a product only when exact', () => {
  never('שכר יסוד 50.75 60.00 3,045.00\nשעות שבת 175% 1 85 85.31', 'rest175', 85);
});

T.section('payslip reader: properties');
T.test('generated slips: what is read is right, no NaN, no negative zero, idempotent', () => {
  // a small deterministic generator: random amounts, the usual layout, a few kinds of print
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const money = (x) => x.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  for (let n = 0; n < 300; n++) {
    const rate = Math.round((34 + rnd() * 40) * 100) / 100;
    const h = Math.round((20 + rnd() * 160) * 4) / 4, o = Math.round((0.5 + rnd() * 10) * 4) / 4;
    const base = Math.round(h * rate * 100) / 100, ot = Math.round(o * Math.round(rate * 125) / 100 * 100) / 100;
    const travel = Math.round(rnd() * 400 * 100) / 100;
    const gross = Math.round((base + ot + travel) * 100) / 100;
    const ni = Math.round(gross * 0.0104 * 100) / 100, health = Math.round(gross * 0.0323 * 100) / 100;
    const net = Math.round((gross - ni - health) * 100) / 100;
    const style = n % 3;
    const fmt = style === 1 ? (x) => money(x).replace(/,/g, '') : style === 2 ? (x) => money(x).replace(/,/g, 'X').replace('.', ',').replace(/X/g, '.') : money;
    const text = ['תלוש שכר לחודש 0' + (1 + (n % 9)) + '/2026', 'תיאור כמות תעריף סכום', 'שכר יסוד ' + [h.toFixed(2), rate.toFixed(2), fmt(base)].join(' '),
      'שעות נוספות 125% ' + [o.toFixed(2), (Math.round(rate * 125) / 100).toFixed(2), fmt(ot)].join(' '), 'נסיעות ' + fmt(travel),
      'סה"כ ברוטו ' + fmt(gross), 'ביטוח לאומי ' + fmt(ni), 'מס בריאות ' + fmt(health), 'נטו לתשלום ' + fmt(net)].join('\n');
    const p = Payslip.parseText(text);
    const want = { base, ot125: ot, travel, gross, nationalInsurance: ni, healthTax: health, net };
    for (const [k, w] of Object.entries(want)) {
      const got = p.fields[k];
      if (w === 0) continue;
      T.ok(got && got.value != null && Math.abs(got.value - w) < 0.006, n + ' ' + k + ' ' + JSON.stringify(got) + ' want ' + w + '\n' + text);
    }
    T.near(p.fields.base.qty, h, 0.005, n + ' hours');
    for (const [k, x] of Object.entries(p.fields)) for (const a of ['value', 'qty', 'rate']) {
      if (x[a] == null) continue;
      T.ok(typeof x[a] === 'number' && Number.isFinite(x[a]) && !Object.is(x[a], -0), k + '.' + a + ' = ' + x[a]);
    }
    T.ok(p.fields.net.value <= p.fields.gross.value, 'net <= gross');
    T.eq(JSON.stringify(Payslip.parseText(text).fields), JSON.stringify(p.fields), 'the same text reads the same');
  }
});

T.section('payslip reader: round 2 (samples from the payslip screen and intake sessions)');
T.test('a PDF row of names, word by word, over its numbers: each number goes with its whole name', () => {
  const it = (s, x, y) => ({ str: s, transform: [1, 0, 0, 1, x, y], width: s.length * 4.6 });
  // each Hebrew word its own piece, as pdf.js gives them
  const items = [it('ימי', 540, 60), it('עבודה', 515, 60), it('שעות', 440, 60), it('עבודה', 415, 60), it('נקודות', 340, 60), it('זיכוי', 312, 60),
    it('יתרת', 240, 60), it('חופשה', 215, 60), it('יתרת', 140, 60), it('מחלה', 115, 60),
    it('18', 525, 45), it('142.75', 420, 45), it('2.75', 320, 45), it('3.21', 222, 45), it('9.00', 122, 45)];
  const f = F(Payslip.linesFromPdfItems(items).join('\n'));
  T.near(f.workDays.value, 18); T.near(f.workHours.value, 142.75); T.near(f.creditPoints.value, 2.75);
  T.near(f.vacationBalance.value, 3.21); T.near(f.sickBalance.value, 9);
});
T.test('a tier with no name read is no overtime; a name of single letters is still a name', () => {
  const f = F('150% 10 52.50 525.00\nשעות naw 150% 12.00 51.48 617.76');
  T.ok(!f.ot150 && !f.rest150, 'no 150% line from a tier alone: ' + JSON.stringify(f));
  T.near(v('91 125% נ.ש 15.75 65.00 1,023.75', 'ot125'), 1023.75);
});
T.test('the hourly rate and the job percent in the header are no pay line; the rate tells the hours column', () => {
  const f = F(['תלוש משכורת לחודש ספטמבר 2026', 'תאריך תחילת עבודה: 15/06/2025 בנק 10 סניף 812 ח-ן 445566 היקף משרה 100% שכר שעה 36.00', 'שכר יסוד 120.50 36.00 4,338.00'].join('\n'));
  T.near(f.base.value, 4338); T.near(f.base.qty, 120.5); T.near(f.base.rate, 36);
  // rate first on the line, and the header's rate says so
  const r = F('תעריף שעה 35.40\nשכר יסוד 35.40 168.25 5,956.05').base;
  T.near(r.value, 5956.05); T.near(r.qty, 168.25);
});
T.test('a summary strip\'s bare "ניכויים:" is the total; the deductions file and a code under a heading are not', () => {
  T.near(v('ברוטו: 7,438.40\nניכויים: 1,005.96\nנטו לתשלום: 6,432.44', 'totalDeductions'), 1005.96);
  const f = F('ניכויים:\n9001 ביטוח לאומי 62.31\nתיק ניכויים: 94-1234567');
  T.ok(!f.totalDeductions, 'no total from a code or the file: ' + JSON.stringify(f.totalDeductions)); T.near(f.nationalInsurance.value, 62.31);
});
T.test('hours missing from an hours line with two numbers: asked for, never the rate as hours', () => {
  never('שעות נוספות 125% 43.75 218.75', 'ot125', 218.75);
  const f = F('שעות נוספות 125% 43.75 218.75').ot125;
  T.ok(!f || f.qty == null || Math.abs(f.qty - 5) < 0.01, 'never 43.75 hours');
  never('38.00 142.50 שכר רגיל', 'base', 5415);
  never('שכר יסוד 160.00 38.75', 'base', 6200, 'a quantity and a rate with the amount blank (a PDF form field)');
  const g = F('שכר יסוד 160.00 38.75').base;
  T.ok(!g || g.value == null, 'the quantity is no base pay');
});
T.test('OCR forms of סה"כ are read', () => {
  const f = F('סה\'יכ ניכויים 547.61\nסה\'\'כ תשלומים 5,537.37');
  T.near(f.totalDeductions.value, 547.61); T.near(f.gross.value, 5537.37);
  T.near(v('סהייכ ניכויים 547.61', 'totalDeductions'), 547.61);
});
T.test('round 3: overtime named by a letter ("שעות נוספות ב\'") is its tier, not 125%', () => {
  const f = F(['שעות רגילות 160.00 40.00 6,400.00', "שעות נוספות א' 8.50 50.00 425.00", "שעות נוספות ב' 4.75 60.00 285.00"].join('\n'));
  T.near(f.ot125.value, 425); T.near(f.ot125.qty, 8.5); T.near(f.ot150.value, 285); T.near(f.ot150.qty, 4.75);
  // no letter, its rate is 150% of the base rate
  T.near(F('שכר יסוד 160.00 40.00 6,400.00\nשעות נוספות 4.75 60.00 285.00').ot150.value, 285);
});
