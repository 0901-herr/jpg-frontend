import { apiDelete, apiGet, apiPatch, apiPost } from './http'
import type {
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
  return apiPatch<ChatProjectDto>(`/chat/projects/${id}`, { name } satisfies PatchProjectRequest)
}

export async function deleteChatProject(id: string): Promise<void> {
  await apiDelete<void>(`/chat/projects/${id}`)
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
  return apiGet<ChatSessionDetailDto>(`/chat/sessions/${id}`)
}

export async function patchChatSession(
  id: string,
  body: PatchSessionRequest,
): Promise<ChatSessionSummaryDto> {
  return apiPatch<ChatSessionSummaryDto>(`/chat/sessions/${id}`, body)
}

export async function deleteChatSession(id: string): Promise<void> {
  await apiDelete<void>(`/chat/sessions/${id}`)
}

export async function postChatMessage(
  sessionId: string,
  body: PostMessageRequest,
): Promise<void> {
  await apiPost(`/chat/sessions/${sessionId}/messages`, body)
}

export async function getSharedChatSession(token: string): Promise<ChatSessionDetailDto> {
  return apiGet<ChatSessionDetailDto>(`/chat/shared/${token}`)
}
