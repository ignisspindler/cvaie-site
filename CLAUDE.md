# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current phase

The design hackathon is over. This is now **polish for handoff to the CvAIE
organizers**. Two 3D experiments came out of it and the handoff site should
carry elements of both:

| | This folder | Partner's project |
|---|---|---|
| Path | `/home/eugene/projects/cvaie-site` | `context/partner-cvaiex/` (cloned reference) |
| Source | local only, not a git repo | https://github.com/traviseden/cvaiex |
| Stack | Vite 8 + React 19 + React Three Fiber | Astro 7 + TypeScript + plain Three.js |
| Metaphor | the logo *is* the water; you dive and fly along it | a cosmic city; real Charlottesville geometry you fly through and walk inside |
| Scale | ~1200 lines, one page | ~2700 lines, static multi-page site, 7 test files, live Cloudflare deploy |

`context/partner-cvaiex/` is **read-only reference**: someone else's repo with
its own git history and its own `README.md`, `PLAN.md`, `DEVOPS.md`,
`STOREFRONTS.md`. Read it, port ideas and code out of it; don't commit into it.
Refresh with `git -C context/partner-cvaiex pull`. Its deps are installed, so
`npm run dev` in there serves the partner experience on :4321.

**The merge base is not decided.** Don't assume this folder wins because it's
the working directory — see "What the partner project has that this doesn't".

## Commands

```bash
npm run dev            # vite -> http://localhost:5173
npm run build          # -> dist/
npm run lint           # oxlint; react/rules-of-hooks is an error
npm run data:elevation # re-pull the USGS 3DEP grids (needs network)
```

No tests here yet. The partner project (Node 22.12+; Node 24 installed):

```bash
cd context/partner-cvaiex
npm run dev      # astro -> http://localhost:4321
npm test         # node --test tests/*.test.mjs -- fast, no browser
npx playwright test
```

The hackathon's "local only, no deploying" rule no longer applies: a handoff
implies the organizers can host it, and `context/partner-cvaiex/DEVOPS.md`
documents a verified assets-only Cloudflare path.

## The experience, end to end

Scroll progress `p` (0..1) drives a single flight. There is no other state.

1. **`p = 0`** — high above the logo, pitched ~79° down. The artwork reads whole.
2. **`p < FLIGHT.diveEnd`** (0.26) — nose-dive. Altitude collapses as `(1-t)^3`,
   so the slope is steepest the instant you tip over and flattens as it nears
   cruise; the pull-up reads as a pull-up rather than a corner. Pitch levels on a
   gentler power, so the nose is on the horizon slightly before the altitude
   settles.
3. **`p > diveEnd`** — level cruise forward along the logo's length, panels
   surfacing and sinking as you pass them.

`flightAt(p, openingScale)` in `src/lib/flight.js` is this path as a **pure
function** — no renderer, no THREE, assertable in isolation. `FlightRig` in
`src/scene/Scene.jsx` is the only thing that calls it.

## Architecture

### The logo is the surface

`src/lib/logoField.js` rasterizes `/CVAIE.svg` into an offscreen canvas **purely
as a measuring device** — that raster is never drawn — then walks a
`GRID_RESOLUTION` grid and emits one tile per sufficiently opaque cell, carrying
the sampled colour. Currently 17,513 tiles at grid 170 (61% coverage): the
artwork's own alpha carves the shape, so transparent regions stay empty rather
than filling the bounding box. Cells are box-averaged, not point-sampled,
because the trace is posterized into 29 hard colour bands and point sampling on
hard edges aliases into speckle.

`src/scene/LogoSurface.jsx` draws them in **one call**. It uses a plain `<mesh>`
with an `InstancedBufferGeometry` rather than an `InstancedMesh`, which avoids
`instanceMatrix` entirely — every tile's placement comes from its `aBase` and
the height field, so per-instance matrices would be dead weight filled with
identities. The material is a real `MeshStandardMaterial` patched via
`onBeforeCompile`: PBR lighting is kept (that's what makes highlights travel
across the ripples) and only *where a vertex sits* and *which way it faces* are
replaced. A little emissive in the tile's own colour keeps the artwork's navy
bands — almost black in linear space — from reading as holes at night.

Tiles **physically tilt** with the surface rather than being shaded as if they
did: `surfaceBasis()` builds a tangent frame from the height field's own
gradient. At an oblique angle that difference is the whole effect — you see
plates catching light, not a printed picture rippling.

### One height field, two languages

`src/lib/waves.js` is the single source of truth. The `WAVES` table generates
the GLSL (`WAVE_GLSL`, prepended to every shader that rides the surface) *and* a
JS mirror evaluates the same sum. That parity is why the CPU can ask how high
the surface is under a panel and get exactly what the vertex shader drew. Bulge,
foam and pointer constants are interpolated into the GLSL from the same JS
consts — retune there, never in a shader string.

Keep wavelengths long. Tiles sit ~1.1 world units apart; under ~8 the waves
shred the artwork instead of rippling it.

`sharedUniforms` (`uTime`, `uAnchors`, `uPointer`) is a module-level object that
`FlightRig` mutates in place. `uAnchors[i]` is `vec4(x, z, emerge, isSky)` and
its length is baked in as `ANCHOR_COUNT`, so adding an anchor recompiles the
shaders and `ANCHORS` order must match the uniform array order.

### The world-anchored panels are gone

`ANCHORS` is **empty**. Those panels surfaced out of the water and descended
from the sky during the run, but they arrived at semi-random screen positions
and competed with the deck that lands at the end. Their content moved: the next
meetup (and its live TBA state) to the hero, About Us into the deck's mission
card, the sponsor to the footer and the sponsors overlay.

The machinery below is intact -- add an entry to `ANCHORS` and it surfaces
again. One trap: a **zero-length uniform array is invalid GLSL**, so with no
anchors `waves.js` omits the array and both loops entirely and `bulgeAt`/
`foamAt` become constants, and `sharedUniforms` drops `uAnchors` to match. Edit
that block as a whole; half-removing it links a broken program, and the symptom
is the tile field silently not drawing at all.

### Panels are DOM, not geometry

`src/ui/EmergingPanel.jsx` panels are ordinary `position: fixed` DOM bound by
`id` to an anchor in `src/lib/anchors.js`. Once per frame `FlightRig` projects
the anchor and writes `--x`, `--y`, `--emerge` straight onto the node. **No
React state is touched in the frame loop** — scrolling must never re-render.
Text stays crisp and selectable and the page still works if WebGL never starts.

Each anchor has a `from`:

- `water` — bottom edge pinned to the surface point; the CSS mask sweeps *down*
  as `--emerge` climbs, so the top edge breaks through first. Bulges and foams
  the surface underneath.
- `sky` — top edge pinned; the same cut runs the *other* way, so the bottom
  arrives first as the panel descends. No bulge, no foam.

Two things in that loop are non-obvious and load-bearing:

- **Behind-camera guard.** `Vector3.project()` *mirrors* points behind the
  camera instead of failing, and the viewport clamp would then pin that garbage
  to an edge. `projected.z > 1` means we've flown past it; hide it.
- **Box measured once per appearance.** Reading `offsetWidth` every frame forces
  a layout, which is exactly what this rig exists to avoid.

Panels are clamped into the viewport: the anchor is a world point but the panel
is a fixed-width slab of text, so close to the camera a modest world offset
throws it off-screen. It drifts off its exact anchor rather than off the edge.

### Aspect

The camera's fov is vertical, so a phone sees a far narrower slice of world and
the logo overflows both sides from the distance that frames it on a laptop.
`openingScaleFor()` pushes the *opening* further out along its own vector —
composition identical, just smaller — and the fog range is scaled by the same
factor and tapered back as the dive lands, or the retreat renders the artwork
into haze. The cruise is untouched.

## Tuning

`src/config.js` is the control panel; prefer it to editing scene files.

| What | Where |
|---|---|
| Tile density, seams, shape, emissive | `FIELD` (`GRID_RESOLUTION` sets the instance count: cells = GRID^2, ~61% survive the mask) |
| Wave height / wavelength / speed | `SURFACE` (multipliers over the `WAVES` table) |
| Camera path, dive timing, cruise altitude | `FLIGHT` |
| Mouse ripple | `POINTER` |
| Vertical exaggeration, ground-following | `TERRAIN` |
| Sprite field / depth plane / old badge on-off | `LAYERS` |
| Panel positions along the flight, water vs sky | `src/lib/anchors.js` |
| Waterline cut, panel styling | `src/index.css` (`.panel--water`, `.panel--sky`) |

`LAYERS.spriteField` and `LAYERS.depthPlane` are both on so they can be judged
together and either switched off. `LAYERS.logoBadge` is **off**: `Logo.jsx` still
works, but the logo is the surface now, so a second floating badge competes with
it.

Verify changes in a browser, not by reasoning about the shader. A headless
SwiftShader capture runs at a few fps, and because the frame loop clamps `dt` to
0.1 s the damping under-integrates — panels will look stuck mid-emergence in
screenshots in a way they never do at 60 fps.

## Terrain

The logo is geo-registered. `FIELD.geo` pins the artwork to a **10-mile square
centred on lon -78.4940** -- the centroid of the Charlottesville building
snapshot -- so the flight runs down the middle of the logo and arrives over the
middle of the town. It used to centre on Monticello's own longitude, which sent
the trajectory across the city's eastern outskirts. World **-Z is north**, +X is
east, so the flight runs north by decreasing z, and the horizontal scale is
~84.7 m per world unit.

What the ground does along that centreline: ~164 m at 55% of the logo, climbing
to **400 m at about 75%** (the Carter Mountain / Ragged Mountains ridge), then
falling away continuously into the Rivanna valley and the city. Monticello
itself, 264 m, sits at the logo's north edge off to the **east** of the path --
which is what you actually see coming up from the south.

Moving the footprint means rebuilding both terrain grids
(`node scripts/build-terrain.mjs`) and recomputing `FIELD.land.clear`, because
both are expressed in world coordinates that this registration defines.

Vertical scale is deliberately not the horizontal one. At true scale the ridge
is 1.7 world units -- about the height of the ripple sitting on it, i.e.
invisible. `TERRAIN.exaggeration` is **2.5x**: enough that the ridge reads as a
ridge, not so much that the Piedmont turns into the Rockies (5x did). The cruise
**follows the ground**
(`TERRAIN.followGround`), holding height above terrain rather than above zero,
so cresting the ridge is flown rather than watched.

### The low-level run

`FLIGHT.cruiseY` is **1.5 units** (~130 m above ground): a terrain-hugging run,
not a survey. Three things make it work and all three are load-bearing:

- **Pitch follows the ground.** `groundSlope()` in `Scene.jsx` fits a least
  squares line through `TERRAIN.pitchLookahead` (14 units, ~1.2 km) of terrain
  ahead and adds it to the path's own pitch, scaled by `TERRAIN.pitchFollow`
  (0.8 -- a full 1.0 points the camera straight into the hillside and loses the
  horizon). Measured *ahead* rather than underfoot, so the nose leads the
  terrain. Over the Carter Mountain ridge this runs **+9 deg nose up on the
  climb to -22 deg nose down over the crest**, then levels into town.
  A two-point slope nods at every gully; the fit is what keeps it steady.
- **A hard clearance floor.** `TERRAIN.minClearance` (0.75) clamps the camera
  after damping. At this altitude the damping lags on a sharp crest and would
  otherwise put the view inside the hill.
- **The arrival lifts, and lifts early.** The city's tallest buildings reach
  1.91 world units near the flight line. Ramping from the ridge all the way to
  `endZ` left the camera **15 m under a 25.9 m roof** at z=-117, so
  `FLIGHT.arrivalToZ` (-112) finishes the lift *before* the tall cluster at
  z -122..-124. `arrivalY` 2.9 then holds ~0.99 units (84 m) of clearance over
  the tallest roofs, 0.74 units at worst anywhere over the city.

If `cruiseY`, `CITY.heightExaggeration` or `TERRAIN.exaggeration` move, that
clearance has to be re-checked: they all feed it.

Panel `rise` values in `anchors.js`, and `WATER_SINK`/`SKY_DESCENT` in
`Scene.jsx`, are sized against `cruiseY` too -- a panel that travels 12 units to
arrive is off-screen above a camera flying at 1.5.

Data flow:

- `npm run data:elevation` -> `data/elevation/` (54 MB, three tiers: ~6 m over
  the city, ~10 m over the flown strip, ~55 m for the horizon). These are the
  masters and are not shipped.
- `node scripts/build-terrain.mjs` -> `public/data/terrain.f32` + `.json`
  (2 MB, 640x800, ~26 m/sample), resampled onto the world's own XZ grid so the
  shader needs a linear lookup rather than a projection.
- `src/lib/terrain.js` loads it, exposes the CPU sampler, and builds a
  half-float `DataTexture`. Half, not full: linear filtering of `FloatType`
  needs an extension that is not guaranteed.

**`terrainHeight()` exists twice -- in `src/lib/terrain.js` and in the GLSL in
`src/lib/waves.js` -- and they must stay bilinear twins.** Panels are placed by
the CPU one and drawn by the GPU one; a disagreement shows up as a panel
floating off the surface it is supposed to be rising out of.

If the grid fails to load the surface goes flat and the page still works. That
is deliberate.

Source: USGS 3DEP, public domain. Credit "U.S. Geological Survey, 3D Elevation
Program". The raw export caps out around 8M pixels per request -- 3072x2304
returns, 3584x2688 500s -- which is well below the service's advertised 8000 px
image limit.

### Waves are off

`SURFACE.WAVE_AMPLITUDE` is **0**. The surface is terrain; swell on top of it
read as a jiggle in the background rather than as water. Zero-amplitude waves
are filtered out of `tuned`, so the generated GLSL carries no wave terms at all
rather than three that multiply to nothing on every vertex.

The machinery is intact and reversible: the `WAVES` table, the taper
(`waveState.mix` / `uWaveMix`, driven by FlightRig from full at the top of the
dive to `SURFACE.SETTLED_AMPLITUDE` once it lands) all still work. Raising
`WAVE_AMPLITUDE` brings them back.

`FLIGHT.bobAmplitude` and `FLIGHT.driftAmplitude` are **0** as well. Nothing in
the scene animates on its own any more: the flight is driven entirely by scroll,
so a still scroll position is a still frame. Verified by capturing successive
frames at a fixed scroll and watching the delta decay to one pixel -- any
residual motion in a capture is the damped camera still converging, which at a
real frame rate takes a fraction of a second.

The one thing that does still move under its own clock is the sprite field's
per-mote bob in `SpriteField.jsx`, and at ~0.12 world units it is under a pixel
on screen.

### Tiles stretch on slopes

`surfaceBasis()` deliberately does **not** normalise its tangents. Tiles are laid
out on a flat XZ grid, but on a slope the real distance between neighbours is
longer by 1/cos(slope); a unit basis leaves them flat-grid-sized and the surface
tears open into confetti wherever the ground is steep. The gradient's own length
is exactly the stretch each tile needs.

### Land beyond the artwork

`FIELD.land` adds ground north of the logo's edge in the artwork's own navy,
lifted (`#123f6b`) because the logo's darkest blue goes to near-black and stops
reading as a surface. It carries a coarser pitch (`pitchMultiplier`), which is
why tile size is a **per-instance attribute** (`aSize`) rather than a uniform:
artwork and ground are one draw call at two pitches.

Budget at grid 576: 192,528 logo + 48,168 land = **240,696 tiles**, under the
agreed 250k ceiling (the city's footprint gives some land tiles back). Widening the land band or lengthening the flight again means
taking it out of `GRID_RESOLUTION` or raising `land.pitchMultiplier`.

### The horizon

`src/scene/Horizon.jsx` replaced the old flat depth plane. It is one coarse
displaced mesh over `public/data/terrain-far.f32` (512x672, x[-580,280]
z[-880,200] -- the Blue Ridge west and the Shenandoah ~870 units / 74 km north,
reaching 1227 m, which is Hawksbill). Coloured by a hypsometric ramp in
`HORIZON.ramp`: the valley floor in navy, rising through the brand's blue to
white and to orange on the ridgelines.

Three things it has to get right:

- It samples the **fine** grid inside that grid's extent and the coarse one
  outside, cross-faded over a band, or the seam shows as a step.
- `HORIZON.drop` sits it below the tile surface. The tiles ride terrain plus
  ripple, so a horizon mesh at exactly terrain height is coplanar with them and
  they z-fight into a dark mottle.
- It carries **its own distance haze** and sets `fog={false}`. Scene fog tuned
  for the near field (far plane 620) would erase mountains 870 units out.

The ramp's first stop is the valley floor, not a shade above black: nearly all
the ground you fly over sits in the bottom 3% of a 95-1150 m range, so a dark
low end kills the whole foreground in order to light the horizon.

### The city

`src/lib/city.js` + `src/scene/City.jsx` put Charlottesville's real structures
and roads on the terrain: 10,360 buildings (406,639 triangles) and 22,919 road
segments, from the partner prototype's committed GIS snapshot. **City of
Charlottesville Open Data, CC BY 4.0 -- the attribution is in the page footer
and has to stay there.**

`public/data/city.json` is a copy of that snapshot (3.7 MB). Its coordinates are
already projected to metres from its own origin with +x east and **+y south**,
so `transformFor()` only changes units and moves the origin into this world --
there is no reprojection.

- Each building gets **one** base height, the lowest ground under its footprint.
  Per-vertex bases shear the walls on a slope; the mean leaves it floating on
  the downhill side.
- `CITY.heightExaggeration` (2.5) multiplies the terrain's own 2.5x. A 5 m house
  at true scale is 0.15 world units against a camera 2 units up: honest, and
  invisible.
- Buildings are translucent with `depthWrite: false`, or thousands of
  overlapping faces sort against each other and the town flickers.
- `FIELD.land.clear` removes land tiles over the city's footprint. A mosaic laid
  on top of the buildings buries them.
- `FLIGHT.arrivalX` is 0: the logo's registration already puts the straight
  trajectory through the city centroid, so the arrival needs no correction. It
  exists for the case where that stops being true.
- `CITY.roadColor` is deeper than it looks like it should be: ACES plus the 1.55
  exposure lifts a pale blue to white.

### Regional roads

`scripts/import-roads.mjs` pulls US Census **TIGER/Line** primary and secondary
roads (public domain) for Albemarle and the counties around it, projects them to
world XZ and writes `public/data/roads-region.f32` -- 76,403 segments, 1.2 MB.
Local roads are deliberately excluded: they run to ~180k vertices for a single
quarter-degree box, detail nothing at this altitude could show, and the city's
own streets already come from the Charlottesville snapshot.

Two things it has to get right:

- **Nothing is drawn over the logo.** Segments with either end inside the
  artwork's square are dropped at import (2,323 of them), rather than clipped to
  the boundary -- a road that stops dead at the edge reads better than one
  sliced mid-span.
- **Which ground a road sits on.** Two different things are drawn as ground: the
  tile field at terrain height, and the horizon mesh `HORIZON.drop` below it.
  `surfaceOffset()` in `src/lib/roads.js` asks which is actually underneath
  before lifting, or roads float over bare ground and sink under tiles.

Height is applied at runtime, not baked, because the vertical scale is a config
dial. That means the roads need the **horizon** grid, most of them lying outside
the fine one -- `loadFarTerrain()` caches its in-flight promise so the horizon
mesh and the roads cannot race and read a grid that has not landed.

### The content deck

`src/ui/ContentDeck.jsx` carries the rest of the site's content -- mission,
activities, join us, get involved, straight from
`context/content/site-content.md`. Four cards fly in radially from the upper
half of the viewport, starting once the ridge crest is behind the camera
(`DECK.fromZ`, the 400 m peak) and seated by the time the flight is over the
city centroid.

It follows the same discipline as the panels: the frame loop writes a single
`--deck` custom property onto each card and CSS does the rest in one transform,
so the arrival is scroll-driven with no React re-render. Each card carries its
own `--ox/--oy/--spin` from `entryOffset()`; `DECK_ANGLES` between 180 and 360
put a card above the viewport, because screen Y points down.

The deck also carries two overlays, built on native `<dialog>` so focus
trapping, Escape and the backdrop come from the platform:

- **Past meetups** (from the What We Do card). `scripts/build-meetups.mjs`
  parses `context/content/past-meetups.md` into `src/data/meetups.json` --
  18 entries, newest first -- rather than hand-copying it, so adding a meeting
  to the source means re-running the script. **The source carries event-page
  links only; there are no recordings in it**, and the overlay says so rather
  than implying video exists.
- **Sponsor and partners** (from the Get Involved card). Studio IX with its
  logo and the full "Learn More" detail, plus UVA School of Data Science as the
  host of the August 2026 joint event. Logos live in the overlay, not the cards,
  so they cannot disturb the deck's sizing.
  `context/content/CvilleLogo.png` is the **City of Charlottesville municipal
  seal**, not the Charlottesville Technologists meetup logo -- it is not used,
  because labelling it as the group's would be wrong and showing a city seal
  implies an endorsement that does not exist.

### Borders are a visible choice

The deck sits over a lit landscape, so one quiet border does not hold its edge.
`src/lib/borders.js` ships six treatments -- neon, brackets, scanline, circuit,
pulse, plate -- with a control under the deck that cycles them and remembers the
choice in `localStorage` (wrapped, because it throws outright in a private
window). Leaving the variation visible is truer to a site that came out of a
design bake-off than pretending one option won.

Three things that are easy to get wrong:

- `DECK.toZ` is **-124, four units short of the centroid at -128**. The camera
  is damped, so a deck that only finishes at the target is still a few percent
  out when the flight arrives -- which shows as the last card hanging off the
  right edge.
- The world-anchored panels in `anchors.js` all finish **before** `DECK.fromZ`.
  One still on screen when the deck seats lands underneath it.
- Reduced motion keeps the fade and drops the radial sweep, and stops the
  `pulse` border animating.
- **One orange, `#FA6107`**, measured from the artwork rather than chosen:
  90% of every orange pixel in `CVAIE.svg` falls in it. It is the CSS
  `--orange`, `PALETTE.spriteA`, `CITY.buildingColor` and the top stop of the
  horizon ramp, so the text, the borders, the buildings and the lit ridgelines
  are all the same colour. Buildings carry most of their own light
  (`CITY.buildingEmissive`): lit by the scene's warm key and pushed through
  ACES, this orange renders as mustard.
- The deck is pinned to the **top** of the frame (`.deck { top: 4vh }`) with
  `align-items: stretch`, so the cards are top-justified and equal height.

### Known gap

The city model is a separate mesh standing on the terrain, not integrated with
the tile surface -- there is no transition between mosaic and town beyond the
tile clearance. Buildings also carry no roofs beyond a triangle fan, which holds
for these footprints but would not for a concave one.

## Roadmap the user has stated

In rough order, none of it started:

1. Shape the tile field to the real topography — the valley, the rise to
   Monticello, the Shenandoah ridge beyond — so a visitor reads the actual shape
   of the place. The DEM above is for this.
2. Blend the flight into the partner project's Three.js map of Charlottesville
   streets and buildings (`context/partner-cvaiex/public/data/city.json`, with
   its meter-based projection in `src/lib/navigation.mjs`).
3. Decide the merge base and converge the two experiences into one handoff site.

## What the partner project has that this doesn't

Every one of these is absent here and would otherwise be built from scratch:

- **The full content inventory.** `context/content/site-content.md` is the
  canonical source. This project now covers hero, meetup/TBA, about, the Studio
  IX sponsor block with its "Learn More" details, contact and code of conduct —
  but not mission, activities or join.
- **Graceful degradation** — readable static pages with JS disabled or no WebGL,
  skip links, aria wiring, reduced-motion paths, touch controls.
- **Crawlable pages and machine-readable exports** — `/places/`, `/events/`,
  `/mall/`, `/about/`, `/data/`, plus `/content.md`, `llms.txt`, sitemap, JSON-LD.
- **Sourcing discipline** — places carry `source` and `coordinateStatus`, map
  data is attributed, estimated geometry is tracked. `PLAN.md` → "Acceptance
  before launch" is effectively the handoff checklist, and "Archive handoff" is
  the JSON shape to request from the organizers.
- **Tests that run without a browser.** Pure logic lives in dependency-free
  `.mjs` modules so `node --test` imports them with no DOM, no WebGL, no
  bundler. **Port logic out as `.mjs` to keep it testable.**

## Content rules

`context/content/site-content.md` is the canonical content source: keep the
words, reinvent layout, type, colour, imagery, motion.

**The TBA state is live, not hypothetical.** `NEXT_MEETUP.date` in
`src/App.jsx` mirrors `data/meetup.json` in the organizers' real repo and is
`2026-07-28` — already past — so the site renders "TBA: Check Meetup Page"
linking to the Meetup *group* page. Don't "fix" it to a future date; exercise
both branches when touching the logic. The partner project's `PLAN.md` goes
further: validate dates rather than trusting Meetup's own classification.

Note the partner project's palette was never signed off — `PLAN.md` says "Green
remains approved for now; palette decisions await the group" — so colour across
the merged site is an organizer question, not a settled fact.

## Other context/

`context/` holds the hackathon record: `README.md` (liaison brief),
`TEAM-HARNESS.md`, `INITIAL_PROMPT.md`, `content/` (seeded inputs and logo
masters), and `handoff/team-4/demo-snapshot/` — another team's `DESIGN.md`,
`PRODUCT.md` and multi-viewport screenshots. `context/concepts/eugene/CLAUDE.md`
is a leftover describing Dropbox shared-folder etiquette; it governed the event,
not this phase.
