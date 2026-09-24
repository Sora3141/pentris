'use strict';

// Web Audio で合成する効果音（音声ファイル不要）
const Sfx = (() => {
  let ac = null;
  let master = null;
  let noiseBuf = null;
  let enabled = true;
  let volume = 0.7;

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ac = new Ctx();
    master = ac.createGain();
    master.gain.value = volume * 0.5;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp).connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function tone(freq, { type = 'triangle', dur = 0.08, vol = 0.2, attack = 0.004, to = null, at = 0 } = {}) {
    if (!enabled || !ac) return;
    const t0 = ac.currentTime + at;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, freq, at = 0) {
    if (!enabled || !ac) return;
    const t0 = ac.currentTime + at;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  const NOTES = [523.25, 659.25, 783.99, 987.77, 1174.66, 1318.51, 1567.98];

  return {
    init,
    setEnabled(v) { enabled = v; },
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v * 0.5;
    },
    move()   { tone(360, { type: 'square', dur: 0.025, vol: 0.025 }); },
    rotate() { tone(560, { dur: 0.05, vol: 0.07, to: 700 }); },
    hold()   { tone(440, { dur: 0.06, vol: 0.08 }); tone(660, { dur: 0.08, vol: 0.07, at: 0.05 }); },
    lock()   { tone(200, { type: 'sine', dur: 0.09, vol: 0.16, to: 130 }); },
    hard()   { tone(150, { type: 'sine', dur: 0.16, vol: 0.3, to: 55 }); noise(0.09, 0.12, 900); },
    clear(n) {
      for (let i = 0; i <= n; i++) {
        tone(NOTES[i], { dur: 0.22, vol: 0.1, at: i * 0.055 });
        tone(NOTES[i] * 2, { type: 'sine', dur: 0.18, vol: 0.04, at: i * 0.055 });
      }
      noise(0.25, 0.05, 4000);
    },
    allClear() {
      [0, 2, 4, 6].forEach((k, i) => tone(NOTES[k], { dur: 0.4, vol: 0.09, at: 0.25 + i * 0.08 }));
    },
    levelUp() {
      [0, 1, 2, 4].forEach((k, i) => tone(NOTES[k] / 2, { type: 'square', dur: 0.14, vol: 0.05, at: 0.3 + i * 0.07 }));
    },
    start() {
      [0, 2, 4].forEach((k, i) => tone(NOTES[k], { dur: 0.15, vol: 0.08, at: i * 0.07 }));
    },
    pause()  { tone(700, { type: 'sine', dur: 0.08, vol: 0.06, to: 500 }); },
    ui()     { tone(880, { type: 'sine', dur: 0.04, vol: 0.04 }); },
    gameOver() {
      [4, 3, 2, 0].forEach((k, i) => tone(NOTES[k] / 2, { type: 'triangle', dur: 0.3, vol: 0.1, at: i * 0.14 }));
    },
  };
})();
