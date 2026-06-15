'use strict';
// Tiny zero-dependency static server for browser verification of the game.
// Serves the repo root. Usage: node tests/serve.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || 8123;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.json': 'application/json', '.css': 'text/css', '.txt': 'text/plain',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  // POST /shot?name=x with base64 PNG body → tests/shots/x.png
  // (browser-verification pipeline: the page exports its canvases here)
  if (req.method === 'POST' && urlPath === '/shot') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      const name = (new URL(req.url, 'http://x')).searchParams.get('name') || 'shot';
      const safe = name.replace(/[^a-z0-9_-]/gi, '') || 'shot';
      const dir = path.join(ROOT, 'tests', 'shots');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, safe + '.png'), Buffer.from(body, 'base64'));
      res.writeHead(200); res.end('ok');
    });
    return;
  }
  let file = path.normalize(path.join(ROOT, urlPath === '/' ? 'labyrinth.html' : urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('labyrinth dev server on http://localhost:' + PORT));
