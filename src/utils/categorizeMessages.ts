import type { ChatMessage } from '../types'
import type { DocumentCategorizeResponse } from '../api/types/browse'

export interface CategorizeChatMessages {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

function candidateNames(response: DocumentCategorizeResponse): string {
  return response.candidates.map((candidate) => candidate.name).join(', ')
}

function buildAnswer(response: DocumentCategorizeResponse): string {
  const { category, abstained, folder_name, reasoning } = response

  if (category != null) {
    const confidencePercent = Math.round(response.confidence * 100)
    return [
      `**Suggested folder:** ${category}`,
      '',
      `Confidence: ${confidencePercent}%`,
      '',
      reasoning,
      '',
      `Move the file into **${folder_name} / ${category}** in LogicalDOC to file it.`,
    ].join('\n')
  }

  const candidates = candidateNames(response)

  if (abstained) {
    return `This file does not clearly belong to any of the folders in **${folder_name}** (${candidates}). ${reasoning} You may leave it where it is or file it by hand.`
  }

  return `I could not match the answer to one of the folders in **${folder_name}**: ${candidates}. Please try again.`
}

/** Builds the user-request + completed-answer message pair for a
 * categorize response, so Categorize appends to chat history exactly like
 * a normal completed query answer. */
export function buildCategorizeMessages(
  filename: string,
  response: DocumentCategorizeResponse,
): CategorizeChatMessages {
  return {
    userMessage: {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Categorize "${filename}"`,
    },
    assistantMessage: {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: buildAnswer(response),
      status: 'complete',
    },
  }
}
