'use strict';
// assets.test.js — every sound/sprite path referenced in code must exist on
// disk. The game fails silently on missing assets (by design), so this is the
// only place a renamed file ever gets noticed.
const fs = require('fs');
const path = require('path');
const { createGame } = require('./env');
const { test, assert } = require('./t');

const ROOT = path.join(__dirname, '..');

function collectPaths(g) {
  const sound = g.eval('JSON.parse(JSON.stringify(Object.values(SOUND_FILES)))');
  const icons = g.eval('JSON.parse(JSON.stringify(Object.values(ITEM_ICON_FILES)))');
  const sprites = g.eval(`JSON.parse(JSON.stringify([
    ...Object.values(SPRITE).map(s=>s.file),
    ...Object.values(SPRITE_VARIANTS).map(s=>s.file),
    ...Object.values(PLAYER_WEAPON_SPRITES).map(s=>s.file),
  ]))`);
  return { sound, icons, sprites };
}

test('every sprite path referenced in code exists on disk', () => {
  const g = createGame({ seed: 90 });
  const { icons, sprites } = collectPaths(g);
  const missing = [...icons, ...sprites].filter(p => !fs.existsSync(path.join(ROOT, p)));
  assert(missing.length === 0, 'missing sprite files: ' + missing.join(', '));
});

test('every sound path referenced in code exists on disk', () => {
  const g = createGame({ seed: 91 });
  const { sound } = collectPaths(g);
  const missing = sound.filter(p => !fs.existsSync(path.join(ROOT, p)));
  // Regression guard for AUDIT B11: hit_minotaur.mp3 shipped under the wrong
  // name for the game's entire life — the loader fails silently, so this test
  // is the only thing that notices a renamed/missing audio file.
  assert(missing.length === 0, 'missing sound files: ' + missing.join(', '));
});
