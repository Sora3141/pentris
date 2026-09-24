'use strict';

const VERSION = 'v2.0.0';

// ==================== 保存データ ====================
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 保存できない環境では無視 */ }
  },
};

const DEFAULT_SETTINGS = {
  sound: true, volume: 0.7, ghost: true, grid: true, shake: true, das: 150, arr: 35,
  control: 'buttons', sens: 1, vibrate: true, mode: 'endless', aiSpeed: 0,
};
const MODES = {
  endless: { label: 'ENDLESS', limit: 0, bestKey: 'pent.best' },
  p500: { label: '500 PIECES', limit: 500, bestKey: 'pent.best.p500' },
};
const settings = { ...DEFAULT_SETTINGS, ...store.get('pent.settings', {}) };
if (!MODES[settings.mode]) settings.mode = 'endless';
const mode = () => MODES[settings.mode];
let best = store.get(mode().bestKey, 0);
// ?seed=123 で同じピース順を再現できる
const urlSeed = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);

const saveSettings = () => store.set('pent.settings', settings);

// ==================== DOM ====================
const $ = sel => document.querySelector(sel);
const el = {
  app: $('#app'),
  well: $('#well'),
  frame: $('#frame'),
  stage: $('#stage'),
  board: $('#board'),
  callouts: $('#callouts'),
  sideLeft: $('.side-left'),
  sideRight: $('.side-right'),
  score: $('#score'),
  level: $('#level'),
  lines: $('#lines'),
  time: $('#time'),
  best: $('#best'),
  progress: $('#progress'),
  ren: $('#ren'),
  renCount: $('#ren-count'),
  hold: $('#hold'),
  next: [0, 1, 2, 3, 4].map(i => $('#next' + i)),
  gallery: $('#gallery'),
  titleBest: $('#title-best'),
  soundBtn: $('#btn-sound'),
  overlays: { title: $('#ov-title'), coach: $('#ov-coach'), pause: $('#ov-pause'), over: $('#ov-over') },
  dlgSettings: $('#dlg-settings'),
  dlgHelp: $('#dlg-help'),
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const landscapePhone = window.matchMedia('(pointer: coarse) and (orientation: landscape) and (max-height: 500px)');
const LEVEL_HUES = [190, 152, 112, 46, 22, 350, 320, 286, 252, 216];
const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'PENTA'];

const renderer = new BoardRenderer(el.board);
const backdrop = new Backdrop($('#backdrop'));

let state = 'title';          // title | coach | playing | paused | over
let hardDropped = false;
let overTimer = 0;
const shown = { score: 0, sec: -1 };
const shake = { amp: 0, t: 0 };

// ==================== ゲーム ====================
// AI が最速で遊んでいるときは細かい効果音や揺れを省く
const quiet = () => aiCtl.on && AI_SPEEDS[settings.aiSpeed].key === 'max';

const game = new Game({
  spawn() { drawQueue(); },
  hold() { if (!quiet()) { Sfx.hold(); haptic(8); } drawHold(); },
  hardDrop(e) {
    hardDropped = true;
    if (quiet()) return;
    renderer.addTrail(e.id, e.from, e.to);
    Sfx.hard();
    haptic(14);
    bump(Math.min(7, 2 + e.dist * 0.25));
  },
  lock(e) {
    // ライン消去で下にずれた位置に合わせて、固定時の光を描く
    const shifted = e.cells
      .filter(([, y]) => !e.cleared.includes(y))
      .map(([x, y]) => [x, y + e.cleared.filter(r => r > y).length]);
    renderer.addLock(shifted);
    if (!hardDropped && !quiet()) Sfx.lock();
    hardDropped = false;
    if (e.lines > 0) {
      renderer.addClear(e.cleared, e.clearedCells);
      if (!quiet() || e.lines >= 4 || e.spin) Sfx.clear(e.lines);
      haptic(e.lines >= 4 ? [30, 40, 50] : 20 + e.lines * 8);
      if (e.allClear) Sfx.allClear();
      if (e.levelUp) { Sfx.levelUp(); applyLevelHue(); }
      bump(2 + e.lines * 1.6);
      showBurst(e);
    }
    updateHUD();
    drawHold();
  },
  gameover() { onGameOver(); },
});

const input = new Input({
  move(dir) {
    const ok = game.move(dir);
    if (ok) Sfx.move();
    return ok;
  },
  soft(on) { game.setSoftDrop(on); },
  hard() { game.hardDrop(); },
  cw() { if (game.rotate(1)) Sfx.rotate(); },
  ccw() { if (game.rotate(-1)) Sfx.rotate(); },
  hold() { game.holdPiece(); },
}, settings);

const gestures = new Gestures(el.well, {
  active: () => state === 'playing' && settings.control === 'gesture' && !aiCtl.on,
  step() {
    const s = Math.max(12, (renderer.cs * 0.9) / settings.sens);
    return { x: s, y: s * 1.05 };
  },
  move(dir) { if (game.move(dir)) Sfx.move(); },
  soft() { game.softStep(); },
  hard() { game.hardDrop(); },
  rotate(dir) { if (game.rotate(dir)) Sfx.rotate(); },
  hold() { game.holdPiece(); },
  frameRect: () => el.frame.getBoundingClientRect(),
});

// ==================== AI プレイ ====================
const AI_SPEEDS = [
  { key: 'normal', label: '普通', step: 55, think: 140 },
  { key: 'fast', label: '速い', step: 10, think: 25 },
  { key: 'max', label: '最速', step: 0, think: 0 },
];
const AI_STEPS = ['left', 'right', 'down', 'cw', 'ccw'];
const aiCtl = { on: false, plan: null, waiting: false, timer: 0, req: 0, worker: null, sync: null };
if (!AI_SPEEDS[settings.aiSpeed]) settings.aiSpeed = 0;

function aiUseSync() {
  aiCtl.worker = null;
  aiCtl.sync = aiCtl.sync || new PentAI(typeof AI_WEIGHTS !== 'undefined' ? AI_WEIGHTS : AI_DEFAULT_WEIGHTS, { depth: 2 });
  aiCtl.waiting = false;
}

function aiInit() {
  if (aiCtl.worker || aiCtl.sync) return;
  try {
    aiCtl.worker = new Worker('./js/ai-worker.js');
    aiCtl.worker.onmessage = e => aiReceive(e.data.req, e.data.decision);
    aiCtl.worker.onerror = aiUseSync;   // file:// で開いたときなど
  } catch {
    aiUseSync();
  }
}

function aiRequest() {
  aiCtl.waiting = true;
  const req = ++aiCtl.req;
  const st = aiStateFromGame(game);
  if (aiCtl.worker) {
    aiCtl.worker.postMessage({ req, depth: 2, state: { ...st, board: Array.from(st.board) } });
  } else {
    const d = aiCtl.sync.decide(st);
    aiReceive(req, d && { useHold: d.useHold, path: d.path });
  }
}

function aiReceive(req, d) {
  if (req !== aiCtl.req || !aiCtl.on) return;
  aiCtl.waiting = false;
  // 置ける場所がない（詰み）ならそのまま落とす
  aiCtl.plan = d ? [...(d.useHold ? ['hold'] : []), ...d.path.map(a => AI_STEPS[a]), 'hard'] : ['hard'];
  aiCtl.timer = AI_SPEEDS[settings.aiSpeed].think;
}

function aiStep(step) {
  switch (step) {
    case 'hold': game.holdPiece(); break;
    case 'left': game.move(-1); break;
    case 'right': game.move(1); break;
    case 'down': game.softStep(); break;
    case 'cw': game.rotate(1); break;
    case 'ccw': game.rotate(-1); break;
    case 'hard': game.hardDrop(); break;
  }
}

// AI の操作中は重力を使わず、決めた操作列を一定間隔で入力する
function aiUpdate(dt) {
  game.time += dt;
  if (!game.cur || game.over) return;
  if (!aiCtl.plan) {
    if (!aiCtl.waiting) aiRequest();
    return;
  }
  const { step } = AI_SPEEDS[settings.aiSpeed];
  aiCtl.timer -= dt;
  while (aiCtl.plan && aiCtl.timer <= 0) {
    const s = aiCtl.plan.shift();
    aiStep(s);
    if (s === 'hard' || !aiCtl.plan.length) aiCtl.plan = null;
    aiCtl.timer += step;
  }
}

function aiStop() {
  aiCtl.on = false;
  aiCtl.plan = null;
  aiCtl.waiting = false;
  aiCtl.req++;
  if (el.app.dataset.ai === 'on') {
    el.app.dataset.ai = 'off';
    layout();
  }
}

function updateAiChip() {
  $('#ai-speed').textContent = AI_SPEEDS[settings.aiSpeed].label;
}

const bestKey = () => mode().bestKey + (aiCtl.on ? '.ai' : '');

function haptic(pattern) {
  if (settings.vibrate && isTouch && navigator.vibrate) navigator.vibrate(pattern);
}

// ==================== 画面遷移 ====================
function showOverlay(name) {
  for (const [key, ov] of Object.entries(el.overlays)) ov.classList.toggle('show', key === name);
  el.app.dataset.state = state;
  // 隠れている間はサイズが 0 なので、表示したときに描き直す
  if (name === 'title') drawGallery(el.gallery);
}

function startGame(ai = false) {
  Sfx.init();
  if (!ai && isTouch && settings.control === 'gesture' && !store.get('pent.coached', false)) {
    state = 'coach';
    showOverlay('coach');
    return;
  }
  clearTimeout(overTimer);
  input.reset();
  aiStop();
  if (ai) {
    aiCtl.on = true;
    el.app.dataset.ai = 'on';
    layout();
    aiInit();
    updateAiChip();
  }
  best = store.get(bestKey(), 0);
  renderer.clearFx();
  el.callouts.replaceChildren();
  game.start({ pieceLimit: mode().limit, seed: Number.isNaN(urlSeed) ? undefined : urlSeed });
  state = 'playing';
  shown.score = 0;
  applyLevelHue();
  updateHUD();
  drawHold();
  showOverlay(null);
  Sfx.start();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  input.reset();
  showOverlay('pause');
  Sfx.pause();
}

function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  showOverlay(null);
  Sfx.pause();
}

function toTitle() {
  clearTimeout(overTimer);
  aiStop();
  best = store.get(mode().bestKey, 0);
  state = 'title';
  input.reset();
  game.reset();
  renderer.clearFx();
  el.callouts.replaceChildren();
  shown.score = 0;
  applyLevelHue();
  updateHUD();
  drawHold();
  drawQueue();
  el.titleBest.textContent = best.toLocaleString();
  showOverlay('title');
}

function onGameOver() {
  state = 'over';
  input.reset();
  el.app.dataset.state = state;
  Sfx.gameOver();
  haptic([40, 60, 80]);

  const isBest = game.score > best;
  if (isBest) {
    best = game.score;
    store.set(bestKey(), best);
  }
  const overTitle = $('#over-title');
  overTitle.textContent = game.finished ? 'FINISH' : 'GAME OVER';
  overTitle.classList.toggle('danger', !game.finished);
  $('#over-mode').textContent = mode().label + (aiCtl.on ? ' · AI' : '');
  const sec = game.time / 1000;
  $('#new-best').classList.toggle('show', isBest && game.score > 0);
  $('#final-score').textContent = game.score.toLocaleString();
  $('#r-level').textContent = game.level;
  $('#r-lines').textContent = game.lines;
  $('#r-time').textContent = formatTime(game.time);
  $('#r-pieces').textContent = game.pieces;
  $('#r-ren').textContent = game.maxRen;
  $('#r-pps').textContent = sec > 0 ? (game.pieces / sec).toFixed(2) : '0.00';

  overTimer = setTimeout(() => { if (state === 'over') showOverlay('over'); }, 900);
}

// ==================== HUD ====================
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function applyLevelHue() {
  const hue = LEVEL_HUES[(game.level - 1) % LEVEL_HUES.length];
  document.documentElement.style.setProperty('--accent-h', hue);
}

function updateHUD() {
  el.level.textContent = game.level;
  el.lines.textContent = game.lines;
  el.progress.style.width = `${(game.lines % LINES_PER_LEVEL) * (100 / LINES_PER_LEVEL)}%`;
  el.best.textContent = Math.max(best, game.score).toLocaleString();
  if (mode().limit) el.time.textContent = Math.max(0, mode().limit - game.pieces);

  const showRen = game.ren > 0;
  el.ren.classList.toggle('show', showRen);
  if (showRen) {
    el.renCount.textContent = game.ren;
    el.ren.classList.remove('pop');
    void el.ren.offsetWidth;
    el.ren.classList.add('pop');
  }
}

function tickHUD(dt) {
  if (shown.score !== game.score) {
    const diff = game.score - shown.score;
    shown.score = diff > 0 ? shown.score + Math.max(1, Math.ceil(diff * Math.min(1, dt / 110))) : game.score;
    el.score.textContent = shown.score.toLocaleString();
    if (shown.score > best) el.best.textContent = shown.score.toLocaleString();
  }
  const sec = Math.floor(game.time / 1000);
  if (!mode().limit && sec !== shown.sec) {
    shown.sec = sec;
    el.time.textContent = formatTime(game.time);
  }
}

function drawQueue() {
  el.next.forEach((c, i) => drawPreview(c, game.queue[i] ?? null));
}

function drawHold() {
  drawPreview(el.hold, game.hold, !game.canHold);
}

function showBurst(e) {
  el.callouts.replaceChildren();
  const burst = document.createElement('div');
  burst.className = `burst lines-${e.lines}`;
  const line = (cls, text) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    burst.appendChild(d);
  };
  if (e.allClear) line('tag', 'ALL CLEAR');
  if (e.b2b) line('b2b', 'BACK-TO-BACK');
  if (e.spin) {
    burst.classList.add('spin');
    line('big', `${PIECES[e.id].name}-SPIN`);
    line('kind', CLEAR_NAMES[e.lines] || `${e.lines} LINES`);
  } else {
    line('big', CLEAR_NAMES[e.lines] || `${e.lines} LINES`);
  }
  if (e.ren > 0) line('sub', `${e.ren} REN`);
  line('pts', `+${e.points.toLocaleString()}`);
  if (e.levelUp) line('lvl', `LEVEL ${game.level}`);
  burst.addEventListener('animationend', ev => { if (ev.target === burst) burst.remove(); });
  el.callouts.appendChild(burst);
}

function bump(amount) {
  if (!settings.shake || reducedMotion) return;
  shake.amp = Math.max(shake.amp * Math.exp(-shake.t / 90), amount);
  shake.t = 0;
}

function tickShake(dt) {
  if (!shake.amp) return;
  shake.t += dt;
  const k = Math.exp(-shake.t / 90);
  if (k < 0.02) {
    shake.amp = 0;
    el.frame.style.transform = '';
    return;
  }
  const y = shake.amp * k * Math.cos(shake.t / 26);
  el.frame.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
}

// ==================== レイアウト ====================
function layout() {
  backdrop.resize();
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const border = parseFloat(getComputedStyle(el.frame).borderTopWidth) || 0;
  const rect = el.well.getBoundingClientRect();
  const zone = $('.gesture-zone');
  const zoneOn = getComputedStyle(zone).display !== 'none';
  let availW = rect.width;
  const availH = rect.height - (zoneOn ? parseFloat(getComputedStyle(el.well).rowGap) || 0 : 0);
  if (!mobile) {
    const cs = getComputedStyle(el.app);
    const gap = parseFloat(cs.columnGap) || 0;
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    availW = window.innerWidth - el.sideLeft.offsetWidth - el.sideRight.offsetWidth - gap * 2 - pad;
  }
  const cell = Math.max(8, Math.floor(Math.min((availW - border * 2) / COLS, (availH - border * 2) / ROWS)));
  el.frame.style.width = el.stage.style.width = `${cell * COLS + border * 2}px`;
  el.frame.style.height = el.stage.style.height = `${cell * ROWS + border * 2}px`;
  renderer.resize(cell);
  zone.style.visibility = zoneOn && zone.clientHeight < 48 ? 'hidden' : '';
  drawQueue();
  drawHold();
  drawGallery(el.gallery);
}

// ==================== 設定 ====================
function applySound() {
  Sfx.setEnabled(settings.sound);
  Sfx.setVolume(settings.volume);
  el.soundBtn.querySelector('use').setAttribute('href', settings.sound ? '#i-sound' : '#i-mute');
  el.soundBtn.classList.toggle('off', !settings.sound);
}

function applyMode() {
  best = store.get(mode().bestKey, 0);
  el.titleBest.textContent = best.toLocaleString();
  document.querySelectorAll('[data-mode]').forEach(b => {
    b.setAttribute('aria-checked', String(b.dataset.mode === settings.mode));
  });
  $('#stat3-label').textContent = mode().limit ? 'LEFT' : 'TIME';
  shown.sec = -1;
  updateHUD();
}

function applyControl() {
  document.documentElement.dataset.ctl = settings.control;
  document.querySelectorAll('[data-ctl]').forEach(b => {
    b.setAttribute('aria-checked', String(b.dataset.ctl === settings.control));
  });
  layout();
}

function bindSettings() {
  const toggle = (id, key, apply) => {
    const inp = $(id);
    inp.addEventListener('change', () => {
      settings[key] = inp.checked;
      if (apply) apply();
      saveSettings();
    });
  };
  const range = (id, key, out, fmt, apply) => {
    const inp = $(id);
    inp.addEventListener('input', () => {
      settings[key] = parseFloat(inp.value);
      if (out) $(out).textContent = fmt(settings[key]);
      if (apply) apply();
      saveSettings();
    });
  };
  toggle('#s-sound', 'sound', applySound);
  toggle('#s-ghost', 'ghost');
  toggle('#s-grid', 'grid', () => renderer.setGrid(settings.grid));
  toggle('#s-shake', 'shake');
  toggle('#s-vibrate', 'vibrate', () => haptic(20));
  range('#s-sens', 'sens', '#o-sens', v => `×${v.toFixed(1)}`);
  range('#s-volume', 'volume', null, null, applySound);
  range('#s-das', 'das', '#o-das', v => `${v}ms`);
  range('#s-arr', 'arr', '#o-arr', v => `${v}ms`);

  $('#reset-best').addEventListener('click', () => {
    if (!confirm('ハイスコアをリセットしますか？')) return;
    best = 0;
    store.set('pent.best', 0);
    el.titleBest.textContent = '0';
    updateHUD();
  });
}

function syncSettingsForm() {
  $('#s-sound').checked = settings.sound;
  $('#s-ghost').checked = settings.ghost;
  $('#s-grid').checked = settings.grid;
  $('#s-shake').checked = settings.shake;
  $('#s-vibrate').checked = settings.vibrate;
  $('#s-sens').value = settings.sens;
  $('#o-sens').textContent = `×${settings.sens.toFixed(1)}`;
  $('#s-volume').value = settings.volume;
  $('#s-das').value = settings.das;
  $('#s-arr').value = settings.arr;
  $('#o-das').textContent = `${settings.das}ms`;
  $('#o-arr').textContent = `${settings.arr}ms`;
}

function openDialog(dlg) {
  pause();
  syncSettingsForm();
  dlg.showModal();
}

// ==================== 入力 ====================
function act(action) {
  switch (action) {
    case 'start': startGame(false); break;
    case 'ai': startGame(true); break;
    case 'restart': startGame(aiCtl.on); break;
    case 'ai-speed':
      settings.aiSpeed = (settings.aiSpeed + 1) % AI_SPEEDS.length;
      saveSettings();
      updateAiChip();
      break;
    case 'resume': resume(); break;
    case 'pause':
      if (state === 'playing') pause();
      else if (state === 'paused') resume();
      break;
    case 'title': toTitle(); break;
    case 'sound':
      settings.sound = !settings.sound;
      applySound();
      saveSettings();
      break;
    case 'settings': openDialog(el.dlgSettings); break;
    case 'help': openDialog(el.dlgHelp); break;
    case 'share-score':
      WebAppKit.share({
        text: `QUINTILE（${mode().label}${aiCtl.on ? '・AI' : ''}）で ${game.score.toLocaleString()} 点！`,
      });
      break;
    case 'coach-ok':
      store.set('pent.coached', true);
      startGame();
      break;
  }
}

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  Sfx.init();
  Sfx.ui();
  btn.blur();
  act(btn.dataset.act);
});

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-ctl]');
  if (!btn) return;
  Sfx.init();
  Sfx.ui();
  settings.control = btn.dataset.ctl;
  saveSettings();
  applyControl();
});

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-mode]');
  if (!btn || state !== 'title') return;
  Sfx.init();
  Sfx.ui();
  settings.mode = btn.dataset.mode;
  saveSettings();
  applyMode();
});

document.addEventListener('keydown', e => {
  Sfx.init();
  if (document.querySelector('dialog[open]')) return;
  const code = e.code;

  if (state === 'playing') {
    if (code === 'Escape' || code === 'KeyP') {
      e.preventDefault();
      pause();
      return;
    }
    const action = KEYMAP[code];
    if (action) {
      e.preventDefault();
      if (!e.repeat && !aiCtl.on) input.press(action);
    }
    return;
  }

  if (KEYMAP[code]) e.preventDefault();
  if (state === 'title') {
    if (code === 'Enter') { e.preventDefault(); startGame(); }
  } else if (state === 'coach') {
    if (code === 'Enter') { e.preventDefault(); act('coach-ok'); }
  } else if (state === 'paused') {
    if (code === 'Escape' || code === 'KeyP' || code === 'Enter') { e.preventDefault(); resume(); }
    else if (code === 'KeyR') { e.preventDefault(); startGame(aiCtl.on); }
  } else if (state === 'over' && el.overlays.over.classList.contains('show')) {
    if (code === 'Enter' || code === 'KeyR') { e.preventDefault(); startGame(aiCtl.on); }
    else if (code === 'Escape') toTitle();
  }
});

document.addEventListener('keyup', e => {
  const action = KEYMAP[e.code];
  if (action && state === 'playing') input.release(action);
});

document.querySelectorAll('.pad-btn').forEach(btn => {
  const key = btn.dataset.key;
  const up = () => {
    if (!btn.classList.contains('down')) return;
    btn.classList.remove('down');
    if (state === 'playing') input.release(key);
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sfx.init();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('down');
    if (state === 'playing' && !aiCtl.on) input.press(key);
  });
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
});

// HOLD 枠のタップでもホールド
$('.hold-card').addEventListener('pointerdown', e => {
  if (state !== 'playing' || aiCtl.on) return;
  e.preventDefault();
  game.holdPiece();
});

landscapePhone.addEventListener('change', () => { if (landscapePhone.matches) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', pause);
window.addEventListener('resize', layout);

// ==================== ループ ====================
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  if (state === 'playing') {
    if (aiCtl.on) {
      aiUpdate(dt);
    } else {
      input.update(dt);
      game.update(dt);
    }
  }
  renderer.update(dt, game.over);
  renderer.draw(game, { ghost: settings.ghost, showPiece: state === 'playing' || state === 'paused' });
  backdrop.update(dt);
  backdrop.draw();
  tickHUD(dt);
  tickShake(dt);
  requestAnimationFrame(frame);
}

// ==================== 起動 ====================
document.documentElement.classList.toggle('touch', isTouch);
document.documentElement.classList.toggle('can-vibrate', 'vibrate' in navigator);
$('#version').textContent = VERSION;
renderer.grid = settings.grid;
WebAppKit.init({
  title: 'QUINTILE — 5 マスのブロックで列を消す',
  text: '5 マスのブロック「ペントミノ」で遊ぶ落ち物パズル',
});
// オフラインでも起動できるようにする
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
bindSettings();
syncSettingsForm();
applySound();
toTitle();
applyMode();
applyControl();
if (document.fonts) document.fonts.ready.then(layout);
requestAnimationFrame(frame);
