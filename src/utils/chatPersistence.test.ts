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

  it('drops in-progress assistant messages', () => {
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
    expect(loaded?.sessions[0].messages).toHaveLength(1)
  })
})
