/** Format a configured service URL or host:port for admin health display. */
export function formatServiceTarget(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    if (trimmed.includes('://')) {
      const url = new URL(trimmed)
      const port =
        url.port || (url.protocol === 'https:' ? '443' : url.protocol === 'http:' ? '80' : '')
      return port ? `${url.hostname}:${port}` : url.hostname
    }
    return trimmed
  } catch {
    return trimmed
  }
}
