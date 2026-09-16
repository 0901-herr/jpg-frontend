import { Drawer, Layout, message } from 'antd'
import { ChatBubbleIconLg, ChatCloseIcon, ChatMenuIcon } from '../icons/chat'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  categorizeDocument,
  extractMqaMetadata,
  fetchDocumentSummary,
  validateQueryScope,
} from '../api/browse'
import { ApiError } from '../api/http'
import type { Citation } from '../api/types/query'
import { AUTH_BYPASS, DEV_USER } from '../config/auth'
import { useAuth } from '../context/AuthContext'
import { useSendQuery } from '../hooks/mutations/useSendQuery'
import type { DocumentsLoadedEvent } from '../hooks/useBrowseTree'
import { useBrowseTree } from '../hooks/useBrowseTree'
import { useChatStore, createEmptySession } from '../hooks/useChatStore'
import { useDocumentSelection } from '../hooks/useDocumentSelection'
import { useResizableWidth } from '../hooks/useResizableWidth'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useVisualViewportHeight } from '../hooks/useVisualViewportHeight'
import { type, typeColor } from '../styles/typography'
import { citationsToSources, mergeCitations } from '../utils/citations'
import { appendStreamDelta } from '../utils/appendStreamDelta'
import { formatProgressStage, formatRouteLabel, resolveProgressScope } from '../utils/queryProgress'
import { persistChatHistory } from '../utils/chatPersistence'
import { getSummarizeDisabledReason, isSummaryReady } from '../utils/summaryGate'
import { getExtractMetadataDisabledReason, isMqaMetadataReady } from '../utils/mqaMetadataGate'
import { getCategorizeDisabledReason } from '../utils/categorizeGate'
import { buildSummaryMessages } from '../utils/summaryMessages'
import { buildMqaMetadataAnswer } from '../utils/mqaMetadataMessage'
import { buildCategorizeMessages } from '../utils/categorizeMessages'
import { DEFAULT_QUERY_TIER } from '../utils/queryTier'
import { toUserFacingMqaMetadataError, toUserFacingQueryError } from '../utils/userFacingErrors'
import type { QueryTier } from '../api/types/query'
import { isCitationDemoEnabled, isCitationLoadingDemoEnabled } from '../config/demo'
import {
  createCitationDemoSession,
  createCitationLoadingDemoSession,
} from '../mock/citationDemoChat'
import type { ChatMessage, ChatSession, CoverageInfo } from '../types'
import ChatInput from './ChatInput'
import ChatMessageItem from './ChatMessage'
import Sidebar from './Sidebar'
import SidebarResizeHandle from './SidebarResizeHandle'

const { Content } = Layout

function pairMessages(messages: ChatMessage[]): { user: ChatMessage; assistant?: ChatMessage }[] {
  const pairs: { user: ChatMessage; assistant?: ChatMessage }[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      const assistant = messages[i + 1]?.role === 'assistant' ? messages[i + 1] : undefined
      pairs.push({ user: messages[i], assistant })
      if (assistant) i++
    }
  }
  return pairs
}

/** Fixed copy for a categorize failure when the server sent no usable
 * message of its own — keyed by the adapter's `error` code. `feature_disabled`
 * has no `message` field at all per the contract; the others are a
 * defensive backstop in case a future response omits `message`. */
const CATEGORIZE_ERROR_FALLBACKS: Record<string, string> = {
  feature_disabled: 'Categorizing is not turned on for this site.',
  leaf_folder: 'This file is already categorized.',
  document_not_ready: 'This file is not ready to categorize yet. Please try again shortly.',
  categorize_unavailable: 'Categorization is temporarily unavailable. Please try again.',
}

/** Never a fatal screen: every categorize failure — a mapped adapter error,
 * an unmapped status, or a plain network/JS error — resolves to a message
 * safe to show in chat instead of propagating. Prefers the server's own
 * `message` text (surfaced as `ApiError.detail`); falls back to fixed copy
 * keyed by `ApiError.code` when the server sent no usable message. */
function categorizeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const hasServerMessage = err.detail != null && err.detail.length > 0 && err.detail !== err.code
    if (hasServerMessage) return err.detail as string
    if (err.code && CATEGORIZE_ERROR_FALLBACKS[err.code]) return CATEGORIZE_ERROR_FALLBACKS[err.code]
  }
  return 'Could not categorize this file. Please try again.'
}

function createInitialSession(): ChatSession {
  if (isCitationLoadingDemoEnabled()) return createCitationLoadingDemoSession()
  if (isCitationDemoEnabled()) return createCitationDemoSession()
  return createEmptySession()
}

function chatPersistenceEnabled(): boolean {
  return !isCitationDemoEnabled() && !isCitationLoadingDemoEnabled()
}

// Below 768px the resizable desktop sidebar is replaced by a slim top bar
// (hamburger + "ARCHE AI" + current session title) and the sidebar itself
// moves into an antd Drawer opened from that hamburger — see the Task 5
// brief. 767.98px (not 768) so a device reporting exactly 768px CSS pixels
// lands on the desktop side of the breakpoint, matching a `max-width: 767px`
// media query's usual `.98px` convention for avoiding 1px gaps against a
// paired `min-width: 768px` rule.
const NARROW_LAYOUT_QUERY = '(max-width: 767.98px)'

export default function AppLayout() {
  const { session: authSession, isLoading: authLoading } = useAuth()
  const initialSessionRef = useRef<ChatSession>(createInitialSession())
  const chatUserId = authSession?.userId ?? (AUTH_BYPASS ? DEV_USER.userId : null)
  const chatStore = useChatStore({
    chatUserId,
    authLoading,
    enabled: chatPersistenceEnabled(),
    initialSession: initialSessionRef.current,
  })
  const { sessions, setSessions, activeChatId, setActiveChatId, sharedSessions } = chatStore
  const chatHydrated = chatStore.hydrated
  // Read (never written to trigger a render) wherever a callback needs the
  // latest `sessions` synchronously right after calling `setSessions` —
  // React may defer that call's own updater to a later microtask (it isn't
  // always run eagerly, e.g. back-to-back calls in the same tick), so a
  // capture-and-read-back-immediately pattern on the updater itself isn't
  // reliable. Assigned in the render body itself (not an effect), so it's
  // already current by the time any callback below runs.
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions
  const [inputBlockedReason, setInputBlockedReason] = useState<string | undefined>()
  const [queryTier, setQueryTier] = useState<QueryTier>(DEFAULT_QUERY_TIER)
  const { width: sidebarWidth, isResizing, startResize, sidebarRef } = useResizableWidth(280)
  const isNarrowLayout = useMediaQuery(NARROW_LAYOUT_QUERY)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Round 6, Item B: `.docu-app-shell`'s CSS `100dvh` (index.css) is the
  // fallback for every browser; this refines it live for the one case
  // `dvh` doesn't cover — the on-screen keyboard shrinks the *visual*
  // viewport without changing `dvh` — so the shell shrinks and the
  // composer sits directly above the keyboard. `undefined` on desktop and
  // in any environment without `visualViewport` leaves the CSS rule alone.
  const visualViewportHeight = useVisualViewportHeight()
  const sendQuery = useSendQuery()
  const selection = useDocumentSelection()

  const handleDocumentsLoaded = useCallback(
    ({ documents, page }: DocumentsLoadedEvent) => {
      selection.registerDocuments(documents)
      // Page 0 (a folder switch, refresh, or category toggle): auto-select
      // is a one-time-per-browser decision owned by the hook itself, so an
      // explicit "deselect all" is never undone by a later page-0 load.
      // "Load more" (page > 0) never touches the selection at all — merging
      // newly loaded documents into a partial selection was the bug.
      if (page === 0) {
        selection.autoSelectIfPending(documents)
      }
    },
    [selection.registerDocuments, selection.autoSelectIfPending],
  )

  const browse = useBrowseTree(handleDocumentsLoaded)
  // Matches Sidebar's own display-name resolution (`browse.username` first
  // — the LogicalDOC root-folder payload — then the cookie session) so a
  // freshly sent message's author label agrees with whatever name the
  // sidebar's profile row already shows for "you".
  const currentUsername = browse.username ?? authSession?.username ?? 'You'
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingCitationsRef = useRef<Citation[]>([])
  const lastProgressStageRef = useRef<string | undefined>(undefined)
  const hadPartialAnswerRef = useRef(false)
  // Sticky for the duration of one query: set true the moment an
  // `abstention` event arrives, read when the final assistant message is
  // built so it carries the flag through even though that message object
  // is constructed fresh rather than derived from the streaming placeholder.
  const abstainedRef = useRef(false)

  // A widened viewport (orientation change, resizing a browser window) must
  // never leave the mobile Drawer stuck open behind the now-visible desktop
  // sidebar.
  useEffect(() => {
    if (!isNarrowLayout) setDrawerOpen(false)
  }, [isNarrowLayout])

  // Best-effort local mirror of the server-backed sessions — never the
  // source of truth once hydrated (that's `useChatStore`'s GET /chat/
  // sessions + lazy per-chat fetch), just a browser-local backup so a
  // reload before a chat's first successful sync still shows something.
  useEffect(() => {
    if (!chatHydrated || !chatUserId || !chatPersistenceEnabled()) return
    persistChatHistory(chatUserId, sessions, activeChatId)
  }, [chatHydrated, chatUserId, sessions, activeChatId])

  // Shared-link handoff: `/chat?share=<token>` loads that chat into the
  // Shared group, selects it, and strips the query param — once per link,
  // after auth has settled. Read directly off `window.location` (via
  // `history.replaceState` to strip it, per the brief) rather than
  // `react-router`'s `useSearchParams`, which requires this component to
  // be mounted under a `<Router>` — AppLayout itself has no such
  // requirement otherwise, and its test suite renders it standalone.
  const [shareToken, setShareToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('share')
  })
  const sharedLinkHandledRef = useRef(false)
  useEffect(() => {
    if (!shareToken || authLoading || sharedLinkHandledRef.current) return
    sharedLinkHandledRef.current = true
    void (async () => {
      const shared = await chatStore.loadSharedSession(shareToken)
      if (!shared) {
        message.error('This shared chat link is no longer available.')
      }
      const url = new URL(window.location.href)
      url.searchParams.delete('share')
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
      setShareToken(null)
    })()
  }, [shareToken, authLoading, chatStore.loadSharedSession])

  // Reconcile a persisted selection against the backend once per app load:
  // ids restored from localStorage (a prior browser session) may point at
  // documents the user can no longer read, or that no longer exist at all —
  // silently trim those out rather than showing "Document <id>" phantoms
  // the sidebar has no way to un-select. Gated the same way chatHydrated is
  // (authLoading settled, a real session present), and guarded to run at
  // most once — a best-effort pass, so any failure just leaves the
  // selection as-is; the existing send-time trim in handleSend still
  // protects the actual query.
  //
  // `selection` is read via a ref (kept current every render) rather than
  // named directly in the effect's own dependency array: it's a fresh
  // object every render (as is, e.g., an auth context's session object), so
  // depending on it directly would re-run the effect's cleanup — aborting
  // the in-flight request — on unrelated re-renders instead of only on
  // unmount.
  //
  // The "done" ref is set only once the request actually *succeeds* (or
  // there was nothing to check), never just because one was started. React
  // StrictMode (dev only) double-invokes this effect synchronously —
  // mount, run, cleanup, run again — and if "done" were set up front, the
  // cleanup's abort would kill the one-and-only request that ever ran and
  // the second invocation would see "done" and skip retrying, so the
  // reconciliation would silently never complete. Marking done only on
  // success means an aborted attempt (StrictMode's first invocation, or a
  // genuine unmount mid-flight) leaves the flag false, so a remounted
  // effect instance tries again — the cleanup's `cancelled` guard just
  // stops the aborted attempt from also calling `trimSelection` itself.
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const hasAuthSession = Boolean(authSession)
  const hydrationScopeCheckedRef = useRef(false)
  useEffect(() => {
    if (authLoading) return
    if (!hasAuthSession) return
    if (hydrationScopeCheckedRef.current) return

    const ids = [...selectionRef.current.selectedIds]
    if (ids.length === 0) {
      hydrationScopeCheckedRef.current = true
      return
    }

    let cancelled = false
    const controller = new AbortController()
    void (async () => {
      try {
        const scope = await validateQueryScope(ids, controller.signal)
        if (cancelled) return
        hydrationScopeCheckedRef.current = true
        selectionRef.current.trimSelection(scope.accessible_document_ids)
      } catch {
        // Best-effort reconciliation only — keep the persisted selection.
        // Deliberately left "not done" on abort/failure: a StrictMode
        // remount (or any other retry) tries again; a genuine, permanent
        // failure just means this reconciliation never happens on this
        // app load, same as before.
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [authLoading, hasAuthSession])

  const activeSession = useMemo(
    () =>
      sessions.find((s) => s.id === activeChatId) ??
      sharedSessions.find((s) => s.id === activeChatId) ??
      sessions[0],
    [sessions, sharedSessions, activeChatId],
  )

  // A shared chat the viewer doesn't own: the owner's chosen visibility
  // decides whether the composer accepts new questions.
  const isSharedViewOnly = activeSession?.isOwner === false && activeSession?.canQuery !== true

  const messagePairs = useMemo(
    () => pairMessages(activeSession?.messages ?? []),
    [activeSession?.messages],
  )

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottomRef = useRef(true)

  const lastTurnScrollKey = useMemo(() => {
    const msgs = activeSession?.messages ?? []
    const last = msgs[msgs.length - 1]
    if (!last) return 'empty'
    return [
      last.id,
      last.status,
      last.content.length,
      last.liveText?.length ?? 0,
      last.sources?.length ?? 0,
    ].join(':')
  }, [activeSession?.messages])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' })
  }, [])

  // Round 6, Item B: with the keyboard open, Safari shrinks the visual
  // viewport and can leave the chat pane scrolled to a position that no
  // longer shows the latest turn above the composer. Scrolls to the
  // bottom once, on focus, rather than on every keystroke/resize — so it
  // never fights the user's own scroll afterward.
  const handleComposerFocus = useCallback(() => {
    scrollToBottom('auto')
  }, [scrollToBottom])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const onScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight
      shouldStickToBottomRef.current = distanceFromBottom < 120
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  useLayoutEffect(() => {
    if (!shouldStickToBottomRef.current) return
    scrollToBottom(messagePairs.length <= 1 ? 'auto' : 'smooth')
  }, [lastTurnScrollKey, activeChatId, messagePairs.length, scrollToBottom])

  // UX P0-3: switching away from a chat that's still streaming must not
  // leave the new chat's composer stuck on "Stop" waiting for the OLD
  // chat's request to finish. Aborts the in-flight request, resets the
  // composer to idle immediately (sendQuery.reset(), rather than waiting on
  // the aborted fetch promise to reject and settle asynchronously), and
  // marks the old chat's in-progress answer as interrupted in place.
  const abortActiveResponse = useCallback(() => {
    const controller = abortControllerRef.current
    if (!controller) return

    const chatId = activeChatId
    controller.abort('navigation')
    abortControllerRef.current = null
    sendQuery.reset()

    const session = sessionsRef.current.find((s) => s.id === chatId)
    const lastMsg = session?.messages[session.messages.length - 1]
    const interrupted: ChatMessage | undefined =
      lastMsg && lastMsg.role === 'assistant' && (lastMsg.status === 'thinking' || lastMsg.status === 'streaming')
        ? { ...lastMsg, status: 'complete', interrupted: true, liveText: '', progressLabel: undefined }
        : undefined

    if (interrupted) {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== chatId) return s
          const messages = [...s.messages]
          messages[messages.length - 1] = interrupted
          return { ...s, messages }
        }),
      )
      chatStore.recordAssistantMessage(chatId, interrupted)
    }
  }, [activeChatId, sendQuery, setSessions, chatStore.recordAssistantMessage])

  const handleNewChat = useCallback(() => {
    abortActiveResponse()
    chatStore.createChat()
  }, [abortActiveResponse, chatStore.createChat])

  const handleSelectChat = useCallback(
    (chatId: string) => {
      if (chatId !== activeChatId) abortActiveResponse()
      setActiveChatId(chatId)
    },
    [abortActiveResponse, activeChatId, setActiveChatId],
  )

  const handleRenameChat = chatStore.renameChat
  const handleDeleteChat = chatStore.deleteChat

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const updateAssistantMessage = useCallback(
    (chatId: string, updater: (msg: ChatMessage) => ChatMessage): ChatMessage | undefined => {
      // `updated` is computed from `sessionsRef` up front, then applied via
      // the setSessions updater below — not the other way around. React
      // doesn't always run a state updater synchronously (it can defer to
      // a later microtask, e.g. several calls back-to-back in one tick),
      // so a caller reading a value captured *inside* that updater right
      // after calling `setSessions` can't rely on it having run yet.
      const session = sessionsRef.current.find((s) => s.id === chatId)
      const lastMsg = session?.messages[session.messages.length - 1]
      if (!lastMsg || lastMsg.role !== 'assistant') return undefined
      const updated = updater(lastMsg)
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== chatId) return s
          const messages = [...s.messages]
          const lastIdx = messages.length - 1
          if (lastIdx < 0 || messages[lastIdx].role !== 'assistant') return s
          messages[lastIdx] = updated
          return { ...s, messages }
        }),
      )
      return updated
    },
    [setSessions],
  )

  const handleSend = useCallback(
    async (text: string, options?: { displayText?: string }) => {
      const selectedDocs = [...selection.selectedIds]
      if (selectedDocs.length === 0) {
        message.warning('Select at least one document before asking a question.')
        return
      }

      setInputBlockedReason(undefined)

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      lastProgressStageRef.current = undefined
      hadPartialAnswerRef.current = false
      abstainedRef.current = false
      const startedAt = Date.now()

      const elapsedSeconds = () => Math.max(1, Math.round((Date.now() - startedAt) / 1000))

      const friendlyQueryError = (raw: string | undefined, httpStatus?: number) =>
        toUserFacingQueryError(raw, {
          progressLabel: formatProgressStage(lastProgressStageRef.current),
          hadPartialAnswer: hadPartialAnswerRef.current,
          httpStatus,
        })

      let scopeDocuments = selectedDocs
      // Display names of the documents actually in scope for this query —
      // resolved once scope validation succeeds, used to personalize the
      // "retrieving" progress label ("Searching A.pdf and B.pdf") and,
      // together with `scopeFolders` below, to seed the progress ticker
      // (`ChatMessage.tsx`'s `progressTickerLabel`) that cycles through
      // them while the query is in flight.
      let scopeFilenames: string[] = []
      // Folder names covering the documents above, resolved the same way
      // (see `resolveProgressScope` in `queryProgress.ts` for how — it
      // goes through the browse tree's folder cache since
      // `BrowseDocumentItem` only carries a `folder_id`, not a name).
      let scopeFolders: string[] = []

      try {
        const scope = await validateQueryScope(selectedDocs, controller.signal)
        if (controller.signal.aborted) return

        const deniedCount = selectedDocs.length - scope.accessible_document_ids.length
        if (deniedCount > 0) {
          selection.trimSelection(scope.accessible_document_ids)
          message.warning(
            `${deniedCount} selected ${deniedCount === 1 ? 'document was' : 'documents were'} removed because you don't have access.`,
          )
        }

        scopeDocuments = scope.accessible_document_ids
        const resolvedScope = resolveProgressScope(
          scopeDocuments,
          selection.documentMeta,
          browse.getFolderNode,
        )
        scopeFilenames = resolvedScope.files
        scopeFolders = resolvedScope.folders

        if (scopeDocuments.length === 0) {
          const reason =
            scope.failed_files > 0
              ? 'None of the selected documents are ready to answer questions yet.'
              : 'No accessible documents in your selection.'
          setInputBlockedReason(reason)
          message.error(reason)
          return
        }

        if (scope.ready_files === 0 && scope.indexing_files > 0) {
          const reason = 'Documents are still being prepared. Please wait until at least one is ready.'
          setInputBlockedReason(reason)
          message.warning(reason)
          return
        }

        if (scope.ready_files === 0) {
          const reason = 'No ready documents in your selection.'
          setInputBlockedReason(reason)
          message.error(reason)
          return
        }

        if (scope.indexing_files > 0) {
          message.info(
            `${scope.indexing_files} selected ${scope.indexing_files === 1 ? 'document is' : 'documents are'} still being prepared. Answers may be incomplete.`,
          )
        }
      } catch (err) {
        if (controller.signal.aborted) return
        const httpStatus = err instanceof ApiError ? err.status : undefined
        const detail = friendlyQueryError(
          err instanceof ApiError ? err.detail ?? err.message : 'Validation failed',
          httpStatus,
        )
        message.error(detail)
        return
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: options?.displayText ?? text,
      }

      const assistantId = crypto.randomUUID()
      const question = options?.displayText ?? text
      const thinkingMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'thinking',
        startedAt,
        question,
        progressScopeFiles: scopeFilenames,
        progressScopeFolders: scopeFolders,
      }

      shouldStickToBottomRef.current = true

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeChatId
            ? { ...s, messages: [...s.messages, userMsg, thinkingMsg] }
            : s,
        ),
      )
      chatStore.recordUserMessage(activeChatId, userMsg, scopeDocuments)

      requestAnimationFrame(() => scrollToBottom('auto'))

      streamingCitationsRef.current = []
      const progressContext = () => ({
        filenames: scopeFilenames,
      })
      let coverage: CoverageInfo | undefined

      try {
        const response = await sendQuery.mutateAsync({
          chatId: activeChatId,
          message: text,
          documents: scopeDocuments,
          tier: queryTier,
          signal: controller.signal,
          callbacks: {
            onCoverage: (c) => {
              coverage = c
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                status: msg.content ? 'streaming' : 'thinking',
                coverage: c,
              }))
            },
            onProgress: (stage, payload) => {
              lastProgressStageRef.current = stage
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                status: msg.content ? 'streaming' : 'thinking',
                progressLabel: formatProgressStage(stage, payload, progressContext()),
                progressStage: stage,
              }))
            },
            onRoute: (strategy) => {
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                status: msg.content ? 'streaming' : 'thinking',
                progressLabel: msg.content ? undefined : formatRouteLabel(strategy),
              }))
            },
            onError: (rawMessage) => {
              const content = friendlyQueryError(rawMessage)
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                status: 'error',
                content,
                progressLabel: formatProgressStage(lastProgressStageRef.current),
              }))
            },
            onDelta: (text) => {
              hadPartialAnswerRef.current = true
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                status: 'streaming',
                liveText: (msg.liveText ?? '') + text,
                coverage: coverage ?? msg.coverage,
                progressLabel: undefined,
              }))
            },
            onAnswer: (delta) => {
              hadPartialAnswerRef.current = true
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                status: 'streaming',
                content: appendStreamDelta(msg.content, delta),
                // This segment just finalized into `content` — clear the
                // live preview so the next segment's deltas start fresh
                // rather than duplicating text already shown.
                liveText: '',
                coverage: coverage ?? msg.coverage,
              }))
            },
            onCitations: (batch) => {
              streamingCitationsRef.current = mergeCitations(
                streamingCitationsRef.current,
                batch,
              )
              const citations = streamingCitationsRef.current
              updateAssistantMessage(activeChatId, (msg) => {
                const next: ChatMessage = {
                  ...msg,
                  sources: citationsToSources(citations),
                }
                // Citations arrive right before the "generating" progress
                // event — if nothing has streamed in yet, show the
                // generating label now instead of waiting for that event.
                if (!msg.content) {
                  next.progressLabel = formatProgressStage('generating', {}, progressContext())
                  next.progressStage = 'generating'
                }
                return next
              })
            },
            onAbstention: () => {
              // Citations already shown were retrieval candidates, not
              // sources for an answer that was never written — clear them
              // rather than let them linger as if they backed the canned
              // "couldn't find relevant content" message that follows. The
              // progress label is cleared too: ChatMessage's "No matching
              // content" caption (driven by `abstained`, set below) takes
              // over as the explanation instead.
              streamingCitationsRef.current = []
              abstainedRef.current = true
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                sources: undefined,
                progressLabel: undefined,
              }))
            },
          },
        })

        if (controller.signal.aborted) return

        const assistantMsg: ChatMessage = {
          id: response.messageId,
          role: 'assistant',
          content: response.content,
          // Retrieval candidates shown mid-stream never back an abstained
          // answer — belt-and-braces alongside streamQuery already zeroing
          // its own `citations` on abstention.
          sources: abstainedRef.current ? undefined : response.sources,
          status: 'complete',
          thinkingSeconds: response.thinkingSeconds,
          coverage: response.coverage ?? coverage,
          abstained: abstainedRef.current,
          question,
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeChatId
              ? {
                  ...s,
                  // Sidebar titles are dated ("Session 15 Sep 2026 (1)"),
                  // set once at session creation — no longer overwritten
                  // with the first question.
                  messages: [...s.messages.slice(0, -1), assistantMsg],
                }
              : s,
          ),
        )
        chatStore.recordAssistantMessage(activeChatId, assistantMsg)
      } catch (err) {
        if (controller.signal.aborted) {
          // A "new chat" / "select another chat" abort (reason ===
          // 'navigation') already marked this exact message as interrupted
          // synchronously in abortActiveResponse — don't overwrite it here.
          // Only the explicit Stop button (no reason) needs handling in
          // this async continuation.
          if (controller.signal.reason !== 'navigation') {
            const stopped = updateAssistantMessage(activeChatId, (msg) => ({
              ...msg,
              content: msg.content || 'Response stopped.',
              status: 'complete',
              liveText: '',
              thinkingSeconds: elapsedSeconds(),
            }))
            if (stopped) chatStore.recordAssistantMessage(activeChatId, stopped)
          }
          return
        }

        const httpStatus = err instanceof ApiError ? err.status : undefined
        const detail = friendlyQueryError(
          err instanceof Error ? err.message : undefined,
          httpStatus,
        )
        message.error(detail, 8)
        const errored = updateAssistantMessage(activeChatId, (msg) => ({
          ...msg,
          content: detail,
          status: 'error',
          liveText: '',
          progressLabel: formatProgressStage(lastProgressStageRef.current),
          thinkingSeconds: elapsedSeconds(),
        }))
        if (errored) chatStore.recordAssistantMessage(activeChatId, errored)
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    },
    [
      activeChatId,
      queryTier,
      selection,
      browse,
      sendQuery,
      updateAssistantMessage,
      scrollToBottom,
      chatStore.recordUserMessage,
      chatStore.recordAssistantMessage,
      setSessions,
    ],
  )

  const selectedDocument = useMemo(() => {
    if (selection.selectedCount !== 1) return undefined
    const [documentId] = selection.selectedIds
    return documentId ? selection.documentMeta.get(documentId) : undefined
  }, [selection.documentMeta, selection.selectedCount, selection.selectedIds])

  const [isSummarizing, setIsSummarizing] = useState(false)
  const summarizingRef = useRef(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const extractingRef = useRef(false)
  const [isCategorizing, setIsCategorizing] = useState(false)
  const categorizingRef = useRef(false)

  const selectedDocumentFolder = useMemo(
    () => (selectedDocument ? browse.getFolderNode(selectedDocument.folder_id) : undefined),
    [browse.getFolderNode, selectedDocument],
  )

  const summarizeDisabledReason = useMemo(
    () =>
      getSummarizeDisabledReason({
        selectedCount: selection.selectedCount,
        document: selectedDocument,
        isResponding: sendQuery.isPending || isSummarizing || isExtracting || isCategorizing,
        disabled: browse.sessionExpired,
      }),
    [
      browse.sessionExpired,
      isCategorizing,
      isExtracting,
      isSummarizing,
      selectedDocument,
      selection.selectedCount,
      sendQuery.isPending,
    ],
  )

  const extractMetadataDisabledReason = useMemo(
    () =>
      getExtractMetadataDisabledReason({
        selectedCount: selection.selectedCount,
        document: selectedDocument,
        isResponding: sendQuery.isPending || isSummarizing || isExtracting || isCategorizing,
        disabled: browse.sessionExpired,
      }),
    [
      browse.sessionExpired,
      isCategorizing,
      isExtracting,
      isSummarizing,
      selectedDocument,
      selection.selectedCount,
      sendQuery.isPending,
    ],
  )

  const categorizeDisabledReason = useMemo(
    () =>
      getCategorizeDisabledReason({
        selectedCount: selection.selectedCount,
        document: selectedDocument,
        folder: selectedDocumentFolder,
        isResponding: sendQuery.isPending || isSummarizing || isExtracting || isCategorizing,
        disabled: browse.sessionExpired,
      }),
    [
      browse.sessionExpired,
      isCategorizing,
      isExtracting,
      isSummarizing,
      selectedDocument,
      selectedDocumentFolder,
      selection.selectedCount,
      sendQuery.isPending,
    ],
  )

  const handleSummarize = useCallback(() => {
    if (summarizeDisabledReason) {
      message.warning(summarizeDisabledReason)
      return
    }
    if (!selectedDocument || !isSummaryReady(selectedDocument)) return
    if (summarizingRef.current) return

    const documentId = selectedDocument.document_id
    summarizingRef.current = true
    setIsSummarizing(true)

    void (async () => {
      try {
        const response = await fetchDocumentSummary(documentId)
        const summary = response.summary?.trim()

        if (!summary) {
          message.warning('Summary is not available for this document')
          return
        }

        const { userMessage, assistantMessage } = buildSummaryMessages(summary)

        shouldStickToBottomRef.current = true
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeChatId
              ? { ...s, messages: [...s.messages, userMessage, assistantMessage] }
              : s,
          ),
        )
        requestAnimationFrame(() => scrollToBottom('auto'))
      } catch (err) {
        const httpStatus = err instanceof ApiError ? err.status : undefined
        const raw =
          err instanceof ApiError
            ? (err.detail ?? err.message)
            : err instanceof Error
              ? err.message
              : undefined
        message.error(toUserFacingQueryError(raw, { httpStatus }))
      } finally {
        summarizingRef.current = false
        setIsSummarizing(false)
      }
    })()
  }, [activeChatId, scrollToBottom, selectedDocument, summarizeDisabledReason])

  const handleExtractMetadata = useCallback(() => {
    if (extractMetadataDisabledReason) {
      message.warning(extractMetadataDisabledReason)
      return
    }
    if (!selectedDocument || !isMqaMetadataReady(selectedDocument)) return
    if (extractingRef.current) return

    const documentId = selectedDocument.document_id
    const filename = selectedDocument.filename
    extractingRef.current = true
    setIsExtracting(true)

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Extract MQA metadata from ${filename}`,
    }
    const assistantId = crypto.randomUUID()
    const thinkingMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'thinking',
      progressLabel: 'Extracting metadata. This can take up to a minute.',
    }

    shouldStickToBottomRef.current = true
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeChatId
          ? { ...s, messages: [...s.messages, userMsg, thinkingMsg] }
          : s,
      ),
    )
    requestAnimationFrame(() => scrollToBottom('auto'))

    void (async () => {
      try {
        const response = await extractMqaMetadata(documentId, controller.signal)
        if (controller.signal.aborted) return

        const content = buildMqaMetadataAnswer(response)
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== activeChatId) return s
            const messages = [...s.messages]
            const idx = messages.findIndex((m) => m.id === assistantId)
            if (idx === -1) return s
            messages[idx] = {
              ...messages[idx],
              content,
              status: 'complete',
              progressLabel: undefined,
            }
            return { ...s, messages }
          }),
        )
        requestAnimationFrame(() => scrollToBottom('auto'))
      } catch (err) {
        if (controller.signal.aborted) return

        const httpStatus = err instanceof ApiError ? err.status : undefined
        const detail =
          httpStatus === 401
            ? toUserFacingQueryError(undefined, { httpStatus })
            : toUserFacingMqaMetadataError(err instanceof ApiError ? err.detail : undefined)
        message.error(detail, 8)

        // Remove the thinking placeholder — the failed request appended
        // no answer, so nothing should linger where it was shown. The
        // user's "Extract MQA metadata from <filename>" message stays.
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeChatId
              ? { ...s, messages: s.messages.filter((m) => m.id !== assistantId) }
              : s,
          ),
        )
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
        extractingRef.current = false
        setIsExtracting(false)
      }
    })()
  }, [activeChatId, extractMetadataDisabledReason, scrollToBottom, selectedDocument])

  const handleCategorize = useCallback(() => {
    if (categorizeDisabledReason) {
      message.warning(categorizeDisabledReason)
      return
    }
    if (!selectedDocument) return
    if (categorizingRef.current) return

    const documentId = selectedDocument.document_id
    const filename = selectedDocument.filename
    categorizingRef.current = true
    setIsCategorizing(true)

    void (async () => {
      let userMsg: ChatMessage
      let assistantMsg: ChatMessage

      try {
        const response = await categorizeDocument(documentId)
        ;({ userMessage: userMsg, assistantMessage: assistantMsg } = buildCategorizeMessages(
          filename,
          response,
        ))
      } catch (err) {
        // Never a fatal screen: every failure — a mapped adapter error or
        // anything unexpected — still appends a chat message instead of
        // throwing or leaving the composer stuck.
        userMsg = {
          id: crypto.randomUUID(),
          role: 'user',
          content: `Categorize "${filename}"`,
        }
        assistantMsg = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: categorizeErrorMessage(err),
          status: 'complete',
        }
      }

      shouldStickToBottomRef.current = true
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeChatId ? { ...s, messages: [...s.messages, userMsg, assistantMsg] } : s,
        ),
      )
      requestAnimationFrame(() => scrollToBottom('auto'))

      categorizingRef.current = false
      setIsCategorizing(false)
    })()
  }, [activeChatId, categorizeDisabledReason, scrollToBottom, selectedDocument])

  return (
    <div
      className="docu-app-shell flex flex-col min-h-0"
      style={visualViewportHeight != null ? { height: `${visualViewportHeight}px` } : undefined}
    >
      {isNarrowLayout && (
        <div
          className="flex items-center gap-2 h-12 px-3 shrink-0 border-b border-[#ececec] bg-[var(--docu-bg-surface)] pt-[env(safe-area-inset-top,0px)]"
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="docu-mobile-topbar-menu"
            aria-label="Open menu"
          >
            <ChatMenuIcon />
          </button>
          <span className={`shrink-0 font-semibold ${typeColor.primary}`}>ARCHE AI</span>
          <span className={`truncate min-w-0 flex-1 ${type.caption} ${typeColor.muted}`}>
            {activeSession?.title}
          </span>
        </div>
      )}

      <Layout className="flex-1 min-h-0">
        {!isNarrowLayout && (
          <div
            ref={sidebarRef}
            className={`flex shrink-0 h-full docu-sidebar-wrapper ${isResizing ? 'docu-sidebar-resizing' : ''}`}
          >
            <div
              className="docu-sidebar-panel h-full shrink-0 overflow-hidden"
              style={{ width: sidebarWidth }}
            >
              <Sidebar
                width={sidebarWidth}
                sessions={sessions}
                sharedSessions={sharedSessions}
                projects={chatStore.projects}
                activeChatId={activeChatId}
                browse={browse}
                selection={selection}
                onSelectChat={handleSelectChat}
                onRenameChat={handleRenameChat}
                onDeleteChat={handleDeleteChat}
                onNewChat={handleNewChat}
                onMoveChat={chatStore.moveChat}
                onShareChat={chatStore.shareChat}
                onCreateProject={chatStore.createProject}
                onRenameProject={chatStore.renameProject}
                onDeleteProject={chatStore.deleteProject}
              />
            </div>
            <SidebarResizeHandle onPointerDown={startResize} isResizing={isResizing} />
          </div>
        )}
        <Layout className="!bg-[var(--docu-bg-app)]">
          <Content className="flex flex-col h-full min-h-0">
            <div
              ref={scrollContainerRef}
              className="docu-chat-scroll flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-4 min-h-0 scroll-smooth flex flex-col"
            >
              {/* max-w-3xl (48rem) — the conversation column width of a
                  mainstream AI-chat layout (client feedback: UI polish
                  pass), matched by the composer's own column below. */}
              <div
                className={`max-w-3xl mx-auto w-full min-w-0 flex-1 flex flex-col space-y-0 ${
                  messagePairs.length === 0 ? 'justify-center' : ''
                }`}
              >
                {messagePairs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center px-4 py-8">
                    <div className="w-12 h-12 rounded-xl bg-[var(--docu-bg-muted)] flex items-center justify-center mb-4 text-[var(--docu-text-muted)]">
                      <ChatBubbleIconLg />
                    </div>
                    <p className={`${typeColor.primary} ${type.body} font-semibold mb-1`}>
                      How can I help with your documents?
                    </p>
                    <p className={`${typeColor.muted} ${type.caption}`}>
                      Select files in the sidebar, then ask a question.
                    </p>
                  </div>
                ) : (
                  messagePairs.map((pair, idx) => {
                    const isLastTurn = idx === messagePairs.length - 1
                    return (
                      <div
                        key={pair.user.id}
                        className={`min-w-0 ${isLastTurn ? 'docu-chat-last-turn min-h-[min(72vh,calc(100dvh-13rem))]' : ''}`}
                      >
                        <ChatMessageItem message={pair.user} currentUsername={currentUsername} />
                        {pair.assistant && (
                          <ChatMessageItem
                            message={pair.assistant}
                            showDivider={!isLastTurn}
                          />
                        )}
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} className="h-px shrink-0" aria-hidden />
              </div>
            </div>
            <ChatInput
              selectedCount={selection.selectedCount}
              selectedFiles={selection.selectedFilenames}
              onClearSelection={selection.clearSelection}
              onSend={handleSend}
              onSummarize={handleSummarize}
              onCategorize={handleCategorize}
              onExtractMetadata={handleExtractMetadata}
              onStop={handleStop}
              onComposerFocus={handleComposerFocus}
              isResponding={sendQuery.isPending}
              disabled={browse.sessionExpired}
              disabledReason={inputBlockedReason}
              summarizeDisabledReason={summarizeDisabledReason}
              categorizeDisabledReason={categorizeDisabledReason}
              extractMetadataDisabledReason={extractMetadataDisabledReason}
              queryTier={queryTier}
              onQueryTierChange={setQueryTier}
              viewOnly={isSharedViewOnly}
              viewOnlyPlaceholder="View only — the owner has not allowed questions here"
            />
          </Content>
        </Layout>
      </Layout>

      {/* Rendered as a sibling of the <Layout> tree above, not nested
          inside it: antd's Sider registers itself with the *nearest*
          ancestor Layout via context regardless of DOM portal placement, so
          nesting this Drawer's Sidebar (which renders a Sider) inside the
          outer Layout would flip it into row-direction layout even though
          the top bar and chat pane need to stay stacked vertically. */}
      {isNarrowLayout && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size="min(88vw, 360px)"
          // A visible close affordance beyond the mask/Escape — top-right
          // ("end") to match the hamburger's opposite corner. `closeIcon`
          // reuses `ChatCloseIcon` (the same MUI icon already used for the
          // composer's "Clear selection" button) rather than antd's own
          // `CloseOutlined`, for the same reason the top bar's hamburger
          // uses an MUI icon: `@ant-design/icons` is only antd's own
          // transitive dependency, never imported directly anywhere in
          // `src/`, and every other icon in this app goes through MUI +
          // `appIcon`. `classNames.close` puts the button's own size/colour
          // in the unlayered `.docu-mobile-drawer-close` rule (src/index.css)
          // rather than fighting antd's `button { color; font-size; ...}`
          // reset with layered Tailwind.
          closable={{ placement: 'end', 'aria-label': 'Close menu' }}
          closeIcon={<ChatCloseIcon />}
          classNames={{ close: 'docu-mobile-drawer-close' }}
          // Fix round 1: the close button used to be the header's only
          // content — an empty ~56px strip above Sidebar's own "ARCHE AI"
          // row. `title` puts the wordmark in antd's own header slot
          // (which already lays out title + close button as one flex
          // row), so they share a row instead; Sidebar itself skips its
          // internal wordmark for this `inDrawer` instance (see
          // Sidebar.tsx) so it isn't rendered twice. Header padding
          // matches the sidebar body's own inset (`spacing.panelLg`,
          // 0.625rem) for a continuous left/right edge between the header
          // row and the "New chat" row directly under it.
          title={<span className={`text-lg font-semibold ${typeColor.primary}`}>ARCHE AI</span>}
          styles={{ header: { padding: '0.625rem' }, body: { padding: 0 } }}
        >
          <Sidebar
            width="100%"
            sessions={sessions}
            sharedSessions={sharedSessions}
            projects={chatStore.projects}
            activeChatId={activeChatId}
            browse={browse}
            selection={selection}
            onSelectChat={handleSelectChat}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
            onNewChat={handleNewChat}
            onMoveChat={chatStore.moveChat}
            onShareChat={chatStore.shareChat}
            onCreateProject={chatStore.createProject}
            onRenameProject={chatStore.renameProject}
            onDeleteProject={chatStore.deleteProject}
            onNavigate={() => setDrawerOpen(false)}
            inDrawer
          />
        </Drawer>
      )}
    </div>
  )
}
