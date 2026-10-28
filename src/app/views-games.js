/* ============================================================
 * views-games.js — five short games about money and work:
 *  - "תופסים מטבעות": drag the wallet, catch coins and notes, dodge
 *    the fines (a 40-second canvas arcade, sprites drawn once, one
 *    requestAnimationFrame loop that stops when the sheet closes or
 *    the app goes to the background);
 *  - "כמה זה יוצא?": quick pay arithmetic against the clock;
 *  - "נכון או לא?": true or false about workers' rights, with the
 *    explanation after every answer;
 *  - "זוגות": a memory game that pairs payslip words with their meaning;
 *  - "כמה שעות זה?": higher or lower, in hours of the player's own work.
 * The content lives in core/games.js; best scores in meta.games.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Store, UI, App, Games } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const Fx = () => root.Fx;
  const play = (s, o) => { if (Fx()) Fx().play(s, o); };
  const buzz = (p) => { if (Fx()) Fx().haptic(p); };
  const step = (n) => (Fx() && Fx().step ? Fx().step(n) : 1); // a streak climbs a scale
  // the sparks, glows and banners of a game sheet (gamefx.js); a silent stand-in if it is missing
  const NOFX = { at: () => [0, 0], burst() {}, ring() {}, text() {}, glow() {}, banner() {}, close() {} };
  const attachFx = (sheet) => (root.GameFx ? root.GameFx.attach(sheet) : NOFX);
  const STREAKS = [3, 5, 7, 10, 15, 20];

  const LIST = [
    { id: 'coins', ic: 'wallet', tint: 'amber', t: 'תופסים מטבעות', s: 'גוררים את הארנק, תופסים כסף ומתחמקים מקנסות.', unit: ' ₪' },
    { id: 'quiz', ic: 'calc', tint: 'violet', t: 'כמה זה יוצא?', s: 'חשבון מהיר של שכר, שעות נוספות ושבתות.', unit: ' נק׳' },
    { id: 'facts', ic: 'shield', tint: 'mint', t: 'נכון או לא?', s: 'בודקים כמה מכירים את הזכויות בעבודה.', unit: '/10' },
    { id: 'pairs', ic: 'layers', tint: 'pink', t: 'זוגות', s: 'משחק זיכרון: מילה מהתלוש ומה היא אומרת.', unit: ' נק׳' },
    { id: 'hours', ic: 'clock', tint: 'sky', t: 'כמה שעות זה?', s: 'יותר או פחות? מחירים בשעות של העבודה שלך.', unit: ' ברצף' },
  ];
  const best = (id) => +((S.meta.games || {})[id]) || 0;
  /** Saves a score; true when it beats the previous best. */
  function record(id, score) {
    if (!(score > best(id))) return false;
    Store.setMeta({ games: Object.assign({}, S.meta.games || {}, { [id]: score }) }).catch(() => {});
    return true;
  }
  function myRate() {
    const role = App.roles()[0];
    const r = role ? Engine.roleRate(role, U.todayKey()) : 0;
    return r > 0 ? r : 0;
  }
  const adultMinWage = () => {
    const today = U.todayKey();
    try { return Engine.legalMinWage(today, `${+today.slice(0, 4) - 30}-01-01`).hourly; } catch (e) { return 0; }
  };
  const seed = () => (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;

  /* ---------------- medals ----------------
   * Earned from real work (shift counts, money, a Shabbat or night shift, a 4-week streak),
   * from using the app well (a payslip check, the rights screen) and from the games.
   * Worked out live from the data, so they are never out of date. */
  /* ---------------- a daily streak of playing ----------------
   * A round finished on a day counts that day; a day missed starts again from 1. Kept on the phone
   * (meta.gameDays: the last day, the streak, the best streak). */
  function markPlayDay() {
    const today = U.todayKey();
    const d = S.meta.gameDays || {};
    if (d.last === today) return { n: d.n || 1, grew: false };
    const n = d.last === U.addDays(today, -1) ? (d.n || 0) + 1 : 1;
    Store.setMeta({ gameDays: { last: today, n, best: Math.max(n, d.best || 0) } }).catch(() => {});
    return { n, grew: true };
  }
  /** The streak as it stands: alive if the last day played is today or yesterday. */
  function playStreak() {
    const d = S.meta.gameDays || {};
    const t = U.todayKey();
    return { n: d.last === t || d.last === U.addDays(t, -1) ? d.n || 0 : 0, today: d.last === t, best: d.best || 0 };
  }
  App.gameStreak = playStreak;
  function bestStreak(keys) {
    const ws = S.settings.weekStart || 0;
    const weeks = [...new Set(keys.map((k) => U.weekStart(k, ws)))].sort();
    let best = 0, run = 0, prev = null;
    for (const w of weeks) { run = prev && U.addDays(prev, 7) === w ? run + 1 : 1; best = Math.max(best, run); prev = w; }
    return best;
  }
  function achievements() {
    const done = [...App.model.results.values()].filter((r) => r.status === 'done');
    const n = done.length;
    const earned = done.reduce((s, r) => s + (r.total || 0), 0);
    const streak = bestStreak(done.map((r) => r.dateKey));
    const g = (id) => best(id);
    const count = (cur, goal) => ({ cur: Math.min(cur, goal), goal });
    const money = (v) => U.money(v, 0);
    return [
      ['first', '🥇', 'משמרת ראשונה', 'רושמים משמרת אחת', n >= 1, count(n, 1)],
      ['s10', '🔟', '10 משמרות', 'עשר משמרות רשומות', n >= 10, count(n, 10)],
      ['s25', '🎖️', '25 משמרות', 'עשרים וחמש משמרות רשומות', n >= 25, count(n, 25)],
      ['s50', '🏅', '50 משמרות', 'חמישים משמרות רשומות', n >= 50, count(n, 50)],
      ['s100', '💯', '100 משמרות', 'מאה משמרות רשומות', n >= 100, count(n, 100)],
      ['s250', '👑', '250 משמרות', 'מאתיים וחמישים משמרות רשומות', n >= 250, count(n, 250)],
      ['e1k', '💵', money(1000), 'הרווחת יותר מ-' + money(1000) + ' מאז שהתחלת לרשום', earned >= 1000, count(Math.round(earned), 1000)],
      ['e5k', '💰', money(5000), 'הרווחת יותר מ-' + money(5000), earned >= 5000, count(Math.round(earned), 5000)],
      ['e10k', '🤑', money(10000), 'הרווחת יותר מ-' + money(10000), earned >= 10000, count(Math.round(earned), 10000)],
      ['e25k', '🏦', money(25000), 'הרווחת יותר מ-' + money(25000), earned >= 25000, count(Math.round(earned), 25000)],
      ['streak', '🔥', '4 שבועות ברצף', 'לפחות משמרת אחת בכל שבוע, ארבעה שבועות רצופים', streak >= 4, count(streak, 4)],
      ['shabbat', '🕯️', 'שבת או חג', 'משמרת עם שעות שבת או חג. כדאי לוודא שקיבלת עליהן תוספת', done.some((r) => r.restHours > 0)],
      ['night', '🌙', 'משמרת לילה', 'משמרת שרובה בלילה', done.some((r) => r.isNightShift)],
      ['slip', '🧾', 'בדיקת תלוש', 'בודקים תלוש שכר מול המשמרות', S.payslips.length > 0],
      ['rights', '🛡️', 'הזכויות שלי', 'נכנסים למסך הזכויות ובודקים מה מגיע', !!S.meta.usedRights],
      ['games', '🎮', 'שלושה משחקים', 'משחקים ב"תופסים מטבעות", "כמה זה יוצא?" ו"נכון או לא?"', g('coins') > 0 && g('quiz') > 0 && g('facts') > 0],
      ['allgames', '🕹️', 'כל המשחקים', 'משחקים בכל חמשת המשחקים', LIST.every((x) => g(x.id) > 0), count(LIST.filter((x) => g(x.id) > 0).length, LIST.length)],
      ['coins', '🪙', 'תופסי כסף', 'אוספים ' + money(300) + ' ב"תופסים מטבעות"', g('coins') >= 300, count(g('coins'), 300)],
      ['quiz', '🧠', 'אלופי חשבון', '150 נקודות ב"כמה זה יוצא?"', g('quiz') >= 150, count(g('quiz'), 150)],
      ['facts', '⚖️', 'מומחי זכויות', '10 מתוך 10 ב"נכון או לא?"', g('facts') >= 10, count(g('facts'), 10)],
      ['pairs', '🧩', 'זיכרון של פיל', '100 נקודות ב"זוגות"', g('pairs') >= 100, count(g('pairs'), 100)],
      ['hours', '⏱️', 'יודעים מה שווה כסף', '8 ברצף ב"כמה שעות זה?"', g('hours') >= 8, count(g('hours'), 8)],
      ['play3', '🔥', 'שלושה ימים של משחק', 'משחקים לפחות סיבוב אחד ביום, שלושה ימים ברצף', playStreak().best >= 3, count(playStreak().best, 3)],
      ['play7', '⚡', 'שבוע של משחק', 'סיבוב אחד ביום, שבעה ימים ברצף', playStreak().best >= 7, count(playStreak().best, 7)],
      ['play30', '🌟', 'חודש של משחק', 'סיבוב אחד ביום, שלושים ימים ברצף', playStreak().best >= 30, count(playStreak().best, 30)],
    ].map(([id, emoji, title, how, on, prog]) => ({ id, emoji, title, how, on: !!on, prog }));
  }
  function medalsSheet() {
    const list = achievements();
    const got = list.filter((a) => a.on).length;
    UI.openSheet({
      title: 'המדליות שלי',
      body: `<div class="ach-head"><b>${got} מתוך ${list.length}</b><div class="progress thin"><i style="width:${(got / list.length) * 100}%"></i></div></div>
        <div class="ach-grid">${list.map((a, k) => `<button class="ach ${a.on ? 'on' : ''}" data-ach="${a.id}" style="--k:${k}">
          <span class="ach-e" aria-hidden="true">${a.emoji}</span><b>${esc(a.title)}</b>
          <small>${a.on ? 'הושג' : a.prog && a.prog.goal > 1 ? `${a.prog.cur.toLocaleString('en-US')} מתוך ${a.prog.goal.toLocaleString('en-US')}` : 'עוד לא'}</small></button>`).join('')}</div>`,
      onMount: (el) => el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ach]');
        if (!b) return;
        const a = list.find((x) => x.id === b.dataset.ach);
        UI.toast((a.on ? '✓ ' : '🔒 ') + a.how);
      }),
    });
  }
  App.achievements = achievements;

  /* ---------------- the hub ---------------- */
  const cards = () => LIST.map((g) => `<button class="gm-card" data-game="${g.id}">${UI.tile(g.ic, g.tint)}
    <span class="gm-txt"><b>${g.t}</b><span>${g.s}</span></span>
    <span class="gm-best">${best(g.id) ? `<small>שיא</small>${best(g.id)}${g.unit}` : '<small>חדש</small>'}</span></button>`).join('');
  App.actions.games = () => {
    UI.openSheet({
      title: 'משחקים',
      cls: 'games-sheet',
      body: `${App.mascotSays ? App.mascotSays('party', 'הפסקה קטנה? כל משחק לוקח פחות מדקה.', { size: 64 }) : ''}${(() => {
          const st = playStreak();
          if (!st.n) return '';
          return `<div class="gm-streak-bar ${st.today ? 'on' : ''}"><span aria-hidden="true">🔥</span><b>${st.n === 1 ? 'יום אחד ברצף' : `${st.n} ימים ברצף`}</b><small>${st.today ? 'שיחקת היום. נתראה מחר!' : 'סיבוב אחד היום שומר על הרצף'}</small></div>`;
        })()}<div class="gm-list">${cards()}</div>
        ${root.Champions ? root.Champions.hubCard() : ''}
        ${root.FriendsView ? root.FriendsView.hubCard() : ''}
        <button class="ach-card" data-medals>${(() => { const l = achievements(); const got = l.filter((a) => a.on).length; return `<span class="ach-card-e" aria-hidden="true">🏅</span><span class="gm-txt"><b>המדליות שלי</b><span>${got} מתוך ${l.length} · על משמרות, כסף, תלושים ומשחקים</span></span>${icon('left', 's')}`; })()}</button>`,
      onMount: (el) => {
        el.querySelector('[data-medals]').onclick = medalsSheet;
        const hub = el.querySelector('[data-lb-hub]');
        if (hub) hub.onclick = () => root.Champions.open();
        const fr = el.querySelector('[data-fr-hub]');
        if (fr) fr.onclick = () => root.FriendsView.open();
        if (root.Champions) root.Champions.warm(el);
        const list = el.querySelector('.gm-list');
        list.addEventListener('click', (e) => {
          const b = e.target.closest('[data-game]');
          if (!b) return;
          const done = () => { if (list.isConnected) list.innerHTML = cards(); };
          playGame(b.dataset.game, done);
        });
      },
    });
  };

  /** Opens a game by its id (also from the champions table); notes it as the last one played. */
  function playGame(id, onDone) {
    const open = { coins: coinGame, quiz: quizGame, facts: factsGame, pairs: pairsGame, hours: hoursGame }[id];
    if (!open) return;
    if (S.meta.lbLast !== id) Store.setMeta({ lbLast: id }).catch(() => {});
    open(() => { if (root.Music) root.Music.stop(); if (onDone) onDone(); });
    // the game's music, and its note button next to the close button
    const sh = [...document.querySelectorAll('.sheet')].pop();
    const head = sh && sh.querySelector('.sh-head');
    if (root.Music && head && !head.querySelector('.gm-music')) {
      const b = document.createElement('button');
      b.className = 'icon-btn gm-music';
      const paint = () => { const on = root.Music.enabled(); b.innerHTML = icon(on ? 'music' : 'musicOff'); b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'מוזיקה פועלת' : 'מוזיקה כבויה'); };
      paint();
      b.onclick = async () => { await root.Music.toggle(); paint(); };
      head.insertBefore(b, head.querySelector('[data-close]'));
      root.Music.play(id);
    }
  }

  /** The end of a round: rays behind the mascot, the score counting up, up to three stars, best, play again. */
  function endScreen(box, o) {
    const fx = o.fx || NOFX;
    const isBest = record(o.id, o.score);
    const mood = o.ratio >= 0.8 ? 'party' : o.ratio >= 0.5 ? 'happy' : 'think';
    const stars = o.score > 0 ? (o.ratio >= 0.9 ? 3 : o.ratio >= 0.6 ? 2 : o.ratio >= 0.3 ? 1 : 0) : 0;
    box.innerHTML = `<div class="gm-end"><div class="gm-hero"><span class="gm-rays ${isBest && o.score > 0 ? 'best' : ''}" aria-hidden="true"></span>${App.mascot ? App.mascot(mood, { size: 96 }) : ''}</div>
      <div class="gm-end-t">${esc(o.title)}</div>
      <div class="gm-stars" role="img" aria-label="${stars} כוכבים מתוך 3"><i></i><i></i><i></i></div>
      <div class="gm-end-n">${o.big}</div>
      ${o.sub ? `<div class="gm-end-s">${o.sub}</div>` : ''}
      <div class="gm-end-b ${isBest && o.score > 0 ? 'best' : ''}">${isBest ? `${icon('star', 's')} שיא חדש!` : `השיא שלך: ${best(o.id)}${o.unit}`}</div>
      <div class="gm-end-a"><button class="btn" data-again>${icon('repeat')} עוד סיבוב</button><button class="btn tonal" data-quit>סיום</button></div></div>`;
    // the daily streak: a new day of playing shows (and the big ones are celebrated)
    const day = markPlayDay();
    if (day.grew && day.n >= 2) {
      box.querySelector('.gm-end-b').insertAdjacentHTML('afterend', `<div class="gm-streak">🔥 רצף של ${day.n} ימים!${[3, 7, 30].includes(day.n) ? ' מדליה חדשה 🏅' : ''}</div>`);
    }
    const party = isBest && o.score > 0 || (day.grew && [3, 7, 30].includes(day.n));
    // the score counts up, then the stars light one by one; a record (or a big streak) ends in a fanfare and confetti
    const n = box.querySelector('.gm-end-n');
    play('pop');
    (root.GameFx ? root.GameFx.countUp(n) : Promise.resolve()).then(() => {
      if (!n.isConnected) return;
      if (root.GameFx) root.GameFx.stars(box.querySelector('.gm-stars'), stars, fx);
      if (!party) return;
      setTimeout(() => {
        if (!n.isConnected) return;
        play('fanfare'); buzz([12, 60, 18]);
        const [x, y] = fx.at(n);
        fx.burst(x, y, { n: 70, palette: 'party', kinds: ['confetti', 'star', 'coin', 'confetti'], speed: [260, 700], up: 260 });
        fx.ring(x, y, { color: '#ffb524', r1: 160, width: 9 });
      }, 120 + stars * 300);
    });
    if (root.Champions && o.score > 0) root.Champions.afterGame(box, o.id, o.score); // the champions table
    if (root.Music) root.Music.stop(0.6); // the round is over: the music fades
    box.querySelector('[data-again]').onclick = () => { if (root.Music) root.Music.play(o.id); o.again(); };
    box.querySelector('[data-quit]').onclick = () => UI.closeTop();
  }

  /* ---------------- 1. coin catcher ---------------- */
  const ROUND = 40;
  function coinGame(onDone) {
    let stop = () => {};
    UI.openSheet({
      title: 'תופסים מטבעות',
      full: true,
      cls: 'game-sheet gs-coins',
      body: `<div class="cg">
        <div class="cg-hud"><span class="cg-score" data-score>0 ₪</span><span class="cg-lives" data-lives aria-label="3 לבבות">${'<i></i>'.repeat(3)}</span><span class="cg-time" data-time>${ROUND}</span></div>
        <div class="cg-stage" data-no-ptr><canvas aria-label="המשחק"></canvas><div class="cg-over" data-over></div></div></div>`,
      onMount: (el) => { stop = runCoins(el, attachFx(el)); },
      onClose: () => { stop(); onDone(); },
    });
  }
  function runCoins(el, fx) {
    const stage = el.querySelector('.cg-stage');
    const cv = stage.querySelector('canvas');
    const g = cv.getContext('2d');
    const over = el.querySelector('[data-over]');
    const hudScore = el.querySelector('[data-score]'), hudTime = el.querySelector('[data-time]'), hudLives = el.querySelector('[data-lives]');
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    let W = 0, H = 0, raf = 0, last = 0, alive = true, paused = false;
    const rate = myRate();

    /* sprites: drawn once, then only copied */
    function sprite(w, h, draw) {
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
      const x = c.getContext('2d');
      x.scale(dpr, dpr);
      draw(x, w, h);
      return c;
    }
    const rr = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };
    const FONT = (px) => `700 ${px}px Fredoka, Rubik, system-ui, sans-serif`;
    function coin(r, light, dark, label) {
      return sprite(r * 2 + 4, r * 2 + 4, (x) => {
        const c = r + 2;
        const grd = x.createRadialGradient(c - r * 0.4, c - r * 0.4, r * 0.2, c, c, r);
        grd.addColorStop(0, light); grd.addColorStop(1, dark);
        x.fillStyle = grd; x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.fill();
        x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1.5; x.stroke();
        x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.2; x.beginPath(); x.arc(c, c, r - 3.5, 0, Math.PI * 2); x.stroke();
        x.fillStyle = 'rgba(40,30,0,.78)'; x.font = FONT(r * 0.95); x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(label, c, c + 1);
      });
    }
    function note(w, h, light, dark, label) {
      return sprite(w + 4, h + 4, (x) => {
        const grd = x.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, light); grd.addColorStop(1, dark);
        x.fillStyle = grd; rr(x, 2, 2, w, h, 5); x.fill();
        x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 1.2; rr(x, 5, 5, w - 6, h - 6, 3); x.stroke();
        x.fillStyle = '#fff'; x.font = FONT(h * 0.55); x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(label, 2 + w / 2, 3 + h / 2);
      });
    }
    const SPR = {
      c1: { img: coin(14, '#f4f6fa', '#9aa3b5', '1'), r: 14 },
      c5: { img: coin(16, '#f4f6fa', '#8c96ab', '5'), r: 16 },
      c10: { img: coin(18, '#ffe08a', '#d99a0b', '10'), r: 18 },
      b20: { img: note(52, 28, '#ff8a8a', '#d23c3c', '20₪'), r: 20 },
      b50: { img: note(52, 28, '#6fdc9b', '#1f9a59', '50₪'), r: 20 },
      clock: { img: sprite(36, 36, (x) => { x.fillStyle = '#3b82f6'; x.beginPath(); x.arc(18, 18, 16, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; x.font = FONT(13); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('+5', 18, 19); }), r: 16 },
      fine: { img: sprite(44, 44, (x) => { x.fillStyle = '#e5484d'; rr(x, 3, 3, 38, 38, 10); x.fill(); x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 1.5; rr(x, 6, 6, 32, 32, 7); x.stroke(); x.fillStyle = '#fff'; x.font = FONT(12.5); x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'; x.fillText('קנס', 22, 23); }), r: 18 },
    };
    const PW = 86, PH = 50;
    const wallet = sprite(PW, PH, (x) => {
      const grd = x.createLinearGradient(0, 0, 0, PH);
      grd.addColorStop(0, '#8b5cf6'); grd.addColorStop(1, '#5b21b6');
      x.fillStyle = grd; rr(x, 2, 8, PW - 4, PH - 10, 12); x.fill();
      x.fillStyle = 'rgba(255,255,255,.16)'; rr(x, 2, 8, PW - 4, 16, 12); x.fill();
      x.fillStyle = '#4c1d95'; rr(x, PW - 34, 18, 32, 18, 8); x.fill();
      x.fillStyle = '#fbbf24'; x.beginPath(); x.arc(PW - 18, 27, 5, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(0,0,0,.25)'; rr(x, 14, 2, PW - 28, 8, 4); x.fill();
    });

    // a soft golden halo, drawn once, put under the valuable things and the wallet
    const HALO = sprite(64, 64, (x) => { const h = x.createRadialGradient(32, 32, 2, 32, 32, 32); h.addColorStop(0, 'rgba(255,214,90,.75)'); h.addColorStop(0.45, 'rgba(255,181,36,.28)'); h.addColorStop(1, 'rgba(255,181,36,0)'); x.fillStyle = h; x.fillRect(0, 0, 64, 64); });

    const st = { t: 0, left: ROUND, score: 0, lives: 3, items: [], floats: [], parts: [], chain: 0, px: 0, tx: 0, next: 0.5, shake: 0, flash: 0, squash: 0, running: false, r: Games.rng(seed()) };
    let shownScore = -1, shownTime = -1, shownLives = -1;
    function hud() {
      if (st.score !== shownScore) { shownScore = st.score; hudScore.textContent = st.score + ' ₪'; hudScore.classList.remove('bump'); void hudScore.offsetWidth; hudScore.classList.add('bump'); }
      const tl = Math.max(0, Math.ceil(st.left));
      if (tl !== shownTime) {
        shownTime = tl; hudTime.textContent = tl; hudTime.classList.toggle('low', tl <= 5);
        if (st.running && tl <= 5 && tl > 0) play('alarm'); // the last seconds tick
      }
      if (st.lives !== shownLives) { shownLives = st.lives; hudLives.innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < st.lives ? '' : 'off'}"></i>`).join(''); hudLives.setAttribute('aria-label', st.lives + ' לבבות'); }
    }
    /* the night sky behind the game: a deep gradient, a city skyline with lit windows, and stars that twinkle
       (the sky and the city are drawn once per size; only the stars change) */
    let bg = null, stars = [];
    function paintBg() {
      const rr2 = Games.rng(7);
      bg = sprite(W, H, (x) => {
        const sky = x.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#120d36'); sky.addColorStop(0.55, '#2e1a6b'); sky.addColorStop(1, '#5b21b6');
        x.fillStyle = sky; x.fillRect(0, 0, W, H);
        const moon = x.createRadialGradient(W * 0.82, H * 0.13, 4, W * 0.82, H * 0.13, 70);
        moon.addColorStop(0, 'rgba(255,240,200,.55)'); moon.addColorStop(0.25, 'rgba(255,240,200,.12)'); moon.addColorStop(1, 'rgba(255,240,200,0)');
        x.fillStyle = moon; x.fillRect(0, 0, W, H);
        x.fillStyle = '#fff3cf'; x.beginPath(); x.arc(W * 0.82, H * 0.13, 13, 0, Math.PI * 2); x.fill();
        const glow = x.createRadialGradient(W / 2, H, 10, W / 2, H, H * 0.65);
        glow.addColorStop(0, 'rgba(255,181,36,.32)'); glow.addColorStop(1, 'rgba(255,181,36,0)');
        x.fillStyle = glow; x.fillRect(0, 0, W, H);
        for (let bx = -10; bx < W; ) { // the skyline
          const bw = 26 + rr2() * 34, bh = 40 + rr2() * 90;
          x.fillStyle = 'rgba(14, 8, 40, .72)'; x.fillRect(bx, H - bh, bw, bh);
          x.fillStyle = 'rgba(255, 214, 120, .5)';
          for (let wy = H - bh + 8; wy < H - 10; wy += 11) for (let wx = bx + 5; wx < bx + bw - 6; wx += 9) if (rr2() < 0.32) x.fillRect(wx, wy, 3.5, 5);
          bx += bw + 3;
        }
      });
      stars = Array.from({ length: 44 }, () => ({ x: rr2() * W, y: rr2() * H * 0.72, r: 0.6 + rr2() * 1.4, ph: rr2() * 6, sp: 1 + rr2() * 2.5 }));
    }
    function size() {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBg();
      st.px = st.tx = Math.min(Math.max(st.tx || W / 2, PW / 2), W - PW / 2);
      if (!st.running) draw();
    }
    const ro = new ResizeObserver(size);
    ro.observe(stage);

    function spawn() {
      const d = Games.coinDrop(st.r, st.t);
      const sp = SPR[d.k];
      const pace = Games.coinPace(st.t);
      const bill = d.k[0] === 'b';
      st.items.push({ d, sp, x: sp.r + 6 + st.r() * (W - sp.r * 2 - 12), y: -sp.r - 4, vy: pace.speed * (bill ? 0.7 : 0.85 + st.r() * 0.3), rot: 0, ph: st.r() * 6, sway: bill ? 1 + st.r() * 5 : 0 });
    }
    function floatText(x, y, text, color, size) { st.floats.push({ x, y, text, color, size: size || 20, life: 0.85, max: 0.85 }); }
    /* sparks (short streaks), bits of confetti and shock rings, all inside the stage; with motion off, none */
    const FX_ON = () => Fx() && Fx().motion();
    function sparks(x, y, n, colors, o) {
      if (!FX_ON()) return;
      o = o || {};
      for (let i = 0; i < n; i++) {
        const a = (o.dir != null ? o.dir : -Math.PI / 2) + (Math.random() - 0.5) * (o.spread || Math.PI * 2);
        const v = (o.v || 260) * (0.4 + Math.random() * 0.8);
        st.parts.push({ k: o.k || 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.4, r: o.r || (1.6 + Math.random() * 1.8), c: colors[(Math.random() * colors.length) | 0], g: o.g != null ? o.g : 420 });
      }
    }
    function ringAt(x, y, c, r1) { if (FX_ON()) st.parts.push({ k: 'ring', x, y, life: 0, max: 0.4, r1: r1 || 46, c }); }
    const GOLD = ['#ffd84d', '#ffb524', '#fff1b8', '#ffffff'], RED = ['#ff4d5e', '#ff8a3d', '#ffd166', '#ffffff'], BLUE = ['#7cc4ff', '#3b82f6', '#ffffff'];
    function catchIt(it) {
      st.squash = 1;
      const cy = H - PH - 10;
      if (it.d.bad) {
        st.lives--; st.shake = 0.35; st.flash = 0.35; st.chain = 0;
        floatText(it.x, it.y - 6, '−❤', '#ff6b78', 24);
        sparks(it.x, cy, 28, RED, { v: 380 }); sparks(it.x, cy, 10, ['#5b5470', '#3a3450'], { v: 120, g: -60, r: 4, k: 'smoke' });
        ringAt(it.x, cy, '#ff4d5e', 70);
        play('boom'); buzz([30, 40, 30]); fx.glow('bad');
        if (st.lives <= 0) end('lives');
      } else if (it.d.k === 'clock') {
        st.left += 5; floatText(it.x, it.y, '+5 שנ׳', '#9fd2ff', 22);
        sparks(it.x, cy, 16, BLUE, { v: 240 }); ringAt(it.x, cy, '#7cc4ff');
        play('on'); buzz(10);
      } else {
        st.chain++;
        const big = it.d.v >= 10;
        st.score += it.d.v; floatText(it.x, it.y, '+' + it.d.v, big ? '#ffd84d' : '#ffffff', big ? 26 : 20);
        sparks(it.x, cy, big ? 22 : 10, GOLD, { v: big ? 320 : 220, spread: 2.2 });
        if (big) ringAt(it.x, cy, '#ffd84d', 58);
        // the catch sound climbs while the catches keep coming (a missed coin starts it again)
        play('coin', { pitch: 0.82 + Math.min(st.chain, 14) * 0.035 }); buzz(big ? 12 : 6);
        if (big) play('star', { pitch: 1.2 });
        if (st.chain >= 10 && st.chain % 10 === 0) fx.banner(`🔥 ${st.chain} ברצף!`);
      }
    }
    function update(dt) {
      st.t += dt; st.left -= dt;
      if (st.left <= 0) { st.left = 0; end('time'); return; }
      st.next -= dt;
      if (st.next <= 0) { spawn(); st.next = Games.coinPace(st.t).every * (0.7 + st.r() * 0.6); }
      st.px += (st.tx - st.px) * (1 - Math.exp(-dt * 24));
      const py = H - PH / 2 - 14;
      for (let i = st.items.length - 1; i >= 0; i--) {
        const it = st.items[i];
        it.y += it.vy * dt; it.rot = Math.sin(st.t * 2.6 + it.ph) * 0.32; // a wobble, never upside down
        if (it.sway) it.x += Math.sin(st.t * 3 + it.sway) * 30 * dt;
        // the valuable ones leave a trail of little sparks
        if ((it.d.v >= 10 || it.d.k === 'clock') && FX_ON() && Math.random() < dt * 22) st.parts.push({ k: 'spark', x: it.x + (Math.random() - 0.5) * it.sp.r, y: it.y - it.sp.r * 0.6, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0, max: 0.35, r: 1.4 + Math.random(), c: it.d.k === 'clock' ? '#9fd2ff' : '#ffe08a', g: 0 });
        const hit = Math.abs(it.x - st.px) < PW / 2 + it.sp.r * 0.5 && it.y + it.sp.r * 0.6 > py - PH / 2 && it.y - it.sp.r < py + PH / 3;
        if (hit) { catchIt(it); st.items[i] = st.items[st.items.length - 1]; st.items.pop(); if (!st.running) return; continue; }
        if (it.y > H + 40) { if (!it.d.bad && it.d.k !== 'clock') st.chain = 0; st.items[i] = st.items[st.items.length - 1]; st.items.pop(); }
      }
      for (let i = st.floats.length - 1; i >= 0; i--) { const f = st.floats[i]; f.life -= dt; f.y -= 70 * dt; if (f.life <= 0) st.floats.splice(i, 1); }
      for (let i = st.parts.length - 1; i >= 0; i--) {
        const p = st.parts[i];
        p.life += dt;
        if (p.life >= p.max) { st.parts[i] = st.parts[st.parts.length - 1]; st.parts.pop(); continue; }
        if (p.k === 'ring') continue;
        p.vy += p.g * dt; p.vx *= Math.pow(0.9, dt * 60); p.vy *= Math.pow(0.94, dt * 60);
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      st.shake = Math.max(0, st.shake - dt); st.flash = Math.max(0, st.flash - dt); st.squash = Math.max(0, st.squash - dt * 5);
    }
    function draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (bg) g.drawImage(bg, 0, 0, W, H); else g.clearRect(0, 0, W, H);
      g.fillStyle = '#fff';
      for (const s of stars) { g.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin(st.t * s.sp + s.ph)); g.fillRect(s.x, s.y, s.r, s.r); }
      g.globalAlpha = 1;
      if (st.shake) g.translate((Math.random() - 0.5) * 12 * st.shake / 0.35, (Math.random() - 0.5) * 7 * st.shake / 0.35);
      for (const it of st.items) {
        const s = it.sp.img, w = s.width / dpr, h = s.height / dpr;
        if (it.d.v >= 10 || it.d.k === 'clock') { // a halo that breathes
          const hr = it.sp.r * (2.6 + 0.35 * Math.sin(st.t * 6 + it.ph));
          g.globalAlpha = it.d.k === 'clock' ? 0.55 : 0.9; g.drawImage(HALO, it.x - hr, it.y - hr, hr * 2, hr * 2); g.globalAlpha = 1;
        }
        g.save(); g.translate(it.x, it.y); g.rotate(it.rot); g.drawImage(s, -w / 2, -h / 2, w, h); g.restore();
      }
      const py = H - PH / 2 - 14;
      const sq = st.squash;
      if (sq) { const hr = PW * (0.7 + sq * 0.5); g.globalAlpha = sq; g.drawImage(HALO, st.px - hr, py - hr * 0.8, hr * 2, hr * 1.6); g.globalAlpha = 1; }
      g.save(); g.translate(st.px, py); g.scale(1 + sq * 0.12, 1 - sq * 0.12); g.drawImage(wallet, -PW / 2, -PH / 2, PW, PH); g.restore();
      for (const p of st.parts) {
        const k = p.life / p.max;
        g.globalAlpha = 1 - k;
        if (p.k === 'ring') {
          g.strokeStyle = p.c; g.lineWidth = 5 * (1 - k) + 0.5;
          g.beginPath(); g.arc(p.x, p.y, 8 + (p.r1 - 8) * (1 - Math.pow(1 - k, 3)), 0, Math.PI * 2); g.stroke();
        } else if (p.k === 'smoke') {
          g.globalAlpha = 0.5 * (1 - k); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r * (1 + k * 2.5), 0, Math.PI * 2); g.fill();
        } else {
          const len = Math.min(12, 2 + Math.hypot(p.vx, p.vy) * 0.03);
          const a = Math.atan2(p.vy, p.vx);
          g.strokeStyle = p.c; g.lineWidth = p.r; g.lineCap = 'round';
          g.beginPath(); g.moveTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len); g.lineTo(p.x, p.y); g.stroke();
        }
      }
      g.globalAlpha = 1;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const f of st.floats) {
        const k = 1 - f.life / f.max, s = 1 + 0.4 * Math.max(0, 1 - k * 6); // pops in big, then floats away
        g.globalAlpha = Math.min(1, f.life / 0.35);
        g.font = FONT(f.size * s); g.lineWidth = 4; g.strokeStyle = 'rgba(20, 10, 50, .75)';
        g.strokeText(f.text, f.x, f.y); g.fillStyle = f.color; g.fillText(f.text, f.x, f.y);
      }
      g.globalAlpha = 1;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (st.flash) { g.fillStyle = `rgba(255,77,94,${(st.flash / 0.35) * 0.26})`; g.fillRect(0, 0, W, H); }
      // the last five seconds: the edges pulse red
      if (st.running && st.left <= 5) {
        g.strokeStyle = `rgba(255, 77, 94, ${0.35 + 0.3 * Math.sin(st.t * 9)})`; g.lineWidth = 8;
        g.strokeRect(4, 4, W - 8, H - 8);
      }
    }
    function frame(now) {
      raf = 0;
      if (!alive || !st.running || paused) return;
      const dt = Math.max(0, Math.min(0.033, (now - last) / 1000 || 0)); // a frame can begin before `last`
      last = now;
      update(dt);
      if (!st.running) return;
      draw(); hud();
      raf = requestAnimationFrame(frame);
    }
    function go() {
      Object.assign(st, { t: 0, left: ROUND, score: 0, lives: 3, items: [], floats: [], parts: [], chain: 0, next: 0.5, shake: 0, flash: 0, squash: 0, running: true });
      hideOver();
      hud(); last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    let countT = 0, fadeT = 0;
    // the overlay (intro, countdown, pause, the end) comes in at once and fades away: its layer goes only
    // once it is invisible (dropping it in one frame, mid-game, could flash on the phone)
    function showOver() { clearTimeout(fadeT); over.classList.remove('fade'); over.classList.add('show'); }
    function hideOver() { clearTimeout(fadeT); over.classList.add('fade'); fadeT = setTimeout(() => { over.classList.remove('show', 'fade'); over.innerHTML = ''; }, 260); }
    function countdown() {
      let n = 3;
      showOver();
      const tick = () => {
        if (!alive) return;
        if (n === 0) { over.innerHTML = '<div class="cg-count go">יאללה!</div>'; play('start'); play('swish'); countT = setTimeout(() => { if (alive) go(); }, 420); return; }
        over.innerHTML = `<div class="cg-count">${n}</div>`;
        play('ding', { pitch: 0.6 }); n--;
        countT = setTimeout(tick, 650);
      };
      tick();
    }
    function end(why) {
      st.running = false;
      cancelAnimationFrame(raf); raf = 0;
      draw(); hud();
      showOver();
      const mins = rate ? Math.round((st.score / rate) * 60) : 0;
      const h = Math.floor(mins / 60), m = mins % 60;
      const span = h ? `${h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`}${m ? ` ו-${m} דקות` : ''}` : `${mins} דקות`;
      endScreen(over, {
        fx,
        id: 'coins', unit: ' ₪', score: st.score, ratio: Math.min(1, st.score / 400),
        title: why === 'lives' ? 'אופס, יותר מדי קנסות' : 'נגמר הזמן!',
        big: st.score + ' ₪',
        sub: mins >= 1 ? `בשכר שלך זה כמו ${span} עבודה` : '',
        again: () => countdown(),
      });
    }
    function intro() {
      showOver();
      over.innerHTML = `<div class="gm-intro">${App.mascot ? App.mascot('wink', { size: 84 }) : ''}
        <div class="gm-intro-t">${ROUND} שניות. כמה כסף אפשר לתפוס?</div>
        <div class="cg-legend"><span><i class="lg-coin"></i>מטבעות ושטרות</span><span><i class="lg-fine"></i>קנס: מוריד לב</span><span><i class="lg-clock"></i>עוד 5 שניות</span></div>
        <div class="tiny muted">גוררים את הארנק עם האצבע (או החצים במקלדת)</div>
        <button class="btn big" data-go>${icon('play')} התחלה</button></div>`;
      over.querySelector('[data-go]').onclick = countdown;
    }

    /* the finger moves the wallet */
    const toX = (e) => { const r = stage.getBoundingClientRect(); st.tx = Math.min(Math.max(e.clientX - r.left, PW / 2), W - PW / 2); };
    const onDown = (e) => { if (!st.running) return; stage.setPointerCapture && stage.setPointerCapture(e.pointerId); toX(e); };
    const onMove = (e) => { if (st.running && (e.buttons || e.pointerType === 'touch' || e.pointerType === 'mouse')) toX(e); };
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    const onKey = (e) => {
      if (!st.running || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      st.tx = Math.min(Math.max(st.tx + (e.key === 'ArrowLeft' ? -60 : 60), PW / 2), W - PW / 2);
    };
    document.addEventListener('keydown', onKey);
    /* the app went to the background: pause, and wait for a tap to continue */
    const onVis = () => {
      if (!document.hidden || !st.running || paused) return;
      paused = true; cancelAnimationFrame(raf); raf = 0;
      showOver();
      over.innerHTML = `<div class="gm-intro"><div class="gm-intro-t">המשחק בהפסקה</div><button class="btn big" data-resume>${icon('play')} המשך</button></div>`;
      over.querySelector('[data-resume]').onclick = () => { paused = false; hideOver(); last = performance.now(); raf = requestAnimationFrame(frame); };
    };
    document.addEventListener('visibilitychange', onVis);

    requestAnimationFrame(() => { size(); intro(); });
    return function stop() {
      alive = false; st.running = false;
      cancelAnimationFrame(raf); clearTimeout(countT); clearTimeout(fadeT);
      fx.close();
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
    };
  }

  /* ---------------- 2. "how much is it?" ---------------- */
  const QN = 10, QSEC = 15;
  function quizGame(onDone) {
    let stop = () => {};
    UI.openSheet({
      title: 'כמה זה יוצא?',
      full: true,
      cls: 'game-sheet gs-quiz',
      body: '<div class="qz" data-box></div>',
      onMount: (el) => { stop = runQuiz(el.querySelector('[data-box]'), attachFx(el)); },
      onClose: () => { stop(); onDone(); },
    });
  }
  const dots = (n, i, res) => `<div class="qz-dots">${Array.from({ length: n }, (_, k) => `<i class="${k < i ? (res[k] ? 'ok' : 'no') : k === i ? 'cur' : ''}"></i>`).join('')}</div>`;
  const SHAPES = ['▲', '◆', '●', '■']; // each answer has its colour and its shape
  /** A right answer: sparks and a ring from the button, a chime one step higher for each in a row, a banner on
   * the big streaks. The sparks start on the next frame: measuring the button right after the answer changed
   * the page would force an extra layout at that very moment (a dropped frame on a slow phone). */
  function cheer(fx, el, streak) {
    play('ding', { pitch: step(streak - 1) }); buzz(10);
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const [x, y] = fx.at(el);
      fx.burst(x, y, { palette: 'good', n: 24, speed: [160, 460] });
      fx.ring(x, y, { color: '#21d47f', r1: 110 });
      fx.glow('good');
    });
    if (STREAKS.includes(streak)) setTimeout(() => fx.banner(`🔥 ${streak} ברצף!`), 260);
  }
  /** A wrong one: a low "bonk", a buzz and a red glow at the edges. */
  function boo(fx) { play('bonk'); buzz([20, 30, 20]); requestAnimationFrame(() => fx.glow('bad')); }
  function runQuiz(box, fx) {
    let alive = true, timer = 0, next = 0, hurry = [];
    let qs, i, score, streak, res, t0, answered;
    function start() {
      qs = Games.quizRound(seed(), QN, { rate: myRate() });
      i = 0; score = 0; streak = 0; res = [];
      show();
    }
    function show() {
      if (!alive) return;
      const q = qs[i];
      answered = false;
      box.innerHTML = `<div class="qz-top">${dots(QN, i, res)}<span class="qz-score" data-sc>${score}</span></div>
        <div class="qz-timer"><b style="animation-duration:${QSEC}s"></b></div>
        <div class="qz-card"><div class="qz-n">שאלה ${i + 1} מתוך ${QN}${streak >= 2 ? ` · <span class="qz-streak">🔥 ${streak} ברצף</span>` : ''}</div><div class="qz-q">${esc(q.q)}</div></div>
        <div class="qz-opts">${q.options.map((o, k) => `<button class="qz-opt" data-k="${k}" style="--d:${k}"><span class="qz-sh" aria-hidden="true">${SHAPES[k] || ''}</span>${esc(o)}</button>`).join('')}</div>
        <div class="qz-x" aria-live="polite"></div>`;
      t0 = performance.now();
      clearTimeout(timer); hurry.forEach(clearTimeout);
      timer = setTimeout(() => answer(-1), QSEC * 1000);
      // the last three seconds tick, and the bar pulses
      hurry = [3, 2, 1].map((s) => setTimeout(() => {
        if (!alive || answered) return;
        play('alarm');
        const tb = box.querySelector('.qz-timer');
        if (tb) tb.classList.add('hurry');
      }, (QSEC - s) * 1000));
      if (i > 0) play('swish');
      box.querySelector('.qz-opts').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) answer(+b.dataset.k); };
    }
    function answer(k) {
      if (answered || !alive) return;
      answered = true;
      clearTimeout(timer); hurry.forEach(clearTimeout);
      const q = qs[i];
      const ok = k === q.answer;
      const took = (performance.now() - t0) / 1000;
      box.querySelector('.qz-timer b').style.animationPlayState = 'paused';
      box.querySelector('.qz-timer').classList.remove('hurry');
      const btns = box.querySelectorAll('.qz-opt');
      btns.forEach((b) => (b.disabled = true));
      btns[q.answer].classList.add('right');
      let pts = 0;
      if (ok) {
        streak++;
        pts = 10 + Math.max(0, Math.round(QSEC - took)) + (streak >= 3 ? 5 : 0);
        score += pts;
        const sc = box.querySelector('[data-sc]');
        sc.textContent = score; sc.classList.add('bump');
        btns[k].insertAdjacentHTML('beforeend', `<span class="qz-pts">+${pts}</span>`);
        cheer(fx, btns[k], streak);
      } else {
        streak = 0;
        if (k >= 0) btns[k].classList.add('wrong');
        boo(fx);
      }
      res.push(ok);
      const x = box.querySelector('.qz-x');
      x.innerHTML = `<div class="qz-xt ${ok ? 'ok' : 'no'}">${ok ? 'נכון!' : k < 0 ? 'נגמר הזמן' : 'לא בדיוק'}</div><div>${esc(q.x)}</div>
        ${ok ? '' : `<button class="btn" data-next>${i + 1 < QN ? 'לשאלה הבאה' : 'לתוצאה'}</button>`}`;
      const go = () => { clearTimeout(next); if (!alive) return; i++; if (i < QN) show(); else finish(); };
      if (ok) next = setTimeout(go, 1700);
      else x.querySelector('[data-next]').onclick = go;
    }
    function finish() {
      const right = res.filter(Boolean).length;
      endScreen(box, {
        fx,
        id: 'quiz', unit: ' נק׳', score, ratio: right / QN,
        title: right === QN ? 'מושלם! כל התשובות נכונות' : right >= 7 ? 'יפה מאוד!' : right >= 4 ? 'לא רע בכלל' : 'בסיבוב הבא זה יילך טוב יותר',
        big: `${score} <small>נק׳</small>`,
        sub: `${right} מתוך ${QN} תשובות נכונות`,
        again: start,
      });
    }
    start();
    return () => { alive = false; clearTimeout(timer); clearTimeout(next); hurry.forEach(clearTimeout); fx.close(); };
  }

  /* ---------------- 3. true or false ---------------- */
  function factsGame(onDone) {
    let stop = () => {};
    UI.openSheet({
      title: 'נכון או לא?',
      full: true,
      cls: 'game-sheet gs-facts',
      body: '<div class="tf" data-box></div>',
      onMount: (el) => { stop = runFacts(el.querySelector('[data-box]'), attachFx(el)); },
      onClose: () => { stop(); onDone(); },
    });
  }
  function runFacts(box, fx) {
    let alive = true, stampT = 0;
    let list, i, res, streak;
    function start() { list = Games.factsRound(seed(), 10, adultMinWage()); i = 0; res = []; streak = 0; show(); }
    function show() {
      if (!alive) return;
      if (i > 0) play('swish');
      const f = list[i];
      box.innerHTML = `<div class="qz-top">${dots(list.length, i, res)}<span class="qz-score">${res.filter(Boolean).length}/${list.length}</span></div>
        <div class="tf-card" data-card><div class="qz-n">${i + 1} מתוך ${list.length}</div><div class="tf-s">${esc(f.s)}</div></div>
        <div class="tf-btns"><button class="btn big tf-yes" data-a="1">${icon('check')} נכון</button><button class="btn big tf-no" data-a="0">${icon('x')} לא נכון</button></div>
        <div class="qz-x" aria-live="polite"></div>`;
      box.querySelector('.tf-btns').onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) answer(b.dataset.a === '1'); };
    }
    function answer(a) {
      const f = list[i];
      const ok = a === f.t;
      res.push(ok);
      box.querySelectorAll('.tf-btns .btn').forEach((b) => { b.disabled = true; b.classList.toggle('picked', (b.dataset.a === '1') === a); });
      const card = box.querySelector('[data-card]');
      card.classList.add(ok ? 'ok' : 'no');
      // the verdict lands on the card like a rubber stamp
      card.insertAdjacentHTML('beforeend', `<div class="tf-verdict ${f.t ? 't' : 'f'}">${f.t ? 'נכון' : 'לא נכון'}</div>`);
      clearTimeout(stampT);
      stampT = setTimeout(() => { if (alive) play('stamp'); }, 150);
      if (ok) { streak++; cheer(fx, box.querySelector('.tf-btns .picked') || card, streak); } else { streak = 0; boo(fx); }
      box.querySelector('.qz-score').textContent = `${res.filter(Boolean).length}/${list.length}`;
      const x = box.querySelector('.qz-x');
      x.innerHTML = `<div class="qz-xt ${ok ? 'ok' : 'no'}">${ok ? 'צדקת!' : 'הפעם לא'}</div><div>${esc(f.x)}</div>
        <button class="btn" data-next>${i + 1 < list.length ? 'הבא' : 'לתוצאה'}</button>`;
      x.querySelector('[data-next]').onclick = () => { if (!alive) return; i++; if (i < list.length) show(); else finish(); };
    }
    function finish() {
      const right = res.filter(Boolean).length;
      endScreen(box, {
        fx,
        id: 'facts', unit: '/10', score: right, ratio: right / list.length,
        title: right >= 9 ? 'אלופי הזכויות!' : right >= 6 ? 'ידע לא רע בכלל' : 'שווה להציץ בזכויות שלך',
        big: `${right}<small>/${list.length}</small>`,
        sub: right < 9 ? '<button class="btn text sm" data-rights>לכל הזכויות שלי</button>' : '',
        again: start,
      });
      const r = box.querySelector('[data-rights]');
      if (r) r.onclick = () => { UI.closeAll(); setTimeout(() => App.actions.rights && App.actions.rights(), 350); };
    }
    start();
    return () => { alive = false; clearTimeout(stampT); fx.close(); };
  }

  /* ---------------- 4. pairs (memory) ---------------- */
  const PN = 6;
  function pairsGame(onDone) {
    let stop = () => {};
    UI.openSheet({
      title: 'זוגות',
      full: true,
      cls: 'game-sheet gs-pairs',
      body: '<div class="pr" data-box></div>',
      onMount: (el) => { stop = runPairs(el.querySelector('[data-box]'), attachFx(el)); },
      onClose: () => { stop(); onDone(); },
    });
  }
  function runPairs(box, fx) {
    let alive = true, back = 0, end = 0;
    let round, open, moves, found, t0, busy, run;
    function start() {
      clearTimeout(back); clearTimeout(end);
      round = Games.pairsRound(seed(), PN); open = []; moves = 0; found = new Set(); t0 = 0; busy = false; run = 0;
      box.innerHTML = `<div class="qz-top"><span class="pr-moves" data-mv>0 ניסיונות</span><span class="qz-score" data-sc>0/${PN}</span></div>
        <div class="pr-grid">${round.cards.map((c, k) => `<button class="pr-card" data-k="${k}" style="--k:${k}" aria-label="קלף ${k + 1}, הפוך"><span class="pr-in"><span class="pr-back" aria-hidden="true"></span><span class="pr-face ${c.kind === 't' ? 'w' : 'm'}">${esc(c.text)}</span></span></button>`).join('')}</div>
        <div class="qz-x" aria-live="polite"><div>הופכים שני קלפים ומחפשים מילה מהתלוש ואת מה שהיא אומרת.</div></div>`;
      box.querySelector('.pr-grid').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) flip(b); };
    }
    const cardEl = (k) => box.querySelector(`[data-k="${k}"]`);
    const say = (html) => { const x = box.querySelector('.qz-x'); if (x) x.innerHTML = `<div>${html}</div>`; };
    function flip(b) {
      const k = +b.dataset.k, c = round.cards[k];
      if (!alive || busy || found.has(c.pair) || open.includes(k)) return;
      if (!t0) t0 = performance.now();
      b.classList.add('up'); b.setAttribute('aria-label', c.text);
      play('flip', { pitch: 0.9 + Math.random() * 0.2 }); buzz(6);
      open.push(k);
      if (open.length < 2) return;
      moves++;
      box.querySelector('[data-mv]').textContent = `${moves} ניסיונות`;
      const [a, z] = open.map((i) => round.cards[i]);
      if (a.pair === z.pair) {
        found.add(a.pair); run++;
        const els = open.map(cardEl);
        els.forEach((el) => el.classList.add('done'));
        open = [];
        const p = round.pairs.find((x) => x.id === a.pair);
        say(`<b>${esc(p.t)}</b>: ${esc(p.d)} ✓`);
        const sc = box.querySelector('[data-sc]'); sc.textContent = `${found.size}/${PN}`; sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump');
        // the pair lights up: sparks from both cards, a chime one step higher for every pair found
        setTimeout(() => {
          if (!alive) return;
          play('match', { pitch: step(found.size - 1) }); buzz(10);
          els.forEach((el) => { const [x, y] = fx.at(el); fx.burst(x, y, { palette: 'gold', n: 14, kinds: ['star', 'spark', 'confetti'], speed: [140, 380] }); fx.ring(x, y, { color: '#21d47f', r1: 70, width: 5 }); });
          if (run >= 3 && found.size < PN) fx.banner(`🔥 ${run} זוגות ברצף!`);
        }, 180);
        if (found.size === PN) end = setTimeout(finish, 900);
      } else {
        busy = true; run = 0;
        // a miss: both cards give a little shake before they turn back
        const els = open.map(cardEl);
        setTimeout(() => { if (alive) { els.forEach((el) => el && el.classList.add('miss')); play('soft'); } }, 380);
        back = setTimeout(() => {
          if (!alive) return;
          open.forEach((i) => { const el = cardEl(i); if (el) { el.classList.remove('up', 'miss'); el.setAttribute('aria-label', `קלף ${i + 1}, הפוך`); } });
          open = []; busy = false;
        }, 950);
      }
    }
    function finish() {
      if (!alive) return;
      const secs = (performance.now() - t0) / 1000;
      const score = Games.pairsScore(PN, moves, secs);
      endScreen(box, {
        fx,
        id: 'pairs', unit: ' נק׳', score, ratio: Math.min(1, PN / moves),
        title: moves <= PN + 2 ? 'זיכרון של פיל!' : moves <= PN + 6 ? 'יפה מאוד!' : 'כל הזוגות נמצאו',
        big: `${score} <small>נק׳</small>`,
        sub: `${moves} ניסיונות · ${Math.round(secs)} שניות`,
        again: start,
      });
    }
    start();
    return () => { alive = false; clearTimeout(back); clearTimeout(end); fx.close(); };
  }

  /* ---------------- 5. how many hours is it? (higher or lower) ---------------- */
  function hoursGame(onDone) {
    let stop = () => {};
    UI.openSheet({
      title: 'כמה שעות זה?',
      full: true,
      cls: 'game-sheet gs-hours',
      body: '<div class="hw" data-box></div>',
      onMount: (el) => { stop = runHours(el.querySelector('[data-box]'), attachFx(el)); },
      onClose: () => { stop(); onDone(); },
    });
  }
  function runHours(box, fx) {
    let alive = true, next = 0;
    const own = myRate();
    const rate = own > 0 ? Math.round(own * 100) / 100 : 40;
    let chain, i, streak, answered;
    const money = (v) => `${v.toLocaleString('en-US')} ₪`;
    const item = (t, open, cls) => `<div class="hw-card ${cls || ''}"><span class="hw-e" aria-hidden="true">${t.e}</span><b>${esc(t.name)}</b>
      ${open ? `<span class="hw-p">${money(t.price)}</span><span class="hw-h">${Games.workTime(t.price / rate)}</span>` : '<span class="hw-q" aria-label="מחיר מוסתר">?</span>'}</div>`;
    function start() { clearTimeout(next); chain = Games.hoursRound(seed(), 60); i = 0; streak = 0; show(); }
    function show() {
      if (!alive) return;
      const a = chain[i], b = chain[i + 1];
      answered = false;
      box.innerHTML = `<div class="qz-top"><span class="hw-rate">${own > 0 ? 'לפי השכר שלך' : 'לפי שכר של'} ${money(rate)} לשעה</span><span class="qz-score" data-sc>🔥 ${streak}</span></div>
        <div class="hw-pair">${item(a, true, 'a')}<span class="hw-vs" aria-hidden="true">או</span>${item(b, false, 'b')}</div>
        <div class="hw-ask">${esc(b.name)}: יותר או פחות שעות עבודה?</div>
        <div class="tf-btns"><button class="btn big hw-more" data-a="1">${icon('up')} יותר</button><button class="btn big hw-less" data-a="0">${icon('down')} פחות</button></div>
        <div class="qz-x" aria-live="polite"></div>`;
      box.querySelector('.tf-btns').onclick = (e) => { const x = e.target.closest('[data-a]'); if (x) answer(x.dataset.a === '1'); };
    }
    function answer(more) {
      if (answered || !alive) return;
      answered = true;
      const a = chain[i], b = chain[i + 1];
      const ok = (b.price > a.price) === more;
      box.querySelectorAll('.tf-btns .btn').forEach((x) => { x.disabled = true; x.classList.toggle('picked', (x.dataset.a === '1') === more); });
      const card = box.querySelector('.hw-card.b');
      card.outerHTML = item(b, true, 'b shown ' + (ok ? 'ok' : 'no'));
      // the price rolls up like a slot machine
      const shown = box.querySelector('.hw-card.b');
      if (root.GameFx) root.GameFx.countUp(shown.querySelector('.hw-p'), { ms: 520 });
      const x = box.querySelector('.qz-x');
      if (ok) {
        streak++;
        cheer(fx, shown, streak);
        const sc = box.querySelector('[data-sc]'); sc.textContent = `🔥 ${streak}`; sc.classList.add('bump');
        x.innerHTML = `<div class="qz-xt ok">${streak >= 5 && streak % 5 === 0 ? `${streak} ברצף! 🔥` : 'נכון!'}</div>`;
        next = setTimeout(() => { if (!alive) return; i++; if (i + 1 < chain.length) show(); else finish(); }, 1500);
      } else {
        boo(fx);
        x.innerHTML = `<div class="qz-xt no">הפעם לא</div><div>${esc(b.name)} עולה ${money(b.price)}: ${Games.workTime(b.price / rate)} של עבודה, ${b.price > a.price ? 'יותר' : 'פחות'} מ${esc(a.name)}.</div>
          <button class="btn" data-next>לתוצאה</button>`;
        x.querySelector('[data-next]').onclick = finish;
      }
    }
    function finish() {
      if (!alive) return;
      clearTimeout(next);
      endScreen(box, {
        fx,
        id: 'hours', unit: ' ברצף', score: streak, ratio: Math.min(1, streak / 8),
        title: streak >= 8 ? 'יודעים בדיוק מה שווה כסף!' : streak >= 4 ? 'יפה!' : 'שווה עוד סיבוב',
        big: `${streak} <small>ברצף</small>`,
        sub: 'כל מחיר הוא גם שעות של עבודה',
        again: start,
      });
    }
    start();
    return () => { alive = false; clearTimeout(next); fx.close(); };
  }

  App.games = { LIST, best, play: playGame };
})(typeof window !== 'undefined' ? window : globalThis);
