/* The hours import review (src/app/import.js) and the hours check screen (src/app/hours-check.js): guards for the
 * readers campaign fixes (Nov 2026) that live in the screens. The behaviour itself is driven in the real app by the
 * benches in shaati-handoff/readers/work/import (imp-review.cjs, hc-flow.cjs); these keep each rule in the code.
 * Loaded from hourscheck.test.js. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const imp = read('src/app/import.js'), hc = read('src/app/hours-check.js');

T.section('hours import and hours check: screen rules (readers campaign)');
T.test('both screens join a night cut at midnight through the one tested joiner', () => {
  T.ok(/root\.HoursCheck\.joinNights\(rows\)/.test(imp), 'import.js');
  T.ok(/return root\.HoursCheck\.joinNights\(rows\);/.test(hc), 'hours-check.js');
  T.ok(!/function joinNights/.test(imp + hc), 'no second copy in a screen');
});
T.test('import: a row is saved by the clock the report prints (not start + hours: the clocks-change nights)', () => {
  T.ok(/let end = toEpoch\(r\.date, r\.end\);\s*if \(end <= start\) end = toEpoch\(U\.addDays\(r\.date, 1\), r\.end\);/.test(imp));
});
T.test('import: a row the reader doubted starts left out and is marked', () => {
  T.ok(/r\.on = !\(t && t\.taken\) && !r\.doubt;/.test(imp));
  T.ok(imp.includes('r.doubt ? `<i class="tag">${TO_CHECK}</i>`') && imp.includes("const TO_CHECK = 'לבדיקה';"));
  T.ok(hc.includes('doubtful(it) ? `<i class="tag">${TO_CHECK}</i>`') && hc.includes("const TO_CHECK = 'לבדיקה';"));
});
T.test('import: a row over a shift that is there asks first; a second tap adds nothing', () => {
  T.ok(/if \(clash && !\(await UI\.confirm\(/.test(imp), 'the overlap question');
  T.ok(/if \(adding\) return;/.test(imp) && /adding = true;/.test(imp), 'one save');
  T.ok(/r\.mine = true;/.test(imp) && /if \(!r\.mine\) r\.on = null;/.test(imp), 'a row I turned off stays off when the job changes');
});
T.test('hours check: never "the same" while a row has no exit read', () => {
  T.ok(/const shown = \(it\) => it\.type !== 'ok' \|\| it\.unread;/.test(hc));
  T.ok(/const bad = res\.items\.filter\(shown\);/.test(hc));
  T.ok(/missingMine' && role && !it\.unread/.test(hc), 'no shift and no money for a row of unknown length');
});
T.test('hours check: "add to my shifts" only for a row with its own times, never over the running shift', () => {
  T.ok(/it\.canAdd = !!\(it\.rep\.start && it\.rep\.end\);/.test(hc));
  T.ok(/it\.trial && it\.canAdd \?/.test(hc) && /!it\.trial \|\| !it\.canAdd\) return;/.test(hc));
  T.ok(/a\.employerId === emp\.id && a\.start < t\.end && Date\.now\(\) > t\.start\) return;/.test(hc));
});
