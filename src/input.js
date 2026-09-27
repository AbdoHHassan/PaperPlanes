/**
 * Steering sources, in priority order:
 *  - Keyboard: WASD / arrows, Space or Shift to boost.
 *  - Gyroscope (phones): tilt like a steering wheel to bank, tip the top
 *    edge towards/away from you to climb/dive. Small tilts are enough.
 *    Touch and hold anywhere to boost.
 *  - Touch without gyro: drag anywhere like a virtual joystick; hold a second
 *    finger to boost.
 *  - Mouse: the pointer's offset from screen centre; hold click to boost.
 */

const DEG = Math.PI / 180;
const ROLL_RANGE = 12 * DEG; // full bank at ~12° of steering-wheel tilt
const PITCH_RANGE = 16 * DEG; // full climb/dive at ~16° of tip
const TILT_DEAD = 1.2 * DEG;

export class Input {
  constructor(el) {
    this.x = 0;
    this.y = 0;
    this.boost = false;
    this.invertY = false;
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, active: false };
    this.touch = null;
    this.touches = 0;
    this.mouseBoost = false;
    this.onDoubleTap = null; // (side: -1 left | 1 right) => void
    this.lastTap = { t: 0, side: 0 };

    this.gyro = {
      supported: typeof window.DeviceOrientationEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches,
      enabled: false,
      receiving: false,
      roll: 0,
      pitch: 0,
      pitch0: null,
      rollF: 0,
      pitchF: 0,
    };

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('mousemove', (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      this.pointer.active = true;
    });
    el.addEventListener('mouseleave', () => (this.pointer.active = false));
    el.addEventListener('dblclick', (e) => this.onDoubleTap?.(e.clientX < window.innerWidth / 2 ? -1 : 1));
    el.addEventListener('mousedown', (e) => e.button === 0 && (this.mouseBoost = true));
    window.addEventListener('mouseup', () => (this.mouseBoost = false));

    const opts = { passive: false };
    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        // Double-tap on the left or right half: barrel roll that way.
        const side = t.clientX < window.innerWidth / 2 ? -1 : 1;
        const now = performance.now();
        if (now - this.lastTap.t < 300 && side === this.lastTap.side) {
          this.onDoubleTap?.(side);
          this.lastTap.t = 0;
        } else this.lastTap = { t: now, side };
        if (!this.touch) this.touch = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
        this.touches = e.touches.length;
      },
      opts,
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (this.touch && t.identifier === this.touch.id) {
            this.touch.x = t.clientX;
            this.touch.y = t.clientY;
          }
        }
      },
      opts,
    );
    const end = (e) => {
      for (const t of e.changedTouches) if (this.touch && t.identifier === this.touch.id) this.touch = null;
      this.touches = e.touches.length;
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);

    this._onOrientation = (e) => this._orientation(e);
  }

  /**
   * Must be called from a user gesture: iOS only grants motion access in
   * response to a tap. Resolves to true if tilt steering is active.
   */
  async enableGyro() {
    if (!this.gyro.supported) return false;
    try {
      const D = window.DeviceOrientationEvent;
      if (typeof D.requestPermission === 'function') {
        const res = await D.requestPermission();
        if (res !== 'granted') return false;
      }
    } catch {
      return false;
    }
    window.addEventListener('deviceorientation', this._onOrientation);
    this.gyro.enabled = true;
    this.gyro.pitch0 = null; // calibrate on first reading
    return true;
  }

  disableGyro() {
    window.removeEventListener('deviceorientation', this._onOrientation);
    this.gyro.enabled = false;
    this.gyro.receiving = false;
  }

  /** Treat the current way the phone is held as "level flight". */
  recenter() {
    this.gyro.pitch0 = null;
  }

  _orientation(e) {
    if (e.beta === null || e.gamma === null) return;
    const g = this.gyro;
    g.receiving = true;
    const b = (e.beta * Math.PI) / 180;
    const c = (e.gamma * Math.PI) / 180;
    // "Up" (opposite gravity) expressed in the device's own axes. Working
    // with this vector instead of raw angles avoids the gimbal flips you get
    // from beta/gamma when a phone is held upright in landscape.
    const ux = -Math.cos(b) * Math.sin(c);
    const uy = Math.sin(b);
    const uz = Math.cos(b) * Math.cos(c);
    // Rotate into screen axes for the current orientation.
    const angle = ((screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI) / 180;
    const sx = ux * Math.cos(angle) - uy * Math.sin(angle);
    const sy = ux * Math.sin(angle) + uy * Math.cos(angle);
    // Bank: how far the screen's horizontal axis dips. Pitch: how far the
    // top edge is tipped towards the player, relative to calibration.
    g.roll = Math.asin(Math.max(-1, Math.min(1, -sx)));
    g.pitch = Math.atan2(sy, uz);
    if (g.pitch0 === null) {
      g.pitch0 = g.pitch;
      g.rollF = g.roll;
      g.pitchF = g.pitch;
    }
  }

  get usingKeyboard() {
    return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((k) => this.keys.has(k));
  }

  get usingGyro() {
    return this.gyro.enabled && this.gyro.receiving && this.gyro.pitch0 !== null;
  }

  update(dt) {
    const k = this.keys;
    const g = this.gyro;
    if (this.usingKeyboard) {
      const tx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const ty = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      // Keyboard eases in so it's not twitchy.
      this.x += (tx - this.x) * (1 - Math.exp(-dt * 5));
      this.y += (ty - this.y) * (1 - Math.exp(-dt * 5));
    } else if (this.usingGyro) {
      // Low-pass the sensor so hand tremor doesn't reach the plane.
      const a = 1 - Math.exp(-dt * 10);
      g.rollF += (g.roll - g.rollF) * a;
      let dp = g.pitch - g.pitch0;
      if (dp > Math.PI) dp -= 2 * Math.PI;
      if (dp < -Math.PI) dp += 2 * Math.PI;
      g.pitchF += (dp - g.pitchF) * a;
      this.x = curve(g.rollF, ROLL_RANGE);
      this.y = curve(g.pitchF, PITCH_RANGE);
    } else if (this.touch) {
      const s = Math.min(window.innerWidth, window.innerHeight) * 0.22;
      this.x = clampDead((this.touch.x - this.touch.x0) / s);
      this.y = clampDead(-(this.touch.y - this.touch.y0) / s);
    } else if (this.pointer.active) {
      this.x = clampDead(this.pointer.x * 1.4);
      this.y = clampDead(this.pointer.y * 1.6);
    } else {
      this.x *= Math.exp(-dt * 3);
      this.y *= Math.exp(-dt * 3);
    }
    if (this.invertY && !this.usingKeyboard) this.y = -this.y;
    const touchBoost = this.usingGyro ? this.touches > 0 : this.touches > 1;
    this.boost = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || touchBoost || this.mouseBoost;
  }
}

// Tilt angle -> stick position: small dead zone, then a gentle expo curve so
// slight tilts give fine control and bigger ones still reach full deflection.
function curve(angle, range) {
  const a = Math.abs(angle);
  if (a < TILT_DEAD) return 0;
  const t = Math.min(1, (a - TILT_DEAD) / (range - TILT_DEAD));
  return Math.sign(angle) * (0.55 * t + 0.45 * t * t);
}

function clampDead(v) {
  const dead = 0.06;
  const a = Math.abs(v);
  if (a < dead) return 0;
  return Math.sign(v) * Math.min(1, (a - dead) / (1 - dead));
}
