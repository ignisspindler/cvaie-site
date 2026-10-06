// One place to retune the look. Everything else reads from here.
//
// The logo IS the surface: CVAIE.svg is sampled onto a dense grid and every
// opaque sample becomes one tile in an instanced field that ripples like water.
// The camera opens looking down on it, nose-dives, and pulls up into level
// flight along the logo's length while content panels surface around it.

export const FIELD = {
  svgUrl: '/CVAIE.svg',

  // Offscreen raster used ONLY to sample the SVG's colour/alpha field.
  // Never drawn to screen. 1254 is the artwork's own viewBox.
  RASTER: 2560,

  // Samples across the SVG width. The main density dial, and the one that
  // decides the instance count: cells = GRID^2, of which ~61% survive the alpha
  // mask. 640 lands just under 250k tiles, which is the agreed ceiling, and
  // puts one tile at ~25 m of real ground across the footprint below.
  GRID_RESOLUTION: 576,

  // Samples below this alpha become empty space, so the artwork's own
  // transparency defines the field's shape instead of its bounding box.
  ALPHA_THRESHOLD: 0.42,

  // The trace has no backdrop path, so alpha alone carves the shape. If a
  // future master bakes in a flat background, set this to reject it:
  //   backgroundKey: { color: '#faf9f5', tolerance: 0.05 }
  backgroundKey: null,

  // World footprint. Square, because the artwork is (viewBox 1254x1254).
  // The whole flight stays over the artwork, so growing this lengthens it.
  worldSize: 190,

  // Where the artwork sits on the actual earth.
  //
  // The centreline is lon -78.4940, which is the centroid of the Charlottesville
  // building snapshot: the flight runs straight down the middle of the logo and
  // arrives over the middle of the town. (It used to centre on Monticello's own
  // longitude, which sent the trajectory across the city's eastern outskirts.)
  //
  // Along that centreline the ground climbs to ~400 m at about 75% of the
  // logo -- the Carter Mountain / Ragged Mountains ridge -- then falls away
  // continuously into the Rivanna valley and the city. Monticello itself, at
  // 264 m, sits at the logo's north edge off to the EAST of the path, which is
  // what you actually see coming up from the south.
  //
  // worldSize / (north-south span) gives the horizontal scale: ~84.7 m per
  // world unit, one tile ~25 m. Vertical scale is deliberately NOT this -- see
  // TERRAIN.exaggeration, without which the ridge is too small to read.
  geo: {
    south: 37.8653,
    north: 38.0104,
    west: -78.5857,
    east: -78.4023,
    ridge: { lat: 38.0104, lon: -78.4526, elevation: 264.2 },
    metresPerUnit: 16093 / 190,
  },

  // Ground north of the logo's edge, carried in the artwork's own dark navy so
  // the surface continues as landscape rather than stopping at the ridge.
  land: {
    // The artwork's navy, lifted: at the logo's own darkest blue the ground
    // past the ridge goes to near-black and stops reading as a surface at all.
    color: '#123f6b',
    // Coarser than the artwork: it is further away and carries no detail, so
    // it buys the extent cheaply out of the same instance budget.
    pitchMultiplier: 2.4,
    minZ: -230,
    maxZ: -95,
    halfWidth: 130,

    // The town's own ground, kept clear of mosaic. Derived from the city
    // snapshot's declared bounds (-78.526,38.016 .. -78.462,38.055) through
    // this field's geo registration, plus a 6-unit margin. If the snapshot's
    // bounds change, recompute rather than nudging these by eye.
    clear: { minX: -39.2, maxX: 39.1, minZ: -159.4, maxZ: -96.3 },
  },

  // Fraction of a grid cell left empty, which is what makes the seams visible.
  // TILE_SIZE is derived: spacing * (1 - TILE_GAP).
  TILE_GAP: 0.10,

  // Tile shape. 'square' today; the builder is isolated in lib/logoField.js so
  // 'circle' and 'hex' can be added without touching the field or the shaders.
  TILE_SHAPE: 'square',

  // Lift the field off the depth plane so the gaps read as depth, not sky.
  baseHeight: 0,

  metalness: 0.22,
  roughness: 0.52,

  // A little self-illumination so the artwork's dark navy bands still read
  // against a night surface. Above ~0.35 the relief flattens out.
  emissive: 0.17,
}

// The Z surface. Low-frequency travelling waves only -- adjacent tiles must
// differ by almost nothing or the logo stops reading. See lib/waves.js for the
// wave table these multipliers scale.
export const SURFACE = {
  // Off. The surface is terrain now, and the swell on top of it read as a
  // distracting jiggle in the background rather than as water. The wave table
  // and its taper are kept intact below -- raising this brings them back.
  WAVE_AMPLITUDE: 0,

  // How much of the wave would survive once the dive has landed, if waves were
  // on at all. Moot while WAVE_AMPLITUDE is 0.
  SETTLED_AMPLITUDE: 0.14,
  WAVE_SCALE: 1.0,            // >1 stretches wavelengths (calmer, broader)
  WAVE_SPEED: 1.0,
  SECONDARY_WAVE_AMPLITUDE: 1.0,  // scales the short chop only
}

// Pointer disturbance: a finger on water, not an explosion.
export const POINTER = {
  ENABLE_POINTER_RIPPLE: true,
  radius: 14,          // world units of influence
  strength: 0.85,      // peak extra height
  relax: 2.4,          // how fast the disturbance decays once the pointer stops
}

// The flight. Progress p is 0..1 from document scroll.
//
// p=0            high and pitched almost straight down: the logo reads whole.
// 0 -> diveEnd   nose-dive, altitude collapsing, pitch easing up to level.
// diveEnd -> 1   level cruise forward along the logo's length.
export const FLIGHT = {
  startY: 327,
  startZ: 150,
  startPitch: -76,     // degrees; -90 is straight down

  cruiseY: 1.5,       // ~130 m above the ground: a low-level run, not a survey
  cruisePitch: -2.5,
  cruiseZ: 92,         // where the dive bottoms out and the cruise begins

  endZ: -175,          // over Charlottesville, well past the ridge

  // The arrival. Past the ridge the cruise keeps letting down, so the far side
  // of Monticello is a continuous descent into the city rather than a level
  // run at the same height you crossed at.
  arrivalFromZ: -95,   // start the lift at the ridge
  // ...and finish it BEFORE downtown rather than at the end of the flight. The
  // tall cluster sits at z -122..-124; ramping all the way to endZ put the
  // camera 15 m UNDER a 25.9 m roof on the way in.
  arrivalToZ: -112,
  arrivalY: 2.9,       // clears downtown's tallest roofs (1.91u) with ~1u to spare

  // Zero now that the logo is centred on the city: the straight trajectory
  // already runs through the centroid, so the arrival needs no correction.
  arrivalX: 0,
  // The dive lands on the logo's NEAR edge -- its bottom arc -- not its middle,
  // so the cruise crosses the artwork's full height. Starting the opening from
  // behind that edge is what makes the descent travel forward onto it.
  diveEnd: 0.26,       // p at which the pull-up completes

  // Both off: this idle float was the remaining jitter. The flight is driven
  // entirely by scroll now, so a still scroll position is a still frame.
  bobAmplitude: 0,     // idle vertical float during cruise
  driftAmplitude: 0,   // idle lateral sway
  damping: 3.4,        // scroll -> camera smoothing (higher is tighter)
}

// Layers we can switch off once we've seen them together, per your call.
export const LAYERS = {
  spriteField: true,   // 26k motes above the surface
  depthPlane: true,    // dark shader plane under the tiles
  logoBadge: false,    // the old extruded SVG badge; the logo is the surface now
}

// Real Charlottesville ground under the artwork. USGS 3DEP, resampled onto the
// world grid by scripts/build-terrain.mjs.
export const TERRAIN = {
  enabled: true,

  // Horizontal scale is ~84.7 m per world unit, so at true vertical scale
  // Monticello's 144 m rise above the valley is 1.7 units -- about the height
  // of the ripple on top of it, i.e. invisible. 5x is what makes the ridge
  // read as a ridge while keeping the landform recognisably Piedmont.
  exaggeration: 2.5,

  // Metres that map to world height 0. Roughly the Rivanna valley floor, so
  // the city sits near zero and the ridge stands well above it.
  datum: 120,

  // How high above the ground the cruise holds, in world units. The camera
  // tracks the terrain rather than a fixed altitude, so cresting the ridge and
  // dropping into the valley beyond are things you feel.
  followGround: true,

  // Nose follows the ground's slope: up the climb to the ridge, level across
  // the crest, down the far side into the town. 1 would point the camera
  // exactly along the terrain; a little under keeps the horizon in frame
  // instead of burying the view in the hillside.
  pitchFollow: 0.8,

  // How far ahead the slope is measured, in world units (~850 m). Short enough
  // to react to the ridge, long enough that single gullies do not nod the
  // camera -- the grid is ~26 m per sample.
  pitchLookahead: 14,

  // Hard floor under the damped camera. At this altitude the damping lags on a
  // sharp crest and would otherwise put the view inside the hill.
  minClearance: 0.75,
}

export const SPRITES = {
  count: 26000,
  radius: 150,
  spread: 120,         // how far ahead/behind the flight path they scatter
}

// Fog, as tuned for the cruise. The opening scales these with its own distance
// (see FlightRig) so a narrow viewport, which has to pull much further back to
// fit the artwork, does not just render it into the haze.
export const FOG = { near: 190, far: 620 }

// The horizon: real ground you never fly over. Coloured by elevation rather
// than by the artwork, so northern Albemarle and the Shenandoah read as country.
export const HORIZON = {
  enabled: true,
  segments: [384, 512],
  // Hypsometric ramp, in metres. Low ground sits in the artwork's navy and the
  // ridgelines come up through the brand's own blue and orange.
  ramp: {
    low: 95,
    high: 1150,
    stops: [
      // The valley floor is the FIRST stop, not a shade above black: almost all
      // the ground you fly over sits in the bottom 3% of this range, so a dark
      // low end kills the whole foreground to light the horizon.
      // Pushed out deliberately. Almost everything you fly over sits between
      // 95 and 300 m, so an early blue stop lights ordinary Piedmont ground up
      // like water. Below ~330 m stays navy; only real relief takes the ramp.
      [0.00, '#15385e'],
      [0.22, '#1d548c'],
      [0.45, '#5a9fe0'],
      [0.70, '#e4edf7'],
      [1.00, '#FA6107'],
    ],
  },
  // Its own distance haze, because scene fog tuned for the near field would
  // erase mountains 70 km out entirely.
  // Sit below the tile surface, or the two are coplanar and z-fight into a dark
  // mottle. With the waves off the tiles no longer ride a ripple, so this only
  // has to clear a tilted tile's corners rather than the old swell.
  drop: 0.4,

  hazeNear: 150,
  hazeFar: 1250,
}

// The real city, from the partner prototype's committed GIS snapshot.
// City of Charlottesville Open Data, CC BY 4.0.
export const CITY = {
  enabled: true,
  // The logo's own orange. #FA6107 is the artwork's dominant orange fill --
  // 90% of every orange pixel in CVAIE.svg sits in it -- and it is the single
  // value shared by the CSS --orange, PALETTE.spriteA and the horizon's peaks.
  // Translucent so the structures read as a field over the ground rather than
  // a solid block, and so the terrain still shows through them from above.
  buildingColor: '#FA6107',

  // Mostly self-lit. Lit by the scene's warm key and pushed through ACES, this
  // orange lands as mustard; carrying its own light keeps the hue the logo's.
  buildingEmissive: 0.3,
  buildingOpacity: 0.5,
  // Deeper than it looks like it should be: ACES plus the 1.55 exposure lifts
  // a pale blue to white, and the roads stop reading as blue at all.
  roadColor: '#2f7fcc',
  roadOpacity: 0.7,

  // On top of the terrain's own 2.5x. A 5 m house at true scale is 0.15 world
  // units against a camera 2 units up -- honest, and invisible. This lifts the
  // structures to where they read as a city from the air.
  heightExaggeration: 2.5,
  // Clear of the ground without floating: the tiles ripple by ~0.14 units.
  roadLift: 0.07,
  // Land tiles stop inside this much of the city's footprint, so the mosaic
  // gives way to the town instead of burying it.
  clearMargin: 6,
}

// The content deck's arrival, in world Z. It starts once the ridge crest is
// behind the camera and is complete over the middle of the city, so the cards
// are seated exactly when there is something to read them against.
export const DECK = {
  fromZ: -49,          // the 400 m crest
  // Four units short of the centroid (-128), not exactly on it: the camera is
  // damped, so a deck that only finishes at the target is still a few percent
  // out when the flight gets there. This seats them BY the centroid.
  toZ: -124,
  distance: 118,       // vmax each card starts out at: comfortably off-screen
  stagger: 0.1,        // per-card head start; all still land together at 1
}

export const PALETTE = {
  deepWater: '#04101f',
  shallowWater: '#0a2f52',
  sky: '#061426',
  foam: '#d9e8f7',
  spriteA: '#FA6107',       // CvAIE orange, measured from the artwork
  spriteB: '#66A7E8',       // node blue
}

// The old extruded badge. Kept behind LAYERS.logoBadge so it can come back.
export const LOGO = {
  url: '/CVAIE_logo_vector.svg',
  get mode() {
    return this.url.includes('_vector') ? 'extrude' : 'trace'
  },
  worldWidth: 6.2,
  position: [0, 2.9, -1.5],
  reflection: true,
  // SVGLoader cannot resolve gradient fills; map them to a flat colour.
  gradients: {
    navyDepth: '#0B3B6F',
    orangeDepth: '#FF7A1A',
  },
}
