import { useEffect, useState } from 'react'

function getHeight(): number | undefined {
  if (typeof window === 'undefined') return undefined
  return window.visualViewport?.height
}

/** Tracks `window.visualViewport.height` — the *visible* viewport, which
 * iOS Safari shrinks when the on-screen keyboard opens without shrinking
 * the layout viewport (`100vh`/`100dvh` stay put; only `visualViewport`
 * reacts). `AppLayout`'s shell applies this as its inline height so the
 * composer sits directly above the keyboard instead of scrolling out of
 * view underneath it — the CSS `100dvh` rule (index.css's
 * `.docu-app-shell`) is its fallback everywhere this hook returns
 * `undefined`: SSR, an older/minimal jsdom environment, or a browser
 * without the `visualViewport` API (desktop Chrome/Safari have it too,
 * but there it always equals the layout viewport, so applying it changes
 * nothing there).
 *
 * Listens on both `resize` (the keyboard opening/closing) and `scroll`
 * (iOS Safari also fires this on the visual viewport while the page's own
 * scroll position or the keyboard's overlay shifts what's visible,
 * without a `resize`) — both cleaned up on unmount. */
export function useVisualViewportHeight(): number | undefined {
  const [height, setHeight] = useState<number | undefined>(getHeight)

  useEffect(() => {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : undefined
    if (!viewport) return

    const onChange = () => setHeight(viewport.height)
    onChange()
    viewport.addEventListener('resize', onChange)
    viewport.addEventListener('scroll', onChange)
    return () => {
      viewport.removeEventListener('resize', onChange)
      viewport.removeEventListener('scroll', onChange)
    }
  }, [])

  return height
}
