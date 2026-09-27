// Ring layout check: a simulated pilot flies every ring chain in a patch of
// the world using the real flight model, and reports how many rings it makes.
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/ring-flight-test.cjs [seed] [reactionSeconds]
//
// Needs Playwright (npx playwright install chromium, or a global install).
const { chromium } = require('playwright');

(async () => {
  const seed = process.argv[2] || '11';
  const reaction = Number(process.argv[3] || 0.3);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
  page.setDefaultTimeout(900000);
  await page.goto(`http://localhost:4173/?seed=${seed}`);
  await page.waitForSelector('#start:not(.hidden)');
  const result = await page.evaluate((reaction) => {
    const P = window.__paperplanes;
    const { plane, rings } = P;
    P.state.mode = 'paused'; // we step the simulation ourselves
    const rel = plane.position.clone();
    const chains = new Map();
    for (let cx = -8; cx <= 8; cx++) {
      for (let cz = -8; cz <= 8; cz++) {
        for (const ring of rings.spawnForChunk(cx, cz)) {
          if (ring.type === 'portal') continue;
          const key = ring.id.split(',').slice(0, 3).join(',');
          if (!chains.has(key)) chains.set(key, []);
          chains.get(key).push(ring);
        }
      }
    }
    const GUSTS = { gold: [1.2, 8], swift: [3.2, 20], prism: [1.8, 11], flip: [1.5, 10] };
    let hits = 0, total = 0, saturated = 0, steps = 0;
    const perRing = {};
    for (const chain of chains.values()) {
      rings.active = new Set(chain);
      const n = chain[0].normal;
      plane.trick = null;
      plane.gust = 0;
      plane.reset(chain[0].mesh.position.clone().addScaledVector(n, -40), Math.atan2(n.x, n.z));
      plane.pitch = Math.asin(n.y);
      let idx = 0, t = 0, loops = 0;
      let prev = { x: 0, y: 0 };
      const dt = 1 / 60;
      while (idx < chain.length && t < 40) {
        const target = chain[idx];
        rel.subVectors(target.mesh.position, plane.position);
        let yawErr = Math.atan2(rel.x, rel.z) - plane.yaw;
        yawErr = Math.atan2(Math.sin(yawErr), Math.cos(yawErr));
        const want = Math.atan2(rel.y, Math.hypot(rel.x, rel.z));
        // Aim at the next ring, with inputs smoothed by a reaction time.
        const k = 1 - Math.exp(-dt / reaction);
        const x = prev.x + (Math.max(-1, Math.min(1, -yawErr * 3)) - prev.x) * k;
        const y = prev.y + (Math.max(-1, Math.min(1, want / 0.85 + (want - plane.pitch) * 1.5)) - prev.y) * k;
        prev = { x, y };
        if (Math.abs(x) > 0.98 || Math.abs(y) > 0.98) saturated++;
        steps++;
        plane.update(dt, { x, y });
        t += dt;
        for (const h of rings.update(dt, plane)) {
          if (GUSTS[h.type]) plane.gustFor(...GUSTS[h.type]);
          if (h.type === 'flip') plane.startTrick(loops++ % 2 ? 'roll' : 'loop');
          if (h.ring === target) {
            hits++;
            total++;
            (perRing[idx] ??= [0, 0])[0]++;
            idx++;
          }
        }
        if (chain[idx] === target) {
          rel.subVectors(target.mesh.position, plane.position);
          if (rel.dot(target.normal) < -3) {
            total++;
            (perRing[idx] ??= [0, 0])[1]++;
            idx++;
          }
        }
      }
    }
    return { chains: chains.size, hits, total, hitRate: +(hits / total).toFixed(3), inputSaturated: +(saturated / steps).toFixed(3), perRing };
  }, reaction);
  console.log(JSON.stringify(result, null, 1));
  await browser.close();
})();
