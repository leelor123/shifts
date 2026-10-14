/* ============================================================
 * ui.js — small UI toolkit: icons, escaping, toasts, bottom
 * sheets, dialogs, routing and shared fragments.
 * Views render HTML strings; events use data-act delegation.
 * ============================================================ */
(function (root) {
  'use strict';
  const U = root.U;

  /* ---------------- icons (stroke, 24px) ---------------- */
  const P = {
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    play: '<path d="M7 4v16l13-8z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    receipt: '<path d="M5 2v20l2-1.5L9 22l2-1.5L13 22l2-1.5L17 22l2-1.5V2l-2 1.5L15 2l-2 1.5L11 2 9 3.5 7 2z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    finger: '<path d="M12 11v2.5a7 7 0 0 1-1.2 4"/><path d="M9 11a3 3 0 0 1 6 0v1.5a10 10 0 0 1-.8 4"/><path d="M6.2 14.5A8 8 0 0 0 7 11a5 5 0 0 1 8.6-3.5"/><path d="M17.6 9.5A5 5 0 0 1 18 11v1.5c0 1.6-.2 3.1-.6 4.5"/><path d="M4.5 9A8 8 0 0 1 16 4.3"/><path d="M19.4 7a8 8 0 0 1 .6 3"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    lock: '<rect x="4" y="11" width="16" height="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    candle: '<path d="M8 22V12M16 22V12M5 22h14M8 12c-1.2-1.2-1.2-2.8 0-4.5 1.2 1.7 1.2 3.3 0 4.5zM16 12c-1.2-1.2-1.2-2.8 0-4.5 1.2 1.7 1.2 3.3 0 4.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
    swap: '<path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    sparkle: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3z"/><path d="M12 9v4M12 17h.01"/>',
    okc: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    xc: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    up: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    down: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
    car: '<path d="M5 17h14M6 17v2M18 17v2M3 13l2-6h14l2 6v4H3z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
    thermo: '<path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/>',
    palm: '<path d="M13 8c0-2.8 2.2-5 5-5M13 8c-.5-2.6-2.8-4-5-4M13 8c2.6.3 4.5 2.6 4.5 5M13 8c-2.6.3-4.5 2.6-4.5 5M13 8l-1 14"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    minus: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
    more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2c0-1.1-.9-2-2-2h-1a2 2 0 0 1 0-4h5a6 6 0 0 0 6-6c0-3.3-4.5-6-10-6z"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-5-6.7"/>',
    flask: '<path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6a2 2 0 0 0 1.7-3L14 9V3"/>',
    beach: '<path d="M12 21v-9M5 12a7 7 0 0 1 14 0z"/><path d="M3 21h18"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="3"/><path d="M8 6.5h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 18.5h.01M12 18.5h.01M16 18.5h.01"/>',
    bug: '<rect x="7" y="7" width="10" height="13" rx="5"/><path d="M9 7.5V6a3 3 0 0 1 6 0v1.5M12 11v9M7 12H3M21 12h-4M7 16.5l-3 1.5M17 16.5l3 1.5M7.5 8.5 5 6.5M16.5 8.5 19 6.5"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-10 6L2 7"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a3 3 0 0 1 5.7 1.1c0 2-2.9 2.6-2.9 4.2M12 17.5h.01"/>',
    chat: '<path d="M21 14.5a2.5 2.5 0 0 1-2.5 2.5H8l-5 4V5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5z"/><path d="M8 9h8M8 12.5h5"/>',
    bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v3M16 18v3M8 14.5h.01M16 14.5h.01"/>',
    walk: '<circle cx="13.5" cy="4" r="2"/><path d="m10 21 2.2-6.2 2.8 2.7V21M8 13l1.8-4 4.2.6 2.6 3"/>',
    star: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    game: '<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4M15.5 11.5h.01M18 13.5h.01"/>',
    rocket: '<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
  };
  function icon(name, cls) {
    return `<svg class="i ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.info}</svg>`;
  }

  /* ---------------- escaping & fragments ---------------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const money = (n, d) => `<span class="money">${U.money(n, d)}</span>`;
  const numv = (n, d) => `<span class="num">${U.num(n, d)}</span>`;
  function delta(cur, prev, opts) {
    opts = opts || {};
    if (prev == null || !isFinite(prev)) return '';
    if (prev === 0 && cur === 0) return '<span class="delta flat">—</span>';
    // nothing in the previous period to compare with
    if (prev === 0) return opts.compact
      ? '<span class="delta flat" title="אין נתונים בתקופה הקודמת">—</span>'
      : '<span class="delta flat" title="בתקופה הקודמת אין נתונים, אז אין למה להשוות">אין נתוני השוואה</span>';
    const d = ((cur - prev) / Math.abs(prev)) * 100;
    if (Math.abs(d) < 0.5) return '<span class="delta flat">= 0%</span>';
    const good = opts.invert ? d < 0 : d > 0;
    return `<span class="delta ${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${U.num(Math.abs(d), 0)}%</span>`;
  }
  function roleDot(role, size) {
    return `<i style="display:inline-block;width:${size || 10}px;height:${size || 10}px;border-radius:50%;background:${esc(role ? role.color : '#999')}"></i>`;
  }
  function emptyState(ic, title, text, action) {
    return `<div class="empty"><div class="art">${icon(ic)}</div><h3>${esc(title)}</h3><div>${text || ''}</div>${action ? `<div style="margin-top:16px">${action}</div>` : ''}</div>`;
  }

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  // opts.ok: something was saved: a little check mark draws itself next to the message
  const TICK = '<svg class="tk" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="m7 12.5 3.2 3.2L17 9"/></svg>';
  function toast(text, action, opts) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = (opts && opts.ok ? TICK : '') + `<div style="flex:1">${esc(text)}</div>` + (action ? `<button class="act">${esc(action.label)}</button>` : '');
    if (action) el.querySelector('.act').onclick = () => { hideToast(); action.fn(); };
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 6000 : 3200);
  }
  function hideToast() { const el = document.getElementById('toast'); if (el) el.classList.remove('show'); }

  /* ---------------- sheets (with Android back button support) ---------------- */
  // Each open sheet owns one history entry ({sheet: depth}) so the Android back button closes the top
  // sheet. Back-navigation is asynchronous and closeAll() produces a single popstate for many steps,
  // so the depth that pending navigations will land on is tracked: quick repeated closes never walk
  // back out of the app, and a sheet opened while a close is still travelling gets its history entry
  // only after the close has landed.
  const sheets = [];
  let sheetSeq = 0;
  let pendingDepth = null;
  let pendingTimer = null;
  const committed = () => sheets.filter((s) => s.pushed);
  // On Chrome (the Android app runs on it) the back button closes the top layer through a CloseWatcher
  // instead: Chrome's back button skips history entries that a page adds without a finger tap, so a
  // screen the app opened by itself (the "add shift" shortcut, a note at startup) used to close the
  // whole app on back. Browsers without CloseWatcher keep one history entry per layer.
  const CW = typeof root.CloseWatcher === 'function' ? root.CloseWatcher : null;
  function track(entry) {
    sheets.push(entry);
    if (CW) {
      try { entry.watcher = new CW(); } catch (e) { return; }
      entry.watcher.onclose = () => { entry.watcher = null; removeSheet(entry); };
      return;
    }
    if (pendingDepth === null) pushEntry(entry);
  }
  function unwatch(entry) { const w = entry.watcher; entry.watcher = null; if (w) w.destroy(); }
  function pushEntry(entry) { entry.pushed = true; history.pushState({ sheet: committed().length }, ''); }
  function settlePending() {
    pendingDepth = null;
    clearTimeout(pendingTimer);
    sheets.filter((s) => !s.pushed && !s.closed).forEach(pushEntry);
  }
  function navigateBack(steps, depth) {
    pendingDepth = depth;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(settlePending, 1500); // never stay stuck if the browser drops the event
    if (steps === 1) history.back(); else history.go(-steps);
  }
  function openSheet(opts) {
    // opts: { title, body (html), foot (html), full, onMount(el), onClose(), cls }
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    const sh = document.createElement('div');
    sh.className = 'sheet' + (opts.full ? ' full' : '') + (opts.cls ? ' ' + opts.cls : '');
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-modal', 'true');
    // screen readers announce the sheet by its title
    const hid = 'sh-t-' + (++sheetSeq);
    sh.setAttribute('aria-labelledby', hid);
    sh.innerHTML = `<div class="grab"></div><div class="sh-head"><h2 id="${hid}">${opts.title || ''}</h2><button class="icon-btn" data-close aria-label="סגור">${icon('x')}</button></div><div class="sh-body">${opts.body || ''}</div>${opts.foot ? `<div class="sh-foot">${opts.foot}</div>` : ''}`;
    document.body.append(bd, sh);
    const entry = { bd, sh, opts, closed: false, pushed: false };
    track(entry);
    requestAnimationFrame(() => { bd.classList.add('show'); sh.classList.add('show'); });
    bd.onclick = () => closeTop();
    sh.querySelector('[data-close]').onclick = () => closeTop();
    // swipe down on the grab handle to close
    let y0 = null;
    const head = sh.querySelector('.grab');
    sh.querySelector('.sh-head').addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    head.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    sh.addEventListener('touchend', (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 80) closeTop(); y0 = null; });
    if (opts.onMount) opts.onMount(sh, entry);
    return entry;
  }
  /*
   * Dialogs and pickers are layers too: each owns a history entry like a sheet, so the back
   * button closes the top dialog (and only it) instead of the sheet underneath, or the app.
   * onBack runs when back (or closeTop / closeAll) closes it; a dialog that closes itself with
   * one of its own buttons calls closeLayer, which drops its history entry.
   */
  function pushLayer(onBack) {
    const entry = { layer: true, onBack, closed: false, pushed: false, opts: {} };
    track(entry);
    return entry;
  }
  function closeLayer(entry) {
    if (!entry || entry.closed) return;
    entry.closed = true;
    unwatch(entry);
    const wasPushed = entry.pushed;
    const top = committed().length;
    const i = sheets.indexOf(entry);
    if (i >= 0) sheets.splice(i, 1);
    if (!wasPushed) return;
    const cur = pendingDepth === null ? top : pendingDepth;
    if (cur > 0) navigateBack(1, cur - 1);
  }
  function removeSheet(entry) {
    if (entry.closed) return;
    unwatch(entry);
    if (entry.layer) {
      entry.closed = true;
      const i = sheets.indexOf(entry);
      if (i >= 0) sheets.splice(i, 1);
      if (entry.onBack) entry.onBack();
      return;
    }
    entry.closed = true;
    entry.bd.classList.remove('show');
    entry.sh.classList.remove('show');
    setTimeout(() => { entry.bd.remove(); entry.sh.remove(); }, 300);
    const i = sheets.indexOf(entry);
    if (i >= 0) sheets.splice(i, 1);
    if (entry.opts.onClose) entry.opts.onClose();
  }
  function closeTop() {
    const top = sheets[sheets.length - 1];
    if (!top) return;
    if (!top.pushed) { removeSheet(top); return; } // not in history yet
    const cur = pendingDepth === null ? committed().length : pendingDepth;
    if (cur <= 0) return;
    navigateBack(1, cur - 1); // popstate closes it
  }
  function closeAll() {
    sheets.filter((s) => !s.pushed).reverse().forEach(removeSheet); // top first
    const cur = pendingDepth === null ? committed().length : pendingDepth;
    if (cur > 0) navigateBack(cur, 0);
  }
  window.addEventListener('popstate', () => {
    // one event can stand for several steps (closeAll, or a fast double back)
    const depth = (history.state && history.state.sheet) || 0;
    committed().slice(depth).reverse().forEach(removeSheet);
    if (pendingDepth !== null && depth <= pendingDepth) settlePending();
  });

  /* ---------------- dialogs ---------------- */
  function dialog(opts) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'dialog';
      el.innerHTML = `<div class="backdrop" style="z-index:-1"></div><div class="box" role="alertdialog" aria-modal="true"><h3>${esc(opts.title || '')}</h3><div>${opts.html || esc(opts.text || '')}</div><div class="actions">${(opts.buttons || []).map((b, i) => `<button class="btn ${b.cls || 'text'}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
      document.body.appendChild(el);
      void el.offsetWidth; // fade the dimming in (not at once)
      el.querySelector('.backdrop').classList.add('show');
      const layer = pushLayer(() => { el.remove(); resolve(null); });
      const done = (v) => { el.remove(); closeLayer(layer); resolve(v); };
      el._resolve = done; // tests close it this way
      el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => {
        const btn = opts.buttons[+b.dataset.i];
        const v = btn.value !== undefined ? btn.value : +b.dataset.i;
        const input = el.querySelector('input,textarea,select');
        done(btn.value === 'input' ? (input ? input.value : null) : v);
      }));
      el.querySelector('.backdrop').onclick = () => done(null);
      const inp = el.querySelector('input,textarea');
      if (inp) setTimeout(() => inp.focus(), 50);
    });
  }
  function confirm(title, text, okLabel, danger) {
    return dialog({ title, text, buttons: [{ label: 'ביטול', value: false }, { label: okLabel || 'אישור', value: true, cls: danger ? 'danger' : '' }] });
  }
  function promptText(title, label, value, opts) {
    opts = opts || {};
    const field = opts.multiline
      ? `<textarea class="input" rows="4">${esc(value || '')}</textarea>`
      : `<input class="input ${opts.ltr ? 'ltr' : ''}" type="${opts.type || 'text'}" ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ''} value="${esc(value || '')}">`;
    return dialog({ title, html: `<label class="field"><span class="lbl">${esc(label || '')}</span>${field}</label>`, buttons: [{ label: 'ביטול', value: null }, { label: opts.ok || 'שמור', value: 'input', cls: '' }] });
  }

  /* ---------------- swipe helper ---------------- */
  function onSwipe(el, fn) {
    let x0 = null, y0 = null, t0 = 0;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - t0 < 700) fn(dx > 0 ? 'right' : 'left');
      x0 = null;
    });
  }

  /* ---------------- misc ---------------- */
  function vibrate(ms) {
    const fx = root.Store && root.Store.S.settings && root.Store.S.settings.fx;
    if (fx && fx.haptic === false) return;
    try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms || 12); } catch (e) { /* ignore */ }
  }
  function download(filename, content, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  async function shareFile(filename, blob, title) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: title || filename });
        return true;
      }
    } catch (e) { if (e && e.name === 'AbortError') return true; }
    download(filename, blob);
    return false;
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
      ta.remove(); return ok;
    }
  }
  /** Read numeric input value ('' -> null). */
  function numIn(el) {
    if (!el) return null;
    const v = String(el.value).trim().replace(',', '.');
    if (v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  function timeAgo(ms) {
    const d = (Date.now() - ms) / 60000;
    if (d < 1) return 'עכשיו';
    if (d < 60) return 'לפני ' + Math.round(d) + ' דק׳';
    if (d < 60 * 24) return 'לפני ' + Math.round(d / 60) + ' שע׳';
    const days = Math.round(d / 1440);
    if (days === 1) return 'אתמול';
    if (days < 30) return 'לפני ' + days + ' ימים';
    return U.fmtDate(U.epochKey(ms));
  }

  /** A shimmering placeholder while something loads (rows of lines, or cards). */
  function skeleton(n, kind) {
    return `<div class="skel-wrap" aria-busy="true" aria-label="טוען">${Array.from({ length: n || 3 }, (_, i) => kind === 'card' ? '<div class="skel skel-card"></div>' : `<div class="skel-row"><span class="skel skel-dot"></span><span class="skel-lines"><span class="skel skel-line" style="width:${70 - (i % 3) * 12}%"></span><span class="skel skel-line short"></span></span></div>`).join('')}</div>`;
  }
  /** Wrong or missing input: a message plus a shake and a short buzz. */
  function invalid(text) { toast(text); if (root.Fx) root.Fx.nope(); }
  /** An icon in a soft coloured tile (violet, mint, amber, sky, pink, orange, white). */
  const tile = (name, tint, cls) => `<span class="itile t-${tint || 'violet'} ${cls || ''}" aria-hidden="true">${icon(name)}</span>`;
  root.UI = { pushLayer, closeLayer, tile, skeleton, invalid, icon, esc, money, numv, delta, roleDot, emptyState, toast, openSheet, closeTop, closeAll, dialog, confirm, promptText, onSwipe, vibrate, download, shareFile, copyText, numIn, timeAgo, sheets };
})(typeof window !== 'undefined' ? window : globalThis);
