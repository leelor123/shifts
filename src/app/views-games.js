/* ============================================================
 * views-games.js — three short games about money and work:
 *  - "תופסים מטבעות": drag the wallet, catch coins and notes, dodge
 *    the fines (a 40-second canvas arcade, sprites drawn once, one
 *    requestAnimationFrame loop that stops when the sheet closes or
 *    the app goes to the background);
 *  - "כמה זה יוצא?": quick pay arithmetic against the clock;
 *  - "נכון או לא?": true or false about workers' rights, with the
 *    explanation after every answer.
 * The content lives in core/games.js; best scores in meta.games.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Store, UI, App, Games } = root;
  const S = Store.S;
  const { icon, esc } = UI;
  const Fx = () => root.Fx;
  const play = (s) => { if (Fx()) Fx().play(s); };
  const buzz = (p) => { if (Fx()) Fx().haptic(p); };

  const LIST = [
    { id: 'coins', ic: 'wallet', tint: 'amber', t: 'תופסים מטבעות', s: 'גוררים את הארנק, תופסים כסף ומתחמקים מקנסות.', unit: ' ₪' },
    { id: 'quiz', ic: 'calc', tint: 'violet', t: 'כמה זה יוצא?', s: 'חשבון מהיר של שכר, שעות נוספות ושבתות.', unit: ' נק׳' },
    { id: 'facts', ic: 'shield', tint: 'mint', t: 'נכון או לא?', s: 'כמה טוב אתה מכיר את הזכויות שלך בעבודה?', unit: '/10' },
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
      ['shabbat', '🕯️', 'שבת או חג', 'משמרת שיש בה שעות שבת או חג (ושילמו עליהן תוספת?)', done.some((r) => r.restHours > 0)],
      ['night', '🌙', 'משמרת לילה', 'משמרת שרובה בלילה', done.some((r) => r.isNightShift)],
      ['slip', '🧾', 'בדיקת תלוש', 'בודקים תלוש שכר מול המשמרות', S.payslips.length > 0],
      ['rights', '🛡️', 'הזכויות שלי', 'נכנסים למסך הזכויות ובודקים מה מגיע', !!S.meta.usedRights],
      ['games', '🎮', 'כל המשחקים', 'משחקים בכל שלושת המשחקים', g('coins') > 0 && g('quiz') > 0 && g('facts') > 0],
      ['coins', '🪙', 'תופסי כסף', 'אוספים ' + money(300) + ' ב"תופסים מטבעות"', g('coins') >= 300, count(g('coins'), 300)],
      ['quiz', '🧠', 'אלופי חשבון', '150 נקודות ב"כמה זה יוצא?"', g('quiz') >= 150, count(g('quiz'), 150)],
      ['facts', '⚖️', 'מומחי זכויות', '10 מתוך 10 ב"נכון או לא?"', g('facts') >= 10, count(g('facts'), 10)],
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
          <small>${a.on ? 'הושג' : a.prog && a.prog.goal > 1 ? `${a.prog.cur.toLocaleString('he-IL')} מתוך ${a.prog.goal.toLocaleString('he-IL')}` : 'עוד לא'}</small></button>`).join('')}</div>`,
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
      body: `${App.mascotSays ? App.mascotSays('party', 'הפסקה קטנה? כל משחק לוקח פחות מדקה.', { size: 64 }) : ''}<div class="gm-list">${cards()}</div>
        <button class="ach-card" data-medals>${(() => { const l = achievements(); const got = l.filter((a) => a.on).length; return `<span class="ach-card-e" aria-hidden="true">🏅</span><span class="gm-txt"><b>המדליות שלי</b><span>${got} מתוך ${l.length} · על משמרות, כסף, תלושים ומשחקים</span></span>${icon('left', 's')}`; })()}</button>`,
      onMount: (el) => {
        el.querySelector('[data-medals]').onclick = medalsSheet;
        const list = el.querySelector('.gm-list');
        list.addEventListener('click', (e) => {
          const b = e.target.closest('[data-game]');
          if (!b) return;
          const done = () => { if (list.isConnected) list.innerHTML = cards(); };
          if (b.dataset.game === 'coins') coinGame(done);
          else if (b.dataset.game === 'quiz') quizGame(done);
          else factsGame(done);
        });
      },
    });
  };

  /** The end of a round: mascot, score, best, play again. */
  function endScreen(box, o) {
    const isBest = record(o.id, o.score);
    const mood = o.ratio >= 0.8 ? 'party' : o.ratio >= 0.5 ? 'happy' : 'think';
    box.innerHTML = `<div class="gm-end">${App.mascot ? App.mascot(mood, { size: 96 }) : ''}
      <div class="gm-end-t">${esc(o.title)}</div>
      <div class="gm-end-n">${o.big}</div>
      ${o.sub ? `<div class="gm-end-s">${o.sub}</div>` : ''}
      <div class="gm-end-b">${isBest ? `${icon('star', 's')} שיא חדש!` : `השיא שלך: ${best(o.id)}${o.unit}`}</div>
      <div class="gm-end-a"><button class="btn" data-again>${icon('repeat')} עוד סיבוב</button><button class="btn tonal" data-quit>סיום</button></div></div>`;
    if (isBest && o.score > 0) { if (Fx()) Fx().celebrate('big'); } else play('pop');
    box.querySelector('[data-again]').onclick = o.again;
    box.querySelector('[data-quit]').onclick = () => UI.closeTop();
  }

  /* ---------------- 1. coin catcher ---------------- */
  const ROUND = 40;
  function coinGame(onDone) {
    let stop = () => {};
    UI.openSheet({
      title: 'תופסים מטבעות',
      full: true,
      cls: 'game-sheet',
      body: `<div class="cg">
        <div class="cg-hud"><span class="cg-score" data-score>0 ₪</span><span class="cg-lives" data-lives aria-label="3 לבבות">${'<i></i>'.repeat(3)}</span><span class="cg-time" data-time>${ROUND}</span></div>
        <div class="cg-stage" data-no-ptr><canvas aria-label="המשחק"></canvas><div class="cg-over" data-over></div></div></div>`,
      onMount: (el) => { stop = runCoins(el); },
      onClose: () => { stop(); onDone(); },
    });
  }
  function runCoins(el) {
    const stage = el.querySelector('.cg-stage');
    const cv = stage.querySelector('canvas');
    const g = cv.getContext('2d');
    const over = el.querySelector('[data-over]');
    const hudScore = el.querySelector('[data-score]'), hudTime = el.querySelector('[data-time]'), hudLives = el.querySelector('[data-lives]');
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    const ink = getComputedStyle(stage).getPropertyValue('--on-surface').trim() || '#222';
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

    const st = { t: 0, left: ROUND, score: 0, lives: 3, items: [], floats: [], px: 0, tx: 0, next: 0.5, shake: 0, flash: 0, squash: 0, running: false, r: Games.rng(seed()) };
    let shownScore = -1, shownTime = -1, shownLives = -1;
    function hud() {
      if (st.score !== shownScore) { shownScore = st.score; hudScore.textContent = st.score + ' ₪'; hudScore.classList.remove('bump'); void hudScore.offsetWidth; hudScore.classList.add('bump'); }
      const tl = Math.max(0, Math.ceil(st.left));
      if (tl !== shownTime) { shownTime = tl; hudTime.textContent = tl; hudTime.classList.toggle('low', tl <= 5); }
      if (st.lives !== shownLives) { shownLives = st.lives; hudLives.innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < st.lives ? '' : 'off'}"></i>`).join(''); hudLives.setAttribute('aria-label', st.lives + ' לבבות'); }
    }
    function size() {
      const r = stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    function floatText(x, y, text, color) { st.floats.push({ x, y, text, color, life: 0.8 }); }
    function catchIt(it) {
      st.squash = 1;
      if (it.d.bad) {
        st.lives--; st.shake = 0.3; st.flash = 0.35;
        floatText(it.x, it.y, '−❤', '#e5484d');
        play('error'); buzz([30, 40, 30]);
        if (st.lives <= 0) end('lives');
      } else if (it.d.k === 'clock') {
        st.left += 5; floatText(it.x, it.y, '+5 שנ׳', '#3b82f6'); play('on'); buzz(10);
      } else {
        st.score += it.d.v; floatText(it.x, it.y, '+' + it.d.v, it.d.v >= 10 ? '#d99a0b' : ink);
        play(it.d.v >= 10 ? 'coin' : 'tick'); buzz(it.d.v >= 10 ? 12 : 6);
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
        const hit = Math.abs(it.x - st.px) < PW / 2 + it.sp.r * 0.5 && it.y + it.sp.r * 0.6 > py - PH / 2 && it.y - it.sp.r < py + PH / 3;
        if (hit) { catchIt(it); st.items[i] = st.items[st.items.length - 1]; st.items.pop(); if (!st.running) return; continue; }
        if (it.y > H + 40) { st.items[i] = st.items[st.items.length - 1]; st.items.pop(); }
      }
      for (let i = st.floats.length - 1; i >= 0; i--) { const f = st.floats[i]; f.life -= dt; f.y -= 60 * dt; if (f.life <= 0) st.floats.splice(i, 1); }
      st.shake = Math.max(0, st.shake - dt); st.flash = Math.max(0, st.flash - dt); st.squash = Math.max(0, st.squash - dt * 5);
    }
    function draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      if (st.shake) g.translate((Math.random() - 0.5) * 10 * st.shake / 0.3, (Math.random() - 0.5) * 6 * st.shake / 0.3);
      for (const it of st.items) {
        const s = it.sp.img, w = s.width / dpr, h = s.height / dpr;
        g.save(); g.translate(it.x, it.y); g.rotate(it.rot); g.drawImage(s, -w / 2, -h / 2, w, h); g.restore();
      }
      const py = H - PH / 2 - 14;
      const sq = st.squash;
      g.save(); g.translate(st.px, py); g.scale(1 + sq * 0.12, 1 - sq * 0.12); g.drawImage(wallet, -PW / 2, -PH / 2, PW, PH); g.restore();
      g.font = FONT(18); g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const f of st.floats) { g.globalAlpha = Math.min(1, f.life / 0.4); g.fillStyle = f.color; g.fillText(f.text, f.x, f.y); }
      g.globalAlpha = 1;
      if (st.flash) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = `rgba(229,72,77,${(st.flash / 0.35) * 0.22})`; g.fillRect(0, 0, W, H); }
    }
    function frame(now) {
      raf = 0;
      if (!alive || !st.running || paused) return;
      const dt = Math.min(0.033, (now - last) / 1000 || 0);
      last = now;
      update(dt);
      if (!st.running) return;
      draw(); hud();
      raf = requestAnimationFrame(frame);
    }
    function go() {
      Object.assign(st, { t: 0, left: ROUND, score: 0, lives: 3, items: [], floats: [], next: 0.5, shake: 0, flash: 0, squash: 0, running: true });
      over.classList.remove('show'); over.innerHTML = '';
      hud(); last = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function countdown() {
      let n = 3;
      over.classList.add('show');
      const tick = () => {
        if (!alive) return;
        if (n === 0) { go(); play('start'); return; }
        over.innerHTML = `<div class="cg-count">${n}</div>`;
        play('tick'); n--;
        setTimeout(tick, 650);
      };
      tick();
    }
    function end(why) {
      st.running = false;
      cancelAnimationFrame(raf); raf = 0;
      draw(); hud();
      over.classList.add('show');
      const mins = rate ? Math.round((st.score / rate) * 60) : 0;
      const h = Math.floor(mins / 60), m = mins % 60;
      const span = h ? `${h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h + ' שעות'}${m ? ` ו-${m} דקות` : ''}` : `${mins} דקות`;
      endScreen(over, {
        id: 'coins', unit: ' ₪', score: st.score, ratio: Math.min(1, st.score / 400),
        title: why === 'lives' ? 'אופס, יותר מדי קנסות' : 'נגמר הזמן!',
        big: st.score + ' ₪',
        sub: mins >= 1 ? `בשכר שלך זה כמו ${span} עבודה` : '',
        again: () => countdown(),
      });
    }
    function intro() {
      over.classList.add('show');
      over.innerHTML = `<div class="gm-intro">${App.mascot ? App.mascot('wink', { size: 84 }) : ''}
        <div class="gm-intro-t">${ROUND} שניות. כמה כסף תספיק לתפוס?</div>
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
      over.classList.add('show');
      over.innerHTML = `<div class="gm-intro"><div class="gm-intro-t">המשחק בהפסקה</div><button class="btn big" data-resume>${icon('play')} המשך</button></div>`;
      over.querySelector('[data-resume]').onclick = () => { paused = false; over.classList.remove('show'); over.innerHTML = ''; last = performance.now(); raf = requestAnimationFrame(frame); };
    };
    document.addEventListener('visibilitychange', onVis);

    requestAnimationFrame(() => { size(); intro(); });
    return function stop() {
      alive = false; st.running = false;
      cancelAnimationFrame(raf);
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
      cls: 'game-sheet',
      body: '<div class="qz" data-box></div>',
      onMount: (el) => { stop = runQuiz(el.querySelector('[data-box]')); },
      onClose: () => { stop(); onDone(); },
    });
  }
  const dots = (n, i, res) => `<div class="qz-dots">${Array.from({ length: n }, (_, k) => `<i class="${k < i ? (res[k] ? 'ok' : 'no') : k === i ? 'cur' : ''}"></i>`).join('')}</div>`;
  function runQuiz(box) {
    let alive = true, timer = 0, next = 0;
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
        <div class="qz-opts">${q.options.map((o, k) => `<button class="qz-opt" data-k="${k}" style="--d:${k}">${esc(o)}</button>`).join('')}</div>
        <div class="qz-x" aria-live="polite"></div>`;
      t0 = performance.now();
      clearTimeout(timer);
      timer = setTimeout(() => answer(-1), QSEC * 1000);
      box.querySelector('.qz-opts').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) answer(+b.dataset.k); };
    }
    function answer(k) {
      if (answered || !alive) return;
      answered = true;
      clearTimeout(timer);
      const q = qs[i];
      const ok = k === q.answer;
      const took = (performance.now() - t0) / 1000;
      box.querySelector('.qz-timer b').style.animationPlayState = 'paused';
      const btns = box.querySelectorAll('.qz-opt');
      btns.forEach((b) => (b.disabled = true));
      btns[q.answer].classList.add('right');
      let pts = 0;
      if (ok) {
        streak++;
        pts = 10 + Math.max(0, Math.round(QSEC - took)) + (streak >= 3 ? 5 : 0);
        score += pts;
        play('coin'); buzz(10);
        const sc = box.querySelector('[data-sc]');
        sc.textContent = score; sc.classList.add('bump');
        btns[k].insertAdjacentHTML('beforeend', `<span class="qz-pts">+${pts}</span>`);
      } else {
        streak = 0;
        if (k >= 0) btns[k].classList.add('wrong');
        play('error'); buzz([20, 30, 20]);
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
        id: 'quiz', unit: ' נק׳', score, ratio: right / QN,
        title: right === QN ? 'מושלם! כל התשובות נכונות' : right >= 7 ? 'יפה מאוד!' : right >= 4 ? 'לא רע בכלל' : 'עוד סיבוב ותשתפר',
        big: `${score} <small>נק׳</small>`,
        sub: `${right} מתוך ${QN} תשובות נכונות`,
        again: start,
      });
    }
    start();
    return () => { alive = false; clearTimeout(timer); clearTimeout(next); };
  }

  /* ---------------- 3. true or false ---------------- */
  function factsGame(onDone) {
    let stop = () => {};
    UI.openSheet({
      title: 'נכון או לא?',
      full: true,
      cls: 'game-sheet',
      body: '<div class="tf" data-box></div>',
      onMount: (el) => { stop = runFacts(el.querySelector('[data-box]')); },
      onClose: () => { stop(); onDone(); },
    });
  }
  function runFacts(box) {
    let alive = true;
    let list, i, res;
    function start() { list = Games.factsRound(seed(), 10, adultMinWage()); i = 0; res = []; show(); }
    function show() {
      if (!alive) return;
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
      card.insertAdjacentHTML('beforeend', `<div class="tf-verdict">${f.t ? 'נכון' : 'לא נכון'}</div>`);
      if (ok) { play('coin'); buzz(10); } else { play('error'); buzz([20, 30, 20]); }
      box.querySelector('.qz-score').textContent = `${res.filter(Boolean).length}/${list.length}`;
      const x = box.querySelector('.qz-x');
      x.innerHTML = `<div class="qz-xt ${ok ? 'ok' : 'no'}">${ok ? 'צדקת!' : 'הפעם לא'}</div><div>${esc(f.x)}</div>
        <button class="btn" data-next>${i + 1 < list.length ? 'הבא' : 'לתוצאה'}</button>`;
      x.querySelector('[data-next]').onclick = () => { if (!alive) return; i++; if (i < list.length) show(); else finish(); };
    }
    function finish() {
      const right = res.filter(Boolean).length;
      endScreen(box, {
        id: 'facts', unit: '/10', score: right, ratio: right / list.length,
        title: right >= 9 ? 'מומחה לזכויות!' : right >= 6 ? 'יודע לא מעט' : 'שווה להציץ בזכויות שלך',
        big: `${right}<small>/${list.length}</small>`,
        sub: right < 9 ? '<button class="btn text sm" data-rights>לכל הזכויות שלי</button>' : '',
        again: start,
      });
      const r = box.querySelector('[data-rights]');
      if (r) r.onclick = () => { UI.closeAll(); setTimeout(() => App.actions.rights && App.actions.rights(), 350); };
    }
    start();
    return () => { alive = false; };
  }

  App.games = { LIST, best };
})(typeof window !== 'undefined' ? window : globalThis);
