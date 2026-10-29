/*
 * dom.js — a part of the screen drawn again without replacing what stayed the same, and every amount marked for the
 * privacy blur.
 *
 * Dom.patch(el, html): el's children become html. Setting innerHTML made every element new: whatever was moving on
 * them began again (the pay card's light, a count, a press), on a phone a newly made layer showed black for a frame
 * until it was painted, and sideways-scrolled rows went back to the start. patch walks the new tree beside the live
 * one and changes only the attributes, text and children that differ, so an element that is still there stays the
 * very same element. One that changed kind (another tag, id, data-key/data-id or first class) is replaced.
 *
 * Dom.markMoney(node): every amount in shekels inside node gets the class "money" (its element, or a <span> around
 * it), so the privacy setting blurs it — wherever and however it was written. A watcher marks everything added to
 * the page before it is drawn (a MutationObserver runs before the next frame), so no amount shows for a frame.
 */
(function (root) {
  'use strict';
  const Dom = {};
  const SVG = 'http://www.w3.org/2000/svg';
  // one-time entrance classes: never added to (or taken from) an element already on the screen
  const STICKY = new Set(['tc-enter', 'ha-enter']);
  const PH = /--ph:\s*-?[\d.]+ms;?/; // a looping decoration's clock: differs on every draw, the live one is kept

  const strong = (n) => (n.nodeType === 1 ? n.id || n.getAttribute('data-key') || n.getAttribute('data-id') || '' : '');
  const firstClass = (n) => { const c = n.getAttribute('class'); return c ? c.trim().split(/\s+/)[0] : ''; };
  const keyOf = (n) => (n.nodeType === 1 ? n.tagName + '|' + strong(n) + '|' + firstClass(n) : '#' + n.nodeType);

  function syncClass(a, value) {
    const want = value.split(/\s+/).filter((c) => c && (!STICKY.has(c) || a.classList.contains(c)));
    for (const c of a.classList) if (STICKY.has(c) && !want.includes(c)) want.push(c);
    const have = a.classList;
    if (want.length === have.length && want.every((c) => have.contains(c))) return;
    a.setAttribute('class', want.join(' '));
  }
  function syncStyle(a, value) {
    const cur = a.getAttribute('style') || '';
    if (cur.replace(PH, '') === value.replace(PH, '')) return;
    const ph = cur.match(PH);
    a.setAttribute('style', ph && PH.test(value) ? value.replace(PH, ph[0]) : value);
  }
  function syncAttrs(a, b) {
    const ba = b.attributes;
    for (let i = 0; i < ba.length; i++) {
      const at = ba[i];
      if (at.name === 'class') syncClass(a, at.value);
      else if (at.name === 'style') syncStyle(a, at.value);
      else if (a.getAttribute(at.name) !== at.value) {
        if (at.namespaceURI) a.setAttributeNS(at.namespaceURI, at.name, at.value); else a.setAttribute(at.name, at.value);
      }
    }
    const aa = a.attributes;
    for (let i = aa.length - 1; i >= 0; i--) {
      const n = aa[i].name;
      if (b.hasAttribute(n)) continue;
      if (n === 'class') syncClass(a, ''); else a.removeAttribute(n);
    }
  }

  function patchNode(a, b) {
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    if (a.isEqualNode(b)) return;
    syncAttrs(a, b);
    const tag = a.tagName;
    // a field the user is typing in keeps what is typed; any other one shows the new value
    if (tag === 'TEXTAREA') { if (a !== document.activeElement && a.value !== b.value) a.value = b.value; return; }
    patchChildren(a, b);
    if (tag === 'INPUT') {
      if (a.type === 'checkbox' || a.type === 'radio') { if (a.checked !== b.defaultChecked) a.checked = b.defaultChecked; }
      else if (a !== document.activeElement && a.value !== b.defaultValue && a.type !== 'file') a.value = b.defaultValue;
    } else if (tag === 'SELECT') {
      const o = b.querySelector('option[selected]') || b.querySelector('option');
      if (o && a.value !== o.value) a.value = o.value;
    }
  }

  function patchChildren(from, to) {
    let cur = from.firstChild;
    let keyed = null; // the live children with an id of their own, to find one that moved
    for (let n = to.firstChild; n;) {
      const next = n.nextSibling;
      const k = keyOf(n);
      let match = cur && keyOf(cur) === k ? cur : null;
      const sk = strong(n);
      if (!match && sk) {
        if (!keyed) { keyed = new Map(); for (let c = cur; c; c = c.nextSibling) { const s = strong(c); if (s && !keyed.has(s)) keyed.set(s, c); } }
        const c = keyed.get(sk);
        if (c && c.parentNode === from && keyOf(c) === k) match = c;
      }
      // one live child left out of the new screen (a card that went away): skip past it instead of redrawing the rest
      if (!match && cur && !sk && cur.nextSibling && keyOf(cur.nextSibling) === k && (!next || keyOf(cur) !== keyOf(next))) {
        const gone = cur; cur = cur.nextSibling; from.removeChild(gone); match = cur;
      }
      if (match) {
        if (keyed) keyed.delete(strong(match));
        if (match === cur) cur = cur.nextSibling; else from.insertBefore(match, cur);
        patchNode(match, n);
      } else from.insertBefore(n, cur); // a new element: moved over from the new tree
      n = next;
    }
    while (cur) { const next = cur.nextSibling; from.removeChild(cur); cur = next; }
  }

  /** el's children become html, touching only what differs. */
  Dom.patch = function (el, html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    if (!el.closest(SKIP)) Dom.markMoney(t.content); // marked as the live tree is, so the two compare equal
    patchChildren(el, t.content);
  };

  /* ---------------- amounts, marked for the privacy blur ---------------- */
  // a game's coins and points, and a price, are not the user's money
  const SKIP = '.money, .pub, .game-sheet, .games-sheet, [data-plus-buy], [data-limit-buy], [data-design-buy], script, style, textarea, [contenteditable]';
  const GAP = '[\\s\\u200e\\u200f]*';
  const NUM = '[-−+]?\\d(?:[\\d,.]*\\d)?[kKMm]?';
  const AMOUNT = new RegExp(`[-−+]?₪${GAP}${NUM}|${NUM}${GAP}₪`, 'g');

  function markText(t) {
    const v = t.nodeValue;
    if (!v || v.indexOf('₪') < 0) return;
    const p = t.parentNode;
    if (!p || (p.nodeType !== 1 && p.nodeType !== 11)) return;
    if (p.nodeType === 1 && p.closest(SKIP)) return;
    AMOUNT.lastIndex = 0;
    if (!AMOUNT.test(v)) return;
    // an amount in a chart's text: the whole label
    if (p.namespaceURI === SVG) { const tx = p.closest('text'); if (tx) tx.classList.add('money'); return; }
    // an element that holds only the amount: the element itself
    AMOUNT.lastIndex = 0;
    const whole = v.replace(/[\s‎‏]/g, '').match(AMOUNT);
    if (p.nodeType === 1 && p.childNodes.length === 1 && whole && whole[0].replace(/[\s‎‏]/g, '') === v.replace(/[\s‎‏]/g, '')) {
      p.classList.add('money');
      return;
    }
    const doc = t.ownerDocument;
    const frag = doc.createDocumentFragment();
    let m, last = 0;
    AMOUNT.lastIndex = 0;
    while ((m = AMOUNT.exec(v))) {
      if (m.index > last) frag.appendChild(doc.createTextNode(v.slice(last, m.index)));
      const s = doc.createElement('span');
      s.className = 'money';
      s.textContent = m[0];
      frag.appendChild(s);
      last = m.index + m[0].length;
    }
    if (last < v.length) frag.appendChild(doc.createTextNode(v.slice(last)));
    p.replaceChild(frag, t);
  }
  Dom.markMoney = function (node) {
    if (!node) return;
    if (node.nodeType === 3) { markText(node); return; }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1 && (node.closest(SKIP) || (node.textContent || '').indexOf('₪') < 0)) return;
    const w = (node.ownerDocument || document).createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const found = [];
    for (let t = w.nextNode(); t; t = w.nextNode()) if (t.nodeValue.indexOf('₪') >= 0) found.push(t);
    found.forEach(markText);
  };
  // everything added to the page or changed in it, before it is drawn
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') markText(m.target);
        else for (const n of m.addedNodes) Dom.markMoney(n);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  root.Dom = Dom;
})(typeof window !== 'undefined' ? window : globalThis);
