import * as THREE from 'three';
import { Foliage, windUniforms } from './foliage.js';
import { World, MODEL_NAMES } from './world.js';
import { heightAt, setSeed, WATER_LEVEL } from './terrain.js';
import { PaperPlane } from './plane.js';
import { SKY, createSky, Clouds, createWater } from './sky.js';
import { Trail, WindStreaks, Motes, Puffs, Birds } from './effects.js';
import { Rings } from './rings.js';
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

const START = new THREE.Vector3(0, 42, -190);

// Every visit is a new world, unless a ?seed= is shared in the URL.
const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed')) || Math.floor(Math.random() * 1e6) + 1;
function applySeed(s) {
  seed = s;
  setSeed(seed);
  world.setSeed(seed);
  rings.clear();
  plane.reset(START, 0);
  trails.forEach((t) => t.reset());
  $('seed').textContent = seed;
  params.set('seed', seed);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}
applySeed(seed);

// ---------------------------------------------------------------------------
// State

const state = {
  mode: 'loading', // loading | title | flying | paused
  score: 0,
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
  tmpE.set(-plane.pitch * 0.45, plane.yaw, 0);
  tmpQ.setFromEuler(tmpE);
  // Tall (portrait) screens see less sideways, so sit further back.
  const portrait = Math.max(1, 1 / camera.aspect) ** 0.6;
  const back = (7.5 + Math.max(0, plane.speed - plane.cruise) * 0.06) * portrait;
  tmpV.set(0, 2.7 * portrait, -back).applyQuaternion(tmpQ).add(plane.position);
  const k = snap ? 1 : 1 - Math.exp(-dt * 5.5);
  camPos.lerp(tmpV, k);
  const ground = Math.max(heightAt(camPos.x, camPos.z), WATER_LEVEL + 0.5);
  camPos.y = Math.max(camPos.y, ground + 1.2);

  tmpV.copy(plane.position).addScaledVector(plane.forward, 9).setY(plane.position.y + plane.forward.y * 9 + 0.6);
  camLook.lerp(tmpV, snap ? 1 : 1 - Math.exp(-dt * 8));

  // Lean the horizon a little into turns.
  tmpAxis.copy(plane.forward).setY(0).normalize();
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
  const fov = 60 + (portrait - 1) * 12 + THREE.MathUtils.clamp((plane.speed - plane.cruise) * 0.45, -4, 18);
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
  const ground = Math.max(heightAt(plane.position.x + plane.forward.x * 60, plane.position.z + plane.forward.z * 60), 0);
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
};

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

  const got = rings.update(dt, plane);
  if (got && state.mode === 'flying') {
    state.score += got;
    hud.score.textContent = state.score;
    hud.counter.classList.remove('pop');
    void hud.counter.offsetWidth;
    hud.counter.classList.add('pop');
    plane.addBoost(22);
    audio.chime();
  }

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
  trails[0].update(plane.leftTip, plane.up, 0.25 + speedK * 0.75);
  trails[1].update(plane.rightTip, plane.up, 0.25 + speedK * 0.75);
  streaks.update(dt, plane, 0.3 + speedK);
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
    $('paused').classList.remove('hidden');
    audio.ctx?.suspend();
  } else if (state.mode === 'paused') {
    state.mode = 'flying';
    $('paused').classList.add('hidden');
    audio.ctx?.resume();
  }
}

$('start').addEventListener('click', start);
$('resume').addEventListener('click', togglePause);
$('new-world').addEventListener('click', async () => {
  $('paused').classList.add('hidden');
  state.mode = 'loading';
  applySeed(Math.floor(Math.random() * 1e6) + 1);
  state.score = 0;
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
  if (e.code === 'Enter' || e.code === 'Space') start();
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
  const capacity = (mat) => (mat.startsWith('Bark') || mat.startsWith('Leaves_') ? 14000 : 5000);
  await foliage.load(MODEL_NAMES, `${import.meta.env.BASE_URL}models/`, capacity, (p) => (bar.style.width = `${p * 80}%`));

  await buildAround((p) => (bar.style.width = `${80 + p * 20}%`));

  chaseCamera(0, true);
  camPos.copy(plane.position).add(new THREE.Vector3(10, 4, 10));
  state.mode = 'title';
  $('loading').classList.add('hidden');
  $('start').classList.remove('hidden');
}

requestAnimationFrame(frame);
window.__paperplanes = { state, renderer, plane, world, camera, foliage, input, chaseCamera };
boot().catch((err) => {
  console.error(err);
  document.querySelector('#loading .hint').textContent = 'Something went wrong loading the scene. Check the console.';
});
