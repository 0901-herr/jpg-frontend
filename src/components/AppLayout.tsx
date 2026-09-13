import { Layout, message } from 'antd'
import { ChatBubbleIconLg } from '../icons/chat'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { validateQueryScope } from '../api/browse'
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
import { citationsToSources, mergeCitations } from '../utils/citations'
import { appendStreamDelta } from '../utils/appendStreamDelta'
import { formatProgressStage, formatRouteLabel } from '../utils/queryProgress'
import { loadChatHistory, persistChatHistory } from '../utils/chatPersistence'
import { getSummarizeDisabledReason, isSummaryReady } from '../utils/summaryGate'
import { buildSummaryPrompt } from '../utils/summaryPrompt'
import { DEFAULT_QUERY_TIER } from '../utils/queryTier'
import { toUserFacingQueryError } from '../utils/userFacingErrors'
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
      if (page === 0) {
        if (selection.selectedCount === 0) {
          selection.selectAllSelectable(documents, { replace: true })
        }
        return
      }
      selection.selectAllSelectable(documents, { replace: false })
    },
    [selection.registerDocuments, selection.selectAllSelectable, selection.selectedCount],
  )

  const browse = useBrowseTree(handleDocumentsLoaded)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingCitationsRef = useRef<Citation[]>([])
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

  const handleNewChat = useCallback(() => {
    const newChat = createEmptySession()
    setSessions((prev) => [newChat, ...prev])
    setActiveChatId(newChat.id)
  }, [])

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId)
  }, [])

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
            onProgress: (stage) => {
              lastProgressStageRef.current = stage
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                status: msg.content ? 'streaming' : 'thinking',
                progressLabel: formatProgressStage(stage),
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
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                sources: citationsToSources(citations),
              }))
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
          updateAssistantMessage(activeChatId, (msg) => ({
            ...msg,
            content: msg.content || 'Response stopped.',
            status: 'complete',
            liveText: '',
            thinkingSeconds: elapsedSeconds(),
          }))
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

  const summarizeDisabledReason = useMemo(
    () =>
      getSummarizeDisabledReason({
        selectedCount: selection.selectedCount,
        document: selectedDocument,
        isResponding: sendQuery.isPending,
        disabled: browse.sessionExpired,
      }),
    [
      browse.sessionExpired,
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
    if (!isSummaryReady(selectedDocument)) return
    const prompt = buildSummaryPrompt(1)
    if (!prompt) return
    void handleSend(prompt, { displayText: 'Summarize this document' })
  }, [handleSend, selectedDocument, summarizeDisabledReason])

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
            onStop={handleStop}
            isResponding={sendQuery.isPending}
            disabled={browse.sessionExpired}
            disabledReason={inputBlockedReason}
            summarizeDisabledReason={summarizeDisabledReason}
            queryTier={queryTier}
            onQueryTierChange={setQueryTier}
          />
        </Content>
      </Layout>
    </Layout>
  )
}
