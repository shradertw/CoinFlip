'use strict';
// Call It — UI layer. Game rules live in core.js (window.game).

const G = window.game;
const SAVE_KEY = 'callit-save-v1';
const ANIM_MS = 420;
const OFFLINE_CAP_S = 8 * 3600;
const OFFLINE_MAX_CALLS = 200000;
const COL = { H: '#1D9E75', T: '#D85A30' };
const $ = (id) => document.getElementById(id);
const fmt = G.fmt;

// ?seed=123 → repeatable run that starts fresh and never touches the real save.
const params = new URLSearchParams(location.search);
const SEEDED = params.has('seed');
if (SEEDED) G.seed(Number(params.get('seed')) || 0);

// ===== Save =====
function load() {
  if (SEEDED) return;
  try { const raw = localStorage.getItem(SAVE_KEY); if (raw) G.load(JSON.parse(raw)); } catch (e) { /* fresh */ }
}
function save() {
  if (SEEDED) return;
  G.state.savedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G.state)); } catch (e) { /* storage unavailable */ }
}

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
  const r = G.call(guess);
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
  const iv = G.autoInterval();
  if (iv > 0) {
    acc += dt / iv;
    if (iv >= 1.2) {
      if (acc >= 1 && !flipping) { acc = 0; animatedCall(G.autoGuess()); }
    } else {
      let n = 0, lastR = null;
      while (acc >= 1 && n < 5000) { lastR = G.call(G.autoGuess()); acc--; n++; }
      if (lastR && !flipping) { showFace(lastR.face, false); render(); }
    }
  }
  autoRate = iv > 0 ? 1 / iv : 0;
}

// ===== Offline progress =====
function offline() {
  const iv = G.autoInterval();
  const away = Math.min((Date.now() - G.state.savedAt) / 1000, OFFLINE_CAP_S);
  if (SEEDED || iv <= 0 || away < 10) return;
  const n = Math.min(Math.floor(away / iv), OFFLINE_MAX_CALLS);
  const before = G.state.money;
  for (let i = 0; i < n; i++) G.call(G.autoGuess());
  const gained = G.state.money - before;
  if (gained > 0) { $('msg').textContent = 'Away +$' + fmt(gained); setTimeout(() => { $('msg').textContent = ''; }, 6000); }
}

// ===== Rendering =====
let tab = 'flip';
function render() {
  const S = G.state;
  $('money').textContent = fmt(S.money);
  $('rate').textContent = autoRate ? fmt(autoRate) + ' calls/s' : '';
  const m = G.momMult(), p = G.potMult();
  $('mom').textContent = '×' + m.toFixed(2);
  $('pot').textContent = '×' + p.toFixed(2);
  $('mom').classList.toggle('up', m > 1); $('pot').classList.toggle('up', p > 1);
  $('strip').innerHTML = S.hist.map(([f, h]) => `<span class="${h ? '' : 'miss'}" style="background:${COL[f]}"></span>`).join('');
  $('shopDot').classList.toggle('show', G.UPG.some((u) => G.visible(u.id) && !G.maxed(u.id) && S.money >= G.cost(u.id)));
  if (tab === 'shop') renderShop();
  if (tab === 'more') renderStats();
}
function renderShop() {
  const S = G.state;
  let html = '', group = '';
  for (const u of G.UPG) {
    if (!G.visible(u.id)) continue;
    if (u.group !== group) { group = u.group; html += `<div class="group">${group}</div>`; }
    const l = S.lv[u.id], mx = G.maxed(u.id), c = G.cost(u.id);
    const eff = mx ? u.show(u.eff(l)) : `${u.show(u.eff(l))} → ${u.show(u.eff(l + 1))}`;
    html += `<div class="item${mx ? ' max' : ''}"><div class="info"><div class="name">${u.name}<span class="lv">${l}</span></div><div class="eff">${eff}</div></div>`
      + `<button data-buy="${u.id}" class="${!mx && S.money < c ? 'cant' : ''}">${mx ? 'Max' : '$' + fmt(c)}</button></div>`;
  }
  $('shop').innerHTML = html;
}
function renderStats() {
  const S = G.state;
  const rows = [
    ['Calls', S.flips.toLocaleString()],
    ['Hits', S.hits.toLocaleString() + (S.flips ? ` (${(100 * S.hits / S.flips).toFixed(1)}%)` : '')],
    ['Best momentum', S.bestMom],
    ['Best potential', S.bestPot],
    ['Longest coin streak', S.bestRun],
    ['Lifetime', '$' + fmt(S.lifetime)],
  ];
  if (SEEDED) rows.push(['Seed', G.seedValue]);
  $('statGrid').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
}
function buy(id) { if (G.buy(id)) { save(); render(); } }

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
  G.reset(); save(); angle = 0; showFace('H', false); render();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
window.addEventListener('pagehide', save);

// UI hooks for scripted testing: game.ui.render() after driving game.call()/game.buy().
G.ui = { render, save, showFace };

// ===== Start =====
load();
offline();
if (G.state.prev) showFace(G.state.prev, false);
render();
setInterval(tick, 50);
setInterval(render, 250);
setInterval(save, 5000);
