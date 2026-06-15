'use strict';
// One-shot: splash.png centre crop → Android launcher icons at every density.
// Run from desktop/ (reuses its Electron): npx electron make-android-icons.js
// Overwrites the Capacitor template's placeholder robot icons.
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const RES = path.join(__dirname, '..', 'mobile', 'android', 'app', 'src', 'main', 'res');
// density → [launcher px, adaptive foreground px]
const DENSITIES = {
  'mipmap-mdpi': [48, 108],
  'mipmap-hdpi': [72, 162],
  'mipmap-xhdpi': [96, 216],
  'mipmap-xxhdpi': [144, 324],
  'mipmap-xxxhdpi': [192, 432],
};

app.whenReady().then(() => {
  try {
    const src = nativeImage.createFromPath(path.join(__dirname, '..', 'splash.png'));
    const { width, height } = src.getSize();
    const side = Math.min(width, height);
    const crop = src.crop({
      x: Math.floor((width - side) / 2),
      y: Math.floor((height - side) / 2),
      width: side, height: side,
    });
    let written = 0;
    for (const [dir, [launcher, fg]] of Object.entries(DENSITIES)) {
      const d = path.join(RES, dir);
      if (!fs.existsSync(d)) continue;
      const lp = crop.resize({ width: launcher, height: launcher, quality: 'best' }).toPNG();
      fs.writeFileSync(path.join(d, 'ic_launcher.png'), lp);
      fs.writeFileSync(path.join(d, 'ic_launcher_round.png'), lp);
      fs.writeFileSync(path.join(d, 'ic_launcher_foreground.png'),
        crop.resize({ width: fg, height: fg, quality: 'best' }).toPNG());
      written += 3;
    }
    console.log('ANDROID ICONS OK —', written, 'files');
    app.exit(0);
  } catch (e) {
    console.error('ANDROID ICONS FAIL', e);
    app.exit(1);
  }
});
