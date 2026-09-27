/**
 * Journeys: three small goals at a time. Finishing one earns stamps, and
 * stamps unlock new paper for the plane. Progress is kept between visits.
 */

const STORE = 'paperplanes.journeys';

// event: what counts; goal: how much; label uses {n}.
const POOL = [
  { id: 'chain', event: 'chain', goal: 1, label: 'Thread a whole ring chain', stamps: 2 },
  { id: 'rings', event: 'ring', goal: 15, label: 'Fly through {n} rings', stamps: 1 },
  { id: 'skim', event: 'skim', goal: 4, label: 'Skim the ground for {n} seconds', stamps: 1 },
  { id: 'near', event: 'near', goal: 5, label: 'Slip past {n} trees', stamps: 1 },
  { id: 'flow', event: 'flow', goal: 4, label: 'Reach Flow ×{n}', stamps: 2, max: true },
  { id: 'thermal', event: 'thermal', goal: 80, label: 'Climb {n} m in thermals', stamps: 1 },
  { id: 'river', event: 'river', goal: 6, label: 'Ride wind rivers for {n} seconds', stamps: 1 },
  { id: 'rolls', event: 'roll', goal: 3, label: 'Barrel roll {n} times', stamps: 1 },
  { id: 'portal', event: 'portal', goal: 1, label: 'Fly through a portal', stamps: 1 },
  { id: 'animal', event: 'animal', goal: 1, label: 'Discover a new animal', stamps: 2 },
  { id: 'words', event: 'word', goal: 6, label: 'Catch {n} words for a poem', stamps: 1 },
  { id: 'score', event: 'score', goal: 60, label: 'Score {n} in one flight', stamps: 2, max: true },
  { id: 'nobrush', event: 'clean', goal: 45, label: 'Fly {n} s without brushing leaves', stamps: 1, max: true },
];

export const PAPERS = [
  { id: 'notebook', name: 'Notebook', stamps: 0 },
  { id: 'graph', name: 'Graph paper', stamps: 3 },
  { id: 'kraft', name: 'Kraft', stamps: 6 },
  { id: 'newsprint', name: 'Newsprint', stamps: 10 },
  { id: 'washi', name: 'Washi blossoms', stamps: 15 },
  { id: 'blueprint', name: 'Blueprint', stamps: 20 },
  { id: 'gold', name: 'Gold leaf', stamps: 30 },
];

export class Journeys {
  constructor() {
    this.stamps = 0;
    this.paper = 'notebook';
    this.active = [];
    this.done = 0;
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || '{}');
      this.stamps = s.stamps ?? 0;
      this.paper = s.paper ?? 'notebook';
      this.active = (s.active ?? []).filter((a) => POOL.some((p) => p.id === a.id));
      this.done = s.done ?? 0;
    } catch {
      /* storage unavailable */
    }
    while (this.active.length < 3) this.active.push(this._next());
    this.listeners = [];
  }

  _next() {
    const taken = new Set(this.active.map((a) => a.id));
    const options = POOL.filter((p) => !taken.has(p.id));
    const p = options[Math.floor(Math.random() * options.length)];
    // Goals grow a little as you complete more.
    const scale = p.max || p.goal === 1 ? 1 : 1 + Math.min(1, this.done / 20);
    return { id: p.id, progress: 0, goal: Math.round(p.goal * scale) };
  }

  def(a) {
    return POOL.find((p) => p.id === a.id);
  }

  label(a) {
    return this.def(a).label.replace('{n}', a.goal);
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ stamps: this.stamps, paper: this.paper, active: this.active, done: this.done }));
    } catch {
      /* storage unavailable */
    }
  }

  onComplete(fn) {
    this.listeners.push(fn);
  }

  /** Records progress. For "max" goals, `amount` is the current value. */
  track(event, amount = 1) {
    let changed = false;
    for (let i = 0; i < this.active.length; i++) {
      const a = this.active[i];
      const d = this.def(a);
      if (d.event !== event) continue;
      a.progress = d.max ? Math.max(a.progress, amount) : a.progress + amount;
      changed = true;
      if (a.progress >= a.goal) {
        const unlockedBefore = this.unlocked().length;
        this.stamps += d.stamps;
        this.done++;
        const finished = { label: this.label(a), stamps: d.stamps };
        this.active[i] = this._next();
        const newPaper = this.unlocked().length > unlockedBefore ? this.unlocked().at(-1) : null;
        this.save();
        for (const fn of this.listeners) fn(finished, newPaper);
      }
    }
    if (changed && Math.random() < 0.05) this.save();
  }

  unlocked() {
    return PAPERS.filter((p) => this.stamps >= p.stamps);
  }

  setPaper(id) {
    if (this.unlocked().some((p) => p.id === id)) {
      this.paper = id;
      this.save();
    }
  }
}
