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

  it('truncates a long citing sentence to 140 chars, with no ellipsis', () => {
    const sourceA = docSource(1)
    const longSentence = 'a'.repeat(200)
    const content = `${longSentence} [Doc1].`

    const contexts = citationContextByAnswerOrder(content, [sourceA])
    const text = contexts.get(citationNumberKey(sourceA))!

    expect(text.length).toBeLessThanOrEqual(140)
    expect(text).not.toMatch(/…|\.\.\.$/)
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

  it('dedupes a repeated entry within one bracket group to a single ref segment, keeping first-appearance order (fix round 1: was rendering the repeat as its own separate pill)', () => {
    const sources = [
      source({ index: 6, docRef: '[Doc6]' }),
      source({ index: 7, docRef: '[Doc7]' }),
      source({ index: 8, docRef: '[Doc8]' }),
    ]

    const segments = splitAnswerByDocRefs(
      'See the notes [Doc6, Doc7, Doc6, Doc8] for detail.',
      sources,
    )

    expect(segments.filter((s) => s.type === 'ref').map((r) => r.value)).toEqual([
      '[Doc6]',
      '[Doc7]',
      '[Doc8]',
    ])
  })

  it('does not dedupe the same citation across two separate bracket groups — only a repeat within one group collapses', () => {
    const sources = [source({ index: 1, docRef: '[Doc1]' }), source({ index: 2, docRef: '[Doc2]' })]

    const segments = splitAnswerByDocRefs('First [Doc1, Doc2]. Repeats later [Doc1] again.', sources)

    expect(segments.filter((s) => s.type === 'ref').map((r) => r.value)).toEqual([
      '[Doc1]',
      '[Doc2]',
      '[Doc1]',
    ])
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

// Item B (round 3): "adjacent citation runs render as '1 , 2 , 3 . 4'" —
// a citation run (one or more resolved markers separated only by
// whitespace and/or `,` `;` `and` `&` `/`) collapses to a single
// space-separated sequence of pills with no separator text, deduplicated
// by identity across the whole run (not just within one bracket group);
// sentence punctuation (`.` `!` `?`, optionally after whitespace)
// immediately after the run moves to immediately before it, dropping any
// `,`/`;` immediately before the run at the same time. Asserted via the
// reconstructed `[DocN]` text (`segments.map(s => s.value).join('')`,
// same convention the bracket-list tests above use) so these stay
// decoupled from pill *numbering*, which `numberCitationsByAnswerOrder`
// covers separately and this rule must never change.
describe('splitAnswerByDocRefs — citation runs (Item B)', () => {
  const renderedText = (content: string, sources: Source[]) =>
    splitAnswerByDocRefs(content, sources)
      .map((s) => s.value)
      .join('')

  it.each([
    [
      'trailing comma run + period: drops the leading comma, moves the period before the run',
      'actions, [Doc5], [Doc6], [Doc7].',
      [docSource(5), docSource(6), docSource(7)],
      'actions. [Doc5] [Doc6] [Doc7]',
    ],
    [
      'a bracket group + a lone marker + "and" + a repeat: dedupes across all of it, one number each',
      'listed, [Doc1, Doc2], [Doc3] and [Doc1].',
      [docSource(1), docSource(2), docSource(3)],
      'listed. [Doc1] [Doc2] [Doc3]',
    ],
    [
      'what follows the run (a new sentence) is untouched',
      'Monitoring, [Doc1], [Doc2]. Next',
      [docSource(1), docSource(2)],
      'Monitoring. [Doc1] [Doc2] Next',
    ],
    [
      '"and" with no trailing sentence punctuation: run still collapses, nothing about punctuation moves',
      'see [Doc1] and [Doc2] for details',
      [docSource(1), docSource(2)],
      'see [Doc1] [Doc2] for details',
    ],
    [
      'a single marker is unaffected apart from existing single-marker handling — text intervenes before the period',
      '[Doc1] alone.',
      [docSource(1)],
      '[Doc1] alone.',
    ],
    [
      'a single marker directly before a period is also unaffected — the punctuation move is scoped to runs of 2+',
      'as stated [Doc1].',
      [docSource(1)],
      'as stated [Doc1].',
    ],
    [
      'semicolon separator, and a period-then-marker boundary ending the run one marker later',
      'follow-up actions, [Doc5], [Doc6]. [Doc7]',
      [docSource(5), docSource(6), docSource(7)],
      'follow-up actions. [Doc5] [Doc6] [Doc7]',
    ],
    [
      'ampersand and slash separators both count as connectors',
      'per [Doc1] & [Doc2] / [Doc3].',
      [docSource(1), docSource(2), docSource(3)],
      'per. [Doc1] [Doc2] [Doc3]',
    ],
    [
      'a long run mixing commas and "and", with several repeats scattered through it, still dedupes to first-appearance order',
      'Dr. Aisha Rahman chaired each meeting listed, [Doc1], [Doc2], [Doc3], [Doc4], [Doc5], [Doc3], [Doc4], [Doc5], [Doc1] and [Doc2].',
      [1, 2, 3, 4, 5].map((n) => docSource(n)),
      'Dr. Aisha Rahman chaired each meeting listed. [Doc1] [Doc2] [Doc3] [Doc4] [Doc5]',
    ],
    [
      'plain prose "and" between two non-marker tokens is never touched',
      'The report covers cats and dogs, not [Doc1] or [Doc2].',
      [docSource(1), docSource(2)],
      'The report covers cats and dogs, not [Doc1] or [Doc2].',
    ],
    // Fix round 1 (review finding #1): a 2+-marker run at the very start
    // of the text handed to `splitAnswerByDocRefs` used to push the moved
    // punctuation as a bare leading segment with nothing before it — since
    // this function runs per Markdown text node (paragraph, table cell,
    // list item, or the text after an inline `<strong>`/link boundary —
    // see `linkifyNode`), "the run opens the node" is an ordinary, not a
    // rare, shape. There's nothing to attach the moved mark to here, so
    // the fix leaves the punctuation exactly where it was instead.
    [
      'a run at the very start of the text, immediately followed by a period: punctuation stays after the run (nothing to move it in front of)',
      '[Doc1], [Doc2].',
      [docSource(1), docSource(2)],
      '[Doc1] [Doc2].',
    ],
    [
      'a run at the very start of the text, followed by more prose (no trailing sentence punctuation to move either)',
      '[Doc1] and [Doc2] are both relevant here.',
      [docSource(1), docSource(2)],
      '[Doc1] [Doc2] are both relevant here.',
    ],
    // Review finding #2: an unresolvable marker inside a run collapses
    // cleanly through the gap it leaves — `expandBracketDocGroups` strips
    // any well-formed `[DocN]` bracket to nothing before the run scan even
    // runs, whether or not it resolves to a source, so the surrounding
    // resolvable markers still form one run.
    [
      'an unresolvable marker inside a run: the run still collapses cleanly around the gap it leaves',
      'start [Doc1], [Doc99], [Doc2].',
      [docSource(1), docSource(2)],
      'start. [Doc1] [Doc2]',
    ],
  ])('%s', (_label, content, sources, expected) => {
    expect(renderedText(content, sources)).toBe(expected)
  })

  it('still numbers citations by first appearance in the answer, unaffected by run-collapsing or the within-run dedupe', () => {
    const sources = [docSource(1), docSource(2), docSource(3)]
    const content = 'listed, [Doc1, Doc2], [Doc3] and [Doc1].'

    const numbers = numberCitationsByAnswerOrder(content, sources)

    expect(numbers.get(citationNumberKey(sources[0]))).toBe(1)
    expect(numbers.get(citationNumberKey(sources[1]))).toBe(2)
    expect(numbers.get(citationNumberKey(sources[2]))).toBe(3)
  })

  it('never gives "Cited for" a bare punctuation context when a citation\'s first clause is nothing but the run itself (review finding #1, second surface)', () => {
    const sources = [docSource(1), docSource(2)]
    const content = '[Doc1], [Doc2]. Both confirm the finding.'

    const contexts = citationContextByAnswerOrder(content, sources)

    // The citing clause is pure citation markers with no prose of its own
    // once the refs are stripped out — CitationList already renders
    // "Searched, not cited" when a key has no entry here, which reads far
    // better than `Cited for: "."` would, so no context is set at all
    // rather than the punctuation debris.
    expect(contexts.get(citationNumberKey(sources[0]))).toBeUndefined()
    expect(contexts.get(citationNumberKey(sources[1]))).toBeUndefined()
  })

  it('falls through to a later clause with real prose when an earlier citing clause of the same document was punctuation-only', () => {
    const sources = [docSource(1)]
    const content = '[Doc1]. It is cited again here in a full sentence [Doc1].'

    const contexts = citationContextByAnswerOrder(content, sources)

    expect(contexts.get(citationNumberKey(sources[0]))).toBe(
      'It is cited again here in a full sentence.',
    )
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
