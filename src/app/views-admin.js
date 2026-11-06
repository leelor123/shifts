/* ============================================================
 * views-admin.js — the admin dashboard (app owner and managers).
 * Shown only when admins/{uid} exists for the signed-in user; the
 * Firestore rules enforce the same on the server, so the data never
 * reaches anyone else. It reads the stats/* records only (no identifying details):
 * no user's shifts, payslips, name or email are ever visible here.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, UI, App, Charts } = root;
  const { icon, esc } = UI;

  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const FEATURES = [
    ['rights', 'מדריך הזכויות'], ['planned', 'משמרות מתוכננות'], ['roles', 'יותר מתפקיד אחד'], ['goal', 'יעד חודשי'],
    ['notif', 'התראות מאושרות'], ['lock', 'נעילה בקוד'], ['bio', 'טביעת אצבע'], ['ai', 'מפתח AI'], ['dark', 'מצב כהה'], ['fxOff', 'כיבוי אפקטים'], ['demo', 'מצב הדגמה'],
    ['plusSeen', 'ראו את Shaati Plus'], ['plusWall', 'הגיעו למכסה חינמית'], ['plusTry', 'ניסו את Plus בחינם'],
    ['tax', 'בדיקת החזר מס'], ['inv', 'הזמינו חבר שהצטרף'], ['gift', 'קיבלו Plus במתנה'], ['tip', 'נתנו טיפ'],
  ];

  function kpi(label, value, sub) {
    return `<div class="kpi"><div class="l">${esc(label)}</div><div class="v">${value}</div>${sub ? `<div class="d">${esc(sub)}</div>` : ''}</div>`;
  }
  function barList(entries, total) {
    return entries.map(([label, n]) => `<div class="adm-bar"><span class="nm">${esc(label)}</span><span class="track"><i style="width:${pct(n, total)}%"></i></span><span class="vv">${n} · ${pct(n, total)}%</span></div>`).join('');
  }
  /* Shaati Plus and income: from the same records (a device says only whether Plus is on and
   * where it was bought). Exact amounts live in Google Play Console and Lemon Squeezy. */
  function plusSection(rows) {
    const P = root.Plus;
    const C = root.PAY_CONFIG || {};
    const has = (k) => rows.filter((r) => r.f && r.f[k]).length;
    const buyers = has('plus'), web = has('plusWeb'), play = buyers - web, seen = has('plusSeen'), wall = has('plusWall'), tried = has('plusTry');
    const triedBought = rows.filter((r) => r.f && r.f.plusTry && r.f.plus).length;
    const share = rows.length ? (buyers / rows.length) * 100 : 0;
    const GOAL = 10; // % of users who pay
    const price = +C.price || 0;
    // Google keeps 15%; Lemon Squeezy about 5% + 50¢ (≈ ₪1.9) per sale
    const gross = buyers * price;
    const net = play * price * 0.85 + web * Math.max(0, price * 0.95 - 1.9);
    const money = (v) => '₪' + Math.round(v).toLocaleString('en-US');
    const lemon = C.lemon || {};
    const playState = P && P.available ? '<span class="tag good">פעיל</span>' : App.androidApp ? '<span class="tag warn">לא מוגדר ב-\u2060Play Console</span>' : '<span class="tag">נבדק רק מתוך אפליקציית האנדרואיד</span>';
    const webState = lemon.checkout && +lemon.productId ? '<span class="tag good">פעיל</span>' : '<span class="tag warn">לא מוגדר</span>';
    // the admin's own preview, on this phone only (plus.js: Plus.preview)
    const mode = P && P.preview ? P.preview() : '';
    const simBtn = (v, label) => `<button class="${mode === v ? 'on' : ''}" aria-pressed="${mode === v}" data-act="plus-sim" data-v="${v}">${label}</button>`;
    const preview = `<div class="card adm-preview"><b>תצוגה מקדימה של Plus</b>
        <div class="tiny muted">רק בטלפון הזה: לא נספר בסטטיסטיקה ולא נראה לשחקנים אחרים. אמיתי ייפתח לכולם כשחשבון התשלומים יוגדר.</div>
        <div class="seg">${simBtn('', 'כבוי')}${simBtn('free', 'משתמש חינמי')}${simBtn('plus', 'מנוי Plus')}</div>
        <div class="tiny adm-preview-l">חינמי: מכחול על כרטיס השכר בבית, ניסיון חינם ל-3 ימים, מכסות לניתוח המתקדם (דוחות) ולייצוא, ושורת Plus בהגדרות. מנוי: 12 עיצובים (הגדרות › מראה ונעילה), רקע בטבלת האלופים ותג במסך הבית.</div>
        <div class="btn-row"><button class="btn tonal sm" data-act="plus-sim-offer">${icon('sparkle', 's')} להציג את ההצעה בבית</button><button class="btn text sm" data-act="plus-sim-reset">איפוס ניסיון ומכסות</button><button class="btn text sm" data-act="review-preview">${icon('star', 's')} מסך בקשת הדירוג</button></div></div>`;
    return `<div class="section-title">${icon('sparkle', 's')} Shaati Plus והכנסות</div>
      ${preview}
      <div class="card"><div class="kpis">${kpi(C.monthly ? 'מנויים' : 'קונים', buyers, `${play} באנדרואיד · ${web} באתר`)}${kpi('משלמים', U.num(share, 1) + '%', `מכל המשתמשים · היעד ${GOAL}%`)}${kpi(C.monthly ? 'הכנסה בחודש' : 'הכנסה משוערת', money(gross), '≈ ' + money(net) + ' אחרי עמלות')}${kpi('קנו אחרי ניסיון', pct(triedBought, tried) + '%', `${tried} ניסו בחינם`)}</div>
        <div class="adm-goal"><div class="progress thin"><i style="width:${Math.min(100, (share / GOAL) * 100)}%"></i></div><span class="tiny muted">${share >= GOAL ? 'היעד הושג 🎉' : `עוד ${Math.max(1, Math.ceil((GOAL / 100) * rows.length - buyers))} קונים ליעד של ${GOAL}%`}</span></div>
        <div class="divider"></div>
        <div class="tiny muted" style="margin-bottom:6px">המשפך: מכל המשתמשים, כמה הגיעו לכל שלב</div>
        ${barList([['ראו את Plus', seen], ['הגיעו למכסה חינמית', wall], ['ניסו בחינם', tried], ['קנו', buyers]], rows.length)}
        <div class="divider"></div>
        <div class="adm-pay"><span>Google Play (בתוך האפליקציה)</span>${playState}</div>
        <div class="adm-pay"><span>אתר ו-\u2060iPhone (אשראי, Apple Pay, Google Pay, PayPal)</span>${webState}</div>
        <div class="btn-row" style="margin-top:10px"><a class="btn tonal sm" href="https://play.google.com/console" target="_blank" rel="noopener">${icon('chart', 's')} Google Play Console</a><a class="btn tonal sm" href="https://app.lemonsqueezy.com/orders" target="_blank" rel="noopener">${icon('receipt', 's')} מכירות באתר</a></div>
        <div class="tiny muted" style="margin-top:8px">מהסטטיסטיקה האנונימית (מכשירים שלא כיבו אותה), מתעדכן כל כמה שעות. הסכומים המדויקים ותשלומי המס בדוחות של Google Play ושל Lemon Squeezy.</div></div>`;
  }
  /* The way in: of the devices that started a week ago or more (they had the time; the demo is not counted), how
   * many got to each step, each step out of the one before it — where people are lost shows at once. */
  function funnel(rows) {
    const k = U.todayKey();
    const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
    const old = rows.filter((r) => r.first && r.last && r.first <= U.addDays(k, -7) && !(r.f && r.f.demo));
    const f = (r, x) => !!(r.f && r.f[x]);
    const steps = [];
    let cur = old;
    for (const [label, keep] of [
      ['התחילו להשתמש', () => true],
      ['רשמו משמרת', (r) => +r.sh > 0],
      ['חזרו אחרי שבוע', (r) => days(r.first, r.last) >= 7],
      ['ראו את Plus', (r) => f(r, 'plusSeen')],
      ['ניסו את Plus (ניסיון או מתנה)', (r) => f(r, 'plusTry') || f(r, 'gift') || f(r, 'plus')],
      ['שילמו', (r) => f(r, 'plus')],
    ]) { const prev = cur.length; cur = cur.filter(keep); steps.push([label, cur.length, prev]); }
    const start = old.length;
    return `<div class="section-title">${icon('filter', 's')} המשפך: מהתקנה ועד תשלום</div>
      <div class="card adm-funnel">${steps.map(([label, n, prev], i) => `<div class="adm-bar"><span class="nm">${esc(label)}</span><span class="track"><i style="width:${pct(n, start)}%"></i></span><span class="vv">${n} · ${pct(n, start)}%${i ? `<small class="adm-drop">${pct(n, prev)}% מהקודם</small>` : ''}</span></div>`).join('')}
        <div class="tiny muted" style="margin-top:8px">מכשירים שהתחילו לפני שבוע לפחות (${start}), בלי מצב הדגמה. כל שלב מתוך מי שעבר את הקודם.</div></div>` + funnelByPlatform(rows);
  }
  /* The same way in, by when devices started (the last 30 or 90 days) and by platform (core/funnel.js), from the
   * records already read. Both periods are drawn at once and a tap shows one: no new reading, no redraw. */
  const FP_STEPS = { installed: 'התקינו', shift: 'רשמו משמרת', week: 'חזרו בשבוע אחר', active: 'פעילים ב-14 הימים האחרונים', plus: 'Shaati Plus' };
  const FP_COLS = [['', 'הכל'], ['android', 'אנדרואיד'], ['web', 'דפדפן'], ['ios', 'iPhone']];
  function funnelTable(rows, days) {
    const k = U.todayKey();
    const cols = FP_COLS.map(([p]) => root.Funnel.compute(rows, { today: k, days, platform: p }));
    const head = FP_COLS.map(([, label]) => `<th scope="col">${esc(label)}</th>`).join('');
    const body = cols[0].steps.map((st, i) => `<tr><th scope="row">${esc(FP_STEPS[st.key])}</th>${cols.map((c) => { const s = c.steps[i]; return `<td><b>${s.n}</b>${i ? `<small>${s.pct}%</small>` : ''}</td>`; }).join('')}</tr>`).join('');
    const { from, to } = cols[0];
    return `<table class="adm-ftable"><thead><tr><td></td>${head}</tr></thead><tbody>${body}</tbody></table>
        <div class="tiny muted" style="margin-top:8px">מכשירים שהתחילו בין ${U.fmtDate(from, 'dm')} ל-⁠${U.fmtDate(to, 'dm')} (${cols[0].steps[0].n}), בלי מצב הדגמה. מי שהתחיל בשבוע האחרון עוד לא יכול היה לחזור, ולכן לא נספר.</div>`;
  }
  function funnelByPlatform(rows) {
    const btn = (d) => `<button class="${d === 30 ? 'on' : ''}" aria-pressed="${d === 30}" data-adm-fw="${d}">${d} ימים</button>`;
    return `<div class="section-title">${icon('filter', 's')} המשפך לפי תקופה ומכשיר</div>
      <div class="card adm-fp"><div class="seg" role="group" aria-label="מתי התחילו להשתמש">${btn(30)}${btn(90)}</div>
        ${[30, 90].map((d) => `<div data-adm-fp="${d}"${d === 30 ? '' : ' hidden'}>${funnelTable(rows, d)}</div>`).join('')}
        <div class="tiny muted" style="margin-top:6px">כל אחוז הוא מתוך השלב שמעליו. אנדרואיד היא האפליקציה מ-⁠Google Play. דפדפן הוא כל דפדפן אחר, גם באנדרואיד. מכשיר iPhone שלא נפתח מאז העדכון נספר עדיין כדפדפן.</div></div>`;
  }
  function render(rows, admins, me) {
    const k = U.todayKey();
    const n = rows.length;
    const since = (d) => U.addDays(k, -(d - 1));
    const activeIn = (d) => rows.filter((r) => r.last >= since(d)).length;
    const a1 = activeIn(1), a7 = activeIn(7), a30 = activeIn(30);
    const new7 = rows.filter((r) => r.first >= since(7)).length;
    const new30 = rows.filter((r) => r.first >= since(30)).length;
    const days = Array.from({ length: 30 }, (_, i) => U.addDays(k, i - 29));
    const byFirst = new Map(days.map((d) => [d, 0]));
    rows.forEach((r) => { if (byFirst.has(r.first)) byFirst.set(r.first, byFirst.get(r.first) + 1); });
    const returning = rows.filter((r) => (r.days || 0) >= 3).length;
    const loyal = rows.filter((r) => (r.days || 0) >= 10).length;
    const count = (key) => { const m = new Map(); rows.forEach((r) => m.set(r[key] || '?', (m.get(r[key] || '?') || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]); };
    const PL = { android: 'אפליקציית אנדרואיד', pwa: 'מותקן מהדפדפן', web: 'דפדפן', '?': 'לא ידוע' };
    const AG = { u18: 'מתחת ל-18', '18p': '18 ומעלה', '?': 'לא הוזן' };
    const sum = (key) => rows.reduce((s, r) => s + (+r[key] || 0), 0);
    const active30 = rows.filter((r) => r.last >= since(30));
    const shifts30 = active30.reduce((s, r) => s + (+r.s30 || 0), 0);
    return `<div class="admin">
      <div class="small muted" style="margin:0 4px 12px">${icon('shield', 's')} נתונים אנונימיים בלבד: כל רשומה היא מכשיר, בלי שם, אימייל או נתוני שכר. מתעדכן פעם ביום לכל מכשיר.</div>
      <div class="card tonal"><div class="kpis">
        ${kpi('משתמשים (מכשירים)', n, `${new7} חדשים השבוע`)}${kpi('פעילים היום', a1)}${kpi('פעילים ב-7 ימים', a7, pct(a7, n) + '% מהכלל')}${kpi('פעילים ב-30 ימים', a30, pct(a30, n) + '% מהכלל')}
      </div></div>
      ${funnel(rows)}
      ${plusSection(rows)}
      <div class="section-title">${icon('up', 's')} משתמשים חדשים, 30 ימים אחרונים</div>
      <div class="card">${Charts.bars(days.map((d) => ({ label: d.slice(8), value: byFirst.get(d), tip: `${U.fmtDate(d, 'dm')}: ${byFirst.get(d)} חדשים` })), { label: 'משתמשים חדשים לפי יום', height: 170 })}
        <div class="tiny muted">${new30} הצטרפו ב-30 הימים האחרונים.</div></div>
      <div class="section-title">${icon('refresh', 's')} חוזרים לאפליקציה</div>
      <div class="card"><div class="kpis three">${kpi('חזרו 3 ימים ומעלה', pct(returning, n) + '%', returning + ' מכשירים')}${kpi('חזרו 10 ימים ומעלה', pct(loyal, n) + '%', loyal + ' מכשירים')}${kpi('ממוצע ימי שימוש', n ? U.num(sum('days') / n, 1) : 0)}</div></div>
      <div class="section-title">${icon('clock', 's')} שימוש</div>
      <div class="card"><div class="kpis">${kpi('משמרות שנרשמו', sum('sh').toLocaleString('en-US'))}${kpi('משמרות ב-30 ימים', shifts30.toLocaleString('en-US'))}${kpi('ממוצע למשתמש פעיל', active30.length ? U.num(shifts30 / active30.length, 1) : 0, 'משמרות בחודש')}${kpi('תלושים שנבדקו', sum('ps').toLocaleString('en-US'))}</div></div>
      <div class="section-title">${icon('users', 's')} מי משתמש</div>
      <div class="card">${barList(count('age').map(([key, c]) => [AG[key] || key, c]), n)}<div class="divider"></div>${barList(count('p').map(([key, c]) => [PL[key] || key, c]), n)}</div>
      <div class="section-title">${icon('sparkle', 's')} תכונות בשימוש</div>
      <div class="card">${barList(FEATURES.map(([key, label]) => [label, rows.filter((r) => r.f && r.f[key]).length]).sort((a, b) => b[1] - a[1]), n)}</div>
      <div class="section-title">${icon('layers', 's')} גרסאות</div>
      <div class="card">${barList(count('v').slice(0, 6), n)}</div>
      <div class="section-title">${icon('lock', 's')} מנהלים</div>
      <div class="card">
        <div class="small">${admins.length} מנהלים. כדי להוסיף מנהל: הוא פותח הגדרות › אני והחשבון › חשבון וסנכרון ומעתיק את "מזהה המשתמש" שלו, ואתה מוסיף אותו כאן.</div>
        <div class="adm-add"><input class="input" id="adm-uid" placeholder="מזהה משתמש" dir="ltr" autocomplete="off" spellcheck="false"><button class="btn tonal" data-adm-add>${icon('plus', 's')} הוסף</button></div>
        <div class="tiny muted" dir="ltr" style="text-align:left">${admins.map((a) => esc(a.slice(0, 6) + '…' + (a === me ? ' (אתה)' : ''))).join(' · ')}</div>
      </div>
      <div class="adm-foot"><span class="tiny muted">עודכן ${U.epochHM(Date.now())}</span><button class="btn text sm" data-adm-refresh>${icon('refresh', 's')} רענן</button></div>
    </div>`;
  }

  /** Statistics records of devices not used for 13 months (the privacy policy's retention), from the records the
   *  dashboard already read: no extra reading, at most 50 at a time. */
  App.oldStats = (docs, today) => {
    const cut = U.addMonths(today || U.todayKey(), -13);
    return docs.filter((d) => { const r = d.data(); return r && typeof r.last === 'string' && r.last < cut; }).slice(0, 50);
  };
  /** This week's error reports (errors.js), grouped by error: how many times in all, the newest version, the
   *  message. From the records given (the dashboard reads at most 50), the 10 most frequent. */
  App.topErrors = (rows) => {
    const by = new Map();
    for (const r of rows) {
      if (!r || typeof r.h !== 'string' || typeof r.msg !== 'string') continue;
      const g = by.get(r.h) || { h: r.h, n: 0, v: '', msg: r.msg, k: r.k, st: r.st || '', t: 0 };
      g.n += Math.max(1, +r.n || 1);
      if ((+r.t || 0) > g.t) { g.t = +r.t || 0; g.v = String(r.v || ''); }
      by.set(r.h, g);
    }
    return [...by.values()].sort((a, b) => b.n - a.n || b.t - a.t).slice(0, 10);
  };
  function errorsList(rows) {
    const top = App.topErrors(rows);
    if (!top.length) return '<div class="small muted">לא היו תקלות השבוע.</div>';
    return `<div class="adm-errs">${top.map((g) => `<details class="adm-err"><summary><b class="n">${g.n}</b><span class="v" dir="ltr">${esc(g.v)}</span><span class="m" dir="ltr">${esc(g.msg)}</span></summary>
        <pre class="tiny" dir="ltr">${esc(g.k || '')}\n${esc(g.st)}</pre></details>`).join('')}</div>
      <div class="tiny muted" style="margin-top:8px">${rows.length} דיווחים מ-7 הימים האחרונים (עד 50 החדשים).</div>`;
  }
  App.adminErrorsView = errorsList; // the list from given records (tests)
  /** Error reports are kept 30 days (the privacy policy): reports older than this time are deleted. */
  const ERR_KEEP_DAYS = 30;
  App.errorsCutoff = (now) => now - ERR_KEEP_DAYS * 86400000;
  /** Deletes up to 50 error reports older than 30 days. Runs when an admin opens the list; silent on failure. */
  async function purgeOldErrors(fs, db) {
    try {
      const snap = await fs.getDocsFromServer(fs.query(fs.collection(db, 'errors'), fs.where('t', '<', App.errorsCutoff(Date.now())), fs.limit(50)));
      await Promise.all(snap.docs.map((d) => fs.deleteDoc(d.ref)));
    } catch (e) { /* the next opening tries again */ }
  }
  // the card the list opens in (nothing is read until its button is pressed)
  const errorsCard = () => `<div class="admin"><div class="section-title">${icon('alert', 's')} תקלות השבוע</div>
      <div class="card" data-adm-errors-box><div class="tiny muted">דיווחים ממכשירים שהסכימו לסטטיסטיקה, בלי פרטים מזהים. הרשימה נטענת רק כשלוחצים.</div>
        <div class="btn-row" style="margin-top:8px"><button class="btn tonal sm" data-adm-errors>${icon('alert', 's')} הצג את התקלות</button></div></div></div>`;
  let purged = false; // once per opening of the app is enough
  App.adminView = render; // the page from given records (tests)
  App.actions['admin-dashboard'] = async function () {
    if (!App.isAdmin || !root.Cloud || !root.Cloud.user) return;
    const entry = UI.openSheet({ title: 'לוח ניהול', full: true, body: UI.skeleton(4, 'card') });
    const body = entry.sh.querySelector('.sh-body');
    const load = async () => { try {
      const { fs, db } = await root.Cloud.sdk();
      const snap = await fs.getDocsFromServer(fs.collection(db, 'stats'));
      const purge = !purged;
      purged = true;
      // records past the policy's retention are deleted quietly and not counted (a failure waits for the next opening)
      const old = purge ? App.oldStats(snap.docs) : [];
      if (old.length) Promise.all(old.map((d) => fs.deleteDoc(d.ref))).catch((e) => console.warn('old statistics', e));
      const rows = snap.docs.filter((d) => !old.includes(d)).map((d) => d.data()).filter((r) => r && typeof r.last === 'string');
      let admins = [];
      try { admins = (await fs.getDocsFromServer(fs.collection(db, 'admins'))).docs.map((d) => d.id); } catch (e) { /* only the list is optional */ }
      // support requests come first: they are the part that needs an answer
      const inbox = root.Support ? await root.Support.adminInbox({ purge }).catch((e) => ({ count: 0, html: `<div class="small muted">לא ניתן לטעון פניות (${esc(e.code || e.message || '')})</div>` })) : null;
      if (entry.closed) return;
      body.innerHTML = (inbox ? `<div class="admin"><div class="section-title">${icon('chat', 's')} פניות ${inbox.count ? `<span class="tag warn">${inbox.count} מחכות לתשובה</span>` : ''}</div>${inbox.html}</div>` : '') + errorsCard() + render(rows, admins, root.Cloud.user.uid);
      body.querySelectorAll('[data-adm-ticket]').forEach((b) => (b.onclick = () => root.Support.thread(b.dataset.admTicket, true, load)));
      const delClosed = body.querySelector('[data-adm-del-closed]');
      if (delClosed) delClosed.onclick = async () => {
        const n = inbox.closed.length;
        if (!(await UI.confirm(`למחוק ${n === 1 ? 'פנייה סגורה אחת' : `${n} פניות סגורות`}?`, 'הן וכל ההודעות בהן יימחקו לתמיד. פניות פתוחות לא נוגעים בהן.', 'מחק', true))) return;
        delClosed.disabled = true;
        const done = await root.Support.removeClosed(inbox.closed);
        if (done) UI.toast(done === 1 ? 'פנייה אחת נמחקה' : `${done} פניות נמחקו`);
        load();
      };
      // read only when the admin asks: at most 50 reports of the last 7 days
      const errBtn = body.querySelector('[data-adm-errors]');
      if (errBtn) errBtn.onclick = async () => {
        const box = body.querySelector('[data-adm-errors-box]');
        errBtn.disabled = true;
        try {
          const since = Date.now() - 7 * 86400000;
          const snap = await fs.getDocsFromServer(fs.query(fs.collection(db, 'errors'), fs.where('t', '>=', since), fs.orderBy('t', 'desc'), fs.limit(50)));
          if (!entry.closed) box.innerHTML = errorsList(snap.docs.map((d) => d.data()));
          purgeOldErrors(fs, db);
        } catch (e) {
          errBtn.disabled = false;
          if (!entry.closed) UI.toast(`לא ניתן לטעון את התקלות (${e.code || e.message || ''})`);
        }
      };
      // the funnel's period: both are drawn, a tap shows the other one
      const fw = body.querySelectorAll('[data-adm-fw]');
      fw.forEach((b) => (b.onclick = () => {
        fw.forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
        body.querySelectorAll('[data-adm-fp]').forEach((p) => (p.hidden = p.dataset.admFp !== b.dataset.admFw));
      }));
      body.querySelector('[data-adm-refresh]').onclick =() => { body.innerHTML = UI.skeleton(4, 'card'); load(); };
      body.querySelector('[data-adm-add]').onclick = async () => {
        const uid = body.querySelector('#adm-uid').value.trim();
        if (!/^[A-Za-z0-9]{20,40}$/.test(uid)) { UI.invalid('מזהה משתמש לא תקין'); return; }
        try {
          await fs.setDoc(fs.doc(db, 'admins', uid), { added: Date.now(), by: root.Cloud.user.uid });
          UI.toast('המנהל נוסף');
          body.querySelector('#adm-uid').value = '';
        } catch (e) { UI.toast('ההוספה נכשלה: ' + (e.code || e.message)); }
      };
    } catch (e) {
      if (!entry.closed) body.innerHTML = `<div class="banner warn">${icon('alert')}<div>לא ניתן לטעון את הנתונים (${esc(e.code || e.message || '')}). בדוק חיבור לאינטרנט.</div></div>`;
    } };
    load();
  };
})(typeof window !== 'undefined' ? window : globalThis);
