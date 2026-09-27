import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads the nature kit models and renders every instance through one
 * BatchedMesh per material, so the whole forest costs a handful of draw calls
 * while still getting per-instance frustum culling.
 */

const ATTRS = ['position', 'normal', 'uv', 'color'];

// How much each material sways in the wind, and whether it flutters.
const WIND = {
  Leaves_NormalTree: { sway: 0.0035, flutter: 0.05 },
  Leaves_Pine: { sway: 0.0025, flutter: 0.02 },
  Leaves_TwistedTree: { sway: 0.012, flutter: 0.04 },
  Bark_NormalTree: { sway: 0.0035, flutter: 0 },
  Leaves: { sway: 0.05, flutter: 0.03 },
  Flowers: { sway: 0.05, flutter: 0.03 },
  Grass: { sway: 0.09, flutter: 0.02 },
  Mushrooms: { sway: 0, flutter: 0 },
  Rocks: { sway: 0, flutter: 0 },
};

export const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 1 },
};

function patchWind(shader, sway, flutter) {
  shader.uniforms.uTime = windUniforms.uTime;
  shader.uniforms.uWindStrength = windUniforms.uWindStrength;
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform float uWindStrength;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        #ifdef USE_BATCHING
          vec3 anchor = batchingMatrix[3].xyz;
        #else
          vec3 anchor = vec3(0.0);
        #endif
        float h = max(position.y, 0.0);
        float ph = anchor.x * 0.043 + anchor.z * 0.057;
        float gust = 0.6 + 0.4 * sin(uTime * 0.35 + anchor.x * 0.004);
        float s = (sin(uTime * 1.4 + ph) + 0.4 * sin(uTime * 2.3 + ph * 1.7)) * gust * uWindStrength;
        transformed.x += s * h * h * ${sway.toFixed(5)};
        transformed.z += s * 0.6 * h * h * ${sway.toFixed(5)};
        float f = sin(uTime * 7.0 + dot(position, vec3(3.1, 2.3, 4.7)) + ph) * ${flutter.toFixed(4)} * uWindStrength;
        transformed += vec3(f, f * 0.5, -f) * step(0.5, h);
      }`,
    );
}

function makeMaterial(src) {
  const name = src.name;
  const w = WIND[name] ?? { sway: 0, flutter: 0 };
  const mat = new THREE.MeshStandardMaterial({
    map: src.map,
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: src.alphaTest > 0 ? 0.35 : 0,
    transparent: false,
  });
  mat.name = name;
  // The rock texture is quite dark next to the bright terrain palette.
  if (name === 'Rocks') mat.color.setScalar(1.45);
  if (mat.map) {
    mat.map.anisotropy = 4;
    mat.map.colorSpace = THREE.SRGBColorSpace;
  }
  let depth = null;
  if (w.sway > 0 || w.flutter > 0) {
    mat.onBeforeCompile = (s) => patchWind(s, w.sway, w.flutter);
    mat.customProgramCacheKey = () => `wind-${name}`;
  }
  if (w.sway > 0 || w.flutter > 0 || mat.alphaTest > 0) {
    depth = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: mat.alphaTest > 0 ? mat.map : null,
      alphaTest: mat.alphaTest,
      side: THREE.DoubleSide,
    });
    depth.onBeforeCompile = (s) => patchWind(s, w.sway, w.flutter);
    depth.customProgramCacheKey = () => `wind-depth-${name}`;
  }
  return { mat, depth };
}

function normaliseGeometry(geo) {
  const g = geo.index ? geo : geo.toNonIndexed();
  for (const key of Object.keys(g.attributes)) {
    if (!ATTRS.includes(key)) g.deleteAttribute(key);
  }
  const count = g.attributes.position.count;
  if (!g.attributes.color) {
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  } else if (g.attributes.color.itemSize === 4 || g.attributes.color.normalized) {
    // Convert to float RGB so all geometries in a batch share one layout.
    const src = g.attributes.color;
    const out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      out[i * 3] = src.getX(i);
      out[i * 3 + 1] = src.getY(i);
      out[i * 3 + 2] = src.getZ(i);
    }
    g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  }
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!g.index) {
    const idx = new Uint32Array(count);
    for (let i = 0; i < count; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}

export class Foliage {
  constructor(scene) {
    this.scene = scene;
    this.models = new Map(); // name -> [{ batchKey, geometryId }]
    this.batches = new Map(); // material name -> BatchedMesh
    this.bounds = new Map(); // name -> Box3
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
  }

  async load(names, baseUrl, capacity, onProgress) {
    const loader = new GLTFLoader();
    const parts = new Map(); // material -> { material, entries: [{name, geo}] }
    let done = 0;
    const gltfs = await Promise.all(
      names.map((n) =>
        loader.loadAsync(`${baseUrl}${n}.glb`).then((g) => {
          onProgress?.(++done / names.length);
          return [n, g];
        }),
      ),
    );

    for (const [name, gltf] of gltfs) {
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3();
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const geo = normaliseGeometry(o.geometry.clone().applyMatrix4(o.matrixWorld));
        box.union(geo.boundingBox ?? (geo.computeBoundingBox(), geo.boundingBox));
        const matName = o.material.name;
        if (!parts.has(matName)) parts.set(matName, { material: o.material, entries: [] });
        parts.get(matName).entries.push({ name, geo });
      });
      this.bounds.set(name, box);
    }

    for (const [matName, { material, entries }] of parts) {
      let verts = 0;
      let idx = 0;
      for (const { geo } of entries) {
        verts += geo.attributes.position.count;
        idx += geo.index.count;
      }
      const { mat, depth } = makeMaterial(material);
      const maxInstances = capacity(matName);
      const batch = new THREE.BatchedMesh(maxInstances, verts, idx, mat);
      batch.name = matName;
      batch.sortObjects = false;
      batch.frustumCulled = false;
      batch.castShadow = !['Grass', 'Flowers', 'Leaves', 'Mushrooms'].includes(matName);
      batch.receiveShadow = true;
      if (depth) batch.customDepthMaterial = depth;
      for (const { name, geo } of entries) {
        const id = batch.addGeometry(geo);
        if (!this.models.has(name)) this.models.set(name, []);
        this.models.get(name).push({ batch, id });
      }
      this.batches.set(matName, batch);
      this.scene.add(batch);
    }
  }

  /** Adds one model instance. `tint` applies to leaves/foliage only. */
  add(name, position, rotY, scale, tint) {
    const parts = this.models.get(name);
    if (!parts) return null;
    const m = this._m.compose(
      position,
      new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotY),
      new THREE.Vector3(scale, scale, scale),
    );
    const handle = [];
    for (const { batch, id } of parts) {
      if (batch.instanceCount >= batch.maxInstanceCount) continue;
      const inst = batch.addInstance(id);
      batch.setMatrixAt(inst, m);
      const tintable = batch.name.startsWith('Leaves') || batch.name === 'Grass';
      batch.setColorAt(inst, tintable && tint ? tint : this._c.setRGB(1, 1, 1));
      handle.push(batch, inst);
    }
    return handle;
  }

  remove(handle) {
    if (!handle) return;
    for (let i = 0; i < handle.length; i += 2) handle[i].deleteInstance(handle[i + 1]);
  }
}
