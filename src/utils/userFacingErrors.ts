/** Plain-language fallbacks when the client detects a failure before SSE error arrives. */
export const QUERY_GENERIC_ERROR =
  "We couldn't get an answer right now. Please wait a moment and try again."

export const QUERY_INCOMPLETE_ERROR =
  "The answer didn't finish. Please try again."

/** Strip legacy/technical adapter messages if any slip through. */
export function toUserFacingQueryError(raw: string | undefined): string {
  if (!raw?.trim()) return QUERY_GENERIC_ERROR
  const lower = raw.toLowerCase()
  if (
    lower.includes('rag engine') ||
    lower.includes('rag query') ||
    lower.includes('connection closed') ||
    lower.includes('connection lost') ||
    lower.includes('remoteprotocol') ||
    lower.includes('unavailable during query')
  ) {
    return QUERY_GENERIC_ERROR
  }
  if (lower.includes("didn't finish") || lower.includes('ended unexpectedly')) {
    return QUERY_INCOMPLETE_ERROR
  }
  // Already user-facing from adapter (no jargon).
  if (
    !lower.includes('http') &&
    !lower.includes('sse') &&
    !lower.includes('engine') &&
    !lower.includes('rag')
  ) {
    return raw
  }
  return QUERY_GENERIC_ERROR
}
