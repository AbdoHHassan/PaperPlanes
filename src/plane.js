import * as THREE from 'three';
import { heightAt, WATER_LEVEL } from './terrain.js';

// ---------------------------------------------------------------------------
// Geometry: a classic folded dart. Nose points to +Z.

/** Paper styles for the plane, drawn on a canvas. Unlocked through Journeys. */
function paperTexture(style = 'notebook') {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grain = (alpha, color = '120,100,70') => {
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `rgba(${color},${Math.random() * alpha})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 2, 1);
    }
  };
  const lines = (color, step, width, vertical = false) => {
    g.strokeStyle = color;
    g.lineWidth = width;
    for (let p = step / 2; p < 512; p += step) {
      g.beginPath();
      if (vertical) {
        g.moveTo(p, 0);
        g.lineTo(p, 512);
      } else {
        g.moveTo(0, p);
        g.lineTo(512, p);
      }
      g.stroke();
    }
  };
  switch (style) {
    case 'graph':
      g.fillStyle = '#f8faf6';
      g.fillRect(0, 0, 512, 512);
      grain(0.03);
      lines('rgba(80,160,140,0.35)', 16, 1);
      lines('rgba(80,160,140,0.35)', 16, 1, true);
      lines('rgba(80,160,140,0.55)', 80, 2);
      lines('rgba(80,160,140,0.55)', 80, 2, true);
      break;
    case 'kraft':
      g.fillStyle = '#c49a6c';
      g.fillRect(0, 0, 512, 512);
      grain(0.18, '90,60,30');
      for (let i = 0; i < 300; i++) {
        g.strokeStyle = `rgba(${Math.random() < 0.5 ? '240,210,170' : '110,75,40'},0.25)`;
        g.beginPath();
        const x = Math.random() * 512, y = Math.random() * 512;
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 6);
        g.stroke();
      }
      break;
    case 'newsprint': {
      g.fillStyle = '#ece8dc';
      g.fillRect(0, 0, 512, 512);
      grain(0.05);
      g.fillStyle = 'rgba(40,40,40,0.8)';
      g.fillRect(24, 20, 464, 34); // headline
      for (let col = 0; col < 4; col++) {
        for (let y = 72; y < 500; y += 11) {
          if (Math.random() < 0.06) continue;
          const w = 100 - (Math.random() < 0.15 ? Math.random() * 50 : 0);
          g.fillStyle = 'rgba(60,60,60,0.45)';
          g.fillRect(24 + col * 118, y, w, 5);
        }
      }
      g.fillStyle = 'rgba(60,60,60,0.25)';
      g.fillRect(260, 90, 110, 90); // a photo
      break;
    }
    case 'washi': {
      g.fillStyle = '#fbf3ea';
      g.fillRect(0, 0, 512, 512);
      grain(0.05);
      for (let i = 0; i < 38; i++) {
        const x = Math.random() * 512, y = Math.random() * 512, r = 10 + Math.random() * 16;
        const col = ['#e8788f', '#f2a0b4', '#d9485f', '#f6c5cf'][i % 4];
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2 + i;
          g.fillStyle = col;
          g.beginPath();
          g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.45, r * 0.3, a, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#f4d35e';
        g.beginPath();
        g.arc(x, y, r * 0.2, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'blueprint':
      g.fillStyle = '#1f4f8a';
      g.fillRect(0, 0, 512, 512);
      grain(0.08, '255,255,255');
      lines('rgba(255,255,255,0.18)', 16, 1);
      lines('rgba(255,255,255,0.18)', 16, 1, true);
      lines('rgba(255,255,255,0.45)', 128, 2);
      lines('rgba(255,255,255,0.45)', 128, 2, true);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 2;
      g.strokeRect(300, 300, 150, 90);
      g.beginPath();
      g.arc(150, 360, 60, 0, Math.PI * 2);
      g.stroke();
      break;
    case 'gold': {
      const grd = g.createLinearGradient(0, 0, 512, 512);
      grd.addColorStop(0, '#f7e08a');
      grd.addColorStop(0.35, '#d9a93e');
      grd.addColorStop(0.6, '#fff0b5');
      grd.addColorStop(1, '#c08d2c');
      g.fillStyle = grd;
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`;
        g.beginPath();
        g.moveTo(Math.random() * 512, Math.random() * 512);
        for (let k = 0; k < 4; k++) g.lineTo(Math.random() * 512, Math.random() * 512);
        g.fill();
      }
      break;
    }
    default:
      g.fillStyle = '#fbf8f0';
      g.fillRect(0, 0, 512, 512);
      grain(0.04);
      lines('rgba(90,140,210,0.55)', 30, 2);
      g.strokeStyle = 'rgba(220,90,90,0.6)';
      g.beginPath();
      g.moveTo(96, 0);
      g.lineTo(96, 512);
      g.stroke();
  }
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

export const CRUISE = 24;
const MIN_SPEED = 11;
const MAX_SPEED = 60;
const CEILING = 480;
/** Turn rate (rad/s) at full bank and cruise speed; ring layout depends on it. */
export const MAX_TURN_RATE = 0.8 * Math.sin(1.05);
/** Pitch angle at full stick. */
export const MAX_PITCH = 0.85;

/**
 * Speed dynamics, shared by the plane and the ring planner so rings can be
 * spaced by where the plane will actually be. `s` holds
 * { speed, gust, gustTotal, gustStrength }.
 */
export function applyGust(s, seconds, strength) {
  // Diminishing returns: a gust adds less the faster you already are, so a
  // long chain feels brisk but never runs away from you.
  strength *= Math.max(0.15, 1 - (s.speed - CRUISE) / 24);
  s.gustStrength = Math.max(strength, s.gust > 0 ? s.gustStrength * 0.5 : 0);
  s.gust = Math.max(s.gust, seconds);
  s.gustTotal = s.gust;
  s.speed = Math.min(MAX_SPEED, s.speed + strength * 0.15);
}

export function stepSpeed(s, dt, pitch, extraAccel = 0) {
  let gustAccel = 0;
  if (s.gust > 0) {
    s.gust = Math.max(0, s.gust - dt);
    gustAccel = s.gustStrength * Math.min(1, (s.gust / s.gustTotal) * 2.5);
  }
  // Climbing trades speed for height; diving gains it back; drag pulls to cruise.
  const cruise = CRUISE + (s.cruiseBonus ?? 0); // flow raises your cruising speed
  const accel = -9.81 * Math.sin(pitch) * 1.1 + (cruise - s.speed) * 0.3;
  s.speed += (accel + extraAccel + gustAccel) * dt;
  s.speed = Math.min(Math.max(s.speed, MIN_SPEED), MAX_SPEED + (s.gust > 0 ? 6 : 0) + (s.cruiseBonus ?? 0));
}

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
    this.paper = 'notebook';
    scene.add(this.mesh);

    this.position = new THREE.Vector3(0, 60, -200);
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.yaw = 0;
    this.pitch = 0; // positive = nose up
    this.roll = 0; // positive = right wing down
    this.speed = CRUISE;
    this.boost = 0; // held-boost energy, decays over time
    this.gust = 0; // ring gust: seconds remaining
    this.gustStrength = 0;
    this.gustTotal = 1;
    this.trick = null; // { type: 'loop' | 'roll', dir, t, dur }
    this.lift = 0;
    this.vario = 0;
    this.cruiseBonus = 0;
    this.inRiver = false;
    this.camPitch = 0; // pitch the chase camera follows (ignores tricks)
    this.camForward = new THREE.Vector3(0, 0, 1);
    this.groundDist = 100;
    this.bump = 0; // set when we scrape the ground/water
    this.splash = false;
    this.time = 0;

    this.leftTip = new THREE.Vector3();
    this.rightTip = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  setPaper(style) {
    if (style === this.paper) return;
    this.paper = style;
    const m = this.mesh.material;
    m.map.dispose();
    m.map = paperTexture(style);
    m.metalness = style === 'gold' ? 0.55 : 0;
    m.roughness = style === 'gold' ? 0.35 : 0.85;
    m.emissiveIntensity = style === 'blueprint' ? 0.12 : 0.28;
    m.needsUpdate = true;
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

  /** A short burst of speed that fades out after `seconds`. */
  gustFor(seconds, strength) {
    applyGust(this, seconds, strength);
  }

  get gustFraction() {
    return this.gust > 0 ? this.gust / this.gustTotal : 0;
  }

  /** 'loop' or 'roll'; rolls take a direction (1 right, -1 left) and dodge sideways. */
  startTrick(type, dir = 1) {
    if (this.trick) return false;
    this.trick = { type, dir, t: 0, dur: type === 'loop' ? 2.1 : 0.75, basePitch: this.pitch };
    return true;
  }

  /** Flying through a tree canopy: leaves drag you back. */
  brush() {
    this.speed = Math.max(MIN_SPEED, this.speed * 0.82);
    this.wobble = 1;
  }

  /**
   * input: { x: -1..1 (right +), y: -1..1 (up +), boost: bool }
   * air (optional): { lift, river, riverDir, riverAlign } from Air.update
   */
  update(dt, input, air = null) {
    this.time += dt;
    const y0 = this.position.y;
    const k = (rate) => 1 - Math.exp(-rate * dt);

    // Banking drives turning, like a real glider.
    const targetRoll = input.x * 1.05; // must match MAX_TURN_RATE
    this.roll += (targetRoll - this.roll) * k(2.6);
    this.yaw -= Math.sin(this.roll) * 0.8 * dt * (0.6 + 0.4 * Math.min(1, this.speed / CRUISE));

    let targetPitch = input.y * 0.85 - 0.04;
    if (this.speed < MIN_SPEED + 4) targetPitch = Math.min(targetPitch, -0.2); // stall: nose drops
    if (this.position.y > CEILING) targetPitch = Math.min(targetPitch, -0.15);
    this.pitch += (targetPitch - this.pitch) * k(2.0);

    if (input.boost) this.addBoost(dt * 20);
    this.boost *= Math.exp(-dt * 0.9);
    // Wind rivers: fly with the current and it sweeps you along, easing
    // your heading down its course.
    let riverAccel = 0;
    this.inRiver = false;
    if (air?.river && air.riverAlign > 0.2) {
      this.inRiver = true;
      const a = air.riverAlign;
      riverAccel = Math.max(0, 44 - this.speed) * 1.3 * a;
      let e = Math.atan2(air.riverDir.x, air.riverDir.z) - this.yaw;
      e = Math.atan2(Math.sin(e), Math.cos(e));
      this.yaw += THREE.MathUtils.clamp(e, -0.5, 0.5) * 1.4 * a * dt;
      this.pitch += (Math.asin(THREE.MathUtils.clamp(air.riverDir.y, -0.5, 0.5)) - this.pitch) * 0.8 * a * dt;
    }
    stepSpeed(this, dt, this.pitch, this.boost * 0.5 + riverAccel);

    // Tricks: a loop-the-loop really flies the loop; a barrel roll is a spin.
    let flightPitch = this.pitch;
    let trickRoll = 0;
    if (this.trick) {
      const tr = this.trick;
      tr.t += dt / tr.dur;
      const e = tr.t < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, tr.t)) : 1;
      if (tr.type === 'loop') {
        flightPitch = this.pitch + e * Math.PI * 2;
        this.speed = Math.max(this.speed, CRUISE);
      } else {
        trickRoll = e * Math.PI * 2 * tr.dir;
        // Dodge sideways through the roll.
        const side = Math.sin(Math.PI * Math.min(1, tr.t)) * 19 * tr.dir * dt;
        this.position.x -= Math.cos(this.yaw) * side;
        this.position.z += Math.sin(this.yaw) * side;
      }
      if (tr.t >= 1) this.trick = null;
    }
    this.camPitch = this.pitch;
    const ccp = Math.cos(this.pitch);
    this.camForward.set(Math.sin(this.yaw) * ccp, Math.sin(this.pitch), Math.cos(this.yaw) * ccp);

    const cp = Math.cos(flightPitch);
    this.forward.set(Math.sin(this.yaw) * cp, Math.sin(flightPitch), Math.cos(this.yaw) * cp);
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);
    // Rising air (thermals, ridge lift) carries you up without costing speed.
    this.lift += ((air?.lift ?? 0) - this.lift) * k(3);
    this.position.y += this.lift * dt;

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

    this.vario = (this.position.y - y0) / Math.max(dt, 1e-4);

    // Visual orientation with a little paper flutter (and a shake after brushing leaves).
    this.wobble = (this.wobble ?? 0) * Math.exp(-dt * 4);
    const flutter = 0.02 + Math.min(0.04, (this.speed - CRUISE) * 0.001) + this.wobble * 0.15;
    this._e.set(
      -flightPitch + Math.sin(this.time * 13.1) * flutter * 0.4 + (this.inRiver ? Math.sin(this.time * 6) * 0.03 : 0),
      this.yaw + Math.sin(this.time * 3.7) * flutter * 0.3,
      this.roll + trickRoll + Math.sin(this.time * 17.3) * flutter,
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
