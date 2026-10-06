import { FLIGHT } from '../config.js'
import { smoothstep } from './anchors.js'

const DEG = Math.PI / 180

/**
 * The flight path, as a pure function of scroll progress.
 *
 * Altitude falls as (1-t)^3 through the dive, which is what gives the move its
 * shape: the slope is steepest the instant you tip over and flattens out as it
 * approaches cruise, so the pull-up reads as a pull-up rather than a corner.
 * Pitch follows a gentler power so the nose comes level a little before the
 * altitude settles -- you are already on the horizon as you bottom out.
 *
 * Returns world y, world z and pitch in radians. Pure, so it can be charted or
 * asserted on without a renderer.
 */
export function flightAt(p, openingScale = 1) {
  const { startPitch, cruiseY, cruisePitch, cruiseZ, endZ, diveEnd } = FLIGHT
  // Scaling the start point along its own vector keeps the opening composition
  // identical and just moves it further out, which is how a narrow viewport
  // gets the whole logo in frame instead of a cropped middle of it.
  const startY = FLIGHT.startY * openingScale
  const startZ = FLIGHT.startZ * openingScale
  const progress = Math.min(1, Math.max(0, p))

  if (progress < diveEnd) {
    const t = progress / diveEnd
    const fall = Math.pow(1 - t, 3)
    const level = Math.pow(1 - t, 2.2)
    return {
      x: 0,
      y: cruiseY + (startY - cruiseY) * fall,
      z: startZ + (cruiseZ - startZ) * t,
      pitch: (cruisePitch + (startPitch - cruisePitch) * level) * DEG,
    }
  }

  const t = (progress - diveEnd) / (1 - diveEnd)
  const z = cruiseZ + (endZ - cruiseZ) * t

  // Keep letting down once the ridge is behind you, so the far side is a
  // descent into Charlottesville rather than a level run at crossing height.
  const arrival = smoothstep(FLIGHT.arrivalFromZ, FLIGHT.arrivalToZ ?? endZ, z)
  return {
    x: FLIGHT.arrivalX * arrival,
    y: cruiseY + (FLIGHT.arrivalY - cruiseY) * arrival,
    z,
    pitch: cruisePitch * DEG,
  }
}

/**
 * How much further out the opening has to sit for the artwork to fit the frame.
 *
 * The camera's field of view is vertical, so a narrow viewport sees a much
 * narrower slice of world: at a phone's aspect the logo overflows both sides
 * from the distance that frames it perfectly on a laptop. Returns >= 1, so a
 * wide viewport keeps the tuned framing untouched.
 */
export function openingScaleFor(aspect, fovDegrees, halfSpan) {
  const tanHorizontal = aspect * Math.tan((fovDegrees * DEG) / 2)
  const needed = halfSpan / Math.max(tanHorizontal, 0.0001)
  const tuned = Math.hypot(FLIGHT.startY, FLIGHT.startZ)
  return Math.max(1, needed / tuned)
}
