import { describe, expect, it } from 'vitest'
import { joinAnswerText } from './text'

describe('joinAnswerText', () => {
  it('inserts a space between two sentence segments', () => {
    expect(joinAnswerText('First sentence.', 'Second sentence.')).toBe(
      'First sentence. Second sentence.',
    )
  })

  it('does not double a space that is already there', () => {
    expect(joinAnswerText('First sentence. ', 'Second sentence.')).toBe(
      'First sentence. Second sentence.',
    )
  })

  it('does not insert a space before punctuation', () => {
    expect(joinAnswerText('Hello', '.')).toBe('Hello.')
  })

  it('does not insert a space when the delta already starts with one', () => {
    expect(joinAnswerText('Hello', ' world')).toBe('Hello world')
  })

  it('returns the delta as-is when existing content is empty', () => {
    expect(joinAnswerText('', 'First sentence.')).toBe('First sentence.')
  })
})
