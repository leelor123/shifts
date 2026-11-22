/* The small notification icon (the white glyph in the status bar): Android draws it in a 24dp box, and other apps'
 * glyphs fill about 20dp of it. Ours filled 14.5dp (60%), so it looked smaller than its neighbours (2026-11-22).
 * This draws it again from src/icons/icon-mono-512.png with the glyph at FILL of the box:
 *   src/icons/badge-96.png                              the web notifications' badge (sw.js, app.js, run-note.js)
 *   android/res/drawable-<density>/ic_notification_icon.png   the Android app's icon (tools/android.js copies
 *                                                        android/res over the generated project on every build)
 * icon-mono-512.png itself stays as it is: the web manifest uses it as the "monochrome" icon, with its own safe zone.
 * Run: node tools/notif-icon.js        Guard: tests/icons.test.js */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const FILL = 20 / 24;
const ANDROID = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };

/** An 8-bit PNG → { w, h, alpha(x, y) } (alpha 0..255; colour types 0, 2, 4, 6). */
function decode(file) {
  const b = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, ct = 6;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9];
      if (d[8] !== 8 || d[12]) throw new Error(file + ': only 8-bit, not interlaced');
    }
    if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!bpp) throw new Error(file + ': colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], o = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = raw[o + x];
      if (f === 1) v += a;
      else if (f === 2) v += up;
      else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const q = a + up - c, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const alpha = ct === 6 ? (x, y) => px[(y * w + x) * 4 + 3] : ct === 4 ? (x, y) => px[(y * w + x) * 2 + 1] : () => 255;
  return { w, h, alpha };
}

/** The box of the pixels drawn (alpha above thr), in pixels: { x0, y0, x1, y1 } inclusive. */
function glyphBox(img, thr = 40) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.alpha(x, y) > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, x1, y1 };
}

/** White RGBA PNG from an alpha array. */
function encode(w, h, alpha) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = raw[o + 1] = raw[o + 2] = 255;
      raw[o + 3] = alpha[y * w + x];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** The glyph of img redrawn in a size×size box, its longer side at FILL, centred (8×8 samples per pixel). */
function render(img, size) {
  const g = glyphBox(img, 0);
  const side = Math.max(g.x1 - g.x0 + 1, g.y1 - g.y0 + 1), cx = (g.x0 + g.x1 + 1) / 2, cy = (g.y0 + g.y1 + 1) / 2;
  const k = side / (size * FILL); // source pixels per output pixel
  const at = (x, y) => (x < 0 || y < 0 || x >= img.w || y >= img.h ? 0 : img.alpha(x, y));
  const bilinear = (sx, sy) => {
    const x = sx - 0.5, y = sy - 0.5, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    return at(xi, yi) * (1 - fx) * (1 - fy) + at(xi + 1, yi) * fx * (1 - fy) + at(xi, yi + 1) * (1 - fx) * fy + at(xi + 1, yi + 1) * fx * fy;
  };
  const N = 8, out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      s += bilinear(cx + (x + (i + 0.5) / N - size / 2) * k, cy + (y + (j + 0.5) / N - size / 2) * k);
    }
    out[y * size + x] = Math.round(s / (N * N));
  }
  return out;
}

module.exports = { decode, glyphBox, FILL, ANDROID };

if (require.main === module) {
  const src = decode(path.join(ROOT, 'src', 'icons', 'icon-mono-512.png'));
  const write = (file, size) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, encode(size, size, render(src, size)));
    console.log(path.relative(ROOT, file), size + 'px');
  };
  write(path.join(ROOT, 'src', 'icons', 'badge-96.png'), 96);
  for (const [d, s] of Object.entries(ANDROID)) write(path.join(ROOT, 'android', 'res', 'drawable-' + d, 'ic_notification_icon.png'), s);
}
