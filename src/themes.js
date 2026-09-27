// World themes. Portals move you between these. Pure data (hex strings) so the
// generation workers can use it too.

export const THEMES = {
  meadow: {
    name: 'Summer Meadows',
    sky: { top: '#3f8fe0', horizon: '#cfe9f5', bottom: '#e9f2e4', stars: 0 },
    sun: { color: '#fff0cf', intensity: 2.6, dir: [-0.55, 0.42, 0.72] },
    hemi: { sky: '#cfe8ff', ground: '#7a9a4a', intensity: 1.35 },
    fog: { near: 0.22, far: 1 },
    water: '#3fb0c4',
    clouds: { color: '#ffffff', emissive: '#dfe9f2' },
    motes: { color: '#ffe9b0', size: 0.45, fall: 0, glow: false },
    exposure: 1.05,
    ground: {
      sand: '#e8d69a', wetSand: '#c9b27a', grassA: '#8fcf4e', grassB: '#6fb83f', meadowGold: '#d8c25a',
      autumnA: '#e0a23a', autumnB: '#d9772c', forestFloor: '#5a9a3a', rock: '#a9ab9b', rockDark: '#8d9183',
      snow: '#f4f6f8', snowLine: 175,
    },
    leaves: {
      summer: ['#7cc444', '#8fd14f', '#69b33b', '#a3d95a'],
      autumn: ['#f2a93b', '#ee7f2d', '#e2512a', '#f5c542', '#d9632b'],
      pine: ['#4f9a4a', '#5aa650', '#3f8a45'],
      grass: ['#9ad65a', '#b4df62', '#86c94a'],
      grassAutumn: ['#e3b04b', '#dd8a3a', '#c9c35a'],
      autumnBias: 0,
    },
  },

  sunset: {
    name: 'Golden Hour',
    sky: { top: '#4d5fae', horizon: '#ffbf86', bottom: '#f6d2ae', stars: 0 },
    sun: { color: '#ffb46a', intensity: 2.4, dir: [-0.7, 0.16, 0.7] },
    hemi: { sky: '#ffd6ae', ground: '#6e6a3a', intensity: 1.15 },
    fog: { near: 0.2, far: 0.95 },
    water: '#4b98b3',
    clouds: { color: '#ffe2c8', emissive: '#f7a987' },
    motes: { color: '#ffd27a', size: 0.5, fall: 0, glow: true },
    exposure: 1.05,
    ground: {
      sand: '#efcf95', wetSand: '#c9a672', grassA: '#a9c94e', grassB: '#8db243', meadowGold: '#e6bf57',
      autumnA: '#e8a13a', autumnB: '#e0702c', forestFloor: '#6f9a3a', rock: '#b3a592', rockDark: '#978a7c',
      snow: '#fbe9dc', snowLine: 175,
    },
    leaves: {
      summer: ['#a3c94a', '#b8d15a', '#8fbf44'],
      autumn: ['#f7b23b', '#f2872d', '#e85a2a', '#f9cf48', '#e36b2b'],
      pine: ['#5d9a4a', '#6aa650', '#4f8a45'],
      grass: ['#b9d65a', '#cfd862', '#a6c94a'],
      grassAutumn: ['#eab04b', '#e58a3a', '#d6c35a'],
      autumnBias: 0.35,
    },
  },

  winter: {
    name: 'Winter Hush',
    sky: { top: '#7fa9d6', horizon: '#e9f1f6', bottom: '#f1f5f7', stars: 0 },
    sun: { color: '#fff7ea', intensity: 2.3, dir: [-0.5, 0.35, 0.78] },
    hemi: { sky: '#e3efff', ground: '#9aa7b0', intensity: 1.5 },
    fog: { near: 0.15, far: 0.85 },
    water: '#8fd0de',
    clouds: { color: '#ffffff', emissive: '#e6eef6' },
    motes: { color: '#ffffff', size: 0.55, fall: 2.2, glow: false },
    exposure: 1.0,
    ground: {
      sand: '#dcd6ca', wetSand: '#b9b3a8', grassA: '#eef3f7', grassB: '#e1e9ef', meadowGold: '#f4f6f8',
      autumnA: '#dfe7ec', autumnB: '#d3dde4', forestFloor: '#cfdbe2', rock: '#9aa1a6', rockDark: '#838b91',
      snow: '#ffffff', snowLine: 40,
    },
    leaves: {
      summer: ['#e9f1f5', '#dde8ee', '#f4f8fa'],
      autumn: ['#cfe0ea', '#e2ecf2'],
      pine: ['#3f7a5a', '#4c8766', '#35704f'],
      grass: ['#dfe7d8', '#e9eee2', '#cfdcc8'],
      grassAutumn: ['#e6e2d0'],
      autumnBias: 0,
    },
  },

  blossom: {
    name: 'Blossom Valley',
    sky: { top: '#6fa8ee', horizon: '#f6e0ee', bottom: '#f3ebf1', stars: 0 },
    sun: { color: '#fff1e6', intensity: 2.5, dir: [-0.45, 0.5, 0.74] },
    hemi: { sky: '#f3ddff', ground: '#7fa05a', intensity: 1.35 },
    fog: { near: 0.22, far: 1 },
    water: '#5fc0cf',
    clouds: { color: '#ffffff', emissive: '#f4dcea' },
    motes: { color: '#ffc3dc', size: 0.6, fall: 0.8, glow: false },
    exposure: 1.05,
    ground: {
      sand: '#ecdcae', wetSand: '#cdb987', grassA: '#9ee06a', grassB: '#84cf55', meadowGold: '#c9e07a',
      autumnA: '#f0b6cf', autumnB: '#e79bbd', forestFloor: '#6cae48', rock: '#b0ada6', rockDark: '#96938d',
      snow: '#faf6f8', snowLine: 175,
    },
    leaves: {
      summer: ['#9ed65a', '#b4e06a', '#86c94a'],
      autumn: ['#f6b3cf', '#f9c9dc', '#ef9bbd', '#fbd9e6', '#e889b0'],
      pine: ['#4f9a4a', '#5aa650', '#3f8a45'],
      grass: ['#a8e06a', '#bce672', '#94d45a'],
      grassAutumn: ['#f1c2d6', '#c9e07a'],
      autumnBias: 0.45,
    },
  },

  twilight: {
    name: 'Firefly Twilight',
    sky: { top: '#0c1638', horizon: '#6a4f8e', bottom: '#2a2c52', stars: 1 },
    sun: { color: '#b9c6ff', intensity: 0.9, dir: [0.4, 0.55, -0.73] },
    hemi: { sky: '#6f7cc2', ground: '#223032', intensity: 0.85 },
    fog: { near: 0.12, far: 0.8 },
    water: '#2d5f86',
    clouds: { color: '#8a8fc0', emissive: '#3d3f6e' },
    motes: { color: '#d8ff7a', size: 0.9, fall: 0, glow: true },
    exposure: 1.1,
    ground: {
      sand: '#c9c09a', wetSand: '#a89f7a', grassA: '#6fae52', grassB: '#5a9a48', meadowGold: '#8fae5a',
      autumnA: '#b88a4a', autumnB: '#a8683a', forestFloor: '#4a8a44', rock: '#9296a8', rockDark: '#7a7e90',
      snow: '#eef0ff', snowLine: 175,
    },
    leaves: {
      summer: ['#6fb04a', '#7cbf55', '#5fa043'],
      autumn: ['#c99a4a', '#b8763a'],
      pine: ['#3f8a55', '#4a965e', '#357a4a'],
      grass: ['#86c05a', '#9ac962', '#76b04a'],
      grassAutumn: ['#b0a04b'],
      autumnBias: 0,
    },
  },

  // The poetry world: pearl and lavender, pale iridescent trees, motes that
  // drift upwards, and a few stars awake in the daylight.
  ethereal: {
    name: 'Dreaming Hours',
    sky: { top: '#a898e0', horizon: '#fde4d8', bottom: '#e6f3ef', stars: 0.45 },
    sun: { color: '#fff1e6', intensity: 1.9, dir: [-0.35, 0.5, 0.8] },
    hemi: { sky: '#f3e8ff', ground: '#cde6df', intensity: 1.7 },
    fog: { near: 0.14, far: 0.85 },
    water: '#c3e4f0',
    clouds: { color: '#ffffff', emissive: '#f4e4ff' },
    motes: { color: '#fff4d6', size: 0.6, fall: -0.7, glow: true },
    exposure: 1.02,
    ground: {
      sand: '#f3e9dc', wetSand: '#dcd0c4', grassA: '#e8e1f6', grassB: '#dbecef', meadowGold: '#f6e6d4',
      autumnA: '#f4d5e4', autumnB: '#e3cdf0', forestFloor: '#d3e5e1', rock: '#c9c2da', rockDark: '#b2adc6',
      snow: '#ffffff', snowLine: 150,
    },
    leaves: {
      summer: ['#f4eeff', '#e4f6f1', '#fdeef5'],
      autumn: ['#f7c9dc', '#d7c7f6', '#c6ecf0', '#ffe2c2'],
      pine: ['#a3cdc4', '#b6d8d1', '#94bccb'],
      grass: ['#e8e0f7', '#d9eef0', '#f5e5ee'],
      grassAutumn: ['#f1d9e7'],
      autumnBias: 0.4,
    },
  },
};

export const THEME_ORDER = Object.keys(THEMES);
/** Worlds an ordinary portal can take you to (the poem world has its own). */
export const PORTAL_THEMES = THEME_ORDER.filter((k) => k !== 'ethereal');
