/* ============================================================
 * workplace.js: "a workplace code": share my workplace's rules with coworkers, or apply theirs (core/workplace.js).
 *
 * Settings › my work › a workplace › "share the rules" makes a short code and a link (?wp=CODE). The record,
 * wpc/{code}, holds only the rules (core/workplace.js pack: no shift, no amount, no person, hourly rates only when
 * the sharer turns them on); who owns it is wpo/{code}, read only by them (firestore.rules). The sharer can put
 * today's rules in (a new version) or delete the code. What I shared is kept in the settings (wpShare: { workplace id:
 * { c, v, rates } }), so every phone of the account knows it.
 *
 * A coworker opens the link, or types the code (Settings, or the setup questions' job step): reading needs an
 * account, so a code that came before signing in waits on the phone; a guest is told to sign in. They see the rules
 * with a note to check them against their contract, and apply them to a workplace of theirs, or a new one, in a tap.
 * ============================================================ */
(function (root) {
  'use strict';
  const { Store, UI, App, U, Engine, Defaults } = root;
  const W = root.Workplace;
  const S = Store.S;
  const { icon, esc } = UI;
  const APP_URL = 'https://leelor123.github.io/shifts/';
  const Cloud = () => root.Cloud;
  const signedIn = () => !!(Cloud() && Cloud().user);
  const uid = () => Cloud().user.uid;
  const View = {};
  root.WorkplaceCode = View;

  /* a code that came with the address: kept until it is shown (signing in may take a reload), off the address at once */
  const KEY = 'shaati.wp';
  try {
    const c = W.codeFrom(location.search);
    if (c) {
      localStorage.setItem(KEY, c);
      const u = new URL(location.href); u.searchParams.delete('wp');
      history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
    }
  } catch (e) { /* no storage: the link is not kept */ }
  const pending = () => { try { return W.parse(localStorage.getItem(KEY) || ''); } catch (e) { return null; } };
  const keep = (c) => { try { localStorage.setItem(KEY, c); } catch (e) { /* none */ } };
  const drop = () => { try { localStorage.removeItem(KEY); } catch (e) { /* none */ } };

  const mine = (empId) => { const all = S.settings.wpShare; const x = all && typeof all === 'object' ? all[empId] : null; return x && W.CODE_RE.test(x.c || '') ? x : null; };
  const setMine = (empId, v) => Store.setSettings((s) => { s.wpShare = Object.assign({}, s.wpShare && typeof s.wpShare === 'object' ? s.wpShare : {}, { [empId]: v }); });
  const denied = (e) => !!e && /permission/i.test(e.code || e.message || '');
  // writing: a refusal is about the record (the rules check every field), not about who may use the code
  const errText = (e, writing) => (!navigator.onLine ? 'אין חיבור לאינטרנט' : e && e.code === 'shaati/wp-gone' ? 'הקוד כבר נמחק. אפשר ליצור קוד חדש'
    : writing && (denied(e) || (e && e.code === 'shaati/wp-record')) ? 'לא הצלחנו לשמור את הקוד. נסו שוב בעוד רגע'
      : denied(e) ? 'אין הרשאה לקוד הזה' : 'משהו השתבש. נסו שוב בעוד רגע');
  /** A write the rules refused goes to the error reports with the part of the record they would refuse (no values). */
  const report = (step, part) => { try { if (root.Errors) root.Errors.capture(new Error('workplace code ' + step + ' refused at ' + (part || 'unknown')), 'error'); } catch (x) { /* none */ } };
  const linkOf = (c) => APP_URL + '?wp=' + c;
  const codeHtml = (c) => `<bdi dir="ltr" class="wp-code-t">${esc(W.pretty(c))}</bdi>`;
  const hm = (t) => `<bdi dir="ltr">${esc(t)}</bdi>`;
  const pct = (n) => `${U.num(n)}%`;

  /** Signing in, from a sheet (as the account section does it). */
  function toLogin() { UI.closeAll(); setTimeout(() => { App.localOnly = false; App.showLogin(); }, 350); }
  /** A guest (no account): codes need one. */
  async function needAccount(sharing) {
    const r = await UI.dialog({
      title: sharing ? 'כדי לשתף קוד צריך חשבון' : 'כדי להשתמש בקוד צריך חשבון',
      text: sharing ? 'הקוד נשמר בחשבון שלך, כדי שתוכלו לעדכן או למחוק אותו מכל טלפון.' : 'רק מי שמחובר/ת לחשבון יכול/ה לקרוא את החוקים שבקוד. הנתונים שלך עוברים לחשבון יחד איתך.',
      buttons: [{ label: 'לא עכשיו', value: false }, { label: 'התחברות', value: true }],
    });
    if (r) toLogin();
  }

  /** The record's rules, line by line: [key, label, value html]. chg: keys that would change (marked). */
  function lines(r, chg, noName) {
    const has = (k) => k in r;
    const out = [];
    if (r.n && !noName) out.push(['n', 'שם מקום העבודה', esc(r.n)]);
    if (has('periodStartDay')) out.push(['periodStartDay', 'תקופת שכר', r.periodStartDay > 1 ? `מה-${r.periodStartDay} בחודש עד ה-${r.periodStartDay - 1} בחודש הבא` : 'חודש קלנדרי']);
    if (has('payDay')) out.push(['payDay', 'יום התשלום', `ב-${r.payDay} בחודש הבא`]);
    if (has('travelPerDay')) out.push(['travelPerDay', 'נסיעות', r.travelPerDay > 0 ? `${U.money(r.travelPerDay)} ליום${+r.travelMonthlyCap > 0 ? ', עד ' + U.money(r.travelMonthlyCap, 0) + ' בחודש' : ''}` : 'בלי החזר נסיעות']);
    if (has('defaultBreakPaid')) out.push(['defaultBreakPaid', 'הפסקה', r.defaultBreakPaid ? 'בתשלום' : 'לא בתשלום']);
    if (has('otLaw')) out.push(['otLaw', 'שעות נוספות', r.otLaw ? 'לפי החוק' : `אחרי ${U.num(r.otThreshold || 8)} שעות ביום: ${pct(r.otTier1Pct || 125)} ל-${U.num(r.otTier1Hours != null ? r.otTier1Hours : 2)} השעות הראשונות, ואחר כך ${pct(r.otTier2Pct || 150)}`]);
    if (r.ww) out.push(['ww', 'ימי עבודה בשבוע', r.ww === 6 ? '6 ימים' : '5 ימים']);
    if (has('restPct')) out.push(['restPct', 'שבת וחג', `${pct(r.restPct)}${has('restOt1Pct') ? `, בשעות נוספות ${pct(r.restOt1Pct)} ואחר כך ${pct(r.restOt2Pct || r.restOt1Pct)}` : ''}`]);
    if (has('nightEnabled')) out.push(['nightEnabled', 'תוספת לילה', r.nightEnabled ? `${r.nightType === 'fixed' ? U.money(r.nightValue || 0) + ' לשעה' : pct(r.nightValue || 0)} בין ${hm(r.nightFrom || '22:00')} ל-${hm(r.nightTo || '06:00')}` : 'אין']);
    if (has('evePct')) out.push(['evePct', 'ערב שבת וחג', r.evePct > 0 ? pct(r.evePct) : 'אין']);
    if (has('roundingMode')) out.push(['roundingMode', 'עיגול שעות', r.roundingMode === 'none' ? 'בלי עיגול' : `ל-${U.num(r.roundingUnit || 15)} דקות, ${{ nearest: 'לקרוב', up: 'כלפי מעלה', down: 'כלפי מטה' }[r.roundingMode]}`]);
    if (r.ro && r.ro.length) out.push(['ro', 'תפקידים', r.ro.map((x) => `<span class="wp-role">${esc(x.n)}${x.r > 0 ? `: ${U.money(x.r)} לשעה` : ''}</span>`).join('')]);
    // a key of FIELDS that is part of a line already shown counts as that line's change
    const part = { travelMonthlyCap: 'travelPerDay', otThreshold: 'otLaw', otTier1Hours: 'otLaw', otTier1Pct: 'otLaw', otTier2Pct: 'otLaw', restOt1Pct: 'restPct', restOt2Pct: 'restPct', nightFrom: 'nightEnabled', nightTo: 'nightEnabled', nightType: 'nightEnabled', nightValue: 'nightEnabled', roundingUnit: 'roundingMode' };
    const changed = new Set((chg || []).map((k) => part[k] || k));
    return out.map(([k, l, v]) => `<div class="kv wp-line"><span>${l}${chg && changed.has(k) ? ' <span class="tag wp-chg">משתנה</span>' : ''}</span><b>${v}</b></div>`).join('');
  }

  /* ---------------- sharing ---------------- */
  const packFor = (e, rates) => W.pack({ employer: e, roles: S.roles.filter((r) => r.employerId === e.id), workWeek: S.settings.leave && S.settings.leave.workWeek, rates, today: U.todayKey() });

  async function write(e, c, v, rates) {
    const { fs, db } = await Cloud().sdk();
    if (v > 1) {
      // one version up from the one in the cloud (another phone of mine may have put one in since)
      const now = await fs.getDoc(fs.doc(db, 'wpc', c));
      if (!now.exists()) { await setMine(e.id, null); throw Object.assign(new Error('gone'), { code: 'shaati/wp-gone' }); }
      v = (Number.isInteger(now.data().v) ? now.data().v : 0) + 1;
    }
    const b = fs.writeBatch(db);
    const rec = { v, t: Date.now(), r: packFor(e, rates) };
    // the same check as firestore.rules, before the network: a record they would refuse is never sent
    const bad = W.check(rec.r);
    if (bad) { report(v === 1 ? 'create' : 'update', bad); throw Object.assign(new Error('record'), { code: 'shaati/wp-record' }); }
    if (v === 1) b.set(fs.doc(db, 'wpo', c), { o: uid() });
    b.set(fs.doc(db, 'wpc', c), rec);
    try { await b.commit(); } catch (x) {
      // a new code is retried under another one (a taken code is refused too); the last refusal is reported
      if (denied(x) && v > 1) report('update', 'rules');
      throw x;
    }
    await setMine(e.id, { c, v, rates: !!rates });
  }
  async function create(e, rates) {
    // a new code is random; a taken one (nearly never) is refused by the rules, and another is tried
    for (let i = 0; i < 3; i++) {
      const c = W.code((k) => { const a = new Uint8Array(k); crypto.getRandomValues(a); return a; });
      try { await write(e, c, 1, rates); return c; } catch (x) {
        if (!denied(x) || i === 2) { if (denied(x)) report('create', 'rules'); throw x; }
      }
    }
    return null;
  }
  async function remove(c) {
    const { fs, db } = await Cloud().sdk();
    const b = fs.writeBatch(db);
    b.delete(fs.doc(db, 'wpc', c));
    b.delete(fs.doc(db, 'wpo', c));
    await b.commit();
  }

  /** The sharing sheet of a workplace: what is shared, the code and its link, a new version, deleting it. */
  View.share = function (empId) {
    if (!signedIn()) { needAccount(true); return; }
    const id = App.employer(empId).id;
    const cur = () => App.employer(id);
    let rates = false, busy = false, typed = '';
    // a workplace still called by the default name tells a coworker nothing: its real name is asked first (and kept)
    const needName = () => !mine(id) && cur().name === Defaults.defaultEmployer().name;
    const body = () => {
      const e = cur();
      const m = mine(e.id);
      const r = packFor(e, m ? m.rates : rates);
      return `<div class="wp-share">
        ${needName() ? `<label class="field wp-name"><span class="lbl">איך קוראים למקום העבודה?</span><input class="input" id="wp-name" value="${esc(typed)}" placeholder="למשל: קפה גרג רמת אביב" maxlength="40" autocomplete="organization"><span class="hint">השם נשמר גם אצלך, וזה מה שחברים לעבודה יראו.</span></label>` : ''}
        ${m ? `<div class="card wp-code-card"><div class="small muted">הקוד של ${esc(e.name)}</div>${codeHtml(m.c)}<div class="tiny muted">גרסה ${m.v}${m.rates ? ' · כולל שכר לשעה' : ''}</div>
          <div class="wp-acts"><button class="btn" data-wp-send ${busy ? 'disabled' : ''}>${icon('share', 's')} שליחת הקישור</button><button class="btn tonal" data-wp-copy>${icon('copy', 's')} העתקת הקוד</button></div></div>`
        : `<p class="small wp-intro">${needName() ? 'חברים לעבודה מקבלים את החוקים בלחיצה אחת, ולא צריכים להגדיר הכול לבד.' : `חברים לעבודה מקבלים את החוקים של ${esc(e.name)} בלחיצה אחת, ולא צריכים להגדיר הכול לבד.`}</p>`}
        <div class="section-title">${icon('eye', 's')} מה נכנס לקוד</div>
        <div class="card">${lines(r, null, needName())}</div>
        <div class="tiny muted wp-note">${icon('lock', 's')} לא נכנסים לקוד משמרות, סכומים, השם שלך או פרטי החשבון.</div>
        ${m ? '' : `<div class="card">${App.F ? App.F.sw('לכלול את השכר לשעה', 'כבוי: רק שמות התפקידים. אצל כל אחד השכר יכול להיות שונה.', 'wp.rates', rates).replace('data-s=', 'data-wp-rates data-x=') : ''}</div>`}
        ${m ? `<div class="list wp-manage">
          <button class="item" data-wp-update ${busy ? 'disabled' : ''}><span class="lead">${icon('refresh')}</span><span class="body"><span class="t">עדכון הקוד לחוקים של היום</span><span class="s">גרסה ${m.v + 1}: מי שישתמש בקוד יקבל את החוקים כמו שהם אצלך עכשיו</span></span></button>
          <button class="item" data-wp-del ${busy ? 'disabled' : ''}><span class="lead" style="color:var(--bad)">${icon('trash')}</span><span class="body"><span class="t">מחיקת הקוד</span><span class="s">הקוד והקישור יפסיקו לעבוד. מי שכבר החיל את החוקים ישמור אותם</span></span></button>
        </div>` : ''}
      </div>`;
    };
    const foot = () => (mine(id) ? '' : `<button class="btn big block" data-wp-make ${busy || (needName() && !typed.trim()) ? 'disabled' : ''}>${busy ? 'יוצרים קוד…' : 'יצירת קוד'}</button>`);
    UI.openSheet({
      title: 'שיתוף החוקים של מקום העבודה', body: body(), foot: foot(),
      onMount: (el) => {
        const draw = () => {
          const b = el.querySelector('.sh-body');
          root.Dom.patch(b, body());
          let f = el.querySelector('.sh-foot');
          if (!foot()) { if (f) f.remove(); return; }
          if (!f) { f = document.createElement('div'); f.className = 'sh-foot'; el.appendChild(f); }
          root.Dom.patch(f, foot());
        };
        // the name field: the button waits for a name (set at once, without drawing the field again)
        el.addEventListener('input', (ev) => {
          if (ev.target.id !== 'wp-name') return;
          typed = ev.target.value.slice(0, 40);
          const mk = el.querySelector('[data-wp-make]');
          if (mk && !busy) mk.disabled = !typed.trim();
        });
        el.addEventListener('change', (ev) => { if (ev.target.matches('[data-wp-rates]')) { rates = ev.target.checked; setTimeout(draw, 220); } });
        el.addEventListener('click', async (ev) => {
          const b = ev.target.closest('button');
          if (!b || b.disabled) return;
          const e = cur();
          const m = mine(e.id);
          if (b.hasAttribute('data-wp-make')) {
            const name = typed.replace(/\s+/g, ' ').trim();
            if (needName() && (!name || !App.ensureClean(name))) return;
            busy = true; draw();
            try {
              if (needName()) await Store.put('employers', Object.assign(Store.clone(e), { name }));
              await create(cur(), rates); UI.toast('הקוד מוכן. אפשר לשלוח אותו לחברים לעבודה', null, { ok: true });
            } catch (x) { UI.toast(errText(x, true)); }
            busy = false; draw();
          } else if (b.hasAttribute('data-wp-send') && m) {
            const text = `החוקים של ${e.name} בשעתי: תקופת שכר, נסיעות, שעות נוספות ותוספות. פותחים את הקישור, או מקלידים את הקוד ${W.pretty(m.c)}`;
            try { if (navigator.share) { await navigator.share({ title: 'Shaati', text, url: linkOf(m.c) }); return; } } catch (x) { if (x && x.name === 'AbortError') return; }
            await UI.copyText(text + ' ' + linkOf(m.c));
            UI.toast('הקישור הועתק. אפשר להדביק בוואטסאפ');
          } else if (b.hasAttribute('data-wp-copy') && m) {
            await UI.copyText(W.pretty(m.c));
            UI.toast('הקוד הועתק');
          } else if (b.hasAttribute('data-wp-update') && m) {
            busy = true; draw();
            try { await write(e, m.c, m.v + 1, m.rates); UI.toast('הקוד עודכן לחוקים של היום', null, { ok: true }); } catch (x) { UI.toast(errText(x, true)); }
            busy = false; draw();
          } else if (b.hasAttribute('data-wp-del') && m) {
            if (!(await UI.confirm('למחוק את הקוד?', 'הקוד והקישור יפסיקו לעבוד. מי שכבר החיל את החוקים ישמור אותם.', 'מחיקה', true))) return;
            busy = true; draw();
            try { await remove(m.c); await setMine(e.id, null); UI.toast('הקוד נמחק'); } catch (x) { UI.toast(errText(x)); }
            busy = false; draw();
          }
        });
      },
    });
  };

  /* ---------------- using a code ---------------- */
  async function fetchCode(c) {
    const { fs, db } = await Cloud().sdk();
    const snap = await fs.getDoc(fs.doc(db, 'wpc', c));
    if (!snap.exists()) return null;
    const d = snap.data() || {};
    const r = W.clean(d.r);
    return r ? { r, v: Number.isInteger(d.v) ? d.v : 1 } : null;
  }
  const NEW = '__new';
  /** A workplace record applied to one of mine (or a new one), saved with undo. */
  async function applyTo(target, r) {
    const today = U.todayKey();
    const isNew = target === NEW;
    const base = isNew ? Object.assign(Defaults.defaultEmployer('emp_' + U.uid()), { name: 'מקום עבודה חדש' }) : Store.clone(App.employer(target));
    // words that are not fit to keep are not taken in (the name stays, a role is left out)
    const rec = Object.assign({}, r, { n: r.n && App.cleanText(r.n) ? r.n : undefined, ro: (r.ro || []).filter((x) => App.cleanText(x.n)) });
    if (!rec.n) delete rec.n;
    const out = W.apply({
      employer: base, roles: S.roles, record: rec, today,
      fallbackRate: Engine.legalMinWage(today, S.settings.birthDate).hourly,
      newId: () => 'r_' + U.uid(), colors: Defaults.ROLE_COLORS,
      keepName: !isNew && base.name !== Defaults.defaultEmployer().name,
    });
    // the work week is a setting of its own: it goes in the same step, so one undo brings the earlier one back too
    const ops = W.ops(out, S.settings.leave && S.settings.leave.workWeek);
    await App.saveOps(ops, 'חוקי מקום העבודה', `החוקים נכנסו ל${out.employer.name}`);
    if (App.rerender) App.rerender();
    return out;
  }

  /**
   * The rules of a code, to check and apply. opts.pick(record): the setup questions take the rules themselves (their
   * answers are saved at the end); otherwise the person picks one of their workplaces, or a new one.
   */
  View.preview = async function (c, opts) {
    opts = opts || {};
    if (!signedIn()) { needAccount(false); return; }
    let got;
    try { got = await fetchCode(c); } catch (x) { UI.toast(errText(x)); return; }
    if (!got) { UI.toast('הקוד לא נמצא. אולי הוא נמחק, או שהוקלד אחרת'); drop(); return; }
    drop();
    const r = got.r;
    const def = Defaults.defaultEmployer().name;
    // the workplace with the same name, else the only one, else the first
    let target = opts.pick ? null : ((S.employers.find((e) => r.n && e.name === r.n) || S.employers[0]) || {}).id || NEW;
    const chg = () => {
      if (!target || target === NEW) return null;
      const e = App.employer(target);
      const ch = W.changes(e, S.settings.leave && S.settings.leave.workWeek, r, S.roles, U.todayKey());
      return e.name !== def ? ch.filter((k) => k !== 'n') : ch;
    };
    const body = () => `<div class="banner warn wp-warn">${icon('alert')}<div>החוקים האלה הגיעו מחבר/ה לעבודה. כדאי לבדוק אותם מול החוזה או התלוש שלך.</div></div>
      <div class="card"><div class="card-head">${icon('briefcase')}<h3>${esc(r.n || 'מקום העבודה')}</h3><span class="tag">גרסה ${got.v}</span></div>${lines(r, chg(), true)}</div>
      <div class="tiny muted wp-note">${W.hasRates(r) ? 'כולל שכר לשעה. שכר חדש נכנס מהיום, ומשמרות קודמות נשארות כמו שהן.' : 'בלי שכר לשעה: תפקיד חדש מקבל שכר מינימום, ואפשר לשנות אותו בהגדרות.'}</div>
      ${opts.pick ? '' : `<div class="section-title">${icon('briefcase', 's')} לאיזה מקום עבודה?</div>
      <div class="chips wp-target">${S.employers.map((e) => `<button class="chip ${e.id === target ? 'on' : ''}" data-wp-to="${esc(e.id)}">${esc(e.name)}</button>`).join('')}<button class="chip ${target === NEW ? 'on' : ''}" data-wp-to="${NEW}">${icon('plus', 's')} מקום עבודה חדש</button></div>`}`;
    UI.openSheet({
      title: 'חוקי מקום העבודה', body: body(),
      foot: `<button class="btn big block" data-wp-apply>${opts.pick ? 'להשתמש בחוקים האלה' : 'החלת החוקים'}</button>`,
      onMount: (el) => {
        el.addEventListener('click', async (ev) => {
          const b = ev.target.closest('button');
          if (!b || b.disabled) return;
          if (b.dataset.wpTo) {
            target = b.dataset.wpTo;
            const bd = el.querySelector('.sh-body');
            root.Dom.patch(bd, body());
          } else if (b.hasAttribute('data-wp-apply')) {
            b.disabled = true;
            if (opts.pick) { UI.closeTop(); opts.pick(r); return; }
            try { await applyTo(target, r); UI.closeTop(); } catch (x) { console.warn('workplace code', x); UI.toast('לא הצלחנו לשמור. נסו שוב'); b.disabled = false; }
          }
        });
      },
    });
  };

  /**
   * Typing a code. opts.pick: as in preview (the setup questions). opts.later: not signed in yet but will be (the
   * setup questions before saving to the account): the code waits on the phone and opens after signing in.
   */
  View.enter = async function (opts) {
    opts = opts || {};
    if (!signedIn() && !opts.later) { needAccount(false); return; }
    const t = await UI.promptText('קוד ממקום העבודה', 'הקוד שקיבלת מחבר/ה לעבודה', '', { ok: 'הצגת החוקים', ltr: true });
    if (t == null) return;
    const c = W.parse(t);
    if (!c) { UI.toast('זה לא נראה כמו קוד. קוד הוא 8 אותיות ומספרים, למשל ABCD-EFGH'); return; }
    if (!signedIn()) { keep(c); UI.toast('שמרנו את הקוד. נציג את החוקים אחרי השמירה בחשבון'); return; }
    View.preview(c, opts);
  };

  /** At start: a code that came with the link (or was typed before signing in), once signed in and set up. */
  let tries = 0;
  View.boot = function () {
    const look = () => {
      const c = pending();
      if (!c || !S.settings.onboarded || S.settings.demo) return;
      if (!signedIn()) {
        if (S.meta.cloudUid && ++tries < 4) { setTimeout(look, 4000); return; } // the account is still coming up
        if (App.localOnly || S.meta.guest) { drop(); needAccount(false); }
        return;
      }
      if (App.blocking || document.querySelector('.sheet, .dialog')) { if (++tries < 8) setTimeout(look, 3000); return; }
      View.preview(c);
    };
    setTimeout(look, 4500);
  };

  /** Deleting the account: my codes go too. Strict: a code that could not be deleted throws (the account stays). */
  View.forget = async function (strict) {
    const all = S.settings.wpShare && typeof S.settings.wpShare === 'object' ? S.settings.wpShare : {};
    if (!signedIn()) return;
    for (const id of Object.keys(all)) {
      const m = mine(id);
      if (!m) continue;
      try {
        const { fs, db } = await Cloud().sdk();
        const own = await fs.getDoc(fs.doc(db, 'wpo', m.c));
        if (own.exists()) await remove(m.c);
      } catch (e) { if (strict) throw e; }
    }
    await Store.setSettings((s) => { s.wpShare = {}; });
  };
})(typeof window !== 'undefined' ? window : globalThis);
