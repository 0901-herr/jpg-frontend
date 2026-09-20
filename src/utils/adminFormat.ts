/** Short timestamp for admin refresh metadata, e.g. "Last update Sep 13, 4:22:05 PM". */
export function formatLastUpdate(dataUpdatedAt: number): string {
  const date = new Date(dataUpdatedAt)
  if (Number.isNaN(date.getTime())) return ''
  return `Last update ${date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })}`
}

/** Human-readable ETA from seconds. */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}
