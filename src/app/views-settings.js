/* ============================================================
 * views-settings.js — settings (auto-saved), employers & roles
 * with rate history, calculation rules, Shabbat/holiday window,
 * net estimate data, leave, alerts, appearance, lock, AI, backup.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, HebCal, Store, UI, App, Defaults } = root;
  const S = Store.S;
  const { icon, esc, money } = UI;

  /* ---------------- form helpers (data-s="s.path" | "e.path") ---------------- */
  const F = {
    num: (label, path, v, hint, ph) => `<label class="field"><span class="lbl">${label}</span><input class="input" type="number" step="any" inputmode="decimal" data-s="${path}" value="${v == null ? '' : esc(v)}" placeholder="${ph || ''}">${hint ? `<span class="hint">${hint}</span>` : ''}</label>`,
    text: (label, path, v, hint, extra) => `<label class="field"><span class="lbl">${label}</span><input class="input" data-s="${path}" value="${esc(v || '')}" ${extra || ''}>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`,
    time: (label, path, v) => `<label class="field"><span class="lbl">${label}</span><input class="input" type="time" data-s="${path}" value="${esc(v || '')}"></label>`,
    date: (label, path, v, hint) => `<label class="field"><span class="lbl">${label}</span><input class="input" type="date" data-s="${path}" value="${esc(v || '')}">${hint ? `<span class="hint">${hint}</span>` : ''}</label>`,
    sw: (t, s, path, on) => `<label class="switch-row"><span class="body"><span class="t">${t}</span>${s ? `<span class="s">${s}</span>` : ''}</span><input type="checkbox" class="switch" data-s="${path}" ${on ? 'checked' : ''}></label>`,
    sel: (label, path, opts, v, hint) => `<label class="field"><span class="lbl">${label}</span><select class="input" data-s="${path}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`,
  };
  App.F = F;
  function setPath(obj, path, v) {
    const p = path.split('.');
    let o = obj;
    for (let i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = {}; o = o[p[i]]; }
    o[p[p.length - 1]] = v;
  }
  function readVal(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') { const n = UI.numIn(el); return n == null ? null : n; }
    if (el.tagName === 'SELECT' && el.dataset.keepStr == null) {
      if (/^-?\d+(\.\d+)?$/.test(el.value)) return +el.value;
      if (el.value === 'true' || el.value === 'false') return el.value === 'true';
    }
    return el.value;
  }
  /** Bind auto-save. empId() returns the employer being edited. */
  function bind(el, empId, redraw) {
    el.addEventListener('change', async (e) => {
      const t = e.target;
      const path = t.dataset.s;
      if (!path) return;
      const v = readVal(t);
      if (path.startsWith('s.')) await Store.setSettings((st) => setPath(st, path.slice(2), v));
      else if (path.startsWith('e.')) {
        const emp = Store.clone(App.employer(empId()));
        setPath(emp, path.slice(2), v);
        await Store.put('employers', emp);
      }
      UI.toast('נשמר');
      if (redraw && t.dataset.redraw != null) redraw();
    });
  }
  function sectionSheet(title, render, opts) {
    opts = opts || {};
    let empId = S.employers[0].id;
    let sheetEl = null;
    const empPicker = () => (opts.perEmployer && App.multiEmp() ? `<div class="chips">${S.employers.map((e) => `<button class="chip ${e.id === empId ? 'on' : ''}" data-emp="${e.id}">${icon('briefcase', 's')} ${esc(e.name)}</button>`).join('')}</div>` : '');
    const draw = () => { const b = sheetEl.querySelector('.sh-body'); const y = b.scrollTop; b.innerHTML = empPicker() + render(App.employer(empId)); b.scrollTop = y; if (opts.mount) opts.mount(sheetEl, draw); };
    UI.openSheet({
      title, full: true, body: empPicker() + render(App.employer(empId)),
      onMount: (el) => {
        sheetEl = el;
        bind(el, () => empId, draw);
        el.addEventListener('click', (e) => { const b = e.target.closest('[data-emp]'); if (b) { empId = b.dataset.emp; draw(); } });
        if (opts.mount) opts.mount(el, draw);
      },
    });
  }

  /* ---------------- sections ---------------- */
  const SECTIONS = {
    rights: { icon: 'shield', title: 'הזכויות שלי', sub: () => 'מדריך אישי לפי הגיל והנתונים שלך · גם בלי אינטרנט' },
    personal: { icon: 'users', title: 'פרטים אישיים', sub: () => { const a = Engine.ageAt(S.settings.birthDate, U.todayKey()); return (S.settings.userName || 'שם לא הוזן') + (a != null ? ' · גיל ' + a + (a < 18 ? ' (פטור ממסים)' : '') : ''); } },
    account: { icon: 'cloud', title: 'חשבון וסנכרון', sub: () => (S.meta.cloudEmail || 'לא מחובר') + ' · ' + root.Cloud.statusText() },
    roles: { icon: 'users', title: 'מעסיקים, תפקידים ותעריפים', sub: () => App.roles().map((r) => r.name + ' ' + U.money(Engine.roleRate(r, U.todayKey()), 0)).join(' · ') },
    calc: { icon: 'flask', title: 'חוקי חישוב', sub: () => { const e = S.employers[0]; return `ש״נ אחרי ${e.otThreshold} ש׳ · שבת ${e.restPct}% · עיגול: ${e.roundingMode === 'none' ? 'ללא' : e.roundingUnit + ' דק׳'}`; } },
    rest: { icon: 'candle', title: 'שבת וחגים', sub: () => (S.settings.rest.mode === 'city' ? 'לפי ' + (S.settings.rest.city === '__custom' ? 'מיקום מותאם' : S.settings.rest.city) : `קבוע: ⁦${S.settings.rest.fixedStart}–${S.settings.rest.fixedEnd}⁩`) + (S.dayRules.length ? ` · ${S.dayRules.length} כללי יום` : '') },
    pay: { icon: 'car', title: 'נסיעות ותקופת שכר', sub: () => { const e = S.employers[0]; return `${U.money(e.travelPerDay)} ליום${+e.travelMonthlyCap ? ', תקרה ' + U.money(e.travelMonthlyCap, 0) : ''} · ${e.periodStartDay > 1 ? 'מ-' + e.periodStartDay + ' לחודש' : 'חודש קלנדרי'} · תשלום ב-${e.payDay}`; } },
    net: { icon: 'wallet', title: 'נטו משוער ומס', sub: () => `${S.settings.tax.creditPoints} נק׳ זיכוי · פנסיה ${S.settings.pension.employeePct}%${S.settings.hishtalmut.enabled ? ' · השתלמות' : ''}` },
    leave: { icon: 'beach', title: 'ותק, חופשה, מחלה והבראה', sub: () => (S.settings.startDate ? 'התחלת עבודה: ' + U.fmtDate(S.settings.startDate) : 'הגדר תאריך תחילת עבודה') },
    goal: { icon: 'target', title: 'יעד חודשי', sub: () => (+S.settings.goal.amount ? U.money(S.settings.goal.amount, 0) + (S.settings.goal.type === 'net' ? ' נטו' : ' ברוטו') : 'לא הוגדר') },
    alerts: { icon: 'bell', title: 'התראות ותובנות', sub: () => (('Notification' in window) && Notification.permission === 'granted' ? 'פוש מופעל' : 'פוש כבוי') + ' · סף חריגה ' + S.settings.alerts.deviationPct + '%' },
    templates: { icon: 'layers', title: 'תבניות משמרת', sub: () => (S.templates.length ? S.templates.length + ' תבניות' : 'אין תבניות') },
    look: { icon: 'palette', title: 'מראה', sub: () => ({ system: 'לפי המערכת', light: 'בהיר', dark: 'כהה' }[S.settings.theme]) + ' · ' + (App.ACCENTS[S.settings.accent] || [])[2] },
    security: { icon: 'lock', title: 'נעילה בקוד', sub: () => (S.settings.lock.enabled ? 'מופעלת' : 'כבויה') },
    assistant: { icon: 'sparkle', title: 'עוזר זכויות ושכר (AI)', sub: () => (S.settings.ai.apiKey ? 'מוכן — שאל כל שאלה' : 'דורש מפתח API') },
    ai: { icon: 'sparkle', title: 'מפתח AI וניתוח תלושים', sub: () => (S.settings.ai.apiKey ? 'מפתח מוגדר · ' + S.settings.ai.model : 'אופציונלי — ללא מפתח הכול מקומי') },
    backup: { icon: 'cloud', title: 'גיבוי ושחזור', sub: () => (S.settings.backup.lastBackup ? 'גיבוי אחרון: ' + UI.timeAgo(S.settings.backup.lastBackup) : 'עוד לא גובה') },
    export: { icon: 'download', title: 'ייצוא נתונים', sub: () => 'CSV / Excel, PDF, יומן' },
    demo: { icon: 'flask', title: 'מצב הדגמה', sub: () => (S.settings.demo ? 'פעיל' : 'נתוני דוגמה לבדיקת האפליקציה') },
    about: { icon: 'info', title: 'אודות והתקנה', sub: () => 'גרסה ' + root.APP_VERSION },
  };

  App.views.settings = function () {
    const groups = [['חשבון', ['account', 'personal']], ['עבודה ושכר', ['rights', 'roles', 'calc', 'rest', 'pay', 'net', 'leave', 'goal']], ['אפליקציה', ['assistant', 'alerts', 'templates', 'look', 'security', 'ai']], ['נתונים', ['backup', 'export', 'demo', 'about']]];
    return `<div class="topbar"><div class="titles"><h1>הגדרות</h1><div class="sub">כל שינוי נשמר מיד</div></div></div>
      ${groups.map(([g, keys]) => `<div class="section-title">${g}</div><div class="list">${keys.map((k) => { const s = SECTIONS[k]; return `<button class="item" data-act="settings-open" data-k="${k}"><span class="lead" style="background:var(--secondary-container);color:var(--on-secondary-container)">${icon(s.icon)}</span><span class="body"><span class="t">${s.title}</span><span class="s">${esc(s.sub())}</span></span>${icon('left', 's')}</button>`; }).join('')}</div>`).join('')}
      <div class="section-title">מידע משפטי</div>
      <div class="list">${[['about', 'info', 'אודות'], ['terms', 'file', 'תנאי שימוש'], ['privacy', 'shield', 'מדיניות פרטיות'], ['disclaimer', 'alert', 'הבהרה משפטית'], ['accessibility', 'eye', 'הצהרת נגישות'], ['licenses', 'layers', 'רישיונות וצד שלישי']].map(([d, ic, t]) => `<button class="item" data-act="legal" data-doc="${d}"><span class="lead" style="background:var(--surface-3)">${icon(ic)}</span><span class="body"><span class="t">${t}</span></span>${icon('left', 's')}</button>`).join('')}</div>
      <div class="ver">גרסה ${root.APP_VERSION} · מבנה נתונים ${Store.SCHEMA_VERSION}${S.settings.legal ? ' · תנאים ' + esc(S.settings.legal.version) + ' אושרו' : ''}</div>`;
  };
  App.actions['settings-open'] = (el) => (el.dataset.k === 'assistant' ? App.actions.assistant() : el.dataset.k === 'rights' ? App.actions.rights() : App.sheetsApi.settingsSection(el.dataset.k));

  App.sheetsApi.settingsSection = function (k) {
    const s = SECTIONS[k];
    const R = RENDER[k];
    if (!R) return;
    sectionSheet(s.title, R.render, { perEmployer: R.perEmployer, mount: R.mount });
  };

  /* ---------------- renderers ---------------- */
  const HOLS = HebCal.HOLIDAY_DEFS;
  const RENDER = {};
  /** The minimum wage the law sets today for this user (by date and age). */
  function minWageInfo() {
    const L = Engine.legalMinWage(U.todayKey(), S.settings.birthDate);
    return `<div class="kv"><span>לפי החוק${L.youth ? ` (גיל ${L.age})` : ''}</span><b>${U.money(L.hourly)} לשעה</b></div>
      <div class="tiny muted" style="margin:4px 0 10px">מתעדכן אוטומטית לפי התאריך${S.settings.birthDate ? ' והגיל' : '. מתחת לגיל 18? הוסף תאריך לידה בפרטים אישיים'} (התעריף מ-${U.fmtDate(L.from, 'short')}).</div>`;
  }
  RENDER.account ={ render: () => App.accountSection(), mount: (el, draw) => App.accountMount(el, draw) };
  RENDER.personal = {
    render: () => {
      const age = Engine.ageAt(S.settings.birthDate, U.todayKey());
      return `<div class="card">${F.text('שם (לא חובה)', 's.userName', S.settings.userName, 'מופיע בברכות ובחתימה של הודעות למעסיק.')}
        ${F.date('תאריך לידה (לא חובה)', 's.birthDate', S.settings.birthDate, 'לברכה ביום ההולדת, לשכר המינימום לפי גיל, לבדיקות חוק עבודת הנוער ולגיל הפנסיה.').replace('data-s=', 'data-redraw data-s=')}
        ${F.sel('מגדר (לא חובה)', 's.gender', [['', 'לא צוין'], ['m', 'גבר'], ['f', 'אישה']], S.settings.gender || '', 'רק לחישוב הפנסיה: חובת הפרשה מגיל 21 לגבר ומגיל 20 לאישה.')}</div>
        ${age != null ? `<div class="card ${age < 18 ? 'tonal' : ''}"><div class="kv"><span>גיל</span><b>${age}</b></div>
          ${age < 18 ? `<div class="small" style="margin-top:8px">${icon('info', 's')} מתחת לגיל 18 לא מנוכים מס הכנסה, ביטוח לאומי, מס בריאות ופנסיה, ולכן <b>הנטו שווה לברוטו</b> (פחות ניכויים אישיים כמו ארוחות, אם יש). מגיל 18 החישוב עובר אוטומטית לניכויים הרגילים.</div>` : ''}</div>` : ''}
        <div class="tiny muted" style="margin:6px 4px">תאריך הלידה נשמר בחשבון שלך ולא משותף עם אף אחד.</div>`;
    },
  };

  RENDER.roles = {
    render: () => `${S.employers.map((e) => `<div class="card"><div class="card-head">${icon('briefcase')}<h3>${esc(e.name)}</h3><button class="icon-btn" data-emp-edit="${e.id}" aria-label="ערוך מעסיק">${icon('edit', 's')}</button></div>
        <div class="list" style="background:var(--surface-2)">${S.roles.filter((r) => r.employerId === e.id && !r.archived).map((r) => `<button class="item" data-role-edit="${r.id}"><span class="lead" style="background:${r.color};color:#fff">${esc(r.name.slice(0, 1))}</span><span class="body"><span class="t">${esc(r.name)}</span><span class="s">${money(Engine.roleRate(r, U.todayKey()))} לשעה${r.rates.length > 1 ? ` · ${r.rates.length} תעריפים בהיסטוריה` : ''}</span></span>${icon('left', 's')}</button>`).join('')}</div>
        <button class="btn text sm" data-role-add="${e.id}">${icon('plus', 's')} הוסף תפקיד</button></div>`).join('')}
      <button class="btn tonal block" data-emp-add>${icon('plus')} הוסף מעסיק נוסף</button>
      <div class="tiny muted" style="margin:10px 4px">כל מעסיק מקבל חוקי חישוב, נסיעות ותקופת שכר משלו. ${S.roles.some((r) => r.archived) ? 'תפקידים בארכיון נשמרים בשביל משמרות עבר.' : ''}</div>`,
    mount: (el, draw) => {
      if (el._rolesBound) return;
      el._rolesBound = true;
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.roleEdit) roleEditor(b.dataset.roleEdit, draw);
        if (b.dataset.roleAdd) roleEditor(null, draw, b.dataset.roleAdd);
        if (b.hasAttribute('data-emp-add')) {
          const name = await UI.promptText('מעסיק חדש', 'שם המעסיק', '');
          if (!name) return;
          const emp = Object.assign(Defaults.defaultEmployer('emp_' + U.uid()), { name });
          await Store.put('employers', emp, 'הוספת מעסיק');
          draw();
        }
        if (b.dataset.empEdit) {
          const emp = App.employer(b.dataset.empEdit);
          const r = await UI.dialog({ title: emp.name, html: `<label class="field"><span class="lbl">שם המעסיק</span><input class="input" value="${esc(emp.name)}"></label>`, buttons: [...(S.employers.length > 1 ? [{ label: 'מחק', value: 'del', cls: 'danger' }] : []), { label: 'ביטול', value: null }, { label: 'שמור', value: 'input' }] });
          if (r === 'del') {
            if (S.shifts.some((x) => x.employerId === emp.id)) { UI.toast('יש משמרות של המעסיק — אי אפשר למחוק'); return; }
            if (!(await UI.confirm('למחוק את המעסיק?', 'התפקידים שלו יימחקו.', 'מחק', true))) return;
            await App.saveOps([{ store: 'employers', del: emp.id }, ...S.roles.filter((x) => x.employerId === emp.id).map((x) => ({ store: 'roles', del: x.id }))], 'מחיקת מעסיק');
          } else if (r) await Store.put('employers', Object.assign(Store.clone(emp), { name: r }));
          draw();
        }
      });
    },
  };
  function roleEditor(id, redrawParent, empId) {
    const orig = id ? App.role(id) : null;
    const used = new Set(S.roles.map((r) => r.color));
    const d = orig ? Store.clone(orig) : { id: 'r_' + U.uid(), name: '', color: Defaults.ROLE_COLORS.find((c) => !used.has(c)) || Defaults.ROLE_COLORS[0], employerId: empId || S.employers[0].id, rates: [{ from: '2000-01-01', rate: '' }], archived: false };
    let el = null;
    const body = () => {
      const rates = d.rates.slice().sort((a, b) => a.from.localeCompare(b.from));
      return `<label class="field"><span class="lbl">שם התפקיד</span><input class="input" id="re-name" value="${esc(d.name)}" placeholder="למשל: סדרן"></label>
        <div class="field"><span class="lbl">צבע</span><div class="color-pick">${Defaults.ROLE_COLORS.map((c) => `<button style="background:${c}" class="${d.color === c ? 'on' : ''}" data-color="${c}" aria-label="צבע"></button>`).join('')}</div></div>
        <div class="section-title">${icon('wallet', 's')} תעריפים לפי תאריך</div>
        <div class="tiny muted" style="margin:-4px 4px 10px">העלאת שכר? הוסף תעריף חדש מתאריך מסוים — משמרות קודמות לא ישתנו.</div>
        ${rates.map((r, i) => `<div class="grid2" style="align-items:end;margin-bottom:8px;grid-template-columns:1fr 1fr 40px">
          <label class="field" style="margin:0"><span class="lbl">${i === 0 ? 'מההתחלה' : 'החל מ-'}</span>${i === 0 ? '<div class="input" style="display:flex;align-items:center">—</div>' : `<input class="input" type="date" data-rf="${d.rates.indexOf(r)}" value="${r.from}">`}</label>
          <label class="field" style="margin:0"><span class="lbl">₪ לשעה</span><input class="input" type="number" step="any" inputmode="decimal" data-rr="${d.rates.indexOf(r)}" value="${r.rate}"></label>
          ${i > 0 ? `<button class="icon-btn" data-rdel="${d.rates.indexOf(r)}" aria-label="הסר">${icon('x')}</button>` : '<span></span>'}</div>`).join('')}
        <button class="btn text sm" data-radd>${icon('plus', 's')} העלאת שכר מתאריך</button>
        ${App.multiEmp() ? `<label class="field" style="margin-top:12px"><span class="lbl">מעסיק</span><select class="input" id="re-emp">${S.employers.map((e) => `<option value="${e.id}" ${e.id === d.employerId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>` : ''}`;
    };
    const read = () => {
      d.name = el.querySelector('#re-name').value.trim();
      el.querySelectorAll('[data-rr]').forEach((i) => (d.rates[+i.dataset.rr].rate = UI.numIn(i)));
      el.querySelectorAll('[data-rf]').forEach((i) => (d.rates[+i.dataset.rf].from = i.value));
      const em = el.querySelector('#re-emp'); if (em) d.employerId = em.value;
    };
    const redraw = () => { read(); el.querySelector('.sh-body').innerHTML = body(); };
    UI.openSheet({
      title: orig ? 'עריכת תפקיד' : 'תפקיד חדש', body: body(),
      foot: `${orig ? `<button class="btn danger" data-del style="flex:0 0 auto">${icon('trash')}</button>` : ''}<button class="btn" data-save>${icon('check')} שמור</button>`,
      onMount: (sh) => {
        el = sh;
        sh.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.color) { read(); d.color = b.dataset.color; redraw(); }
          if (b.hasAttribute('data-radd')) { read(); d.rates.push({ from: U.todayKey(), rate: d.rates[d.rates.length - 1].rate }); redraw(); }
          if (b.dataset.rdel) { read(); d.rates.splice(+b.dataset.rdel, 1); redraw(); }
          if (b.hasAttribute('data-save')) {
            read();
            if (!d.name) { UI.invalid('הזן שם'); return; }
            if (d.rates.some((r) => !(r.rate > 0))) { UI.invalid('הזן תעריף לשעה'); return; }
            UI.closeTop();
            await App.saveOps([{ store: 'roles', put: d }], orig ? 'עריכת תפקיד' : 'הוספת תפקיד', 'התפקיד נשמר');
            redrawParent();
          }
          if (b.hasAttribute('data-del')) {
            const usedBy = S.shifts.filter((s) => s.roleId === d.id || (s.splits || []).some((x) => x.roleId === d.id)).length;
            if (usedBy) {
              if (!(await UI.confirm('להעביר לארכיון?', `יש ${usedBy} משמרות בתפקיד הזה. הוא יוסתר מהבחירה אבל המשמרות יישמרו.`, 'העבר לארכיון'))) return;
              UI.closeTop();
              await App.saveOps([{ store: 'roles', put: Object.assign(d, { archived: true }) }], 'ארכוב תפקיד');
            } else {
              if (!(await UI.confirm('למחוק את התפקיד?', '', 'מחק', true))) return;
              UI.closeTop();
              await App.saveOps([{ store: 'roles', del: d.id }], 'מחיקת תפקיד', 'התפקיד נמחק');
            }
            redrawParent();
          }
        });
      },
    });
  }

  RENDER.calc = {
    perEmployer: true,
    render: (e) => `
      <div class="section-title">${icon('clock', 's')} שעות נוספות</div><div class="card">
        ${F.num('שעות רגילות ביום', 'e.otThreshold', e.otThreshold, 'אחריהן מתחילות שעות נוספות. חוק: 8.6 בשבוע של 5 ימים, 8 בשבוע של 6 ימים.')}
        <div class="grid3">${F.num('שעות בדרגה 1', 'e.otTier1Hours', e.otTier1Hours)}${F.num('אחוז דרגה 1', 'e.otTier1Pct', e.otTier1Pct)}${F.num('אחוז דרגה 2', 'e.otTier2Pct', e.otTier2Pct)}</div>
        ${F.sel('ספירה', 'e.otMode', [['daily', 'ליום עבודה (כל המשמרות שמתחילות באותו יום)'], ['shift', 'לכל משמרת בנפרד']], e.otMode)}
        ${F.sw('משמרת לילה = יום קצר', 'משמרת שלפחות שעתיים ממנה בין 22:00 ל-06:00', 'e.nightShiftShortDay', e.nightShiftShortDay)}
        ${e.nightShiftShortDay ? F.num('שעות רגילות במשמרת לילה', 'e.nightShiftThreshold', e.nightShiftThreshold) : ''}</div>
      <div class="section-title">${icon('candle', 's')} שבת וחג</div><div class="card">
        <div class="grid3">${F.num('שבת/חג %', 'e.restPct', e.restPct)}${F.num('+ נוספות דרגה 1', 'e.restOt1Pct', e.restOt1Pct)}${F.num('+ נוספות דרגה 2', 'e.restOt2Pct', e.restOt2Pct)}</div>
        ${F.num('תוספת ערב שבת/חג %', 'e.evePct', e.evePct, '0 = ללא. השעות שבהן חלה התוספת מוגדרות במסך "שבת וחגים".')}</div>
      <div class="section-title">${icon('moon', 's')} תוספת לילה</div><div class="card">
        ${F.sw('תוספת לילה', 'לפי ההסכם אצל המעסיק', 'e.nightEnabled', e.nightEnabled).replace('data-s=', 'data-redraw data-s=')}
        ${e.nightEnabled ? `<div class="grid2">${F.time('משעה', 'e.nightFrom', e.nightFrom)}${F.time('עד שעה', 'e.nightTo', e.nightTo)}</div>
          <div class="grid2">${F.sel('סוג', 'e.nightType', [['pct', 'אחוז מהתעריף'], ['fixed', '₪ לשעה']], e.nightType)}${F.num('ערך', 'e.nightValue', e.nightValue)}</div>` : ''}</div>
      <div class="section-title">${icon('up', 's')} תוספת ותק</div><div class="card">
        ${F.sw('תוספת ותק', 'מחושבת מתאריך תחילת העבודה', 'e.seniorityEnabled', e.seniorityEnabled).replace('data-s=', 'data-redraw data-s=')}
        ${e.seniorityEnabled ? `${F.sel('סוג', 'e.seniorityType', [['pctPerYear', '% מהתעריף לכל שנת ותק'], ['fixedPerHour', '₪ קבוע לשעה']], e.seniorityType)}
          <div class="grid3">${F.num('ערך', 'e.seniorityValue', e.seniorityValue)}${F.num('החל מחודש', 'e.seniorityAfterMonths', e.seniorityAfterMonths)}${F.num('תקרה %', 'e.seniorityCapPct', e.seniorityCapPct, '', 'ללא')}</div>` : ''}</div>
      <div class="section-title">${icon('refresh', 's')} עיגול, מינימום והפסקות</div><div class="card">
        <div class="grid2">${F.sel('עיגול זמן משמרת', 'e.roundingMode', [['none', 'ללא'], ['nearest', 'לקרוב'], ['up', 'למעלה'], ['down', 'למטה']], e.roundingMode)}${F.sel('יחידה', 'e.roundingUnit', [[5, '5 דק׳'], [6, '6 דק׳'], [10, '10 דק׳'], [15, 'רבע שעה'], [30, 'חצי שעה']], e.roundingUnit)}</div>
        ${F.num('מינימום שעות לתשלום במשמרת', 'e.minShiftHours', e.minShiftHours, '0 = ללא. למשל 4: גם אם שוחררת אחרי שעתיים, תקבל 4.')}
        <div class="grid2">${F.num('הפסקה ברירת מחדל (דק׳)', 'e.defaultBreakMin', e.defaultBreakMin)}${F.sel('הפסקה', 'e.defaultBreakPaid', [['true', 'בתשלום'], ['false', 'ללא תשלום']], String(e.defaultBreakPaid))}</div></div>`,
  };

  RENDER.rest = {
    render: () => {
      const R = S.settings.rest;
      const cfg = App.model.ctx.restCfg;
      const wins = HebCal.restWindows(U.todayKey(), U.addDays(U.todayKey(), 45), cfg).filter((w) => w.end > Date.now()).slice(0, 6);
      return `<div class="seg" style="margin-bottom:14px"><button data-rmode="city" class="${R.mode === 'city' ? 'on' : ''}">לפי עיר (כניסה/יציאה)</button><button data-rmode="fixed" class="${R.mode === 'fixed' ? 'on' : ''}">שעות קבועות</button></div>
        ${R.mode === 'city' ? `<div class="card">
          ${F.sel('עיר', 's.rest.city', [...HebCal.CITIES.map((c) => [c.name, c.name]), ['__custom', 'מיקום מותאם (קו רוחב/אורך)']], R.city).replace('data-s=', 'data-redraw data-keep-str data-s=')}
          ${R.city === '__custom' ? `<div class="grid2">${F.num('קו רוחב', 's.rest.lat', R.lat)}${F.num('קו אורך', 's.rest.lon', R.lon)}</div>` : ''}
          ${F.num('הדלקת נרות — דקות לפני השקיעה', 's.rest.candleMin', R.candleMin, 'ריק = ברירת המחדל של העיר (ירושלים 40, חיפה 30, אחרות 18)', String(HebCal.locationOf(R).candle))}
          ${F.sel('יציאת שבת/חג', 's.rest.exitMode', [['tzeit', 'צאת הכוכבים (השמש 8.5° מתחת לאופק)'], ['minutes', 'מספר דקות אחרי השקיעה']], R.exitMode).replace('data-s=', 'data-redraw data-s=')}
          ${R.exitMode === 'minutes' ? F.num('דקות אחרי השקיעה', 's.rest.exitMinutes', R.exitMinutes) : ''}
          <div class="grid2">${F.num('הזזת כניסה (דק׳)', 's.rest.startOffsetMin', R.startOffsetMin, 'שלילי = מוקדם יותר')}${F.num('הזזת יציאה (דק׳)', 's.rest.endOffsetMin', R.endOffsetMin, 'חיובי = מאוחר יותר')}</div></div>`
        : `<div class="card"><div class="grid2">${F.time('כניסה (בערב שבת/חג)', 's.rest.fixedStart', R.fixedStart)}${F.time('יציאה (ביום המנוחה)', 's.rest.fixedEnd', R.fixedEnd)}</div><div class="tiny muted">למשל מעסיק שמגדיר שבת משישי 16:00 עד שבת 20:00.</div></div>`}
        <div class="section-title">${icon('calendar', 's')} חלונות קרובים</div>
        <div class="card">${wins.map((w) => `<div class="kv"><span>${esc(w.label)}</span><span class="num small">${U.fmtDate(U.epochKey(w.start), 'short')} ${U.epochHM(w.start)} → ${U.fmtDate(U.epochKey(w.end), 'short')} ${U.epochHM(w.end)}</span></div>`).join('') || '<div class="muted small">—</div>'}</div>
        <div class="section-title">${icon('flag', 's')} ימים שנחשבים יום מנוחה</div>
        <div class="card">${F.sw('שבת', '', 's.rest.shabbat', R.shabbat !== false)}${HOLS.map((h) => F.sw(h.name, '', 's.rest.holidays.' + h.id, R.holidays[h.id] !== false)).join('')}
          <div class="tiny muted">חגי ישראל מזוהים אוטומטית לפי הלוח העברי (חישוב מקומי). כל יום מנוחה מתחיל בערבו — כמו יום שישי.</div></div>
        <div class="section-title">${icon('sun', 's')} תוספת ערב שבת/חג</div>
        <div class="card">${F.sw('ביום שישי', '', 's.rest.eveFriday', R.eveFriday)}${F.sw('בערב חג', '', 's.rest.eveHoliday', R.eveHoliday)}${F.time('החל משעה', 's.rest.eveFrom', R.eveFrom)}
          <div class="tiny muted">האחוז מוגדר ב"חוקי חישוב". חל מהשעה הזו ועד כניסת השבת/החג.</div></div>
        <div class="section-title">${icon('hand', 's')} כללי יום ידניים</div>
        <div class="card">${S.dayRules.length ? S.dayRules.slice().sort((a, b) => b.date.localeCompare(a.date)).map((r) => `<div class="kv"><span>${U.fmtDate(r.date)} · ${r.type === 'cancel' ? 'ביטול 150%' : 'יום מנוחה ידני'}${r.reason ? ' — ' + esc(r.reason) : ''}</span><button class="btn text sm" data-rule-del="${r.id}">מחק</button></div>`).join('') : '<div class="muted small">אין. אפשר לבטל 150% לתאריך (למשל חג שזוהה בטעות) מתוך לוח השנה ← לחיצה על היום.</div>'}</div>`;
    },
    mount: (el, draw) => {
      if (el._restBound) return;
      el._restBound = true;
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.rmode) { await Store.setSettings((s) => { s.rest.mode = b.dataset.rmode; }); draw(); }
        if (b.dataset.ruleDel) { await App.saveOps([{ store: 'dayRules', del: b.dataset.ruleDel }], 'מחיקת כלל יום'); draw(); }
      });
    },
  };

  RENDER.pay = {
    perEmployer: true,
    render: (e) => `<div class="section-title">${icon('car', 's')} נסיעות</div><div class="card">
        ${F.num('סכום ליום עבודה ₪', 'e.travelPerDay', e.travelPerDay, 'ברירת מחדל: 22.60 ₪ — התקרה היומית לפי צו ההרחבה (2025).')}
        ${F.num('תקרה חודשית ₪', 'e.travelMonthlyCap', e.travelMonthlyCap, '0 = ללא תקרה. למשל מחיר חופשי-חודשי.')}
        <div class="tiny muted">אפשר לסמן משמרת ספציפית "בלי נסיעות" בעריכת המשמרת.</div></div>
      <div class="section-title">${icon('calendar', 's')} תקופת שכר</div><div class="card">
        ${F.sel('התקופה מתחילה ב-', 'e.periodStartDay', [[1, '1 לחודש (חודש קלנדרי)'], ...Array.from({ length: 27 }, (_, i) => [i + 2, (i + 2) + ' לחודש'])], e.periodStartDay, 'אם המעסיק סופר למשל מ-21 עד 20 — בחר 21.')}
        ${F.num('יום התשלום (בחודש שאחרי)', 'e.payDay', e.payDay, 'לפי החוק — עד ה-9 לחודש.')}</div>`,
  };

  RENDER.net = {
    render: () => {
      const T = S.settings.tax, P = S.settings.pension, Hs = S.settings.hishtalmut;
      return `<div class="banner">${icon('info')}<div>הנטו הוא הערכה. ערכי ברירת המחדל לפי 2025–2026 (מדרגות המס הוקפאו עד 2027). עדכן אם השתנו.</div></div>
        <div class="section-title">מס הכנסה</div><div class="card">
          ${F.num('נקודות זיכוי', 's.tax.creditPoints', T.creditPoints, 'תושב/ת: 2.25 · אישה: 2.75 · נוספות על ילדים, תואר, שחרור מצבא, עולה חדש ועוד.')}
          ${F.num('שווי נקודת זיכוי לחודש ₪', 's.tax.creditPointValue', T.creditPointValue)}
          <div class="tiny muted" style="margin:6px 4px">מדרגות מס חודשיות:</div>
          ${T.brackets.map((b, i) => `<div class="grid2">${F.num(i === T.brackets.length - 1 ? 'מעל' : 'עד ₪', 's.tax.brackets.' + i + '.0', b[0] === Infinity || b[0] == null ? '' : b[0], '', '∞')}${F.num('%', 's.tax.brackets.' + i + '.1', b[1])}</div>`).join('')}</div>
        <div class="section-title">ביטוח לאומי ומס בריאות</div><div class="card">
          ${F.num('סף שיעור מופחת ₪ (60% מהשכר הממוצע)', 's.tax.blReducedThreshold', T.blReducedThreshold)}
          <div class="grid2">${F.num('ב״ל מופחת %', 's.tax.blReducedPct', T.blReducedPct)}${F.num('ב״ל מלא %', 's.tax.blFullPct', T.blFullPct)}</div>
          <div class="grid2">${F.num('בריאות מופחת %', 's.tax.healthReducedPct', T.healthReducedPct)}${F.num('בריאות מלא %', 's.tax.healthFullPct', T.healthFullPct)}</div>
          ${F.num('תקרה ₪', 's.tax.blCeiling', T.blCeiling)}</div>
        <div class="section-title">פנסיה</div><div class="card">
          ${F.sw('פנסיה חובה', '', 's.pension.enabled', P.enabled)}
          <div class="grid3">${F.num('עובד %', 's.pension.employeePct', P.employeePct)}${F.num('מעסיק %', 's.pension.employerPct', P.employerPct)}${F.num('פיצויים %', 's.pension.severancePct', P.severancePct)}</div>
          ${F.num('מתחילה אחרי (חודשים)', 's.pension.startAfterMonths', P.startAfterMonths, 'ללא קרן קודמת: 6 חודשים. עם קרן פעילה: 3 חודשים.')}
          ${F.sel('בסיס לחישוב', 's.pension.base', [['base', 'שכר יסוד (שעות × תעריף, בלי תוספות)'], ['all', 'כל השכר חוץ מנסיעות']], P.base)}</div>
        <div class="section-title">קרן השתלמות</div><div class="card">
          ${F.sw('יש קרן השתלמות', '', 's.hishtalmut.enabled', Hs.enabled).replace('data-s=', 'data-redraw data-s=')}
          ${Hs.enabled ? `<div class="grid3">${F.num('עובד %', 's.hishtalmut.employeePct', Hs.employeePct)}${F.num('מעסיק %', 's.hishtalmut.employerPct', Hs.employerPct)}${F.num('אחרי חודשים', 's.hishtalmut.startAfterMonths', Hs.startAfterMonths)}</div>` : ''}</div>
        <div class="section-title">שכר מינימום</div><div class="card">${minWageInfo()}
          ${F.num('לעקוף ידנית (₪ לשעה)', 's.minWageHourly', S.settings.minWageHourly || '', 'השאר ריק כדי להשתמש בשכר המינימום לפי החוק.')}</div>`;
    },
  };
  RENDER.leave = {
    render: () => {
      const L = S.settings.leave;
      const B = Engine.leaveBalances(App.model, U.todayKey());
      return `<div class="card">${F.date('תאריך תחילת עבודה', 's.startDate', S.settings.startDate, 'משמש לוותק, הבראה, ימי חופשה ותחילת הפרשות לפנסיה.')}</div>
        ${S.settings.startDate ? `<div class="card tonal"><div class="kpis">
          <div class="kpi"><div class="l">ותק</div><div class="v">${U.num(B.seniorityYears, 1)} שנים</div></div>
          <div class="kpi"><div class="l">היקף משרה (12 ח׳)</div><div class="v">${U.num(B.jobPct * 100, 0)}%</div></div>
          <div class="kpi"><div class="l">יתרת חופשה</div><div class="v">${U.num(B.vacationAccrued - B.vacationUsed, 1)}</div><div class="d">צבירה ${U.num(B.vacationAccrued, 1)} · ניצול ${B.vacationUsed}</div></div>
          <div class="kpi"><div class="l">יתרת מחלה</div><div class="v">${U.num(B.sickAccrued - B.sickUsed, 1)}</div><div class="d">צבירה ${U.num(B.sickAccrued, 1)} · ניצול ${B.sickUsed}</div></div></div>
          <div class="small" style="margin-top:10px">${B.recuperation && B.recuperation.eligible ? `דמי הבראה לשנה: ${B.recuperation.days} ימים × ${U.money(B.recuperation.rate, 0)} × ${U.num(B.jobPct * 100, 0)}% ≈ <b>${U.money(B.recuperation.amount, 0)}</b>` : `דמי הבראה מגיעים אחרי שנת עבודה (מ-${B.recuperation ? U.fmtDate(B.recuperation.eligibleFrom) : '—'}).`}</div>
          <div class="tiny" style="opacity:.8;margin-top:6px">הערכה לפי השעות שרשמת. היקף משרה = שעות חודשיות ÷ ${L.fullTimeHours}.</div></div>` : ''}
        <div class="section-title">חופשה</div><div class="card">
          ${F.sel('שבוע עבודה', 's.leave.workWeek', [[5, '5 ימים'], [6, '6 ימים']], L.workWeek, '5 ימים: 12 ימי חופשה בשנים 1–5; 6 ימים: 14 (לפי היקף משרה).')}
          <div class="grid2">${F.num('יתרת פתיחה — חופשה', 's.leave.vacationOpening', L.vacationOpening)}${F.num('יתרת פתיחה — מחלה', 's.leave.sickOpening', L.sickOpening)}</div>
          ${F.date('יתרות הפתיחה נכונות לתאריך', 's.leave.vacationOpeningDate', L.vacationOpeningDate, 'אם הזנת יתרה מתלוש — התאריך של התלוש. הצבירה תחושב מכאן.')}
          ${F.num('שעות חודשיות למשרה מלאה', 's.leave.fullTimeHours', L.fullTimeHours)}</div>
        <div class="section-title">שווי יום חופשה / מחלה</div><div class="card">
          ${F.sel('חישוב', 's.leave.dayValueMode', [['auto', 'אוטומטי — ממוצע יומי ב-90 הימים האחרונים'], ['hours', 'מספר שעות × תעריף'], ['fixed', 'סכום קבוע']], L.dayValueMode).replace('data-s=', 'data-redraw data-s=')}
          ${L.dayValueMode === 'hours' ? F.num('שעות ליום', 's.leave.dayHours', L.dayHours) : ''}${L.dayValueMode === 'fixed' ? F.num('סכום ליום ₪', 's.leave.dayFixed', L.dayFixed) : ''}
          <div class="grid2">${[0, 1, 2, 3].map((i) => F.num(['מחלה יום 1 %', 'יום 2 %', 'יום 3 %', 'מהיום ה-4 %'][i], 's.leave.sickPct.' + i, L.sickPct[i])).join('')}</div></div>
        <div class="section-title">הבראה</div><div class="card">
          ${F.num('תעריף ליום הבראה ₪', 's.leave.recuperationRate', L.recuperationRate, 'מגזר פרטי: 418 ₪.')}
          ${F.sel('חודש תשלום', 's.leave.recuperationMonth', [[0, 'בכל חודש (חלק יחסי)'], ...U.HEB_MONTHS.map((m, i) => [i + 1, m])], L.recuperationMonth)}</div>`;
    },
  };

  RENDER.goal = {
    render: () => `<div class="card">${F.num('יעד חודשי ₪', 's.goal.amount', S.settings.goal.amount || '', '0 = ללא יעד')}${F.sel('סוג היעד', 's.goal.type', [['gross', 'ברוטו'], ['net', 'נטו משוער']], S.settings.goal.type)}
      <div class="tiny muted">במסך הבית יופיע פס התקדמות, צפי לפי הקצב, וכמה משמרות חסרות ליעד.</div></div>`,
  };

  RENDER.alerts = {
    render: () => {
      const A = S.settings.alerts;
      const perm = 'Notification' in window ? Notification.permission : 'unsupported';
      const t = (k, l) => F.sw(l, '', 's.alerts.types.' + k, A.types[k] !== false);
      return `<div class="card">${F.sw('התראות פוש בטלפון', perm === 'granted' ? 'מאושר' : perm === 'denied' ? (App.androidApp ? 'חסום — יש לאשר בהגדרות הטלפון › אפליקציות › Shaati › התראות' : 'חסום — יש לאשר בהגדרות האתר ב-Chrome') : 'דורש אישור', 's.alerts.push', A.push)}
          ${perm !== 'granted' && perm !== 'unsupported' ? `<button class="btn tonal block" data-perm>${icon('bell')} אשר התראות</button>` : ''}
          ${perm === 'granted' ? `<button class="btn text sm" data-test>${icon('send', 's')} שלח התראת בדיקה</button>` : ''}
          <div class="tiny muted" style="margin-top:6px">לכל היותר התראת חריגה אחת ביום. תזכורות (טיימר, משמרת קרובה, תשלום) נשלחות בנפרד. כשהאפליקציה סגורה, Chrome בודק מדי פעם (לא מדויק לדקה) — לתזכורת מדויקת לפני משמרת, ייצא אותה ליומן.</div></div>
        <div class="section-title">חריגות מהממוצע</div><div class="card">
          <div class="grid3">${F.num('סף %', 's.alerts.deviationPct', A.deviationPct)}${F.num('שבועות להשוואה', 's.alerts.compareWeeks', A.compareWeeks)}${F.num('חודשים להשוואה', 's.alerts.compareMonths', A.compareMonths)}</div>
          ${F.num('מינימום שבועות נתונים', 's.alerts.minWeeksData', A.minWeeksData)}
          ${t('hours', 'שעות')}${t('shifts', 'מספר משמרות')}${t('roles', 'חלוקה בין תפקידים')}${t('rest', 'שעות שבת וחג')}${t('overtime', 'שעות נוספות')}${t('hourly', 'ירידה בשכר לשעה')}${t('shiftLength', 'אורך משמרות')}${t('pattern', 'דפוס שעות (לילה)')}</div>
        <div class="section-title">בריאות ועומס</div><div class="card">
          <div class="grid2">${F.num('משמרת ארוכה מ- (ש׳)', 's.alerts.longShiftHours', A.longShiftHours)}${F.num('מנוחה מינימלית (ש׳)', 's.alerts.minRestHours', A.minRestHours)}</div>
          <div class="grid2">${F.num('ימים ברצף', 's.alerts.streakDays', A.streakDays)}${F.num('שעות בשבוע מעל', 's.alerts.weekHoursMax', A.weekHoursMax)}</div>
          ${t('long', 'משמרת ארוכה')}${t('rest8', 'מנוחה קצרה בין משמרות')}${t('streak', 'ימים ברצף')}${t('weekHours', 'שבוע עמוס')}${t('youth', 'חוק עבודת הנוער (מתחת לגיל 18)')}</div>
        <div class="section-title">כסף ויעדים</div><div class="card">${t('projection', 'צפי סוף חודש')}${t('goal', 'יעד חודשי')}${t('goalShifts', 'משמרות חסרות ליעד')}${t('record', 'שיא אישי')}${t('payslipGap', 'פערים בתלוש')}${t('travel', 'תקרת נסיעות')}${t('recuperation', 'דמי הבראה')}${t('minwage', 'תעריף נמוך משכר המינימום')}</div>
        <div class="section-title">תזכורות ותקינות</div><div class="card">
          <div class="grid2">${F.num('טיימר פעיל יותר מ- (ש׳)', 's.alerts.timerHours', A.timerHours)}${F.num('בלי משמרות (ימים)', 's.alerts.idleDays', A.idleDays)}</div>
          <div class="grid2">${F.num('משמרת חשודה מעל (ש׳)', 's.alerts.suspiciousHours', A.suspiciousHours)}${F.num('תזכורת גיבוי (ימים)', 's.alerts.backupDays', A.backupDays)}</div>
          ${F.num('תזכורת לפני משמרת (דק׳)', 's.alerts.upcomingMin', A.upcomingMin)}
          ${t('timer', 'שכחתי לסיים משמרת')}${t('plannedPast', 'משמרת מתוכננת שעברה')}${t('idle', 'לא נרשמה משמרת')}${t('suspicious', 'משמרות חופפות / נתון חשוד')}${t('payslipDue', 'הזנת תלוש ביום התשלום')}${t('backup', 'גיבוי')}${t('upcoming', 'לפני משמרת מתוכננת')}</div>
        <div class="section-title">סיכום שבועי</div><div class="card">${t('weekly', 'סיכום שבועי אוטומטי')}
          <div class="grid2">${F.sel('ביום', 's.alerts.weeklyDay', U.HEB_DAYS.map((d, i) => [i, d]), A.weeklyDay)}${F.num('בשעה', 's.alerts.weeklyHour', A.weeklyHour)}</div></div>`;
    },
    mount: (el, draw) => {
      const p = el.querySelector('[data-perm]');
      if (p) p.onclick = async () => { await Notification.requestPermission(); draw(); };
      const t = el.querySelector('[data-test]');
      if (t) t.onclick = async () => { const reg = await navigator.serviceWorker.getRegistration(); const o = { body: 'ההתראות עובדות 👍', icon: 'icon-192.png', lang: 'he', dir: 'rtl' }; if (reg) reg.showNotification('מעקב משמרות', o); else new Notification('מעקב משמרות', o); };
    },
  };

  RENDER.templates = {
    render: () => `${S.templates.length ? `<div class="list">${S.templates.map((t) => `<div class="item" style="cursor:default"><span class="role-bar" style="background:${(App.role(t.roleId) || {}).color || '#999'}"></span><span class="body"><span class="t">${esc(t.name)}</span><span class="s">${esc(App.roleName(t.roleId))} · <span class="num">⁦${t.startT}–${t.endT}⁩</span>${t.breakMin ? ` · הפסקה ${t.breakMin}` : ''}</span></span><button class="icon-btn" data-tdel="${t.id}" aria-label="מחק">${icon('trash', 's')}</button></div>`).join('')}</div>`
      : UI.emptyState('layers', 'אין תבניות', 'פתח משמרת ← "שמור כתבנית". אחר כך תוכל להוסיף אותה בלחיצה מכפתור ה-+.')}`,
    mount: (el, draw) => el.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = async () => { await App.saveOps([{ store: 'templates', del: b.dataset.tdel }], 'מחיקת תבנית', 'התבנית נמחקה'); draw(); })),
  };

  RENDER.look = {
    render: () => `<div class="section-title">ערכת צבעים</div><div class="seg" style="margin-bottom:14px">${[['system', 'לפי המערכת'], ['light', 'בהיר'], ['dark', 'כהה']].map(([k, l]) => `<button data-theme="${k}" class="${S.settings.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="section-title">צבע הדגשה</div><div class="color-pick" style="margin-bottom:16px">${Object.entries(App.ACCENTS).map(([k, a]) => `<button data-accent="${k}" class="${S.settings.accent === k ? 'on' : ''}" style="background:hsl(${a[0]} ${a[1]}% 45%)" aria-label="${a[2]}"></button>`).join('')}</div>
      <div class="section-title">גופן</div>
      <div class="font-pick">${Object.entries(App.FONTS).map(([k, f]) => `<button data-font="${k}" class="${(S.settings.font || 'rubik') === k ? 'on' : ''}" style="font-family:'${f[0]}', system-ui, sans-serif"><span class="fp-sample">משמרת ערב · ${esc(f[2])}<small>${f[0]}</small></span><span class="fp-num">₪1,240</span></button>`).join('')}</div>
      <div class="section-title">גודל טקסט</div><div class="seg">${[[0.9, 'קטן'], [1, 'רגיל'], [1.1, 'גדול'], [1.2, 'גדול מאוד']].map(([k, l]) => `<button data-fs="${k}" class="${+S.settings.fontScale === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="section-title" style="margin-top:16px">אפקטים וצלילים</div>
      <div class="card">${F.sw('אנימציות ואפקטים', 'הבזק קטן בכל לחיצה, כפתורים קופצניים וקונפטי כשמסיימים משמרת', 's.fx.effects', (S.settings.fx || {}).effects !== false)}
        ${F.sw('צלילים', 'צליל קצר ועדין בלחיצה, ו"קופה" כשנשמרת משמרת', 's.fx.sound', (S.settings.fx || {}).sound !== false)}
        ${F.sw('רטט', 'רטט קל בלחיצה', 's.fx.haptic', (S.settings.fx || {}).haptic !== false)}
        <button class="btn tonal sm" data-fx-try style="margin-top:8px">${icon('sparkle', 's')} נסה</button>
        <div class="tiny muted" style="margin-top:8px">כשבטלפון מופעלת "הפחתת אנימציות", האנימציות כבויות גם כאן. עוצמת הצלילים לפי עוצמת המדיה.</div></div>`,
    mount: (el, draw) => {
      // load every family once so the previews show the real fonts
      for (const k of Object.keys(App.FONTS)) {
        if (document.querySelector(`link[data-preview="${k}"]`)) continue;
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = App.fontCss(k); l.dataset.preview = k; document.head.appendChild(l);
      }
      if (el._lookBound) return;
      el._lookBound = true;
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.theme) await root.Fx.reveal(e.clientX, e.clientY, async () => { await Store.setSettings((s) => { s.theme = b.dataset.theme; }); draw(); });
        else if (b.dataset.accent) await root.Fx.reveal(e.clientX, e.clientY, async () => { await Store.setSettings((s) => { s.accent = b.dataset.accent; }); draw(); });
        else if (b.dataset.fs) await Store.setSettings((s) => { s.fontScale = +b.dataset.fs; });
        else if (b.dataset.font) await Store.setSettings((s) => { s.font = b.dataset.font; });
        else if (b.hasAttribute('data-fx-try')) { root.Fx.celebrate('big'); return; }
        else return;
        draw();
      });
    },
  };

  RENDER.security = {
    render: () => `<div class="card">${S.settings.lock.enabled
      ? `<div class="banner">${icon('lock')}<div>הנעילה מופעלת. האפליקציה תינעל כשתחזור אליה אחרי ${S.settings.lock.timeoutMin} דק׳.</div></div>
        ${F.sel('נעל אחרי', 's.lock.timeoutMin', [[0, 'מיד'], [1, 'דקה'], [5, '5 דקות'], [15, '15 דקות']], S.settings.lock.timeoutMin)}
        <div data-bio-row></div>
        <div class="btn-row"><button class="btn tonal" data-pin-set>שנה קוד</button><button class="btn danger" data-pin-off>בטל נעילה</button></div>`
      : `<div class="small" style="margin-bottom:12px">קוד בן 4–8 ספרות שיידרש בכל פתיחה. הקוד נשמר כגיבוב (hash) — לא כטקסט.</div><button class="btn block" data-pin-set>${icon('lock')} הגדר קוד</button>`}
      <div class="tiny muted" style="margin-top:10px">הנעילה מגינה מפני הצצה; הנתונים עצמם לא מוצפנים. שכחת את הקוד? אין שחזור — אפשר רק למחוק את נתוני האתר ולשחזר מגיבוי.</div></div>`,
    mount: (el, draw) => {
      const set = el.querySelector('[data-pin-set]');
      if (set) set.onclick = async () => {
        const p1 = await UI.promptText('קוד חדש', '4–8 ספרות', '', { type: 'password', inputmode: 'numeric', ltr: true, ok: 'המשך' });
        if (!p1) return;
        if (!/^\d{4,8}$/.test(p1)) { UI.invalid('הקוד צריך להיות 4–8 ספרות'); return; }
        const p2 = await UI.promptText('אימות', 'הזן שוב את הקוד', '', { type: 'password', inputmode: 'numeric', ltr: true, ok: 'שמור' });
        if (p1 !== p2) { UI.invalid('הקודים לא תואמים'); return; }
        const salt = U.uid();
        const hash = await App.hashPin(p1, salt);
        await Store.setSettings((s) => { s.lock = Object.assign(s.lock, { enabled: true, hash, salt, len: p1.length }); });
        UI.toast('הנעילה הופעלה'); draw();
      };
      const off = el.querySelector('[data-pin-off]');
      if (off) off.onclick = async () => { if (await UI.confirm('לבטל את הנעילה?', '', 'בטל נעילה')) { await Store.setSettings((s) => { s.lock.enabled = false; s.lock.hash = null; s.lock.bioId = null; }); draw(); } };
      const row = el.querySelector('[data-bio-row]');
      if (row) App.bio.available().then((ok) => {
        if (!ok) return;
        const on = !!S.settings.lock.bioId;
        row.innerHTML = `<div class="kv" style="margin:6px 0 10px"><span>${icon('hand', 's')} פתיחה בטביעת אצבע / זיהוי פנים</span><button class="btn ${on ? 'text' : 'tonal'} sm" data-bio-toggle>${on ? 'כבה' : 'הפעל'}</button></div>`;
        row.querySelector('[data-bio-toggle]').onclick = async () => {
          if (on) { await Store.setSettings((s) => { s.lock.bioId = null; }); draw(); return; }
          try {
            const id = await App.bio.enroll();
            await Store.setSettings((s) => { s.lock.bioId = id; });
            UI.toast('מעכשיו אפשר לפתוח בטביעת אצבע');
          } catch (e) { UI.toast(e && e.name === 'NotAllowedError' ? 'בוטל' : 'הטלפון לא תומך בזה'); }
          draw();
        };
      });
    },
  };

  RENDER.ai = {
    render: () => `<div class="banner">${icon('shield')}<div>אופציונלי. בלי מפתח — קריאת התלוש והניתוח רצים רק בטלפון. עם מפתח — אפשר לבקש ניתוח חכם לתלושים בפורמט מורכב. לפני כל שליחה מוסתרים ת״ז, פרטי בנק וכתובת, ותראה ותאשר בדיוק מה נשלח.</div></div>
      <div class="card">${F.text('מפתח API של Claude', 's.ai.apiKey', S.settings.ai.apiKey, 'נוצר ב-console.anthropic.com. נשמר רק בטלפון ולא נכלל בקובצי גיבוי.', 'type="password" autocomplete="off" dir="ltr"')}
        ${F.sel('מודל', 's.ai.model', [['claude-opus-5-5', 'Claude Opus 5.5 (מומלץ)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (זול יותר)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (הכי זול)']], S.settings.ai.model).replace('data-s=', 'data-keep-str data-s=')}
        ${S.settings.ai.apiKey ? `<button class="btn danger block" data-ai-clear>${icon('trash')} מחק את המפתח</button>` : ''}</div>
      <div class="tiny muted" style="margin:6px 4px">השימוש מחויב בחשבון ה-API שלך אצל Anthropic. הניתוח הוא כלי עזר ואינו ייעוץ משפטי או חשבונאי.</div>`,
    mount: (el, draw) => { const c = el.querySelector('[data-ai-clear]'); if (c) c.onclick = async () => { await Store.setSettings((s) => { s.ai.apiKey = ''; }); draw(); }; },
  };

  RENDER.backup = {
    render: () => {
      const B = S.settings.backup;
      return `<div class="banner warn">${icon('cloud')}<div>הנתונים שמורים רק בטלפון הזה. שמור גיבוי ב-Google Drive כדי לא לאבד אותם אם הטלפון יוחלף או יאופס.</div></div>
        <div class="card"><div class="small">גיבוי אחרון: <b>${B.lastBackup ? U.fmtDate(U.epochKey(B.lastBackup)) + ' (' + UI.timeAgo(B.lastBackup) + ')' : 'אף פעם'}</b></div>
          <div class="btn-row" style="margin-top:12px"><button class="btn" data-bk="share">${icon('share')} גבה ושתף ל-Drive</button></div>
          <div class="btn-row" style="margin-top:8px"><button class="btn tonal" data-bk="dl">${icon('download')} הורד קובץ</button><button class="btn tonal" data-bk="files">${icon('file')} כולל קובצי תלושים</button></div></div>
        <div class="card">${F.sel('גיבוי אוטומטי', 's.backup.autoEvery', [['weekly', 'כל שבוע'], ['monthly', 'כל חודש'], ['off', 'כבוי']], B.autoEvery, 'בפתיחת האפליקציה, כשהגיע הזמן, קובץ גיבוי יורד אוטומטית לתיקיית ההורדות.').replace('data-s=', 'data-keep-str data-s=')}</div>
        <div class="section-title">${icon('upload', 's')} שחזור</div>
        <div class="card"><label class="btn tonal block">${icon('upload')} בחר קובץ גיבוי (.json)<input type="file" accept="application/json,.json" id="bk-file" hidden></label>
          <div class="tiny muted" style="margin-top:8px">אפשר להחליף את כל הנתונים או למזג (להוסיף רק רשומות חסרות). גיבוי מגרסה ישנה יעבור הגירה אוטומטית.</div></div>
        <div class="section-title" style="color:var(--bad)">${icon('trash', 's')} אזור מסוכן</div>
        <div class="card"><button class="btn danger block" data-wipe>מחק את כל הנתונים</button></div>`;
    },
    mount: (el, draw) => {
      const f = el.querySelector('#bk-file');
      if (f) f.onchange = async () => {
        const file = f.files[0];
        if (!file) return;
        try {
          const json = JSON.parse(await file.text());
          const n = (json.shifts || []).length;
          const mode = await UI.dialog({ title: 'שחזור גיבוי', text: `בקובץ ${n} משמרות (${json.exportedAt ? 'נוצר ' + U.fmtDate(json.exportedAt.slice(0, 10)) : ''}). מה לעשות?`, buttons: [{ label: 'ביטול', value: null }, { label: 'מיזוג', value: 'merge' }, { label: 'החלפה מלאה', value: 'replace', cls: 'danger' }] });
          if (!mode) return;
          await Store.importBackup(json, mode);
          UI.toast('השחזור הושלם');
          UI.closeAll();
        } catch (err) { UI.dialog({ title: 'השחזור נכשל', text: err.message || String(err), buttons: [{ label: 'סגור', value: true }] }); }
      };
      if (el._bkBound) return;
      el._bkBound = true;
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.bk === 'dl') { await App.doBackup(false); draw(); }
        if (b.dataset.bk === 'files') { await App.doBackup(true); draw(); }
        if (b.dataset.bk === 'share') {
          const data = await Store.exportBackup(false);
          const name = `shiftpay-backup-${U.todayKey()}.json`;
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          await UI.shareFile(name, blob, 'גיבוי משמרות');
          await Store.setSettings((s) => { s.backup.lastBackup = Date.now(); });
          draw();
        }
        if (b.hasAttribute('data-wipe')) {
          if (!(await UI.confirm('למחוק את כל הנתונים?', 'כל המשמרות, התלושים וההגדרות יימחקו לצמיתות מהטלפון ומהחשבון בענן. מומלץ לגבות קודם.', 'מחק הכול', true))) return;
          const really = await UI.promptText('אישור סופי', 'הקלד "מחק" כדי לאשר', '');
          if (really !== 'מחק') { UI.toast('בוטל'); return; }
          try {
            if (root.Cloud.user) await root.Cloud.deleteAccountData(); else await Store.wipe();
            location.reload();
          } catch (err) { UI.dialog({ title: 'המחיקה נכשלה', text: root.Cloud.errorText(err), buttons: [{ label: 'סגור', value: true }] }); }
        }
      });
    },
  };

  RENDER.export = {
    render: () => `<div class="list">
      <button class="item" data-x="csv"><span class="lead">${icon('table')}</span><span class="body"><span class="t">כל המשמרות — CSV</span><span class="s">נפתח ב-Excel ו-Google Sheets (עברית תקינה)</span></span></button>
      <button class="item" data-x="mcsv"><span class="lead">${icon('table')}</span><span class="body"><span class="t">סיכום חודשי — CSV</span><span class="s">חודש בכל שורה: שעות, ברוטו, נטו משוער…</span></span></button>
      <button class="item" data-x="pdf"><span class="lead">${icon('printer')}</span><span class="body"><span class="t">דוח חודשי — PDF</span><span class="s">החודש הנוכחי; לחודשים אחרים: דוחות ← סיכומים</span></span></button>
      <button class="item" data-x="ics"><span class="lead">${icon('calendar')}</span><span class="body"><span class="t">משמרות ליומן — ‎.ics</span><span class="s">כל המשמרות; מתוכננות עם תזכורת</span></span></button></div>`,
    mount: (el) => el.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => {
      const x = b.dataset.x;
      const all = [...App.model.results.values()].sort((a, c) => a.start - c.start);
      if (x === 'csv') App.exporter.shiftsCsv(all, 'shifts-all.csv');
      if (x === 'mcsv') App.exporter.monthlyCsv();
      if (x === 'ics') { if (all.length) App.exporter.ics(all, 'shifts.ics'); else UI.toast('אין משמרות'); }
      if (x === 'pdf') { const P = Engine.periodOf(U.todayKey(), S.employers[0]); UI.closeAll(); setTimeout(() => App.exporter.printReport(P.from, P.to, P.label), 400); }
    })),
  };

  RENDER.demo = {
    render: () => `<div class="card"><div class="small" style="margin-bottom:12px">מצב הדגמה ממלא את האפליקציה בכ-4 חודשים של משמרות לדוגמה (כולל שבתות, חגים, שעות נוספות, פיצולים, עקיפה ידנית ותלוש לדוגמה), כדי לראות איך הכול עובד. אחר כך אפשר למחוק רק את נתוני הדוגמה.</div>
      ${S.settings.demo ? `<button class="btn danger block" data-demo-clear>${icon('trash')} מחק את נתוני הדוגמה</button>` : `<button class="btn block" data-demo-load>${icon('flask')} טען נתוני דוגמה</button>`}</div>`,
    mount: (el, draw) => {
      const l = el.querySelector('[data-demo-load]');
      if (l) l.onclick = async () => { await App.demo.load(); UI.toast('נתוני הדוגמה נטענו'); draw(); };
      const c = el.querySelector('[data-demo-clear]');
      if (c) c.onclick = async () => { await App.actions['demo-clear'](); draw(); };
    },
  };

  RENDER.about = {
    render: () => `<div class="card"><div class="kv"><span>גרסת אפליקציה</span><b>${root.APP_VERSION}</b></div><div class="kv"><span>מבנה נתונים</span><b>${Store.SCHEMA_VERSION}</b></div>
        <div class="kv"><span>משמרות</span><b>${S.shifts.length}</b></div><div class="kv"><span>תלושים</span><b>${S.payslips.length}</b></div><div class="kv"><span>אחסון בשימוש</span><b id="ab-storage">…</b></div><div class="kv"><span>אחסון קבוע</span><b id="ab-persist">…</b></div></div>
      <div class="section-title">התקנה כאפליקציה</div>
      <div class="card small">ב-Chrome: תפריט ⋮ ← "הוספה למסך הבית" ← "התקנה". אחרי ההתקנה: לחיצה ארוכה על האייקון ← "התחל משמרת" / "הוסף משמרת".</div>
      <div class="section-title">איך זה עובד</div>
      <div class="card small">כל החישובים מתבצעים בטלפון, כולל זמני שבת וחגים (לוח עברי וחישוב שקיעה מקומיים). האפליקציה עובדת בלי אינטרנט. חיבור נדרש רק בפעם הראשונה של קריאת PDF / זיהוי טקסט מתמונה (טעינת הרכיב), ולניתוח AI אם בחרת בו.</div>
      <div class="disclaimer">${icon('info', 's')}<div>האפליקציה היא כלי עזר אישי. החישובים (נטו, מס, זכויות) הם הערכה ואינם ייעוץ משפטי, חשבונאי או מס.</div></div>`,
    mount: async (el) => {
      try {
        const est = await navigator.storage.estimate();
        const s = el.querySelector('#ab-storage'); if (s) s.textContent = U.num((est.usage || 0) / 1048576, 1) + ' MB';
        const p = el.querySelector('#ab-persist'); if (p) p.textContent = (await navigator.storage.persisted()) ? 'כן ✓' : 'לא (התקן כאפליקציה)';
      } catch (e) { /* ignore */ }
    },
  };

  App.actions['demo-clear'] = async () => {
    if (!(await UI.confirm('למחוק את נתוני הדוגמה?', 'רק נתוני הדוגמה יימחקו; מה שהוספת בעצמך יישאר.', 'מחק', true))) return;
    await App.demo.clear();
    UI.toast('נתוני הדוגמה נמחקו');
  };
})(typeof window !== 'undefined' ? window : globalThis);
