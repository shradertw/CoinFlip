// Strategy bots for Call It. Plays the real game core (core.js) under several
// strategies and prints a pacing report.
//
//   node tools/bots.mjs                 60 min, 5 seeds, 1 manual call/s
//   node tools/bots.mjs --minutes=30 --seeds=10 --rate=2
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
vm.runInThisContext(fs.readFileSync(path.join(here, '..', 'core.js'), 'utf8'));
const G = globalThis.game;

const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? Number(a.split('=')[1]) : d;
};
const MINUTES = arg('minutes', 60);
const SEEDS = arg('seeds', 5);
const RATE = arg('rate', 1); // manual calls per second

const rnd = () => (Math.random() < 0.5 ? 'H' : 'T');
const copyLast = () => G.state.prev || 'H';

// Each strategy: how the player calls manually, and what it refuses to buy.
const STRATEGIES = {
  random: { desc: 'calls at random, buys cheapest', manual: () => rnd(), skip: [] },
  copy:   { desc: 'calls the last face, buys cheapest', manual: () => copyLast(), skip: [] },
  idle:   { desc: 'calls until Auto call is bought, then stops', manual: () => (G.state.lv.auto ? null : rnd()), skip: [] },
  manual: { desc: 'calls the last face, never buys automation', manual: () => copyLast(), skip: ['auto', 'copy'] },
};

function cheapest(skip) {
  let best = null;
  for (const u of G.UPG) {
    if (skip.includes(u.id) || !G.visible(u.id) || G.maxed(u.id)) continue;
    const c = G.cost(u.id);
    if (!best || c < best.c) best = { id: u.id, c };
  }
  return best;
}

function run(strategy, seed) {
  G.reset(); G.seed(seed);
  const st = STRATEGIES[strategy];
  const T = MINUTES * 60, lastWindow = Math.min(600, T);
  const firstBuy = {}, checkpoints = {};
  let acc = 0, manualAcc = 0, buysLate = 0, manualLate = 0, totalLate = 0, manualCalls = 0, manualHits = 0;

  for (let t = 1; t <= T; t++) {
    const late = t > T - lastWindow;
    // Manual calls
    manualAcc += RATE;
    while (manualAcc >= 1) {
      manualAcc--;
      const g = st.manual();
      if (!g) break;
      const r = G.call(g);
      manualCalls++; if (r.hit) manualHits++;
      if (late) { manualLate += r.gain; totalLate += r.gain; }
    }
    // Auto calls
    const iv = G.autoInterval();
    if (iv > 0) {
      acc += 1 / iv;
      while (acc >= 1) { acc--; const r = G.call(G.autoGuess()); if (late) totalLate += r.gain; }
    }
    // Buy everything affordable, cheapest first
    for (let b = cheapest(st.skip); b && G.state.money >= b.c; b = cheapest(st.skip)) {
      G.buy(b.id);
      if (!(b.id in firstBuy)) firstBuy[b.id] = t;
      if (late) buysLate++;
    }
    if ([5, 15, 30, 60, 120].includes(t / 60)) checkpoints[t / 60] = G.state.lifetime;
  }
  const allSeen = G.UPG.filter((u) => !st.skip.includes(u.id)).every((u) => u.id in firstBuy);
  return {
    checkpoints, firstBuy,
    allUnlocked: allSeen ? Math.max(...Object.values(firstBuy)) : null,
    buysPerMinLate: buysLate / (lastWindow / 60),
    manualShareLate: totalLate ? manualLate / totalLate : 0,
    manualHitRate: manualCalls ? manualHits / manualCalls : null,
    lifetime: G.state.lifetime,
  };
}

const median = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const mmss = (s) => (s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const money = (n) => (n === null ? '—' : '$' + G.fmt(n));
const pct = (x) => (x === null ? '—' : (100 * x).toFixed(0) + '%');

const results = {};
for (const s of Object.keys(STRATEGIES)) {
  results[s] = Array.from({ length: SEEDS }, (_, i) => run(s, i + 1));
}
const names = Object.keys(results);
const row = (label, f) => `| ${label} | ${names.map((n) => f(results[n])).join(' | ')} |`;

const out = [];
out.push(`# Call It — bot report`);
out.push(`${MINUTES} min per run · ${SEEDS} seeds · ${RATE} manual call/s · medians\n`);
out.push(names.map((n) => `- **${n}**: ${STRATEGIES[n].desc}`).join('\n') + '\n');
out.push(`| | ${names.join(' | ')} |`);
out.push(`|---|${names.map(() => '---').join('|')}|`);
for (const m of [5, 15, 30, 60, 120].filter((m) => m <= MINUTES)) {
  out.push(row(`Lifetime @ ${m} min`, (rs) => money(median(rs.map((r) => r.checkpoints[m])))));
}
out.push(row('All upgrades bought by', (rs) => mmss(median(rs.map((r) => r.allUnlocked)))));
out.push(row('Buys/min, last 10 min', (rs) => median(rs.map((r) => r.buysPerMinLate)).toFixed(2)));
out.push(row('Manual share of income, last 10 min', (rs) => pct(median(rs.map((r) => r.manualShareLate)))));
out.push(row('Manual hit rate', (rs) => pct(median(rs.map((r) => r.manualHitRate)))));
out.push('\n**First purchase of each upgrade**\n');
out.push(`| | ${names.join(' | ')} |`);
out.push(`|---|${names.map(() => '---').join('|')}|`);
for (const u of G.UPG) out.push(row(u.name, (rs) => mmss(median(rs.map((r) => r.firstBuy[u.id] ?? null)))));
console.log(out.join('\n'));
