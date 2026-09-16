import { describe, expect, it } from 'vitest'
import { buildDocumentQuery } from '../components/admin/DocumentSearch'
import { computeProgressLabel, getPipelineProgress } from '../utils/lifecycle'

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

describe('getPipelineProgress', () => {
  it('marks earlier stages complete for INDEXING', () => {
    const { states } = getPipelineProgress('INDEXING')
    expect(states.slice(0, 5).every((s) => s === 'complete')).toBe(true)
    expect(states[5]).toBe('current')
    expect(states[6]).toBe('pending')
  })

  it('marks all stages complete for READY', () => {
    const { states } = getPipelineProgress('READY')
    expect(states.every((s) => s === 'complete')).toBe(true)
  })

  it('infers failed stage from submitted_at', () => {
    const { states, summary } = getPipelineProgress('FAILED', {
      discovered_at: '2026-01-01T00:00:00Z',
      submitted_at: '2026-01-01T00:01:00Z',
      ready_at: null,
      failed_at: '2026-01-01T00:02:00Z',
    })
    expect(states[5]).toBe('failed')
    expect(states[4]).toBe('complete')
    expect(summary).toContain('Indexing')
  })
})

describe('buildDocumentQuery', () => {
  it('maps search fields to API query', () => {
    const q = buildDocumentQuery(
      { search: '5052', failedOnly: false },
      1,
      50,
    )
    expect(q.docId).toBe('5052')
    expect(q.offset).toBe(0)
    expect(q.limit).toBe(50)
  })
})
