import * as THREE from 'three'
import { ANCHORS } from './anchors.js'
import { SURFACE, POINTER } from '../config.js'
import { terrain, terrainHeight } from './terrain.js'

// The single source of truth for the surface the logo tiles ride.
//
// The GLSL below is GENERATED from this table, and the JS functions evaluate
// the same sum. That parity is the whole trick: the CPU can ask "how high is
// the surface under this panel?" and get exactly what the vertex shader drew.
//
// Keep these low-frequency. Adjacent tiles sit ~1.1 world units apart, so a
// wavelength under ~8 starts to shred the artwork instead of rippling it.
export const WAVES = [
  { dir: [1.0, 0.22], amp: 0.55, len: 46.0, speed: 0.55, chop: false },
  { dir: [-0.6, 1.0], amp: 0.30, len: 27.0, speed: 0.80, chop: false },
  { dir: [0.7, 0.7], amp: 0.14, len: 13.0, speed: 1.25, chop: true },
]

const TAU = Math.PI * 2
const normalize = ([x, y]) => {
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}

// --- bulge/foam tuning, shared by both sides -------------------------------
const BULGE_HEIGHT = 1.6
const BULGE_FALLOFF = 42.0   // exp(-r^2 / this)
const FOAM_RADIUS = 4.2
const FOAM_WIDTH = 1.4

/**
 * Per-wave amplitude and frequency after the config multipliers.
 *
 * Waves that come out at zero amplitude are dropped rather than carried: with
 * SURFACE.WAVE_AMPLITUDE at 0 this leaves the generated GLSL with no wave terms
 * at all instead of three that multiply out to nothing every vertex.
 */
const tuned = WAVES.map((w) => {
  const [dx, dz] = normalize(w.dir)
  const amp = w.amp * SURFACE.WAVE_AMPLITUDE *
    (w.chop ? SURFACE.SECONDARY_WAVE_AMPLITUDE : 1)
  return {
    dx, dz, amp,
    freq: TAU / (w.len * SURFACE.WAVE_SCALE),
    speed: w.speed * SURFACE.WAVE_SPEED,
  }
}).filter((w) => w.amp !== 0)

/** Travelling-wave height only (no bulge, no pointer, no terrain). */
export function waveHeight(x, z, t) {
  let h = 0
  for (const w of tuned) {
    h += Math.sin((w.dx * x + w.dz * z) * w.freq + t * w.speed) * w.amp
  }
  return h
}

/** Full surface height: waves + terrain + panel bulges + pointer disturbance. */
export function surfaceHeight(x, z, t) {
  let h = waveHeight(x, z, t) * waveState.mix + terrainHeight(x, z)

  for (const a of ANCHORS) {
    if (a.from === 'sky') continue
    const dx = x - a.pos.x
    const dz = z - a.pos.z
    h += a.emerge * BULGE_HEIGHT * Math.exp(-(dx * dx + dz * dz) / BULGE_FALLOFF)
  }

  if (POINTER.ENABLE_POINTER_RIPPLE && pointer.strength > 0.001) {
    const dx = x - pointer.x
    const dz = z - pointer.z
    const r2 = (dx * dx + dz * dz) / (POINTER.radius * POINTER.radius)
    h += pointer.strength * POINTER.strength * Math.exp(-r2 * 2.2)
  }

  return h
}

/** Where the pointer is touching the surface, and how hard. */
export const pointer = { x: 0, z: 0, strength: 0 }

/**
 * How much of the travelling wave is currently in the surface.
 *
 * 1 while the logo is still water seen from above, falling to
 * SURFACE.SETTLED_AMPLITUDE as the dive lands, so the form hands over from
 * swell to terrain. FlightRig drives it and mirrors it into uWaveMix.
 */
export const waveState = { mix: 1 }

// --- GLSL generation -------------------------------------------------------
const waveLines = tuned.map((w) =>
  `  h += sin(dot(vec2(${w.dx.toFixed(6)}, ${w.dz.toFixed(6)}), p) * ${w.freq.toFixed(6)} + t * ${w.speed.toFixed(6)}) * ${w.amp.toFixed(6)};`
).join('\n')

/**
 * Prepend to any shader that needs to sit on the surface.
 * Provides: waveHeight(), bulgeAt(), foamAt(), surfaceHeight(), surfaceNormal().
 * Expects uniforms `uAnchors[ANCHOR_COUNT]` (vec4 worldX, worldZ, emerge, isSky)
 * and `uPointer` (vec3 worldX, worldZ, strength).
 */
// A zero-length uniform array is invalid GLSL, so with no anchors the array and
// both loops are left out entirely and the two functions become constants.
const anchorGLSL = ANCHORS.length ? /* glsl */ `
#define ANCHOR_COUNT ${ANCHORS.length}
uniform vec4 uAnchors[ANCHOR_COUNT];

float bulgeAt(vec2 p) {
  float b = 0.0;
  for (int i = 0; i < ANCHOR_COUNT; i++) {
    if (uAnchors[i].w > 0.5) continue;
    vec2 d = p - uAnchors[i].xy;
    b += uAnchors[i].z * ${BULGE_HEIGHT.toFixed(4)} * exp(-dot(d, d) / ${BULGE_FALLOFF.toFixed(4)});
  }
  return b;
}

float foamAt(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < ANCHOR_COUNT; i++) {
    if (uAnchors[i].w > 0.5) continue;
    float r = length(p - uAnchors[i].xy);
    f += uAnchors[i].z * smoothstep(${FOAM_WIDTH.toFixed(4)}, 0.0, abs(r - ${FOAM_RADIUS.toFixed(4)}));
  }
  return clamp(f, 0.0, 1.0);
}
` : /* glsl */ `
float bulgeAt(vec2 p) { return 0.0; }
float foamAt(vec2 p) { return 0.0; }
`

export const WAVE_GLSL = /* glsl */ `
${anchorGLSL}
uniform vec3 uPointer;

float waveHeight(vec2 p, float t) {
  float h = 0.0;
${waveLines}
  return h;
}

uniform float uWaveMix;
uniform sampler2D uTerrain;
// (minX, minZ, 1/spanX, 1/spanZ)
uniform vec4 uTerrainExtent;
// (metres->units incl. exaggeration, datum metres, 0 or 1 while loading)
uniform vec3 uTerrainScale;

// Must stay the bilinear twin of terrainHeight() in lib/terrain.js: panels are
// placed by that one and drawn by this one.
float terrainHeight(vec2 p) {
  vec2 uv = (p - uTerrainExtent.xy) * uTerrainExtent.zw;
  float metres = texture2D(uTerrain, clamp(uv, 0.0, 1.0)).r;
  return (metres - uTerrainScale.y) * uTerrainScale.x * uTerrainScale.z;
}


float pointerAt(vec2 p) {
  vec2 d = p - uPointer.xy;
  float r2 = dot(d, d) / ${(POINTER.radius * POINTER.radius).toFixed(4)};
  return uPointer.z * ${POINTER.strength.toFixed(4)} * exp(-r2 * 2.2);
}


float surfaceHeight(vec2 p, float t) {
  return waveHeight(p, t) * uWaveMix + terrainHeight(p) + bulgeAt(p) + pointerAt(p);
}

/**
 * Tangent basis from the height field's own gradient, so a tile physically
 * tilts with the surface instead of being shaded as if it did. At an oblique
 * angle that difference is the whole effect: you see plates catching light.
 *
 * The tangents are deliberately NOT normalised. Tiles are laid out on a flat
 * XZ grid, but on a slope the real distance between neighbours is longer by
 * 1/cos(slope); a unit basis leaves tiles their flat-grid size and the surface
 * tears open into confetti wherever the ground is steep. Keeping the gradient's
 * own length stretches each tile to exactly cover its share of the slope.
 */
void surfaceBasis(vec2 p, float t, float e, out vec3 tangent, out vec3 bitangent, out vec3 normal) {
  float h = surfaceHeight(p, t);
  float hx = surfaceHeight(p + vec2(e, 0.0), t);
  float hz = surfaceHeight(p + vec2(0.0, e), t);
  tangent = vec3(1.0, (hx - h) / e, 0.0);
  bitangent = vec3(0.0, (hz - h) / e, 1.0);
  normal = normalize(cross(bitangent, tangent));
}
`

/** Uniform block shared by every material that rides the surface. */
export const sharedUniforms = {
  uTime: { value: 0 },
  // Omitted entirely when there are no anchors: the shader does not declare it.
  ...(ANCHORS.length ? { uAnchors: { value: ANCHORS.map(() => new THREE.Vector4()) } } : {}),
  uPointer: { value: new THREE.Vector3() },
  uWaveMix: { value: 1 },
  // A 1x1 placeholder until the grid lands; the third component gates it to
  // zero so the surface is simply flat rather than sunk by the datum.
  uTerrain: { value: new THREE.DataTexture(new Uint16Array(1), 1, 1, THREE.RedFormat, THREE.HalfFloatType) },
  uTerrainExtent: { value: new THREE.Vector4(0, 0, 1, 1) },
  uTerrainScale: { value: new THREE.Vector3(0, 0, 0) },
}

/** Point the shared uniforms at a loaded terrain grid. */
export function bindTerrain() {
  if (!terrain.ready) return false
  const e = terrain.extent
  sharedUniforms.uTerrain.value = terrain.texture
  sharedUniforms.uTerrainExtent.value.set(
    e.minX, e.minZ, 1 / (e.maxX - e.minX), 1 / (e.maxZ - e.minZ),
  )
  sharedUniforms.uTerrainScale.value.set(terrain.scale, terrain.datum, 1)
  return true
}

export { terrainHeight }
