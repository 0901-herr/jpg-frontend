export interface Source {
  index: number
  filename: string
  documentId?: string
  docRef?: string
  page?: number
  url?: string
  snippet?: string
  /** Display line e.g. "Page 2" */
  reference?: string
}

export interface CoverageInfo {
  total_files?: number
  ready_files?: number
  indexing_files?: number
  failed_files?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  fileTags?: string[]
  sources?: Source[]
  status?: 'thinking' | 'streaming' | 'complete' | 'error'
  /** Live pipeline stage while status is thinking (from RAG progress SSE). */
  progressLabel?: string
  thinkingSeconds?: number
  coverage?: CoverageInfo
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
}

export interface UserProfile {
  name: string
  avatarInitial: string
}
