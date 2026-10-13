/* ============================================================
 * views-rights.js — "my rights": an offline guide to workers'
 * rights in Israel, checked against the user's own data (age,
 * rates, seniority, settings). Works without internet and without
 * an AI key; the AI assistant is offered for anything else.
 * General information, not legal advice; every topic links to
 * Kol Zchut (kolzchut.org.il) for the full rules.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Store, UI, App } = root;
  const S = Store.S;
  const { icon, esc } = UI;

  const KZ = (page) => 'https://www.kolzchut.org.il/he/' + encodeURIComponent(page.replace(/ /g, '_'));
  const KZS = (q) => 'https://www.kolzchut.org.il/w/index.php?search=' + encodeURIComponent(q);
  const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${esc(text || 'למידע המלא ב"כל זכות"')} ↗</a>`;

  /* ---------------- the guide (general rules, short and plain) ---------------- */
  const TOPICS = [
    { id: 'minwage', ic: 'wallet', t: 'שכר מינימום', b: (c) => `<p>מאפריל 2026: <b>35.40 ₪ לשעה</b> לעובד מגיל 18. לנוער: עד גיל 16 – 26.07 ₪, בגיל 16 – 27.94 ₪, בגיל 17 – 30.92 ₪.</p><p>${c.mw.youth ? `לגיל שלך (${c.mw.age}) המינימום הוא <b>${U.money(c.mw.hourly)}</b>.` : c.mw.age != null ? `המינימום שחל עליך: <b>${U.money(c.mw.hourly)}</b>.` : 'הוסף תאריך לידה בהגדרות כדי לראות את המינימום לגילך.'} מעסיק רשאי לשלם יותר, אבל לא פחות.</p>`, l: () => link(KZ(App.isMinorNow() ? 'שכר מינימום לנוער' : 'שכר מינימום')) },
    { id: 'overtime', ic: 'clock', t: 'שעות נוספות', b: () => '<p>השעתיים הראשונות מעבר ליום עבודה רגיל משולמות ב-<b>125%</b>, ומעבר לכך ב-<b>150%</b>. גם מעבר ל-42 שעות בשבוע מתחילות שעות נוספות.</p><p>באפליקציה: הגדרות › חוקי חישוב (מתי מתחילות ובאיזה אחוז).</p>', l: () => link(KZS('גמול שעות נוספות')) },
    { id: 'shabbat', ic: 'candle', t: 'שבת וחגים', b: () => '<p>עבודה במנוחה השבועית (לרוב שבת) משולמת לפחות ב-<b>150%</b>. השעות נקבעות לפי כניסת ויציאת השבת, והאפליקציה מחשבת אותן לפי העיר שלך.</p><p>עובד שעתי זכאי בדרך כלל גם ל<b>דמי חגים</b> אחרי 3 חודשי עבודה, על חג שחל ביום חול, בתנאים שבצו ההרחבה.</p>', l: () => link(KZS('גמול עבודה במנוחה השבועית')) },
    { id: 'breaks', ic: 'coffee', t: 'הפסקות ומנוחה', b: () => '<p>ביום עבודה של <b>6 שעות ומעלה</b> מגיעה הפסקה של <b>45 דקות</b>, מתוכן חצי שעה ברצף. בין שני ימי עבודה, ומנוחה שבועית של 36 שעות רצופות לפחות.</p>', l: () => link(KZS('הפסקות בעבודה')) },
    { id: 'travel', ic: 'car', t: 'נסיעות', b: (c) => `<p>המעסיק חייב להחזיר את הוצאות הנסיעה לעבודה ובחזרה, לפי מחיר תחבורה ציבורית ועד תקרה יומית שמתעדכנת מדי שנה. ההחזר הוא בנוסף לשכר.</p><p>${c.travel > 0 ? `באפליקציה מוגדר החזר של <b>${U.money(c.travel)}</b> ליום עבודה.` : 'באפליקציה <b>לא מוגדר</b> החזר נסיעות. אפשר להגדיר בהגדרות › נסיעות ותקופת שכר.'}</p>`, l: () => link(KZS('החזר הוצאות נסיעה לעבודה')) },
    { id: 'sick', ic: 'thermo', t: 'דמי מחלה', b: (c) => `<p>צוברים <b>1.5 ימי מחלה</b> לכל חודש עבודה מלא (עד 90). התשלום: היום הראשון – 0%, השני והשלישי – 50%, מהרביעי – 100%. צריך אישור מחלה.</p>${c.bal ? `<p>הצבירה שלך לפי האפליקציה: <b>${U.num(c.bal.sickAccrued - c.bal.sickUsed, 1)}</b> ימים.</p>` : ''}`, l: () => link(KZS('דמי מחלה')) },
    { id: 'vacation', ic: 'beach', t: 'חופשה שנתית', b: (c) => `<p>מגיעים ימי חופשה בתשלום לפי הוותק והיקף המשרה. אסור לוותר עליהם, וכשעוזבים את העבודה מקבלים פדיון על הימים שלא נוצלו.</p>${c.bal ? `<p>היתרה שלך לפי האפליקציה: <b>${U.num(c.bal.vacationAccrued - c.bal.vacationUsed, 1)}</b> ימים.</p>` : ''}`, l: () => link(KZS('חופשה שנתית')) },
    { id: 'recup', ic: 'gift', t: 'דמי הבראה', b: (c) => `<p>אחרי <b>שנת עבודה</b> מגיעים דמי הבראה: מספר ימים לפי הוותק, כפול תעריף יום הבראה, לפי היקף המשרה.</p><p>${c.bal && c.bal.recuperation ? (c.bal.recuperation.eligible ? `לפי האפליקציה מגיעים לך כ-<b>${U.money(c.bal.recuperation.amount, 0)}</b> לשנה.` : `לפי תאריך תחילת העבודה, הזכאות מתחילה ב-${U.fmtDate(c.bal.recuperation.eligibleFrom)}.`) : 'הגדר תאריך תחילת עבודה כדי לחשב.'}</p>`, l: () => link(KZS('דמי הבראה')) },
    { id: 'pension', ic: 'shield', t: 'פנסיה', b: (c) => `<p>חובה מגיל <b>21 לגבר ו-20 לאישה</b>, אחרי 6 חודשי עבודה (3 חודשים אם כבר יש לך קרן פעילה). ההפרשה: 6% ממך, 6.5% מהמעסיק ועוד 6% לפיצויים.</p><p>${c.pension}</p>`, l: () => link(KZ('ביטוח פנסיוני לעובדים')) },
    { id: 'payslip', ic: 'receipt', t: 'תלוש שכר ומועד תשלום', b: () => '<p>מגיע לך <b>תלוש שכר</b> מפורט כל חודש, והשכר צריך להיות משולם עד <b>ה-9 בחודש</b> שאחרי חודש העבודה. איחור מזכה בפיצוי הלנת שכר.</p><p>האפליקציה בודקת את התלוש מול המשמרות שרשמת (כפתור +, "תלוש שכר").</p>', l: () => link(KZS('תלוש שכר')) },
    { id: 'deduct', ic: 'minus', t: 'ניכויים מהשכר', b: () => '<p>מותר לנכות מהשכר רק ניכויי חובה (מס, ביטוח לאומי, פנסיה) וניכויים שהסכמת להם בכתב. <b>קנסות</b>, חוסרים בקופה או ציוד שנשבר – בדרך כלל אסור לנכות בלי הסכמה.</p>', l: () => link(KZS('ניכויים משכר עבודה')) },
    { id: 'leave', ic: 'alert', t: 'פיטורים והתפטרות', b: () => '<p>לפני פיטורים מגיע <b>שימוע</b>, ומגיעה <b>הודעה מוקדמת</b> לפי הוותק (גם כשמתפטרים צריך לתת הודעה מוקדמת). אחרי שנת עבודה, בפיטורים מגיעים גם <b>פיצויים</b>.</p>', l: () => link(KZS('הודעה מוקדמת לפיטורים ולהתפטרות')) },
  ];
  const YOUTH = (R, age) => [
    ['clock', `עד <b>${R.dayHours} שעות ביום</b> ועד <b>40 בשבוע</b>${R.dayHours === 9 ? ' (9 רק במקום עבודה של 5 ימים)' : ''}.`],
    ['moon', `<b>אסור לעבוד בלילה</b>: ${age < 16 ? 'בין 20:00 ל-08:00' : 'בין 22:00 ל-06:00'}, אלא בהיתר מיוחד.`],
    ['coffee', 'ביום של יותר מ-6 שעות: <b>45 דקות הפסקה</b>, חצי שעה ברצף.'],
    ['candle', 'ביום שישי ובערב חג: עד <b>7 שעות</b>.'],
    ['shield', 'צריך <b>אישור רפואי</b> לפני תחילת העבודה, ותוך 7 ימים המעסיק צריך לתת לך <b>הודעה בכתב על תנאי העבודה</b> (שכר לשעה, שעות).'],
    ['car', '<b>החזר נסיעות</b> מגיע גם לנוער, בנוסף לשכר.'],
    ['wallet', 'מתחת לגיל 18 בדרך כלל <b>לא מנוכים</b> מס הכנסה, ביטוח לאומי ומס בריאות, כך שהנטו קרוב לברוטו.'],
  ];

  App.isMinorNow = () => { const a = Engine.ageAt(S.settings.birthDate, U.todayKey()); return a != null && a < 18; };

  /* ---------------- personal context and quick checks ---------------- */
  function context() {
    const today = U.todayKey();
    const emp = S.employers[0];
    const mw = Engine.minWageFor(S.settings, today);
    const age = Engine.ageAt(S.settings.birthDate, today);
    const bal = S.settings.startDate ? Engine.leaveBalances(App.model, today) : null;
    const minAge = Engine.pensionMinAge(S.settings);
    let pension;
    if (age != null && age < minAge) pension = `לפי הגיל שלך, ההפרשה החובה תתחיל בגיל ${minAge}${S.settings.gender ? '' : ' (ציין מגדר בהגדרות לדיוק)'}.`;
    else if (!S.settings.startDate) pension = 'הגדר תאריך תחילת עבודה כדי לדעת ממתי מגיעה הפרשה.';
    else {
      const from = U.addMonths(S.settings.startDate, +S.settings.pension.startAfterMonths || 6);
      pension = from <= today ? 'לפי הוותק שלך, אמורה להיות הפרשה לפנסיה בתלוש.' : `לפי הוותק שלך, ההפרשה צריכה להתחיל ב-${U.fmtDate(from)}.`;
    }
    return { today, emp, mw, age, bal, pension, travel: +emp.travelPerDay || 0 };
  }
  function checks(c) {
    const rows = [];
    for (const r of App.roles()) {
      const rate = Engine.roleRate(r, c.today);
      if (!(rate > 0)) continue;
      const ok = rate + 0.005 >= c.mw.hourly;
      rows.push([ok ? 'ok' : 'bad', `${esc(r.name)}: ${U.money(rate)} לשעה`, ok ? `מעל המינימום${c.mw.youth ? ' לגילך' : ''} (${U.money(c.mw.hourly)})` : `נמוך מהמינימום${c.mw.youth ? ' לגילך' : ''}: ${U.money(c.mw.hourly)}`]);
    }
    rows.push(c.travel > 0 ? ['ok', 'החזר נסיעות', `${U.money(c.travel)} ליום עבודה`] : ['warn', 'החזר נסיעות', 'לא הוגדר באפליקציה. רוב העובדים זכאים לו']);
    if (c.bal) {
      rows.push(['info', 'יתרת חופשה', `${U.num(c.bal.vacationAccrued - c.bal.vacationUsed, 1)} ימים`]);
      rows.push(['info', 'ימי מחלה צבורים', `${U.num(c.bal.sickAccrued - c.bal.sickUsed, 1)} ימים`]);
      if (c.bal.recuperation) rows.push(c.bal.recuperation.eligible ? ['ok', 'דמי הבראה', `כ-${U.money(c.bal.recuperation.amount, 0)} לשנה`] : ['info', 'דמי הבראה', `מ-${U.fmtDate(c.bal.recuperation.eligibleFrom, 'short')}`]);
    } else rows.push(['warn', 'ותק, חופשה והבראה', 'הגדר תאריך תחילת עבודה כדי לחשב']);
    rows.push(['info', 'פנסיה', c.pension]);
    return rows;
  }
  const MARK = { ok: ['okc', 'var(--good)'], bad: ['alert', 'var(--bad)'], warn: ['alert', 'var(--warn)'], info: ['info', 'var(--on-surface-var)'] };

  function render() {
    const c = context();
    const minor = c.age != null && c.age < 18;
    const R = minor ? Engine.youthRules(c.age, S.settings.leave && S.settings.leave.workWeek) : null;
    const sub = [c.age != null ? 'גיל ' + c.age : 'גיל לא הוזן', c.bal ? 'ותק ' + U.num(c.bal.seniorityYears, 1) + ' שנים' : null].filter(Boolean).join(' · ');
    return `<div class="rights">
      <div class="rt-intro">${icon('shield')}<div><b>מה מגיע לך בעבודה</b><div class="tiny muted">${esc(sub)} · מעודכן לאפריל 2026 · עובד גם בלי אינטרנט</div></div></div>
      <input class="input rt-search" type="search" placeholder="חיפוש: שבת, נסיעות, הבראה…" aria-label="חיפוש בזכויות" enterkeyhint="search">
      <div class="rt-results" aria-live="polite" hidden></div>
      <div class="rt-main">
      <div class="section-title">${icon('check', 's')} בדיקה מהירה של הנתונים שלך</div>
      <div class="card rt-checks">${checks(c).map(([k, t, d]) => `<div class="rt-row"><span class="rt-mark" style="color:${MARK[k][1]}">${icon(MARK[k][0], 's')}</span><div><div class="t">${t}</div><div class="d">${esc(d)}</div></div></div>`).join('')}</div>
      ${minor ? `<div class="section-title">${icon('users', 's')} לבני נוער (גיל ${c.age})</div>
        <div class="card rt-youth" data-topic="נוער לילה הפסקה שעות אישור רפואי">${YOUTH(R, c.age).map(([ic, t]) => `<div class="rt-row"><span class="rt-mark">${icon(ic, 's')}</span><div class="t">${t}</div></div>`).join('')}
        <div class="tiny" style="margin-top:8px">${link(KZ('חוק עבודת הנוער'), 'חוק עבודת הנוער ב"כל זכות"')}</div></div>` : ''}
      <div class="section-title">${icon('list', 's')} המדריך</div>
      <div class="card rt-topics">${TOPICS.map((tp) => `<details class="rt-topic" data-topic="${esc(tp.t)}"><summary>${icon(tp.ic, 's')}<span>${tp.t}</span><span class="chev">${icon('left', 's')}</span></summary><div class="rt-body">${tp.b(c)}<div class="tiny">${tp.l()}</div></div></details>`).join('')}</div>
      <div class="section-title">${icon('alert', 's')} משהו לא בסדר?</div>
      <div class="card rt-help">
        <ol><li><b>תעד</b>: האפליקציה כבר שומרת את המשמרות. אפשר להפיק דוח PDF בדוחות.</li>
        <li><b>דבר עם המעסיק</b>: בניתוח תלוש יש הודעה מנומסת מוכנה לשליחה.</li>
        <li><b>קבל עזרה</b>: ${link(KZS('הגשת תלונה על הפרת חוקי עבודה'), 'איך מגישים תלונה')} · ${link('https://www.kolzchut.org.il/he/', 'כל זכות')}</li></ol>
        <button class="btn tonal block" data-rt-ai>${icon('sparkle')} שאלה אחרת? שאל את העוזר</button>
      </div>
      </div>
      <div class="tiny muted" style="margin:12px 4px 4px">מידע כללי בלבד ואינו ייעוץ משפטי. תנאים בהסכם קיבוצי, בצו הרחבה או בחוזה שלך יכולים להיות טובים יותר.</div>
    </div>`;
  }

  /* ---------------- search: the answer appears right under the box ---------------- */
  // extra words people actually type, per topic
  const KEYWORDS = {
    minwage: 'משכורת תעריף כמה מגיע לשעה שכר נוער גיל', overtime: 'נוספות ארוכה 125 150 שעות',
    shabbat: 'שבת חג חגים מנוחה 150 סופש', breaks: 'הפסקה מנוחה אוכל ארוחה', travel: 'נסיעות נסיעה אוטובוס רב קו דלק תחבורה',
    sick: 'מחלה חולה אישור רופא', vacation: 'חופש חופשה ימי חופש', recup: 'הבראה', pension: 'פנסיה קרן גמל חיסכון הפרשה',
    payslip: 'תלוש משכורת מתי מקבלים הלנה איחור תשלום', deduct: 'ניכוי קנס חוסר קופה ציוד הורדה מהשכר',
    leave: 'פיטורים פיטרו התפטרות פיצויים שימוע הודעה מוקדמת עזיבה',
  };
  const strip = (h) => h.replace(/<[^>]+>/g, ' ');
  const norm = (s) => s.replace(/[\u0591-\u05C7"'׳״.,:;()?!–-]/g, ' ').replace(/\s+/g, ' ').trim();
  function searchIndex(c) {
    const minor = c.age != null && c.age < 18;
    const items = TOPICS.map((tp) => ({ t: tp.t, ic: tp.ic, html: tp.b(c) + `<div class="tiny">${tp.l()}</div>`, extra: KEYWORDS[tp.id] || '' }));
    if (minor) {
      const R = Engine.youthRules(c.age, S.settings.leave && S.settings.leave.workWeek);
      items.unshift({ t: `לבני נוער (גיל ${c.age})`, ic: 'users', html: YOUTH(R, c.age).map(([, t]) => `<p>${t}</p>`).join('') + `<div class="tiny">${link(KZ('חוק עבודת הנוער'), 'חוק עבודת הנוער ב"כל זכות"')}</div>`, extra: 'נוער לילה הפסקה שעות 18 גיל אישור רפואי' });
    }
    return items.map((it) => Object.assign(it, { text: norm(it.t + ' ' + strip(it.html) + ' ' + it.extra) }));
  }
  /** Every word must appear; a Hebrew prefix letter (ו ה ב ל מ ש כ) on a word is optional. */
  function matches(text, query) {
    return norm(query).split(' ').filter(Boolean).every((w) => text.includes(w) || (w.length > 3 && /^[והבלמשכ]/.test(w) && text.includes(w.slice(1))));
  }

  App.actions.rights = function () {
    if (!S.meta.usedRights) Store.setMeta({ usedRights: true });
    UI.openSheet({
      title: 'הזכויות שלי', full: true, body: render(),
      onMount: (el) => {
        const q = el.querySelector('.rt-search');
        const results = el.querySelector('.rt-results');
        const main = el.querySelector('.rt-main');
        const index = searchIndex(context());
        q.oninput = () => {
          const v = q.value.trim();
          main.hidden = !!v;
          results.hidden = !v;
          if (!v) { results.innerHTML = ''; return; }
          const hits = index.filter((it) => matches(it.text, v));
          results.innerHTML = hits.length
            ? hits.map((it) => `<div class="card rt-hit"><div class="rt-hit-t">${icon(it.ic, 's')}<span>${it.t}</span></div><div class="rt-body">${it.html}</div></div>`).join('')
            : `<div class="card rt-none"><b>לא מצאנו את זה במדריך.</b><div class="small muted">נסה מילה אחרת, או שאל את העוזר.</div><button class="btn tonal block" data-rt-ai>${icon('sparkle')} שאל את העוזר</button></div>`;
          const body = el.querySelector('.sh-body');
          if (body) body.scrollTop = 0;
        };
        q.onkeydown = (e) => { if (e.key === 'Enter') q.blur(); };
        el.addEventListener('click', (e) => {
          if (!e.target.closest('[data-rt-ai]')) return;
          UI.closeTop();
          setTimeout(() => App.actions.assistant(), 320);
        });
      },
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
