import type { ChatMessage } from '../types'

export interface SummaryChatMessages {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

// Matches an opening fence at the very start of the (trimmed) text, with no
// language tag, `markdown`, or `md` — the only tags this unwraps. Any other
// tag (a genuine fenced code sample, e.g. ```python) is left alone.
const LEADING_FENCE_OPEN = /^```(markdown|md)?[ \t]*\r?\n/i
const FENCE_CLOSE_LINE = /^```[ \t]*$/

/** Strips a leading code fence a cached document summary may have been
 * saved with — client feedback: a summary showed "the raw markdown
 * instead" of a rendered table, because the whole answer (or just its
 * opening block) had been wrapped in a ```markdown fence.
 *
 * Only a fence at the very start of the text is touched, and only when its
 * opening tag is `markdown`, `md`, or absent — never a fence elsewhere in
 * the text, and never one tagged with something else (a real fenced code
 * sample). Two shapes both fall out of the same rule ("find the leading
 * fence's matching close, drop both, keep everything else as-is"):
 *  - The fence wraps the whole document (its close is the last line) —
 *    the result is just the inner text.
 *  - The fence only wraps a leading block, e.g. a fenced table followed by
 *    plain bullets after the closing fence (the shape actually seen live)
 *    — the leading fence pair is stripped, the rest is left untouched.
 * A leading fence with no matching close (malformed) is left untouched
 * entirely, same as text with no leading fence at all. */
export function unwrapSummaryFence(text: string): string {
  const trimmed = text.trim()
  const openMatch = trimmed.match(LEADING_FENCE_OPEN)
  if (!openMatch) return text

  const afterOpen = trimmed.slice(openMatch[0].length)
  const lines = afterOpen.split('\n')
  const closeIndex = lines.findIndex((line) => FENCE_CLOSE_LINE.test(line))
  if (closeIndex === -1) return text

  const inner = lines.slice(0, closeIndex).join('\n').trim()
  const rest = lines.slice(closeIndex + 1).join('\n').trim()
  return rest ? `${inner}\n\n${rest}` : inner
}

/** Builds the user-request + completed-answer message pair for a fetched
 * document summary, so Summarize appends to chat history exactly like a
 * normal completed query answer (no streaming, no citations). */
export function buildSummaryMessages(summary: string): SummaryChatMessages {
  return {
    userMessage: {
      id: crypto.randomUUID(),
      role: 'user',
      content: 'Summarize this document',
    },
    assistantMessage: {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: unwrapSummaryFence(summary),
      status: 'complete',
    },
  }
}
