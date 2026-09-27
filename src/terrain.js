// Pure terrain maths (no three.js) so it can run in both the page and workers.
import { createNoise2D, fbm, smoothstep, lerp } from './noise.js';
import { THEMES } from './themes.js';

export const WATER_LEVEL = 0;

let seed = 1;
let nHills, nMountain, nMask, nDetail, nBiome, nAutumn;

/** Re-seeds every noise field; a new seed is a whole new world. */
export function setSeed(s) {
  seed = s >>> 0;
  nHills = createNoise2D(seed * 7 + 11);
  nMountain = createNoise2D(seed * 7 + 23);
  nMask = createNoise2D(seed * 7 + 37);
  nDetail = createNoise2D(seed * 7 + 41);
  nBiome = createNoise2D(seed * 7 + 53);
  nAutumn = createNoise2D(seed * 7 + 67);
}
setSeed(1);

export const getSeed = () => seed;

/**
 * Height of the landscape at world (x, z). Rolling meadows, a few lakes and
 * ridged mountains in the distance. The spawn area is kept as a gentle valley.
 */
export function heightAt(x, z) {
  const hills = fbm(nHills, x * 0.0016, z * 0.0016, 4) * 38;
  const mask = smoothstep(-0.05, 0.55, fbm(nMask, x * 0.0004 + 7.3, z * 0.0004 - 2.1, 2));
  let ridges = 0;
  if (mask > 0) {
    const r = 1 - Math.abs(fbm(nMountain, x * 0.0011, z * 0.0011, 4, 2.1, 0.5));
    ridges = r * r * r * 260 * mask;
  }
  const detail = nDetail(x * 0.02, z * 0.02) * 1.2;
  let h = hills + ridges + detail + 10;
  // Flatten a soft valley around the origin so the first seconds are calm.
  const d = Math.hypot(x, z);
  if (d < 520) h = lerp(h, 6 + hills * 0.25, (1 - smoothstep(120, 520, d)) * 0.8);
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

export function detailNoise(x, z) {
  return nDetail(x, z);
}

// ---------------------------------------------------------------------------
// Colours (linear RGB, matching three's working colour space)

const srgbToLinear = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
export function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

let PAL = {};
let theme = THEMES.meadow;
let themeKey = 'meadow';

/** Switches the colour palette used for new terrain and vegetation. */
export function setTheme(key) {
  themeKey = THEMES[key] ? key : 'meadow';
  theme = THEMES[themeKey];
  PAL = {};
  for (const [k, v] of Object.entries(theme.ground)) PAL[k] = typeof v === 'string' ? hexToLinear(v) : v;
}
setTheme('meadow');
export const getTheme = () => theme;
export const getThemeKey = () => themeKey;

const mix = (out, c, t) => {
  out[0] += (c[0] - out[0]) * t;
  out[1] += (c[1] - out[1]) * t;
  out[2] += (c[2] - out[2]) * t;
  return out;
};
const set = (out, c) => ((out[0] = c[0]), (out[1] = c[1]), (out[2] = c[2]), out);
const tmp2 = [0, 0, 0];

function colorAt(x, y, z, slope, out) {
  const forest = forestAt(x, z);
  const autumn = autumnAt(x, z);
  const v = nDetail(x * 0.05, z * 0.05) * 0.5 + 0.5;

  mix(set(out, PAL.grassA), PAL.grassB, v);
  mix(out, PAL.forestFloor, forest * 0.6);
  mix(set(tmp2, PAL.autumnA), PAL.autumnB, v);
  mix(out, tmp2, autumn * 0.75);
  mix(out, PAL.meadowGold, smoothstep(0.55, 0.95, v) * (1 - forest) * 0.35);

  if (y < WATER_LEVEL + 2.5) mix(out, PAL.sand, 1 - smoothstep(WATER_LEVEL + 0.5, WATER_LEVEL + 2.5, y));
  if (y < WATER_LEVEL + 0.3) set(out, PAL.wetSand);

  const rocky = smoothstep(0.55, 0.95, slope) + smoothstep(90, 150, y) * 0.8;
  mix(set(tmp2, PAL.rock), PAL.rockDark, v);
  mix(out, tmp2, Math.min(1, rocky));

  const snow = smoothstep(PAL.snowLine, PAL.snowLine + 30, y + v * 15) * (1 - smoothstep(0.9, 1.3, slope));
  return mix(out, PAL.snow, snow);
}

/**
 * Builds a flat-shaded low-poly terrain tile as raw typed arrays (positions,
 * normals and per-face colours), local to the tile's corner. A double-sided
 * skirt on each edge hides cracks between tiles of different detail.
 */
export function buildTerrainArrays(cx, cz, size, segments) {
  const step = size / segments;
  const x0 = cx * size;
  const z0 = cz * size;
  const n = segments + 1;
  const vx = new Float32Array(n * n);
  const vy = new Float32Array(n * n);
  const vz = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const wx = x0 + i * step;
      const wz = z0 + j * step;
      const k = j * n + i;
      const edge = i === 0 || j === 0 || i === segments || j === segments;
      // Jitter interior points (as a pure function of world position) so it
      // doesn't read as a grid.
      const jx = edge ? 0 : nDetail(wx * 0.37, wz * 0.37) * step * 0.3;
      const jz = edge ? 0 : nDetail(wz * 0.37 + 5, wx * 0.37 - 5) * step * 0.3;
      vx[k] = i * step + jx;
      vz[k] = j * step + jz;
      vy[k] = heightAt(x0 + vx[k], z0 + vz[k]);
    }
  }

  const SKIRT = 12;
  const triCount = segments * segments * 2 + segments * 4 * 4;
  const pos = new Float32Array(triCount * 9);
  const nor = new Float32Array(triCount * 9);
  const col = new Float32Array(triCount * 9);
  const c = [0, 0, 0];
  let p = 0;

  // A vertex is (x, y, z) passed as scalars to avoid allocations.
  function tri(ax, ay, az, bx, by, bz, dx, dy, dz, skirt) {
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = dx - ax, e2y = dy - ay, e2z = dz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const mx = (ax + bx + dx) / 3 + x0;
    const my = (ay + by + dy) / 3;
    const mz = (az + bz + dz) / 3 + z0;
    const slope = skirt ? 0.8 : Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(0.05, ny);
    colorAt(mx, my, mz, slope, c);
    pos[p] = ax; pos[p + 1] = ay; pos[p + 2] = az;
    pos[p + 3] = bx; pos[p + 4] = by; pos[p + 5] = bz;
    pos[p + 6] = dx; pos[p + 7] = dy; pos[p + 8] = dz;
    for (let k = 0; k < 9; k += 3) {
      nor[p + k] = nx; nor[p + k + 1] = ny; nor[p + k + 2] = nz;
      col[p + k] = c[0]; col[p + k + 1] = c[1]; col[p + k + 2] = c[2];
    }
    p += 9;
  }

  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
      if ((i + j) & 1) {
        tri(vx[a], vy[a], vz[a], vx[d], vy[d], vz[d], vx[b], vy[b], vz[b]);
        tri(vx[b], vy[b], vz[b], vx[d], vy[d], vz[d], vx[e], vy[e], vz[e]);
      } else {
        tri(vx[a], vy[a], vz[a], vx[d], vy[d], vz[d], vx[e], vy[e], vz[e]);
        tri(vx[a], vy[a], vz[a], vx[e], vy[e], vz[e], vx[b], vy[b], vz[b]);
      }
    }
  }

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
      const a = j0 * n + i0, b = j1 * n + i1;
      const ax = vx[a], ay = vy[a], az = vz[a], bx = vx[b], by = vy[b], bz = vz[b];
      tri(ax, ay, az, bx, by, bz, ax, ay - SKIRT, az, true);
      tri(bx, by, bz, bx, by - SKIRT, bz, ax, ay - SKIRT, az, true);
      tri(ax, ay, az, ax, ay - SKIRT, az, bx, by, bz, true);
      tri(bx, by, bz, ax, ay - SKIRT, az, bx, by - SKIRT, bz, true);
    }
  }

  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    if (pos[i] < minY) minY = pos[i];
    if (pos[i] > maxY) maxY = pos[i];
  }
  return { position: pos, normal: nor, color: col, minY, maxY };
}
