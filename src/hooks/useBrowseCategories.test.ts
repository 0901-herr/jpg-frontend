import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowseDocumentItem } from '../api/types/browse'
import { fetchBrowseCategories } from '../api/browse'
import { useBrowseCategories } from './useBrowseCategories'

vi.mock('../api/browse', () => ({
  fetchBrowseCategories: vi.fn(),
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
