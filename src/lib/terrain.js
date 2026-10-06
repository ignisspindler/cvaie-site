import * as THREE from 'three'
import { TERRAIN } from '../config.js'

// Real Charlottesville ground, as a height field both the CPU and the GPU can
// read. Built by scripts/build-terrain.mjs from USGS 3DEP; see public/data/
// terrain.json for extent and provenance.
//
// Elevation data courtesy of the U.S. Geological Survey, 3D Elevation Program.

/** Null until the fetch lands. Everything degrades to flat water until then. */
export const terrain = {
  ready: false,
  data: null,
  width: 0,
  height: 0,
  extent: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
  /** Metres -> world units, already carrying the vertical exaggeration. */
  scale: 0,
  datum: TERRAIN.datum,
  texture: null,
  meta: null,
}

/**
 * Ground height in world units, bilinear, matching the GLSL exactly.
 *
 * The two have to agree: panels are placed from this one and drawn by that one,
 * and a disagreement shows up as a panel floating off the surface it is
 * supposed to be rising out of.
 */
export function terrainHeight(x, z) {
  if (!terrain.ready) return 0
  const { data, width: w, height: h, extent: e } = terrain

  const fx = ((x - e.minX) / (e.maxX - e.minX)) * (w - 1)
  const fz = ((z - e.minZ) / (e.maxZ - e.minZ)) * (h - 1)
  const cx = Math.min(Math.max(fx, 0), w - 1)
  const cz = Math.min(Math.max(fz, 0), h - 1)

  const x0 = Math.floor(cx)
  const z0 = Math.floor(cz)
  const x1 = Math.min(x0 + 1, w - 1)
  const z1 = Math.min(z0 + 1, h - 1)
  const tx = cx - x0
  const tz = cz - z0

  const a = data[z0 * w + x0]
  const b = data[z0 * w + x1]
  const c = data[z1 * w + x0]
  const d = data[z1 * w + x1]
  const metres = (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz

  return (metres - terrain.datum) * terrain.scale
}

/** The coarse, much wider grid the horizon mesh reads. */
export const farTerrain = {
  ready: false, width: 0, height: 0, extent: null, texture: null, meta: null,
  data: null,
}

/** Bilinear metres from a raw grid. Row 0 is minZ, column 0 is minX. */
function sampleGrid(grid, x, z) {
  const { data, width: w, height: h, extent: e } = grid
  const fx = Math.min(Math.max(((x - e.minX) / (e.maxX - e.minX)) * (w - 1), 0), w - 1)
  const fz = Math.min(Math.max(((z - e.minZ) / (e.maxZ - e.minZ)) * (h - 1), 0), h - 1)
  const x0 = Math.floor(fx), z0 = Math.floor(fz)
  const x1 = Math.min(x0 + 1, w - 1), z1 = Math.min(z0 + 1, h - 1)
  const tx = fx - x0, tz = fz - z0
  const a = data[z0 * w + x0], b = data[z0 * w + x1]
  const c = data[z1 * w + x0], d = data[z1 * w + x1]
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz
}

const within = (e, x, z) => x >= e.minX && x <= e.maxX && z >= e.minZ && z <= e.maxZ

/**
 * Ground height anywhere, in world units: the fine grid inside its extent and
 * the coarse horizon grid beyond it. The GPU does the same thing in
 * Horizon.jsx -- keep the two in step.
 */
export function groundHeight(x, z) {
  if (terrain.ready && within(terrain.extent, x, z)) return terrainHeight(x, z)
  if (!farTerrain.ready) return 0
  return (sampleGrid(farTerrain, x, z) - terrain.datum) * terrain.scale
}

function halfFloatTexture(data, width, height) {
  const half = new Uint16Array(width * height)
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i])
  const t = new THREE.DataTexture(half, width, height, THREE.RedFormat, THREE.HalfFloatType)
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.needsUpdate = true
  return t
}

// Both grids are wanted by more than one component, so the in-flight promise is
// cached: without this the horizon and the regional roads race, and whichever
// builds first can read a grid that has not landed yet and sit at height zero.
let farPending = null

/** Load the horizon grid. Metres stay metres: the ramp is keyed to elevation. */
export function loadFarTerrain(base = '/data/terrain-far') {
  if (farTerrain.ready) return Promise.resolve(farTerrain)
  farPending ??= fetchFarTerrain(base).catch((e) => { farPending = null; throw e })
  return farPending
}

async function fetchFarTerrain(base) {
  const meta = await fetch(`${base}.json`).then((r) => {
    if (!r.ok) throw new Error(`horizon metadata ${r.status}`)
    return r.json()
  })
  const buffer = await fetch(`${base}.f32`).then((r) => {
    if (!r.ok) throw new Error(`horizon grid ${r.status}`)
    return r.arrayBuffer()
  })
  const data = new Float32Array(buffer)
  farTerrain.width = meta.width
  farTerrain.height = meta.height
  farTerrain.extent = meta.extent
  farTerrain.data = data
  farTerrain.texture = halfFloatTexture(data, meta.width, meta.height)
  farTerrain.meta = meta
  farTerrain.ready = true
  return farTerrain
}

/** Load the grid and build the texture the shaders sample. */
export async function loadTerrain(base = '/data/terrain') {
  const meta = await fetch(`${base}.json`).then((r) => {
    if (!r.ok) throw new Error(`terrain metadata ${r.status}`)
    return r.json()
  })
  const buffer = await fetch(`${base}.f32`).then((r) => {
    if (!r.ok) throw new Error(`terrain grid ${r.status}`)
    return r.arrayBuffer()
  })

  const expected = meta.width * meta.height
  const data = new Float32Array(buffer)
  if (data.length < expected) {
    throw new Error(`terrain grid short: ${data.length} of ${expected} samples`)
  }

  // Half float, not full: linear filtering of FloatType needs an extension that
  // is not guaranteed, while half is core in WebGL2. At these elevations its
  // precision is about 0.25 m, which is 0.015 world units once scaled -- far
  // below anything visible.
  const half = new Uint16Array(expected)
  for (let i = 0; i < expected; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i])

  const texture = new THREE.DataTexture(
    half, meta.width, meta.height, THREE.RedFormat, THREE.HalfFloatType,
  )
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  terrain.data = data
  terrain.width = meta.width
  terrain.height = meta.height
  terrain.extent = meta.extent
  terrain.datum = TERRAIN.datum
  terrain.scale = TERRAIN.exaggeration / meta.metresPerWorldUnit
  terrain.texture = texture
  terrain.meta = meta
  terrain.ready = true
  return terrain
}
