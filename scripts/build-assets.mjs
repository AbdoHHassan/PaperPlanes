// Converts the Stylized Nature MegaKit glTFs into compact GLBs for the web:
// merges into single-file .glb, dedups, welds, and downsizes textures to WebP.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, flatten, join } from '@gltf-transform/functions';
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
  const file = path.join(OUT, `${name}.glb`);
  await io.write(file, doc);
  console.log(`${name.padEnd(22)} ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
}
