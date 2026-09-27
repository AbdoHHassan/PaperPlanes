# Paper Planes

A calm WebGL flight through an endless low-poly landscape: fly a folded
notebook-paper plane over meadows, lakes, autumn forests and snowy ridges,
and thread the glowing wind rings to pick up speed.

Built with [three.js](https://threejs.org) and [Vite](https://vite.dev).
Nature models are the Stylized Nature MegaKit by [Quaternius](https://quaternius.com) (CC0).

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Controls

| | Desktop | Touch |
|---|---|---|
| Steer | Move the mouse (offset from screen centre), or WASD / arrows | Tilt the phone: rotate it like a steering wheel to bank, tip the top edge towards/away from you to climb/dive (drag to steer if motion access is denied) |
| Gust | Hold left click, Space or Shift | Touch and hold (two fingers when drag-steering) |
| Other | `M` mute · `I` invert pitch · `H` hide HUD · `P`/`Esc` pause | **◎ Level** re-centres the tilt to how you hold the phone · **❚❚** pause |

Every visit generates a new world. The pause menu shows the world number and has a **New world** button; `?seed=1234` in the URL reproduces a world, so you can share one.

Add `?low` or `?high` to the URL to force a quality tier (touch devices default to low).

## How it's put together

| File | What it does |
|---|---|
| `scripts/build-assets.mjs` | `npm run assets` turns the kit's glTFs into compact GLBs in `public/models/` (WebP textures at 512 px, greyscale leaves so they can be tinted, no normal maps). Trees also get a ~4× lighter `LOD1` mesh: simplified bark plus fewer, larger leaf cards. |
| `src/terrain.js` | Seeded height function (fBm hills and ridged mountains, a calm valley at spawn), biome masks, and flat-shaded terrain tiles with per-face colours. Plain JS so it runs in workers. |
| `src/scatter.js` | Deterministic placement of trees, rocks, grass and flowers per chunk. |
| `src/gen.worker.js` | Generation worker. A small pool of these builds terrain tiles and scatter lists off the main thread and transfers the typed arrays back. |
| `src/world.js` | Streams 160 m chunks around the plane: queues jobs by distance, uploads finished tiles, and adds instances in time-sliced batches (≤1.5 ms per frame) so new land never causes a hitch. |
| `src/foliage.js` | Draws every plant and rock through one `BatchedMesh` per material, with per-instance tints (summer greens and autumn oranges), per-instance LOD switching by distance, and wind sway in the vertex shader, including shadows. |
| `src/input.js` | Mouse, keyboard, touch and gyroscope steering. Tilt is read as the gravity vector in screen space, so it works in portrait and landscape without angle flips. |
| `src/plane.js` | The paper plane mesh (with a canvas notebook-paper texture) and an arcade glider model: bank to turn, trade height for speed, stall recovery, soft bounces off ground and water. |
| `src/sky.js` | Gradient sky with sun and cirrus, drifting low-poly clouds, and animated low-poly water. |
| `src/effects.js` | Wingtip trails, wind streaks, pollen motes, splash puffs, and a flock of birds. |
| `src/rings.js` | Chains of wind rings that suggest routes through the landscape. |
| `src/audio.js` | Synthesised wind, a slow ambient pad and pentatonic chimes via WebAudio. No audio files are used. |
