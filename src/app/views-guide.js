/* ============================================================
 * views-guide.js — keeping it simple for everyone:
 *  - "the first steps" card on the home screen (a short checklist
 *    with one clear next action) for a new user's first days;
 *  - coach marks: a spotlight with the mascot pointing at the main
 *    buttons, once, right after the setup questions;
 *  - words explained: tapping a dotted word (ברוטו, נטו, …) opens a
 *    plain-language explanation.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, UI, App } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const Fx = () => root.Fx;

  /* ---------------- first steps ---------------- */
  const hasNotif = () => 'Notification' in root;
  const STEPS = [
    { id: 'setup', t: 'ההגדרה הושלמה', done: () => true },
    {
      id: 'shift', t: 'רישום המשמרת הראשונה', s: 'בתחילת משמרת לוחצים "התחל משמרת". אפשר גם לרשום משמרת שכבר התקיימה.',
      done: () => !!S.activeShift || S.shifts.some((x) => x.status === 'done' && !x.demo),
      acts: [['timer-start', 'play', 'התחלת משמרת'], ['shift-new', 'plus', 'רישום משמרת']],
    },
    {
      id: 'notif', t: 'הפעלת תזכורות', s: 'תזכורת לסיים משמרת, והתראה כשמשהו בשכר לא נראה תקין.',
      done: () => !hasNotif() || Notification.permission !== 'default', acts: [['guide-notif', 'bell', 'הפעלה']],
    },
    { id: 'rights', t: 'היכרות עם הזכויות שלך', s: 'שכר מינימום לגילך, נסיעות, הפסקות, שבת ועוד.', done: () => !!S.meta.usedRights, acts: [['rights', 'shield', 'לזכויות שלי']] },
  ];
  App.guideCard = function () {
    if (!S.meta.guide || S.meta.guideDone || S.settings.demo) return '';
    if (Date.now() - S.meta.guide > 21 * U.DAY) return '';
    const st = STEPS.map((x) => Object.assign({}, x, { ok: x.done() }));
    const n = st.filter((x) => x.ok).length;
    if (n === st.length) {
      Store.setMeta({ guideDone: Date.now() }).catch(() => {});
      App.celebrateOnce('guide-done', () => { if (Fx()) Fx().celebrate('big'); UI.toast('סיימת את כל הצעדים הראשונים! 🏆'); });
      return '';
    }
    const next = st.find((x) => !x.ok);
    return `<div class="card guide">
      <div class="guide-head">${App.mascot('happy', { size: 54 })}<div class="gh-t"><b>הצעדים הראשונים שלך</b><div class="small">${n} מתוך ${st.length} · עוד ${st.length - n} ${st.length - n === 1 ? 'צעד' : 'צעדים'} וסיימת!</div></div>
        <button class="icon-btn" data-act="guide-hide" aria-label="הסתר את הצעדים">${icon('x', 's')}</button></div>
      <div class="guide-bar"><i style="width:${Math.round((n / st.length) * 100)}%"></i></div>
      <div class="guide-steps">${st.map((x) => `<div class="gs ${x.ok ? 'ok' : ''} ${x === next ? 'next' : ''}"><span class="gs-dot">${x.ok ? '✓' : ''}</span><div class="gs-b"><div class="gs-t">${x.t}</div>
        ${x === next && x.s ? `<div class="gs-s">${x.s}</div>` : ''}
        ${x === next && x.acts ? `<div class="gs-acts">${x.acts.map(([a, ic, l], i) => `<button class="btn sm ${i ? 'tonal' : 'go'}" data-act="${a}">${icon(ic, 's')} ${l}</button>`).join('')}</div>` : ''}</div></div>`).join('')}</div>
    </div>`;
  };
  App.actions['guide-hide'] = async () => {
    await Store.setMeta({ guideDone: Date.now() });
    App.rerender();
    UI.toast('אפשר תמיד לקבל עזרה בהגדרות › עזרה ותמיכה');
  };
  App.actions['guide-notif'] = async () => {
    if (hasNotif()) { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } }
    if (hasNotif() && Notification.permission === 'denied') UI.toast('ההתראות חסומות בהגדרות הדפדפן. אפשר לאשר שם בכל רגע.');
    App.rerender();
  };

  /* ---------------- coach marks ---------------- */
  /** steps: [{ el: selector | element, text, round }]. A spotlight on each, with the mascot explaining. */
  UI.coach = function (steps, done) {
    let i = -1;
    const el = document.createElement('div');
    el.className = 'coach';
    el.setAttribute('role', 'dialog');
    document.body.appendChild(el);
    // a sheet or dialog that opens meanwhile wins: the tour steps aside
    const watch = setInterval(() => { if (document.querySelector('.sheet.show, .dialog')) { i = steps.length; next(); } }, 400);
    function next() {
      i++;
      if (i >= steps.length) {
        clearInterval(watch);
        el.classList.add('out');
        setTimeout(() => el.remove(), 260);
        if (done) done();
        return;
      }
      const s = steps[i];
      const t = typeof s.el === 'string' ? document.querySelector(s.el) : s.el;
      if (!t || !t.getBoundingClientRect().width) { next(); return; }
      const r = t.getBoundingClientRect();
      const pad = 8;
      const below = r.top + r.height / 2 < innerHeight / 2;
      el.innerHTML = `<div class="coach-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border-radius:${s.round ? '50%' : '24px'}"></div>
        <div class="coach-tip ${below ? 'below' : 'above'}" style="${below ? `top:${Math.round(r.bottom + 18)}px` : `bottom:${Math.round(innerHeight - r.top + 18)}px`}">
          ${App.mascot(i === steps.length - 1 ? 'party' : 'wave', { size: 58 })}<div><div class="ct-t">${s.text}</div><div class="ct-n">${steps.length > 1 ? `${i + 1} מתוך ${steps.length} · ` : ''}לחצו להמשך</div></div></div>`;
      if (Fx()) Fx().play('pop');
    }
    el.addEventListener('click', (e) => { e.stopPropagation(); next(); });
    next();
  };

  App.views.home_mount = function () {
    // right after the setup questions: a short tour of the three things that matter
    if (!App.firstRun || S.meta.coachDone) return;
    App.firstRun = false;
    setTimeout(() => {
      if (App.tab !== 'home' || App.blocking || document.querySelector('.sheet, .dialog')) return;
      UI.coach([
        { el: '.home-action .btn.start', text: 'כשמגיעים לעבודה לוחצים כאן.<br>בסוף לוחצים "סיים משמרת". זה הכול!' },
        { el: '#nav .fab', text: 'שכחת ללחוץ? כאן מוסיפים משמרת שכבר הייתה, חופשה, בונוס ותלוש', round: true },
        { el: '.home-hero', text: 'וכאן רואים כמה הרווחת החודש.<br>לחיצה פותחת את כל הפירוט' },
      ], () => Store.setMeta({ coachDone: Date.now() }).catch(() => {}));
    }, 900);
  };

  /* ---------------- what's new (once per big update, for people who already used the app) ---------------- */
  const WHATS_NEW = {
    id: '1.21',
    items: [
      ['calendar', 'sky', 'ייבוא סידור עבודה', 'מצלמים את הסידור או מדביקים את ההודעה מוואטסאפ, והמשמרות שלך נכנסות ללוח. בהוספה (+) או בלוח השנה.'],
      ['share', 'violet', 'שיתוף ישר מוואטסאפ', 'לחיצה ארוכה על הסידור בוואטסאפ › שיתוף › Shaati. גם תלוש או דוח שעות.'],
      ['star', 'mint', 'דמי חגים', 'האפליקציה בודקת על אילו חגים מגיע לך תשלום כשלא עבדת, וכמה. בזכויות › דמי חגים.'],
      ['file', 'pink', 'דוח ומכתב למעסיק', 'משהו לא מסתדר בשכר? דוח מסודר (PDF) עם כל הממצאים והמשמרות, ומכתב מנומס מוכן. בזכויות או בדוחות.'],
      ['clock', 'amber', '"שכחת לסיים את המשמרת?"', 'משמרת שנמשכת הרבה יותר מהרגיל שלך שואלת בעדינות, עם שעת הסיום הנכונה מוכנה ללחיצה.'],
      ['sparkle', 'mint', 'פתיחה חלקה', 'האינטרו מחכה שהכול ייטען, ומסך הבית מופיע מוכן, בלי קפיצות.'],
    ],
  };



  App.whatsNew = function () {
    if (!S.settings.onboarded || S.settings.demo || S.meta.whatsNew === WHATS_NEW.id) return;
    Store.setMeta({ whatsNew: WHATS_NEW.id }).catch(() => {});
    if (S.meta.guide && Date.now() - S.meta.guide < 3 * U.DAY) return; // a brand-new user already got the tour
    // a moment after the opening show has gone (it never slides up under the leaving show)
    const later = (fn) => (root.Intro && root.Intro.after ? root.Intro.after(fn, 900) : setTimeout(fn, 1400));
    later(() => {
      if (App.blocking || document.querySelector('.sheet, .dialog, .coach')) return;
      UI.openSheet({
        title: 'מה חדש? ✨',
        body: `<div class="whats-new">${App.mascotSays('party', 'עדכנו את האפליקציה בשבילך! 🎉', { size: 72 })}
          ${WHATS_NEW.items.map(([ic, tint, t, s], i) => `<div class="wn" style="--d:${i}">${UI.tile(ic, tint)}<div><b>${esc(t)}</b><div class="small muted">${esc(s)}</div></div></div>`).join('')}</div>`,
        foot: '<button class="btn" data-wn-ok>הבנתי, תודה</button>',
        onMount: (el) => { el.querySelector('[data-wn-ok]').onclick = () => UI.closeTop(); if (Fx()) Fx().celebrate('big'); },
      });
    });
  };

  /* ---------------- words explained ---------------- */
  const TERMS = {
    gross: ['ברוטו', 'כל הכסף שהרווחת לפני שמורידים ממנו מס, ביטוח לאומי ופנסיה.'],
    net: ['נטו', 'הכסף שבאמת נכנס לחשבון הבנק, אחרי כל ההורדות. מתחת לגיל 18 בדרך כלל אין מס, אז הנטו קרוב לברוטו.'],
    ot: ['שעות נוספות', 'שעות מעבר ליום עבודה רגיל (בדרך כלל אחרי 8 שעות). השעתיים הראשונות שוות 125%, ואחר כך 150%.'],
    rest: ['שבת וחג', 'שעה שעבדת בשבת או בחג שווה לפחות 150% מהשכר הרגיל. האפליקציה יודעת לבד מתי שבת נכנסת ויוצאת לפי העיר שלך.'],
    travel: ['נסיעות', 'כסף שהמעסיק מחזיר לך על הנסיעה לעבודה ובחזרה, לכל יום עבודה, בנוסף לשכר.'],
    pension: ['פנסיה', 'חיסכון לגיל מבוגר. מגיל 21 (גברים) או 20 (נשים), אחרי חצי שנה בעבודה, המעסיק חייב להפריש לך כסף לקרן פנסיה.'],
    payslip: ['תלוש שכר', 'הדף שהמעסיק נותן כל חודש, ובו כמה שעות עבדת וכמה שילמו לך. באפליקציה אפשר לצלם אותו ולבדוק שהכול נכון.'],
    minwage: ['שכר מינימום', 'הכי מעט שמותר לשלם לשעה. מתחת לגיל 18 הוא קצת נמוך יותר, לפי הגיל. מעסיק שמשלם פחות עובר על החוק.'],
    credit: ['נקודות זיכוי', 'הנחה במס הכנסה שכל עובד מקבל. לגברים 2.25 נקודות, לנשים 2.75. יש נקודות נוספות (ילדים, תואר, שחרור מצבא) והן מופיעות בתלוש.'],
    period: ['תקופת שכר', 'הימים שעליהם מקבלים משכורת אחת. אצל רוב המעסיקים זה חודש רגיל, מה-1 ועד סוף החודש.'],
    planned: ['משמרת מתוכננת', 'משמרת עתידית שרשמת כדי לא לשכוח. היא לא נספרת בשכר עד שמסמנים שהיא בוצעה.'],
    recup: ['דמי הבראה', 'תוספת שנתית שמגיעה אחרי שנה בעבודה, לפי הוותק והיקף המשרה.'],
  };
  /** A word with a dotted underline; tapping it explains it. */
  UI.term = (key, label) => `<button class="term" data-act="term" data-term="${key}">${esc(label || (TERMS[key] || [''])[0])}</button>`;
  App.actions.term = (el, e) => {
    if (e) e.stopPropagation();
    const t = TERMS[el.dataset.term];
    if (!t) return;
    UI.dialog({ title: '', html: `<div class="term-box">${App.mascot('think', { size: 64 })}<div><h3>מה זה ${esc(t[0])}?</h3><p>${esc(t[1])}</p></div></div>`, buttons: [{ label: 'הבנתי', value: true, cls: '' }] });
  };
  App.TERMS = TERMS;
})(typeof window !== 'undefined' ? window : globalThis);
