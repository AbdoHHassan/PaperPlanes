import * as THREE from 'three';
import { buildTerrainGeometry, heightAt, slopeAt, forestAt, autumnAt, WATER_LEVEL } from './terrain.js';
import { mulberry32, hash2, smoothstep } from './noise.js';
import { QUALITY } from './config.js';

export const CHUNK = 160;
const VIEW_RADIUS = QUALITY.viewRadius; // terrain chunks
const TREE_RADIUS = QUALITY.treeRadius; // trees and rocks
const DETAIL_RADIUS = QUALITY.detailRadius; // grass, flowers, mushrooms

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

const LEAF_SUMMER = ['#7cc444', '#8fd14f', '#69b33b', '#a3d95a'].map((c) => new THREE.Color(c));
const LEAF_AUTUMN = ['#f2a93b', '#ee7f2d', '#e2512a', '#f5c542', '#d9632b'].map((c) => new THREE.Color(c));
const PINE = ['#4f9a4a', '#5aa650', '#3f8a45'].map((c) => new THREE.Color(c));
const GRASS_TINT = ['#9ad65a', '#b4df62', '#86c94a'].map((c) => new THREE.Color(c));
const GRASS_AUTUMN = ['#e3b04b', '#dd8a3a', '#c9c35a'].map((c) => new THREE.Color(c));

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

export class World {
  constructor(scene, foliage, rings) {
    this.scene = scene;
    this.foliage = foliage;
    this.rings = rings;
    this.chunks = new Map();
    this.queue = [];
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
      metalness: 0,
    });
    this.group = new THREE.Group();
    scene.add(this.group);
    this._center = { x: NaN, z: NaN };
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  /** Returns true while there's still work queued. */
  update(pos, budgetMs = 5, force = false) {
    const cx = Math.floor(pos.x / CHUNK);
    const cz = Math.floor(pos.z / CHUNK);
    if (cx !== this._center.x || cz !== this._center.z) {
      this._center = { x: cx, z: cz };
      this._plan(cx, cz);
    }
    const t0 = performance.now();
    while (this.queue.length && (force || performance.now() - t0 < budgetMs)) {
      const job = this.queue.shift();
      job();
    }
    return this.queue.length > 0;
  }

  _plan(cx, cz) {
    const wanted = new Map();
    for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
      for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > VIEW_RADIUS + 0.5) continue;
        wanted.set(this.key(cx + dx, cz + dz), { cx: cx + dx, cz: cz + dz, d, dist: Math.max(Math.abs(dx), Math.abs(dz)) });
      }
    }
    // Unload chunks that are out of range.
    for (const [k, ch] of this.chunks) {
      if (!wanted.has(k)) this._unload(ch);
    }
    const jobs = [];
    for (const [k, w] of wanted) {
      let ch = this.chunks.get(k);
      if (!ch) {
        ch = { key: k, cx: w.cx, cz: w.cz, mesh: null, lod: -1, trees: null, details: null, rings: null };
        this.chunks.set(k, ch);
      }
      const lod = w.dist <= 2 ? 0 : w.dist <= 3 ? 1 : 2;
      if (ch.lod !== lod) jobs.push({ d: w.d, fn: () => this._buildTerrain(ch, lod) });
      const wantTrees = w.dist <= TREE_RADIUS;
      if (wantTrees && !ch.trees) jobs.push({ d: w.d + 0.1, fn: () => this._spawnTrees(ch) });
      if (!wantTrees && ch.trees) jobs.push({ d: w.d, fn: () => this._despawn(ch, 'trees') });
      const wantDetail = w.dist <= DETAIL_RADIUS;
      if (wantDetail && !ch.details) jobs.push({ d: w.d + 0.2, fn: () => this._spawnDetails(ch) });
      if (!wantDetail && ch.details) jobs.push({ d: w.d, fn: () => this._despawn(ch, 'details') });
      if (w.dist <= 3 && !ch.rings) jobs.push({ d: w.d + 0.3, fn: () => (ch.rings = this.rings.spawnForChunk(ch.cx, ch.cz)) });
    }
    jobs.sort((a, b) => a.d - b.d);
    this.queue = jobs.map((j) => j.fn);
  }

  _unload(ch) {
    if (ch.mesh) {
      this.group.remove(ch.mesh);
      ch.mesh.geometry.dispose();
    }
    this._despawn(ch, 'trees');
    this._despawn(ch, 'details');
    if (ch.rings) this.rings.removeChunk(ch.rings);
    this.chunks.delete(ch.key);
    ch.dead = true;
  }

  _despawn(ch, kind) {
    if (!ch[kind]) return;
    for (const h of ch[kind]) this.foliage.remove(h);
    ch[kind] = null;
  }

  _buildTerrain(ch, lod) {
    if (ch.dead) return;
    const seg = [32, 16, 8][lod];
    const geo = buildTerrainGeometry(ch.cx, ch.cz, CHUNK, seg);
    if (!ch.mesh) {
      ch.mesh = new THREE.Mesh(geo, this.terrainMaterial);
      ch.mesh.position.set(ch.cx * CHUNK, 0, ch.cz * CHUNK);
      ch.mesh.receiveShadow = true;
      ch.mesh.matrixAutoUpdate = false;
      ch.mesh.updateMatrix();
      this.group.add(ch.mesh);
    } else {
      ch.mesh.geometry.dispose();
      ch.mesh.geometry = geo;
    }
    ch.lod = lod;
  }

  _spawnTrees(ch) {
    if (ch.dead) return;
    const r = mulberry32(hash2(ch.cx, ch.cz, 1));
    const out = [];
    const cell = QUALITY.treeCell;
    const n = CHUNK / cell;
    const p = new THREE.Vector3();
    const tint = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = ch.cx * CHUNK + (i + r()) * cell;
        const z = ch.cz * CHUNK + (j + r()) * cell;
        const roll = r();
        const forest = forestAt(x, z);
        const h = heightAt(x, z);
        if (h < WATER_LEVEL + 2) continue;
        const slope = slopeAt(x, z);
        const alpine = smoothstep(55, 120, h);
        const treeLine = 1 - smoothstep(150, 180, h);
        const density = (0.03 + forest * 0.75) * treeLine * (1 - smoothstep(0.6, 1.0, slope));
        p.set(x, h - 0.4, z);
        if (roll < density) {
          const pine = r() < 0.15 + alpine * 0.8;
          const autumn = autumnAt(x, z);
          let name, s;
          if (pine) {
            name = pick(TREES_PINE, r);
            tint.copy(pick(PINE, r));
            s = 2.3 + r() * 1.4;
          } else {
            name = pick(TREES_BROADLEAF, r);
            tint.copy(r() < autumn ? pick(LEAF_AUTUMN, r) : pick(LEAF_SUMMER, r));
            s = 2.2 + r() * 1.3;
          }
          out.push(this.foliage.add(name, p, r() * Math.PI * 2, s, tint));
        } else if (roll < density + 0.05 + slope * 0.1) {
          // Rocks become more common on steep ground.
          if (r() < 0.25 + Math.min(slope, 1) * 0.3) {
            out.push(this.foliage.add(pick(ROCKS, r), p.setY(h - 0.8), r() * Math.PI * 2, 1.5 + r() * 3 + Math.min(slope, 1) * 1.5));
          } else if (h < 120) {
            const autumn = autumnAt(x, z);
            tint.copy(r() < autumn ? pick(LEAF_AUTUMN, r) : pick(LEAF_SUMMER, r));
            out.push(this.foliage.add(pick(BUSHES, r), p, r() * Math.PI * 2, 2 + r() * 1.5, tint));
          }
        }
      }
    }
    ch.trees = out.filter(Boolean);
  }

  _spawnDetails(ch) {
    if (ch.dead) return;
    const r = mulberry32(hash2(ch.cx, ch.cz, 2));
    const out = [];
    const cell = 7;
    const n = CHUNK / cell;
    const p = new THREE.Vector3();
    const tint = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = ch.cx * CHUNK + (i + r()) * cell;
        const z = ch.cz * CHUNK + (j + r()) * cell;
        const roll = r();
        const h = heightAt(x, z);
        if (h < WATER_LEVEL + 1.2 || h > 140) continue;
        if (roll > 0.55) continue;
        const forest = forestAt(x, z);
        const autumn = autumnAt(x, z);
        p.set(x, h - 0.1, z);
        const k = r();
        let name, s = 1.6 + r() * 1.2;
        if (k < 0.55) {
          name = pick(GRASS, r);
          tint.copy(r() < autumn * 0.8 ? pick(GRASS_AUTUMN, r) : pick(GRASS_TINT, r));
        } else if (k < 0.8 - forest * 0.3) {
          name = pick(FLOWERS, r);
        } else if (k < 0.95) {
          name = pick(PLANTS, r);
          s = 1.5 + r();
        } else {
          name = 'Mushroom_Common';
          s = 1.2 + r() * 0.8;
        }
        out.push(this.foliage.add(name, p, r() * Math.PI * 2, s, tint));
      }
    }
    ch.details = out.filter(Boolean);
  }
}
