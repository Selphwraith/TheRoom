'use strict';
// Assembles the deployable web bundle from the single-file source of truth.
//   node scripts/build-www.js <targetDir> [...moreTargetDirs]
// labyrinth.html → index.html, plus sounds/, sprites/, splash.png.
// Both the Electron wrapper (desktop/www) and the Capacitor wrapper
// (mobile/www) consume the output — labyrinth.html stays the only source.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('usage: node scripts/build-www.js <targetDir> [...more]');
  process.exit(1);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

for (const t of targets) {
  const out = path.resolve(ROOT, t);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'labyrinth.html'), path.join(out, 'index.html'));
  fs.copyFileSync(path.join(ROOT, 'splash.png'), path.join(out, 'splash.png'));
  copyDir(path.join(ROOT, 'sounds'), path.join(out, 'sounds'));
  copyDir(path.join(ROOT, 'sprites'), path.join(out, 'sprites'));
  console.log('built', out);
}
