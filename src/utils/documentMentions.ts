import type { DocumentItem } from '../api/types/documents'

/** Strip upload prefixes like `15c0450f_` or `58adf698_277631_v2_`. */
export function displayFilename(raw: string): string {
  const stripped = raw.replace(/^[0-9a-f]{8}_(?:\d+_v\d+_)?/i, '')
  return stripped || raw
}

export function displayDocumentName(doc: DocumentItem): string {
  return displayFilename(doc.title ?? doc.source_file)
}

/** Matches @Outpatient.pdf or @"My File.pdf" */
const MENTION_RE = /@("([^"]+)"|([^\s@]+))/g

export interface ParsedDocumentMention {
  /** Query with @mentions removed. */
  query: string
  documentId?: string
  documentLabel?: string
  unknownMention?: string
  ambiguousMention?: string
}

function nameVariants(doc: DocumentItem): string[] {
  return [
    displayDocumentName(doc).toLowerCase(),
    displayFilename(doc.source_file).toLowerCase(),
    doc.source_file.toLowerCase(),
  ]
}

export function resolveDocumentByName(
  name: string,
  documents: DocumentItem[],
): { doc: DocumentItem } | { ambiguous: true } | null {
  const needle = name.trim().toLowerCase()
  if (!needle) return null

  const exact = documents.filter((doc) => nameVariants(doc).some((v) => v === needle))
  if (exact.length === 1) return { doc: exact[0] }
  if (exact.length > 1) return { ambiguous: true }

  const partial = documents.filter((doc) =>
    nameVariants(doc).some((v) => v.includes(needle) || needle.includes(v)),
  )
  if (partial.length === 1) return { doc: partial[0] }
  if (partial.length > 1) return { ambiguous: true }
  return null
}

export function parseDocumentMentions(
  text: string,
  documents: DocumentItem[],
): ParsedDocumentMention {
  let documentId: string | undefined
  let documentLabel: string | undefined
  let unknownMention: string | undefined
  let ambiguousMention: string | undefined

  const cleaned = text
    .replace(MENTION_RE, (_match, _quoted, quotedInner, bare) => {
      const name = (quotedInner ?? bare).trim()
      const resolved = resolveDocumentByName(name, documents)
      if (!resolved) {
        unknownMention = name
        return _match
      }
      if ('ambiguous' in resolved) {
        ambiguousMention = name
        return _match
      }
      documentId = resolved.doc.doc_id
      documentLabel = displayDocumentName(resolved.doc)
      return ''
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([?!.,;:])/g, '$1')
    .trim()

  return {
    query: cleaned,
    documentId,
    documentLabel,
    unknownMention,
    ambiguousMention,
  }
}

export function filterDocumentsForMention(
  documents: DocumentItem[],
  filter: string,
): DocumentItem[] {
  const needle = filter.trim().toLowerCase()
  if (!needle) return documents.slice(0, 8)
  return documents
    .filter((doc) => nameVariants(doc).some((v) => v.includes(needle)))
    .slice(0, 8)
}
