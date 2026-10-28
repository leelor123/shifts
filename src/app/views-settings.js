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
    date: (label, path, v, hint) => `<label class="field"><span class="lbl">${label}</span><input class="input" type="date" data-s="${path}" value="${esc(v || '')}" ${dateLimits(path)}>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`,
    sw: (t, s, path, on) => `<label class="switch-row"><span class="body"><span class="t">${t}</span>${s ? `<span class="s">${s}</span>` : ''}</span><input type="checkbox" class="switch" data-s="${path}" ${on ? 'checked' : ''}></label>`,
    // a few short choices as chips that light up (an emoji for each): opts [[value, label, emoji]]
    chips: (label, path, opts, v, hint) => `<div class="field"><span class="lbl">${label}</span><select class="input" data-s="${path}" data-ui="chips">${opts.map(([k, l, e]) => `<option value="${esc(k)}" ${e ? `data-e="${esc(e)}"` : ''} ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`,
    sel: (label, path, opts, v, hint) => `<label class="field"><span class="lbl">${label}</span><select class="input" data-s="${path}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint ? `<span class="hint">${hint}</span>` : ''}</label>`,
  };
  App.F = F;
  /* dates that can't be right are not accepted: a birthday in the future, starting work before age 12, … */
  function dateRules(path) {
    const today = U.todayKey();
    const birth = S.settings.birthDate;
    return {
      's.birthDate': { min: '1940-01-01', max: U.addDays(today, -365 * 12), pick: 'birth', msg: 'תאריך לידה לא הגיוני' },
      's.startDate': { min: birth ? U.addDays(birth, 365 * 12) : '1960-01-01', max: today, msg: 'תאריך תחילת העבודה לא יכול להיות בעתיד או לפני גיל 12' },
      's.leave.vacationOpeningDate': { min: '2000-01-01', max: today, msg: 'התאריך לא יכול להיות בעתיד' },
      's.saving.from': { min: '2000-01-01', max: today, msg: 'התאריך לא יכול להיות בעתיד' },
    }[path];
  }
  function dateLimits(path) {
    const r = dateRules(path);
    return r ? `min="${r.min}" max="${r.max}"${r.pick ? ` data-pick="${r.pick}"` : ''}` : '';
  }
  App.dateOk = (el) => !(el.type === 'date' && el.value && ((el.min && el.value < el.min) || (el.max && el.value > el.max)));
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
  /* numbers people type: never negative (except the Shabbat offsets and coordinates), and within a range
     where a value would otherwise break a calculation or a screen */
  const MAY_BE_NEGATIVE = new Set(['s.rest.startOffsetMin', 's.rest.endOffsetMin', 's.rest.lat', 's.rest.lon']);
  const RANGES = {
    's.alerts.compareWeeks': [1, 26], 's.alerts.compareMonths': [1, 12], 's.alerts.minWeeksData': [1, 52], 's.alerts.deviationPct': [1, 500],
    's.alerts.streakDays': [2, 60], 's.alerts.weekHoursMax': [1, 168], 's.alerts.longShiftHours': [1, 48], 's.alerts.minRestHours': [0, 48],
    's.alerts.timerHours': [1, 72], 's.alerts.idleDays': [1, 365], 's.alerts.suspiciousHours': [1, 72], 's.alerts.backupDays': [1, 365],
    's.alerts.upcomingMin': [0, 1440], 's.alerts.weeklyHour': [0, 23], 'e.payDay': [1, 31], 'e.otThreshold': [1, 24], 'e.otTier1Hours': [0, 24],
    'e.minShiftHours': [0, 24], 'e.nightShiftThreshold': [1, 24], 'e.defaultBreakMin': [0, 600], 's.leave.dayHours': [0, 24],
    's.rest.lat': [-90, 90], 's.rest.lon': [-180, 180], 's.rest.startOffsetMin': [-180, 180], 's.rest.endOffsetMin': [-180, 180],
    's.rest.candleMin': [0, 120], 's.rest.exitMinutes': [0, 120],
  };
  /** Checks a typed number; returns [ok, value, message]. */
  function checkNumber(path, v) {
    if (typeof v !== 'number') return [true, v];
    if (!Number.isFinite(v)) return [false, v, 'המספר לא תקין'];
    if (v < 0 && !MAY_BE_NEGATIVE.has(path)) return [false, v, 'כאן אי אפשר מספר שלילי'];
    const r = RANGES[path];
    if (r && (v < r[0] || v > r[1])) return [true, Math.min(r[1], Math.max(r[0], v)), `הערך הותאם לטווח ${r[0]}\u2060–\u2060${r[1]}`];
    if (Math.abs(v) > 1e7) return [false, v, 'המספר גדול מדי'];
    return [true, v];
  }
  /** Bind auto-save. empId() returns the employer being edited. */
  function bind(el, empId, redraw) {
    el.addEventListener('change', async (e) => {
      const t = e.target;
      const path = t.dataset.s;
      if (!path) return;
      const t0 = performance.now();
      if (!App.dateOk(t)) {
        const r = dateRules(path);
        UI.invalid((r && r.msg) || 'התאריך לא הגיוני');
        if (redraw) redraw();
        return;
      }
      let v = readVal(t);
      if (typeof v === 'string' && !App.ensureClean(v)) { if (redraw) redraw(); return; }
      const [ok, fixed, msg] = checkNumber(path, v);
      if (!ok) { UI.invalid(msg); if (redraw) redraw(); return; }
      if (fixed !== v) { v = fixed; t.value = fixed; }
      if (path.startsWith('s.')) await Store.setSettings((st) => setPath(st, path.slice(2), v));
      else if (path.startsWith('e.')) {
        const emp = Store.clone(App.employer(empId()));
        setPath(emp, path.slice(2), v);
        await Store.put('employers', emp);
      }
      UI.toast(msg || 'נשמר', null, { ok: true });
      if (redraw && t.dataset.redraw != null) {
        // a switch slides over first (.2s), then the fields it opens come in (redrawing at once put a new
        // switch in its place, already on: the knob jumped)
        const wait = t.type === 'checkbox' ? 220 - (performance.now() - t0) : 0;
        if (wait > 0) setTimeout(redraw, wait); else redraw();
      }
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
        if (opts.focus) spotlight(el, opts.focus);
      },
    });
  }

  /* ---------------- sections ---------------- */
  const SECTIONS = {
    rights: { icon: 'shield', title: 'הזכויות שלי', sub: () => 'מדריך אישי לפי הגיל והנתונים שלך · גם בלי אינטרנט' },
    personal: { icon: 'users', title: 'פרטים אישיים', sub: () => { const a = Engine.ageAt(S.settings.birthDate, U.todayKey()); return (S.settings.userName || 'שם לא הוזן') + (a != null ? ' · גיל ' + a + (a < 18 ? ' (פטור ממסים)' : '') : ''); } },
    account: { icon: 'cloud', title: 'חשבון וסנכרון', sub: () => (S.meta.cloudEmail || 'לא מחובר') + ' · ' + root.Cloud.statusText() },
    roles: { icon: 'users', title: 'מעסיקים, תפקידים ותעריפים', sub: () => App.roles().map((r) => r.name + ' ' + U.money(Engine.roleRate(r, U.todayKey()), 0)).join(' · ') },
    calc: { icon: 'flask', title: 'חוקי חישוב', sub: () => { const e = S.employers[0]; return `${Engine.otByLaw(e) ? 'ש״נ לפי החוק' : `ש״נ אחרי ${e.otThreshold} ש׳`} · שבת ${e.restPct}% · עיגול: ${e.roundingMode === 'none' ? 'ללא' : e.roundingUnit + ' דק׳'}`; } },
    rest: { icon: 'candle', title: 'שבת וחגים', sub: () => (S.settings.rest.mode === 'city' ? 'לפי ' + (S.settings.rest.city === '__custom' ? 'מיקום מותאם' : App.placeLabel ? App.placeLabel(S.settings.rest.city).name : S.settings.rest.city) : `קבוע: ⁦${S.settings.rest.fixedStart}\u2060–\u2060${S.settings.rest.fixedEnd}⁩`) + (S.dayRules.length ? ` · ${S.dayRules.length} כללי יום` : '') },
    pay: { icon: 'car', title: 'נסיעות ותקופת שכר', sub: () => { const e = S.employers[0]; return `${U.money(e.travelPerDay)} ליום${+e.travelMonthlyCap ? ', תקרה ' + U.money(e.travelMonthlyCap, 0) : ''} · ${e.periodStartDay > 1 ? 'מ-' + e.periodStartDay + ' לחודש' : 'חודש קלנדרי'} · תשלום ב-${e.payDay}`; } },
    net: { icon: 'wallet', title: 'נטו משוער ומס', sub: () => `${S.settings.tax.creditPoints} נק׳ זיכוי · פנסיה ${S.settings.pension.employeePct}%${S.settings.hishtalmut.enabled ? ' · השתלמות' : ''}` },
    leave: { icon: 'beach', title: 'ותק, חופשה, מחלה והבראה', sub: () => (S.settings.startDate ? 'התחלת עבודה: ' + U.fmtDate(S.settings.startDate) : 'הגדר תאריך תחילת עבודה') },
    goal: { icon: 'target', title: 'יעדים', sub: () => [+S.settings.goal.amount ? 'חודשי: ' + U.money(S.settings.goal.amount, 0) + (S.settings.goal.type === 'net' ? ' נטו' : ' ברוטו') : '', S.settings.saving && +S.settings.saving.price && S.settings.saving.name ? 'חוסכים ל' + S.settings.saving.name : ''].filter(Boolean).join(' · ') || 'יעד חודשי וחיסכון למשהו' },
    alerts: { icon: 'bell', title: 'התראות ותובנות', sub: () => (('Notification' in window) && Notification.permission === 'granted' ? 'פוש מופעל' : 'פוש כבוי') + ' · סיכומים ותזכורות' },
    templates: { icon: 'layers', title: 'תבניות משמרת', sub: () => (S.templates.length === 1 ? 'תבנית אחת' : S.templates.length ? `${S.templates.length} תבניות` : 'אין תבניות') },
    lang: { icon: 'globe', title: 'שפה · Language', sub: () => (root.Lang ? root.Lang.LANGS.map((l) => l.name).join(' · ') : '') },
    look: { icon: 'palette', title: 'מראה', sub: () => ({ system: 'לפי המערכת', light: 'בהיר', dark: 'כהה' }[S.settings.theme]) + ' · ' + (App.ACCENTS[S.settings.accent] || [])[2] },
    security: { icon: 'lock', title: 'נעילה בקוד', sub: () => (S.settings.lock.enabled ? 'מופעלת' : 'כבויה') },
    assistant: { icon: 'sparkle', title: 'עוזר זכויות ושכר (AI)', sub: () => (S.settings.ai.apiKey ? 'מוכן — שאל כל שאלה' : 'דורש מפתח API') },
    ai: { icon: 'sparkle', title: 'מפתח AI וניתוח תלושים', sub: () => (S.settings.ai.apiKey ? 'מפתח מוגדר · ' + S.settings.ai.model : 'אופציונלי — ללא מפתח הכול מקומי') },
    backup: { icon: 'cloud', title: 'גיבוי ושחזור', sub: () => (S.settings.backup.lastBackup ? 'גיבוי אחרון: ' + UI.timeAgo(S.settings.backup.lastBackup) : 'עוד לא גובה') },
    import: { icon: 'upload', title: 'ייבוא דוח שעות', sub: () => 'Excel, CSV, PDF או צילום: כל המשמרות בבת אחת' },
    schedule: { icon: 'calendar', title: 'ייבוא סידור עבודה', sub: () => 'צילום של הסידור או ההודעה מוואטסאפ: המשמרות שלך נכנסות ללוח' },
    export: { icon: 'download', title: 'ייצוא נתונים', sub: () => 'CSV / Excel, PDF, יומן' },
    demo: { icon: 'flask', title: 'מצב הדגמה', sub: () => (S.settings.demo ? 'פעיל' : 'נתוני דוגמה לבדיקת האפליקציה') },
    about: { icon: 'info', title: 'אודות והתקנה', sub: () => 'גרסה ' + root.APP_VERSION },
  };

  // extra words people may search for, per section
  const FIND = {
    personal: 'שם גיל יום הולדת תאריך לידה מגדר נוער', account: 'התחברות גוגל google סנכרון ענן חשבון התנתקות מחיקת חשבון טלפון חדש',
    roles: 'עבודה מקום עבודה תפקיד מעסיק שכר לשעה תעריף העלאה העלאת שכר', calc: 'שעות נוספות 125 150 עיגול לילה הפסקה ותק',
    rest: 'שבת חג חגים עיר כניסת שבת יציאת שבת כלל יום', pay: 'נסיעות החזר נסיעות תקרה תקופת שכר יום תשלום משכורת',
    net: 'מס מס הכנסה נקודות זיכוי פנסיה ביטוח לאומי מס בריאות השתלמות נטו', leave: 'חופשה מחלה הבראה ותק תחילת עבודה',
    goal: 'יעד יעדים חיסכון חוסכים', alerts: 'התראות תזכורות פוש הודעות', templates: 'תבנית תבניות משמרת קבועה',
    lang: 'שפה שפות language english русский русский язык العربية عربي ערבית רוסית אנגלית צרפתית ספרדית français francais español espanol french spanish תרגום', look: 'צבע צבעים ערכת נושא כהה בהיר מצב לילה גופן גופנים מראה צלילים רטט מוזיקה עיצוב כרטיס plus פלוס מסך הבית קיצורים קיצורי דרך משמרות אחרונות תאריך עברי שורת עדכון home screen accueil inicio', security: 'קוד נעילה טביעת אצבע סיסמה',
    assistant: 'בינה מלאכותית עוזר שאלות ai', ai: 'מפתח api claude ניתוח תלוש', backup: 'גיבוי שחזור קובץ', schedule: 'סידור עבודה סידור משמרות שבוע הבא צילום תמונה צילום מסך וואטסאפ whatsapp הודעה טבלה מתוכננות לוח', import: 'ייבוא דוח שעות נוכחות שעון אקסל excel csv pdf צילום קובץ להעלות משמרות מהעבודה', export: 'ייצוא אקסל excel csv pdf יומן',
    demo: 'דוגמה הדגמה', about: 'גרסה התקנה אודות', rights: 'זכויות שכר מינימום',
  };
  // the page is a few colourful doors; each opens its own small page with the sections behind it
  const CATS = [
    { id: 'me', icon: 'users', tint: 'violet', title: 'אני והחשבון', keys: ['personal', 'account'], sub: () => [S.settings.userName, S.meta.cloudEmail ? 'מחובר/ת ☁️' : 'לא מחובר/ת'].filter(Boolean).join(' · ') },
    { id: 'work', icon: 'briefcase', tint: 'mint', title: 'העבודה שלי', keys: ['roles', 'pay', 'templates'], sub: () => { const r = App.roles(); return r.length === 1 ? `${r[0].name} · ${U.money(Engine.roleRate(r[0], U.todayKey()), 0)} לשעה` : `${r.length} תפקידים` + (S.employers.length > 1 ? ' · ' + `${S.employers.length} מקומות עבודה` : ''); } },
    { id: 'calc', icon: 'flask', tint: 'amber', title: 'חישוב השכר', keys: ['calc', 'rest'], sub: () => 'שעות נוספות, לילה, שבת וחגים' },
    { id: 'money', icon: 'wallet', tint: 'sky', title: 'נטו, מס וזכויות', keys: ['net', 'leave', 'rights'], sub: () => `${S.settings.tax.creditPoints} נק׳ זיכוי · פנסיה ${S.settings.pension.employeePct}%` },
    { id: 'goals', icon: 'target', tint: 'pink', title: 'יעדים ותזכורות', keys: ['goal', 'alerts'], sub: () => (+S.settings.goal.amount ? 'יעד ' + U.money(S.settings.goal.amount, 0) : 'יעד, חיסכון והתראות') },
    { id: 'look', icon: 'palette', tint: 'orange', title: 'מראה ונעילה', keys: ['lang', 'look', 'security'], sub: () => ({ system: 'לפי המערכת', light: 'בהיר', dark: 'כהה' }[S.settings.theme] || '') + (S.settings.lock.enabled ? ' · נעול 🔒' : '') },
    { id: 'data', icon: 'cloud', tint: 'mint', title: 'גיבוי, ייבוא ונתונים', keys: ['backup', 'import', 'schedule', 'export', 'demo'], sub: () => (S.settings.backup.lastBackup ? 'גיבוי ' + UI.timeAgo(S.settings.backup.lastBackup) : 'גיבוי, ייצוא, נתוני דוגמה') },
    { id: 'more', icon: 'sparkle', tint: 'violet', title: 'עוזר AI ואודות', keys: ['assistant', 'ai', 'about'], sub: () => 'גרסה ' + root.APP_VERSION },
  ];
  const catOf = (k) => CATS.find((c) => c.keys.includes(k));
  App.settingsKeys = () => CATS.flatMap((c) => c.keys); // every section, door by door
  App.settingsCats = () => CATS.map((c) => c.id);
  const sectionRow = (k) => { const s = SECTIONS[k]; return `<button class="item" data-act="settings-open" data-k="${k}"><span class="lead">${icon(s.icon)}</span><span class="body"><span class="t">${s.title}</span><span class="s">${esc(s.sub())}</span></span>${icon('left', 's')}</button>`; };

  /* problems people come here with, and where the answer is: each is [what it says, the words that find it, [[section, field label]]] */
  const PROBLEMS = [
    ['השכר לא יוצא כמו בתלוש', 'משכורת לא נכון לא תואם תלוש פחות כסף טעות בשכר חסר כסף', [['roles', 'תעריף'], ['calc', 'שעות רגילות ביום'], ['pay', 'התקופה מתחילה ב-']]],
    ['שבת או חג לא מחושבים 150%', 'שבת לא נחשבת חג לא נחשב 150 שבת לא נכונה כניסת שבת', [['rest', ''], ['calc', 'שבת/חג %']]],
    ['שעות נוספות לא נכונות', 'נוספות 125 150 שעות נוספות לא נחשבות אחרי 8 שעות', [['calc', 'שעות רגילות ביום'], ['calc', 'אחוז דרגה 1']]],
    ['לא מקבל/ת נסיעות', 'נסיעות דמי נסיעה אוטובוס רב קו החזר נסיעות', [['pay', 'סכום ליום עבודה ₪']]],
    ['ההפסקה מורידה לי שעות', 'הפסקה מורידה שעות הפסקה בתשלום ארוחה', [['calc', 'הפסקה קבועה (דק׳, 0 = לפי החוק)']]],
    ['הנטו לא נכון', 'נטו מס הכנסה ביטוח לאומי פנסיה ניכויים נקודות זיכוי', [['net', 'נקודות זיכוי'], ['net', 'פנסיה חובה'], ['personal', 'תאריך לידה (לא חובה)']]],
    ['אני מתחת לגיל 18', 'נוער גיל 16 17 15 שכר מינימום נוער פטור ממס', [['personal', 'תאריך לידה (לא חובה)']]],
    ['קיבלתי העלאה', 'העלאה העלאת שכר תעריף חדש שינוי תעריף', [['roles', 'תעריף']]],
    ['המשכורת מגיעה בתאריך אחר', 'יום תשלום מתי משכורת תאריך משכורת תקופת שכר מה 10', [['pay', 'יום התשלום (בחודש שאחרי)'], ['pay', 'התקופה מתחילה ב-']]],
    ['לא מקבל/ת התראות', 'התראות תזכורות פוש לא מקבל הודעות', [['alerts', 'התראות פוש בטלפון']]],
    ['הצלילים מפריעים', 'צלילים להשתיק שקט רעש מוזיקה רטט', [['look', 'צלילים'], ['look', 'רטט']]],
    ['רוצה צבע אחר או מצב כהה', 'צבע כהה בהיר מצב לילה עיצוב', [['look', '']]],
    ['רוצה לשנות את מסך הבית', 'מסך הבית בית קיצורים להסתיר משמרות אחרונות תאריך עברי שורת עדכון', [['look', 'קיצורי דרך']]],
    ['עברתי לטלפון חדש', 'טלפון חדש העברה מכשיר חדש להעביר נתונים', [['account', ''], ['backup', '']]],
    ['נמחקו לי משמרות', 'נמחק נמחקו שחזור גיבוי איבדתי', [['backup', '']]],
    ['חופשה או מחלה לא נכונות', 'חופשה ימי חופש מחלה הבראה ותק יתרה', [['leave', 'תאריך תחילת עבודה'], ['leave', 'יתרת פתיחה — חופשה']]],
    ['שכחתי את קוד הנעילה', 'קוד נעילה שכחתי סיסמה טביעת אצבע', [['security', '']]],
    ['עובד/ת בעוד מקום', 'עוד מקום עבודה מעסיק נוסף שני מקומות', [['roles', '']]],
    ['יום בחירות או יום מיוחד', 'בחירות 200 יום מיוחד אחוז מיוחד', [['rest', 'כללי יום']]],
  ];
  const CHIPS = [['wallet', 'mint', 0], ['candle', 'amber', 1], ['clock', 'violet', 2], ['bus', 'sky', 3], ['coffee', 'orange', 4], ['receipt', 'pink', 5], ['bell', 'violet', 9], ['cloud', 'sky', 12]];

  // search: Hebrew written loosely (no niqqud, final letters, quotes) and matched from the start of words
  // i18n-keep the final letters' plain forms
  const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  const norm = (s) => String(s || '').toLowerCase().replace(/[֑-ׇ]/g, '').replace(/[ךםןףץ]/g, (c) => FINALS[c]).replace(/["'״׳()\-–,.:/%₪?!]/g, ' ').replace(/\s+/g, ' ').trim();
  // every word of the question starts a word here ("צבע" finds colours, not the fingerprint, "אצבע"); a Hebrew
  // prefix on a longer word comes off ("בנסיעות" finds travel)
  const hitWord = (hay, w) => (' ' + hay).includes(' ' + w) || (w.length >= 4 && /^[הבלומשכ]/.test(w) && (' ' + hay).includes(' ' + w.slice(1)));
  const hit = (hay, words) => words.every((w) => hitWord(hay, w));
  let INDEX = null;
  // every field of every section, read from the sections' own pages (so the search never falls behind them)
  function buildIndex() {
    const out = [];
    const tpl = document.createElement('template');
    Object.keys(SECTIONS).forEach((k) => {
      const s = SECTIONS[k];
      out.push({ k, label: '', text: norm(s.title + ' ' + (FIND[k] || '')) });
      if (!RENDER[k] || k === 'account') return;
      try {
        tpl.innerHTML = RENDER[k].render(App.employer(S.employers[0].id));
        const seen = new Set();
        tpl.content.querySelectorAll('.lbl, .switch-row .t, .section-title, summary b, h3').forEach((el) => {
          const label = (el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.textContent : el.textContent).trim();
          if (!label || label.length > 60 || seen.has(label) || label === s.title) return;
          seen.add(label);
          out.push({ k, label, text: norm(label + ' ' + s.title) });
        });
      } catch (e) { /* a section that can't draw here is still found by its title */ }
    });
    return out;
  }
  function results(q) {
    const words = norm(q).split(' ').filter(Boolean);
    if (!words.length) return null;
    if (!INDEX) INDEX = buildIndex();
    const probs = PROBLEMS.filter(([t, w]) => hit(norm(t + ' ' + w), words)).slice(0, 3);
    const fields = INDEX.filter((x) => hit(x.text, words));
    // the section itself first, then its fields; one row per (section, label)
    fields.sort((a, b) => (a.label ? 1 : 0) - (b.label ? 1 : 0));
    return { probs, fields: fields.slice(0, 14) };
  }
  const goRow = (k, label, title, sub, cls) => `<button class="item ${cls || ''}" data-act="settings-go" data-k="${k}" data-f="${esc(label)}"><span class="lead">${icon(SECTIONS[k].icon)}</span><span class="body"><span class="t">${esc(title)}</span><span class="s">${esc(sub)}</span></span>${icon('left', 's')}</button>`;
  function resultsHtml(r) {
    if (!r.probs.length && !r.fields.length) {
      return `<div class="set-none">${App.mascot ? App.mascot('think', { size: 64 }) : ''}<div><b>לא מצאנו הגדרה כזו</b><div class="small muted">אפשר לנסות מילה אחרת, או לכתוב לנו ונעזור.</div></div></div>
        <button class="btn tonal block" data-act="support">${icon('chat', 's')} לכתוב לנו</button>`;
    }
    return (r.probs.length ? `<div class="section-title">${icon('sparkle', 's')} אולי זה מה שמחפשים</div>${r.probs.map(([t, , where]) => `<div class="set-prob"><div class="set-prob-t">${esc(t)}</div><div class="list">${where.map(([k, f]) => goRow(k, f, f || SECTIONS[k].title, f ? SECTIONS[k].title : SECTIONS[k].sub(), 'prob')).join('')}</div></div>`).join('')}` : '')
      + (r.fields.length ? `<div class="section-title">${icon('search', 's')} הגדרות</div><div class="list">${r.fields.map((x) => goRow(x.k, x.label, x.label || SECTIONS[x.k].title, x.label ? catOf(x.k) ? catOf(x.k).title + ' › ' + SECTIONS[x.k].title : SECTIONS[x.k].title : SECTIONS[x.k].sub())).join('')}</div>` : '');
  }

  let lastQ = '';
  App.views.settings_mount = function (v) {
    const q = v.querySelector('#set-q');
    if (!q) return;
    const home = v.querySelector('#set-home');
    const res = v.querySelector('#set-res');
    const clear = v.querySelector('[data-set-clear]');
    const run = () => {
      lastQ = q.value;
      const r = results(q.value);
      clear.hidden = !q.value;
      home.hidden = !!r;
      res.hidden = !r;
      res.innerHTML = r ? resultsHtml(r) : '';
    };
    q.addEventListener('input', run);
    clear.addEventListener('click', () => { q.value = ''; run(); q.focus(); });
    v.querySelectorAll('[data-set-chip]').forEach((b) => b.addEventListener('click', () => {
      q.value = PROBLEMS[+b.dataset.setChip][0];
      run();
      if (root.Fx) root.Fx.play('pick');
    }));
    if (lastQ) { q.value = lastQ; run(); }
  };

  App.views.settings = function () {
    const cur = root.Lang && root.Lang.LANGS.find((l) => l.id === root.Lang.current);
    return `<div class="topbar"><div class="titles"><h1>הגדרות</h1><div class="sub">כל שינוי נשמר מיד</div></div>${cur ? `<button class="lang-pill" data-act="lang-open" aria-label="שפה · Language">${icon('globe', 's')}<span lang="${cur.id}">${cur.name}</span></button>` : ''}</div>
      <div class="set-search">${icon('search', 's')}<input class="input" id="set-q" type="text" enterkeyhint="search" placeholder="מה לשנות? או מה הבעיה?" aria-label="חיפוש בהגדרות" autocomplete="off"><button class="icon-btn sm set-clear" data-set-clear hidden aria-label="ניקוי החיפוש">${icon('x', 's')}</button></div>
      <div id="set-res" hidden></div>
      <div id="set-home">
      <div class="set-chips" aria-label="בעיות נפוצות">${CHIPS.map(([ic, tint, i]) => `<button class="set-chip t-${tint}" data-set-chip="${i}">${icon(ic, 's')}<span>${esc(PROBLEMS[i][0])}</span></button>`).join('')}</div>
      ${App.isAdmin ? `<div class="list" style="margin-top:6px"><button class="item admin-entry" data-act="admin-dashboard"><span class="lead" style="background:var(--primary);color:var(--on-primary)">${icon('chart')}</span><span class="body"><span class="t">לוח ניהול ${App.adminOpenTickets ? `<span class="tag warn">${App.adminOpenTickets} פניות מחכות</span>` : ''}</span><span class="s">משתמשים, פעילות, פניות (למנהלים בלבד)</span></span>${icon('left', 's')}</button></div>` : ''}
      ${root.Plus && root.Plus.visible() ? `<div class="list" style="margin-top:6px"><button class="item plus-entry" data-act="plus-open"><span class="lead plus-lead">${icon('sparkle')}</span><span class="body"><span class="t">Shaati Plus</span><span class="s">${root.Plus.owned() ? 'פעיל · תודה על התמיכה 💜' : 'עיצובים לכרטיס השכר' + (root.Plus.priceText && root.Plus.priceText() ? ' · ' + esc(root.Plus.priceText()) : '')}</span></span>${icon('left', 's')}</button></div>` : ''}
      <div class="set-cats">${CATS.map((c, i) => `<button class="set-cat" data-act="settings-cat" data-cat="${c.id}" style="--i:${i}">${UI.tile(c.icon, c.tint)}<span class="t">${c.title}</span><span class="s">${esc(c.sub())}</span><span class="n" aria-hidden="true">${c.keys.length}</span></button>`).join('')}</div>
      <div class="list set-list help-list"><button class="item" data-act="support"><span class="lead">${icon('chat')}</span><span class="body"><span class="t">עזרה ותמיכה ${App.supportUnread ? '<span class="tag good">תשובה חדשה</span>' : ''}</span><span class="s">שאלות נפוצות, לכתוב לנו, הפניות שלי</span></span>${icon('left', 's')}</button>
        <button class="item" data-act="share-app"><span class="lead">${icon('share')}</span><span class="body"><span class="t">לשתף עם חברים</span><span class="s">שגם הם ידעו כמה מגיע להם</span></span>${icon('left', 's')}</button>
        <button class="item" data-act="settings-legal"><span class="lead">${icon('file')}</span><span class="body"><span class="t">מידע משפטי</span><span class="s">תנאי שימוש, פרטיות, נגישות ורישיונות</span></span>${icon('left', 's')}</button></div>
      <div class="ver">גרסה ${root.APP_VERSION} · מבנה נתונים ${Store.SCHEMA_VERSION}${S.settings.legal ? ' · תנאים ' + esc(S.settings.legal.version) + ' אושרו' : ''}</div>
      </div>`;
  };
  App.actions['lang-open'] = () => root.Lang && root.Lang.sheet();
  App.actions['settings-open'] = (el) => (el.dataset.k === 'lang' && root.Lang ? root.Lang.sheet() : el.dataset.k === 'import' ? App.importHours({ over: true }) : el.dataset.k === 'schedule' ? App.importSchedule({ over: true }) : el.dataset.k === 'assistant' ? (App.openAssistantOver || App.actions.assistant)() : el.dataset.k === 'rights' ? App.actions.rights() : App.sheetsApi.settingsSection(el.dataset.k));
  // a door: its own small page with the sections behind it (their lines stay up to date while it is open)
  App.actions['settings-cat'] = (el) => {
    const c = CATS.find((x) => x.id === el.dataset.cat);
    if (!c) return;
    let off = null;
    const list = () => c.keys.map(sectionRow).join('');
    UI.openSheet({
      title: c.title, cls: 'set-cat-sheet',
      body: `<div class="set-cat-head">${UI.tile(c.icon, c.tint)}<div class="small muted">${esc(c.sub())}</div></div><div class="list set-list" id="set-cat-list">${list()}</div>`,
      onMount: (sh) => { off = Store.on(() => { const l = sh.querySelector('#set-cat-list'); if (l) l.innerHTML = list(); }); },
      onClose: () => { if (off) off(); },
    });
  };
  App.actions['settings-legal'] = () => UI.openSheet({
    title: 'מידע משפטי',
    body: `<div class="list">${[['about', 'info', 'אודות'], ['terms', 'file', 'תנאי שימוש'], ['privacy', 'shield', 'מדיניות פרטיות'], ['disclaimer', 'alert', 'הבהרה משפטית'], ['accessibility', 'eye', 'הצהרת נגישות'], ['licenses', 'layers', 'רישיונות וצד שלישי']].map(([d, ic, t]) => `<button class="item" data-act="legal" data-doc="${d}"><span class="lead" style="background:var(--surface-3)">${icon(ic)}</span><span class="body"><span class="t">${t}</span></span>${icon('left', 's')}</button>`).join('')}</div>`,
  });
  // a search result: the section opens at the field, which lights up for a moment
  App.actions['settings-go'] = (el) => {
    const k = el.dataset.k;
    if (k === 'assistant' || k === 'rights' || k === 'import' || k === 'schedule' || k === 'lang') { App.actions['settings-open'](el); return; }
    App.sheetsApi.settingsSection(k, el.dataset.f || '');
  };
  function spotlight(sheet, label) {
    if (!label) return;
    const want = label.trim();
    const el = [...sheet.querySelectorAll('.lbl, .switch-row .t, .section-title, summary b, h3')].find((x) => {
      const t = (x.firstChild && x.firstChild.nodeType === 3 ? x.firstChild.textContent : x.textContent).trim();
      return t === want || t.startsWith(want);
    });
    if (!el) return;
    const det = el.closest('details');
    if (det && !det.open) det.open = true;
    const box = el.closest('.switch-row, .field, .card, details') || el;
    setTimeout(() => {
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      box.classList.remove('set-hl'); void box.offsetWidth; box.classList.add('set-hl');
      setTimeout(() => box.classList.remove('set-hl'), 2200);
    }, 360);
  }

  App.sheetsApi.settingsSection = function (k, focus) {
    const s = SECTIONS[k];
    const R = RENDER[k];
    if (!R) return;
    sectionSheet(s.title, R.render, { perEmployer: R.perEmployer, mount: R.mount, focus });
  };

  /* ---------------- renderers ---------------- */
  const HOLS = HebCal.HOLIDAY_DEFS;
  const RENDER = {};
  /** The minimum wage the law sets today for this user (by date and age). */
  function minWageInfo() {
    const L = Engine.legalMinWage(U.todayKey(), S.settings.birthDate);
    return `<div class="kv"><span>לפי החוק${L.youth ? ` (גיל ${L.age})` : ''}</span><b>${U.money(L.hourly)} לשעה</b></div>
      <div class="tiny muted" style="margin:4px 0 10px">מתעדכן אוטומטית לפי התאריך${S.settings.birthDate ? ' והגיל' : '. מתחת לגיל 18? הוסף תאריך לידה בפרטים אישיים'} (התעריף מ-${U.fmtDate(L.from)}).</div>`;
  }
  RENDER.account ={ render: () => App.accountSection(), mount: (el, draw) => App.accountMount(el, draw) };
  RENDER.personal = {
    render: () => {
      const age = Engine.ageAt(S.settings.birthDate, U.todayKey());
      return `<div class="card">${F.text('שם (לא חובה)', 's.userName', S.settings.userName, 'מופיע בברכות ובחתימה של הודעות למעסיק.', 'maxlength="40"')}
        ${F.date('תאריך לידה (לא חובה)', 's.birthDate', S.settings.birthDate, 'לברכה ביום ההולדת, לשכר המינימום לפי גיל, לבדיקות חוק עבודת הנוער ולגיל הפנסיה.').replace('data-s=', 'data-redraw data-s=')}
        ${F.chips('מגדר (לא חובה)', 's.gender', [['m', 'גבר', '👨'], ['f', 'אישה', '👩'], ['', 'לא צוין', '🙂']], S.settings.gender || '', 'רק לחישוב הפנסיה: חובת הפרשה מגיל 21 לגבר ומגיל 20 לאישה.')}</div>
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
          const name = String((await UI.promptText('מעסיק חדש', 'שם המעסיק', '')) || '').trim().slice(0, 60);
          if (!name || !App.ensureClean(name)) return;
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
          } else if (r && String(r).trim() && App.ensureClean(String(r))) await Store.put('employers', Object.assign(Store.clone(emp), { name: String(r).trim().slice(0, 60) }));
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
      return `<label class="field"><span class="lbl">שם התפקיד</span><input class="input" id="re-name" value="${esc(d.name)}" placeholder="למשל: סדרן" maxlength="40"></label>
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
      d.name = el.querySelector('#re-name').value.trim().slice(0, 40);
      el.querySelectorAll('[data-rr]').forEach((i) => { const r = d.rates[+i.dataset.rr]; if (r) r.rate = UI.numIn(i); });
      el.querySelectorAll('[data-rf]').forEach((i) => { const r = d.rates[+i.dataset.rf]; if (r) r.from = i.value; });
      const em = el.querySelector('#re-emp'); if (em) d.employerId = em.value;
    };
    // the list may just have changed (a rate removed), so the screen is redrawn from d without reading it again
    const redraw = () => { el.querySelector('.sh-body').innerHTML = body(); };
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
            if (!App.ensureClean(d.name)) return;
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
        ${F.sw('לפי החוק (מומלץ)', +S.settings.leave.workWeek === 6 ? 'ביום מעל 8 שעות (בשישי מעל 7), במשמרת לילה מעל 7, ובשבוע מעל 42 שעות רגילות' : 'ביום מעל 8.6 שעות, במשמרת לילה מעל 7, ובשבוע מעל 42 שעות רגילות', 'e.otLaw', Engine.otByLaw(e)).replace('data-s=', 'data-redraw data-s=')}
        ${F.sel('ימי עבודה בשבוע במקום העבודה', 's.leave.workWeek', [[5, '5 ימים (ראשון עד חמישי)'], [6, '6 ימים']], +S.settings.leave.workWeek === 6 ? 6 : 5).replace('data-s=', 'data-redraw data-s=')}
        ${Engine.otByLaw(e) ? '' : F.num('שעות רגילות ביום', 'e.otThreshold', e.otThreshold, 'אחריהן מתחילות שעות נוספות (שעות מעל 42 בשבוע הן נוספות תמיד).')}
        <div class="grid3">${F.num('שעות בדרגה 1', 'e.otTier1Hours', e.otTier1Hours)}${F.num('אחוז דרגה 1', 'e.otTier1Pct', e.otTier1Pct)}${F.num('אחוז דרגה 2', 'e.otTier2Pct', e.otTier2Pct)}</div>
        ${F.sel('ספירה', 'e.otMode', [['daily', 'ליום עבודה (כל המשמרות שמתחילות באותו יום)'], ['shift', 'לכל משמרת בנפרד']], e.otMode)}
        ${Engine.otByLaw(e) ? '' : `${F.sw('משמרת לילה = יום קצר', 'משמרת שלפחות שעתיים ממנה בין 22:00 ל-06:00', 'e.nightShiftShortDay', e.nightShiftShortDay).replace('data-s=', 'data-redraw data-s=')}
        ${e.nightShiftShortDay ? F.num('שעות רגילות במשמרת לילה', 'e.nightShiftThreshold', e.nightShiftThreshold) : ''}`}</div>
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
        <div class="grid2">${F.num('הפסקה קבועה (דק׳, 0 = לפי החוק)', 'e.defaultBreakMin', e.defaultBreakMin)}${F.sel('הפסקה', 'e.defaultBreakPaid', [['true', 'בתשלום'], ['false', 'ללא תשלום']], String(e.defaultBreakPaid))}</div></div>`,
  };

  RENDER.rest = {
    render: () => {
      const R = S.settings.rest;
      const cfg = App.model.ctx.restCfg;
      const wins = HebCal.restWindows(U.todayKey(), U.addDays(U.todayKey(), 45), cfg).filter((w) => w.end > Date.now()).slice(0, 6);
      return `<div class="seg" style="margin-bottom:14px"><button data-rmode="city" class="${R.mode === 'city' ? 'on' : ''}">לפי עיר (כניסה/יציאה)</button><button data-rmode="fixed" class="${R.mode === 'fixed' ? 'on' : ''}">שעות קבועות</button></div>
        ${R.mode === 'city' ? `<div class="card">
          <div class="field"><span class="lbl">עיר</span>${App.placeField(R.city, 'עיר')}</div>
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
        <div class="card">${S.dayRules.length ? S.dayRules.slice().sort((a, b) => b.date.localeCompare(a.date)).map((r) => `<div class="kv"><span>${U.fmtDate(r.date)} · ${r.type === 'cancel' ? 'ביטול 150%' : r.type === 'pct' ? 'תעריף מיוחד ' + (+r.pct) + '%' : 'יום מנוחה ידני'}${r.reason ? ' — ' + esc(r.reason) : ''}</span><button class="btn text sm" data-rule-del="${r.id}">מחק</button></div>`).join('') : '<div class="muted small">אין. אפשר לבטל 150% לתאריך (למשל חג שזוהה בטעות) מתוך לוח השנה ← לחיצה על היום.</div>'}</div>`;
    },
    mount: (el, draw) => {
      if (el._restBound) return;
      el._restBound = true;
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.rmode) { await Store.setSettings((s) => { s.rest.mode = b.dataset.rmode; }); draw(); }
        if (b.hasAttribute('data-pick-city')) {
          const name = await App.pickPlace({ title: 'עיר לזמני שבת וחג', current: S.settings.rest.city, custom: true });
          if (!name || name === S.settings.rest.city) return;
          await Store.setSettings((s) => { s.rest.city = name; });
          draw();
          App.placeFieldHop(el);
        }
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
      // the law's numbers for this year, shown in empty fields; a number typed in is the user's own
      const bl = Engine.blLimits(T, U.todayKey()), law = Engine.blLimits({}, U.todayKey());
      bl.own = { thr: bl.thr !== law.thr, ceil: bl.ceil !== law.ceil };
      return `<div class="banner">${icon('info')}<div>הנטו הוא הערכה. ערכי ברירת המחדל לפי 2025\u2060–\u20602026 (מדרגות המס הוקפאו עד 2027). עדכן אם השתנו.</div></div>
        <div class="section-title">מס הכנסה</div><div class="card">
          ${F.num('נקודות זיכוי', 's.tax.creditPoints', T.creditPoints, 'תושב/ת: 2.25 · אישה: 2.75 · נוספות על ילדים, תואר, שחרור מצבא, עולה חדש ועוד.')}
          ${F.num('שווי נקודת זיכוי לחודש ₪', 's.tax.creditPointValue', T.creditPointValue)}
          <div class="tiny muted" style="margin:6px 4px">מדרגות מס חודשיות:</div>
          ${T.brackets.map((b, i) => `<div class="grid2">${F.num(i === T.brackets.length - 1 ? 'מעל' : 'עד ₪', 's.tax.brackets.' + i + '.0', b[0] === Infinity || b[0] == null ? '' : b[0], '', '∞')}${F.num('%', 's.tax.brackets.' + i + '.1', b[1])}</div>`).join('')}</div>
        <div class="section-title">ביטוח לאומי ומס בריאות</div><div class="card">
          ${F.num('סף שיעור מופחת ₪', 's.tax.blReducedThreshold', bl.own.thr ? T.blReducedThreshold : '', 'ריק = לפי החוק בכל שנה', U.num(bl.thr, 0))}
          <div class="grid2">${F.num('ב״ל מופחת %', 's.tax.blReducedPct', T.blReducedPct)}${F.num('ב״ל מלא %', 's.tax.blFullPct', T.blFullPct)}</div>
          <div class="grid2">${F.num('בריאות מופחת %', 's.tax.healthReducedPct', T.healthReducedPct)}${F.num('בריאות מלא %', 's.tax.healthFullPct', T.healthFullPct)}</div>
          ${F.num('תקרה ₪', 's.tax.blCeiling', bl.own.ceil ? T.blCeiling : '', 'ריק = לפי החוק בכל שנה', U.num(bl.ceil, 0))}</div>
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
          ${F.sel('שבוע עבודה', 's.leave.workWeek', [[5, '5 ימים'], [6, '6 ימים']], L.workWeek, '5 ימים: 12 ימי חופשה בשנים 1\u2060–\u20605; 6 ימים: 14 (לפי היקף משרה).')}
          <div class="grid2">${F.num('יתרת פתיחה — חופשה', 's.leave.vacationOpening', L.vacationOpening)}${F.num('יתרת פתיחה — מחלה', 's.leave.sickOpening', L.sickOpening)}</div>
          ${F.date('יתרות הפתיחה נכונות לתאריך', 's.leave.vacationOpeningDate', L.vacationOpeningDate, 'אם הזנת יתרה מתלוש — התאריך של התלוש. הצבירה תחושב מכאן.')}
          ${F.num('שעות חודשיות למשרה מלאה', 's.leave.fullTimeHours', L.fullTimeHours)}</div>
        <div class="section-title">שווי יום חופשה / מחלה</div><div class="card">
          ${F.sel('חישוב', 's.leave.dayValueMode', [['auto', 'אוטומטי — ממוצע יומי ב-90 הימים האחרונים'], ['hours', 'מספר שעות × תעריף'], ['fixed', 'סכום קבוע']], L.dayValueMode).replace('data-s=', 'data-redraw data-s=')}
          ${L.dayValueMode === 'hours' ? F.num('שעות ליום', 's.leave.dayHours', L.dayHours) : ''}${L.dayValueMode === 'fixed' ? F.num('סכום ליום ₪', 's.leave.dayFixed', L.dayFixed) : ''}
          <div class="grid2">${[0, 1, 2, 3].map((i) => F.num(['מחלה יום 1 %', 'יום 2 %', 'יום 3 %', 'מהיום ה-4 %'][i], 's.leave.sickPct.' + i, L.sickPct[i])).join('')}</div></div>
        <div class="section-title">הבראה</div><div class="card">
          ${F.num('תעריף ליום הבראה ₪', 's.leave.recuperationRate', Engine.recuperationRate(L, U.todayKey()) !== Engine.recuperationRate({}, U.todayKey()) ? L.recuperationRate : '', 'ריק = לפי צו ההרחבה במגזר הפרטי (מ-2026: 451.50 ₪ ליום)', String(Engine.recuperationRate({}, U.todayKey())))}
          ${F.sel('חודש תשלום', 's.leave.recuperationMonth', [[0, 'בכל חודש (חלק יחסי)'], ...U.MONTHS.map((m, i) => [i + 1, m])], L.recuperationMonth)}</div>`;
    },
  };

  RENDER.goal = {
    render: () => {
      const g = S.settings.saving || {};
      return `<div class="section-title">${icon('target', 's')} יעד חודשי</div>
      <div class="card">${F.num('יעד חודשי ₪', 's.goal.amount', S.settings.goal.amount || '', '0 = ללא יעד')}${F.sel('סוג היעד', 's.goal.type', [['gross', 'ברוטו'], ['net', 'נטו משוער']], S.settings.goal.type)}
      <div class="tiny muted">במסך הבית יופיע פס התקדמות, צפי לפי הקצב, וכמה משמרות חסרות ליעד.</div></div>
      <div class="section-title">🎯 חוסכים למשהו?</div>
      <div class="card">${F.text('מה רוצים לקנות', 's.saving.name', g.name, '', 'maxlength="40" placeholder="למשל: אוזניות, טיול, טלפון"')}
        ${F.num('כמה זה עולה (₪)', 's.saving.price', +g.price || '', '', '0')}
        ${F.date('סופרים מתאריך', 's.saving.from', g.from, 'הנטו שהרווחת מהיום הזה נספר ליעד')}
        <div class="tiny muted">בבית יופיע כמה כבר הרווחת לקראת זה, וכמה שעות עבודה בערך חסרות.</div>
        ${+g.price || g.name ? `<button class="btn text sm" data-saving-clear>${icon('trash', 's')} הסרת היעד</button>` : ''}</div>`;
    },
    mount: (el, draw) => {
      const clear = el.querySelector('[data-saving-clear]');
      if (clear) clear.onclick = async () => { await Store.setSettings((s) => { s.saving = { name: '', price: 0, from: '' }; }); UI.toast('היעד הוסר'); draw(); };
      // the first time something is set, counting starts today
      if (el._savingBound) return;
      el._savingBound = true;
      el.addEventListener('change', (e) => {
        const p = e.target.dataset.s;
        if ((p === 's.saving.price' || p === 's.saving.name') && !(S.settings.saving && S.settings.saving.from)) {
          setTimeout(async () => { await Store.setSettings((s) => { s.saving = Object.assign({ name: '', price: 0 }, s.saving, { from: U.todayKey() }); }); draw(); }, 50);
        }
      });
    },
  };

  /* the reminders before a planned shift: as many as wanted, at any time before it, and the evening before */
  const REMIND_AT = [10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 720, 1440, 2880];
  const minLabel = (m) => (m < 60 ? `${m} דק׳` : m % 1440 === 0 ? (m === 1440 ? 'יום אחד' : m === 2880 ? 'יומיים' : `${m / 1440} ימים`) : m === 60 ? 'שעה' : m === 120 ? 'שעתיים' : m === 90 ? 'שעה וחצי' : m % 60 === 0 ? `${m / 60} שעות` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} ש׳`);
  const remindList = (A) => { const R = A.reminders || {}; return (Array.isArray(R.before) && R.before.length ? R.before : [+A.upcomingMin || 60]).map(Number).filter((x) => x > 0).sort((a, b) => b - a); };
  function remindSummary(A) {
    const R = A.reminders || {};
    const parts = remindList(A).map((m) => minLabel(m) + ' לפני');
    if (R.eveOn) parts.unshift('בערב שלפני ב-' + (R.eve || '20:00'));
    return parts.join(' · ');
  }
  function remindBox(A) {
    const R = A.reminders || {};
    const on = new Set(remindList(A));
    const all = [...new Set(REMIND_AT.concat([...on]))].sort((a, b) => a - b);
    return `<div class="rm-box">
      <div class="lbl">מתי להזכיר (אפשר לבחור כמה)</div>
      <div class="chips rm-chips">${all.map((m) => `<button class="chip ${on.has(m) ? 'on' : ''}" data-rm="${m}" aria-pressed="${on.has(m)}">${minLabel(m)}</button>`).join('')}</div>
      <div class="rm-custom"><input class="input" type="number" inputmode="numeric" min="1" max="999" id="rm-n" placeholder="זמן אחר"><select class="input" id="rm-u"><option value="1">דקות</option><option value="60" selected>שעות</option><option value="1440">ימים</option></select><button class="btn tonal" data-rm-add>${icon('plus', 's')} הוסף</button></div>
      ${F.sw('גם בערב שלפני', 'תזכורת ביום שלפני המשמרת, בשעה שבחרת', 's.alerts.reminders.eveOn', !!R.eveOn).replace('data-s=', 'data-redraw data-s=')}
      ${R.eveOn ? `<div class="grid2">${F.time('בשעה', 's.alerts.reminders.eve', R.eve || '20:00')}</div>` : ''}
      ${F.sw('ההתראה נשארת עד שסוגרים אותה', 'לא נעלמת לבד מהמסך', 's.alerts.reminders.sticky', !!R.sticky)}
      ${F.sw('בלי צליל ורטט', '', 's.alerts.reminders.silent', !!R.silent)}
    </div>`;
  }

  RENDER.alerts = {
    render: () => {
      const A = S.settings.alerts;
      const perm = 'Notification' in window ? Notification.permission : 'unsupported';
      const t = (k, l) => F.sw(l, '', 's.alerts.types.' + k, A.types[k] !== false);
      return `<div class="card">${F.sw('התראות פוש בטלפון', perm === 'granted' ? 'מאושר' : perm === 'denied' ? (App.androidApp ? 'חסום — יש לאשר בהגדרות הטלפון › אפליקציות › Shaati › התראות' : 'חסום — יש לאשר בהגדרות האתר ב-\u2060Chrome') : 'דורש אישור', 's.alerts.push', A.push)}
          ${perm !== 'granted' && perm !== 'unsupported' ? `<button class="btn tonal block" data-perm>${icon('bell')} אשר התראות</button>` : ''}
          ${perm === 'granted' ? `<button class="btn text sm" data-test>${icon('send', 's')} שלח התראת בדיקה</button>` : ''}
          <div class="tiny muted" style="margin-top:6px">מעט התראות: הסיכום השבועי והחודשי, שיאים ויעדים, ותזכורות חשובות בלבד. בלי התראות על חריגות.</div></div>
        <div class="section-title">סיכומים</div><div class="card">${t('weekly', 'סיכום שבועי')}
          <div class="grid2">${F.sel('ביום', 's.alerts.weeklyDay', U.DAYS.map((d, i) => [i, d]), A.weeklyDay)}${F.num('בשעה', 's.alerts.weeklyHour', A.weeklyHour)}</div>
          ${t('monthly', 'סיכום חודשי (כשתקופת השכר נגמרת)')}</div>
        <div class="section-title">חדשות טובות</div><div class="card">${t('record', 'שיא אישי')}${t('goal', 'הגעת ליעד החודשי')}${t('birthday', 'יום הולדת')}</div>
        <div class="section-title">תזכורות</div><div class="card">
          ${t('timer', 'שכחתי לסיים משמרת')}<div class="grid2">${F.num('אחרי (שעות)', 's.alerts.timerHours', A.timerHours)}</div>
          ${F.sw('לפני משמרת מתוכננת', A.remindPlanned === true ? remindSummary(A) : 'כבוי', 's.alerts.remindPlanned', A.remindPlanned === true).replace('data-s=', 'data-redraw data-s=')}
          ${A.remindPlanned === true ? remindBox(A) : ''}
          ${t('confirmDone', 'אחרי משמרת מתוכננת: לשאול אם עבדת').replace('data-s=', 'data-redraw data-s=')}
          ${A.types.confirmDone !== false ? `<div class="grid2">${F.sel('כמה זמן אחרי הסיום', 's.alerts.reminders.confirmAfter', [[15, '15 דקות'], [30, 'חצי שעה'], [60, 'שעה'], [120, 'שעתיים'], [240, '4 שעות'], [480, '8 שעות']], (A.reminders || {}).confirmAfter || 30)}</div>` : ''}
          ${t('payslipDue', 'ביום התשלום: להזין את התלוש')}
          ${t('backup', 'תזכורת גיבוי')}<div class="grid2">${F.num('כל (ימים)', 's.alerts.backupDays', A.backupDays)}</div></div>`;
    },
    mount: (el, draw) => {
      // a reminder time on or off; at least one stays (with none the switch above turns them off)
      const setList = async (fn) => {
        await Store.setSettings((st) => {
          const R = st.alerts.reminders = Object.assign({}, st.alerts.reminders);
          const cur = Array.isArray(R.before) && R.before.length ? R.before.slice() : [+st.alerts.upcomingMin || 60];
          R.before = [...new Set(fn(cur).map(Number).filter((x) => x > 0 && x <= 14 * 1440))].sort((a, b) => b - a);
        });
        if (root.Fx) root.Fx.play('on');
        draw();
      };
      el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => {
        const m = +b.dataset.rm;
        const cur = remindList(S.settings.alerts);
        if (cur.includes(m) && cur.length === 1) { UI.toast('צריך לפחות תזכורת אחת. כדי לכבות, מכבים את המתג למעלה'); return; }
        setList((l) => (l.includes(m) ? l.filter((x) => x !== m) : l.concat([m])));
      }));
      const add = el.querySelector('[data-rm-add]');
      if (add) add.onclick = () => {
        const n = +el.querySelector('#rm-n').value, u = +el.querySelector('#rm-u').value;
        if (!(n > 0) || n * u > 14 * 1440) { UI.invalid('מספר בין 1 ל-14 ימים'); return; }
        setList((l) => l.concat([Math.round(n * u)]));
      };
      const p = el.querySelector('[data-perm]');
      if (p) p.onclick = async () => { await Notification.requestPermission(); draw(); };
      const t = el.querySelector('[data-test]');
      if (t) t.onclick = async () => { const reg = await navigator.serviceWorker.getRegistration(); const o = { body: 'ההתראות עובדות 👍', icon: 'icon-192.png', lang: 'he', dir: 'rtl' }; if (reg) reg.showNotification('מעקב משמרות', o); else new Notification('מעקב משמרות', o); };
    },
  };

  RENDER.templates = {
    render: () => `${S.templates.length ? `<div class="list">${S.templates.map((t) => `<div class="item" style="cursor:default"><span class="role-bar" style="background:${(App.role(t.roleId) || {}).color || '#999'}"></span><span class="body"><span class="t">${esc(t.name)}</span><span class="s">${esc(App.roleName(t.roleId))} · <span class="num">⁦${t.startT}\u2060–\u2060${t.endT}⁩</span>${t.breakMin ? ` · הפסקה ${t.breakMin}` : ''}</span></span><button class="icon-btn" data-tdel="${t.id}" aria-label="מחק">${icon('trash', 's')}</button></div>`).join('')}</div>`
      : UI.emptyState('layers', 'אין תבניות', 'פתח משמרת ← "שמור כתבנית". אחר כך תוכל להוסיף אותה בלחיצה מכפתור ה-+.')}`,
    mount: (el, draw) => el.querySelectorAll('[data-tdel]').forEach((b) => (b.onclick = async () => { await App.saveOps([{ store: 'templates', del: b.dataset.tdel }], 'מחיקת תבנית', 'התבנית נמחקה'); draw(); })),
  };

  RENDER.look = {
    render: () => `<div class="section-title">ערכת צבעים</div><div class="seg" style="margin-bottom:14px">${[['system', 'לפי המערכת'], ['light', 'בהיר'], ['dark', 'כהה']].map(([k, l]) => `<button data-theme="${k}" class="${S.settings.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="section-title">צבע הדגשה</div><div class="color-pick" style="margin-bottom:16px">${Object.entries(App.ACCENTS).map(([k, a]) => `<button data-accent="${k}" class="${S.settings.accent === k ? 'on' : ''}" style="background:hsl(${a[0]} ${a[1]}% 45%)" aria-label="${a[2]}"></button>`).join('')}</div>
      ${root.Plus && root.Plus.visible() ? `<div class="section-title">כרטיס השכר בבית <span class="tag plus-tag">Plus</span></div>${root.Plus.skinTiles(root.Plus.skin(), !root.Plus.active())}` : ''}
      <div class="section-title">גופן</div>
      <div class="font-pick">${Object.entries(App.FONTS).map(([k, f]) => `<button data-font="${k}" class="${(S.settings.font || 'rubik') === k ? 'on' : ''}" style="font-family:'${f[0]}', system-ui, sans-serif"><span class="fp-sample">משמרת ערב · ${esc(f[2])}<small>${f[0]}</small></span><span class="fp-num">₪1,240</span></button>`).join('')}</div>
      <div class="section-title">גודל טקסט</div><div class="seg">${[[0.9, 'קטן'], [1, 'רגיל'], [1.1, 'גדול'], [1.2, 'גדול מאוד']].map(([k, l]) => `<button data-fs="${k}" class="${+S.settings.fontScale === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="section-title" style="margin-top:16px">מסך הבית</div>
      <div class="card"><div class="hm-recent"><span class="t">המספר הגדול בכרטיס השכר</span><div class="seg">${[['gross', 'ברוטו'], ['net', 'נטו']].map(([k, l]) => `<button data-home-big="${k}" class="${((S.settings.home || {}).big === 'net' ? 'net' : 'gross') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${F.sw('קיצורי דרך', 'ארבעה כפתורים גדולים: משמרת חדשה, הזכויות, בדיקת תלוש ומשחקים', 's.home.shortcuts', (S.settings.home || {}).shortcuts !== false)}
        ${F.sw('שורת עדכון', 'משמרת שמתקרבת, התראה חשובה או משכורת בדרך, מתחת לכפתור המשמרת', 's.home.highlight', (S.settings.home || {}).highlight !== false)}
        ${F.sw('תאריך עברי וחגים', 'בשורה שמתחת לברכה', 's.home.hebDate', (S.settings.home || {}).hebDate !== false)}
        <div class="hm-recent"><span class="t">משמרות אחרונות בבית</span><div class="seg">${[[0, 'בלי'], [3, '3'], [5, '5'], [8, '8']].map(([k, l]) => `<button data-home-recent="${k}" class="${((S.settings.home || {}).recent == null ? 3 : +(S.settings.home || {}).recent) === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
      <div class="section-title" style="margin-top:16px">פרטיות</div>
      <div class="card">${F.sw('הסתרת סכומים', 'הסכומים מטושטשים במסך, למשל כשמראים את הטלפון למישהו. העין בכרטיס השכר מציגה אותם', 's.hideMoney', !!S.settings.hideMoney)}</div>
      <div class="section-title" style="margin-top:16px">אפקטים וצלילים</div>
      <div class="card">${F.sw('אנימציות ואפקטים', 'הבזק קטן בכל לחיצה, כפתורים קופצניים וקונפטי כשמסיימים משמרת', 's.fx.effects', (S.settings.fx || {}).effects !== false)}
        ${F.sw('צלילים', 'צליל קצר ועדין בלחיצה, ו"קופה" כשנשמרת משמרת', 's.fx.sound', (S.settings.fx || {}).sound !== false)}
        ${F.sw('מוזיקה במשחקים', 'מנגינה קטנה לכל משחק (אפשר גם בכפתור התו בתוך המשחק)', 's.fx.music', (S.settings.fx || {}).music !== false)}
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
        else if (b.dataset.homeBig) await Store.setSettings((s) => { s.home = Object.assign({}, s.home, { big: b.dataset.homeBig }); });
        else if (b.dataset.homeRecent !== undefined) await Store.setSettings((s) => { s.home = Object.assign({}, s.home, { recent: +b.dataset.homeRecent }); });
        else if (b.dataset.font) await Store.setSettings((s) => { s.font = b.dataset.font; });
        else if (b.hasAttribute('data-fx-try')) { root.Fx.celebrate('big'); return; }
        else if (b.dataset.skin !== undefined && root.Plus) { if (!(await root.Plus.pickSkin(b.dataset.skin))) return; } // a locked one opens Shaati Plus
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
      : `<div class="small" style="margin-bottom:12px">קוד בן 4\u2060–\u20608 ספרות שיידרש בכל פתיחה. הקוד נשמר כגיבוב (hash) — לא כטקסט.</div><button class="btn block" data-pin-set>${icon('lock')} הגדר קוד</button>`}
      <div class="tiny muted" style="margin-top:10px">הנעילה מגינה מפני הצצה; הנתונים עצמם לא מוצפנים. שכחת את הקוד? אין שחזור — אפשר רק למחוק את נתוני האתר ולשחזר מגיבוי.</div></div>`,
    mount: (el, draw) => {
      const set = el.querySelector('[data-pin-set]');
      if (set) set.onclick = async () => {
        const p1 = await UI.promptText('קוד חדש', '4\u2060–\u20608 ספרות', '', { type: 'password', inputmode: 'numeric', ltr: true, ok: 'המשך' });
        if (!p1) return;
        if (!/^\d{4,8}$/.test(p1)) { UI.invalid('הקוד צריך להיות 4\u2060–\u20608 ספרות'); return; }
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
        row.innerHTML = `<div class="kv" style="margin:6px 0 10px"><span>${icon('finger', 's')} פתיחה בטביעת אצבע / זיהוי פנים</span><button class="btn ${on ? 'text' : 'tonal'} sm" data-bio-toggle>${on ? 'כבה' : 'הפעל'}</button></div>`;
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
      <div class="card">${F.text('מפתח API של Claude', 's.ai.apiKey', S.settings.ai.apiKey, 'נוצר ב-\u2060console.anthropic.com. נשמר רק בטלפון ולא נכלל בקובצי גיבוי.', 'type="password" autocomplete="off" dir="ltr"')}
        ${F.sel('מודל', 's.ai.model', [['claude-opus-5-5', 'Claude Opus 5.5 (מומלץ)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (זול יותר)'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (הכי זול)']], S.settings.ai.model).replace('data-s=', 'data-keep-str data-s=')}
        ${S.settings.ai.apiKey ? `<button class="btn danger block" data-ai-clear>${icon('trash')} מחק את המפתח</button>` : ''}</div>
      <div class="tiny muted" style="margin:6px 4px">השימוש מחויב בחשבון ה-\u2060API שלך אצל Anthropic. הניתוח הוא כלי עזר ואינו ייעוץ משפטי או חשבונאי.</div>`,
    mount: (el, draw) => { const c = el.querySelector('[data-ai-clear]'); if (c) c.onclick = async () => { await Store.setSettings((s) => { s.ai.apiKey = ''; }); draw(); }; },
  };

  RENDER.backup = {
    render: () => {
      const B = S.settings.backup;
      return `<div class="banner warn">${icon('cloud')}<div>הנתונים שמורים רק בטלפון הזה. שמור גיבוי ב-\u2060Google Drive כדי לא לאבד אותם אם הטלפון יוחלף או יאופס.</div></div>
        <div class="card"><div class="small">גיבוי אחרון: <b>${B.lastBackup ? U.fmtDate(U.epochKey(B.lastBackup)) + ' (' + UI.timeAgo(B.lastBackup) + ')' : 'אף פעם'}</b></div>
          <div class="btn-row" style="margin-top:12px"><button class="btn" data-bk="share">${icon('share')} גבה ושתף ל-\u2060Drive</button></div>
          <div class="btn-row" style="margin-top:8px"><button class="btn tonal" data-bk="dl">${icon('download')} הורד קובץ</button><button class="btn tonal" data-bk="files">${icon('file')} כולל קובצי תלושים</button></div></div>
        <div class="card">${F.sel('גיבוי אוטומטי', 's.backup.autoEvery', [['weekly', 'כל שבוע'], ['monthly', 'כל חודש'], ['off', 'כבוי']], B.autoEvery, S.meta.cloudUid ? 'החשבון שלך מחובר, והנתונים כבר נשמרים בענן, לכן לא יורדים קבצים אוטומטית. אפשר תמיד להוריד גיבוי ידני.' : 'בפתיחת האפליקציה, כשהגיע הזמן, קובץ גיבוי יורד אוטומטית לתיקיית ההורדות.').replace('data-s=', 'data-keep-str data-s=')}</div>
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
          if (file.size > 60 * 1024 * 1024) throw root.U.oops('הקובץ גדול מדי בשביל גיבוי של האפליקציה.');
          let json;
          try { json = JSON.parse(await file.text()); } catch (e) { throw root.U.oops('זה לא קובץ גיבוי של האפליקציה (צריך קובץ ‎.json‎ שנוצר בגיבוי).'); }
          if (!json || typeof json !== 'object' || json.app !== 'shiftpay') throw root.U.oops('זה לא קובץ גיבוי של האפליקציה.');
          const n = Array.isArray(json.shifts) ? json.shifts.length : 0;
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
          if (String(really || '').trim().toLowerCase() !== 'מחק'.toLowerCase()) { UI.toast('בוטל'); return; }
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
      <button class="item" data-x="csv"><span class="lead">${icon('table')}</span><span class="body"><span class="t">כל המשמרות — CSV</span><span class="s">נפתח ב-\u2060Excel ו-\u2060Google Sheets (עברית תקינה)</span></span></button>
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
      ${App.androidApp || navigator.standalone || (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches)
    ? `<div class="card small ab-installed">${icon('check', 's')} שעתי מותקנת כאפליקציה במכשיר הזה.</div>`
    : App.iosBrowser && App.iosBrowser()
      ? `<div class="card small">באייפון: כפתור השיתוף ← "הוספה למסך הבית" ← "הוספה".<button class="btn tonal block" style="margin-top:10px" data-act="ios-install">${icon('iosShare', 's')} הדרכה צעד אחר צעד</button></div>`
      : `<div class="card small">ב-\u2060Chrome: תפריט ⋮ ← "הוספה למסך הבית" ← "התקנה". אחרי ההתקנה: לחיצה ארוכה על האייקון ← "התחל משמרת" / "הוסף משמרת".<br>באייפון: בספארי, כפתור השיתוף ← "הוספה למסך הבית".</div>`}
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
