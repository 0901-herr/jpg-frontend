import { CommentOutlined } from '@ant-design/icons'
import { Layout, message } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { validateQueryScope } from '../api/browse'
import { ApiError } from '../api/http'
import type { Citation } from '../api/types/query'
import { useSendQuery } from '../hooks/mutations/useSendQuery'
import type { DocumentsLoadedEvent } from '../hooks/useBrowseTree'
import { useBrowseTree } from '../hooks/useBrowseTree'
import { useDocumentSelection } from '../hooks/useDocumentSelection'
import { useResizableWidth } from '../hooks/useResizableWidth'
import { type, typeColor } from '../styles/typography'
import { citationsToSources, mergeCitations } from '../utils/citations'
import { appendStreamDelta } from '../utils/appendStreamDelta'
import { formatProgressStage, formatRouteLabel } from '../utils/queryProgress'
import { toUserFacingQueryError } from '../utils/userFacingErrors'
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

export default function AppLayout() {
  const initialSessionRef = useRef<ChatSession>(createInitialSession())
  const [sessions, setSessions] = useState<ChatSession[]>([initialSessionRef.current])
  const [activeChatId, setActiveChatId] = useState(initialSessionRef.current.id)
  const [inputBlockedReason, setInputBlockedReason] = useState<string | undefined>()
  const { width: sidebarWidth, isResizing, startResize, sidebarRef } = useResizableWidth(280)
  const sendQuery = useSendQuery()
  const selection = useDocumentSelection()

  const handleDocumentsLoaded = useCallback(
    ({ documents, page }: DocumentsLoadedEvent) => {
      selection.registerDocuments(documents)
      selection.selectAllSelectable(documents, { replace: page === 0 })
    },
    [selection.registerDocuments, selection.selectAllSelectable],
  )

  const browse = useBrowseTree(handleDocumentsLoaded)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingCitationsRef = useRef<Citation[]>([])
  const lastProgressStageRef = useRef<string | undefined>(undefined)
  const hadPartialAnswerRef = useRef(false)

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
    async (text: string) => {
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

      const friendlyQueryError = (raw: string | undefined) =>
        toUserFacingQueryError(raw, {
          progressLabel: formatProgressStage(lastProgressStageRef.current),
          hadPartialAnswer: hadPartialAnswerRef.current,
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
        const detail = err instanceof ApiError ? err.detail ?? err.message : 'Validation failed'
        message.error(detail)
        return
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
      }

      const assistantId = crypto.randomUUID()
      const thinkingMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'thinking',
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeChatId
            ? { ...s, messages: [...s.messages, userMsg, thinkingMsg] }
            : s,
        ),
      )

      streamingCitationsRef.current = []
      let coverage: CoverageInfo | undefined

      try {
        const response = await sendQuery.mutateAsync({
          chatId: activeChatId,
          message: text,
          documents: scopeDocuments,
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
            onAnswer: (delta) => {
              hadPartialAnswerRef.current = true
              updateAssistantMessage(activeChatId, (msg) => ({
                ...msg,
                status: 'streaming',
                content: appendStreamDelta(msg.content, delta),
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
                  title: s.messages.length <= 2 ? text.slice(0, 40) : s.title,
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
            thinkingSeconds: elapsedSeconds(),
          }))
          return
        }

        const detail = friendlyQueryError(
          err instanceof Error ? err.message : undefined,
        )
        message.error(detail, 8)
        updateAssistantMessage(activeChatId, (msg) => ({
          ...msg,
          content: detail,
          status: 'error',
          progressLabel: formatProgressStage(lastProgressStageRef.current),
          thinkingSeconds: elapsedSeconds(),
        }))
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    },
    [activeChatId, selection, sendQuery, updateAssistantMessage],
  )

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
          <div className="flex-1 overflow-y-auto px-6 pt-6 pb-4 min-h-0">
            <div className="max-w-3xl mx-auto space-y-0">
              {messagePairs.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center mt-24 px-4">
                  <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-4">
                    <CommentOutlined className="text-xl text-zinc-400" />
                  </div>
                  <p className={`${typeColor.secondary} ${type.body} font-medium mb-1`}>
                    Start a conversation
                  </p>
                  <p className={`${typeColor.muted} ${type.caption}`}>
                    Select documents in the sidebar, then ask a question
                  </p>
                </div>
              ) : (
                messagePairs.map((pair, idx) => (
                  <div key={pair.user.id}>
                    <ChatMessageItem message={pair.user} />
                    {pair.assistant && (
                      <ChatMessageItem
                        message={pair.assistant}
                        showDivider={idx < messagePairs.length - 1}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          <ChatInput
            selectedCount={selection.selectedCount}
            onClearSelection={selection.clearSelection}
            onSend={handleSend}
            onStop={handleStop}
            isResponding={sendQuery.isPending}
            disabled={browse.sessionExpired}
            disabledReason={inputBlockedReason}
          />
        </Content>
      </Layout>
    </Layout>
  )
}
