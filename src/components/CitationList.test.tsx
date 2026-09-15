import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import CitationList, { CitationLink, openSourceInLogicalDoc } from './CitationList'
import { citationDisplayLabel } from '../utils/citations'
import type { Source } from '../types'

vi.mock('../api/browse', () => ({
  fetchDocumentViewUrl: vi.fn(async () => 'https://logicaldoc.example/view'),
  withPageHint: (url: string) => url,
}))

function source(overrides: Partial<Source> & { index: number; filename: string }): Source {
  return {
    documentId: undefined,
    url: undefined,
    page: undefined,
    snippet: undefined,
    reference: undefined,
    docRef: undefined,
    ...overrides,
  }
}

describe('CitationList grouping', () => {
  it('shows the group count, not the raw citation count, in the header', async () => {
    const user = userEvent.setup()
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 2 }),
      source({ index: 2, filename: 'A.pdf', documentId: 'doc-a', page: 5 }),
      source({ index: 3, filename: 'B.pdf', documentId: 'doc-b', page: 1 }),
      source({ index: 4, filename: 'C.pdf', documentId: 'doc-c', page: 4 }),
    ]

    render(<CitationList sources={sources} />)

    expect(screen.getByText('Related documents')).toBeInTheDocument()
    expect(screen.getByText('(3)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    expect(screen.getByText('A.pdf')).toBeInTheDocument()
    expect(screen.getByText('B.pdf')).toBeInTheDocument()
    expect(screen.getByText('C.pdf')).toBeInTheDocument()
  })

  it('renders one page chip per distinct page under the grouped document', async () => {
    const user = userEvent.setup()
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 2 }),
      source({ index: 2, filename: 'A.pdf', documentId: 'doc-a', page: 5 }),
      source({ index: 3, filename: 'A.pdf', documentId: 'doc-a', page: 7 }),
    ]

    render(<CitationList sources={sources} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    expect(screen.getByText('p. 2')).toBeInTheDocument()
    expect(screen.getByText('p. 5')).toBeInTheDocument()
    expect(screen.getByText('p. 7')).toBeInTheDocument()
  })

  it('opens the first page when the filename area is clicked', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 5, url: 'https://logicaldoc.example/a' }),
      source({ index: 2, filename: 'A.pdf', documentId: 'doc-a', page: 2, url: 'https://logicaldoc.example/a' }),
    ]

    render(<CitationList sources={sources} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))
    await user.click(screen.getByRole('button', { name: 'A.pdf' }))

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://logicaldoc.example/a'),
      '_blank',
      'noopener,noreferrer',
    )
    openSpy.mockRestore()
  })

  it('keeps a document with no url/documentId non-clickable', async () => {
    const user = userEvent.setup()
    const sources: Source[] = [source({ index: 1, filename: 'A.pdf', page: 2 })]

    render(<CitationList sources={sources} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    expect(screen.queryByRole('button', { name: 'A.pdf' })).not.toBeInTheDocument()
    expect(screen.getByText('A.pdf')).toBeInTheDocument()
  })

  it('renders nothing when there are no sources', () => {
    const { container } = render(<CitationList sources={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('openSourceInLogicalDoc', () => {
  it('is re-exported unchanged for CitationLink/tests that use it directly', () => {
    expect(typeof openSourceInLogicalDoc).toBe('function')
  })
})

describe('CitationLink pill', () => {
  it('renders the filename without its extension plus a "· p. N" page suffix, with the full name as the title', () => {
    const src: Source = source({
      index: 1,
      filename: 'Meeting_Minutes_July_2026.pdf',
      documentId: 'doc-1',
      page: 2,
    })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} />)

    const pill = screen.getByRole('button')
    expect(pill).toHaveTextContent('Meeting_Minutes_July_2026 · p. 2')
    expect(pill).toHaveAttribute('title', 'Meeting_Minutes_July_2026.pdf')
  })

  it('truncates a long filename to 28 characters with an ellipsis, still keeping the full name in the title', () => {
    const src: Source = source({
      index: 1,
      filename: 'An_Extremely_Long_Document_Filename_That_Should_Be_Truncated.pdf',
      documentId: 'doc-1',
    })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} />)

    const pill = screen.getByRole('button')
    const text = pill.textContent ?? ''
    expect(text.length).toBeLessThanOrEqual(28)
    expect(text.endsWith('…')).toBe(true)
    expect(pill).toHaveAttribute(
      'title',
      'An_Extremely_Long_Document_Filename_That_Should_Be_Truncated.pdf',
    )
  })

  it('omits the page suffix when no page is known', () => {
    const src: Source = source({ index: 1, filename: 'Report.pdf', documentId: 'doc-1' })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} />)

    expect(screen.getByRole('button')).toHaveTextContent('Report')
    expect(screen.queryByText(/p\.\s*\d/)).not.toBeInTheDocument()
  })

  it('keeps the full "(File.pdf, Page N)" text as the accessible name for screen readers', () => {
    const src: Source = source({
      index: 1,
      filename: 'Report.pdf',
      documentId: 'doc-1',
      page: 3,
      reference: 'Page 3',
    })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} />)

    expect(screen.getByRole('button', { name: '(Report.pdf, Page 3)' })).toBeInTheDocument()
  })
})
