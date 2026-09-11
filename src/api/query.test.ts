import { describe, expect, it } from 'vitest'
import { citationRefForSegment, joinAnswerSegment } from './query'
import type { Citation } from './types/query'

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

describe('citationRefForSegment', () => {
  const citations: Citation[] = [
    { doc_ref: '[Doc1]', chunk_id: 'chunk-a', item_id: 'item-1', page: 9 },
    { doc_ref: '[Doc2]', chunk_id: 'chunk-b', item_id: 'item-1', page: 22 },
  ]

  it('matches by chunk_id', () => {
    expect(citationRefForSegment({ chunk_id: 'chunk-b' }, citations)).toBe('[Doc2]')
  })

  it('falls back to item_id + page when chunk_id is absent', () => {
    expect(citationRefForSegment({ item_id: 'item-1', page: 9 }, citations)).toBe('[Doc1]')
  })

  it('returns null for an uncited segment', () => {
    expect(citationRefForSegment({}, citations)).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(citationRefForSegment({ chunk_id: 'chunk-z' }, citations)).toBeNull()
  })
})
