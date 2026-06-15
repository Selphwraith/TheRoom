'use strict';
// One-shot icon builder: splash.png → centered square crop → multi-size .ico
// Run with: npx electron make-icon.js   (uses Electron's nativeImage; no
// native deps). Writes build/icon.ico for electron-builder.
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const src = nativeImage.createFromPath(path.join(__dirname, '..', 'splash.png'));
    const { width, height } = src.getSize();
    const side = Math.min(width, height);
    const crop = src.crop({
      x: Math.floor((width - side) / 2),
      y: Math.floor((height - side) / 2),
      width: side, height: side,
    });
    fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
    const pngs = [256, 128, 64, 48, 32, 16].map(s =>
      crop.resize({ width: s, height: s, quality: 'best' }).toPNG());
    const toIco = require('png-to-ico');
    const ico = await toIco(pngs);
    fs.writeFileSync(path.join(__dirname, 'build', 'icon.ico'), ico);
    console.log('ICON OK', side + 'px source →', ico.length, 'bytes');
    app.exit(0);
  } catch (e) {
    console.error('ICON FAIL', e);
    app.exit(1);
  }
});
