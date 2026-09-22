/** Return a URL that is safe to hand to `window.open` for a user-visible
 * document link. API responses are data, not trusted markup; in particular,
 * never allow a `javascript:` or `data:` URL to become a new-tab navigation. */
export function safeNewTabUrl(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const protocol = new URL(trimmed, 'https://arche-ai.invalid').protocol
    return protocol === 'http:' || protocol === 'https:' ? trimmed : null
  } catch {
    return null
  }
}
