/* ============================================================
 * stats.js — anonymous usage statistics for the admin dashboard.
 *
 * Once a day, a signed-in device writes one small record to
 * stats/{random install id}: app version, platform, first/last day
 * of use, number of active days, shift and payslip counts, an age
 * group (under / over 18) and which features are on. No name, email,
 * user id, dates of shifts or amounts: the record cannot be linked
 * to a person, and only admins can read the collection
 * (firestore.rules). The user can turn it off in Settings; turning
 * it off deletes the record.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, App } = root;
  const S = Store.S;
  const Stats = {};
  root.Stats = Stats;

  const today = () => U.todayKey();
  function platform() {
    if (App.androidApp) return 'android';
    try { if (root.matchMedia('(display-mode: standalone)').matches) return 'pwa'; } catch (e) { /* ignore */ }
    return 'web';
  }
  /** Count active days on this device (local only). */
  Stats.markActive = async function () {
    const k = today();
    if (S.meta.lastActiveDay === k) return;
    await Store.setMeta({ lastActiveDay: k, activeDays: (S.meta.activeDays || 0) + 1, firstActiveDay: S.meta.firstActiveDay || k });
  };
  Stats.enabled = () => S.settings.shareStats !== false;

  function record() {
    const k = today();
    const from30 = U.addDays(k, -30);
    const done = S.shifts.filter((s) => s.status === 'done');
    const age = S.settings.birthDate ? root.Engine.ageAt(S.settings.birthDate, k) : null;
    return {
      v: String(root.APP_VERSION || '').slice(0, 20),
      p: platform(),
      first: S.meta.firstActiveDay || k,
      last: k,
      days: Math.min(99999, S.meta.activeDays || 1),
      sh: Math.min(999999, done.length),
      s30: Math.min(99999, done.filter((s) => U.epochKey(s.start) >= from30).length),
      ps: Math.min(99999, S.payslips.length),
      age: age == null ? '' : age < 18 ? 'u18' : '18p',
      f: (() => { const sim = !!(root.Plus && root.Plus.preview && root.Plus.preview()); return {
        rights: !!S.meta.usedRights, ai: !!(S.settings.ai && S.settings.ai.apiKey), lock: !!S.settings.lock.enabled,
        bio: !!S.settings.lock.bioId, dark: S.settings.theme === 'dark', fxOff: !!(S.settings.fx && S.settings.fx.effects === false),
        goal: +S.settings.goal.amount > 0, demo: !!S.settings.demo, planned: S.shifts.some((s) => s.status === 'planned'),
        roles: App.roles().length > 1, notif: ('Notification' in root) && Notification.permission === 'granted',
        // Shaati Plus, for the admin dashboard's sales numbers (yes/no only)
        plus: !!(S.meta.plus && S.meta.plus.active), plusWeb: !!(S.meta.plus && S.meta.plus.active && S.meta.plus.src === 'web'), plusSeen: !sim && !!S.meta.plusSeen,
        plusWall: !sim && !!S.meta.plusWall, plusTry: !sim && !!S.meta.plusTrial, // reached a free allowance / started the free trial (16 keys: the most the rules allow)
      }; })(), // an admin's Plus preview is never counted
      t: Date.now(),
    };
  }

  /** Send today's record (at most every 6 hours) when signed in and allowed. */
  Stats.report = async function (force) {
    try {
      const Cloud = root.Cloud;
      if (!Cloud || !Cloud.user) return;
      // turned off (maybe on another phone, the setting syncs): this phone's record goes too
      if (!Stats.enabled()) { if (S.meta.statsSentAt) await Stats.forget(); return; }
      if (App.legalAccepted && !App.legalAccepted()) return; // only after the privacy policy that describes it was accepted
      if (!force && S.meta.statsSentAt && Date.now() - S.meta.statsSentAt < 6 * 3600000) return;
      if (!S.meta.installId) await Store.setMeta({ installId: (root.crypto && crypto.randomUUID ? crypto.randomUUID() : U.uid() + U.uid()).replace(/-/g, '') });
      const { fs, db } = await Cloud.sdk();
      await fs.setDoc(fs.doc(db, 'stats', S.meta.installId), record());
      await Store.setMeta({ statsSentAt: Date.now() });
    } catch (e) { /* statistics never get in the way */ }
  };
  /** Turning statistics off removes this device's record. */
  Stats.forget = async function () {
    try {
      const Cloud = root.Cloud;
      if (!Cloud || !Cloud.user || !S.meta.installId) return;
      const { fs, db } = await Cloud.sdk();
      await fs.deleteDoc(fs.doc(db, 'stats', S.meta.installId));
      await Store.setMeta({ statsSentAt: null });
    } catch (e) { /* ignore */ }
  };
  /** Is the signed-in user an admin? (the rules let a user read only their own admin entry) */
  Stats.checkAdmin = async function () {
    const before = !!App.isAdmin;
    try {
      const Cloud = root.Cloud;
      if (!Cloud || !Cloud.user) { App.isAdmin = false; }
      else {
        const { fs, db } = await Cloud.sdk();
        const snap = await fs.getDoc(fs.doc(db, 'admins', Cloud.user.uid));
        App.isAdmin = snap.exists();
      }
    } catch (e) { App.isAdmin = before && navigator.onLine === false; } // offline: keep what this phone knew
    // remembered on this phone, so the next start draws the admin's look (a previewed Plus design on the pay
    // card) from the first frame instead of switching to it a moment later; the server's rules decide what an
    // admin may really do
    const uid = App.isAdmin && root.Cloud && root.Cloud.user ? root.Cloud.user.uid : '';
    if ((S.meta.adminUid || '') !== uid) await Store.setMeta({ adminUid: uid }).catch(() => {});
    if (App.isAdmin !== before) { if (App.applyTheme) App.applyTheme(); if (App.rerender && !App.blocking) App.rerender(); }
    if (App.isAdmin && root.Support) root.Support.adminInbox().then(() => { if (App.tab === 'settings' && !App.blocking) App.rerender(); }).catch(() => {});
    if (App.isAdmin && App.tab === 'settings' && !App.blocking) App.rerender();
    return App.isAdmin;
  };
  record.platform = platform;
  Stats._record = record;
})(typeof window !== 'undefined' ? window : globalThis);
