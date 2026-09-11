import { describe, expect, it } from 'vitest'
import { joinAnswerSegment } from './query'

describe('joinAnswerSegment', () => {
  it('inserts a space between two whole-clause segments', () => {
    expect(joinAnswerSegment('Based on the context provided in,', 'there are four types')).toBe(
      'Based on the context provided in, there are four types',
    )
  })

  it('inserts a space after a sentence-ending period', () => {
    expect(joinAnswerSegment('hazardous material incident.', 'mentions these incidents')).toBe(
      'hazardous material incident. mentions these incidents',
    )
  })

  it('does not double a space already present on either side', () => {
    expect(joinAnswerSegment('foo ', 'bar')).toBe('foo bar')
    expect(joinAnswerSegment('foo', ' bar')).toBe('foo bar')
  })

  it('does not insert a space before closing punctuation', () => {
    expect(joinAnswerSegment('the report', '.')).toBe('the report.')
    expect(joinAnswerSegment('the report', ', continued')).toBe('the report, continued')
  })

  it('does not insert a leading space on the first segment', () => {
    expect(joinAnswerSegment('', 'Based on the context')).toBe('Based on the context')
  })
})
