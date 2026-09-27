import * as THREE from 'three';
import { SOFT_SPRITE } from './effects.js';

/** Coloured spark bursts that fan out in the plane of a ring. */
export class Bursts {
  constructor(scene, count = 480) {
    this.count = count;
    this.next = 0;
    this.p = new Float32Array(count * 3).fill(-9999);
    this.v = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.col = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.55, map: SOFT_SPRITE, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  /** `colors` is a list of CSS colours; sparks pick from it at random. */
  emit(center, normal, colors, n = 70, radius = 6, speed = 14) {
    // Two axes spanning the ring's plane.
    const ax = new THREE.Vector3(-normal.z, 0, normal.x).normalize();
    const ay = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      const a = Math.random() * Math.PI * 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      const ox = ax.x * dx + ay.x * dy, oy = ax.y * dx + ay.y * dy, oz = ax.z * dx + ay.z * dy;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.p[i * 3] = center.x + ox * radius;
      this.p[i * 3 + 1] = center.y + oy * radius;
      this.p[i * 3 + 2] = center.z + oz * radius;
      this.v[i * 3] = ox * s + normal.x * (Math.random() - 0.5) * 6;
      this.v[i * 3 + 1] = oy * s + 2;
      this.v[i * 3 + 2] = oz * s + normal.z * (Math.random() - 0.5) * 6;
      this.life[i] = 0.7 + Math.random() * 0.6;
      this._c.set(colors[k % colors.length]);
      this.base[i * 3] = this._c.r;
      this.base[i * 3 + 1] = this._c.g;
      this.base[i * 3 + 2] = this._c.b;
    }
  }

  update(dt) {
    const drag = Math.exp(-dt * 2.5);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.p[o + 1] = -9999;
        continue;
      }
      this.v[o] *= drag;
      this.v[o + 1] = this.v[o + 1] * drag - 3 * dt;
      this.v[o + 2] *= drag;
      this.p[o] += this.v[o] * dt;
      this.p[o + 1] += this.v[o + 1] * dt;
      this.p[o + 2] += this.v[o + 2] * dt;
      // Fade by dimming the colour (additive blending).
      const f = Math.min(1, this.life[i] * 1.6);
      this.col[o] = this.base[o] * f;
      this.col[o + 1] = this.base[o + 1] * f;
      this.col[o + 2] = this.base[o + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/** DOM feedback: floating labels, a coloured edge flash, and haptics. */
export class Feedback {
  constructor(camera) {
    this.camera = camera;
    this.layer = document.getElementById('popups');
    this.flashEl = document.getElementById('flash');
    this._v = new THREE.Vector3();
  }

  popup(worldPos, text, color, big = false) {
    const v = this._v.copy(worldPos).project(this.camera);
    let x = (v.x * 0.5 + 0.5) * window.innerWidth;
    let y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    if (v.z > 1 || x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) {
      x = window.innerWidth / 2;
      y = window.innerHeight * 0.38;
    }
    const el = document.createElement('div');
    el.className = `popup${big ? ' big' : ''}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--c', color);
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  flash(color, strength = 0.45) {
    const el = this.flashEl;
    el.style.setProperty('--c', color);
    el.style.transition = 'none';
    el.style.opacity = strength;
    void el.offsetWidth;
    el.style.transition = 'opacity 0.7s ease-out';
    el.style.opacity = 0;
  }

  /** Full-screen fade used for portal travel. */
  whiteout(on) {
    const el = this.flashEl;
    el.style.setProperty('--c', '#ffffff');
    el.style.transition = on ? 'opacity 0.45s ease-in' : 'opacity 0.9s ease-out';
    el.classList.toggle('solid', on);
    el.style.opacity = on ? 1 : 0;
  }

  haptic(pattern) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* not supported */
    }
  }
}
