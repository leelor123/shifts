/* ============================================================
 * schedule-import.js — "I got the work schedule": a photo or a screenshot of it, or the WhatsApp message,
 * becomes the person's planned shifts.
 *
 * Read on the phone (core/schedule.js): a message as text; a photo with the Hebrew OCR, word by word with
 * their places, so a table's columns and rows hold. With the person's own Claude key a photo can be read by
 * Claude instead (asked first; the picture is sent to Anthropic). A schedule with names keeps the person's
 * shifts (their name is remembered, and when it is not there the names found are offered); day names land in
 * the week chosen (this one until Wednesday, then the next). Every shift is shown before anything is added, a
 * guessed time says so and can be set, one already in the app starts left out, and one tap adds them.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const SC = () => root.Schedule;

  // the person's own shift names (templates): "קופה" → its hours
  const named = () => Object.fromEntries((S.templates || []).filter((t) => t.name && t.startT && t.endT).map((t) => [t.name.trim(), [t.startT, t.endT]]));
  // their name as it is likely written in a schedule: the one used last, else the first name
  function myNames() {
    const out = [];
    if (S.meta.schedName) out.push(S.meta.schedName);
    for (const n of [S.settings.userName, S.meta.cloudName]) {
      const v = String(n || '').trim();
      if (v && !out.includes(v)) { out.push(v); const first = v.split(/\s+/)[0]; if (first !== v && !out.includes(first)) out.push(first); }
    }
    return out;
  }

  App.actions['import-schedule'] = () => App.importSchedule();
  App.importSchedule = function (opts) {
    opts = opts || {};
    if (UI.sheets.length && !opts.over) UI.closeAll();
    let res = null; // what was read: { entries, names, personal, needsWeek }
    let who = []; // whose shifts (names)
    let week = SC().weekStartFor(U.todayKey());
    let rows = [];
    let roleId = S.meta.lastRole && App.roles().some((r) => r.id === S.meta.lastRole) ? S.meta.lastRole : (App.roles()[0] || {}).id;
    let lastFile = null;
    const entry = UI.openSheet({
      title: 'ייבוא סידור עבודה', full: true, cls: 'import-sheet sched-sheet',
      body: '<div id="sc"></div>',
      foot: '<button class="btn big" data-sc-save></button>',
    });
    const box = entry.sh.querySelector('#sc');
    const save = entry.sh.querySelector('[data-sc-save]');
    const showSave = (on) => { const f = entry.sh.querySelector('.sh-foot'); if (f) f.style.display = on ? '' : 'none'; };
    const role = () => App.roles().find((r) => r.id === roleId) || App.roles()[0];
    const usualMin = () => Math.round((App.usualShiftMs ? App.usualShiftMs(roleId) : 0) / 60000) || 480;
    const hasKey = () => !!(S.settings.ai && S.settings.ai.apiKey);

    function start() {
      showSave(false);
      const name = myNames()[0] || '';
      box.innerHTML = `${App.mascotSays ? App.mascotSays('happy', 'קיבלת סידור עבודה? צלם אותו או הדבק את ההודעה, ואכניס את המשמרות שלך ללוח 📅', { size: 64 }) : ''}
        <label class="field"><span class="lbl">השם שלך בסידור</span><input class="input" id="sc-name" value="${esc(name)}" placeholder="למשל: לי" autocomplete="given-name"></label>
        <label class="btn big block imp-pick">${icon('camera')} צילום או צילום מסך של הסידור<input type="file" id="sc-file" hidden accept="image/*,application/pdf"></label>
        ${opts.text ? '' : `<details class="imp-paste"${opts.paste ? ' open' : ''}><summary>${icon('chat', 's')} או להדביק את ההודעה מוואטסאפ</summary>
          <textarea class="input" id="sc-text" rows="6" placeholder="למשל:&#10;ראשון: דני 8-16, לי 16-24&#10;שני: לי 8-16"></textarea>
          <button class="btn tonal block" data-sc-read>${icon('check', 's')} קריאה</button></details>`}
        ${hasKey() ? `<label class="switch-row sc-ai"><span class="body"><span class="t">קריאה חכמה עם Claude</span><span class="s">לטבלאות מסובכות. התמונה נשלחת ל-⁠Anthropic עם המפתח שלך</span></span><input type="checkbox" class="switch" id="sc-ai" ${S.meta.schedAi ? 'checked' : ''}></label>` : ''}
        <div class="tiny muted imp-privacy">${icon('shield', 's')} ${hasKey() ? 'בלי קריאה חכמה, ' : ''}הסידור נקרא בטלפון בלבד, ולא נשלח לשום מקום.</div>`;
      if (opts.text) { const t = opts.text; opts.text = null; parse(() => SC().parseText(t, { today: U.todayKey(), named: named() })); }
    }
    function busy(text) { showSave(false); box.innerHTML = `<div class="imp-busy">${App.mascot ? App.mascot('think', { size: 84 }) : ''}<div class="imp-bar" aria-hidden="true"><i></i></div><div class="small" id="sc-progress" role="status">${esc(text)}</div></div>`; }
    function progress(text) { const p = box.querySelector('#sc-progress'); if (p) p.textContent = text; }
    function none(sample) {
      showSave(false);
      box.innerHTML = `${App.mascotSays ? App.mascotSays('think', 'לא מצאתי בסידור משמרות שאני יודע לקרוא 🤔', { size: 64 }) : ''}
        <div class="card small imp-tips"><b>מה עוזר:</b><ul><li>צילום ישר, חד ומואר של הטבלה (צילום מסך הכי טוב)</li><li>להדביק את ההודעה מוואטסאפ במקום תמונה שלה</li><li>שליד כל יום יהיו שעות, למשל: ראשון 8-16</li></ul></div>
        ${sample ? `<details class="imp-paste"><summary>מה שנקרא</summary><div class="code">${esc(sample.slice(0, 1500))}</div></details>` : ''}
        ${hasKey() && lastFile && /^image\//.test(lastFile.type) ? `<button class="btn tonal block" data-sc-ai-now>${icon('sparkle', 's')} לנסות קריאה חכמה עם Claude</button>` : ''}
        <button class="btn tonal block" data-sc-again>${icon('camera', 's')} לנסות שוב</button>`;
    }
    // what was read → whose (the person's name, or the names to choose from) → the review
    function parse(read) {
      let r;
      try { r = read(); } catch (e) { console.warn('schedule', e); r = null; }
      if (!r || !r.entries.length) { none(r && r.text); return; }
      res = r;
      const mine = myNames();
      who = res.personal ? [] : res.names.filter((n) => SC().isMine(n, mine));
      if (root.Fx) root.Fx.play('pick');
      review();
    }
    function placed() {
      const es = res.personal ? res.entries : res.entries.filter((e) => who.some((w) => SC().isMine(e.who, [w])));
      const prev = new Map(rows.map((r) => [r.k, r]));
      rows = SC().rowsOf(es, week, usualMin()).map((r) => {
        const k = [r.date, r.start, r.end].join('|');
        const old = prev.get(k);
        const start = U.toEpoch(r.date, r.start);
        let end = U.toEpoch(r.date, r.end); if (end <= start) end = U.toEpoch(U.addDays(r.date, 1), r.end);
        const emp = role() && role().employerId;
        const taken = S.shifts.some((x) => x.employerId === emp && x.start < end && x.end > start);
        return Object.assign(r, { k, s: start, e: end, taken, on: old ? old.on : !taken });
      });
    }
    function review() {
      placed();
      const roles = App.roles();
      const names = res.personal ? [] : res.names;
      const head = names.length && !who.length
        ? `${App.mascotSays ? App.mascotSays('think', `מצאתי בסידור ${names.length} שמות. מי את/ה?`, { size: 64 }) : ''}`
        : `${App.mascotSays ? App.mascotSays('love', rows.length ? `מצאתי ${rows.length === 1 ? 'משמרת אחת' : rows.length + ' משמרות'} שלך! 🎉 בודקים רגע ומוסיפים` : 'לא מצאתי משמרות בשם הזה', { size: 64 }) : ''}`;
      const thisWeek = U.addDays(U.todayKey(), -U.dow(U.todayKey())), nextWeek = U.addDays(thisWeek, 7);
      const list = rows.map((r, i) => {
        const day = U.HEB_DAYS ? U.HEB_DAYS[U.dow(r.date)] : '';
        return `<div class="imp-row sc-row ${r.on ? 'on' : ''}" data-i="${i}">
          <button class="sc-tog" data-sc-tog="${i}" aria-pressed="${r.on}" aria-label="${esc(day + ' ' + U.fmtDate(r.date, 'short'))}"><span class="imp-check" aria-hidden="true">${icon('check', 's')}</span>
            <span class="imp-d"><b>${esc(day)} ${U.fmtDate(r.date, 'short')}</b><small>${r.taken ? '<i class="tag">כבר קיימת</i>' : ''}${r.guess ? '<i class="tag warn">שעה משוערת</i>' : ''}${r.e < Date.now() ? '<i class="tag">עברה</i>' : ''}</small></span></button>
          <button class="sc-time" data-sc-time="${i}" aria-label="שינוי השעות"><span class="num">⁦${r.start}⁠–⁠${r.end}⁩</span>${icon('edit', 's')}</button></div>`;
      }).join('');
      box.innerHTML = `${head}
        ${names.length ? `<div class="field"><span class="lbl">${who.length ? 'המשמרות של' : 'מי את/ה בסידור?'}</span><div class="chips sc-names">${names.map((n) => `<button class="chip ${who.includes(n) ? 'on' : ''}" data-sc-who="${esc(n)}" aria-pressed="${who.includes(n)}">${esc(n)}</button>`).join('')}</div></div>` : ''}
        ${res.needsWeek && (who.length || !names.length) ? `<div class="field"><span class="lbl">לאיזה שבוע?</span><div class="chips sc-week">${[[thisWeek, 'השבוע'], [nextWeek, 'שבוע הבא']].map(([k, t]) => `<button class="chip ${week === k ? 'on' : ''}" data-sc-week="${k}" aria-pressed="${week === k}">${t} · מ-${U.fmtDate(k, 'short')}</button>`).join('')}</div></div>` : ''}
        ${roles.length > 1 && rows.length ? `<div class="field"><span class="lbl">לאיזה תפקיד לשייך?</span><div class="chips imp-roles">${roles.map((r) => `<button class="chip ${r.id === roleId ? 'on' : ''}" data-sc-role="${r.id}"><span class="sw" style="background:${r.color}"></span>${esc(r.name)}${App.multiEmp() ? ' · ' + esc((App.employer(r.employerId) || {}).name || '') : ''}</button>`).join('')}</div></div>` : ''}
        ${rows.length ? `<div class="imp-list sc-list">${list}</div>
          ${rows.some((r) => r.guess) ? `<div class="tiny muted imp-note">${icon('info', 's')} "שעה משוערת": לפי שם המשמרת או האורך הרגיל שלך. לחיצה על השעות משנה אותן.</div>` : ''}
          ${S.settings.alerts && !S.settings.alerts.remindPlanned ? `<label class="switch-row"><span class="body"><span class="t">להזכיר לי לפני כל משמרת</span><span class="s">שעה לפני, בהתראה</span></span><input type="checkbox" class="switch" id="sc-remind"></label>` : ''}` : ''}`;
      showSave(rows.length > 0);
      count();
    }
    function count() {
      const n = rows.filter((r) => r.on).length;
      save.disabled = !n;
      save.innerHTML = `${icon('calendar', 's')} ${n === 1 ? 'הוספת משמרת אחת ללוח' : `הוספת ${n} משמרות ללוח`}`;
    }
    async function fromFile(file) {
      if (!file) return;
      lastFile = file;
      if (file.size > 25 * 1024 * 1024) { UI.invalid('הקובץ גדול מדי (עד 25MB)'); return; }
      const ai = hasKey() && /^image\//.test(file.type) && !!(box.querySelector('#sc-ai') || {}).checked;
      if (ai) { await viaClaude(file); return; }
      busy('קורא את הסידור…');
      try {
        const got = await App.readDocWords(file, progress);
        parse(() => {
          const r = SC().parseWords(got.words, { today: U.todayKey(), named: named() });
          if (!r.entries.length && got.text) Object.assign(r, SC().parseText(got.text, { today: U.todayKey(), named: named() }));
          r.text = got.text;
          return r;
        });
      } catch (e) {
        console.warn('schedule', e);
        start();
        UI.invalid(e && e.message && /[א-ת]/.test(e.message) ? e.message : 'לא הצלחנו לקרוא את הסידור. אפשר לנסות שוב או להדביק את ההודעה');
      }
    }
    // the picture, read by Claude (the person's own key; asked first, since it goes to Anthropic)
    async function viaClaude(file) {
      const ok = await UI.confirm('קריאה חכמה עם Claude', 'התמונה של הסידור, עם השמות שבה, תישלח ל-⁠Anthropic עם המפתח שלך, רק כדי לקרוא אותה. השימוש מחויב בחשבון ה-⁠API שלך.', 'לשלוח');
      if (!ok) { start(); return; }
      busy('Claude קורא את הסידור…');
      try {
        const data = await jpegBase64(file);
        const json = await App.claudeJson(aiPrompt(), [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          { type: 'text', text: 'Read every shift in this work schedule.' },
        ], AI_SCHEMA);
        parse(() => fromAi(json));
      } catch (e) {
        console.warn('schedule ai', e);
        start();
        UI.dialog({ title: 'הקריאה החכמה נכשלה', text: String((e && e.message) || e), buttons: [{ label: 'סגור', value: true }] });
      }
    }
    async function add() {
      const r0 = role();
      if (!r0) return;
      const emp = App.employer(r0.employerId) || S.employers[0];
      const ops = rows.filter((r) => r.on).map((r) => ({ store: 'shifts', put: {
        id: U.uid(), kind: 'shift', employerId: r0.employerId, roleId: r0.id, status: r.e > Date.now() ? 'planned' : 'done', start: r.s, end: r.e,
        breakMin: null, breakPaid: emp.defaultBreakPaid !== false, noTravel: false, splits: [], items: [], note: 'מסידור העבודה',
      } }));
      if (!ops.length) return;
      save.disabled = true;
      const remind = !!(box.querySelector('#sc-remind') || {}).checked;
      const name = (who[0] || (box.querySelector('#sc-name') || {}).value || '').trim();
      UI.closeTop();
      if (name && name !== S.meta.schedName) await Store.setMeta({ schedName: name });
      if (remind) await Store.setSettings((st) => { st.alerts.remindPlanned = true; });
      await App.saveOps(ops, 'ייבוא סידור עבודה', ops.length === 1 ? 'משמרת אחת נוספה ללוח' : `${ops.length} משמרות נוספו ללוח 📅`);
      if (root.Fx) root.Fx.celebrate('big');
    }

    entry.sh.addEventListener('change', (e) => {
      if (e.target.id === 'sc-file') fromFile(e.target.files && e.target.files[0]);
      if (e.target.id === 'sc-ai') Store.setMeta({ schedAi: e.target.checked }).catch(() => {});
      if (e.target.id === 'sc-name') { const v = e.target.value.trim(); if (v) S.meta.schedName = v; }
    });
    entry.sh.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-sc-read')) {
        const t = box.querySelector('#sc-text').value;
        const n = (box.querySelector('#sc-name') || {}).value;
        if (n && n.trim()) S.meta.schedName = n.trim();
        if (t.trim()) parse(() => Object.assign(SC().parseText(t, { today: U.todayKey(), named: named() }), { text: t })); else UI.invalid('מדביקים קודם את ההודעה');
      } else if (b.hasAttribute('data-sc-again')) start();
      else if (b.hasAttribute('data-sc-ai-now') && lastFile) viaClaude(lastFile);
      else if (b.dataset.scWho != null) {
        const n = b.dataset.scWho;
        who = who.includes(n) ? who.filter((x) => x !== n) : who.concat([n]);
        if (root.Fx) root.Fx.play('on');
        review();
      } else if (b.dataset.scWeek) { week = b.dataset.scWeek; if (root.Fx) root.Fx.play('on'); review(); }
      else if (b.dataset.scRole) { roleId = b.dataset.scRole; rows.forEach((r) => { r.on = null; }); rows = []; if (root.Fx) root.Fx.play('on'); review(); }
      else if (b.dataset.scTog != null) {
        const r = rows[+b.dataset.scTog];
        r.on = !r.on;
        const row = b.closest('.sc-row');
        row.classList.toggle('on', r.on); b.setAttribute('aria-pressed', String(r.on));
        if (root.Fx) root.Fx.play(r.on ? 'on' : 'off');
        count();
      } else if (b.dataset.scTime != null) {
        const r = rows[+b.dataset.scTime];
        const st = await UI.pickTime({ value: r.start, title: 'שעת התחלה' });
        if (!st) return;
        const en = await UI.pickTime({ value: r.end, title: 'שעת סיום' });
        if (!en) return;
        // the change is kept for this shift (its key changes, so it is found by its place in the list)
        const src = res.entries.find((x) => (x.date || U.addDays(week, x.dow)) === r.date && x.start === r.start);
        if (src) { src.start = st; src.end = en; src.guess = null; }
        review();
      } else if (b.hasAttribute('data-sc-save')) add();
    });
    start();
    // a picture that came from elsewhere (shared to the app from WhatsApp): read at once
    if (opts.file) fromFile(opts.file);
  };

  /* ---------------- Claude (optional) ---------------- */
  const AI_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['shifts'],
    properties: { shifts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['who', 'date', 'day', 'start', 'end'],
      properties: { who: { type: 'string' }, date: { type: 'string' }, day: { type: 'integer' }, start: { type: 'string' }, end: { type: 'string' } } } } },
  };
  function aiPrompt() {
    const t = U.todayKey();
    return `You read a work schedule (usually Hebrew, sometimes English) from a picture and list every shift of every person in it.
Today is ${t} (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][U.dow(t)]}). Weeks start on Sunday.
For each shift give: who (the person's name exactly as written; "" if the schedule has no names), date (YYYY-MM-DD when the schedule shows dates, else ""), day (0=Sunday … 6=Saturday, the day of the week; -1 if unknown), start and end ("HH:MM", 24-hour; an end on the next morning is just its time).
A cell with only a shift name and no hours: use בוקר 07:00-15:00, צהריים 11:00-19:00, ערב 15:00-23:00, לילה 23:00-07:00. Leave out days off (חופש, OFF, empty cells). Do not invent shifts.`;
  }
  function fromAi(json) {
    const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m && +m[1] < 24 && +m[2] < 60 ? String(+m[1]).padStart(2, '0') + ':' + m[2] : null; };
    const entries = ((json && json.shifts) || []).map((x) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : null;
      const start = hm(x.start), end = hm(x.end);
      const dow = date ? U.dow(date) : (x.day >= 0 && x.day <= 6 ? x.day : null);
      if (!start || !end || (date == null && dow == null)) return null;
      return { date, dow, start, end, guess: null, label: start + '-' + end, who: String(x.who || '').trim() };
    }).filter(Boolean);
    const names = [...new Set(entries.map((e) => e.who).filter(Boolean))];
    return { entries, names, personal: !names.length, needsWeek: entries.some((e) => e.date == null) };
  }
  async function jpegBase64(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }
  App.scheduleFromAi = fromAi; // tests

  /* ---------------- shared to the app (Android's share sheet) ----------------
   * The service worker keeps what was shared (sw.js); here it goes where it belongs: a spreadsheet to the hours
   * report; text to the work schedule (or the hours report, when it reads as one); a picture or a PDF asks
   * what it is (a work schedule, a payslip, an hours report). */
  App.receiveShare = async function () {
    let meta = null, file = null;
    try {
      const cache = await caches.open('shiftpay-share');
      const m = await cache.match('./__share/meta');
      if (m) meta = await m.json();
      const r = await cache.match('./__share/file');
      if (r && meta) { const blob = await r.blob(); file = new File([blob], meta.name || 'shared', { type: meta.type || blob.type || '' }); }
      await cache.delete('./__share/meta');
      await cache.delete('./__share/file');
    } catch (e) { console.warn('share', e); }
    if (!meta || Date.now() - (+meta.at || 0) > 10 * 60000) return; // nothing, or an old one
    const text = String(meta.text || '');
    if (!file) {
      if (!text.trim()) return;
      const today = U.todayKey();
      const asSchedule = SC().parseText(text, { today, named: named() }).entries.length;
      if (!asSchedule && root.Timesheet && root.Timesheet.parse(text, { today }).rows.length) App.importHours({ text });
      else App.importSchedule({ text });
      return;
    }
    if (/\.(xlsx|xlsm|xls|ods|csv|tsv)$/i.test(file.name) || /spreadsheet|excel|csv/i.test(file.type)) { App.importHours({ file }); return; }
    if (UI.sheets.length) UI.closeAll();
    const tile = (k, ic, tint, t, sub) => `<button class="am-tile" data-share-as="${k}">${UI.tile(ic, tint)}<span class="am-t">${t}</span><span class="am-s">${sub}</span></button>`;
    UI.openSheet({
      title: 'מה שיתפת?', cls: 'share-sheet',
      body: `<div class="am-grid share-as">${tile('schedule', 'calendar', 'sky', 'סידור עבודה', 'למשמרות בלוח')}${tile('payslip', 'receipt', 'mint', 'תלוש שכר', 'לבדיקה')}${tile('hours', 'upload', 'violet', 'דוח שעות', 'למשמרות שהיו')}</div>`,
      onMount: (el) => el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-share-as]');
        if (!b) return;
        const k = b.dataset.shareAs;
        UI.closeTop();
        setTimeout(() => {
          if (k === 'schedule') App.importSchedule({ file });
          else if (k === 'payslip') App.payslipFromFile(file);
          else App.importHours({ file });
        }, 320);
      }),
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
