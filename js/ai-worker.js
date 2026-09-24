'use strict';
// AI の思考を画面の描画と別スレッドで行う
importScripts('pieces.js', 'game.js', 'ai.js', 'ai-weights.js');

let ai = null;
onmessage = e => {
  const { req, state, depth } = e.data;
  if (!ai || ai.depth !== depth) {
    ai = new PentAI(typeof AI_WEIGHTS !== 'undefined' ? AI_WEIGHTS : AI_DEFAULT_WEIGHTS, { depth });
  }
  state.board = Int32Array.from(state.board);
  const d = ai.decide(state);
  postMessage({ req, decision: d && { useHold: d.useHold, path: d.path } });
};
