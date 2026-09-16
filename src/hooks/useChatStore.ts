import { message } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChatProject,
  createChatSession,
  deleteChatProject,
  deleteChatSession,
  getChatSession,
  getSharedChatSession,
  listChatProjects,
  listChatSessions,
  patchChatSession,
  postChatMessage,
  renameChatProject,
} from '../api/chat'
import type { ChatMessageDto, ChatSessionDetailDto, ChatSessionSummaryDto } from '../api/types/chat'
import { ApiError } from '../api/http'
import { clearChatHistory, loadChatHistory } from '../utils/chatPersistence'
import type { ChatMessage, ChatProject, ChatSession, ChatVisibility, CoverageInfo, Source } from '../types'

const SESSION_TITLE_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** "15 Sep 2026" — day (no leading zero), short English month, full year. */
function formatSessionDate(date: Date): string {
  return `${date.getDate()} ${SESSION_TITLE_MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** "Session {date} (n)" — n is 1 + however many of `existingSessions` were
 * created on the same local calendar day. A session with no `createdAt`
 * (predates this field, or a demo/mock session) never counts toward that
 * total — its own title is left alone wherever it's displayed, and it
 * shouldn't silently renumber a same-day sibling either. */
function nextSessionTitle(existingSessions: ChatSession[], now: Date): string {
  const sameDay = existingSessions.filter(
    (s) => s.createdAt && isSameLocalDay(new Date(s.createdAt), now),
  )
  return `Session ${formatSessionDate(now)} (${sameDay.length + 1})`
}

/** `existingSessions` is whatever sessions this new one will sit alongside
 * — pass the current list so the "(n)" count is right; omit only when
 * there truly are none yet (first-ever session). */
export function createEmptySession(existingSessions: ChatSession[] = []): ChatSession {
  const now = new Date()
  return {
    id: crypto.randomUUID(),
    title: nextSessionTitle(existingSessions, now),
    createdAt: now.toISOString(),
    messages: [],
    projectId: null,
    visibility: 'private',
    shareToken: null,
    isOwner: true,
    canQuery: true,
    messageCount: 0,
  }
}

function mapMessageDto(dto: ChatMessageDto): ChatMessage {
  return {
    id: dto.id,
    role: dto.role,
    content: dto.content,
    authorUsername: dto.author_username,
    question: dto.question ?? undefined,
    fileTags: dto.file_tags ?? undefined,
    sources: (dto.sources as Source[] | undefined) ?? undefined,
    coverage: (dto.coverage as CoverageInfo | undefined) ?? undefined,
    status: (dto.status as ChatMessage['status'] | null | undefined) ?? undefined,
    abstained: dto.abstained ?? undefined,
    interrupted: dto.interrupted ?? undefined,
  }
}

function mapSummaryToSession(dto: ChatSessionSummaryDto): ChatSession {
  return {
    id: dto.id,
    title: dto.title,
    messages: [],
    createdAt: dto.created_at,
    projectId: dto.project_id,
    visibility: dto.visibility,
    shareToken: dto.share_token,
    isOwner: true,
    canQuery: true,
    messageCount: dto.message_count,
  }
}

function mapDetailToSession(dto: ChatSessionDetailDto): ChatSession {
  return {
    id: dto.id,
    title: dto.title,
    messages: dto.messages.map(mapMessageDto),
    createdAt: dto.created_at,
    projectId: dto.project_id,
    visibility: dto.visibility,
    shareToken: dto.share_token,
    ownerUsername: dto.owner_username,
    isOwner: dto.is_owner,
    canQuery: dto.can_query,
    messageCount: dto.messages.length,
    scopeDocumentIds: dto.scope_document_ids,
  }
}

const IMPORT_FAILURE_MESSAGE =
  'Could not save your existing chats online yet — they are still available here for now.'

/** One-time migration of a browser's local chat history into the server:
 * creates each stored session (keeping its id) and replays its messages in
 * order. Throws on the first failure so the caller can fall back to
 * keeping the local copy untouched rather than leaving a half-imported
 * mix behind. */
async function importLocalHistory(stored: ChatSession[]): Promise<ChatSession[]> {
  const imported: ChatSession[] = []
  for (const session of stored) {
    await createChatSession({ id: session.id, title: session.title })
    for (const msg of session.messages) {
      await postChatMessage(session.id, {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        question: msg.question,
        file_tags: msg.fileTags,
        sources: msg.sources,
        coverage: msg.coverage as Record<string, unknown> | undefined,
        status: msg.status,
        abstained: msg.abstained,
        interrupted: msg.interrupted,
      })
    }
    imported.push({
      ...session,
      isOwner: true,
      visibility: 'private',
      projectId: null,
      canQuery: true,
      messageCount: session.messages.length,
    })
  }
  return imported
}

export interface UseChatStoreParams {
  chatUserId: string | null
  authLoading: boolean
  /** False for the citation-demo flows (`config/demo.ts`) — the store then
   * behaves purely as local React state, never touching the network. */
  enabled: boolean
  initialSession: ChatSession
  /** True while a `?share=<token>` link is still being resolved by the
   * caller (parsed, not yet handed to `loadSharedSession`) — suppresses
   * the "never end up with zero own sessions" fallback so a first-time
   * visitor via a share link doesn't get a throwaway empty chat created
   * (and selected) out from under the shared one about to load. The
   * caller clears this once the share attempt resolves, at which point
   * the normal fallback resumes if still needed (e.g. a dead link). */
  hasPendingShare?: boolean
}

export interface UseChatStoreResult {
  sessions: ChatSession[]
  setSessions: Dispatch<SetStateAction<ChatSession[]>>
  sharedSessions: ChatSession[]
  /** Exposed so a caller can update a shared chat's own messages (e.g.
   * appending a query turn asked against it) the same way `setSessions`
   * does for an owned one — `sessions` and `sharedSessions` are separate
   * lists, so a message-append helper keyed only on chat id needs both
   * setters to find the right one. */
  setSharedSessions: Dispatch<SetStateAction<ChatSession[]>>
  projects: ChatProject[]
  activeChatId: string
  setActiveChatId: (id: string) => void
  hydrated: boolean
  createChat: () => void
  renameChat: (chatId: string, title: string) => void
  deleteChat: (chatId: string) => void
  moveChat: (chatId: string, projectId: string | null) => void
  shareChat: (chatId: string, visibility: ChatVisibility) => Promise<void>
  createProject: (name: string) => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => void
  /** Fire-and-forget: persists the just-appended user message (and the
   * scope it was asked against) — never blocks or throws into the caller,
   * the message is already showing locally either way. */
  recordUserMessage: (chatId: string, msg: ChatMessage, scopeDocumentIds: string[]) => void
  /** Fire-and-forget upsert of the assistant message by id — safe to call
   * repeatedly as the same turn progresses from streaming to done/error/
   * interrupted; the adapter updates the same row in place. */
  recordAssistantMessage: (chatId: string, msg: ChatMessage) => void
  loadSharedSession: (token: string) => Promise<ChatSession | null>
}

/** Owns every chat-store concern that used to live directly in AppLayout:
 * hydrating sessions/projects from the server (with a one-time
 * localStorage import for a browser that had local-only history),
 * projects and session CRUD, and posting user/assistant messages. Keeps
 * the streaming/abort logic itself in AppLayout (it needs the same
 * `setSessions` this hook exposes) — this hook is the persistence and
 * CRUD layer underneath it. */
export function useChatStore({
  chatUserId,
  authLoading,
  enabled,
  initialSession,
  hasPendingShare = false,
}: UseChatStoreParams): UseChatStoreResult {
  const [sessions, setSessions] = useState<ChatSession[]>([initialSession])
  const [sharedSessions, setSharedSessions] = useState<ChatSession[]>([])
  const [projects, setProjects] = useState<ChatProject[]>([])
  const [activeChatId, setActiveChatId] = useState(initialSession.id)
  const [hydrated, setHydrated] = useState(false)

  const activeChatIdRef = useRef(activeChatId)
  activeChatIdRef.current = activeChatId
  const sessionsRef = useRef<ChatSession[]>(sessions)
  sessionsRef.current = sessions
  const sharedSessionsRef = useRef<ChatSession[]>(sharedSessions)
  sharedSessionsRef.current = sharedSessions
  // Session ids whose messages are already known locally — created this
  // session, imported, or already fetched — so a chat is only ever
  // GET-ted once per app load.
  const loadedMessagesRef = useRef<Set<string>>(new Set([initialSession.id]))
  const hydrationRanRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      setHydrated(true)
      return
    }
    if (authLoading) return
    if (hydrationRanRef.current) return
    hydrationRanRef.current = true

    if (!chatUserId) {
      setHydrated(true)
      return
    }

    void (async () => {
      try {
        const listResp = await listChatSessions()
        let ownSessions = listResp.sessions.map(mapSummaryToSession)
        const shared = listResp.shared.map((s) => ({
          id: s.id,
          title: s.title,
          messages: [],
          isOwner: false,
          visibility: s.visibility,
          canQuery: s.visibility === 'query',
          ownerUsername: s.owner_username,
        }))

        // Gated on "localStorage still has history" rather than "the
        // server has zero sessions": a session can already exist
        // server-side (a prior import got partway through before failing)
        // while others are still stranded locally. Re-running the full
        // import is safe — `createChatSession`/`postChatMessage` upsert by
        // the client-supplied id, so an already-imported session is a
        // no-op 200, not a duplicate — and it's the only way a partial
        // failure ever gets a chance to finish on a later load. Once the
        // whole batch succeeds, `clearChatHistory` stops this from running
        // again.
        const stored = loadChatHistory(chatUserId)
        if (stored?.sessions.length) {
          try {
            const imported = await importLocalHistory(stored.sessions)
            const importedIds = new Set(imported.map((s) => s.id))
            ownSessions = [...imported, ...ownSessions.filter((s) => !importedIds.has(s.id))]
            clearChatHistory(chatUserId)
          } catch {
            // Still partially (or entirely) stuck locally — keep showing
            // whatever's already confirmed server-side, plus whichever
            // local sessions haven't made it there yet, so nothing
            // disappears. localStorage is deliberately left alone so the
            // next load retries.
            const ownIds = new Set(ownSessions.map((s) => s.id))
            const localOnly = stored.sessions
              .filter((s) => !ownIds.has(s.id))
              .map((s) => ({
                ...s,
                isOwner: true,
                visibility: 'private' as const,
                projectId: null,
                canQuery: true,
              }))
            ownSessions = [...ownSessions, ...localOnly]
            message.warning(IMPORT_FAILURE_MESSAGE)
          }
          for (const s of ownSessions) loadedMessagesRef.current.add(s.id)
        }

        if (ownSessions.length === 0 && !hasPendingShare) {
          const fresh = createEmptySession()
          loadedMessagesRef.current.add(fresh.id)
          ownSessions = [fresh]
        }

        setSessions(ownSessions)
        // Union by id, not a blind replace: `loadSharedSession` (exposed
        // to any caller, not just AppLayout's own gated `?share=` effect)
        // can add a shared session concurrently with this hydration pass
        // — its own load winning is exactly the point, so an entry it
        // already added is kept as-is rather than overwritten with the
        // thinner (message-less) summary this listing returns for it.
        setSharedSessions((prev) => {
          const merged = new Map(prev.map((s) => [s.id, s]))
          for (const s of shared) {
            if (!merged.has(s.id)) merged.set(s.id, s)
          }
          return [...merged.values()]
        })

        // A pending `?share=` link takes priority — the caller runs
        // `loadSharedSession` once hydration finishes and selects that
        // chat itself, so leave `activeChatId` alone here entirely
        // (there may be nothing in `ownSessions` to select anyway).
        if (ownSessions.length > 0 && !hasPendingShare) {
          // Resume the chat the viewer was last on (own or shared) rather
          // than always defaulting to the first own session — mirrors
          // `persistChatHistory`'s local backup, which stores this
          // regardless of which list the active chat actually belongs to.
          // Read from `stored` (captured above, before the import branch
          // above could have cleared it on success) rather than re-reading
          // localStorage now — it may already be gone by this point.
          const persistedActiveId = stored?.activeChatId
          const stillExists =
            persistedActiveId != null &&
            (ownSessions.some((s) => s.id === persistedActiveId) ||
              shared.some((s) => s.id === persistedActiveId))
          setActiveChatId(stillExists ? persistedActiveId : ownSessions[0].id)
        }

        try {
          const loadedProjects = await listChatProjects()
          setProjects(loadedProjects.map((p) => ({ id: p.id, name: p.name })))
        } catch {
          // Best-effort — the project group list is just empty until a
          // later successful fetch (e.g. creating one refetches nothing,
          // but at least the new one is appended locally).
        }
      } catch {
        // The whole server round-trip failed (offline, adapter down) —
        // never a blank/broken chat screen: fall back to whatever was in
        // localStorage before this feature existed, same as before.
        const stored = loadChatHistory(chatUserId)
        const fallback = stored?.sessions.length ? stored.sessions : [createEmptySession()]
        for (const s of fallback) loadedMessagesRef.current.add(s.id)
        setSessions(fallback)
        setActiveChatId(
          stored?.activeChatId && fallback.some((s) => s.id === stored.activeChatId)
            ? stored.activeChatId
            : fallback[0].id,
        )
      } finally {
        setHydrated(true)
      }
    })()
  }, [enabled, authLoading, chatUserId])

  // Belt-and-braces: never end up with zero sessions after hydration,
  // whatever combination of the branches above ran — except while a share
  // link is still pending, which deliberately leaves `sessions` empty for
  // `loadSharedSession` to populate. Depending on `hasPendingShare`
  // itself (not just `sessions.length`) means this still kicks in the
  // moment that share attempt resolves, if it turned out to be a dead
  // link and `sessions` is still empty.
  useEffect(() => {
    // Zero OWN sessions is fine on its own once a shared chat loaded
    // successfully (`loadSharedSession` populates `sharedSessions`, a
    // separate list) — there's still something to show, so this only
    // needs to step in when there would otherwise be nothing at all.
    if (!hydrated || sessions.length > 0 || sharedSessions.length > 0 || hasPendingShare) return
    const fresh = createEmptySession()
    loadedMessagesRef.current.add(fresh.id)
    setSessions([fresh])
    setActiveChatId(fresh.id)
  }, [hydrated, sessions.length, sharedSessions.length, hasPendingShare])

  const ensureMessagesLoaded = useCallback(
    (chatId: string) => {
      if (!enabled || !chatId) return
      if (loadedMessagesRef.current.has(chatId)) return
      if (sharedSessionsRef.current.some((s) => s.id === chatId)) return
      loadedMessagesRef.current.add(chatId)
      void (async () => {
        try {
          const detail = await getChatSession(chatId)
          const mapped = mapDetailToSession(detail)
          setSessions((prev) => prev.map((s) => (s.id === chatId ? mapped : s)))
        } catch {
          // Leave the session as-is (empty messages) — best-effort only.
        }
      })()
    },
    [enabled],
  )

  useEffect(() => {
    if (!hydrated) return
    ensureMessagesLoaded(activeChatId)
  }, [hydrated, activeChatId, ensureMessagesLoaded])

  const createChat = useCallback(() => {
    // Computed from a ref (kept current every render) rather than read back
    // out of `setSessions`'s own updater: React may batch/defer that
    // updater's execution (e.g. this function called directly, outside any
    // DOM event) — a plain synchronous read here is correct regardless of
    // when React actually applies the state update.
    const newChat = createEmptySession(sessionsRef.current)
    loadedMessagesRef.current.add(newChat.id)
    setSessions((prev) => [newChat, ...prev])
    setActiveChatId(newChat.id)
    if (enabled) {
      void createChatSession({ id: newChat.id, title: newChat.title }).catch(() => {})
    }
  }, [enabled])

  const renameChat = useCallback(
    (chatId: string, title: string) => {
      setSessions((prev) => prev.map((s) => (s.id === chatId ? { ...s, title } : s)))
      if (!enabled) return
      void patchChatSession(chatId, { title }).catch(() => {
        message.error('Could not save the new chat name.')
      })
    },
    [enabled],
  )

  const deleteChat = useCallback(
    (chatId: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== chatId)
        if (next.length === 0) {
          const fresh = createEmptySession(next)
          loadedMessagesRef.current.add(fresh.id)
          setActiveChatId(fresh.id)
          return [fresh]
        }
        if (chatId === activeChatIdRef.current) {
          setActiveChatId(next[0].id)
        }
        return next
      })
      if (!enabled) return
      void deleteChatSession(chatId).catch(() => {
        message.error('Could not delete this chat.')
      })
    },
    [enabled],
  )

  const moveChat = useCallback(
    (chatId: string, projectId: string | null) => {
      setSessions((prev) => prev.map((s) => (s.id === chatId ? { ...s, projectId } : s)))
      if (!enabled) return
      void patchChatSession(chatId, { project_id: projectId }).catch(() => {
        message.error('Could not move this chat.')
      })
    },
    [enabled],
  )

  const shareChat = useCallback(
    async (chatId: string, visibility: ChatVisibility) => {
      if (!enabled) {
        setSessions((prev) => prev.map((s) => (s.id === chatId ? { ...s, visibility } : s)))
        return
      }
      try {
        const detail = await patchChatSession(chatId, { visibility })
        setSessions((prev) =>
          prev.map((s) =>
            s.id === chatId
              ? { ...s, visibility: detail.visibility, shareToken: detail.share_token }
              : s,
          ),
        )
      } catch (err) {
        const detail = err instanceof ApiError ? (err.detail ?? err.message) : undefined
        message.error(detail ?? 'Could not update sharing for this chat.')
        throw err
      }
    },
    [enabled],
  )

  const createProject = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      if (!enabled) {
        setProjects((prev) =>
          [...prev, { id: crypto.randomUUID(), name: trimmed }].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        )
        return
      }
      try {
        const created = await createChatProject(trimmed)
        setProjects((prev) =>
          [...prev, { id: created.id, name: created.name }].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        )
      } catch {
        message.error('Could not create the project.')
      }
    },
    [enabled],
  )

  const renameProject = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)))
      if (!enabled) return
      try {
        await renameChatProject(id, trimmed)
      } catch {
        message.error('Could not save the new project name.')
      }
    },
    [enabled],
  )

  const deleteProject = useCallback(
    (id: string) => {
      setProjects((prev) => prev.filter((p) => p.id !== id))
      setSessions((prev) => prev.map((s) => (s.projectId === id ? { ...s, projectId: null } : s)))
      if (!enabled) return
      void deleteChatProject(id).catch(() => {
        message.error('Could not delete the project.')
      })
    },
    [enabled],
  )

  const recordUserMessage = useCallback(
    (chatId: string, msg: ChatMessage, scopeDocumentIds: string[]) => {
      if (!enabled) return
      void postChatMessage(chatId, {
        id: msg.id,
        role: 'user',
        content: msg.content,
        scope_document_ids: scopeDocumentIds,
      }).catch(() => {})
    },
    [enabled],
  )

  const recordAssistantMessage = useCallback(
    (chatId: string, msg: ChatMessage) => {
      if (!enabled) return
      void postChatMessage(chatId, {
        id: msg.id,
        role: 'assistant',
        content: msg.content,
        question: msg.question,
        file_tags: msg.fileTags,
        sources: msg.sources,
        coverage: msg.coverage as Record<string, unknown> | undefined,
        status: msg.status,
        abstained: msg.abstained,
        interrupted: msg.interrupted,
      }).catch(() => {})
    },
    [enabled],
  )

  const loadSharedSession = useCallback(async (token: string): Promise<ChatSession | null> => {
    try {
      const detail = await getSharedChatSession(token)
      const session = mapDetailToSession(detail)
      loadedMessagesRef.current.add(session.id)
      setSharedSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)])
      setActiveChatId(session.id)
      return session
    } catch {
      return null
    }
  }, [])

  return {
    sessions,
    setSessions,
    sharedSessions,
    setSharedSessions,
    projects,
    activeChatId,
    setActiveChatId,
    hydrated,
    createChat,
    renameChat,
    deleteChat,
    moveChat,
    shareChat,
    createProject,
    renameProject,
    deleteProject,
    recordUserMessage,
    recordAssistantMessage,
    loadSharedSession,
  }
}
