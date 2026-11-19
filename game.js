'use strict';

// ===== Config =====
const SAVE_KEY = 'callit-save-v1';
const ANIM_MS = 420;
const OFFLINE_CAP_S = 8 * 3600;
const OFFLINE_MAX_CALLS = 200000;
const COL = { H: '#1D9E75', T: '#D85A30' };
const $ = (id) => document.getElementById(id);

// Upgrade definitions. `eff(l)` returns the value at level l; `show(v)` formats it.
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
let S = load();

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return freshState();
    const s = Object.assign(freshState(), JSON.parse(raw));
    s.lv = Object.assign(freshState().lv, s.lv);
    return s;
  } catch (e) { return freshState(); }
}
function save() {
  S.savedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}

// ===== Economy =====
const val = (id) => U[id].eff(S.lv[id]);
function cost(id) { const u = U[id]; return Math.ceil(u.base * Math.pow(u.grow, S.lv[id])); }
function maxed(id) { const u = U[id]; return u.max !== undefined && S.lv[id] >= u.max; }
function visible(id) {
  const u = U[id];
  if (u.needs && S.lv[u.needs] === 0) return false;
  return S.lv[id] > 0 || S.lifetime >= u.base * 0.5;
}
const momMult = () => 1 + val('mom') * S.momentum;
const potMult = () => 1 + val('pot') * S.potential;
function earn(x) { S.money += x; S.lifetime += x; }

// ===== Coin =====
function drawFace() {
  if (S.prev === null) return Math.random() < 0.5 ? 'H' : 'T';
  return Math.random() < val('sticky') ? (S.prev === 'H' ? 'T' : 'H') : S.prev;
}

// One call: returns { face, hit, gain }.
function call(guess) {
  const face = drawFace();
  const hit = face === guess;
  const base = val('value');
  let gain;
  if (hit) {
    gain = base * momMult() * potMult();
    S.momentum++; S.potential = 0; S.hits++;
    if (S.momentum > S.bestMom) S.bestMom = S.momentum;
  } else {
    gain = base * val('cons');
    S.potential++; S.momentum = 0;
    if (S.potential > S.bestPot) S.bestPot = S.potential;
  }
  // Coin's own streak: a run of identical steps (repeat or swap), measured in steps.
  if (S.prev !== null) {
    const step = face === S.prev ? 'R' : 'C';
    if (step === S.rt) S.rl++; else { S.rt = step; S.rl = 1; S.rf = face; }
    if (S.rl >= 2) {
      const key = S.rt === 'C' ? 'sS' : (S.rf === 'H' ? 'sH' : 'sT');
      gain += base * val(key) * S.rl;
      if (S.rl > S.bestRun) S.bestRun = S.rl;
    }
  }
  S.prev = face; S.flips++;
  earn(gain);
  S.hist.push([face, hit ? 1 : 0]); if (S.hist.length > 30) S.hist.shift();
  return { face, hit, gain };
}
function autoGuess() { return val('copy') && S.prev ? S.prev : (Math.random() < 0.5 ? 'H' : 'T'); }

// ===== Coin animation =====
let angle = 0, flipping = false;
function showFace(face, animate) {
  const coin = $('coin');
  const want = face === 'H' ? 0 : 180;
  const cur = ((angle % 360) + 360) % 360;
  let delta = (want - cur + 360) % 360;
  if (animate) { delta += 720; coin.style.transition = `transform ${ANIM_MS}ms cubic-bezier(.15,.65,.25,1)`; }
  else coin.style.transition = 'none';
  angle += delta;
  coin.style.transform = `rotateX(${angle}deg)`;
}
function pop(r) {
  const p = $('pop');
  p.className = 'pop';
  void p.offsetWidth;
  p.textContent = r.gain > 0 ? '+$' + fmt(r.gain) : '–';
  p.className = 'pop ' + (r.hit ? 'hit' : 'miss');
}
function animatedCall(guess) {
  if (flipping) return;
  flipping = true; setButtons(false);
  const r = call(guess);
  showFace(r.face, true);
  setTimeout(() => { flipping = false; setButtons(true); pop(r); render(); }, ANIM_MS);
}
function setButtons(on) { $('callH').disabled = !on; $('callT').disabled = !on; }

// ===== Auto loop =====
let acc = 0, last = performance.now(), autoRate = 0;
function tick() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 1);
  last = now;
  const iv = val('auto');
  if (iv > 0) {
    acc += dt / iv;
    if (iv >= 1.2) {
      if (acc >= 1 && !flipping) { acc = 0; animatedCall(autoGuess()); }
    } else {
      let n = 0, lastR = null;
      while (acc >= 1 && n < 5000) { lastR = call(autoGuess()); acc--; n++; }
      if (lastR && !flipping) { showFace(lastR.face, false); render(); }
    }
  }
  autoRate = iv > 0 ? 1 / iv : 0;
}

// ===== Offline progress =====
function offline() {
  const iv = val('auto');
  const away = Math.min((Date.now() - S.savedAt) / 1000, OFFLINE_CAP_S);
  if (iv <= 0 || away < 10) return;
  const n = Math.min(Math.floor(away / iv), OFFLINE_MAX_CALLS);
  const before = S.money;
  for (let i = 0; i < n; i++) call(autoGuess());
  const gained = S.money - before;
  if (gained > 0) { $('msg').textContent = 'Away +$' + fmt(gained); setTimeout(() => { $('msg').textContent = ''; }, 6000); }
}

// ===== Rendering =====
let tab = 'flip', lastMom = 1, lastPot = 1;
function render() {
  $('money').textContent = fmt(S.money);
  $('rate').textContent = autoRate ? fmt(autoRate) + ' calls/s' : '';
  const m = momMult(), p = potMult();
  $('mom').textContent = '×' + m.toFixed(2);
  $('pot').textContent = '×' + p.toFixed(2);
  $('mom').classList.toggle('up', m > 1); $('pot').classList.toggle('up', p > 1);
  $('strip').innerHTML = S.hist.map(([f, h]) => `<span class="${h ? '' : 'miss'}" style="background:${COL[f]}"></span>`).join('');
  $('shopDot').classList.toggle('show', UPG.some((u) => visible(u.id) && !maxed(u.id) && S.money >= cost(u.id)));
  if (tab === 'shop') renderShop();
  if (tab === 'more') renderStats();
}
function renderShop() {
  let html = '', group = '';
  for (const u of UPG) {
    if (!visible(u.id)) continue;
    if (u.group !== group) { group = u.group; html += `<div class="group">${group}</div>`; }
    const l = S.lv[u.id], mx = maxed(u.id), c = cost(u.id);
    const eff = mx ? u.show(u.eff(l)) : `${u.show(u.eff(l))} → ${u.show(u.eff(l + 1))}`;
    html += `<div class="item${mx ? ' max' : ''}"><div class="info"><div class="name">${u.name}<span class="lv">${l}</span></div><div class="eff">${eff}</div></div>`
      + `<button data-buy="${u.id}" class="${!mx && S.money < c ? 'cant' : ''}">${mx ? 'Max' : '$' + fmt(c)}</button></div>`;
  }
  $('shop').innerHTML = html;
}
function renderStats() {
  const rows = [
    ['Calls', S.flips.toLocaleString()],
    ['Hits', S.hits.toLocaleString() + (S.flips ? ` (${(100 * S.hits / S.flips).toFixed(1)}%)` : '')],
    ['Best momentum', S.bestMom],
    ['Best potential', S.bestPot],
    ['Longest coin streak', S.bestRun],
    ['Lifetime', '$' + fmt(S.lifetime)],
  ];
  $('statGrid').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
}
function buy(id) {
  if (maxed(id)) return;
  const c = cost(id);
  if (S.money < c) return;
  S.money -= c; S.lv[id]++;
  save(); render();
}

// ===== Wiring =====
$('callH').addEventListener('click', () => animatedCall('H'));
$('callT').addEventListener('click', () => animatedCall('T'));
document.addEventListener('keydown', (e) => {
  if (tab !== 'flip') return;
  if (e.key === 'h' || e.key === 'ArrowLeft') animatedCall('H');
  if (e.key === 't' || e.key === 'ArrowRight') animatedCall('T');
});
$('shop').addEventListener('click', (e) => { const b = e.target.closest('[data-buy]'); if (b) buy(b.dataset.buy); });
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + tab));
  render();
}));
$('reset').addEventListener('click', () => {
  if (!confirm('Reset all?')) return;
  S = freshState(); save(); angle = 0; showFace('H', false); render();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);

// ===== Start =====
offline();
if (S.prev) showFace(S.prev, false);
render();
setInterval(tick, 50);
setInterval(render, 250);
setInterval(save, 5000);
