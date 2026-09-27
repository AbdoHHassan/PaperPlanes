import * as THREE from 'three';
import { mulberry32 } from './noise.js';

export const SKY = {
  top: new THREE.Color('#3f8fe0'),
  horizon: new THREE.Color('#cfe9f5'),
  bottom: new THREE.Color('#e9f2e4'),
  sunColor: new THREE.Color('#fff0cf'),
  sunDir: new THREE.Vector3(-0.55, 0.42, 0.72).normalize(),
};

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: SKY.top },
      uHorizon: { value: SKY.horizon },
      uBottom: { value: SKY.bottom },
      uSunDir: { value: SKY.sunDir },
      uSunColor: { value: SKY.sunColor },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor;
      uniform float uTime;
      varying vec3 vDir;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(0.0, 1.0, h), 0.6));
        col = mix(col, uBottom, smoothstep(0.0, -0.25, h));

        // Wispy high cirrus streaks like in the preview art.
        vec2 uv = d.xz / max(h, 0.05) * 0.6 + vec2(uTime * 0.004, 0.0);
        float streak = noise(uv * vec2(1.0, 7.0)) * noise(uv * 2.3 + 3.0);
        col = mix(col, vec3(1.0), smoothstep(0.35, 0.8, streak) * smoothstep(0.05, 0.35, h) * 0.45);

        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** Puffy low-poly clouds that wrap around the player as they fly. */
export class Clouds {
  constructor(scene, count = 42) {
    this.group = new THREE.Group();
    this.radius = 1600;
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#dfe9f2',
      emissiveIntensity: 0.45,
      flatShading: true,
      roughness: 1,
    });
    const r = mulberry32(99);
    const geos = [];
    for (let g = 0; g < 6; g++) geos.push(this._cloudGeo(r));
    this.items = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geos[i % geos.length], mat);
      const s = 14 + r() * 26;
      m.scale.set(s * (1 + r()), s * (0.6 + r() * 0.3), s * (1 + r() * 0.6));
      m.rotation.y = r() * Math.PI * 2;
      m.position.set((r() * 2 - 1) * this.radius, 230 + r() * 140, (r() * 2 - 1) * this.radius);
      m.castShadow = false;
      this.group.add(m);
      this.items.push(m);
    }
    scene.add(this.group);
  }

  _cloudGeo(r) {
    const parts = [];
    const n = 5 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const s = 0.5 + r() * 0.6;
      g.scale(s, s * 0.8, s);
      g.translate((i / n - 0.5) * 2.4 + r() * 0.3, r() * 0.35 * s, (r() - 0.5) * 0.9);
      // Randomise vertices a touch so it reads as sculpted, not spheres.
      const p = g.attributes.position;
      for (let v = 0; v < p.count; v++) {
        p.setXYZ(v, p.getX(v) + (r() - 0.5) * 0.08, Math.max(p.getY(v), -0.15), p.getZ(v) + (r() - 0.5) * 0.08);
      }
      parts.push(g);
    }
    let total = 0;
    for (const g of parts) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o);
      o += g.attributes.position.array.length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  }

  update(dt, center) {
    const R = this.radius;
    for (const m of this.items) {
      m.position.x += dt * 3;
      m.position.z += dt * 1.2;
      // Toroidal wrap around the player.
      if (m.position.x - center.x > R) m.position.x -= 2 * R;
      if (m.position.x - center.x < -R) m.position.x += 2 * R;
      if (m.position.z - center.z > R) m.position.z -= 2 * R;
      if (m.position.z - center.z < -R) m.position.z += 2 * R;
    }
  }
}

/** Low-poly water that follows the camera and waves in the vertex shader. */
export function createWater() {
  const size = 3200;
  const seg = 128;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: '#3fb0c4',
    transparent: true,
    opacity: 0.85,
    roughness: 0.55,
    metalness: 0.05,
    flatShading: true,
  });
  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uniforms.uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
        transformed.y += sin(wp.x * 0.08 + uTime * 1.1) * 0.35 + cos(wp.z * 0.11 + uTime * 0.8) * 0.3
                       + sin((wp.x + wp.z) * 0.21 + uTime * 1.7) * 0.12;`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.uniforms = uniforms;
  mesh.userData.step = size / seg;
  return mesh;
}
