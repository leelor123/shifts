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
  // the line the screens show while the engine loads (unchanged; DocRead.words passes codes beside it)
  const LOADING = 'טוען מנוע זיהוי עברית (פעם ראשונה ~10MB)…';

  /* ---------------- the picture ---------------- */
  /** An image file → a canvas of grey, evened-out light, dark text on light paper. */
  DocRead.prep = async function (blob, opts) {
    opts = opts || {};
    const bmp = await openPicture(blob);
    const long = Math.max(bmp.width, bmp.height);
    // the reader does best with letters ~25-40px tall: big phone photos come down, small screenshots go up
    // (opts.size: a smaller picture, only to see which way up the page is)
    const top = opts.size || 2600, low = Math.min(1500, top);
    let s = long > top ? top / long : long < low ? low / long : 1;
    // a long scroll screenshot (an app's list captured down the page) keeps its width: its letters would be
    // too small to read at the size of a page. DocRead.words reads it in slices
    const tall = !opts.size && bmp.height > 2600 && (bmp.width * 2600) / bmp.height < 1000;
    if (tall) s = bmp.width > 1500 ? 1500 / bmp.width : bmp.width < 1000 ? 1000 / bmp.width : 1;
    // a page photographed on its side or upside down (opts.turn: 90, 180, 270) is turned the right way up
    const q = (((opts.turn || 0) % 360) + 360) % 360, side = q === 90 || q === 270;
    const dw = Math.round(bmp.width * s), dh = Math.round(bmp.height * s);
    const W = side ? dh : dw, H = side ? dw : dh;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    if (q) { g.translate(W / 2, H / 2); g.rotate((q * Math.PI) / 180); g.drawImage(bmp, -dw / 2, -dh / 2, dw, dh); g.setTransform(1, 0, 0, 1, 0, 0); }
    else g.drawImage(bmp, 0, 0, W, H);
    if (bmp.close) bmp.close();
    const img = g.getImageData(0, 0, W, H), px = img.data, n = W * H;
    const gray = grayOf(px);
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
    // with the table's lines taken out, the black and white copy is made as it always was: cut to black and white
    // first, then its lines out (the lines come out cleaner from black and white than from grey)
    let bwc = null;
    if (opts.lines && !opts.bin && opts.bin2 !== 0) {
      const nb = new Uint8ClampedArray(n), cut = opts.bin2 || 170;
      for (let i = 0; i < n; i++) nb[i] = norm[i] < cut ? 0 : 255;
      unline(nb, W, H);
      bwc = document.createElement('canvas'); bwc.width = W; bwc.height = H;
      const gb = bwc.getContext('2d', { willReadFrequently: true }), ib = gb.createImageData(W, H), pb = ib.data;
      for (let i = 0, j = 0; i < n; i++, j += 4) { pb[j] = pb[j + 1] = pb[j + 2] = nb[i]; pb[j + 3] = 255; }
      gb.putImageData(ib, 0, 0);
    }
    if (opts.lines) unline(norm, W, H);
    // (written into the picture's own pixels: a second copy of a big photo's pixels is memory a phone may not have)
    for (let i = 0, j = 0; i < n; i++, j += 4) { px[j] = px[j + 1] = px[j + 2] = norm[i]; px[j + 3] = 255; }
    g.putImageData(img, 0, 0);
    // a page photographed at an angle: its lines straightened (the reader misses words on a slant, and a
    // table's rows run into each other)
    const deg = opts.straight === false ? 0 : skewOf(norm, W, H);
    c.skew = deg;
    const res = deg ? turned(c, deg) : c;
    if (bwc) res.bw = deg ? turned(bwc, deg) : bwc;
    res.tall = tall;
    return res;
  };
  /**
   * A file → its picture (EXIF orientation applied). A file that is not one throws an error with a code for the
   * screens to explain (no text here: the screens own their words):
   *   docread/empty (0 bytes), docread/heic (an iPhone HEIC the browser cannot open), docread/unreadable (any other
   *   picture that does not open), docread/not-on-phone (a cloud file whose bytes do not come: NotReadableError).
   * A photo of more than 20 MP (a 48 or 50 MP phone camera) is decoded straight to the size it is read at, when
   * the browser can: decoding it whole takes ~200 MB, which a phone may not have.
   */
  async function openPicture(blob) {
    if (blob && typeof blob.size === 'number' && !blob.width && blob.size === 0) throw codeError('docread/empty');
    if (!(blob instanceof Blob)) return createImageBitmap(blob); // a canvas or a bitmap: already a picture
    let head;
    try { head = new Uint8Array(await blob.slice(0, 65536).arrayBuffer()); } catch (e) { throw codeError(e && e.name === 'NotReadableError' ? 'docread/not-on-phone' : 'docread/unreadable', e); }
    const brand = String.fromCharCode(...head.slice(4, 12));
    const heic = /^ftyp(heic|heix|hevc|heim|heis|mif1|msf1)/.test(brand);
    const dim = sizeOf(head);
    try {
      if (dim && dim.w * dim.h > 20e6) {
        const k = 2600 / Math.max(dim.w, dim.h);
        return await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: Math.round(dim.w * k), resizeHeight: Math.round(dim.h * k), resizeQuality: 'high' });
      }
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch (e) {
      throw codeError(heic ? 'docread/heic' : e && e.name === 'NotReadableError' ? 'docread/not-on-phone' : 'docread/unreadable', e);
    }
  }
  function codeError(code, cause) { return Object.assign(new Error(code), { name: 'DocReadError', code, cause }); }
  /** A JPEG's or PNG's size from its first bytes, as shown (EXIF turns of 90° swap it); null when not found. */
  function sizeOf(b) {
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      const v = new DataView(b.buffer); return b.length > 24 ? { w: v.getUint32(16), h: v.getUint32(20) } : null;
    }
    if (b[0] !== 0xff || b[1] !== 0xd8) return null;
    let i = 2, turn = 1, w = 0, h = 0;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (mk === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78) { // Exif: the orientation tag (0x0112)
        const t = i + 10, le = b[t] === 0x49;
        const u16 = (o) => (le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1]);
        const ifd = le ? b[t + 4] | (b[t + 5] << 8) | (b[t + 6] << 16) | (b[t + 7] << 24) : (b[t + 4] << 24) | (b[t + 5] << 16) | (b[t + 6] << 8) | b[t + 7];
        const n = t + ifd + 2 < b.length ? u16(ifd) : 0;
        for (let k = 0; k < n && t + ifd + 2 + k * 12 + 10 < b.length; k++) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) turn = u16(e + 8); }
      }
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) { h = (b[i + 5] << 8) | b[i + 6]; w = (b[i + 7] << 8) | b[i + 8]; break; }
      i += 2 + len;
    }
    if (!w || !h) return null;
    return turn >= 5 && turn <= 8 ? { w: h, h: w } : { w, h };
  }
  /** RGBA pixels → grey, dark letters on light (a dark screen turned the other way round). */
  function grayOf(px) {
    const n = px.length >> 2;
    // a picture with see-through pixels (a PNG with no background) read them as black: dark letters on it
    // became black on black. It is laid on a background opposite to its letters (the mean of its solid
    // pixels: dark letters on white, light letters on black, which is then turned like a dark screen)
    let clear = 0, sa = 0, sv = 0;
    for (let j = 3; j < px.length; j += 16) { const a = px[j]; if (a < 250) clear++; sa += a; sv += a * ((px[j - 3] * 77 + px[j - 2] * 150 + px[j - 1] * 29) >> 8); }
    const bgA = clear > Math.ceil(n / 4) * 0.01 ? (sa && sv / sa > 128 ? 0 : 255) : -1;
    const gray = new Uint8ClampedArray(n);
    let sum = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      let v = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
      if (bgA >= 0 && px[j + 3] < 255) v = (v * px[j + 3] + bgA * (255 - px[j + 3])) / 255;
      gray[i] = v; sum += v;
    }
    // a dark screen (light letters): the other way round
    if (sum / n < 110) for (let i = 0; i < n; i++) gray[i] = 255 - gray[i];
    return gray;
  }
  /**
   * The page's angle, in degrees (0 when it is straight or not clear): the angle at which the page's lines of ink
   * line up best, that is the profile of the ink across the page is sharpest. Up to 20° either way; only when it
   * is clearly sharper than the page as it is, and more than 1° (the table reader takes small angles out itself).
   */
  function skewOf(px, W, H) {
    const step = Math.max(1, Math.round(Math.max(W, H) / 800));
    const xs = [], ys = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (px[y * W + x] < 128) { xs.push(x); ys.push(y); }
    if (xs.length < 300) return 0;
    const off = W + 2, bins = new Float64Array(Math.ceil((W + H + 4) / step) + 2);
    const sharp = (deg, from, to) => {
      const t = (deg * Math.PI) / 180, sn = Math.sin(t), cs = Math.cos(t);
      bins.fill(0);
      for (let i = from; i < to; i++) bins[Math.floor((ys[i] * cs - xs[i] * sn + off) / step)]++;
      let s = 0;
      for (let i = 0; i < bins.length; i++) s += bins[i] * bins[i];
      return s;
    };
    const angle = (from, to) => {
      let best = 0, bs = sharp(0, from, to);
      const flat = bs;
      for (let d = -20; d <= 20; d += 1) { const v = sharp(d, from, to); if (v > bs) { bs = v; best = d; } }
      for (let d = best - 0.8; d <= best + 0.81; d += 0.2) { const v = sharp(d, from, to); if (v > bs) { bs = v; best = d; } }
      return { best, gain: bs / Math.max(1, flat) };
    };
    const all = angle(0, xs.length);
    // a few degrees the table readers take out themselves (turning the picture for them changed what was read more
    // than it helped)
    // (from 4.5°: on the hours, schedule and payslip benches, turning a 3-4° page lost words, 5° and more gained)
    if (Math.abs(all.best) < 4.5 || all.gain < 1.15) return 0;
    // a page seen from the side has lines that fan out: its top and its bottom lie at different angles, and no
    // one turn straightens it (the table reader follows such lines). A page only turned has one angle throughout
    const half = ys.findIndex((y) => y >= H / 2);
    if (half < 150 || xs.length - half < 150) return 0;
    const a = angle(0, half).best, b = angle(half, xs.length).best;
    // (both halves steeper than the table reader can follow, about 6°: turned by their mean, the rest is the
    // reader's)
    if (Math.abs(a - b) > 2.5) return Math.sign(a) === Math.sign(b) && Math.min(Math.abs(a), Math.abs(b)) > 6 ? Math.round(((a + b) / 2) * 10) / 10 : 0;
    return Math.round(all.best * 10) / 10;
  }
  /** A canvas turned by -deg (its lines level), on white, the corners kept. */
  function turned(src, deg) {
    const t = (-deg * Math.PI) / 180, W = src.width, H = src.height;
    const W2 = Math.round(Math.abs(W * Math.cos(t)) + Math.abs(H * Math.sin(t))), H2 = Math.round(Math.abs(W * Math.sin(t)) + Math.abs(H * Math.cos(t)));
    const c = document.createElement('canvas');
    c.width = W2; c.height = H2;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#fff'; g.fillRect(0, 0, W2, H2);
    g.imageSmoothingQuality = 'high';
    g.translate(W2 / 2, H2 / 2); g.rotate(t); g.drawImage(src, -W / 2, -H / 2);
    c.skew = deg;
    src.width = src.height = 0; // the first canvas's memory back at once (a phone has little)
    return c;
  }
  /** The same picture in pure black and white (a second reading sees what the first misses). */
  function binary(src, cut) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height), p = img.data;
    for (let j = 0; j < p.length; j += 4) p[j] = p[j + 1] = p[j + 2] = p[j] < cut ? 0 : 255;
    g.putImageData(img, 0, 0);
    return c;
  }
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
  // opts.signal (an AbortController's): the person left the screen, the reading stops (its worker ends)
  const stopped = () => Object.assign(new Error('stopped'), { name: 'AbortError' });
  async function pass(image, lang, params, progress, label, signal) {
    if (signal && signal.aborted) throw stopped();
    const worker = await root.Tesseract.createWorker(lang, 1, {
      // (the engine's own stages go to the screen as codes beside the text it shows now: docread/loading-core,
      // docread/loading-language (pct, cached), docread/initializing, docread/reading (pct))
      logger: (m) => {
        if (!progress) return;
        const pct = Math.round((m.progress || 0) * 100);
        if (m.status === 'recognizing text') progress(`${label}… ${pct}%`, { code: 'docread/reading', lang, pct });
        else if (/loading language traineddata/.test(m.status)) progress(LOADING, { code: 'docread/loading-language', lang, pct, cached: /cache/.test(m.status) });
        else if (/loading tesseract core/.test(m.status)) progress(LOADING, { code: 'docread/loading-core', pct });
        else if (/initializ/.test(m.status)) progress(LOADING, { code: 'docread/initializing', lang, pct });
      },
    });
    let onStop = null;
    try {
      const stop = new Promise((_, no) => { onStop = () => no(stopped()); if (signal) signal.addEventListener('abort', onStop, { once: true }); });
      if (params) await Promise.race([worker.setParameters(params), stop]);
      const { data } = await Promise.race([worker.recognize(image), stop]);
      let ws = data.words;
      if (!ws && data.blocks) ws = data.blocks.flatMap((b) => (b.paragraphs || []).flatMap((p) => (p.lines || []).flatMap((l) => l.words || [])));
      return (ws || []).filter((w) => w && w.text && w.text.trim())
        .map((w) => ({ text: w.text.trim(), x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, conf: w.confidence }));
    } finally { if (signal && onStop) signal.removeEventListener('abort', onStop); await worker.terminate(); }
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
  const shape = (t) => (/^\d{1,2}:\d{2}$|^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|^\d{1,2}\/\d{1,2}$|^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(t) ? 3 : /^\d+\.\d+$/.test(t) ? 2 : 1);
  const sh = (w) => shape(w.text.replace(/^[-.:]+|[-.:]+$/g, ''));
  // how many whole times and dates a reading found: a page on its side or upside down gives almost none
  // (valid ones: a page upside down reads 08:00 as "00:80", a time in shape only)
  const valid = (t) => { const m = /^(\d{1,2})[:./-](\d{1,2})(?:[./-](\d{2,4}))?/.exec(t); return m && (t.includes(':') ? +m[1] <= 24 && +m[2] <= 59 && m[2].length === 2 : +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12); };
  const wholes = (ws) => ws.filter((w) => sh(w) === 3 && valid(w.text.replace(/^[-.:]+|[-.:]+$/g, ''))).length;
  const digitsPass = (image, opts, progress, label) => pass(image, opts.digitsLang || 'eng', Object.assign({ tessedit_pageseg_mode: opts.psmDigits || '11' }, opts.whitelist ? { tessedit_char_whitelist: '0123456789:./-' } : {}), progress, label, opts.signal);
  DocRead.words = async function (blob, progress, opts) {
    opts = opts || {};
    progress = progress || (() => {});
    await load();
    progress('מכין את התמונה…');
    let image = opts.prep === false ? blob : await DocRead.prep(blob, opts);
    if (image.tall && !opts.part) { image.width = image.height = 0; return tallWords(blob, progress, opts); }
    // the second reading sees the picture in pure black and white: what one reading misses (a faint date,
    // a time by a cell's border) the other often gets (made from the first picture, not prepared again)
    const bw = (im) => (opts.prep === false || opts.bin2 === 0 ? im : im.bw || binary(im, opts.bin2 || 170));
    let image2 = bw(image);
    let dg = [];
    try { dg = await digitsPass(image2, opts, progress, 'קורא את המספרים'); } catch (e) { if (e.name === 'AbortError') throw e; /* the words alone */ }
    // hardly a time or a date read: the page may lie on its side or upside down. A small copy turned each other
    // way is read for its numbers, and the page is read again the way that finds clearly more of them
    // hardly a time or a date read on a table drawn with heavy lines: the reader skips numbers that touch a cell's
    // border. The page is prepared again with its lines taken out, and that reading kept when it finds clearly more
    // (on every page it read worse: only here)
    let unlined = false;
    if (opts.prep !== false && !opts.lines && wholes(dg) < 6) {
      try {
        const im = await DocRead.prep(blob, Object.assign({}, opts, { lines: true }));
        const d2 = await digitsPass(bw(im), opts, progress, 'קורא את המספרים');
        if (wholes(d2) >= 6 && wholes(d2) >= wholes(dg) * 2 + 2) { image.width = image.height = 0; image = im; image2 = bw(im); dg = d2; unlined = true; } else im.width = im.height = 0;
      } catch (e) { if (e.name === 'AbortError') throw e; /* as it was */ }
    }
    let turn = 0;
    // (not for the payslip's lines reading: a payslip has few times and dates, and its screen turns a sideways page itself)
    if (opts.prep !== false && opts.turn == null && !opts.lines && wholes(dg) < 6) {
      let best = { q: 0, n: wholes(dg) };
      for (const q of [90, 270, 180]) {
        progress('מכין את התמונה…');
        let n = 0;
        try { n = wholes(await digitsPass(binary(await DocRead.prep(blob, Object.assign({}, opts, { turn: q, size: 1600 })), opts.bin2 || 170), opts, null, '')); } catch (e) { if (e.name === 'AbortError') throw e; /* not this way */ }
        if (n > best.n) best = { q, n };
      }
      if (best.q && best.n >= 6 && best.n >= wholes(dg) * 2 + 2) {
        turn = best.q;
        image = await DocRead.prep(blob, Object.assign({}, opts, { turn }));
        image2 = bw(image);
        try { dg = await digitsPass(image2, opts, progress, 'קורא את המספרים'); } catch (e) { if (e.name === 'AbortError') throw e; dg = []; }
      }
    }
    progress(LOADING, { code: 'docread/loading-language', lang: 'heb+eng' });
    const he = await pass(image, 'heb+eng', { tessedit_pageseg_mode: opts.psm || '11', preserve_interword_spaces: '1' }, progress, 'קורא את המילים', opts.signal);
    if (!opts.lines && image.getContext) await hebrewAgain(image, he, opts.signal);
    // the words: Hebrew/English words from the first reading; numbers from whichever reading read them
    // better (a whole time or date over a broken one, then the surer one)
    const isWord = (w) => /[A-Za-zא-ת]/.test(w.text) && !/^[\dOolISB:./-]+$/.test(w.text);
    const words = he.filter(isWord);
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
    return { words: out, he, dg, canvas: image, info: { turn, skew: image.skew || 0, unlined } };
  };

  /**
   * A long scroll screenshot (an app's list captured down the page): read in slices one and a half widths tall,
   * overlapping, each as a picture of its own; the words put back where they stand on the whole picture, and a
   * word read twice in the overlap kept once (the surer reading).
   */
  async function tallWords(blob, progress, opts) {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const Wd = bmp.width, Hd = bmp.height, sliceH = Math.round(Wd * 1.6), step = Math.round(sliceH * 0.88);
    const out = { words: [], he: [], dg: [] };
    try {
      for (let y0 = 0; y0 < Hd; y0 += step) {
        const h = Math.min(sliceH, Hd - y0);
        if (y0 && h < sliceH - step) break; // what is left is all in the overlap already read
        const piece = await createImageBitmap(bmp, 0, y0, Wd, h);
        const got = await DocRead.words(piece, progress, Object.assign({}, opts, { part: true, turn: 0, straight: false }));
        if (piece.close) piece.close();
        const k = Wd / got.canvas.width;
        const back = (w) => Object.assign({}, w, { x0: w.x0 * k, x1: w.x1 * k, y0: w.y0 * k + y0, y1: w.y1 * k + y0 });
        for (const key of ['words', 'he', 'dg']) {
          for (const w of got[key].map(back)) {
            const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2;
            const twin = out[key].findIndex((o) => o.text === w.text && Math.abs((o.x0 + o.x1) / 2 - cx) < 6 && Math.abs((o.y0 + o.y1) / 2 - cy) < 6);
            if (twin < 0) out[key].push(w); else if (w.conf > out[key][twin].conf) out[key][twin] = w;
          }
        }
        got.canvas.width = got.canvas.height = 0;
      }
    } finally { if (bmp.close) bmp.close(); }
    return Object.assign(out, { canvas: null, info: { turn: 0, skew: 0, slices: Math.ceil(Hd / step) } });
  }

  /**
   * A short Hebrew word read as Latin letters on a Hebrew page (a name in a table cell: "נדב" read "am"): the
   * Hebrew and English reading of the whole page took it for English. Each such word is read again alone, its box
   * enlarged to letters ~40 px tall, by the Hebrew model on one line; the Hebrew reading replaces it only when it
   * is all Hebrew and sure (80+). At most 40 words a page. (Not for the payslip's lines reading, opts.lines.)
   */
  async function hebrewAgain(canvas, he, signal) {
    const letters = he.filter((w) => /[A-Za-zא-ת]{2}/.test(w.text));
    const heb = letters.filter((w) => /[א-ת]/.test(w.text)).length;
    const odd = he.filter(latinBit);
    if (!odd.length || heb < 6 || heb < letters.length * 0.5) return;
    if (signal && signal.aborted) throw stopped();
    const worker = await root.Tesseract.createWorker('heb', 1);
    let onStop = null;
    try {
      const stop = new Promise((_, no) => { onStop = () => no(stopped()); if (signal) signal.addEventListener('abort', onStop, { once: true }); });
      await Promise.race([worker.setParameters({ tessedit_pageseg_mode: '7' }), stop]);
      for (const w of odd.slice(0, 40)) {
        const c = cropOf(canvas, w);
        const { data } = await Promise.race([worker.recognize(c), stop]);
        c.width = c.height = 0;
        const t = String(data.text || '').trim();
        if (heWord(t) && data.confidence >= 80) { w.text = t; w.conf = Math.round(data.confidence); }
      }
    } finally { if (signal && onStop) signal.removeEventListener('abort', onStop); await worker.terminate(); }
  }
  // 1-4 Latin letters and nothing else: on a Hebrew page, a Hebrew word misread
  const latinBit = (w) => /^[A-Za-z]{1,4}$/.test(String(w.text).replace(/[.,:;'"|]/g, ''));
  // what may replace it: Hebrew letters only (a geresh, a dot or a dash between them), 2 to 12 of them
  const heWord = (t) => /^[א-ת][א-ת'׳".-]{1,11}$/.test(t) && !/[A-Za-z0-9]/.test(t);
  /** The box of a word with half its height around it, on white, enlarged to letters about 40 px tall. */
  function cropOf(canvas, w) {
    const h = Math.max(1, w.y1 - w.y0), k = Math.max(1, Math.min(4, 40 / h));
    const x0 = Math.max(0, w.x0 - h * 0.5), x1 = Math.min(canvas.width, w.x1 + h * 0.5), y0 = Math.max(0, w.y0 - h * 0.6), y1 = Math.min(canvas.height, w.y1 + h * 0.6);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((x1 - x0) * k)); c.height = Math.max(1, Math.round((y1 - y0) * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high';
    g.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    return c;
  }

  /** A photo of an hours report → shifts (core/timesheet.js parseWords). */
  DocRead.readTimesheet = async function (blob, progress, opts) {
    opts = opts || {};
    const got = await DocRead.words(blob, progress, opts);
    progress && progress('מסדר את הטבלה…');
    const res = root.Timesheet.parseWords(got.words, { today: opts.today, debug: opts.debug });
    return Object.assign(res, { words: got.words }, opts.debug ? { he: got.he, dg: got.dg } : {});
  };

  // the picture rules that need no browser, for the unit tests (tests/timesheet.test.js)
  DocRead.pure = { grayOf, skewOf, wholes, latinBit, heWord, sizeOf };
  root.DocRead = DocRead;
})(typeof window !== 'undefined' ? window : globalThis);
