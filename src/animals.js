import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, slopeAt, forestAt, autumnAt, getSeed, WATER_LEVEL } from './terrain.js';
import { mulberry32, hash2 } from './noise.js';
import { CHUNK } from './scatter.js';

// ---------------------------------------------------------------------------
// Tiny low-poly modelling kit: coloured boxes and cones merged per body part.

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
const _c = new THREE.Color();

function shape(geo, color, [x, y, z] = [0, 0, 0], [rx, ry, rz] = [0, 0, 0]) {
  const g = geo.toNonIndexed();
  g.deleteAttribute('uv');
  g.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
  _c.set(color);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([_c.r, _c.g, _c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const box = (w, h, d, color, pos, rot) => shape(new THREE.BoxGeometry(w, h, d), color, pos, rot);
const cone = (r, h, color, pos, rot, seg = 4) => shape(new THREE.ConeGeometry(r, h, seg), color, pos, rot);

function part(parent, geos, pivot = [0, 0, 0]) {
  const m = new THREE.Mesh(mergeGeometries(geos), MAT);
  m.position.set(...pivot);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Four legs hanging from hip pivots so they can swing. */
function legs(group, w, len, color, xs, zs, hipY) {
  const out = [];
  for (const x of [-xs, xs]) for (const z of [-zs, zs]) out.push(part(group, [box(w, len, w, color, [0, -len / 2, 0])], [x, hipY, z]));
  return out;
}

const BUILD = {
  deer() {
    const g = new THREE.Group();
    part(g, [
      box(0.5, 0.45, 1.1, '#b8753f', [0, 1.05, 0]),
      box(0.4, 0.12, 0.9, '#ecd9b8', [0, 0.84, 0]),
      box(0.18, 0.5, 0.2, '#b8753f', [0, 1.4, 0.45], [-0.5, 0, 0]),
      box(0.1, 0.12, 0.08, '#fff8ee', [0, 1.15, -0.58]),
    ]);
    const head = part(g, [
      box(0.22, 0.22, 0.38, '#b8753f', [0, 0, 0.1]),
      box(0.12, 0.1, 0.08, '#3a2a22', [0, -0.03, 0.3]),
      cone(0.06, 0.2, '#b8753f', [-0.12, 0.15, 0], [0, 0, 0.6]),
      cone(0.06, 0.2, '#b8753f', [0.12, 0.15, 0], [0, 0, -0.6]),
      box(0.04, 0.35, 0.04, '#d8c7a0', [-0.08, 0.28, -0.02], [0, 0, 0.3]),
      box(0.04, 0.35, 0.04, '#d8c7a0', [0.08, 0.28, -0.02], [0, 0, -0.3]),
      box(0.04, 0.18, 0.04, '#d8c7a0', [-0.14, 0.4, 0.04], [0.4, 0, 0.6]),
      box(0.04, 0.18, 0.04, '#d8c7a0', [0.14, 0.4, 0.04], [0.4, 0, -0.6]),
    ], [0, 1.62, 0.6]);
    return { group: g, head, legs: legs(g, 0.1, 0.85, '#8a5530', 0.17, 0.4, 0.95) };
  },
  fox() {
    const g = new THREE.Group();
    part(g, [
      box(0.28, 0.28, 0.7, '#e0772c', [0, 0.45, 0]),
      box(0.2, 0.14, 0.3, '#fff4e6', [0, 0.36, 0.22]),
    ]);
    const head = part(g, [
      box(0.26, 0.22, 0.26, '#e0772c', [0, 0, 0]),
      cone(0.08, 0.2, '#fff4e6', [0, -0.04, 0.2], [Math.PI / 2, 0, 0]),
      box(0.05, 0.05, 0.05, '#222', [0, -0.03, 0.3]),
      cone(0.07, 0.16, '#e0772c', [-0.08, 0.17, -0.02]),
      cone(0.07, 0.16, '#e0772c', [0.08, 0.17, -0.02]),
    ], [0, 0.62, 0.42]);
    const tail = part(g, [box(0.16, 0.16, 0.5, '#e0772c', [0, 0, -0.25]), box(0.14, 0.14, 0.14, '#fff4e6', [0, 0, -0.55])], [0, 0.52, -0.35]);
    tail.rotation.x = 0.4;
    return { group: g, head, tail, legs: legs(g, 0.07, 0.35, '#3a2a22', 0.09, 0.25, 0.35) };
  },
  rabbit() {
    const g = new THREE.Group();
    part(g, [
      box(0.28, 0.28, 0.42, '#c9b49a', [0, 0.22, 0]),
      box(0.12, 0.12, 0.12, '#ffffff', [0, 0.28, -0.24]),
      box(0.3, 0.1, 0.2, '#c9b49a', [0, 0.06, -0.08]),
    ]);
    const head = part(g, [
      box(0.2, 0.2, 0.22, '#c9b49a', [0, 0, 0]),
      box(0.06, 0.3, 0.04, '#c9b49a', [-0.05, 0.24, -0.03], [-0.2, 0, 0.12]),
      box(0.06, 0.3, 0.04, '#c9b49a', [0.05, 0.24, -0.03], [-0.2, 0, -0.12]),
      box(0.04, 0.04, 0.03, '#f4a0a8', [0, -0.02, 0.12]),
    ], [0, 0.38, 0.2]);
    return { group: g, head, legs: [] };
  },
  bear() {
    const g = new THREE.Group();
    part(g, [box(0.8, 0.75, 1.4, '#6b4a33', [0, 0.95, 0]), box(0.7, 0.3, 0.5, '#6b4a33', [0, 1.3, -0.3])]);
    const head = part(g, [
      box(0.45, 0.4, 0.45, '#6b4a33', [0, 0, 0]),
      box(0.22, 0.18, 0.22, '#b08a6a', [0, -0.07, 0.28]),
      box(0.08, 0.06, 0.05, '#1a1410', [0, -0.02, 0.4]),
      box(0.12, 0.12, 0.06, '#6b4a33', [-0.18, 0.24, 0]),
      box(0.12, 0.12, 0.06, '#6b4a33', [0.18, 0.24, 0]),
    ], [0, 1.15, 0.85]);
    return { group: g, head, legs: legs(g, 0.25, 0.65, '#5a3d2a', 0.26, 0.48, 0.65) };
  },
  goat() {
    const g = new THREE.Group();
    part(g, [box(0.42, 0.45, 0.9, '#eeeae0', [0, 0.8, 0]), box(0.1, 0.12, 0.1, '#eeeae0', [0, 0.95, -0.48])]);
    const head = part(g, [
      box(0.2, 0.24, 0.32, '#eeeae0', [0, 0, 0.08]),
      box(0.06, 0.16, 0.06, '#d8d0c0', [0, -0.18, 0.12]),
      box(0.05, 0.3, 0.05, '#4a4038', [-0.07, 0.2, -0.08], [-0.7, 0, 0.2]),
      box(0.05, 0.3, 0.05, '#4a4038', [0.07, 0.2, -0.08], [-0.7, 0, -0.2]),
    ], [0, 1.15, 0.5]);
    return { group: g, head, legs: legs(g, 0.09, 0.6, '#d8d0c0', 0.14, 0.33, 0.62) };
  },
  duck() {
    const g = new THREE.Group();
    part(g, [
      box(0.32, 0.22, 0.48, '#8a7a60', [0, 0.1, 0]),
      box(0.3, 0.08, 0.3, '#e8e2d4', [0, 0.02, 0.02]),
      box(0.26, 0.1, 0.14, '#4a4a5a', [0, 0.18, -0.26], [0.5, 0, 0]),
      box(0.3, 0.06, 0.3, '#3a6a9a', [0, 0.2, -0.02]),
    ]);
    const head = part(g, [
      box(0.16, 0.18, 0.18, '#2f7a4a', [0, 0, 0]),
      box(0.18, 0.04, 0.18, '#ffffff', [0, -0.1, -0.02]),
      box(0.08, 0.04, 0.14, '#f2a23a', [0, -0.03, 0.14]),
    ], [0, 0.32, 0.2]);
    return { group: g, head, legs: [] };
  },
  fish() {
    const g = new THREE.Group();
    part(g, [
      box(0.18, 0.32, 0.7, '#f08a3a', [0, 0, 0]),
      box(0.19, 0.16, 0.3, '#ffffff', [0, 0.06, 0.12]),
      box(0.04, 0.14, 0.2, '#e0602a', [0, 0.22, 0]),
      box(0.04, 0.3, 0.25, '#f08a3a', [0, 0, -0.45]),
      box(0.2, 0.05, 0.05, '#1a1a1a', [0, 0.05, 0.3]),
    ]);
    return { group: g, legs: [] };
  },
  eagle() {
    const g = new THREE.Group();
    part(g, [
      box(0.3, 0.26, 0.8, '#4a3526', [0, 0, 0]),
      box(0.24, 0.24, 0.26, '#f4f0e6', [0, 0.06, 0.48]),
      cone(0.06, 0.16, '#f2c23a', [0, 0.02, 0.66], [Math.PI / 2, 0, 0]),
      box(0.36, 0.04, 0.3, '#f4f0e6', [0, 0, -0.52]),
    ]);
    const wingL = part(g, [box(1.5, 0.04, 0.46, '#4a3526', [-0.75, 0, 0]), box(0.4, 0.04, 0.3, '#2e2118', [-1.6, 0, -0.05])], [-0.12, 0.05, 0]);
    const wingR = part(g, [box(1.5, 0.04, 0.46, '#4a3526', [0.75, 0, 0]), box(0.4, 0.04, 0.3, '#2e2118', [1.6, 0, -0.05])], [0.12, 0.05, 0]);
    return { group: g, wings: [wingL, wingR], legs: [] };
  },
};

export const SPECIES = {
  deer: { name: 'Deer', emoji: '🦌', scale: 2.2, speed: 1.4, flee: 9, herd: [2, 4] },
  fox: { name: 'Red Fox', emoji: '🦊', scale: 2.4, speed: 2.2, flee: 8, herd: [1, 2] },
  rabbit: { name: 'Rabbit', emoji: '🐇', scale: 2.6, speed: 1.8, flee: 7, herd: [3, 5] },
  bear: { name: 'Brown Bear', emoji: '🐻', scale: 2.2, speed: 0.9, flee: 0, herd: [1, 1] },
  goat: { name: 'Mountain Goat', emoji: '🐐', scale: 2.3, speed: 0.8, flee: 5, herd: [2, 3] },
  duck: { name: 'Mallard', emoji: '🦆', scale: 2.4, speed: 0.9, flee: 0, herd: [3, 5] },
  fish: { name: 'Leaping Koi', emoji: '🐟', scale: 2.2, speed: 0, flee: 0, herd: [2, 3] },
  eagle: { name: 'Golden Eagle', emoji: '🦅', scale: 2.6, speed: 12, flee: 0, herd: [1, 1] },
};
export const SPECIES_KEYS = Object.keys(SPECIES);

// ---------------------------------------------------------------------------

export class Animals {
  constructor(scene) {
    this.scene = scene;
    this.active = new Set();
    this.discovered = new Set();
    try {
      for (const k of JSON.parse(localStorage.getItem('paperplanes.animals') || '[]')) {
        if (SPECIES[k]) this.discovered.add(k);
      }
    } catch {
      /* storage unavailable */
    }
    this._v = new THREE.Vector3();
  }

  _save() {
    try {
      localStorage.setItem('paperplanes.animals', JSON.stringify([...this.discovered]));
    } catch {
      /* storage unavailable */
    }
  }

  /** Picks a species that suits the terrain at (x, z), or null. */
  _habitat(x, z, r) {
    const h = heightAt(x, z);
    if (h < WATER_LEVEL - 1.5) return r() < 0.5 ? 'duck' : 'fish';
    if (h < WATER_LEVEL + 1.5) return null;
    const slope = slopeAt(x, z);
    if (h > 120 && r() < 0.5) return 'eagle';
    if (h > 90 && slope > 0.35) return 'goat';
    if (h > 110) return null;
    const forest = forestAt(x, z);
    if (forest > 0.6) return r() < 0.35 ? 'bear' : 'deer';
    if (autumnAt(x, z) > 0.4 && r() < 0.6) return 'fox';
    if (forest < 0.3) return r() < 0.55 ? 'rabbit' : 'deer';
    return 'deer';
  }

  spawnForChunk(cx, cz) {
    const r = mulberry32(hash2(cx, cz, 5 + getSeed() * 31));
    const list = [];
    if (r() > 0.42) return list;
    for (let attempt = 0; attempt < 6; attempt++) {
      const x = cx * CHUNK + 15 + r() * (CHUNK - 30);
      const z = cz * CHUNK + 15 + r() * (CHUNK - 30);
      const kind = this._habitat(x, z, r);
      if (!kind) continue;
      const sp = SPECIES[kind];
      const n = sp.herd[0] + Math.floor(r() * (sp.herd[1] - sp.herd[0] + 1));
      for (let i = 0; i < n; i++) {
        const ax = x + (r() - 0.5) * 18;
        const az = z + (r() - 0.5) * 18;
        const small = kind === 'duck' && i > 0; // ducklings follow mum
        if (kind === 'duck' || kind === 'fish') {
          if (heightAt(ax, az) > WATER_LEVEL - 0.8) continue;
        }
        list.push(this._make(kind, ax, az, r, small ? 0.55 : 1, i));
      }
      break;
    }
    return list;
  }

  /** Builds each species once; instances clone it and share the geometry. */
  _rig(kind) {
    this.templates ??= {};
    let tpl = this.templates[kind];
    if (!tpl) {
      const rig = BUILD[kind]();
      const idx = (m) => rig.group.children.indexOf(m);
      tpl = this.templates[kind] = {
        group: rig.group,
        head: rig.head ? idx(rig.head) : -1,
        tail: rig.tail ? idx(rig.tail) : -1,
        legs: rig.legs.map(idx),
        wings: (rig.wings || []).map(idx),
      };
    }
    const g = tpl.group.clone(true);
    const c = g.children;
    return {
      group: g,
      head: tpl.head >= 0 ? c[tpl.head] : null,
      tail: tpl.tail >= 0 ? c[tpl.tail] : null,
      legs: tpl.legs.map((i) => c[i]),
      wings: tpl.wings.map((i) => c[i]),
    };
  }

  _make(kind, x, z, r, sizeMul, index) {
    const sp = SPECIES[kind];
    const rig = this._rig(kind);
    if (kind === 'duck' && sizeMul < 1) {
      rig.group.traverse((o) => {
        if (o.isMesh) {
          o.material = DUCKLING;
        }
      });
    }
    const g = rig.group;
    // A little larger than life so they read from the air.
    g.scale.setScalar(sp.scale * sizeMul * 1.25);
    const a = {
      kind, rig, group: g,
      x, z, home: new THREE.Vector2(x, z),
      heading: r() * Math.PI * 2,
      state: 'idle', timer: r() * 3, t: r() * 10,
      speed: 0, phase: r() * 10, index,
      jump: 3 + r() * 5,
      alt: kind === 'eagle' ? Math.max(heightAt(x, z), 0) + 45 + r() * 20 : 0,
    };
    this._place(a, 0);
    this.scene.add(g);
    this.active.add(a);
    return a;
  }

  _place(a) {
    const g = a.group;
    let y;
    if (a.kind === 'duck') y = WATER_LEVEL + Math.sin(a.t * 2 + a.phase) * 0.05 - 0.05;
    else if (a.kind === 'eagle') y = a.alt;
    else if (a.kind === 'fish') y = WATER_LEVEL - 3;
    else y = heightAt(a.x, a.z) - 0.05;
    g.position.set(a.x, y, a.z);
    g.rotation.set(0, a.heading, 0);
  }

  removeChunk(list) {
    for (const a of list) {
      this.scene.remove(a.group);
      this.active.delete(a);
    }
  }

  clear() {
    this.removeChunk([...this.active]);
  }

  /** Animates nearby animals; returns species discovered this frame. */
  update(dt, plane) {
    const found = [];
    this.nearestNew = Infinity; // distance to the closest undiscovered species
    const px = plane.position.x;
    const pz = plane.position.z;
    for (const a of this.active) {
      const dx = a.x - px;
      const dz = a.z - pz;
      const d2 = dx * dx + dz * dz;
      a.group.visible = d2 < 480 * 480;
      if (!a.group.visible) continue;
      if (d2 > 320 * 320) continue; // too far to see the animation
      a.t += dt;
      const sp = SPECIES[a.kind];
      const dist3 = Math.sqrt(d2 + (plane.position.y - a.group.position.y) ** 2);

      if (!this.discovered.has(a.kind)) this.nearestNew = Math.min(this.nearestNew, dist3);
      // Discovery: fly close enough to get a good look.
      if (dist3 < 75 && !a.seen) {
        a.seen = true;
        if (!this.discovered.has(a.kind)) {
          this.discovered.add(a.kind);
          this._save();
          found.push(a);
        }
      }
      // Skittish animals bolt when the plane swoops low and close.
      if (sp.flee && dist3 < 38 && a.state !== 'flee') {
        a.state = 'flee';
        a.timer = 2.5 + Math.random();
        a.heading = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.6;
      }
      this._behave(a, sp, dt);
      this._place(a);
      this._animate(a);
    }
    return found;
  }

  _behave(a, sp, dt) {
    a.timer -= dt;
    switch (a.kind) {
      case 'fish':
        return;
      case 'eagle':
        a.heading += dt * 0.25;
        a.x += Math.sin(a.heading) * sp.speed * dt;
        a.z += Math.cos(a.heading) * sp.speed * dt;
        return;
      case 'duck': {
        a.heading += dt * 0.18;
        const nx = a.x + Math.sin(a.heading) * sp.speed * dt;
        const nz = a.z + Math.cos(a.heading) * sp.speed * dt;
        if (heightAt(nx, nz) < WATER_LEVEL - 0.5) {
          a.x = nx;
          a.z = nz;
        } else a.heading += Math.PI * 0.5;
        return;
      }
    }
    if (a.timer <= 0) {
      if (a.state === 'walk' || a.state === 'flee') {
        a.state = 'idle';
        a.timer = 2 + Math.random() * 4;
      } else {
        a.state = 'walk';
        a.timer = 2 + Math.random() * 3;
        // Wander, but drift back towards home.
        const hx = a.home.x - a.x;
        const hz = a.home.y - a.z;
        a.heading = Math.hypot(hx, hz) > 25 ? Math.atan2(hx, hz) : a.heading + (Math.random() - 0.5) * 2;
      }
    }
    const target = a.state === 'walk' ? sp.speed : a.state === 'flee' ? sp.flee : 0;
    a.speed += (target - a.speed) * (1 - Math.exp(-dt * 4));
    if (a.speed > 0.01) {
      const nx = a.x + Math.sin(a.heading) * a.speed * dt;
      const nz = a.z + Math.cos(a.heading) * a.speed * dt;
      if (heightAt(nx, nz) > WATER_LEVEL + 1) {
        a.x = nx;
        a.z = nz;
      } else {
        a.heading += Math.PI * 0.7;
      }
    }
  }

  _animate(a) {
    const { rig, group } = a;
    const t = a.t + a.phase;
    const moving = a.speed > 0.2;
    const gait = t * (a.state === 'flee' ? 14 : 7);
    rig.legs.forEach((leg, i) => {
      leg.rotation.x = moving ? Math.sin(gait + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 : 0;
    });
    if (rig.head) {
      // Grazers lower their heads while idle; everyone looks around a little.
      const graze = !moving && ['deer', 'goat', 'rabbit'].includes(a.kind) ? (Math.sin(t * 0.4) > 0 ? 1 : 0) : 0;
      rig.head.rotation.x += ((graze ? 1.0 : 0) - rig.head.rotation.x) * 0.08;
      rig.head.rotation.y = Math.sin(t * 0.7) * 0.3;
    }
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * 5) * 0.3;
    if (a.kind === 'rabbit' && moving) group.position.y += Math.abs(Math.sin(gait * 0.6)) * 0.9;
    if (a.kind === 'deer' && a.state === 'flee') group.position.y += Math.abs(Math.sin(gait * 0.5)) * 1.2;
    if (a.kind === 'eagle') {
      const flap = Math.sin(t * 0.5) > 0.6 ? Math.sin(t * 9) * 0.6 : 0.08;
      rig.wings[0].rotation.z = flap;
      rig.wings[1].rotation.z = -flap;
      group.rotation.z = -0.35; // bank into the circle
    }
    if (a.kind === 'fish') {
      // Leap out of the water in an arc every few seconds.
      const cycle = a.jump + 1.4;
      const k = (t % cycle) - a.jump;
      if (k > 0) {
        const s = k / 1.4;
        group.position.y = WATER_LEVEL - 1 + Math.sin(s * Math.PI) * 7;
        group.position.x += Math.sin(a.heading) * (s - 0.5) * 8;
        group.position.z += Math.cos(a.heading) * (s - 0.5) * 8;
        group.rotation.x = -Math.cos(s * Math.PI) * 1.1;
        group.visible = true;
        if (s > 0.98) a.heading += 1.3;
      } else {
        group.visible = false;
      }
    }
  }
}

const DUCKLING = new THREE.MeshStandardMaterial({ color: '#f2d65a', flatShading: true, roughness: 0.9 });
