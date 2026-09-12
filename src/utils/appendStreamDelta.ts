/** Join streamed answer tokens when the upstream omits inter-token spaces. */
export function appendStreamDelta(existing: string, delta: string): string {
  if (!delta) return existing
  if (!existing) return delta
  if (/\s$/.test(existing) || /^\s/.test(delta)) {
    return existing + delta
  }
  if (/^[.,;:!?)}\]'"-]/.test(delta)) {
    return existing + delta
  }
  if (/[([{'"-]$/.test(existing)) {
    return existing + delta
  }
  return `${existing} ${delta}`
}
