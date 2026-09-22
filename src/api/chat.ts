import { apiDelete, apiGet, apiPatch, apiPost } from './http'
import type {
  ChatMessageDto,
  ChatProjectDto,
  ChatSessionDetailDto,
  ChatSessionSummaryDto,
  CreateProjectRequest,
  CreateSessionRequest,
  ListProjectsResponseDto,
  ListSessionsResponseDto,
  PatchProjectRequest,
  PatchSessionRequest,
  PostMessageRequest,
} from './types/chat'

export async function listChatProjects(): Promise<ChatProjectDto[]> {
  const response = await apiGet<ListProjectsResponseDto>('/chat/projects')
  return response.projects
}

export async function createChatProject(name: string): Promise<ChatProjectDto> {
  return apiPost<ChatProjectDto>('/chat/projects', { name } satisfies CreateProjectRequest)
}

export async function renameChatProject(id: string, name: string): Promise<ChatProjectDto> {
  return apiPatch<ChatProjectDto>(
    `/chat/projects/${encodeURIComponent(id)}`,
    { name } satisfies PatchProjectRequest,
  )
}

export async function deleteChatProject(id: string): Promise<void> {
  await apiDelete<void>(`/chat/projects/${encodeURIComponent(id)}`)
}

export async function listChatSessions(): Promise<ListSessionsResponseDto> {
  return apiGet<ListSessionsResponseDto>('/chat/sessions')
}

export async function createChatSession(
  body: CreateSessionRequest,
): Promise<ChatSessionSummaryDto> {
  return apiPost<ChatSessionSummaryDto>('/chat/sessions', body)
}

export async function getChatSession(id: string): Promise<ChatSessionDetailDto> {
  return apiGet<ChatSessionDetailDto>(`/chat/sessions/${encodeURIComponent(id)}`)
}

export async function patchChatSession(
  id: string,
  body: PatchSessionRequest,
): Promise<ChatSessionSummaryDto> {
  return apiPatch<ChatSessionSummaryDto>(`/chat/sessions/${encodeURIComponent(id)}`, body)
}

export async function deleteChatSession(id: string): Promise<void> {
  await apiDelete<void>(`/chat/sessions/${encodeURIComponent(id)}`)
}

export async function postChatMessage(
  sessionId: string,
  body: PostMessageRequest,
): Promise<ChatMessageDto> {
  return apiPost<ChatMessageDto>(
    `/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
    body,
  )
}

export async function getSharedChatSession(token: string): Promise<ChatSessionDetailDto> {
  return apiGet<ChatSessionDetailDto>(`/chat/shared/${encodeURIComponent(token)}`)
}

/** Recipient-side removal of a shared chat from the viewer's own "Shared"
 * group — never affects the owner's chat or its sharing. 204 on success;
 * a 404 (already gone) is handled by the caller the same way as a normal
 * success (see `useChatStore.removeSharedChat`). */
export async function deleteSharedChatSession(sessionId: string): Promise<void> {
  await apiDelete<void>(`/chat/shared/${encodeURIComponent(sessionId)}`)
}
