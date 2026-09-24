'use strict';

// ==================== ブロック描画 ====================
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function paintBlock(g, x, y, s, col) {
  const r = s * 0.2;
  const edge = Math.max(1, s * 0.045);

  // 外周（ベベル）
  let grad = g.createLinearGradient(0, y, 0, y + s);
  grad.addColorStop(0, col.light);
  grad.addColorStop(1, col.deep);
  g.fillStyle = grad;
  roundRect(g, x + edge, y + edge, s - edge * 2, s - edge * 2, r);
  g.fill();

  // 面
  const f = s * 0.13;
  grad = g.createLinearGradient(0, y + f, 0, y + s - f);
  grad.addColorStop(0, col.base);
  grad.addColorStop(1, col.dark);
  g.fillStyle = grad;
  roundRect(g, x + f, y + f, s - f * 2, s - f * 2, r * 0.55);
  g.fill();

  // ハイライト
  g.fillStyle = 'rgba(255,255,255,0.32)';
  roundRect(g, x + f * 1.35, y + f * 1.3, s - f * 2.7, s * 0.12, s * 0.06);
  g.fill();
}

function paintGhost(g, x, y, s, col) {
  const lw = Math.max(1, s * 0.07);
  const inset = s * 0.09 + lw / 2;
  g.fillStyle = col.glow.replace('0.55', '0.12');
  g.strokeStyle = col.glow.replace('0.55', '0.7');
  g.lineWidth = lw;
  roundRect(g, x + inset, y + inset, s - inset * 2, s - inset * 2, s * 0.16);
  g.fill();
  g.stroke();
}

function pieceBounds(cells) {
  let minX = 99, maxX = -1, minY = 99, maxY = -1;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// 小さなキャンバスにピースを中央寄せで描く（NEXT / HOLD / タイトル用）
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

function drawPieceAt(g, id, cx, cy, cs, col) {
  const cells = PIECES[id].rotations[0];
  const b = pieceBounds(cells);
  const ox = cx - (b.w * cs) / 2, oy = cy - (b.h * cs) / 2;
  for (const [x, y] of cells) {
    paintBlock(g, ox + (x - b.minX) * cs, oy + (y - b.minY) * cs, cs, col || PIECES[id].color);
  }
}

function drawPreview(canvas, id, dim = false) {
  const { g, w, h } = fitCanvas(canvas);
  if (id === null || id === undefined) return;
  const cs = Math.floor(Math.min(w / 5.6, h / 3.6));
  g.globalAlpha = dim ? 0.35 : 1;
  drawPieceAt(g, id, w / 2, h / 2, cs, dim ? GRAY_COLOR : null);
  g.globalAlpha = 1;
}

function drawGallery(canvas) {
  const { g, w, h } = fitCanvas(canvas);
  const cols = 6, rows = 3;
  const cw = w / cols, ch = h / rows;
  const cs = Math.floor(Math.min(cw / 5.8, ch / 3.8));
  PIECES.forEach((p, i) => {
    drawPieceAt(g, p.id, cw * (i % cols + 0.5), ch * (Math.floor(i / cols) + 0.5), cs);
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
    this.sprites = new Map();
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
    this.sprites.clear();
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
      g.strokeStyle = 'rgba(160,175,255,0.045)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < COLS; x++) { g.moveTo(x * cs + 0.5, 0); g.lineTo(x * cs + 0.5, H); }
      for (let y = 1; y < ROWS; y++) { g.moveTo(0, y * cs + 0.5); g.lineTo(W, y * cs + 0.5); }
      g.stroke();
      g.fillStyle = 'rgba(180,195,255,0.14)';
      const d = Math.max(1, cs * 0.06);
      for (let x = 1; x < COLS; x++) {
        for (let y = 1; y < ROWS; y++) g.fillRect(x * cs + 0.5 - d / 2, y * cs + 0.5 - d / 2, d, d);
      }
    }
    this.bg = c;
  }

  sprite(id, kind = 'block') {
    const key = kind + id;
    let s = this.sprites.get(key);
    if (!s) {
      const px = Math.round(this.cs * this.dpr);
      s = document.createElement('canvas');
      s.width = s.height = px;
      const g = s.getContext('2d');
      const col = id < 0 ? GRAY_COLOR : PIECES[id].color;
      if (kind === 'ghost') paintGhost(g, 0, 0, px, col);
      else paintBlock(g, 0, 0, px, col);
      this.sprites.set(key, s);
    }
    return s;
  }

  // ---------- エフェクト ----------
  clearFx() {
    this.fx = [];
    this.particles = [];
    this.overT = 0;
  }

  addLock(cells) {
    this.fx.push({ type: 'lock', cells, t: 0, dur: 180 });
  }

  addTrail(id, from, to) {
    const cols = new Map();
    for (const [x, y] of from) cols.set(x, Math.min(cols.get(x) ?? 99, y));
    const land = new Map();
    for (const [x, y] of to) land.set(x, Math.min(land.get(x) ?? 99, y));
    const segs = [...cols].map(([x, top]) => ({ x, top: top - HIDDEN, bottom: land.get(x) - HIDDEN }));
    this.fx.push({ type: 'trail', segs, color: PIECES[id].color, t: 0, dur: 260 });
  }

  addClear(rows, rowCells) {
    this.fx.push({ type: 'flash', rows: rows.map(y => y - HIDDEN), t: 0, dur: 420 });
    rows.forEach((y, i) => {
      const vy = y - HIDDEN;
      rowCells[i].forEach((v, x) => {
        if (!v) return;
        const col = PIECES[v - 1].color.base;
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
    let top = TOTAL_ROWS;
    for (let y = HIDDEN; y < TOTAL_ROWS; y++) {
      if (game.board[y].some(v => v)) { top = y; break; }
    }
    const height = TOTAL_ROWS - top;
    if (height > ROWS - 7 && !game.over) {
      const k = Math.min(1, (height - (ROWS - 7)) / 5);
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 180);
      const grad = ctx.createLinearGradient(0, 0, 0, cs * 6);
      grad.addColorStop(0, `rgba(255,60,90,${0.28 * k * pulse})`);
      grad.addColorStop(1, 'rgba(255,60,90,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, cs * 6);
    }

    // 固定済みブロック（ゲームオーバー時は下から灰色に）
    const grayRows = game.over ? Math.floor(this.overT / 22) : -1;
    for (let y = HIDDEN; y < TOTAL_ROWS; y++) {
      const gray = grayRows >= 0 && TOTAL_ROWS - 1 - y < grayRows;
      const row = game.board[y];
      for (let x = 0; x < COLS; x++) {
        const v = row[x];
        if (v) ctx.drawImage(this.sprite(gray ? -1 : v - 1), x * cs, (y - HIDDEN) * cs, cs, cs);
      }
    }

    // 次のピースの出現マスに × 印（積みが近づくと赤く点滅）
    if (cur && game.queue.length) {
      const marks = game.spawnCells(game.queue[0]);
      const bottom = Math.max(...marks.map(c => c[1]));
      const gap = top - bottom - 1;
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
      // ゴースト
      const gy = game.ghostY();
      if (opts.ghost && gy !== cur.y) {
        const ghost = this.sprite(cur.id, 'ghost');
        for (const [x, y] of game.cells(cur, gy)) {
          if (y >= HIDDEN) ctx.drawImage(ghost, x * cs, (y - HIDDEN) * cs, cs, cs);
        }
      }
      // 操作中ピース（固定が近づくと少し暗くなる）
      const spr = this.sprite(cur.id);
      ctx.save();
      ctx.shadowColor = PIECES[cur.id].color.glow;
      ctx.shadowBlur = cs * 0.7;
      ctx.globalAlpha = 1 - game.lockProgress * 0.35;
      for (const [x, y] of game.cells()) {
        if (y >= HIDDEN) ctx.drawImage(spr, x * cs, (y - HIDDEN) * cs, cs, cs);
      }
      ctx.restore();
    }

    this.drawFx(ctx, cs, W);
  }

  drawFx(ctx, cs, W) {
    for (const f of this.fx) {
      const p = f.t / f.dur;
      if (f.type === 'trail') {
        ctx.globalAlpha = (1 - p) * 0.5;
        for (const s of f.segs) {
          const y0 = Math.max(0, s.top) * cs, y1 = s.bottom * cs;
          if (y1 <= y0) continue;
          const grad = ctx.createLinearGradient(0, y0, 0, y1);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(1, f.color.light);
          ctx.fillStyle = grad;
          ctx.fillRect(s.x * cs + cs * 0.15, y0, cs * 0.7, y1 - y0);
        }
      } else if (f.type === 'lock') {
        ctx.globalAlpha = (1 - p) * 0.55;
        ctx.fillStyle = '#fff';
        for (const [x, y] of f.cells) {
          if (y < HIDDEN) continue;
          roundRect(ctx, x * cs + cs * 0.06, (y - HIDDEN) * cs + cs * 0.06, cs * 0.88, cs * 0.88, cs * 0.2);
          ctx.fill();
        }
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
      ctx.fillStyle = p.color.base;
      for (const [x, y] of p.rotations[0]) {
        roundRect(ctx, (x - b.minX - b.w / 2) * it.size + 1.5, (y - b.minY - b.h / 2) * it.size + 1.5,
          it.size - 3, it.size - 3, it.size * 0.2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
