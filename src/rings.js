import * as THREE from 'three';
import { heightAt, getSeed, WATER_LEVEL } from './terrain.js';
import { mulberry32, hash2 } from './noise.js';
import { SOFT_SPRITE } from './effects.js';
import { CHUNK } from './scatter.js';

const RADIUS = 6;

/**
 * Ring types. Every ring gives a short burst of speed; the special ones add
 * something on top. Shifter rings cycle through the others and you get
 * whichever one is showing as you fly through.
 */
export const RING_TYPES = {
  gold: { label: '+1', color: '#ffd27a', glow: '#ffb84a', points: 1, boost: 1.2, strength: 8 },
  swift: { label: 'Swift!', icon: '⚡', color: '#6fd8ff', glow: '#3ab8ff', points: 1, boost: 3.2, strength: 20 },
  prism: { label: 'Prism ×5', icon: '★', color: '#ffffff', glow: '#ff9bf0', points: 5, boost: 1.8, strength: 11, rainbow: true },
  flip: { label: 'Flip!', icon: '↻', color: '#ff8fc0', glow: '#ff5fa0', points: 2, boost: 1.5, strength: 10 },
  portal: { label: 'Portal', icon: '◎', color: '#c8a2ff', glow: '#9a6bff', points: 3, boost: 0, strength: 0, portal: true },
  shifter: { label: '', icon: '?', color: '#ffffff', glow: '#ffffff', points: 0, boost: 0, strength: 0, shifter: true },
};
const SHIFT_CYCLE = ['gold', 'swift', 'prism', 'flip'];

function iconTexture(glyph, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 84px Nunito, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 18;
  g.fillStyle = '#ffffff';
  g.fillText(glyph, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rainbowTorus() {
  const geo = new THREE.TorusGeometry(RADIUS, 0.5, 5, 30).toNonIndexed();
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i));
    c.setHSL((a / (Math.PI * 2) + 1) % 1, 0.85, 0.65);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export class Rings {
  constructor(scene) {
    this.scene = scene;
    this.geo = new THREE.TorusGeometry(RADIUS, 0.45, 5, 22);
    this.portalGeo = new THREE.TorusGeometry(RADIUS * 1.35, 0.7, 6, 32);
    this.rainbowGeo = rainbowTorus();
    this.mats = {};
    this.glowMats = {};
    this.iconMats = {};
    for (const [k, t] of Object.entries(RING_TYPES)) {
      // Unlit so rings glow the same in every world, including at night.
      this.mats[k] = new THREE.MeshBasicMaterial({ color: t.color, vertexColors: !!t.rainbow });
      this.glowMats[k] = new THREE.SpriteMaterial({
        map: SOFT_SPRITE, color: t.glow, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      if (t.icon) {
        this.iconMats[k] = new THREE.SpriteMaterial({
          map: iconTexture(t.icon, t.glow), transparent: true, opacity: 0.85, depthWrite: false,
        });
      }
    }
    // Swirling disc inside portals.
    this.portalDiscMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
          float swirl = sin(a * 5.0 + r * 10.0 - uTime * 3.0) * 0.5 + 0.5;
          vec3 col = mix(vec3(0.45, 0.3, 1.0), vec3(0.4, 1.0, 0.95), swirl);
          float alpha = smoothstep(1.0, 0.6, r) * (0.35 + 0.35 * swirl);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    this.beamMat = new THREE.MeshBasicMaterial({
      color: '#b58cff', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.beamGeo = new THREE.CylinderGeometry(3, 5, 300, 12, 1, true);
    this.beamGeo.translate(0, 150, 0);
    this.active = new Set();
    this.collected = new Set();
    this._tmp = new THREE.Vector3();
    this.time = 0;
  }

  _pickType(r) {
    const x = r();
    if (x < 0.66) return 'gold';
    if (x < 0.78) return 'swift';
    if (x < 0.85) return 'prism';
    if (x < 0.93) return 'flip';
    return 'shifter';
  }

  spawnForChunk(cx, cz) {
    const r = mulberry32(hash2(cx, cz, 3 + getSeed() * 31));
    const list = [];
    const guide = cx === 0 && cz === 0; // a first chain right in front of the start
    const nearSpawn = Math.hypot(cx, cz) < 1.5;
    if (nearSpawn && !guide) return list;
    const chains = (r() < 0.35 ? 1 : 0) + (guide ? 1 : 0);
    for (let c = 0; c < chains; c++) {
      let x = cx * CHUNK + r() * CHUNK;
      let z = cz * CHUNK + r() * CHUNK;
      let yaw = r() * Math.PI * 2;
      if (guide && c === chains - 1) {
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
        // The starter chain teaches the types: gold, swift, flip, prism…
        const type = guide ? ['gold', 'gold', 'swift', 'gold', 'flip', 'gold', 'prism'][i] ?? 'gold' : this._pickType(r);
        if (!this.collected.has(id)) list.push(this._make(id, type, x, y, z, yaw));
        x += Math.sin(yaw) * 45;
        z += Math.cos(yaw) * 45;
        yaw += turn;
      }
    }
    // Rare portals, standing tall with a light beam so they can be found from afar.
    if (!nearSpawn && r() < 0.05) {
      const x = cx * CHUNK + 30 + r() * 100;
      const z = cz * CHUNK + 30 + r() * 100;
      const id = `${cx},${cz},portal`;
      const y = Math.max(heightAt(x, z), WATER_LEVEL) + 26;
      if (!this.collected.has(id)) list.push(this._make(id, 'portal', x, y, z, r() * Math.PI * 2));
    }
    return list;
  }

  _make(id, type, x, y, z, yaw) {
    const t = RING_TYPES[type];
    const geo = t.portal ? this.portalGeo : t.rainbow ? this.rainbowGeo : this.geo;
    const mat = t.shifter ? this.mats.gold.clone() : this.mats[type];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    const glowMat = t.shifter ? this.glowMats.gold.clone() : this.glowMats[type];
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(RADIUS * (t.portal ? 4 : 2.6));
    mesh.add(glow);
    let icon = null;
    if (t.icon && !t.portal) {
      icon = new THREE.Sprite(this.iconMats[type]);
      icon.scale.setScalar(3.2);
      mesh.add(icon);
    }
    if (t.portal) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(RADIUS * 1.3, 32), this.portalDiscMat);
      mesh.add(disc);
      const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
      beam.position.y = -y + Math.max(heightAt(x, z), WATER_LEVEL);
      beam.rotation.x = 0;
      mesh.add(beam);
      mesh.userData.beam = beam;
    }
    this.scene.add(mesh);
    const ring = {
      id, type, mesh, glow, icon, glowMat,
      normal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      t: Math.random() * 10,
      dying: 0,
      radius: RADIUS * (t.portal ? 1.35 : 1),
      shift: Math.floor(Math.random() * SHIFT_CYCLE.length),
    };
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
    if (RING_TYPES[ring.type].shifter) {
      ring.mesh.material.dispose();
      ring.glowMat.dispose();
    }
    this.active.delete(ring);
  }

  /** The type a ring grants right now (shifters change every second). */
  effectiveType(ring) {
    return RING_TYPES[ring.type].shifter ? SHIFT_CYCLE[ring.shift] : ring.type;
  }

  /** Returns the rings flown through this frame. */
  update(dt, plane) {
    this.time += dt;
    this.portalDiscMat.uniforms.uTime.value = this.time;
    const hits = [];
    for (const ring of this.active) {
      ring.t += dt;
      const m = ring.mesh;
      if (ring.dying > 0) {
        ring.dying += dt;
        const k = ring.dying / 0.5;
        m.scale.setScalar(1 + k * 1.2);
        m.rotation.z += dt * 8;
        ring.glow.material.opacity = 0.2 * (1 - k);
        if (m.userData.beam) m.userData.beam.visible = false;
        if (k >= 1) this._remove(ring);
        continue;
      }
      const t = RING_TYPES[ring.type];
      if (t.shifter) {
        const idx = Math.floor(ring.t * 0.9) % SHIFT_CYCLE.length;
        if (idx !== ring.shift) {
          ring.shift = idx;
          const next = RING_TYPES[SHIFT_CYCLE[idx]];
          m.material.color.set(next.rainbow ? '#ffe0ff' : next.color);
          ring.glowMat.color.set(next.glow);
        }
      }
      if (!t.portal) {
        m.rotation.z = Math.sin(ring.t * 0.8) * 0.3;
        m.scale.setScalar(1 + Math.sin(ring.t * 2.2) * 0.04);
      }

      const rel = this._tmp.subVectors(plane.position, m.position);
      if (rel.lengthSq() > 900) continue;
      const along = rel.dot(ring.normal);
      const radial = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
      if (Math.abs(along) < 2.5 && radial < ring.radius + 0.5) {
        ring.dying = 0.0001;
        this.collected.add(ring.id);
        hits.push({ ring, type: this.effectiveType(ring), position: m.position.clone() });
      }
    }
    return hits;
  }

  /** The nearest uncollected ring (portals count from further away). */
  nearest(plane) {
    let best = null;
    let bestD = Infinity;
    for (const ring of this.active) {
      if (ring.dying) continue;
      let d = ring.mesh.position.distanceToSquared(plane.position);
      if (ring.type === 'portal') d *= 0.25;
      if (d < bestD) {
        bestD = d;
        best = ring;
      }
    }
    return best;
  }
}
