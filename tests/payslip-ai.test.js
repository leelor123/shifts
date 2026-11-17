/* What goes to the AI and what comes back from it (readers campaign, Nov 2026): nothing that names the worker or the
 * employer leaves the phone, and an AI answer that is wrong, partial, hostile or badly typed never becomes a value
 * shown as read. */
const { Payslip } = globalThis;
const T = require('./t.js');

T.section('payslip: what is sent to the AI');
T.test('the name, the ID, the address, the bank account, the phone, the employee and employer numbers are hidden', () => {
  const text = ['סופר השכונה בע"מ תיק ניכויים 960904402', 'תלוש שכר לחודש 07/2026', 'שם העובד: נדב כהן מספר עובד 6866 ת.ז. 695769444',
    'כתובת: הרצל 10, תל אביב טלפון 055-4121656', 'בנק 24 סניף 989 חשבון 397209', 'לכבוד יוסף בן-דוד', 'ת.ז 012 345 678', 'מספר זהות: 01234567',
    'שם: Svetlana Ivanova', 'קפה נמל בע״מ ח.פ. 514567890', 'מייל nadav@example.com', 'שכר יסוד 50.75 60.00 3,045.00', 'נטו לתשלום 4,863.92'].join('\n');
  const r = Payslip.redact(text).text;
  for (const secret of ['נדב', 'כהן', '6866', '695769444', 'הרצל', '4121656', '397209', 'יוסף', '012 345 678', '01234567', 'Svetlana', 'Ivanova',
    '960904402', 'סופר השכונה', 'קפה נמל', '514567890', 'nadav@']) T.ok(!r.includes(secret), secret + ' survived:\n' + r);
  // the money and the month stay: the AI needs them
  for (const keep of ['3,045.00', '4,863.92', '07/2026', 'שכר יסוד', 'נטו לתשלום']) T.ok(r.includes(keep), keep + ' was hidden');
});

T.section('payslip: what comes back from the AI');
T.test('strings, NaN, Infinity, absurd sizes and hostile keys are no values', () => {
  const r = Payslip.fromAi({ period: '2026-13', fields: [
    { key: 'gross', value: '1,234.56', qty: 0, rate: 0 }, { key: 'net', value: 'NaN', qty: 0, rate: 0 }, { key: 'base', value: 1e12, qty: 160, rate: 40 },
    { key: '__proto__', value: 5, qty: 0, rate: 0 }, { key: 'constructor', value: 5, qty: 0, rate: 0 }, { key: 'travel', value: Infinity, qty: 0, rate: 0 },
    { key: 'incomeTax', value: '300.50', qty: 'abc', rate: null }, null, 'x'], otherLines: [{ label: 'x', amount: 'oops', type: 'payment' }, null] });
  T.ok(!r.fields.gross && !r.fields.net && !r.fields.base && !r.fields.travel, 'none read: ' + Object.keys(r.fields).join(','));
  T.ok(!Object.prototype.hasOwnProperty.call(r.fields, '__proto__') && Object.getPrototypeOf(r.fields) === Object.prototype, 'the object is untouched');
  T.near(r.fields.incomeTax.value, 300.5); T.ok(r.fields.incomeTax.qty === undefined, 'a bad qty is no qty');
  T.eq(r.period, null); T.eq(r.other.length, 0);
  for (const bad of [null, undefined, 'text', 42, { fields: 'x' }, { fields: { a: 1 } }]) {
    const e = Payslip.fromAi(bad);
    T.eq(Object.keys(e.fields).length, 0); T.eq(e.period, null);
  }
});
T.test('a minus on a deduction is the deduction; a negative payment or total is no value (a correction may be)', () => {
  const r = Payslip.fromAi({ fields: [{ key: 'incomeTax', value: -900, qty: 0, rate: 0 }, { key: 'base', value: -3000, qty: 0, rate: 0 },
    { key: 'gross', value: -5000, qty: 0, rate: 0 }, { key: 'diff', value: -200, qty: 0, rate: 0 }], otherLines: [] });
  T.near(r.fields.incomeTax.value, 900); T.ok(!r.fields.base && !r.fields.gross); T.near(r.fields.diff.value, -200);
});
T.test('a net above the gross (swapped) or deductions above the gross: the three are asked for, never shown as read', () => {
  const r = Payslip.fromAi({ fields: [{ key: 'gross', value: 5000, qty: 0, rate: 0 }, { key: 'net', value: 6000, qty: 0, rate: 0 }, { key: 'totalDeductions', value: 1000, qty: 0, rate: 0 }], otherLines: [] });
  for (const k of ['gross', 'net', 'totalDeductions']) T.ok(r.fields[k] && r.fields[k].value == null, k + ': ' + JSON.stringify(r.fields[k]));
  const ok = Payslip.fromAi({ fields: [{ key: 'gross', value: 6000, qty: 0, rate: 0 }, { key: 'net', value: 5000, qty: 0, rate: 0 }], otherLines: [] });
  T.near(ok.fields.gross.value, 6000); T.near(ok.fields.net.value, 5000);
});
T.test('two lines of one payment add up; hours and a rate that do not make the amount are left out', () => {
  const r = Payslip.fromAi({ fields: [{ key: 'base', value: 1600, qty: 40, rate: 40 }, { key: 'base', value: 1000, qty: 20, rate: 50 },
    { key: 'ot125', value: 500, qty: 50, rate: 2 }, { key: 'incomeTax', value: 100, qty: 0, rate: 0 }, { key: 'incomeTax', value: 120, qty: 0, rate: 0 }], otherLines: [] });
  T.near(r.fields.base.value, 2600); T.near(r.fields.base.qty, 60);
  T.near(r.fields.ot125.value, 500); T.ok(r.fields.ot125.qty === undefined, '50 hours at 2 ₪ is not 500');
  T.near(r.fields.incomeTax.value, 100); T.ok(r.other.some((o) => o.value === 120), 'the second one waits to be named');
});
T.test('round 2: a birth date and the whole bank number, slashes too, are hidden', () => {
  const r = Payslip.redact('תאריך לידה 12/03/1999\nחשבון בנק: 10-802-123456/78').text;
  T.ok(!r.includes('1999') && !r.includes('12/03'), r); T.ok(!r.includes('/78') && !r.includes('123456'), r);
});
