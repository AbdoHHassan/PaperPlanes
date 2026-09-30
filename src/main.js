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
import { POS_COLORS } from './words.js';
import { FORMS } from './grammar.js';
import { Onboarding } from './onboarding.js';
import { Obstacles } from './obstacles.js';
import { Air } from './air.js';
import { Flow } from './flow.js';
import { Journeys, PAPERS } from './journeys.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { QUALITY } from './config.js';
import { settings, OPTIONS, value, setSetting, onSettingsChange } from './settings.js';

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
const obstacles = new Obstacles();
const air = new Air(scene);
const flow = new Flow();
const journeys = new Journeys();
const onboarding = new Onboarding({
  scene, plane, input, rings, world, poem, wordTiles, audio, feedback,
  onFinish: (skipped) => {
    document.body.classList.remove('coaching');
    updatePoemUi();
    showToast(skipped ? 'Flight School skipped · replay it any time from the pause menu' : "You're ready. Have a lovely flight ✦");
  },
});
function startFlightSchool() {
  document.body.classList.add('coaching');
  onboarding.start();
}
world.obstacles = obstacles;
world.air = air;
plane.setPaper(journeys.paper);

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
  air.clear();
  obstacles.clear();
  // In the poem world, words take over from most of the rings.
  const poemWorld = key === 'ethereal';
  rings.chainChance = poemWorld ? 0.1 : 0.35;
  rings.wordGates = !poemWorld;
  applyThemeVisuals(THEMES[key]);
  audio.setTheme(key);
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
  nextCluster: 0,
  lineFreqs: [],
  echoes: {}, // word resonances in progress: name -> seconds left
  timeScale: 1, // < 1 during slow-motion moments
  lastBrush: 0,
  lastRoll: -99,
  skim: 0,
  seenRiver: false,
  seenThermal: false,
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
const tmpPan = new THREE.Vector3();

/** Stereo position (-1 left .. 1 right) of a world point, from the camera's view. */
function panOf(pos) {
  tmpPan.copy(pos).applyMatrix4(camera.matrixWorldInverse);
  return THREE.MathUtils.clamp(tmpPan.x / (Math.abs(tmpPan.z) + Math.abs(tmpPan.x) + 1e-3), -1, 1);
}

// The camera rig: an anchor that rides along with the plane's own velocity
// (so there's no lag that grows with speed) and only smooths the jolts, a
// view direction that turns through a critically damped spring, a smoothed
// floor so it glides over hills, and smooth-noise shake instead of jitter.
const rig = {
  anchor: new THREE.Vector3(),
  yaw: 0,
  yawVel: 0,
  pitch: 0,
  pitchVel: 0,
  floor: 0,
  shakeT: 0,
};
const camDir = new THREE.Vector3();

function chaseCamera(dt, snap = false) {
  const motion = value('motion');
  const dist = value('camera');
  if (snap) {
    rig.anchor.copy(plane.position);
    rig.yaw = plane.yaw;
    rig.pitch = plane.camPitch;
    rig.yawVel = rig.pitchVel = 0;
    rig.floor = Math.max(heightAt(plane.position.x, plane.position.z), WATER_LEVEL);
  } else {
    // Feed-forward the smooth flight velocity, then ease out whatever's left
    // (dodges, ground pushes) over ~0.15 s.
    rig.anchor.addScaledVector(plane.flightVel, dt);
    rig.anchor.lerp(plane.position, 1 - Math.exp(-dt * 7));
    // Spring the view angles towards the plane's heading and pitch.
    let e = plane.yaw - rig.yaw;
    e = Math.atan2(Math.sin(e), Math.cos(e));
    const wy = 5.2;
    rig.yawVel += (wy * wy * e - 2 * wy * rig.yawVel) * dt;
    rig.yaw += rig.yawVel * dt;
    const wpc = 4.2;
    rig.pitchVel += (wpc * wpc * (plane.camPitch - rig.pitch) - 2 * wpc * rig.pitchVel) * dt;
    rig.pitch += rig.pitchVel * dt;
  }

  // Offset behind the plane, pitched a little with it.
  tmpE.set(-rig.pitch * 0.45, rig.yaw, 0);
  tmpQ.setFromEuler(tmpE);
  // Tall (portrait) screens see less sideways, so sit further back.
  const portrait = Math.max(1, 1 / camera.aspect) ** 0.6;
  const back = (7.5 + Math.max(0, plane.speed - plane.cruise) * 0.05) * portrait * dist;
  tmpV.set(0, 2.7 * portrait * dist, -back).applyQuaternion(tmpQ).add(rig.anchor);
  camPos.copy(tmpV);
  // Glide over the ground: a smoothed floor rather than a hard clamp.
  const g = Math.max(heightAt(camPos.x, camPos.z), WATER_LEVEL + 0.5);
  rig.floor += (g - rig.floor) * (snap ? 1 : 1 - Math.exp(-dt * (g > rig.floor ? 9 : 3)));
  const minY = rig.floor + 1.4;
  if (camPos.y < minY + 1.5) camPos.y = minY + 1.5 * smoothMax01((camPos.y - minY) / 1.5);

  camDir.set(Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), Math.cos(rig.yaw) * Math.cos(rig.pitch));
  camLook.copy(rig.anchor).addScaledVector(camDir, 9);
  camLook.y += 0.6 * dist;

  // Lean the horizon a little into turns.
  tmpAxis.copy(camDir).setY(0).normalize();
  tmpLean.set(0, 1, 0).applyAxisAngle(tmpAxis, plane.roll * 0.25 * motion);
  camUp.lerp(tmpLean, snap ? 1 : 1 - Math.exp(-dt * 3)).normalize();

  camera.position.copy(camPos);
  // Shake ramps in (no sudden offset) and decays smoothly.
  rig.shakeAmp = (rig.shakeAmp ?? 0) + (state.shake - (rig.shakeAmp ?? 0)) * (1 - Math.exp(-dt * 18));
  if (rig.shakeAmp > 0.002) {
    // Smooth, decaying shake built from a few incommensurate sines.
    rig.shakeT += dt;
    const a = rig.shakeAmp * motion;
    const t = rig.shakeT;
    // A low, soft rumble (2-4 Hz) rather than a buzz.
    camera.position.x += (Math.sin(t * 15) * 0.6 + Math.sin(t * 23 + 1.3) * 0.4) * a * 0.6;
    camera.position.y += (Math.sin(t * 19 + 0.7) * 0.6 + Math.sin(t * 27 + 2.1) * 0.4) * a * 0.6;
    state.shake *= Math.exp(-dt * 6);
  }
  camera.up.copy(camUp);
  camera.lookAt(camLook);
  const kick = motion;
  const fov = 60 + (portrait - 1) * 12 + plane.gustFraction * 7 * kick + THREE.MathUtils.clamp((plane.speed - plane.cruise) * 0.4 * kick, -4, 16);
  camera.fov += (fov - camera.fov) * (snap ? 1 : 1 - Math.exp(-dt * 2.5));
  camera.updateProjectionMatrix();
}

/** Smooth version of max(x, 0) near zero, for soft floors (x in units of the blend width). */
function smoothMax01(x) {
  if (x >= 1) return x;
  const t = Math.max(-1, x);
  return 0.25 * (t + 1) * (t + 1);
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

function onRing(hit) {
  const { ring, type, position } = hit;
  onboarding.onRing(hit);
  const def = RING_TYPES[type];
  // Chain rings within a few seconds of each other to build a combo.
  state.combo = state.time - state.lastRing < 4.5 ? state.combo + 1 : 1;
  state.lastRing = state.time;
  const mult = Math.min(state.combo, 5);
  const points = def.points * mult * flow.level;
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
  audio.ring(type, state.combo, panOf(position) * 0.7);

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
  journeys.track('ring');
  journeys.track('score', state.score);
  bumpFlow('ring');
  if (hit.chainDone && hit.chainLength > 2) chainComplete(position, hit.chainLength);
  if (def.portal) {
    journeys.track('portal');
    if (ring.word) {
      // A word portal: the word comes with you, and will find its way into your poem.
      poem.seed(ring.word);
      feedback.popup(position, ring.word.w, '#e9dcff', true);
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
  if ((themeKey !== 'ethereal' && !onboarding.wordsActive) || state.mode !== 'flying') return;
  const caught = wordTiles.update(dt, plane, camera);
  if (caught) {
    catchWord(caught.tile.word, caught.tile.group.position);
    state.nextCluster = state.time + 0.5;
  }
  // One handful at a time, always offered for the sentence as it stands:
  // the next appears on the horizon a moment after you catch (or pass) one.
  const ahead = wordTiles.aheadCluster(plane);
  if (!ahead && state.time > state.nextCluster) {
    const words = poem.offer(Math.random, window.innerWidth < 600 ? 3 : 4);
    if (words.length) wordTiles.spawn(plane, words, 150 + plane.speed * 2.2);
    state.nextCluster = state.time + 0.6;
  }
}

// Each part of speech has its own voice.
const AUDIO_POS = { noun: 'noun', nouns: 'noun', v: 'verb', verb: 'verb', ved: 'verb', ving: 'verb', adj: 'adj', det: 'art', dets: 'art', subj: 'pron', prep: 'prep', adv: 'adv', phrase: 'adj', closer: 'adj', lit: 'art' };

function catchWord(word, position) {
  const color = POS_COLORS[word.pos] ?? '#ffffff';
  bursts.emit(position, plane.camForward, [color, '#ffffff', '#fff4d6'], 60, 4, 8);
  feedback.haptic(18);
  // A new form while a finished poem is on the door: keep it first.
  if (word.pos === 'form' && poem.complete) poem.keep();
  const res = poem.add(word);
  if (res.stale) {
    feedback.popup(position, "doesn't fit here", '#d8d2e6');
    updatePoemUi();
    return;
  }
  onboarding.onWord(res);
  if (res.formChosen) {
    const f = FORMS[res.formChosen];
    feedback.popup(position, `✦ ${f.label}`, '#ffffff', true);
    showToast(`${f.label}: ${f.blurb}`);
    audio.arrive();
    state.lineFreqs = [];
  } else if (word.pos !== 'break') {
    journeys.track('word');
    bumpFlow('word');
    state.lineFreqs.push(audio.word(AUDIO_POS[word.pos] ?? 'noun', state.lineFreqs.length, panOf(position) * 0.6));
    audio.magnet();
    feedback.popup(position, word.w, color, true);
    resonate(word);
  }
  if (res.poemDone) readPoem();
  else if (res.lineDone) readLine(poem.lastLineText());
  updatePoemUi();
}

/** A finished line is read back: shown large, with its notes replayed. */
function readLine(text) {
  if (!text) return;
  const el = $('reading');
  el.textContent = text;
  el.classList.remove('show', 'poem');
  void el.offsetWidth;
  el.classList.add('show');
  audio.readLine(state.lineFreqs.filter(Boolean));
  state.lineFreqs = [];
  feedback.flash('#f3e8ff', 0.3);
}

/** A finished poem: the whole thing is read back, then kept. */
function readPoem() {
  const title = poem.keep();
  const el = $('reading');
  el.textContent = `${title}\n\n${poem.text()}`;
  el.classList.remove('show', 'poem');
  void el.offsetWidth;
  el.classList.add('show', 'poem');
  audio.chainComplete(8);
  audio.readLine(state.lineFreqs.filter(Boolean));
  state.lineFreqs = [];
  feedback.flash('#fff4c2', 0.4);
  journeys.track('word', 3);
  showToast(`Poem kept: “${title}” · ✎ to retitle, share or save it`);
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
  const echo = ECHOES.find((e) => e.words.includes(word.base ?? word.w) || e.words.includes(word.w));
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
  audio.arrive();
  showToast(next === 'ethereal' ? '✦ Dreaming Hours · fly through words to write a poem' : `✦ ${THEMES[next].name}`);
}

// ---------------------------------------------------------------------------
// Flow: skimming, near misses, riding the air, tricks; brushes cost you.

function bumpFlow(kind, amount = 1) {
  const up = flow.gain(kind, amount);
  if (up) {
    audio.levelUp(up);
    journeys.track('flow', up);
    feedback.popup(tmpV.copy(plane.position).addScaledVector(plane.camForward, 12).setY(plane.position.y + 3), `Flow ×${up}`, '#ffe9a8', true);
  }
}

function tendFlow(dt, a) {
  flow.update(dt);
  // Skimming: low and fast over the ground or water.
  const low = plane.groundDist < 9 && plane.speed > 16 && plane.bump === 0;
  if (low) {
    bumpFlow('skim', dt * (1.3 - plane.groundDist / 9));
    journeys.track('skim', dt);
    state.skim += dt;
    if (Math.random() < dt * 8) puffs.emit(tmpPuff.copy(plane.position).setY(plane.position.y - plane.groundDist + 0.3), plane.groundDist < 4 && heightAt(plane.position.x, plane.position.z) < WATER_LEVEL ? waterPuff : grassPuff, 1);
  } else state.skim = 0;

  // Trees: brush through leaves, or slip past for a bonus.
  const o = obstacles.check(plane.position, state.time);
  if (o.brush) {
    plane.brush();
    flow.lose('brush');
    state.lastBrush = state.time;
    state.shake = Math.max(state.shake, 0.3);
    const t = o.brush.tint;
    const leaf = `rgb(${Math.round(Math.pow(t[0], 1 / 2.2) * 255)},${Math.round(Math.pow(t[1], 1 / 2.2) * 255)},${Math.round(Math.pow(t[2], 1 / 2.2) * 255)})`;
    bursts.emit(plane.position, plane.camForward, [leaf, leaf, '#ffffff'], 50, 3, 6);
    audio.brush();
    feedback.haptic([10, 30, 10]);
  } else if (o.near) {
    bumpFlow('near');
    journeys.track('near');
    audio.nearMiss(panOf(tmpV.set(o.near.x, plane.position.y, o.near.z)));
    feedback.popup(tmpV.set(o.near.x, Math.min(o.near.top, plane.position.y + 2), o.near.z), 'Close!', '#ffffff');
    feedback.haptic(8);
  }
  journeys.track('clean', state.time - state.lastBrush);

  // Riding the air.
  if (a.thermal > 0.8) {
    bumpFlow('thermal', dt);
    if (plane.vario > 0) journeys.track('thermal', plane.vario * dt);
    if (!state.seenThermal) {
      state.seenThermal = true;
      showToast('Thermal! Circle inside the rising air to climb');
    }
  }
  if (a.ridge > 1) bumpFlow('ridge', dt);
  if (plane.inRiver) {
    bumpFlow('river', dt);
    journeys.track('river', dt);
    if (!state.seenRiver) {
      state.seenRiver = true;
      showToast('Wind river! Fly with the current and it carries you');
    }
  }
  updateFlowHud();
}

function chainComplete(position, length) {
  bumpFlow('chain');
  journeys.track('chain');
  state.slowmo = 0.7; // a breath of slow motion (eased in and out)
  audio.chainComplete(length);
  feedback.popup(tmpV.copy(position).setY(position.y + 5), `Chain complete!`, '#fff4c2', true);
  bursts.emit(position, plane.camForward, ['#fff4c2', '#ffd27a', '#ffffff'], 160, 8, 18);
  feedback.flash('#fff4c2', 0.35);
}

function doRoll(dir) {
  if (state.mode !== 'flying' || !plane.startTrick('roll', dir)) return;
  audio.roll(dir);
  journeys.track('roll');
  if (state.time - state.lastRoll > 1.8) bumpFlow('roll');
  state.lastRoll = state.time;
}

const flowHud = { el: $('flow'), fill: $('flow-fill'), level: $('flow-level'), vario: $('vario') };
function updateFlowHud() {
  flowHud.fill.style.transform = `scaleX(${flow.value / 5})`;
  flowHud.level.textContent = `×${flow.level}`;
  flowHud.el.dataset.level = flow.level;
  const v = plane.lift;
  flowHud.vario.textContent = v > 0.6 ? `↑ ${v.toFixed(1)} m/s` : plane.inRiver ? '≋ wind river' : state.skim > 0.4 ? '⌁ skimming' : '';
}

// Journeys: finished goals earn stamps; stamps unlock paper.
journeys.onComplete((done, paper) => {
  audio.stamp();
  showToast(`✓ ${done.label} · +${done.stamps} stamp${done.stamps > 1 ? 's' : ''}`);
  renderJourneys();
  if (paper) setTimeout(() => showToast(`New paper unlocked: ${paper.name}! Choose it in the pause menu`), 3800);
});

function renderJourneys() {
  const list = journeys.active
    .map((a) => {
      const pct = Math.min(100, Math.round((a.progress / a.goal) * 100));
      return `<li><span>${journeys.label(a)}</span><i style="--p:${pct}%"></i></li>`;
    })
    .join('');
  for (const id of ['journeys-hud', 'journeys-menu']) {
    const el = $(id);
    if (el) el.innerHTML = list;
  }
  $('stamps').textContent = journeys.stamps;
  const unlocked = new Set(journeys.unlocked().map((p) => p.id));
  $('papers').innerHTML = PAPERS.map(
    (p) =>
      `<button data-paper="${p.id}" class="${p.id === journeys.paper ? 'on' : ''}" ${unlocked.has(p.id) ? '' : 'disabled'}>${p.name}${unlocked.has(p.id) ? '' : ` · ${p.stamps}✦`}</button>`,
  ).join('');
}
$('flight-school').addEventListener('click', () => {
  togglePause();
  if (!onboarding.active) startFlightSchool();
});
$('papers').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-paper]');
  if (!b || b.disabled) return;
  journeys.setPaper(b.dataset.paper);
  plane.setPaper(journeys.paper);
  renderJourneys();
});
setInterval(() => state.mode === 'flying' && renderJourneys(), 1000);

// ---------------------------------------------------------------------------
// Animals

// Now and then a nearby animal calls out, placed where it is.
let callTimer = 2;
function animalCalls(dt) {
  callTimer -= dt;
  if (callTimer > 0) return;
  callTimer = 1.5 + Math.random() * 2.5;
  const near = [];
  for (const a of animals.active) {
    if (!a.group.visible) continue;
    const d = a.group.position.distanceTo(plane.position);
    if (d < 160 && state.time > (a.nextCall ?? 0)) near.push([a, d]);
  }
  if (!near.length) return;
  const [a, d] = near[Math.floor(Math.random() * near.length)];
  a.nextCall = state.time + 10 + Math.random() * 12;
  if (a.kind === 'rabbit') return; // quiet ones
  audio.animal(a.kind, panOf(a.group.position), 1 - d / 160);
}

function updatePaws() {
  hud.paws.textContent = `${animals.discovered.size}/${SPECIES_KEYS.length}`;
}

function onDiscover(a) {
  const sp = SPECIES[a.kind];
  audio.discover(panOf(a.group.position) * 0.6);
  journeys.track('animal');
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
  // Slow-motion moments ease in quickly and back out gently.
  state.slowmo = Math.max(0, (state.slowmo ?? 0) - smoothDt);
  const slowTarget = state.slowmo > 0 ? 0.35 : 1;
  state.timeScale += (slowTarget - state.timeScale) * Math.min(1, smoothDt * (slowTarget < state.timeScale ? 9 : 1.8));
  const dt = smoothDt * state.timeScale;
  if (state.mode === 'paused' || state.mode === 'loading') {
    renderer.render(scene, camera);
    return;
  }
  state.time += dt;

  input.update(dt);
  const controls = state.mode === 'flying' ? input : autopilot();
  const airHere = air.update(dt, plane, scene);
  plane.cruiseBonus = state.mode === 'flying' ? flow.cruiseBonus : 0;
  plane.update(dt, controls, airHere);
  if (state.mode === 'flying') tendFlow(dt, airHere);

  if (plane.bump > 0) {
    puffs.emit(tmpPuff.copy(plane.position).setY(plane.position.y - 2), plane.splash ? waterPuff : grassPuff, 2);
    if (plane.bump > 0.4 && state.shake < 0.05) {
      state.shake = 0.25;
      if (state.mode === 'flying') flow.lose('bump');
      audio.thump(plane.splash ? 'water' : 'grass');
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
  if (state.mode === 'flying') onboarding.update(dt);
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
  streaks.update(dt, plane, 0.3 + speedK + plane.gustFraction + flow.value * 0.15 + (plane.inRiver ? 1 : 0));
  motes.update(dt, plane.position);
  puffs.update(dt);
  birds.update(dt, state.time, plane, heightAt);
  const groundHere = heightAt(plane.position.x, plane.position.z);
  audio.update({
    dt,
    speed: plane.speed,
    cruise: plane.cruise,
    boosting: controls.boost,
    gust: plane.gustFraction,
    roll: plane.roll,
    altitude: plane.position.y,
    groundDist: plane.groundDist,
    overWater: groundHere < WATER_LEVEL,
    combo: Math.max(state.time - state.lastRing < 4.5 ? state.combo : 0, flow.value),
  });
  audio.air(plane.lift, plane.inRiver);
  if (controls.boost && !state.wasBoosting) audio.gust();
  state.wasBoosting = controls.boost;
  animalCalls(dt);
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
  renderJourneys();
  // First flight: Flight School teaches steering, rings and sentences.
  if (!Onboarding.seen) setTimeout(() => state.mode === 'flying' && !onboarding.active && startFlightSchool(), 900);
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
    audio.paper();
    renderJournal();
    renderJourneys();
    $('paused').classList.remove('hidden');
    setTimeout(() => state.mode === 'paused' && audio.ctx?.suspend(), 400);
  } else if (state.mode === 'paused') {
    state.mode = 'flying';
    $('paused').classList.add('hidden');
    $('poem-view').classList.add('hidden');
    audio.ctx?.resume();
  }
}

$('start').addEventListener('click', start);
input.onDoubleTap = (side) => doRoll(side);
// Flight experience settings (pause menu).
function renderSettings() {
  $('flight-settings').innerHTML = Object.entries(OPTIONS)
    .map(
      ([key, o]) =>
        `<div class="setting"><span>${o.label}</span><div class="seg">${Object.keys(o.choices)
          .map((c) => `<button data-set="${key}" data-choice="${c}" class="${settings[key] === c ? 'on' : ''}">${c}</button>`)
          .join('')}</div></div>`,
    )
    .join('');
}
renderSettings();
$('flight-settings').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-set]');
  if (!b) return;
  setSetting(b.dataset.set, b.dataset.choice);
  renderSettings();
});
onSettingsChange((key) => {
  // Ring spacing is planned from speed and spacing, so re-lay the chains.
  if (key === 'speed' || key === 'spacing') world.respawnRings();
});

// Soft click on every button.
document.addEventListener('click', (e) => {
  if (e.target.closest('button')) audio.click();
});
// Volume sliders (pause menu).
for (const kind of ['music', 'sfx']) {
  const el = $(`vol-${kind}`);
  el.value = Math.round(audio.vol[kind] * 100);
  el.addEventListener('input', () => audio.setVolume(kind, el.value / 100));
}
$('start-poem').addEventListener('click', startPoem);

// Poem view ("the fridge door").
function openPoem() {
  audio.paper();
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
$('poem-undo').addEventListener('click', () => (poem.undo(), poem.renderDoor(), updatePoemUi()));
$('poem-finish').addEventListener('click', () => {
  if (!poem.finish()) return;
  poem.renderDoor();
  showToast(`Poem kept: “${poem.keep()}”`);
  updatePoemUi();
});
$('poem-titles').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-title]');
  if (!b) return;
  poem.title = b.dataset.title;
  // Update the kept copy if this poem was already saved.
  if (poem.complete && poem.saved[0]?.text === poem.text()) {
    poem.saved[0].title = poem.title;
    try {
      localStorage.setItem('paperplanes.poems', JSON.stringify(poem.saved));
    } catch {
      /* storage unavailable */
    }
  }
  poem.renderDoor();
});
$('poem-keep').addEventListener('click', () => {
  if (poem.isEmpty) return;
  if (!poem.complete) poem.keep();
  poem.reset();
  poem.renderDoor();
  updatePoemUi();
  showToast('A blank fridge door awaits. Fly through a form to begin.');
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
  else if (state.mode === 'flying' && e.code === 'Enter' && !poem.isEmpty && poem.c.atEndPoint) {
    catchWord({ w: '↵', pos: 'break' }, tmpV.copy(plane.position).addScaledVector(plane.camForward, 10));
  }
  if (state.mode === 'flying' && e.code === 'Backspace') {
    poem.undo();
    updatePoemUi();
  }
  if (e.code === 'KeyQ') doRoll(-1);
  if (e.code === 'KeyE') doRoll(1);
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
window.__onb = onboarding;
window.__paperplanes = { flow, air, obstacles, journeys, doRoll, tendFlow, state, renderer, plane, world, camera, foliage, input, chaseCamera, rings, animals, onRing, travel, wordTiles, poem, catchWord, tendWords };
boot().catch((err) => {
  console.error(err);
  document.querySelector('#loading .hint').textContent = 'Something went wrong loading the scene. Check the console.';
});
