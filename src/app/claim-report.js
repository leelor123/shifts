/* ============================================================
 * claim-report.js — "something is not right with my pay": one document that gathers everything for a talk
 * with the employer, an accountant, a workers' organisation or a lawyer, and a letter to send.
 *
 * For a period (the last pay period, three months, a year): what the payslips were checked against and what
 * was missing (Payslip.analyze, the gaps still open), the rights that look unpaid (holiday pay, the minimum
 * wage, travel), the law's terms in one line each, and every shift with its hours and the pay the law gives
 * for it. Printed to PDF from the phone (the print window, as the reports screen does); the letter is copied
 * or shared. Nothing is sent anywhere by the app.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U, Engine } = root;
  const S = Store.S;
  const { icon, esc } = UI;

  const LAWS = [
    ['חוק שעות עבודה ומנוחה', 'שעות נוספות (125%, 150%), עבודה במנוחה השבועית ובחגים (150% לפחות), הפסקות.'],
    ['חוק שכר מינימום', 'שכר המינימום לשעה, ולנוער לפי הגיל. אי אפשר לוותר עליו.'],
    ['צו הרחבה (הסכם מסגרת 2000)', 'דמי חגים: 9 ימי חג בשנה לעובד/ת בשכר שעתי, אחרי 3 חודשי עבודה.'],
    ['צו הרחבה בדבר השתתפות המעסיק בהוצאות נסיעה', 'החזר נסיעות לעבודה ובחזרה, עד התקרה היומית.'],
    ['חוק הגנת השכר', 'תלוש שכר מפורט, ותשלום השכר עד ה-9 בחודש שאחרי.'],
    ['חוק חופשה שנתית, חוק דמי מחלה, צו הרחבה בדבר דמי הבראה', 'ימי חופשה, ימי מחלה ודמי הבראה לפי הוותק והיקף המשרה.'],
  ];

  // what was found in the period: the payslips' findings, the rights that look unpaid, the shifts
  function gather(from, to) {
    const today = U.todayKey();
    const slips = S.payslips.filter((p) => p.period && p.period >= from.slice(0, 7) && p.period <= to.slice(0, 7)).sort((a, b) => a.period.localeCompare(b.period));
    const findings = [];
    for (const slip of slips) {
      let a = null;
      try { a = root.Payslip.analyze(slip, App.model); } catch (e) { console.warn('claim', e); }
      if (!a) continue;
      for (const f of a.findings) if (f.status === 'bad' || (f.status === 'warn' && f.amount > 0)) findings.push(Object.assign({ period: slip.period }, f));
    }
    const gaps = S.gaps.filter((g) => g.status !== 'resolved' && g.period >= from.slice(0, 7) && g.period <= to.slice(0, 7));
    const holidays = Engine.holidayPay ? Engine.holidayPay(App.model, from, to, today).filter((h) => h.status === 'due') : [];
    const mw = Engine.minWageFor(S.settings, today);
    const lowRoles = App.roles().filter((r) => { const rate = Engine.roleRate(r, today); return rate > 0 && rate + 0.005 < mw.hourly; });
    const shifts = [...App.model.results.values()].filter((r) => r.status === 'done' && r.dateKey >= from && r.dateKey <= to).sort((a, b) => a.start - b.start);
    const sum = Engine.rangeSummary(App.model, from, to);
    return { from, to, slips, findings, gaps, holidays, mw, lowRoles, shifts, sum };
  }
  const total = (d) => d.findings.filter((f) => f.status === 'bad').reduce((a, f) => a + Math.max(0, f.amount || 0), 0) + d.holidays.reduce((a, h) => a + h.amount, 0);

  /** The letter (first person, polite), from what was found. */
  function letter(d) {
    const items = [];
    for (const f of d.findings.filter((x) => x.status === 'bad')) items.push(`${U.fmtMonth(f.period)}: ${f.title}${f.amount > 0 ? ` (הפרש משוער ${U.money(f.amount)})` : ''}.`);
    for (const h of d.holidays) items.push(`דמי חג על ${h.name} (${U.fmtDate(h.key, 'short')}): לפי ממוצע השעות שלי, כ-${U.money(h.amount)}.`);
    for (const r of d.lowRoles) items.push(`התעריף ב${r.name} (${U.money(Engine.roleRate(r, U.todayKey()))} לשעה) נמוך משכר המינימום (${U.money(d.mw.hourly)}).`);
    if (!items.length) return '';
    const name = S.settings.userName || '';
    const t = total(d);
    return `שלום,\n\nבדקתי את השכר שלי לתקופה ${U.fmtDate(d.from)} עד ${U.fmtDate(d.to)} מול רישום המשמרות שלי ומול הזכויות לפי החוק, ויש כמה דברים שאשמח שנבדוק יחד:\n\n${items.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n${t > 0 ? `\nסה״כ הפרש משוער: ${U.money(t)}.\n` : ''}\nמצורף דוח מפורט עם כל המשמרות והחישוב. אשמח שתבדקו ותעדכנו אותי, ואם צריך, שיתוקן בתלוש הבא. אם פספסתי משהו, אשמח להסבר.\n\nתודה רבה,\n${name}`.trim();
  }

  /** The printable report (#print-root, then the print window: "save as PDF"). */
  function print(d) {
    const emp = S.employers[0] || {};
    const sum = d.sum;
    const t = total(d);
    const el = document.getElementById('print-root');
    const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    el.innerHTML = `<div dir="rtl" class="claim">
      <h1>דוח לבירור שכר וזכויות</h1>
      <div>${esc(S.settings.userName || '')}${emp.name ? ' · ' + esc(emp.name) : ''} · ${U.fmtDate(d.from)} – ${U.fmtDate(d.to)} · הופק ${U.fmtDate(U.todayKey())}</div><br>
      <span class="kp">משמרות: <b>${sum.shifts}</b></span><span class="kp">שעות: <b>${U.hours(sum.hours)}</b></span><span class="kp">שכר לפי החוק (ברוטו): <b>${U.money(sum.gross)}</b></span>${t > 0 ? `<span class="kp">הפרש משוער: <b>${U.money(t)}</b></span>` : ''}
      <h3>מה נמצא</h3>
      ${d.findings.length || d.holidays.length || d.lowRoles.length ? `<table><tr><th>תקופה</th><th>נושא</th><th>פירוט</th><th>הפרש משוער</th></tr>
        ${d.findings.map((f) => row([U.fmtMonth(f.period), esc(f.title), esc(f.detail || ''), f.amount > 0 ? U.money(f.amount) : '—'])).join('')}
        ${d.holidays.map((h) => row([U.fmtDate(h.key, 'short'), 'דמי חג: ' + esc(h.name), `לא היה יום עבודה בגלל החג. ממוצע ${U.num(h.avgHours, 1)} שעות ביום × ${U.money(h.rate)} (3 חודשים לפני החג)`, U.money(h.amount)])).join('')}
        ${d.lowRoles.map((r) => row(['היום', 'שכר מינימום: ' + esc(r.name), `${U.money(Engine.roleRate(r, U.todayKey()))} לשעה, המינימום ${U.money(d.mw.hourly)}`, '—'])).join('')}</table>`
        : '<div>לא נמצאו פערים בתלושים שהוזנו או זכויות שנראות חסרות לתקופה הזאת.</div>'}
      ${d.slips.length ? `<div style="font-size:9pt">תלושים שנבדקו: ${d.slips.map((p) => U.fmtMonth(p.period)).join(', ')}.</div>` : '<div style="font-size:9pt">לא הוזנו תלושים לתקופה הזאת. בדיקת תלוש (בהוספה +) משווה כל תלוש לרישום המשמרות.</div>'}
      <h3>לפי סוג שעה</h3><table><tr><th>רגילות</th><th>125%</th><th>150%</th><th>שבת/חג</th><th>שבת/חג + נוספות</th><th>לילה</th></tr>${row([U.hours(sum.hoursBy.regular), U.hours(sum.hoursBy.ot1), U.hours(sum.hoursBy.ot2), U.hours(sum.hoursBy.rest), U.hours(sum.hoursBy.restOt1 + sum.hoursBy.restOt2), U.hours(sum.hoursBy.night)])}</table>
      <h3>המשמרות</h3><table><tr><th>תאריך</th><th>תפקיד</th><th>שעות</th><th>זמן</th><th>נוספות</th><th>שבת/חג</th><th>שכר לפי החוק</th></tr>
        ${d.shifts.map((r) => row([`${U.fmtDate(r.dateKey, 'short')} ${U.DAYS_SHORT[U.dow(r.dateKey)]}`, esc([...new Set(r.segments.map((s) => App.roleName(s.roleId)))].join(' → ')), `⁦${U.epochHM(r.start)}–${U.epochHM(r.end)}⁩`, U.hours(r.paidHours), r.otHours ? U.hours(r.otHours) : '', r.restHours ? U.hours(r.restHours) : '', U.money(r.wage)])).join('')}</table>
      <h3>על מה זה נשען</h3><table>${LAWS.map(([a, b]) => row([`<b>${a}</b>`, b])).join('')}</table>
      <div style="font-size:8pt;color:#555;margin-top:10pt">חושב באפליקציית Shaati לפי המשמרות והתלושים שהוזנו בה, וההגדרות (תעריף, שעות נוספות, שבת וחגים לפי ${esc((S.settings.rest && S.settings.rest.city) || 'העיר שנבחרה')}). זה כלי עזר ואינו ייעוץ משפטי: הסכם קיבוצי, צו הרחבה ענפי או החוזה שלך יכולים לקבוע אחרת. מומלץ לצרף את התלושים ודוחות הנוכחות. מידע נוסף: kolzchut.org.il</div>
    </div>`;
    UI.toast('בחלון ההדפסה בחר "שמור כ-⁠PDF"');
    setTimeout(() => window.print(), 300);
  }

  /* ---------------- the screen ---------------- */
  App.actions['claim-report'] = () => { if (UI.sheets.length) { UI.closeAll(); setTimeout(() => App.claimReport(), 320); } else App.claimReport(); };
  App.claimReport = function () {
    if (UI.sheets.length) UI.closeAll();
    const P = Engine.periodOf(U.todayKey(), S.employers[0]);
    const lastP = Engine.periodOf(U.addDays(P.from, -1), S.employers[0]);
    const today = U.todayKey();
    const RANGES = [
      ['last', 'התקופה הקודמת', lastP.from, lastP.to],
      ['q', '3 חודשים', U.addMonths(today, -3), today],
      ['y', 'שנה', U.addMonths(today, -12), today],
    ];
    let pick = 'q';
    let d = null;
    const entry = UI.openSheet({
      title: 'דוח לבירור שכר וזכויות', full: true, cls: 'claim-sheet',
      body: '<div id="cl"></div>',
      foot: `<button class="btn tonal" data-cl-letter>${icon('chat', 's')} מכתב למעסיק</button><button class="btn" data-cl-pdf>${icon('file', 's')} הפקת PDF</button>`,
    });
    const box = entry.sh.querySelector('#cl');
    function draw() {
      const r = RANGES.find((x) => x[0] === pick);
      d = gather(r[2], r[3]);
      const t = total(d);
      const n = d.findings.filter((f) => f.status === 'bad').length + d.holidays.length + d.lowRoles.length;
      box.innerHTML = `${App.mascotSays ? App.mascotSays(n ? 'think' : 'happy', n ? `מצאתי ${n === 1 ? 'דבר אחד' : `${n} דברים`} שכדאי לבדוק עם המעסיק${t > 0 ? `, בסך כ-${U.money(t, 0)}` : ''}.` : 'לא מצאתי פערים לתקופה הזאת. אפשר עדיין להפיק דוח מסודר של המשמרות והשכר.', { size: 64 }) : ''}
        <div class="field"><span class="lbl">לאיזו תקופה?</span><div class="chips">${RANGES.map(([k, l, a, b]) => `<button class="chip ${pick === k ? 'on' : ''}" data-cl-range="${k}" aria-pressed="${pick === k}">${l}</button>`).join('')}</div></div>
        <div class="card cl-what">
          <div class="rt-row"><span class="rt-mark">${icon('receipt', 's')}</span><div><div class="t">${d.slips.length ? `${d.slips.length === 1 ? 'תלוש אחד נבדק' : `${d.slips.length} תלושים נבדקו`}` : 'לא הוזנו תלושים לתקופה'}</div><div class="d">${d.findings.length ? `${d.findings.length === 1 ? 'ממצא אחד' : `${d.findings.length} ממצאים`} מהבדיקה` : d.slips.length ? 'לא נמצאו פערים בתלושים' : 'בדיקת תלוש (בהוספה +) מוסיפה את ההשוואה לדוח'}</div></div></div>
          <div class="rt-row"><span class="rt-mark">${icon('calendar', 's')}</span><div><div class="t">דמי חגים</div><div class="d">${d.holidays.length ? `כ-${U.money(d.holidays.reduce((a, h) => a + h.amount, 0), 0)} על ${d.holidays.length === 1 ? 'יום חג אחד' : `${d.holidays.length} ימי חג`}` : 'לא נראה שחסר'}</div></div></div>
          <div class="rt-row"><span class="rt-mark">${icon('wallet', 's')}</span><div><div class="t">שכר מינימום</div><div class="d">${d.lowRoles.length ? d.lowRoles.map((r) => esc(r.name)).join(', ') + ': נמוך מהמינימום' : 'התעריפים מעל המינימום'}</div></div></div>
          <div class="rt-row"><span class="rt-mark">${icon('clock', 's')}</span><div><div class="t">${d.sum.shifts} משמרות · ${U.hours(d.sum.hours)} שעות</div><div class="d">כל משמרת עם השעות והשכר לפי החוק</div></div></div>
        </div>
        <div class="tiny muted">${icon('shield', 's')} הדוח נוצר בטלפון. הוא כלי עזר ולא ייעוץ משפטי; הסכם קיבוצי או צו הרחבה ענפי יכולים לקבוע אחרת.</div>`;
    }
    entry.sh.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.clRange) { pick = b.dataset.clRange; if (root.Fx) root.Fx.play('on'); draw(); }
      else if (b.hasAttribute('data-cl-pdf')) print(d);
      else if (b.hasAttribute('data-cl-letter')) {
        const text = letter(d);
        if (!text) { UI.toast('לא נמצא מה לבקש לתקופה הזאת'); return; }
        UI.openSheet({
          title: 'מכתב למעסיק', cls: 'claim-letter',
          body: `<div class="small muted" style="margin-bottom:8px">אפשר לערוך לפני ששולחים. כדאי לצרף את הדוח (PDF).</div><textarea class="input" id="cl-text" rows="14">${esc(text)}</textarea>`,
          foot: `<button class="btn tonal" data-cl-copy>${icon('copy', 's')} העתקה</button><button class="btn" data-cl-share>${icon('share', 's')} שיתוף</button>`,
          onMount: (el) => el.addEventListener('click', async (ev) => {
            const x = ev.target.closest('button');
            if (!x) return;
            const v = el.querySelector('#cl-text').value;
            if (x.hasAttribute('data-cl-copy')) { try { await navigator.clipboard.writeText(v); UI.toast('הועתק ✓'); } catch (err) { el.querySelector('#cl-text').select(); UI.toast('מסמנים ומעתיקים'); } }
            if (x.hasAttribute('data-cl-share')) { if (navigator.share) navigator.share({ text: v }).catch(() => {}); else { try { await navigator.clipboard.writeText(v); UI.toast('הועתק ✓'); } catch (err) { /* ignore */ } } }
          }),
        });
      }
    });
    draw();
  };
  App.claimData = gather; // tests
  App.claimLetter = (from, to) => letter(gather(from, to));
})(typeof window !== 'undefined' ? window : globalThis);
