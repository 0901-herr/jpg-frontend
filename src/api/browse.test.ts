import { describe, expect, it, vi } from 'vitest'
import { fetchBrowseCategories } from './browse'
import { apiPost } from './http'

vi.mock('./http', () => ({
  apiPost: vi.fn(),
}))

describe('fetchBrowseCategories', () => {
  it('posts document ids to the browse categories endpoint', async () => {
    vi.mocked(apiPost).mockResolvedValue({
      categories: [{ name: 'Contracts', count: 2 }],
      uncategorized_count: 1,
      accessible_document_ids: ['1', '2', '3'],
    })

    const result = await fetchBrowseCategories(['1', '2', '3'])

    expect(apiPost).toHaveBeenCalledWith(
      '/browse/categories',
      { documents: ['1', '2', '3'] },
      true,
      undefined,
    )
    expect(result.categories).toEqual([{ name: 'Contracts', count: 2 }])
    expect(result.uncategorized_count).toBe(1)
  })
})
