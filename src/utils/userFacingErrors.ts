/** Plain-language fallbacks when the client detects a failure before SSE error arrives. */
export const QUERY_GENERIC_ERROR =
  'The search service is busy right now. Wait a few seconds and try again.'

export const QUERY_INCOMPLETE_ERROR =
  "We didn't quite finish your answer. Please try once more."

export const QUERY_ALMOST_DONE_ERROR =
  'We were almost done, but the answer was interrupted. Give it another try in a moment.'

export const QUERY_PARTIAL_ANSWER_ERROR =
  "We got part of your answer but couldn't finish. Try again."

export const QUERY_SESSION_EXPIRED_ERROR =
  'Your session has expired. Sign in again to continue.'

export const QUERY_PERMISSION_DENIED_ERROR =
  "You don't have permission to query the selected documents."

export const QUERY_SERVER_ERROR =
  'Something went wrong on our side. Wait a moment and try again.'

export interface QueryErrorContext {
  /** Last friendly progress label shown to the user, if any. */
  progressLabel?: string
  /** True when answer tokens had started streaming. */
  hadPartialAnswer?: boolean
  /** HTTP status when the failure came from an API response. */
  httpStatus?: number
}

const LATE_STAGE_HINTS = [
  'generating',
  'assembly',
  'synthesiz',
  'compos',
  'format',
  'almost',
  'final',
  'writing',
  'answer',
]

function isLateStage(label: string | undefined): boolean {
  if (!label) return false
  const lower = label.toLowerCase()
  return LATE_STAGE_HINTS.some((hint) => lower.includes(hint))
}

/** Strip legacy/technical adapter messages if any slip through. */
export function toUserFacingQueryError(
  raw: string | undefined,
  context: QueryErrorContext = {},
): string {
  const { progressLabel, hadPartialAnswer, httpStatus } = context

  if (httpStatus === 401) {
    return QUERY_SESSION_EXPIRED_ERROR
  }

  if (httpStatus === 403) {
    return QUERY_PERMISSION_DENIED_ERROR
  }

  if (httpStatus != null && httpStatus >= 500) {
    return QUERY_SERVER_ERROR
  }

  if (hadPartialAnswer) {
    return QUERY_PARTIAL_ANSWER_ERROR
  }

  if (isLateStage(progressLabel)) {
    return QUERY_ALMOST_DONE_ERROR
  }

  if (!raw?.trim()) return QUERY_GENERIC_ERROR

  const lower = raw.toLowerCase()

  if (
    lower.includes("didn't finish") ||
    lower.includes('ended unexpectedly') ||
    lower.includes('stream ended')
  ) {
    return isLateStage(progressLabel) ? QUERY_ALMOST_DONE_ERROR : QUERY_INCOMPLETE_ERROR
  }

  if (
    lower.includes('rag engine') ||
    lower.includes('rag query') ||
    lower.includes('connection closed') ||
    lower.includes('connection lost') ||
    lower.includes('remoteprotocol') ||
    lower.includes('unavailable during query') ||
    lower.includes("couldn't get an answer right now")
  ) {
    return isLateStage(progressLabel) ? QUERY_ALMOST_DONE_ERROR : QUERY_GENERIC_ERROR
  }

  if (
    lower.includes('searching your documents') ||
    lower.includes('something went wrong')
  ) {
    return raw
  }

  // Already user-facing from adapter (no jargon).
  if (
    !lower.includes('http') &&
    !lower.includes('sse') &&
    !lower.includes('engine') &&
    !lower.includes('rag') &&
    !lower.includes('unavailable')
  ) {
    return raw
  }

  return QUERY_GENERIC_ERROR
}
