/* The website's 10-second check (site/check.html): "are they cheating you?" — age + hourly wage → the legal minimum
 * for that age, the gap a month, and a story picture to share. Nothing leaves the phone. tools/site-pages.js puts
 * the law's numbers in place of __DATA__ and writes this file to site/check.js. */
(function () {
  'use strict';
  const D = {"min":{"u16":26.07,"a16":27.94,"a17":30.92,"adult":35.4},"label":{"u16":"מתחת לגיל 16","a16":"בגיל 16","a17":"בגיל 17","adult":"מגיל 18"},"rest":150,"from":"2026-04-01"};
  const $ = (s) => document.querySelector(s);
  const nis = (n, d) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ₪';
  let age = null;
  const ages = document.querySelectorAll('[data-age]');
  ages.forEach((b) => b.addEventListener('click', () => {
    age = b.dataset.age;
    ages.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    update();
  }));
  const shab = $('#ck-shab');
  shab.addEventListener('change', () => { $('#ck-shab-h').hidden = !shab.checked; update(); });
  ['#ck-wage', '#ck-hours', '#ck-shab-hours'].forEach((s) => $(s).addEventListener('input', update));

  // a number as people type it, a comma as the decimal point too: '' when empty, NaN when it is not a number
  const read = (s) => { const t = String($(s).value).trim().replace(',', '.'); return t === '' ? '' : /^\d+(\.\d+)?$/.test(t) ? +t : NaN; };
  // what cannot be right is said in words, with no result under it (99999 showed "282383% above the minimum", hours
  // over 400 were cut silently, a wage typed before an age showed nothing)
  const err = $('#ck-err');
  const say = (msg, at) => {
    ['#ck-wage', '#ck-hours', '#ck-shab-hours'].forEach((x) => $(x).setAttribute('aria-invalid', String(x === at)));
    err.textContent = msg;
    err.hidden = !msg;
  };
  let last = null;
  function update() {
    const out = $('#ck-out');
    const w = read('#ck-wage'), h = read('#ck-hours'), sh = shab.checked ? read('#ck-shab-hours') : '';
    let msg = '', at = null;
    if (w !== '' && !(w >= 1 && w <= 500)) { msg = 'שכר לשעה הוא מספר בין 1 ל-500 ₪, למשל 32'; at = '#ck-wage'; }
    else if (h !== '' && !(h >= 0 && h <= 400)) { msg = 'שעות בחודש: מספר עד 400'; at = '#ck-hours'; }
    // Shabbat hours are part of the month's hours (so they need the month's hours)
    else if (sh !== '' && !(sh >= 0 && sh <= (h || 0))) { msg = h ? `השעות בשבת הן חלק משעות החודש, אז עד ${h}` : 'כדי לחשב את השבתות, כתבו קודם כמה שעות בחודש'; at = '#ck-shab-hours'; }
    else if (w !== '' && !age) msg = 'בחרו קודם גיל, ונבדוק';
    say(msg, at);
    if (msg || !age || w === '') { out.hidden = true; last = null; return; }
    const wage = w, min = D.min[age];
    const hours = h || 0;
    const shabH = shab.checked && hours ? sh || 0 : 0;
    const perHour = Math.max(0, Math.round((min - wage) * 100) / 100);
    // Shabbat hours paid like a weekday: the law says at least 150% of the (legal) rate
    const shabMissing = shabH * Math.max(wage, min) * (D.rest / 100 - 1);
    const month = perHour * hours + shabMissing;
    const bad = perHour > 0 || shabMissing > 0.5;
    last = { wage, min, month, perHour, shabMissing, hours, bad };
    out.hidden = false;
    out.classList.toggle('bad', bad);
    out.classList.toggle('good', !bad);
    if (bad) {
      $('#ck-big').textContent = hours ? `חסרים לך כ-${nis(Math.round(month), 0)} בחודש` : `חסרים לך ${nis(perHour, 2)} על כל שעה`;
      $('#ck-title').textContent = 'מרמים אותך 😤';
      const why = [];
      if (perHour > 0) why.push(`שכר המינימום ${D.label[age]} הוא ${nis(min, 2)} לשעה, ואת/ה מקבל/ת ${nis(wage, 2)}.`);
      if (shabMissing > 0) why.push(`על שעה בשבת מגיע לפחות ${D.rest}% (${nis(Math.max(wage, min) * D.rest / 100, 2)} לשעה), לא תעריף רגיל.`);
      $('#ck-why').textContent = why.join(' ');
    } else {
      const above = Math.round((wage / min - 1) * 100);
      $('#ck-title').textContent = 'השכר לשעה תקין 💪';
      $('#ck-big').textContent = above > 0 ? `${above}% מעל המינימום לגילך` : 'בדיוק שכר המינימום לגילך';
      $('#ck-why').textContent = `שכר המינימום ${D.label[age]} הוא ${nis(min, 2)} לשעה. אבל זה לא הכול: נסיעות, הבראה, שבתות וחגים. שעתי בודקת את התלוש עד השקל.`;
    }
  }

  /* the story picture: 1080x1920, the brand's purple, the result in big letters */
  async function picture() {
    try { await Promise.all([document.fonts.load('700 80px Fredoka'), document.fonts.load('700 60px Rubik'), document.fonts.load('400 40px Rubik')]); } catch (e) { /* the fallback font draws too */ }
    const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bad = last.bad;
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, bad ? '#4a1fd6' : '#0b7a4b'); grad.addColorStop(1, bad ? '#b02adf' : '#14b8a6');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.12; g.fillStyle = '#fff';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc((i * 271) % W, (i * 397) % H, 30 + (i * 37) % 120, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1; g.textAlign = 'center'; g.direction = 'rtl'; g.fillStyle = '#fff';
    const F = (w, s, fam) => `${w} ${s}px ${fam || 'Rubik'}, system-ui, sans-serif`;
    g.font = F(500, 52); g.globalAlpha = 0.9; g.fillText('בדקתי בשעתי', W / 2, 330); g.globalAlpha = 1;
    g.font = F(700, 150, 'Fredoka, Rubik'); g.fillText(bad ? '😤' : '💪', W / 2, 560);
    const lines = bad
      ? (last.hours ? ['מרמים אותי ב-', nis(Math.round(last.month), 0), 'בחודש'] : ['חסרים לי', nis(last.perHour, 2), 'על כל שעה'])
      : ['השכר שלי', 'מעל המינימום', ''];
    g.font = F(700, 86); g.fillText(lines[0], W / 2, 760);
    g.font = F(800, 150, 'Fredoka, Rubik'); g.fillText(lines[1], W / 2, 940);
    g.font = F(700, 86); if (lines[2]) g.fillText(lines[2], W / 2, 1080);
    g.fillStyle = 'rgba(255,255,255,.16)'; roundRect(g, 120, 1290, W - 240, 300, 60); g.fill();
    g.fillStyle = '#fff'; g.font = F(700, 64); g.fillText('ואתם? בדקו ב-10 שניות', W / 2, 1405);
    g.font = F(500, 56); g.fillText('shaati.web.app/check', W / 2, 1505);
    g.font = F(400, 36); g.globalAlpha = 0.8; g.fillText('לפי שכר המינימום בישראל · בלי הרשמה', W / 2, 1760);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  const URL_ = 'https://shaati.web.app/check';
  const text = () => (last && last.bad
    ? `בדקתי, ומרמים אותי ב-${last.hours ? nis(Math.round(last.month), 0) + ' בחודש' : nis(last.perHour, 2) + ' על כל שעה'} 😤 בדקו גם אתם ב-10 שניות: ${URL_}`
    : `בדקתי אם משלמים לי לפי החוק 💪 בדקו גם אתם ב-10 שניות: ${URL_}`);
  $('#ck-share').addEventListener('click', async () => {
    if (!last) return;
    const blob = await picture();
    const file = new File([blob], 'shaati-check.png', { type: 'image/png' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text() }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    // no sharing of files here (a computer): save the picture, and the WhatsApp link stays
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'shaati-check.png';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  $('#ck-wa').addEventListener('click', () => { window.open('https://wa.me/?text=' + encodeURIComponent(text()), '_blank', 'noopener'); });
  window.__check = { update, picture, state: () => last, data: D };
})();
