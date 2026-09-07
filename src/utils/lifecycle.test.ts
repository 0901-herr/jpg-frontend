import { describe, expect, it } from 'vitest'
import { computeProgressLabel } from '../utils/lifecycle'

describe('computeProgressLabel', () => {
  it('shows traversal-in-progress label when total unknown', () => {
    const result = computeProgressLabel(310000, null, 342000, false)
    expect(result.label).toContain('currently discovered')
    expect(result.label).toContain('traversal in progress')
  })

  it('shows final total when traversal complete', () => {
    const result = computeProgressLabel(310000, 500000, 500000, true)
    expect(result.label).toBe('310,000 READY out of 500,000 total')
    expect(result.percent).toBe(62)
  })
})

describe('buildDocumentQuery', () => {
  it('maps search fields to API query', async () => {
    const { buildDocumentQuery } = await import('../components/admin/DocumentSearch')
    const q = buildDocumentQuery(
      { search: '5052', searchBy: 'docId', failedOnly: false },
      1,
      50,
    )
    expect(q.docId).toBe('5052')
    expect(q.offset).toBe(0)
    expect(q.limit).toBe(50)
  })
})
