import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from 'antd'
import type { MessageInstance } from 'antd/es/message/interface'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import React, { type ReactElement, useState } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import type {
  DocumentCategorizeResponse,
  MetadataExtractionResponse,
  QueryScopeResponse,
} from '../api/types/browse'
import type { SendMessageRequest, SendMessageResponse } from '../api/types/query'

// AppLayout.tsx reads `message` via `App.useApp()` (P1-4, UI polish pass)
// instead of the static antd import this file used to spy on — outside a
// real `<App>` provider that resolves to the context default `{}`, and
// `{}.error(...)` throws. Every `render(<AppLayout />)` in this file wraps
// it in a real `<App>` so those calls resolve to working functions.
// `capturedMessageApi` is that same real instance, captured for the one
// test below that asserts a warning toast fired — spying on the static
// `antd` import (as this file used to) spies on a different object than
// the one AppLayout actually calls through App.useApp().
let capturedMessageApi: MessageInstance | undefined

function MessageCapture() {
  const { message } = App.useApp()
  capturedMessageApi = message
  return null
}

function render(ui: ReactElement) {
  return rtlRender(
    <App>
      <MessageCapture />
      {ui}
    </App>,
  )
}

const validateQueryScope = vi.fn<
  (documents: string[], signal?: AbortSignal) => Promise<QueryScopeResponse>
>()
const extractMetadata = vi.fn<
  (documentId: string, signal?: AbortSignal) => Promise<MetadataExtractionResponse>
>()
const categorizeDocument = vi.fn<
  (documentId: string, signal?: AbortSignal) => Promise<DocumentCategorizeResponse>
>()

const fetchDocumentSummary = vi.fn()
const postChatMessage = vi.fn().mockResolvedValue(undefined)
const getSharedChatSession = vi.fn().mockRejectedValue(new Error('not found'))
const listChatSessions = vi.fn().mockResolvedValue({ sessions: [], shared: [] })
const getChatSession = vi.fn().mockResolvedValue({})
const createChatSession = vi.fn().mockResolvedValue({})

vi.mock('../api/browse', () => ({
  validateQueryScope: (...args: [string[], AbortSignal?]) => validateQueryScope(...args),
  fetchDocumentSummary: (...args: [string]) => fetchDocumentSummary(...args),
  extractMetadata: (...args: [string, AbortSignal?]) => extractMetadata(...args),
  categorizeDocument: (...args: [string, AbortSignal?]) => categorizeDocument(...args),
}))

// Persistence follow-up: Summarize/Categorize/Extract-metadata turns are
// posted to the server through the same `postChatMessage` helper handleSend
// uses (see useChatStore.ts). Mocked here so those flows never hit real
// `fetch`, and so tests can assert the assistant content that got persisted.
vi.mock('../api/chat', () => ({
  listChatSessions: (...args: []) => listChatSessions(...args),
  listChatProjects: vi.fn().mockResolvedValue([]),
  createChatProject: vi.fn().mockResolvedValue({ id: 'p1', name: 'p1' }),
  renameChatProject: vi.fn().mockResolvedValue({ id: 'p1', name: 'p1' }),
  deleteChatProject: vi.fn().mockResolvedValue(undefined),
  createChatSession: (...args: [{ id: string; title: string }]) => createChatSession(...args),
  getChatSession: (...args: [string]) => getChatSession(...args),
  patchChatSession: vi.fn().mockResolvedValue({}),
  deleteChatSession: vi.fn().mockResolvedValue(undefined),
  postChatMessage: (...args: unknown[]) => postChatMessage(...args),
  getSharedChatSession: (...args: [string]) => getSharedChatSession(...args),
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
      removeSelection: vi.fn(),
      selectAllSelectable: vi.fn(),
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
let lastSendQueryRequest: SendMessageRequest | null = null
// Test-controlled: when set, the next mutateAsync call rejects with this
// immediately instead of only settling on abort — models a query call that
// fails outright (e.g. a 403 before any streaming starts). Consumed once.
let nextSendQueryRejection: unknown = null
// Test-controlled, same one-shot pattern as `nextSendQueryRejection`: when
// set, the next mutateAsync call resolves with this immediately instead of
// hanging until abort — models a query that actually completes, for tests
// that need the success path (e.g. the post-answer shared-chat refresh).
let nextSendQueryResolution: SendMessageResponse | null = null
// Item 4: every call this mock has seen that hasn't settled yet, so a test
// with TWO chats streaming at once (e.g. one per chat id) can resolve/abort
// each independently instead of only ever controlling "the last call" via
// `currentSignal`/`lastSendQueryRequest` above (still kept, and still
// updated on every call, for every existing single-request test).
interface PendingSendQueryCall {
  request: SendMessageRequest
  resolve: (response: SendMessageResponse) => void
  reject: (err: unknown) => void
}
let pendingSendQueryCalls: PendingSendQueryCall[] = []

function resolvePendingSendQueryFor(chatId: string | undefined, response: SendMessageResponse) {
  const idx = pendingSendQueryCalls.findIndex((c) => c.request.chatId === chatId)
  if (idx === -1) throw new Error(`No pending sendQuery call for chat ${chatId}`)
  const [call] = pendingSendQueryCalls.splice(idx, 1)
  call.resolve(response)
}

vi.mock('../hooks/mutations/useSendQuery', () => ({
  useSendQuery: () => {
    const [isPending, setIsPending] = useState(false)
    return {
      isPending,
      reset: () => setIsPending(false),
      mutateAsync: (request: SendMessageRequest) =>
        new Promise<SendMessageResponse>((resolve, reject) => {
          setIsPending(true)
          currentSignal = request.signal ?? null
          lastSendQueryRequest = request
          const settle = (fn: () => void) => {
            pendingSendQueryCalls = pendingSendQueryCalls.filter((c) => c.request !== request)
            fn()
          }
          pendingSendQueryCalls.push({
            request,
            resolve: (res) => settle(() => resolve(res)),
            reject: (err) => settle(() => reject(err)),
          })
          if (nextSendQueryRejection) {
            const err = nextSendQueryRejection
            nextSendQueryRejection = null
            settle(() => reject(err))
            return
          }
          if (nextSendQueryResolution) {
            const res = nextSendQueryResolution
            nextSendQueryResolution = null
            settle(() => resolve(res))
            return
          }
          request.signal?.addEventListener('abort', () => {
            settle(() => reject(new DOMException('Aborted', 'AbortError')))
          })
        }),
    }
  },
}))

vi.mock('./Sidebar', () => ({
  default: (props: {
    sessions: { id: string; title: string }[]
    sharedSessions?: { id: string; title: string }[]
    activeChatId?: string
    isLoading?: boolean
    onNewChat: () => void
    onSelectChat: (id: string) => void
  }) => (
    <div>
      <button type="button" onClick={props.onNewChat}>
        New chat
      </button>
      <div data-testid="active-chat-id">{props.activeChatId}</div>
      {props.isLoading && <div data-testid="chats-loading">Loading chats</div>}
      {props.sessions.map((s) => (
        <button key={s.id} type="button" onClick={() => props.onSelectChat(s.id)}>
          select:{s.title || s.id}
        </button>
      ))}
      {(props.sharedSessions?.length ?? 0) > 0 && <div>Shared</div>}
      {(props.sharedSessions ?? []).map((s) => (
        <button key={s.id} type="button" onClick={() => props.onSelectChat(s.id)}>
          shared:{s.title || s.id}
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

describe('AppLayout — Item 4: chat switching never aborts a background request', () => {
  beforeEach(() => {
    currentSignal = null
    pendingSendQueryCalls = []
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

  it('keeps the request running (not aborted) and the composer usable when starting a New chat mid-stream', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // The fake stream is now in flight: composer shows Stop, not Send.
    await screen.findByRole('button', { name: 'Stop response' })
    expect(currentSignal?.aborted).toBe(false)

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    // Never aborted — the request for the old chat keeps running in the
    // background — and the NEW chat's own composer is immediately usable
    // (Send, not stuck on Stop for a request that belongs to another chat).
    expect(currentSignal?.aborted).toBe(false)
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()

    // Switch back to the old chat: it's still streaming (Stop still shown),
    // not interrupted.
    const oldChatButtons = screen.getAllByRole('button', { name: /^select:/ })
    await user.click(oldChatButtons[oldChatButtons.length - 1])

    expect(await screen.findByRole('button', { name: 'Stop response' })).toBeInTheDocument()
    expect(screen.queryByText('Answer interrupted.')).not.toBeInTheDocument()
    expect(screen.getByText('What is in the contract?')).toBeInTheDocument()
  })

  it('does not abort and lets the still-streaming chat compose freely when selecting a different history entry mid-stream', async () => {
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

    expect(currentSignal?.aborted).toBe(false)
    // The now-active (other) chat's own composer is enabled — Stop belongs
    // only to the chat that's actually streaming.
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })

  it('streams two chats concurrently, each landing its own answer in its own chat, and Stop only aborts the active one', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    // Chat A: send and let it start streaming.
    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'Question A')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByRole('button', { name: 'Stop response' })
    expect(pendingSendQueryCalls).toHaveLength(1)
    const chatAId = pendingSendQueryCalls[0].request.chatId

    // Switch to a brand-new chat B and send there too, while A is still
    // in flight — B's composer must be usable, not disabled by A's stream.
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()

    const textareaB = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textareaB, 'Question B')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByRole('button', { name: 'Stop response' })

    expect(pendingSendQueryCalls).toHaveLength(2)
    const chatBId = pendingSendQueryCalls.find((c) => c.request.chatId !== chatAId)!.request.chatId
    expect(chatBId).not.toBe(chatAId)

    // Stop, while chat B is active, only aborts B's own controller.
    await user.click(screen.getByRole('button', { name: 'Stop response' }))
    expect(pendingSendQueryCalls).toHaveLength(1)
    expect(pendingSendQueryCalls[0].request.chatId).toBe(chatAId)
    expect(await screen.findByText('Response stopped.')).toBeInTheDocument()

    // Resolve chat A's request (still running in the background) and
    // switch back to it — its own answer landed there, not in B.
    await act(async () => {
      resolvePendingSendQueryFor(chatAId, {
        messageId: 'answer-a',
        content: 'Answer for A',
        thinkingSeconds: 1,
      })
      await Promise.resolve()
    })

    const chatButtons = screen.getAllByRole('button', { name: /^select:/ })
    await user.click(chatButtons[chatButtons.length - 1])

    expect(await screen.findByText('Answer for A')).toBeInTheDocument()
    expect(screen.queryByText('Response stopped.')).not.toBeInTheDocument()
  })
})

describe('AppLayout — Item 1: Stop works during the thinking phase, not only while streaming', () => {
  beforeEach(() => {
    currentSignal = null
    pendingSendQueryCalls = []
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

  it('shows a functional Stop button the moment the message is sent, before any progress/delta event has fired', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // Stop is shown immediately — the mock's mutateAsync hasn't fired any
    // onProgress/onDelta callback yet at this point, i.e. this is still
    // the pure "thinking" phase, not streaming.
    const stopButton = await screen.findByRole('button', { name: 'Stop response' })
    expect(stopButton).toBeEnabled()
    expect(currentSignal?.aborted).toBe(false)

    // And it's functional here, not just visible: clicking it aborts the
    // request and produces the same interrupted turn stopping mid-stream
    // would.
    await user.click(stopButton)

    expect(currentSignal?.aborted).toBe(true)
    expect(await screen.findByText('Response stopped.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
  })
})

describe('AppLayout — query error messages', () => {
  beforeEach(() => {
    currentSignal = null
    nextSendQueryRejection = null
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

  it('surfaces the server message for a 403 that carries one (e.g. a view-only chat)', async () => {
    const user = userEvent.setup()
    nextSendQueryRejection = new ApiError(
      'This chat is view-only',
      403,
      'This chat is view-only',
      'view_only',
    )

    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('This chat is view-only')).toBeInTheDocument()
  })

  it('falls back to the generic permission message for a 403 with no body message', async () => {
    const user = userEvent.setup()
    nextSendQueryRejection = new ApiError('Forbidden', 403)

    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(
      await screen.findByText("You don't have permission to query the selected documents."),
    ).toBeInTheDocument()
  })

  it('surfaces the server message for a 409 (a shared chat whose host has not chosen files yet)', async () => {
    const user = userEvent.setup()
    nextSendQueryRejection = new ApiError(
      'The chat owner has not chosen any files yet',
      409,
      'The chat owner has not chosen any files yet',
    )

    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(
      await screen.findByText('The chat owner has not chosen any files yet'),
    ).toBeInTheDocument()
  })
})

describe('AppLayout — shared link (?share=token)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
    // A shared chat's detail is now re-fetched every time it becomes
    // active (`useChatStore`'s `ensureMessagesLoaded`), not just once —
    // reset any per-id `mockImplementation` a previous test in this block
    // left behind so it can't leak into this one's own activation fetch.
    getChatSession.mockReset()
    getChatSession.mockResolvedValue({})
    // Same reasoning for postChatMessage — a test below controls when its
    // promise resolves, which must not leak into a later test's default.
    postChatMessage.mockReset()
    postChatMessage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/')
  })

  it('loads the shared chat after auth, adds it to the Shared group, selects it, and strips the ?share param', async () => {
    window.history.pushState({}, '', '/chat?share=tok123')
    getSharedChatSession.mockResolvedValueOnce({
      id: 'shared-1',
      title: 'Shared Chat',
      project_id: null,
      visibility: 'view',
      share_token: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      message_count: 2,
      owner_username: 'alice',
      is_owner: false,
      can_query: false,
      scope_document_ids: [],
      messages: [
        {
          id: 'm1',
          seq: 1,
          role: 'user',
          content: 'What is in the contract?',
          author_username: 'alice',
          created_at: '2026-09-01T00:00:00Z',
        },
        {
          id: 'm2',
          seq: 2,
          role: 'assistant',
          content: 'Shared answer content',
          author_username: 'alice',
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
    })

    render(<AppLayout />)

    // Parsed after auth (mocked as already settled) and passed to the
    // Shared group, not the owner's own chat list.
    expect(await screen.findByRole('button', { name: 'shared:Shared Chat' })).toBeInTheDocument()
    expect(screen.getByText('Shared')).toBeInTheDocument()
    expect(getSharedChatSession).toHaveBeenCalledWith('tok123')

    // Selected — its own message renders in the chat pane without clicking
    // anything. Re-queries on every retry (rather than asserting on a
    // single `findByText` node reference) so a benign re-render racing the
    // assertion — e.g. `ensureMessagesLoaded`'s own `messagesLoading`
    // bookkeeping settling right around here — can't leave it holding a
    // stale, now-detached node.
    await waitFor(() => {
      expect(screen.getByText('Shared answer content')).toBeInTheDocument()
    })

    // Live UI proof regression: no throwaway auto-created own chat ("New
    // chat"'s dated title) ever appears, and it never wins the selection
    // out from under the shared one either.
    expect(screen.queryByRole('button', { name: /^select:Session / })).not.toBeInTheDocument()

    // The `?share=` param is stripped from the URL via history.replaceState.
    await waitFor(() => {
      expect(window.location.search).not.toContain('share')
    })
  })

  it('shows a toast and never crashes when the shared link is no longer available', async () => {
    window.history.pushState({}, '', '/chat?share=badtoken')
    getSharedChatSession.mockRejectedValueOnce(new Error('not found'))

    render(<AppLayout />)

    // Falls back to the normal (non-shared) chat screen — no fatal error.
    expect(await screen.findByRole('button', { name: 'New chat' })).toBeInTheDocument()
    expect(await screen.findByText('This shared chat link is no longer available.')).toBeInTheDocument()

    await waitFor(() => {
      expect(window.location.search).not.toContain('share')
    })
  })

  it('lets a shared queryable chat be asked without a manual file selection, using the chat scope', async () => {
    const user = userEvent.setup()
    initialSelectedIds = new Set()
    window.history.pushState({}, '', '/chat?share=tok456')
    getSharedChatSession.mockResolvedValueOnce({
      id: 'shared-2',
      title: 'Shared Queryable Chat',
      project_id: null,
      visibility: 'query',
      share_token: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      // Files the viewer can't necessarily browse themselves — not in
      // `initialDocumentMeta`, so their names can't be resolved locally.
      scope_document_ids: ['doc-9', 'doc-10'],
      messages: [],
    })

    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText('Ask about the shared files')
    expect(textarea).not.toBeDisabled()

    await user.type(textarea, 'What do these say?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('What do these say?')).toBeInTheDocument()
    // Shared-turn scope is intentionally not repeated below the bubble.
    expect(screen.queryByText('2 shared files')).not.toBeInTheDocument()
    expect(lastSendQueryRequest?.documents).toEqual(['doc-9', 'doc-10'])

    await waitFor(() => {
      expect(postChatMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          role: 'user',
          content: 'What do these say?',
          scope_document_ids: ['doc-9', 'doc-10'],
        }),
      )
    })
  })

  it('disables the composer with a distinct placeholder when the host has not chosen any files yet', async () => {
    initialSelectedIds = new Set()
    window.history.pushState({}, '', '/chat?share=tok-empty')
    getSharedChatSession.mockResolvedValueOnce({
      id: 'shared-3',
      title: 'Shared Empty Chat',
      project_id: null,
      visibility: 'query',
      share_token: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: [],
      messages: [],
    })

    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText(
      'The chat owner has not chosen files yet',
    )
    expect(textarea).toBeDisabled()
  })

  it('renders one aggregate count pill (not per-file chips) from scope_documents, and omits the document list when a follower asks', async () => {
    const user = userEvent.setup()
    initialSelectedIds = new Set()
    window.history.pushState({}, '', '/chat?share=tok-chips')
    getSharedChatSession.mockResolvedValueOnce({
      id: 'shared-4',
      title: 'Shared Chat With Names',
      project_id: null,
      visibility: 'query',
      share_token: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: ['doc-9', 'doc-10'],
      scope_documents: [
        { document_id: 'doc-9', filename: 'Contract.pdf' },
        { document_id: 'doc-10', filename: null },
      ],
      messages: [],
    })

    render(<AppLayout />)

    // The composer's own pill is a count only (Task 10: "don't enumerate
    // the files out it's weird") — no per-file names before sending.
    expect(await screen.findByText('2 files')).toBeInTheDocument()
    expect(screen.queryByText('Contract.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('File doc-10')).not.toBeInTheDocument()

    const textarea = screen.getByPlaceholderText('Ask about the shared files')
    await user.type(textarea, 'What do these say?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(lastSendQueryRequest?.omitDocuments).toBe(true))
    // Shared turns deliberately do not repeat the scope as a filename pill
    // beneath the bubble; hover the composer count when the file list is
    // needed. This keeps shared and normal chat history visually identical.
    await waitFor(() => expect(screen.queryByText('Contract.pdf')).not.toBeInTheDocument())
    // The composer's own pill stays a count, even after sending.
    expect(screen.getByText('2 files')).toBeInTheDocument()
  })

  it("refreshes the shared chat's own detail after the follower's answer completes", async () => {
    const user = userEvent.setup()
    initialSelectedIds = new Set()
    window.history.pushState({}, '', '/chat?share=tok-refresh')
    getSharedChatSession.mockResolvedValueOnce({
      id: 'shared-5',
      title: 'Shared Refresh Chat',
      project_id: null,
      visibility: 'query',
      share_token: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: ['doc-9'],
      messages: [],
    })
    nextSendQueryResolution = { messageId: 'm1', content: 'The answer.' }

    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText('Ask about the shared files')
    // The chat's own activation already triggers one refetch (`useChatStore`'s
    // always-refetch-on-activation for a shared chat) — capture that count
    // before sending so the assertion below proves an ADDITIONAL fetch, not
    // just the one from activation.
    await waitFor(() =>
      expect(
        getChatSession.mock.calls.filter(([id]) => id === 'shared-5').length,
      ).toBeGreaterThanOrEqual(1),
    )
    const beforeCount = getChatSession.mock.calls.filter(([id]) => id === 'shared-5').length

    await user.type(textarea, 'What do these say?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('The answer.')).toBeInTheDocument()

    await waitFor(() => {
      const count = getChatSession.mock.calls.filter(([id]) => id === 'shared-5').length
      expect(count).toBeGreaterThan(beforeCount)
    })
  })

  it('awaits the assistant-message persist before refreshing, so the refresh cannot race the just-finished answer', async () => {
    const user = userEvent.setup()
    initialSelectedIds = new Set()
    window.history.pushState({}, '', '/chat?share=tok-order')
    getSharedChatSession.mockResolvedValueOnce({
      id: 'shared-7',
      title: 'Shared Ordering Chat',
      project_id: null,
      visibility: 'query',
      share_token: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: ['doc-9'],
      messages: [],
    })
    nextSendQueryResolution = { messageId: 'm1', content: 'The answer.' }

    // The assistant-message POST hangs until `resolvePost` is called
    // below — proves the refresh GET waits for it rather than firing
    // concurrently (a race that could clobber the just-persisted answer
    // with a detail fetched before it landed).
    let resolvePost: (() => void) | undefined
    postChatMessage.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePost = resolve
        }),
    )

    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText('Ask about the shared files')
    await waitFor(() =>
      expect(
        getChatSession.mock.calls.filter(([id]) => id === 'shared-7').length,
      ).toBeGreaterThanOrEqual(1),
    )
    const beforeCount = getChatSession.mock.calls.filter(([id]) => id === 'shared-7').length

    await user.type(textarea, 'What do these say?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('The answer.')).toBeInTheDocument()

    // Flush pending microtasks — the refresh GET must NOT have fired yet,
    // because the assistant-message POST above is still unresolved.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(getChatSession.mock.calls.filter(([id]) => id === 'shared-7').length).toBe(beforeCount)

    resolvePost?.()

    await waitFor(() => {
      const count = getChatSession.mock.calls.filter(([id]) => id === 'shared-7').length
      expect(count).toBeGreaterThan(beforeCount)
    })
  })
})

describe('AppLayout — host rooftop banner (isHostOfQueryShare gating)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
    getChatSession.mockReset()
    getChatSession.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the banner only for the host of a chat shared with query permission — not private, not view-only, not a non-owner viewer', async () => {
    const user = userEvent.setup()
    const baseFields = {
      project_id: null,
      share_token: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      message_count: 0,
    }
    listChatSessions.mockResolvedValueOnce({
      sessions: [
        { id: 'own-private', title: 'Own Private', visibility: 'private', ...baseFields },
        { id: 'own-view', title: 'Own View', visibility: 'view', ...baseFields },
        { id: 'own-query', title: 'Own Query', visibility: 'query', ...baseFields },
      ],
      shared: [
        {
          id: 'shared-query',
          title: 'Shared Query',
          owner_username: 'alice',
          visibility: 'query',
          opened_at: '2026-09-01T00:00:00Z',
        },
      ],
    })
    getChatSession.mockImplementation((id: string) => {
      if (id === 'own-query') {
        // Deliberately omits `is_owner` from the detail response — the
        // DTO type promises `boolean`, but `ChatSession.isOwner`'s own doc
        // comment allows "Absent/true" for a chat the viewer owns. The
        // banner's gating must treat an absent `isOwner` as still-the-host
        // (`!== false`), not silently hide the banner for the real owner.
        return Promise.resolve({
          id,
          title: 'Own Query',
          visibility: 'query',
          messages: [],
          ...baseFields,
        })
      }
      if (id === 'shared-query') {
        return Promise.resolve({
          id,
          title: 'Shared Query',
          visibility: 'query',
          owner_username: 'alice',
          is_owner: false,
          can_query: true,
          messages: [],
          ...baseFields,
        })
      }
      return Promise.resolve({ id, title: id, visibility: 'private', messages: [], ...baseFields })
    })

    render(<AppLayout />)

    const bannerText = /sending a message will update what the recipients can see/i

    await user.click(await screen.findByRole('button', { name: 'select:Own Private' }))
    await waitFor(() => expect(screen.getByTestId('active-chat-id').textContent).toBe('own-private'))
    expect(screen.queryByText(bannerText)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'select:Own View' }))
    await waitFor(() => expect(screen.getByTestId('active-chat-id').textContent).toBe('own-view'))
    expect(screen.queryByText(bannerText)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'select:Own Query' }))
    await waitFor(() => expect(screen.getByTestId('active-chat-id').textContent).toBe('own-query'))
    expect(await screen.findByText(bannerText)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'shared:Shared Query' }))
    await waitFor(() => expect(screen.getByTestId('active-chat-id').textContent).toBe('shared-query'))
    expect(screen.queryByText(bannerText)).not.toBeInTheDocument()
  })
})

describe('AppLayout — Summarize', () => {
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

  it('persists both the user request and the summary answer to the server', async () => {
    const user = userEvent.setup()
    fetchDocumentSummary.mockResolvedValueOnce({ summary: 'This document covers Q3 minutes.' })

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Summarize selected document' }))

    expect(await screen.findByText('Summarize this document')).toBeInTheDocument()
    expect(await screen.findByText('This document covers Q3 minutes.')).toBeInTheDocument()

    await waitFor(() => {
      expect(postChatMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ role: 'user', content: 'Summarize this document' }),
      )
    })
    await waitFor(() => {
      expect(postChatMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          role: 'assistant',
          content: 'This document covers Q3 minutes.',
          status: 'complete',
        }),
      )
    })
  })

  it('shows a thinking placeholder while the summary request is in flight, then renders the answer', async () => {
    const user = userEvent.setup()
    let resolveSummary: ((value: { summary: string }) => void) | undefined
    fetchDocumentSummary.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSummary = resolve
        }),
    )

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Summarize selected document' }))

    expect(screen.getByText('Summarize this document')).toBeInTheDocument()
    expect(
      screen.getByText('Summarizing this document. This can take up to a minute.'),
    ).toBeInTheDocument()

    await act(async () => {
      resolveSummary?.({ summary: 'This document covers Q3 minutes.' })
      await Promise.resolve()
    })

    expect(await screen.findByText('This document covers Q3 minutes.')).toBeInTheDocument()
    expect(
      screen.queryByText('Summarizing this document. This can take up to a minute.'),
    ).not.toBeInTheDocument()
  })

  // Fix round 1, Finding 1: while Summarize (or Categorize/Extract
  // metadata) is in flight, the composer's own Send/Stop button must show
  // a disabled Send — never a clickable-but-inert Stop, since there is
  // nothing for Stop to abort here (the tool action isn't a chat stream).
  it('shows a disabled Send button, not Stop, on the composer while Summarize is in flight', async () => {
    const user = userEvent.setup()
    let resolveSummary: ((value: { summary: string }) => void) | undefined
    fetchDocumentSummary.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSummary = resolve
        }),
    )

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Summarize selected document' }))
    expect(
      await screen.findByText('Summarizing this document. This can take up to a minute.'),
    ).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()
    const sendButton = screen.getByRole('button', { name: 'Send message' })
    expect(sendButton).toBeDisabled()

    await act(async () => {
      resolveSummary?.({ summary: 'This document covers Q3 minutes.' })
      await Promise.resolve()
    })
  })

  it('removes the thinking placeholder on a fetch error, keeping the user request', async () => {
    const user = userEvent.setup()
    let rejectSummary: ((err: unknown) => void) | undefined
    fetchDocumentSummary.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSummary = reject
        }),
    )

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Summarize selected document' }))
    expect(
      await screen.findByText('Summarizing this document. This can take up to a minute.'),
    ).toBeInTheDocument()

    await act(async () => {
      rejectSummary?.(new ApiError('Something went wrong.', 500, 'Something went wrong.'))
      await Promise.resolve()
    })

    expect(
      screen.queryByText('Summarizing this document. This can take up to a minute.'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Summarize this document')).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Summarize selected document' }),
    ).toBeEnabled()
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
    let resolveExtract: ((value: MetadataExtractionResponse) => void) | undefined
    extractMetadata.mockImplementation(
      () =>
        new Promise<MetadataExtractionResponse>((resolve) => {
          resolveExtract = resolve
        }),
    )

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Extract metadata' }))

    expect(screen.getByText('Extract metadata from doc-1.pdf')).toBeInTheDocument()
    expect(
      screen.getByText('Extracting metadata. This can take up to a minute.'),
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
        field_order: [
          'Document Title',
          'Faculty',
          'Programme name and code',
          'Academic year',
          'Accreditation body',
          'Programme Coordinator',
        ],
        comment: 'Arche AI extracted metadata — Document Title: Meeting Minutes; ...',
        pushed: true,
        push_error: null,
      })
      await Promise.resolve()
    })

    expect(await screen.findByText('Extracted metadata — doc-1.pdf')).toBeInTheDocument()
    expect(screen.getByText('Meeting Minutes')).toBeInTheDocument()
    expect(screen.getByText('Saved to LogicalDOC as extended properties.')).toBeInTheDocument()
    expect(
      screen.queryByText('Extracting metadata. This can take up to a minute.'),
    ).not.toBeInTheDocument()
  })

  it('removes the placeholder and re-enables the button on a contract error', async () => {
    const user = userEvent.setup()
    let rejectExtract: ((err: unknown) => void) | undefined
    extractMetadata.mockImplementation(
      () =>
        new Promise<MetadataExtractionResponse>((_resolve, reject) => {
          rejectExtract = reject
        }),
    )

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Extract metadata' }))
    expect(
      await screen.findByText('Extracting metadata. This can take up to a minute.'),
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
      screen.queryByText('Extracting metadata. This can take up to a minute.'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Extract metadata from doc-1.pdf')).toBeInTheDocument()
    expect(screen.queryByText(/Extracted metadata —/)).not.toBeInTheDocument()

    // The composer is idle again — the button is enabled once more.
    expect(await screen.findByRole('button', { name: 'Extract metadata' })).toBeEnabled()
  })

  it('does NOT abort an in-flight extraction on New chat (Item 4: navigation never aborts a background request any more)', async () => {
    const user = userEvent.setup()
    extractMetadata.mockImplementation(() => new Promise<MetadataExtractionResponse>(() => {}))

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Extract metadata' }))
    expect(
      await screen.findByText('Extracting metadata. This can take up to a minute.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    const oldChatButtons = screen.getAllByRole('button', { name: /^select:/ })
    await user.click(oldChatButtons[oldChatButtons.length - 1])

    // Still thinking, not interrupted — the extraction request itself was
    // never touched by switching away from its chat.
    expect(
      await screen.findByText('Extracting metadata. This can take up to a minute.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Answer interrupted.')).not.toBeInTheDocument()
    expect(screen.getByText('Extract metadata from doc-1.pdf')).toBeInTheDocument()
  })

  it('persists both the user request and the extracted metadata to the server', async () => {
    const user = userEvent.setup()
    extractMetadata.mockResolvedValueOnce({
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
      field_order: [
        'Document Title',
        'Faculty',
        'Programme name and code',
        'Academic year',
        'Accreditation body',
        'Programme Coordinator',
      ],
      comment: 'Arche AI extracted metadata — Document Title: Meeting Minutes; ...',
      pushed: true,
      push_error: null,
    })

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Extract metadata' }))
    expect(await screen.findByText('Extracted metadata — doc-1.pdf')).toBeInTheDocument()

    await waitFor(() => {
      expect(postChatMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ role: 'user', content: 'Extract metadata from doc-1.pdf' }),
      )
    })
    await waitFor(() => {
      expect(postChatMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Extracted metadata — doc-1.pdf'),
          status: 'complete',
        }),
      )
    })
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

  it('shows a thinking placeholder while the categorize request is in flight, then renders the answer', async () => {
    const user = userEvent.setup()
    let resolveCategorize: ((value: DocumentCategorizeResponse) => void) | undefined
    categorizeDocument.mockImplementation(
      () =>
        new Promise<DocumentCategorizeResponse>((resolve) => {
          resolveCategorize = resolve
        }),
    )

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Categorize selected document' }))

    expect(screen.getByText('Categorize "doc-1.pdf"')).toBeInTheDocument()
    expect(
      screen.getByText('Categorizing this file. This can take up to a minute.'),
    ).toBeInTheDocument()

    await act(async () => {
      resolveCategorize?.(matchedResponse())
      await Promise.resolve()
    })

    expect(
      await screen.findByText((_, element) => element?.textContent === 'Suggested folder: Approved'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Categorizing this file. This can take up to a minute.'),
    ).not.toBeInTheDocument()
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

  it('persists both the user request and the categorize answer to the server', async () => {
    const user = userEvent.setup()
    categorizeDocument.mockResolvedValueOnce(matchedResponse())

    render(<AppLayout />)

    await user.click(screen.getByRole('button', { name: 'Categorize selected document' }))
    expect(await screen.findByText('Categorize "doc-1.pdf"')).toBeInTheDocument()

    await waitFor(() => {
      expect(postChatMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ role: 'user', content: 'Categorize "doc-1.pdf"' }),
      )
    })
    await waitFor(() => {
      expect(postChatMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Approved'),
        }),
      )
    })
  })
})

describe('AppLayout — Summarize/Categorize/Extract metadata blocked in a shared chat', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    // A leftover selection from the viewer's OWN chat, still resolvable
    // (doc-1 is READY/queryable) — the bug this guards against: switching
    // into a shared chat must not let this selection drive these actions
    // there too.
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
    getChatSession.mockReset()
    getChatSession.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
    window.history.pushState({}, '', '/')
  })

  it('disables Summarize/Categorize/Extract metadata and never posts anything for a shared chat with a leftover own-chat selection', async () => {
    const user = userEvent.setup()
    window.history.pushState({}, '', '/chat?share=tok-actions')
    getSharedChatSession.mockResolvedValueOnce({
      id: 'shared-6',
      title: 'Shared Actions Chat',
      project_id: null,
      visibility: 'query',
      share_token: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      message_count: 0,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: ['doc-9'],
      messages: [],
    })

    render(<AppLayout />)

    // Wait for the shared chat to actually become active — the buttons
    // exist from the very first render (against the default own chat),
    // so asserting on them before this would race the `?share=` load.
    await waitFor(() => expect(screen.getByTestId('active-chat-id').textContent).toBe('shared-6'))

    const summarizeBtn = screen.getByRole('button', { name: 'Summarize selected document' })
    const categorizeBtn = screen.getByRole('button', { name: 'Categorize selected document' })
    const extractBtn = screen.getByRole('button', { name: 'Extract metadata' })

    await waitFor(() => expect(summarizeBtn).toBeDisabled())
    expect(categorizeBtn).toBeDisabled()
    expect(extractBtn).toBeDisabled()

    await user.click(summarizeBtn)
    await user.click(categorizeBtn)
    await user.click(extractBtn)

    expect(fetchDocumentSummary).not.toHaveBeenCalled()
    expect(categorizeDocument).not.toHaveBeenCalled()
    expect(extractMetadata).not.toHaveBeenCalled()
    expect(postChatMessage).not.toHaveBeenCalled()
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

  it('replaces the dated title with the first question as soon as it is sent', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    expect(screen.getByRole('button', { name: /^select:/ }).textContent).toMatch(
      /^select:Session \d{1,2} [A-Z][a-z]{2} \d{4} \(1\)$/,
    )

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await screen.findByRole('button', { name: 'Stop response' })

    // Same rule the adapter applies when it persists this message, so the
    // sidebar keeps a meaningful name after the chat is unloaded or the
    // page is refreshed (the list endpoint carries no messages).
    expect(screen.getByRole('button', { name: /^select:/ }).textContent).toBe(
      'select:What is in the contract?',
    )
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
    expect(screen.getByText('Arche AI')).toBeInTheDocument()
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
    expect(screen.queryByText('Arche AI')).not.toBeInTheDocument()
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

// Round 6, Item B — root cause (verified in code): the shell was
// `h-screen` (`height: 100vh`), and on iOS Safari 100vh is the height
// with the browser chrome collapsed, so the shell was taller than the
// visible area and the *document itself* scrolled; html/body had no
// `overflow` rule to stop that. The fix: html/body never scroll, the
// shell tracks the visible viewport (100dvh, refined live by
// `useVisualViewportHeight` off `window.visualViewport` for the on-screen
// keyboard), and `.docu-chat-scroll` stays the only scroll container.
describe('html/body document-scroll CSS contract (Item B)', () => {
  it('html and body never scroll — the chat pane is the only scroll container, not the document', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')
    const match = css.match(/html,\s*\nbody\s*\{([^}]*)\}/)

    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).toMatch(/height\s*:\s*100%/)
    expect(body).toMatch(/overflow\s*:\s*hidden/)
    expect(body).toMatch(/overscroll-behavior\s*:\s*none/)
  })
})

describe('.docu-app-shell CSS contract (Item B)', () => {
  it('sizes to 100vh with a 100dvh fallback, so the shell follows the visible viewport (collapsed browser chrome) rather than the layout viewport', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8')
    const match = css.match(/\.docu-app-shell\s*\{([^}]*)\}/)

    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).toMatch(/height\s*:\s*100vh/)
    expect(body).toMatch(/height\s*:\s*100dvh/)
  })
})

describe('AppLayout — message pane skeleton while a chat is loading messages', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
    listChatSessions.mockReset()
    getChatSession.mockReset()
    getChatSession.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
    listChatSessions.mockResolvedValue({ sessions: [], shared: [] })
    getChatSession.mockResolvedValue({})
    window.history.pushState({}, '', '/')
  })

  it('shows a skeleton in the message pane and disables the composer while the active (not-yet-loaded) chat is fetching messages, then reveals the composer once it resolves', async () => {
    // A real, previously-created own chat coming back from the server —
    // unlike the auto-created empty first chat, this one is NOT pre-marked
    // as already loaded, so mounting triggers `ensureMessagesLoaded`'s
    // fetch and `messagesLoading` picks up its id for the duration.
    listChatSessions.mockResolvedValueOnce({
      sessions: [
        {
          id: 's1',
          title: 'Old chat',
          project_id: null,
          visibility: 'private',
          share_token: null,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
          message_count: 1,
        },
      ],
      shared: [],
    })
    let resolveDetail: ((value: unknown) => void) | undefined
    getChatSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve
        }),
    )

    render(<AppLayout />)

    await waitFor(() => expect(screen.getByTestId('active-chat-id').textContent).toBe('s1'))

    // `activeChatId` and `messagesLoading` are set by two separate state
    // updates (the latter one effect-render later, inside
    // `ensureMessagesLoaded`) — re-query rather than assert synchronously
    // right after the activeChatId waitFor above settles, or this can race
    // a still-in-flight second render.
    await waitFor(() => {
      expect(screen.getByTestId('messages-skeleton')).toBeInTheDocument()
    })
    expect(
      screen.getByPlaceholderText('Ask a question about the selected documents'),
    ).toBeDisabled()

    await act(async () => {
      resolveDetail?.({
        id: 's1',
        title: 'Old chat',
        messages: [],
        created_at: '2026-09-01T00:00:00Z',
        project_id: null,
        visibility: 'private',
        share_token: null,
        is_owner: true,
        can_query: true,
        scope_document_ids: [],
      })
    })

    // Re-queries on every retry rather than asserting a single node
    // reference (see Task 7's flaky-node note for this same transition).
    await waitFor(() => {
      expect(screen.queryByTestId('messages-skeleton')).not.toBeInTheDocument()
    })
    expect(
      screen.getByPlaceholderText('Ask a question about the selected documents'),
    ).not.toBeDisabled()
  })

  it('keeps the chat area and composer in a loading state while the initial chat list is hydrating', async () => {
    let resolveList: ((value: unknown) => void) | undefined
    listChatSessions.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve
        }),
    )

    render(<AppLayout />)

    // The mount-time empty session is only a temporary placeholder. It
    // must not look interactive while the authoritative list is pending.
    expect(screen.getByTestId('messages-skeleton')).toBeInTheDocument()
    expect(screen.getByTestId('chats-loading')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Ask a question about the selected documents'),
    ).toBeDisabled()

    await act(async () => {
      resolveList?.({ sessions: [], shared: [] })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('messages-skeleton')).not.toBeInTheDocument()
    })
    expect(screen.queryByTestId('chats-loading')).not.toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Ask a question about the selected documents'),
    ).not.toBeDisabled()
  })

  it('does NOT show the skeleton or disable the composer when a chat that already has messages is silently re-fetching in the background (reselecting an already-open shared chat)', async () => {
    // Shared chats are re-fetched on every activation (ungated, unlike own
    // chats — see useChatStore.ts's `ensureMessagesLoaded`), so reselecting
    // one that's already open and fully loaded re-adds its id to
    // `messagesLoading` while its messages are still sitting in
    // `activeSession.messages` from the earlier load. The message list
    // must stay put and the composer must stay enabled for that background
    // re-fetch — only a genuinely empty, first-ever load should skeleton.
    //
    const user = userEvent.setup()
    window.history.pushState({}, '', '/chat')
    listChatSessions.mockResolvedValueOnce({
      sessions: [
        {
          id: 's1',
          title: 'My own chat',
          project_id: null,
          visibility: 'private',
          share_token: null,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
          message_count: 0,
        },
      ],
      shared: [
        {
          id: 'shared-9',
          title: 'Reselect Chat',
          owner_username: 'alice',
          visibility: 'query',
          opened_at: '2026-09-01T00:00:00Z',
        },
      ],
    })
    // `pairMessages` (AppLayout.tsx) anchors each pair on a `user` message
    // — a lone `assistant` entry with no preceding `user` turn is silently
    // dropped, so a fixture asserting a rendered message needs both.
    const shared9Detail = {
      id: 'shared-9',
      title: 'Reselect Chat',
      project_id: null,
      visibility: 'query',
      share_token: null,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z',
      message_count: 2,
      owner_username: 'alice',
      is_owner: false,
      can_query: true,
      scope_document_ids: ['doc-9'],
      messages: [
        {
          id: 'm0',
          seq: 1,
          role: 'user',
          content: 'What is the status?',
          author_username: 'alice',
          created_at: '2026-09-01T00:00:00Z',
        },
        {
          id: 'm1',
          seq: 2,
          role: 'assistant',
          content: 'Already loaded answer',
          author_username: 'alice',
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
    }
    getChatSession.mockImplementation((id: string) =>
      id === 'shared-9' ? Promise.resolve(shared9Detail) : Promise.resolve({ id, title: id, messages: [] }),
    )

    render(<AppLayout />)

    // First activation — click the shared chat to open it; a genuine
    // first-ever load, expected to show the skeleton briefly and then
    // reveal the message (setup, not the assertion under test).
    await user.click(await screen.findByRole('button', { name: 'shared:Reselect Chat' }))
    await waitFor(() => {
      expect(screen.getByTestId('active-chat-id').textContent).toBe('shared-9')
    })
    expect(await screen.findByText('Already loaded answer')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('messages-skeleton')).not.toBeInTheDocument()
    })

    // Switch away to an own (new) chat, then back — a reachable A -> B ->
    // A reselect of the already-open, already-loaded shared chat.
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    await waitFor(() => {
      expect(screen.getByTestId('active-chat-id').textContent).not.toBe('shared-9')
    })

    let resolveDetail: ((value: unknown) => void) | undefined
    getChatSession.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve
        }),
    )

    await user.click(screen.getByRole('button', { name: 'shared:Reselect Chat' }))
    await waitFor(() => {
      expect(screen.getByTestId('active-chat-id').textContent).toBe('shared-9')
    })

    // The background re-fetch is now in flight (deliberately never
    // resolved yet) — the already-correct message and an enabled composer
    // must stay exactly as they were: no skeleton, no disable.
    expect(screen.getByText('Already loaded answer')).toBeInTheDocument()
    expect(screen.queryByTestId('messages-skeleton')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ask about the shared files')).not.toBeDisabled()

    await act(async () => {
      resolveDetail?.(shared9Detail)
    })

    // Still fine once the background re-fetch actually settles.
    expect(screen.getByText('Already loaded answer')).toBeInTheDocument()
    expect(screen.queryByTestId('messages-skeleton')).not.toBeInTheDocument()
  })
})

describe('AppLayout — Fix round 1, Finding 2: composer gated during a pending-answer poll', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
    listChatSessions.mockReset()
    getChatSession.mockReset()
    getChatSession.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
    listChatSessions.mockResolvedValue({ sessions: [], shared: [] })
    getChatSession.mockResolvedValue({})
    window.history.pushState({}, '', '/')
  })

  it(
    'disables the composer with "Waiting for the current answer to finish" while the placeholder is showing, and re-enables it with the real answer once the poll resolves',
    async () => {
      // A page refresh (or a follower who missed the live SSE stream)
      // landing on a session whose answer is still generating server-side
      // — Item 3's placeholder + poll. Real timers throughout: the poll is
      // registered with the real `setInterval`, so faking the clock
      // afterwards would never reach it (see useChatStore.test.ts's Item 3
      // block for the same reasoning).
      listChatSessions.mockResolvedValueOnce({
        sessions: [
          {
            id: 's1',
            title: 'Old chat',
            project_id: null,
            visibility: 'private',
            share_token: null,
            created_at: '2026-09-01T00:00:00Z',
            updated_at: '2026-09-01T00:00:00Z',
            message_count: 1,
          },
        ],
        shared: [],
      })
      getChatSession.mockResolvedValue({
        id: 's1',
        title: 'Old chat',
        project_id: null,
        visibility: 'private',
        share_token: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        is_owner: true,
        can_query: true,
        scope_document_ids: ['doc-1'],
        messages: [{ id: 'q1', role: 'user', content: 'What is in the contract?' }],
        pending_answer: true,
      })

      render(<AppLayout />)

      await waitFor(() => expect(screen.getByTestId('active-chat-id').textContent).toBe('s1'))
      await screen.findByText('Generating answer')

      expect(
        await screen.findByText('Waiting for the current answer to finish'),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()
      const textarea = await screen.findByPlaceholderText(
        'Ask a question about the selected documents',
      )
      expect(textarea).toBeDisabled()

      getChatSession.mockResolvedValue({
        id: 's1',
        title: 'Old chat',
        project_id: null,
        visibility: 'private',
        share_token: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
        is_owner: true,
        can_query: true,
        scope_document_ids: ['doc-1'],
        messages: [
          { id: 'q1', role: 'user', content: 'What is in the contract?' },
          { id: 'a1', role: 'assistant', content: 'The contract says X.' },
        ],
        pending_answer: false,
      })

      await waitFor(
        () => {
          expect(screen.getByText('The contract says X.')).toBeInTheDocument()
        },
        { timeout: 5000, interval: 250 },
      )
      expect(screen.queryByText('Generating answer')).not.toBeInTheDocument()
      expect(
        screen.queryByText('Waiting for the current answer to finish'),
      ).not.toBeInTheDocument()
      expect(
        screen.getByPlaceholderText('Ask a question about the selected documents'),
      ).not.toBeDisabled()
    },
    10000,
  )
})

describe('AppLayout — composer locked while a brand-new chat is still being created', () => {
  beforeEach(() => {
    window.localStorage.clear()
    currentSignal = null
    initialSelectedIds = new Set(['doc-1'])
    initialDocumentMeta = defaultDocumentMeta()
    createChatSession.mockReset()
    createChatSession.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
    createChatSession.mockResolvedValue({})
    listChatSessions.mockResolvedValue({ sessions: [], shared: [] })
  })

  it('disables the composer while POST /chat/sessions for a fresh chat is still in flight, and re-enables it once it settles', async () => {
    const user = userEvent.setup()

    render(<AppLayout />)

    // Hydration itself creates an empty session (this file's default
    // `listChatSessions` mock resolves with none) and persists it through
    // the same `createChatSession` this test controls — let that first
    // call settle on the default resolved mock before arming the
    // controlled promise below, so it's specifically the New Chat click,
    // not hydration, whose POST this test observes.
    await waitFor(() => expect(createChatSession).toHaveBeenCalledTimes(1))

    let resolveCreate: ((value: unknown) => void) | undefined
    createChatSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve
        }),
    )

    await user.click(await screen.findByRole('button', { name: 'New chat' }))

    expect(
      screen.getByPlaceholderText('Ask a question about the selected documents'),
    ).toBeDisabled()
    expect(screen.getByText('Setting up this chat')).toBeInTheDocument()

    await act(async () => {
      resolveCreate?.({})
    })

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Ask a question about the selected documents'),
      ).not.toBeDisabled()
    })
    expect(screen.queryByText('Setting up this chat')).not.toBeInTheDocument()
  })
})

describe('AppLayout — chat deleted from another device is checked before querying', () => {
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
    createChatSession.mockReset()
    createChatSession.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
    createChatSession.mockResolvedValue({})
    getChatSession.mockResolvedValue({})
    listChatSessions.mockResolvedValue({ sessions: [], shared: [] })
  })

  it('blocks the send, warns, and switches to a fresh chat instead of silently losing the query', async () => {
    const user = userEvent.setup()

    render(<AppLayout />)

    // Let hydration's own "never end up with zero chats" replacement finish
    // being created (and persisted) before this test's own scenario starts.
    await waitFor(() => expect(createChatSession).toHaveBeenCalledTimes(1))
    // Spied only after `render()` mounts under the `<App>`/`MessageCapture`
    // wrapper above — `capturedMessageApi` is the real App.useApp()
    // instance AppLayout reads `message` from, set the same render pass
    // MessageCapture mounts.
    const warnSpy = vi.spyOn(capturedMessageApi!, 'warning')
    const staleChatId = screen.getByTestId('active-chat-id').textContent

    // The chat was deleted from another device/tab since this one last
    // synced — the GET this test's `handleSend` is about to make now 404s.
    getChatSession.mockRejectedValue(new ApiError('Not found', 404))

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(warnSpy).toHaveBeenCalled())

    // No query was ever dispatched for the now-gone chat.
    expect(currentSignal).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()

    // Switched to a different (freshly created) chat rather than staying on
    // the stale one.
    await waitFor(() =>
      expect(screen.getByTestId('active-chat-id').textContent).not.toBe(staleChatId),
    )
  })
})

describe('AppLayout shell (Item B — mobile viewport overlap)', () => {
  it('the shell root carries the dvh-fallback sizing class instead of a bare h-screen', () => {
    // `container.firstChild` used to be AppLayout's own root div directly;
    // it's now antd's own `<App>` wrapper div (P1-4, UI polish pass — see
    // this file's `render()` helper above), so the shell has to be found
    // by its own class instead of by DOM position.
    const { container } = render(<AppLayout />)
    const shell = container.querySelector('.docu-app-shell') as HTMLElement

    expect(shell).not.toBeNull()
    expect(shell.className).toMatch(/\bdocu-app-shell\b/)
    expect(shell.className).not.toMatch(/\bh-screen\b/)
  })

  it('the top bar and the composer are shrink-0 children of the shell, so they stay visible when the chat pane shrinks', () => {
    render(<AppLayout />)

    const composerFooter = document.querySelector('.docu-chat-input-footer')
    expect(composerFooter).not.toBeNull()
    expect(composerFooter!.className).toMatch(/\bshrink-0\b/)
  })

  it('the composer clears the home indicator with a safe-area bottom inset', () => {
    render(<AppLayout />)

    const composerFooter = document.querySelector('.docu-chat-input-footer')
    expect(composerFooter!.className).toMatch(/pb-\[env\(safe-area-inset-bottom,0px\)\]/)
  })

  it('scrolls the chat pane to the bottom once when the composer textarea gains focus', async () => {
    const scrollIntoViewSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')

    const { unmount } = render(<AppLayout />)
    const textarea = screen.getByRole('textbox')

    scrollIntoViewSpy.mockClear()
    fireEvent.focus(textarea)

    expect(scrollIntoViewSpy).toHaveBeenCalledTimes(1)

    // rc-textarea's own autoSize measurement (unrelated to this fix)
    // schedules React's own low-priority follow-up work on focus via
    // `setImmediate` — flushing that macrotask here, and unmounting
    // explicitly, keeps it from firing after this file's jsdom
    // environment has already torn down (an intermittent "window is not
    // defined" from inside react-dom's scheduler, seen without this).
    await act(async () => {
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve))
      }
    })
    unmount()
    scrollIntoViewSpy.mockRestore()
  })
})
