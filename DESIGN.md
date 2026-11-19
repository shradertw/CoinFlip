# Coin incremental game — design

Working title. A Cookie Clicker-style incremental game built on coin-flip guessing. Lives at the repo root; the streak simulator moves to `/sim/`.

Status: draft for review. Numbers below are starting points for balancing, not final values.

---

## 1. Research basis

| Source | Takeaway for this game |
|---|---|
| Alharthi et al., *Playing to Wait: A Taxonomy of Idle Games* (CHI 2018) — https://doi.org/10.1145/3173574.3174195 | Idle games shift players from playing to planning. Interaction should taper as automation grows. |
| Alharthi et al., designer interviews (2020) — https://par.nsf.gov/servlets/purl/10174274 | Designers' own reasoning on pacing, rewards, and interaction. Worth a full read before balancing. |
| Deterding, *Cookie Clicker: Gamification* — https://eprints.whiterose.ac.uk/146788/ | The core arc is compound interest: returns on capital outpace returns on labor. Guessing = labor, coin upgrades and generators = capital. |
| Quantic Foundry / Nick Yee, *The Surprising Profile of Idle Clicker Gamers* — https://gamedeveloper.com/business/the-surprising-profile-of-idle-clicker-gamers | Players are driven most by Completion and Power. Achievements and visible growth matter. |
| Pecorella, *The Math of Idle Games* I–III — https://gamedeveloper.com/design/the-math-of-idle-games-part-i | Exponential costs vs linear production, generator balancing, prestige cycles. Spreadsheets available from the GDC talk. |
| Kongregate, *A Brief Look at the Idle Games Genre* — https://blog.kongregate.com/idle-games | Better prestige loops vary gameplay each reset instead of only speeding it up. |

## 2. Core idea

A fair coin can't be beaten by guessing. The only way to win more is to change the coin. The game is built around that: streak-chasing and gut feelings never help; upgrades that bias the coin do. The gambler's fallacy is the lesson, taught through the economy instead of text.

## 3. Core loop

1. Pick H or T.
2. Flip.
3. Correct → earn chips × combo multiplier. Wrong → combo resets.
4. Spend chips on upgrades and helpers.
5. Helpers guess automatically → chips per second.
6. Eventually, mint a new coin (prestige) for permanent bonuses and a new coin variant.

### Payout

```
payout = basePayout × comboMult × globalMult
comboMult = 1 + comboStep × combo        (combo = consecutive correct guesses)
```

Start: `basePayout = 1`, `comboStep = 0.25`. Linear combo keeps a lucky run exciting without breaking the economy. An exponential combo (2^combo) is tempting but makes income mostly luck — rejected for v1.

## 4. Coin upgrades (capital)

The key system. Each one changes the coin's odds, using the same switch-probability model as the simulator (`a` = chance to swap away from H, `b` = from T).

| Upgrade | Effect | Exploited by |
|---|---|---|
| Sticky | Lowers swap chance (step weight). 50% → toward 25% over levels. | Guessing "same as last" |
| Lean | Biases toward heads (face weight). 50% → toward 70%. | Guessing heads every time |
| Edge | Small chance the coin lands on edge; any guess pays 10×. | Pure luck bonus |

Design note: Lean alone makes the game trivial ("always tap H"). Sticky requires watching the last flip, so it rewards attention. Lean should be capped low or locked behind a prestige.

## 5. Helpers (generators)

Helpers guess on their own coins. Each has a rate and a strategy.

| Helper | Base cost | Flips/sec | Strategy |
|---|---|---|---|
| Intern | 15 | 0.5 | Random |
| Croupier | 100 | 2 | Copies last flip |
| Bookie | 1,100 | 10 | Copies last flip |
| Casino | 12,000 | 50 | Best strategy for current coin |

```
cost(n) = baseCost × 1.15^n              (n = number owned)
chipsPerSec = Σ owned × rate × P(correct | strategy, coin) × payout
```

`P(correct)` comes from the coin model: random = 50%; copy-last on a coin with swap chance `s` = `1 − s`. So helpers only get better than chance once Sticky is bought. This ties the two systems together.

Joke helper, unlockable: **Gambler** — bets against the current streak. Exactly 50% on a fair coin, worse on a sticky one. Teaches the fallacy without a word.

## 6. Prestige: mint a new coin

- Requires a lifetime-chip threshold.
- Grants Mint marks = `floor(sqrt(lifetimeChips / 1e6))`. Each mark = +2% global payout, permanent.
- Each mint lets the player choose the next coin variant, so runs play differently:
  - Standard (H/T)
  - Three-faced (H/T/Edge, larger edge chance)
  - Loaded pair (two coins flip together; guess the pair)
  - Memory coin (swap chance depends on the last two flips)
- Target: first mint around 15–20 minutes of active play (rough target; one indie devlog suggests shorter first loops retain better — weak evidence, to verify by playtesting).

## 7. Records (achievements)

Completion is a top motivator. Records reuse the simulator's step-based streak engine.

- Streaks: heads/tails/swap streaks of 5, 8, 12, 16 steps.
- Guessing: combo of 5, 10, 15.
- Economy: chip milestones, helpers owned, mints.
- Each record: +1% global payout.

## 8. UI

Terse, Mario 1-1 style. No explanatory sentences; numbers and layout do the teaching.

- Top: chips, chips/sec.
- Center: coin. H and T buttons below it (or tap left/right half of coin — to test).
- Combo shown as `×1.75` near the coin; flashes on reset.
- Bottom tabs: Flip · Shop · Mint · Records · Stats.
- Shop items unlock visually (greyed until affordable at ~50% cost) instead of a tutorial.
- Stats tab: reuse sim charts for the player's own flips.

## 9. Architecture

Plain HTML/CSS/JS, no build step, GitHub Pages.

```
/                 game
/sim/             streak simulator (current app)
/shared/engine.js streak + coin model (extracted from sim/app.js)
```

Modules (game):

| Module | Responsibility |
|---|---|
| `engine.js` (shared) | Coin model (`a`, `b`), flip, step/streak tracking, expected values |
| `state.js` | Game state object, save/load, migration by version number |
| `economy.js` | Costs, payouts, chips/sec, prestige math |
| `helpers.js` | Helper ticking; batch resolution at high rates |
| `records.js` | Achievement checks fed by engine events |
| `ui.js` | Rendering, tabs, number formatting (1.23e15 / suffixes) |
| `main.js` | Tick loop, wiring |

Data flow per tick:

```
rAF(dt) → helpers.tick(dt) → engine flips → economy.credit()
       → records.check(events) → state.save (every 10 s) → ui.render (throttled)
```

High-rate helpers: above ~1,000 flips per tick, resolve in bulk — `correct ≈ Binomial(n, p)` via normal approximation — and skip per-flip streak tracking (streak records come from manual and low-rate flips).

Save: `localStorage` autosave every 10 s, plus export/import as a text string. Note: unlike the simulator, an incremental game needs saves to work at all.

Offline progress: on load, `elapsed × chipsPerSec × 0.5`, capped at 8 hours.

## 10. Build phases

1. **MVP:** manual guessing, combo, Sticky upgrade, 2 helpers, save/load. Playable in one session.
2. Remaining helpers, Lean/Edge, number formatting, offline progress.
3. Mint (prestige) with 2 coin variants.
4. Records.
5. Stats tab with sim charts; remaining variants.

## 11. Balancing approach

- Node script that simulates a player buying the cheapest-payback item each step; outputs time to each helper and to first mint.
- Tune `1.15` cost growth, base costs, and mint threshold until the curve hits the pacing targets.
- Playtest on phone; note where progress stalls.

## 12. Risks and trade-offs

- **Luck feels arbitrary.** Early income depends on guesses at 50%. Mitigation: low combo step, helpers arrive quickly.
- **Lean trivializes play.** Cap or gate it.
- **Balancing dominates the work.** Most idle-game devlogs report this. Budget for it.
- **Big numbers.** Need formatting from the start.
- **Theme vs lesson.** Casino theme fits the gambler's fallacy but could read as promoting gambling. Alternative: neutral "mint/workshop" theme.

## 13. Open questions

- Currency name (chips? marks? luck?).
- Theme: casino, mint/workshop, or abstract.
- Guess input: two buttons vs tapping coin halves.
- Should manual guessing stay relevant late game (e.g., combo multiplies helper output)?
