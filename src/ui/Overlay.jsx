import { useEffect, useRef } from 'react'

/**
 * A modal built on native <dialog>, so focus trapping, Escape and the backdrop
 * come from the platform rather than from hand-rolled key handlers.
 */
export default function Overlay({ open, onClose, title, children }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Covers Escape and any other platform-initiated close.
    const onNativeClose = () => onClose?.()
    el.addEventListener('close', onNativeClose)
    return () => el.removeEventListener('close', onNativeClose)
  }, [onClose])

  return (
    <dialog
      ref={ref}
      className="overlay"
      aria-label={title}
      // Clicking the backdrop lands on the dialog itself, not its contents.
      onClick={(e) => { if (e.target === ref.current) onClose?.() }}
    >
      <div className="overlay__inner">
        <header className="overlay__head">
          <h2 className="overlay__title">{title}</h2>
          <button type="button" className="overlay__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>
        <div className="overlay__body">{children}</div>
      </div>
    </dialog>
  )
}
