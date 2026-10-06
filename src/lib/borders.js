// Border treatments for the content deck.
//
// The deck sits over a lit blue landscape, so a single quiet border does not
// hold its edge. Rather than pick one, the deck ships all of them with a
// control to cycle through -- the site is the product of a design bake-off, and
// leaving the variation visible is more honest than pretending one won.

export const BORDERS = [
  { id: 'neon', label: 'Neon' },
  { id: 'brackets', label: 'Brackets' },
  { id: 'scanline', label: 'Scanline' },
  { id: 'circuit', label: 'Circuit' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'plate', label: 'Plate' },
]

const KEY = 'cvaie:deck-border'

export function loadBorder() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && BORDERS.some((b) => b.id === saved)) return saved
  } catch {
    // Private mode, blocked storage: fall through to the default.
  }
  return BORDERS[0].id
}

export function saveBorder(id) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Not worth failing a click over.
  }
}

export const nextBorder = (id) =>
  BORDERS[(BORDERS.findIndex((b) => b.id === id) + 1) % BORDERS.length].id
