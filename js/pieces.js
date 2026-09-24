'use strict';

// ==================== 盤面 ====================
const COLS = 12;
const ROWS = 24;                 // 表示される行数
const HIDDEN = 6;                // 画面外（上部）のバッファ行。ピースはここから出現する
const TOTAL_ROWS = ROWS + HIDDEN;

// ==================== ペントミノ（18 種） ====================
// 鏡像ペアは同系色でまとめる。形は出現時の向き（横長）で N×N の箱に定義する。
const PIECE_DEFS = [
  { name: 'F',  hsl: [12, 88, 62],  rows: ['.##', '##.', '.#.'] },
  { name: "F'", hsl: [26, 92, 63],  rows: ['##.', '.##', '.#.'] },
  { name: 'I',  hsl: [190, 85, 55], rows: ['.....', '.....', '#####', '.....', '.....'] },
  { name: 'L',  hsl: [208, 90, 60], rows: ['...#', '####', '....', '....'] },
  { name: "L'", hsl: [220, 88, 68], rows: ['#...', '####', '....', '....'] },
  { name: 'P',  hsl: [38, 95, 57],  rows: ['##.', '###', '...'] },
  { name: "P'", hsl: [48, 95, 60],  rows: ['.##', '###', '...'] },
  { name: 'N',  hsl: [262, 80, 68], rows: ['##..', '.###', '....', '....'] },
  { name: "N'", hsl: [274, 72, 74], rows: ['..##', '###.', '....', '....'] },
  { name: 'T',  hsl: [292, 70, 64], rows: ['###', '.#.', '.#.'] },
  { name: 'U',  hsl: [132, 56, 52], rows: ['#.#', '###', '...'] },
  { name: 'V',  hsl: [240, 62, 74], rows: ['#..', '#..', '###'] },
  { name: 'W',  hsl: [324, 80, 66], rows: ['#..', '##.', '.##'] },
  { name: 'X',  hsl: [354, 82, 62], rows: ['.#.', '###', '.#.'] },
  { name: 'Y',  hsl: [164, 70, 45], rows: ['.#..', '####', '....', '....'] },
  { name: "Y'", hsl: [176, 66, 50], rows: ['..#.', '####', '....', '....'] },
  { name: 'Z',  hsl: [64, 78, 50],  rows: ['##.', '.#.', '.##'] },
  { name: "Z'", hsl: [80, 64, 52],  rows: ['.##', '.#.', '##.'] },
];

function rotateCW(m) {
  const n = m.length;
  return m.map((row, r) => row.map((_, c) => m[n - 1 - c][r]));
}

function makeColor([h, s, l]) {
  const clamp = v => Math.max(0, Math.min(100, v));
  return {
    base:  `hsl(${h} ${s}% ${l}%)`,
    light: `hsl(${h} ${s}% ${clamp(l + 16)}%)`,
    dark:  `hsl(${h} ${s}% ${clamp(l - 12)}%)`,
    deep:  `hsl(${h} ${clamp(s - 10)}% ${clamp(l - 30)}%)`,
    glow:  `hsl(${h} ${s}% ${l}% / 0.55)`,
    hue: h,
  };
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
  return { id, name: def.name, size: def.rows.length, rotations, color: makeColor(def.hsl) };
});

const GRAY_COLOR = makeColor([230, 10, 42]);

// ==================== 回転補正（キック） ====================
// SRS の JLSTZ テーブルを基に、5 マス用の追加候補を足したもの。座標は盤面系（y 下向き）。
const SRS_CW = [
  [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],   // 0 -> 1
  [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],     // 1 -> 2
  [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],      // 2 -> 3
  [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],  // 3 -> 0
];

function kickTests(id, from, dir) {
  if (PIECES[id].size === 5) {
    const s = dir;
    return [[0, 0], [-s, 0], [s, 0], [-2 * s, 0], [2 * s, 0], [0, -1], [0, 1], [0, -2]];
  }
  const base = dir === 1
    ? SRS_CW[from]
    : SRS_CW[(from + 3) % 4].map(([x, y]) => [-x, -y]);
  const sx = base[1][0];
  return base.concat([[2 * sx, 0], [-sx, 0], [-2 * sx, 0], [0, -1], [0, 1], [sx, -2]]);
}
