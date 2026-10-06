import * as THREE from 'three'
import { FIELD, CITY } from '../config.js'
import { terrain, terrainHeight } from './terrain.js'

// Charlottesville's real roads and structures, dropped onto the terrain.
//
// Source: City of Charlottesville Open Data (Existing Structure Area, Road
// Centerlines), CC BY 4.0, by way of the partner prototype's committed
// snapshot. Coordinates in that file are ALREADY projected to metres from its
// own origin, with +x east and +y SOUTH, so there is no reprojection here --
// only a change of units and of where the origin sits in this world.

/** Build the metre -> world-unit transform from the field's own registration. */
function transformFor(metadata) {
  const { geo, worldSize } = FIELD
  const half = worldSize / 2
  const [olon, olat] = metadata.origin

  const degPerMetreEast = 1 / (111320 * Math.cos((olat * Math.PI) / 180))
  const degPerMetreNorth = 1 / 111320

  const lonSpan = geo.east - geo.west
  const latSpan = geo.north - geo.south

  // worldX = ax + bx * metresEast, worldZ = az + bz * metresSouth
  return {
    ax: -half + ((olon - geo.west) / lonSpan) * worldSize,
    bx: (degPerMetreEast / lonSpan) * worldSize,
    az: half - ((olat - geo.south) / latSpan) * worldSize,
    // +y in the source is south, and south is +z here, so this stays positive.
    bz: (degPerMetreNorth / latSpan) * worldSize,
  }
}

/**
 * Buildings as extruded footprints and roads as draped lines.
 *
 * Both sit on the terrain, so this needs the elevation grid loaded first. Each
 * building gets ONE base height, taken from the lowest ground under its
 * footprint: a per-vertex base would shear the walls on a slope, and the lowest
 * rather than the mean keeps it from floating on the downhill side.
 */
export function buildCity(city) {
  if (!terrain.ready) throw new Error('buildCity needs the terrain grid loaded')
  const t = transformFor(city.metadata)
  const vScale = terrain.scale * CITY.heightExaggeration

  const wallPos = []
  const wallIdx = []
  const roofIdx = []
  let base = 0

  for (const building of city.buildings) {
    const height = building.h * vScale
    for (const ring of building.rings) {
      // The source closes rings by repeating the first point; drop it so the
      // wall quads do not double up on one edge.
      const pts = ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring
      const n = pts.length
      if (n < 3) continue

      const world = new Array(n)
      let ground = Infinity
      for (let i = 0; i < n; i++) {
        const x = t.ax + t.bx * pts[i][0]
        const z = t.az + t.bz * pts[i][1]
        world[i] = [x, z]
        const g = terrainHeight(x, z)
        if (g < ground) ground = g
      }

      const top = ground + height
      for (let i = 0; i < n; i++) {
        wallPos.push(world[i][0], ground, world[i][1])
        wallPos.push(world[i][0], top, world[i][1])
      }

      // Two triangles per edge, wound so the outward face is front.
      for (let i = 0; i < n; i++) {
        const a = base + i * 2
        const b = base + ((i + 1) % n) * 2
        wallIdx.push(a, b, a + 1, b, b + 1, a + 1)
      }

      // Roof: fan from the first vertex. These footprints are small and convex
      // enough that a fan holds; a full triangulation is not worth the cost at
      // the size they render.
      for (let i = 1; i < n - 1; i++) {
        roofIdx.push(base + 1, base + i * 2 + 1, base + (i + 1) * 2 + 1)
      }
      base += n * 2
    }
  }

  const buildings = new THREE.BufferGeometry()
  buildings.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3))
  buildings.setIndex([...wallIdx, ...roofIdx])
  buildings.computeVertexNormals()

  // Roads: line segments lifted just clear of the ground they are drawn on.
  const roadPos = []
  for (const line of city.roads) {
    for (let i = 0; i < line.length - 1; i++) {
      for (const p of [line[i], line[i + 1]]) {
        const x = t.ax + t.bx * p[0]
        const z = t.az + t.bz * p[1]
        roadPos.push(x, terrainHeight(x, z) + CITY.roadLift, z)
      }
    }
  }
  const roads = new THREE.BufferGeometry()
  roads.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3))

  return {
    buildings,
    roads,
    counts: {
      buildings: city.buildings.length,
      roads: city.roads.length,
      triangles: (wallIdx.length + roofIdx.length) / 3,
      roadSegments: roadPos.length / 6,
    },
    bounds: cityBounds(city.metadata, t),
  }
}

/** World-space footprint, used to clear land tiles out of the city's way. */
export function cityBounds(metadata, t = transformFor(metadata)) {
  const [west, south, east, north] = metadata.bounds
  const [olon, olat] = metadata.origin
  const mEast = (lon) => (lon - olon) * 111320 * Math.cos((olat * Math.PI) / 180)
  const mSouth = (lat) => -(lat - olat) * 111320
  return {
    minX: t.ax + t.bx * mEast(west),
    maxX: t.ax + t.bx * mEast(east),
    minZ: t.az + t.bz * mSouth(north),
    maxZ: t.az + t.bz * mSouth(south),
  }
}

export async function loadCity(url = '/data/city.json') {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`city data ${res.status}`)
  return res.json()
}
