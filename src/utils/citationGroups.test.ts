import { describe, expect, it } from 'vitest'
import { groupSourcesByDocument } from './citationGroups'
import type { Source } from '../types'

function source(overrides: Partial<Source> & { index: number; filename: string }): Source {
  return {
    documentId: undefined,
    url: undefined,
    page: undefined,
    snippet: undefined,
    reference: undefined,
    docRef: undefined,
    ...overrides,
  }
}

describe('groupSourcesByDocument', () => {
  it('groups 8 chunk-level citations across 3 documents into 3 groups', () => {
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 2 }),
      source({ index: 2, filename: 'B.pdf', documentId: 'doc-b', page: 1 }),
      source({ index: 3, filename: 'A.pdf', documentId: 'doc-a', page: 5 }),
      source({ index: 4, filename: 'C.pdf', documentId: 'doc-c', page: 3 }),
      source({ index: 5, filename: 'A.pdf', documentId: 'doc-a', page: 3 }),
      source({ index: 6, filename: 'B.pdf', documentId: 'doc-b', page: 4 }),
      source({ index: 7, filename: 'A.pdf', documentId: 'doc-a', page: 7 }),
      source({ index: 8, filename: 'C.pdf', documentId: 'doc-c', page: 3 }),
    ]

    const groups = groupSourcesByDocument(sources)

    expect(groups).toHaveLength(3)
    expect(groups.map((g) => g.filename)).toEqual(['A.pdf', 'B.pdf', 'C.pdf'])
  })

  it('sorts pages ascending and de-duplicates repeated page numbers', () => {
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 7 }),
      source({ index: 2, filename: 'A.pdf', documentId: 'doc-a', page: 2 }),
      source({ index: 3, filename: 'A.pdf', documentId: 'doc-a', page: 2 }),
      source({ index: 4, filename: 'A.pdf', documentId: 'doc-a', page: 5 }),
    ]

    const [group] = groupSourcesByDocument(sources)

    expect(group.pages.map((p) => p.page)).toEqual([2, 5, 7])
  })

  it('orders groups by first appearance, not alphabetically', () => {
    const sources: Source[] = [
      source({ index: 1, filename: 'Z.pdf', documentId: 'doc-z', page: 1 }),
      source({ index: 2, filename: 'A.pdf', documentId: 'doc-a', page: 1 }),
    ]

    const groups = groupSourcesByDocument(sources)

    expect(groups.map((g) => g.filename)).toEqual(['Z.pdf', 'A.pdf'])
  })

  it('picks the first non-empty snippet seen for the group', () => {
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 1, snippet: '' }),
      source({ index: 2, filename: 'A.pdf', documentId: 'doc-a', page: 2, snippet: 'First real snippet' }),
      source({ index: 3, filename: 'A.pdf', documentId: 'doc-a', page: 3, snippet: 'Second snippet' }),
    ]

    const [group] = groupSourcesByDocument(sources)

    expect(group.snippet).toBe('First real snippet')
  })

  it('falls back to filename as the group key when documentId is absent', () => {
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', page: 1 }),
      source({ index: 2, filename: 'A.pdf', page: 2 }),
      source({ index: 3, filename: 'B.pdf', page: 1 }),
    ]

    const groups = groupSourcesByDocument(sources)

    expect(groups).toHaveLength(2)
    expect(groups[0].pages).toHaveLength(2)
  })

  it('keeps the first non-empty url seen for the group', () => {
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 1 }),
      source({ index: 2, filename: 'A.pdf', documentId: 'doc-a', page: 2, url: 'https://example.com/a' }),
    ]

    const [group] = groupSourcesByDocument(sources)

    expect(group.url).toBe('https://example.com/a')
  })

  it('returns no groups for an empty source list', () => {
    expect(groupSourcesByDocument([])).toEqual([])
  })
})
