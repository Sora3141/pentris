'use strict';
// AI の評価関数の重みを学習する（クロスエントロピー法）
//   node tools/train.js [--gens 30] [--pop 48] [--games 4] [--limit 500] [--depth 1]
// --depth 2 にするとブラウザと同じ 2 手読みで学習する（遅いが本番に近い）
// 500 手モードの平均スコアが最大になる重みを探し、js/ai-weights.js に書き出す。
const os = require('os');
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');
const { load } = require('./lib');

if (!isMainThread) {
  const P = load();
  parentPort.on('message', ({ id, weights, seeds, limit, depth }) => {
    const ai = new P.PentAI(weights, { depth });
    const results = seeds.map(seed => P.simulate(ai, seed, limit));
    parentPort.postMessage({ id, results });
  });
  return;
}

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), Number(arr[i + 1])]);
  return acc;
}, []));
const GENS = args.gens || 30, POP = args.pop || 48, GAMES = args.games || 4, LIMIT = args.limit || 500, DEPTH = args.depth || 1;
const ELITE = Math.max(4, Math.round(POP / 6));

const P = load();
const REWARD = P.AI_FEATURES.indexOf('reward');

// ワーカーのプール
const workers = Array.from({ length: Math.max(1, os.cpus().length - 1) }, () => new Worker(__filename));
let nextId = 0;
const pending = new Map();
workers.forEach(w => w.on('message', ({ id, results }) => { pending.get(id)(results); pending.delete(id); }));
const idle = [...workers];
const waiting = [];
function run(job) {
  return new Promise(resolve => {
    const start = w => {
      const id = nextId++;
      pending.set(id, results => { resolve(results); const q = waiting.shift(); if (q) q(w); else idle.push(w); });
      w.postMessage({ id, ...job });
    };
    const w = idle.pop();
    if (w) start(w); else waiting.push(start);
  });
}

const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

async function evaluate(weights, seeds, depth = DEPTH) {
  const chunks = seeds.map(s => run({ weights, seeds: [s], limit: LIMIT, depth }));
  return (await Promise.all(chunks)).flat();
}

(async () => {
  const start = P.AI_WEIGHTS || P.AI_DEFAULT_WEIGHTS;
  let mu = start.slice();
  let sd = mu.map((m, i) => (i === REWARD ? 0 : Math.max(DEPTH > 1 ? 1 : 2, Math.abs(m) * (DEPTH > 1 ? 0.3 : 0.6))));
  mu[REWARD] = 1;  // 重み全体の大きさは自由なので、得点の重みを 1 に固定する
  console.log(`CEM: ${GENS} 世代 × ${POP} 候補 × ${GAMES} ゲーム（${LIMIT} 手, ${DEPTH} 手読み）, ワーカー ${workers.length}`);

  let bestEver = null;
  for (let g = 0; g < GENS; g++) {
    const t0 = Date.now();
    const seeds = Array.from({ length: GAMES }, (_, i) => 10000 + g * GAMES + i);
    const cands = Array.from({ length: POP }, (_, k) => (k === 0 ? mu.slice() : mu.map((m, i) => m + sd[i] * gauss())));
    const scored = await Promise.all(cands.map(async w => {
      const rs = await evaluate(w, seeds);
      return { w, score: mean(rs.map(r => r.score)), pieces: mean(rs.map(r => r.pieces)) };
    }));
    scored.sort((a, b) => b.score - a.score);
    const elite = scored.slice(0, ELITE);
    mu = mu.map((_, i) => mean(elite.map(e => e.w[i])));
    sd = sd.map((_, i) => (i === REWARD ? 0 : Math.sqrt(mean(elite.map(e => (e.w[i] - mu[i]) ** 2))) + 0.05));
    if (!bestEver || elite[0].score > bestEver.score) bestEver = elite[0];
    console.log(`世代 ${String(g + 1).padStart(2)}  最高 ${Math.round(elite[0].score).toLocaleString().padStart(9)}  上位平均 ${Math.round(mean(elite.map(e => e.score))).toLocaleString().padStart(9)}  平均手数 ${Math.round(mean(elite.map(e => e.pieces)))}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }

  // 学習に使っていないシードで最終評価（平均の重みと最良個体を比べて良い方を採用）
  const test = Array.from({ length: DEPTH > 1 ? 18 : 40 }, (_, i) => 900000 + i);
  const summary = async w => {
    const rs = await evaluate(w, test);
    return { w, score: mean(rs.map(r => r.score)), pieces: mean(rs.map(r => r.pieces)), done: rs.filter(r => r.pieces >= LIMIT).length, pentas: mean(rs.map(r => r.pentas)), spins: mean(rs.map(r => r.spins)), rs };
  };
  const a = await summary(mu), b = await summary(bestEver.w);
  const win = a.score >= b.score ? a : b;
  const round = w => w.map(x => Math.round(x * 1000) / 1000);
  console.log(`\n検証（未使用シード ${test.length} ゲーム, ${DEPTH} 手読み）: 平均 ${Math.round(win.score).toLocaleString()} 点 / ${LIMIT} 手完走 ${win.done}/${test.length} / PENTA ${win.pentas.toFixed(1)} 回 / スピン消去 ${win.spins.toFixed(1)} 回`);

  const lines = P.AI_FEATURES.map((f, i) => `  ${round(win.w)[i]}, // ${f}`).join('\n');
  const out = `'use strict';

// tools/train.js で学習した AI の重み（${new Date().toISOString().slice(0, 10)}）
// 検証: ${LIMIT} 手モード ${test.length} ゲーム（${DEPTH} 手読み）の平均 ${Math.round(win.score).toLocaleString()} 点, 完走 ${win.done}/${test.length}
const AI_WEIGHTS = [
${lines}
];
`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'ai-weights.js'), out);
  console.log('js/ai-weights.js に書き出しました');
  workers.forEach(w => w.terminate());
})();
