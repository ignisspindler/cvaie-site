import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useLoader } from '@react-three/fiber'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { LOGO } from '../config.js'
import { waveHeight } from '../lib/waves.js'

/**
 * SVG is Y-down, three is Y-up. Scaling by -1 mirrors the geometry but also
 * reverses triangle winding, which turns every face inside out. So: mirror,
 * flip the winding back, then recompute normals.
 */
function mirrorY(geo) {
  geo.scale(1, -1, 1)

  if (geo.index) {
    const idx = geo.index
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i)
      idx.setX(i, idx.getX(i + 2))
      idx.setX(i + 2, a)
    }
    idx.needsUpdate = true
  } else {
    for (const name of Object.keys(geo.attributes)) {
      const attr = geo.attributes[name]
      const { array, itemSize } = attr
      for (let i = 0; i < attr.count; i += 3) {
        const a = i * itemSize
        const c = (i + 2) * itemSize
        for (let k = 0; k < itemSize; k++) {
          const tmp = array[a + k]
          array[a + k] = array[c + k]
          array[c + k] = tmp
        }
      }
      attr.needsUpdate = true
    }
  }

  geo.computeVertexNormals()
  return geo
}

/** SVGLoader hands back `url(#id)` for gradient fills; map those to flat colours. */
function resolveColor(value, gradients) {
  if (!value || value === 'none' || value === 'transparent') return null
  const match = /url\(#(.+?)\)/.exec(value)
  const hex = match ? gradients[match[1]] : value
  if (!hex) return new THREE.Color('#8899aa')
  try {
    return new THREE.Color().setStyle(hex)
  } catch {
    return new THREE.Color('#8899aa')
  }
}

export default function Logo() {
  const data = useLoader(SVGLoader, LOGO.url)
  const ref = useRef(null)
  const mirrorRef = useRef(null)

  const { object, reflection, scale } = useMemo(() => {
    const mode = LOGO.mode
    const group = new THREE.Group()

    // Trace mode: shading is already painted into the colour bands, so we want
    // shallow relief (layers overlap so no gaps show at an angle), not a bevel.
    // Extrude mode: real depth and bevels, because the fills are flat.
    const extrudeOpts =
      mode === 'extrude'
        ? { depth: 16, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.5, bevelSegments: 3, curveSegments: 12 }
        : { depth: 2.4, bevelEnabled: false, curveSegments: 4 }
    const layerStep = mode === 'extrude' ? 0 : 1.2

    data.paths.forEach((path, i) => {
      const style = path.userData.style

      const fill = resolveColor(style.fill, LOGO.gradients)
      if (fill) {
        const shapes = SVGLoader.createShapes(path)
        if (shapes.length) {
          const geo = mirrorY(new THREE.ExtrudeGeometry(shapes, extrudeOpts))
          const mesh = new THREE.Mesh(
            geo,
            new THREE.MeshStandardMaterial({
              color: fill,
              metalness: mode === 'extrude' ? 0.45 : 0.12,
              roughness: mode === 'extrude' ? 0.35 : 0.65,
              side: THREE.DoubleSide,
            }),
          )
          mesh.position.z = i * layerStep
          group.add(mesh)
        }
      }

      // Stroke-only paths (the hand-authored file's rings and network lines).
      const stroke = resolveColor(style.stroke, LOGO.gradients)
      if (stroke && style.strokeWidth) {
        for (const sub of path.subPaths) {
          const geo = SVGLoader.pointsToStroke(sub.getPoints(), style)
          if (!geo) continue
          const mesh = new THREE.Mesh(
            mirrorY(geo),
            new THREE.MeshStandardMaterial({
              color: stroke,
              metalness: 0.4,
              roughness: 0.4,
              side: THREE.DoubleSide,
            }),
          )
          mesh.position.z = extrudeOpts.depth + 0.5
          group.add(mesh)
        }
      }
    })

    // Recentre on the origin and normalise to a predictable world width.
    const box = new THREE.Box3().setFromObject(group)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)
    group.children.forEach((child) => child.position.sub(center))

    let mirror = null
    if (LOGO.reflection) {
      mirror = group.clone()
      mirror.traverse((child) => {
        if (!child.isMesh) return
        child.material = child.material.clone()
        child.material.transparent = true
        child.material.opacity = 0.18
        child.material.depthWrite = false
      })
    }

    return { object: group, reflection: mirror, scale: LOGO.worldWidth / (size.x || 1) }
  }, [data])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (!ref.current) return
    ref.current.position.y = LOGO.position[1] + waveHeight(0, -1.5, t) * 0.35
    ref.current.rotation.y = Math.sin(t * 0.22) * 0.16
    ref.current.rotation.x = Math.sin(t * 0.17) * 0.05
    // Keep the reflection mirrored about the waterline as the badge bobs.
    if (mirrorRef.current) mirrorRef.current.position.y = -ref.current.position.y * 2
  })

  const [x, y, z] = LOGO.position

  return (
    <group ref={ref} position={[x, y, z]}>
      <group scale={scale}>
        <primitive object={object} />
      </group>
      {reflection && (
        <group ref={mirrorRef} scale={[scale, -scale, scale]} position={[0, -y * 2, 0]}>
          <primitive object={reflection} />
        </group>
      )}
    </group>
  )
}
