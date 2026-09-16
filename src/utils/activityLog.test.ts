import { describe, expect, it } from 'vitest'
import { mergeActivityFeed } from './activityLog'

describe('mergeActivityFeed', () => {
  it('assigns stable user-facing activity kinds', () => {
    const entries = mergeActivityFeed([], [
      {
        id: 'sync',
        at: '2026-09-16T06:00:00Z',
        level: 'info',
        category: 'audit',
        action: 'audit_poll',
        headline: 'Audit poll queued 0 document(s)',
      },
      {
        id: 'failed',
        at: '2026-09-16T05:00:00Z',
        level: 'error',
        category: 'pipeline',
        action: 'ingest_failed',
        headline: 'Document failed to ingest',
      },
    ])

    expect(entries.map((entry) => entry.kind)).toEqual(['sync', 'failed'])
    expect(entries[0]?.headline).toBe('LogicalDOC changes checked')
    expect(entries[1]?.headline).toBe('Document could not be indexed')
  })

  it('translates configuration and audit details into plain language', () => {
    const entries = mergeActivityFeed([], [
      {
        id: 'mock',
        at: '2026-09-16T06:00:00Z',
        level: 'info',
        category: 'system',
        action: 'mock_mode',
        headline: 'Mock data mode',
        detail: 'VITE_ADMIN_MOCK=true — no adapter required.',
      },
      {
        id: 'audit',
        at: '2026-09-16T05:00:00Z',
        level: 'info',
        category: 'audit',
        action: 'audit_poll',
        headline: 'Audit poll complete',
        detail: 'events_read=2, skipped=2',
      },
    ])

    expect(entries[0]).toMatchObject({
      headline: 'Sample data is active',
      detail: 'This dashboard is using sample data, so no backend services are required.',
    })
    expect(entries[1]?.detail).toBe('Checked 2 change(s); 2 did not require an update.')
  })
})
