import { describe, expect, it } from 'vitest'
import { splitAnswerByDocRefs } from './citations'
import type { Source } from '../types'

function source(overrides: Partial<Source> & { index: number; docRef: string }): Source {
  return {
    filename: `Doc${overrides.index}.pdf`,
    documentId: `doc-${overrides.index}`,
    ...overrides,
  }
}

describe('splitAnswerByDocRefs — raw multi-document markers', () => {
  it('expands a comma-separated bracket list into one ref segment per entry that has a matching source', () => {
    const sources = [
      source({ index: 1, docRef: '[Doc1]' }),
      source({ index: 2, docRef: '[Doc2]' }),
      source({ index: 6, docRef: '[Doc6]' }),
    ]

    const segments = splitAnswerByDocRefs('See the notes [Doc1, Doc2, Doc6] for detail.', sources)

    const refs = segments.filter((s) => s.type === 'ref')
    expect(refs).toHaveLength(3)
    expect(refs.map((r) => r.value)).toEqual(['[Doc1]', '[Doc2]', '[Doc6]'])
    // No raw bracket-list text ever reaches a text segment.
    for (const seg of segments) {
      if (seg.type === 'text') expect(seg.value).not.toMatch(/\[.*doc.*\]/i)
    }
  })

  it('is case-insensitive and tolerates extra spaces in the bracket list', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' }), source({ index: 2, docRef: '[Doc2]' })]

    const segments = splitAnswerByDocRefs('as noted [ doc1 ,  DOC2 ] here', sources)

    expect(segments.filter((s) => s.type === 'ref').map((r) => r.value)).toEqual([
      '[Doc1]',
      '[Doc2]',
    ])
  })

  it('drops an entry with no matching source silently, keeping the rest', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' }), source({ index: 2, docRef: '[Doc2]' })]

    const segments = splitAnswerByDocRefs('per the filing [Doc1, Doc9, Doc2]', sources)

    expect(segments.filter((s) => s.type === 'ref').map((r) => r.value)).toEqual([
      '[Doc1]',
      '[Doc2]',
    ])
    const text = segments
      .filter((s) => s.type === 'text')
      .map((s) => s.value)
      .join('')
    expect(text).not.toMatch(/doc9/i)
  })

  it('drops the whole bracket when none of its entries match a source, never showing raw "[Doc…]" text', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' })]

    const segments = splitAnswerByDocRefs('an unverified claim [Doc9, Doc10]', sources)

    expect(segments.filter((s) => s.type === 'ref')).toHaveLength(0)
    const text = segments.map((s) => s.value).join('')
    expect(text).toBe('an unverified claim ')
  })

  it('ignores a ":page" suffix on a bracket-list entry when resolving the source', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' }), source({ index: 3, docRef: '[Doc3]' })]

    const segments = splitAnswerByDocRefs('per the records [Doc1:2, Doc3]', sources)

    expect(segments.filter((s) => s.type === 'ref').map((r) => r.value)).toEqual([
      '[Doc1]',
      '[Doc3]',
    ])
  })

  it('gives consecutive markers written back-to-back ("[Doc1][Doc3]") the same treatment, with a space between the rendered refs', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' }), source({ index: 3, docRef: '[Doc3]' })]

    const segments = splitAnswerByDocRefs('as shown[Doc1][Doc3] above', sources)

    expect(segments).toEqual([
      { type: 'text', value: 'as shown' },
      { type: 'ref', value: '[Doc1]', source: sources[0] },
      { type: 'text', value: ' ' },
      { type: 'ref', value: '[Doc3]', source: sources[1] },
      { type: 'text', value: ' above' },
    ])
  })

  it('still renders a normal single "[DocN]" marker as one ref, unaffected by the bracket-list handling', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' })]

    const segments = splitAnswerByDocRefs('The answer cites a source [Doc1] directly.', sources)

    expect(segments).toEqual([
      { type: 'text', value: 'The answer cites a source ' },
      { type: 'ref', value: '[Doc1]', source: sources[0] },
      { type: 'text', value: ' directly.' },
    ])
  })
})
