/* ============================================================
 * views-onboarding.js — first-run wizard and demo data.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, HebCal, Store, UI, App, Defaults } = root;
  const S = Store.S;
  const { icon, esc } = UI;

  /* ---------------- wizard ----------------
   * A few friendly questions with live previews, then (for a new user) "save to your Google account".
   * opts.preLogin: the user is not signed in yet; the last step signs in and uploads what they set up.
   * Returning users skip the questions from the welcome screen ("I already have an account"). */
  App.sheetsApi.onboarding = function (opts) {
    opts = opts || {};
    const nav = document.getElementById('nav');
    nav.style.display = 'none';
    App.blocking = 'onboarding';
    const emp = Store.clone(S.employers[0]);
    const st = Store.clone(S.settings);
    let roles = S.roles.length ? Store.clone(S.roles.filter((r) => !r.archived)) : Defaults.defaultRoles(emp.id);
    roles.forEach((r) => (r.rate = Engine.roleRate(r, U.todayKey())));
    if (!st.startDate) st.startDate = U.addMonths(U.todayKey(), -3);
    const needsLogin = () => !!opts.preLogin && !App.localOnly && !(root.Cloud && root.Cloud.user);
    let step = 0, dir = 'next', saving = false, savedMsg = '', saved = false, demo = false;
    const STEPS = 8; // welcome, 6 questions, done
    const v = document.getElementById('view');
    const fx = root.Fx;
    const hero = (emoji, cls) => `<div class="ob-hero ${cls || ''}" aria-hidden="true">${emoji}</div>`;
    const money = (n) => U.money(n, Number.isInteger(+n) ? 0 : 2);

    const screens = [
      () => `<div class="ob-welcome">
        <div class="brand-mark big" aria-hidden="true"></div>
        <h1 class="brand-name">Shaati</h1><div class="brand-sub">מעקב משמרות ושכר</div>
        <div class="ob-points">
          <div style="--d:0">${hero('⏱️', 'sm')}<span>רושמים משמרת בלחיצה אחת</span></div>
          <div style="--d:1">${hero('🕯️', 'sm')}<span>שבתות, חגים ושעות נוספות מחושבים לבד</span></div>
          <div style="--d:2">${hero('🧾', 'sm')}<span>בודקים שהתלוש תואם, ויודעים מה מגיע לך</span></div>
        </div>
        <p class="small muted">דקה אחת של שאלות קצרות, ומתחילים.</p></div>`,
      () => `${hero('💼')}<h1>איפה אתה עובד?</h1><p class="lead">התפקידים שלך והשכר לשעה. אפשר להוסיף, לשנות שם וצבע.</p>
        ${roles.map((r, i) => `<div class="role-edit"><button class="sw" style="background:${r.color}" data-cc="${i}" aria-label="צבע"></button>
          <input class="input" data-rn="${i}" value="${esc(r.name)}" placeholder="שם התפקיד">
          <input class="input" type="number" step="any" inputmode="decimal" data-rr="${i}" value="${r.rate || ''}" placeholder="₪ לשעה">
          <button class="icon-btn" data-rx="${i}" aria-label="הסר">${icon('x')}</button></div>`).join('')}
        <button class="btn text" data-radd>${icon('plus', 's')} הוסף תפקיד</button>
        <div class="ob-live" id="ob-live-roles"></div>`,
      () => `${hero('🚌')}<h1>נסיעות</h1><p class="lead">כמה מקבלים על נסיעות לכל יום עבודה? זה בנוסף לשכר.</p>
        <label class="field"><span class="lbl">₪ ליום עבודה</span><input class="input" type="number" step="any" inputmode="decimal" id="ob-travel" value="${emp.travelPerDay}"></label>
        <label class="field"><span class="lbl">תקרה חודשית ₪ (לא חובה)</span><input class="input" type="number" step="any" inputmode="decimal" id="ob-cap" value="${emp.travelMonthlyCap || ''}" placeholder="ללא תקרה"><span class="hint">למשל מחיר חופשי-חודשי.</span></label>
        <div class="ob-live" id="ob-live-travel"></div>`,
      () => `${hero('📅')}<h1>מתי מקבלים משכורת?</h1><p class="lead">ככה נדע לחשב כל תקופה ולהזכיר לך לבדוק את התלוש.</p>
        <div class="seg" style="margin-bottom:14px"><button data-pd="1" class="${emp.periodStartDay <= 1 ? 'on' : ''}">חודש רגיל (מה-1)</button><button data-pd="custom" class="${emp.periodStartDay > 1 ? 'on' : ''}">תאריך אחר</button></div>
        ${emp.periodStartDay > 1 ? `<label class="field"><span class="lbl">התקופה מתחילה ב- (יום בחודש)</span><input class="input" type="number" min="2" max="28" id="ob-pstart" value="${emp.periodStartDay}"><span class="hint">למשל 21: מה-21 בחודש ועד ה-20 בחודש הבא.</span></label>` : ''}
        <label class="field"><span class="lbl">יום התשלום בחודש שאחרי</span><input class="input" type="number" min="1" max="31" id="ob-payday" value="${emp.payDay}"><span class="hint">לפי החוק, עד ה-9 בחודש.</span></label>`,
      () => `${hero('🎂')}<h1>קצת עליך</h1><p class="lead">לוותק, לחופשה ולהבראה. ותאריך לידה כדי לבדוק לפי הגיל שלך.</p>
        <label class="field"><span class="lbl">מתי התחלת לעבוד שם?</span><input class="input" type="date" id="ob-start" value="${st.startDate}"></label>
        <label class="field"><span class="lbl">תאריך לידה (לא חובה)</span><input class="input" type="date" id="ob-birth" value="${st.birthDate || ''}"><span class="hint">מתחת לגיל 18: שכר מינימום לפי גיל, בדיקות חוק עבודת הנוער, ונטו שווה לברוטו. וגם ברכה ביום ההולדת 🎉</span></label>
        <label class="field"><span class="lbl">כמה ימים בשבוע עובדים שם?</span><select class="input" id="ob-week"><option value="5" ${+st.leave.workWeek === 5 ? 'selected' : ''}>5 ימים</option><option value="6" ${+st.leave.workWeek === 6 ? 'selected' : ''}>6 ימים</option></select></label>
        <div class="ob-live" id="ob-live-age"></div>`,
      () => `${hero('🕯️')}<h1>שבת וחגים</h1><p class="lead">שעות בשבת ובחג שוות לפחות 150%. נחשב אותן לפי העיר.</p>
        <label class="field"><span class="lbl">באיזו עיר אתה עובד?</span><select class="input" id="ob-city">${HebCal.CITIES.map((c) => `<option ${c.name === st.rest.city ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
        <div class="ob-live" id="ob-preview"></div>`,
      () => `${hero('💰')}<h1>כמה ייכנס לחשבון?</h1><p class="lead">כדי להעריך את הנטו. אפשר לשנות בכל רגע.</p>
        <div class="field"><span class="lbl">נקודות זיכוי</span><div class="chips">${[[2.25, 'גבר: 2.25'], [2.75, 'אישה: 2.75']].map(([v2, l]) => `<button class="chip ${+st.tax.creditPoints === v2 ? 'on' : ''}" data-cp="${v2}">${l}</button>`).join('')}</div>
          <input class="input" type="number" step="0.25" inputmode="decimal" id="ob-cp" value="${st.tax.creditPoints}"><span class="hint">נקודות נוספות (ילדים, תואר, שחרור מצבא) מופיעות בתלוש.</span></div>
        <label class="field"><span class="lbl">הפרשה שלך לפנסיה %</span><input class="input" type="number" step="0.1" inputmode="decimal" id="ob-pen" value="${st.pension.employeePct}"><span class="hint">בדרך כלל 6%.</span></label>
        <label class="switch-row"><span class="body"><span class="t">יש לי קרן השתלמות</span></span><input type="checkbox" class="switch" id="ob-hish" ${st.hishtalmut.enabled ? 'checked' : ''}></label>`,
      () => {
        const valid = roles.filter((r) => r.name && r.rate > 0);
        return `<div class="ob-done">
          <div class="ob-check" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>
          <h1>${demo ? 'הנתונים לדוגמה מוכנים!' : 'הכל מוכן!'}</h1>
          <p class="lead">${demo ? 'אפשר להסתכל על הכל ולמחוק את הדוגמה בכל רגע.' : 'עכשיו כל משמרת מחושבת לבד.'}</p>
          ${demo ? '' : `<div class="ob-summary">
            ${valid.map((r) => `<span><i style="background:${r.color}"></i>${esc(r.name)} · ${money(r.rate)}</span>`).join('')}
            <span>🚌 ${money(emp.travelPerDay)} ליום</span><span>📅 משכורת ב-${emp.payDay} לחודש</span><span>🕯️ ${esc(st.rest.city)}</span>
          </div>`}
          ${needsLogin() ? `<div class="ob-save"><b>שמור את זה בחשבון Google</b><div class="small muted">כדי שהנתונים לא ילכו לאיבוד ויהיו זמינים בכל טלפון. רק לך תהיה גישה אליהם.</div></div>` : ''}
          ${savedMsg ? `<div class="banner warn" style="text-align:start">${icon('alert')}<div>${esc(savedMsg)}</div></div>` : ''}
        </div>`;
      },
    ];

    function read() {
      const q = (s) => v.querySelector(s);
      if (step === 1) {
        v.querySelectorAll('[data-rn]').forEach((i) => (roles[+i.dataset.rn].name = i.value.trim()));
        v.querySelectorAll('[data-rr]').forEach((i) => (roles[+i.dataset.rr].rate = UI.numIn(i)));
      }
      if (step === 2) { emp.travelPerDay = UI.numIn(q('#ob-travel')) || 0; emp.travelMonthlyCap = UI.numIn(q('#ob-cap')) || 0; }
      if (step === 3) { if (q('#ob-pstart')) emp.periodStartDay = Math.min(28, Math.max(2, UI.numIn(q('#ob-pstart')) || 2)); emp.payDay = Math.min(31, Math.max(1, UI.numIn(q('#ob-payday')) || 9)); }
      if (step === 4) { st.startDate = q('#ob-start').value || st.startDate; st.birthDate = q('#ob-birth').value || null; st.leave.workWeek = +q('#ob-week').value; }
      if (step === 5) st.rest.city = q('#ob-city').value;
      if (step === 6) { st.tax.creditPoints = UI.numIn(q('#ob-cp')) || 2.25; st.pension.employeePct = UI.numIn(q('#ob-pen')) || 6; st.hishtalmut.enabled = q('#ob-hish').checked; }
    }
    /* live previews: the numbers react while typing */
    function live() {
      const q = (s) => v.querySelector(s);
      if (step === 1) {
        read();
        const r = roles.find((x) => x.name && x.rate > 0);
        const el = q('#ob-live-roles');
        if (el) el.innerHTML = r ? `${icon('sparkle', 's')} משמרת של 8 שעות כ${esc(r.name)} = <b>${money(r.rate * 8)}</b>` : 'הזן שם ותעריף לפחות לתפקיד אחד';
      }
      if (step === 2) {
        const t = UI.numIn(q('#ob-travel')) || 0, cap = UI.numIn(q('#ob-cap')) || 0;
        const m = cap ? Math.min(cap, t * 20) : t * 20;
        q('#ob-live-travel').innerHTML = t ? `${icon('car', 's')} בחודש של 20 ימי עבודה: <b>${money(m)}</b> נסיעות` : '';
      }
      if (step === 4) {
        const b = q('#ob-birth').value;
        const age = b ? Engine.ageAt(b, U.todayKey()) : null;
        const el = q('#ob-live-age');
        if (age == null || age < 0 || age > 100) { el.innerHTML = ''; return; }
        const mw = Engine.legalMinWage(U.todayKey(), b);
        el.innerHTML = age < 18
          ? `${icon('shield', 's')} גיל ${age}: שכר המינימום שלך <b>${U.money(mw.hourly)}</b> לשעה, והנטו שווה לברוטו (בלי מס).`
          : `${icon('shield', 's')} גיל ${age}: שכר המינימום <b>${U.money(mw.hourly)}</b> לשעה.`;
      }
      if (step === 5) {
        const el = q('#ob-preview');
        const cfg = Object.assign({}, st.rest, { city: q('#ob-city').value, dayRules: [] });
        const w = HebCal.restWindows(U.todayKey(), U.addDays(U.todayKey(), 10), cfg).find((x) => x.end > Date.now());
        el.innerHTML = w ? `${icon('candle', 's')} ${esc(w.label)} הקרובה: כניסה ${U.HEB_DAYS[U.dow(U.epochKey(w.start))]} ${U.epochHM(w.start)}, יציאה ${U.HEB_DAYS[U.dow(U.epochKey(w.end))]} ${U.epochHM(w.end)}` : '';
      }
    }
    function draw() {
      const last = step === STEPS - 1;
      const qn = step >= 1 && step <= 6 ? `<div class="ob-count">שאלה ${step} מתוך 6${step === 5 ? ' · עוד אחת וסיימנו' : ''}</div>` : '';
      let foot;
      if (step === 0) {
        foot = `<button class="btn big" data-next>בוא נתחיל</button><button class="btn tonal" data-demo>${icon('flask')} נסה עם נתוני דוגמה</button>
          ${opts.preLogin ? '<button class="btn text" data-have>כבר יש לי חשבון? התחברות</button>' : ''}
          <div class="tiny muted ob-consent">בהמשך אתה מאשר את ${App.legalLinks ? App.legalLinks() : 'תנאי השימוש ומדיניות הפרטיות'}.</div>`;
      } else if (last) {
        foot = needsLogin()
          ? `<button class="btn big ob-google" data-save ${saving ? 'disabled' : ''}>${App.googleIcon || ''}<span>${saving ? 'שומר…' : 'שמירה עם Google'}</span></button>`
          : `<button class="btn big" data-save ${saving ? 'disabled' : ''}>${saving ? 'רגע…' : 'יאללה, מתחילים'}</button>`;
      } else {
        foot = `<button class="btn tonal" data-back>הקודם</button><button class="btn" data-next>${step === 6 ? 'סיום' : 'הבא'}</button>`;
      }
      v.innerHTML = `<div class="wizard ob">${step ? `<div class="ob-progress"><i style="width:${Math.round((step / (STEPS - 1)) * 100)}%"></i></div>` : ''}${qn}
        <div class="content ob-${dir}">${screens[step]()}</div>
        <div class="foot ${step === 0 || last ? 'col' : ''}">${foot}</div></div>`;
      live();
      const city = v.querySelector('#ob-city');
      if (city) city.onchange = live;
      window.scrollTo(0, 0);
    }
    function go(next) {
      read();
      dir = next > step ? 'next' : 'prev';
      step = Math.max(0, Math.min(STEPS - 1, next));
      draw();
      if (fx) { fx.play(dir === 'next' ? 'pop' : 'soft'); fx.haptic(8); }
      if (step === STEPS - 1 && fx) setTimeout(() => fx.celebrate('big'), 250);
    }
    async function save(withDemo) {
      roles = roles.filter((r) => r.name && r.rate > 0);
      if (!roles.length) { UI.invalid('הוסף לפחות תפקיד אחד עם שם ותעריף'); go(1); return false; }
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
      await Store.apply(ops, null);
      st.onboarded = true;
      await Store.setSettings((s) => Object.assign(s, st));
      if (withDemo) await App.demo.load();
      saved = true;
      return true;
    }
    function enterApp() {
      v.onclick = null;
      v.oninput = null;
      App.blocking = null;
      nav.style.display = '';
      App.go = prevGo;
      if (needsLogin()) return; // still on the save step
      App.afterLogin();
      setTimeout(() => App.runInsights(), 500);
      UI.toast(demo ? 'נטענו נתוני דוגמה. אפשר למחוק אותם מהבאנר' : 'מוכן! לחץ "התחל משמרת" כשאתה מתחיל לעבוד');
    }
    async function finishStep() {
      if (saving) return;
      saving = true; savedMsg = ''; draw();
      try {
        if (!saved && !(await save(false))) { saving = false; return; }
        if (needsLogin()) {
          const Cloud = root.Cloud;
          const user = await Cloud.signIn();
          if (!user) return; // redirect sign-in: the page reloads signed in and continues
          await Cloud.connect(user);
          UI.toast('מחובר כ-' + (user.displayName || user.email));
        }
        saving = false;
        enterApp();
      } catch (e) {
        console.error(e);
        saving = false;
        savedMsg = root.Cloud ? root.Cloud.errorText(e) : String(e.message || e);
        draw();
      }
    }
    v.onclick = async (e) => {
      const b = e.target.closest('button, a');
      if (!b) return;
      if (b.dataset.legal) return; // the terms links open their own sheet
      if (b.hasAttribute('data-next')) {
        if (step === 0 && App.acceptLegal) await App.acceptLegal();
        if (step === 1) { read(); if (!roles.some((r) => r.name && r.rate > 0)) { UI.invalid('הוסף לפחות תפקיד אחד עם שם ותעריף'); return; } }
        go(step + 1);
      }
      if (b.hasAttribute('data-back')) go(step - 1);
      if (b.hasAttribute('data-demo')) {
        if (App.acceptLegal) await App.acceptLegal();
        demo = true;
        if (await save(true)) go(STEPS - 1);
      }
      if (b.hasAttribute('data-have')) {
        if (App.acceptLegal) await App.acceptLegal();
        v.onclick = null; App.go = prevGo;
        App.blocking = null;
        App.showLogin();
      }
      if (b.hasAttribute('data-save')) finishStep();
      if (b.hasAttribute('data-radd')) { read(); const used = new Set(roles.map((r) => r.color)); roles.push({ id: 'r_' + U.uid(), name: '', color: Defaults.ROLE_COLORS.find((c) => !used.has(c)) || '#888', employerId: emp.id, rates: [], rate: null, archived: false }); draw(); }
      if (b.dataset.rx != null) { read(); roles.splice(+b.dataset.rx, 1); draw(); }
      if (b.dataset.cc != null) { read(); const r = roles[+b.dataset.cc]; const i = Defaults.ROLE_COLORS.indexOf(r.color); r.color = Defaults.ROLE_COLORS[(i + 1) % Defaults.ROLE_COLORS.length]; draw(); }
      if (b.dataset.pd) { read(); emp.periodStartDay = b.dataset.pd === '1' ? 1 : Math.max(2, emp.periodStartDay > 1 ? emp.periodStartDay : 21); draw(); }
      if (b.dataset.cp) { v.querySelector('#ob-cp').value = b.dataset.cp; v.querySelectorAll('[data-cp]').forEach((x) => x.classList.toggle('on', x === b)); }
    };
    v.oninput = () => live();
    draw();
    // leaving the wizard any other way detaches its handlers
    const prevGo = App.go;
    App.go = function (tab, o) { v.onclick = null; v.oninput = null; App.go = prevGo; return prevGo(tab, o); };
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
