// Trees as soft obstacles: a spatial hash of canopies so the plane can brush
// through leaves (and lose some flow) or skim past for a "Close!" bonus.

const CELL = 16;
const TREE_DIMS = {
  // height (m per unit scale), canopy radius, where the canopy starts
  CommonTree: { h: 6.4, r: 1.35, base: 2.0 },
  Pine: { h: 6.7, r: 1.35, base: 1.4 },
};

export class Obstacles {
  constructor() {
    this.cells = new Map();
  }

  key(x, z) {
    return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  }

  /** Registers a tree; returns an entry to pass to remove(). Non-trees: null. */
  addTree(name, x, y, z, scale, tint) {
    const kind = name.startsWith('Pine') ? 'Pine' : name.startsWith('CommonTree') ? 'CommonTree' : null;
    if (!kind) return null;
    const d = TREE_DIMS[kind];
    const e = {
      x, z,
      bottom: y + d.base * scale,
      top: y + d.h * scale,
      r: d.r * scale,
      tint,
      key: this.key(x, z),
      lastNear: -99,
      lastBrush: -99,
    };
    let list = this.cells.get(e.key);
    if (!list) this.cells.set(e.key, (list = []));
    list.push(e);
    return e;
  }

  remove(e) {
    const list = this.cells.get(e.key);
    if (!list) return;
    const i = list.indexOf(e);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) this.cells.delete(e.key);
  }

  clear() {
    this.cells.clear();
  }

  /**
   * Checks the plane against nearby canopies. Returns { brush, near } where
   * each is a tree entry (or null): brush = flew through leaves, near = a
   * close pass alongside or just over the top.
   */
  check(pos, time) {
    const cx = Math.floor(pos.x / CELL);
    const cz = Math.floor(pos.z / CELL);
    let brush = null;
    let near = null;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = this.cells.get(`${cx + dx},${cz + dz}`);
        if (!list) continue;
        for (const e of list) {
          if (pos.y > e.top + 3 || pos.y < e.bottom - 2) continue;
          const d = Math.hypot(pos.x - e.x, pos.z - e.z);
          // Canopies are rounded: narrower towards the top.
          const shape = 1 - Math.max(0, (pos.y - (e.top - e.r)) / (e.r * 1.6));
          const r = e.r * Math.max(0.25, shape);
          if (d < r + 0.6 && pos.y < e.top) {
            if (time - e.lastBrush > 0.8) {
              e.lastBrush = time;
              brush = e;
            }
          } else if (d < r + 6 && time - e.lastNear > 3 && time - e.lastBrush > 3) {
            e.lastNear = time;
            near = e;
          }
        }
      }
    }
    // A brush cancels a near-miss on the same pass.
    return { brush, near: brush ? null : near };
  }
}
