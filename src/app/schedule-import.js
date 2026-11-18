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
    let who = []; // whose shifts (names, or "#2": a row whose name was not read)
    let found = false; // the app found the person's name itself (then the rows with no name are not offered)
    let unread = false; // the rows with no name are open under the names
    let week = SC().weekStartFor(U.todayKey());
    let rows = [];
    let roleId = S.meta.lastRole && App.roles().some((r) => r.id === S.meta.lastRole) ? S.meta.lastRole : (App.roles()[0] || {}).id;
    let lastFile = null;
    // leaving the sheet ends the reading itself (its OCR workers), not only what would land on the next screen
    const stop = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const entry = UI.openSheet({
      title: 'ייבוא סידור עבודה', full: true, cls: 'import-sheet sched-sheet',
      body: '<div id="sc"></div>',
      foot: '<button class="btn big" data-sc-save></button>',
      onClose: () => { if (stop) stop.abort(); },
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
        <label class="btn big block imp-pick">${icon('camera')} צילום או צילום מסך של הסידור<input type="file" id="sc-file" class="sr" accept="image/*,application/pdf"></label>
        ${opts.text ? '' : `<details class="imp-paste"${opts.paste ? ' open' : ''}><summary>${icon('chat', 's')} או להדביק את ההודעה מוואטסאפ</summary>
          <textarea class="input" id="sc-text" rows="6" placeholder="למשל:&#10;ראשון: דני 8-16, לי 16-24&#10;שני: לי 8-16"></textarea>
          <button class="btn tonal block" data-sc-read>${icon('check', 's')} קריאה</button></details>`}
        ${hasKey() ? `<label class="switch-row sc-ai"><span class="body"><span class="t">קריאה חכמה עם Claude</span><span class="s">לטבלאות מסובכות. התמונה נשלחת ל-\u2060Anthropic עם המפתח שלך</span></span><input type="checkbox" class="switch" id="sc-ai" ${S.meta.schedAi ? 'checked' : ''}></label>` : ''}
        <div class="tiny muted imp-privacy">${icon('shield', 's')} ${hasKey() ? 'בלי קריאה חכמה, ' : ''}הסידור נקרא בטלפון בלבד, ולא נשלח לשום מקום.</div>`;
      if (opts.text) { const t = opts.text; opts.text = null; parse(() => Object.assign(SC().parseText(t, { today: U.todayKey(), named: named(), mine: myNames() }), { text: t })); }
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
      // the sheet was closed while it read (a photo takes seconds): nothing is drawn, played or said any more
      if (entry.closed) return;
      let r;
      try { r = read(); } catch (e) { console.warn('schedule', e); r = null; }
      if (!r || !r.entries.length) { none(r && r.text); return; }
      res = r;
      // whose and which week: core/schedule.js decides (one code for the screen and its tests). A first name the
      // schedule gives two people ("דני כ.", "דני ל.") is not taken for either unless the person's family name
      // tells which; the week the message names ("סידור לשבוע הבא") wins over the usual one
      const o = SC().offer(r, { today: U.todayKey(), mine: myNames(), text: r.text || '' });
      who = o.who;
      found = who.length > 0;
      unread = false;
      week = o.week;
      if (root.Fx) root.Fx.play('pick');
      review();
    }
    function placed() {
      // the names chosen, each exactly: choosing "דני" never brings "דני כ." with it
      const es = res.personal ? res.entries : res.entries.filter((e) => who.includes(e.who));
      const prev = new Map(rows.map((r) => [r.k, r]));
      rows = SC().rowsOf(es, week, usualMin()).map((r) => {
        const k = [r.date, r.start, r.end].join('|');
        const old = prev.get(k);
        const start = U.toEpoch(r.date, r.start);
        let end = U.toEpoch(r.date, r.end); if (end <= start) end = U.toEpoch(U.addDays(r.date, 1), r.end);
        const emp = role() && role().employerId;
        const taken = S.shifts.some((x) => x.employerId === emp && x.start < end && x.end > start);
        return Object.assign(r, { k, s: start, e: end, taken, on: old ? old.on : SC().startsOn(r, U.todayKey(), taken) });
      });
      // a changed schedule: the planned shift an earlier one put on a day this one moves goes when the new one is
      // added (one save, so one undo brings both back). Only a shift the schedule added and nobody filled in since
      const r0 = role();
      const before = r0 ? S.shifts.filter((x) => x.employerId === r0.employerId && x.roleId === r0.id && x.status === 'planned' && x.note === 'מסידור העבודה' && !(x.items || []).length && !(x.splits || []).length)
        .map((x) => ({ id: x.id, date: U.epochKey(x.start), s: x.start, e: x.end })) : [];
      const mv = SC().moved(rows, before);
      rows.forEach((r, i) => { r.replaces = mv.get(i) || null; });
    }
    // a row's tags: what the person should know before it is added (also read out with the row)
    const tagsOf = (r) => [
      r.taken ? ['', 'כבר קיימת'] : null,
      r.replaces ? ['planned', `מחליפה את \u2066${U.epochHM(r.replaces.s)}\u2060–\u2060${U.epochHM(r.replaces.e)}\u2069`] : null,
      r.guess ? ['warn', 'שעה משוערת'] : null,
      r.e < Date.now() ? ['', 'עברה'] : null,
    ].filter(Boolean);
    // a row whose name was not read, shown by its first shifts ("א׳ 08:00–16:00  ג׳ 16:00–23:00", a comma between them for a screen reader)
    function unreadRow(tag) {
      const rs = SC().rowsOf(res.entries.filter((e) => e.who === tag), week, usualMin());
      const day = (r) => (U.DAYS_SHORT ? U.DAYS_SHORT[U.dow(r.date)] : U.fmtDate(r.date, 'short'));
      const shown = rs.slice(0, 3).map((r) => `<span class="sc-u-sh">${esc(day(r))} <span class="num">\u2066${r.start}\u2060–\u2060${r.end}\u2069</span></span>`).join('<span class="sr">, </span>');
      const more = rs.length > 3 ? `<small>${rs.length - 3 === 1 ? 'ועוד משמרת אחת' : `ועוד ${rs.length - 3} משמרות`}</small>` : '';
      return `<button class="imp-row sc-u ${who.includes(tag) ? 'on' : ''}" data-sc-who="${esc(tag)}" aria-pressed="${who.includes(tag)}"><span class="imp-check" aria-hidden="true">${icon('check', 's')}</span><span class="imp-d"><span class="sc-u-l">${shown}</span>${more}</span></button>`;
    }
    function review() {
      placed();
      const roles = App.roles();
      const names = res.personal ? [] : res.names;
      // the rows whose name was not read: offered when the person's name was not found (OCR often misses it)
      const nameless = names.length && !found ? res.unnamed || [] : [];
      const head = names.length && !who.length
        ? `${App.mascotSays ? App.mascotSays('think', `מצאתי בסידור ${names.length} שמות. מי את/ה?`, { size: 64 }) : ''}`
        : `${App.mascotSays ? App.mascotSays('love', rows.length ? `מצאתי ${rows.length === 1 ? 'משמרת אחת' : `${rows.length} משמרות`} שלך! 🎉 בודקים רגע ומוסיפים` : 'לא מצאתי משמרות בשם הזה', { size: 64 }) : ''}`;
      const thisWeek = U.addDays(U.todayKey(), -U.dow(U.todayKey())), nextWeek = U.addDays(thisWeek, 7);
      const { pay, best, scope } = payOf(thisWeek, nextWeek);
      const list = rows.map((r, i) => {
        const p = pay.get('sc' + i);
        const day = U.DAYS ? U.DAYS[U.dow(r.date)] : '';
        const tags = tagsOf(r);
        return `<div class="imp-row sc-row ${r.on ? 'on' : ''} ${best && best.id === 'sc' + i ? 'best' : ''}" data-i="${i}">
          <button class="sc-tog" data-sc-tog="${i}" aria-pressed="${r.on}" aria-label="${esc([day + ' ' + U.fmtDate(r.date, 'short')].concat(p && p.wage > 0 ? [U.money(p.wage, 0)] : [], tags.map((t) => t[1])).join(', '))}"><span class="imp-check" aria-hidden="true">${icon('check', 's')}</span>
            <span class="imp-d"><b>${esc(day)} ${U.fmtDate(r.date, 'short')}</b><small>${p && p.wage > 0 ? `<span class="sc-pay">${best && best.id === 'sc' + i ? `<span class="sc-star" aria-hidden="true">${icon('star', 's')}</span>` : ''}<span class="num">${UI.money(p.wage, 0)}</span></span>` : ''}${tags.map(([c, t]) => `<i class="tag${c ? ' ' + c : ''}">${t}</i>`).join('')}</small></span></button>
          <button class="sc-time" data-sc-time="${i}" aria-label="שינוי השעות"><span class="num">\u2066${r.start}\u2060–\u2060${r.end}\u2069</span>${icon('edit', 's')}</button></div>`;
      }).join('');
      box.innerHTML = `${head}
        ${res.pages > res.pagesRead ? `<div class="tiny muted imp-note">${icon('info', 's')} קראנו את ${res.pagesRead} העמודים הראשונים מתוך ${res.pages}. את השאר אפשר להעלות בקובץ נפרד.</div>` : ''}
        ${names.length ? `<div class="field"><span class="lbl">${who.length ? 'המשמרות של' : 'מי את/ה בסידור?'}</span><div class="chips wrap sc-names">${names.map((n) => `<button class="chip ${who.includes(n) ? 'on' : ''}" data-sc-who="${esc(n)}" aria-pressed="${who.includes(n)}">${esc(n)}</button>`).join('')}${nameless.length ? `<button class="chip sc-u-chip ${unread ? 'on' : ''}" data-sc-unread aria-expanded="${unread}" aria-controls="sc-unread">השורה שלי בלי שם</button>` : ''}</div>
          ${nameless.length && unread ? `<div class="imp-list sc-u-list" id="sc-unread" role="group" aria-label="השורות בלי שם בסידור">${nameless.map(unreadRow).join('')}</div>` : ''}</div>` : ''}
        ${res.needsWeek && (who.length || !names.length) ? `<div class="field"><span class="lbl">לאיזה שבוע?</span><div class="chips sc-week">${[[thisWeek, 'השבוע'], [nextWeek, 'שבוע הבא']].map(([k, t]) => `<button class="chip ${week === k ? 'on' : ''}" data-sc-week="${k}" aria-pressed="${week === k}">${t} · מ-${U.fmtDate(k, 'short')}</button>`).join('')}</div></div>` : ''}
        ${roles.length > 1 && rows.length ? `<div class="field"><span class="lbl">לאיזה תפקיד לשייך?</span><div class="chips imp-roles">${roles.map((r) => `<button class="chip ${r.id === roleId ? 'on' : ''}" data-sc-role="${esc(r.id)}"><span class="sw" style="background:${r.color}"></span>${esc(r.name)}${App.multiEmp() ? ' · ' + esc((App.employer(r.employerId) || {}).name || '') : ''}</button>`).join('')}</div></div>` : ''}
        ${rows.length && best && App.planner ? App.planner.bestLine(best, scope) : ''}
        ${rows.length ? `<div class="imp-list sc-list">${list}</div>
          ${rows.some((r) => r.guess) ? `<div class="tiny muted imp-note">${icon('info', 's')} "שעה משוערת": לפי שם המשמרת או האורך הרגיל שלך. לחיצה על השעות משנה אותן.</div>` : ''}
          ${S.settings.alerts && !S.settings.alerts.remindPlanned ? `<label class="switch-row"><span class="body"><span class="t">להזכיר לי לפני כל משמרת</span><span class="s">שעה לפני, בהתראה</span></span><input type="checkbox" class="switch" id="sc-remind"></label>` : ''}` : ''}`;
      showSave(rows.length > 0);
      count();
    }
    // what each shift of the schedule would pay (the engine, with the week already in the app), and the best of them
    function payOf(thisWeek, nextWeek) {
      const r0 = role();
      const none = { pay: new Map(), best: null, scope: '' };
      if (!r0 || !root.Planner || !App.model) return none;
      const emp = App.employer(r0.employerId) || S.employers[0] || {};
      const cands = rows.map((r, i) => (r.taken ? null : { id: 'sc' + i, kind: 'shift', employerId: r0.employerId, roleId: r0.id, status: 'planned', start: r.s, end: r.e, breakMin: null, breakPaid: emp.defaultBreakPaid !== false, splits: [], items: [] })).filter(Boolean);
      // a shift the new schedule moves is not in the week it is paid with
      const gone = new Set(rows.filter((r) => r.replaces).map((r) => r.replaces.id));
      let pay;
      try { pay = root.Planner.expected(gone.size ? S.shifts.filter((x) => !gone.has(x.id)) : S.shifts, App.model.ctx, cands); } catch (e) { console.warn('schedule pay', e); return none; }
      const best = App.planner.best(pay.values());
      const weeks = new Set(rows.map((r) => root.Planner.weekOf(r.s)));
      const w = weeks.size === 1 ? [...weeks][0] : null;
      return { pay, best, scope: w === thisWeek ? 'המשמרת הכי משתלמת השבוע' : w === nextWeek ? 'המשמרת הכי משתלמת בשבוע הבא' : 'המשמרת הכי משתלמת בסידור' };
    }
    // a tap that draws the review again keeps the control tapped where it was under the finger (the text over it
    // can grow: "who are you?" becomes "found 2 shifts of yours" on two lines, and pushed the rows down)
    function redraw(b) {
      const body = entry.sh.querySelector('.sh-body');
      const a = b && ['data-sc-who', 'data-sc-unread', 'data-sc-week', 'data-sc-role', 'data-sc-time'].find((x) => b.hasAttribute(x));
      const sel = a ? `[${a}${b.getAttribute(a) ? `="${CSS.escape(b.getAttribute(a))}"` : ''}]` : null;
      const top = sel && b.isConnected ? b.getBoundingClientRect().top : null;
      review();
      const n = top != null && body ? box.querySelector(sel) : null;
      if (n) body.scrollTop += n.getBoundingClientRect().top - top;
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
        const got = await App.readDocWords(file, progress, stop ? { signal: stop.signal } : undefined);
        if (entry.closed) return;
        // the words with their places only: parseWords reads a picture that is no table as text itself, line by
        // line. Its text read again as one line put a whole table's shifts on its last date, nobody's name on
        // them (schedule bench, 17 Nov 2026)
        // (pages, pagesRead: a long PDF read on its first pages only, said on the review)
        parse(() => Object.assign(SC().parseWords(got.words, { today: U.todayKey(), named: named(), mine: myNames() }), { text: got.text, pages: got.pages, pagesRead: got.pagesRead }));
      } catch (e) {
        console.warn('schedule', e);
        if (entry.closed) return;
        start();
        UI.invalid(root.DocRead.trouble(e) || (root.U.ours(e) ? e.message : 'לא הצלחנו לקרוא את הסידור. אפשר לנסות שוב או להדביק את ההודעה'));
      }
    }
    // the picture, read by Claude (the person's own key; asked first, since it goes to Anthropic)
    async function viaClaude(file) {
      const ok = await UI.confirm('קריאה חכמה עם Claude', 'התמונה של הסידור, עם השמות שבה, תישלח ל-\u2060Anthropic עם המפתח שלך, רק כדי לקרוא אותה. השימוש מחויב בחשבון ה-\u2060API שלך.', 'לשלוח');
      if (entry.closed) return;
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
        if (entry.closed) return;
        start();
        UI.dialog({ title: 'הקריאה החכמה נכשלה', text: root.DocRead.trouble(e) || (root.U.ours(e) ? e.message : 'לא הצלחנו לקרוא את התשובה של Claude. נסו שוב, או הוסיפו את המשמרות ידנית.'), buttons: [{ label: 'סגור', value: true }] });
      }
    }
    async function add() {
      const r0 = role();
      if (!r0) return;
      const emp = App.employer(r0.employerId) || S.employers[0];
      const on = rows.filter((r) => r.on);
      const ops = on.map((r) => ({ store: 'shifts', put: {
        id: U.uid(), kind: 'shift', employerId: r0.employerId, roleId: r0.id, status: r.e > Date.now() ? 'planned' : 'done', start: r.s, end: r.e,
        breakMin: null, breakPaid: emp.defaultBreakPaid !== false, noTravel: false, splits: [], items: [], note: 'מסידור העבודה',
      } }));
      if (!ops.length) return;
      // the shifts the new schedule moved: removed in the same save (one undo restores them)
      for (const id of new Set(on.filter((r) => r.replaces).map((r) => r.replaces.id))) ops.push({ store: 'shifts', del: id });
      save.disabled = true;
      const remind = !!(box.querySelector('#sc-remind') || {}).checked;
      // the name to remember is a name: never "#2" (a row with no name the person pointed at)
      const name = (who.find((n) => !SC().isRowTag(n)) || (box.querySelector('#sc-name') || {}).value || '').trim();
      UI.closeTop();
      if (name && name !== S.meta.schedName) await Store.setMeta({ schedName: name });
      if (remind) await Store.setSettings((st) => { st.alerts.remindPlanned = true; });
      const n = on.length;
      await App.saveOps(ops, 'ייבוא סידור עבודה', n === 1 ? 'משמרת אחת נוספה ללוח' : `${n} משמרות נוספו ללוח 📅`);
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
        if (t.trim()) parse(() => Object.assign(SC().parseText(t, { today: U.todayKey(), named: named(), mine: myNames() }), { text: t })); else UI.invalid('מדביקים קודם את ההודעה');
      } else if (b.hasAttribute('data-sc-again')) start();
      else if (b.hasAttribute('data-sc-ai-now') && lastFile) viaClaude(lastFile);
      else if (b.dataset.scWho != null) {
        const n = b.dataset.scWho;
        who = who.includes(n) ? who.filter((x) => x !== n) : who.concat([n]);
        if (root.Fx) root.Fx.play('on');
        redraw(b);
      } else if (b.hasAttribute('data-sc-unread')) {
        // closing the list lets go of the rows picked in it
        unread = !unread;
        if (!unread) who = who.filter((n) => !SC().isRowTag(n));
        if (root.Fx) root.Fx.play(unread ? 'on' : 'off');
        redraw(b);
      } else if (b.dataset.scWeek) { week = b.dataset.scWeek; if (root.Fx) root.Fx.play('on'); redraw(b); }
      else if (b.dataset.scRole) { roleId = b.dataset.scRole; rows.forEach((r) => { r.on = null; }); rows = []; if (root.Fx) root.Fx.play('on'); redraw(b); }
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
        // the row's own entry (found by date and start, a second week's shift changed the first week's)
        const src = r.src;
        if (src) { src.start = st; src.end = en; src.guess = null; }
        redraw(b);
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
    // i18n-keep the model's instructions (English, with the Hebrew of the schedules it reads)
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
    // the phone's share sheet posts here, but so can any website's form: nothing is read before one tap
    // (a shared spreadsheet was parsed at once; security scan, 1 Nov 2026)
    if (!file && !text.trim()) return;
    if (!(await UI.confirm('לפתוח את מה ששיתפת עם שעתי?', file ? file.name : text.slice(0, 80), 'אישור'))) return;
    if (!file) {
      if (!text.trim()) return;
      // read by both (an hours report's lines are also dated shifts): the person says which it is
      const kind = SC().shareKind(text, { today: U.todayKey(), named: named(), mine: myNames() }, root.Timesheet);
      if (kind === 'hours') { App.importHours({ text }); return; }
      if (kind !== 'ask') { App.importSchedule({ text }); return; }
    }
    if (file && (/\.(xlsx|xlsm|xls|ods|csv|tsv)$/i.test(file.name) || /spreadsheet|excel|csv/i.test(file.type))) { App.importHours({ file }); return; }
    if (UI.sheets.length) UI.closeAll();
    const tile = (k, ic, tint, t, sub) => `<button class="am-tile" data-share-as="${k}">${UI.tile(ic, tint)}<span class="am-t">${t}</span><span class="am-s">${sub}</span></button>`;
    UI.openSheet({
      title: 'מה שיתפת?', cls: 'share-sheet',
      // a payslip is read from a file only: shared text offers the two that read text
      body: `<div class="am-grid share-as">${tile('schedule', 'calendar', 'sky', 'סידור עבודה', 'למשמרות בלוח')}${file ? tile('payslip', 'receipt', 'mint', 'תלוש שכר', 'לבדיקה') : ''}${tile('hours', 'upload', 'violet', 'דוח שעות', 'למשמרות שהיו')}</div>`,
      onMount: (el) => el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-share-as]');
        if (!b) return;
        const k = b.dataset.shareAs;
        UI.closeTop();
        setTimeout(() => {
          // each with what was shared: the file, or the text (the hours tile opened an empty import for text)
          const what = file ? { file } : { text };
          if (k === 'schedule') App.importSchedule(what);
          else if (k === 'payslip') App.payslipFromFile(file);
          else App.importHours(what);
        }, 320);
      }),
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
