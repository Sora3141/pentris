'use strict';

// ==================== 盤面 ====================
const COLS = 12;
const ROWS = 24;                 // 表示される行数
const HIDDEN = 6;                // 画面外（上部）のバッファ行。ピースはここから出現する
const TOTAL_ROWS = ROWS + HIDDEN;

// ==================== ペントミノ（18 種） ====================
// 形は出現時の向き（横長）で N×N の箱に定義する。名前の ' は鏡像（左右ちがい）を表す。
const PIECE_DEFS = [
  { name: 'F',  rows: ['.##', '##.', '.#.'] },
  { name: "F'", rows: ['##.', '.##', '.#.'] },
  { name: 'I',  rows: ['.....', '.....', '#####', '.....', '.....'] },
  { name: 'L',  rows: ['...#', '####', '....', '....'] },
  { name: "L'", rows: ['#...', '####', '....', '....'] },
  { name: 'P',  rows: ['##.', '###', '...'] },
  { name: "P'", rows: ['.##', '###', '...'] },
  { name: 'N',  rows: ['##..', '.###', '....', '....'] },
  { name: "N'", rows: ['..##', '###.', '....', '....'] },
  { name: 'T',  rows: ['###', '.#.', '.#.'] },
  { name: 'U',  rows: ['#.#', '###', '...'] },
  { name: 'V',  rows: ['#..', '#..', '###'] },
  { name: 'W',  rows: ['#..', '##.', '.##'] },
  { name: 'X',  rows: ['.#.', '###', '.#.'] },
  { name: 'Y',  rows: ['.#..', '####', '....', '....'] },
  { name: "Y'", rows: ['..#.', '####', '....', '....'] },
  { name: 'Z',  rows: ['##.', '.#.', '.##'] },
  { name: "Z'", rows: ['.##', '.#.', '##.'] },
];

function rotateCW(m) {
  const n = m.length;
  return m.map((row, r) => row.map((_, c) => m[n - 1 - c][r]));
}

// 色は形ごとに変えない。3 色だけ: 左右対称 / 右向き / 左向き（鏡に映すと入れ替わる形の見分けに使う）。
// 名前に ' が付く形は、' なしの同じ名前の鏡像（右向き / 左向きのペア）。ペアがない形は左右対称。
const CHIRAL = { SYM: 0, RIGHT: 1, LEFT: 2 };
const pairCount = {};
for (const def of PIECE_DEFS) {
  const base = def.name.replace("'", '');
  pairCount[base] = (pairCount[base] || 0) + 1;
}
function chiralOf(name) {
  const base = name.replace("'", '');
  if (pairCount[base] < 2) return CHIRAL.SYM;
  return name.endsWith("'") ? CHIRAL.LEFT : CHIRAL.RIGHT;
}

const PIECES = PIECE_DEFS.map((def, id) => {
  let m = def.rows.map(row => [...row].map(ch => (ch === '#' ? 1 : 0)));
  const rotations = [];
  for (let k = 0; k < 4; k++) {
    const cells = [];
    m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
    rotations.push(cells);
    m = rotateCW(m);
  }
  return { id, name: def.name, size: def.rows.length, rotations, chiral: chiralOf(def.name) };
});

// ==================== 回転補正（キック） ====================
// QUINTILE 独自の決まり（SRS の表は使わない）。右回転を s = +1、左回転を s = -1 として、
// 上から順に試し、最初に入った所に置く。x は右が +、y は下が +。
function kickTests(id, from, dir) {
  const s = dir;
  const out = [[0, 0], [-s, 0], [s, 0], [0, 1], [-s, 1], [s, 1], [0, -1], [-2 * s, 0], [2 * s, 0], [-s, -1], [s, -1]];
  if (PIECES[id].size >= 5) out.push([-3 * s, 0], [3 * s, 0], [0, -2]);
  return out;
}
