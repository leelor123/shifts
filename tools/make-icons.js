/* Generates the app icons (PNG + SVG) without dependencies.
 * Usage: node tools/make-icons.js <outDir> */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const out = process.argv[2] || path.join(__dirname, '..', 'docs');
fs.mkdirSync(out, { recursive: true });

/* ---------- tiny PNG encoder ---------- */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- shapes (signed distance, design space 0..512) ---------- */
const sdRoundRect = (x, y, cx, cy, hw, hh, r) => { const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const sdSeg = (x, y, ax, ay, bx, by, w) => { const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy))); return Math.hypot(px - dx * t, py - dy * t) - w / 2; };
const hsl = (h, s, l) => { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0) * 255, f(8) * 255, f(4) * 255]; };
const C1 = hsl(236, 64, 55), C2 = hsl(256, 58, 38), WHITE = [255, 255, 255], AMBER = [237, 161, 0], AMBER_D = [201, 133, 0];

/** colour of design-space point; returns [r,g,b,a] */
function shade(x, y, maskable, scale) {
  const S = scale; // glyph scale (maskable keeps it in the safe zone)
  const gx = 256 + (x - 256) / S, gy = 256 + (y - 256) / S;
  let bgIn = maskable ? -1 : sdRoundRect(x, y, 256, 256, 256, 256, 112);
  if (bgIn > 0) return [0, 0, 0, 0];
  const t = Math.max(0, Math.min(1, (x + y) / 1024));
  let col = C1.map((c, i) => c + (C2[i] - c) * t);
  // clock
  const cx = 236, cy = 236;
  if (Math.abs(sdCircle(gx, gy, cx, cy, 128)) - 15 <= 0) col = WHITE;
  if (sdSeg(gx, gy, cx, cy, cx, cy - 78, 26) <= 0) col = WHITE;
  if (sdSeg(gx, gy, cx, cy, cx + 58, cy + 34, 26) <= 0) col = WHITE;
  // coin
  const kx = 352, ky = 352;
  if (sdCircle(gx, gy, kx, ky, 86) <= 0) col = hsl(256, 58, 42);
  if (sdCircle(gx, gy, kx, ky, 70) <= 0) col = AMBER;
  // shekel sign ₪ drawn as two interlocking hooks
  const segs = [[-24, 26, -24, -24], [-24, -24, 6, -24], [6, -24, 6, 8], [24, -26, 24, 24], [24, 24, -6, 24], [-6, 24, -6, -8]];
  if (segs.some(([ax, ay, bx, by]) => sdSeg(gx, gy, kx + ax, ky + ay, kx + bx, ky + by, 11) <= 0)) col = WHITE;
  return [col[0], col[1], col[2], 255];
}
function render(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 4;
  const k = 512 / size;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = shade((px + (sx + 0.5) / ss) * k, (py + (sy + 0.5) / ss) * k, maskable, maskable ? 1.25 : 1);
      const al = c[3] / 255;
      r += c[0] * al; g += c[1] * al; b += c[2] * al; a += al;
    }
    const i = (py * size + px) * 4;
    const n = ss * ss;
    buf[i] = a ? Math.round(r / a) : 0; buf[i + 1] = a ? Math.round(g / a) : 0; buf[i + 2] = a ? Math.round(b / a) : 0; buf[i + 3] = Math.round((a / n) * 255);
  }
  return png(size, size, buf);
}
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, false));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, true));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(236 64% 55%)"/><stop offset="1" stop-color="hsl(256 58% 38%)"/></linearGradient></defs>
<rect width="512" height="512" rx="112" fill="url(#g)"/><circle cx="236" cy="236" r="128" fill="none" stroke="#fff" stroke-width="30"/>
<path d="M236 236V158M236 236l58 34" stroke="#fff" stroke-width="26" stroke-linecap="round"/><circle cx="352" cy="352" r="86" fill="hsl(256 58% 42%)"/><circle cx="352" cy="352" r="70" fill="#eda100"/>
<path d="M328 378v-50h30v32M376 326v50h-30v-32" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
fs.writeFileSync(path.join(out, 'icon.svg'), svg);
console.log('icons written to', out);
