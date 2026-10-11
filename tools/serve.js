/* Minimal static server for local testing: node tools/serve.js [port] [dir] */
const http = require('http');
const fs = require('fs');
const path = require('path');
const port = +process.argv[2] || 8765;
const root = path.resolve(process.argv[3] || path.join(__dirname, '..', 'docs'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': buf.length, 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
