import { act, renderHook, waitFor } from '@testing-library/react'
import { message } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptySession, useChatStore } from './useChatStore'
import * as chatApi from '../api/chat'
import { ApiError } from '../api/http'
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
  vi.mocked(chatApi.listChatProjects).mockResolvedValue([])
  // Every "there must always be at least one chat" fallback now persists
  // its replacement via `createChatSession` (see useChatStore's
  // `spawnEmptySession`) — give it a default resolved value so a test that
  // doesn't care about that call doesn't hit an unhandled rejection from
  // the auto-mock's default `undefined` return.
  vi.mocked(chatApi.createChatSession).mockResolvedValue({} as never)
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

  it('falls back to a fresh empty session when there is nothing to hydrate, and persists it server-side', async () => {
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({ sessions: [], shared: [] })

    const { result } = renderHook(() => useChatStore(baseParams()))

    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.activeChatId).toBe(result.current.sessions[0].id)
    // Without this, the fallback session is a client-side-only orphan: it
    // never gets a row server-side, so renaming/moving/deleting it 404s
    // forever even though querying inside it still appears to work.
    expect(chatApi.createChatSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: result.current.sessions[0].id }),
    )
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

    // Not `act(() => result.current.moveChat(...))` — `moveChat` now
    // returns a promise (Task 11 follow-up), and an implicit-return arrow
    // would hand that promise back to `act` itself, which then switches
    // to its async overload and defers flushing the optimistic update
    // past this assertion instead of synchronously before it. `void`
    // inside a block body keeps `act`'s callback synchronous (`void`),
    // matching the "assert the optimistic update, before the PATCH
    // settles" intent this test actually has.
    act(() => {
      void result.current.moveChat('s1', 'proj-1')
    })

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
    const errorSpy = vi.spyOn(message, 'error')
    const result = await hydrated()
    vi.mocked(chatApi.patchChatSession).mockRejectedValueOnce(new Error('network error'))

    // See the sibling "moves a chat between projects" test above for why
    // this is a block body, not `act(() => result.current.moveChat(...))`.
    act(() => {
      void result.current.moveChat('s1', 'proj-1')
    })

    // Optimistic update applied immediately.
    expect(result.current.sessions.find((s) => s.id === 's1')?.projectId).toBe('proj-1')

    // Rolled back to its previous value once the PATCH rejects.
    await waitFor(() => {
      expect(result.current.sessions.find((s) => s.id === 's1')?.projectId).toBeNull()
    })
    expect(errorSpy).toHaveBeenCalledWith('Could not move this chat. It has been moved back.')
  })

  it('deletes a project by cascading: the backend deletes every chat in it, one DELETE /chat/projects/{id} call is enough', async () => {
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
    // No per-chat delete loop any more — the backend's own cascade (see
    // jpg-adapter's ChatRepository.delete_project) tombstones s1/s2 as part
    // of this single call.
    expect(chatApi.deleteChatSession).not.toHaveBeenCalled()
    expect(chatApi.deleteChatProject).toHaveBeenCalledTimes(1)
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
    // Reselecting 's3' fires ensureMessagesLoaded's background
    // getChatSession fetch — without this call now resolving fast (no
    // per-chat delete loop ahead of it any more), that fetch settles after
    // this test's own `act` returns; wait for it here so its `setSessions`
    // lands on the still-mounted hook instead of leaking into a later test.
    await waitFor(() => expect(chatApi.getChatSession).toHaveBeenCalledWith('s3'))
  })

  it('rolls back the project and every one of its chats if the cascade DELETE fails', async () => {
    const errorSpy = vi.spyOn(message, 'error')
    vi.mocked(chatApi.listChatProjects).mockResolvedValue([
      { id: 'proj-1', name: 'Research', created_at: '2026-09-16T00:00:00Z', updated_at: '2026-09-16T00:00:00Z' },
    ])
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
    vi.mocked(chatApi.deleteChatProject).mockRejectedValue(new Error('network error'))
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
    expect(result.current.projects).toEqual([{ id: 'proj-1', name: 'Research' }])

    await act(async () => {
      await result.current.deleteProject('proj-1')
    })

    // Nothing actually happened server-side — bring the project and both
    // of its chats back into view (no partial-failure case any more: the
    // backend's cascade is one transaction, so it's all-or-nothing).
    await waitFor(() => {
      expect(result.current.projects).toEqual([{ id: 'proj-1', name: 'Research' }])
    })
    await waitFor(() => {
      expect(result.current.sessions.some((s) => s.id === 's1')).toBe(true)
    })
    expect(result.current.sessions.some((s) => s.id === 's2')).toBe(true)
    expect(result.current.sessions.some((s) => s.id === 's3')).toBe(true)

    expect(errorSpy).toHaveBeenCalledWith('Could not delete this project. Please try again.')
    // Same reason as the sibling success-path test above: the optimistic
    // reselect to 's3' (reverted here, but only after firing) still queues
    // a background getChatSession('s3') fetch — wait for it so it doesn't
    // resolve after this test has already torn down.
    await waitFor(() => expect(chatApi.getChatSession).toHaveBeenCalledWith('s3'))
  })

  it('treats a 404 from the cascade DELETE as success and does not resurrect the project (already gone, e.g. deleted from another device)', async () => {
    const errorSpy = vi.spyOn(message, 'error')
    vi.mocked(chatApi.listChatProjects).mockResolvedValue([
      { id: 'proj-1', name: 'Research', created_at: '2026-09-16T00:00:00Z', updated_at: '2026-09-16T00:00:00Z' },
    ])
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
      ],
      shared: [],
    })
    vi.mocked(chatApi.deleteChatProject).mockRejectedValue(new ApiError('Not found', 404))

    const { result } = renderHook(() => useChatStore(baseParams()))
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    await act(async () => {
      await result.current.deleteProject('proj-1')
    })

    expect(result.current.projects).toEqual([])
    expect(result.current.sessions.some((s) => s.id === 's1')).toBe(false)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('persists the auto-created replacement chat server-side when a cascade delete empties the whole chat list', async () => {
    vi.mocked(chatApi.listChatProjects).mockResolvedValue([
      { id: 'proj-1', name: 'Research', created_at: '2026-09-16T00:00:00Z', updated_at: '2026-09-16T00:00:00Z' },
    ])
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
      ],
      shared: [],
    })
    vi.mocked(chatApi.deleteChatProject).mockResolvedValue(undefined)

    const { result } = renderHook(() => useChatStore(baseParams()))
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    await act(async () => {
      await result.current.deleteProject('proj-1')
    })

    expect(result.current.sessions).toHaveLength(1)
    const replacementId = result.current.sessions[0].id
    expect(replacementId).not.toBe('s1')
    expect(chatApi.createChatSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: replacementId }),
    )
  })

  // Task 11 follow-up: `renameChat`/`deleteChat`/`moveChat` stayed
  // optimistic (the state update below still happens synchronously,
  // before any network round-trip) but now also return the PATCH/DELETE
  // call's own promise — previously fired with `void ... .catch()` and
  // discarded — so a caller like `ChatListItem`/`Sidebar` can await it to
  // show a pending indicator, without changing what happens on success or
  // failure.

  it('returns a promise from renameChat that resolves once the PATCH settles', async () => {
    const result = await hydrated()
    let resolvePatch: () => void
    vi.mocked(chatApi.patchChatSession).mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = () => resolve({} as never)
      }),
    )

    let renamePromise: Promise<void> | undefined
    act(() => {
      renamePromise = result.current.renameChat('s1', 'New title')
    })

    // Optimistic update already applied, before the PATCH has settled.
    expect(result.current.sessions[0].title).toBe('New title')

    let settled = false
    void renamePromise!.then(() => {
      settled = true
    })
    expect(settled).toBe(false)

    await act(async () => {
      resolvePatch!()
      await renamePromise
    })

    expect(settled).toBe(true)
  })

  it('returns a promise from deleteChat that resolves once the DELETE settles', async () => {
    const result = await hydrated()
    let resolveDelete: () => void
    vi.mocked(chatApi.deleteChatSession).mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = () => resolve(undefined)
      }),
    )

    let deletePromise: Promise<void> | undefined
    act(() => {
      deletePromise = result.current.deleteChat('s1')
    })

    // Optimistic removal already applied (a fresh empty chat replaces the
    // only session, same as the existing "never end up with zero
    // sessions" behaviour), before the DELETE has settled.
    expect(result.current.sessions.some((s) => s.id === 's1')).toBe(false)

    let settled = false
    void deletePromise!.then(() => {
      settled = true
    })
    expect(settled).toBe(false)

    await act(async () => {
      resolveDelete!()
      await deletePromise
    })

    expect(settled).toBe(true)
  })

  it('treats a 404 from the delete route as success (the chat is already gone either way, e.g. deleted from another device)', async () => {
    const errorSpy = vi.spyOn(message, 'error')
    const result = await hydrated()
    vi.mocked(chatApi.deleteChatSession).mockRejectedValue(new ApiError('Not found', 404))

    await act(async () => {
      await result.current.deleteChat('s1')
    })

    expect(result.current.sessions.some((s) => s.id === 's1')).toBe(false)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('persists the auto-created replacement chat server-side when deleting the last one, so it can be moved or deleted itself', async () => {
    const result = await hydrated()
    vi.mocked(chatApi.deleteChatSession).mockResolvedValue(undefined)

    await act(async () => {
      await result.current.deleteChat('s1')
    })

    expect(result.current.sessions).toHaveLength(1)
    const replacementId = result.current.sessions[0].id
    expect(replacementId).not.toBe('s1')
    // The regression this guards: a replacement session created only in
    // local state (never POSTed) can still be queried against — querying
    // doesn't require a persisted session, and message persistence
    // swallows its own failures — but renaming/moving/deleting it 404s
    // forever, since the id was never created server-side to begin with.
    expect(chatApi.createChatSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: replacementId }),
    )
  })

  it('returns a promise from moveChat that resolves once the PATCH settles', async () => {
    const result = await hydrated()
    let resolvePatch: () => void
    vi.mocked(chatApi.patchChatSession).mockReturnValue(
      new Promise((resolve) => {
        resolvePatch = () => resolve({} as never)
      }),
    )

    let movePromise: Promise<void> | undefined
    act(() => {
      movePromise = result.current.moveChat('s1', 'proj-1')
    })

    expect(result.current.sessions[0].projectId).toBe('proj-1')

    let settled = false
    void movePromise!.then(() => {
      settled = true
    })
    expect(settled).toBe(false)

    await act(async () => {
      resolvePatch!()
      await movePromise
    })

    expect(settled).toBe(true)
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

describe('ensureSessionCreated', () => {
  async function hydratedEmpty() {
    vi.mocked(chatApi.listChatSessions).mockResolvedValue({ sessions: [], shared: [] })
    const { result } = renderHook(() => useChatStore(baseParams()))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    return result
  }

  it('resolves immediately for a chat id that was never createChat-ed (e.g. an already-hydrated or shared session)', async () => {
    const result = await hydratedEmpty()

    let resolved = false
    await act(async () => {
      await result.current.ensureSessionCreated('some-other-chat-id')
      resolved = true
    })

    expect(resolved).toBe(true)
  })

  it('waits for createChat\'s own POST /chat/sessions to settle before resolving', async () => {
    const result = await hydratedEmpty()

    let resolveCreate: (() => void) | undefined
    vi.mocked(chatApi.createChatSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = () => resolve({} as never)
        }),
    )

    act(() => result.current.createChat())
    const newChatId = result.current.activeChatId

    let resolved = false
    void result.current.ensureSessionCreated(newChatId).then(() => {
      resolved = true
    })

    // Still pending — the mocked session-creation POST hasn't resolved yet.
    await Promise.resolve()
    expect(resolved).toBe(false)

    resolveCreate?.()
    await waitFor(() => expect(resolved).toBe(true))
  })
})

describe('recordUserMessage', () => {
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

  it('retries once on failure, so a session-not-found race does not silently drop the scope', async () => {
    const result = await hydrated()
    vi.mocked(chatApi.postChatMessage)
      .mockRejectedValueOnce(new Error('not found yet'))
      .mockResolvedValueOnce(undefined)

    act(() => {
      result.current.recordUserMessage('s1', { id: 'm1', role: 'user', content: 'hi' }, ['doc-1'])
    })

    await waitFor(() => expect(chatApi.postChatMessage).toHaveBeenCalledTimes(2))
    expect(chatApi.postChatMessage).toHaveBeenNthCalledWith(
      2,
      's1',
      expect.objectContaining({ id: 'm1', scope_document_ids: ['doc-1'] }),
    )
  })

  it('gives up quietly if the retry also fails (unchanged fire-and-forget contract)', async () => {
    const result = await hydrated()
    vi.mocked(chatApi.postChatMessage).mockRejectedValue(new Error('still down'))

    expect(() => {
      act(() => {
        result.current.recordUserMessage('s1', { id: 'm1', role: 'user', content: 'hi' }, [])
      })
    }).not.toThrow()

    await waitFor(() => expect(chatApi.postChatMessage).toHaveBeenCalledTimes(2))
  })
})

describe('messagesLoading', () => {
  it('tracks a chat id while ensureMessagesLoaded has an in-flight fetch, and clears it once settled', async () => {
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

    let resolveDetail: ((detail: unknown) => void) | undefined
    vi.mocked(chatApi.getChatSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve
        }),
    )

    const { result } = renderHook(() => useChatStore(baseParams()))
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    // Hydration selects s1 as the active chat, which triggers
    // ensureMessagesLoaded('s1') in the background.
    await waitFor(() => expect(result.current.messagesLoading.has('s1')).toBe(true))

    resolveDetail?.({
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

    await waitFor(() => expect(result.current.messagesLoading.has('s1')).toBe(false))
  })

  it('does not clear a chat id from messagesLoading until every overlapping in-flight fetch for it has settled (shared-chat re-entry)', async () => {
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

    const pending: Array<{ chatId: string; resolve: (detail: unknown) => void }> = []
    vi.mocked(chatApi.getChatSession).mockImplementation(
      (chatId: string) =>
        new Promise((resolve) => {
          pending.push({ chatId, resolve })
        }),
    )
    const extDetail = {
      id: 'ext-1',
      title: 'Ext',
      project_id: null,
      visibility: 'private' as const,
      share_token: null,
      created_at: '2026-09-16T00:00:00Z',
      updated_at: '2026-09-16T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: [],
      messages: [],
    }

    const { result } = renderHook(() => useChatStore(baseParams()))
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    // Hydration's own ensureMessagesLoaded('s1') call — not what this test
    // is about, resolve it out of the way immediately.
    await waitFor(() => expect(pending.some((p) => p.chatId === 's1')).toBe(true))
    pending
      .find((p) => p.chatId === 's1')
      ?.resolve({ ...extDetail, id: 's1', is_owner: true })

    // 'ext-1' isn't in `sessions` — `ensureMessagesLoaded` treats it as a
    // shared chat, unconditionally re-fetched on every activation (not
    // gated by `loadedMessagesRef`). Select it, then switch away and back
    // before its first fetch settles — a realistic A -> B -> A reselect —
    // starting a second, overlapping fetch for the same id.
    act(() => result.current.setActiveChatId('ext-1'))
    await waitFor(() => expect(pending.filter((p) => p.chatId === 'ext-1')).toHaveLength(1))
    expect(result.current.messagesLoading.has('ext-1')).toBe(true)

    act(() => result.current.setActiveChatId('s1'))
    act(() => result.current.setActiveChatId('ext-1'))
    await waitFor(() => expect(pending.filter((p) => p.chatId === 'ext-1')).toHaveLength(2))

    const extFetches = pending.filter((p) => p.chatId === 'ext-1')

    extFetches[0].resolve(extDetail)
    // Still loading — the second overlapping fetch for the same id hasn't
    // settled yet. A naive unconditional delete-on-settle would clear it
    // here already.
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.messagesLoading.has('ext-1')).toBe(true)

    extFetches[1].resolve(extDetail)
    await waitFor(() => expect(result.current.messagesLoading.has('ext-1')).toBe(false))
  })
})
