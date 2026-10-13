/* ============================================================
 * views-support.js — help centre and contact.
 *
 * Users: common questions with a search box, "new request" (pick a
 * reason, describe it, send) and "my requests" with the replies.
 * A reply from the team shows a badge and a message in the app.
 * Admins: every request in the admin dashboard, with a reply box.
 *
 * Data (Firestore, see firestore.rules): tickets/{id} holds the
 * request (owner uid, reason, text, status, who wrote last, whether
 * the owner saw the last reply); follow-up messages live in
 * tickets/{id}/msgs. Only the owner and admins can read a ticket.
 * Someone who can't sign in can still write (with an email to answer
 * to); they can't read anything back. Deleting the account deletes
 * the user's requests.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, UI, App } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const Support = {};
  root.Support = Support;
  const Fx = () => root.Fx;

  // [key, icon, tint, label]
  const REASONS = [
    ['login', 'key', 'violet', 'בעיה בהתחברות'], ['calc', 'calc', 'sky', 'החישוב לא נראה נכון'], ['payslip', 'receipt', 'amber', 'תלוש שכר'],
    ['rights', 'shield', 'mint', 'שאלה על הזכויות שלי'], ['how', 'help', 'violet', 'איך עושים משהו'], ['bug', 'bug', 'pink', 'משהו לא עובד'],
    ['data', 'cloud', 'sky', 'נתונים חסרים או סנכרון'], ['notif', 'bell', 'amber', 'התראות ותזכורות'], ['idea', 'bulb', 'mint', 'רעיון לשיפור'],
    ['privacy', 'lock', 'orange', 'פרטיות או מחיקת חשבון'], ['other', 'mail', 'sky', 'משהו אחר'],
  ];
  const reasonTile = (k) => { const r = reasonOf(k); return UI.tile(r[1], r[2]); };
  Support.REASONS = REASONS;
  const reasonOf = (k) => REASONS.find((r) => r[0] === k) || REASONS[REASONS.length - 1];
  const HINTS = {
    login: 'מה קורה כשמנסים להתחבר? יש הודעה? מאיזה דפדפן או אפליקציה פתחת את הקישור?',
    calc: 'איזו משמרת או איזה חודש? כמה האפליקציה חישבה וכמה לדעתך צריך להיות?',
    bug: 'מה עשית, מה ציפית שיקרה ומה קרה בפועל?',
    idea: 'מה היה עוזר לך? כל רעיון שמח אותנו 😊',
  };
  const FAQ = [
    ['איך רושמים משמרת?', 'בבית לוחצים "התחל משמרת" כשמגיעים לעבודה, ו"סיים משמרת" כשהולכים. שכחת? לוחצים על + ובוחרים "משמרת", ומזינים תאריך ושעות.'],
    ['למה הסכום שונה מהתלוש?', 'האפליקציה מחשבת לפי מה שרשמת ולפי החוק. הבדלים נפוצים: משמרת שלא נרשמה, נסיעות, הפסקות, או מס. לבדיקה מדויקת: + › "בדיקת תלוש" ומצלמים את התלוש.'],
    ['איך משנים את השכר לשעה?', 'הגדרות › מעסיקים, תפקידים ותעריפים. שם אפשר לשנות תעריף, להוסיף תפקיד, לשנות שם וצבע.'],
    ['איך מתקנים או מוחקים משמרת?', 'לוחצים על המשמרת (בבית, בלוח השנה או בדוחות), ושם אפשר לערוך או למחוק. טעית? מיד אחרי יש כפתור "ביטול".'],
    ['מה זה ברוטו ונטו?', 'ברוטו: כל מה שהרווחת לפני הורדות. נטו: מה שנכנס לבנק אחרי מס, ביטוח לאומי ופנסיה. מתחת לגיל 18 בדרך כלל אין מס, אז הם כמעט שווים.'],
    ['איך מחושבת שבת?', 'לפי העיר שבחרת האפליקציה יודעת מתי שבת נכנסת ויוצאת, וכל דקה בתוכה מחושבת ב-150% לפחות. אפשר לשנות עיר בהגדרות › שבת וחגים.'],
    ['הנתונים שלי שמורים?', 'כן. בטלפון ובחשבון ה-Google שלך, ורק לך יש גישה אליהם. מחליפים טלפון? מתחברים ומוצאים הכול.'],
    ['איך מקבלים תזכורות?', 'כשמתחילים משמרת הטלפון שואל אם לאשר התראות. אפשר גם בהגדרות › התראות ותובנות.'],
    ['אני מתחת לגיל 18. מה שונה?', 'שכר מינימום לפי הגיל, בדרך כלל בלי מס, ויש כללים מיוחדים: עד 8 שעות ביום, 40 בשבוע, הפסקות ואיסור עבודה מאוחרת בלילה. "מה מגיע לי" בבית מסביר הכול.'],
    ['איך מוחקים את החשבון?', 'הגדרות › חשבון וסנכרון › "מחק את כל הנתונים מהחשבון". זה מוחק הכול מהענן ומהטלפון.'],
  ];
  const STATUS = { open: ['ממתינה לתשובה', 'open'], answered: ['נענתה ✓', 'answered'], closed: ['סגורה', 'closed'] };

  const Cloud = () => root.Cloud;
  const signedIn = () => !!(Cloud() && Cloud().user);
  const platform = () => (App.androidApp ? 'android' : (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) ? 'pwa' : 'web');

  /* ---------------- reading my requests ---------------- */
  async function myTickets() {
    const { fs, db } = await Cloud().sdk();
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'tickets'), fs.where('uid', '==', Cloud().user.uid)));
    return snap.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => b.updated - a.updated);
  }
  /** After sign-in: is there an unseen reply? (badge + one message per reply) */
  Support.check = async function () {
    try {
      if (!signedIn()) return;
      const list = await myTickets();
      const unread = list.filter((t) => t.last === 'admin' && !t.seen);
      App.supportUnread = unread.length;
      const told = S.meta.supportTold || 0;
      const newest = unread.reduce((m, t) => Math.max(m, t.updated || 0), 0);
      if (newest > told) {
        Store.setMeta({ supportTold: newest }).catch(() => {});
        UI.toast('יש תשובה לפנייה שלך 💬', { label: 'לקריאה', fn: () => App.actions.support() });
      }
      if (unread.length && !App.blocking) App.rerender();
    } catch (e) { /* support never gets in the way */ }
  };
  /** Account deletion: the user's requests go too. */
  Support.forget = async function () {
    try {
      if (!signedIn()) return;
      const { fs, db } = await Cloud().sdk();
      for (const t of await myTickets()) {
        const msgs = await fs.getDocs(fs.collection(db, 'tickets', t.id, 'msgs'));
        for (const m of msgs.docs) await fs.deleteDoc(m.ref);
        await fs.deleteDoc(fs.doc(db, 'tickets', t.id));
      }
    } catch (e) { console.warn('support data', e); }
  };

  /* ---------------- help centre ---------------- */
  App.actions.support = function () {
    if (UI.sheets.length) UI.closeAll();
    const entry = UI.openSheet({
      title: 'עזרה ותמיכה', full: true,
      body: `<div class="support">
        ${App.mascotSays ? App.mascotSays('happy', 'היי! איך אפשר לעזור? 💬', { size: 70 }) : ''}
        <input class="input" type="search" id="sp-q" placeholder="חיפוש: משמרת, תלוש, שבת…" aria-label="חיפוש בשאלות נפוצות">
        <div class="section-title">${icon('help', 's')} שאלות נפוצות</div>
        <div class="card sp-faq">${FAQ.map(([q, a], i) => `<details class="sp-f" data-i="${i}"><summary>${esc(q)}<span class="chev">${icon('left', 's')}</span></summary><div class="sp-a">${esc(a)}</div></details>`).join('')}
          <div class="sp-none small muted" hidden>לא מצאנו. כתבו לנו ונעזור 👇</div></div>
        <div class="card sp-cta"><div><b>לא מצאת תשובה?</b><div class="small muted">כתבו לנו ונחזור אליך בהקדם 💌</div></div><button class="btn go" data-sp-new>${icon('send', 's')} פנייה חדשה</button></div>
        <div id="sp-mine"></div>
      </div>`,
      onMount: (el) => {
        const q = el.querySelector('#sp-q');
        q.oninput = () => {
          const v = q.value.trim();
          let any = false;
          el.querySelectorAll('.sp-f').forEach((d) => {
            const [qq, aa] = FAQ[+d.dataset.i];
            const hit = !v || (qq + ' ' + aa).includes(v);
            d.hidden = !hit; if (hit) any = true;
            d.open = !!v && hit;
          });
          el.querySelector('.sp-none').hidden = any;
        };
        el.querySelector('[data-sp-new]').onclick = () => { UI.closeTop(); setTimeout(() => Support.newTicket(), 320); };
        if (signedIn()) loadMine(el.querySelector('#sp-mine'));
      },
    });
    return entry;
  };
  async function loadMine(box) {
    box.innerHTML = UI.skeleton(2);
    try {
      const list = await myTickets();
      if (!list.length) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="section-title">${icon('mail', 's')} הפניות שלי</div><div class="list">${list.map((t) => {
        const label = reasonOf(t.reason)[3];
        const unread = t.last === 'admin' && !t.seen;
        return `<button class="item" data-tid="${esc(t.id)}">${reasonTile(t.reason)}<span class="body"><span class="t">${esc(label)} ${unread ? '<span class="tag good">תשובה חדשה</span>' : ''}</span><span class="s">${esc(t.text.slice(0, 60))}</span></span><span class="trail"><span class="sp-st ${STATUS[t.status] ? STATUS[t.status][1] : ''}">${STATUS[t.status] ? STATUS[t.status][0] : ''}</span><br><span class="tiny muted">${UI.timeAgo(t.updated)}</span></span></button>`;
      }).join('')}</div>`;
      box.querySelectorAll('[data-tid]').forEach((b) => (b.onclick = () => { UI.closeTop(); setTimeout(() => Support.thread(b.dataset.tid, false), 320); }));
    } catch (e) { box.innerHTML = `<div class="small muted" style="margin:14px 4px">לא הצלחנו לטעון את הפניות (${esc(e.code || 'אין חיבור')}).</div>`; }
  }

  /* ---------------- a new request ---------------- */
  Support.newTicket = function (preReason) {
    let reason = preReason || '';
    const anon = !signedIn();
    const entry = UI.openSheet({
      title: 'פנייה חדשה', full: true,
      body: `<div class="support" id="sp-new"></div>`,
      foot: `<button class="btn go" data-sp-send disabled>${icon('send', 's')} שליחה</button>`,
    });
    const box = entry.sh.querySelector('#sp-new');
    const send = entry.sh.querySelector('[data-sp-send]');
    function draw() {
      box.innerHTML = `${App.mascotSays ? App.mascotSays(reason ? 'think' : 'happy', reason ? 'ספרו לנו בכמה מילים 👇' : 'על מה הפנייה?', { size: 64 }) : ''}
        <div class="sp-reasons">${REASONS.map(([k, ic, tint, l]) => `<button class="sp-r ${k === reason ? 'on' : ''}" data-r="${k}">${UI.tile(ic, tint)}<span>${esc(l)}</span></button>`).join('')}</div>
        ${reason ? `<label class="field"><span class="lbl">מה קרה? (${esc(reasonOf(reason)[3])})</span><textarea class="input" id="sp-text" rows="5" maxlength="2000" placeholder="${esc(HINTS[reason] || 'פרטו כמה שיותר, ככה נוכל לעזור מהר')}"></textarea></label>
          ${anon ? `<label class="field"><span class="lbl">אימייל לתשובה</span><input class="input ltr" type="email" id="sp-mail" maxlength="100" placeholder="name@example.com" autocomplete="email"><span class="hint">כי עוד לא התחברת, נענה לך במייל.</span></label>` : ''}
          <label class="switch-row"><span class="body"><span class="t">לצרף פרטים טכניים</span><span class="s">גרסת האפליקציה וסוג המכשיר, כדי לעזור מהר יותר</span></span><input type="checkbox" class="switch" id="sp-tech" checked></label>
          <div class="tiny muted" style="margin:8px 4px">הפנייה נשמרת בענן וגלויה רק לך ולצוות האפליקציה, כדי לענות לך. היא נמחקת יחד עם החשבון.</div>` : ''}`;
      check();
    }
    const val = () => {
      const t = box.querySelector('#sp-text');
      const m = box.querySelector('#sp-mail');
      const text = t ? t.value.trim() : '';
      const mail = m ? m.value.trim() : '';
      return { text, mail, ok: reason && text.length >= 10 && (!anon || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) };
    };
    const check = () => { send.disabled = !val().ok; };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      const typed = box.querySelector('#sp-text') ? box.querySelector('#sp-text').value : '';
      reason = b.dataset.r;
      draw();
      if (typed) box.querySelector('#sp-text').value = typed;
      if (Fx()) Fx().play('on');
      setTimeout(() => { const t = box.querySelector('#sp-text'); if (t) t.focus(); }, 60);
    });
    box.addEventListener('input', check);
    send.onclick = async () => {
      const v = val();
      if (!v.ok) { UI.invalid(v.text.length < 10 ? 'כתבו קצת יותר (לפחות 10 תווים)' : 'בדקו את כתובת האימייל'); return; }
      // a gentle limit, so a stuck button can't flood the inbox
      const recent = (S.meta.ticketTimes || []).filter((t) => Date.now() - t < 24 * 3600000);
      if (recent.length >= 5) { UI.invalid('שלחת כבר כמה פניות היום. נענה בהקדם 🙏'); return; }
      send.disabled = true;
      send.innerHTML = 'שולח…';
      try {
        const { fs, db } = await Cloud().sdk();
        const now = Date.now();
        const tech = box.querySelector('#sp-tech').checked;
        const doc = {
          uid: anon ? '' : Cloud().user.uid, reason, text: v.text.slice(0, 2000), status: 'open', created: now, updated: now, last: 'user', seen: true,
          name: String(S.settings.userName || '').slice(0, 60),
        };
        if (anon) doc.email = v.mail.slice(0, 100);
        if (tech) Object.assign(doc, { v: String(root.APP_VERSION || '').slice(0, 20), p: platform(), dev: String(navigator.userAgent || '').slice(0, 200) });
        await fs.addDoc(fs.collection(db, 'tickets'), doc);
        Store.setMeta({ ticketTimes: recent.concat([now]) }).catch(() => {});
        UI.closeTop();
        if (Fx()) Fx().celebrate('big');
        setTimeout(() => UI.dialog({ title: '', html: `<div class="term-box">${App.mascot('love', { size: 70 })}<div><h3>הפנייה נשלחה! 💌</h3><p>${anon ? 'נענה לך במייל בהקדם.' : 'נענה בהקדם, והתשובה תופיע כאן באפליקציה (עזרה ותמיכה › הפניות שלי).'}</p></div></div>`, buttons: [{ label: 'תודה!', value: true, cls: '' }] }), 350);
      } catch (e) {
        console.error(e);
        send.disabled = false;
        send.innerHTML = `${icon('send', 's')} שליחה`;
        UI.invalid('השליחה נכשלה: ' + (Cloud() ? Cloud().errorText(e) : 'נסו שוב'));
      }
    };
    draw();
  };

  /* ---------------- one conversation (user or admin) ---------------- */
  Support.thread = async function (tid, asAdmin) {
    const entry = UI.openSheet({ title: asAdmin ? 'פנייה' : 'הפנייה שלי', full: true, cls: 'chat-sheet', body: UI.skeleton(3),
      foot: `<textarea class="input chat-input" id="sp-reply" rows="1" maxlength="2000" placeholder="${asAdmin ? 'תשובה…' : 'עוד משהו?'}"></textarea><button class="icon-btn chat-send" data-sp-reply aria-label="שליחה">${icon('send')}</button>` });
    const body = entry.sh.querySelector('.sh-body');
    let t = null;
    const { fs, db } = await Cloud().sdk();
    const ref = fs.doc(db, 'tickets', tid);
    async function load() {
      const snap = await fs.getDoc(ref);
      if (!snap.exists()) { body.innerHTML = '<div class="small muted">הפנייה לא נמצאה.</div>'; return; }
      t = snap.data();
      const msgs = (await fs.getDocs(fs.collection(db, 'tickets', tid, 'msgs'))).docs.map((d) => d.data()).sort((a, b) => a.t - b.t);
      const label = reasonOf(t.reason)[3];
      const bubble = (from, text, at) => `<div class="msg ${from === 'admin' ? 'assistant' : 'user'}">${esc(text)}<div class="tiny" style="opacity:.7;margin-top:4px">${from === 'admin' ? '💬 צוות Shaati · ' : ''}${UI.timeAgo(at)}</div></div>`;
      body.innerHTML = `<div class="sp-head">${reasonTile(t.reason)}<div><b>${esc(label)}</b><div class="tiny muted"><span class="sp-st ${STATUS[t.status] ? STATUS[t.status][1] : ''}">${STATUS[t.status] ? STATUS[t.status][0] : ''}</span> · נפתחה ${U.fmtDate(U.epochKey(t.created))}</div></div></div>
        ${asAdmin ? `<div class="card small sp-meta">${t.name ? `<div>שם: <b>${esc(t.name)}</b></div>` : ''}${t.email ? `<div>אימייל: <a href="mailto:${esc(t.email)}?subject=${encodeURIComponent('Shaati: הפנייה שלך')}" dir="ltr">${esc(t.email)}</a> (לא מחובר, לענות במייל)</div>` : ''}${t.v ? `<div dir="ltr" style="text-align:left">${esc(t.v)} · ${esc(t.p || '')}<br><span class="tiny">${esc(t.dev || '')}</span></div>` : '<div class="tiny muted">בלי פרטים טכניים</div>'}</div>` : ''}
        <div class="chat-log">${bubble('user', t.text, t.created)}${msgs.map((m) => bubble(m.from, m.text, m.t)).join('')}</div>
        ${t.status !== 'closed' ? `<button class="btn text sm" data-sp-close>${icon('check', 's')} ${asAdmin ? 'סגור את הפנייה' : 'הבעיה נפתרה, אפשר לסגור'}</button>` : ''}`;
      if (!asAdmin && t.last === 'admin' && !t.seen) {
        fs.updateDoc(ref, { seen: true }).catch(() => {});
        App.supportUnread = Math.max(0, (App.supportUnread || 1) - 1);
      }
      const c = body.querySelector('[data-sp-close]');
      if (c) c.onclick = async () => { await fs.updateDoc(ref, { status: 'closed', updated: Date.now() }); UI.toast('הפנייה נסגרה'); load(); };
      body.scrollTop = body.scrollHeight;
      if (t.email && asAdmin) entry.sh.querySelector('.sh-foot').hidden = true;
    }
    entry.sh.querySelector('[data-sp-reply]').onclick = async () => {
      const ta = entry.sh.querySelector('#sp-reply');
      const text = ta.value.trim();
      if (!text) return;
      try {
        const now = Date.now();
        await fs.addDoc(fs.collection(db, 'tickets', tid, 'msgs'), { from: asAdmin ? 'admin' : 'user', text: text.slice(0, 2000), t: now });
        await fs.updateDoc(ref, asAdmin ? { status: 'answered', last: 'admin', seen: false, updated: now } : { status: 'open', last: 'user', updated: now });
        ta.value = '';
        if (Fx()) Fx().play('pop');
        load();
      } catch (e) { UI.invalid('השליחה נכשלה: ' + Cloud().errorText(e)); }
    };
    try { await load(); } catch (e) { body.innerHTML = `<div class="banner warn">${icon('alert')}<div>לא הצלחנו לטעון (${esc(e.code || e.message || '')}).</div></div>`; }
  };

  /* ---------------- tell a friend ---------------- */
  App.actions['share-app'] = async function () {
    const url = 'https://leelor123.github.io/shifts/';
    const text = 'מצאתי אפליקציה שמחשבת כמה מגיע לך על כל משמרת: שבתות, נסיעות, שעות נוספות ושכר מינימום לנוער 💰';
    try { if (navigator.share) { await navigator.share({ title: 'Shaati', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    await UI.copyText(text + ' ' + url);
    UI.toast('הקישור הועתק. אפשר להדביק בוואטסאפ 💚');
  };

  /* ---------------- admin: the inbox ---------------- */
  /** HTML for the admin dashboard: open requests first. */
  Support.adminInbox = async function () {
    const { fs, db } = await Cloud().sdk();
    const list = (await fs.getDocsFromServer(fs.collection(db, 'tickets'))).docs.map((d) => Object.assign({ id: d.id }, d.data()));
    const order = { open: 0, answered: 1, closed: 2 };
    list.sort((a, b) => (order[a.status] - order[b.status]) || ((a.last === 'user' ? 0 : 1) - (b.last === 'user' ? 0 : 1)) || b.updated - a.updated);
    App.adminOpenTickets = list.filter((t) => t.status === 'open' && t.last === 'user').length;
    return { count: App.adminOpenTickets, total: list.length, html: list.length ? `<div class="list">${list.slice(0, 40).map((t) => {
      const label = reasonOf(t.reason)[3];
      const waiting = t.status === 'open' && t.last === 'user';
      return `<button class="item" data-adm-ticket="${esc(t.id)}">${reasonTile(t.reason)}<span class="body"><span class="t">${esc(label)}${t.name ? ' · ' + esc(t.name) : ''} ${waiting ? '<span class="tag warn">מחכה לתשובה</span>' : ''}${t.email ? ' <span class="tag">מייל</span>' : ''}</span><span class="s">${esc(String(t.text || '').slice(0, 70))}</span></span><span class="trail"><span class="tiny muted">${UI.timeAgo(t.updated || t.created)}</span></span></button>`;
    }).join('')}</div>` : '<div class="small muted" style="margin:4px">אין פניות עדיין 🎉</div>' };
  };
})(typeof window !== 'undefined' ? window : globalThis);
