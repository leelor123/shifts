/* ============================================================
 * views-payslip.js — payslip upload, text extraction (pdf.js /
 * Hebrew OCR with tesseract.js), verification, analysis, archive,
 * open-gap tracking and the optional Claude analysis.
 *
 * Without an API key everything runs on the phone. With a key, only
 * redacted text the user reviewed and approved is sent.
 * ============================================================ */
(function (root) {
  'use strict';
  const { U, Engine, Payslip, Store, UI, App, Charts } = root;
  const S = Store.S;
  const { icon, esc, money } = UI;

  const LIBS = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    anthropic: 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm',
  };
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('לא ניתן לטעון רכיב (נדרש אינטרנט בשימוש הראשון)')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  const DISCLAIMER = `<div class="disclaimer">${icon('info', 's')}<div>הניתוח הוא כלי עזר בלבד ואינו ייעוץ משפטי או חשבונאי. חישובים שתלויים בהסכם קיבוצי, בחוזה או בוותק מסומנים ברמת ביטחון נמוכה. במקרה של ספק — פנה למשאבי אנוש, לרו״ח, לארגון העובדים או לאתר "כל זכות".</div></div>`;

  /* ---------------- extraction ---------------- */
  async function extractPdf(file, progress) {
    await loadScript(LIBS.pdf);
    const pdfjs = root.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let lines = [];
    for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
      progress(`קורא עמוד ${p} מתוך ${doc.numPages}…`);
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      lines = lines.concat(Payslip.linesFromPdfItems(tc.items));
    }
    const text = lines.join('\n');
    if (text.replace(/\s/g, '').length > 80) return { text, source: 'pdf' };
    // scanned PDF → render & OCR
    progress('ה-\u2060PDF סרוק — מריץ זיהוי טקסט…');
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 2.5 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return { text: await ocr(canvas, progress), source: 'ocr' };
  }
  async function ocr(image, progress) {
    await loadScript(LIBS.tesseract);
    progress('טוען מנוע זיהוי עברית (פעם ראשונה ~10MB)…');
    const worker = await root.Tesseract.createWorker('heb+eng', 1, {
      logger: (m) => { if (m.status === 'recognizing text') progress(`מזהה טקסט… ${Math.round(m.progress * 100)}%`); },
    });
    try {
      const { data } = await worker.recognize(image);
      return data.text;
    } finally { await worker.terminate(); }
  }
  async function extract(file, progress) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return extractPdf(file, progress);
    return { text: await ocr(file, progress), source: 'ocr' };
  }
  // the hours-report import reads PDFs and pictures the same way (import.js)
  App.readDocText = extract;
  App.loadLib = loadScript;

  /* ---------------- flow: upload → extract → verify ---------------- */
  App.actions['payslip-new'] = () => {
    if (UI.sheets.length) UI.closeAll();
    UI.openSheet({
      title: 'ניתוח תלוש שכר',
      body: `<div class="small muted" style="margin-bottom:12px">העלה את התלוש (PDF או צילום). הקריאה מתבצעת בטלפון — התלוש לא נשלח לשום מקום.</div>
        <label class="btn big" style="margin-bottom:10px">${icon('upload')} בחר קובץ PDF או תמונה<input type="file" accept="application/pdf,image/*" id="ps-file" hidden></label>
        <label class="btn tonal block" style="margin-bottom:10px">${icon('camera')} צלם את התלוש<input type="file" accept="image/*" capture="environment" id="ps-cam" hidden></label>
        <button class="btn outlined block" data-manual>${icon('edit')} הזנה ידנית (בלי קובץ)</button>
        <div class="tiny muted" style="margin-top:12px">טיפ: PDF מקורי מדויק יותר מצילום. בצילום — תאורה טובה, ישר מלמעלה, כל התלוש בפריים.</div>${DISCLAIMER}`,
      onMount: (el) => {
        const go = async (file) => {
          if (!file) return;
          UI.closeTop();
          setTimeout(() => startExtraction(file), 320);
        };
        el.querySelector('#ps-file').onchange = (e) => go(e.target.files[0]);
        el.querySelector('#ps-cam').onchange = (e) => go(e.target.files[0]);
        el.querySelector('[data-manual]').onclick = () => { UI.closeTop(); setTimeout(() => verifySheet({ fields: {}, other: [], period: defaultPeriod(), text: '', source: 'manual' }), 320); };
      },
    });
  };
  function defaultPeriod() {
    const emp = S.employers[0];
    return U.addMonthKey(Engine.periodOf(U.todayKey(), emp).key, -1);
  }
  async function startExtraction(file) {
    let statusEl = null;
    UI.openSheet({
      title: 'קורא את התלוש…',
      body: `<div class="empty"><div class="art">${icon('receipt')}</div><h3 id="ps-status">מתחיל…</h3><div class="small">${esc(file.name)}</div></div>`,
      onMount: (el) => { statusEl = el.querySelector('#ps-status'); },
    });
    const progress = (t) => { if (statusEl) statusEl.textContent = t; };
    try {
      const fileId = 'file_' + U.uid();
      await Store.putFile(fileId, file, file.name, file.type);
      const { text, source } = await extract(file, progress);
      const parsed = Payslip.parseText(text);
      UI.closeTop();
      setTimeout(() => verifySheet({ fields: parsed.fields, other: parsed.other, period: parsed.period || defaultPeriod(), text, source, fileId, fileName: file.name }), 320);
    } catch (e) {
      console.error(e);
      progress('שגיאה: ' + (e.message || e));
      UI.toast('הקריאה נכשלה. אפשר להזין ידנית.');
    }
  }

  /* ---------------- verification ----------------
   * One calm screen instead of a wall of inputs: a summary on top (month, gross → deductions →
   * net, and whether the numbers add up), then every line the reader found as a short row
   * (name · amount). Tapping a row opens it for correction; lines it couldn't place, the raw text
   * and the AI option wait folded at the bottom. */
  const GROUPS = [['pay', 'תשלומים', 'wallet', 'mint', true], ['ded', 'ניכויים', 'minus', 'orange', true], ['emp', 'הפרשות המעסיק', 'shield', 'sky', true], ['total', 'סיכומים', 'receipt', 'violet', false], ['info', 'מידע נוסף', 'info', 'sky', false]];
  const SOURCE = { pdf: ['file', 'נקרא מ-\u2060PDF'], ocr: ['camera', 'נקרא מצילום'], ai: ['sparkle', 'נותח בעזרת AI'], manual: ['edit', 'הזנה ידנית'] };
  const ESSENTIAL = ['gross', 'net', 'base', 'workHours'];
  function verifySheet(draft) {
    const d = { period: draft.period, fields: Store.clone(draft.fields) || {}, other: (draft.other || []).map((o) => Object.assign({ guess: o.guess || 'ignore' }, o)), text: draft.text || '', source: draft.source, fileId: draft.fileId, fileName: draft.fileName, id: draft.id, notes: draft.notes || '' };
    let sheetEl = null;
    const val = (k) => (d.fields[k] && d.fields[k].value != null && d.fields[k].value !== '' ? +d.fields[k].value : null);
    const shown = (f) => {
      const v = val(f.key);
      return v == null ? '<span class="vf-need">להשלים</span>' : f.kind === 'info' ? esc(U.num(v, 2)) : money(v);
    };
    const subOf = (f) => {
      const v = d.fields[f.key] || {};
      if (!f.hours || !v.qty) return '';
      return `${U.num(v.qty, 2)} ש׳${val(f.key) ? ' · ' + money(val(f.key) / v.qty) + ' לשעה' : ''}`;
    };
    const rowHtml = (f) => {
      const v = d.fields[f.key] || {};
      const src = v.line && v.line !== 'AI' ? `<div class="vf-src">${icon('file', 's')}<span>${esc(v.line)}</span></div>` : v.line === 'AI' ? `<div class="vf-src">${icon('sparkle', 's')}<span>זוהה ע״י AI</span></div>` : '';
      return `<div class="vf-row${val(f.key) == null ? ' need' : ''}" data-row="${f.key}">
        <button class="vf-line" data-open="${f.key}" aria-expanded="false"><span class="vf-l"><span>${esc(f.label)}</span><small data-sub>${subOf(f)}</small></span><span class="vf-v" data-shown>${shown(f)}</span><span class="vf-pen">${icon('edit', 's')}</span></button>
        <div class="vf-edit">${src}
          <div class="vf-inputs">
            ${f.hours ? `<label class="field"><span class="lbl">שעות</span><input class="input" type="number" step="any" inputmode="decimal" data-q="${f.key}" value="${v.qty != null ? esc(String(v.qty)) : ''}"></label>` : ''}
            <label class="field"><span class="lbl">${f.kind === 'info' ? 'ערך' : 'סכום בשקלים'}</span><input class="input" type="number" step="any" inputmode="decimal" data-v="${f.key}" value="${v.value != null ? esc(String(v.value)) : ''}"></label>
          </div>
          <div class="vf-acts"><button class="btn text sm" data-rm="${f.key}">${icon('trash', 's')} הסרה</button><button class="btn tonal sm" data-close-row>${icon('check', 's')} סיום</button></div>
        </div></div>`;
    };
    function top() {
      const g = val('gross'), n = val('net');
      const dedLines = Payslip.FIELDS.filter((f) => f.kind === 'ded' && val(f.key) != null).reduce((s, f) => s + val(f.key), 0);
      const ded = val('totalDeductions') != null ? val('totalDeductions') : dedLines || (g != null && n != null ? g - n : null);
      const pays = Payslip.FIELDS.filter((f) => f.kind === 'pay' && val(f.key) != null).reduce((s, f) => s + val(f.key), 0);
      const checks = [];
      if (g == null) checks.push(['need', 'חסר ברוטו: הוסיפו אותו כדי שנוכל לבדוק']);
      if (n == null) checks.push(['need', 'חסר נטו לתשלום']);
      if (g != null && pays > 0) checks.push(Math.abs(pays - g) <= 2 ? ['ok', 'שורות התשלום מסתכמות לברוטו'] : ['warn', `שורות התשלום מסתכמות ל-${money(pays)}, והברוטו ${money(g)}. אולי חסרה או מיותרת שורה`]);
      if (g != null && n != null && val('totalDeductions') != null) checks.push(Math.abs(g - val('totalDeductions') - n) <= 2 ? ['ok', 'ברוטו פחות ניכויים שווה לנטו'] : ['warn', `ברוטו פחות ניכויים יוצא ${money(g - val('totalDeductions'))}, והנטו ${money(n)}`]);
      const cell = (label, v, cls) => `<div class="vf-cell ${cls || ''}"><small>${label}</small><b>${v == null ? '—' : money(v, 0)}</b></div>`;
      return `<div class="vf-flow">${cell('ברוטו', g)}<span class="vf-op">−</span>${cell('ניכויים', ded)}<span class="vf-op">=</span>${cell('נטו', n, 'net')}</div>
        ${checks.length ? `<div class="vf-checks">${checks.map(([s, t]) => `<div class="vf-chk ${s}">${icon(s === 'ok' ? 'okc' : 'alert', 's')}<span>${esc(t)}</span></div>`).join('')}</div>` : ''}`;
    }
    function groupHead(kind) {
      const g = GROUPS.find((x) => x[0] === kind);
      const fs = Payslip.FIELDS.filter((f) => f.kind === kind && d.fields[f.key]);
      const sum = g[4] ? fs.reduce((s, f) => s + (val(f.key) || 0), 0) : null;
      return `${UI.tile(g[2], g[3])}<b>${g[1]}</b><span class="vf-gs">${fs.length} ${fs.length === 1 ? 'שורה' : 'שורות'}${sum ? ' · ' + money(sum, 0) : ''}</span>`;
    }
    function body() {
      const present = Payslip.FIELDS.filter((f) => d.fields[f.key]);
      const src = SOURCE[d.source] || SOURCE.manual;
      const empty = !present.length;
      return `<div class="vf-head">
          <label class="field vf-month"><span class="lbl">חודש התלוש</span><input class="input" type="month" id="vf-period" value="${d.period || ''}" min="2000-01" max="${U.todayKey().slice(0, 7)}"></label>
          <span class="vf-badge">${icon(src[0], 's')}${src[1]}</span>
        </div>
        <div class="card vf-top" data-top>${top()}</div>
        ${d.source === 'ocr' ? `<div class="vf-tip">${icon('eye', 's')}<span>זיהוי מצילום עלול לטעות בספרות. כדאי להשוות כל שורה לתלוש.</span></div>` : ''}
        ${d.notes ? `<div class="vf-tip">${icon('sparkle', 's')}<span>${esc(d.notes)}</span></div>` : ''}
        ${empty ? `<div class="card vf-start"><b>אילו שורות יש בתלוש?</b><div class="small muted">מספיק להתחיל בעיקר: ברוטו, נטו ושעות.</div>
          <div class="chips">${ESSENTIAL.map((k) => `<button class="chip" data-add="${k}">${icon('plus', 's')} ${esc(Payslip.FIELD[k].label)}</button>`).join('')}</div></div>` : ''}
        ${GROUPS.map(([kind, , , , open]) => {
          const fs = present.filter((f) => f.kind === kind);
          if (!fs.length) return '';
          return `<details class="vf-group" data-g="${kind}" ${open || fs.some((f) => val(f.key) == null) ? 'open' : ''}><summary>${groupHead(kind)}<span class="vf-chev">${icon('left', 's')}</span></summary><div class="vf-rows">${fs.map(rowHtml).join('')}</div></details>`;
        }).join('')}
        <button class="btn outlined block vf-add" data-addmenu>${icon('plus')} הוספת שורה מהתלוש</button>
        ${d.other.length ? `<details class="vf-group vf-other"><summary>${UI.tile('help', 'amber')}<b>שורות שלא זוהו</b><span class="vf-gs">${d.other.length}</span><span class="vf-chev">${icon('left', 's')}</span></summary>
          <div class="small muted" style="margin:0 4px 10px">אם אחת מהן חשובה, בחרו מה היא. השאר יישארו בצד.</div>
          ${d.other.map((o, i) => `<div class="vf-o"><div class="vf-o-line">${esc(o.line)}</div>
            <div class="vf-o-in"><select class="input" data-og="${i}" aria-label="מה השורה הזאת">${[['ignore', 'להתעלם'], ['otherDed', 'ניכוי אחר'], ['otherPay', 'תשלום אחר'], ...Payslip.FIELDS.map((f) => [f.key, f.label])].map(([k, l]) => `<option value="${k}" ${o.guess === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
            <input class="input" type="number" step="any" inputmode="decimal" data-ov="${i}" value="${esc(String(o.value))}" aria-label="סכום"></div></div>`).join('')}</details>` : ''}
        ${d.text ? `<details class="vf-group vf-more"><summary>${UI.tile('file', 'violet')}<b>הטקסט שזוהה וניתוח חכם</b><span class="vf-chev">${icon('left', 's')}</span></summary>
          <div class="code">${esc(d.text)}</div>
          <button class="btn outlined block" data-ai style="margin-top:10px">${icon('sparkle')} ניתוח חכם עם Claude ${S.settings.ai.apiKey ? '' : '(דורש מפתח API)'}</button>
          <div class="tiny muted" style="margin:6px 4px 4px">לא חובה. לפני שליחה יוסתרו ת״ז, פרטי בנק וכתובת, ותראו בדיוק מה נשלח.</div></details>` : ''}`;
    }
    function readInputs() {
      const el = sheetEl;
      d.period = el.querySelector('#vf-period').value || d.period;
      el.querySelectorAll('[data-v]').forEach((i) => { const k = i.dataset.v; d.fields[k] = d.fields[k] || {}; d.fields[k].value = UI.numIn(i); });
      el.querySelectorAll('[data-q]').forEach((i) => { const k = i.dataset.q; d.fields[k] = d.fields[k] || {}; d.fields[k].qty = UI.numIn(i); if (d.fields[k].qty && d.fields[k].value) d.fields[k].rate = d.fields[k].value / d.fields[k].qty; });
      el.querySelectorAll('[data-og]').forEach((s) => { d.other[+s.dataset.og].guess = s.value; });
      el.querySelectorAll('[data-ov]').forEach((i) => { d.other[+i.dataset.ov].value = UI.numIn(i) || 0; });
    }
    function redraw(openKey) {
      const b = sheetEl.querySelector('.sh-body');
      const y = b.scrollTop;
      b.innerHTML = body();
      b.scrollTop = y;
      if (openKey) openRow(openKey, true);
    }
    /* typing updates the row, its group and the summary right away (no redraw, so the keyboard stays) */
    function live(key) {
      readInputs();
      const f = Payslip.FIELD[key];
      const row = sheetEl.querySelector(`[data-row="${key}"]`);
      if (f && row) {
        row.querySelector('[data-shown]').innerHTML = shown(f);
        row.querySelector('[data-sub]').innerHTML = subOf(f);
        row.classList.toggle('need', val(key) == null);
        const gs = sheetEl.querySelector(`.vf-group[data-g="${f.kind}"] > summary`);
        if (gs) gs.innerHTML = groupHead(f.kind) + `<span class="vf-chev">${icon('left', 's')}</span>`;
      }
      sheetEl.querySelector('[data-top]').innerHTML = top();
    }
    function openRow(key, focus) {
      sheetEl.querySelectorAll('.vf-row.open').forEach((r) => { if (r.dataset.row !== key) { r.classList.remove('open'); r.querySelector('[data-open]').setAttribute('aria-expanded', 'false'); } });
      const row = sheetEl.querySelector(`[data-row="${key}"]`);
      if (!row) return;
      const was = row.classList.contains('open');
      row.classList.toggle('open', !was);
      row.querySelector('[data-open]').setAttribute('aria-expanded', String(!was));
      if (!was) {
        const g = row.closest('details');
        if (g) g.open = true;
        if (focus) setTimeout(() => { const i = row.querySelector('[data-v]'); if (i) { i.focus(); row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }, 60);
      }
    }
    function addMenu() {
      const missing = Payslip.FIELDS.filter((f) => !d.fields[f.key]);
      UI.openSheet({
        title: 'איזו שורה להוסיף?',
        body: GROUPS.map(([kind, label]) => { const fs = missing.filter((f) => f.kind === kind); return fs.length ? `<div class="section-title">${label}</div><div class="chips wrap">${fs.map((f) => `<button class="chip" data-pick="${f.key}">${esc(f.label)}</button>`).join('')}</div>` : ''; }).join(''),
        onMount: (el) => el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-pick]');
          if (!b) return;
          UI.closeTop();
          addField(b.dataset.pick);
        }),
      });
    }
    function addField(key) {
      readInputs();
      if (!d.fields[key]) d.fields[key] = { value: null };
      redraw();
      setTimeout(() => openRow(key, true), 340);
    }
    UI.openSheet({
      title: 'אימות נתוני התלוש', full: true, cls: 'vf-sheet', body: body(),
      foot: `<button class="btn" data-go>${icon('check')} המשך לבדיקה</button>`,
      onMount: (el) => {
        sheetEl = el;
        el.addEventListener('input', (e) => { const k = e.target.dataset.v || e.target.dataset.q; if (k) live(k); });
        el.addEventListener('change', (e) => { if (e.target.id === 'vf-period') d.period = e.target.value || d.period; });
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.open) openRow(b.dataset.open, true);
          else if (b.hasAttribute('data-close-row')) { const r = b.closest('.vf-row'); if (r) openRow(r.dataset.row); }
          else if (b.dataset.rm) { readInputs(); delete d.fields[b.dataset.rm]; redraw(); }
          else if (b.dataset.add) addField(b.dataset.add);
          else if (b.hasAttribute('data-addmenu')) { readInputs(); addMenu(); }
          else if (b.hasAttribute('data-ai')) { readInputs(); App.aiAnalyze(d.text, (res) => { Object.assign(d.fields, res.fields); d.other = res.other.length ? res.other : d.other; if (res.period) d.period = res.period; d.notes = res.notes; d.source = 'ai'; redraw(); }); }
          else if (b.hasAttribute('data-go')) {
            readInputs();
            if (!/^\d{4}-\d{2}$/.test(d.period || '')) { UI.invalid('בחרו את חודש התלוש'); return; }
            // mapped unknown lines
            for (const o of d.other) {
              if (Payslip.FIELD[o.guess] && !d.fields[o.guess]) d.fields[o.guess] = { value: Math.abs(o.value), line: o.line };
            }
            for (const k of Object.keys(d.fields)) if (d.fields[k].value == null && d.fields[k].qty == null) delete d.fields[k];
            if (!Object.keys(d.fields).length) { UI.invalid('הוסיפו לפחות שורה אחת מהתלוש'); return; }
            UI.closeTop();
            setTimeout(() => analysisSheet({ id: d.id || 'ps_' + U.uid(), period: d.period, fields: d.fields, other: d.other, text: d.text, source: d.source, fileId: d.fileId, fileName: d.fileName, isNew: !d.id }), 320);
          }
        });
      },
    });
  }
  App.payslipVerify = verifySheet; // tests open it with a ready draft

  /* ---------------- analysis ---------------- */
  const STATUS = { ok: ['okc', 'תקין', '✅'], warn: ['alert', 'כדאי לבדוק', '⚠️'], bad: ['xc', 'חסר או שגוי', '❌'] };
  const CONF = { high: 'ביטחון גבוה', medium: 'ביטחון בינוני', low: 'ביטחון נמוך' };
  function prevSlipOf(period, id) {
    return S.payslips.filter((p) => p.period < period && p.id !== id).sort((a, b) => b.period.localeCompare(a.period))[0];
  }
  function analysisHtml(slip, a) {
    const counts = { ok: 0, warn: 0, bad: 0 };
    a.findings.forEach((f) => counts[f.status]++);
    const prev = prevSlipOf(slip.period, slip.id);
    const wf = Payslip.waterfall(slip.fields);
    const lines = Payslip.explainLines(slip.fields, prev && prev.fields);
    const changes = Payslip.compareSlips(prev && prev.fields, slip.fields);
    const msg = Payslip.employerMessage(a, { name: S.settings.userName || '' });
    const order = { bad: 0, warn: 1, ok: 2 };
    return `
      <div class="status-summary"><div class="ok">✅ ${counts.ok}<div class="tiny">תקין</div></div><div class="warn">⚠️ ${counts.warn}<div class="tiny">לבדוק</div></div><div class="bad">❌ ${counts.bad}<div class="tiny">חסר/שגוי</div></div></div>
      ${a.totalMissing > 0 ? `<div class="card tonal"><div class="small">הפרש משוער לטובתך</div><div class="hero-num">${money(a.totalMissing)}</div><div class="tiny">סכום הממצאים המסומנים ❌. בדוק את הפירוט לפני פנייה למעסיק.</div></div>` : counts.bad === 0 ? `<div class="card tonal"><b>${icon('okc', 's')} לא נמצאו חוסרים</b><div class="small">התלוש תואם למשמרות שרשמת${counts.warn ? ', עם כמה נקודות לבדיקה' : ''}.</div></div>` : ''}
      ${a.overridesInPeriod ? `<div class="banner warn">${icon('hand')}<div>${a.overridesInPeriod} משמרות בתקופה כוללות עקיפה ידנית. ממצאים שנובעים מהן מסומנים.</div></div>` : ''}
      <div class="small muted" style="margin:0 4px 10px">תקופה: ⁦${U.fmtDate(a.expected.P.from)}\u2060–\u2060${U.fmtDate(a.expected.P.to)}⁩ · ${a.expected.shifts.length} משמרות · ${U.hours(a.expected.t.hours)} ש׳</div>
      ${a.findings.slice().sort((x, y) => order[x.status] - order[y.status]).map((f) => `<div class="finding ${f.status}">
        <div class="ft"><span>${STATUS[f.status][2]}</span><span>${esc(f.area)} · ${esc(f.title)}</span>${f.amount > 0 && f.status !== 'ok' ? `<span class="amt">${U.money(f.amount)}</span>` : ''}</div>
        <div class="fd">${esc(f.detail)}</div>
        ${f.fromOverride ? `<div class="fd" style="color:var(--override)">${icon('hand', 's')} ${esc(f.fromOverride)}</div>` : ''}
        ${f.note ? `<div class="fd small">${icon('info', 's')} ${esc(f.note)}</div>` : ''}
        ${f.shifts && f.shifts.length ? `<div style="margin-top:6px">${f.shifts.slice(0, 6).map((id) => { const r = App.result(id); return r ? `<button class="chip" data-act="shift-open" data-id="${id}">${U.fmtDate(r.dateKey, 'short')} · ${U.hm(r.paidMin)}</button>` : ''; }).join(' ')}</div>` : ''}
        <div class="fb">על מה זה מבוסס: ${esc(f.basis)} · <span class="conf ${f.confidence}">${CONF[f.confidence]}</span></div></div>`).join('')}
      ${msg ? `<div class="section-title">${icon('send', 's')} מה לעשות</div><div class="card"><div class="small" style="margin-bottom:8px">הודעה מוכנה למעסיק / משאבי אנוש (אפשר לערוך):</div><textarea class="input" id="ps-msg" rows="10" aria-label="הודעה למעסיק">${esc(msg)}</textarea>
        <div class="btn-row" style="margin-top:8px"><button class="btn tonal" data-copy-msg>${icon('copy')} העתק</button><button class="btn tonal" data-share-msg>${icon('share')} שתף</button></div></div>` : ''}
      ${changes.length ? `<div class="section-title">${icon('alert', 's')} שינויים מהתלוש הקודם</div><div class="card">${changes.map((c) => `<div class="kv"><span>${esc(c.text)}</span></div>`).join('')}</div>` : ''}
      ${wf ? `<div class="section-title">${icon('chart', 's')} מברוטו לנטו</div><div class="card">${Charts.waterfall(wf, { fmt: (v) => U.money(v), axisFmt: (v) => '₪' + (v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'K' : Math.round(v)) })}
        <div class="tiny muted">כחול = ברוטו, אדום = ניכויים, ירוק = נטו. לחץ על עמודה לפרטים.</div></div>` : ''}
      <div class="section-title">${icon('info', 's')} הסבר לכל שורה</div>
      <div class="list">${lines.map((l) => `<details class="collapse" style="margin:0;border-radius:0"><summary><span style="flex:1">${esc(l.label)}${l.change ? ' <span class="tag warn">שינוי</span>' : ''}</span><span class="money">${l.kind === 'info' ? U.num(l.value, 2) : U.money(l.value)}</span></summary><div class="in small">${esc(l.explain)}${l.qty ? `<br>כמות: ${U.num(l.qty, 2)}` : ''}${l.change ? `<br><b>${esc(l.change)}</b>` : ''}</div></details>`).join('')}</div>
      ${DISCLAIMER}`;
  }
  function analysisSheet(slip) {
    const a = Payslip.analyze(slip, App.model);
    UI.openSheet({
      title: 'ניתוח תלוש · ' + U.fmtMonth(slip.period), full: true,
      body: analysisHtml(slip, a),
      foot: slip.isNew ? `<button class="btn tonal" data-edit>${icon('edit')} תקן נתונים</button><button class="btn" data-save>${icon('check')} שמור בארכיון</button>`
        : `<button class="btn danger" data-del style="flex:0 0 auto" aria-label="מחיקת התלוש">${icon('trash')}</button><button class="btn tonal" data-edit>${icon('edit')} תקן נתונים</button>${slip.fileId ? `<button class="btn tonal" data-file style="flex:0 0 auto">${icon('file')}</button>` : ''}`,
      onMount: (el) => {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-copy-msg')) { await UI.copyText(el.querySelector('#ps-msg').value); UI.toast('ההודעה הועתקה'); }
          if (b.hasAttribute('data-share-msg')) { const t = el.querySelector('#ps-msg').value; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { await UI.copyText(t); UI.toast('הועתק'); } }
          if (b.hasAttribute('data-edit')) { UI.closeTop(); setTimeout(() => verifySheet(Object.assign({}, slip, { id: slip.isNew ? null : slip.id })), 320); }
          if (b.hasAttribute('data-file')) {
            const f = await Store.getFile(slip.fileId);
            if (f) window.open(URL.createObjectURL(f.blob), '_blank'); else UI.toast('הקובץ לא נמצא');
          }
          if (b.hasAttribute('data-del')) {
            if (!(await UI.confirm('למחוק את התלוש מהארכיון?', '', 'מחק', true))) return;
            UI.closeTop();
            const ops = [{ store: 'payslips', del: slip.id }, ...S.gaps.filter((g) => g.payslipId === slip.id).map((g) => ({ store: 'gaps', del: g.id }))];
            await App.saveOps(ops, 'מחיקת תלוש', 'התלוש נמחק');
          }
          if (b.hasAttribute('data-save')) { UI.closeTop(); await saveSlip(slip, a); }
        });
      },
    });
  }
  async function saveSlip(slip, a) {
    const counts = { ok: 0, warn: 0, bad: 0 };
    a.findings.forEach((f) => counts[f.status]++);
    const rec = {
      id: slip.id, period: slip.period, employerId: S.employers[0].id, fields: slip.fields, other: slip.other,
      text: slip.text, source: slip.source, fileId: slip.fileId || null, fileName: slip.fileName || '',
      summary: { counts, totalMissing: a.totalMissing, gross: slip.fields.gross ? slip.fields.gross.value : null, net: slip.fields.net ? slip.fields.net.value : null },
    };
    const ops = [{ store: 'payslips', put: rec }];
    // open gaps from this slip (replace previous gaps of the same slip)
    S.gaps.filter((g) => g.payslipId === slip.id && g.status === 'open').forEach((g) => ops.push({ store: 'gaps', del: g.id }));
    for (const f of a.findings.filter((x) => x.status === 'bad' && x.amount > 0)) {
      ops.push({ store: 'gaps', put: { id: slip.id + '_' + f.area, payslipId: slip.id, period: slip.period, area: f.area, title: f.title, amount: Math.round(f.amount * 100) / 100, status: 'open' } });
    }
    // did this slip pay back earlier gaps? (a "differences" line close to an open gap)
    const diff = slip.fields.diff ? Math.abs(+slip.fields.diff.value) : 0;
    if (diff > 0) {
      const open = S.gaps.filter((g) => g.status === 'open' && g.period < slip.period);
      const total = open.reduce((s, g) => s + g.amount, 0);
      for (const g of open) {
        if (Math.abs(g.amount - diff) <= g.amount * 0.2 || (open.length > 1 && Math.abs(total - diff) <= total * 0.2)) ops.push({ store: 'gaps', put: Object.assign({}, g, { status: 'maybe', note: `בתלוש ${U.fmtMonth(slip.period)} יש שורת הפרשים של ${U.money(diff)}` }) });
      }
    }
    // changes vs the previous slip show in the slip's own check, not as notifications (few notifications)
    await App.saveOps(ops, 'שמירת תלוש', 'התלוש נשמר בארכיון');
  }
  App.sheetsApi.payslip = (id) => {
    const p = S.payslips.find((x) => x.id === id);
    if (p) analysisSheet(Object.assign({}, p, { isNew: false }));
  };
  App.actions['payslip-open'] = (el) => App.sheetsApi.payslip(el.dataset.id);
  App.actions['gap-set'] = async (el) => {
    const g = S.gaps.find((x) => x.id === el.dataset.id);
    if (g) await App.saveOps([{ store: 'gaps', put: Object.assign({}, g, { status: el.dataset.s }) }], 'עדכון פער', el.dataset.s === 'resolved' ? 'סומן כהוחזר' : 'עודכן');
  };

  /* ---------------- payslips tab (in reports) ---------------- */
  App.payslipsTab = function () {
    const slips = S.payslips.slice().sort((a, b) => b.period.localeCompare(a.period));
    const gaps = S.gaps.filter((g) => g.status !== 'resolved').sort((a, b) => b.period.localeCompare(a.period));
    const trend = slips.slice(0, 12).reverse();
    return `<button class="btn big" data-act="payslip-new" style="margin-bottom:12px">${icon('upload')} העלה תלוש לניתוח</button>
      ${gaps.length ? `<div class="section-title">${icon('alert', 's')} פערים פתוחים<span class="spacer"></span><span class="small">${U.money(gaps.filter((g) => g.status === 'open').reduce((s, g) => s + g.amount, 0), 0)}</span></div>
        <div class="list">${gaps.map((g) => `<div class="item" style="cursor:default"><span class="lead" style="background:${g.status === 'maybe' ? 'var(--warn-bg)' : 'var(--bad-bg)'};color:${g.status === 'maybe' ? 'var(--warn)' : 'var(--bad)'}">${icon(g.status === 'maybe' ? 'refresh' : 'xc')}</span>
          <span class="body"><span class="t">${esc(g.title)} · ${U.fmtMonth(g.period)}</span><span class="s">${g.status === 'maybe' ? esc(g.note || 'ייתכן שהוחזר') : 'עוד לא הוחזר'}</span></span>
          <span class="trail"><span class="a">${money(g.amount, 0)}</span><br><button class="btn text sm" data-act="gap-set" data-id="${esc(g.id)}" data-s="resolved">הוחזר ✓</button></span></div>`).join('')}</div>` : ''}
      ${trend.length >= 2 ? `<div class="section-title">${icon('chart', 's')} מגמות</div><div class="card">${Charts.stacked(trend.map((p) => U.HEB_MONTHS[+p.period.slice(5) - 1].slice(0, 3)), [
        { name: 'נטו', color: '#1baf7a', values: trend.map((p) => (p.fields.net ? +p.fields.net.value : 0)) },
        { name: 'ניכויים', color: '#e34948', values: trend.map((p) => (p.fields.gross && p.fields.net ? Math.max(0, p.fields.gross.value - p.fields.net.value) : 0)) },
      ], { label: 'נטו וניכויים לפי חודש', fmt: (v) => U.money(v, 0) })}
        <div class="tiny muted">גובה העמודה = ברוטו. ${trend.length} תלושים אחרונים.</div></div>` : ''}
      <div class="section-title">${icon('receipt', 's')} ארכיון תלושים</div>
      ${slips.length ? `<div class="list">${slips.map((p) => { const c = (p.summary && p.summary.counts) || {}; return `<button class="item" data-act="payslip-open" data-id="${p.id}"><span class="lead" style="background:var(--surface-3)">${icon('receipt')}</span>
        <span class="body"><span class="t">${U.fmtMonth(p.period)}</span><span class="s">${c.bad ? `❌ ${c.bad} ` : ''}${c.warn ? `⚠️ ${c.warn} ` : ''}${c.ok ? `✅ ${c.ok}` : ''}${p.source === 'ai' ? ' · AI' : ''}</span></span>
        <span class="trail"><span class="a">${p.fields.net ? money(p.fields.net.value, 0) : '—'}</span><br><span class="tiny muted">נטו</span></span></button>`; }).join('')}</div>`
        : UI.emptyState('receipt', 'עוד אין תלושים', 'העלה תלוש כדי לבדוק שקיבלת את כל מה שמגיע לך: שעות, שבתות, נסיעות, פנסיה ועוד.')}
      ${DISCLAIMER}`;
  };

  /* ---------------- optional AI (Claude) ---------------- */
  App.aiAnalyze = function (text, onResult) {
    const key = S.settings.ai.apiKey;
    if (!key) {
      UI.confirm('ניתוח חכם דורש מפתח API', 'אפשר להזין מפתח של Claude בהגדרות › עוזר AI ואודות › מפתח AI. בלי מפתח — הניתוח המקומי ממשיך לעבוד כרגיל.', 'להגדרות').then((ok) => { if (ok) { UI.closeAll(); setTimeout(() => App.sheetsApi.settingsSection('ai'), 400); } });
      return;
    }
    const red = Payslip.redact(text);
    UI.openSheet({
      title: 'לפני שליחה ל-\u2060Claude', full: true,
      body: `<div class="banner warn">${icon('shield')}<div>זה <b>בדיוק</b> הטקסט שיישלח (${red.count} פרטים אישיים הוסתרו אוטומטית). בדוק וערוך — אפשר למחוק גם שם או כל פרט אחר. הקובץ עצמו לא נשלח.</div></div>
        <textarea class="input" id="ai-text" rows="16" style="font-family:ui-monospace,monospace;font-size:.8rem">${esc(red.text)}</textarea>
        <div class="small muted" style="margin-top:8px">יישלח אל Anthropic (מודל ${esc(S.settings.ai.model)}) עם המפתח שלך. השימוש מחויב בחשבון ה-\u2060API שלך.</div>`,
      foot: `<button class="btn tonal" data-cancel>ביטול</button><button class="btn" data-send>${icon('send')} אני מאשר — שלח</button>`,
      onMount: (el) => {
        el.querySelector('[data-cancel]').onclick = () => UI.closeTop();
        el.querySelector('[data-send]').onclick = async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true; btn.textContent = 'שולח…';
          try {
            const json = await callClaude(el.querySelector('#ai-text').value);
            const res = Payslip.fromAi(json);
            UI.closeTop();
            onResult(res);
            UI.toast(`Claude זיהה ${Object.keys(res.fields).length} שדות — בדוק לפני ניתוח`);
          } catch (err) {
            console.error(err);
            btn.disabled = false; btn.textContent = 'נסה שוב';
            UI.dialog({ title: 'הניתוח החכם נכשל', text: String(err.message || err), buttons: [{ label: 'סגור', value: true }] });
          }
        };
      },
    });
  };
  async function callClaude(text) {
    if (!navigator.onLine) throw new Error('אין חיבור לאינטרנט');
    const mod = await import(/* webpackIgnore: true */ LIBS.anthropic);
    const Anthropic = mod.default || mod.Anthropic;
    const client = new Anthropic({ apiKey: S.settings.ai.apiKey, dangerouslyAllowBrowser: true });
    const model = S.settings.ai.model || 'claude-opus-5-5';
    const params = {
      model,
      max_tokens: 16000,
      system: Payslip.aiPrompt(),
      messages: [{ role: 'user', content: text }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: Payslip.aiSchema() } },
    };
    let res;
    try {
      if (model.startsWith('claude-haiku')) res = await client.messages.create(params); // no server-side fallback for Haiku
      else res = await client.beta.messages.create(Object.assign({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, params));
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new Error('מפתח ה-\u2060API לא תקין (401). בדוק אותו בהגדרות.');
      if (err instanceof Anthropic.PermissionDeniedError) throw new Error('למפתח אין הרשאה למודל הזה (403).');
      if (err instanceof Anthropic.NotFoundError) throw new Error('המודל לא נמצא (404). בחר מודל אחר בהגדרות.');
      if (err instanceof Anthropic.RateLimitError) throw new Error('יותר מדי בקשות (429). נסה שוב בעוד דקה.');
      if (err instanceof Anthropic.APIConnectionError) throw new Error('בעיית תקשורת עם השרת. בדוק את החיבור.');
      if (err instanceof Anthropic.APIError) throw new Error(`שגיאת API ${err.status || ''}: ${err.message}`);
      throw err;
    }
    if (res.stop_reason === 'refusal') throw new Error('הבקשה נדחתה על ידי המודל' + (res.stop_details && res.stop_details.explanation ? ': ' + res.stop_details.explanation : '.'));
    if (res.stop_reason === 'max_tokens') throw new Error('התשובה נקטעה. נסה לקצר את הטקסט.');
    const block = res.content.find((b) => b.type === 'text');
    if (!block) throw new Error('לא התקבלה תשובה');
    return JSON.parse(block.text);
  }
})(typeof window !== 'undefined' ? window : globalThis);
