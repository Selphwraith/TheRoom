# THE LABYRINTH — Feature Pitches

Constraints honored: **no new art, no new audio** — game logic + DOM/canvas UI only.
Ranked by how much each changes the meta-loop relative to its balance risk.

---

## 1. Daily Gauntlet (seeded runs + shareable results)
**Meta-loop impact: ★★★★★ · Balance risk: low · Effort: ~2 days**

Replace `Math.random` with a seedable PRNG (the test harness already proves the entire game
runs deterministically under mulberry32 — see `tests/env.js`). A "⚔ DAILY" button on the
title screen runs everyone on the same date-derived seed: same maze, same variant
composition, same item/vault placement, same powerup spawns. Score posts to a separate
daily leaderboard slice (localStorage now; the existing leaderboard schema `:1146-1165`
already carries `ts`, so a `daily:'2026-06-11'` field is additive). Show a 3-line result
card (run time, score, deaths) the player can screenshot/copy.

**Design note.** The current loop is *self-referential* — you compete against your own high
score, and after tier 5 the difficulty curve flattens into repetition. A daily seed converts
the same content into *comparison and ritual*: one attempt (or best-of-3), everyone on the
same board, reset at midnight. It's the cheapest known retention mechanic in roguelites
(Spelunky/Slay-the-Spire dailies) and it requires zero new content — the maze generator IS
the content. Balance: run dailies at a **fixed tier (III) with a loaner loadout** (club +
one stash-free pick), ignoring the player's perm perks, so a level-40 account and a fresh
install compete on the same terms; meta progression stays untouched in the normal mode.
Implementation anchors: seed injection wraps `ri()`/`Math.random` (`:954`); date seed at
`initGame()`; disable `pendingPerks`/`permPerks` multipliers behind one `dailyMode` flag
read at the ~10 call sites that apply them.

---

## 2. Merchant Contracts (opt-in run modifiers for gold)
**Meta-loop impact: ★★★★ · Balance risk: medium, self-limiting · Effort: ~3 days**

At the shop, offer 2 of ~10 contracts alongside items. Each is a constraint or objective
checked with state the game already tracks, paying out gold (the bounded currency, `:1013`)
on the win screen:

| Contract | Checked with | Payout |
|---|---|---|
| "Pacifist" — win without stunning | `achProgress('stun_*')` hook in `stunEnemy` | ×1.6 gold |
| "Bomb disposal" — defuse 2 enemy mines | defuse completion (`:5377-5381`) | +120 |
| "Tomb raider" — enter the vault, then escape | `vaultRect` containment test on cell change | +150 |
| "Sprinter" — win under 90 s of `_runMoveTime` | existing counter (`:897`) | ×1.4 gold |
| "Darkness" — fog radius −2 this run | negative `fogBonus()` term | ×1.5 gold |
| "Loud" — carry no noisemaker, never stand still >3 s | `playerStillMs()` (`:2534`) | +100 |

**Design note.** The merchant is currently a *stat vendor* — optimal play is "buy Iron Skin
+ Fleet Foot, ignore the rest," and gold accumulates without decisions. Contracts make the
shop a **risk pricing screen**: you're selling difficulty back to the game at a rate you
choose. It deepens the meta-loop three ways: (1) gold income scales with skill rather than
grind, funding the expensive items (stunxbow at 1000) for mid-skill players; (2) it pulls
under-used systems — defuse, vault, stillness mechanics — into the optimal-play path;
(3) it adds run identity ("the pacifist run") without touching enemy stats, so tier balance
is untouched. Self-limiting risk: a failed contract pays nothing, and payouts are gold (run
items) rather than score (prestige/leaderboard), so the leaderboard meta can't be inflated.
Implementation: a `runContracts[]` array set in `openShop()`, evaluated in
`showOverlay('win')`; the listed hooks are all single-line taps into existing functions.

---

## 3. Ghost Replay (race your best run)
**Meta-loop impact: ★★★ · Balance risk: zero · Effort: ~1 day**

While playing, append `[t, r, c]` to a ring buffer on every cell change (the
`cellChanged` block in `movePlayer()` `:4288` already fires exactly once per tile — a
60-tile run is <1 KB of JSON). On a win, store it on the profile keyed by maze bracket. On
later runs *in the same bracket*, render the stored best run as a faint pulsing dot with a
fading 5-tile trail (pure `ctx.arc` — no art), interpolated with the same `lr()` lerp the
camera uses. Toggle in the pause menu.

**Design note.** This is a speedrun loop with zero balance surface: the ghost is
information, not power — it cannot fight, trigger mines, or be seen by enemies. Its meta
value is *self-comparison made visible*: the moment players can see "past me," win time
becomes a stat they care about, which the score system (+25/run flat) currently doesn't
reward. It also quietly teaches routing — new players watch their ghost take the corridor
they didn't know existed. Mazes differ per run, so the ghost is a pace-setter rather than a
line to trace (it shows *progress rate*, drawn at its own recorded position on its own
maze timeline — display its elapsed-time delta in the status bar rather than its literal
tile when the layouts diverge). Pairs multiplicatively with Feature 1: ghosts on a *daily
seed* ARE the same maze, making the daily a true time-trial race against yesterday's
winner. Storage cost is trivial; cap at one ghost per bracket per profile.

---

### Recommendation
Ship **1 + 3 together** (the PRNG seam built for the Daily makes ghost-on-same-maze work,
and both are balance-neutral), then **2** as the following update once daily telemetry shows
which contracts players actually pick.
