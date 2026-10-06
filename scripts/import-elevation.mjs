// Pull bare-earth elevation grids from USGS 3DEP for the regions the terrain
// pass will need: the city the logo field sits over, and the wider corridor
// from the Blue Ridge crest across to Monticello.
//
//   node scripts/import-elevation.mjs            # every region
//   node scripts/import-elevation.mjs cville-core
//
// Nothing in the site reads these yet. terrainHeight() in src/lib/waves.js is
// the hook they are for; it stays inert until we wire it up deliberately.
//
// Source:  USGS 3D Elevation Program (3DEP) Bare Earth DEM dynamic service.
// Licence: public domain (a work of the U.S. Government, 17 U.S.C. 105).
//          Credit "U.S. Geological Survey, 3D Elevation Program".
// Units:   metres above NAVD88, in EPSG:4326.
//
// The service hands back `bsq` as a bare block of little-endian float32 in
// row-major order with no header, which is why this needs no TIFF/GDAL
// dependency: it is already the exact buffer a heightfield wants.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data', 'elevation')

const SERVICE =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage'

// Elevations are metres; a sample this low is the service's own no-data fill.
const NO_DATA = -9999
const MIN_PLAUSIBLE = -500

export const REGIONS = [
  {
    id: 'cville-core',
    name: 'Charlottesville, UVA, Monticello and the Rivanna',
    // Where the flight ends up and where the city building model has to meet
    // the terrain, so this is the one tile that wants real detail.
    bbox: [-78.56, 37.98, -78.42, 38.08],
    size: [2048, 1536],
    note:
      'About 6 m/sample. The ground the city building model will sit on. ' +
      'The raw bsq export 500s well below the 8000 px image cap, so this is ' +
      'sized to what the service will actually return in one call.',
  },
  {
    id: 'flight-strip',
    name: 'The flown ground: the logo footprint and the run north into the city',
    // A narrow strip along the flight axis rather than a wide box: this is the
    // ground you actually pass over, so it carries the resolution budget. It
    // holds the whole 10-mile logo footprint (lat 37.8653..38.0104, north edge
    // on Monticello's ridge) plus the descent past downtown Charlottesville.
    bbox: [-78.6, 37.84, -78.3, 38.12],
    size: [2640, 3112],
    note:
      'About 10 m/sample, the resolution 3DEP publishes here, and the same ' +
      'order as one logo tile at a 10-mile footprint -- finer would be ' +
      'detail the tile grid cannot show.',
  },
  {
    id: 'flight-corridor',
    name: 'Wide context: Blue Ridge west, northern Albemarle and Shenandoah north',
    // Only ever seen at distance -- the skyline beyond the flown ground --
    // so it trades resolution for reach.
    bbox: [-79.0, 37.55, -78.2, 38.6],
    size: [1280, 2048],
    note: 'About 55 m/sample. Horizon only; never the ground under the camera.',
  },
]

const query = (params) =>
  Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')

async function exportRegion(region) {
  const [xmin, ymin, xmax, ymax] = region.bbox
  const [width, height] = region.size

  const params = {
    bbox: `${xmin},${ymin},${xmax},${ymax}`,
    bboxSR: 4326,
    imageSR: 4326,
    size: `${width},${height}`,
    format: 'bsq',
    pixelType: 'F32',
    noData: NO_DATA,
    noDataInterpretation: 'esriNoDataMatchAny',
    interpolation: 'RSP_BilinearInterpolation',
    adjustAspectRatio: false,
    f: 'json',
  }

  // Ask twice rather than once: the JSON reply states the extent and pixel grid
  // the server actually used, which is the only way to know our bbox was
  // honoured rather than quietly snapped to a different aspect ratio. Its
  // `href` is no use for a raw format -- the service writes that file without an
  // extension and serving it 400s -- so the bytes come from an f=image call.
  const meta = await fetch(`${SERVICE}?${query({ ...params, f: 'json' })}`).then((r) => {
    if (!r.ok) throw new Error(`${region.id}: export request failed (${r.status})`)
    return r.json()
  })
  if (meta.error) throw new Error(`${region.id}: ${meta.error.message ?? 'service error'}`)

  const response = await fetch(`${SERVICE}?${query({ ...params, f: 'image' })}`)
  if (!response.ok) throw new Error(`${region.id}: image fetch failed (${response.status})`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('octet-stream')) {
    throw new Error(`${region.id}: expected raw bytes, got ${type}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())

  const w = meta.width ?? width
  const h = meta.height ?? height
  const expected = w * h * 4
  if (buffer.length < expected) {
    throw new Error(`${region.id}: expected ${expected} bytes, got ${buffer.length}`)
  }

  // The reply carries a few bytes of padding past the grid; keep only the grid.
  const grid = buffer.subarray(0, expected)
  const samples = new Float32Array(grid.buffer, grid.byteOffset, w * h)

  let min = Infinity
  let max = -Infinity
  let voids = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]
    if (!Number.isFinite(v) || v <= MIN_PLAUSIBLE) {
      voids++
      continue
    }
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min)) throw new Error(`${region.id}: every sample was no-data`)

  return { meta, buffer: grid, width: w, height: h, min, max, voids }
}

async function run(only) {
  await mkdir(OUT, { recursive: true })
  const index = []

  for (const region of REGIONS) {
    if (only && region.id !== only) continue
    process.stdout.write(`${region.id}: requesting ${region.size.join('x')}... `)
    const { meta, buffer, width, height, min, max, voids } = await exportRegion(region)

    await writeFile(join(OUT, `${region.id}.f32`), buffer)
    const record = {
      id: region.id,
      name: region.name,
      note: region.note,
      file: `${region.id}.f32`,
      // Row-major from the NORTH-WEST corner: row 0 is ymax, column 0 is xmin,
      // which is the opposite of a Y-up world grid. Flip rows when sampling.
      layout: 'float32-le, row-major, origin north-west',
      width,
      height,
      bboxRequested: region.bbox,
      bboxReturned: meta.extent
        ? [meta.extent.xmin, meta.extent.ymin, meta.extent.xmax, meta.extent.ymax]
        : region.bbox,
      crs: 'EPSG:4326',
      units: 'metres above NAVD88',
      noData: NO_DATA,
      elevationMin: Number(min.toFixed(2)),
      elevationMax: Number(max.toFixed(2)),
      voidSamples: voids,
      metresPerSampleApprox: {
        x: Number((((region.bbox[2] - region.bbox[0]) * 111320 *
          Math.cos(((region.bbox[1] + region.bbox[3]) / 2) * Math.PI / 180)) / width).toFixed(1)),
        y: Number((((region.bbox[3] - region.bbox[1]) * 111320) / height).toFixed(1)),
      },
      retrieved: new Date().toISOString(),
      source: 'USGS 3D Elevation Program (3DEP) Bare Earth DEM dynamic service',
      sourceUrl: SERVICE,
      licence: 'Public domain, a work of the U.S. Government (17 U.S.C. 105)',
      attribution: 'Elevation data courtesy of the U.S. Geological Survey, 3D Elevation Program',
    }
    index.push(record)
    await writeFile(join(OUT, `${region.id}.json`), `${JSON.stringify(record, null, 2)}\n`)
    console.log(
      `${width}x${height}, ${min.toFixed(1)}-${max.toFixed(1)} m, ` +
      `${voids} void, ${(buffer.length / 1e6).toFixed(1)} MB`,
    )
  }

  if (!only) {
    await writeFile(join(OUT, 'index.json'), `${JSON.stringify({
      source: 'USGS 3D Elevation Program (3DEP)',
      attribution: 'Elevation data courtesy of the U.S. Geological Survey, 3D Elevation Program',
      licence: 'Public domain, a work of the U.S. Government (17 U.S.C. 105)',
      retrieved: new Date().toISOString(),
      regions: index,
    }, null, 2)}\n`)
  }
}

await run(process.argv[2])
