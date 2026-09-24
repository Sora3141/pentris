'use strict';
// ルールと AI の整合性テスト: node tools/test.js
const { load } = require('./lib');
const P = load();
const { Game, PentAI, ACT, aiStateFromGame, TOTAL_ROWS, COLS } = P;

let failed = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ok  ${msg}`);
  else { failed++; console.log(`  NG  ${msg}`); }
};

// AI の手を本物の Game に操作として入力し、AI 内部の計算と完全に一致するか確かめる
function parity(depth, seed, limit) {
  const ai = new PentAI(P.AI_WEIGHTS || P.AI_DEFAULT_WEIGHTS, { depth });
  let last = null;
  const game = new Game({ lock: e => { last = e; } });
  game.start({ seed, pieceLimit: limit });
  let moves = 0, spins = 0;
  while (!game.over) {
    const d = ai.decide(aiStateFromGame(game));
    if (!d) break;
    if (d.useHold) game.holdPiece();
    if (game.cur.id !== d.id) return `ピースが一致しない（${moves} 手目）`;
    for (const a of d.path) {
      const ok = a === ACT.LEFT ? game.move(-1)
        : a === ACT.RIGHT ? game.move(1)
        : a === ACT.DOWN ? game.softStep()
        : a === ACT.CW ? game.rotate(1)
        : game.rotate(-1);
      if (!ok) return `操作に失敗（${moves} 手目）`;
    }
    game.hardDrop();
    const b = aiStateFromGame({ ...game, cur: { id: 0 } }).board;
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (b[r] !== d.after.board[r]) return `盤面が一致しない（${moves} 手目, ${r} 行目）`;
    }
    if (last.points !== d.after.points) return `得点が一致しない（${moves} 手目: game ${last.points} / ai ${d.after.points}）`;
    if (last.spin !== !!d.spin) return `スピン判定が一致しない（${moves} 手目）`;
    if (game.b2b !== d.after.b2b || game.ren !== d.after.ren || game.level !== d.after.level) return `状態が一致しない（${moves} 手目）`;
    if (d.spin && last.lines) spins++;
    moves++;
  }
  return { moves, spins, score: game.score };
}

console.log('AI と Game の整合性');
for (const depth of [1, 2]) {
  for (const seed of [1, 2, 3]) {
    const r = parity(depth, seed, depth === 1 ? 500 : 150);
    check(typeof r === 'object', `depth ${depth} / seed ${seed}: ${typeof r === 'object' ? `${r.moves} 手 一致（スピン消去 ${r.spins} 回, スコア ${r.score.toLocaleString()}）` : r}`);
  }
}

console.log('シミュレーターと Game の得点一致');
{
  const ai = new PentAI(P.AI_WEIGHTS || P.AI_DEFAULT_WEIGHTS, { depth: 1 });
  const sim = P.simulate(ai, 7, 300);
  const game = new Game();
  game.start({ seed: 7, pieceLimit: 300 });
  while (!game.over) {
    const d = ai.decide(aiStateFromGame(game));
    if (!d) break;
    if (d.useHold) game.holdPiece();
    for (const a of d.path) {
      if (a === ACT.LEFT) game.move(-1); else if (a === ACT.RIGHT) game.move(1);
      else if (a === ACT.DOWN) game.softStep(); else if (a === ACT.CW) game.rotate(1); else game.rotate(-1);
    }
    game.hardDrop();
  }
  check(sim.score === game.score && sim.pieces === game.pieces, `300 手: sim ${sim.score} / game ${game.score}（ドロップ点込み）`);
}

void COLS;
process.exitCode = failed ? 1 : 0;
