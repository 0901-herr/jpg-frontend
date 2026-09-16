import { describe, expect, it } from 'vitest'
import {
  FOLDER_LOAD_PERMISSION_ERROR,
  FOLDER_LOAD_SERVER_ERROR,
  MQA_METADATA_GENERIC_ERROR,
  QUERY_ALMOST_DONE_ERROR,
  QUERY_PARTIAL_ANSWER_ERROR,
  QUERY_PERMISSION_DENIED_ERROR,
  QUERY_SERVER_ERROR,
  QUERY_SESSION_EXPIRED_ERROR,
  toUserFacingFolderLoadError,
  toUserFacingMqaMetadataError,
  toUserFacingQueryError,
} from './userFacingErrors'

describe('toUserFacingQueryError', () => {
  it('uses almost-done message when failure follows assembly stage', () => {
    expect(
      toUserFacingQueryError('RAG Engine unavailable during query', {
        progressLabel: 'Almost done. Putting your answer together…',
      }),
    ).toBe(QUERY_ALMOST_DONE_ERROR)
  })

  it('uses partial answer message when tokens started', () => {
    expect(
      toUserFacingQueryError('stream ended', { hadPartialAnswer: true }),
    ).toBe(QUERY_PARTIAL_ANSWER_ERROR)
  })

  it('uses the session-expired message for 401', () => {
    expect(toUserFacingQueryError('Unauthorized', { httpStatus: 401 })).toBe(
      QUERY_SESSION_EXPIRED_ERROR,
    )
  })

  it('uses the permission-denied message for 403 with no body message', () => {
    expect(toUserFacingQueryError(undefined, { httpStatus: 403 })).toBe(
      QUERY_PERMISSION_DENIED_ERROR,
    )
  })

  it('surfaces the server message for a 403 that carries one (e.g. a view-only chat)', () => {
    expect(toUserFacingQueryError('This chat is view-only', { httpStatus: 403 })).toBe(
      'This chat is view-only',
    )
  })

  it('uses server error message for 5xx before streaming heuristics', () => {
    expect(
      toUserFacingQueryError('Internal Server Error', {
        httpStatus: 500,
        hadPartialAnswer: true,
      }),
    ).toBe(QUERY_SERVER_ERROR)
  })
})

describe('toUserFacingFolderLoadError', () => {
  it('maps 403 to the permission-denied title and body', () => {
    expect(toUserFacingFolderLoadError(403)).toEqual(FOLDER_LOAD_PERMISSION_ERROR)
  })

  it('maps a 5xx status to the server-unavailable title and body', () => {
    expect(toUserFacingFolderLoadError(502)).toEqual(FOLDER_LOAD_SERVER_ERROR)
  })

  it('maps an unknown/network failure (no HTTP status) to the server-unavailable copy', () => {
    expect(toUserFacingFolderLoadError(undefined)).toEqual(FOLDER_LOAD_SERVER_ERROR)
  })
})

describe('toUserFacingMqaMetadataError', () => {
  // The contract's own detail strings are matched by their raw (technical)
  // wording, but never shown verbatim — plain-language sweep: each known
  // detail maps to its own jargon-free display line instead.
  it.each([
    [
      'Document is still being indexed. Try again when it is Ready.',
      "This document isn't ready yet. Try again once it shows Ready.",
    ],
    [
      'Document is not ready for extraction.',
      "This document isn't ready for that yet. Please try again shortly.",
    ],
    [
      'Metadata extraction timed out. Please try again.',
      'That took too long. Please try again.',
    ],
    [
      'Metadata extraction failed. Please try again.',
      'That did not work. Please try again.',
    ],
  ])('maps the contract detail "%s" to a plain-language line', (detail, expected) => {
    expect(toUserFacingMqaMetadataError(detail)).toBe(expected)
  })

  it('falls back to the generic message for an unrecognized detail', () => {
    expect(toUserFacingMqaMetadataError('Internal Server Error')).toBe(MQA_METADATA_GENERIC_ERROR)
  })

  it('falls back to the generic message when there is no detail at all', () => {
    expect(toUserFacingMqaMetadataError(undefined)).toBe(MQA_METADATA_GENERIC_ERROR)
  })

  // Regression guard: an earlier version looked the detail up with the `in`
  // operator on a plain object, which walks the prototype chain. An
  // adapter `detail` of exactly "constructor" (or another Object.prototype
  // member name) would then resolve to that prototype function instead of
  // falling through to the generic string — a real crash risk wherever
  // the result is rendered (e.g. as an antd `message.error` child).
  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'toLocaleString'])(
    'treats an adapter detail of "%s" as unrecognized, not an Object.prototype member',
    (detail) => {
      const result = toUserFacingMqaMetadataError(detail)
      expect(typeof result).toBe('string')
      expect(result).toBe(MQA_METADATA_GENERIC_ERROR)
    },
  )
})
