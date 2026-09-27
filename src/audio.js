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

  _tone(f, t, { type = 'sine', vol = 0.15, attack = 0.01, decay = 1.6, glideTo = 0, echo = true } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + decay * 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(this.master);
    if (echo) g.connect(this.echo);
    o.start(t);
    o.stop(t + decay + 0.1);
  }

  _noiseSweep(t, from, to, dur, vol) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  /** Ring sounds. `combo` nudges the pitch up the scale as chains build. */
  ring(type, combo = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const scale = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51, 1479.98];
    const f = scale[Math.min(scale.length - 1, (combo - 1) % 8)];
    switch (type) {
      case 'swift':
        this._noiseSweep(t, 400, 3000, 0.6, 0.25);
        this._tone(f, t, { vol: 0.12, glideTo: f * 2, decay: 0.9 });
        break;
      case 'prism':
        [1, 1.25, 1.5, 2, 2.5].forEach((m, i) => this._tone(f * m, t + i * 0.07, { vol: 0.1, decay: 1.4 }));
        break;
      case 'flip':
        this._tone(f * 0.75, t, { type: 'triangle', vol: 0.12, glideTo: f * 1.5, decay: 0.7 });
        this._tone(f * 1.5, t + 0.35, { vol: 0.08, glideTo: f * 0.75, decay: 0.8 });
        break;
      case 'portal':
        for (let i = 0; i < 6; i++) this._tone(220 * (1 + i * 0.5), t + i * 0.05, { vol: 0.07, decay: 2.4, glideTo: 440 * (1 + i * 0.5) });
        this._noiseSweep(t, 200, 5000, 1.2, 0.18);
        break;
      default:
        this._tone(f, t, { vol: 0.18, decay: 1.8 });
        this._tone(f * 2, t, { type: 'triangle', vol: 0.05, decay: 1.2 });
    }
  }

  chime() {
    this.ring('gold');
  }

  /**
   * A word caught: a soft mallet note. Each part of speech has its own
   * register, and the pitch walks a pentatonic scale as the line grows.
   */
  word(pos, index = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const base = { noun: 293.66, verb: 329.63, adj: 392.0, art: 220.0, pron: 246.94, prep: 261.63, conj: 196.0, adv: 349.23, suffix: 440.0 }[pos] ?? 293.66;
    const f = base * Math.pow(2, scale[index % scale.length] / 12);
    this._tone(f, t, { type: 'sine', vol: 0.14, decay: 2.2 });
    this._tone(f * 2.01, t, { type: 'sine', vol: 0.04, decay: 1.1 });
    this._tone(f * 3.99, t + 0.01, { type: 'triangle', vol: 0.015, decay: 0.5 });
    return f;
  }

  /** A finished line is played back as a slow, rising arpeggio. */
  readLine(freqs) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    freqs.forEach((f, i) => this._tone(f, t + 0.35 + i * 0.28, { type: 'sine', vol: 0.1, decay: 2.6 }));
    [146.83, 220.0, 293.66].forEach((f) => this._tone(f, t, { type: 'triangle', vol: 0.05, decay: 4.5, attack: 0.8 }));
  }

  discover() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone(f, t + i * 0.12, { type: 'triangle', vol: 0.09, decay: 1.2 }));
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
