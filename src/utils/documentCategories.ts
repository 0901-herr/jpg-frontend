import type { BrowseDocumentItem } from '../api/types/browse'

export const UNCategorized_LABEL = 'Uncategorized'

export function documentCategoryLabel(doc: BrowseDocumentItem): string {
  const raw = doc.classification_category?.trim()
  return raw || UNCategorized_LABEL
}

export interface CategoryOption {
  name: string
  count: number
}

export function extractCategories(documents: BrowseDocumentItem[]): CategoryOption[] {
  const counts = new Map<string, number>()
  for (const doc of documents) {
    const name = documentCategoryLabel(doc)
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
  return documents.filter((doc) => documentCategoryLabel(doc) === category)
}

/** Categories are derived from the open folder, not the current selection. */
export function resolveCategorySourceDocuments(
  folderDocuments: BrowseDocumentItem[],
): BrowseDocumentItem[] {
  return folderDocuments
}
