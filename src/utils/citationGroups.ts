import type { Source } from '../types'

/** One "Related documents" row: everything cited from a single document,
 * however many chunks/pages of it were actually cited. Grouping happens
 * only at render time — the underlying `Source[]` array (and its `index`/
 * `docRef` fields, which inline citation links key off of) is never
 * reshaped. */
export interface DocumentGroup {
  key: string
  filename: string
  documentId?: string
  url?: string
  /** Sorted ascending by page (entries with no page number last), with one
   * entry per distinct page — several chunks citing the same page collapse
   * into a single chip. */
  pages: Array<{ page?: number; source: Source }>
  /** The first non-empty snippet seen among this document's sources. */
  snippet?: string
}

/** Groups a flat citation list by document (`documentId`, falling back to
 * `filename` when it's absent) — e.g. 8 chunk-level citations across 3
 * documents becomes 3 groups — ordered by each document's first
 * appearance in `sources`. */
export function groupSourcesByDocument(sources: Source[]): DocumentGroup[] {
  const groups = new Map<string, DocumentGroup>()
  const order: string[] = []

  for (const source of sources) {
    const key = source.documentId ?? source.filename
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        filename: source.filename,
        documentId: source.documentId,
        url: source.url,
        pages: [],
        snippet: source.snippet || undefined,
      }
      groups.set(key, group)
      order.push(key)
    } else {
      if (!group.url && source.url) group.url = source.url
      if (!group.snippet && source.snippet) group.snippet = source.snippet
    }

    const hasPage = group.pages.some((entry) => entry.page === source.page)
    if (!hasPage) {
      group.pages.push({ page: source.page, source })
    }
  }

  for (const group of groups.values()) {
    group.pages.sort((a, b) => {
      if (a.page == null && b.page == null) return 0
      if (a.page == null) return 1
      if (b.page == null) return -1
      return a.page - b.page
    })
  }

  return order.map((key) => groups.get(key)!)
}
