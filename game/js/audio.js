// Procedural WebAudio sound for Palmera Bay. No audio files: every sound is
// synthesized with oscillators and filtered noise.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.sirenHigh = false;
  }

  // Must be called from a user gesture (Play button).
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this._buildEngine();
      this._buildSiren();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _buildEngine() {
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 110;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(g2);
    g2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  _buildSiren() {
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  // speedNorm 0..1, driving true when the player is in a car.
  setEngine(driving, speedNorm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.045 + speedNorm * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.12);
    const f = 52 + speedNorm * 165;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(f * 2.02, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(320 + speedNorm * 900, t, 0.15);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenTimer) {
      this.sirenGain.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.2);
      this.sirenTimer = setInterval(() => {
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 950 : 660, this.ctx.currentTime, 0.05);
      }, 380);
    } else if (!on && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }
  }

  _tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  _noise(dur, vol, cutoff) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  click() { this._tone(1250, 0.06, 'square', 0.12); }
  chime() { this._tone(660, 0.16, 'triangle', 0.22); this._tone(830, 0.16, 'triangle', 0.22, 0.09); this._tone(990, 0.28, 'triangle', 0.24, 0.18); }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.3, 'triangle', 0.24, i * 0.11)); }
  crash() { this._noise(0.32, 0.5, 900); this._tone(90, 0.25, 'sine', 0.4, 0, 45); }
  punch() { this._noise(0.1, 0.35, 1400); }
  busted() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.4, 'sawtooth', 0.16, i * 0.16)); }
  wasted() { [220, 175, 147, 110].forEach((f, i) => this._tone(f, 0.5, 'sawtooth', 0.18, i * 0.2)); }
  failed() { this._tone(311, 0.35, 'square', 0.14); this._tone(233, 0.5, 'square', 0.14, 0.22); }
  horn() { this._tone(370, 0.35, 'square', 0.12); this._tone(466, 0.35, 'square', 0.1); }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }
}
