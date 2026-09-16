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
    // A body message (e.g. "This chat is view-only") is more specific than
    // the generic permission text and safe to show as-is — the adapter
    // only ever puts jargon-free copy in this field. No message at all
    // (a bare 403 with no parseable body) still falls back to the generic
    // line rather than a raw HTTP reason phrase.
    return raw?.trim() ? raw.trim() : QUERY_PERMISSION_DENIED_ERROR
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

/** Title + body shown when the sidebar's folder tree fails to load
 * initially (`useBrowseTree`'s `initError` path) — UX P1-5 / scope item 12.
 * Distinct from `toUserFacingQueryError` above (query-flow errors are a
 * single string, not a title+body pair) but deliberately similar in shape:
 * a permission problem and a server/network problem must never render the
 * same copy, and neither ever surfaces the raw `err.message`. */
export interface FolderLoadError {
  title: string
  body: string
}

export const FOLDER_LOAD_PERMISSION_ERROR: FolderLoadError = {
  title: 'You do not have access',
  body: 'Your LogicalDOC session does not allow browsing these folders. Reopen ARCHE AI from LogicalDOC.',
}

export const FOLDER_LOAD_SERVER_ERROR: FolderLoadError = {
  title: 'Could not load folders',
  body: 'The document service is temporarily unavailable. Try again in a moment.',
}

/** 401 is handled separately (routes to the session-expired page) before
 * this is ever called — `httpStatus` here is only 403 or anything else
 * (5xx, a network failure, or an unexpected non-ApiError exception). */
export function toUserFacingFolderLoadError(httpStatus: number | undefined): FolderLoadError {
  if (httpStatus === 403) return FOLDER_LOAD_PERMISSION_ERROR
  return FOLDER_LOAD_SERVER_ERROR
}

export const MQA_METADATA_GENERIC_ERROR = 'Could not extract metadata. Please try again.'

/** The mqa-metadata contract's own error details (409/504/502) are matched
 * by their raw (technical) wording below, but plain-language sweep: never
 * shown verbatim — each known detail maps to its own jargon-free display
 * line. Anything else (network failure, an unrecognized detail string, no
 * detail at all) falls back to the generic message rather than surfacing
 * raw/technical text. 401 is not handled here: it goes through the same
 * session-expired path the query flow uses (`toUserFacingQueryError` with
 * httpStatus 401). */
const MQA_METADATA_KNOWN_DETAILS: Record<string, string> = {
  'Document is still being indexed. Try again when it is Ready.':
    "This document isn't ready yet. Try again once it shows Ready.",
  'Document is not ready for extraction.':
    "This document isn't ready for that yet. Please try again shortly.",
  'Metadata extraction timed out. Please try again.': 'That took too long. Please try again.',
  'Metadata extraction failed. Please try again.': 'That did not work. Please try again.',
}

export function toUserFacingMqaMetadataError(detail: string | undefined): string {
  // `Object.hasOwn` (not `in`, which walks the prototype chain) — an
  // adapter `detail` of exactly "constructor" or another Object.prototype
  // member name must be treated as unrecognized, not resolve to that
  // prototype function.
  if (detail && Object.hasOwn(MQA_METADATA_KNOWN_DETAILS, detail)) {
    return MQA_METADATA_KNOWN_DETAILS[detail]
  }
  return MQA_METADATA_GENERIC_ERROR
}
