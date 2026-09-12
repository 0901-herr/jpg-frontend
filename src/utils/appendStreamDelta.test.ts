import { describe, expect, it } from 'vitest'
import { appendStreamDelta } from './appendStreamDelta'

describe('appendStreamDelta', () => {
  it('returns delta when existing is empty', () => {
    expect(appendStreamDelta('', 'Hello')).toBe('Hello')
  })

  it('preserves explicit leading space on delta', () => {
    expect(appendStreamDelta('Hello', ' world')).toBe('Hello world')
  })

  it('inserts space between word tokens', () => {
    expect(appendStreamDelta('Hello', 'world')).toBe('Hello world')
  })

  it('does not insert space before punctuation', () => {
    expect(appendStreamDelta('Hello', '.')).toBe('Hello.')
  })

  it('does not double-insert when delta already spaced', () => {
    expect(appendStreamDelta('Hello ', 'world')).toBe('Hello world')
  })
})
