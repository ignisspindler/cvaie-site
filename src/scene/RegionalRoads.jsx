import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { buildRegionalRoads, loadRegionalRoads } from '../lib/roads.js'
import { CITY, PALETTE } from '../config.js'

// Highways and secondary roads running out through Albemarle and the counties
// around it, so Charlottesville's own streets do not stop at the city line.
// Not drawn over the logo: the artwork keeps its own ground.

export default function RegionalRoads({ onReady }) {
  const [built, setBuilt] = useState(null)

  useEffect(() => {
    let live = true
    loadRegionalRoads()
      .then((data) => {
        if (!live) return
        const result = buildRegionalRoads(data)
        setBuilt(result)
        onReady?.(result)
      })
      .catch((e) => console.warn('Regional roads unavailable:', e.message))
    return () => { live = false }
  }, [onReady])

  const material = useMemo(() => new THREE.LineBasicMaterial({
    color: new THREE.Color(CITY.roadColor),
    transparent: true,
    opacity: CITY.roadOpacity * 0.75,
    depthWrite: false,
    // Fade into the sky with distance, so the network thins out toward the
    // mountains instead of ending on a hard rectangle at the data's edge.
    fog: true,
  }), [])

  useEffect(() => () => {
    material.dispose()
    built?.geometry.dispose()
  }, [material, built])

  if (!built) return null
  return <lineSegments geometry={built.geometry} material={material} frustumCulled={false} />
}
