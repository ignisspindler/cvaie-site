import * as THREE from 'three'

// A panel is a DOM element bound to a point in the surface.
//
// Nothing here lives in React state: the frame loop writes CSS custom
// properties straight onto `el`, so a scroll never triggers a re-render.
//
// `from` picks where the content comes from:
//   'water' -- rises out of the tile field, bulging and foaming the surface.
//   'sky'   -- descends from above; no bulge, no foam, cut from the top down.
// `z` positions it along the flight; the cruise runs from FLIGHT.cruiseZ to
// FLIGHT.endZ, so anchors want to sit inside that stretch. `rise` is measured
// against FLIGHT.cruiseY -- these are sized for a camera about 1.5 units off
// the ground, so dropping the cruise lower means bringing them down with it.
//
// All three finish BEFORE the content deck starts arriving at DECK.fromZ
// (-49): a world-anchored panel still on screen when the deck seats lands on
// top of it.
// Empty by design. These panels used to surface out of the water and descend
// from the sky during the run, but they arrived at semi-random points on screen
// and competed with the content deck that lands at the end. Their content moved:
// the next meetup to the hero, About Us into the deck's mission card, the
// sponsor into the footer and the sponsors overlay.
//
// The machinery is intact -- add an entry here and it will surface again, and
// the shaders pick the count up automatically.
export const ANCHORS = []

export const anchorById = (id) => ANCHORS.find((a) => a.id === id)

/** Native document scroll, sampled once per scroll event. */
export const scroll = { y: 0, max: 1, p: 0 }

export const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export const damp = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt))

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
export const easeInCubic = (t) => t * t * t
