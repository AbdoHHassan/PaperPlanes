// Deterministic placement of trees, rocks and ground cover for one chunk.
// Pure JS (no three.js) so it runs inside the generation workers.
import { heightAt, slopeAt, forestAt, autumnAt, hexToLinear, getSeed, WATER_LEVEL } from './terrain.js';
import { mulberry32, hash2, smoothstep } from './noise.js';

export const CHUNK = 160;

const TREES_BROADLEAF = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5'];
const TREES_PINE = ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5'];
const ROCKS = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'];
const BUSHES = ['Bush_Common', 'Bush_Common_Flowers'];
const GRASS = ['Grass_Common_Tall', 'Grass_Wispy_Tall'];
const FLOWERS = ['Flower_3_Group', 'Flower_4_Group'];
const PLANTS = ['Fern_1', 'Plant_1_Big'];

export const MODEL_NAMES = [
  ...TREES_BROADLEAF, ...TREES_PINE, ...ROCKS, ...BUSHES, ...GRASS, ...FLOWERS, ...PLANTS, 'Mushroom_Common',
];
const ID = Object.fromEntries(MODEL_NAMES.map((n, i) => [n, i]));

const pal = (list) => list.map(hexToLinear);
const LEAF_SUMMER = pal(['#7cc444', '#8fd14f', '#69b33b', '#a3d95a']);
const LEAF_AUTUMN = pal(['#f2a93b', '#ee7f2d', '#e2512a', '#f5c542', '#d9632b']);
const PINE = pal(['#4f9a4a', '#5aa650', '#3f8a45']);
const GRASS_TINT = pal(['#9ad65a', '#b4df62', '#86c94a']);
const GRASS_AUTUMN = pal(['#e3b04b', '#dd8a3a', '#c9c35a']);
const WHITE = [1, 1, 1];

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

/** Each instance: [modelId, x, y, z, rotY, scale, r, g, b] */
export const STRIDE = 9;

function writer() {
  const out = [];
  return {
    out,
    push(name, x, y, z, rot, s, tint) {
      out.push(ID[name], x, y, z, rot, s, tint[0], tint[1], tint[2]);
    },
  };
}

export function scatterTrees(cx, cz, cell) {
  const r = mulberry32(hash2(cx, cz, 1 + getSeed() * 31));
  const w = writer();
  const n = Math.ceil(CHUNK / cell);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = cx * CHUNK + Math.min(CHUNK - 0.01, (i + r()) * cell);
      const z = cz * CHUNK + Math.min(CHUNK - 0.01, (j + r()) * cell);
      const roll = r();
      const h = heightAt(x, z);
      if (h < WATER_LEVEL + 2) continue;
      const forest = forestAt(x, z);
      const slope = slopeAt(x, z);
      const alpine = smoothstep(55, 120, h);
      const treeLine = 1 - smoothstep(150, 180, h);
      const density = (0.03 + forest * 0.75) * treeLine * (1 - smoothstep(0.6, 1.0, slope));
      if (roll < density) {
        const autumn = autumnAt(x, z);
        if (r() < 0.15 + alpine * 0.8) {
          w.push(pick(TREES_PINE, r), x, h - 0.4, z, r() * 6.283, 2.3 + r() * 1.4, pick(PINE, r));
        } else {
          const tint = r() < autumn ? pick(LEAF_AUTUMN, r) : pick(LEAF_SUMMER, r);
          w.push(pick(TREES_BROADLEAF, r), x, h - 0.4, z, r() * 6.283, 2.2 + r() * 1.3, tint);
        }
      } else if (roll < density + 0.05 + slope * 0.1) {
        // Rocks become more common on steep ground.
        const s = Math.min(slope, 1);
        if (r() < 0.25 + s * 0.3) {
          if (slope > 1.3) continue; // would hang off cliffs
          const rs = 1.5 + r() * 3 + s * 1.5;
          w.push(pick(ROCKS, r), x, h - 0.3 * rs - slope * 1.5, z, r() * 6.283, rs, WHITE);
        } else if (h < 120) {
          const tint = r() < autumnAt(x, z) ? pick(LEAF_AUTUMN, r) : pick(LEAF_SUMMER, r);
          w.push(pick(BUSHES, r), x, h - 0.4, z, r() * 6.283, 2 + r() * 1.5, tint);
        }
      }
    }
  }
  return new Float32Array(w.out);
}

export function scatterDetails(cx, cz, cell = 7) {
  const r = mulberry32(hash2(cx, cz, 2 + getSeed() * 31));
  const w = writer();
  const n = Math.ceil(CHUNK / cell);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = cx * CHUNK + Math.min(CHUNK - 0.01, (i + r()) * cell);
      const z = cz * CHUNK + Math.min(CHUNK - 0.01, (j + r()) * cell);
      const roll = r();
      if (roll > 0.55) continue;
      const h = heightAt(x, z);
      if (h < WATER_LEVEL + 1.2 || h > 140) continue;
      const forest = forestAt(x, z);
      const autumn = autumnAt(x, z);
      const k = r();
      const rot = r() * 6.283;
      const s = 1.6 + r() * 1.2;
      if (k < 0.55) {
        const tint = r() < autumn * 0.8 ? pick(GRASS_AUTUMN, r) : pick(GRASS_TINT, r);
        w.push(pick(GRASS, r), x, h - 0.1, z, rot, s, tint);
      } else if (k < 0.8 - forest * 0.3) {
        w.push(pick(FLOWERS, r), x, h - 0.1, z, rot, s, WHITE);
      } else if (k < 0.95) {
        w.push(pick(PLANTS, r), x, h - 0.1, z, rot, 1.5 + r(), WHITE);
      } else {
        w.push('Mushroom_Common', x, h - 0.1, z, rot, 1.2 + r() * 0.8, WHITE);
      }
    }
  }
  return new Float32Array(w.out);
}
