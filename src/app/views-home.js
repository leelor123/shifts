/* ============================================================
 * views-home.js — home dashboard + shared shift list items.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Store, UI, App, HebCal } = root;
  const S = Store.S;
  const { icon, esc, money } = UI;

  /* ---------------- shared fragments ---------------- */
  App.restTag = (r) => (r.restHours > 0.01 ? `<span class="tag rest">${icon('candle')}${esc(r.restLabels[0] || 'שבת/חג')}</span>` : '');
  App.ovTag = (r) => (r.overridden || r.dayRuleHit ? `<span class="tag override" title="עקיפה ידנית">${icon('hand')}ידני</span>` : '');
  App.shiftItem = function (r, opts) {
    opts = opts || {};
    const sh = App.shift(r.id);
    if (!sh) return '';
    const roles = [...new Set(r.segments.map((s) => s.roleId))];
    const role = App.role(roles[0]);
    const title = roles.map(App.roleName).join(' → ');
    const date = opts.noDate ? '' : U.fmtDate(r.dateKey, 'short') + ' · ' + U.HEB_DAYS[U.dow(r.dateKey)] + ' · ';
    const planned = r.status === 'planned' ? '<span class="tag planned">מתוכננת</span>' : '';
    const emp = App.multiEmp() ? ' · ' + esc(App.employer(r.employerId).name) : '';
    return `<button class="item" data-act="shift-open" data-id="${r.id}">
      <span class="role-bar" style="background:${role ? role.color : '#999'}"></span>
      <span class="body"><span class="t">${esc(date)}${esc(title)} ${App.restTag(r)} ${App.ovTag(r)} ${planned}</span>
      <span class="s"><span class="num">⁦${U.epochHM(r.start)}–${U.epochHM(r.rawEnd)}⁩</span> · ${U.hm(r.paidMin)} ש׳${emp}${sh.note ? ' · ' + esc(sh.note) : ''}</span></span>
      <span class="trail"><span class="a">${money(r.total, 0)}</span>${opts.showOk && r.status === 'planned' ? `<br><span class="tag good" data-act="mark-done" data-id="${r.id}">${icon('check')}בוצעה</span>` : ''}</span></button>`;
  };
  App.entryItem = function (e) {
    const v = App.model.entryVals.get(e.id) || { amount: 0, label: '' };
    const map = { vacation: ['beach', 'יום חופשה'], sick: ['thermo', 'יום מחלה'], adjustment: [e.type === 'deduction' ? 'minus' : 'gift', v.label] };
    const [ic, label] = map[e.kind] || ['info', ''];
    const sub = e.kind === 'sick' && v.dayIndex ? `יום ${v.dayIndex} · ${v.pct}%` : e.note || '';
    const sign = e.kind === 'adjustment' && e.type === 'deduction' ? '−' : '';
    return `<button class="item" data-act="entry-open" data-id="${e.id}"><span class="lead" style="background:var(--surface-3)">${icon(ic)}</span>
      <span class="body"><span class="t">${U.fmtDate(e.date, 'short')} · ${esc(label)} ${e.status === 'planned' ? '<span class="tag planned">מתוכנן</span>' : ''}</span><span class="s">${esc(sub)}</span></span>
      <span class="trail"><span class="a">${sign}${money(v.amount, 0)}</span></span></button>`;
  };
  App.severityIcon = { info: 'info', warn: 'alert', critical: 'alert', good: 'okc' };
  App.insightRow = (a, opts) => `<div class="insight sev-${a.severity || 'info'} ${opts && opts.notif ? 'notif' + (a.read ? '' : ' unread') : ''}" ${a.id ? `data-nid="${esc(a.id)}"` : ''}>
    <span class="ic">${icon(App.severityIcon[a.severity] || 'bulb', 's')}</span>
    <div style="flex:1;min-width:0"><div class="t">${esc(a.title)}</div><div class="b">${esc(a.body)}</div>${a.explain ? `<div class="x">${icon('info', 's')} ${esc(a.explain)}</div>` : ''}${opts && opts.notif ? `<div class="when">${UI.timeAgo(a.createdAt)}</div>` : ''}</div></div>`;

  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  }

  /* ---------------- timer card ---------------- */
  function timerCard() {
    const a = S.activeShift;
    if (a) {
      const role = App.role(App.currentRole());
      const onBreak = App.onBreak();
      const others = App.roles(a.employerId).filter((r) => r.id !== App.currentRole());
      return `<div class="card timer-card running">
        <div class="small bold"><span class="pulse"></span>${onBreak ? 'בהפסקה' : 'משמרת פעילה'} · ${esc(role ? role.name : '')}</div>
        <div class="clock" data-clock="net">0:00:00</div>
        <div class="meta">התחלת ב-${U.epochHM(a.start)}${(a.breaks || []).length ? ' · הפסקות לא נספרות' : ''} · עד עכשיו כ-<b data-live-pay></b></div>
        <button class="btn big" data-act="timer-stop">${icon('stop')} סיים משמרת</button>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn tonal" data-act="timer-break">${icon(onBreak ? 'play' : 'coffee')} ${onBreak ? 'חזור מהפסקה' : 'הפסקה'}</button>
          ${others.length ? `<button class="btn tonal" data-act="timer-switch">${icon('swap')} החלף תפקיד</button>` : ''}
        </div></div>`;
    }
    const roles = App.roles();
    const sel = S.meta.lastRole && App.role(S.meta.lastRole) ? S.meta.lastRole : roles[0] && roles[0].id;
    return `<div class="card timer-card">
      ${roles.length > 1 ? `<div class="role-picker">${roles.map((r) => `<button class="chip ${r.id === sel ? 'on' : ''}" data-act="pick-role" data-id="${r.id}"><span class="sw" style="background:${r.color}"></span>${esc(r.name)}</button>`).join('')}</div>` : ''}
      <button class="btn big" data-act="timer-start" data-role="${sel || ''}">${icon('play')} התחל משמרת</button>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn text" data-act="shift-new">${icon('edit', 's')} הוספה ידנית</button>
        <button class="btn text" data-act="dup-last">${icon('copy', 's')} שכפל אחרונה</button>
      </div></div>`;
  }

  /* ---------------- period card ---------------- */
  function periodCard() {
    const emp = S.employers[0];
    const P = Engine.periodOf(U.todayKey(), emp);
    const sum = Engine.periodSummary(App.model, P.key, emp.id);
    const proj = App.insights && App.insights.projection;
    const goal = +S.settings.goal.amount || 0;
    const goalNet = S.settings.goal.type === 'net';
    const curVal = goalNet ? sum.net.net : sum.gross;
    const pct = goal ? Math.min(100, (curVal / goal) * 100) : 0;
    const projPct = goal && proj && proj.withPlanned ? Math.min(100, ((goalNet ? proj.withPlanned * (sum.gross ? sum.net.net / sum.gross : 0.85) : proj.withPlanned) / goal) * 100) : 0;
    return `<div class="card tonal card-link" data-act="go-summary">
      <div class="row-flex"><div style="flex:1"><div class="small bold">${emp.periodStartDay > 1 ? 'תקופת שכר' : 'החודש'} · ${esc(P.label)}</div>
      <div class="tiny" style="opacity:.8">⁦${U.fmtDate(P.from, 'short')}–${U.fmtDate(P.to, 'short')}⁩ · תשלום ב-${U.fmtDate(P.payDate, 'short')}</div></div>${icon('left')}</div>
      <div style="margin:10px 0 4px"><span class="tiny" style="opacity:.8">ברוטו עד עכשיו</span><div class="hero-num">${money(sum.gross, 0)}</div></div>
      <div class="kpis" style="margin-top:10px">
        <div class="kpi"><div class="l">נטו משוער</div><div class="v">${money(sum.net.net, 0)}</div></div>
        <div class="kpi"><div class="l">נסיעות</div><div class="v">${money(sum.travel, 0)}</div></div>
        <div class="kpi"><div class="l">שעות</div><div class="v"><span class="num">${U.hm(sum.hours * 60)}</span></div></div>
        <div class="kpi"><div class="l">משמרות</div><div class="v">${sum.shifts}</div></div>
      </div>
      ${proj && proj.pace ? `<div class="small" style="margin-top:12px">${icon('up', 's')} צפי לסוף ${emp.periodStartDay > 1 ? 'התקופה' : 'החודש'} לפי הקצב: <b>${money(proj.pace, 0)}</b>${proj.plannedCount ? `<br><span style="opacity:.85">מה שכבר רשום + ${proj.plannedCount} משמרות מתוכננות: <b>${money(proj.withPlanned, 0)}</b></span>` : ''}</div>` : ''}
      ${goal ? `<div style="margin-top:12px"><div class="row-flex small"><span>${icon('target', 's')} יעד ${goalNet ? 'נטו' : 'ברוטו'}: ${money(goal, 0)}</span><span class="spacer"></span><b>${U.num(pct, 0)}%</b></div>
        <div class="progress" style="margin-top:6px"><b style="width:${projPct}%"></b><i style="width:${pct}%"></i></div></div>` : `<div class="small" style="margin-top:10px;opacity:.85" data-act="settings-goal">${icon('target', 's')} הגדר יעד חודשי</div>`}
    </div>`;
  }

  function insightsCard() {
    const ins = App.insights;
    const live = ins ? ins.live.slice().sort((a, b) => b.priority - a.priority) : [];
    const sevOrder = { critical: 0, warn: 1, good: 2, info: 3 };
    const unread = S.notifications.filter((n) => !n.read && n.type !== 'weekly').sort((a, b) => (sevOrder[a.severity] - sevOrder[b.severity]) || b.createdAt - a.createdAt);
    const items = [...unread.slice(0, 3), ...live].slice(0, 3);
    if (!items.length) return '';
    return `<div class="card"><div class="card-head">${icon('bulb')}<h3>תובנות</h3><button class="btn text sm" data-act="insights">הכול</button></div>${items.map((a) => App.insightRow(a)).join('')}</div>`;
  }
  function weeklyCard() {
    const w = S.notifications.filter((n) => n.type === 'weekly').sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!w || w.read || Date.now() - w.createdAt > 4 * U.DAY) return '';
    return `<div class="card share-card"><div class="card-head">${icon('sparkle')}<h3>${esc(w.title)}</h3><button class="icon-btn" data-act="weekly-share" data-id="${esc(w.id)}" aria-label="שתף">${icon('share')}</button><button class="icon-btn" data-act="notif-read" data-id="${esc(w.id)}" aria-label="סגור">${icon('x')}</button></div>
      <div style="font-size:1.05rem">${esc(w.body)}</div><div class="tiny muted" style="margin-top:6px">${esc(w.explain)}</div></div>`;
  }
  function banners() {
    let h = '';
    if (S.settings.demo) h += `<div class="banner">${icon('flask')}<div style="flex:1">מצב הדגמה פעיל — הנתונים לדוגמה.</div><button class="btn sm" data-act="demo-clear">מחק נתוני דוגמה</button></div>`;
    const B = S.settings.backup;
    const last = Math.max(B.lastBackup || 0);
    if (S.shifts.length > 5 && Date.now() - last > (+S.settings.alerts.backupDays || 30) * U.DAY) {
      h += `<div class="banner warn">${icon('cloud')}<div style="flex:1">${last ? 'עבר זמן מאז הגיבוי האחרון.' : 'עוד לא גיבית.'} הנתונים שמורים רק בטלפון.</div><button class="btn sm" data-act="backup-now">גבה</button></div>`;
    }
    const issues = Engine.dataIssues(App.model).filter((i) => i.type === 'overlap');
    if (issues.length) h += `<div class="banner warn">${icon('alert')}<div style="flex:1">${esc(issues[0].text)}</div><button class="btn sm" data-act="shift-open" data-id="${issues[0].ids[1]}">בדוק</button></div>`;
    return h;
  }

  App.views.home = function () {
    const unread = S.notifications.filter((n) => !n.read && n.cat !== 'summary').length;
    const today = U.todayKey();
    const hd = HebCal.hebrewDate(today);
    const hol = HebCal.holidaysOn(today).map((h) => h.name).join(', ');
    const results = [...App.model.results.values()];
    const upcoming = results.filter((r) => r.status === 'planned').sort((a, b) => a.start - b.start).slice(0, 3);
    const recent = results.filter((r) => r.status === 'done').sort((a, b) => b.start - a.start).slice(0, 5);
    const recentEntries = S.entries.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
    return `
      <div class="topbar"><div class="titles"><h1>${greeting()} 👋</h1><div class="sub">${U.fmtDate(today, 'long')} · ${esc(hd.toString())}${hol ? ' · ' + esc(hol) : ''}</div></div>
        <button class="icon-btn tonal" data-act="insights" aria-label="התראות">${icon('bell')}${unread ? `<span class="dot-badge">${unread > 9 ? '9+' : unread}</span>` : ''}</button></div>
      ${banners()}
      ${timerCard()}
      ${weeklyCard()}
      ${periodCard()}
      ${insightsCard()}
      <div class="btn-row" style="margin-bottom:4px">
        <button class="btn tonal" data-act="payslip-new">${icon('receipt')} ניתוח תלוש</button>
        <button class="btn tonal" data-act="go-summary">${icon('chart')} סיכומים</button>
      </div>
      ${upcoming.length ? `<div class="section-title">${icon('calendar', 's')} משמרות מתוכננות<span class="spacer"></span><button class="btn text sm" data-act="tab" data-tab="calendar">ללוח</button></div><div class="list">${upcoming.map((r) => App.shiftItem(r, { showOk: true })).join('')}</div>` : ''}
      <div class="section-title">${icon('clock', 's')} משמרות אחרונות<span class="spacer"></span>${recent.length ? '<button class="btn text sm" data-act="go-shifts">הכול</button>' : ''}</div>
      ${recent.length ? `<div class="list">${recent.map((r) => App.shiftItem(r)).join('')}${recentEntries.map(App.entryItem).join('')}</div>`
        : UI.emptyState('clock', 'עוד אין משמרות', 'לחץ על "התחל משמרת" כשאתה מתחיל לעבוד, או הוסף משמרת ידנית.', '<button class="btn tonal" data-act="shift-new">הוסף משמרת</button>')}
    `;
  };

  /* ---------------- actions ---------------- */
  App.actions['pick-role'] = async (el) => { await Store.setMeta({ lastRole: el.dataset.id }); App.rerender(); };
  App.actions['timer-start'] = async (el) => {
    const roles = App.roles();
    let id = el && el.dataset && el.dataset.role;
    if (!id && roles.length > 1 && !S.meta.lastRole) {
      App.sheetsApi.pickRole('באיזה תפקיד?', (rid) => App.startShift(rid));
      return;
    }
    App.startShift(id || S.meta.lastRole || (roles[0] && roles[0].id));
  };
  App.actions['timer-stop'] = () => App.stopShift();
  App.actions['timer-break'] = () => App.toggleBreak();
  App.actions['timer-switch'] = () => {
    const a = S.activeShift;
    App.sheetsApi.pickRole('לאיזה תפקיד עברת?', (rid) => App.switchRole(rid), App.roles(a.employerId).filter((r) => r.id !== App.currentRole()));
  };
  App.actions['go-summary'] = () => { App.reportsState.sub = 'summary'; App.reportsState.type = 'month'; App.reportsState.anchor = U.todayKey(); App.go('reports'); };
  App.actions['go-shifts'] = () => { App.reportsState.sub = 'list'; App.go('reports'); };
  App.actions['mark-done'] = async (el, e) => {
    e.stopPropagation();
    const sh = Store.clone(App.shift(el.dataset.id));
    sh.status = 'done';
    await App.saveOps([{ store: 'shifts', put: sh }], 'סימון כבוצעה', 'המשמרת סומנה כבוצעה');
  };
  App.actions['notif-read'] = async (el) => {
    const n = S.notifications.find((x) => x.id === el.dataset.id);
    if (n) await Store.put('notifications', Object.assign({}, n, { read: true }));
  };
  App.actions['settings-goal'] = (el, e) => { e.stopPropagation(); App.sheetsApi.settingsSection('goal'); };
  App.actions['backup-now'] = () => App.doBackup(false);
})(typeof window !== 'undefined' ? window : globalThis);
