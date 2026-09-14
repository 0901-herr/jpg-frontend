import { describe, expect, it } from 'vitest'
import { buildSummaryMessages } from './summaryMessages'

describe('buildSummaryMessages', () => {
  it('builds a user request message and a completed assistant answer', () => {
    const { userMessage, assistantMessage } = buildSummaryMessages(
      'This document covers X, Y, and Z.',
    )

    expect(userMessage.role).toBe('user')
    expect(userMessage.content).toBe('Summarize this document')
    expect(assistantMessage.role).toBe('assistant')
    expect(assistantMessage.content).toBe('This document covers X, Y, and Z.')
    expect(assistantMessage.status).toBe('complete')
  })

  it('gives the user message and assistant message distinct ids', () => {
    const { userMessage, assistantMessage } = buildSummaryMessages('Summary text.')
    expect(userMessage.id).not.toBe(assistantMessage.id)
  })
})
