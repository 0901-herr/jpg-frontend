/**
 * Sidebar indexing-status auto-refresh.
 *
 * VITE_BROWSE_REFRESH_SECONDS controls how often the sidebar polls expanded
 * folders (and, in category mode, the classification groups) while at least
 * one visible document has not settled into READY/FAILED. Set to 0 to
 * disable polling entirely (manual refresh button still works). Defaults to
 * 15 seconds when unset.
 */
function parseSeconds(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

export const BROWSE_REFRESH_SECONDS = parseSeconds(
  import.meta.env.VITE_BROWSE_REFRESH_SECONDS,
  15,
)

/** Poll cadence once every visible document has settled (READY/FAILED). Not user-configurable. */
export const BROWSE_IDLE_REFRESH_SECONDS = 60
