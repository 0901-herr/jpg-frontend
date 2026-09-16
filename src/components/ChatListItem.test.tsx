import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { vi } from 'vitest'
import ChatListItem from './ChatListItem'
import type { ChatSession } from '../types'

// Sharing menu items/badge are gated behind this build-time flag (see
// `src/config/features.ts`) — mirrors Sidebar.test.tsx's mock so this
// file's sharing-related tests exercise the real gated code path.
vi.mock('../config/features', () => ({ FEATURES: { categoryView: false, chatSharing: true } }))

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 's1',
    title: 'Session 15 Sep 2026 (1)',
    messages: [],
    ...overrides,
  }
}

describe('ChatListItem', () => {
  it('renders the dated title with an ellipsis-safe title attribute', () => {
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const title = screen.getByText('Session 15 Sep 2026 (1)')
    expect(title).toHaveAttribute('title', 'Session 15 Sep 2026 (1)')
    expect(title.className).toContain('truncate')
  })

  it('shows the first user message as a muted second line', () => {
    render(
      <ChatListItem
        chat={session({
          messages: [
            { id: 'u1', role: 'user', content: 'What is the refund policy?' },
            { id: 'a1', role: 'assistant', content: 'It is 30 days.' },
          ],
        })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const preview = screen.getByText('What is the refund policy?')
    expect(preview.className).toContain('truncate')
    expect(preview.className).toContain('text-xs')
  })

  it('renders no second line when the session has no messages yet', () => {
    render(
      <ChatListItem
        chat={session({ messages: [] })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    // Only the title line renders — nothing else inside the row button.
    const title = screen.getByText('Session 15 Sep 2026 (1)')
    const button = title.closest('button') as HTMLElement
    expect(button.querySelectorAll('span')).toHaveLength(1)
  })

  it('uses the first user message even when it is not the very first message in the session', () => {
    render(
      <ChatListItem
        chat={session({
          messages: [
            { id: 'sys1', role: 'assistant', content: 'Welcome.' },
            { id: 'u1', role: 'user', content: 'Second try question' },
          ],
        })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Second try question')).toBeInTheDocument()
  })

  it('calls onSelect when the title row is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={onSelect}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    await user.click(screen.getByText('Session 15 Sep 2026 (1)'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('uses consistent padding on the options button, matching ProjectGroupHeader', () => {
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const optionsButton = screen.getByRole('button', { name: 'Chat options' })
    expect(optionsButton.className).toContain('px-2')
    expect(optionsButton.className).toContain('py-1.5')
    expect(optionsButton.className).not.toContain('px-3 py-2')
  })

  it('renders icons on the Move to and Share menu items', async () => {
    const user = userEvent.setup()
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        projects={[]}
        onMove={vi.fn()}
        onShare={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))

    const moveItem = screen.getByText('Move to').closest('li')
    const shareItem = screen.getByText('Share').closest('li')
    expect(moveItem?.querySelector('svg')).toBeTruthy()
    expect(shareItem?.querySelector('svg')).toBeTruthy()
  })

  it('never renders a "Stop sharing" menu item, even for an already-shared chat', async () => {
    const user = userEvent.setup()
    render(
      <ChatListItem
        chat={session({ visibility: 'query', shareToken: 'tok123' })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onShare={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Chat options' }))
    expect(screen.queryByText('Stop sharing')).not.toBeInTheDocument()
  })

  it('shows a shared-chat badge when the chat is shared', () => {
    render(
      <ChatListItem
        chat={session({ visibility: 'query' })}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/shared/i)).toBeInTheDocument()
  })

  it('does not show a shared-chat badge for a private chat', () => {
    render(
      <ChatListItem
        chat={session()}
        isActive={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText(/shared/i)).not.toBeInTheDocument()
  })
})
