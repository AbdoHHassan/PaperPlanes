import * as THREE from 'three';
import { heightAt, getSeed, WATER_LEVEL } from './terrain.js';
import { mulberry32, hash2 } from './noise.js';
import { SOFT_SPRITE } from './effects.js';
import { CHUNK } from './scatter.js';

const RADIUS = 6;

/**
 * Glowing wind rings, laid out in gentle chains that suggest a route through
 * the landscape. Flying through one gives a gust of speed and a chime.
 */
export class Rings {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.TorusGeometry(RADIUS, 0.45, 5, 20);
    this.mat = new THREE.MeshStandardMaterial({
      color: '#ffe3a0',
      emissive: '#ffb84a',
      emissiveIntensity: 1.1,
      flatShading: true,
      roughness: 0.6,
    });
    this.glowMat = new THREE.SpriteMaterial({
      map: SOFT_SPRITE,
      color: '#ffd28a',
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.active = new Set();
    this.collected = new Set();
    this._tmp = new THREE.Vector3();
  }

  spawnForChunk(cx, cz) {
    const r = mulberry32(hash2(cx, cz, 3 + getSeed() * 31));
    const list = [];
    if (Math.hypot(cx, cz) < 1.5 && !(cx === 0 && cz === 0)) return list;
    const chains = r() < 0.45 ? 1 : 0;
    const guide = cx === 0 && cz === 0; // a first chain right in front of the start
    for (let c = 0; c < chains + (guide ? 1 : 0); c++) {
      let x = cx * CHUNK + r() * CHUNK;
      let z = cz * CHUNK + r() * CHUNK;
      let yaw = r() * Math.PI * 2;
      if (guide) {
        x = 0;
        z = -60;
        yaw = 0;
      }
      const n = 4 + Math.floor(r() * 4);
      const turn = (r() - 0.5) * 0.5;
      let y = null;
      for (let i = 0; i < n; i++) {
        const id = `${cx},${cz},${c},${i}`;
        const ground = Math.max(heightAt(x, z), WATER_LEVEL);
        const target = ground + 14 + r() * 14;
        y = y === null ? target : Math.max(target, y + (target - y) * 0.6);
        if (!this.collected.has(id)) list.push(this._make(id, x, y, z, yaw));
        x += Math.sin(yaw) * 45;
        z += Math.cos(yaw) * 45;
        yaw += turn;
      }
    }
    return list;
  }

  _make(id, x, y, z, yaw) {
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(RADIUS * 2.6);
    mesh.add(glow);
    this.scene.add(mesh);
    const ring = { id, mesh, normal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), t: Math.random() * 10, dying: 0 };
    this.active.add(ring);
    return ring;
  }

  clear() {
    for (const ring of [...this.active]) this._remove(ring);
    this.collected.clear();
  }

  removeChunk(list) {
    for (const ring of list) this._remove(ring);
  }

  _remove(ring) {
    if (!this.active.has(ring)) return;
    this.scene.remove(ring.mesh);
    this.active.delete(ring);
  }

  /** Returns number of rings collected this frame. */
  update(dt, plane) {
    let got = 0;
    for (const ring of this.active) {
      ring.t += dt;
      const m = ring.mesh;
      if (ring.dying > 0) {
        ring.dying += dt;
        const k = ring.dying / 0.6;
        m.scale.setScalar(1 + k * 0.8);
        m.rotation.z += dt * 6;
        if (k >= 1) this._remove(ring);
        continue;
      }
      m.rotation.z = Math.sin(ring.t * 0.8) * 0.3;
      const s = 1 + Math.sin(ring.t * 2.2) * 0.04;
      m.scale.setScalar(s);

      const rel = this._tmp.subVectors(plane.position, m.position);
      if (rel.lengthSq() > 400) continue;
      const along = rel.dot(ring.normal);
      const radial = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
      if (Math.abs(along) < 2.5 && radial < RADIUS + 0.5) {
        ring.dying = 0.0001;
        this.collected.add(ring.id);
        got++;
      }
    }
    return got;
  }

  /** The nearest uncollected ring roughly ahead, for the HUD compass. */
  nearest(plane) {
    let best = null;
    let bestD = Infinity;
    for (const ring of this.active) {
      if (ring.dying) continue;
      const d = ring.mesh.position.distanceToSquared(plane.position);
      if (d < bestD) {
        bestD = d;
        best = ring;
      }
    }
    return best;
  }
}
