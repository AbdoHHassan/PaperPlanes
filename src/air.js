import * as THREE from 'three';
import { heightAt, forestAt, getSeed, WATER_LEVEL } from './terrain.js';
import { mulberry32, hash2 } from './noise.js';
import { CHUNK } from './scatter.js';
import { SOFT_SPRITE } from './effects.js';

/**
 * Moving air you can ride:
 *  - Thermals: columns of rising air over open, sunny ground, shown by
 *    spiralling seeds and motes. They lift you without costing speed.
 *  - Ridge lift: wind blowing up a slope pushes you up along the hillside.
 *  - Wind rivers: long ribbons of fast air that sweep you along and steer
 *    you gently down their course.
 */

export const WIND_DIR = new THREE.Vector3(0.8, 0, 0.6).normalize();

const THERMAL_RADIUS = 30; // visible column
const LIFT_RADIUS = 58; // where you feel it: wide enough to circle in
const THERMAL_LIFT = 8.5; // m/s at the core
const THERMAL_TOP = 230; // metres above the ground
const RIVER_WIDTH = 11;
const RIVER_SPEED = 44;

const riverMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 0 }, fogFar: { value: 1 } },
  fog: true,
  vertexShader: /* glsl */ `
    attribute float along;
    varying vec2 vUv;
    varying float vAlong;
    varying float vDepth;
    #include <fog_pars_vertex>
    void main() {
      vUv = uv;
      vAlong = along;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    varying float vAlong;
    varying float vDepth;
    #include <fog_pars_fragment>
    void main() {
      float across = abs(vUv.y - 0.5) * 2.0;
      // Streaks racing along the river, several lanes of them.
      float lane = floor(vUv.y * 7.0);
      float phase = fract(vAlong * 0.035 - uTime * (0.55 + fract(lane * 0.37) * 0.4) + lane * 0.31);
      float streak = smoothstep(0.0, 0.08, phase) * (1.0 - smoothstep(0.18, 0.55, phase));
      float edge = 1.0 - smoothstep(0.55, 1.0, across);
      float ends = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
      // Soften up close so riding inside the river doesn't glare.
      float near = smoothstep(6.0, 45.0, vDepth);
      float a = (streak * 0.55 + 0.06) * edge * ends * mix(0.18, 1.0, near);
      gl_FragColor = vec4(vec3(1.0, 0.99, 0.95), a);
      #include <fog_fragment>
    }`,
});

const thermalMat = new THREE.PointsMaterial({
  size: 1.5,
  map: SOFT_SPRITE,
  color: '#fff6dc',
  transparent: true,
  opacity: 0.75,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

export class Air {
  constructor(scene) {
    this.scene = scene;
    this.thermals = new Set();
    this.rivers = new Set();
    this.time = 0;
    this._v = new THREE.Vector3();
    this.result = { lift: 0, ridge: 0, thermal: 0, river: null, riverAlign: 0, riverDir: new THREE.Vector3() };
  }

  spawnForChunk(cx, cz) {
    const r = mulberry32(hash2(cx, cz, 7 + getSeed() * 31));
    const out = [];
    if (Math.hypot(cx, cz) < 1) return out;
    // Thermals prefer open meadows and bare rock, never water or forest.
    if (r() < 0.28) {
      const x = cx * CHUNK + 20 + r() * (CHUNK - 40);
      const z = cz * CHUNK + 20 + r() * (CHUNK - 40);
      const g = heightAt(x, z);
      if (g > WATER_LEVEL + 3 && forestAt(x, z) < 0.45) out.push(this._thermal(x, g, z, r));
    }
    if (r() < 0.07) out.push(this._river(cx * CHUNK + r() * CHUNK, cz * CHUNK + r() * CHUNK, r() * Math.PI * 2, r));
    return out;
  }

  _thermal(x, g, z, r) {
    const n = 180;
    const pos = new Float32Array(n * 3);
    const seeds = new Float32Array(n * 3); // angle, radius, height
    for (let i = 0; i < n; i++) {
      seeds[i * 3] = r() * Math.PI * 2;
      seeds[i * 3 + 1] = Math.sqrt(r()) * THERMAL_RADIUS;
      seeds[i * 3 + 2] = r() * THERMAL_TOP;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(geo, thermalMat);
    points.frustumCulled = false;
    points.position.set(x, g, z);
    this.scene.add(points);
    const t = { kind: 'thermal', x, z, g, points, seeds, strength: 0.75 + r() * 0.5 };
    this.thermals.add(t);
    return t;
  }

  _river(x, z, yaw, r) {
    // A smooth, meandering course that clears the ground and treetops.
    const n = 14;
    const step = 55;
    const pts = [];
    const turn = (r() - 0.5) * 0.25;
    let alt = null;
    for (let i = 0; i < n; i++) {
      const g = Math.max(heightAt(x, z), WATER_LEVEL);
      const want = g + 22 + forestAt(x, z) * 20;
      alt = alt === null ? want : Math.max(want, alt - 5);
      pts.push(new THREE.Vector3(x, alt, z));
      yaw += turn + Math.sin(i * 0.7) * 0.12;
      x += Math.sin(yaw) * step;
      z += Math.cos(yaw) * step;
    }
    // Smooth the heights so the ribbon never kinks.
    for (let k = 0; k < 3; k++) for (let i = 1; i < n - 1; i++) pts[i].y = Math.max(pts[i].y, (pts[i - 1].y + pts[i + 1].y) / 2);
    const curve = new THREE.CatmullRomCurve3(pts);
    const samples = curve.getSpacedPoints(160);
    const tangents = samples.map((_, i) => curve.getTangentAt(i / 160));

    // Ribbon mesh, flat-ish but tilted a little so it reads from the side.
    const verts = [];
    const uvs = [];
    const along = [];
    const idx = [];
    const len = curve.getLength();
    samples.forEach((p, i) => {
      const t = tangents[i];
      const side = new THREE.Vector3(t.z, 0, -t.x).normalize();
      const upish = new THREE.Vector3().crossVectors(side, t).normalize().multiplyScalar(0.35);
      const s = side.clone().add(upish).normalize().multiplyScalar(RIVER_WIDTH);
      verts.push(p.x - s.x, p.y - s.y, p.z - s.z, p.x + s.x, p.y + s.y, p.z + s.z);
      const u = i / (samples.length - 1);
      uvs.push(u, 0, u, 1);
      along.push(u * len, u * len);
      if (i < samples.length - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, riverMat);
    this.scene.add(mesh);
    const box = new THREE.Box3().setFromPoints(samples).expandByScalar(RIVER_WIDTH + 5);
    const rv = { kind: 'river', mesh, samples, tangents, box, id: `${x | 0},${z | 0}` };
    this.rivers.add(rv);
    return rv;
  }

  removeChunk(list) {
    for (const a of list) {
      if (a.kind === 'thermal') {
        this.scene.remove(a.points);
        a.points.geometry.dispose();
        this.thermals.delete(a);
      } else {
        this.scene.remove(a.mesh);
        a.mesh.geometry.dispose();
        this.rivers.delete(a);
      }
    }
  }

  clear() {
    this.removeChunk([...this.thermals, ...this.rivers]);
  }

  /** Animates visuals and samples the air at the plane. */
  update(dt, plane, scene) {
    this.time += dt;
    riverMat.uniforms.uTime.value = this.time;
    if (scene.fog) {
      riverMat.uniforms.fogColor.value.copy(scene.fog.color);
      riverMat.uniforms.fogNear.value = scene.fog.near;
      riverMat.uniforms.fogFar.value = scene.fog.far;
    }
    const p = plane.position;
    const res = this.result;
    res.thermal = 0;
    res.ridge = 0;
    res.river = null;
    res.riverAlign = 0;

    // Thermals: animate the rising spiral; lift falls off from the core.
    for (const t of this.thermals) {
      const dx = p.x - t.x;
      const dz = p.z - t.z;
      const d2 = dx * dx + dz * dz;
      const visible = d2 < 700 * 700;
      t.points.visible = visible;
      if (visible) {
        const arr = t.points.geometry.attributes.position.array;
        const s = t.seeds;
        for (let i = 0; i < s.length; i += 3) {
          s[i + 2] = (s[i + 2] + dt * (6 + (i % 7))) % THERMAL_TOP;
          const h = s[i + 2];
          const a = s[i] + this.time * 0.5 + h * 0.02;
          const rad = s[i + 1] * (0.6 + (h / THERMAL_TOP) * 0.6);
          arr[i] = Math.cos(a) * rad;
          arr[i + 1] = h;
          arr[i + 2] = Math.sin(a) * rad;
        }
        t.points.geometry.attributes.position.needsUpdate = true;
      }
      if (d2 < LIFT_RADIUS * LIFT_RADIUS) {
        const above = p.y - t.g;
        const core = 1 - Math.sqrt(d2) / LIFT_RADIUS;
        const fade = above < 0 ? 0 : above > THERMAL_TOP ? Math.max(0, 1 - (above - THERMAL_TOP) / 40) : 1;
        // Broad, rounded profile: strongest in the middle, still useful at the edge.
        res.thermal = Math.max(res.thermal, THERMAL_LIFT * t.strength * Math.sqrt(core) * fade);
      }
    }

    // Ridge lift: wind blowing up the slope beneath you.
    if (plane.groundDist < 90) {
      const e = 6;
      const gx = (heightAt(p.x + e, p.z) - heightAt(p.x - e, p.z)) / (2 * e);
      const gz = (heightAt(p.x, p.z + e) - heightAt(p.x, p.z - e)) / (2 * e);
      const up = gx * WIND_DIR.x + gz * WIND_DIR.z;
      res.ridge = Math.max(0, Math.min(5, up * 9)) * Math.max(0, 1 - plane.groundDist / 90);
    }

    // Wind rivers: nearest point on the course.
    for (const rv of this.rivers) {
      if (!rv.box.containsPoint(p)) continue;
      let best = Infinity;
      let bi = 0;
      const S = rv.samples;
      for (let i = 0; i < S.length; i += 2) {
        const d = S[i].distanceToSquared(p);
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      if (best < RIVER_WIDTH * RIVER_WIDTH * 1.4) {
        const dir = rv.tangents[bi];
        res.river = rv;
        res.riverAlign = dir.x * plane.forward.x + dir.y * plane.forward.y + dir.z * plane.forward.z;
        res.riverDir.copy(dir);
        res.riverCenter = S[bi];
        res.riverDist = Math.sqrt(best) / (RIVER_WIDTH * 1.18); // 0 centre .. 1 edge
        break;
      }
    }
    res.lift = res.thermal + res.ridge;
    return res;
  }
}

export { RIVER_SPEED };
