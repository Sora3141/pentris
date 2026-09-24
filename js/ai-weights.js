'use strict';

// tools/train.js で学習した AI の重み（2026-09-24）
// 2 手読みで学習した重みの danger を -5 に補正したもの
// 検証: 500 手モード 27 ゲーム（tools/bench.js --depth 2）平均 684,985 点, 完走 24/27
const AI_WEIGHTS = [
  -17.178, // holes
  -10.143, // holeRows
  -4.572, // rowTrans
  -4.439, // colTrans
  -2.227, // bumpiness
  0.091, // wells
  -3.003, // maxHeight
  -5, // danger
  11.178, // pentaReady
  -2.919, // b2b
  -0.192, // ren
  8.925, // holdI
  1, // reward
];
