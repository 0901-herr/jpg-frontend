import { describe, expect, it } from 'vitest'
import { formatProgressStage, formatRouteLabel, isLateQueryStage, listNames } from './queryProgress'

describe('formatProgressStage', () => {
  it('maps known stages', () => {
    expect(formatProgressStage('retrieving')).toBe('Searching your documents…')
  })

  it('maps assembly to almost done', () => {
    expect(formatProgressStage('assembly')).toBe(
      'Almost done. Putting your answer together…',
    )
  })

  it('humanizes unknown stages without raw snake_case', () => {
    expect(formatProgressStage('custom_stage')).toBe('Still working on Custom Stage…')
  })

  it('classifying, embedding, and decontextualizing all mean "understanding"', () => {
    expect(formatProgressStage('classifying')).toBe('Understanding your question…')
    expect(formatProgressStage('embedding')).toBe('Understanding your question…')
    expect(formatProgressStage('decontextualizing')).toBe('Understanding your question…')
  })

  it('rewriting appends the variant count only at 2 or more', () => {
    expect(formatProgressStage('rewriting', {})).toBe('Refining your question…')
    expect(formatProgressStage('rewriting', { variants: 1 })).toBe('Refining your question…')
    expect(formatProgressStage('rewriting', { variants: 3 })).toBe(
      'Refining your question… (3 variants)',
    )
  })

  it('retrieving names the documents in scope, falling back with none', () => {
    expect(formatProgressStage('retrieving', {}, { filenames: ['A.pdf'] })).toBe(
      'Searching A.pdf…',
    )
    expect(
      formatProgressStage('retrieving', {}, { filenames: ['A.pdf', 'B.pdf'] }),
    ).toBe('Searching A.pdf and B.pdf…')
    expect(formatProgressStage('retrieving', {}, { filenames: [] })).toBe(
      'Searching your documents…',
    )
    expect(formatProgressStage('retrieving')).toBe('Searching your documents…')
  })

  it('retrieved counts candidates and documents, singular and plural', () => {
    expect(formatProgressStage('retrieved', { candidates: 1, distinct_items: 1 })).toBe(
      'Found 1 passage across 1 document…',
    )
    expect(formatProgressStage('retrieved', { candidates: 5, distinct_items: 2 })).toBe(
      'Found 5 passages across 2 documents…',
    )
    expect(formatProgressStage('retrieved', { candidates: 0 })).toBe('No matching passages yet…')
    expect(formatProgressStage('retrieved', {})).toBe('No matching passages yet…')
  })

  it('reranking ranks a known total, falls back otherwise', () => {
    expect(formatProgressStage('reranking', { total: 1 })).toBe('Ranking 1 passage by relevance…')
    expect(formatProgressStage('reranking', { total: 4 })).toBe(
      'Ranking 4 passages by relevance…',
    )
    expect(formatProgressStage('reranking', {})).toBe('Finding the best matches…')
  })

  it('reranked reports the number selected', () => {
    expect(formatProgressStage('reranked', { selected: 1 })).toBe(
      'Picked the 1 most relevant passage…',
    )
    expect(formatProgressStage('reranked', { selected: 3 })).toBe(
      'Picked the 3 most relevant passages…',
    )
  })

  it('postprocessing reports the number kept', () => {
    expect(formatProgressStage('postprocessing', { kept: 1 })).toBe('Checking 1 passage…')
    expect(formatProgressStage('postprocessing', { kept: 2 })).toBe('Checking 2 passages…')
  })

  it('assembling reports the number of chunks', () => {
    expect(formatProgressStage('assembling', { chunks: 1 })).toBe('Reading 1 passage…')
    expect(formatProgressStage('assembling', { chunks: 2 })).toBe('Reading 2 passages…')
  })

  it('generating names the cited documents when known, else a generic label', () => {
    expect(
      formatProgressStage('generating', {}, { citationFilenames: ['A.pdf', 'B.pdf'] }),
    ).toBe('Writing your answer from A.pdf and B.pdf…')
    expect(formatProgressStage('generating', {}, { citationFilenames: [] })).toBe(
      'Writing your answer…',
    )
    expect(formatProgressStage('generating')).toBe('Writing your answer…')
  })

  it('planning includes the iteration when given', () => {
    expect(formatProgressStage('planning', { iteration: 2 })).toBe(
      'Planning the answer (step 2)…',
    )
    expect(formatProgressStage('planning', {})).toBe('Planning the answer…')
  })

  it('verifying is a fixed label', () => {
    expect(formatProgressStage('verifying')).toBe('Double-checking the answer…')
  })
})

describe('listNames', () => {
  it('renders a single name plainly', () => {
    expect(listNames(['A.pdf'])).toBe('A.pdf')
  })

  it('joins exactly two names with "and", no comma', () => {
    expect(listNames(['A.pdf', 'B.pdf'])).toBe('A.pdf and B.pdf')
  })

  it('truncates more than max names into "and N more"', () => {
    expect(listNames(['A.pdf', 'B.pdf', 'C.pdf', 'D.pdf', 'E.pdf'])).toBe(
      'A.pdf, B.pdf and 3 more',
    )
  })

  it('de-duplicates names', () => {
    expect(listNames(['A.pdf', 'A.pdf', 'B.pdf'])).toBe('A.pdf and B.pdf')
  })

  it('returns an empty string for no names', () => {
    expect(listNames([])).toBe('')
  })
})

describe('formatRouteLabel', () => {
  it('maps simple lookup', () => {
    expect(formatRouteLabel('simple_lookup')).toBe('Quick lookup…')
  })
})

describe('isLateQueryStage', () => {
  it('detects assembly as late', () => {
    expect(isLateQueryStage('assembly')).toBe(true)
    expect(isLateQueryStage('retrieving')).toBe(false)
  })
})
