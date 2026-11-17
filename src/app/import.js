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
  async function readFile(file, progress) {
    const name = file.name || '';
    if (/\.(xlsx|xlsm|xls|ods)$/i.test(name) || /spreadsheet|excel/i.test(file.type)) {
      progress('קורא את הגיליון…');
      await App.loadLib(XLSX_SRC);
      const X = root.XLSX;
      const wb = X.read(await file.arrayBuffer(), { type: 'array', cellNF: true });
      return wb.SheetNames.slice(0, 12).map((n) => sheetText(X, wb.Sheets[n])).join('\n');
    }
    if (/\.(csv|tsv|txt)$/i.test(name) || /^text\//.test(file.type)) {
      return decode(await file.arrayBuffer()).replace(/[;,\t]/g, ' | ');
    }
    const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf';
    if (isPdf || /^image\//.test(file.type)) {
      if (!App.readDocText || !App.readDocWords) throw root.U.oops('הקריאה לא זמינה כרגע');
      // a PDF with text: its lines (all its pages); when they hold no shifts, or it is a picture, it is read as a
      // table: each word where it stands on the page (core/timesheet.js parseWords)
      let lines = null;
      if (isPdf) {
        const doc = await App.readDocText(file, progress, { noOcr: true });
        if (doc.source === 'pdf' && root.Timesheet.parse(doc.text, { today: U.todayKey() }).rows.length >= 2) lines = doc.text;
      }
      const got = await App.readDocWords(file, progress);
      progress('מסדר את הטבלה…');
      const res = root.Timesheet.parseWords(got.words, { today: U.todayKey() });
      // a PDF read both ways: the table (it knows the columns, their names and the total — a column of standard
      // hours never becomes the entry) unless the lines found more shifts
      if (lines != null && res.rows.length < root.Timesheet.parse(lines, { today: U.todayKey() }).rows.length) return lines;
      // the words read in reading order, for the "what was read" box and as a last try as plain text
      const text = res.text || '';
      if (!res.rows.length) return lines != null ? lines : text;
      return { result: res, text };
    }
    throw root.U.oops('סוג קובץ שלא מכירים. אפשר Excel, \u200fCSV, \u200fPDF, תמונה או טקסט');
  }

  App.readHoursFile = readFile; // the hours report check reads the same files (app/hours-check.js)

  /**
   * A night the clock system writes as two rows, cut at midnight ("13/10 22:00–00:00" and "14/10 00:00–06:00", or
   * the first ending 23:59), is one shift: saved as two, each half had its own day's overtime count and the
   * seven-hour night day never applied. Rows sorted by day and start; a row is joined only to the row that starts
   * at 00:00 the next day.
   */
  function joinNights(rows) {
    const out = [];
    const used = new Set();
    rows.forEach((r, i) => {
      if (used.has(i)) return;
      let cur = r;
      while (cur.start && (cur.end === '00:00' || cur.end === '23:59')) {
        const last = cur.parts ? cur.parts[cur.parts.length - 1] : cur;
        const next = U.addDays(last.date, 1);
        const j = rows.findIndex((x, k) => !used.has(k) && k !== i && x.date === next && x.start === '00:00' && x.end && x.end !== '00:00');
        if (j < 0) break;
        used.add(j);
        const b = rows[j];
        const hours = Math.round((cur.hours + (cur.end === '23:59' ? 1 / 60 : 0) + b.hours) * 100) / 100;
        if (hours > 16) break; // longer than any shift the reader accepts: not one shift
        cur = Object.assign({}, cur, { end: b.end, hours, overnight: true, parts: (cur.parts || [cur]).concat([b]) });
      }
      out.push(cur);
    });
    return out;
  }
  App.importJoinNights = joinNights; // tests

  /* ---------------- the screen ---------------- */
  // from the add menu the menu goes; from a settings page it stays under (back returns there)
  App.actions['import-hours'] = () => App.importHours();
  App.importHours = function (opts) {
    if (UI.sheets.length && !(opts && opts.over)) UI.closeAll();
    let rows = [], noStart = 0, guessedYear = false, noExit = 0;
    let roleId = S.meta.lastRole && App.roles().some((r) => r.id === S.meta.lastRole) ? S.meta.lastRole : (App.roles()[0] || {}).id;
    let startFor = '09:00';
    const entry = UI.openSheet({
      title: 'ייבוא דוח שעות', full: true, cls: 'import-sheet',
      body: '<div id="imp"></div>',
      foot: '<button class="btn big" data-imp-save></button>',
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
        <label class="btn big block imp-pick">${icon('upload')} בחירת קובץ<input type="file" id="imp-file" hidden accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.pdf,image/*,text/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
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
    function review() {
      const roles = App.roles();
      const list = rows.map((r, i) => {
        const t = place(r);
        if (r.on == null) r.on = !(t && t.taken);
        const day = U.DAYS ? U.DAYS[U.dow(r.date)] : '';
        const when = r.start ? `\u2066${r.start}\u2060–\u2060${r.end}\u2069` : `${U.num(r.hours, 2)} שעות · ${startFor ? 'מ-' + startFor : 'שעה לא ידועה'}`;
        return `<button class="imp-row ${r.on ? 'on' : ''}" data-i="${i}" aria-pressed="${r.on}"><span class="imp-check" aria-hidden="true">${icon('check', 's')}</span>
          <span class="imp-d"><b>${esc(day)} ${dateOf(r.date)}</b><small>${when}${r.overnight ? ' · לילה' : ''}</small></span>
          <span class="imp-h">${U.num(r.hours, 2)} ש׳${t && t.taken ? '<i class="tag">כבר קיימת</i>' : ''}${t && t.end > Date.now() ? '<i class="tag planned">עתידית</i>' : ''}</span></button>`;
      }).join('');
      const first = rows[0].date, last = rows[rows.length - 1].date;
      box.innerHTML = `${App.mascotSays ? App.mascotSays('love', `מצאתי ${rows.length === 1 ? 'משמרת אחת' : `${rows.length} משמרות`}! 🎉 בודקים רגע ומוסיפים`, { size: 64 }) : ''}
        ${roles.length > 1 ? `<div class="field"><span class="lbl">לאיזה תפקיד לשייך?</span><div class="chips imp-roles">${roles.map((r) => `<button class="chip ${r.id === roleId ? 'on' : ''}" data-imp-role="${esc(r.id)}"><span class="sw" style="background:${r.color}"></span>${esc(r.name)}${App.multiEmp() ? ' · ' + esc((App.employer(r.employerId) || {}).name || '') : ''}</button>`).join('')}</div></div>` : ''}
        ${noStart ? `<label class="field"><span class="lbl">${noStart === 1 ? 'במשמרת אחת' : `ב-${noStart} משמרות`} כתוב רק כמה שעות. באיזו שעה הן מתחילות?</span><input class="input" type="time" id="imp-start" value="${startFor}"></label>` : ''}
        ${noExit ? `<div class="tiny muted imp-note">${icon('info', 's')} ${noExit === 1 ? 'בשורה אחת' : `ב-${noExit} שורות`} יש כניסה בלי יציאה, ולכן ${noExit === 1 ? 'היא לא נכנסה' : 'הן לא נכנסו'}. אפשר להוסיף ${noExit === 1 ? 'אותה' : 'אותן'} ידנית.</div>` : ''}
        ${guessedYear ? `<div class="tiny muted imp-note">${icon('info', 's')} בשורות בלי שנה לקחנו את התאריך האחרון שכבר עבר.</div>` : ''}
        <div class="imp-head"><b>${first === last ? dateOf(first) : `\u2066${dateOf(first)}\u2060–\u2060${dateOf(last)}\u2069`}</b><button class="btn text sm" data-imp-all>${rows.every((r) => r.on) ? 'לבטל הכול' : 'לסמן הכול'}</button></div>
        <div class="imp-list">${list}</div>`;
      showSave(true);
      count();
    }
    // a row on or off: in place (nothing else moves), and the button says how many
    function count() {
      const n = rows.filter((r) => r.on && (r.start || startFor)).length;
      save.disabled = !n;
      save.innerHTML = `${icon('plus', 's')} ${n === 1 ? 'הוספת משמרת אחת' : `הוספת ${n} משמרות`}`;
      const all = box.querySelector('[data-imp-all]');
      if (all) all.textContent = rows.every((r) => r.on) ? 'לבטל הכול' : 'לסמן הכול';
    }
    async function parse(got) {
      // read as a table (a picture) or as lines of text
      const text = typeof got === 'string' ? got : got.text;
      const p = typeof got === 'string' ? root.Timesheet.parse(text, { today: U.todayKey() }) : got.result;
      // the same shift twice in one report (two sheets, a repeated line): once
      const seen = new Set();
      rows = joinNights(p.rows.filter((r) => { const k = r.date + r.start + r.end + r.hours; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))));
      noStart = rows.filter((r) => !r.start).length;
      guessedYear = p.guessedYear;
      noExit = p.skipped || 0; // an entry without an exit (a missed clock-out)
      if (!rows.length) { none(text); return; }
      if (root.Fx) root.Fx.play('pick');
      review();
    }
    async function fromFile(file) {
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) { UI.invalid('הקובץ גדול מדי (עד 25MB)'); return; }
      busy('קורא את הקובץ…');
      try { await parse(await readFile(file, progress)); } catch (e) {
        console.warn('import', e);
        start();
        UI.invalid(root.U.ours(e) ? e.message : 'לא הצלחנו לקרוא את הקובץ. אפשר לנסות קובץ אחר או להדביק טקסט');
      }
    }
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
          ops.push({ store: 'shifts', put: Object.assign({}, t.planned, { status: 'done', start: t.start, end: t.end }) });
          continue;
        }
        if (t.over && !clash) clash = t.over;
        ops.push({ store: 'shifts', put: {
          id: U.uid(), kind: 'shift', employerId: r0.employerId, roleId: r0.id, status: t.end > Date.now() ? 'planned' : 'done', start: t.start, end: t.end,
          breakMin: null, breakPaid: emp.defaultBreakPaid !== false, noTravel: false, splits: [], items: [], note: 'יובא מדוח שעות',
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
        const all = rows.every((r) => r.on);
        rows.forEach((r) => { r.on = !all; r.mine = true; });
        box.querySelectorAll('.imp-row').forEach((x) => { x.classList.toggle('on', !all); x.setAttribute('aria-pressed', String(!all)); });
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
