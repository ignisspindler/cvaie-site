import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import Horizon from './Horizon.jsx'
import City from './City.jsx'
import RegionalRoads from './RegionalRoads.jsx'
import SpriteField from './SpriteField.jsx'
import LogoSurface from './LogoSurface.jsx'
import Logo from './Logo.jsx'
import { sharedUniforms, surfaceHeight, pointer, bindTerrain, waveState } from '../lib/waves.js'
import { loadTerrain, terrain, terrainHeight } from '../lib/terrain.js'
import { ANCHORS, scroll, smoothstep, damp, easeOutCubic } from '../lib/anchors.js'
import { deckCards, deckChrome } from '../lib/deck.js'
import { flightAt, openingScaleFor } from '../lib/flight.js'
import { PALETTE, FLIGHT, LAYERS, POINTER, FIELD, FOG, TERRAIN, SURFACE, CITY, DECK } from '../config.js'

// How far a panel travels to arrive, in world units. Both are sized against
// FLIGHT.cruiseY: deep enough to be hidden, short enough that the panel is not
// still climbing when it is already level with a low-flying camera.
const WATER_SINK = 1.4
const SKY_DESCENT = 3.0

/**
 * The slope of the ground ahead, as a pitch angle in radians.
 *
 * Least squares over several samples rather than the difference between two:
 * a two-point slope nods the camera at every gully and field edge, because the
 * Piedmont is bumpy at exactly the scale of a useful lookahead. Fitting a line
 * keeps the ridge response and drops the chatter.
 */
const SLOPE_SAMPLES = 6
function groundSlope(x, z) {
  const look = TERRAIN.pitchLookahead
  let sumD = 0, sumH = 0, sumDD = 0, sumDH = 0
  for (let i = 0; i < SLOPE_SAMPLES; i++) {
    const d = (i / (SLOPE_SAMPLES - 1)) * look
    const h = terrainHeight(x, z - d)   // -z is forward
    sumD += d
    sumH += h
    sumDD += d * d
    sumDH += d * h
  }
  const n = SLOPE_SAMPLES
  const denom = n * sumDD - sumD * sumD
  if (denom === 0) return 0
  const slope = (n * sumDH - sumD * sumH) / denom
  return Math.atan(slope) * TERRAIN.pitchFollow
}

const projected = new THREE.Vector3()
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const ray = new THREE.Raycaster()
const hit = new THREE.Vector3()

/**
 * The bridge between the document and the scene.
 *
 * Once per frame it flies the camera from the scroll position, works out how
 * far each panel has surfaced, feeds those to the surface shaders, and writes
 * each panel's screen position back onto its DOM node as CSS vars. No React
 * state is touched, so scrolling never re-renders the tree.
 */
function FlightRig() {
  const { camera, size } = useThree()
  const started = useRef(false)
  const prevPointer = useRef({ x: 0, y: 0 })
  const pointerStrength = useRef(0)
  // Recomputed only on resize: the opening framing depends on the viewport's
  // aspect, the rest of the flight does not.
  const openingScale = useRef(1)
  useEffect(() => {
    openingScale.current = openingScaleFor(camera.aspect, camera.fov, FIELD.worldSize * 0.46)
  }, [camera, size.width, size.height])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const step = Math.min(dt, 0.1)
    sharedUniforms.uTime.value = t

    // --- camera -----------------------------------------------------------
    const path = flightAt(scroll.p, openingScale.current)
    camera.rotation.order = 'YXZ'
    // Terrain-driven pitch belongs to the cruise, not the dive: during the
    // descent the path's own pitch is the whole move.
    const landedPitch = smoothstep(FLIGHT.diveEnd * 0.85, FLIGHT.diveEnd * 1.15, scroll.p)

    // Hold height above the ground rather than above zero, so the climb to
    // Monticello's ridge and the drop into the valley past it are flown, not
    // just watched.
    const ground = TERRAIN.followGround
      ? terrainHeight(path.x, path.z)
      : 0
    const targetY = path.y + ground

    // Pitch with the ground once the dive has landed: nose up on the climb to
    // the ridge, level over the crest, down the far side into the town. Measured
    // from the slope ahead rather than underfoot, so the nose leads the terrain
    // the way a pilot flies it instead of reacting after the fact.
    let targetPitch = path.pitch
    if (TERRAIN.followGround && TERRAIN.pitchFollow) {
      targetPitch = path.pitch + groundSlope(path.x, path.z) * landedPitch
    }

    if (started.current) {
      camera.position.x = damp(camera.position.x, path.x, FLIGHT.damping, step)
      camera.position.y = damp(camera.position.y, targetY, FLIGHT.damping, step)
      camera.position.z = damp(camera.position.z, path.z, FLIGHT.damping, step)
      camera.rotation.x = damp(camera.rotation.x, targetPitch, FLIGHT.damping, step)
    } else {
      camera.position.set(path.x, targetY, path.z)
      camera.rotation.set(targetPitch, 0, 0)
      started.current = true
    }

    // Hand the surface's form from swell to terrain across the dive: full wave
    // while the logo is still water seen from above, almost none once you are
    // flying the ground.
    const landed = smoothstep(0, FLIGHT.diveEnd, scroll.p)
    waveState.mix = 1 + (SURFACE.SETTLED_AMPLITUDE - 1) * landed
    sharedUniforms.uWaveMix.value = waveState.mix

    // Open the fog out by however far the opening had to retreat, then close it
    // back to the tuned range as the dive lands.
    const fogScale = 1 + (openingScale.current - 1) *
      (1 - smoothstep(0, FLIGHT.diveEnd, scroll.p))
    if (state.scene.fog) {
      state.scene.fog.near = FOG.near * fogScale
      state.scene.fog.far = FOG.far * fogScale
    }

    // Idle life, scaled away during the dive so it never fights the descent.
    const settled = smoothstep(FLIGHT.diveEnd * 0.6, FLIGHT.diveEnd, scroll.p)
    camera.position.y += Math.sin(t * 0.33) * FLIGHT.bobAmplitude * settled
    camera.position.x += Math.sin(t * 0.19) * FLIGHT.driftAmplitude * settled

    // Never let the damped camera sink into the hill it is chasing.
    const under = terrainHeight(camera.position.x, camera.position.z) + TERRAIN.minClearance
    if (camera.position.y < under) camera.position.y = under

    // --- pointer ripple ---------------------------------------------------
    if (POINTER.ENABLE_POINTER_RIPPLE) {
      const moved = Math.abs(state.pointer.x - prevPointer.current.x) > 0.0005 ||
        Math.abs(state.pointer.y - prevPointer.current.y) > 0.0005
      prevPointer.current = { x: state.pointer.x, y: state.pointer.y }

      ray.setFromCamera(state.pointer, camera)
      if (ray.ray.intersectPlane(groundPlane, hit)) {
        pointer.x = hit.x
        pointer.z = hit.z
      }
      pointerStrength.current = damp(
        pointerStrength.current,
        moved ? 1 : 0,
        moved ? 7 : POINTER.relax,
        step,
      )
      pointer.strength = pointerStrength.current
      sharedUniforms.uPointer.value.set(pointer.x, pointer.z, pointer.strength)
    }

    // --- panels -----------------------------------------------------------
    ANCHORS.forEach((anchor, i) => {
      // Distance ahead of the camera drives the emergence. The window is wide
      // because the cruise covers ~120 world units of scroll: a tight one would
      // flash the panel past in a few dozen pixels of wheel.
      const ahead = camera.position.z - anchor.pos.z
      const target = smoothstep(50, 32, ahead) * smoothstep(4, 12, ahead)
      anchor.emerge = damp(anchor.emerge, target, 2.4, step)

      const base = surfaceHeight(anchor.pos.x, anchor.pos.z, t)
      anchor.pos.y = anchor.from === 'sky'
        ? base + anchor.rise + (1 - anchor.emerge) * SKY_DESCENT
        : base - WATER_SINK + anchor.emerge * anchor.rise

      // Surface bulges and foams only where a panel is pushing through it.
      sharedUniforms.uAnchors.value[i].set(
        anchor.pos.x,
        anchor.pos.z,
        anchor.emerge,
        anchor.from === 'sky' ? 1 : 0,
      )

      const el = anchor.el
      if (!el) return
      if (anchor.emerge < 0.01) {
        el.style.visibility = 'hidden'
        anchor.box = null
        return
      }
      // Measure once per appearance: offsetWidth in the frame loop would force
      // a layout on every tick, which is exactly what this rig exists to avoid.
      if (!anchor.box) {
        anchor.box = { w: el.offsetWidth, h: el.offsetHeight }
      }

      projected.copy(anchor.pos).project(camera)
      // Behind the camera, project() mirrors the point instead of failing, and
      // the viewport clamp below would then happily pin that garbage to an
      // edge. A panel we have already flown past is simply gone.
      if (projected.z > 1) {
        el.style.visibility = 'hidden'
        anchor.box = null
        return
      }

      let px = (projected.x * 0.5 + 0.5) * size.width
      let py = (-projected.y * 0.5 + 0.5) * size.height

      // The anchor is a point in the world, but the panel is a fixed-width slab
      // of text: close to the camera a modest world offset throws it off-screen.
      // Clamp to the viewport so the panel always stays readable, and let it
      // drift off its exact anchor rather than off the edge.
      const halfW = anchor.box.w / 2 + 14
      px = Math.min(Math.max(px, halfW), size.width - halfW)
      const top = anchor.from === 'sky' ? 14 : anchor.box.h + 14
      py = Math.min(Math.max(py, top), size.height - (anchor.from === 'sky' ? anchor.box.h + 14 : 14))

      el.style.visibility = 'visible'
      el.style.setProperty('--x', `${px}px`)
      el.style.setProperty('--y', `${py}px`)
      el.style.setProperty('--emerge', anchor.emerge.toFixed(4))
    })

    // --- content deck -----------------------------------------------------
    // Driven by where the camera actually is rather than by scroll, so the
    // cards are seated over the city centroid even while the flight is still
    // damping toward it.
    if (deckCards.length) {
      const arriving = Math.min(1, Math.max(0,
        (camera.position.z - DECK.fromZ) / (DECK.toZ - DECK.fromZ)))
      const span = 1 - (deckCards.length - 1) * DECK.stagger
      deckCards.forEach((el, i) => {
        if (!el) return
        if (arriving <= 0.0005) {
          el.style.visibility = 'hidden'
          return
        }
        const local = Math.min(1, Math.max(0, (arriving - i * DECK.stagger) / span))
        el.style.visibility = 'visible'
        el.style.setProperty('--deck', easeOutCubic(local).toFixed(4))
      })
      // The control arrives after the cards it belongs to, and is hidden rather
      // than merely transparent so it cannot be clicked before it is there.
      if (deckChrome.el) {
        const ui = Math.min(1, Math.max(0, (arriving - 0.75) / 0.25))
        deckChrome.el.style.visibility = ui > 0.01 ? 'visible' : 'hidden'
        deckChrome.el.style.setProperty('--deck-ui', ui.toFixed(3))
      }
    } else if (deckChrome.el) {
      deckChrome.el.style.visibility = 'hidden'
    }
  })

  return null
}

export default function Scene() {
  const [terrainReady, setTerrainReady] = useState(false)
  useEffect(() => {
    loadTerrain()
      .then(() => {
        bindTerrain()
        setTerrainReady(true)
        console.info(
          `Terrain: ${terrain.width}x${terrain.height} grid, ` +
          `${terrain.meta.elevationMin}-${terrain.meta.elevationMax} m, ` +
          `USGS 3DEP at ${TERRAIN.exaggeration}x vertical`,
        )
      })
      // The surface is simply flat without it, which is a worse picture but a
      // working page -- not a reason to take the whole scene down.
      .catch((e) => console.warn('Terrain unavailable, staying flat:', e.message))
  }, [])

  const onCityReady = useCallback((c) => {
    console.info(
      `City: ${c.counts.buildings} buildings (${c.counts.triangles} tris), ` +
      `${c.counts.roadSegments} road segments, on terrain`,
    )
  }, [])

  const onRoadsReady = useCallback((r) => {
    console.info(`RegionalRoads: ${r.segments} segments (TIGER/Line)`)
  }, [])

  const onReady = useCallback((field) => {
    console.info(
      `LogoSurface: ${field.count} tiles ` +
      `(${field.logoCount} logo at grid ${FIELD.GRID_RESOLUTION}, ` +
      `${field.landCount} land) tile ${field.tileSize.toFixed(2)}u`,
    )
  }, [])

  return (
    <>
      <color attach="background" args={[PALETTE.sky]} />
      <fog attach="fog" args={[PALETTE.sky, FOG.near, FOG.far]} />

      {/* Soft fill, a warm key that the ripples catch, and a cool rim so the
          tile edges separate from the surface behind them. */}
      <hemisphereLight args={[PALETTE.shallowWater, PALETTE.deepWater, 0.95]} />
      <ambientLight intensity={0.42} />
      <directionalLight position={[48, 95, 40]} intensity={2.9} color="#ffd9b0" />
      <directionalLight position={[-60, 28, -45]} intensity={1.0} color="#6fa8ff" />

      <LogoSurface onReady={onReady} />
      {LAYERS.depthPlane && <Horizon />}
      {LAYERS.spriteField && <SpriteField />}
      {CITY.enabled && terrainReady && <City onReady={onCityReady} />}
      {CITY.enabled && terrainReady && <RegionalRoads onReady={onRoadsReady} />}
      {LAYERS.logoBadge && (
        <Suspense fallback={null}>
          <Logo />
        </Suspense>
      )}

      <FlightRig />
    </>
  )
}
