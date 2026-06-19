import { useEffect, useRef, type RefObject } from 'react'

/**
 * Call `onAway` when a pointerdown lands outside `ref`. Only listens while
 * `active` is true (e.g. a panel is open), so closed panels add no global
 * handler. Uses pointerdown so it fires before click handlers and on touch;
 * the toggle button lives inside `ref`, so clicking it never counts as "away".
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onAway: () => void,
): void {
  // Latest-callback ref so the listener effect doesn't re-subscribe on every
  // render. Update in an effect, never during render (React rules-of-render).
  const cb = useRef(onAway)
  useEffect(() => {
    cb.current = onAway
  })
  useEffect(() => {
    if (!active) return
    const handler = (e: PointerEvent) => {
      const el = ref.current
      if (el && !el.contains(e.target as Node)) cb.current()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [ref, active])
}
