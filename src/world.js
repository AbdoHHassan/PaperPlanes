import * as THREE from 'three';
import { QUALITY } from './config.js';
import { CHUNK, MODEL_NAMES, STRIDE } from './scatter.js';

export { CHUNK, MODEL_NAMES };

const VIEW_RADIUS = QUALITY.viewRadius; // terrain chunks
const TREE_RADIUS = QUALITY.treeRadius; // trees and rocks
const DETAIL_RADIUS = QUALITY.detailRadius; // grass, flowers, mushrooms
const SEGMENTS = [32, 16, 8]; // terrain detail by distance ring

/**
 * Streams the world around the player. All the heavy lifting (terrain meshes,
 * vegetation placement) happens in a pool of workers; the main thread only
 * uploads finished tiles and adds instances in small per-frame slices, so
 * flying never hitches while new land appears.
 */
export class World {
  constructor(scene, foliage, rings) {
    this.scene = scene;
    this.foliage = foliage;
    this.rings = rings;
    this.chunks = new Map();
    this.jobs = []; // not yet sent to a worker
    this.applyQueue = []; // finished scatter results waiting to be instanced
    this.nextId = 1;
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
      metalness: 0,
    });
    this.group = new THREE.Group();
    scene.add(this.group);
    this._center = { x: NaN, z: NaN };

    const n = THREE.MathUtils.clamp((navigator.hardwareConcurrency || 4) - 1, 1, 4);
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./gen.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this._onResult(w, e.data);
      w.inflight = 0;
      this.workers.push(w);
    }
  }

  setSeed(seed) {
    for (const ch of [...this.chunks.values()]) this._unload(ch);
    this.jobs = [];
    this.applyQueue = [];
    this._center = { x: NaN, z: NaN };
    for (const w of this.workers) w.postMessage({ type: 'seed', seed });
  }

  get busy() {
    return this.jobs.length + this.applyQueue.length + this.workers.reduce((a, w) => a + w.inflight, 0);
  }

  /** True once everything within `radius` chunks of the player is built. */
  readyAround(pos, radius) {
    const cx = Math.floor(pos.x / CHUNK);
    const cz = Math.floor(pos.z / CHUNK);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const ch = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!ch || !ch.mesh || ch.treesState !== 'done') return false;
      }
    }
    return true;
  }

  update(pos, instanceBudget = 250, timeBudgetMs = 1.5) {
    const cx = Math.floor(pos.x / CHUNK);
    const cz = Math.floor(pos.z / CHUNK);
    if (cx !== this._center.x || cz !== this._center.z) {
      this._center = { x: cx, z: cz };
      this._plan(cx, cz);
    }
    this._dispatch();
    this._apply(instanceBudget, performance.now() + timeBudgetMs);
  }

  _plan(cx, cz) {
    const wanted = new Set();
    const jobs = [];
    for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
      for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > VIEW_RADIUS + 0.5) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        const key = `${cx + dx},${cz + dz}`;
        wanted.add(key);
        let ch = this.chunks.get(key);
        if (!ch) {
          ch = { key, cx: cx + dx, cz: cz + dz, mesh: null, segments: 0, trees: [], details: [], rings: null };
          ch.treesState = ch.detailsState = 'none';
          this.chunks.set(key, ch);
        }
        // Anything carrying trees gets enough detail that they sit on the ground.
        ch.wantSegments = SEGMENTS[ring <= 2 ? 0 : ring <= TREE_RADIUS ? 1 : 2];
        if (ch.segments !== ch.wantSegments && ch.pendingSegments !== ch.wantSegments) {
          ch.pendingSegments = ch.wantSegments;
          jobs.push({ d, ch, kind: 'terrain', segments: ch.wantSegments });
        }
        ch.wantTrees = ring <= TREE_RADIUS;
        if (ch.wantTrees && ch.treesState === 'none') {
          ch.treesState = 'pending';
          jobs.push({ d: d + 0.2, ch, kind: 'trees', cell: QUALITY.treeCell });
        } else if (!ch.wantTrees && ch.treesState !== 'none') this._despawn(ch, 'trees');
        ch.wantDetails = ring <= DETAIL_RADIUS;
        if (ch.wantDetails && ch.detailsState === 'none') {
          ch.detailsState = 'pending';
          jobs.push({ d: d + 0.4, ch, kind: 'details' });
        } else if (!ch.wantDetails && ch.detailsState !== 'none') this._despawn(ch, 'details');
        if (ring <= 3 && !ch.rings) ch.rings = this.rings.spawnForChunk(ch.cx, ch.cz);
      }
    }
    for (const [k, ch] of this.chunks) if (!wanted.has(k)) this._unload(ch);
    // Re-prioritise everything still waiting by distance from the new centre.
    for (const j of this.jobs) {
      if (j.kind === 'terrain' && j.segments !== j.ch.wantSegments) continue;
      if (!j.ch.dead) jobs.push({ ...j, d: Math.hypot(j.ch.cx - cx, j.ch.cz - cz) + (j.kind === 'terrain' ? 0 : 0.3) });
    }
    jobs.sort((a, b) => a.d - b.d);
    this.jobs = jobs;
  }

  _dispatch() {
    while (this.jobs.length) {
      let w = this.workers[0];
      for (const x of this.workers) if (x.inflight < w.inflight) w = x;
      if (w.inflight >= 2) return;
      const j = this.jobs.shift();
      if (j.ch.dead) continue;
      if (j.kind === 'trees' && !j.ch.wantTrees) continue;
      if (j.kind === 'details' && !j.ch.wantDetails) continue;
      w.inflight++;
      w.postMessage({ id: this.nextId++, kind: j.kind, cx: j.ch.cx, cz: j.ch.cz, segments: j.segments, cell: j.cell });
    }
  }

  _onResult(worker, res) {
    worker.inflight--;
    const ch = this.chunks.get(`${res.cx},${res.cz}`);
    if (!ch || ch.dead) return;
    if (res.kind === 'terrain') {
      if (res.segments !== ch.wantSegments) return;
      this._setTerrain(ch, res);
      ch.pendingSegments = 0;
    } else if (res.kind === 'trees' && ch.treesState === 'pending') {
      ch.treesState = 'applying';
      this.applyQueue.push({ ch, kind: 'trees', items: res.items, i: 0 });
    } else if (res.kind === 'details' && ch.detailsState === 'pending') {
      ch.detailsState = 'applying';
      this.applyQueue.push({ ch, kind: 'details', items: res.items, i: 0 });
    }
  }

  _setTerrain(ch, t) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(t.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(t.normal, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(t.color, 3));
    // Bounds are known up-front; no need to walk the vertices again.
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, t.minY, 0), new THREE.Vector3(CHUNK, t.maxY, CHUNK));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
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
    ch.segments = t.segments;
  }

  _apply(budget, deadline) {
    // Nearest chunks first, a slice per frame.
    while (budget > 0 && this.applyQueue.length) {
      const job = this.applyQueue[0];
      const { ch, kind, items } = job;
      if (ch.dead || ch[`${kind}State`] !== 'applying') {
        this.applyQueue.shift();
        continue;
      }
      const list = ch[kind];
      while (job.i < items.length && budget > 0) {
        const o = job.i;
        const h = this.foliage.add(
          MODEL_NAMES[items[o]], items[o + 1], items[o + 2], items[o + 3], items[o + 4], items[o + 5],
          items[o + 6], items[o + 7], items[o + 8],
        );
        if (h) list.push(h);
        job.i += STRIDE;
        // Check the clock every few instances; stop once this frame's slice is used.
        if (--budget % 16 === 0 && performance.now() > deadline) budget = 0;
      }
      if (job.i >= items.length) {
        ch[`${kind}State`] = 'done';
        this.applyQueue.shift();
      }
    }
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
    for (const h of ch[kind]) this.foliage.remove(h);
    ch[kind] = [];
    ch[`${kind}State`] = 'none';
  }
}
