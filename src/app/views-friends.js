/* ============================================================
 * views-friends.js — "התחרות עם החברים": who earns the most, per hour, this month,
 * this year and all time, among friends who added each other.
 *
 * A friend is added with an invitation link (?friend=CODE): the sender makes
 * inv/{code}; whoever opens it accepts it (sets "to" to their uid) and lists the
 * sender as a friend; the sender's app sees the accepted invitation the next time
 * it opens and lists them back. A card (fr/{uid}) is read only by the friends it
 * lists (firestore.rules), so removing or blocking someone takes them off my list
 * and they can't read me any more. "Hide my amounts" keeps the card without them.
 * Shows only a nickname and an emoji, never a name. The amounts, the order and
 * the friends list are worked out in core/friends.js.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, UI, App, Engine } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const FR = root.Friends;
  const LB = root.Leaderboard;
  const View = {};
  root.FriendsView = View;

  const PERIODS = [['h', 'שכר לשעה'], ['m', 'החודש'], ['y', 'השנה'], ['a', 'כל הזמנים']];
  const APP_URL = 'https://leelor123.github.io/shifts/';
  const Cloud = () => root.Cloud;
  const signedIn = () => !!(Cloud() && Cloud().user);
  const uid = () => Cloud().user.uid;
  const me = () => S.settings.fr || {};
  const joined = () => signedIn() && !!me().on;
  const today = () => U.todayKey();
  View.joined = joined;

  /* ---------------- an invitation that came with the address ----------------
   * Kept until it is handled (signing in may take a reload), and taken off the address at once. */
  const INV_KEY = 'shaati.frInvite';
  try {
    const c = FR.codeFrom(location.search);
    if (c) {
      localStorage.setItem(INV_KEY, c);
      const u = new URL(location.href); u.searchParams.delete('friend');
      history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
    }
  } catch (e) { /* no storage: the link still works while the page stays open */ }
  const pendingCode = () => { try { return localStorage.getItem(INV_KEY); } catch (e) { return null; } };
  const dropCode = () => { try { localStorage.removeItem(INV_KEY); } catch (e) { /* none */ } };

  /* ---------------- my card ---------------- */
  function card() {
    const m = me();
    const c = { n: m.n, e: m.e, t: Date.now(), hide: !!m.hide, f: FR.addFriend(m.f || [], null, uid()) };
    if (!m.hide) c.s = FR.stats(App.model, Engine, today());
    return c;
  }
  let pubTimer = 0;
  /** Sends my card when something in it changed (or when asked); the whole card, so hidden amounts go. */
  async function publish(force) {
    if (!joined() || !App.model) return;
    const c = card();
    const sig = JSON.stringify(Object.assign({}, c, { t: 0 }));
    if (!force && S.meta.frPub === sig) return;
    const { fs, db } = await Cloud().sdk();
    await fs.setDoc(fs.doc(db, 'fr', uid()), c);
    await Store.setMeta({ frPub: sig });
    const mine = cards.get(uid()); if (mine) cards.delete(uid());
  }
  View.publish = publish;
  /** The numbers changed (App.recompute): my card follows a little later, at most once in 20 seconds. */
  View.changed = function () {
    if (!joined() && !(pendingCode() && signedIn())) return;
    clearTimeout(pubTimer);
    pubTimer = setTimeout(() => {
      if (pendingCode() && signedIn()) handleInvite();
      publish().catch(() => {});
    }, 20000);
  };

  /* ---------------- friends' cards ---------------- */
  const cards = new Map(); // uid → { at, c (null: not readable — they haven't added me, or removed me) }
  const KEEP_MS = 5 * 60000;
  async function readCard(fuid, fresh) {
    const k = cards.get(fuid);
    // a card I may not read yet (waiting for them) is asked again soon; a readable one is kept 5 minutes
    if (!fresh && k && Date.now() - k.at < (k.c ? KEEP_MS : 30000)) return k.c;
    const { fs, db } = await Cloud().sdk();
    let c = null;
    try { const snap = await fs.getDoc(fs.doc(db, 'fr', fuid)); c = snap.exists() ? snap.data() : null; } catch (e) {
      if (!(e && /permission/i.test(e.code || e.message || ''))) throw e; // offline: the caller says so
    }
    cards.set(fuid, { at: Date.now(), c });
    return c;
  }

  /** Invitations of mine that friends accepted: they join my list; old unanswered ones go. */
  async function checkInvites() {
    if (!joined()) return;
    const { fs, db } = await Cloud().sdk();
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'inv'), fs.where('from', '==', uid())));
    let f = me().f || [];
    const blocked = me().blocked || [];
    for (const d of snap.docs) {
      const v = d.data();
      if (v.to) {
        if (!blocked.includes(v.to)) f = FR.addFriend(f, v.to, uid());
        await fs.deleteDoc(fs.doc(db, 'inv', d.id)).catch(() => {});
      } else if (Date.now() - (v.t || 0) > FR.INVITE_DAYS * U.DAY) await fs.deleteDoc(fs.doc(db, 'inv', d.id)).catch(() => {});
    }
    if (f.length !== (me().f || []).length) {
      await Store.setSettings((s) => { s.fr = Object.assign({}, s.fr, { f }); });
      await publish(true);
      UI.toast('חבר/ה חדש/ה הצטרף/ה לתחרות 🤝');
    }
  }

  /* ---------------- joining: a nickname and an emoji ---------------- */
  function profileSheet(done, opts) {
    opts = opts || {};
    // the name: the one chosen before, else the user's first name (friends know each other by name)
    let n = me().n || LB.firstName(S.settings.userName) || (S.settings.lb && S.settings.lb.n) || '';
    let e = LB.EMOJI.includes(me().e) ? me().e : (S.settings.lb && LB.EMOJI.includes(S.settings.lb.e) ? S.settings.lb.e : LB.EMOJI[Math.floor(Math.random() * LB.EMOJI.length)]);
    UI.openSheet({
      title: me().on ? 'השם שלי בתחרות' : 'הצטרפות לתחרות עם החברים',
      cls: 'lb-profile fr-profile',
      body: `${opts.intro || ''}
        <label class="field"><span class="lbl">השם שלך (החברים יראו אותו)</span>
          <span class="lb-nick"><input class="input" id="fr-n" maxlength="16" autocomplete="given-name" placeholder="השם הפרטי שלך" value="${esc(n)}"></span>
          <span class="tiny lb-err" id="fr-err" role="alert"></span></label>
        <div class="section-title">אימוג׳י</div>
        <div class="lb-emoji" role="radiogroup" aria-label="אימוג׳י">${LB.EMOJI.map((x) => `<button role="radio" aria-checked="${x === e}" class="${x === e ? 'on' : ''}" data-e="${x}">${x}</button>`).join('')}</div>
        <div class="tiny muted lb-note">רק החברים שהוספת רואים את הכרטיס שלך: השם, האימוג׳י והסכומים (אפשר להסתיר אותם). שום פרט אחר.</div>
        <button class="btn big block" data-save>${icon('check')} ${me().on ? 'שמירה' : (opts.cta || 'הצטרפות')}</button>`,
      onMount: (el) => {
        const input = el.querySelector('#fr-n');
        const err = el.querySelector('#fr-err');
        input.addEventListener('input', () => { err.textContent = ''; });
        el.addEventListener('click', async (ev) => {
          const b = ev.target.closest('button');
          if (!b) return;
          if (b.dataset.e) { e = b.dataset.e; el.querySelectorAll('[data-e]').forEach((x) => { const on = x.dataset.e === e; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); }
          else if (b.hasAttribute('data-save')) {
            n = String(input.value || '').trim().replace(/\s+/g, ' ');
            const bad = LB.nickProblem(n);
            if (bad) { err.textContent = bad; input.focus(); return; }
            if (!signedIn()) { UI.toast('צריך להתחבר לחשבון'); return; }
            b.disabled = true;
            const was = me();
            await Store.setSettings((s) => { s.fr = Object.assign({ f: [], blocked: [], hide: false }, s.fr, { on: true, n, e }); });
            try {
              await publish(true);
              UI.closeTop();
              if (done) setTimeout(done, 280);
            } catch (x) {
              await Store.setSettings((s) => { s.fr = was.on ? was : Object.assign({}, s.fr, { on: false }); });
              b.disabled = false;
              UI.toast(navigator.onLine ? 'השמירה נכשלה. נסו שוב' : 'אין חיבור לאינטרנט');
            }
          }
        });
      },
    });
  }
  const signIn = () => { UI.closeAll(); App.go('settings'); setTimeout(() => App.sheetsApi.settingsSection('account'), 350); };

  /* ---------------- inviting ---------------- */
  View.invite = async function () {
    if (!signedIn()) { signedOutSheet(); return; }
    if (!joined()) { profileSheet(() => View.invite(), { cta: 'הצטרפות והזמנה' }); return; }
    const code = FR.code((k) => { const a = new Uint8Array(k); crypto.getRandomValues(a); return a; });
    try {
      const { fs, db } = await Cloud().sdk();
      await fs.setDoc(fs.doc(db, 'inv', code), { from: uid(), n: me().n, e: me().e, t: Date.now(), to: '' });
    } catch (e) { UI.toast(navigator.onLine ? 'לא הצלחנו ליצור הזמנה. נסו שוב' : 'אין חיבור לאינטרנט'); return; }
    const url = `${APP_URL}?friend=${code}`;
    const text = `${me().e} ${me().n} מזמין/ה אותך לתחרות בשעתי: מי מרוויח יותר לשעה, החודש והשנה? 💸`;
    try { if (navigator.share) { await navigator.share({ title: 'Shaati', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    await UI.copyText(text + ' ' + url);
    UI.toast('הקישור הועתק. אפשר להדביק בוואטסאפ 💚');
  };

  /* ---------------- accepting ---------------- */
  let handling = false;
  async function handleInvite() {
    const code = pendingCode();
    if (!code || handling) return;
    if (!signedIn()) { signedOutSheet(true); return; }
    handling = true;
    try {
      const { fs, db } = await Cloud().sdk();
      const snap = await fs.getDoc(fs.doc(db, 'inv', code));
      const v = snap.exists() ? snap.data() : null;
      const blocked = me().blocked || [];
      if (!v || Date.now() - (v.t || 0) > FR.INVITE_DAYS * U.DAY) { dropCode(); UI.toast('ההזמנה כבר לא בתוקף. בקשו קישור חדש'); return; }
      if (v.from === uid()) { dropCode(); UI.toast('זו ההזמנה שלך: שלחו אותה לחבר'); return; }
      if (blocked.includes(v.from)) { dropCode(); return; }
      if (v.to && v.to !== uid()) { dropCode(); UI.toast('מישהו כבר הצטרף עם ההזמנה הזו. בקשו קישור חדש'); return; }
      if ((me().f || []).includes(v.from) && v.to === uid()) { dropCode(); View.open(); return; }
      acceptSheet(code, v);
    } catch (e) {
      UI.toast(navigator.onLine ? 'לא הצלחנו לפתוח את ההזמנה. ננסה שוב בפתיחה הבאה' : 'אין חיבור לאינטרנט. ננסה שוב');
    } finally { handling = false; }
  }
  View.handleInvite = handleInvite;
  function acceptSheet(code, v) {
    const accept = async (btn) => {
      if (btn) btn.disabled = true;
      try {
        const { fs, db } = await Cloud().sdk();
        await fs.setDoc(fs.doc(db, 'inv', code), { to: uid() }, { merge: true });
        await Store.setSettings((s) => { s.fr = Object.assign({}, s.fr, { f: FR.addFriend((s.fr || {}).f || [], v.from, uid()) }); });
        // until the sender's app lists me back, the table shows them as waiting, by the name in the invitation
        await Store.setMeta({ frNames: Object.assign({}, S.meta.frNames, { [v.from]: { n: v.n, e: v.e } }) });
        await publish(true);
        dropCode();
        UI.closeAll();
        if (root.Fx) root.Fx.celebrate('big');
        UI.toast(`התחרות עם ${v.n} התחילה! 🤝`);
        setTimeout(() => View.open(), 450);
      } catch (e) {
        if (btn) btn.disabled = false;
        UI.toast(navigator.onLine ? 'ההצטרפות נכשלה. נסו שוב' : 'אין חיבור לאינטרנט');
      }
    };
    const intro = `<div class="fr-invite"><span class="fr-inv-e" aria-hidden="true">${esc(v.e)}</span><b>${esc(v.n)}</b><span>מזמין/ה אותך לתחרות: מי מרוויח יותר לשעה, החודש והשנה? 💸</span></div>`;
    if (!joined()) { profileSheet(() => accept(), { intro, cta: 'מצטרפים לתחרות' }); return; }
    UI.openSheet({
      title: 'הזמנה לתחרות',
      cls: 'fr-accept',
      body: `${intro}
        <div class="tiny muted lb-note">החברים בתחרות רואים רק את השם, האימוג׳י והסכומים שלך${me().hide ? ' (שאצלך מוסתרים)' : ''}. אפשר להסיר חבר בכל רגע.</div>
        <button class="btn big block go" data-acc>${icon('check')} מצטרפים</button>
        <button class="btn text block" data-no>לא עכשיו</button>`,
      onMount: (el) => {
        el.querySelector('[data-acc]').onclick = (e) => accept(e.currentTarget);
        el.querySelector('[data-no]').onclick = () => { dropCode(); UI.closeTop(); };
      },
    });
  }
  function signedOutSheet(invited) {
    UI.openSheet({
      title: invited ? 'הזמנה לתחרות' : 'התחרות עם החברים',
      cls: 'fr-signin',
      body: `<div class="fr-empty"><span aria-hidden="true">🤝</span><b>${invited ? 'הוזמנת לתחרות עם חבר!' : 'מי מרוויח יותר?'}</b>
        <span>מתחברים עם חשבון Google${invited ? ', ואז ההזמנה נפתחת לבד' : ', מזמינים חברים ורואים מי מרוויח הכי הרבה לשעה, החודש והשנה'}.</span></div>
        <button class="btn big block" data-in>${icon('cloud')} התחברות</button>`,
      onMount: (el) => { el.querySelector('[data-in]').onclick = signIn; },
    });
  }

  /* ---------------- the table ---------------- */
  let period = 'm';
  View.open = function () {
    if (!signedIn()) { signedOutSheet(false); return; }
    if (!joined()) { profileSheet(() => View.open()); return; }
    let rows = null, seq = 0;
    const meRow = () => ({ uid: uid(), n: me().n, e: me().e, hide: !!me().hide, s: me().hide ? null : FR.stats(App.model, Engine, today()), me: true, state: 'ok' });
    const amount = (r) => {
      if (r.state === 'pending') return '<span class="fr-wait">ממתין/ה</span>';
      if (r.v == null) return '<span class="fr-hid" title="מסתיר/ה סכומים">🙈</span>';
      return period === 'h' ? `${UI.money(r.v, 2)}` : UI.money(r.v, 0);
    };
    const row = (r) => `<li><button class="fr-row ${r.me ? 'me' : ''} ${r.state === 'pending' ? 'pending' : ''}" ${r.me ? 'data-fr-me' : `data-fr-uid="${esc(r.uid)}"`}>
        <span class="lb-r">${r.rank || '–'}</span><span class="lb-e" aria-hidden="true">${esc(r.e || '🙂')}</span>
        <span class="lb-n">${esc(r.n || '…')}${r.me ? ' <small>(את/ה)</small>' : ''}${r.state === 'pending' ? '<small class="fr-sub">יופיע/תופיע כשיפתח/תפתח את שעתי</small>' : ''}</span>
        <span class="lb-s">${amount(r)}</span></button></li>`;
    function paint(el) {
      const list = el.querySelector('[data-fr-list]');
      if (!rows) { list.innerHTML = '<li class="fr-loading">' + UI.skeleton(3) + '</li>'; return; }
      const t = FR.table(rows, period, today());
      list.innerHTML = t.map(row).join('') + (rows.length < 2 ? `<li class="fr-empty"><span aria-hidden="true">🤝</span><b>עוד אין כאן חברים</b><span>הזמינו חבר בקישור, ותראו מי מרוויח יותר לשעה, החודש והשנה.</span></li>` : '');
    }
    async function load(el, fresh) {
      const my = ++seq;
      try {
        await checkInvites().catch(() => {});
        const f = me().f || [];
        const got = await Promise.all(f.map(async (x) => {
          const c = await readCard(x, fresh);
          return c ? { uid: x, n: c.n, e: c.e, hide: !!c.hide, s: c.hide ? null : c.s || null, state: 'ok' } : Object.assign({ uid: x, state: 'pending', n: '…' }, pendingNames()[x] && typeof pendingNames()[x] === 'object' ? pendingNames()[x] : {});
        }));
        if (my !== seq || !el.isConnected) return;
        rows = [meRow()].concat(got);
      } catch (e) {
        if (my !== seq || !el.isConnected) return;
        rows = [meRow()];
        UI.toast(navigator.onLine ? 'לא הצלחנו לטעון את החברים' : 'אין חיבור לאינטרנט');
      }
      paint(el);
    }
    UI.openSheet({
      title: 'התחרות עם החברים 🤝',
      full: true,
      cls: 'fr-sheet lb-sheet',
      body: `<div class="seg lb-periods fr-periods" role="tablist" aria-label="תקופה">${PERIODS.map(([k, l]) => `<button class="${k === period ? 'on' : ''}" role="tab" aria-selected="${k === period}" data-period="${k}">${l}</button>`).join('')}</div>
        <ol class="lb-list fr-list" data-fr-list></ol>
        <button class="btn big block go fr-inv-btn" data-fr-invite>${icon('send', 's')} הזמנת חבר</button>
        <div class="card fr-opts">${`<label class="switch-row"><span class="body"><span class="t">הסתרת הסכומים שלי</span><span class="s">החברים יראו אותך בטבלה, בלי הסכומים</span></span><input type="checkbox" class="switch" data-fr-hide ${me().hide ? 'checked' : ''}></label>`}
          <div class="fr-links"><button class="btn text sm" data-fr-profile>${icon('edit', 's')} השם שלי</button><button class="btn text sm danger" data-fr-leave>יציאה מהתחרות</button></div></div>
        <div class="tiny muted lb-note">לשעה: השכר על העבודה עצמה (כולל שבתות ושעות נוספות, בלי נסיעות) השנה. החודש, השנה וכל הזמנים: ברוטו. רק חברים שהוספתם זה את זה רואים את הכרטיס.</div>`,
      onMount: (el) => {
        paint(el);
        load(el, false);
        el.addEventListener('change', async (e) => {
          if (!e.target.matches('[data-fr-hide]')) return;
          const hide = e.target.checked;
          await Store.setSettings((s) => { s.fr = Object.assign({}, s.fr, { hide }); });
          try { await publish(true); } catch (x) { UI.toast('יישלח כשיהיה חיבור'); }
          rows = rows && rows.map((r) => (r.me ? meRow() : r)); paint(el);
        });
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.period) {
            if (b.dataset.period === period) return;
            period = b.dataset.period;
            el.querySelectorAll('[data-period]').forEach((x) => { const on = x.dataset.period === period; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
            paint(el);
          } else if (b.hasAttribute('data-fr-invite')) View.invite();
          else if (b.hasAttribute('data-fr-profile')) profileSheet(() => { rows = rows && rows.map((r) => (r.me ? meRow() : r)); paint(el); });
          else if (b.hasAttribute('data-fr-leave')) {
            if (!(await UI.confirm('לצאת מהתחרות?', 'הכרטיס שלך יימחק, והחברים לא יראו אותך יותר. אפשר להצטרף שוב בכל רגע.', 'יציאה', true))) return;
            await View.forget(); UI.closeTop();
          } else if (b.dataset.frUid) friendMenu(b.dataset.frUid, rows.find((r) => r.uid === b.dataset.frUid), () => { rows = rows.filter((r) => r.uid !== b.dataset.frUid); paint(el); });
        });
      },
    });
  };
  // a friend whose card I can't read yet: the name from the invitation, kept on this phone
  const pendingNames = () => (S.meta.frNames || {});

  function friendMenu(fuid, r, gone) {
    const name = r && r.n && r.n !== '…' ? r.n : 'החבר/ה';
    UI.openSheet({
      title: `${r && r.e ? r.e + ' ' : ''}${name}`,
      cls: 'fr-menu',
      body: `<button class="item" data-rm><span class="body"><span class="t">הסרה מהחברים</span><span class="s">לא תראו זה את זה בטבלה. אפשר להזמין שוב</span></span></button>
        <button class="item danger" data-block><span class="body"><span class="t">חסימה</span><span class="s">הסרה, ובלי הזמנות ממנו/ה בעתיד</span></span></button>`,
      onMount: (el) => {
        const drop = async (block) => {
          await Store.setSettings((s) => {
            const f = FR.removeFriend((s.fr || {}).f, fuid);
            const blocked = block ? FR.addFriend((s.fr || {}).blocked || [], fuid, null) : (s.fr || {}).blocked || [];
            s.fr = Object.assign({}, s.fr, { f, blocked });
          });
          cards.delete(fuid);
          try { await publish(true); } catch (x) { /* sent with the next change */ }
          UI.closeTop();
          UI.toast(block ? 'נחסם/ה ✓' : 'הוסר/ה ✓');
          gone();
        };
        el.querySelector('[data-rm]').onclick = () => drop(false);
        el.querySelector('[data-block]').onclick = async () => { if (await UI.confirm(`לחסום את ${name}?`, 'יוסר/תוסר מהחברים, והזמנות ממנו/ה לא ייפתחו.', 'חסימה', true)) drop(true); };
      },
    });
  }

  /** Leaving (or deleting the account): my card and my invitations go. */
  View.forget = async function () {
    try {
      if (signedIn()) {
        const { fs, db } = await Cloud().sdk();
        await fs.deleteDoc(fs.doc(db, 'fr', uid()));
        const snap = await fs.getDocs(fs.query(fs.collection(db, 'inv'), fs.where('from', '==', uid())));
        for (const d of snap.docs) await fs.deleteDoc(fs.doc(db, 'inv', d.id)).catch(() => {});
      }
    } catch (e) { /* offline: tried again by leaving again */ }
    cards.clear();
    if (me().on) await Store.setSettings((s) => { s.fr = Object.assign({}, s.fr, { on: false, f: [] }); });
    await Store.setMeta({ frPub: null });
  };

  /** A card for the games list. */
  const hubSub = () => {
    const nf = (me().f || []).length;
    if (!joined()) return 'מי מרוויח יותר לשעה, החודש והשנה?';
    if (!nf) return 'הזמינו חבר ותראו מי מרוויח יותר';
    return nf === 1 ? 'חבר/ה אחד/ת בתחרות' : `${nf} חברים בתחרות`;
  };
  View.hubCard = () => `<button class="ach-card fr-card" data-fr-hub><span class="ach-card-e" aria-hidden="true">🤝</span><span class="gm-txt"><b>התחרות עם החברים</b><span>${hubSub()}</span></span>${icon('left', 's')}</button>`;

  /** After the app opens: an invitation that came with the address, then accepted ones of mine. */
  View.boot = function () {
    const go = (tries) => {
      if (document.querySelector('.sheet.show, .dialog, #intro') && tries < 60) { setTimeout(() => go(tries + 1), 1000); return; }
      if (pendingCode()) handleInvite();
      else if (joined()) checkInvites().then(() => publish()).catch(() => {});
    };
    setTimeout(() => go(0), 1500);
  };
  App.actions.friends = () => View.open();
  App.actions['friends-invite'] = () => View.invite();
})(typeof window !== 'undefined' ? window : globalThis);
