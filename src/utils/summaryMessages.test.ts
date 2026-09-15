import { describe, expect, it } from 'vitest'
import { buildSummaryMessages, unwrapSummaryFence } from './summaryMessages'

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

  it('unwraps a fenced summary before it becomes the assistant message content', () => {
    const { assistantMessage } = buildSummaryMessages('```markdown\nHello world\n```')
    expect(assistantMessage.content).toBe('Hello world')
  })
})

describe('unwrapSummaryFence', () => {
  it('strips a fence that wraps the whole document (closing fence is the last line)', () => {
    const summary = '```markdown\n# Title\n\nSome body text.\n```'
    expect(unwrapSummaryFence(summary)).toBe('# Title\n\nSome body text.')
  })

  it('strips a bare (no language tag) fence wrapping the whole document', () => {
    const summary = '```\nJust plain text.\n```'
    expect(unwrapSummaryFence(summary)).toBe('Just plain text.')
  })

  it('strips an "md" language-tagged fence wrapping the whole document', () => {
    const summary = '```md\nShort form tag.\n```'
    expect(unwrapSummaryFence(summary)).toBe('Short form tag.')
  })

  it('strips only the leading fence pair when content follows the closing fence (the live shape: fenced table, then bullets)', () => {
    const summary =
      '```markdown\n| Item | Detail |\n|---|---|\n| A | B |\n```\n\n- First bullet\n- Second bullet'
    expect(unwrapSummaryFence(summary)).toBe(
      '| Item | Detail |\n|---|---|\n| A | B |\n\n- First bullet\n- Second bullet',
    )
  })

  it('leaves text with no leading fence untouched', () => {
    const summary = 'This document covers X, Y, and Z.'
    expect(unwrapSummaryFence(summary)).toBe(summary)
  })

  it('never touches a fence that appears later in the text, not at the very start', () => {
    const summary = 'See the example below:\n\n```markdown\ncode-ish text\n```\n\nMore prose after.'
    expect(unwrapSummaryFence(summary)).toBe(summary)
  })

  it('leaves a non-markdown/md language tag untouched (e.g. a genuine fenced code sample)', () => {
    const summary = '```python\nprint("hi")\n```'
    expect(unwrapSummaryFence(summary)).toBe(summary)
  })

  it('leaves an unterminated leading fence untouched (no matching close found)', () => {
    const summary = '```markdown\nNo closing fence here at all.'
    expect(unwrapSummaryFence(summary)).toBe(summary)
  })

  it('trims incidental surrounding whitespace on the input before checking for a fence', () => {
    const summary = '  \n```markdown\nTrimmed input.\n```\n  '
    expect(unwrapSummaryFence(summary)).toBe('Trimmed input.')
  })
})
