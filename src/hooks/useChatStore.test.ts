import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySession, useChatStore } from './useChatStore'
import * as chatApi from '../api/chat'
import { ApiError } from '../api/http'
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

  it('does not auto-create an empty own chat when a share link is still pending', async () => {
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({ sessions: [], shared: [] })

    const { result } = renderHook(() =>
      useChatStore(baseParams({ hasPendingShare: true })),
    )

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    // Left empty for the caller's own loadSharedSession call (run once
    // hydrate finishes) to populate instead of a throwaway own chat.
    expect(result.current.sessions).toHaveLength(0)
  })

  it('never drops a shared session loaded concurrently with hydration — hydrate resolves after the share request', async () => {
    // Hydrate's own network round-trip is deliberately left pending —
    // AppLayout only calls `loadSharedSession` once hydration has already
    // finished, but the hook itself makes no such promise to any other
    // caller, so it must tolerate this ordering on its own.
    let resolveList!: (value: { sessions: never[]; shared: never[] }) => void
    vi.mocked(chatApi.listChatSessions).mockImplementation(
      () => new Promise((resolve) => { resolveList = resolve }),
    )
    vi.mocked(chatApi.getSharedChatSession).mockResolvedValue({
      id: 'shared-1',
      title: 'Shared chat',
      project_id: null,
      visibility: 'query',
      share_token: 'tok',
      created_at: '2026-09-16T00:00:00Z',
      updated_at: '2026-09-16T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: ['doc-1'],
      messages: [],
    })

    const { result } = renderHook(() => useChatStore(baseParams({ hasPendingShare: true })))

    // The share request resolves first, while hydrate is still pending.
    let loaded: ChatSession | null = null
    await act(async () => {
      loaded = await result.current.loadSharedSession('tok')
    })
    expect(loaded?.id).toBe('shared-1')
    expect(result.current.sharedSessions.some((s) => s.id === 'shared-1')).toBe(true)

    // Hydrate finishes after — its own (empty) shared list must not wipe
    // out the shared session already loaded.
    await act(async () => {
      resolveList({ sessions: [], shared: [] })
    })
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(result.current.sharedSessions.some((s) => s.id === 'shared-1')).toBe(true)
    expect(result.current.activeChatId).toBe('shared-1')
  })

  it('restores the last active chat (own or shared) from localStorage instead of always defaulting to the first own session', async () => {
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
        {
          id: 's2',
          title: 'Session 2',
          project_id: null,
          visibility: 'private',
          share_token: null,
          created_at: '2026-09-16T00:00:00Z',
          updated_at: '2026-09-16T00:00:00Z',
          message_count: 0,
        },
      ],
      shared: [
        {
          id: 'shared-1',
          title: 'Shared chat',
          owner_username: 'alice',
          visibility: 'query',
          opened_at: '2026-09-16T00:00:00Z',
        },
      ],
    })
    // The viewer's last active chat, per the local mirror, was the SHARED
    // one — not `s1` (which listChatSessions returns first).
    persistChatHistory(
      chatUserId,
      [{ id: 's1', title: 'Session 1', messages: [] }],
      'shared-1',
    )

    const { result } = renderHook(() => useChatStore(baseParams()))

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(result.current.activeChatId).toBe('shared-1')
  })

  it('fetches a restored shared chat’s detail (messages + scope) instead of leaving it as a message-less summary', async () => {
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
      shared: [
        {
          id: 'shared-1',
          title: 'Shared chat',
          owner_username: 'alice',
          visibility: 'query',
          opened_at: '2026-09-16T00:00:00Z',
        },
      ],
    })
    // Last active chat, per the local mirror, was the shared one — its
    // list entry above is a message-less/scope-less summary, same as what
    // `GET /chat/sessions` always returns for `shared`.
    persistChatHistory(chatUserId, [{ id: 's1', title: 'Session 1', messages: [] }], 'shared-1')
    vi.mocked(chatApi.getChatSession).mockResolvedValue({
      id: 'shared-1',
      title: 'Shared chat',
      project_id: null,
      visibility: 'query',
      share_token: null,
      created_at: '2026-09-16T00:00:00Z',
      updated_at: '2026-09-16T00:00:00Z',
      message_count: 1,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: ['doc-9'],
      messages: [
        {
          id: 'm1',
          seq: 1,
          role: 'user',
          content: 'Hi',
          author_username: 'bob',
          created_at: '2026-09-16T00:00:00Z',
        },
      ],
    })

    const { result } = renderHook(() => useChatStore(baseParams()))

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.activeChatId).toBe('shared-1')

    await waitFor(() => expect(chatApi.getChatSession).toHaveBeenCalledWith('shared-1'))
    await waitFor(() => {
      const shared = result.current.sharedSessions.find((s) => s.id === 'shared-1')
      expect(shared?.messages).toHaveLength(1)
      expect(shared?.scopeDocumentIds).toEqual(['doc-9'])
    })
    // Never touched the OWN sessions list — the fetched detail belongs in
    // `sharedSessions`.
    expect(result.current.sessions.find((s) => s.id === 'shared-1')).toBeUndefined()
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
    const sharedDetail = {
      id: 'shared-1',
      title: 'Someone else chat',
      project_id: null,
      visibility: 'query' as const,
      share_token: 'tok-xyz',
      created_at: '2026-09-16T00:00:00Z',
      updated_at: '2026-09-16T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: ['doc-1', 'doc-2'],
      messages: [],
    }
    vi.mocked(chatApi.getSharedChatSession).mockResolvedValue(sharedDetail)
    // Selecting the newly-loaded shared chat re-triggers `ensureMessagesLoaded`
    // (it always refetches a shared chat's own detail on activation, to pick
    // up a host scope change) — key the blanket `hydrated()` mock by id so
    // that refetch doesn't clobber `shared-1` with the owned `s1` fixture.
    vi.mocked(chatApi.getChatSession).mockImplementation((id: string) =>
      Promise.resolve(id === 'shared-1' ? sharedDetail : ({ id, title: id, messages: [] } as never)),
    )

    let loaded: ChatSession | null = null
    await act(async () => {
      loaded = await result.current.loadSharedSession('tok-xyz')
    })

    expect(loaded?.id).toBe('shared-1')
    expect(result.current.sharedSessions.some((s) => s.id === 'shared-1')).toBe(true)
    expect(result.current.activeChatId).toBe('shared-1')
    // Surfaced from the detail DTO's own scope_document_ids — the query
    // scope a shared queryable chat falls back to when the viewer hasn't
    // manually selected any documents.
    expect(
      result.current.sharedSessions.find((s) => s.id === 'shared-1')?.scopeDocumentIds,
    ).toEqual(['doc-1', 'doc-2'])
  })

  it('rolls back the optimistic project move if the PATCH fails, and shows an error', async () => {
    const result = await hydrated()
    vi.mocked(chatApi.patchChatSession).mockRejectedValueOnce(new Error('network error'))

    act(() => result.current.moveChat('s1', 'proj-1'))

    // Optimistic update applied immediately.
    expect(result.current.sessions.find((s) => s.id === 's1')?.projectId).toBe('proj-1')

    // Rolled back to its previous value once the PATCH rejects.
    await waitFor(() => {
      expect(result.current.sessions.find((s) => s.id === 's1')?.projectId).toBeNull()
    })
  })

  it('deletes a project by cascading: deletes every chat in it via the existing single-chat-delete call, then deletes the project itself', async () => {
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({
      sessions: [
        {
          id: 's1',
          title: 'Session 1',
          project_id: 'proj-1',
          visibility: 'private',
          share_token: null,
          created_at: '2026-09-16T00:00:00Z',
          updated_at: '2026-09-16T00:00:00Z',
          message_count: 0,
        },
        {
          id: 's2',
          title: 'Session 2',
          project_id: 'proj-1',
          visibility: 'private',
          share_token: null,
          created_at: '2026-09-16T00:00:00Z',
          updated_at: '2026-09-16T00:00:00Z',
          message_count: 0,
        },
        {
          id: 's3',
          title: 'Session 3',
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
    vi.mocked(chatApi.deleteChatSession).mockResolvedValue(undefined)
    vi.mocked(chatApi.deleteChatProject).mockResolvedValue(undefined)
    // The active chat (s1, then s3 once the cascade reselects it, mirroring
    // `deleteChat`'s own reselection) each trigger `ensureMessagesLoaded` ->
    // `getChatSession(id)` in the background. Mocked per-id (matching
    // `hydratedWithShared`'s convention elsewhere in this file) rather than
    // a single static `mockResolvedValue` — a static fixture would answer
    // every id with the same payload, stamping session s3 with s1's id once
    // it becomes active.
    vi.mocked(chatApi.getChatSession).mockImplementation((requestedId: string) =>
      Promise.resolve({
        id: requestedId,
        title: `Session ${requestedId}`,
        project_id: requestedId === 's3' ? null : 'proj-1',
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
      }),
    )

    const { result } = renderHook(() => useChatStore(baseParams()))
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    await act(async () => {
      await result.current.deleteProject('proj-1')
    })
    expect(chatApi.deleteChatSession).toHaveBeenCalledTimes(2)
    expect(chatApi.deleteChatSession).toHaveBeenCalledWith('s1')
    expect(chatApi.deleteChatSession).toHaveBeenCalledWith('s2')
    expect(chatApi.deleteChatProject).toHaveBeenCalledWith('proj-1')
    // The chats that were in the deleted project are gone from the visible
    // list entirely (cascade), not merely orphaned to projectId: null.
    expect(result.current.sessions.some((s) => s.id === 's1' || s.id === 's2')).toBe(false)
    expect(result.current.sessions.some((s) => s.id === 's3')).toBe(true)
    // 's1' was the active chat (first own session, hydration's default) and
    // got deleted along with the rest of the project — must not leave
    // activeChatId pointing at a chat that's gone, same reselection
    // `deleteChat` already does for a single delete.
    expect(result.current.activeChatId).toBe('s3')
  })
})

describe('shared chat scope + refresh', () => {
  async function hydratedWithShared() {
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
      shared: [
        {
          id: 'shared-1',
          title: 'Shared chat',
          owner_username: 'alice',
          visibility: 'query',
          opened_at: '2026-09-16T00:00:00Z',
        },
      ],
    })
    vi.mocked(chatApi.getChatSession).mockImplementation((id: string) =>
      Promise.resolve(
        id === 'shared-1'
          ? {
              id: 'shared-1',
              title: 'Shared chat',
              project_id: null,
              visibility: 'query',
              share_token: null,
              created_at: '2026-09-16T00:00:00Z',
              updated_at: '2026-09-16T00:00:00Z',
              message_count: 0,
              owner_username: 'alice',
              is_owner: false,
              can_query: true,
              scope_document_ids: ['doc-1'],
              scope_documents: [{ document_id: 'doc-1', filename: 'Contract.pdf' }],
              messages: [],
            }
          : {
              id,
              title: id,
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
            },
      ),
    )
    const { result } = renderHook(() => useChatStore(baseParams()))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    return result
  }

  it('carries scope_documents (id + resolved filename) onto the mapped session', async () => {
    const result = await hydratedWithShared()

    act(() => result.current.setActiveChatId('shared-1'))

    await waitFor(() => {
      const shared = result.current.sharedSessions.find((s) => s.id === 'shared-1')
      expect(shared?.scopeDocuments).toEqual([{ documentId: 'doc-1', filename: 'Contract.pdf' }])
    })
  })

  it("refetches a shared chat's detail every time it becomes active, not just the first time", async () => {
    const result = await hydratedWithShared()

    act(() => result.current.setActiveChatId('shared-1'))
    await waitFor(() =>
      expect(
        vi.mocked(chatApi.getChatSession).mock.calls.filter(([id]) => id === 'shared-1').length,
      ).toBeGreaterThanOrEqual(1),
    )
    const firstCount = vi
      .mocked(chatApi.getChatSession)
      .mock.calls.filter(([id]) => id === 'shared-1').length

    act(() => result.current.setActiveChatId('s1'))
    act(() => result.current.setActiveChatId('shared-1'))

    await waitFor(() => {
      const count = vi
        .mocked(chatApi.getChatSession)
        .mock.calls.filter(([id]) => id === 'shared-1').length
      expect(count).toBeGreaterThan(firstCount)
    })
  })

  it('refreshSharedChat forces an immediate refetch of a shared chat’s detail', async () => {
    const result = await hydratedWithShared()
    act(() => result.current.setActiveChatId('shared-1'))
    await waitFor(() => expect(chatApi.getChatSession).toHaveBeenCalledWith('shared-1'))
    vi.mocked(chatApi.getChatSession).mockClear()

    act(() => result.current.refreshSharedChat('shared-1'))

    await waitFor(() => expect(chatApi.getChatSession).toHaveBeenCalledWith('shared-1'))
  })
})

describe('removeSharedChat', () => {
  async function hydratedWithShared() {
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
      shared: [
        {
          id: 'shared-1',
          title: 'Shared chat',
          owner_username: 'alice',
          visibility: 'query',
          opened_at: '2026-09-16T00:00:00Z',
        },
      ],
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

  it('deletes the shared chat from the recipient’s own list and, if active, selects their most recent own chat', async () => {
    const result = await hydratedWithShared()
    vi.mocked(chatApi.deleteSharedChatSession).mockResolvedValue(undefined)
    act(() => result.current.setActiveChatId('shared-1'))
    expect(result.current.activeChatId).toBe('shared-1')

    act(() => result.current.removeSharedChat('shared-1'))

    expect(result.current.sharedSessions.some((s) => s.id === 'shared-1')).toBe(false)
    expect(result.current.activeChatId).toBe('s1')
    await waitFor(() =>
      expect(chatApi.deleteSharedChatSession).toHaveBeenCalledWith('shared-1'),
    )
  })

  it('treats a 404 from the delete route as success (the chat is already gone either way)', async () => {
    const result = await hydratedWithShared()
    vi.mocked(chatApi.deleteSharedChatSession).mockRejectedValue(new ApiError('Not found', 404))

    act(() => result.current.removeSharedChat('shared-1'))

    expect(result.current.sharedSessions.some((s) => s.id === 'shared-1')).toBe(false)
    await waitFor(() =>
      expect(chatApi.deleteSharedChatSession).toHaveBeenCalledWith('shared-1'),
    )
  })
})

describe('recordAssistantMessage', () => {
  it('returns a promise that resolves only once the persist POST resolves, so a caller can await it', async () => {
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

    let resolvePost: (() => void) | undefined
    vi.mocked(chatApi.postChatMessage).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePost = resolve
        }),
    )

    const { result } = renderHook(() => useChatStore(baseParams()))
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    let settled = false
    let persisted: Promise<void>
    act(() => {
      persisted = result.current.recordAssistantMessage('s1', {
        id: 'm1',
        role: 'assistant',
        content: 'Answer',
      })
      persisted.then(() => {
        settled = true
      })
    })

    // Still pending — the mocked POST hasn't resolved yet.
    await Promise.resolve()
    expect(settled).toBe(false)

    resolvePost?.()
    await waitFor(() => expect(settled).toBe(true))
  })
})
