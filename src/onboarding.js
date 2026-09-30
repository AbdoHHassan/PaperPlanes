/**
 * Flight School: a short guided first flight that teaches, in order,
 * (A) how to steer, (B) how to fly through rings, and (C) how to build a
 * sentence from word magnets. Every instruction is worded for the device
 * you're actually using (mouse, keyboard, tilt or touch) and updates live if
 * you switch.
 */

import * as THREE from 'three';
import { Composer } from './grammar.js';
import { Guide } from './guide.js';

const STORE = 'paperplanes.onboarded';
const GUIDE_MODE = { steer: 'x', pitch: 'y', gust: 'press', rings: 'target', words: 'target', done: 'celebrate' };

const STEPS = [
  {
    id: 'steer',
    group: 'Steer',
    title: 'Follow the glowing plane',
    text: {
      mouse: 'Mouse left and right to bank. Light both lanterns.',
      keys: 'A / D (or ← →) to bank. Light both lanterns.',
      tilt: 'Tilt your phone left and right. Light both lanterns.',
      touch: 'Drag left and right. Light both lanterns.',
    },
    hint: 'x',
  },
  {
    id: 'pitch',
    group: 'Steer',
    title: 'Climb and dive with it',
    text: {
      mouse: 'Mouse up to climb, down to dive.',
      keys: 'W / S (or ↑ ↓) to climb and dive.',
      tilt: 'Tip the top edge towards you to climb, away to dive.',
      touch: 'Drag up to climb, down to dive.',
    },
    hint: 'y',
  },
  {
    id: 'gust',
    group: 'Steer',
    title: 'Surge like it does',
    text: {
      mouse: 'Hold the mouse button for a gust.',
      keys: 'Hold Space for a gust.',
      tilt: 'Touch and hold the screen for a gust.',
      touch: 'Hold a second finger down for a gust.',
    },
    hint: 'press',
  },
  {
    id: 'rings',
    group: 'Rings',
    title: 'Thread the rings',
    text: {
      mouse: 'Follow the ghost and the golden path through all three.',
      keys: 'Follow the ghost and the golden path through all three.',
      tilt: 'Follow the ghost through all three. Small tilts are enough.',
      touch: 'Follow the ghost and the golden path through all three.',
    },
    hint: 'ring',
  },
  {
    id: 'words',
    group: 'Words',
    title: 'Write a line',
    text: {
      mouse: 'Fly through the bouncing word. The dashed box below shows what the sentence needs.',
      keys: 'Fly through the bouncing word. The dashed box below shows what the sentence needs.',
      tilt: 'Tilt through the bouncing word. The dashed box below shows what the sentence needs.',
      touch: 'Drag through the bouncing word. The dashed box below shows what the sentence needs.',
    },
    hint: 'word',
  },
  {
    id: 'done',
    group: 'Ready',
    title: 'You can fly',
    text: {
      mouse: '◎ Portals lead to new worlds. Portals holding a word lead to Dreaming Hours, where you write whole poems.',
      keys: '◎ Portals lead to new worlds. Portals holding a word lead to Dreaming Hours, where you write whole poems.',
      tilt: '◎ Portals lead to new worlds. Portals holding a word lead to Dreaming Hours, where you write whole poems.',
      touch: '◎ Portals lead to new worlds. Portals holding a word lead to Dreaming Hours, where you write whole poems.',
    },
    hint: 'none',
  },
];

export class Onboarding {
  /**
   * ctx: { scene, plane, input, rings, world, poem, wordTiles, audio, feedback, onFinish }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.guide = new Guide(ctx.scene, ctx.plane);
    this._path = [];
    this.el = document.getElementById('coach');
    this.el.querySelector('.coach-skip').addEventListener('click', () => this.finish(true));
    this.el.querySelector('.coach-go').addEventListener('click', () => this.finish(false));
  }

  static get seen() {
    try {
      return localStorage.getItem(STORE) === '1';
    } catch {
      return false;
    }
  }

  start() {
    const { rings, world } = this.ctx;
    this.active = true;
    this.i = -1;
    rings.suppress = true;
    world.respawnRings(); // clears the sky of ordinary chains
    this.el.classList.remove('hidden');
    this.guide.show();
    this._next();
  }

  /** True while the tutorial wants word clusters in the air. */
  get wordsActive() {
    return this.active && this.step?.id === 'words' && this.doneAt === undefined;
  }

  get step() {
    return STEPS[this.i];
  }

  _next() {
    this.i++;
    this.progress = 0;
    this.t = 0;
    this.acc = { left: 0, right: 0, up: 0, down: 0, boost: 0 };
    this.doneAt = undefined;
    this.idle = 0;
    this.lastProgress = 0;
    const s = this.step;
    if (!s) return this.finish(false);
    this.guide.setMode(GUIDE_MODE[s.id]);
    if (s.id === 'rings') this._layRings();
    if (s.id === 'words') this._beginSentence();
    this.el.querySelector('.coach-go').classList.toggle('hidden', s.id !== 'done');
    this.el.classList.toggle('final', s.id === 'done');
    this._render(true);
  }

  _layRings() {
    const { rings, plane } = this.ctx;
    this.ringHits = 0;
    this.tutorialRings = rings.spawnTutorial(plane, 3);
  }

  _beginSentence() {
    const { poem } = this.ctx;
    // Borrow the poem strip with a tiny sentence: a / the -> describe it -> a thing -> what it does.
    this.savedComposer = poem.c;
    const c = new Composer();
    c.chooseForm('free');
    c.noPhrases = true;
    c.lines = [[]];
    c.pattern = c._parse('det adj noun v');
    c.slot = 0;
    c.subject = null;
    poem.c = c;
    poem.render();
    document.getElementById('poem-strip').classList.remove('hidden');
    this.ctx.wordTiles.clear();
  }

  _endSentence() {
    const { poem } = this.ctx;
    if (this.savedComposer) {
      poem.c = this.savedComposer;
      this.savedComposer = null;
      poem.render();
    }
    this.ctx.wordTiles.clear();
  }

  /** Called by the game when a ring is flown through. */
  onRing(hit) {
    if (!this.active || this.step?.id !== 'rings') return;
    if (this.tutorialRings?.includes(hit.ring)) this.ringHits++;
  }

  /** Called when a word magnet is caught during the sentence step. */
  onWord(res) {
    if (!this.active || this.step?.id !== 'words') return;
    if (res.lineDone) {
      // Let the line be read back before moving on (in game time).
      this.progress = 1;
      this.doneAt = this.t + 2.8;
      this.firstLine = this.ctx.poem.lastLineText();
      this.ctx.wordTiles.clear();
    }
  }

  _advance() {
    this.ctx.audio.stamp();
    this.ctx.feedback.flash('#fff4c2', 0.25);
    this._next();
  }

  update(dt) {
    if (!this.active) return;
    const { plane, input } = this.ctx;
    const s = this.step;
    this.t += dt;
    const a = this.acc;
    if (s.id === 'steer') {
      // Turned both ways: ~25 degrees each.
      if (plane.roll > 0.25) a.right += dt;
      if (plane.roll < -0.25) a.left += dt;
      this.progress = (Math.min(1, a.left / 1.2) + Math.min(1, a.right / 1.2)) / 2;
    } else if (s.id === 'pitch') {
      if (plane.pitch > 0.18) a.up += dt;
      if (plane.pitch < -0.14) a.down += dt;
      this.progress = (Math.min(1, a.up / 0.9) + Math.min(1, a.down / 0.9)) / 2;
    } else if (s.id === 'gust') {
      if (input.boost) a.boost += dt;
      this.progress = Math.min(1, a.boost / 1.2);
    } else if (s.id === 'rings') {
      this.progress = this.ringHits / 3;
      // Missed them all? Lay them again ahead.
      const left = (this.tutorialRings ?? []).filter((r) => this.ctx.rings.active.has(r) && !r.dying);
      const behind = left.every((r) => r.mesh.position.clone().sub(plane.position).dot(plane.camForward) < -20);
      if (this.progress < 1 && (!left.length || behind)) {
        for (const r of left) this.ctx.rings._remove(r);
        this._layRings();
        this.ctx.feedback.popup(plane.position.clone().addScaledVector(plane.camForward, 30), 'Another go', '#ffffff');
      }
    } else if (s.id === 'words') {
      if (this.doneAt !== undefined) {
        if (this.t >= this.doneAt) {
          this._endSentence();
          this._advance();
        }
        this._tendGuide(dt);
        return;
      }
      const c = this.ctx.poem.c;
      const filled = c.current.filter((t) => !t.lit).length;
      this.progress = Math.max(this.progress, Math.min(1, filled / 4));
    }
    if (this.progress >= 1 && ['steer', 'pitch', 'gust', 'rings'].includes(s.id)) {
      this.progress = 1;
      this._render();
      this._advance();
      return;
    }
    this._tendGuide(dt);
    // Keep the wording in step with the device being used.
    if (input.device !== this.lastDevice) this._render(true);
    else this._renderProgress();
  }

  /** Drives the ghost plane, lanterns and golden path for this step. */
  _tendGuide(dt) {
    const { plane, input, rings, wordTiles, poem } = this.ctx;
    const s = this.step;
    const a = this.acc;
    if (this.progress > this.lastProgress + 1e-3) this.idle = 0;
    else this.idle += dt;
    this.lastProgress = this.progress;
    const info = { idle: this.idle, coached: false, fills: null, target: null, path: null };
    if (s.id === 'steer') {
      info.fills = [a.right / 1.2, a.left / 1.2];
      info.coached = Math.abs(plane.roll) > 0.25;
    } else if (s.id === 'pitch') {
      info.fills = [a.up / 0.9, a.down / 0.9];
      info.coached = plane.pitch > 0.18 || plane.pitch < -0.14;
    } else if (s.id === 'gust') {
      info.coached = !!input.boost;
    } else if (s.id === 'rings') {
      const left = (this.tutorialRings ?? []).filter((r) => rings.active.has(r) && !r.dying);
      if (left.length) {
        info.target = left[0].mesh.position;
        info.path = this._pathFrom(plane, left.map((r) => r.mesh.position));
      }
    } else if (s.id === 'words' && this.doneAt === undefined) {
      const tile = this._fittingTile(wordTiles.aheadCluster(plane), poem.c);
      if (tile) {
        info.target = tile.group.position;
        info.path = this._pathFrom(plane, [tile.group.position]);
      }
    }
    this.guide.setMode(info.target || s.id !== 'words' ? GUIDE_MODE[s.id] : 'idle');
    this._lastInfo = info;
    this.guide.update(dt, info);
  }

  _pathFrom(plane, points) {
    const start = (this._start ??= new THREE.Vector3()).copy(plane.position).addScaledVector(plane.camForward, 7);
    this._path.length = 0;
    this._path.push(start, ...points);
    return this._path;
  }

  /** The tile in a cluster that fits the sentence next; it bounces to be picked. */
  _fittingTile(cluster, c) {
    if (!cluster) return null;
    const live = cluster.tiles.filter((t) => t.state === 'live');
    const pick = live.find((t) => t.word.pos === c.nextSlot) ?? (c.atEndPoint ? live.find((t) => t.word.pos === 'break') : null) ?? live[0];
    for (const t of cluster.tiles) t.nudge = t === pick;
    return pick;
  }

  _render(full = false) {
    const s = this.step;
    if (!s) return;
    const device = this.ctx.input.device;
    this.lastDevice = device;
    const el = this.el;
    if (full) {
      el.querySelector('.coach-step').textContent = `${s.group} · ${this.i + 1} of ${STEPS.length}`;
      el.querySelector('.coach-title').textContent = s.title;
      el.querySelector('.coach-text').textContent = s.text[device] ?? s.text.mouse;
      const hint = el.querySelector('.coach-hint');
      hint.className = `coach-hint hint-${s.hint} dev-${device}`;
      el.querySelector('.coach-dots').innerHTML = STEPS.map((_, k) => `<i class="${k < this.i ? 'done' : k === this.i ? 'on' : ''}"></i>`).join('');
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    this._renderProgress();
  }

  _renderProgress() {
    this.el.querySelector('.coach-bar i').style.transform = `scaleX(${this.progress})`;
  }

  finish(skipped) {
    if (!this.active) return;
    this.active = false;
    this._endSentence();
    const { rings, world } = this.ctx;
    for (const r of this.tutorialRings ?? []) rings._remove(r);
    rings.suppress = false;
    world.respawnRings();
    this.el.classList.add('hidden');
    this.guide.hide();
    try {
      localStorage.setItem(STORE, '1');
    } catch {
      /* storage unavailable */
    }
    this.ctx.onFinish?.(skipped);
  }
}
