// Regional road network beyond Charlottesville: Albemarle and the counties
// around it, so the city's own streets do not simply stop at its boundary.
//
//   node scripts/import-roads.mjs
//
// Source:  US Census Bureau TIGERweb (Transportation). Public domain, a work of
//          the U.S. Government. Primary and secondary roads only -- local roads
//          run to ~180k vertices for a single quarter-degree box, which is
//          detail nothing at this altitude could show.
// Writes:  public/data/roads-region.f32 (+ .json), as world-space XZ line
//          segment pairs. Ground height is applied at runtime, because the
//          terrain's vertical scale is a config dial and baking it in here
//          would freeze it.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIELD } from '../src/config.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'data')
const SERVICE =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer'

// Albemarle plus its neighbours, matched to the horizon grid's own reach.
const BBOX = { west: -79.05, south: 37.63, east: -78.22, north: 38.60 }
const LAYERS = [
  { id: 2, name: 'Primary Roads' },
  { id: 6, name: 'Secondary Roads' },
]

const { geo, worldSize } = FIELD
const half = worldSize / 2
const xAt = (lon) => -half + ((lon - geo.west) / (geo.east - geo.west)) * worldSize
const zAt = (lat) => half - ((lat - geo.south) / (geo.north - geo.south)) * worldSize

// The logo keeps its own ground: roads are not drawn inside the artwork.
const insideLogo = (x, z) => x > -half && x < half && z > -half && z < half

async function fetchLayer(layer) {
  const params = new URLSearchParams({
    geometry: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'NAME,MTFCC',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  })
  const res = await fetch(`${SERVICE}/${layer.id}/query?${params}`)
  if (!res.ok) throw new Error(`${layer.name}: ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`${layer.name}: ${data.error.message}`)
  if (data.exceededTransferLimit) {
    throw new Error(`${layer.name}: hit the transfer limit -- split the bbox`)
  }
  return data.features ?? []
}

const segments = []
let clipped = 0
const counts = []

for (const layer of LAYERS) {
  const features = await fetchLayer(layer)
  let before = segments.length
  for (const feature of features) {
    const g = feature.geometry
    if (!g) continue
    const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const ax = xAt(line[i][0]), az = zAt(line[i][1])
        const bx = xAt(line[i + 1][0]), bz = zAt(line[i + 1][1])
        // Drop a segment with either end over the artwork, rather than
        // clipping it to the edge: a road that stops dead on the boundary
        // reads better than one sliced mid-span.
        if (insideLogo(ax, az) || insideLogo(bx, bz)) { clipped++; continue }
        segments.push(ax, az, bx, bz)
      }
    }
  }
  counts.push({ layer: layer.name, features: features.length, segments: (segments.length - before) / 4 })
  console.log(`${layer.name}: ${features.length} features, ${(segments.length - before) / 4} segments`)
}

const data = new Float32Array(segments)
await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, 'roads-region.f32'), Buffer.from(data.buffer))
await writeFile(join(OUT, 'roads-region.json'), `${JSON.stringify({
  file: 'roads-region.f32',
  layout: 'float32-le, flat [x0,z0,x1,z1,...] world-space segment pairs',
  segments: data.length / 4,
  bbox: BBOX,
  clippedInsideLogo: clipped,
  layers: counts,
  geo,
  retrieved: new Date().toISOString(),
  source: 'US Census Bureau, TIGERweb Transportation (Primary and Secondary Roads)',
  sourceUrl: SERVICE,
  licence: 'Public domain, a work of the U.S. Government (17 U.S.C. 105)',
  attribution: 'Road network from the U.S. Census Bureau TIGER/Line',
}, null, 2)}\n`)

console.log(
  `roads-region: ${data.length / 4} segments, ${clipped} clipped inside the logo, ` +
  `${(data.byteLength / 1e6).toFixed(2)} MB`,
)
