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
  /** A shift's amount as the lists show it: with its travel pay, or without (the "travel" switch). */
  App.shiftAmount = (r) => (S.settings.withTravel === false ? r.total - ((r.travel && r.travel.amount) || 0) : r.total);
  /** Does this person get travel pay at all? (only then is there a switch for it) */
  App.hasTravel = () => { for (const r of App.model.results.values()) if (r.travel && r.travel.amount > 0) return true; return false; };
  /** The "travel" switch over a list of shifts. */
  App.travelSwitch = () => {
    if (!App.hasTravel()) return '';
    const on = S.settings.withTravel !== false;
    return `<button class="tr-toggle ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="הסכומים כוללים נסיעות" data-act="travel-toggle"><span class="tr-l">${icon('bus', 's')}נסיעות</span><span class="tr-sw" aria-hidden="true"><i></i></span></button>`;
  };
  let travelTimer = 0;
  App.actions['travel-toggle'] = (el) => {
    // the knob slides at once (every switch on the screen); the amounts follow when it has arrived
    const on = !el.classList.contains('on');
    document.querySelectorAll('.tr-toggle').forEach((b) => { b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    clearTimeout(travelTimer);
    travelTimer = setTimeout(() => {
      const before = shownAmounts();
      Store.setSettings((s) => { s.withTravel = on; }).then(() => rollAmounts(before)).catch(() => {});
    }, 190);
  };
  /* The amounts follow the switch: each one (every shift, the list's total, each month's total - marked with
   * data-tr) rolls from what it showed to its new value, tinted green on the way up (the travel pay comes
   * back) and amber on the way down. The screen is redrawn by the save, so the values shown just before are
   * kept by their keys; a roll still running when the switch is flipped again starts from where it got to. */
  function shownAmounts() {
    const m = new Map();
    document.querySelectorAll('#view [data-tr]').forEach((x) => { const v = root.Fx.shownNumber(x); if (v != null) m.set(x.dataset.tr, v); });
    return m;
  }
  function rollAmounts(before) {
    if (!before.size || !root.Fx) return;
    document.querySelectorAll('#view [data-tr]').forEach((x) => {
      const from = before.get(x.dataset.tr), to = root.Fx.shownNumber(x);
      if (from == null || to == null || from === to) return;
      x.classList.add(to > from ? 'tr-up' : 'tr-down');
      root.Fx.tween(x, from, 600);
    });
  }
  App.shiftItem = function (r, opts) {
    opts = opts || {};
    const sh = App.shift(r.id);
    if (!sh) return '';
    const roles = [...new Set(r.segments.map((s) => s.roleId))];
    const role = App.role(roles[0]);
    const title = roles.map(App.roleName).join(' → ');
    const date = opts.noDate ? '' : U.fmtDate(r.dateKey, 'short') + ' · ' + U.DAYS[U.dow(r.dateKey)] + ' · ';
    const planned = r.status === 'planned' ? '<span class="tag planned">מתוכננת</span>' : '';
    const emp = App.multiEmp() ? ' · ' + esc(App.employer(r.employerId).name) : '';
    return `<button class="item" data-act="shift-open" data-id="${r.id}">
      <span class="role-bar" style="background:${role ? role.color : '#999'}"></span>
      <span class="body"><span class="t shift-title"><span class="tt">${esc(date)}${esc(title)}</span>${App.restTag(r)}${App.ovTag(r)}${planned}</span>
      <span class="s"><span class="num">⁦${U.epochHM(r.start)}\u2060–\u2060${U.epochHM(r.rawEnd)}⁩</span> · ${U.hm(r.paidMin)} ש׳${emp}${sh.note ? ' · ' + esc(sh.note) : ''}</span></span>
      <span class="trail"><span class="a" data-tr="s:${r.id}">${money(App.shiftAmount(r), 0)}</span>${opts.showOk && r.status === 'planned' && r.end <= Date.now() ? `<br><span class="tag good" data-act="mark-done" data-id="${r.id}">${icon('check')}בוצעה</span>` : ''}</span></button>`;
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

  /* ---------------- home: one number, one action, one highlight ----------------
   * The home screen answers three questions at a glance: how much have I earned this month,
   * what do I do now (start / stop a shift), and is there anything I should know (one line).
   * Everything else is one tap away: the number opens the summary, the line opens insights,
   * the + button holds every kind of entry (and payslips), the ✨ opens the assistant. */

  /* ---------------- the moments of a shift ----------------
   * Starting one: a power-up sound, sparks and two shock rings from the button, and the timer card springs
   * in. A break: a soft falling sound (a rising one coming back), the clock breathes, the dot turns amber.
   * Ending one: a cash register's "ka-ching", a fountain of coins from the button, and the start button
   * springs back. The sparks are on one layer over the whole screen, made once and kept (gamefx.js). A card's
   * entrance is drawn once, by the first redraw after the start (or the end): a later redraw (the insights a
   * moment after every save) must not play it again - the card would pop in twice. */
  const ENTER_MS = 1200;
  // the rings start at the button's edge (r0): from its centre they began as a solid dot, a frame that looked like a blink
  App.shiftMoment = function (kind, at) {
    const F = root.Fx;
    if (!F) return;
    const fx = root.GameFx ? root.GameFx.screen() : null;
    const [x, y] = at || [root.innerWidth / 2, root.innerHeight * 0.42];
    if (kind === 'start') {
      F.play('shiftStart'); F.haptic([12, 40, 24]);
      if (fx) {
        fx.burst(x, y, { palette: 'good', n: 36, kinds: ['spark', 'star', 'confetti'], speed: [180, 540] });
        fx.ring(x, y, { r0: 26, color: '#21d47f', r1: 170, width: 8 });
        setTimeout(() => fx.ring(x, y, { r0: 26, color: '#ffd84d', r1: 120, width: 5 }), 130);
      }
    } else if (kind === 'stop') {
      F.play('cash'); setTimeout(() => F.play('success'), 280); F.haptic([10, 40, 10, 40, 20]);
      if (fx) {
        fx.burst(x, y, { palette: 'gold', n: 50, kinds: ['coin', 'star', 'confetti', 'coin'], speed: [260, 700], up: 240 });
        fx.ring(x, y, { r0: 26, color: '#ffd84d', r1: 180, width: 9 });
      }
    } else if (kind === 'pause' || kind === 'resume') {
      F.play(kind); F.haptic(10);
      if (fx) fx.ring(x, y, { r0: 26, color: kind === 'pause' ? '#ffb524' : '#21d47f', r1: 64, width: 5 });
    }
  };
  /** The centre of the element that was tapped (screen coordinates), for the sparks to start there. */
  const tapped = (el) => { if (!el || !el.getBoundingClientRect) return null; const r = el.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; };
  // true once, for the first redraw after the moment (and only soon after it)
  const once = (k) => { const t = App[k]; App[k] = 0; return !!t && Date.now() - t < ENTER_MS; };

  /* ---------------- "did you forget to end it?" on the running shift ---------------- */
  // the likely end ready to tap: the planned end, or the usual length of this person's shifts (App.overdue)
  function overdueBlock() {
    const od = App.overdue && App.overdue();
    if (!od) return '';
    const k = U.epochKey(od.end);
    const when = U.epochHM(od.end) + (k === U.todayKey() ? '' : k === U.addDays(U.todayKey(), -1) ? ' אתמול' : ' · ' + U.fmtDate(k, 'short'));
    const why = od.why === 'planned' ? `המשמרת הייתה אמורה להסתיים ב-${U.epochHM(od.end)}` : `בדרך כלל המשמרות שלך נמשכות כ-${U.hm(Math.round(od.usual / 60000))} שעות`;
    return `<div class="tc-overdue" role="status"><div class="tc-od-t">${icon('clock', 's')}<span><b>שכחת לסיים את המשמרת?</b><small>${esc(why)}</small></span></div>
      <div class="tc-od-a"><button class="btn sm tc-od-end" data-act="timer-stop-at" data-at="${od.end}">סיום ב-${esc(when)}</button><button class="btn text sm" data-act="timer-still">עדיין בעבודה</button></div></div>`;
  }

  /* ---------------- action: start, or the running shift ---------------- */
  function actionBlock() {
    const a = S.activeShift;
    if (a) {
      const role = App.role(App.currentRole());
      const onBreak = App.onBreak();
      const others = App.roles(a.employerId).filter((r) => r.id !== App.currentRole());
      return `<div class="card timer-card running${onBreak ? ' on-break' : ''}${once('justStarted') ? ' tc-enter' : ''}"><span class="aurora" aria-hidden="true" style="${App.phase()}"><i></i><i></i><i></i></span>
        <div class="tc-head"><span class="pulse" style="${App.phase()}"></span>${onBreak ? 'בהפסקה' : 'משמרת פעילה'}${role ? ' · ' + esc(role.name) : ''}<span class="spacer"></span><span class="tiny">מ-${U.epochHM(a.start)}</span></div>
        <div class="clock" data-clock="net">0:00:00</div>
        <div class="meta">עד עכשיו <b data-live-pay></b>${(a.breaks || []).length ? ' · הפסקות לא נספרות' : ''}</div>
        ${overdueBlock()}
        <div class="tc-actions">
          <button class="btn big" data-act="timer-stop">${icon('stop')} סיים משמרת</button>
          <button class="icon-btn tonal lg" data-act="timer-break" aria-label="${onBreak ? 'חזור מהפסקה' : 'הפסקה'}">${icon(onBreak ? 'play' : 'coffee')}</button>
          ${others.length ? `<button class="icon-btn tonal lg" data-act="timer-switch" aria-label="החלף תפקיד">${icon('swap')}</button>` : ''}
        </div></div>`;
    }
    const roles = App.roles();
    const sel = S.meta.lastRole && App.role(S.meta.lastRole) ? S.meta.lastRole : roles[0] && roles[0].id;
    const role = App.role(sel);
    return `<div class="home-action${once('justStopped') ? ' ha-enter' : ''}">
      <span class="start-halo" aria-hidden="true" style="${App.phase()}"></span>
      <button class="btn big start" style="${App.phase()}" data-act="timer-start" data-role="${sel || ''}">${icon('play')} התחל משמרת</button>
      ${roles.length > 1 && role ? `<button class="role-chip" data-act="choose-role" aria-label="בחר תפקיד"><span class="sw" style="background:${role.color}"></span><span class="rc-n">${esc(role.name)}</span><span class="chev">${icon('left', 's')}</span></button>` : ''}
    </div>`;
  }

  /* ---------------- payday ---------------- */
  function paydayCard() {
    const emp = S.employers[0];
    const today = U.todayKey();
    const P = Engine.periodOf(today, emp);
    const due = [Engine.periodOf(U.addDays(P.from, -1), emp), P].find((x) => x.payDate === today);
    if (!due) return '';
    const sum = Engine.periodSummary(App.model, due.key, emp.id);
    if (!(sum.gross > 0)) return '';
    App.celebrateOnce('payday-' + today, () => root.Fx.celebrate('money'));
    return `<div class="card payday"><div class="pd-title"><span class="pd-emoji" aria-hidden="true">💸</span> היום יום משכורת!</div>
      <div style="margin-top:6px;opacity:.92">על ${esc(due.label)} מגיעים לך כ-<b>${money(sum.net.net, 0)}</b> ${sum.net.minor ? '' : 'נטו '}(${money(sum.gross, 0)} ברוטו). כשהתלוש מגיע, כדאי לבדוק שהוא תואם.</div>
      <button class="btn" data-act="payslip-new">${icon('file')} בדיקת תלוש</button></div>`;
  }

  /* ---------------- the month, in one number ---------------- */
  function hero() {
    const emp = S.employers[0];
    const P = Engine.periodOf(U.todayKey(), emp);
    const sum = Engine.periodSummary(App.model, P.key, emp.id);
    const proj = App.insights && App.insights.projection;
    const goal = +S.settings.goal.amount || 0;
    const goalNet = S.settings.goal.type === 'net';
    const curVal = goalNet ? sum.net.net : sum.gross;
    const pct = goal ? Math.min(100, (curVal / goal) * 100) : 0;
    if (goal && pct >= 100) App.celebrateOnce('goal-' + P.key, () => { root.Fx.celebrate('money'); UI.toast('הגעת ליעד החודשי! 🎯'); });
    const projPct = goal && proj && proj.withPlanned ? Math.min(100, ((goalNet ? proj.withPlanned * (sum.gross ? sum.net.net / sum.gross : 0.85) : proj.withPlanned) / goal) * 100) : 0;
    const periodName = emp.periodStartDay > 1 ? 'תקופת השכר' : esc(P.label);
    // the whole card opens the summary on a tap; keyboards and screen readers get a real button for it
    // (the card itself holds the "what is gross?" buttons, so it can't be one)
    const P2 = root.Plus;
    return `<section class="home-hero" data-act="go-summary"><button class="vh" data-act="go-summary">פירוט ${periodName}</button>
      ${P2 && P2.visible() ? `<button class="hh-skin" data-act="plus-design" aria-label="עיצוב כרטיס השכר">${icon('palette', 's')}</button>` : ''}
      <span class="aurora" aria-hidden="true" style="${App.phase()}"><i></i><i></i><i></i></span><span class="hh-dial" aria-hidden="true" style="${App.phase()}"></span>
      <div class="hh-label">${UI.term ? UI.term('gross', 'ברוטו') : 'ברוטו'} ${emp.periodStartDay > 1 ? 'בתקופת השכר' : 'ב' + periodName} עד עכשיו</div>
      <div class="hero-num">${money(sum.gross, 0)}</div>
      <div class="hh-stats"><span><b>${money(sum.net.net, 0)}</b><small>${UI.term ? UI.term('net', sum.net.minor ? 'נטו' : 'נטו משוער') : 'נטו'}</small></span><span><b class="num">${U.hm(sum.hours * 60)}</b><small>שעות</small></span><span><b>${sum.shifts}</b><small>${sum.shifts === 1 ? 'משמרת' : 'משמרות'}</small></span></div>
      ${goal ? `<div class="hh-goal"><div class="progress thin"><b style="width:${projPct}%"></b><i style="width:${pct}%"></i></div>
        <div class="hh-goal-l">${U.num(pct, 0)}% מיעד ${money(goal, 0)}${proj && proj.pace ? ` · צפי ${money(proj.pace, 0)}` : ''}</div></div>`
        : (proj && proj.pace ? `<div class="hh-goal-l">צפי לסוף ${emp.periodStartDay > 1 ? 'התקופה' : 'החודש'}: ${money(proj.pace, 0)}</div>` : '')}
    </section>`;
  }

  App.homeHero = hero; // the "try it on your card" preview (plus.js)

  /* ---------------- one line worth knowing (opens everything else) ---------------- */
  function highlight() {
    const now = Date.now();
    const sevOrder = { critical: 0, warn: 1, good: 2, info: 3 };
    const unread = S.notifications.filter((n) => !n.read && n.cat !== 'summary').sort((a, b) => (sevOrder[a.severity] - sevOrder[b.severity]) || b.createdAt - a.createdAt);
    const urgent = unread.filter((n) => n.severity === 'critical' || n.severity === 'warn');
    const next = [...App.model.results.values()].filter((r) => r.status === 'planned' && r.start > now && r.start - now < 36 * 3600000).sort((a, b) => a.start - b.start)[0];
    const weekly = S.notifications.filter((n) => n.type === 'weekly' && !n.read && now - n.createdAt < 4 * U.DAY).sort((a, b) => b.createdAt - a.createdAt)[0];
    const live = App.insights ? App.insights.live.slice().sort((a, b) => b.priority - a.priority) : [];
    let item = null, pay = null;
    const soon = !S.activeShift && [...App.model.results.values()].filter((r) => r.status === 'planned' && r.start > now - 60 * 60000 && r.start < now + 30 * 60000).sort((a, b) => a.start - b.start)[0];
    if (soon) item = { act: 'start-planned', id: soon.id, ic: 'play', cls: 'go', t: `התחל את המשמרת של ${U.epochHM(soon.start)}` };
    else if (urgent[0]) item = { act: 'insights', ic: 'alert', cls: 'sev-' + urgent[0].severity, t: urgent[0].title };
    else if (next) item = { act: 'shift-open', id: next.id, ic: 'calendar', cls: '', t: `משמרת ${U.epochKey(next.start) === U.todayKey() ? 'היום' : 'מחר'} ב-${U.epochHM(next.start)} · ${App.roleName(next.segments[0].roleId)}` };
    else if (weekly) item = { act: 'insights', ic: 'sparkle', cls: '', t: 'הסיכום השבועי שלך מוכן' };
    // the week before payday: how many days are left and about how much is coming (before tips and notes)
    else if ((pay = paydaySoon())) item = pay;
    else if (unread[0]) item = { act: 'insights', ic: App.severityIcon[unread[0].severity] || 'bulb', cls: 'sev-' + (unread[0].severity || 'info'), t: unread[0].title };
    else if (live[0]) item = { act: 'insights', ic: 'bulb', cls: '', t: live[0].title };
    if (!item) return '';
    const more = item.cls === 'go' ? 0 : Math.max(0, unread.length - (unread.some((n) => n.title === item.t) ? 1 : 0));
    return `<button class="highlight ${item.cls}" data-act="${item.act}"${item.id ? ` data-id="${item.id}"` : ''}>
      <span class="hl-ic">${icon(item.ic, 's')}</span><span class="hl-t">${esc(item.t)}</span>${more ? `<span class="hl-more">+${more}</span>` : ''}${icon('left', 's')}</button>`;
  }

  /** The next pay date within a week (of the period that ended, or this one), with its expected net. */
  function paydaySoon() {
    const emp = S.employers[0];
    if (!emp) return null;
    const today = U.todayKey();
    const P = Engine.periodOf(today, emp);
    const next = [Engine.periodOf(U.addDays(P.from, -1), emp), P].find((x) => x.payDate && x.payDate > today);
    if (!next) return null;
    const days = U.diffDays(today, next.payDate);
    if (!(days >= 1 && days <= 7)) return null;
    const sum = Engine.periodSummary(App.model, next.key, emp.id);
    if (!(sum.gross > 0)) return null;
    const when = days === 1 ? 'מחר משכורת' : `עוד ${days} ימים למשכורת`;
    return { act: 'go-summary', ic: 'wallet', cls: 'payday-soon', t: `💸 ${when} · כ-${U.money(sum.net.net, 0)}` }; // short enough for one line on a small phone
  }

  /* ---------------- saving up for something ---------------- */
  function savingCard() {
    const g = S.settings.saving || {};
    const price = +g.price || 0;
    if (!(price > 0) || !g.name) return '';
    const today = U.todayKey();
    const from = g.from && g.from <= today ? g.from : today;
    const sum = Engine.rangeSummary(App.model, from, today);
    const have = Math.max(0, (sum.net && sum.net.net) || 0);
    const pct = Math.min(100, (have / price) * 100);
    const done = have >= price;
    // hours still needed, at the net per hour of the last three months
    const recent = Engine.rangeSummary(App.model, U.addDays(today, -90), today);
    const role = App.roles()[0];
    const perHour = recent.hours > 0 ? recent.net.net / recent.hours : role ? Engine.roleRate(role, today) : 0;
    const hoursLeft = !done && perHour > 0 ? Math.ceil((price - have) / perHour) : null;
    if (done) App.celebrateOnce('saving-' + g.name + '-' + price, () => { root.Fx.celebrate('money'); UI.toast(`יש לך מספיק בשביל ${g.name}! 🎉`); });
    return `<button class="save-card ${done ? 'done' : ''}" data-act="settings-open" data-k="goal" aria-label="יעד חיסכון: ${esc(g.name)}, ${Math.floor(pct)}%">
      <span class="sv-top"><span class="sv-e" aria-hidden="true">${done ? '🎉' : '🎯'}</span><b>${esc(g.name)}</b><span class="sv-pct">${Math.floor(pct)}%</span></span>
      <span class="progress thin"><i style="width:${pct}%"></i></span>
      <span class="sv-sub">${done ? `יש לך מספיק! הרווחת ${money(have, 0)} מאז שהתחלת לחסוך` : `הרווחת ${money(have, 0)} מתוך ${money(price, 0)}${hoursLeft ? ` · עוד כ-${hoursLeft} שעות עבודה` : ''}`}</span></button>`;
  }

  /* ---------------- four big doors to the things people look for ---------------- */
  function shortcuts() {
    const d = (act, ic, label, tint) => `<button class="sc" data-act="${act}">${UI.tile(ic, tint)}<span>${label}</span></button>`;
    return `<div class="shortcuts">${d('shift-new', 'plus', 'משמרת חדשה', 'violet')}${d('rights', 'shield', 'הזכויות שלי', 'mint')}${d('payslip-new', 'receipt', 'בדיקת תלוש', 'amber')}${d('games', 'game', 'משחקים', 'pink')}</div>`;
  }

  function birthdayCard() {
    const b = S.settings.birthDate;
    if (!b || b.slice(5) !== U.todayKey().slice(5)) return '';
    const age = Engine.ageAt(b, U.todayKey());
    App.celebrateOnce('bday-' + U.todayKey(), () => root.Fx.celebrate('big'));
    return `<div class="card bday"><div class="bday-confetti" aria-hidden="true"></div><div class="bday-title">מזל טוב${S.settings.userName ? ', ' + esc(S.settings.userName) : ''}!</div>
      <div>יום הולדת ${age} שמח 🎂 שתהיה שנה של משמרות טובות, בוסים הוגנים ותלושים בלי הפתעות.</div>${age === 18 ? '<div class="small" style="margin-top:6px">מהיום החישוב כולל ניכויי חובה רגילים.</div>' : ''}</div>`;
  }
  function banners() {
    let h = '';
    if (Store.isMemoryOnly && Store.isMemoryOnly()) h += `<div class="banner slim warn">${icon('alert', 's')}<div style="flex:1">${root.Cloud && root.Cloud.user ? 'הדפדפן לא שומר נתונים בטלפון כרגע. הכול נשמר בחשבון שלך.' : 'הדפדפן לא שומר נתונים בטלפון. התחבר לחשבון כדי לא לאבד אותם.'}</div></div>`;
    if (S.settings.demo) h += `<div class="banner slim">${icon('flask', 's')}<div style="flex:1">מצב הדגמה — נתונים לדוגמה</div><button class="btn text sm" data-act="demo-clear">מחק</button></div>`;
    const B = S.settings.backup;
    const last = Math.max(B.lastBackup || 0);
    if (!S.meta.cloudUid && S.shifts.length > 5 && Date.now() - last > (+S.settings.alerts.backupDays || 30) * U.DAY) {
      h += `<div class="banner slim warn">${icon('cloud', 's')}<div style="flex:1">${last ? 'עבר זמן מאז הגיבוי האחרון' : 'עוד לא גיבית'}</div><button class="btn text sm" data-act="backup-now">גבה</button></div>`;
    }
    const issues = Engine.dataIssues(App.model).filter((i) => i.type === 'overlap');
    if (issues.length) h += `<div class="banner slim warn">${icon('alert', 's')}<div style="flex:1">${esc(issues[0].text)}</div><button class="btn text sm" data-act="shift-open" data-id="${issues[0].ids[1]}">בדוק</button></div>`;
    return h;
  }

  App.views.home = function () {
    if (!S.meta.ms && App.milestones) App.milestones(); // notes where the user is, so the next medal is a real one
    const unread = S.notifications.filter((n) => !n.read && n.cat !== 'summary').length;
    const today = U.todayKey();
    const hd = HebCal.hebrewDate(today);
    const hol = HebCal.holidaysOn(today).map((h) => h.name).join(', ');
    const results = [...App.model.results.values()];
    const now = Date.now();
    // planned shifts whose time has passed wait for a "done" tap, so they come first
    const pending = results.filter((r) => r.status === 'planned' && r.start < now).sort((a, b) => b.start - a.start).slice(0, 2);
    const recent = results.filter((r) => r.status === 'done').sort((a, b) => b.start - a.start).slice(0, 3);
    const name = S.settings.userName ? ', ' + esc(String(S.settings.userName).split(' ')[0]) : '';
    const date = U.fmtDate(today, 'long').replace(/\s\d{4}$/, '');
    return `
      <div class="home-top"><div class="titles"><h1>${greeting()}${name} <span class="wave">👋</span></h1>
        <div class="sub">${root.Plus && root.Plus.owned() ? '<span class="plus-badge">Plus ✨</span>' : ''}${date}${hd.dayStr ? ' · ' + esc(hd.toString().replace(/\s\S+$/, '')) : ''}${hol ? ' · ' + esc(hol) : ''}</div></div>
        <span id="sync-dot">${App.syncDot ? App.syncDot() : ''}</span>
        <button class="icon-btn" data-act="support" aria-label="עזרה ותמיכה">${icon('help')}</button>
        <button class="icon-btn" data-act="insights" aria-label="התראות ותובנות">${icon('bell')}${unread ? `<span class="dot-badge">${unread > 9 ? '9+' : unread}</span>` : ''}</button></div>
      ${birthdayCard()}
      ${paydayCard()}
      ${banners()}
      ${App.recapCard ? App.recapCard() : ''}
      ${hero()}
      ${actionBlock()}
      ${App.guideCard ? App.guideCard() : ''}
      ${highlight()}
      ${root.Plus ? root.Plus.nudgeCard() : ''}
      ${savingCard()}
      ${shortcuts()}
      ${pending.length + recent.length ? `<div class="home-list-head"><span>${pending.length ? 'לסמן כבוצעה' : 'משמרות אחרונות'}</span><span class="spacer"></span>${App.travelSwitch()}<button class="btn text sm" data-act="go-shifts">הכול</button></div>
        <div class="list home-list">${pending.map((r) => App.shiftItem(r, { showOk: true })).join('')}${recent.slice(0, Math.max(1, 3 - pending.length)).map((r) => App.shiftItem(r)).join('')}</div>`
        : S.meta.guide && !S.meta.guideDone ? '' : `<div class="empty fun">${App.mascot ? App.mascot('sleepy', { size: 92 }) : ''}<h3>עוד אין משמרות</h3><div>בתחילת משמרת לוחצים על "התחל משמרת".<br>משמרת שכבר התקיימה מוסיפים בכפתור <b>+</b>.</div></div>`}
    `;
  };

  /* ---------------- actions ---------------- */
  App.actions['pick-role'] = async (el) => { await Store.setMeta({ lastRole: el.dataset.id }); App.rerender(); };
  App.actions['start-planned'] = (el) => { const sh = App.shift(el.dataset.id); if (sh && !S.activeShift) App.startShift(sh.roleId, { fromPlanned: sh.id, at: tapped(el) }); };
  App.actions['choose-role'] = () => App.sheetsApi.pickRole('תפקיד למשמרת', async (rid) => { await Store.setMeta({ lastRole: rid }); App.rerender(); });
  App.actions['timer-start'] = async (el) => {
    const roles = App.roles();
    let id = el && el.dataset && el.dataset.role;
    if (!id && roles.length > 1 && !S.meta.lastRole) {
      App.sheetsApi.pickRole('באיזה תפקיד?', (rid) => App.startShift(rid));
      return;
    }
    App.startShift(id || S.meta.lastRole || (roles[0] && roles[0].id), { at: tapped(el) });
  };
  App.actions['timer-stop'] = (el) => App.stopShift(tapped(el));
  App.actions['timer-stop-at'] = (el) => App.stopShift(tapped(el), +el.dataset.at);
  App.actions['timer-still'] = async () => {
    const a = S.activeShift;
    if (!a) return;
    await Store.setActive(Object.assign({}, a, { stillAt: Date.now() }));
    UI.toast('בסדר, נשאל שוב בעוד שעתיים');
  };
  App.actions['timer-break'] = (el) => App.toggleBreak(tapped(el));
  App.actions['timer-switch'] = () => {
    const a = S.activeShift;
    App.sheetsApi.pickRole('לאיזה תפקיד עברת?', (rid) => App.switchRole(rid), App.roles(a.employerId).filter((r) => r.id !== App.currentRole()));
  };
  App.actions['go-summary'] = () => { App.reportsState.sub = 'summary'; App.reportsState.type = 'month'; App.reportsState.anchor = U.todayKey(); App.go('reports'); };
  App.actions['go-shifts'] = () => { App.reportsState.sub = 'list'; App.go('reports'); };
  App.actions['mark-done'] = async (el, e) => {
    e.stopPropagation();
    const sh = App.shift(el.dataset.id);
    if (sh) await App.markDone(sh);
  };
  App.actions['notif-read'] = async (el) => {
    const n = S.notifications.find((x) => x.id === el.dataset.id);
    if (n) await Store.put('notifications', Object.assign({}, n, { read: true }));
  };
  App.actions['settings-goal'] = (el, e) => { e.stopPropagation(); App.sheetsApi.settingsSection('goal'); };
  App.actions['backup-now'] = () => App.doBackup(false);
})(typeof window !== 'undefined' ? window : globalThis);
