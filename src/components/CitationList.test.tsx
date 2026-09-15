import { readFileSync } from 'node:fs'
import path from 'node:path'
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

    expect(screen.getByText('1 · p. 2')).toBeInTheDocument()
    expect(screen.getByText('2 · p. 5')).toBeInTheDocument()
    expect(screen.getByText('3 · p. 7')).toBeInTheDocument()
  })

  it('prefixes each page chip with the same number an inline pill for that citation would show', async () => {
    const user = userEvent.setup()
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 2 }),
      source({ index: 2, filename: 'B.pdf', documentId: 'doc-b', page: 1 }),
      source({ index: 3, filename: 'A.pdf', documentId: 'doc-a', page: 5 }),
    ]

    render(<CitationList sources={sources} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    // First appearance order across the whole sources array: doc-a p2 → 1,
    // doc-b p1 → 2, doc-a p5 → 3 — independent of how they group by document.
    expect(screen.getByText('1 · p. 2')).toBeInTheDocument()
    expect(screen.getByText('2 · p. 1')).toBeInTheDocument()
    expect(screen.getByText('3 · p. 5')).toBeInTheDocument()
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
  it('renders only the citation number as the pill text', () => {
    const src: Source = source({
      index: 1,
      filename: 'Meeting_Minutes_July_2026.pdf',
      documentId: 'doc-1',
      page: 2,
    })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} number={3} />)

    const pill = screen.getByRole('button')
    expect(pill).toHaveTextContent('3')
  })

  it('shows the full filename and page as the tooltip title, regardless of filename length', () => {
    const src: Source = source({
      index: 1,
      filename: 'An_Extremely_Long_Document_Filename_That_Should_Be_Truncated.pdf',
      documentId: 'doc-1',
      page: 5,
    })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} number={1} />)

    const pill = screen.getByRole('button')
    expect(pill).toHaveTextContent('1')
    expect(pill).toHaveAttribute(
      'title',
      'An_Extremely_Long_Document_Filename_That_Should_Be_Truncated.pdf · p. 5',
    )
  })

  it('omits the page suffix from the title when no page is known', () => {
    const src: Source = source({ index: 1, filename: 'Report.pdf', documentId: 'doc-1' })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} number={2} />)

    expect(screen.getByRole('button')).toHaveAttribute('title', 'Report.pdf')
  })

  it('keeps the full "(File.pdf, Page N)" text as the accessible name for screen readers', () => {
    const src: Source = source({
      index: 1,
      filename: 'Report.pdf',
      documentId: 'doc-1',
      page: 3,
      reference: 'Page 3',
    })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} number={1} />)

    expect(screen.getByRole('button', { name: '(Report.pdf, Page 3)' })).toBeInTheDocument()
  })

  it('puts the docu-citation-pill class on the openable button shape', () => {
    const src: Source = source({ index: 1, filename: 'Report.pdf', documentId: 'doc-1' })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} number={1} />)

    expect(screen.getByRole('button')).toHaveClass('docu-citation-pill')
  })

  it('puts the docu-citation-pill class on the non-openable span shape', () => {
    const src: Source = source({ index: 1, filename: 'Report.pdf' })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} number={4} />)

    expect(screen.getByText('4')).toHaveClass('docu-citation-pill')
  })
})

describe('docu-citation-pill CSS contract', () => {
  it('declares font-size, min-width, height, line-height, padding, border-radius, margin, color and background, since antd resets several of these on <button> and jsdom cannot compute the cascade to catch a regression here', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')
    const match = css.match(/\.docu-citation-pill\s*\{([^}]*)\}/)

    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).toMatch(/font-size\s*:/)
    expect(body).toMatch(/min-width\s*:/)
    expect(body).toMatch(/height\s*:/)
    expect(body).toMatch(/line-height\s*:/)
    expect(body).toMatch(/padding\s*:/)
    expect(body).toMatch(/border-radius\s*:/)
    expect(body).toMatch(/margin\s*:/)
    expect(body).toMatch(/color\s*:/)
    expect(body).toMatch(/background\s*:/)
  })

  it('is not nested inside an @layer block, since antd\'s reset.css is unlayered and anything inside @layer (including @layer utilities, where Tailwind puts its own classes) loses to it regardless of specificity', () => {
    // Strip block comments first — the doc comment right above this rule
    // itself contains a balanced `{ ... }` (quoting the reset's `button`
    // rule), which would cancel out in the brace count below and make
    // depth 0 true by coincidence rather than by the rule actually being
    // unlayered.
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    const selectorIndex = css.indexOf('.docu-citation-pill')
    expect(selectorIndex).toBeGreaterThan(-1)

    // Walk the comment-stripped file up to the selector, counting brace
    // depth. A rule written at the top level of the stylesheet (depth 0 at
    // its selector) is unlayered; one written inside `@layer name { ... }`
    // would be at depth 1+ here.
    let depth = 0
    for (let i = 0; i < selectorIndex; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    expect(depth).toBe(0)
  })
})
