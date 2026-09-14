import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseFolderContentsResponse, BrowseRootResponse } from '../api/types/browse'

const { fetchBrowseRoot, fetchFolderContents } = vi.hoisted(() => ({
  fetchBrowseRoot: vi.fn(),
  fetchFolderContents: vi.fn(),
}))

vi.mock('../api/browse', () => ({
  fetchBrowseRoot,
  fetchFolderContents,
}))

const root: BrowseRootResponse = { root_folder_id: 1, username: 'dev' }

function rootContents(status: 'INDEXING' | 'READY'): BrowseFolderContentsResponse {
  return {
    folder: { folder_id: 1, name: 'Root', parent_id: null, has_children: true },
    folders: [{ folder_id: 2, name: 'Sub', parent_id: 1, has_children: false }],
    documents: [
      {
        document_id: 'doc-1',
        filename: 'a.pdf',
        file_type: 'pdf',
        updated_at: '2026-09-14T00:00:00Z',
        folder_id: 1,
        indexing_status: status,
        rag_document_id: status === 'READY' ? 'rag-1' : null,
        queryable: status === 'READY',
      },
    ],
    page: 0,
    has_more_documents: false,
  }
}

async function initHook() {
  const { useBrowseTree } = await import('./useBrowseTree')
  const { result } = renderHook(() => useBrowseTree())
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(result.current.isInitializing).toBe(false)
  return result
}

describe('useBrowseTree auto-refresh', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    fetchBrowseRoot.mockResolvedValue(root)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls the active folder on the default cadence and merges status without collapsing', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
    const result = await initHook()

    expect(result.current.activeFolderContents?.documents[0].indexing_status).toBe('INDEXING')
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(fetchFolderContents).toHaveBeenCalledTimes(2)
    expect(fetchFolderContents).toHaveBeenLastCalledWith(1, 0)
    expect(result.current.activeFolderContents?.documents[0].indexing_status).toBe('READY')
    expect(result.current.activeFolderContents?.documents[0].queryable).toBe(true)
    // folder tree/active selection preserved — not collapsed
    expect(result.current.activeFolderId).toBe(1)
    expect(result.current.activeFolderContents?.folders).toHaveLength(1)
  })

  it('slows to the 60s idle cadence once every visible document has settled', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    const result = await initHook()
    expect(result.current.activeFolderContents?.documents[0].indexing_status).toBe('READY')

    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    // still settled/all-READY -> should not have polled again at the fast cadence
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000)
    })
    expect(fetchFolderContents).toHaveBeenCalledTimes(2)
  })

  it('pauses polling while the document is hidden and resumes on visibilitychange', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
    await initHook()
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchFolderContents).toHaveBeenCalledTimes(2)
  })

  it('does not poll when VITE_BROWSE_REFRESH_SECONDS is 0', async () => {
    vi.doMock('../config/browse', () => ({
      BROWSE_REFRESH_SECONDS: 0,
      BROWSE_IDLE_REFRESH_SECONDS: 60,
    }))
    fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
    await initHook()
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000)
    })
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)
  })

  it('refreshDocumentStatuses re-fetches the root and every expanded folder on demand', async () => {
    fetchFolderContents.mockImplementation(async (folderId: number) => ({
      folder: {
        folder_id: folderId,
        name: `Folder ${folderId}`,
        parent_id: folderId === 1 ? null : 1,
        has_children: folderId === 1,
      },
      folders: folderId === 1 ? [{ folder_id: 2, name: 'Sub', parent_id: 1, has_children: false }] : [],
      documents: [
        {
          document_id: `doc-${folderId}`,
          filename: `${folderId}.pdf`,
          file_type: 'pdf',
          updated_at: '2026-09-14T00:00:00Z',
          folder_id: folderId,
          indexing_status: 'INDEXING' as const,
          rag_document_id: null,
          queryable: false,
        },
      ],
      page: 0,
      has_more_documents: false,
    }))
    const result = await initHook()

    await act(async () => {
      await result.current.handleLoadTreeData({ value: 2 } as never)
    })
    expect(fetchFolderContents).toHaveBeenCalledTimes(2) // root (init) + folder 2 (expand)

    await act(async () => {
      await result.current.refreshDocumentStatuses()
    })

    expect(fetchFolderContents).toHaveBeenCalledWith(1, 0)
    expect(fetchFolderContents).toHaveBeenCalledWith(2, 0)
    expect(fetchFolderContents).toHaveBeenCalledTimes(4)
  })
})
