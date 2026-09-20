import { describe, expect, it } from 'vitest'
import { mergeActivityFeed } from './activityLog'
import { mockDocument } from '../test/adminFixtures'

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

  it('capitalizes system headlines after jargon rewrites', () => {
    const entries = mergeActivityFeed([], [
      {
        id: 'bulk',
        at: '2026-09-16T06:00:00Z',
        level: 'success',
        category: 'bulk',
        action: 'bulk_finished',
        headline: 'Bulk crawl completed',
      },
    ])
    expect(entries[0]?.headline).toBe('Document scan completed')
  })

  it('uses LogicalDOC folder names when file_path is only a folder id', () => {
    const entries = mergeActivityFeed([
      mockDocument({
        source_document_id: '1',
        filename: 'a.txt',
        file_path: '4',
        source_folder_id: 4,
        source_folder_name: 'Default',
        lifecycle_status: 'READY',
        ready_at: '2026-09-16T06:00:00Z',
      }),
    ])
    expect(entries[0]?.headline).toBe('Finished ingesting “Default”')
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

  it('summarizes documents by folder instead of one line per file', () => {
    const entries = mergeActivityFeed([
      mockDocument({
        source_document_id: '1',
        filename: 'a.pdf',
        file_path: '/Workspace/Reports/a.pdf',
        source_folder_id: 10,
        lifecycle_status: 'READY',
        ready_at: '2026-09-16T06:00:00Z',
        failed_at: null,
      }),
      mockDocument({
        source_document_id: '2',
        filename: 'b.pdf',
        file_path: '/Workspace/Reports/b.pdf',
        source_folder_id: 10,
        lifecycle_status: 'FAILED',
        ready_at: null,
        failed_at: '2026-09-16T06:01:00Z',
        last_error: 'timeout',
      }),
      mockDocument({
        source_document_id: '3',
        filename: 'c.pdf',
        file_path: '/Workspace/Notes/c.pdf',
        source_folder_id: 11,
        lifecycle_status: 'READY',
        ready_at: '2026-09-16T06:02:00Z',
        failed_at: null,
      }),
    ])

    const folderEntries = entries.filter((entry) => entry.headline.includes('Finished ingesting'))
    expect(folderEntries).toHaveLength(2)
    expect(folderEntries.some((entry) => entry.headline.includes('Reports'))).toBe(true)
    expect(folderEntries.find((entry) => entry.headline.includes('Reports'))?.detail).toBe(
      '1 ready · 1 failed',
    )
    expect(folderEntries.find((entry) => entry.headline.includes('Notes'))?.detail).toBe('1 ready')
  })
})
