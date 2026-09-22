import { describe, expect, it } from 'vitest'
import type { BrowseDocumentItem, BrowseFolderNode } from '../api/types/browse'
import { getCategorizeDisabledReason } from './categorizeGate'

function doc(overrides: Partial<BrowseDocumentItem> = {}): BrowseDocumentItem {
  return {
    document_id: '5012',
    filename: 'sample.pdf',
    file_type: 'pdf',
    updated_at: '2026-09-13T00:00:00Z',
    folder_id: 4,
    indexing_status: 'READY',
    rag_document_id: 'rag-1',
    queryable: true,
    summary_status: 'READY',
    ...overrides,
  }
}

function folder(overrides: Partial<BrowseFolderNode> = {}): BrowseFolderNode {
  return {
    folder_id: 4,
    name: 'Minutes',
    parent_id: 1,
    has_children: true,
    ...overrides,
  }
}

describe('getCategorizeDisabledReason', () => {
  it('blocks while any response is in flight, before any other check', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 0,
        document: undefined,
        folder: undefined,
        isResponding: true,
        disabled: true,
      }),
    ).toBe('Wait for response to finish')
  })

  it('blocks when signed out', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 1,
        document: doc(),
        folder: folder(),
        isResponding: false,
        disabled: true,
      }),
    ).toBe('Sign in to continue')
  })

  it('blocks when nothing is selected', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 0,
        document: undefined,
        folder: undefined,
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Select one file')
  })

  it('blocks when more than one file is selected', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 2,
        document: doc(),
        folder: folder(),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Select only one file')
  })

  it('blocks when the selected document is not queryable', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 1,
        document: doc({ indexing_status: 'FAILED', queryable: false }),
        folder: folder(),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('File not ready yet')

    expect(
      getCategorizeDisabledReason({
        selectedCount: 1,
        document: doc({ indexing_status: 'NOT_INDEXED', queryable: false }),
        folder: folder(),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('File not ready yet')
  })

  it('blocks an UNSUPPORTED document, like FAILED', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 1,
        document: doc({ indexing_status: 'UNSUPPORTED', queryable: false }),
        folder: folder(),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('File not ready yet')
  })

  it('treats a missing document (selection not resolved yet) as not queryable', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 1,
        document: undefined,
        folder: undefined,
        isResponding: false,
        disabled: false,
      }),
    ).toBe('File not ready yet')
  })

  it('allows a Partial document, not only Ready', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 1,
        document: doc({ indexing_status: 'PARTIAL' }),
        folder: folder(),
        isResponding: false,
        disabled: false,
      }),
    ).toBeNull()
  })

  it('blocks when the folder is loaded and has no subfolders', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 1,
        document: doc(),
        folder: folder({ has_children: false }),
        isResponding: false,
        disabled: false,
      }),
    ).toBe('Already categorized')
  })

  it('stays enabled when the folder node is not loaded — the adapter 409 is the backstop', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 1,
        document: doc(),
        folder: undefined,
        isResponding: false,
        disabled: false,
      }),
    ).toBeNull()
  })

  it('is enabled for a ready, single, non-leaf-folder document', () => {
    expect(
      getCategorizeDisabledReason({
        selectedCount: 1,
        document: doc(),
        folder: folder({ has_children: true }),
        isResponding: false,
        disabled: false,
      }),
    ).toBeNull()
  })
})
