import * as THREE from 'three';
import { createNoise2D, fbm, smoothstep, lerp } from './noise.js';

export const WATER_LEVEL = 0;

const nHills = createNoise2D(11);
const nMountain = createNoise2D(23);
const nMask = createNoise2D(37);
const nDetail = createNoise2D(41);
const nBiome = createNoise2D(53);
const nAutumn = createNoise2D(67);

/**
 * Height of the landscape at world (x, z). Rolling meadows, a few lakes and
 * ridged mountains in the distance. The spawn area is kept as a gentle valley.
 */
export function heightAt(x, z) {
  const hills = fbm(nHills, x * 0.0016, z * 0.0016, 4) * 38;
  const mask = smoothstep(-0.05, 0.55, fbm(nMask, x * 0.0004 + 7.3, z * 0.0004 - 2.1, 2));
  const r = 1 - Math.abs(fbm(nMountain, x * 0.0011, z * 0.0011, 4, 2.1, 0.5));
  const ridges = r * r * r * 260 * mask;
  const detail = nDetail(x * 0.02, z * 0.02) * 1.2;
  let h = hills + ridges + detail + 10;
  // Flatten a soft valley around the origin so the first seconds are calm.
  const d = Math.hypot(x, z);
  const spawn = 1 - smoothstep(120, 520, d);
  h = lerp(h, 6 + hills * 0.25, spawn * 0.8);
  return h;
}

export function slopeAt(x, z) {
  const e = 2;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** 0 = open meadow, 1 = dense forest */
export function forestAt(x, z) {
  return smoothstep(-0.1, 0.45, fbm(nBiome, x * 0.0025 + 3.1, z * 0.0025 + 9.7, 3));
}

/** 0 = summer green, 1 = full autumn */
export function autumnAt(x, z) {
  return smoothstep(0.05, 0.5, fbm(nAutumn, x * 0.0012 - 4.2, z * 0.0012 + 1.3, 2));
}

// ---------------------------------------------------------------------------
// Colours

const C = (hex) => new THREE.Color(hex);
const PAL = {
  sand: C('#e8d69a'),
  wetSand: C('#c9b27a'),
  grassA: C('#8fcf4e'),
  grassB: C('#6fb83f'),
  meadowGold: C('#d8c25a'),
  autumnA: C('#e0a23a'),
  autumnB: C('#d9772c'),
  forestFloor: C('#5a9a3a'),
  rock: C('#a9ab9b'),
  rockDark: C('#8d9183'),
  snow: C('#f4f6f8'),
};

const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

function colorAt(x, y, z, slope, out) {
  const forest = forestAt(x, z);
  const autumn = autumnAt(x, z);
  const v = nDetail(x * 0.05, z * 0.05) * 0.5 + 0.5;

  tmp.copy(PAL.grassA).lerp(PAL.grassB, v);
  tmp.lerp(PAL.forestFloor, forest * 0.6);
  tmp2.copy(PAL.autumnA).lerp(PAL.autumnB, v);
  tmp.lerp(tmp2, autumn * 0.75);
  tmp.lerp(PAL.meadowGold, smoothstep(0.55, 0.95, v) * (1 - forest) * 0.35);

  if (y < WATER_LEVEL + 2.5) tmp.lerp(PAL.sand, 1 - smoothstep(WATER_LEVEL + 0.5, WATER_LEVEL + 2.5, y));
  if (y < WATER_LEVEL + 0.3) tmp.copy(PAL.wetSand);

  const rocky = smoothstep(0.55, 0.95, slope) + smoothstep(90, 150, y) * 0.8;
  tmp2.copy(PAL.rock).lerp(PAL.rockDark, v);
  tmp.lerp(tmp2, Math.min(1, rocky));

  const snow = smoothstep(175, 205, y + v * 15) * (1 - smoothstep(0.9, 1.3, slope));
  tmp.lerp(PAL.snow, snow);
  return out.copy(tmp);
}

/**
 * Builds a flat-shaded low-poly terrain tile. Uses a non-indexed triangle
 * list so each face gets its own normal and colour.
 */
export function buildTerrainGeometry(cx, cz, size, segments) {
  const step = size / segments;
  const x0 = cx * size;
  const z0 = cz * size;
  const n = segments + 1;
  const hs = new Float32Array(n * n);
  // Jitter interior grid points a little so it doesn't look like a grid.
  const jx = new Float32Array(n * n);
  const jz = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const wx = x0 + i * step;
      const wz = z0 + j * step;
      const k = j * n + i;
      const edge = i === 0 || j === 0 || i === segments || j === segments;
      // Jitter must be a pure function of world position so tiles line up.
      jx[k] = edge ? 0 : nDetail(wx * 0.37, wz * 0.37) * step * 0.3;
      jz[k] = edge ? 0 : nDetail(wz * 0.37 + 5, wx * 0.37 - 5) * step * 0.3;
      hs[k] = heightAt(wx + jx[k], wz + jz[k]);
    }
  }

  // Main grid plus a double-sided skirt on each edge to hide LOD cracks.
  const triCount = segments * segments * 2 + segments * 4 * 4;
  const pos = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  const c = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  let p = 0;

  const vtx = (i, j, out) => {
    const k = j * n + i;
    return out.set(i * step + jx[k], hs[k], j * step + jz[k]);
  };

  const pushTri = (A, B, D) => {
    e1.subVectors(B, A);
    e2.subVectors(D, A);
    nrm.crossVectors(e1, e2).normalize();
    const slope = Math.sqrt(1 - Math.min(1, nrm.y * nrm.y)) / Math.max(0.05, nrm.y);
    const mx = (A.x + B.x + D.x) / 3 + x0;
    const my = (A.y + B.y + D.y) / 3;
    const mz = (A.z + B.z + D.z) / 3 + z0;
    colorAt(mx, my, mz, slope, c);
    for (const V of [A, B, D]) {
      pos[p] = V.x; pos[p + 1] = V.y; pos[p + 2] = V.z;
      col[p] = c.r; col[p + 1] = c.g; col[p + 2] = c.b;
      p += 3;
    }
  };

  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const flip = (i + j) & 1;
      const p00 = vtx(i, j, a.clone());
      const p10 = vtx(i + 1, j, b.clone());
      const p01 = vtx(i, j + 1, d.clone());
      const p11 = vtx(i + 1, j + 1, new THREE.Vector3());
      if (flip) {
        pushTri(p00, p01, p10);
        pushTri(p10, p01, p11);
      } else {
        pushTri(p00, p01, p11);
        pushTri(p00, p11, p10);
      }
    }
  }

  const SKIRT = 12;
  const edges = [
    (t) => [t, 0],
    (t) => [segments, t],
    (t) => [segments - t, segments],
    (t) => [0, segments - t],
  ];
  for (const edge of edges) {
    for (let t = 0; t < segments; t++) {
      const [i0, j0] = edge(t);
      const [i1, j1] = edge(t + 1);
      const A = vtx(i0, j0, new THREE.Vector3());
      const B = vtx(i1, j1, new THREE.Vector3());
      const A2 = A.clone().setY(A.y - SKIRT);
      const B2 = B.clone().setY(B.y - SKIRT);
      pushTri(A, B, A2); pushTri(B, B2, A2);
      pushTri(A, A2, B); pushTri(B, A2, B2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
