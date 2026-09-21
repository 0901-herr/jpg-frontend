import { describe, expect, it } from 'vitest'
import { buildInitialDocuments } from './adminMockData'

// P1-2 (UI polish pass): `readyDocs()` and `inFlightDocs()` used to both
// mint ids in overlapping ranges (`4900 + i` for readyDocs, hardcoded 4901/
// 4902 for inFlightDocs) — every table keyed on `source_document_id`
// (Documents, Activity) rendered two rows sharing a React key, which React
// warns about and can duplicate/drop either row on re-render.
describe('buildInitialDocuments', () => {
  it('never mints two mock documents with the same source_document_id', () => {
    const docs = buildInitialDocuments()
    const ids = docs.map((d) => d.source_document_id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})
