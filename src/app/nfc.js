/* ============================================================
 * nfc.js — the NFC sticker at work. The user writes a sticker once, from Settings › My work (Web NFC, Chrome on
 * Android and the Android app); a touch of the phone on it then opens the app at the sticker's address
 * (?action=nfc&tag=…, core/nfc.js), which starts a shift, or ends the running one, the way the home screen's
 * buttons do. The stickers this account wrote (id and role) are kept in the settings, so they work on each of
 * the account's phones; an address with an id the account does not know asks first, as ?action=start does.
 * Nothing leaves the phone for this: the sticker holds the app's address and the id only.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, Store, UI, U, Nfc } = root;
  const S = Store.S;
  const { icon, esc } = UI;

  // the last handled touch on this phone, outside the app's database: a reload or a second read of the same touch
  // a moment later does nothing (core/nfc.js, SAME_TOUCH)
  const LAST = 'shaati.nfcLast';
  const lastAt = () => { try { return +localStorage.getItem(LAST) || 0; } catch (e) { return 0; } };
  const setLast = (t) => { try { localStorage.setItem(LAST, String(t)); } catch (e) { /* ignore */ } };
  const tags = () => (Array.isArray(S.settings.nfcTags) ? S.settings.nfcTags : []);
  App.nfcTags = tags;
  App.nfcSupported = () => typeof root.NDEFReader === 'function';

  /** The app was opened from a sticker (app.js, after the code lock). tag: its id ('' when the address had none). */
  App.nfcOpen = async function (tag) {
    const d = Nfc.decide({ active: !!S.activeShift, tags: tags(), tag, last: lastAt(), now: Date.now() });
    if (d.kind === 'same') return;
    setLast(Date.now());
    if (d.kind === 'start') {
      if (d.ask && !(await UI.confirm('התחל משמרת', '', 'התחלה'))) return;
      if (S.activeShift) return;
      // the sticker's own role, while it is still in use; otherwise the home screen's start button decides
      if (d.roleId && App.roles().some((r) => r.id === d.roleId)) await App.startShift(d.roleId);
      else App.actions['timer-start']();
      return;
    }
    if (d.ask && !(await UI.confirm('סיום משמרת', '', 'סיום'))) return;
    if (S.activeShift) App.stopShift();
  };

  /* ---------------- writing a sticker ---------------- */
  const FAIL = {
    denied: ['אין הרשאה ל-\u2060NFC', 'צריך לאשר לשעתי להשתמש ב-\u2060NFC. מאשרים בחלון שקופץ, או בהגדרות האתר ב-\u2060Chrome, ומנסים שוב.'],
    off: ['ה-\u2060NFC כבוי בטלפון', 'מדליקים NFC בהגדרות הטלפון ומנסים שוב.'],
    none: ['בטלפון הזה אין NFC', 'אפשר לכתוב מדבקה מטלפון אחר עם NFC, מאותו חשבון.'],
    failed: ['המדבקה לא נכתבה', 'מצמידים שוב ולא מזיזים עד הרטט. מדבקה נעולה אי אפשר לכתוב.'],
  };
  function face(state, kind) {
    if (state === 'ok') {
      return `<div class="nfc-art ok">${icon('check')}</div><h3 class="nfc-t">המדבקה מוכנה</h3>
        <p class="nfc-s">מעכשיו נוגעים בה עם הטלפון, והמשמרת מתחילה. נגיעה נוספת מסיימת אותה.</p>`;
    }
    if (state === 'fail') {
      const [t, s] = FAIL[kind] || FAIL.failed;
      return `<div class="nfc-art bad">${icon('alert')}</div><h3 class="nfc-t">${esc(t)}</h3><p class="nfc-s">${esc(s)}</p>`;
    }
    return `<div class="nfc-art wait"><span class="nfc-ring" aria-hidden="true"></span>${icon('nfc')}</div>
      <h3 class="nfc-t">הצמידו את המדבקה לגב הטלפון</h3>
      <p class="nfc-s">בדרך כלל ליד המצלמה. משאירים אותה צמודה עד שהטלפון רוטט.</p>`;
  }
  function writeSheet(roleId) {
    let ctl = null, closed = false;
    const id = Nfc.newId();
    const role = App.role(roleId);
    UI.openSheet({
      title: 'כתיבת מדבקה',
      cls: 'nfc-sheet',
      body: `<div class="nfc-w" role="status" aria-live="polite">${face('wait')}</div>${role && App.roles().length > 1 ? `<div class="nfc-role">${UI.roleDot(role)}<span>${esc(role.name)}</span></div>` : ''}`,
      // one button at a time, so the sheet keeps its height from state to state (no jump)
      foot: '<button class="btn tonal block" data-nfc-cancel>ביטול</button><button class="btn block" data-nfc-again hidden>ניסיון נוסף</button><button class="btn block" data-nfc-done hidden>סיום</button>',
      onClose: () => { closed = true; if (ctl) ctl.abort(); },
      onMount: (sh) => {
        const box = sh.querySelector('.nfc-w');
        const again = sh.querySelector('[data-nfc-again]');
        const done = sh.querySelector('[data-nfc-done]');
        const cancel = sh.querySelector('[data-nfc-cancel]');
        const show = (state, kind) => {
          box.dataset.state = state;
          box.innerHTML = face(state, kind);
          cancel.hidden = state !== 'wait';
          again.hidden = state !== 'fail';
          done.hidden = state !== 'ok';
        };
        const write = async () => {
          show('wait');
          ctl = new AbortController();
          try {
            const w = new root.NDEFReader();
            await w.write({ records: [{ recordType: 'url', data: Nfc.tagUrl(id) }] }, { signal: ctl.signal, overwrite: true });
            if (closed) return;
            await Store.setSettings((s) => { s.nfcTags = Nfc.addTag(s.nfcTags, { id, roleId: roleId || null, at: Date.now() }); });
            if (root.Fx) { root.Fx.play('success'); root.Fx.haptic([10, 40, 20]); }
            show('ok');
          } catch (e) {
            const kind = Nfc.errorKind(e);
            if (closed || kind === 'cancel') return;
            console.warn('nfc write', e);
            show('fail', kind);
          }
        };
        again.onclick = write; // a tap: Web NFC asks for one before it writes
        done.onclick = () => UI.closeTop();
        cancel.onclick = () => UI.closeTop();
        write();
      },
    });
  }
  App.actions['nfc-write'] = () => {
    if (!App.nfcSupported()) {
      UI.dialog({ title: 'כאן אי אפשר לכתוב מדבקה', text: 'כתיבת מדבקה עובדת באפליקציית שעתי לאנדרואיד, או ב-\u2060Chrome בטלפון אנדרואיד. באייפון ובמחשב אין אפשרות כזו.', buttons: [{ label: 'הבנתי', value: true }] });
      return;
    }
    const roles = App.roles();
    if (roles.length > 1) App.sheetsApi.pickRole('לאיזה תפקיד המדבקה?', (rid) => writeSheet(rid));
    else writeSheet(roles[0] && roles[0].id);
  };

  /* ---------------- the section in Settings ---------------- */
  App.nfcSection = function () {
    const list = tags();
    const ok = App.nfcSupported();
    const row = (t) => {
      const r = App.role(t.roleId);
      return `<div class="item nfc-item"><span class="lead">${icon('nfc')}</span><span class="body"><span class="t">${esc(r ? r.name : 'מדבקה')}</span><span class="s">נכתבה ב-${esc(U.fmtDate(U.dateKey(new Date(+t.at || Date.now())), 'short'))}</span></span>
        <button class="icon-btn" data-nfc-del="${esc(t.id)}" aria-label="הסרת המדבקה">${icon('trash', 's')}</button></div>`;
    };
    return `<div class="card nfc-card">
        <div class="nfc-intro">${UI.tile('nfc', 'sky')}<p>מדביקים מדבקת NFC בעבודה. נגיעה של הטלפון בה מתחילה משמרת, ונגיעה נוספת מסיימת אותה.</p></div>
        <button class="btn go block" data-act="nfc-write">${icon('nfc', 's')} כתיבת מדבקה</button>
        ${ok ? '' : '<div class="tiny muted nfc-note">כתיבה עובדת באפליקציית שעתי לאנדרואיד, או ב-\u2060Chrome בטלפון אנדרואיד.</div>'}
      </div>
      ${list.length ? `<div class="section-title">המדבקות שלך</div><div class="list">${list.slice().reverse().map(row).join('')}</div>` : ''}
      <div class="tiny muted nfc-note">מדבקה ריקה עולה כמה שקלים. היא שומרת רק קישור לשעתי, ושום מידע לא נשלח ממנה.</div>`;
  };
  App.nfcMount = function (el, draw) {
    el.querySelectorAll('[data-nfc-del]').forEach((b) => (b.onclick = async () => {
      if (!(await UI.confirm('להסיר את המדבקה?', 'נגיעה בה תשאל קודם, לפני שהיא מתחילה או מסיימת משמרת.', 'הסרה', true))) return;
      const tid = b.dataset.nfcDel;
      await Store.setSettings((s) => { s.nfcTags = (Array.isArray(s.nfcTags) ? s.nfcTags : []).filter((t) => t && t.id !== tid); });
      draw();
    }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
