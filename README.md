# TheRoom — THE LABYRINTH

A roguelite maze game with a hunting AI, shipped as a single self-contained HTML5 canvas
file: open `labyrinth.html` in a browser. No build system, no dependencies.

## Repository map

| Path | What |
|---|---|
| `labyrinth.html` | the entire game (CSS + DOM + ~5,100 lines of JS) |
| `sprites/`, `sounds/`, `splash.png` | optional assets — the game silently falls back to drawn shapes / silence |
| `tests/` | headless Node test harness — `node tests/runner.js` (no deps, Node ≥ 18, ~3 s) |
| `AUDIT.md` | code audit: bugs, dead code, perf items, doc drift (IDs cross-referenced from tests) |
| `FEATURES.md` | proposed features (logic/UI only) with design notes |
| `GAME_MODES.md` | unlockable game-mode pitches (Ironman / Endless / Hunter) with design notes |
| `docs/ARCHITECTURE.md` | architecture guide + the gotcha list |
| `docs/SYSTEMS_CHECKLIST.md` | every system with status and line anchors |
| `docs/NEXT_STEPS.md` | prioritized work queue |
| `docs/SHIPPING.md` | how to build/release the PC and Android apps |
| `desktop/` | Electron wrapper — `npm run dist` → portable exe + installer in `desktop/dist/` |
| `mobile/` | Capacitor Android wrapper — signed APK/AAB via Gradle (see SHIPPING.md) |
| `scripts/build-www.js` | assembles the shared web bundle both wrappers package |
| `tools/jdk/` | portable JDK 21 used by the Android build (no system install) |

## Tests

```
node tests/runner.js            # full suite
node tests/runner.js smoke      # any filename substring filters
```

The harness extracts the game's inline `<script>` and runs it in a Node `vm` sandbox with a
stub DOM, no-op canvas, in-memory localStorage, a virtual clock, and seeded RNG — so full
runs (movement → exit → win → save) execute deterministically. Tests marked **KNOWN-BUG**
assert *intended* behavior for bugs documented in `AUDIT.md`; they flip to `FIXED?` when the
bug is repaired.
