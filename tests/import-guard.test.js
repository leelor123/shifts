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

// the screen additions the readers campaign left (Nov 2026): rows not read, doubted rows in the save button, a planned
// shift a row makes done, a long PDF read in part
T.test('both screens say how many report rows were not read, under the period line, in the right number form', () => {
  const vm = require('vm');
  const line = imp.split('\n').find((l) => l.includes('App.unreadRowsNote = (n) =>'));
  T.ok(line, 'one note for both screens');
  const ctx = { App: {}, icon: () => '<svg></svg>' };
  vm.runInNewContext(line, ctx);
  T.ok(ctx.App.unreadRowsNote(1).includes('שורה אחת בדוח לא נקראה בבירור. כדאי לבדוק אותה בדוח עצמו.'), 'one row');
  T.ok(ctx.App.unreadRowsNote(2).includes('2 שורות בדוח לא נקראו בבירור. כדאי לבדוק אותן בדוח עצמו.'), 'two rows');
  T.ok(ctx.App.unreadRowsNote(7).includes('7 שורות בדוח'), 'many rows');
  // where: right under the period line of each screen, and only when a row was missed
  T.ok(/data-imp-all>\$\{allOn\(\) \? 'לבטל הכול' : 'לסמן הכול'\}<\/button><\/div>\s*\$\{unread \? App\.unreadRowsNote\(unread\) : ''\}\s*<div class="imp-list">/.test(imp), 'import: under the dates line');
  T.ok(/<div class="hc-period small muted">[^\n]*<\/div>\s*\$\{unreadRows \? App\.unreadRowsNote\(unreadRows\) : ''\}\s*<div class="kpis/.test(hc), 'check: under the period line');
  // the import counts what its own notes do not: an entry without an exit already has its note (noExit)
  T.ok(imp.includes('unread = Math.max(+p.undated || 0, App.droppedRows ? App.droppedRows(text, (p.rows || []).length) : 0);'));
  T.ok(hc.includes('App.droppedRows = droppedOf;'), 'one counter of dropped lines for both screens');
});
T.test('import: the add button says how many of the rows it adds are doubted', () => {
  const line = imp.split('\n').find((l) => l.includes('const unsure = '));
  T.ok(line && imp.includes("${unsure ? ' ' + unsure : ''}`;") && imp.includes('const k = adds.filter((r) => r.doubt).length;'));
  const unsure = (n, k) => new Function('n', 'k', line.trim() + ' return unsure;')(n, k);
  T.eq(unsure(5, 0), '', 'no doubted row: nothing more');
  T.eq(unsure(1, 1), '(לבדיקה)', 'one shift, and it is doubted');
  T.eq(unsure(5, 1), '(אחת לבדיקה)', 'one of several');
  T.eq(unsure(5, 2), '(2 לבדיקה)', 'two');
  T.eq(unsure(5, 4), '(4 לבדיקה)', 'more');
  // counted from the rows the button adds (on, with a start), as n is
  T.ok(imp.includes('const adds = rows.filter((r) => r.on && (r.start || startFor));') && imp.includes('const n = adds.length;'));
});
T.test('import: a row that makes a planned shift done says so, on the one row that does it', () => {
  T.ok(imp.includes('(t && t.planned ? `<i class="tag" data-imp-plan="${esc(t.planned.id)}">תסומן כבוצעה</i>` : \'\')'));
  // add() turns the planned shift done from the first row turned on; the tag follows the same rule
  T.ok(imp.includes("const lead = tags.find((tg) => rows[+tg.closest('.imp-row').dataset.i].on) || tags[0];"));
  T.ok(/if \(t\.planned && !turned\.has\(t\.planned\.id\)\) \{/.test(imp));
});
T.test('both screens: a PDF longer than the pages read says how many were read, with the real numbers', () => {
  const note = 'קראנו את ${capped.pagesRead} העמודים הראשונים מתוך ${capped.pages}. את השאר אפשר להעלות בקובץ נפרד.';
  T.ok(imp.includes(note) && hc.includes(note));
  T.ok(imp.includes('const capped = got.pages > got.pagesRead ? { pages: got.pages, pagesRead: got.pagesRead } : null;'), 'readFile carries both numbers');
});
