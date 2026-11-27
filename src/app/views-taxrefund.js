/* ============================================================
 * views-taxrefund.js — the tax refund: was too much income tax taken, year by year (six years back), and how to
 * get it back. A few questions about the user (gender, birth date, army or national service, a first degree) and,
 * for any year, the numbers of Form 106 for an exact answer; the estimate itself is core/taxrefund.js. The
 * estimate and the way to file are free; the full report (PDF) is part of Shaati Plus where Plus is sold.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Store, UI, App } = root;
  const TR = root.TaxRefund;
  const S = Store.S;
  const { icon, esc } = UI;
  const pad = (n) => String(n).padStart(2, '0');

  const profile = () => {
    const P = S.settings.taxProfile || {};
    return { gender: S.settings.gender, birthDate: S.settings.birthDate, service: P.service || {}, degree: P.degree || {}, employers: S.employers.length };
  };
  const f106 = (y) => ((S.settings.taxProfile || {}).y106 || {})[y] || null;

  /** One year's months with income: every payslip of the month, and the shifts of a job with none (core/taxrefund.js). */
  const monthsOf = (year) => TR.monthsOf(year, { payslips: S.payslips, employers: S.employers, model: App.model, settings: S.settings });
  /** The estimate of one year (null: no income known that year). */
  App.taxRefundYear = function (year) {
    const { months, minorTaxed } = monthsOf(year);
    const f = f106(year);
    if (!months.length && !(f && +f.gross > 0)) return null;
    return TR.estimate(year, months, Object.assign(profile(), { minorTaxed }), S.settings.tax, f);
  };
  /** Every year that can still be asked for, with an estimate. */
  App.taxRefundAll = () => TR.years(U.todayKey()).map((y) => ({ y, r: App.taxRefundYear(y) })).filter((x) => x.r);

  const REASON = {
    partYear: 'עבדת רק חלק מהשנה: המס נלקח כל חודש כאילו תעבוד כך כל השנה, אבל נקודות הזיכוי שלך שוות שנה שלמה.',
    points: 'מגיעות לך נקודות זיכוי נוספות (נוער עובד, שחרור משירות או תואר). אם לא מסרת עליהן למעסיק בטופס 101, הן לא נוכו מהמס.',
    minor: 'נוכה ממך מס הכנסה כשהיית מתחת לגיל 18. בשכר של נוער כמעט תמיד אין חבות מס, והכול חוזר.',
    twoJobs: 'עבדת אצל יותר ממעסיק אחד: במשרה הנוספת המס נלקח בשיעור גבוה אם לא עשית תיאום מס.',
  };
  const SRC = { slips: 'לפי התלושים שלך', mixed: 'לפי התלושים והמשמרות', shifts: 'הערכה לפי המשמרות', '106': 'לפי טופס 106' };

  /** Payslips whose income tax is not known are left out of the tax taken: said under the numbers. */
  const unknownNote = (r) => (r.taxUnknown ? `<div class="tiny muted">${r.taxUnknown === 1 ? 'בתלוש אחד לא ידוע כמה מס הכנסה נוכה, והוא לא נספר כאן.' : `ב-${r.taxUnknown} תלושים לא ידוע כמה מס הכנסה נוכה, והם לא נספרו כאן.`} אם נוכה בהם מס, ההחזר גדול יותר. אפשר להשלים את המספר בתלוש.</div>` : '');
  function yearCard(x, cur) {
    const r = x.r;
    const big = r.refund > 150;
    const open = cur === x.y;
    const f = f106(x.y) || {};
    const thisYear = x.y === +U.todayKey().slice(0, 4);
    const pts = [['woman', 'אישה'], ['youth', 'נוער עובד'], ['soldier', 'שחרור משירות'], ['degree', 'תואר']]
      .filter(([k]) => r.pointParts[k] > 0).map(([k, l]) => `${l} ${U.num(r.pointParts[k] / 12, 2)}`).join(' · ');
    return `<details class="tr-year card${big ? ' good' : ''}" data-tr-year="${x.y}"${open ? ' open' : ''}>
      <summary><b class="tr-y">${x.y}${thisYear ? ' <small>(עד עכשיו)</small>' : ''}</b>
        <span class="tr-sum">${big ? `<b class="money">${U.money(r.refund, 0)}</b><small>ייתכן שמגיע לך</small>` : r.refund < -150 ? `<small>נוכה פחות מהחבות (כ-<span class="money">${U.money(-r.refund, 0)}</span>)</small>` : '<small>אין החזר משמעותי</small>'}</span>${icon('left', 's')}</summary>
      <div class="tr-body">
        <div class="tag ${r.src === '106' || r.src === 'slips' ? 'good' : ''}">${SRC[r.src]}</div>
        <div class="kv"><span>הכנסה ברוטו בשנה</span><b class="money">${U.money(r.gross, 0)}</b></div>
        <div class="kv"><span>מס הכנסה שנלקח</span><b class="money">${U.money(r.withheld, 0)}</b></div>
        <div class="kv"><span>המס לפי השנה כולה</span><b class="money">${U.money(r.liability, 0)}</b></div>
        <div class="kv"><span>נקודות זיכוי (ממוצע לחודש)</span><b>${U.num(r.points, 2)}</b></div>
        ${pts ? `<div class="tiny muted">מתוכן: ${esc(pts)} · שווי נקודה ב-${x.y}: <span class="money">${U.money(r.pointValue, 0)}</span> לחודש</div>` : `<div class="tiny muted">שווי נקודה ב-${x.y}: <span class="money">${U.money(r.pointValue, 0)}</span> לחודש</div>`}
        ${(r.reasons.length ? `<ul class="tr-why">${r.reasons.map((k) => `<li>${REASON[k]}</li>`).join('')}</ul>` : '') + unknownNote(r)}
        ${thisYear ? '<div class="small muted">על השנה הזו אפשר לבקש החזר רק אחרי שהיא נגמרת.</div>' : ''}
        <div class="tr-106">
          <div class="small"><b>יש לך טופס 106 לשנה הזו?</b> הקלדת שלושה מספרים ממנו הופכת את ההערכה למדויקת יותר (סכום כל המעסיקים).</div>
          <div class="tr-in">
            <label><span>ברוטו שנתי ₪</span><input class="input" type="number" inputmode="decimal" step="any" data-tr106="${x.y}.gross" value="${esc(f.gross || '')}"></label>
            <label><span>מס שנוכה ₪</span><input class="input" type="number" inputmode="decimal" step="any" data-tr106="${x.y}.tax" value="${esc(f.tax || '')}"></label>
            <label><span>הפקדת עובד לפנסיה ₪</span><input class="input" type="number" inputmode="decimal" step="any" data-tr106="${x.y}.pension" value="${esc(f.pension || '')}"></label>
          </div>
        </div>
      </div>
    </details>`;
  }

  function body(cur) {
    const P = S.settings.taxProfile || {};
    const sv = P.service || {}, dg = P.degree || {};
    const all = App.taxRefundAll();
    const past = all.filter((x) => x.y < +U.todayKey().slice(0, 4));
    const total = past.reduce((s, x) => s + Math.max(0, x.r.refund > 150 ? x.r.refund : 0), 0);
    const askGender = !S.settings.gender, askBirth = !S.settings.birthDate;
    return `
      <div class="tr-hero card${total > 0 ? ' good' : ''}">
        ${total > 0 ? `<div class="small">ייתכן שמגיע לך בסך הכול</div><div class="tr-total money">${U.money(total, 0)}</div><div class="small">החזר מס על ${past.filter((x) => x.r.refund > 150).map((x) => x.y).join(', ')}</div>`
          : `<div class="tr-total-none">${all.length ? 'לפי מה שידוע כרגע, לא נראה שנלקח ממך יותר מדי מס' : 'עוד אין כאן הכנסה לחשב לפיה'}</div>`}
        <div class="tiny muted">מס הכנסה נלקח כל חודש כאילו תעבוד כך כל השנה. בשנה עם חודשים בלי עבודה, אחרי שחרור משירות או אחרי תואר, לרוב נלקח יותר מדי, ואפשר לקבל אותו בחזרה עד 6 שנים אחורה.</div>
      </div>
      <div class="section-title">${icon('smile', 's')} עליך (בשביל נקודות הזיכוי)</div>
      <div class="card tr-me">
        ${askGender ? `<div class="field"><span class="lbl">מגדר</span><div class="chips"><button class="chip" data-tr-gender="m">זכר</button><button class="chip" data-tr-gender="f">נקבה</button></div></div>` : ''}
        ${askBirth ? `<label class="field"><span class="lbl">תאריך לידה</span><input class="input" type="date" data-tr-birth max="${U.todayKey()}"></label>` : ''}
        <label class="field"><span class="lbl">שירות צבאי או לאומי</span><select class="input" data-tr="service.kind">
          <option value=""${!sv.kind ? ' selected' : ''}>לא שירתתי / לא רלוונטי</option>
          <option value="army"${sv.kind === 'army' ? ' selected' : ''}>שירות צבאי (חובה)</option>
          <option value="national"${sv.kind === 'national' ? ' selected' : ''}>שירות לאומי או אזרחי</option></select></label>
        ${sv.kind ? `<div class="tr-pair">
          <label class="field"><span class="lbl">כמה חודשים שירתת</span><input class="input" type="number" inputmode="numeric" min="0" max="48" data-tr="service.months" value="${esc(sv.months || '')}"></label>
          <label class="field"><span class="lbl">חודש השחרור</span><input class="input" type="month" data-tr="service.end" value="${esc(sv.end || '')}" max="${U.todayKey().slice(0, 7)}"></label></div>` : ''}
        <div class="tr-pair">
          <label class="field"><span class="lbl">שנת סיום תואר ראשון</span><input class="input" type="number" inputmode="numeric" min="2000" max="${U.todayKey().slice(0, 4)}" placeholder="אין" data-tr="degree.year" value="${esc(dg.year || '')}"></label>
          ${+dg.year >= 2023 ? `<label class="field"><span class="lbl">כמה שנים למדת</span><input class="input" type="number" inputmode="numeric" min="1" max="5" data-tr="degree.studyYears" value="${esc(dg.studyYears || 3)}"></label>` : ''}
        </div>
        <div class="tiny muted">לא נכללים כאן: מגורים ביישוב מוטב, ילדים, עולה חדש, הורה יחיד, נכות, תרומות ועוד. אם אחד מהם נוגע לך, ההחזר יכול להיות גדול יותר: <a href="${TR.SIMULATOR_URL}" target="_blank" rel="noopener">הבדיקה של רשות המסים ↗</a></div>
      </div>
      <div class="section-title">${icon('calendar', 's')} לפי שנים</div>
      ${all.length ? all.map((x) => yearCard(x, cur)).join('') : '<div class="card small muted">כשיהיו כאן משמרות או תלושים, תופיע הערכה לכל שנה.</div>'}
      <div class="section-title">${icon('check', 's')} איך מקבלים את הכסף</div>
      <ol class="card tr-steps">
        <li><b>לבקש טופס 106</b> מכל מעסיק, לכל שנה. המעסיק חייב לתת אותו עד סוף מרץ של השנה שאחרי.</li>
        <li><b>להכין אישורים</b> לנקודות הזיכוי (תעודת שחרור, אישור זכאות לתואר) ופרטי חשבון בנק.</li>
        <li><b>להגיש באינטרנט</b> בקשה להחזר מס (טופס 135) באתר רשות המסים, בקשה אחת לכל שנה: <a href="${TR.FILE_URL}" target="_blank" rel="noopener">להגשה ↗</a></li>
        <li><b>ההחזר מגיע לחשבון הבנק</b> עם הפרשי הצמדה וריבית, לרוב תוך כמה חודשים. אפשר לבקש עד 6 שנים אחורה.</li>
      </ol>
      <div class="disclaimer tr-caveat">${icon('alert', 's')}<div><b>לפני שמגישים:</b> הבקשה פותחת את כל השנה לבדיקה של רשות המסים, עם כל ההכנסות שלך, גם אלה ששעתי לא מכירה (עבודה נוספת, עסק, קצבה, שכר דירה). אם היו כאלה, ההחזר יכול לצאת קטן יותר, ולפעמים מתברר שצריך לשלם. בדיקה קודם <a href="${TR.SIMULATOR_URL}" target="_blank" rel="noopener">בסימולטור של רשות המסים ↗</a> מראה את התוצאה עם כל ההכנסות.</div></div>
      <button class="btn tonal block" data-tr-report>${icon('file', 's')} דוח החזר מס מלא (PDF)</button>
      <div class="disclaimer">${icon('info', 's')}<div>זו הערכה בלבד ואינה ייעוץ מס. החישוב לפי מדרגות המס ונקודות הזיכוי של כל שנה, והקובע הוא החישוב של רשות המסים.</div></div>`;
  }

  /** The full report: every year, the numbers, the reasons, what to attach and where to file — to keep or print. */
  function report() {
    const all = App.taxRefundAll().filter((x) => x.y < +U.todayKey().slice(0, 4));
    const rows = all.map(({ y, r }) => `<tr><td>${y}</td><td>${U.money(r.gross, 0)}</td><td>${U.money(r.withheld, 0)}</td><td>${U.money(r.liability, 0)}</td><td><b>${U.money(Math.max(0, r.refund), 0)}</b></td><td>${SRC[r.src]}</td></tr>`).join('');
    const total = all.reduce((s, x) => s + Math.max(0, x.r.refund), 0);
    const name = esc(S.settings.userName || '');
    return `<h1>החזר מס (הערכה)${name ? ' · ' + name : ''}</h1>
      <p>הופק ב-${U.fmtDate(U.todayKey())} באפליקציית שעתי. סך הכול ייתכן שמגיע: <b>${U.money(total, 0)}</b>.</p>
      <table><thead><tr><th>שנה</th><th>ברוטו</th><th>מס שנלקח</th><th>מס לפי השנה</th><th>החזר משוער</th><th>מקור</th></tr></thead><tbody>${rows}</tbody></table>
      ${all.filter((x) => x.r.reasons.length).map(({ y, r }) => `<h3>${y}: למה</h3><ul>${r.reasons.map((k) => `<li>${REASON[k]}</li>`).join('')}</ul>`).join('')}
      <h3>מה לצרף לבקשה</h3><ul><li>טופס 106 מכל מעסיק, לכל שנה</li><li>אישורים לנקודות הזיכוי (תעודת שחרור, אישור תואר)</li><li>פרטי חשבון בנק</li></ul>
      <h3>איפה מגישים</h3><p>בקשה להחזר מס (טופס 135), באתר רשות המסים: ${TR.FILE_URL}. בקשה לכל שנה בנפרד, עד 6 שנים אחורה.</p>
      <p><b>לפני שמגישים:</b> הבקשה פותחת את כל השנה לבדיקה של רשות המסים, עם כל ההכנסות שלך, גם אלה ששעתי לא מכירה (עבודה נוספת, עסק, קצבה, שכר דירה). אם היו כאלה, ההחזר יכול לצאת קטן יותר, ולפעמים מתברר שצריך לשלם. בדיקה קודם בסימולטור של רשות המסים (${TR.SIMULATOR_URL}) מראה את התוצאה עם כל ההכנסות.</p>
      <p style="font-size:.75rem">זו הערכה בלבד ואינה ייעוץ מס. הקובע הוא החישוב של רשות המסים.</p>`;
  }

  App.actions['tax-refund'] = (el) => {
    if (!S.meta.usedTaxRefund) Store.setMeta({ usedTaxRefund: true }).catch(() => {}); // for the anonymous statistics (yes/no)
    let sheetEl = null;
    const cur0 = el && el.dataset && +el.dataset.year;
    const redraw = (cur) => { const b = sheetEl.querySelector('.sh-body'); root.Dom.patch(b, body(cur)); };
    const openYear = () => { const d = sheetEl.querySelector('.tr-year[open]'); return d ? +d.dataset.trYear : 0; };
    const setProfile = async (fn) => { await Store.setSettings((s) => { s.taxProfile = Object.assign({ service: {}, degree: {}, y106: {} }, s.taxProfile); fn(s.taxProfile, s); }); redraw(openYear()); };
    UI.openSheet({
      title: 'החזר מס', full: true, cls: 'tr-sheet', body: body(cur0 || 0),
      onMount: (sh) => {
        sheetEl = sh;
        sh.addEventListener('change', async (e) => {
          const t = e.target;
          if (t.dataset.tr) {
            const [a, b] = t.dataset.tr.split('.');
            const v = t.type === 'number' ? (t.value === '' ? '' : +t.value) : t.value;
            await setProfile((P) => { P[a] = Object.assign({}, P[a], { [b]: v }); });
          } else if (t.dataset.tr106) {
            const [y, k] = t.dataset.tr106.split('.');
            await setProfile((P) => { const row = Object.assign({}, (P.y106 || {})[y], { [k]: t.value === '' ? '' : +t.value }); P.y106 = Object.assign({}, P.y106, { [y]: row }); });
          } else if (t.matches('[data-tr-birth]') && t.value) {
            await setProfile((P, s) => { s.birthDate = t.value; });
          }
        });
        sh.addEventListener('click', async (e) => {
          const g = e.target.closest('[data-tr-gender]');
          if (g) { await setProfile((P, s) => { if (s.tax) s.tax.creditPoints = Engine.creditPointsForGender(s.tax.creditPoints, s.gender || '', g.dataset.trGender); s.gender = g.dataset.trGender; }); return; }
          if (e.target.closest('[data-tr-report]')) {
            // the full report is part of Plus where Plus is sold, and also sold on its own, once (the estimate and
            // the way to file stay free)
            const print = () => { if (App.exporter && App.exporter.printHtml) App.exporter.printHtml(report(), 'tax-refund.pdf'); };
            if (root.Plus && root.Plus.reportSheet) root.Plus.reportSheet('tax', print); else print();
          }
        });
      },
    });
  };

  /** An alert once a past year looks like it holds a refund worth asking for: one per year, its amount kept current
   *  (App.runInsights updates the title in place, never sends it again). */
  App.taxRefundAlert = function () {
    try {
      const y = +U.todayKey().slice(0, 4);
      const best = App.taxRefundAll().filter((x) => x.y < y && x.r.refund > 300).sort((a, b) => b.r.refund - a.r.refund)[0];
      if (!best) return null;
      return {
        key: 'taxrefund-' + best.y, type: 'taxrefund', cat: 'money', severity: 'good', push: 'anomaly', data: { year: best.y },
        title: `ייתכן שמגיע לך החזר מס של כ-${U.money(best.r.refund, 0)} על ${best.y}`,
        body: 'לפי ההכנסה ונקודות הזיכוי שלך. לחצו לפרטים ואיך מגישים.',
      };
    } catch (e) { return null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
