import * as THREE from 'three';

/** Fading ribbon that follows a point (used for the wingtip vapour trails). */
export class Trail {
  constructor(scene, length = 60, width = 0.08) {
    this.length = length;
    this.width = width;
    this.points = [];
    this.ups = [];
    const count = length * 2;
    this.positions = new Float32Array(count * 3);
    this.alphas = new Float32Array(count);
    const idx = [];
    for (let i = 0; i < length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: { uOpacity: { value: 0.5 } },
        vertexShader: `attribute float alpha; varying float vA;
          void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uOpacity; varying float vA;
          void main(){ gl_FragColor = vec4(1.0, 1.0, 1.0, vA * uOpacity); }`,
      }),
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(point, up, intensity) {
    this.points.unshift(point.clone());
    this.ups.unshift(up.clone());
    if (this.points.length > this.length) {
      this.points.pop();
      this.ups.pop();
    }
    const n = this.points.length;
    for (let i = 0; i < this.length; i++) {
      const p = this.points[Math.min(i, n - 1)];
      const u = this.ups[Math.min(i, n - 1)];
      const t = i / (this.length - 1);
      const w = this.width * (1 - t * 0.6);
      this.positions.set([p.x + u.x * w, p.y + u.y * w, p.z + u.z * w], i * 6);
      this.positions.set([p.x - u.x * w, p.y - u.y * w, p.z - u.z * w], i * 6 + 3);
      const a = (1 - t) * (1 - t) * intensity * (i < n ? 1 : 0);
      this.alphas[i * 2] = a;
      this.alphas[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

/** Thin white streaks rushing past, like the wind lines in the concept art. */
export class WindStreaks {
  constructor(scene, count = 40) {
    this.count = count;
    this.items = [];
    const pos = new Float32Array(count * 2 * 3);
    const col = new Float32Array(count * 2 * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false }),
    );
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    for (let i = 0; i < count; i++) this.items.push({ p: new THREE.Vector3(), life: 0, max: 1, len: 1 });
  }

  update(dt, plane, strength) {
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    const dir = plane.forward;
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        it.max = it.life = 0.6 + Math.random() * 0.9;
        const side = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.7, Math.random() - 0.5)
          .normalize()
          .multiplyScalar(4 + Math.random() * 18);
        it.p.copy(plane.position).addScaledVector(dir, 25 + Math.random() * 40).add(side);
        it.len = 3 + Math.random() * 7;
        it.drift = (Math.random() - 0.5) * 2;
      }
      // Streaks are mostly still air: the plane rushes past them.
      it.p.y += it.drift * dt;
      const t = it.life / it.max;
      const a = Math.sin(t * Math.PI) * 0.55 * strength;
      const b = it.p.clone().addScaledVector(dir, -it.len * (0.5 + strength));
      pos.set([it.p.x, it.p.y, it.p.z, b.x, b.y, b.z], i * 6);
      col.set([1, 1, 1, a, 1, 1, 1, 0], i * 8);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const SOFT_SPRITE = softSprite();

/** Warm pollen / dandelion motes floating in the air around the player. */
export class Motes {
  constructor(scene, count = 260, radius = 80) {
    this.count = count;
    this.radius = radius;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * radius;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * radius * 0.5;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * radius;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.45,
        map: SOFT_SPRITE,
        color: '#ffe9b0',
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.time = 0;
  }

  update(dt, center) {
    this.time += dt;
    const p = this.points.geometry.attributes.position.array;
    const R = this.radius;
    for (let i = 0; i < this.count; i++) {
      const ix = i * 3;
      p[ix] += Math.sin(this.time * 0.5 + i) * dt * 0.8 + dt * 1.5;
      p[ix + 1] += Math.cos(this.time * 0.7 + i * 1.3) * dt * 0.5;
      p[ix + 2] += dt * 0.6;
      for (let a = 0; a < 3; a++) {
        const r = a === 1 ? R * 0.5 : R;
        const c = a === 0 ? center.x : a === 1 ? center.y : center.z;
        if (p[ix + a] - c > r) p[ix + a] -= 2 * r;
        else if (p[ix + a] - c < -r) p[ix + a] += 2 * r;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Short-lived puffs when the plane skims grass or water. */
export class Puffs {
  constructor(scene, count = 80) {
    this.items = [];
    this.count = count;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 1.6,
        map: SOFT_SPRITE,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < count; i++) this.items.push({ p: new THREE.Vector3(0, -9999, 0), v: new THREE.Vector3(), life: 0 });
    this.next = 0;
  }

  emit(pos, color, n = 4) {
    for (let k = 0; k < n; k++) {
      const it = this.items[this.next];
      this.next = (this.next + 1) % this.count;
      it.p.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
      it.v.set((Math.random() - 0.5) * 6, 3 + Math.random() * 5, (Math.random() - 0.5) * 6);
      it.life = 0.8 + Math.random() * 0.5;
      it.color = color;
    }
  }

  update(dt) {
    const pos = this.points.geometry.attributes.position.array;
    const col = this.points.geometry.attributes.color.array;
    for (let i = 0; i < this.count; i++) {
      const it = this.items[i];
      if (it.life > 0) {
        it.life -= dt;
        it.v.y -= 9 * dt;
        it.p.addScaledVector(it.v, dt);
      }
      const on = it.life > 0 ? 1 : 0;
      pos.set([it.p.x, on ? it.p.y : -9999, it.p.z], i * 3);
      if (it.color) col.set([it.color.r, it.color.g, it.color.b], i * 3);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/** A small flock of low-poly birds circling lazily ahead of the player. */
export class Birds {
  constructor(scene, count = 14) {
    const geo = new THREE.BufferGeometry();
    // Body + two wings; wing tips are flapped in the vertex shader.
    const v = [
      0, 0, 0.6, -0.12, 0, -0.4, 0.12, 0, -0.4,
      0, 0, 0.2, -1.1, 0, -0.1, 0, 0, -0.3,
      0, 0, 0.2, 0, 0, -0.3, 1.1, 0, -0.1,
    ];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: '#3c3a44', side: THREE.DoubleSide, flatShading: true });
    this.uniforms = { uTime: { value: 0 } };
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = this.uniforms.uTime;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float seed = float(gl_InstanceID) * 1.7;
          transformed.y += abs(position.x) * sin(uTime * 9.0 + seed) * 0.9;`,
        );
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.count = count;
    this.birds = [];
    for (let i = 0; i < count; i++) {
      this.birds.push({ angle: Math.random() * Math.PI * 2, r: 18 + Math.random() * 30, h: Math.random() * 12, speed: 0.25 + Math.random() * 0.1 });
    }
    this.center = new THREE.Vector3(0, 90, 300);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    scene.add(this.mesh);
  }

  update(dt, time, plane, groundAt) {
    this.uniforms.uTime.value = time;
    // Keep the flock somewhere ahead of the player.
    if (this.center.distanceTo(plane.position) > 900) {
      this.center.copy(plane.position).addScaledVector(plane.forward, 500);
      this.center.x += (Math.random() - 0.5) * 300;
      this.center.z += (Math.random() - 0.5) * 300;
      this.center.y = Math.max(groundAt(this.center.x, this.center.z), 0) + 50 + Math.random() * 40;
    }
    this.center.x += dt * 4;
    const s = 1.5;
    for (let i = 0; i < this.count; i++) {
      const b = this.birds[i];
      b.angle += b.speed * dt;
      const x = this.center.x + Math.cos(b.angle) * b.r;
      const z = this.center.z + Math.sin(b.angle) * b.r;
      const y = this.center.y + b.h + Math.sin(time * 0.6 + i) * 2;
      this._q.setFromEuler(new THREE.Euler(0, -b.angle, -0.3));
      this._m.compose(new THREE.Vector3(x, y, z), this._q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
