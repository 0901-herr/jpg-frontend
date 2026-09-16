/** Wire types for the `/chat/*` routes (jpg-adapter's chat persistence,
 * projects and sharing contract) — see docs/superpowers/specs/
 * spec-2026-09-16-chat-backend.md for the full route list. Field names
 * match the JSON on the wire (snake_case); `src/api/chat.ts` maps these to
 * the app's own camelCase domain types in `src/types/index.ts`. */

export type ChatVisibilityDto = 'private' | 'view' | 'query'

export interface ChatProjectDto {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface ChatSessionSummaryDto {
  id: string
  title: string
  project_id: string | null
  visibility: ChatVisibilityDto
  /** `null` while private — the adapter keeps the token around internally
   * (re-sharing reuses it) but never exposes it for a private chat. */
  share_token: string | null
  created_at: string
  updated_at: string
  message_count: number
}

export interface SharedChatSessionSummaryDto {
  id: string
  title: string
  owner_username: string
  visibility: ChatVisibilityDto
  opened_at: string
}

export interface ChatMessageDto {
  id: string
  seq: number
  role: 'user' | 'assistant'
  content: string
  author_username: string
  question?: string | null
  file_tags?: string[] | null
  sources?: unknown[] | null
  coverage?: Record<string, unknown> | null
  status?: string | null
  abstained?: boolean | null
  interrupted?: boolean | null
  created_at: string
}

export interface ChatScopeDocumentDto {
  document_id: string
  /** `null` when the viewer can't resolve this document's name — still
   * shown (as "File <id>") rather than dropped, since the whole point is
   * a follower who may not be able to browse the file at all. */
  filename: string | null
}

export interface ChatSessionDetailDto extends ChatSessionSummaryDto {
  owner_username: string
  is_owner: boolean
  can_query: boolean
  scope_document_ids: string[]
  /** Same documents as `scope_document_ids`, paired with a resolved
   * filename — lets a follower who can't browse the host's files see
   * real names instead of bare ids, in the composer's read-only chips and
   * the sent question's file tags. */
  scope_documents?: ChatScopeDocumentDto[]
  messages: ChatMessageDto[]
}

export interface ListSessionsResponseDto {
  sessions: ChatSessionSummaryDto[]
  shared: SharedChatSessionSummaryDto[]
}

export interface ListProjectsResponseDto {
  projects: ChatProjectDto[]
}

export interface CreateProjectRequest {
  name: string
}

export interface PatchProjectRequest {
  name: string
}

export interface CreateSessionRequest {
  title?: string
  project_id?: string
  /** Client-supplied id — used by the one-time localStorage import so the
   * imported session keeps the id it already had locally. */
  id?: string
}

export interface PatchSessionRequest {
  title?: string
  /** `null` clears the project (moves the chat to "No project"). */
  project_id?: string | null
  visibility?: ChatVisibilityDto
}

export interface PostMessageRequest {
  /** Client-supplied id — the frontend always sends one so the same
   * assistant message can be re-posted (upsert) as it streams to
   * completion, errors, or is interrupted. */
  id?: string
  role: 'user' | 'assistant'
  content: string
  question?: string
  file_tags?: string[]
  sources?: unknown[]
  coverage?: Record<string, unknown>
  status?: string
  abstained?: boolean
  interrupted?: boolean
  /** Present only on the user message that starts a turn — updates the
   * session's own `scope_document_ids`. */
  scope_document_ids?: string[]
}
