import { useMemo } from 'react'
import * as THREE from 'three'
import { WAVE_GLSL, sharedUniforms } from '../lib/waves.js'
import { PALETTE, FIELD } from '../config.js'

// The depth plane: what you see THROUGH the gaps between tiles.
//
// It rides the same height field as the tile surface, sitting a little below
// it, so the seams read as depth in a body of water rather than as holes onto
// the background. Toggle it with LAYERS.depthPlane.

const DROP = 1.25   // world units below the tile field

const vertexShader = /* glsl */ `
${WAVE_GLSL}
uniform float uTime;
uniform float uDrop;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFoam;

void main() {
  vec3 p = position;
  p.y = surfaceHeight(p.xz, uTime) - uDrop;

  vec3 tangent, bitangent, normal;
  surfaceBasis(p.xz, uTime, 1.1, tangent, bitangent, normal);
  vNormal = normal;

  vFoam = foamAt(p.xz);
  vWorld = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoam;
uniform vec3 uSky;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vFoam;

void main() {
  vec3 n = normalize(vNormal);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 sun = normalize(vec3(0.35, 0.9, 0.25));

  float light = max(dot(n, sun), 0.0);
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);

  vec3 col = mix(uDeep, uShallow, light * 0.55);
  col += vec3(0.30, 0.48, 0.78) * fresnel * 0.16;

  // Specular glint off the low sun.
  vec3 halfVec = normalize(sun + viewDir);
  col += vec3(1.0, 0.72, 0.45) * pow(max(dot(n, halfVec), 0.0), 160.0) * 0.05;

  col = mix(col, uFoam, vFoam * 0.3);

  float dist = length(vWorld.xz - cameraPosition.xz);
  col = mix(col, uSky, smoothstep(110.0, 330.0, dist));

  gl_FragColor = vec4(col, 1.0);
}
`

export default function Ocean() {
  // Built already lying in XZ so local coords == world coords and the shader
  // never has to reason about the mesh rotation.
  const geometry = useMemo(() => {
    // Wide enough that its own edge sits beyond the fog's far plane -- at a
    // smaller span the rim of the plane shows as a hard wedge against the sky
    // in the high opening frame.
    const span = FIELD.worldSize * 7
    const g = new THREE.PlaneGeometry(span, span, 360, 360)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  const uniforms = useMemo(
    () => ({
      ...sharedUniforms,
      uDrop: { value: DROP },
      uDeep: { value: new THREE.Color(PALETTE.deepWater) },
      uShallow: { value: new THREE.Color(PALETTE.shallowWater) },
      uFoam: { value: new THREE.Color(PALETTE.foam) },
      uSky: { value: new THREE.Color(PALETTE.sky) },
    }),
    [],
  )

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}
