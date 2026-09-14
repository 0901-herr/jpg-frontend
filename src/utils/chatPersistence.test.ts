import { describe, expect, it, beforeEach } from 'vitest'
import type { ChatSession } from '../types'
import { loadChatHistory, persistChatHistory } from './chatPersistence'

const USER = 'user-test-1'

function sampleSession(id: string, title: string): ChatSession {
  return {
    id,
    title,
    messages: [
      { id: `${id}-u`, role: 'user', content: 'Hello', status: 'complete' },
      {
        id: `${id}-a`,
        role: 'assistant',
        content: 'Hi there',
        status: 'complete',
      },
    ],
  }
}

describe('chatPersistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists and reloads sessions for a user', () => {
    const sessions = [sampleSession('s1', 'First chat')]
    persistChatHistory(USER, sessions, 's1')
    const loaded = loadChatHistory(USER)
    expect(loaded?.sessions).toHaveLength(1)
    expect(loaded?.activeChatId).toBe('s1')
    expect(loaded?.sessions[0].messages).toHaveLength(2)
  })

  it('keeps a mid-stream assistant message marked interrupted, with nothing arrived yet', () => {
    persistChatHistory(
      USER,
      [
        {
          id: 's1',
          title: 'Draft',
          messages: [
            { id: 'u1', role: 'user', content: 'Q', status: 'complete' },
            { id: 'a1', role: 'assistant', content: '', status: 'thinking', liveText: 'partial' },
          ],
        },
      ],
      's1',
    )
    const loaded = loadChatHistory(USER)
    expect(loaded?.sessions[0].messages).toHaveLength(2)
    const [question, answer] = loaded!.sessions[0].messages
    expect(question.content).toBe('Q')
    expect(answer.status).toBe('complete')
    expect(answer.interrupted).toBe(true)
    expect(answer.content).toBe('')
  })

  it('keeps whatever partial text had already streamed in, still marked interrupted', () => {
    persistChatHistory(
      USER,
      [
        {
          id: 's1',
          title: 'Draft',
          messages: [
            { id: 'u1', role: 'user', content: 'Q', status: 'complete' },
            {
              id: 'a1',
              role: 'assistant',
              content: 'Here is the partial answer so far',
              status: 'streaming',
            },
          ],
        },
      ],
      's1',
    )
    const loaded = loadChatHistory(USER)
    const answer = loaded!.sessions[0].messages[1]
    expect(answer.content).toBe('Here is the partial answer so far')
    expect(answer.interrupted).toBe(true)
    expect(answer.status).toBe('complete')
  })

  it('does not mark a normally completed message as interrupted', () => {
    const sessions = [sampleSession('s1', 'First chat')]
    persistChatHistory(USER, sessions, 's1')
    const loaded = loadChatHistory(USER)
    expect(loaded?.sessions[0].messages.every((m) => !m.interrupted)).toBe(true)
  })
})
