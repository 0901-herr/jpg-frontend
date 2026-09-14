import type { ChatMessage } from '../types'

export interface SummaryChatMessages {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

/** Builds the user-request + completed-answer message pair for a fetched
 * document summary, so Summarize appends to chat history exactly like a
 * normal completed query answer (no streaming, no citations). */
export function buildSummaryMessages(summary: string): SummaryChatMessages {
  return {
    userMessage: {
      id: crypto.randomUUID(),
      role: 'user',
      content: 'Summarize this document',
    },
    assistantMessage: {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: summary,
      status: 'complete',
    },
  }
}
