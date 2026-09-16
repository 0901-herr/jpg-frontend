import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySession, useChatStore } from './useChatStore'
import * as chatApi from '../api/chat'
import { persistChatHistory } from '../utils/chatPersistence'
import type { ChatSession } from '../types'

vi.mock('../api/chat')

const chatUserId = 'user-1'

function baseParams(overrides: Partial<Parameters<typeof useChatStore>[0]> = {}) {
  return {
    chatUserId,
    authLoading: false,
    enabled: true,
    initialSession: createEmptySession(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.mocked(chatApi.listChatProjects).mockResolvedValue([])
})

describe('hydration', () => {
  it('loads own and shared sessions from the server', async () => {
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({
      sessions: [
        {
          id: 's1',
          title: 'Session 1',
          project_id: null,
          visibility: 'private',
          share_token: null,
          created_at: '2026-09-16T00:00:00Z',
          updated_at: '2026-09-16T00:00:00Z',
          message_count: 2,
        },
      ],
      shared: [
        {
          id: 's2',
          title: 'Shared chat',
          owner_username: 'alice',
          visibility: 'view',
          opened_at: '2026-09-16T00:00:00Z',
        },
      ],
    })

    const { result } = renderHook(() => useChatStore(baseParams()))

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(result.current.sessions.map((s) => s.id)).toEqual(['s1'])
    expect(result.current.sharedSessions).toEqual([
      expect.objectContaining({ id: 's2', ownerUsername: 'alice', isOwner: false, canQuery: false }),
    ])
    expect(result.current.activeChatId).toBe('s1')
  })

  it('imports local history once when the server has no own sessions', async () => {
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({ sessions: [], shared: [] })
    vi.mocked(chatApi.createChatSession).mockResolvedValue({} as never)
    vi.mocked(chatApi.postChatMessage).mockResolvedValue(undefined)

    const localSession: ChatSession = {
      id: 'local-1',
      title: 'Old chat',
      messages: [
        { id: 'm1', role: 'user', content: 'Hello' },
        { id: 'm2', role: 'assistant', content: 'Hi there', status: 'complete' },
      ],
      createdAt: '2026-09-01T00:00:00Z',
    }
    persistChatHistory(chatUserId, [localSession], localSession.id)

    const { result } = renderHook(() => useChatStore(baseParams()))

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(chatApi.createChatSession).toHaveBeenCalledWith({ id: 'local-1', title: 'Old chat' })
    expect(chatApi.postChatMessage).toHaveBeenCalledTimes(2)
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].id).toBe('local-1')
    expect(result.current.sessions[0].isOwner).toBe(true)
  })

  it('keeps the local copy when the import fails, without clearing localStorage', async () => {
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({ sessions: [], shared: [] })
    vi.mocked(chatApi.createChatSession).mockRejectedValue(new Error('offline'))

    const localSession: ChatSession = {
      id: 'local-1',
      title: 'Old chat',
      messages: [],
      createdAt: '2026-09-01T00:00:00Z',
    }
    persistChatHistory(chatUserId, [localSession], localSession.id)

    const { result } = renderHook(() => useChatStore(baseParams()))

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(result.current.sessions[0].id).toBe('local-1')
    expect(localStorage.getItem(`docu_chat_history_${chatUserId}`)).not.toBeNull()
  })

  it('resumes a partially failed import on the next load (gated on localStorage, not on server session count) and stops once cleared', async () => {
    // Models the state right after a previous load's import partially
    // failed: session-1 made it to the server (so listChatSessions no
    // longer returns zero sessions), but localStorage was never cleared
    // because the whole import still threw on session-2. The old gate
    // ("server has zero sessions") would skip retrying here entirely,
    // stranding session-2 forever.
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({
      sessions: [
        {
          id: 'local-1',
          title: 'Old chat 1',
          project_id: null,
          visibility: 'private',
          share_token: null,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
          message_count: 1,
        },
      ],
      shared: [],
    })
    vi.mocked(chatApi.createChatSession).mockResolvedValue({} as never)
    vi.mocked(chatApi.postChatMessage).mockResolvedValue(undefined)

    const localSessions: ChatSession[] = [
      {
        id: 'local-1',
        title: 'Old chat 1',
        messages: [{ id: 'm1', role: 'user', content: 'Hello' }],
        createdAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 'local-2',
        title: 'Old chat 2',
        messages: [{ id: 'm2', role: 'user', content: 'Hi again' }],
        createdAt: '2026-09-01T00:00:00Z',
      },
    ]
    persistChatHistory(chatUserId, localSessions, localSessions[0].id)

    const { result } = renderHook(() => useChatStore(baseParams()))

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    // Re-POSTs BOTH sessions with their client-supplied local ids — the
    // already-existing one included, relying on the adapter's upsert
    // (200 for an existing owned id) rather than skipping it.
    expect(chatApi.createChatSession).toHaveBeenCalledWith({ id: 'local-1', title: 'Old chat 1' })
    expect(chatApi.createChatSession).toHaveBeenCalledWith({ id: 'local-2', title: 'Old chat 2' })

    // Both sessions present, no duplicates.
    expect(result.current.sessions.map((s) => s.id).sort()).toEqual(['local-1', 'local-2'])

    // The import finished this time — localStorage is cleared, so a third
    // load would not retry again.
    expect(localStorage.getItem(`docu_chat_history_${chatUserId}`)).toBeNull()
  })

  it('falls back to a fresh empty session when there is nothing to hydrate', async () => {
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({ sessions: [], shared: [] })

    const { result } = renderHook(() => useChatStore(baseParams()))

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.activeChatId).toBe(result.current.sessions[0].id)
  })

  it('never touches the network when disabled (citation-demo mode)', async () => {
    const initialSession = createEmptySession()
    const { result } = renderHook(() => useChatStore(baseParams({ enabled: false, initialSession })))

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(chatApi.listChatSessions).not.toHaveBeenCalled()
    expect(result.current.sessions).toEqual([initialSession])
  })
})

describe('chat CRUD', () => {
  async function hydrated() {
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({
      sessions: [
        {
          id: 's1',
          title: 'Session 1',
          project_id: null,
          visibility: 'private',
          share_token: null,
          created_at: '2026-09-16T00:00:00Z',
          updated_at: '2026-09-16T00:00:00Z',
          message_count: 0,
        },
      ],
      shared: [],
    })
    vi.mocked(chatApi.getChatSession).mockResolvedValue({
      id: 's1',
      title: 'Session 1',
      project_id: null,
      visibility: 'private',
      share_token: null,
      created_at: '2026-09-16T00:00:00Z',
      updated_at: '2026-09-16T00:00:00Z',
      message_count: 0,
      owner_username: 'tester',
      is_owner: true,
      can_query: true,
      scope_document_ids: [],
      messages: [],
    })
    const { result } = renderHook(() => useChatStore(baseParams()))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    return result
  }

  it('creates a new chat locally and persists it server-side', async () => {
    const result = await hydrated()
    vi.mocked(chatApi.createChatSession).mockResolvedValue({} as never)

    act(() => result.current.createChat())

    expect(result.current.sessions).toHaveLength(2)
    expect(result.current.activeChatId).toBe(result.current.sessions[0].id)
    expect(chatApi.createChatSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.current.sessions[0].id }),
    )
  })

  it('moves a chat between projects', async () => {
    const result = await hydrated()
    vi.mocked(chatApi.patchChatSession).mockResolvedValue({} as never)

    act(() => result.current.moveChat('s1', 'proj-1'))

    expect(result.current.sessions[0].projectId).toBe('proj-1')
    expect(chatApi.patchChatSession).toHaveBeenCalledWith('s1', { project_id: 'proj-1' })
  })

  it('shares a chat and stores the returned token', async () => {
    const result = await hydrated()
    vi.mocked(chatApi.patchChatSession).mockResolvedValue({
      id: 's1',
      title: 'Session 1',
      project_id: null,
      visibility: 'view',
      share_token: 'tok-abc',
      created_at: '2026-09-16T00:00:00Z',
      updated_at: '2026-09-16T00:00:00Z',
      message_count: 0,
    } as never)

    await act(async () => {
      await result.current.shareChat('s1', 'view')
    })

    expect(result.current.sessions[0].visibility).toBe('view')
    expect(result.current.sessions[0].shareToken).toBe('tok-abc')
  })

  it('loads a shared session by token and selects it', async () => {
    const result = await hydrated()
    vi.mocked(chatApi.getSharedChatSession).mockResolvedValue({
      id: 'shared-1',
      title: 'Someone else chat',
      project_id: null,
      visibility: 'query',
      share_token: 'tok-xyz',
      created_at: '2026-09-16T00:00:00Z',
      updated_at: '2026-09-16T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: [],
      messages: [],
    })

    let loaded: ChatSession | null = null
    await act(async () => {
      loaded = await result.current.loadSharedSession('tok-xyz')
    })

    expect(loaded?.id).toBe('shared-1')
    expect(result.current.sharedSessions.some((s) => s.id === 'shared-1')).toBe(true)
    expect(result.current.activeChatId).toBe('shared-1')
  })

  it('deletes a project and clears its id off any chat that had it', async () => {
    const result = await hydrated()
    act(() => result.current.moveChat('s1', 'proj-1'))
    vi.mocked(chatApi.deleteChatProject).mockResolvedValue(undefined)

    act(() => result.current.deleteProject('proj-1'))

    expect(result.current.sessions.find((s) => s.id === 's1')?.projectId).toBeNull()
  })
})
