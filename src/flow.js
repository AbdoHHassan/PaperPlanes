/**
 * Flow: the heart of the loop. It builds when you fly with style (skimming
 * the ground, slipping past trees, threading rings, riding the air, tricks)
 * and ebbs when you coast or scrape. Flow multiplies your score and raises
 * your cruising speed, so good flying snowballs, gently.
 */

export const FLOW_MAX = 5;

const GAIN = {
  skim: 0.4, // per second, scaled by how low
  near: 0.3,
  ring: 0.3,
  chain: 0.9,
  roll: 0.25,
  thermal: 0.1, // per second
  ridge: 0.08, // per second
  river: 0.3, // per second
  word: 0.2,
};
const LOSS = { bump: 1.0, brush: 0.7 };

export class Flow {
  constructor() {
    this.value = 0;
    this.lastGain = -99;
    this.time = 0;
    this.peakLevel = 1;
  }

  get level() {
    return Math.min(FLOW_MAX, Math.floor(this.value) + 1);
  }

  /** Extra cruise speed from flow (m/s). */
  get cruiseBonus() {
    return this.value * 1.6;
  }

  gain(kind, amount = 1) {
    const before = this.level;
    this.value = Math.min(FLOW_MAX - 0.001, this.value + (GAIN[kind] ?? 0.1) * amount);
    this.lastGain = this.time;
    const after = this.level;
    if (after > this.peakLevel) this.peakLevel = after;
    return after > before ? after : 0; // returns the new level on level-up
  }

  lose(kind) {
    this.value = Math.max(0, this.value - (LOSS[kind] ?? 0.5));
  }

  update(dt) {
    this.time += dt;
    // Coasting lets flow ebb away slowly, after a short grace.
    if (this.time - this.lastGain > 2.5) this.value = Math.max(0, this.value - dt * 0.14);
  }

  reset() {
    this.value = 0;
  }
}
