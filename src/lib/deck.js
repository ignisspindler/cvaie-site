// The content deck: cards that fly in radially once the ridge is behind you and
// are fully seated by the time the flight is over the middle of the city.
//
// Same discipline as the panels in anchors.js -- the frame loop writes a CSS
// custom property straight onto each element, so the arrival is driven by
// scroll without a single React re-render.

/** Card elements, in the order they are declared. Filled by ContentDeck. */
export const deckCards = []

/** The shuffle control, faded in with the cards rather than before them. */
export const deckChrome = { el: null }

/**
 * Where each card comes in from, as an angle in degrees.
 *
 * Measured the usual way but on a screen whose Y points down, so angles between
 * 180 and 360 put a card ABOVE the viewport: these four spread across the upper
 * half from the left shoulder round to the right.
 */
export const DECK_ANGLES = [208, 248, 292, 332]

/** Offset for a card at `angle`, as CSS lengths, at `distance` vmax out. */
export function entryOffset(angle, distance) {
  const r = (angle * Math.PI) / 180
  return {
    ox: `${(Math.cos(r) * distance).toFixed(2)}vmax`,
    oy: `${(Math.sin(r) * distance).toFixed(2)}vmax`,
    // Lean away from centre on the way in, so they settle rather than slide.
    spin: `${(Math.cos(r) * -9).toFixed(2)}deg`,
  }
}
