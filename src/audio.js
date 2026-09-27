/**
 * Sound design. Everything is synthesised with WebAudio: no audio files.
 *
 *  - A generative score per world (key, mode, tempo, pad and melody voices)
 *    driven by a look-ahead beat scheduler, with a soft rhythm layer that
 *    swells while you're boosting or chaining rings.
 *  - Game sounds (rings, words, discoveries) are pitched to the current
 *    chord, so they always harmonise with the music.
 *  - Flight sound: two wind layers panned with your bank, paper flutter,
 *    a rush near the ground, water lapping over lakes.
 *  - World ambience: birdsong, crickets, wind chimes; animal calls placed
 *    left/right by where the animal is.
 *
 * All timing goes through now(), so the engine can also be driven by an
 * OfflineAudioContext with a virtual clock (used to render previews).
 */

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

// Per-world score and ambience.
export const MUSIC = {
  meadow: { root: 50, scale: 'major', prog: [0, 4, 5, 3], bpm: 70, pad: 'warm', lead: 'kalimba', density: 0.42, bass: true, birds: 1, wind: 1 },
  sunset: { root: 53, scale: 'major', prog: [0, 5, 3, 4], bpm: 62, pad: 'warm', lead: 'harp', density: 0.34, bass: true, sevenths: true, birds: 0.5, wind: 0.9 },
  winter: { root: 52, scale: 'aeolian', prog: [0, 5, 2, 6], bpm: 56, pad: 'glass', lead: 'bell', density: 0.24, bass: false, birds: 0, wind: 1.5 },
  blossom: { root: 55, scale: 'major', prog: [0, 3, 5, 4], bpm: 76, pad: 'soft', lead: 'pluck', density: 0.48, bass: true, birds: 1.3, wind: 0.8 },
  twilight: { root: 45, scale: 'dorian', prog: [0, 3, 0, 6], bpm: 58, pad: 'warm', lead: 'flute', density: 0.3, bass: true, crickets: 1, birds: 0, wind: 0.8 },
  ethereal: { root: 48, scale: 'lydian', prog: [0, 1, 0, 4], bpm: 54, pad: 'choir', lead: 'bell', density: 0.3, bass: false, sevenths: true, chimes: 1, birds: 0.2, wind: 0.6 },
};

const SETTINGS_KEY = 'paperplanes.audio';

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.clock = null; // virtual time for offline rendering
    this.theme = MUSIC.meadow;
    this.themeKey = 'meadow';
    this.intensity = 0;
    this.leadStep = 7;
    this.vol = { music: 0.8, sfx: 0.9 };
    try {
      Object.assign(this.vol, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch {
      /* storage unavailable */
    }
  }

  now() {
    return this.clock ?? this.ctx.currentTime;
  }

  // -------------------------------------------------------------------------
  // Graph

  start(ctx = null) {
    if (this.ctx) return;
    this.ctx = ctx ?? new (window.AudioContext || window.webkitAudioContext)();
    const c = this.ctx;

    // Master: gentle glue compression, then a safety limiter.
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const glue = c.createDynamicsCompressor();
    Object.assign(glue, {});
    glue.threshold.value = -20;
    glue.knee.value = 14;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.02;
    glue.release.value = 0.3;
    const limit = c.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.002;
    limit.release.value = 0.1;
    this.master.connect(glue).connect(limit).connect(c.destination);

    // Buses.
    this.musicBus = c.createGain();
    this.ambBus = c.createGain();
    this.sfxBus = c.createGain();
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this._applyVolumes();

    // Reverb: a generated stereo hall, plus a shimmering delay for ethereal.
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(3.6);
    this.reverbIn = c.createGain();
    this.reverbIn.gain.value = 1;
    const revOut = c.createGain();
    revOut.gain.value = 0.55;
    this.reverbIn.connect(this.reverb).connect(revOut).connect(this.master);

    this.delay = c.createDelay(2);
    this.delay.delayTime.value = 0.46;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    const dlp = c.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2600;
    this.delayIn = c.createGain();
    this.delayIn.connect(this.delay);
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    dlp.connect(this.reverbIn);
    const dOut = c.createGain();
    dOut.gain.value = 0.4;
    dlp.connect(dOut).connect(this.master);

    this.noise = { white: this._noiseBuffer('white'), pink: this._noiseBuffer('pink'), brown: this._noiseBuffer('brown') };
    this._buildFlightBed();
    this._buildAmbienceBeds();

    this.nextBeat = this.now() + 0.2;
    this.beat = 0;
    this.chord = this._chord(0);
    this.padVoices = [];
    this.nextBird = this.now() + 2;
    this.nextChime = this.now() + 3;
  }

  _applyVolumes() {
    if (!this.musicBus) return;
    const t = this.now();
    this.musicBus.gain.setTargetAtTime(0.9 * this.vol.music, t, 0.1);
    this.ambBus.gain.setTargetAtTime(this.vol.sfx, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.1);
  }

  setVolume(kind, v) {
    this.vol[kind] = clamp(v, 0, 1);
    this._applyVolumes();
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.vol));
    } catch {
      /* storage unavailable */
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.now(), 0.1);
  }

  _noiseBuffer(kind) {
    const c = this.ctx;
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.2;
        }
      }
    }
    return buf;
  }

  _impulse(seconds) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Darkening tail: lowpass cutoff falls as the reverb decays.
        const k = 0.6 - t * 0.5;
        lp += (Math.random() * 2 - 1 - lp) * k;
        d[i] = lp * Math.pow(1 - t, 3) * (i < 40 ? i / 40 : 1);
      }
    }
    return buf;
  }

  _loop(buffer, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    s.loopStart = Math.random() * 3;
    s.start(this.now(), Math.random() * 3);
    return s;
  }

  _buildFlightBed() {
    const c = this.ctx;
    // Low body of the wind.
    this.windLow = c.createBiquadFilter();
    this.windLow.type = 'lowpass';
    this.windLow.frequency.value = 260;
    this.windLowGain = c.createGain();
    this.windLowGain.gain.value = 0;
    // Airy whistle: a moving band-pass.
    this.windHigh = c.createBiquadFilter();
    this.windHigh.type = 'bandpass';
    this.windHigh.Q.value = 1.2;
    this.windHigh.frequency.value = 900;
    this.windHighGain = c.createGain();
    this.windHighGain.gain.value = 0;
    this.windPan = c.createStereoPanner();
    this._loop(this.noise.brown).connect(this.windLow).connect(this.windLowGain).connect(this.windPan);
    this._loop(this.noise.pink).connect(this.windHigh).connect(this.windHighGain).connect(this.windPan);
    this.windPan.connect(this.ambBus);

    // Rush when skimming the ground or trees.
    this.rushFilter = c.createBiquadFilter();
    this.rushFilter.type = 'bandpass';
    this.rushFilter.frequency.value = 1400;
    this.rushFilter.Q.value = 0.7;
    this.rushGain = c.createGain();
    this.rushGain.gain.value = 0;
    this._loop(this.noise.white, 0.9).connect(this.rushFilter).connect(this.rushGain).connect(this.ambBus);

    // Paper flutter: bright noise, amplitude-modulated by a fast wobble.
    const flutterBP = c.createBiquadFilter();
    flutterBP.type = 'bandpass';
    flutterBP.frequency.value = 3600;
    flutterBP.Q.value = 1.8;
    this.flutterGain = c.createGain();
    this.flutterGain.gain.value = 0;
    const am = c.createGain();
    am.gain.value = 0.5;
    this.flutterLfo = c.createOscillator();
    this.flutterLfo.type = 'triangle';
    this.flutterLfo.frequency.value = 18;
    const lfoDepth = c.createGain();
    lfoDepth.gain.value = 0.5;
    this.flutterLfo.connect(lfoDepth).connect(am.gain);
    this.flutterLfo.start();
    this._loop(this.noise.white, 1.1).connect(flutterBP).connect(am).connect(this.flutterGain).connect(this.sfxBus);
  }

  _buildAmbienceBeds() {
    const c = this.ctx;
    // Water lapping: low noise with a slow swell.
    this.waterFilter = c.createBiquadFilter();
    this.waterFilter.type = 'lowpass';
    this.waterFilter.frequency.value = 520;
    this.waterGain = c.createGain();
    this.waterGain.gain.value = 0;
    this._loop(this.noise.pink, 0.7).connect(this.waterFilter).connect(this.waterGain).connect(this.ambBus);

    // Crickets: a high tone pulsed fast, in slow groups.
    const tone = c.createOscillator();
    tone.frequency.value = 4400;
    const pulse = c.createGain();
    pulse.gain.value = 0;
    const pulseLfo = c.createOscillator();
    pulseLfo.type = 'square';
    pulseLfo.frequency.value = 32;
    const pulseDepth = c.createGain();
    pulseDepth.gain.value = 0.5;
    pulseLfo.connect(pulseDepth).connect(pulse.gain);
    const group = c.createGain();
    group.gain.value = 0;
    const groupLfo = c.createOscillator();
    groupLfo.type = 'square';
    groupLfo.frequency.value = 0.9;
    const groupDepth = c.createGain();
    groupDepth.gain.value = 0.5;
    groupLfo.connect(groupDepth).connect(group.gain);
    this.cricketGain = c.createGain();
    this.cricketGain.gain.value = 0;
    const cp = c.createStereoPanner();
    cp.pan.value = 0.3;
    tone.connect(pulse).connect(group).connect(this.cricketGain).connect(cp).connect(this.ambBus);
    for (const o of [tone, pulseLfo, groupLfo]) o.start();
  }

  // -------------------------------------------------------------------------
  // Music theory helpers

  _note(index) {
    const s = SCALES[this.theme.scale];
    const oct = Math.floor(index / 7);
    return this.theme.root + oct * 12 + s[((index % 7) + 7) % 7];
  }

  /** Scale indices of the chord on a progression step (triad or seventh). */
  _chord(step) {
    const d = this.theme.prog[step % this.theme.prog.length];
    const idx = [d, d + 2, d + 4];
    if (this.theme.sevenths) idx.push(d + 6);
    return idx;
  }

  /** A chord tone near scale index `near`, in any octave. */
  _chordToneNear(near) {
    let best = near;
    let bestD = Infinity;
    for (const c of this.chord) {
      for (let o = -14; o <= 21; o += 7) {
        const i = c + o;
        const d = Math.abs(i - near);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Voices. Each takes (freq, time, options) and plays into a destination.

  _out(dest, pan = 0, reverb = 0.3, delay = 0) {
    const c = this.ctx;
    const g = c.createGain();
    const p = c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    g.connect(p).connect(dest);
    if (reverb > 0) {
      const r = c.createGain();
      r.gain.value = reverb;
      p.connect(r).connect(this.reverbIn);
    }
    if (delay > 0) {
      const d = c.createGain();
      d.gain.value = delay;
      p.connect(d).connect(this.delayIn);
    }
    return g;
  }

  _env(g, t, peak, attack, decay, hold = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (hold) g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
    return t + attack + hold + decay;
  }

  _osc(type, f, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(end + 0.05);
    return o;
  }

  kalimba(f, t, { vel = 1, pan = 0, dest = this.musicBus, reverb = 0.35 } = {}) {
    const g = this._out(dest, pan, reverb, 0.1);
    const end = this._env(g, t, 0.16 * vel, 0.004, 1.5);
    this._osc('sine', f, t, end, g);
    const click = this._out(dest, pan, 0.1);
    const ce = this._env(click, t, 0.05 * vel, 0.001, 0.06);
    this._osc('sine', f * 5.4, t, ce, click);
  }

  harp(f, t, { vel = 1, pan = 0, dest = this.musicBus, reverb = 0.4 } = {}) {
    const c = this.ctx;
    const g = this._out(dest, pan, reverb, 0.12);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 1.2);
    lp.connect(g);
    const end = this._env(g, t, 0.13 * vel, 0.006, 2.6);
    this._osc('triangle', f, t, end, lp);
    this._osc('sine', f * 2, t, end, lp);
  }

  bell(f, t, { vel = 1, pan = 0, dest = this.musicBus, reverb = 0.5, decay = 3.4 } = {}) {
    const c = this.ctx;
    const g = this._out(dest, pan, reverb, 0.2);
    const end = this._env(g, t, 0.11 * vel, 0.005, decay);
    const car = this._osc('sine', f, t, end, g);
    // FM: an inharmonic modulator whose depth fades, like a struck bell.
    const mod = c.createOscillator();
    mod.frequency.value = f * 3.5;
    const idx = c.createGain();
    idx.gain.setValueAtTime(f * 1.8, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.05, t + decay * 0.7);
    mod.connect(idx).connect(car.frequency);
    mod.start(t);
    mod.stop(end + 0.05);
  }

  pluck(f, t, { vel = 1, pan = 0, dest = this.musicBus, reverb = 0.3 } = {}) {
    const c = this.ctx;
    const g = this._out(dest, pan, reverb, 0.15);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + 0.35);
    lp.connect(g);
    const end = this._env(g, t, 0.1 * vel, 0.003, 1.1);
    this._osc('sawtooth', f, t, end, lp);
  }

  flute(f, t, { vel = 1, pan = 0, dest = this.musicBus, reverb = 0.45, len = 1.2 } = {}) {
    const c = this.ctx;
    const g = this._out(dest, pan, reverb, 0.15);
    const end = this._env(g, t, 0.09 * vel, 0.14, 1.2, len * 0.5);
    const o = this._osc('sine', f, t, end, g);
    const vib = c.createOscillator();
    vib.frequency.value = 5.2;
    const vd = c.createGain();
    vd.gain.setValueAtTime(0, t);
    vd.gain.linearRampToValueAtTime(f * 0.006, t + 0.5);
    vib.connect(vd).connect(o.frequency);
    vib.start(t);
    vib.stop(end + 0.05);
    // A little breath.
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 3;
    const bg = this._out(dest, pan, reverb);
    this._env(bg, t, 0.025 * vel, 0.05, 0.35);
    const n = c.createBufferSource();
    n.buffer = this.noise.white;
    n.connect(bp).connect(bg);
    n.start(t, Math.random() * 2);
    n.stop(t + 0.5);
  }

  _lead(f, t, opts) {
    const fn = { kalimba: this.kalimba, harp: this.harp, bell: this.bell, pluck: this.pluck, flute: this.flute }[this.theme.lead];
    fn.call(this, f, t, opts);
  }

  /** A sustained pad chord with a slow swell. */
  _pad(t, dur) {
    const c = this.ctx;
    const kind = this.theme.pad;
    const notes = this.chord.map((i, k) => this._note(i + (k === 0 ? 0 : 7)));
    const attack = kind === 'glass' || kind === 'choir' ? 3 : 2.2;
    for (const m of notes) {
      const f = midiHz(m);
      const g = this._out(this.musicBus, (Math.random() - 0.5) * 0.6, 0.6, kind === 'choir' ? 0.15 : 0);
      const peak = { warm: 0.022, glass: 0.018, soft: 0.026, choir: 0.02 }[kind];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.setValueAtTime(peak, t + dur);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 3.5);
      const end = t + dur + 3.6;
      if (kind === 'warm') {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        lp.connect(g);
        this._osc('sawtooth', f, t, end, lp, -7);
        this._osc('sawtooth', f, t, end, lp, 7);
      } else if (kind === 'glass') {
        this._osc('sine', f, t, end, g);
        this._osc('triangle', f * 2, t, end, g, 4);
      } else if (kind === 'soft') {
        this._osc('triangle', f, t, end, g, -5);
        this._osc('triangle', f, t, end, g, 5);
      } else {
        // Choir: a saw through two vowel formants, with a slow vibrato.
        const mix = c.createGain();
        mix.gain.value = 0.6;
        for (const [ff, q] of [[720, 7], [1150, 8]]) {
          const bp = c.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = ff;
          bp.Q.value = q;
          mix.connect(bp).connect(g);
        }
        const o = this._osc('sawtooth', f, t, end, mix);
        const vib = c.createOscillator();
        vib.frequency.value = 4.6 + Math.random();
        const vd = c.createGain();
        vd.gain.value = f * 0.005;
        vib.connect(vd).connect(o.frequency);
        vib.start(t);
        vib.stop(end);
      }
    }
  }

  _bass(t, dur) {
    const f = midiHz(this._note(this.chord[0]) - 12);
    const g = this._out(this.musicBus, 0, 0.1);
    const end = this._env(g, t, 0.07, 0.4, dur * 0.8, dur * 0.3);
    this._osc('sine', f, t, end, g);
    this._osc('triangle', f * 2, t, end, g, 0).detune.value = 2;
  }

  _shaker(t, vel) {
    const c = this.ctx;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g = this._out(this.musicBus, 0.25, 0.1);
    this._env(g, t, 0.05 * vel, 0.008, 0.07);
    const n = c.createBufferSource();
    n.buffer = this.noise.white;
    n.connect(hp).connect(g);
    n.start(t, Math.random() * 3);
    n.stop(t + 0.12);
  }

  // -------------------------------------------------------------------------
  // The score: a beat scheduler that looks a little ahead.

  _scheduleMusic() {
    const spb = 60 / this.theme.bpm;
    const horizon = this.now() + 0.25;
    while (this.nextBeat < horizon) {
      const t = this.nextBeat;
      const b = this.beat;
      // New chord every two bars.
      if (b % 8 === 0) {
        this.chord = this._chord(Math.floor(b / 8));
        this._pad(t, spb * 8);
        if (this.theme.bass) this._bass(t, spb * 8);
      }
      // Melody: a gentle random walk that leans on chord tones.
      const busy = this.theme.density * (0.7 + this.intensity * 0.6);
      if (Math.random() < busy && b % 8 !== 7) {
        this.leadStep += Math.round((Math.random() - 0.5) * 4);
        this.leadStep = clamp(this.leadStep, 5, 16);
        const idx = Math.random() < 0.6 ? this._chordToneNear(this.leadStep) : this.leadStep;
        const swing = b % 2 ? 0.02 : 0;
        this._lead(midiHz(this._note(idx)), t + swing, { vel: 0.7 + Math.random() * 0.3, pan: (Math.random() - 0.5) * 0.5 });
        // Now and then, a grace note on the off-beat.
        if (Math.random() < 0.18) {
          this._lead(midiHz(this._note(this._chordToneNear(idx + 2))), t + spb / 2, { vel: 0.5, pan: (Math.random() - 0.5) * 0.6 });
        }
      }
      // Rhythm swells in with speed and combos.
      if (this.intensity > 0.2) {
        this._shaker(t, this.intensity);
        this._shaker(t + spb / 2, this.intensity * 0.6);
      }
      this.nextBeat += spb;
      this.beat++;
    }
  }

  setTheme(key) {
    this.themeKey = key;
    this.theme = MUSIC[key] ?? MUSIC.meadow;
    if (!this.ctx) return;
    // Start the new score on the next beat, from the top of its progression.
    this.beat = 0;
    this.nextBeat = Math.max(this.nextBeat, this.now() + 0.4);
  }

  // -------------------------------------------------------------------------
  // Per-frame update.

  /**
   * s: { speed, cruise, boosting, gust, roll, altitude, groundDist,
   *      overWater, combo, dt }
   */
  update(s) {
    if (!this.ctx) return;
    const t = this.now();
    const th = this.theme;
    const k = clamp(s.speed / s.cruise, 0, 2.2);
    const low = clamp(1 - (s.groundDist - 8) / 70, 0, 1); // near the ground
    const high = clamp((s.altitude - 120) / 250, 0, 1);

    // Flight wind.
    this.gustPhase = (this.gustPhase ?? 0) + (s.dt ?? 0.016);
    const swell = 0.75 + 0.25 * Math.sin(this.gustPhase * 0.37) * Math.sin(this.gustPhase * 0.13 + 1);
    const w = th.wind * swell;
    this.windLowGain.gain.setTargetAtTime((0.05 + 0.07 * k * k) * w, t, 0.25);
    this.windHighGain.gain.setTargetAtTime((0.015 + 0.05 * k * k + high * 0.05 + (s.boosting ? 0.03 : 0)) * w, t, 0.25);
    this.windHigh.frequency.setTargetAtTime(500 + k * 900 + high * 600 + swell * 200, t, 0.3);
    this.windLow.frequency.setTargetAtTime(180 + k * 160, t, 0.3);
    this.windPan.pan.setTargetAtTime(clamp(s.roll * 0.45, -0.6, 0.6), t, 0.2);
    // Skimming the ground: a rushing hiss.
    const skim = clamp(1 - s.groundDist / 22, 0, 1);
    this.rushGain.gain.setTargetAtTime(skim * skim * 0.12 * k, t, 0.12);
    this.rushFilter.frequency.setTargetAtTime(900 + k * 900, t, 0.2);
    // Paper flutter: faster and louder with speed.
    this.flutterGain.gain.setTargetAtTime(0.004 + 0.018 * clamp(k - 0.6, 0, 1.4), t, 0.3);
    this.flutterLfo.frequency.setTargetAtTime(12 + k * 14, t, 0.3);

    // Ambience.
    this.waterGain.gain.setTargetAtTime(s.overWater ? 0.1 * low : 0, t, 0.8);
    this.waterFilter.frequency.setTargetAtTime(380 + 200 * swell, t, 0.5);
    this.cricketGain.gain.setTargetAtTime((th.crickets ?? 0) * 0.018 * (0.3 + 0.7 * low), t, 1);
    if (th.birds && t > this.nextBird) {
      if (Math.random() < low * th.birds) this.birdsong(t, (Math.random() - 0.5) * 1.6);
      this.nextBird = t + 1.2 + Math.random() * 3.5;
    }
    if (th.chimes && t > this.nextChime) {
      this.windChimes(t);
      this.nextChime = t + 2.5 + Math.random() * 5;
    }

    // Music intensity: gusts and combos lift it; it relaxes on its own.
    const target = clamp((s.gust ?? 0) * 0.7 + Math.min(1, (s.combo ?? 0) / 5) * 0.5 + (s.boosting ? 0.3 : 0), 0, 1);
    this.intensity += (target - this.intensity) * (target > this.intensity ? 0.08 : 0.01);
    this._scheduleMusic();
  }

  // -------------------------------------------------------------------------
  // Ambience voices

  birdsong(t, pan) {
    const c = this.ctx;
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 5);
    const g = this._out(this.ambBus, pan, 0.25);
    g.gain.value = 0.9;
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.09 + Math.random() * 0.06);
      const e = c.createGain();
      e.gain.setValueAtTime(0.0001, s);
      e.gain.linearRampToValueAtTime(0.03, s + 0.01);
      e.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
      const o = c.createOscillator();
      const f0 = base * (0.9 + Math.random() * 0.3);
      o.frequency.setValueAtTime(f0, s);
      o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.4 : 0.7), s + 0.07);
      o.connect(e).connect(g);
      o.start(s);
      o.stop(s + 0.1);
    }
  }

  windChimes(t) {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const idx = this._chordToneNear(14 + Math.floor(Math.random() * 6));
      this.bell(midiHz(this._note(idx)), t + i * (0.15 + Math.random() * 0.3), {
        vel: 0.25 + Math.random() * 0.2, pan: (Math.random() - 0.5) * 1.4, dest: this.ambBus, reverb: 0.8, decay: 4,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Game events

  /** Ring sounds, pitched to the current chord; combos climb. */
  ring(type, combo = 1, pan = 0) {
    if (!this.ctx) return;
    const t = this.now();
    const up = Math.min(combo - 1, 7);
    const base = this._chordToneNear(12 + up);
    const f = midiHz(this._note(base));
    const o = { pan, dest: this.sfxBus };
    switch (type) {
      case 'swift':
        this._whoosh(t, 500, 4200, 0.7, 0.22, pan);
        this.bell(f, t + 0.05, { ...o, vel: 1.1, decay: 2 });
        this.bell(midiHz(this._note(base + 4)), t + 0.18, { ...o, vel: 0.8, decay: 2 });
        break;
      case 'prism':
        [0, 2, 4, 7, 9, 11].forEach((d, i) =>
          this.bell(midiHz(this._note(this._chordToneNear(base + d))), t + i * 0.06, { ...o, vel: 0.7, pan: pan + (i - 2.5) * 0.15 }),
        );
        break;
      case 'flip':
        this._slide(midiHz(this._note(base - 4)), midiHz(this._note(base + 3)), t, 0.35, pan);
        this._slide(midiHz(this._note(base + 3)), midiHz(this._note(base - 2)), t + 0.4, 0.5, pan);
        break;
      case 'portal':
        this.portalRiser(t);
        break;
      default:
        this.kalimba(f, t, { ...o, vel: 1.1, reverb: 0.4 });
        this.bell(f * 2, t, { ...o, vel: 0.35, decay: 1.4 });
    }
  }

  gust() {
    if (!this.ctx) return;
    this._whoosh(this.now(), 300, 1800, 0.5, 0.12, 0);
  }

  _whoosh(t, from, to, dur, vol, pan) {
    const c = this.ctx;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(from, t);
    bp.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
    const g = this._out(this.sfxBus, pan, 0.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const n = c.createBufferSource();
    n.buffer = this.noise.pink;
    n.connect(bp).connect(g);
    n.start(t, Math.random() * 3);
    n.stop(t + dur + 0.05);
  }

  _slide(f0, f1, t, dur, pan) {
    const g = this._out(this.sfxBus, pan, 0.4, 0.15);
    const end = this._env(g, t, 0.1, 0.02, dur + 0.6);
    const o = this._osc('triangle', f0, t, end, g);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  }

  portalRiser(t = this.now()) {
    this._whoosh(t, 200, 6000, 1.6, 0.2, 0);
    for (let i = 0; i < 7; i++) {
      const idx = this._chordToneNear(7 + i * 2);
      this.bell(midiHz(this._note(idx)), t + 0.2 + i * 0.1, { dest: this.sfxBus, vel: 0.5, pan: (i - 3) * 0.2, reverb: 0.8, decay: 3.5 });
    }
  }

  /** On arriving in a new world: a soft swell in its key. */
  arrive() {
    if (!this.ctx) return;
    const t = this.now() + 0.2;
    this.chord = this._chord(0);
    this.chord.forEach((i, k) => this.harp(midiHz(this._note(i + 7)), t + k * 0.12, { dest: this.sfxBus, vel: 0.6, pan: (k - 1.5) * 0.3 }));
  }

  /**
   * A word caught: a note in key. Nouns ring as bells, verbs as kalimba,
   * adjectives as harp; small words sit lower and softer. Returns the pitch.
   */
  word(pos, index = 0, pan = 0) {
    if (!this.ctx) return 0;
    const t = this.now();
    const reg = { noun: 14, verb: 12, adj: 15, art: 7, pron: 8, prep: 9, conj: 7, adv: 11, suffix: 18 }[pos] ?? 12;
    const idx = pos === 'adj' ? reg + (index % 3) : this._chordToneNear(reg + (index % 4));
    const f = midiHz(this._note(idx));
    const o = { pan, dest: this.sfxBus };
    if (pos === 'noun') this.bell(f, t, { ...o, vel: 0.9 });
    else if (pos === 'verb') this.kalimba(f, t, { ...o, vel: 1 });
    else if (pos === 'adj') this.harp(f, t, { ...o, vel: 0.9 });
    else this.kalimba(f, t, { ...o, vel: 0.6 });
    return f;
  }

  /** A finished line: its notes replayed as a slow arpeggio over a swell. */
  readLine(freqs) {
    if (!this.ctx) return;
    const t = this.now() + 0.3;
    freqs.forEach((f, i) => this.bell(f, t + i * 0.3, { dest: this.sfxBus, vel: 0.7, pan: (i / Math.max(1, freqs.length - 1) - 0.5) * 0.8, reverb: 0.7 }));
    this.chord.forEach((i, k) => this.flute(midiHz(this._note(i + 7)), t, { dest: this.sfxBus, vel: 0.4, len: 3, pan: (k - 1) * 0.4 }));
  }

  /** The fridge-magnet clack as a word snaps onto the strip. */
  magnet() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = this.now() + 0.25;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = this._out(this.sfxBus, 0, 0.05);
    this._env(g, t, 0.12, 0.001, 0.03);
    const n = c.createBufferSource();
    n.buffer = this.noise.white;
    n.connect(hp).connect(g);
    n.start(t, Math.random());
    n.stop(t + 0.05);
    const th = this._out(this.sfxBus, 0, 0);
    const e = this._env(th, t, 0.1, 0.002, 0.07);
    this._osc('sine', 140, t, e, th).frequency.exponentialRampToValueAtTime(70, t + 0.06);
  }

  /** Paper rustle (opening the poem, pausing). */
  paper() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = this.now();
    for (let i = 0; i < 5; i++) {
      const s = t + i * 0.045 + Math.random() * 0.02;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500 + Math.random() * 3000;
      bp.Q.value = 1.5;
      const g = this._out(this.sfxBus, (Math.random() - 0.5) * 0.4, 0.05);
      this._env(g, s, 0.07, 0.004, 0.05 + Math.random() * 0.05);
      const n = c.createBufferSource();
      n.buffer = this.noise.white;
      n.connect(bp).connect(g);
      n.start(s, Math.random() * 3);
      n.stop(s + 0.15);
    }
  }

  click() {
    if (!this.ctx) return;
    const t = this.now();
    const g = this._out(this.sfxBus, 0, 0);
    const e = this._env(g, t, 0.035, 0.002, 0.04);
    this._osc('sine', 1500, t, e, g);
  }

  discover(pan = 0) {
    if (!this.ctx) return;
    const t = this.now();
    [0, 2, 4, 7].forEach((d, i) => this.harp(midiHz(this._note(this._chordToneNear(9 + d))), t + i * 0.13, { dest: this.sfxBus, vel: 0.9, pan }));
  }

  /** Scraping the ground or skipping off water. */
  thump(surface = 'grass') {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = this.now();
    const g = this._out(this.sfxBus, 0, 0.1);
    const e = this._env(g, t, 0.12, 0.003, 0.22);
    this._osc('sine', 120, t, e, g).frequency.exponentialRampToValueAtTime(55, t + 0.2);
    // Grass swish or water splash on top.
    const bp = c.createBiquadFilter();
    bp.type = surface === 'water' ? 'lowpass' : 'bandpass';
    bp.frequency.setValueAtTime(surface === 'water' ? 3000 : 2200, t);
    bp.frequency.exponentialRampToValueAtTime(surface === 'water' ? 500 : 900, t + 0.35);
    const ng = this._out(this.sfxBus, 0, 0.2);
    this._env(ng, t, surface === 'water' ? 0.16 : 0.08, 0.005, 0.35);
    const n = c.createBufferSource();
    n.buffer = this.noise.white;
    n.connect(bp).connect(ng);
    n.start(t, Math.random() * 3);
    n.stop(t + 0.45);
    if (surface === 'water') {
      for (let i = 0; i < 4; i++) {
        const s = t + 0.08 + Math.random() * 0.25;
        const bg = this._out(this.sfxBus, (Math.random() - 0.5) * 0.6, 0.2);
        const be = this._env(bg, s, 0.03, 0.002, 0.06);
        this._osc('sine', 600 + Math.random() * 900, s, be, bg).frequency.exponentialRampToValueAtTime(1600 + Math.random() * 900, s + 0.05);
      }
    }
  }

  /** Animal calls, placed by `pan` and softened by distance (0..1). */
  animal(kind, pan = 0, near = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = this.now();
    const vol = 0.25 + 0.75 * near;
    const voice = (type, f0, f1, s, dur, peak, filt) => {
      const g = this._out(this.ambBus, pan, 0.35);
      const end = this._env(g, s, peak * vol, 0.02, dur);
      let dest = g;
      if (filt) {
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = filt;
        bp.Q.value = 3;
        bp.connect(g);
        dest = bp;
      }
      const o = this._osc(type, f0, s, end, dest);
      o.frequency.exponentialRampToValueAtTime(f1, s + dur * 0.8);
      return o;
    };
    switch (kind) {
      case 'eagle': {
        // "Kee-eeer": a bright FM screech that falls away.
        const o = voice('sine', 2400, 1500, t, 0.9, 0.05);
        const m = c.createOscillator();
        m.frequency.value = 610;
        const d = c.createGain();
        d.gain.value = 900;
        m.connect(d).connect(o.frequency);
        m.start(t);
        m.stop(t + 1);
        break;
      }
      case 'duck':
        for (let i = 0; i < 3; i++) voice('sawtooth', 300, 200, t + i * 0.2, 0.13, 0.05, 1000);
        break;
      case 'goat': {
        const o = voice('sawtooth', 330, 300, t, 0.7, 0.04, 1100);
        const v = c.createOscillator();
        v.frequency.value = 7;
        const d = c.createGain();
        d.gain.value = 18;
        v.connect(d).connect(o.frequency);
        v.start(t);
        v.stop(t + 0.8);
        break;
      }
      case 'fox':
        voice('sawtooth', 900, 1400, t, 0.12, 0.035, 1500);
        voice('sawtooth', 950, 1500, t + 0.22, 0.12, 0.03, 1500);
        break;
      case 'deer':
        voice('sawtooth', 420, 260, t, 0.2, 0.04, 700);
        break;
      case 'bear':
        voice('sawtooth', 75, 60, t, 0.6, 0.06, 300);
        break;
      case 'fish':
        this.thump('water');
        break;
      default:
    }
  }

  // Kept for older callers.
  chime() {
    this.ring('gold');
  }
}
