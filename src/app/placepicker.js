/* ============================================================
 * placepicker.js — choosing a place, out of every locality in Israel (places.js):
 * a search field and "my location" at the top, the most common places under them, then every place
 * from א to ת with a letter rail to run through them. Each place comes with a short line about it.
 *
 * Details that matter:
 *  - every row is exactly one row tall (the name and its line never wrap; a long one ends in "…"), so a
 *    letter's section has a known height: the browser skips laying out the sections off screen
 *    (content-visibility) and a jump to a letter lands exactly on it;
 *  - the search bar is above the scrolling list, not floating on it, and the letter titles scroll with it:
 *    sticky bars inside the list made the sections composited layers that came and went (a flash on a phone);
 *  - jumping to a letter draws the sections that will fill the screen in the same frame (a section far off
 *    screen is otherwise drawn a frame late, and the list showed blank for a frame);
 *  - the 1,300 rows go in once the sheet is up and the most common have come in, so its slide is never held up by them;
 *  - search results are kept between keystrokes (a row still matching stays where it is and only the new
 *    ones come in), so typing never makes the list blink;
 *  - "my location" asks the phone once, finds the nearest place people live in and chooses it; the
 *    position is used here only, never stored or sent;
 *  - choosing: a check, a burst from the row, a chime, and the sheet goes down.
 * ============================================================ */
(function (root) {
  'use strict';
  const { App, UI, Places } = root;
  const { esc, icon } = UI;
  const POPULAR = 10;
  const SHOW = 40; // search results shown at once (typing more narrows them)
  const PIC = { '🏙️': 'c', '🌾': 'k', '🌻': 'm', '🏡': 'y', '🏘️': 'v', '🏭': 'w', '🏫': 's', '🏥': 'h', '✈️': 'a', '🏨': 'o' };
  const fx = () => root.Fx;
  const motion = () => !!(root.Fx && root.Fx.motion());

  /** The typed part of a name, marked. */
  function mark(name, q) {
    // i18n-keep-start (place names are Hebrew)
    const t = String(q || '').trim().replace(/'/g, '׳').replace(/"/g, '״');
    // i18n-keep-end
    const i = t ? name.indexOf(t) : -1;
    if (i < 0) return esc(name);
    return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + t.length)) + '</mark>' + esc(name.slice(i + t.length));
  }
  // the check of the place chosen is a badge on the picture's corner (it takes no room from the text)
  const row = (p, q, extra) => `<button type="button" class="pp-row" data-p="${p.i}"${extra || ''}><span class="pp-pic pc-${PIC[p.pic] || 'v'}" aria-hidden="true">${p.pic}<span class="pp-ok">${icon('check')}</span></span>`
    + `<span class="pp-tx"><span class="pp-n">${q ? mark(p.name, q) : esc(p.name)}</span><span class="pp-f">${esc(p.fact)}</span></span></button>`;

  // every place, by letter, one piece of HTML per letter (built once: the same for every opening). A letter's
  // places come in chunks of CHUNK rows: the chunks off screen are skipped by the browser, and a jump to a
  // letter only has to draw the chunk or two that fill the screen, not a letter's 150 places
  const CHUNK = 20;
  let azParts = null;
  function az() {
    if (azParts) return azParts;
    const groups = [];
    for (const p of Places.ALL) {
      const l = p.name[0];
      if (!groups.length || groups[groups.length - 1].l !== l) groups.push({ l, list: [] });
      groups[groups.length - 1].list.push(p);
    }
    azParts = groups.map((g) => {
      let html = `<section class="pp-sec" data-l="${g.l}"><div class="pp-h" role="heading" aria-level="3">${g.l}</div>`;
      for (let k = 0; k < g.list.length; k += CHUNK) {
        const part = g.list.slice(k, k + CHUNK);
        html += `<div class="pp-chunk" style="contain-intrinsic-size:auto calc(${part.length} * var(--pp-row))">${part.map((p) => row(p)).join('')}</div>`;
      }
      return html + '</section>';
    });
    return azParts;
  }

  // outside Hebrew a place is shown by its English name (the list has one for every locality): "Tel Aviv - Yafo"
  const enName = (p) => p.en.replace(/(^|[\s(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  /** The name and picture shown for a stored place ('__custom' = a position typed in). */
  App.placeLabel = function (name) {
    if (name === '__custom') return { pic: '📍', name: 'מיקום מותאם (קו רוחב/אורך)' };
    const p = Places.find(name);
    return p ? { pic: p.pic, name: root.U.LANG !== 'he' && p.en ? enName(p) : p.name } : { pic: '📍', name: name || '' };
  };

  /** The field that opens the picker (data-pick-city): the place chosen with its picture, or an invitation. */
  App.placeField = function (name, what) {
    const l = name ? App.placeLabel(name) : null;
    return `<button type="button" class="input pp-field" data-pick-city aria-label="${esc(what || 'יישוב')}: ${l ? esc(l.name) : 'לא נבחר'}">`
      + (l ? `<span class="pp-fpic" aria-hidden="true">${l.pic}</span><span class="pp-fname">${esc(l.name)}</span>` : `${icon('search')}<span class="pp-fname ph">בחירת יישוב</span>`)
      + `${icon('left', 's')}</button>`;
  };
  /** After a choice: the field's picture gives a little hop. */
  App.placeFieldHop = function (scope) {
    const f = scope && scope.querySelector('[data-pick-city]');
    if (f) f.classList.add('just');
  };

  /**
   * Open the picker. opts: { title, current (a stored name), custom (offer a position typed in) }.
   * Resolves with the chosen name ('__custom' for a typed position), or null when closed.
   */
  App.pickPlace = function (opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const cur = opts.current === '__custom' ? null : Places.find(opts.current);
      let settled = false, picked = false, entry = null;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      const pop = Places.popular(POPULAR);
      const on = (p) => (cur && p === cur ? ' aria-current="true"' : '');
      const body = `<div class="pp">
        <div class="pp-top">
          <label class="pp-search">${icon('search')}<input type="search" class="pp-q" placeholder="חיפוש יישוב" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search" aria-label="חיפוש יישוב"><button type="button" class="pp-x" aria-label="ניקוי החיפוש" hidden>${icon('x')}</button></label>
          <button type="button" class="pp-loc">${icon('pin')}<span>המיקום שלי</span></button>
        </div>
        <div class="pp-browse">
          ${cur ? `<div class="section-title">הבחירה שלך</div><div class="pp-list">${row(cur, '', on(cur))}</div>` : ''}
          <div class="section-title">🔥 הכי נפוצים</div>
          <div class="pp-list pp-pop">${pop.map((p, n) => row(p, '', `${on(p)} style="--i:${n}"`)).join('')}</div>
          <div class="section-title">כל היישובים, מא׳ ועד ת׳</div>
          <div class="pp-az"></div>
          ${opts.custom ? `<div class="section-title">לא ברשימה?</div><div class="pp-list"><button type="button" class="pp-row" data-custom${opts.current === '__custom' ? ' aria-current="true"' : ''}><span class="pp-pic pc-y" aria-hidden="true">📍<span class="pp-ok">${icon('check')}</span></span><span class="pp-tx"><span class="pp-n">מיקום מותאם</span><span class="pp-f">לפי קו רוחב וקו אורך</span></span></button></div>` : ''}
        </div>
        <div class="pp-res" hidden><div class="pp-list"></div><div class="pp-more" aria-live="polite"></div></div>
      </div>`;
      entry = UI.openSheet({ title: opts.title || 'בחירת יישוב', body, full: true, cls: 'pp-sheet', onMount, onClose: () => finish(null) });

      function onMount(sh) {
        const bodyEl = sh.querySelector('.sh-body');
        const pp = sh.querySelector('.pp');
        const topEl = pp.querySelector('.pp-top');
        const input = pp.querySelector('.pp-q');
        const xBtn = pp.querySelector('.pp-x');
        const loc = pp.querySelector('.pp-loc');
        const browse = pp.querySelector('.pp-browse');
        const azEl = pp.querySelector('.pp-az');
        const res = pp.querySelector('.pp-res');
        const resList = res.querySelector('.pp-list');
        const more = res.querySelector('.pp-more');
        const tmp = document.createElement('div');
        const resEls = new Map();
        let searching = false, saved = 0, rail = null, bubble = null, offs = [], letter = '', raf = 0, lifted = false;
        // the search bar sits above the scrolling list, not on it: a sticky bar inside it made every section that
        // passed under it a compositing layer of its own, made and dropped as it scrolled (a flash on a phone)
        sh.insertBefore(topEl, bodyEl);

        /* ---- choosing ---- */
        function choose(name, el) {
          if (picked) return;
          picked = true;
          pp.classList.add('choosing');
          if (el) el.classList.add('picked');
          const F = fx();
          if (F) { F.play('pick'); F.haptic([8, 30, 14]); }
          const g = el && root.GameFx ? root.GameFx.screen() : null;
          if (g) {
            const r = el.getBoundingClientRect();
            const p = el.querySelector('.pp-pic').getBoundingClientRect();
            const x = p.left + p.width / 2, y = r.top + r.height / 2;
            g.burst(x, y, { palette: 'party', n: 26, kinds: ['spark', 'star', 'confetti'], speed: [140, 420] });
            g.ring(x, y, { color: '#8b6cff', r1: 64, width: 5 });
          }
          setTimeout(() => { finish(name); if (!entry.closed) UI.closeTop(); }, 430);
        }
        pp.addEventListener('click', (e) => {
          const b = e.target.closest('.pp-row');
          if (!b || picked) return;
          if (b.hasAttribute('data-custom')) { choose('__custom', b); return; }
          const p = Places.ALL[+b.dataset.p];
          if (p) choose(p.name, b);
        });

        /* ---- searching ---- */
        function setMode(s) {
          if (s === searching) return;
          searching = s;
          // the list is put away, not removed from the layout: it keeps its layout while hidden (content-visibility:
          // hidden), so coming back after a search costs nothing (taking it out made a 120ms frame on a slow phone)
          if (s) { saved = bodyEl.scrollTop; browse.classList.add('away'); browse.inert = true; res.hidden = false; }
          else {
            res.hidden = true; more.textContent = ''; resList.textContent = ''; resEls.clear();
            browse.classList.remove('away'); browse.inert = false; bodyEl.scrollTop = saved;
            if (rail) measure(); // the screen may have turned or resized while searching
          }
          if (rail) rail.classList.toggle('show', !s);
        }
        function results(q) {
          const { list, total } = Places.search(q, SHOW);
          const keep = new Set(list.map((p) => p.i));
          for (const [i, el] of resEls) if (!keep.has(i)) { el.remove(); resEls.delete(i); }
          // the new rows are made in one go; only those that come in on screen (the first dozen) slide in
          const fresh = list.filter((p) => !resEls.has(p.i));
          if (fresh.length) {
            tmp.innerHTML = fresh.map((p) => row(p, q, on(p))).join('');
            fresh.forEach((p, n) => resEls.set(p.i, tmp.children[n]));
          }
          const anim = motion() && !!tmp.animate;
          let prev = null, shown = 0;
          for (const p of list) {
            const el = resEls.get(p.i);
            if (fresh.includes(p)) {
              if (anim && shown < 12) el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 200, delay: shown * 16, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
            } else el.querySelector('.pp-n').innerHTML = mark(p.name, q);
            shown++;
            const want = prev ? prev.nextSibling : resList.firstChild;
            if (el !== want) resList.insertBefore(el, want);
            prev = el;
          }
          const was = more.dataset.k || '';
          const k = !total ? 'none' : total > list.length ? 'more' : '';
          more.dataset.k = k;
          more.innerHTML = k === 'none'
            ? `<div class="pp-empty"><span class="pp-empty-ic" aria-hidden="true">🧭</span><b>לא מצאנו יישוב כזה</b><span>אפשר לנסות רק את תחילת השם, או באנגלית</span></div>`
            : k === 'more' ? `<div class="pp-hint">ועוד ${total - list.length} יישובים. כדאי להמשיך לכתוב</div>` : '';
          if (k === 'none' && was !== 'none' && motion()) {
            const e = more.firstChild;
            if (e && e.animate) e.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
            const F = fx(); if (F) F.play('soft');
          }
        }
        function update() {
          const q = input.value;
          const has = q.trim().length > 0;
          xBtn.hidden = !q.length;
          setMode(has);
          if (has) { results(q); bodyEl.scrollTop = 0; }
        }
        input.addEventListener('input', update);
        input.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const first = resList.querySelector('.pp-row');
          if (first) { input.blur(); choose(Places.ALL[+first.dataset.p].name, first); }
        });
        xBtn.addEventListener('click', () => { input.value = ''; update(); input.focus(); });
        // a finger moving the list puts the keyboard away (the end of the list is under it otherwise)
        bodyEl.addEventListener('touchmove', () => { if (document.activeElement === input) input.blur(); }, { passive: true });

        /* ---- my location ---- */
        let locating = false;
        const locText = loc.querySelector('span');
        function locDone() { locating = false; loc.classList.remove('busy'); loc.disabled = false; locText.textContent = 'המיקום שלי'; }
        loc.addEventListener('click', () => {
          if (locating || picked) return;
          if (!navigator.geolocation) { UI.toast('אין כאן איתור מיקום. אפשר לחפש לפי השם'); return; }
          locating = true;
          loc.classList.add('busy'); loc.disabled = true; locText.textContent = 'מאתרים…';
          navigator.geolocation.getCurrentPosition((pos) => {
            if (entry.closed || picked) return;
            locDone();
            const n = Places.nearest(pos.coords.latitude, pos.coords.longitude);
            if (!n || n.km > 20) { UI.toast('המיקום שלך מחוץ לישראל, אז אי אפשר לבחור לפיו. אפשר לחפש לפי השם'); return; }
            found(n);
          }, (err) => {
            if (entry.closed || picked) return;
            locDone();
            UI.toast(err && err.code === 1 ? 'אין הרשאה למיקום. אפשר לאשר אותה בהגדרות ולנסות שוב' : 'לא הצלחנו לאתר את המיקום. אפשר לנסות שוב או לחפש לפי השם');
          }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60000 });
        });
        // the place found shows on its own for a moment, then it is chosen
        function found(n) {
          input.value = ''; xBtn.hidden = true;
          setMode(true);
          resList.textContent = ''; resEls.clear();
          tmp.innerHTML = row(n.place);
          const el = tmp.firstChild;
          el.classList.add('pp-found');
          resList.appendChild(el);
          more.dataset.k = '';
          more.innerHTML = `<div class="pp-near">${icon('pin', 's')} הכי קרוב למיקום שלך${n.km >= 1 ? ` · ${n.km < 10 ? n.km.toFixed(1) : Math.round(n.km)} ק״מ` : ''}</div>`;
          bodyEl.scrollTop = 0;
          if (motion() && el.animate) el.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1.25)' });
          const F = fx(); if (F) { F.play('ping'); F.haptic(10); }
          setTimeout(() => { if (!entry.closed) choose(n.place.name, el); }, 650);
        }

        /* ---- the letter rail ---- */
        function measure() {
          const top = bodyEl.getBoundingClientRect().top;
          offs = [...azEl.children].map((s) => ({ l: s.dataset.l, y: bodyEl.scrollTop + s.getBoundingClientRect().top - top }));
        }
        function current() {
          if (!offs.length) return '';
          const y = bodyEl.scrollTop + 1;
          if (y < offs[0].y) return '';
          let lo = 0, hi = offs.length - 1;
          while (lo < hi) { const m = (lo + hi + 1) >> 1; if (offs[m].y <= y) lo = m; else hi = m - 1; }
          return offs[lo].l;
        }
        function markRail(l) {
          if (!rail || l === letter) return;
          const old = letter && rail.querySelector(`[data-l="${letter}"]`);
          if (old) old.classList.remove('cur');
          letter = l;
          const now = l && rail.querySelector(`[data-l="${l}"]`);
          if (now) now.classList.add('cur');
        }
        // the chunks that will fill the screen after a jump are drawn in the same frame as the jump: a chunk far
        // off screen is otherwise drawn a frame late (content-visibility), and the list showed blank for a frame.
        // Two frames later they go back to the browser's care (on screen they stay drawn; off screen, skipped).
        let held = [], heldT = 0;
        function jump(l) {
          const o = offs.find((x) => x.l === l);
          if (!o) return;
          const chunks = [...azEl.querySelectorAll('.pp-chunk')];
          let k = chunks.indexOf(azEl.querySelector(`.pp-sec[data-l="${l}"] .pp-chunk`)), rows = 0;
          for (; k >= 0 && k < chunks.length && rows < 16; k++) {
            const c = chunks[k];
            if (!c.style.contentVisibility) { c.style.contentVisibility = 'visible'; held.push(c); }
            rows += c.childElementCount + 1;
          }
          bodyEl.scrollTop = Math.round(o.y);
          markRail(l);
          cancelAnimationFrame(heldT);
          heldT = requestAnimationFrame(() => { heldT = requestAnimationFrame(() => { for (const c of held) c.style.contentVisibility = ''; held = []; }); });
        }
        function buildRail() {
          rail = document.createElement('div');
          rail.className = 'pp-rail';
          rail.setAttribute('aria-hidden', 'true');
          rail.innerHTML = Places.LETTERS.map((l) => `<b data-l="${l}">${l}</b>`).join('');
          bubble = document.createElement('div');
          bubble.className = 'pp-bubble';
          bubble.setAttribute('aria-hidden', 'true');
          sh.append(rail, bubble);
          rail.style.top = (bodyEl.offsetTop + 4) + 'px';
          let scrub = false, last = '', hideT = 0;
          const at = (y) => {
            const r = rail.getBoundingClientRect();
            const k = Math.max(0, Math.min(rail.children.length - 1, Math.floor((y - r.top) / (r.height / rail.children.length))));
            return rail.children[k];
          };
          const go = (e) => {
            const b = at(e.clientY);
            const l = b.dataset.l;
            const sr = sh.getBoundingClientRect(), br = b.getBoundingClientRect();
            bubble.style.top = Math.round(br.top + br.height / 2 - sr.top - 32) + 'px';
            if (l === last) return;
            last = l;
            bubble.textContent = l;
            jump(l);
            const F = fx();
            if (F) { F.play('tick', { pitch: 0.85 + Places.LETTERS.indexOf(l) * 0.02 }); F.haptic(4); }
          };
          rail.addEventListener('pointerdown', (e) => {
            if (searching || picked) return;
            e.preventDefault();
            try { rail.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
            if (document.activeElement === input) input.blur();
            scrub = true; last = '';
            clearTimeout(hideT);
            rail.classList.add('scrub'); bubble.classList.add('show');
            go(e);
          });
          rail.addEventListener('pointermove', (e) => { if (scrub) go(e); });
          const end = () => {
            if (!scrub) return;
            scrub = false;
            rail.classList.remove('scrub');
            hideT = setTimeout(() => bubble.classList.remove('show'), 380);
          };
          rail.addEventListener('pointerup', end);
          rail.addEventListener('pointercancel', end);
          rail.addEventListener('lostpointercapture', end);
          requestAnimationFrame(() => { if (!searching) rail.classList.add('show'); });
        }
        bodyEl.addEventListener('scroll', () => {
          if (raf) return;
          raf = requestAnimationFrame(() => {
            raf = 0;
            const lift = bodyEl.scrollTop > 2;
            if (lift !== lifted) { lifted = lift; topEl.classList.toggle('lift', lift); }
            if (!searching) markRail(current());
          });
        }, { passive: true });

        // every place goes in once the sheet is up and the most common have come in (inserted while those still
        // moved, the list below them was briefly a compositing layer of its own, made and dropped)
        // A few letters a frame, so no frame is held up by 1,300 rows at once (on a slow phone that was a 125ms freeze)
        setTimeout(() => {
          if (entry.closed) return;
          pp.querySelector('.pp-pop').classList.add('done'); // their entrance is over: never again
          const parts = az();
          let n = 0;
          (function more() {
            if (entry.closed) return;
            const t0 = performance.now();
            while (n < parts.length && (performance.now() - t0 < 6 || n === 0)) azEl.insertAdjacentHTML('beforeend', parts[n++]);
            if (n < parts.length) { requestAnimationFrame(more); return; }
            if (cur) { const el = azEl.querySelector(`[data-p="${cur.i}"]`); if (el) el.setAttribute('aria-current', 'true'); }
            requestAnimationFrame(() => {
              if (entry.closed) return;
              measure();
              buildRail();
            });
          })();
        }, motion() ? 780 : 360);
        root.addEventListener('resize', function onResize() {
          if (entry.closed) { root.removeEventListener('resize', onResize); return; }
          if (rail) rail.style.top = (bodyEl.offsetTop + 4) + 'px';
          if (!searching && rail) measure();
        });
      }
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
