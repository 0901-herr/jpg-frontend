import type { BrowseCategoriesResponse, BrowseDocumentItem } from '../api/types/browse'

export function isUncategorizedDocument(doc: BrowseDocumentItem): boolean {
  const raw = doc.classification_category?.trim()
  return !raw || raw === 'unknown'
}

export function getDocumentCategoryName(doc: BrowseDocumentItem): string | null {
  if (isUncategorizedDocument(doc)) return null
  return doc.classification_category!.trim()
}

export function countUncategorizedDocuments(documents: BrowseDocumentItem[]): number {
  return documents.filter(isUncategorizedDocument).length
}

export interface CategoryOption {
  name: string
  count: number
}

export function extractCategories(documents: BrowseDocumentItem[]): CategoryOption[] {
  const counts = new Map<string, number>()
  for (const doc of documents) {
    const name = getDocumentCategoryName(doc)
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }))
}

export function filterDocumentsByCategory(
  documents: BrowseDocumentItem[],
  category: string,
): BrowseDocumentItem[] {
  return documents.filter((doc) => getDocumentCategoryName(doc) === category)
}

/** Categories are derived from the open folder, not the current selection. */
export function resolveCategorySourceDocuments(
  folderDocuments: BrowseDocumentItem[],
): BrowseDocumentItem[] {
  return folderDocuments
}

export function getUncategorizedNote(categories: BrowseCategoriesResponse | null): string | null {
  if (!categories) return null

  if (typeof categories.note === 'string' && categories.note.trim().length > 0) {
    return categories.note
  }

  const count = categories.uncategorized_count
  if (count <= 0) return null

  return count === 1
    ? '1 file is not shown because it has not been categorised yet.'
    : `${count} files are not shown because they have not been categorised yet.`
}
