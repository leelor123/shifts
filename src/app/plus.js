/* ============================================================
 * plus.js — "Shaati Plus": an optional one-time purchase.
 *
 * Everything the app does stays free. Plus adds skins for the pay card on
 * home and says thank you; no ads, no reminders that interrupt. Nothing about
 * Plus shows until a way of buying it is set up (or for an admin who
 * previews it), so without it the app looks exactly the same.
 *
 * Two ways of buying, by where the app runs:
 *  - inside the Android app from Google Play: only Google Play Billing
 *    (Digital Goods API + Payment Request; card, Google Pay, PayPal or Play
 *    balance, whatever the account has). Google's rules allow nothing else
 *    there, so no other way is shown or mentioned;
 *  - on the web and on iPhone: Lemon Squeezy's checkout (card, Apple Pay,
 *    Google Pay, PayPal; they handle VAT), which emails a purchase code. The
 *    code is checked with Lemon Squeezy's licence service (no server of ours,
 *    no secret in the app) and saved in the account, so every phone of that
 *    account turns Plus on by itself — the Android app too, which may honour a
 *    purchase made elsewhere.
 *
 * Every start asks both: any "yes" turns Plus on, "no" from all of them
 * (a refund) turns it off, and no answer (offline) keeps what was known.
 * Settings (pay-config.js): the web checkout link, product number and price.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const BILLING = 'https://play.google.com/billing';
  const SKU = 'shaati_plus'; // the in-app product's id in Google Play Console (one-time, not a subscription)
  const LS_API = 'https://api.lemonsqueezy.com/v1/licenses/';
  // Pay-card skins (styles-v3.css .sk-<id>): dark enough everywhere for the card's white text
  const SKINS = {
    gold: 'זהב', midnight: 'חצות', sunset: 'שקיעה', ocean: 'אוקיינוס', forest: 'יער', carbon: 'קרבון',
    royal: 'מלכותי', rose: 'ורד', lava: 'לבה', neon: 'ניאון', ice: 'קרח', galaxy: 'גלקסיה',
  };
  const DAY = 86400000;
  const TRIAL_DAYS = 3; // a free trial, once per phone, wherever Plus can be bought
  const cfg = () => (root.PAY_CONFIG && root.PAY_CONFIG.lemon) || {};
  const Plus = { SKU, SKINS, available: false, price: '' };
  const owned = () => !!(S.meta.plus && S.meta.plus.active);
  Plus.owned = owned;
  /** 'play' | 'web' | '' — where this phone's Plus comes from. */
  Plus.source = () => (owned() ? S.meta.plus.src || 'play' : '');
  /** Inside the Android app from Google Play: it may sell only through Google Play. */
  const inPlayApp = () => !!App.androidApp || typeof root.getDigitalGoodsService === 'function';
  Plus.inPlayApp = inPlayApp;
  /** Buying on the web (card, Apple Pay, Google Pay, PayPal through Lemon Squeezy) is set up and allowed here. */
  Plus.webShop = () => { const c = cfg(); return !!(c.checkout && +c.productId) && !inPlayApp(); };
  /**
   * An admin's preview on this phone only (admin dashboard): 'free' = as a user who has not bought
   * (the trial, "try it on your card", the offer, the allowances) even before a way of buying is set
   * up; 'plus' = as a member. Never counted in the statistics or shown to other players.
   */
  const sim = () => (App.isAdmin ? (S.meta.plusSim === 'free' ? 'free' : S.meta.plusPreview ? 'plus' : '') : '');
  Plus.preview = sim;
  /** Plus features are on: bought, in the free trial, or an admin previewing them on this phone. */
  Plus.active = () => owned() || Plus.inTrial() || sim() === 'plus';
  /** Anything about Plus is shown only when it can be bought here, or is already on (or an admin previews it). */
  Plus.visible = () => Plus.available || Plus.webShop() || Plus.active() || !!sim();
  /** The pay-card skin in use ('' = the regular card). */
  Plus.skin = () => (Plus.active() && SKINS[S.settings.skin] ? S.settings.skin : '');

  async function setOwned(on, src) {
    const cur = S.meta.plus || {};
    if (!!cur.active === on && (!on || cur.src === src)) return;
    await Store.setMeta({ plus: { active: on, src: on ? src : '', at: Date.now() } });
    App.applyTheme();
    App.rerender();
  }
  function fmtPrice(p) {
    if (!p) return '';
    try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: p.currency, maximumFractionDigits: 2 }).format(+p.value); } catch (e) { return `${p.value} ${p.currency}`; }
  }

  /* ---------------- Google Play (the Android app) ---------------- */
  async function service() {
    if (typeof root.getDigitalGoodsService !== 'function') return null;
    try { return await root.getDigitalGoodsService(BILLING); } catch (e) { return null; }
  }
  /** true / false from Google Play; null when it cannot tell (offline). */
  async function playOwns(svc) {
    try { return ((await svc.listPurchases()) || []).some((p) => p && p.itemId === SKU); } catch (e) { return null; }
  }

  /* ---------------- the web: a purchase code from Lemon Squeezy ---------------- */
  async function lemon(path, body) {
    const res = await fetch(LS_API + path, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() });
    let j = {};
    try { j = (await res.json()) || {}; } catch (e) { /* not JSON */ }
    return { status: res.status, j };
  }
  const ourProduct = (j) => !!(j && j.meta && +j.meta.product_id === +cfg().productId);
  const deviceName = () => `Shaati · ${App.androidApp ? 'Android' : /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iPhone' : 'web'} · ${new Date().toISOString().slice(0, 10)}`;
  /** true / false for the purchase code saved in the account; null when it cannot tell (none, offline). */
  async function webOwns() {
    const key = String(S.settings.plusKey || '').trim();
    if (!key || !+cfg().productId) return null;
    try {
      const inst = S.meta.plusInst;
      if (inst && inst.key === key && inst.id) {
        const r = await lemon('validate', { license_key: key, instance_id: inst.id });
        if (r.status >= 500 || r.status === 429) return null;
        if (r.j.valid && ourProduct(r.j)) return true;
        // a refund disables the code; only a lost activation of this phone is worth one more try below
        if (!(r.status === 404 && /instance/i.test(r.j.error || ''))) return false;
      }
      // a phone that has not used the code yet (a new phone of the same account)
      const a = await lemon('activate', { license_key: key, instance_name: deviceName() });
      if (a.status >= 500 || a.status === 429) return null;
      if (a.j.activated && ourProduct(a.j) && a.j.instance) { await Store.setMeta({ plusInst: { key, id: a.j.instance.id } }); return true; }
      return false;
    } catch (e) { return null; } // offline
  }

  /** At start: can Plus be bought here, and is it owned (Google Play and/or the account's purchase code)? */
  Plus.init = async function () {
    // Google Play: 'na' = nothing to ask here (not the Play app, an Android app without billing, no product
    // set up); null = could not ask (offline) — never read as "not bought"
    let play = 'na';
    if (typeof root.getDigitalGoodsService === 'function') {
      const svc = await service();
      if (!svc) play = null;
      else {
        let d, failed = false;
        try { d = ((await svc.getDetails([SKU])) || [])[0]; } catch (e) { failed = true; }
        if (failed) play = null;
        else if (d) { Plus.available = true; Plus.price = fmtPrice(d.price); Plus.priceValue = +(d.price && d.price.value) || 0; play = await playOwns(svc); }
      }
    }
    if (!Plus.available && cfg().price) Plus.price = cfg().price;
    const web = S.settings.plusKey ? await webOwns() : 'na';
    if (play === true) await setOwned(true, 'play');
    else if (web === true) await setOwned(true, 'web');
    else if (play !== null && web !== null) await setOwned(false); // a clear "no" everywhere (a refund): off
    // otherwise someone could not be asked (offline): keep what was known
    watchTrial();
    if (App.tab === 'settings') App.rerender();
  };

  /** Buying: Google Play's own sheet in the Android app, Lemon Squeezy's checkout elsewhere. */
  Plus.buy = async function () {
    if (sim() && !Plus.available && !Plus.webShop()) { UI.toast('תצוגה מקדימה: כאן ייפתח התשלום. הוא יעבוד אחרי שחשבון התשלומים יוגדר'); return false; }
    if (inPlayApp()) return buyPlay();
    if (Plus.webShop()) {
      root.open(cfg().checkout, '_blank', 'noopener');
      return false; // Plus turns on with the code from the receipt
    }
    UI.toast(sim() ? 'תצוגה מקדימה: כאן ייפתח התשלום. הוא יעבוד אחרי שחשבון התשלומים יוגדר' : 'הרכישה עוד לא זמינה כאן');
    return false;
  };
  async function buyPlay() {
    const svc = await service();
    if (!svc || !Plus.available) { UI.toast('הרכישה עוד לא זמינה כאן'); return false; }
    let res;
    try {
      const req = new PaymentRequest([{ supportedMethods: BILLING, data: { sku: SKU } }], { total: { label: 'Total', amount: { currency: 'ILS', value: '0' } } });
      res = await req.show();
    } catch (e) {
      if (!e || e.name !== 'AbortError') UI.toast('הרכישה לא הושלמה. אפשר לנסות שוב');
      return false; // closed by the user: nothing to say
    }
    try {
      const token = res.details && res.details.purchaseToken;
      // older versions of the Digital Goods API acknowledge here; newer ones do it by themselves
      if (token && typeof svc.acknowledge === 'function') await svc.acknowledge(token, 'onetime').catch(() => {});
      await res.complete('success');
    } catch (e) { /* the payment itself went through */ }
    const has = await playOwns(svc);
    if (has === false) { UI.toast('התשלום עדיין בטיפול אצל Google. Plus יופעל כשהוא יושלם'); return false; }
    await setOwned(true, 'play'); // (has === null: no answer right now; confirmed again at the next start)
    if (root.Fx) root.Fx.celebrate('big');
    return true;
  }

  /** The purchase code from the receipt (web). Saved in the account, so the other phones use it too. */
  Plus.redeem = async function (raw) {
    const key = String(raw || '').trim();
    if (!/^[A-Za-z0-9-]{16,64}$/.test(key)) { UI.invalid('הקוד לא נראה תקין. מעתיקים אותו במלואו מהמייל של הקבלה'); return false; }
    if (!+cfg().productId) { UI.toast('הפעלת קוד עוד לא זמינה'); return false; }
    let a;
    try { a = await lemon('activate', { license_key: key, instance_name: deviceName() }); } catch (e) { UI.toast('אין חיבור כרגע. נסו שוב בעוד רגע'); return false; }
    if (a.j.activated && ourProduct(a.j) && a.j.instance) {
      await Store.setSettings((s) => { s.plusKey = key; });
      await Store.setMeta({ plusInst: { key, id: a.j.instance.id } });
      await setOwned(true, 'web');
      if (root.Fx) root.Fx.celebrate('big');
      return true;
    }
    if (a.j.activated && a.j.instance && !ourProduct(a.j)) lemon('deactivate', { license_key: key, instance_id: a.j.instance.id }).catch(() => {}); // not ours: give the slot back
    const err = String(a.j.error || '');
    UI.toast(a.status === 429 || a.status >= 500 ? 'השירות לא זמין כרגע. נסו שוב בעוד רגע'
      : /activation limit/i.test(err) ? 'הקוד כבר הופעל בכמה מכשירים. אפשר לפנות אלינו בעזרה ותמיכה'
        : a.j.activated ? 'הקוד שייך למוצר אחר' : /disabled|expired/i.test(err) ? 'הקוד בוטל (למשל אחרי החזר כספי)' : 'הקוד לא נמצא. בודקים שהועתק במלואו מהמייל');
    return false;
  };

  /** "I already bought it": asks again (a new phone, a reinstall). */
  Plus.restore = async function () {
    const before = owned();
    await Plus.init();
    UI.toast(owned() ? (before ? 'Shaati Plus פעיל ✓' : 'Shaati Plus שוחזר ✓') : inPlayApp() ? 'לא נמצאה רכישה בחשבון Google הזה' : 'לא נמצאה רכישה. אפשר להזין את הקוד מהמייל');
  };

  /** Mini cards of every skin (also used in the settings). */
  Plus.skinTiles = (cur, locked) => `<div class="skin-pick">
      <button class="skin-tile ${!cur ? 'on' : ''}" data-skin="" aria-pressed="${!cur}"><b>₪</b><span>רגיל</span></button>
      ${Object.entries(SKINS).map(([k, name]) => `<button class="skin-tile sk-${k} ${cur === k ? 'on' : ''}" data-skin="${k}" aria-pressed="${cur === k}" aria-label="${name}${locked ? ' (Plus)' : ''}"><b>₪</b><span>${name}</span>${locked ? `<i class="skin-lock" aria-hidden="true">${icon('lock', 's')}</i>` : ''}</button>`).join('')}
    </div>`;
  /** A tap on a skin: applies it, or offers Plus when it is locked. */
  Plus.pickSkin = async (k) => {
    if (k && !Plus.active()) { Plus.sheet(); return false; }
    await Store.setSettings((s) => { s.skin = k || ''; });
    App.applyTheme();
    if (root.Fx) root.Fx.play('pop');
    return true;
  };

  /* ---------------- the Plus page ---------------- */
  Plus.sheet = function () {
    if (!S.meta.plusSeen) Store.setMeta({ plusSeen: true }).catch(() => {});
    let opened = false; // the web checkout was opened: the code field comes first
    const draw = (el) => {
      const on = Plus.active();
      const play = inPlayApp();
      const web = Plus.webShop();
      const price = Plus.price || cfg().price || '';
      const trial = Plus.inTrial();
      el.querySelector('[data-plus-body]').innerHTML = `
        ${App.mascotSays ? App.mascotSays(on ? 'party' : 'happy', on ? 'תודה שאת/ה איתנו! 💜' : 'רוצים לפרגן לשעתי ולקבל עיצובים מיוחדים?', { size: 64 }) : ''}
        ${Plus.skinTiles(Plus.skin(), !on)}
        <div class="card plus-list">
          <div>${icon('palette', 's')}<span><b>${Object.keys(SKINS).length} עיצובים לכרטיס השכר</b><small>זהב, גלקסיה, ניאון, לבה ועוד, בכרטיס שבמסך הבית</small></span></div>
          <div>${icon('chart', 's')}<span><b>ניתוח מתקדם וייצוא דוחות בלי הגבלה</b><small>בחינם: ${QUOTA.analysis.n} ניתוחים ו-${QUOTA.export.n} ייצואים בחודש</small></span></div>
          <div>${icon('trophy', 's')}<span><b>רקע מיוחד בטבלת האלופים</b><small>כולם יראו אותך בעיצוב שבחרת, עם תג Plus</small></span></div>
          <div>${icon('sparkle', 's')}<span><b>תג תומך/ת במסך הבית</b><small>שכולם יידעו מי עוזר/ת לשעתי להישאר בלי פרסומות</small></span></div>
          <div>${icon('star', 's')}<span><b>תודה ענקית ממני</b><small>עוזר להמשיך לפתח, ולהשאיר את האפליקציה בלי פרסומות</small></span></div>
          <div>${icon('check', 's')}<span><b>כל השאר נשאר חינם</b><small>משמרות, חישוב שכר, זכויות, בדיקת תלוש, דוחות ומשחקים</small></span></div>
        </div>
        ${on && !trial ? `<div class="plus-done">${icon('check')} ${owned() ? 'Shaati Plus פעיל אצלך' : 'תצוגה מקדימה של מנהל'}</div>`
          : `${trial ? `<div class="plus-done trial">${icon('sparkle')} תקופת ניסיון · ${trialLeft()}</div>` : ''}
             ${Plus.canTrial() ? `<button class="btn big block plus-buy" data-plus-trial>${icon('sparkle')} לנסות ${TRIAL_DAYS} ימים בחינם</button>` : ''}
             <button class="btn ${Plus.canTrial() ? 'tonal plus-buy2' : 'big plus-buy'} block" data-plus-buy ${(play ? Plus.available : web) || sim() ? '' : 'disabled'}>${icon(Plus.canTrial() ? 'star' : 'sparkle', Plus.canTrial() ? 's' : '')} ${trial ? 'קנייה ושמירה' : 'קנייה חד-פעמית'}${price ? ' · ' + esc(price) : ''}</button>
             ${Plus.workPrice() ? `<div class="tiny plus-work">${esc(Plus.workPrice())}</div>` : ''}
             <div class="plus-pay">${play ? '<span>Google Play</span><span>כרטיס אשראי</span><span>Google Pay</span><span>PayPal</span>' : '<span>כרטיס אשראי</span><span>Apple Pay</span><span>Google Pay</span><span>PayPal</span>'}</div>
             <div class="tiny muted plus-note">${play ? 'תשלום אחד דרך Google Play, בלי מנוי ובלי חיובים נוספים.' : 'תשלום אחד בדף תשלום מאובטח של Lemon Squeezy, בלי מנוי. אחרי התשלום מגיע במייל קוד הפעלה.'} מתחת לגיל 18: בהסכמת הורה.</div>`}
        ${(!on || trial) && !play && web ? `<div class="card plus-code ${opened ? 'hot' : ''}"><label class="field"><span class="lbl">${opened ? 'שילמת? מדביקים כאן את הקוד מהמייל' : 'כבר יש לי קוד מהמייל'}</span>
            <input class="input" id="plus-key" dir="ltr" autocomplete="off" spellcheck="false" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"></label>
            <button class="btn tonal block" data-plus-redeem>${icon('key', 's')} הפעלה</button></div>` : ''}
        <div class="plus-links">${on && owned() ? '' : '<button class="btn text sm" data-plus-restore>שחזור רכישה</button>'}
          ${App.isAdmin ? `<label class="tiny plus-preview"><input type="checkbox" data-plus-preview ${S.meta.plusPreview ? 'checked' : ''}> תצוגה מקדימה (מנהל)</label>` : ''}</div>`;
      if (opened) { const i = el.querySelector('#plus-key'); if (i) i.focus(); }
    };
    UI.openSheet({
      title: 'Shaati Plus ✨',
      cls: 'plus-sheet',
      body: '<div data-plus-body></div>',
      onMount: (el) => {
        draw(el);
        let busy = false;
        const run = async (fn) => { if (busy) return; busy = true; try { if (await fn()) draw(el); } finally { busy = false; } };
        el.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-plus-trial')) run(() => Plus.startTrial(Plus.skin() || 'gold'));
          else if (b.hasAttribute('data-plus-buy')) run(async () => { const ok = await Plus.buy(); if (!ok && !inPlayApp() && Plus.webShop()) { opened = true; return true; } return ok; });
          else if (b.hasAttribute('data-plus-redeem')) run(() => Plus.redeem((el.querySelector('#plus-key') || {}).value));
          else if (b.hasAttribute('data-plus-restore')) run(async () => { await Plus.restore(); return true; });
          else if (b.dataset.skin !== undefined) {
            if (b.dataset.skin && !Plus.active()) { UI.closeTop(); setTimeout(() => Plus.design(b.dataset.skin), 320); return; }
            run(() => Plus.pickSkin(b.dataset.skin));
          }
        });
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'plus-key') run(() => Plus.redeem(e.target.value)); });
        el.addEventListener('change', async (e) => {
          if (!e.target.matches('[data-plus-preview]')) return;
          await Store.setMeta({ plusPreview: e.target.checked, plusSim: '' });
          App.applyTheme(); App.rerender(); draw(el);
        });
      },
    });
  };
  /* ---------------- trying it, and offering it at a good moment ----------------
   * What makes people buy, without tricks: seeing it on their own card, a free trial, the price in
   * their own minutes of work, and one quiet offer after they have come to like the app. No pop-ups,
   * no countdowns; every offer closes with one tap and comes back at most a few times. */
  /** Can be bought on this phone (Google Play here, or the web checkout). */
  const buyable = () => Plus.available || Plus.webShop() || sim() === 'free';
  Plus.inTrial = () => !owned() && +((S.meta.plusTrial || {}).until || 0) > Date.now();
  Plus.canTrial = () => !owned() && !S.meta.plusTrial && buyable();
  let trialTimer = 0;
  /** At the end of a trial the look goes back, also when the app stays open. */
  function watchTrial() {
    clearTimeout(trialTimer);
    const until = +((S.meta.plusTrial || {}).until || 0);
    if (owned() || !(until > Date.now())) return;
    trialTimer = setTimeout(() => { App.applyTheme(); if (!App.blocking) App.rerender(); }, Math.min(until - Date.now() + 500, 2 ** 31 - 1));
  }
  const trialLeft = () => { const d = Math.max(1, Math.ceil(((S.meta.plusTrial || {}).until - Date.now()) / DAY)); return d === 1 ? 'נשאר יום אחד' : `נשארו ${d} ימים`; };
  Plus.startTrial = async (skin) => {
    if (!Plus.canTrial()) return false;
    await Store.setMeta({ plusTrial: { from: Date.now(), until: Date.now() + TRIAL_DAYS * DAY }, plusSeen: true });
    watchTrial();
    if (skin && SKINS[skin]) await Store.setSettings((s) => { s.skin = skin; });
    App.applyTheme();
    App.rerender();
    if (root.Fx) root.Fx.celebrate('small');
    UI.toast(`${TRIAL_DAYS} ימים של Shaati Plus במתנה ✨`);
    return true;
  };
  /** The price as minutes of this user's own work ("≈ 17 דק׳ של העבודה שלך"). */
  Plus.workPrice = () => {
    const p = +Plus.priceValue || +(root.PAY_CONFIG || {}).price || 0;
    const role = App.roles && App.roles()[0];
    const rate = role ? root.Engine.roleRate(role, root.U.todayKey()) : 0;
    if (!(p > 0 && rate > 0) || !root.Games) return '';
    return `≈ ${root.Games.workTime(p / rate)} של העבודה שלך`;
  };

  /* ---------------- free allowances ----------------
   * A few extras come with a free allowance, and Plus (or the trial) makes them unlimited. Never the
   * things that matter (shifts, pay, rights, the payslip check, reports on screen, backup, sync,
   * sharing, the games), and no allowance at all until Plus can be bought on this phone. Counted on the phone. */
  const QUOTA = {
    analysis: { n: 3, per: 'month', what: 'ניתוחים המתקדמים', one: 'ניתוח', unit: 'בחודש' },
    export: { n: 5, per: 'month', what: 'ייצואי הדוחות (PDF ואקסל)', one: 'ייצוא', unit: 'בחודש' },
  };
  Plus.QUOTA = QUOTA;
  const periodKey = (per) => (per === 'day' ? root.U.todayKey() : root.U.todayKey().slice(0, 7));
  /** Allowances apply here: Plus can be bought, and is not on. */
  Plus.limited = () => buyable() && !Plus.active();
  const usedOf = (id) => { const u = (S.meta.plusUse || {})[id]; return u && u.k === periodKey(QUOTA[id].per) ? +u.n || 0 : 0; };
  /** What is left of an allowance (Infinity when there is none). */
  Plus.left = (id) => (QUOTA[id] && Plus.limited() ? Math.max(0, QUOTA[id].n - usedOf(id)) : Infinity);
  /** Takes one from an allowance: true = go ahead; false = none left (the Plus offer opens instead). */
  Plus.use = (id) => {
    if (!QUOTA[id] || !Plus.limited()) return true;
    const q = QUOTA[id];
    const left = q.n - usedOf(id);
    if (left <= 0) {
      if (!S.meta.plusWall) Store.setMeta({ plusWall: true }).catch(() => {});
      Plus.limitSheet(id);
      return false;
    }
    Store.setMeta({ plusUse: Object.assign({}, S.meta.plusUse, { [id]: { k: periodKey(q.per), n: usedOf(id) + 1 } }) }).catch(() => {});
    if (left === 2) UI.toast(`נשאר עוד ${q.one} אחד חינם ${q.per === 'day' ? 'להיום' : 'החודש'}`);
    return true;
  };
  /** "That was the free allowance": when it comes back, and the way to unlimited. */
  Plus.limitSheet = function (id) {
    const q = QUOTA[id];
    const back = q.per === 'day' ? 'מחר' : `ב-1 ב${root.U.HEB_MONTHS[(+root.U.todayKey().slice(5, 7)) % 12]}`;
    const price = Plus.price || cfg().price || '';
    UI.openSheet({
      title: 'נגמרה המכסה החינמית',
      cls: 'plus-sheet limit-sheet',
      body: `${App.mascotSays ? App.mascotSays('think', `השתמשת ב-${q.n} ה${q.what} החינמיים ${q.per === 'day' ? 'של היום' : 'של החודש'}. ${back} יש עוד ${q.n}.`, { size: 64 }) : ''}
        <div class="card plus-list">
          <div>${icon('sparkle', 's')}<span><b>עם Shaati Plus: בלי הגבלה</b><small>ניתוח מתקדם וייצוא דוחות בלי הגבלה, ${Object.keys(SKINS).length} עיצובים, רקע מיוחד בטבלת האלופים ותג תומך/ת</small></span></div>
          <div>${icon('check', 's')}<span><b>כל השאר נשאר חינם</b><small>משמרות, חישוב שכר, זכויות, בדיקת תלוש, דוחות במסך, משחקים, גיבוי וסנכרון</small></span></div>
        </div>
        ${Plus.canTrial() ? `<button class="btn big block plus-buy" data-limit-trial>${icon('sparkle')} לנסות ${TRIAL_DAYS} ימים בחינם</button>` : `<button class="btn big block plus-buy" data-limit-buy>${icon('sparkle')} Shaati Plus${price ? ' · ' + esc(price) : ''}</button>`}
        ${Plus.workPrice() ? `<div class="tiny plus-work">${esc(Plus.workPrice())} · תשלום אחד, בלי מנוי</div>` : ''}
        <button class="btn text block" data-limit-later>${back}, תודה</button>`,
      onMount: (el) => {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-limit-trial')) { if (await Plus.startTrial(Plus.skin() || 'gold')) UI.closeTop(); }
          else if (b.hasAttribute('data-limit-buy')) { UI.closeTop(); setTimeout(() => Plus.sheet(), 320); }
          else if (b.hasAttribute('data-limit-later')) UI.closeTop();
        });
      },
    });
  };

  /** "Try it on your card": the user's own pay card, in every skin. */
  Plus.design = function (start) {
    let sel = SKINS[start] ? start : Plus.skin() || 'gold';
    const preview = () => {
      let html = '';
      try { html = App.homeHero ? App.homeHero() : ''; } catch (e) { /* no workplace yet */ }
      if (!html) return '<section class="home-hero"><div class="hh-label">ברוטו החודש עד עכשיו</div><div class="hero-num">₪1,240</div></section>';
      const t = document.createElement('template');
      t.innerHTML = html;
      const c = t.content.firstElementChild;
      c.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
      c.querySelectorAll('.vh, .hh-skin').forEach((x) => x.remove());
      c.querySelectorAll('[data-act], button').forEach((x) => { x.removeAttribute('data-act'); x.setAttribute('tabindex', '-1'); });
      c.removeAttribute('data-act');
      return c.outerHTML;
    };
    const draw = (el) => {
      const on = Plus.active();
      const price = Plus.price || cfg().price || '';
      el.querySelector('[data-design]').innerHTML = `
        <div class="design-prev ${sel ? 'sk-' + sel : ''}" aria-hidden="true" inert>${preview()}</div>
        <div class="skin-pick design-pick">
          <button class="skin-tile ${!sel ? 'on' : ''}" data-pick="" aria-pressed="${!sel}"><b>₪</b><span>רגיל</span></button>
          ${Object.entries(SKINS).map(([k, name]) => `<button class="skin-tile sk-${k} ${sel === k ? 'on' : ''}" data-pick="${k}" aria-pressed="${sel === k}"><b>₪</b><span>${name}</span></button>`).join('')}
        </div>
        ${on ? `<button class="btn big block" data-design-save>${icon('check')} שמירה</button>
            ${Plus.inTrial() ? `<div class="tiny muted plus-note">תקופת ניסיון · ${trialLeft()} · <button class="btn text sm" data-design-buy>לקנות ולשמור</button></div>` : ''}`
          : `${Plus.canTrial() ? `<button class="btn big block plus-buy" data-design-trial>${icon('sparkle')} לנסות ${TRIAL_DAYS} ימים בחינם</button>` : ''}
             <button class="btn ${Plus.canTrial() ? 'tonal' : 'big plus-buy'} block" data-design-buy ${buyable() ? '' : 'disabled'}>${icon('star', 's')} קנייה חד-פעמית${price ? ' · ' + esc(price) : ''}</button>
             <div class="tiny muted plus-note">${Plus.workPrice() ? esc(Plus.workPrice()) + ' · ' : ''}בלי מנוי · כל השאר נשאר חינם</div>`}`;
    };
    UI.openSheet({
      title: 'עיצוב כרטיס השכר',
      cls: 'plus-sheet design-sheet',
      body: '<div data-design></div>',
      onMount: (el) => {
        if (!S.meta.plusSeen) Store.setMeta({ plusSeen: true }).catch(() => {});
        draw(el);
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.pick !== undefined) {
            sel = b.dataset.pick;
            el.querySelector('.design-prev').className = 'design-prev' + (sel ? ' sk-' + sel : '');
            el.querySelectorAll('[data-pick]').forEach((x) => { const on = x.dataset.pick === sel; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
            if (root.Fx) root.Fx.play('tick');
          } else if (b.hasAttribute('data-design-save')) { await Plus.pickSkin(sel); UI.closeTop(); }
          else if (b.hasAttribute('data-design-trial')) { if (await Plus.startTrial(sel || 'gold')) UI.closeTop(); }
          else if (b.hasAttribute('data-design-buy')) { UI.closeTop(); setTimeout(() => Plus.sheet(), 320); }
        });
      },
    });
  };
  App.actions['plus-design'] = () => Plus.design();

  /**
   * One quiet card on home, at a good moment: after a few days of real use, not while a trial runs,
   * at most 3 times ever, 3 weeks apart, each showing for up to 3 days until closed. When a trial ends,
   * one card asks whether to keep the skin. Nothing at all until Plus can be bought here.
   */
  Plus.nudgeCard = function () {
    // a trial that ended while the app was open: the card returns to the regular look
    const want = Plus.skin();
    if ((document.documentElement.dataset.skin || '') !== want) App.applyTheme();
    if (!buyable() || Plus.active() || (S.meta.guide && !S.meta.guideDone)) return '';
    const now = Date.now();
    const close = '<button class="icon-btn plus-nudge-x" data-act="plus-nudge-x" aria-label="סגירה">' + icon('x', 's') + '</button>';
    if (S.meta.plusTrial && !S.meta.plusTrialEnd) {
      const name = SKINS[S.settings.skin] || 'המיוחד';
      return `<div class="card plus-nudge sk-${SKINS[S.settings.skin] ? S.settings.skin : 'gold'}">${close}
        <div class="pn-t">הניסיון של Shaati Plus הסתיים</div><div class="pn-s">להשאיר את הכרטיס ב${esc(name)}? תשלום אחד, בלי מנוי${Plus.workPrice() ? ' · ' + esc(Plus.workPrice()) : ''}.</div>
        <div class="pn-a"><button class="btn sm" data-act="plus-open">${icon('star', 's')} להשאיר</button><button class="btn text sm" data-act="plus-nudge-x">לא, תודה</button></div></div>`;
    }
    let n = S.meta.plusNudge || {};
    const showing = n.at && now - n.at < 3 * DAY && n.x !== n.at;
    if (!showing) {
      if (n.off || (n.shown || 0) >= 3 || (n.at && now - n.at < 21 * DAY)) return '';
      let done = 0;
      for (const r of App.model.results.values()) if (r.status === 'done') done++;
      if ((S.meta.activeDays || 0) < 4 || done < 5 || S.settings.demo) return '';
      n = Object.assign({}, n, { at: now, shown: (n.shown || 0) + 1 });
      Store.setMeta({ plusNudge: n }).catch(() => {});
    }
    return `<div class="card plus-nudge sk-galaxy">${close}
      <div class="pn-t">✨ כרטיס השכר שלך יכול להיראות ככה</div><div class="pn-s">${Object.keys(SKINS).length} עיצובים, רקע בטבלת האלופים, ניתוח וייצוא בלי הגבלה. ${Plus.canTrial() ? `אפשר לנסות ${TRIAL_DAYS} ימים בחינם.` : 'תשלום אחד, בלי מנוי.'}</div>
      <div class="pn-a"><button class="btn sm" data-act="plus-design">${icon('palette', 's')} ${Plus.canTrial() ? 'לנסות על הכרטיס שלי' : 'לראות'}</button>${n.shown >= 2 ? '<button class="btn text sm" data-act="plus-nudge-off">לא להציג שוב</button>' : ''}</div></div>`;
  };
  App.actions['plus-nudge-x'] = async () => {
    // the end-of-trial card counts as an offer: the next one waits its three weeks
    if (S.meta.plusTrial && !S.meta.plusTrialEnd) await Store.setMeta({ plusTrialEnd: true, plusNudge: Object.assign({}, S.meta.plusNudge || {}, { at: Date.now(), x: Date.now() }) });
    else { const n = S.meta.plusNudge || {}; await Store.setMeta({ plusNudge: Object.assign({}, n, { x: n.at }) }); }
    App.rerender();
  };
  App.actions['plus-nudge-off'] = async () => { await Store.setMeta({ plusNudge: Object.assign({}, S.meta.plusNudge || {}, { off: true }) }); App.rerender(); };

  App.actions['plus-open'] = () => Plus.sheet();
  /* the admin's preview controls (admin dashboard) */
  App.actions['plus-sim'] = async (el) => {
    if (!App.isAdmin) return;
    const v = el.dataset.v;
    await Store.setMeta({ plusSim: v === 'free' ? 'free' : '', plusPreview: v === 'plus' });
    el.parentElement.querySelectorAll('[data-act="plus-sim"]').forEach((b) => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    App.applyTheme(); App.rerender();
    UI.toast(v === 'free' ? 'מצב משתמש חינמי: מכחול על כרטיס השכר, ניסיון חינם ומכסות לניתוח ולייצוא' : v === 'plus' ? 'מצב מנוי Plus: 12 עיצובים, רקע בטבלה ובלי הגבלות' : 'התצוגה המקדימה כבויה');
  };
  App.actions['plus-sim-offer'] = async () => {
    if (!App.isAdmin) return;
    // the offer is for someone without Plus: a running trial (in the preview) ends first
    if (Plus.inTrial()) await Store.setMeta({ plusTrial: Object.assign({}, S.meta.plusTrial, { until: Date.now() - 1000 }) });
    await Store.setMeta({ plusSim: 'free', plusPreview: false, plusTrialEnd: true, plusNudge: Object.assign({}, S.meta.plusNudge || {}, { at: Date.now(), x: 0, shown: Math.max(1, (S.meta.plusNudge || {}).shown || 0), off: false }) });
    UI.closeAll(); App.applyTheme(); App.go('home');
    UI.toast('ההצעה מופיעה עכשיו במסך הבית, מתחת לשורת העדכונים');
  };
  App.actions['plus-sim-reset'] = async () => {
    if (!App.isAdmin) return;
    await Store.setMeta({ plusTrial: null, plusTrialEnd: null, plusNudge: null, plusUse: null, plusWall: null });
    App.applyTheme(); App.rerender();
    UI.toast('אופס: אפשר לנסות שוב את הניסיון, המכסות וההצעה');
  };

  root.Plus = Plus;
})(typeof window !== 'undefined' ? window : globalThis);
