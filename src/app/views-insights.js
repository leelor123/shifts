/* ============================================================
 * views-insights.js — notification center with history and
 * explanations, filters by category.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, UI, App } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const CATS = [['all', 'הכול'], ['summary', 'סיכומים'], ['money', 'שיאים ויעדים'], ['reminder', 'תזכורות']];

  App.actions.insights = () => {
    let cat = 'all';
    let sheetEl = null;
    const body = () => {
      const live = App.insights ? App.insights.live : [];
      const list = S.notifications.filter((n) => cat === 'all' || n.cat === cat).sort((a, b) => b.createdAt - a.createdAt);
      const unread = S.notifications.filter((n) => !n.read).length;
      // only the kinds that have something (and "all")
      const cats = CATS.filter(([k]) => k === 'all' || k === cat || S.notifications.some((n) => n.cat === k));
      return `<div class="chips">${cats.length > 2 ? cats.map(([k, l]) => `<button class="chip ${cat === k ? 'on' : ''}" data-cat="${k}">${l}</button>`).join('') : ''}</div>
        ${live.length && (cat === 'all' || cat === 'money') ? `<div class="card tonal">${live.map((a) => App.insightRow(a)).join('')}</div>` : ''}
        <div class="row-flex small" style="margin:4px 4px 8px"><span>${list.length} התראות${unread ? ` · ${unread} חדשות` : ''}</span><span class="spacer"></span>${unread ? '<button class="btn text sm" data-readall>סמן הכול כנקרא</button>' : ''}<button class="btn text sm" data-settings>${icon('settings', 's')} הגדרות</button></div>
        ${list.length ? `<div class="card" style="padding:4px 12px">${list.map((n) => `<div class="card-link" data-n="${esc(n.id)}">${App.insightRow(n, { notif: true })}</div>`).join('')}</div>`
          : UI.emptyState('bell', 'אין התראות', 'כאן יופיעו הסיכום השבועי והחודשי, שיאים ויעדים, ותזכורות חשובות בלבד.')}
        <div class="tiny muted" style="margin:10px 4px">התראות פוש: ${('Notification' in window) ? (Notification.permission === 'granted' ? 'מופעלות' : Notification.permission === 'denied' ? 'חסומות בדפדפן' : 'לא אושרו עדיין') : 'לא נתמכות'} · לכל היותר התראת חריגה אחת ביום; תזכורות קריטיות בנפרד.</div>`;
    };
    const redraw = () => { root.Dom.patch(sheetEl.querySelector('.sh-body'), body()); };
    UI.openSheet({
      title: 'התראות ותובנות', full: true, body: body(),
      onMount: (el) => {
        sheetEl = el;
        el.addEventListener('click', async (e) => {
          const c = e.target.closest('[data-cat]');
          if (c) { cat = c.dataset.cat; redraw(); return; }
          if (e.target.closest('[data-readall]')) {
            await Store.apply(S.notifications.filter((n) => !n.read).map((n) => ({ store: 'notifications', put: Object.assign({}, n, { read: true }) })), null);
            redraw(); return;
          }
          if (e.target.closest('[data-settings]')) { UI.closeTop(); setTimeout(() => App.sheetsApi.settingsSection('alerts'), 320); return; }
          const n = e.target.closest('[data-n]');
          if (n) {
            const rec = S.notifications.find((x) => x.id === n.dataset.n);
            if (!rec) return;
            if (!rec.read) { await Store.put('notifications', Object.assign({}, rec, { read: true })); redraw(); }
            App.openNote(rec, true);
          }
        });
      },
    });
  };

  /** Where a notification leads: its shift, its payslip, the month's story, the backup... The same from the list of
   *  notifications (inList: that list is open and closes first) and from a tap on the phone's notification, which opens
   *  the app with ?action=note and what the record holds (core/noteplan.js noteUrl), maybe before the app has it. */
  App.openNote = function (rec, inList) {
    const later = (fn) => { if (inList) { UI.closeTop(); setTimeout(fn, 320); } else setTimeout(fn, 300); };
    const data = rec.data || {};
    if (rec.ref && App.shift(rec.ref)) App.sheetsApi.shiftDetail(rec.ref);
    else if (rec.ref && S.payslips.find((p) => p.id === rec.ref)) App.sheetsApi.payslip(rec.ref);
    else if (rec.type === 'backup') App.doBackup(false);
    else if (rec.type === 'workweek') later(() => App.sheetsApi.settingsSection('calc'));
    else if (rec.type === 'plusend' && root.Plus) later(() => root.Plus.sheet());
    else if (rec.type === 'taxrefund') later(() => App.actions['tax-refund']({ dataset: { year: data.year } }));
    else if (rec.type === 'payslipDue') {
      // the payslip came in since (here or on another phone): its check opens, never a request to upload it again
      const pk = data.pk || String(rec.key || '').replace(/^payslip-/, '');
      const slip = root.Insights.slipFor(S.payslips, pk, S.employers[0]);
      if (slip) later(() => App.sheetsApi.payslip(slip.id)); else later(() => App.actions['payslip-new']());
    }
    else if (rec.type === 'monthly' && App.recap && data.pk) later(() => App.recap.open(data.pk));
    else if (!inList) later(() => App.actions.insights()); // a summary, a record, a goal: the list, where it is explained
    // read: the record (when the app has it already) is marked as such
    const known = S.notifications.find((x) => x.key === rec.key || x.id === rec.key);
    if (!inList && known && !known.read) Store.put('notifications', Object.assign({}, known, { read: true })).catch(() => {});
  };

  App.actions['weekly-share'] = (el) => {
    const n = S.notifications.find((x) => x.id === el.dataset.id);
    if (!n || !n.data) return;
    const { from, to } = n.data;
    const t = root.Engine.rangeSummary(App.model, from, to);
    const p = root.Engine.rangeSummary(App.model, U.addDays(from, -7), U.addDays(to, -7));
    App.exporter.summaryImage({ from, to, label: `השבוע \u2066${U.fmtDate(from, 'dm')}\u2060–\u2060${U.fmtDate(to, 'dm')}\u2069` }, t, p, n.body);
  };
})(typeof window !== 'undefined' ? window : globalThis);
