/**
 * All sound is synthesised with WebAudio: a wind bed that follows airspeed,
 * a soft evolving pad, and pentatonic chimes for collected rings.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.note = 0;
  }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // Echo bus for a sense of space.
    this.echo = ctx.createDelay(1.5);
    this.echo.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const echoLP = ctx.createBiquadFilter();
    echoLP.type = 'lowpass';
    echoLP.frequency.value = 2200;
    this.echo.connect(echoLP).connect(fb).connect(this.echo);
    echoLP.connect(this.master);

    // Wind: looping brown noise through a moving band-pass.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.7;
    this.windFilter.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    // Pad: slow chord changes of soft detuned sines.
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 6);
    const padLP = ctx.createBiquadFilter();
    padLP.type = 'lowpass';
    padLP.frequency.value = 900;
    this.padGain.connect(padLP).connect(this.master);
    padLP.connect(this.echo);
    this.padVoices = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(this.padGain);
      o.start();
      this.padVoices.push(o);
    }
    this.chords = [
      [146.83, 220.0, 293.66, 369.99], // D
      [123.47, 185.0, 246.94, 293.66], // Bm
      [98.0, 146.83, 196.0, 246.94], // G
      [110.0, 164.81, 220.0, 277.18], // A
    ];
    this.chordIdx = 0;
    this._setChord(0);
    this.chordTimer = setInterval(() => this._setChord(++this.chordIdx), 9000);
  }

  _setChord(i) {
    const chord = this.chords[i % this.chords.length];
    const t = this.ctx.currentTime;
    this.padVoices.forEach((o, k) => {
      o.frequency.cancelScheduledValues(t);
      o.frequency.setTargetAtTime(chord[k] * (1 + (k - 1.5) * 0.002), t, 1.2);
    });
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  update(speed, cruise, boosting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const k = Math.max(0, Math.min(1.5, speed / cruise));
    this.windGain.gain.setTargetAtTime(0.05 + k * k * 0.12 + (boosting ? 0.05 : 0), t, 0.3);
    this.windFilter.frequency.setTargetAtTime(250 + k * 900, t, 0.3);
  }

  chime() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const scale = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51];
    const f = scale[this.note++ % scale.length];
    const t = ctx.currentTime;
    for (const [mult, type, vol] of [[1, 'sine', 0.18], [2, 'triangle', 0.05], [3.01, 'sine', 0.025]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.echo);
      o.start(t);
      o.stop(t + 2);
    }
  }

  thump() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }
}
