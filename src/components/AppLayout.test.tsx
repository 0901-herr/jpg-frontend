import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueryScopeResponse } from '../api/types/browse'
import type { SendMessageRequest, SendMessageResponse } from '../api/types/query'

const validateQueryScope = vi.fn<
  (documents: string[], signal?: AbortSignal) => Promise<QueryScopeResponse>
>()

vi.mock('../api/browse', () => ({
  validateQueryScope: (...args: [string[], AbortSignal?]) => validateQueryScope(...args),
  fetchDocumentSummary: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: 'user-1', username: 'tester' },
    isLoading: false,
  }),
}))

vi.mock('../hooks/useBrowseTree', () => ({
  useBrowseTree: () => ({ sessionExpired: false, username: 'tester' }),
}))

vi.mock('../hooks/useDocumentSelection', () => ({
  useDocumentSelection: () => ({
    selectedIds: new Set(['doc-1']),
    selectedCount: 1,
    selectedFilenames: ['doc-1.pdf'],
    documentMeta: new Map(),
    registerDocuments: vi.fn(),
    toggleDocument: vi.fn(),
    setSelection: vi.fn(),
    mergeSelection: vi.fn(),
    selectAllSelectable: vi.fn(),
    deselectAllInView: vi.fn(),
    clearSelection: vi.fn(),
    trimSelection: vi.fn(),
  }),
}))

// A minimal, controllable stand-in for react-query's useMutation: mutateAsync
// never resolves on its own (modeling a genuinely in-flight stream) and only
// settles by rejecting once the caller's AbortSignal fires. `reset`
// synchronously flips `isPending` back to false, exactly like the real hook.
let currentSignal: AbortSignal | null = null

vi.mock('../hooks/mutations/useSendQuery', () => ({
  useSendQuery: () => {
    const [isPending, setIsPending] = useState(false)
    return {
      isPending,
      reset: () => setIsPending(false),
      mutateAsync: (request: SendMessageRequest) =>
        new Promise<SendMessageResponse>((_resolve, reject) => {
          setIsPending(true)
          currentSignal = request.signal ?? null
          request.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    }
  },
}))

vi.mock('./Sidebar', () => ({
  default: (props: {
    sessions: { id: string; title: string }[]
    onNewChat: () => void
    onSelectChat: (id: string) => void
  }) => (
    <div>
      <button type="button" onClick={props.onNewChat}>
        New chat
      </button>
      {props.sessions.map((s) => (
        <button key={s.id} type="button" onClick={() => props.onSelectChat(s.id)}>
          select:{s.title || s.id}
        </button>
      ))}
    </div>
  ),
}))

// Imported after the mocks above so AppLayout picks up the mocked modules.
const { default: AppLayout } = await import('./AppLayout')

describe('AppLayout — abort on New chat / select chat while streaming', () => {
  beforeEach(() => {
    currentSignal = null
    validateQueryScope.mockResolvedValue({
      total_files: 1,
      ready_files: 1,
      indexing_files: 0,
      failed_files: 0,
      missing_files: 0,
      accessible_document_ids: ['doc-1'],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('aborts the in-flight request, resets the composer immediately, and marks the old chat interrupted', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'What is in the contract?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // The fake stream is now in flight: composer shows Stop, not Send.
    await screen.findByRole('button', { name: 'Stop response' })
    expect(currentSignal?.aborted).toBe(false)

    await user.click(screen.getByRole('button', { name: 'New chat' }))

    // Aborted, and the composer resets to idle immediately — no need to
    // wait for the aborted fetch promise to settle.
    expect(currentSignal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()

    // Let the rejected mutateAsync promise actually settle so React has
    // fully processed the abort's rejection (no unhandled state left).
    await act(async () => {
      await Promise.resolve()
    })

    // Switch back to the old chat (now the second entry) to see its history.
    const oldChatButtons = screen.getAllByRole('button', { name: /^select:/ })
    await user.click(oldChatButtons[oldChatButtons.length - 1])

    expect(await screen.findByText('Answer interrupted.')).toBeInTheDocument()
    expect(screen.getByText('What is in the contract?')).toBeInTheDocument()
  })

  it('aborts the in-flight request when selecting a different history entry mid-stream', async () => {
    const user = userEvent.setup()
    render(<AppLayout />)

    // Create a second chat to select into while the first one is streaming.
    await user.click(screen.getByRole('button', { name: 'New chat' }))

    const textarea = await screen.findByPlaceholderText(/ask a question/i)
    await user.type(textarea, 'Second question')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByRole('button', { name: 'Stop response' })

    const chatButtons = screen.getAllByRole('button', { name: /^select:/ })
    // Select the OTHER chat (not the one currently streaming).
    await user.click(chatButtons[chatButtons.length - 1])

    expect(currentSignal?.aborted).toBe(true)
    expect(screen.queryByRole('button', { name: 'Stop response' })).not.toBeInTheDocument()
  })
})
