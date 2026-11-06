/* The pure parts of the end-of-shift moment, the youth-law guard and the salary question (src/core/moments.js). */
const T = require('./t.js');
const M = globalThis.Moments;
const U = globalThis.U;
const Engine = globalThis.Engine;
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi || 0).getTime();
const res = (o) => Object.assign({ paidMin: 480, base: 320, wage: 320, restPremium: 0, otPremium: 0, nightPremium: 0, evePremium: 0, specialPremium: 0, seniority: 0, minTopUp: 0, restLabels: [] }, o);

T.section('the end of a shift: what made the wage');
T.test('a Shabbat shift: "of it, ₪137 for Shabbat"', () => {
  T.eq(M.wageLine(res({ restPremium: 137.4, wage: 457, restLabels: ['שבת'] })), `מזה ${U.money(137, 0)} על שבת`);
});
T.test('a holiday takes its own name', () => {
  T.eq(M.wageLine(res({ restPremium: 90, restLabels: ['ראש השנה'] })), `מזה ${U.money(90, 0)} על ראש השנה`);
});
T.test('the biggest premium first, and a second one when it is worth 5 or more', () => {
  T.eq(M.wageLine(res({ otPremium: 25, nightPremium: 60 })), `מזה ${U.money(60, 0)} על שעות לילה ו-${U.money(25, 0)} על שעות נוספות`);
  T.eq(M.wageLine(res({ otPremium: 3, nightPremium: 60 })), `מזה ${U.money(60, 0)} על שעות לילה`);
});
T.test('overtime alone', () => {
  T.eq(M.wageLine(res({ otPremium: 40 })), `מזה ${U.money(40, 0)} על שעות נוספות`);
});
T.test('nothing extra: the rate an hour', () => {
  T.eq(M.wageLine(res({ paidMin: 240, base: 160 })), `${U.money(40)} לשעה`);
});
T.test('under a shekel is not a reason; an empty shift has no line', () => {
  T.eq(M.wageParts(res({ otPremium: 0.4 })).length, 0);
  T.eq(M.wageLine(res({ paidMin: 0, base: 0 })), '');
  T.eq(M.wageLine(null), '');
});
T.test('quiet hours: 23:00 to 06:00', () => {
  T.ok(M.quietHour(at(2026, 11, 6, 23, 0)));
  T.ok(M.quietHour(at(2026, 11, 7, 2, 30)));
  T.ok(M.quietHour(at(2026, 11, 7, 5, 59)));
  T.ok(!M.quietHour(at(2026, 11, 7, 6, 0)));
  T.ok(!M.quietHour(at(2026, 11, 6, 22, 59)));
});

T.section('the youth law while a shift runs');
const R16 = Engine.youthRules(16, 5), R15 = Engine.youthRules(15, 5);
const y = (o) => M.youthNow(Object.assign({ age: 16, rules: R16, dayMin: 0 }, o));
T.test('an adult, or no age: nothing', () => {
  T.eq(M.youthNow({ age: 18, rules: R16, now: at(2026, 11, 6, 21, 30), start: at(2026, 11, 6, 17), workMin: 60 }), null);
  T.eq(M.youthNow({ age: null, rules: R16, now: at(2026, 11, 6, 21, 30), start: at(2026, 11, 6, 17), workMin: 60 }), null);
});
T.test('16: nothing at 20:59, "finish by 22:00" from 21:00', () => {
  T.eq(y({ now: at(2026, 11, 6, 20, 59), start: at(2026, 11, 6, 18), workMin: 179 }), null);
  const a = y({ now: at(2026, 11, 6, 21, 0), start: at(2026, 11, 6, 18), workMin: 180 });
  T.eq(a.rule, 'night'); T.eq(a.phase, 'soon'); T.eq(a.text, 'לפי החוק, בגילך צריך לסיים עד 22:00');
  T.eq(a.at, at(2026, 11, 6, 22, 0));
});
T.test('15: the night starts at 20:00', () => {
  const a = M.youthNow({ age: 15, rules: R15, now: at(2026, 11, 6, 19, 15), start: at(2026, 11, 6, 16), dayMin: 0, workMin: 195 });
  T.eq(a.text, 'לפי החוק, בגילך צריך לסיים עד 20:00');
});
T.test('inside the night: after 22:00 (and after midnight for an evening shift), before 06:00 for a morning one', () => {
  T.eq(y({ now: at(2026, 11, 6, 22, 10), start: at(2026, 11, 6, 18), workMin: 250 }).text, 'לפי החוק, בגילך לא עובדים אחרי 22:00');
  T.eq(y({ now: at(2026, 11, 7, 0, 30), start: at(2026, 11, 6, 18), workMin: 30 }).text, 'לפי החוק, בגילך לא עובדים אחרי 22:00');
  const m = y({ now: at(2026, 11, 7, 5, 30), start: at(2026, 11, 7, 5, 0), workMin: 30 });
  T.eq(m.phase, 'now'); T.eq(m.text, 'לפי החוק, בגילך לא עובדים לפני 06:00');
});
T.test('the day\'s hours: half an hour before the limit, with the time; after it, "you passed 9 hours"', () => {
  // 16 at a five-day workplace: 9 hours a day
  T.eq(R16.dayHours, 9);
  T.eq(y({ now: at(2026, 11, 6, 15, 0), start: at(2026, 11, 6, 7), workMin: 509 }), null);
  const s = y({ now: at(2026, 11, 6, 15, 0), start: at(2026, 11, 6, 7), workMin: 515 });
  T.eq(s.rule, 'day'); T.eq(s.phase, 'soon'); T.eq(s.text, 'ב-15:25 יהיו לך 9 שעות היום, המקסימום לפי החוק בגילך');
  const o = y({ now: at(2026, 11, 6, 16, 5), start: at(2026, 11, 6, 7), workMin: 541 });
  T.eq(o.phase, 'now'); T.eq(o.text, 'עברת 9 שעות היום. לפי החוק, בגילך זה המקסימום');
});
T.test('an earlier shift the same day counts toward the day', () => {
  const s = M.youthNow({ age: 15, rules: R15, now: at(2026, 11, 6, 17, 0), start: at(2026, 11, 6, 13), dayMin: 240, workMin: 240 });
  T.eq(s.rule, 'day'); T.eq(s.phase, 'now'); T.eq(s.text, 'עברת 8 שעות היום. לפי החוק, בגילך זה המקסימום');
});
T.test('both at once: a limit passed comes before one that is near; both are listed (one note each)', () => {
  const b = y({ now: at(2026, 11, 6, 21, 10), start: at(2026, 11, 6, 11), workMin: 560 });
  T.eq(b.rule, 'day'); T.eq(b.phase, 'now'); T.eq(b.all.map((x) => x.rule + '-' + x.phase).join(','), 'day-now,night-soon');
  const n = y({ now: at(2026, 11, 6, 22, 30), start: at(2026, 11, 6, 13), workMin: 560 });
  T.eq(n.rule, 'night');
});

T.section('did the salary arrive?');
T.test('asked on pay day from noon, for a week', () => {
  T.eq(M.salaryState(null, '2026-11-09', '2026-11-09', 11), null);
  T.eq(M.salaryState(null, '2026-11-09', '2026-11-09', 12), 'ask');
  T.eq(M.salaryState(null, '2026-11-09', '2026-11-08', 15), null);
  T.eq(M.salaryState(null, '2026-11-09', '2026-11-12', 8), 'ask');
  T.eq(M.salaryState(null, '2026-11-09', '2026-11-17', 15), null);
});
T.test('answered: yes is the end; "not yet" asks again the next day; another amount shows its gap until closed', () => {
  T.eq(M.salaryState({ a: 'yes', d: '2026-11-09' }, '2026-11-09', '2026-11-10', 13), null);
  T.eq(M.salaryState({ a: 'not', d: '2026-11-09' }, '2026-11-09', '2026-11-09', 18), null);
  T.eq(M.salaryState({ a: 'not', d: '2026-11-09' }, '2026-11-09', '2026-11-10', 9), 'ask');
  T.eq(M.salaryState({ a: 'other', d: '2026-11-09' }, '2026-11-09', '2026-11-10', 9), 'gap');
  T.eq(M.salaryState({ a: 'other', d: '2026-11-09', closed: true }, '2026-11-09', '2026-11-10', 9), null);
});
T.test('the gap: less or more, and a few shekels count as the same', () => {
  T.eq(JSON.stringify(M.salaryGap(3200, 2950)), JSON.stringify({ diff: -250, less: true, small: false }));
  T.eq(M.salaryGap(3200, 3300).less, false);
  T.ok(M.salaryGap(3200, 3190).small);
  T.ok(!M.salaryGap(800, 770).small);
});

T.section('one night rule (23:00 to 06:00)');
T.test('the night is said once: every quiet-at-night choice asks Moments.quietHour', () => {
  const fs = require('fs'), path = require('path');
  const dir = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => path.join(d, f));
  const files = [...dir(path.join(__dirname, '..', 'src', 'core')), ...dir(path.join(__dirname, '..', 'src', 'app'))];
  const own = files.filter((f) => !f.endsWith('moments.js') && fs.readFileSync(f, 'utf8').split('\n').some((l) => /getHours\(\)/.test(l) && /(>=?\s*2[0-3]\b|<\s*[5-7]\b)/.test(l)));
  T.eq(own.map((f) => path.basename(f)).join(','), '');
  T.ok(M.quietHour(new Date(2026, 0, 1, 23, 30).getTime()) && M.quietHour(new Date(2026, 0, 1, 5, 59).getTime()));
  T.ok(!M.quietHour(new Date(2026, 0, 1, 6, 0).getTime()) && !M.quietHour(new Date(2026, 0, 1, 22, 59).getTime()));
});
