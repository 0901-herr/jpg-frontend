import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import IndexingStatusBadge, {
  describeStatus,
  getDocumentSelectionHint,
  getSelectableDocumentIds,
  getStatusLabel,
  isDocumentSelectable,
  StatusIcon,
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
      'Could not be prepared. Not ready for questions.',
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
    expect(getStatusLabel('PARTIAL')).toBe('Partially ready — ready for questions')
    expect(getStatusLabel('INDEXING')).toBe('Preparing')
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

    await user.hover(screen.getByText('Partially ready — ready for questions'))

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

describe('IndexingStatusBadge compact mode', () => {
  const compactLabels: Record<string, string> = {
    READY: 'Ready',
    PARTIAL: 'Partial',
    INDEXING: 'Preparing',
    FAILED: 'Failed',
    NOT_INDEXED: 'Queued',
  }

  const longLabels: Record<string, string> = {
    READY: 'Ready',
    PARTIAL: 'Partially ready — ready for questions',
    INDEXING: 'Preparing',
    FAILED: 'Failed',
    NOT_INDEXED: 'Queued',
  }

  for (const status of Object.keys(compactLabels)) {
    it(`renders the short compact label for ${status}`, () => {
      const { unmount } = render(createElement(IndexingStatusBadge, { status, compact: true }))

      expect(screen.getByText(compactLabels[status])).toBeInTheDocument()
      if (compactLabels[status] !== longLabels[status]) {
        expect(screen.queryByText(longLabels[status])).not.toBeInTheDocument()
      }

      unmount()
    })

    it(`keeps the default (non-compact) long label for ${status} unchanged`, () => {
      const { unmount } = render(createElement(IndexingStatusBadge, { status }))

      expect(screen.getByText(longLabels[status])).toBeInTheDocument()

      unmount()
    })
  }

  it('shows statusReason as the tooltip in compact mode when present', async () => {
    const user = userEvent.setup()
    render(
      createElement(IndexingStatusBadge, {
        status: 'PARTIAL',
        statusReason: 'Text search only; full vector indexing is still in progress.',
        compact: true,
      }),
    )

    await user.hover(screen.getByText('Partial'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Text search only; full vector indexing is still in progress.',
    )
  })

  it('falls back to the long label as the tooltip in compact mode when statusReason is absent', async () => {
    const user = userEvent.setup()
    render(createElement(IndexingStatusBadge, { status: 'PARTIAL', compact: true }))

    await user.hover(screen.getByText('Partial'))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Partially ready — ready for questions',
    )
  })
})

describe('describeStatus', () => {
  it('is just the label when there is no reason', () => {
    expect(describeStatus('READY')).toBe('Ready')
  })

  it('folds in the reason when it says more than the label', () => {
    expect(describeStatus('FAILED', 'Unsupported file format.')).toBe(
      'Failed — Unsupported file format.',
    )
  })

  it('is not duplicated when the reason is identical to the label', () => {
    expect(describeStatus('READY', 'Ready')).toBe('Ready')
  })

  it('ignores a blank or whitespace-only reason', () => {
    expect(describeStatus('READY', '   ')).toBe('Ready')
  })
})

describe('StatusIcon (compact file-row marker)', () => {
  it('renders the green ready tick with an aria-label, no visible text', () => {
    const { container } = render(createElement(StatusIcon, { status: 'READY' }))

    expect(screen.getByRole('img', { name: 'Ready' })).toBeInTheDocument()
    expect(container).toHaveTextContent('')
  })

  for (const status of ['PARTIAL', 'INDEXING', 'FAILED', 'NOT_INDEXED', 'PENDING'] as const) {
    it(`hides the icon for ${status} — hover on the file row carries the status instead`, () => {
      const { container } = render(createElement(StatusIcon, { status }))

      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(container).toBeEmptyDOMElement()
    })
  }
})
