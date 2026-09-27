import * as THREE from 'three';
import { heightAt, forestAt, WATER_LEVEL } from './terrain.js';
import { POS_COLORS } from './words.js';
import { SOFT_SPRITE } from './effects.js';

const TILE_H = 7; // metres; big enough to read from a distance
const texCache = new Map();

/** A fridge-magnet tile: off-white strip, serif word, a hint of colour for its part of speech. */
export function tileTexture(word) {
  const key = `${word.w}|${word.pos}`;
  if (texCache.has(key)) return texCache.get(key);
  const font = '600 96px Fraunces, Georgia, "Times New Roman", serif';
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = font;
  const label = word.pos === 'break' ? '↵' : word.w;
  const tw = Math.ceil(g.measureText(label).width);
  const pad = 46;
  c.width = tw + pad * 2;
  c.height = 176;
  const ctx = c.getContext('2d');
  // Slightly uneven strip, like a hand-cut magnet.
  ctx.fillStyle = 'rgba(40, 30, 60, 0.25)';
  roundRect(ctx, 8, 12, c.width - 12, c.height - 16, 10);
  ctx.fill();
  ctx.fillStyle = word.pos === 'break' ? '#2a2540' : '#fbf8f1';
  roundRect(ctx, 4, 6, c.width - 12, c.height - 18, 10);
  ctx.fill();
  ctx.fillStyle = POS_COLORS[word.pos] ?? '#ddd';
  ctx.fillRect(pad * 0.6, c.height - 34, c.width - pad * 1.2 - 8, 5);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = word.pos === 'break' ? '#fbf8f1' : '#1d1a26';
  ctx.fillText(label, (c.width - 8) / 2, c.height / 2 - 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const out = { tex, aspect: c.width / c.height };
  texCache.set(key, out);
  return out;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Builds a floating word tile (front and back both readable) with a soft halo. */
export function makeTile(word, scale = 1) {
  const { tex, aspect } = tileTexture(word);
  const h = TILE_H * scale;
  const w = h * aspect;
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, toneMapped: false });
  const geo = new THREE.PlaneGeometry(w, h);
  const front = new THREE.Mesh(geo, mat);
  const back = new THREE.Mesh(geo, mat);
  back.rotation.y = Math.PI;
  group.add(front, back);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: SOFT_SPRITE, color: POS_COLORS[word.pos] ?? '#fff', transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  halo.scale.set(w * 1.6, h * 2.6, 1);
  group.add(halo);
  // Halo first, then the tile over it, whichever side you see it from.
  halo.renderOrder = 1;
  front.renderOrder = back.renderOrder = 2;
  group.userData = { word, width: w, height: h, halo };
  return group;
}

/**
 * Word constellations for the poem world: small clusters of tiles that drift
 * ahead of the player. Steer through one to catch it.
 */
export class WordTiles {
  constructor(scene) {
    this.scene = scene;
    this.clusters = [];
    this.time = 0;
    this._v = new THREE.Vector3();
    this.enabled = false;
  }

  clear() {
    for (const c of this.clusters) for (const t of c.tiles) this.scene.remove(t.group);
    this.clusters = [];
  }

  /** Places a cluster ~`ahead` metres in front of the plane, spread sideways. */
  spawn(plane, words, ahead = 230) {
    const f = plane.camForward;
    const fx = f.x, fz = f.z;
    const fl = Math.hypot(fx, fz) || 1;
    const dir = new THREE.Vector3(fx / fl, 0, fz / fl);
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const center = plane.position.clone().addScaledVector(dir, ahead);
    const n = words.length;
    const tiles = words.map((word, i) => {
      const group = makeTile(word);
      const spread = (i - (n - 1) / 2) * 24 + (Math.random() - 0.5) * 6;
      const p = center.clone().addScaledVector(side, spread).addScaledVector(dir, (Math.random() - 0.5) * 30);
      // Stay near the player's height, but always clear of hills and trees.
      const ground = Math.max(heightAt(p.x, p.z), WATER_LEVEL);
      const floor = ground + (ground > WATER_LEVEL + 2 ? forestAt(p.x, p.z) * 22 : 0) + 12;
      p.y = Math.max(floor, plane.position.y + (Math.random() - 0.5) * 16);
      group.position.copy(p);
      group.scale.setScalar(0.01);
      this.scene.add(group);
      return { group, word, base: p.clone(), phase: Math.random() * 10, born: this.time, state: 'live', fade: 0 };
    });
    const cluster = { tiles, center, dir, born: this.time };
    this.clusters.push(cluster);
    return cluster;
  }

  /** Nearest live cluster that's still in front of the plane. */
  aheadCluster(plane) {
    let best = null;
    let bestD = Infinity;
    for (const c of this.clusters) {
      if (c.done) continue;
      const live = c.tiles.filter((t) => t.state === 'live');
      if (!live.length) continue;
      for (const t of live) {
        this._v.subVectors(t.group.position, plane.position);
        if (this._v.dot(plane.camForward) < -10) continue;
        const d = this._v.length();
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  }

  /** Animates tiles; returns { tile, cluster } for any word flown through. */
  update(dt, plane, camera) {
    this.time += dt;
    let caught = null;
    for (const c of this.clusters) {
      for (const t of c.tiles) {
        const g = t.group;
        const age = this.time - t.born;
        if (t.state === 'live') {
          // Unfold into place, then bob gently.
          const grow = Math.min(1, age / 1.2);
          g.scale.setScalar(0.01 + 0.99 * (1 - (1 - grow) ** 3));
          g.position.set(
            t.base.x + Math.sin(this.time * 0.4 + t.phase) * 1.2,
            t.base.y + Math.sin(this.time * 0.7 + t.phase) * 1.5,
            t.base.z,
          );
          // Turn to face the player so the word can be read.
          this._v.set(camera.position.x, g.position.y, camera.position.z);
          g.lookAt(this._v);
          g.rotateZ(Math.sin(this.time * 0.5 + t.phase) * 0.06);

          // Caught: flew close enough to the tile's centre.
          const { width, height } = g.userData;
          this._v.subVectors(plane.position, g.position);
          const lateral = Math.hypot(this._v.x, this._v.z);
          if (!caught && lateral < width * 0.5 + 3 && Math.abs(this._v.y) < height * 0.5 + 3.5) {
            t.state = 'caught';
            t.fade = 0;
            caught = { tile: t, cluster: c };
            c.done = true;
            // The words not chosen drift up and away.
            for (const o of c.tiles) if (o !== t && o.state === 'live') o.state = 'drift';
          }
          // Left behind: let it go.
          this._v.subVectors(g.position, plane.position);
          if (this._v.dot(plane.camForward) < -40 || this._v.length() > 900) t.state = 'drift';
        } else {
          t.fade += dt;
          const k = t.fade / (t.state === 'caught' ? 0.6 : 2.2);
          if (t.state === 'caught') {
            g.position.lerp(plane.position, Math.min(1, k * 0.5));
            g.scale.setScalar(Math.max(0.01, 1 - k));
          } else {
            g.position.y += dt * 6;
            g.scale.setScalar(Math.max(0.01, 1 - k));
            g.userData.halo.material.opacity = 0.55 * (1 - k);
          }
          if (k >= 1) t.state = 'gone';
        }
      }
      if (c.tiles.every((t) => t.state !== 'live')) c.done = true;
    }
    // Clean up finished clusters.
    this.clusters = this.clusters.filter((c) => {
      const gone = c.tiles.every((t) => t.state === 'gone');
      if (gone) for (const t of c.tiles) {
        this.scene.remove(t.group);
        t.group.userData.halo.material.dispose();
        t.group.children[0].material.dispose();
      }
      return !gone;
    });
    return caught;
  }
}
