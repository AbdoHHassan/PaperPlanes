/**
 * Mouse: the pointer's offset from screen centre steers the plane.
 * Touch: drag anywhere like a virtual joystick; hold a second finger to boost.
 * Keyboard: WASD / arrows, Space or Shift to boost.
 */
export class Input {
  constructor(el) {
    this.x = 0;
    this.y = 0;
    this.boost = false;
    this.invertY = false;
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, active: false };
    this.touch = null;
    this.touchBoost = false;
    this.mouseBoost = false;

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
    el.addEventListener('mousedown', (e) => e.button === 0 && (this.mouseBoost = true));
    window.addEventListener('mouseup', () => (this.mouseBoost = false));

    el.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        if (!this.touch) this.touch = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
        this.touchBoost = e.touches.length > 1;
      },
      { passive: false },
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
      { passive: false },
    );
    const end = (e) => {
      for (const t of e.changedTouches) if (this.touch && t.identifier === this.touch.id) this.touch = null;
      this.touchBoost = e.touches.length > 1;
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  get usingKeyboard() {
    return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((k) => this.keys.has(k));
  }

  update(dt) {
    let tx = 0;
    let ty = 0;
    const k = this.keys;
    if (this.usingKeyboard) {
      tx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      ty = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      // Keyboard eases in so it's not twitchy.
      this.x += (tx - this.x) * (1 - Math.exp(-dt * 5));
      this.y += (ty - this.y) * (1 - Math.exp(-dt * 5));
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
    this.boost = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || this.touchBoost || this.mouseBoost;
  }
}

function clampDead(v) {
  const dead = 0.06;
  const a = Math.abs(v);
  if (a < dead) return 0;
  return Math.sign(v) * Math.min(1, (a - dead) / (1 - dead));
}
