/* ============================================================
 * invite.js — "invite a friend, and both of you get a month of Shaati Plus".
 *
 * My link carries my invitation code (?ref=CODE, refc/{code} → my uid; the uid itself
 * is never in a link). Someone new who opens it keeps the code on the phone; once they
 * have signed in, finished the setup and recorded a shift, their app writes ref/{uid}
 * (once per account: firestore.rules never lets it change or go). Both apps then work
 * out the gift from these documents (core/referral.js): a month each, one after the
 * other, at most six from inviting. The gift is kept on the phone (meta.plusGift) and
 * asked again at most every six hours. Plus treats it like the trial: plus.js.
 * ============================================================ */
(function (root) {
  'use strict';
  const { Store, UI, App } = root;
  const S = Store.S;
  const R = root.Referral;
  const APP_URL = 'https://leelor123.github.io/shifts/';
  const Cloud = () => root.Cloud;
  const signedIn = () => !!(Cloud() && Cloud().user);
  const uid = () => Cloud().user.uid;
  const rand = (k) => { const a = new Uint8Array(k); crypto.getRandomValues(a); return a; };
  const Invite = { MAX: R.MAX };
  root.Invite = Invite;

  /* a code that came with the address: kept until it is used (signing in may take a reload), off the address at once */
  const KEY = 'shaati.ref';
  try {
    const c = R.codeFrom(location.search);
    if (c) {
      // the first link counts (opening another one later does not move the day it came)
      if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify({ c, at: Date.now() }));
      const u = new URL(location.href); u.searchParams.delete('ref');
      history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
    }
  } catch (e) { /* no storage: the link is not kept */ }
  const pending = () => { try { const p = JSON.parse(localStorage.getItem(KEY) || 'null'); return p && typeof p.c === 'string' && +p.at > 0 ? p : null; } catch (e) { return null; } };
  const drop = () => { try { localStorage.removeItem(KEY); } catch (e) { /* none */ } };

  /** The gift as last known: { until (0: none), months, friends, at }. */
  Invite.gift = () => S.meta.plusGift || { until: 0, months: 0, friends: 0, at: 0 };
  Invite.until = () => +(Invite.gift().until || 0);

  /** My invitation code (made once, kept in the settings so every phone of the account shares it). */
  async function myCode() {
    if (/^[a-z0-9]{10,20}$/.test(S.settings.refCode || '')) return S.settings.refCode;
    const c = R.code(rand);
    const { fs, db } = await Cloud().sdk();
    await fs.setDoc(fs.doc(db, 'refc', c), { by: uid() });
    await Store.setSettings((s) => { s.refCode = c; });
    return c;
  }
  Invite.link = async () => APP_URL + '?ref=' + (await myCode());

  /** Sends my link (the phone's share sheet, or copied). */
  Invite.share = async function () {
    if (!signedIn()) { UI.toast('צריך להתחבר עם חשבון Google'); return; }
    let url;
    try { url = await Invite.link(); } catch (e) { UI.toast(Cloud().errorText(e, 'לא הצלחנו ליצור קישור')); return; }
    const text = 'שעתי מחשבת לי את השכר לפי החוק: שבתות, שעות נוספות והכול. מצטרפים עם הקישור שלי ומקבלים חודש Shaati Plus במתנה 🎁';
    await UI.shareText(text, { title: 'Shaati', url, okText: 'הקישור הועתק. אפשר להדביק בוואטסאפ 💚' });
  };

  /** Asks who invited me and whom I invited, and works out the gift (at most every six hours, unless forced). */
  let asking = null;
  Invite.refresh = function (force) {
    if (!signedIn() || S.settings.demo) return Promise.resolve();
    const g = Invite.gift();
    if (!force && g.at && Date.now() - g.at < 6 * 3600000) return Promise.resolve();
    if (asking) return asking;
    asking = (async () => {
      try {
        const { fs, db } = await Cloud().sdk();
        const mine = await fs.getDoc(fs.doc(db, 'ref', uid()));
        const theirs = await fs.getDocs(fs.query(fs.collection(db, 'ref'), fs.where('by', '==', uid()), fs.limit(50)));
        const next = R.gift(mine.exists() ? +mine.data().t : null, theirs.docs.map((d) => +d.data().t));
        const before = g.at ? +g.friends || 0 : next.friends; // the first answer on a phone is not news
        await Store.setMeta({ plusGift: Object.assign(next, { at: Date.now() }) });
        if (next.friends > before) {
          if (root.Fx) root.Fx.celebrate('big');
          UI.toast(next.friends - before === 1 ? 'חבר/ה הצטרף/ה בזכותך: עוד חודש Plus במתנה 🎁' : `${next.friends - before} חברים הצטרפו בזכותך: עוד חודשי Plus במתנה 🎁`);
        }
        if (root.Plus && root.Plus.giftChanged) root.Plus.giftChanged();
      } catch (e) { /* offline: asked again next time */ } finally { asking = null; }
    })();
    return asking;
  };

  /**
   * Takes the gift of the link I came with: once I'm signed in, set up and recorded a shift after it. Someone
   * who had shifts before the link (not new), or a link older than a month, does not; a code of mine, or an
   * account invited already (the rules refuse a second one), lets it go.
   */
  let claiming = false;
  Invite.claim = async function () {
    const p = pending();
    if (!p || claiming || !signedIn() || !S.settings.onboarded || S.settings.demo) return false;
    const had = S.shifts.some((s) => (+s.createdAt || 0) < p.at);
    if (!R.canClaim({ hadShifts: had, linkAt: p.at, now: Date.now() })) { drop(); return false; }
    if (!S.shifts.some((s) => (+s.createdAt || 0) >= p.at)) return false; // after the first shift
    claiming = true;
    try {
      const { fs, db } = await Cloud().sdk();
      const rc = await fs.getDoc(fs.doc(db, 'refc', p.c));
      const by = rc.exists() ? rc.data().by : null;
      if (!by || by === uid()) { drop(); return false; }
      await fs.setDoc(fs.doc(db, 'ref', uid()), { by, c: p.c, t: Date.now() });
      drop();
      await Invite.refresh(true);
      if (root.Fx) root.Fx.celebrate('big');
      UI.toast('קיבלת חודש Shaati Plus במתנה 🎁');
      // the gift is the designs: straight to choosing one for the card
      if (root.Plus && root.Plus.design && !App.blocking && !document.querySelector('.sheet, .dialog')) setTimeout(() => root.Plus.design(), 900);
      return true;
    } catch (e) {
      if (e && /permission/i.test(e.code || e.message || '')) drop(); // invited once already, or the code is gone
      return false;
    } finally { claiming = false; }
  };

  /** At start, and after the numbers changed (a shift was saved): the link's gift, then the gift as it stands. */
  Invite.boot = () => { setTimeout(() => { Invite.claim().then((took) => { if (!took) Invite.refresh(); }); }, 4000); };
  let later = 0;
  Invite.changed = () => {
    if (!pending()) return;
    clearTimeout(later);
    later = setTimeout(() => Invite.claim(), 3000);
  };
  /** Deleting the account: my code goes (who invited whom stays: an account is invited once), and the gift. */
  /*  Strict (deleting the account): a code that could not be deleted throws, so the sign-in account stays to delete it
   *  with. The rule reads the code's owner, so a code already gone is refused: it is looked up first, and gone is done. */
  Invite.forget = async (opts) => {
    const c = S.settings.refCode;
    if (c && signedIn()) {
      try {
        const { fs, db } = await Cloud().sdk();
        const ref = fs.doc(db, 'refc', c);
        const snap = await fs.getDoc(ref);
        if (snap.exists()) await fs.deleteDoc(ref);
      } catch (e) { if (opts && opts.strict) throw e; }
    }
    await Store.setMeta({ plusGift: null });
  };
})(typeof window !== 'undefined' ? window : globalThis);
