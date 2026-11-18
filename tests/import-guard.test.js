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
  T.ok(/const out = root\.HoursCheck\.joinNights\(rows\);/.test(hc), 'hours-check.js');
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
T.test('round 2: leaving stops the reading; the picker is a control; files by their bytes; OCR text never re-read as lines', () => {
  for (const s of [imp, hc]) { T.ok(/onClose: \(\) => \{ if \(stop\) stop\.abort\(\); \}/.test(s)); T.ok(/if \(entry\.closed\) return;/.test(s)); T.ok(/<input type="file" id="(imp|hc)-file" class="sr"/.test(s)); }
  T.ok(/async function sniff\(file\)/.test(imp) && /const kind = await sniff\(file\);/.test(imp));
  T.ok(imp.includes("got.source === 'ocr' ? { result: res, text } : text"));
  T.ok(/const breakOf = \(r\) =>/.test(imp) && /breakMin: b, breakPaid: b != null \? false/.test(imp));
});
T.test('hours check: a doubted finding is tagged, not summed and not counted as a claim', () => {
  T.ok(hc.includes('const doubtful = (it) => !!it.doubt;'));
  T.ok(hc.includes("!x.doubt && (x.type === 'missingEmp' || (x.type === 'diff' && x.worth > 0))"));
  T.ok(hc.includes("(x.type === 'missingEmp' || x.type === 'diff') && !x.doubt).length"));
});
T.test('round 3: "mark all" skips doubted rows; both tags; paid only when trusted; unread rows reach the check', () => {
  T.ok(imp.includes('const allOn = () => rows.every((r) => r.on || r.doubt);') && imp.includes('if (all || !r.doubt) { r.on = !all;'));
  T.ok(!imp.includes('rows.every((r) => r.on)'));
  T.ok(imp.includes("(t && t.taken ? '<i class=\"tag\">כבר קיימת</i>' : '') + (r.doubt ?"), 'both tags');
  T.ok(imp.includes('paidSure = root.HoursCheck.paidOk(rows);') && imp.includes('!paidSure.has(r)'));
  T.ok(hc.includes('out.unreadRows = Math.max((+p.undated || 0) + (+p.skipped || 0), droppedOf(') && hc.includes('to: per.to, unreadRows }'));
});
T.test('round 3: the check counts report lines with an entry and an exit that gave no row (a garbled date)', () => {
  const vm = require('vm');
  const src = hc.slice(hc.indexOf('  function droppedOf('), hc.indexOf('  /** The report\'s rows, each once, in order. */'));
  const ctx = {}; vm.runInNewContext(src + '; this.droppedOf = droppedOf;', ctx);
  T.eq(ctx.droppedOf('01/11/2026 08:00 16:00\n0?/1l 08:00 16:00\n06/11/2026 08:00 16:00', 2), 1);
  T.eq(ctx.droppedOf('01/11/2026 08:00 16:00\nסה"כ 16.00 8.00\n02/11/2026 08:00 12:00 16:00 20:00', 2), 0, 'decimals and a split day are not dropped rows');
  T.ok(hc.includes('droppedOf(typeof got === \'string\' ? got : got.text, (p.rows || []).length)'));
});
