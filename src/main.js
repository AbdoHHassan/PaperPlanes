import * as THREE from 'three';
import { Foliage, windUniforms } from './foliage.js';
import { World, MODEL_NAMES } from './world.js';
import { heightAt, setSeed, setTheme, WATER_LEVEL } from './terrain.js';
import { PaperPlane } from './plane.js';
import { SKY, createSky, Clouds, createWater, applySkyTheme } from './sky.js';
import { Trail, WindStreaks, Motes, Puffs, Birds, TRAIL_RAINBOW, TRAIL_TIME } from './effects.js';
import { Rings, RING_TYPES } from './rings.js';
import { Animals, SPECIES, SPECIES_KEYS } from './animals.js';
import { Bursts, Feedback } from './fx.js';
import { THEMES, PORTAL_THEMES } from './themes.js';
import { WordTiles } from './wordtiles.js';
import { Poem } from './poem.js';
import { offerWords, lineText, MOODS, POS_COLORS } from './words.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { QUALITY } from './config.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');

// ---------------------------------------------------------------------------
// Renderer & scene

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio, QUALITY.maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY.horizon.clone(), QUALITY.fogFar * 0.22, QUALITY.fogFar);
scene.background = SKY.horizon.clone();

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 6000);

const hemi = new THREE.HemisphereLight('#cfe8ff', '#7a9a4a', 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(SKY.sunColor, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
const S = 110;
Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 900 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

const sky = createSky();
scene.add(sky);
const water = createWater();
scene.add(water);
const clouds = new Clouds(scene);

const foliage = new Foliage(scene);
const rings = new Rings(scene);
const world = new World(scene, foliage, rings);
const plane = new PaperPlane(scene);
const trails = [new Trail(scene), new Trail(scene)];
const streaks = new WindStreaks(scene);
const motes = new Motes(scene);
const puffs = new Puffs(scene);
const birds = new Birds(scene);
const audio = new Audio();
const input = new Input(canvas);
const animals = new Animals(scene);
world.animals = animals;
const bursts = new Bursts(scene);
const feedback = new Feedback(camera);
const wordTiles = new WordTiles(scene);
const poem = new Poem();

const START = new THREE.Vector3(0, 42, -190);

// Every visit is a new world, unless ?seed= (and ?world= for the theme) is
// shared in the URL.
const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e6) + 1;
let themeKey = THEMES[params.get('world')] ? params.get('world') : 'meadow';

function applyThemeVisuals(theme) {
  applySkyTheme(theme);
  scene.fog.color.copy(SKY.horizon);
  scene.fog.near = QUALITY.fogFar * theme.fog.near;
  scene.fog.far = QUALITY.fogFar * theme.fog.far;
  scene.background.copy(SKY.horizon);
  hemi.color.set(theme.hemi.sky);
  hemi.groundColor.set(theme.hemi.ground);
  hemi.intensity = theme.hemi.intensity;
  sun.color.set(theme.sun.color);
  sun.intensity = theme.sun.intensity;
  water.material.color.set(theme.water);
  clouds.material.color.set(theme.clouds.color);
  clouds.material.emissive.set(theme.clouds.emissive);
  motes.setTheme(theme.motes);
  renderer.toneMappingExposure = theme.exposure;
}

/** Regenerates the world. `keepPlace` is used by portals so you fly on. */
function applyWorld(s, key, keepPlace = false) {
  seed = s;
  themeKey = key;
  setSeed(seed);
  setTheme(key);
  world.setWorld(seed, key);
  rings.clear();
  animals.clear();
  wordTiles.clear();
  // In the poem world, words take over from most of the rings.
  const poemWorld = key === 'ethereal';
  rings.chainChance = poemWorld ? 0.1 : 0.35;
  rings.wordGates = !poemWorld;
  applyThemeVisuals(THEMES[key]);
  updatePoemUi(poemWorld);
  if (!keepPlace) plane.reset(START, 0);
  trails.forEach((t) => t.reset());
  $('seed').textContent = seed;
  $('world-name').textContent = THEMES[key].name;
  params.set('seed', seed);
  if (key === 'meadow') params.delete('world');
  else params.set('world', key);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}
applyWorld(seed, themeKey);

// ---------------------------------------------------------------------------
// State

const state = {
  mode: 'loading', // loading | title | flying | paused
  score: 0,
  combo: 0,
  lastRing: -99,
  rainbow: 0,
  trick: 0,
  mood: MOODS[Math.floor(Math.random() * MOODS.length)],
  nextCluster: 0,
  lineFreqs: [],
  echoes: {}, // word resonances in progress: name -> seconds left
  time: 0,
  hudHidden: false,
  shake: 0,
};

// ---------------------------------------------------------------------------
// Camera rig

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camUp = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpAxis = new THREE.Vector3();
const tmpLean = new THREE.Vector3();
const tmpPuff = new THREE.Vector3();
const tmpProj = new THREE.Vector3();

function chaseCamera(dt, snap = false) {
  // Offset behind the plane, pitched a little with it.
  tmpE.set(-plane.camPitch * 0.45, plane.yaw, 0);
  tmpQ.setFromEuler(tmpE);
  // Tall (portrait) screens see less sideways, so sit further back.
  const portrait = Math.max(1, 1 / camera.aspect) ** 0.6;
  const back = (7.5 + Math.max(0, plane.speed - plane.cruise) * 0.06) * portrait;
  tmpV.set(0, 2.7 * portrait, -back).applyQuaternion(tmpQ).add(plane.position);
  const k = snap ? 1 : 1 - Math.exp(-dt * 5.5);
  camPos.lerp(tmpV, k);
  const ground = Math.max(heightAt(camPos.x, camPos.z), WATER_LEVEL + 0.5);
  camPos.y = Math.max(camPos.y, ground + 1.2);

  tmpV.copy(plane.position).addScaledVector(plane.camForward, 9).setY(plane.position.y + plane.camForward.y * 9 + 0.6);
  camLook.lerp(tmpV, snap ? 1 : 1 - Math.exp(-dt * 8));

  // Lean the horizon a little into turns.
  tmpAxis.copy(plane.camForward).setY(0).normalize();
  tmpLean.set(0, 1, 0).applyAxisAngle(tmpAxis, plane.roll * 0.25);
  camUp.lerp(tmpLean, snap ? 1 : 1 - Math.exp(-dt * 3)).normalize();

  camera.position.copy(camPos);
  if (state.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * state.shake;
    camera.position.y += (Math.random() - 0.5) * state.shake;
    state.shake *= Math.exp(-dt * 8);
  }
  camera.up.copy(camUp);
  camera.lookAt(camLook);
  const fov = 60 + (portrait - 1) * 12 + plane.gustFraction * 8 + THREE.MathUtils.clamp((plane.speed - plane.cruise) * 0.45, -4, 18);
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3));
  camera.updateProjectionMatrix();
}

// Slow cinematic orbit used behind the title screen.
function titleCamera(dt) {
  const t = state.time * 0.12;
  const target = plane.position;
  tmpV.set(Math.sin(t) * 14, 3 + Math.sin(t * 0.7) * 1.5, Math.cos(t) * 14).add(target);
  camPos.lerp(tmpV, 1 - Math.exp(-dt * 2));
  camera.position.copy(camPos);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camLook.copy(target);
}

// Gentle autopilot for the title screen: meander and hold altitude.
function autopilot() {
  const ground = Math.max(heightAt(plane.position.x + plane.camForward.x * 60, plane.position.z + plane.camForward.z * 60), 0);
  const want = ground + 45;
  return {
    x: Math.sin(state.time * 0.13) * 0.35,
    y: THREE.MathUtils.clamp((want - plane.position.y) * 0.03, -0.5, 0.6),
    boost: false,
  };
}

// ---------------------------------------------------------------------------
// HUD

const hud = {
  score: $('score'),
  alt: $('alt'),
  spd: $('spd'),
  pointer: $('pointer'),
  counter: document.querySelector('.counter'),
  combo: $('combo'),
  comboN: $('combo-n'),
  gust: $('gust-bar'),
  paws: $('paws'),
  pawsBox: document.querySelector('.paws'),
};

// ---------------------------------------------------------------------------
// Rings: every type gives a gust, special ones add a twist.

const RAINBOW = ['#ff5f6d', '#ffc371', '#fff36b', '#6bff95', '#6bd6ff', '#9a6bff', '#ff6bd6'];
const HAPTICS = { gold: 15, swift: [20, 40, 30], prism: [15, 30, 15, 30, 15], flip: 40, portal: [60, 40, 120] };

function onRing({ ring, type, position }) {
  const def = RING_TYPES[type];
  // Chain rings within a few seconds of each other to build a combo.
  state.combo = state.time - state.lastRing < 4.5 ? state.combo + 1 : 1;
  state.lastRing = state.time;
  const mult = Math.min(state.combo, 5);
  const points = def.points * mult;
  state.score += points;
  hud.score.textContent = state.score;
  hud.counter.classList.remove('pop');
  void hud.counter.offsetWidth;
  hud.counter.classList.add('pop');

  if (def.boost > 0) plane.gustFor(def.boost, def.strength);
  const colors = def.rainbow ? RAINBOW : [def.color, def.glow, '#ffffff'];
  bursts.emit(position, ring.normal, colors, def.rainbow ? 140 : type === 'gold' ? 60 : 100, ring.radius, def.portal ? 22 : 14);
  feedback.flash(def.rainbow ? '#ff9bf0' : def.glow, type === 'gold' ? 0.22 : 0.45);
  feedback.haptic(HAPTICS[type] ?? 15);
  audio.ring(type, state.combo);

  const label = type === 'gold' ? `+${points}` : `${def.label}${mult > 1 ? ` +${points}` : ''}`;
  feedback.popup(position, label, def.rainbow ? '#ffffff' : def.glow, type !== 'gold');
  if (state.combo >= 2) {
    hud.comboN.textContent = state.combo;
    hud.combo.classList.remove('pop');
    void hud.combo.offsetWidth;
    hud.combo.classList.add('show', 'pop');
  }

  if (type === 'swift') state.shake = Math.max(state.shake, 0.35);
  if (type === 'prism') state.rainbow = 7;
  if (type === 'flip') plane.startTrick(state.trick++ % 2 === 0 ? 'loop' : 'roll');
  if (def.portal) {
    if (ring.word) {
      // A word portal: the word becomes part of your poem, and in you go.
      catchWord(ring.word, position);
      travel('ethereal');
    } else travel();
  }
}

// ---------------------------------------------------------------------------
// Poem world: word constellations drift ahead; fly through one to catch it.

function updatePoemUi(poemWorld = themeKey === 'ethereal') {
  const show = poemWorld || !poem.isEmpty;
  $('poem-strip').classList.toggle('hidden', !show);
  $('poem-btn').classList.toggle('hidden', !show);
  if (show) poem.render();
}

function tendWords(dt) {
  if (themeKey !== 'ethereal' || state.mode !== 'flying') return;
  const caught = wordTiles.update(dt, plane, camera);
  if (caught) catchWord(caught.tile.word, caught.tile.group.position);
  // Always keep a fresh handful of words somewhere ahead: the next cluster
  // appears on the horizon as you reach the current one.
  const ahead = wordTiles.aheadCluster(plane);
  const near = ahead && ahead.tiles.some((t) => t.state === 'live' && t.group.position.distanceTo(plane.position) < 90);
  const live = wordTiles.clusters.filter((c) => !c.done).length;
  if ((!ahead || (near && live < 2)) && state.time > state.nextCluster) {
    const words = offerWords(Math.random, {
      lastPos: poem.lastPos,
      mood: state.mood,
      lineLength: poem.current.length,
      avoid: poem.recent(),
      count: window.innerWidth < 600 ? 3 : 4,
    });
    wordTiles.spawn(plane, words, (ahead ? 250 : 160) + plane.speed * 2);
    state.nextCluster = state.time + 1.5;
  }
}

function catchWord(word, position) {
  const color = POS_COLORS[word.pos] ?? '#ffffff';
  bursts.emit(position, plane.camForward, [color, '#ffffff', '#fff4d6'], 60, 4, 8);
  feedback.haptic(18);
  if (word.pos === 'break') {
    const text = poem.newLine();
    if (text) readLine(text);
  } else {
    poem.add(word);
    state.lineFreqs.push(audio.word(word.pos, poem.current.length - 1));
    feedback.popup(position, word.w, color, true);
    // The mood drifts with what you choose, so imagery gathers without being forced.
    if (word.moods.length && Math.random() < 0.6) state.mood = word.moods[0];
    else if (Math.random() < 0.2) state.mood = MOODS[Math.floor(Math.random() * MOODS.length)];
    resonate(word);
  }
  updatePoemUi();
}

/** A finished line is read back: shown large, with its notes replayed. */
function readLine(text) {
  const el = $('reading');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  audio.readLine(state.lineFreqs.filter(Boolean));
  state.lineFreqs = [];
  feedback.flash('#f3e8ff', 0.3);
}

// Some words echo into the world around you.
const ECHOES = [
  { name: 'moon', words: ['moon', 'orbit', 'satellite', 'luminous'] },
  { name: 'rain', words: ['rain', 'river', 'sea', 'tide', 'flood', 'drown', 'pour', 'drowned', 'well', 'harbor'] },
  { name: 'embers', words: ['fire', 'ember', 'flame', 'burn', 'burning', 'glow', 'molten', 'furnace', 'ash', 'smoke'] },
  { name: 'petals', words: ['bloom', 'garden', 'seed', 'grow', 'tender', 'tenderness', 'sweet', 'love', 'joy'] },
  { name: 'birds', words: ['bird', 'wings', 'fly', 'rise', 'weightless', 'sky'] },
  { name: 'night', words: ['night', 'midnight', 'dusk', 'stars', 'dark', 'quiet', 'static', 'distance'] },
  { name: 'gold', words: ['gold', 'golden', 'honey', 'sugar', 'sun', 'bright', 'holy', 'prayer', 'mercy'] },
];
const moonSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 50, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,252,240,1)');
  grd.addColorStop(0.42, 'rgba(255,248,230,1)');
  grd.addColorStop(0.47, 'rgba(255,240,220,0.35)');
  grd.addColorStop(1, 'rgba(255,240,220,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false, opacity: 0 }));
  sp.scale.setScalar(520);
  sp.renderOrder = 0;
  scene.add(sp);
  return sp;
})();

function resonate(word) {
  const echo = ECHOES.find((e) => e.words.includes(word.w));
  if (!echo) return;
  state.echoes[echo.name] = echo.name === 'moon' || echo.name === 'night' ? 30 : 12;
  const p = plane.position;
  if (echo.name === 'embers') bursts.emit(p, plane.camForward, ['#ffb35c', '#ff7a3c', '#ffe08a'], 120, 12, 5);
  if (echo.name === 'gold') bursts.emit(p, plane.camForward, ['#ffe08a', '#fff4c2', '#f4c96b'], 110, 10, 7);
  if (echo.name === 'petals') bursts.emit(p, plane.camForward, ['#f7c9dc', '#ffe3ef', '#e3cdf0'], 110, 12, 5);
  if (echo.name === 'birds') {
    birds.center.copy(p).addScaledVector(plane.camForward, 120);
    birds.center.y = p.y + 15;
  }
}

/** Fades echo effects in and out; runs every frame. */
function tendEchoes(dt) {
  const theme = THEMES[themeKey];
  let motesOverride = null;
  for (const k of Object.keys(state.echoes)) {
    state.echoes[k] -= dt;
    if (state.echoes[k] <= 0) delete state.echoes[k];
  }
  const e = state.echoes;
  if (e.rain) motesOverride = { color: '#d6f1ff', size: 0.5, fall: 9, glow: true };
  else if (e.embers) motesOverride = { color: '#ffb35c', size: 0.6, fall: -4, glow: true };
  else if (e.petals) motesOverride = { color: '#ffc3dc', size: 0.7, fall: 1, glow: false };
  else if (e.gold) motesOverride = { color: '#ffe08a', size: 0.6, fall: -1, glow: true };
  const want = motesOverride ?? theme.motes;
  if (motes.current !== want) {
    motes.setTheme(want);
    motes.current = want;
  }
  // Night deepens the stars; the moon rises opposite the sun.
  const nightK = e.night ? Math.min(1, e.night / 3, (30 - e.night) / 3 + 0.2) : 0;
  SKY.stars.value = theme.sky.stars + nightK * 1.2;
  const moonK = e.moon ? Math.min(1, e.moon / 3, (30 - e.moon) / 2) : 0;
  moonSprite.material.opacity += (moonK - moonSprite.material.opacity) * Math.min(1, dt * 2);
  moonSprite.visible = moonSprite.material.opacity > 0.01;
  if (moonSprite.visible) {
    moonSprite.position.copy(camera.position).addScaledVector(tmpV.set(-SKY.sunDir.x, 0.35, -SKY.sunDir.z).normalize(), 3000);
  }
}

// Portals: white-out, rebuild the land in another theme, fly on.
async function travel(target = null) {
  if (state.mode !== 'flying') return;
  const others = PORTAL_THEMES.filter((k) => k !== themeKey);
  const next = target ?? others[Math.floor(Math.random() * others.length)];
  feedback.whiteout(true);
  await new Promise((r) => setTimeout(r, 500));
  state.mode = 'loading';
  applyWorld(Math.floor(Math.random() * 1e6) + 1, next, true);
  await buildAround();
  const ground = Math.max(heightAt(plane.position.x, plane.position.z), WATER_LEVEL);
  plane.position.y = Math.max(plane.position.y, ground + 35);
  chaseCamera(0, true);
  state.mode = 'flying';
  feedback.whiteout(false);
  showToast(next === 'ethereal' ? '✦ Dreaming Hours · fly through words to write a poem' : `✦ ${THEMES[next].name}`);
}

// ---------------------------------------------------------------------------
// Animals

function updatePaws() {
  hud.paws.textContent = `${animals.discovered.size}/${SPECIES_KEYS.length}`;
}

function onDiscover(a) {
  const sp = SPECIES[a.kind];
  audio.discover();
  feedback.haptic([20, 60, 20]);
  feedback.popup(a.group.position, `${sp.emoji} ${sp.name}!`, '#ffe9a8', true);
  showToast(`New animal: ${sp.emoji} ${sp.name} · ${animals.discovered.size}/${SPECIES_KEYS.length} found`);
  updatePaws();
  const paw = document.querySelector('.paws');
  paw.classList.remove('pop');
  void paw.offsetWidth;
  paw.classList.add('pop');
}

function renderJournal() {
  $('journal').innerHTML = SPECIES_KEYS.map((k) => {
    const found = animals.discovered.has(k);
    const sp = SPECIES[k];
    return `<li class="${found ? 'found' : ''}"><span>${found ? sp.emoji : '?'}</span>${found ? sp.name : '???'}</li>`;
  }).join('');
}

function updateHud() {
  hud.alt.textContent = Math.round(plane.position.y);
  hud.spd.textContent = Math.round(plane.speed * 3.6);
  // Arrow at the screen edge towards the nearest ring when it's off-screen.
  const ring = rings.nearest(plane);
  if (!ring) {
    hud.pointer.style.opacity = 0;
    return;
  }
  const p = tmpProj.copy(ring.mesh.position).project(camera);
  const behind = p.z > 1;
  if (behind) {
    p.x = -p.x;
    p.y = -p.y;
  }
  const on = !behind && Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95;
  if (on || ring.mesh.position.distanceTo(plane.position) > 700) {
    hud.pointer.style.opacity = 0;
    return;
  }
  const ang = Math.atan2(p.y, p.x);
  const m = 0.85;
  const s = Math.min(m / Math.abs(Math.cos(ang) || 1e-3), m / Math.abs(Math.sin(ang) || 1e-3));
  const x = (Math.cos(ang) * s * 0.5 + 0.5) * window.innerWidth;
  const y = (-Math.sin(ang) * s * 0.5 + 0.5) * window.innerHeight;
  hud.pointer.style.opacity = 0.9;
  hud.pointer.style.transform = `translate(${x - 9}px, ${y - 11}px) rotate(${-ang + Math.PI / 2}rad)`;
}

// ---------------------------------------------------------------------------
// Main loop

const timer = new THREE.Timer();
timer.connect(document);
const grassPuff = new THREE.Color('#bfe07a');
const waterPuff = new THREE.Color('#e8fbff');
let perfAcc = 0;
let smoothDt = 1 / 60;
let perfFrames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  timer.update(now);
  // Lightly smooth the frame delta: rAF timestamps jitter by a millisecond or
  // two, which otherwise shows up as micro-stutter in the chase camera.
  const raw = Math.min(timer.getDelta(), 1 / 20);
  smoothDt += (raw - smoothDt) * (Math.abs(raw - smoothDt) > 0.01 ? 1 : 0.2);
  const dt = smoothDt;
  if (state.mode === 'paused' || state.mode === 'loading') {
    renderer.render(scene, camera);
    return;
  }
  state.time += dt;

  input.update(dt);
  const controls = state.mode === 'flying' ? input : autopilot();
  plane.update(dt, controls);

  if (plane.bump > 0) {
    puffs.emit(tmpPuff.copy(plane.position).setY(plane.position.y - 2), plane.splash ? waterPuff : grassPuff, 2);
    if (plane.bump > 0.4 && state.shake < 0.05) {
      state.shake = 0.25;
      audio.thump();
    }
  }

  const hits = rings.update(dt, plane);
  if (state.mode === 'flying') {
    for (const h of hits) onRing(h);
    for (const a of animals.update(dt, plane)) onDiscover(a);
    if (state.time - state.lastRing > 4.5) hud.combo.classList.remove('show');
    // The paw print glows when an undiscovered animal is somewhere close.
    hud.pawsBox.classList.toggle('near', animals.nearestNew < 220);
    hud.gust.style.transform = `scaleX(${plane.gustFraction})`;
  } else {
    animals.update(dt, plane);
  }
  tendWords(dt);
  tendEchoes(dt);
  state.rainbow = Math.max(0, state.rainbow - dt);
  TRAIL_RAINBOW.value = Math.min(1, state.rainbow);
  TRAIL_TIME.value = state.time;
  bursts.update(dt);

  world.update(plane.position);
  foliage.updateLOD(camera.position);

  if (state.mode === 'flying') chaseCamera(dt);
  else titleCamera(dt);

  // World-following pieces.
  sky.position.copy(camera.position);
  const step = water.userData.step;
  water.position.set(Math.round(camera.position.x / step) * step, WATER_LEVEL, Math.round(camera.position.z / step) * step);
  water.userData.uniforms.uTime.value = state.time;
  windUniforms.uTime.value = state.time;
  sky.material.uniforms.uTime.value = state.time;

  // Shadow frustum follows the plane, snapped to texels to avoid shimmer.
  const texel = (2 * S) / sun.shadow.mapSize.x;
  const c = plane.position;
  sun.target.position.set(Math.round(c.x / texel) * texel, Math.round(c.y / texel) * texel, Math.round(c.z / texel) * texel);
  sun.position.copy(sun.target.position).addScaledVector(SKY.sunDir, 400);

  clouds.update(dt, camera.position);
  const speedK = THREE.MathUtils.clamp((plane.speed - 14) / 40, 0, 1);
  const trailK = Math.max(0.25 + speedK * 0.75, TRAIL_RAINBOW.value);
  trails[0].update(plane.leftTip, plane.up, trailK);
  trails[1].update(plane.rightTip, plane.up, trailK);
  streaks.update(dt, plane, 0.3 + speedK + plane.gustFraction);
  motes.update(dt, plane.position);
  puffs.update(dt);
  birds.update(dt, state.time, plane, heightAt);
  audio.update(plane.speed, plane.cruise, controls.boost);
  if (state.mode === 'flying' && !state.hudHidden) updateHud();

  renderer.render(scene, camera);

  // Adaptive resolution: back off if we're consistently slow.
  perfAcc += dt;
  perfFrames++;
  if (perfAcc > 2.5) {
    const avg = perfAcc / perfFrames;
    if (avg > 1 / 45 && pixelRatio > 0.75) {
      pixelRatio = Math.max(0.75, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
    }
    perfAcc = 0;
    perfFrames = 0;
  }
}

// ---------------------------------------------------------------------------
// UI wiring

async function startPoem() {
  if (state.mode !== 'title') return;
  // Set the mood before the new world loads, then take off into it.
  audio.start();
  state.mode = 'loading';
  $('title').classList.add('fade');
  applyWorld(Math.floor(Math.random() * 1e6) + 1, 'ethereal');
  await buildAround();
  chaseCamera(0, true);
  state.mode = 'title';
  start();
  showToast('✦ Dreaming Hours · fly through words to write a poem');
}

function start() {
  if (state.mode !== 'title') return;
  // Ask for motion access straight from the tap (required on iOS).
  if (input.gyro.supported) {
    input.enableGyro().then((ok) => {
      $('recenter').classList.toggle('hidden', !ok);
      $('gyro-toggle').classList.toggle('hidden', !ok);
      showToast(ok ? 'Tilt to steer · hold the screen for a gust' : 'Drag to steer · two fingers for a gust');
    });
  }
  audio.start();
  state.mode = 'flying';
  $('title').classList.add('fade');
  setTimeout(() => $('title').classList.add('hidden'), 1300);
  $('hud').classList.remove('hidden');
  updatePaws();
}

let toastTimer = 0;
function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

function togglePause() {
  if (state.mode === 'flying') {
    state.mode = 'paused';
    renderJournal();
    $('paused').classList.remove('hidden');
    audio.ctx?.suspend();
  } else if (state.mode === 'paused') {
    state.mode = 'flying';
    $('paused').classList.add('hidden');
    $('poem-view').classList.add('hidden');
    audio.ctx?.resume();
  }
}

$('start').addEventListener('click', start);
$('start-poem').addEventListener('click', startPoem);

// Poem view ("the fridge door").
function openPoem() {
  if (state.mode === 'flying') togglePause(true);
  poem.renderDoor();
  $('paused').classList.add('hidden');
  $('poem-view').classList.remove('hidden');
}
function closePoem() {
  $('poem-view').classList.add('hidden');
  if (state.mode === 'paused') togglePause();
}
$('poem-btn').addEventListener('click', openPoem);
$('open-poem').addEventListener('click', openPoem);
$('poem-close').addEventListener('click', closePoem);
$('poem-undo').addEventListener('click', () => (poem.undo(), poem.renderDoor()));
$('poem-line').addEventListener('click', () => {
  const t = poem.newLine();
  if (t) state.lineFreqs = [];
  poem.renderDoor();
});
$('poem-keep').addEventListener('click', () => {
  if (poem.isEmpty) return;
  poem.keep();
  poem.reset();
  poem.renderDoor();
  showToast('Poem kept. A blank fridge door awaits.');
});
$('poem-share').addEventListener('click', async () => {
  const r = await poem.share();
  showToast(r === 'copied' ? 'Poem copied' : r === 'shared' ? 'Shared' : 'Could not share');
});
$('poem-image').addEventListener('click', () => poem.downloadImage());
$('resume').addEventListener('click', togglePause);
$('new-world').addEventListener('click', async () => {
  $('paused').classList.add('hidden');
  state.mode = 'loading';
  applyWorld(Math.floor(Math.random() * 1e6) + 1, themeKey);
  state.score = 0;
  state.combo = 0;
  hud.score.textContent = 0;
  await buildAround();
  chaseCamera(0, true);
  state.mode = 'flying';
  audio.ctx?.resume();
  showToast(`World #${seed}`);
});
$('gyro-toggle').addEventListener('click', () => {
  if (input.gyro.enabled) input.disableGyro();
  else input.enableGyro();
  $('gyro-toggle').textContent = input.gyro.enabled ? 'Tilt steering: on' : 'Tilt steering: off';
  $('recenter').classList.toggle('hidden', !input.gyro.enabled);
});
const recenter = (e) => {
  e.stopPropagation();
  e.preventDefault();
  input.recenter();
  showToast('Level flight set to how you hold the phone now');
};
$('recenter').addEventListener('touchstart', recenter, { passive: false });
$('recenter').addEventListener('click', recenter);
$('pause-btn').addEventListener('touchstart', (e) => (e.preventDefault(), togglePause()), { passive: false });
$('pause-btn').addEventListener('click', togglePause);
// A new screen orientation means a new "neutral" grip.
screen.orientation?.addEventListener?.('change', () => input.recenter());
window.addEventListener('orientationchange', () => input.recenter());
window.addEventListener('keydown', (e) => {
  if (state.mode === 'title' && (e.code === 'Enter' || e.code === 'Space')) start();
  else if (state.mode === 'flying' && e.code === 'Enter' && !poem.isEmpty) {
    const t = poem.newLine();
    if (t) readLine(t);
  }
  if (state.mode === 'flying' && e.code === 'Backspace') {
    poem.undo();
    updatePoemUi();
  }
  if (e.code === 'KeyO') ($('poem-view').classList.contains('hidden') ? openPoem() : closePoem());
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') audio.setMuted(!audio.muted);
  if (e.code === 'KeyI') input.invertY = !input.invertY;
  if (e.code === 'KeyH') {
    state.hudHidden = !state.hudHidden;
    $('hud').classList.toggle('hidden', state.hudHidden || state.mode !== 'flying');
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'flying') togglePause();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Boot

// Let the workers build the nearby world before revealing it.
async function buildAround(onProgress) {
  foliage.lodCenter.copy(plane.position);
  const t0 = performance.now();
  let peak = 1;
  while (!world.readyAround(plane.position, 1) && performance.now() - t0 < 20000) {
    world.update(plane.position, 4000, 12);
    peak = Math.max(peak, world.busy);
    onProgress?.(1 - world.busy / peak);
    await new Promise((r) => setTimeout(r, 16));
  }
}

async function boot() {
  const bar = $('progress');
  // Word tiles are drawn into canvases, so the serif must be ready first.
  await Promise.race([
    document.fonts?.load('600 96px Fraunces').catch(() => {}),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  const capacity = (mat) => (mat.startsWith('Bark') || mat.startsWith('Leaves_') ? 14000 : 5000);
  await foliage.load(MODEL_NAMES, `${import.meta.env.BASE_URL}models/`, capacity, (p) => (bar.style.width = `${p * 80}%`));

  await buildAround((p) => (bar.style.width = `${80 + p * 20}%`));

  chaseCamera(0, true);
  camPos.copy(plane.position).add(new THREE.Vector3(10, 4, 10));
  state.mode = 'title';
  $('loading').classList.add('hidden');
  $('start').classList.remove('hidden');
  $('start-poem').classList.remove('hidden');
}

requestAnimationFrame(frame);
window.__paperplanes = { state, renderer, plane, world, camera, foliage, input, chaseCamera, rings, animals, onRing, travel, wordTiles, poem, catchWord, tendWords };
boot().catch((err) => {
  console.error(err);
  document.querySelector('#loading .hint').textContent = 'Something went wrong loading the scene. Check the console.';
});
