import { describe, expect, it } from 'vitest'
import { MAX_AUTO_TITLE_CHARS, isDefaultSessionTitle, titleFromQuestion } from './chatTitle'

describe('isDefaultSessionTitle', () => {
  it('matches only the placeholder', () => {
    expect(isDefaultSessionTitle('Session 23 Sep 2026 (1)')).toBe(true)
    expect(isDefaultSessionTitle('Session 3 Sep 2026 (12)')).toBe(true)
    expect(isDefaultSessionTitle('Session notes')).toBe(false)
    expect(isDefaultSessionTitle('Test JY')).toBe(false)
    expect(isDefaultSessionTitle('')).toBe(false)
  })
})

describe('titleFromQuestion', () => {
  it('collapses whitespace', () => {
    expect(titleFromQuestion('  Who wrote\n\tthis journal?  ')).toBe('Who wrote this journal?')
  })

  it('returns null for blank input', () => {
    expect(titleFromQuestion('   ')).toBeNull()
    expect(titleFromQuestion(undefined)).toBeNull()
  })

  it('truncates at a word boundary (same output as the adapter)', () => {
    const q = 'According to the KPJ Medical Journal ' + 'collection of issues '.repeat(10)
    const t = titleFromQuestion(q)!
    expect(t.length).toBeLessThanOrEqual(MAX_AUTO_TITLE_CHARS)
    expect(t).toBe(t.trim())
    expect(q.startsWith(t)).toBe(true)
    // ends on a whole word
    expect(q[t.length]).toBe(' ')
  })

  it('truncates unbroken text', () => {
    expect(titleFromQuestion('x'.repeat(200))).toBe('x'.repeat(MAX_AUTO_TITLE_CHARS))
  })

  it('keeps an exact-length question whole', () => {
    const q = 'a'.repeat(MAX_AUTO_TITLE_CHARS - 2) + ' b'
    expect(titleFromQuestion(q)).toBe(q)
    expect(titleFromQuestion(q + ' tail')).toBe(q)
  })
})
