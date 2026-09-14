import { describe, expect, it, vi } from 'vitest'
import { citationRefForSegment, joinAnswerSegment, sendMessage } from './query'
import { apiPostStream, ApiError } from './http'
import type { SseEvent } from './http'
import type { Citation } from './types/query'
import { QUERY_PERMISSION_DENIED_ERROR } from '../utils/userFacingErrors'

vi.mock('./http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./http')>()
  return {
    ...actual,
    apiPostStream: vi.fn(async () => ({
      response: {} as Response,
      coverageFromHeaders: {},
    })),
    consumeSseStream: vi.fn(
      async (_response: Response, onEvent: (event: SseEvent) => void) => {
        for (const event of scriptedEvents) onEvent(event)
      },
    ),
  }
})

let scriptedEvents: SseEvent[] = []

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

describe('sendMessage delta handling', () => {
  it('routes delta text to onDelta, never into the final content', async () => {
    scriptedEvents = [
      { event: 'delta', data: { text: 'The sky' } },
      { event: 'delta', data: { text: ' is blue' } },
      { event: 'answer', data: { text: 'The sky is blue.' } },
      { event: 'done', data: { duration_ms: 5 } },
    ]

    const onDelta = vi.fn()
    const onAnswer = vi.fn()

    const result = await sendMessage({
      chatId: 'c1',
      message: 'What color is the sky?',
      documents: ['doc1'],
      callbacks: { onDelta, onAnswer },
    })

    expect(onDelta).toHaveBeenNthCalledWith(1, 'The sky')
    expect(onDelta).toHaveBeenNthCalledWith(2, ' is blue')
    expect(onAnswer).toHaveBeenCalledWith('The sky is blue.')
    expect(result.content).toBe('The sky is blue.')
  })

  it('ignores a delta event with no text field', async () => {
    scriptedEvents = [
      { event: 'delta', data: {} },
      { event: 'answer', data: { text: 'Answer.' } },
      { event: 'done', data: {} },
    ]

    const onDelta = vi.fn()

    await sendMessage({
      chatId: 'c1',
      message: 'q',
      documents: ['doc1'],
      callbacks: { onDelta },
    })

    expect(onDelta).not.toHaveBeenCalled()
  })

  it('includes tier on the query payload when provided', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'Done.' } },
      { event: 'done', data: {} },
    ]

    await sendMessage({
      chatId: 'c1',
      message: 'q',
      documents: ['doc1'],
      tier: 'accurate',
    })

    expect(apiPostStream).toHaveBeenCalledWith(
      '/query',
      {
        question: 'q',
        documents: ['doc1'],
        tier: 'accurate',
      },
      true,
      undefined,
    )
  })

  it('omits tier from the query payload when not provided', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'Done.' } },
      { event: 'done', data: {} },
    ]

    await sendMessage({
      chatId: 'c1',
      message: 'q',
      documents: ['doc1'],
    })

    expect(apiPostStream).toHaveBeenCalledWith(
      '/query',
      {
        question: 'q',
        documents: ['doc1'],
      },
      true,
      undefined,
    )
  })
})

describe('sendMessage error handling', () => {
  it('produces the permission-denied message for a 403 response from the query endpoint', async () => {
    vi.mocked(apiPostStream).mockRejectedValueOnce(new ApiError('Forbidden', 403))

    await expect(
      sendMessage({
        chatId: 'c1',
        message: 'q',
        documents: ['doc1'],
      }),
    ).rejects.toThrow(QUERY_PERMISSION_DENIED_ERROR)
  })
})
