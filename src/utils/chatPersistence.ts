import type { ChatMessage, ChatSession } from '../types'

const STORAGE_VERSION = 1
const MAX_SESSIONS = 40

export interface StoredChatHistory {
  version: typeof STORAGE_VERSION
  activeChatId: string
  sessions: ChatSession[]
  updatedAt: string
}

function storageKey(userId: string): string {
  return `docu_chat_history_${userId}`
}

function sanitizeMessage(message: ChatMessage): ChatMessage {
  // UX P1-4: a message still mid-stream at persist time (page reload,
  // browser hiccup) must be kept, not silently dropped — with whatever
  // text had arrived so far, plus a note explaining it was interrupted so
  // it renders as *something happened here*, not a vanished answer. If
  // nothing had arrived yet, this is just the question with the note.
  const wasInterrupted = message.status === 'thinking' || message.status === 'streaming'
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    fileTags: message.fileTags,
    sources: message.sources,
    status: message.status === 'error' ? 'error' : 'complete',
    interrupted: wasInterrupted || message.interrupted,
    thinkingSeconds: message.thinkingSeconds,
    coverage: message.coverage,
    abstained: message.abstained,
  }
}

function sanitizeSession(session: ChatSession): ChatSession {
  const messages = session.messages.map(sanitizeMessage)
  return {
    id: session.id,
    title: session.title.trim() || 'New chat',
    messages,
    createdAt: session.createdAt,
  }
}

export function loadChatHistory(userId: string): StoredChatHistory | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredChatHistory
    if (parsed.version !== STORAGE_VERSION) return null
    if (!Array.isArray(parsed.sessions) || typeof parsed.activeChatId !== 'string') {
      return null
    }
    const sessions = parsed.sessions.map(sanitizeSession).filter((s) => s.messages.length > 0 || s.title)
    if (sessions.length === 0) return null
    // `activeChatId` is returned as-is, even when it doesn't match any of
    // `sessions` here — this payload only ever holds the viewer's OWN
    // chats, but the last active one may legitimately have been a shared
    // chat that lives in a separate list entirely. Callers that need "is
    // this still a real chat" check it against every list they have
    // (own + shared), not just this one.
    return { ...parsed, sessions, activeChatId: parsed.activeChatId }
  } catch {
    return null
  }
}

export function persistChatHistory(
  userId: string,
  sessions: ChatSession[],
  activeChatId: string,
): void {
  const sanitized = sessions.map(sanitizeSession).slice(0, MAX_SESSIONS)
  if (sanitized.length === 0) return

  // Stored as given, even when it names a chat outside `sessions` (e.g. a
  // shared chat — this payload only ever holds the viewer's own) — see
  // `loadChatHistory`'s matching comment.
  const payload: StoredChatHistory = {
    version: STORAGE_VERSION,
    activeChatId,
    sessions: sanitized,
    updatedAt: new Date().toISOString(),
  }

  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(payload))
  } catch {
    // Quota exceeded or private mode — chat still works in memory.
  }
}

export function clearChatHistory(userId: string): void {
  localStorage.removeItem(storageKey(userId))
}
