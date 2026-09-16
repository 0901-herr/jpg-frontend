import { apiDelete, apiGet, apiPatch, apiPost } from './http'
import type {
  ChatProjectDto,
  ChatSessionDetailDto,
  CreateProjectRequest,
  CreateSessionRequest,
  ListProjectsResponseDto,
  ListSessionsResponseDto,
  PatchMessageRequest,
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
): Promise<ChatSessionDetailDto> {
  return apiPost<ChatSessionDetailDto>('/chat/sessions', body)
}

export async function getChatSession(id: string): Promise<ChatSessionDetailDto> {
  return apiGet<ChatSessionDetailDto>(`/chat/sessions/${id}`)
}

export async function patchChatSession(
  id: string,
  body: PatchSessionRequest,
): Promise<ChatSessionDetailDto> {
  return apiPatch<ChatSessionDetailDto>(`/chat/sessions/${id}`, body)
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

export async function patchChatMessage(
  sessionId: string,
  messageId: string,
  body: PatchMessageRequest,
): Promise<void> {
  await apiPatch(`/chat/sessions/${sessionId}/messages/${messageId}`, body)
}

export async function getSharedChatSession(token: string): Promise<ChatSessionDetailDto> {
  return apiGet<ChatSessionDetailDto>(`/chat/shared/${token}`)
}
