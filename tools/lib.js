'use strict';
// ブラウザ用のスクリプト（js/*.js）を Node で読み込むための共通処理
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['pieces', 'game', 'ai', 'ai-weights'];

function load() {
  const src = FILES
    .map(f => path.join(ROOT, 'js', `${f}.js`))
    .filter(f => fs.existsSync(f))
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n;\n');
  const api = new Function(`${src}
    return {
      COLS, ROWS, HIDDEN, TOTAL_ROWS, NEXT_COUNT, PIECES, Game, mulberry32,
      PentAI, ACT, AI_FEATURES, AI_DEFAULT_WEIGHTS, aiStateFromGame, spawnFits,
      AI_WEIGHTS: typeof AI_WEIGHTS !== 'undefined' ? AI_WEIGHTS : null,
    };`)();
  api.simulate = (ai, seed, limit) => simulate(api, ai, seed, limit);
  return api;
}

// AI 内部の盤面だけで 1 ゲーム遊ぶ（学習用に高速）。ピース順は Game と同じ。
function simulate({ TOTAL_ROWS, NEXT_COUNT, PIECES, mulberry32, spawnFits }, ai, seed, limit) {
  const rng = mulberry32(seed);
  let bag = [];
  const draw = () => {
    if (!bag.length) {
      bag = PIECES.map(p => p.id);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
  const queue = [];
  while (queue.length < NEXT_COUNT) queue.push(draw());
  let cur = queue.shift();
  queue.push(draw());
  let st = { board: new Int32Array(TOTAL_ROWS), b2b: false, ren: -1, level: 1, lines: 0 };
  let hold = null, canHold = true, score = 0, pieces = 0, spins = 0, pentas = 0, maxRen = 0;
  while (!limit || pieces < limit) {
    if (!spawnFits(st.board, cur)) break;
    const d = ai.decide({ ...st, cur, hold, canHold, queue });
    if (!d) break;
    if (d.useHold) {
      canHold = false;
      if (hold === null) { hold = cur; cur = queue.shift(); queue.push(draw()); }
      else [hold, cur] = [cur, hold];
    }
    st = d.after;
    score += st.points + st.drop;
    pieces++;
    if (d.spin && st.cleared) spins++;
    if (st.cleared === 5) pentas++;
    maxRen = Math.max(maxRen, st.ren);
    if (st.lockOut) break;
    canHold = true;
    cur = queue.shift();
    queue.push(draw());
  }
  return { score, pieces, lines: st.lines, level: st.level, spins, pentas, maxRen };
}

module.exports = { load };
