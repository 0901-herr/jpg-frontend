import { describe, expect, it } from 'vitest'
import { formatAuditPollDetail, mergeActivityFeed } from './activityLog'
import { mockDocument } from '../test/adminFixtures'

describe('formatAuditPollDetail', () => {
  it('explains a single-file re-index in plain sentences', () => {
    expect(formatAuditPollDetail(1, 0, 1, 0)).toBe(
      'LogicalDOC reported 1 audit event. 1 file was queued for re-indexing.',
    )
  })

  it('explains when audit activity did not queue re-indexing', () => {
    expect(formatAuditPollDetail(1, 0, 0, 0)).toBe(
      'LogicalDOC reported 1 audit event. No files were queued for re-indexing.',
    )
  })

  it('explains ignored events and deletes', () => {
    expect(formatAuditPollDetail(3, 1, 1, 1)).toBe(
      'LogicalDOC reported 3 audit events. 1 event was ignored (for example an excluded folder or a schedule failure). 1 file was queued for re-indexing. 1 file was removed from the index.',
    )
  })
})

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
        detail: 'events_read=0, skipped=0, queued=0, deletes=0',
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
    expect(entries[0]?.headline).toBe('LogicalDOC change check')
    expect(entries[1]?.headline).toBe('Document could not be indexed')
  })

  it('uses a re-index headline when files were queued', () => {
    const entries = mergeActivityFeed([], [
      {
        id: 'sync',
        at: '2026-09-16T06:00:00Z',
        level: 'success',
        category: 'audit',
        action: 'audit_poll',
        headline: 'LogicalDOC change check queued 1 document(s)',
        detail: 'events_read=1, skipped=0, queued=1, deletes=0',
      },
    ])
    expect(entries[0]?.headline).toBe('1 file queued for re-indexing')
    expect(entries[0]?.detail).toBe(
      'LogicalDOC reported 1 audit event. 1 file was queued for re-indexing.',
    )
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
    expect(entries[0]?.headline).toBe('Folder “Default” is fully indexed')
    expect(entries[0]?.detail).toBe('1 file in this folder is ready to search.')
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
        detail: 'events_read=2, skipped=2, queued=0, deletes=0',
      },
    ])

    expect(entries[0]).toMatchObject({
      headline: 'Sample data is active',
      detail: 'This dashboard is using sample data, so no backend services are required.',
    })
    expect(entries[1]?.detail).toBe(
      'LogicalDOC reported 2 audit events. 2 events were ignored (for example excluded folders or schedule failures). No files were queued for re-indexing.',
    )
  })

  it('still parses legacy audit detail without queued=', () => {
    const entries = mergeActivityFeed([], [
      {
        id: 'audit-legacy',
        at: '2026-09-16T05:00:00Z',
        level: 'info',
        category: 'audit',
        action: 'audit_poll',
        headline: 'Audit poll queued 1 document(s)',
        detail: 'events_read=1, skipped=0',
      },
    ])
    expect(entries[0]?.headline).toBe('1 file queued for re-indexing')
    expect(entries[0]?.detail).toBe(
      'LogicalDOC reported 1 audit event. 1 file was queued for re-indexing.',
    )
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

    const folderEntries = entries.filter((entry) => entry.headline.includes('Folder'))
    expect(folderEntries).toHaveLength(2)
    expect(folderEntries.some((entry) => entry.headline.includes('Reports'))).toBe(true)
    expect(folderEntries.find((entry) => entry.headline.includes('Reports'))?.headline).toBe(
      'Folder “Reports” finished with errors',
    )
    expect(folderEntries.find((entry) => entry.headline.includes('Reports'))?.detail).toBe(
      '1 file in this folder is ready to search. 1 file in this folder failed to index. Reason: timeout.',
    )
    expect(folderEntries.find((entry) => entry.headline.includes('Notes'))?.headline).toBe(
      'Folder “Notes” is fully indexed',
    )
    expect(folderEntries.find((entry) => entry.headline.includes('Notes'))?.detail).toBe(
      '1 file in this folder is ready to search.',
    )
  })
})
