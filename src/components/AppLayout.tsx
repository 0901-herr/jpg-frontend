import { Layout } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSendQuery } from '../hooks/mutations/useSendQuery'
import { useDocuments } from '../hooks/queries/useDocuments'
import { useResizableWidth } from '../hooks/useResizableWidth'
import { type, typeColor } from '../styles/typography'
import { parseDocumentMentions } from '../utils/documentMentions'
import type { ChatMessage, ChatSession } from '../types'
import type { DocumentItem } from '../api/types/documents'
import ChatInput from './ChatInput'
import ChatMessageItem from './ChatMessage'
import DocumentPreview from './DocumentPreview'
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

export default function AppLayout() {
  const initialSessionRef = useRef<ChatSession>(createEmptySession())
  const [sessions, setSessions] = useState<ChatSession[]>([initialSessionRef.current])
  const [activeChatId, setActiveChatId] = useState(initialSessionRef.current.id)
  const [previewDocument, setPreviewDocument] = useState<DocumentItem | null>(null)
  const { width: sidebarWidth, isResizing, startResize, sidebarRef } = useResizableWidth()
  const sendQuery = useSendQuery()
  const { documents } = useDocuments()
  const abortControllerRef = useRef<AbortController | null>(null)

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
    setPreviewDocument(null)
    const newChat = createEmptySession()
    setSessions((prev) => [newChat, ...prev])
    setActiveChatId(newChat.id)
  }, [])

  const handleSelectChat = useCallback((chatId: string) => {
    setPreviewDocument(null)
    setActiveChatId(chatId)
  }, [])

  const handleRenameChat = useCallback((chatId: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === chatId ? { ...s, title } : s)),
    )
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

  const handleSend = useCallback(
    async (text: string) => {
      const parsed = parseDocumentMentions(text, documents)

      if (parsed.ambiguousMention) {
        const clarifyMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Multiple documents match "@${parsed.ambiguousMention}". Use the full filename, e.g. @Outpatient.pdf`,
          status: 'complete',
        }
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeChatId
              ? { ...s, messages: [...s.messages, { id: crypto.randomUUID(), role: 'user', content: text }, clarifyMsg] }
              : s,
          ),
        )
        return
      }

      if (parsed.unknownMention) {
        const clarifyMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I couldn't find a document matching "@${parsed.unknownMention}". Type @ to see available files.`,
          status: 'complete',
        }
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeChatId
              ? { ...s, messages: [...s.messages, { id: crypto.randomUUID(), role: 'user', content: text }, clarifyMsg] }
              : s,
          ),
        )
        return
      }

      const queryText =
        parsed.query ||
        (parsed.documentId ? 'What are the key details in this document?' : text)

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      const startedAt = Date.now()

      const elapsedSeconds = () => Math.max(1, Math.round((Date.now() - startedAt) / 1000))

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
      }

      const thinkingMsg: ChatMessage = {
        id: crypto.randomUUID(),
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

      try {
        const response = await sendQuery.mutateAsync({
          chatId: activeChatId,
          message: queryText,
          sessionId: activeChatId,
          signal: controller.signal,
          documentId: parsed.documentId,
        })

        if (controller.signal.aborted) return

        const assistantMsg: ChatMessage = {
          id: response.messageId,
          role: 'assistant',
          content: response.content,
          fileTags: response.fileTags,
          sources: response.sources,
          status: 'complete',
          thinkingSeconds: response.thinkingSeconds,
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeChatId
              ? {
                  ...s,
                  title: s.messages.length <= 2 ? queryText.slice(0, 40) : s.title,
                  messages: [...s.messages.slice(0, -1), assistantMsg],
                }
              : s,
          ),
        )
      } catch (err) {
        if (controller.signal.aborted) {
          const stoppedMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Response stopped.',
            status: 'complete',
            thinkingSeconds: elapsedSeconds(),
          }

          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeChatId
                ? { ...s, messages: [...s.messages.slice(0, -1), stoppedMsg] }
                : s,
            ),
          )
          return
        }

        const detail =
          err instanceof Error && err.message ? err.message : 'Request failed'
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Something went wrong: ${detail}`,
          status: 'complete',
          thinkingSeconds: elapsedSeconds(),
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeChatId
              ? { ...s, messages: [...s.messages.slice(0, -1), errorMsg] }
              : s,
          ),
        )
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null
        }
      }
    },
    [activeChatId, documents, sendQuery],
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
            selectedDocumentId={previewDocument?.doc_id ?? null}
            onSelectChat={handleSelectChat}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
            onNewChat={handleNewChat}
            onSelectDocument={setPreviewDocument}
          />
        </div>
        <SidebarResizeHandle onPointerDown={startResize} isResizing={isResizing} />
      </div>
      <Layout className="!bg-white">
        <Content className="flex flex-col h-full min-h-0">
          {previewDocument ? (
            <DocumentPreview document={previewDocument} />
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-8 pt-8 min-h-0">
                <div className="max-w-3xl mx-auto space-y-0">
                  {messagePairs.length === 0 ? (
                    <p className={`${typeColor.muted} ${type.body} text-center mt-20`}>
                      Ask a question about your documents
                    </p>
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
                documents={documents}
                onSend={handleSend}
                onStop={handleStop}
                isResponding={sendQuery.isPending}
              />
            </>
          )}
        </Content>
      </Layout>
    </Layout>
  )
}
