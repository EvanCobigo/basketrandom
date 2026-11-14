// Tiny synthesized sound effects via WebAudio (no audio files needed).

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.last = {};
    try { this.muted = localStorage.getItem('flophoops.muted') === '1'; } catch { /* storage unavailable */ }
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    try { localStorage.setItem('flophoops.muted', this.muted ? '1' : '0'); } catch { /* ignore */ }
    return this.muted;
  }

  _throttle(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  _tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, freq = 800, q = 1, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  jump() {
    if (!this._throttle('jump', 60)) return;
    this._tone('square', 220 + Math.random() * 60, 520, 0.12, 0.08);
  }

  bounce(kind, speed) {
    const v = Math.min(1, speed / 1200);
    if (v < 0.05) return;
    if (kind === 'rim') {
      if (!this._throttle('rim', 50)) return;
      this._tone('triangle', 900 + Math.random() * 200, 700, 0.25, 0.25 * v + 0.05);
      this._tone('sine', 1650, 1500, 0.18, 0.1 * v);
    } else if (kind === 'board') {
      if (!this._throttle('board', 50)) return;
      this._noise(0.12, 0.4 * v, 500, 2);
      this._tone('sine', 180, 120, 0.12, 0.25 * v);
    } else if (kind === 'part') {
      if (!this._throttle('part', 40)) return;
      this._tone('sine', 260, 140, 0.08, 0.25 * v);
    } else {
      if (!this._throttle('ground', 40)) return;
      this._tone('sine', 150, 60, 0.16, 0.5 * v);
      this._noise(0.05, 0.2 * v, 300, 1.5);
    }
  }

  bump(speed) {
    if (!this._throttle('bump', 90)) return;
    const v = Math.min(1, speed / 900);
    this._noise(0.08, 0.25 * v, 220, 1);
  }

  grab() {
    if (!this._throttle('grab', 80)) return;
    this._tone('sine', 520, 780, 0.07, 0.12);
  }

  throw() { this._noise(0.14, 0.18, 1400, 0.8); }

  score() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone('square', f, f, 0.16, 0.12, i * 0.08));
    this._noise(1.2, 0.18, 1200, 0.4, 0.05);   // crowd-ish roar
    this._noise(0.25, 0.2, 3000, 0.7);         // swish
  }

  whistle() { this._tone('sine', 2300, 2250, 0.28, 0.12); this._tone('sine', 2500, 2400, 0.28, 0.06); }

  countdown(final) { this._tone('square', final ? 880 : 440, final ? 880 : 440, final ? 0.3 : 0.12, 0.1); }

  victory() {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => this._tone('triangle', f, f, 0.22, 0.18, i * 0.13));
  }
}
