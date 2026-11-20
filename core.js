// Call It — game core. No DOM. Runs in the browser (window.game) and in Node (globalThis.game).
(function (root) {
  'use strict';

  // ===== Upgrades =====
  // `eff(l)` returns the value at level l; `show(v)` formats it for the shop.
  const UPG = [
    { id: 'value', group: 'Call', name: 'Value', base: 10, grow: 1.55,
      eff: (l) => 1 + l, show: (v) => '$' + fmt(v) },
    { id: 'mom', group: 'Call', name: 'Momentum', base: 25, grow: 1.65,
      eff: (l) => 0.2 + 0.1 * l, show: (v) => '+' + v.toFixed(2) + '/hit' },
    { id: 'pot', group: 'Call', name: 'Potential', base: 25, grow: 1.65,
      eff: (l) => 0.3 + 0.15 * l, show: (v) => '+' + v.toFixed(2) + '/miss' },
    { id: 'cons', group: 'Call', name: 'Miss pay', base: 15, grow: 1.6, max: 9,
      eff: (l) => 0.1 * l, show: (v) => Math.round(v * 100) + '%' },
    { id: 'sticky', group: 'Coin', name: 'Sticky', base: 100, grow: 2.0, max: 10,
      eff: (l) => 0.5 - 0.03 * l, show: (v) => Math.round(v * 100) + '% swap' },
    { id: 'sH', group: 'Streaks', name: 'Heads run', base: 40, grow: 1.7,
      eff: (l) => 0.5 * l, show: (v) => v.toFixed(1) + '/step' },
    { id: 'sT', group: 'Streaks', name: 'Tails run', base: 40, grow: 1.7,
      eff: (l) => 0.5 * l, show: (v) => v.toFixed(1) + '/step' },
    { id: 'sS', group: 'Streaks', name: 'Swap run', base: 40, grow: 1.7,
      eff: (l) => 0.5 * l, show: (v) => v.toFixed(1) + '/step' },
    { id: 'auto', group: 'Auto', name: 'Auto call', base: 50, grow: 1.8,
      eff: (l) => (l === 0 ? 0 : 4 * Math.pow(0.85, l - 1)), show: (v) => (v ? fmtTime(v) : 'off') },
    { id: 'copy', group: 'Auto', name: 'Copy last', base: 300, grow: 1, max: 1, needs: 'auto',
      eff: (l) => l, show: (v) => (v ? 'on' : 'off') },
  ];
  const U = Object.fromEntries(UPG.map((u) => [u.id, u]));

  // ===== Formatting =====
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 100) return Number.isInteger(n) ? String(n) : n.toFixed(2);
    if (n < 1e4) return Math.floor(n).toLocaleString();
    const e = Math.floor(Math.log10(n) / 3);
    if (e < SUFFIX.length) return (n / Math.pow(1000, e)).toFixed(2) + SUFFIX[e];
    return n.toExponential(2);
  }
  function fmtTime(s) { return s < 1 ? Math.round(s * 1000) + 'ms' : s.toFixed(1) + 's'; }

  // ===== Randomness =====
  // Default is Math.random. seed(n) switches to a repeatable generator (mulberry32).
  let rand = Math.random, seedValue = null;
  function seed(n) {
    if (n === null || n === undefined) { rand = Math.random; seedValue = null; return; }
    let a = n >>> 0; seedValue = n;
    rand = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ===== State =====
  function freshState() {
    return {
      v: 1, money: 0, lifetime: 0,
      momentum: 0, potential: 0,
      lv: Object.fromEntries(UPG.map((u) => [u.id, 0])),
      prev: null, rt: null, rl: 0, rf: null,  // coin's current step run
      hist: [],                                // recent [face, hit]
      flips: 0, hits: 0, bestMom: 0, bestPot: 0, bestRun: 0,
      savedAt: Date.now(),
    };
  }
  let S = freshState();
  function load(obj) {
    const s = Object.assign(freshState(), obj);
    s.lv = Object.assign(freshState().lv, obj && obj.lv);
    S = s;
  }

  // ===== Economy =====
  const val = (id) => U[id].eff(S.lv[id]);
  const cost = (id) => Math.ceil(U[id].base * Math.pow(U[id].grow, S.lv[id]));
  const maxed = (id) => U[id].max !== undefined && S.lv[id] >= U[id].max;
  function visible(id) {
    const u = U[id];
    if (u.needs && S.lv[u.needs] === 0) return false;
    return S.lv[id] > 0 || S.lifetime >= u.base * 0.5;
  }
  const momMult = () => 1 + val('mom') * S.momentum;
  const potMult = () => 1 + val('pot') * S.potential;
  function buy(id) {
    if (!U[id] || maxed(id) || !visible(id)) return false;
    const c = cost(id);
    if (S.money < c) return false;
    S.money -= c; S.lv[id]++;
    return true;
  }

  // ===== Calls =====
  function drawFace() {
    if (S.prev === null) return rand() < 0.5 ? 'H' : 'T';
    return rand() < val('sticky') ? (S.prev === 'H' ? 'T' : 'H') : S.prev;
  }
  // One call. Returns { face, hit, gain, callGain, runGain }.
  function call(guess) {
    if (guess !== 'H' && guess !== 'T') throw new Error("call() needs 'H' or 'T'");
    const face = drawFace();
    const hit = face === guess;
    const base = val('value');
    let callGain, runGain = 0;
    if (hit) {
      callGain = base * momMult() * potMult();
      S.momentum++; S.potential = 0; S.hits++;
      if (S.momentum > S.bestMom) S.bestMom = S.momentum;
    } else {
      callGain = base * val('cons');
      S.potential++; S.momentum = 0;
      if (S.potential > S.bestPot) S.bestPot = S.potential;
    }
    // Coin's own streak: a run of identical steps (repeat or swap), in steps.
    if (S.prev !== null) {
      const step = face === S.prev ? 'R' : 'C';
      if (step === S.rt) S.rl++; else { S.rt = step; S.rl = 1; S.rf = face; }
      if (S.rl >= 2) {
        const key = S.rt === 'C' ? 'sS' : (S.rf === 'H' ? 'sH' : 'sT');
        runGain = base * val(key) * S.rl;
        if (S.rl > S.bestRun) S.bestRun = S.rl;
      }
    }
    const gain = callGain + runGain;
    S.prev = face; S.flips++;
    S.money += gain; S.lifetime += gain;
    S.hist.push([face, hit ? 1 : 0]); if (S.hist.length > 30) S.hist.shift();
    return { face, hit, gain, callGain, runGain };
  }
  const autoGuess = () => (val('copy') && S.prev ? S.prev : (rand() < 0.5 ? 'H' : 'T'));
  const autoInterval = () => val('auto');

  // ===== Public API =====
  root.game = {
    UPG,
    get state() { return S; },
    load, reset() { S = freshState(); },
    seed, get seedValue() { return seedValue; },
    call, autoGuess, autoInterval, buy,
    cost, maxed, visible, val, momMult, potMult,
    fmt, fmtTime,
  };
})(typeof window !== 'undefined' ? window : globalThis);
