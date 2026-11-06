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

  App.views.home_mount = function (v) {
    if (App.homeSky) App.homeSky(v);
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
    id: '1.35.0',
    // 1.34.1 was never published; 1.35.0 shows its sheet to everyone, with 1.34.0's lock-screen notification again
    seen: [],
    // true only when the items hold a real feature: a release of fixes alone opens no sheet (the user, 6 Nov 2026)
    features: true,
    items: [
      ['nfc', 'mint', 'מדבקת NFC למשמרת', 'נוגעים עם הטלפון במדבקה ליד השעון בעבודה, והמשמרת מתחילה או נגמרת. כותבים מדבקה בהגדרות › העבודה שלי.'],
      ['grid', 'sky', 'משמרת מהתפריט המהיר', 'באנדרואיד מושכים את התפריט מלמעלה ולוחצים "התחל משמרת". והווידג׳טים מדברים בשפה של האפליקציה.'],
      ['bell', 'violet', 'משמרת על מסך הנעילה', 'בזמן משמרת ההתראה מראה כמה הרווחת עד עכשיו, ואפשר לסיים בלחיצה. מדליקים בהגדרות › התראות.'],
      ['rocket', 'amber', 'הכול זז חלק', 'הפתיחה, הקמע והגרפים זזים בלי להיתקע גם כשהטלפון עסוק, והאפליקציה נפתחת מהר יותר.'],
    ],
  };



  // 23:00 to 06:00: no sheet; it waits for the next open in the day (nothing is marked as seen)
  const quietHours = () => { const h = new Date().getHours(); return h >= 23 || h < 6; };
  let wnArmed = false; // the app is in (afterLogin asked once): only then may a return from the background ask again
  App.whatsNew = function () {
    wnArmed = true;
    if (!S.settings.onboarded || S.settings.demo || S.meta.whatsNew === WHATS_NEW.id || WHATS_NEW.seen.includes(S.meta.whatsNew)) return;
    if (WHATS_NEW.features && quietHours()) return;
    Store.setMeta({ whatsNew: WHATS_NEW.id }).catch(() => {});
    if (!WHATS_NEW.features) return; // fixes only: nothing to show
    if (S.meta.guide && Date.now() - S.meta.guide < 3 * U.DAY) return; // a brand-new user already got the tour
    // a moment after the opening show has gone (it never slides up under the leaving show)
    const later = (fn) => (root.Intro && root.Intro.after ? root.Intro.after(fn, 900) : setTimeout(fn, 1400));
    later(() => {
      if (App.blocking || document.querySelector('.sheet, .dialog, .coach')) return;
      UI.openSheet({
        title: 'מה חדש? ✨',
        body: `<div class="whats-new">${App.mascotSays('party', 'עדכנו את האפליקציה בשבילך! 🎉', { size: 72 })}
          ${WHATS_NEW.items.map(([ic, tint, t, s], i) => `<div class="wn" style="--d:${i}">${UI.tile(ic, tint)}<div><b>${esc(t)}</b><div class="small muted">${esc(s)}</div></div></div>`).join('')}</div>`,
        foot: '<button class="btn tonal" data-act="changelog" style="flex:0 0 auto">כל העדכונים</button><button class="btn" data-wn-ok>הבנתי, תודה</button>',
        onMount: (el) => { el.querySelector('[data-wn-ok]').onclick = () => UI.closeTop(); },
      });
    });
  };

  // a phone often brings the app back from the background instead of starting it again: a sheet held back at night
  // shows on that return too
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden && wnArmed && !App.blocking) App.whatsNew(); });

  /* ---------------- every update (settings › about › all the updates) ---------------- */
  // newest first: [version, the day it went out, what changed — said to the user, not to a developer]
  const CHANGELOG = [
    ['1.35.0', '2026-11-07', 'מדבקת NFC שמתחילה ומסיימת משמרת בנגיעה (הגדרות › העבודה שלי). באנדרואיד: התחלת משמרת מהתפריט המהיר, והווידג׳טים בשפה של האפליקציה. הפתיחה, הקמע והגרפים זזים בלי להיתקע, והאפליקציה נפתחת מהר יותר. שמירה בלי שינוי לא נשמרת שוב, ולחיצה כפולה עושה פעולה אחת. הודעות השגיאה אומרות מה קרה ומה עושים, ויצירת קוד מקום עבודה עובדת שוב.'],
    ['1.34.0', '2026-11-07', 'בזמן משמרת אפשר להדליק התראה קבועה עם הסכום עד עכשיו וכפתור ״סיום משמרת״ (הגדרות › התראות). הפתיחה של האפליקציה חלקה יותר: השמיים זזים מהרגע הראשון, והכפתורים עולים יחד עם החלונית. באתר יש דף לארגונים ולבתי ספר שמשבצים את מחשבון המשמרת באתר שלהם, ובלוח הניהול יש משפך לפי תקופה ומכשיר.'],
    ['1.33.0', '2026-11-06', 'שאלות הפתיחה שואלות אם ההפסקה בתשלום וכמה ימים בשבוע עובדים, ומס הכנסה עד גיל 18 מחושב לפי המדרגות. מסך הבית רגוע יותר, עם שני כרטיסים לכל היותר ושורה מתחת לכרטיס השכר על מה החישוב מניח. מה חדש מופיע רק על דברים חדשים באמת, ואף פעם לא בלילה. בסוף משמרת רואים מה נוסף לשכר, ובמשמרת של נוער מופיעה שורה לפי חוק עבודת הנוער. ביום המשכורת שעתי שואלת אם המשכורת הגיעה, והנטו לומד מהתשובות. דיווח שגיאות נשלח רק עם הסכמה לסטטיסטיקה ונמחק אחרי 30 יום. בבדיקת התלוש: הסיבות הפשוטות לפער לפני המכתב, וכל שורה מוסברת בשפה שלך. קוד מקום עבודה משתף את החוקים עם החברים לעבודה, והסידור מראה איזו משמרת הכי משתלמת ומה ישתנה אם תחליפו. יומן המשמרות החתום נכנס לדוח השעות ולדוח לבירור מול המעסיק, ואפשר להשוות את דוח הנוכחות למשמרות לפני יום המשכורת. המטבע קורא בקול את שאלות הפתיחה ומגיב, ובאתר יש מחשבון לשכר משמרת. תיקונים: החצים בשורות נפתחות בעברית ובערבית, טבלאות הדוחות, וסכום שלא נשבר אחרי סוגריים.'],
    ['1.32.5', '2026-11-05', 'באפליקציית האנדרואיד מתחילים ומסיימים משמרת ישר מהווידג׳ט במסך הבית, בלי לפתוח את שעתי. המשמרת נשמרת כשפותחים את האפליקציה.'],
    ['1.32.4', '2026-11-04', 'שעתי באמהרית, השפה השביעית. באייפון האפליקציה נפתחת גם ב-Safari ישן, החלונות לא נחתכים מתחת לסרגל, ובאתר יש הסבר איך מוסיפים אותה למסך הבית. כשפותחים מהאתר, הגרסה החדשה עולה כבר בפתיחה. טבלת האלופים מראה את 20 הראשונים ונטענת מהר יותר. באפליקציית האנדרואיד יש ווידג׳טים למסך הבית, בשישה סגנונות.'],
    ['1.32.3', '2026-11-03', 'מחיקת כל הנתונים מהגיבוי עובדת גם בחשבון עם סיסמה. פנייה לתמיכה שולחת רק את מערכת ההפעלה והדפדפן, בלי דגם הטלפון. מדיניות הפרטיות מפרטת בדיוק מה נשאר אחרי מחיקת חשבון.'],
    ['1.32.2', '2026-11-03', 'אפשר לדווח לצוות על כינוי לא מתאים בטבלת האלופים ועל תשובה לא תקינה של עוזר ה-\u2060AI. באפליקציית האנדרואיד מופיעה רק דרך התשלום של Google Play.'],
    ['1.32.1', '2026-11-03', 'אבטחה: כדי לבטל את נעילת הקוד או לשנות אותה צריך את הקוד הנוכחי, ובזמן שהאפליקציה נעולה אי אפשר להגיע למה שמתחתיה. קובץ גיבוי לא כולל את הקוד, ושחזור מקובץ של מישהו אחר לא משנה את מה שמוצג במסכים. כינוי בטבלת האלופים לא יכול להתחזות לצוות האפליקציה.'],
    ['1.32.0', '2026-11-02', 'כניסה עם אימייל וסיסמה, ומצב אורח: הנתונים נשמרים רק בטלפון עד שמחברים חשבון. לכל תפקיד אפשר לבחור אימוג׳י או תמונה מהטלפון. סטטיסטיקת שימוש נשלחת רק אחרי הסכמה, ובתחרות עם החברים הסכומים מוסתרים עד שבוחרים להציג אותם. בפתיחה כפתור הכניסה הוא הראשי, והפעולות המהירות עולות יחד איתה. קל יותר ללחוץ על כפתורים קטנים, הטקסט הקטן גדל, וקוראי מסך עובדים טוב יותר בחלונות. מדיניות הפרטיות, תנאי השימוש והצהרת הנגישות עודכנו.'],
    ['1.31.0', '2026-11-02', 'פעולות מהירות בפתיחה: התחלת משמרת עם בחירת תפקיד, רישום משמרת, החודש עד עכשיו ולוח השנה, וכפתור כניסה לאפליקציה. הפתיחה בלי צליל. בכניסה הראשונה מסך השפות מופיע מיד, בלי לחכות שכל האפליקציה תיטען.'],
    ['1.30.0', '2026-11-02', 'פתיחה חדשה עם שמיים חיים לפי השעה, העונה ומזג האוויר בעיר שלך, וברכה בשמך. משתמש חדש יכול להיכנס כבר במסך הראשון לחשבון שכבר יש לו, ובשאלות הפתיחה אפשר להוסיף עוד מקום עבודה. מסך הנעילה וההתחברות בעיצוב החדש.'],
    ['1.29.1', '2026-11-01', 'מראה חדש בכחול לילה וזהב, פתיחה מהירה יותר ולחיצות רכות. ואבטחה: קובץ גיבוי ממישהו אחר לא יכול לשנות את האפליקציה, נעילת הקוד חזקה יותר, וקישור או קובץ ששותף לא משנים כלום בלי אישור שלך.'],
    ['1.29.0', '2026-10-30', 'בדיקת החזר מס: כמה מס נלקח ממך מיותר בכל שנה, עד 6 שנים אחורה, לפי המשמרות, התלושים או טופס 106, ואיך מקבלים אותו בחזרה. פתיחה חדשה: שעון יוקרה בלילה, מדויק ושקט, עם צלצול רך אחד. קצרה פי שניים, ואף פעם לא מחכה לרשת.'],
    ['1.28.0', '2026-10-29', 'מצב פרטיות חזק עם אנימציה על כל הסכומים, בלי הבהובים בכרטיס השכר ובמסכים, האינטרו לא נתקע גם ברשת איטית, וטקסט שלא נחתך ולא נשבר בשום שפה. שעות נוספות לפי החוק כאפשרות בהגדרות, ורשימת כל העדכונים.'],
    ['1.27.0', '2026-10-29', 'שעות נוספות לפי החוק: לפי שבוע העבודה, משמרת לילה ו-42 שעות בשבוע, גם לנוער.'],
    ['1.26.0', '2026-10-28', 'התחרות עם החברים, והשם הפרטי שלך במקום כינוי.'],
    ['1.25.0', '2026-10-28', 'מסך הבית כמו שנוח לך, והנטו כמספר הגדול בכרטיס השכר.'],
    ['1.24.0', '2026-10-28', 'הדרכה להתקנה באייפון, טקסטים שלמים בכל שפה, והאתר פותח תמיד את הגרסה העדכנית.'],
    ['1.23.0', '2026-10-28', 'צרפתית וספרדית, תזכורות למשמרת בשליטה מלאה, משכורת חודשית ממוצעת, ונתוני החוק של השנה.'],
    ['1.22.2', '2026-10-28', 'אישור משמרות שעברו, דוח שעות כקובץ PDF, וצפי שכולל משמרות מתוכננות.'],
    ['1.22.1', '2026-10-23', 'תרגומים ארוכים יורדים שורה בין מילים במקום להיחתך.'],
    ['1.22.0', '2026-10-23', 'שעתי באנגלית, ברוסית ובערבית.'],
    ['1.21.1', '2026-10-23', 'דוח שעות מתמונה נקרא כטבלה, וכרטיס השכר לא מהבהב בסוף הפתיחה.'],
    ['1.21.0', '2026-10-22', 'סידור עבודה מתמונה או מוואטסאפ, תשלום על חגים, דוח ומכתב למעסיק, ו"שכחת לסיים?".'],
    ['1.20.3', '2026-10-22', 'מסך הפתיחה נשאר עד שהאפליקציה מוכנה, ועדכונים נכנסים רק ברקע.'],
    ['1.20.2', '2026-10-22', 'מעבר חלק ממסך הפתיחה למסך הבית.'],
    ['1.20.1', '2026-10-21', 'עיצוב לכרטיס השכר עם תמונה משלך.'],
    ['1.20.0', '2026-10-21', 'מסך פתיחה חדש, ווידג\'טים למסך הבית, הגדרות מסודרות ותעריפים מיוחדים.'],
    ['1.19.0', '2026-10-17', 'בחירת מקום מכל היישובים בישראל, ו"המיקום שלי".'],
    ['1.18.0', '2026-10-17', 'רגעים קטנים בתחילת משמרת, הפסקות לפי החוק, פחות התראות, ומשיכה לרענון שלא נתקעת.'],
    ['1.17.0', '2026-10-16', 'המשחקים התעוררו: צבע, ניצוצות, צלילים וכוכבים.'],
    ['1.16.2', '2026-10-16', 'טבעת המגע חזרה לכל כפתור, ומילים לא נשברות באמצע.'],
    ['1.16.1', '2026-10-16', 'ספירה לאחור ליום המשכורת במסך הבית.'],
    ['1.16.0', '2026-10-16', 'כל כפתור מגיב ללחיצה, "לחיצה נוספת על חזרה כדי לצאת", רצפים במשחקים ושיתוף המקום שלך.'],
    ['1.15.1', '2026-10-15', 'משיכה לרענון חלקה יותר, ומתג נסיעות מעל רשימות המשמרות.'],
    ['1.15.0', '2026-10-15', 'מוזיקה במשחקים, ומשיכה לרענון בעיצוב של שעתי.'],
    ['1.14.2', '2026-10-15', 'ההצעה של Shaati Plus במסך הבית חוזרת רק יום אחרי שסוגרים אותה.'],
    ['1.14.1', '2026-10-15', 'טבלת האלופים מתחלפת בלי הבהוב.'],
    ['1.14.0', '2026-10-15', 'טבלת האלופים, ניתוח מתקדם וניסיון חינם.'],
    ['1.12.0', '2026-10-15', 'Shaati Plus: רכישה לא חובה דרך Google Play.'],
    ['1.11.5', '2026-10-15', 'בלי הבהוב במעבר בין המסכים.'],
    ['1.11.4', '2026-10-15', 'לוח משחק הזוגות מתאים גם למסך רחב ונמוך.'],
    ['1.11.3', '2026-10-15', 'בלילה שבו מזיזים את השעון, עורך המשמרת מראה בדיוק מה משולם.'],
    ['1.11.2', '2026-10-15', 'קיצורי הדרך במסך הבית מתאימים לטלפונים קטנים ולטקסט גדול.'],
    ['1.11.1', '2026-10-15', 'היסטוריה ארוכה נפתחת מהר, ותגיות המשמרת תמיד נראות.'],
    ['1.11.0', '2026-10-15', 'שני משחקים חדשים ומדליות חדשות.'],
    ['1.10.7', '2026-10-15', 'הסרגל התחתון לא קופץ במעבר בין מסכים.'],
    ['1.10.6', '2026-10-14', 'משיכה לרענון בלי הבהובים.'],
    ['1.10.5', '2026-10-14', 'מעבר בין מסכים וגלגל השעות בלי גמגום.'],
    ['1.10.4', '2026-10-14', 'כפתור החזרה לא סוגר את האפליקציה בטעות.'],
    ['1.10.3', '2026-10-14', 'בוחר התאריך והשעה נפתח בלי הבהוב, ועדכונים מגיעים גם כשהאפליקציה נשארת פתוחה.'],
    ['1.10.2', '2026-10-14', 'בלי ריצודים בבוררים, בחלונות ובמסך הבית.'],
    ['1.10.1', '2026-10-14', 'חיפוש בהגדרות, מספרים בטוחים יותר וגיבויים שקטים.'],
    ['1.10.0', '2026-10-14', 'חיסכון למשהו שרוצים לקנות.'],
    ['1.9.2', '2026-10-14', 'נתונים פגומים לא שוברים את האפליקציה.'],
    ['1.9.1', '2026-10-14', 'נגישות בכל המסכים, במצב בהיר ובמצב כהה.'],
    ['1.9.0', '2026-10-14', 'סיכום חודשי כמו סטורי, ואוסף מדליות.'],
    ['1.8.1', '2026-10-14', 'תיקונים בכפתור החזרה, במשיכה לרענון ובאבטחה.'],
    ['1.8.0', '2026-10-14', 'משחקים, בדיקת תלוש בעיצוב חדש וגרפים חיים.'],
    ['1.7.2', '2026-10-13', 'תנועה חיה ועדינה בכל האפליקציה.'],
    ['1.7.1', '2026-10-13', 'ליטוש של העיצוב.'],
    ['1.7.0', '2026-10-13', 'כניסה ראשונה אמינה, עיצוב חדש, פנייה לתמיכה ובוררים חדשים.'],
    ['1.6.0', '2026-10-13', 'שאלות היכרות לפני ההתחברות, וחיפוש זכויות מיידי.'],
    ['1.5.0', '2026-10-13', 'חלונות מהירים ויציבים יותר.'],
    ['1.4.1', '2026-10-13', 'מסך בית רגוע ומעבר יציב בין המסכים.'],
    ['1.4.0', '2026-10-12', 'אנימציית פתיחה, משיכה לרענון והפתעות קטנות.'],
    ['1.3.1', '2026-10-12', 'עדכונים מותקנים בשקט.'],
    ['1.3.0', '2026-10-12', 'שעתי: שם ולוגו חדשים, ואפקטים במגע.'],
    ['1.2.0', '2026-10-12', 'מחיקת חשבון, מסמכים משפטיים פתוחים לכולם והשוואות ברורות יותר.'],
    ['1.1.1', '2026-10-12', 'גופן Rubik, ובחירת גופן בהגדרות.'],
    ['1.1.0', '2026-10-12', 'התחברות עם Google וגיבוי בענן, עוזר חכם ותאריך לידה.'],
    ['1.0.0', '2026-10-11', 'הגרסה הראשונה: מעקב משמרות ושכר.'],
  ];
  App.CHANGELOG = CHANGELOG;
  App.actions.changelog = () => {
    const mine = root.APP_VERSION;
    UI.openSheet({
      title: 'כל העדכונים',
      cls: 'changelog-sheet',
      body: `<ol class="cl-list">${CHANGELOG.map(([v, d, t]) => `<li class="cl-row${v === mine ? ' cl-now' : ''}"><div class="cl-v"><b dir="ltr">${v}</b><span>${U.fmtDate(d)}</span></div><div class="cl-t">${v === mine ? '<span class="tag good">הגרסה שלך</span> ' : ''}${esc(t)}</div></li>`).join('')}</ol>`,
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
  App.actions.term = async (el, e) => {
    if (e) e.stopPropagation();
    const t = TERMS[el.dataset.term];
    if (!t) return;
    // the net: what the salaries that arrived taught (app/salary-check.js), with a way back to the plain calculation
    const learned = el.dataset.term === 'net' && App.netLearnHtml ? App.netLearnHtml() : '';
    const buttons = [{ label: 'הבנתי', value: true, cls: '' }];
    if (learned) buttons.push({ label: 'איפוס התיקון', value: 'reset', cls: 'text' });
    const v = await UI.dialog({ title: '', html: `<div class="term-box">${App.mascot('think', { size: 64 })}<div><h3>מה זה ${esc(t[0])}?</h3><p>${esc(t[1])}</p></div></div>` + learned, buttons });
    if (v === 'reset') App.actions['net-learn-reset']();
  };
  App.TERMS = TERMS;
})(typeof window !== 'undefined' ? window : globalThis);
