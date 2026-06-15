'use strict';
// ═══════════════════════════════════════════════════════════════
// env.js — headless harness for labyrinth.html
//
// Extracts the game's inline <script> and evaluates it inside a
// Node `vm` context with a stubbed browser environment:
//   - DOM: getElementById returns memoized permissive element stubs
//   - canvas 2D context: "black hole" proxy (any call/prop is a no-op)
//   - localStorage: in-memory Map, shareable across game instances
//     (simulates closing the app / reopening on the same device)
//   - performance.now + setTimeout: virtual clock (clock.advance(ms))
//   - Math.random: seeded (mulberry32) for deterministic runs
//
// Top-level let/const in the game script land in the context's
// global lexical scope, so later vm.runInContext calls can read and
// assign them. Tests interact via g.eval('expr').
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_FILE = path.join(__dirname, '..', 'labyrinth.html');

let _scriptCache = null;
function extractScript() {
  if (_scriptCache) return _scriptCache;
  const html = fs.readFileSync(GAME_FILE, 'utf8');
  const start = html.indexOf('<script>');
  const end = html.lastIndexOf('</script>');
  if (start < 0 || end < 0) throw new Error('Could not find <script> block in labyrinth.html');
  _scriptCache = html.slice(start + '<script>'.length, end);
  return _scriptCache;
}

// ── Black-hole proxy: callable, any property returns another black hole.
// Used for canvas contexts so every drawing call is a silent no-op.
function blackHole() {
  const store = {};
  const fn = function () { return bh; };
  const bh = new Proxy(fn, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (typeof p === 'symbol') return undefined;
      if (p in store) return store[p];
      return bh;
    },
    set(t, p, v) { store[p] = v; return true; },
    apply() { return bh; },
  });
  return bh;
}

// ── Permissive DOM element stub ──
function makeElement(id, tag) {
  const listeners = {};
  const el = {
    id: id || '',
    tagName: (tag || 'div').toUpperCase(),
    style: {},
    dataset: {},
    children: [],
    value: '',
    textContent: '',
    scrollTop: 0,
    className: '',
    _innerHTML: '',
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      contains(c) { return this._set.has(c); },
      toggle(c) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); },
    },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      const a = listeners[type]; if (!a) return;
      const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
    },
    dispatch(type, evt) {
      evt = evt || {};
      if (!evt.preventDefault) evt.preventDefault = () => {};
      if (!evt.stopPropagation) evt.stopPropagation = () => {};
      if (!evt.target) evt.target = el;
      for (const fn of (listeners[type] || []).slice()) fn(evt);
    },
    appendChild(c) { el.children.push(c); c.parentNode = el; return c; },
    replaceChild(n, o) { return o; },
    cloneNode() { return el; },           // keep identity stable for getElementById
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; },
    focus() {}, blur() {},
    closest() { return null; },
    getContext() { return blackHole(); },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._innerHTML; },
    set(v) { el._innerHTML = String(v); el.children = []; },
  });
  el.parentNode = { replaceChild() {}, appendChild() {} };
  return el;
}

// ── Shareable in-memory localStorage ──
function makeStorage(seedEntries) {
  const m = new Map(seedEntries || []);
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    clear: () => m.clear(),
    get length() { return m.size; },
    key: i => [...m.keys()][i] ?? null,
    _map: m,
  };
}

// ── Seeded PRNG ──
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════
// createGame({seed, storage}) → game handle
// ═══════════════════════════════════════
function createGame(opts = {}) {
  const seed = opts.seed ?? 12345;
  const storage = opts.storage || makeStorage();

  // Virtual clock + virtual timers
  let now = 10000;
  let timerId = 1;
  let timers = []; // {id, fn, at}
  const clock = {
    now: () => now,
    advance(ms) {
      const target = now + ms;
      // run due timers in order, allowing timers to schedule timers
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers.find(t => t.at <= target);
        if (!next) break;
        timers = timers.filter(t => t !== next);
        now = Math.max(now, next.at);
        try { next.fn(); } catch (e) { /* surfaced via test asserts */ }
      }
      now = target;
    },
  };
  const vSetTimeout = (fn, ms) => { timers.push({ id: timerId, fn, at: now + (ms || 0) }); return timerId++; };
  const vClearTimeout = id => { timers = timers.filter(t => t.id !== id); };

  // DOM
  const elements = new Map();
  const documentListeners = {};
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    createElement(tag) { return makeElement('', tag); },
    querySelector() { return makeElement('', 'div'); },
    querySelectorAll() { return []; },
    addEventListener(type, fn, opts2) {
      const entry = { fn, once: !!(opts2 && opts2.once) };
      (documentListeners[type] = documentListeners[type] || []).push(entry);
    },
    removeEventListener(type, fn) {
      const a = documentListeners[type]; if (!a) return;
      const i = a.findIndex(e => e.fn === fn); if (i >= 0) a.splice(i, 1);
    },
    dispatch(type, evt) {
      evt = evt || {};
      if (!evt.preventDefault) evt.preventDefault = () => {};
      if (!evt.stopPropagation) evt.stopPropagation = () => {};
      const list = (documentListeners[type] || []).slice();
      for (const entry of list) {
        if (entry.once) {
          const a = documentListeners[type];
          const i = a.indexOf(entry); if (i >= 0) a.splice(i, 1);
        }
        entry.fn(evt);
      }
    },
    body: makeElement('', 'body'),
    visibilityState: 'visible',
  };

  const window = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener() {}, removeEventListener() {},
    scrollTo() {},
    // AudioContext intentionally undefined → initAudio() throws inside its
    // try/catch and the whole sound system no-ops, matching missing-codec envs.
  };

  function ImageStub() { this.onload = null; this.onerror = null; }
  Object.defineProperty(ImageStub.prototype, 'src', { set() { /* never loads */ }, get() { return ''; } });

  const seededMath = Object.create(Math, {
    random: { value: mulberry32(seed), writable: true, configurable: true },
  });

  const sandbox = {
    window, document, navigator: { maxTouchPoints: 0 },
    localStorage: storage,
    performance: { now: () => now },
    Image: ImageStub,
    fetch: () => Promise.reject(new Error('no network in tests')),
    setTimeout: vSetTimeout, clearTimeout: vClearTimeout,
    setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    console,
    Math: seededMath,
    Date,
  };
  sandbox.globalThis = sandbox;
  window.localStorage = storage;

  const context = vm.createContext(sandbox);
  vm.runInContext(extractScript(), context, { filename: 'labyrinth.inline.js' });

  const g = {
    context, storage, clock, document, elements,
    eval(code) { return vm.runInContext(code, context, { filename: 'test-eval.js' }); },
    // Advance virtual time and run one simulation step
    tick(dt = 16) {
      clock.advance(dt);
      return vm.runInContext(`update(${dt})`, context);
    },
    // Hold/release a key through the real keyboard handlers
    key(k, down = true) {
      document.dispatch(down ? 'keydown' : 'keyup', { key: k, repeat: false });
    },
    // Convenience: set the raw KEYS map directly (bypasses handlers)
    setKeys(map) {
      g.eval(`(function(){ for(const k of Object.keys(KEYS)) KEYS[k]=false; })()`);
      for (const [k, v] of Object.entries(map)) g.eval(`KEYS[${JSON.stringify(k)}]=${!!v}`);
    },
    releaseKeys() { g.eval(`(function(){ for(const k of Object.keys(KEYS)) KEYS[k]=false; })()`); },
  };

  // ── High-level helpers used by multiple test files ──

  // Kill all enemies (simulates a Slayer-cleared maze) for deterministic traversal
  g.clearEnemies = () => g.eval(`enemies.forEach(e=>{e.alive=false;}); updateRosterDisplay();`);

  // Spawn a specific variant at the first wk2x2 tile at least `minDist` from the
  // player (and optionally near a target point). Returns its index in enemies[].
  g.spawnVariant = (variantId, { minDist = 12, near = null, nearDist = 10 } = {}) => {
    return g.eval(`(function(){
      const tiles=floorTiles2x2().slice();
      let best=null;
      for(const[r,c] of tiles){
        if(md(r,c,P.r,P.c) < ${minDist}) continue;
        ${near ? `if(md(r,c,${near[0]},${near[1]}) > ${nearDist}) continue;` : ''}
        best=[r,c]; break;
      }
      if(!best) return -1;
      const E=makeEnemy(best[0],best[1],${JSON.stringify(variantId)});
      enemies.push(E);
      return enemies.length-1;
    })()`);
  };

  // Steer the player to the EXIT using the game's own astar + real movePlayer
  // physics. Re-plans from the current cell every step, so blink teleports and
  // item pickups along the way are survivable. Returns frames spent.
  g.walkToExit = (maxFrames = 60000) => {
    // Keyed-exit runs would stall this helper at the sealed door; grant the
    // key up front — the lock mechanic has its own dedicated tests.
    g.eval('if(typeof exitLocked!=="undefined"&&exitLocked&&P&&!P.hasExitKey){P.hasExitKey=true;}');
    let frames = 0;
    while (frames < maxFrames) {
      const phase = g.eval('phase');
      if (phase !== 'PLAY') return frames;
      const path = g.eval('JSON.parse(JSON.stringify(astar(P.r,P.c,EXIT.r,EXIT.c)||[]))');
      if (!path || path.length === 0) throw new Error('walkToExit: no path from player to EXIT');
      // path[0] is the start node (see gotcha) — next real node:
      let next = null;
      for (const [r, c] of path) {
        const cur = g.eval('[P.r,P.c]');
        if (r !== cur[0] || c !== cur[1]) { next = [r, c]; break; }
      }
      if (!next) { // already standing on goal cell? force one settle tick
        g.tick(16); frames++; continue;
      }
      // steer toward the node's pixel centre on both axes
      const stepBudget = 90; // frames allowed per tile before re-planning
      for (let i = 0; i < stepBudget; i++) {
        const [pr, pc] = g.eval('[P.r,P.c]');
        if (pr === next[0] && pc === next[1]) break;
        const [dx, dy] = g.eval(`[tx(${next[1]})-P.rx, ty(${next[0]})-P.ry]`);
        g.setKeys({
          a: dx < -2, d: dx > 2,
          w: dy < -2, s: dy > 2,
        });
        g.tick(16);
        frames++;
        if (g.eval('phase') !== 'PLAY') { g.releaseKeys(); return frames; }
      }
      g.releaseKeys();
    }
    throw new Error('walkToExit: exceeded frame budget without reaching exit');
  };

  return g;
}

module.exports = { createGame, makeStorage, extractScript, GAME_FILE };
