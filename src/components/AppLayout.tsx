import { Layout, message } from 'antd'
import { ChatBubbleIconLg } from '../icons/chat'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { extractMqaMetadata, fetchDocumentSummary, validateQueryScope } from '../api/browse'
import { ApiError } from '../api/http'
import type { Citation } from '../api/types/query'
import { AUTH_BYPASS, DEV_USER } from '../config/auth'
import { useAuth } from '../context/AuthContext'
import { useSendQuery } from '../hooks/mutations/useSendQuery'
import type { DocumentsLoadedEvent } from '../hooks/useBrowseTree'
import { useBrowseTree } from '../hooks/useBrowseTree'
import { useDocumentSelection } from '../hooks/useDocumentSelection'
import { useResizableWidth } from '../hooks/useResizableWidth'
import { type, typeColor } from '../styles/typography'
import { citationLabel, citationsToSources, displayFilename, mergeCitations } from '../utils/citations'
import { appendStreamDelta } from '../utils/appendStreamDelta'
import { formatProgressStage, formatRouteLabel } from '../utils/queryProgress'
import { loadChatHistory, persistChatHistory } from '../utils/chatPersistence'
import { getSummarizeDisabledReason, isSummaryReady } from '../utils/summaryGate'
import { getExtractMetadataDisabledReason, isMqaMetadataReady } from '../utils/mqaMetadataGate'
import { buildSummaryMessages } from '../utils/summaryMessages'
import { buildMqaMetadataAnswer } from '../utils/mqaMetadataMessage'
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

function createEmptySession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    messages: [],
  }
}

function createInitialSession(): ChatSession {
  if (isCitationLoadingDemoEnabled()) return createCitationLoadingDemoSession()
  if (isCitationDemoEnabled()) return createCitationDemoSession()
  return createEmptySession()
}

function chatPersistenceEnabled(): boolean {
  return !isCitationDemoEnabled() && !isCitationLoadingDemoEnabled()
}

export default function AppLayout() {
  const { session: authSession, isLoading: authLoading } = useAuth()
  const initialSessionRef = useRef<ChatSession>(createInitialSession())
  const [sessions, setSessions] = useState<ChatSession[]>([initialSessionRef.current])
  const [activeChatId, setActiveChatId] = useState(initialSessionRef.current.id)
  const [chatHydrated, setChatHydrated] = useState(false)
  const [inputBlockedReason, setInputBlockedReason] = useState<string | undefined>()
  const [queryTier, setQueryTier] = useState<QueryTier>(DEFAULT_QUERY_TIER)
  const { width: sidebarWidth, isResizing, startResize, sidebarRef } = useResizableWidth(280)
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
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingCitationsRef = useRef<Citation[]>([])
  // Distinct display names from citation events received so far this
  // query — a Set to de-duplicate while preserving first-seen order, fed
  // into the "generating" progress label ("Writing your answer from
  // A.pdf and B.pdf…").
  const citationFilenamesRef = useRef<Set<string>>(new Set())
  const lastProgressStageRef = useRef<string | undefined>(undefined)
  const hadPartialAnswerRef = useRef(false)

  const chatUserId = authSession?.userId ?? (AUTH_BYPASS ? DEV_USER.userId : null)

  useEffect(() => {
    if (authLoading) return
    if (!chatPersistenceEnabled()) {
      setChatHydrated(true)
      return
    }
    if (!chatUserId) {
      setChatHydrated(true)
      return
    }

    const stored = loadChatHistory(chatUserId)
    if (stored?.sessions.length) {
      setSessions(stored.sessions)
      setActiveChatId(stored.activeChatId)
    }
    setChatHydrated(true)
  }, [authLoading, chatUserId])

  useEffect(() => {
    if (!chatHydrated || !chatUserId || !chatPersistenceEnabled()) return
    persistChatHistory(chatUserId, sessions, activeChatId)
  }, [chatHydrated, chatUserId, sessions, activeChatId])

  useEffect(() => {
    if (sessions.length === 0) {
      const session = createEmptySession()
      setSessions([session])
      setActiveChatId(session.id)
    }
  }, [sessions.length])

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
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const hasAuthSession = Boolean(authSession)
  const hydrationScopeCheckedRef = useRef(false)
  useEffect(() => {
    if (authLoading) return
    if (!hasAuthSession) return
    if (hydrationScopeCheckedRef.current) return
    hydrationScopeCheckedRef.current = true

    const ids = [...selectionRef.current.selectedIds]
    if (ids.length === 0) return

    const controller = new AbortController()
    void (async () => {
      try {
        const scope = await validateQueryScope(ids, controller.signal)
        if (controller.signal.aborted) return
        selectionRef.current.trimSelection(scope.accessible_document_ids)
      } catch {
        // Best-effort reconciliation only — keep the persisted selection.
      }
    })()

    return () => controller.abort()
  }, [authLoading, hasAuthSession])

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeChatId) ?? sessions[0],
    [sessions, activeChatId],
  )

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

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== chatId) return s
        const messages = [...s.messages]
        const lastIdx = messages.length - 1
        if (lastIdx < 0 || messages[lastIdx].role !== 'assistant') return s
        const msg = messages[lastIdx]
        if (msg.status !== 'thinking' && msg.status !== 'streaming') return s
        messages[lastIdx] = {
          ...msg,
          status: 'complete',
          interrupted: true,
          liveText: '',
          progressLabel: undefined,
        }
        return { ...s, messages }
      }),
    )
  }, [activeChatId, sendQuery])

  const handleNewChat = useCallback(() => {
    abortActiveResponse()
    const newChat = createEmptySession()
    setSessions((prev) => [newChat, ...prev])
    setActiveChatId(newChat.id)
  }, [abortActiveResponse])

  const handleSelectChat = useCallback(
    (chatId: string) => {
      if (chatId !== activeChatId) abortActiveResponse()
      setActiveChatId(chatId)
    },
    [abortActiveResponse, activeChatId],
  )

  const handleRenameChat = useCallback((chatId: string, title: string) => {
    setSessions((prev) => prev.map((s) => (s.id === chatId ? { ...s, title } : s)))
  }, [])

  const handleDeleteChat = useCallback(
    (chatId: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== chatId)
        if (next.length === 0) {
          const fresh = createEmptySession()
          setActiveChatId(fresh.id)
          return [fresh]
        }
        if (chatId === activeChatId) {
          setActiveChatId(next[0].id)
        }
        return next
      })
    },
    [activeChatId],
  )

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const updateAssistantMessage = useCallback(
    (chatId: string, updater: (msg: ChatMessage) => ChatMessage) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== chatId) return s
          const messages = [...s.messages]
          const lastIdx = messages.length - 1
          if (lastIdx < 0 || messages[lastIdx].role !== 'assistant') return s
          messages[lastIdx] = updater(messages[lastIdx])
          return { ...s, messages }
        }),
      )
    },
    [],
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
      // "retrieving" progress label ("Searching A.pdf and B.pdf…").
      let scopeFilenames: string[] = []

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
        scopeFilenames = scopeDocuments
          .map((id) => selection.documentMeta.get(id)?.filename)
          .filter((name): name is string => Boolean(name))
          .map(displayFilename)

        if (scopeDocuments.length === 0) {
          const reason =
            scope.failed_files > 0
              ? 'None of the selected documents are ready to query (failed or not indexed).'
              : 'No accessible documents in your selection.'
          setInputBlockedReason(reason)
          message.error(reason)
          return
        }

        if (scope.ready_files === 0 && scope.indexing_files > 0) {
          const reason = 'Documents are still indexing. Please wait until at least one is ready.'
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
            `${scope.indexing_files} selected ${scope.indexing_files === 1 ? 'document is' : 'documents are'} still indexing. Answers may be incomplete.`,
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
      const thinkingMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'thinking',
        startedAt,
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

      streamingCitationsRef.current = []
      citationFilenamesRef.current = new Set()
      const progressContext = () => ({
        filenames: scopeFilenames,
        citationFilenames: [...citationFilenamesRef.current],
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
              for (const c of batch) {
                citationFilenamesRef.current.add(citationLabel(c))
              }
              updateAssistantMessage(activeChatId, (msg) => {
                const next: ChatMessage = {
                  ...msg,
                  sources: citationsToSources(citations),
                }
                // Citations arrive right before the "generating" progress
                // event — if nothing has streamed in yet, show the
                // generating label with the citation names now instead of
                // waiting for that event.
                if (!msg.content) {
                  next.progressLabel = formatProgressStage('generating', {}, progressContext())
                  next.progressStage = 'generating'
                }
                return next
              })
            },
          },
        })

        if (controller.signal.aborted) return

        const assistantMsg: ChatMessage = {
          id: response.messageId,
          role: 'assistant',
          content: response.content,
          sources: response.sources,
          status: 'complete',
          thinkingSeconds: response.thinkingSeconds,
          coverage: response.coverage ?? coverage,
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeChatId
              ? {
                  ...s,
                  title: s.messages.length <= 2 ? userMsg.content.slice(0, 40) : s.title,
                  messages: [...s.messages.slice(0, -1), assistantMsg],
                }
              : s,
          ),
        )
      } catch (err) {
        if (controller.signal.aborted) {
          // A "new chat" / "select another chat" abort (reason ===
          // 'navigation') already marked this exact message as interrupted
          // synchronously in abortActiveResponse — don't overwrite it here.
          // Only the explicit Stop button (no reason) needs handling in
          // this async continuation.
          if (controller.signal.reason !== 'navigation') {
            updateAssistantMessage(activeChatId, (msg) => ({
              ...msg,
              content: msg.content || 'Response stopped.',
              status: 'complete',
              liveText: '',
              thinkingSeconds: elapsedSeconds(),
            }))
          }
          return
        }

        const httpStatus = err instanceof ApiError ? err.status : undefined
        const detail = friendlyQueryError(
          err instanceof Error ? err.message : undefined,
          httpStatus,
        )
        message.error(detail, 8)
        updateAssistantMessage(activeChatId, (msg) => ({
          ...msg,
          content: detail,
          status: 'error',
          liveText: '',
          progressLabel: formatProgressStage(lastProgressStageRef.current),
          thinkingSeconds: elapsedSeconds(),
        }))
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    },
    [activeChatId, queryTier, selection, sendQuery, updateAssistantMessage, scrollToBottom],
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

  const summarizeDisabledReason = useMemo(
    () =>
      getSummarizeDisabledReason({
        selectedCount: selection.selectedCount,
        document: selectedDocument,
        isResponding: sendQuery.isPending || isSummarizing || isExtracting,
        disabled: browse.sessionExpired,
      }),
    [
      browse.sessionExpired,
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
        isResponding: sendQuery.isPending || isSummarizing || isExtracting,
        disabled: browse.sessionExpired,
      }),
    [
      browse.sessionExpired,
      isExtracting,
      isSummarizing,
      selectedDocument,
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
      progressLabel: 'Extracting metadata… this can take up to a minute.',
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

  return (
    <Layout className="h-screen">
      <div
        ref={sidebarRef}
        className={`flex shrink-0 h-screen docu-sidebar-wrapper ${isResizing ? 'docu-sidebar-resizing' : ''}`}
      >
        <div
          className="docu-sidebar-panel h-full shrink-0 overflow-hidden"
          style={{ width: sidebarWidth }}
        >
          <Sidebar
            width={sidebarWidth}
            sessions={sessions}
            activeChatId={activeChatId}
            browse={browse}
            selection={selection}
            onSelectChat={handleSelectChat}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
            onNewChat={handleNewChat}
          />
        </div>
        <SidebarResizeHandle onPointerDown={startResize} isResizing={isResizing} />
      </div>
      <Layout className="!bg-[var(--docu-bg-app)]">
        <Content className="flex flex-col h-full min-h-0">
          <div
            ref={scrollContainerRef}
            className="docu-chat-scroll flex-1 overflow-y-auto px-6 pt-6 pb-4 min-h-0 scroll-smooth flex flex-col"
          >
            <div
              className={`max-w-4xl mx-auto w-full flex-1 flex flex-col space-y-0 ${
                messagePairs.length === 0 ? 'justify-center' : ''
              }`}
            >
              {messagePairs.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center px-4 py-8">
                  <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-4 text-zinc-400">
                    <ChatBubbleIconLg />
                  </div>
                  <p className={`text-[#0d0d0d] ${type.body} font-semibold mb-1`}>
                    Start a conversation
                  </p>
                  <p className={`${typeColor.muted} ${type.caption}`}>
                    Select documents in the sidebar, then ask a question
                  </p>
                </div>
              ) : (
                messagePairs.map((pair, idx) => {
                  const isLastTurn = idx === messagePairs.length - 1
                  return (
                    <div
                      key={pair.user.id}
                      className={isLastTurn ? 'docu-chat-last-turn min-h-[min(72vh,calc(100dvh-13rem))]' : undefined}
                    >
                      <ChatMessageItem message={pair.user} />
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
            onExtractMetadata={handleExtractMetadata}
            onStop={handleStop}
            isResponding={sendQuery.isPending}
            disabled={browse.sessionExpired}
            disabledReason={inputBlockedReason}
            summarizeDisabledReason={summarizeDisabledReason}
            extractMetadataDisabledReason={extractMetadataDisabledReason}
            queryTier={queryTier}
            onQueryTierChange={setQueryTier}
          />
        </Content>
      </Layout>
    </Layout>
  )
}
