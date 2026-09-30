# Paper Planes

A calm WebGL flight through an endless low-poly landscape: fly a folded
notebook-paper plane over meadows, lakes, autumn forests and snowy ridges,
and thread the glowing wind rings to pick up speed.

Built with [three.js](https://threejs.org) and [Vite](https://vite.dev).
Nature models are the Stylized Nature MegaKit by [Quaternius](https://quaternius.com) (CC0).

## What's in the sky

| Ring | What it does |
|---|---|
| Gold | +1 and a short gust of speed |
| ⚡ Swift (blue) | A strong 3-second speed burst |
| ★ Prism (rainbow) | Worth 5, and turns your trails rainbow for a while |
| ↻ Flip (pink) | Your plane does a loop-the-loop or a barrel roll |
| ? Shifter | Cycles through the colours above; you get whichever is showing |
| ◎ Portal (purple, with a light beam) | Takes you to a different world: Golden Hour, Winter Hush, Blossom Valley or Firefly Twilight |

Chain rings within a few seconds for a combo multiplier (up to ×5). Every ring
gives feedback: a coloured spark burst, a floating label, an edge flash, its
own sound and a vibration on phones.

There are also 8 animals to find, each in its own habitat: deer, foxes and
rabbits in meadows, bears in deep forest, goats on steep slopes, ducks and
leaping koi on lakes, and eagles circling the peaks. Fly close to one to add it
to your field journal (in the pause menu). The paw counter glows when an
undiscovered animal is nearby, and the journal is remembered between visits.

## How it flies

The flight model runs on fixed 120 Hz substeps, so it behaves the same at 30
or 144 fps. Bank and pitch follow the stick through critically damped springs
(no snaps, no overshoot), and stall and ceiling limits blend in rather than
clamp. A ground-effect cushion looks ahead at the terrain and your sink rate
and eases the nose up before contact, with a spring-damped soft floor as the
last resort, so skimming glides instead of bouncing. Gusts ramp in and out,
and leaf brushes drag you back over ~0.4 s instead of all at once.

The chase camera rides along with the plane's own velocity, so it doesn't
drift further behind as you speed up. It turns through springs and glides
over hills on a smoothed floor, and its shake is a low, soft rumble.

Ring chains are laid out one per 2×2-chunk area, centred in it, so chains
rarely cross and there's a breather between them.

**Flight settings** (pause menu): Speed (calm / normal / brisk), Steering
(gentle / normal / sharp), Assist (how strong the ground cushion is), Ring
spacing (relaxed / normal / busy: both the gap between rings and how often
chains appear), Camera distance, and Camera motion (calm tones down lean,
shake and speed FOV). Ring chains are re-laid for the new speed and spacing.

## Flow, air and journeys

**Flow** is the heart of the game. It builds when you fly with style and ebbs
when you coast, and it multiplies your score (×1 to ×5) and raises your
cruising speed. There's no failing, only flowing more or less.

| Builds flow | Costs flow |
|---|---|
| Skimming low over ground or water | Scraping the ground |
| Slipping close past a tree ("Close!") | Crashing through a canopy (leaves slow you down) |
| Threading rings, and completing a whole chain (slow-motion flourish) | Coasting for a while |
| Riding thermals, ridge lift and wind rivers | |
| Barrel rolls (Q / E, or double-tap left/right) | |

**The air is alive.** Thermals are columns of rising seeds over open ground:
circle inside them to climb without losing speed. Wind blowing up a hillside
gives ridge lift. Wind rivers are long ribbons of fast air: fly along one and
it sweeps you up to ~160 km/h and eases you down its course. A variometer
beeps (and the HUD shows ↑ m/s) when you're in rising air.

**Journeys** are three small goals at a time ("Ride wind rivers for 6 s",
"Slip past 5 trees", "Reach Flow ×4"...). Each earns stamps, and stamps unlock
new paper for your plane: graph paper, kraft, newsprint, washi blossoms,
blueprint and gold leaf. Progress is kept between visits.

## Writing a poem in flight

Half of all portals carry a word magnet: fly through one and you arrive in
**Dreaming Hours**, and that word will find its way back to you. (Or choose
**✎ Write a poem** on the title screen, or `?world=ethereal`.)

**Structure.** A poem starts by flying through a form: *haiku* (5-7-5, with a
syllable counter), *couplets* (rhyming pairs), *litany* (every line opens the
same way), *letter* (*dear … yours,*) or *free verse*. Each line then follows
one of ~20 sentence shapes (*the [adj] [noun] [verb]s* · *I [verb] you like a
[noun]* · *what if the [noun] [verb]s* · *there is a [noun] in the [noun]*…).
Glue words snap in on their own; you fly through the words that carry the
meaning, and the strip shows what the sentence needs next as a dashed magnet
(*a thing*, *what it does*, *where*). Verbs agree, nouns pluralise, *a* becomes
*an*, so every line is grammatical: a basic poem takes about five minutes.

**Serendipity.** Each handful mixes words that fit the drifting mood with
spice from a wider lexicon: wild adjectives (*feral, iridescent,
holographic*), generic pop culture (*sequel, cliffhanger, side quest*), Gen Z
lingo (*lowkey, unbothered, delulu, rent free*) and news nouns (*heatwave,
forecast, telescope, deadline*), all general so none of them is a dead end.
What you pick shapes what drifts in next. Phrase magnets (❝ *it's giving*,
*plot twist:*, *in this economy,*) re-route a sentence; closers (*on repeat*,
*after the credits*) end one.

**Depth.** ♪ tiles rhyme (or slant-rhyme) with the line before; ↺ tiles bring
back your own earlier words as refrains; ↵ ends a line wherever its shape
allows. Each finished line is read back with its notes; a finished poem is read
back whole, titled from its strongest image, and kept. On the fridge door (✎
or `O`) you can undo (also Backspace), finish a free-verse poem, choose a
title, share, or save it as an image.

The lyric core takes its cues from the themes and diction of James Baldwin and
Mumtaza Mehri (single words only; no lines are quoted).

## Flight School

The first flight is a short guided run: bank to turn, climb and dive, catch a
gust, thread three rings, and write a first line from four word clusters.
Every instruction is worded for the device you're using (mouse, keyboard,
tilt or touch) and follows along if you switch. It can be skipped, and
replayed from the pause menu.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run dev:phone  # HTTPS on your local network, to try tilt steering on a phone
npm run build    # static site in dist/
```

Phones only allow motion sensors on HTTPS pages. With `dev:phone`, open the
`https://192.168…` address it prints and accept the self-signed certificate warning.

## Controls

| | Desktop | Touch |
|---|---|---|
| Steer | Move the mouse (offset from screen centre), or WASD / arrows | Tilt the phone: rotate it like a steering wheel to bank, tip the top edge towards/away from you to climb/dive (drag to steer if motion access is denied) |
| Gust | Hold left click, Space or Shift | Touch and hold (two fingers when drag-steering) |
| Roll | `Q` / `E`, or double-click the left/right half | Double-tap the left/right half |
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
| `src/settings.js` | Flight experience settings (speed, steering, assist, ring spacing, camera), saved locally. |
| `src/plane.js` | The paper plane mesh (with a canvas notebook-paper texture) and an arcade glider model: bank to turn, trade height for speed, stall recovery, soft bounces off ground and water. |
| `src/sky.js` | Gradient sky with sun and cirrus, drifting low-poly clouds, and animated low-poly water. |
| `src/effects.js` | Wingtip trails, wind streaks, pollen motes, splash puffs, and a flock of birds. |
| `src/rings.js` | Ring types and their layout. Chains are planned from the flight model: rings are spaced by the speed you'll actually have there (including the previous ring's gust), turns stay under half of full bank and shrink as speed rises, climbs and descents are capped at 9° and 12°, and heights clear the ground and treetops without needless dips. |
| `scripts/ring-flight-test.cjs` | Simulated pilot that flies every chain with the real flight model and reports the hit rate; use it when tuning ring layout or handling. |
| `src/flow.js` | The Flow meter: what builds it, what drains it, and the cruise bonus it gives. |
| `src/air.js` | Thermals, ridge lift and wind rivers: generation, visuals and sampling the air at the plane. |
| `src/obstacles.js` | Tree canopies as soft obstacles (spatial hash) for leaf brushes and near misses. |
| `src/journeys.js` | Rotating goals, stamps and paper unlocks, saved locally. |
| `src/fx.js` | Ring feedback: spark bursts, floating labels, screen flash, haptics. |
| `src/animals.js` | Procedural low-poly animals: habitats, behaviours (grazing, fleeing, hopping, swimming, leaping, soaring) and discovery. |
| `src/themes.js` | The six world themes (including the Dreaming Hours poem world): sky, light, fog, terrain and foliage palettes, and ambient particles. |
| `src/lexicon.js` | The word magnets by part of speech, register (lyric, wild, pop, genz, news) and mood, plus phrase magnets. |
| `src/grammar.js` | Sentence patterns, poem forms, inflection, syllables and rhyme, and the Composer that picks each handful. |
| `src/onboarding.js` | Flight School: the device-aware first-flight tutorial. |
| `src/wordtiles.js` | 3D word magnets: canvas-drawn tiles that face you, drift, and get caught. |
| `src/poem.js` | The poem: magnet strip, fridge-door view, saving, sharing and image export. |
| `src/audio.js` | All sound, synthesised with WebAudio (no audio files): a generative score per world (key, mode, tempo, pad and melody voices on a look-ahead beat scheduler, with a rhythm layer that swells with gusts and combos); ring, word and discovery sounds pitched to the current chord; wind panned with your bank, paper flutter, ground rush, water; birdsong, crickets, wind chimes and animal calls; a generated reverb, music/effects buses, compressor and limiter. Music and Sounds sliders live in the pause menu. |
