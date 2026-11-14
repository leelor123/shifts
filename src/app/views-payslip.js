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
  // every library script the app adds from a CDN, with its fingerprint (subresource integrity): the browser runs the file
  // only when it is byte for byte the one checked here, so a hacked CDN cannot swap it (security audit 13 Nov 2026; the
  // hashes match the ones cdnjs and jsDelivr publish). A script not listed is refused. Not covered, because the browser
  // gives them no integrity check: what the libraries load themselves (the pdf.js worker, tesseract's worker, core and
  // language data through importScripts) and module imports (the Anthropic SDK, Firebase). Covering those means hosting
  // them in docs/ and pointing workerSrc / workerPath / corePath there.
  // A new version of one: its sha384 (curl -fsSL <url> | openssl dgst -sha384 -binary | openssl base64 -A) goes here.
  const SRI = {
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js': 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js': 'sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F',
    'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js': 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT',
    'https://cdn.jsdelivr.net/npm/nsfwjs@4.4.0/dist/browser/nsfwjs.min.js': 'sha384-AgEYUP1dk2mGxhfUGZ4muudxnzuhFD4HFvGAOgeRu1a/78Ls+Jmx/TWEF4qU3aOF',
  };
  App.SRI = SRI;
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    if (!SRI[src]) return Promise.reject(root.U.oops('לא ניתן לטעון רכיב'));
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous'; s.integrity = SRI[src];
      s.onload = res; s.onerror = () => { delete loaded[src]; rej(root.U.oops('לא ניתן לטעון רכיב (נדרש אינטרנט בשימוש הראשון)')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  const DISCLAIMER = `<div class="disclaimer">${icon('info', 's')}<div>הניתוח הוא כלי עזר בלבד ואינו ייעוץ משפטי או חשבונאי. חישובים שתלויים בהסכם קיבוצי, בחוזה או בוותק מסומנים ברמת ביטחון נמוכה. במקרה של ספק, פנה למשאבי אנוש, לרו״ח, לארגון העובדים או לאתר "כל זכות".</div></div>`;

  /* ---------------- extraction ---------------- */
  async function extractPdf(file, progress, opts) {
    await loadScript(LIBS.pdf);
    const pdfjs = root.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
    // isEvalSupported: false: a crafted PDF's font cannot run code (CVE-2024-4367 in pdf.js before 4.2.67; the page's
    // policy already forbids eval, this keeps it closed without leaning on that)
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
    let lines = [];
    for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
      progress(`קורא עמוד ${p} מתוך ${doc.numPages}…`);
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      lines = lines.concat(Payslip.linesFromPdfItems(tc.items));
    }
    const text = lines.join('\n');
    if (text.replace(/\s/g, '').length > 80) return { text, source: 'pdf' };
    if (opts && opts.noOcr) return { text, source: 'scan' }; // the caller reads the picture its own way
    // scanned PDF → render & OCR
    progress('ה-\u2060PDF סרוק: מריץ זיהוי טקסט…');
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
  async function extract(file, progress, opts) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return extractPdf(file, progress, opts);
    return { text: await ocr(file, progress), source: 'ocr' };
  }
  // the hours-report import reads PDFs and pictures the same way (import.js)
  App.readDocText = extract;
  App.loadLib = loadScript;
  /**
   * A picture or a PDF → its words, each with its box ({ text, x0, y0, x1, y1 }, y down), for reading a table
   * (a work schedule): a picture through the same Hebrew OCR, a PDF from its own text (an OCR of the first page
   * when it is scanned).
   */
  App.readDocWords = async function (file, progress) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (isPdf) {
      await loadScript(LIBS.pdf);
      const pdfjs = root.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
      // every page (a month's report can run to a second page), each below the one before; letters drawn one by
      // one or spread out are put back into words (Timesheet.wordsFromPdfItems)
      let words = [];
      for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
        const pg = await doc.getPage(p);
        const tc = await pg.getTextContent();
        words = words.concat(root.Timesheet.wordsFromPdfItems(tc.items, (p - 1) * 5000));
      }
      if (words.length > 6) return { words, text: words.map((w) => w.text).join(' '), source: 'pdf' };
      const page = await doc.getPage(1);
      progress('ה-⁠PDF סרוק: מריץ זיהוי טקסט…');
      const vp = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      return Object.assign(await ocrWords(canvas, progress), { source: 'ocr' });
    }
    return Object.assign(await ocrWords(file, progress), { source: 'ocr' });
  };
  async function ocrPass(image, lang, progress, label) {
    const worker = await root.Tesseract.createWorker(lang, 1, {
      logger: (m) => { if (m.status === 'recognizing text') progress(`${label}… ${Math.round(m.progress * 100)}%`); },
    });
    try {
      const { data } = await worker.recognize(image);
      let ws = data.words;
      if (!ws && data.blocks) ws = data.blocks.flatMap((b) => (b.paragraphs || []).flatMap((p) => (p.lines || []).flatMap((l) => l.words || [])));
      const words = (ws || []).filter((w) => w && w.text && w.text.trim() && (w.confidence == null || w.confidence > 20))
        .map((w) => ({ text: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
      return { words, text: data.text || '' };
    } finally { await worker.terminate(); }
  }
  // hours like 08:00-16:00 (or 8-16) in a word
  const TIMEY = /\d{1,2}(?::\d{2})?\s*[-–—]\s*\d{1,2}(?::\d{2})?|\d{1,2}:\d{2}/;
  /**
   * The words of a picture. The Hebrew model sometimes misreads hours that sit next to Hebrew ("08:00-16:00"
   * came out "60 ה"), so a second pass reads the picture with the English model only, which reads digits well:
   * hours it finds where the first pass has no hours take the place of what the first pass read there.
   */
  async function ocrWords(image, progress) {
    // the picture made easy to read first (app/docread.js: light evened out, two readings)
    if (root.DocRead) { const got = await root.DocRead.words(image, progress); return { words: got.words, text: got.he.map((w) => w.text).join(' ') }; }
    await loadScript(LIBS.tesseract);
    progress('טוען מנוע זיהוי עברית (פעם ראשונה ~10MB)…');
    const he = await ocrPass(image, 'heb+eng', progress, 'מזהה טקסט');
    let en;
    try { en = await ocrPass(image, 'eng', progress, 'בודק את השעות'); } catch (e) { return he; }
    const overlap = (a, b) => {
      const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
      return ix * iy / Math.max(1, Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)));
    };
    let words = he.words.slice();
    for (const w of en.words) {
      if (!TIMEY.test(w.text)) continue;
      const near = words.filter((h) => overlap(h, w) > 0.3);
      if (near.some((h) => TIMEY.test(h.text))) continue;
      words = words.filter((h) => !near.includes(h)).concat([w]);
    }
    return { words, text: he.text };
  }

  /* ---------------- flow: upload → extract → verify ---------------- */
  App.actions['payslip-new'] = () => {
    if (UI.sheets.length) UI.closeAll();
    UI.openSheet({
      title: 'ניתוח תלוש שכר',
      body: `<div class="small muted" style="margin-bottom:12px">העלה את התלוש (PDF או צילום). הקריאה מתבצעת בטלפון: התלוש לא נשלח לשום מקום.</div>
        <label class="btn big" style="margin-bottom:10px">${icon('upload')} בחר קובץ PDF או תמונה<input type="file" accept="application/pdf,image/*" id="ps-file" hidden></label>
        <label class="btn tonal block" style="margin-bottom:10px">${icon('camera')} צלם את התלוש<input type="file" accept="image/*" capture="environment" id="ps-cam" hidden></label>
        <button class="btn outlined block" data-manual>${icon('edit')} הזנה ידנית (בלי קובץ)</button>
        <div class="tiny muted" style="margin-top:12px">טיפ: PDF מקורי מדויק יותר מצילום. בצילום: תאורה טובה, ישר מלמעלה, כל התלוש בפריים.</div>${DISCLAIMER}`,
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
  /** A payslip file that came from elsewhere (shared to the app): straight to reading it. */
  App.payslipFromFile = (file) => { if (UI.sheets.length) UI.closeAll(); startExtraction(file); };
  function defaultPeriod() {
    const emp = S.employers[0];
    return U.addMonthKey(Engine.periodOf(U.todayKey(), emp).key, -1);
  }
  // Every way a payslip comes in passes startExtraction: the file picker, the camera, and a file shared from another
  // app (App.payslipFromFile). A payslip is a PDF or a photo of up to 25MB, as the other imports: the picker's
  // accept= is only a hint, and a shared file can be of any kind and size (security audit, 13 Nov 2026).
  const PAYSLIP_MAX = 25 * 1024 * 1024;
  function payslipFileProblem(file) {
    if (!file) return 'לא נבחר קובץ';
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    const ok = type === 'application/pdf' || type.startsWith('image/') || (!type && /\.(pdf|jpe?g|png|webp|heic|heif|gif|bmp)$/.test(name));
    if (!ok) return 'אפשר לקרוא תלוש רק מקובץ PDF או מתמונה';
    if (!(file.size <= PAYSLIP_MAX)) return 'הקובץ גדול מדי (עד 25MB)';
    return '';
  }
  App.payslipFileProblem = payslipFileProblem;
  async function startExtraction(file) {
    const bad = payslipFileProblem(file);
    if (bad) { UI.invalid(bad); return; }
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
      progress(root.U.ours(e) ? e.message : 'לא הצלחנו לקרוא את התלוש מהקובץ');
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
      // each check is markup the app writes itself (fixed text and money(), which is already markup): escaped again,
      // the warnings showed <span class="money"> as text (6 Nov 2026)
      const checks = [];
      if (g == null) checks.push(['need', 'חסר ברוטו: הוסיפו אותו כדי שנוכל לבדוק']);
      if (n == null) checks.push(['need', 'חסר נטו לתשלום']);
      if (g != null && pays > 0) checks.push(Math.abs(pays - g) <= 2 ? ['ok', 'שורות התשלום מסתכמות לברוטו'] : ['warn', `שורות התשלום מסתכמות ל-⁠${money(pays)}, והברוטו ${money(g)}. אולי חסרה או מיותרת שורה`]);
      if (g != null && n != null && val('totalDeductions') != null) checks.push(Math.abs(g - val('totalDeductions') - n) <= 2 ? ['ok', 'ברוטו פחות ניכויים שווה לנטו'] : ['warn', `ברוטו פחות ניכויים יוצא ${money(g - val('totalDeductions'))}, והנטו ${money(n)}`]);
      const cell = (label, v, cls) => `<div class="vf-cell ${cls || ''}"><small>${label}</small><b>${v == null ? '—' : money(v, 0)}</b></div>`;
      return `<div class="vf-flow">${cell('ברוטו', g)}<span class="vf-op">−</span>${cell('ניכויים', ded)}<span class="vf-op">=</span>${cell('נטו', n, 'net')}</div>
        ${checks.length ? `<div class="vf-checks">${checks.map(([s, t]) => `<div class="vf-chk ${s}">${icon(s === 'ok' ? 'okc' : 'alert', 's')}<span>${t}</span></div>`).join('')}</div>` : ''}`;
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
      root.Dom.patch(b, body());
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
        // opened from a reason in the check ("the reader misread a number"): that line opens, or the unplaced lines
        if (draft.openKey != null) {
          setTimeout(() => {
            if (draft.openKey && d.fields[draft.openKey]) openRow(draft.openKey, true);
            else { const o = el.querySelector('.vf-other'); if (o) { o.open = true; o.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
          }, 380);
        }
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
            setTimeout(() => analysisSheet({ id: d.id || 'ps_' + U.uid(), period: d.period, fields: d.fields, other: d.other, text: d.text, source: d.source, fileId: d.fileId, fileName: d.fileName, isNew: !d.id, edited: !!d.id }), 320);
          }
        });
      },
    });
  }
  App.payslipVerify = verifySheet; // tests open it with a ready draft

  /* ---------------- analysis ---------------- */
  // the check reads a payslip and compares it with the shifts the person entered: a gap it finds is a possible gap to
  // look into, never a verdict on the employer (an advisory review, 14 Nov 2026: the words carry trust and legal risk)
  const STATUS = { ok: ['okc', 'תקין'], warn: ['alert', 'כדאי לבדוק'], bad: ['xc', 'ייתכן שיש פער'] };
  // the calm note on every result: an estimate, not legal advice, and where to ask (sources the rights guide links)
  const RESULT_NOTE = `<div class="small muted ps-note" id="ps-note" style="margin:0 4px 12px">${icon('info', 's')} זו הערכה לפי מה שהאפליקציה קראה מהתלוש ולפי המשמרות שהזנת, ולא ייעוץ משפטי. לשאלות על הזכויות שלך: <a href="https://www.kolzchut.org.il/he/" target="_blank" rel="noopener">כל זכות</a> או <a href="https://www.gov.il/he/departments/labor" target="_blank" rel="noopener">משרד העבודה</a>.</div>`;
  // the invite a good result can share: a link to the app and nothing from the payslip (no amount, no month, no name)
  const INVITE_URL = 'https://leelor123.github.io/shifts/';
  const INVITE_TEXT = 'שעתי משווה את תלוש השכר למשמרות שרשמת ומראה אם יש פער שכדאי לבדוק. אפשר לנסות:';
  const CONF = { high: 'ביטחון גבוה', medium: 'ביטחון בינוני', low: 'ביטחון נמוך' };
  function prevSlipOf(period, id) {
    return S.payslips.filter((p) => p.period < period && p.id !== id).sort((a, b) => b.period.localeCompare(a.period))[0];
  }
  /* ---------------- before writing to the employer ----------------
   * When money looks missing, the likely innocent reasons come first (Payslip.checkGap), each checked on the
   * person's own data, with what it explains and a way to fix it; then the gap that is left. The letter and the
   * report stay where they were, never hidden: the letter asks only for what is left. */
  const FOUND_TAG = { yes: ['okc', 'נמצא בנתונים שלך'], maybe: ['help', 'אולי'], no: ['check', 'לא נמצא'] };
  function fixHtml(r) {
    const chips = r.shifts && r.shifts.length ? `<div class="gc-chips">${r.shifts.slice(0, 6).map((id) => { const x = App.result(id); return x ? `<button class="chip" data-act="shift-open" data-id="${esc(id)}">${U.fmtDate(x.dateKey, 'short')} · ${U.hm(x.paidMin)}</button>` : ''; }).join('')}</div>` : '';
    const f = r.fix;
    const btn = !f ? '' : f.kind === 'set' ? `<button class="btn text sm" data-gc-set="${esc(f.k)}" data-f="${esc(f.f || '')}">${icon('settings', 's')} לבדוק בהגדרות</button>`
      : f.kind === 'verify' ? `<button class="btn text sm" data-gc-verify="${esc(f.key || '')}">${icon('edit', 's')} לתקן את נתוני התלוש</button>` : '';
    return chips + (btn ? `<div class="gc-fix">${btn}</div>` : '');
  }
  function checkHtml(c) {
    if (!c || !c.items.length) return '';
    const reason = (r) => `<div class="gc-r ${r.found}">
        <div class="gc-rh"><span class="gc-tag ${r.found}">${icon(FOUND_TAG[r.found][0], 's')}${FOUND_TAG[r.found][1]}</span>${r.amount >= 0.5 ? `<span class="gc-amt">${r.found === 'yes' ? 'מסביר' : 'עד'} ${money(r.amount)}</span>` : ''}</div>
        <b class="gc-rt">${esc(r.title)}</b>
        <div class="gc-t">${esc(r.text)}</div>
        ${r.line ? `<div class="vf-src gc-line">${icon('file', 's')}<span>${esc(r.line)}</span></div>` : ''}
        ${fixHtml(r)}</div>`;
    return `<div class="section-title" id="ps-check-t">${icon('search', 's')} לפני שכותבים למעסיק</div>
      <div class="card gc" id="ps-check">
        <div class="small gc-intro">לפער יכולה להיות סיבה תמימה. בדקנו את הסיבות האפשריות מול הנתונים שלך, מהסבירה ביותר.</div>
        ${c.items.map((it) => {
          const shown = it.reasons.filter((r) => r.found !== 'no');
          const no = it.reasons.filter((r) => r.found === 'no');
          return `<div class="gc-f${it.left < 1 ? ' expl' : ''}" data-key="gc-${esc(it.id)}">
            <div class="gc-fh"><span class="fi">${icon(it.left < 1 ? 'alert' : 'xc', 's')}</span><b>${esc(it.area)} · ${esc(it.title)}</b><span class="amt">${money(it.amount)}</span></div>
            ${shown.map(reason).join('')}
            ${no.length ? `<div class="gc-no">${icon('check', 's')}<span>בדקנו ולא מצאנו: ${no.map((r) => esc(r.title)).join(' · ')}</span></div>` : ''}
          </div>`;
        }).join('')}
        <div class="gc-left${c.all ? ' all' : ''}"><small>הפער שנשאר אחרי הבדיקות</small><b>${money(c.left)}</b></div>
        <div class="small gc-sum">${c.all ? 'הסיבות שמצאנו מסבירות את כל הפער, כך שכנראה הכול בסדר. כדאי לבדוק אותן, ואם משהו עדיין לא מסתדר, המכתב מחכה למטה.'
          : c.explained >= 1 ? 'אם בדקת ועדיין חסר, המכתב למטה מבקש רק את הפער שנשאר.' : 'לא מצאנו סיבה תמימה שמסבירה את הפער. המכתב למטה מוכן.'}</div>
        ${c.all ? `${c.nextSlip ? `<button class="btn block" data-gc-remind>${icon('bell', 's')} תזכיר לי לבדוק בתלוש הבא</button>` : ''}
          <button class="btn text sm block gc-letter-anyway" data-go-letter>${icon('send', 's')} להמשיך למכתב בכל זאת</button>`
          : `<button class="btn block" data-go-letter>${icon('send', 's')} בדקתי, להמשיך למכתב</button>`}
      </div>`;
  }
  /* ---------------- the payslip against the app's own calculation ----------------
   * Payslip.reconcile: each line's part of the gap between the payslip and the app, adding up to the whole gap, with
   * what no line explains on a line of its own. A line whose cause the data shows says it and offers the fix; one
   * whose cause is not known asks the question that would settle it. Payslip.settingsCheck: the settings the payslip
   * says otherwise, each with "update to the payslip" when the payslip is the better source. */
  function reconcileOf(slip, a, c) {
    try { return Payslip.reconcile(slip, App.model, a, c); } catch (e) { console.warn('reconcile', e); return null; }
  }
  // a gap amount as words: "₪X less on the payslip" / "₪X more on the payslip"
  const gapWord = (d) => (d < 0 ? 'פחות בתלוש' : 'יותר בתלוש');
  function rcFixes(fixes, rc) {
    const out = [];
    for (const f of fixes || []) {
      if (f.kind === 'sc') {
        const s = rc.settings.find((x) => x.id === f.id);
        if (s && s.apply) out.push(`<button class="btn tonal sm" data-rc-apply="${esc(s.id)}">${icon('check', 's')} לעדכן לפי התלוש</button>`);
        if (s && s.set) out.push(`<button class="btn text sm" data-gc-set="${esc(s.set.k)}" data-f="${esc(s.set.f || '')}">${icon('settings', 's')} לבדוק בהגדרות</button>`);
      } else if (f.kind === 'set') out.push(`<button class="btn text sm" data-gc-set="${esc(f.k)}" data-f="${esc(f.f || '')}">${icon('settings', 's')} לבדוק בהגדרות</button>`);
      else if (f.kind === 'verify') out.push(`<button class="btn text sm" data-gc-verify="${esc(f.key || '')}">${icon('edit', 's')} לתקן את נתוני התלוש</button>`);
      else if (f.kind === 'shift') out.push(`<button class="btn text sm" data-act="shift-new">${icon('plus', 's')} להוסיף משמרת</button>`);
      else if (f.kind === 'entry') out.push(`<button class="btn text sm" data-rc-entry="${esc(f.entry)}" data-date="${esc(f.date || '')}">${icon('plus', 's')} ${f.entry === 'vacation' ? 'לרשום יום חופשה' : f.entry === 'sick' ? 'לרשום יום מחלה' : f.entry === 'deduction' ? 'לרשום ניכוי' : 'לרשום בונוס'}</button>`);
      else if (f.kind === 'label') out.push(`<button class="btn text sm" data-rc-label>${icon('edit', 's')} לסמן את השורות</button>`);
      else if (f.kind === 'shifts') out.push(`<span class="gc-chips">${f.ids.slice(0, 6).map((id) => { const x = App.result(id); return x ? `<button class="chip" data-act="shift-open" data-id="${esc(id)}">${U.fmtDate(x.dateKey, 'short')} · ${U.hm(x.paidMin)}</button>` : ''; }).join('')}</span>`);
    }
    // the same button twice (two reasons pointing at one setting) is drawn once
    const seen = new Set();
    const uniq = out.filter((h) => (seen.has(h) ? false : seen.add(h)));
    return uniq.length ? `<div class="sc-acts">${uniq.join('')}</div>` : '';
  }
  function rcRow(it, rc, side) {
    const ask = it.state === 'ask';
    const vals = it.id === 'rate' ? `<span>שעתי: <b>${money(it.app)}</b></span><span>בתלוש: <b>${money(it.slip)}</b></span>`
      : it.hours && it.hours.slip != null ? `<span>שעתי: <b>${U.hours(it.hours.app)} ש׳</b></span><span>בתלוש: <b>${U.hours(it.hours.slip)} ש׳</b></span>`
        : it.id === 'unexplained' || it.id === 'gross' ? '' : `<span>שעתי: <b>${money(it.app)}</b></span><span>בתלוש: <b>${money(it.slip)}</b></span>`;
    const parts = it.parts ? `<ul class="rc-parts">${it.parts.map((p) => `<li class="${p.known ? '' : 'unk'}"><span>${esc(p.label || 'לא מוסבר')}</span><span>${money(Math.abs(p.amount))} ${p.amount < 0 ? (side === 'net' ? 'פחות בנטו' : gapWord(p.amount)) : (side === 'net' ? 'יותר בנטו' : gapWord(p.amount))}</span></li>`).join('')}</ul>` : '';
    const word = side === 'net' ? (it.diff < 0 ? 'פחות בנטו' : 'יותר בנטו') : gapWord(it.diff);
    return `<details class="rc-row ${it.state} ${it.id === 'unexplained' ? 'unexplained' : ''}" data-key="rc-${side}-${esc(it.id)}"${ask ? ' open' : ''}>
      <summary><span class="rc-tag">${icon(ask ? 'help' : 'okc', 's')}</span><span class="rc-l">${esc(it.label)}<small>${ask ? 'צריך תשובה' : 'הסיבה ידועה'}</small></span><span class="rc-d">${money(Math.abs(it.diff))}<small>${word}</small></span></summary>
      <div class="rc-in">${vals ? `<div class="rc-vals">${vals}</div>` : ''}<div>${esc(it.text)}</div>${parts}
        ${it.ask ? `<div class="rc-ask">${icon('help', 's')}<span>${esc(it.ask)}</span></div>` : ''}${rcFixes(it.fixes, rc)}</div></details>`;
  }
  function rcSide(sd, rc, side) {
    const shown = sd.items.filter((x) => x.state !== 'match' && !(side === 'net' && x.id === 'gross' && Math.abs(x.diff) < 0.5));
    const same = sd.items.filter((x) => x.state === 'match' && x.id !== 'rate' && x.id !== 'gross');
    return `${shown.map((x) => rcRow(x, rc, side)).join('')}
      ${same.length ? `<div class="rc-match">${icon('okc', 's')}<span>תואם לחישוב: ${same.map((x) => esc(x.label)).join(' · ')}</span></div>` : ''}`;
  }
  function reconcileHtml(rc) {
    if (!rc) return '';
    const g = rc.gross, n = rc.net;
    const zero = Math.abs(g.total) < 1 && (!n || Math.abs(n.total) < 1);
    const cell = (label, v, cls) => `<div class="${cls || ''}"><small>${label}</small><b>${money(v, 0)}</b></div>`;
    const sum = zero ? 'התלוש והחישוב של שעתי זהים.'
      : rc.exact ? 'לכל הפער יש סיבה ידועה, בשורות למטה. איפה שיש תיקון, אפשר לעדכן בלחיצה.'
        : rc.asks === 1 ? `נשארה שאלה אחת. התשובה תסביר עד ${U.money(rc.open)} מהפער, ואז החישוב יתאים לתלוש.`
          : `נשארו ${rc.asks} שאלות. התשובות יסבירו עד ${U.money(rc.open)} מהפער, ואז החישוב יתאים לתלוש.`;
    return `<div class="section-title" id="ps-rc-t">${icon('calc', 's')} התלוש מול החישוב של שעתי</div>
      <div class="card rc" id="ps-rc">
        <div class="rc-side" style="margin-top:0">ברוטו</div>
        <div class="rc-top">${cell('שעתי', g.app)}${cell('בתלוש', g.slip)}<div class="gap${Math.abs(g.total) < 1 ? ' zero' : ''}"><small>${Math.abs(g.total) < 1 ? 'הפרש' : gapWord(g.total)}</small><b>${money(Math.abs(g.total), 0)}</b></div></div>
        ${g.override ? `<div class="rc-ov">${icon('hand', 's')} ${esc(g.override)}</div>` : ''}
        ${rcSide(g, rc, 'gross')}
        ${n ? `<div class="rc-side">נטו</div>
          <div class="rc-top">${cell('שעתי', n.app)}${cell('בתלוש', n.slip)}<div class="gap${Math.abs(n.total) < 1 ? ' zero' : ''}"><small>${Math.abs(n.total) < 1 ? 'הפרש' : (n.total < 0 ? 'פחות בנטו' : 'יותר בנטו')}</small><b>${money(Math.abs(n.total), 0)}</b></div></div>
          ${rcSide(n, rc, 'net')}` : ''}
        <div class="small rc-sum">${sum}</div>
      </div>`;
  }
  function settingsHtml(rc) {
    if (!rc || !rc.settings.length) return '';
    return `<div class="section-title">${icon('settings', 's')} ההגדרות שלך מול התלוש</div>
      <div class="card" id="ps-sc">${rc.settings.map((s) => `<div class="sc-row" data-key="sc-${esc(s.id)}"><b>${esc(s.label)}</b>
        <div class="sc-vals"><span class="${s.recommend === 'slip' ? 'slip' : ''}">בתלוש<b>${esc(s.slip)}</b></span><span>בהגדרות<b>${esc(s.app)}</b></span></div>
        <div class="small">${esc(s.text)}</div>
        <div class="sc-acts">${s.apply ? `<button class="btn ${s.recommend === 'slip' ? '' : 'tonal'} sm" data-rc-apply="${esc(s.id)}">${icon('check', 's')} ${s.recommend === 'slip' ? 'לעדכן לפי התלוש' : 'התלוש נכון, לעדכן'}</button>` : ''}${s.set ? `<button class="btn text sm" data-gc-set="${esc(s.set.k)}" data-f="${esc(s.set.f || '')}">${icon('settings', 's')} לבדוק בהגדרות</button>` : ''}</div></div>`).join('')}</div>`;
  }
  function leaveHtml(deltas) {
    if (!deltas.length) return '';
    return `<div class="section-title">${icon('beach', 's')} ימי חופשה ומחלה מאז התלוש הקודם</div>
      <div class="card">${deltas.map((d) => `<div class="lv-row"><span class="lv-l"><b>${esc(d.label)}: ${esc(U.num(d.now, 2))}</b><small>${esc(d.text)}</small></span>
        <span class="lv-d ${d.delta > 0.005 ? 'up' : d.delta < -0.005 ? 'down' : ''}" dir="ltr">${d.delta > 0.005 ? '+' : d.delta < -0.005 ? '−' : ''}${esc(U.num(Math.abs(d.delta), 2))}</span></div>`).join('')}</div>`;
  }
  /** A fix from the check: the payslip's value written to the settings, the workplace or the job (with undo). */
  async function applyFix(fx) {
    if (!fx) return;
    if (fx.kind === 'settings') {
      const path = fx.path.split('.');
      await Store.setSettings((s) => { let o = s; for (const k of path.slice(0, -1)) o = o[k] = o[k] || {}; o[path[path.length - 1]] = Store.clone(fx.value); }, 'עדכון לפי התלוש');
      UI.toast('עודכן לפי התלוש', { label: 'ביטול', fn: App.undo }, { ok: true });
    } else if (fx.kind === 'employer') {
      // the workplace the check ran on (the model's primary one)
      const pid = App.model && App.model.ctx.primaryEmployer ? App.model.ctx.primaryEmployer().id : null;
      const emp = S.employers.find((e) => e.id === pid) || S.employers[0];
      if (emp) await App.saveOps([{ store: 'employers', put: Object.assign({}, emp, fx.patch) }], 'עדכון לפי התלוש', 'עודכן לפי התלוש');
    } else if (fx.kind === 'role') {
      const role = S.roles.find((r) => r.id === fx.id);
      if (role) await App.saveOps([{ store: 'roles', put: Object.assign({}, role, { rates: (role.rates || []).filter((r) => r.from !== fx.from).concat([{ from: fx.from, rate: fx.rate }]) }) }], 'עדכון לפי התלוש', 'התעריף עודכן');
    }
  }
  function analysisHtml(slip, a, c) {
    // a finding a reason in the person's data explains in full is shown as explained (amber), not as missing money,
    // and the counts and the total on top follow it
    const explainedBy = (f) => { const it = c && c.items.find((x) => x.id === f.id); return it && it.left < 1 ? it.by : ''; };
    const statusOf = (f) => (f.status === 'bad' && explainedBy(f) ? 'warn' : f.status);
    const counts = { ok: 0, warn: 0, bad: 0 };
    a.findings.forEach((f) => counts[statusOf(f)]++);
    const prev = prevSlipOf(slip.period, slip.id);
    const wf = Payslip.waterfall(slip.fields);
    // the only comparison with another payslip: the leave balances, up or down since the one before
    const lines = Payslip.explainLines(slip.fields, prev && prev.fields);
    const deltas = Payslip.compareSlips(prev && prev.fields, slip.fields, a);
    const rc = reconcileOf(slip, a, c);
    const rcShown = a.noShifts ? null : rc;
    const msg = Payslip.employerMessage(a, { name: S.settings.userName || '', check: c });
    const left = c && c.items.length ? c.left : a.totalMissing;
    const order = { bad: 0, warn: 1, ok: 2 };
    const good = a.totalMissing <= 0 ? counts.bad === 0 : left < 1;
    // no shift logged in the period: the hours could not be compared, said calmly with a way to add them
    const noShiftsHtml = a.noShifts ? `<div class="card tonal ps-noshifts" id="ps-noshifts"><b>${icon('calendar', 's')} עוד אין משמרות בחודש הזה</b><div class="small">בדקנו את מה שאפשר לבדוק מהתלוש לבד, כמו שכר מינימום, פנסיה, מס וביטוח לאומי. כדי להשוות גם את השעות, אפשר לרשום את המשמרות של החודש או לייבא סידור עבודה.</div>
      <div class="btn-row" style="margin-top:8px"><button class="btn tonal sm" data-act="shift-new">${icon('plus', 's')} רישום משמרת</button><button class="btn text sm" data-act="import-schedule">${icon('table', 's')} ייבוא סידור עבודה</button></div></div>` : '';
    const hero = a.noShifts ? noShiftsHtml : a.totalMissing <= 0 ? (counts.bad === 0 ? `<div class="card tonal"><b>${icon('okc', 's')} לא מצאנו פערים</b><div class="small">התלוש תואם למשמרות שרשמת${counts.warn ? ', עם כמה נקודות לבדיקה' : ''}.</div></div>` : '')
      : left < 1 ? `<div class="card tonal"><b>${icon('okc', 's')} כנראה הכול בסדר</b><div class="small">ההפרש של ${money(a.totalMissing)} שנמצא בתלוש מוסבר כולו בסיבות שמצאנו בנתונים שלך.</div></div>`
        : `<div class="card tonal"><div class="small">ייתכן שיש פער. כדאי לבדוק</div><div class="hero-num">${money(left)}</div><div class="tiny">${left < a.totalMissing - 0.5 ? `מתוך ${money(a.totalMissing)} שנמצאו, ${money(a.totalMissing - left)} מוסברים בסיבות שמצאנו.` : `סכום הממצאים שמסומנים בסימן ${icon('xc', 's')} בפירוט למטה.`}</div></div>`;
    return `
      ${carryHtml(slip)}
      <div class="status-summary"><div class="ok">${icon('okc', 's')} ${counts.ok}<div class="tiny">תקין</div></div><div class="warn">${icon('alert', 's')} ${counts.warn}<div class="tiny">לבדוק</div></div><div class="bad">${icon('xc', 's')} ${counts.bad}<div class="tiny">פער אפשרי</div></div></div>
      ${hero}
      ${RESULT_NOTE}
      ${good ? inviteHtml() : ''}
      ${reconcileHtml(rcShown)}
      ${settingsHtml(rc)}
      ${leaveHtml(deltas)}
      ${checkHtml(c)}
      ${a.overridesInPeriod ? `<div class="banner warn">${icon('hand')}<div>${a.overridesInPeriod} משמרות בתקופה כוללות עקיפה ידנית. ממצאים שנובעים מהן מסומנים.</div></div>` : ''}
      <div class="small muted" style="margin:0 4px 10px">תקופה: \u2066${U.fmtDate(a.expected.P.from)}\u2060–\u2060${U.fmtDate(a.expected.P.to)}\u2069 · ${a.expected.shifts.length} משמרות · ${U.hours(a.expected.t.hours)} ש׳</div>
      ${a.findings.slice().sort((x, y) => order[statusOf(x)] - order[statusOf(y)]).map((f) => { const by = f.status === 'bad' ? explainedBy(f) : ''; const st = statusOf(f); return `<div class="finding ${st}">
        <div class="ft"><span class="fi">${icon(STATUS[st][0], 's')}</span><span>${esc(f.area)} · ${esc(f.title)}</span>${!by && f.amount > 0 && f.status !== 'ok' ? `<span class="amt">${U.money(f.amount)}</span>` : ''}</div>
        ${by ? `<div class="gc-expl">מוסבר: ${esc(by)} · ${money(f.amount)}</div>` : ''}
        <div class="fd">${esc(f.detail)}</div>
        ${f.fromOverride ? `<div class="fd" style="color:var(--override)">${icon('hand', 's')} ${esc(f.fromOverride)}</div>` : ''}
        ${f.note ? `<div class="fd small">${icon('info', 's')} ${esc(f.note)}</div>` : ''}
        ${f.shifts && f.shifts.length ? `<div style="margin-top:6px">${f.shifts.slice(0, 6).map((id) => { const r = App.result(id); return r ? `<button class="chip" data-act="shift-open" data-id="${id}">${U.fmtDate(r.dateKey, 'short')} · ${U.hm(r.paidMin)}</button>` : ''; }).join(' ')}</div>` : ''}
        <div class="fb">על מה זה מבוסס: ${esc(f.basis)} · <span class="conf ${f.confidence}">${CONF[f.confidence]}</span></div></div>`; }).join('')}
      ${msg ? `<div class="section-title" id="ps-letter">${icon('send', 's')} מה לעשות</div><div class="card"><div class="small" style="margin-bottom:8px">הודעה מוכנה למעסיק / משאבי אנוש (אפשר לערוך):</div><textarea class="input" id="ps-msg" rows="10" aria-label="הודעה למעסיק">${esc(msg)}</textarea>
        <div class="btn-row" style="margin-top:8px"><button class="btn tonal" data-copy-msg>${icon('copy')} העתק</button><button class="btn tonal" data-share-msg>${icon('share')} שתף</button></div>
        <button class="btn text sm gc-report" data-gc-report>${icon('file', 's')} דוח ומכתב לבירור מול המעסיק</button>
        ${left >= 1 ? `<button class="btn tonal sm found-share" data-act="found-share" data-amount="${Math.round(left)}" data-k="found">${icon('share', 's')} שתף: שעתי מצאה לי ${money(left, 0)}</button>` : ''}</div>` : ''}
      ${wf ? `<div class="section-title">${icon('chart', 's')} מברוטו לנטו</div><div class="card">${Charts.waterfall(wf, { fmt: (v) => U.money(v), axisFmt: (v) => '₪' + (v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'K' : Math.round(v)) })}
        <div class="tiny muted">כחול = ברוטו, אדום = ניכויים, ירוק = נטו. לחץ על עמודה לפרטים.</div></div>` : ''}
      ${translatorHtml(slip, lines)}
      ${wrongHtml()}
      ${DISCLAIMER}`;
  }
  /** "The reading is wrong": fix the read values in place, or tell the team (nothing from the payslip goes with it). */
  function wrongHtml() {
    return `<div class="section-title" id="ps-wrong-t">${icon('help', 's')} משהו נקרא לא נכון?</div>
      <div class="card ps-wrong" id="ps-wrong"><div class="small">אפשר לתקן כל שורה במקום, והבדיקה תרוץ שוב על המספרים הנכונים.</div>
        <div class="btn-row" style="margin-top:8px"><button class="btn tonal sm" data-edit>${icon('edit', 's')} תיקון מה שנקרא</button><button class="btn text sm" data-ps-feedback>${icon('mail', 's')} לספר לנו מה השתבש</button></div>
        <div class="tiny muted" style="margin-top:6px">בפנייה לא יצורפו התלוש או הסכומים שלך. את הטקסט אפשר לקרוא ולערוך לפני השליחה.</div></div>`;
  }
  /** On a result with no gap: an invite to the app to share (a link and a sentence, nothing from the payslip). */
  function inviteHtml() {
    return `<div class="card ps-invite" id="ps-invite"><div class="small">מכירים עוד אנשים שעובדים במשמרות? אפשר לשלוח להם את שעתי.</div>
      <button class="btn tonal sm" data-ps-invite style="margin-top:8px">${icon('share', 's')} שליחת קישור לאפליקציה</button>
      <div class="tiny muted" style="margin-top:6px">נשלחים רק משפט וקישור לאפליקציה, בלי סכומים ובלי פרטים מהתלוש.</div></div>`;
  }
  /** The feedback request's first words: how the payslip was read, nothing else (the person adds what went wrong). */
  const feedbackText = (source) => `הקריאה של התלוש לא הייתה נכונה (${(SOURCE[source] || SOURCE.manual)[1]}). מה נקרא לא נכון: `;
  function gapCheck(slip, a) {
    try { return Payslip.checkGap(a, slip, App.model); } catch (e) { console.warn('gap check', e); return null; }
  }

  /* ---------------- the line-by-line translator ----------------
   * Every line the check knows: its name in the app's language, the Hebrew term as payslips print it (outside
   * Hebrew), what it is in one plain sentence, the amount, and whether it is money to you, a deduction or the
   * employer's money. Lines the reader could not name follow, with their original text and a button to name them.
   * Outside Hebrew a switch adds the Hebrew sentence to each line, to show the employer. */
  const HE_UI = U.LANG === 'he';
  const HE_KEY = 'shaati.payslipHe';
  let heOn = false;
  try { heOn = localStorage.getItem(HE_KEY) === '1'; } catch (e) { /* private window: off */ }
  const heBdi = (t, cls) => `<bdi class="${cls}" lang="he" dir="rtl">${esc(t)}</bdi>`;
  function translatorHtml(slip, lines) {
    const unknown = Payslip.unknownLines(slip.other, slip.fields);
    if (!lines.length && !unknown.length) return '';
    // the order a worker reads the money in: pay, deductions, employer, totals (net last), then information. A line
    // the person named "other payment" / "other deduction" closes its group; one not named yet follows the totals.
    const rank = (k) => { const i = Payslip.READ_ORDER.indexOf(k); return i < 0 ? 999 : i; };
    const known = lines.slice().sort((x, y) => rank(x.key) - rank(y.key));
    const ordered = [];
    for (const kind of ['pay', 'ded', 'emp', 'total']) {
      ordered.push(...known.filter((l) => l.kind === kind));
      ordered.push(...unknown.filter((u) => u.kind === kind));
    }
    ordered.push(...unknown.filter((u) => !u.kind), ...known.filter((l) => !['pay', 'ded', 'emp', 'total'].includes(l.kind)));
    const amount = (l) => (l.kind === 'info' ? esc(U.num(l.value, 2)) : U.money(l.value));
    const row = (l) => `<details class="collapse ps-tr-row${l.key === 'net' ? ' ps-tr-net' : ''}" data-k="${l.key}"><summary><span class="ps-tr-h"><span class="ps-tr-l">${esc(l.label)}${l.change ? ' <span class="tag warn">שינוי</span>' : ''}</span>${HE_UI ? '' : heBdi(l.heTerm, 'ps-tr-he')}<span class="ps-k k-${l.kind}">${esc(l.kindLabel)}</span></span><span class="money">${amount(l)}</span></summary>
      <div class="in small"><div class="ps-tr-m">${esc(l.meaning)}</div>${HE_UI ? '' : `<div class="ps-tr-mhe" lang="he" dir="rtl">${esc(l.meaningHe)}</div>`}
        ${l.printed ? `<div class="ps-tr-p">בתלוש שלך כתוב: ${heBdi(l.printed, 'ps-tr-pt')}</div>` : ''}
        <div class="ps-tr-x">${esc(l.explain)}${l.qty ? `<br>כמות: ${U.num(l.qty, 2)}` : ''}</div>${l.change ? `<div class="ps-tr-c"><b>${esc(l.change)}</b></div>` : ''}</div></details>`;
    const unk = (u) => `<div class="ps-tr-row ps-tr-unk"><div class="ps-tr-uh"><span class="ps-tr-h"><span class="ps-tr-l">${u.guess === 'otherPay' ? 'תשלום אחר' : u.guess === 'otherDed' ? 'ניכוי אחר' : 'שורה שלא זיהינו'}</span>${u.kind ? `<span class="ps-k k-${u.kind}">${esc(u.kindLabel)}</span>` : ''}</span><span class="money">${U.money(Math.abs(u.value))}</span></div>
      ${heBdi(u.line, 'ps-tr-orig')}
      <button class="btn tonal sm" data-ps-label="${u.index}">${icon('edit', 's')} ${u.guess ? 'לשנות' : 'מה זה? לסמן'}</button></div>`;
    return `<div class="section-title">${icon('info', 's')} הסבר לכל שורה</div>
      <div class="small muted ps-tr-intro">מה כל שורה בתלוש אומרת ומה היא עושה לכסף שלך. לחצו על שורה לפרטים.</div>
      ${HE_UI ? '' : `<div class="card ps-tr-sw"><label class="switch-row"><span class="body"><span class="t">הצג גם בעברית</span><span class="s">המשפט בעברית ליד כל שורה, כדי להראות למעסיק</span></span><input type="checkbox" class="switch" data-ps-he ${heOn ? 'checked' : ''}></label></div>`}
      <div class="list ps-tr${heOn ? ' he-on' : ''}" data-ps-tr>${ordered.map((x) => (x.index != null ? unk(x) : row(x))).join('')}</div>`;
  }
  /** Name an unrecognised line: a sheet with the line's text and every kind of line the slip does not have yet. */
  function labelSheet(slip, index, onPick) {
    const o = (slip.other || [])[index];
    if (!o) return;
    const missing = Payslip.FIELDS.filter((f) => !slip.fields[f.key]);
    const chip = (key, label) => `<button class="chip ps-lb" data-pick="${key}"><span>${esc(label)}</span>${HE_UI || !Payslip.HE_TERM[key] ? '' : heBdi(Payslip.HE_TERM[key], 'ps-lb-he')}</button>`;
    UI.openSheet({
      title: 'מה השורה הזאת?',
      body: `<div class="card ps-lb-line">${heBdi(o.line, 'ps-tr-orig')}<span class="money">${U.money(Math.abs(+o.value || 0))}</span></div>
        <div class="small muted" style="margin:0 4px 10px">בחרו מה כתוב בשורה. אם לא בטוחים, אפשר לבחור תשלום אחר או ניכוי אחר.</div>
        <div class="chips wrap">${chip('otherPay', 'תשלום אחר')}${chip('otherDed', 'ניכוי אחר')}</div>
        ${GROUPS.map(([kind, label]) => { const fs = missing.filter((f) => f.kind === kind); return fs.length ? `<div class="section-title">${label}</div><div class="chips wrap">${fs.map((f) => chip(f.key, f.label)).join('')}</div>` : ''; }).join('')}`,
      onMount: (el) => el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b) return;
        UI.closeTop();
        onPick(b.dataset.pick);
      }),
    });
  }
  function analysisSheet(slip) {
    let a = Payslip.analyze(slip, App.model);
    let c = gapCheck(slip, a);
    let off = null, msgEdited = false;
    UI.openSheet({
      title: 'ניתוח תלוש · ' + U.fmtMonth(slip.period), full: true,
      body: analysisHtml(slip, a, c),
      // a reason's fix changes a setting or a shift in a sheet above this one: the check runs again on the new
      // numbers and only what changed is drawn again (a letter the person edited keeps its text)
      onClose: () => { if (off) off(); },
      foot: slip.isNew ? `<button class="btn tonal" data-edit>${icon('edit')} תקן נתונים</button><button class="btn" data-save>${icon('check')} שמור בארכיון</button>`
        : `<button class="btn danger" data-del style="flex:0 0 auto" aria-label="מחיקת התלוש">${icon('trash')}</button><button class="btn tonal" data-edit>${icon('edit')} תקן נתונים</button>${slip.fileId ? `<button class="btn tonal" data-file style="flex:0 0 auto">${icon('file')}</button>` : ''}`,
      onMount: (el) => {
        el.addEventListener('input', (e) => { if (e.target.id === 'ps-msg') msgEdited = true; });
        // the check runs again on the current numbers and only what changed is drawn again (an edited letter keeps its text)
        const redraw = () => {
          const body = el.querySelector('.sh-body');
          if (!body || !el.isConnected) return;
          a = Payslip.analyze(slip, App.model);
          c = gapCheck(slip, a);
          const ta = el.querySelector('#ps-msg');
          const typed = msgEdited && ta ? ta.value : null;
          const y = body.scrollTop;
          root.Dom.patch(body, analysisHtml(slip, a, c));
          body.scrollTop = y;
          const ta2 = el.querySelector('#ps-msg');
          if (ta2) ta2.value = typed != null ? typed : ta2.textContent;
        };
        off = Store.on((ev) => { if (ev && ev.type === 'active') return; redraw(); });
        // a payslip from the archive, corrected and checked again, is saved right away: the footer of an archived
        // slip has no save button, and the corrections were lost when the sheet closed (user report, Nov 2026)
        if (slip.edited && !slip.isNew) { delete slip.edited; saveSlip(slip, a, c, 'השינויים בתלוש נשמרו').catch((e) => console.warn('payslip save', e)); }
        // "show in Hebrew too": a class on the list, no redraw (remembered on this phone)
        el.addEventListener('change', (e) => {
          if (!e.target.matches('[data-ps-he]')) return;
          heOn = e.target.checked;
          try { localStorage.setItem(HE_KEY, heOn ? '1' : '0'); } catch (err) { /* private window */ }
          const list = el.querySelector('[data-ps-tr]');
          if (list) list.classList.toggle('he-on', heOn);
        });
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-gc-remind')) {
            // the payslip is kept with these findings as "check on the next payslip": the payday reminder brings the
            // next payslip, and its check asks about them (carryHtml)
            const t = `נזכיר לך: ביום התשלום הבא תופיע תזכורת להעלות את התלוש של ${U.fmtMonth(U.addMonthKey(slip.period, 1))}, ובבדיקה שלו נשאל אם זה שולם.`;
            if (slip.isNew) { UI.closeTop(); await saveSlip(slip, a, c, t); } else await saveSlip(slip, a, c, t);
            return;
          }
          // the payslip's value taken into the settings: the check runs again on it (Store.on → redraw)
          if (b.dataset.rcApply) {
            const rc = reconcileOf(slip, a, c);
            const s = rc && rc.settings.find((x) => x.id === b.dataset.rcApply);
            if (s) await applyFix(s.apply);
            return;
          }
          if (b.dataset.rcEntry) {
            const k = b.dataset.rcEntry;
            const opts = k === 'vacation' || k === 'sick' ? { kind: k } : { kind: 'adjustment', type: k === 'deduction' ? 'deduction' : 'bonus' };
            App.sheetsApi.entryEditor(null, Object.assign(opts, { date: b.dataset.date || undefined }));
            return;
          }
          if (b.hasAttribute('data-rc-label')) { const t = el.querySelector('[data-ps-tr]'); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
          if (b.hasAttribute('data-go-letter')) { const t = el.querySelector('#ps-letter'); if (t) t.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
          if (b.dataset.gcSet) { App.sheetsApi.settingsSection(b.dataset.gcSet, b.dataset.f || ''); return; }
          if (b.hasAttribute('data-gc-verify')) { const key = b.dataset.gcVerify; UI.closeTop(); setTimeout(() => verifySheet(Object.assign({}, slip, { id: slip.isNew ? null : slip.id, openKey: key })), 320); return; }
          if (b.hasAttribute('data-gc-report')) {
            // an unsaved payslip goes into the archive first, so the report has it
            if (slip.isNew) { UI.closeTop(); await saveSlip(slip, a, c); setTimeout(() => App.claimReport(), 360); } else App.actions['claim-report']();
            return;
          }
          if (b.dataset.psLabel != null) {
            const index = +b.dataset.psLabel;
            labelSheet(slip, index, async (key) => {
              // the named line joins the check: analyze and the gap check run again, then only what changed is drawn
              slip = Payslip.labelOther(slip, index, key);
              redraw();
              if (!slip.isNew) await saveSlip(slip, a, c); // a slip from the archive keeps the name it was given
            });
            return;
          }
          // feedback through the help centre's request form: it opens with how the payslip was read, in a box the
          // person sees and edits before sending; the payslip, its amounts and its text never go with it
          if (b.hasAttribute('data-ps-feedback')) { if (root.Support) root.Support.newTicket('payslip', feedbackText(slip.source)); else if (App.actions.support) App.actions.support(); return; }
          if (b.hasAttribute('data-ps-invite')) { await UI.shareText(INVITE_TEXT, { title: 'Shaati', url: INVITE_URL, okText: 'הקישור הועתק. אפשר להדביק בוואטסאפ' }); return; }
          if (b.hasAttribute('data-copy-msg')) { await UI.copied(el.querySelector('#ps-msg').value, 'ההודעה הועתקה'); }
          if (b.hasAttribute('data-share-msg')) { const t = el.querySelector('#ps-msg').value; await UI.shareText(t, { okText: 'הועתק' }); }
          if (b.hasAttribute('data-edit')) { UI.closeTop(); setTimeout(() => verifySheet(Object.assign({}, slip, { id: slip.isNew ? null : slip.id })), 320); }
          if (b.hasAttribute('data-file')) {
            const f = await Store.getFile(slip.fileId);
            // only a PDF or a picture is opened, in a window with no way back into the app (never an HTML or SVG of the app's origin)
            const ft = f && f.blob && /^(application\/pdf|image\/(png|jpeg|webp|gif|heic|heif))$/.test(f.blob.type) ? f.blob.type : '';
            if (ft) window.open(URL.createObjectURL(new Blob([f.blob], { type: ft })), '_blank', 'noopener'); else UI.toast('הקובץ לא נמצא');
          }
          if (b.hasAttribute('data-del')) {
            if (!(await UI.confirm('למחוק את התלוש מהארכיון?', '', 'מחק', true))) return;
            UI.closeTop();
            const ops = [{ store: 'payslips', del: slip.id }, ...S.gaps.filter((g) => g.payslipId === slip.id).map((g) => ({ store: 'gaps', del: g.id }))];
            await App.saveOps(ops, 'מחיקת תלוש', 'התלוש נמחק');
          }
          if (b.hasAttribute('data-save')) { UI.closeTop(); await saveSlip(slip, a, c); }
        });
      },
    });
  }
  async function saveSlip(slip, a, c, toastText) {
    const itemOf = (f) => (c ? c.items.find((x) => x.id === f.id) : null);
    const counts = { ok: 0, warn: 0, bad: 0 };
    // a finding the innocent reasons explain in full counts as "to check", as on the screen
    a.findings.forEach((f) => { const it = itemOf(f); counts[f.status === 'bad' && it && it.left < 1 ? 'warn' : f.status]++; });
    const rec = {
      id: slip.id, period: slip.period, employerId: S.employers[0].id, fields: slip.fields, other: slip.other,
      text: slip.text, source: slip.source, fileId: slip.fileId || null, fileName: slip.fileName || '',
      summary: { counts, totalMissing: a.totalMissing, left: c ? Math.round(c.left * 100) / 100 : a.totalMissing, gross: slip.fields.gross ? slip.fields.gross.value : null, net: slip.fields.net ? slip.fields.net.value : null },
    };
    const ops = [{ store: 'payslips', put: rec }];
    // open gaps from this slip (replace previous gaps of the same slip)
    S.gaps.filter((g) => g.payslipId === slip.id && g.status === 'open').forEach((g) => ops.push({ store: 'gaps', del: g.id }));
    const next = U.addMonthKey(slip.period, 1);
    for (const f of a.findings.filter((x) => x.status === 'bad' && x.amount > 0)) {
      const it = itemOf(f);
      const gap = { id: slip.id + '_' + f.area, payslipId: slip.id, period: slip.period, area: f.area, title: f.title, amount: Math.round(f.amount * 100) / 100, status: 'open' };
      // explained in full: kept as "maybe", and when the next payslip may pay it, that payslip's check asks about it
      if (it && it.left < 1) Object.assign(gap, it.nextSlip ? { status: 'maybe', checkIn: next, note: `לבדוק בתלוש של ${U.fmtMonth(next)}: ${it.by}` } : { status: 'maybe', note: `ייתכן שמוסבר: ${it.by}` });
      else if (it && it.explained >= 1) gap.amount = Math.round(it.left * 100) / 100;
      ops.push({ store: 'gaps', put: gap });
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
    // a gap this save puts back is not deleted first: deleted and written again, the same gap went up as a new version
    // (and as a tombstone before it) on every save of the same payslip; put as it was, Store.apply writes nothing
    const reput = new Set(ops.filter((o) => o.store === 'gaps' && o.put).map((o) => o.put.id));
    const final = ops.filter((o) => !(o.store === 'gaps' && o.del && reput.has(o.del)));
    // changes vs the previous slip show in the slip's own check, not as notifications (few notifications)
    await App.saveOps(final, 'שמירת תלוש', toastText || 'התלוש נשמר בארכיון');
  }
  /** Last month's findings that this payslip may pay (saved with "remind me to check on the next payslip"). */
  function carryHtml(slip) {
    const gs = S.gaps.filter((g) => g.status === 'maybe' && g.checkIn === slip.period && g.payslipId !== slip.id);
    if (!gs.length) return '';
    return `<div class="card gc gc-carry"><div class="gc-fh"><span class="fi">${icon('bell', 's')}</span><b>מהתלוש הקודם: לבדוק כאן</b></div>
      ${gs.map((g) => `<div class="gc-r"><b class="gc-rt">${esc(g.title)} · ${U.fmtMonth(g.period)}</b><div class="gc-t">ההפרש הוסבר אז במשמרות שאולי ישולמו בתלוש הזה (${money(g.amount)}). אם הן מופיעות בו, הכול בסדר.</div>
        <div class="gc-fix"><button class="btn text sm" data-act="gap-set" data-id="${esc(g.id)}" data-s="resolved">${icon('check', 's')} שולם בתלוש הזה</button><button class="btn text sm" data-act="gap-set" data-id="${esc(g.id)}" data-s="open">${icon('xc', 's')} לא שולם</button></div></div>`).join('')}</div>`;
  }
  App.sheetsApi.payslip = (id) => {
    const p = S.payslips.find((x) => x.id === id);
    if (p) analysisSheet(Object.assign({}, p, { isNew: false }));
  };
  App.actions['payslip-open'] = (el) => App.sheetsApi.payslip(el.dataset.id);
  App.actions['gap-set'] = async (el) => {
    const g = S.gaps.find((x) => x.id === el.dataset.id);
    if (!g) return;
    await App.saveOps([{ store: 'gaps', put: Object.assign({}, g, { status: el.dataset.s }) }], 'עדכון פער', el.dataset.s === 'resolved' ? 'סומן כהוחזר' : 'עודכן');
    // the money came back thanks to the check: the best moment there is — celebrated, and shareable
    if (el.dataset.s === 'resolved' && g.amount > 0) {
      if (root.Fx) root.Fx.celebrate('money');
      const back = S.gaps.filter((x) => x.status === 'resolved').reduce((sum, x) => sum + x.amount, 0) + (g.status === 'resolved' ? 0 : g.amount);
      UI.openSheet({ title: 'הכסף חזר אליך! 🎉', body: `${App.mascotSays ? App.mascotSays('party', `קיבלת בחזרה ${U.money(g.amount, 0)} שהגיעו לך. כל הכבוד שבדקת!`, { size: 72 }) : ''}
        ${back > g.amount ? `<div class="small muted" style="margin:6px 0 12px">בסך הכול שעתי החזירה לך ${U.money(back, 0)}.</div>` : ''}
        <button class="btn big block" data-act="found-share" data-amount="${Math.round(g.amount)}" data-k="back">${icon('share')} לשתף ולעזור לחברים לבדוק</button>
        ${root.Plus && root.Plus.tipCard ? root.Plus.tipCard() : ''}`,
        // a thank-you tip, once, when tips can be given here (plus.js)
        onMount: (el) => el.addEventListener('click', (e) => { if (root.Plus && root.Plus.tipClick) root.Plus.tipClick(e); }) });
    }
  };
  /** A picture to share: "Shaati found me ₪X" (the slip's check) or "I got back ₪X" — no employer, no name. */
  App.actions['found-share'] = async (el) => {
    const amount = +el.dataset.amount || 0, back = el.dataset.k === 'back';
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const W = 1080, H = 1350;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, back ? '#047857' : '#5b21b6'); grd.addColorStop(0.55, back ? '#059669' : '#7c3aed'); grd.addColorStop(1, back ? '#0d9488' : '#db2777');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.beginPath(); g.arc(W * 0.85, H * 0.12, 260, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(W * 0.1, H * 0.9, 320, 0, Math.PI * 2); g.fill();
      g.direction = U.RTL ? 'rtl' : 'ltr'; g.textAlign = 'center'; g.fillStyle = '#fff';
      const F = (w, px) => `${w} ${px}px Fredoka, Rubik, "Segoe UI", Arial, sans-serif`;
      g.font = '150px "Segoe UI Emoji", "Noto Color Emoji", sans-serif'; g.fillText(back ? '🎉' : '🔍', W / 2, 300);
      g.font = F(600, 64); g.fillText(back ? 'קיבלתי בחזרה' : 'שעתי מצאה לי', W / 2, 460);
      g.font = F(700, 210); g.fillText(U.money(amount, 0), W / 2, 700);
      g.font = F(600, 58); g.globalAlpha = 0.92; g.fillText(back ? 'שהגיעו לי מהעבודה' : 'שכדאי לבדוק בתלוש', W / 2, 800); g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,.16)';
      const rw = 900, rh = 120, rx = (W - rw) / 2, ry = 930;
      g.beginPath(); if (g.roundRect) g.roundRect(rx, ry, rw, rh, 60); else g.rect(rx, ry, rw, rh); g.fill();
      g.fillStyle = '#fff'; g.font = F(600, 50); g.fillText('גם לכם מגיע לבדוק 👇', W / 2, ry + 78);
      g.font = F(700, 64); g.fillText('shaati.web.app', W / 2, 1170);
      g.font = F(600, 44); g.globalAlpha = 0.8; g.fillText('Shaati · שעתי', W / 2, H - 70); g.globalAlpha = 1;
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      if (!blob) throw new Error('no image');
      await UI.shareFile(back ? 'shaati-back.png' : 'shaati-found.png', blob, back ? 'קיבלתי בחזרה כסף שהגיע לי' : 'שעתי מצאה לי פער אפשרי בתלוש', `${back ? 'קיבלתי בחזרה' : 'שעתי מצאה לי'} ${U.money(amount, 0)} ${back ? 'שהגיעו לי מהעבודה' : 'שכדאי לבדוק בתלוש'}. גם לכם כדאי לבדוק: https://shaati.web.app`);
    } catch (e) { console.warn('found image', e); UI.toast('לא הצלחנו ליצור תמונה'); }
  };

  /* ---------------- payslips tab (in reports) ---------------- */
  App.payslipsTab = function () {
    const slips = S.payslips.slice().sort((a, b) => b.period.localeCompare(a.period));
    const gaps = S.gaps.filter((g) => g.status !== 'resolved').sort((a, b) => b.period.localeCompare(a.period));
    const trend = slips.slice(0, 12).reverse();
    return `<button class="btn big" data-act="payslip-new" style="margin-bottom:12px">${icon('upload')} העלה תלוש לניתוח</button>
      <button class="btn tonal block" data-act="tax-refund" style="margin-bottom:12px">${icon('calc', 's')} בדיקת החזר מס (עד 6 שנים אחורה)</button>
      ${gaps.length ? `<div class="section-title">${icon('alert', 's')} פערים פתוחים<span class="spacer"></span><span class="small">${U.money(gaps.filter((g) => g.status === 'open').reduce((s, g) => s + g.amount, 0), 0)}</span></div>
        <div class="list">${gaps.map((g) => `<div class="item" style="cursor:default"><span class="lead" style="background:${g.status === 'maybe' ? 'var(--warn-bg)' : 'var(--bad-bg)'};color:${g.status === 'maybe' ? 'var(--warn)' : 'var(--bad)'}">${icon(g.status === 'maybe' ? 'refresh' : 'xc')}</span>
          <span class="body"><span class="t">${esc(g.title)} · ${U.fmtMonth(g.period)}</span><span class="s">${g.status === 'maybe' ? esc(g.note || 'ייתכן שהוחזר') : 'עוד לא הוחזר'}</span></span>
          <span class="trail"><span class="a">${money(g.amount, 0)}</span><br><button class="btn text sm" data-act="gap-set" data-id="${esc(g.id)}" data-s="resolved">הוחזר ✓</button></span></div>`).join('')}</div>
        <button class="btn tonal block" data-act="claim-report" style="margin-top:8px">${icon('file', 's')} דוח ומכתב לבירור מול המעסיק</button>` : ''}
      ${trend.length >= 2 ? `<div class="section-title">${icon('chart', 's')} מגמות</div><div class="card">${Charts.stacked(trend.map((p) => U.MONTHS_SHORT[+p.period.slice(5) - 1]), [
        { name: 'נטו', color: '#1baf7a', values: trend.map((p) => (p.fields.net ? +p.fields.net.value : 0)) },
        { name: 'ניכויים', color: '#e34948', values: trend.map((p) => (p.fields.gross && p.fields.net ? Math.max(0, p.fields.gross.value - p.fields.net.value) : 0)) },
      ], { label: 'נטו וניכויים לפי חודש', fmt: (v) => U.money(v, 0) })}
        <div class="tiny muted">גובה העמודה = ברוטו. ${trend.length} תלושים אחרונים.</div></div>` : ''}
      <div class="section-title">${icon('receipt', 's')} ארכיון תלושים</div>
      ${slips.length ? `<div class="list">${slips.map((p) => { const c = (p.summary && p.summary.counts) || {}; return `<button class="item" data-act="payslip-open" data-id="${esc(p.id)}"><span class="lead" style="background:var(--surface-3)">${icon('receipt')}</span>
        <span class="body"><span class="t">${p.period ? U.fmtMonth(p.period) : '—'}</span><span class="s">${c.bad ? `<span class="ps-c bad">${icon('xc', 's')} ${+c.bad}</span> ` : ''}${c.warn ? `<span class="ps-c warn">${icon('alert', 's')} ${+c.warn}</span> ` : ''}${c.ok ? `<span class="ps-c ok">${icon('okc', 's')} ${+c.ok}</span>` : ''}${p.source === 'ai' ? ' · AI' : ''}</span></span>
        <span class="trail"><span class="a">${p.fields.net ? money(p.fields.net.value, 0) : '—'}</span><br><span class="tiny muted">נטו</span></span></button>`; }).join('')}</div>`
        : UI.emptyState('receipt', 'עוד אין תלושים', 'העלה תלוש כדי לבדוק שקיבלת את כל מה שמגיע לך: שעות, שבתות, נסיעות, פנסיה ועוד.')}
      ${DISCLAIMER}`;
  };

  /* ---------------- optional AI (Claude) ---------------- */
  App.aiAnalyze = function (text, onResult) {
    const key = S.settings.ai.apiKey;
    if (!key) {
      UI.confirm('ניתוח חכם דורש מפתח API', 'אפשר להזין מפתח של Claude בהגדרות › עוזר AI ואודות › מפתח AI. בלי מפתח, הניתוח המקומי ממשיך לעבוד כרגיל.', 'להגדרות').then((ok) => { if (ok) { UI.closeAll(); setTimeout(() => App.sheetsApi.settingsSection('ai'), 400); } });
      return;
    }
    const red = Payslip.redact(text);
    UI.openSheet({
      title: 'לפני שליחה ל-\u2060Claude', full: true,
      body: `<div class="banner warn">${icon('shield')}<div>זה <b>בדיוק</b> הטקסט שיישלח (${red.count} פרטים אישיים הוסתרו אוטומטית). בדוק וערוך. אפשר למחוק גם שם או כל פרט אחר. הקובץ עצמו לא נשלח.</div></div>
        <textarea class="input" id="ai-text" rows="16" style="font-family:ui-monospace,monospace;font-size:.8rem">${esc(red.text)}</textarea>
        <div class="small muted" style="margin-top:8px">יישלח אל Anthropic (מודל ${esc(S.settings.ai.model)}) עם המפתח שלך. השימוש מחויב בחשבון ה-\u2060API שלך.</div>`,
      foot: `<button class="btn tonal" data-cancel>ביטול</button><button class="btn" data-send>${icon('send')} אני מאשר, שלח</button>`,
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
            UI.toast(`Claude זיהה ${Object.keys(res.fields).length} שדות. בדוק לפני ניתוח`);
          } catch (err) {
            console.error(err);
            btn.disabled = false; btn.textContent = 'נסה שוב';
            UI.dialog({ title: 'הניתוח החכם נכשל', text: root.U.ours(err) ? err.message : 'לא הצלחנו לקרוא את התשובה של Claude. נסו שוב, או הזינו את התלוש ידנית.', buttons: [{ label: 'סגור', value: true }] });
          }
        };
      },
    });
  };
  const callClaude = (text) => claudeJson(Payslip.aiPrompt(), text, Payslip.aiSchema());
  /** One request to Claude with the person's own key, answered as JSON in the schema given (content: text, or
   * blocks such as an image). Used by the payslip check and the schedule reader. */
  App.claudeJson = (system, content, schema) => claudeJson(system, content, schema);
  async function claudeJson(system, content, schema) {
    if (!navigator.onLine) throw root.U.oops('אין חיבור לאינטרנט');
    if (!S.settings.ai.apiKey) throw root.U.oops('צריך מפתח API של Claude (הגדרות › עוזר AI ואודות › מפתח AI)');
    const mod = await import(/* webpackIgnore: true */ LIBS.anthropic);
    const Anthropic = mod.default || mod.Anthropic;
    const client = new Anthropic({ apiKey: S.settings.ai.apiKey, dangerouslyAllowBrowser: true });
    const model = S.settings.ai.model || 'claude-opus-5-5';
    const params = {
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    };
    let res;
    try {
      if (model.startsWith('claude-haiku')) res = await client.messages.create(params); // no server-side fallback for Haiku
      else res = await client.beta.messages.create(Object.assign({ betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, params));
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw root.U.oops('מפתח ה-\u2060API לא תקין (401). בדוק אותו בהגדרות.');
      if (err instanceof Anthropic.PermissionDeniedError) throw root.U.oops('למפתח אין הרשאה למודל הזה (403).');
      if (err instanceof Anthropic.NotFoundError) throw root.U.oops('המודל לא נמצא (404). בחר מודל אחר בהגדרות.');
      if (err instanceof Anthropic.RateLimitError) throw root.U.oops('יותר מדי בקשות (429). נסה שוב בעוד דקה.');
      if (err instanceof Anthropic.APIConnectionError) throw root.U.oops('בעיית תקשורת עם השרת. בדוק את החיבור.');
      if (err instanceof Anthropic.APIError) throw root.U.oops('השירות של Claude לא הצליח לענות כרגע. נסו שוב בעוד רגע, או הזינו את התלוש ידנית.');
      throw err;
    }
    if (res.stop_reason === 'refusal') throw root.U.oops('הבקשה נדחתה על ידי המודל' + (res.stop_details && res.stop_details.explanation ? ': ' + res.stop_details.explanation : '.'));
    if (res.stop_reason === 'max_tokens') throw root.U.oops('התשובה נקטעה. נסה לקצר את הטקסט.');
    const block = res.content.find((b) => b.type === 'text');
    if (!block) throw root.U.oops('לא התקבלה תשובה');
    return JSON.parse(block.text);
  }
})(typeof window !== 'undefined' ? window : globalThis);
