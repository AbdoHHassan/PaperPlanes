// Converts the Stylized Nature MegaKit glTFs into compact GLBs for the web:
// merges into single-file .glb, dedups, welds, and downsizes textures to WebP.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, flatten, join, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'Stylized Nature MegaKit[Standard]/glTF';
const OUT = 'public/models';

// The kit ships pre-coloured ("_C") and greyscale leaf textures. We use the
// greyscale ones so foliage can be tinted per instance at runtime.
const GREYSCALE = {
  'Leaves_NormalTree_C.png': 'Leaves_NormalTree.png',
  'Leaf_Pine_C.png': 'Leaf_Pine.png',
  'Leaves_TwistedTree_C.png': 'Leaves_TwistedTree.png',
};
const TEXTURES = 'Stylized Nature MegaKit[Standard]/Textures';

const MODELS = [
  'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5',
  'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5',
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
  'Bush_Common', 'Bush_Common_Flowers',
  'Grass_Common_Tall', 'Grass_Wispy_Tall',
  'Flower_3_Group', 'Flower_4_Group',
  'Fern_1', 'Plant_1_Big', 'Mushroom_Common',
];

// Trees also get a lighter "LOD1" mesh for distant instances.
const LOD_MODELS = new Set(MODELS.filter((m) => /Tree|Pine|Bush/.test(m)));

/**
 * Leaf canopies are hundreds of alpha-tested cards. Simplifying them collapses
 * the cards, so instead keep a subset of cards and scale each one up around
 * its centre so the canopy still reads as full from a distance.
 */
function decimateCards(doc, prim, keepRatio, grow) {
  const pos = prim.getAttribute('POSITION');
  const idx = prim.getIndices().getArray();
  const n = pos.getCount();
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let i = 0; i < idx.length; i += 3) {
    parent[find(idx[i])] = find(idx[i + 1]);
    parent[find(idx[i + 1])] = find(idx[i + 2]);
  }
  const roots = [...new Set(Array.from({ length: n }, (_, i) => find(i)))];
  const keep = new Set(roots.filter((_, i) => (i * keepRatio) % 1 < keepRatio));
  // Centroid per kept card.
  const centre = new Map();
  const v = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!keep.has(r)) continue;
    pos.getElement(i, v);
    const c = centre.get(r) ?? [0, 0, 0, 0];
    c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; c[3]++;
    centre.set(r, c);
  }
  const newPos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos.getElement(i, v);
    const c = centre.get(find(i));
    if (c) for (let k = 0; k < 3; k++) v[k] = c[k] / c[3] + (v[k] - c[k] / c[3]) * grow;
    newPos.set(v, i * 3);
  }
  const newIdx = [];
  for (let i = 0; i < idx.length; i += 3) if (keep.has(find(idx[i]))) newIdx.push(idx[i], idx[i + 1], idx[i + 2]);
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(newPos).setBuffer(pos.getBuffer()));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(newIdx)).setBuffer(pos.getBuffer()));
}

/**
 * Bark is flat-shaded with split vertices, which meshopt treats as seams it
 * can't collapse. Weld by position only (normals/UVs don't matter at range),
 * then simplify.
 */
function simplifyBark(doc, prim, ratio) {
  const pos = prim.getAttribute('POSITION');
  const arr = pos.getArray();
  const idx = prim.getIndices().getArray();
  const first = new Map();
  const remap = new Uint32Array(pos.getCount());
  for (let i = 0; i < pos.getCount(); i++) {
    const key = `${arr[i * 3].toFixed(3)},${arr[i * 3 + 1].toFixed(3)},${arr[i * 3 + 2].toFixed(3)}`;
    if (!first.has(key)) first.set(key, i);
    remap[i] = first.get(key);
  }
  const welded = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) welded[i] = remap[idx[i]];
  const target = Math.floor((idx.length * ratio) / 3) * 3;
  const [out] = MeshoptSimplifier.simplifySloppy(welded, new Float32Array(arr), 3, null, target, 0.03);
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(out).setBuffer(pos.getBuffer()));
}

async function addLOD(doc) {
  await MeshoptSimplifier.ready;
  const root = doc.getRoot();
  const src = root.listMeshes()[0];
  const lod = doc.createMesh('LOD1');
  for (const p of src.listPrimitives()) {
    const prim = p.clone();
    lod.addPrimitive(prim);
    if (p.getMaterial().getName().startsWith('Bark')) {
      simplifyBark(doc, prim, 0.2);
    } else {
      decimateCards(doc, prim, 0.4, 1.45);
    }
    compactPrimitive(prim);
  }
  const node = doc.createNode('LOD1').setMesh(lod);
  root.listScenes()[0].addChild(node);
}

fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const name of MODELS) {
  const doc = await io.read(path.join(SRC, `${name}.gltf`));
  // Normal maps add little at flight distance; drop them to save bandwidth.
  for (const mat of doc.getRoot().listMaterials()) mat.setNormalTexture(null);
  for (const tex of doc.getRoot().listTextures()) {
    const grey = GREYSCALE[path.basename(tex.getURI())];
    if (grey) tex.setImage(fs.readFileSync(path.join(TEXTURES, grey))).setURI(grey);
  }
  await doc.transform(
    flatten(),
    join(),
    weld(),
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 82 }),
  );
  if (LOD_MODELS.has(name)) {
    await addLOD(doc);
    await doc.transform(prune());
  }
  const file = path.join(OUT, `${name}.glb`);
  await io.write(file, doc);
  console.log(`${name.padEnd(22)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
