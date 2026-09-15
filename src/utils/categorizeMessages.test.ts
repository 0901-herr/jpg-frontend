import { describe, expect, it } from 'vitest'
import type { DocumentCategorizeResponse } from '../api/types/browse'
import { buildCategorizeMessages } from './categorizeMessages'

function response(overrides: Partial<DocumentCategorizeResponse> = {}): DocumentCategorizeResponse {
  return {
    document_id: '5012',
    filename: 'sample.pdf',
    folder_id: 4,
    folder_name: 'Minutes',
    category: 'Approved',
    abstained: false,
    target_folder_id: 9,
    confidence: 0.87,
    reasoning: 'The document is a signed approval record.',
    candidates: [
      { folder_id: 9, name: 'Approved' },
      { folder_id: 10, name: 'Draft' },
    ],
    latency_ms: 1234,
    ...overrides,
  }
}

describe('buildCategorizeMessages', () => {
  it('builds the user request message exactly as \'Categorize "<filename>"\'', () => {
    const { userMessage } = buildCategorizeMessages('sample.pdf', response())

    expect(userMessage.role).toBe('user')
    expect(userMessage.content).toBe('Categorize "sample.pdf"')
  })

  it('builds the suggested-folder answer with confidence, reasoning and a move instruction', () => {
    const { assistantMessage } = buildCategorizeMessages('sample.pdf', response())

    expect(assistantMessage.role).toBe('assistant')
    expect(assistantMessage.status).toBe('complete')
    expect(assistantMessage.content).toContain('**Suggested folder:** Approved')
    expect(assistantMessage.content).toContain('Confidence: 87%')
    expect(assistantMessage.content).toContain('The document is a signed approval record.')
    expect(assistantMessage.content).toContain(
      'Move the file into **Minutes / Approved** in LogicalDOC to file it.',
    )
  })

  it('rounds confidence to the nearest whole percent', () => {
    const { assistantMessage } = buildCategorizeMessages(
      'sample.pdf',
      response({ confidence: 0.624 }),
    )

    expect(assistantMessage.content).toContain('Confidence: 62%')
  })

  it('builds the abstention answer when the model declines to pick a folder', () => {
    const { assistantMessage } = buildCategorizeMessages(
      'sample.pdf',
      response({
        category: null,
        abstained: true,
        target_folder_id: null,
        confidence: 0,
        reasoning: 'No candidate folder matches the document topic.',
      }),
    )

    expect(assistantMessage.content).toContain(
      'This file does not clearly belong to any of the folders in **Minutes** (Approved, Draft).',
    )
    expect(assistantMessage.content).toContain('No candidate folder matches the document topic.')
    expect(assistantMessage.content).toContain('You may leave it where it is or file it by hand.')
    expect(assistantMessage.content).not.toContain('Suggested folder')
    expect(assistantMessage.content).not.toContain('Confidence:')
  })

  it('builds the no-match answer when the model answered but it could not be matched to a candidate', () => {
    const { assistantMessage } = buildCategorizeMessages(
      'sample.pdf',
      response({
        category: null,
        abstained: false,
        target_folder_id: null,
        confidence: 0,
        reasoning: 'Model answered "Signed Approvals" which is not one of the candidates.',
      }),
    )

    expect(assistantMessage.content).toContain(
      "I could not match the model's answer to one of the folders in **Minutes**: Approved, Draft.",
    )
    expect(assistantMessage.content).toContain('Please try again.')
    expect(assistantMessage.content).not.toContain('Suggested folder')
  })
})
