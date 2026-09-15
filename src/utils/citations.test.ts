import { describe, expect, it } from 'vitest'
import {
  answerHasInlineCitation,
  citationContextByAnswerOrder,
  citationNumberKey,
  highlightSignificantWords,
  numberCitationsByAnswerOrder,
  significantQuestionWords,
  splitAnswerByDocRefs,
} from './citations'
import type { Source } from '../types'

function source(overrides: Partial<Source> & { index: number; docRef: string }): Source {
  return {
    filename: `Doc${overrides.index}.pdf`,
    documentId: `doc-${overrides.index}`,
    ...overrides,
  }
}

function docSource(n: number, overrides: Partial<Source> = {}): Source {
  return {
    index: n,
    filename: `Doc${n}.pdf`,
    documentId: `doc-${n}`,
    docRef: `[Doc${n}]`,
    ...overrides,
  }
}

describe('numberCitationsByAnswerOrder', () => {
  it('numbers citations by first appearance in the answer text, not by source-list order', () => {
    const sources = [6, 7, 8].map((n) => docSource(n))
    const content = 'First [Doc6]. Then [Doc7]. Also [Doc6] again. And [Doc8].'

    const numbers = numberCitationsByAnswerOrder(content, sources)

    expect(numbers.get(citationNumberKey(sources[0]))).toBe(1) // Doc6
    expect(numbers.get(citationNumberKey(sources[1]))).toBe(2) // Doc7
    expect(numbers.get(citationNumberKey(sources[2]))).toBe(3) // Doc8
    expect(numbers.size).toBe(3)
  })

  it('gives a bracket group ([Doc6, Doc7, Doc6, Doc8]) one number per distinct source, deduped', () => {
    const sources = [6, 7, 8].map((n) => docSource(n))
    const content = 'See the notes [Doc6, Doc7, Doc6, Doc8] for detail.'

    const numbers = numberCitationsByAnswerOrder(content, sources)

    expect(numbers.get(citationNumberKey(sources[0]))).toBe(1)
    expect(numbers.get(citationNumberKey(sources[1]))).toBe(2)
    expect(numbers.get(citationNumberKey(sources[2]))).toBe(3)
    expect(numbers.size).toBe(3)
  })

  it('assigns no number to a source the answer never cites', () => {
    const cited = docSource(1)
    const uncited = docSource(2)

    const numbers = numberCitationsByAnswerOrder('Only cites [Doc1] here.', [cited, uncited])

    expect(numbers.get(citationNumberKey(cited))).toBe(1)
    expect(numbers.has(citationNumberKey(uncited))).toBe(false)
  })

  it("starts back at 1 for a different message's content — a second question never continues the first's count", () => {
    const sources = [6, 7].map((n) => docSource(n))
    const secondQuestionContent = 'Now [Doc7] first, then [Doc6].'

    const numbers = numberCitationsByAnswerOrder(secondQuestionContent, sources)

    expect(numbers.get(citationNumberKey(sources[1]))).toBe(1) // Doc7 cited first here
    expect(numbers.get(citationNumberKey(sources[0]))).toBe(2) // Doc6 second
  })

  it('returns an empty map when nothing in the content matches a source', () => {
    expect(numberCitationsByAnswerOrder('No markers here.', [docSource(1)]).size).toBe(0)
  })
})

describe('citationContextByAnswerOrder', () => {
  it('maps a cited source to the sentence that carries its pill', () => {
    const sourceA = docSource(1)
    const sourceB = docSource(2)
    const content = 'First point about revenue [Doc1]. Second point about staffing [Doc2].'

    const contexts = citationContextByAnswerOrder(content, [sourceA, sourceB])

    expect(contexts.get(citationNumberKey(sourceA))).toBe('First point about revenue.')
    expect(contexts.get(citationNumberKey(sourceB))).toBe('Second point about staffing.')
  })

  it('keeps the first sentence a repeated citation appears in, not a later repeat', () => {
    const sourceA = docSource(1)
    const content = 'First mention here [Doc1]. Repeats the same source later [Doc1] again.'

    const contexts = citationContextByAnswerOrder(content, [sourceA])

    expect(contexts.get(citationNumberKey(sourceA))).toBe('First mention here.')
  })

  it('uses the whole list-item line as the context for a marker inside a bullet', () => {
    const sourceA = docSource(1)
    const content = '- The finding is described here [Doc1]\n- An unrelated bullet with no marker'

    const contexts = citationContextByAnswerOrder(content, [sourceA])

    expect(contexts.get(citationNumberKey(sourceA))).toBe('The finding is described here')
  })

  it('has no entry for a source the answer never cites', () => {
    const uncited = docSource(9)

    const contexts = citationContextByAnswerOrder('Nothing cited here.', [uncited])

    expect(contexts.has(citationNumberKey(uncited))).toBe(false)
  })

  it('truncates a long citing sentence to ~140 chars with an ellipsis', () => {
    const sourceA = docSource(1)
    const longSentence = 'a'.repeat(200)
    const content = `${longSentence} [Doc1].`

    const contexts = citationContextByAnswerOrder(content, [sourceA])
    const text = contexts.get(citationNumberKey(sourceA))!

    expect(text.length).toBeLessThanOrEqual(140)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('significantQuestionWords', () => {
  it('keeps content words of 4+ letters and drops stop words and short words', () => {
    const words = significantQuestionWords(
      'What is the name of the students mentioned in the report?',
    )

    expect(words.has('students')).toBe(true)
    expect(words.has('mentioned')).toBe(true)
    expect(words.has('report')).toBe(true)
    expect(words.has('name')).toBe(true)
    expect(words.has('what')).toBe(false) // stop word
    expect(words.has('the')).toBe(false) // < 4 letters
    expect(words.has('is')).toBe(false) // < 4 letters
  })
})

describe('highlightSignificantWords', () => {
  it('flags words matching the question, case-insensitively, and leaves the rest unflagged', () => {
    const segments = highlightSignificantWords(
      'The lecturer discussed the students briefly.',
      'Who are the students mentioned?',
    )

    expect(segments.filter((s) => s.highlight).map((s) => s.text)).toEqual(['students'])

    const notHighlighted = segments
      .filter((s) => !s.highlight)
      .map((s) => s.text)
      .join('')
    expect(notHighlighted).toContain('lecturer')
  })

  it('is a whole-word match — "lecture" in the question never highlights "lecturer" in the text', () => {
    const segments = highlightSignificantWords('The lecturer spoke.', 'What was the lecture about?')
    expect(segments.some((s) => s.highlight)).toBe(false)
  })

  it('returns the text unflagged when the question has no significant words', () => {
    const segments = highlightSignificantWords('Some snippet text.', 'is it ok')

    expect(segments.every((s) => !s.highlight)).toBe(true)
    expect(segments.map((s) => s.text).join('')).toBe('Some snippet text.')
  })
})

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

describe('literal "[DocN]" placeholder (the model copied the prompt template verbatim — N is a letter, not a number)', () => {
  it('removes a lone "[DocN]" from the text and produces no ref segment', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' })]

    const segments = splitAnswerByDocRefs('Not covered by the provided context [DocN].', sources)

    expect(segments.filter((s) => s.type === 'ref')).toHaveLength(0)
    expect(segments.map((s) => s.value).join('')).toBe('Not covered by the provided context .')
  })

  it('drops the DocN entry from a mixed bracket list, keeping the matching Doc1 entry', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' })]

    const segments = splitAnswerByDocRefs('per the filing [Doc1, DocN]', sources)

    expect(segments.filter((s) => s.type === 'ref').map((r) => r.value)).toEqual(['[Doc1]'])
  })

  it('leaves "[Document]", "[Docs]" and "[Doctor]" untouched — none of those is a DocN match', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' })]

    for (const text of [
      'See the [Document] for details.',
      'Refer to the [Docs] folder.',
      'Ask the [Doctor] about it.',
    ]) {
      const segments = splitAnswerByDocRefs(text, sources)
      expect(segments.filter((s) => s.type === 'ref')).toHaveLength(0)
      expect(segments.map((s) => s.value).join('')).toBe(text)
    }
  })
})

describe('answerHasInlineCitation', () => {
  it('is true when the content has a marker matching a source', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' })]
    expect(answerHasInlineCitation('See the flags in [Doc1].', sources)).toBe(true)
  })

  it('is false when the content has no marker at all', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' })]
    expect(
      answerHasInlineCitation(
        'The provided context does not contain any information about that.',
        sources,
      ),
    ).toBe(false)
  })

  it('is false when the marker present has no matching source', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' })]
    expect(answerHasInlineCitation('as noted [Doc9]', sources)).toBe(false)
  })
})
