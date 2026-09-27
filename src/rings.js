import * as THREE from 'three';
import { heightAt, forestAt, getSeed, WATER_LEVEL } from './terrain.js';
import { CRUISE, MAX_TURN_RATE, applyGust, stepSpeed } from './plane.js';
import { WORDS } from './words.js';
import { makeTile } from './wordtiles.js';

// Words that open the way into the poem world.
const GATE_WORDS = WORDS.filter((w) => w.pos === 'noun' || w.pos === 'adj');
import { mulberry32, hash2 } from './noise.js';
import { SOFT_SPRITE } from './effects.js';
import { CHUNK } from './scatter.js';

const RADIUS = 6;
const rel0 = (self, m, plane) => self._tmp.subVectors(m.position, plane.position).length();
const _Z = new THREE.Vector3(0, 0, 1);
const _spin = new THREE.Quaternion();

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

// ---------------------------------------------------------------------------
// Chain planning. Rings are laid out along a path the plane can comfortably
// fly: spacing comes from the speed it will actually have (including the gust
// from the previous ring and any climb), turns and slopes stay well inside
// what the flight model can do, and heights clear the ground and treetops.

const RING_INTERVAL = 2.0; // seconds between rings at the predicted speed
const TURN_RATE = MAX_TURN_RATE * 0.42; // comfortable turn rate: under half of full bank
const MAX_CLIMB = Math.tan((9 * Math.PI) / 180); // climbing costs speed, so keep it gentle
const MAX_DESCENT = Math.tan((12 * Math.PI) / 180);
const LOOP_TIME = 2.1; // a Flip ring's loop-the-loop, during which you barely move forward
const TREE_TOP = 22; // tallest trees, used to lift rings over forests

/** Highest obstacle (ground or canopy) near the path between two points. */
function obstacleBetween(ax, az, bx, bz) {
  let top = -Infinity;
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz) || 1;
  const sx = -dz / len, sz = dx / len; // sideways
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    for (const side of [-8, 0, 8]) {
      const x = ax + dx * t + sx * side;
      const z = az + dz * t + sz * side;
      const g = heightAt(x, z);
      const canopy = g >= WATER_LEVEL + 2 ? forestAt(x, z) * TREE_TOP : 0;
      top = Math.max(top, Math.max(g, WATER_LEVEL) + canopy);
    }
  }
  return top;
}

/** Simulates level-ish flight for `time` seconds; returns distance travelled. */
function travel(sim, time, slope) {
  const pitch = Math.atan(slope);
  let dist = 0;
  const dt = 1 / 30;
  for (let t = 0; t < time; t += dt) {
    stepSpeed(sim, dt, pitch);
    dist += sim.speed * Math.cos(pitch) * dt;
  }
  return dist;
}

/**
 * Plans a chain of rings starting at (x0, z0) heading `yaw0`.
 * Returns [{ x, y, z, normal: [x, y, z] }] matching `types`.
 */
export function planChain(r, x0, z0, yaw0, types, startAlt = null) {
  const n = types.length;
  // Turn rate varies smoothly along the chain (a gentle S-curve or arc), so
  // the bank you need changes gradually rather than ring by ring.
  const turnAmp = TURN_RATE * (0.3 + r() * 0.7) * (r() < 0.5 ? -1 : 1);
  const turnFreq = 0.35 + r() * 0.5;
  const phase = r() * Math.PI * 2;
  const lift = r() * 6;

  let slopes = new Array(n).fill(0);
  let pts;
  for (let pass = 0; pass < 2; pass++) {
    // Horizontal layout, spaced by predicted speed.
    const sim = { speed: CRUISE, gust: 0, gustTotal: 1, gustStrength: 0 };
    pts = [];
    let x = x0, z = z0, yaw = yaw0;
    for (let i = 0; i < n; i++) {
      pts.push({ x, z, y: 0, v: sim.speed });
      if (i === n - 1) break;
      // Shifters could grant any gust; plan for a middling one.
      const def = types[i] === 'shifter' ? { boost: 2, strength: 12 } : RING_TYPES[types[i]];
      if (def.boost > 0) applyGust(sim, def.boost, def.strength);
      const afterFlip = types[i] === 'flip';
      if (afterFlip) travel(sim, LOOP_TIME, 0); // time spent looping, not going forward
      // Faster means less time to react to the same lateral offset, so the
      // allowed turn shrinks with speed (roughly constant sideways demand).
      const speedFactor = Math.min(1, CRUISE / sim.speed);
      const omega = afterFlip ? 0 : turnAmp * speedFactor * Math.sin(phase + i * turnFreq);
      const dist = travel(sim, RING_INTERVAL, slopes[i]);
      const mid = yaw + omega * RING_INTERVAL * 0.5;
      x += Math.sin(mid) * dist;
      z += Math.cos(mid) * dist;
      yaw += omega * RING_INTERVAL;
    }

    // Heights: clear obstacles, then limit slopes in both directions so the
    // chain starts climbing early enough and never needs a dive-bomb.
    const alt = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      const top = Math.max(
        obstacleBetween((a.x + p.x) / 2, (a.z + p.z) / 2, p.x, p.z),
        obstacleBetween(p.x, p.z, (b.x + p.x) / 2, (b.z + p.z) / 2),
      );
      return top + RADIUS + 5 + lift;
    });
    if (startAlt !== null) alt[0] = Math.max(alt[0], startAlt);
    // Fill in dips: a chain that climbs, drops and climbs again is tiring to
    // follow. Smoothing only ever raises rings, so clearance still holds.
    for (let k = 0; k < 3; k++) {
      const prev = alt.slice();
      for (let i = 1; i < n - 1; i++) alt[i] = Math.max(prev[i], Math.min(prev[i - 1], prev[i + 1]), (prev[i - 1] + 2 * prev[i] + prev[i + 1]) / 4);
    }
    const d = (i, j) => Math.hypot(pts[j].x - pts[i].x, pts[j].z - pts[i].z);
    for (let i = n - 2; i >= 0; i--) alt[i] = Math.max(alt[i], alt[i + 1] - MAX_CLIMB * d(i, i + 1));
    for (let i = 1; i < n; i++) alt[i] = Math.max(alt[i], alt[i - 1] - MAX_DESCENT * d(i - 1, i));
    // The segment after a Flip stays level so you come out of the loop lined up.
    for (let i = 0; i < n - 1; i++) {
      if (types[i] === 'flip') alt[i + 1] = Math.max(alt[i + 1], alt[i]);
    }
    for (let i = 1; i < n; i++) alt[i] = Math.max(alt[i], alt[i - 1] - MAX_DESCENT * d(i - 1, i));
    pts.forEach((p, i) => (p.y = alt[i]));
    slopes = pts.map((p, i) => (i < n - 1 ? (alt[i + 1] - alt[i]) / Math.max(1, d(i, i + 1)) : 0));
  }

  // Face each ring along the path through it.
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let nx = b.x - a.x, ny = b.y - a.y, nz = b.z - a.z;
    if (a === b) [nx, ny, nz] = [Math.sin(yaw0), 0, Math.cos(yaw0)];
    const l = Math.hypot(nx, ny, nz) || 1;
    pts[i].normal = [nx / l, ny / l, nz / l];
  }
  return pts;
}

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
    this.chainChance = 0.35;
    this.chainTotals = new Map(); // chain id -> ring count
    this.chainHits = new Map(); // lower in the poem world, where words take over
    this.wordGates = true; // some portals carry a word into the poem world
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
    const chains = (r() < this.chainChance ? 1 : 0) + (guide ? 1 : 0);
    for (let c = 0; c < chains; c++) {
      let x = cx * CHUNK + r() * CHUNK;
      let z = cz * CHUNK + r() * CHUNK;
      let yaw = r() * Math.PI * 2;
      let startAlt = null;
      let types;
      if (guide && c === chains - 1) {
        // Straight ahead of the spawn point, at the plane's height. It also
        // introduces the ring types in turn.
        x = 0;
        z = -60;
        yaw = 0;
        startAlt = 40;
        types = ['gold', 'gold', 'swift', 'gold', 'flip', 'gold', 'prism'];
      } else {
        const n = 4 + Math.floor(r() * 4);
        types = Array.from({ length: n }, () => this._pickType(r));
      }
      const path = planChain(r, x, z, yaw, types, startAlt);
      const chainId = `${cx},${cz},${c}`;
      if (!this.chainTotals.has(chainId)) this.chainTotals.set(chainId, path.length);
      path.forEach((p, i) => {
        const id = `${cx},${cz},${c},${i}`;
        if (this.collected.has(id)) return;
        const ring = this._make(id, types[i], p.x, p.y, p.z, p.normal);
        ring.planSpeed = p.v; // predicted arrival speed (handy for tuning)
        list.push(ring);
      });
    }
    // Rare portals, standing tall with a light beam so they can be found from afar.
    if (!nearSpawn && r() < 0.05) {
      const x = cx * CHUNK + 30 + r() * 100;
      const z = cz * CHUNK + 30 + r() * 100;
      const id = `${cx},${cz},portal`;
      const y = Math.max(heightAt(x, z), WATER_LEVEL) + 26;
      const a = r() * Math.PI * 2;
      // Half of all portals carry a word and lead into the poem world.
      const word = this.wordGates && r() < 0.5 ? GATE_WORDS[Math.floor(r() * GATE_WORDS.length)] : null;
      if (!this.collected.has(id)) list.push(this._make(id, 'portal', x, y, z, [Math.sin(a), 0, Math.cos(a)], word));
    }
    return list;
  }

  _make(id, type, x, y, z, normal, word = null) {
    const t = RING_TYPES[type];
    const geo = t.portal ? this.portalGeo : t.rainbow ? this.rainbowGeo : this.geo;
    const mat = t.shifter ? this.mats.gold.clone() : this.mats[type];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    const nrm = new THREE.Vector3(...normal);
    mesh.lookAt(nrm.clone().add(mesh.position)); // torus faces +Z
    mesh.userData.baseQuat = mesh.quaternion.clone();
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
      if (word) {
        // A word magnet hangs in the middle of the swirl.
        // Tiles are readable from both sides and draw over the swirl.
        mesh.add(makeTile(word, 0.7));
      }
      const beam = new THREE.Mesh(this.beamGeo, this.beamMat);
      beam.position.set(x, Math.max(heightAt(x, z), WATER_LEVEL), z);
      this.scene.add(beam);
      mesh.userData.beam = beam;
    }
    this.scene.add(mesh);
    const ring = {
      id, type, mesh, glow, icon, glowMat,
      normal: nrm,
      t: Math.random() * 10,
      dying: 0,
      radius: RADIUS * (t.portal ? 1.35 : 1),
      shift: Math.floor(Math.random() * SHIFT_CYCLE.length),
      word,
    };
    this.active.add(ring);
    return ring;
  }

  clear() {
    for (const ring of [...this.active]) this._remove(ring);
    this.collected.clear();
    this.chainTotals.clear();
    this.chainHits.clear();
  }

  removeChunk(list) {
    for (const ring of list) this._remove(ring);
  }

  _remove(ring) {
    if (!this.active.has(ring)) return;
    this.scene.remove(ring.mesh);
    if (ring.mesh.userData.beam) this.scene.remove(ring.mesh.userData.beam);
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
        m.quaternion.multiply(_spin.setFromAxisAngle(_Z, dt * 8));
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
      // The light beam is for finding portals from afar; hide it up close.
      if (m.userData.beam) m.userData.beam.visible = rel0(this, m, plane) > 110;
      if (!t.portal) {
        // Gentle spin around the ring's own axis.
        m.quaternion.copy(m.userData.baseQuat).multiply(_spin.setFromAxisAngle(_Z, Math.sin(ring.t * 0.8) * 0.3));
        m.scale.setScalar(1 + Math.sin(ring.t * 2.2) * 0.04);
      }

      const rel = this._tmp.subVectors(plane.position, m.position);
      if (rel.lengthSq() > 900) continue;
      const along = rel.dot(ring.normal);
      const radial = Math.sqrt(Math.max(0, rel.lengthSq() - along * along));
      if (Math.abs(along) < 2.5 && radial < ring.radius + 0.5) {
        ring.dying = 0.0001;
        this.collected.add(ring.id);
        // Threading every ring of a chain completes it.
        const chainId = ring.id.split(',').slice(0, 3).join(',');
        let chainDone = false;
        if (this.chainTotals.has(chainId)) {
          const n = (this.chainHits.get(chainId) ?? 0) + 1;
          this.chainHits.set(chainId, n);
          chainDone = n === this.chainTotals.get(chainId);
        }
        hits.push({ ring, type: this.effectiveType(ring), position: m.position.clone(), chainDone, chainLength: this.chainTotals.get(chainId) });
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
      const rel = this._tmp.subVectors(ring.mesh.position, plane.position);
      let d = rel.lengthSq();
      if (ring.type === 'portal') d *= 0.25;
      // Prefer the next ring ahead over one just missed behind you.
      if (rel.dot(plane.camForward) < 0) d *= 6;
      if (d < bestD) {
        bestD = d;
        best = ring;
      }
    }
    return best;
  }
}
