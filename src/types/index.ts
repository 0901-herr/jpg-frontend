export interface Source {
  index: number
  filename: string
  reference?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Inline file tags shown after assistant text */
  fileTags?: string[]
  sources?: Source[]
  status?: 'thinking' | 'complete'
  thinkingSeconds?: number
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
