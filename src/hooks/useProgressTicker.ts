import { useEffect, useState } from 'react'

const TICK_INTERVAL_MS = 2500

/** Advances a tick counter roughly every 2.5s while `active` is true — the
 * clock behind the progress ticker's alternation between the real stage
 * label and a scope line naming the files/folders in play
 * (`progressTickerLabel` in `queryProgress.ts` turns a tick into text).
 * Mirrors `useElapsedSeconds`: a plain `setInterval` cleared on every
 * effect re-run and on unmount, so a completed/errored/aborted query never
 * leaves a timer running. Starts at 0 and simply stops advancing (keeping
 * its last value) once `active` goes false, rather than resetting — the
 * component this drives is remounted fresh for each new query turn, so
 * "start at 0" already holds without extra reset logic here. */
export function useProgressTicker(active: boolean): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setTick((t) => t + 1), TICK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [active])

  return tick
}
