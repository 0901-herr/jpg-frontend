import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { vi } from 'vitest'
import ShareChatModal from './ShareChatModal'
import type { ChatSession } from '../types'

function chat(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'c1',
    title: 'Session 16 Sep 2026 (1)',
    messages: [],
    visibility: 'private',
    ...overrides,
  }
}

describe('ShareChatModal', () => {
  it('renders three distinct visibility rows', () => {
    render(<ShareChatModal chat={chat()} onClose={vi.fn()} onChangeVisibility={vi.fn()} />)

    expect(screen.getByRole('radio', { name: 'Private' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Anyone with the link can view' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Anyone with the link can view and ask' })).toBeInTheDocument()
  })

  it('makes the private consequence clear', () => {
    render(
      <ShareChatModal
        chat={chat({ visibility: 'private' })}
        onClose={vi.fn()}
        onChangeVisibility={vi.fn()}
      />,
    )

    expect(screen.getByText(/only you can access this chat/i)).toBeInTheDocument()
  })

  it('makes the view-only consequence clear', () => {
    render(
      <ShareChatModal
        chat={chat({ visibility: 'view', shareToken: 'tok123' })}
        onClose={vi.fn()}
        onChangeVisibility={vi.fn()}
      />,
    )

    expect(screen.getByText(/can read the chat, but cannot send messages/i)).toBeInTheDocument()
  })

  it('shows the query explanation and says scope updates when a message is sent, not on selection', () => {
    render(
      <ShareChatModal
        chat={chat({ visibility: 'query', shareToken: 'tok123' })}
        onClose={vi.fn()}
        onChangeVisibility={vi.fn()}
      />,
    )

    expect(screen.getByText(/when you send a message/i)).toBeInTheDocument()
    expect(screen.queryByText(/when you change your selection/i)).not.toBeInTheDocument()
  })

  it('does not render a Stop sharing button', () => {
    render(
      <ShareChatModal
        chat={chat({ visibility: 'query', shareToken: 'tok123' })}
        onClose={vi.fn()}
        onChangeVisibility={vi.fn()}
      />,
    )

    expect(screen.queryByText(/stop sharing/i)).not.toBeInTheDocument()
  })

  it('calls onChangeVisibility when a different row is selected', async () => {
    const user = userEvent.setup()
    const onChangeVisibility = vi.fn().mockResolvedValue(undefined)
    render(
      <ShareChatModal
        chat={chat({ visibility: 'private' })}
        onClose={vi.fn()}
        onChangeVisibility={onChangeVisibility}
      />,
    )

    await user.click(screen.getByRole('radio', { name: 'Anyone with the link can view' }))

    expect(onChangeVisibility).toHaveBeenCalledWith('c1', 'view')
  })

  it('shows a spinner and disables the visibility options while the PATCH is in flight', async () => {
    const user = userEvent.setup()
    let resolveChange: () => void
    const onChangeVisibility = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveChange = () => resolve()
        }),
    )
    render(
      <ShareChatModal
        chat={chat({ visibility: 'private' })}
        onClose={vi.fn()}
        onChangeVisibility={onChangeVisibility}
      />,
    )

    await user.click(screen.getByRole('radio', { name: 'Anyone with the link can view' }))

    expect(screen.getByTestId('visibility-spinner')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Private' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Anyone with the link can view' })).toBeDisabled()

    resolveChange!()
    await waitFor(() =>
      expect(screen.queryByTestId('visibility-spinner')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('radio', { name: 'Private' })).not.toBeDisabled()
  })

  it('releases the spinner without an unhandled rejection when the update fails', async () => {
    const user = userEvent.setup()
    const onChangeVisibility = vi.fn().mockRejectedValue(new Error('network error'))
    render(
      <ShareChatModal
        chat={chat({ visibility: 'private' })}
        onClose={vi.fn()}
        onChangeVisibility={onChangeVisibility}
      />,
    )

    await user.click(screen.getByRole('radio', { name: 'Anyone with the link can view' }))
    await waitFor(() => expect(screen.queryByTestId('visibility-spinner')).not.toBeInTheDocument())
  })
})
