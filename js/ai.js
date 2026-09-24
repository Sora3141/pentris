'use strict';

// ==================== AI ====================
// 盤面は 1 行 = 1 つの整数（ビットマスク）で持つ。
// 操作で到達できる置き方をすべて列挙し、「得点 + 置いた後の盤面評価」が最大の手を選ぶ。

const FULL_ROW = (1 << COLS) - 1;
const I_PIECE = PIECES.findIndex(p => p.name === 'I');

// 評価に使う特徴量（重みはこの順番）
const AI_FEATURES = [
  'holes',          // 穴の数
  'holeRows',       // 穴がある行の数
  'rowTrans',       // 行方向の埋まり/空きの切り替わり
  'colTrans',       // 列方向の切り替わり
  'bumpiness',      // 隣の列との高さの差の合計
  'wells',          // 溝の深さ（深いほど大きく）
  'maxHeight',      // 一番高い列
  'danger',         // 上限付近まで積んだときの危険度
  'pentaReady',     // I を縦に入れれば消える行が何段できているか（最大 5）
  'b2b',            // Back-to-Back が継続中か
  'ren',            // REN 数
  'holdI',          // I を HOLD しているか
  'reward',         // この手で得た点（ドロップ点込み。レベルで割って 100 で割った値）
];
const NF = AI_FEATURES.length;

function popcnt(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

// 回転ごとの形（左上に詰めたビットマスク）
const AI_SHAPES = PIECES.map(p => {
  const shapes = p.rotations.map(cells => {
    const minX = Math.min(...cells.map(c => c[0]));
    const minY = Math.min(...cells.map(c => c[1]));
    const w = Math.max(...cells.map(c => c[0])) - minX + 1;
    const h = Math.max(...cells.map(c => c[1])) - minY + 1;
    const rows = new Array(h).fill(0);
    for (const [x, y] of cells) rows[y - minY] |= 1 << (x - minX);
    return { rows, w, h, offX: minX, offY: minY, key: rows.join(',') };
  });
  // 見た目が同じ回転は同じ置き方として扱う
  shapes.forEach(s => { s.canon = shapes.findIndex(t => t.key === s.key); });
  return shapes;
});

const AI_KICKS = PIECES.map(p => [0, 1, 2, 3].map(from => [kickTests(p.id, from, 1), kickTests(p.id, from, -1)]));

// 出現位置（左上に詰めた座標系）
const AI_SPAWN = PIECES.map(p => {
  const s = AI_SHAPES[p.id][0];
  return { px: Math.floor((COLS - p.size) / 2) + s.offX, py: HIDDEN - s.h + 1 };
});

function aiFits(board, s, px, py) {
  if (px < 0 || px + s.w > COLS || py < 0 || py + s.h > TOTAL_ROWS) return false;
  const rows = s.rows;
  for (let r = 0; r < rows.length; r++) if (board[py + r] & (rows[r] << px)) return false;
  return true;
}

function spawnFits(board, id) {
  const sp = AI_SPAWN[id];
  return aiFits(board, AI_SHAPES[id][0], sp.px, sp.py);
}

// 操作コード
const ACT = { LEFT: 0, RIGHT: 1, DOWN: 2, CW: 3, CCW: 4 };
const NSTATE = 4 * COLS * TOTAL_ROWS * 2;

// 出現位置から幅優先探索して、固定できる置き方を列挙する
class MoveGen {
  constructor() {
    this.visited = new Int32Array(NSTATE);
    this.parent = new Int32Array(NSTATE);
    this.act = new Int8Array(NSTATE);
    this.queue = new Int32Array(NSTATE);
    this.seen = new Int32Array(NSTATE);
    this.stamp = 0;
  }

  generate(board, id) {
    const out = [];
    const shapes = AI_SHAPES[id];
    const sp = AI_SPAWN[id];
    if (!aiFits(board, shapes[0], sp.px, sp.py)) return out;
    const stamp = ++this.stamp;
    const { visited, parent, act, queue, seen } = this;
    let head = 0, tail = 0;
    const enc = (rot, px, py, lr) => (((rot * COLS + px) * TOTAL_ROWS + py) << 1) | lr;
    const push = (idx, from, a) => {
      if (visited[idx] === stamp) return;
      visited[idx] = stamp;
      parent[idx] = from;
      act[idx] = a;
      queue[tail++] = idx;
    };
    push(enc(0, sp.px, sp.py, 0), -1, -1);

    while (head < tail) {
      const s = queue[head++];
      const lr = s & 1;
      let t = s >> 1;
      const py = t % TOTAL_ROWS; t = (t / TOTAL_ROWS) | 0;
      const px = t % COLS;
      const rot = (t / COLS) | 0;
      const sh = shapes[rot];

      // 横移動と回転を先に展開する（同じ手数なら「先に位置を合わせてからハードドロップ」の経路になる）
      const canFall = aiFits(board, sh, px, py + 1);
      if (!canFall) {
        const spin = lr === 1
          && !aiFits(board, sh, px - 1, py)
          && !aiFits(board, sh, px + 1, py)
          && !aiFits(board, sh, px, py - 1) ? 1 : 0;
        const key = enc(sh.canon, px, py, spin);
        if (seen[key] !== stamp) {
          seen[key] = stamp;
          // ドロップ点: 最後に続く下移動はハードドロップ（2 点/マス）、途中の下移動はソフトドロップ（1 点/マス）
          let hard = 0, soft = 0, trailing = true;
          for (let t = s; parent[t] !== -1; t = parent[t]) {
            if (act[t] === ACT.DOWN) { if (trailing) hard++; else soft++; } else trailing = false;
          }
          out.push({ rot, px, py, spin, state: s, drop: soft + hard * 2 });
        }
      }
      if (aiFits(board, sh, px - 1, py)) push(enc(rot, px - 1, py, 0), s, ACT.LEFT);
      if (aiFits(board, sh, px + 1, py)) push(enc(rot, px + 1, py, 0), s, ACT.RIGHT);

      const x = px - sh.offX, y = py - sh.offY;
      for (let d = 0; d < 2; d++) {
        const to = (rot + (d === 0 ? 1 : 3)) % 4;
        const ts = shapes[to];
        for (const [kx, ky] of AI_KICKS[id][rot][d]) {
          const npx = x + kx + ts.offX, npy = y + ky + ts.offY;
          if (aiFits(board, ts, npx, npy)) {
            const changed = ts.key !== sh.key || npx !== px || npy !== py;
            push(enc(to, npx, npy, changed ? 1 : lr), s, d === 0 ? ACT.CW : ACT.CCW);
            break;
          }
        }
      }
      if (canFall) push(enc(rot, px, py + 1, 0), s, ACT.DOWN);
    }
    return out;
  }

  // 置き方までの操作列（最後にハードドロップする前提）
  path(state) {
    const acts = [];
    for (let s = state; this.parent[s] !== -1; s = this.parent[s]) acts.push(this.act[s]);
    acts.reverse();
    while (acts.length && acts[acts.length - 1] === ACT.DOWN) acts.pop();
    return acts;
  }
}

// 置いてライン消去と得点計算まで行う（Game.lock と同じ規則）
function aiApply(st, id, m) {
  const sh = AI_SHAPES[id][m.rot];
  const src = st.board;
  const board = new Int32Array(TOTAL_ROWS);
  const tmp = src.slice();
  for (let r = 0; r < sh.h; r++) tmp[m.py + r] |= sh.rows[r] << m.px;

  let n = 0, w = TOTAL_ROWS - 1;
  for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
    if (tmp[r] === FULL_ROW) { n++; continue; }
    board[w--] = tmp[r];
  }

  let { b2b, ren, level, lines } = st;
  let points = 0, allClear = false;
  if (n > 0) {
    ren++;
    allClear = board[TOTAL_ROWS - 1] === 0;
    const difficult = m.spin === 1 || n >= 4;
    const b2bOn = difficult && b2b;
    b2b = difficult;
    let base = (m.spin ? SPIN_POINTS : LINE_POINTS)[n] || 100;
    if (b2bOn) base = Math.floor(base * B2B_MULTIPLIER);
    points = base * level;
    if (ren > 0) points += REN_BONUS * Math.min(ren, REN_CAP) * level;
    if (allClear) points += ALL_CLEAR_BONUS * level;
    lines += n;
    level = Math.floor(lines / LINES_PER_LEVEL) + 1;
  } else {
    ren = -1;
  }
  const lockOut = m.py + sh.h - 1 < HIDDEN;
  return { board, b2b, ren, level, lines, points, drop: m.drop || 0, cleared: n, lockOut, allClear, prevLevel: st.level };
}

const HEIGHTS = new Int32Array(COLS);
const DEPTH = new Int32Array(COLS);

function aiFeatures(st, holdI, out) {
  const b = st.board;
  HEIGHTS.fill(0);
  DEPTH.fill(0);
  let seen = 0, holes = 0, holeRows = 0, rowT = 0, colT = 0, wells = 0, prev = 0;
  const edge = 1 << (COLS + 1), mask2 = (1 << (COLS + 2)) - 1;
  for (let r = 0; r < TOTAL_ROWS; r++) {
    const row = b[r];
    const fresh = row & ~seen;
    if (fresh) for (let c = 0; c < COLS; c++) if (fresh & (1 << c)) HEIGHTS[c] = TOTAL_ROWS - r;
    const h = seen & ~row;
    if (h) { holes += popcnt(h); holeRows++; }
    seen |= row;
    const x = (row << 1) | 1 | edge;
    rowT += popcnt((x ^ (x >>> 1)) & mask2) - 1;
    colT += popcnt(row ^ prev);
    prev = row;
    if (row) {
      const wm = ~row & ((row << 1) | 1) & ((row >>> 1) | (1 << (COLS - 1))) & FULL_ROW;
      for (let c = 0; c < COLS; c++) {
        if (wm & (1 << c)) { DEPTH[c]++; wells += DEPTH[c]; } else DEPTH[c] = 0;
      }
    }
  }
  colT += popcnt(~prev & FULL_ROW);

  let bump = 0, maxH = 0, minC = 0;
  for (let c = 0; c < COLS; c++) {
    if (HEIGHTS[c] > maxH) maxH = HEIGHTS[c];
    if (HEIGHTS[c] < HEIGHTS[minC]) minC = c;
    if (c > 0) bump += Math.abs(HEIGHTS[c] - HEIGHTS[c - 1]);
  }
  // 一番低い列を I 用の溝とみなし、そこ以外が埋まった行が何段続くか
  let ready = 0;
  const bit = 1 << minC;
  for (let r = TOTAL_ROWS - 1 - HEIGHTS[minC]; r >= 0 && ready < 5; r--) {
    if ((b[r] & bit) === 0 && (b[r] | bit) === FULL_ROW) ready++;
    else break;
  }
  const over = Math.max(0, maxH - (ROWS - 6));

  out[0] = holes;
  out[1] = holeRows;
  out[2] = rowT;
  out[3] = colT;
  out[4] = bump;
  out[5] = wells;
  out[6] = maxH;
  out[7] = over * over;
  out[8] = ready;
  out[9] = st.b2b ? 1 : 0;
  out[10] = Math.max(0, Math.min(st.ren, REN_CAP));
  out[11] = holdI ? 1 : 0;
  out[12] = (st.points + st.drop) / (100 * st.prevLevel);
  return out;
}

// 学習済みの重み（tools/train.js の出力で上書きされる）
const AI_DEFAULT_WEIGHTS = [-8, -5, -3, -9, -1, -3, -1, -5, 3, 5, 1, 3, 1];

class PentAI {
  constructor(weights = AI_DEFAULT_WEIGHTS, { depth = 1 } = {}) {
    this.w = weights;
    this.depth = depth;
    this.gen = [new MoveGen(), new MoveGen()];
    this.f = new Float64Array(NF);
  }

  score(st, holdI) {
    const f = aiFeatures(st, holdI, this.f);
    let v = 0;
    for (let i = 0; i < NF; i++) v += this.w[i] * f[i];
    return v;
  }

  // st: { board, cur, hold, canHold, queue, b2b, ren, level, lines }
  decide(st) {
    const options = [{ useHold: false, id: st.cur, hold: st.hold, queue: st.queue }];
    if (st.canHold) {
      if (st.hold === null) options.push({ useHold: true, id: st.queue[0], hold: st.cur, queue: st.queue.slice(1) });
      else if (st.hold !== st.cur) options.push({ useHold: true, id: st.hold, hold: st.cur, queue: st.queue });
    }

    let best = null;
    for (const o of options) {
      if (o.id === undefined) continue;
      const holdI = o.hold === I_PIECE;
      const moves = this.gen[0].generate(st.board, o.id);
      for (const m of moves) {
        const a = aiApply(st, o.id, m);
        if (a.lockOut) continue;
        const nextId = o.queue[0];
        if (nextId !== undefined && !spawnFits(a.board, nextId)) continue;
        let v;
        if (this.depth >= 2 && nextId !== undefined) {
          v = this.w[12] * (a.points + a.drop) / (100 * a.prevLevel) + this.lookahead(a, nextId, o.queue[1], holdI);
        } else {
          v = this.score(a, holdI);
        }
        if (!best || v > best.v) best = { v, o, m, a };
      }
    }
    if (!best) return null;
    return {
      useHold: best.o.useHold,
      id: best.o.id,
      rot: best.m.rot,
      px: best.m.px,
      py: best.m.py,
      spin: best.m.spin,
      path: this.pathFor(st.board, best),
      value: best.v,
      after: best.a,
    };
  }

  lookahead(st, id, afterId, holdI) {
    let best = -1e9;
    for (const m of this.gen[1].generate(st.board, id)) {
      const a = aiApply(st, id, m);
      if (a.lockOut) continue;
      if (afterId !== undefined && !spawnFits(a.board, afterId)) continue;
      const v = this.score(a, holdI);
      if (v > best) best = v;
    }
    return best;
  }

  // 選んだ手の操作列を復元する（HOLD 側の探索で記録が上書きされているので探索し直す）
  pathFor(board, best) {
    this.gen[0].generate(board, best.o.id);
    return this.gen[0].path(best.m.state);
  }
}

// Game の状態を AI 用に変換する
function aiStateFromGame(game) {
  const board = new Int32Array(TOTAL_ROWS);
  for (let r = 0; r < TOTAL_ROWS; r++) {
    let m = 0;
    for (let c = 0; c < COLS; c++) if (game.board[r][c]) m |= 1 << c;
    board[r] = m;
  }
  return {
    board,
    cur: game.cur.id,
    hold: game.hold,
    canHold: game.canHold,
    queue: game.queue.slice(),
    b2b: game.b2b,
    ren: game.ren,
    level: game.level,
    lines: game.lines,
  };
}
