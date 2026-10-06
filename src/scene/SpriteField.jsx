import { useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { WAVE_GLSL, sharedUniforms } from '../lib/waves.js'
import { PALETTE, SPRITES, FLIGHT } from '../config.js'

// Tens of thousands of motes, ONE draw call. Every position is computed in the
// vertex shader from the same height field the tiles use, so the field rides
// the surface for free -- no per-frame CPU work, no instance matrices.
const vertexShader = /* glsl */ `
${WAVE_GLSL}
uniform float uTime;
uniform float uPixelRatio;
attribute float aScale;
attribute float aTint;
attribute float aPhase;
attribute float aLift;
varying float vTint;
varying float vAlpha;

void main() {
  vec3 p = position;
  // aLift scatters them through the air above the surface instead of pinning
  // them to it, so the cruise flies through the field rather than over it.
  p.y = surfaceHeight(p.xz, uTime) + aLift + sin(uTime * 0.8 + aPhase) * 0.12;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aScale * uPixelRatio * (320.0 / max(-mv.z, 0.001));
  gl_Position = projectionMatrix * mv;

  float dist = length(p - cameraPosition);
  vAlpha = smoothstep(3.0, 14.0, dist) * (1.0 - smoothstep(120.0, 300.0, dist));
  vTint = aTint;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vTint;
varying float vAlpha;

void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, r);
  if (a < 0.01) discard;
  gl_FragColor = vec4(mix(uColorA, uColorB, vTint), a * vAlpha * 0.5);
}
`

export default function SpriteField() {
  const dpr = useThree((s) => s.viewport.dpr)

  const geometry = useMemo(() => {
    const { count, radius, spread } = SPRITES
    const positions = new Float32Array(count * 3)
    const scales = new Float32Array(count)
    const tints = new Float32Array(count)
    const phases = new Float32Array(count)
    const lifts = new Float32Array(count)

    // Scattered along the whole flight corridor, not a disc at the origin:
    // the cruise covers ~170 units of Z, so a disc would run out underneath us.
    const nearZ = FLIGHT.startZ + spread * 0.4
    const farZ = FLIGHT.endZ - spread * 0.4

    for (let i = 0; i < count; i++) {
      // sqrt() keeps the lateral spread even instead of clumping on the axis.
      const r = Math.sqrt(Math.random()) * radius
      positions[i * 3] = (Math.random() < 0.5 ? -1 : 1) * r
      positions[i * 3 + 1] = 0
      positions[i * 3 + 2] = nearZ + Math.random() * (farZ - nearZ)
      scales[i] = 0.35 + Math.random() * 1.5
      tints[i] = Math.random()
      phases[i] = Math.random() * Math.PI * 2
      // Most hug the surface; a few ride high enough to pass the cruise.
      lifts[i] = 0.08 + Math.pow(Math.random(), 2.4) * 26
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    g.setAttribute('aTint', new THREE.BufferAttribute(tints, 1))
    g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
    g.setAttribute('aLift', new THREE.BufferAttribute(lifts, 1))
    return g
  }, [])

  const uniforms = useMemo(
    () => ({
      ...sharedUniforms,
      uPixelRatio: { value: dpr },
      uColorA: { value: new THREE.Color(PALETTE.spriteA) },
      uColorB: { value: new THREE.Color(PALETTE.spriteB) },
    }),
    [dpr],
  )

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
