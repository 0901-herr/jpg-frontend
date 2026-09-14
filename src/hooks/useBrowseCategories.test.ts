import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseDocumentItem } from '../api/types/browse'
import { fetchBrowseCategories, fetchBrowseStatus } from '../api/browse'
import { useBrowseCategories } from './useBrowseCategories'

vi.mock('../api/browse', () => ({
  fetchBrowseCategories: vi.fn(),
  fetchBrowseStatus: vi.fn(),
}))

function doc(id: string): BrowseDocumentItem {
  return {
    document_id: id,
    filename: `${id}.pdf`,
    file_type: 'pdf',
    updated_at: '2026-09-13T00:00:00Z',
    folder_id: 4,
    indexing_status: 'READY',
    rag_document_id: 'rag-1',
    queryable: true,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('useBrowseCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads server categories and refreshes the folder after backfill', async () => {
    vi.mocked(fetchBrowseCategories).mockResolvedValue({
      categories: [{ name: 'Contracts', count: 1 }],
      uncategorized_count: 0,
      accessible_document_ids: ['1'],
    })
    const refreshActiveFolder = vi.fn(async () => {})

    const { result } = renderHook(() =>
      useBrowseCategories([doc('1')], {
        enabled: true,
        activeFolderId: 4,
        refreshActiveFolder,
      }),
    )

    await waitFor(() => expect(result.current.categoriesLoading).toBe(false))

    expect(fetchBrowseCategories).toHaveBeenCalledWith(['1'], expect.any(AbortSignal))
    expect(refreshActiveFolder).toHaveBeenCalled()
    expect(result.current.serverCategories?.categories).toEqual([
      { name: 'Contracts', count: 1 },
    ])
  })

  it('does not fetch when category view is disabled', () => {
    renderHook(() =>
      useBrowseCategories([doc('1')], {
        enabled: false,
        activeFolderId: 4,
        refreshActiveFolder: vi.fn(async () => {}),
      }),
    )

    expect(fetchBrowseCategories).not.toHaveBeenCalled()
  })
})

// Full vi.useFakeTimers() deadlocks here because the hook's mount-time fetch
// is itself promise-driven (no timers involved) and React's effect flush
// under a faked clock never settles inside advanceTimersByTimeAsync. Spying
// on setInterval/clearInterval directly tests the same scheduling behaviour
// (interval length, tick firing a re-fetch, hidden-tab pause) without that
// interaction; useBrowseTree.test.ts covers the fake-timers case.
describe('useBrowseCategories auto-refresh', () => {
  // setInterval is spied at the window level, so unrelated library/jsdom
  // timers (e.g. a RAF polyfill) may also be captured here — match on the
  // poll's own cadence (15_000 / 60_000) rather than "the last call".
  let intervalCalls: Array<{ ms: number; cb: () => void }>
  let refreshActiveFolder: ReturnType<typeof vi.fn>

  function intervalWithMs(ms: number): (() => void) | undefined {
    return [...intervalCalls].reverse().find((call) => call.ms === ms)?.cb
  }

  beforeEach(() => {
    vi.clearAllMocks()
    intervalCalls = []
    // Stable across re-renders — an inline `vi.fn()` in the render callback
    // would change identity every render and re-trigger the mount-fetch effect.
    refreshActiveFolder = vi.fn(async () => {})
    vi.spyOn(window, 'setInterval').mockImplementation(((handler: () => void, ms?: number) => {
      intervalCalls.push({ ms: ms ?? -1, cb: handler })
      return 1 as unknown as ReturnType<typeof setInterval>
    }) as typeof setInterval)
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('schedules the fast cadence while a document has not settled, but a tick makes no request of its own', async () => {
    // useBrowseTree's own fast poll (useBrowseTree.test.ts) already covers
    // /browse/status for these same ids and patches the shared cache
    // folderDocuments comes from — duplicating that call here would double
    // the request volume for the ids both hooks agree on (final-review
    // finding I1). This hook's fast-cadence tick is a no-op: it exists only
    // to keep re-checking, via the effect's own deps, whether every
    // document has settled yet.
    vi.mocked(fetchBrowseCategories).mockResolvedValue({
      categories: [{ name: 'Contracts', count: 1 }],
      uncategorized_count: 0,
      accessible_document_ids: ['1'],
    })
    const indexingDoc: BrowseDocumentItem = { ...doc('1'), indexing_status: 'INDEXING' }

    renderHook(() =>
      useBrowseCategories([indexingDoc], {
        enabled: true,
        activeFolderId: 4,
        refreshActiveFolder,
      }),
    )

    // mount-time fetch always uses the full categories endpoint
    await waitFor(() => expect(fetchBrowseCategories).toHaveBeenCalledTimes(1))
    const tick = intervalWithMs(15_000)
    expect(tick).toBeDefined()

    vi.mocked(fetchBrowseCategories).mockClear()
    act(() => {
      tick?.()
    })
    await Promise.resolve()
    expect(fetchBrowseStatus).not.toHaveBeenCalled()
    expect(fetchBrowseCategories).not.toHaveBeenCalled()
  })

  it('schedules the slower idle cadence once every document has settled, and a tick uses the full categories fetch', async () => {
    vi.mocked(fetchBrowseCategories).mockResolvedValue({
      categories: [],
      uncategorized_count: 0,
      accessible_document_ids: ['1'],
    })

    renderHook(() =>
      useBrowseCategories([doc('1')], {
        enabled: true,
        activeFolderId: 4,
        refreshActiveFolder,
      }),
    )

    await waitFor(() => expect(fetchBrowseCategories).toHaveBeenCalledTimes(1))
    const tick = intervalWithMs(60_000)
    expect(tick).toBeDefined()

    vi.mocked(fetchBrowseCategories).mockClear()
    act(() => {
      tick?.()
    })
    await waitFor(() => expect(fetchBrowseCategories).toHaveBeenCalledTimes(1))
    expect(fetchBrowseStatus).not.toHaveBeenCalled()
  })

  it('does not schedule a poll while category view is disabled', () => {
    renderHook(() =>
      useBrowseCategories([doc('1')], {
        enabled: false,
        activeFolderId: 4,
        refreshActiveFolder,
      }),
    )

    expect(intervalWithMs(15_000)).toBeUndefined()
    expect(intervalWithMs(60_000)).toBeUndefined()
  })

  it('skips an idle-cadence poll tick while the document is hidden', async () => {
    vi.mocked(fetchBrowseCategories).mockResolvedValue({
      categories: [],
      uncategorized_count: 0,
      accessible_document_ids: ['1'],
    })

    renderHook(() =>
      useBrowseCategories([doc('1')], {
        enabled: true,
        activeFolderId: 4,
        refreshActiveFolder,
      }),
    )
    await waitFor(() => expect(fetchBrowseCategories).toHaveBeenCalledTimes(1))
    vi.mocked(fetchBrowseCategories).mockClear()

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => {
      intervalWithMs(60_000)?.()
    })
    await Promise.resolve()
    expect(fetchBrowseCategories).not.toHaveBeenCalled()
  })

  it('skips an idle-cadence poll tick while the previous one is still in flight', async () => {
    vi.mocked(fetchBrowseCategories).mockResolvedValue({
      categories: [],
      uncategorized_count: 0,
      accessible_document_ids: ['1'],
    })

    renderHook(() =>
      useBrowseCategories([doc('1')], {
        enabled: true,
        activeFolderId: 4,
        refreshActiveFolder,
      }),
    )
    await waitFor(() => expect(fetchBrowseCategories).toHaveBeenCalledTimes(1))
    const tick = intervalWithMs(60_000)
    vi.mocked(fetchBrowseCategories).mockClear()

    const slow = deferred<Awaited<ReturnType<typeof fetchBrowseCategories>>>()
    vi.mocked(fetchBrowseCategories).mockReturnValueOnce(slow.promise)

    act(() => {
      tick?.() // starts the slow categories fetch
    })
    await waitFor(() => expect(fetchBrowseCategories).toHaveBeenCalledTimes(1))

    act(() => {
      tick?.() // still in flight — must be skipped
    })
    await Promise.resolve()
    expect(fetchBrowseCategories).toHaveBeenCalledTimes(1)

    slow.resolve({ categories: [], uncategorized_count: 0, accessible_document_ids: ['1'] })
    await act(async () => {
      await Promise.resolve()
    })
  })
})
