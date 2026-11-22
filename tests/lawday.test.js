/* Guard (22 Nov 2026): the law's full working day is 8.6 hours in a five-day week and 8 in a six-day one. The payslip
 * screen asked a six-day worker about "8.6 hours a day". Every text takes the number from Engine.lawDayHours, or names
 * both weeks; a bare 8.6 in a Hebrew text fails here. */
const { Engine, Defaults } = globalThis;
const T = require('./t.js');

T.section('the law\'s working day follows the work week');
T.test('Engine.lawDayHours: 8.6 in a five-day week, 8 in a six-day one; otDayHours agrees on a weekday', () => {
  const s = Defaults.defaultSettings();
  s.leave = Object.assign({}, s.leave, { workWeek: 5 });
  T.eq(Engine.lawDayHours(s), 8.6);
  T.eq(Engine.otDayHours({ otLaw: true }, s, '2026-12-06', false), 8.6);
  s.leave.workWeek = 6;
  T.eq(Engine.lawDayHours(s), 8);
  T.eq(Engine.otDayHours({ otLaw: true }, s, '2026-12-06', false), 8);
  T.eq(Engine.otDayHours({ otLaw: true }, s, '2026-12-11', false), 7, 'Friday in a six-day week');
  T.eq(Engine.lawDayHours({}), 8.6, 'no setting = five-day week');
});
T.test('no Hebrew text in src names 8.6 hours alone (without the six-day week or the setting)', () => {
  const fs = require('fs'), path = require('path');
  const bad = [];
  for (const dir of ['core', 'app']) {
    const d = path.join(__dirname, '..', 'src', dir);
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.js') || /^(timesheet|schedule)\.js$/.test(f)) continue;
      fs.readFileSync(path.join(d, f), 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (!/8\.6/.test(code) || !/[\u0590-\u05ff]/.test(code) || /^\s*\*/.test(line)) return;
        if (/6 ימים|workWeek/.test(code)) return; // both weeks named, or chosen by the setting
        bad.push(dir + '/' + f + ':' + (i + 1));
      });
    }
  }
  T.eq(bad.length, 0, bad.join(', '));
});
