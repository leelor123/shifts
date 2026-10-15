/* ============================================================
 * plus.js — "Shaati Plus": an optional one-time purchase through Google
 * Play (Digital Goods API + Payment Request, inside the Android app).
 *
 * Everything the app does stays free. Plus adds skins for the pay card on
 * home and says thank you; no ads, no reminders that interrupt. Nothing about
 * Plus shows until the product exists in Google Play (or for an admin who
 * previews it), so without it the app looks exactly the same.
 *
 * Ownership is read from Google Play when the app starts and after a
 * purchase, not only remembered on this phone: a refund or a new phone with
 * the same Google account is handled the same way. When Google Play cannot
 * be reached (offline) what was known is kept.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const BILLING = 'https://play.google.com/billing';
  const SKU = 'shaati_plus'; // the in-app product's id in Google Play Console (one-time, not a subscription)
  // Pay-card skins (styles-v3.css .sk-<id>): dark enough everywhere for the card's white text
  const SKINS = {
    gold: 'זהב', midnight: 'חצות', sunset: 'שקיעה', ocean: 'אוקיינוס', forest: 'יער', carbon: 'קרבון',
  };
  const Plus = { SKU, SKINS, available: false, price: '' };
  const owned = () => !!(S.meta.plus && S.meta.plus.active);
  Plus.owned = owned;
  /** Plus features are on: bought, or an admin previewing them on this phone. */
  Plus.active = () => owned() || (!!App.isAdmin && !!S.meta.plusPreview);
  /** Anything about Plus is shown only when it can be bought here, or is already on. */
  Plus.visible = () => Plus.available || Plus.active();
  /** The pay-card skin in use ('' = the regular card). */
  Plus.skin = () => (Plus.active() && SKINS[S.settings.skin] ? S.settings.skin : '');

  async function service() {
    if (typeof root.getDigitalGoodsService !== 'function') return null; // not inside the Android app from Google Play
    try { return await root.getDigitalGoodsService(BILLING); } catch (e) { return null; }
  }
  function fmtPrice(p) {
    if (!p) return '';
    try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: p.currency, maximumFractionDigits: 2 }).format(+p.value); } catch (e) { return `${p.value} ${p.currency}`; }
  }
  async function setOwned(on) {
    if (on === owned()) return;
    await Store.setMeta({ plus: { active: on, at: Date.now() } });
    App.applyTheme();
    App.rerender();
  }
  /** Asks Google Play whether this account owns Plus. Throws when Google Play cannot be reached. */
  async function check(svc) {
    const list = await svc.listPurchases();
    const has = (list || []).some((p) => p && p.itemId === SKU);
    await setOwned(has);
    return has;
  }

  /** At start: is Plus for sale here (the product exists in Google Play), and is it owned? */
  Plus.init = async function () {
    const svc = await service();
    if (!svc) return;
    let d;
    try { d = ((await svc.getDetails([SKU])) || [])[0]; } catch (e) { return; }
    if (!d) return; // not set up in Google Play yet: Plus stays out of sight
    Plus.available = true;
    Plus.price = fmtPrice(d.price);
    try { await check(svc); } catch (e) { /* offline: keep what was known */ }
    if (App.tab === 'settings') App.rerender();
  };

  /** The purchase, through Google Play's own sheet. Resolves true when Plus is on. */
  Plus.buy = async function () {
    const svc = await service();
    if (!svc || !Plus.available) { UI.toast('הרכישה זמינה באפליקציה שמותקנת מ-Google Play'); return false; }
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
    let has;
    try { has = await check(svc); } catch (e) { has = true; await setOwned(true); } // confirmed again at the next start
    if (!has) { UI.toast('התשלום עדיין בטיפול אצל Google. Plus יופעל כשהוא יושלם'); return false; }
    if (root.Fx) root.Fx.celebrate('big');
    return true;
  };

  /** "I already bought it": asks Google Play again (a new phone, a reinstall). */
  Plus.restore = async function () {
    const svc = await service();
    if (!svc) { UI.toast('אפשר לשחזר רכישה באפליקציה שמותקנת מ-Google Play'); return; }
    try { UI.toast((await check(svc)) ? 'Shaati Plus שוחזר ✓' : 'לא נמצאה רכישה בחשבון Google הזה'); } catch (e) { UI.toast('אין חיבור ל-Google Play כרגע. נסו שוב בעוד רגע'); }
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
    const draw = (el) => {
      const on = Plus.active();
      el.querySelector('[data-plus-body]').innerHTML = `
        ${App.mascotSays ? App.mascotSays(on ? 'party' : 'happy', on ? 'תודה שאת/ה איתנו! 💜' : 'רוצים לפרגן לשעתי ולקבל עיצובים מיוחדים?', { size: 64 }) : ''}
        ${Plus.skinTiles(Plus.skin(), !on)}
        <div class="card plus-list">
          <div>${icon('palette', 's')}<span><b>6 עיצובים לכרטיס השכר</b><small>זהב, חצות, שקיעה ועוד, בכרטיס שבמסך הבית</small></span></div>
          <div>${icon('star', 's')}<span><b>תודה ענקית ממני</b><small>עוזר להמשיך לפתח, ולהשאיר את האפליקציה בלי פרסומות</small></span></div>
          <div>${icon('check', 's')}<span><b>כל השאר נשאר חינם</b><small>משמרות, חישוב שכר, זכויות, בדיקת תלוש, דוחות ומשחקים</small></span></div>
        </div>
        ${on ? `<div class="plus-done">${icon('check')} ${owned() ? 'Shaati Plus פעיל אצלך' : 'תצוגה מקדימה של מנהל'}</div>`
          : `<button class="btn big block plus-buy" data-plus-buy ${Plus.available ? '' : 'disabled'}>${icon('sparkle')} קנייה חד-פעמית${Plus.price ? ' · ' + esc(Plus.price) : ''}</button>
             <div class="tiny muted plus-note">תשלום אחד דרך Google Play, בלי מנוי ובלי חיובים נוספים. מתחת לגיל 18: בהסכמת הורה.</div>`}
        <div class="plus-links">${on && owned() ? '' : '<button class="btn text sm" data-plus-restore>כבר קניתי: שחזור רכישה</button>'}
          ${App.isAdmin ? `<label class="tiny plus-preview"><input type="checkbox" data-plus-preview ${S.meta.plusPreview ? 'checked' : ''}> תצוגה מקדימה (מנהל)</label>` : ''}</div>`;
    };
    UI.openSheet({
      title: 'Shaati Plus ✨',
      cls: 'plus-sheet',
      body: '<div data-plus-body></div>',
      onMount: (el) => {
        draw(el);
        let busy = false;
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b || busy) return;
          if (b.hasAttribute('data-plus-buy')) { busy = true; try { if (await Plus.buy()) draw(el); } finally { busy = false; } }
          else if (b.hasAttribute('data-plus-restore')) { busy = true; try { await Plus.restore(); draw(el); } finally { busy = false; } }
          else if (b.dataset.skin !== undefined) { if (b.dataset.skin && !Plus.active()) return; if (await Plus.pickSkin(b.dataset.skin)) draw(el); }
        });
        el.addEventListener('change', async (e) => {
          if (!e.target.matches('[data-plus-preview]')) return;
          await Store.setMeta({ plusPreview: e.target.checked });
          App.applyTheme(); App.rerender(); draw(el);
        });
      },
    });
  };
  App.actions['plus-open'] = () => Plus.sheet();

  root.Plus = Plus;
})(typeof window !== 'undefined' ? window : globalThis);
