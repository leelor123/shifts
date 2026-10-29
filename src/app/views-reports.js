/* ============================================================
 * views-reports.js — periodic summaries (week / month / year /
 * custom), comparisons, charts, searchable shift list.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Store, UI, App, Charts } = root;
  const S = Store.S;
  const { icon, esc, money } = UI;

  App.reportsState = { sub: 'summary', type: 'month', anchor: U.todayKey(), from: U.addDays(U.todayKey(), -30), to: U.todayKey(), f: { q: '', role: '', status: 'all', ov: false, from: '', to: '' } };
  const st = App.reportsState;

  /* ---------------- ranges ---------------- */
  function rangeFor(type, anchor) {
    const emp = S.employers[0];
    if (type === 'week') { const ws = U.weekStart(anchor, S.settings.weekStart || 0); return { from: ws, to: U.addDays(ws, 6), label: `${U.fmtDate(ws, 'dm')} – ${U.fmtDate(U.addDays(ws, 6), 'dm')}` }; }
    if (type === 'month') { const P = Engine.periodOf(anchor, emp); return { from: P.from, to: P.to, label: P.label, sub: emp.periodStartDay > 1 ? `⁦${U.fmtDate(P.from, 'short')}\u2060–\u2060${U.fmtDate(P.to, 'short')}⁩` : '' }; }
    if (type === 'year') { const y = anchor.slice(0, 4); return { from: y + '-01-01', to: y + '-12-31', label: 'שנת ' + y }; }
    return { from: st.from, to: st.to, label: `${U.fmtDate(st.from, 'short')} – ${U.fmtDate(st.to, 'short')}` };
  }
  function shiftAnchor(type, anchor, dir) {
    if (type === 'week') return U.addDays(anchor, 7 * dir);
    if (type === 'month') { const r = rangeFor('month', anchor); return dir > 0 ? U.addDays(r.to, 1) : U.addDays(r.from, -1); }
    if (type === 'year') return (+anchor.slice(0, 4) + dir) + '-06-01';
    return anchor;
  }
  function prevRange(type, r) {
    if (type === 'custom') { const len = U.diffDays(r.from, r.to) + 1; return { from: U.addDays(r.from, -len), to: U.addDays(r.from, -1) }; }
    return rangeFor(type, shiftAnchor(type, r.from, -1));
  }
  function firstData() {
    let f = null;
    for (const r of App.model.results.values()) if (r.status === 'done' && (!f || r.dateKey < f)) f = r.dateKey;
    return f;
  }
  /** Average of metric over N previous ranges (only ranges after data started). */
  function averages(type, r, n) {
    if (type === 'year' || type === 'custom') return null;
    const first = firstData();
    const list = [];
    let cur = r;
    const count = type === 'week' ? (n === 3 ? 13 : 52) : n;
    for (let i = 0; i < count; i++) {
      cur = prevRange(type, cur);
      if (!first || cur.to < first) break;
      list.push(Engine.rangeSummary(App.model, cur.from, cur.to));
    }
    if (!list.length) return null;
    const avg = (f) => list.reduce((s, x) => s + f(x), 0) / list.length;
    return { n: list.length, gross: avg((x) => x.gross), net: avg((x) => x.net.net), hours: avg((x) => x.hours), shifts: avg((x) => x.shifts), travel: avg((x) => x.travel), avgHourly: avg((x) => x.avgHourly), avgShift: avg((x) => x.avgShift) };
  }

  /* ---- the average monthly pay: over the last 3 / 6 / 12 pay periods that ended, this year's, or all of them ----
   * only periods with work count (a month off would pull the average down); the current one, not over yet, never */
  // short on the buttons (five fit in a row on a small phone), whole for screen readers
  const AVG_RANGES = [[3, '3 ח׳', '3 החודשים האחרונים'], [6, '6 ח׳', '6 החודשים האחרונים'], [12, '12 ח׳', '12 החודשים האחרונים'], ['year', 'השנה', 'השנה'], ['all', 'הכול', 'כל הזמן']];
  App.monthAverage = function (range) {
    const emp = S.employers[0];
    const first = firstData();
    if (!emp || !first) return null;
    const cur = Engine.periodOf(U.todayKey(), emp);
    const list = [];
    let p = Engine.periodOf(U.addDays(cur.from, -1), emp);
    for (let i = 0; i < 600 && p.to >= first; i++) {
      if (range === 'year' && p.to.slice(0, 4) !== U.todayKey().slice(0, 4)) break;
      if (typeof range === 'number' && i >= range) break;
      const s = Engine.periodSummary(App.model, p.key, emp.id);
      if (s.shifts > 0) list.push({ p, s });
      p = Engine.periodOf(U.addDays(p.from, -1), emp);
    }
    if (!list.length) return { n: 0 };
    const avg = (f) => list.reduce((sum, x) => sum + f(x.s), 0) / list.length;
    const byGross = list.slice().sort((a, b) => b.s.gross - a.s.gross);
    return { n: list.length, gross: avg((s) => s.gross), net: avg((s) => s.net.net), hours: avg((s) => s.hours), shifts: avg((s) => s.shifts),
      best: byGross[0], low: byGross[byGross.length - 1], list: list.reverse() };
  };
  function avgCard() {
    const range = st.avgRange == null ? 12 : st.avgRange;
    const a = App.monthAverage(range);
    if (!a) return '';
    // whole labels (a word put in the middle of another sentence reads wrong in other languages)
    const byPeriod = S.employers[0].periodStartDay > 1;
    const body = !a.n ? `<div class="small muted">${range === 'year' ? 'השנה עוד לא הסתיים חודש שעבדת בו.' : 'עוד אין חודש שהסתיים עם משמרות.'}</div>`
      : `<div class="kpis three">
          <div class="kpi"><div class="l">${byPeriod ? 'ברוטו לתקופת שכר' : 'ברוטו לחודש'}</div><div class="v">${money(a.gross, 0)}</div></div>
          <div class="kpi"><div class="l">נטו משוער</div><div class="v">${money(a.net, 0)}</div></div>
          <div class="kpi"><div class="l">${byPeriod ? 'שעות לתקופת שכר' : 'שעות לחודש'}</div><div class="v"><span class="num">${U.hm(a.hours * 60)}</span></div></div></div>
        ${a.n > 1 ? '<div class="avg-bars">' + Charts.hbars(a.list.map((x) => ({ name: x.p.label, value: x.s.gross, color: 'var(--brand, #6d28d9)', text: U.money(x.s.gross, 0) }))) + '</div>' : ''}
        <div class="tiny muted" style="margin-top:6px">לפי ${a.n === 1 ? 'חודש אחד' : a.n + ' חודשים'} שהסתיימו ועבדת בהם (חודש בלי משמרות לא נכלל)${a.n > 1 ? ` · הגבוה: ${esc(a.best.p.label)} ${U.money(a.best.s.gross, 0)} · הנמוך: ${esc(a.low.p.label)} ${U.money(a.low.s.gross, 0)}` : ''}</div>`;
    return `<div class="section-title">${icon('chart', 's')} משכורת חודשית ממוצעת</div>
      <div class="card avg-card"><div class="seg avg-seg" role="tablist" aria-label="טווח הממוצע">${AVG_RANGES.map(([k, l, full]) => `<button class="${String(range) === String(k) ? 'on' : ''}" role="tab" aria-selected="${String(range) === String(k)}" aria-label="${full}" data-act="rep-avg" data-r="${k}">${l}</button>`).join('')}</div>${body}</div>`;
  }

  /* ---------------- summary ---------------- */
  App.summaryData = function (type, anchor) {
    const r = rangeFor(type, anchor);
    const t = Engine.rangeSummary(App.model, r.from, r.to);
    const pr = prevRange(type, r);
    const p = Engine.rangeSummary(App.model, pr.from, pr.to);
    return { r, t, pr, p };
  };

  function kpi(label, cur, prev, fmt, invert) {
    return `<div class="kpi"><div class="l">${label}</div><div class="v">${fmt(cur)}</div><div class="d">${UI.delta(cur, prev, { invert })}</div></div>`;
  }
  function compareTable(t, p, a3, a12, type) {
    const rows = [
      ['ברוטו', (x) => x.gross, (v) => U.money(v, 0)], ['נטו משוער', (x) => (x.net && x.net.net != null ? x.net.net : x.net), (v) => U.money(v, 0)],
      ['שעות', (x) => x.hours, (v) => U.num(v, 1)], ['משמרות', (x) => x.shifts, (v) => U.num(v, 1)],
      ['ממוצע לשעה', (x) => x.avgHourly, (v) => U.money(v)], ['שעות למשמרת', (x) => x.avgShift, (v) => U.num(v, 1)],
    ];
    let h = `<div class="compare-row h"><span></span><span>קודמת</span>${a3 ? `<span>ממוצע 3 ח׳</span>` : ''}${a12 ? `<span>ממוצע 12 ח׳</span>` : ''}</div>`;
    for (const [lab, f, fmt] of rows) {
      const cur = f(t);
      const cell = (v) => `<span class="num">${fmt(v)}</span> ${UI.delta(cur, v, { compact: true })}`;
      const fa = (a) => (a ? f(Object.assign({}, a, { net: a.net })) : null);
      h += `<div class="compare-row"><span><b>${lab}</b><br><span class="num small">${fmt(cur)}</span></span><span class="small">${cell(f(p))}</span>${a3 ? `<span class="small">${cell(fa(a3))}</span>` : ''}${a12 ? `<span class="small">${cell(fa(a12))}</span>` : ''}</div>`;
    }
    return h + `<div class="tiny muted" style="margin-top:6px">החיצים: שינוי של התקופה הנוכחית ביחס לכל עמודה. ${type === 'week' ? 'ממוצעים לשבוע' : 'ממוצעים לחודש'}${a3 ? ` (3 ח׳ = ${a3.n} ${type === 'week' ? 'שבועות' : 'תקופות'})` : ''}${a12 ? `, (12 ח׳ = ${a12.n})` : ''} — רק מתקופות שיש בהן נתונים.</div>`;
  }

  function yearExtras(t, r) {
    const y = r.from.slice(0, 4);
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const mk = y + '-' + U.pad(m);
      const mt = Engine.totals(App.model, U.monthStart(mk), U.monthEnd(mk));
      months.push({ mk, t: mt });
    }
    const worked = months.filter((m) => m.t.shifts > 0);
    const best = worked.slice().sort((a, b) => b.t.gross - a.t.gross)[0];
    const worst = worked.slice().sort((a, b) => a.t.gross - b.t.gross)[0];
    const seasons = [['חורף (דצמ׳\u2060–\u2060פבר׳)', [12, 1, 2], '#2a78d6'], ['אביב (מרץ\u2060–\u2060מאי)', [3, 4, 5], '#1baf7a'], ['קיץ (יוני\u2060–\u2060אוג׳)', [6, 7, 8], '#eda100'], ['סתיו (ספט׳\u2060–\u2060נוב׳)', [9, 10, 11], '#eb6834']]
      .map(([name, ms, color]) => ({ name: name.split(' ')[0], full: name, color, value: months.filter((m) => ms.includes(+m.mk.slice(5))).reduce((s, m) => s + m.t.gross, 0) }));
    // previous year
    const py = String(+y - 1);
    const pt = Engine.rangeSummary(App.model, py + '-01-01', py + '-12-31');
    // Form-106 style + refund estimate
    const T = S.settings.tax;
    let withheld = 0, withheldSrc = 0, bl = 0, health = 0, pension = 0, pensionEr = 0, sev = 0, hish = 0, hishEr = 0, taxable = 0;
    const emp = S.employers[0];
    const monthsWithIncome = [];
    for (const m of months) {
      const P = Engine.periodByKey(m.mk, emp);
      const ps = Engine.periodSummary(App.model, m.mk, emp.id);
      const slip = S.payslips.find((x) => x.period === m.mk);
      const sf = slip ? slip.fields || {} : {};
      const g = slip && sf.gross ? +sf.gross.value : ps.gross;
      if (g > 0) monthsWithIncome.push(m.mk);
      taxable += g;
      const n = Engine.netEstimate({ gross: g, pensionBase: Engine.pensionBaseOf(ps, S.settings), deductions: 0, periodTo: P.to }, S.settings);
      const pick = (k, est) => (slip && sf[k] && sf[k].value != null ? (withheldSrc++, +sf[k].value) : est);
      withheld += slip && sf.incomeTax ? +sf.incomeTax.value : n.incomeTax;
      if (slip && sf.incomeTax) withheldSrc++;
      bl += pick('nationalInsurance', n.bl); health += pick('healthTax', n.health); pension += pick('pensionEmployee', n.pensionEmployee);
      pensionEr += pick('pensionEmployer', n.pensionEmployer); sev += pick('severance', n.severance); hish += pick('hishtalmutEmployee', n.hishtalmut); hishEr += pick('hishtalmutEmployer', n.hishtalmutEmployer);
    }
    const annual = Engine.netEstimate({ gross: taxable, pensionBase: pension / ((+S.settings.pension.employeePct || 6) / 100) || 0, pensionActive: pension > 0, deductions: 0, months: 12 }, S.settings);
    const liability = annual.incomeTax;
    const refund = withheld - liability;
    const gap12 = 12 - monthsWithIncome.length;
    const yearDone = y < U.todayKey().slice(0, 4);
    return `
      <div class="section-title">${icon('chart', 's')} לפי חודשים</div>
      <div class="card">${Charts.bars(months.map((m) => ({ label: U.MONTHS_SHORT[+m.mk.slice(5) - 1], value: m.t.gross, tip: `${U.fmtMonth(m.mk)}: ${U.money(m.t.gross, 0)} · ${U.num(m.t.hours, 1)} ש׳` })), { label: 'ברוטו לפי חודש', axisFmt: (v) => '₪' + (v >= 1000 ? +(v / 1000).toFixed(1) + 'K' : v) })}
        ${best ? `<div class="kv"><span>${icon('up', 's')} החודש הכי טוב</span><b>${U.fmtMonth(best.mk)} · ${U.money(best.t.gross, 0)}</b></div>` : ''}
        ${worst && worst !== best ? `<div class="kv"><span>${icon('down', 's')} החודש הכי חלש</span><b>${U.fmtMonth(worst.mk)} · ${U.money(worst.t.gross, 0)}</b></div>` : ''}
        <div class="kv"><span>מול ${py}</span><span>${U.money(pt.gross, 0)} ${UI.delta(t.gross, pt.gross)}</span></div></div>
      <div class="section-title">${icon('sun', 's')} התפלגות עונתית</div>
      <div class="card">${Charts.hbars(seasons, (v) => U.money(v, 0))}</div>
      <div class="section-title">${icon('file', 's')} סיכום בסגנון טופס 106</div>
      <div class="card">
        ${[['סה״כ הכנסה ברוטו (משכורת)', taxable], ['מס הכנסה שנוכה', withheld], ['ביטוח לאומי (עובד)', bl], ['מס בריאות', health], ['הפרשת עובד לפנסיה', pension], ['הפרשת מעסיק לתגמולים', pensionEr], ['הפרשת מעסיק לפיצויים', sev], ['קרן השתלמות — עובד', hish], ['קרן השתלמות — מעסיק', hishEr]]
          .map(([l, v]) => `<div class="kv"><span>${l}</span><b class="money">${U.money(v)}</b></div>`).join('')}
        <div class="kv"><span>חודשי עבודה</span><b>${monthsWithIncome.length}</b></div>
        <div class="kv"><span>נקודות זיכוי</span><b>${T.creditPoints}</b></div>
        <div class="tiny muted" style="margin-top:8px">${withheldSrc ? 'חלק מהשורות מבוססות על תלושים שהזנת; השאר — הערכה.' : 'כל הנתונים הם הערכה לפי המשמרות. הזנת תלושים תשפר את הדיוק.'} הטופס הרשמי (106) מתקבל מהמעסיק.</div></div>
      <div class="card ${refund > 150 ? 'tonal' : ''}"><div class="card-head">${icon('wallet')}<h3>החזר מס — הערכה</h3></div>
        ${refund > 150 ? `<div>ייתכן שמגיע לך <b>החזר של כ-${U.money(refund, 0)}</b>.</div>` : refund < -150 ? `<div>לפי ההערכה, נוכה פחות מס מהחבות השנתית (כ-${U.money(-refund, 0)}). זה קורה לפעמים כשעובדים אצל כמה מעסיקים.</div>` : '<div>לפי ההערכה, המס שנוכה קרוב לחבות השנתית.</div>'}
        <div class="small" style="margin-top:6px">מס שנוכה: ${U.money(withheld, 0)} · חבות שנתית משוערת: ${U.money(liability, 0)}${gap12 > 0 ? ` · ${gap12} חודשים בלי הכנסה${yearDone ? '' : ' (כולל חודשים שעוד לא הגיעו)'}` : ''}</div>
        <div class="tiny" style="margin-top:8px;opacity:.85">מס הכנסה מנוכה כל חודש כאילו תעבוד כך כל השנה. בשנה עם חודשים בלי עבודה, או עם שינויים גדולים בהכנסה, לרוב נוכה יותר מדי. זו הערכה בלבד — מומלץ לבדוק בסימולטור של רשות המסים או מול יועץ מס / רו״ח.</div></div>`;
  }

  function summaryView() {
    const { r, t, p } = App.summaryData(st.type, st.anchor);
    const a3 = averages(st.type, r, 3), a12 = averages(st.type, r, 12);
    const roles = Object.entries(t.byRole).map(([id, v]) => ({ id, role: App.role(id), ...v })).sort((a, b) => b.hours - a.hours);
    const hb = t.hoursBy;
    const types = [
      { name: 'רגילות', value: hb.regular, color: '#2a78d6' }, { name: '125%', value: hb.ot1, color: '#eda100' },
      { name: '150% נוספות', value: hb.ot2, color: '#eb6834' }, { name: 'שבת/חג', value: hb.rest, color: '#1baf7a' },
      { name: 'שבת+נוספות', value: hb.restOt1 + hb.restOt2, color: '#4a3aa7' },
    ];
    const totalH = types.reduce((s, x) => s + x.value, 0) || 1;
    const daysOff = Math.max(0, t.days - t.workDays - t.vacationDays - t.sickDays);
    const longest = t.longest;
    return `
      <div class="chips">${[['week', 'שבוע'], ['month', S.employers[0].periodStartDay > 1 ? 'תקופת שכר' : 'חודש'], ['year', 'שנה'], ['custom', 'טווח חופשי']].map(([k, l]) => `<button class="chip ${st.type === k ? 'on' : ''}" data-act="rep-type" data-t="${k}">${l}</button>`).join('')}</div>
      ${st.type === 'custom' ? `<div class="grid2"><label class="field"><span class="lbl">מתאריך</span><input class="input" type="date" id="rep-from" value="${st.from}"></label><label class="field"><span class="lbl">עד תאריך</span><input class="input" type="date" id="rep-to" value="${st.to}"></label></div>`
        : `<div class="cal-nav"><button class="icon-btn" data-act="rep-nav" data-dir="-1" aria-label="הקודם">${icon('right')}</button><h2>${esc(r.label)}${r.sub ? `<div class="tiny muted" style="font-weight:400">${r.sub}</div>` : ''}</h2><button class="icon-btn" data-act="rep-nav" data-dir="1" aria-label="הבא">${icon('left')}</button></div>`}
      <div id="rep-swipe" class="swipe-area">
      <div class="card tonal">
        <div class="tiny" style="opacity:.8">ברוטו</div><div class="hero-num">${money(t.gross, 0)}</div><div class="small">${UI.delta(t.gross, p.gross)} לעומת התקופה הקודמת (${U.money(p.gross, 0)})</div>
        <div class="kpis" style="margin-top:12px">
          ${kpi('נטו משוער', t.net.net, p.net.net, (v) => money(v, 0))}
          ${kpi('שעות', t.hours, p.hours, (v) => `<span class="num">${U.hm(v * 60)}</span>`)}
          ${kpi('משמרות', t.shifts, p.shifts, (v) => v)}
          ${kpi('נסיעות', t.travel, p.travel, (v) => money(v, 0))}
          ${kpi('ממוצע לשעה', t.avgHourly, p.avgHourly, (v) => money(v))}
          ${kpi('שעות למשמרת', t.avgShift, p.avgShift, (v) => U.num(v, 1))}
          ${kpi('בונוסים ותוספות', t.bonus + t.additions, p.bonus + p.additions, (v) => money(v, 0))}
          ${kpi('ניכויים', t.deductions, p.deductions, (v) => money(v, 0), true)}
        </div>
        ${t.tips ? `<div class="small" style="margin-top:8px">טיפים (מחוץ לתלוש): <b>${U.money(t.tips, 0)}</b></div>` : ''}
        ${t.leavePay ? `<div class="small" style="margin-top:4px">כולל ימי חופשה/מחלה: <b>${U.money(t.leavePay, 0)}</b></div>` : ''}
      </div>
      ${t.overridden ? `<div class="banner warn">${icon('hand')}<div>${t.overridden} משמרות בתקופה כוללות עקיפה ידנית — הן נכללות בסכומים.</div></div>` : ''}
      <button class="an-entry" data-act="analysis-open">${UI.tile('sparkle', 'violet')}<span class="an-entry-t"><b>ניתוח מתקדם</b><small>איזה יום ושעה הכי משתלמים לך, השיאים שלך ו"מה אם"</small></span>${icon('left', 's')}</button>
      ${st.type !== 'custom' && st.type !== 'year' ? `<div class="section-title">${icon('up', 's')} השוואה</div><div class="card">${compareTable(t, p, a3, a12, st.type)}</div>` : ''}
      ${st.type === 'custom' ? `<div class="section-title">${icon('up', 's')} השוואה לתקופה קודמת באותו אורך</div><div class="card">${compareTable(t, p, null, null, st.type)}</div>` : ''}
      ${st.type !== 'custom' ? avgCard() : ''}
      <div class="section-title">${icon('users', 's')} לפי תפקיד</div>
      <div class="card">${roles.length ? Charts.hbars(roles.map((x) => ({ name: x.role ? x.role.name : '?', value: x.hours, color: x.role ? x.role.color : '#999', text: U.num(x.hours, 1) + ' ש׳' })))
        + '<div class="divider"></div>' + Charts.hbars(roles.map((x) => ({ name: x.role ? x.role.name : '?', value: x.amount, color: x.role ? x.role.color : '#999', text: U.money(x.amount, 0) }))) : '<div class="muted small">אין נתונים</div>'}</div>
      <div class="section-title">${icon('clock', 's')} לפי סוג שעה</div>
      <div class="card"><div class="stackbar">${types.filter((x) => x.value > 0).map((x) => `<i style="width:${(x.value / totalH) * 100}%;background:${x.color}" data-tip="${esc(x.name)}: ${U.num(x.value, 2)} ש׳"></i>`).join('')}</div>
        ${types.map((x) => `<div class="kv"><span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${x.color};margin-inline-end:6px"></i>${x.name}</span><span class="num">${U.hours(x.value)} ש׳</span></div>`).join('')}
        <div class="kv"><span>${icon('moon', 's')} שעות לילה (⁦22:00\u2060–\u206006:00⁩)</span><span class="num">${U.hours(t.nightAll)} ש׳</span></div>
        ${S.employers[0].nightEnabled ? `<div class="kv"><span>מתוכן עם תוספת לילה</span><span class="num">${U.hours(hb.night)} ש׳ · ${U.money(t.nightPremium, 0)}</span></div>` : '<div class="tiny muted">תוספת לילה לא מוגדרת — אפשר להפעיל בהגדרות › חישוב השכר › חוקי חישוב.</div>'}</div>
      <div class="section-title">${icon('calendar', 's')} ימים</div>
      <div class="card"><div class="kpis three">
        <div class="kpi"><div class="l">ימי עבודה</div><div class="v">${t.workDays}</div></div>
        <div class="kpi"><div class="l">ימי חופש</div><div class="v">${daysOff}</div></div>
        <div class="kpi"><div class="l">חופשה / מחלה</div><div class="v">${t.vacationDays} / ${t.sickDays}</div></div></div>
        ${longest ? `<div class="kv" style="margin-top:8px"><span>המשמרת הארוכה ביותר</span><b>${U.fmtDate(longest.dateKey, 'short')} · <span class="num">${U.hm(longest.paidMin)}</span> ש׳</b></div>` : ''}
        ${t.bestDay ? `<div class="kv"><span>היום הרווחי ביותר</span><b>${U.fmtDate(t.bestDay.key, 'short')} · ${U.money(t.bestDay.amount, 0)}</b></div>` : ''}</div>
      ${st.type === 'year' ? yearExtras(t, r) : ''}
      </div>
      ${st.type === 'month' && t.shifts > 0 && App.recap ? `<button class="btn recap-btn block" data-act="recap-open" data-pk="${Engine.periodOf(r.from, S.employers[0]).key}">✨ הסיכום של החודש כסיפור</button>` : ''}
      ${st.type === 'year' && t.shifts > 0 && App.recap ? `<button class="btn recap-btn block" data-act="recap-open" data-pk="Y${r.from.slice(0, 4)}">🎁 השנה שלך כסיפור (Wrapped)</button>` : ''}
      <div class="btn-row" style="margin-top:8px">
        <button class="btn tonal" data-act="rep-share-img">${icon('image')} תמונה</button>
        <button class="btn tonal" data-act="rep-pdf">${icon('printer')} PDF</button>
        <button class="btn tonal" data-act="rep-csv">${icon('table')} CSV</button>
      </div>
      <button class="btn text block" data-act="claim-report" style="margin-top:4px">${icon('file', 's')} דוח ומכתב לבירור מול המעסיק</button>`;
  }

  /* ---------------- charts ---------------- */
  function chartsView() {
    const emp = S.employers[0];
    const cur = Engine.periodOf(U.todayKey(), emp).key;
    const pks = [];
    for (let i = 11; i >= 0; i--) pks.push(U.addMonthKey(cur, -i));
    let data = pks.map((pk) => ({ pk, s: Engine.periodSummary(App.model, pk, emp.id) }));
    // months before the first one with any work are left out (but at least half a year is shown)
    const firstUsed = data.findIndex((d) => d.s.shifts > 0 || d.s.gross > 0);
    if (firstUsed > 0) data = data.slice(Math.min(firstUsed, data.length - 6));
    const lab = (pk) => U.MONTHS_SHORT[+pk.slice(5) - 1];
    const roles = App.roles();
    const money0 = (v) => U.money(v, 0);
    return `
      <div class="card"><div class="card-head"><h2 class="h3">שכר ברוטו לפי חודש</h2></div>${Charts.bars(data.map((d) => ({ label: lab(d.pk), value: d.s.gross, tip: `${U.fmtMonth(d.pk)}: ${U.money(d.s.gross, 0)} (נטו ~${U.money(d.s.net.net, 0)})`, dim: d.pk === cur })), { label: 'ברוטו לפי חודש', axisFmt: (v) => '₪' + (v >= 1000 ? +(v / 1000).toFixed(1) + 'K' : v) })}<div class="tiny muted">החודש הנוכחי מוצג בהיר — עדיין לא הסתיים.</div></div>
      <div class="card"><div class="card-head"><h2 class="h3">שעות לפי תפקיד</h2></div>${Charts.stacked(data.map((d) => lab(d.pk)), roles.map((r) => ({ name: r.name, color: r.color, values: data.map((d) => (d.s.byRole[r.id] ? d.s.byRole[r.id].hours : 0)) })), { label: 'שעות לפי תפקיד', fmt: (v) => U.num(v, 1) + ' ש׳' })}</div>
      <div class="card"><div class="card-head"><h2 class="h3">שכר ממוצע לשעה</h2></div>${Charts.line(data.map((d) => lab(d.pk)), data.map((d) => (d.s.hours ? d.s.avgHourly : null)), { label: 'ממוצע לשעה', fmt: (v) => U.money(v), zero: false, axisFmt: (v) => '₪' + Math.round(v) })}<div class="tiny muted">כולל תוספות שבת ושעות נוספות, בלי נסיעות.</div></div>
      <div class="card"><div class="card-head"><h2 class="h3">שעות לפי סוג</h2></div>${Charts.stacked(data.map((d) => lab(d.pk)), [
        { name: 'רגילות', color: '#2a78d6', values: data.map((d) => d.s.hoursBy.regular) },
        { name: 'נוספות', color: '#eda100', values: data.map((d) => d.s.hoursBy.ot1 + d.s.hoursBy.ot2) },
        { name: 'שבת/חג', color: '#1baf7a', values: data.map((d) => d.s.restHours) },
      ], { label: 'שעות לפי סוג', fmt: (v) => U.num(v, 1) + ' ש׳' })}</div>
      <div class="card"><div class="card-head"><h2 class="h3">טבלה</h2></div>${data.slice().reverse().map((d) => `<div class="kv"><span>${U.fmtMonth(d.pk)}</span><span><span class="num">${U.num(d.s.hours, 1)} ש׳</span> · <b>${money0(d.s.gross)}</b></span></div>`).join('')}</div>`;
  }

  /* ---------------- shift list with search & filters ---------------- */
  function filtered() {
    const f = st.f;
    const q = f.q.trim().toLowerCase();
    return [...App.model.results.values()].filter((r) => {
      if (f.status !== 'all' && r.status !== f.status) return false;
      if (f.role && !r.byRole[f.role] && !r.segments.some((s) => s.roleId === f.role)) return false;
      if (f.ov && !(r.overridden || r.dayRuleHit)) return false;
      if (f.from && r.dateKey < f.from) return false;
      if (f.to && r.dateKey > f.to) return false;
      if (q) {
        const sh = App.shift(r.id) || {};
        const hay = [sh.note, sh.overrideReason, ...r.segments.map((s) => App.roleName(s.roleId)), U.fmtDate(r.dateKey), r.restLabels.join(' ')].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => b.start - a.start);
  }
  App.filteredShifts = filtered;
  // A long history (a few years: 1,000+ shifts) drawn all at once took seconds on a slow phone. The
  // newest PAGE are drawn and "show more" adds the next PAGE; any change of the filters starts over.
  const PAGE = 100;
  function listView() {
    const f = st.f;
    const list = filtered();
    const fkey = JSON.stringify(f);
    if (st.shownFor !== fkey) { st.shownFor = fkey; st.shown = PAGE; }
    const shown = Math.min(list.length, st.shown || PAGE);
    const groups = {};
    for (const r of list) (groups[r.dateKey.slice(0, 7)] = groups[r.dateKey.slice(0, 7)] || []).push(r);
    // month totals always count the whole month; only the rows are cut at `shown`
    let left = shown;
    const months = Object.entries(groups).map(([mk, rs]) => { const rows = rs.slice(0, Math.max(0, left)); left -= rows.length; return [mk, rs, rows]; }).filter(([, , rows]) => rows.length);
    const entries = S.entries.filter((e) => (!f.from || e.date >= f.from) && (!f.to || e.date <= f.to) && !f.role && !f.ov && !f.q).sort((a, b) => b.date.localeCompare(a.date));
    return `
      <div class="field" style="position:relative"><input class="input" id="flt-q" placeholder="חיפוש בהערות, תפקיד, תאריך…" value="${esc(f.q)}" style="padding-inline-start:44px"><span style="position:absolute;inset-inline-start:12px;top:14px" class="muted">${icon('search')}</span></div>
      <div class="chips">
        <button class="chip ${!f.role ? 'on' : ''}" data-act="flt-role" data-id="">כל התפקידים</button>
        ${App.roles().map((r) => `<button class="chip ${f.role === r.id ? 'on' : ''}" data-act="flt-role" data-id="${r.id}"><span class="sw" style="background:${r.color}"></span>${esc(r.name)}</button>`).join('')}
      </div>
      <div class="chips">
        ${[['all', 'הכול'], ['done', 'בוצעו'], ['planned', 'מתוכננות']].map(([k, l]) => `<button class="chip ${f.status === k ? 'on' : ''}" data-act="flt-status" data-s="${k}">${l}</button>`).join('')}
        <button class="chip ${f.ov ? 'on' : ''}" data-act="flt-ov">${icon('hand', 's')} עם עקיפה</button>
      </div>
      <div class="grid2"><label class="field"><span class="lbl">מתאריך</span><input class="input" type="date" id="flt-from" value="${f.from}"></label><label class="field"><span class="lbl">עד</span><input class="input" type="date" id="flt-to" value="${f.to}"></label></div>
      <div class="row-flex small" style="margin:0 4px 10px"><span>${list.length} משמרות · <span data-tr="all">${U.money(list.filter((r) => r.status === 'done').reduce((s, r) => s + App.shiftAmount(r), 0), 0)}</span></span><span class="spacer"></span>${App.travelSwitch()}<button class="btn text sm" data-act="flt-csv">${icon('download', 's')} CSV</button>${f.q || f.role || f.ov || f.from || f.to || f.status !== 'all' ? '<button class="btn text sm" data-act="flt-clear">נקה</button>' : ''}</div>
      ${list.length ? months.map(([mk, rs, rows]) => `<div class="section-title">${U.fmtMonth(mk)}<span class="spacer"></span>${rs.some((r) => r.status === 'done') ? `<span class="small muted" data-tr="m:${mk}">${U.money(rs.filter((r) => r.status === 'done').reduce((s, r) => s + App.shiftAmount(r), 0), 0)}</span>` : '<span class="small muted">מתוכנן</span>'}</div><div class="list">${rows.map((r) => App.shiftItem(r)).join('')}</div>`).join('') : UI.emptyState('search', 'לא נמצאו משמרות', 'נסה לשנות את החיפוש או המסננים.')}
      ${list.length > shown ? `<button class="btn tonal block list-more" data-act="flt-more">${icon('down', 's')} עוד ${Math.min(PAGE, list.length - shown)} משמרות <span class="small muted">(מוצגות ${shown} מתוך ${list.length})</span></button>` : ''}
      ${entries.length ? `<div class="section-title">חופשה, מחלה ותוספות</div><div class="list">${entries.slice(0, 50).map(App.entryItem).join('')}</div>` : ''}`;
  }

  /* ---------------- tab ---------------- */
  App.views.reports = function () {
    const subs = [['summary', 'סיכומים'], ['charts', 'גרפים'], ['list', 'משמרות'], ['payslips', 'תלושים']];
    const body = st.sub === 'summary' ? summaryView() : st.sub === 'charts' ? chartsView() : st.sub === 'list' ? listView() : App.payslipsTab();
    return `<div class="topbar"><div class="titles"><h1>דוחות</h1></div><button class="icon-btn" data-act="insights" aria-label="תובנות">${icon('bulb')}</button></div>
      <div class="seg" style="margin-bottom:14px">${subs.map(([k, l]) => `<button class="${st.sub === k ? 'on' : ''}" data-act="rep-sub" data-s="${k}">${l}</button>`).join('')}</div>${body}`;
  };
  App.views.reports_mount = function (v) {
    const sw = v.querySelector('#rep-swipe');
    if (sw && st.type !== 'custom') UI.onSwipe(sw, (dir) => App.actions['rep-nav']({ dataset: { dir: dir === 'right' ? '1' : '-1' } }));
    const on = (id, fn) => { const el = v.querySelector(id); if (el) UI.on(el, 'change', fn); };
    on('#rep-from', (e) => { st.from = e.target.value; App.rerender(); });
    on('#rep-to', (e) => { st.to = e.target.value; App.rerender(); });
    on('#flt-from', (e) => { st.f.from = e.target.value; App.rerender(); });
    on('#flt-to', (e) => { st.f.to = e.target.value; App.rerender(); });
    const q = v.querySelector('#flt-q');
    if (q) {
      let t = null;
      UI.on(q, 'input', () => { clearTimeout(t); t = setTimeout(() => { st.f.q = q.value; App.rerender(); const nq = document.querySelector('#flt-q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } }, 300); });
    }
    if (App.payslipsTabMount) App.payslipsTabMount(v);
  };

  App.actions['rep-sub'] = (el) => { st.sub = el.dataset.s; App.render(); };
  App.actions['rep-avg'] = (el) => { const v = el.dataset.r; st.avgRange = /^\d+$/.test(v) ? +v : v; if (root.Fx) root.Fx.play('on'); App.render(); };
  App.actions['rep-type'] = (el) => { st.type = el.dataset.t; App.rerender(); };
  App.actions['rep-nav'] = (el) => { st.anchor = shiftAnchor(st.type, rangeFor(st.type, st.anchor).from, +el.dataset.dir); App.rerender(); };
  App.actions['flt-role'] = (el) => { st.f.role = el.dataset.id; App.rerender(); };
  App.actions['flt-status'] = (el) => { st.f.status = el.dataset.s; App.rerender(); };
  App.actions['flt-ov'] = () => { st.f.ov = !st.f.ov; App.rerender(); };
  App.actions['flt-more'] = () => { st.shown = (st.shown || PAGE) + PAGE; App.rerender(); };
  App.actions['flt-clear'] = () => { st.f = { q: '', role: '', status: 'all', ov: false, from: '', to: '' }; App.rerender(); };
  App.actions['flt-csv'] = () => App.exporter.shiftsCsv(filtered(), 'shifts-filtered.csv');
  App.actions['rep-csv'] = () => {
    const r = rangeFor(st.type, st.anchor);
    const list = [...App.model.results.values()].filter((x) => x.dateKey >= r.from && x.dateKey <= r.to).sort((a, b) => a.start - b.start);
    App.exporter.shiftsCsv(list, `shifts-${r.from}_${r.to}.csv`);
  };
  App.actions['rep-pdf'] = () => { const r = rangeFor(st.type, st.anchor); App.exporter.printReport(r.from, r.to, r.label); };
  App.actions['rep-share-img'] = () => { const { r, t, p } = App.summaryData(st.type, st.anchor); App.exporter.summaryImage(r, t, p); };
})(typeof window !== 'undefined' ? window : globalThis);
