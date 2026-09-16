import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createChatProject,
  createChatSession,
  deleteChatProject,
  deleteChatSession,
  getChatSession,
  getSharedChatSession,
  listChatProjects,
  listChatSessions,
  patchChatSession,
  postChatMessage,
  renameChatProject,
} from './chat'
import { apiDelete, apiGet, apiPatch, apiPost } from './http'

vi.mock('./http', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('projects', () => {
  it('lists projects from GET /chat/projects', async () => {
    vi.mocked(apiGet).mockResolvedValue({
      projects: [{ id: 'p1', name: 'Alpha', created_at: 't', updated_at: 't' }],
    })

    const result = await listChatProjects()

    expect(apiGet).toHaveBeenCalledWith('/chat/projects')
    expect(result).toEqual([{ id: 'p1', name: 'Alpha', created_at: 't', updated_at: 't' }])
  })

  it('creates a project by name', async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: 'p1', name: 'Alpha' })

    await createChatProject('Alpha')

    expect(apiPost).toHaveBeenCalledWith('/chat/projects', { name: 'Alpha' })
  })

  it('renames a project', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ id: 'p1', name: 'Beta' })

    await renameChatProject('p1', 'Beta')

    expect(apiPatch).toHaveBeenCalledWith('/chat/projects/p1', { name: 'Beta' })
  })

  it('deletes a project', async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)

    await deleteChatProject('p1')

    expect(apiDelete).toHaveBeenCalledWith('/chat/projects/p1')
  })
})

describe('sessions', () => {
  it('lists own and shared sessions', async () => {
    vi.mocked(apiGet).mockResolvedValue({ sessions: [], shared: [] })

    await listChatSessions()

    expect(apiGet).toHaveBeenCalledWith('/chat/sessions')
  })

  it('creates a session, optionally with a client-supplied id (localStorage import)', async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: 'c1' })

    await createChatSession({ id: 'c1', title: 'My chat' })

    expect(apiPost).toHaveBeenCalledWith('/chat/sessions', { id: 'c1', title: 'My chat' })
  })

  it('fetches one session by id', async () => {
    vi.mocked(apiGet).mockResolvedValue({ id: 'c1' })

    await getChatSession('c1')

    expect(apiGet).toHaveBeenCalledWith('/chat/sessions/c1')
  })

  it('patches a session (rename, move, or share)', async () => {
    vi.mocked(apiPatch).mockResolvedValue({ id: 'c1' })

    await patchChatSession('c1', { visibility: 'view' })

    expect(apiPatch).toHaveBeenCalledWith('/chat/sessions/c1', { visibility: 'view' })
  })

  it('deletes a session', async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)

    await deleteChatSession('c1')

    expect(apiDelete).toHaveBeenCalledWith('/chat/sessions/c1')
  })
})

describe('messages', () => {
  it('posts a new (or upserted) message', async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)

    await postChatMessage('c1', { id: 'm1', role: 'user', content: 'hi' })

    expect(apiPost).toHaveBeenCalledWith('/chat/sessions/c1/messages', {
      id: 'm1',
      role: 'user',
      content: 'hi',
    })
  })

})

describe('shared', () => {
  it('fetches a session by its share token', async () => {
    vi.mocked(apiGet).mockResolvedValue({ id: 'c1' })

    await getSharedChatSession('tok123')

    expect(apiGet).toHaveBeenCalledWith('/chat/shared/tok123')
  })
})
