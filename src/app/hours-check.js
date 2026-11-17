/* ============================================================
 * hours-check.js — "check the hours report before payday". Many employers hand out a monthly hours report
 * (דוח נוכחות) before the payslip. A photo, a PDF, an Excel file or pasted text of it is read as the hours import
 * reads it (App.readHoursFile, core/timesheet.js), then compared day by day with the person's own done shifts in
 * the pay period it covers (core/hourscheck.js): a shift the report lacks, different hours (more than 10 minutes),
 * a row only the report has. Each difference shows what it is worth by the engine: the whole pay period is
 * calculated again with the report's hours in place of the person's (so overtime and Shabbat count as they would
 * on the payslip), and the change for that shift is its worth.
 * A short, polite message to the employer lists only what the report lacks or has differently; a row only the
 * report has can be added to the person's own shifts in one tap. Nothing is sent anywhere by the app.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U, Engine } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const range = (a, b) => `\u2066${a}\u2060–\u2060${b}\u2069`;
  const DEFAULT_START = '09:00'; // a row with hours only and no start (only for its worth)

  /** Lines of the report's text holding an entry and an exit (two clock times) beyond the rows read from it: rows
   *  the reader saw and left out (a garbled date), whatever the reader itself counts. */
  function droppedOf(text, nRows) {
    const lines = String(text || '').split(/\r?\n/).filter((l) => (l.match(/\b\d{1,2}:\d{2}\b/g) || []).length >= 2).length;
    return Math.max(0, lines - nRows);
  }
  /** The report's rows, each once, in order. */
  function rowsOf(got) {
    const p = typeof got === 'string' ? root.Timesheet.parse(got, { today: U.todayKey() }) : got.result;
    const seen = new Set();
    const rows = (p.rows || []).filter((r) => { const k = r.date + r.start + r.end + r.hours; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    // a night the report cuts at midnight is one row here too (app/import.js), so "add to my shifts" adds one shift
    const out = root.HoursCheck.joinNights(rows);
    // rows the reader saw and could not read: a time with no trusted date (undated), an entry with no exit (skipped)
    out.unreadRows = Math.max((+p.undated || 0) + (+p.skipped || 0), droppedOf(typeof got === 'string' ? got : got.text, (p.rows || []).length));
    return out;
  }
  /** The pay period(s) the report covers, up to today. */
  function periodOf(rows, emp) {
    const first = rows[0].date, last = rows[rows.length - 1].date;
    const P1 = Engine.periodOf(first, emp), P2 = Engine.periodOf(last, emp);
    const today = U.todayKey();
    return { from: P1.from, to: P2.to < today ? P2.to : today, label: P1.key === P2.key ? P1.label : '', first, last };
  }
  /** My done shifts of this job in the period, as core/hourscheck.js reads them (and those of the day before it: a
   *  night that runs into the period meets a row that starts at midnight on its first day). */
  function mineOf(empId, from, to) {
    from = U.addDays(from, -1);
    const out = [];
    for (const r of App.model.results.values()) {
      if (r.status !== 'done' || r.employerId !== empId || r.dateKey < from || r.dateKey > to || !(r.end > r.start)) continue;
      out.push({ id: r.id, date: r.dateKey, start: clock(r.start), end: clock(r.end), hours: r.paidMin / 60, span: (r.end - r.start) / 3600000 });
    }
    return out;
  }
  const at = (date, hm) => U.toEpoch(date, hm);
  function repTimes(rep) {
    const s = at(rep.date, rep.start || DEFAULT_START);
    let e = rep.end ? at(rep.date, rep.end) : s + Math.round((rep.hours || 0) * 60) * 60000;
    if (e <= s) e = at(U.addDays(rep.date, 1), rep.end);
    return { start: s, end: e };
  }
  /** A time moved by minutes on the clock (so a move over the night the clocks change stays the hour the report says). */
  const moved = (ms, min) => { const d = new Date(ms); d.setMinutes(d.getMinutes() + Math.round(min)); return d.getTime(); };
  /** What each difference is worth: the period calculated again with the report's hours (it.worth, shekels).
   *  A difference moves my shift's start and end by what the report says (the first and the last of them when the
   *  report has one row over several shifts of mine); rows that leave a gap inside my shift make that gap unpaid. */
  function worth(items, emp) {
    const role = App.roles().find((r) => r.employerId === emp.id) || App.roles()[0];
    const changed = new Map(), extra = [];
    items.forEach((it, i) => {
      if (it.type === 'diff') {
        const mineNow = (it.mine.ids || [it.mine.id]).map((id) => App.shift(id)).filter(Boolean);
        if (!mineNow.length) return;
        it.ids = mineNow.map((x) => x.id);
        const trial = mineNow.map((x) => Object.assign({}, x));
        const first = trial[0], last = trial[trial.length - 1];
        if (it.dHours != null) last.end += Math.round(it.dHours * 60) * 60000;
        else { first.start = moved(first.start, it.dStart || 0); last.end = moved(last.end, it.dEnd || 0); }
        if (it.gap > 0) {
          const r = App.model.results.get(first.id);
          first.breakMin = Math.max(it.gap, r && !r.breakPaid ? r.breakMin || 0 : 0);
          first.breakPaid = false;
        }
        // the report pays fewer hours than its own times: the rest is an unpaid break (its paid hours, core 'paid')
        if (it.lessPaid > 0 && trial.length === 1) {
          const r = App.model.results.get(first.id);
          if (r) {
            const target = r.paidMin + (it.dEnd || 0) - (it.dStart || 0) - it.lessPaid;
            first.breakMin = Math.max(0, Math.round((first.end - first.start) / 60000 - target));
            first.breakPaid = false;
          }
        }
        // nothing left of it by the report: the whole shift is the difference
        if (trial.some((x) => !(x.end > x.start))) it.gone = true;
        else trial.forEach((x) => changed.set(x.id, x));
      } else if (it.type === 'missingMine' && role && !it.unread) { // no exit read: no length, nothing to add or price
        const t = repTimes(it.rep);
        // over the shift running now: that is this shift, not one to add beside it (it would be paid twice)
        const a = S.activeShift;
        if (a && a.employerId === emp.id && a.start < t.end && Date.now() > t.start) return;
        it.trial = Object.assign({ id: 'hc-' + i, kind: 'shift', employerId: emp.id, roleId: role.id, status: 'done', breakMin: null, breakPaid: emp.defaultBreakPaid !== false, noTravel: false, splits: [], items: [] }, t);
        extra.push(it.trial);
        // only a row with its own times becomes a shift of mine: an hours-only row has no start (09:00 is only for its worth)
        it.canAdd = !!(it.rep.start && it.rep.end);
      }
    });
    let trial = null;
    try {
      trial = Engine.buildModel({ settings: S.settings, employers: S.employers, roles: S.roles, dayRules: S.dayRules, shifts: S.shifts.map((s) => changed.get(s.id) || s).concat(extra), entries: S.entries });
    } catch (e) { console.warn('hours check', e); }
    const wage = (m, id) => { const r = m && m.results.get(id); return r ? r.wage : 0; };
    const sum = (m, ids) => (ids || []).reduce((t, id) => t + wage(m, id), 0);
    for (const it of items) {
      if (it.type === 'missingEmp') it.worth = wage(App.model, it.mine.id);
      else if (it.type === 'diff') it.worth = it.gone ? sum(App.model, it.ids) : trial ? sum(App.model, it.ids) - sum(trial, it.ids) : 0;
      else if (it.type === 'missingMine') it.worth = trial && it.trial ? wage(trial, it.trial.id) : 0;
      else it.worth = 0;
    }
  }

  /* ---------------- the screen ---------------- */
  App.actions['hours-check'] = () => { if (UI.sheets.length) { UI.closeAll(); setTimeout(() => App.hoursCheck(), 320); } else App.hoursCheck(); };
  App.hoursCheck = function () {
    let rows = [], empId = S.employers[0].id, res = null, per = null, unreadRows = 0;
    // leaving the sheet ends the reading (its OCR workers) and nothing of it lands on the next screen
    const stop = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const entry = UI.openSheet({
      title: 'בדיקת דוח הנוכחות', full: true, cls: 'import-sheet hc-sheet',
      onClose: () => { if (stop) stop.abort(); },
      body: '<div id="hc"></div>',
      foot: `<button class="btn big" data-hc-letter>${icon('chat', 's')} הודעה למעסיק</button>`,
    });
    const box = entry.sh.querySelector('#hc');
    const showFoot = (on) => { const f = entry.sh.querySelector('.sh-foot'); if (f) f.style.display = on ? '' : 'none'; };
    const emp = () => App.employer(empId);

    function start() {
      showFoot(false);
      box.innerHTML = `${App.mascotSays ? App.mascotSays('happy', 'קיבלת דוח נוכחות מהעבודה? נשווה אותו למשמרות שלך, יום אחרי יום, לפני שהתלוש יוצא.', { size: 64 }) : ''}
        <label class="btn big block imp-pick">${icon('upload')} בחירת קובץ או צילום<input type="file" id="hc-file" hidden accept=".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.pdf,image/*,text/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label>
        <div class="imp-kinds">${[['camera', 'צילום הדוח'], ['file', 'PDF'], ['file', 'Excel']].map(([ic, t]) => `<span>${icon(ic, 's')}${t}</span>`).join('')}</div>
        <details class="imp-paste"><summary>${icon('edit', 's')} או להדביק טקסט</summary>
          <textarea class="input" id="hc-text" rows="6" placeholder="למשל:&#10;14/10/2026 08:00 16:30&#10;15/10/2026 16:00 23:00"></textarea>
          <button class="btn tonal block" data-hc-read>${icon('check', 's')} השוואה</button></details>
        <div class="tiny muted imp-privacy">${icon('shield', 's')} הדוח נקרא בטלפון בלבד, ולא נשלח לשום מקום. המשמרות שלך לא משתנות בלי אישור שלך.</div>`;
      // the picker is a real control: reached by Tab and named to a screen reader (hidden took it out of both; intake S4)
      const pick = box.querySelector('#hc-file');
      if (pick) { pick.hidden = false; pick.classList.add('sr'); }
    }
    function busy(text) { showFoot(false); box.innerHTML = `<div class="imp-busy">${App.mascot ? App.mascot('think', { size: 84 }) : ''}<div class="imp-bar" aria-hidden="true"><i></i></div><div class="small" id="hc-progress" role="status">${esc(text)}</div></div>`; }
    function progress(text) { const p = box.querySelector('#hc-progress'); if (p) p.textContent = text; }
    function none() {
      showFoot(false);
      box.innerHTML = `${App.mascotSays ? App.mascotSays('think', 'לא מצאתי בדוח ימים ושעות שאני יודע לקרוא 🤔', { size: 64 }) : ''}
        <div class="card small imp-tips"><b>מה עוזר:</b><ul><li>שבכל שורה יהיו תאריך ושעות</li><li>בצילום: שהדוח ישר, חד ומואר</li><li>קובץ PDF או Excel מהמעסיק נקרא הכי טוב</li></ul></div>
        <button class="btn tonal block" data-hc-again>${icon('upload', 's')} לנסות קובץ אחר</button>`;
    }

    function compute() {
      per = periodOf(rows, emp());
      res = root.HoursCheck.compare(rows, mineOf(empId, per.from, per.to), { from: per.from, to: per.to, unreadRows });
      worth(res.items, emp());
      for (const it of res.items) it.after = it.date > per.last; // after the report's last row: maybe not in it yet
    }
    const typeName = { missingEmp: 'חסר אצל המעסיק', diff: 'שעות שונות', missingMine: 'חסר אצלך', ok: 'כדאי לבדוק' };
    // what the person should look at: every difference, and a row whose exit was not read (its hours are not known)
    const shown = (it) => it.type !== 'ok' || it.unread;
    // a row the reader was not sure of (core/timesheet.js doubt): its difference may be a misread
    const doubtful = (it) => !!it.doubt; // core/hourscheck.js: from a row the reader doubted, or a shift that may be that row
    const TO_CHECK = 'לבדיקה'; // the tag's text alone, so it is the one already translated
    function itemHtml(it, i) {
      const day = `${U.DAYS[U.dow(it.date)]} ${U.fmtDate(it.date, 'short')}`;
      const sideOf = root.HoursCheck.side;
      const lines = [];
      if (it.rep) lines.push(`<span>בדוח: <b class="num">${sideOf(it.rep, it.hoursToo)}</b></span>`);
      if (it.mine) lines.push(`<span>אצלך: <b class="num">${sideOf(it.mineSide || it.mine, it.hoursToo)}</b></span>`);
      const w = Math.round(it.worth || 0);
      let val = '';
      if (it.type === 'missingEmp') val = `<b class="money">${U.money(w, 0)}</b><small>שכר המשמרת</small>`;
      else if (it.type === 'diff') val = Math.abs(w) < 1 ? '<small>אותו שכר</small>' : w > 0 ? `<b class="money">${U.money(w, 0)}</b><small>פחות בדוח</small>` : `<b class="money">${U.money(-w, 0)}</b><small>יותר בדוח</small>`;
      else if (it.type === 'missingMine') val = w >= 1 ? `<b class="money">${U.money(w, 0)}</b><small>לפי הדוח</small>` : '';
      return `<div class="hc-item ${it.type}"><div class="hc-top"><span class="hc-tag">${typeName[it.type]}</span><b>${esc(day)}</b>${doubtful(it) ? `<i class="tag">${TO_CHECK}</i>` : ''}</div>
        <div class="hc-body"><div class="hc-lines">${lines.join('')}</div><div class="hc-val">${val}</div></div>
        ${it.after ? `<div class="tiny muted">אחרי השורה האחרונה בדוח. אולי הדוח עוד לא כולל את היום הזה.</div>` : ''}
        ${it.type === 'missingMine' && it.trial && it.canAdd ? `<button class="btn tonal sm" data-hc-add="${i}">${icon('plus', 's')} להוספה למשמרות שלי</button>` : ''}</div>`;
    }
    function result() {
      const bad = res.items.filter(shown);
      // money only for what is sure: a finding from a doubted row is listed and tagged, not summed
      const owed = bad.reduce((s, x) => s + (!x.doubt && (x.type === 'missingEmp' || (x.type === 'diff' && x.worth > 0)) ? x.worth : 0), 0);
      // the employer-side findings that are sure (a doubted one is to be checked first: no claim, no letter line)
      const nEmp = res.items.filter((x) => (x.type === 'missingEmp' || x.type === 'diff') && !x.doubt).length;
      const say = !bad.length ? 'הדוח תואם למשמרות שלך. אפשר לחכות לתלוש בראש שקט 🎉'
        : nEmp ? `מצאתי ${nEmp === 1 ? 'הבדל אחד' : `${nEmp} הבדלים`} שכדאי לבקש לתקן${owed >= 1 ? `, בשווי כ-${U.money(owed, 0)}` : ''}.`
          : !bad.some((x) => x.type === 'missingMine' && !x.unread && !x.doubt) ? 'כדאי לבדוק' // only unread or doubted rows: never "the same", never a claim
          : res.missingMine === 1 ? 'בדוח יש משמרת אחת שלא רשמת. כדאי לבדוק אותה.' : `בדוח יש ${res.missingMine} משמרות שלא רשמת. כדאי לבדוק אותן.`;
      const okItems = res.items.filter((x) => !shown(x));
      const span = per.label ? esc(per.label) : range(U.fmtDate(per.from, 'short'), U.fmtDate(per.to, 'short'));
      box.innerHTML = `${App.mascotSays ? App.mascotSays(bad.length ? 'think' : 'love', say, { size: 64 }) : ''}
        ${App.multiEmp() ? `<div class="field"><span class="lbl">של איזו עבודה הדוח?</span><div class="chips">${S.employers.map((e) => `<button class="chip ${e.id === empId ? 'on' : ''}" data-hc-emp="${esc(e.id)}" aria-pressed="${e.id === empId}">${esc(e.name || '')}</button>`).join('')}</div></div>` : ''}
        <div class="hc-period small muted">${span} · ${rows.length === 1 ? 'שורה אחת בדוח' : `${rows.length} שורות בדוח`}</div>
        <div class="kpis three hc-kpis">
          <div class="kpi"><div class="l">חסר אצל המעסיק</div><div class="v">${res.missingEmp}</div></div>
          <div class="kpi"><div class="l">שעות שונות</div><div class="v">${res.diff}</div></div>
          <div class="kpi"><div class="l">חסר אצלך</div><div class="v">${res.missingMine}</div></div></div>
        <div class="hc-list">${res.items.map((it, i) => (shown(it) ? itemHtml(it, i) : '')).join('')}</div>
        ${okItems.length ? `<details class="imp-paste hc-ok"><summary>${icon('check', 's')} ${okItems.length === 1 ? 'יום אחד תואם' : `${okItems.length} ימים תואמים`}</summary>
          ${okItems.map((it) => `<div class="kv"><span>${esc(U.DAYS[U.dow(it.date)])} ${U.fmtDate(it.date, 'short')}</span><span class="num">${it.mine.start && it.mine.end ? range(it.mine.start, it.mine.end) : ''}</span></div>`).join('')}</details>` : ''}
        <div class="tiny muted">השווי לפי החישוב של האפליקציה, כולל שעות נוספות, לילה ושבת. הפרש של עד 10 דקות נחשב תואם.</div>
        <button class="btn text block" data-hc-again>${icon('upload', 's')} דוח אחר</button>`;
      showFoot(nEmp > 0);
    }

    async function read(got) {
      const all = rowsOf(got);
      unreadRows = all.unreadRows || 0;
      rows = all.filter((r) => r.date <= U.todayKey());
      if (!rows.length) { none(); return; }
      compute();
      if (root.Fx) root.Fx.play('pick');
      result();
    }
    async function fromFile(file) {
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) { UI.invalid('הקובץ גדול מדי (עד 25MB)'); return; }
      busy('קורא את הדוח…');
      try {
        const got = await App.readHoursFile(file, progress, stop ? { signal: stop.signal } : undefined);
        if (entry.closed) return;
        await read(got);
      } catch (e) {
        if (entry.closed) return; // left while it read: no toast on another screen
        console.warn('hours check', e);
        start();
        UI.invalid(U.ours(e) ? e.message : 'לא הצלחנו לקרוא את הקובץ. אפשר לנסות קובץ אחר או להדביק טקסט');
      }
    }
    function letterSheet() {
      const text = root.HoursCheck.letter(res.items, per.label);
      if (!text) { UI.toast('אין מה לבקש לתקן בדוח הזה'); return; }
      UI.openSheet({
        title: 'הודעה למעסיק', cls: 'claim-letter',
        body: `<div class="small muted" style="margin-bottom:8px">אפשר לערוך לפני ששולחים.</div><textarea class="input" id="hc-letter" rows="12">${esc(text)}</textarea>`,
        foot: `<button class="btn tonal" data-hc-copy>${icon('copy', 's')} העתקה</button><button class="btn" data-hc-share>${icon('share', 's')} שיתוף</button>`,
        onMount: (el) => el.addEventListener('click', async (ev) => {
          const x = ev.target.closest('button');
          if (!x) return;
          const ta = el.querySelector('#hc-letter'), v = ta.value;
          const copy = async () => { try { await navigator.clipboard.writeText(v); UI.toast('הועתק ✓'); } catch (err) { ta.select(); UI.toast('מסמנים ומעתיקים'); } };
          if (x.hasAttribute('data-hc-copy')) copy();
          if (x.hasAttribute('data-hc-share')) { if (navigator.share) navigator.share({ text: v }).catch((err) => { if (!err || err.name !== 'AbortError') copy(); }); else copy(); }
        }),
      });
    }
    let adding = false; // a second tap while the first is being saved added the shift twice
    async function addMine(i) {
      const it = res.items[i];
      if (adding || !it || !it.trial || !it.canAdd) return;
      adding = true;
      try {
        // a shift I planned for that time is this shift: it becomes done with the report's hours (a second one
        // was added beside it, and the planned one stayed)
        const planned = S.shifts.filter((x) => x.status === 'planned' && x.employerId === it.trial.employerId && x.start < it.trial.end && x.end > it.trial.start);
        const s = planned.length === 1 && !(planned[0].splits && planned[0].splits.length)
          ? Object.assign({}, planned[0], { status: 'done', start: it.trial.start, end: it.trial.end })
          : Object.assign({}, it.trial, { id: U.uid(), note: 'נוסף מדוח הנוכחות' });
        await App.saveOps([{ store: 'shifts', put: s }], 'משמרת מדוח הנוכחות', 'המשמרת נוספה');
        compute();
        result();
      } finally { adding = false; }
    }

    entry.sh.addEventListener('change', (e) => { if (e.target.id === 'hc-file') fromFile(e.target.files && e.target.files[0]); });
    entry.sh.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-hc-read')) { const t = box.querySelector('#hc-text').value; if (t.trim()) read(t); else UI.invalid('מדביקים קודם את הטקסט'); }
      else if (b.hasAttribute('data-hc-again')) start();
      else if (b.dataset.hcEmp) { empId = b.dataset.hcEmp; compute(); result(); if (root.Fx) root.Fx.play('on'); }
      else if (b.dataset.hcAdd != null) addMine(+b.dataset.hcAdd);
      else if (b.hasAttribute('data-hc-letter')) letterSheet();
    });
    start();
    return { read }; // tests
  };
})(typeof window !== 'undefined' ? window : globalThis);
