'use strict';

// 盤面上のスワイプ操作
//   横ドラッグ: 指に追従して移動 / 下ドラッグ: ソフトドロップ
//   タップ: 回転（左半分 = 左回転, 右半分 = 右回転）
//   下フリック: ハードドロップ / 上フリック: ホールド
class Gestures {
  constructor(target, handlers) {
    this.el = target;
    this.h = handlers;
    this.id = null;
    target.addEventListener('pointerdown', e => this.down(e));
    target.addEventListener('pointermove', e => this.move(e));
    target.addEventListener('pointerup', e => this.up(e));
    target.addEventListener('pointercancel', e => this.cancel(e));
  }

  down(e) {
    if (e.pointerType === 'mouse' || this.id !== null || !this.h.active()) return;
    e.preventDefault();
    this.id = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    this.sx = this.ax = e.clientX;
    this.sy = this.ay = e.clientY;
    this.t0 = e.timeStamp;
    this.moved = false;
    this.samples = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
  }

  move(e) {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    const { x: stepX, y: stepY } = this.h.step();

    let dx = e.clientX - this.ax;
    while (Math.abs(dx) >= stepX) {
      const d = Math.sign(dx);
      this.h.move(d);
      this.ax += d * stepX;
      dx -= d * stepX;
      this.moved = true;
    }

    // 縦方向が優勢なときだけソフトドロップ（斜めの横移動で落ちないように）
    const vertical = Math.abs(e.clientY - this.sy) > Math.abs(e.clientX - this.sx);
    if (!vertical || e.clientY < this.ay) {
      this.ay = Math.min(this.ay, e.clientY);
      if (!vertical) this.ay = e.clientY;
    } else {
      while (e.clientY - this.ay >= stepY) {
        this.h.soft();
        this.ay += stepY;
        this.moved = true;
      }
    }

    this.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    while (this.samples.length > 2 && e.timeStamp - this.samples[0].t > 90) this.samples.shift();
  }

  up(e) {
    if (e.pointerId !== this.id) return;
    this.id = null;
    const dx = e.clientX - this.sx;
    const dy = e.clientY - this.sy;
    const dur = e.timeStamp - this.t0;

    const first = this.samples[0];
    const dt = Math.max(1, e.timeStamp - first.t);
    const vx = (e.clientX - first.x) / dt;
    const vy = (e.clientY - first.y) / dt;

    if (!this.moved && Math.hypot(dx, dy) < 12 && dur < 400) {
      const r = this.h.frameRect();
      this.h.rotate(e.clientX < r.left + r.width / 2 ? -1 : 1);
    } else if (vy > 0.7 && dy > 36 && Math.abs(vy) > Math.abs(vx) * 1.4) {
      this.h.hard();
    } else if (vy < -0.6 && dy < -36 && Math.abs(vy) > Math.abs(vx) * 1.4) {
      this.h.hold();
    }
  }

  cancel(e) {
    if (e.pointerId === this.id) this.id = null;
  }
}
