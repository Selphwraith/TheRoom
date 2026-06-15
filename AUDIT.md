# THE LABYRINTH — Code Audit

**File audited:** `labyrinth.html` (6,211 lines: ~790 CSS, ~290 HTML, ~5,120 JS)
**Date:** 2026-06-11
**Verification:** every finding below was confirmed either by grep/line inspection or by an
automated test in `tests/` (IDs like **B4** are referenced from the test suite's KNOWN-BUG
markers — run `node tests/runner.js`).
**Line numbers:** captured before the P0 fix batch (2026-06-11), which added a net +4 lines;
citations after `:1226` may be offset by up to 4 lines in the current file.

---

## 1. Bugs (confirmed, ranked by player impact)

### B1 — Defuse prompt tells the player to hold the WRONG button — ✅ FIXED 2026-06-11
`labyrinth.html:4722` — `tryStartDefuse()` shows `holdFire` (**"HOLD F / 🔥"**), but the defuse
timer only advances while `KEYS['e'] || interactButtonHeld` is true (`:5364`). Defusing is
started by **E** and must be *held* on **E**; holding F instead does nothing (and tapping F
fires your weapon next to a mine). One-token fix: use `holdKey` instead of `holdFire`.

### B5 — Scout "half damage" deals *double* damage *(test: variants_test.js)* — ✅ FIXED 2026-06-11
`labyrinth.html:4744-4764` — the `dmg<1` branch in `killPlayer()` decrements a **full HP**
(`P.hp=Math.max(1,P.hp-1)`) *and* accrues `P.hpFrac+=dmg`, which removes **another** HP every
second hit. Measured: 3 HP → **0 HP after two glancing hits** (intended: 2 HP). The in-code
comment "Actually implement true half-hp: use a fractional hp tracker" shows the refactor was
abandoned mid-flight. Bonus inconsistency: the Scout's *ranged* shots bypass `dmg` entirely —
`update()` calls `killPlayer('HIT BY PROJECTILE')` with default `dmg=1` (`:5446`), so the
advertised half damage (How-To `:707`) never applies to its primary attack.

### B6 — Noisemakers (and waiting dynamite) detonate as mines under enemies *(test: variants_test.js)* — ✅ FIXED 2026-06-11
`labyrinth.html:4437` — `startEnemyMove()`'s footprint check matches **any** trap with
`owner:'player'`, with no `def===WEAPONS.mine` filter. An enemy walking over your ringing
noisemaker silently consumes it with a 0 ms "stun" — which also pollutes the
`stun_<variant>` achievement counters (see B8). Same for a placed dynamite still on its fuse.

### B4 — ARSENAL achievement is effectively impossible *(test: achievements.test.js)* — ✅ FIXED 2026-06-11
`labyrinth.html:4343` — on pickup, the code runs `achProgress('weaponRunSet', 1)` once per
pickup *after* the run already holds 7 distinct types. The achievement def
(`weapon_all_run`, `:1215`) requires the **counter** to reach 7 — so you must repeat the
"all 7 in one run" feat ~7 times across your save's lifetime. Fix:
`achSet('weaponRunSet', _runWeaponsHeld.size)`. Related: `_runWeaponsHeld` counts *any*
type (dynamite/stunbow/slayer included), so 7 distinct exotics also trips the intended-canonical set.

### B7 — Mid-run save silently drops noisemakers, dynamite, and fuses *(test: save_restore.test.js)* — ✅ FIXED 2026-06-11
`labyrinth.html:1357` — `saveRunState()` filters traps to `t.def===WEAPONS.mine` only, and
never serializes `dynamiteFuses`. Suspend/resume during an active noisemaker or burning
dynamite deletes them; the weapon was already consumed, so the player just loses it.

### B11 — Minotaur hit sound has never played *(test: assets.test.js)* — ✅ FIXED 2026-06-11 (file renamed)
`labyrinth.html:1596` — `SOUND_FILES.hit_minotaur` requests `sounds/hit_minotaur.mp3`; the
shipped file is **`sounds/minotaur_hit.mp3`**. The loader's silent-failure design hid this.
Every other referenced asset (32 sprites, 17 other sounds) exists. Rename either side.

### B3 — Survival achievement clock assumes 60 fps
`labyrinth.html:4259` — `_runMoveTime += 0.016` per frame instead of `dt/1000`. On a 120 Hz
display the MARATHON timer runs 2× fast; on a throttled 30 fps phone, half speed. Use `dt`.

### B2 — Defuse progress ring ignores perk-modified time
`labyrinth.html:5761` — the canvas ring is drawn from `defuseTimer/DEFUSE_TIME`, while the
actual completion uses `defuseNeeded` (Steady Hands ×0.5, Nimble Fingers ×0.85/stack,
`:5371`). With perks, the mine defuses when the ring shows ~50%.

### B8 — Stun achievements count before validity check
`labyrinth.html:4666-4670` — `stunEnemy()` runs `achProgress('stun_'+vid)` *before*
`if(!E||!E.alive) return;`. Dead enemies (and B6's 0 ms noisemaker "stuns") inflate counters.
Move the achievement call below the guard.

### B9 — Restore can entomb the player inside a re-sealed secret door
`labyrinth.html:1383-1389` — `restoreRun()` force-seals all secret-door cells to WALL.
Doors stay open 2.2 s and the player *can* walk through them while open; if the run was
saved (pause / pagehide) at that moment, the restored player is inside solid wall and can
never move again — `wk()` fails on all sides. Enemies escape (the `_enemyPathing` flag treats
door cells as walkable); the player softlocks. Low probability, run-ending impact.
Fix: after re-sealing, if `!wk(P.r,P.c)`, relocate the player to the nearest floor tile.

### B12 — Premium shop item description lies — ✅ FIXED 2026-06-11 (copy now says 10 shots)
`labyrinth.html:1459` vs `:817` — STUN XBOW shop card says **"Infinite shots"** at 1000 gold;
`WEAPONS.stunxbow.maxShots` is **10**. The toast/HUD code paths even branch on
`maxShots===Infinity` (`:4514-4522`), which is never true. Decide which is the design and fix
the other.

### B13 — Profile/leaderboard names are injected into innerHTML unsanitized
`labyrinth.html:1790-1791, 1853` — names go straight into template strings. Today this is
only self-XSS on a local game, but the moment the planned platform login / shared leaderboard
(see A5) lands, it becomes stored XSS. Sanitize at render.

---

## 2. Incomplete / abandoned features

### A1 — Mouse aim mode (abandoned, fully dead)
`aimMode` is **never set to `true` anywhere** (grep-verified). Dead with it: the `#aimCursor`
SVG element (`:160, 547-554`), the `mousemove` aim handlers (`:5080-5091`), the dashed
aim-line render in `drawAll()` (`:5580-5585`), and the `aimMode` branch in `playerFire()`
(`:4499`). Click-to-fire (`:5071`) works without it. Either finish (set `aimMode=true` on
weapon hover / right-click) or delete ~40 lines.

### A2 — Legacy step-movement joystick (superseded, still ticking)
Two `tickJoystick` definitions: an empty one at `:4363` ("intentionally empty") and the real
one at `:5147` that wins via hoisting. It runs **every frame** (`update()` `:5214`), computes
repeat timers, and calls `startPlayerMove()` — which is a documented no-op (`:4357-4360`).
The entire path is vestigial since continuous `movePlayer()` reads `JOY` directly (`:4238`).
Delete both plus `joyMoveTimer`.

### A3 — The original "armed Minotaur" AI (unreachable)
The weapon-pickup / mine-laying / flanking state machine — `EQUIP` and `MINE_PLACE` states
(`:4038-4068`), `FLANK` (`:4017-4029`), `aiScore_weapon` (`:3503`),
`findMinePlacementTarget` (`:3510`), `countAlternatePaths` (`:2879`) — is dead. Control flow:
mineLayer returns at `:3737`, wallBreaker at `:3832`, and the unified scent block
(`:3835-3973`) returns on every path for classic/scout. Only the Blind One reaches the legacy
block, and it can't equip (`canEquip` false) or carry mines, so only its HUNT branch runs.
Consequences:
- `VARIANTS.*.canPickupWeapons / canPickupRangedOnly` are dead config (Scout's xbow is innate).
- The "MINOTAUR ARMED" toast (`:4044`) and "MINE LAID" toast (`:4061`) can never fire — only
  the Tactician lays mines now.
- How-To still says "The Minotaur picks up mines and lays them strategically" (`:636`).
- `WEAPONS[].score` (`:809-824`) is only consumed by this dead scoring.

### A4 — 8-direction sprite sheets (plan abandoned, comments stale)
Comment block `:2180-2194` documents 8 sprite rows including diagonals; actual configs are
`cols:4, rows:4` and `DIR_ROW` (`:2246-2250`) maps diagonals onto cardinals. Harmless, but
the comment will mislead the next artist/integrator.

### A5 — Platform monetization stubs
"✦ UNLOCK MORE PROFILES — COMING SOON ✦" (`:1947`, splash variant `:6413`),
`MAX_FREE_PROFILES=3` (`:1036`), and the profile form's
"USERNAME (OPTIONAL — for future platform login)" (`:1999`). Intentional hooks for an
unbuilt platform; decide ship-or-strip before release polish.

### A6 — Periodic autosave was designed but never wired — ✅ FIXED 2026-06-11 (saveRunState on cell change)
`saveRunState(force)` has a 2.5 s throttle (`:1335-1339`) that only makes sense for per-frame
calls — but the only call sites are pause (`:3382`), quit (`:6576`), restore, and
pagehide/visibilitychange (`:6594-6595`). A hard process kill (mobile OOM, battery pull —
exactly the audience for "close the app and come back") loses everything since the last
pause, while the pause menu promises "YOUR RUN IS SAVED AUTOMATICALLY" (`:767`).
**Fix is one line:** call `saveRunState()` in `movePlayer()`'s `cellChanged` block — the
throttle already rate-limits it.

### A7 — `WEAPONS[].key` hotbar keybinds (vestigial, self-conflicting)
`:809-824` — `key:'4'` on both bow and stunbow, `'5'` on xbow/stunxbow/slayer. Selection
actually uses hotbar slot indexes 1–5 (`:5056`). Dead data.

### A8 — Fractional HP system (`P.hpFrac`)
Root cause of B5; half-built, never initialized in `initGame()`, not saved by `saveRunState`.

### A9 — `genMaze()` vestigial return
`:2445` returns `{exitR:-1,exitC:-1}`; ignored by `initGame()` (`:2914`) since exit placement
moved out. Cosmetic.

---

## 3. Dead code inventory (safe deletions)

| ID | What | Where |
|----|------|-------|
| D1 | duplicate `variant:` key in `makeEnemy` object literal (first one dead) | `:2662-2663` |
| D2 | `E.chargeTargetR/C` written, never read | `:2851` |
| D3 | `hideGrace` written 3×, never read | `:1000, 2907, 4567, 4736` |
| D4 | `E.playerStuckTimer` never used | `:2659` |
| D5 | `E.turnsChasing` only used inside unreachable FLANK (A3) | `:2659, 4011-4019` |
| D6 | `E.mineTimer` field + misleading "lays immediately" comment (Tactician uses `_tacLastMine`, stamped at INIT, so first mine is at ~10 s, not 0) | `:2672-2673` |
| D7 | `fireButtonHeld` written, never read (relic of fire-button defuse; header comment `:4708-4710` still says "hold attack… 5 seconds" — it's 2 s on E) | `:5169-5176` |
| D8 | global `stunTimer/stunMax` written in `stunEnemy` but HUD reads per-enemy values | `:994, 4680-4681` vs `:5304-5306` |
| D9 | duplicated CSS rule blocks: `.profile-add`, `.pc-form*`, `.profile-card`, `.pc-btn*` each defined twice (~60 dead lines) | `:297-336` vs `:325-354` |
| D10 | unused locals: `tierCfg` in `showOverlay` win path; `varLabels` in `initGame` | `:4955, 3273` |
| D11 | `drawSprite` `flipH` parameter never passed by any caller | `:2306` |
| D12 | `WEAPONS[].score` only feeds dead A3 AI | `:809-824` |
| D13 | default-profile filter expression duplicated 4× | `:1041, 1042, 1085, 2024` |

---

## 4. Performance & AI-robustness opportunities

### P1 — Enemy nav graph is nearly loop-free → 200+ tile "detours" ⭐ biggest gameplay lever
The loop passages that give the maze "multiple routes" are carved **1 tile wide**
(`:2395-2402`), so they widen only the *player's* graph. The enemies' 2×2 graph
(`wk2x2`) stays the raw backtracker **tree**. Measured in the harness (seed 30): player and
classic Minotaur 9 manhattan tiles apart, optimal 2×2 path **234 nodes** — ~2.5 minutes of
walking. To the player this reads as "the AI gave up / ran away."
Options (cheapest first): (a) when punching loop passages, make ~25% of them 2×2 openings;
(b) post-process: find long 2×2-graph detours between adjacent corridors and punch one wide
shortcut per region; (c) let enemies path size-1 with corner-slide (bigger change).
Secret doors (`:2961-2991`) already mitigate exactly this — consider scaling `doors` with
maze size, not just tier.

### P2 — `nearestValid2x2` ignores reachability → null paths, stalls, frozen hunters
`:2858-2876` ring-searches by manhattan only. Anchors inside the **vault** (wk2x2 interior,
1-wide entrance) or squeeze pockets are 2×2-disconnected; downstream `astar(...,2)` returns
null and the AI burns the fallback chain (`bestReachablePathToPlayer` = up to **8 more A\***
calls, `:2721-2742`). Terminal case: every anchor near the player unreachable → fallback
direct-step picks a `wk()` tile (`:3921-3933`) that `startEnemyMove` then rejects via its
`wk2x2` validation (`:4428`) → hunter freezes in place until the player moves. Fix: have the
ring search validate with a cheap component-id map (computed once per maze change).

### P3 — A\* is O(V²) and runs on the render path
The open set is a `Map` scanned linearly per pop (`:2491-2493`); V ≈ 5,829 at the 87×67 cap.
Worse: the status bar's `hasMineOnPath` (`:5539`) runs a **full player→exit A\* every frame**
whenever any enemy mine exists — i.e., precisely in late-game Tactician runs on the biggest
mazes. Fixes: binary-heap open set; cache the player→exit path and recompute only on player
cell change / grid change (the same cache serves `packTarget`'s WARDEN role `:2565` and
`getScentTarget`'s trajectory projection `:2775`).

### P4 — Full-maze redraw every frame — ✅ FIXED 2026-06-11 (camera-bounds culling)
`drawMaze()` (`:5600-5635`) paints all ROWS×COLS tiles (up to 5,829 × ~5 canvas ops) while
the viewport shows 21×15 = 315. Clamp the loops to
`[floor(camY/T) .. ceil((camY+vh)/T)]` × same for X: ~18× overdraw reduction at max maze
size, on every frame. Same culling applies to `drawItems`/`drawTraps`.

### P5 — Minor: `updateHUD`/backpack rebuild DOM per pickup (fine at scale), glitch grain up
to 320 fillRects/frame (acceptable), fog gradient is full-canvas per frame (acceptable).

---

## 5. Tech debt & documentation drift

| ID | Issue | Where |
|----|-------|-------|
| T1 | How-To drift: tier table says T3=2/T5=3 minotaurs (code: T3=2, T4=3, **T5=4**); "Points = currency" predates the gold/score split (`:1013`); shop cards label costs "PTS" while the meta row says GOLD; weapon slots "1–9" vs code 1–5; defuse header comment "5 seconds" vs 2000 ms; `updateMazeSize` size-step comment stale | `:704-709` vs `:1022-1026`; `:696-699`; `:4856`; `:600` vs `:5056`; `:4709` vs `:997`; `:794-795` |
| T2 | Monolith: one 6.2k-line file, shared mutable globals. Acknowledged constraint (no build system) — section banners help. The test harness already extracts the `<script>`, which is the seam a future bundler can use. | — |
| T3 | All localStorage writes are silently try/catch'd — quota failure = invisible progress loss. Surface one toast on save failure. | `:1061, 1301, 1361…` |
| T4 | Orphaned storage: deleting a profile leaves its `labyrinth_runsave_<id>` key and leaderboard entry behind | `:1877-1893` |
| T5 | ~40 hand-rolled click+touchend listener pairs; a `bindTap(el,fn)` helper removes ~150 lines and future drift | throughout UI code |
| T6 | Survival achievements only persist on WIN (`achSet('moveTime')` in the win branch only) — a 5-minute run that ends in death counts nothing. If intended, document; if not, mirror the call in the death path. | `:4969` |
| T7 | No achievements for dynamite/stunbow/stunxbow/slayer, yet they count toward the ARSENAL set (B4-adjacent) | `:1208-1216` |
| T8 | `loadProgress` legacy single-save migration only fires when `profiles.length===1 && totalRuns===0` — fine, but delete it once the install base has rolled over | `:1311-1327` |

---

## 6. Test coverage report

**Harness:** `tests/` — zero dependencies, Node ≥18. `node tests/runner.js` (≈3 s).
The game's inline script is evaluated in a `vm` context against stub DOM/canvas/storage with
a **virtual clock** and **seeded RNG**; tests drive the real `initGame/update/astar/...`.

**Important:** the brief referred to "existing smoke tests (smoke.js, variants_test.js)" —
**no test files existed in this project** before this audit. The names were honored:
`tests/smoke.js` and `tests/variants_test.js` now exist as described, built from scratch.

**Current results: 88 PASS · 0 FAIL · 0 KNOWN-BUG** — every audited bug is fixed; the former KNOWN-BUG tests now run as permanent regression guards.

Covered: boot & profile init · maze solvability (20 seeds) · idle sim with live AI ·
draw-path smoke · asset references · movement physics & wall containment · pause gate ·
A\* contracts (start-node inclusion, adjacency, 2×2 footprint, trap penalty) · economy math ·
perm-perk math · tier table · maze growth brackets · profile migration · hotbar/backpack ·
sell pro-rata · all 5 variant behaviors · mine trigger/stun · **full keyboard-driven
run-to-win** · 5-win meta progression (score curve, tier-up, maze growth) · death flow &
score floor · shop purchase lifecycle · exit detection · **mid-run save → process restart →
restore integrity** · corrupted-save fallback · meta save round-trip · clearProgress ·
per-profile run-save isolation · achievement thresholds/composites/persistence/popup.

**Gaps (not reachable headlessly, or not yet written):**
1. **Pixel correctness** — canvas is a no-op proxy; needs Playwright screenshot tests.
2. **Audio behavior** — crossfades, proximity gain, noisemaker loop (only *references* are tested).
3. **Touch input** — joystick math, multi-touch, fire/interact buttons, scroll-protection on shop cards.
4. **DOM UI flows** — shop/backpack/profile-form interactions (stubs don't parse innerHTML).
5. **Secret doors** — open/close cycle, blocked-close retry, Bruiser interplay (only incidentally exercised by idle sim).
6. **Slayer 3-hit kill, blink safety guarantee, vault loot distribution** — unit-testable, not yet written.
7. **Real-browser timing** — rAF throttling in background tabs, `visibilitychange` save trigger.
8. **Long-horizon fuzz** — hundreds of randomized runs watching for memory growth / state corruption.
