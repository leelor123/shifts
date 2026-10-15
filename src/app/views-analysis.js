/* ============================================================
 * views-analysis.js — "ניתוח מתקדם": what pays best, from the past
 * year's shifts (the numbers come from core/analysis.js).
 *
 * With Shaati Plus as many times as wanted; without it, a few times a
 * month (plus.js, the "analysis" allowance), and only once Plus can be
 * bought on this phone. Opening it without enough shifts costs nothing.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, UI, App, Store } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const money = (v) => U.money(v, 0);
  const COLORS = ['#7c5cff', '#2a78d6', '#1baf7a', '#eda100', '#eb6834', '#d6409f', '#4a3aa7'];

  function body(a) {
    const bars = (rows, best) => (root.Charts ? root.Charts.hbars(rows.map((x, i) => ({
      name: x.name, value: x.perHour, color: best && x.name === best.name ? '#1baf7a' : COLORS[i % COLORS.length] + '99',
      text: U.money(x.perHour),
    })), null) : '');
    const t = a.trend;
    const m = (mk) => U.HEB_MONTHS[+mk.slice(5, 7) - 1];
    return `
      <div class="card an-sum"><div class="kpis">
        <div class="kpi"><div class="l">ממוצע לשעה</div><div class="v">${U.money(a.avgHour)}</div><div class="d">${a.count} משמרות בשנה האחרונה</div></div>
        <div class="kpi"><div class="l">משמרת ממוצעת</div><div class="v">${money(a.avgShift.wage)}</div><div class="d">${U.hm(a.avgShift.hours * 60)} שעות</div></div>
      </div></div>
      ${a.bestDay ? `<div class="section-title">${icon('calendar', 's')} איזה יום הכי משתלם</div>
        <div class="card"><div class="an-lead">ימי <b>${esc(a.bestDay.name)}</b> משתלמים לך הכי הרבה: <b>${U.money(a.bestDay.perHour)}</b> לשעה בממוצע (${a.bestDay.n} משמרות).</div>${bars(a.days.filter((x) => x.n), a.bestDay)}
        <div class="tiny muted">ממוצע לשעה, עם תוספות שבת, חג ושעות נוספות (בלי נסיעות ובונוסים)</div></div>` : ''}
      ${a.bestSlot ? `<div class="section-title">${icon('clock', 's')} איזו שעה הכי משתלמת</div>
        <div class="card"><div class="an-lead">משמרות <b>${esc(a.bestSlot.name)}</b> מכניסות הכי הרבה לשעה: <b>${U.money(a.bestSlot.perHour)}</b>.</div>${bars(a.slots.filter((x) => x.n), a.bestSlot)}</div>` : ''}
      <div class="section-title">${icon('chart', 's')} השכר האמיתי לשעה</div>
      <div class="card"><div class="an-months">${a.months.map((x) => { const max = Math.max(...a.months.map((y) => y.perHour), 1); return `<div class="an-m"><span class="an-mv">${x.n ? Math.round(x.perHour) : ''}</span><span class="an-mb"><i style="height:${x.n ? Math.max(6, (x.perHour / max) * 100) : 0}%"></i></span><span class="an-ml">${esc(m(x.mk))}</span></div>`; }).join('')}</div>
        ${t ? `<div class="an-lead">${t.diff > 0.5 ? `ב${esc(m(t.mk))} הרווחת <b>${U.money(t.diff)} יותר לשעה</b> מהממוצע של החודשים הקודמים 📈` : t.diff < -0.5 ? `ב${esc(m(t.mk))} השכר לשעה ירד ב-<b>${U.money(-t.diff)}</b> לעומת הממוצע. כדאי לבדוק אם חסרות תוספות.` : `השכר לשעה יציב: בערך ${U.money(t.perHour)}.`}</div>` : ''}</div>
      <div class="section-title">${icon('star', 's')} השיאים שלך</div>
      <div class="card an-rec">
        <div><span>המשמרת הכי רווחית</span><b>${money(a.bestShift.total)}</b><small>${esc(U.fmtDate(a.bestShift.dateKey, 'dm'))} · ${U.hm(a.bestShift.hours * 60)} שעות</small></div>
        <div><span>המשמרת הכי ארוכה</span><b>${U.hm(a.longest.hours * 60)}</b><small>${esc(U.fmtDate(a.longest.dateKey, 'dm'))}</small></div>
        ${a.bestMonth ? `<div><span>החודש הכי טוב</span><b>${money(a.bestMonth.wage)}</b><small>${esc(m(a.bestMonth.mk))}</small></div>` : ''}
        <div><span>תוספות שקיבלת</span><b>${money(a.premiums)}</b><small>${a.premiumShare}% מהשכר: שבתות, חגים, שעות נוספות ולילות</small></div>
      </div>
      <div class="section-title">${icon('bulb', 's')} מה אם…</div>
      <div class="card an-if">
        ${a.bestDay && a.whatIf.extraShift ? `<div>${icon('plus', 's')}<span>עוד משמרת אחת בשבוע ביום ${esc(a.bestDay.name)} = <b>בערך ${money(a.whatIf.extraShift)} יותר בחודש</b></span></div>` : ''}
        ${a.whatIf.raise2 ? `<div>${icon('chart', 's')}<span>העלאה של 2 ₪ לשעה = <b>בערך ${money(a.whatIf.raise2)} יותר בחודש</b>, על אותן שעות</span></div>` : ''}
        <div class="tiny muted">הערכה לפי השנה האחרונה שלך. לא כולל מסים.</div>
      </div>`;
  }

  /** Opens the analysis: the allowance is used only when there is something to show. */
  App.actions['analysis-open'] = function () {
    const a = root.Analysis.analyse(App.model.results.values(), U.todayKey());
    if (!a.enough) {
      UI.openSheet({ title: 'ניתוח מתקדם', cls: 'an-sheet', body: `<div class="empty fun">${App.mascot ? App.mascot('think', { size: 90 }) : ''}<h3>עוד קצת משמרות</h3><div>הניתוח צריך לפחות 3 משמרות שבוצעו בשנה האחרונה${a.count ? ` (יש ${a.count})` : ''}.</div></div>` });
      return;
    }
    if (root.Plus && !root.Plus.use('analysis')) return;
    const left = root.Plus ? root.Plus.left('analysis') : Infinity;
    UI.openSheet({
      title: 'ניתוח מתקדם ✨',
      full: true,
      cls: 'an-sheet',
      body: body(a) + (left !== Infinity ? `<div class="an-left tiny">${left ? `נשארו החודש ${left === 1 ? 'ניתוח אחד' : left + ' ניתוחים'} חינם` : 'זה היה הניתוח החינמי האחרון החודש'} · <button class="btn text sm" data-act="plus-open">בלי הגבלה עם Plus</button></div>` : ''),
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
