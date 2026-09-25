import { describe, expect, it, vi } from 'vitest'
import { AtCapacityError, citationRefForSegment, joinAnswerSegment, sendMessage } from './query'
import { apiPostStream, ApiError } from './http'
import type { SseEvent } from './http'
import type { Citation } from './types/query'
import { QUERY_PERMISSION_DENIED_ERROR } from '../utils/userFacingErrors'

vi.mock('./http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./http')>()
  return {
    ...actual,
    apiPostStream: vi.fn(async () => ({
      response: {} as Response,
      coverageFromHeaders: {},
    })),
    consumeSseStream: vi.fn(
      async (_response: Response, onEvent: (event: SseEvent) => void) => {
        for (const event of scriptedEvents) onEvent(event)
      },
    ),
  }
})

let scriptedEvents: SseEvent[] = []

describe('joinAnswerSegment', () => {
  it('inserts a space between two whole-clause segments', () => {
    expect(joinAnswerSegment('Based on the context provided in,', 'there are four types')).toBe(
      'Based on the context provided in, there are four types',
    )
  })

  it('inserts a space after a sentence-ending period', () => {
    expect(joinAnswerSegment('hazardous material incident.', 'mentions these incidents')).toBe(
      'hazardous material incident. mentions these incidents',
    )
  })

  it('does not double a space already present on either side', () => {
    expect(joinAnswerSegment('foo ', 'bar')).toBe('foo bar')
    expect(joinAnswerSegment('foo', ' bar')).toBe('foo bar')
  })

  it('does not insert a space before closing punctuation', () => {
    expect(joinAnswerSegment('the report', '.')).toBe('the report.')
    expect(joinAnswerSegment('the report', ', continued')).toBe('the report, continued')
  })

  it('does not insert a leading space on the first segment', () => {
    expect(joinAnswerSegment('', 'Based on the context')).toBe('Based on the context')
  })
})

describe('citationRefForSegment', () => {
  const citations: Citation[] = [
    { doc_ref: '[Doc1]', chunk_id: 'chunk-a', item_id: 'item-1', page: 9 },
    { doc_ref: '[Doc2]', chunk_id: 'chunk-b', item_id: 'item-1', page: 22 },
  ]

  it('matches by chunk_id', () => {
    expect(citationRefForSegment({ chunk_id: 'chunk-b' }, citations)).toBe('[Doc2]')
  })

  it('falls back to item_id + page when chunk_id is absent', () => {
    expect(citationRefForSegment({ item_id: 'item-1', page: 9 }, citations)).toBe('[Doc1]')
  })

  it('returns null for an uncited segment', () => {
    expect(citationRefForSegment({}, citations)).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(citationRefForSegment({ chunk_id: 'chunk-z' }, citations)).toBeNull()
  })
})

describe('sendMessage delta handling', () => {
  it('routes delta text to onDelta, never into the final content', async () => {
    scriptedEvents = [
      { event: 'delta', data: { text: 'The sky' } },
      { event: 'delta', data: { text: ' is blue' } },
      { event: 'answer', data: { text: 'The sky is blue.' } },
      { event: 'done', data: { duration_ms: 5 } },
    ]

    const onDelta = vi.fn()
    const onAnswer = vi.fn()

    const result = await sendMessage({
      chatId: 'c1',
      message: 'What color is the sky?',
      documents: ['doc1'],
      callbacks: { onDelta, onAnswer },
    })

    expect(onDelta).toHaveBeenNthCalledWith(1, 'The sky')
    expect(onDelta).toHaveBeenNthCalledWith(2, ' is blue')
    expect(onAnswer).toHaveBeenCalledWith('The sky is blue.')
    expect(result.content).toBe('The sky is blue.')
  })

  it('starts a new paragraph when consecutive answer segments cite different sources', async () => {
    // Regression: multi-fact answers (e.g. a meeting-minutes summary with
    // separate "topics"/"decisions"/"actions" segments, each citing a
    // different chunk) used to run on into one unreadable block, since
    // every answer segment was joined with a single space regardless of
    // whether it started a genuinely new fact.
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'citation', data: { doc_ref: '[Doc2]', chunk_id: 'c2', item_id: 'doc1', page: 2 } },
      {
        event: 'answer',
        data: { text: 'Topics discussed included X.', chunk_id: 'c1', item_id: 'doc1', page: 1 },
      },
      {
        event: 'answer',
        data: { text: 'Decisions made included Y.', chunk_id: 'c2', item_id: 'doc1', page: 2 },
      },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'Summarize the meeting.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toContain('\n\n')
    expect(result.content.indexOf('Decisions made')).toBeGreaterThan(
      result.content.indexOf('\n\n')
    )
  })

  it('keeps a segment-supplied single newline on a citation change outside a list', async () => {
    // Outside a list there is nothing to lazily continue, so the backend's
    // own soft line break between two sources is left as it arrived.
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'citation', data: { doc_ref: '[Doc2]', chunk_id: 'c2', item_id: 'doc1', page: 2 } },
      { event: 'answer', data: { text: 'Claim one.', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '\nClaim two.', chunk_id: 'c2', item_id: 'doc1', page: 2 } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'Summarize.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe('Claim one. [Doc1]\nClaim two. [Doc2]')
  })

  it('joins a mid-sentence citation-marker split as a continuation, not a new paragraph, when the next segment starts lowercase', async () => {
    // Live bug: rag-engine ends an `answer` segment at the inline [DocN]
    // marker, not at the sentence boundary, so "The minutes [Doc2]
    // document the framework but do not mention an approval process..."
    // arrives as "The minutes" (cited) + "document the framework but..."
    // (uncited) — a citation change with no sentence break at all.
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc2]', chunk_id: 'c2', item_id: 'doc1', page: 2 } },
      { event: 'answer', data: { text: 'The minutes', chunk_id: 'c2', item_id: 'doc1', page: 2 } },
      {
        event: 'answer',
        data: { text: 'document the framework but do not mention an approval process or approver.' },
      },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'Summarize.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe(
      'The minutes [Doc2] document the framework but do not mention an approval process or approver.',
    )
    expect(result.content).not.toContain('\n\n')
  })

  it('joins a citation-marker split as a continuation when the prior text has no sentence-ending punctuation, even if the next segment starts uppercase', async () => {
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'citation', data: { doc_ref: '[Doc2]', chunk_id: 'c2', item_id: 'doc1', page: 2 } },
      {
        event: 'answer',
        data: { text: 'The team discussed the new plan', chunk_id: 'c1', item_id: 'doc1', page: 1 },
      },
      {
        event: 'answer',
        data: { text: 'Which was well received.', chunk_id: 'c2', item_id: 'doc1', page: 2 },
      },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'Summarize.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe('The team discussed the new plan [Doc1] Which was well received. [Doc2]')
    expect(result.content).not.toContain('\n\n')
  })

  it('still starts a new paragraph for a genuinely new fact: citation changed, prior sentence terminated, next segment capitalized', async () => {
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'citation', data: { doc_ref: '[Doc2]', chunk_id: 'c2', item_id: 'doc1', page: 2 } },
      {
        event: 'answer',
        data: { text: 'The budget was approved.', chunk_id: 'c1', item_id: 'doc1', page: 1 },
      },
      {
        event: 'answer',
        data: { text: 'Staffing remains under review.', chunk_id: 'c2', item_id: 'doc1', page: 2 },
      },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'Summarize.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe(
      'The budget was approved. [Doc1]\n\nStaffing remains under review. [Doc2]',
    )
  })

  it('does not insert a paragraph break between consecutive segments citing the same source', async () => {
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      {
        event: 'answer',
        data: { text: 'The sky is blue', chunk_id: 'c1', item_id: 'doc1', page: 1 },
      },
      {
        event: 'answer',
        data: { text: ' during the day.', chunk_id: 'c1', item_id: 'doc1', page: 1 },
      },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'What color is the sky?',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).not.toContain('\n\n')
  })

  it('joins consecutive list-item answer segments with a newline, not a space', async () => {
    // Regression: rag-engine's AnswerSegmenter strips each segment's
    // leading whitespace, so a Markdown list ("- item one\n- item two")
    // arrives here as separate segments *without* the newline that
    // separated them on the wire ("- item one", "- item two"). Joining
    // them with the default single space ran the bullets onto one line
    // ("- item one - item two"), which no longer parses as a list.
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '- item one', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '- item two', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '- item three', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'List the items.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toContain('item one')
    expect(result.content).toContain('\n- item two')
    expect(result.content).toContain('\n- item three')
    expect(result.content).not.toContain(' - item two')
    expect(result.content).not.toContain(' - item three')
  })

  it('separates a list from preceding prose with a blank line, even across a citation change', async () => {
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc2]', chunk_id: 'c2', item_id: 'doc1', page: 2 } },
      { event: 'answer', data: { text: 'Here are the items:' } },
      { event: 'answer', data: { text: '- item one', chunk_id: 'c2', item_id: 'doc1', page: 2 } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'List the items.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe('Here are the items:\n\n- item one [Doc2]')
  })

  it('does not add a space before a segment that already starts with a newline', async () => {
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '- item one', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '\n- item two', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'List the items.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toContain('\n- item two')
    expect(result.content).not.toContain(' \n- item two')
    expect(result.content).not.toContain('\n\n- item two')
  })

  it('upgrades a single leading newline to a blank line when leaving a list for a non-list segment', async () => {
    // Regression: `alreadySeparated` used to short-circuit before the
    // "leaving a list needs a blank line" rule ever ran, so a paragraph
    // segment that happened to carry its own lone leading "\n" (and is
    // not itself a list-item continuation) only got that single "\n" —
    // which CommonMark folds into a lazy continuation of the previous
    // <li> instead of starting a new paragraph.
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '- item one', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '\nParagraph after' } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'List the items, then explain.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe('- item one [Doc1]\n\nParagraph after')
  })

  it('keeps a single newline between two list items even when the second is not itself the joined segment', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: '- item one' } },
      { event: 'answer', data: { text: '\n- item two' } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'List the items.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe('- item one\n- item two')
  })

  it('does not add an extra blank line when leaving a list and the segment already starts with one', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: '- item one' } },
      { event: 'answer', data: { text: '\n\nParagraph' } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'List the items, then explain.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe('- item one\n\nParagraph')
  })

  it('joins prose ending in a digit-and-period with the next sentence using a single space', async () => {
    // Regression guard for the list-marker heuristic: a segment ending in
    // e.g. "2021." must not make the *following* segment look like it's
    // continuing a list — only a segment that itself *starts* with a list
    // marker should ever trigger the newline logic.
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      {
        event: 'answer',
        data: { text: 'The organization was founded in 2021.', chunk_id: 'c1', item_id: 'doc1', page: 1 },
      },
      {
        event: 'answer',
        data: { text: 'It has grown steadily since.', chunk_id: 'c1', item_id: 'doc1', page: 1 },
      },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'When was it founded?',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe(
      'The organization was founded in 2021. [Doc1] It has grown steadily since. [Doc1]',
    )
  })

  it('does not treat a segment starting with a negative number ("-5 degrees") as a list item', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'The temperature dropped to' } },
      { event: 'answer', data: { text: '-5 degrees Celsius overnight.' } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'How cold did it get?',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe('The temperature dropped to -5 degrees Celsius overnight.')
  })

  it('does not treat a segment starting with a negative percentage ("-10%") as a list item', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'Revenue fell by' } },
      { event: 'answer', data: { text: '-10% year over year.' } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'How did revenue change?',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe('Revenue fell by -10% year over year.')
  })

  it('does not treat a segment starting with Markdown emphasis ("*emphasis*") as a bullet', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'The report says' } },
      { event: 'answer', data: { text: '*emphasis* matters here.' } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'What does the report emphasize?',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe('The report says *emphasis* matters here.')
  })

  it('reassembles an ordered list whose markers arrive as their own segments', async () => {
    // Observed live: rag-engine's AnswerSegmenter emitted the list marker
    // as a standalone segment, separate from its label text, with no
    // newline and no trailing space on either side: "1.", "Programme
    // Rationale", "2.", "Programme Educational Objectives", "3.", ...
    scriptedEvents = [
      { event: 'answer', data: { text: '1.' } },
      { event: 'answer', data: { text: 'Programme Rationale' } },
      { event: 'answer', data: { text: '2.' } },
      { event: 'answer', data: { text: 'Programme Educational Objectives' } },
      { event: 'answer', data: { text: '3.' } },
      { event: 'answer', data: { text: 'Programme Learning Outcomes' } },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'List the programme sections.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe(
      '1. Programme Rationale\n2. Programme Educational Objectives\n3. Programme Learning Outcomes',
    )
  })

  it('joins a cited bare list marker to its label with a single space, not a paragraph break', async () => {
    // Regression: a bare marker segment gets a citation appended the same
    // way a real item does ("1." -> "1. [Doc1]"), which on its own matches
    // the "list item with text" shape — without stripping the citation
    // first, that made the marker's OWN label segment look like it was
    // starting a new paragraph after an already-complete item, forcing a
    // spurious blank line between "1. [Doc1]" and "Programme Rationale
    // [Doc1]" (marker as a lone bullet, label as an orphan paragraph).
    scriptedEvents = [
      { event: 'citation', data: { doc_ref: '[Doc1]', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '1.', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: 'Programme Rationale', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      { event: 'answer', data: { text: '2.', chunk_id: 'c1', item_id: 'doc1', page: 1 } },
      {
        event: 'answer',
        data: { text: 'Programme Educational Objectives', chunk_id: 'c1', item_id: 'doc1', page: 1 },
      },
      { event: 'done', data: {} },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'List the programme sections.',
      documents: ['doc1'],
      callbacks: {},
    })

    expect(result.content).toBe(
      '1. [Doc1] Programme Rationale [Doc1]\n2. [Doc1] Programme Educational Objectives [Doc1]',
    )
  })

  it('ignores a delta event with no text field', async () => {
    scriptedEvents = [
      { event: 'delta', data: {} },
      { event: 'answer', data: { text: 'Answer.' } },
      { event: 'done', data: {} },
    ]

    const onDelta = vi.fn()

    await sendMessage({
      chatId: 'c1',
      message: 'q',
      documents: ['doc1'],
      callbacks: { onDelta },
    })

    expect(onDelta).not.toHaveBeenCalled()
  })

  it('includes tier on the query payload when provided', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'Done.' } },
      { event: 'done', data: {} },
    ]

    await sendMessage({
      chatId: 'c1',
      message: 'q',
      documents: ['doc1'],
      tier: 'accurate',
    })

    expect(apiPostStream).toHaveBeenCalledWith(
      '/query',
      {
        question: 'q',
        documents: ['doc1'],
        tier: 'accurate',
        conversation_id: 'c1',
      },
      true,
      undefined,
    )
  })

  it('omits tier from the query payload when not provided', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'Done.' } },
      { event: 'done', data: {} },
    ]

    await sendMessage({
      chatId: 'c1',
      message: 'q',
      documents: ['doc1'],
    })

    expect(apiPostStream).toHaveBeenCalledWith(
      '/query',
      {
        question: 'q',
        documents: ['doc1'],
        conversation_id: 'c1',
      },
      true,
      undefined,
    )
  })

  it('omits documents from the query payload when omitDocuments is set (shared chat, follower query)', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'Done.' } },
      { event: 'done', data: {} },
    ]

    await sendMessage({
      chatId: 'c1',
      message: 'q',
      documents: ['doc-9', 'doc-10'],
      omitDocuments: true,
    })

    expect(apiPostStream).toHaveBeenCalledWith(
      '/query',
      {
        question: 'q',
        conversation_id: 'c1',
      },
      true,
      undefined,
    )
  })

  it('omits conversation_id from the query payload when chatId is empty', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'Done.' } },
      { event: 'done', data: {} },
    ]

    await sendMessage({
      chatId: '',
      message: 'q',
      documents: ['doc1'],
    })

    expect(apiPostStream).toHaveBeenCalledWith(
      '/query',
      {
        question: 'q',
        documents: ['doc1'],
      },
      true,
      undefined,
    )
  })
})

describe('sendMessage error handling', () => {
  it('produces the permission-denied message for a 403 response from the query endpoint', async () => {
    vi.mocked(apiPostStream).mockRejectedValueOnce(new ApiError('Forbidden', 403))

    await expect(
      sendMessage({
        chatId: 'c1',
        message: 'q',
        documents: ['doc1'],
      }),
    ).rejects.toThrow(QUERY_PERMISSION_DENIED_ERROR)
  })
})

describe('sendMessage at_capacity handling', () => {
  it('fires onAtCapacity with the parsed payload and rejects with an AtCapacityError, never onError', async () => {
    scriptedEvents = [
      {
        event: 'error',
        data: { error: 'at_capacity', queued: 80, max_queue: 80, retry_after_seconds: 240 },
      },
    ]
    const onAtCapacity = vi.fn()
    const onError = vi.fn()

    const promise = sendMessage({
      chatId: 'c1',
      message: 'q',
      documents: ['doc1'],
      callbacks: { onAtCapacity, onError },
    })

    await expect(promise).rejects.toBeInstanceOf(AtCapacityError)
    expect(onAtCapacity).toHaveBeenCalledWith({ queued: 80, maxQueue: 80, retryAfterSeconds: 240 })
    expect(onError).not.toHaveBeenCalled()
  })

  it('drops a negative or non-numeric field instead of propagating garbage (defensive, never crash)', async () => {
    scriptedEvents = [
      {
        event: 'error',
        data: { error: 'at_capacity', queued: -1, max_queue: 'lots', retry_after_seconds: Number.NaN },
      },
    ]
    const onAtCapacity = vi.fn()

    await expect(
      sendMessage({
        chatId: 'c1',
        message: 'q',
        documents: ['doc1'],
        callbacks: { onAtCapacity },
      }),
    ).rejects.toBeInstanceOf(AtCapacityError)

    expect(onAtCapacity).toHaveBeenCalledWith({
      queued: undefined,
      maxQueue: undefined,
      retryAfterSeconds: undefined,
    })
  })

  it('still routes a differently-coded error event to onError as before, not onAtCapacity', async () => {
    scriptedEvents = [
      { event: 'error', data: { error: 'llm_transport_error', message: 'The model timed out.' } },
    ]
    const onAtCapacity = vi.fn()
    const onError = vi.fn()
    let caught: unknown

    try {
      await sendMessage({
        chatId: 'c1',
        message: 'q',
        documents: ['doc1'],
        callbacks: { onAtCapacity, onError },
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(Error)
    expect(caught).not.toBeInstanceOf(AtCapacityError)
    expect(onAtCapacity).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalled()
  })
})

describe('sendMessage progress forwarding', () => {
  it('forwards the full progress event payload (stage included) to onProgress', async () => {
    scriptedEvents = [
      { event: 'progress', data: { stage: 'retrieved', candidates: 3, distinct_items: 2 } },
      { event: 'answer', data: { text: 'Done.' } },
      { event: 'done', data: { duration_ms: 5 } },
    ]

    const onProgress = vi.fn()

    await sendMessage({
      chatId: 'c1',
      message: 'What is in the contract?',
      documents: ['doc1'],
      callbacks: { onProgress },
    })

    expect(onProgress).toHaveBeenCalledWith('retrieved', {
      stage: 'retrieved',
      candidates: 3,
      distinct_items: 2,
    })
  })

  it('forwards a nested "message" progress event payload the same way', async () => {
    scriptedEvents = [
      {
        event: 'message',
        data: { type: 'progress', stage: 'reranking', total: 4 },
      },
      { event: 'answer', data: { text: 'Done.' } },
      { event: 'done', data: { duration_ms: 5 } },
    ]

    const onProgress = vi.fn()

    await sendMessage({
      chatId: 'c1',
      message: 'What is in the contract?',
      documents: ['doc1'],
      callbacks: { onProgress },
    })

    expect(onProgress).toHaveBeenCalledWith('reranking', {
      type: 'progress',
      stage: 'reranking',
      total: 4,
    })
  })
})

describe('sendMessage abstention handling', () => {
  it('drops earlier citations, calls onAbstention, and returns no sources', async () => {
    scriptedEvents = [
      { event: 'citation', data: { citations: [{ document_id: 'doc-1', filename: 'A.pdf', page: 2 }] } },
      { event: 'abstention', data: { reason: 'no_relevant_content', message: "I couldn't find relevant content." } },
      { event: 'answer', data: { text: "I couldn't find relevant content." } },
      { event: 'done', data: { duration_ms: 5 } },
    ]

    const onAbstention = vi.fn()
    const onCitations = vi.fn()

    const result = await sendMessage({
      chatId: 'c1',
      message: 'Unrelated question',
      documents: ['doc1'],
      callbacks: { onAbstention, onCitations },
    })

    expect(onAbstention).toHaveBeenCalledWith({
      reason: 'no_relevant_content',
      message: "I couldn't find relevant content.",
    })
    expect(onCitations).toHaveBeenCalledTimes(1)
    expect(result.sources).toBeUndefined()
    expect(result.fileTags).toBeUndefined()
  })

  it('ignores any citation event that arrives after an abstention', async () => {
    scriptedEvents = [
      { event: 'abstention', data: { reason: 'no_relevant_content' } },
      {
        event: 'citation',
        data: { citations: [{ document_id: 'doc-1', filename: 'A.pdf', page: 2 }] },
      },
      { event: 'answer', data: { text: "I couldn't find relevant content." } },
      { event: 'done', data: { duration_ms: 5 } },
    ]

    const onCitations = vi.fn()

    const result = await sendMessage({
      chatId: 'c1',
      message: 'Unrelated question',
      documents: ['doc1'],
      callbacks: { onCitations },
    })

    expect(onCitations).not.toHaveBeenCalled()
    expect(result.sources).toBeUndefined()
  })

  it('drops already-streamed citations and calls onAbstention when only the done event flags abstained (streaming absence-assertion path, no abstention event)', async () => {
    scriptedEvents = [
      { event: 'citation', data: { citations: [{ document_id: 'doc-1', filename: 'A.pdf', page: 2 }] } },
      { event: 'answer', data: { text: 'The provided documents do not mention that.' } },
      { event: 'done', data: { duration_ms: 5, abstained: true, abstain_reason: 'absence_assertion' } },
    ]

    const onAbstention = vi.fn()
    const onCitations = vi.fn()

    const result = await sendMessage({
      chatId: 'c1',
      message: 'Unrelated question',
      documents: ['doc1'],
      callbacks: { onAbstention, onCitations },
    })

    expect(onAbstention).toHaveBeenCalledWith({ reason: 'absence_assertion' })
    expect(onCitations).toHaveBeenCalledTimes(1)
    expect(result.sources).toBeUndefined()
    expect(result.fileTags).toBeUndefined()
  })

  it('does not call onAbstention a second time when both an abstention event and a done.abstained=true arrive', async () => {
    scriptedEvents = [
      { event: 'abstention', data: { reason: 'no_relevant_content' } },
      { event: 'answer', data: { text: "I couldn't find relevant content." } },
      { event: 'done', data: { duration_ms: 5, abstained: true, abstain_reason: 'no_relevant_content' } },
    ]

    const onAbstention = vi.fn()

    await sendMessage({
      chatId: 'c1',
      message: 'Unrelated question',
      documents: ['doc1'],
      callbacks: { onAbstention },
    })

    expect(onAbstention).toHaveBeenCalledTimes(1)
  })

  it('leaves citations and sources untouched when the done event has no abstained field (older engine, backward compatible)', async () => {
    scriptedEvents = [
      { event: 'citation', data: { citations: [{ document_id: 'doc-1', filename: 'A.pdf', page: 2 }] } },
      { event: 'answer', data: { text: 'The answer is [Doc1].' } },
      { event: 'done', data: { duration_ms: 5 } },
    ]

    const onAbstention = vi.fn()

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
      callbacks: { onAbstention },
    })

    expect(onAbstention).not.toHaveBeenCalled()
    expect(result.sources).toHaveLength(1)
  })

  it('leaves citations untouched when done.abstained is explicitly false', async () => {
    scriptedEvents = [
      { event: 'citation', data: { citations: [{ document_id: 'doc-1', filename: 'A.pdf', page: 2 }] } },
      { event: 'answer', data: { text: 'The answer is [Doc1].' } },
      { event: 'done', data: { duration_ms: 5, abstained: false, abstain_reason: null } },
    ]

    const onAbstention = vi.fn()

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
      callbacks: { onAbstention },
    })

    expect(onAbstention).not.toHaveBeenCalled()
    expect(result.sources).toHaveLength(1)
  })
})

describe('sendMessage final_answer handling', () => {
  it('replaces the returned content with final_answer when present and different', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'The draft answer, still rough.' } },
      {
        event: 'done',
        data: { duration_ms: 5, final_answer: 'The final, normalised answer.' },
      },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
    })

    expect(result.content).toBe('The final, normalised answer.')
  })

  it('keeps the streamed content when final_answer is absent (older engine, backward compatible)', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'The streamed answer.' } },
      { event: 'done', data: { duration_ms: 5 } },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
    })

    expect(result.content).toBe('The streamed answer.')
  })

  it('keeps the streamed content when final_answer is an empty string', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'The streamed answer.' } },
      { event: 'done', data: { duration_ms: 5, final_answer: '' } },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
    })

    expect(result.content).toBe('The streamed answer.')
  })

  it('is a no-op when final_answer matches the already-assembled content', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'Same either way.' } },
      { event: 'done', data: { duration_ms: 5, final_answer: 'Same either way.' } },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
    })

    expect(result.content).toBe('Same either way.')
  })

  it('keeps the streamed content when final_answer is whitespace-only (review fix: never blank a good answer)', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'A perfectly good streamed answer.' } },
      { event: 'done', data: { duration_ms: 5, final_answer: '   ' } },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
    })

    expect(result.content).toBe('A perfectly good streamed answer.')
  })

  it('is a no-op when final_answer matches the assembled content modulo surrounding whitespace', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'Same either way.' } },
      { event: 'done', data: { duration_ms: 5, final_answer: '  Same either way.  ' } },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
    })

    expect(result.content).toBe('Same either way.')
  })

  it('still applies the abstained done-event handling when final_answer is also present', async () => {
    scriptedEvents = [
      { event: 'citation', data: { citations: [{ document_id: 'doc-1', filename: 'A.pdf', page: 2 }] } },
      { event: 'answer', data: { text: 'The provided documents do not mention that.' } },
      {
        event: 'done',
        data: {
          duration_ms: 5,
          abstained: true,
          abstain_reason: 'absence_assertion',
          final_answer: "I couldn't find relevant content.",
        },
      },
    ]

    const onAbstention = vi.fn()

    const result = await sendMessage({
      chatId: 'c1',
      message: 'Unrelated question',
      documents: ['doc1'],
      callbacks: { onAbstention },
    })

    expect(onAbstention).toHaveBeenCalledWith({ reason: 'absence_assertion' })
    expect(result.content).toBe("I couldn't find relevant content.")
    expect(result.sources).toBeUndefined()
  })
})

describe('sendMessage message_id handling (Item 3)', () => {
  it("uses the done event's message_id as the returned messageId when present", async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'The answer.' } },
      { event: 'done', data: { duration_ms: 5, message_id: 'persisted-msg-1' } },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
    })

    expect(result.messageId).toBe('persisted-msg-1')
  })

  it('falls back to a fresh client-generated id when message_id is absent (older adapter, backward compatible)', async () => {
    scriptedEvents = [
      { event: 'answer', data: { text: 'The answer.' } },
      { event: 'done', data: { duration_ms: 5 } },
    ]

    const result = await sendMessage({
      chatId: 'c1',
      message: 'A question',
      documents: ['doc1'],
    })

    expect(typeof result.messageId).toBe('string')
    expect(result.messageId.length).toBeGreaterThan(0)
  })
})
