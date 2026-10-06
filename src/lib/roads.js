import * as THREE from 'three'
import { FIELD, CITY, HORIZON } from '../config.js'
import { groundHeight, loadFarTerrain } from './terrain.js'

// The regional road network, draped on the terrain beyond the logo.
// US Census Bureau TIGER/Line, public domain. Built by scripts/import-roads.mjs.

/**
 * Which surface a point sits on.
 *
 * Two different things are drawn as "the ground": the tile field, which sits at
 * terrain height, and the horizon mesh, which sits HORIZON.drop below it. A
 * road lifted from the wrong one either floats or sinks, so this asks which is
 * actually underneath before lifting.
 */
function surfaceOffset(x, z) {
  const land = FIELD.land
  const half = FIELD.worldSize / 2
  const overLogo = x > -half && x < half && z > -half && z < half
  const clear = land.clear
  const overCity = clear &&
    x > clear.minX && x < clear.maxX && z > clear.minZ && z < clear.maxZ
  const overLand = !overCity && land &&
    z >= land.minZ && z <= land.maxZ &&
    x >= -land.halfWidth && x <= land.halfWidth

  return (overLogo || overLand) ? 0 : -HORIZON.drop
}

export async function loadRegionalRoads(base = '/data/roads-region') {
  // Most of this network lies outside the fine grid, so the horizon grid has to
  // be in hand before any of it can be given a height.
  await loadFarTerrain()
  const meta = await fetch(`${base}.json`).then((r) => {
    if (!r.ok) throw new Error(`regional roads metadata ${r.status}`)
    return r.json()
  })
  const buffer = await fetch(`${base}.f32`).then((r) => {
    if (!r.ok) throw new Error(`regional roads ${r.status}`)
    return r.arrayBuffer()
  })
  return { meta, flat: new Float32Array(buffer) }
}

/** Flat [x0,z0,x1,z1,...] pairs -> LineSegments geometry sitting on the ground. */
export function buildRegionalRoads({ meta, flat }) {
  const count = Math.floor(flat.length / 2)
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const x = flat[i * 2]
    const z = flat[i * 2 + 1]
    positions[i * 3] = x
    positions[i * 3 + 1] = groundHeight(x, z) + surfaceOffset(x, z) + CITY.roadLift
    positions[i * 3 + 2] = z
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return { geometry, segments: meta.segments, meta }
}
