import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import DocumentChecklist from './DocumentChecklist'
import type { BrowseDocumentItem } from '../api/types/browse'

function doc(overrides: Partial<BrowseDocumentItem> = {}): BrowseDocumentItem {
  return {
    document_id: 'doc-1',
    filename: 'contract.pdf',
    file_type: 'pdf',
    updated_at: '2026-09-14T00:00:00Z',
    folder_id: 1,
    indexing_status: 'FAILED',
    rag_document_id: null,
    queryable: false,
    ...overrides,
  }
}

describe('DocumentChecklist status tooltip', () => {
  it('shows exactly one tooltip (the badge one) for a non-queryable FAILED document with a status_reason', async () => {
    const user = userEvent.setup()
    render(
      <DocumentChecklist
        documents={[doc({ status_reason: 'OCR failed after 3 retries.' })]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    await user.hover(screen.getByText('Failed'))

    const tooltips = await screen.findAllByRole('tooltip')
    expect(tooltips).toHaveLength(1)
    expect(tooltips[0]).toHaveTextContent('OCR failed after 3 retries.')
  })

  it('shows exactly one tooltip for a non-queryable NOT_INDEXED document with a status_reason', async () => {
    const user = userEvent.setup()
    render(
      <DocumentChecklist
        documents={[
          doc({
            indexing_status: 'NOT_INDEXED',
            status_reason: 'Waiting for the ingestion queue.',
          }),
        ]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    await user.hover(screen.getByText('Queued'))

    const tooltips = await screen.findAllByRole('tooltip')
    expect(tooltips).toHaveLength(1)
    expect(tooltips[0]).toHaveTextContent('Waiting for the ingestion queue.')
  })

  it('shows the selection-reason tooltip when hovering the row label (checkbox + filename) of a non-selectable document', async () => {
    // UX P1-2: hovering the checkbox/filename — the natural place to ask
    // "why can't I select this" — must explain why, not just the small
    // status badge underneath.
    const user = userEvent.setup()
    render(
      <DocumentChecklist
        documents={[doc({ status_reason: 'OCR failed after 3 retries.' })]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    await user.hover(screen.getByText('contract.pdf'))

    const tooltips = await screen.findAllByRole('tooltip')
    expect(tooltips.some((t) => t.textContent === 'OCR failed after 3 retries.')).toBe(true)
  })

  it('falls back to the local selection warning on the row label when there is no status_reason', async () => {
    const user = userEvent.setup()
    render(
      <DocumentChecklist
        documents={[doc({ indexing_status: 'NOT_INDEXED', status_reason: undefined })]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    await user.hover(screen.getByText('contract.pdf'))

    const tooltips = await screen.findAllByRole('tooltip')
    expect(tooltips.some((t) => t.textContent === 'Not indexed. Not queryable.')).toBe(true)
  })

  it('shows no row-level tooltip when hovering the label of a selectable document', async () => {
    const user = userEvent.setup()
    render(
      <DocumentChecklist
        documents={[
          doc({
            indexing_status: 'READY',
            queryable: true,
            status_reason: 'Ready to query.',
          }),
        ]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    await user.hover(screen.getByText('contract.pdf'))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

describe('DocumentChecklist sidebar row layout', () => {
  it('always renders the filename for a PARTIAL document, even in a narrow sidebar', () => {
    render(
      <DocumentChecklist
        documents={[
          doc({
            filename: 'quarterly-harvest-report.pdf',
            indexing_status: 'PARTIAL',
            queryable: true,
            status_reason: 'Text search only; full vector indexing is still in progress.',
          }),
        ]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    expect(screen.getByText('quarterly-harvest-report.pdf')).toBeInTheDocument()
  })

  it('renders the compact badge label ("Partial"), not the long label, for a PARTIAL document', () => {
    render(
      <DocumentChecklist
        documents={[doc({ indexing_status: 'PARTIAL', queryable: true })]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    expect(screen.getByText('Partial')).toBeInTheDocument()
    expect(screen.queryByText('Partially indexed — searchable')).not.toBeInTheDocument()
  })

  it('puts the category tag and badge in a wrapper that is a sibling of the filename line, not a parent of it', () => {
    const { container } = render(
      <DocumentChecklist
        documents={[
          doc({
            filename: 'contract.pdf',
            indexing_status: 'PARTIAL',
            queryable: true,
            classification_category: 'harvesting_record',
          }),
        ]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    const filenameEl = screen.getByText('contract.pdf')
    const primaryLine = filenameEl.closest('.docu-document-row-primary')
    const metaLine = container.querySelector('.docu-document-row-meta')

    expect(primaryLine).not.toBeNull()
    expect(metaLine).not.toBeNull()
    // The tag/badge wrapper is a sibling of the filename's line, not an
    // ancestor or descendant of it.
    expect(metaLine?.contains(filenameEl)).toBe(false)
    expect(primaryLine?.contains(metaLine)).toBe(false)
    expect(primaryLine?.parentElement).toBe(metaLine?.parentElement)

    expect(metaLine).toContainElement(screen.getByText('Harvesting Record'))
    expect(metaLine).toContainElement(screen.getByText('Partial'))
  })

  it('does not render the selection hint text in the row, even when the document is checked', async () => {
    render(
      <DocumentChecklist
        documents={[
          doc({
            indexing_status: 'PARTIAL',
            queryable: true,
            status_reason: 'Text search only; full vector indexing is still in progress.',
          }),
        ]}
        selectedIds={new Set(['doc-1'])}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    expect(
      screen.queryByText('Text search only; full vector indexing is still in progress.'),
    ).not.toBeInTheDocument()
  })

  it('still renders an Uncategorized tag, quietly, when the category is null', () => {
    render(
      <DocumentChecklist
        documents={[doc({ classification_category: null, indexing_status: 'READY', queryable: true })]}
        selectedIds={new Set()}
        onToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    )

    expect(screen.getByText('Uncategorized')).toBeInTheDocument()
  })
})
