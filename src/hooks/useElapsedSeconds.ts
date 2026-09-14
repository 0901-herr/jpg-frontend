import { useEffect, useState } from 'react'

function secondsSince(startedAt: number): number {
  return Math.max(0, Math.round((Date.now() - startedAt) / 1000))
}

/** Ticks once a second, returning whole seconds elapsed since `startedAt`
 * (epoch ms), while `active` is true. Intentionally local to the component
 * that renders the number — a `setInterval` in a high-level component like
 * `AppLayout` would re-render far more of the tree than necessary once a
 * second for the life of every in-flight query. Stops the interval (but
 * keeps returning the last computed value) as soon as `active` goes false,
 * so a finished/streaming-with-content message stops ticking without
 * resetting to 0. */
export function useElapsedSeconds(startedAt: number | undefined, active: boolean): number {
  const [elapsed, setElapsed] = useState(() => (startedAt != null ? secondsSince(startedAt) : 0))

  useEffect(() => {
    if (!active || startedAt == null) return
    setElapsed(secondsSince(startedAt))
    const id = window.setInterval(() => setElapsed(secondsSince(startedAt)), 1000)
    return () => window.clearInterval(id)
  }, [active, startedAt])

  return elapsed
}
