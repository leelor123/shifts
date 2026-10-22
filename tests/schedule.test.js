/* Reading a work schedule (core/schedule.js): messages, tables as text, a table's words, names, weeks. */
const T = require('./t.js');
const SC = globalThis.Schedule;
const today = '2026-10-22'; // a Thursday
const p = (text, named) => SC.parseText(text, { today, named });
const brief = (es) => es.map((e) => [e.date || 'd' + e.dow, e.start, e.end, e.who].join(' '));
T.section('work schedule');
T.test('a personal message: day names, ranges, a shift name, a day off', () => {
  const r = p('ראשון 8-16\nשני 16:00-24:00\nשלישי חופש\nרביעי ערב');
  T.ok(r.personal); T.ok(r.needsWeek);
  T.eq(brief(r.entries).join(' | '), 'd0 08:00 16:00  | d1 16:00 00:00  | d3 15:00 23:00 ');
  T.eq(r.entries[2].guess, 'named');
});
T.test('a group message: each shift keeps its name, the person picks theirs', () => {
  const r = p('סידור עבודה לשבוע הבא:\nראשון: דני 8-16, לי 16-24\nשני: לי 8-16, מאיה 16-24\nשלישי - מאיה 7:30-15:30 | דני 15:30 עד 23');
  T.eq(r.names.join(','), 'דני,לי,מאיה');
  T.eq(brief(SC.pick(r, ['לי'])).join(' | '), 'd0 16:00 00:00 לי | d1 08:00 16:00 לי');
  T.eq(brief(SC.pick(r, ['דני'])).join(' | '), 'd0 08:00 16:00 דני | d2 15:30 23:00 דני');
});
T.test('a name is a whole word: "לי" is not "לילך"', () => {
  T.ok(SC.isMine('לי', ['לי בטן'])); T.ok(SC.isMine('לי בטן', ['לי']));
  T.ok(!SC.isMine('לילך', ['לי'])); T.ok(!SC.isMine('', ['לי']));
});
T.test('a table pasted as text: a head of days, a row per person, a dash is a day off', () => {
  const r = p('שם\tראשון\tשני\tשלישי\tרביעי\tחמישי\nדני\t8-16\t16-24\t-\t8-16\tחופש\nלי\t16-24\t8-16\t8-16\t-\tערב');
  T.eq(brief(SC.pick(r, ['לי'])).join(' | '), 'd0 16:00 00:00 לי | d1 08:00 16:00 לי | d2 08:00 16:00 לי | d4 15:00 23:00 לי');
  T.eq(brief(SC.pick(r, ['דני'])).length, 3);
});
T.test('dates: with and without a year, a name and its date as one day', () => {
  const r = p('ראשון 26/10 8-16\n27.10.26 9-17\n2026-10-28 10:00-18:00\nיום ה׳ 29/10 לילה');
  T.eq(r.entries.map((e) => e.date).join(','), '2026-10-26,2026-10-27,2026-10-28,2026-10-29');
  T.ok(!r.needsWeek);
});
T.test('times: two side by side, a night, 24 and "עד"', () => {
  T.eq(brief(p('ראשון 08:00 16:30').entries)[0], 'd0 08:00 16:30 ');
  T.eq(brief(p('שני 22-06').entries)[0], 'd1 22:00 06:00 ');
  T.eq(brief(p('שלישי 16 עד 24').entries)[0], 'd2 16:00 00:00 ');
});
T.test('not a shift: a date-like range, a 23-hour "shift", a lone time far from a day', () => {
  T.eq(p('ראשון 12-11').entries.length, 0);
  T.eq(p('נא להגיע ב-8:00').entries.length, 0);
});
T.test('one time only: it starts then and lasts the usual length (a guess)', () => {
  const r = p('רביעי מ-16:00');
  T.eq(r.entries[0].guess, 'single');
  const rows = SC.rowsOf(r.entries, '2026-10-25', 360);
  T.eq(rows[0].date, '2026-10-28'); T.eq(rows[0].end, '22:00'); T.eq(rows[0].guess, 'single');
});
T.test('the person\'s own shift names (templates) come first', () => {
  const r = p('ראשון קופה', { 'קופה': ['10:00', '18:00'] });
  T.eq(brief(r.entries)[0], 'd0 10:00 18:00 ');
});
T.test('a name after the hours', () => {
  const r = p('יום ג׳ 22:00-06:00 לי');
  T.eq(r.entries[0].who, 'לי');
});
T.test('the week: this one until Wednesday, then the next; day names land in it', () => {
  T.eq(SC.weekStartFor('2026-10-22'), '2026-10-25'); // Thursday → next Sunday
  T.eq(SC.weekStartFor('2026-10-20'), '2026-10-18'); // Tuesday → this Sunday
  const rows = SC.rowsOf(p('ראשון 8-16\nשבת 20-02').entries, '2026-10-25', 480);
  T.eq(rows.map((x) => x.date + ' ' + x.start + (x.overnight ? '+' : '')).join(','), '2026-10-25 08:00,2026-10-31 20:00+');
});
T.test('a table\'s words (a photo): days across the top, a row per person, a row of dates under the names', () => {
  // right to left: the names column on the right, then Sunday, Monday, Tuesday to the left
  const w = (text, x, y) => ({ text, x0: x, x1: x + 40, y0: y, y1: y + 14 });
  const words = [
    w('שם', 500, 10), w('ראשון', 400, 10), w('שני', 300, 10), w('שלישי', 200, 10),
    w('25/10', 400, 30), w('26/10', 300, 30), w('27/10', 200, 30),
    w('דני', 500, 60), w('8-16', 400, 60), w('16-24', 300, 60), w('-', 200, 60),
    w('לי', 500, 90), w('16:00', 395, 90), w('-', 420, 90), w('24:00', 440, 90), w('בוקר', 300, 90), w('8-16', 200, 90),
  ];
  const r = SC.parseWords(words, { today });
  T.eq(brief(SC.pick(r, ['לי'])).join(' | '), '2026-10-25 16:00 00:00 לי | 2026-10-26 07:00 15:00 לי | 2026-10-27 08:00 16:00 לי');
  T.eq(brief(SC.pick(r, ['דני'])).join(' | '), '2026-10-25 08:00 16:00 דני | 2026-10-26 16:00 00:00 דני');
});
T.test('a table\'s words with the days down the side: a column per person', () => {
  const w = (text, x, y) => ({ text, x0: x, x1: x + 40, y0: y, y1: y + 14 });
  const words = [
    w('דני', 300, 10), w('לי', 200, 10),
    w('ראשון', 420, 40), w('8-16', 300, 40), w('16-24', 200, 40),
    w('שני', 420, 70), w('חופש', 300, 70), w('9-17', 200, 70),
  ];
  const r = SC.parseWords(words, { today });
  T.eq(brief(SC.pick(r, ['לי'])).join(' | '), 'd0 16:00 00:00 לי | d1 09:00 17:00 לי');
});
T.test('dates with the month\'s Hebrew name', () => {
  const r = p('25 באוקטובר 8-16\nיום שני 26 אוק׳ 9-17\n3 בנובמבר 2026 10-18');
  T.eq(r.entries.map((e) => e.date + ' ' + e.start).join(','), '2026-10-25 08:00,2026-10-26 09:00,2026-11-03 10:00');
});
T.test('a photo\'s dates where OCR read the "/" as a 1: put back when it fits the column\'s day', () => {
  const w = (text, x, y) => ({ text, x0: x, x1: x + 40, y0: y, y1: y + 14 });
  const words = [w('שם', 500, 10), w('ראשון', 400, 10), w('שני', 300, 10), w('שלישי', 200, 10),
    w('25110', 400, 30), w('26/10', 300, 30), w('27110', 200, 30),
    w('לי', 500, 60), w('8-16', 400, 60), w('9-17', 300, 60), w('10-18', 200, 60)];
  T.eq(SC.parseWords(words, { today }).entries.map((e) => e.date).join(','), '2026-10-25,2026-10-26,2026-10-27');
  // "21110" is not the 21st/10 when the column says Sunday (that would be a Wednesday): not taken
  const bad = [w('ראשון', 400, 10), w('שני', 300, 10), w('שלישי', 200, 10), w('21110', 400, 30), w('לי', 500, 60), w('8-16', 400, 60)];
  T.eq(SC.parseWords(bad, { today }).entries[0].date, null);
});
T.test('several days in one line: each shift with the day before it', () => {
  const r = p('סידור לשבוע הבא: ראשון: דני 8-16, לי 16-23 שני: לי 9-17 שלישי חופש רביעי לי ערב');
  T.eq(brief(SC.pick(r, ['לי'])).join(' | '), 'd0 16:00 23:00 לי | d1 09:00 17:00 לי | d3 15:00 23:00 לי');
});
