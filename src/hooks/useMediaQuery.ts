import { useEffect, useState } from 'react'

function getMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

/** Tracks whether a CSS media `query` currently matches, via
 * `window.matchMedia` and its `change` event — no resize polling. Used by
 * `AppLayout`/`ChatInput` to switch between the desktop sidebar/composer
 * and the phone/tablet Drawer + compact composer at fixed breakpoints
 * (768px, 480px) rather than duplicating the same breakpoints as ad hoc
 * `window.innerWidth` reads scattered across components.
 *
 * Returns `false` when `window.matchMedia` isn't available at all (SSR, or
 * an older/minimal jsdom environment) instead of throwing, and again for
 * one tick after mount before the effect below has run — so a consumer
 * never has to guard against this hook throwing, only against a possibly
 * stale first render, exactly like any other browser-API-backed hook. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getMatches(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)

    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}
