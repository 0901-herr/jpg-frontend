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

  it('persists and reloads a session createdAt timestamp', () => {
    const sessions = [
      { ...sampleSession('s1', 'Session 15 Sep 2026 (1)'), createdAt: '2026-09-15T08:00:00.000Z' },
    ]
    persistChatHistory(USER, sessions, 's1')
    const loaded = loadChatHistory(USER)
    expect(loaded?.sessions[0].createdAt).toBe('2026-09-15T08:00:00.000Z')
  })

  it('keeps createdAt undefined for a session that never had one (pre-existing localStorage payload)', () => {
    const sessions = [sampleSession('s1', 'First chat')]
    persistChatHistory(USER, sessions, 's1')
    const loaded = loadChatHistory(USER)
    expect(loaded?.sessions[0].createdAt).toBeUndefined()
  })

  it('keeps a persisted activeChatId that is not among the given sessions (e.g. a shared chat) instead of forcing it to sessions[0]', () => {
    // `sessions` here mirrors only the viewer's OWN chats — the persisted
    // "last active chat" can legitimately be a shared one that lives in a
    // separate list, not one of these, and must round-trip as-is so the
    // caller (useChatStore's hydration) can check it against both lists.
    const sessions = [sampleSession('own-1', 'My chat')]
    persistChatHistory(USER, sessions, 'shared-99')
    const loaded = loadChatHistory(USER)
    expect(loaded?.activeChatId).toBe('shared-99')
    expect(loaded?.sessions.map((s) => s.id)).toEqual(['own-1'])
  })

  it('persists an abstained message so the "No matching content" caption survives a reload', () => {
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
              content: "I couldn't find relevant content to answer this.",
              status: 'complete',
              abstained: true,
            },
          ],
        },
      ],
      's1',
    )
    const loaded = loadChatHistory(USER)
    expect(loaded?.sessions[0].messages[1].abstained).toBe(true)
  })
})
