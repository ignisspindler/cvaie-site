# Cville AI Explorers

A site for [Cville AI Explorers](https://www.meetup.com/cville-tech/), built as a
single scroll-driven flight.

The CvAIE logo is not a picture on the page: it is the ground. `CVAIE.svg` is
sampled onto a dense grid and rebuilt as ~193,000 instanced tiles, and those
tiles are displaced by real USGS elevation for a ten-mile square of Albemarle
County whose north edge is Monticello's ridge. You open looking straight down
at the artwork, dive, level out a hundred metres off the deck, climb the Carter
Mountain ridge, and drop into Charlottesville — where the city's actual
buildings and streets stand on the same terrain, with the Shenandoah on the
horizon.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

## How it works

Scroll progress drives everything; there is no other state. `flightAt()` in
`src/lib/flight.js` is the whole camera path as a pure function, and nothing in
the scene animates on its own — a still scroll position is a still frame.

The frame loop never touches React state. It writes CSS custom properties
straight onto DOM nodes, so the content panels are ordinary selectable text that
survives WebGL failing.

`src/config.js` is the control panel. Most things worth changing are one number
there: tile density, vertical exaggeration, the flight's altitude and timing,
the horizon's colour ramp.

## Data

Everything in the scene is real and sourced. Regenerate with:

```sh
npm run data:elevation          # USGS 3DEP elevation masters -> data/elevation/
node scripts/build-terrain.mjs  # resample onto the world grid -> public/data/
node scripts/import-roads.mjs   # TIGER/Line regional roads
node scripts/build-meetups.mjs  # past-meetups.md -> src/data/meetups.json
```

The derived files the site loads are committed, so a fresh clone runs without
network access. Only refreshing the sources needs it.

| What | Source | Licence |
|---|---|---|
| Elevation | [USGS 3D Elevation Program](https://www.usgs.gov/3d-elevation-program) | Public domain |
| Buildings, streets | [City of Charlottesville Open Data](https://opendata.charlottesville.org/) | CC BY 4.0 |
| Regional roads | US Census Bureau TIGER/Line | Public domain |
| Content, logo | Cville AI Explorers | — |

The City of Charlottesville's CC BY 4.0 attribution is in the page footer and
needs to stay there.

## Deploying

Static Vite build, no server or environment variables. On Vercel the defaults
are correct: build `npm run build`, output `dist`.

## Origin

Built for the CvAIE design bake-off (Meeting #17, September 2026), then carried
further. The border treatments on the content cards can still be cycled from the
page — the variation is left visible on purpose, because the site came out of a
bake-off and pretending one option won seemed worse than showing the choice.

`CLAUDE.md` holds the architectural detail: why the logo tiles stretch on
slopes, why the camera's pitch leads the terrain, why the horizon carries its
own haze, and the several traps that bite anyone changing them.
