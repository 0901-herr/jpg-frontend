import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseFolderContentsResponse, BrowseRootResponse } from '../api/types/browse'

const { fetchBrowseRoot, fetchFolderContents, fetchBrowseStatus } = vi.hoisted(() => ({
  fetchBrowseRoot: vi.fn(),
  fetchFolderContents: vi.fn(),
  fetchBrowseStatus: vi.fn(),
}))

vi.mock('../api/browse', () => ({
  fetchBrowseRoot,
  fetchFolderContents,
  fetchBrowseStatus,
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

/** The cheap /browse/status shape used by the fast-cadence poll. */
function statusResponse(status: 'INDEXING' | 'READY', documentId = 'doc-1') {
  return {
    documents: [
      {
        document_id: documentId,
        indexing_status: status,
        status_reason: null,
        queryable: status === 'READY',
        summary_status: null,
        classification_category: null,
        rag_document_id: status === 'READY' ? 'rag-1' : null,
      },
    ],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** `vi.resetModules()` (in `beforeEach`) means `useBrowseTree.ts`'s own
 * `../api/http` import resolves to a fresh module instance each test —
 * `ApiError` must be fetched the same way so `instanceof` checks inside
 * the hook actually match the errors these tests throw. */
async function importApiError() {
  const { ApiError } = await import('../api/http')
  return ApiError
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
    // vi.doMock registrations outlive vi.resetModules() — unregister
    // explicitly so the "VITE_BROWSE_REFRESH_SECONDS is 0" test's override
    // doesn't leak into later tests in this file.
    vi.doUnmock('../config/browse')
  })

  it('fast cadence calls the cheap status endpoint (not a full folder fetch) while unsettled, and merges the result', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
    const result = await initHook()

    expect(result.current.activeFolderContents?.documents[0].indexing_status).toBe('INDEXING')
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    fetchBrowseStatus.mockResolvedValueOnce(statusResponse('READY'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(fetchBrowseStatus).toHaveBeenCalledTimes(1)
    expect(fetchBrowseStatus).toHaveBeenLastCalledWith(['doc-1'])
    // the expensive full-folder fetch must NOT fire at the fast cadence
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    expect(result.current.activeFolderContents?.documents[0].indexing_status).toBe('READY')
    expect(result.current.activeFolderContents?.documents[0].queryable).toBe(true)
    // folder tree/active selection preserved — not collapsed
    expect(result.current.activeFolderId).toBe(1)
    expect(result.current.activeFolderContents?.folders).toHaveLength(1)
  })

  it('idle cadence performs the full folder re-fetch once every document has settled', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    const result = await initHook()
    expect(result.current.activeFolderContents?.documents[0].indexing_status).toBe('READY')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    // settled -> no fast-cadence status poll, no extra full fetch either
    expect(fetchBrowseStatus).not.toHaveBeenCalled()
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000)
    })
    expect(fetchFolderContents).toHaveBeenCalledTimes(2)
    expect(fetchFolderContents).toHaveBeenLastCalledWith(1, 0)
    expect(fetchBrowseStatus).not.toHaveBeenCalled()
  })

  it('pauses polling while the document is hidden and resumes on visibilitychange', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
    await initHook()
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(fetchBrowseStatus).not.toHaveBeenCalled()

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    fetchBrowseStatus.mockResolvedValueOnce(statusResponse('READY'))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchBrowseStatus).toHaveBeenCalledTimes(1)
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
    expect(fetchBrowseStatus).not.toHaveBeenCalled()
  })

  it('refreshDocumentStatuses re-fetches the root and every expanded folder via the full fetch, on demand', async () => {
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
    expect(fetchBrowseStatus).not.toHaveBeenCalled()
  })

  it('skips a fast-cadence tick while the previous one is still in flight', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
    const result = await initHook()
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    const slow = deferred<ReturnType<typeof statusResponse>>()
    fetchBrowseStatus.mockReturnValueOnce(slow.promise)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000) // tick 1 — starts the slow status fetch
    })
    expect(fetchBrowseStatus).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000) // tick 2 — must be skipped, still in flight
    })
    expect(fetchBrowseStatus).toHaveBeenCalledTimes(1)

    slow.resolve(statusResponse('READY'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.activeFolderContents?.documents[0].indexing_status).toBe('READY')
  })

  it('manual refresh waits for an in-flight auto poll, then still performs its own full fetch', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
    const result = await initHook()
    expect(fetchFolderContents).toHaveBeenCalledTimes(1)

    const slow = deferred<ReturnType<typeof statusResponse>>()
    fetchBrowseStatus.mockReturnValueOnce(slow.promise)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000) // starts the in-flight status poll
    })
    expect(fetchBrowseStatus).toHaveBeenCalledTimes(1)

    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    const manualRefreshPromise = result.current.refreshDocumentStatuses()

    slow.resolve(statusResponse('INDEXING'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await manualRefreshPromise

    // Manual refresh never silently no-ops: it waited for the in-flight
    // status tick to settle, then still ran its own full folder re-fetch
    // exactly once.
    expect(fetchFolderContents).toHaveBeenCalledTimes(2)
    expect(fetchFolderContents).toHaveBeenLastCalledWith(1, 0)
    expect(result.current.activeFolderContents?.documents[0].indexing_status).toBe('READY')
  })

  it('a rejecting fast-cadence poll never becomes an unhandled rejection, and keeps ticking on a non-404 error', async () => {
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason)
    process.on('unhandledRejection', onUnhandledRejection)

    try {
      fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
      await initHook()
      const ApiError = await importApiError()

      fetchBrowseStatus.mockRejectedValueOnce(new ApiError('Network error', 0))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000)
      })
      expect(fetchBrowseStatus).toHaveBeenCalledTimes(1)

      // Polling keeps ticking after a transient (non-404) failure.
      fetchBrowseStatus.mockResolvedValueOnce(statusResponse('READY'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000)
      })
      expect(fetchBrowseStatus).toHaveBeenCalledTimes(2)

      // Let any leftover microtasks (an unhandled rejection included) flush.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(unhandledRejections).toHaveLength(0)
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('stops the fast poll for the rest of the session after a 404 (endpoint disabled), logging once at debug level', async () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    fetchFolderContents.mockResolvedValueOnce(rootContents('INDEXING'))
    await initHook()
    const ApiError = await importApiError()

    fetchBrowseStatus.mockRejectedValue(new ApiError('Not Found', 404))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000) // tick 1 — 404s, disables the fast poll
    })
    expect(fetchBrowseStatus).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000) // tick 2 — must not call the endpoint again
    })
    expect(fetchBrowseStatus).toHaveBeenCalledTimes(1)
    // Logged only once, not on every subsequent tick.
    expect(debugSpy).toHaveBeenCalledTimes(1)

    debugSpy.mockRestore()
  })
})

describe('useBrowseTree init error copy', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('../config/browse')
  })

  it('shows the permission-denied title/body for a 403 on the initial root load, never the raw message', async () => {
    const ApiError = await importApiError()
    fetchBrowseRoot.mockRejectedValueOnce(new ApiError('Forbidden: no access to root folder', 403))

    const result = await initHook()

    expect(result.current.sessionExpired).toBe(false)
    expect(result.current.initError).toEqual({
      title: 'You do not have access',
      body: 'Your LogicalDOC session does not allow browsing these folders. Reopen Arche AI from LogicalDOC.',
    })
  })

  it('shows the server-unavailable title/body for a 5xx on the initial root load, never the raw message', async () => {
    const ApiError = await importApiError()
    fetchBrowseRoot.mockRejectedValueOnce(new ApiError('Bad Gateway', 502))

    const result = await initHook()

    expect(result.current.initError).toEqual({
      title: 'Could not load folders',
      body: 'The document service is temporarily unavailable. Try again in a moment.',
    })
  })

  it('shows the server-unavailable copy for an unexpected non-ApiError exception too', async () => {
    fetchBrowseRoot.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const result = await initHook()

    expect(result.current.initError).toEqual({
      title: 'Could not load folders',
      body: 'The document service is temporarily unavailable. Try again in a moment.',
    })
  })

  it('still routes a 401 to the session-expired state, not initError', async () => {
    const ApiError = await importApiError()
    fetchBrowseRoot.mockRejectedValueOnce(new ApiError('Unauthorized', 401))

    const result = await initHook()

    expect(result.current.sessionExpired).toBe(true)
    expect(result.current.initError).toBeNull()
  })
})

describe('useBrowseTree — remembered active folder gone or unreachable at init', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    localStorage.clear()
    fetchBrowseRoot.mockResolvedValue(root)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('../config/browse')
    localStorage.clear()
  })

  it('a 404 on the remembered active folder falls back to root, never sets initError, and forgets the stale persisted id', async () => {
    localStorage.setItem('docu_active_folder', '5054')
    const ApiError = await importApiError()
    fetchFolderContents.mockImplementation(async (folderId: number) => {
      if (folderId === 5054) throw new ApiError('Folder not found', 404)
      return rootContents('READY')
    })

    const result = await initHook()

    expect(result.current.initError).toBeNull()
    expect(result.current.sessionExpired).toBe(false)
    expect(result.current.activeFolderId).toBe(root.root_folder_id)
    expect(localStorage.getItem('docu_active_folder')).toBeNull()
  })

  it('a 500 on the remembered active folder also falls back to root without setting initError', async () => {
    localStorage.setItem('docu_active_folder', '5054')
    const ApiError = await importApiError()
    fetchFolderContents.mockImplementation(async (folderId: number) => {
      if (folderId === 5054) throw new ApiError('Internal Server Error', 500)
      return rootContents('READY')
    })

    const result = await initHook()

    expect(result.current.initError).toBeNull()
    expect(result.current.activeFolderId).toBe(root.root_folder_id)
    expect(localStorage.getItem('docu_active_folder')).toBeNull()
  })

  it('a 401 on the remembered active folder still routes to session-expired, not a root fallback', async () => {
    localStorage.setItem('docu_active_folder', '5054')
    const ApiError = await importApiError()
    fetchFolderContents.mockImplementation(async (folderId: number) => {
      if (folderId === 5054) throw new ApiError('Unauthorized', 401)
      return rootContents('READY')
    })

    const result = await initHook()

    expect(result.current.sessionExpired).toBe(true)
    expect(result.current.initError).toBeNull()
  })
})

describe('useBrowseTree — switching to a folder that no longer exists', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    fetchBrowseRoot.mockResolvedValue(root)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('../config/browse')
  })

  it('stays on the current folder and warns, without throwing, when switching to a folder that 404s', async () => {
    const { message } = await import('antd')
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => '' as never)

    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    const result = await initHook()
    expect(result.current.activeFolderId).toBe(1)

    const ApiError = await importApiError()
    fetchFolderContents.mockRejectedValueOnce(new ApiError('Folder not found', 404))

    await act(async () => {
      await result.current.handleSelectFolder(2)
    })

    expect(result.current.activeFolderId).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('That folder no longer exists.')

    errorSpy.mockRestore()
  })

  it('still propagates a non-404 error when switching folders, without changing the active folder', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    const result = await initHook()
    expect(result.current.activeFolderId).toBe(1)

    const ApiError = await importApiError()
    fetchFolderContents.mockRejectedValueOnce(new ApiError('Bad Gateway', 502))

    await expect(
      act(async () => {
        await result.current.handleSelectFolder(2)
      }),
    ).rejects.toThrow()

    expect(result.current.activeFolderId).toBe(1)
  })
})

describe('useBrowseTree — getFolderNode', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    fetchBrowseRoot.mockResolvedValue(root)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.doUnmock('../config/browse')
  })

  it('resolves both the active folder and a subfolder seen in its listing', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    const result = await initHook()

    expect(result.current.getFolderNode(1)).toEqual({
      folder_id: 1,
      name: 'Root',
      parent_id: null,
      has_children: true,
    })
    expect(result.current.getFolderNode(2)).toEqual({
      folder_id: 2,
      name: 'Sub',
      parent_id: 1,
      has_children: false,
    })
  })

  it('returns undefined for a folder that has not been loaded yet', async () => {
    fetchFolderContents.mockResolvedValueOnce(rootContents('READY'))
    const result = await initHook()

    expect(result.current.getFolderNode(999)).toBeUndefined()
  })
})
