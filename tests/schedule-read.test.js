/* Reading a work schedule, the accuracy campaign of 17 Nov 2026 (core/schedule.js). Each test guards a reading
 * that went wrong on the schedule bench (pictures drawn and read by the app's own OCR): the input as the reader
 * gets it, and what it must make of it. Tables are given as word boxes, laid out the way a picture is read. */
const T = require('./t.js');
const SC = globalThis.Schedule;
const today = '2026-11-17'; // a Tuesday
const p = (text, more) => SC.parseText(text, Object.assign({ today }, more || {}));
const brief = (es) => es.map((e) => [e.date || 'd' + e.dow + (e.wk ? '+' + e.wk : ''), e.start, e.end, e.who].join(' ').trim());
const mineOf = (r, mine) => SC.offer(r, { today, mine }).entries;

/**
 * Word boxes of a table as a picture gives them. rows: [[cell, cell, …]], column 0 on the right (Hebrew) or on
 * the left (o.ltr). A cell's words are split by spaces; '\n' is a second line in the cell. o: { colW, rowH, x, y,
 * slope (a tilted photo: y moves with x), skipRows }.
 */
function table(rows, o) {
  o = o || {};
  const colW = o.colW || 120, rowH = o.rowH || 40, out = [];
  const W = (o.x || 40) + colW * Math.max(...rows.map((r) => r.length));
  rows.forEach((r, ri) => r.forEach((cell, ci) => {
    if (cell == null || cell === '') return;
    const left = o.ltr ? (o.x || 40) + ci * colW : W - (ci + 1) * colW;
    String(cell).split('\n').forEach((line, li) => {
      const ws = line.split(' ').filter(Boolean);
      const heb = /[֐-׿]/.test(line);
      const widths = ws.map((w) => w.length * 9);
      const total = widths.reduce((s, w) => s + w, 0) + (ws.length - 1) * 6;
      let x = left + (colW - total) / 2;
      const order = heb ? ws.map((w, i) => i).reverse() : ws.map((w, i) => i);
      for (const i of order) {
        const y = (o.y || 20) + ri * rowH + li * 18 + (o.slope ? x * o.slope : 0);
        out.push({ text: ws[i], x0: x, x1: x + widths[i], y0: y, y1: y + 14 });
        x += widths[i] + 6;
      }
    });
  }));
  return out;
}
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

T.section('work schedule: reading pictures and messages right (17 Nov 2026)');

/* ---- dates ---- */
T.test('a name that starts like a month is no date: "1 מאיה" is not 1 May, "3 יונתן" not 3 June', () => {
  // D-colour-photo: a "1" OCR left beside "מאיה" made every shift of a roster 1 May 2027
  T.eq(brief(p('ראשון 1 מאיה 8-16').entries).join(), 'd0 08:00 16:00 מאיה');
  T.eq(p('ראשון 3 יונתן 9-17').entries[0].date, null);
  // the months themselves still are dates: whole, cut short with their mark, or cut short alone
  T.eq(['5 במאי 8-16', '6 ביוני 8-16', '26 אוק׳ 9-17', '2 דצמ. 8-16', '26 אוק 9-17', '1 במרץ 8-16'].map((t) => p(t).entries[0].date).join(),
    '2027-05-05,2027-06-06,2026-10-26,2026-12-02,2026-10-26,2027-03-01');
});
T.test('a message from last year: dates with no year, each beside its day\'s name, are that year\'s', () => {
  // 23/11 and 24/11 fell on Sunday and Monday in 2025 (Monday and Tuesday in 2026)
  T.eq(p('ראשון 23/11 8-16\nשני 24/11 9-17').entries.map((e) => e.date).join(), '2025-11-23,2025-11-24');
  // one day alone that does not fit is the writer's slip: the date stands
  T.eq(p('ראשון 24/11 8-16').entries[0].date, '2026-11-24');
});

/* ---- shifts ---- */
T.test('hours written the 12-hour way: "7-3" is 07:00-15:00, "3-11" is 15:00-23:00, marked as a guess', () => {
  const r = p('ראשון 7-3\nשני 3-11\nשלישי 9am-5pm\nרביעי 8-16');
  T.eq(brief(r.entries).join(' | '), 'd0 07:00 15:00 | d1 15:00 23:00 | d2 09:00 17:00 | d3 08:00 16:00');
  T.eq(r.entries.map((e) => e.guess || '').join(), 'ampm,ampm,,');
});
T.test('until closing, from opening: the hour written is kept, the other end is a guess', () => {
  const r = p('ראשון 16-סגירה\nשני פתיחה-15\nשלישי סגירה\nרביעי פתיחה');
  T.eq(r.entries.map((e) => [e.start, e.end, e.guess].join(' ')).join(' | '), '16:00  single |  15:00 single | 15:00 23:00 named | 07:00 15:00 named');
  // the screen never shows a guessed time as read: a row with one end only is marked
  T.eq(SC.rowsOf(r.entries, '2026-11-22', 480).map((x) => x.guess).join(), 'single,single,named,named');
});
T.test('several days with one shift: "ראשון-חמישי 8-16", "ראשון, שלישי וחמישי 9-17"', () => {
  T.eq(p('ראשון-חמישי 8-16').entries.map((e) => e.dow).join(), '0,1,2,3,4');
  T.eq(p('ראשון, שלישי וחמישי 9-17').entries.map((e) => e.dow).join(), '0,2,4');
});
T.test('a week written from Monday: the Sunday after Saturday is in the week after', () => {
  const r = p('שני 8-16\nרביעי 9-17\nשבת 8-13\nראשון 7-15');
  T.eq(brief(r.entries).join(' | '), 'd1 08:00 16:00 | d3 09:00 17:00 | d6 08:00 13:00 | d0+1 07:00 15:00');
  T.eq(SC.rowsOf(r.entries, '2026-11-22', 480).map((x) => x.date).join(), '2026-11-23,2026-11-25,2026-11-28,2026-11-29');
});
T.test('"שני" is also a woman\'s name: inside another day\'s line, right before her hours, it is her', () => {
  const r = p('ראשון: דני 8-16, שני 16-24\nשני: דני 9-17');
  T.eq(brief(r.entries).join(' | '), 'd0 08:00 16:00 דני | d0 16:00 00:00 שני | d1 09:00 17:00 דני');
});
T.test('English names are not days: "Monica", "Friedman", "Sunny"', () => {
  const r = p('Sunday: Monica 8-16, Friedman 16-24\nMonday: Sunny 9-17');
  T.eq(brief(r.entries).join(' | '), 'd0 08:00 16:00 Monica | d0 16:00 00:00 Friedman | d1 09:00 17:00 Sunny');
});
T.test('a message copied with direction marks reads as the same message', () => {
  const r = p('\u200Fראשון:\u200F דני \u200E8-16\u200E\n\u202Bשני\u202C: דני 9-17');
  T.eq(brief(r.entries).join(' | '), 'd0 08:00 16:00 דני | d1 09:00 17:00 דני');
});
T.test('a name with its family name\'s first letter: "דני כ." and "דני ל." are two people', () => {
  const r = p('ראשון: דני כ. 8-16, דני ל. 16-24');
  T.eq(r.names.join(','), 'דני כ,דני ל');
});

/* ---- whose shifts ---- */
T.test('two people with the same first name: the person\'s family name tells which, else the screen asks', () => {
  const r = p('ראשון: דני כ. 8-16, דני ל. 16-24\nשני: דני ל. 9-17');
  // "דני לוי": the one whose letter fits
  const o = SC.offer(r, { today, mine: ['דני לוי', 'דני'] });
  T.eq(o.who.join(), 'דני ל'); T.eq(brief(o.entries).join(' | '), 'd0 16:00 00:00 דני ל | d1 09:00 17:00 דני ל');
  // only "דני" known: both fit, none is taken, the screen asks (another worker's shift never lands by itself)
  const o2 = SC.offer(r, { today, mine: ['דני'] });
  T.ok(o2.ask); T.eq(o2.entries.length, 0);
  // the name chosen is that name only: choosing "דני ל" does not bring "דני כ" (the screen filtered by a fuzzy
  // match, and "דני" brought both)
  T.eq(SC.offer(r, { today, mine: [], who: ['דני ל'] }).entries.every((e) => e.who === 'דני ל'), true);
});
T.test('the week a message names: "לשבוע הבא" is next week, "השבוע" this one, whatever day it is today', () => {
  const r = p('סידור לשבוע הבא\nראשון 8-16');
  T.eq(SC.offer(r, { today, mine: [], text: 'סידור לשבוע הבא' }).week, '2026-11-22');
  T.eq(SC.offer(r, { today: '2026-11-19', mine: [], text: 'הסידור של השבוע' }).week, '2026-11-15');
  T.eq(SC.offer(r, { today: '2026-11-19', mine: [], text: '' }).week, '2026-11-22');
});

/* ---- tables (a picture's words) ---- */
const HEAD = ['שם'].concat(DAYS.slice(0, 5));
const DATES = [''].concat(['22/11', '23/11', '24/11', '25/11', '26/11']);
T.test('a table: a letter in a cell is the shift\'s name ("ב" בוקר, "ע" ערב, "ל" לילה), marked as a guess', () => {
  const r = SC.parseWords(table([HEAD, DATES, ['נדב', 'ב', 'ע', 'ל', '', 'ב'], ['מאיה', 'ע', '', 'ב', 'ב', '']]), { today });
  const mine = mineOf(r, ['נדב']);
  T.eq(brief(mine).join(' | '), '2026-11-22 07:00 15:00 נדב | 2026-11-23 15:00 23:00 נדב | 2026-11-24 23:00 07:00 נדב | 2026-11-26 07:00 15:00 נדב');
  T.ok(mine.every((e) => e.guess === 'named'));
});
T.test('a table with a role column and a totals column: neither is the name, the totals are no shifts', () => {
  const rows = [['שם', 'תפקיד'].concat(DAYS.slice(0, 3)).concat(['סה"כ']), ['', '', '22/11', '23/11', '24/11', ''],
    ['נדב', 'מלצר', '8-16', '16-24', 'חופש', '16'], ['מאיה', 'בר', '9-17', '', '8-16', '16']];
  const r = SC.parseWords(table(rows), { today });
  T.eq(r.names.join(','), 'נדב,מאיה');
  T.eq(brief(mineOf(r, ['נדב'])).join(' | '), '2026-11-22 08:00 16:00 נדב | 2026-11-23 16:00 00:00 נדב');
});
T.test('a table whose names could not be read is nobody\'s: nothing is offered from it', () => {
  const r = SC.parseWords(table([HEAD, DATES, ['', '8-16', '9-17', '', '', ''], ['', '16-24', '', '8-16', '', '']]), { today });
  T.eq(r.entries.length, 0); T.ok(r.nameless); T.ok(!r.personal);
});
T.test('the same name on two rows (two people called so): told apart, and the screen asks which', () => {
  const r = SC.parseWords(table([HEAD, DATES, ['נדב', '8-16', '', '', '', ''], ['מאיה', '9-17', '', '', '', ''], ['נדב', '', '16-24', '', '', '']]), { today });
  T.eq(r.names.join(','), 'נדב (1),מאיה,נדב (2)');
  const o = SC.offer(r, { today, mine: ['נדב'] });
  T.ok(o.ask); T.eq(o.entries.length, 0);
});
T.test('a two-week table: the second head under the first starts the week after', () => {
  const rows = [['שם'].concat(DAYS), ['נדב', '8-16', '', '9-17', '', '', '', ''], ['מאיה', '', '8-16', '', '', '', '', ''], [],
    ['שם'].concat(DAYS), ['נדב', '', '7-15', '', '', '', '', ''], ['מאיה', '9-17', '', '', '', '', '', '']];
  const r = SC.parseWords(table(rows, { colW: 100 }), { today });
  const rows2 = SC.rowsOf(mineOf(r, ['נדב']), '2026-11-22', 480);
  T.eq(rows2.map((x) => x.date + ' ' + x.start).join(), '2026-11-22 08:00,2026-11-24 09:00,2026-11-30 07:00');
});
T.test('a table whose head has day names only takes its dates from the title\'s period', () => {
  const words = table([['סידור 29/11-5/12'], [], HEAD, ['נדב', '8-16', '9-17', '', '', '']]);
  T.eq(brief(mineOf(SC.parseWords(words, { today }), ['נדב'])).join(' | '), '2026-11-29 08:00 16:00 נדב | 2026-11-30 09:00 17:00 נדב');
});
T.test('a tilted photo: the words are straightened before they are put in rows', () => {
  const words = table([HEAD, DATES, ['נדב', '8-16', '', '9-17', '', ''], ['מאיה', '', '16-24', '', '8-16', ''], ['יוסי', '7-15', '', '', '', '9-17']], { slope: 0.06 });
  const r = SC.parseWords(words, { today });
  T.eq(brief(mineOf(r, ['נדב'])).join(' | '), '2026-11-22 08:00 16:00 נדב | 2026-11-24 09:00 17:00 נדב');
  T.eq(brief(mineOf(r, ['יוסי'])).join(' | '), '2026-11-22 07:00 15:00 יוסי | 2026-11-26 09:00 17:00 יוסי');
});
T.test('a cell on two lines (a shift and a second one under it) stays in its row', () => {
  const r = SC.parseWords(table([HEAD, DATES, ['נדב', '7-11\n16-20', '8-16', '', '', ''], ['מאיה', '', '', '9-17', '', '']], { rowH: 50 }), { today });
  T.eq(brief(mineOf(r, ['נדב'])).join(' | '), '2026-11-22 07:00 11:00 נדב | 2026-11-22 16:00 20:00 נדב | 2026-11-23 08:00 16:00 נדב');
  T.eq(mineOf(r, ['מאיה']).length, 1);
});
T.test('a roster by shift type: a row per shift, the workers\' names in the cells', () => {
  const rows = [['משמרת'].concat(DAYS.slice(0, 4)), [''].concat(['22/11', '23/11', '24/11', '25/11']),
    ['בוקר\n07:00-15:00', 'נדב', 'מאיה', 'נדב, יוסי', ''], ['ערב\n15:00-23:00', 'מאיה', 'נדב', '', 'יוסי']];
  const r = SC.parseWords(table(rows, { rowH: 50, colW: 130 }), { today });
  T.eq(brief(mineOf(r, ['נדב'])).sort().join(' | '), '2026-11-22 07:00 15:00 נדב | 2026-11-23 15:00 23:00 נדב | 2026-11-24 07:00 15:00 נדב');
});
T.test('days down the side, a column per shift type with the names in the cells', () => {
  const rows = [['יום', 'בוקר 7-15', 'ערב 15-23'], ['ראשון 22/11', 'נדב', 'מאיה'], ['שני 23/11', 'מאיה', 'נדב'], ['שלישי 24/11', 'יוסי', 'מאיה']];
  const r = SC.parseWords(table(rows, { colW: 160 }), { today });
  T.eq(brief(mineOf(r, ['נדב'])).join(' | '), '2026-11-22 07:00 15:00 נדב | 2026-11-23 15:00 23:00 נדב');
});

/* ---- days down the side: a day's line must never be dated by a guess ---- */
T.test('days down the side: a day\'s name and its date a little apart (a slanted photo) are one day', () => {
  // B-photo: "23/1" (23/11 misread) sat 17 px over "שני", the date column apart from the names: the Monday lost its
  // date and landed in the week the screen guessed (16/11, a week too early)
  const w = (text, x, y) => ({ text, x0: x, x1: x + text.length * 9, y0: y, y1: y + 14 });
  const words = [w('יום', 560, 10), w('תאריך', 460, 10), w('נדב', 300, 10), w('מאיה', 160, 10),
    w('ראשון', 560, 50), w('22/11', 460, 50), w('8-16', 300, 50), w('9-17', 160, 50),
    w('23/1', 460, 85), w('7-15', 300, 85), w('שני', 560, 95),
    w('שלישי', 560, 130), w('24/11', 460, 130), w('9-17', 300, 130),
    w('25/11', 460, 170), w('8-16', 160, 170),
    w('חמישי', 560, 210), w('26/11', 460, 210), w('12-20', 300, 210)];
  const r = SC.parseWords(words, { today });
  T.eq(brief(mineOf(r, ['נדב'])).join(' | '), '2026-11-22 08:00 16:00 נדב | 2026-11-23 07:00 15:00 נדב | 2026-11-24 09:00 17:00 נדב | 2026-11-26 12:00 20:00 נדב');
  T.ok(r.entries.every((e) => e.date));
});
T.test('days down the side: a day\'s line OCR lost does not move the days under it a day', () => {
  // Wednesday's line is gone: Thursday sits where Wednesday would be. Its own name says Thursday: it is not
  // given Wednesday's date (left out rather than put on the wrong day)
  const rows = [['יום', 'נדב', 'מאיה'], ['ראשון 22/11', '8-16', '9-17'], ['שני 23/11', '7-15', ''], ['שלישי 24/11', '9-17', ''], ['חמישי', '12-20', '8-16']];
  const r = SC.parseWords(table(rows, { colW: 150 }), { today });
  const got = brief(mineOf(r, ['נדב']));
  T.ok(!got.some((x) => x.startsWith('2026-11-25')));
  T.eq(got.slice(0, 3).join(' | '), '2026-11-22 08:00 16:00 נדב | 2026-11-23 07:00 15:00 נדב | 2026-11-24 09:00 17:00 נדב');
});
T.test('a table\'s days are all dated or none is: an undated day never takes the screen\'s guessed week', () => {
  // days that skip, each with its own date but one: the one with no date is the first such day after the
  // dated day over it
  const rows = [['יום', 'נדב'], ['ראשון 22/11', '8-16'], ['שלישי', '9-17'], ['חמישי 26/11', '12-20']];
  const r = SC.parseWords(table(rows, { colW: 150, rowH: 60 }), { today });
  T.eq(brief(r.entries.filter((e) => e.who === 'נדב')).join(' | '), '2026-11-22 08:00 16:00 נדב | 2026-11-24 09:00 17:00 נדב | 2026-11-26 12:00 20:00 נדב');
  T.ok(!r.needsWeek);
});
T.test('a table whose head was found and whose rows could not be read gives nothing, not a reading as text', () => {
  // D-colour-photo: the roster's rows were not read; read as text, a date the slant left on a line of its own
  // headed them all, and three people's names made one "person" with a shift on 28/11
  const w = (text, x, y) => ({ text, x0: x, x1: x + text.length * 9, y0: y, y1: y + 14 });
  // the rows' hours far off the columns (a photo's perspective), so no row under the head can be read
  const words = [w('שם', 1060, 10), w('ראשון', 900, 10), w('שני', 780, 10), w('שלישי', 660, 10), w('רביעי', 540, 10),
    w('28/11', 420, 40),
    w('נדב', 1060, 80), w('8-16', 100, 80), w('מאיה', 1060, 130), w('9-17', 100, 130)];
  const r = SC.parseWords(words, { today });
  T.eq(r.entries.length, 0);
});

/* ---- a shift's name by its hours; what OCR does to hours ---- */
T.test('a shift\'s name right by its hours is their label: "בוקר 8-16" is one shift, not a made-up 07:00-15:00 beside it', () => {
  T.eq(brief(p('ראשון בוקר 8-16').entries).join(' | '), 'd0 08:00 16:00');
  T.eq(brief(p('שני: משמרת ערב (16-23)').entries).join(' | '), 'd1 16:00 23:00');
  T.eq(brief(p('שלישי: נדב בוקר, דני ערב').entries).join(' | '), 'd2 07:00 15:00 נדב | d2 15:00 23:00 דני');
});
/** A picture of a message: each line's words, right to left. */
const shot = (lines) => lines.flatMap((l, i) => {
  let x = 900;
  return l.split(' ').map((t) => { const w = { text: t, x0: x - t.length * 10, x1: x, y0: 20 + i * 50, y1: 36 + i * 50 }; x -= t.length * 10 + 12; return w; });
});
T.test('a picture: one digit glued to "סגירה" is no hour (OCR drops the 1 of 16), a typed one is', () => {
  // A-closing, H2-A-closing-mix: "16-סגירה" and "14-סגירה" were read "6-סגירה" and "4-סגירה" and offered at 06:00, 04:00
  T.eq(SC.parseWords(shot(['ראשון 6-סגירה', 'שני 16-סגירה']), { today }).entries.map((e) => e.dow + ' ' + e.start).join(), '1 16:00');
  T.eq(p('ראשון 6-סגירה').entries[0].start, '06:00');
  // H-A-mixed-cells: "18-סגירה" read "8סגירה" was offered as "סגירה" at its usual 15:00-23:00
  T.eq(SC.parseWords(shot(['ראשון 8סגירה', 'שני סגירה']), { today }).entries.map((e) => e.dow + ' ' + e.start + ' ' + e.guess).join(), '1 15:00 named');
});
T.test('a picture: a time whose minutes no schedule writes ("15:23") is the range OCR read a colon into, marked', () => {
  // H2-A-wall-glare: "15-23" read "15:23", offered 15:23-23:23
  const e = SC.parseWords(shot(['ראשון 15:23', 'שני 07:30']), { today }).entries;
  T.eq(e.map((x) => x.dow + ' ' + x.start + '-' + (x.end || '') + ' ' + x.guess).join(' | '), '0 15:00-23:00 ocr | 1 07:30- single');
});
T.test('a picture of a message: a line whose day OCR could not read is left out, not given the day above it', () => {
  // H-W-whatsapp-light: "ב׳" read "12\"-", "ד׳" read "ד", "ה׳" read "הי": their shifts went to Sunday and Tuesday
  const words = shot(['סידור לשבוע הבא', 'א׳ - יוסי 7-15 נדב 15-23', '12"- נדב 7-15 יוסי 15-23', 'ג׳ - שירה 7-15', 'ד נדב 9-17', 'הי - שירה 7-15 נדב 15-23']);
  const r = SC.parseWords(words, { today });
  T.eq(brief(r.entries.filter((e) => e.who === 'נדב')).join(' | '), 'd0 15:00 23:00 נדב | d3 09:00 17:00 נדב');
  // typed, a line under a day's own line is still that day's (nothing was lost on the way)
  T.eq(brief(p('ראשון: דני 8-16\nמאיה 16-24').entries).join(' | '), 'd0 08:00 16:00 דני | d0 16:00 00:00 מאיה');
});
T.test('a row starts ticked unless the app has that shift already or it is over a week ago (last year\'s photo)', () => {
  // A-old-photo: a schedule photographed a year ago was offered ticked and would be saved as shifts worked
  T.ok(SC.startsOn({ date: '2026-11-16' }, today, false));
  T.ok(SC.startsOn({ date: '2026-11-10' }, today, false));
  T.ok(!SC.startsOn({ date: '2026-11-09' }, today, false));
  T.ok(!SC.startsOn({ date: '2025-11-23' }, today, false));
  T.ok(!SC.startsOn({ date: '2026-11-22' }, today, true));
});

/* ---- round 2: the intake session's findings in these files (18 Nov 2026) ---- */
T.test('a range a narrow cell wrapped ("08:00-" over "16:00") is one shift of one row, not two rows and two starts', () => {
  // intake sched.wrapped.png: 1.40.1 offered 8 one-time starts (16:00, 23:00 as shifts of their own); the first
  // fix of this campaign took the two lines for two nameless rows and offered nothing
  const rows = [['ראשון 22/11', 'שני 23/11', 'שלישי 24/11', 'רביעי 25/11', 'חמישי 26/11'], ['08:00-\n16:00', '08:00-\n16:00', '', '16:00-\n23:00', '07:00-\n15:00']];
  const r = SC.parseWords(table(rows, { rowH: 60 }), { today });
  T.ok(r.personal);
  T.eq(brief(r.entries).join(' | '), '2026-11-22 08:00 16:00 | 2026-11-23 08:00 16:00 | 2026-11-25 16:00 23:00 | 2026-11-26 07:00 15:00');
  // two nameless rows that do not wrap stay two rows: nobody's
  const two = [['ראשון 22/11', 'שני 23/11'], ['08:00-16:00', '09:00-17:00'], ['16:00-23:00', '']];
  T.eq(SC.parseWords(table(two, { rowH: 40 }), { today }).entries.length, 0);
});
T.test('the schedule import: a read that ends after its sheet was closed draws, plays and says nothing; the picker is keyboard-reachable', () => {
  // intake S1 (the sound and the error landed on another screen) and S4 (a hidden input: no Tab, no button)
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/app/schedule-import.js'), 'utf8');
  T.ok(/function parse\(read\) \{\s*(?:\/\/[^\n]*\n\s*)*if \(entry\.closed\) return;/.test(src), 'parse() stops first when the sheet is closed');
  const body = (name) => src.slice(src.indexOf('async function ' + name), src.indexOf('\n    }\n', src.indexOf('async function ' + name)));
  for (const fn of ['fromFile', 'viaClaude']) {
    const b = body(fn);
    T.ok(/catch \(e\) \{\s*console\.warn\([^)]*\);\s*if \(entry\.closed\) return;/.test(b), fn + ': its failure is not shown on another screen');
    // every awaited step that is not the confirm dialog is followed by the check
    const awaits = b.split('\n').filter((l) => /await /.test(l) && !/viaClaude\(file\)/.test(l));
    T.ok(awaits.every((l) => b.indexOf('if (entry.closed) return;', b.indexOf(l)) > -1), fn + ': checked after each await');
  }
  T.ok(/<input type="file" id="sc-file"(?![^>]*\bhidden\b)[^>]*class="sr"/.test(src), 'the file input is visually hidden, not hidden');
});
