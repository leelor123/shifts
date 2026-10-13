/* ============================================================
 * views-onboarding.js — first-run questions and demo data.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, HebCal, Store, UI, App, Defaults } = root;
  const S = Store.S;
  const { icon, esc } = UI;

  /* ---------------- the setup questions ----------------
   * One friendly question per screen, with שעתי (the mascot) cheering along. Nothing is filled in
   * in advance: the grey text in a field is the usual answer, and a question that's skipped or left
   * empty simply gets that usual answer. Hard things (tax credit points, 5/6-day week, pension %,
   * pay period) are not asked here at all; they have sensible values and live in Settings.
   * opts.preLogin: the user hasn't signed in yet; the last step saves to their Google account.
   * Moving between screens never waits for storage, so a slow or broken phone database can't
   * freeze the buttons; the answers are saved once, at the end. */
  const JOBS = ['מלצרות', 'קופה', 'שליחויות', 'מכירות', 'מטבח', 'בייביסיטר', 'סדרנות', 'מוקד שירות', 'הדרכה', 'אבטחה'];
  const TOP_CITIES = ['ירושלים', 'תל אביב-יפו', 'חיפה', 'באר שבע', 'ראשון לציון', 'פתח תקווה', 'אשדוד', 'נתניה', 'חולון', 'רמת גן', 'בני ברק', 'רחובות'];
  const USUAL_TRAVEL = 16;

  App.sheetsApi.onboarding = function (opts) {
    opts = opts || {};
    const nav = document.getElementById('nav');
    nav.style.display = 'none';
    App.blocking = 'onboarding';
    const v = document.getElementById('view');
    const fx = root.Fx;
    const today = U.todayKey();
    const emp = Store.clone(S.employers[0]);
    const st = Store.clone(S.settings);
    const existing = S.roles.filter((r) => !r.archived);
    const A = {
      name: st.userName || '', gender: st.gender || '', birth: st.birthDate || '', adult: false,
      jobs: existing.length ? existing.map((r) => ({ id: r.id, name: r.name, rate: Engine.roleRate(r, today) || '', color: r.color, rates: r.rates })) : [{ id: 'r_' + U.uid(), name: '', rate: '', color: Defaults.ROLE_COLORS[0] }],
      travel: '', travelAmount: '', city: '', start: st.startDate || '', startPick: '',
    };
    const needsLogin = () => !!opts.preLogin && !App.localOnly && !(root.Cloud && root.Cloud.user);
    const STEPS = ['hi', 'me', 'age', 'job', 'travel', 'city', 'start', 'done'];
    const QUESTIONS = STEPS.length - 2;
    let step = 0, dir = 'next', saving = false, msg = '', saved = false, demo = false, blocked = false, loadFailed = false;
    // he / she / both, for the questions' wording
    const g = (m, f) => (A.gender === 'f' ? f : A.gender === 'm' ? m : m + '/' + f.replace(/^.*?(\S)$/, '$1'));
    const age = () => (A.birth ? Engine.ageAt(A.birth, today) : null);
    const minWage = () => Engine.legalMinWage(today, A.birth || null).hourly;
    const money = (n) => U.money(n, Number.isInteger(+n) ? 0 : 2);
    const say = (mood, html) => (App.mascotSays ? App.mascotSays(mood, html, { size: 84 }) : '');
    const why = (html) => `<div class="ob-why">${icon('info', 's')}<div>${html}</div></div>`;
    const chip = (attr, val, label, on) => `<button class="ob-chip ${on ? 'on' : ''}" ${attr}="${esc(val)}">${label}</button>`;
    const jobValid = () => A.jobs.filter((j) => j.name.trim() || +j.rate > 0);

    const screens = {
      hi: () => `<div class="ob-welcome">
        ${App.mascot ? App.mascot('wave', { size: 132, cls: 'hero' }) : '<div class="brand-mark big" aria-hidden="true"></div>'}
        <div class="bubble big">היי! אני שעתי 👋<br>אני אעזור לך לדעת בדיוק כמה כסף מגיע לך</div>
        <h1 class="brand-name">Shaati</h1>
        <div class="ob-points">
          <div style="--d:0">${UI.tile('clock', 'violet')}<span>לוחצים כשמתחילים לעבוד, ולוחצים כשמסיימים</span></div>
          <div style="--d:1">${UI.tile('wallet', 'mint')}<span>רואים כמה הרווחת, כולל שבתות ושעות נוספות</span></div>
          <div style="--d:2">${UI.tile('shield', 'amber')}<span>בודקים שהמשכורת נכונה ושלא מקפחים אותך</span></div>
        </div>
        <p class="small muted">6 שאלות קצרות, פחות מדקה</p></div>`,
      me: () => `${say(A.name ? 'love' : 'wave', A.name ? `נעים מאוד, ${esc(A.name.split(' ')[0])}! 😍` : 'בוא/י נכיר 😊')}
        <h1>איך קוראים לך?</h1>
        <label class="field"><input class="input big-in" id="ob-name" value="${esc(A.name)}" placeholder="השם שלך" autocomplete="given-name" maxlength="40" enterkeyhint="next"></label>
        <div class="ob-q2">ואת/ה...</div>
        <div class="ob-chips">${chip('data-gender', 'm', 'בן', A.gender === 'm')}${chip('data-gender', 'f', 'בת', A.gender === 'f')}${chip('data-gender', 'x', 'מעדיף/ה לא לומר', A.gender === 'x')}</div>
        ${why('השם רק כדי שנדבר אליך יפה. בן/בת עוזר לנו לחשב נכון: לבנות מגיע קצת פחות מס.')}`,
      age: () => {
        const a = age();
        return `${say(a != null && a < 18 ? 'wow' : 'happy', a != null ? (a < 18 ? `גיל ${a}! יש לך זכויות מיוחדות, נדאג להן 🛡️` : `גיל ${a}, מעולה 👍`) : 'שאלה קטנה על הגיל 🎂')}
        <h1>${g('מתי נולדת?', 'מתי נולדת?')}</h1>
        <label class="field"><input class="input" type="date" id="ob-birth" data-pick="birth" value="${esc(A.birth)}" min="1940-01-01" max="${U.addDays(today, -365 * 12)}" placeholder="בחירת תאריך לידה"></label>
        <div class="ob-live" id="ob-live-age"></div>
        <div class="ob-chips">${chip('data-adult', '1', 'אני מעל 18, מעדיף/ה לא לפרט', A.adult)}</div>
        ${why('מתחת לגיל 18 יש שכר מינימום אחר, לא משלמים מס, ויש חוקים מיוחדים (כמה שעות מותר לעבוד, הפסקות ועוד). נבדוק הכול בשבילך.')}`;
      },
      job: () => `${say(jobValid().length ? 'love' : 'think', jobValid().length ? 'אחלה! עכשיו נדע כמה הרווחת 💸' : 'איפה עובדים? 🤔')}
        <h1>${g('איפה אתה עובד?', 'איפה את עובדת?')}</h1>
        <div class="ob-sub">אפשר לכתוב כל מקום עבודה או תפקיד. הנה כמה רעיונות לבחירה מהירה:</div>
        <div class="ob-chips small">${JOBS.map((j) => chip('data-jobname', j, j, A.jobs.some((x) => x.name === j))).join('')}</div>
        ${A.jobs.map((j, i) => `<div class="ob-job" style="--c:${j.color}">
          <div class="ob-job-head"><span class="sw"></span>${A.jobs.length > 1 ? `עבודה ${i + 1}` : 'העבודה שלך'}${A.jobs.length > 1 ? `<button class="icon-btn sm" data-rx="${i}" aria-label="הסר">${icon('x', 's')}</button>` : ''}</div>
          <label class="field"><span class="lbl">מקום העבודה או התפקיד</span><input class="input" data-jn="${i}" value="${esc(j.name)}" placeholder="למשל: קופאי בסופר, מלצרית בקפה גרג" maxlength="40" autocomplete="off" enterkeyhint="next"></label>
          <label class="field"><span class="lbl">כמה משלמים לך לשעה? (₪)</span><input class="input" type="number" step="any" inputmode="decimal" data-jr="${i}" value="${esc(j.rate)}" placeholder="${U.num(minWage(), 2)}">
            <span class="hint">לא בטוח/ה? אפשר להשאיר ריק ונשים שכר מינימום${age() != null && age() < 18 ? ' לגילך' : ''}: ${U.money(minWage())} לשעה</span></label>
        </div>`).join('')}
        ${A.jobs.length < 4 ? `<button class="btn text sm" data-jadd>${icon('plus', 's')} יש לי עוד עבודה</button>` : ''}
        <div class="ob-live" id="ob-live-roles"></div>
        ${why('ככה נחשב כמה הרווחת בכל משמרת. אפשר לשנות ולהוסיף בכל רגע בהגדרות.')}`,
      travel: () => `${say(A.travel === 'yes' ? 'love' : 'happy', 'הרבה שוכחים את זה! 🚌')}
        <h1>${g('מקבל', 'מקבלת')} כסף על נסיעות?</h1>
        <div class="ob-chips big">${chip('data-travel', 'yes', icon('bus') + '<span>כן</span>', A.travel === 'yes')}${chip('data-travel', 'no', icon('walk') + '<span>לא</span>', A.travel === 'no')}${chip('data-travel', 'idk', icon('help') + '<span>לא בטוח/ה</span>', A.travel === 'idk')}</div>
        ${A.travel === 'yes' ? `<label class="field ob-pop"><span class="lbl">כמה ליום עבודה? (₪)</span><input class="input" type="number" step="any" inputmode="decimal" id="ob-travel" value="${esc(A.travelAmount)}" placeholder="${USUAL_TRAVEL}"><span class="hint">רוב העובדים מקבלים בערך ${USUAL_TRAVEL} ₪ ליום. אפשר להשאיר ריק ונשים ${USUAL_TRAVEL} ₪.</span></label>` : ''}
        <div class="ob-live" id="ob-live-travel"></div>
        ${why('המעסיק צריך להחזיר לך את דמי הנסיעה לעבודה ובחזרה, בנוסף לשכר. זה כסף שמגיע לך!')}`,
      city: () => `${say('wow', 'בשבת מרוויחים לפחות 150%! 🤑')}
        <h1>באיזו עיר העבודה?</h1>
        <div class="ob-chips small">${TOP_CITIES.map((c) => chip('data-city', c, esc(c), A.city === c)).join('')}</div>
        <label class="field"><span class="lbl">עיר אחרת</span><select class="input" id="ob-city"><option value="">בחירה מהרשימה…</option>${HebCal.CITIES.map((c) => `<option ${c.name === A.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <div class="ob-live" id="ob-preview"></div>
        ${why('לפי העיר נדע בדיוק מתי שבת וחג נכנסים ויוצאים, וכך כל שעה שעבדת בהם תחושב ב-150% לפחות.')}`,
      start: () => `${say('think', 'אחרונה! 🏁')}
        <h1>מתי ${g('התחלת', 'התחלת')} לעבוד שם?</h1>
        <div class="ob-chips">${chip('data-start', 'month', 'החודש', A.startPick === 'month')}${chip('data-start', 'months', 'לפני כמה חודשים', A.startPick === 'months')}${chip('data-start', 'year', 'לפני יותר משנה', A.startPick === 'year')}</div>
        <label class="field"><span class="lbl">או תאריך מדויק</span><input class="input" type="date" id="ob-start" value="${esc(A.startPick === 'exact' ? A.start : '')}" min="${A.birth ? U.addDays(A.birth, 365 * 12) : '1960-01-01'}" max="${today}" placeholder="בחירת תאריך"></label>
        ${why('לפי הוותק מגיעים ימי חופשה, דמי הבראה ופנסיה. לא בטוח/ה? אפשר לדלג ולהוסיף אחר כך.')}`,
      done: () => {
        const jobs = finalJobs();
        return `<div class="ob-done">
          ${App.mascot ? App.mascot(demo ? 'cool' : 'party', { size: 120, cls: 'hero' }) : ''}
          <h1>${demo ? 'הנתונים לדוגמה מוכנים!' : A.name ? `הכול מוכן, ${esc(A.name.split(' ')[0])}! 🎉` : 'הכול מוכן! 🎉'}</h1>
          <p class="lead">${demo ? 'אפשר להסתכל על הכול ולמחוק את הדוגמה בכל רגע.' : 'מעכשיו כל משמרת מחושבת לבד.'}</p>
          ${demo ? '' : `<div class="ob-summary">
            ${jobs.map((r) => `<span><i style="background:${r.color}"></i>${esc(r.name)} · ${money(r.rate)}</span>`).join('')}
            <span>${icon('bus', 's')} ${finalTravel() ? money(finalTravel()) + ' ליום' : 'בלי נסיעות'}</span><span>${icon('candle', 's')} ${esc(A.city || st.rest.city)}</span>${age() != null ? `<span>${icon('users', 's')} גיל ${age()}</span>` : ''}
          </div>`}
          ${needsLogin() ? `${root.App.inAppBrowser && App.inAppBrowser() ? App.openInBrowserCard() : ''}<div class="ob-save">${UI.tile('cloud', 'sky')}<div><b>שמירה בחשבון Google</b><div class="small muted">כדי שכלום לא ילך לאיבוד, ויחכה לך בכל טלפון. רק לך יש גישה.</div></div></div>` : ''}
          ${msg ? `<div class="banner warn" style="text-align:start">${icon('alert')}<div>${esc(msg)}</div></div>` : ''}
        </div>`;
      },
    };

    /* answers -> what gets saved (a skipped question gets the usual answer) */
    function finalJobs() {
      const list = A.jobs.filter((j) => j.name.trim() || +j.rate > 0).map((j) => Object.assign({}, j, { name: j.name.trim() || 'העבודה שלי', rate: +j.rate > 0 ? +j.rate : minWage() }));
      return list.length ? list : [{ id: A.jobs[0].id, name: 'העבודה שלי', rate: minWage(), color: A.jobs[0].color }];
    }
    function finalTravel() {
      if (A.travel === 'no') return 0;
      return +A.travelAmount > 0 ? +A.travelAmount : USUAL_TRAVEL;
    }

    function read() {
      const q = (s) => v.querySelector(s);
      const key = STEPS[step];
      if (key === 'me' && q('#ob-name')) A.name = q('#ob-name').value.trim().slice(0, 40);
      if (key === 'age' && q('#ob-birth')) { A.birth = q('#ob-birth').value || ''; if (A.birth) A.adult = false; }
      if (key === 'job') {
        v.querySelectorAll('[data-jn]').forEach((i) => (A.jobs[+i.dataset.jn].name = i.value.slice(0, 40)));
        v.querySelectorAll('[data-jr]').forEach((i) => { const n = UI.numIn(i); A.jobs[+i.dataset.jr].rate = n != null && n > 0 && n < 1000 ? n : ''; });
      }
      if (key === 'travel' && q('#ob-travel')) { const n = UI.numIn(q('#ob-travel')); A.travelAmount = n != null && n >= 0 && n < 500 ? n : ''; }
      if (key === 'start' && q('#ob-start') && q('#ob-start').value) { A.start = q('#ob-start').value; A.startPick = 'exact'; }
    }
    /* live previews: the numbers react while typing */
    function live() {
      const q = (s) => v.querySelector(s);
      const key = STEPS[step];
      if (key === 'job') {
        read();
        const j = finalJobs()[0];
        const el = q('#ob-live-roles');
        if (el) el.innerHTML = `${icon('sparkle', 's')} משמרת של 8 שעות${j.name !== 'העבודה שלי' ? ' (' + esc(j.name) + ')' : ''} = <b>${money(Math.round(j.rate * 8 * 100) / 100)}</b>`;
      }
      if (key === 'travel') {
        const el = q('#ob-live-travel');
        if (el) el.innerHTML = A.travel && A.travel !== 'no' ? `${icon('car', 's')} בחודש של 15 ימי עבודה זה עוד <b>${money(finalTravel() * 15)}</b>` : '';
      }
      if (key === 'age') {
        const el = q('#ob-live-age');
        const a = age();
        if (!el) return;
        el.innerHTML = a == null ? '' : `${icon('shield', 's')} ${a < 18 ? `שכר המינימום שלך: <b>${U.money(minWage())}</b> לשעה, ובלי מס בכלל` : `שכר המינימום: <b>${U.money(minWage())}</b> לשעה`}`;
      }
      if (key === 'city') {
        const el = q('#ob-preview');
        const city = A.city || '';
        if (!el) return;
        if (!city) { el.innerHTML = ''; return; }
        const cfg = Object.assign({}, st.rest, { city, dayRules: [] });
        const w = HebCal.restWindows(today, U.addDays(today, 10), cfg).find((x) => x.end > Date.now());
        el.innerHTML = w ? `${icon('candle', 's')} ${esc(w.label)} הקרובה ב${esc(city)}: נכנסת ${U.HEB_DAYS[U.dow(U.epochKey(w.start))]} ב-${U.epochHM(w.start)}, יוצאת ב-${U.epochHM(w.end)}` : '';
      }
    }
    function draw() {
      const key = STEPS[step];
      const last = key === 'done';
      const qi = step; // questions are steps 1..6
      let foot;
      if (key === 'hi') {
        foot = `<button class="btn big ob-go" data-next>בואו נתחיל</button>
          <button class="btn tonal" data-demo>${icon('flask')} רק להציץ (נתונים לדוגמה)</button>
          ${opts.preLogin ? '<button class="btn text" data-have>כבר יש לי חשבון? התחברות</button>' : ''}
          <div class="tiny muted ob-consent">בהמשך אתה מאשר את ${App.legalLinks ? App.legalLinks() : 'תנאי השימוש ומדיניות הפרטיות'}.</div>`;
      } else if (last) {
        const ready = !needsLogin() || root.Cloud.sdkReady();
        foot = needsLogin()
          ? `<button class="btn big ob-google" data-save ${saving || (!ready && !loadFailed) ? 'disabled' : ''}>${App.googleIcon || ''}<span>${saving ? 'שומר…' : !ready && !loadFailed ? 'רגע, מכינים את Google…' : 'שמירה עם Google'}</span></button>
            ${blocked ? '<button class="btn text sm" data-redirect>לא נפתח חלון? התחברות בדרך אחרת</button>' : ''}
            ${loadFailed ? '<button class="btn text sm" data-later>להמשיך בינתיים בלי חשבון</button>' : ''}`
          : `<button class="btn big ob-go" data-save ${saving ? 'disabled' : ''}>${saving ? 'רגע…' : 'כניסה לאפליקציה'}</button>`;
      } else {
        foot = `<button class="btn big ob-go" data-next>${qi === QUESTIONS ? 'סיום' : 'הבא'}</button>`;
      }
      const top = key === 'hi' || last ? '' : `<div class="ob-top">
        <button class="icon-btn" data-back aria-label="הקודם">${icon('right')}</button>
        <div class="ob-dots" aria-label="שאלה ${qi} מתוך ${QUESTIONS}">${Array.from({ length: QUESTIONS }, (_, i) => `<i class="${i + 1 < qi ? 'done' : i + 1 === qi ? 'on' : ''}"></i>`).join('')}</div>
        <button class="btn text sm ob-skip" data-skip>דלג</button></div>`;
      v.innerHTML = `<div class="wizard ob ob3 step-${key}"><div class="ob-bg" aria-hidden="true"><i></i><i></i><i></i></div>${top}
        <div class="content ob-${dir}">${screens[key]()}</div>
        <div class="foot col">${foot}</div></div>`;
      live();
      const city = v.querySelector('#ob-city');
      if (city) city.onchange = () => { if (city.value) { A.city = city.value; draw(); } };
      if (App.bindOpenInBrowser) App.bindOpenInBrowser(v);
      window.scrollTo(0, 0);
    }
    function go(next) {
      read();
      dir = next > step ? 'next' : 'prev';
      step = Math.max(0, Math.min(STEPS.length - 1, next));
      draw();
      if (fx) { fx.play(dir === 'next' ? 'pop' : 'soft'); fx.haptic(8); }
      if (STEPS[step] === 'done' && fx) setTimeout(() => fx.celebrate('big'), 250);
      if (STEPS[step] === 'done' && needsLogin() && !root.Cloud.sdkReady()) {
        // Google normally finished loading long ago; on a slow network the button waits for it
        root.Cloud.sdk().then(() => { if (App.blocking === 'onboarding') draw(); }, () => { loadFailed = true; if (App.blocking === 'onboarding') { msg = navigator.onLine ? 'לא הצלחנו לטעון את Google. נסה שוב בעוד רגע.' : 'אין חיבור לאינטרנט. אפשר להמשיך בינתיים, ונשמור בחשבון כשהרשת תחזור.'; draw(); } });
      }
    }
    // answering a one-tap question moves on by itself
    const autoNext = () => setTimeout(() => { if (App.blocking === 'onboarding') go(step + 1); }, 380);

    // the answers are saved once; the demo button and the last step share that one save
    let saving$ = null;
    const ensureSaved = (withDemo) => saving$ || (saving$ = save(withDemo));
    async function save(withDemo) {
      const jobs = withDemo && !jobValid().length ? Defaults.defaultRoles(emp.id).map((r) => Object.assign(r, { rate: r.rates[0].rate })) : finalJobs();
      emp.travelPerDay = finalTravel();
      const ops = [{ store: 'employers', put: emp }];
      jobs.forEach((j, i) => {
        const rates = j.rates && j.rates.length ? j.rates.slice().sort((a, b) => a.from.localeCompare(b.from)) : [{ from: '2000-01-01', rate: j.rate }];
        rates[rates.length - 1] = Object.assign({}, rates[rates.length - 1], { rate: j.rate });
        ops.push({ store: 'roles', put: { id: j.id || 'r_' + U.uid(), name: j.name, color: j.color || Defaults.ROLE_COLORS[i % Defaults.ROLE_COLORS.length], employerId: emp.id, rates, archived: false } });
      });
      S.roles.filter((r) => !jobs.some((x) => x.id === r.id)).forEach((r) => ops.push({ store: 'roles', del: r.id }));
      st.userName = A.name;
      st.gender = A.gender === 'm' || A.gender === 'f' ? A.gender : '';
      if (st.gender === 'f') st.tax.creditPoints = 2.75; else if (st.gender === 'm') st.tax.creditPoints = 2.25;
      st.birthDate = A.birth || null;
      if (A.city) st.rest.city = A.city;
      st.startDate = A.start || null;
      st.onboarded = true;
      // the answers are in memory either way; a storage hiccup is reported but never blocks the way in
      try {
        await Store.apply(ops, null);
        await Store.setSettings((s) => Object.assign(s, st));
        if (withDemo) await App.demo.load();
      } catch (e) {
        console.warn('saving the setup answers', e);
        Object.assign(S.settings, st);
        UI.toast('לא הצלחנו לשמור בטלפון. התשובות יישמרו בחשבון שלך.');
      }
      saved = true;
      if (S.meta.lastRole == null && jobs[0]) Store.setMeta({ lastRole: jobs[0].id }).catch(() => {});
      return true;
    }
    function enterApp() {
      v.onclick = null;
      v.oninput = null;
      App.blocking = null;
      nav.style.display = '';
      App.go = prevGo;
      if (needsLogin()) return; // still on the save step
      App.firstRun = !demo; // the home screen walks a new user through the first steps
      if (!demo && !S.meta.guide) Store.setMeta({ guide: Date.now() }).catch(() => {});
      App.afterLogin();
      setTimeout(() => App.runInsights(), 500);
    }
    function finishStep(redirect) {
      if (saving) return;
      const Cloud = root.Cloud;
      if (needsLogin()) {
        // open the Google window first, inside this tap (the browser blocks it after any waiting); save meanwhile
        let p;
        try { p = Cloud.signIn(redirect ? { redirect: true } : null); } catch (e) { p = Promise.reject(e); }
        p.catch(() => {}); // handled below, after the answers are saved
        saving = true; msg = ''; blocked = false; draw();
        ensureSaved(false).then(() => p).then(async (user) => {
          if (!user) return; // full-page sign-in: the page comes back signed in and finishes there
          await Cloud.connect(user);
          UI.toast('מחובר כ-' + (user.displayName || user.email));
          saving = false;
          enterApp();
        }).catch((e) => {
          console.warn('sign-in', e);
          saving = false;
          blocked = e && e.code === 'auth/popup-blocked';
          msg = blocked ? 'הדפדפן חסם את חלון ההתחברות של Google. לחצו שוב על הכפתור 👇' : Cloud.errorText(e);
          draw();
        });
        return;
      }
      saving = true; draw();
      ensureSaved(false).then(async () => {
        // signed in already (back from Google, or from Settings): make sure the account is connected
        if (Cloud && Cloud.user && !Cloud.connected && !App.localOnly) { try { await Cloud.connect(Cloud.user); } catch (e) { console.warn(e); } }
        saving = false;
        enterApp();
      });
    }
    v.onclick = async (e) => {
      const b = e.target.closest('button, a');
      if (!b || b.disabled) return;
      if (b.dataset.legal) return; // the terms links open their own sheet
      if (b.hasAttribute('data-next')) {
        if (step === 0 && App.acceptLegal) App.acceptLegal().catch((x) => console.warn(x)); // never waits: the next screen comes first
        go(step + 1);
      } else if (b.hasAttribute('data-back')) go(step - 1);
      else if (b.hasAttribute('data-skip')) {
        // a skipped question keeps the usual answer
        const key = STEPS[step];
        if (key === 'job') { A.jobs.forEach((j) => { j.name = ''; j.rate = ''; }); v.querySelectorAll('[data-jn], [data-jr]').forEach((i) => { i.value = ''; }); }
        if (key === 'travel' && !A.travel) A.travel = 'idk';
        go(step + 1);
      } else if (b.hasAttribute('data-demo')) {
        if (App.acceptLegal) App.acceptLegal().catch((x) => console.warn(x));
        demo = true;
        go(STEPS.length - 1);
        await ensureSaved(true);
        draw();
      } else if (b.hasAttribute('data-have')) {
        if (App.acceptLegal) App.acceptLegal().catch((x) => console.warn(x));
        v.onclick = null; v.oninput = null; App.go = prevGo;
        App.blocking = null;
        App.showLogin();
      } else if (b.hasAttribute('data-save')) finishStep(false);
      else if (b.hasAttribute('data-redirect')) finishStep(true);
      else if (b.hasAttribute('data-later')) { App.localOnly = true; finishStep(false); }
      else if (b.dataset.gender) {
        A.gender = b.dataset.gender; read();
        v.querySelectorAll('[data-gender]').forEach((x) => x.classList.toggle('on', x === b));
        if (fx) fx.play('on');
        if (v.querySelector('#ob-name').value.trim()) autoNext();
      } else if (b.dataset.adult) { A.adult = true; A.birth = ''; const bi = v.querySelector('#ob-birth'); if (bi) bi.value = ''; b.classList.add('on'); if (fx) fx.play('on'); autoNext(); }
      else if (b.dataset.jobname) {
        read();
        const empty = A.jobs.find((j) => !j.name.trim());
        (empty || A.jobs[A.jobs.length - 1]).name = b.dataset.jobname;
        draw(); if (fx) fx.play('on');
        const rate = v.querySelector('[data-jr="' + A.jobs.indexOf(empty || A.jobs[A.jobs.length - 1]) + '"]');
        if (rate && !rate.value) rate.focus();
      } else if (b.hasAttribute('data-jadd')) {
        read();
        const used = new Set(A.jobs.map((j) => j.color));
        A.jobs.push({ id: 'r_' + U.uid(), name: '', rate: '', color: Defaults.ROLE_COLORS.find((c) => !used.has(c)) || '#888' });
        draw();
      } else if (b.dataset.rx != null) { read(); A.jobs.splice(+b.dataset.rx, 1); draw(); }
      else if (b.dataset.travel) {
        read(); A.travel = b.dataset.travel; draw(); if (fx) fx.play('on');
        if (A.travel === 'yes') { const t = v.querySelector('#ob-travel'); if (t) t.focus(); } else autoNext();
      } else if (b.dataset.city) { A.city = b.dataset.city; draw(); if (fx) fx.play('on'); autoNext(); }
      else if (b.dataset.start) {
        const m = { month: today.slice(0, 8) + '01', months: U.addMonths(today, -3), year: U.addMonths(today, -13) }[b.dataset.start];
        A.start = A.birth && m < A.birth ? today : m; A.startPick = b.dataset.start;
        v.querySelectorAll('[data-start]').forEach((x) => x.classList.toggle('on', x === b));
        if (fx) fx.play('on');
        autoNext();
      }
    };
    v.oninput = (e) => {
      if (e.target.id === 'ob-birth') { read(); draw(); return; }
      if (e.target.id === 'ob-start') { read(); v.querySelectorAll('[data-start]').forEach((x) => x.classList.remove('on')); return; }
      if (e.target.id === 'ob-name') {
        // the mascot greets you by name
        A.name = e.target.value.trim();
        const bubble = v.querySelector('.m-say .bubble');
        if (bubble) bubble.innerHTML = A.name ? `נעים מאוד, ${esc(A.name.split(' ')[0])}! 😍` : 'בוא/י נכיר 😊';
        return;
      }
      live();
    };
    v.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.matches('input') && STEPS[step] !== 'hi' && STEPS[step] !== 'done') { e.preventDefault(); e.target.blur(); go(step + 1); }
    };
    draw();
    // leaving the wizard any other way detaches its handlers
    const prevGo = App.go;
    App.go = function (tab, o) { v.onclick = null; v.oninput = null; v.onkeydown = null; App.go = prevGo; return prevGo(tab, o); };
  };

  /* ---------------- demo data ---------------- */
  function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
  App.demo = {
    async load() {
      const R = rng(42);
      const roles = App.roles();
      const role = (name) => (roles.find((r) => r.name === name) || roles[Math.floor(R() * roles.length)] || {}).id;
      const sadran = role('סדרן'), miznon = role('מזנון'), achmash = role('אחמ״ש');
      const emp = S.employers[0];
      const today = U.todayKey();
      const ops = [];
      const mk = (date, from, to, roleId, extra) => {
        const start = U.toEpoch(date, from);
        let end = U.toEpoch(date, to);
        if (end <= start) end = U.toEpoch(U.addDays(date, 1), to);
        return Object.assign({ id: 'demo_' + U.uid(), kind: 'shift', employerId: emp.id, roleId, status: 'done', start, end, splits: [], breakMin: 0, breakPaid: true, noTravel: false, items: [], note: '', demo: true }, extra || {});
      };
      for (let i = 125; i >= 1; i--) {
        const k = U.addDays(today, -i);
        const dw = U.dow(k);
        const p = R();
        if (dw === 6 && p < 0.45) ops.push(mk(k, '10:00', R() < 0.5 ? '19:00' : '17:00', R() < 0.6 ? sadran : miznon));
        else if (dw === 5 && p < 0.55) ops.push(mk(k, '13:00', '21:00', R() < 0.5 ? sadran : miznon, { note: R() < 0.2 ? 'ערב שבת עמוס' : '' }));
        else if (dw < 5 && p < 0.62) {
          const x = R();
          if (x < 0.35) ops.push(mk(k, '08:00', '16:00', sadran, { breakMin: 30, breakPaid: false }));
          else if (x < 0.6) ops.push(mk(k, '16:00', '00:00', miznon, { items: R() < 0.3 ? [{ id: U.uid(), type: 'tips', amount: Math.round(40 + R() * 80), label: 'טיפים' }] : [] }));
          else if (x < 0.8) {
            const s = mk(k, '15:00', '01:00', sadran);
            s.splits = [{ at: U.toEpoch(k, '19:00'), roleId: achmash }];
            ops.push(s);
          } else ops.push(mk(k, '07:00', '18:00', achmash));
        }
      }
      // one override example + one bonus
      const sat = ops.filter((s) => U.dow(U.epochKey(s.start)) === 6)[1];
      if (sat) { sat.overrides = { rest: { scope: 'range', from: sat.start + 2 * U.HOUR, to: sat.end } }; sat.overrideReason = 'המעסיק סופר שבת רק מ-12:00'; }
      if (ops[10]) ops[10].items.push({ id: U.uid(), type: 'bonus', amount: 150, label: 'בונוס אירוע' });
      if (ops[20]) ops[20].items.push({ id: U.uid(), type: 'deduction', amount: 25, label: 'ארוחה' });
      // planned shifts
      ops.push(mk(U.addDays(today, 1), '16:00', '00:00', miznon, { status: 'planned' }));
      ops.push(mk(U.addDays(today, 3), '08:00', '16:00', sadran, { status: 'planned' }));
      const ent = [
        { id: 'demo_' + U.uid(), kind: 'vacation', date: U.addDays(today, -40), status: 'done', employerId: emp.id, demo: true },
        ...[0, 1, 2].map((d) => ({ id: 'demo_' + U.uid(), kind: 'sick', date: U.addDays(today, -70 + d), status: 'done', employerId: emp.id, demo: true })),
        { id: 'demo_' + U.uid(), kind: 'adjustment', type: 'bonus', amount: 300, label: 'מענק חג', date: U.addDays(today, -25), status: 'done', employerId: emp.id, demo: true },
      ];
      const all = [...ops.map((x) => ({ store: 'shifts', put: x })), ...ent.map((x) => ({ store: 'entries', put: x }))];
      all.push({ store: 'templates', put: { id: 'demo_tpl1', name: 'בוקר סדרן', roleId: sadran, employerId: emp.id, startT: '08:00', endT: '16:00', breakMin: 30, breakPaid: false, noTravel: false, splits: [], demo: true } });
      await Store.apply(all, null);
      // demo needs >1 year of seniority to show recuperation & pension checks; the real value is restored on clear
      await Store.setMeta({ demoPrevStart: S.settings.startDate || null });
      await Store.setSettings((s) => { s.demo = true; if (!s.startDate || s.startDate > U.addDays(today, -400)) s.startDate = U.addDays(today, -400); });
      // a sample payslip for last pay period, with one shift "forgotten" by the employer
      App.recompute();
      const P = Engine.periodByKey(U.addMonthKey(Engine.periodOf(today, emp).key, -1), emp);
      const ex = root.Payslip.expected(App.model, P.key, false);
      if (ex.shifts.length > 2) {
        // the employer "forgot" the last shift of the period entirely
        const miss = ex.shifts[ex.shifts.length - 1];
        const f = (v) => Math.round(v * 100) / 100;
        const pay = Object.assign({}, ex.pay), hrs = Object.assign({}, ex.hrs);
        for (const l of miss.lines) {
          const k = l.rest ? ['rest150', 'rest175', 'rest200'][l.tier] : ['base', 'ot125', 'ot150'][l.tier];
          pay[k] -= l.amount; hrs[k] -= l.hours;
        }
        const travel = ex.t.travel - (+emp.travelPerDay || 0);
        const gross = pay.base + pay.ot125 + pay.ot150 + pay.rest150 + pay.rest175 + pay.rest200 + travel + ex.t.bonus + ex.t.additions + ex.t.leavePay;
        const n = Engine.netEstimate({ gross, pensionBase: ex.t.base - miss.base, deductions: 0, periodTo: P.to }, S.settings);
        const fields = {
          base: { value: f(pay.base), qty: f(hrs.base), rate: f(pay.base / hrs.base) },
          ot125: { value: f(pay.ot125), qty: f(hrs.ot125) }, ot150: { value: f(pay.ot150), qty: f(hrs.ot150) },
          rest150: { value: f(pay.rest150), qty: f(hrs.rest150) }, rest175: { value: f(pay.rest175 + pay.rest200), qty: f(hrs.rest175 + hrs.rest200) },
          travel: { value: f(travel) }, gross: { value: f(gross) }, nationalInsurance: { value: f(n.bl) }, healthTax: { value: f(n.health) },
          incomeTax: { value: f(n.incomeTax) }, creditPoints: { value: S.settings.tax.creditPoints },
          totalDeductions: { value: f(n.bl + n.health + n.incomeTax + n.pensionEmployee) }, net: { value: f(gross - n.bl - n.health - n.incomeTax - n.pensionEmployee) },
        };
        if (n.pensionActive) { fields.pensionEmployee = { value: f(n.pensionEmployee) }; fields.pensionEmployer = { value: f(n.pensionEmployer) }; }
        for (const k of Object.keys(fields)) if (!fields[k].value && k !== 'creditPoints') delete fields[k];
        await Store.apply([{ store: 'payslips', put: { id: 'demo_slip', period: P.key, employerId: emp.id, fields, other: [], text: '', source: 'manual', demo: true, summary: { counts: {}, totalMissing: 0, gross: f(gross), net: fields.net.value } } }], null);
      }
      App.recompute();
      // store the demo payslip summary with real counts
      const slip = S.payslips.find((p) => p.id === 'demo_slip');
      if (slip) {
        const a = root.Payslip.analyze(slip, App.model);
        const counts = { ok: 0, warn: 0, bad: 0 };
        a.findings.forEach((x) => counts[x.status]++);
        const gaps = a.findings.filter((x) => x.status === 'bad' && x.amount > 0).map((x) => ({ store: 'gaps', put: { id: 'demo_gap_' + x.area, payslipId: slip.id, period: slip.period, area: x.area, title: x.title, amount: Math.round(x.amount * 100) / 100, status: 'open', demo: true } }));
        await Store.apply([{ store: 'payslips', put: Object.assign({}, slip, { summary: Object.assign({}, slip.summary, { counts, totalMissing: a.totalMissing }) }) }, ...gaps], null);
      }
      App.runInsights();
    },
    async clear() {
      const ops = [];
      for (const s of ['shifts', 'entries', 'payslips', 'gaps', 'templates', 'dayRules']) S[s].filter((x) => x.demo).forEach((x) => ops.push({ store: s, del: x.id }));
      S.notifications.forEach((n) => ops.push({ store: 'notifications', del: n.id }));
      await Store.apply(ops, null);
      const prevStart = S.meta.demoPrevStart;
      await Store.setSettings((s) => { s.demo = false; if (prevStart !== undefined) s.startDate = prevStart; });
      await Store.setMeta({ lastAnomalyPush: null, demoPrevStart: undefined });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
