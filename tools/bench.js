'use strict';
// AI の強さを測る: node tools/bench.js [--depth 2] [--games 20] [--limit 500]
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { load } = require('./lib');

if (!isMainThread) {
  const P = load();
  const { seeds, depth, limit } = workerData;
  const ai = new P.PentAI(P.AI_WEIGHTS || P.AI_DEFAULT_WEIGHTS, { depth });
  const out = seeds.map(seed => {
    const t0 = Date.now();
    const r = P.simulate(ai, seed, limit);
    return { ...r, ms: (Date.now() - t0) / Math.max(1, r.pieces) };
  });
  parentPort.postMessage(out);
  return;
}

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? Number(process.argv[i + 1]) : def; };
const depth = arg('depth', 2), games = arg('games', 20), limit = arg('limit', 500);
const seeds = Array.from({ length: games }, (_, i) => 500000 + i);
const n = Math.min(games, os.cpus().length - 1);
const parts = Array.from({ length: n }, (_, k) => seeds.filter((_, i) => i % n === k));

Promise.all(parts.map(s => new Promise(res => new Worker(__filename, { workerData: { seeds: s, depth, limit } }).on('message', res))))
  .then(r => {
    const rs = r.flat();
    const avg = f => rs.reduce((a, x) => a + f(x), 0) / rs.length;
    const sorted = rs.map(x => x.score).sort((a, b) => a - b);
    console.log(`depth ${depth} / ${games} ゲーム / ${limit} 手`);
    console.log(`  平均 ${Math.round(avg(x => x.score)).toLocaleString()} 点  中央値 ${sorted[games >> 1].toLocaleString()}  最高 ${sorted.at(-1).toLocaleString()}  最低 ${sorted[0].toLocaleString()}`);
    console.log(`  完走 ${rs.filter(x => x.pieces >= limit).length}/${games}  平均ライン ${avg(x => x.lines).toFixed(0)}  PENTA ${avg(x => x.pentas).toFixed(1)}  スピン消去 ${avg(x => x.spins).toFixed(1)}  最大REN ${avg(x => x.maxRen).toFixed(1)}`);
    console.log(`  1 手あたり ${avg(x => x.ms).toFixed(1)} ms`);
  });
