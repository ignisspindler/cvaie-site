import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { WAVE_GLSL, sharedUniforms } from '../lib/waves.js'
import { buildTileField, buildTileGeometry } from '../lib/logoField.js'
import { FIELD } from '../config.js'

// The logo as the surface.
//
// One draw call. Every tile is an instance that knows only its own base X/Z,
// its sampled colour and a phase; the vertex shader puts it on the height field
// and tilts it with the field's own gradient, so the artwork reads as a sheet of
// plates on water rather than a picture of one.

/**
 * Standard material, rewired.
 *
 * We keep MeshStandardMaterial's real PBR lighting -- that is what makes
 * highlights travel across the ripples -- and only replace where a vertex
 * sits and which way it faces.
 */
function patchMaterial(material, field) {
  material.onBeforeCompile = (shader) => {
    // Every uniform WAVE_GLSL declares, by sharing the objects themselves so
    // FlightRig's in-place writes land here too. Listing them one by one is how
    // the terrain uniforms got silently left out and the tiles kept riding a
    // flat surface while everything else followed the ground.
    Object.assign(shader.uniforms, sharedUniforms)
    shader.uniforms.uBaseHeight = { value: FIELD.baseHeight }
    shader.uniforms.uEmissive = { value: FIELD.emissive }

    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        /* glsl */ `
        attribute vec2 aBase;
        attribute vec3 aTint;
        attribute float aPhase;
        // Per instance, not a uniform: the artwork and the ground beyond it are
        // one draw call at two different pitches.
        attribute float aSize;
        uniform float uTime;
        uniform float uBaseHeight;
        varying vec3 vTint;
        ${WAVE_GLSL}
        void main() {`,
      )
      // The chunk we replace declares objectNormal from the `normal` attribute;
      // ours comes from the height field instead. Declared here so the tangent
      // basis is still in scope for begin_vertex further down.
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        vec3 sTangent, sBitangent, sNormal;
        surfaceBasis(aBase, uTime, ${field.spacing.toFixed(5)}, sTangent, sBitangent, sNormal);
        vec3 objectNormal = sNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vTint = aTint;
        float sHeight = surfaceHeight(aBase, uTime) + uBaseHeight;
        vec3 transformed = vec3(aBase.x, sHeight, aBase.y)
          + sTangent * (position.x * aSize)
          + sBitangent * (position.y * aSize);`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying vec3 vTint;\nuniform float uEmissive;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n  diffuseColor.rgb *= vTint;',
      )
      // The artwork's navy bands are almost black in linear space, so a lit-only
      // surface reads as a dark hole at night. A little self-illumination in the
      // tile's own colour keeps the logo legible without flattening the relief.
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance = vTint * uEmissive;',
      )
  }
  // Changing the injected source invalidates three's program cache key.
  material.customProgramCacheKey = () => `logo-surface-${field.count}`
  return material
}

export default function LogoSurface({ onReady }) {
  const [field, setField] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    buildTileField(FIELD)
      .then((f) => {
        if (!live) return
        setField(f)
        onReady?.(f)
      })
      .catch((e) => {
        if (!live) return
        console.error('LogoSurface: could not build the tile field', e)
        setError(e)
      })
    return () => {
      live = false
    }
  }, [onReady])

  const geometry = useMemo(() => {
    if (!field) return null
    const tile = buildTileGeometry(FIELD.TILE_SHAPE)
    const g = new THREE.InstancedBufferGeometry()
    // A plain Mesh renders an InstancedBufferGeometry instanced, which keeps us
    // clear of InstancedMesh's instanceMatrix -- every tile's placement comes
    // from aBase and the height field, so per-instance matrices would be dead
    // weight we'd have to fill with identities.
    g.index = tile.index
    g.attributes.position = tile.attributes.position
    g.attributes.normal = tile.attributes.normal
    g.attributes.uv = tile.attributes.uv
    g.instanceCount = field.count
    g.setAttribute('aBase', new THREE.InstancedBufferAttribute(field.base, 2))
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(field.colors, 3))
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(field.phases, 1))
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(field.sizes, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), FIELD.worldSize)
    tile.dispose()
    return g
  }, [field])

  const material = useMemo(() => {
    if (!field) return null
    return patchMaterial(
      new THREE.MeshStandardMaterial({
        metalness: FIELD.metalness,
        roughness: FIELD.roughness,
        side: THREE.DoubleSide,
      }),
      field,
    )
  }, [field])

  useEffect(() => () => {
    geometry?.dispose()
    material?.dispose()
  }, [geometry, material])

  if (error || !geometry || !material) return null

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
