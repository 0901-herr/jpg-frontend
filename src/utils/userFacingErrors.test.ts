import { describe, expect, it } from 'vitest'
import {
  QUERY_ALMOST_DONE_ERROR,
  QUERY_PARTIAL_ANSWER_ERROR,
  toUserFacingQueryError,
} from './userFacingErrors'

describe('toUserFacingQueryError', () => {
  it('uses almost-done message when failure follows assembly stage', () => {
    expect(
      toUserFacingQueryError('RAG Engine unavailable during query', {
        progressLabel: 'Almost done — putting your answer together…',
      }),
    ).toBe(QUERY_ALMOST_DONE_ERROR)
  })

  it('uses partial answer message when tokens started', () => {
    expect(
      toUserFacingQueryError('stream ended', { hadPartialAnswer: true }),
    ).toBe(QUERY_PARTIAL_ANSWER_ERROR)
  })
})
