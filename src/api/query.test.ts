import { describe, expect, it, vi } from 'vitest'
import { sendMessage } from './query'
import type { SseEvent } from './http'

vi.mock('./http', () => ({
  apiPostStream: vi.fn(async () => ({
    response: {} as Response,
    coverageFromHeaders: {},
  })),
  consumeSseStream: vi.fn(
    async (_response: Response, onEvent: (event: SseEvent) => void) => {
      for (const event of scriptedEvents) onEvent(event)
    },
  ),
}))

let scriptedEvents: SseEvent[] = []

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
})
