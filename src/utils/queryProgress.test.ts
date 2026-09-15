import { describe, expect, it } from 'vitest'
import {
  formatProgressStage,
  formatRouteLabel,
  isLateQueryStage,
  listNames,
  progressTickerLabel,
  resolveProgressScope,
  type ProgressScopeDocument,
} from './queryProgress'

describe('formatProgressStage', () => {
  it('maps known stages', () => {
    expect(formatProgressStage('retrieving')).toBe('Searching your documents')
  })

  it('maps assembly to almost done', () => {
    expect(formatProgressStage('assembly')).toBe(
      'Almost done. Putting your answer together',
    )
  })

  it('humanizes unknown stages without raw snake_case', () => {
    expect(formatProgressStage('custom_stage')).toBe('Still working on Custom Stage')
  })

  it('classifying, embedding, and decontextualizing all mean "understanding"', () => {
    expect(formatProgressStage('classifying')).toBe('Understanding your question')
    expect(formatProgressStage('embedding')).toBe('Understanding your question')
    expect(formatProgressStage('decontextualizing')).toBe('Understanding your question')
  })

  it('rewriting appends the variant count only at 2 or more', () => {
    expect(formatProgressStage('rewriting', {})).toBe('Refining your question')
    expect(formatProgressStage('rewriting', { variants: 1 })).toBe('Refining your question')
    expect(formatProgressStage('rewriting', { variants: 3 })).toBe(
      'Refining your question (3 variants)',
    )
  })

  it('retrieving names the documents in scope, falling back with none', () => {
    expect(formatProgressStage('retrieving', {}, { filenames: ['A.pdf'] })).toBe(
      'Searching A.pdf',
    )
    expect(
      formatProgressStage('retrieving', {}, { filenames: ['A.pdf', 'B.pdf'] }),
    ).toBe('Searching A.pdf and B.pdf')
    expect(formatProgressStage('retrieving', {}, { filenames: [] })).toBe(
      'Searching your documents',
    )
    expect(formatProgressStage('retrieving')).toBe('Searching your documents')
  })

  it('retrieved counts candidates and documents, singular and plural', () => {
    expect(formatProgressStage('retrieved', { candidates: 1, distinct_items: 1 })).toBe(
      'Found 1 passage across 1 document',
    )
    expect(formatProgressStage('retrieved', { candidates: 5, distinct_items: 2 })).toBe(
      'Found 5 passages across 2 documents',
    )
    expect(formatProgressStage('retrieved', { candidates: 0 })).toBe('No matching passages yet')
    expect(formatProgressStage('retrieved', {})).toBe('No matching passages yet')
  })

  it('reranking ranks a known total, falls back otherwise', () => {
    expect(formatProgressStage('reranking', { total: 1 })).toBe('Ranking 1 passage by relevance')
    expect(formatProgressStage('reranking', { total: 4 })).toBe(
      'Ranking 4 passages by relevance',
    )
    expect(formatProgressStage('reranking', {})).toBe('Finding the best matches')
  })

  it('reranked reports the number selected', () => {
    expect(formatProgressStage('reranked', { selected: 1 })).toBe(
      'Picked the 1 most relevant passage',
    )
    expect(formatProgressStage('reranked', { selected: 3 })).toBe(
      'Picked the 3 most relevant passages',
    )
  })

  it('postprocessing reports the number kept', () => {
    expect(formatProgressStage('postprocessing', { kept: 1 })).toBe('Checking 1 passage')
    expect(formatProgressStage('postprocessing', { kept: 2 })).toBe('Checking 2 passages')
  })

  it('assembling reports the number of chunks', () => {
    expect(formatProgressStage('assembling', { chunks: 1 })).toBe('Reading 1 passage')
    expect(formatProgressStage('assembling', { chunks: 2 })).toBe('Reading 2 passages')
  })

  it('generating never names files — only "Writing your answer", regardless of context', () => {
    // Client feedback: naming files here read as if the model had already
    // decided its sources before writing anything. The retrieving stage
    // above still names what was searched; this one only says what's
    // happening right now.
    expect(formatProgressStage('generating')).toBe('Writing your answer')
    expect(formatProgressStage('generating', {}, { filenames: ['A.pdf', 'B.pdf'] })).toBe(
      'Writing your answer',
    )
  })

  it('planning includes the iteration when given', () => {
    expect(formatProgressStage('planning', { iteration: 2 })).toBe(
      'Planning the answer (step 2)',
    )
    expect(formatProgressStage('planning', {})).toBe('Planning the answer')
  })

  it('verifying is a fixed label', () => {
    expect(formatProgressStage('verifying')).toBe('Double-checking the answer')
  })

  it('carries no ellipsis in any label', () => {
    const cases: [string, Record<string, unknown>?][] = [
      ['classifying'],
      ['rewriting', { variants: 3 }],
      ['retrieving'],
      ['retrieved', { candidates: 5, distinct_items: 2 }],
      ['reranking', { total: 4 }],
      ['reranked', { selected: 3 }],
      ['postprocessing', { kept: 2 }],
      ['assembling', { chunks: 2 }],
      ['generating'],
      ['planning', { iteration: 2 }],
      ['verifying'],
      ['assembly'],
      ['some_unrecognized_stage'],
    ]
    for (const [stage, payload] of cases) {
      const label = formatProgressStage(stage, payload)
      expect(label).toBeDefined()
      expect(label).not.toMatch(/…|\.\.\./)
    }
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
    expect(formatRouteLabel('simple_lookup')).toBe('Quick lookup')
  })

  it('carries no ellipsis for a known or an unknown strategy', () => {
    expect(formatRouteLabel('aggregation')).not.toMatch(/…|\.\.\./)
    expect(formatRouteLabel('some_new_strategy')).not.toMatch(/…|\.\.\./)
  })
})

describe('isLateQueryStage', () => {
  it('detects assembly as late', () => {
    expect(isLateQueryStage('assembly')).toBe(true)
    expect(isLateQueryStage('retrieving')).toBe(false)
  })
})

describe('progressTickerLabel', () => {
  it('always shows the stage label on even ticks, regardless of known names', () => {
    const ctx = { stageLabel: 'Searching your documents', stage: 'retrieving', files: ['A.pdf'], folders: [] }
    expect(progressTickerLabel(0, ctx)).toBe('Searching your documents')
    expect(progressTickerLabel(2, ctx)).toBe('Searching your documents')
    expect(progressTickerLabel(4, ctx)).toBe('Searching your documents')
  })

  it('cycles through file names as "Searching <file>" on odd ticks outside the generating stage', () => {
    const ctx = {
      stageLabel: 'Finding the best matches',
      stage: 'reranking',
      files: ['A.pdf', 'B.pdf'],
      folders: [],
    }
    expect(progressTickerLabel(1, ctx)).toBe('Searching A.pdf')
    expect(progressTickerLabel(3, ctx)).toBe('Searching B.pdf')
    // Wraps back around once every name has had a turn.
    expect(progressTickerLabel(5, ctx)).toBe('Searching A.pdf')
  })

  it('adds folder names as "Searching folder <folder>" after the files, cycling through both', () => {
    const ctx = {
      stageLabel: 'Understanding your question',
      stage: 'classifying',
      files: ['A.pdf'],
      folders: ['Reports'],
    }
    expect(progressTickerLabel(1, ctx)).toBe('Searching A.pdf')
    expect(progressTickerLabel(3, ctx)).toBe('Searching folder Reports')
    expect(progressTickerLabel(5, ctx)).toBe('Searching A.pdf')
  })

  it('uses "Reading <file>" instead of "Searching" during the generating stage, and never names a folder', () => {
    const ctx = {
      stageLabel: 'Writing your answer',
      stage: 'generating',
      files: ['A.pdf', 'B.pdf'],
      folders: ['Reports'],
    }
    expect(progressTickerLabel(1, ctx)).toBe('Reading A.pdf')
    expect(progressTickerLabel(3, ctx)).toBe('Reading B.pdf')
  })

  it('is case-insensitive about the "generating" stage name', () => {
    const ctx = { stageLabel: 'Writing your answer', stage: 'Generating', files: ['A.pdf'], folders: [] }
    expect(progressTickerLabel(1, ctx)).toBe('Reading A.pdf')
  })

  it('falls back to the stage label on every tick when there is nothing to name', () => {
    const ctx = { stageLabel: 'Understanding your question', stage: 'classifying', files: [], folders: [] }
    expect(progressTickerLabel(0, ctx)).toBe('Understanding your question')
    expect(progressTickerLabel(1, ctx)).toBe('Understanding your question')
    expect(progressTickerLabel(2, ctx)).toBe('Understanding your question')
  })

  it('falls back to the stage label during generating when no files are known yet', () => {
    const ctx = { stageLabel: 'Writing your answer', stage: 'generating', files: [], folders: ['Reports'] }
    expect(progressTickerLabel(1, ctx)).toBe('Writing your answer')
  })

  it('de-duplicates file and folder names before cycling', () => {
    const ctx = {
      stageLabel: 'Searching your documents',
      stage: 'retrieving',
      files: ['A.pdf', 'A.pdf'],
      folders: [],
    }
    expect(progressTickerLabel(1, ctx)).toBe('Searching A.pdf')
    expect(progressTickerLabel(3, ctx)).toBe('Searching A.pdf')
  })

  it('returns undefined when there is no stage label and nothing to name', () => {
    expect(
      progressTickerLabel(0, { stageLabel: undefined, stage: undefined, files: [], folders: [] }),
    ).toBeUndefined()
  })

  it('produces no ellipsis in any scope line', () => {
    const ctx = {
      stageLabel: 'Writing your answer',
      stage: 'generating',
      files: ['A.pdf'],
      folders: [],
    }
    expect(progressTickerLabel(1, ctx)).not.toMatch(/…|\.\.\./)
  })
})

describe('resolveProgressScope', () => {
  function docMeta(entries: Record<string, ProgressScopeDocument>): Map<string, ProgressScopeDocument> {
    return new Map(Object.entries(entries))
  }

  it('resolves file names for the given document ids, in order', () => {
    const meta = docMeta({
      'doc-1': { filename: 'A.pdf', folder_id: 1 },
      'doc-2': { filename: 'B.pdf', folder_id: 1 },
    })
    const scope = resolveProgressScope(['doc-1', 'doc-2'], meta, () => undefined)
    expect(scope.files).toEqual(['A.pdf', 'B.pdf'])
  })

  it('drops a document id with no metadata or no filename on record', () => {
    const meta = docMeta({
      'doc-1': { filename: 'A.pdf', folder_id: 1 },
      'doc-2': { folder_id: 1 },
    })
    const scope = resolveProgressScope(['doc-1', 'doc-2', 'doc-missing'], meta, () => undefined)
    expect(scope.files).toEqual(['A.pdf'])
  })

  it('runs filenames through displayFilename (strips a LogicalDOC hex-id prefix)', () => {
    const meta = docMeta({
      'doc-1': { filename: 'a1b2c3d4_Report.pdf', folder_id: 1 },
    })
    const scope = resolveProgressScope(['doc-1'], meta, () => undefined)
    expect(scope.files).toEqual(['Report.pdf'])
  })

  it('resolves folder names via the lookup, de-duplicated across documents sharing a folder', () => {
    const meta = docMeta({
      'doc-1': { filename: 'A.pdf', folder_id: 1 },
      'doc-2': { filename: 'B.pdf', folder_id: 1 },
      'doc-3': { filename: 'C.pdf', folder_id: 2 },
    })
    const getFolderNode = (folderId: number) =>
      ({ 1: { name: 'Reports' }, 2: { name: 'Contracts' } })[folderId as 1 | 2]
    const scope = resolveProgressScope(['doc-1', 'doc-2', 'doc-3'], meta, getFolderNode)
    expect(scope.folders).toEqual(['Reports', 'Contracts'])
  })

  it('leaves out a folder the lookup has no name for yet (folder contents not fetched)', () => {
    const meta = docMeta({ 'doc-1': { filename: 'A.pdf', folder_id: 1 } })
    const scope = resolveProgressScope(['doc-1'], meta, () => undefined)
    expect(scope.folders).toEqual([])
  })

  it('leaves out a document with no folder_id on record', () => {
    const meta = docMeta({ 'doc-1': { filename: 'A.pdf' } })
    const scope = resolveProgressScope(['doc-1'], meta, () => ({ name: 'Reports' }))
    expect(scope.folders).toEqual([])
  })

  it('returns empty files and folders for an empty document list', () => {
    expect(resolveProgressScope([], docMeta({}), () => undefined)).toEqual({
      files: [],
      folders: [],
    })
  })
})
