/* ============================================================
 * docread.js — reading a photo of a document (an hours report, a work schedule) on the phone.
 *
 * A photo is first made easy to read: turned the right way up, brought to a size the reader likes, its light
 * evened out (a shadow or a dim corner becomes the same white paper as the rest) and a dark screenshot turned
 * into dark-on-light. Then two readings of the same picture: the Hebrew model for the words (the column
 * names, the days), and one that only knows digits and : / . - for the numbers, which it reads much better
 * (the Hebrew model turned "08:00" next to Hebrew into letters). Both keep where each word is on the page,
 * so the report is read as a table (core/timesheet.js parseWords), not as a stream of text.
 * ============================================================ */
(function (root) {
  'use strict';
  const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const DocRead = {};

  /* ---------------- the picture ---------------- */
  /** An image file → a canvas of grey, evened-out light, dark text on light paper. */
  DocRead.prep = async function (blob, opts) {
    opts = opts || {};
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const long = Math.max(bmp.width, bmp.height);
    // the reader does best with letters ~25-40px tall: big phone photos come down, small screenshots go up
    const s = long > 2600 ? 2600 / long : long < 1500 ? 1500 / long : 1;
    const W = Math.round(bmp.width * s), H = Math.round(bmp.height * s);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, W, H);
    if (bmp.close) bmp.close();
    const img = g.getImageData(0, 0, W, H), px = img.data, n = W * H;
    const gray = new Uint8ClampedArray(n);
    let sum = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) { const v = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8; gray[i] = v; sum += v; }
    // a dark screen (light letters): the other way round
    if (sum / n < 110) for (let i = 0; i < n; i++) gray[i] = 255 - gray[i];
    // the paper's own brightness, block by block (the brightest of each block), smoothed over the page:
    // every pixel divided by it, so shadow and glare go and the paper is white everywhere
    const B = Math.max(24, Math.round(Math.max(W, H) / 48));
    const bw = Math.ceil(W / B), bh = Math.ceil(H / B);
    const bg = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      // the 95th brightest, not the brightest (a speck of noise or glare is not the paper)
      const hist = new Uint32Array(256); let cnt = 0;
      for (let y = by * B; y < Math.min(H, by * B + B); y += 2) for (let x = bx * B; x < Math.min(W, bx * B + B); x += 2) { hist[gray[y * W + x]]++; cnt++; }
      let k = 255, acc = 0; const want = cnt * 0.05;
      while (k > 0 && acc + hist[k] < want) { acc += hist[k]; k--; }
      bg[by * bw + bx] = Math.max(k, 40);
    }
    // a block that is all ink (inside a dark header cell) takes its neighbours' paper
    const bg2 = bg.slice();
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let m = bg[by * bw + bx];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = by + dy, xx = bx + dx; if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) m = Math.max(m, bg[yy * bw + xx] * 0.92); }
      bg2[by * bw + bx] = m;
    }
    const norm = new Uint8ClampedArray(n);
    for (let y = 0; y < H; y++) {
      const fy = Math.min(bh - 1.001, Math.max(0, y / B - 0.5)), y0 = Math.floor(fy), ty = fy - y0;
      for (let x = 0; x < W; x++) {
        const fx = Math.min(bw - 1.001, Math.max(0, x / B - 0.5)), x0 = Math.floor(fx), tx = fx - x0;
        const a = bg2[y0 * bw + x0], b = bg2[y0 * bw + Math.min(bw - 1, x0 + 1)], c2 = bg2[Math.min(bh - 1, y0 + 1) * bw + x0], d = bg2[Math.min(bh - 1, y0 + 1) * bw + Math.min(bw - 1, x0 + 1)];
        const paper = (a * (1 - tx) + b * tx) * (1 - ty) + (c2 * (1 - tx) + d * tx) * ty;
        // (no cut-off to white: the dots of a ":" and a thin "/" are faint after a blurry photo, and the
        // reader needs them)
        norm[y * W + x] = gray[y * W + x] * 255 / paper;
      }
    }
    if (opts.bin) for (let i = 0; i < n; i++) norm[i] = norm[i] < opts.bin ? 0 : 255;
    if (opts.lines) unline(norm, W, H);
    const out = g.createImageData(W, H), o = out.data;
    for (let i = 0, j = 0; i < n; i++, j += 4) { o[j] = o[j + 1] = o[j + 2] = norm[i]; o[j + 3] = 255; }
    g.putImageData(out, 0, 0);
    return c;
  };
  /**
   * A table's lines out (to white): the reader skips numbers that touch a cell's border. A line is a run of
   * ink much longer than any letter's stroke; a line in a tilted photo climbs, so a run may step one pixel up
   * or down. Done in both directions.
   */
  function unline(px, W, H) {
    const INK = 165;
    const ink = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) ink[i] = px[i] < INK ? 1 : 0;
    const kill = new Uint8Array(W * H);
    const LH = Math.max(70, Math.round(W / 22)), LV = Math.max(60, Math.round(H / 30));
    // across: a pixel is on the run when it or the one above/below is ink
    for (let y = 1; y < H - 1; y++) {
      let x = 0;
      while (x < W) {
        const on = (xx) => ink[y * W + xx] || ink[(y - 1) * W + xx] || ink[(y + 1) * W + xx];
        if (!on(x)) { x++; continue; }
        let e = x; while (e < W && on(e)) e++;
        if (e - x >= LH) for (let k = x; k < e; k++) if (ink[y * W + k]) kill[y * W + k] = 1;
        x = e;
      }
    }
    for (let x = 1; x < W - 1; x++) {
      let y = 0;
      while (y < H) {
        const on = (yy) => ink[yy * W + x] || ink[yy * W + x - 1] || ink[yy * W + x + 1];
        if (!on(y)) { y++; continue; }
        let e = y; while (e < H && on(e)) e++;
        if (e - y >= LV) for (let k = y; k < e; k++) if (ink[k * W + x]) kill[k * W + x] = 1;
        y = e;
      }
    }
    // the line's soft grey edge goes with it
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (kill[i]) { px[i] = 255; continue; }
      if (px[i] < 235 && (kill[i - 1] || kill[i + 1] || kill[i - W] || kill[i + W]) && !ink[i]) px[i] = 255;
    }
  }

  /* ---------------- reading ---------------- */
  function load() {
    if (root.Tesseract) return Promise.resolve();
    if (root.App && root.App.loadLib) return root.App.loadLib(TESSERACT);
    return Promise.reject(root.U && root.U.oops ? root.U.oops('לא ניתן לטעון רכיב') : new Error('no reader'));
  }
  async function pass(image, lang, params, progress, label) {
    const worker = await root.Tesseract.createWorker(lang, 1, {
      logger: (m) => { if (m.status === 'recognizing text' && progress) progress(`${label}… ${Math.round(m.progress * 100)}%`); },
    });
    try {
      if (params) await worker.setParameters(params);
      const { data } = await worker.recognize(image);
      let ws = data.words;
      if (!ws && data.blocks) ws = data.blocks.flatMap((b) => (b.paragraphs || []).flatMap((p) => (p.lines || []).flatMap((l) => l.words || [])));
      return (ws || []).filter((w) => w && w.text && w.text.trim())
        .map((w) => ({ text: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, conf: w.confidence }));
    } finally { await worker.terminate(); }
  }
  const NUMERIC = /^[\d:./\-–]+$/;
  const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    return ix * iy / Math.max(1, Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)));
  };
  /**
   * The words of a picture with their boxes: the Hebrew reading for words, the digits reading for numbers.
   * opts.prep = false reads the picture as it is.
   */
  DocRead.words = async function (blob, progress, opts) {
    opts = opts || {};
    progress = progress || (() => {});
    await load();
    progress('מכין את התמונה…');
    const image = opts.prep === false ? blob : await DocRead.prep(blob, opts);
    // the second reading sees the picture in pure black and white: what one reading misses (a faint date,
    // a time by a cell's border) the other often gets
    const image2 = opts.prep === false || opts.bin2 === 0 ? image : await DocRead.prep(blob, Object.assign({}, opts, { bin: opts.bin2 || 170 }));
    progress('טוען מנוע זיהוי עברית (פעם ראשונה ~10MB)…');
    const he = await pass(image, 'heb+eng', { tessedit_pageseg_mode: opts.psm || '11', preserve_interword_spaces: '1' }, progress, 'קורא את המילים');
    let dg = [];
    try { dg = await pass(image2, opts.digitsLang || 'eng', Object.assign({ tessedit_pageseg_mode: opts.psmDigits || '11' }, opts.whitelist ? { tessedit_char_whitelist: '0123456789:./-' } : {}), progress, 'קורא את המספרים'); } catch (e) { /* the words alone */ }
    // the words: Hebrew/English words from the first reading; numbers from whichever reading read them
    // better (a whole time or date over a broken one, then the surer one)
    const isWord = (w) => /[A-Za-zא-ת]/.test(w.text) && !/^[\dOolISB:./-]+$/.test(w.text);
    const words = he.filter(isWord);
    const shape = (t) => (/^\d{1,2}:\d{2}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|^\d{1,2}\/\d{1,2}$|^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(t) ? 3 : /^\d+\.\d+$/.test(t) ? 2 : 1);
    const sh = (w) => shape(w.text.replace(/^[-.:]+|[-.:]+$/g, ''));
    const better = (a, b) => sh(a) - sh(b) || a.conf - b.conf;
    const nums = [];
    for (const w of dg.concat(he)) {
      if (isWord(w) || !/\d/.test(w.text) || !NUMERIC.test(w.text.replace(/[|[\]()'"`,;]/g, '')) || !(w.conf > 15 || sh(w) >= 2)) continue; // a whole time read unsurely is still a time
      const k = nums.findIndex((d) => overlap(d, w) > 0.3);
      if (k < 0) nums.push(w);
      else if (better(w, nums[k]) > 0) nums[k] = w;
    }
    // a digits-reading "number" on top of a Hebrew word is the Hebrew word misread: not a number
    const out = words.concat(nums.filter((d) => !words.some((w) => overlap(w, d) > 0.5 && w.conf > 60)));
    return { words: out, he, dg, canvas: image };
  };

  /** A photo of an hours report → shifts (core/timesheet.js parseWords). */
  DocRead.readTimesheet = async function (blob, progress, opts) {
    opts = opts || {};
    const got = await DocRead.words(blob, progress, opts);
    progress && progress('מסדר את הטבלה…');
    const res = root.Timesheet.parseWords(got.words, { today: opts.today, debug: opts.debug });
    return Object.assign(res, { words: got.words }, opts.debug ? { he: got.he, dg: got.dg } : {});
  };

  root.DocRead = DocRead;
})(typeof window !== 'undefined' ? window : globalThis);
