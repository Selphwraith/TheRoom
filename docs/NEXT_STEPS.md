# THE LABYRINTH — What To Touch Next

Ordered by (player pain × fix cost). IDs reference `AUDIT.md`. After each fix, run
`node tests/runner.js` — the five KNOWN-BUG tests flip to `FIXED?` automatically when their
bug is repaired, so the suite tells you when you're done.

## P0 — ✅ shipped 2026-06-11 (all six landed, suite green: 54 PASS / 2 KNOWN-BUG)

1. ✅ **A6 — periodic autosave.** `saveRunState()` now called from `movePlayer()`'s
   `cellChanged` block (throttled internally to one write per 2.5 s).
   Test: `save_restore.test.js :: autosave`.
2. ✅ **B11 — minotaur hit sound.** File renamed `minotaur_hit.mp3` → `hit_minotaur.mp3`.
   Test: `assets.test.js`.
3. ✅ **B1 — defuse toast button.** `holdFire` → `holdKey`; stale "5 seconds / fire button"
   header comment also corrected. Test: `smoke.js :: defuse prompt`.
4. ✅ **B4 — ARSENAL achievement.** New `ARSENAL_TYPES` const (the canonical 7; exotics
   excluded); pickup now does `achSet('weaponRunSet', held∩canonical)`. COLLECTOR composite
   reuses the same list. Test: `achievements.test.js :: ARSENAL`.
5. ✅ **B6 — trap-type filter in `startEnemyMove`.** Footprint check now requires
   `t.def===WEAPONS.mine`. Test: `variants_test.js :: noisemaker`.
6. ✅ **B12 — stun xbow copy.** Confirmed design is 10 shots; shop card no longer says
   "Infinite". Test: `core_unit.test.js :: stun xbow shop copy`.

## P1 — next sprint (a day-ish each)

7. ✅ **B5 — scout half damage.** SHIPPED 2026-06-11: fractional accrual only, full HP
   deducted per whole unit; projectiles now carry the shooter's `dmg`, and `hpFrac`
   rides the run save. Tests: `variants_test.js` (two).
8. ✅ **B7 — save all player traps + fuses.** SHIPPED 2026-06-11: all trap kinds
   round-trip with noisemaker ring time and dynamite fuse progress/direction.
   Test: `save_restore.test.js`.
9. **P3 — A\* off the render path.** Cache the player→exit path, recompute on player cell
   change / `invalidateFloorCache()`; use it for the status bar (`:5539`), `packTarget`
   WARDEN (`:2565`), and `getScentTarget` projection. Then swap the open-set Map scan
   (`:2491`) for a binary heap. Biggest CPU win on late-game mazes.
10. ✅ **P4 — viewport culling.** SHIPPED 2026-06-11: `drawMaze` clamps to camera
    bounds (+1 tile shake pad); items, traps, powerups and enemies skip offscreen
    draws via `onScreen()`. ~18× overdraw cut at the 87×67 cap.
11. **B2, B3, B8, B9** — four small correctness fixes: defuse ring uses `defuseNeeded`
    (`:5761`); `_runMoveTime += dt/1000` (`:4259`); move achievement call below the alive
    guard in `stunEnemy` (`:4666`); after `restoreRun` re-seals doors, relocate the player
    if `!wk(P.r,P.c)`.

## P2 — design-level (plan before coding)

12. ✅ **P1 (audit) — widen the enemy nav graph.** SHIPPED 2026-06-11: wide loop
    breaches in genMaze + `repairEnemyGraph()` healing vault-caused splits + doors
    scaling with maze size. Median detour ratio measured 26× → ≤6×. **Watch live
    difficulty:** hunters now arrive much faster; if tier feel spikes, soften
    `TIERS[n].moveDur` slightly.
13. ✅ **P2 (audit) — reachability-aware `nearestValid2x2`.** SHIPPED 2026-06-11:
    `comp2x2` component map (enemy semantics), component-filtered anchor picks,
    camp-the-entrance fallback, dominant-component enemy spawns.
14. **Dead code sweep** — A1 (aim mode), A2 (legacy joystick tick), A3 (armed-AI block +
    flags + `WEAPONS[].score`), D1-D13, duplicate CSS (D9). ~350 lines lighter, zero risk;
    do it *after* the P0/P1 fixes so diffs stay reviewable.
15. ✅ **T1 — How-To/UI copy pass.** SHIPPED 2026-06-11: tier table corrected
    (T4=3/T5=4 + ASCENSION row), gold/score split documented, shop costs labeled 💰
    everywhere, slots 1–5, autosave copy, new "THE NEW RITES" section covering sealed
    doors / Warden / Daily / pace ghost, and the "COMING SOON" profile stub replaced
    with honest labels.

## P3 — features (see FEATURES.md)

16. ✅ Daily Gauntlet — SHIPPED 2026-06-11 (date-seeded maze, tier III lock, loaner
    loadout, one attempt/day, zero progression impact). The `_rand` seam also makes
    bug repros deterministic.
17. ✅ Ghost replay — SHIPPED 2026-06-11 as the **pace ghost** (per-bracket best-time
    👻 split in the status bar) rather than a literal dot: mazes differ per run, so a
    drawn ghost would walk through walls. A literal replay dot remains a natural
    follow-up for dailies once multi-day daily history exists.
18. Merchant contracts — still open, next in line.
19. NEW (shipped beyond the original list): The Warden Remembers (adaptive enemy
    composition), keyed exits, run stats + share strings, Ascension modifiers (tier 6+).

## Field fixes — ✅ shipped 2026-06-11 (playtest report, tests in roadmap.test.js)

- Viewport grows toward a square (21×21 cap) on tall/narrow screens — fog radius
  no longer clipped top/bottom with Lantern/Clarity/torch stacks.
- Quit-to-title left touch controls disabled for every subsequently started run
  (read as "the game froze", first noticed entering the Daily) — `initGame` now
  re-enables; the render loop also survives thrown frames instead of dying.
- Blind One vs vault: component-aware targeting had silently disabled his
  wall-phase; restored with raw sound anchors + stalk-to-wall-then-attune, and
  vault-looting footsteps no longer reset his 5s charge.
- Minotaurs can no longer spawn inside the treasure vault (explicit exclusion
  on both spawn filters, on top of the dominant-component rule).

## v1.0.1 hotfix — ✅ shipped 2026-06-12 (post-launch player reports)

- **Perpetual shake/static after a Slayer clear:** with every hunter dead,
  `nearestEnemy()` returns null and `update()` skipped the whole rumble/glitch
  block — including decay — freezing the dread effects at whatever intensity the
  final kill happened at. New else-branch decays both when no hunters live.
  Test: `roadmap.test.js :: LAUNCH FIX dread decays`.
- **Profile form "LEAVE BLANK FOR NOW":** leftover platform-login stub copy.
  Second field is now "PLAYER NAME (OPTIONAL — shown on the leaderboard)",
  placeholder "DEFAULTS TO HERO NAME" (which is what it always did).
  Test: `roadmap.test.js :: LAUNCH FIX profile form`.
- **Profile form simplified to a single name field:** the old form had HERO NAME
  + an optional PLAYER NAME (leftover from the abandoned platform-login plan,
  hence the "leave blank" placeholder). For a local single-player game two name
  fields is confusing — collapsed to one "NAME" field (16 chars) used as both
  profile and leaderboard identity. Leaderboard now hides the redundant second
  line for single-name profiles while still showing both for legacy two-name
  saves. Tests: `roadmap.test.js :: LAUNCH FIX` (form / identity / leaderboard).
- Versions: desktop 1.0.1, Android versionCode 2 / versionName 1.0.1 (artifacts
  rebuilt in place — 1.0.1 was never published, so no version bump needed).

## Testing backlog (coverage gaps from AUDIT §6)

- Secret-door runtime cycle (open → blocked-close retry → reseal) — headless-testable today.
- Slayer 3-hit kill; blink min-distance guarantee; vault loot distribution histogram.
- Browser-level smoke (Playwright): screenshot of first frame, joystick touch path,
  shop scroll-vs-tap guard, background-tab save trigger.
- Fuzz: 200 seeded idle runs watching heap and `traps/items/projectiles` array growth.
