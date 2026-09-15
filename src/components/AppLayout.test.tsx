import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import React, { useState } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import type {
  DocumentCategorizeResponse,
  MqaMetadataResponse,
  QueryScopeResponse,
} from '../api/types/browse'
import type { SendMessageRequest, SendMessageResponse } from '../api/types/query'

const validateQueryScope = vi.fn<
  (documents: string[], signal?: AbortSignal) => Promise<QueryScopeResponse>
>()
const extractMqaMetadata = vi.fn<
  (documentId: string, signal?: AbortSignal) => Promise<MqaMetadataResponse>
>()
const categorizeDocument = vi.fn<
  (documentId: string, signal?: AbortSignal) => Promise<DocumentCategorizeResponse>
>()

vi.mock('../api/browse', () => ({
  validateQueryScope: (...args: [string[], AbortSignal?]) => validateQueryScope(...args),
  fetchDocumentSummary: vi.fn(),
  extractMqaMetadata: (...args: [string, AbortSignal?]) => extractMqaMetadata(...args),
  categorizeDocument: (...args: [string, AbortSignal?]) => categorizeDocument(...args),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: 'user-1', username: 'tester' },
    isLoading: false,
  }),
}))

vi.mock('../hooks/useBrowseTree', () => ({
  useBrowseTree: () => ({
    sessionExpired: false,
    username: 'tester',
    getFolderNode: () => undefined,
  }),
}))

function defaultDocumentMeta() {
  return new Map([
    [
      'doc-1',
      {
        document_id: 'doc-1',
        filename: 'doc-1.pdf',
        file_type: 'pdf',
        updated_at: '2026-09-13T00:00:00Z',
        folder_id: 1,
        indexing_status: 'READY',
        rag_document_id: 'rag-1',
        queryable: true,
        summary_status: 'READY',
      },
    ],
  ])
}

// Mutable, test-configurable seed for the mocked useDocumentSelection —
// read only at mount (mirrors the real hook reading localStorage once).
// Reset in each describe block's beforeEach; a test that needs a different
// starting selection (e.g. the hydration-trim test) reassigns these before
// calling render().
let initialSelectedIds = new Set(['doc-1'])
let initialDocumentMeta: Map<string, Record<string, unknown>> = defaultDocumentMeta()
const trimSelectionSpy = vi.fn<(ids: string[]) => void>()

vi.mock('../hooks/useDocumentSelection', () => ({
  useDocumentSelection: () => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => initialSelectedIds)
    const documentMeta = initialDocumentMeta
    return {
      selectedIds,
      selectedCount: selectedIds.size,
      selectedFilenames: [...selectedIds].map(
        (id) => (documentMeta.get(id)?.filename as string | undefined) ?? `Document ${id}`,
      ),
      documentMeta,
      registerDocuments: vi.fn(),
      toggleDocument: vi.fn(),
      setSelection: vi.fn(),
      mergeSelection: vi.fn(),
      selectAllSelectable: vi.fn(),
      autoSelectIfPending: vi.fn(),
      deselectAllInView: vi.fn(),
      clearSelection: vi.fn(),
      trimSelection: (ids: string[]) => {
        trimSelectionSpy(ids)
        const next = new Set(ids)
        setSelectedIds(next)
        return next
      },
    }
  },
}))

// A minimal, controllable stand-in for react-query's useMutation: mutateAsync
// never resolves on its own (modeling a genuinely in-flight stream) and only
// settles by rejecting once the caller's AbortSignal fires. `reset`
// synchronously flips `isPending` back to false, exactly like the real hook.
let currentSignal: AbortSignal | null = null

vi.mock('../hooks/mutations/useSendQuery', () => ({
  useSendQuery: () => {
    const [isPending, setIsPending] = useState(false)
    return {
      isPending,
      reset: () => setIsPending(false),
      mutateAsync: (request: SendMessageRequest) =>
        new Promise<SendMessageResponse>((_resolve, reject) => {
          setIsPending(true)
          currentSignal = request.signal ?? null
          request.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    }
  },
}))

vi.mock('./Sidebar', () => ({
  default: (props: {
    sessions: { id: string; title: string }[]
    onNewChat: () => void
    onSelectChat: (id: string) => void
  }) => (
    <div>
      <button type="button" onClick={props.onNewChat}>
        New chat
      </button>
      {props.sessions.map((s) => (
        <button key={s.id} type="button" onClick={() => props.onSelectChat(s.id)}>
          select:{s.title || s.id}
        </button>
      ))}
    </div>
  ),
}))

// Imported after the mocks above so AppLayout picks up the mocked modules.
const { default: AppLayout } = await import('./AppLayout')

// AppLayout renders antd Tooltip/Dropdown popups (rc-trigger), which measure
// the scrollbar via getComputedStyle(el, '::-webkit-scrollbar') when a popup
// opens or repositions. jsdom has no implementation for the pseudo-element
// overload, and a popup's own close/measure cycle can still be in flight
// when a test's assertions finish and testing-library unmounts it — so the
// "Not implemented" console error prints non-deterministically, after the
// test that triggered it has already completed. Delegate to the real
// getComputedStyle for the normal (no pseudo-element) case and return an
// empty style for the pseudo-element case, exactly like a browser without a
// visible scrollbar would report — this only changes what the test
// environment answers, not any AppLayout production behaviour.
let getComputedStyleSpy: ReturnType<typeof vi.spyOn>

beforeAll(() => {
  const realGetComputedStyle = window.getComputedStyle.bind(window)
  getComputedStyleSpy = vi
    .spyOn(window, 'getComputedStyle')
    .mockImplementation((elt: Element, pseudoElt?: string | null) =>
      pseudoElt ? ({} as CSSStyleDeclaration) : realGetComputedStyle(elt),
    )
})

afterAll(() => {
  getComputedStyleSpy.mockRestore()
})

describe('AppLayout — abort on New chat / select chat while streaming', () => {
  beforeEach(() => {
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
    validateQueryScope.mockResolvedValue({
      total_files: 1,
      ready_files: 1,
      indexing_files: 0,
      failed_files: 0,
      missing_files: 0,
      accessible_document_ids: ['doc-1'],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('aborts the in-flight request, resets the composer immediately, and marks the old chat interrupted', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // The fake stream is now in flight: composer shows Stop, not Send.
    await screen.findByRole('button', { name: 'Stop response' })
    expect(currentSignal?.aborted).toBe(false)

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    // Aborted, and the composer resets to idle immediately — no need to
    // wait for the aborted fetch promise to settle.
    expect(currentSignal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()

    // Let the rejected mutateAsync promise actually settle so React has
    // fully processed the abort's rejection (no unhandled state left).
    await act(async () => {
      await Promise.resolve()
    })

    // Switch back to the old chat (now the second entry) to see its history.
    const oldChatButtons = screen.getAllByRole('button', { name: /^select:/ })
    await user.click(oldChatButtons[oldChatButtons.length - 1])

    expect(await screen.findByText('Answer interrupted.')).toBeInTheDocument()
    expect(screen.getByText('What is in the contract?')).toBeInTheDocument()
  })

  it('aborts the in-flight request when selecting a different history entry mid-stream', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    // Create a second chat to select into while the first one is streaming.
    await user.click(screen.getByRole('button', { name: 'New chat' }))

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'Second question')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByRole('button', { name: 'Stop response' })

    const chatButtons = screen.getAllByRole('button', { name: /^select:/ })
    // Select the OTHER chat (not the one currently streaming).
    await user.click(chatButtons[chatButtons.length - 1])

    expect(currentSignal?.aborted).toBe(true)
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()
  })
})

describe('AppLayout — Extract metadata', () => {
  beforeEach(() => {
    // Each test mounts its own AppLayout: without this, chat history
    // persisted to localStorage by a previous test's session(s) would be
    // loaded back in, accumulating sidebar entries across tests.
    window.localStorage.clear()
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
    validateQueryScope.mockResolvedValue({
      total_files: 1,
      ready_files: 1,
      indexing_files: 0,
      failed_files: 0,
      missing_files: 0,
      accessible_document_ids: ['doc-1'],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the thinking placeholder, then renders the metadata table on success', async () => {
    const user = userEvent.setup()
    let resolveExtract: ((value: MqaMetadataResponse) => void) | undefined
    extractMqaMetadata.mockImplementation(
      () =>
        new Promise<MqaMetadataResponse>((resolve) => {
          resolveExtract = resolve
        }),
    )

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Extract MQA metadata' }))

    expect(screen.getByText('Extract MQA metadata from doc-1.pdf')).toBeInTheDocument()
    expect(
      screen.getByText('Extracting metadata… this can take up to a minute.'),
    ).toBeInTheDocument()

    await act(async () => {
      resolveExtract?.({
        document_id: 'doc-1',
        filename: 'doc-1.pdf',
        fields: {
          'Document Title': 'Meeting Minutes',
          Faculty: 'Not stated',
          'Programme name and code': 'Not stated',
          'Academic year': 'Not stated',
          'Accreditation body': 'Not stated',
          'Programme Coordinator': 'Not stated',
        },
        comment: 'Arche AI extracted metadata — Document Title: Meeting Minutes; ...',
        pushed: true,
        push_error: null,
      })
      await Promise.resolve()
    })

    expect(await screen.findByText('MQA metadata — doc-1.pdf')).toBeInTheDocument()
    expect(screen.getByText('Meeting Minutes')).toBeInTheDocument()
    expect(screen.getByText('Saved to LogicalDOC as extended properties.')).toBeInTheDocument()
    expect(
      screen.queryByText('Extracting metadata… this can take up to a minute.'),
    ).not.toBeInTheDocument()
  })

  it('removes the placeholder and re-enables the button on a contract error', async () => {
    const user = userEvent.setup()
    let rejectExtract: ((err: unknown) => void) | undefined
    extractMqaMetadata.mockImplementation(
      () =>
        new Promise<MqaMetadataResponse>((_resolve, reject) => {
          rejectExtract = reject
        }),
    )

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Extract MQA metadata' }))
    expect(
      await screen.findByText('Extracting metadata… this can take up to a minute.'),
    ).toBeInTheDocument()

    await act(async () => {
      rejectExtract?.(
        new ApiError(
          'Document is not ready for extraction.',
          409,
          'Document is not ready for extraction.',
        ),
      )
      await Promise.resolve()
    })

    // The thinking placeholder is gone, no answer was appended, and the
    // user's request line is left in place.
    expect(
      screen.queryByText('Extracting metadata… this can take up to a minute.'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Extract MQA metadata from doc-1.pdf')).toBeInTheDocument()
    expect(screen.queryByText(/MQA metadata —/)).not.toBeInTheDocument()

    // The composer is idle again — the button is enabled once more.
    expect(await screen.findByRole('button', { name: 'Extract MQA metadata' })).toBeEnabled()
  })

  it('aborts an in-flight extraction on New chat and marks it interrupted', async () => {
    const user = userEvent.setup()
    extractMqaMetadata.mockImplementation(() => new Promise<MqaMetadataResponse>(() => {}))

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Extract MQA metadata' }))
    expect(
      await screen.findByText('Extracting metadata… this can take up to a minute.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    const oldChatButtons = screen.getAllByRole('button', { name: /^select:/ })
    await user.click(oldChatButtons[oldChatButtons.length - 1])

    expect(await screen.findByText('Answer interrupted.')).toBeInTheDocument()
    expect(screen.getByText('Extract MQA metadata from doc-1.pdf')).toBeInTheDocument()
  })
})

describe('AppLayout — Categorize', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
    validateQueryScope.mockResolvedValue({
      total_files: 1,
      ready_files: 1,
      indexing_files: 0,
      failed_files: 0,
      missing_files: 0,
      accessible_document_ids: ['doc-1'],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function matchedResponse(
    overrides: Partial<DocumentCategorizeResponse> = {},
  ): DocumentCategorizeResponse {
    return {
      document_id: 'doc-1',
      filename: 'doc-1.pdf',
      folder_id: 4,
      folder_name: 'Minutes',
      category: 'Approved',
      abstained: false,
      target_folder_id: 9,
      confidence: 0.9,
      reasoning: 'Signed and dated approval record.',
      candidates: [
        { folder_id: 9, name: 'Approved' },
        { folder_id: 10, name: 'Draft' },
      ],
      latency_ms: 800,
      ...overrides,
    }
  }

  it('appends the user request and the suggested-folder answer on success', async () => {
    const user = userEvent.setup()
    categorizeDocument.mockResolvedValueOnce(matchedResponse())

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Categorize selected document' }))

    expect(await screen.findByText('Categorize "doc-1.pdf"')).toBeInTheDocument()
    expect(
      await screen.findByText((_, element) => element?.textContent === 'Suggested folder: Approved'),
    ).toBeInTheDocument()
    expect(screen.getByText('Confidence: 90%')).toBeInTheDocument()
    expect(categorizeDocument).toHaveBeenCalledWith('doc-1')
  })

  it('appends a single assistant message with the server text on a 409 leaf-folder error, never a fatal screen', async () => {
    const user = userEvent.setup()
    categorizeDocument.mockRejectedValueOnce(
      new ApiError(
        'This folder has no subfolders to categorize into.',
        409,
        'This folder has no subfolders to categorize into.',
        'leaf_folder',
      ),
    )

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Categorize selected document' }))

    expect(
      await screen.findByText('This folder has no subfolders to categorize into.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Suggested folder:/)).not.toBeInTheDocument()

    // The composer is idle again — the button is enabled once more, and
    // nothing crashed the page.
    expect(
      await screen.findByRole('button', { name: 'Categorize selected document' }),
    ).toBeEnabled()
  })

  it('falls back to a fixed message on a 404 with no server message, still never a fatal screen', async () => {
    const user = userEvent.setup()
    categorizeDocument.mockRejectedValueOnce(new ApiError('feature_disabled', 404, undefined, 'feature_disabled'))

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Categorize selected document' }))

    expect(await screen.findByText('Categorize "doc-1.pdf"')).toBeInTheDocument()
    // The raw error code is never shown verbatim as the message text.
    expect(screen.queryByText('feature_disabled')).not.toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Categorize selected document' }),
    ).toBeEnabled()
  })
})

describe('AppLayout — selection hydration trim', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    trimSelectionSpy.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('trims a persisted selection against the backend once a session is present', async () => {
    initialSelectedIds = new Set(['5001', '300'])
    initialDocumentMeta = new Map([
      [
        '300',
        {
          document_id: '300',
          filename: '300.pdf',
          file_type: 'pdf',
          updated_at: '2026-09-13T00:00:00Z',
          folder_id: 1,
          indexing_status: 'READY',
          rag_document_id: 'rag-300',
          queryable: true,
          summary_status: 'READY',
        },
      ],
    ])
    validateQueryScope.mockResolvedValue({
      total_files: 1,
      ready_files: 1,
      indexing_files: 0,
      failed_files: 0,
      missing_files: 0,
      accessible_document_ids: ['300'],
    })

    render(<AppLayout />)

    // The composer's file-count badge reflects the trimmed selection —
    // 2 selected ids down to 1 once the backend says only '300' is
    // accessible.
    await screen.findByLabelText('1 file selected')

    expect(validateQueryScope).toHaveBeenCalledWith(
      expect.arrayContaining(['5001', '300']),
      expect.anything(),
    )
    expect(trimSelectionSpy).toHaveBeenCalledWith(['300'])
  })

  it('still applies the trim exactly once under React StrictMode (mount, effect, cleanup, effect again)', async () => {
    initialSelectedIds = new Set(['5001', '300'])
    initialDocumentMeta = new Map([
      [
        '300',
        {
          document_id: '300',
          filename: '300.pdf',
          file_type: 'pdf',
          updated_at: '2026-09-13T00:00:00Z',
          folder_id: 1,
          indexing_status: 'READY',
          rag_document_id: 'rag-300',
          queryable: true,
          summary_status: 'READY',
        },
      ],
    ])
    validateQueryScope.mockResolvedValue({
      total_files: 1,
      ready_files: 1,
      indexing_files: 0,
      failed_files: 0,
      missing_files: 0,
      accessible_document_ids: ['300'],
    })

    // React.StrictMode (dev only) double-invokes effects synchronously on
    // mount: mount -> run effect -> run its cleanup -> run effect again,
    // all before any awaited work settles. If the hydration effect marked
    // itself "done" before the request resolved, the cleanup's abort would
    // kill the only request that ever ran and the second invocation would
    // skip retrying — the fix under test is that "done" is only set on an
    // attempt that actually completes, so the first (aborted) attempt is a
    // no-op and the second one applies the trim exactly once.
    render(
      <React.StrictMode>
        <AppLayout />
      </React.StrictMode>,
    )

    await screen.findByLabelText('1 file selected')

    expect(trimSelectionSpy).toHaveBeenCalledTimes(1)
    expect(trimSelectionSpy).toHaveBeenCalledWith(['300'])
  })

  it('retries after an unmount + remount so a real interruption is not left permanently un-applied', async () => {
    initialSelectedIds = new Set(['5001', '300'])
    initialDocumentMeta = new Map([
      [
        '300',
        {
          document_id: '300',
          filename: '300.pdf',
          file_type: 'pdf',
          updated_at: '2026-09-13T00:00:00Z',
          folder_id: 1,
          indexing_status: 'READY',
          rag_document_id: 'rag-300',
          queryable: true,
          summary_status: 'READY',
        },
      ],
    ])

    let resolveFirst: ((value: QueryScopeResponse) => void) | undefined
    validateQueryScope.mockImplementationOnce(
      () =>
        new Promise<QueryScopeResponse>((resolve) => {
          resolveFirst = resolve
        }),
    )
    validateQueryScope.mockResolvedValueOnce({
      total_files: 1,
      ready_files: 1,
      indexing_files: 0,
      failed_files: 0,
      missing_files: 0,
      accessible_document_ids: ['300'],
    })

    const view = render(<AppLayout />)
    // Unmount before the first request ever resolves — a genuine
    // interruption, not just a StrictMode remount.
    view.unmount()
    resolveFirst?.({
      total_files: 1,
      ready_files: 1,
      indexing_files: 0,
      failed_files: 0,
      missing_files: 0,
      accessible_document_ids: ['300'],
    })
    expect(trimSelectionSpy).not.toHaveBeenCalled()

    // A fresh mount (fresh refs) must still try the reconciliation rather
    // than having been silently marked "done" by the interrupted attempt.
    render(<AppLayout />)
    await screen.findByLabelText('1 file selected')
    expect(trimSelectionSpy).toHaveBeenCalledTimes(1)
    expect(trimSelectionSpy).toHaveBeenCalledWith(['300'])
  })
})

describe('AppLayout — dated session names', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('names a fresh session "Session <date> (1)" and a second one the same day "(2)"', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    // Only the initial session exists so far.
    const initialButtons = screen.getAllByRole('button', { name: /^select:/ })
    expect(initialButtons).toHaveLength(1)
    const match = initialButtons[0].textContent?.match(
      /^select:Session (\d{1,2} [A-Z][a-z]{2} \d{4}) \(1\)$/,
    )
    expect(match).not.toBeNull()
    const datePart = match?.[1]

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    const buttons = screen.getAllByRole('button', { name: /^select:/ })
    expect(buttons).toHaveLength(2)
    const titles = buttons.map((b) => b.textContent)
    expect(titles).toContain(`select:Session ${datePart} (1)`)
    expect(titles).toContain(`select:Session ${datePart} (2)`)
  })

  it('does not overwrite the dated title with the first question while a reply is in flight', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    const initialTitle = screen.getByRole('button', { name: /^select:/ }).textContent

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await screen.findByRole('button', { name: 'Stop response' })

    // The sidebar title is unchanged by sending a question — it was only
    // ever overwritten (with the question text) once a reply completed,
    // and dated titles are never overwritten at all now.
    expect(screen.getByRole('button', { name: /^select:/ }).textContent).toBe(initialTitle)
  })
})

/** A minimal, controllable `MediaQueryList` stand-in — see
 * `src/hooks/useMediaQuery.test.ts` for the same shape used to unit-test
 * the hook directly. Here it drives AppLayout's own narrow/wide branching
 * end to end through `window.matchMedia`. */
function mockMediaQueryList(matches: boolean) {
  return {
    matches,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList
}

describe('AppLayout — responsive layout', () => {
  // Restoring *only* this test's own matchMedia spy (rather than
  // `vi.restoreAllMocks()`) matters here: the file-level `beforeAll` above
  // installs a `getComputedStyle` spy for the whole suite (antd popups
  // measuring a pseudo-element jsdom can't compute), and
  // `restoreAllMocks()` would tear that down the moment this block's first
  // test finishes, reviving the real jsdom implementation — which is
  // exactly what throws "Not implemented" for every test after it.
  let matchMediaSpy: ReturnType<typeof vi.spyOn> | undefined

  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
  })

  afterEach(() => {
    matchMediaSpy?.mockRestore()
    matchMediaSpy = undefined
  })

  it('shows a slim top bar and no resize handle below 768px', async () => {
    matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))

    render(<AppLayout />)

    // `findBy` (rather than `getBy`) gives AppLayout's own async effects
    // (session/selection hydration) a chance to settle within `act` before
    // asserting — every other test in this file does the same via
    // `await user.click`/`await screen.findBy...`; this is the first fully
    // synchronous render in the file, which is exactly what would surface
    // an un-awaited update as a stray "not wrapped in act" warning.
    expect(await screen.findByLabelText('Open menu')).toBeInTheDocument()
    expect(screen.getByText('ARCHE AI')).toBeInTheDocument()
    expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the drawer from the hamburger button, revealing the sidebar', async () => {
    matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))
    const user = userEvent.setup()

    render(<AppLayout />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Open menu'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
  })

  it('shows a visible close button in the drawer, and closes it on click — not just the mask/Escape', async () => {
    matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(true))
    const user = userEvent.setup()

    render(<AppLayout />)

    await user.click(screen.getByLabelText('Open menu'))
    await screen.findByRole('dialog')

    const closeButton = await screen.findByRole('button', { name: 'Close menu' })
    expect(closeButton).toBeInTheDocument()

    await user.click(closeButton)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('shows the sidebar and resize handle directly, with no top bar, at desktop widths', async () => {
    matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue(mockMediaQueryList(false))

    render(<AppLayout />)

    expect(await screen.findByRole('separator', { name: 'Resize sidebar' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Open menu')).not.toBeInTheDocument()
    expect(screen.queryByText('ARCHE AI')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
  })
})

describe('.docu-mobile-topbar-menu CSS contract', () => {
  it('declares font-size, color and margin, since antd resets these on <button> and jsdom cannot compute the cascade to catch a regression here', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')
    const match = css.match(/\.docu-mobile-topbar-menu\s*\{([^}]*)\}/)

    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).toMatch(/font-size\s*:/)
    expect(body).toMatch(/color\s*:/)
    expect(body).toMatch(/margin\s*:/)
  })

  it('is not nested inside an @layer block, since antd\'s reset.css is unlayered and anything inside @layer loses to it regardless of specificity', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    const selectorIndex = css.indexOf('.docu-mobile-topbar-menu')
    expect(selectorIndex).toBeGreaterThan(-1)

    let depth = 0
    for (let i = 0; i < selectorIndex; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    expect(depth).toBe(0)
  })
})

describe('.docu-mobile-drawer-close CSS contract', () => {
  it('declares font-size, color and margin, since antd resets these on <button> and jsdom cannot compute the cascade to catch a regression here', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')
    const match = css.match(/\.docu-mobile-drawer-close\s*\{([^}]*)\}/)

    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).toMatch(/font-size\s*:/)
    expect(body).toMatch(/color\s*:/)
    expect(body).toMatch(/margin\s*:/)
  })

  it('is not nested inside an @layer block, since antd\'s reset.css is unlayered and anything inside @layer loses to it regardless of specificity', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    const selectorIndex = css.indexOf('.docu-mobile-drawer-close')
    expect(selectorIndex).toBeGreaterThan(-1)

    let depth = 0
    for (let i = 0; i < selectorIndex; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
    }
    expect(depth).toBe(0)
  })
})
