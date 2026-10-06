import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { buildCity, loadCity } from '../lib/city.js'
import { CITY } from '../config.js'

// Charlottesville's actual structures and roads, standing on the terrain at the
// far end of the flight. Buildings in translucent orange, roads in the lighter
// blue, both carried straight from the City of Charlottesville's open data.

export default function City({ onReady }) {
  const [built, setBuilt] = useState(null)

  useEffect(() => {
    let live = true
    loadCity()
      .then((city) => {
        if (!live) return
        const result = buildCity(city)
        setBuilt(result)
        onReady?.(result)
      })
      .catch((e) => console.warn('City unavailable:', e.message))
    return () => {
      live = false
    }
  }, [onReady])

  const materials = useMemo(() => ({
    buildings: new THREE.MeshStandardMaterial({
      color: new THREE.Color(CITY.buildingColor),
      transparent: true,
      opacity: CITY.buildingOpacity,
      // Without this the thousands of overlapping translucent faces sort against
      // each other and the whole town flickers as the camera moves.
      depthWrite: false,
      roughness: 0.6,
      metalness: 0.05,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(CITY.buildingColor),
      emissiveIntensity: CITY.buildingEmissive,
    }),
    roads: new THREE.LineBasicMaterial({
      color: new THREE.Color(CITY.roadColor),
      transparent: true,
      opacity: CITY.roadOpacity,
      depthWrite: false,
    }),
  }), [])

  useEffect(() => () => {
    materials.buildings.dispose()
    materials.roads.dispose()
    built?.buildings.dispose()
    built?.roads.dispose()
  }, [materials, built])

  if (!built) return null

  return (
    <group>
      <mesh geometry={built.buildings} material={materials.buildings} frustumCulled={false} />
      <lineSegments geometry={built.roads} material={materials.roads} frustumCulled={false} />
    </group>
  )
}
