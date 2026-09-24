'use strict';

// キーボード / タッチ共通の入力。左右移動は DAS（長押し待ち）と ARR（連続移動間隔）で処理する。
const KEYMAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'soft',
  Space: 'hard',
  ArrowUp: 'cw',
  KeyX: 'cw',
  KeyZ: 'ccw',
  KeyC: 'hold',
  ShiftLeft: 'hold',
  ShiftRight: 'hold',
};

class Input {
  constructor(handlers, settings) {
    this.h = handlers;
    this.settings = settings;
    this.reset();
  }

  reset() {
    this.held = { left: false, right: false };
    this.dir = 0;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.charged = false;
    if (this.softHeld) this.h.soft(false);
    this.softHeld = false;
  }

  press(action) {
    switch (action) {
      case 'left':
      case 'right':
        this.held[action] = true;
        this.startShift(action === 'left' ? -1 : 1);
        break;
      case 'soft':
        this.softHeld = true;
        this.h.soft(true);
        break;
      default:
        if (this.h[action]) this.h[action]();
    }
  }

  release(action) {
    if (action === 'left' || action === 'right') {
      this.held[action] = false;
      const d = action === 'left' ? -1 : 1;
      if (this.dir === d) {
        const other = action === 'left' ? 'right' : 'left';
        if (this.held[other]) this.startShift(-d);
        else this.dir = 0;
      }
    } else if (action === 'soft') {
      this.softHeld = false;
      this.h.soft(false);
    }
  }

  startShift(dir) {
    this.dir = dir;
    this.dasTimer = 0;
    this.arrTimer = 0;
    this.charged = false;
    this.h.move(dir);
  }

  update(dt) {
    if (!this.dir) return;
    const { das, arr } = this.settings;
    this.dasTimer += dt;
    if (this.dasTimer < das) return;
    if (arr === 0) {
      for (let i = 0; i < COLS && this.h.move(this.dir); i++);
      return;
    }
    if (!this.charged) {
      this.charged = true;
      this.arrTimer = arr + (this.dasTimer - das);
    } else {
      this.arrTimer += dt;
    }
    while (this.arrTimer >= arr) {
      this.arrTimer -= arr;
      if (!this.h.move(this.dir)) { this.arrTimer = 0; break; }
    }
  }
}
