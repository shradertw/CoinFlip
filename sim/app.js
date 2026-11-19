'use strict';

// ---------- Constants ----------
const MIN = 2;                 // a streak is recorded at 2+ identical steps
const LOG_CAP = 1000000;       // per-flip rows kept for export
const KMAX = 3000;             // length cap for expected-distribution math
const COL = { H: '#1D9E75', T: '#D85A30', A: '#7F77DD' };
const NAME = { H: 'Heads', T: 'Tails', A: 'Swap' };
const $ = (id) => document.getElementById(id);

// ---------- Settings ----------
const cfg = { mode: 'face', pHeads: 0.5, pChange: 0.5, animMs: 600, rate: 1 };

// Probability of switching away from each face.
// Face weight: every flip is an independent roll for heads.
// Step weight: every flip rolls "switch or stay" from the current face.
function switchProbs() {
  if (cfg.mode === 'face') return { a: 1 - cfg.pHeads, b: cfg.pHeads };
  return { a: cfg.pChange, b: cfg.pChange };
}

function rateFromSlider(v) { return 0.5 * Math.pow(10, v / 25); } // 0.5/s .. 5000/s
function fmtRate(r) { return r < 10 ? r.toFixed(1).replace(/\.0$/, '') + '/s' : Math.round(r).toLocaleString() + '/s'; }

// ---------- Expected values ----------
// Repeat runs continue with a fixed chance, so their lengths are geometric.
function geomDist(r) {
  const p = new Float64Array(KMAX + 1);
  let s = 1;
  for (let k = 1; k <= KMAX; k++) { p[k] = s * (1 - r); s *= r; }
  return conditional(p, r);
}
// Change runs alternate faces, so the continue chance alternates between a and b.
function changeDist(a, b) {
  const piH = b / (a + b), piT = a / (a + b);
  let wH = piT * (1 - b) * b;   // run's first change lands on H
  let wT = piH * (1 - a) * a;   // run's first change lands on T
  const w = wH + wT; wH /= w; wT /= w;
  const p = new Float64Array(KMAX + 1);
  let sH = 1, sT = 1;
  for (let k = 1; k <= KMAX; k++) {
    const cH = k % 2 ? a : b;   // started on H: on H after odd changes
    const cT = k % 2 ? b : a;
    p[k] = wH * sH * (1 - cH) + wT * sT * (1 - cT);
    sH *= cH; sT *= cT;
  }
  return conditional(p, Math.sqrt(a * b));
}
function conditional(p, rEff) {
  let tail = 0;
  for (let k = MIN; k <= KMAX; k++) tail += p[k];
  const q = new Float64Array(KMAX + 1);
  let mean = 0;
  for (let k = MIN; k <= KMAX; k++) { q[k] = p[k] / tail; mean += k * q[k]; }
  return { q, mean, r: rEff };
}
let EXP = null;
function computeExpected() {
  const { a, b } = switchProbs();
  EXP = { H: geomDist(1 - a), T: geomDist(1 - b), A: changeDist(a, b) };
}

// ---------- State ----------
let S;
function newStats() { return { sum: 0, n: 0, max: 0 }; }
function newState() {
  return {
    n: 0, prev: null,
    rt: null, rl: 0, rf: null,           // current run: type R/C, length in steps, face
    st: { H: newStats(), T: newStats(), A: newStats() },
    runsAll: { H: 0, T: 0, A: 0 },        // completed runs of any length (1+ steps)
    len: { H: {}, T: {}, A: {} },         // histogram counts
    g: { H: [], T: [], A: [] },           // gambler table: g[type][k] = {n, r}
    hist: [], sh: [],                     // recent flips and steps for the strips
    smp: [], step: 1,                     // running-average samples
    events: [],                           // setting changes (flip number)
    settings: [],                         // settings history for export
    log: new Uint8Array(LOG_CAP),
    logSet: new Uint16Array(LOG_CAP),
  };
}
function recordSettings() {
  if (S.settings.length >= 65535) return;
  const entry = { at: S.n, mode: cfg.mode, value: cfg.mode === 'face' ? cfg.pHeads : cfg.pChange };
  const last = S.settings[S.settings.length - 1];
  if (last && last.mode === entry.mode && last.value === entry.value) return;
  if (last && last.at === S.n) S.settings[S.settings.length - 1] = entry;
  else S.settings.push(entry);
  if (S.n > 0) S.events.push(S.n);
}
function resetAll() {
  stopAuto();
  S = newState();
  recordSettings();
  render();
}

// ---------- Core flip logic ----------
function drawFace() {
  if (cfg.mode === 'face') return Math.random() < cfg.pHeads ? 'H' : 'T';
  if (S.prev === null) return Math.random() < 0.5 ? 'H' : 'T';
  return Math.random() < cfg.pChange ? (S.prev === 'H' ? 'T' : 'H') : S.prev;
}
function runKey() { return S.rt === 'C' ? 'A' : S.rf; }
function endRun() {
  if (!S.rt) return;
  const k = runKey();
  S.runsAll[k]++;
  if (S.rl < MIN) return;
  const s = S.st[k];
  s.sum += S.rl; s.n++; if (S.rl > s.max) s.max = S.rl;
  S.len[k][S.rl] = (S.len[k][S.rl] || 0) + 1;
}
function avg(k) { const s = S.st[k]; return s.n ? s.sum / s.n : null; }
function sample() {
  S.smp.push({ n: S.n, H: avg('H'), T: avg('T'), A: avg('A'), eH: EXP.H.mean, eT: EXP.T.mean, eA: EXP.A.mean });
  if (S.smp.length > 400) { S.smp = S.smp.filter((_, i) => i % 2 === 1); S.step *= 2; }
}
function flip() {
  const x = drawFace();
  if (S.prev !== null) {
    const st = x === S.prev ? 'R' : 'C';
    if (S.rt) {
      const arr = S.g[runKey()], k = S.rl;
      if (!arr[k]) arr[k] = { n: 0, r: 0 };
      arr[k].n++; if (st === S.rt) arr[k].r++;
    }
    if (st === S.rt) S.rl++;
    else { endRun(); S.rt = st; S.rl = 1; S.rf = x; }
    S.sh.push(st); if (S.sh.length > 60) S.sh.shift();
  }
  if (S.n < LOG_CAP) { S.log[S.n] = x === 'H' ? 0 : 1; S.logSet[S.n] = S.settings.length - 1; }
  S.prev = x; S.n++;
  S.hist.push(x); if (S.hist.length > 60) S.hist.shift();
  if (S.n % S.step === 0) sample();
  return x;
}

// ---------- Coin animation ----------
let angle = 0, animating = false;
function showFace(x, animate) {
  const coin = $('coin');
  const want = x === 'H' ? 0 : 180;
  const cur = ((angle % 360) + 360) % 360;
  let delta = (want - cur + 360) % 360;
  if (animate) {
    delta += 360 * Math.max(1, Math.round(cfg.animMs / 220));
    coin.style.transition = `transform ${cfg.animMs}ms cubic-bezier(.15,.65,.25,1)`;
  } else {
    coin.style.transition = 'none';
  }
  angle += delta;
  coin.style.transform = `rotateX(${angle}deg)`;
}
function animatedFlip(done) {
  if (animating) return;
  const x = flip();
  if (cfg.animMs <= 0) { showFace(x, false); render(); if (done) done(); return; }
  animating = true;
  showFace(x, true);
  setTimeout(() => { animating = false; render(); if (done) done(); }, cfg.animMs);
}

// ---------- Auto flipping ----------
let autoOn = false, autoTimer = null, acc = 0, lastT = 0;
function startAuto() {
  autoOn = true; acc = 0; lastT = performance.now();
  $('auto').classList.add('running');
  $('auto').innerHTML = '<i class="ti ti-player-pause"></i> Pause';
  loop();
}
function stopAuto() {
  autoOn = false; clearTimeout(autoTimer);
  $('auto').classList.remove('running');
  $('auto').innerHTML = '<i class="ti ti-player-play"></i> Auto';
  $('hint').textContent = '';
}
function loop() {
  if (!autoOn) return;
  const interval = 1000 / cfg.rate;
  const now = performance.now();
  if (cfg.animMs > 0 && interval >= cfg.animMs + 30) {
    lastT = now; acc = 0;
    animatedFlip();
    autoTimer = setTimeout(loop, interval);
    return;
  }
  acc = Math.min(acc + ((now - lastT) / 1000) * cfg.rate, cfg.rate + 1);
  lastT = now;
  let c = 0;
  while (acc >= 1) { flip(); acc--; c++; }
  if (c) { showFace(S.prev, false); render(); }
  autoTimer = setTimeout(loop, 50);
}

// ---------- Rendering ----------
let activeTab = 'coin', histTab = 'H', renderQueued = false;
function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderNow(); });
}
function curRun(k) { return S.rt && runKey() === k ? S.rl : 0; }
function renderNow() {
  $('count').textContent = S.n.toLocaleString();
  if (activeTab === 'coin') renderCoinTab();
  else if (activeTab === 'hist') renderHist();
  else if (activeTab === 'gambler') renderGambler();
  else if (activeTab === 'trends') renderTrends();
}
function renderCoinTab() {
  const fl = S.hist.slice(-30), sp = S.sh.slice(-29);
  $('strip').innerHTML = fl.map((h) => `<span style="background:${COL[h]}"></span>`).join('');
  $('steps').innerHTML = sp.map((s) => `<span>${s}</span>`).join('');
  for (const [k, p] of [['H', 'h'], ['T', 't'], ['A', 'a']]) {
    const s = S.st[k];
    $(p + 'A').textContent = s.n ? (s.sum / s.n).toFixed(3) : '–';
    $(p + 'N').textContent = s.n.toLocaleString();
    $(p + 'M').textContent = Math.max(s.max, curRun(k));
    $(p + 'C').textContent = curRun(k);
  }
}

// Charts
let hc = null, lc = null;
function cssVar(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888'; }
const eventLines = {
  id: 'eventLines',
  afterDatasetsDraw(chart) {
    if (!S.events.length) return;
    const xs = chart.scales.x, area = chart.chartArea, ctx = chart.ctx;
    ctx.save(); ctx.strokeStyle = cssVar('--muted'); ctx.setLineDash([2, 3]); ctx.lineWidth = 1;
    for (const n of S.events) {
      const x = xs.getPixelForValue(n);
      if (x < area.left || x > area.right) continue;
      ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
    }
    ctx.restore();
  },
};
function makeCharts() {
  if (typeof Chart === 'undefined') return;
  const tc = cssVar('--text2'), gc = cssVar('--border');
  Chart.defaults.color = tc; Chart.defaults.font.size = 11;
  hc = new Chart($('histC'), {
    type: 'bar',
    data: { labels: [], datasets: [
      { label: 'Observed', data: [], backgroundColor: COL.H, borderRadius: 2 },
      { label: 'Expected', data: [], backgroundColor: 'transparent', borderColor: tc, borderWidth: 1, borderRadius: 2 },
    ] },
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: 'Streak length (steps)' }, grid: { display: false } },
                y: { beginAtZero: true, grid: { color: gc } } } },
  });
  const solid = (k) => ({ label: NAME[k], data: [], borderColor: COL[k], backgroundColor: COL[k], pointRadius: 0, borderWidth: 1.5, tension: 0.2 });
  const dash = (k) => ({ label: 'exp' + k, data: [], borderColor: COL[k] + '99', borderDash: [5, 4], borderWidth: 1, pointRadius: 0, stepped: true });
  lc = new Chart($('lineC'), {
    type: 'line',
    data: { datasets: [solid('H'), solid('T'), solid('A'), dash('H'), dash('T'), dash('A')] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      plugins: { legend: { labels: { filter: (i) => !i.text.startsWith('exp'), boxWidth: 10 } } },
      scales: { x: { type: 'linear', title: { display: true, text: 'Flips' }, grid: { display: false },
                     ticks: { maxTicksLimit: 5, callback: (v) => Number(v).toLocaleString() } },
                y: { grid: { color: gc } } } },
    plugins: [eventLines],
  });
}
function renderHist() {
  const k = histTab, L = S.len[k], n = S.st[k].n, q = EXP[k].q;
  let top = Math.max(S.st[k].max, MIN + 6);
  for (let j = MIN; j <= KMAX; j++) { if (n * q[j] >= 0.5) top = Math.max(top, j); else if (j > top) break; }
  top = Math.min(top, MIN + 28);
  const labs = [], ob = [], ex = [];
  for (let j = MIN; j <= top; j++) { labs.push(j); ob.push(L[j] || 0); ex.push(+(n * q[j]).toFixed(1)); }
  let over = 0; for (const j in L) if (+j > top) over += L[j];
  $('histInfo').textContent = `${n.toLocaleString()} recorded · expected avg ${EXP[k].mean.toFixed(2)}` + (over ? ` · ${over} over ${top} hidden` : '');
  $('obsSwatch').style.background = COL[k];
  if (!hc) return;
  hc.data.labels = labs;
  hc.data.datasets[0].data = ob; hc.data.datasets[0].backgroundColor = COL[k];
  hc.data.datasets[1].data = ex;
  hc.update();
}
function pct(x) { return (100 * x).toFixed(1) + '%'; }
function renderGambler() {
  const { a, b } = switchProbs();
  $('gExp').textContent = cfg.mode === 'step'
    ? `Expected: Heads ${pct(1 - cfg.pChange)} · Tails ${pct(1 - cfg.pChange)} · Swap ${pct(cfg.pChange)}`
    : `Expected: Heads ${pct(1 - a)} · Tails ${pct(1 - b)} · Swap ${a === b ? pct(a) : pct(a) + ' / ' + pct(b)}`;
  const rows = Math.max(S.g.H.length, S.g.T.length, S.g.A.length) - 1;
  const cell = (o) => o ? `${pct(o.r / o.n)}<small>${o.n.toLocaleString()} sample${o.n === 1 ? '' : 's'}</small>` : '–';
  let h = '<span class="h">Length</span><span class="h">Heads</span><span class="h">Tails</span><span class="h">Swap</span>';
  for (let k = 1; k <= rows; k++) h += `<span>${k}</span><span>${cell(S.g.H[k])}</span><span>${cell(S.g.T[k])}</span><span>${cell(S.g.A[k])}</span>`;
  if (rows < 1) h += '<span>–</span><span>–</span><span>–</span><span>–</span>';
  $('gt').innerHTML = h;
}
function expectedLongest(k) {
  const N = S.runsAll[k] + (curRun(k) ? 1 : 0), r = EXP[k].r;
  if (N < 1 || r <= 0 || r >= 1) return '–';
  const est = 0.5 + (Math.log(N) + 0.5772) / Math.log(1 / r);   // max of N geometric lengths
  return '≈ ' + Math.max(1, est).toFixed(1);
}
function renderTrends() {
  for (const k of ['H', 'T', 'A']) {
    $('l' + k).textContent = Math.max(S.st[k].max, curRun(k));
    $('e' + k).textContent = expectedLongest(k);
  }
  if (!lc) return;
  const keys = ['H', 'T', 'A'];
  keys.forEach((k, i) => {
    lc.data.datasets[i].data = S.smp.filter((s) => s[k] !== null).map((s) => ({ x: s.n, y: s[k] }));
    lc.data.datasets[i + 3].data = S.smp.map((s) => ({ x: s.n, y: s['e' + k] }));
  });
  lc.update();
}

// ---------- Export ----------
function exportCSV() {
  const out = [];
  const stamp = new Date().toISOString();
  out.push('# Coin streak simulator export\n');
  out.push(`# exported,${stamp}\n# total flips,${S.n}\n`);
  out.push('# streak lengths are in steps; streaks of 2+ steps are recorded\n');
  for (const k of ['H', 'T', 'A']) {
    const s = S.st[k];
    out.push(`# ${NAME[k]} streaks,recorded,${s.n},average,${s.n ? (s.sum / s.n).toFixed(4) : ''},longest,${s.max}\n`);
  }
  out.push('# settings history (flip where it started, mode, value)\n');
  for (const e of S.settings) out.push(`# from flip ${e.at + 1},${e.mode === 'face' ? 'face weight: chance of heads' : 'step weight: chance of swap'},${e.value}\n`);
  if (S.n > LOG_CAP) out.push(`# per-flip rows below cover the first ${LOG_CAP} flips only\n`);
  out.push('flip,face,step,mode,weight\n');
  const rows = Math.min(S.n, LOG_CAP);
  let chunk = [];
  for (let i = 0; i < rows; i++) {
    const f = S.log[i] ? 'T' : 'H';
    const st = i === 0 ? '' : (S.log[i] === S.log[i - 1] ? 'R' : 'C');
    const e = S.settings[S.logSet[i]];
    chunk.push(`${i + 1},${f},${st},${e.mode},${e.value}`);
    if (chunk.length === 50000) { out.push(chunk.join('\n') + '\n'); chunk = []; }
  }
  if (chunk.length) out.push(chunk.join('\n') + '\n');
  const blob = new Blob(out, { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'coin-streaks-' + stamp.slice(0, 19).replace(/[:T]/g, '-') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- Settings UI ----------
function syncWeightUI() {
  const face = cfg.mode === 'face';
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.m === cfg.mode));
  const v = Math.round((face ? cfg.pHeads : cfg.pChange) * 100);
  $('weight').value = v;
  $('wLabel').textContent = face ? 'Heads' : 'Swap';
  $('wOut').textContent = v + '%';
  $('wOther').textContent = face ? `Tails ${100 - v}%` : `Stay ${100 - v}%`;
  $('modeInfo').textContent = face ? 'Each flip rolls a face.' : 'Each flip rolls swap or stay.';
}
function settingsChanged() {
  computeExpected();
  recordSettings();
  render();
}

// ---------- Wiring ----------
function setTab(t) {
  activeTab = t;
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + t));
  renderNow();
}
function tapCoin() {
  if (autoOn) { $('hint').textContent = 'Auto on'; return; }
  animatedFlip();
}

document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
$('coin').addEventListener('click', tapCoin);
$('coin').addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tapCoin(); } });
$('auto').addEventListener('click', () => (autoOn ? stopAuto() : startAuto()));

document.querySelectorAll('#histSeg button').forEach((b) => b.addEventListener('click', () => {
  histTab = b.dataset.k;
  document.querySelectorAll('#histSeg button').forEach((x) => x.classList.toggle('on', x === b));
  renderHist();
}));
document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => {
  if (cfg.mode === b.dataset.m) return;
  cfg.mode = b.dataset.m; syncWeightUI(); settingsChanged();
}));
$('weight').addEventListener('input', () => {
  const v = +$('weight').value / 100;
  if (cfg.mode === 'face') cfg.pHeads = v; else cfg.pChange = v;
  syncWeightUI(); computeExpected();
});
$('weight').addEventListener('change', settingsChanged);
$('anim').addEventListener('input', () => { cfg.animMs = +$('anim').value; $('animOut').textContent = cfg.animMs + ' ms'; });
$('rate').addEventListener('input', () => { cfg.rate = rateFromSlider(+$('rate').value); $('rateOut').textContent = fmtRate(cfg.rate); });
$('batchN').addEventListener('input', () => { $('batchErr').textContent = ''; });
$('batchGo').addEventListener('click', () => {
  const v = parseInt($('batchN').value, 10);
  if (!(v >= 1 && v <= 10000000)) { $('batchErr').textContent = '1 to 10,000,000'; return; }
  stopAuto();
  for (let i = 0; i < v; i++) flip();
  showFace(S.prev, false);
  $('batchErr').textContent = '';
  render();
});
$('reset').addEventListener('click', () => {
  if (S.n === 0 || confirm('Reset stats?')) resetAll();
});
$('export').addEventListener('click', exportCSV);

// ---------- Start ----------
cfg.rate = rateFromSlider(+$('rate').value);
$('rateOut').textContent = fmtRate(cfg.rate);
computeExpected();
S = newState();
recordSettings();
syncWeightUI();
makeCharts();
renderNow();
