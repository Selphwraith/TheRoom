# THE LABYRINTH — Architecture Guide

One file, no build system: `labyrinth.html` (6,211 lines pre-P0-fixes; the 2026-06-11 P0
batch added a net +4 lines, so citations after `:1226` may be offset by up to 4). Lines
`1-490` CSS, `491-785` DOM, the rest a single inline `<script>`. Everything below cites
line numbers in that file.

```
┌─ splash (z2000) ─ profiles (z999) ─ title #ov (z999) ─┐   DOM overlay stack
│  howto (z1001) · levelUp (z1000) · shop (z998)        │
│  pause (720) · backpack (700) · achievements/lb (999) │
├────────────────────────────────────────────────────────┤
│  #fogCv  — fog + glitch + compass + player-on-fog (z10)│   canvas pair
│  #cv     — maze, traps, items, projectiles, actors     │
└────────────────────────────────────────────────────────┘
```

## 1. Boot sequence

1. Top-level constants/definitions evaluate in order: `WEAPONS :808`, `POWERUPS :877`,
   profiles/achievements modules `:1030-1290`, `SHOP_ITEMS :1448`, `PERM_PERKS :1465`.
2. `loadProfiles(); loadAchievements()` run **mid-file** (`:1480`) — deliberately after
   `PERM_PERKS` exists. `_splashHasExisting` (`:1041`) snapshots storage *before*
   `loadProfiles()` auto-creates a default profile, so the splash knows whether the
   "PLAYER/HERO" profile is real.
3. Bottom boot block (`:6593-6603`): canvas sizing, palette, sprite/icon loading (async,
   silent fallback), `loadProgress()`, `buildTitleScreen()`, then `#ov` is hidden — the
   splash IIFE (`:6373`) owns what the user sees first.

## 2. Phase state machine

Global `phase` (`:986`): `MENU → PLAY → WIN | DEAD → SHOP → PLAY …`

- `initGame()` (`:2893`) is the **only** entry into PLAY. It regenerates everything;
  `runs++`; starts the rAF loop.
- `loop()` (`:5201`) runs forever once started; it gates on `phase==='PLAY'` for
  `update(dt)+drawAll()`. dt clamped to 80 ms.
- `update(dt)` (`:5207`) early-returns when `backpackOpen||pauseOpen` — backpack/pause are
  *sim freezes*, not phase changes.
- Win: `movePlayer` cell-change check (`:4312`) → `showOverlay('win')` (`:4954`) →
  score/tier/stash/save → buttons drive `openLevelUp → openShop → closeShop → initGame`.
- Death: `killPlayer` (`:4744`) → HP gate → `phase='DEAD'`, overlay after 500 ms.

## 3. World model

| Thing | Shape | Notes |
|---|---|---|
| `grid` | `ROWS×COLS` of `0/1` | `WALL=1, FLOOR=0`; COLS/ROWS from `updateMazeSize()` `:797`, **must stay odd** |
| `P` | player object `:3034` | float pixel pos `rx,ry` + derived grid cell `r,c`; `vr/vc/momentum` feed AI prediction |
| `enemies[]` | `makeEnemy()` `:2640` | enemies are **2×2 footprint**; `(E.r,E.c)` is the *bottom-right anchor*; occupied cells: `(r-1,c-1),(r-1,c),(r,c-1),(r,c)` |
| `items[]` | weapons/gold/pickaxe on floor | gold has `amount`; defs from `WEAPONS`/`GOLD_DEF` |
| `traps[]` | mines, noisemakers, dynamite | `owner:'player'|'enemy'`, `hidden` flag for camouflage |
| `powerupItems[]` / `activePowerups[]` | floor pickups / running buffs | shadow/speed are timed; shield/blink/aegis instant |
| `secretDoors[]` | 2×2 wall patches | minotaur-only doors; see Gotcha G2 |
| `vaultRect` | sealed loot room or null | 1-wide entrance, 2×2-disconnected interior |

### Maze generation (`genMaze :2362`, vault+doors in `initGame :2921-2991`)
Recursive backtracker carving **2-wide corridors with STEP=4** → guaranteed-connected 2×2
corridor graph for enemies. Then: 1-wide loop passages (~7% density, **player-only** —
see Gotcha G6), 10-12 player-only squeeze gaps at dead ends, the treasure vault (sealed
ring, one 1-wide gap, connectivity-guarded), and tier-count secret doors placed only where
the detour they bypass is ≥16 tiles.

## 4. Enemy AI (`minotaurAI :3529`)

Priority-ordered, each block `return`s:

1. **Tactician** (`mineLayer`, `:3538-3737`): own state machine
   `seal_exit → (waiting_boom) → hunt`. Lays a mine every 10 s (`_tacLastMine`) choosing
   tiles by **seal-line scoring** (complete wall-to-wall mine lines across corridors ≤4
   wide); blasts through obstructions with directional dynamite wedges; switches to hunt
   after 15 mines.
2. **Bruiser** (`wallBreaker`, `:3746-3833`): scent + vision; if a wall blocks the
   direct line or the corridor detour is >1.3× longer, `beginCharge()` (`:2848`) builds a
   Bresenham breach line and CHARGING carves 2×2 per step (max 16).
3. **Unified scent AI** (classic + scout, `:3835-3973`): sight (manhattan ≤
   `visionRadius`) locks scent → moving player: intercept prediction along the player's
   *actual A\* trajectory* (`getScentTarget :2756`); still player: **pack roles**
   (`packTarget :2542`) — closest hunter CLOSER, second CUTTER flanks the far side, rest
   WARDEN squat on the player→exit path; stillness >2.5 s collapses all roles inward.
   Stall-proofing: `bestReachablePathToPlayer` (`:2721`) ring-searches genuinely pathable
   anchors; ambush posts hold 700 ms.
4. **Blind One** (`soundHunter`, `:4074-4152` inside legacy block): infinite hearing of
   *tile crossings*; total deafness to stillness; noisemaker overrides everything; if a
   heard sound is corridor-unreachable, a 5 s "attunement" then **phases through the wall**
   (`blindPhaseTick :2687`, 10 s cooldown, must land on the far side).
5. **Legacy armed-AI block** (`:3975-4068`): unreachable except Blind One's HUNT path —
   see AUDIT A3.

Shooting is separate from movement: in `update()` (`:5257`), any enemy with a projectile
weapon, LOS (`hasLOS :4203`), range, and cooldown fires — in practice only the Scout.

## 5. Pathfinding contracts

`astar(sr,sc,er,ec, avoidSet, trapPenalty, size)` (`:2480`):
- Returns `null` (not `[]`) when unreachable; **the returned path includes the start node
  as `path[0]`** (Gotcha G1).
- `size=2` validates neighbors with `wk2x2`; `size=1` with `wk`.
- `trapPenalty=true` adds cost 50 to steps whose 2×2 footprint covers a **visible player
  mine** — hidden mines cost nothing, which is the entire camouflage mechanic.
- While `_enemyPathing` is true (set around every AI call, `:5232/5277`), `wk()` treats
  closed secret-door cells as walkable — this is how doors are "minotaur-only".

## 6. Persistence — five independent localStorage layers

| Key | What | Written |
|---|---|---|
| `labyrinth_profiles` | per-profile: score, gold, totalRuns, tier, highScore, permPerks, stash, atMerchant | `saveProfiles()` on most transactions |
| `labyrinth_active_profile` | active id | profile switch |
| `labyrinth_achievements` | **global** counters + unlocks (shared across profiles) | every unlock/`saveAchievements` |
| `labyrinth_save` | legacy meta mirror (score/runs/tier/perks) | `saveProgress()` on win; read for title CONTINUE + one-time migration |
| `labyrinth_runsave_<profileId>` | **mid-run snapshot**: grid string, player, weapons+shot pools, enemies (variant/pos/stun/tac-state), mines, powerups, doors, vault | `saveRunState()` — pause/quit/pagehide only (AUDIT A6) |
| `labyrinth_leaderboard` | top-20, one entry per profile | on win |

`restoreRun()` (`:1364`): calls `initGame()` first (fully-wired fresh run), then overwrites
the world from the snapshot, `runs--` so the resume isn't counted twice, re-seals secret
doors (Gotcha G2), re-persists immediately.

## 7. Rendering

`drawAll()` (`:5564`): translate by `-cam + shake`, then maze → traps → items →
projectiles → exit → enemies → player on `#cv`. Then `drawFog()` on `#fogCv` (destination-out
radial hole, `FOG_INNER/OUTER_TILES + fogBonus()`), player re-drawn *on the fog canvas* so
they're never occluded, compass arrow + mine-detect markers also live on the fog canvas
(viewport space + 4px bleed offset), `drawGlitch()` on top past 0.02 intensity.
Camera: fixed 21×15-tile viewport (`VIEW_TILES_* :913`), lerped, clamped to maze bounds.
Feedback stack: burst shake `shk`, proximity `rumble` (cubic, distance-driven), and
`glitchIntensity` (chromatic shift + scanline tears + grain) — all in `update()` `:5498-5521`.

Sprites are all optional: `drawSprite()` returns false when a sheet isn't loaded and every
actor has a hand-drawn canvas fallback (`:5805-6032`). Sheets are 4 cols × 4 rows
(idle + 3 walk frames; rows S/N/E/W; diagonals map to cardinals via `DIR_ROW :2246`).

## 8. Input

- Keyboard: `KEYS{}` map (`:5040`); movement is *continuous* — `movePlayer(dt)` (`:4227`)
  builds a normalized input vector, applies per-axis collision (slide on walls), updates
  the grid cell once per crossing (pickups/exit/mine checks live there).
- Touch: joystick writes `JOY{dx,dy,active}` (`:5095`), which `movePlayer` reads directly.
  `tickJoystick`/`startPlayerMove` are dead legacy (AUDIT A2).
- `F`/Space/🔥 = `playerFire()` (weapons only); `E`/🔧 = `playerInteract()`
  (defuse → dig → camouflage priority, `:4540`); holds are checked per-frame in `update()`.
- PC extra: click canvas = aim-at-point instant fire (`:5071`).

## 9. Audio

WebAudio, all optional (`initAudio :1623` wraps everything in try/catch; missing files are
silently skipped). Channels: one-shot `playSound` with pitch variance; minotaur proximity
loop gain-driven by distance (`:2123`); menu/game music crossfade pair (`:2133`);
noisemaker loop hard-capped at 5 s; Bruiser wall smashes are map-wide with cubic distance
falloff (`:2104`).

---

## Gotchas (the list that will save you a day each)

- **G1 — A\* paths include the start node.** `path[0]` is where you already stand. Every
  follow site must consume leading self-nodes (`while(path[0]==me) path.shift()` appears at
  `:3566, 3796, 3912, 3946…`) or the enemy freezes in place re-shifting its own tile —
  the historical "through-wall freeze". Also: `astar` returns `null`, not `[]` — every
  caller writes `astar(...)||[]`.
- **G2 — Secret doors are state in TWO places.** `grid` cells flip WALL↔FLOOR *and*
  `_secretDoorCells` (Set of closed cells) must stay in sync; `wk()` consults the Set only
  under `_enemyPathing`. If you open/close doors manually, update both **and** call
  `invalidateFloorCache()` **and** set `pathStale` on enemies. `restoreRun` re-seals all
  doors — which can entomb a player saved mid-doorway (AUDIT B9).
- **G3 — Enemy footprint anchor convention.** `wk2x2(r,c)` checks `(r-1..r, c-1..c)` — the
  anchor is the *bottom-right* of the 2×2 body. Mine triggers, catch checks, and door
  collision all build that exact footprint list; reuse it, don't re-derive.
- **G4 — COLS/ROWS must stay odd** (`updateMazeSize :797`) or the backtracker carves
  against the border. Any new size math must preserve that.
- **G5 — `invalidateFloorCache()` after ANY grid mutation** (dig, dynamite, bruiser charge,
  tactician blast, doors). `floorTiles2x2()` is cached; a stale cache sends every wander
  target into walls.
- **G6 — The enemy nav graph is loop-poor.** Loop passages and squeeze gaps are 1-wide:
  they widen only the player's graph. Manhattan-close ≠ path-close for enemies (measured
  234-node optimal route at 9-tile separation — AUDIT P1). Never assert/assume enemies
  approach monotonically in manhattan distance, and remember the vault interior and squeeze
  pockets are wk2x2-true but **disconnected** components (AUDIT P2).
- **G7 — `pendingPerks`/`pendingLoadout` are consumed by `initGame`.** Shop purchases live
  in `pendingPerks` until the next `initGame()` copies them into `P.perks` and clears them.
  Calling `initGame()` for any reason (debug!) eats the player's purchases.
- **G8 — `restoreRun` decrements `runs`** because `initGame` increments it; if you change
  either, change both. `totalRuns` (wins) is the real progression counter; `runs` is
  display-compat only.
- **G9 — Achievements are GLOBAL, profiles are not.** `achCounters/achUnlocked` are shared
  across all profiles by design (`:1168`); don't "fix" that. Leaderboard is also global
  with one entry per profile id.
- **G10 — Timing sources are mixed.** Sim logic uses `performance.now()` (virtualizable —
  the test harness depends on this); draw pulses use `Date.now()`. Keep new *logic* on
  `performance.now()` or the headless tests can't control it.
- **G11 — `wireOvButtons` clones `#ov`** to strip stale listeners, and all title/overlay
  buttons work via **delegation** on the `#ov` node, so `innerHTML` rewrites keep working.
  Direct `addEventListener` on children of `#ov` (like `btnSkipShop :5003`) must be
  re-attached after every innerHTML write.
- **G12 — Touch handlers come in pairs.** Every interactive element wires `click` +
  `touchend`-with-`preventDefault`; adding only `click` means double-fire or no-fire on
  mobile. Shop cards additionally guard against scroll-drags (`:4861-4867`).
- **G13 — The fog canvas is 8px oversized** (4px bleed each side, `:929-931`); everything
  drawn on it adds `bleed=4` to viewport coordinates.

## Roadmap gotchas (added with the 2026-06-11 feature batch)

- **G14 — `_rand` is the generation RNG seam.** `ri()` and all maze/item/variant
  generation draw from `_rand`, which is `Math.random` except during Daily Gauntlet
  generation (seeded from the date in `initGame`, restored to `Math.random` before
  `phase='PLAY'`). New GENERATION randomness must use `_rand()`; new GAMEPLAY
  randomness should too (it's identical post-restore) — but never assume `_rand`
  is seeded outside `initGame`.
- **G15 — `dailyMode` gates are scattered by design.** `getTier()`, `updateMazeSize()`,
  all seven `perm*()` functions, gold pickup, stash loadout, `saveRunState`, and
  `showOverlay` each early-branch on `dailyMode`. If you add a progression-affecting
  system, add its daily gate — the contract is "a daily changes NOTHING outside
  `labyrinth_daily_<profileId>`".
- **G16 — `comp2x2` uses ENEMY semantics and must follow structure.** The component
  map counts closed secret-door cells as walkable (matches `_enemyPathing` A\*), and
  `repairEnemyGraph()` must run AFTER the vault and doors are final — the vault seal
  is the main graph-splitter. Any new wall-placing structure goes before the repair
  call. `invalidateFloorCache()` clears both the floor cache and the component map.
- **G17 — warden fingerprint counters are run-local then folded.** Instrument new
  player actions on `_runWarden` / `_runStillTime`; `foldWardenStats()` (EMA, 0.85)
  owns the profile write. Never write `profile.warden` directly mid-run.
- **G18a — the Blind One's sound anchor is deliberately component-UNAWARE.**
  His hearing calls `nearestValid2x2(P.r,P.c)` with NO seeker argument: an
  unreachable in-pocket anchor is exactly what triggers his wall-phase
  attunement. Passing `E.r,E.c` there (component-aware) silently disables the
  phase mechanic — he'll mill around outside the vault forever. Related: a new
  unreachable sound must NOT reset `_phaseStart`, or vault-looting players
  reset his 5s charge with every step.
- **G18b — the viewport is dynamic.** `VIEW_TILES_W=21` fixed; `VIEW_TILES_H`
  recomputes per resize from spare height (`VIEW_BASE_H=15` minimum, capped at
  square 21). Never assume a 15-row canvas; use `cv.width/height`.
- **G18c — every run start must `setGameControlsActive(true)`.** Quit-to-title
  disables the touch controls; `initGame` re-enables. A new entry point that
  bypasses `initGame` will ship a dead joystick.
- **G18 — keyed exit state is two flags.** `exitLocked` (world) + `P.hasExitKey`
  (player) and both ride the run save (`data.lock`). `restoreRun` overrides whatever
  the inner `initGame` rolled — same pattern any new run-scoped flag must follow.

## Headless testing seam

`tests/env.js` extracts the inline script and runs it in a Node `vm` context (stub DOM,
black-hole canvas, in-memory storage, virtual clock, seeded `Math.random`). Top-level
`let/const` of the game script live in the context's global lexical scope, so tests
read/drive state with `g.eval('P.hp')` etc. `node tests/runner.js` — ~3 s, no deps.
