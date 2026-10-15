/* ============================================================
 * views-leaderboard.js — "טבלת האלופים": the games' champions table.
 *
 * Today, this week, this month, this year and all time, per game.
 * Joining is a choice: a nickname and an emoji (never the real name),
 * and Shaati Plus members pick a background for their row. Needs the
 * Google account (the table lives in Firestore, lb/{uid}; the shape and
 * the highest scores are checked by firestore.rules). The scores and
 * the period arithmetic are in core/leaderboard.js.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Store, UI, App } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const LB = root.Leaderboard;
  const PERIODS = [['d', 'היום'], ['w', 'השבוע'], ['m', 'החודש'], ['y', 'השנה'], ['a', 'כל הזמנים']];
  const SHORT = { coins: 'מטבעות', quiz: 'חשבון', facts: 'נכון/לא', pairs: 'זוגות', hours: 'שעות' };
  const LIMIT = 50;
  const Champions = {};
  root.Champions = Champions;

  let mine = null; // my row as last read or written: { uid, exists, n, e, bg, p, g }
  const boards = new Map(); // game|period|day → { at, rows }
  const Cloud = () => root.Cloud;
  const signedIn = () => !!(Cloud() && Cloud().user);
  const uid = () => Cloud().user.uid;
  const joined = () => signedIn() && !!(S.settings.lb && S.settings.lb.on);
  const plusOn = () => !!(root.Plus && root.Plus.active());
  const games = () => (App.games ? App.games.LIST : []);
  const gameOf = (id) => games().find((g) => g.id === id) || games()[0];
  const today = () => U.todayKey();
  Champions.joined = joined;

  /** What this player shows: the background only while Plus is on. */
  function profile() {
    const l = S.settings.lb || {};
    const skins = (root.Plus && root.Plus.SKINS) || {};
    return { n: l.n || '', e: LB.EMOJI.includes(l.e) ? l.e : LB.EMOJI[0], bg: plusOn() && skins[l.bg] ? l.bg : '', p: plusOn() };
  }
  async function readMine() {
    if (mine && mine.uid === uid()) return mine;
    const { fs, db } = await Cloud().sdk();
    const snap = await fs.getDoc(fs.doc(db, 'lb', uid()));
    mine = Object.assign({ uid: uid(), exists: snap.exists(), g: {} }, snap.exists() ? snap.data() : {});
    return mine;
  }
  /** Saves my row; gPatch = { game: { period: value } } (only what changed; deep-merged). */
  async function writeMine(gPatch) {
    const row = await readMine();
    const { fs, db } = await Cloud().sdk();
    const pr = profile();
    const data = { n: pr.n, e: pr.e, bg: pr.bg, p: pr.p, t: Date.now() };
    // a merge with an empty map would wipe the scores, so g goes only with something in it (or on a new row)
    if (gPatch && Object.keys(gPatch).length) data.g = gPatch;
    else if (!row.exists) data.g = {};
    await fs.setDoc(fs.doc(db, 'lb', uid()), data, { merge: true });
    Object.assign(row, data, { exists: true, g: row.g || {} });
    for (const [game, vals] of Object.entries(gPatch || {})) row.g[game] = Object.assign({}, row.g[game], vals);
    boards.clear();
  }
  /** The top of a board, from Firestore (cached for a minute). */
  async function board(game, period, fresh) {
    const key = `${game}|${period}|${today()}`;
    const c = boards.get(key);
    if (c && !fresh && Date.now() - c.at < 60000) return c.rows;
    const { fs, db } = await Cloud().sdk();
    const field = `g.${game}.${period}`;
    const r = LB.range(period, today());
    const q = r
      ? fs.query(fs.collection(db, 'lb'), fs.where(field, '>=', r[0]), fs.where(field, '<', r[1]), fs.orderBy(field, 'desc'), fs.limit(LIMIT))
      : fs.query(fs.collection(db, 'lb'), fs.orderBy(field, 'desc'), fs.limit(LIMIT));
    const snap = await fs.getDocs(q);
    const rows = snap.docs.map((d) => {
      const x = d.data() || {};
      const v = x.g && x.g[game] ? x.g[game][period] : 0;
      return { uid: d.id, n: String(x.n || ''), e: LB.EMOJI.includes(x.e) ? x.e : '🙂', bg: x.p && root.Plus && root.Plus.SKINS[x.bg] ? x.bg : '', p: !!x.p, s: period === 'a' ? +v || 0 : LB.scoreOf(v) };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    // equal scores share a place
    rows.forEach((x, i) => { x.rank = i && rows[i - 1].s === x.s ? rows[i - 1].rank : i + 1; });
    boards.set(key, { at: Date.now(), rows });
    return rows;
  }

  /**
   * After a game: saves the score where it is a new best and says where the player stands today.
   * null when not in the table (or offline).
   */
  Champions.submit = async function (game, score) {
    if (!joined() || !LB.MAX[game]) return null;
    try {
      const row = await readMine();
      const before = (boards.get(`${game}|d|${today()}`) || { rows: [] }).rows.find((x) => x.uid === uid());
      const vals = LB.improve((row.g || {})[game], game, score, today());
      if (Object.keys(vals).length) await writeMine({ [game]: vals });
      const rows = await board(game, 'd', true);
      const meRow = rows.find((x) => x.uid === uid());
      return { rank: meRow ? meRow.rank : null, before: before ? before.rank : null, improved: Object.keys(vals), of: rows.length };
    } catch (e) { return null; }
  };

  /** The line under a game's result: the place today, a new record, or an invitation. */
  Champions.afterGame = function (box, game, score) {
    if (!signedIn()) return;
    const host = box.querySelector('.gm-end-a');
    if (!host) return;
    const line = document.createElement('div');
    line.className = 'gm-rank';
    host.before(line);
    if (!joined()) {
      line.innerHTML = `<button class="btn text sm" data-lb-open>${icon('trophy', 's')} להתחרות בטבלת האלופים</button>`;
      line.querySelector('[data-lb-open]').onclick = () => Champions.open(game);
      return;
    }
    line.innerHTML = '<span class="muted">🏆 בודקים את המקום שלך…</span>';
    Champions.submit(game, score).then((r) => {
      if (!line.isConnected) return;
      if (!r) { line.remove(); return; }
      const rec = r.improved.includes('a') ? 'שיא של כל הזמנים!' : r.improved.includes('y') ? 'שיא שנתי חדש!' : r.improved.includes('m') ? 'שיא חודשי חדש!' : r.improved.includes('w') ? 'שיא שבועי חדש!' : '';
      const up = r.rank && r.before && r.rank < r.before;
      const txt = !r.rank ? 'עוד לא בטופ 50 של היום. עוד סיבוב?'
        : r.rank === 1 ? '👑 מקום ראשון היום!' : up ? `🚀 עלית למקום ${r.rank} היום!` : `🏆 מקום ${r.rank} היום`;
      line.innerHTML = `<span><b>${txt}</b>${rec ? ` · ${rec}` : ''}</span><button class="btn text sm" data-lb-open>לטבלה</button>`;
      line.querySelector('[data-lb-open]').onclick = () => Champions.open(game);
      if (r.rank === 1 && (!r.before || r.before > 1) && root.Fx) root.Fx.celebrate('big');
    });
  };

  /** A small card for the games list: the place today in the last game played. */
  Champions.hubCard = function () {
    const last = (S.meta.lbLast && LB.MAX[S.meta.lbLast]) ? S.meta.lbLast : 'coins';
    const c = boards.get(`${last}|d|${today()}`);
    const r = c && signedIn() ? c.rows.find((x) => x.uid === uid()) : null;
    const sub = !signedIn() ? 'מתחברים ומתחרים על המקום הראשון' : !joined() ? 'היום, השבוע, החודש ובכל הזמנים' : r ? `המקום שלך היום ב${SHORT[last]}: ${r.rank}` : 'מי במקום הראשון היום?';
    return `<button class="ach-card lb-card" data-lb-hub><span class="ach-card-e" aria-hidden="true">🏆</span><span class="gm-txt"><b>טבלת האלופים</b><span>${esc(sub)}</span></span>${icon('left', 's')}</button>`;
  };

  /* ---------------- the table ---------------- */
  Champions.open = function (startGame) {
    let game = LB.MAX[startGame] ? startGame : (LB.MAX[S.meta.lbLast] ? S.meta.lbLast : 'coins');
    let period = 'd';
    let seq = 0;
    const view = (el) => el.querySelector('[data-lb-body]');
    const row = (x, meId, admin, unit) => `<li class="lb-row ${x.uid === meId ? 'me' : ''} ${x.bg ? 'plus sk-' + x.bg : ''}">
        <span class="lb-r">${x.rank}</span><span class="lb-e" aria-hidden="true">${x.e}</span>
        <span class="lb-n">${esc(x.n)}${x.p ? '<i class="lb-plus">Plus</i>' : ''}${x.uid === meId ? ' <small>(את/ה)</small>' : ''}</span>
        <b class="lb-s">${x.s}${esc(unit)}</b>${admin && x.uid !== meId ? `<button class="icon-btn lb-rm" data-rm="${esc(x.uid)}" aria-label="הסרת ${esc(x.n)} מהטבלה">${icon('trash', 's')}</button>` : ''}</li>`;
    const pod = (x, place, meId, unit) => (x ? `<div class="lb-pod p${place} ${x.uid === meId ? 'me' : ''}">
        <div class="lb-av ${x.bg ? 'sk-' + x.bg : ''}"><span aria-hidden="true">${x.e}</span>${place === 1 ? '<i class="lb-crown" aria-hidden="true">👑</i>' : ''}</div>
        <b class="lb-n">${esc(x.n)}</b>${x.p ? '<i class="lb-plus">Plus</i>' : ''}<span class="lb-s">${x.s}${esc(unit)}</span><div class="lb-step"><span>${place}</span></div></div>`
      : `<div class="lb-pod p${place} empty"><div class="lb-av"><span aria-hidden="true">?</span></div><b class="lb-n">פנוי</b><div class="lb-step"><span>${place}</span></div></div>`);
    async function load(el) {
      const my = ++seq;
      const body = view(el);
      const g = gameOf(game);
      if (!signedIn()) {
        body.innerHTML = `<div class="card lb-join">${App.mascotSays ? App.mascotSays('wave', 'הטבלה שמורה בחשבון Google. מתחברים, בוחרים כינוי ומתחרים!', { size: 60 }) : ''}
          <button class="btn block" data-lb-signin>${icon('cloud', 's')} התחברות לחשבון</button></div>`;
        return;
      }
      body.innerHTML = `<div class="lb-wait">${UI.skeleton ? UI.skeleton(4) : '<span class="muted">טוען…</span>'}</div>`;
      let rows;
      try { rows = await board(game, period); } catch (e) {
        if (my !== seq) return;
        body.innerHTML = `<div class="empty"><h3>הטבלה לא נטענה</h3><div class="small muted">${navigator.onLine ? 'נסו שוב בעוד רגע' : 'אין חיבור לאינטרנט'}</div><button class="btn tonal" data-lb-retry>נסו שוב</button></div>`;
        return;
      }
      if (my !== seq || !el.isConnected) return;
      const meId = uid();
      const meRow = rows.find((x) => x.uid === meId);
      const admin = !!App.isAdmin;
      const unit = g.unit || '';
      const reset = LB.resetText(period, today(), Date.now());
      const head = `<div class="lb-reset tiny muted">${icon('clock', 's')} ${esc(reset)} · ${rows.length ? `${rows.length >= LIMIT ? '50 הראשונים' : rows.length + ' שחקנים'}` : 'עוד אין שחקנים'}</div>`;
      if (!rows.length) {
        body.innerHTML = `${head}<div class="empty fun lb-empty">${App.mascot ? App.mascot('party', { size: 84 }) : ''}<h3>המקום הראשון פנוי!</h3><div>${period === 'a' ? 'עוד אף אחד לא נכנס לטבלה במשחק הזה.' : `עוד אף אחד לא שיחק ${PERIODS.find((p) => p[0] === period)[1].replace('כל הזמנים', '')} ב"${esc(g.t)}".`}</div>
          <button class="btn" data-lb-play>${icon('play', 's')} לשחק ולתפוס אותו</button></div>`;
      } else {
        body.innerHTML = `${head}<div class="lb-podium">${pod(rows[1], 2, meId, unit)}${pod(rows[0], 1, meId, unit)}${pod(rows[2], 3, meId, unit)}</div>
          ${rows.length > 3 ? `<ol class="lb-list">${rows.slice(3).map((x) => row(x, meId, admin, unit)).join('')}</ol>` : ''}
          ${admin && rows.slice(0, 3).some((x) => x.uid !== meId) ? `<div class="lb-admin tiny muted">מנהל: ${rows.slice(0, 3).filter((x) => x.uid !== meId).map((x) => `<button class="btn text sm" data-rm="${esc(x.uid)}">הסרת ${esc(x.n)}</button>`).join('')}</div>` : ''}`;
      }
      // me: where I stand and how far the next place is
      const bar = el.querySelector('[data-lb-me]');
      if (!joined()) {
        bar.innerHTML = `<div class="lb-me-t"><b>רוצה להופיע כאן?</b><small>בוחרים כינוי ואימוג׳י, בלי שם אמיתי</small></div><button class="btn sm" data-lb-profile>${icon('trophy', 's')} הצטרפות</button>`;
      } else if (meRow) {
        const ahead = rows.filter((x) => x.s > meRow.s).pop();
        bar.innerHTML = `<div class="lb-me-t"><b>${meRow.rank === 1 ? '👑 את/ה במקום הראשון!' : `המקום שלך: ${meRow.rank}`}</b><small>${ahead ? `עוד ${ahead.s - meRow.s + 1}${esc(unit)} כדי לעקוף את ${esc(ahead.n)}` : 'תשמרו על הכתר 😎'}</small></div><button class="btn sm" data-lb-play>${icon('play', 's')} לשחק</button>`;
      } else {
        const last = rows[rows.length - 1];
        bar.innerHTML = `<div class="lb-me-t"><b>${rows.length >= LIMIT ? 'עוד לא בטופ 50' : `עוד לא שיחקת ${period === 'a' ? 'כאן' : PERIODS.find((p) => p[0] === period)[1]}`}</b><small>${rows.length >= LIMIT ? `צריך יותר מ-${last.s}${esc(unit)}` : 'משחק אחד וכבר את/ה בטבלה'}</small></div><button class="btn sm" data-lb-play>${icon('play', 's')} לשחק</button>`;
      }
    }
    function draw(el) {
      el.querySelector('[data-lb-tabs]').innerHTML = `
        <div class="chips lb-games" role="tablist" aria-label="משחק">${games().map((g) => `<button class="chip ${g.id === game ? 'on' : ''}" role="tab" aria-selected="${g.id === game}" data-game="${g.id}">${esc(SHORT[g.id] || g.t)}</button>`).join('')}</div>
        <div class="seg lb-periods" role="tablist" aria-label="תקופה">${PERIODS.map(([k, l]) => `<button class="${k === period ? 'on' : ''}" role="tab" aria-selected="${k === period}" data-period="${k}">${l}</button>`).join('')}</div>
        ${joined() ? `<button class="lb-mine" data-lb-profile>${(() => { const p = profile(); return `<span class="lb-av sm ${p.bg ? 'sk-' + p.bg : ''}"><span aria-hidden="true">${p.e}</span></span><span>${esc(p.n)}</span>`; })()}${icon('edit', 's')}<span class="vh">עריכת הכינוי</span></button>` : ''}`;
      load(el);
    }
    UI.openSheet({
      title: 'טבלת האלופים 🏆',
      full: true,
      cls: 'lb-sheet',
      body: '<div data-lb-tabs></div><div data-lb-body></div>',
      foot: '<div class="lb-me" data-lb-me></div>',
      onMount: (el) => {
        draw(el);
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.game) { game = b.dataset.game; draw(el); }
          else if (b.dataset.period) { period = b.dataset.period; draw(el); }
          else if (b.hasAttribute('data-lb-retry')) load(el);
          else if (b.hasAttribute('data-lb-profile')) Champions.profile(() => { if (el.isConnected) draw(el); });
          else if (b.hasAttribute('data-lb-signin')) { UI.closeAll(); App.go('settings'); setTimeout(() => App.sheetsApi.settingsSection('account'), 350); }
          else if (b.hasAttribute('data-lb-play')) {
            UI.closeTop();
            setTimeout(() => { if (App.games && App.games.play) App.games.play(game); }, 320);
          } else if (b.dataset.rm) {
            if (!(await UI.confirm('להסיר מהטבלה?', 'השורה של השחקן תימחק (למשל כינוי לא מתאים). הוא יוכל להצטרף שוב.', 'הסרה', true))) return;
            try { const { fs, db } = await Cloud().sdk(); await fs.deleteDoc(fs.doc(db, 'lb', b.dataset.rm)); boards.clear(); load(el); } catch (err) { UI.toast('ההסרה נכשלה'); }
          }
        });
      },
    });
  };

  /* ---------------- my nickname, emoji and background ---------------- */
  Champions.profile = function (done) {
    const l = S.settings.lb || {};
    let n = l.n || LB.randomNick(), e = LB.EMOJI.includes(l.e) ? l.e : LB.EMOJI[Math.floor(Math.random() * LB.EMOJI.length)], bg = l.bg || '';
    const skins = (root.Plus && root.Plus.SKINS) || {};
    const canBg = plusOn();
    const showBg = !!(root.Plus && (root.Plus.visible() || canBg));
    const preview = () => `<li class="lb-row me ${canBg && skins[bg] ? 'plus sk-' + bg : ''}"><span class="lb-r">1</span><span class="lb-e" aria-hidden="true">${e}</span><span class="lb-n">${esc(n || '…')}${canBg ? '<i class="lb-plus">Plus</i>' : ''}</span><b class="lb-s">120</b></li>`;
    UI.openSheet({
      title: l.on ? 'הפרופיל שלי בטבלה' : 'הצטרפות לטבלת האלופים',
      cls: 'lb-profile',
      body: `<ol class="lb-list lb-preview" aria-hidden="true">${preview()}</ol>
        <label class="field"><span class="lbl">כינוי (מופיע לכולם)</span>
          <span class="lb-nick"><input class="input" id="lb-n" maxlength="16" autocomplete="off" value="${esc(n)}"><button class="icon-btn" data-dice aria-label="כינוי אקראי">🎲</button></span>
          <span class="tiny lb-err" id="lb-err" role="alert"></span></label>
        <div class="section-title">אימוג׳י</div>
        <div class="lb-emoji" role="radiogroup" aria-label="אימוג׳י">${LB.EMOJI.map((x) => `<button role="radio" aria-checked="${x === e}" class="${x === e ? 'on' : ''}" data-e="${x}">${x}</button>`).join('')}</div>
        ${showBg ? `<div class="section-title">רקע בטבלה <span class="tag plus-tag">Plus</span></div>
          <div class="skin-pick lb-bgs">
            <button class="skin-tile ${!bg ? 'on' : ''}" data-bg="" aria-pressed="${!bg}"><b>—</b><span>בלי</span></button>
            ${Object.entries(skins).map(([k, name]) => `<button class="skin-tile sk-${k} ${bg === k ? 'on' : ''}" data-bg="${k}" aria-pressed="${bg === k}" aria-label="${name}${canBg ? '' : ' (Plus)'}"><b>${e}</b><span>${name}</span>${canBg ? '' : `<i class="skin-lock" aria-hidden="true">${icon('lock', 's')}</i>`}</button>`).join('')}
          </div>` : ''}
        <div class="tiny muted lb-note">בטבלה מופיעים רק הכינוי, האימוג׳י, הרקע והתוצאות במשחקים. לא שם אמיתי, לא מספר טלפון. אפשר לצאת מהטבלה בכל רגע, והשורה נמחקת.</div>
        <button class="btn big block" data-save>${icon('check')} ${l.on ? 'שמירה' : 'הצטרפות'}</button>
        ${l.on ? '<button class="btn text block danger" data-leave>יציאה מהטבלה</button>' : ''}`,
      onMount: (el) => {
        const input = el.querySelector('#lb-n');
        const err = el.querySelector('#lb-err');
        const redraw = () => { el.querySelector('.lb-preview').innerHTML = preview(); };
        input.addEventListener('input', () => { n = input.value; err.textContent = ''; redraw(); });
        el.addEventListener('click', async (ev) => {
          const b = ev.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-dice')) { n = LB.randomNick(); input.value = n; err.textContent = ''; redraw(); }
          else if (b.dataset.e) { e = b.dataset.e; el.querySelectorAll('[data-e]').forEach((x) => { const on = x.dataset.e === e; x.classList.toggle('on', on); x.setAttribute('aria-checked', on); }); el.querySelectorAll('.lb-bgs .skin-tile[data-bg]:not([data-bg=""]) b').forEach((x) => { x.textContent = e; }); redraw(); }
          else if (b.dataset.bg !== undefined) {
            if (b.dataset.bg && !canBg) { UI.closeTop(); setTimeout(() => root.Plus.sheet(), 320); return; }
            bg = b.dataset.bg; el.querySelectorAll('[data-bg]').forEach((x) => { const on = x.dataset.bg === bg; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); }); redraw();
          } else if (b.hasAttribute('data-save')) {
            const nick = String(input.value || '').trim().replace(/\s+/g, ' ');
            const bad = LB.nickProblem(nick);
            if (bad) { err.textContent = bad; input.focus(); return; }
            if (!signedIn()) { UI.toast('צריך להתחבר לחשבון'); return; }
            b.disabled = true;
            const wasOn = !!(S.settings.lb && S.settings.lb.on);
            await Store.setSettings((s) => { s.lb = { on: true, n: nick, e, bg }; });
            try {
              await readMine();
              // joining: the best scores already on this phone go into "all time"
              const patch = {};
              if (!wasOn) for (const [g, best] of Object.entries(S.meta.games || {})) { const v = LB.improve((mine.g || {})[g], g, best, today()); if (v.a) patch[g] = { a: v.a }; }
              await writeMine(patch);
              UI.toast(wasOn ? 'נשמר ✓' : 'ברוכים הבאים לטבלה! 🏆');
              UI.closeTop();
              if (done) done();
            } catch (x) {
              if (!wasOn) await Store.setSettings((s) => { s.lb = Object.assign({}, s.lb, { on: false }); });
              b.disabled = false;
              UI.toast(navigator.onLine ? 'השמירה נכשלה. נסו שוב' : 'אין חיבור לאינטרנט');
            }
          } else if (b.hasAttribute('data-leave')) {
            if (!(await UI.confirm('לצאת מהטבלה?', 'השורה שלך והתוצאות שבה יימחקו מהטבלה. השיאים בטלפון נשארים.', 'יציאה', true))) return;
            await Champions.forget();
            UI.closeTop();
            if (done) done();
          }
        });
      },
    });
  };

  /** Leaving the table (or deleting the account): my row goes. */
  Champions.forget = async function () {
    try {
      if (signedIn()) { const { fs, db } = await Cloud().sdk(); await fs.deleteDoc(fs.doc(db, 'lb', uid())); }
    } catch (e) { /* offline: the row stays until the next try */ }
    mine = null; boards.clear();
    if (S.settings.lb && S.settings.lb.on) await Store.setSettings((s) => { s.lb = Object.assign({}, s.lb, { on: false }); });
  };
  /** A changed profile (or Plus turning on or off) reaches the row at the next game; this sends it now. */
  Champions.sync = async function () { if (joined()) { try { await writeMine(null); } catch (e) { /* next time */ } } };
  Champions._reset = () => { mine = null; boards.clear(); };
  App.actions.leaderboard = (el) => Champions.open(el && el.dataset && el.dataset.game);
})(typeof window !== 'undefined' ? window : globalThis);
