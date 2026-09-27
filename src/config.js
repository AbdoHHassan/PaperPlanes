// Quality tier. Phones/tablets (or ?low in the URL) get a lighter world.
const params = new URLSearchParams(location.search);
export const LOW_QUALITY =
  params.has('low') || (!params.has('high') && window.matchMedia('(pointer: coarse)').matches);

export const QUALITY = LOW_QUALITY
  ? { viewRadius: 4, treeRadius: 3, detailRadius: 1, treeCell: 16, shadowMap: 1024, maxPixelRatio: 1.5, fogFar: 700 }
  : { viewRadius: 6, treeRadius: 4, detailRadius: 1, treeCell: 14, shadowMap: 2048, maxPixelRatio: 2, fogFar: 1000 };
