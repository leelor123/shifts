/* ============================================================
 * views-shift.js — add menu, shift editor (with splits, items and
 * manual overrides), transparent breakdown, entries, templates,
 * day sheet and role picker.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, HebCal, Store, UI, App } = root;
  const S = Store.S;
  const { icon, esc, money } = UI;

  /* ---------------- role picker ---------------- */
  App.sheetsApi.pickRole = function (title, cb, roles) {
    const list = roles || App.roles();
    const sh = UI.openSheet({
      title,
      body: `<div class="list">${list.map((r) => `<button class="item" data-pick="${r.id}"><span class="lead" style="background:${r.color};color:#fff">${esc(r.name.slice(0, 1))}</span><span class="body"><span class="t">${esc(r.name)}</span><span class="s">${money(Engine.roleRate(r, U.todayKey()))} לשעה${App.multiEmp() ? ' · ' + esc(App.employer(r.employerId).name) : ''}</span></span></button>`).join('')}</div>`,
      onMount: (el) => el.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { UI.closeTop(); setTimeout(() => cb(b.dataset.pick), 50); })),
    });
    return sh;
  };

  /* ---------------- add menu ---------------- */
  /* everything that can be added, as big tiles that all fit on one screen (nothing hides below the fold) */
  App.actions['add-menu'] = () => {
    const tpls = S.templates;
    const tile = (act, ic, tint, t, cls, extra, sub) => `<button class="am-tile ${cls || ''}" data-act="${act}" ${extra || ''}>${UI.tile(ic, tint)}<span class="am-t">${t}</span>${sub ? `<span class="am-s">${sub}</span>` : ''}</button>`;
    UI.openSheet({
      title: 'הוספה',
      cls: 'add-sheet',
      body: `<div class="am-main">${tile('shift-new', 'clock', 'glass', 'רישום משמרת', 'big g1', '', 'שהתקיימה')}${tile('shift-plan', 'calendar', 'violet', 'תכנון משמרת', 'big g2', '', 'לימים הבאים')}</div>
        <div class="am-grid">
          ${S.shifts.some((s) => s.status !== 'planned') ? tile('dup-last', 'repeat', 'violet', 'שכפול האחרונה') : ''}
          ${tpls.length ? tile('tpl-pick', 'layers', 'sky', 'מתבנית') : ''}
          ${tile('entry-new', 'beach', 'sky', 'יום חופשה', '', 'data-kind="vacation"')}
          ${tile('entry-new', 'thermo', 'pink', 'יום מחלה', '', 'data-kind="sick"')}
          ${tile('entry-new', 'gift', 'amber', 'בונוס / טיפים', '', 'data-kind="adjustment" data-type="bonus"')}
          ${tile('entry-new', 'minus', 'orange', 'ניכוי', '', 'data-kind="adjustment" data-type="deduction"')}
          ${tile('payslip-new', 'receipt', 'mint', 'בדיקת תלוש', '')}
        </div>`,
    });
  };
  const fromMenu = (fn) => (el) => { if (UI.sheets.length) { UI.closeTop(); setTimeout(() => fn(el), 320); } else fn(el); };
  App.actions['shift-new'] = fromMenu(() => App.sheetsApi.shiftEditor());
  App.actions['shift-plan'] = fromMenu(() => App.sheetsApi.shiftEditor(null, { status: 'planned', date: U.addDays(U.todayKey(), 1) }));
  App.actions['dup-last'] = fromMenu(() => {
    const last = S.shifts.filter((s) => s.status !== 'planned').sort((a, b) => b.start - a.start)[0];
    if (!last) { UI.toast('אין עדיין משמרת לשכפל'); return; }
    App.sheetsApi.shiftEditor(null, { copyFrom: last, date: U.todayKey() });
  });
  App.actions['tpl-pick'] = fromMenu(() => {
    UI.openSheet({
      title: 'בחר תבנית',
      body: `<div class="list">${S.templates.map((t) => `<button class="item" data-tpl="${t.id}"><span class="role-bar" style="background:${(App.role(t.roleId) || {}).color || '#999'}"></span><span class="body"><span class="t">${esc(t.name)}</span><span class="s">${esc(App.roleName(t.roleId))} · <span class="num">⁦${t.startT}\u2060–\u2060${t.endT}⁩</span></span></span></button>`).join('')}</div>`,
      onMount: (el) => el.querySelectorAll('[data-tpl]').forEach((b) => (b.onclick = () => {
        const t = S.templates.find((x) => x.id === b.dataset.tpl);
        UI.closeTop();
        setTimeout(() => App.sheetsApi.shiftEditor(null, { template: t, date: U.todayKey() }), 320);
      })),
    });
  });
  App.actions['entry-new'] = fromMenu((el) => App.sheetsApi.entryEditor(null, { kind: el.dataset.kind, type: el.dataset.type }));

  /* ---------------- draft <-> shift ---------------- */
  function emptyOv() {
    return {
      rest: { on: false, scope: 'auto', fromT: '', toT: '', pct: '', amount: '' },
      ot: { on: false, mode: 'off', hours: '', pct: '', amount: '' },
      night: { on: false, mode: 'off', pct: '', amount: '' },
      travel: { on: false, mode: 'off', amount: '' },
      rate: { on: false, rate: '' },
    };
  }
  function draftFrom(sh, opts) {
    opts = opts || {};
    const emp = S.employers[0];
    const roles = App.roles();
    if (!sh) {
      const src = opts.copyFrom || null;
      const t = opts.template || null;
      const date = opts.date || U.todayKey();
      const d = {
        id: null, status: opts.status || (date > U.todayKey() ? 'planned' : 'done'), statusTouched: !!opts.status,
        employerId: (src && src.employerId) || (t && t.employerId) || emp.id, date,
        startT: src ? U.epochHM(src.start) : t ? t.startT : '08:00', endT: src ? U.epochHM(src.end) : t ? t.endT : '16:00',
        roleId: (src && src.roleId) || (t && t.roleId) || S.meta.lastRole || (roles[0] && roles[0].id),
        splits: src ? (src.splits || []).map((x) => ({ t: U.epochHM(x.at), roleId: x.roleId })) : t && t.splits ? t.splits.slice() : [],
        breakMin: src ? src.breakMin || 0 : t ? t.breakMin || 0 : App.employer(emp.id).defaultBreakMin || 0,
        breakPaid: src ? src.breakPaid !== false : t ? t.breakPaid !== false : App.employer(emp.id).defaultBreakPaid !== false,
        noTravel: src ? !!src.noTravel : t ? !!t.noTravel : false, note: '', items: [], ov: emptyOv(), reason: '',
      };
      return d;
    }
    const ov = emptyOv();
    const o = sh.overrides || {};
    if (o.rest) Object.assign(ov.rest, { on: true, scope: o.rest.scope || 'auto', fromT: o.rest.from ? U.epochHM(o.rest.from) : '', toT: o.rest.to ? U.epochHM(o.rest.to) : '', pct: o.rest.pct || '', amount: o.rest.amount != null ? o.rest.amount : '' });
    if (o.ot) Object.assign(ov.ot, { on: true, mode: o.ot.mode, hours: o.ot.hours || '', pct: o.ot.pct || '', amount: o.ot.amount != null ? o.ot.amount : '' });
    if (o.night) Object.assign(ov.night, { on: true, mode: o.night.mode, pct: o.night.pct || '', amount: o.night.amount != null ? o.night.amount : '' });
    if (o.travel) Object.assign(ov.travel, { on: true, mode: o.travel.mode, amount: o.travel.amount != null ? o.travel.amount : '' });
    if (o.rate) Object.assign(ov.rate, { on: true, rate: o.rate.rate });
    return {
      id: sh.id, status: sh.status || 'done', statusTouched: true, employerId: sh.employerId, date: U.epochKey(sh.start),
      startT: U.epochHM(sh.start), endT: U.epochHM(sh.end), roleId: sh.roleId,
      splits: (sh.splits || []).map((x) => ({ t: U.epochHM(x.at), roleId: x.roleId })),
      breakMin: sh.breakMin || 0, breakPaid: sh.breakPaid !== false, noTravel: !!sh.noTravel, note: sh.note || '',
      items: (sh.items || []).map((x) => Object.assign({}, x)), ov, reason: sh.overrideReason || '',
      createdAt: sh.createdAt, demo: sh.demo,
    };
  }
  const numOrNull = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
  function shiftFrom(d) {
    const start = U.toEpoch(d.date, d.startT || '00:00');
    let end = U.toEpoch(d.date, d.endT || '00:00');
    if (end <= start) end = U.toEpoch(U.addDays(d.date, 1), d.endT || '00:00');
    const at = (t) => { let e = U.toEpoch(d.date, t); if (e < start) e = U.toEpoch(U.addDays(d.date, 1), t); return e; };
    const ov = {};
    if (d.ov.rest.on) {
      ov.rest = { scope: d.ov.rest.scope };
      if (d.ov.rest.scope === 'range' && d.ov.rest.fromT && d.ov.rest.toT) { ov.rest.from = at(d.ov.rest.fromT); ov.rest.to = at(d.ov.rest.toT); }
      if (numOrNull(d.ov.rest.pct)) ov.rest.pct = +d.ov.rest.pct;
      if (numOrNull(d.ov.rest.amount) != null) ov.rest.amount = +d.ov.rest.amount;
    }
    if (d.ov.ot.on) ov.ot = { mode: d.ov.ot.mode, hours: numOrNull(d.ov.ot.hours), pct: numOrNull(d.ov.ot.pct), amount: numOrNull(d.ov.ot.amount) };
    if (d.ov.night.on) ov.night = { mode: d.ov.night.mode, pct: numOrNull(d.ov.night.pct), amount: numOrNull(d.ov.night.amount) };
    if (d.ov.travel.on) ov.travel = { mode: d.ov.travel.mode, amount: numOrNull(d.ov.travel.amount) };
    if (d.ov.rate.on && numOrNull(d.ov.rate.rate)) ov.rate = { rate: +d.ov.rate.rate };
    const sh = {
      id: d.id || U.uid(), kind: 'shift', status: d.status, employerId: d.employerId, roleId: d.roleId,
      start, end, splits: d.splits.filter((x) => x.t && x.roleId).map((x) => ({ at: at(x.t), roleId: x.roleId })),
      breakMin: +d.breakMin || 0, breakPaid: !!d.breakPaid, noTravel: !!d.noTravel, note: d.note || '',
      items: d.items.filter((x) => +x.amount), overrides: Object.keys(ov).length ? ov : null, overrideReason: Object.keys(ov).length ? d.reason : '',
    };
    if (d.createdAt) sh.createdAt = d.createdAt;
    if (d.demo) sh.demo = true;
    return sh;
  }
  function priorMinFor(sh) {
    const k = U.epochKey(sh.start);
    let m = 0;
    for (const s of S.shifts) {
      if (s.id === sh.id || s.employerId !== sh.employerId || (s.status === 'planned') !== (sh.status === 'planned')) continue;
      if (U.epochKey(s.start) === k && s.start < sh.start) { const r = App.result(s.id); if (r) m += r.paidMin; }
    }
    return m;
  }
  App.previewShift = (sh) => Engine.computeShift(sh, App.model.ctx, { priorMin: priorMinFor(sh) });

  /* ---------------- breakdown & timeline (shared) ---------------- */
  App.timelineHtml = function (r) {
    if (!r.roundedMin) return '';
    const span = r.end - r.start;
    const pos = (t) => ((t - r.start) / span) * 100;
    let h = '<div class="timeline">';
    for (const s of r.segments) {
      const role = App.role(s.roleId);
      h += `<i style="inset-inline-start:${pos(s.start)}%;width:${pos(s.end) - pos(s.start)}%;background:${role ? role.color : '#999'};opacity:.85"></i>`;
    }
    const rests = r.slices.filter((s) => s.rest);
    if (rests.length) {
      const a = rests[0].a, b = rests[rests.length - 1].b;
      h += `<span class="rz" style="inset-inline-start:${pos(a)}%;width:${pos(b) - pos(a)}%"></span>`;
    }
    h += '</div>';
    const labels = [`<span class="num">${U.epochHM(r.start)}</span>`];
    if (rests.length) labels.push(`<span class="tag rest">${icon('candle')} ⁦${U.epochHM(rests[0].a)}\u2060–\u2060${U.epochHM(rests[rests.length - 1].b)}⁩</span>`);
    labels.push(`<span class="num">${U.epochHM(r.end)}${U.epochKey(r.end) !== r.dateKey ? ' (+1)' : ''}</span>`);
    return h + `<div class="row-flex tiny muted" style="justify-content:space-between">${labels.join('')}</div>`;
  };
  App.breakdownHtml = function (r, sh) {
    if (!r) return '';
    const emp = App.employer(r.employerId);
    let rows = '';
    for (const l of r.lines) {
      rows += `<tr><td><span style="color:${l.color}">●</span> ${esc(l.roleName)} · ${esc(l.label)}<div class="f">${U.hours(l.hours)} ש׳ × ${U.money(l.rate)} × ${l.pct}%</div></td><td class="a">${U.money(l.amount)}</td></tr>`;
    }
    for (const x of r.extras) rows += `<tr><td>${esc(x.label)}${x.detail ? `<div class="f">${esc(x.detail)}</div>` : ''}</td><td class="a">${U.money(x.amount)}</td></tr>`;
    rows += `<tr><td><b>שכר עבודה</b></td><td class="a">${U.money(r.wage)}</td></tr>`;
    const tr = r.travel;
    if (r.status !== 'planned' || tr.amount) {
      rows += `<tr><td>נסיעות${tr.mode === 'none' ? ' (ללא)' : tr.mode === 'manual' ? ' (ידני)' : ''}<div class="f">${tr.mode === 'auto' ? 'ליום עבודה · נספר פעם אחת ביום' + (+emp.travelMonthlyCap ? `, עד תקרה של ${U.money(emp.travelMonthlyCap, 0)} לחודש` : '') : ''}</div></td><td class="a">${U.money(tr.amount)}</td></tr>`;
    }
    for (const it of (sh && sh.items) || []) {
      const neg = it.type === 'deduction';
      rows += `<tr><td>${esc(it.label || Engine.ADJ_LABELS[it.type])}${it.type === 'tips' ? '<div class="f">טיפים — לא נכללים בברוטו</div>' : ''}${neg ? '<div class="f">ניכוי — יורד מהנטו</div>' : ''}</td><td class="a">${neg ? '−' : ''}${U.money(it.amount)}</td></tr>`;
    }
    rows += `<tr class="tot"><td>סה״כ</td><td class="a">${U.money(r.total)}</td></tr>`;
    const notes = [];
    notes.push(`זמן במשמרת: ${U.hm(r.elapsedMin)}` + (r.roundingDeltaMin ? ` · עיגול: ${r.roundingDeltaMin > 0 ? '+' : ''}${r.roundingDeltaMin} דק׳` : ''));
    if (r.breakMin) notes.push(`הפסקה ${r.breakMin} דק׳ ${r.breakPaid ? 'בתשלום' : 'ללא תשלום — נוכתה יחסית מכל השעות'}`);
    notes.push(`שעות נוספות אחרי ${r.thresholdH} שעות ביום` + (r.priorMin ? ` · כבר עבדת ${U.hm(r.priorMin)} באותו יום לפני המשמרת` : '') + (r.isNightShift && emp.nightShiftShortDay ? ' (משמרת לילה)' : ''));
    const wins = r.restLabels.length ? r.slices.filter((s) => s.autoRest) : [];
    if (r.autoRestMin > 0) notes.push(`חלון ${esc(r.restLabels.join(', ') || 'שבת/חג')} במשמרת: ⁦${U.epochHM(wins[0].a)}\u2060–\u2060${U.epochHM(wins[wins.length - 1].b)}⁩ (${S.settings.rest.mode === 'city' ? 'לפי ' + esc(S.settings.rest.city === '__custom' ? 'מיקום מותאם' : S.settings.rest.city).replace(/-/g, '-⁠') : 'שעות קבועות'})`);
    if (r.warnings.length) notes.push('⚠️ ' + r.warnings.join(', '));
    return `<table class="bd">${rows}</table><div class="tiny muted" style="margin-top:8px">${notes.map((n) => '• ' + n).join('<br>')}</div>`;
  };

  /* ---------------- shift detail ---------------- */
  App.sheetsApi.shiftDetail = function (id) {
    const sh = App.shift(id);
    const r = App.result(id);
    if (!sh || !r) return;
    const hd = HebCal.hebrewDate(r.dateKey);
    const ovBox = r.overridden || r.dayRuleHit ? `<div class="banner warn">${icon('hand')}<div style="flex:1"><b>עקיפה ידנית:</b> ${esc([...r.overrideList, r.dayRuleHit ? 'כלל יום (ביטול/הוספה גורפת של שבת/חג)' : ''].filter(Boolean).join(' · '))}${sh.overrideReason ? `<br>סיבה: ${esc(sh.overrideReason)}` : ''}</div></div>` : '';
    const autoDiff = r.overridden && App.model.autoResults.get(id) ? App.model.autoResults.get(id).wage - r.wage : 0;
    UI.openSheet({
      title: U.fmtDate(r.dateKey, 'long'),
      body: `<div class="small muted" style="margin-bottom:8px">${esc(hd.toString())} ${App.restTag(r)} ${r.status === 'planned' ? '<span class="tag planned">מתוכננת</span>' : ''}</div>
        ${ovBox}
        <div class="card">${App.timelineHtml(r)}
          <div class="kpis three" style="margin-top:12px">
            <div class="kpi"><div class="l">שעות לתשלום</div><div class="v"><span class="num">${U.hm(r.paidMin)}</span></div></div>
            <div class="kpi"><div class="l">שכר</div><div class="v">${money(r.wage, 0)}</div></div>
            <div class="kpi"><div class="l">לשעה</div><div class="v">${money(r.paidHours ? r.wage / r.paidHours : 0)}</div></div>
          </div></div>
        <div class="section-title">${icon('list', 's')} איך הגענו לסכום</div>
        <div class="card">${App.breakdownHtml(r, sh)}</div>
        ${r.overridden ? `<div class="small muted" style="margin:-4px 4px 12px">בלי העקיפה החישוב היה ${U.money(r.wage + autoDiff)} (${autoDiff >= 0 ? '+' : ''}${U.money(autoDiff)}).</div>` : ''}
        ${sh.note ? `<div class="card outlined small">${icon('edit', 's')} ${esc(sh.note)}</div>` : ''}
        <div class="list">
          ${r.status === 'planned' ? `<button class="item" data-x="done"><span class="lead">${icon('check')}</span><span class="body"><span class="t">סמן כבוצעה</span></span></button>` : ''}
          <button class="item" data-x="dup"><span class="lead">${icon('copy')}</span><span class="body"><span class="t">שכפל</span><span class="s">אותן שעות בתאריך אחר</span></span></button>
          <button class="item" data-x="repeat"><span class="lead">${icon('refresh')}</span><span class="body"><span class="t">חזרה שבועית</span><span class="s">אותה משמרת בשבועות הבאים, כמתוכננת</span></span></button>
          <button class="item" data-x="tpl"><span class="lead">${icon('layers')}</span><span class="body"><span class="t">שמור כתבנית</span></span></button>
          <button class="item" data-x="gcal"><span class="lead">${icon('calendar')}</span><span class="body"><span class="t">הוסף ל-\u2060Google Calendar</span></span></button>
          ${r.overridden ? `<button class="item" data-x="auto"><span class="lead">${icon('refresh')}</span><span class="body"><span class="t">חזור לחישוב אוטומטי</span><span class="s">מבטל את כל העקיפות במשמרת</span></span></button>` : ''}
        </div>`,
      foot: `<button class="btn danger" data-x="del">${icon('trash')} מחק</button><button class="btn" data-x="edit">${icon('edit')} ערוך</button>`,
      onMount: (el) => {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-x]');
          if (!b) return;
          const x = b.dataset.x;
          if (x === 'edit') { UI.closeTop(); setTimeout(() => App.sheetsApi.shiftEditor(id), 320); }
          if (x === 'del') {
            if (!(await UI.confirm('למחוק את המשמרת?', `${U.fmtDate(r.dateKey)} · ${U.money(r.total)}. אפשר לבטל מיד אחרי.`, 'מחק', true))) return;
            UI.closeTop();
            await App.saveOps([{ store: 'shifts', del: id }], 'מחיקת משמרת', 'המשמרת נמחקה');
          }
          if (x === 'done') { UI.closeTop(); await App.saveOps([{ store: 'shifts', put: Object.assign(Store.clone(sh), { status: 'done' }) }], 'סימון כבוצעה'); }
          if (x === 'dup') { UI.closeTop(); setTimeout(() => App.sheetsApi.shiftEditor(null, { copyFrom: sh, date: U.addDays(r.dateKey, 1) }), 320); }
          if (x === 'tpl') App.saveTemplate(sh);
          if (x === 'repeat') {
            const v = await UI.dialog({ title: 'חזרה שבועית', html: `<label class="field"><span class="lbl">לכמה שבועות קדימה?</span><select class="input">${[1, 2, 3, 4, 6, 8, 12].map((n) => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n} שבועות</option>`).join('')}</select></label><div class="tiny muted">תאריך שכבר יש בו משמרת באותן שעות ידולג.</div>`, buttons: [{ label: 'ביטול', value: null, cls: 'text' }, { label: 'הוסף', value: 'input' }] });
            const n = +v;
            if (!n) return;
            const ops = App.weeklyCopies(sh, n);
            if (!ops.length) { UI.toast('כל השבועות כבר תפוסים'); return; }
            UI.closeTop();
            await App.saveOps(ops, 'חזרה שבועית', `נוספו ${ops.length} משמרות מתוכננות`);
          }
          if (x === 'gcal') window.open(App.exporter.gcalLink(sh, r), '_blank');
          if (x === 'auto') {
            if (!(await UI.confirm('לחזור לחישוב אוטומטי?', 'כל העקיפות הידניות במשמרת יימחקו.', 'חזור לאוטומטי'))) return;
            UI.closeTop();
            await App.saveOps([{ store: 'shifts', put: Object.assign(Store.clone(sh), { overrides: null, overrideReason: '' }) }], 'חזרה לחישוב אוטומטי');
          }
        });
      },
    });
  };
  App.actions['shift-open'] = (el) => App.sheetsApi.shiftDetail(el.dataset.id);

  /** Planned copies of a shift on the same weekday for the next n weeks (same local times, DST-safe). */
  App.weeklyCopies = function (sh, n) {
    const at = (epoch, i) => U.toEpoch(U.addDays(U.epochKey(epoch), 7 * i), U.epochHM(epoch));
    const ops = [];
    for (let i = 1; i <= n; i++) {
      const start = at(sh.start, i), end = at(sh.end, i);
      const busy = S.shifts.some((x) => x.employerId === sh.employerId && x.start < end && x.end > start);
      if (busy) continue;
      ops.push({ store: 'shifts', put: {
        id: U.uid(), kind: 'shift', employerId: sh.employerId, roleId: sh.roleId, status: 'planned', start, end,
        breakMin: sh.breakMin || 0, breakPaid: sh.breakPaid !== false, noTravel: !!sh.noTravel,
        splits: (sh.splits || []).map((x) => ({ at: at(x.at, i), roleId: x.roleId })), items: [], note: '',
      } });
    }
    return ops;
  };

  App.saveTemplate = async function (sh) {
    const name = await UI.promptText('שמירת תבנית', 'שם התבנית', `${App.roleName(sh.roleId)} ⁦${U.epochHM(sh.start)}\u2060–\u2060${U.epochHM(sh.end)}⁩`);
    if (!name) return;
    await App.saveOps([{ store: 'templates', put: {
      id: U.uid(), name, roleId: sh.roleId, employerId: sh.employerId, startT: U.epochHM(sh.start), endT: U.epochHM(sh.end),
      breakMin: sh.breakMin || 0, breakPaid: sh.breakPaid !== false, noTravel: !!sh.noTravel,
      splits: (sh.splits || []).map((x) => ({ t: U.epochHM(x.at), roleId: x.roleId })),
    } }], 'שמירת תבנית', 'התבנית נשמרה');
  };

  /* ---------------- shift editor ---------------- */
  App.sheetsApi.shiftEditor = function (id, opts) {
    const orig = id ? App.shift(id) : null;
    const d = draftFrom(orig, opts);
    let sheetEl = null;

    const roleChips = (sel, attr) => App.roles(d.employerId).map((r) => `<button class="chip ${r.id === sel ? 'on' : ''}" ${attr}="${r.id}"><span class="sw" style="background:${r.color}"></span>${esc(r.name)}</button>`).join('');
    const ovCount = () => ['rest', 'ot', 'night', 'travel', 'rate'].filter((k) => d.ov[k].on).length;
    const sel = (f, options, v) => `<select class="input" data-f="${f}">${options.map(([val, lab]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
    const inp = (f, v, extra) => `<input class="input" data-f="${f}" value="${esc(v == null ? '' : v)}" ${extra || ''}>`;
    const numIn = (f, v, ph) => inp(f, v, `type="number" inputmode="decimal" step="any" placeholder="${ph || ''}"`);
    // shift length in minutes from the two times (an end before the start means the next day)
    const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    // The real length, worked out the way the shift is saved: the night the clocks change, 22:00 → 06:00
    // is 9 hours (October) or 7 (March), and that is what is paid.
    const lengthMin = () => {
      if (!d.startT || !d.endT) return null;
      if (!d.date) { const m = toMin(d.endT) - toMin(d.startT); return m <= 0 ? m + 1440 : m; }
      const start = U.toEpoch(d.date, d.startT);
      let end = U.toEpoch(d.date, d.endT);
      if (end <= start) end = U.toEpoch(U.addDays(d.date, 1), d.endT);
      return Math.round((end - start) / 60000);
    };
    const durChips = () => `<div class="dur-row"><span class="dur-l">${lengthMin() ? `משך המשמרת: <b class="num">${U.hm(lengthMin())}</b> שעות` : 'משך המשמרת (בחירה מהירה)'}</span><div class="chips">${[4, 5, 6, 7, 8, 9].map((h) => `<button class="chip ${lengthMin() === h * 60 ? 'on' : ''}" data-dur="${h}">${h} ש׳</button>`).join('')}</div></div>`;

    function ovBlock(key, title, sub, inner) {
      const o = d.ov[key];
      return `<div class="ov-block ${o.on ? 'on' : ''}"><label class="ov-head"><span class="t">${title}<div class="tiny muted" style="font-weight:400">${sub}</div></span><span class="tiny">${o.on ? 'ידני' : 'אוטומטי'}</span><input type="checkbox" class="switch" data-f="ov.${key}.on" ${o.on ? 'checked' : ''}></label>${o.on ? `<div class="ov-in">${inner}</div>` : ''}</div>`;
    }
    function body() {
      const emp = App.employer(d.employerId);
      const rest = d.ov.rest, ot = d.ov.ot, night = d.ov.night, trv = d.ov.travel, rate = d.ov.rate;
      const overnight = d.startT && d.endT && d.endT <= d.startT;
      return `
        <div class="seg" style="margin-bottom:14px"><button data-status="done" class="${d.status === 'done' ? 'on' : ''}">בוצעה</button><button data-status="planned" class="${d.status === 'planned' ? 'on' : ''}">מתוכננת</button></div>
        ${App.multiEmp() ? `<label class="field"><span class="lbl">מעסיק</span>${sel('employerId', S.employers.map((e) => [e.id, esc(e.name)]), d.employerId)}</label>` : ''}
        <label class="field"><span class="lbl">תאריך</span>${inp('date', d.date, `type="date" min="2000-01-01" max="${U.addDays(U.todayKey(), 366)}"`)}</label>
        <div class="grid2">
          <label class="field"><span class="lbl">התחלה</span>${inp('startT', d.startT, 'type="time"')}</label>
          <label class="field"><span class="lbl">סיום ${overnight ? '<span class="tag planned">למחרת</span>' : ''}</span>${inp('endT', d.endT, 'type="time"')}</label>
        </div>
        ${durChips()}
        <div class="field"><span class="lbl">תפקיד</span><div class="chips">${roleChips(d.roleId, 'data-role')}</div></div>
        <details class="collapse" ${d.splits.length ? 'open' : ''}><summary>${icon('swap', 's')} פיצול בין תפקידים ${d.splits.length ? `<span class="tag">${d.splits.length}</span>` : ''}</summary><div class="in">
          <div class="tiny muted" style="margin-bottom:8px">לדוגמה: התחלת כסדרן, ומ-19:00 עברת לאחמ״ש.</div>
          ${d.splits.map((s, i) => `<div class="seg-line" style="margin-bottom:8px"><label class="field" style="margin:0"><span class="lbl">משעה</span>${inp('splits.' + i + '.t', s.t, 'type="time"')}</label>
            <label class="field" style="margin:0"><span class="lbl">תפקיד</span>${sel('splits.' + i + '.roleId', App.roles(d.employerId).map((r) => [r.id, esc(r.name)]), s.roleId)}</label>
            <button class="icon-btn" data-rm-split="${i}" aria-label="הסר">${icon('x')}</button></div>`).join('')}
          <button class="btn text sm" data-add-split>${icon('plus', 's')} הוסף מעבר תפקיד</button></div></details>
        <div class="grid2">
          <label class="field"><span class="lbl">הפסקה (דקות)</span>${numIn('breakMin', d.breakMin || '', '0')}</label>
          <label class="switch-row" style="padding-top:26px"><span class="body"><span class="t small">בתשלום</span></span><input type="checkbox" class="switch" data-f="breakPaid" ${d.breakPaid ? 'checked' : ''}></label>
        </div>
        <label class="switch-row"><span class="body"><span class="t">בלי נסיעות</span><span class="s">המשמרת לא תזכה בנסיעות (${U.money(emp.travelPerDay)} ליום)</span></span><input type="checkbox" class="switch" data-f="noTravel" ${d.noTravel ? 'checked' : ''}></label>
        <details class="collapse" ${d.items.length ? 'open' : ''}><summary>${icon('gift', 's')} תוספות וניכויים ${d.items.length ? `<span class="tag">${d.items.length}</span>` : ''}</summary><div class="in">
          ${d.items.map((it, i) => `<div style="display:grid;grid-template-columns:1.1fr 1fr 40px;gap:8px;align-items:end;margin-bottom:8px">
            ${sel('items.' + i + '.type', [['bonus', 'בונוס'], ['tips', 'טיפים'], ['addition', 'תוספת'], ['deduction', 'ניכוי']], it.type)}
            ${numIn('items.' + i + '.amount', it.amount, '₪')}
            <button class="icon-btn" data-rm-item="${i}" aria-label="הסר">${icon('x')}</button>
            <div style="grid-column:1/3">${inp('items.' + i + '.label', it.label || '', 'placeholder="תיאור (לא חובה)"')}</div></div>`).join('')}
          <button class="btn text sm" data-add-item>${icon('plus', 's')} הוסף שורה</button></div></details>
        <label class="field"><span class="lbl">הערה</span><textarea class="input" data-f="note" rows="2" maxlength="500" placeholder="לא חובה">${esc(d.note)}</textarea></label>
        <details class="collapse" ${ovCount() ? 'open' : ''}><summary>${icon('hand', 's')} עקיפות ידניות ${ovCount() ? `<span class="tag override">${ovCount()}</span>` : ''}</summary><div class="in">
          <div class="tiny muted" style="margin-bottom:10px">כל רכיב מחושב אוטומטית. הפעל "ידני" רק אם המעסיק מחשב אחרת.</div>
          ${ovBlock('rest', 'תעריף שבת/חג', 'ביטול, הפעלה ידנית, טווח שעות, אחוז או סכום', `
            <div class="field"><span class="lbl">היקף</span>${sel('ov.rest.scope', [['off', 'בטל שבת/חג במשמרת'], ['all', 'החל על כל המשמרת'], ['range', 'רק בטווח שעות'], ['auto', 'זיהוי אוטומטי, אחוז/סכום אחר']], rest.scope)}</div>
            ${rest.scope === 'range' ? `<div class="grid2"><label class="field"><span class="lbl">שבת/חג משעה</span>${inp('ov.rest.fromT', rest.fromT, 'type="time"')}</label><label class="field"><span class="lbl">עד שעה</span>${inp('ov.rest.toT', rest.toT, 'type="time"')}</label></div>` : ''}
            ${rest.scope !== 'off' ? `<div class="grid2"><label class="field"><span class="lbl">אחוז</span>${numIn('ov.rest.pct', rest.pct, String(emp.restPct))}</label><label class="field"><span class="lbl">או סכום תוספת ₪</span>${numIn('ov.rest.amount', rest.amount, 'אוטומטי')}</label></div>` : ''}`)}
          ${ovBlock('ot', 'שעות נוספות', 'ביטול, סף אחר, אחוז או סכום', `
            <div class="field">${sel('ov.ot.mode', [['off', 'בטל שעות נוספות'], ['threshold', 'סף שעות אחר'], ['pct', 'אחוז אחיד לשעות הנוספות'], ['amount', 'סכום תוספת ידני']], ot.mode)}</div>
            ${ot.mode === 'threshold' ? `<label class="field"><span class="lbl">שעות נוספות אחרי (שעות)</span>${numIn('ov.ot.hours', ot.hours, String(emp.otThreshold))}</label>` : ''}
            ${ot.mode === 'pct' ? `<label class="field"><span class="lbl">אחוז</span>${numIn('ov.ot.pct', ot.pct, '125')}</label>` : ''}
            ${ot.mode === 'amount' ? `<label class="field"><span class="lbl">סכום התוספת ₪ (מעבר ל-100%)</span>${numIn('ov.ot.amount', ot.amount, '0')}</label>` : ''}`)}
          ${ovBlock('night', 'תוספת לילה', emp.nightEnabled ? 'מוגדרת: ' + emp.nightValue + (emp.nightType === 'fixed' ? ' ₪ לשעה' : '%') : 'לא מוגדרת אצל המעסיק', `
            <div class="field">${sel('ov.night.mode', [['off', 'בטל תוספת לילה'], ['all', 'כל המשמרת נחשבת לילה'], ['pct', 'אחוז אחר'], ['amount', 'סכום ידני']], night.mode)}</div>
            ${night.mode === 'pct' ? `<label class="field"><span class="lbl">אחוז תוספת</span>${numIn('ov.night.pct', night.pct, '20')}</label>` : ''}
            ${night.mode === 'amount' ? `<label class="field"><span class="lbl">סכום ₪</span>${numIn('ov.night.amount', night.amount, '0')}</label>` : ''}`)}
          ${ovBlock('travel', 'נסיעות', 'ביטול או סכום אחר למשמרת', `
            <div class="field">${sel('ov.travel.mode', [['off', 'בלי נסיעות'], ['amount', 'סכום אחר']], trv.mode)}</div>
            ${trv.mode === 'amount' ? `<label class="field"><span class="lbl">סכום ₪</span>${numIn('ov.travel.amount', trv.amount, String(emp.travelPerDay))}</label>` : ''}`)}
          ${ovBlock('rate', 'תעריף לשעה', 'לכל המשמרת, במקום תעריף התפקיד', `<label class="field"><span class="lbl">₪ לשעה</span>${numIn('ov.rate.rate', rate.rate, '0')}</label>`)}
          ${ovCount() ? `<label class="field"><span class="lbl">סיבה (לא חובה)</span>${inp('reason', d.reason, 'placeholder="למשל: המעסיק לא מחשיב את השעה הזו כשבת"')}</label>
          <button class="btn outlined block" data-reset-ov>${icon('refresh', 's')} חזור לחישוב אוטומטי</button>` : ''}
        </div></details>
        <div class="section-title">${icon('wallet', 's')} חישוב</div>
        <div class="card" id="ed-preview"></div>`;
    }
    function preview() {
      const el = sheetEl && sheetEl.querySelector('#ed-preview');
      if (!el) return;
      const sh = shiftFrom(d);
      if (!d.date || !d.startT || !d.endT) { el.innerHTML = '<div class="muted small">מלא תאריך ושעות</div>'; return; }
      const r = App.previewShift(sh);
      el.innerHTML = App.timelineHtml(r) + `<div class="row-flex" style="margin:10px 0"><div class="hero-num" style="font-size:1.8rem">${money(r.total)}</div><span class="spacer"></span><div class="small muted"><span class="num">${U.hm(r.paidMin)}</span> ש׳</div></div>` + App.breakdownHtml(r, sh);
    }
    function redraw() {
      const b = sheetEl.querySelector('.sh-body');
      const y = b.scrollTop;
      b.innerHTML = body();
      b.scrollTop = y;
      preview();
    }
    function setPath(path, value) {
      const parts = path.split('.');
      let o = d;
      for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
      o[parts[parts.length - 1]] = value;
    }

    const entry = UI.openSheet({
      title: orig ? 'עריכת משמרת' : opts && opts.status === 'planned' ? 'משמרת מתוכננת' : 'משמרת חדשה',
      full: true,
      body: body(),
      foot: `${orig ? `<button class="btn danger" data-del style="flex:0 0 auto">${icon('trash')}</button>` : ''}<button class="btn" data-save>${icon('check')} שמור</button>`,
      onMount: (el) => {
        sheetEl = el;
        preview();
        let t = null, swT = null;
        el.addEventListener('input', (e) => {
          const f = e.target.dataset.f;
          if (!f) return;
          const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
          setPath(f, v);
          if (f === 'date' && !d.statusTouched) {
            const ns = d.date > U.todayKey() ? 'planned' : 'done';
            if (ns !== d.status) { d.status = ns; redraw(); return; }
          }
          // the times come from the picker in one go: redraw so "the next day" and the length chips follow.
          // Of the switches only the "change by hand" ones open fields; "paid break" and "no travel" only
          // change the pay, so their switch is left to slide (a redraw put a new one in its place at once)
          const isSwitch = e.target.type === 'checkbox';
          const structural = (isSwitch && f.startsWith('ov.')) || e.target.tagName === 'SELECT' || f === 'startT' || f === 'endT';
          if (structural) {
            if (f === 'ov.rest.scope' && v === 'range' && !d.ov.rest.fromT) {
              const r = App.previewShift(shiftFrom(Object.assign({}, d, { ov: emptyOv() })));
              if (r.autoRestRange) { d.ov.rest.fromT = U.epochHM(r.autoRestRange.from); d.ov.rest.toT = U.epochHM(r.autoRestRange.to); }
              else { d.ov.rest.fromT = d.startT; d.ov.rest.toT = d.endT; }
            }
            // a switch slides over first (.2s), then the fields it opens come in
            if (isSwitch) { clearTimeout(swT); swT = setTimeout(redraw, 220); } else redraw();
          } else { clearTimeout(t); t = setTimeout(preview, 120); }
        });
        el.addEventListener('click', async (e) => {
          const t2 = e.target.closest('button');
          if (!t2) return;
          if (t2.dataset.status) { d.status = t2.dataset.status; d.statusTouched = true; redraw(); }
          else if (t2.dataset.role) { d.roleId = t2.dataset.role; redraw(); }
          else if (t2.dataset.dur) {
            if (!d.startT) { UI.invalid('קודם בוחרים שעת התחלה'); return; }
            if (d.date) d.endT = U.epochHM(U.toEpoch(d.date, d.startT) + +t2.dataset.dur * 3600000); // real hours, also the night the clocks change
            else { const m = (toMin(d.startT) + +t2.dataset.dur * 60) % 1440; d.endT = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
            redraw();
            if (root.Fx) root.Fx.play('tick');
          }
          else if (t2.hasAttribute('data-add-split')) {
            const others = App.roles(d.employerId).filter((r) => r.id !== d.roleId);
            d.splits.push({ t: '', roleId: (others[0] || App.roles()[0]).id }); redraw();
          } else if (t2.dataset.rmSplit != null) { d.splits.splice(+t2.dataset.rmSplit, 1); redraw(); }
          else if (t2.hasAttribute('data-add-item')) { d.items.push({ id: U.uid(), type: 'bonus', amount: '', label: '' }); redraw(); }
          else if (t2.dataset.rmItem != null) { d.items.splice(+t2.dataset.rmItem, 1); redraw(); }
          else if (t2.hasAttribute('data-reset-ov')) { d.ov = emptyOv(); d.reason = ''; redraw(); UI.toast('חזרה לחישוב אוטומטי — שמור כדי להחיל'); }
          else if (t2.hasAttribute('data-save')) save();
          else if (t2.hasAttribute('data-del')) {
            if (!(await UI.confirm('למחוק את המשמרת?', 'אפשר לבטל מיד אחרי.', 'מחק', true))) return;
            UI.closeTop();
            await App.saveOps([{ store: 'shifts', del: orig.id }], 'מחיקת משמרת', 'המשמרת נמחקה');
          }
        });
      },
    });

    async function save() {
      if (!d.date || !d.startT || !d.endT) { UI.invalid('מלא תאריך, שעת התחלה ושעת סיום'); return; }
      if (!d.roleId) { UI.invalid('בחר תפקיד'); return; }
      if (d.date < '2000-01-01' || d.date > U.addDays(U.todayKey(), 366)) { UI.invalid('התאריך לא הגיוני'); return; }
      const sh = shiftFrom(d);
      // numbers that would quietly change the pay the wrong way
      if (!(sh.breakMin >= 0) || sh.breakMin > 24 * 60) { UI.invalid('אורך ההפסקה לא הגיוני'); return; }
      if (sh.breakMin > 0 && sh.breakMin >= (sh.end - sh.start) / 60000) { UI.invalid('ההפסקה ארוכה מהמשמרת עצמה'); return; }
      if ((sh.items || []).some((x) => !(+x.amount > 0) || +x.amount > 1e6)) { UI.invalid('סכום של תוספת או ניכוי צריך להיות חיובי (לניכוי בוחרים "ניכוי")'); return; }
      const negative = (o) => o && typeof o === 'object' && Object.values(o).some((v) => (typeof v === 'number' && v < 0) || negative(v));
      if (negative(sh.overrides)) { UI.invalid('בחישוב הידני אי אפשר מספר שלילי'); return; }
      // a shift that hasn't happened yet can't be "done": it can be saved as planned
      if (sh.status === 'done' && sh.end > Date.now() + 5 * 60000) {
        const started = sh.start <= Date.now();
        const ok = await UI.confirm(started ? 'המשמרת עוד לא נגמרה' : 'המשמרת הזאת עוד לא קרתה',
          started ? 'שעת הסיום עוד לא הגיעה. כדי למדוד משמרת שקורית עכשיו, לוחצים "התחל משמרת" בבית. לשמור אותה בינתיים כמשמרת מתוכננת?' : 'התאריך והשעה בעתיד. לשמור אותה כמשמרת מתוכננת? אחרי שתעבוד, מסמנים שהיא בוצעה בלחיצה.',
          'שמור כמתוכננת');
        if (!ok) return;
        sh.status = 'planned';
        d.status = 'planned';
      }
      const hours = (sh.end - sh.start) / U.HOUR;
      if (hours > (+S.settings.alerts.suspiciousHours || 20)) {
        if (!(await UI.confirm('משמרת ארוכה מאוד', `המשמרת נמשכת ${U.num(hours, 1)} שעות. לשמור?`, 'שמור'))) return;
      }
      const overlap = S.shifts.find((s) => s.id !== sh.id && s.employerId === sh.employerId && s.status === sh.status && s.start < sh.end && s.end > sh.start);
      if (overlap) {
        if (!(await UI.confirm('חפיפה עם משמרת אחרת', `קיימת משמרת ב-${U.fmtDate(U.epochKey(overlap.start))} ⁦${U.epochHM(overlap.start)}\u2060–\u2060${U.epochHM(overlap.end)}⁩. לשמור בכל זאת?`, 'שמור'))) return;
      }
      await Store.setMeta({ lastRole: d.roleId });
      UI.closeTop();
      await App.saveOps([{ store: 'shifts', put: sh }], orig ? 'עריכת משמרת' : 'הוספת משמרת', orig ? 'המשמרת עודכנה' : 'המשמרת נשמרה');
    }
    return entry;
  };

  /* ---------------- entries (vacation / sick / adjustments) ---------------- */
  App.sheetsApi.entryEditor = function (id, opts) {
    opts = opts || {};
    const orig = id ? S.entries.find((e) => e.id === id) : null;
    const d = orig ? Store.clone(orig) : { kind: opts.kind || 'vacation', type: opts.type || 'bonus', date: opts.date || U.todayKey(), status: 'done', employerId: S.employers[0].id, amount: '', label: '', note: '' };
    const titles = { vacation: 'יום חופשה', sick: 'יום מחלה', adjustment: d.type === 'deduction' ? 'ניכוי' : 'תוספת / בונוס' };
    const val = orig && App.model.entryVals.get(orig.id);
    const auto = d.kind !== 'adjustment' ? Engine.dayValue(d.date, App.model.ctx, App.model.results) : null;
    UI.openSheet({
      title: (orig ? 'עריכת ' : '') + titles[d.kind],
      body: `
        ${d.kind === 'adjustment' ? `<div class="field"><span class="lbl">סוג</span><select class="input" id="en-type">${[['bonus', 'בונוס'], ['tips', 'טיפים'], ['addition', 'תוספת חד-פעמית'], ['deduction', 'ניכוי (ארוחה, ביגוד, קנס…)']].map(([v, l]) => `<option value="${v}" ${d.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
        <label class="field"><span class="lbl">תאריך</span><input class="input" type="date" id="en-date" value="${d.date}" min="2000-01-01" max="${d.kind === 'vacation' ? U.addDays(U.todayKey(), 366) : U.todayKey()}"></label>
        ${d.kind !== 'adjustment' ? `<div class="seg" style="margin-bottom:14px"><button data-st="done" class="${d.status !== 'planned' ? 'on' : ''}">נוצל</button><button data-st="planned" class="${d.status === 'planned' ? 'on' : ''}">מתוכנן</button></div>` : ''}
        <label class="field"><span class="lbl">${d.kind === 'adjustment' ? 'סכום ₪' : 'סכום ₪ (ריק = חישוב אוטומטי)'}</span><input class="input" type="number" inputmode="decimal" step="any" id="en-amount" value="${esc(d.amount)}" placeholder="${auto ? U.num(auto.value, 2) : ''}">
          ${auto ? `<span class="hint">${esc(auto.basis)}${d.kind === 'sick' ? ' · לפי יום המחלה ברצף' : ''}</span>` : ''}</label>
        ${val && d.kind === 'sick' ? `<div class="banner">${icon('thermo')}<div>יום ${val.dayIndex} ברצף המחלה · ${val.pct}% = ${U.money(val.amount)}</div></div>` : ''}
        ${d.kind === 'adjustment' ? `<label class="field"><span class="lbl">תיאור</span><input class="input" id="en-label" value="${esc(d.label || '')}" placeholder="למשל: בונוס חג"></label>` : ''}
        ${App.multiEmp() ? `<label class="field"><span class="lbl">מעסיק</span><select class="input" id="en-emp">${S.employers.map((e) => `<option value="${e.id}" ${e.id === d.employerId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span class="lbl">הערה</span><input class="input" id="en-note" value="${esc(d.note || '')}"></label>`,
      foot: `${orig ? `<button class="btn danger" data-del style="flex:0 0 auto">${icon('trash')}</button>` : ''}<button class="btn" data-save>${icon('check')} שמור</button>`,
      onMount: (el) => {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.st) { d.status = b.dataset.st; el.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b)); }
          if (b.hasAttribute('data-del')) {
            if (!(await UI.confirm('למחוק?', '', 'מחק', true))) return;
            UI.closeTop();
            await App.saveOps([{ store: 'entries', del: orig.id }], 'מחיקה', 'נמחק');
          }
          if (b.hasAttribute('data-save')) {
            const q = (s) => el.querySelector(s);
            const out = Object.assign({}, d, {
              id: d.id || U.uid(), date: q('#en-date').value, amount: q('#en-amount').value === '' ? null : +q('#en-amount').value,
              note: q('#en-note').value, type: q('#en-type') ? q('#en-type').value : d.type, label: q('#en-label') ? q('#en-label').value : '',
              employerId: q('#en-emp') ? q('#en-emp').value : d.employerId,
            });
            if (out.kind === 'adjustment' && !(out.amount > 0)) { UI.invalid('הזן סכום'); return; }
            if (out.amount != null && (!(out.amount >= 0) || out.amount > 1e6)) { UI.invalid('הסכום לא הגיוני'); return; }
            if (!out.date || out.date < '2000-01-01') { UI.invalid('בחר תאריך'); return; }
            if (out.date > U.todayKey()) {
              if (out.kind === 'sick') { UI.invalid('יום מחלה לא יכול להיות בעתיד'); return; }
              if (out.kind === 'adjustment') { UI.invalid('אי אפשר לרשום סכום על תאריך שעוד לא הגיע'); return; }
              if (out.kind === 'vacation' && out.status !== 'planned') { out.status = 'planned'; UI.toast('נשמר כחופשה מתוכננת'); }
            }
            if (out.kind === 'adjustment') out.status = 'done';
            UI.closeTop();
            await App.saveOps([{ store: 'entries', put: out }], orig ? 'עריכה' : 'הוספה', 'נשמר');
          }
        });
      },
    });
  };
  App.actions['entry-open'] = (el) => App.sheetsApi.entryEditor(el.dataset.id);

  /* ---------------- day sheet ---------------- */
  App.sheetsApi.daySheet = function (k) {
    const cfg = App.model.ctx.restCfg;
    const results = [...App.model.results.values()].filter((r) => r.dateKey === k).sort((a, b) => a.start - b.start);
    const entries = S.entries.filter((e) => e.date === k);
    const hols = HebCal.holidaysOn(k);
    const info = HebCal.restDayInfo(k, cfg);
    const autoInfo = HebCal.restDayInfo(k, cfg, true);
    const rule = S.dayRules.find((x) => x.date === k);
    const wins = HebCal.restWindows(U.addDays(k, -1), U.addDays(k, 1), cfg).filter((w) => U.epochKey(w.start) <= k && U.epochKey(w.end) >= k);
    const sum = results.filter((r) => r.status === 'done').reduce((s, r) => s + r.total, 0);
    let restLine = '';
    if (wins.length) restLine = wins.map((w) => `${icon('candle', 's')} ${esc(w.label)}: ${U.fmtDate(U.epochKey(w.start), 'short')} ${U.epochHM(w.start)} → ${U.fmtDate(U.epochKey(w.end), 'short')} ${U.epochHM(w.end)}`).join('<br>');
    UI.openSheet({
      title: U.fmtDate(k, 'long'),
      body: `<div class="small muted" style="margin-bottom:10px">${esc(HebCal.hebrewDate(k).toString())}${hols.length ? ' · ' + esc(hols.map((h) => h.name).join(', ')) : ''}</div>
        ${restLine ? `<div class="banner">${'<div>' + restLine + '</div>'}</div>` : ''}
        ${rule ? `<div class="banner warn">${icon('hand')}<div style="flex:1">${rule.type === 'cancel' ? 'תעריף שבת/חג בוטל ידנית לתאריך זה' : 'סומן ידנית כיום מנוחה (150%)'}${rule.reason ? ' — ' + esc(rule.reason) : ''}</div><button class="btn sm" data-rule-del>בטל</button></div>` : ''}
        ${results.length || entries.length ? `<div class="list">${results.map((r) => App.shiftItem(r, { noDate: true })).join('')}${entries.map(App.entryItem).join('')}</div>${sum ? `<div class="small" style="margin:0 4px 12px">סה״כ ביום: <b>${U.money(sum)}</b></div>` : ''}` : '<div class="muted small" style="margin:6px 4px 14px">אין רישומים ביום זה.</div>'}
        <div class="btn-row"><button class="btn" data-add-shift>${icon('plus')} משמרת</button><button class="btn tonal" data-add-other>${icon('beach')} חופשה / מחלה / תוספת</button></div>
        <div class="divider"></div>
        ${!rule && autoInfo ? `<button class="btn outlined block" data-rule="cancel">${icon('hand', 's')} בטל 150% בתאריך זה לכל המשמרות</button><div class="tiny muted" style="margin:6px 4px">למשל חג שזוהה בטעות. אפשר לבטל.</div>` : ''}
        ${!rule && !info ? `<button class="btn outlined block" data-rule="force">${icon('candle', 's')} סמן כיום מנוחה (150%)</button>` : ''}`,
      onMount: (el) => {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-add-shift')) { UI.closeTop(); setTimeout(() => App.sheetsApi.shiftEditor(null, { date: k }), 320); }
          if (b.hasAttribute('data-add-other')) {
            UI.closeTop();
            setTimeout(() => UI.openSheet({ title: 'הוספה ל-' + U.fmtDate(k, 'dm'), body: `<div class="list">${[['vacation', 'beach', 'יום חופשה'], ['sick', 'thermo', 'יום מחלה'], ['adjustment', 'gift', 'בונוס / תוספת / ניכוי']].map(([kind, ic, t]) => `<button class="item" data-k="${kind}"><span class="lead">${icon(ic)}</span><span class="body"><span class="t">${t}</span></span></button>`).join('')}</div>`, onMount: (el2) => el2.querySelectorAll('[data-k]').forEach((x) => (x.onclick = () => { UI.closeTop(); setTimeout(() => App.sheetsApi.entryEditor(null, { kind: x.dataset.k, date: k }), 320); })) }), 320);
          }
          if (b.dataset.rule) {
            const reason = await UI.promptText(b.dataset.rule === 'cancel' ? 'ביטול 150% לתאריך' : 'סימון יום מנוחה', 'סיבה (לא חובה)', '', { ok: 'החל' });
            if (reason === null) return;
            UI.closeTop();
            await App.saveOps([{ store: 'dayRules', put: { id: 'dr_' + k, date: k, type: b.dataset.rule, reason } }], 'כלל יום', b.dataset.rule === 'cancel' ? 'תעריף 150% בוטל לכל המשמרות בתאריך' : 'היום סומן כיום מנוחה');
          }
          if (b.hasAttribute('data-rule-del')) { UI.closeTop(); await App.saveOps([{ store: 'dayRules', del: rule.id }], 'ביטול כלל יום', 'החישוב חזר לאוטומטי'); }
        });
      },
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
