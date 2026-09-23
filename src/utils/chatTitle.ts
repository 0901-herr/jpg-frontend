/** Chat auto-titles — mirrors jpg-adapter `services/chat/titles.py`.
 *
 * A new chat gets a placeholder title (`Session 23 Sep 2026 (1)`). The
 * adapter replaces it with the owner's first question when that message is
 * persisted; the store applies the same rule locally so the sidebar matches
 * the server without waiting for a reload. */

export const DEFAULT_SESSION_TITLE = /^Session \d{1,2} [A-Z][a-z]{2} \d{4} \(\d+\)$/

export const MAX_AUTO_TITLE_CHARS = 120

export function isDefaultSessionTitle(title: string | null | undefined): boolean {
  return !!title && DEFAULT_SESSION_TITLE.test(title.trim())
}

/** Whitespace collapsed; past MAX_AUTO_TITLE_CHARS, cut at a word boundary
 * (no ellipsis marker — house UI-copy rule; the sidebar row truncates
 * visually). Null when there is no visible text. */
export function titleFromQuestion(content: string | null | undefined): string | null {
  const text = (content ?? '').split(/\s+/).filter(Boolean).join(' ')
  if (!text) return null
  if (text.length <= MAX_AUTO_TITLE_CHARS) return text
  let cut = text.slice(0, MAX_AUTO_TITLE_CHARS)
  const space = cut.lastIndexOf(' ')
  if (text[MAX_AUTO_TITLE_CHARS] !== ' ' && space >= Math.floor(MAX_AUTO_TITLE_CHARS / 2)) {
    cut = cut.slice(0, space)
  }
  return cut.trimEnd()
}
