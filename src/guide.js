/**
 * Flight School's in-world teacher: a glowing ghost paper plane that flies
 * just ahead of you and shows each move (bank, climb, gust, thread a ring,
 * catch a word), with chevron lanterns that light up as you copy it and a
 * trail of breadcrumbs towards whatever you should fly through next.
 */

import * as THREE from 'three';
import { SOFT_SPRITE } from './effects.js';

const GHOST = new THREE.Color('#8fd8ff');
const LIT = new THREE.Color('#ffd27a');
const TRAIL = 28;
const CRUMBS = 44;
const TAU = Math.PI * 2;
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

function chevronTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 16;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const x of [34, 70]) {
    g.beginPath();
    g.moveTo(x, 30);
    g.lineTo(x + 28, 64);
    g.lineTo(x, 98);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dots(n, size) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.PointsMaterial({
    size, map: SOFT_SPRITE, vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}

export class Guide {
  constructor(scene, plane) {
    this.plane = plane;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);

    // The ghost: the player's own plane, made of light.
    // Drawn over trees and hills: a teacher you never lose sight of.
    this.ghostMat = new THREE.MeshBasicMaterial({ color: GHOST, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
    this.ghost = new THREE.Mesh(plane.mesh.geometry, this.ghostMat);
    this.ghost.scale.setScalar(2.7);
    this.ghost.renderOrder = 20;
    // A crisp outline so it reads against pale sky as well as forest.
    this.edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(plane.mesh.geometry),
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }),
    );
    this.edges.renderOrder = 22;
    this.ghost.add(this.edges);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: SOFT_SPRITE, color: GHOST, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    }));
    this.halo.scale.setScalar(3);
    this.halo.renderOrder = 19;
    this.ghost.add(this.halo);
    this.root.add(this.ghost);

    this.trail = dots(TRAIL, 1.1);
    this.crumbs = dots(CRUMBS, 2.2);
    this.root.add(this.trail, this.crumbs);
    this.history = [];
    this.lastSample = 0;

    // Two lanterns: left/right for steering, up/down for pitch.
    const chev = chevronTexture();
    this.lanterns = [0, 1].map(() => {
      const g = new THREE.Group();
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: SOFT_SPRITE, color: GHOST, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      }));
      glow.scale.setScalar(12);
      const arrow = new THREE.Sprite(new THREE.SpriteMaterial({ map: chev, color: GHOST, transparent: true, depthWrite: false, depthTest: false }));
      glow.renderOrder = 18;
      arrow.renderOrder = 21;
      arrow.scale.setScalar(6);
      g.add(glow, arrow);
      g.userData = { glow, arrow, fill: 0, flash: 0 };
      this.root.add(g);
      return g;
    });

    this.dir = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.t = 0;
    this.mode = null;
    this._p = new THREE.Vector3();
    this._q = new THREE.Vector3();
    this._prev = new THREE.Vector3();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._c = new THREE.Color();
  }

  show() {
    this.root.visible = true;
    this.history.length = 0;
    this.dir.set(this.plane.camForward.x, 0, this.plane.camForward.z).normalize();
  }

  hide() {
    this.root.visible = false;
  }

  /** Switches the lesson. Modes: x, y, press, target, idle, celebrate. */
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.t = 0;
    for (const l of this.lanterns) l.userData.fill = l.userData.flash = 0;
  }

  /**
   * info: { fills: [0..1, 0..1], target: Vector3?, path: [Vector3], coached: bool, idle: seconds }
   */
  update(dt, info = {}) {
    if (!this.root.visible) return;
    const pl = this.plane;
    this.t += dt;
    const t = this.t;
    // Heading frame, eased so the ghost swings round gently when you turn.
    this._q.set(pl.camForward.x, 0, pl.camForward.z).normalize();
    this.dir.lerp(this._q, 1 - Math.exp(-dt * 2.5)).normalize();
    this.right.set(-this.dir.z, 0, this.dir.x);
    const yaw = Math.atan2(this.dir.x, this.dir.z);
    // Close enough to read its every move, a little above your line of sight.
    const base = this._p.copy(pl.position).addScaledVector(this.dir, 12);
    base.y += 2.2;

    let pitch = 0;
    let roll = 0;
    let heading = yaw;
    let opacity = 0.75;
    const w = TAU / 3.2;
    this._prev.copy(this.ghost.position);

    if (this.mode === 'x') {
      base.addScaledVector(this.right, 5.5 * Math.sin(w * t));
      roll = 0.7 * Math.cos(w * t);
      heading = yaw - 0.25 * Math.cos(w * t);
    } else if (this.mode === 'y') {
      base.y += 3.5 * Math.sin(w * t);
      pitch = 0.5 * Math.cos(w * t);
    } else if (this.mode === 'press') {
      // A surge forward, then easing back into formation.
      const s = (t % 3) / 3;
      const surge = s < 0.3 ? ease(s / 0.3) : 1 - ease((s - 0.3) / 0.7);
      base.addScaledVector(this.dir, 16 * surge);
      pitch = -0.08 * surge;
    } else if (this.mode === 'target' && info.target) {
      // Fly from beside you, through the target, and fade; then again.
      const s = (t % 2.8) / 2.8;
      const start = this._q.copy(pl.position).addScaledVector(this.dir, 8);
      start.y += 3;
      const k = ease(Math.min(1, s / 0.72));
      base.copy(start).lerp(info.target, k);
      if (s > 0.72) base.addScaledVector(this._q.subVectors(info.target, start).normalize(), (s - 0.72) * 60);
      opacity *= Math.min(1, s / 0.1) * (s > 0.8 ? Math.max(0, 1 - (s - 0.8) / 0.2) : 1);
    } else if (this.mode === 'celebrate') {
      // A climbing flourish, then off it goes.
      const s = Math.min(1, t / 3);
      base.addScaledVector(this.dir, 50 * s);
      base.y += 22 * s * s;
      pitch = 0.6 * s;
      roll = Math.sin(t * 5) * 0.4 * (1 - s);
      opacity *= 1 - s;
    } else {
      base.y += Math.sin(t * 1.3) * 1.2;
      roll = Math.sin(t * 0.9) * 0.15;
    }
    // While you're doing it right the ghost steps back; idle, and it calls you.
    if (info.coached) opacity *= 0.45;
    const call = info.idle > 4 ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
    this.ghost.position.copy(base);

    if (this.mode === 'target' && info.target) {
      const v = this._q.subVectors(this.ghost.position, this._prev);
      if (v.lengthSq() > 1e-4) {
        heading = Math.atan2(v.x, v.z);
        pitch = Math.asin(THREE.MathUtils.clamp(v.y / v.length(), -1, 1));
      }
    }
    this._e.set(-pitch, heading, roll + Math.sin(t * 13) * 0.02);
    this.ghost.quaternion.setFromEuler(this._e);
    this.ghostMat.opacity = opacity;
    this.edges.material.opacity = Math.min(1, opacity * 1.3);
    this.halo.material.opacity = opacity * (0.35 + call * 0.8);
    this.halo.scale.setScalar(3 + call * 3);
    this.ghost.visible = opacity > 0.01;

    this._updateTrail(opacity);
    this._updateLanterns(dt, info.fills);
    this._updateCrumbs(info.path);
  }

  _updateTrail(opacity) {
    if (this.t - this.lastSample > 0.035) {
      this.lastSample = this.t;
      this.history.unshift(this.ghost.position.clone());
      if (this.history.length > TRAIL) this.history.pop();
    }
    const pos = this.trail.geometry.attributes.position;
    const col = this.trail.geometry.attributes.color;
    for (let i = 0; i < TRAIL; i++) {
      const p = this.history[i] ?? this.ghost.position;
      pos.setXYZ(i, p.x, p.y, p.z);
      const k = this.history[i] ? (1 - i / TRAIL) * opacity * 1.2 : 0;
      col.setXYZ(i, GHOST.r * k, GHOST.g * k, GHOST.b * k);
    }
    pos.needsUpdate = col.needsUpdate = true;
  }

  _updateLanterns(dt, fills) {
    const on = (this.mode === 'x' || this.mode === 'y') && fills;
    const pl = this.plane;
    const w = TAU / 3.2;
    // Which side the ghost is heading for right now.
    const active = Math.cos(w * this.t) > 0 ? 0 : 1;
    this.lanterns.forEach((l, i) => {
      l.visible = !!on;
      if (!on) return;
      const u = l.userData;
      const f = Math.min(1, fills[i] ?? 0);
      if (f >= 1 && u.fill < 1) u.flash = 1;
      u.fill = f;
      u.flash = Math.max(0, u.flash - dt * 1.5);
      const sgn = i === 0 ? 1 : -1; // 0: right / up, 1: left / down
      l.position.copy(pl.position).addScaledVector(this.dir, 45);
      if (this.mode === 'x') {
        l.position.addScaledVector(this.right, 15 * sgn);
        l.position.y += 2;
        u.arrow.material.rotation = i === 0 ? 0 : Math.PI;
      } else {
        l.position.y += 9 * sgn + 2;
        u.arrow.material.rotation = i === 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      this._c.copy(GHOST).lerp(LIT, f);
      u.arrow.material.color.copy(this._c);
      u.glow.material.color.copy(this._c);
      const beckon = f < 1 && i === active ? 0.5 + 0.5 * Math.sin(this.t * 7) : 0;
      u.glow.material.opacity = 0.35 + 0.4 * f + beckon * 0.3;
      u.glow.scale.setScalar(10 + f * 4 + u.flash * 10 + beckon * 3);
      u.arrow.scale.setScalar(5 + f * 1.5 + beckon);
    });
  }

  /** A marching line of light along `path` (a list of points). */
  _updateCrumbs(path) {
    const pos = this.crumbs.geometry.attributes.position;
    const col = this.crumbs.geometry.attributes.color;
    this.crumbs.visible = !!path && path.length > 1;
    if (!this.crumbs.visible) return;
    const lens = [];
    let L = 0;
    for (let i = 1; i < path.length; i++) {
      const d = path[i].distanceTo(path[i - 1]);
      lens.push(d);
      L += d;
    }
    for (let i = 0; i < CRUMBS; i++) {
      let u = (((i + this.t * 3) % CRUMBS) / CRUMBS) * L;
      let seg = 0;
      while (seg < lens.length - 1 && u > lens[seg]) u -= lens[seg++];
      const a = path[seg];
      const b = path[seg + 1];
      const p = this._q.copy(a).lerp(b, lens[seg] ? Math.min(1, u / lens[seg]) : 0);
      pos.setXYZ(i, p.x, p.y, p.z);
      const k = 0.35 + 0.65 * Math.max(0, Math.sin(((i + this.t * 3) / CRUMBS) * TAU * 4));
      col.setXYZ(i, LIT.r * k, LIT.g * k, LIT.b * k);
    }
    pos.needsUpdate = col.needsUpdate = true;
  }
}
