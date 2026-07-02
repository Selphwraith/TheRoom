# THE LABYRINTH — Game Mode Pitches

Unlockable alternate modes gated behind run/tier milestones. Constraints honored:
**no new art, no new audio** — every mode below reuses existing variants, AI, weapons,
and the warden's player model. Ranked by impact-to-effort, easiest seam first.

The contract every mode inherits from the Daily Gauntlet (Gotcha G15): **a mode changes
NOTHING outside its own leaderboard slice and its own run.** Add a `modeFlag` gate
wherever `dailyMode` already branches (`getTier()`, the `perm*()` functions, `saveRunState`,
`showOverlay`, gold/stash). Each mode gets a leaderboard slice via the additive `daily:'…'`
trick the schema (`:1146-1165`) already proves.

---

## 1. Ironman (one life, no resume)
**Meta-loop impact: ★★★ · Balance risk: low · Effort: ~2 days · Unlock: 10,000 highScore**

Death ends the run. No HP buffer beyond the run's natural pool, no mid-run resume.

**Design note.** Death already routes `killPlayer (:4744) → HP gate → phase='DEAD'`, so
Ironman is mostly a *subtraction* plus a gate. The point isn't harder numbers — it's a
**separate Ironman leaderboard slice** where every entry is a no-net run, which is its own
prestige. The single structural requirement: Ironman runs must be **non-resumable** — skip
`saveRunState()` entirely (pause-quit-resume would defeat the premise *and* hollow out the
slice). That's one early-return on the mode flag at the save site. Unlock is trivial:
`profile.highScore >= 10000` (changed 2026-06-14 from Tier 5 — all unlockable modes now gate on highScore, not tier).

**Why it ships first.** It builds the reusable plumbing every later mode needs: the mode
flag, the gate check at unlock, and the leaderboard-slice pattern. Lowest risk, proves the
seam.

Implementation anchors: mode flag beside `dailyMode`; gate at the title-screen mode picker
(`buildTitleScreen`); `saveRunState()` early-return; new `ironman:true` field on the
leaderboard write in `showOverlay('win')` (`:4954`) and on the death-screen score path.

---

## 2. Endless / Survival (no exit, escalating siege) — ✅ SHIPPED 2026-07-02 as ENDLESS SIEGE
**Meta-loop impact: ★★★★ · Balance risk: medium · Effort: ~4 days · Unlock: 15,000 highScore**

> Shipped parameters: tier-III arena (totalRuns=10 maze bracket), first wave at 60s then
> `max(30s, 75s − waves×5s)`, hunter cap 7, quicken tick every 30s (`moveDur ×0.94`,
> floor 45% of spawn value, late arrivals inherit accumulated quickens), weapon drop /60s
> and powerup drop /90s with compass-direction hints, camping >3s fast-forwards every
> director clock 2.5× with a warning toast, score = seconds survived, own board
> (`labyrinth_leaderboard_endless`, waves recorded). Full G15 isolation.
> Tests: `tests/endless_test.js`.

No exit exists. Score is time survived. Enemies are added over time, weapons drop one at a
time on a 60 s timer, and every enemy accelerates as the clock runs.

| Mechanic | Reuses | How |
|---|---|---|
| No win tile | `movePlayer` cell-change exit check (`:4312`) | mode flag suppresses the exit; death → score = survival time |
| Enemies speed up | `moveDur` / `moveDurMult` (`VARIANTS :2958`) | a global time-scalar multiplies `moveDur` downward on a clock |
| Spawn waves | `makeEnemy()` (`:2640/3023`) + `pickWardenVariants(count)` (`:1664`) | timed spawns; the warden picks *which* variant escalates in |
| One weapon / 60 s | `WEAPONS` floor spawns | a single timed drop instead of seeded placement |

**Design note.** The risk isn't difficulty — it's that optimal play collapses to "find one
defensible corner and never move." Two counters, both using existing state: (1) roaming
powerup/weapon drops that *pull* the player around the maze; (2) a **stationary-penalty
ramp** — the longer you hold one area, the faster the escalation scalar climbs (reuse
`_runStillTime` / `playerStillMs()` `:2534`), forcing relocation. The wave composition can
tell a story for free: a Classic at 0:00, a Scout added at 3:00, a Bruiser starts breaking
toward you at 5:00 — all `pickWardenVariants` already knows how to choose.

Implementation anchors: exit suppression behind the mode flag at `:4312`; escalation scalar
folded into `makeEnemy`'s `moveDur` line; spawn/weapon timers in `update(dt)` (`:5207`); a
survival end-screen path distinct from the win overlay (the whole tier/shop/level-up loop
hangs off the win screen, so Survival needs its own death→score route).

---

## 3. Hunter Mode (BE the minotaur, hunt hyper-human prey)
**Meta-loop impact: ★★★★★ · Balance risk: HIGH (unproven) · Effort: ~2-3 wks · Unlock: highScore ladder (5k→25k)**

You play a minotaur. Pick a class (classic / scout / bruiser / tactician / blind one),
hunt AI-controlled prey across tiers. **Win:** catch all prey. **Lose:** any prey escapes
through the exit, or prey kills you with the slayer relic. You start slow (as minotaurs do)
and speed up per tier; the prey starts dumb and scales toward *hyper-human*.

### What already exists (the reason this is even feasible)

The five classes are already built as the enemy AI variants (`VARIANTS :2958`,
`minotaurAI :3529`), with the exact mechanics the mode wants:

| Class | Built as | Already does |
|---|---|---|
| Classic minotaur | `classic` | club; intercept-predicts the target's A\* path |
| Scout | `scout` | fast (0.72× move), innate crossbow, half-dmg, longest sight |
| Bruiser | `bruiser` | slow (1.35×), breaks walls (`beginCharge :2848`) |
| Tactician | `tactician` | lays a mine every 10 s on the target's escape path |
| The Blind One | `blind` | infinite hearing of tile crossings, deaf to stillness, wall-phase |

- **Sixth sense / scent** = the existing scent lock: sight locks scent, then intercept-predict
  along the target's real A\* trajectory (`getScentTarget :2756`). "Scent activates once you
  spot them" is *already the rule*.
- **The slayer** already exists (`:828`): a 3-charge relic, 3 hits on one minotaur =
  permanent kill, with `_slayerHits` tracked through save/restore (`:1473/1564`). This IS
  the "prey can kill you" hook.
- **The asymmetry is a gift:** the minotaur is a 2×2 footprint and physically **cannot enter
  the 1-wide squeeze gaps / loop passages the prey escapes through** (Gotcha G6). The
  Bruiser's wall-break is the built-in counter — instant class identity.

### The one system that does NOT exist — the entire cost center: **prey AI**

Today the prey is the human. Hunter Mode needs an AI prey that:

1. **Routes** key → exit. Nearly free: `astar` exists, and the engine *already* computes the
   player→exit path for the WARDEN role, so the escape route is sitting there.
2. **Flees** along an avoid-weighted path. Reuses `astar`'s `avoidSet` + a cost penalty on
   the minotaur's *predicted* intercept cells (the same `getScentTarget` math, inverted).
3. **Detours for powerups/weapons** by threat-distance valuation (speed when you're far,
   shadow when you're close). ← actual design work.
4. **Flips flee → hunt** on grabbing the slayer, risk-pricing the kill (stalk a slow
   Bruiser-you, run from a fast Scout-you). ← actual design work.

### Hyper-human prey = tier-scaled competence × warden-flavored style

Per the design call: prey mirrors the Warden. **The Warden fingerprint sets the *flavor*;
the tier sets the *competence*.**

- The warden already stores how *this profile's human* plays (`profile.warden`, EMA-folded
  by `foldWardenStats()`, Gotcha G17). Inverted, the prey escapes the way you escape — a
  sprinter profile breeds bolting prey, a statue profile breeds prey that freezes to shake
  scent. You hunt a ghost of your own habits.
- **Competence scales with tier**, NOT flat:
  - *Early tiers:* greedy routing, ignores squeeze gaps, no scent-modeling, fumbles the slayer. Catchable.
  - *Late tiers:* juke-routes through the gaps you can't follow, deliberately breaks LOS to
    drop your scent, **stops moving against the Blind One** (the taught counter, howto `:724`),
    hunts you with the slayer. Plays the profile's human ghost.
- **You** scale the mirror way: start slow (`moveDurMult > 1`), faster per tier; multi-prey
  "several tiers down" via the spawning that already handles N actors.

### The balance risk — read this before building anything

**A flawless hyper-human prey is uncatchable** (the squeeze-gap asymmetry guarantees escape).
So hyper-human must be the *ceiling*, reached late, never the floor. The *catch* against
smart prey has to come from: (a) your prediction camping the key/exit chokepoints, (b)
multi-prey forced to converge on shared chokepoints, (c) tier-scaled prey mistakes. **That
chokepoint-camping vs. gap-juking tension is the whole skill ceiling — and it's unproven.**

**De-risk first, render later.** Before any UI work, build a headless catch-rate sim in the
existing harness (`tests/env.js` — seeded RNG, virtual clock, stub canvas, built for exactly
this): smart-prey vs. tier, measure catch-rate, find the winnable-but-sweaty band. If it
can't be tuned winnable, the mode's premise changes before a pixel is drawn.

### The Blind One as a *playable* class — defer to v1.1

All-fog + glowing wall-lines + a minimap (moving prey = outline, still prey = pulsing
circle) is a custom fog-canvas render mode. The fog canvas already hosts the compass and
mine-markers (`:5564`, Gotcha G13), so there's precedent — but it's the most expensive of
the five. **Ship Hunter v1 with classic / scout / bruiser, single prey.** Add Blind One +
Tactician + multi-prey in v1.1.

### Unlock & scoring
- **Unlock — a per-profile `highScore` ladder, NOT a win-count.** `highScore` is the
  monotonic peak cumulative score (`:5358`, persisted per profile, shown as "BEST:");
  dailies don't count (they skip all progression, `:5615`). Per-win earning is
  `150 + priorWins×25`, so the cumulative curve makes these gates equivalent to roughly the
  win counts shown. **Hunter Mode itself opens at 25k; each +5k unlocks one more playable
  class**, accessible→advanced (this order also mirrors the build phases below — the Blind
  One is the most complex, so it's the rarest, last unlock):

  | highScore | Unlocks |
  |---|---|
  | 5,000 | Hunter Mode + **Classic Minotaur** |
  | 10,000 | **Scout** (also unlocks Ironman) |
  | 15,000 | **Bruiser** |
  | 20,000 | **Tactician** |
  | 25,000 | **Blind One** |

  (Lowered 2026-06-14 from the original 25k→45k ladder — the old gate was effectively
  unreachable. `preySkill` spans 5k→25k, so prey is dim at the 5k entry and razor-sharp
  by the full-roster 25k.)

  Implementation: a single `hunterClassesUnlocked(highScore)` helper returns the class list;
  the mode picker and class-select screen read it. Add the `dailyMode` no-op gate (G15) so a
  daily can never bump the ladder.
- **Scoring:** own leaderboard slice (`hunter:'…'`), prey-caught + tier reached.

Implementation anchors: new prey actor type (own update path, NOT `minotaurAI`); player-as-
minotaur driven by the existing input → reuse `VARIANTS` stats for the player's class;
win/lose inversion at the exit check (`:4312`) and `killPlayer` (`:4744`); prey routing via
`astar (:2480)` + inverted `getScentTarget (:2756)`; competence dial keyed off `getTier()`;
flavor keyed off `profile.warden`.

---

### Recommended build order
1. **Ironman** — builds the mode-flag + leaderboard-slice seam every later mode reuses.
2. **Endless** — builds time-based escalation (the speed scalar Hunter's tier-ramp also wants).
3. **Hunter v1** (classic/scout/bruiser, single prey) — gated behind a headless catch-rate
   prototype. Then **v1.1**: Blind One + Tactician + multi-prey.

This sequences the engineering as much as the content: each mode hands the next a tested seam.
