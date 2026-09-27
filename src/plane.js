import * as THREE from 'three';
import { heightAt, WATER_LEVEL } from './terrain.js';

// ---------------------------------------------------------------------------
// Geometry: a classic folded dart. Nose points to +Z.

function paperTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#fbf8f0';
  g.fillRect(0, 0, 512, 512);
  // Faint paper grain.
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(120,100,70,${Math.random() * 0.04})`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1);
  }
  // Ruled notebook lines + margin.
  g.strokeStyle = 'rgba(90,140,210,0.55)';
  g.lineWidth = 2;
  for (let y = 24; y < 512; y += 30) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(220,90,90,0.6)';
  g.beginPath();
  g.moveTo(96, 0);
  g.lineTo(96, 512);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildPlaneGeometry() {
  const N = [0, 0.02, 1.35]; // nose
  const T = [0, 0.02, -0.95]; // centre fold at the tail
  const K = [0, -0.26, -0.8]; // bottom of the keel
  const K2 = [0, -0.05, 0.9]; // keel meets nose
  const Lm = [-0.82, 0.07, -0.95]; // wing, before the winglet fold
  const Lt = [-0.95, 0.24, -0.98]; // winglet tip
  const Ln = [-0.16, 0.03, 0.9]; // winglet fold towards nose
  const R = (v) => [-v[0], v[1], v[2]];

  const tris = [
    // Wings
    [N, Lm, T], [N, T, R(Lm)],
    // Winglets
    [Ln, Lt, Lm], [R(Ln), R(Lm), R(Lt)],
    // Keel
    [K2, T, K], [K2, K, T],
    [N, T, K2], [N, K2, T],
  ];
  const pos = [];
  const uv = [];
  for (const t of tris) {
    for (const v of t) {
      pos.push(...v);
      uv.push(v[0] * 0.45 + 0.5, v[2] * 0.4 + 0.5 + v[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------

const CRUISE = 24;
const MIN_SPEED = 11;
const MAX_SPEED = 60;
const CEILING = 480;

export class PaperPlane {
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      buildPlaneGeometry(),
      new THREE.MeshStandardMaterial({
        map: paperTexture(),
        side: THREE.DoubleSide,
        flatShading: true,
        roughness: 0.85,
        metalness: 0,
        emissive: new THREE.Color('#fff6e0'),
        emissiveIntensity: 0.28,
      }),
    );
    this.mesh.castShadow = true;
    this.mesh.scale.setScalar(1.45);
    scene.add(this.mesh);

    this.position = new THREE.Vector3(0, 60, -200);
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.yaw = 0;
    this.pitch = 0; // positive = nose up
    this.roll = 0; // positive = right wing down
    this.speed = CRUISE;
    this.boost = 0; // decays over time, adds to speed
    this.groundDist = 100;
    this.bump = 0; // set when we scrape the ground/water
    this.splash = false;
    this.time = 0;

    this.leftTip = new THREE.Vector3();
    this.rightTip = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  reset(pos, yaw) {
    this.position.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.roll = 0;
    this.speed = CRUISE;
  }

  addBoost(v) {
    this.boost = Math.min(this.boost + v, 30);
  }

  /** input: { x: -1..1 (right +), y: -1..1 (up +), boost: bool } */
  update(dt, input) {
    this.time += dt;
    const k = (rate) => 1 - Math.exp(-rate * dt);

    // Banking drives turning, like a real glider.
    const targetRoll = input.x * 1.05;
    this.roll += (targetRoll - this.roll) * k(2.6);
    this.yaw -= Math.sin(this.roll) * 0.8 * dt * (0.6 + 0.4 * Math.min(1, this.speed / CRUISE));

    let targetPitch = input.y * 0.85 - 0.04;
    if (this.speed < MIN_SPEED + 4) targetPitch = Math.min(targetPitch, -0.2); // stall: nose drops
    if (this.position.y > CEILING) targetPitch = Math.min(targetPitch, -0.15);
    this.pitch += (targetPitch - this.pitch) * k(2.0);

    // Energy: climbing trades speed for height; diving gains it back.
    let accel = -9.81 * Math.sin(this.pitch) * 1.1;
    accel += (CRUISE - this.speed) * 0.3;
    if (input.boost) this.addBoost(dt * 20);
    this.boost *= Math.exp(-dt * 0.9);
    this.speed += (accel + this.boost * 0.5) * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, MIN_SPEED, MAX_SPEED);

    const cp = Math.cos(this.pitch);
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);

    // Ground and water: bounce off gently rather than crash.
    const ground = Math.max(heightAt(this.position.x, this.position.z), WATER_LEVEL);
    this.groundDist = this.position.y - ground;
    this.bump = 0;
    const clearance = 2.2;
    if (this.groundDist < clearance) {
      this.bump = clearance - this.groundDist;
      this.splash = ground <= WATER_LEVEL + 0.01;
      this.position.y = ground + clearance;
      this.pitch = Math.max(this.pitch, 0.35);
      this.speed *= 1 - 0.6 * dt;
    }

    // Visual orientation with a little paper flutter.
    const flutter = 0.02 + Math.min(0.04, (this.speed - CRUISE) * 0.001);
    this._e.set(
      -this.pitch + Math.sin(this.time * 13.1) * flutter * 0.4,
      this.yaw + Math.sin(this.time * 3.7) * flutter * 0.3,
      this.roll + Math.sin(this.time * 17.3) * flutter,
    );
    this.mesh.position.copy(this.position);
    this.mesh.quaternion.setFromEuler(this._e);
    this.mesh.updateMatrixWorld();

    this.leftTip.set(-0.95, 0.24, -0.98).applyMatrix4(this.mesh.matrixWorld);
    this.rightTip.set(0.95, 0.24, -0.98).applyMatrix4(this.mesh.matrixWorld);
    this.up.set(0, 1, 0).applyQuaternion(this.mesh.quaternion);
  }

  get cruise() {
    return CRUISE;
  }
}
