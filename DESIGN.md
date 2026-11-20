# Call It — design

Working title. A Cookie Clicker-style incremental game built on coin-flip calls. Lives at the repo root; the streak simulator moves to `/sim/`.

Status: MVP built. Numbers are starting points for balancing.

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

Call it, flip, get paid. A fair coin can't be beaten by guessing, so every outcome pays something and progress comes from upgrades. No opponents or combat (possible later layer).

Hit/miss is itself a fair coin, so both outcomes stream and both pay off:

- **Hit:** `payout = value × momentum × potential`. Momentum +1. Potential resets.
- **Miss:** `payout = value × missPay`. Potential +1. Momentum resets.
- **Coin streaks:** when the coin's own run of identical steps reaches 2+, it pays `value × runBonus × runLength`, regardless of the call.

```
momentum mult  = 1 + momStep × consecutiveHits
potential mult = 1 + potStep × consecutiveMisses
```

A hot streak pays along the way. A cold streak pays all at once when it breaks.

Currency: $ only.

## 3. Upgrades (MVP)

| Group | Upgrade | Effect per level | Base cost | Growth |
|---|---|---|---|---|
| Call | Value | +$1 base payout | 10 | ×1.55 |
| Call | Momentum | momStep 0.20 → +0.10 | 25 | ×1.65 |
| Call | Potential | potStep 0.30 → +0.15 | 25 | ×1.65 |
| Call | Miss pay | +10% of value on miss (max 90%) | 15 | ×1.6 |
| Coin | Sticky | swap chance 50% → −3% (max 10 levels) | 100 | ×2.0 |
| Streaks | Heads / Tails / Swap run | +0.5 × value per run step | 40 | ×1.7 |
| Auto | Auto call | calls every 4 s, ×0.85 per level | 50 | ×1.8 |
| Auto | Copy last | auto calls the last face (one-time) | 300 | — |

`cost = base × growth^level`. Items appear once lifetime earnings reach half their base cost.

Sticky is the only way to beat 50%: calling the last face wins `1 − swap` of the time. Copy last lets the auto caller exploit it.

## 4. Later layers

- **Prestige:** mint a new coin. Reset for a permanent multiplier; each mint offers a coin variant (three-faced, memory coin, paired coins).
- **Records:** streak and call milestones, each a small permanent bonus (Completion motivation).
- **Stats tab:** reuse the simulator charts on the player's own calls.
- **Face bonuses:** heads/tails upgrades tied to the coin's runs, so neither face becomes the dominant call.

## 5. Balance check (MVP)

Greedy simulation: 1 manual call/s (calling the last face once Sticky is bought) plus auto calls, buying the cheapest item each time.

| Time | Result |
|---|---|
| 0–3 min | A purchase every 5–10 s |
| 10 min | All items unlocked |
| 60 min | ~$8.4M lifetime, a purchase every ~2 min |

The slowdown near the hour mark is where prestige belongs.

## 6. UI

Terse, Mario 1-1 style. No explanatory sentences.

- Top: $ and calls/s.
- Momentum and Potential chips. Coin. H and T buttons (call = flip). Recent-call strip (faded = miss).
- Tabs: Call · Upgrades · More. Dot on Upgrades when something is affordable.

## 7. Architecture

Plain HTML/CSS/JS, no build step, GitHub Pages.

```
/                index.html, game.css
/core.js         rules, state, economy, seeded RNG — no DOM; exposed as window.game
/game.js         UI: rendering, animation, auto loop, save/load, offline
/tools/bots.mjs  strategy bots → pacing report (tools/report.md)
/sim/            streak simulator
```

Per tick (50 ms): `auto tick → game.call() → state`. Render every 250 ms. Save every 5 s and on page hide.

Auto calls: animated when slower than 1.2 s; otherwise resolved silently in bulk (cap 5,000 per tick).

Save: `localStorage`. Offline: on load, replay the auto caller for the time away (cap 8 h / 200,000 calls). Seeded runs (`?seed=`) skip saving.

Possible later split: shared `engine.js` with the simulator.

## 8. Build phases

1. **MVP (done):** calls, hit/miss payouts, Momentum, Potential, 10 upgrades, auto call, save, offline.
2. Records and a stats tab.
3. Prestige (mint) with 2 coin variants.
4. Face bonuses, more coin variants, balance pass.

## 9. Balancing approach

- `tools/bots.mjs`: random, copy-last, idle, and manual-only strategies; reports lifetime at checkpoints, unlock times, late-game buy rate, manual share of income.
- Tune growth rates and the future mint threshold against pacing targets.
- Playtest on phone; note where progress stalls.

## 10. Risks and trade-offs

- **Luck feels arbitrary.** Mitigated by paying both outcomes.
- **Balancing dominates the work.** Most idle-game devlogs report this.
- **Late-game manual calls lose relevance** once auto calls are fast. Possible fix: manual calls get a multiplier or feed Momentum for auto calls.
- **Flat late game** without prestige (see section 5).

## 11. Open questions

- Name: "Call It" is a placeholder.
- Should manual calls stay relevant late game?
- Prestige currency and what carries over.
