/* ============================================================
 * import.js — "I already have an hours report": a file in any usual shape (Excel, CSV, PDF, a photo or a
 * screenshot, text) or pasted text becomes shifts.
 *
 * Read on the phone (nothing is sent anywhere): a spreadsheet with SheetJS (its date cells read as dates,
 * so no day/month mix-up), a PDF with pdf.js, a picture with the Hebrew OCR the payslip check uses, text
 * as it is (also in the Hebrew Windows code page old Excel exports use). core/timesheet.js finds the shifts.
 * What is missing is asked, once for all of them: the job (when there is more than one), when shifts with
 * hours only start. Every shift found is shown and can be left out; one that is already in the app (the
 * same time) starts left out, so importing twice adds nothing twice. One tap adds them, and one undoes it.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  // SheetJS 0.20.3 (from SheetJS's own CDN; 0.18.5 had a prototype pollution and a ReDoS: CVE-2023-30533, CVE-2024-22363)
  const XLSX_SRC = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------- a file → text, a line per row ---------------- */
  function decode(buf) {
    const utf = new TextDecoder('utf-8').decode(buf);
    if (!utf.includes('�')) return utf;
    try { return new TextDecoder('windows-1255').decode(buf); } catch (e) { return utf; }
  }
  // a date or time cell is a number of days since 30.12.1899 (the fraction is the time of day). Read here, in
  // UTC: through a local Date the old time zones of 1899 move times by a minute (09:15 came out 09:14)
  function serialText(v) {
    let days = Math.floor(v + 1e-9), mins = Math.round((v - days) * 1440);
    if (mins >= 1440) { days++; mins -= 1440; }
    const time = pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
    if (days < 1) return time; // a time only
    const d = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return mins ? date + ' ' + time : date;
  }
  function cellText(X, c) {
    if (!c) return '';
    if (c.t === 'n' && c.z && X.SSF.is_date(c.z)) return serialText(c.v);
    if (c.t === 'd' && c.v instanceof Date && !isNaN(c.v)) return serialText(c.v.getTime() / 86400000 + 25569 - c.v.getTimezoneOffset() / 1440);
    return c.w != null ? String(c.w) : c.v == null ? '' : String(c.v);
  }
  function sheetText(X, ws) {
    if (!ws || !ws['!ref']) return '';
    const R = X.utils.decode_range(ws['!ref']);
    const lines = [];
    for (let r = R.s.r; r <= R.e.r && r < R.s.r + 3000; r++) {
      const cells = [];
      for (let c = R.s.c; c <= R.e.c && c < R.s.c + 40; c++) cells.push(cellText(X, ws[X.utils.encode_cell({ r, c })]));
      lines.push(cells.join(' | '));
    }
    return lines.join('\n');
  }
  /**
   * What a file is by its first bytes: a picture with no type (some share sheets and cloud apps give none), a PDF
   * named .jpg, a photo named .txt were refused, failed, or read as text junk (intake M4). The name and the type
   * decide only when the bytes say nothing (CSV and plain text have no signature).
   */
  async function sniff(file) {
    let b;
    try { b = new Uint8Array(await file.slice(0, 16).arrayBuffer()); } catch (e) { return null; }
    const at = (i, str) => [...str].every((c, k) => b[i + k] === c.charCodeAt(0));
    if (at(0, '%PDF')) return { kind: 'pdf', type: 'application/pdf', ext: 'pdf' };
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { kind: 'image', type: 'image/jpeg', ext: 'jpg' };
    if (b[0] === 0x89 && at(1, 'PNG')) return { kind: 'image', type: 'image/png', ext: 'png' };
    if (at(0, 'GIF8')) return { kind: 'image', type: 'image/gif', ext: 'gif' };
    if (at(0, 'RIFF') && at(8, 'WEBP')) return { kind: 'image', type: 'image/webp', ext: 'webp' };
    if (at(0, 'BM') && !b[6] && !b[7] && !b[8] && !b[9]) return { kind: 'image', type: 'image/bmp', ext: 'bmp' };
    if (at(4, 'ftypavif') || at(4, 'ftypavis')) return { kind: 'image', type: 'image/avif', ext: 'avif' };
    if (at(4, 'ftyphei') || at(4, 'ftypmif1') || at(4, 'ftypheix') || at(4, 'ftyphevc')) return { kind: 'image', type: 'image/heic', ext: 'heic' };
    if (at(0, 'PK') && b[2] === 3 && b[3] === 4) return { kind: 'sheet' };
    if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return { kind: 'sheet' };
    return null;
  }
  async function readFile(file, progress, opts) {
    // an empty file, or a cloud file the phone has not downloaded yet: said as such (app/docread.js)
    if (root.DocRead) await root.DocRead.check(file);
    const kind = await sniff(file);
    // a picture or a PDF by its bytes: passed on with the right type and ending, as the readers below decide by them
    if (kind && kind.type && file.type !== kind.type) {
      const base = (file.name || 'file').replace(/\.[a-z0-9]{1,5}$/i, '');
      file = new File([file], base + '.' + kind.ext, { type: kind.type });
    }
    const name = file.name || '';
    if ((kind && kind.kind === 'sheet') || (!kind && (/\.(xlsx|xlsm|xls|ods)$/i.test(name) || /spreadsheet|excel/i.test(file.type)))) {
      progress('קורא את הגיליון…');
      await App.loadLib(XLSX_SRC);
      const X = root.XLSX;
      const wb = X.read(await file.arrayBuffer(), { type: 'array', cellNF: true });
      return wb.SheetNames.slice(0, 12).map((n) => sheetText(X, wb.Sheets[n])).join('\n');
    }
    if (!kind && (/\.(csv|tsv|txt)$/i.test(name) || /^text\//.test(file.type))) {
      return decode(await file.arrayBuffer()).replace(/[;,\t]/g, ' | ');
    }
    const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf';
    if (isPdf || /^image\//.test(file.type)) {
      if (!App.readDocText || !App.readDocWords) throw root.U.oops('הקריאה לא זמינה כרגע');
      // a PDF with text: its lines (all its pages); when they hold no shifts, or it is a picture, it is read as a
      // table: each word where it stands on the page (core/timesheet.js parseWords)
      let lines = null;
      if (isPdf) {
        const doc = await App.readDocText(file, progress, Object.assign({ noOcr: true }, opts));
        if (doc.source === 'pdf' && root.Timesheet.parse(doc.text, { today: U.todayKey() }).rows.length >= 2) lines = doc.text;
      }
      const got = await App.readDocWords(file, progress, opts);
      progress('מסדר את הטבלה…');
      const res = root.Timesheet.parseWords(got.words, { today: U.todayKey() });
      // a PDF longer than the pages read (8): the screens say so, the rest can come in another file. Text comes back
      // as the result of its lines then, so the note travels with it
      const capped = got.pages > got.pagesRead ? { pages: got.pages, pagesRead: got.pagesRead } : null;
      const out = (v) => (!capped ? v : Object.assign(typeof v === 'string' ? { result: root.Timesheet.parse(v, { today: U.todayKey() }), text: v } : v, capped));
      // a PDF read both ways: the table (it knows the columns, their names and the total — a column of standard
      // hours never becomes the entry) unless the lines found more shifts
      if (lines != null && res.rows.length < root.Timesheet.parse(lines, { today: U.todayKey() }).rows.length) return out(lines);
      // the words read in reading order, for the "what was read" box and as a last try as plain text
      const text = res.text || '';
      if (!res.rows.length) return out(lines != null ? lines : got.source === 'ocr' ? { result: res, text } : text);
      return out({ result: res, text });
    }
    throw root.U.oops('סוג קובץ שלא מכירים. אפשר Excel, \u200fCSV, \u200fPDF, תמונה או טקסט');
  }

  App.readHoursFile = readFile; // the hours report check reads the same files (app/hours-check.js)
  /** Rows of the report the reader saw and could not read (n > 0): said under the period line, here and in the hours
   *  check, so a row left out is never silent. */
  App.unreadRowsNote = (n) => `<div class="tiny muted imp-note imp-unread">${icon('info', 's')} ${n === 1 ? 'שורה אחת בדוח לא נקראה בבירור. כדאי לבדוק אותה בדוח עצמו.' : `${n} שורות בדוח לא נקראו בבירור. כדאי לבדוק אותן בדוח עצמו.`}</div>`;

  // a night the report cuts at midnight is one row (core/hourscheck.js joinNights)
  const joinNights = (rows) => root.HoursCheck.joinNights(rows);

  /* ---------------- the screen ---------------- */
  // from the add menu the menu goes; from a settings page it stays under (back returns there)
  App.actions['import-hours'] = () => App.importHours();
  App.importHours = function (opts) {
    if (UI.sheets.length && !(opts && opts.over)) UI.closeAll();
    let rows = [], noStart = 0, guessedYear = false, noExit = 0, paidSure = new Set(), capped = null, unread = 0;
    let roleId = S.meta.lastRole && App.roles().some((r) => r.id === S.meta.lastRole) ? S.meta.lastRole : (App.roles()[0] || {}).id;
    let startFor = '09:00';
    // leaving the sheet ends the reading (its OCR workers) and nothing of it lands on the next screen
    const stop = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const entry = UI.openSheet({
      title: 'ייבוא דוח שעות', full: true, cls: 'import-sheet',
      body: '<div id="imp"></div>',
      foot: '<button class="btn big" data-imp-save></button>',
      onClose: () => { if (stop) stop.abort(); },
    });
    const box = entry.sh.querySelector('#imp');
    const save = entry.sh.querySelector('[data-imp-save]');
    // the add button (and its bar) only once there is something to add
    const showSave = (on) => { const f = entry.sh.querySelector('.sh-foot'); if (f) f.style.display = on ? '' : 'none'; };
    const role = () => App.roles().find((r) => r.id === roleId) || App.roles()[0];
    const toEpoch = (k, hm) => U.toEpoch(k, hm);
    // where each row lands, and what already stands there
    const place = (r) => {
      let t;
      if (r.start && r.end) {
        // by the clock, as the report writes it. "start + hours" ended an hour off on the two nights a year the
        // clocks change (22:00–06:00 was saved as 22:00–05:00 or 22:00–07:00)
        const start = toEpoch(r.date, r.start);
        let end = toEpoch(r.date, r.end);
        if (end <= start) end = toEpoch(U.addDays(r.date, 1), r.end);
        t = { start, end };
      } else t = root.Timesheet.times(r, startFor, toEpoch);
      if (!t) return null;
      const emp = role() && role().employerId;
      const there = S.shifts.filter((x) => x.employerId === emp && x.start < t.end && x.end > t.start);
      // a shift I planned for that time, and the report says it was worked: it becomes the done one when added
      // (it stayed "planned" beside a row marked as already there, so the pay never counted it)
      t.planned = t.end <= Date.now() && there.length === 1 && there[0].status === 'planned' && !(there[0].splits && there[0].splits.length) ? there[0] : null;
      t.over = t.planned ? null : there[0] || null;
      const a = S.activeShift;
      t.taken = !!t.over
        || !!(a && a.employerId === emp && a.start < t.end && Date.now() > t.start) // the shift running now
        || (!r.start && S.shifts.some((x) => x.employerId === emp && U.epochKey(x.start) === r.date)); // hours only: that day has a shift
      return t;
    };
    // the year too, when it is not this year (a report of last December read "14/12", like this year's)
    const dateOf = (k) => U.fmtDate(k, 'short') + (k.slice(0, 4) === U.todayKey().slice(0, 4) ? '' : '/' + k.slice(0, 4));

    function start() {
      showSave(false);
      box.innerHTML = `${App.mascotSays ? App.mascotSays('happy', 'יש לך דוח שעות מהעבודה? אכניס את כל המשמרות בבת אחת 📄', { size: 64 }) : ''}
        <label class="btn big block imp-pick">${icon('upload')} בחירת קובץ<input type="file" id="imp-file" class="sr" accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.pdf,image/*,text/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        <div class="imp-kinds">${[['file', 'Excel'], ['file', 'CSV'], ['file', 'PDF'], ['camera', 'צילום או צילום מסך']].map(([ic, t]) => `<span>${icon(ic, 's')}${t}</span>`).join('')}</div>
        <details class="imp-paste"><summary>${icon('edit', 's')} או להדביק טקסט</summary>
          <textarea class="input" id="imp-text" rows="6" placeholder="למשל:&#10;14/10/2026 08:00 16:30&#10;15/10/2026 16:00 23:00"></textarea>
          <button class="btn tonal block" data-imp-read>${icon('check', 's')} קריאה</button></details>
        <div class="tiny muted imp-privacy">${icon('shield', 's')} הקובץ נקרא בטלפון בלבד, ולא נשלח לשום מקום. צילום נקרא כטבלה: כל דוח, בכל סידור עמודות.</div>`;
    }
    function busy(text) { box.innerHTML = `<div class="imp-busy">${App.mascot ? App.mascot('think', { size: 84 }) : ''}<div class="imp-bar" aria-hidden="true"><i></i></div><div class="small" id="imp-progress" role="status">${esc(text)}</div></div>`; }
    function progress(text) { const p = box.querySelector('#imp-progress'); if (p) p.textContent = text; }
    function none(sample) {
      showSave(false);
      box.innerHTML = `${App.mascotSays ? App.mascotSays('think', 'לא מצאתי בדוח משמרות שאני יודע לקרוא 🤔', { size: 64 }) : ''}
        <div class="card small imp-tips"><b>מה עוזר:</b><ul><li>שבכל שורה יהיו תאריך ושעות (למשל 14/10/2026 08:00 16:30)</li><li>קובץ Excel או CSV נקרא הכי טוב</li><li>בצילום: שהדוח ישר, חד ומואר</li></ul></div>
        ${sample ? `<details class="imp-paste"><summary>מה שנקרא מהקובץ</summary><div class="code">${esc(sample.slice(0, 1500))}</div></details>` : ''}
        <button class="btn tonal block" data-imp-again>${icon('upload', 's')} לנסות קובץ אחר</button>
        <button class="btn text block" data-act="support">לשלוח לנו את הדוח ונעזור</button>`;
    }
    const TO_CHECK = 'לבדיקה'; // the tag's text alone, so it is the one already translated
    // every row on, but those the reader doubted, which only their own tap turns on
    const allOn = () => rows.every((r) => r.on || r.doubt);
    function review() {
      const roles = App.roles();
      const list = rows.map((r, i) => {
        const t = place(r);
        // a row the reader was not sure of starts left out and is marked: it is added only when the person turns it on
        if (r.on == null) r.on = !(t && t.taken) && !r.doubt;
        const day = U.DAYS ? U.DAYS[U.dow(r.date)] : '';
        const when = r.start ? `\u2066${r.start}\u2060–\u2060${r.end}\u2069` : `${U.num(r.hours, 2)} שעות · ${startFor ? 'מ-' + startFor : 'שעה לא ידועה'}`;
        return `<button class="imp-row ${r.on ? 'on' : ''}" data-i="${i}" aria-pressed="${r.on}"><span class="imp-check" aria-hidden="true">${icon('check', 's')}</span>
          <span class="imp-d"><b>${esc(day)} ${dateOf(r.date)}</b><small>${when}${r.overnight ? ' · לילה' : ''}</small></span>
          <span class="imp-h">${U.num(paidSure.has(r) ? r.paid : r.hours, 2)} ש׳${(t && t.taken ? '<i class="tag">כבר קיימת</i>' : '') + (r.doubt ? `<i class="tag">${TO_CHECK}</i>` : '') + (t && t.planned ? `<i class="tag" data-imp-plan="${esc(t.planned.id)}">תסומן כבוצעה</i>` : '')}${t && t.end > Date.now() ? '<i class="tag planned">עתידית</i>' : ''}</span></button>`;
      }).join('');
      const first = rows[0].date, last = rows[rows.length - 1].date;
      box.innerHTML = `${App.mascotSays ? App.mascotSays('love', `מצאתי ${rows.length === 1 ? 'משמרת אחת' : `${rows.length} משמרות`}! 🎉 בודקים רגע ומוסיפים`, { size: 64 }) : ''}
        ${roles.length > 1 ? `<div class="field"><span class="lbl">לאיזה תפקיד לשייך?</span><div class="chips imp-roles">${roles.map((r) => `<button class="chip ${r.id === roleId ? 'on' : ''}" data-imp-role="${esc(r.id)}"><span class="sw" style="background:${r.color}"></span>${esc(r.name)}${App.multiEmp() ? ' · ' + esc((App.employer(r.employerId) || {}).name || '') : ''}</button>`).join('')}</div></div>` : ''}
        ${noStart ? `<label class="field"><span class="lbl">${noStart === 1 ? 'במשמרת אחת' : `ב-${noStart} משמרות`} כתוב רק כמה שעות. באיזו שעה הן מתחילות?</span><input class="input" type="time" id="imp-start" value="${startFor}"></label>` : ''}
        ${noExit ? `<div class="tiny muted imp-note">${icon('info', 's')} ${noExit === 1 ? 'בשורה אחת' : `ב-${noExit} שורות`} יש כניסה בלי יציאה, ולכן ${noExit === 1 ? 'היא לא נכנסה' : 'הן לא נכנסו'}. אפשר להוסיף ${noExit === 1 ? 'אותה' : 'אותן'} ידנית.</div>` : ''}
        ${guessedYear ? `<div class="tiny muted imp-note">${icon('info', 's')} בשורות בלי שנה לקחנו את התאריך האחרון שכבר עבר.</div>` : ''}
        ${capped ? `<div class="tiny muted imp-note">${icon('info', 's')} קראנו את ${capped.pagesRead} העמודים הראשונים מתוך ${capped.pages}. את השאר אפשר להעלות בקובץ נפרד.</div>` : ''}
        <div class="imp-head"><b>${first === last ? dateOf(first) : `\u2066${dateOf(first)}\u2060–\u2060${dateOf(last)}\u2069`}</b><button class="btn text sm" data-imp-all>${allOn() ? 'לבטל הכול' : 'לסמן הכול'}</button></div>
        ${unread ? App.unreadRowsNote(unread) : ''}
        <div class="imp-list">${list}</div>`;
      showSave(true);
      count();
    }
    // a row on or off: in place (nothing else moves), and the button says how many
    function count() {
      const adds = rows.filter((r) => r.on && (r.start || startFor));
      const n = adds.length;
      // the rows the reader doubted that the person turned on: the button says how many of them go in
      const k = adds.filter((r) => r.doubt).length;
      const unsure = !k ? '' : n === 1 ? '(לבדיקה)' : k === 1 ? '(אחת לבדיקה)' : `(${k} לבדיקה)`;
      save.disabled = !n;
      save.innerHTML = `${icon('plus', 's')} ${n === 1 ? 'הוספת משמרת אחת' : `הוספת ${n} משמרות`}${unsure ? ' ' + unsure : ''}`;
      // two rows over one planned shift: only the first one turned on makes it done (add() below), so only it says so
      const plan = new Map();
      box.querySelectorAll('[data-imp-plan]').forEach((tg) => { const id = tg.dataset.impPlan; if (!plan.has(id)) plan.set(id, []); plan.get(id).push(tg); });
      plan.forEach((tags) => {
        if (tags.length < 2) return;
        const lead = tags.find((tg) => rows[+tg.closest('.imp-row').dataset.i].on) || tags[0];
        tags.forEach((tg) => { tg.style.display = tg === lead ? '' : 'none'; });
      });
      const all = box.querySelector('[data-imp-all]');
      if (all) all.textContent = allOn() ? 'לבטל הכול' : 'לסמן הכול';
    }
    async function parse(got) {
      // read as a table (a picture) or as lines of text
      const text = typeof got === 'string' ? got : got.text;
      const p = typeof got === 'string' ? root.Timesheet.parse(text, { today: U.todayKey() }) : got.result;
      // the same shift twice in one report (two sheets, a repeated line): once
      const seen = new Set();
      rows = joinNights(p.rows.filter((r) => { const k = r.date + r.start + r.end + r.hours; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))));
      // printed paid hours that can be a break the report took out (core/hourscheck.js paidOk), the rest ignored
      paidSure = root.HoursCheck.paidOk(rows);
      noStart = rows.filter((r) => !r.start).length;
      guessedYear = p.guessedYear;
      noExit = p.skipped || 0; // an entry without an exit (a missed clock-out)
      capped = got && got.pages > got.pagesRead ? got : null; // a long PDF: only its first pages were read
      // rows the reader saw and could not read: a time with no trusted date, a line with two times it left out (an
      // entry without an exit has its own note above)
      unread = Math.max(+p.undated || 0, App.droppedRows ? App.droppedRows(text, (p.rows || []).length) : 0);
      if (!rows.length) { none(text); return; }
      if (root.Fx) root.Fx.play('pick');
      review();
    }
    async function fromFile(file) {
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) { UI.invalid('הקובץ גדול מדי (עד 25MB)'); return; }
      busy('קורא את הקובץ…');
      try {
        const got = await readFile(file, progress, stop ? { signal: stop.signal } : undefined);
        if (entry.closed) return;
        await parse(got);
      } catch (e) {
        if (entry.closed) return; // left while it read: no toast on another screen
        console.warn('import', e);
        start();
        UI.invalid(root.DocRead.trouble(e) || (root.U.ours(e) ? e.message : 'לא הצלחנו לקרוא את הקובץ. אפשר לנסות קובץ אחר או להדביק טקסט'));
      }
    }
    /** Minutes of unpaid break a row's printed hours show (span minus paid, 10 minutes to 3 hours), or null. */
    const breakOf = (r) => {
      if (!(r.start && r.end) || !paidSure.has(r) || !(+r.hours > 0)) return null;
      const m = Math.round((+r.hours - +r.paid) * 60);
      return m >= 10 && m <= 180 ? m : null;
    };
    let adding = false;
    async function add() {
      const r0 = role();
      if (!r0) return;
      const emp = App.employer(r0.employerId) || S.employers[0];
      if (adding) return;
      const ops = [];
      const turned = new Set(); // planned shifts already turned into done ones by a row before
      let clash = null;
      for (const r of rows) {
        if (!r.on) continue;
        const t = place(r);
        if (!t) continue;
        if (t.planned && !turned.has(t.planned.id)) {
          turned.add(t.planned.id);
          const b0 = breakOf(r);
          ops.push({ store: 'shifts', put: Object.assign({}, t.planned, { status: 'done', start: t.start, end: t.end }, b0 != null ? { breakMin: b0, breakPaid: false } : {}) });
          continue;
        }
        if (t.over && !clash) clash = t.over;
        const b = breakOf(r);
        ops.push({ store: 'shifts', put: {
          id: U.uid(), kind: 'shift', employerId: r0.employerId, roleId: r0.id, status: t.end > Date.now() ? 'planned' : 'done', start: t.start, end: t.end,
          breakMin: b, breakPaid: b != null ? false : emp.defaultBreakPaid !== false, noTravel: false, splits: [], items: [], note: 'יובא מדוח שעות',
        } });
      }
      if (!ops.length) return;
      adding = true; // from here a second tap adds nothing (also while the question below is open)
      // a row I turned on over a shift that is already there: asked, as the shift editor asks (two shifts over each
      // other were saved without a word, and the day was paid twice)
      if (clash && !(await UI.confirm('חפיפה עם משמרת אחרת', `קיימת משמרת ב-${U.fmtDate(U.epochKey(clash.start))} \u2066${U.epochHM(clash.start)}\u2060–\u2060${U.epochHM(clash.end)}\u2069. לשמור בכל זאת?`, 'שמור'))) { adding = false; return; }
      save.disabled = true;
      UI.closeTop();
      await App.saveOps(ops, 'ייבוא דוח שעות', ops.length === 1 ? 'נוספה משמרת אחת מהדוח' : `נוספו ${ops.length} משמרות מהדוח`);
      if (root.Fx) root.Fx.celebrate('big');
    }

    entry.sh.addEventListener('change', (e) => {
      if (e.target.id === 'imp-file') fromFile(e.target.files && e.target.files[0]);
      if (e.target.id === 'imp-start' && /^\d{2}:\d{2}$/.test(e.target.value)) { startFor = e.target.value; review(); }
    });
    entry.sh.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-imp-read')) { const t = box.querySelector('#imp-text').value; if (t.trim()) parse(t); else UI.invalid('מדביקים קודם את הטקסט'); }
      else if (b.hasAttribute('data-imp-again')) start();
      else if (b.dataset.impRole) { roleId = b.dataset.impRole; rows.forEach((r) => { if (!r.mine) r.on = null; }); review(); if (root.Fx) root.Fx.play('on'); }
      else if (b.hasAttribute('data-imp-all')) {
        const all = allOn();
        rows.forEach((r) => { if (all || !r.doubt) { r.on = !all; r.mine = true; } });
        box.querySelectorAll('.imp-row').forEach((x) => { const on = !!rows[+x.dataset.i].on; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
        count();
      } else if (b.classList.contains('imp-row')) {
        const r = rows[+b.dataset.i];
        r.on = !r.on;
        r.mine = true; // my own choice: choosing a job later does not turn it back (a row taken out came back on)
        b.classList.toggle('on', r.on); b.setAttribute('aria-pressed', String(r.on));
        if (root.Fx) root.Fx.play(r.on ? 'on' : 'off');
        count();
      }
      else if (b.hasAttribute('data-imp-save')) add();
    });
    start();
    // a report that came from elsewhere (shared to the app): read at once
    if (opts && opts.file) fromFile(opts.file);
    else if (opts && opts.text) parse(opts.text);
  };
})(typeof window !== 'undefined' ? window : globalThis);
