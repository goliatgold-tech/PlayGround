// Tiny procedural sound engine - no audio assets needed.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.ambient = null;
  }

  init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startAmbient();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  noiseBuffer(seconds = 1) {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.055;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.ambient = { src, gain, filter };
    // slow swell
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(gain.gain);
    lfo.start();
  }

  tone(freq, duration, type = 'sine', gainValue = 0.2, slide = 0) {
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), this.ctx.currentTime + duration);
    gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  noise(duration = 0.4, freq = 800, q = 1, gainValue = 0.25, type = 'lowpass') {
    if (!this.ctx || !this.enabled) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(Math.max(0.2, duration));
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.35), this.ctx.currentTime + duration);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    src.stop(this.ctx.currentTime + duration);
  }

  cannon() {
    this.noise(0.5, 900, 0.8, 0.4);
    this.tone(120, 0.35, 'sine', 0.32, -70);
  }

  hit() {
    this.noise(0.25, 1400, 1, 0.22);
    this.tone(220, 0.18, 'square', 0.06, -80);
  }

  splash() {
    this.noise(0.4, 1800, 0.7, 0.14, 'highpass');
  }

  pickup() {
    this.tone(660, 0.14, 'triangle', 0.15);
    setTimeout(() => this.tone(990, 0.22, 'triangle', 0.13), 80);
  }

  levelup() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.35, 'triangle', 0.14), i * 110);
    });
  }

  click() {
    this.tone(420, 0.06, 'sine', 0.05);
  }

  error() {
    this.tone(150, 0.18, 'sawtooth', 0.06, -40);
  }
}
