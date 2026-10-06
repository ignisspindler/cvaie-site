import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { sharedUniforms } from '../lib/waves.js'
import { loadFarTerrain, farTerrain } from '../lib/terrain.js'
import { HORIZON, PALETTE, TERRAIN } from '../config.js'

// The horizon: northern Albemarle, the Blue Ridge west and the Shenandoah
// north. Real ground you never fly over, so it is one coarse displaced mesh
// rather than tiles, coloured by elevation instead of by the artwork.
//
// It also serves as the ground everywhere -- what you see through the seams
// between tiles -- which is why it samples the near grid where that exists and
// only falls back to its own coarse grid further out.

const rampGLSL = HORIZON.ramp.stops
  .map(([at, hex]) => {
    const c = new THREE.Color(hex).convertSRGBToLinear()
    return { at, r: c.r, g: c.g, b: c.b }
  })
  .reduce((acc, stop, i, all) => {
    if (i === 0) return `  vec3 col = vec3(${stop.r.toFixed(4)}, ${stop.g.toFixed(4)}, ${stop.b.toFixed(4)});\n`
    const prev = all[i - 1]
    return `${acc}  col = mix(col, vec3(${stop.r.toFixed(4)}, ${stop.g.toFixed(4)}, ${stop.b.toFixed(4)}), smoothstep(${prev.at.toFixed(4)}, ${stop.at.toFixed(4)}, e));\n`
  }, '')

const vertexShader = /* glsl */ `
uniform sampler2D uFar;
uniform vec4 uFarExtent;        // minX, minZ, 1/spanX, 1/spanZ
uniform sampler2D uTerrain;
uniform vec4 uTerrainExtent;
uniform vec3 uTerrainScale;     // units/m incl. exaggeration, datum, on/off
uniform float uDrop;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vMetres;

// Metres of ground, from the fine grid inside its extent and the coarse one
// outside, cross-faded over a band so the seam never shows as a step.
float groundMetres(vec2 p) {
  vec2 fu = clamp((p - uFarExtent.xy) * uFarExtent.zw, 0.0, 1.0);
  float coarse = texture2D(uFar, fu).r;

  vec2 nu = (p - uTerrainExtent.xy) * uTerrainExtent.zw;
  float fine = texture2D(uTerrain, clamp(nu, 0.0, 1.0)).r;

  // 1 well inside the fine grid, 0 outside it.
  vec2 d = min(nu, 1.0 - nu);
  float inside = smoothstep(0.0, 0.06, min(d.x, d.y)) * uTerrainScale.z;
  return mix(coarse, fine, inside);
}

float heightAt(vec2 p) {
  return (groundMetres(p) - uTerrainScale.y) * uTerrainScale.x;
}

void main() {
  vec3 p = position;
  float m = groundMetres(p.xz);
  p.y = (m - uTerrainScale.y) * uTerrainScale.x - uDrop;

  float e = 3.0;
  float hx = heightAt(p.xz + vec2(e, 0.0));
  float hz = heightAt(p.xz + vec2(0.0, e));
  vNormal = normalize(cross(vec3(0.0, hz - p.y, e), vec3(e, hx - p.y, 0.0)));

  vMetres = m;
  vWorld = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uSky;
uniform vec2 uHaze;
uniform vec2 uRamp;             // low metres, high metres
varying vec3 vWorld;
varying vec3 vNormal;
varying float vMetres;

void main() {
  float e = clamp((vMetres - uRamp.x) / (uRamp.y - uRamp.x), 0.0, 1.0);
${rampGLSL}

  // Enough shaping to read the ridgelines, not so much that the ramp is lost.
  vec3 n = normalize(vNormal);
  float light = 0.68 + 0.32 * max(dot(n, normalize(vec3(0.35, 0.85, 0.3))), 0.0);
  col *= light;

  float dist = distance(vWorld, cameraPosition);
  col = mix(col, uSky, smoothstep(uHaze.x, uHaze.y, dist));

  gl_FragColor = vec4(col, 1.0);
}
`

export default function Horizon() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadFarTerrain()
      .then(() => setReady(true))
      .catch((e) => console.warn('Horizon unavailable:', e.message))
  }, [])

  const geometry = useMemo(() => {
    if (!ready) return null
    const e = farTerrain.extent
    const g = new THREE.PlaneGeometry(
      e.maxX - e.minX, e.maxZ - e.minZ, HORIZON.segments[0], HORIZON.segments[1],
    )
    g.rotateX(-Math.PI / 2)
    g.translate((e.minX + e.maxX) / 2, 0, (e.minZ + e.maxZ) / 2)
    return g
  }, [ready])

  const uniforms = useMemo(() => {
    if (!ready) return null
    const e = farTerrain.extent
    return {
      uFar: { value: farTerrain.texture },
      uFarExtent: {
        value: new THREE.Vector4(
          e.minX, e.minZ, 1 / (e.maxX - e.minX), 1 / (e.maxZ - e.minZ),
        ),
      },
      uTerrain: sharedUniforms.uTerrain,
      uTerrainExtent: sharedUniforms.uTerrainExtent,
      uTerrainScale: sharedUniforms.uTerrainScale,
      uSky: { value: new THREE.Color(PALETTE.sky) },
      uHaze: { value: new THREE.Vector2(HORIZON.hazeNear, HORIZON.hazeFar) },
      uRamp: { value: new THREE.Vector2(HORIZON.ramp.low, HORIZON.ramp.high) },
      uDrop: { value: HORIZON.drop },
    }
  }, [ready])

  if (!ready || !geometry || !uniforms) return null

  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={-1}>
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        fog={false}
      />
    </mesh>
  )
}
