/* The organizations page (site/embed.html): the copy buttons, and the live preview's frame grows to the calculator's
 * height, as the host sites' optional script does (site/calc.js posts it; tools/site-pages.js puts the message type
 * in place of shaati-calc-height). Loaded in <head>, so the listener is there before the preview's first message. */
(function () {
  'use strict';
  addEventListener('message', (e) => {
    const frame = document.getElementById('em-preview');
    if (!frame || e.origin !== location.origin || e.source !== frame.contentWindow || !e.data || e.data.type !== 'shaati-calc-height') return;
    frame.style.height = e.data.height + 'px';
  });
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const box = document.getElementById(b.dataset.copy), ok = document.getElementById(b.dataset.copy + '-ok');
    try {
      await navigator.clipboard.writeText(box.textContent);
      ok.textContent = 'הקוד הועתק. עכשיו מדביקים אותו בעמוד באתר שלכם.';
    } catch (e) {
      // no clipboard here: the code is selected, ready for Ctrl+C
      const r = document.createRange();
      r.selectNodeContents(box);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      ok.textContent = 'הקוד מסומן. מעתיקים אותו עם Ctrl+C.';
    }
    ok.hidden = false;
  })));
})();
