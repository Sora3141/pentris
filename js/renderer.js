'use strict';

// ==================== 描画 ====================
// ピースは、ひとつながりの形として描く。マス同士の区切り線は描かず、形の外周にだけ線を引く。
// ベベル・光沢は付けない（平らな面）。色はピースごとに変えず 3 色だけ（左右対称 / 右向き / 左向き）。

const PALETTE = [
  // [面, 外周]
  { face: '#aab4d6', edge: '#e7ecff', ghost: 'rgba(170, 180, 214, 0.55)' },  // 左右対称
  { face: '#2fc4e6', edge: '#a6f0ff', ghost: 'rgba(60, 195, 225, 0.6)' },    // 右向き
  { face: '#c069ff', edge: '#eecbff', ghost: 'rgba(190, 105, 255, 0.6)' },  // 左向き
];

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

// 1 マスぶんの「形」を、内側に g だけ縮めた長方形の集まりとして path に足す。
// same(dx, dy) はとなりのマスが同じピースか。同じピースの側は縮めずにつなげる。
// 長方形どうしは重ならないので、2 つの g で作って evenodd で塗ると外周の輪だけになる。
function addCell(path, px, py, cs, same, g) {
  const R = same(1, 0), L = same(-1, 0), D = same(0, 1), U = same(0, -1);
  const a = px + g, b = px + cs - g, c = py + g, d = py + cs - g;
  path.rect(a, c, b - a, d - c);
  if (L) path.rect(px, c, g, d - c);
  if (R) path.rect(b, c, g, d - c);
  if (U) path.rect(a, py, b - a, g);
  if (D) path.rect(a, d, b - a, g);
  if (L && U && same(-1, -1)) path.rect(px, py, g, g);
  if (R && U && same(1, -1)) path.rect(b, py, g, g);
  if (L && D && same(-1, 1)) path.rect(px, d, g, g);
  if (R && D && same(1, 1)) path.rect(b, d, g, g);
}

// cells: [[x, y], ...]（同じピース）を、面と外周で描く。ox/oy は描く位置のずれ（px）
function drawShape(ctx, cells, cs, colors, { ox = 0, oy = 0, gap, line, ghost = false } = {}) {
  const has = new Set(cells.map(([x, y]) => x + ',' + y));
  const g1 = gap ?? Math.max(0.75, cs * 0.045);
  const g2 = g1 + (line ?? Math.max(1.25, cs * 0.075));
  const outer = new Path2D(), inner = new Path2D();
  for (const [x, y] of cells) {
    const same = (dx, dy) => has.has((x + dx) + ',' + (y + dy));
    addCell(outer, ox + x * cs, oy + y * cs, cs, same, g1);
    addCell(inner, ox + x * cs, oy + y * cs, cs, same, g2);
  }
  if (!ghost) {
    ctx.fillStyle = colors.face;
    ctx.fill(outer);
  }
  const ring = new Path2D(outer);
  ring.addPath(inner);
  ctx.fillStyle = ghost ? colors.ghost : colors.edge;
  ctx.fill(ring, 'evenodd');
}

// 明るくした色（落としている最中のピース用）
function brighter(colors) {
  return { face: mix(colors.face, '#ffffff', 0.2), edge: '#ffffff', ghost: colors.ghost };
}
function mix(a, b, t) {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const ACTIVE = PALETTE.map(brighter);

function pieceBounds(cells) {
  let minX = 99, maxX = -1, minY = 99, maxY = -1;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// 小さなキャンバスに描く（NEXT / HOLD / タイトルのギャラリー用）
function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, pw, ph);
  return { g, w: pw, h: ph };
}

function drawPreview(canvas, id, dim = false) {
  const { g, w, h } = fitCanvas(canvas);
  if (id === null || id === undefined) return;
  const cells = PIECES[id].rotations[0];
  const b = pieceBounds(cells);
  const cs = Math.min(w / Math.max(b.w, 4), h / Math.max(b.h, 2.6)) * 0.92;
  const ox = (w - b.w * cs) / 2 - b.minX * cs, oy = (h - b.h * cs) / 2 - b.minY * cs;
  g.globalAlpha = dim ? 0.35 : 1;
  drawShape(g, cells, cs, PALETTE[PIECES[id].chiral], { ox, oy });
  g.globalAlpha = 1;
}

function drawGallery(canvas) {
  const { g, w, h } = fitCanvas(canvas);
  const cols = 6, rows = 3;
  const cw = w / cols, ch = h / rows;
  const cs = Math.floor(Math.min(cw / 5.8, ch / 3.8));
  PIECES.forEach((p, i) => {
    const cells = p.rotations[0];
    const b = pieceBounds(cells);
    const cx = cw * (i % cols + 0.5), cy = ch * (Math.floor(i / cols) + 0.5);
    drawShape(g, cells, cs, PALETTE[p.chiral], { ox: cx - (b.w * cs) / 2 - b.minX * cs, oy: cy - (b.h * cs) / 2 - b.minY * cs });
  });
}

// ==================== 盤面レンダラー ====================
class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cs = 24;
    this.dpr = 1;
    this.grid = true;
    this.fx = [];
    this.particles = [];
    this.overT = 0;
  }

  resize(cs) {
    this.cs = cs;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = COLS * cs, h = ROWS * cs;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.buildBackground();
  }

  setGrid(on) {
    this.grid = on;
    this.buildBackground();
  }

  buildBackground() {
    const { cs, dpr } = this;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const W = COLS * cs, H = ROWS * cs;

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d1124');
    bg.addColorStop(1, '#080a16');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    if (this.grid) {
      g.fillStyle = 'rgba(180,195,255,0.14)';
      const d = Math.max(1, cs * 0.06);
      for (let x = 1; x < COLS; x++) {
        for (let y = 1; y < ROWS; y++) g.fillRect(x * cs - d / 2, y * cs - d / 2, d, d);
      }
    }
    this.bg = c;
  }

  // ---------- エフェクト ----------
  clearFx() {
    this.fx = [];
    this.particles = [];
    this.overT = 0;
  }

  addLock(cells) {
    this.fx.push({ type: 'lock', cells, t: 0, dur: 220 });
  }

  addTrail(id, from, to) {
    const cols = new Map();
    for (const [x, y] of from) cols.set(x, Math.min(cols.get(x) ?? 99, y));
    const land = new Map();
    for (const [x, y] of to) land.set(x, Math.min(land.get(x) ?? 99, y));
    const segs = [...cols].map(([x, top]) => ({ x, top: top - HIDDEN, bottom: land.get(x) - HIDDEN }));
    this.fx.push({ type: 'trail', segs, color: PALETTE[PIECES[id].chiral], t: 0, dur: 260 });
  }

  addClear(rows, rowCells) {
    this.fx.push({ type: 'flash', rows: rows.map(y => y - HIDDEN), t: 0, dur: 420 });
    rows.forEach((y, i) => {
      const vy = y - HIDDEN;
      rowCells[i].forEach((v, x) => {
        if (!v) return;
        const col = PALETTE[(v & 3) - 1].face;
        for (let k = 0; k < 3; k++) {
          const life = 500 + Math.random() * 500;
          this.particles.push({
            x: x + 0.5, y: vy + 0.5,
            vx: (Math.random() - 0.5) * 14,
            vy: -2 - Math.random() * 10,
            size: 0.12 + Math.random() * 0.2,
            life, max: life, col,
          });
        }
      });
    });
  }

  update(dt, over) {
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter(f => f.t < f.dur);
    const s = dt / 1000;
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += 30 * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.vx *= 0.985;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    this.overT = over ? this.overT + dt : 0;
  }

  // ---------- 描画 ----------
  draw(game, opts) {
    const { ctx, cs, dpr } = this;
    const W = COLS * cs, H = ROWS * cs;
    const boardTop = -HIDDEN * cs;   // 見えない段のぶん上にずらして描く
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cur = opts.showPiece && game.cur && !game.over ? game.cur : null;

    // 操作中ピースの列ガイド
    if (cur) {
      const cols = new Set(game.cells().map(c => c[0]));
      ctx.fillStyle = 'rgba(170,190,255,0.035)';
      for (const x of cols) ctx.fillRect(x * cs, 0, cs, H);
    }

    // 危険ゾーン
    let topFilled = TOTAL_ROWS;
    for (let y = HIDDEN; y < TOTAL_ROWS; y++) {
      if (game.board[y].some(v => v)) { topFilled = y; break; }
    }
    const height = TOTAL_ROWS - topFilled;
    if (height > ROWS - 7 && !game.over) {
      const k = Math.min(1, (height - (ROWS - 7)) / 5);
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 180);
      const grad = ctx.createLinearGradient(0, 0, 0, cs * 6);
      grad.addColorStop(0, `rgba(255,60,90,${0.28 * k * pulse})`);
      grad.addColorStop(1, 'rgba(255,60,90,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, cs * 6);
    }

    // 固定済みブロック（同じピースのマスはつながったまま、通し番号ごとにまとめて描く）
    const groups = new Map();
    for (let y = HIDDEN; y < TOTAL_ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = game.board[y][x];
        if (!v) continue;
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v).push([x, y]);
      }
    }
    for (const [v, cells] of groups) drawShape(ctx, cells, cs, PALETTE[(v & 3) - 1], { oy: boardTop });

    // 次のピースの出現マスに × 印（積みが近づくと赤く点滅）
    if (cur && game.queue.length) {
      const marks = game.spawnCells(game.queue[0]);
      const bottom = Math.max(...marks.map(c => c[1]));
      const gap = topFilled - bottom - 1;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 140);
      const alpha = gap <= 0 ? 0.95 : gap <= 4 ? 0.45 + 0.4 * pulse * (1 - gap / 5) : 0.22;
      ctx.save();
      ctx.strokeStyle = gap <= 4 ? `rgba(255,80,110,${alpha})` : `rgba(255,120,140,${alpha})`;
      ctx.lineWidth = Math.max(1.5, cs * 0.09);
      ctx.lineCap = 'round';
      const k = cs * 0.3;
      ctx.beginPath();
      for (const [x, y] of marks) {
        const px = x * cs, py = (y - HIDDEN) * cs;
        ctx.moveTo(px + k, py + k); ctx.lineTo(px + cs - k, py + cs - k);
        ctx.moveTo(px + cs - k, py + k); ctx.lineTo(px + k, py + cs - k);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (cur) {
      const colors = PALETTE[PIECES[cur.id].chiral];
      // ゴースト（形の外周の細い線だけ）
      const gy = game.ghostY();
      if (opts.ghost && gy !== cur.y) {
        drawShape(ctx, game.cells(cur, gy), cs, colors, { oy: boardTop, ghost: true, line: Math.max(1, cs * 0.06) });
      }
      // 操作中ピース（固定が近づくと少し暗くなる。置いても色は変えない）
      ctx.save();
      ctx.globalAlpha = 1 - game.lockProgress * 0.3;
      drawShape(ctx, game.cells(), cs, ACTIVE[PIECES[cur.id].chiral], { oy: boardTop });
      ctx.restore();
    }

    this.drawFx(ctx, cs, W, boardTop);

    // 終わったら盤を灰色で埋めず、暗くして止める
    if (game.over) {
      const alpha = Math.min(0.55, (this.overT / 700) * 0.55);
      ctx.fillStyle = `rgba(6, 8, 18, ${alpha})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawFx(ctx, cs, W, boardTop) {
    for (const f of this.fx) {
      const p = f.t / f.dur;
      if (f.type === 'trail') {
        ctx.globalAlpha = (1 - p) * 0.5;
        for (const s of f.segs) {
          const y0 = Math.max(0, s.top) * cs, y1 = s.bottom * cs;
          if (y1 <= y0) continue;
          const grad = ctx.createLinearGradient(0, y0, 0, y1);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(1, f.color.edge);
          ctx.fillStyle = grad;
          ctx.fillRect(s.x * cs + cs * 0.15, y0, cs * 0.7, y1 - y0);
        }
      } else if (f.type === 'lock') {
        const k = f.t / f.dur;
        const sink = Math.sin(Math.min(1, k * 2) * Math.PI) * cs * 0.06;
        ctx.globalAlpha = 1 - k;
        drawShape(ctx, f.cells, cs, { face: 'rgba(0,0,0,0)', edge: '#ffffff', ghost: '#ffffff' }, { oy: boardTop + sink, ghost: true });
        ctx.globalAlpha = 1;
      } else if (f.type === 'flash') {
        const a = Math.pow(1 - p, 1.6);
        for (const vy of f.rows) {
          const h = cs * (1 - p * 0.8);
          const y = vy * cs + (cs - h) / 2;
          ctx.globalAlpha = a;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, y, W, h);
          ctx.globalAlpha = a * 0.5;
          const spread = cs * (0.5 + p * 2.5);
          const glow = ctx.createLinearGradient(0, y - spread, 0, y + h + spread);
          glow.addColorStop(0, 'rgba(160,220,255,0)');
          glow.addColorStop(0.5, 'rgba(160,220,255,0.6)');
          glow.addColorStop(1, 'rgba(160,220,255,0)');
          ctx.fillStyle = glow;
          ctx.fillRect(0, y - spread, W, h + spread * 2);
        }
      }
    }
    ctx.globalAlpha = 1;

    if (this.particles.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const q of this.particles) {
        const a = q.life / q.max;
        const s = q.size * cs * (0.6 + a * 0.4);
        ctx.globalAlpha = a;
        ctx.fillStyle = q.col;
        roundRect(ctx, q.x * cs - s / 2, q.y * cs - s / 2, s, s, s * 0.25);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }
}

// ==================== 背景（漂うペントミノ） ====================
class Backdrop {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.items = [];
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    for (let i = 0; i < 16; i++) this.items.push(this.spawn(true));
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  spawn(anywhere) {
    const size = 14 + Math.random() * 26;
    return {
      id: Math.floor(Math.random() * PIECES.length),
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : -size * 4,
      a: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 0.0004,
      vy: 0.006 + Math.random() * 0.014,
      size,
      alpha: 0.05 + Math.random() * 0.07,
    };
  }

  update(dt) {
    if (this.reduced) return;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.y += it.vy * dt;
      it.a += it.va * dt;
      if (it.y - it.size * 4 > this.h) this.items[i] = this.spawn(false);
    }
  }

  draw() {
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    for (const it of this.items) {
      const p = PIECES[it.id];
      const b = pieceBounds(p.rotations[0]);
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.a);
      ctx.globalAlpha = it.alpha;
      ctx.fillStyle = PALETTE[p.chiral].face;
      for (const [x, y] of p.rotations[0]) {
        roundRect(ctx, (x - b.minX - b.w / 2) * it.size + 1.5, (y - b.minY - b.h / 2) * it.size + 1.5,
          it.size - 3, it.size - 3, it.size * 0.2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
