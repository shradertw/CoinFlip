# CoinFlip

- `/` — Call It, a coin-flip incremental game (see `DESIGN.md`).
- `/sim/` — coin streak simulator. Original version saved on branch `v1-sim`.

## Coin streak simulator

A small web app for watching streaks form in coin flips.

Tap the coin to flip it, or turn on auto-flip. Every flip is converted into a step: **R** (repeat, same face as before) or **C** (change, other face). A streak is a run of identical steps, measured in steps:

- **Heads repeat streak:** HHH = 2 steps
- **Tails repeat streak:** TTT = 2 steps
- **Swap streak:** HTH or THT = 2 steps

Streaks are recorded once they end, if they reached 2 or more steps.

## Tabs

- **Coin:** the coin, auto-flip, recent flips and steps, and live stats for each streak type.
- **Lengths:** histogram of streak lengths, with the predicted counts for the current coin outlined.
- **Gambler:** after k identical steps in a row, how often the next step continues the run.
- **Trends:** longest streaks vs a rough estimate, and running averages over time with setting changes marked.
- **Settings:** coin weight, animation time, auto speed, batch runs, CSV export, and reset.

## Coin weight modes

- **Face weight:** each flip is an independent roll with a set chance of heads.
- **Step weight:** each flip rolls "swap or stay" from the current face with a set chance of swap. Heads and tails stay 50/50 over time, but streak lengths change.

Settings can change mid-run. Stats start fresh each time the page loads; use **Export CSV** to keep a run.

## Running it

Open `sim/index.html` in a browser, or enable GitHub Pages for this repo (Settings → Pages → deploy from the `main` branch, root folder). Chart.js and the icon font load from jsDelivr, so the charts need an internet connection.

## Development

Game rules live in `core.js` (no DOM); `game.js` is the UI.

**Dev API** — in the browser console, `window.game`:

| | |
|---|---|
| `game.call('H')` | One call, instant. Returns `{ face, hit, gain, callGain, runGain }` |
| `game.buy('mom')` | Buy an upgrade by id. Returns `true` if bought |
| `game.state` | Current state |
| `game.reset()` | Fresh state |
| `game.seed(n)` | Repeatable randomness (`game.seed(null)` to undo) |
| `game.UPG` | Upgrade table |
| `game.ui.render()` | Redraw after scripted changes |

**Seeded runs** — `?seed=123` in the URL starts a fresh, repeatable game that never touches your real save.

**Bots** — `node tools/bots.mjs [--minutes=60] [--seeds=5] [--rate=1]` plays the core under several strategies and prints a pacing report. Latest: `tools/report.md`.
