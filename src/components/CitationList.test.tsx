import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
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
    // Every source is "citable" by default — most tests care about
    // grouping/ordering/numbering, not about the cited/uncited split, so a
    // default docRef plus a `content` string built with `contentCiting`
    // keeps those tests short. Tests that specifically want an uncited
    // ("Also searched") entry override `docRef: undefined` or simply omit
    // that source from the `content` they build.
    docRef: `[Doc${overrides.index}]`,
    ...overrides,
  }
}

/** Builds an answer string that cites each given source, in order, as its
 * own short sentence — e.g. for two sources, "Cites [Doc1]. Cites [Doc2]."
 * — so `numberCitationsByAnswerOrder`/`citationContextByAnswerOrder` have
 * real answer text to walk, matching how `ChatMessage` actually calls
 * `CitationList` with `message.content`. */
function contentCiting(...sources: Source[]): string {
  return sources.map((s) => `Cites ${s.docRef}.`).join(' ')
}

describe('CitationList grouping', () => {
  it('shows the cited-group count, not the raw citation count, in the header', async () => {
    const user = userEvent.setup()
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 2 }),
      source({ index: 2, filename: 'A.pdf', documentId: 'doc-a', page: 5 }),
      source({ index: 3, filename: 'B.pdf', documentId: 'doc-b', page: 1 }),
      source({ index: 4, filename: 'C.pdf', documentId: 'doc-c', page: 4 }),
    ]

    render(<CitationList sources={sources} content={contentCiting(...sources)} />)

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

    render(<CitationList sources={sources} content={contentCiting(...sources)} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('page 2')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('page 5')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('page 7')).toBeInTheDocument()
  })

  it('prefixes each page chip with the same number an inline pill for that citation would show', async () => {
    const user = userEvent.setup()
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 2 }),
      source({ index: 2, filename: 'B.pdf', documentId: 'doc-b', page: 1 }),
      source({ index: 3, filename: 'A.pdf', documentId: 'doc-a', page: 5 }),
    ]

    render(<CitationList sources={sources} content={contentCiting(...sources)} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    // First appearance order in the answer text: doc-a p2 → 1, doc-b p1 →
    // 2, doc-a p5 → 3 — independent of how they group by document.
    expect(screen.getByText('page 2')).toBeInTheDocument()
    expect(screen.getByText('page 1')).toBeInTheDocument()
    expect(screen.getByText('page 5')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('opens the first page when the filename area is clicked', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const sources: Source[] = [
      source({ index: 1, filename: 'A.pdf', documentId: 'doc-a', page: 5, url: 'https://logicaldoc.example/a' }),
      source({ index: 2, filename: 'A.pdf', documentId: 'doc-a', page: 2, url: 'https://logicaldoc.example/a' }),
    ]

    render(<CitationList sources={sources} content={contentCiting(...sources)} />)
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
    // A source with neither `url` nor `documentId` can never resolve to an
    // inline `ref` (see `splitAnswerByDocRefs`'s own filter), so it always
    // lands in "Also searched" here regardless of `content` — this test is
    // only about the filename area's clickability, not its cited status.
    const sources: Source[] = [source({ index: 1, filename: 'A.pdf', page: 2 })]

    render(<CitationList sources={sources} content={contentCiting(...sources)} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))
    await user.click(screen.getByRole('button', { name: /Also searched/ }))

    expect(screen.queryByRole('button', { name: 'A.pdf' })).not.toBeInTheDocument()
    expect(screen.getByText('A.pdf')).toBeInTheDocument()
  })

  it('renders nothing when there are no sources', () => {
    const { container } = render(<CitationList sources={[]} content="" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('CitationList — answer-order numbering (Task 2)', () => {
  it('numbers cited groups 1, 2, 3 in answer order (deduped within a repeated bracket group)', async () => {
    const user = userEvent.setup()
    const doc6 = source({ index: 6, filename: 'F6.pdf', documentId: 'doc-6', page: 1 })
    const doc7 = source({ index: 7, filename: 'F7.pdf', documentId: 'doc-7', page: 1 })
    const doc8 = source({ index: 8, filename: 'F8.pdf', documentId: 'doc-8', page: 1 })
    const content = `See the notes [Doc6, Doc7, Doc6, Doc8] for detail.`

    render(<CitationList sources={[doc6, doc7, doc8]} content={content} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getAllByText('page 1')).toHaveLength(3)
  })

  it('puts a source the answer never cites under a collapsed "Also searched" section, separate from the cited count', async () => {
    const user = userEvent.setup()
    const cited = source({ index: 1, filename: 'Cited.pdf', documentId: 'doc-c', page: 1 })
    const uncited = source({ index: 2, filename: 'Uncited.pdf', documentId: 'doc-u', page: 1 })

    render(<CitationList sources={[cited, uncited]} content={contentCiting(cited)} />)

    // Header count reflects only the cited group.
    expect(screen.getByText('(1)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Related documents/ }))
    expect(screen.getByText('Cited.pdf')).toBeVisible()
    expect(screen.getByText('Uncited.pdf').closest('.docu-collapse-panel')).toHaveAttribute(
      'aria-hidden',
      'true',
    )

    const alsoSearchedToggle = screen.getByRole('button', { name: /Also searched \(1\)/ })
    expect(alsoSearchedToggle).toBeInTheDocument()

    await user.click(alsoSearchedToggle)
    expect(screen.getByText('Uncited.pdf').closest('.docu-collapse-panel')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
  })

  it('orders cited groups ascending by first-cited number, ahead of the uncited "Also searched" ones', async () => {
    const user = userEvent.setup()
    const alpha = source({ index: 1, filename: 'Alpha.pdf', documentId: 'doc-alpha', page: 1 })
    const beta = source({ index: 2, filename: 'Beta.pdf', documentId: 'doc-beta', page: 1 })
    // Beta is cited first in the answer text, so it must get number 1 and
    // sort ahead of Alpha even though Alpha appears first in `sources`.
    const content = `Cites ${beta.docRef} first, then ${alpha.docRef}.`

    render(<CitationList sources={[alpha, beta]} content={content} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    const rowFilenames = screen.getAllByText(/\.pdf$/).map((el) => el.textContent)
    expect(rowFilenames).toEqual(['Beta.pdf', 'Alpha.pdf'])
  })

  it('shows "Cited for" with the citing sentence under a cited entry', async () => {
    const user = userEvent.setup()
    const cited = source({ index: 1, filename: 'Report.pdf', documentId: 'doc-r', page: 1 })
    const content = `The budget grew significantly ${cited.docRef}.`

    render(<CitationList sources={[cited]} content={content} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    expect(screen.getByText('Cited for: "The budget grew significantly."')).toBeInTheDocument()
  })

  it('takes "Cited for" from the page holding the group\'s own first-cited number, not whichever page sorts first by page number (fix round 1)', async () => {
    const user = userEvent.setup()
    const pageFive = source({ index: 1, filename: 'Doc.pdf', documentId: 'doc-x', page: 5 })
    const pageTwo = source({ index: 2, filename: 'Doc.pdf', documentId: 'doc-x', page: 2 })
    // Page 5 is cited FIRST in the answer — it earns citation #1, the
    // number that decides this row's position in "Related documents".
    // Page 2 is cited second (#2). `groupSourcesByDocument` sorts the
    // group's own page chips ascending by page number (page 2 before page
    // 5), so a naive page-order scan for "Cited for" would wrongly surface
    // page 2's sentence instead of the row's actual first-cited page.
    const content = `First point cites page five ${pageFive.docRef}. Second point cites page two ${pageTwo.docRef}.`

    render(<CitationList sources={[pageFive, pageTwo]} content={content} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    expect(screen.getByText('Cited for: "First point cites page five."')).toBeInTheDocument()
    expect(screen.queryByText('Cited for: "Second point cites page two."')).not.toBeInTheDocument()
  })

  it('shows "Searched, not cited" under an uncited entry instead of a "Cited for" line', async () => {
    const user = userEvent.setup()
    const cited = source({ index: 1, filename: 'Cited.pdf', documentId: 'doc-c', page: 1 })
    const uncited = source({ index: 2, filename: 'Uncited.pdf', documentId: 'doc-u', page: 1 })

    render(<CitationList sources={[cited, uncited]} content={contentCiting(cited)} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))
    // The cited entry (Cited.pdf) legitimately keeps its own "Cited for"
    // line — this test only checks the uncited row's own subtitle, scoped
    // to that row so it isn't confused by the cited row's.
    await user.click(screen.getByRole('button', { name: /Also searched/ }))

    const uncitedRow = screen.getByText('Uncited.pdf').closest('li')!
    expect(within(uncitedRow).getByText('Searched, not cited')).toBeInTheDocument()
    expect(within(uncitedRow).queryByText(/^Cited for:/)).not.toBeInTheDocument()
  })

  it("highlights the question's significant words (≥ 4 letters, stop-words excluded) inside the snippet", async () => {
    const user = userEvent.setup()
    const withSnippet = source({
      index: 1,
      filename: 'Notes.pdf',
      documentId: 'doc-1',
      page: 1,
      snippet: 'The lecturer discussed the students briefly.',
    })

    render(
      <CitationList
        sources={[withSnippet]}
        content={contentCiting(withSnippet)}
        question="Who are the students mentioned?"
      />,
    )
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    const highlighted = screen.getByText('students')
    expect(highlighted.tagName).toBe('SPAN')
    expect(highlighted.className).toContain('font-medium')
    expect(highlighted.className).toContain('text-[#0d0d0d]')

    // "lecturer" isn't a significant word in this question, so it stays
    // part of the plain (non-highlighted) snippet text.
    expect(screen.queryByText('lecturer')).not.toBeInTheDocument()
    expect(screen.getByText(/lecturer/)).toBeInTheDocument()
  })

  it('renders the snippet with no highlighting when no question is passed', async () => {
    const user = userEvent.setup()
    const withSnippet = source({
      index: 1,
      filename: 'Notes.pdf',
      documentId: 'doc-1',
      page: 1,
      snippet: 'The lecturer discussed the students briefly.',
    })

    render(<CitationList sources={[withSnippet]} content={contentCiting(withSnippet)} />)
    await user.click(screen.getByRole('button', { name: /Related documents/ }))

    expect(screen.getByText('The lecturer discussed the students briefly.')).toBeInTheDocument()
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

  it('shows a hover preview with the filename, page, and snippet', async () => {
    const user = userEvent.setup()
    const src: Source = source({
      index: 1,
      filename: 'An_Extremely_Long_Document_Filename_That_Should_Be_Truncated.pdf',
      documentId: 'doc-1',
      page: 5,
      snippet: 'Revenue increased in the enterprise segment.',
    })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} number={1} />)

    const pill = screen.getByRole('button')
    expect(pill).toHaveTextContent('1')
    await user.hover(pill)

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(
      'An_Extremely_Long_Document_Filename_That_Should_Be_Truncated.pdf',
    )
    expect(tooltip).toHaveTextContent('Page 5')
    expect(tooltip).toHaveTextContent('Revenue increased in the enterprise segment.')
  })

  it('omits the page line from the hover preview when no page is known', async () => {
    const user = userEvent.setup()
    const src: Source = source({ index: 1, filename: 'Report.pdf', documentId: 'doc-1' })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} number={2} />)

    await user.hover(screen.getByRole('button'))

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Report.pdf')
    expect(tooltip).not.toHaveTextContent('Page')
  })

  it('vertically centers the pill with the surrounding text row', () => {
    const src: Source = source({ index: 1, filename: 'Report.pdf', documentId: 'doc-1' })

    render(<CitationLink source={src} label={citationDisplayLabel(src)} number={1} />)

    const pill = screen.getByRole('button')
    expect(pill.className).toMatch(/\balign-middle\b/)
    expect(pill.className).not.toMatch(/top-\[0\.2em\]/)
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
