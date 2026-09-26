'use strict';

// ==================== ルール ====================
const NEXT_COUNT = 5;
const LINE_POINTS = [0, 100, 300, 700, 1500, 5000];   // × レベル
const SPIN_POINTS = [0, 400, 1000, 1800, 3000, 7500];  // スピンで消したとき × レベル
const B2B_MULTIPLIER = 1.5;                             // 4 ライン以上 / スピン消去の連続
const REN_BONUS = 50;                                   // × min(REN, REN_CAP) × レベル
const REN_CAP = 10;
const ALL_CLEAR_BONUS = 3000;                           // × レベル
const LINES_PER_LEVEL = 10;
const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;

// シード付き乱数（同じシードなら同じピース順になる）
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// DOM に依存しないゲーム本体。状態の変化はイベントで通知する。
// board の値: 0 = 空き、それ以外 = (置いたピースの通し番号 << 2) | (CHIRAL + 1)。
// 通し番号は、同じピースのマスをつなげて描くのに使う（renderer.js）。
class Game {
  constructor(handlers = {}) {
    this.on = handlers;
    this.reset();
  }

  emit(type, data) {
    const fn = this.on[type];
    if (fn) fn(data);
  }

  reset() {
    this.board = Array.from({ length: TOTAL_ROWS }, () => new Array(COLS).fill(0));
    this.score = 0;
    this.level = 1;
    this.lines = 0;
    this.ren = -1;
    this.maxRen = 0;
    this.pieces = 0;
    this.time = 0;
    this.b2b = false;
    this.lastRotate = false;
    this.finished = false;
    this.queue = [];
    this.bag = [];
    this.serial = 0;
    this.hold = null;
    this.canHold = true;
    this.cur = null;
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = 0;
    this.softDrop = false;
    this.over = false;
  }

  // options: { seed, pieceLimit }  pieceLimit を指定するとその手数で終了
  start(options = {}) {
    this.reset();
    this.seed = options.seed ?? Math.floor(Math.random() * 2 ** 32);
    this.pieceLimit = options.pieceLimit || 0;
    this.rng = mulberry32(this.seed);
    this.fillQueue();
    this.next();
  }

  // 800ms から 1 レベルごとに 0.9 倍、下限 100ms
  get dropInterval() {
    return Math.max(100, 800 * Math.pow(0.9, this.level - 1));
  }

  get lockProgress() {
    return this.cur && this.grounded() ? Math.min(1, this.lockTimer / LOCK_DELAY) : 0;
  }

  // 18 種を 1 個ずつ入れた袋から順に取り出す（空になったら補充）
  fillQueue() {
    while (this.queue.length < NEXT_COUNT) {
      if (this.bag.length === 0) {
        this.bag = PIECES.map(p => p.id);
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop());
    }
  }

  fits(id, rot, x, y) {
    for (const [cx, cy] of PIECES[id].rotations[rot]) {
      const bx = x + cx, by = y + cy;
      if (bx < 0 || bx >= COLS || by < 0 || by >= TOTAL_ROWS) return false;
      if (this.board[by][bx]) return false;
    }
    return true;
  }

  cells(p = this.cur, y = p.y) {
    return PIECES[p.id].rotations[p.rot].map(([cx, cy]) => [p.x + cx, y + cy]);
  }

  grounded() {
    const c = this.cur;
    return !this.fits(c.id, c.rot, c.x, c.y + 1);
  }

  ghostY() {
    const c = this.cur;
    let y = c.y;
    while (this.fits(c.id, c.rot, c.x, y + 1)) y++;
    return y;
  }

  next() {
    const id = this.queue.shift();
    this.fillQueue();
    return this.spawn(id);
  }

  // 出現位置: ピースの一番下の段だけが画面の最上段に見え、残りは画面外にある位置
  spawnPos(id) {
    const p = PIECES[id];
    const maxY = Math.max(...p.rotations[0].map(c => c[1]));
    return { x: Math.floor((COLS - p.size) / 2), y: HIDDEN - maxY };
  }

  // 次のピースの出現マス（ここが埋まっているとゲームオーバー）
  spawnCells(id) {
    const { x, y } = this.spawnPos(id);
    return PIECES[id].rotations[0].map(([cx, cy]) => [x + cx, y + cy]);
  }

  spawn(id) {
    const { x, y } = this.spawnPos(id);
    this.cur = { id, rot: 0, x, y };
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = y;
    this.lastRotate = false;
    if (!this.fits(id, 0, x, y)) {
      this.gameOver();
      return false;
    }
    this.emit('spawn');
    return true;
  }

  // 接地中の操作で固定までの猶予をリセット（回数制限あり）
  afterAction() {
    const c = this.cur;
    if (c.y > this.lowestY) {
      this.lowestY = c.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    } else if (this.grounded() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    const c = this.cur;
    if (!c || this.over) return false;
    if (!this.fits(c.id, c.rot, c.x + dx, c.y)) return false;
    c.x += dx;
    this.lastRotate = false;
    this.afterAction();
    return true;
  }

  rotate(dir) {
    const c = this.cur;
    if (!c || this.over) return false;
    const to = (c.rot + dir + 4) % 4;
    for (const [kx, ky] of kickTests(c.id, c.rot, dir)) {
      if (this.fits(c.id, to, c.x + kx, c.y + ky)) {
        const before = this.cells().map(String).sort().join();
        c.rot = to;
        c.x += kx;
        c.y += ky;
        // X のように回しても形が変わらない場合は回転扱いにしない
        if (this.cells().map(String).sort().join() !== before) this.lastRotate = true;
        this.afterAction();
        return true;
      }
    }
    return false;
  }

  stepDown() {
    const c = this.cur;
    if (!this.fits(c.id, c.rot, c.x, c.y + 1)) return false;
    c.y++;
    this.lastRotate = false;
    if (c.y > this.lowestY) {
      this.lowestY = c.y;
      this.lockResets = 0;
      this.lockTimer = 0;
    }
    return true;
  }

  setSoftDrop(on) {
    if (on === this.softDrop) return;
    this.softDrop = on;
    this.gravityAcc = 0;
    if (on && this.cur && !this.over && this.stepDown()) {
      this.score += 1;
      this.emit('score');
    }
  }

  // スワイプ操作用: 1 マスだけソフトドロップ
  softStep() {
    if (!this.cur || this.over || !this.stepDown()) return false;
    this.score += 1;
    this.emit('score');
    return true;
  }

  hardDrop() {
    const c = this.cur;
    if (!c || this.over) return;
    const fromY = c.y;
    const from = this.cells();
    c.y = this.ghostY();
    const dist = c.y - fromY;
    if (dist > 0) this.lastRotate = false;
    this.score += dist * 2;
    this.emit('hardDrop', { id: c.id, from, to: this.cells(), dist });
    this.lock();
  }

  holdPiece() {
    if (!this.cur || this.over || !this.canHold) return false;
    const id = this.cur.id;
    this.canHold = false;
    if (this.hold === null) {
      this.hold = id;
      this.next();
    } else {
      const swap = this.hold;
      this.hold = id;
      this.spawn(swap);
    }
    this.emit('hold');
    return true;
  }

  update(dt) {
    if (!this.cur || this.over) return;
    this.time += dt;

    if (this.grounded()) {
      this.gravityAcc = 0;
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this.lock();
      return;
    }

    const interval = this.softDrop ? Math.min(this.dropInterval / 10, 40) : this.dropInterval;
    this.gravityAcc += dt;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this.stepDown()) { this.gravityAcc = 0; break; }
      if (this.softDrop) { this.score += 1; this.emit('score'); }
    }
  }

  // 最後の操作が回転で、左右・上のどこにも動けなければスピン
  isSpin() {
    const c = this.cur;
    return this.lastRotate
      && !this.fits(c.id, c.rot, c.x - 1, c.y)
      && !this.fits(c.id, c.rot, c.x + 1, c.y)
      && !this.fits(c.id, c.rot, c.x, c.y - 1);
  }

  lock() {
    const c = this.cur;
    const cells = this.cells();
    const spin = this.isSpin();
    const mark = (++this.serial << 2) | (PIECES[c.id].chiral + 1);
    for (const [x, y] of cells) {
      if (y >= 0) this.board[y][x] = mark;
    }
    this.pieces++;
    const lockOut = cells.every(([, y]) => y < HIDDEN);

    const cleared = [];
    for (let y = 0; y < TOTAL_ROWS; y++) {
      if (this.board[y].every(v => v)) cleared.push(y);
    }
    const clearedCells = cleared.map(y => this.board[y].slice());
    if (cleared.length) this.splitPieces(cleared);
    for (const y of cleared) {
      this.board.splice(y, 1);
      this.board.unshift(new Array(COLS).fill(0));
    }

    const n = cleared.length;
    let points = 0, allClear = false, levelUp = false, b2b = false;
    if (n > 0) {
      this.ren++;
      this.maxRen = Math.max(this.maxRen, this.ren);
      allClear = this.board.every(row => row.every(v => !v));
      const difficult = spin || n >= 4;
      b2b = difficult && this.b2b;
      this.b2b = difficult;
      let base = (spin ? SPIN_POINTS : LINE_POINTS)[n] || 100;
      if (b2b) base = Math.floor(base * B2B_MULTIPLIER);
      points = base * this.level;
      if (this.ren > 0) points += REN_BONUS * Math.min(this.ren, REN_CAP) * this.level;
      if (allClear) points += ALL_CLEAR_BONUS * this.level;
      this.score += points;
      this.lines += n;
      const newLevel = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
      if (newLevel > this.level) { this.level = newLevel; levelUp = true; }
    } else {
      this.ren = -1;
    }

    this.cur = null;
    this.emit('lock', { id: c.id, cells, cleared, clearedCells, lines: n, points, ren: this.ren, allClear, levelUp, spin, b2b });

    if (lockOut) { this.gameOver(); return; }
    if (this.pieceLimit && this.pieces >= this.pieceLimit) {
      this.finished = true;
      this.gameOver();
      return;
    }
    this.canHold = true;
    this.next();
  }

  // 消える行で切れたピースは、残った部分ごとに別のピースとして番号を付け直す
  // （消えたあとに上下がくっついても、1 つの形としてつなげて描かないように）
  splitPieces(cleared) {
    const gone = new Set(cleared);
    const b = this.board;
    const done = b.map(row => row.map(() => false));
    for (let y = 0; y < TOTAL_ROWS; y++) {
      if (gone.has(y)) continue;
      for (let x = 0; x < COLS; x++) {
        const v = b[y][x];
        if (!v || done[y][x]) continue;
        const mark = (++this.serial << 2) | (v & 3);
        const stack = [[x, y]];
        done[y][x] = true;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          b[cy][cx] = mark;
          for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
            if (nx < 0 || nx >= COLS || ny < 0 || ny >= TOTAL_ROWS || gone.has(ny) || done[ny][nx] || b[ny][nx] !== v) continue;
            done[ny][nx] = true;
            stack.push([nx, ny]);
          }
        }
      }
    }
  }

  gameOver() {
    this.over = true;
    this.softDrop = false;
    this.emit('gameover');
  }
}
