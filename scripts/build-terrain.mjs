// Resample the raw USGS grids onto the world's own XZ grid, so the shader can
// look up ground height with a plain linear mapping instead of carrying a
// projection around.
//
//   node scripts/build-terrain.mjs
//
// Writes public/data/terrain.f32 (+ .json), which is small enough to ship.
// The raw tiles under data/elevation/ stay the masters.
//
// World axes, fixed by how the logo is sampled in lib/logoField.js: the camera
// looks down -Y with no yaw, which puts world -Z at the top of the screen. The
// artwork's top maps there, and the artwork's top edge is Monticello's ridge.
// So -Z is NORTH, +X is EAST, and the flight runs north by decreasing z.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIELD } from '../src/config.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'data', 'elevation')
const OUT = join(ROOT, 'public', 'data')

// The slab of world the flight can see ground in. Z runs well past the logo's
// north edge so the descent on the far side of the ridge has real ground under
// it all the way over Charlottesville; X is wider than the logo so the land
// band either side has ground too.
const EXTENT = { minX: -140, maxX: 140, minZ: -260, maxZ: 100 }
const SIZE = { w: 896, h: 1152 }

// The horizon: everything you can see but never fly over. Reaches the Blue
// Ridge crest west and the Shenandoah north, which is ~870 world units out --
// about 74 km, which is a real sightline on a clear day.
const FAR_EXTENT = { minX: -580, maxX: 280, minZ: -880, maxZ: 200 }
const FAR_SIZE = { w: 512, h: 672 }

const { geo, worldSize } = FIELD
const half = worldSize / 2

/** World XZ -> WGS84. -Z is north, +X is east. */
const lonAt = (x) => geo.west + ((x + half) / worldSize) * (geo.east - geo.west)
const latAt = (z) => geo.south + ((half - z) / worldSize) * (geo.north - geo.south)

async function loadTile(id) {
  const meta = JSON.parse(await readFile(join(SRC, `${id}.json`), 'utf8'))
  const buf = await readFile(join(SRC, meta.file))
  const data = new Float32Array(buf.buffer, buf.byteOffset, meta.width * meta.height)
  const [x0, y0, x1, y1] = meta.bboxReturned
  return {
    id, meta, data, x0, y0, x1, y1, w: meta.width, h: meta.height,
    covers: (lon, lat) => lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1,
    // Bilinear, and row 0 is ymax: the grid's origin is north-west.
    sample(lon, lat) {
      const fx = ((lon - x0) / (x1 - x0)) * (this.w - 1)
      const fy = ((y1 - lat) / (y1 - y0)) * (this.h - 1)
      const cx = Math.min(Math.max(fx, 0), this.w - 1)
      const cy = Math.min(Math.max(fy, 0), this.h - 1)
      const x = Math.floor(cx), y = Math.floor(cy)
      const x2 = Math.min(x + 1, this.w - 1), y2 = Math.min(y + 1, this.h - 1)
      const tx = cx - x, ty = cy - y
      const a = this.data[y * this.w + x], b = this.data[y * this.w + x2]
      const c = this.data[y2 * this.w + x], d = this.data[y2 * this.w + x2]
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
    },
  }
}

// Finest first: each sample takes the best tile that actually covers it.
const tiles = []
for (const id of ['cville-core', 'flight-strip', 'flight-corridor']) {
  tiles.push(await loadTile(id))
}

const out = new Float32Array(SIZE.w * SIZE.h)
let min = Infinity, max = -Infinity, missed = 0
for (let j = 0; j < SIZE.h; j++) {
  const z = EXTENT.minZ + ((j + 0.5) / SIZE.h) * (EXTENT.maxZ - EXTENT.minZ)
  const lat = latAt(z)
  for (let i = 0; i < SIZE.w; i++) {
    const x = EXTENT.minX + ((i + 0.5) / SIZE.w) * (EXTENT.maxX - EXTENT.minX)
    const lon = lonAt(x)
    const tile = tiles.find((t) => t.covers(lon, lat))
    if (!tile) { missed++; continue }
    const v = tile.sample(lon, lat)
    out[j * SIZE.w + i] = v
    if (v < min) min = v
    if (v > max) max = v
  }
}
if (missed) throw new Error(`${missed} samples fell outside every source tile`)

// --- the far grid, same resampler, coarser and much wider -------------------
const far = new Float32Array(FAR_SIZE.w * FAR_SIZE.h)
let farMin = Infinity, farMax = -Infinity, farMissed = 0
for (let j = 0; j < FAR_SIZE.h; j++) {
  const z = FAR_EXTENT.minZ + ((j + 0.5) / FAR_SIZE.h) * (FAR_EXTENT.maxZ - FAR_EXTENT.minZ)
  const lat = latAt(z)
  for (let i = 0; i < FAR_SIZE.w; i++) {
    const x = FAR_EXTENT.minX + ((i + 0.5) / FAR_SIZE.w) * (FAR_EXTENT.maxX - FAR_EXTENT.minX)
    const lon = lonAt(x)
    // Past the corridor's own bbox, clamp to its edge rather than leaving a
    // hole: a zero here reads as a sea-level cliff on the horizon.
    let tile = tiles.find((t) => t.covers(lon, lat))
    if (!tile) { farMissed++; tile = tiles[tiles.length - 1] }
    const v = tile.sample(lon, lat)
    far[j * FAR_SIZE.w + i] = v
    if (v < farMin) farMin = v
    if (v > farMax) farMax = v
  }
}

await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'terrain-far.f32'), Buffer.from(far.buffer))
await writeFile(join(OUT, 'terrain-far.json'), `${JSON.stringify({
  file: 'terrain-far.f32',
  width: FAR_SIZE.w,
  height: FAR_SIZE.h,
  layout: 'float32-le, row-major, row 0 = minZ (north), column 0 = minX (west)',
  extent: FAR_EXTENT,
  units: 'metres above NAVD88',
  elevationMin: Number(farMin.toFixed(2)),
  elevationMax: Number(farMax.toFixed(2)),
  clampedToSourceEdge: farMissed,
  metresPerWorldUnit: Number(geo.metresPerUnit.toFixed(3)),
  built: new Date().toISOString(),
  attribution: 'Elevation data courtesy of the U.S. Geological Survey, 3D Elevation Program',
}, null, 2)}\n`)
console.log(
  `terrain-far ${FAR_SIZE.w}x${FAR_SIZE.h} over x[${FAR_EXTENT.minX},${FAR_EXTENT.maxX}] ` +
  `z[${FAR_EXTENT.minZ},${FAR_EXTENT.maxZ}]\n  ${farMin.toFixed(1)}-${farMax.toFixed(1)} m, ` +
  `${(far.byteLength / 1e6).toFixed(1)} MB` + (farMissed ? `, ${farMissed} clamped to source edge` : ''),
)

await writeFile(join(OUT, 'terrain.f32'), Buffer.from(out.buffer))
const record = {
  file: 'terrain.f32',
  width: SIZE.w,
  height: SIZE.h,
  // Row 0 is minZ (north), matching the raw grids' north-west origin.
  layout: 'float32-le, row-major, row 0 = minZ (north), column 0 = minX (west)',
  extent: EXTENT,
  units: 'metres above NAVD88',
  elevationMin: Number(min.toFixed(2)),
  elevationMax: Number(max.toFixed(2)),
  metresPerWorldUnit: Number(geo.metresPerUnit.toFixed(3)),
  geo,
  sources: tiles.map((t) => t.id),
  built: new Date().toISOString(),
  attribution: 'Elevation data courtesy of the U.S. Geological Survey, 3D Elevation Program',
}
await writeFile(join(OUT, 'terrain.json'), `${JSON.stringify(record, null, 2)}\n`)
console.log(
  `terrain ${SIZE.w}x${SIZE.h} over x[${EXTENT.minX},${EXTENT.maxX}] z[${EXTENT.minZ},${EXTENT.maxZ}]\n` +
  `  ${min.toFixed(1)}-${max.toFixed(1)} m, ${(out.byteLength / 1e6).toFixed(1)} MB, ` +
  `${((EXTENT.maxX - EXTENT.minX) / SIZE.w * geo.metresPerUnit).toFixed(1)} m per sample`,
)
