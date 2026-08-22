import type { DataNode } from 'antd/es/tree'
import type { DocumentItem } from '../api/types/documents'

function displayDocumentName(doc: DocumentItem): string {
  const raw = doc.title ?? doc.source_file
  return displayFilename(raw)
}

function displayFilename(raw: string): string {
  const stripped = raw.replace(/^[0-9a-f]{8}_(?:\d+_v\d+_)?/i, '')
  return stripped || raw
}

/** Group flat document list into an Ant Design Tree by doc_type. */
export function documentsToTreeData(documents: DocumentItem[]): DataNode[] {
  const byType = new Map<string, DocumentItem[]>()

  for (const doc of documents) {
    const type = doc.doc_type || 'uncategorized'
    const group = byType.get(type) ?? []
    group.push(doc)
    byType.set(type, group)
  }

  return [...byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([docType, items]) => ({
      title: docType,
      key: `type-${docType}`,
      children: items.map((doc) => ({
        title: displayDocumentName(doc),
        key: doc.doc_id,
        isLeaf: true,
      })),
    }))
}
