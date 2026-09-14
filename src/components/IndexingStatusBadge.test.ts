import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import IndexingStatusBadge, {
  getDocumentSelectionHint,
  getSelectableDocumentIds,
  getStatusLabel,
  isDocumentSelectable,
} from './IndexingStatusBadge'
import type { BrowseDocumentItem } from '../api/types/browse'

function doc(
  document_id: string,
  indexing_status: BrowseDocumentItem['indexing_status'],
  queryable: boolean,
): BrowseDocumentItem {
  return {
    document_id,
    filename: `${document_id}.pdf`,
    file_type: 'pdf',
    updated_at: '2026-09-13T00:00:00Z',
    folder_id: 4,
    indexing_status,
    rag_document_id: null,
    queryable,
  }
}

describe('getDocumentSelectionHint', () => {
  it('prefers adapter status_reason over local fallback copy', () => {
    expect(
      getDocumentSelectionHint({
        ...doc('1', 'PARTIAL', true),
        status_reason: 'Text search only; full vector indexing is still in progress.',
      }),
    ).toBe('Text search only; full vector indexing is still in progress.')
  })

  it('falls back to indexing-status copy when status_reason is absent', () => {
    expect(getDocumentSelectionHint(doc('1', 'FAILED', false))).toBe(
      'Indexing failed. Not queryable.',
    )
  })
})

describe('IndexingStatusBadge selection rules', () => {
  it('allows PARTIAL documents when queryable', () => {
    expect(isDocumentSelectable('PARTIAL', true)).toBe(true)
    const ids = getSelectableDocumentIds([
      doc('1', 'READY', true),
      doc('2', 'PARTIAL', true),
      doc('3', 'FAILED', false),
    ])
    expect(ids).toEqual(['1', '2'])
  })
})

describe('getStatusLabel', () => {
  it('maps every status to the demo copy', () => {
    expect(getStatusLabel('READY')).toBe('Ready')
    expect(getStatusLabel('PARTIAL')).toBe('Partially indexed — searchable')
    expect(getStatusLabel('INDEXING')).toBe('Indexing…')
    expect(getStatusLabel('NOT_INDEXED')).toBe('Queued')
    expect(getStatusLabel('FAILED')).toBe('Failed')
  })

  it('treats an unrecognised status (e.g. adapter PENDING) as Queued', () => {
    expect(getStatusLabel('PENDING')).toBe('Queued')
  })
})

describe('IndexingStatusBadge tooltip', () => {
  it('shows status_reason as a tooltip on hover when present', async () => {
    const user = userEvent.setup()
    render(
      createElement(IndexingStatusBadge, {
        status: 'PARTIAL',
        statusReason: 'Text search only; full vector indexing is still in progress.',
      }),
    )

    await user.hover(screen.getByText('Partially indexed — searchable'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Text search only; full vector indexing is still in progress.',
    )
  })

  it('shows no tooltip when status_reason is absent', async () => {
    const user = userEvent.setup()
    render(createElement(IndexingStatusBadge, { status: 'READY' }))

    await user.hover(screen.getByText('Ready'))

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})
