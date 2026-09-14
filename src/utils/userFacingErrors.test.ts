import { describe, expect, it } from 'vitest'
import {
  QUERY_ALMOST_DONE_ERROR,
  QUERY_PARTIAL_ANSWER_ERROR,
  QUERY_PERMISSION_DENIED_ERROR,
  QUERY_SERVER_ERROR,
  QUERY_SESSION_EXPIRED_ERROR,
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

  it('uses the permission-denied message for 403', () => {
    expect(toUserFacingQueryError('Forbidden', { httpStatus: 403 })).toBe(
      QUERY_PERMISSION_DENIED_ERROR,
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
