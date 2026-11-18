/* The readers campaign's texts (18 Nov 2026): what a file that does not open says, the reading engine's loading line,
 * the note for a long PDF, the hours check's words for rows without an exit, and the file pickers a keyboard reaches.
 * One table of reasons (app/docread.js DocRead.trouble) serves every reader; these tests keep each reader on it. */
const fs = require('fs');
const path = require('path');
const T = require('./t.js');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
require(path.join(__dirname, '..', 'src', 'app', 'docread.js'));
const DR = globalThis.DocRead;

T.section('readers: what a file that does not open says');
T.test('each reason has its own sentence; an unknown error leaves the reader its general one', () => {
  const heic = DR.trouble({ name: 'DocReadError', code: 'docread/heic' });
  T.ok(/HEIC/.test(heic) && /צילום מסך/.test(heic), 'HEIC: a screenshot or JPG');
  T.ok(/נעול בסיסמה/.test(DR.trouble({ name: 'PasswordException', code: 1 })), 'pdf.js: a password');
  T.ok(/ריק או פגום/.test(DR.trouble({ name: 'InvalidPDFException' })), 'pdf.js: a broken PDF');
  T.ok(/ריק או פגום/.test(DR.trouble({ code: 'docread/empty' })) && /ריק או פגום/.test(DR.trouble({ code: 'docread/unreadable' })), 'empty, or a picture that does not open');
  T.ok(/עוד לא ירד לטלפון/.test(DR.trouble({ name: 'NotReadableError' })) && /עוד לא ירד לטלפון/.test(DR.trouble({ code: 'docread/not-on-phone' })), 'a cloud file not on the phone');
  T.eq(DR.trouble({ name: 'AbortError' }), '', 'leaving is not a failure');
  T.eq(DR.trouble(new Error('Something broke')), '', 'an English exception text never becomes the message');
  T.eq(DR.trouble({ code: 12 }), '', 'a DOMException number is no code of ours');
  T.eq(DR.trouble(null), '');
});
T.atest('a file is checked before it is read: no bytes, or bytes that do not come', async () => {
  const code = async (f) => { try { await DR.check(f); return 'ok'; } catch (e) { return e.code; } };
  T.eq(await code(new Blob([])), 'docread/empty');
  T.eq(await code(new Blob(['%PDF-1.4'])), 'ok');
  class NotHere extends Blob { slice() { return { arrayBuffer: () => Promise.reject(Object.assign(new Error('The requested file could not be read'), { name: 'NotReadableError' })) }; } }
  T.eq(await code(new NotHere(['x'.repeat(100)])), 'docread/not-on-phone');
  T.eq(await code(null), 'ok', 'not a file: left to the reader');
});
T.test('every reader checks the file first and explains a failure through the one table', () => {
  const imp = read('src/app/import.js'), hc = read('src/app/hours-check.js'), sc = read('src/app/schedule-import.js'), ps = read('src/app/views-payslip.js');
  T.ok(/async function readFile\(file, progress, opts\) \{[\s\S]{0,200}await root\.DocRead\.check\(file\)/.test(imp), 'hours import and hours check (readFile)');
  T.ok(/App\.readDocWords = async function[\s\S]{0,120}await root\.DocRead\.check\(file\)/.test(ps), 'readDocWords (schedule)');
  T.ok(/async function extractSlip\(file, progress, signal\) \{\s*if \(root\.DocRead\) await root\.DocRead\.check\(file\)/.test(ps), 'payslip');
  T.ok(imp.includes("UI.invalid(root.DocRead.trouble(e) || (root.U.ours(e)"), 'import catch');
  T.ok(hc.includes("UI.invalid(root.DocRead.trouble(e) || (U.ours(e)"), 'hours check catch');
  T.eq((sc.match(/root\.DocRead\.trouble\(e\) \|\| \(root\.U\.ours\(e\)/g) || []).length, 2, 'schedule: the reader and Claude');
  T.ok(ps.includes("UI.toast((root.DocRead && root.DocRead.trouble(e)) || (root.U.ours(e)"), 'payslip catch');
  // a PDF named "report_pdf" is no PDF
  T.ok(!ps.includes('/.pdf$/i'), 'every .pdf test escapes its dot');
});

T.section('readers: the reading engine loading line');
T.test('the first time it says it downloads (a moving percent only), later that it prepares', () => {
  const lt = DR.pure.loadingText;
  const store = {};
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } });
  try {
    T.ok(/^מוריד את מנוע הקריאה, רק בפעם הראשונה/.test(lt('eng', 0)) && !/%/.test(lt('eng', 0)), 'no 0% standing still');
    T.ok(/… 50%$/.test(lt('eng', 50)), 'the percent while it moves');
    T.ok(!/%/.test(lt('eng', 100)), 'no 100% left on screen');
    store['shaati.ocrLangs'] = 'eng';
    T.eq(lt('eng', 50), 'מכין את מנוע הקריאה…', 'eng is on the phone');
    T.ok(/^מוריד/.test(lt('heb+eng', 0)), 'heb is not yet');
    store['shaati.ocrLangs'] = 'eng,heb';
    T.eq(lt('heb+eng', 0), 'מכין את מנוע הקריאה…');
  } finally { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage; }
  const src = read('src/app/docread.js');
  T.ok(/gotLangs\(lang\); \/\/ its languages are on the phone now/.test(src), 'remembered once the worker has them');
  T.ok(!/~10MB/.test(src + read('src/app/views-payslip.js')), 'the old line (wrong size, every read) is gone');
});
T.test('the payslip announces the stage and hides the percent from a screen reader', () => {
  const ps = read('src/app/views-payslip.js');
  const m = /const m = (\/\^\(\.\*\?\)\(.*?\)\$\/)\.exec\(String\(t\)\);/.exec(ps);
  T.ok(m, 'the split is there');
  const rx = new RegExp(m[1].slice(1, -1)); // the source's own pattern, as written
  const got = rx.exec('קורא את המילים… 37%');
  T.ok(got && got[1] === 'קורא את המילים…' && got[2] === ' 37%', 'the percent is split off (the regex had lost its backslashes)');
});

T.section('readers: a long PDF and rows without an exit');
T.test('the same 8 pages for the text and the table, and each import says when pages were left', () => {
  const ps = read('src/app/views-payslip.js'), imp = read('src/app/import.js'), hc = read('src/app/hours-check.js'), sc = read('src/app/schedule-import.js');
  T.ok(/Math\.min\(doc\.numPages, 8\); p\+\+\) \{ \/\/ the same 8 pages/.test(ps) && /const pagesRead = Math\.min\(doc\.numPages, 8\);/.test(ps), 'readDocText and readDocWords');
  const note = 'קראנו את ${capped.pagesRead} העמודים הראשונים מתוך ${capped.pages}. את השאר אפשר להעלות בקובץ נפרד.';
  T.ok(imp.includes(note) && hc.includes(note), 'hours import and hours check');
  T.ok(sc.includes('קראנו את ${res.pagesRead} העמודים הראשונים מתוך ${res.pages}.') && sc.includes('pages: got.pages, pagesRead: got.pagesRead'), 'schedule');
  T.ok(/const capped = got\.pages > got\.pagesRead/.test(imp) && /capped = got && got\.pages > got\.pagesRead \? got : null;/.test(imp) && /capped = got && got\.pages > got\.pagesRead \? got : null;/.test(hc), 'carried from the reader to the screen');
});
T.test('hours check: rows without an exit say why the report cannot be called the same; the footnote says the real rule', () => {
  const hc = read('src/app/hours-check.js');
  T.ok(hc.includes("!bad.every((x) => x.unread) ? 'כדאי לבדוק'"), 'doubted rows keep "worth checking"');
  T.ok(hc.includes('בשורה אחת בדוח לא קראתי את שעת היציאה') && hc.includes('ב-${bad.length} שורות בדוח לא קראתי את שעת היציאה'), 'one row, several rows');
  // the footnote's numbers are the compare's: 10 minutes each, half an hour over the report
  T.eq(globalThis.HoursCheck.TOL, 10); T.eq(globalThis.HoursCheck.DRIFT, 30);
  T.ok(hc.includes('הפרש של עד 10 דקות נחשב תואם, אלא אם ההפרשים הקטנים מצטברים בדוח ליותר מחצי שעה לטובת המעסיק.'));
});

T.section('readers: file pickers a keyboard reaches');
T.test('every file picker is visually hidden (.sr), never hidden, and its button shows the keyboard ring', () => {
  const files = fs.readdirSync(path.join(__dirname, '..', 'src', 'app')).filter((f) => f.endsWith('.js'));
  let n = 0;
  for (const f of files) {
    const s = read('src/app/' + f);
    for (const m of s.matchAll(/<input type="file"[^>]*>/g)) { n++; T.ok(/class="sr"/.test(m[0]) && !/\shidden[\s>]/.test(m[0]), f + ': ' + m[0].slice(0, 60)); }
    T.ok(!/\.hidden = false; \w+\.classList\.add\('sr'\)/.test(s), f + ': no picker un-hidden after drawing');
  }
  T.ok(n >= 6, 'the six pickers (payslip x2, hours import, hours check, schedule, backup): ' + n);
  const css = read('src/styles.css'), v3 = read('src/styles-v3.css');
  T.ok(/\.sr \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect\(0 0 0 0\); \}/.test(css), '.sr hides visually and stays in the page');
  T.ok(/label\.btn:has\(> input\.sr:focus-visible\) \{ outline: 3px solid/.test(v3), 'the ring on the label');
});
T.test('the payslip finding for a raise not paid on every hour is translated', () => {
  const ps = read('src/core/payslip.js');
  const at = ps.indexOf("title: 'התעריף החדש לא שולם על כל השעות'");
  T.ok(at > 0 && !/i18n-keep/.test(ps.slice(at - 300, at + 900)), 'no keep around it');
  for (const l of ['en', 'ru', 'ar', 'fr', 'es', 'am']) T.ok(typeof JSON.parse(read('i18n/' + l + '.json'))['התעריף החדש לא שולם על כל השעות'] === 'string', l);
});
