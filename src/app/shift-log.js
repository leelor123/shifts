/* ============================================================
 * shift-log.js — the signed shift log on the phone (the chain itself: core/ledger.js).
 *
 * Writes one record for each start and stop on the timer (App.startShift, App.stopShift) and for each change to a
 * worked shift that passes Store.apply (added, edited, deleted, undone), with the phone's clock. Records go into the
 * 'ledger' store, which syncs like the others but only grows (Store.APPEND_ONLY, firestore.rules). Each phone keeps
 * its own chain (S.meta.ledgerChain); a restored backup or a cleared phone starts a new one, so two copies of one
 * chain never fork.
 *
 * Shown in the shift sheet (one line: real time, or when it was added or edited) and as the appendix of the hours
 * report and the claim report, with the chain's last hash.
 * ============================================================ */
(function (root) {
  'use strict';
  const { Store, U, UI } = root;
  const S = Store.S;
  const L = root.Ledger;
  const { esc } = UI;

  const ShiftLog = {};
  root.ShiftLog = ShiftLog;
  let queue = Promise.resolve(); // records are hashed one after the other: each needs the hash before it
  let verified = null;

  function newChain() {
    const b = new Uint8Array(9);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(b); else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    return 'c' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  /** Adds a record (fields as Ledger.append takes them); the phone's time is taken now, when it happened. */
  function record(fields) {
    const at = fields.at || Date.now();
    queue = queue.then(async () => {
      if (!L || !(root.crypto && root.crypto.subtle)) return; // an old browser without hashing: the app works on without the log
      if (!S.meta.ledgerChain) await Store.setMeta({ ledgerChain: newChain() });
      const ev = await L.append(S.ledger, S.meta.ledgerChain, Object.assign({}, fields, { at }));
      verified = null;
      await Store.apply([{ store: 'ledger', put: ev }], null);
    }).catch((e) => console.warn('shift log', e));
    return queue;
  }
  ShiftLog.record = record;
  ShiftLog.done = () => queue;
  /** The timer started (start: the moment it counts from; via 'widget' for a tap on the home screen widget). */
  ShiftLog.started = (start, via) => record({ k: 'start', t: start, v: via === 'widget' ? 'widget' : 'timer' });
  /** From Store.apply: [before, after] of each shift in one change; via = 'timer' | 'widget' when the timer saved it. */
  ShiftLog.onShifts = function (changes, via) {
    const now = Date.now();
    for (const [was, nu] of changes) {
      if ((was && was.demo) || (nu && nu.demo)) continue; // the sample shifts of the first tour are not the worker's
      const f = L && L.changeFields(was, nu, via === 'timer' || via === 'widget' ? via : null, now);
      if (f) record(f);
    }
  };
  /** The whole log checked (cached until it changes). */
  ShiftLog.verify = () => verified || (verified = queue.then(() => L.verify(S.ledger)));
  ShiftLog.status = (sh) => (L ? L.status(sh, S.ledger) : null);
  Store.on((ev) => {
    if (ev.type === 'restore') {
      verified = null;
      // the restored records may end before this phone's last one: a new chain, so the old one never forks
      if (S.meta.ledgerChain) Store.setMeta({ ledgerChain: '' }).catch(() => {});
    } else if (ev.type === 'data' && (ev.stores || []).includes('ledger')) verified = null;
  });

  const when = (at) => `${U.fmtDate(U.epochKey(at))}, ${U.epochHM(at)}`;
  const span = (a, b) => `\u2066${U.epochHM(a)}\u2060–\u2060${U.epochHM(b)}\u2069`;

  /** The shift sheet's line: recorded in real time, added by hand, or edited (empty for a shift from before the log). */
  ShiftLog.lineHtml = function (sh) {
    const st = ShiftLog.status(sh);
    if (!st) return '';
    const t = st.mode === 'live' ? 'נרשם בזמן אמת ✓' : st.mode === 'hand' ? `נרשם ידנית ב-${when(st.at)}` : `נערך ב-${when(st.at)}`;
    return `<div class="tiny muted sl-line" style="margin:-4px 0 10px">${UI.icon ? UI.icon('shield', 's') : ''} ${t}</div>`;
  };

  /**
   * The appendix "יומן המשמרות" for a report: every worked shift of the list (engine results), how it was recorded
   * and when, the shifts deleted in the period, and whether the chain is whole with its last hash.
   */
  ShiftLog.appendixHtml = async function (results, from, to) {
    let v = null;
    try { v = await ShiftLog.verify(); } catch (e) { console.warn('shift log', e); }
    const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    const rows = [];
    for (const r of results) {
      const sh = root.App.shift(r.id) || { id: r.id, start: r.start, end: r.rawEnd || r.end };
      const st = ShiftLog.status(sh);
      const day = `${U.fmtDate(r.dateKey, 'short')} ${U.DAYS_SHORT[U.dow(r.dateKey)]}`;
      if (!st) rows.push(row([day, span(sh.start, sh.end), 'נרשם לפני שהיומן נוסף', '']));
      else if (st.mode === 'live') rows.push(row([day, span(sh.start, sh.end), '<b>נרשם בזמן אמת</b>', `התחלה ${when(st.startAt)} · סיום ${when(st.at)}`]));
      else if (st.mode === 'hand') rows.push(row([day, span(sh.start, sh.end), 'נרשם ידנית', when(st.at)]));
      else rows.push(row([day, span(sh.start, sh.end), 'נערך', when(st.at) + (st.os != null && st.oe != null ? ` · לפני כן ${span(st.os, st.oe)}` : '')]));
    }
    // deleted in the period, and not back since
    const gone = new Map();
    for (const x of S.ledger) if (x.k === 'delete' && x.os != null && !root.App.shift(x.shiftId)) { const k = U.epochKey(x.os); if (k >= from && k <= to && (!gone.has(x.shiftId) || gone.get(x.shiftId).at < x.at)) gone.set(x.shiftId, x); }
    for (const x of [...gone.values()].sort((a, b) => a.os - b.os)) rows.push(row([`${U.fmtDate(U.epochKey(x.os), 'short')} ${U.DAYS_SHORT[U.dow(U.epochKey(x.os))]}`, span(x.os, x.oe), 'נמחקה', when(x.at)]));
    if (!rows.length) return '';
    let chain = 'אין עדיין רישומים ביומן.';
    if (v && v.count && v.ok) chain = `השרשרת שלמה: ${v.count} רישומים${v.chains.length > 1 ? ` מ-${v.chains.length} מכשירים` : ''}. הטביעה האחרונה (SHA-256): <span dir="ltr" style="font-family:monospace;word-break:break-all">${esc(v.head)}</span>`;
    else if (v && v.count) chain = `<b>השרשרת לא שלמה</b> (ברישום ${esc(String((v.chains.find((x) => !x.ok) || {}).badAt || ''))}): רישום ביומן השתנה או חסר מאז שנכתב.`;
    return `<h3>יומן המשמרות</h3>
      <div style="font-size:9pt">הטלפון כותב ביומן רישום בכל לחיצה על התחלה וסיום, ובכל הוספה, עריכה או מחיקה של משמרת, לפי השעון שלו. היומן עוזר להראות מה נרשם ומתי. הוא לא מוכיח לבד שהשעות נכונות.</div>
      <table><tr><th>תאריך</th><th>שעות</th><th>איך נרשם</th><th>מתי</th></tr>${rows.join('')}</table>
      <div style="font-size:9pt;margin-top:6pt">${chain}</div>
      <div style="font-size:8pt;color:#555">כל רישום חתום בטביעה שמחושבת גם מהטביעה של הרישום שלפניו, כך ששינוי או מחיקה של רישום אחד שוברים את השרשרת מאותו מקום.</div>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
