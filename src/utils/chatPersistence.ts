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

function sanitizeMessage(message: ChatMessage): ChatMessage | null {
  if (message.status === 'thinking' || message.status === 'streaming') {
    return null
  }
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    fileTags: message.fileTags,
    sources: message.sources,
    status: message.status === 'error' ? 'error' : 'complete',
    thinkingSeconds: message.thinkingSeconds,
    coverage: message.coverage,
  }
}

function sanitizeSession(session: ChatSession): ChatSession {
  const messages = session.messages
    .map(sanitizeMessage)
    .filter((message): message is ChatMessage => message !== null)
  return {
    id: session.id,
    title: session.title.trim() || 'New chat',
    messages,
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
    const activeChatId = sessions.some((s) => s.id === parsed.activeChatId)
      ? parsed.activeChatId
      : sessions[0].id
    return { ...parsed, sessions, activeChatId }
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

  const resolvedActiveId = sanitized.some((s) => s.id === activeChatId)
    ? activeChatId
    : sanitized[0].id

  const payload: StoredChatHistory = {
    version: STORAGE_VERSION,
    activeChatId: resolvedActiveId,
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
