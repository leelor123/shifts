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
 * Dom.own(node, anchor) / Dom.keep(el, attrs, classes): what code adds to a drawn element after it is drawn (a
 * picker's button next to its input, the attributes and classes that hide the native input) is not in the screen's
 * HTML; a patch leaves it as it is (it removed the pickers' buttons and showed the plain inputs again).
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

  const kept = (a, c) => STICKY.has(c) || (a.__keep && a.__keep.c.has(c));
  function syncClass(a, value) {
    const want = value.split(/\s+/).filter((c) => c && (!kept(a, c) || a.classList.contains(c)));
    for (const c of a.classList) if (kept(a, c) && !want.includes(c)) want.push(c);
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
      if (b.hasAttribute(n) || (a.__keep && a.__keep.a.has(n))) continue;
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

  const real = (c) => { while (c && c.__ownOf) c = c.nextSibling; return c; }; // past the code's own nodes
  function patchChildren(from, to) {
    let cur = real(from.firstChild);
    let keyed = null; // the live children with an id of their own, to find one that moved
    for (let n = to.firstChild; n;) {
      const next = n.nextSibling;
      cur = real(cur);
      const k = keyOf(n);
      let match = cur && keyOf(cur) === k ? cur : null;
      const sk = strong(n);
      if (!match && sk) {
        if (!keyed) { keyed = new Map(); for (let c = cur; c; c = c.nextSibling) { const s = !c.__ownOf && strong(c); if (s && !keyed.has(s)) keyed.set(s, c); } }
        const c = keyed.get(sk);
        if (c && c.parentNode === from && keyOf(c) === k) match = c;
      }
      // one live child left out of the new screen (a card that went away): skip past it instead of redrawing the rest
      const after = cur && real(cur.nextSibling);
      if (!match && cur && !sk && after && keyOf(after) === k && (!next || keyOf(cur) !== keyOf(next))) {
        from.removeChild(cur); cur = after; match = cur;
      }
      if (match) {
        if (keyed) keyed.delete(strong(match));
        if (match === cur) cur = cur.nextSibling; else from.insertBefore(match, cur);
        patchNode(match, n);
      } else from.insertBefore(n, cur); // a new element: moved over from the new tree
      n = next;
    }
    while (cur) { const next = cur.nextSibling; if (!cur.__ownOf) from.removeChild(cur); cur = next; }
    // the code's own nodes stay right after what they belong to, and go with it
    for (let c = from.firstChild; c;) {
      const next = c.nextSibling;
      const a = c.__ownOf;
      if (a) {
        if (a.parentNode !== from) from.removeChild(c);
        else if (c.previousSibling !== a && !(c.previousSibling && c.previousSibling.__ownOf === a)) a.after(c);
      }
      c = next;
    }
  }

  /** node was added by code next to anchor (a picker's button): a patch leaves it there. */
  Dom.own = function (node, anchor) { node.__ownOf = anchor; return node; };
  /** attributes and classes code put on a drawn element: a patch keeps them. */
  Dom.keep = function (el, attrs, classes) {
    const k = el.__keep || (el.__keep = { a: new Set(), c: new Set() });
    (attrs || []).forEach((x) => k.a.add(x));
    (classes || []).forEach((x) => k.c.add(x));
  };

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
  /* ---------------- short labels stay on one line ----------------
   * A label of a few words ("תכנן משמרת", "נטו משוער") that does not fit its place broke onto two lines ("תכנן /
   * משמרת") — it looked broken, in a narrow phone, a bigger text size or a longer language. Dom.fit makes such a label
   * a little smaller (down to 80%) until it fits one line, before the screen is drawn; a longer text (a sentence)
   * still goes to a new line between words, and nothing is ever cut. */
  const FIT_SKIP = '#intro, svg, canvas, input, textarea, select, [contenteditable], .hero-num, .pp-row, .no-fit';
  const FIT_STEPS = [0.92, 0.86, 0.8];
  const shortText = (el) => { const t = (el.textContent || '').trim(); return t.length > 1 && t.length <= 32 && t.split(/\s+/).length <= 3; };
  // the element's own text spans more than one line (a text node's boxes on different rows)
  function wraps(el) {
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.nodeValue.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const tops = [];
      for (const r of rg.getClientRects()) { if (r.width < 1) continue; if (!tops.some((t) => Math.abs(t - r.top) < 3)) tops.push(r.top); }
      if (tops.length > 1) return true;
    }
    return false;
  }
  // on two lines, or cut (a one-line box that hides what does not fit: "…")
  const tight = (el) => wraps(el) || (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible');
  Dom.fit = function (node) {
    if (!node || typeof document === 'undefined') return;
    const scope = node.nodeType === 1 || node.nodeType === 9 || node.nodeType === 11 ? node : node.parentElement;
    if (!scope || (scope.nodeType === 1 && scope.closest(FIT_SKIP))) return;
    // the labels: elements with their own short text, and any fitted before (reads first, then writes, so the page
    // is laid out only a few times)
    const seen = new Set(); const els = [];
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) {
      const el = t.parentElement;
      if (!el || seen.has(el) || !t.nodeValue.trim()) continue;
      seen.add(el);
      if (el.__fitBase || (!el.closest(FIT_SKIP) && shortText(el))) els.push(el);
      // the box that cuts may hold the text one level down (a big number: <div class="v"><span class="money">…)
      const up = el.parentElement;
      if (up && up !== scope.parentElement && !seen.has(up)) { seen.add(up); if (up.__fitBase || (!up.closest(FIT_SKIP) && shortText(up))) els.push(up); }
    }
    if (scope.nodeType === 1 && scope.__fitBase && !seen.has(scope)) els.push(scope);
    if (!els.length) return;
    // a label fitted before starts again from its own size (its text or its room may have changed)
    for (const el of els) if (el.__fitBase) { el.style.fontSize = ''; el.__fitBase = 0; }
    let todo = els.filter((el) => shortText(el) && el.getClientRects().length && tight(el));
    for (const el of todo) el.__fitBase = parseFloat(getComputedStyle(el).fontSize) || 0;
    todo = todo.filter((el) => el.__fitBase);
    for (const k of FIT_STEPS) {
      if (!todo.length) break;
      for (const el of todo) { el.style.fontSize = (el.__fitBase * k).toFixed(2) + 'px'; Dom.keep(el, ['style']); }
      todo = todo.filter((el) => tight(el));
    }
    // too long even at 80%: its own size, on two lines between words (smaller and still broken helps nobody)
    for (const el of todo) { el.style.fontSize = ''; el.__fitBase = 0; }
  };
  // everything added to the page or changed in it, before it is drawn
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    new MutationObserver((list) => {
      const fit = new Set();
      for (const m of list) {
        if (m.type === 'characterData') { markText(m.target); if (m.target.parentElement && !m.target.parentElement.closest('.hero-num')) fit.add(m.target.parentElement); }
        else for (const n of m.addedNodes) { Dom.markMoney(n); if (n.isConnected) fit.add(n.nodeType === 1 ? n : n.parentElement); }
      }
      fit.forEach((n) => n && n.isConnected && Dom.fit(n));
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    // the room changes: the window, the text size (settings), a sheet that opened, a section that opened
    const fitAll = () => { if (document.body) Dom.fit(document.body); };
    Dom.fitAll = fitAll;
    root.addEventListener('resize', fitAll);
    document.addEventListener('toggle', (e) => Dom.fit(e.target), true);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', fitAll);
  }

  root.Dom = Dom;
})(typeof window !== 'undefined' ? window : globalThis);
