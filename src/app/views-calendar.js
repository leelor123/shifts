/* ============================================================
 * views-calendar.js — month & week calendar.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, HebCal, Store, UI, App } = root;
  const S = Store.S;
  const { icon, esc } = UI;

  App.calState = { mode: 'month', anchor: U.todayKey() };

  function dayData() {
    const map = {};
    for (const r of App.model.results.values()) {
      const d = (map[r.dateKey] = map[r.dateKey] || { shifts: [], entries: [], total: 0, ov: false });
      d.shifts.push(r);
      if (r.status === 'done') d.total += r.total;
      if (r.overridden || r.dayRuleHit) d.ov = true;
    }
    for (const e of S.entries) {
      const d = (map[e.date] = map[e.date] || { shifts: [], entries: [], total: 0, ov: false });
      d.entries.push(e);
      const v = App.model.entryVals.get(e.id);
      if (v && e.status !== 'planned') d.total += e.type === 'deduction' ? 0 : v.amount;
    }
    return map;
  }
  const shortMoney = (n) => (n >= 1000 ? '₪' + (n / 1000).toFixed(1).replace('.0', '') + 'K' : '₪' + Math.round(n));

  function monthView(map) {
    const mk = App.calState.anchor.slice(0, 7);
    const first = mk + '-01';
    const start = U.weekStart(first, S.settings.weekStart || 0);
    const today = U.todayKey();
    const cfg = App.model.ctx.restCfg;
    let cells = '';
    let monthTotal = 0, monthHours = 0;
    for (let i = 0; i < 42; i++) {
      const k = U.addDays(start, i);
      if (i >= 35 && k.slice(0, 7) !== mk) break;
      const d = map[k];
      const inMonth = k.slice(0, 7) === mk;
      if (d && inMonth) { monthTotal += d.total; monthHours += d.shifts.filter((r) => r.status === 'done').reduce((s, r) => s + r.paidHours, 0); }
      const rest = HebCal.restDayInfo(k, cfg);
      const hol = HebCal.holidaysOn(k);
      const hd = HebCal.hebrewDate(k);
      const dots = d ? d.shifts.slice(0, 4).map((r) => { const role = App.role(r.segments[0] ? r.segments[0].roleId : null); return `<i class="${r.status === 'planned' ? 'pl' : ''}" style="background:${role ? role.color : '#999'};color:${role ? role.color : '#999'}"></i>`; }).join('') + d.entries.slice(0, 2).map((e) => `<i style="background:var(--outline)"></i>`).join('') : '';
      cells += `<button class="cal-day ${inMonth ? '' : 'other'} ${rest ? 'rest' : ''} ${k === today ? 'today' : ''}" data-act="cal-day" data-k="${k}" aria-label="${U.fmtDate(k, 'long')}">
        ${d && d.ov ? '<span class="ovr" title="עקיפה ידנית"></span>' : ''}${hol.some((h) => h.rest) ? '<span class="hol">🕯</span>' : hol.length ? '<span class="hol">•</span>' : ''}
        <span class="dn">${+k.slice(8)}</span><span class="hd">${hd.dayStr}</span><span class="dots">${dots}</span>${d && d.total ? `<span class="amt">${shortMoney(d.total)}</span>` : ''}</button>`;
    }
    const dows = [...Array(7)].map((_, i) => U.HEB_DAYS_SHORT[(i + (S.settings.weekStart || 0)) % 7]);
    const hm = HebCal.hebrewDate(first), hm2 = HebCal.hebrewDate(U.monthEnd(mk));
    const hebLabel = hm.monthStr === hm2.monthStr ? hm.monthStr + ' ' + hm.yearStr : hm.monthStr + '–' + hm2.monthStr + ' ' + hm2.yearStr;
    return `<div class="cal-nav"><button class="icon-btn" data-act="cal-nav" data-dir="-1" aria-label="הקודם">${icon('right')}</button><h2>${U.fmtMonth(mk)}<div class="tiny muted" style="font-weight:400">${esc(hebLabel)}</div></h2><button class="icon-btn" data-act="cal-nav" data-dir="1" aria-label="הבא">${icon('left')}</button></div>
      <div class="cal-dow">${dows.map((x) => `<span>${x}</span>`).join('')}</div>
      <div class="cal-grid swipe-area" id="cal-swipe">${cells}</div>
      <div class="row-flex small" style="margin:10px 4px"><span>סה״כ בחודש: <b>${UI.money(monthTotal, 0)}</b></span><span class="spacer"></span><span class="muted"><span class="num">${U.hm(monthHours * 60)}</span> ש׳</span></div>`;
  }

  function weekView(map) {
    const ws = U.weekStart(App.calState.anchor, S.settings.weekStart || 0);
    const cfg = App.model.ctx.restCfg;
    const today = U.todayKey();
    let rows = '', tot = 0, hrs = 0;
    for (let i = 0; i < 7; i++) {
      const k = U.addDays(ws, i);
      const d = map[k];
      const rest = HebCal.restDayInfo(k, cfg);
      const hol = HebCal.holidaysOn(k);
      const day0 = U.dayStart(k), day1 = U.dayStart(U.addDays(k, 1));
      const pos = (t) => Math.max(0, Math.min(100, ((t - day0) / (day1 - day0)) * 100));
      let bars = '';
      for (const w of HebCal.restWindows(U.addDays(k, -1), U.addDays(k, 1), cfg)) {
        if (w.end <= day0 || w.start >= day1) continue;
        bars += `<span class="rz" style="inset-inline-start:${pos(w.start)}%;width:${pos(w.end) - pos(w.start)}%"></span>`;
      }
      if (d) for (const r of d.shifts) for (const s of r.segments) {
        const role = App.role(s.roleId);
        if (s.end <= day0 || s.start >= day1) continue;
        bars += `<i style="inset-inline-start:${pos(s.start)}%;width:${Math.max(1.5, pos(s.end) - pos(s.start))}%;background:${role ? role.color : '#999'};opacity:${r.status === 'planned' ? 0.45 : 0.9}"></i>`;
      }
      if (d) { tot += d.total; hrs += d.shifts.filter((r) => r.status === 'done').reduce((s, r) => s + r.paidHours, 0); }
      const label = d ? d.shifts.map((r) => `${App.roleName(r.segments[0] && r.segments[0].roleId)} ⁦${U.epochHM(r.start)}–${U.epochHM(r.rawEnd)}⁩${r.status === 'planned' ? ' (מתוכננת)' : ''}`).concat(d.entries.map((e) => (e.kind === 'vacation' ? 'חופשה' : e.kind === 'sick' ? 'מחלה' : (App.model.entryVals.get(e.id) || {}).label))).join(' · ') : '';
      rows += `<div class="week-row ${rest ? 'rest' : ''} card-link" data-act="cal-day" data-k="${k}" ${k === today ? 'style="box-shadow:inset 3px 0 0 var(--primary)"' : ''}>
        <div class="wd"><div class="tiny muted">${U.HEB_DAYS[U.dow(k)]}</div><div class="n">${+k.slice(8)}</div><div class="tiny muted">${HebCal.hebrewDate(k).dayStr}</div></div>
        <div class="tl"><div class="row-flex small"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(hol.map((h) => h.name).join(', ') || label || '—')}</span>${d && d.total ? `<b>${UI.money(d.total, 0)}</b>` : ''}${d && d.ov ? ` <span class="tag override">${icon('hand')}</span>` : ''}</div>
        <div class="timeline">${bars}</div>${hol.length && label ? `<div class="tiny muted">${esc(label)}</div>` : ''}</div></div>`;
    }
    return `<div class="cal-nav"><button class="icon-btn" data-act="cal-nav" data-dir="-1" aria-label="הקודם">${icon('right')}</button><h2>${U.fmtDate(ws, 'dm')} – ${U.fmtDate(U.addDays(ws, 6), 'dm')}</h2><button class="icon-btn" data-act="cal-nav" data-dir="1" aria-label="הבא">${icon('left')}</button></div>
      <div class="list swipe-area" id="cal-swipe">${rows}</div>
      <div class="row-flex small" style="margin:0 4px 10px"><span>סה״כ בשבוע: <b>${UI.money(tot, 0)}</b></span><span class="spacer"></span><span class="muted"><span class="num">${U.hm(hrs * 60)}</span> ש׳</span></div>
      <div class="tiny muted" style="margin:0 4px">ציר הזמן: 00:00 ← 24:00 · אזור צהוב = שבת/חג</div>`;
  }

  App.views.calendar = function () {
    const map = dayData();
    const st = App.calState;
    const roles = App.roles();
    return `<div class="topbar"><div class="titles"><h1>לוח שנה</h1></div>
        <button class="icon-btn" data-act="cal-today" aria-label="היום">${icon('target')}</button>
        <button class="icon-btn" data-act="cal-export" aria-label="ייצוא ליומן">${icon('download')}</button></div>
      <div class="seg" style="margin-bottom:12px"><button class="${st.mode === 'month' ? 'on' : ''}" data-act="cal-mode" data-m="month">חודש</button><button class="${st.mode === 'week' ? 'on' : ''}" data-act="cal-mode" data-m="week">שבוע</button></div>
      ${st.mode === 'month' ? monthView(map) : weekView(map)}
      <div class="legend">${roles.map((r) => `<span><i style="background:${r.color}"></i>${esc(r.name)}</span>`).join('')}
        <span><i style="background:transparent;box-shadow:inset 0 0 0 1.5px var(--outline)"></i>מתוכננת</span>
        <span><i style="background:var(--rest-tint);border:1px solid var(--rest-mark)"></i>שבת/חג</span>
        <span><i style="background:var(--override)"></i>עקיפה ידנית</span></div>
      <button class="btn tonal block" data-act="shift-plan">${icon('plus')} תכנן משמרת</button>`;
  };
  App.views.calendar_mount = function (v) {
    const el = v.querySelector('#cal-swipe');
    if (el) UI.onSwipe(el, (dir) => App.actions['cal-nav']({ dataset: { dir: dir === 'right' ? '1' : '-1' } }));
  };

  App.actions['cal-mode'] = (el) => { App.calState.mode = el.dataset.m; App.rerender(); };
  App.actions['cal-today'] = () => { App.calState.anchor = U.todayKey(); App.rerender(); };
  App.actions['cal-nav'] = (el) => {
    const dir = +el.dataset.dir;
    App.calState.anchor = App.calState.mode === 'month' ? U.addMonths(App.calState.anchor.slice(0, 7) + '-01', dir) : U.addDays(App.calState.anchor, 7 * dir);
    App.render();
  };
  App.actions['cal-day'] = (el) => App.sheetsApi.daySheet(el.dataset.k);
  App.actions['cal-export'] = () => {
    UI.openSheet({
      title: 'ייצוא ליומן',
      body: `<div class="list">
        <button class="item" data-r="upcoming"><span class="lead">${icon('calendar')}</span><span class="body"><span class="t">משמרות מתוכננות קדימה</span><span class="s">קובץ .ics עם תזכורת שעה לפני</span></span></button>
        <button class="item" data-r="month"><span class="lead">${icon('grid')}</span><span class="body"><span class="t">כל המשמרות בחודש המוצג</span><span class="s">קובץ .ics</span></span></button>
        <button class="item" data-r="all"><span class="lead">${icon('list')}</span><span class="body"><span class="t">כל המשמרות</span><span class="s">קובץ .ics</span></span></button></div>
        <div class="tiny muted" style="margin:4px">פתח את הקובץ בטלפון כדי להוסיף ל-Google Calendar. למשמרת בודדת: פתח אותה ← "הוסף ל-Google Calendar".</div>`,
      onMount: (el) => el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
        const r = b.dataset.r;
        const mk = App.calState.anchor.slice(0, 7);
        let list = [...App.model.results.values()];
        if (r === 'upcoming') list = list.filter((x) => x.status === 'planned' && x.end > Date.now());
        if (r === 'month') list = list.filter((x) => x.dateKey.slice(0, 7) === mk);
        if (!list.length) { UI.toast('אין משמרות לייצוא'); return; }
        App.exporter.ics(list, `shifts-${r === 'month' ? mk : r}.ics`);
        UI.closeTop();
      })),
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
