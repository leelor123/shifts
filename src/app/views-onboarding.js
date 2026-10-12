/* ============================================================
 * views-onboarding.js — first-run wizard and demo data.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, HebCal, Store, UI, App, Defaults } = root;
  const S = Store.S;
  const { icon, esc } = UI;

  /* ---------------- wizard ---------------- */
  App.sheetsApi.onboarding = function () {
    const nav = document.getElementById('nav');
    nav.style.display = 'none';
    App.blocking = 'onboarding';
    const emp = Store.clone(S.employers[0]);
    const st = Store.clone(S.settings);
    let roles = S.roles.length ? Store.clone(S.roles.filter((r) => !r.archived)) : Defaults.defaultRoles(emp.id);
    roles.forEach((r) => (r.rate = Engine.roleRate(r, U.todayKey())));
    if (!st.startDate) st.startDate = U.addMonths(U.todayKey(), -3);
    let step = 0;
    const STEPS = 7;
    const v = document.getElementById('view');

    const screens = [
      () => `<div style="text-align:center;padding-top:6vh"><div class="brand-mark big" aria-hidden="true"></div>
        <h1 class="brand-name">Shaati</h1><div class="brand-sub">מעקב משמרות ושכר</div><p class="lead">רישום משמרות בלחיצה, חישוב שכר מדויק (שבתות, חגים, שעות נוספות), תובנות, ובדיקת תלוש. הנתונים נשמרים בחשבון שלך, ורק לך יש גישה אליהם.</p>
        <p class="small muted">ההגדרה לוקחת כדקה. כל ערך אפשר לשנות אחר כך בהגדרות.</p></div>`,
      () => `<h1>התפקידים שלך</h1><p class="lead">לכל תפקיד שכר שעתי וצבע. העלאות שכר בעתיד מוסיפים מתאריך — בלי לשנות משמרות עבר.</p>
        ${roles.map((r, i) => `<div class="role-edit"><button class="sw" style="background:${r.color}" data-cc="${i}" aria-label="צבע"></button>
          <input class="input" data-rn="${i}" value="${esc(r.name)}" placeholder="שם התפקיד">
          <input class="input" type="number" step="any" inputmode="decimal" data-rr="${i}" value="${r.rate || ''}" placeholder="₪ לשעה">
          <button class="icon-btn" data-rx="${i}" aria-label="הסר">${icon('x')}</button></div>`).join('')}
        <button class="btn text" data-radd>${icon('plus', 's')} הוסף תפקיד</button>
        <div class="banner" style="margin-top:12px">${icon('info')}<div>ערכי ברירת מחדל: סדרן 40 ₪, מזנון 38 ₪, אחמ״ש 48 ₪. עדכן לתעריפים שלך.</div></div>`,
      () => `<h1>נסיעות</h1><p class="lead">החזר נסיעות לכל יום עבודה.</p>
        <label class="field"><span class="lbl">סכום ליום עבודה ₪</span><input class="input" type="number" step="any" inputmode="decimal" id="ob-travel" value="${emp.travelPerDay}"><span class="hint">ברירת מחדל 22.60 ₪ — התקרה לפי צו ההרחבה (2025).</span></label>
        <label class="field"><span class="lbl">תקרה חודשית ₪</span><input class="input" type="number" step="any" inputmode="decimal" id="ob-cap" value="${emp.travelMonthlyCap || ''}" placeholder="ללא תקרה"><span class="hint">למשל מחיר חופשי-חודשי. ריק = ללא תקרה.</span></label>
        <div class="tiny muted">משמרת מסוימת בלי נסיעות? אפשר לסמן בעריכת המשמרת.</div>`,
      () => `<h1>תקופת שכר</h1><p class="lead">מתי מתחילה תקופת השכר, ומתי מקבלים משכורת.</p>
        <div class="seg" style="margin-bottom:14px"><button data-pd="1" class="${emp.periodStartDay <= 1 ? 'on' : ''}">חודש קלנדרי (1 לחודש)</button><button data-pd="custom" class="${emp.periodStartDay > 1 ? 'on' : ''}">תאריך אחר</button></div>
        ${emp.periodStartDay > 1 ? `<label class="field"><span class="lbl">התקופה מתחילה ב- (יום בחודש)</span><input class="input" type="number" min="2" max="28" id="ob-pstart" value="${emp.periodStartDay}"><span class="hint">למשל 21: מה-21 בחודש ועד ה-20 בחודש הבא.</span></label>` : ''}
        <label class="field"><span class="lbl">יום התשלום (בחודש שאחרי)</span><input class="input" type="number" min="1" max="31" id="ob-payday" value="${emp.payDay}"><span class="hint">לפי החוק — עד ה-9. ביום הזה תקבל תזכורת להזין את התלוש.</span></label>`,
      () => `<h1>תחילת העבודה</h1><p class="lead">ממנו מחושבים ותק, דמי הבראה, ימי חופשה ומחלה, ותחילת ההפרשות לפנסיה.</p>
        <label class="field"><span class="lbl">תאריך תחילת העבודה</span><input class="input" type="date" id="ob-start" value="${st.startDate}"></label>
        <label class="field"><span class="lbl">תאריך לידה (לא חובה)</span><input class="input" type="date" id="ob-birth" value="${st.birthDate || ''}"><span class="hint">לברכת יום הולדת, ולחישוב נכון מתחת לגיל 18 (אז הנטו שווה לברוטו).</span></label>
        <label class="field"><span class="lbl">שבוע עבודה</span><select class="input" id="ob-week"><option value="5" ${+st.leave.workWeek === 5 ? 'selected' : ''}>5 ימים</option><option value="6" ${+st.leave.workWeek === 6 ? 'selected' : ''}>6 ימים</option></select></label>`,
      () => `<h1>שבת וחגים</h1><p class="lead">שעות בשבת ובחג משולמות ב-150%. זמני הכניסה והיציאה מחושבים בטלפון לפי העיר.</p>
        <label class="field"><span class="lbl">העיר שבה אתה עובד</span><select class="input" id="ob-city">${HebCal.CITIES.map((c) => `<option ${c.name === st.rest.city ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
        <div class="card small" id="ob-preview"></div>
        <div class="tiny muted">המעסיק מגדיר שבת בשעות קבועות (למשל שישי 16:00 עד שבת 20:00)? אפשר לשנות בהגדרות › שבת וחגים.</div>`,
      () => `<h1>נטו משוער</h1><p class="lead">כדי להעריך כמה ייכנס לחשבון.</p>
        <div class="field"><span class="lbl">נקודות זיכוי</span><div class="chips">${[[2.25, 'גבר — 2.25'], [2.75, 'אישה — 2.75']].map(([v2, l]) => `<button class="chip ${+st.tax.creditPoints === v2 ? 'on' : ''}" data-cp="${v2}">${l}</button>`).join('')}</div>
          <input class="input" type="number" step="0.25" inputmode="decimal" id="ob-cp" value="${st.tax.creditPoints}"><span class="hint">נקודות נוספות: ילדים, תואר, שחרור מצבא, עולה חדש… מופיע בתלוש.</span></label></div>
        <label class="field"><span class="lbl">הפרשת עובד לפנסיה %</span><input class="input" type="number" step="0.1" inputmode="decimal" id="ob-pen" value="${st.pension.employeePct}"><span class="hint">בדרך כלל 6%. מתחילה אחרי 6 חודשי עבודה (3 אם הייתה לך קרן).</span></label>
        <label class="switch-row"><span class="body"><span class="t">יש לי קרן השתלמות</span><span class="s">2.5% עובד / 7.5% מעסיק</span></span><input type="checkbox" class="switch" id="ob-hish" ${st.hishtalmut.enabled ? 'checked' : ''}></label>`,
    ];

    function read() {
      const q = (s) => v.querySelector(s);
      if (step === 1) {
        v.querySelectorAll('[data-rn]').forEach((i) => (roles[+i.dataset.rn].name = i.value.trim()));
        v.querySelectorAll('[data-rr]').forEach((i) => (roles[+i.dataset.rr].rate = UI.numIn(i)));
      }
      if (step === 2) { emp.travelPerDay = UI.numIn(q('#ob-travel')) || 0; emp.travelMonthlyCap = UI.numIn(q('#ob-cap')) || 0; }
      if (step === 3) { if (q('#ob-pstart')) emp.periodStartDay = Math.min(28, Math.max(2, UI.numIn(q('#ob-pstart')) || 2)); emp.payDay = UI.numIn(q('#ob-payday')) || 9; }
      if (step === 4) { st.startDate = q('#ob-start').value || st.startDate; st.birthDate = q('#ob-birth').value || null; st.leave.workWeek = +q('#ob-week').value; }
      if (step === 5) st.rest.city = q('#ob-city').value;
      if (step === 6) { st.tax.creditPoints = UI.numIn(q('#ob-cp')) || 2.25; st.pension.employeePct = UI.numIn(q('#ob-pen')) || 6; st.hishtalmut.enabled = q('#ob-hish').checked; }
    }
    function cityPreview() {
      const el = v.querySelector('#ob-preview');
      if (!el) return;
      const cfg = Object.assign({}, st.rest, { city: v.querySelector('#ob-city').value, dayRules: [] });
      const w = HebCal.restWindows(U.todayKey(), U.addDays(U.todayKey(), 10), cfg).find((x) => x.end > Date.now());
      el.innerHTML = w ? `${icon('candle', 's')} ${esc(w.label)} הקרובה: כניסה ${U.HEB_DAYS[U.dow(U.epochKey(w.start))]} ${U.epochHM(w.start)}, יציאה ${U.HEB_DAYS[U.dow(U.epochKey(w.end))]} ${U.epochHM(w.end)}` : '';
    }
    function draw() {
      v.innerHTML = `<div class="wizard"><div class="steps">${Array.from({ length: STEPS }, (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
        <div class="content">${screens[step]()}</div>
        <div class="foot ${step === 0 ? 'col' : ''}">${step === 0 ? `<button class="btn" data-next>בוא נתחיל</button><button class="btn tonal" data-demo>${icon('flask')} נסה עם נתוני דוגמה</button>`
          : `<button class="btn tonal" data-back>הקודם</button><button class="btn" data-next>${step === STEPS - 1 ? 'סיום' : 'הבא'}</button>`}</div></div>`;
      if (step === 5) { cityPreview(); v.querySelector('#ob-city').onchange = cityPreview; }
      window.scrollTo(0, 0);
    }
    async function finish(withDemo) {
      roles = roles.filter((r) => r.name && r.rate > 0);
      if (!roles.length) { UI.toast('הוסף לפחות תפקיד אחד עם תעריף'); step = 1; draw(); return; }
      const ops = [{ store: 'employers', put: emp }];
      for (const r of roles) {
        const rec = Object.assign({}, r);
        rec.rates = rec.rates && rec.rates.length ? rec.rates : [{ from: '2000-01-01', rate: r.rate }];
        // the wizard edits the current rate
        const sorted = rec.rates.slice().sort((a, b) => a.from.localeCompare(b.from));
        sorted[sorted.length - 1].rate = r.rate;
        rec.rates = sorted;
        delete rec.rate;
        rec.employerId = emp.id;
        ops.push({ store: 'roles', put: rec });
      }
      S.roles.filter((r) => !roles.some((x) => x.id === r.id)).forEach((r) => ops.push({ store: 'roles', del: r.id }));
      App.blocking = null;
      await Store.apply(ops, null);
      st.onboarded = true;
      await Store.setSettings((s) => Object.assign(s, st));
      nav.style.display = '';
      if (withDemo) await App.demo.load();
      App.go('home');
      setTimeout(() => App.runInsights(), 500);
      UI.toast(withDemo ? 'נטענו נתוני דוגמה — אפשר למחוק אותם מהבאנר' : 'מוכן! לחץ "התחל משמרת" כשאתה מתחיל לעבוד');
    }
    v.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-next')) { read(); if (step < STEPS - 1) { step++; draw(); } else finish(false); }
      if (b.hasAttribute('data-back')) { read(); step = Math.max(0, step - 1); draw(); }
      if (b.hasAttribute('data-demo')) finish(true);
      if (b.hasAttribute('data-radd')) { read(); const used = new Set(roles.map((r) => r.color)); roles.push({ id: 'r_' + U.uid(), name: '', color: Defaults.ROLE_COLORS.find((c) => !used.has(c)) || '#888', employerId: emp.id, rates: [], rate: null, archived: false }); draw(); }
      if (b.dataset.rx != null) { read(); roles.splice(+b.dataset.rx, 1); draw(); }
      if (b.dataset.cc != null) { read(); const r = roles[+b.dataset.cc]; const i = Defaults.ROLE_COLORS.indexOf(r.color); r.color = Defaults.ROLE_COLORS[(i + 1) % Defaults.ROLE_COLORS.length]; draw(); }
      if (b.dataset.pd) { read(); emp.periodStartDay = b.dataset.pd === '1' ? 1 : Math.max(2, emp.periodStartDay > 1 ? emp.periodStartDay : 21); draw(); }
      if (b.dataset.cp) { v.querySelector('#ob-cp').value = b.dataset.cp; v.querySelectorAll('[data-cp]').forEach((x) => x.classList.toggle('on', x === b)); }
    };
    draw();
    // detach the generic view handler when leaving the wizard
    const prevGo = App.go;
    App.go = function (tab, opts) { v.onclick = null; App.go = prevGo; return prevGo(tab, opts); };
  };

  /* ---------------- demo data ---------------- */
  function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
  App.demo = {
    async load() {
      const R = rng(42);
      const roles = App.roles();
      const role = (name) => (roles.find((r) => r.name === name) || roles[Math.floor(R() * roles.length)] || {}).id;
      const sadran = role('סדרן'), miznon = role('מזנון'), achmash = role('אחמ״ש');
      const emp = S.employers[0];
      const today = U.todayKey();
      const ops = [];
      const mk = (date, from, to, roleId, extra) => {
        const start = U.toEpoch(date, from);
        let end = U.toEpoch(date, to);
        if (end <= start) end = U.toEpoch(U.addDays(date, 1), to);
        return Object.assign({ id: 'demo_' + U.uid(), kind: 'shift', employerId: emp.id, roleId, status: 'done', start, end, splits: [], breakMin: 0, breakPaid: true, noTravel: false, items: [], note: '', demo: true }, extra || {});
      };
      for (let i = 125; i >= 1; i--) {
        const k = U.addDays(today, -i);
        const dw = U.dow(k);
        const p = R();
        if (dw === 6 && p < 0.45) ops.push(mk(k, '10:00', R() < 0.5 ? '19:00' : '17:00', R() < 0.6 ? sadran : miznon));
        else if (dw === 5 && p < 0.55) ops.push(mk(k, '13:00', '21:00', R() < 0.5 ? sadran : miznon, { note: R() < 0.2 ? 'ערב שבת עמוס' : '' }));
        else if (dw < 5 && p < 0.62) {
          const x = R();
          if (x < 0.35) ops.push(mk(k, '08:00', '16:00', sadran, { breakMin: 30, breakPaid: false }));
          else if (x < 0.6) ops.push(mk(k, '16:00', '00:00', miznon, { items: R() < 0.3 ? [{ id: U.uid(), type: 'tips', amount: Math.round(40 + R() * 80), label: 'טיפים' }] : [] }));
          else if (x < 0.8) {
            const s = mk(k, '15:00', '01:00', sadran);
            s.splits = [{ at: U.toEpoch(k, '19:00'), roleId: achmash }];
            ops.push(s);
          } else ops.push(mk(k, '07:00', '18:00', achmash));
        }
      }
      // one override example + one bonus
      const sat = ops.filter((s) => U.dow(U.epochKey(s.start)) === 6)[1];
      if (sat) { sat.overrides = { rest: { scope: 'range', from: sat.start + 2 * U.HOUR, to: sat.end } }; sat.overrideReason = 'המעסיק סופר שבת רק מ-12:00'; }
      if (ops[10]) ops[10].items.push({ id: U.uid(), type: 'bonus', amount: 150, label: 'בונוס אירוע' });
      if (ops[20]) ops[20].items.push({ id: U.uid(), type: 'deduction', amount: 25, label: 'ארוחה' });
      // planned shifts
      ops.push(mk(U.addDays(today, 1), '16:00', '00:00', miznon, { status: 'planned' }));
      ops.push(mk(U.addDays(today, 3), '08:00', '16:00', sadran, { status: 'planned' }));
      const ent = [
        { id: 'demo_' + U.uid(), kind: 'vacation', date: U.addDays(today, -40), status: 'done', employerId: emp.id, demo: true },
        ...[0, 1, 2].map((d) => ({ id: 'demo_' + U.uid(), kind: 'sick', date: U.addDays(today, -70 + d), status: 'done', employerId: emp.id, demo: true })),
        { id: 'demo_' + U.uid(), kind: 'adjustment', type: 'bonus', amount: 300, label: 'מענק חג', date: U.addDays(today, -25), status: 'done', employerId: emp.id, demo: true },
      ];
      const all = [...ops.map((x) => ({ store: 'shifts', put: x })), ...ent.map((x) => ({ store: 'entries', put: x }))];
      all.push({ store: 'templates', put: { id: 'demo_tpl1', name: 'בוקר סדרן', roleId: sadran, employerId: emp.id, startT: '08:00', endT: '16:00', breakMin: 30, breakPaid: false, noTravel: false, splits: [], demo: true } });
      await Store.apply(all, null);
      // demo needs >1 year of seniority to show recuperation & pension checks; the real value is restored on clear
      await Store.setMeta({ demoPrevStart: S.settings.startDate || null });
      await Store.setSettings((s) => { s.demo = true; if (!s.startDate || s.startDate > U.addDays(today, -400)) s.startDate = U.addDays(today, -400); });
      // a sample payslip for last pay period, with one shift "forgotten" by the employer
      App.recompute();
      const P = Engine.periodByKey(U.addMonthKey(Engine.periodOf(today, emp).key, -1), emp);
      const ex = root.Payslip.expected(App.model, P.key, false);
      if (ex.shifts.length > 2) {
        // the employer "forgot" the last shift of the period entirely
        const miss = ex.shifts[ex.shifts.length - 1];
        const f = (v) => Math.round(v * 100) / 100;
        const pay = Object.assign({}, ex.pay), hrs = Object.assign({}, ex.hrs);
        for (const l of miss.lines) {
          const k = l.rest ? ['rest150', 'rest175', 'rest200'][l.tier] : ['base', 'ot125', 'ot150'][l.tier];
          pay[k] -= l.amount; hrs[k] -= l.hours;
        }
        const travel = ex.t.travel - (+emp.travelPerDay || 0);
        const gross = pay.base + pay.ot125 + pay.ot150 + pay.rest150 + pay.rest175 + pay.rest200 + travel + ex.t.bonus + ex.t.additions + ex.t.leavePay;
        const n = Engine.netEstimate({ gross, pensionBase: ex.t.base - miss.base, deductions: 0, periodTo: P.to }, S.settings);
        const fields = {
          base: { value: f(pay.base), qty: f(hrs.base), rate: f(pay.base / hrs.base) },
          ot125: { value: f(pay.ot125), qty: f(hrs.ot125) }, ot150: { value: f(pay.ot150), qty: f(hrs.ot150) },
          rest150: { value: f(pay.rest150), qty: f(hrs.rest150) }, rest175: { value: f(pay.rest175 + pay.rest200), qty: f(hrs.rest175 + hrs.rest200) },
          travel: { value: f(travel) }, gross: { value: f(gross) }, nationalInsurance: { value: f(n.bl) }, healthTax: { value: f(n.health) },
          incomeTax: { value: f(n.incomeTax) }, creditPoints: { value: S.settings.tax.creditPoints },
          totalDeductions: { value: f(n.bl + n.health + n.incomeTax + n.pensionEmployee) }, net: { value: f(gross - n.bl - n.health - n.incomeTax - n.pensionEmployee) },
        };
        if (n.pensionActive) { fields.pensionEmployee = { value: f(n.pensionEmployee) }; fields.pensionEmployer = { value: f(n.pensionEmployer) }; }
        for (const k of Object.keys(fields)) if (!fields[k].value && k !== 'creditPoints') delete fields[k];
        await Store.apply([{ store: 'payslips', put: { id: 'demo_slip', period: P.key, employerId: emp.id, fields, other: [], text: '', source: 'manual', demo: true, summary: { counts: {}, totalMissing: 0, gross: f(gross), net: fields.net.value } } }], null);
      }
      App.recompute();
      // store the demo payslip summary with real counts
      const slip = S.payslips.find((p) => p.id === 'demo_slip');
      if (slip) {
        const a = root.Payslip.analyze(slip, App.model);
        const counts = { ok: 0, warn: 0, bad: 0 };
        a.findings.forEach((x) => counts[x.status]++);
        const gaps = a.findings.filter((x) => x.status === 'bad' && x.amount > 0).map((x) => ({ store: 'gaps', put: { id: 'demo_gap_' + x.area, payslipId: slip.id, period: slip.period, area: x.area, title: x.title, amount: Math.round(x.amount * 100) / 100, status: 'open', demo: true } }));
        await Store.apply([{ store: 'payslips', put: Object.assign({}, slip, { summary: Object.assign({}, slip.summary, { counts, totalMissing: a.totalMissing }) }) }, ...gaps], null);
      }
      App.runInsights();
    },
    async clear() {
      const ops = [];
      for (const s of ['shifts', 'entries', 'payslips', 'gaps', 'templates', 'dayRules']) S[s].filter((x) => x.demo).forEach((x) => ops.push({ store: s, del: x.id }));
      S.notifications.forEach((n) => ops.push({ store: 'notifications', del: n.id }));
      await Store.apply(ops, null);
      const prevStart = S.meta.demoPrevStart;
      await Store.setSettings((s) => { s.demo = false; if (prevStart !== undefined) s.startDate = prevStart; });
      await Store.setMeta({ lastAnomalyPush: null, demoPrevStart: undefined });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
