/* ============================================================
 * nfc.js — the pure parts of the NFC sticker at work (tested in tests/nfc.test.js).
 *   - the address a sticker holds: the app's own address with ?action=nfc and the sticker's id, so Android opens
 *     the installed app (its link filter takes /shifts/) and the app knows which sticker it was;
 *   - what a touch does: no shift running starts one, a running one ends; a sticker this account wrote does it at
 *     once, any other link with ?action=nfc (another site could make one) asks first, as ?action=start does;
 *   - a second open within a few seconds is the same touch read twice, or a reload, and does nothing;
 *   - which message a failed write shows (Web NFC's error names).
 * The glue (the sheet in Settings, writing, the open from a touch) is app/nfc.js.
 * ============================================================ */
(function (root) {
  'use strict';
  const ACTION = 'nfc';
  const BASE = 'https://leelor123.github.io/shifts/';
  /** Two opens closer than this are one touch (Android can read a sticker twice; a reload must not toggle again). */
  const SAME_TOUCH = 10000;
  /** The most stickers kept per account (an old one is dropped when a new one is written past this). */
  const MAX_TAGS = 12;
  const ID_RE = /^[a-z0-9]{6,24}$/;

  /** A new sticker id: short, lower case letters and digits (it rides in the address). */
  function newId(rand) {
    const r = rand || Math.random;
    let s = '';
    while (s.length < 10) s += Math.floor(r() * 36).toString(36);
    return s.slice(0, 10);
  }
  const validId = (id) => typeof id === 'string' && ID_RE.test(id);

  /** The address written on a sticker. */
  function tagUrl(id, base) {
    return (base || BASE) + '?action=' + ACTION + '&tag=' + encodeURIComponent(id);
  }

  /** The sticker id in an opening address (location.search), '' for an address without one, or null when the
   *  address is not a sticker's at all. */
  function readOpen(search) {
    let p;
    try { p = new URLSearchParams(search || ''); } catch (e) { return null; }
    if (p.get('action') !== ACTION) return null;
    const id = p.get('tag');
    return validId(id) ? id : '';
  }

  /** What a touch does now. o: { active (a shift runs), tags (the account's stickers), tag (this one's id),
   *  last (the time of the last handled touch on this phone), now }.
   *  Returns { kind: 'same' } for a repeat, or { kind: 'start' | 'stop', ask, roleId }. */
  function decide(o) {
    const now = +o.now || Date.now();
    const last = +o.last || 0;
    if (last && now - last >= 0 && now - last < SAME_TOUCH) return { kind: 'same' };
    const list = Array.isArray(o.tags) ? o.tags : [];
    const known = validId(o.tag) ? list.find((t) => t && t.id === o.tag) : null;
    return { kind: o.active ? 'stop' : 'start', ask: !known, roleId: (known && known.roleId) || null };
  }

  /** The account's stickers with a new one added (the newest last, at most MAX_TAGS). */
  function addTag(tags, tag) {
    const list = (Array.isArray(tags) ? tags : []).filter((t) => t && validId(t.id) && t.id !== tag.id);
    list.push(tag);
    return list.slice(-MAX_TAGS);
  }

  /** Which message a failed write shows, from the error Web NFC gave:
   *  'cancel' (the sheet was closed), 'denied' (no permission), 'off' (NFC is off in the phone's settings),
   *  'none' (no NFC on this phone), 'failed' (the sticker moved away, is locked or too small). */
  function errorKind(e) {
    const n = e && e.name;
    if (n === 'AbortError') return 'cancel';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'denied';
    if (n === 'NotReadableError') return 'off';
    if (n === 'NotSupportedError') return 'none';
    return 'failed';
  }

  root.Nfc = { ACTION, BASE, SAME_TOUCH, MAX_TAGS, newId, validId, tagUrl, readOpen, decide, addTag, errorKind };
  if (typeof module !== 'undefined') module.exports = root.Nfc;
})(typeof window !== 'undefined' ? window : globalThis);
