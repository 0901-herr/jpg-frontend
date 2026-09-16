import { message } from 'antd'
import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChatProject,
  createChatSession,
  deleteChatProject,
  deleteChatSession,
  deleteSharedChatSession,
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
    scopeDocuments: (dto.scope_documents ?? []).map((d) => ({
      documentId: d.document_id,
      filename: d.filename,
    })),
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
  /** Stays optimistic (the title updates locally before the PATCH below
   * settles), but — unlike before Task 11 — now returns the PATCH's own
   * promise instead of firing it with `void ... .catch()` and discarding
   * it, so a caller (`ChatListItem`) that wants to show a pending
   * indicator while it's still in flight can await it. */
  renameChat: (chatId: string, title: string) => Promise<void>
  /** Same optimistic-but-now-awaitable change as `renameChat`, for the
   * same reason (`Sidebar` tracks the in-flight delete to show a pending
   * indicator, since the chat's own row is gone from `sessions` the
   * instant this is called). */
  deleteChat: (chatId: string) => Promise<void>
  /** Same optimistic-but-now-awaitable change as `renameChat`/`deleteChat`
   * — the rollback-on-failure behavior below is completely unchanged,
   * this only exposes the settle point to an awaiting caller. */
  moveChat: (chatId: string, projectId: string | null) => Promise<void>
  shareChat: (chatId: string, visibility: ChatVisibility) => Promise<void>
  createProject: (name: string) => Promise<void>
  renameProject: (id: string, name: string) => Promise<void>
  /** Cascades: deletes every chat currently in the project (via the same
   * single-chat delete the store uses elsewhere) before deleting the
   * project itself — the backend has no cascade-delete endpoint of its
   * own. Returns a promise so a caller that wants to await the full
   * cascade can (e.g. a confirmation flow); existing callers that just
   * fire-and-forget it are unaffected. */
  deleteProject: (id: string) => Promise<void>
  /** Fire-and-forget: persists the just-appended user message (and the
   * scope it was asked against) — never blocks or throws into the caller,
   * the message is already showing locally either way. */
  recordUserMessage: (chatId: string, msg: ChatMessage, scopeDocumentIds: string[]) => void
  /** Fire-and-forget upsert of the assistant message by id — safe to call
   * repeatedly as the same turn progresses from streaming to done/error/
   * interrupted; the adapter updates the same row in place. */
  /** Returns the persist promise (settles once posted, never rejects — the
   * POST failure itself is already swallowed) so a caller that needs
   * ordering, such as a post-answer refresh that must not race this same
   * write, can await it. Safe to ignore otherwise. */
  recordAssistantMessage: (chatId: string, msg: ChatMessage) => Promise<void>
  loadSharedSession: (token: string) => Promise<ChatSession | null>
  /** Chat ids whose messages `ensureMessagesLoaded` is currently fetching —
   * a chat id is added right before that fetch starts and removed once it
   * settles (success or failure), so a caller can render a loading skeleton
   * for whichever chat the viewer just clicked into. */
  messagesLoading: Set<string>
  /** Forces an immediate re-fetch of a shared chat's own detail (scope +
   * messages) — used after a follower's answer completes, so a host scope
   * change made mid-conversation is picked up without waiting for the
   * chat to be re-activated. */
  refreshSharedChat: (chatId: string) => void
  /** Recipient-side removal from the viewer's own "Shared" group (`DELETE
   * /chat/shared/{id}`) — never touches the owner's chat. Reselects the
   * viewer's most recent own chat if the removed one was active; opening
   * the share link again just re-adds it. */
  removeSharedChat: (chatId: string) => void
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
  // Chat ids with an in-flight `ensureMessagesLoaded` fetch — see
  // `UseChatStoreResult.messagesLoading`.
  const [messagesLoading, setMessagesLoading] = useState<Set<string>>(new Set())

  const activeChatIdRef = useRef(activeChatId)
  activeChatIdRef.current = activeChatId
  const sessionsRef = useRef<ChatSession[]>(sessions)
  sessionsRef.current = sessions
  const sharedSessionsRef = useRef<ChatSession[]>(sharedSessions)
  sharedSessionsRef.current = sharedSessions
  // Same "current value outside a setState updater" idiom as the refs
  // above — used by `deleteProject` to restore the project row if its
  // cascade delete turns out not to have fully succeeded server-side.
  const projectsRef = useRef<ChatProject[]>(projects)
  projectsRef.current = projects
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

        // The local mirror is a recovery copy, not the source of truth for
        // a session that the server already knows about. In particular it
        // deliberately omits projectId, so replaying an existing mirror
        // would turn a successful "Move to" PATCH back into `null` on the
        // next refresh. Only import ids that are still absent server-side.
        // This still resumes a partial import: sessions that made it to the
        // server are left alone while the remaining local-only sessions are
        // retried.
        const stored = loadChatHistory(chatUserId)
        if (stored?.sessions.length) {
          const serverSessionIds = new Set(ownSessions.map((session) => session.id))
          const localOnlySessions = stored.sessions.filter(
            (session) => !serverSessionIds.has(session.id),
          )
          if (localOnlySessions.length) {
            try {
              const imported = await importLocalHistory(localOnlySessions)
              const importedIds = new Set(imported.map((s) => s.id))
              ownSessions = [...imported, ...ownSessions.filter((s) => !importedIds.has(s.id))]
              // Imported sessions carry the local messages we just replayed,
              // so their detail is already available in memory. Server
              // summaries remain deliberately unmarked and will load on
              // first activation below.
              for (const session of imported) loadedMessagesRef.current.add(session.id)
              clearChatHistory(chatUserId)
            } catch {
              // Still partially (or entirely) stuck locally — keep showing
              // whatever's already confirmed server-side, plus whichever
              // local sessions haven't made it there yet, so nothing
              // disappears. localStorage is deliberately left alone so the
              // next load retries.
              const localOnly = localOnlySessions.map((s) => ({
                ...s,
                isOwner: true,
                visibility: 'private' as const,
                projectId: null,
                canQuery: true,
              }))
              ownSessions = [...ownSessions, ...localOnly]
              for (const session of localOnly) loadedMessagesRef.current.add(session.id)
              message.warning(IMPORT_FAILURE_MESSAGE)
            }
          } else {
            // All ids are already server-backed. Drop this stale recovery
            // copy so it cannot be replayed on a later refresh either.
            clearChatHistory(chatUserId)
          }
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

  // Shared by `ensureMessagesLoaded` and `refreshSharedChat` — fetches one
  // chat's full detail and applies it to whichever list it belongs in.
  // Best-effort only: a failure leaves the session as it was rather than
  // surfacing an error (this may run silently in the background, e.g.
  // after a follower's answer completes).
  const fetchAndApplyDetail = useCallback(
    async (chatId: string, isOwnSession: boolean) => {
      try {
        const detail = await getChatSession(chatId)
        const mapped = mapDetailToSession(detail)
        if (isOwnSession) {
          setSessions((prev) => prev.map((s) => (s.id === chatId ? mapped : s)))
        } else {
          setSharedSessions((prev) => prev.map((s) => (s.id === chatId ? mapped : s)))
        }
      } catch {
        // Leave the session as-is (empty messages) — best-effort only.
      }
    },
    [],
  )

  // Per-chat-id in-flight fetch count backing `messagesLoading` — the
  // shared-chat branch of `ensureMessagesLoaded` below is deliberately not
  // gated by `loadedMessagesRef` (it re-fetches every time that chat
  // becomes active, so a host-side scope change is always picked up), so a
  // quick A -> B -> A reselect can start a second, overlapping fetch for
  // the same id while the first is still in flight. A plain delete-on-
  // settle would let the FIRST fetch to resolve clear the id out from
  // under the still-pending second one. Kept in a ref (not state) since
  // it's only ever read/written from `trackMessagesLoading` itself —
  // `messagesLoading` is the state that actually drives renders.
  const messagesLoadingCountRef = useRef<Map<string, number>>(new Map())

  // Marks `chatId` as loading for the duration of `promise` — added
  // immediately, removed in a `finally` once every overlapping in-flight
  // fetch for that id (see the counter above) has settled. Shared by both
  // branches of `ensureMessagesLoaded` below; never touches
  // `fetchAndApplyDetail` itself, which stays exactly as it was.
  const trackMessagesLoading = useCallback((chatId: string, promise: Promise<void>) => {
    const counts = messagesLoadingCountRef.current
    counts.set(chatId, (counts.get(chatId) ?? 0) + 1)
    setMessagesLoading((prev) => new Set(prev).add(chatId))
    void promise.finally(() => {
      const remaining = (counts.get(chatId) ?? 1) - 1
      if (remaining > 0) {
        counts.set(chatId, remaining)
        return
      }
      counts.delete(chatId)
      setMessagesLoading((prev) => {
        const next = new Set(prev)
        next.delete(chatId)
        return next
      })
    })
  }, [])

  const ensureMessagesLoaded = useCallback(
    (chatId: string) => {
      if (!enabled || !chatId) return
      const isOwnSession = sessionsRef.current.some((s) => s.id === chatId)
      if (isOwnSession) {
        // Owned chats never change scope/history from under the viewer —
        // fetched once, same as before.
        if (loadedMessagesRef.current.has(chatId)) return
        loadedMessagesRef.current.add(chatId)
        trackMessagesLoading(chatId, fetchAndApplyDetail(chatId, true))
        return
      }
      // A shared chat's scope/messages can change any time the host asks
      // another question or changes their selection — re-fetch every time
      // this chat becomes active (not gated on `loadedMessagesRef`) so a
      // host-side change is always picked up, even for a chat already
      // fully loaded via `loadSharedSession` (the `?share=` link flow).
      loadedMessagesRef.current.add(chatId)
      trackMessagesLoading(chatId, fetchAndApplyDetail(chatId, false))
    },
    [enabled, fetchAndApplyDetail, trackMessagesLoading],
  )

  const refreshSharedChat = useCallback(
    (chatId: string) => {
      if (!enabled || !chatId) return
      void fetchAndApplyDetail(chatId, false)
    },
    [enabled, fetchAndApplyDetail],
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
    async (chatId: string, title: string) => {
      setSessions((prev) => prev.map((s) => (s.id === chatId ? { ...s, title } : s)))
      if (!enabled) return
      try {
        await patchChatSession(chatId, { title })
      } catch {
        message.error('Could not save the new chat name.')
      }
    },
    [enabled],
  )

  const deleteChat = useCallback(
    async (chatId: string) => {
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
      try {
        await deleteChatSession(chatId)
      } catch {
        message.error('Could not delete this chat.')
      }
    },
    [enabled],
  )

  const moveChat = useCallback(
    async (chatId: string, projectId: string | null) => {
      // Read the pre-update value off the ref (same idiom `createChat`,
      // `deleteChat` and `removeSharedChat` already use for "current state
      // outside a setState updater") so it's available to roll back to if
      // the PATCH below fails.
      const previousProjectId = sessionsRef.current.find((s) => s.id === chatId)?.projectId ?? null
      setSessions((prev) => prev.map((s) => (s.id === chatId ? { ...s, projectId } : s)))
      if (!enabled) return
      try {
        await patchChatSession(chatId, { project_id: projectId })
      } catch {
        // The PATCH silently failing while the optimistic update stands is
        // exactly what made a failed move look like it "needed a re-login
        // to take effect" — only a later re-hydration would revert it.
        // Roll back immediately instead, and say so.
        setSessions((prev) =>
          prev.map((s) => (s.id === chatId ? { ...s, projectId: previousProjectId } : s)),
        )
        message.error('Could not move this chat. It has been moved back.')
      }
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
    async (id: string) => {
      // Same ref-read idiom as `moveChat`/`createChat` — captured before
      // the optimistic removal below so the cascade still knows which
      // chats to delete server-side even after they've disappeared from
      // `sessions`, and so a partial failure below knows exactly which
      // ones to roll back.
      const chatsInProject = sessionsRef.current.filter((s) => s.projectId === id)
      const removedIds = new Set(chatsInProject.map((c) => c.id))
      // Same ref-read idiom, via `projectsRef` — so it's available to
      // restore below if the project turns out not to have actually been
      // deleted server-side. (A functional `setProjects` updater's own
      // `prev` would look equivalent, but React doesn't guarantee it runs
      // synchronously with this call, and the read below can't wait for it.)
      const removedProject = projectsRef.current.find((p) => p.id === id)
      setProjects((prev) => prev.filter((p) => p.id !== id))

      // Same reselection idiom as `deleteChat` (never leave `activeChatId`
      // pointing at a chat that's no longer in `sessions`), generalized
      // from one removed id to the whole set this cascade removes — computed
      // here rather than inside the `setSessions` call below, so that call
      // stays a plain state update instead of one whose updater function
      // also reaches out and calls `setActiveChatId` as a side effect.
      const next = sessionsRef.current.filter((s) => s.projectId !== id)
      if (next.length === 0) {
        const fresh = createEmptySession(next)
        loadedMessagesRef.current.add(fresh.id)
        setActiveChatId(fresh.id)
        setSessions([fresh])
      } else {
        if (removedIds.has(activeChatIdRef.current)) {
          setActiveChatId(next[0].id)
        }
        setSessions(next)
      }

      if (!enabled) return

      // The backend has no cascade-delete endpoint: deleting the project
      // alone would only orphan these chats (project_id -> null), not
      // remove them. Delete each chat first via the same single-chat
      // delete call `deleteChat` already uses, then the now-empty project —
      // but `allSettled`, not `all`: a fail-fast `Promise.all` would bail
      // out of the whole cascade on the first rejection, silently leaving
      // the rest of the chats (and the project itself) undeleted
      // server-side while the optimistic update had already made all of
      // them disappear from view. Distinguishing successes from failures
      // here lets the UI stay honest about what actually happened.
      const results = await Promise.allSettled(
        chatsInProject.map((chat) => deleteChatSession(chat.id)),
      )
      const failedChats = chatsInProject.filter((_, i) => results[i].status === 'rejected')

      if (failedChats.length > 0) {
        // Some chats are still on the project server-side — don't delete
        // the project itself, bring it and the chats that didn't actually
        // get deleted back into view, and say so honestly (not "could not
        // delete the project": most of it may well have worked).
        setSessions((prev) => [...prev, ...failedChats])
        if (removedProject) {
          setProjects((prev) =>
            [...prev, removedProject].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
        message.error(
          `${failedChats.length} of ${chatsInProject.length} chats could not be deleted. Please try again.`,
        )
        return
      }

      try {
        await deleteChatProject(id)
      } catch {
        // Every chat is genuinely gone server-side at this point (no
        // rollback for those), but the project row itself is still there —
        // bring it back so the user can retry deleting it.
        if (removedProject) {
          setProjects((prev) =>
            [...prev, removedProject].sort((a, b) => a.name.localeCompare(b.name)),
          )
        }
        message.error(
          'Chats were deleted, but the project itself could not be removed. Please try again.',
        )
      }
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
    (chatId: string, msg: ChatMessage): Promise<void> => {
      if (!enabled) return Promise.resolve()
      // Returns the persist promise (unlike `recordUserMessage`, which
      // stays fire-and-forget) so a caller that needs ordering — e.g.
      // AppLayout's shared-chat refresh, which must not race a detail GET
      // against this very POST — can await it. Every other caller is free
      // to ignore the return value, same fire-and-forget behaviour as
      // before.
      return postChatMessage(chatId, {
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

  const removeSharedChat = useCallback(
    (chatId: string) => {
      const wasActive = activeChatIdRef.current === chatId
      setSharedSessions((prev) => prev.filter((s) => s.id !== chatId))
      loadedMessagesRef.current.delete(chatId)
      if (wasActive) {
        const ownSessions = sessionsRef.current
        // If there's also nothing left in `sessions`, the "never end up
        // with zero sessions" effect below creates and selects a fresh
        // empty chat once this render commits — nothing to do here.
        if (ownSessions.length > 0) setActiveChatId(ownSessions[0].id)
      }
      if (!enabled) return
      void deleteSharedChatSession(chatId).catch((err) => {
        // Already gone server-side — same outcome as a successful
        // delete, nothing to warn about.
        if (err instanceof ApiError && err.status === 404) return
        message.error('Could not remove this chat from your list.')
      })
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
    messagesLoading,
    refreshSharedChat,
    removeSharedChat,
  }
}
