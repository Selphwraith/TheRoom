# THE LABYRINTH — Systems Checklist

Status legend: ✅ solid (tested) · ⚠ works, has known issues (AUDIT id) · 🔧 dead/abandoned code present
Line numbers refer to `labyrinth.html`.

## Weapons (defs `:808-825`)

| Weapon | Kind | Stun | Status |
|---|---|---|---|
| Knife | melee 1.5t | 1.4 s | ✅ |
| Club | melee 1.5t (innate start) | 2.0 s | ✅ |
| Torch | AoE 2.5t, +2 fog while held | 2.4 s | ✅ |
| Bow | projectile 13t | 3.2 s | ✅ |
| Crossbow | projectile 16t | 5.0 s | ✅ |
| Stun Bow | 3 shots, 3 s reload | 6.0 s | ✅ shots persist via stash |
| Stun Xbow | 10 shots, 2.5 s reload | 6.0 s | ✅ (B12 fixed — shop copy now says 10 shots) |
| Slayer | vault relic, 3 charges; 3 marks on one enemy = permanent kill + gold hoard | 1.2 s/hit | ✅ logic `:4643` (no achievement — T7) |
| Mine | placed, camouflageable | 6.0 s | ✅ heavily tested |
| Noisemaker | 5 s lure for Blind One | — | ✅ (B6+B7 fixed — survives saves with ring time intact) |
| Dynamite | 2 s fuse, 3×2 directional wall blast | 3 s near blast | ✅ (B7 fixed — fuse progress and direction round-trip) |
| Pickaxe | tool (shop 200 / vault), hold-E dig 2.5 s, one run | — | ✅ |
| Gold piles | 10–500, weighted steps | — | ✅ `goldAmount :867` |

Supporting: hotbar 5 slots + derived backpack ✅ (`:3373-3485`), auto-refill on consume ✅,
stash banking on win (cap 10, club excluded) ✅, stash sell with pro-rata for partial shot
pools ✅ (`:4901-4924`), loadout picks max 2 ✅.

## Enemies (`VARIANTS :2575`)

| Variant | Gimmick | Status |
|---|---|---|
| Classic | scent + intercept prediction + pack roles (CLOSER/CUTTER/WARDEN) | ✅ tested; ⚠ can freeze vs 2×2-disconnected pockets (P2) |
| Bruiser | slow, charges through walls (Bresenham carve, max 16 steps) | ✅ tested |
| Scout | fast, innate xbow, 2 s reload, half damage (melee AND arrows) | ✅ (B5 fixed — fractional HP accounting, projectiles carry dmg) |
| Blind One | map-wide hearing of tile crossings; deaf to stillness; wall-phase after 5 s attunement (10 s cd) | ✅ tested incl. noisemaker override |
| Tactician | ignores player; 10 s mine cadence, seal-line scoring near exit; dynamite wedge when stuck; hunts after 15 mines | ✅ tested; commute can be minutes on big mazes (P1) |

Shared: 2×2 footprint movement ✅ · stun system with per-enemy timers ✅ · secret doors
(open on contact, auto-close 2.2 s, blocked-close retry) — untested headlessly ·
catch = 4-corner pixel check `catchR=0.8T` ✅ (implicitly) · shooting on LOS ✅ (scout).
🔧 Dead: EQUIP/MINE_PLACE/FLANK legacy AI (A3), `canPickupWeapons` flags, `WEAPONS[].score`.

## Player mechanics

| System | Where | Status |
|---|---|---|
| Continuous movement, per-axis wall slide | `movePlayer :4227` | ✅ tested |
| Joystick (analog, dead zone 0.22) | `:5095` | ✅ live path; 🔧 A2 dead legacy tick |
| Fire (weapons only) | `playerFire :4455` | ✅ |
| Interact: defuse → dig → camouflage | `playerInteract :4540` | ✅ (B1+B2 fixed — toast says HOLD E, ring shares `defuseNeededMs()`) |
| Mine camouflage (2 s hold, resets on release) | `:5316-5360` | ✅ A* treats hidden mines as floor |
| Defuse (2 s hold, cancel on move) | `:5362-5383` | ✅ |
| Pickaxe dig (2.5 s hold) | `:5384-5411` | ✅ |
| HP / half-pip display | `updateHealthHUD :3345` | ✅ ; ⚠ B5 hpFrac |
| Invincibility frames (1-1.2 s post-hit) | `:4759-4773` | ✅ |

## Power-ups (`:877-892`)

Haste 5 s ×2 speed ✅ · Ward +1 HP (1/run spawn) ✅ · Shadow 7 s scent-wipe ✅ (blocks
catch, shoot, retarget; Blind One immune by design) · Blink safe-teleport ✅ (≥6 tiles from
enemies) · Aegis rare (30%/run): +1 HP + haste ✅.

## Meta-loop

| System | Status |
|---|---|
| Score (prestige): +150 +25/win, −50 death, floor 0 | ✅ tested exact curve |
| Gold (currency, split from score) | ✅ migration tested; T1 UI labels still say "PTS" |
| Tier I-V every 5 wins (speed/reaction/count/doors) | ✅ tested |
| Maze growth every 5 wins → 87×67 cap | ✅ tested |
| Shop: 11 items, one-run perks | ✅ purchase lifecycle tested |
| Perm perks: 7 defs, level-up every 3 wins, stack caps | ✅ math tested |
| Profiles: 3 free slots, per-profile everything except achievements | ✅ ; A5 "unlock more" stub; T4 orphaned keys on delete |
| Achievements: 40 defs in 6 categories, global | ✅ thresholds/composites/popup tested, B4 ARSENAL + B8 pre-guard count fixed; T6 survival only on win |
| Leaderboard: top-20 stored / top-10 shown, best per profile | ✅ names escaped at render (B13) |
| Mid-run save/restore (per profile) | ✅ round-trip tested, autosaves on cell change (A6), all trap kinds + hpFrac saved (B7), entombed player relocated (B9) |
| Treasure vault (sealed room, rich loot, slayer 5%) | ✅ generation; loot distribution untested |
| Secret doors (tier-count, long-detour placement) | generation ✅; runtime cycle untested |

## Roadmap systems (shipped 2026-06-11, all tested in `tests/roadmap.test.js`)

| System | Behaviour | Status |
|---|---|---|
| Relentless AI | wide 2×2 loop breaches in genMaze; `repairEnemyGraph()` heals vault-caused graph splits (1-thick pair + 2×2 block punches, vault ring protected); `comp2x2` component map (enemy semantics, cached); component-aware `nearestValid2x2`; camp-the-entrance fallback; dominant-component enemy spawns | ✅ median detour ratio ≤6× (was 26×) |
| The Warden Remembers | per-profile EMA fingerprint (mines/stuns/defuses/still/move/fast, decay 0.85); `wardenWeights()` counters the player's habits; run-start "THE LABYRINTH REMEMBERS…" toast; neutral in dailies and under 2 runs of history | ✅ |
| Keyed exits | ~30% of runs after 2 wins; key far from spawn+exit or inside the vault (40% when one exists); "THIS DOOR IS SEALED AND REQUIRES A KEY"; SEALED 🔒 render; FIND THE KEY status; lock+key survive suspend/restore | ✅ |
| Run stats + share | win/death overlays show ⏱ time, ⭐ stuns, 🗺 tiles-from-exit (death); `_shareText` + 📋 COPY RUN via clipboard with graceful fallback | ✅ |
| Daily Gauntlet | date-seeded generation (identical maze for everyone), tier locked III, perm/shop perks neutralized, loaner club+bow, gold stays in the gauntlet, one attempt burned at start, no suspends, zero progression impact, result + share on finish | ✅ |
| Pace ghost | per-bracket best clear time on profile (`ghosts`), 👻 ±s split in status bar, NEW BEST PACE toast, neutral on restore and in dailies | ✅ |
| Ascension (tier 6+) | at ≥25 wins on tier V, rotating per-run modifier (`totalRuns % 5`): FADING LIGHT, VEILED MINES, TWIN WARDENS, SWIFT DEATH, SEALED EXIT; banner toast, status icon, share line; never in dailies | ✅ |

## Game modes (all isolated per G15 — own leaderboard slice, zero profile impact)

| Mode | Unlock (highScore) | Status |
|---|---|---|
| Daily Gauntlet | always | ✅ tested (roadmap.test.js); quit now resets dailyMode |
| Hunter Mode | 5k–25k class ladder | ✅ tested (hunter_test.js); shadow gear + Ascension gate fixed 2026-07-02 |
| Ironman | 10,000 | ✅ tested (ironman_test.js); quit no longer leaves a resumable save |
| Endless Siege | 15,000 | ✅ SHIPPED 2026-07-02, tested (endless_test.js) — no exit, waves, quickens, drops, camping penalty |

## Presentation (untestable headlessly — verify in browser)

Fog of war + bonuses · proximity rumble + glitch (chromatic/scanline/grain) · hit flash ·
camera lerp + clamp · tier wall palettes · sprite system with drawn fallbacks (4×4 sheets)
· weapon-specific player sheets · Hunter's Eye compass · Sixth Sense mine glow ·
achievement popup queue (logic ✅) · WebAudio: music crossfade, proximity loop, step
round-robin, map-wide smash falloff — ✅ B11 fixed (file renamed; every referenced asset now ships).

🔧 Dead presentation: mouse aim mode + cursor + aim line (A1), 8-direction sprite comments
(A4), duplicated profile-card CSS (D9).
