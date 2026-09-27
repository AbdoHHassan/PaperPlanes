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
| Steer | Move the mouse (offset from screen centre), or WASD / arrows | Drag anywhere |
| Gust | Hold left click, Space or Shift | Hold a second finger |
| Other | `M` mute · `I` invert pitch · `H` hide HUD · `P`/`Esc` pause | |

Add `?low` or `?high` to the URL to force a quality tier (touch devices default to low).

## How it's put together

| File | What it does |
|---|---|
| `scripts/build-assets.mjs` | `npm run assets` turns the kit's glTFs into compact GLBs in `public/models/` (WebP textures at 512 px, greyscale leaves so they can be tinted, no normal maps). |
| `src/terrain.js` | Height function (fBm hills and ridged mountains, a calm valley at spawn), biome masks, and flat-shaded terrain tiles with per-face colours. |
| `src/world.js` | Streams 160 m chunks around the plane with terrain LODs, and scatters trees, rocks, grass and flowers deterministically per chunk. |
| `src/foliage.js` | Draws every plant and rock through one `BatchedMesh` per material, with per-instance tints (summer greens and autumn oranges) and wind sway in the vertex shader, including shadows. |
| `src/plane.js` | The paper plane mesh (with a canvas notebook-paper texture) and an arcade glider model: bank to turn, trade height for speed, stall recovery, soft bounces off ground and water. |
| `src/sky.js` | Gradient sky with sun and cirrus, drifting low-poly clouds, and animated low-poly water. |
| `src/effects.js` | Wingtip trails, wind streaks, pollen motes, splash puffs, and a flock of birds. |
| `src/rings.js` | Chains of wind rings that suggest routes through the landscape. |
| `src/audio.js` | Synthesised wind, a slow ambient pad and pentatonic chimes via WebAudio. No audio files are used. |
