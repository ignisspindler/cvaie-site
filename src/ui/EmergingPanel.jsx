import { useEffect, useRef } from 'react'
import { anchorById } from '../lib/anchors.js'

/**
 * An ordinary 2D DOM panel bound to a point in the surface.
 *
 * It is deliberately NOT inside the 3D transform: text stays crisp, selectable
 * and accessible, and the page still works if WebGL never starts. The scene
 * only supplies a screen position and a 0..1 emergence value; the cut is a CSS
 * mask driven by that value, sweeping up out of the tiles for a 'water' anchor
 * and down out of the air for a 'sky' one.
 */
export default function EmergingPanel({ id, children }) {
  const ref = useRef(null)
  const anchor = anchorById(id)

  useEffect(() => {
    if (!anchor) {
      console.warn(`EmergingPanel: no anchor called "${id}"`)
      return
    }
    anchor.el = ref.current
    return () => {
      anchor.el = null
    }
  }, [id, anchor])

  return (
    <article
      ref={ref}
      className={`panel panel--${anchor?.from ?? 'water'}`}
      data-anchor={id}
    >
      {children}
    </article>
  )
}
